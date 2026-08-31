//! A JSON reader small enough to be part of the bench, so the kit reads the
//! pinned corpus without a crate. It handles what the corpus contains and
//! refuses the rest. It sits beside the crates rather than inside one,
//! because every crate's bench reads the same corpus.

#![allow(dead_code)]

use std::collections::BTreeMap;

#[derive(Debug, Clone, PartialEq)]
pub enum Json {
    Null,
    Bool(bool),
    Number(f64),
    Text(String),
    List(Vec<Json>),
    Object(BTreeMap<String, Json>),
}

impl Json {
    pub fn get(&self, key: &str) -> Option<&Json> {
        match self {
            Json::Object(map) => map.get(key),
            _ => None,
        }
    }

    pub fn text(&self) -> &str {
        match self {
            Json::Text(value) => value,
            other => panic!("expected a string, got {other:?}"),
        }
    }

    pub fn list(&self) -> &[Json] {
        match self {
            Json::List(value) => value,
            other => panic!("expected a list, got {other:?}"),
        }
    }

    /// The names an object carries, in sorted order. A bench asserts its own
    /// coverage against this, so nothing in the corpus is skipped silently.
    pub fn names(&self) -> Vec<&str> {
        match self {
            Json::Object(map) => map.keys().map(String::as_str).collect(),
            other => panic!("expected an object, got {other:?}"),
        }
    }

    pub fn flag(&self, key: &str) -> bool {
        matches!(self.get(key), Some(Json::Bool(true)))
    }
}

pub fn parse(source: &str) -> Json {
    let bytes: Vec<char> = source.chars().collect();
    let mut at = 0usize;
    let value = read(&bytes, &mut at);
    skip(&bytes, &mut at);
    assert_eq!(at, bytes.len(), "trailing bytes after the JSON value");
    value
}

fn skip(chars: &[char], at: &mut usize) {
    while *at < chars.len() && chars[*at].is_whitespace() {
        *at += 1;
    }
}

fn read(chars: &[char], at: &mut usize) -> Json {
    skip(chars, at);
    match chars[*at] {
        '{' => {
            *at += 1;
            let mut map = BTreeMap::new();
            skip(chars, at);
            if chars[*at] == '}' {
                *at += 1;
                return Json::Object(map);
            }
            loop {
                skip(chars, at);
                let key = read_string(chars, at);
                skip(chars, at);
                assert_eq!(chars[*at], ':', "expected a colon");
                *at += 1;
                let value = read(chars, at);
                map.insert(key, value);
                skip(chars, at);
                match chars[*at] {
                    ',' => *at += 1,
                    '}' => {
                        *at += 1;
                        return Json::Object(map);
                    }
                    other => panic!("unexpected {other:?} in an object"),
                }
            }
        }
        '[' => {
            *at += 1;
            let mut list = Vec::new();
            skip(chars, at);
            if chars[*at] == ']' {
                *at += 1;
                return Json::List(list);
            }
            loop {
                list.push(read(chars, at));
                skip(chars, at);
                match chars[*at] {
                    ',' => *at += 1,
                    ']' => {
                        *at += 1;
                        return Json::List(list);
                    }
                    other => panic!("unexpected {other:?} in a list"),
                }
            }
        }
        '"' => Json::Text(read_string(chars, at)),
        't' => {
            expect(chars, at, "true");
            Json::Bool(true)
        }
        'f' => {
            expect(chars, at, "false");
            Json::Bool(false)
        }
        'n' => {
            expect(chars, at, "null");
            Json::Null
        }
        _ => {
            let start = *at;
            while *at < chars.len() && !matches!(chars[*at], ',' | '}' | ']' | ' ' | '\n') {
                *at += 1;
            }
            let written: String = chars[start..*at].iter().collect();
            Json::Number(written.parse().expect("a number"))
        }
    }
}

fn expect(chars: &[char], at: &mut usize, word: &str) {
    for wanted in word.chars() {
        assert_eq!(chars[*at], wanted, "expected {word}");
        *at += 1;
    }
}

fn read_escape(chars: &[char], at: &mut usize) -> u32 {
    let code: String = chars[*at..*at + 4].iter().collect();
    *at += 4;
    u32::from_str_radix(&code, 16).expect("a hex escape")
}

fn read_string(chars: &[char], at: &mut usize) -> String {
    assert_eq!(chars[*at], '"', "expected a string");
    *at += 1;
    let mut out = String::new();
    loop {
        let here = chars[*at];
        *at += 1;
        match here {
            '"' => return out,
            '\\' => {
                let escape = chars[*at];
                *at += 1;
                match escape {
                    '"' => out.push('"'),
                    '\\' => out.push('\\'),
                    '/' => out.push('/'),
                    'b' => out.push('\u{8}'),
                    'f' => out.push('\u{c}'),
                    'n' => out.push('\n'),
                    'r' => out.push('\r'),
                    't' => out.push('\t'),
                    'u' => {
                        let point = read_escape(chars, at);
                        // A scalar outside the basic plane is written as a
                        // surrogate pair, and the corpus carries one.
                        let point = if (0xd800..0xdc00).contains(&point) {
                            assert_eq!(chars[*at], '\\', "a high surrogate with no low one");
                            assert_eq!(chars[*at + 1], 'u', "a high surrogate with no low one");
                            *at += 2;
                            let low = read_escape(chars, at);
                            assert!(
                                (0xdc00..0xe000).contains(&low),
                                "a high surrogate followed by no low one"
                            );
                            0x10000 + ((point - 0xd800) << 10) + (low - 0xdc00)
                        } else {
                            point
                        };
                        out.push(char::from_u32(point).expect("a scalar value"));
                    }
                    other => panic!("unknown escape {other:?}"),
                }
            }
            other => out.push(other),
        }
    }
}
