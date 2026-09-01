//! What the articles compel that the corpus does not carry. `warden.json`
//! holds two vectors and this crate is the door itself, so almost everything
//! the warden promises is asserted here, from the law rather than from any
//! implementation.
//!
//! Every test is named for the article and the clause it pins, so a reader
//! can tell coverage from a test list. Every refusal is asserted as strictly
//! as every acceptance, because on the wire a refusal is the door's whole
//! answer.

#[path = "../../support/hex.rs"]
mod hex;

use hex::key;
use quo_envelope::{Allowance, Method, Say};
use quo_warden as warden;
use quo_wire::Value;
use warden::{Inbound, Outbound, Placement, Resident, Route, Standing, Warden, Word};

const DOOR_NAME_SECRET: &str = "9f21c0d5b3e64a1187ac0f3d5e2b7c48a6d10f93b27c4e58d0a1b3c5d7e9f012";
const DOOR_PADLOCK_SECRET: &str =
    "7dbcdb3088339c02378f46525bff3fe2b84515973e28f5814301a99f386e20b1";
const VOICE_SECRET: &str = "2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218ad7";
const HEIR_SECRET: &str = "1f2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218a";
const STRANGER_SECRET: &str = "3d33d3f6044552ecd30503ba772b3d4f69544da0b3a4a46bfa63b056bb191833";
const PEER_SECRET: &str = "b4c1e07a2d95386f4ea8b30c17d5296e8f0a4b3c6d7e8f90112233445566778a";
const PEER_HEIR_SECRET: &str = "6a7b8c9d0e1f2a3b4c5d6e7f8091a2b3c4d5e6f708192a3b4c5d6e7f80912a3b";
const CALLER_PADLOCK_SECRET: &str =
    "fcfabee71b7a33993cca5579e6a273ffd1c62cc1749cbf1c9049f599e44f6477";
const EPHEMERAL_SECRET: &str = "e1d2c3b4a5968778695a4b3c2d1e0f00112233445566778899aabbccddeeff01";
/// The heir the door's founding committed to for its own name, and the two
/// keys a holder rotates onto after it.
const DOOR_HEIR_SECRET: &str = "0a1b2c3d4e5f60718293a4b5c6d7e8f9001122334455667788990aabbccddeef";
const NEXT_SECRET: &str = "5c6d7e8f900a1b2c3d4e5f6071829304455667788990aabbccddeeff00112233";

/// One other class this door holds, so an estate has something in it besides
/// the public being.
const SMALL: &str = "Small\n  yes() bool\n";

fn voice() -> [u8; 32] {
    quo_arithmetic::signing_pk(&key(VOICE_SECRET))
}

fn heir() -> [u8; 32] {
    quo_arithmetic::signing_pk(&key(HEIR_SECRET))
}

fn stranger() -> [u8; 32] {
    quo_arithmetic::signing_pk(&key(STRANGER_SECRET))
}

fn peer() -> [u8; 32] {
    quo_arithmetic::signing_pk(&key(PEER_SECRET))
}

fn peer_heir() -> [u8; 32] {
    quo_arithmetic::signing_pk(&key(PEER_HEIR_SECRET))
}

fn door_heir() -> [u8; 32] {
    quo_arithmetic::signing_pk(&key(DOOR_HEIR_SECRET))
}

fn next() -> [u8; 32] {
    quo_arithmetic::signing_pk(&key(NEXT_SECRET))
}

fn caller_padlock() -> [u8; 32] {
    quo_arithmetic::sealing_pk(&key(CALLER_PADLOCK_SECRET))
}

fn small_digest() -> [u8; 32] {
    quo_notation::digest(SMALL).expect("a blueprint")
}

/// A door with its public being standing, one other being of another class,
/// and nothing granted to anyone.
fn door() -> Warden {
    let mut warden = Warden::new(
        key(DOOR_NAME_SECRET),
        key(DOOR_PADLOCK_SECRET),
        [1u8; 32],
        65_536,
        8,
    );
    warden.blueprints.push(SMALL.to_string());
    warden.beings.push(Resident {
        being: [0x40u8; 32],
        digest: small_digest(),
        commitment: [3u8; 32],
        cells: Vec::new(),
    });
    warden
}

/// Mint a voice, record that it may reach these beings, and commit to its
/// heir — which is the whole of letting someone in.
fn grant(warden: &mut Warden, voice: [u8; 32], heir: [u8; 32], beings: Vec<[u8; 32]>) {
    let commitment = quo_arithmetic::commitment(&warden.name, &heir);
    warden.inbound.push(Inbound {
        voice,
        commitment,
        minted_at: warden.name,
        beings,
        mark: 0,
        spent: Vec::new(),
        padlock: None,
        hints: Vec::new(),
    });
}

/// An outbound row: a relation this door holds with a far warden, which is
/// where news is placed.
fn relate(warden: &mut Warden, far: [u8; 32], far_heir: [u8; 32]) {
    let commitment = quo_arithmetic::commitment(&far, &far_heir);
    warden.outbound.push(Outbound {
        warden: far,
        commitment,
        padlock: [0x11u8; 32],
        voice: [0x12u8; 32],
        secret: [0x13u8; 32],
        heir: [0x14u8; 32],
        heir_secret: [0x15u8; 32],
        seq: 0,
        news: 0,
        hints: vec!["https://far.example/quo".to_string()],
        holder: None,
        beings: Default::default(),
        awaiting: Default::default(),
    });
}

fn a_say(warden: &Warden, voice: [u8; 32], seq: i64) -> Say {
    Say {
        voice,
        recipient: warden.name,
        commitment: None,
        seq,
        padlock: caller_padlock(),
        hints: vec!["https://caller.example/quo".to_string()],
        allowance: Allowance {
            time: 30_000,
            hops: 8,
        },
        being: None,
        method: None,
    }
}

fn sealed(warden: &Warden, voice_secret: &str, say: &Say) -> Vec<u8> {
    quo_envelope::seal(
        &key(voice_secret),
        &key(EPHEMERAL_SECRET),
        &warden.padlock,
        &quo_envelope::Message::Say(say.clone()),
    )
    .expect("the message seals")
}

fn method(name: &str, args: Vec<u8>) -> Method {
    Method {
        name: name.to_string(),
        args,
    }
}

/// A field's answer, read back by the notation's own rules.
fn read_answer(field: &str, bytes: &[u8]) -> Value {
    let blueprint = warden::warden_blueprint();
    let field = blueprint
        .fields
        .iter()
        .find(|held| held.name == field)
        .expect("a field the blueprint declares");
    quo_wire::decode(
        blueprint,
        field.answers.as_ref().expect("a field that answers"),
        bytes,
    )
    .expect("the answer decodes by its declared type")
}

// ---- Article IX, the warden is a being --------------------------------

#[test]
fn ix_the_public_beings_pk_is_the_wardens_own_name() {
    let door = door();
    let public = door
        .beings
        .iter()
        .find(|held| held.being == door.name)
        .expect("the public being");
    assert_eq!(public.digest, warden::warden_digest());
    assert_eq!(
        public.being,
        quo_arithmetic::signing_pk(&key(DOOR_NAME_SECRET))
    );
}

#[test]
fn ix_the_public_being_appears_in_every_estate() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);

    for asking in [voice(), stranger()] {
        let estate = door.estate_for(&asking);
        assert!(
            estate
                .classes
                .iter()
                .any(|class| class.beings.iter().any(|held| held.being == door.name)),
            "the public being is reachable by everyone, holders included"
        );
    }
}

#[test]
fn ix_limit_is_the_only_fact_a_warden_publishes_about_itself() {
    let mut door = door();
    let mut say = a_say(&door, stranger(), 1);
    say.method = Some(method("limit", Vec::new()));
    let envelope = sealed(&door, STRANGER_SECRET, &say);

    let verdict = door.judge(&envelope, 0).expect("a limit anyone may ask");
    let answered = door
        .answer(&verdict, None)
        .expect("the warden's own being answers")
        .expect("limit answers an int");
    assert_eq!(read_answer("limit", &answered), Value::Int(65_536));
}

#[test]
fn ix_an_envelope_beyond_the_limit_is_not_accepted() {
    let mut door = door();
    let say = a_say(&door, voice(), 1);
    let envelope = sealed(&door, VOICE_SECRET, &say);

    door.limit = (envelope.len() - 1) as i64;
    assert!(
        door.judge(&envelope, 0).is_err(),
        "the largest message it will accept is counted in bytes of the whole envelope"
    );
    // The limit is inclusive — and the refused message spent nothing, which
    // is what the same envelope being honoured next proves: an oversized
    // envelope is refused before the record is touched, so it neither spends
    // its number nor writes its hints into the way back. The bound binds on
    // every road, distance zero included: this one never met a socket.
    door.limit = envelope.len() as i64;
    assert!(
        door.judge(&envelope, 0).is_ok(),
        "and the limit is inclusive"
    );
}

#[test]
fn ix_receive_refuses_a_cargo_of_a_class_this_door_does_not_hold() {
    let mut door = door();
    let cargo = warden::Cargo {
        being: [0x50u8; 32],
        digest: [0x99u8; 32],
        cells: b"whatever".to_vec(),
        standings: Vec::new(),
        relations: Vec::new(),
    };
    assert!(
        door.receive(&cargo, &[0x60u8; 32], &[0x61u8; 32]).is_err(),
        "the digest identifies rather than delivers, and there is nobody it may ask"
    );
    assert_eq!(door.beings.len(), 2, "and nothing was installed");
}

#[test]
fn ix_every_list_in_a_cargo_travels_in_the_derived_order() {
    // A cargo crosses the wire, so two wardens packing one being must produce
    // one byte string. The order is derived rather than chosen: standings by
    // the voice's bytes, relations by the far warden's, beings under a standing
    // by their pk bytes, and spent numerically — all ascending. A record kept
    // in whatever order a map happens to yield differs from itself between two
    // runs, and nothing could then compare, cache or re-derive it.
    let standing = |voice: u8, beings: Vec<[u8; 32]>, spent: Vec<i64>| Standing {
        voice: [voice; 32],
        commitment: [0x71u8; 32],
        name: [0x73u8; 32],
        beings,
        mark: 9,
        spent,
        padlock: None,
        hints: Vec::new(),
    };
    let relation = |warden: u8| warden::Relation {
        warden: [warden; 32],
        commitment: [0x81u8; 32],
        padlock: [0x82u8; 32],
        voice: [0x83u8; 32],
        secret: [0x84u8; 32],
        heir: [0x85u8; 32],
        heir_secret: [0x86u8; 32],
        seq: 12,
        news: 7,
        hints: Vec::new(),
    };
    let low = standing(0x10, vec![[0x20u8; 32], [0x02u8; 32]], vec![6, 4]);
    let high = standing(0x90, vec![[0x03u8; 32]], vec![1]);
    let cargo = |standings: Vec<Standing>, relations: Vec<warden::Relation>| warden::Cargo {
        being: [0x50u8; 32],
        digest: small_digest(),
        cells: b"cells".to_vec(),
        standings,
        relations,
    };
    let scrambled = warden::shape::write_record(
        "cargo",
        &cargo(
            vec![high.clone(), low.clone()],
            vec![relation(0xa0), relation(0x30)],
        )
        .value(),
    )
    .expect("a cargo encodes");
    let ordered = warden::shape::write_record(
        "cargo",
        &cargo(vec![low, high], vec![relation(0x30), relation(0xa0)]).value(),
    )
    .expect("a cargo encodes");
    assert_eq!(
        scrambled, ordered,
        "the order the record was composed in decides nothing"
    );

    // And the order is the derived one rather than merely a stable one: what
    // comes back reads lowest first, at every level.
    let back = warden::shape::as_cargo(
        &warden::shape::read_record("cargo", &scrambled).expect("a cargo reads"),
    )
    .expect("a cargo reads");
    assert_eq!(back.standings[0].voice, [0x10u8; 32]);
    assert_eq!(back.standings[0].beings[0], [0x02u8; 32]);
    assert_eq!(back.standings[0].spent, vec![4, 6]);
    assert_eq!(back.relations[0].warden, [0x30u8; 32]);
}

#[test]
fn ix_receive_answers_the_commitment_of_the_beings_new_name() {
    let mut door = door();
    // A destination mints two keys — the one the being is named by here and
    // that one's heir — and the commitment is of the first.
    let minted = [0x60u8; 32];
    let minted_heir = [0x61u8; 32];
    let cargo = warden::Cargo {
        being: [0x50u8; 32],
        digest: small_digest(),
        cells: b"cells".to_vec(),
        standings: vec![Standing {
            voice: [0x70u8; 32],
            commitment: [0x71u8; 32],
            name: [0x73u8; 32],
            beings: vec![[0x50u8; 32]],
            mark: 9,
            spent: vec![4, 6],
            padlock: Some([0x72u8; 32]),
            hints: vec!["https://old.example/quo".to_string()],
        }],
        relations: Vec::new(),
    };
    let answered = door
        .receive(&cargo, &minted, &minted_heir)
        .expect("the class is held");
    let name = quo_arithmetic::signing_pk(&minted);
    assert_eq!(
        answered,
        quo_arithmetic::commitment(&door.name, &name),
        "the commitment is of the being's new name"
    );
    // Not of that name's heir: the origin carries this value into its first
    // news, and a peer hashes the successor against it. A commitment to the
    // heir names a key that signs nothing until the succession after this one,
    // so the news is disbelieved and the peer is left standing at a house that
    // has stopped answering.
    assert_ne!(
        answered,
        quo_arithmetic::commitment(&door.name, &quo_arithmetic::signing_pk(&minted_heir))
    );
    // And the being wears that name here, holding its own heir commitment so
    // it can be succeeded afterwards like any other.
    let held = door
        .beings
        .iter()
        .find(|one| one.being == name)
        .expect("the being stands under the name this door minted");
    assert_eq!(
        held.commitment,
        quo_arithmetic::commitment(&door.name, &quo_arithmetic::signing_pk(&minted_heir))
    );

    // The replay record travels whole: the mark and the spent numbers beneath
    // it, or a late-arriving in-window number would be judged by a window the
    // new door cannot see.
    let row = door
        .inbound
        .iter()
        .find(|row| row.voice == [0x70u8; 32])
        .expect("the standing travelled");
    assert_eq!((row.mark, row.spent.clone()), (9, vec![4, 6]));
    assert_eq!(held.cells, b"cells".to_vec());
    // **An arriving row reaches the being by the name this door minted and by
    // that name alone** (Article XIII), never also by the name the being wore
    // before: a name a door must remember for whoever might still be behind is
    // a name it can never stop remembering, and the peer that is behind is not
    // stranded, because the old door still answers `moved`.
    assert_eq!(row.beings, vec![name]);
    assert!(!row.beings.contains(&[0x50u8; 32]), "and by no other");

    // A mark that arrives in a cargo is a number that was honoured — that is
    // what a mark is — so when the mark moves past it, it belongs in the
    // window beneath as spent. A door that only moved the mark would honour
    // nine a second time here.
    let row = door
        .inbound
        .iter_mut()
        .find(|row| row.voice == [0x70u8; 32])
        .expect("the standing travelled");
    assert!(warden::spend(row, 9, 64).is_err(), "the mark itself");
    warden::spend(row, 10, 64).expect("a number above it");
    assert!(
        warden::spend(row, 9, 64).is_err(),
        "and it stays spent once the mark has moved off it"
    );
}

// ---- Article VII, amending a standing ----------------------------------

/// A standing is amended, not replaced: the warden adds a being to the row or
/// takes one away, and the holder finds it on its next describe.
#[test]
fn vii_a_standing_is_amended_not_replaced() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    let other = [0x41u8; 32];
    door.beings.push(Resident {
        being: other,
        digest: small_digest(),
        commitment: [4u8; 32],
        cells: Vec::new(),
    });

    assert!(!door.reaches(&voice(), &other));
    door.widen(&voice(), &other).expect("the warden widens");
    assert!(
        door.reaches(&voice(), &other),
        "and the holder now reaches it"
    );
    // Nothing else moved: the same row, the same commitment, the same voice.
    assert_eq!(door.inbound.len(), 1);
    assert_eq!(door.inbound[0].voice, voice());

    door.narrow(&voice(), &other).expect("the warden narrows");
    assert!(!door.reaches(&voice(), &other));
    assert!(
        door.reaches(&voice(), &[0x40u8; 32]),
        "and the being it kept is untouched"
    );
}

/// Taking the last being away is release, and there is no separate act for
/// it. What is left is a stranger, whose estate is the public being alone.
#[test]
fn vii_narrowing_the_last_being_away_is_release() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);

    door.narrow(&voice(), &[0x40u8; 32]).expect("the last one");
    assert!(door.inbound.is_empty(), "the row is gone");
    assert_eq!(
        door.estate_for(&voice()).classes.len(),
        1,
        "a released voice sees the public being and nothing else"
    );
}

/// The two refusals: a voice that stands nowhere cannot be widened, because a
/// row conjured from a widening would be a grant by another name; and a being
/// this door does not hold can never be named in a row.
#[test]
fn vii_widening_refuses_a_voice_with_no_row_and_a_being_that_does_not_stand() {
    let mut door = door();
    assert!(
        door.widen(&stranger(), &[0x40u8; 32]).is_err(),
        "a stranger has no standing to widen"
    );
    assert!(
        door.narrow(&stranger(), &[0x40u8; 32]).is_err(),
        "and none to narrow"
    );

    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    assert!(
        door.widen(&voice(), &[0x99u8; 32]).is_err(),
        "no being of that name stands here"
    );
    assert_eq!(
        door.inbound[0].beings,
        vec![[0x40u8; 32]],
        "and nothing moved"
    );
}

// ---- Article X, the describe ------------------------------------------

#[test]
fn x_an_estate_is_ordered_by_digest_then_pk() {
    let mut door = door();
    // Two more beings of the one class, deliberately out of pk order.
    for pk in [[0x90u8; 32], [0x20u8; 32]] {
        door.beings.push(Resident {
            being: pk,
            digest: small_digest(),
            commitment: [4u8; 32],
            cells: Vec::new(),
        });
    }
    grant(
        &mut door,
        voice(),
        heir(),
        vec![[0x90u8; 32], [0x40u8; 32], [0x20u8; 32]],
    );

    let estate = door.estate_for(&voice());
    let digests: Vec<[u8; 32]> = estate.classes.iter().map(|class| class.digest).collect();
    let mut sorted = digests.clone();
    sorted.sort();
    assert_eq!(digests, sorted, "classes by their digest bytes ascending");

    for class in &estate.classes {
        let pks: Vec<[u8; 32]> = class.beings.iter().map(|held| held.being).collect();
        let mut sorted = pks.clone();
        sorted.sort();
        assert_eq!(pks, sorted, "beings under each by their pk bytes ascending");
    }
}

#[test]
fn x_the_strangers_estate_is_the_wardens_own_public_being() {
    let door = door();
    let estate = door.estate_for(&stranger());
    assert_eq!(estate.classes.len(), 1);
    assert_eq!(estate.classes[0].digest, warden::warden_digest());
    assert_eq!(estate.classes[0].beings.len(), 1);
    assert_eq!(estate.classes[0].beings[0].being, door.name);
}

#[test]
fn x_every_describe_is_scoped_by_the_same_binary_record() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);

    let held = door.estate_for(&voice());
    let strange = door.estate_for(&stranger());
    assert_eq!(held.classes.len(), 2, "a holder reaches its being too");
    assert_eq!(strange.classes.len(), 1, "and a stranger does not");

    // The same record scopes the sketch and the blueprint.
    assert!(door.sketch_for(&voice(), &[0x40u8; 32]).is_ok());
    assert!(door.sketch_for(&stranger(), &[0x40u8; 32]).is_err());
    assert!(door.blueprint_for(&voice(), &small_digest()).is_ok());
    assert!(door.blueprint_for(&stranger(), &small_digest()).is_err());
}

#[test]
fn x_a_sketch_hands_back_the_pk_the_digest_and_the_commitment() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    let sketch = door
        .sketch_for(&voice(), &[0x40u8; 32])
        .expect("a being this voice reaches")
        .expect("a being this door holds");
    assert_eq!(sketch.being, [0x40u8; 32]);
    assert_eq!(sketch.digest, small_digest());
    assert_eq!(sketch.commitment, [3u8; 32]);
}

#[test]
fn x_a_blueprint_is_answered_only_where_the_asker_reaches_its_class() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    assert_eq!(
        door.blueprint_for(&voice(), &small_digest()).expect("held"),
        Some(SMALL.to_string())
    );
    assert!(
        door.blueprint_for(&stranger(), &small_digest()).is_err(),
        "otherwise silence"
    );
}

#[test]
fn x_the_wardens_own_blueprint_is_answered_to_anyone() {
    let door = door();
    assert_eq!(
        door.blueprint_for(&stranger(), &warden::warden_digest())
            .expect("the warden's own public being declares it"),
        Some(warden::WARDEN_BLUEPRINT.to_string())
    );
}

#[test]
fn x_silence_and_absence_are_two_different_answers() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);

    // Nothing has moved, so `moved` answers absence — a legal answer to a
    // legal ask.
    assert_eq!(
        door.moved_for(&voice(), &[0x40u8; 32]).expect("legal"),
        None
    );

    // A door that answered "absent" about a being you do not reach would be a
    // door confirming that being exists.
    assert!(door.moved_for(&stranger(), &[0x40u8; 32]).is_err());

    door.moved.push((
        [0x40u8; 32],
        Word {
            name: Some([0x80u8; 32]),
            padlock: Some([0x81u8; 32]),
            ..Word::default()
        },
    ));
    assert!(door
        .moved_for(&voice(), &[0x40u8; 32])
        .expect("legal")
        .is_some());
}

// ---- Article XII, the judgment ----------------------------------------

#[test]
fn xii_a_message_addressed_to_another_door_is_silence() {
    let mut door = door();
    let mut say = a_say(&door, voice(), 1);
    say.recipient = [0xeeu8; 32];
    let envelope = sealed(&door, VOICE_SECRET, &say);
    assert!(door.judge(&envelope, 0).is_err());
}

#[test]
fn xii_the_recipient_may_be_the_name_or_the_padlock() {
    let mut door = door();
    for recipient in [door.name, door.padlock] {
        let mut say = a_say(&door, stranger(), 1);
        say.recipient = recipient;
        let envelope = sealed(&door, STRANGER_SECRET, &say);
        assert!(
            door.judge(&envelope, 0).is_ok(),
            "named by whichever key the sender holds"
        );
    }
}

#[test]
fn xii_a_payload_addressed_elsewhere_never_touches_the_records() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let mut say = a_say(&door, voice(), 7);
    say.recipient = [0xeeu8; 32];
    let envelope = sealed(&door, VOICE_SECRET, &say);

    assert!(door.judge(&envelope, 0).is_err());
    assert_eq!(door.inbound[0].mark, 0, "the seq was never spent");
    assert_eq!(
        door.inbound[0].padlock, None,
        "the way back was not touched"
    );
}

#[test]
fn xii_a_voice_found_in_the_inbound_record_is_an_ask() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let envelope = sealed(&door, VOICE_SECRET, &a_say(&door, voice(), 1));
    let verdict = door.judge(&envelope, 0).expect("an ask");
    assert_eq!(verdict.place, Placement::Ask { standing: 0 });
}

#[test]
fn xii_a_voice_whose_hash_matches_a_commitment_is_a_rotation() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);

    let next = quo_arithmetic::signing_pk(&key(STRANGER_SECRET));
    let mut say = a_say(&door, heir(), 1);
    say.commitment = Some(quo_arithmetic::commitment(&door.name, &next));
    let envelope = sealed(&door, HEIR_SECRET, &say);

    let verdict = door.judge(&envelope, 0).expect("a rotation");
    assert_eq!(verdict.place, Placement::Rotation { standing: 0 });

    // The standing changes hands before anything else is judged: the pk
    // becomes the current holder, the carried commitment the new heir.
    assert_eq!(door.inbound[0].voice, heir());
    assert_eq!(
        door.inbound[0].commitment,
        quo_arithmetic::commitment(&door.name, &next)
    );
    assert_eq!(
        door.inbound[0].beings,
        vec![[0x40u8; 32]],
        "a standing is amended, never replaced"
    );
}

#[test]
fn xii_the_old_key_dies_the_moment_the_standing_changes_hands() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());

    let next = quo_arithmetic::signing_pk(&key(STRANGER_SECRET));
    let mut rotation = a_say(&door, heir(), 1);
    rotation.commitment = Some(quo_arithmetic::commitment(&door.name, &next));
    let envelope = sealed(&door, HEIR_SECRET, &rotation);
    door.judge(&envelope, 0).expect("a rotation");

    // There is one holder always. The previous key is now a stranger.
    let envelope = sealed(&door, VOICE_SECRET, &a_say(&door, voice(), 1));
    let verdict = door.judge(&envelope, 0).expect("judged as anything else");
    assert_eq!(verdict.place, Placement::Stranger);
}

#[test]
fn xii_a_voice_nowhere_is_the_strangers_case() {
    let mut door = door();
    let envelope = sealed(&door, STRANGER_SECRET, &a_say(&door, stranger(), 1));
    let verdict = door.judge(&envelope, 0).expect("a standing at nothing");
    assert_eq!(verdict.place, Placement::Stranger);
    assert_eq!(verdict.route, Route::Estate);
}

#[test]
fn xii_being_and_method_is_the_being_invoked() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    let mut say = a_say(&door, voice(), 1);
    say.being = Some([0x40u8; 32]);
    say.method = Some(method("yes", Vec::new()));
    let envelope = sealed(&door, VOICE_SECRET, &say);

    let verdict = door.judge(&envelope, 0).expect("routed to the being");
    assert_eq!(
        verdict.route,
        Route::Being {
            being: [0x40u8; 32],
            method: method("yes", Vec::new())
        }
    );
    assert!(
        door.answer(&verdict, None).is_err(),
        "a being's answer is never the warden's"
    );
}

/// Article XIII: the old door answers `moved` with the succession, and every
/// other ask meets silence. An answer's data is the field's declared answer
/// type by the notation's rules, and a succession is not that type, so the
/// word cannot be put where the caller asked for the work.
#[test]
fn xiii_the_old_door_only_points_and_the_work_ask_meets_silence() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    door.moved.push((
        [0x40u8; 32],
        Word {
            being: Some([0x40u8; 32]),
            successor: Some([0x77u8; 32]),
            commitment: Some([0x78u8; 32]),
            hints: vec!["https://elsewhere.example/quo".to_string()],
            ..Word::default()
        },
    ));

    let mut say = a_say(&door, voice(), 1);
    say.being = Some([0x40u8; 32]);
    say.method = Some(method("yes", Vec::new()));
    assert!(
        door.judge(&sealed(&door, VOICE_SECRET, &say), 0).is_err(),
        "the old door put the word where the caller asked for the work"
    );

    // The one ask it does answer about a being that left.
    let word = door
        .moved_for(&voice(), &[0x40u8; 32])
        .expect("legal")
        .expect("the succession this door published");
    assert_eq!(word.successor, Some([0x77u8; 32]));
    assert_eq!(
        word.hints,
        vec!["https://elsewhere.example/quo".to_string()]
    );
}

#[test]
fn xii_being_without_method_is_the_warden_describing_that_one_being() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    let mut say = a_say(&door, voice(), 1);
    say.being = Some([0x40u8; 32]);
    let envelope = sealed(&door, VOICE_SECRET, &say);

    let verdict = door.judge(&envelope, 0).expect("routed");
    assert_eq!(
        verdict.route,
        Route::Sketch {
            being: [0x40u8; 32]
        }
    );
    assert!(door.answer(&verdict, None).expect("the warden's").is_some());
}

#[test]
fn xii_a_being_this_voice_may_not_reach_is_silence() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let mut say = a_say(&door, voice(), 1);
    say.being = Some([0x40u8; 32]);
    let envelope = sealed(&door, VOICE_SECRET, &say);
    assert!(door.judge(&envelope, 0).is_err());
}

#[test]
fn xii_neither_being_nor_method_is_the_estate() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);
    let envelope = sealed(&door, VOICE_SECRET, &a_say(&door, voice(), 1));
    let verdict = door.judge(&envelope, 0).expect("the default ask");
    assert_eq!(verdict.route, Route::Estate, "there is no empty ask");

    let answered = door
        .answer(&verdict, None)
        .expect("the warden's answer")
        .expect("describe answers an estate");
    assert_eq!(
        answered,
        warden::encode_estate(&door.estate_for(&voice())).expect("encodes"),
        "and the describe is the warden's answer, never the being's"
    );
}

#[test]
fn xii_the_wardens_own_being_answers_to_two_addresses() {
    let mut door = door();
    let named = {
        let mut say = a_say(&door, stranger(), 1);
        say.being = Some(door.name);
        say.method = Some(method("limit", Vec::new()));
        let envelope = sealed(&door, STRANGER_SECRET, &say);
        let verdict = door.judge(&envelope, 0).expect("named");
        door.answer(&verdict, None).expect("answered")
    };
    let omitted = {
        let mut say = a_say(&door, stranger(), 2);
        say.method = Some(method("limit", Vec::new()));
        let envelope = sealed(&door, STRANGER_SECRET, &say);
        let verdict = door.judge(&envelope, 0).expect("omitted");
        door.answer(&verdict, None).expect("answered")
    };
    assert_eq!(named, omitted, "nothing here can diverge");
}

#[test]
fn xii_an_answer_is_sealed_to_the_return_padlock_and_signed_by_the_name() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let say = a_say(&door, voice(), 4);
    let envelope = sealed(&door, VOICE_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("an ask");
    let data = door.answer(&verdict, None).expect("the estate");

    let reply = door
        .reply(&verdict.say, data.clone(), &key(EPHEMERAL_SECRET))
        .expect("a reply seals");
    let read = quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), &reply)
        .expect("the caller opens what was sealed to its padlock");
    assert_eq!(read.warden, door.name, "signed by the warden's own name");
    assert_eq!(read.seq, 4, "the answer names the ask by its seq");
    assert_eq!(read.data, data);
}

#[test]
fn xii_an_ask_may_not_be_presented_as_an_answer() {
    // Step one at a door: the leading byte must say `say`, so a door never
    // reads an answer and a caller never reads an ask.
    let door = door();
    let say = a_say(&door, voice(), 1);
    let envelope = sealed(&door, VOICE_SECRET, &say);
    assert!(quo_envelope::open_at_caller(&key(DOOR_PADLOCK_SECRET), &envelope).is_err());
}

#[test]
fn xii_a_message_refused_for_its_leash_has_still_spent_the_seq() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let mut say = a_say(&door, voice(), 5);
    say.allowance = Allowance { time: 0, hops: 3 };
    let envelope = sealed(&door, VOICE_SECRET, &say);

    assert!(door.judge(&envelope, 0).is_err(), "silence");
    assert_eq!(
        door.inbound[0].mark, 5,
        "honoured means consumed, and nothing later gives it back"
    );
}

// ---- Article XI, as it bites at the door -------------------------------

#[test]
fn xi_a_plain_ask_carrying_a_commitment_is_refused() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let mut say = a_say(&door, voice(), 1);
    say.commitment = Some([0x77u8; 32]);
    let envelope = sealed(&door, VOICE_SECRET, &say);
    assert!(door.judge(&envelope, 0).is_err());
    assert_eq!(door.inbound[0].mark, 0, "and it never reached the seq");
}

#[test]
fn xi_bytes_left_in_the_blob_after_the_declared_arguments_are_refused() {
    let mut door = door();
    let mut say = a_say(&door, stranger(), 1);
    say.method = Some(method("limit", vec![0]));
    let envelope = sealed(&door, STRANGER_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("routed");
    assert!(
        door.answer(&verdict, None).is_err(),
        "the refusal is the being's, and here the warden is the being"
    );
}

#[test]
fn xi_a_method_name_no_blueprint_declares_is_refused() {
    let mut door = door();
    let mut say = a_say(&door, stranger(), 1);
    say.method = Some(method("open_sesame", Vec::new()));
    let envelope = sealed(&door, STRANGER_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("routed");
    assert!(door.answer(&verdict, None).is_err());
}

// ---- Article VII, keys, records and standings --------------------------

#[test]
fn vii_every_rotation_carries_a_fresh_commitment() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let say = a_say(&door, heir(), 1);
    let envelope = sealed(&door, HEIR_SECRET, &say);
    assert!(
        door.judge(&envelope, 0).is_err(),
        "or a standing could be taken over once and never again"
    );
    assert_eq!(door.inbound[0].voice, voice(), "and nothing changed hands");
}

#[test]
fn vii_the_way_back_is_refreshed_by_every_call_that_arrives() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let envelope = sealed(&door, VOICE_SECRET, &a_say(&door, voice(), 1));
    door.judge(&envelope, 0).expect("an ask");
    assert_eq!(door.inbound[0].padlock, Some(caller_padlock()));
    assert_eq!(
        door.inbound[0].hints,
        vec!["https://caller.example/quo".to_string()]
    );
}

#[test]
fn vii_a_card_carries_no_standing_whatsoever() {
    // Holding a card lets you seal to a door and be judged as a stranger, and
    // granting remains the only way anything is opened.
    let mut door = door();
    let mut say = a_say(&door, stranger(), 1);
    say.being = Some([0x40u8; 32]);
    let envelope = sealed(&door, STRANGER_SECRET, &say);
    assert!(door.judge(&envelope, 0).is_err());
}

#[test]
fn vii_taking_the_last_being_away_is_release() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    let estate = door.estate_for(&voice());
    assert_eq!(
        estate.classes.len(),
        1,
        "a row with no beings reaches only what everyone reaches"
    );
    assert_eq!(estate.classes[0].digest, warden::warden_digest());
}

// ---- Article VIII, the seq and the leash -------------------------------

fn fresh_standing() -> Inbound {
    Inbound {
        voice: [1u8; 32],
        commitment: [2u8; 32],
        minted_at: [3u8; 32],
        beings: Vec::new(),
        mark: 0,
        spent: Vec::new(),
        padlock: None,
        hints: Vec::new(),
    }
}

#[test]
fn viii_the_first_legal_number_is_one() {
    let mut standing = fresh_standing();
    assert!(warden::spend(&mut standing, 0, 8).is_err());
    assert!(warden::spend(&mut standing, -1, 8).is_err());
    assert!(warden::spend(&mut standing, 1, 8).is_ok());
    assert_eq!(
        standing.mark, 1,
        "a fresh standing said nothing honoured yet"
    );
}

#[test]
fn viii_above_the_mark_is_honoured_and_moves_the_mark() {
    let mut standing = fresh_standing();
    warden::spend(&mut standing, 3, 8).expect("above the mark");
    assert_eq!(standing.mark, 3);
    warden::spend(&mut standing, 9, 8).expect("above it again");
    assert_eq!(standing.mark, 9);
}

#[test]
fn viii_inside_the_window_is_honoured_once_and_never_again() {
    let mut standing = fresh_standing();
    warden::spend(&mut standing, 5, 8).expect("the mark");
    warden::spend(&mut standing, 2, 8).expect("inside the window");
    assert!(
        warden::spend(&mut standing, 2, 8).is_err(),
        "and never again"
    );
    assert!(
        warden::spend(&mut standing, 5, 8).is_err(),
        "the mark itself is spent too"
    );
}

#[test]
fn viii_below_the_window_is_silence() {
    let mut standing = fresh_standing();
    warden::spend(&mut standing, 20, 8).expect("the mark");
    assert!(warden::spend(&mut standing, 11, 8).is_err(), "below it");
    assert!(warden::spend(&mut standing, 12, 8).is_ok(), "inside it");
}

#[test]
fn viii_a_rotation_starts_the_mark_fresh() {
    let mut door = door();
    grant(&mut door, voice(), heir(), Vec::new());
    door.inbound[0].mark = 40;
    door.inbound[0].spent = vec![37];

    let next = quo_arithmetic::signing_pk(&key(STRANGER_SECRET));
    let mut say = a_say(&door, heir(), 1);
    say.commitment = Some(quo_arithmetic::commitment(&door.name, &next));
    let envelope = sealed(&door, HEIR_SECRET, &say);
    door.judge(&envelope, 0).expect("a rotation asking one");

    assert_eq!(door.inbound[0].mark, 1, "the number one is legal again");
    assert_eq!(door.inbound[0].spent, Vec::<i64>::new());
}

#[test]
fn viii_a_stranger_spends_nothing() {
    let mut door = door();
    for _ in 0..2 {
        let envelope = sealed(&door, STRANGER_SECRET, &a_say(&door, stranger(), 5));
        door.judge(&envelope, 0)
            .expect("no row, so no mark, so nothing counted");
    }
    assert!(door.inbound.is_empty());
}

#[test]
fn viii_a_time_budget_at_or_below_zero_is_silence() {
    for time in [0, -1] {
        assert!(warden::spend_leash(&Allowance { time, hops: 4 }).is_err());
    }
    assert!(warden::spend_leash(&Allowance { time: 1, hops: 4 }).is_ok());
}

#[test]
fn viii_a_hop_count_of_zero_is_a_legal_leash_and_below_zero_is_silence() {
    assert!(
        warden::spend_leash(&Allowance { time: 10, hops: 0 }).is_ok(),
        "legal for a call that goes no further"
    );
    assert!(warden::spend_leash(&Allowance { time: 10, hops: -1 }).is_err());
}

#[test]
fn viii_a_hop_count_of_zero_forbids_onward() {
    let arrived = Allowance {
        time: 1_000,
        hops: 0,
    };
    assert_eq!(
        warden::onward(&arrived, 0, 10),
        None,
        "what it forbids is onward"
    );
}

#[test]
fn viii_the_onward_leash_only_shrinks() {
    let arrived = Allowance {
        time: 1_000,
        hops: 3,
    };
    let onward = warden::onward(&arrived, 100, 150).expect("an onward ask");
    assert_eq!(onward.hops, 2, "the hop count falls by one at every door");
    assert_eq!(
        onward.time, 950,
        "the budget falls by this door's own dwell"
    );
    assert!(onward.time < arrived.time && onward.hops < arrived.hops);
}

#[test]
fn viii_the_road_is_never_counted() {
    // Two readings of one clock, taken at the ends of the judgment. Where the
    // readings sit on that clock cannot matter; only their difference can.
    let arrived = Allowance {
        time: 1_000,
        hops: 3,
    };
    assert_eq!(
        warden::onward(&arrived, 0, 50),
        warden::onward(&arrived, 8_000_000, 8_000_050)
    );
}

#[test]
fn viii_an_onward_ask_that_would_exhaust_the_budget_is_not_made() {
    let arrived = Allowance { time: 50, hops: 3 };
    assert_eq!(warden::onward(&arrived, 0, 50), None, "the budget to zero");
    assert_eq!(warden::onward(&arrived, 0, 60), None, "or below it");
    assert!(warden::onward(&arrived, 0, 49).is_some());
}

// ---- Article XIV, the news ---------------------------------------------

fn tell(word: &Word) -> Method {
    method(
        "tell",
        warden::shape::write_record("word", &word.value()).expect("a word encodes"),
    )
}

#[test]
fn xiv_news_is_the_voice_found_in_the_outbound_record() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());

    let word = Word {
        padlock: Some([0x33u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_SECRET, &say);

    let verdict = door.judge(&envelope, 0).expect("an ordinary envelope");
    assert_eq!(
        verdict.place,
        Placement::News {
            relation: 0,
            by_heir: false,
            being: None
        },
        "news is not a second kind of message"
    );
    door.answer(&verdict, None).expect("believed");
    assert_eq!(door.outbound[0].padlock, [0x33u8; 32]);
}

#[test]
fn xiv_a_padlock_replacement_is_believed_by_the_name() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());

    // Signed by the heir instead: a lock has no heir, so this is silence.
    let word = Word {
        padlock: Some([0x33u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer_heir(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
    let verdict = door
        .judge(&envelope, 0)
        .expect("placed as news by the heir");
    assert!(door.answer(&verdict, None).is_err());
    assert_eq!(
        door.outbound[0].padlock, [0x11u8; 32],
        "nothing was believed"
    );
}

#[test]
fn xiv_a_succession_is_believed_by_the_heir_it_committed() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());

    let word = Word {
        successor: Some(peer_heir()),
        commitment: Some([0x44u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer_heir(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("news by the heir");
    door.answer(&verdict, None).expect("believed");

    // Believed news rewrites the outbound row entire.
    assert_eq!(door.outbound[0].warden, peer_heir());
    assert_eq!(door.outbound[0].commitment, [0x44u8; 32]);
}

#[test]
fn xiv_a_succession_signed_by_the_name_alone_is_silence() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    let word = Word {
        successor: Some(peer_heir()),
        commitment: Some([0x44u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("news by the name");
    assert!(
        door.answer(&verdict, None).is_err(),
        "a succession must reveal a preimage"
    );
}

#[test]
fn xiv_fields_that_mean_nothing_in_a_case_are_absent_not_filled() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());

    // A successor with no commitment, and a word announcing nothing at all,
    // are both silence.
    for word in [
        Word {
            successor: Some(peer_heir()),
            ..Word::default()
        },
        Word::default(),
    ] {
        let mut say = a_say(&door, peer_heir(), 1);
        say.method = Some(tell(&word));
        let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
        let verdict = door.judge(&envelope, 0).expect("placed");
        assert!(door.answer(&verdict, None).is_err());
        door.outbound[0].news = 0;
    }
}

#[test]
fn xiv_a_word_naming_the_announcing_wardens_own_pk_is_refused() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    let word = Word {
        being: Some(peer()),
        successor: Some(peer_heir()),
        commitment: Some([0x44u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer_heir(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("placed");
    assert!(
        door.answer(&verdict, None).is_err(),
        "the name and the public being are one key"
    );
}

#[test]
fn xiv_an_empty_hints_list_means_the_road_did_not_change() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    let word = Word {
        padlock: Some([0x33u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("placed");
    door.answer(&verdict, None).expect("believed");
    assert_eq!(
        door.outbound[0].hints,
        vec!["https://far.example/quo".to_string()],
        "never an erasure"
    );
}

#[test]
fn xiv_a_name_succession_keeps_the_mark_a_beings_succession_starts_it_fresh() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    door.outbound[0].news = 0;

    let name_succession = Word {
        successor: Some(peer_heir()),
        commitment: Some([0x44u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer_heir(), 6);
    say.method = Some(tell(&name_succession));
    let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("placed");
    door.answer(&verdict, None).expect("believed");
    assert_eq!(door.outbound[0].news, 6, "the house persisted");

    // A being's succession, announced by the heir that being committed — the
    // commitment this door took from a describe and kept with `note`, never
    // the row's, which belongs to the house's name.
    door.note(
        0,
        [0x40u8; 32],
        quo_arithmetic::commitment(&peer_heir(), &peer()),
    )
    .expect("a being at that house");
    // The successor signs and the peer hashes, so the successor a word names
    // is the voice that signed it and never a third key.
    let being_succession = Word {
        being: Some([0x40u8; 32]),
        successor: Some(peer()),
        commitment: Some([0x66u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer(), 7);
    say.method = Some(tell(&being_succession));
    let envelope = sealed(&door, PEER_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("placed");
    door.answer(&verdict, None).expect("believed");
    assert_eq!(door.outbound[0].news, 0, "the news mark starts fresh");
}

/// "A peer believes it by a key it already holds, and there are only two."
/// Article XIV gives a padlock replacement exactly one signer — the warden's
/// name, which has not moved — and a door that accepted any key it managed to
/// place would let a house's committed heir replace that house's lock at every
/// peer before it had succeeded anything. Every message those peers sent next
/// would be sealed to a lock the heir chose.
#[test]
fn xiv_a_padlock_replacement_the_name_did_not_sign_is_silence() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    let held = door.outbound[0].padlock;

    let word = Word {
        padlock: Some([0x77u8; 32]),
        ..Word::default()
    };
    // Signed by the heir the far house committed: a key this door does hold,
    // placed as news, and the wrong one for this act.
    let mut say = a_say(&door, peer_heir(), 4);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("it is placed as news");
    assert!(
        door.answer(&verdict, None).is_err(),
        "a padlock replacement was believed from a key that is not the name"
    );
    assert_eq!(door.outbound[0].padlock, held, "the lock did not move");

    // The name signs the same word, and it is believed.
    let mut say = a_say(&door, peer(), 5);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("placed");
    door.answer(&verdict, None).expect("believed");
    assert_eq!(door.outbound[0].padlock, [0x77u8; 32]);
}

/// "The successor signs and the peer hashes." A word naming a successor the
/// signer is not proves nothing about that key, and believing it would let a
/// committed heir hand the whole relation to a third party it chose.
#[test]
fn xiv_a_succession_the_successor_did_not_sign_is_silence() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    let held = door.outbound[0].warden;

    let word = Word {
        successor: Some([0x66u8; 32]),
        commitment: Some([0x44u8; 32]),
        ..Word::default()
    };
    // Signed by the heir that was committed, which is the right road — and
    // naming somebody else as the successor, which is the wrong key.
    let mut say = a_say(&door, peer_heir(), 6);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("it is placed as news");
    assert!(
        door.answer(&verdict, None).is_err(),
        "a relation was handed to a key that never signed for it"
    );
    assert_eq!(door.outbound[0].warden, held, "the relation did not move");
}

/// A describe hands back a commitment per being, and a peer that means to
/// believe that being's succession keeps it. The row's own commitment belongs
/// to the house's name; a door that hashed a being's successor against it
/// would let the house's committed heir succeed every being at that house.
#[test]
fn xiv_a_beings_succession_is_believed_against_that_beings_own_commitment() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    let being = [0x40u8; 32];
    // The being's own heir is a third key, and the far house committed to it
    // for that being alone.
    door.note(0, being, quo_arithmetic::commitment(&peer(), &next()))
        .expect("a being at that house");

    // The house's committed heir announces the being's succession. It is a
    // key this door holds, placed as news, and the wrong one for this act.
    let word = Word {
        being: Some(being),
        successor: Some(peer_heir()),
        commitment: Some([0x44u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer_heir(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_HEIR_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("it is placed as news");
    assert!(
        door.answer(&verdict, None).is_err(),
        "the house's heir succeeded a being it was never committed to"
    );
    assert_eq!(
        door.outbound[0].beings.get(&being),
        Some(&quo_arithmetic::commitment(&peer(), &next())),
        "and the being did not move"
    );

    // The being's own committed heir announces the same succession, and it is
    // believed: the entry moves to the successor with the next commitment,
    // and the row's own commitment is untouched.
    let held = door.outbound[0].commitment;
    let word = Word {
        being: Some(being),
        successor: Some(next()),
        commitment: Some([0x55u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, next(), 2);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, NEXT_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("placed");
    door.answer(&verdict, None).expect("believed");
    assert!(
        !door.outbound[0].beings.contains_key(&being),
        "the being no longer answers by the name it wore"
    );
    assert_eq!(door.outbound[0].beings.get(&next()), Some(&[0x55u8; 32]));
    assert_eq!(
        door.outbound[0].commitment, held,
        "the house's own commitment is not a being's"
    );
    assert_eq!(door.outbound[0].warden, peer(), "and neither is its name");
}

/// The other direction, and it is the more dangerous one: a being's committed
/// heir announcing the house's own succession would take the whole relation —
/// every other being at it included — on a commitment that was only ever
/// about one being.
#[test]
fn xiv_a_beings_heir_may_not_succeed_the_house_itself() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    door.note(
        0,
        [0x40u8; 32],
        quo_arithmetic::commitment(&peer(), &next()),
    )
    .expect("a being at that house");
    let held = door.outbound[0].warden;

    let word = Word {
        successor: Some(next()),
        commitment: Some([0x55u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, next(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, NEXT_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("it is placed as news");
    assert!(
        door.answer(&verdict, None).is_err(),
        "a being's heir moved the house's name"
    );
    assert_eq!(door.outbound[0].warden, held, "the house did not move");
}

/// A being this door holds no commitment for has no road of belief at all:
/// its heir is a key found nowhere, so the message is a stranger's rather
/// than news, and a stranger announces nothing.
#[test]
fn xiv_a_succession_of_a_being_this_door_never_noted_is_not_news() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());

    let word = Word {
        being: Some([0x40u8; 32]),
        successor: Some(next()),
        commitment: Some([0x55u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, next(), 1);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, NEXT_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("placed");
    assert_eq!(
        verdict.place,
        Placement::Stranger,
        "a voice found nowhere is a stranger, whatever its word says"
    );
    assert!(
        door.answer(&verdict, None).is_err(),
        "and a stranger cannot announce news"
    );
}

/// A note is the commitment a describe published for one being, and the far
/// house's own pk is not one: its commitment is the row's, and a second copy
/// under the beings would be a second place to believe one succession from.
#[test]
fn xiv_a_note_naming_the_far_wardens_own_pk_is_refused() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    assert!(door.note(0, peer(), [0x44u8; 32]).is_err());
    assert!(door.note(7, [0x40u8; 32], [0x44u8; 32]).is_err());
    assert!(door.outbound[0].beings.is_empty());
}

#[test]
fn xiv_news_is_counted_too() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    let word = Word {
        padlock: Some([0x33u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer(), 4);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_SECRET, &say);
    door.judge(&envelope, 0).expect("counted against the mark");
    assert_eq!(door.outbound[0].news, 4);
    assert!(
        door.judge(&envelope, 0).is_err(),
        "a number that does not rise is silence"
    );
}

/// "the mark kept for that far warden's news, split from `seq`, the count of
/// what this door sends, **because one field cannot be two counters**."
#[test]
fn xiv_the_news_mark_and_the_send_count_are_two_counters() {
    let mut door = door();
    relate(&mut door, peer(), peer_heir());
    // This door has sent that peer nine asks. Nothing about that number is a
    // statement about what the peer has said to this door.
    door.outbound[0].seq = 9;

    let word = Word {
        padlock: Some([0x33u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer(), 4);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_SECRET, &say);
    door.judge(&envelope, 0)
        .expect("news numbered below this door's own send count still rises");

    assert_eq!(door.outbound[0].news, 4, "the news mark took the number");
    assert_eq!(
        door.outbound[0].seq, 9,
        "and the count of what this door sends did not move"
    );

    // The other direction: the send count rising does not silence the peer.
    door.outbound[0].seq = 40;
    let word = Word {
        padlock: Some([0x34u8; 32]),
        ..Word::default()
    };
    let mut say = a_say(&door, peer(), 5);
    say.method = Some(tell(&word));
    let envelope = sealed(&door, PEER_SECRET, &say);
    door.judge(&envelope, 0)
        .expect("the peer's next number is judged against the news mark alone");
    assert_eq!(door.outbound[0].news, 5);
}

// ---- Article XIV, the name's own succession ---------------------------

/// A door whose own heir commitment is real, so its name can actually move.
fn succeeding_door() -> Warden {
    let name = quo_arithmetic::signing_pk(&key(DOOR_NAME_SECRET));
    Warden::new(
        key(DOOR_NAME_SECRET),
        key(DOOR_PADLOCK_SECRET),
        quo_arithmetic::commitment(&name, &door_heir()),
        65_536,
        8,
    )
}

/// "The heir the founding committed to is the only key that may spend", and
/// "the public being's pk is the warden's name, so it moves with it."
#[test]
fn xiv_the_name_moves_only_to_the_heir_the_founding_committed_to() {
    let mut door = succeeding_door();
    let was = door.name;

    assert!(
        door.succeed(key(STRANGER_SECRET), [0x77u8; 32]).is_err(),
        "a key that was never committed does not take the name"
    );
    assert_eq!(door.name, was, "and nothing moved");

    door.succeed(key(DOOR_HEIR_SECRET), [0x77u8; 32])
        .expect("the committed heir spends");
    assert_eq!(door.name, door_heir());
    let public = door
        .beings
        .iter()
        .find(|held| held.being == door.name)
        .expect("the public being moved with the name");
    assert_eq!(
        public.commitment, [0x77u8; 32],
        "and it commits to what comes next"
    );
    assert!(
        !door.beings.iter().any(|held| held.being == was),
        "no door keeps a retired name alive"
    );
}

/// "Every heir commitment was hashed under the name the door had then, so a
/// door stores the name each was minted at and keeps verifying it there."
#[test]
fn xiv_a_name_succession_keeps_the_standings() {
    let mut door = succeeding_door();
    let public = door.name;
    grant(&mut door, voice(), heir(), vec![public]);
    let was = door.name;

    door.succeed(key(DOOR_HEIR_SECRET), [0x77u8; 32])
        .expect("the committed heir spends");
    assert_ne!(door.name, was);

    // The holder has not heard the news, so it mints its next commitment
    // under the name it still believes. The standing was filed under that
    // name, so this rotation is judged and accepted.
    let mut say = a_say(&door, heir(), 1);
    say.commitment = Some(quo_arithmetic::commitment(&was, &next()));
    let envelope = sealed(&door, HEIR_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("an older standing rotates");
    assert!(matches!(verdict.place, Placement::Rotation { .. }));
}

/// "So a holder that rotates before hearing the news succeeds once, and must
/// hear it before rotating again."
#[test]
fn xiv_a_holder_behind_the_news_succeeds_once_and_no_more() {
    let mut door = succeeding_door();
    let public = door.name;
    grant(&mut door, voice(), heir(), vec![public]);
    let was = door.name;
    door.succeed(key(DOOR_HEIR_SECRET), [0x77u8; 32])
        .expect("the committed heir spends");

    // The commitment it carries is filed under the door's current name, not
    // the retired one it was hashed under.
    let mut say = a_say(&door, heir(), 1);
    say.commitment = Some(quo_arithmetic::commitment(&was, &next()));
    let envelope = sealed(&door, HEIR_SECRET, &say);
    door.judge(&envelope, 0).expect("the one succession");

    // So the rotation after it does not match, and that is silence like every
    // other refusal.
    let mut say = a_say(&door, next(), 2);
    say.commitment = Some([0x88u8; 32]);
    let envelope = sealed(&door, NEXT_SECRET, &say);
    let verdict = door
        .judge(&envelope, 0)
        .expect("judged as a stranger would be");
    assert!(
        matches!(verdict.place, Placement::Stranger),
        "the second rotation is nobody"
    );

    // Hearing the news is what ends it: a holder that mints under the name
    // the door has now keeps rotating.
    let mut door = succeeding_door();
    let public = door.name;
    grant(&mut door, voice(), heir(), vec![public]);
    door.succeed(key(DOOR_HEIR_SECRET), [0x77u8; 32])
        .expect("the committed heir spends");
    let now = door.name;
    let mut say = a_say(&door, heir(), 1);
    say.commitment = Some(quo_arithmetic::commitment(&now, &next()));
    let envelope = sealed(&door, HEIR_SECRET, &say);
    door.judge(&envelope, 0).expect("the rotation stands");

    let mut say = a_say(&door, next(), 2);
    say.commitment = Some([0x88u8; 32]);
    let envelope = sealed(&door, NEXT_SECRET, &say);
    let verdict = door.judge(&envelope, 0).expect("and so does the next one");
    assert!(matches!(verdict.place, Placement::Rotation { .. }));
}

/// The name a commitment was minted at travels with the standing, so a
/// migrated standing still verifies an older commitment at the door that
/// granted it — which is the whole reason `standing.name` is on the wire.
#[test]
fn xiv_a_migrating_standing_carries_the_name_it_was_minted_at() {
    let mut door = succeeding_door();
    door.blueprints.push(SMALL.to_string());
    let granted_at = [0x6au8; 32];
    let cargo = warden::Cargo {
        being: [0x40u8; 32],
        digest: small_digest(),
        cells: Vec::new(),
        standings: vec![Standing {
            voice: voice(),
            commitment: quo_arithmetic::commitment(&granted_at, &heir()),
            name: granted_at,
            beings: vec![[0x40u8; 32]],
            mark: 0,
            spent: Vec::new(),
            padlock: None,
            hints: Vec::new(),
        }],
        relations: Vec::new(),
    };
    door.receive(&cargo, &[0x99u8; 32], &[0x98u8; 32])
        .expect("the class is held");
    assert_eq!(
        door.inbound[0].minted_at, granted_at,
        "the name the commitment was minted at travelled with the row"
    );
    assert_ne!(
        granted_at, door.name,
        "and it is not this door's own name, or the case proves nothing"
    );
}

/// Where the refresh falls decides two things a door would otherwise get
/// wrong, and both are consequences of the placement rather than choices.
#[test]
fn xii_the_way_back_is_refreshed_between_the_seq_and_the_leash() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);

    let live = [0x41u8; 32];
    let retired = [0x42u8; 32];
    let late = [0x43u8; 32];

    let mut say = a_say(&door, voice(), 5);
    say.padlock = live;
    door.judge(&sealed(&door, VOICE_SECRET, &say), 0)
        .expect("an ordinary ask");
    assert_eq!(door.inbound[0].padlock, Some(live));

    // Not earlier than the seq: a replayed message carries whatever way back
    // the peer had when it was sent, and the seq is the only thing that tells
    // a replay from a call. A door that refreshed first would let anyone
    // holding a copy overwrite a live way back with a retired one.
    let mut replay = a_say(&door, voice(), 5);
    replay.padlock = retired;
    assert!(door
        .judge(&sealed(&door, VOICE_SECRET, &replay), 0)
        .is_err());
    assert_eq!(
        door.inbound[0].padlock,
        Some(live),
        "a refused replay rewrote the way back"
    );

    // And not later than the leash: a message refused for its leash still
    // arrived and still spent its number. A door that refreshed only what it
    // went on to route would slowly lose the way back to any peer whose calls
    // it keeps refusing — and news is what that peer would stop receiving.
    let mut leashed = a_say(&door, voice(), 6);
    leashed.padlock = late;
    leashed.allowance = Allowance { time: 0, hops: 4 };
    assert!(door
        .judge(&sealed(&door, VOICE_SECRET, &leashed), 0)
        .is_err());
    assert_eq!(
        door.inbound[0].padlock,
        Some(late),
        "refused for its leash, and the way back stood still"
    );
}

/// Article VII's mirror of Article XIV: an arriving call whose hints list is
/// empty means the road did not change, never an erasure. An end that
/// publishes nothing — the dialing end always — sends empty hints by nature,
/// and a door that erased on that would destroy its own way back to that peer
/// on the peer's first ask.
#[test]
fn vii_an_arriving_call_with_empty_hints_leaves_the_way_back_standing() {
    let mut door = door();
    grant(&mut door, voice(), heir(), vec![[0x40u8; 32]]);

    let say = a_say(&door, voice(), 1);
    door.judge(&sealed(&door, VOICE_SECRET, &say), 0)
        .expect("an ordinary ask");
    assert_eq!(
        door.inbound[0].hints,
        vec!["https://caller.example/quo".to_string()]
    );

    let mut empty = a_say(&door, voice(), 2);
    empty.hints = Vec::new();
    door.judge(&sealed(&door, VOICE_SECRET, &empty), 0)
        .expect("an ordinary ask");
    assert_eq!(
        door.inbound[0].hints,
        vec!["https://caller.example/quo".to_string()],
        "an empty hints list erased the way back"
    );
}

// ---- the caller side, and accept --------------------------------------

const HOLDER_NAME_SECRET: &str = "41a1b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff";
const HOLDER_PADLOCK_SECRET: &str =
    "42b2c3d4e5f60718293a4b5c6d7e8f90112233445566778899aabbccddeeff01";
const FRESH_VOICE_SECRET: &str = "5111223344556677889900aabbccddeeff112233445566778899aabbccddeeff";
const FRESH_HEIR_SECRET: &str = "52223344556677889900aabbccddeeff112233445566778899aabbccddeeff01";

/// A holder's own door: it grants nothing and holds nothing, it only calls.
fn holder() -> Warden {
    Warden::new(
        key(HOLDER_NAME_SECRET),
        key(HOLDER_PADLOCK_SECRET),
        [9u8; 32],
        65_536,
        8,
    )
}

/// The invitation a door with a standing committed to `heir()` corresponds
/// to: the five things a holder holds.
fn invitation(granter: &Warden) -> warden::Invitation {
    warden::Invitation {
        warden: granter.name,
        commitment: quo_arithmetic::commitment(&granter.name, &heir()),
        padlock: granter.padlock,
        heir: heir(),
        heir_secret: key(HEIR_SECRET),
        hints: Vec::new(),
    }
}

/// "A kit that can only answer a call is half a kit." This is the whole of
/// making one: keep the invitation, compose, and open what comes back.
#[test]
fn the_caller_side_stands_in_the_kit() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();

    let at = holder.remember(&invitation(&granter));
    let fresh = quo_arithmetic::signing_pk(&key(FRESH_VOICE_SECRET));
    let (rotated, seq) = holder
        .rotate(
            at,
            &key(EPHEMERAL_SECRET),
            &key(FRESH_VOICE_SECRET),
            &warden::Reach::default(),
        )
        .expect("it composes");
    assert_eq!(seq, 1);

    let verdict = granter.judge(&rotated, 0).expect("the heir rotates");
    assert!(matches!(verdict.place, Placement::Rotation { .. }));

    // The row moved onto the heir it was handed and committed to the fresh
    // key beside it, under the same act as the composing.
    assert_eq!(holder.outbound[at].voice, heir());
    assert_eq!(holder.outbound[at].heir, fresh);

    // And the answer opens under this ground's own padlock, matched to the
    // door it asked.
    let data = granter.answer(&verdict, None).expect("the estate");
    let reply = granter
        .reply(&verdict.say, data, &[0x31u8; 32])
        .expect("it seals");
    let heard = holder.hear(at, &reply).expect("the answer opens");
    assert_eq!(heard.seq, seq);
    assert_eq!(heard.warden, granter.name);
}

/// A rotation is signed by the heir, never by the voice. On a first rotation
/// the two are the same key, because an invitation hands one out as both; on
/// every rotation after they differ, and signing with the voice would present
/// a standing's current holder as its own heir.
#[test]
fn a_second_rotation_is_signed_by_the_heir_and_not_by_the_voice() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();
    let at = holder.remember(&invitation(&granter));

    for (ephemeral, next) in [
        ([0x61u8; 32], key(FRESH_VOICE_SECRET)),
        ([0x62u8; 32], key(FRESH_HEIR_SECRET)),
    ] {
        let (composed, _) = holder
            .rotate(at, &ephemeral, &next, &warden::Reach::default())
            .expect("it composes");
        let verdict = granter.judge(&composed, 0).expect("it is a rotation");
        assert!(matches!(verdict.place, Placement::Rotation { .. }));
    }

    // Two rotations in, the standing stands on the key drawn first and
    // commits to the key drawn second.
    assert_eq!(
        granter.inbound[0].voice,
        quo_arithmetic::signing_pk(&key(FRESH_VOICE_SECRET))
    );
    assert_eq!(
        granter.inbound[0].commitment,
        quo_arithmetic::commitment(
            &granter.name,
            &quo_arithmetic::signing_pk(&key(FRESH_HEIR_SECRET))
        )
    );
}

/// "An invitation is spent, not held": accept costs two rotate-and-asks, and
/// forgetting the second is the mistake the helper makes unmakeable.
#[test]
fn accept_spends_an_invitation_whole_and_the_granters_keys_die() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();

    let mut sent = 0;
    let taken = holder
        .accept(
            &invitation(&granter),
            &warden::Accepting {
                voice_secret: key(FRESH_VOICE_SECRET),
                heir_secret: key(FRESH_HEIR_SECRET),
                ephemeral: [[0x71u8; 32], [0x72u8; 32]],
                being: None,
                method: None,
                allowance: Allowance {
                    time: 5_000,
                    hops: 8,
                },
                hints: Vec::new(),
            },
            |envelope| {
                sent += 1;
                granter.judge(envelope, 0).expect("both are judged");
                None
            },
        )
        .expect("the invitation is spent");

    assert_eq!(sent, 2, "two rotate-and-asks, never one");
    let voice_now = quo_arithmetic::signing_pk(&key(FRESH_VOICE_SECRET));
    let heir_now = quo_arithmetic::signing_pk(&key(FRESH_HEIR_SECRET));
    assert_eq!(taken.voice, voice_now);
    assert_eq!(taken.heir, heir_now);

    // The granting door's standing stands on a key the granter has never
    // seen, which is the whole point of paying for the second rotation.
    assert_eq!(granter.inbound[0].voice, voice_now);
    assert_eq!(
        granter.inbound[0].commitment,
        quo_arithmetic::commitment(&granter.name, &heir_now)
    );
    assert_eq!(taken.commitment, granter.inbound[0].commitment);

    // Every key the granter ever held for this standing is dead: it minted
    // the invitation's voice and its heir and has seen both.
    for secret in [VOICE_SECRET, HEIR_SECRET] {
        let mut say = a_say(&granter, quo_arithmetic::signing_pk(&key(secret)), 90);
        say.recipient = granter.name;
        let envelope = sealed(&granter, secret, &say);
        let verdict = granter.judge(&envelope, 0).expect("judged");
        assert!(
            matches!(verdict.place, Placement::Stranger),
            "a key the granter held still reaches the standing"
        );
    }
}

/// The helper exists so no caller forgets the second rotation, not so the
/// steps become unreachable. Walked by hand, they reach the same place.
#[test]
fn accept_is_remember_and_rotate_composed_and_that_path_stays_open() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();

    let at = holder.remember(&invitation(&granter));
    for (ephemeral, next) in [
        ([0x81u8; 32], key(FRESH_VOICE_SECRET)),
        ([0x82u8; 32], key(FRESH_HEIR_SECRET)),
    ] {
        let (composed, _) = holder
            .rotate(at, &ephemeral, &next, &warden::Reach::default())
            .expect("it composes");
        granter.judge(&composed, 0).expect("judged");
    }

    assert_eq!(
        granter.inbound[0].voice,
        quo_arithmetic::signing_pk(&key(FRESH_VOICE_SECRET))
    );
    assert_eq!(
        granter.inbound[0].commitment,
        quo_arithmetic::commitment(
            &granter.name,
            &quo_arithmetic::signing_pk(&key(FRESH_HEIR_SECRET))
        )
    );
}

// ---- the awaiting record, and the numbers a caller chooses ---------------

/// Article XII's fourth check on an answer: an ask must be awaiting under that
/// padlock, that warden and that seq. An answer nothing awaits is the same
/// silence as every other failure, and hearing one spends the record, so the
/// same bytes never answer twice.
#[test]
fn xii_an_answer_nothing_awaits_is_silence() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();
    let at = holder.remember(&invitation(&granter));

    let (composed, seq) = holder
        .rotate(
            at,
            &key(EPHEMERAL_SECRET),
            &key(FRESH_VOICE_SECRET),
            &warden::Reach::default(),
        )
        .expect("it composes");
    assert_eq!(holder.outbound[at].awaiting.len(), 1);

    let verdict = granter.judge(&composed, 0).expect("the heir rotates");
    let data = granter.answer(&verdict, None).expect("the estate");
    let reply = granter
        .reply(&verdict.say, data, &[0x33u8; 32])
        .expect("it seals");

    assert_eq!(holder.hear(at, &reply).expect("it is heard").seq, seq);
    assert!(holder.outbound[at].awaiting.is_empty());
    // The very same bytes: well-formed, well-signed, from the door that was
    // asked, and silence, because nothing awaits them.
    assert!(
        holder.hear(at, &reply).is_err(),
        "an answer already heard was heard a second time"
    );
}

/// "A caller does not put a second ask on a road while an awaiting one would
/// make the two answers indistinguishable; its own kit refuses to send it."
/// The shape that makes it real is a rotation, which starts the far door's
/// mark fresh and so brings a number the caller is awaiting round again.
#[test]
fn xii_two_asks_whose_answers_could_not_be_told_apart() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();
    let at = holder.remember(&invitation(&granter));

    let opening = warden::Reach {
        seq: Some(1),
        ..warden::Reach::default()
    };
    holder
        .rotate(at, &[0x91u8; 32], &key(FRESH_VOICE_SECRET), &opening)
        .expect("the first opens at one");
    assert!(
        holder
            .rotate(at, &[0x92u8; 32], &key(FRESH_HEIR_SECRET), &opening)
            .is_err(),
        "two asks went out whose answers could not be told apart"
    );

    // Forgoing is the caller saying it has stopped waiting, and the number is
    // free to come round again.
    assert!(holder.forgo(at, 1));
    assert!(!holder.forgo(at, 1));
    holder
        .rotate(at, &[0x92u8; 32], &key(FRESH_HEIR_SECRET), &opening)
        .expect("the number is free again");
}

/// Article VIII: "Which number a caller opens with, above one, is the
/// caller's own." A fresh mark is empty, so every number at or above one
/// stands above it — and a kit that always counted from one would be keeping
/// a choice the law gives away.
#[test]
fn viii_a_caller_chooses_which_number_it_opens_with() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();
    let at = holder.remember(&invitation(&granter));

    let (composed, seq) = holder
        .rotate(
            at,
            &key(EPHEMERAL_SECRET),
            &key(FRESH_VOICE_SECRET),
            &warden::Reach {
                seq: Some(4_096),
                ..warden::Reach::default()
            },
        )
        .expect("it composes");
    assert_eq!(seq, 4_096);
    let verdict = granter.judge(&composed, 0).expect("the door honours it");
    assert!(matches!(verdict.place, Placement::Rotation { .. }));
    assert_eq!(granter.inbound[0].mark, 4_096);

    // And the row counts on from there, because per voice the number only
    // rises. A number it has already spent is refused here rather than met
    // with silence at the far door.
    assert!(
        holder
            .ask(
                at,
                &[0x94u8; 32],
                &warden::Reach {
                    seq: Some(4_096),
                    ..warden::Reach::default()
                }
            )
            .is_err(),
        "a number this relation had already spent went out again"
    );
    let (_, next) = holder
        .ask(at, &[0x95u8; 32], &warden::Reach::default())
        .expect("it composes");
    assert_eq!(next, 4_097);
}

/// Accept hands its opening answer back sealed rather than judging it, so it
/// stops awaiting that one — leaving awaiting exactly the ask it hands the
/// caller an answer to.
#[test]
fn accept_leaves_awaiting_only_the_ask_it_hands_an_answer_back_for() {
    let mut granter = door();
    let public = granter.name;
    grant(&mut granter, voice(), heir(), vec![public]);
    let mut holder = holder();

    let taken = holder
        .accept(
            &invitation(&granter),
            &warden::Accepting {
                voice_secret: key(FRESH_VOICE_SECRET),
                heir_secret: key(FRESH_HEIR_SECRET),
                ephemeral: [[0xa1u8; 32], [0xa2u8; 32]],
                being: None,
                method: None,
                allowance: Allowance {
                    time: 5_000,
                    hops: 8,
                },
                hints: Vec::new(),
            },
            |envelope| {
                let verdict = granter.judge(envelope, 0).expect("both are judged");
                let data = granter.answer(&verdict, None).expect("the estate");
                granter.reply(&verdict.say, data, &[0xa3u8; 32]).ok()
            },
        )
        .expect("the invitation is spent");

    assert_eq!(holder.outbound[taken.at].awaiting.len(), 1);
    let reply = taken.answer.clone().expect("the road answered");
    assert_eq!(
        holder.hear(taken.at, &reply).expect("it is heard").seq,
        taken.seq
    );
    assert!(holder.outbound[taken.at].awaiting.is_empty());
}
