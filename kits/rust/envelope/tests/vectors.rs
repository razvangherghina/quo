//! The envelope against the pinned corpus. Every vector in `envelope.json` is
//! reproduced — an acceptance by its exact bytes, a refusal by being refused —
//! and the bench asserts its own case count against the number of vectors in
//! the file, so nothing is skipped silently. A vector whose shape the bench
//! does not recognise panics rather than passing.

#[path = "../../support/hex.rs"]
mod hex;
#[path = "../../support/json.rs"]
mod json;

use envelope::{Allowance, Answer, Message, Method, Say};
use hex::{bytes, hex, key, signature};
use json::Json;
use quo_envelope as envelope;

fn corpus() -> Json {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../js/vectors/envelope.json"
    );
    let source = std::fs::read_to_string(path).expect("the pinned corpus");
    json::parse(&source)
}

fn field(written: &Json, name: &str) -> Json {
    written
        .get(name)
        .unwrap_or_else(|| panic!("the field {name}"))
        .clone()
}

fn field_key(written: &Json, name: &str) -> [u8; 32] {
    key(field(written, name).text())
}

fn maybe_key(written: &Json, name: &str) -> Option<[u8; 32]> {
    match field(written, name) {
        Json::Null => None,
        held => Some(key(held.text())),
    }
}

fn int(written: &Json, name: &str) -> i64 {
    field(written, name)
        .text()
        .parse()
        .expect("an int as a decimal string")
}

fn say(written: &Json) -> Say {
    Say {
        voice: field_key(written, "voice"),
        recipient: field_key(written, "recipient"),
        commitment: maybe_key(written, "commitment"),
        seq: int(written, "seq"),
        padlock: field_key(written, "padlock"),
        hints: field(written, "hints")
            .list()
            .iter()
            .map(|hint| hint.text().to_string())
            .collect(),
        allowance: {
            let held = field(written, "allowance");
            Allowance {
                time: int(&held, "time"),
                hops: int(&held, "hops"),
            }
        },
        being: maybe_key(written, "being"),
        method: match field(written, "method") {
            Json::Null => None,
            held => Some(Method {
                name: field(&held, "name").text().to_string(),
                args: bytes(field(&held, "args").text()),
            }),
        },
    }
}

fn answer(written: &Json) -> Answer {
    Answer {
        warden: field_key(written, "warden"),
        seq: int(written, "seq"),
        data: match field(written, "data") {
            Json::Null => None,
            held => Some(bytes(held.text())),
        },
    }
}

/// A record vector names a blueprint whose one field answers `say` or
/// `answer`; the corpus writes the record's own shape there, so the bench
/// reads which record is under test rather than guessing it from the value.
fn under_test(text: &str, name: &str) -> String {
    let blueprint = quo_notation::parse(text)
        .unwrap_or_else(|why| panic!("{name}: the vector's blueprint is refused: {why}"));
    assert_eq!(blueprint.fields.len(), 1, "{name}: one field under test");
    match blueprint.fields[0]
        .answers
        .as_ref()
        .expect("the field answers the record under test")
    {
        quo_notation::Type::Base(record) => record.clone(),
        other => panic!("{name}: a field answering {other:?}"),
    }
}

#[test]
fn every_vector_in_the_corpus() {
    let corpus = corpus();
    assert_eq!(corpus.get("area").expect("an area").text(), "envelope");
    assert_eq!(corpus.get("encoding").expect("an encoding").text(), "hex");

    let vectors = corpus.get("vectors").expect("the vectors").list();
    assert!(!vectors.is_empty(), "the corpus carries vectors");

    let mut played = 0usize;
    let mut refused = 0usize;

    for vector in vectors {
        let name = vector.get("name").expect("a name").text();
        assert!(
            !vector.flag("unpinned"),
            "{name}: this bench judges only what the law compels"
        );
        played += 1;

        // A record on its own: the payload's one notation record, without the
        // byte that names it.
        if let Some(text) = vector.get("blueprint") {
            let wanted = vector.get("bytes").expect("the bytes").text();
            let written = vector.get("value").expect("the value");
            let encoded = match under_test(text.text(), name).as_str() {
                "say" => {
                    let value = say(written);
                    let encoded = envelope::encode_say(&value)
                        .unwrap_or_else(|why| panic!("{name}: the say does not encode: {why}"));
                    let read_back = envelope::decode_say(&bytes(wanted))
                        .unwrap_or_else(|why| panic!("{name}: the bytes do not decode: {why}"));
                    assert_eq!(read_back, value, "{name}: decoding");
                    encoded
                }
                "answer" => {
                    let value = answer(written);
                    let encoded = envelope::encode_answer(&value)
                        .unwrap_or_else(|why| panic!("{name}: the answer does not encode: {why}"));
                    let read_back = envelope::decode_answer(&bytes(wanted))
                        .unwrap_or_else(|why| panic!("{name}: the bytes do not decode: {why}"));
                    assert_eq!(read_back, value, "{name}: decoding");
                    encoded
                }
                other => panic!("{name}: a record the bench has no case for: {other}"),
            };
            assert_eq!(hex(&encoded), wanted, "{name}: encoding");
            continue;
        }

        // The signature over a payload, the payload given whole with its
        // naming byte already in front.
        if let Some(wanted) = vector.get("signature") {
            let payload = bytes(vector.get("payload").expect("the payload").text());
            let secret = key(vector.get("secret").expect("the secret").text());
            let voice = key(vector.get("voice").expect("the voice").text());
            assert_eq!(
                hex(&quo_arithmetic::signing_pk(&secret)),
                hex(&voice),
                "{name}: the secret mints the voice"
            );
            let made = quo_arithmetic::sign(&secret, &payload);
            assert_eq!(hex(&made), wanted.text(), "{name}: signing");
            assert_eq!(
                &made[..],
                &signature(wanted.text())[..],
                "{name}: sixty-four bytes"
            );
            quo_arithmetic::verify(&voice, &payload, &made)
                .unwrap_or_else(|why| panic!("{name}: the signature does not stand: {why}"));
            continue;
        }

        // A whole envelope arriving at a door, refused or reproduced. Every
        // envelope in this file is presented at a door, so it is judged by
        // the door's own open: the leading byte must say `say`.
        let wanted = vector.get("envelope").expect("the envelope").text();
        let padlock_secret = key(vector.get("padlockSecret").expect("the secret").text());

        if vector.flag("refuses") {
            refused += 1;
            assert!(
                envelope::open_at_door(&padlock_secret, &bytes(wanted)).is_err(),
                "{name}: this envelope is refused"
            );
            continue;
        }

        let written = vector
            .get("value")
            .unwrap_or_else(|| panic!("{name}: the bench has no case for this vector's shape"));
        let value = say(written);
        let padlock = key(vector.get("padlock").expect("the padlock").text());
        let voice_secret = key(vector.get("voiceSecret").expect("the voice secret").text());
        let ephemeral_secret = key(vector
            .get("ephemeralSecret")
            .expect("the ephemeral secret")
            .text());

        assert_eq!(
            hex(&quo_arithmetic::sealing_pk(&padlock_secret)),
            hex(&padlock),
            "{name}: the secret mints the padlock"
        );

        let sealed = envelope::seal(
            &voice_secret,
            &ephemeral_secret,
            &padlock,
            &Message::Say(value.clone()),
        )
        .unwrap_or_else(|why| panic!("{name}: the message does not seal: {why}"));
        assert_eq!(hex(&sealed), wanted, "{name}: sealing");

        let opened = envelope::open_at_door(&padlock_secret, &bytes(wanted))
            .unwrap_or_else(|why| panic!("{name}: the envelope does not open: {why}"));
        assert_eq!(opened, value, "{name}: opening");
    }

    println!(
        "envelope corpus: {played} played, {refused} of them refusals, {} in all",
        vectors.len()
    );
    assert_eq!(played, vectors.len(), "every vector in the file was played");
}
