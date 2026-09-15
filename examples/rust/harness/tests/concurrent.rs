// SPDX-License-Identifier: Apache-2.0
//! Chapter 6's many asks in flight at once, and the root channel's
//! `wanted` in milliseconds: a being that never answers holds only her own
//! ask, and a caller's allowance ends it.

mod support;

use quo_kit::seal::WardPk;
use quo_kit::seal::{self, Reply};
use quo_kit::value::Map;
use quo_kit::wire::Dialer;
use serde_json::json;
use std::str::FromStr;
use std::time::{Duration, Instant};
use support::{public_ask, Stand};

#[test]
fn an_ask_to_never_does_not_hold_the_connection_or_the_root_channel() {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "31"]);
    let (a_hex, at) = stand.boot_lines(1)[0].clone();
    stand.request(&a_hex, "boot", json!({ "key": "host", "class": "Host" }));
    stand.request(&a_hex, "public", json!({ "key": "host" }));

    let ward = WardPk::from_str(&a_hex).unwrap();
    let mut dialer = Dialer::dial(&at).unwrap();
    let (never_key, never_body) = public_ask("never", Map::new());
    let never_id = dialer.send(&ward, &seal::seal_ask(&ward, &never_key, None, &seal::ZERO_EDGE, &never_body, &never_key).unwrap()).unwrap();
    let (hello_key, hello_body) = public_ask("hello", Map::new());
    let hello_id = dialer.send(&ward, &seal::seal_ask(&ward, &hello_key, None, &seal::ZERO_EDGE, &hello_body, &hello_key).unwrap()).unwrap();
    assert_ne!(never_id, hello_id);

    let started = Instant::now();
    let back = std::thread::spawn(move || dialer.receive(hello_id).unwrap());
    let digest = stand.request(&a_hex, "digest", json!({}));
    assert!(digest["object"]["digest"].is_string(), "the root channel answers meanwhile: {digest}");
    let reply = back.join().unwrap().expect("hello is answered while never is in flight");
    assert!(started.elapsed() < Duration::from_secs(5));
    let opened = seal::open_reply(&hello_key, &ward, &reply);
    assert!(matches!(opened, Some(Reply::Object { .. })), "{opened:?}");

    stand.finish();
}

#[test]
fn root_requests_are_answered_concurrently_and_one_standing_keeps_its_line() {
    let mut a = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "34"]);
    let mut b = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "B", "--class", "Host", "--entropy", "35"]);
    let (a_hex, a_at) = a.boot_lines(1)[0].clone();
    let (b_hex, _) = b.boot_lines(1)[0].clone();
    a.request(&a_hex, "boot", json!({ "key": "host", "class": "Host" }));
    b.request(&b_hex, "boot", json!({ "key": "host", "class": "Host" }));
    b.request(&b_hex, "route", json!({ "far": a_hex, "at": a_at }));
    for id in ["s1", "s2", "s3"] {
        let invitation = a.request(&a_hex, "invite", json!({ "being": "host", "id": id }))["object"]["invitation"].clone();
        b.request(&b_hex, "knock", json!({ "being": "host", "invitation": invitation, "method": "hello" }));
        let taken = b.request(&b_hex, "take", json!({ "being": "host", "id": id, "invitation": invitation }));
        assert_eq!(taken["object"]["taken"], id, "{taken}");
    }

    // Three standings, three slow asks at once: answered together.
    let started = Instant::now();
    for id in ["s1", "s2", "s3"] {
        b.send_raw(&json!({ "id": id, "ward": b_hex, "method": "ask", "args": { "being": "host", "id": id, "method": "slow" } }).to_string());
    }
    let mut ids: Vec<String> = (0..3)
        .map(|_| b.answer())
        .map(|r| {
            assert_eq!(r["object"]["slow"], true, "{r}");
            r["id"].as_str().unwrap().to_owned()
        })
        .collect();
    ids.sort();
    assert_eq!(ids, ["s1", "s2", "s3"]);
    assert!(started.elapsed() < Duration::from_millis(4000), "answered concurrently, took {:?}", started.elapsed());

    // One standing, two slow asks: the second waits its line.
    let started = Instant::now();
    for n in ["x", "y"] {
        b.send_raw(&json!({ "id": n, "ward": b_hex, "method": "ask", "args": { "being": "host", "id": "s1", "method": "slow" } }).to_string());
    }
    for _ in 0..2 {
        let r = b.answer();
        assert_eq!(r["object"]["slow"], true, "{r}");
    }
    assert!(started.elapsed() >= Duration::from_millis(4000), "one line, took {:?}", started.elapsed());
    let hello = b.request(&b_hex, "ask", json!({ "being": "host", "id": "s1", "method": "hello" }));
    assert_eq!(hello["object"]["hi"], "s1", "the relation stands after its line: {hello}");

    a.finish();
    b.finish();
}

/// Chapter 6: a connection that closes with asks in flight answers none of
/// them, and an ask whose frame left is ended by the allowance as `late`.
#[test]
fn a_connection_closed_with_the_ask_in_flight_is_late() {
    let mut a = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "36"]);
    let mut b = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "B", "--class", "Host", "--entropy", "37"]);
    let (a_hex, _) = a.boot_lines(1)[0].clone();
    let (b_hex, _) = b.boot_lines(1)[0].clone();
    b.request(&b_hex, "boot", json!({ "key": "host", "class": "Host" }));

    // A listener that reads the whole ask frame and then closes.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
    let closer = listener.local_addr().unwrap().to_string();
    std::thread::spawn(move || {
        use std::io::Read;
        if let Ok((mut stream, _)) = listener.accept() {
            let mut length = [0u8; 4];
            if stream.read_exact(&mut length).is_ok() {
                let mut body = vec![0u8; u32::from_be_bytes(length) as usize];
                let _ = stream.read_exact(&mut body);
            }
        }
    });
    b.request(&b_hex, "route", json!({ "far": a_hex, "at": closer }));

    let started = Instant::now();
    let knocked = b.request(&b_hex, "knock", json!({ "being": "host", "invitation": { "ward": a_hex }, "method": "hello", "wanted": 300 }));
    assert_eq!(knocked["quo"], "late", "{knocked}");
    assert!(started.elapsed() < Duration::from_secs(5));

    a.finish();
    b.finish();
}

#[test]
fn wanted_in_milliseconds_ends_an_ask_to_never_late() {
    let mut a = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "32"]);
    let mut b = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "B", "--class", "Host", "--entropy", "33"]);
    let (a_hex, a_at) = a.boot_lines(1)[0].clone();
    let (b_hex, _) = b.boot_lines(1)[0].clone();
    a.request(&a_hex, "boot", json!({ "key": "host", "class": "Host" }));
    a.request(&a_hex, "public", json!({ "key": "host" }));
    b.request(&b_hex, "boot", json!({ "key": "host", "class": "Host" }));
    b.request(&b_hex, "route", json!({ "far": a_hex, "at": a_at }));

    let started = Instant::now();
    let knocked = b.request(&b_hex, "knock", json!({ "being": "host", "invitation": { "ward": a_hex }, "method": "never", "wanted": 200 }));
    assert_eq!(knocked["quo"], "late", "{knocked}");
    assert!(started.elapsed() < Duration::from_secs(5), "ended by the 200 ms allowance, not the kit's default");

    a.finish();
    b.finish();
}
