// SPDX-License-Identifier: Apache-2.0
//! `stand`: the Rust kit's stand program, `HARNESS.md` section 1. An
//! adapter and a harbor over `quo-kit`'s own library: it births wards
//! directly with `quo_kit::ward::Ward::birth`, holds their partitions
//! itself, and answers the root channel of section 2, the harbor's own
//! verbs of section 4, the partition file of section 5, and the fixed
//! stream of section 6, on stdin, stdout and a real TCP listener. It
//! changes nothing of the kit.

mod beings;
mod net;
mod partition_io;

use quo_kit::arithmetic::sha256;
use quo_kit::hex::hex;
use quo_kit::seal::{Seed, WardPk};
use quo_kit::value::{Map, Number, Value};
use quo_kit::ward::{Being, Carrier, Ground, Partition, Stance, Thrown, Unmade, Ward};
use std::cell::RefCell;
use std::collections::HashMap;
use std::io::{self, BufRead, Read, Write};
use std::process::exit;
use std::rc::Rc;
use std::str::FromStr;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::mpsc::{sync_channel, SyncSender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// The stream of section 6: SplitMix64, seeded once and never reset.
struct SplitMix64 {
    state: u64,
}

impl SplitMix64 {
    fn new(seed: u64) -> SplitMix64 {
        SplitMix64 { state: seed }
    }

    fn next_word(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }

    fn bytes(&mut self, count: usize) -> Vec<u8> {
        let mut out = Vec::with_capacity(count + 8);
        while out.len() < count {
            out.extend_from_slice(&self.next_word().to_le_bytes());
        }
        out.truncate(count);
        out
    }
}

/// Entropy without `--entropy`: the operating system's own, read from
/// `/dev/urandom`, which is what a Mac and a Linux box both keep. A machine
/// with neither falls back to a time-and-pid mix, not cryptographic and
/// never the stream `--entropy` replays, so a run nobody is replaying still
/// starts.
fn real_bytes(count: usize) -> Vec<u8> {
    if let Ok(mut f) = std::fs::File::open("/dev/urandom") {
        let mut buf = vec![0u8; count];
        if f.read_exact(&mut buf).is_ok() {
            return buf;
        }
    }
    let mut seed = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_nanos() as u64).unwrap_or(1);
    seed ^= std::process::id() as u64;
    let mut mixer = SplitMix64::new(seed);
    mixer.bytes(count)
}

enum Entropy {
    Fixed(SplitMix64),
    Real,
}

impl Entropy {
    fn bytes(&mut self, count: usize) -> Vec<u8> {
        match self {
            Entropy::Fixed(s) => s.bytes(count),
            Entropy::Real => real_bytes(count),
        }
    }
}

type Ctor = Rc<dyn Fn(Stance) -> Result<Box<dyn Being>, Thrown>>;

/// One ward this program stands, at one address. `copy` files a second of
/// these under the same pk, at a second address; `stand`'s own `listen`
/// moves a slot from one address to another.
struct WardSlot {
    /// The seed text this ward was given at start, kept so the harbor verb
    /// `stand` can birth her again on it, as section 4 says it must.
    seed: String,
    partition: Rc<RefCell<Partition>>,
    /// `None` once `stop` has run; `stand` births her again into this.
    ward: RefCell<Option<Ward>>,
    /// Section 4's `hold`, shared with this ward's own carrier.
    hold: Arc<AtomicU32>,
    /// Section 4's `drop`, spent where her replies are written.
    drop: RefCell<u32>,
    address: RefCell<String>,
}

enum Job {
    Stdin(String),
    Tcp(net::TcpAsk),
    StdinClosed,
}

/// The stand program's own ground: every ward it births shares one. A door
/// reached in this process is an ordinary call; nothing here is on the
/// wire but what a listener carries.
struct Harness {
    classes: RefCell<HashMap<String, Ctor>>,
    /// pk -> address -> the slot standing there.
    wards: RefCell<HashMap<WardPk, HashMap<String, Rc<WardSlot>>>>,
    entropy: RefCell<Entropy>,
    /// The carrier's own address book, section 4.11 of `net.rs`'s doc
    /// comment: `HARNESS.md` names nothing that ever writes to it.
    peers: Arc<Mutex<HashMap<WardPk, String>>>,
    tx: SyncSender<Job>,
    /// Set for the span of one `Ward::birth` call, so `Ground::carrier`
    /// answers the carrier built for that one ward and no other.
    next_carrier: RefCell<Option<Arc<dyn Carrier>>>,
}

impl Ground for Harness {
    fn instantiate(&self, class: &str, stance: Stance) -> Result<Box<dyn Being>, Unmade> {
        let ctor = self.classes.borrow().get(class).cloned().ok_or(Unmade::NoClass)?;
        ctor(stance).map_err(Unmade::Threw)
    }

    fn door(&self, ward: &WardPk) -> Option<Ward> {
        let wards = self.wards.borrow();
        let slots = wards.get(ward)?;
        // Reached with no `at`: the one listener that holds her, when
        // there is exactly one. Two, after a `copy`, is the ambiguity
        // chapter 7 prices, and the carrier is no more able to resolve it.
        if slots.len() != 1 {
            return None;
        }
        let result = slots.values().next()?.ward.borrow().clone();
        result
    }

    fn carrier(&self) -> Option<Arc<dyn Carrier>> {
        self.next_carrier.borrow().clone()
    }

    fn random(&self, count: usize) -> Vec<u8> {
        self.entropy.borrow_mut().bytes(count)
    }

    /// A ward's wait lets go of the wards, so every other job runs
    /// meanwhile, and `ready` is asked only with them held again.
    fn wait(&self, ready: &dyn Fn() -> bool, until: Instant) {
        while !ready() {
            let Some(left) = until.checked_duration_since(Instant::now()).filter(|d| !d.is_zero()) else {
                return;
            };
            gil::pause(left.min(Duration::from_millis(1)));
        }
    }
}

/// The one lock over everything this program stands. The wards are `Rc`
/// and the kit runs a ward on whichever thread holds them, so each job runs
/// on a thread of its own holding this lock, and lets go of it only where it
/// waits: a being's wait, a ward's wait on its carrier or on a relation's
/// line. Two jobs are never inside the wards at once, and a job that waits
/// holds nobody else.
mod gil {
    use std::cell::RefCell;
    use std::sync::{Mutex, MutexGuard, PoisonError};
    use std::time::Duration;

    static GIL: Mutex<()> = Mutex::new(());

    thread_local! {
        static HELD: RefCell<Option<MutexGuard<'static, ()>>> = const { RefCell::new(None) };
    }

    pub fn enter() {
        let guard = GIL.lock().unwrap_or_else(PoisonError::into_inner);
        HELD.with(|h| *h.borrow_mut() = Some(guard));
    }

    pub fn leave() {
        HELD.with(|h| h.borrow_mut().take());
    }

    /// Lets go of the wards for `span`, and holds them again.
    pub fn pause(span: Duration) {
        leave();
        std::thread::sleep(span);
        enter();
    }
}

/// The harness carried to a job's thread. Every clone and drop of it
/// happens while the thread doing it holds the one lock.
struct Held(Rc<Harness>);

// SAFETY: `Held` is only made, used and dropped by a thread holding
// `gil`, so the `Rc`s and `RefCell`s it reaches are touched by one thread
// at a time.
unsafe impl Send for Held {}

/// Births a ward on `seed_text` over `partition`, with a carrier of her
/// own that section 4's `hold` reaches through `hold`.
fn birth(harness: &Rc<Harness>, seed_text: &str, partition: Rc<RefCell<Partition>>, hold: Arc<AtomicU32>) -> Ward {
    let seed = Seed::from_text(seed_text);
    let carrier: Arc<dyn Carrier> = Arc::new(net::PeerCarrier { hold, peers: harness.peers.clone() });
    *harness.next_carrier.borrow_mut() = Some(carrier);
    let ground: Rc<dyn Ground> = harness.clone();
    let ward = Ward::birth(&seed, partition, ground);
    *harness.next_carrier.borrow_mut() = None;
    ward
}

fn tcp_callback(harness: &Rc<Harness>) -> impl Fn(net::TcpAsk) + Send + Clone + 'static {
    let tx = harness.tx.clone();
    move |ask| {
        let _ = tx.send(Job::Tcp(ask));
    }
}

fn fail(reason: impl std::fmt::Display) -> ! {
    eprintln!("stand: {reason}");
    exit(1);
}

fn cannot_stand(reason: impl std::fmt::Display) -> ! {
    eprintln!("stand: {reason}");
    exit(2);
}

struct WardArg {
    seed: String,
    file: Option<String>,
}

struct ClassArg {
    name: String,
    class: String,
}

struct Args {
    listen: String,
    wards: Vec<WardArg>,
    classes: Vec<ClassArg>,
    entropy: Option<u64>,
}

fn parse_args() -> Args {
    let mut listen = None;
    let mut wards = Vec::new();
    let mut classes = Vec::new();
    let mut entropy = None;
    let mut it = std::env::args().skip(1);
    while let Some(flag) = it.next() {
        match flag.as_str() {
            "--listen" => listen = Some(it.next().unwrap_or_else(|| fail("--listen needs an address"))),
            "--ward" => {
                let spec = it.next().unwrap_or_else(|| fail("--ward needs SEED[=FILE]"));
                let (seed, file) = match spec.split_once('=') {
                    Some((s, f)) => (s.to_owned(), Some(f.to_owned())),
                    None => (spec, None),
                };
                wards.push(WardArg { seed, file });
            }
            "--class" => {
                let spec = it.next().unwrap_or_else(|| fail("--class needs NAME[=CLASS]"));
                let (name, class) = match spec.split_once('=') {
                    Some((n, c)) => (n.to_owned(), c.to_owned()),
                    None => (spec.clone(), spec),
                };
                classes.push(ClassArg { name, class });
            }
            "--entropy" => {
                let seed = it.next().unwrap_or_else(|| fail("--entropy needs a seed"));
                entropy = Some(seed.parse::<u64>().unwrap_or_else(|_| fail("--entropy is not a decimal u64")));
            }
            other => fail(format!("{other} is not an argument")),
        }
    }
    Args { listen: listen.unwrap_or_else(|| fail("--listen is required")), wards, classes, entropy }
}

fn base_ctors() -> HashMap<String, Ctor> {
    let mut m: HashMap<String, Ctor> = HashMap::new();
    m.insert("Host".into(), Rc::new(|s| Ok(Box::new(beings::Host::new(s)) as Box<dyn Being>)));
    m.insert("Caller".into(), Rc::new(|s| Ok(Box::new(beings::Caller::new(s)) as Box<dyn Being>)));
    m.insert("Stillborn".into(), Rc::new(beings::Stillborn::new));
    m
}

fn main() {
    let args = parse_args();

    let base = base_ctors();
    let mut held: HashMap<String, Ctor> = HashMap::new();
    for c in &args.classes {
        let ctor = base.get(&c.class).unwrap_or_else(|| fail(format!("{} is not a class this kit holds", c.class))).clone();
        held.insert(c.name.clone(), ctor);
    }

    let entropy = RefCell::new(match args.entropy {
        Some(seed) => Entropy::Fixed(SplitMix64::new(seed)),
        None => Entropy::Real,
    });

    let (tx, rx) = sync_channel::<Job>(64);
    let harness = Rc::new(Harness { classes: RefCell::new(held), wards: RefCell::new(HashMap::new()), entropy, peers: Arc::new(Mutex::new(HashMap::new())), tx, next_carrier: RefCell::new(None) });
    gil::enter();

    let address = net::spawn_listener(&args.listen, tcp_callback(&harness)).unwrap_or_else(|e| fail(format!("cannot listen on {}: {e}", args.listen)));

    let mut order = Vec::new();
    for w in &args.wards {
        let pk = Seed::from_text(&w.seed).ward_pk();
        let partition = match &w.file {
            None => Partition::default(),
            Some(path) => {
                let text = std::fs::read_to_string(path).unwrap_or_else(|e| cannot_stand(format!("{path}: {e}")));
                partition_io::load(&text).unwrap_or_else(|e| cannot_stand(format!("{path} is not a partition file: {e}")))
            }
        };
        let partition = Rc::new(RefCell::new(partition));
        let hold = Arc::new(AtomicU32::new(0));
        let ward = birth(&harness, &w.seed, partition.clone(), hold.clone());
        let slot = Rc::new(WardSlot { seed: w.seed.clone(), partition, ward: RefCell::new(Some(ward)), hold, drop: RefCell::new(0), address: RefCell::new(address.clone()) });
        harness.wards.borrow_mut().entry(pk).or_default().insert(address.clone(), slot);
        order.push(pk);
    }

    {
        let stdout = io::stdout();
        let mut out = stdout.lock();
        for pk in &order {
            writeln!(out, "ward {pk} {address}").ok();
        }
        writeln!(out, "ready").ok();
        out.flush().ok();
    }

    // Section 2, the root channel: one JSON value a line, on stdin, until
    // stdin closes. A dedicated thread reads it, since this one also
    // drains every ask any TCP listener took in, and `Job` is the one
    // queue both feed.
    let tx_stdin = harness.tx.clone();
    std::thread::spawn(move || {
        let stdin = io::stdin();
        for line in stdin.lock().lines() {
            match line {
                Ok(l) if !l.is_empty() => {
                    if tx_stdin.send(Job::Stdin(l)).is_err() {
                        break;
                    }
                }
                Ok(_) => continue,
                Err(_) => break,
            }
        }
        let _ = tx_stdin.send(Job::StdinClosed);
    });

    // Every request and every carried ask runs on a thread of its own, so
    // answers leave in any order and a job that waits holds no other.
    gil::leave();
    while let Ok(job) = rx.recv() {
        if let Job::StdinClosed = job {
            exit(0);
        }
        gil::enter();
        let held = Held(harness.clone());
        gil::leave();
        std::thread::spawn(move || {
            gil::enter();
            run_job(&held.0, job);
            drop(held);
            gil::leave();
        });
    }
    exit(0);
}

/// One job to its end. Every answer leaves by its own way, a line on stdout
/// or its own connection's channel.
fn run_job(harness: &Rc<Harness>, job: Job) {
    match job {
        Job::StdinClosed => exit(0),
        Job::Stdin(line) => {
            let reply = handle_line(harness, &line);
            let stdout = io::stdout();
            let mut out = stdout.lock();
            writeln!(out, "{}", reply.to_json()).ok();
            out.flush().ok();
        }
        Job::Tcp(ask) => {
            let action = handle_tcp(harness, &ask);
            let _ = ask.respond.send(action);
        }
    }
}

/// One ask a listener carried, answered while this job holds the wards:
/// the door judges it, and section 4's `drop`, spent here and
/// nowhere else, decides whether the reply is the one this thread writes.
fn handle_tcp(harness: &Harness, ask: &net::TcpAsk) -> net::ReplyAction {
    let slot = harness.wards.borrow().get(&ask.pk).and_then(|m| m.get(&ask.address)).cloned();
    let Some(slot) = slot else { return net::ReplyAction::Nothing };
    let ward = slot.ward.borrow().clone();
    let Some(ward) = ward else { return net::ReplyAction::Nothing };
    let (reply, _heard) = ward.door(&ask.bytes);
    let mut n = slot.drop.borrow_mut();
    if *n > 0 {
        *n -= 1;
        net::ReplyAction::Swallow
    } else {
        net::ReplyAction::Reply(reply)
    }
}

fn resolve_slot(harness: &Harness, pk: WardPk, at: Option<&str>) -> Option<Rc<WardSlot>> {
    let wards = harness.wards.borrow();
    let slots = wards.get(&pk)?;
    match at {
        Some(addr) => slots.get(addr).cloned(),
        None if slots.len() == 1 => slots.values().next().cloned(),
        None => None,
    }
}

fn handle_line(harness: &Rc<Harness>, line: &str) -> Value {
    let mut answer = Map::new();
    let Some((Value::Object(request), tainted)) = channel::read(line) else {
        return error_line();
    };
    let id = request.get("id").cloned().unwrap_or(Value::Null);
    answer.insert("id", id);
    let ward_hex = request.get("ward").and_then(Value::as_str).unwrap_or_default();
    let method = request.get("method").and_then(Value::as_str);
    let outcome = match WardPk::from_str(ward_hex) {
        Err(_) => Outcome::Object(err("no such ward")),
        // A non-value in the args an ask or a knock carries is what the kit
        // refuses to seal: `unreached`, and nothing leaves. Anywhere else it
        // is a request this adapter cannot read.
        Ok(_) if tainted.iter().any(|path| path.starts_with(&["args".to_owned(), "args".to_owned()])) && matches!(method, Some("ask" | "knock")) => Outcome::Word("unreached".into()),
        Ok(_) if !tainted.is_empty() => Outcome::Object(err("not a request")),
        Ok(pk) => {
            let at = request.get("at").and_then(Value::as_str);
            let method = request.get("method").and_then(Value::as_str);
            let args = request.get("args").and_then(Value::as_object).cloned().unwrap_or_default();
            dispatch(harness, pk, at, method, &args)
        }
    };
    match outcome {
        Outcome::Object(v) => answer.insert("object", v),
        Outcome::Silence => answer.insert("silence", true),
        Outcome::Word(w) => answer.insert("quo", w),
    };
    Value::Object(answer)
}

fn dispatch(harness: &Rc<Harness>, pk: WardPk, at: Option<&str>, method: Option<&str>, args: &Map) -> Outcome {
    match method {
        Some("stop") => harbor_stop(harness, pk, at),
        Some("stand") => harbor_stand(harness, pk, at, args),
        Some("save") => harbor_save(harness, pk, at, args),
        Some("digest") => harbor_digest(harness, pk, at),
        Some("forget") => harbor_forget(harness, pk, at, args),
        Some("hold") => harbor_hold(harness, pk, at, args),
        Some("drop") => harbor_drop(harness, pk, at, args),
        Some("copy") => harbor_copy(harness, pk, at, args),
        Some("route") => harbor_route(harness, pk, at, args),
        _ => {
            let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
            let ward = slot.ward.borrow().clone();
            let Some(ward) = ward else { return Outcome::Object(err("no such ward")) };
            match method {
                None => Outcome::Object(ward.ask(None, None).into_value()),
                // A throw inside the unsealed ask is silence, chapter 5.
                Some("boom") => Outcome::Silence,
                Some("boot") => handle_boot(harness, &ward, &slot, args),
                Some("public") => handle_public(&ward, &slot, args),
                Some("invite") => handle_invite(&ward, &slot, args),
                Some("remove") => handle_remove(&ward, &slot, args),
                Some("knock") => handle_knock(&ward, &slot, args),
                Some("take") => handle_take(&ward, &slot, args),
                Some("ask") => handle_ask(&ward, &slot, args),
                Some("standing") => handle_standing(&ward, &slot, args),
                Some(_) => Outcome::Object(err("no such method")),
            }
        }
    }
}

/// Reading a line of the root channel. A line is JSON text, and it is not a
/// value a door reads: its args nest one level under the request and may
/// carry what the value rule refuses. So the line is read by structure
/// here, with no depth bound, each string and number read by the kit's own
/// value rule, and every number that rule refuses kept as `null` beside the
/// path of keys where it stood.
mod channel {
    use quo_kit::value::{Map, Value};

    type Path = Vec<String>;

    pub fn read(line: &str) -> Option<(Value, Vec<Path>)> {
        let mut r = Reader { text: line, at: 0, tainted: Vec::new() };
        r.space();
        let value = r.value(&mut Vec::new())?;
        r.space();
        (r.at == line.len()).then_some((value, r.tainted))
    }

    struct Reader<'a> {
        text: &'a str,
        at: usize,
        tainted: Vec<Path>,
    }

    impl Reader<'_> {
        fn peek(&self) -> Option<u8> {
            self.text.as_bytes().get(self.at).copied()
        }

        fn space(&mut self) {
            while matches!(self.peek(), Some(b' ' | b'\t' | b'\r' | b'\n')) {
                self.at += 1;
            }
        }

        fn eat(&mut self, byte: u8) -> Option<()> {
            self.space();
            (self.peek() == Some(byte)).then(|| self.at += 1)
        }

        fn value(&mut self, path: &mut Path) -> Option<Value> {
            self.space();
            match self.peek()? {
                b'{' => {
                    self.at += 1;
                    let mut map = Map::new();
                    if self.eat(b'}').is_some() {
                        return Some(Value::Object(map));
                    }
                    loop {
                        self.space();
                        let key = self.string()?;
                        let key = key.as_str()?.to_owned();
                        self.eat(b':')?;
                        path.push(key.clone());
                        let value = self.value(path)?;
                        path.pop();
                        if map.insert(key, value).is_some() {
                            return None;
                        }
                        if self.eat(b'}').is_some() {
                            return Some(Value::Object(map));
                        }
                        self.eat(b',')?;
                    }
                }
                b'[' => {
                    self.at += 1;
                    let mut items = Vec::new();
                    if self.eat(b']').is_some() {
                        return Some(Value::Array(items));
                    }
                    loop {
                        items.push(self.value(path)?);
                        if self.eat(b']').is_some() {
                            return Some(Value::Array(items));
                        }
                        self.eat(b',')?;
                    }
                }
                b'"' => self.string(),
                _ => {
                    let start = self.at;
                    while matches!(self.peek(), Some(b'-' | b'+' | b'.' | b'0'..=b'9' | b'a'..=b'z' | b'E')) {
                        self.at += 1;
                    }
                    let token = &self.text[start..self.at];
                    match Value::parse(token) {
                        Ok(v) => Some(v),
                        Err(_) if token.starts_with(['-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']) => {
                            self.tainted.push(path.clone());
                            Some(Value::Null)
                        }
                        Err(_) => None,
                    }
                }
            }
        }

        fn string(&mut self) -> Option<Value> {
            let start = self.at;
            if self.peek() != Some(b'"') {
                return None;
            }
            self.at += 1;
            loop {
                match self.peek()? {
                    b'"' => break,
                    b'\\' => self.at += 2,
                    _ => self.at += 1,
                }
            }
            self.at += 1;
            Value::parse(self.text.get(start..self.at)?).ok()
        }
    }
}

enum Outcome {
    Object(Value),
    Silence,
    Word(String),
}

fn error_line() -> Value {
    let mut m = Map::new();
    m.insert("id", Value::Null);
    m.insert("object", err("not a request"));
    Value::Object(m)
}

fn err(reason: &str) -> Value {
    let mut m = Map::new();
    m.insert("error", reason);
    Value::Object(m)
}

fn whole(n: u64) -> Value {
    Value::Number(Number::from_u64(n).expect("a count within the doubles"))
}

trait IntoValue {
    fn into_value(self) -> Value;
}
impl IntoValue for quo_kit::ward::Answer {
    fn into_value(self) -> Value {
        match self {
            quo_kit::ward::Answer::Value(v) => v,
            _ => Value::Null,
        }
    }
}

// --- Section 2's six named refusals -----------------------------------
//
// The kit's own root answers every refusal as silence, whatever the
// reason: `Ward::ask`'s "ask" case, and the being-level calls this
// adapter reaches through it, all collapse to one shape. So this harness
// keeps what it needs to tell them apart itself, from records the kit
// already keeps for it: `Partition::beings` says whether a key was ever
// booted at all, the ward's own blueprint says whether she is absent (her
// class threw while she was made), and `Partition::bind` says whether an
// id already names an occupant or a standing. None of this changes the
// kit; it only reads what the kit already wrote.

enum BeingStatus {
    Missing,
    Absent,
    Alive,
}

fn being_status(ward: &Ward, partition: &Rc<RefCell<Partition>>, key: &str) -> BeingStatus {
    if !partition.borrow().has_being(key) {
        return BeingStatus::Missing;
    }
    let absent = match ward.ask(None, None) {
        quo_kit::ward::Answer::Value(v) => v.get("notes").and_then(|n| n.get("beings")).and_then(|b| b.get(key)).and_then(|row| row.get("absent")).and_then(Value::as_bool).unwrap_or(false),
        _ => false,
    };
    if absent {
        BeingStatus::Absent
    } else {
        BeingStatus::Alive
    }
}

fn being_refusal(status: BeingStatus) -> Option<Outcome> {
    match status {
        BeingStatus::Missing => Some(Outcome::Object(err("no such being"))),
        BeingStatus::Absent => Some(Outcome::Object(err("absent"))),
        BeingStatus::Alive => None,
    }
}

fn id_taken(partition: &Rc<RefCell<Partition>>, being: &str, id: &str) -> bool {
    partition.borrow().cells(being).is_some_and(|c| c.holds_id(id))
}

// --- The root's own asks, section 2 ------------------------------------

/// `boot { maker, key, class, occupant, standing } -> { booted: key }`, the
/// being `maker`'s boot. With a maker it is the kit's own `Stance::boot` on
/// her, reached through the reserved `__boot`: the one relation between the
/// made being and her maker, `occupant` the maker's id for the made being
/// and `standing` the made being's id for her maker. Without one it is the
/// kit's root `boot` ask, which makes a being and no relation.
///
/// The kit answers a boot of a class that throws while it is made as a key
/// on its root and as nobody on a stance, so `absent` is read after the
/// fact from the ward's blueprint (`being_status`). A stance boot that made
/// nobody is tried once more on the root to tell `absent` from any other
/// refusal.
fn handle_boot(harness: &Rc<Harness>, ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    let (Some(key), Some(class)) = (args.get("key").and_then(Value::as_str), args.get("class").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    if !harness.classes.borrow().contains_key(class) {
        return Outcome::Object(err("no such class"));
    }
    if key == ward.pk().to_string() || slot.partition.borrow().has_being(key) {
        return Outcome::Object(err("key taken"));
    }
    if let Some(maker) = args.get("maker").and_then(Value::as_str) {
        if let Some(refusal) = being_refusal(being_status(ward, &slot.partition, maker)) {
            return refusal;
        }
        let (Some(occ), Some(stand)) = (args.get("occupant").and_then(Value::as_str), args.get("standing").and_then(Value::as_str)) else {
            return Outcome::Object(err("bad args"));
        };
        let mut inner = Map::new();
        inner.insert("class", class);
        inner.insert("key", key);
        inner.insert("occupant", occ);
        inner.insert("standing", stand);
        if let Outcome::Object(v) = reserved_on(ward, maker, "__boot", inner) {
            if v.get("booted").and_then(Value::as_str) == Some(key) {
                let mut m = Map::new();
                m.insert("booted", key);
                return Outcome::Object(Value::Object(m));
            }
        }
    }
    let mut a = Map::new();
    a.insert("key", key);
    a.insert("class", class);
    let booted = match ward.ask(Some("boot"), Some(&a)) {
        quo_kit::ward::Answer::Value(v) => v,
        _ => return Outcome::Object(err("refused")),
    };
    if matches!(being_status(ward, &slot.partition, key), BeingStatus::Absent) {
        return Outcome::Object(err("absent"));
    }
    if args.get("maker").is_some() {
        return Outcome::Object(err("refused"));
    }
    let mut m = Map::new();
    m.insert("booted", booted);
    Outcome::Object(Value::Object(m))
}

fn handle_public(ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    match args.get("key") {
        Some(Value::Null) => {
            let mut a = Map::new();
            a.insert("key", Value::Null);
            wrap_root(ward.ask(Some("public"), Some(&a)), "public")
        }
        Some(Value::String(key)) => {
            if let Some(refusal) = being_refusal(being_status(ward, &slot.partition, key)) {
                return refusal;
            }
            let mut a = Map::new();
            a.insert("key", key.as_str());
            wrap_root(ward.ask(Some("public"), Some(&a)), "public")
        }
        _ => Outcome::Object(err("bad args")),
    }
}

fn handle_invite(ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    let (Some(being), Some(id)) = (args.get("being").and_then(Value::as_str), args.get("id").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    if let Some(refusal) = being_refusal(being_status(ward, &slot.partition, being)) {
        return refusal;
    }
    if id_taken(&slot.partition, being, id) {
        return Outcome::Object(err("id taken"));
    }
    let mut a = Map::new();
    a.insert("being", being);
    a.insert("id", id);
    if let Some(notes) = args.get("notes") {
        a.insert("notes", notes.clone());
    }
    match ward.ask(Some("invite"), Some(&a)) {
        quo_kit::ward::Answer::Value(v) => {
            let mut m = Map::new();
            m.insert("invitation", v);
            Outcome::Object(Value::Object(m))
        }
        _ => Outcome::Object(err("refused")),
    }
}

fn handle_remove(ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    let (Some(being), Some(id)) = (args.get("being").and_then(Value::as_str), args.get("id").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    // Remove reaches an absent being's own records too: she owns them
    // whether or not her class came back this run.
    if !slot.partition.borrow().has_being(being) {
        return Outcome::Object(err("no such being"));
    }
    let mut a = Map::new();
    a.insert("being", being);
    a.insert("id", id);
    wrap_root(ward.ask(Some("remove"), Some(&a)), "removed")
}

fn handle_knock(ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    let Some(being) = args.get("being").and_then(Value::as_str) else {
        return Outcome::Object(err("bad args"));
    };
    if let Some(refusal) = being_refusal(being_status(ward, &slot.partition, being)) {
        return refusal;
    }
    let mut inner = Map::new();
    for f in ["invitation", "method", "args", "wanted"] {
        if let Some(v) = args.get(f) {
            inner.insert(f, v.clone());
        }
    }
    reserved_on(ward, being, "__knock", inner)
}

fn handle_take(ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    let (Some(being), Some(id)) = (args.get("being").and_then(Value::as_str), args.get("id").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    if let Some(refusal) = being_refusal(being_status(ward, &slot.partition, being)) {
        return refusal;
    }
    if id_taken(&slot.partition, being, id) {
        return Outcome::Object(err("id taken"));
    }
    let mut inner = Map::new();
    inner.insert("id", id);
    if let Some(v) = args.get("invitation") {
        inner.insert("invitation", v.clone());
    }
    reserved_on(ward, being, "__take", inner)
}

fn handle_ask(ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    let Some(being) = args.get("being").and_then(Value::as_str) else {
        return Outcome::Object(err("bad args"));
    };
    if let Some(refusal) = being_refusal(being_status(ward, &slot.partition, being)) {
        return refusal;
    }
    let mut inner = Map::new();
    for f in ["id", "method", "args", "wanted"] {
        if let Some(v) = args.get(f) {
            inner.insert(f, v.clone());
        }
    }
    reserved_on(ward, being, "__ask", inner)
}

fn handle_standing(ward: &Ward, slot: &WardSlot, args: &Map) -> Outcome {
    let (Some(being), Some(id)) = (args.get("being").and_then(Value::as_str), args.get("id").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    if let Some(refusal) = being_refusal(being_status(ward, &slot.partition, being)) {
        return refusal;
    }
    let has = slot.partition.borrow().cells(being).is_some_and(|c| c.standing(id).is_some());
    if !has {
        return Outcome::Object(err("no such standing"));
    }
    let mut inner = Map::new();
    inner.insert("id", id);
    reserved_on(ward, being, "__standing", inner)
}

/// A root ask that answers plainly: `Answer::Value(v)` wrapped one field
/// deep under `field`, and any refusal as the adapter's own generic one,
/// since every refusal this shape can still hit past the checks above is
/// none of the six named ones (a reserved id, for one).
fn wrap_root(answer: quo_kit::ward::Answer, field: &str) -> Outcome {
    match answer {
        quo_kit::ward::Answer::Value(v) => {
            let mut m = Map::new();
            m.insert(field, v);
            Outcome::Object(Value::Object(m))
        }
        _ => Outcome::Object(err("refused")),
    }
}

/// Section 2's `knock`, `take`, `ask` and `standing`, and boot's own
/// relation: the kit's root cannot reach `Stance`'s calls separately
/// (`Ward::ask`'s own `knock` fuses a take, and it has no `ask` on a
/// standing, no bare `standing`, and no `boot` with a relation at all).
/// The harness's own being classes carry a reserved method for each,
/// reached through the kit's root `ask` verb on `being`, and answer
/// wrapped as `{ok}`, `{silence}` or `{word}` so this can read the
/// channel's own three shapes back out.
fn reserved_on(ward: &Ward, being: &str, name: &str, inner: Map) -> Outcome {
    let mut outer = Map::new();
    outer.insert("being", being);
    outer.insert("method", name);
    outer.insert("args", Value::Object(inner));
    match ward.ask(Some("ask"), Some(&outer)) {
        quo_kit::ward::Answer::Value(Value::Object(wrapped)) => match wrapped.get("held").and_then(Value::as_str).and_then(beings::take_held) {
            Some(quo_kit::ward::Answer::Value(v)) => Outcome::Object(v),
            Some(quo_kit::ward::Answer::Silence) => Outcome::Silence,
            Some(quo_kit::ward::Answer::Word(w)) => Outcome::Word(w.to_string()),
            None => Outcome::Object(Value::Object(wrapped)),
        },
        _ => Outcome::Object(err("no such being")),
    }
}

// --- The harbor's own verbs, section 4 ----------------------------------

fn harbor_stop(harness: &Harness, pk: WardPk, at: Option<&str>) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    slot.ward.borrow_mut().take();
    // A stopped ward sends nothing and writes nothing, so what `hold` and
    // `drop` still had to spend goes with its run.
    slot.hold.store(0, std::sync::atomic::Ordering::SeqCst);
    *slot.drop.borrow_mut() = 0;
    let mut m = Map::new();
    m.insert("stopped", pk.to_string());
    Outcome::Object(Value::Object(m))
}

fn harbor_stand(harness: &Rc<Harness>, pk: WardPk, at: Option<&str>, args: &Map) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    if let Some(path) = args.get("file").and_then(Value::as_str) {
        let text = match std::fs::read_to_string(path) {
            Ok(t) => t,
            Err(e) => return Outcome::Object(err(&format!("could not read {path}: {e}"))),
        };
        match partition_io::load(&text) {
            Ok(p) => *slot.partition.borrow_mut() = p,
            Err(e) => return Outcome::Object(err(&format!("{path} is not a partition file: {e}"))),
        }
    }
    if let Some(addr) = args.get("listen").and_then(Value::as_str) {
        let bound = match net::spawn_listener(addr, tcp_callback(harness)) {
            Ok(a) => a,
            Err(e) => return Outcome::Object(err(&format!("cannot listen on {addr}: {e}"))),
        };
        let mut wards = harness.wards.borrow_mut();
        if let Some(slots) = wards.get_mut(&pk) {
            slots.retain(|_, s| !Rc::ptr_eq(s, &slot));
            slots.insert(bound.clone(), slot.clone());
        }
        *slot.address.borrow_mut() = bound;
    }
    let ward = birth(harness, &slot.seed, slot.partition.clone(), slot.hold.clone());
    *slot.ward.borrow_mut() = Some(ward);
    let mut m = Map::new();
    m.insert("stood", pk.to_string());
    m.insert("at", slot.address.borrow().clone());
    Outcome::Object(Value::Object(m))
}

fn harbor_save(harness: &Harness, pk: WardPk, at: Option<&str>, args: &Map) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    let Some(path) = args.get("file").and_then(Value::as_str) else {
        return Outcome::Object(err("bad args"));
    };
    let text = partition_io::save(&slot.partition.borrow());
    match std::fs::write(path, text) {
        Ok(()) => {
            let mut m = Map::new();
            m.insert("saved", path);
            Outcome::Object(Value::Object(m))
        }
        Err(e) => Outcome::Object(err(&format!("could not save {path}: {e}"))),
    }
}

fn harbor_digest(harness: &Harness, pk: WardPk, at: Option<&str>) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    // The partition is not a value a door reads: a cell of depth sixty-four
    // nests deeper inside it, so it is hashed as it stands.
    let value = slot.partition.borrow().to_value();
    let d = hex(&sha256(value.canonical().as_bytes()));
    let mut m = Map::new();
    m.insert("digest", d);
    Outcome::Object(Value::Object(m))
}

/// `forget { being, id } -> { forgot: id | null }`, on a stopped ward. In
/// this kit an occupant record stands in three places: the id's row in the
/// being's `bind.occupants` and her occupant cell. Both go, and nothing
/// else: the heir that row names stays where the door keeps it.
fn harbor_forget(harness: &Harness, pk: WardPk, at: Option<&str>, args: &Map) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    if slot.ward.borrow().is_some() {
        return Outcome::Object(err("running"));
    }
    let (Some(being), Some(id)) = (args.get("being").and_then(Value::as_str), args.get("id").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    let forgot = slot.partition.borrow_mut().forget(being, id);
    let mut m = Map::new();
    m.insert("forgot", if forgot { Value::from(id) } else { Value::Null });
    Outcome::Object(Value::Object(m))
}

fn harbor_hold(harness: &Harness, pk: WardPk, at: Option<&str>, args: &Map) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    let Some(n) = args.get("asks").and_then(Value::as_number).and_then(|n| n.as_u64()) else {
        return Outcome::Object(err("bad args"));
    };
    slot.hold.store(n as u32, Ordering::SeqCst);
    let mut m = Map::new();
    m.insert("holding", whole(n));
    Outcome::Object(Value::Object(m))
}

fn harbor_drop(harness: &Harness, pk: WardPk, at: Option<&str>, args: &Map) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    let Some(n) = args.get("replies").and_then(Value::as_number).and_then(|n| n.as_u64()) else {
        return Outcome::Object(err("bad args"));
    };
    *slot.drop.borrow_mut() = n as u32;
    let mut m = Map::new();
    m.insert("dropping", whole(n));
    Outcome::Object(Value::Object(m))
}

fn harbor_copy(harness: &Rc<Harness>, pk: WardPk, at: Option<&str>, args: &Map) -> Outcome {
    let Some(slot) = resolve_slot(harness, pk, at) else { return Outcome::Object(err("no such ward")) };
    let (Some(path), Some(listen)) = (args.get("file").and_then(Value::as_str), args.get("listen").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    let text = match std::fs::read_to_string(path) {
        Ok(t) => t,
        Err(e) => return Outcome::Object(err(&format!("could not read {path}: {e}"))),
    };
    let loaded = match partition_io::load(&text) {
        Ok(p) => p,
        Err(e) => return Outcome::Object(err(&format!("{path} is not a partition file: {e}"))),
    };
    let bound = match net::spawn_listener(listen, tcp_callback(harness)) {
        Ok(a) => a,
        Err(e) => return Outcome::Object(err(&format!("cannot listen on {listen}: {e}"))),
    };
    let partition = Rc::new(RefCell::new(loaded));
    let hold = Arc::new(AtomicU32::new(0));
    let ward = birth(harness, &slot.seed, partition.clone(), hold.clone());
    let new_slot = Rc::new(WardSlot { seed: slot.seed.clone(), partition, ward: RefCell::new(Some(ward)), hold, drop: RefCell::new(0), address: RefCell::new(bound.clone()) });
    harness.wards.borrow_mut().entry(pk).or_default().insert(bound.clone(), new_slot);
    let mut m = Map::new();
    m.insert("copy", pk.to_string());
    m.insert("at", bound);
    Outcome::Object(Value::Object(m))
}

/// `route { far, at } { routed: far }`, section 4: this program's address
/// book, `Harness::peers`, shared by every `PeerCarrier` any ward here was
/// born holding, so the effect reaches every ward this program stands, as
/// the verb says it must. `ward` only names a ward this program stands, to
/// answer `{error: "no such ward"}` like every other verb when it does not;
/// the write itself is the program's own and not that ward's alone. A
/// second `route` for one `far` replaces the first, since `peers` is a map.
fn harbor_route(harness: &Harness, pk: WardPk, at: Option<&str>, args: &Map) -> Outcome {
    if resolve_slot(harness, pk, at).is_none() {
        return Outcome::Object(err("no such ward"));
    }
    let (Some(far), Some(dial_at)) = (args.get("far").and_then(Value::as_str), args.get("at").and_then(Value::as_str)) else {
        return Outcome::Object(err("bad args"));
    };
    if WardPk::from_str(far).is_err() {
        return Outcome::Object(err("bad args"));
    }
    let Ok(mut peers) = harness.peers.lock() else { return Outcome::Object(err("bad args")) };
    peers.insert(WardPk::from_str(far).expect("checked above"), dial_at.to_owned());
    let mut m = Map::new();
    m.insert("routed", far);
    Outcome::Object(Value::Object(m))
}
