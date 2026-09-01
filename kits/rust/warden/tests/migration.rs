//! A being migrated away, end to end, and the peer that follows it.
//!
//! Articles XIII and XIV. **Migration is a double rotation**: to the committed
//! heir, then immediately to a key the destination warden generated and the
//! origin never saw. It is **one message sent twice** — once by the origin,
//! once by the destination — and after it every key the old warden held for
//! the being is dead.
//!
//! Nothing here stops at the routing. The cargo is packed, spent as a real
//! `receive` through the destination's door, announced twice as real sealed
//! envelopes, judged and believed at a third house, and that third house then
//! reaches the being at its new address and hears its answer.

use quo_envelope::{Allowance, Method};
use quo_warden as warden;
use quo_wire::{Invitation, Value};
use warden::{Departing, Reach, Resident, Route, Tell, Warden};

const LAMP: &str = "Lamp\n  lit() bool\n";

fn seed(byte: u8) -> [u8; 32] {
    [byte; 32]
}

fn pk(secret: &[u8; 32]) -> [u8; 32] {
    quo_arithmetic::signing_pk(secret)
}

/// A door with nothing but its public being standing.
fn door(name: u8, padlock: u8, own_heir: u8) -> Warden {
    let name_secret = seed(name);
    Warden::new(
        name_secret,
        seed(padlock),
        quo_arithmetic::commitment(&pk(&name_secret), &pk(&seed(own_heir))),
        65_536,
        8,
    )
}

fn allowance() -> Allowance {
    Allowance {
        time: 5_000,
        hops: 8,
    }
}

fn lit() -> Method {
    Method {
        name: "lit".to_string(),
        args: Vec::new(),
    }
}

/// Everything the three houses hold before anything moves.
struct World {
    origin: Warden,
    destination: Warden,
    peer: Warden,
    /// The being that travels, by the name it wears at the origin.
    traveller: [u8; 32],
    /// Its committed heir, which the cargo is packed under.
    committed: [u8; 32],
    /// The peer's outbound row at the origin, and the origin's at the
    /// destination — the standing a `receive` is spent by.
    at_origin: usize,
    at_destination: usize,
}

const TRAVELLER_SECRET: u8 = 0x30;
const TRAVELLER_HEIR: u8 = 0x31;
const VOICE_HEIR: u8 = 0x33;
const PEER_VOICE: u8 = 0x35;
const GATE_HEIR: u8 = 0x37;
const GATE_VOICE: u8 = 0x39;
const MINTED_BEING: u8 = 0x90;
const MINTED_HEIR: u8 = 0x91;

fn world() -> World {
    let mut origin = door(0x01, 0x02, 0x03);
    let mut destination = door(0x11, 0x12, 0x13);
    let mut peer = door(0x21, 0x22, 0x23);

    // The traveller, with its own memory and the heir its door committed to.
    let traveller = pk(&seed(TRAVELLER_SECRET));
    let committed = pk(&seed(TRAVELLER_HEIR));
    origin.beings.push(Resident {
        being: traveller,
        digest: quo_notation::digest(LAMP).expect("a blueprint"),
        commitment: quo_arithmetic::commitment(&origin.name, &committed),
        cells: b"a lamp's own memory".to_vec(),
    });
    origin.blueprints.push(LAMP.to_string());

    // A peer let in at that being, and its first act: a rotation onto a key
    // the granter has never seen. That is how the origin learns the way back
    // to it, and both facts travel in the cargo.
    let invitation = Invitation {
        warden: origin.name,
        commitment: quo_arithmetic::commitment(&origin.name, &pk(&seed(VOICE_HEIR))),
        padlock: origin.padlock,
        heir: pk(&seed(VOICE_HEIR)),
        heir_secret: seed(VOICE_HEIR),
        hints: vec!["https://origin.example".to_string()],
    };
    warden_grants(&mut origin, pk(&seed(0x32)), &invitation, traveller);
    let at_origin = peer.remember(&invitation);
    let (message, _) = peer
        .rotate(
            at_origin,
            &seed(0x34),
            &seed(PEER_VOICE),
            &Reach {
                being: Some(traveller),
                method: Some(lit()),
                hints: vec!["https://peer.example".to_string()],
                allowance: allowance(),
                ..Reach::default()
            },
        )
        .expect("the peer composes its first rotation");
    let verdict = origin
        .judge(&message, 0)
        .expect("the origin admits the peer");
    assert!(matches!(verdict.route, Route::Being { .. }));

    // The commitment a describe hands over, without which the peer holds no
    // material to believe this being's succession.
    peer.note(
        at_origin,
        traveller,
        quo_arithmetic::commitment(&origin.name, &committed),
    )
    .expect("the peer notes the being's commitment");

    // The destination holds the class — the digest identifies rather than
    // delivers — and a standing for the origin to spend `receive` with.
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
    warden_grants(&mut destination, pk(&seed(0x36)), &gate, public);
    let at_destination = origin.remember(&gate);

    World {
        origin,
        destination,
        peer,
        traveller,
        committed,
        at_origin,
        at_destination,
    }
}

/// Let a voice in at a being, the way a grant does: the row, the commitment to
/// its heir, and the name that commitment was minted under.
fn warden_grants(door: &mut Warden, voice: [u8; 32], invitation: &Invitation, being: [u8; 32]) {
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

/// One turn of a door that answers for itself, and the sealed answer back.
fn served(door: &mut Warden, message: &[u8], mint: Option<&[[u8; 32]; 2]>) -> Vec<u8> {
    let verdict = door.judge(message, 0).expect("a message this door admits");
    let data = door
        .answer(&verdict, mint)
        .expect("an answer this door gives");
    door.reply(&verdict.say, data, &seed(0x77))
        .expect("a sealed answer")
}

#[test]
fn xiii_a_being_is_migrated_away_and_its_peer_follows_it() {
    let mut w = world();

    // The cargo is packed under the name the first rotation gives the being,
    // so the second rotation succeeds the name the peer holds by then.
    let cargo = w
        .origin
        .pack(&w.traveller, &w.committed)
        .expect("a cargo for a being this door holds");
    assert_eq!(cargo.being, w.committed);
    assert_eq!(cargo.cells, b"a lamp's own memory");
    assert_eq!(cargo.standings.len(), 1);
    assert_eq!(
        cargo.standings[0].beings,
        vec![w.committed],
        "the row travels under the name the cargo is packed under"
    );
    assert_eq!(
        cargo.standings[0].mark, 1,
        "the replay record travels, or every spent number comes round again"
    );
    assert_eq!(
        cargo.standings[0].padlock,
        Some(w.peer.padlock),
        "the way back travels with the standing"
    );

    // Spent as an ordinary field through an ordinary standing.
    let args = warden::shape::write_record("cargo", &cargo.value()).expect("a cargo on the wire");
    let (message, _) = w
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
    let sealed = served(
        &mut w.destination,
        &message,
        Some(&[seed(MINTED_BEING), seed(MINTED_HEIR)]),
    );
    let answer = w
        .origin
        .hear(w.at_destination, &sealed)
        .expect("the destination answered the receive");
    let data = answer.data.clone().expect("receive answers a commitment");
    let commitment = match warden::shape::read_record("b32", &data).expect("a b32 answer") {
        Value::B32(key) => key,
        other => panic!("receive answered {other:?} where a commitment was due"),
    };
    let arrived_as = pk(&seed(MINTED_BEING));
    assert_eq!(
        commitment,
        quo_arithmetic::commitment(&w.destination.name, &arrived_as),
        "the answer is the commitment of the being's new name"
    );

    // The destination's half.
    let landing = w
        .destination
        .landed(&["https://landing.example".to_string()])
        .expect("a being landed here");
    assert_eq!(landing.being, arrived_as);
    assert_eq!(landing.word.being, Some(cargo.being));
    assert_eq!(landing.word.successor, Some(arrived_as));
    assert_eq!(
        landing.word.commitment,
        Some(quo_arithmetic::commitment(
            &w.destination.name,
            &pk(&seed(MINTED_HEIR))
        )),
        "the second word carries material for the succession after it"
    );
    assert_eq!(landing.peers.len(), 1);
    assert_eq!(landing.peers[0].padlock, Some(w.peer.padlock));

    // The origin's half, carrying as its next commitment the one `receive`
    // answered — the one fact it cannot invent.
    let departed = w
        .origin
        .depart(
            &w.traveller,
            &Departing {
                heir: w.committed,
                commitment,
                name: w.destination.name,
                padlock: w.destination.padlock,
                hints: vec!["https://landing.example".to_string()],
            },
        )
        .expect("the origin departs the being");
    assert_eq!(departed.word.successor, Some(w.committed));
    assert_eq!(departed.peers.len(), 1);
    assert!(
        !w.origin.beings.iter().any(|one| one.being == w.traveller),
        "every key the old warden held for this being is dead"
    );

    // The first news, signed by the being's committed heir.
    let first = w
        .origin
        .news(
            &seed(0x40),
            &Tell {
                peer: departed.peers[0].clone(),
                voice_secret: seed(TRAVELLER_HEIR),
                word: departed.word.clone(),
                seq: 1,
                allowance: allowance(),
                hints: Vec::new(),
            },
        )
        .expect("the origin composes the first news");
    let verdict = w.peer.judge(&first, 0).expect("the peer admits the news");
    w.peer
        .answer(&verdict, None)
        .expect("the peer believes the first news");
    // Believed news rewrites the row entire, and the being's own entry with
    // it: the peer now stands at the house that took the being in.
    let row = &w.peer.outbound[w.at_origin];
    assert_eq!(row.warden, w.destination.name);
    assert_eq!(row.padlock, w.destination.padlock);
    assert_eq!(row.hints, vec!["https://landing.example".to_string()]);
    assert_eq!(row.beings.get(&w.committed), Some(&commitment));

    // And the second, from the new house itself, signed by the key it
    // generated and the origin never saw. A being's succession starts the news
    // mark fresh, so it counts from one again.
    let second = w
        .destination
        .news(
            &seed(0x41),
            &Tell {
                peer: landing.peers[0].clone(),
                voice_secret: seed(MINTED_BEING),
                word: landing.word.clone(),
                seq: 1,
                allowance: allowance(),
                hints: vec!["https://landing.example".to_string()],
            },
        )
        .expect("the destination composes the second news");
    let verdict = w.peer.judge(&second, 0).expect("the peer admits the news");
    w.peer
        .answer(&verdict, None)
        .expect("the peer believes the second news");
    assert_eq!(
        w.peer.outbound[w.at_origin].beings.get(&arrived_as),
        landing.word.commitment.as_ref(),
        "the peer reaches the being by the name the destination minted"
    );

    // The whole point of the move: the peer reaches the being at its new
    // house, by that name, and hears its answer.
    let (message, _) = w
        .peer
        .ask(
            w.at_origin,
            &seed(0x42),
            &Reach {
                being: Some(arrived_as),
                method: Some(lit()),
                allowance: allowance(),
                ..Reach::default()
            },
        )
        .expect("the peer composes an ask at the new house");
    let verdict = w
        .destination
        .judge(&message, 0)
        .expect("the destination admits the peer that arrived with the cargo");
    assert_eq!(
        verdict.route,
        Route::Being {
            being: arrived_as,
            method: lit()
        },
        "the arriving standing reaches the being, and by the minted name alone"
    );
    let sealed = w
        .destination
        .reply(&verdict.say, Some(b"lit".to_vec()), &seed(0x78))
        .expect("the being answers");
    let heard = w
        .peer
        .hear(w.at_origin, &sealed)
        .expect("the peer hears the being it followed");
    assert_eq!(heard.data, Some(b"lit".to_vec()));

    // Both doors point, and neither vouches for the other: each answers only
    // with a succession it composed itself.
    assert_eq!(
        w.origin
            .moved_for(&pk(&seed(VOICE_HEIR)), &w.traveller)
            .expect("the origin points for a being it moved on"),
        Some(departed.word)
    );
    assert_eq!(
        w.destination
            .moved_for(&pk(&seed(VOICE_HEIR)), &cargo.being)
            .expect("the destination points for the name the being wore before"),
        Some(landing.word)
    );
}

#[test]
fn ix_a_stranger_may_not_push_a_being_into_a_door() {
    let mut w = world();
    let cargo = w.origin.pack(&w.traveller, &w.committed).expect("a cargo");
    let args = warden::shape::write_record("cargo", &cargo.value()).expect("a cargo on the wire");

    // A house with no standing here, speaking for the first time.
    let mut passerby = door(0x51, 0x52, 0x53);
    let at = passerby.remember(&Invitation {
        warden: w.destination.name,
        commitment: [0u8; 32],
        padlock: w.destination.padlock,
        heir: pk(&seed(0x54)),
        heir_secret: seed(0x54),
        hints: Vec::new(),
    });
    let (message, _) = passerby
        .ask(
            at,
            &seed(0x55),
            &Reach {
                method: Some(Method {
                    name: "receive".to_string(),
                    args,
                }),
                allowance: allowance(),
                ..Reach::default()
            },
        )
        .expect("a stranger can always compose");
    let verdict = w
        .destination
        .judge(&message, 0)
        .expect("a stranger is judged like anyone");
    assert!(
        w.destination
            .answer(&verdict, Some(&[seed(0x56), seed(0x57)]))
            .is_err(),
        "a door any stranger could push a being into is a door with no gate"
    );
}

#[test]
fn xiii_the_old_door_only_points_and_meets_every_other_ask_with_silence() {
    let mut w = world();
    let cargo = w.origin.pack(&w.traveller, &w.committed).expect("a cargo");
    let _ = cargo;
    w.origin
        .depart(
            &w.traveller,
            &Departing {
                heir: w.committed,
                commitment: [9u8; 32],
                name: w.destination.name,
                padlock: w.destination.padlock,
                hints: Vec::new(),
            },
        )
        .expect("the origin departs the being");

    let (message, _) = w
        .peer
        .ask(
            w.at_origin,
            &seed(0x60),
            &Reach {
                being: Some(w.traveller),
                method: Some(lit()),
                allowance: allowance(),
                ..Reach::default()
            },
        )
        .expect("the peer composes an ordinary ask");
    assert!(
        w.origin.judge(&message, 0).is_err(),
        "the old door never forwards a call and never acts for the being again"
    );
}

#[test]
fn xiii_a_key_that_is_not_the_committed_heir_departs_nothing() {
    let mut w = world();
    assert!(
        w.origin
            .depart(
                &w.traveller,
                &Departing {
                    heir: pk(&seed(0x7f)),
                    commitment: [9u8; 32],
                    name: w.destination.name,
                    padlock: w.destination.padlock,
                    hints: Vec::new(),
                },
            )
            .is_err(),
        "a key this door never committed to would compose news nobody believes"
    );
    assert!(
        w.origin.beings.iter().any(|one| one.being == w.traveller),
        "and nothing moved"
    );
}

#[test]
fn ix_a_cargo_is_packed_under_the_committed_heir_and_nothing_else() {
    let w = world();
    assert!(
        w.origin.pack(&w.traveller, &pk(&seed(0x7e))).is_err(),
        "a cargo packed under any other name would leave the destination \
         succeeding a name no peer holds a commitment for"
    );
    let cargo = w.origin.pack(&w.traveller, &w.committed).expect("a cargo");
    let bytes = warden::shape::write_record("cargo", &cargo.value()).expect("bytes");
    let again = warden::shape::read_record("cargo", &bytes).expect("a cargo read back");
    assert_eq!(
        warden::shape::write_record("cargo", &again).expect("bytes"),
        bytes,
        "a cargo crosses the wire, so two wardens packing one being must \
         produce one byte string"
    );
    let _: Value = again;
}
