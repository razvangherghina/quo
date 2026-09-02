//! The peer that missed the news, and the pointer it meets instead.
//!
//! Articles XIII and XIV, from the promise: a peer behind a migration needs no
//! new invitation, because its standing travelled with the being. The old door
//! answers `moved` with the same signed word it sent as news, a handle that
//! meets that word hands it to its own warden to believe by the same steps,
//! and the row is rehoused on the spot. The ask that met the move is silence,
//! as every ask at a departed being is; the next reaches the new house.
//!
//! Two houses stand as doors behind a delivery that carries real envelopes
//! between them, and the peer is a whole warden holding a real handle. The
//! migration is the real one: packed, spent as a `receive`, landed, departed.

use std::sync::{Arc, Mutex};

use quo_envelope::{Allowance, Method};
use quo_warden as warden;
use quo_wire::{Invitation, Value};
use warden::{
    as_bool, Carried, Delivery, Departing, Door, Handle, Memory, Opening, Reach, Resident, Route,
    Seeds, Tell, Warden, Way, Word,
};

const LAMP: &str = "Lamp\n  lit() bool\n";

const TRAVELLER_SECRET: u8 = 0x30;
const TRAVELLER_HEIR: u8 = 0x31;
const VOICE_HEIR: u8 = 0x33;
const GATE_HEIR: u8 = 0x37;
const GATE_VOICE: u8 = 0x39;
const MINTED_BEING: u8 = 0x90;
const MINTED_HEIR: u8 = 0x91;

fn seed(byte: u8) -> [u8; 32] {
    [byte; 32]
}

fn pk(secret: &[u8; 32]) -> [u8; 32] {
    quo_arithmetic::signing_pk(secret)
}

fn allowance() -> Allowance {
    Allowance {
        time: 5_000,
        hops: 8,
    }
}

fn door(name: u8, padlock: u8, own_heir: u8) -> Door {
    let name_secret = seed(name);
    Door::new(
        name_secret,
        seed(padlock),
        quo_arithmetic::commitment(&pk(&name_secret), &pk(&seed(own_heir))),
        65_536,
        8,
    )
}

/// Draws that never repeat, so every key this warden mints is its own.
struct Counted(Mutex<u64>);

impl warden::ground::Random for Counted {
    fn draw(&self) -> [u8; 32] {
        let mut at = self.0.lock().expect("the bench");
        *at += 1;
        let mut key = [0u8; 32];
        key[..8].copy_from_slice(&at.to_le_bytes());
        key[8] = 0xc0;
        key
    }
}

/// The two houses the peer's delivery reaches, and what each of them was
/// asked. They are doors rather than wardens because the migration itself is
/// door-level work; what is under test is the peer's handle.
struct Houses {
    origin: Door,
    destination: Door,
    /// The padlock of every house an envelope was carried to, in order.
    knocked: Vec<[u8; 32]>,
    /// Whether the being answers where it now stands. Turned off to make the
    /// new house fall silent, which is the only way to meet a word twice.
    answers: bool,
}

impl Houses {
    fn house(&mut self, padlock: [u8; 32]) -> Option<&mut Door> {
        if padlock == self.origin.padlock {
            Some(&mut self.origin)
        } else if padlock == self.destination.padlock {
            Some(&mut self.destination)
        } else {
            None
        }
    }
}

/// The road between the peer and the two houses. It carries bytes and opens
/// nothing: every envelope is judged and answered by the door it was addressed
/// to, and a door that refuses is silence on the wire.
struct Between(Arc<Mutex<Houses>>);

impl Delivery for Between {
    fn send(&self, way: &Way, envelope: &[u8]) -> Carried {
        let mut houses = self.0.lock().expect("the bench");
        houses.knocked.push(way.padlock);
        let answers = houses.answers;
        let Some(door) = houses.house(way.padlock) else {
            return Carried::Silence;
        };
        let Ok(verdict) = door.judge(envelope, 0) else {
            return Carried::Silence;
        };
        let data = match &verdict.route {
            // The bench stands in for the resident, as it must where the house
            // is a door and not a whole ground.
            Route::Being { .. } => {
                if !answers {
                    return Carried::Silence;
                }
                Some(lit_bytes())
            }
            _ => match door.answer(&verdict, Some(&[seed(0xa1), seed(0xa2)])) {
                Ok(data) => data,
                Err(_) => return Carried::Silence,
            },
        };
        match door.reply(&verdict.say, data, &seed(0x77)) {
            Ok(bytes) => Carried::Answer(bytes),
            Err(_) => Carried::Silence,
        }
    }
}

fn lit_bytes() -> Vec<u8> {
    let blueprint = quo_notation::parse(LAMP).expect("a blueprint");
    let ty = blueprint.fields[0].answers.clone().expect("lit answers");
    quo_wire::encode(&blueprint, &ty, &Value::Bool(true)).expect("a bool on the wire")
}

/// Let a voice in at a being, the way a grant does.
fn grants(door: &mut Door, voice: [u8; 32], invitation: &Invitation, being: [u8; 32]) {
    door.inbound.push(warden::Inbound {
        voice,
        commitment: invitation.commitment,
        minted_at: door.name,
        beings: vec![being],
        mark: 0,
        spent: Vec::new(),
        padlock: None,
        hints: Vec::new(),
    });
}

/// Everything standing before anything moves: two houses, the being at the
/// origin, and a peer that holds a real handle at it.
struct World {
    houses: Arc<Mutex<Houses>>,
    peer: Warden,
    handle: Handle,
    traveller: [u8; 32],
    committed: [u8; 32],
    at_destination: usize,
}

fn world() -> World {
    let mut origin = door(0x01, 0x02, 0x03);
    let mut destination = door(0x11, 0x12, 0x13);

    let traveller = pk(&seed(TRAVELLER_SECRET));
    let committed = pk(&seed(TRAVELLER_HEIR));
    origin.beings.push(Resident {
        being: traveller,
        digest: quo_notation::digest(LAMP).expect("a blueprint"),
        commitment: quo_arithmetic::commitment(&origin.name, &committed),
        cells: b"a lamp's own memory".to_vec(),
    });
    origin.blueprints.push(LAMP.to_string());

    let invitation = Invitation {
        warden: origin.name,
        commitment: quo_arithmetic::commitment(&origin.name, &pk(&seed(VOICE_HEIR))),
        padlock: origin.padlock,
        heir: pk(&seed(VOICE_HEIR)),
        heir_secret: seed(VOICE_HEIR),
        hints: vec!["https://origin.example".to_string()],
    };
    grants(&mut origin, pk(&seed(0x32)), &invitation, traveller);

    // The destination holds the class, and a standing for the origin to spend
    // `receive` with.
    destination.blueprints.push(LAMP.to_string());
    let gate = Invitation {
        warden: destination.name,
        commitment: quo_arithmetic::commitment(&destination.name, &pk(&seed(GATE_HEIR))),
        padlock: destination.padlock,
        heir: pk(&seed(GATE_HEIR)),
        heir_secret: seed(GATE_HEIR),
        hints: Vec::new(),
    };
    let public = destination.name;
    grants(&mut destination, pk(&seed(0x36)), &gate, public);
    let at_destination = origin.remember(&gate);

    let houses = Arc::new(Mutex::new(Houses {
        origin,
        destination,
        knocked: Vec::new(),
        answers: true,
    }));
    let random = Arc::new(Counted(Mutex::new(0)));
    let peer = Warden::open(
        Opening::new(Seeds::drawn(random.as_ref()), Arc::new(|| 0i64), random)
            .with_delivery(Arc::new(Between(houses.clone())))
            .with_store(Arc::new(Memory::new())),
    );
    let mut handles = peer.accept(&invitation);
    assert_eq!(handles.len(), 1, "one being is granted, so one handle");
    let handle = handles.remove(0);
    assert_eq!(
        as_bool(handle.call("lit", &[])),
        Some(true),
        "the peer reaches the being where it stands now"
    );

    World {
        houses,
        peer,
        handle,
        traveller,
        committed,
        at_destination,
    }
}

/// What the origin and the destination each publish once the being has moved:
/// the real migration, run door to door.
struct Moved {
    first: Word,
    second: Word,
    /// The peers each house owes news, kept for the cases that deliver it.
    told: warden::Peer,
    landed: warden::Peer,
}

fn migrate(w: &World) -> Moved {
    let mut houses = w.houses.lock().expect("the bench");
    let cargo = houses
        .origin
        .pack(&w.traveller, &w.committed)
        .expect("a cargo for a being this door holds");
    let args = warden::shape::write_record("cargo", &cargo.value()).expect("a cargo on the wire");
    let (message, _) = houses
        .origin
        .rotate(
            w.at_destination,
            &seed(0x38),
            &seed(GATE_VOICE),
            &Reach {
                method: Some(Method {
                    name: "receive".to_string(),
                    args,
                }),
                allowance: allowance(),
                ..Reach::default()
            },
        )
        .expect("the origin composes the receive");
    let verdict = houses
        .destination
        .judge(&message, 0)
        .expect("the destination admits the origin");
    let data = houses
        .destination
        .answer(&verdict, Some(&[seed(MINTED_BEING), seed(MINTED_HEIR)]))
        .expect("the destination takes the cargo in");
    let sealed = houses
        .destination
        .reply(&verdict.say, data, &seed(0x79))
        .expect("a sealed answer");
    let answer = houses
        .origin
        .hear(w.at_destination, &sealed)
        .expect("the destination answered the receive");
    let commitment = match warden::shape::read_record(
        "b32",
        &answer.data.expect("receive answers a commitment"),
    )
    .expect("a b32 answer")
    {
        Value::B32(key) => key,
        other => panic!("receive answered {other:?} where a commitment was due"),
    };

    let landing = houses
        .destination
        .landed(&["https://landing.example".to_string()])
        .expect("a being landed here");
    let (name, padlock) = (houses.destination.name, houses.destination.padlock);
    let departed = houses
        .origin
        .depart(
            &w.traveller,
            &Departing {
                heir: w.committed,
                commitment,
                name,
                padlock,
                hints: vec!["https://landing.example".to_string()],
            },
        )
        .expect("the origin departs the being");

    Moved {
        first: departed.word,
        second: landing.word,
        told: departed.peers[0].clone(),
        landed: landing.peers[0].clone(),
    }
}

/// The padlocks knocked on since the last look, and the list emptied.
fn knocked(w: &World) -> Vec<[u8; 32]> {
    let mut houses = w.houses.lock().expect("the bench");
    std::mem::take(&mut houses.knocked)
}

fn origin_padlock(w: &World) -> [u8; 32] {
    w.houses.lock().expect("the bench").origin.padlock
}

fn destination_padlock(w: &World) -> [u8; 32] {
    w.houses.lock().expect("the bench").destination.padlock
}

#[test]
fn xiii_a_peer_that_missed_the_news_meets_the_pointer_and_is_rehoused() {
    let w = world();
    let _ = migrate(&w);
    let _ = knocked(&w);

    // The ask that met the move is silence, as every ask at a departed being
    // is: the old door only points.
    assert_eq!(
        w.handle.call("lit", &[]),
        None,
        "the call that met the move is answered with silence"
    );
    let met = knocked(&w);
    assert_eq!(
        met.first(),
        Some(&origin_padlock(&w)),
        "the call went to the house the row named"
    );
    assert!(
        met.contains(&destination_padlock(&w)),
        "and the pointer was chased to the house the word named"
    );

    // The row is rehoused on the spot, by the same word the news carries — so
    // the next call down this same handle reaches the new house and is
    // answered there, with no new invitation anywhere.
    assert_eq!(
        as_bool(w.handle.call("lit", &[])),
        Some(true),
        "the next call reaches the being at its new house"
    );
    let after = knocked(&w);
    assert_eq!(
        after,
        vec![destination_padlock(&w)],
        "and it goes straight there, the old door never asked again"
    );
}

#[test]
fn xiv_a_pointer_signed_by_a_key_the_row_does_not_hold_rehouses_nothing() {
    let w = world();
    let _ = migrate(&w);
    // The old door publishes a word for a successor this peer holds no
    // commitment for. Nothing about it is believable, and a peer that took it
    // would have followed whoever answered.
    {
        let mut houses = w.houses.lock().expect("the bench");
        let name = houses.destination.name;
        let padlock = houses.destination.padlock;
        let traveller = w.traveller;
        let forged = Word {
            being: Some(traveller),
            successor: Some(pk(&seed(0x7f))),
            commitment: Some([9u8; 32]),
            name: Some(name),
            padlock: Some(padlock),
            hints: Vec::new(),
        };
        houses.origin.moved.clear();
        houses.origin.moved.push((traveller, forged));
    }
    let _ = knocked(&w);

    assert_eq!(w.handle.call("lit", &[]), None, "the move is still silence");
    assert_eq!(
        w.handle.call("lit", &[]),
        None,
        "and the call after it is silence too: nothing was rehoused"
    );
    let after = knocked(&w);
    assert!(
        after.iter().all(|padlock| *padlock == origin_padlock(&w)),
        "every ask still went to the house the row named before"
    );
}

#[test]
fn xiv_a_word_already_believed_rehouses_nothing_a_second_time() {
    let w = world();
    let _ = migrate(&w);
    assert_eq!(w.handle.call("lit", &[]), None, "the move is silence once");
    assert_eq!(
        as_bool(w.handle.call("lit", &[])),
        Some(true),
        "and the peer stands at the new house"
    );

    // The new house falls silent at the being, so the handle meets the word it
    // has already believed. A word whose succession this row has taken places
    // nowhere: the key it names is no longer the one the row holds the hash
    // of, and nothing moves.
    w.houses.lock().expect("the bench").answers = false;
    let _ = knocked(&w);
    assert_eq!(w.handle.call("lit", &[]), None, "the house answers nothing");
    w.houses.lock().expect("the bench").answers = true;
    assert_eq!(
        as_bool(w.handle.call("lit", &[])),
        Some(true),
        "and the peer is still standing exactly where it was"
    );
    let after = knocked(&w);
    assert!(
        after
            .iter()
            .all(|padlock| *padlock == destination_padlock(&w)),
        "no ask went backwards to the old door"
    );
}

#[test]
fn xiii_a_peer_that_did_receive_the_news_is_not_moved_twice_by_the_word() {
    let w = world();
    let moved = migrate(&w);

    // Both pieces of news, composed as real sealed envelopes and judged at the
    // peer's own door.
    for (word, peer, secret, hints) in [
        (
            moved.first.clone(),
            moved.told.clone(),
            seed(TRAVELLER_HEIR),
            Vec::new(),
        ),
        (
            moved.second.clone(),
            moved.landed.clone(),
            seed(MINTED_BEING),
            vec!["https://landing.example".to_string()],
        ),
    ] {
        let announced = {
            let houses = w.houses.lock().expect("the bench");
            let house = if secret == seed(TRAVELLER_HEIR) {
                &houses.origin
            } else {
                &houses.destination
            };
            house
                .news(
                    &seed(0x40),
                    &Tell {
                        peer,
                        voice_secret: secret,
                        word,
                        seq: 1,
                        allowance: allowance(),
                        hints,
                    },
                )
                .expect("a house composes its news")
        };
        assert!(
            w.peer.arrive(&announced, None).is_some(),
            "news is judged and answered by the same steps as any ask, and a \
             refusal would be silence"
        );
    }

    // News alone is enough: the first call is the one that reaches the new
    // house, and no pointer was ever asked for.
    let _ = knocked(&w);
    assert_eq!(
        as_bool(w.handle.call("lit", &[])),
        Some(true),
        "the peer that heard the news reaches the being at once"
    );
    assert_eq!(
        knocked(&w),
        vec![destination_padlock(&w)],
        "one ask, at the new house, and nothing chased"
    );

    // And meeting the word as well moves nothing: the succession it announces
    // is one this row has already taken.
    w.houses.lock().expect("the bench").answers = false;
    assert_eq!(w.handle.call("lit", &[]), None, "the house answers nothing");
    w.houses.lock().expect("the bench").answers = true;
    let _ = knocked(&w);
    assert_eq!(
        as_bool(w.handle.call("lit", &[])),
        Some(true),
        "and the peer stands where the news put it"
    );
    assert_eq!(
        knocked(&w),
        vec![destination_padlock(&w)],
        "still one house, and still the right one"
    );
}
