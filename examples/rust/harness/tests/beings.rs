// SPDX-License-Identifier: Apache-2.0
//! The harness beings against `SCENARIOS.md` "The beings".

mod support;

use serde_json::json;
use support::{error_of, Stand};

#[test]
fn host_caller_and_stillborn_are_as_the_scenarios_write_them() {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host", "--class", "Caller", "--class", "Stillborn", "--entropy", "3"]);
    let a = stand.boot_lines(1)[0].0.clone();
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));

    stand.request(&a, "boot", json!({ "maker": "host", "key": "b", "class": "Host", "occupant": "b", "standing": "a" }));

    let blueprint = stand.request(&a, "ask", json!({ "being": "b", "id": "a" }))["object"].clone();
    let asks = blueprint["asks"].as_array().expect("asks");
    let names: Vec<&str> = asks.iter().map(|x| x["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["hello", "echo", "err", "quiet", "boom", "bad", "never", "slow", "join", "shape", "hidden"], "the occupant b sees it whole: {blueprint}");
    assert_eq!(asks[0]["input"], json!({ "type": "object" }), "{blueprint}");
    assert_eq!(asks[9]["input"]["properties"]["mode"]["enum"], json!(["plain", "extra", "throws", "numeric", "field"]), "{blueprint}");
    assert_eq!(blueprint["notes"]["third"], json!(0.3333333333333333), "{blueprint}");

    let hello = stand.request(&a, "ask", json!({ "being": "b", "id": "a", "method": "hello", "args": { "pad": "x" } }));
    assert_eq!(hello["object"]["hi"], "b", "hello reads no args: {hello}");
    let spoil = stand.request(&a, "ask", json!({ "being": "b", "id": "a", "method": "spoil" }));
    assert_eq!(spoil["quo"], "threw", "no spoil method: {spoil}");

    stand.request(&a, "boot", json!({ "key": "caller", "class": "Caller" }));
    let invitation = stand.request(&a, "invite", json!({ "being": "caller", "id": "host" }))["object"]["invitation"].clone();
    let caller = stand.request(&a, "knock", json!({ "being": "host", "invitation": invitation }))["object"].clone();
    assert_eq!(caller["asks"][0]["name"], "hi", "{caller}");
    assert_eq!(caller["notes"], json!({}), "{caller}");

    let still = stand.request(&a, "boot", json!({ "key": "s", "class": "Stillborn" }));
    assert_eq!(error_of(&still), Some("absent"), "{still}");
    stand.finish();
}
