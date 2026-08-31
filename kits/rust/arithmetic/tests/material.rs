//! The fixed keys every other corpus file refers to. `material.json` carries
//! no vectors; it carries names, and what this bench asserts is every
//! relation between them that Article VI compels — a pair from its secret, a
//! commitment from its warden and its heir. The names that stand for nothing
//! derivable are listed by hand, and the bench asserts that the names it
//! accounted for are exactly the names in the file, so no name is skipped
//! silently.

#[path = "../../support/hex.rs"]
mod hex;
#[path = "../../support/json.rs"]
mod json;

use hex::{hex, key};
use quo_arithmetic as arithmetic;
use std::collections::BTreeSet;

fn material() -> json::Json {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../js/vectors/material.json"
    );
    let source = std::fs::read_to_string(path).expect("the pinned corpus");
    let corpus = json::parse(&source);
    assert_eq!(corpus.get("area").expect("an area").text(), "material");
    assert_eq!(corpus.get("encoding").expect("an encoding").text(), "hex");
    corpus.get("material").expect("the material").clone()
}

/// A signing pair: the seed, and the pk the algorithm derives from it.
const SIGNING: [(&str, &str); 4] = [
    ("wardenNameSecret", "wardenName"),
    ("voiceSecret", "voice"),
    ("voiceHeirSecret", "voiceHeir"),
    ("successorSecret", "successor"),
];

/// A sealing pair: the private key itself, and its public half.
const SEALING: [(&str, &str); 3] = [
    ("padlockSecret", "padlock"),
    ("returnPadlockSecret", "returnPadlock"),
    ("ephemeralSecret", "ephemeral"),
];

/// A commitment: the warden it would be spent at, the heir, and the digest.
/// The warden's own commitment hashes its name under itself.
const COMMITMENTS: [(&str, &str, &str); 2] = [
    ("wardenName", "wardenHeir", "wardenCommitment"),
    ("wardenName", "voiceHeir", "voiceHeirCommitment"),
];

/// Names the file fixes without giving anything to derive them from: a
/// being's own name, and two commitments whose heirs are not in the file.
/// They are thirty-two bytes and nothing more is claimed of them.
const OPAQUE: [&str; 3] = ["being", "beingCommitment", "nextHeirCommitment"];

#[test]
fn every_name_in_the_material() {
    let material = material();
    let mut accounted: BTreeSet<&str> = BTreeSet::new();

    for (secret, pk) in SIGNING {
        let seed = key(material.get(secret).expect(secret).text());
        assert_eq!(
            hex(&arithmetic::signing_pk(&seed)),
            material.get(pk).expect(pk).text(),
            "{pk} is the Ed25519 pk of {secret}"
        );
        accounted.insert(secret);
        accounted.insert(pk);
    }

    for (secret, pk) in SEALING {
        let private = key(material.get(secret).expect(secret).text());
        assert_eq!(
            hex(&arithmetic::sealing_pk(&private)),
            material.get(pk).expect(pk).text(),
            "{pk} is the X25519 pk of {secret}"
        );
        accounted.insert(secret);
        accounted.insert(pk);
    }

    for (warden, heir, commitment) in COMMITMENTS {
        let warden_pk = key(material.get(warden).expect(warden).text());
        let heir_pk = key(material.get(heir).expect(heir).text());
        assert_eq!(
            hex(&arithmetic::commitment(&warden_pk, &heir_pk)),
            material.get(commitment).expect(commitment).text(),
            "{commitment} is {warden} then {heir}, hashed"
        );
        accounted.insert(warden);
        accounted.insert(heir);
        accounted.insert(commitment);
    }

    for name in OPAQUE {
        assert_eq!(
            key(material.get(name).expect(name).text()).len(),
            arithmetic::KEY,
            "{name} is thirty-two bytes"
        );
        accounted.insert(name);
    }

    let named: BTreeSet<&str> = material.names().into_iter().collect();
    println!("material: {} names, all of them accounted for", named.len());
    assert_eq!(accounted, named, "every name in the file is accounted for");
}

#[test]
fn the_agreement_is_the_same_from_either_side() {
    let material = material();
    let padlock_secret = key(material.get("padlockSecret").expect("it").text());
    let padlock = key(material.get("padlock").expect("it").text());
    let ephemeral_secret = key(material.get("ephemeralSecret").expect("it").text());
    let ephemeral = key(material.get("ephemeral").expect("it").text());

    assert_eq!(
        arithmetic::agree(&ephemeral_secret, &padlock),
        arithmetic::agree(&padlock_secret, &ephemeral)
    );
}
