//! Quo over TCP: the frames, a listener and a dialer.

use std::io::{self, Read, Write};
use std::net::{TcpListener, TcpStream, ToSocketAddrs};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const MAX_BODY: usize = 1_048_645;
pub const KIND_ASK: u8 = 0;
pub const KIND_REPLY: u8 = 1;
pub const KIND_NOTHING: u8 = 2;

#[derive(Debug, PartialEq)]
pub enum Frame {
    Ask { id: u32, ward: [u8; 64], bx: Vec<u8> },
    Reply { id: u32, bx: Vec<u8> },
    Nothing { id: u32 },
}

pub fn encode(f: &Frame) -> Vec<u8> {
    let (kind, id, rest): (u8, u32, Vec<u8>) = match f {
        Frame::Ask { id, ward, bx } => {
            let mut r = ward.to_vec();
            r.extend_from_slice(bx);
            (KIND_ASK, *id, r)
        }
        Frame::Reply { id, bx } => (KIND_REPLY, *id, bx.clone()),
        Frame::Nothing { id } => (KIND_NOTHING, *id, vec![]),
    };
    let len = 5 + rest.len();
    let mut out = Vec::with_capacity(4 + len);
    out.extend_from_slice(&(len as u32).to_be_bytes());
    out.push(kind);
    out.extend_from_slice(&id.to_be_bytes());
    out.extend_from_slice(&rest);
    out
}

/// Read one frame. An error means the stream ended or what came is not a frame;
/// either way nothing more is read and the connection is closed.
pub fn read_frame(r: &mut impl Read) -> io::Result<Frame> {
    let bad = || io::Error::new(io::ErrorKind::InvalidData, "not a frame");
    let mut l = [0u8; 4];
    r.read_exact(&mut l)?;
    let len = u32::from_be_bytes(l) as usize;
    if !(5..=MAX_BODY).contains(&len) {
        return Err(bad());
    }
    let mut head = [0u8; 5];
    r.read_exact(&mut head)?;
    let kind = head[0];
    let id = u32::from_be_bytes([head[1], head[2], head[3], head[4]]);
    let rest_len = len - 5;
    match kind {
        KIND_ASK if rest_len < 64 => return Err(bad()),
        KIND_NOTHING if rest_len != 0 => return Err(bad()),
        KIND_ASK | KIND_REPLY | KIND_NOTHING => {}
        _ => return Err(bad()),
    }
    let mut rest = vec![0u8; rest_len];
    r.read_exact(&mut rest)?;
    Ok(match kind {
        KIND_ASK => {
            let mut w = [0u8; 64];
            w.copy_from_slice(&rest[..64]);
            Frame::Ask { id, ward: w, bx: rest[64..].to_vec() }
        }
        KIND_REPLY => Frame::Reply { id, bx: rest },
        _ => Frame::Nothing { id },
    })
}

/// Read `tcp://host:port`, the scheme in any case, into the `host:port` a socket dials.
/// The host is a name, an IPv4 address, or an IPv6 address in brackets; the port is
/// decimal. Anything else, a path, a query, a fragment or user information among it,
/// is no tcp address.
pub fn tcp_address(s: &str) -> Option<String> {
    let (scheme, rest) = s.split_once("://")?;
    if !scheme.eq_ignore_ascii_case("tcp") {
        return None;
    }
    let (host, port) = if let Some(inner) = rest.strip_prefix('[') {
        let (ip6, after) = inner.split_once(']')?;
        ip6.parse::<std::net::Ipv6Addr>().ok()?;
        (&rest[..ip6.len() + 2], after.strip_prefix(':')?)
    } else {
        let (h, p) = rest.split_once(':')?;
        (h, p)
    };
    if host.is_empty() || port.is_empty() || !port.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    let port: u16 = port.parse().ok()?;
    if !host.starts_with('[') && !reg_name(host) {
        return None;
    }
    Some(format!("{host}:{port}"))
}

/// RFC 3986 reg-name: unreserved, percent-encoded and sub-delims. An IPv4 address is one.
fn reg_name(h: &str) -> bool {
    let b = h.as_bytes();
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() && b[i + 1].is_ascii_hexdigit() && b[i + 2].is_ascii_hexdigit() => i += 3,
            c if c.is_ascii_alphanumeric() || b"-._~!$&'()*+,;=".contains(&c) => i += 1,
            _ => return false,
        }
    }
    true
}

/// What a listener hands an ask to: Some(reply box), or None for 02.
pub type Handler = Arc<dyn Fn(&[u8; 64], &[u8]) -> Option<Vec<u8>> + Send + Sync>;

/// Hold a listener on 127.0.0.1 and answer on it. Returns its `tcp://host:port`.
pub fn listen(handler: Handler) -> io::Result<String> {
    let l = TcpListener::bind("127.0.0.1:0")?;
    let at = format!("tcp://{}", l.local_addr()?);
    std::thread::spawn(move || {
        for s in l.incoming().flatten() {
            let h = handler.clone();
            std::thread::spawn(move || serve(s, h));
        }
    });
    Ok(at)
}

fn serve(s: TcpStream, h: Handler) {
    let _ = s.set_nodelay(true);
    let Ok(w) = s.try_clone() else { return };
    let w = Arc::new(Mutex::new(w));
    let mut r = s;
    loop {
        match read_frame(&mut r) {
            Ok(Frame::Ask { id, ward, bx }) => {
                let (h, w) = (h.clone(), w.clone());
                std::thread::spawn(move || {
                    let f = match h(&ward, &bx) {
                        Some(b) => Frame::Reply { id, bx: b },
                        None => Frame::Nothing { id },
                    };
                    let _ = w.lock().unwrap().write_all(&encode(&f));
                });
            }
            Ok(_) => {} // a reply or a nothing at a listener: read, nothing said
            Err(_) => {
                let _ = r.shutdown(std::net::Shutdown::Both);
                return;
            }
        }
    }
}

static NEXT_ID: AtomicU32 = AtomicU32::new(1);

#[derive(Debug, PartialEq)]
pub enum Dialed {
    Reply(Vec<u8>),
    /// A closed line, or no answer in time: the frame left and may have been heard.
    Nothing,
    /// The frame never left, or 02 came back: not delivered.
    Unsent,
}

/// Dial `at`, a `host:port`, send one ask, and wait up to `wait` for its answer.
pub fn dial(at: &str, ward: &[u8; 64], bx: &[u8], wait: Duration) -> Dialed {
    let deadline = Instant::now() + wait;
    let Some(addr) = at.to_socket_addrs().ok().and_then(|mut a| a.next()) else { return Dialed::Unsent };
    let Ok(mut s) = TcpStream::connect_timeout(&addr, wait) else { return Dialed::Unsent };
    let _ = s.set_nodelay(true);
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    let frame = encode(&Frame::Ask { id, ward: *ward, bx: bx.to_vec() });
    // A write that fails at its first byte left nothing; any other failure may have.
    match s.write(&frame) {
        Ok(0) | Err(_) => return Dialed::Unsent,
        Ok(n) if n < frame.len() => {
            if s.write_all(&frame[n..]).is_err() {
                return Dialed::Nothing;
            }
        }
        Ok(_) => {}
    }
    loop {
        let Some(left) = deadline.checked_duration_since(Instant::now()) else { return Dialed::Nothing };
        if left.is_zero() || s.set_read_timeout(Some(left)).is_err() {
            return Dialed::Nothing;
        }
        match read_frame(&mut s) {
            Ok(Frame::Reply { id: i, bx }) if i == id => return Dialed::Reply(bx),
            Ok(Frame::Nothing { id: i }) if i == id => return Dialed::Unsent,
            Ok(_) => {} // another id, or an ask at a dialer
            Err(_) => return Dialed::Nothing,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn frames_round_trip_and_refuse() {
        let f = Frame::Ask { id: 7, ward: [1u8; 64], bx: vec![2, 3] };
        let b = encode(&f);
        assert_eq!(&b[..4], &(5u32 + 66).to_be_bytes());
        assert_eq!(read_frame(&mut &b[..]).unwrap(), f);
        let n = encode(&Frame::Nothing { id: 9 });
        assert_eq!(n, vec![0, 0, 0, 5, 2, 0, 0, 0, 9]);
        assert_eq!(read_frame(&mut &n[..]).unwrap(), Frame::Nothing { id: 9 });
        for bad in [
            vec![0, 0, 0, 4, 1, 0, 0, 0],
            vec![0, 0, 0, 5, 3, 0, 0, 0, 0],
            vec![0, 0, 0, 6, 2, 0, 0, 0, 0, 0],
            vec![0, 0, 0, 6, 0, 0, 0, 0, 0, 0],
            vec![0, 0x10, 0, 0x46, 1],
        ] {
            assert!(read_frame(&mut &bad[..]).is_err());
        }
    }

    #[test]
    fn tcp_addresses() {
        for (s, want) in [
            ("tcp://127.0.0.1:80", "127.0.0.1:80"),
            ("TCP://example.org:080", "example.org:80"),
            ("tcp://[::1]:9", "[::1]:9"),
            ("tcp://a%2Db:1", "a%2Db:1"),
        ] {
            assert_eq!(tcp_address(s).as_deref(), Some(want), "{s}");
        }
        for s in [
            "127.0.0.1:80",
            "http://h:1",
            "ws://h:1",
            "tcp://h",
            "tcp://h:",
            "tcp://:1",
            "tcp://h:65536",
            "tcp://h:1/",
            "tcp://h:1/p",
            "tcp://h:1?q",
            "tcp://h:1#f",
            "tcp://u@h:1",
            "tcp://::1:1",
            "tcp://[::1]",
            "tcp://[zz]:1",
            "tcp://h%2:1",
            "tcp://h:+1",
            "tcp:h:1",
        ] {
            assert_eq!(tcp_address(s), None, "{s}");
        }
    }

    #[test]
    fn listen_and_dial() {
        let h: Handler = Arc::new(|w, b| if w[0] == 1 { Some(b.iter().rev().copied().collect()) } else { None });
        let at = tcp_address(&listen(h).unwrap()).unwrap();
        assert_eq!(dial(&at,&[1u8; 64], &[1, 2, 3], Duration::from_secs(2)), Dialed::Reply(vec![3, 2, 1]));
        assert_eq!(dial(&at, &[2u8; 64], &[1, 2, 3], Duration::from_secs(2)), Dialed::Unsent);
        assert_eq!(dial("127.0.0.1:1", &[2u8; 64], &[1], Duration::from_secs(2)), Dialed::Unsent);
    }
}
