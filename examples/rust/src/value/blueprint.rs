// SPDX-License-Identifier: Apache-2.0
//! Blueprint and digest.

use super::Value;
use crate::arithmetic::sha256;
use crate::hex::hex;

/// The SHA-256, as lowercase hex, of the canonical form of whatever came
/// back. Only values reach a digest: what the value rule refuses is never
/// mended into one, and costs the digest as `None`. A number outside the
/// doubles is already refused by its type, so the depth is what is checked.
pub fn digest(value: &Value) -> Option<String> {
    value.check().ok()?;
    Some(hex(&sha256(value.canonical().as_bytes())))
}

/// A blueprint: a value read as a list of asks with a name and an input each.
///
/// It holds the value it was read from whole, so what is written as the
/// blueprint is what came back, and a field this kit does not name is kept.
#[derive(Clone, Debug, PartialEq)]
pub struct Blueprint {
    value: Value,
}

impl Blueprint {
    /// Reads a far describe as a blueprint, or `None` when it is not one: an
    /// object with `notes` present, whatever they hold, and `asks` a list,
    /// each entry an object with a string `name` and an `input` that is an
    /// object.
    pub fn read(value: &Value) -> Option<Blueprint> {
        value.get("notes")?;
        let asks = value.get("asks")?.as_array()?;
        let every = asks.iter().all(|ask| ask.get("name").and_then(Value::as_str).is_some() && ask.get("input").and_then(Value::as_object).is_some());
        every.then(|| Blueprint { value: value.clone() })
    }

    pub fn into_value(self) -> Value {
        self.value
    }
}
