// SPDX-License-Identifier: Apache-2.0
//! Words and values: the framing vectors that need no seal, the one door
//! record that carries a blueprint, and the spec's sentences where no record
//! exists.

use quo_kit::seal::*;
use quo_kit::value::*;
use quo_kit::ward::*;
use std::str::FromStr;

fn corpus(name: &str) -> serde_json::Value {
    let path = format!("{}/../../vectors/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).expect("vector file")).expect("vector JSON")
}

fn record(corpus: &serde_json::Value, name: &str) -> serde_json::Value {
    corpus["vectors"].as_array().unwrap().iter().find(|v| v["name"] == name).expect(name).clone()
}

fn unhex32(s: &str) -> [u8; 32] {
    let bytes: Vec<u8> = (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect();
    bytes.try_into().unwrap()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn one() -> Value {
    Value::Number(Number::from_u64(1).expect("within the doubles"))
}

// framing.json

#[test]
fn a_ward_pk_from_a_fixed_seed() {
    let r = record(&corpus("framing.json"), "a ward pk from a fixed seed");
    let pk = Seed::from_bytes(&unhex32(r["seed"].as_str().unwrap())).ward_pk();
    assert_eq!(hex(&pk.sign), r["signPk"]);
    assert_eq!(hex(&pk.padlock), r["padlockPk"]);
    assert_eq!(pk.to_string(), r["pk"]);
    assert_eq!(WardPk::from_str(r["pk"].as_str().unwrap()), Ok(pk));
}

#[test]
fn a_being_key_from_a_fixed_secret() {
    let r = record(&corpus("framing.json"), "a being key from a fixed secret");
    assert_eq!(hex(&being_pk(&unhex32(r["secret"].as_str().unwrap()))), r["pk"]);
}

#[test]
fn the_digest_records() {
    let c = corpus("framing.json");
    for name in ["the digest is SHA-256 of the canonical form", "the digest where JCS is hard: UTF-16 key order and ES numbers"] {
        let r = record(&c, name);
        let value = Value::parse(r["blueprint"].as_str().unwrap()).expect(name);
        assert_eq!(value.canonical(), r["canonical"], "{name}");
        assert_eq!(digest(&value).as_deref(), r["digest"].as_str(), "{name}");
    }
}

#[test]
fn the_invitation_in_framing_is_a_value_written_in_its_own_order() {
    let r = record(&corpus("framing.json"), "an invitation for a heir: the ward pk, the heir pk, the heir secret, the ward's lock, and nothing else");
    let text = r["invitation"].as_str().unwrap();
    let value = Value::parse(text).unwrap();
    assert_eq!(value.to_json(), text);
    assert_eq!(value.get("ward").and_then(Value::as_str), Some(Seed::from_bytes(&unhex32(r["wardSeed"].as_str().unwrap())).ward_pk().to_string().as_str()));
    assert_eq!(hex(&being_pk(&unhex32(r["heirSecret"].as_str().unwrap()))), value.get("heir").and_then(Value::as_str).unwrap());
}

// door.json: the one record whose reply carries seen

#[test]
fn the_door_record_blueprint_hashes_to_its_seen() {
    let door = corpus("door.json");
    let r = door["vectors"].as_array().unwrap().iter().find(|v| v.get("blueprint").is_some()).unwrap();
    let value = Value::parse(&r["blueprint"].to_string()).unwrap();
    let blueprint = Blueprint::read(&value).expect("a blueprint");
    assert_eq!(digest(&blueprint.into_value()).as_deref(), r["opens"]["seen"].as_str());
}

#[test]
fn the_vector_seeds_are_text() {
    for name in ["A", "B", "P"] {
        assert_eq!(Seed::from_text(name), Seed::from_bytes(name.as_bytes()));
    }
    let name = "abcdefghijklmnopqrstuvwxyz012345";
    assert_eq!(name.len(), 32);
    assert_ne!(Seed::from_text(name).as_bytes(), name.as_bytes());
}

// Values

#[test]
fn a_whole_number_is_whole_however_spelled() {
    for text in ["1", "1.0", "1e0", "10e-1", "0.1e1"] {
        let n = Value::parse(text).unwrap().as_number().unwrap();
        assert!(n.is_whole(), "{text}");
        assert_eq!(n.as_u64(), Some(1));
        assert_eq!(Value::parse(text).unwrap().canonical(), "1");
    }
    assert!(!Value::parse("1.5").unwrap().as_number().unwrap().is_whole());
}

#[test]
fn minus_zero_is_refused() {
    for text in ["-0", "-0.0", "-0e5", "[-0]"] {
        assert_eq!(Value::parse(text), Err(ValueError::MinusZero), "{text}");
    }
    assert_eq!(Number::try_from(-0.0), Err(ValueError::MinusZero));
    assert_eq!(Value::parse("0").unwrap().canonical(), "0");
}

#[test]
fn a_number_outside_the_doubles_is_refused() {
    for text in ["9007199254740993", "1e400", "-1e400", "1e-400", "123456789012345678901234567890"] {
        assert!(matches!(Value::parse(text), Err(ValueError::NotDouble(_))), "{text}");
    }
    for text in ["9007199254740992", "9007199254740994", "1e21", "0.1", "0.3333333333333333", "5e-324"] {
        assert!(Value::parse(text).is_ok(), "{text}");
    }
    for text in ["12345678901234567890", "9007199254740995"] {
        assert!(matches!(Value::parse(text), Err(ValueError::NotDouble(_))), "{text}");
    }
    // Every double reads back from the text it is written as.
    for f in [1.5e300, 1e23, 2f64.powi(60), f64::MAX, 123456789.123, 5e-324] {
        let n = Number::try_from(f).unwrap();
        assert_eq!(Value::parse(&n.to_string()).unwrap().as_number(), Some(n), "{f}");
    }
    assert!(Number::try_from(f64::NAN).is_err());
    assert!(Number::try_from(f64::INFINITY).is_err());
    assert!(Number::from_u64(9_007_199_254_740_993).is_none());
    assert!(Number::from_u64(9_007_199_254_740_992).is_some());
}

#[test]
fn a_boolean_is_never_a_number() {
    assert_eq!(Value::parse("true").unwrap(), Value::Bool(true));
    assert!(Value::parse("true").unwrap().as_number().is_none());
}

#[test]
fn an_object_has_no_duplicate_keys() {
    assert_eq!(Value::parse(r#"{"a":1,"a":2}"#), Err(ValueError::DuplicateKey("a".into())));
    assert_eq!(Value::parse(r#"{"a":{"b":1,"b":2}}"#), Err(ValueError::DuplicateKey("b".into())));
}

#[test]
fn a_stranger_who_sends_many_keys_costs_the_door_one_look_each() {
    // A payload near the size with eighty thousand keys is read before its
    // signature is checked. Every key against every other would be minutes.
    let keys: Vec<String> = (0..80_000).map(|i| format!(r#""k{i}":0"#)).collect();
    let text = format!("{{{}}}", keys.join(","));
    assert!(text.len() < 1 << 20);
    let started = std::time::Instant::now();
    assert_eq!(Value::parse(&text).unwrap().as_object().unwrap().count(), 80_000);
    assert!(started.elapsed() < std::time::Duration::from_secs(5), "{:?}", started.elapsed());
}

#[test]
fn a_lone_surrogate_is_no_string() {
    for text in [r#""\ud800""#, r#""\udc00""#, r#""\ud800x""#, r#""\ud800A""#] {
        assert_eq!(Value::parse(text), Err(ValueError::LoneSurrogate), "{text}");
    }
    assert_eq!(Value::parse(r#""😀""#).unwrap(), Value::from("\u{1F600}"));
    assert_eq!(Value::parse_payload(b"\"\xed\xa0\x80\""), Err(ValueError::NotUtf8));
}

#[test]
fn json_text_is_strict() {
    for text in ["", "01", "1.", ".1", "+1", "[1,]", "{\"a\":1,}", "'a'", "\"\t\"", "nul", "1 2", "NaN"] {
        assert!(Value::parse(text).is_err(), "{text:?}");
    }
    assert_eq!(Value::parse(" \n[ 1 , {\"a\" : null} ]\t").unwrap().to_json(), "[1,{\"a\":null}]");
}

fn nested(levels: usize) -> String {
    format!("{}{}", "[".repeat(levels), "]".repeat(levels))
}

#[test]
fn nesting_is_bounded_at_sixty_four() {
    assert_eq!(Value::parse(&nested(64)).unwrap().depth(), 64);
    assert_eq!(Value::parse(&nested(65)), Err(ValueError::TooDeep));
    assert_eq!(Value::parse("1").unwrap().depth(), 0);
    let mut deep = Value::Array(vec![]);
    for _ in 0..64 {
        deep = Value::Array(vec![deep]);
    }
    assert_eq!(deep.check(), Err(ValueError::TooDeep));
}

#[test]
fn a_payload_is_a_value_at_its_own_root_and_nests_no_deeper_than_sixty_six() {
    assert_eq!(MAX_PAYLOAD_DEPTH, 66);
    // An arg of depth sixty-four stands whatever carries it, so a payload
    // that holds one stands at sixty-five.
    let arg = nested(64);
    let payload = format!(r#"{{"args":{{"v":{arg}}}}}"#);
    assert_eq!(Value::parse_payload(payload.as_bytes()).unwrap().depth(), 66);
    assert_eq!(Value::parse_payload(format!(r#"{{"v":{arg}}}"#).as_bytes()).unwrap().depth(), 65);
    // And one that nests past sixty-six is no payload.
    let past = nested(65);
    assert_eq!(Value::parse_payload(format!(r#"{{"args":{{"v":{past}}}}}"#).as_bytes()), Err(ValueError::TooDeep));
    // The bound is on the payload and never on the arg: the arg is read as a
    // value of its own, and sixty-five is no value.
    assert_eq!(Value::parse(&past), Err(ValueError::TooDeep));
}

#[test]
fn the_door_reads_an_arg_of_sixty_four_and_refuses_one_of_sixty_five() {
    let payload = |arg: &str| {
        let by = "a".repeat(64);
        format!(r#"{{"to":null,"by":"{by}","next":null,"seq":1,"time":1000,"method":"m","args":{{"v":{arg}}}}}"#)
    };
    let read = quo_kit::seal::Payload::read(payload(&nested(64)).as_bytes()).expect("an arg of sixty-four stands");
    assert_eq!(Value::Object(read.args.unwrap()).depth(), 65);
    assert!(quo_kit::seal::Payload::read(payload(&nested(65)).as_bytes()).is_err());
}

// Silence and the words

#[test]
fn five_door_words_cross_and_four_are_her_own_wards() {
    assert_eq!(Word::ALL.len(), 9);
    let names: Vec<_> = Word::ALL.iter().map(|w| w.as_str()).collect();
    assert_eq!(names, ["removed", "absent", "unannounced", "repeated", "threw", "unreached", "late", "invitation", "dropped"]);
    let door: Vec<_> = Word::ALL.into_iter().filter(|w| w.is_door_word()).map(Word::as_str).collect();
    assert_eq!(door, ["removed", "absent", "unannounced", "repeated", "threw"]);
    for w in Word::ALL {
        assert_eq!(Word::from_name(w.as_str()), Some(w));
    }
    assert_eq!(Word::from_name("silence"), None);
    assert_ne!(Answer::Silence, Answer::Value(Value::Null));
}

// Blueprint, schema, digest

#[test]
fn keys_sort_by_utf16_code_unit() {
    let v = Value::parse("{\"\u{FB33}\":1,\"\u{1F600}\":2}").unwrap();
    assert_eq!(v.canonical(), "{\"\u{1F600}\":2,\"\u{FB33}\":1}");
}

#[test]
fn numbers_are_written_as_ecmascript_writes_them() {
    let cases = [
        ("1e21", "1e+21"),
        ("1e20", "100000000000000000000"),
        ("1e-7", "1e-7"),
        ("1e-6", "0.000001"),
        ("0.1", "0.1"),
        ("123.456", "123.456"),
        ("-1.5", "-1.5"),
        ("1.5e-300", "1.5e-300"),
        ("1e23", "1e+23"),
        ("1152921504606846976", "1152921504606847000"),
        ("5e-324", "5e-324"),
        ("1.7976931348623157e308", "1.7976931348623157e+308"),
        ("4.35", "4.35"),
        ("0.000001234", "0.000001234"),
        ("1.234e-7", "1.234e-7"),
        ("333333333.33333329", "333333333.3333333"),
        ("100", "100"),
    ];
    for (text, written) in cases {
        assert_eq!(Value::parse(text).unwrap().canonical(), written, "{text}");
    }
}

#[test]
fn strings_are_escaped_as_rfc_8785_escapes_them() {
    let v = Value::from("\"\\\u{8}\u{c}\n\r\t\u{1}\u{1f}\u{7f}/\u{2028}é");
    assert_eq!(v.canonical(), "\"\\\"\\\\\\b\\f\\n\\r\\t\\u0001\\u001f\u{7f}/\u{2028}é\"");
}

#[test]
fn a_describe_that_is_not_a_value_costs_the_digest() {
    let mut deep = Value::Array(vec![]);
    for _ in 0..63 {
        deep = Value::Array(vec![deep]);
    }
    assert_eq!(deep.depth(), 64);
    assert!(digest(&deep).is_some());
    let mut notes = Map::new();
    notes.insert("keep", one());
    notes.insert("a", Value::Array(vec![deep]));
    let mut past = Map::new();
    past.insert("asks", Value::Array(vec![]));
    past.insert("notes", notes);
    let past = Value::Object(past);
    assert_eq!(past.depth(), 67);
    // Never mended into one: no digest at all.
    assert_eq!(digest(&past), None);
    assert_eq!(digest(&Blueprint::read(&past).expect("a blueprint's shape").into_value()), None);
}

#[test]
fn a_blueprint_is_read_before_it_is_written() {
    assert!(Blueprint::read(&Value::parse(r#"{"asks":[],"notes":null}"#).unwrap()).is_some());
    // What is one is kept whole, fields this document does not name included.
    let text = r#"{"asks":[{"name":"hi","description":"d","input":{"type":"object"},"extra":1}],"notes":{"x":1}}"#;
    let kept = Blueprint::read(&Value::parse(text).unwrap()).unwrap();
    assert_eq!(kept.into_value().to_json(), text);
    for text in [
        "null",
        "[]",
        r#""asks""#,
        r#"{"notes":{}}"#,
        r#"{"asks":[]}"#,
        r#"{"asks":[{"name":"hi","input":{}}]}"#,
        r#"{"asks":[{"name":"hi","input":true}],"notes":{}}"#,
        r#"{"asks":[{"name":"hi","input":null}],"notes":{}}"#,
        r#"{"asks":{"hello":{}}}"#,
        r#"{"asks":[{"input":{}}]}"#,
        r#"{"asks":[{"name":1,"input":{}}]}"#,
        r#"{"asks":[{"name":"hi"}]}"#,
        r#"{"asks":[1]}"#,
    ] {
        assert!(Blueprint::read(&Value::parse(text).unwrap()).is_none(), "{text}");
    }
}

// Ids

#[test]
fn the_root_is_reserved_and_the_asker_has_three_shapes() {
    assert!(is_reserved("ROOT"));
    assert!(!is_reserved("root"));
    assert!(!is_reserved("knock"));
    assert_eq!(Asker::Root.id(), Some(ROOT));
    assert_eq!(Asker::Nobody.id(), None);
    assert_eq!(Asker::Occupant("cust7".into()).id(), Some("cust7"));
}

// Cells

#[test]
fn cells_refuse_the_wards_keys_where_she_writes() {
    let mut cells = Cells::new();
    for key in WARD_KEYS {
        assert_eq!(cells.set(key, one()), Err(ValueError::WardKey(key.into())));
    }
    cells.set("count", one()).unwrap();
    assert_eq!(cells.get("count"), Some(&one()));
}

#[test]
fn cells_refuse_a_value_past_the_bound() {
    let mut cells = Cells::new();
    let ok = Value::parse(&nested(64)).unwrap();
    cells.set("deep", ok.clone()).unwrap();
    assert_eq!(cells.set("deeper", Value::Array(vec![ok])), Err(ValueError::TooDeep));
    assert!(cells.get("deeper").is_none());
}

#[test]
fn the_wards_records_in_cells() {
    let mut cells = Cells::new();
    cells.set_occupant("cust7", Value::parse(r#"{"tier":"gold"}"#).unwrap()).unwrap();
    assert!(cells.holds_id("cust7"));
    assert_eq!(cells.occupant("cust7").unwrap().notes, Value::parse(r#"{"tier":"gold"}"#).unwrap());
    let record = StandingRecord { id: "bank".into(), digest: None, blueprint: None, seen: None };
    cells.set_standing(&record);
    assert_eq!(cells.standing("bank"), Some(record));
    assert!(cells.holds_id("bank"));
    assert_eq!(cells.to_value().to_json(), r#"{"occupants":{"cust7":{"id":"cust7","notes":{"tier":"gold"}}},"standings":{"bank":{"id":"bank","digest":null,"blueprint":null,"seen":null}}}"#);
    let back = Cells::from_value(cells.to_value()).unwrap();
    assert_eq!(back, cells);
    assert!(cells.remove_standing("bank"));
    assert!(!cells.holds_id("bank"));
}

// The ward pk encoding

#[test]
fn a_ward_pk_is_128_lowercase_hex() {
    let pk = Seed::from_text("A").ward_pk().to_string();
    assert!(WardPk::from_str(&pk).is_ok());
    assert!(WardPk::from_str(&pk.to_uppercase()).is_err());
    assert!(WardPk::from_str(&pk[..126]).is_err());
    assert!(WardPk::from_str(&format!("{pk}00")).is_err());
}

mod harness;

#[test]
fn the_watchdog_stands() {
    harness::watchdog();
}
