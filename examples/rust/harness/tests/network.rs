// SPDX-License-Identifier: Apache-2.0
//! `stand`'s own TCP listener, `HARNESS.md` section 1's `--listen` and the
//! carrier of `SPEC.md` chapter 6, driven directly over a real socket by a
//! hand of this test's own: it mints its own key, seals its own ask, and
//! reads the frame back exactly as chapter 6 frames it. No kit is changed
//! and none of its internals are reached; everything here is the kit's own
//! public `seal`, `arithmetic` and `wire` modules, the same ones the kit's
//! own `tests/` use to hold it to the vectors.

mod support;

use quo_kit::seal::WardPk;
use quo_kit::seal::{self, Reply};
use quo_kit::value::Map;
use quo_kit::wire::Dialer;
use serde_json::json;
use std::str::FromStr;
use support::{public_ask, Stand};

fn seal_and_send(dialer: &mut Dialer, ward: &WardPk, key: [u8; 32], body: Vec<u8>) -> Option<Reply> {
    let sealed = seal::seal_ask(ward, &key, None, &seal::ZERO_EDGE, &body, &key)?;
    let reply = dialer.ask(ward, &sealed).ok()??;
    seal::open_reply(&key, ward, &reply)
}

#[test]
fn listener_answers_reply_over_real_tcp() {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "9"]);
    let booted = stand.boot_lines(1);
    let (a_hex, at) = booted[0].clone();
    stand.request(&a_hex, "boot", json!({ "key": "host", "class": "Host" }));
    stand.request(&a_hex, "public", json!({ "key": "host" }));

    let ward = WardPk::from_str(&a_hex).expect("128 hex");
    let mut dialer = Dialer::dial(&at).expect("a real TCP connection to stand's own listener");

    let (key, body) = public_ask("hello", Map::new());
    let sealed = seal::seal_ask(&ward, &key, None, &seal::ZERO_EDGE, &body, &key).expect("a padlock that takes a seal");
    let reply = dialer.ask(&ward, &sealed).expect("stand answers its socket").expect("a reply, not nothing: the ward stands here");
    let opened = seal::open_reply(&key, &ward, &reply).expect("the box this test holds the lid to opens");
    match opened {
        Reply::Object { object, .. } => assert_eq!(object.get("hi"), Some(&quo_kit::value::Value::Null), "the public being hears null: {object:?}"),
        other => panic!("expected an object, got {other:?}"),
    }

    stand.finish();
}

#[test]
fn listener_answers_nothing_for_a_ward_it_does_not_stand() {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "9"]);
    let booted = stand.boot_lines(1);
    let (_, at) = booted[0].clone();

    // A pk this program never stood: kind `02`, chapter 6's own "nothing".
    let stranger = WardPk::from_str(&"ab".repeat(64)).unwrap();
    let mut dialer = Dialer::dial(&at).unwrap();
    let (key, body) = public_ask("hello", Map::new());
    let sealed = seal::seal_ask(&stranger, &key, None, &seal::ZERO_EDGE, &body, &key).unwrap();
    let reply = dialer.ask(&stranger, &sealed).expect("stand answers its socket");
    assert!(reply.is_none(), "nothing delivered: {reply:?}");

    stand.finish();
}

#[test]
fn listener_swallows_a_reply_that_drop_spent() {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "9"]);
    let booted = stand.boot_lines(1);
    let (a_hex, at) = booted[0].clone();
    stand.request(&a_hex, "boot", json!({ "key": "host", "class": "Host" }));
    stand.request(&a_hex, "public", json!({ "key": "host" }));
    stand.request(&a_hex, "drop", json!({ "replies": 1 }));

    let ward = WardPk::from_str(&a_hex).unwrap();
    let mut dialer = Dialer::dial(&at).unwrap();
    let (key, body) = public_ask("hello", Map::new());
    let sealed = seal::seal_ask(&ward, &key, None, &seal::ZERO_EDGE, &body, &key).unwrap();
    dialer.send(&ward, &sealed).unwrap();

    // The reply `drop` spent never crosses the wire at all: no frame, not
    // even a `02`, arrives inside a short wait, so a real caller's
    // allowance and not a word from this program ends the ask.
    let arrived = std::thread::spawn(move || dialer.receive(1));
    std::thread::sleep(std::time::Duration::from_millis(250));
    assert!(!arrived.is_finished(), "drop swallowed the frame: nothing arrived");

    // The next ask, past the one drop spent, answers normally again.
    let mut dialer2 = Dialer::dial(&at).unwrap();
    let (key2, body2) = public_ask("hello", Map::new());
    let opened = seal_and_send(&mut dialer2, &ward, key2, body2);
    assert!(matches!(opened, Some(Reply::Object { .. })), "drop spends exactly one: {opened:?}");

    stand.finish();
}
