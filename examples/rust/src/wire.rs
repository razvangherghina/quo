// SPDX-License-Identifier: Apache-2.0
//! The reference carrier: Quo over TCP.
//!
//! A harbor that listens holds a TCP address and stands wards behind it. A kit
//! that dials opens a connection and asks on it. The stream is a sequence of
//! frames, each a length and then a body, and nothing is wrapped around it:
//! the box is already sealed and signed.

use crate::seal::WardPk;
use crate::seal::MAX_BYTES;
use std::io::{self, Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream, ToSocketAddrs};

/// The largest body: one kind byte, four id bytes, sixty-four pk bytes and a
/// box of the one size.
pub const MAX_BODY: usize = 1 + 4 + 64 + MAX_BYTES;
/// The smallest body: a kind byte and four id bytes.
pub const MIN_BODY: usize = 5;

const KIND_ASK: u8 = 0x00;
const KIND_REPLY: u8 = 0x01;
const KIND_NOTHING: u8 = 0x02;

/// One frame on the stream.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Frame {
    /// Kind 00, the id, the 64-byte ward pk, the sealed bytes. Dialer to
    /// listener.
    Ask { id: u32, pk: [u8; 64], bytes: Vec<u8> },
    /// Kind 01, the id, the sealed bytes. Listener to dialer.
    Reply { id: u32, bytes: Vec<u8> },
    /// Kind 02 and the id: nothing delivered. Listener to dialer.
    Nothing { id: u32 },
}

impl Frame {
    /// `kind (1) || id (4, big-endian) || rest`.
    pub fn body(&self) -> Vec<u8> {
        let mut out = Vec::new();
        let mut head = |kind: u8, id: u32| {
            out.push(kind);
            out.extend_from_slice(&id.to_be_bytes());
        };
        match self {
            Frame::Ask { id, pk, bytes } => {
                head(KIND_ASK, *id);
                out.extend_from_slice(pk);
                out.extend_from_slice(bytes);
            }
            Frame::Reply { id, bytes } => {
                head(KIND_REPLY, *id);
                out.extend_from_slice(bytes);
            }
            Frame::Nothing { id } => head(KIND_NOTHING, *id),
        }
        out
    }

    /// `length (4, big-endian) || body`, the bytes that go onto the stream.
    pub fn encode(&self) -> Vec<u8> {
        let body = self.body();
        let mut out = (body.len() as u32).to_be_bytes().to_vec();
        out.extend(body);
        out
    }

    /// Reads a body. `None` is a body that is not one, and the side that reads
    /// one closes the connection: a length above [`MAX_BODY`], a length below
    /// five, a kind that is none of the three, an ask with fewer than
    /// sixty-four bytes after its id, and a nothing with bytes after its id.
    pub fn read_body(body: &[u8]) -> Option<Frame> {
        if body.len() < MIN_BODY || body.len() > MAX_BODY {
            return None;
        }
        let kind = body[0];
        let id = u32::from_be_bytes(body[1..5].try_into().ok()?);
        let rest = &body[5..];
        match kind {
            KIND_ASK => {
                let pk: [u8; 64] = rest.get(..64)?.try_into().ok()?;
                Some(Frame::Ask { id, pk, bytes: rest[64..].to_vec() })
            }
            KIND_REPLY => Some(Frame::Reply { id, bytes: rest.to_vec() }),
            KIND_NOTHING if rest.is_empty() => Some(Frame::Nothing { id }),
            _ => None,
        }
    }

    /// Reads a whole frame, its length prefix included. `None` is bytes that
    /// are no frame, a length that does not count the bytes beside it among
    /// them.
    pub fn decode(frame: &[u8]) -> Option<Frame> {
        let length = u32::from_be_bytes(frame.get(..4)?.try_into().ok()?) as usize;
        let body = frame.get(4..)?;
        if body.len() != length {
            return None;
        }
        Frame::read_body(body)
    }
}

/// Writes one frame onto a stream.
pub fn write_frame(stream: &mut impl Write, frame: &Frame) -> io::Result<()> {
    stream.write_all(&frame.encode())?;
    stream.flush()
}

/// Reads one frame off a stream. An `UnexpectedEof` is a connection that
/// closed, and an `InvalidData` is bytes that are no frame: the side that
/// reads one closes the connection.
pub fn read_frame(stream: &mut impl Read) -> io::Result<Frame> {
    let mut head = [0u8; 4];
    stream.read_exact(&mut head)?;
    let length = u32::from_be_bytes(head) as usize;
    if !(MIN_BODY..=MAX_BODY).contains(&length) {
        return Err(no_frame());
    }
    let mut body = vec![0u8; length];
    stream.read_exact(&mut body)?;
    Frame::read_body(&body).ok_or_else(no_frame)
}

fn no_frame() -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, "not a frame")
}

/// The doors a listener stands. `None` is nothing delivered: no ward under
/// that pk, or a ward that is not running.
pub trait Doors {
    fn door(&self, ward: &WardPk, ask: &[u8]) -> Option<Vec<u8>>;
}

/// A harbor that listens: a host and a port, with wards behind it.
pub struct Listener {
    listener: TcpListener,
}

impl Listener {
    /// Binds the address and stands.
    pub fn stand(address: impl ToSocketAddrs) -> io::Result<Listener> {
        Ok(Listener { listener: TcpListener::bind(address)? })
    }

    /// The address it stands on, the port among them when the port was zero.
    pub fn address(&self) -> io::Result<SocketAddr> {
        self.listener.local_addr()
    }

    /// Serves one connection to its end. A connection carries many asks, and
    /// bytes that are no frame close it.
    pub fn serve_one(&self, doors: &impl Doors) -> io::Result<()> {
        let (stream, _) = self.listener.accept()?;
        carry(stream, doors)
    }
}

/// One connection: every ask on it answered, a reply where the door took the
/// bytes and a nothing where it never did.
fn carry(stream: TcpStream, doors: &impl Doors) -> io::Result<()> {
    let mut reading = stream.try_clone()?;
    let mut writing = stream;
    loop {
        let frame = match read_frame(&mut reading) {
            Ok(frame) => frame,
            // A connection that closed, or bytes that are no frame: either
            // way this side reads no more of it.
            Err(_) => return Ok(()),
        };
        // The listener answers asks. A reply or a nothing is a frame, so the
        // connection stands, and there is nothing to answer.
        let Frame::Ask { id, pk, bytes } = frame else {
            continue;
        };
        let back = match doors.door(&WardPk::from_bytes(&pk), &bytes) {
            Some(reply) => Frame::Reply { id, bytes: reply },
            None => Frame::Nothing { id },
        };
        write_frame(&mut writing, &back)?;
    }
}

/// A kit that dials: one connection, many asks in flight, ids of its own.
pub struct Dialer {
    reading: TcpStream,
    writing: TcpStream,
    next: u32,
    /// The ids of the asks in flight, sent and not yet received.
    awaited: Vec<u32>,
    /// What came back for an ask in flight whose answer was not asked for
    /// yet. A reply to an id nobody awaits is read and dropped, so what is
    /// held is bounded by what was sent.
    held: Vec<(u32, Option<Vec<u8>>)>,
}

impl Dialer {
    /// Opens a connection to a listener's address.
    pub fn dial(address: impl ToSocketAddrs) -> io::Result<Dialer> {
        let stream = TcpStream::connect(address)?;
        Ok(Dialer { reading: stream.try_clone()?, writing: stream, next: 1, awaited: Vec::new(), held: Vec::new() })
    }

    /// Sends one ask and answers the id it minted for it. The id is unique
    /// among the asks in flight on this connection.
    pub fn send(&mut self, ward: &WardPk, bytes: &[u8]) -> io::Result<u32> {
        let id = self.next;
        self.next = self.next.wrapping_add(1);
        write_frame(&mut self.writing, &Frame::Ask { id, pk: ward.to_bytes(), bytes: bytes.to_vec() })?;
        self.awaited.push(id);
        Ok(id)
    }

    /// Waits for what answers `id`, holding onto what answers another ask in
    /// flight: replies arrive in any order. `None` is nothing delivered. An
    /// id that is not in flight is an error, since nothing can answer it.
    pub fn receive(&mut self, id: u32) -> io::Result<Option<Vec<u8>>> {
        let Some(at) = self.awaited.iter().position(|awaited| *awaited == id) else {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "no ask in flight under that id"));
        };
        self.awaited.remove(at);
        if let Some(at) = self.held.iter().position(|(held, _)| *held == id) {
            return Ok(self.held.remove(at).1);
        }
        loop {
            let (answered, back) = match read_frame(&mut self.reading)? {
                Frame::Reply { id, bytes } => (id, Some(bytes)),
                Frame::Nothing { id } => (id, None),
                // The dialer asks. An ask is a frame, so the connection
                // stands, and it answers none of the ids in flight.
                Frame::Ask { .. } => continue,
            };
            if answered == id {
                return Ok(back);
            }
            if self.awaited.contains(&answered) {
                self.held.push((answered, back));
            }
        }
    }

    /// One ask, sent and waited for. `None` is nothing delivered.
    pub fn ask(&mut self, ward: &WardPk, bytes: &[u8]) -> io::Result<Option<Vec<u8>>> {
        let id = self.send(ward, bytes)?;
        self.receive(id)
    }
}
