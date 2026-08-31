//! The common carriage: HTTPS, and the one POST every warden answers.
//!
//! Constitution, Article III — *the hint a warden published is the URL, posted
//! to exactly as given: one POST, bytes in and bytes out.* No path is
//! appended, no query is added, no header carries meaning, no status code
//! carries meaning, and no verb is checked. The response body is the sealed
//! answer, and an empty body is silence's wire form. Those two are the whole
//! of what the carriage says back.
//!
//! **This crate is a road, and a road is not the core.** It is one of the two
//! crates in the kit that reach a host; `quo-notation`, `quo-arithmetic`,
//! `quo-wire`, `quo-envelope` and `quo-warden` reach none, and a test in this
//! crate asserts that separation rather than trusting it.
//!
//! **What this crate carries is bytes.** It never opens a seal, never judges
//! one, and depends on no crate in the kit: an envelope is an opaque body on
//! the way out and an opaque body on the way back.
//!
//! ## TLS
//!
//! The law names HTTPS. TLS is not in `std`, and no TLS crate stands in the
//! approved set of five, so this kit speaks the HTTP the carriage is made of
//! and refuses to dial an `https://` hint rather than pretending to. That
//! refusal is deliberate and it is named: [`post`] on an `https://` hint
//! refuses, and says why.

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};

/// Why the carriage could not carry. On the wire every failure is the same
/// silence; the reason here is for a reader alone.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refused(pub String);

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "refused: {}", self.0)
    }
}

impl std::error::Error for Refused {}

type Judged<T> = Result<T, Refused>;

fn refuse<T>(why: &str) -> Judged<T> {
    Err(Refused(why.to_string()))
}

/// How much of a body a door will take in before it stops reading. Article II
/// leaves how an end guards itself to the warden; this is a default, not law.
pub const DEFAULT_BODY_CAP: usize = 1 << 20;

/// A hint read far enough to dial it, and no further. Quo never reads a hint;
/// the carriage does, because the carriage is what understands the string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Address {
    pub scheme: String,
    pub host: String,
    pub port: u16,
    /// The request target, exactly the path and query the hint carried. A hint
    /// with no path at all posts to `/`, which is HTTP's own spelling of no
    /// path rather than a path this kit appended.
    pub target: String,
}

/// Read a hint far enough to dial it.
pub fn read_hint(hint: &str) -> Judged<Address> {
    let (scheme, rest) = match hint.split_once("://") {
        Some((scheme, rest)) => (scheme.to_ascii_lowercase(), rest),
        None => return refuse("a hint with no scheme"),
    };
    let default_port = match scheme.as_str() {
        "http" => 80u16,
        "https" => 443u16,
        _ => return refuse("a scheme the common carriage does not speak"),
    };
    let (authority, target) = match rest.find('/') {
        Some(at) => (&rest[..at], rest[at..].to_string()),
        None => (rest, "/".to_string()),
    };
    if authority.is_empty() {
        return refuse("a hint with no host");
    }
    if authority.contains('@') {
        return refuse("a hint carrying userinfo");
    }
    let (host, port) = if let Some(shut) = authority.strip_prefix('[') {
        match shut.split_once(']') {
            Some((inside, after)) => (inside.to_string(), read_port(after, default_port)?),
            None => return refuse("an IPv6 literal with no closing bracket"),
        }
    } else {
        match authority.split_once(':') {
            Some((host, port)) => (
                host.to_string(),
                read_port(&format!(":{port}"), default_port)?,
            ),
            None => (authority.to_string(), default_port),
        }
    };
    if host.is_empty() {
        return refuse("a hint with no host");
    }
    Ok(Address {
        scheme,
        host,
        port,
        target,
    })
}

fn read_port(after: &str, default_port: u16) -> Judged<u16> {
    if after.is_empty() {
        return Ok(default_port);
    }
    let Some(digits) = after.strip_prefix(':') else {
        return refuse("an authority with something other than a port after the host");
    };
    if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
        return refuse("a port that is not decimal");
    }
    match digits.parse::<u16>() {
        Ok(port) => Ok(port),
        Err(_) => refuse("a port outside the range a port has"),
    }
}

/// The bytes of the one POST, exactly as they go on the wire.
pub fn request_bytes(address: &Address, body: &[u8]) -> Vec<u8> {
    let host = if address.host.contains(':') {
        format!("[{}]", address.host)
    } else {
        address.host.clone()
    };
    let head = format!(
        "POST {} HTTP/1.1\r\nHost: {}:{}\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
        address.target,
        host,
        address.port,
        body.len()
    );
    let mut out = head.into_bytes();
    out.extend_from_slice(body);
    out
}

/// Post a sealed body to a hint and hand back what came back.
///
/// An empty answer is silence's wire form, and it arrives here as an empty
/// vector rather than as an error: the carriage says nothing about why.
pub fn post(hint: &str, body: &[u8]) -> Judged<Vec<u8>> {
    let address = read_hint(hint)?;
    if address.scheme == "https" {
        return refuse(
            "https needs TLS, and no TLS crate stands in this kit's approved set — dial the hint over http or give the road a TLS terminator in front of it",
        );
    }
    let mut stream = match TcpStream::connect((address.host.as_str(), address.port)) {
        Ok(stream) => stream,
        Err(why) => return refuse(&format!("the hint would not connect: {why}")),
    };
    let request = request_bytes(&address, body);
    if let Err(why) = stream.write_all(&request) {
        return refuse(&format!("the request would not go out: {why}"));
    }
    if let Err(why) = stream.flush() {
        return refuse(&format!("the request would not go out: {why}"));
    }
    let mut raw = Vec::new();
    if let Err(why) = stream.read_to_end(&mut raw) {
        return refuse(&format!("the answer would not come back: {why}"));
    }
    answer_body(&raw)
}

/// Take the body out of a response. **No status code carries meaning**, so
/// none is read: a body under a 500 is the same body as one under a 200.
pub fn answer_body(raw: &[u8]) -> Judged<Vec<u8>> {
    let Some((head, body)) = split_head(raw) else {
        return refuse("a response with no end to its head");
    };
    let mut lines = head.split("\r\n");
    let Some(status) = lines.next() else {
        return refuse("a response with no status line");
    };
    if !status.starts_with("HTTP/") {
        return refuse("a response that is not HTTP");
    }
    match content_length(lines)? {
        Some(length) => {
            if body.len() < length {
                return refuse("a body the connection ended before delivering");
            }
            Ok(body[..length].to_vec())
        }
        None => Ok(body.to_vec()),
    }
}

fn split_head(raw: &[u8]) -> Option<(String, &[u8])> {
    let at = raw.windows(4).position(|four| four == b"\r\n\r\n")?;
    let head = String::from_utf8_lossy(&raw[..at]).into_owned();
    Some((head, &raw[at + 4..]))
}

/// The one header the carriage reads, and it reads it for framing rather than
/// for meaning: HTTP has no other way to say where a body ends.
fn content_length<'a>(lines: impl Iterator<Item = &'a str>) -> Judged<Option<usize>> {
    let mut found = None;
    for line in lines {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if name.trim().eq_ignore_ascii_case("content-length") {
            match value.trim().parse::<usize>() {
                Ok(length) => found = Some(length),
                Err(_) => return refuse("a content length that is not a count"),
            }
        }
    }
    Ok(found)
}

/// A door on the common carriage: a socket that takes one POST at a time and
/// answers with a body or with silence.
///
/// The door never checks the verb and never reads a header for meaning. A
/// request that is not a POST of a sealed body carries no unsealable bytes,
/// so it meets the same silence as any malformed message — not by being
/// refused, but by there being nothing in it to answer.
pub struct Door {
    listener: TcpListener,
    body_cap: usize,
}

impl Door {
    /// Bind a door. Pass `"127.0.0.1:0"` for an ephemeral loopback port.
    pub fn bind(addr: impl ToSocketAddrs) -> std::io::Result<Door> {
        Ok(Door {
            listener: TcpListener::bind(addr)?,
            body_cap: DEFAULT_BODY_CAP,
        })
    }

    /// How much of a body this door will take in. Delivery's, under Article II.
    pub fn with_body_cap(mut self, body_cap: usize) -> Door {
        self.body_cap = body_cap;
        self
    }

    /// The hint this door publishes.
    pub fn hint(&self) -> std::io::Result<String> {
        let at = self.listener.local_addr()?;
        Ok(format!("http://{at}/"))
    }

    /// Take one POST and answer it. `answer` hands back the sealed answer, or
    /// `None` for silence — which goes on the wire as an empty body.
    pub fn serve_one<F>(&self, answer: F) -> std::io::Result<()>
    where
        F: FnOnce(&[u8]) -> Option<Vec<u8>>,
    {
        let (stream, _) = self.listener.accept()?;
        self.carry(stream, answer)
    }

    fn carry<F>(&self, mut stream: TcpStream, answer: F) -> std::io::Result<()>
    where
        F: FnOnce(&[u8]) -> Option<Vec<u8>>,
    {
        let body = self.take_body(&mut stream).unwrap_or_default();
        let said = answer(&body).unwrap_or_default();
        let head = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/octet-stream\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            said.len()
        );
        let mut out = head.into_bytes();
        out.extend_from_slice(&said);
        stream.write_all(&out)?;
        stream.flush()
    }

    fn take_body(&self, stream: &mut TcpStream) -> Option<Vec<u8>> {
        let mut raw = Vec::new();
        let mut byte = [0u8; 1];
        while raw.len() < 4 || &raw[raw.len() - 4..] != b"\r\n\r\n" {
            match stream.read(&mut byte) {
                Ok(0) | Err(_) => return None,
                Ok(_) => raw.push(byte[0]),
            }
            if raw.len() > 8 * 1024 {
                return None;
            }
        }
        let head = String::from_utf8_lossy(&raw[..raw.len() - 4]).into_owned();
        let length = content_length(head.split("\r\n").skip(1)).ok()??;
        if length > self.body_cap {
            return None;
        }
        let mut body = vec![0u8; length];
        stream.read_exact(&mut body).ok()?;
        Some(body)
    }

    /// The listener beneath, for a door that wants to guard its socket itself.
    pub fn listener(&self) -> &TcpListener {
        &self.listener
    }
}
