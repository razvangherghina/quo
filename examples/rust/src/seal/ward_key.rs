// SPDX-License-Identifier: Apache-2.0
//! The seed, the ward pk and a being key: what a key is named by outward.

use crate::arithmetic::{self, WardKey};
use crate::hex::{hex, unhex};
use std::fmt;
use std::str::FromStr;

/// Thirty-two bytes a ward's key comes from.
#[derive(Clone, PartialEq, Eq)]
pub struct Seed([u8; 32]);

impl Seed {
    /// Bytes of the key length are the seed; any other length is SHA-256'd.
    pub fn from_bytes(bytes: &[u8]) -> Seed {
        Seed(bytes.try_into().unwrap_or_else(|_| arithmetic::sha256(bytes)))
    }

    /// Text is always SHA-256'd as its UTF-8 bytes, whatever its length: a
    /// thirty-two character name is a name and not a key.
    pub fn from_text(text: &str) -> Seed {
        Seed(arithmetic::sha256(text.as_bytes()))
    }

    pub fn as_bytes(&self) -> &[u8; 32] {
        &self.0
    }

    /// The ward key this seed is, derived where the arithmetic derives it.
    pub fn ward_key(&self) -> WardKey {
        WardKey::from_seed(&self.0)
    }

    pub fn ward_pk(&self) -> WardPk {
        let key = self.ward_key();
        WardPk { sign: key.signing_pk(), padlock: key.padlock() }
    }
}

impl fmt::Debug for Seed {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("Seed(..)")
    }
}

/// The pk a being key speaks under, from its thirty-two byte secret, which is
/// the key as it stands and derived from nothing.
pub fn being_pk(secret: &[u8; 32]) -> [u8; 32] {
    arithmetic::signing_pk(secret)
}

/// A ward named outward: the signing pk then the padlock, 128 lowercase hex.
#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub struct WardPk {
    pub sign: [u8; 32],
    pub padlock: [u8; 32],
}

impl WardPk {
    pub fn to_bytes(&self) -> [u8; 64] {
        let mut out = [0u8; 64];
        out[..32].copy_from_slice(&self.sign);
        out[32..].copy_from_slice(&self.padlock);
        out
    }

    pub fn from_bytes(bytes: &[u8; 64]) -> WardPk {
        let mut sign = [0u8; 32];
        let mut padlock = [0u8; 32];
        sign.copy_from_slice(&bytes[..32]);
        padlock.copy_from_slice(&bytes[32..]);
        WardPk { sign, padlock }
    }
}

impl fmt::Display for WardPk {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&hex(&self.to_bytes()))
    }
}

impl fmt::Debug for WardPk {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "WardPk({self})")
    }
}

/// Why text is not a ward pk.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct NotWardPk;

impl fmt::Display for NotWardPk {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("not 128 lowercase hex")
    }
}

impl std::error::Error for NotWardPk {}

impl FromStr for WardPk {
    type Err = NotWardPk;
    /// Exactly 128 lowercase hex digits, and nothing else.
    fn from_str(text: &str) -> Result<WardPk, NotWardPk> {
        unhex(text).map(|bytes| WardPk::from_bytes(&bytes)).ok_or(NotWardPk)
    }
}
