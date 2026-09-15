// SPDX-License-Identifier: Apache-2.0
//! The sender's side: a knock, an ask on a standing, and what her ward tells
//! her about each.

use super::Answer;
use super::{Core, KnockKeys};
use crate::arithmetic::{self, LOCK_LEN};
use crate::hex::{hex, unhex};
use crate::seal::{self, Invitation, Payload, Reply, ZERO_EDGE};
use crate::seal::{being_pk, WardPk};
use crate::value::{digest, Blueprint, Map, Value, Word};
use std::cell::RefCell;
use std::rc::Rc;
use std::str::FromStr;
use std::sync::mpsc::{channel, TryRecvError};
use std::time::{Duration, Instant};

/// When an allowance of `time` milliseconds, counted from now, runs out.
fn deadline(time: u64) -> Instant {
    Instant::now() + Duration::from_millis(time)
}

/// Where a knock record is filed: under the ward and the heir together.
pub(super) fn knock_key(invitation: &Invitation) -> String {
    match &invitation.heir {
        Some((heir, _, _)) => format!("{}:{}", invitation.ward, hex(heir)),
        None => format!("public:{}", invitation.ward),
    }
}

/// U1: args that are not one object of values leave nothing. Each arg is a
/// value counted from itself, whatever carries it.
fn sendable(args: Option<&Map>) -> bool {
    args.is_none_or(|a| a.values().all(|arg| arg.check().is_ok()))
}

pub(super) fn knock(core: &Rc<Core>, being: &str, invitation: &Value, method: Option<&str>, args: Option<&Map>, time: u64) -> Answer {
    // S1: the invitation is not one.
    let Some(invitation) = Invitation::read(invitation) else {
        return Answer::Word(Word::Invitation);
    };
    if !sendable(args) {
        return Answer::Word(Word::Unreached);
    }
    let heir = invitation.heir.as_ref().map(|(pk, _, _)| hex(pk));
    // The knock waits its turn on the relation's line, as every send does.
    let Some(line) = core.line(being, &invitation.ward.to_string(), heir.as_deref(), deadline(time)) else {
        return Answer::Word(Word::Unreached);
    };
    let taken = core.partition.borrow().bind.get(being).and_then(|b| b.standings.iter().find(|(_, s)| s.ward == invitation.ward.to_string() && s.heir == heir).map(|(id, _)| id.clone()));
    if let Some(id) = taken {
        drop(line);
        return ask(core, being, &id, method, args, time);
    }
    let key = knock_key(&invitation);
    let record = core.partition.borrow().bind.get(being).and_then(|b| b.knock(&key).cloned());
    let record = match record {
        Some(record) => record,
        None => {
            let own = core.random_key();
            let record = KnockKeys { by: hex(&own), spoke: false, sent: false, seq: 0, edge: hex(&ZERO_EDGE), m: String::new() };
            core.bind_mut(being, |b| b.file_knock(&key, record.clone()));
            record
        }
    };
    let own: [u8; 32] = unhex(&record.by).expect("a key this ward wrote");
    let own_pk = being_pk(&own);
    let to = invitation.heir.as_ref().map(|(pk, _, _)| *pk);
    let knocked = |by: &[u8; 32], next: Option<[u8; 32]>, lock: Option<&[u8; LOCK_LEN]>| exchange(core, being, &key, &invitation.ward, to, by, next, lock, method, args, time);
    let answer = match &invitation.heir {
        // The public being: one key for life, announcing nothing.
        None => knocked(&own, None, None),
        // Answered before and not taken: the door already binds her own key.
        Some(_) if record.spoke => knocked(&own, None, None),
        // Sent before and never answered: her own key first, under the knock's
        // edge key and with no ciphertext, then the heir with a fresh m.
        Some((_, heir_secret, lock)) if record.sent => match knocked(&own, None, None) {
            Answer::Silence => knocked(heir_secret, Some(own_pk), Some(lock)),
            other => other,
        },
        Some((_, heir_secret, lock)) => knocked(heir_secret, Some(own_pk), Some(lock)),
    };
    if matches!(answer, Answer::Value(_)) {
        core.bind_mut(being, |b| {
            if let Some(r) = b.knock_mut(&key) {
                r.spoke = true;
            }
        });
    }
    answer
}

/// One knock send, its number spent before the bytes go out.
#[allow(clippy::too_many_arguments)]
fn exchange(
    core: &Rc<Core>,
    being: &str,
    key: &str,
    ward: &WardPk,
    to: Option<[u8; 32]>,
    signer: &[u8; 32],
    next: Option<[u8; 32]>,
    lock: Option<&[u8; LOCK_LEN]>,
    method: Option<&str>,
    args: Option<&Map>,
    time: u64,
) -> Answer {
    let (seq, edge, m) = core.bind_mut(being, |b| {
        let r = b.knock_mut(key).expect("the knock record filed");
        r.seq += 1;
        r.sent = true;
        (r.seq, r.edge.clone(), unhex::<32>(&r.m))
    });
    // A knock is sealed to the lock and under the edge key its ciphertext
    // holds, the same m as the knock before it on this record; an ask to the
    // public being under the zero edge key; her own key under the edge key
    // the record holds.
    let under = match lock {
        Some(lock) => Sealing::Lock(lock, m),
        None => Sealing::Edge(unhex(&edge).filter(|_| to.is_some()).unwrap_or(ZERO_EDGE)),
    };
    let payload = Payload { to, by: being_pk(signer), next, seq, time, method: method.map(str::to_owned), args: args.cloned() };
    let sealed = match seal(core, ward, &payload, signer, under) {
        Ok(sealed) => sealed,
        Err(word) => return Answer::Word(word),
    };
    // The record holds the knock's edge key and its m from the moment it is
    // sealed.
    if let Some(m) = sealed.m {
        core.bind_mut(being, |b| {
            if let Some(r) = b.knock_mut(key) {
                r.edge = hex(&sealed.edge);
                r.m = hex(&m);
            }
        });
    }
    match transmit(core, ward, &sealed, payload.time) {
        Ok((reply, moved)) => {
            // An object on a named relation moves the edge key to the one its
            // reply carries.
            if let (Reply::Object { .. }, Some(moved), Some(_)) = (&reply, moved, to) {
                core.bind_mut(being, |b| {
                    if let Some(r) = b.knock_mut(key) {
                        r.edge = hex(&moved);
                    }
                });
            }
            heard(reply)
        }
        Err(word) => Answer::Word(word),
    }
}

pub(super) fn ask(core: &Rc<Core>, being: &str, id: &str, method: Option<&str>, args: Option<&Map>, time: u64) -> Answer {
    // S2: the standing is gone.
    let standing = || core.partition.borrow().bind.get(being).and_then(|b| b.standings.get(id).cloned());
    let Some(keys) = standing() else {
        return Answer::Word(Word::Dropped);
    };
    if !sendable(args) {
        return Answer::Word(Word::Unreached);
    }
    // One relation, one line: the keys are read once the send before this
    // one has ended. A wait that runs out in line sent nothing.
    let Some(_line) = core.line(being, &keys.ward, keys.heir.as_deref(), deadline(time)) else {
        return Answer::Word(Word::Unreached);
    };
    let Some(mut keys) = standing() else {
        return Answer::Word(Word::Dropped);
    };
    let Ok(ward) = WardPk::from_str(&keys.ward) else {
        return Answer::Word(Word::Invitation);
    };
    let by: [u8; 32] = unhex(&keys.by).expect("a key this ward wrote");
    let rotates = keys.heir.is_some();
    if rotates && keys.next.is_none() {
        keys.next = Some(hex(&core.random_key()));
    }
    keys.seq += 1;
    let written = keys.clone();
    core.bind_mut(being, |b| b.standings.insert(id.into(), written));
    let next = keys.next.as_deref().and_then(unhex).map(|s| being_pk(&s));
    let to = keys.heir.as_deref().and_then(unhex);
    // A standing on `{ ward }` alone is always sealed under the zero edge key.
    let edge = unhex(&keys.edge).filter(|_| rotates).unwrap_or(ZERO_EDGE);
    let payload = Payload { to, by: being_pk(&by), next, seq: keys.seq, time, method: method.map(str::to_owned), args: args.cloned() };
    let back = seal(core, &ward, &payload, &by, Sealing::Edge(edge)).and_then(|sealed| transmit(core, &ward, &sealed, time));
    let (reply, moved) = match back {
        Ok(back) => back,
        Err(word) => return Answer::Word(word),
    };
    if let Reply::Object { object, seen } = &reply {
        // The signing key and the edge key move in one moment, on an object
        // and on nothing else.
        core.bind_mut(being, |b| {
            if let Some(s) = b.standings.get_mut(id).filter(|_| rotates) {
                if let Some(next) = s.next.take() {
                    s.by = next;
                }
                if let Some(moved) = moved {
                    s.edge = hex(&moved);
                }
            }
        });
        let object = object.clone();
        let seen = seen.clone();
        core.write_cells(being, |c| {
            let Some(mut record) = c.standing(id) else {
                return;
            };
            match method {
                Some(_) => record.seen = seen,
                None => {
                    record.digest = digest(&object);
                    record.blueprint = Blueprint::read(&object).map(Blueprint::into_value);
                }
            }
            c.set_standing(&record);
        });
    }
    heard(reply)
}

/// What an ask is sealed under: an edge key, or a lock, whose ciphertext the
/// knock carries and whose secret gives the knock's edge key.
enum Sealing<'a> {
    Edge([u8; 32]),
    /// The lock, and the m of the knock before on this record, or none for
    /// the first.
    Lock(&'a [u8; LOCK_LEN], Option<[u8; 32]>),
}

/// An ask sealed: its bytes, its ephemeral secret, the edge key its body
/// went under, and the m a knock encapsulated under.
struct Sealed {
    bytes: Vec<u8>,
    ephemeral: [u8; 32],
    edge: [u8; 32],
    m: Option<[u8; 32]>,
}

/// Seals one payload. A knock draws its ephemeral secret, then m unless it
/// is given one. `Err` is nothing left: what arrival would refuse is never
/// sealed.
fn seal(core: &Rc<Core>, ward: &WardPk, payload: &Payload, signer: &[u8; 32], under: Sealing) -> Result<Sealed, Word> {
    let body = payload.to_json();
    let overhead = match under {
        Sealing::Edge(_) => seal::ASK_SEALED,
        Sealing::Lock(..) => seal::KNOCK_SEALED,
    };
    if body.len() + overhead > seal::MAX_BYTES {
        return Err(Word::Unreached);
    }
    let ephemeral = core.random_key();
    let (bytes, edge, m) = match (under, payload.to) {
        (Sealing::Lock(lock, again), Some(heir)) => {
            let m = again.unwrap_or_else(|| core.random_key());
            let (ciphertext, secret) = arithmetic::encapsulate(lock, &m);
            let edge = arithmetic::lock_edge(&secret);
            (seal::seal_knock(ward, &ephemeral, heir, &ciphertext, &edge, body.as_bytes(), signer), edge, Some(m))
        }
        (Sealing::Lock(..), None) => return Err(Word::Unreached),
        (Sealing::Edge(edge), to) => (seal::seal_ask(ward, &ephemeral, to, &edge, body.as_bytes(), signer), edge, None),
    };
    Ok(Sealed { bytes: bytes.ok_or(Word::Unreached)?, ephemeral, edge, m })
}

/// Carries one sealed ask and reads what came back, beside the next edge key
/// the reply gives, chained from the edge key the ask went under. `Err` is a
/// word of her own ward's: nothing left, nothing came back, or the wait ran
/// out.
///
/// The allowance is a duration, counted from the moment the bytes go out. The
/// ward waits for it at most, whatever the carrier does, and what comes
/// back late is not read, so one quiet far side never holds the line for good.
fn transmit(core: &Rc<Core>, ward: &WardPk, sealed: &Sealed, time: u64) -> Result<(Reply, Option<[u8; 32]>), Word> {
    let allowance = Duration::from_millis(time);
    let waited = Instant::now();
    let here = if *ward == core.pk { Some(super::Ward(core.clone())) } else { core.ground.door(ward) };
    let back = if let Some(here) = here {
        let back = here.door(&sealed.bytes).0;
        if waited.elapsed() >= allowance {
            return Err(Word::Late);
        }
        back
    } else {
        let carrier = core.carrier.clone().ok_or(Word::Unreached)?;
        let (sender, receiver) = channel();
        let to = *ward;
        let bytes = sealed.bytes.clone();
        std::thread::spawn(move || {
            let _ = sender.send(carrier.carry(&to, &bytes));
        });
        // The harbor holds the wait, so what else it runs meanwhile is its
        // own. A carrier gone without a word answered nothing at all.
        let came = RefCell::new(None);
        let ready = || {
            if came.borrow().is_none() {
                match receiver.try_recv() {
                    Ok(back) => *came.borrow_mut() = Some(back),
                    Err(TryRecvError::Disconnected) => return true,
                    Err(TryRecvError::Empty) => {}
                }
            }
            came.borrow().is_some()
        };
        core.ground.wait(&ready, waited + allowance);
        match came.into_inner() {
            Some(back) => back.ok_or(Word::Unreached)?,
            None => return Err(Word::Late),
        }
    };
    // S4: not Quo's bytes are silence.
    match seal::open_reply(&sealed.ephemeral, ward, &back) {
        Some(reply) => Ok((reply, seal::reply_edge(&sealed.ephemeral, &sealed.edge, &back))),
        None => Ok((Reply::Silence, None)),
    }
}

/// What a reply is to her: an object, silence, or the door's word.
fn heard(reply: Reply) -> Answer {
    match reply {
        Reply::Object { object, .. } => Answer::Value(object),
        Reply::Silence => Answer::Silence,
        Reply::Word(word) => Answer::Word(word),
    }
}
