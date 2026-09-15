// SPDX-License-Identifier: Apache-2.0
// Every record of vectors/framing.json, byte for byte.

use quo_kit::arithmetic;
use quo_kit::hex::hex;
use quo_kit::seal::{self, Invitation, Payload, Reply};
use quo_kit::seal::{being_pk, Seed};
use quo_kit::value::{digest, Value, Word};
use serde_json::Value as Json;

fn corpus() -> Json {
    let path = format!("{}/../../vectors/framing.json", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn unhex(s: &str) -> Vec<u8> {
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn b32(r: &Json, field: &str) -> [u8; 32] {
    unhex(r[field].as_str().unwrap()).try_into().unwrap()
}

fn text<'a>(r: &'a Json, field: &str) -> &'a str {
    r[field].as_str().unwrap()
}

/// A lock's `d || z`.
fn lock_seed(r: &Json) -> [u8; 64] {
    [b32(r, "d"), b32(r, "z")].concat().try_into().unwrap()
}

/// The lock record: the ward's lock from fixed d and z, and the m a knock
/// encapsulates under it.
fn lock_record(records: &[Json]) -> &Json {
    records.iter().find(|r| r.get("d").is_some() && r.get("lock").is_some()).expect("the lock record")
}

/// The ward the sealed records are sealed to: the one from the ward pk vector.
fn ward_seed(c: &Json) -> Seed {
    let r = c["vectors"].as_array().unwrap().iter().find(|r| r.get("signPk").is_some()).unwrap();
    Seed::from_bytes(&b32(r, "seed"))
}

#[test]
fn every_framing_record() {
    let c = corpus();
    let seed = ward_seed(&c);
    let ward = seed.ward_pk();
    let key = seed.ward_key();
    let records = c["vectors"].as_array().unwrap();
    // The signed ask body the sealed ask carries, by its `to`.
    let signed = |to: &str| records.iter().find(|r| r.get("signature").is_some() && r["to"] == to).unwrap();
    for r in records {
        let name = text(r, "name");
        if r.get("signPk").is_some() {
            assert_eq!(seed.ward_pk().to_string(), text(r, "pk"), "{name}");
            assert_eq!(hex(&ward.sign), text(r, "signPk"), "{name}");
            assert_eq!(hex(&ward.padlock), text(r, "padlockPk"), "{name}");
        } else if r.get("secret").is_some() && r.get("signature").is_none() {
            assert_eq!(hex(&being_pk(&b32(r, "secret"))), text(r, "pk"), "{name}");
        } else if r.get("canonical").is_some() {
            let v = Value::parse(text(r, "blueprint")).unwrap();
            assert_eq!(v.canonical(), text(r, "canonical"), "{name}");
            assert_eq!(digest(&v).as_deref(), Some(text(r, "digest")), "{name}");
        } else if r.get("signature").is_some() {
            let payload = Payload::read(text(r, "payload").as_bytes()).expect(name);
            assert_eq!(payload.to_json(), text(r, "payload"), "{name}: the body is written in its order");
            assert_eq!(hex(payload.to_json().as_bytes()), text(r, "body"), "{name}");
            let to = text(r, "to");
            assert_eq!(payload.to.map(|k| hex(&k)).unwrap_or_default(), to, "{name}");
            let sig = arithmetic::sign(&b32(r, "secret"), payload.to_json().as_bytes());
            assert_eq!(hex(&sig), text(r, "signature"), "{name}");
            assert!(arithmetic::verify(&payload.by, payload.to_json().as_bytes(), &sig), "{name}");
        } else if r.get("m").is_some() && r.get("ownSecret").is_none() {
            // A lock from fixed d and z, a ciphertext and a secret from a fixed
            // m, and the knock's edge key.
            let seed = lock_seed(r);
            let lock = arithmetic::lock_pk(&seed);
            assert_eq!(hex(&lock[..]), text(r, "lock"), "{name}");
            let (ciphertext, secret) = arithmetic::encapsulate(&lock, &b32(r, "m"));
            assert_eq!(hex(&ciphertext[..]), text(r, "ciphertext"), "{name}");
            assert_eq!(hex(&secret), text(r, "shared"), "{name}");
            assert_eq!(arithmetic::decapsulate(&seed, &ciphertext), secret, "{name}");
            assert_eq!(hex(&arithmetic::lock_edge(&secret)), text(r, "edge"), "{name}");
        } else if r.get("ownSecret").is_some() {
            let heir = b32(r, "heirSecret");
            let own = b32(r, "ownSecret");
            let payload = Payload::read(text(r, "payload").as_bytes()).expect(name);
            assert_eq!(payload.to, Some(being_pk(&heir)), "{name}: to is the heir");
            assert_eq!(payload.by, being_pk(&heir), "{name}: by is the heir");
            assert_eq!(payload.next, Some(being_pk(&own)), "{name}: next is her own key");
            let body = payload.to_json();
            assert_eq!(body, text(r, "payload"), "{name}");
            // A knock carries the ciphertext of m under the lock, and its body
            // is sealed under the knock's edge key that ciphertext holds.
            // It is sealed to the lock of the lock record, under its m, where
            // the knock record names neither.
            let l = if r.get("d").is_some() { r } else { lock_record(records) };
            let seed = lock_seed(l);
            let m = b32(if r.get("m").is_some() { r } else { lock_record(records) }, "m");
            let (ciphertext, secret) = arithmetic::encapsulate(&arithmetic::lock_pk(&seed), &m);
            let edge = arithmetic::lock_edge(&secret);
            let sealed = seal::seal_knock(&ward, &b32(r, "ephemeralSeed"), being_pk(&heir), &ciphertext, &edge, body.as_bytes(), &heir).unwrap();
            assert_eq!(sealed.len(), body.len() + seal::KNOCK_SEALED, "{name}");
            assert_eq!(seal::KNOCK_SEALED, 1248);
            assert_eq!(hex(&sealed), text(r, "bytes"), "{name}");
            let opened = seal::open_ask(|lid| key.agree(lid), |_| seal::Under::Lock(Box::new(seed)), &sealed).expect(name);
            assert_eq!((opened.head, opened.edge, opened.knock), (payload.to, edge, true), "{name}");
            assert_eq!(opened.payload, body.as_bytes(), "{name}");
            assert!(arithmetic::verify(&being_pk(&heir), &opened.payload, &opened.signature), "{name}");
        } else if r.get("ephemeralSeed").is_some() {
            let s = signed(text(r, "to"));
            let body = unhex(text(s, "body"));
            // The edge key the record names, and the zero edge key where it
            // names none. The head is the payload's `to`.
            let edge = r.get("edge").map(|_| b32(r, "edge")).unwrap_or(seal::ZERO_EDGE);
            let head = Payload::read(&body).expect(name).to;
            let sealed = seal::seal_ask(&ward, &b32(r, "ephemeralSeed"), head, &edge, &body, &b32(s, "secret")).unwrap();
            assert_eq!(hex(&sealed), text(r, "bytes"), "{name}");
            let opened = seal::open_ask(|lid| key.agree(lid), |_| seal::Under::Edges(vec![edge]), &sealed).unwrap();
            assert_eq!(opened.head, head, "{name}");
            assert_eq!((opened.payload, hex(&opened.signature)), (body, text(s, "signature").to_owned()), "{name}");
            // Nothing rides outside the box: the heir is not in the bytes.
            assert!(!hex(&sealed).contains(&"a".repeat(64)), "{name}");
        } else if r.get("replySeed").is_some() {
            let reply = Reply::read(text(r, "reply").as_bytes()).expect(name);
            assert_eq!(reply.to_json(), text(r, "reply"), "{name}");
            // The record does not say what the reply is sealed to. It is the
            // lid of the sealed asks above, whose ephemeral seed they share.
            let ask = records.iter().find(|r| r.get("ephemeralSeed").is_some() && r.get("ownSecret").is_none()).unwrap();
            let lid_secret = b32(ask, "ephemeralSeed");
            let lid = arithmetic::agreement_pk(&lid_secret);
            let sealed = seal::seal_reply(&lid, &b32(r, "replySeed"), &key, &reply).unwrap();
            assert_eq!(hex(&sealed), text(r, "bytes"), "{name}");
            assert_eq!(seal::open_reply(&lid_secret, &ward, &sealed), Some(reply), "{name}");
        } else if r.get("reads").is_some() {
            assert!(Reply::read(text(r, "reads").as_bytes()).is_some(), "{name}: reads");
            assert_eq!(Reply::read(text(r, "refuses").as_bytes()), None, "{name}: refuses");
        } else if r.get("invitation").is_some() {
            let invitation = Invitation::for_heir(Seed::from_bytes(&b32(r, "wardSeed")).ward_pk(), b32(r, "heirSecret"), arithmetic::lock_pk(&lock_seed(r)));
            assert_eq!(invitation.to_value().to_json(), text(r, "invitation"), "{name}");
            assert_eq!(Invitation::read(&Value::parse(text(r, "invitation")).unwrap()), Some(invitation), "{name}");
        } else {
            panic!("a framing record this test does not know: {name}");
        }
    }
}

#[test]
fn replies_are_read_strictly() {
    assert_eq!(Reply::read(br#"{"quo":"removed"}"#), Some(Reply::Word(Word::Removed)));
    assert_eq!(Reply::read(br#"{"quo":"late"}"#), None, "a ward word never crosses");
    assert_eq!(Reply::read(br#"{"object":1}"#), None, "seen is always present");
    assert_eq!(Reply::read(br#"{"object":1,"seen":"x"}"#), None, "seen is a digest or null");
    assert_eq!(Reply::read(br#"{"silence":false}"#), None);
    assert_eq!(Reply::read(br#"{"silence":true,"seen":null}"#), None);
}

#[test]
fn invitations_are_read_by_s1() {
    let ward = Seed::from_text("A").ward_pk().to_string();
    let public = Value::parse(&format!(r#"{{"ward":"{ward}"}}"#)).unwrap();
    assert_eq!(Invitation::read(&public).map(|i| i.heir), Some(None));
    let secret_alone = Value::parse(&format!(r#"{{"ward":"{ward}","secret":"{}"}}"#, "4".repeat(64))).unwrap();
    assert_eq!(Invitation::read(&secret_alone), None);
    let heir_alone = Value::parse(&format!(r#"{{"ward":"{ward}","heir":"{}"}}"#, "4".repeat(64))).unwrap();
    assert_eq!(Invitation::read(&heir_alone), None);
    // A heir and a secret with no lock is no invitation, nor is a lock that is
    // not 2368 lowercase hex.
    let (heir, secret) = ("4".repeat(64), "5".repeat(64));
    let with_lock = |lock: Option<&str>| {
        let lock = lock.map(|l| format!(r#","lock":"{l}""#)).unwrap_or_default();
        Value::parse(&format!(r#"{{"ward":"{ward}","heir":"{heir}","secret":"{secret}"{lock},"hint":1}}"#)).unwrap()
    };
    assert_eq!(Invitation::read(&with_lock(None)), None, "no lock");
    assert_eq!(Invitation::read(&with_lock(Some(&"6".repeat(2366)))), None, "a lock too short");
    assert_eq!(Invitation::read(&with_lock(Some(&"A".repeat(2368)))), None, "a lock in capitals");
    // A field beside the four is ignored, and a secret that is not the heir's
    // is still an invitation: it is sent and refused at the far door.
    let beside = Value::parse(&format!(r#"{{"ward":"{ward}","hint":"x"}}"#)).unwrap();
    assert_eq!(Invitation::read(&beside).map(|i| i.heir), Some(None));
    let read = Invitation::read(&with_lock(Some(&"6".repeat(2368)))).expect("an invitation");
    assert_eq!(read.heir, Some(([0x44; 32], [0x55; 32], Box::new([0x66; 1184]))));
    assert_eq!(read.to_value().get("lock").and_then(Value::as_str), Some("6".repeat(2368).as_str()));
    assert_eq!(Invitation::read(&Value::parse(r#"{"ward":"nope"}"#).unwrap()), None);
}

mod harness;

#[test]
fn the_watchdog_stands() {
    harness::watchdog();
}
