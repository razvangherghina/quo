//! The host: what stands a warden up and puts roads in front of it.
//!
//! Constitution, Article II leaves this to the ground, and
//! `papers/quo-truth.md` says what it is: the host holds the seeds, the clock,
//! the randomness and the store, stands the roads it is told, and **is
//! delivery beneath the warden**.
//!
//! **It holds no secret.** What it keeps per peer is an address — a padlock,
//! which is a public key — beside the line that peer's asks arrive on. It
//! never opens a seal, and it learns that association from the warden, which
//! is the only thing that read the padlock.
//!
//! **Delivery has three rules and no more.** A row with hints: the first road
//! this ground can speak that carried. A row without hints, or none it can
//! speak: the line that padlock's last ask arrived on, if still held.
//! Neither: weather where a road was tried and broke, no road where none
//! could be tried, kept apart because only one of them means a door heard
//! nothing.
//!
//! This is the only file in the kit that knows every road by name.

use std::collections::BTreeMap;
use std::fs::File;
use std::io::Read;
use std::net::TcpStream;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use quo_carriage as carriage;
use quo_line::{Arrival, Line, Listener};
use quo_warden::ground::{Carried, Clock, Delivery, Random, Way};
use quo_warden::{Opening, Seeds, Store, Via, Warden, KEY};

/// The clock, read from the machine. In milliseconds, which is what a leash's
/// budget is counted in.
pub struct Wall;

impl Clock for Wall {
    fn now(&self) -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|since| since.as_millis() as i64)
            .unwrap_or(0)
    }
}

/// The randomness, drawn from the machine. Every key a warden mints comes
/// through here, and nothing beneath this file reaches for one.
pub struct Urandom;

impl Random for Urandom {
    fn draw(&self) -> [u8; KEY] {
        let mut seed = [0u8; KEY];
        File::open("/dev/urandom")
            .and_then(|mut source| source.read_exact(&mut seed))
            .expect("the machine's randomness");
        seed
    }
}

/// A road a host may stand in front of its warden. A road that listens on a
/// socket carries the address it listens on, because where a ground answers is
/// the operator's to say and not this file's.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Road {
    /// The common carriage: one POST, bytes in and bytes out.
    Http { at: String },
    /// The framed line, which either end may originate an ask down.
    Tcp { at: String },
    /// Distance zero: grounds in this process, reached by handing bytes to
    /// the far warden's one entry point.
    Memory,
}

impl Road {
    /// Loopback on a port the machine picks: what a road listens on when the
    /// caller names no address.
    pub const NEARBY: &'static str = "127.0.0.1:0";

    pub fn http() -> Road {
        Road::Http {
            at: Road::NEARBY.to_string(),
        }
    }

    pub fn tcp() -> Road {
        Road::Tcp {
            at: Road::NEARBY.to_string(),
        }
    }

    pub fn http_at(at: &str) -> Road {
        Road::Http { at: at.to_string() }
    }

    pub fn tcp_at(at: &str) -> Road {
        Road::Tcp { at: at.to_string() }
    }
}

/// Grounds in one process that reach each other by hint, process-wide, so two
/// hosts opened in one test find each other the way two wardens in one device
/// would.
fn neighbours() -> &'static Mutex<BTreeMap<String, Warden>> {
    static NEARBY: OnceLock<Mutex<BTreeMap<String, Warden>>> = OnceLock::new();
    NEARBY.get_or_init(|| Mutex::new(BTreeMap::new()))
}

/// One line this host holds, from either end. **A line hands every frame to
/// the warden's door and sends back whatever bytes come**, and its reader
/// never waits on a frame's judgment: a judgment may itself wait for an answer
/// on this same line.
struct Wire {
    via: Via,
    writer: Mutex<Line>,
    open: AtomicBool,
}

impl Wire {
    fn carry(&self, envelope: &[u8]) -> bool {
        if !self.open.load(Ordering::SeqCst) {
            return false;
        }
        let sent = self.writer.lock().expect("the line").send(envelope).is_ok();
        if !sent {
            self.open.store(false, Ordering::SeqCst);
        }
        sent
    }

    fn close(&self) {
        self.open.store(false, Ordering::SeqCst);
        let _ = self
            .writer
            .lock()
            .expect("the line")
            .stream()
            .shutdown(std::net::Shutdown::Both);
    }
}

/// Delivery, and the tables it keeps. **No secret is here.**
#[derive(Default)]
struct Roads {
    /// The warden this delivery is beneath, set once it is open.
    warden: OnceLock<Warden>,
    /// Lines held from either end, keyed by the padlock whose asks arrive on
    /// them — learned from the warden, which is the only thing that read the
    /// padlock.
    by_padlock: Mutex<BTreeMap<[u8; KEY], Arc<Wire>>>,
    /// Lines this host dialled, keyed by the hint, so a second ask down one
    /// road reuses the line rather than dialling again.
    by_hint: Mutex<BTreeMap<String, Arc<Wire>>>,
    /// Every line this host holds, by the token the warden hands back.
    by_via: Mutex<BTreeMap<Via, Arc<Wire>>>,
    next: AtomicU64,
    closed: AtomicBool,
}

impl Roads {
    fn warden(&self) -> Option<&Warden> {
        self.warden.get()
    }

    /// Take up a line, from either end, and set a reader on it.
    fn take_up(self: &Arc<Self>, line: Line) -> Option<Arc<Wire>> {
        let (reader, writer) = line.split().ok()?;
        let wire = Arc::new(Wire {
            via: Via(self.next.fetch_add(1, Ordering::SeqCst)),
            writer: Mutex::new(writer),
            open: AtomicBool::new(true),
        });
        self.by_via
            .lock()
            .expect("the lines")
            .insert(wire.via, wire.clone());
        let roads = self.clone();
        let held = wire.clone();
        std::thread::spawn(move || roads.read(reader, held));
        Some(wire)
    }

    fn read(self: Arc<Self>, mut reader: Line, wire: Arc<Wire>) {
        while let Ok(Arrival::Frame(envelope)) = reader.receive() {
            let Some(warden) = self.warden().cloned() else {
                break;
            };
            let answering = wire.clone();
            // A judgment may itself wait for an answer on this same line, so
            // the reader must be free to take that answer's frame while the
            // judgment is still running.
            std::thread::spawn(move || {
                if let Some(answer) = warden.arrive(&envelope, Some(answering.via)) {
                    answering.carry(&answer);
                }
            });
        }
        wire.open.store(false, Ordering::SeqCst);
        self.forget(&wire);
    }

    fn forget(&self, wire: &Arc<Wire>) {
        self.by_via.lock().expect("the lines").remove(&wire.via);
        self.by_padlock
            .lock()
            .expect("the lines")
            .retain(|_, held| !Arc::ptr_eq(held, wire));
        self.by_hint
            .lock()
            .expect("the lines")
            .retain(|_, held| !Arc::ptr_eq(held, wire));
    }

    fn dial(self: &Arc<Self>, hint: &str) -> Option<Arc<Wire>> {
        if let Some(held) = self.by_hint.lock().expect("the lines").get(hint) {
            if held.open.load(Ordering::SeqCst) {
                return Some(held.clone());
            }
        }
        let line = Line::dial(hint).ok()?;
        let wire = self.take_up(line)?;
        self.by_hint
            .lock()
            .expect("the lines")
            .insert(hint.to_string(), wire.clone());
        Some(wire)
    }
}

/// Delivery as the warden holds it: the tables, behind the one trait the
/// warden knows.
struct Beneath(Arc<Roads>);

impl Delivery for Beneath {
    fn send(&self, way: &Way, envelope: &[u8]) -> Carried {
        self.0.send(way, envelope)
    }

    fn arrived(&self, padlock: &[u8; KEY], via: Via) {
        self.0.arrived(padlock, via)
    }
}

impl Roads {
    fn send(self: &Arc<Self>, way: &Way, envelope: &[u8]) -> Carried {
        // A row with hints: the first road this ground can speak that carried.
        // What was tried and broke is kept, because weather is reported with
        // the roads it happened on.
        let mut tried: Vec<String> = Vec::new();
        for hint in &way.hints {
            if hint.starts_with("mem://") {
                tried.push(hint.clone());
                let far = neighbours().lock().expect("the grounds").get(hint).cloned();
                let Some(far) = far else { continue };
                return match far.arrive(envelope, None) {
                    Some(bytes) => Carried::Answer(bytes),
                    None => Carried::Silence,
                };
            }
            if hint.starts_with("http://") {
                tried.push(hint.clone());
                match carriage::post(hint, envelope) {
                    Ok(bytes) => return Carried::Answer(bytes),
                    // Weather on this road; the next may carry.
                    Err(_) => continue,
                }
            }
            if hint.starts_with("tcp://") {
                tried.push(hint.clone());
                let Some(wire) = self.dial(hint) else {
                    continue;
                };
                if wire.carry(envelope) {
                    // The answer arrives as a frame of its own, through the
                    // door.
                    return Carried::Later;
                }
                continue;
            }
            // A road this host cannot speak is not a road that failed: nothing
            // was sent, so it is walked past exactly as a hint never offered.
        }
        // A row without hints, or none it can speak: the line that padlock's
        // last ask arrived on, if still held.
        let back = self
            .by_padlock
            .lock()
            .expect("the lines")
            .get(&way.padlock)
            .cloned();
        if let Some(wire) = back {
            tried.push("the line this padlock last asked on".to_string());
            if wire.carry(envelope) {
                return Carried::Later;
            }
        }
        // Neither. A road was tried and broke: weather. Nothing could be
        // tried at all: no road, which is neither silence nor weather.
        if tried.is_empty() {
            return Carried::NoRoad {
                hints: way.hints.clone(),
            };
        }
        Carried::Weather { tried }
    }

    fn arrived(self: &Arc<Self>, padlock: &[u8; KEY], via: Via) {
        let wire = self.by_via.lock().expect("the lines").get(&via).cloned();
        if let Some(wire) = wire {
            self.by_padlock
                .lock()
                .expect("the lines")
                .insert(*padlock, wire);
        }
    }
}

/// One road stood in front of the warden, and how to take it down.
struct Stood {
    hint: String,
    /// The address a closing host knocks on to wake its own listener out of
    /// `accept`. A memory road has none.
    knock: Option<std::net::SocketAddr>,
}

/// One line this host holds, as a caller may see it: the token the warden
/// hands back beside a frame, and whether the line is still open. **Nothing
/// here reaches the line** — no bytes, no way to drive it, no way to name the
/// peer — because a road handed upward is the leak `papers/quo-truth.md`
/// refuses.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Held {
    pub via: Via,
    pub open: bool,
}

/// A ground: the warden, the roads standing in front of it, and delivery
/// beneath it.
pub struct Host {
    pub warden: Warden,
    roads: Arc<Roads>,
    stood: Mutex<Vec<Stood>>,
}

/// What a host is stood up on.
pub struct Standing {
    pub seeds: Seeds,
    pub clock: Arc<dyn Clock>,
    pub random: Arc<dyn Random>,
    pub store: Option<Arc<dyn Store>>,
    pub roads: Vec<Road>,
    /// Roads this ground publishes besides the ones it stands — a domain in
    /// front of a proxy, or a road nothing here can speak.
    pub hints: Vec<String>,
    pub limit: i64,
}

impl Standing {
    /// A host on this machine's own clock and randomness.
    pub fn here(roads: &[Road]) -> Standing {
        let random = Arc::new(Urandom);
        Standing {
            seeds: Seeds::drawn(random.as_ref()),
            clock: Arc::new(Wall),
            random,
            store: None,
            roads: roads.to_vec(),
            hints: Vec::new(),
            limit: 0,
        }
    }

    pub fn publishing(mut self, hints: &[&str]) -> Standing {
        self.hints = hints.iter().map(|hint| hint.to_string()).collect();
        self
    }

    pub fn keeping(mut self, store: Arc<dyn Store>) -> Standing {
        self.store = Some(store);
        self
    }
}

impl Host {
    /// Open the warden and stand the roads in front of it.
    pub fn stand(standing: Standing) -> std::io::Result<Host> {
        let roads = Arc::new(Roads::default());
        let mut opening = Opening::new(
            standing.seeds,
            standing.clock.clone(),
            standing.random.clone(),
        )
        .with_delivery(Arc::new(Beneath(roads.clone())))
        .with_limit(standing.limit);
        opening.hints = standing.hints;
        if let Some(store) = standing.store {
            opening = opening.with_store(store);
        }
        let warden = Warden::open(opening);
        let _ = roads.warden.set(warden.clone());

        let host = Host {
            warden: warden.clone(),
            roads: roads.clone(),
            stood: Mutex::new(Vec::new()),
        };
        for road in standing.roads {
            match road {
                Road::Memory => {
                    let hint = format!("mem://{}", hexed(&warden.name()));
                    neighbours()
                        .lock()
                        .expect("the grounds")
                        .insert(hint.clone(), warden.clone());
                    warden.publish(&hint);
                    host.stood
                        .lock()
                        .expect("the roads")
                        .push(Stood { hint, knock: None });
                }
                Road::Http { at } => host.serve_http(&at)?,
                Road::Tcp { at } => host.serve_tcp(&at)?,
            }
        }
        Ok(host)
    }

    fn serve_http(&self, at: &str) -> std::io::Result<()> {
        let door = carriage::Door::bind(at)?;
        let knock = door.listener().local_addr()?;
        let hint = door.hint()?;
        self.warden.publish(&hint);
        self.stood.lock().expect("the roads").push(Stood {
            hint,
            knock: Some(knock),
        });
        let warden = self.warden.clone();
        let roads = self.roads.clone();
        std::thread::spawn(move || {
            while !roads.closed.load(Ordering::SeqCst) {
                let warden = warden.clone();
                // The carriage answers in its own response, so nothing here
                // needs a way back: one POST, bytes in and bytes out.
                if door
                    .serve_one(move |envelope| warden.arrive(envelope, None))
                    .is_err()
                {
                    break;
                }
            }
        });
        Ok(())
    }

    fn serve_tcp(&self, at: &str) -> std::io::Result<()> {
        let listener = Listener::bind(at, quo_line::DEFAULT_CAP)?;
        let knock = listener.tcp().local_addr()?;
        let hint = listener.hint()?;
        self.warden.publish(&hint);
        self.stood.lock().expect("the roads").push(Stood {
            hint,
            knock: Some(knock),
        });
        let roads = self.roads.clone();
        std::thread::spawn(move || {
            while !roads.closed.load(Ordering::SeqCst) {
                match listener.accept() {
                    Ok(line) => {
                        if roads.closed.load(Ordering::SeqCst) {
                            break;
                        }
                        roads.take_up(line);
                    }
                    Err(_) => break,
                }
            }
        });
        Ok(())
    }

    /// The roads this host actually stood, as the hints they publish. Empty
    /// once the host is closed, because a retracted road is not stood.
    pub fn standing(&self) -> Vec<String> {
        self.stood
            .lock()
            .expect("the roads")
            .iter()
            .map(|stood| stood.hint.clone())
            .collect()
    }

    /// Every line this host holds, from either end, as tokens and open state.
    pub fn lines(&self) -> Vec<Held> {
        let mut held: Vec<Held> = self
            .roads
            .by_via
            .lock()
            .expect("the lines")
            .values()
            .map(|wire| Held {
                via: wire.via,
                open: wire.open.load(Ordering::SeqCst),
            })
            .collect();
        held.sort_by_key(|held| held.via);
        held
    }

    /// Whether a line this host once accepted is still open. A line it never
    /// held and a line it has let go answer the same, because to a caller
    /// asking whether it may be reached they are the same thing.
    pub fn holds(&self, via: Via) -> bool {
        self.roads
            .by_via
            .lock()
            .expect("the lines")
            .get(&via)
            .is_some_and(|wire| wire.open.load(Ordering::SeqCst))
    }

    /// Take the roads down and let go of every line. A line is a held resource
    /// and the ground that took it up is the one that puts it down.
    pub fn close(&self) {
        self.roads.closed.store(true, Ordering::SeqCst);
        for stood in self.stood.lock().expect("the roads").drain(..) {
            self.warden.retract(&stood.hint);
            neighbours()
                .lock()
                .expect("the grounds")
                .remove(&stood.hint);
            // A listener sits in `accept` until something knocks, so closing
            // knocks once and the loop finds the flag set.
            if let Some(knock) = stood.knock {
                let _ = TcpStream::connect(knock);
            }
        }
        let held: Vec<Arc<Wire>> = self
            .roads
            .by_via
            .lock()
            .expect("the lines")
            .values()
            .cloned()
            .collect();
        for wire in held {
            wire.close();
        }
    }
}

impl Drop for Host {
    fn drop(&mut self) {
        self.close();
    }
}

fn hexed(key: &[u8; KEY]) -> String {
    key.iter().map(|byte| format!("{byte:02x}")).collect()
}
