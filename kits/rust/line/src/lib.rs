//! The line: framed envelopes over one persistent TCP connection.
//!
//! Constitution, Article III — the one road named beside the common carriage,
//! *standard, never mandatory*. A frame is a length written the way the wire
//! encoding writes an `int`, then that many envelope bytes, and nothing else.
//! The length does not count itself.
//!
//! **This crate is a road, and a road is not the core.** With `quo-carriage`
//! it is one of the two crates in the kit that reach a host; the five beneath
//! it reach none.
//!
//! **The line is dumb, not defenceless.** It negotiates nothing, keeps nothing
//! alive and reconnects for no one. A dropped line is weather. How an end
//! guards its socket — timeouts, idle reaping, bounding connections — is
//! delivery under Article II and is the caller's, which is why this crate
//! hands back the [`std::net::TcpStream`] rather than deciding for anyone.
//!
//! **Only a framing fault ends the connection** — a length at or below zero,
//! or a length above this end's cap — and it ends without a word. A
//! well-formed frame whose envelope fails the judgment is ordinary silence,
//! and the line lives on; that is the caller's business, not this crate's.
//!
//! **There is no second encoder in the kit.** The frame's length is written
//! and read by `quo-wire` as an `int`, so the one spelling of an `int` in
//! Article V is the one spelling of a frame's length.

use std::io::{Read, Write};
use std::net::{Shutdown, TcpListener, TcpStream, ToSocketAddrs};

use quo_notation::{Blueprint, Type};
use quo_wire::Value;

/// Why a frame is not a frame. Every one of these that reaches the wire is
/// silence or a closed connection; the reason is for a reader alone.
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

/// What a bare `tcp://` hint promises: this end accepts envelopes to 16,384
/// bytes.
pub const DEFAULT_CAP: i64 = 16_384;

/// The length in front of a frame, in bytes — an `int` is eight bytes.
pub const LENGTH: usize = quo_wire::INT;

fn int_blueprint() -> Blueprint {
    Blueprint {
        name: "Frame".to_string(),
        fields: Vec::new(),
        records: Vec::new(),
    }
}

fn int_type() -> Type {
    Type::Base("int".to_string())
}

fn write_length(length: i64) -> Judged<Vec<u8>> {
    match quo_wire::encode(&int_blueprint(), &int_type(), &Value::Int(length)) {
        Ok(bytes) => Ok(bytes),
        Err(why) => refuse(&format!("the length would not write: {}", why.0)),
    }
}

fn read_length(bytes: &[u8]) -> Judged<i64> {
    match quo_wire::decode(&int_blueprint(), &int_type(), bytes) {
        Ok(Value::Int(length)) => Ok(length),
        _ => refuse("a length that is not an int"),
    }
}

/// A `tcp://` hint, read far enough to dial it: the host, the port, and the
/// cap that end promises. **The road says its cap before a byte flows** — no
/// handshake, no negotiation on the wire.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Hint {
    pub host: String,
    pub port: u16,
    pub cap: i64,
}

/// Read a `tcp://` hint. The host is a literal address or a name, an IPv6
/// literal in brackets, the port always written, optionally followed by
/// `?cap=` and the door's cap in decimal bytes — **and nothing after that**.
pub fn read_hint(hint: &str) -> Judged<Hint> {
    let Some(rest) = hint.strip_prefix("tcp://") else {
        return refuse("a hint that is not on the line");
    };
    let (authority, cap) = match rest.split_once('?') {
        Some((authority, query)) => {
            let Some(digits) = query.strip_prefix("cap=") else {
                return refuse("a query the line does not name");
            };
            if digits.is_empty() || !digits.bytes().all(|byte| byte.is_ascii_digit()) {
                return refuse("a cap that is not decimal");
            }
            let Ok(cap) = digits.parse::<i64>() else {
                return refuse("a cap beyond what a cap can be");
            };
            if cap <= 0 {
                return refuse("a cap at or below zero, which can carry no frame");
            }
            (authority, cap)
        }
        None => (rest, DEFAULT_CAP),
    };
    if authority.contains('/') {
        return refuse("a hint carrying a path");
    }
    let (host, port) = if let Some(shut) = authority.strip_prefix('[') {
        match shut.split_once("]:") {
            Some((inside, port)) => (inside.to_string(), port.to_string()),
            None => return refuse("an IPv6 literal with no closing bracket and port"),
        }
    } else {
        match authority.rsplit_once(':') {
            Some((host, port)) => (host.to_string(), port.to_string()),
            None => return refuse("a hint with no port, and the port is always written"),
        }
    };
    if host.is_empty() {
        return refuse("a hint with no host");
    }
    if port.is_empty() || !port.bytes().all(|byte| byte.is_ascii_digit()) {
        return refuse("a port that is not decimal");
    }
    let Ok(port) = port.parse::<u16>() else {
        return refuse("a port outside the range a port has");
    };
    // A port of zero names a door nothing can be sent to, exactly as a cap of
    // zero names one nothing can be framed for: it is no road at all.
    if port == 0 {
        return refuse("a port of zero, which names no door");
    }
    Ok(Hint { host, port, cap })
}

/// Write the hint a listening end publishes. A cap equal to the default is
/// left unwritten, because a bare `tcp://` hint already promises it.
pub fn write_hint(host: &str, port: u16, cap: i64) -> String {
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    if cap == DEFAULT_CAP {
        format!("tcp://{host}:{port}")
    } else {
        format!("tcp://{host}:{port}?cap={cap}")
    }
}

/// *A warden whose published `limit` is under the default and whose hint
/// declares no cap does not offer the line.*
pub fn offers_line(limit: i64, hint: &str) -> bool {
    let Ok(read) = read_hint(hint) else {
        return false;
    };
    let declared = hint.contains("?cap=");
    declared || limit >= read.cap
}

/// Write one frame: the length, then the envelope's bytes.
///
/// Refuses an empty envelope — **silence has no wire form on a line**, so a
/// zero-length frame is malformed here though a zero length is legal
/// everywhere else in the encoding — and refuses an envelope above the cap
/// the far road promised, because an over-cap send is refused in the sender's
/// own kit rather than discovered at the far door.
pub fn frame(envelope: &[u8], cap: i64) -> Judged<Vec<u8>> {
    if cap <= 0 {
        return refuse("a cap at or below zero, which can carry no frame");
    }
    if envelope.is_empty() {
        return refuse("a zero-length frame, which silence never takes on a line");
    }
    let Ok(length) = i64::try_from(envelope.len()) else {
        return refuse("an envelope beyond what a length can say");
    };
    if length > cap {
        return refuse("an envelope above the cap the far road promised");
    }
    let mut out = write_length(length)?;
    out.extend_from_slice(envelope);
    Ok(out)
}

/// What came up the line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Arrival {
    /// One envelope, entire.
    Frame(Vec<u8>),
    /// The far end closed between frames. Weather, not a fault.
    Closed,
}

/// Read one frame. A [`Refused`] here is a **framing fault**: the connection
/// ends without a word, because a peer that cannot frame cannot be spoken to.
pub fn read_frame<R: Read>(from: &mut R, cap: i64) -> Judged<Arrival> {
    let mut head = [0u8; LENGTH];
    match fill(from, &mut head) {
        Filled::Empty => return Ok(Arrival::Closed),
        Filled::Short => return refuse("a length the connection ended in the middle of"),
        Filled::Whole => {}
    }
    let length = read_length(&head)?;
    if length <= 0 {
        return refuse("a length at or below zero");
    }
    if length > cap {
        return refuse("a length above this end's cap");
    }
    let Ok(length) = usize::try_from(length) else {
        return refuse("a length beyond what this end can address");
    };
    let mut body = vec![0u8; length];
    match fill(from, &mut body) {
        Filled::Whole => Ok(Arrival::Frame(body)),
        // A body the connection ends before delivering is the fault having
        // already happened.
        Filled::Empty | Filled::Short => refuse("a body the connection ended before delivering"),
    }
}

enum Filled {
    Whole,
    Short,
    Empty,
}

fn fill<R: Read>(from: &mut R, into: &mut [u8]) -> Filled {
    let mut at = 0;
    while at < into.len() {
        match from.read(&mut into[at..]) {
            Ok(0) => {
                return if at == 0 {
                    Filled::Empty
                } else {
                    Filled::Short
                }
            }
            Ok(read) => at += read,
            Err(ref why) if why.kind() == std::io::ErrorKind::Interrupted => {}
            Err(_) => {
                return if at == 0 {
                    Filled::Empty
                } else {
                    Filled::Short
                }
            }
        }
    }
    Filled::Whole
}

/// One persistent connection. **Frames flow both directions and either end
/// may originate an ask**, which is what lets a ground that cannot be called
/// dial out and be asked down the line it holds.
///
/// **Each end reads while it writes.** A peer that stops reading to finish
/// writing has made a deadlock, and the deadlock is its own — [`Line::split`]
/// is how an end keeps both going at once.
pub struct Line {
    stream: TcpStream,
    cap: i64,
    far_cap: i64,
}

impl Line {
    /// Dial a `tcp://` hint. The far cap is what the hint promised; **the
    /// dialing end publishes nothing, so it promises the default**.
    pub fn dial(hint: &str) -> Judged<Line> {
        let read = read_hint(hint)?;
        match TcpStream::connect((read.host.as_str(), read.port)) {
            Ok(stream) => Ok(Line {
                stream,
                cap: DEFAULT_CAP,
                far_cap: read.cap,
            }),
            Err(why) => refuse(&format!("the hint would not connect: {why}")),
        }
    }

    /// Take an already-open connection as a line.
    pub fn adopt(stream: TcpStream, cap: i64, far_cap: i64) -> Line {
        Line {
            stream,
            cap,
            far_cap,
        }
    }

    /// What this end accepts.
    pub fn cap(&self) -> i64 {
        self.cap
    }

    /// What the far end promised it accepts.
    pub fn far_cap(&self) -> i64 {
        self.far_cap
    }

    /// A larger appetite than the hint promised, learned by asking `limit`.
    pub fn learned_far_cap(&mut self, cap: i64) {
        self.far_cap = cap;
    }

    /// Send one envelope. An over-cap send is refused here, in the sender's
    /// own kit.
    pub fn send(&mut self, envelope: &[u8]) -> Judged<()> {
        let frame = frame(envelope, self.far_cap)?;
        if let Err(why) = self.stream.write_all(&frame) {
            return refuse(&format!("the frame would not go out: {why}"));
        }
        match self.stream.flush() {
            Ok(()) => Ok(()),
            Err(why) => refuse(&format!("the frame would not go out: {why}")),
        }
    }

    /// Read one envelope. A [`Refused`] is a framing fault and the connection
    /// is already shut when it comes back — it ends without a word.
    pub fn receive(&mut self) -> Judged<Arrival> {
        match read_frame(&mut self.stream, self.cap) {
            Ok(arrival) => Ok(arrival),
            Err(fault) => {
                let _ = self.stream.shutdown(Shutdown::Both);
                Err(fault)
            }
        }
    }

    /// Two halves of the one connection, so an end can read while it writes.
    pub fn split(&self) -> std::io::Result<(Line, Line)> {
        Ok((
            Line::adopt(self.stream.try_clone()?, self.cap, self.far_cap),
            Line::adopt(self.stream.try_clone()?, self.cap, self.far_cap),
        ))
    }

    /// The socket beneath. How an end guards it is delivery, and delivery is
    /// the warden's own.
    pub fn stream(&self) -> &TcpStream {
        &self.stream
    }
}

/// The listening end — **the only end with a road to publish**.
pub struct Listener {
    tcp: TcpListener,
    cap: i64,
}

impl Listener {
    /// Bind a listening end with the cap it promises. Pass `"127.0.0.1:0"`
    /// for an ephemeral loopback port.
    pub fn bind(addr: impl ToSocketAddrs, cap: i64) -> std::io::Result<Listener> {
        Ok(Listener {
            tcp: TcpListener::bind(addr)?,
            cap,
        })
    }

    /// The hint this end publishes.
    pub fn hint(&self) -> std::io::Result<String> {
        let at = self.tcp.local_addr()?;
        Ok(write_hint(&at.ip().to_string(), at.port(), self.cap))
    }

    /// Take one line. **The dialing end publishes nothing, so it promises the
    /// default** — that is what this end may send it.
    pub fn accept(&self) -> std::io::Result<Line> {
        let (stream, _) = self.tcp.accept()?;
        Ok(Line::adopt(stream, self.cap, DEFAULT_CAP))
    }

    pub fn cap(&self) -> i64 {
        self.cap
    }

    pub fn tcp(&self) -> &TcpListener {
        &self.tcp
    }
}

// **Walking a peer's hints is not this crate's.** A warden offers as many
// roads as it has and delivery tries them; a road that chose among them, held
// the line the choice landed on and paired the answer that came back would be
// a road doing the layer above it. This crate frames envelopes over one
// connection and does nothing else with them.
