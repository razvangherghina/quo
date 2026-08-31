//! What Article XI compels that the corpus does not carry, and the one step of
//! Article XII the envelope's own doors stand on. Every case here is read from
//! the law rather than from any implementation.

#[path = "../../support/hex.rs"]
mod hex;

use envelope::{Allowance, Answer, Message, Method, Say};
use hex::key;
use quo_envelope as envelope;

const VOICE_SECRET: &str = "2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218ad7";
const WARDEN_SECRET: &str = "1f2ebd74bd564a8771fa628b28308c588588f5c0d0db17ae06b045b896d8218a";
const PADLOCK_SECRET: &str = "7dbcdb3088339c02378f46525bff3fe2b84515973e28f5814301a99f386e20b1";
const EPHEMERAL_SECRET: &str = "fcfabee71b7a33993cca5579e6a273ffd1c62cc1749cbf1c9049f599e44f6477";
const OTHER_EPHEMERAL: &str = "3d33d3f6044552ecd30503ba772b3d4f69544da0b3a4a46bfa63b056bb191833";

fn a_say() -> Say {
    let voice = quo_arithmetic::signing_pk(&key(VOICE_SECRET));
    Say {
        voice,
        recipient: [7u8; 32],
        commitment: None,
        seq: 1,
        padlock: [9u8; 32],
        hints: vec!["https://caller.example/quo".to_string()],
        allowance: Allowance {
            time: 30_000,
            hops: 8,
        },
        being: None,
        method: Some(Method {
            name: "items".to_string(),
            args: Vec::new(),
        }),
    }
}

fn an_answer() -> Answer {
    Answer {
        warden: quo_arithmetic::signing_pk(&key(WARDEN_SECRET)),
        seq: 1,
        data: Some(b"yes".to_vec()),
    }
}

/// The two shapes this crate hands the wire are the notation Article XI
/// writes, and they are already canonical — a shape with a second legal
/// spelling would be a second identity for the record.
#[test]
fn the_two_shapes_are_canonical_notation() {
    for text in [envelope::SAY_SHAPE, envelope::ANSWER_SHAPE] {
        let blueprint = quo_notation::parse(text).expect("the shape parses");
        assert_eq!(blueprint.canonical(), text);
    }
}

#[test]
fn nothing_is_outside_the_seal_but_the_ephemeral_key() {
    let message = Message::Say(a_say());
    let padlock = quo_arithmetic::sealing_pk(&key(PADLOCK_SECRET));
    let sealed = envelope::seal(
        &key(VOICE_SECRET),
        &key(EPHEMERAL_SECRET),
        &padlock,
        &message,
    )
    .expect("it seals");
    let inside = envelope::payload(&message).expect("the payload").len()
        + envelope::SIGNATURE
        + quo_arithmetic::TAG;
    assert_eq!(sealed.len(), envelope::KEY + inside);
    assert_eq!(
        &sealed[..envelope::KEY],
        &quo_arithmetic::sealing_pk(&key(EPHEMERAL_SECRET))[..]
    );
}

/// Fresh on every message, belonging to no one: the same say under two
/// ephemeral secrets is two different envelopes, and both open.
#[test]
fn the_ephemeral_key_is_fresh_on_every_message() {
    let message = Message::Say(a_say());
    let padlock = quo_arithmetic::sealing_pk(&key(PADLOCK_SECRET));
    let one = envelope::seal(
        &key(VOICE_SECRET),
        &key(EPHEMERAL_SECRET),
        &padlock,
        &message,
    )
    .expect("it seals");
    let other = envelope::seal(
        &key(VOICE_SECRET),
        &key(OTHER_EPHEMERAL),
        &padlock,
        &message,
    )
    .expect("it seals");
    assert_ne!(one, other);
    assert_eq!(
        envelope::open(&key(PADLOCK_SECRET), &one),
        Ok(message.clone())
    );
    assert_eq!(envelope::open(&key(PADLOCK_SECRET), &other), Ok(message));
}

/// The answer mirrors the ask: the same envelope, the warden's signature as
/// the last sixty-four bytes inside the seal.
#[test]
fn an_answer_rides_the_same_envelope_as_an_ask() {
    let message = Message::Answer(an_answer());
    let padlock = quo_arithmetic::sealing_pk(&key(PADLOCK_SECRET));
    let sealed = envelope::seal(
        &key(WARDEN_SECRET),
        &key(EPHEMERAL_SECRET),
        &padlock,
        &message,
    )
    .expect("it seals");
    assert_eq!(envelope::open(&key(PADLOCK_SECRET), &sealed), Ok(message));
    assert_eq!(
        envelope::open_at_caller(&key(PADLOCK_SECRET), &sealed),
        Ok(an_answer())
    );
    assert!(envelope::open_at_door(&key(PADLOCK_SECRET), &sealed).is_err());
}

/// An answer is verified against the `warden` its own record carries, and the
/// match to the door that was asked is a separate check.
#[test]
fn an_answer_is_verified_at_its_own_warden_and_matched_to_the_door_separately() {
    let warden = quo_arithmetic::signing_pk(&key(WARDEN_SECRET));
    let padlock = quo_arithmetic::sealing_pk(&key(PADLOCK_SECRET));
    let sealed = envelope::seal(
        &key(WARDEN_SECRET),
        &key(EPHEMERAL_SECRET),
        &padlock,
        &Message::Answer(an_answer()),
    )
    .expect("it seals");

    assert_eq!(
        envelope::read_answer(&key(PADLOCK_SECRET), &sealed, &warden),
        Ok(an_answer())
    );

    // Signed perfectly by the house that sent it, and still not an answer to
    // this caller's question: the door it asked was another one.
    let elsewhere = quo_arithmetic::signing_pk(&key(OTHER_EPHEMERAL));
    assert!(envelope::read_answer(&key(PADLOCK_SECRET), &sealed, &elsewhere).is_err());

    // And an answer whose record names a warden that did not sign it does not
    // even reach the door match.
    let forged = Answer {
        warden: elsewhere,
        ..an_answer()
    };
    let sealed = envelope::seal(
        &key(WARDEN_SECRET),
        &key(EPHEMERAL_SECRET),
        &padlock,
        &Message::Answer(forged),
    )
    .expect("it seals");
    assert!(envelope::read_answer(&key(PADLOCK_SECRET), &sealed, &elsewhere).is_err());
}

/// At a door the leading byte must say `say`, and at the caller it must say
/// `answer`. The kind is read off the byte, never off the position.
#[test]
fn each_side_takes_only_the_record_it_is_owed() {
    let message = Message::Say(a_say());
    let padlock = quo_arithmetic::sealing_pk(&key(PADLOCK_SECRET));
    let sealed = envelope::seal(
        &key(VOICE_SECRET),
        &key(EPHEMERAL_SECRET),
        &padlock,
        &message,
    )
    .expect("it seals");
    assert_eq!(
        envelope::open_at_door(&key(PADLOCK_SECRET), &sealed),
        Ok(a_say())
    );
    assert!(envelope::open_at_caller(&key(PADLOCK_SECRET), &sealed).is_err());
}

/// The signature covers the naming byte with the rest, so what a voice signs
/// as a `say` can never be presented as an `answer`.
#[test]
fn the_signature_covers_the_naming_byte() {
    let payload = envelope::payload(&Message::Say(a_say())).expect("the payload");
    assert_eq!(payload[0], envelope::SAY);
    let mut turned = payload.clone();
    turned[0] = envelope::ANSWER;
    let signature = quo_arithmetic::sign(&key(VOICE_SECRET), &payload);
    let voice = quo_arithmetic::signing_pk(&key(VOICE_SECRET));
    assert!(quo_arithmetic::verify(&voice, &turned, &signature).is_err());
}

/// Any other first byte is silence, and so is a payload with no byte in front
/// of it at all.
#[test]
fn a_byte_that_names_no_record_is_silence() {
    let record = envelope::encode_say(&a_say()).expect("the record");
    for byte in [2u8, 3, 0xff] {
        let mut payload = vec![byte];
        payload.extend_from_slice(&record);
        assert!(envelope::read_payload(&payload).is_err());
    }
    assert!(envelope::read_payload(&[]).is_err());
}

/// Bytes left over after a well-formed record are refused, and so is a record
/// cut short: the payload is read whole or not at all.
#[test]
fn a_payload_is_read_whole_or_not_at_all() {
    let record = envelope::encode_say(&a_say()).expect("the record");
    let mut over = record.clone();
    over.push(0);
    assert!(envelope::decode_say(&over).is_err());
    assert!(envelope::decode_say(&record[..record.len() - 1]).is_err());
}

/// An envelope with no room for the ephemeral key, and one with no room
/// inside the seal for a signature, are both silence.
#[test]
fn an_envelope_too_short_to_hold_a_message_is_silence() {
    let padlock_secret = key(PADLOCK_SECRET);
    assert!(envelope::open(&padlock_secret, &[]).is_err());
    assert!(envelope::open(&padlock_secret, &[0u8; 31]).is_err());

    let ephemeral = quo_arithmetic::sealing_pk(&key(EPHEMERAL_SECRET));
    let shared = quo_arithmetic::agree(
        &key(EPHEMERAL_SECRET),
        &quo_arithmetic::sealing_pk(&padlock_secret),
    )
    .expect("a live agreement");
    let mut short = ephemeral.to_vec();
    short.extend_from_slice(&quo_arithmetic::seal(&shared, &ephemeral, &[0u8; 63]));
    assert!(envelope::open(&padlock_secret, &short).is_err());
}

/// A method takes its arguments as one opaque blob, empty when it takes
/// nothing, and an absent method is not a method with an empty blob.
#[test]
fn an_absent_method_is_not_an_empty_one() {
    let mut with = a_say();
    with.method = Some(Method {
        name: String::new(),
        args: Vec::new(),
    });
    let mut without = a_say();
    without.method = None;
    assert_ne!(
        envelope::encode_say(&with).expect("it encodes"),
        envelope::encode_say(&without).expect("it encodes")
    );
}
