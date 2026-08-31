//! The arithmetic of Quo: the four algorithms of Article VI, and nothing
//! else. Ed25519 signs, X25519 seals, SHA-256 commits, AES-256-GCM encrypts
//! under a key derived through HKDF-SHA-256 with a fixed label.
//!
//! There is no suite identifier and no negotiation. Every draw of randomness
//! is taken as an argument: nothing here reaches for a random number
//! generator, and nothing here touches the host.

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use ed25519_dalek::{Signature, Signer, SigningKey, Verifier, VerifyingKey};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

/// A key is 32 bytes. Any prettier spelling of one is a kit's convenience.
pub const KEY: usize = 32;

/// A digest is 32 bytes.
pub const DIGEST: usize = 32;

/// An Ed25519 signature is 64 bytes.
pub const SIGNATURE: usize = 64;

/// The AES-GCM nonce drawn from the derivation.
pub const NONCE: usize = 12;

/// The AES-GCM tag, full length, and the last bytes of the box.
pub const TAG: usize = 16;

/// The fixed ASCII label the sealing key is derived under. The label and the
/// info are one constant and not two.
pub const INFO: &[u8] = b"quo-seal";

/// What the arithmetic refuses. Every one of these is a refusal and never a
/// repair.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Error {
    /// The signature does not stand for this key over these bytes. A key that
    /// is not a point and a signature that does not verify are one answer,
    /// because the law draws no line between them.
    Signature,
    /// The box does not open: too short, turned, or under other additional
    /// data.
    Seal,
    /// The agreement handed back thirty-two zero bytes. The padlock was not a
    /// real key and a seal derived from it would protect nothing.
    Agreement,
}

impl std::fmt::Display for Error {
    fn fmt(&self, out: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let said = match self {
            Error::Signature => "the signature does not stand",
            Error::Seal => "the box does not open",
            Error::Agreement => "the agreement is dead",
        };
        out.write_str(said)
    }
}

impl std::error::Error for Error {}

/// SHA-256, over anything.
pub fn hash(bytes: &[u8]) -> [u8; DIGEST] {
    let mut digest = Sha256::new();
    digest.update(bytes);
    digest.finalize().into()
}

/// The heir commitment: the hash of the pk of the warden the heir would be
/// spent at, then the heir's pk, each thirty-two bytes, in that order.
pub fn commitment(warden: &[u8; KEY], heir: &[u8; KEY]) -> [u8; DIGEST] {
    let mut digest = Sha256::new();
    digest.update(warden);
    digest.update(heir);
    digest.finalize().into()
}

/// The public half of the signing pair minted from these thirty-two bytes.
/// They are the seed as Ed25519 defines it, and the public key is derived by
/// the algorithm's own rules.
pub fn signing_pk(seed: &[u8; KEY]) -> [u8; KEY] {
    SigningKey::from_bytes(seed).verifying_key().to_bytes()
}

/// Sign with the pair minted from this seed.
pub fn sign(seed: &[u8; KEY], message: &[u8]) -> [u8; SIGNATURE] {
    SigningKey::from_bytes(seed).sign(message).to_bytes()
}

/// The eight small-order points' encodings — the identity, the point of order
/// two, the two of order four (the all-zero key among them) and the four of
/// order eight — written out as constants so no kit reimplements the
/// arithmetic to comply. A signature under one of these binds to no secret.
const SMALL_ORDER: [[u8; KEY]; 8] = [
    hex32("0100000000000000000000000000000000000000000000000000000000000000"),
    hex32("ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"),
    hex32("0000000000000000000000000000000000000000000000000000000000000000"),
    hex32("0000000000000000000000000000000000000000000000000000000000000080"),
    hex32("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05"),
    hex32("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a"),
    hex32("26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85"),
    hex32("c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa"),
];

const fn hex32(text: &str) -> [u8; KEY] {
    let raw = text.as_bytes();
    let mut out = [0u8; KEY];
    let mut at = 0;
    while at < KEY {
        out[at] = nibble(raw[at * 2]) * 16 + nibble(raw[at * 2 + 1]);
        at += 1;
    }
    out
}

const fn nibble(byte: u8) -> u8 {
    match byte {
        b'0'..=b'9' => byte - b'0',
        b'a'..=b'f' => byte - b'a' + 10,
        _ => panic!("a small-order point is written in lowercase hex"),
    }
}

/// Whether this public key is all zeros or of small order, which is the one
/// named pre-check verification makes.
pub fn small_order(pk: &[u8; KEY]) -> bool {
    SMALL_ORDER.iter().any(|point| point == pk)
}

/// Verify a signature under a public key. A key that is not a point, and a
/// signature that does not stand, are the same answer: a refusal.
///
/// Before RFC 8032's check stands one named refusal: **a public key that is
/// all zeros or of small order is silence, no signature examined.** The
/// pre-check stands in front of whatever verifier the platform supplies; a
/// stricter platform refuses more, which stays legal.
pub fn verify(pk: &[u8; KEY], message: &[u8], signature: &[u8; SIGNATURE]) -> Result<(), Error> {
    if small_order(pk) {
        return Err(Error::Signature);
    }
    let key = VerifyingKey::from_bytes(pk).map_err(|_| Error::Signature)?;
    key.verify(message, &Signature::from_bytes(signature))
        .map_err(|_| Error::Signature)
}

/// The public half of the sealing pair minted from these thirty-two bytes.
/// They are the private key itself, as X25519 defines it; clamping happens
/// inside the algorithm and nothing is derived from a seed first.
pub fn sealing_pk(secret: &[u8; KEY]) -> [u8; KEY] {
    PublicKey::from(&StaticSecret::from(*secret)).to_bytes()
}

/// The X25519 agreement, handed back raw.
///
/// **An agreement that hands back thirty-two zero bytes is refused at the
/// point of agreement**: the padlock was not a real key, and a seal derived
/// from it would protect nothing. `x25519-dalek` hands the degenerate output
/// back rather than erroring, so this kit is where that refusal is said.
pub fn agree(secret: &[u8; KEY], pk: &[u8; KEY]) -> Result<[u8; KEY], Error> {
    let shared = StaticSecret::from(*secret)
        .diffie_hellman(&PublicKey::from(*pk))
        .to_bytes();
    if shared == [0u8; KEY] {
        return Err(Error::Agreement);
    }
    Ok(shared)
}

/// The sealing key and the nonce it pairs with, drawn together from one
/// derivation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sealing {
    pub key: [u8; KEY],
    pub nonce: [u8; NONCE],
}

/// HKDF-SHA-256, used whole — extract, then expand — over the raw
/// thirty-two-byte shared secret exactly as the agreement hands it back:
/// nothing prepended, nothing hashed first. An empty salt, the fixed info
/// `quo-seal`, and forty-four bytes drawn — thirty-two of key, then twelve of
/// nonce.
pub fn derive(shared: &[u8; KEY]) -> Sealing {
    let mut drawn = [0u8; KEY + NONCE];
    Hkdf::<Sha256>::new(None, shared)
        .expand(INFO, &mut drawn)
        .expect("forty-four bytes is within what HKDF-SHA-256 will draw");
    let mut sealing = Sealing {
        key: [0u8; KEY],
        nonce: [0u8; NONCE],
    };
    sealing.key.copy_from_slice(&drawn[..KEY]);
    sealing.nonce.copy_from_slice(&drawn[KEY..]);
    sealing
}

/// AES-256-GCM under the derived key and nonce, with the ephemeral public key
/// as the additional authenticated data. The box is the ciphertext first and
/// the sixteen-byte tag after it.
pub fn seal(shared: &[u8; KEY], additional: &[u8], plaintext: &[u8]) -> Vec<u8> {
    let sealing = derive(shared);
    Aes256Gcm::new((&sealing.key).into())
        .encrypt(
            Nonce::from_slice(&sealing.nonce),
            Payload {
                msg: plaintext,
                aad: additional,
            },
        )
        .expect("AES-256-GCM seals any plaintext this kit carries")
}

/// Open a box. A box a byte short, a byte turned, or presented under other
/// additional data does not open.
pub fn open(shared: &[u8; KEY], additional: &[u8], sealed: &[u8]) -> Result<Vec<u8>, Error> {
    if sealed.len() < TAG {
        return Err(Error::Seal);
    }
    let sealing = derive(shared);
    Aes256Gcm::new((&sealing.key).into())
        .decrypt(
            Nonce::from_slice(&sealing.nonce),
            Payload {
                msg: sealed,
                aad: additional,
            },
        )
        .map_err(|_| Error::Seal)
}
