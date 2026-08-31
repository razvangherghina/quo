//! The kit against the pinned corpus. Every vector in `notation.json` is
//! reproduced: an acceptance by its canonical bytes and its digest, a refusal
//! by being refused.

#[path = "../../support/json.rs"]
mod json;

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn corpus() -> json::Json {
    let path = concat!(
        env!("CARGO_MANIFEST_DIR"),
        "/../../js/vectors/notation.json"
    );
    let source = std::fs::read_to_string(path).expect("the pinned corpus");
    json::parse(&source)
}

#[test]
fn every_vector_in_the_corpus() {
    let corpus = corpus();
    assert_eq!(corpus.get("area").expect("an area").text(), "notation");
    assert_eq!(corpus.get("encoding").expect("an encoding").text(), "hex");

    let vectors = corpus.get("vectors").expect("the vectors").list();
    assert!(!vectors.is_empty(), "the corpus carries vectors");

    let mut accepted = 0;
    let mut refused = 0;

    for vector in vectors {
        let name = vector.get("name").expect("a name").text();
        let blueprint = vector.get("blueprint").expect("a blueprint").text();

        if vector.flag("refuses") {
            refused += 1;
            let judged = quo_notation::parse(blueprint);
            assert!(
                judged.is_err(),
                "{name}: the corpus refuses this text and the kit accepted it"
            );
            continue;
        }

        accepted += 1;
        let read = quo_notation::parse(blueprint)
            .unwrap_or_else(|why| panic!("{name}: the kit refused an accepted vector: {why}"));

        assert_eq!(
            hex(read.canonical().as_bytes()),
            vector.get("canonical").expect("a canonical").text(),
            "{name}: canonical bytes"
        );
        assert_eq!(
            hex(&read.digest()),
            vector.get("digest").expect("a digest").text(),
            "{name}: digest"
        );
    }

    println!(
        "notation corpus: {accepted} accepted, {refused} refused, {} in all",
        accepted + refused
    );
    assert_eq!(accepted + refused, vectors.len());
}

#[test]
fn a_digest_is_sha256_over_the_canonical_text() {
    let text = "Small\n  yes() bool\n";
    let read = quo_notation::parse(text).expect("a blueprint");
    assert_eq!(read.canonical(), text);
    assert_eq!(quo_notation::digest(text).expect("a digest"), read.digest());
}

#[test]
fn a_text_that_is_not_canonical_is_refused_and_never_repaired() {
    for text in [
        "Small\n  yes()  bool\n",
        "Small\n  yes() bool \n",
        "Small\n yes() bool\n",
    ] {
        assert!(quo_notation::parse(text).is_err(), "{text:?}");
    }
}
