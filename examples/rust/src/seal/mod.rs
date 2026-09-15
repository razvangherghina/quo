// SPDX-License-Identifier: Apache-2.0
//! The framing: the signed ask body, the sealed ask, the sealed reply, the
//! invitation, and the three reply shapes.
//!
//! A reply box is an ephemeral X25519 pk, the lid, and AES-256-GCM over what
//! it carries followed by a signature, authenticated under the lid it carries.
//! An ask box is sealed twice: the head under `quo-seal` of the agreement, and
//! the body under `quo-edge-seal` of the agreement and an edge key only the
//! two ends of the relation hold. A knock box carries an ML-KEM ciphertext
//! between the two, and its edge key is the one that ciphertext holds.

mod ward_key;

pub use ward_key::{being_pk, NotWardPk, Seed, WardPk};

use crate::arithmetic::{self, CIPHERTEXT_LEN, KEY_LEN, LOCK_LEN, LOCK_SEED_LEN, SIGNATURE_LEN, TAG_LEN};
use crate::hex::{hex, unhex};
use crate::value::{Map, Number, Value, Word};
use std::str::FromStr;

/// The one size: the bytes of an ask or a reply above it are refused before
/// anything is opened.
pub const MAX_BYTES: usize = 1 << 20;

/// How much longer a reply box is than its reply: the ephemeral pk, the tag
/// and the signature. A reply box of `b` bytes holds a reply of `b - SEALED`.
pub const SEALED: usize = KEY_LEN + TAG_LEN + SIGNATURE_LEN;

/// How much longer an ask box is than its payload: the ephemeral pk, the
/// head, its tag, the body's tag and the signature.
pub const ASK_SEALED: usize = KEY_LEN + KEY_LEN + TAG_LEN + TAG_LEN + SIGNATURE_LEN;

/// How much longer a knock box is than its payload: an ask's, and the ML-KEM
/// ciphertext between the sealed head and the sealed body.
pub const KNOCK_SEALED: usize = ASK_SEALED + CIPHERTEXT_LEN;

/// The fewest bytes an ask box may hold: the ephemeral pk, the sealed head
/// and a body's tag.
const ASK_LEAST: usize = KEY_LEN + KEY_LEN + TAG_LEN + TAG_LEN;

/// The zero edge key: the edge key of every ask to the public being and every
/// standing taken on `{ ward }`. It is also the head for nobody.
pub const ZERO_EDGE: [u8; 32] = [0u8; 32];

fn unhex32(text: &str) -> Option<[u8; 32]> {
    unhex(text)
}

/// What an ask says inside its box, signed by `by`.
#[derive(Clone, Debug, PartialEq)]
pub struct Payload {
    /// The heir it is for, or `None` for the public being.
    pub to: Option<[u8; 32]>,
    pub by: [u8; 32],
    pub next: Option<[u8; 32]>,
    pub seq: u64,
    pub time: u64,
    pub method: Option<String>,
    pub args: Option<Map>,
}

/// A payload the door will not read: D2.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Malformed;

impl Payload {
    /// The body as JSON, in the order the framing vectors pin: to, by, next,
    /// seq, time, and method and args where they are named.
    pub fn to_json(&self) -> String {
        let key = |k: Option<[u8; 32]>| Value::from(k.map(|k| hex(&k)));
        let mut map = Map::new();
        map.insert("to", key(self.to));
        map.insert("by", hex(&self.by));
        map.insert("next", key(self.next));
        map.insert("seq", whole(self.seq));
        map.insert("time", whole(self.time));
        if let Some(method) = &self.method {
            map.insert("method", method.as_str());
        }
        if let Some(args) = &self.args {
            map.insert("args", args.clone());
        }
        Value::Object(map).to_json()
    }

    /// Reads a body by D2: every field it owes present and of its shape.
    pub fn read(body: &[u8]) -> Result<Payload, Malformed> {
        let value = Value::parse_payload(body).map_err(|_| Malformed)?;
        let map = value.as_object().ok_or(Malformed)?;
        let key = |field: &str| map.get(field).and_then(Value::as_str).and_then(unhex32).ok_or(Malformed);
        let key_or_null = |field: &str| match map.get(field) {
            Some(Value::Null) => Ok(None),
            Some(_) => key(field).map(Some),
            None => Err(Malformed),
        };
        let number = |field: &str| map.get(field).and_then(Value::as_number).and_then(Number::as_u64);
        let seq = number("seq").filter(|n| *n >= 1).ok_or(Malformed)?;
        let time = number("time").filter(|n| *n >= 1).ok_or(Malformed)?;
        let method = match map.get("method") {
            None => None,
            Some(Value::String(m)) => Some(m.clone()),
            Some(_) => return Err(Malformed),
        };
        // The args are one object of values, each arg counted from itself:
        // the payload's own bound is wider and is not theirs.
        let args = match map.get("args") {
            None => None,
            Some(Value::Object(a)) if a.values().all(|arg| arg.check().is_ok()) => Some(a.clone()),
            Some(_) => return Err(Malformed),
        };
        Ok(Payload { to: key_or_null("to")?, by: key("by")?, next: key_or_null("next")?, seq, time, method, args })
    }
}

fn whole(n: u64) -> Value {
    Value::Number(Number::from_u64(n).expect("a count within the doubles"))
}

/// Seals `content || signature` to `padlock` under the ephemeral secret, as
/// a reply is sealed to its lid.
/// `None` is a padlock that will not take a seal.
pub fn seal(padlock: &[u8; 32], ephemeral: &[u8; 32], content: &[u8], signature: &[u8; 64]) -> Option<Vec<u8>> {
    let lid = arithmetic::agreement_pk(ephemeral);
    let shared = arithmetic::agree(ephemeral, padlock)?;
    let mut plaintext = content.to_vec();
    plaintext.extend_from_slice(signature);
    let mut sealed = lid.to_vec();
    sealed.extend(arithmetic::encrypt(&shared, &lid, &plaintext));
    Some(sealed)
}

/// Opens a reply box with the X25519 secret it was sealed to, and splits what
/// it carried into content and signature. A box over the size, or that opens
/// to sixty-four bytes or fewer, does not open. `None` is a box that does not
/// open.
pub fn open(secret: &[u8; 32], sealed: &[u8]) -> Option<(Vec<u8>, [u8; 64])> {
    if sealed.len() > MAX_BYTES || sealed.len() <= SEALED {
        return None;
    }
    let lid: [u8; 32] = sealed[..KEY_LEN].try_into().ok()?;
    let shared = arithmetic::agree(secret, &lid)?;
    let mut plaintext = arithmetic::decrypt(&shared, &lid, &sealed[KEY_LEN..])?;
    let signature: [u8; 64] = plaintext.split_off(plaintext.len() - SIGNATURE_LEN).try_into().ok()?;
    Some((plaintext, signature))
}

/// A sealed ask to the ward's padlock: the head, the heir pk or thirty-two
/// zero bytes for nobody, under `quo-seal`, then the payload signed by
/// `signer` under `quo-edge-seal` of the agreement and `edge`. Both are
/// authenticated under the lid. `None` is a padlock that will not take a seal.
pub fn seal_ask(ward: &WardPk, ephemeral: &[u8; 32], head: Option<[u8; 32]>, edge: &[u8; 32], payload: &[u8], signer: &[u8; 32]) -> Option<Vec<u8>> {
    seal_box(ward, ephemeral, head, None, edge, payload, signer)
}

/// A sealed knock: an ask whose box carries `ciphertext` between the sealed
/// head and the sealed body, the body under `edge`, the knock's edge key that
/// ciphertext holds. It is [`KNOCK_SEALED`] bytes longer than its payload.
pub fn seal_knock(ward: &WardPk, ephemeral: &[u8; 32], heir: [u8; 32], ciphertext: &[u8; CIPHERTEXT_LEN], edge: &[u8; 32], payload: &[u8], signer: &[u8; 32]) -> Option<Vec<u8>> {
    seal_box(ward, ephemeral, Some(heir), Some(ciphertext), edge, payload, signer)
}

fn seal_box(ward: &WardPk, ephemeral: &[u8; 32], head: Option<[u8; 32]>, ciphertext: Option<&[u8; CIPHERTEXT_LEN]>, edge: &[u8; 32], payload: &[u8], signer: &[u8; 32]) -> Option<Vec<u8>> {
    let lid = arithmetic::agreement_pk(ephemeral);
    let shared = arithmetic::agree(ephemeral, &ward.padlock)?;
    let mut body = payload.to_vec();
    body.extend_from_slice(&arithmetic::sign(signer, payload));
    let mut sealed = lid.to_vec();
    sealed.extend(arithmetic::encrypt(&shared, &lid, &head.unwrap_or(ZERO_EDGE)));
    if let Some(ciphertext) = ciphertext {
        sealed.extend_from_slice(ciphertext);
    }
    sealed.extend(arithmetic::encrypt_under(arithmetic::edge_seal_key(&shared, edge), &lid, &body));
    Some(sealed)
}

/// An ask box opened: the head, the payload and signature it carried, the
/// edge key the body opened under, and whether it opened as a knock, under
/// the edge key its ciphertext held.
#[derive(Clone, Debug, PartialEq)]
pub struct OpenedAsk {
    pub head: Option<[u8; 32]>,
    pub payload: Vec<u8>,
    pub signature: [u8; 64],
    pub edge: [u8; 32],
    pub knock: bool,
}

/// How the door tries a body, by what it holds for the head's heir.
#[derive(Clone, Debug, PartialEq)]
pub enum Under {
    /// A fresh heir: the bytes after the sealed head are a ciphertext, and the
    /// body is tried under `quo-lock` of what the lock drawn as `d || z`
    /// decapsulates from it, alone.
    Lock(Box<[u8; LOCK_SEED_LEN]>),
    /// No ciphertext: the body is tried under these edge keys, in order.
    Edges(Vec<[u8; 32]>),
}

/// Opens an ask box with whatever agrees with its lid. `under` names how the
/// door tries the body for the head, and the first edge key the body opens
/// under is the key it opened under.
///
/// D1 draws its lines here: a box over the size or under ninety-six bytes, an
/// all-zero agreement, a head that does not open, a knock too short to hold a
/// ciphertext and a body tag, a body that opens under no key tried, and a
/// body of sixty-four bytes or fewer.
pub fn open_ask(agree: impl FnOnce(&[u8; 32]) -> Option<[u8; 32]>, under: impl FnOnce(Option<[u8; 32]>) -> Under, sealed: &[u8]) -> Option<OpenedAsk> {
    if sealed.len() > MAX_BYTES || sealed.len() < ASK_LEAST {
        return None;
    }
    let lid: [u8; 32] = sealed[..KEY_LEN].try_into().ok()?;
    let shared = agree(&lid)?;
    let split = KEY_LEN + KEY_LEN + TAG_LEN;
    let head: [u8; 32] = arithmetic::decrypt(&shared, &lid, &sealed[KEY_LEN..split])?.try_into().ok()?;
    let head = Some(head).filter(|h| *h != ZERO_EDGE);
    let (edges, rest, knock) = match under(head) {
        Under::Lock(lock) => {
            let ciphertext: &[u8; CIPHERTEXT_LEN] = sealed.get(split..split + CIPHERTEXT_LEN)?.try_into().ok()?;
            if sealed.len() < split + CIPHERTEXT_LEN + TAG_LEN {
                return None;
            }
            let secret = arithmetic::decapsulate(&lock, ciphertext);
            (vec![arithmetic::lock_edge(&secret)], &sealed[split + CIPHERTEXT_LEN..], true)
        }
        Under::Edges(edges) => (edges, &sealed[split..], false),
    };
    let (edge, mut body) = edges.into_iter().find_map(|edge| arithmetic::decrypt_under(arithmetic::edge_seal_key(&shared, &edge), &lid, rest).map(|b| (edge, b)))?;
    if body.len() <= SIGNATURE_LEN {
        return None;
    }
    let signature: [u8; 64] = body.split_off(body.len() - SIGNATURE_LEN).try_into().ok()?;
    Some(OpenedAsk { head, payload: body, signature, edge, knock })
}

/// The next edge key a reply carries to the asker: `quo-edge` of the edge key
/// the ask went under and the agreement of the ask's ephemeral secret and the
/// reply's ephemeral pk. `None` is a reply too short to carry a pk, or an
/// all-zero agreement.
pub fn reply_edge(ephemeral: &[u8; 32], edge: &[u8; 32], sealed: &[u8]) -> Option<[u8; 32]> {
    let pk: [u8; 32] = sealed.get(..KEY_LEN)?.try_into().ok()?;
    arithmetic::agree(ephemeral, &pk).map(|shared| arithmetic::next_edge(edge, &shared))
}

/// One of the three reply shapes.
#[derive(Clone, Debug, PartialEq)]
pub enum Reply {
    /// `{ object, seen }`: seen is a digest on a named ask that had one.
    Object { object: Value, seen: Option<String> },
    /// `{ silence: true }`.
    Silence,
    /// `{ quo: word }`, one of the five door words.
    Word(Word),
}

impl Reply {
    pub fn to_json(&self) -> String {
        let mut map = Map::new();
        match self {
            Reply::Object { object, seen } => {
                map.insert("object", object.clone());
                map.insert("seen", seen.clone());
            }
            Reply::Silence => {
                map.insert("silence", true);
            }
            Reply::Word(word) => {
                map.insert("quo", word.as_str());
            }
        }
        Value::Object(map).to_json()
    }

    /// Reads a reply strictly, S4: exactly one of the three shapes and no
    /// field beside it, `seen` a lowercase digest or null, a word one the
    /// door says.
    pub fn read(content: &[u8]) -> Option<Reply> {
        let value = Value::parse_reply(content).ok()?;
        let map = value.as_object()?;
        let only = |fields: &[&str]| map.count() == fields.len() && fields.iter().all(|f| map.contains_key(f));
        if only(&["object", "seen"]) {
            let seen = match map.get("seen")? {
                Value::Null => None,
                Value::String(s) if unhex32(s).is_some() => Some(s.clone()),
                _ => return None,
            };
            let object = map.get("object")?;
            object.check().ok()?;
            return Some(Reply::Object { object: object.clone(), seen });
        }
        if only(&["silence"]) && map.get("silence")?.as_bool() == Some(true) {
            return Some(Reply::Silence);
        }
        if only(&["quo"]) {
            let word = Word::from_name(map.get("quo")?.as_str()?).filter(|w| w.is_door_word())?;
            return Some(Reply::Word(word));
        }
        None
    }
}

/// A sealed reply: the reply JSON signed by the ward key, sealed to `lid`.
pub fn seal_reply(lid: &[u8; 32], ephemeral: &[u8; 32], ward: &arithmetic::WardKey, reply: &Reply) -> Option<Vec<u8>> {
    let content = reply.to_json();
    seal(lid, ephemeral, content.as_bytes(), &ward.sign(content.as_bytes()))
}

/// Opens a reply with the ask's ephemeral secret and verifies it under the
/// ward it was sent to. `None` is S4: over the size, not opening, not signed
/// by that ward, or none of the three shapes.
pub fn open_reply(ephemeral: &[u8; 32], ward: &WardPk, sealed: &[u8]) -> Option<Reply> {
    let (content, signature) = open(ephemeral, sealed)?;
    arithmetic::verify(&ward.sign, &content, &signature).then_some(())?;
    Reply::read(&content)
}

/// An invitation: a ward pk, and for a heir the heir pk, its secret and the
/// ward's lock, the encapsulation key its knock is sealed to.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Invitation {
    pub ward: WardPk,
    pub heir: Option<InvitedHeir>,
}

/// What an invitation for a heir carries beside the ward: the heir pk, its
/// secret, and the lock.
pub type InvitedHeir = ([u8; 32], [u8; 32], Box<[u8; LOCK_LEN]>);

impl Invitation {
    /// A heir's invitation from its secret, the heir pk taken from it.
    pub fn for_heir(ward: WardPk, secret: [u8; 32], lock: Box<[u8; LOCK_LEN]>) -> Invitation {
        Invitation { ward, heir: Some((being_pk(&secret), secret, lock)) }
    }

    /// `{ ward, heir, secret, lock }`, or `{ ward }` for the public being.
    pub fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("ward", self.ward.to_string());
        if let Some((pk, secret, lock)) = &self.heir {
            map.insert("heir", hex(pk));
            map.insert("secret", hex(secret));
            map.insert("lock", hex(&lock[..]));
        }
        Value::Object(map)
    }

    /// Reads an invitation by S1: a ward pk, and a heir, a secret and a lock
    /// together or none of them. Nothing else is read: a field beside the
    /// four is ignored, and a secret that is not the heir's is sent and meets
    /// D6 at the far door.
    pub fn read(value: &Value) -> Option<Invitation> {
        let map = value.as_object()?;
        let ward = WardPk::from_str(map.get("ward")?.as_str()?).ok()?;
        match (map.get("heir"), map.get("secret"), map.get("lock")) {
            (None, None, None) => Some(Invitation { ward, heir: None }),
            (Some(heir), Some(secret), Some(lock)) => {
                let heir = unhex32(heir.as_str()?)?;
                let secret = unhex32(secret.as_str()?)?;
                let lock = Box::new(unhex::<LOCK_LEN>(lock.as_str()?)?);
                Some(Invitation { ward, heir: Some((heir, secret, lock)) })
            }
            _ => None,
        }
    }
}
