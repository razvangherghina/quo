// SPDX-License-Identifier: Apache-2.0
//! The smoke test: `stand` with two wards on one listener, driven over the
//! root channel of `HARNESS.md` section 2 alone, inviting, knocking, taking
//! and asking between them.

mod support;

use support::Stand;

#[test]
fn two_wards_invite_knock_take_ask() {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--ward", "B", "--class", "Host", "--entropy", "42"]);
    let booted = stand.boot_lines(2);
    let (a, _) = booted[0].clone();
    let (b, _) = booted[1].clone();

    let booted_a = stand.request(&a, "boot", serde_json::json!({ "key": "host", "class": "Host" }));
    assert_eq!(booted_a["object"]["booted"], "host", "{booted_a}");
    let booted_b = stand.request(&b, "boot", serde_json::json!({ "key": "host", "class": "Host" }));
    assert_eq!(booted_b["object"]["booted"], "host", "{booted_b}");

    let invited = stand.request(&a, "invite", serde_json::json!({ "being": "host", "id": "occ" }));
    let invitation = invited["object"]["invitation"].clone();
    assert!(invitation.is_object(), "an invitation is an object: {invited}");

    let knocked = stand.request(&b, "knock", serde_json::json!({ "being": "host", "invitation": invitation, "method": "hello", "args": {} }));
    assert_eq!(knocked["object"]["hi"], "occ", "A's Host answers by A's own id for the occupant: {knocked}");

    let taken = stand.request(&b, "take", serde_json::json!({ "being": "host", "id": "a", "invitation": invitation }));
    assert_eq!(taken["object"]["taken"], "a", "{taken}");

    let asked = stand.request(&b, "ask", serde_json::json!({ "being": "host", "id": "a", "method": "hello", "args": {} }));
    assert_eq!(asked["object"]["hi"], "occ", "asking on the standing reaches the same door: {asked}");

    let standing = stand.request(&b, "standing", serde_json::json!({ "being": "host", "id": "a" }));
    assert!(standing["object"]["digest"].is_null() || standing["object"]["digest"].is_string(), "{standing}");

    stand.finish();
}
