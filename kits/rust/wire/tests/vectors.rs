//! The wire against the pinned corpus. Every vector in `wire.json` is
//! reproduced — an acceptance by its exact bytes in both directions, a refusal
//! by being refused — and the bench asserts its own case count against the
//! number of vectors in the file, so nothing is skipped silently. A vector
//! whose shape the bench does not recognise panics rather than passing.

#[path = "../../support/hex.rs"]
mod hex;
#[path = "../../support/json.rs"]
mod json;

use hex::{bytes, hex, key};
use json::Json;
use quo_notation::{Blueprint, Type};
use quo_wire as wire;
use wire::{Card, Invitation, Value};

fn corpus() -> Json {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../js/vectors/wire.json");
    let source = std::fs::read_to_string(path).expect("the pinned corpus");
    json::parse(&source)
}

/// A vector names a blueprint: a class with exactly one field, whose answer
/// type is the type under test. Reading a vector needs the notation parser and
/// no second grammar.
fn under_test(blueprint: &Blueprint) -> &Type {
    assert_eq!(blueprint.fields.len(), 1, "one field under test");
    blueprint.fields[0]
        .answers
        .as_ref()
        .expect("the field answers the type under test")
}

/// The corpus writes a value in JSON by one rule per type, and that rule is
/// read against the type rather than guessed from the JSON.
fn value(blueprint: &Blueprint, ty: &Type, written: &Json) -> Value {
    match ty {
        Type::Many(inner) => Value::Many(
            written
                .list()
                .iter()
                .map(|item| value(blueprint, inner, item))
                .collect(),
        ),
        Type::Maybe(inner) => match written {
            Json::Null => Value::Maybe(None),
            held => Value::Maybe(Some(Box::new(value(blueprint, inner, held)))),
        },
        Type::Base(name) => base(blueprint, name, written),
    }
}

fn base(blueprint: &Blueprint, name: &str, written: &Json) -> Value {
    match name {
        "bool" => match written {
            Json::Bool(held) => Value::Bool(*held),
            other => panic!("a bool written as {other:?}"),
        },
        "int" => Value::Int(written.text().parse().expect("an int as a decimal string")),
        "text" => Value::Text(written.text().to_string()),
        "bytes" => Value::Bytes(bytes(written.text())),
        "b32" => Value::B32(key(written.text())),
        "being" => Value::Being(key(written.text())),
        "invitation" => Value::Invitation(Invitation {
            warden: field_key(written, "warden"),
            commitment: field_key(written, "commitment"),
            padlock: field_key(written, "padlock"),
            heir: field_key(written, "heir"),
            heir_secret: field_key(written, "heirSecret"),
            hints: hints(written),
        }),
        "card" => Value::Card(Card {
            warden: field_key(written, "warden"),
            commitment: field_key(written, "commitment"),
            padlock: field_key(written, "padlock"),
            hints: hints(written),
        }),
        name => {
            let shape = blueprint
                .records
                .iter()
                .find(|shape| shape.name == name)
                .unwrap_or_else(|| panic!("no block declares {name}"));
            let names = written.names();
            let declared: Vec<&str> = shape.members.iter().map(|m| m.name.as_str()).collect();
            let mut sorted = declared.clone();
            sorted.sort_unstable();
            assert_eq!(names, sorted, "a record keyed by the names {name} declares");
            Value::Record(
                shape
                    .members
                    .iter()
                    .map(|member| {
                        value(
                            blueprint,
                            &member.ty,
                            written.get(&member.name).expect("a declared field"),
                        )
                    })
                    .collect(),
            )
        }
    }
}

fn field_key(written: &Json, name: &str) -> [u8; 32] {
    key(written.get(name).expect("a named field").text())
}

fn hints(written: &Json) -> Vec<String> {
    written
        .get("hints")
        .expect("the hints")
        .list()
        .iter()
        .map(|hint| hint.text().to_string())
        .collect()
}

#[test]
fn every_vector_in_the_corpus() {
    let corpus = corpus();
    assert_eq!(corpus.get("area").expect("an area").text(), "wire");
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

        let text = vector.get("blueprint").expect("a blueprint").text();
        let blueprint = quo_notation::parse(text)
            .unwrap_or_else(|why| panic!("{name}: the vector's blueprint is refused: {why}"));
        let ty = under_test(&blueprint);
        let wanted = vector.get("bytes").expect("the bytes").text();
        let raw = bytes(wanted);

        played += 1;

        if vector.flag("refuses") {
            refused += 1;
            assert!(
                wire::decode(&blueprint, ty, &raw).is_err(),
                "{name}: these bytes are refused"
            );
            continue;
        }

        let written = vector
            .get("value")
            .unwrap_or_else(|| panic!("{name}: the bench has no case for this vector's shape"));
        let value = value(&blueprint, ty, written);

        let encoded = wire::encode(&blueprint, ty, &value)
            .unwrap_or_else(|why| panic!("{name}: the value does not encode: {why}"));
        assert_eq!(hex(&encoded), wanted, "{name}: encoding");

        let decoded = wire::decode(&blueprint, ty, &raw)
            .unwrap_or_else(|why| panic!("{name}: the bytes do not decode: {why}"));
        assert_eq!(decoded, value, "{name}: decoding");
    }

    println!(
        "wire corpus: {played} played, {refused} of them refusals, {} in all",
        vectors.len()
    );
    assert_eq!(played, vectors.len(), "every vector in the file was played");
}
