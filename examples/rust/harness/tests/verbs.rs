// SPDX-License-Identifier: Apache-2.0
//! One test per refusal of `HARNESS.md` section 2 and one per harbor verb
//! of section 4, driven over the root channel alone.

mod support;

use serde_json::json;
use support::{error_of, Stand};

fn one_ward(class: &str) -> (Stand, String) {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", class, "--entropy", "1"]);
    let booted = stand.boot_lines(1);
    (stand, booted[0].0.clone())
}

fn one_ward_at(class: &str) -> (Stand, String, String) {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", class, "--entropy", "1"]);
    let booted = stand.boot_lines(1);
    (stand, booted[0].0.clone(), booted[0].1.clone())
}

// --- Section 6's stream, without `--entropy` ----------------------------

#[test]
fn without_entropy_draws_from_the_operating_system_and_still_invites() {
    // No `--entropy`: every key this ward mints comes from `/dev/urandom`
    // (or its fallback), which this test cannot pin a byte of, only that
    // the ward still runs and every draw still makes a usable key.
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--class", "Host"]);
    let booted = stand.boot_lines(1);
    let a = booted[0].0.clone();
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    let invited = stand.request(&a, "invite", json!({ "being": "host", "id": "occ" }));
    assert_eq!(error_of(&invited), None, "{invited}");
    assert!(invited["object"]["invitation"]["heir"].is_string(), "a real key drawn for the invitation: {invited}");
    stand.finish();
}

// --- Section 2's six named refusals ------------------------------------

#[test]
fn refusal_no_such_class() {
    let (mut stand, a) = one_ward("Host");
    let r = stand.request(&a, "boot", json!({ "key": "x", "class": "Nope" }));
    assert_eq!(error_of(&r), Some("no such class"), "{r}");
    stand.finish();
}

#[test]
fn refusal_key_taken() {
    let (mut stand, a) = one_ward("Host");
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    let r = stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    assert_eq!(error_of(&r), Some("key taken"), "{r}");
    // The ward's own pk is taken from birth.
    let r2 = stand.request(&a, "boot", json!({ "key": a, "class": "Host" }));
    assert_eq!(error_of(&r2), Some("key taken"), "{r2}");
    stand.finish();
}

#[test]
fn refusal_no_such_being() {
    let (mut stand, a) = one_ward("Host");
    for (method, args) in [
        ("public", json!({ "key": "nobody" })),
        ("invite", json!({ "being": "nobody", "id": "x" })),
        ("remove", json!({ "being": "nobody", "id": "x" })),
        ("knock", json!({ "being": "nobody", "invitation": {} })),
        ("take", json!({ "being": "nobody", "id": "x", "invitation": {} })),
        ("ask", json!({ "being": "nobody", "id": "x" })),
        ("standing", json!({ "being": "nobody", "id": "x" })),
    ] {
        let r = stand.request(&a, method, args.clone());
        assert_eq!(error_of(&r), Some("no such being"), "{method}: {r}");
    }
    stand.finish();
}

#[test]
fn refusal_absent() {
    let (mut stand, a) = one_ward("Stillborn");
    // Stillborn throws while she is made: HARNESS.md section 2 names her
    // boot's own refusal, `{ error: "absent" }` ("boot of a class that
    // threw while it was made"). This kit's `Ward::ask("boot",..)` answers
    // success either way, so the adapter asks `being_status` after the
    // fact, the same read every per-being verb here already makes. Every
    // later request naming her key still finds her absent.
    let booted = stand.request(&a, "boot", json!({ "key": "s", "class": "Stillborn" }));
    assert_eq!(error_of(&booted), Some("absent"), "{booted}");
    for (method, args) in [("public", json!({ "key": "s" })), ("invite", json!({ "being": "s", "id": "x" })), ("knock", json!({ "being": "s", "invitation": {} }))] {
        let r = stand.request(&a, method, args.clone());
        assert_eq!(error_of(&r), Some("absent"), "{method}: {r}");
    }
    stand.finish();
}

#[test]
fn refusal_id_taken() {
    let (mut stand, a) = one_ward("Host");
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    stand.request(&a, "invite", json!({ "being": "host", "id": "occ" }));
    let r = stand.request(&a, "invite", json!({ "being": "host", "id": "occ" }));
    assert_eq!(error_of(&r), Some("id taken"), "{r}");
    stand.finish();
}

#[test]
fn refusal_no_such_standing() {
    let (mut stand, a) = one_ward("Host");
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    let r = stand.request(&a, "standing", json!({ "being": "host", "id": "nope" }));
    assert_eq!(error_of(&r), Some("no such standing"), "{r}");
    stand.finish();
}

// --- Boot's occupant and standing relation ------------------------------

#[test]
fn boot_occupant_and_standing_relation() {
    let (mut stand, a) = one_ward("Host");
    // HARNESS.md section 2: the relation is between the made being and the
    // being `maker` names. `occupant` is the maker's id for the made being,
    // `standing` the made being's id for her maker.
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    let booted = stand.request(&a, "boot", json!({ "maker": "host", "key": "child", "class": "Host", "occupant": "made", "standing": "maker" }));
    assert_eq!(booted["object"]["booted"], "child", "{booted}");
    // The made being's standing `maker` reaches her maker, who knows her as `made`.
    let asked = stand.request(&a, "ask", json!({ "being": "child", "id": "maker", "method": "hello" }));
    assert_eq!(asked["object"]["hi"], "made", "{asked}");
    // The maker holds `made` as an occupant, and no standing of that id.
    let taken = stand.request(&a, "invite", json!({ "being": "host", "id": "made" }));
    assert_eq!(error_of(&taken), Some("id taken"), "{taken}");
    // The made being holds no relation to herself.
    let own = stand.request(&a, "standing", json!({ "being": "child", "id": "made" }));
    assert_eq!(error_of(&own), Some("no such standing"), "{own}");
    let unmade = stand.request(&a, "boot", json!({ "maker": "nobody", "key": "x", "class": "Host", "occupant": "o", "standing": "s" }));
    assert_eq!(error_of(&unmade), Some("no such being"), "{unmade}");
    stand.finish();
}

/// A and B in one program, A's `host` inviting `b`, B's `host` holding the
/// standing `a` to it.
fn related() -> (Stand, String, String) {
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", "A", "--ward", "B", "--class", "Host", "--entropy", "7"]);
    let booted = stand.boot_lines(2);
    let (a, b) = (booted[0].0.clone(), booted[1].0.clone());
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    stand.request(&b, "boot", json!({ "key": "host", "class": "Host" }));
    let invitation = stand.request(&a, "invite", json!({ "being": "host", "id": "b" }))["object"]["invitation"].clone();
    let knocked = stand.request(&b, "knock", json!({ "being": "host", "invitation": invitation, "method": "hello" }));
    assert_eq!(knocked["object"]["hi"], "b", "{knocked}");
    let taken = stand.request(&b, "take", json!({ "being": "host", "id": "a", "invitation": invitation }));
    assert_eq!(taken["object"]["taken"], "a", "{taken}");
    (stand, a, b)
}

#[test]
fn verb_forget_deletes_an_occupant_record_of_a_stopped_ward() {
    let (mut stand, a, _) = related();
    let running = stand.request(&a, "forget", json!({ "being": "host", "id": "b" }));
    assert_eq!(error_of(&running), Some("running"), "{running}");
    stand.request(&a, "stop", json!({}));
    let none = stand.request(&a, "forget", json!({ "being": "host", "id": "nobody" }));
    assert_eq!(none["object"]["forgot"], serde_json::Value::Null, "{none}");
    let forgot = stand.request(&a, "forget", json!({ "being": "host", "id": "b" }));
    assert_eq!(forgot["object"]["forgot"], "b", "{forgot}");
    stand.request(&a, "stand", json!({}));
    let host = stand.request(&a, "ask", json!({ "being": "host", "method": "hello" }));
    assert_eq!(error_of(&host), None, "the being stands again without her record: {host}");
    let again = stand.request(&a, "forget", json!({ "being": "host", "id": "b" }));
    assert_eq!(error_of(&again), Some("running"), "{again}");
    stand.finish();
}

#[test]
fn a_held_key_whose_occupant_record_was_forgotten_hears_removed() {
    let (mut stand, a, b) = related();
    stand.request(&a, "stop", json!({}));
    stand.request(&a, "forget", json!({ "being": "host", "id": "b" }));
    stand.request(&a, "stand", json!({}));
    let asked = stand.request(&b, "ask", json!({ "being": "host", "id": "a", "method": "hello" }));
    assert_eq!(asked["quo"], "removed", "{asked}");
    stand.finish();
}

#[test]
fn a_digest_stands_over_a_cell_nested_past_sixty_four_inside_the_partition() {
    let (mut stand, a, b) = related();
    // The cell `echoed` holds `{ v }`, depth sixty-three, so the partition
    // holding it nests past sixty-four.
    let mut arg = json!(0);
    for _ in 0..62 {
        arg = json!([arg]);
    }
    let echoed = stand.request(&b, "ask", json!({ "being": "host", "id": "a", "method": "echo", "args": { "v": arg } }));
    assert!(echoed["object"]["v"].is_array(), "{echoed}");
    let digest = stand.request(&a, "digest", json!({}));
    assert!(digest["object"]["digest"].is_string(), "{digest}");
    stand.finish();
}

#[test]
fn an_object_of_depth_sixty_four_comes_back_on_the_root_channel_and_its_partition_file_stands() {
    let (mut stand, a, b) = related();
    // `echo` answers `{ v }` with `v` nested sixty-three deep: an object of
    // depth sixty-four, a value, which the root channel answers as it came.
    let mut arg = json!(0);
    for _ in 0..63 {
        arg = json!([arg]);
    }
    let echoed = stand.request(&b, "ask", json!({ "being": "host", "id": "a", "method": "echo", "args": { "v": arg } }));
    assert_eq!(echoed["object"]["v"], arg, "{echoed}");
    // A's cell `echoed` now holds that value, so its partition file nests
    // past sixty-four, and A stands again from it.
    let file = std::env::temp_dir().join(format!("quo-deep-{}.json", std::process::id()));
    let file = file.to_str().unwrap();
    let saved = stand.request(&a, "save", json!({ "file": file }));
    assert_eq!(saved["object"]["saved"], file, "{saved}");
    stand.request(&a, "stop", json!({}));
    let stood = stand.request(&a, "stand", json!({ "file": file }));
    assert_eq!(stood["object"]["stood"], a, "{stood}");
    let asked = stand.request(&b, "ask", json!({ "being": "host", "id": "a", "method": "hello" }));
    assert_eq!(asked["object"]["hi"], "b", "{asked}");
    stand.finish();
}

#[test]
fn a_request_whose_args_carry_a_non_value_is_answered() {
    let (mut stand, _, b) = related();
    for number in ["-0", "-0.0", "1e400"] {
        let line = format!(r#"{{"id":"n","ward":"{b}","method":"ask","args":{{"being":"host","id":"a","method":"echo","args":{{"v":{number}}}}}}}"#);
        let asked = stand.raw(&line);
        assert_eq!(asked, json!({ "id": "n", "quo": "unreached" }), "{number}");
        let line = format!(r#"{{"id":"r","ward":"{b}","method":"invite","args":{{"being":"host","id":"x","notes":{number}}}}}"#);
        let refused = stand.raw(&line);
        assert_eq!(refused["id"], "r", "{refused}");
        assert!(error_of(&refused).is_some(), "{refused}");
    }
    // The relation was not touched: the next ask is answered.
    let asked = stand.request(&b, "ask", json!({ "being": "host", "id": "a", "method": "hello" }));
    assert_eq!(asked["object"]["hi"], "b", "{asked}");
    stand.finish();
}

// --- Section 4's harbor verbs -------------------------------------------

#[test]
fn verb_stop_and_stand() {
    let (mut stand, a) = one_ward("Host");
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));

    let stopped = stand.request(&a, "stop", json!({}));
    assert_eq!(stopped["object"]["stopped"], a, "{stopped}");
    let r = stand.request(&a, "boot", json!({ "key": "x", "class": "Host" }));
    assert_eq!(error_of(&r), Some("no such ward"), "a stopped ward stands no more: {r}");

    let stood = stand.request(&a, "stand", json!({}));
    assert_eq!(stood["object"]["stood"], a, "{stood}");
    // Her partition survived the stop: `host` is still there.
    let asked = stand.request(&a, "ask", json!({ "being": "host", "method": "hello", "args": {} }));
    assert_eq!(error_of(&asked), None, "{asked}");
    assert_eq!(asked["object"]["hi"], serde_json::Value::Null, "{asked}");
    stand.finish();
}

#[test]
fn verb_save_and_partition_file_round_trips() {
    let dir = std::env::temp_dir().join(format!("quo-rust-harness-partition-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("a.json");

    let (mut stand, a) = one_ward("Host");
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    let first = stand.request(&a, "invite", json!({ "being": "host", "id": "occ" }));
    let lock = first["object"]["invitation"]["lock"].as_str().expect("an invitation carries the lock").to_owned();
    assert_eq!(lock.len(), 2368, "{first}");
    let saved = stand.request(&a, "save", json!({ "file": file.to_str().unwrap() }));
    assert_eq!(saved["object"]["saved"], file.to_str().unwrap(), "{saved}");
    stand.finish();

    assert!(file.exists(), "save wrote the file");

    // A fresh `stand`, given that file with `--ward`, stands the same
    // ward at the same name: the being and her occupant are both there.
    let seed = "A";
    let mut reloaded = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", &format!("{seed}={}", file.to_str().unwrap()), "--class", "Host", "--entropy", "1"]);
    let booted = reloaded.boot_lines(1);
    let b = booted[0].0.clone();
    assert_eq!(b, a, "the same seed, from a file, is the same ward");
    let asked = reloaded.request(&b, "ask", json!({ "being": "host", "method": "hello", "args": {} }));
    assert_eq!(error_of(&asked), None, "{asked}");
    assert_eq!(asked["object"]["hi"], serde_json::Value::Null, "the reloaded being answers: {asked}");
    let r = reloaded.request(&b, "invite", json!({ "being": "host", "id": "occ" }));
    assert_eq!(error_of(&r), Some("id taken"), "the reloaded occupant record survived: {r}");
    // The lock was stood from the file: the next invite carries the same one.
    let next = reloaded.request(&b, "invite", json!({ "being": "host", "id": "occ2" }));
    assert_eq!(next["object"]["invitation"]["lock"].as_str(), Some(lock.as_str()), "the lock is kept across a restart from the partition: {next}");
    reloaded.finish();

    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn verb_digest_changes_only_on_a_write() {
    let (mut stand, a) = one_ward("Host");
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    let before = stand.request(&a, "digest", json!({}))["object"]["digest"].as_str().unwrap().to_owned();
    let again = stand.request(&a, "digest", json!({}))["object"]["digest"].as_str().unwrap().to_owned();
    assert_eq!(before, again, "nothing written between the two: equal");
    stand.request(&a, "invite", json!({ "being": "host", "id": "occ" }));
    let after = stand.request(&a, "digest", json!({}))["object"]["digest"].as_str().unwrap().to_owned();
    assert_ne!(before, after, "an invite wrote: the digests differ");
    stand.finish();
}

#[test]
fn verb_hold_blocks_the_next_n_outbound_asks() {
    // `hold`'s effect is on this ward's own carrier, exercised only when an
    // ask actually leaves for a far ward reached through `route`; that is
    // `tests/two_process.rs`'s own scenario, and not this one. The verb's
    // own channel shape is what this test holds it to.
    let (mut stand, a) = one_ward("Host");
    let holding = stand.request(&a, "hold", json!({ "asks": 3 }));
    assert_eq!(holding["object"]["holding"], 3, "{holding}");
    let cancel = stand.request(&a, "hold", json!({ "asks": 0 }));
    assert_eq!(cancel["object"]["holding"], 0, "a count of zero cancels: {cancel}");
    stand.finish();
}

#[test]
fn verb_drop_swallows_the_next_n_replies() {
    let (mut stand, a) = one_ward("Host");
    let dropping = stand.request(&a, "drop", json!({ "replies": 2 }));
    assert_eq!(dropping["object"]["dropping"], 2, "{dropping}");
    let cancel = stand.request(&a, "drop", json!({ "replies": 0 }));
    assert_eq!(cancel["object"]["dropping"], 0, "{cancel}");
    stand.finish();
}

#[test]
fn verb_copy_stands_a_second_listener_of_one_pk() {
    let dir = std::env::temp_dir().join(format!("quo-rust-harness-copy-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    let file = dir.join("a.json");

    let (mut stand, a, original_at) = one_ward_at("Host");
    stand.request(&a, "boot", json!({ "key": "host", "class": "Host" }));
    stand.request(&a, "save", json!({ "file": file.to_str().unwrap() }));

    let copied = stand.request(&a, "copy", json!({ "file": file.to_str().unwrap(), "listen": "127.0.0.1:0" }));
    assert_eq!(copied["object"]["copy"], a, "{copied}");
    let copy_at = copied["object"]["at"].as_str().unwrap().to_owned();
    assert!(!copy_at.is_empty());
    assert_ne!(copy_at, original_at, "a second, distinct listener");

    // The same pk, two listeners: with two now standing, `at` is required
    // to tell them apart, and each answers for herself.
    let on_copy = stand.request_at(&a, Some(&copy_at), "ask", json!({ "being": "host", "method": "hello", "args": {} }));
    assert_eq!(error_of(&on_copy), None, "{on_copy}");
    assert_eq!(on_copy["object"]["hi"], serde_json::Value::Null, "{on_copy}");
    let on_original = stand.request_at(&a, Some(&original_at), "ask", json!({ "being": "host", "method": "hello", "args": {} }));
    assert_eq!(error_of(&on_original), None, "{on_original}");
    assert_eq!(on_original["object"]["hi"], serde_json::Value::Null, "{on_original}");

    // Omitting `at` once two listeners hold one pk is the ambiguity
    // section 2 warns of; this harness answers it "no such ward" rather
    // than guessing.
    let unaddressed = stand.request(&a, "ask", json!({ "being": "host", "method": "hello", "args": {} }));
    assert_eq!(error_of(&unaddressed), Some("no such ward"), "{unaddressed}");

    stand.finish();
    std::fs::remove_dir_all(&dir).ok();
}

#[test]
fn verb_route_answers_routed_and_replaces_on_a_second_call() {
    let (mut stand, a) = one_ward("Host");
    let far = "cd".repeat(64);

    let routed = stand.request(&a, "route", json!({ "far": far, "at": "127.0.0.1:9" }));
    assert_eq!(routed["object"]["routed"], far, "{routed}");

    // A second `route` for the same `far` replaces the first; the channel
    // still just answers what it took.
    let routed_again = stand.request(&a, "route", json!({ "far": far, "at": "127.0.0.1:10" }));
    assert_eq!(routed_again["object"]["routed"], far, "{routed_again}");

    let bad = stand.request(&a, "route", json!({ "far": "not-a-pk", "at": "127.0.0.1:9" }));
    assert_eq!(error_of(&bad), Some("bad args"), "{bad}");

    let missing_at = stand.request(&a, "route", json!({ "far": far }));
    assert_eq!(error_of(&missing_at), Some("bad args"), "{missing_at}");

    stand.finish();
}

#[test]
fn verb_route_no_such_ward() {
    let (mut stand, _a) = one_ward("Host");
    let stranger = "ab".repeat(64);
    let r = stand.request(&stranger, "route", json!({ "far": "cd".repeat(64), "at": "127.0.0.1:9" }));
    assert_eq!(error_of(&r), Some("no such ward"), "{r}");
    stand.finish();
}

// --- Section 1's `--ward SEED`, taken as chapter 3 takes text -------------

#[test]
fn a_thirty_two_character_seed_is_a_name() {
    let name = "abcdefghijklmnopqrstuvwxyz012345";
    assert_eq!(name.len(), 32);
    let mut stand = Stand::spawn(&["--listen", "127.0.0.1:0", "--ward", name, "--class", "Host", "--entropy", "1"]);
    let booted = stand.boot_lines(1);
    assert_eq!(booted[0].0, quo_kit::seal::Seed::from_text(name).ward_pk().to_string());
    stand.finish();
}
