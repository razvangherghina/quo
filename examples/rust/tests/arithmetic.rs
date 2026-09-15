// SPDX-License-Identifier: Apache-2.0
// Every record of vectors/arithmetic.json, and the ward key derivation
// the arithmetic owns, pinned in framing.json.

use curve25519_dalek::constants::EIGHT_TORSION;
use curve25519_dalek::edwards::{CompressedEdwardsY, EdwardsPoint};
use curve25519_dalek::traits::Identity;
use curve25519_dalek::Scalar;
use quo_kit::arithmetic::*;
use serde_json::Value;
use sha2::{Digest, Sha512};

fn corpus(name: &str) -> Value {
    let path = format!("{}/../../vectors/{name}", env!("CARGO_MANIFEST_DIR"));
    serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap()
}

fn bytes(v: &Value, field: &str) -> Vec<u8> {
    let s = v[field].as_str().unwrap_or_else(|| panic!("{field} missing"));
    (0..s.len()).step_by(2).map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap()).collect()
}

fn b32(v: &Value, field: &str) -> [u8; 32] {
    bytes(v, field).try_into().unwrap()
}

fn has(v: &Value, field: &str) -> bool {
    v.get(field).is_some()
}

#[test]
fn every_arithmetic_record() {
    let c = corpus("arithmetic.json");
    let records = c["vectors"].as_array().unwrap();
    let mut checked = 0;
    for r in records {
        let name = r["name"].as_str().unwrap();
        let refuses = r["refuses"].as_bool().unwrap_or(false);
        if has(r, "d") {
            // ML-KEM-768 KeyGen_internal from d and z, and Decaps of an
            // encapsulation under that key back to the same secret.
            let seed: [u8; LOCK_SEED_LEN] = [bytes(r, "d"), bytes(r, "z")].concat().try_into().unwrap();
            let lock = lock_pk(&seed);
            assert_eq!(lock.to_vec(), bytes(r, "ek"), "{name}");
            let (ciphertext, shared) = encapsulate(&lock, &[0u8; 32]);
            assert_eq!(decapsulate(&seed, &ciphertext), shared, "{name}");
        } else if has(r, "m") {
            // ML-KEM-768 Encaps_internal under a published ek and m.
            let lock: [u8; LOCK_LEN] = bytes(r, "ek").try_into().unwrap();
            let (ciphertext, shared) = encapsulate(&lock, &b32(r, "m"));
            assert_eq!(ciphertext.to_vec(), bytes(r, "ciphertext"), "{name}");
            assert_eq!(shared.to_vec(), bytes(r, "shared"), "{name}");
        } else if has(r, "hash") {
            assert_eq!(sha256(&bytes(r, "input")).to_vec(), bytes(r, "hash"), "{name}");
        } else if has(r, "signature") {
            let msg = bytes(r, "message");
            let sig = bytes(r, "signature");
            if has(r, "secret") {
                let secret = b32(r, "secret");
                assert_eq!(signing_pk(&secret).to_vec(), bytes(r, "pk"), "{name}");
                assert_eq!(sign(&secret, &msg).to_vec(), sig, "{name}");
            }
            assert_eq!(verify(&bytes(r, "pk"), &msg, &sig), !refuses, "{name}");
        } else if has(r, "ikm") {
            assert!(bytes(r, "salt").is_empty(), "{name}");
            if has(r, "out") {
                let mut out = vec![0u8; bytes(r, "out").len()];
                hkdf_sha256(&bytes(r, "salt"), &bytes(r, "ikm"), &bytes(r, "info"), &mut out);
                assert_eq!(out, bytes(r, "out"), "{name}");
            } else {
                assert_eq!(bytes(r, "info"), LABEL_SEAL, "{name}");
                let (key, nonce) = seal_key(&b32(r, "ikm"));
                assert_eq!(key.to_vec(), bytes(r, "key"), "{name}");
                assert_eq!(nonce.to_vec(), bytes(r, "nonce"), "{name}");
                let mut raw = [0u8; 44];
                hkdf_sha256(&bytes(r, "salt"), &bytes(r, "ikm"), &bytes(r, "info"), &mut raw);
                assert_eq!(raw.to_vec(), [bytes(r, "key"), bytes(r, "nonce")].concat(), "{name}");
            }
        } else if has(r, "key") {
            let under = (b32(r, "key"), bytes(r, "nonce").try_into().unwrap());
            let aad = bytes(r, "additional");
            let pt = bytes(r, "plaintext");
            let ct = bytes(r, "ciphertext");
            assert_eq!(encrypt_under(under, &aad, &pt), ct, "{name}");
            assert_eq!(decrypt_under(under, &aad, &ct), Some(pt), "{name}");
        } else if has(r, "ciphertext") {
            let shared = b32(r, "shared");
            let aad = bytes(r, "additional");
            let ct = bytes(r, "ciphertext");
            if refuses {
                assert_eq!(decrypt(&shared, &aad, &ct), None, "{name}");
            } else {
                let pt = bytes(r, "plaintext");
                assert_eq!(encrypt(&shared, &aad, &pt), ct, "{name}");
                assert_eq!(ct.len(), pt.len() + TAG_LEN, "{name}");
                assert_eq!(decrypt(&shared, &aad, &ct), Some(pt), "{name}");
            }
        } else if has(r, "shared") || refuses {
            let got = agree(&b32(r, "secret"), &b32(r, "pk"));
            let want = if refuses { None } else { Some(bytes(r, "shared")) };
            assert_eq!(got.map(|s| s.to_vec()), want, "{name}");
        } else if name.starts_with("an Ed25519 pair") {
            assert_eq!(signing_pk(&b32(r, "secret")).to_vec(), bytes(r, "pk"), "{name}");
        } else if name.starts_with("an X25519 pair") {
            assert_eq!(agreement_pk(&b32(r, "secret")).to_vec(), bytes(r, "pk"), "{name}");
        } else {
            panic!("a record no check reads: {name}");
        }
        checked += 1;
    }
    assert_eq!(checked, records.len());
}

#[test]
fn a_signature_of_another_length_verifies_nothing() {
    let secret = [7u8; 32];
    let sig = sign(&secret, b"m");
    assert!(verify(&signing_pk(&secret), b"m", &sig));
    assert!(!verify(&signing_pk(&secret), b"m", &sig[..63]));
    assert!(!verify(&signing_pk(&secret), b"m", &[sig.as_slice(), &[0]].concat()));
}

/// A signature written by hand over `a`, the scalar behind `pk`, with the
/// nonce point `r_bytes` spelled as given and `R + ...` solved for `s` from
/// `r` the nonce scalar: `s = r + k a`.
fn sign_by_hand(r: Scalar, r_bytes: [u8; 32], a: Scalar, pk: [u8; 32], message: &[u8]) -> ([u8; 64], Scalar) {
    let k = challenge(&r_bytes, &pk, message);
    let s = r + k * a;
    let mut sig = [0u8; 64];
    sig[..32].copy_from_slice(&r_bytes);
    sig[32..].copy_from_slice(s.as_bytes());
    (sig, k)
}

fn challenge(r: &[u8; 32], pk: &[u8; 32], message: &[u8]) -> Scalar {
    let mut h = Sha512::new();
    h.update(r);
    h.update(pk);
    h.update(message);
    Scalar::from_bytes_mod_order_wide(&h.finalize().into())
}

#[test]
fn an_s_at_or_above_the_order_verifies_nothing() {
    let secret = [7u8; 32];
    let pk = signing_pk(&secret);
    let sig = sign(&secret, b"m");
    // s + L, which still fits the 253 bits the encoding leaves it.
    const L: [u8; 32] = [0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10];
    let mut s = [0u8; 32];
    let mut carry = 0u16;
    for i in 0..32 {
        let t = sig[32 + i] as u16 + L[i] as u16 + carry;
        s[i] = t as u8;
        carry = t >> 8;
    }
    assert_eq!(carry, 0);
    let mut unreduced = sig;
    unreduced[32..].copy_from_slice(&s);
    assert!(verify(&pk, b"m", &sig));
    assert!(!verify(&pk, b"m", &unreduced));
}

#[test]
fn a_small_order_r_verifies_and_an_r_spelled_otherwise_does_not() {
    let a = Scalar::from_bytes_mod_order([3u8; 32]);
    let pk = EdwardsPoint::mul_base(&a).compress().to_bytes();
    // R the identity, a small-order point, canonically encoded: s = k a.
    let identity = EdwardsPoint::identity().compress().to_bytes();
    let (sig, _) = sign_by_hand(Scalar::ZERO, identity, a, pk, b"m");
    assert!(verify(&pk, b"m", &sig));
    // The identity again, its y unreduced (p + 1), and with the sign bit set
    // on x = 0: the same point, not its encoding, refused.
    let mut unreduced = [0xffu8; 32];
    unreduced[0] = 0xee;
    unreduced[31] = 0x7f;
    let mut signed = identity;
    signed[31] |= 0x80;
    for spelling in [unreduced, signed] {
        let (sig, _) = sign_by_hand(Scalar::ZERO, spelling, a, pk, b"m");
        assert!(!verify(&pk, b"m", &sig));
    }
}

#[test]
fn a_torsion_public_key_verifies() {
    let a = Scalar::from_bytes_mod_order([5u8; 32]);
    let torsion = EIGHT_TORSION[1];
    let point = EdwardsPoint::mul_base(&a) + torsion;
    assert!(!point.is_small_order() && !point.is_torsion_free());
    let pk = point.compress().to_bytes();
    // [s]B = R + [k]A holds when [k]T vanishes, which is k a multiple of eight.
    let mut nonce = 1u64;
    let sig = loop {
        let r = Scalar::from(nonce);
        let r_bytes = EdwardsPoint::mul_base(&r).compress().to_bytes();
        let (sig, k) = sign_by_hand(r, r_bytes, a, pk, b"m");
        if k.as_bytes()[0] % 8 == 0 {
            break sig;
        }
        nonce += 1;
    };
    assert!(verify(&pk, b"m", &sig));
}

#[test]
fn a_small_order_public_key_in_any_spelling_verifies_nothing() {
    let identity = EdwardsPoint::identity().compress().to_bytes();
    let mut signed = identity;
    signed[31] |= 0x80;
    for pk in [identity, signed, EIGHT_TORSION[4].compress().to_bytes()] {
        let (sig, _) = sign_by_hand(Scalar::ZERO, identity, Scalar::ZERO, pk, b"m");
        assert!(!verify(&pk, b"m", &sig), "{pk:02x?}");
    }
    // A key whose y is unreduced and is not small-order: p + y, spelling the
    // point whose y is a small y on the curve.
    let y = (2u8..=18)
        .find(|y| {
            let mut b = [0u8; 32];
            b[0] = *y;
            CompressedEdwardsY(b).decompress().is_some_and(|p| !p.is_small_order())
        })
        .expect("a small y on the curve");
    let mut p_plus = [0xffu8; 32];
    p_plus[0] = 0xed + y;
    p_plus[31] = 0x7f;
    let a = Scalar::from_bytes_mod_order([1u8; 32]);
    let (sig, _) = sign_by_hand(Scalar::ZERO, identity, a, p_plus, b"m");
    assert!(!verify(&p_plus, b"m", &sig));
}

#[test]
fn the_lock_encapsulates_and_rejects_implicitly() {
    let seed = [7u8; LOCK_SEED_LEN];
    let lock = lock_pk(&seed);
    assert_eq!(lock.len(), LOCK_LEN);
    let (ciphertext, shared) = encapsulate(&lock, &[9u8; 32]);
    assert_eq!(ciphertext.len(), CIPHERTEXT_LEN);
    assert_eq!(decapsulate(&seed, &ciphertext), shared);
    // One bit changed yields another secret, and no error.
    let mut tampered = ciphertext.clone();
    tampered[0] ^= 1;
    assert_ne!(decapsulate(&seed, &tampered), shared);
    // Another lock decapsulates another secret.
    assert_ne!(decapsulate(&[8u8; LOCK_SEED_LEN], &ciphertext), shared);
}

#[test]
fn an_all_zero_agreement_is_refused() {
    assert_eq!(agree(&[9u8; 32], &[0u8; 32]), None);
}

#[test]
fn the_ward_key_from_a_fixed_seed() {
    let c = corpus("framing.json");
    let r = c["vectors"].as_array().unwrap().iter().find(|r| r["name"] == "a ward pk from a fixed seed").unwrap();
    let key = WardKey::from_seed(&bytes(r, "seed").try_into().unwrap());
    assert_eq!(key.pk().to_vec(), bytes(r, "pk"));
    assert_eq!(key.signing_pk().to_vec(), bytes(r, "signPk"));
    assert_eq!(key.padlock().to_vec(), bytes(r, "padlockPk"));
    // The pk on the wire is the signing pk then the padlock.
    assert_eq!(&key.pk()[..32], &key.signing_pk());
    assert_eq!(&key.pk()[32..], &key.padlock());
}

#[test]
fn a_seed_not_thirty_two_bytes_is_hashed_first() {
    use quo_kit::seal::Seed;
    let b = [0x41u8; 32];
    assert_eq!(Seed::from_bytes(&b).as_bytes(), &b);
    assert_eq!(Seed::from_bytes(b"A").as_bytes(), &sha256(b"A"));
    let name = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    assert_eq!(Seed::from_text(name).as_bytes(), &sha256(name.as_bytes()));
}

mod harness;

#[test]
fn the_watchdog_stands() {
    harness::watchdog();
}
