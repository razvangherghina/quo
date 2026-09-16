//! A JSON reader over the text. It reads one object's own keys, refuses a
//! repeated one, and reads every value inside by the grammar of RFC 8259
//! alone, at any depth, lone surrogates included.

#[derive(Debug, Clone)]
pub enum Kind {
    Null,
    Bool,
    Num,
    /// A string as UTF-16 code units, escapes read.
    Str(Vec<u16>),
    Arr,
    Obj,
}

#[derive(Debug, Clone)]
pub struct Node {
    pub kind: Kind,
    pub start: usize,
    pub end: usize,
    /// Containers on the deepest path, this node included when it is one.
    pub depth: usize,
}

impl Node {
    pub fn as_str(&self) -> Option<String> {
        match &self.kind {
            Kind::Str(u) => String::from_utf16(u).ok(),
            _ => None,
        }
    }
    pub fn is_str(&self) -> bool {
        matches!(self.kind, Kind::Str(_))
    }
    pub fn is_null(&self) -> bool {
        matches!(self.kind, Kind::Null)
    }
    pub fn is_obj(&self) -> bool {
        matches!(self.kind, Kind::Obj)
    }
    pub fn text<'a>(&self, src: &'a [u8]) -> &'a [u8] {
        &src[self.start..self.end]
    }
}

/// One object's own fields, keys read, values kept as spans.
pub struct Object {
    pub fields: Vec<(Vec<u16>, Node)>,
}

impl Object {
    pub fn get(&self, key: &str) -> Option<&Node> {
        let k: Vec<u16> = key.encode_utf16().collect();
        self.fields.iter().find(|(f, _)| *f == k).map(|(_, v)| v)
    }
    pub fn has_only(&self, keys: &[&str]) -> bool {
        self.fields.len() == keys.len() && keys.iter().all(|k| self.get(k).is_some())
    }
}

/// One JSON text that is one object with no repeated key among its own keys.
pub fn object(bytes: &[u8]) -> Option<Object> {
    let mut p = P::new(bytes)?;
    p.ws();
    if p.peek()? != b'{' {
        return None;
    }
    p.i += 1;
    let mut fields: Vec<(Vec<u16>, Node)> = Vec::new();
    let mut keys = std::collections::HashSet::new();
    p.ws();
    if p.peek()? == b'}' {
        p.i += 1;
    } else {
        loop {
            p.ws();
            if p.peek()? != b'"' {
                return None;
            }
            let k = p.string()?;
            if !keys.insert(k.clone()) {
                return None;
            }
            p.ws();
            if p.peek()? != b':' {
                return None;
            }
            p.i += 1;
            p.ws();
            let v = p.value()?;
            fields.push((k, v));
            p.ws();
            match p.peek()? {
                b',' => p.i += 1,
                b'}' => {
                    p.i += 1;
                    break;
                }
                _ => return None,
            }
        }
    }
    p.end()?;
    Some(Object { fields })
}

/// Whether no object anywhere in a JSON text repeats a key. It recurses, so
/// it is called only on a text whose depth is already known to be small.
pub fn keys_unique_throughout(bytes: &[u8]) -> bool {
    fn walk(b: &[u8]) -> Option<bool> {
        match b.first()? {
            b'{' => {
                let o = object(b)?;
                Some(o.fields.iter().all(|(_, v)| walk(v.text(b)) == Some(true)))
            }
            b'[' => {
                let mut p = P::new(b)?;
                p.i = 1;
                loop {
                    p.ws();
                    if p.peek()? == b']' {
                        return Some(true);
                    }
                    let v = p.value()?;
                    if walk(v.text(b)) != Some(true) {
                        return Some(false);
                    }
                    p.ws();
                    if p.peek()? == b',' {
                        p.i += 1;
                    }
                }
            }
            _ => Some(true),
        }
    }
    walk(bytes) == Some(true)
}

/// One JSON text of any kind.
pub fn value(bytes: &[u8]) -> Option<Node> {
    let mut p = P::new(bytes)?;
    p.ws();
    let n = p.value()?;
    p.end()?;
    Some(n)
}

struct P<'a> {
    b: &'a [u8],
    i: usize,
}

impl<'a> P<'a> {
    fn new(b: &'a [u8]) -> Option<P<'a>> {
        std::str::from_utf8(b).ok()?;
        Some(P { b, i: 0 })
    }
    fn end(&mut self) -> Option<()> {
        self.ws();
        (self.i == self.b.len()).then_some(())
    }
    fn ws(&mut self) {
        while matches!(self.peek(), Some(b' ' | b'\t' | b'\n' | b'\r')) {
            self.i += 1;
        }
    }
    fn peek(&self) -> Option<u8> {
        self.b.get(self.i).copied()
    }
    fn lit(&mut self, s: &[u8]) -> Option<()> {
        if self.b[self.i..].starts_with(s) {
            self.i += s.len();
            Some(())
        } else {
            None
        }
    }

    /// One value. A container is read by the grammar alone, without
    /// recursion, and kept as its span and depth.
    fn value(&mut self) -> Option<Node> {
        let start = self.i;
        let (kind, depth) = match self.peek()? {
            b'n' => {
                self.lit(b"null")?;
                (Kind::Null, 0)
            }
            b't' => {
                self.lit(b"true")?;
                (Kind::Bool, 0)
            }
            b'f' => {
                self.lit(b"false")?;
                (Kind::Bool, 0)
            }
            b'"' => (Kind::Str(self.string()?), 0),
            b'-' | b'0'..=b'9' => {
                self.number()?;
                (Kind::Num, 0)
            }
            b'[' => (Kind::Arr, self.container()?),
            b'{' => (Kind::Obj, self.container()?),
            _ => return None,
        };
        Some(Node { kind, start, end: self.i, depth })
    }

    fn scalar(&mut self) -> Option<()> {
        match self.peek()? {
            b'[' | b'{' => None,
            _ => self.value().map(|_| ()),
        }
    }

    /// A container and everything in it, with a stack of the closers awaited.
    /// Returns its depth.
    fn container(&mut self) -> Option<usize> {
        let mut stack: Vec<u8> = Vec::new();
        let mut deepest = 0;
        let mut opener = self.peek()?;
        loop {
            // Here `opener` is `[` or `{` at self.i: open it.
            self.i += 1;
            stack.push(if opener == b'[' { b']' } else { b'}' });
            deepest = deepest.max(stack.len());
            self.ws();
            let mut empty = self.peek()? == *stack.last()?;
            loop {
                let close = *stack.last()?;
                if empty {
                    self.i += 1;
                    stack.pop();
                } else {
                    // One member: a key and a colon in an object, then a value.
                    self.ws();
                    if close == b'}' {
                        if self.peek()? != b'"' {
                            return None;
                        }
                        self.string()?;
                        self.ws();
                        if self.peek()? != b':' {
                            return None;
                        }
                        self.i += 1;
                        self.ws();
                    }
                    let c = self.peek()?;
                    if c == b'[' || c == b'{' {
                        opener = c;
                        break;
                    }
                    self.scalar()?;
                }
                // After a member or a closed container: a comma or a closer.
                loop {
                    let Some(&close) = stack.last() else { return Some(deepest) };
                    self.ws();
                    match self.peek()? {
                        b',' => {
                            self.i += 1;
                            break;
                        }
                        c if c == close => {
                            self.i += 1;
                            stack.pop();
                        }
                        _ => return None,
                    }
                }
                empty = false;
            }
        }
    }

    fn hex4(&mut self) -> Option<u16> {
        let s = self.b.get(self.i..self.i + 4)?;
        if !s.iter().all(u8::is_ascii_hexdigit) {
            return None;
        }
        self.i += 4;
        u16::from_str_radix(std::str::from_utf8(s).ok()?, 16).ok()
    }

    fn string(&mut self) -> Option<Vec<u16>> {
        self.i += 1; // opening quote
        let mut out = Vec::new();
        loop {
            let c = self.peek()?;
            match c {
                b'"' => {
                    self.i += 1;
                    return Some(out);
                }
                b'\\' => {
                    self.i += 1;
                    let e = self.peek()?;
                    self.i += 1;
                    out.push(match e {
                        b'"' => 0x22,
                        b'\\' => 0x5c,
                        b'/' => 0x2f,
                        b'b' => 0x08,
                        b'f' => 0x0c,
                        b'n' => 0x0a,
                        b'r' => 0x0d,
                        b't' => 0x09,
                        b'u' => self.hex4()?,
                        _ => return None,
                    });
                }
                0x00..=0x1f => return None,
                _ => {
                    // The input is UTF-8 already; copy one scalar value.
                    let len = match c {
                        0x00..=0x7f => 1,
                        0xc0..=0xdf => 2,
                        0xe0..=0xef => 3,
                        _ => 4,
                    };
                    let ch = std::str::from_utf8(self.b.get(self.i..self.i + len)?).ok()?.chars().next()?;
                    let mut buf = [0u16; 2];
                    out.extend_from_slice(ch.encode_utf16(&mut buf));
                    self.i += len;
                }
            }
        }
    }

    fn digits(&mut self) -> Option<()> {
        if !matches!(self.peek(), Some(b'0'..=b'9')) {
            return None;
        }
        while matches!(self.peek(), Some(b'0'..=b'9')) {
            self.i += 1;
        }
        Some(())
    }

    fn number(&mut self) -> Option<()> {
        if self.peek() == Some(b'-') {
            self.i += 1;
        }
        match self.peek()? {
            b'0' => self.i += 1,
            b'1'..=b'9' => self.digits()?,
            _ => return None,
        }
        if self.peek() == Some(b'.') {
            self.i += 1;
            self.digits()?;
        }
        if matches!(self.peek(), Some(b'e' | b'E')) {
            self.i += 1;
            if matches!(self.peek(), Some(b'+' | b'-')) {
                self.i += 1;
            }
            self.digits()?;
        }
        Some(())
    }
}

/// A count number: an integer text with no fraction and no exponent, from 1 to 2^53 - 1.
pub fn count_number(t: &[u8]) -> Option<u64> {
    if t.is_empty() || t.len() > 16 || t[0] == b'0' || !t.iter().all(u8::is_ascii_digit) {
        return None;
    }
    std::str::from_utf8(t).ok()?.parse::<u64>().ok().filter(|n| *n < (1u64 << 53))
}

/// JSON text with whitespace outside strings removed; spelling kept.
pub fn minify(src: &[u8]) -> String {
    let mut out = Vec::with_capacity(src.len());
    let mut in_str = false;
    let mut esc = false;
    for &c in src {
        if in_str {
            out.push(c);
            if esc {
                esc = false;
            } else if c == b'\\' {
                esc = true;
            } else if c == b'"' {
                in_str = false;
            }
        } else if !matches!(c, b' ' | b'\t' | b'\n' | b'\r') {
            if c == b'"' {
                in_str = true;
            }
            out.push(c);
        }
    }
    String::from_utf8(out).unwrap_or_default()
}

/// A JSON string literal for `s`.
pub fn quote(s: &str) -> String {
    let mut o = String::with_capacity(s.len() + 2);
    o.push('"');
    for c in s.chars() {
        match c {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            '\n' => o.push_str("\\n"),
            '\r' => o.push_str("\\r"),
            '\t' => o.push_str("\\t"),
            c if (c as u32) < 0x20 => o.push_str(&format!("\\u{:04x}", c as u32)),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

#[cfg(test)]
mod tests {
    use super::*;

    fn val(t: &str) -> bool {
        value(t.as_bytes()).is_some()
    }

    #[test]
    fn numbers_are_the_grammar() {
        for ok in ["1", "1.0", "1e0", "0", "-0", "-0.0", "1e400", "1e-400", "9007199254740993", "1E+23", "-0.5e-3"] {
            assert!(val(ok), "{ok}");
        }
        for bad in ["01", "1.", ".5", "+1", "1e", "-", "true1"] {
            assert!(!val(bad), "{bad}");
        }
    }

    #[test]
    fn strings_and_keys() {
        assert!(object(br#"{"a":1,"b":2}"#).is_some());
        assert!(object(br#"{"a":1,"a":2}"#).is_none());
        assert!(object(br#"{"a":1,"a":2}"#).is_none());
        assert!(object(br#"{"a":{"k":1,"k":2}}"#).is_some());
        assert!(!keys_unique_throughout(br#"{"a":[1,{"k":1,"k":2}]}"#));
        assert!(keys_unique_throughout(br#"{"a":[1,{"k":1}],"b":{"k":[]}}"#));
        assert!(keys_unique_throughout(b"[]"));
        assert!(object(br#"{"\ud800":1,"\udc00":2}"#).is_some());
        assert!(object(br#"{"\ud800":1,"\ud800":2}"#).is_none());
        assert!(val(r#""\ud800""#));
        assert!(val(r#""😀""#));
        assert!(value(b"\"\xff\"").is_none());
        assert!(value(b"\"\xed\xa0\x80\"").is_none());
        assert!(value(b"\"a\x01\"").is_none());
        assert!(val(" \n{ } \t"));
        assert!(object(b"[1]").is_none());
        for bad in ["[1,]", r#"{"a":1,}"#, r#"{"a" 1}"#, "[1 2]", "[", "[[]", "[]]", r#"{"a":[}"#, "{1:2}"] {
            assert!(!val(bad), "{bad}");
        }
        for ok in [r#"[[],{},[1,{"a":[2]}]]"#, r#"{"a":{"b":{}},"c":[]}"#] {
            assert!(val(ok), "{ok}");
        }
    }

    #[test]
    fn depth() {
        let d = |n: usize| "[".repeat(n) + &"]".repeat(n);
        assert_eq!(value(d(64).as_bytes()).unwrap().depth, 64);
        assert_eq!(value(d(500_000).as_bytes()).unwrap().depth, 500_000);
        assert_eq!(value(b"1").unwrap().depth, 0);
        assert_eq!(value(br#"{"a":[{},[1]],"b":{}}"#).unwrap().depth, 3);
    }

    #[test]
    fn counts() {
        assert_eq!(count_number(b"1"), Some(1));
        assert_eq!(count_number(b"1.0"), None);
        assert_eq!(count_number(b"1e0"), None);
        assert_eq!(count_number(b"9007199254740991"), Some(9007199254740991));
        assert_eq!(count_number(b"9007199254740992"), None);
        assert_eq!(count_number(b"0"), None);
        assert_eq!(count_number(b"-1"), None);
        assert_eq!(count_number(b"-0"), None);
        assert_eq!(count_number(b"01"), None);
    }

    #[test]
    fn minifies() {
        assert_eq!(minify(b" { \"a b\" : [ 1 , 2 ] } "), "{\"a b\":[1,2]}");
        assert_eq!(minify(br#"{"a\" ":1}"#), r#"{"a\" ":1}"#);
    }
}
