//! What Article VI compels that the corpus does not carry. Every case here is
//! read from the law rather than from any implementation.

#[path = "../../support/hex.rs"]
mod hex;

use hex::key;
use quo_arithmetic as arithmetic;

const SHARED: &str = "3d33d3f6044552ecd30503ba772b3d4f69544da0b3a4a46bfa63b056bb191833";
const ADDITIONAL: &str = "17ff733c9cffec197551af9aaf710b7b07a4d7aeffc9894d6e89b10df3d2d011";

#[test]
fn the_box_is_the_ciphertext_then_a_sixteen_byte_tag_and_nothing_else() {
    let shared = key(SHARED);
    let additional = key(ADDITIONAL);
    for plaintext in [b"".as_slice(), b"a".as_slice(), b"by whose authority"] {
        let sealed = arithmetic::seal(&shared, &additional, plaintext);
        assert_eq!(sealed.len(), plaintext.len() + arithmetic::TAG);
        assert_eq!(
            arithmetic::open(&shared, &additional, &sealed),
            Ok(plaintext.to_vec())
        );
    }
}

#[test]
fn a_box_shorter_than_its_tag_does_not_open() {
    let shared = key(SHARED);
    let additional = key(ADDITIONAL);
    let sealed = arithmetic::seal(&shared, &additional, b"by whose authority");
    for cut in [0, 1, arithmetic::TAG - 1] {
        assert_eq!(
            arithmetic::open(&shared, &additional, &sealed[..cut]),
            Err(arithmetic::Error::Seal)
        );
    }
}

#[test]
fn a_byte_turned_anywhere_in_the_box_refuses_it() {
    let shared = key(SHARED);
    let additional = key(ADDITIONAL);
    let sealed = arithmetic::seal(&shared, &additional, b"by whose authority");
    for at in 0..sealed.len() {
        let mut turned = sealed.clone();
        turned[at] ^= 1;
        assert_eq!(
            arithmetic::open(&shared, &additional, &turned),
            Err(arithmetic::Error::Seal),
            "byte {at}"
        );
    }
}

#[test]
fn the_commitment_binds_the_door_as_well_as_the_key() {
    let heir = key("afa0ce0919a81bf57861ac7139d8945a1fc2ba9f00e53a4f26f494c23f78338c");
    let one = key("eb8478a4581b4db71bb278c675047a66577e0d762cc18ebc5220543708d0df5b");
    let other = key("1d5eda50d19066d0cc460cfb584ee026f532da67ff66c0e9774940a11e25ec71");
    assert_ne!(
        arithmetic::commitment(&one, &heir),
        arithmetic::commitment(&other, &heir)
    );
    assert_ne!(
        arithmetic::commitment(&one, &heir),
        arithmetic::commitment(&heir, &one),
        "the warden comes first and the order is not a convention"
    );
}

#[test]
fn nonsense_offered_as_a_key_or_a_signature_is_refused_and_never_repaired() {
    for pk in [[0x00u8; arithmetic::KEY], [0xffu8; arithmetic::KEY]] {
        assert_eq!(
            arithmetic::verify(&pk, b"", &[0u8; arithmetic::SIGNATURE]),
            Err(arithmetic::Error::Signature)
        );
    }
    let voice = key("be6615086e715c9cea8856a892c7e363cc2401b5edccadb49b347a8bee22c6e2");
    assert_eq!(
        arithmetic::verify(&voice, b"", &[0xffu8; arithmetic::SIGNATURE]),
        Err(arithmetic::Error::Signature)
    );
}

/// "A public key that is all zeros or of small order is silence, no signature
/// examined." The corpus carries one of the eight; the law names all eight, so
/// all eight are asserted here, in front of whatever the platform would do.
#[test]
fn a_voice_of_small_order_is_silence_before_any_signature_is_examined() {
    const POINTS: [&str; 8] = [
        "0100000000000000000000000000000000000000000000000000000000000000",
        "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
        "0000000000000000000000000000000000000000000000000000000000000000",
        "0000000000000000000000000000000000000000000000000000000000000080",
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
    ];
    for point in POINTS {
        let pk = key(point);
        assert!(
            arithmetic::small_order(&pk),
            "{point} is a small-order point"
        );
        assert_eq!(
            arithmetic::verify(&pk, b"by whose authority", &[0u8; arithmetic::SIGNATURE]),
            Err(arithmetic::Error::Signature),
            "{point}"
        );
    }

    // And an ordinary voice is not one of them, so the pre-check refuses
    // nothing it was not written to refuse.
    let seed = key(SHARED);
    let voice = arithmetic::signing_pk(&seed);
    assert!(!arithmetic::small_order(&voice));
    let signature = arithmetic::sign(&seed, b"by whose authority");
    assert_eq!(
        arithmetic::verify(&voice, b"by whose authority", &signature),
        Ok(())
    );
}

/// "An agreement that hands back thirty-two zero bytes is refused at the point
/// of agreement": the padlock was not a real key, and a seal derived from it
/// would protect nothing.
#[test]
fn a_dead_agreement_is_refused_at_the_point_of_agreement() {
    let secret = key(SHARED);
    // The identity and the point of order two are the padlocks that produce
    // the degenerate output whatever secret they are agreed against.
    for dead in [
        [0u8; arithmetic::KEY],
        key("0100000000000000000000000000000000000000000000000000000000000000"),
        key("ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"),
    ] {
        assert_eq!(
            arithmetic::agree(&secret, &dead),
            Err(arithmetic::Error::Agreement)
        );
    }

    // A real padlock agrees, and both sides reach the same secret.
    let padlock_secret = key(ADDITIONAL);
    let padlock = arithmetic::sealing_pk(&padlock_secret);
    assert_eq!(
        arithmetic::agree(&secret, &padlock),
        arithmetic::agree(&padlock_secret, &arithmetic::sealing_pk(&secret))
    );
}

#[test]
fn the_derivation_draws_forty_four_bytes_and_they_differ_per_shared_secret() {
    let one = arithmetic::derive(&key(SHARED));
    let other = arithmetic::derive(&key(ADDITIONAL));
    assert_eq!(one.key.len() + one.nonce.len(), 44);
    assert_ne!(one.key, other.key);
    assert_ne!(one.nonce, other.nonce);
    assert_eq!(
        one,
        arithmetic::derive(&key(SHARED)),
        "and it is a function"
    );
}
