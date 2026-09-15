// SPDX-License-Identifier: Apache-2.0
//! Words and values: what crosses an edge, and the few things built on it.
//!
//! A [`Value`] is I-JSON held to the value rule. The type carries most of the
//! rule on its own: a [`Value::String`] is valid Unicode text, a [`Number`] is
//! a finite double that is never minus zero, and a [`Map`] holds each key
//! once. What a type cannot hold, the depth bound and the rules about JSON
//! text, is checked
//! where text is read ([`Value::parse`]) and where a value is written
//! ([`Value::check`]).

mod blueprint;
mod canonical;
mod json;
mod number;
mod words;

pub use blueprint::{digest, Blueprint};
pub use number::Number;
pub use words::Word;

use std::fmt;

/// How deep a value may nest: sixty-four containers, and a sixty-fifth is not
/// a value. A scalar alone is depth zero, `[]` is depth one.
pub const MAX_DEPTH: usize = 64;

/// How deep a payload may nest. Depth is counted from the value written and
/// never from a root it is written under, so an arg of depth sixty-four stands
/// whatever carries it. The payload is a value at its own root, one object
/// holding `args` holding the arg, so it nests no deeper than sixty-six, and
/// that bound is on the payload and never on the arg.
pub const MAX_PAYLOAD_DEPTH: usize = MAX_DEPTH + 2;

/// How deep a reply may nest: one object holding `object`, so sixty-five, and
/// that bound is on the reply and never on the object.
pub const MAX_REPLY_DEPTH: usize = MAX_DEPTH + 1;

/// One I-JSON value.
#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(Number),
    String(String),
    Array(Vec<Value>),
    Object(Map),
}

/// A JSON object: each key once, in the order it was first inserted.
///
/// The order is kept because a JSON body is written in an order a vector pins;
/// the digest never reads it, since the canonical form sorts.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Map {
    entries: Vec<(String, Value)>,
}

/// Why something is not a value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ValueError {
    /// Not JSON text at all, at this byte offset.
    Syntax(usize),
    /// Bytes that are not UTF-8.
    NotUtf8,
    /// An object naming one key twice.
    DuplicateKey(String),
    /// A surrogate escape that does not stand in a pair.
    LoneSurrogate,
    /// A negative zero, `-0` or `-0.0` alike.
    MinusZero,
    /// A number no double holds: an integer a double would round, a value
    /// past the largest double, or a non-zero value that rounds to zero.
    NotDouble(String),
    /// Nested past [`MAX_DEPTH`].
    TooDeep,
    /// A root key of cells that is the ward's.
    WardKey(String),
    /// A value where the ward reads a record of another shape.
    NotObject,
}

impl fmt::Display for ValueError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ValueError::Syntax(at) => write!(f, "not JSON at byte {at}"),
            ValueError::NotUtf8 => write!(f, "not UTF-8"),
            ValueError::DuplicateKey(k) => write!(f, "duplicate key {k:?}"),
            ValueError::LoneSurrogate => write!(f, "a lone surrogate"),
            ValueError::MinusZero => write!(f, "minus zero is not a value"),
            ValueError::NotDouble(t) => write!(f, "{t} is not a double"),
            ValueError::TooDeep => f.write_str("nested past the bound"),
            ValueError::WardKey(k) => write!(f, "{k:?} is the ward's"),
            ValueError::NotObject => write!(f, "not an object"),
        }
    }
}

impl std::error::Error for ValueError {}

impl Value {
    /// Reads JSON text as a value, refusing whatever the value rule refuses.
    pub fn parse(text: &str) -> Result<Value, ValueError> {
        json::parse(text)
    }

    /// Reads the bytes of a payload, which is a value at its own root and
    /// nests no deeper than [`MAX_PAYLOAD_DEPTH`]. The args it carries are
    /// counted from themselves and held to [`MAX_DEPTH`] where they are read.
    pub fn parse_payload(bytes: &[u8]) -> Result<Value, ValueError> {
        let text = std::str::from_utf8(bytes).map_err(|_| ValueError::NotUtf8)?;
        json::parse_under(text, MAX_PAYLOAD_DEPTH)
    }

    /// Reads the bytes of a reply, which is a value at its own root and nests
    /// no deeper than [`MAX_REPLY_DEPTH`]. The object it carries is held to
    /// [`MAX_DEPTH`] where it is read.
    pub fn parse_reply(bytes: &[u8]) -> Result<Value, ValueError> {
        let text = std::str::from_utf8(bytes).map_err(|_| ValueError::NotUtf8)?;
        json::parse_under(text, MAX_REPLY_DEPTH)
    }

    /// Whether this value may be written or sent. Everything but the depth is
    /// already held by the type.
    pub fn check(&self) -> Result<(), ValueError> {
        if self.depth() > MAX_DEPTH {
            Err(ValueError::TooDeep)
        } else {
            Ok(())
        }
    }

    /// How many containers deep this value nests.
    pub fn depth(&self) -> usize {
        match self {
            Value::Array(items) => 1 + items.iter().map(Value::depth).max().unwrap_or(0),
            Value::Object(map) => 1 + map.values().map(Value::depth).max().unwrap_or(0),
            _ => 0,
        }
    }

    /// JSON text, keys in their own order, numbers as ECMAScript writes them.
    pub fn to_json(&self) -> String {
        let mut out = String::new();
        canonical::write(self, false, &mut out);
        out
    }

    /// The RFC 8785 canonical form: keys by UTF-16 code unit, ES numbers.
    pub fn canonical(&self) -> String {
        let mut out = String::new();
        canonical::write(self, true, &mut out);
        out
    }

    pub fn is_null(&self) -> bool {
        matches!(self, Value::Null)
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            Value::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Value::Bool(b) => Some(*b),
            _ => None,
        }
    }

    pub fn as_number(&self) -> Option<Number> {
        match self {
            Value::Number(n) => Some(*n),
            _ => None,
        }
    }

    pub fn as_array(&self) -> Option<&Vec<Value>> {
        match self {
            Value::Array(a) => Some(a),
            _ => None,
        }
    }

    pub fn as_object(&self) -> Option<&Map> {
        match self {
            Value::Object(m) => Some(m),
            _ => None,
        }
    }

    pub fn as_object_mut(&mut self) -> Option<&mut Map> {
        match self {
            Value::Object(m) => Some(m),
            _ => None,
        }
    }

    /// The field `key` of an object, or `None` for a missing field and for a
    /// value that is not an object.
    pub fn get(&self, key: &str) -> Option<&Value> {
        self.as_object().and_then(|m| m.get(key))
    }
}

impl fmt::Display for Value {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.to_json())
    }
}

impl From<bool> for Value {
    fn from(b: bool) -> Value {
        Value::Bool(b)
    }
}

impl From<&str> for Value {
    fn from(s: &str) -> Value {
        Value::String(s.to_owned())
    }
}

impl From<String> for Value {
    fn from(s: String) -> Value {
        Value::String(s)
    }
}

impl From<Number> for Value {
    fn from(n: Number) -> Value {
        Value::Number(n)
    }
}

impl From<Map> for Value {
    fn from(m: Map) -> Value {
        Value::Object(m)
    }
}

impl From<Vec<Value>> for Value {
    fn from(items: Vec<Value>) -> Value {
        Value::Array(items)
    }
}

impl<T: Into<Value>> From<Option<T>> for Value {
    fn from(o: Option<T>) -> Value {
        o.map_or(Value::Null, Into::into)
    }
}

impl Map {
    pub fn new() -> Map {
        Map::default()
    }

    /// How many keys the object names.
    pub fn count(&self) -> usize {
        self.entries.len()
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.entries.iter().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    pub fn get_mut(&mut self, key: &str) -> Option<&mut Value> {
        self.entries.iter_mut().find(|(k, _)| k == key).map(|(_, v)| v)
    }

    pub fn contains_key(&self, key: &str) -> bool {
        self.get(key).is_some()
    }

    /// Sets `key`, keeping its place if it was already there, and returns
    /// what it held.
    pub fn insert(&mut self, key: impl Into<String>, value: impl Into<Value>) -> Option<Value> {
        let key = key.into();
        let value = value.into();
        match self.get_mut(&key) {
            Some(slot) => Some(std::mem::replace(slot, value)),
            None => {
                self.entries.push((key, value));
                None
            }
        }
    }

    pub fn remove(&mut self, key: &str) -> Option<Value> {
        let at = self.entries.iter().position(|(k, _)| k == key)?;
        Some(self.entries.remove(at).1)
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &Value)> {
        self.entries.iter().map(|(k, v)| (k.as_str(), v))
    }

    pub fn values(&self) -> impl Iterator<Item = &Value> {
        self.entries.iter().map(|(_, v)| v)
    }
}

impl<K: Into<String>, V: Into<Value>> FromIterator<(K, V)> for Map {
    fn from_iter<I: IntoIterator<Item = (K, V)>>(iter: I) -> Map {
        let mut map = Map::new();
        for (k, v) in iter {
            map.insert(k, v);
        }
        map
    }
}
