//! **A road is not the core.** Article III makes delivery's manner free and
//! the meeting point law; the kit keeps that split in its own layout, and
//! this asserts the split rather than trusting it.
//!
//! `quo-carriage` and `quo-line` are the only crates here that reach a host.
//! `quo-notation`, `quo-arithmetic`, `quo-wire`, `quo-envelope` and
//! `quo-warden` open no socket, read no clock, touch no file and start no
//! thread — every arrival reading, every key and every draw of randomness
//! arrives as an argument, which is what lets a whole judgment be reproduced
//! rather than merely exercised.

use std::fs;
use std::path::{Path, PathBuf};

const CORE: [&str; 5] = ["notation", "arithmetic", "wire", "envelope", "warden"];

/// The three roads Article III names. `zero` is a road with no wire, so it is
/// the one that reaches no host either — which is asserted below rather than
/// assumed.
const ROADS: [&str; 3] = ["carriage", "line", "zero"];

/// The two roads that have a wire, and so a socket.
const WIRED: [&str; 2] = ["carriage", "line"];

/// The host is reached through these and through nothing else in `std`.
const REACHES: [&str; 8] = [
    "std::net",
    "std::fs",
    "std::process",
    "std::thread",
    "SystemTime",
    "Instant",
    "getrandom",
    "OsRng",
];

fn kit() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("the workspace")
        .to_path_buf()
}

fn source(crate_name: &str) -> Vec<(PathBuf, String)> {
    let mut found = Vec::new();
    let at = kit().join(crate_name).join("src");
    for entry in fs::read_dir(&at).expect("a crate with source") {
        let path = entry.expect("an entry").path();
        if path.extension().is_some_and(|end| end == "rs") {
            let text = fs::read_to_string(&path).expect("readable source");
            found.push((path, text));
        }
    }
    assert!(!found.is_empty(), "{crate_name} has source");
    found.sort_by(|(one, _), (two, _)| one.cmp(two));
    found
}

/// **The kit whole reaches the host in one file.** `quo` names every crate
/// under one dependency and adds the host: it stands the roads and is delivery
/// beneath the warden, so it is the one place outside a road that opens a
/// socket or reads a clock. That place is `host.rs` and no other file, because
/// a seam spread over a crate is a seam nobody can audit.
#[test]
fn article_iii_the_kit_whole_reaches_the_host_in_one_file_and_no_other() {
    let mut reaching = Vec::new();
    for (path, text) in source("quo") {
        if REACHES.iter().any(|reach| text.contains(reach)) {
            reaching.push(
                path.file_name()
                    .expect("a file")
                    .to_string_lossy()
                    .to_string(),
            );
        }
    }
    assert_eq!(
        reaching,
        vec!["host.rs".to_string()],
        "the kit whole reaches the host somewhere other than its host"
    );
}

#[test]
fn article_iii_the_core_reaches_no_host() {
    for crate_name in CORE {
        for (path, text) in source(crate_name) {
            for reach in REACHES {
                assert!(
                    !text.contains(reach),
                    "{} reaches the host through {reach}",
                    path.display()
                );
            }
        }
    }
}

#[test]
fn article_iii_the_roads_are_the_only_crates_that_reach_a_host() {
    let mut reaching = Vec::new();
    for crate_name in WIRED {
        for (_, text) in source(crate_name) {
            if text.contains("std::net") {
                reaching.push(crate_name);
            }
        }
    }
    assert!(
        reaching.contains(&"carriage") && reaching.contains(&"line"),
        "both wired roads open a socket, or they are not roads: {reaching:?}"
    );
}

/// **At distance zero the carriage is a call**, and a call has no wire. The
/// third road reaches the host through nothing at all — it is the only crate
/// in the kit that is a road and still meets the core's own standard.
#[test]
fn article_iii_distance_zero_has_no_wire_and_so_reaches_no_host() {
    for (path, text) in source("zero") {
        for reach in REACHES {
            assert!(
                !text.contains(reach),
                "{} reaches the host through {reach}, and distance zero has no wire",
                path.display()
            );
        }
    }
}

#[test]
fn article_iii_no_core_crate_depends_on_a_road() {
    for crate_name in CORE {
        let manifest =
            fs::read_to_string(kit().join(crate_name).join("Cargo.toml")).expect("a manifest");
        for road in ["quo-carriage", "quo-line", "quo-zero"] {
            assert!(
                !manifest.contains(road),
                "{crate_name} depends on {road}, and a road is not the core"
            );
        }
    }
}

/// The five crates Article VI's primitives are taken from, one per primitive.
const THE_FIVE: [&str; 5] = ["ed25519-dalek", "x25519-dalek", "sha2", "aes-gcm", "hkdf"];

/// The kit's own crates, which are not dependencies on anyone else.
const OURS: [&str; 8] = [
    "quo-notation",
    "quo-arithmetic",
    "quo-wire",
    "quo-envelope",
    "quo-warden",
    "quo-carriage",
    "quo-line",
    "quo-zero",
];

/// TLS is not a primitive and it is not the core's. A crate for it is the
/// common carriage's alone: **the road is where the wire is, and nowhere else
/// in this kit may name one.** The list is empty until Razvan's approval puts
/// a name in it; the guard stands either way, so a crate cannot arrive
/// anywhere but in `carriage/Cargo.toml`.
const TLS: [&str; 0] = [];

/// Every dependency in every manifest, and **the crate each one is allowed
/// in**. A flat approved list would let a crypto crate wander into a road or
/// a TLS crate into the core; this refuses both by name.
fn allowed_in(crate_name: &str) -> Vec<&'static str> {
    let mut allowed: Vec<&'static str> = OURS.to_vec();
    match crate_name {
        // The workspace root, where the five are pinned once for the crates
        // beneath.
        "" => allowed.extend(THE_FIVE),
        "notation" | "arithmetic" | "envelope" | "warden" | "wire" => allowed.extend(THE_FIVE),
        "carriage" => allowed.extend(TLS),
        _ => {}
    }
    allowed
}

#[test]
fn every_dependency_is_approved_and_stands_only_where_it_may() {
    let mut manifests: Vec<(&str, PathBuf)> = CORE
        .iter()
        .chain(ROADS.iter())
        .map(|crate_name| (*crate_name, kit().join(crate_name).join("Cargo.toml")))
        .collect();
    manifests.push(("", kit().join("Cargo.toml")));
    manifests.push(("quo", kit().join("quo").join("Cargo.toml")));
    manifests.push(("subject", kit().join("subject").join("Cargo.toml")));
    manifests.push(("conformance", kit().join("conformance").join("Cargo.toml")));

    for (crate_name, manifest) in manifests {
        let allowed = allowed_in(crate_name);
        let text = fs::read_to_string(&manifest).expect("a manifest");
        let mut inside = false;
        for line in text.lines() {
            let line = line.trim();
            if line.starts_with('[') {
                inside = line.contains("dependencies");
                continue;
            }
            if !inside || line.is_empty() || line.starts_with('#') {
                continue;
            }
            let Some((name, _)) = line.split_once('=') else {
                continue;
            };
            // `sha2.workspace = true` names `sha2`.
            let name = name.trim().split('.').next().expect("a name");
            assert!(
                allowed.contains(&name),
                "{} takes {name}, which is not approved to stand there",
                manifest.display()
            );
        }
    }
}
