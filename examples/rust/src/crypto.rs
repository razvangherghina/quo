//! The algorithms of Quo: the ward key, the lock, agreement, sealing and signatures.

use aes_gcm::aead::{AeadInPlace, KeyInit, Nonce};
use aes_gcm::Aes256Gcm;
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use hkdf::SimpleHkdf;
use ml_kem::kem::{Decapsulate, DecapsulationKey, EncapsulationKey};
use ml_kem::{EncapsulateDeterministic, EncodedSizeUser, KemCore, MlKem768, MlKem768Params};
use sha2::{Digest, Sha256};
use std::io::Read;

pub const LOCK_EK_LEN: usize = 1184;
pub const KEM_CT_LEN: usize = 1088;

/// Drawn bytes come from the operating system's /dev/urandom.
pub fn draw<const N: usize>() -> [u8; N] {
    let mut out = [0u8; N];
    let mut f = std::fs::File::open("/dev/urandom").expect("urandom");
    f.read_exact(&mut out).expect("urandom read");
    out
}

/// HKDF-SHA-256 with the zero-length salt, `info` = label bytes.
pub fn hkdf(ikm: &[u8], label: &str, out: &mut [u8]) {
    let h = SimpleHkdf::<Sha256>::new(Some(&[]), ikm);
    h.expand(label.as_bytes(), out).expect("hkdf length");
}

pub fn hkdf32(ikm: &[u8], label: &str) -> [u8; 32] {
    let mut o = [0u8; 32];
    hkdf(ikm, label, &mut o);
    o
}

pub fn sha256(b: &[u8]) -> [u8; 32] {
    Sha256::digest(b).into()
}

pub fn x25519_pub(sk: &[u8; 32]) -> [u8; 32] {
    x25519_dalek::x25519(*sk, x25519_dalek::X25519_BASEPOINT_BYTES)
}

/// The agreement, or None when it is all zero (the public key takes no seal).
pub fn agree(sk: &[u8; 32], pk: &[u8; 32]) -> Option<[u8; 32]> {
    let a = x25519_dalek::x25519(*sk, *pk);
    if a == [0u8; 32] {
        None
    } else {
        Some(a)
    }
}

pub fn takes_seal(pk: &[u8; 32]) -> bool {
    // Agreement with a small-order point is zero for every scalar; one probe decides.
    agree(&[9u8; 32], pk).is_some()
}

fn key_nonce(ikm: &[u8], label: &str) -> ([u8; 32], [u8; 12]) {
    let mut o = [0u8; 44];
    hkdf(ikm, label, &mut o);
    let mut k = [0u8; 32];
    let mut n = [0u8; 12];
    k.copy_from_slice(&o[..32]);
    n.copy_from_slice(&o[32..]);
    (k, n)
}

pub fn seal_with(ikm: &[u8], label: &str, aad: &[u8], pt: &[u8]) -> Vec<u8> {
    let (k, n) = key_nonce(ikm, label);
    let c = Aes256Gcm::new(&k.into());
    let mut buf = pt.to_vec();
    c.encrypt_in_place(&Nonce::<Aes256Gcm>::from(n), aad, &mut buf).expect("seal");
    buf
}

pub fn open_with(ikm: &[u8], label: &str, aad: &[u8], ct: &[u8]) -> Option<Vec<u8>> {
    if ct.len() < 16 {
        return None;
    }
    let (k, n) = key_nonce(ikm, label);
    let c = Aes256Gcm::new(&k.into());
    let mut buf = ct.to_vec();
    c.decrypt_in_place(&Nonce::<Aes256Gcm>::from(n), aad, &mut buf).ok()?;
    Some(buf)
}

pub fn edge_ikm(agreement: &[u8; 32], edge: &[u8; 32]) -> [u8; 64] {
    let mut m = [0u8; 64];
    m[..32].copy_from_slice(agreement);
    m[32..].copy_from_slice(edge);
    m
}

/// follow(E) = HKDF(E || agreement, quo-edge).
pub fn follow(edge: &[u8; 32], agreement: &[u8; 32]) -> [u8; 32] {
    let mut m = [0u8; 64];
    m[..32].copy_from_slice(edge);
    m[32..].copy_from_slice(agreement);
    hkdf32(&m, "quo-edge")
}

// ---------------------------------------------------------------- signatures

pub fn ed_pub(secret: &[u8; 32]) -> [u8; 32] {
    SigningKey::from_bytes(secret).verifying_key().to_bytes()
}

pub fn ed_sign(secret: &[u8; 32], msg: &[u8]) -> [u8; 64] {
    SigningKey::from_bytes(secret).sign(msg).to_bytes()
}

fn y_non_canonical(pk: &[u8; 32]) -> bool {
    // y (low 255 bits) >= p = 2^255 - 19
    pk[31] & 0x7f == 0x7f && pk[1..31].iter().all(|b| *b == 0xff) && pk[0] >= 0xed
}

/// The cofactorless check of RFC 8032 with Quo's list of failures.
pub fn ed_verify(pk: &[u8; 32], msg: &[u8], sig: &[u8]) -> bool {
    if sig.len() != 64 {
        return false;
    }
    if y_non_canonical(pk) {
        return false;
    }
    let vk = match VerifyingKey::from_bytes(pk) {
        Ok(v) => v,
        Err(_) => return false,
    };
    if vk.is_weak() {
        return false;
    }
    let mut s = [0u8; 64];
    s.copy_from_slice(sig);
    let sig = Signature::from_bytes(&s);
    // `verify` (not `verify_strict`) is cofactorless and compares R byte for byte,
    // so a non-canonical or undecodable R fails, and a small-order R passes.
    ed25519_dalek::Verifier::verify(&vk, msg, &sig).is_ok()
}

// ---------------------------------------------------------------- ward key

pub fn seed_from_text(t: &str) -> [u8; 32] {
    sha256(t.as_bytes())
}

pub fn seed_from_bytes(b: &[u8]) -> [u8; 32] {
    if b.len() == 32 {
        let mut s = [0u8; 32];
        s.copy_from_slice(b);
        s
    } else {
        sha256(b)
    }
}

pub struct WardKey {
    pub sign_secret: [u8; 32],
    pub sign_pk: [u8; 32],
    pub seal_secret: [u8; 32],
    pub padlock: [u8; 32],
}

impl WardKey {
    pub fn from_seed(seed: &[u8; 32]) -> WardKey {
        let sign_secret = hkdf32(seed, "quo-ward-sign");
        let seal_secret = hkdf32(seed, "quo-ward-seal");
        WardKey {
            sign_pk: ed_pub(&sign_secret),
            padlock: x25519_pub(&seal_secret),
            sign_secret,
            seal_secret,
        }
    }
    pub fn pk_bytes(&self) -> [u8; 64] {
        let mut o = [0u8; 64];
        o[..32].copy_from_slice(&self.sign_pk);
        o[32..].copy_from_slice(&self.padlock);
        o
    }
    pub fn pk_hex(&self) -> String {
        hex(&self.pk_bytes())
    }
}

// ---------------------------------------------------------------- lock

pub struct Lock {
    dk: DecapsulationKey<MlKem768Params>,
    pub ek: Vec<u8>,
}

impl Lock {
    pub fn generate() -> Lock {
        let d = draw::<32>();
        let z = draw::<32>();
        let (dk, ek) = MlKem768::generate_deterministic(&d.into(), &z.into());
        Lock { ek: ek.as_bytes().to_vec(), dk }
    }
    pub fn decapsulate(&self, ct: &[u8]) -> [u8; 32] {
        let arr = ml_kem::array::Array::try_from(ct).expect("ct length");
        let ss = self.dk.decapsulate(&arr).expect("decap infallible");
        let mut o = [0u8; 32];
        o.copy_from_slice(&ss);
        o
    }
}

/// FIPS 203 encapsulation-key modulus check: every 12-bit coefficient below q.
pub fn ek_valid(ek: &[u8]) -> bool {
    if ek.len() != LOCK_EK_LEN {
        return false;
    }
    for c in ek[..1152].chunks(3) {
        let a = (c[0] as u16) | ((c[1] as u16 & 0x0f) << 8);
        let b = ((c[1] as u16) >> 4) | ((c[2] as u16) << 4);
        if a >= 3329 || b >= 3329 {
            return false;
        }
    }
    true
}

/// Encapsulate to an encapsulation key: (ciphertext, shared secret).
pub fn encapsulate(ek: &[u8]) -> Option<(Vec<u8>, [u8; 32])> {
    if !ek_valid(ek) {
        return None;
    }
    let arr = ml_kem::array::Array::try_from(ek).ok()?;
    let ek = EncapsulationKey::<MlKem768Params>::from_bytes(&arr);
    let m = draw::<32>();
    let (ct, ss) = ek.encapsulate_deterministic(&m.into()).ok()?;
    let mut o = [0u8; 32];
    o.copy_from_slice(&ss);
    Some((ct.to_vec(), o))
}

// ---------------------------------------------------------------- hex

pub fn hex(b: &[u8]) -> String {
    const D: &[u8; 16] = b"0123456789abcdef";
    let mut s = String::with_capacity(b.len() * 2);
    for x in b {
        s.push(D[(x >> 4) as usize] as char);
        s.push(D[(x & 15) as usize] as char);
    }
    s
}

/// Lowercase hex only. `len` in bytes, or any length when None.
pub fn unhex(s: &str, len: Option<usize>) -> Option<Vec<u8>> {
    let b = s.as_bytes();
    if b.len() % 2 != 0 {
        return None;
    }
    if let Some(l) = len {
        if b.len() != l * 2 {
            return None;
        }
    }
    fn v(c: u8) -> Option<u8> {
        match c {
            b'0'..=b'9' => Some(c - b'0'),
            b'a'..=b'f' => Some(c - b'a' + 10),
            _ => None,
        }
    }
    let mut o = Vec::with_capacity(b.len() / 2);
    for p in b.chunks(2) {
        o.push(v(p[0])? << 4 | v(p[1])?);
    }
    Some(o)
}

pub fn arr32(b: &[u8]) -> [u8; 32] {
    let mut o = [0u8; 32];
    o.copy_from_slice(b);
    o
}
