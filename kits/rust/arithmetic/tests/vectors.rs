//! The arithmetic against the pinned corpus. Every vector in
//! `arithmetic.json` is reproduced — an acceptance by its exact bytes, a
//! refusal by being refused — and the bench asserts its own case count
//! against the number of vectors in the file, so nothing is skipped
//! silently.

#[path = "../../support/hex.rs"]
mod hex;
#[path = "../../support/json.rs"]
mod json;

use hex::{bytes, hex, key, signature};
use quo_arithmetic as arithmetic;

fn corpus() -> json::Json {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../js/vectors/arithmetic.json"
    );
    let source = std::fs::read_to_string(path).expect("the pinned corpus");
    json::parse(&source)
}

fn text<'a>(vector: &'a json::Json, name: &str) -> Option<&'a str> {
    vector.get(name).map(json::Json::text)
}

#[test]
fn every_vector_in_the_corpus() {
    let corpus = corpus();
    assert_eq!(corpus.get("area").expect("an area").text(), "arithmetic");
    assert_eq!(corpus.get("encoding").expect("an encoding").text(), "hex");

    let vectors = corpus.get("vectors").expect("the vectors").list();
    assert!(!vectors.is_empty(), "the corpus carries vectors");

    let mut played = 0usize;
    let mut refused = 0usize;

    for vector in vectors {
        let name = vector.get("name").expect("a name").text();
        let refuses = vector.flag("refuses");
        assert!(
            !vector.flag("unpinned"),
            "{name}: this bench judges only what the law compels"
        );
        played += 1;
        if refuses {
            refused += 1;
        }

        // SHA-256 over anything.
        if let (Some(input), Some(wanted)) = (text(vector, "input"), text(vector, "hash")) {
            assert_eq!(hex(&arithmetic::hash(&bytes(input))), wanted, "{name}");
            continue;
        }

        // The heir commitment.
        if let (Some(warden), Some(heir), Some(wanted)) = (
            text(vector, "warden"),
            text(vector, "heir"),
            text(vector, "commitment"),
        ) {
            assert_eq!(
                hex(&arithmetic::commitment(&key(warden), &key(heir))),
                wanted,
                "{name}"
            );
            continue;
        }

        // The derivation: an empty salt, the fixed info, key then nonce.
        if let (Some(info), Some(salt), Some(shared), Some(wanted_key), Some(wanted_nonce)) = (
            text(vector, "info"),
            text(vector, "salt"),
            text(vector, "shared"),
            text(vector, "key"),
            text(vector, "nonce"),
        ) {
            assert_eq!(bytes(info), arithmetic::INFO, "{name}: the fixed info");
            assert!(salt.is_empty(), "{name}: the salt is of zero length");
            let drawn = arithmetic::derive(&key(shared));
            assert_eq!(hex(&drawn.key), wanted_key, "{name}: the key");
            assert_eq!(hex(&drawn.nonce), wanted_nonce, "{name}: the nonce");
            continue;
        }

        // The seal, with the ephemeral pk as the additional data.
        if let (Some(shared), Some(additional), Some(ciphertext)) = (
            text(vector, "shared"),
            text(vector, "additional"),
            text(vector, "ciphertext"),
        ) {
            let shared = key(shared);
            let additional = bytes(additional);
            let sealed = bytes(ciphertext);
            let opened = arithmetic::open(&shared, &additional, &sealed);
            if refuses {
                assert_eq!(opened, Err(arithmetic::Error::Seal), "{name}");
                continue;
            }
            let plaintext = bytes(text(vector, "plaintext").expect("a plaintext"));
            assert_eq!(opened.expect("the box opens"), plaintext, "{name}: opening");
            assert_eq!(
                hex(&arithmetic::seal(&shared, &additional, &plaintext)),
                ciphertext,
                "{name}: sealing"
            );
            assert_eq!(
                sealed.len(),
                plaintext.len() + arithmetic::TAG,
                "{name}: ciphertext first, the sixteen-byte tag after it"
            );
            continue;
        }

        // The agreement, which each side reaches alone.
        if let (Some(secret), Some(pk), Some(shared)) = (
            text(vector, "secret"),
            text(vector, "pk"),
            text(vector, "shared"),
        ) {
            assert_eq!(
                hex(&arithmetic::agree(&key(secret), &key(pk)).expect("a live agreement")),
                shared,
                "{name}"
            );
            continue;
        }

        // Signing and verifying.
        if let (Some(voice), Some(message), Some(sig)) = (
            text(vector, "voice"),
            text(vector, "message"),
            text(vector, "signature"),
        ) {
            let voice = key(voice);
            let message = bytes(message);
            let sig = signature(sig);
            if refuses {
                assert_eq!(
                    arithmetic::verify(&voice, &message, &sig),
                    Err(arithmetic::Error::Signature),
                    "{name}"
                );
                continue;
            }
            let secret = key(text(vector, "secret").expect("a secret"));
            assert_eq!(hex(&arithmetic::signing_pk(&secret)), hex(&voice), "{name}");
            assert_eq!(
                hex(&arithmetic::sign(&secret, &message)),
                hex(&sig),
                "{name}"
            );
            assert_eq!(arithmetic::verify(&voice, &message, &sig), Ok(()), "{name}");
            continue;
        }

        // A minted pair. The corpus tells the two algorithms apart by name
        // alone: thirty-two bytes and thirty-two bytes carry no other mark.
        if let (Some(secret), Some(pk)) = (text(vector, "secret"), text(vector, "pk")) {
            let made = if name.contains("Ed25519") {
                arithmetic::signing_pk(&key(secret))
            } else if name.contains("X25519") {
                arithmetic::sealing_pk(&key(secret))
            } else {
                panic!("{name}: a pair vector naming neither algorithm");
            };
            assert_eq!(hex(&made), pk, "{name}");
            continue;
        }

        panic!("{name}: the bench has no case for this vector's shape");
    }

    println!(
        "arithmetic corpus: {played} played, {refused} of them refusals, {} in all",
        vectors.len()
    );
    assert_eq!(played, vectors.len(), "every vector in the file was played");
}
