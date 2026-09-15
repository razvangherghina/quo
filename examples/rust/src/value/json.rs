// SPDX-License-Identifier: Apache-2.0
//! JSON text to a value, refusing on the way whatever the value rule refuses:
//! a duplicate key, a lone surrogate, minus zero, a number no double holds,
//! and a nesting past the bound.

use super::{Map, Number, Value, ValueError, MAX_DEPTH};
use std::collections::HashSet;

pub(crate) fn parse(text: &str) -> Result<Value, ValueError> {
    parse_under(text, MAX_DEPTH)
}

/// Reads text written at a root whose own bound is wider than a value's: a
/// payload, or a reply.
pub(crate) fn parse_under(text: &str, max: usize) -> Result<Value, ValueError> {
    let mut p = Parser { bytes: text.as_bytes(), text, at: 0, max };
    p.space();
    let value = p.value(0)?;
    p.space();
    if p.at != p.bytes.len() {
        return Err(ValueError::Syntax(p.at));
    }
    Ok(value)
}

struct Parser<'a> {
    bytes: &'a [u8],
    text: &'a str,
    at: usize,
    max: usize,
}

impl Parser<'_> {
    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.at).copied()
    }

    fn space(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.at += 1;
        }
    }

    fn syntax<T>(&self) -> Result<T, ValueError> {
        Err(ValueError::Syntax(self.at))
    }

    fn literal(&mut self, word: &str, value: Value) -> Result<Value, ValueError> {
        if self.bytes[self.at..].starts_with(word.as_bytes()) {
            self.at += word.len();
            Ok(value)
        } else {
            self.syntax()
        }
    }

    /// A value whose containers, if any, stand at `depth + 1`.
    fn value(&mut self, depth: usize) -> Result<Value, ValueError> {
        match self.peek() {
            Some(b'n') => self.literal("null", Value::Null),
            Some(b't') => self.literal("true", Value::Bool(true)),
            Some(b'f') => self.literal("false", Value::Bool(false)),
            Some(b'"') => Ok(Value::String(self.string()?)),
            Some(b'[') => self.array(depth + 1),
            Some(b'{') => self.object(depth + 1),
            Some(b'-' | b'0'..=b'9') => self.number(),
            _ => self.syntax(),
        }
    }

    fn array(&mut self, depth: usize) -> Result<Value, ValueError> {
        if depth > self.max {
            return Err(ValueError::TooDeep);
        }
        self.at += 1;
        let mut items = Vec::new();
        self.space();
        if self.peek() == Some(b']') {
            self.at += 1;
            return Ok(Value::Array(items));
        }
        loop {
            self.space();
            items.push(self.value(depth)?);
            self.space();
            match self.peek() {
                Some(b',') => self.at += 1,
                Some(b']') => {
                    self.at += 1;
                    return Ok(Value::Array(items));
                }
                _ => return self.syntax(),
            }
        }
    }

    fn object(&mut self, depth: usize) -> Result<Value, ValueError> {
        if depth > self.max {
            return Err(ValueError::TooDeep);
        }
        self.at += 1;
        // Read before any signature is checked, so a stranger chooses how many
        // keys there are: each is looked up once, never against every other.
        let mut entries = Vec::new();
        let mut names = HashSet::new();
        self.space();
        if self.peek() == Some(b'}') {
            self.at += 1;
            return Ok(Value::Object(Map { entries }));
        }
        loop {
            self.space();
            if self.peek() != Some(b'"') {
                return self.syntax();
            }
            let key = self.string()?;
            self.space();
            if self.peek() != Some(b':') {
                return self.syntax();
            }
            self.at += 1;
            self.space();
            let value = self.value(depth)?;
            if !names.insert(key.clone()) {
                return Err(ValueError::DuplicateKey(key));
            }
            entries.push((key, value));
            self.space();
            match self.peek() {
                Some(b',') => self.at += 1,
                Some(b'}') => {
                    self.at += 1;
                    return Ok(Value::Object(Map { entries }));
                }
                _ => return self.syntax(),
            }
        }
    }

    fn hex4(&mut self) -> Result<u32, ValueError> {
        let digits = self.text.get(self.at..self.at + 4).ok_or(ValueError::Syntax(self.at))?;
        if !digits.bytes().all(|b| b.is_ascii_hexdigit()) {
            return self.syntax();
        }
        self.at += 4;
        Ok(u32::from_str_radix(digits, 16).expect("four hex digits"))
    }

    fn string(&mut self) -> Result<String, ValueError> {
        self.at += 1;
        let mut out = String::new();
        loop {
            let start = self.at;
            while let Some(b) = self.peek() {
                if b == b'"' || b == b'\\' || b < 0x20 {
                    break;
                }
                self.at += 1;
            }
            out.push_str(&self.text[start..self.at]);
            match self.peek() {
                Some(b'"') => {
                    self.at += 1;
                    return Ok(out);
                }
                Some(b'\\') => {
                    self.at += 1;
                    let escape = self.peek();
                    self.at += 1;
                    match escape {
                        Some(b'"') => out.push('"'),
                        Some(b'\\') => out.push('\\'),
                        Some(b'/') => out.push('/'),
                        Some(b'b') => out.push('\u{8}'),
                        Some(b'f') => out.push('\u{c}'),
                        Some(b'n') => out.push('\n'),
                        Some(b'r') => out.push('\r'),
                        Some(b't') => out.push('\t'),
                        Some(b'u') => {
                            let unit = self.hex4()?;
                            let code = match unit {
                                0xD800..=0xDBFF => {
                                    if !self.bytes[self.at..].starts_with(b"\\u") {
                                        return Err(ValueError::LoneSurrogate);
                                    }
                                    self.at += 2;
                                    let low = self.hex4()?;
                                    if !(0xDC00..=0xDFFF).contains(&low) {
                                        return Err(ValueError::LoneSurrogate);
                                    }
                                    0x10000 + ((unit - 0xD800) << 10) + (low - 0xDC00)
                                }
                                0xDC00..=0xDFFF => return Err(ValueError::LoneSurrogate),
                                other => other,
                            };
                            out.push(char::from_u32(code).expect("a scalar value"));
                        }
                        _ => {
                            self.at -= 1;
                            return self.syntax();
                        }
                    }
                }
                _ => return self.syntax(),
            }
        }
    }

    fn number(&mut self) -> Result<Value, ValueError> {
        let start = self.at;
        if self.peek() == Some(b'-') {
            self.at += 1;
        }
        match self.peek() {
            Some(b'0') => self.at += 1,
            Some(b'1'..=b'9') => self.digits(),
            _ => return self.syntax(),
        }
        if self.peek() == Some(b'.') {
            self.at += 1;
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return self.syntax();
            }
            self.digits();
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.at += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.at += 1;
            }
            if !matches!(self.peek(), Some(b'0'..=b'9')) {
                return self.syntax();
            }
            self.digits();
        }
        Number::from_json_text(&self.text[start..self.at]).map(Value::Number)
    }

    fn digits(&mut self) {
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.at += 1;
        }
    }
}
