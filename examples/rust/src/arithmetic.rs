// SPDX-License-Identifier: Apache-2.0
//! The five algorithms and the derivations the spec names over them.
//!
//! Ed25519 signs, X25519 agrees, ML-KEM-768 encapsulates, SHA-256 hashes,
//! AES-256-GCM encrypts, and HKDF-SHA-256 under an empty salt derives: the
//! ward's two secrets from its seed, under `quo-ward-sign` and
//! `quo-ward-seal`, the message cipher's key and nonce from an agreement,
//! under `quo-seal`, an ask body's from an agreement and an edge key, under
//! `quo-edge-seal`, the knock's edge key from an ML-KEM secret, under
//! `quo-lock`, and the next edge key from the edge key an ask came under and
//! its reply's agreement, under `quo-edge`.

use aes_gcm::aead::{AeadInPlace, KeyInit, Nonce};
use aes_gcm::Aes256Gcm;
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::SimpleHkdf;
use ml_kem::kem::Decapsulate;
use ml_kem::{Ciphertext, EncapsulateDeterministic, Encoded, EncodedSizeUser, KemCore, MlKem768, B32};
use sha2::{Digest, Sha256};

/// The label of the message cipher's derivation.
pub const LABEL_SEAL: &[u8] = b"quo-seal";
/// The label of an ask body's cipher, over the agreement and the edge key.
pub const LABEL_EDGE_SEAL: &[u8] = b"quo-edge-seal";
/// The label the next edge key is derived under.
pub const LABEL_EDGE: &[u8] = b"quo-edge";
/// The label the knock's edge key is derived under, from the ML-KEM secret.
pub const LABEL_LOCK: &[u8] = b"quo-lock";
/// The label the ward's Ed25519 secret is derived under.
pub const LABEL_WARD_SIGN: &[u8] = b"quo-ward-sign";
/// The label the ward's X25519 secret, its padlock, is derived under.
pub const LABEL_WARD_SEAL: &[u8] = b"quo-ward-seal";

/// Bytes of a key, a secret, a lid, an agreement.
pub const KEY_LEN: usize = 32;
/// Bytes of a signature.
pub const SIGNATURE_LEN: usize = 64;
/// Bytes of the AES-GCM tag, at the end of the ciphertext.
pub const TAG_LEN: usize = 16;
/// Bytes of an ML-KEM-768 encapsulation key, the lock an invitation carries.
pub const LOCK_LEN: usize = 1184;
/// Bytes of an ML-KEM-768 ciphertext, which a knock box carries.
pub const CIPHERTEXT_LEN: usize = 1088;
/// Bytes drawn for a lock: d then z.
pub const LOCK_SEED_LEN: usize = 64;

/// SHA-256 of the bytes.
pub fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}

/// HKDF-SHA-256, extract then expand, with `info` as the ASCII label and no
/// prefix. An empty `salt` is the zero-length salt of RFC 5869.
pub fn hkdf_sha256(salt: &[u8], ikm: &[u8], info: &[u8], out: &mut [u8]) {
    let (_, hkdf) = SimpleHkdf::<Sha256>::extract(Some(salt), ikm);
    hkdf.expand(info, out).expect("HKDF-SHA-256 length is within bound");
}

/// The ward key: an Ed25519 pair that signs replies and an X25519 padlock every
/// ask is sealed to, each derived from the seed under its own label.
#[derive(Clone)]
pub struct WardKey {
    sign_secret: [u8; 32],
    seal_secret: [u8; 32],
    sign_pk: [u8; 32],
    padlock: [u8; 32],
}

impl WardKey {
    /// The ward key of a thirty-two byte seed.
    pub fn from_seed(seed: &[u8; 32]) -> Self {
        let mut sign_secret = [0u8; 32];
        let mut seal_secret = [0u8; 32];
        hkdf_sha256(&[], seed, LABEL_WARD_SIGN, &mut sign_secret);
        hkdf_sha256(&[], seed, LABEL_WARD_SEAL, &mut seal_secret);
        WardKey { sign_pk: signing_pk(&sign_secret), padlock: agreement_pk(&seal_secret), sign_secret, seal_secret }
    }

    /// The ward pk on the wire: the signing pk then the padlock, 64 bytes.
    pub fn pk(&self) -> [u8; 64] {
        let mut pk = [0u8; 64];
        pk[..32].copy_from_slice(&self.sign_pk);
        pk[32..].copy_from_slice(&self.padlock);
        pk
    }

    pub fn signing_pk(&self) -> [u8; 32] {
        self.sign_pk
    }

    pub fn padlock(&self) -> [u8; 32] {
        self.padlock
    }

    /// Signs with the ward's Ed25519 secret.
    pub fn sign(&self, message: &[u8]) -> [u8; 64] {
        sign(&self.sign_secret, message)
    }

    /// Agrees with the ward's padlock secret. `None` is an agreement refused.
    pub fn agree(&self, their_pk: &[u8; 32]) -> Option<[u8; 32]> {
        agree(&self.seal_secret, their_pk)
    }
}

/// The Ed25519 public key of a 32-byte secret, taken as it stands.
pub fn signing_pk(secret: &[u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(secret).verifying_key().to_bytes()
}

/// An Ed25519 signature.
pub fn sign(secret: &[u8; 32], message: &[u8]) -> [u8; 64] {
    SigningKey::from_bytes(secret).sign(message).to_bytes()
}

/// The field prime 2^255 - 19, little-endian.
const P: [u8; 32] = {
    let mut p = [0xffu8; 32];
    p[0] = 0xed;
    p[31] = 0x7f;
    p
};

/// Whether the y coordinate of a compressed point is reduced, below the prime.
fn y_is_canonical(pk: &[u8; 32]) -> bool {
    let mut y = *pk;
    y[31] &= 0x7f;
    for i in (0..32).rev() {
        if y[i] != P[i] {
            return y[i] < P[i];
        }
    }
    false
}

/// Ed25519 verification against the bytes exactly as received: RFC 8032's
/// cofactorless check, `[s]B = R + [k]A`, with `R` compared as encoded. It
/// refuses in four places and no others: a signature of any length but
/// sixty-four, an `s` at or above the group order, an `R` whose bytes are not
/// the encoding of the point they name, and a public key that is small-order
/// in any spelling or whose y is at or above the prime. A torsion public key
/// and a small-order `R` verify.
pub fn verify(pk: &[u8], message: &[u8], signature: &[u8]) -> bool {
    let (Ok(pk), Ok(sig)) = (<[u8; 32]>::try_from(pk), <[u8; 64]>::try_from(signature)) else {
        return false;
    };
    if !y_is_canonical(&pk) {
        return false;
    }
    let Ok(key) = VerifyingKey::from_bytes(&pk) else {
        return false;
    };
    if key.is_weak() {
        return false;
    }
    // The cofactorless check: `s` refused unreduced, the recomputed `R`
    // compared with the bytes received.
    key.verify(message, &Signature::from_bytes(&sig)).is_ok()
}

/// The X25519 public key of a 32-byte secret.
pub fn agreement_pk(secret: &[u8; 32]) -> [u8; 32] {
    let secret = x25519_dalek::StaticSecret::from(*secret);
    x25519_dalek::PublicKey::from(&secret).to_bytes()
}

/// The X25519 agreement. An all-zero agreement, which is what a small-order
/// point gives, is refused as `None`.
pub fn agree(secret: &[u8; 32], their_pk: &[u8; 32]) -> Option<[u8; 32]> {
    let secret = x25519_dalek::StaticSecret::from(*secret);
    let shared = secret.diffie_hellman(&x25519_dalek::PublicKey::from(*their_pk));
    shared.was_contributory().then(|| shared.to_bytes())
}

/// The message cipher's key and nonce: forty-four bytes of HKDF-SHA-256 over
/// the agreement as it stands, empty salt, `quo-seal`, key first.
pub fn seal_key(shared: &[u8; 32]) -> ([u8; 32], [u8; 12]) {
    let mut out = [0u8; 44];
    hkdf_sha256(&[], shared, LABEL_SEAL, &mut out);
    let mut key = [0u8; 32];
    let mut nonce = [0u8; 12];
    key.copy_from_slice(&out[..32]);
    nonce.copy_from_slice(&out[32..]);
    (key, nonce)
}

/// The body cipher's key and nonce: forty-four bytes of HKDF-SHA-256 over the
/// agreement then the edge key, sixty-four bytes, empty salt, `quo-edge-seal`.
pub fn edge_seal_key(shared: &[u8; 32], edge: &[u8; 32]) -> ([u8; 32], [u8; 12]) {
    let mut ikm = [0u8; 64];
    ikm[..32].copy_from_slice(shared);
    ikm[32..].copy_from_slice(edge);
    let mut out = [0u8; 44];
    hkdf_sha256(&[], &ikm, LABEL_EDGE_SEAL, &mut out);
    let mut key = [0u8; 32];
    let mut nonce = [0u8; 12];
    key.copy_from_slice(&out[..32]);
    nonce.copy_from_slice(&out[32..]);
    (key, nonce)
}

/// The next edge key: thirty-two bytes of HKDF-SHA-256 over the edge key the
/// ask came under then the reply's agreement, sixty-four bytes, empty salt,
/// `quo-edge`.
pub fn next_edge(edge: &[u8; 32], shared: &[u8; 32]) -> [u8; 32] {
    let mut ikm = [0u8; 64];
    ikm[..32].copy_from_slice(edge);
    ikm[32..].copy_from_slice(shared);
    let mut out = [0u8; 32];
    hkdf_sha256(&[], &ikm, LABEL_EDGE, &mut out);
    out
}

/// The knock's edge key: thirty-two bytes of HKDF-SHA-256 over the ML-KEM
/// shared secret, empty salt, `quo-lock`.
pub fn lock_edge(shared: &[u8; 32]) -> [u8; 32] {
    let mut out = [0u8; 32];
    hkdf_sha256(&[], shared, LABEL_LOCK, &mut out);
    out
}

/// The encapsulation key of the lock drawn as `d || z`:
/// `ML-KEM.KeyGen_internal(d, z)`.
pub fn lock_pk(seed: &[u8; LOCK_SEED_LEN]) -> Box<[u8; LOCK_LEN]> {
    let (_, ek) = lock_pair(seed);
    let mut out = Box::new([0u8; LOCK_LEN]);
    out.copy_from_slice(ek.as_bytes().as_slice());
    out
}

fn lock_pair(seed: &[u8; LOCK_SEED_LEN]) -> (<MlKem768 as KemCore>::DecapsulationKey, <MlKem768 as KemCore>::EncapsulationKey) {
    let d = B32::try_from(&seed[..32]).expect("thirty-two bytes");
    let z = B32::try_from(&seed[32..]).expect("thirty-two bytes");
    MlKem768::generate_deterministic(&d, &z)
}

/// `ML-KEM.Encaps_internal(lock, m)`: the ciphertext and the shared secret.
pub fn encapsulate(lock: &[u8; LOCK_LEN], m: &[u8; 32]) -> (Box<[u8; CIPHERTEXT_LEN]>, [u8; 32]) {
    let encoded = Encoded::<<MlKem768 as KemCore>::EncapsulationKey>::try_from(&lock[..]).expect("an encapsulation key's length");
    let ek = <MlKem768 as KemCore>::EncapsulationKey::from_bytes(&encoded);
    let (ciphertext, shared) = ek.encapsulate_deterministic(&B32::from(*m)).expect("encapsulation does not fail");
    let mut out = Box::new([0u8; CIPHERTEXT_LEN]);
    out.copy_from_slice(ciphertext.as_slice());
    (out, shared.as_slice().try_into().expect("thirty-two bytes"))
}

/// `ML-KEM.Decaps(dk, c)` under the lock drawn as `d || z`, with FIPS 203's
/// implicit rejection: a ciphertext that is not the sender's yields another
/// secret.
pub fn decapsulate(seed: &[u8; LOCK_SEED_LEN], ciphertext: &[u8; CIPHERTEXT_LEN]) -> [u8; 32] {
    let (dk, _) = lock_pair(seed);
    let c = Ciphertext::<MlKem768>::try_from(&ciphertext[..]).expect("a ciphertext's length");
    let shared = dk.decapsulate(&c).expect("decapsulation does not fail");
    shared.as_slice().try_into().expect("thirty-two bytes")
}

/// AES-256-GCM under the key and nonce drawn from `shared`, `additional` as
/// the authenticated data, the tag at the end.
pub fn encrypt(shared: &[u8; 32], additional: &[u8], plaintext: &[u8]) -> Vec<u8> {
    encrypt_under(seal_key(shared), additional, plaintext)
}

/// AES-256-GCM under a key and nonce already derived.
pub fn encrypt_under((key, nonce): ([u8; 32], [u8; 12]), additional: &[u8], plaintext: &[u8]) -> Vec<u8> {
    let mut buffer = plaintext.to_vec();
    Aes256Gcm::new(&key.into()).encrypt_in_place(Nonce::<Aes256Gcm>::from_slice(&nonce), additional, &mut buffer).expect("AES-GCM encrypts any message under the size");
    buffer
}

/// Opens what [`encrypt`] made. `None` is a box that does not open.
pub fn decrypt(shared: &[u8; 32], additional: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
    decrypt_under(seal_key(shared), additional, ciphertext)
}

/// Opens what [`encrypt_under`] made. `None` is a box that does not open.
pub fn decrypt_under((key, nonce): ([u8; 32], [u8; 12]), additional: &[u8], ciphertext: &[u8]) -> Option<Vec<u8>> {
    let mut buffer = ciphertext.to_vec();
    Aes256Gcm::new(&key.into()).decrypt_in_place(Nonce::<Aes256Gcm>::from_slice(&nonce), additional, &mut buffer).ok()?;
    Some(buffer)
}
