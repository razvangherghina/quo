// SPDX-License-Identifier: Apache-2.0
// The edge seal and the lock: an ask's body sealed a second time under an
// edge key only the two ends of a relation hold. The first comes from the
// ward's lock through the knock's ciphertext, and each later one is chained
// from the one before it on every choice. A hand seals its own asks to `B`'s
// door beside `A`'s ward asking through its stance.

mod harness;

use harness::{stream, SplitMix64};
use quo_kit::arithmetic;
use quo_kit::harbor::MemoryHarbor;
use quo_kit::hex::{hex, unhex};
use quo_kit::seal::{self, Payload, Reply, ZERO_EDGE};
use quo_kit::seal::{being_pk, Seed, WardPk};
use quo_kit::value::{Map, Value, Word};
use quo_kit::ward::{Answer, Asker};
use quo_kit::ward::{Being, Stance, Thrown};
use std::cell::RefCell;
use std::rc::Rc;

struct Edge {
    stance: Stance,
}

fn obj(entries: &[(&str, Value)]) -> Map {
    entries.iter().map(|(k, v)| (*k, v.clone())).collect()
}

fn said(answer: Answer) -> Value {
    Value::Object(match answer {
        Answer::Value(v) => obj(&[("object", v)]),
        Answer::Silence => obj(&[("silence", true.into())]),
        Answer::Word(w) => obj(&[("word", w.as_str().into())]),
    })
}

impl Being for Edge {
    fn answer(&self, _asker: &Asker, method: Option<&str>, args: &Map) -> Result<Answer, Thrown> {
        let text = |f: &str| args.get(f).and_then(Value::as_str);
        Ok(match method {
            None => Answer::Value(Value::Object(obj(&[("asks", Value::Array(vec![])), ("notes", Map::new().into())]))),
            Some("hello") => Answer::Value("hi".into()),
            Some("quiet") => Answer::Silence,
            Some("knock") => {
                let invitation = args.get("invitation").cloned().unwrap();
                let answer = self.stance.knock(&invitation, Some(text("method").unwrap_or("hello")), None, None);
                if matches!(answer, Answer::Value(_)) {
                    self.stance.take(text("id").unwrap(), &invitation);
                }
                Answer::Value(said(answer))
            }
            Some("ask") => Answer::Value(said(self.stance.ask(text("id").unwrap(), text("method"), None, None))),
            Some(_) => Answer::Silence,
        })
    }
}

struct World {
    entropy: Rc<RefCell<SplitMix64>>,
    far: MemoryHarbor,
    near: MemoryHarbor,
    a: WardPk,
    b: WardPk,
}

/// A knock the hand sealed and has not yet delivered: its bytes, its lid's
/// secret, and the knock's edge key.
struct Knock {
    bytes: Vec<u8>,
    lid: [u8; 32],
    edge: [u8; 32],
}

impl World {
    fn new() -> World {
        let entropy = Rc::new(RefCell::new(SplitMix64::new(11)));
        let far = MemoryHarbor::new(stream(&entropy));
        let near = MemoryHarbor::new(stream(&entropy));
        far.link(&near);
        for h in [&far, &near] {
            h.hold("Edge", |stance| Ok(Box::new(Edge { stance })));
        }
        let a = far.boot(Seed::from_text("A"));
        let b = near.boot(Seed::from_text("B"));
        let w = World { entropy, far, near, a, b };
        w.root(&w.far, &a, "boot", &[("key", "a".into()), ("class", "Edge".into())]);
        w.root(&w.near, &b, "boot", &[("key", "b".into()), ("class", "Edge".into())]);
        w
    }

    fn root(&self, harbor: &MemoryHarbor, ward: &WardPk, method: &str, args: &[(&str, Value)]) -> Value {
        match harbor.ask(ward, Some(method), Some(&obj(args))) {
            Some(Answer::Value(v)) => v,
            other => panic!("{method}: {other:?}"),
        }
    }

    fn invite(&self, id: &str) -> Value {
        self.root(&self.near, &self.b, "invite", &[("being", "b".into()), ("id", id.into())])
    }

    /// `a`'s being asks through her stance.
    fn on_a(&self, method: &str, args: &[(&str, Value)]) -> Value {
        let args = Value::Object(obj(args));
        self.root(&self.far, &self.a, "ask", &[("being", "a".into()), ("method", method.into()), ("args", args)])
    }

    /// The door's row for a heir: under `heirs`, or under `gone`.
    fn heir_row(&self, heir: &[u8; 32]) -> Value {
        let p = self.near.partition(&self.b).unwrap();
        let heir = hex(heir);
        p.get("heirs").and_then(|r| r.get(&heir)).or_else(|| p.get("gone").and_then(|r| r.get(&heir))).cloned().unwrap()
    }

    fn edges(&self, heir: &[u8; 32]) -> (String, Option<String>) {
        let row = self.heir_row(heir);
        (row.get("open").and_then(Value::as_str).unwrap().to_owned(), row.get("offered").and_then(Value::as_str).map(str::to_owned))
    }

    fn standing_edge(&self, id: &str) -> String {
        let p = self.far.partition(&self.a).unwrap();
        let s = p.get("bind").and_then(|b| b.get("a")).and_then(|b| b.get("standings")).and_then(|s| s.get(id)).unwrap();
        s.get("edge").and_then(Value::as_str).unwrap().to_owned()
    }

    /// `B`'s lock as its partition keeps it.
    fn lock(&self) -> Option<String> {
        self.near.partition(&self.b).unwrap().get("lock").and_then(Value::as_str).map(str::to_owned)
    }

    fn digest(&self) -> String {
        self.near.digest(&self.b).unwrap()
    }

    /// The hand seals one ask to `B` with no ciphertext and reads the reply:
    /// what it opened to, and the edge key the reply chains from `edge`.
    fn hand(&self, head: Option<[u8; 32]>, edge: &[u8; 32], payload: &Payload, signer: &[u8; 32]) -> (Option<Reply>, Option<[u8; 32]>) {
        let lid = self.entropy.borrow_mut().key();
        let body = payload.to_json();
        let sealed = seal::seal_ask(&self.b, &lid, head, edge, body.as_bytes(), signer).unwrap();
        assert_eq!(sealed.len(), body.len() + seal::ASK_SEALED);
        self.deliver(&Knock { bytes: sealed, lid, edge: *edge })
    }

    /// The hand seals a knock as the heir to `lock`: the lid drawn, then m.
    fn seal_knock(&self, lock: &[u8; 1184], heir: &[u8; 32], own: &[u8; 32]) -> Knock {
        let lid = self.entropy.borrow_mut().key();
        let m = self.entropy.borrow_mut().key();
        let (ciphertext, secret) = arithmetic::encapsulate(lock, &m);
        let edge = arithmetic::lock_edge(&secret);
        let body = ask(Some(being_pk(heir)), heir, Some(*own), 1, "hello").to_json();
        let bytes = seal::seal_knock(&self.b, &lid, being_pk(heir), &ciphertext, &edge, body.as_bytes(), heir).unwrap();
        assert_eq!(bytes.len(), body.len() + 1248, "a knock box is 1248 bytes longer than its payload");
        Knock { bytes, lid, edge }
    }

    fn deliver(&self, sealed: &Knock) -> (Option<Reply>, Option<[u8; 32]>) {
        let (back, _) = self.near.door(&self.b, &sealed.bytes).unwrap();
        (seal::open_reply(&sealed.lid, &self.b, &back), seal::reply_edge(&sealed.lid, &sealed.edge, &back))
    }
}

fn secret(invitation: &Value) -> [u8; 32] {
    unhex(invitation.get("secret").and_then(Value::as_str).unwrap()).unwrap()
}

fn lock(invitation: &Value) -> Box<[u8; 1184]> {
    Box::new(unhex(invitation.get("lock").and_then(Value::as_str).unwrap()).unwrap())
}

fn ask(to: Option<[u8; 32]>, by: &[u8; 32], next: Option<[u8; 32]>, seq: u64, method: &str) -> Payload {
    Payload { to, by: being_pk(by), next: next.map(|k| being_pk(&k)), seq, time: 30_000, method: Some(method.into()), args: None }
}

fn hi() -> Option<Reply> {
    Some(Reply::Object { object: "hi".into(), seen: blueprint_digest() })
}

fn blueprint_digest() -> Option<String> {
    quo_kit::value::digest(&Value::Object(obj(&[("asks", Value::Array(vec![])), ("notes", Map::new().into())])))
}

/// A knock by the hand, delivered and answered. Returns the heir pk, her own
/// key, the knock's edge key and the edge key the reply chained from it.
fn knocked(w: &World) -> ([u8; 32], [u8; 32], [u8; 32], [u8; 32]) {
    let invitation = w.invite("g");
    let heir = secret(&invitation);
    let own = w.entropy.borrow_mut().key();
    let knock = w.seal_knock(&lock(&invitation), &heir, &own);
    let (reply, moved) = w.deliver(&knock);
    assert_eq!(reply, hi());
    (being_pk(&heir), own, knock.edge, moved.unwrap())
}

#[test]
fn the_lock_is_drawn_once_at_the_first_invite_and_kept_across_a_restart() {
    let w = World::new();
    assert_eq!(w.lock(), None, "a ward stood on an empty partition has no lock");
    // Drawn in one draw of sixty-four bytes, before that invite's heir secret.
    let mut copy = w.entropy.borrow().clone();
    let g = w.invite("g");
    let drawn = copy.bytes(64);
    assert_eq!(w.lock(), Some(hex(&drawn)));
    assert_eq!(secret(&g), copy.key(), "the heir secret is drawn after the lock");
    let seed: [u8; 64] = drawn.try_into().unwrap();
    assert_eq!(lock(&g), arithmetic::lock_pk(&seed), "the invitation carries its encapsulation key");
    // Nothing else draws for it.
    let h = w.invite("h");
    assert_eq!(lock(&h), lock(&g));
    w.near.restart(&w.b).unwrap();
    assert_eq!(w.lock(), Some(hex(&seed)), "a ward stood from its partition keeps its lock");
    assert_eq!(lock(&w.invite("i")), lock(&g));
    // The lock is not the seed's: another ward draws another.
    let other = MemoryHarbor::new(stream(&Rc::new(RefCell::new(SplitMix64::new(12)))));
    other.hold("Edge", |stance| Ok(Box::new(Edge { stance })));
    let c = other.boot(Seed::from_text("B"));
    w.root(&other, &c, "boot", &[("key", "b".into()), ("class", "Edge".into())]);
    let theirs = w.root(&other, &c, "invite", &[("being", "b".into()), ("id", "g".into())]);
    assert_ne!(lock(&theirs), lock(&g));
}

#[test]
fn an_invitation_without_a_lock_is_not_one() {
    let w = World::new();
    let Value::Object(mut invitation) = w.invite("g") else { panic!() };
    invitation.remove("lock");
    let before = w.digest();
    let knock = w.on_a("knock", &[("id", "s".into()), ("invitation", Value::Object(invitation))]);
    assert_eq!(knock.get("word").and_then(Value::as_str), Some("invitation"));
    assert_eq!(w.digest(), before, "nothing was sent");
}

#[test]
fn a_knock_box_opens_only_with_the_lock() {
    let w = World::new();
    let invitation = w.invite("g");
    let heir = secret(&invitation);
    let own = w.entropy.borrow_mut().key();
    let before = w.digest();
    // Sealed to another lock, the ciphertext decapsulates to another secret.
    let other = arithmetic::lock_pk(&[3u8; 64]);
    let (reply, _) = w.deliver(&w.seal_knock(&other, &heir, &own));
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
    // With no ciphertext, under the zero edge key, it does not open either.
    let (reply, _) = w.hand(Some(being_pk(&heir)), &ZERO_EDGE, &ask(Some(being_pk(&heir)), &heir, Some(own), 1, "hello"), &heir);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
    // A tampered ciphertext is D1 silence, and nothing is written.
    let mut tampered = w.seal_knock(&lock(&invitation), &heir, &own);
    tampered.bytes[32 + 48] ^= 1;
    let (reply, _) = w.deliver(&tampered);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
    // A box too short to hold a ciphertext and a body tag does not open.
    let mut short = w.seal_knock(&lock(&invitation), &heir, &own);
    short.bytes.truncate(32 + 48 + 1088 + 15);
    let (reply, _) = w.deliver(&short);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
    // Sealed to the lock, it binds: open is the knock's edge key, offered the
    // key chained from it and the reply's agreement.
    let knock = w.seal_knock(&lock(&invitation), &heir, &own);
    let (reply, moved) = w.deliver(&knock);
    assert_eq!(reply, hi());
    assert_eq!(w.edges(&being_pk(&heir)), (hex(&knock.edge), moved.map(|m| hex(&m))));
    assert_ne!(knock.edge, ZERO_EDGE);
}

#[test]
fn the_edge_chain_moves_as_quo_edge_of_the_key_before_and_the_agreement_on_both_ends() {
    let w = World::new();
    let (heir, own, knock_edge, offered) = knocked(&w);
    // The knock's reply chained offered from the knock's edge key; the hand
    // computes each next key from the reply's pk and its own lid.
    assert_eq!(w.edges(&heir), (hex(&knock_edge), Some(hex(&offered))));
    let next = w.entropy.borrow_mut().key();
    let (reply, moved) = w.hand(Some(heir), &offered, &ask(Some(heir), &own, Some(next), 2, "hello"), &own);
    assert_eq!(reply, hi());
    assert_eq!(w.edges(&heir), (hex(&offered), moved.map(|m| hex(&m))));
    // The knock's edge key it moved past no longer opens: silence, nothing written.
    let before = w.digest();
    let (reply, _) = w.hand(Some(heir), &knock_edge, &ask(Some(heir), &next, None, 3, "hello"), &next);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
    // Her side through the stance: the standing's edge key is the door's offered
    // after each object.
    let invitation = w.invite("h");
    let knock = w.on_a("knock", &[("id", "s".into()), ("invitation", invitation.clone())]);
    assert!(knock.get("object").is_some(), "{knock:?}");
    let h = being_pk(&secret(&invitation));
    assert_eq!(Some(w.standing_edge("s")), w.edges(&h).1);
    for _ in 0..3 {
        let hello = w.on_a("ask", &[("id", "s".into()), ("method", "hello".into())]);
        assert_eq!(hello.get("object").and_then(Value::as_str), Some("hi"));
        let (open, offered) = w.edges(&h);
        assert_eq!(Some(w.standing_edge("s")), offered);
        assert_ne!(Some(open), offered);
    }
}

#[test]
fn next_edge_is_quo_edge_over_sixty_four_bytes() {
    let (edge, agreement) = ([1u8; 32], [2u8; 32]);
    let mut ikm = [1u8; 64];
    ikm[32..].copy_from_slice(&agreement);
    let mut out = [0u8; 32];
    arithmetic::hkdf_sha256(&[], &ikm, b"quo-edge", &mut out);
    assert_eq!(arithmetic::next_edge(&edge, &agreement), out);
    // And a reply's edge key is that, over its agreement with the lid.
    let lid = [5u8; 32];
    let reply_eph = [6u8; 32];
    let mut reply = arithmetic::agreement_pk(&reply_eph).to_vec();
    reply.extend([0u8; 200]);
    let agreed = arithmetic::agree(&lid, &arithmetic::agreement_pk(&reply_eph)).unwrap();
    assert_eq!(seal::reply_edge(&lid, &edge, &reply), Some(arithmetic::next_edge(&edge, &agreed)));
}

#[test]
fn repeated_silences_keep_the_sender_heard() {
    let w = World::new();
    let knock = w.on_a("knock", &[("id", "s".into()), ("invitation", w.invite("g"))]);
    assert!(knock.get("object").is_some(), "{knock:?}");
    let edge = w.standing_edge("s");
    for _ in 0..3 {
        let quiet = w.on_a("ask", &[("id", "s".into()), ("method", "quiet".into())]);
        assert_eq!(quiet.get("silence").and_then(Value::as_bool), Some(true));
        assert_eq!(w.standing_edge("s"), edge, "silence moves no edge key on her side");
    }
    let hello = w.on_a("ask", &[("id", "s".into()), ("method", "hello".into())]);
    assert_eq!(hello.get("object").and_then(Value::as_str), Some("hi"));
    assert_ne!(w.standing_edge("s"), edge, "an object moves it");
    let again = w.on_a("ask", &[("id", "s".into()), ("method", "hello".into())]);
    assert_eq!(again.get("object").and_then(Value::as_str), Some("hi"));
}

#[test]
fn a_lost_knock_reply_is_recovered_under_her_own_key_and_the_knocks_edge_key() {
    let w = World::new();
    let (heir, own, knock_edge, _lost) = knocked(&w);
    let (reply, moved) = w.hand(Some(heir), &knock_edge, &ask(Some(heir), &own, None, 2, "hello"), &own);
    assert_eq!(reply, hi());
    assert_eq!(w.edges(&heir), (hex(&knock_edge), moved.map(|m| hex(&m))), "opened under open: open stays");
}

#[test]
fn a_knock_that_brought_no_object_back_is_recovered_by_her_ward_under_the_knocks_edge_key() {
    let w = World::new();
    let invitation = w.invite("g");
    let heir = being_pk(&secret(&invitation));
    // The knock meets silence: the door spent the heir, and her knock record
    // holds the knock's edge key the door holds open.
    let quiet = w.on_a("knock", &[("id", "s".into()), ("invitation", invitation.clone()), ("method", "quiet".into())]);
    assert_eq!(quiet.get("silence").and_then(Value::as_bool), Some(true), "{quiet:?}");
    let p = w.far.partition(&w.a).unwrap();
    let knocks = p.get("bind").and_then(|b| b.get("a")).and_then(|b| b.get("knocks")).and_then(Value::as_object).unwrap();
    let (_, record) = knocks.iter().next().unwrap();
    let (open, _) = w.edges(&heir);
    assert_eq!(record.get("edge").and_then(Value::as_str), Some(open.as_str()));
    assert_ne!(open, hex(&ZERO_EDGE));
    // Knocking again, her ward asks under her own key and that edge key, with
    // no ciphertext, and is answered.
    let again = w.on_a("knock", &[("id", "s".into()), ("invitation", invitation)]);
    assert_eq!(again.get("object").and_then(Value::as_str), Some("hi"), "{again:?}");
    assert_eq!(Some(w.standing_edge("s")), w.edges(&heir).1);
    let hello = w.on_a("ask", &[("id", "s".into()), ("method", "hello".into())]);
    assert_eq!(hello.get("object").and_then(Value::as_str), Some("hi"));
}

#[test]
fn a_knock_again_as_the_spent_heir_after_her_beings_silence_leaves_her_side_heard() {
    let w = World::new();
    let invitation = w.invite("g");
    // The knock meets silence, and so does the ask under her own key: the
    // being's silence and the door's are one reply, so her ward knocks as the
    // heir after it too, with the same m, and on a spent heir that knock is
    // refused.
    for _ in 0..2 {
        let quiet = w.on_a("knock", &[("id", "s".into()), ("invitation", invitation.clone()), ("method", "quiet".into())]);
        assert_eq!(quiet.get("silence").and_then(Value::as_bool), Some(true), "{quiet:?}");
    }
    // The refused knock wrote nothing at the door, and nothing on her side the
    // door does not hold: her own key is heard under the knock's edge key.
    let again = w.on_a("knock", &[("id", "s".into()), ("invitation", invitation)]);
    assert_eq!(again.get("object").and_then(Value::as_str), Some("hi"), "{again:?}");
}

#[test]
fn a_door_that_never_heard_the_knock_refuses_her_own_key_and_a_fresh_knock_binds() {
    let w = World::new();
    let invitation = w.invite("g");
    let heir = secret(&invitation);
    let own = w.entropy.borrow_mut().key();
    // The knock is sealed and never arrives.
    let lost = w.seal_knock(&lock(&invitation), &heir, &own);
    let before = w.digest();
    // Her own key under the knock's edge key, with no ciphertext: the heir is
    // fresh, the door reads a ciphertext that is not there, and nothing is
    // written.
    let (reply, _) = w.hand(Some(being_pk(&heir)), &lost.edge, &ask(Some(being_pk(&heir)), &own, None, 2, "hello"), &own);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
    // She knocks again as the heir with a fresh m, and it binds.
    let fresh = w.seal_knock(&lock(&invitation), &heir, &own);
    assert_ne!(fresh.edge, lost.edge);
    let (reply, _) = w.deliver(&fresh);
    assert_eq!(reply, hi());
    assert_eq!(w.edges(&being_pk(&heir)).0, hex(&fresh.edge));
}

#[test]
fn two_knocks_racing_on_one_invitation_and_the_loser_is_silenced() {
    let w = World::new();
    let invitation = w.invite("g");
    let heir = secret(&invitation);
    let mine = w.entropy.borrow_mut().key();
    let theirs = w.entropy.borrow_mut().key();
    let first = w.seal_knock(&lock(&invitation), &heir, &mine);
    let second = w.seal_knock(&lock(&invitation), &heir, &theirs);
    let (reply, _) = w.deliver(&first);
    assert_eq!(reply, hi());
    let before = w.digest();
    let (reply, _) = w.deliver(&second);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
    assert_eq!(w.heir_row(&being_pk(&heir)).get("held").and_then(Value::as_str), Some(hex(&being_pk(&mine)).as_str()));
}

#[test]
fn a_body_under_a_wrong_edge_key_is_silence_and_writes_nothing() {
    let w = World::new();
    let (heir, own, _, _) = knocked(&w);
    let before = w.digest();
    let (reply, _) = w.hand(Some(heir), &[9u8; 32], &ask(Some(heir), &own, None, 2, "hello"), &own);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.digest(), before);
}

#[test]
fn a_to_that_is_not_the_head_is_malformed() {
    let w = World::new();
    let (heir, own, _, offered) = knocked(&w);
    let before = w.digest();
    // A heir against a zero head, null against the heir's head, another heir.
    let cases = [(None, Some(heir), ZERO_EDGE), (Some(heir), None, offered), (Some(heir), Some([5u8; 32]), offered)];
    for (head, to, edge) in cases {
        let (reply, _) = w.hand(head, &edge, &ask(to, &own, None, 2, "hello"), &own);
        assert_eq!(reply, Some(Reply::Silence), "head {head:?} to {to:?}");
        assert_eq!(w.digest(), before);
    }
    // The same ask with `to` and the head agreeing is heard.
    let (reply, _) = w.hand(Some(heir), &offered, &ask(Some(heir), &own, None, 2, "hello"), &own);
    assert_eq!(reply, hi());
}

#[test]
fn a_removed_keys_ask_still_opens_and_hears_removed() {
    let w = World::new();
    let knock = w.on_a("knock", &[("id", "s".into()), ("invitation", w.invite("g"))]);
    assert!(knock.get("object").is_some(), "{knock:?}");
    w.root(&w.near, &w.b, "remove", &[("being", "b".into()), ("id", "g".into())]);
    let asked = w.on_a("ask", &[("id", "s".into()), ("method", "hello".into())]);
    assert_eq!(asked.get("word").and_then(Value::as_str), Some(Word::Removed.as_str()));
}

#[test]
fn the_public_being_is_asked_under_the_zero_edge_key() {
    let w = World::new();
    w.root(&w.near, &w.b, "public", &[("key", "b".into())]);
    let stranger = w.entropy.borrow_mut().key();
    let before = w.digest();
    let (reply, _) = w.hand(None, &ZERO_EDGE, &ask(None, &stranger, None, 1, "hello"), &stranger);
    assert_eq!(reply, hi());
    assert_eq!(w.digest(), before, "nothing kept, nothing moves");
    let (reply, _) = w.hand(None, &[3u8; 32], &ask(None, &stranger, None, 1, "hello"), &stranger);
    assert_eq!(reply, Some(Reply::Silence));
    assert_eq!(w.lock(), None, "the public being draws no lock");
    // A standing taken on `{ ward }` alone is heard, asked under the zero edge key.
    let public = Value::Object(obj(&[("ward", w.b.to_string().into())]));
    let knock = w.on_a("knock", &[("id", "p".into()), ("invitation", public)]);
    assert!(knock.get("object").is_some(), "{knock:?}");
    assert_eq!(w.standing_edge("p"), hex(&ZERO_EDGE));
    let asked = w.on_a("ask", &[("id", "p".into()), ("method", "hello".into())]);
    assert_eq!(asked.get("object").and_then(Value::as_str), Some("hi"));
    assert_eq!(w.standing_edge("p"), hex(&ZERO_EDGE));
}

#[test]
fn the_derivations_are_the_labels_the_spec_names() {
    let shared = [1u8; 32];
    let mut out = [0u8; 32];
    arithmetic::hkdf_sha256(&[], &shared, b"quo-lock", &mut out);
    assert_eq!(arithmetic::lock_edge(&shared), out);
    let mut ikm = [1u8; 64];
    ikm[32..].copy_from_slice(&[2u8; 32]);
    let mut both = [0u8; 44];
    arithmetic::hkdf_sha256(&[], &ikm, b"quo-edge-seal", &mut both);
    let (key, nonce) = arithmetic::edge_seal_key(&shared, &[2u8; 32]);
    assert_eq!((&key[..], &nonce[..]), (&both[..32], &both[32..]));
}
