//! What Article V compels that the pinned corpus does not carry. Every case
//! here quotes the sentence it stands on.

#[path = "../../support/hex.rs"]
mod hex;

use hex::hex;
use quo_notation::{parse, Blueprint, Type};
use quo_wire as wire;
use wire::Value;

fn probe(answers: &str) -> (Blueprint, Type) {
    let blueprint = parse(&format!("Probe\n  probe() {answers}\n")).expect("a blueprint");
    let ty = blueprint.fields[0].answers.clone().expect("an answer type");
    (blueprint, ty)
}

fn wrote(answers: &str, value: &Value) -> String {
    let (blueprint, ty) = probe(answers);
    hex(&wire::encode(&blueprint, &ty, value).expect("the value encodes"))
}

fn read(answers: &str, written: &str) -> Result<Value, wire::Refused> {
    let (blueprint, ty) = probe(answers);
    wire::decode(&blueprint, &ty, &hex::bytes(written))
}

/// "`T??` is an ordinary type and its two absences are two distinct byte
/// strings."
#[test]
fn the_two_absences_of_a_double_optional_are_two_byte_strings() {
    let outer = Value::Maybe(None);
    let inner = Value::Maybe(Some(Box::new(Value::Maybe(None))));
    assert_eq!(wrote("int??", &outer), "00");
    assert_eq!(wrote("int??", &inner), "0100");
    assert_eq!(read("int??", "00").expect("absent outside"), outer);
    assert_eq!(read("int??", "0100").expect("absent inside"), inner);
}

/// "No type encodes to zero bytes. A `bytes` that is present and empty is not
/// an absent `bytes?`."
#[test]
fn nothing_encodes_to_zero_bytes() {
    let empty = Value::Bytes(Vec::new());
    assert_eq!(wrote("bytes", &empty), "0000000000000000");
    let present = Value::Maybe(Some(Box::new(empty)));
    assert_eq!(wrote("bytes?", &present), "010000000000000000");
    assert_eq!(wrote("bytes?", &Value::Maybe(None)), "00");
    assert_eq!(wrote("[int]", &Value::Many(Vec::new())), "0000000000000000");
    assert_eq!(
        wrote("text", &Value::Text(String::new())),
        "0000000000000000"
    );
}

/// "A byte order mark inside a `text` **value** is ordinary content."
#[test]
fn a_byte_order_mark_inside_a_text_is_content() {
    let value = Value::Text("\u{feff}hi".to_string());
    let written = wrote("text", &value);
    assert_eq!(written, "0000000000000005efbbbf6869");
    assert_eq!(read("text", &written).expect("it reads back"), value);
}

/// "A count beyond the bytes that remain" — the count itself fits the bytes
/// left, but the items it promises do not.
#[test]
fn a_count_of_items_wider_than_the_bytes_that_remain() {
    let one = "1d5eda50d19066d0cc460cfb584ee026f532da67ff66c0e9774940a11e25ec71";
    assert!(read("[b32]", &format!("0000000000000002{one}")).is_err());
    assert!(read("[b32]", &format!("0000000000000001{one}")).is_ok());
}

/// "A negative length ... is refused on decode" — a count is an `int` and is
/// non-negative by rule, wherever it stands.
#[test]
fn a_negative_count_is_refused_wherever_it_stands() {
    assert!(read("[int]", "ffffffffffffffff").is_err());
    assert!(read("bytes", "ffffffffffffffff").is_err());
    let hintless = format!("{}8000000000000000", "00".repeat(96));
    assert!(read("card", &hintless).is_err());
}

/// "A record — its fields, in the order the blueprint declares them, and
/// nothing else. No names on the wire."
#[test]
fn a_record_rides_as_its_fields_in_order_and_nothing_else() {
    let value = Value::Record(vec![Value::Bool(true), Value::Int(1)]);
    let forwards = parse("Probe\n  probe() pair\n\npair\n  flag bool\n  count int\n").expect("one");
    let backwards =
        parse("Probe\n  probe() pair\n\npair\n  count int\n  flag bool\n").expect("two");
    let ty = Type::Base("pair".to_string());
    assert_eq!(
        hex(&wire::encode(&forwards, &ty, &value).expect("it encodes")),
        "010000000000000001"
    );
    let swapped = Value::Record(vec![Value::Int(1), Value::Bool(true)]);
    assert_eq!(
        hex(&wire::encode(&backwards, &ty, &swapped).expect("it encodes")),
        "000000000000000101"
    );
    assert!(
        wire::encode(&backwards, &ty, &value).is_err(),
        "a value whose fields are not the block's fields is not of its type"
    );
}

/// "`being` is a `b32` carrying a pk: the same thirty-two bare bytes." They
/// ride identically, and the choice tells a reader only what the bytes are.
#[test]
fn a_being_rides_exactly_as_a_b32_does() {
    let raw = [7u8; 32];
    assert_eq!(
        wrote("b32", &Value::B32(raw)),
        wrote("being", &Value::Being(raw))
    );
}

/// "A `card` ... an `invitation` with the keypair struck out; the fields it
/// keeps ride exactly as they ride there."
#[test]
fn a_card_is_an_invitation_with_the_keypair_struck_out() {
    let card = wire::Card {
        warden: [1u8; 32],
        commitment: [2u8; 32],
        padlock: [3u8; 32],
        hints: vec!["one".to_string()],
    };
    let invitation = wire::Invitation {
        warden: card.warden,
        commitment: card.commitment,
        padlock: card.padlock,
        heir: [4u8; 32],
        heir_secret: [5u8; 32],
        hints: card.hints.clone(),
    };
    let written_card = wrote("card", &Value::Card(card));
    let written_invitation = wrote("invitation", &Value::Invitation(invitation));
    assert_eq!(
        written_card[..192],
        written_invitation[..192],
        "the three keys"
    );
    assert_eq!(written_card[192..], written_invitation[320..], "the hints");
}
