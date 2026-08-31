//! The warden against the pinned corpus. Every vector in `warden.json` is
//! reproduced, and the bench asserts its own case count against the number of
//! vectors in the file, so nothing is skipped silently. A vector whose shape
//! the bench does not recognise panics rather than passing.
//!
//! The file carries two vectors and the crate is far larger than two vectors
//! can judge, so what the articles compel and the corpus does not carry
//! stands in `law.rs` beside this.

#[path = "../../support/hex.rs"]
mod hex;
#[path = "../../support/json.rs"]
mod json;

use hex::{hex, key};
use json::Json;
use quo_warden as warden;
use warden::{Class, Estate, Held};

fn corpus() -> Json {
    let path = concat!(env!("CARGO_MANIFEST_DIR"), "/../../js/vectors/warden.json");
    let source = std::fs::read_to_string(path).expect("the pinned corpus");
    json::parse(&source)
}

fn estate(written: &Json) -> Estate {
    Estate {
        classes: written
            .get("classes")
            .expect("the classes")
            .list()
            .iter()
            .map(|class| Class {
                digest: key(class.get("digest").expect("a digest").text()),
                beings: class
                    .get("beings")
                    .expect("the beings")
                    .list()
                    .iter()
                    .map(|held| Held {
                        being: key(held.get("being").expect("a being").text()),
                        commitment: key(held.get("commitment").expect("a commitment").text()),
                    })
                    .collect(),
            })
            .collect(),
    }
}

#[test]
fn every_vector_in_the_corpus() {
    let corpus = corpus();
    assert_eq!(corpus.get("area").expect("an area").text(), "warden");
    assert_eq!(corpus.get("encoding").expect("an encoding").text(), "hex");

    let vectors = corpus.get("vectors").expect("the vectors").list();
    assert!(!vectors.is_empty(), "the corpus carries vectors");

    let mut played = 0usize;

    for vector in vectors {
        let name = vector.get("name").expect("a name").text();
        assert!(
            !vector.flag("unpinned"),
            "{name}: this bench judges only what the law compels"
        );
        played += 1;

        // The blueprint every warden holds: its canonical bytes and its
        // digest, which is the same on every ground in the world.
        if let Some(canonical) = vector.get("canonical") {
            let text = vector.get("blueprint").expect("the blueprint").text();
            assert_eq!(
                text,
                warden::WARDEN_BLUEPRINT,
                "{name}: the blueprint this kit holds is the corpus's own text"
            );
            assert_eq!(
                hex(warden::WARDEN_BLUEPRINT.as_bytes()),
                canonical.text(),
                "{name}: the canonical bytes"
            );
            assert_eq!(
                warden::warden_blueprint().canonical(),
                warden::WARDEN_BLUEPRINT,
                "{name}: the text is already canonical"
            );
            assert_eq!(
                hex(&warden::warden_digest()),
                vector.get("digest").expect("the digest").text(),
                "{name}: the digest"
            );
            continue;
        }

        // The derived order of an estate, and its bytes.
        let unordered = estate(vector.get("unordered").expect("the unordered estate"));
        let wanted = estate(vector.get("value").expect("the value"));
        let ordered = warden::order(unordered);
        assert_eq!(ordered, wanted, "{name}: the derived order");

        let bytes = warden::encode_estate(&ordered)
            .unwrap_or_else(|why| panic!("{name}: the estate does not encode: {why}"));
        let written = vector.get("bytes").expect("the bytes").text();
        assert_eq!(hex(&bytes), written, "{name}: encoding");

        let read_back = warden::decode_estate(&hex::bytes(written))
            .unwrap_or_else(|why| panic!("{name}: the bytes do not decode: {why}"));
        assert_eq!(read_back, wanted, "{name}: decoding");
    }

    println!("warden corpus: {played} played, {} in all", vectors.len());
    assert_eq!(played, vectors.len(), "every vector in the file was played");
}
