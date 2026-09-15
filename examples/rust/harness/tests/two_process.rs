// SPDX-License-Identifier: Apache-2.0
//! Two `stand` processes of this kit, each on its own address, both
//! reachable over real TCP at once, and, with `route`, dialing each other.

mod support;

use quo_kit::seal::WardPk;
use quo_kit::seal::{self, Reply};
use quo_kit::value::Map;
use quo_kit::wire::Dialer;
use serde_json::json;
use std::str::FromStr;
use support::{error_of, public_ask, Stand};

#[test]
fn two_independently_launched_stand_processes_both_answer_real_tcp() {
    let mut a = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "11"]);
    let mut b = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "B", "--class", "Host", "--entropy", "12"]);

    let a_boot = a.boot_lines(1);
    let b_boot = b.boot_lines(1);
    let (a_pk, a_at) = a_boot[0].clone();
    let (b_pk, b_at) = b_boot[0].clone();
    assert_ne!(a_at, b_at, "two processes, two real addresses");

    a.request(&a_pk, "boot", json!({ "key": "host", "class": "Host" }));
    b.request(&b_pk, "boot", json!({ "key": "host", "class": "Host" }));
    a.request(&a_pk, "public", json!({ "key": "host" }));
    b.request(&b_pk, "public", json!({ "key": "host" }));

    let ward_a = WardPk::from_str(&a_pk).unwrap();
    let ward_b = WardPk::from_str(&b_pk).unwrap();
    let mut dialer_a = Dialer::dial(&a_at).expect("a real connection to A");
    let mut dialer_b = Dialer::dial(&b_at).expect("a real connection to B");

    let (key_a, body_a) = public_ask("hello", Map::new());
    let (key_b, body_b) = public_ask("hi", Map::new());
    let sealed_a = seal::seal_ask(&ward_a, &key_a, None, &seal::ZERO_EDGE, &body_a, &key_a).unwrap();
    let sealed_b = seal::seal_ask(&ward_b, &key_b, None, &seal::ZERO_EDGE, &body_b, &key_b).unwrap();

    let reply_a = dialer_a.ask(&ward_a, &sealed_a).unwrap().expect("A's own process answers on A's own socket");
    let reply_b = dialer_b.ask(&ward_b, &sealed_b).unwrap().expect("B's own process answers on B's own socket");
    assert!(matches!(seal::open_reply(&key_a, &ward_a, &reply_a), Some(Reply::Object { .. })));
    // B's Host has no method named "hi": she throws, and the door answers
    // a stranger silence rather than a word, since a word is never said to
    // the public asker.
    assert!(matches!(seal::open_reply(&key_b, &ward_b, &reply_b), Some(Reply::Silence)));

    a.finish();
    b.finish();
}

/// The piece the test above named as still missing: two `stand` processes,
/// each routed to the other's real address by section 4's `route`, a being
/// on A inviting and a being on B knocking, taking and asking, every ask of
/// that edge carried over a real TCP dial B's own carrier makes to A. Only B
/// ever dials, since the edge's asks all flow from B's standing to A's
/// occupant, but both directions are routed, as the verb's own shape asks.
#[test]
fn two_stand_processes_routed_to_each_other_invite_knock_take_and_ask_over_real_tcp() {
    let mut a = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--entropy", "21"]);
    let mut b = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "B", "--class", "Host", "--entropy", "22"]);

    let a_boot = a.boot_lines(1);
    let b_boot = b.boot_lines(1);
    let (a_pk, a_at) = a_boot[0].clone();
    let (b_pk, b_at) = b_boot[0].clone();
    assert_ne!(a_at, b_at, "two processes, two real addresses");

    let routed_a = a.request(&a_pk, "route", json!({ "far": b_pk, "at": b_at }));
    assert_eq!(error_of(&routed_a), None, "{routed_a}");
    let routed_b = b.request(&b_pk, "route", json!({ "far": a_pk, "at": a_at }));
    assert_eq!(error_of(&routed_b), None, "{routed_b}");

    a.request(&a_pk, "boot", json!({ "key": "host", "class": "Host" }));
    b.request(&b_pk, "boot", json!({ "key": "host", "class": "Host" }));

    let invited = a.request(&a_pk, "invite", json!({ "being": "host", "id": "occ" }));
    let invitation = invited["object"]["invitation"].clone();
    assert!(invitation.is_object(), "an invitation is an object: {invited}");

    // B's own carrier dials A for real, over the address `route` gave it.
    let knocked = b.request(&b_pk, "knock", json!({ "being": "host", "invitation": invitation, "method": "hello", "args": {} }));
    assert_eq!(knocked["object"]["hi"], "occ", "A's Host answers by A's own id for the occupant, over the wire: {knocked}");

    let taken = b.request(&b_pk, "take", json!({ "being": "host", "id": "a", "invitation": invitation }));
    assert_eq!(taken["object"]["taken"], "a", "{taken}");

    let asked = b.request(&b_pk, "ask", json!({ "being": "host", "id": "a", "method": "hello", "args": {} }));
    assert_eq!(asked["object"]["hi"], "occ", "asking on the standing reaches the same far door, again over real TCP: {asked}");

    a.finish();
    b.finish();
}
