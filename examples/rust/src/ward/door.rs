// SPDX-License-Identifier: Apache-2.0
//! The door: thirteen cases, in order, and the first case met is the answer.

use super::{Answer, Asker};
use super::{Being, Core};
use crate::arithmetic::{self, KEY_LEN};
use crate::hex::{hex, unhex};
use crate::seal::{self, Payload, Reply, Under, MAX_BYTES, SEALED, ZERO_EDGE};
use crate::value::{digest, Map, Word};
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::rc::Rc;

/// What judgment decided: the lid, `None` when fewer than thirty-two bytes
/// arrived, the reply, whether a key the door holds spoke, whether the ask
/// reached her, and on a choice on a named heir that heir, the edge key that
/// becomes its open, and the edge key the ask came under.
struct Verdict {
    lid: Option<[u8; 32]>,
    reply: Reply,
    heard: bool,
    answered: bool,
    moves: Option<(String, String, [u8; 32])>,
}

pub(super) fn arrive(core: &Rc<Core>, bytes: &[u8]) -> (Vec<u8>, bool) {
    let verdict = judge(core, bytes);
    // A lid that is missing or will not take a seal is answered to a key
    // nobody holds: thirty-two bytes drawn and taken as a lid, and when that
    // will not take a seal either, the public key of thirty-two more. That
    // key is drawn before the reply's own ephemeral key.
    let takes = |lid: &[u8; 32]| arithmetic::agree(&[9u8; 32], lid).is_some();
    let lid = match verdict.lid.filter(|lid| takes(lid)) {
        Some(lid) => lid,
        None => Some(core.random_key()).filter(|lid| takes(lid)).unwrap_or_else(|| arithmetic::agreement_pk(&core.random_key())),
    };
    // The reply's ephemeral key is the last draw of the arrival. On a choice
    // it is drawn before the edge keys are written, and the reply's agreement
    // gives the key offered next, chained from the key the ask came under.
    let ephemeral = core.random_key();
    if let Some((heir, open, under)) = verdict.moves {
        let shared = arithmetic::agree(&ephemeral, &lid).expect("a lid that takes a seal");
        if let Some(h) = core.partition.borrow_mut().heirs.get_mut(&heir) {
            h.open = open;
            h.offered = Some(hex(&arithmetic::next_edge(&under, &shared)));
        }
    }
    // Keep is asked once, after the being answered and before the seal, and
    // never on a refusal, which wrote nothing. A no is that arrival's failure,
    // said as a throw is said: `threw` to a bound key, silence to a stranger.
    let reply = match verdict.answered && !core.ground.keep() {
        false => verdict.reply,
        true if verdict.heard => Reply::Word(Word::Threw),
        true => Reply::Silence,
    };
    let sealed = seal::seal_reply(&lid, &ephemeral, &core.key, &reply).expect("a lid that takes a seal");
    (sealed, verdict.heard)
}

fn stranger(lid: Option<[u8; 32]>) -> Verdict {
    Verdict { lid, reply: Reply::Silence, heard: false, answered: false, moves: None }
}

/// How an ask for `head` is tried: under the lock for a fresh heir; open then
/// offered for a spent heir or one removed after it spoke; the zero edge key
/// for nobody, a heir never minted here or one removed before it spoke.
fn candidates(core: &Core, head: Option<[u8; 32]>) -> Under {
    let Some(heir) = head.map(|h| hex(&h)) else {
        return Under::Edges(vec![ZERO_EDGE]);
    };
    let p = core.partition.borrow();
    let edges = match (p.heirs.get(&heir), p.gone(&heir)) {
        (Some(h), _) if h.fresh => {
            return match p.lock.as_deref().and_then(unhex) {
                Some(lock) => Under::Lock(Box::new(lock)),
                None => Under::Edges(vec![]),
            }
        }
        (Some(h), _) => h.edges(),
        (None, Some(g)) => g.edges(),
        (None, None) => return Under::Edges(vec![ZERO_EDGE]),
    };
    Under::Edges(edges.iter().filter_map(|e| unhex(e)).collect())
}

fn judge(core: &Rc<Core>, bytes: &[u8]) -> Verdict {
    // D1: the box does not open.
    let lid: [u8; 32] = match bytes.get(..KEY_LEN) {
        Some(head) => head.try_into().expect("thirty-two bytes"),
        None => return stranger(None),
    };
    let lid = Some(lid);
    let Some(opened) = seal::open_ask(|lid| core.key.agree(lid), |head| candidates(core, head), bytes) else {
        return stranger(lid);
    };
    // D2: the payload is malformed, or `to` is not the head.
    let Ok(payload) = Payload::read(&opened.payload) else {
        return stranger(lid);
    };
    if payload.to != opened.head {
        return stranger(lid);
    }
    let (body, signature) = (&opened.payload, &opened.signature);
    let edge = hex(&opened.edge);
    let verified = || arithmetic::verify(&payload.by, body, signature);

    let Some(heir_pk) = payload.to else {
        // D3: for nobody, and nobody is home. D4: the signature fails.
        let public = core.partition.borrow().public.clone();
        let Some(being) = public.as_deref().and_then(|k| core.being(k)) else {
            return stranger(lid);
        };
        if !verified() {
            return stranger(lid);
        }
        let reply = match choose(&being, &Asker::Nobody, &payload) {
            Reply::Word(_) => Reply::Silence,
            other => other,
        };
        // The public being: always the zero edge key, nothing kept.
        return Verdict { lid, reply, heard: false, answered: true, moves: None };
    };

    let heir = hex(&heir_pk);
    let by = hex(&payload.by);
    let held = core.partition.borrow().heirs.get(&heir).cloned();
    let Some(held) = held else {
        let gone = core.partition.borrow().gone(&heir).cloned();
        // D5: the heir is not held. D6: not the key held when she removed it.
        let Some(gone) = gone else {
            return stranger(lid);
        };
        if gone.held != by && gone.vouched.as_deref() != Some(by.as_str()) {
            return stranger(lid);
        }
        // D7, then D8: `removed`. `gone` names no being, so nothing more is
        // asked, whether or not she is back.
        if !verified() {
            return stranger(lid);
        }
        return Verdict { lid, reply: Reply::Word(Word::Removed), heard: true, answered: false, moves: None };
    };
    // D6: the key is not admitted.
    let admitted = |h: &super::Heir| h.held == by || h.vouched.as_deref() == Some(by.as_str());
    if !admitted(&held) {
        return stranger(lid);
    }
    // D7: the signature fails under an admitted key.
    if !verified() {
        return stranger(lid);
    }
    // Admission read again, now that the signature is checked, and the edge
    // key the ask opened under still one the door holds for that heir: a knock
    // still on a fresh heir, any other ask on an edge key it holds.
    let still = |h: &super::Heir| match opened.knock {
        true => h.fresh,
        false => !h.fresh && h.edges().contains(&edge),
    };
    let Some(held) = core.partition.borrow().heirs.get(&heir).filter(|h| admitted(h) && still(h)).cloned() else {
        return stranger(lid);
    };
    let word = |w| Verdict { lid, reply: Reply::Word(w), heard: true, answered: false, moves: None };
    // D8 `absent`: the being did not come back this run.
    let Some(being) = core.being(&held.being) else {
        return word(Word::Absent);
    };
    // D8 `removed`: she is back and her occupant record is gone.
    if core.partition.borrow().beings.get(&held.being).and_then(|c| c.occupant(&held.id)).is_none() {
        return word(Word::Removed);
    }
    // D9: a fresh heir that announces no key of her own.
    if held.fresh && (payload.next.is_none() || payload.next == Some(heir_pk)) {
        return word(Word::Unannounced);
    }
    // D10: the number is refused.
    if !held.honours(payload.seq) {
        return word(Word::Repeated);
    }
    // The open a choice leaves: the knock's edge key on the knock, offered
    // when the ask opened under offered, and open as it stands otherwise.
    let open = match held.fresh || held.offered.as_deref() == Some(edge.as_str()) {
        true => edge.clone(),
        false => held.open.clone(),
    };
    // Spend the number and settle the keys, then dispatch.
    {
        let mut p = core.partition.borrow_mut();
        let h = p.heirs.get_mut(&heir).expect("read a moment ago");
        h.spend(payload.seq);
        let next = payload.next.map(|k| hex(&k));
        if h.fresh {
            h.held = next.expect("a fresh heir vouched");
            h.vouched = None;
            h.fresh = false;
        } else {
            if h.vouched.as_deref() == Some(by.as_str()) {
                h.held = by.clone();
                h.vouched = None;
            }
            if next.is_some() {
                h.vouched = next;
            }
        }
    }
    let reply = choose(&being, &Asker::Occupant(held.id), &payload);
    Verdict { lid, reply, heard: true, answered: true, moves: Some((heir, open, opened.edge)) }
}

/// D11 to D13: she was reached, and her answer is read. A door never seals a
/// reply above the size, so an object whose reply would be larger is her
/// answer that cannot cross, and it is judged a throw.
fn choose(being: &Rc<dyn Being>, asker: &Asker, payload: &Payload) -> Reply {
    let method = payload.method.as_deref();
    match dispatch(being, asker, method, payload.args.as_ref()) {
        Answer::Value(object) => {
            let seen = method.and_then(|_| describe(being, asker));
            let reply = Reply::Object { object, seen };
            match reply.to_json().len() + SEALED > MAX_BYTES {
                true => Reply::Word(Word::Threw),
                false => reply,
            }
        }
        Answer::Silence => Reply::Silence,
        Answer::Word(word) => Reply::Word(word),
    }
}

/// Calls her answer, catching every throw. A throw, a word out of her and a
/// value past the bound are `threw`.
pub(super) fn dispatch(being: &Rc<dyn Being>, asker: &Asker, method: Option<&str>, args: Option<&Map>) -> Answer {
    let empty = Map::new();
    let args = args.unwrap_or(&empty);
    match catch_unwind(AssertUnwindSafe(|| being.answer(asker, method, args))) {
        Ok(Ok(Answer::Value(v))) if v.check().is_ok() => Answer::Value(v),
        Ok(Ok(Answer::Silence)) => Answer::Silence,
        _ => Answer::Word(Word::Threw),
    }
}

/// Her describe for this asker, hashed. A describe that throws or falls
/// silent costs the digest and nothing else.
pub(super) fn describe(being: &Rc<dyn Being>, asker: &Asker) -> Option<String> {
    match dispatch(being, asker, None, None) {
        Answer::Value(v) => digest(&v),
        _ => None,
    }
}
