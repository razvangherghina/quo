// SPDX-License-Identifier: Apache-2.0
//! The harness's own TCP serving, chapter 6 of `SPEC.md` and section 1
//! and 4 of `HARNESS.md`: a listener this program owns, framed exactly as
//! the kit's own `wire` module frames, but served by hand rather than
//! through `wire::Listener::serve_one`. That call answers a reply or a
//! nothing for every ask it carries and offers no third way, and section
//! 4's `drop` needs a third way: a reply the door already wrote, discarded
//! before it ever reaches the wire, so the far side is ended by its own
//! allowance and not by an answer of any kind.
//!
//! `Ward` is `Rc`-based and answers only on a thread holding `main.rs`'s one
//! lock over the wards. So a connection's own thread never calls a door
//! itself: it frames the bytes and hands them, with a channel to answer on,
//! to the job queue `main.rs` drains, the same queue the root channel on
//! stdin feeds, and each job runs on a thread of its own under that lock.

use quo_kit::seal::WardPk;
use quo_kit::wire::{self, Frame};
use std::collections::HashMap;
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Arc, Mutex};

/// One ask that arrived over a listener, waiting on the thread that owns
/// the wards to run the door and say what goes back.
pub struct TcpAsk {
    pub pk: WardPk,
    pub address: String,
    pub bytes: Vec<u8>,
    pub respond: SyncSender<ReplyAction>,
}

pub enum ReplyAction {
    /// The door answered, and section 4's `drop` spent none: the reply
    /// goes back as chapter 6 says.
    Reply(Vec<u8>),
    /// No ward under that pk stands here, or it is stopped: kind `02`.
    Nothing,
    /// The door answered and `drop` spent one on it: no frame goes back at
    /// all, so the caller is ended by its own allowance and never by a
    /// word this program wrote.
    Swallow,
}

/// Binds `address` and serves it for as long as this process runs: one
/// thread accepting, one more per connection. Every ask any of them reads
/// is handed to `on_ask`, which is expected to queue it for a job holding
/// the wards and answer nothing itself.
pub fn spawn_listener(address: &str, on_ask: impl Fn(TcpAsk) + Send + Clone + 'static) -> std::io::Result<String> {
    let listener = TcpListener::bind(address)?;
    let bound = listener.local_addr()?.to_string();
    let for_threads = bound.clone();
    std::thread::spawn(move || {
        for stream in listener.incoming().flatten() {
            let on_ask = on_ask.clone();
            let address = for_threads.clone();
            std::thread::spawn(move || serve_connection(stream, address, on_ask));
        }
    });
    Ok(bound)
}

/// One connection, carrying many asks in flight at once: this thread reads
/// frames and hands each on, and every ask waits for its answer on a thread
/// of its own, which writes it (or writes nothing, on a swallow) whenever it
/// comes, in any order. Bytes that are no frame, chapter 6's own rule, end
/// the reading here exactly as `wire::read_frame` already judges it.
fn serve_connection(stream: TcpStream, address: String, on_ask: impl Fn(TcpAsk)) {
    let mut reading = match stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let writing = Arc::new(Mutex::new(stream));
    loop {
        let frame = match wire::read_frame(&mut reading) {
            Ok(frame) => frame,
            Err(_) => return,
        };
        // A dialer never asks a listener anything but `00`; a frame of a
        // kind this side does not read stands, and nothing is said to it.
        let Frame::Ask { id, pk, bytes } = frame else { continue };
        let (tx, rx) = sync_channel(1);
        on_ask(TcpAsk { pk: WardPk::from_bytes(&pk), address: address.clone(), bytes, respond: tx });
        let writing = writing.clone();
        std::thread::spawn(move || {
            let Ok(action) = rx.recv() else { return };
            let outgoing = match action {
                ReplyAction::Reply(bytes) => Frame::Reply { id, bytes },
                ReplyAction::Nothing => Frame::Nothing { id },
                ReplyAction::Swallow => return,
            };
            if let Ok(mut stream) = writing.lock() {
                let _ = wire::write_frame(&mut *stream, &outgoing);
            }
        });
    }
}

/// The carrier every ward this harness births holds: chapter 6 over a real
/// socket, for a far ward whose address this program was told. `peers` is
/// this program's own address book, section 4's `route` verb, written in
/// `main.rs`'s `harbor_route` and shared by every ward this program births,
/// so a route any one of them is told reaches every ward the program
/// stands. A pk `route` has not named is not delivered, and this carrier
/// answers `unreached` for it, as section 4 says.
pub struct PeerCarrier {
    /// Section 4's `hold`: the next `n` ask frames this ward sends never
    /// leave, not even later. Shared with the harness's own `WardSlot` so
    /// the `hold` verb reaches the carrier the ward was born holding.
    pub hold: Arc<AtomicU32>,
    pub peers: Arc<Mutex<HashMap<WardPk, String>>>,
}

impl quo_kit::ward::Carrier for PeerCarrier {
    fn carry(&self, ward: &WardPk, bytes: &[u8]) -> Option<Vec<u8>> {
        loop {
            let n = self.hold.load(Ordering::SeqCst);
            if n == 0 {
                break;
            }
            if self.hold.compare_exchange(n, n - 1, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
                return None;
            }
        }
        let address = self.peers.lock().ok()?.get(ward).cloned()?;
        let mut dialer = wire::Dialer::dial(&address).ok()?;
        // A frame that never left is nothing delivered. A frame that left on
        // a connection that then closed is answered nothing at all, chapter
        // 6, so this carrier never returns and the ward's allowance ends the
        // ask as `late`.
        let id = dialer.send(ward, bytes).ok()?;
        match dialer.receive(id) {
            Ok(reply) => reply,
            Err(_) => loop {
                std::thread::park();
            },
        }
    }
}
