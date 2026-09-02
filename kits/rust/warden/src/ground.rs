//! The warden whole, and what a being is handed.
//!
//! [`Door`](crate::Door) is the judgment. This module is everything the paper
//! `papers/quo-truth.md` puts above it and below the host: one entry point for
//! arriving bytes, the beings held as objects, the store the records survive a
//! restart in, and the closure a being reaches Quo through.
//!
//! **Nothing here opens a socket, reads a clock or draws a random number.**
//! The clock, the randomness, the store and delivery are handed in at open, as
//! trait objects, exactly as the seeds are. That is what keeps this crate the
//! core and leaves the roads to the host.
//!
//! **[`Delivery`] is a trait here and an implementation nowhere.** Carrying
//! bytes is the host's, roads and all, including two grounds in one process:
//! a delivery that reached the far warden from inside this crate would be a
//! road the core owns. The one exception is [`Nowhere`], which carries nothing
//! and is what a warden opened without a host stands on.
//!
//! **A road never opens a seal.** [`Warden::arrive`] is the one entry point:
//! it unseals once, reads the record byte itself, pairs an answer with the ask
//! awaiting it or judges a say, and hands back bytes or silence. What a road
//! passes beside the bytes is an opaque [`Via`] token it never has to explain.

use std::collections::BTreeMap;
use std::sync::{Arc, Condvar, Mutex, MutexGuard, OnceLock};
use std::time::Duration;

use quo_arithmetic::{commitment, signing_pk};
use quo_envelope::{Allowance, Answer, Message, Method, Say};
use quo_notation::{Blueprint, Type};
use quo_wire::{Card, Invitation, Value};

use crate::{
    onward, warden_blueprint, warden_digest, Door, Estate, Inbound, Outbound, Placement, Reach,
    Refused, Resident, Route, Sketch, Verdict, Word, KEY, WARDEN_BLUEPRINT,
};

/// What a walk is born with when a being starts one of its own, rather than in
/// the course of answering a call. Each warden sets its own; this is the
/// starting point the kit offers.
pub const DEFAULT_ALLOWANCE: Allowance = Allowance {
    time: 5_000,
    hops: 8,
};

/// How many numbers below the mark a door remembers, by default.
pub const DEFAULT_WINDOW: i64 = 64;

// ---- what the host hands in ------------------------------------------

/// The reading of time, handed in. A warden never reaches for one.
pub trait Clock: Send + Sync {
    fn now(&self) -> i64;
}

impl<F: Fn() -> i64 + Send + Sync> Clock for F {
    fn now(&self) -> i64 {
        self()
    }
}

/// The draw of randomness, handed in. Every key this warden mints comes from
/// here, and nothing in this crate reaches for a generator.
pub trait Random: Send + Sync {
    fn draw(&self) -> [u8; KEY];
}

impl<F: Fn() -> [u8; KEY] + Send + Sync> Random for F {
    fn draw(&self) -> [u8; KEY] {
        self()
    }
}

/// The way back for one row, and **the whole of what delivery is given**: an
/// address and the roads that were published under it. No voice, no seq, no
/// being and nothing that was inside a seal.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Way {
    pub padlock: [u8; KEY],
    pub hints: Vec<String>,
}

/// The road a frame arrived on, as the warden holds it: **an opaque token**.
/// The warden never reads one, and hands it back to delivery beside the
/// caller's padlock so a peer that publishes nothing can be reached down the
/// line it holds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Via(pub u64);

/// What a road did with an envelope handed to it.
pub enum Carried {
    /// The road answered in its own response — the common carriage's way.
    Answer(Vec<u8>),
    /// The road carried it, and the answer will come back through the door as
    /// a frame of its own — a line's way.
    Later,
    /// Nothing carried. Weather, and the number was spent.
    Silence,
}

/// Beneath the warden, and the only thing here that reads a hint.
pub trait Delivery: Send + Sync {
    fn send(&self, way: &Way, envelope: &[u8]) -> Carried;

    /// The road this padlock's asks arrive on, learned from the warden, which
    /// is the only thing that read the padlock. Nothing comes back.
    fn arrived(&self, _padlock: &[u8; KEY], _via: Via) {}
}

/// Where the warden keeps what must survive a restart. Its shape is the
/// warden's; where it lives is the host's.
pub trait Store: Send + Sync {
    fn save(&self, snapshot: Snapshot);
    fn load(&self) -> Option<Snapshot>;
}

/// A private label beside a relation or a being held here. **Labels resolve
/// nothing and travel nowhere.**
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Label {
    /// A being minted beside this one, under this warden.
    Near { being: [u8; KEY] },
    /// A relation accepted at a far house, and what it opens.
    Far {
        warden: [u8; KEY],
        being: [u8; KEY],
        digest: [u8; KEY],
    },
}

/// Everything a restart must not lose. Beings are pointers and are not here:
/// the host holds them again on the same seeds, and the rows find them by name.
#[derive(Debug, Clone, Default)]
pub struct Snapshot {
    pub hints: Vec<String>,
    pub blueprints: Vec<String>,
    pub inbound: Vec<Inbound>,
    pub outbound: Vec<Outbound>,
    pub moved: Vec<([u8; KEY], Word)>,
    pub labels: Vec<(String, Label)>,
}

/// The store a warden gets when the host hands in none: the records live as
/// long as the process does.
#[derive(Debug, Default)]
pub struct Memory {
    kept: Mutex<Option<Snapshot>>,
}

impl Memory {
    pub fn new() -> Memory {
        Memory::default()
    }
}

impl Store for Memory {
    fn save(&self, snapshot: Snapshot) {
        *self.kept.lock().expect("the store") = Some(snapshot);
    }
    fn load(&self) -> Option<Snapshot> {
        self.kept.lock().expect("the store").clone()
    }
}

/// A delivery that carries nothing: the ground publishes no road and dials
/// none. Every send is weather.
pub struct Nowhere;

impl Delivery for Nowhere {
    fn send(&self, _way: &Way, _envelope: &[u8]) -> Carried {
        Carried::Silence
    }
}

// ---- what a being is ---------------------------------------------------

/// A being: a plain object of the developer's own, reached by the warden
/// through one method.
///
/// **The being never sees a byte and never touches a key.** Arguments arrive
/// already decoded by the blueprint's declared types, and what it answers is
/// encoded by the field's declared answer type. `None` is silence.
///
/// A field the blueprint does not declare is never reached for, so `invoke` is
/// only ever called with a name the blueprint carries.
pub trait Being: Send {
    fn invoke(&mut self, field: &str, args: &[Value], quo: &Quo) -> Option<Value>;

    /// What of this being's state moves with it. A being that provides none
    /// moves with nothing but its name and its standings.
    fn cells(&self) -> Vec<u8> {
        Vec::new()
    }

    /// And how it takes that state back.
    fn take(&mut self, _cells: &[u8]) {}
}

/// Where the judgment found the caller's voice. A fact for telling callers
/// apart, never a judgment.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Holder,
    Rotation,
    Stranger,
    /// A call from a being under this same warden, where there are no voices.
    Near,
}

/// Who is asking, offered to the being for the call in scope.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Caller {
    /// A copy, never the row. Absent on a call from under this same warden.
    pub voice: Option<[u8; KEY]>,
    pub kind: Kind,
}

// ---- the warden --------------------------------------------------------

struct Kept {
    blueprint: Arc<Blueprint>,
    object: Arc<Mutex<Box<dyn Being>>>,
}

struct State {
    door: Door,
    beings: BTreeMap<[u8; KEY], Kept>,
    labels: BTreeMap<String, Label>,
    texts: BTreeMap<[u8; KEY], String>,
}

/// What the answering side's own layer is told when the door falls silent.
/// Nothing outward changes: the wire still gets the one silence.
type Observer = Box<dyn Fn(&str) + Send + Sync>;

/// An ask out with no answer heard yet, by the far door and the number spent.
/// Those two are what an answer is paired to this house by.
type Awaiting = ([u8; KEY], i64);

struct Inner {
    state: Mutex<State>,
    clock: Arc<dyn Clock>,
    random: Arc<dyn Random>,
    store: Arc<dyn Store>,
    delivery: Arc<dyn Delivery>,
    allowance: Allowance,
    observer: Mutex<Option<Observer>>,
    /// Asks put on a road with no answer heard yet, by the far door and the
    /// number spent. The road hands whatever comes back to `arrive`, and
    /// `arrive` settles it: delivery never touches this.
    waiting: Mutex<BTreeMap<Awaiting, Option<Vec<u8>>>>,
    settled: Condvar,
}

/// The warden: the door, the beings it holds, and everything the host handed
/// in. Cloning one is holding the same warden.
#[derive(Clone)]
pub struct Warden(Arc<Inner>);

/// The seeds a warden is founded on. Every key it holds is derived from one.
#[derive(Debug, Clone)]
pub struct Seeds {
    pub name: [u8; KEY],
    pub padlock: [u8; KEY],
    pub heir: [u8; KEY],
}

impl Seeds {
    /// Three draws of the randomness the host is handing in anyway.
    pub fn drawn(random: &dyn Random) -> Seeds {
        Seeds {
            name: random.draw(),
            padlock: random.draw(),
            heir: random.draw(),
        }
    }
}

/// What a warden is opened on.
pub struct Opening {
    pub seeds: Seeds,
    pub clock: Arc<dyn Clock>,
    pub random: Arc<dyn Random>,
    pub store: Arc<dyn Store>,
    pub delivery: Arc<dyn Delivery>,
    pub hints: Vec<String>,
    /// The largest message this door will accept. Zero is no limit.
    pub limit: i64,
    pub window: i64,
    pub allowance: Allowance,
}

impl Opening {
    /// An opening with the kit's own defaults beneath: records in memory, and
    /// a delivery that carries nothing until the host puts a road in front.
    pub fn new(seeds: Seeds, clock: Arc<dyn Clock>, random: Arc<dyn Random>) -> Opening {
        Opening {
            seeds,
            clock,
            random,
            store: Arc::new(Memory::new()),
            delivery: Arc::new(Nowhere),
            hints: Vec::new(),
            limit: 0,
            window: DEFAULT_WINDOW,
            allowance: DEFAULT_ALLOWANCE,
        }
    }

    pub fn with_delivery(mut self, delivery: Arc<dyn Delivery>) -> Opening {
        self.delivery = delivery;
        self
    }

    pub fn with_store(mut self, store: Arc<dyn Store>) -> Opening {
        self.store = store;
        self
    }

    pub fn with_limit(mut self, limit: i64) -> Opening {
        self.limit = limit;
        self
    }
}

/// What holding an object costs, all of it optional but the blueprint.
#[derive(Debug, Clone, Default)]
pub struct Holding {
    pub seed: Option<[u8; KEY]>,
    pub heir_seed: Option<[u8; KEY]>,
    pub label: Option<String>,
    pub cells: Option<Vec<u8>>,
}

impl Holding {
    pub fn labelled(label: &str) -> Holding {
        Holding {
            label: Some(label.to_string()),
            ..Holding::default()
        }
    }
}

impl Warden {
    /// Open a warden on the seeds, the clock, the randomness, the store and
    /// the delivery the host hands in.
    ///
    /// What must survive a restart is read back from the store: both records,
    /// the marks, the labels and the blueprint texts. The beings themselves
    /// are pointers and cannot be stored, so the host holds them again on the
    /// same seeds and the rows find them by name.
    pub fn open(opening: Opening) -> Warden {
        let mut door = Door::new(
            opening.seeds.name,
            opening.seeds.padlock,
            commitment(
                &signing_pk(&opening.seeds.name),
                &signing_pk(&opening.seeds.heir),
            ),
            opening.limit,
            opening.window,
        );
        let mut texts = BTreeMap::new();
        texts.insert(warden_digest(), WARDEN_BLUEPRINT.to_string());
        let mut labels = BTreeMap::new();
        for hint in &opening.hints {
            door.publish(hint);
        }
        if let Some(kept) = opening.store.load() {
            for hint in kept.hints {
                door.publish(&hint);
            }
            for text in kept.blueprints {
                if let Ok(at) = quo_notation::digest(&text) {
                    texts.insert(at, text.clone());
                    if !door.blueprints.contains(&text) {
                        door.blueprints.push(text);
                    }
                }
            }
            door.inbound = kept.inbound;
            door.outbound = kept.outbound;
            door.moved = kept.moved;
            for (label, kept) in kept.labels {
                labels.insert(label, kept);
            }
        }
        Warden(Arc::new(Inner {
            state: Mutex::new(State {
                door,
                beings: BTreeMap::new(),
                labels,
                texts,
            }),
            clock: opening.clock,
            random: opening.random,
            store: opening.store,
            delivery: opening.delivery,
            allowance: opening.allowance,
            observer: Mutex::new(None),
            waiting: Mutex::new(BTreeMap::new()),
            settled: Condvar::new(),
        }))
    }

    fn state(&self) -> MutexGuard<'_, State> {
        self.0.state.lock().expect("the warden")
    }

    /// This warden's name, which is also its public being's pk.
    pub fn name(&self) -> [u8; KEY] {
        self.state().door.name
    }

    /// The roads this ground publishes.
    pub fn hints(&self) -> Vec<String> {
        self.state().door.hints.clone()
    }

    /// A road is told to the warden rather than fixed at birth: a door on an
    /// ephemeral port has no address until it is listening.
    pub fn publish(&self, hint: &str) {
        let mut state = self.state();
        state.door.publish(hint);
        self.keep(&state);
    }

    /// A road that has stopped carrying is not a road.
    pub fn retract(&self, hint: &str) {
        let mut state = self.state();
        state.door.retract(hint);
        self.keep(&state);
    }

    /// The inward view of silence. The stranger across the wire meets the same
    /// nothing it always did; this is the house talking to itself.
    pub fn observe(&self, observer: impl Fn(&str) + Send + Sync + 'static) {
        *self.0.observer.lock().expect("the observer") = Some(Box::new(observer));
    }

    fn hush<T>(&self, why: &str) -> Option<T> {
        if let Some(observer) = self.0.observer.lock().expect("the observer").as_ref() {
            observer(why);
        }
        None
    }

    fn keep(&self, state: &State) {
        self.0.store.save(Snapshot {
            hints: state.door.hints.clone(),
            blueprints: state.door.blueprints.clone(),
            inbound: state.door.inbound.clone(),
            outbound: state.door.outbound.clone(),
            moved: state.door.moved.clone(),
            labels: state
                .labels
                .iter()
                .map(|(label, kept)| (label.clone(), kept.clone()))
                .collect(),
        });
    }

    // ---- what a being is given -------------------------------------

    /// The closure for a being starting a walk of its own, from an event or a
    /// clock rather than an arriving call: no caller, and the warden's own
    /// default allowance.
    pub fn quo(&self, being: [u8; KEY]) -> Quo {
        Quo {
            warden: self.clone(),
            being,
            caller: None,
            leash: self.0.allowance,
            arrival: self.0.clock.now(),
        }
    }

    /// Hold an object: mint its keys, learn its blueprint, and keep the
    /// pointer. The object is a plain class and stays one.
    pub fn hold(
        &self,
        object: impl Being + 'static,
        blueprint: &str,
        holding: Holding,
    ) -> Option<([u8; KEY], Handle)> {
        let parsed = quo_notation::parse(blueprint).ok()?;
        let digest = parsed.digest();
        let seed = holding.seed.unwrap_or_else(|| self.0.random.draw());
        let heir_seed = holding.heir_seed.unwrap_or_else(|| self.0.random.draw());
        let being = signing_pk(&seed);
        let parsed = Arc::new(parsed);
        let mut state = self.state();
        let door_name = state.door.name;
        let mut object: Box<dyn Being> = Box::new(object);
        if let Some(cells) = holding.cells.as_ref() {
            object.take(cells);
        }
        let cells = object.cells();
        state.door.beings.retain(|held| held.being != being);
        state.door.beings.push(Resident {
            being,
            digest,
            commitment: commitment(&door_name, &signing_pk(&heir_seed)),
            cells,
        });
        if !state.door.blueprints.iter().any(|held| held == blueprint) {
            state.door.blueprints.push(blueprint.to_string());
        }
        state.texts.insert(digest, blueprint.to_string());
        state.beings.insert(
            being,
            Kept {
                blueprint: parsed.clone(),
                object: Arc::new(Mutex::new(object)),
            },
        );
        if let Some(label) = holding.label {
            state.labels.insert(label, Label::Near { being });
        }
        self.keep(&state);
        drop(state);
        Some((
            being,
            Handle {
                warden: self.clone(),
                being,
                blueprint: parsed,
                at: None,
                leash: None,
            },
        ))
    }

    /// Release a being: drop the pointer, and every standing at it goes.
    pub fn release(&self, being: [u8; KEY]) -> bool {
        let mut state = self.state();
        if state.beings.remove(&being).is_none() {
            return false;
        }
        state.door.beings.retain(|held| held.being != being);
        let mut at = 0;
        while at < state.door.inbound.len() {
            state.door.inbound[at].beings.retain(|held| held != &being);
            if state.door.inbound[at].beings.is_empty() {
                state.door.inbound.remove(at);
            } else {
                at += 1;
            }
        }
        state
            .labels
            .retain(|_, kept| kept != &Label::Near { being });
        self.keep(&state);
        true
    }

    /// Who holds a place at this being, **as voices only**. Marks, windows,
    /// padlocks and hints stay at the door.
    pub fn standings(&self, being: [u8; KEY]) -> Vec<[u8; KEY]> {
        self.state()
            .door
            .inbound
            .iter()
            .filter(|row| row.beings.contains(&being))
            .map(|row| row.voice)
            .collect()
    }

    /// Grant: mint a voice, write the inbound row, hand out the invitation.
    /// **A grant names the being it opens.**
    pub fn grant(&self, being: [u8; KEY]) -> Option<Invitation> {
        let mut state = self.state();
        if !state.door.beings.iter().any(|held| held.being == being) {
            return None;
        }
        let voice = signing_pk(&self.0.random.draw());
        let heir_secret = self.0.random.draw();
        let heir = signing_pk(&heir_secret);
        let name = state.door.name;
        state.door.inbound.push(Inbound {
            voice,
            commitment: commitment(&name, &heir),
            minted_at: name,
            beings: vec![being],
            mark: 0,
            spent: Vec::new(),
            padlock: None,
            hints: Vec::new(),
        });
        let invitation = Invitation {
            warden: name,
            commitment: state
                .door
                .beings
                .iter()
                .find(|held| held.being == name)
                .map(|held| held.commitment)
                .unwrap_or([0u8; KEY]),
            padlock: state.door.padlock,
            heir,
            heir_secret,
            hints: state.door.hints.clone(),
        };
        self.keep(&state);
        Some(invitation)
    }

    /// Amend a standing: the warden adds a being to a voice's row or takes one
    /// away. **Taking the last being away is release**, and there is no
    /// separate act for it.
    pub fn amend(&self, voice: [u8; KEY], add: &[[u8; KEY]], remove: &[[u8; KEY]]) -> bool {
        let mut state = self.state();
        let mut moved = false;
        for being in add {
            moved |= state.door.widen(&voice, being).is_ok();
        }
        for being in remove {
            moved |= state.door.narrow(&voice, being).is_ok();
        }
        self.keep(&state);
        moved
    }

    /// A handle by its private label. **Nothing resolves a label but this.**
    pub fn relation(&self, label: &str) -> Option<Handle> {
        self.relation_leashed(label, None)
    }

    fn relation_leashed(&self, label: &str, leash: Option<(Allowance, i64)>) -> Option<Handle> {
        let state = self.state();
        match state.labels.get(label)?.clone() {
            Label::Near { being } => {
                let held = state.beings.get(&being)?;
                Some(Handle {
                    warden: self.clone(),
                    being,
                    blueprint: held.blueprint.clone(),
                    at: None,
                    leash,
                })
            }
            Label::Far {
                warden,
                being,
                digest,
            } => {
                let at = state
                    .door
                    .outbound
                    .iter()
                    .position(|row| row.warden == warden)?;
                let text = state.texts.get(&digest)?;
                let blueprint = Arc::new(quo_notation::parse(text).ok()?);
                Some(Handle {
                    warden: self.clone(),
                    being,
                    blueprint,
                    at: Some(at),
                    leash,
                })
            }
        }
    }

    // ---- the one entry point ---------------------------------------

    /// **One entry point for anything a road brings.** It unseals once, reads
    /// the record byte itself, and either pairs an answer with the ask
    /// awaiting it — answering the road nothing — or judges a say and answers
    /// the road bytes or silence.
    ///
    /// `via` is the road the bytes came on, opaque to the warden and handed
    /// back to delivery beside the caller's padlock once the way back has been
    /// refreshed.
    pub fn arrive(&self, envelope: &[u8], via: Option<Via>) -> Option<Vec<u8>> {
        let opened = {
            let state = self.state();
            // The published limit binds on every road, so it is judged before
            // anything is unsealed. A door whose limit was enforced by its
            // line alone would accept over distance zero exactly what it told
            // every caller it would refuse.
            if state.door.limit > 0 && envelope.len() as i64 > state.door.limit {
                return self.hush("over the limit");
            }
            quo_envelope::open(&state.door.padlock_secret, envelope)
        };
        match opened {
            Err(_) => self.hush("not ours"),
            Ok(Message::Answer(answer)) => {
                self.settle(answer, envelope);
                None
            }
            Ok(Message::Say(say)) => self.judge(say, via),
        }
    }

    /// An answer arriving through the door, handed to whichever ask is
    /// awaiting it. The road gets nothing back.
    fn settle(&self, answer: Answer, envelope: &[u8]) {
        let key = (answer.warden, answer.seq);
        let mut waiting = self.0.waiting.lock().expect("the asks awaiting");
        if let Some(slot) = waiting.get_mut(&key) {
            *slot = Some(envelope.to_vec());
            self.0.settled.notify_all();
        }
    }

    fn judge(&self, say: Say, via: Option<Via>) -> Option<Vec<u8>> {
        let arrival = self.0.clock.now();
        let mut state = self.state();
        let padlock = say.padlock;
        let verdict = match state.door.judge_say(say, arrival) {
            Ok(verdict) => verdict,
            Err(Refused(why)) => return self.hush(&why),
        };
        self.keep(&state);
        drop(state);
        // Delivery learns the road this padlock's asks arrive on, as an
        // address beside an opaque token. It is told nothing else.
        if let Some(via) = via {
            self.0.delivery.arrived(&padlock, via);
        }
        match &verdict.route {
            Route::Being { being, method } => self.serve(&verdict, *being, method.clone()),
            _ => {
                let mint = [self.0.random.draw(), self.0.random.draw()];
                let mut state = self.state();
                let data = match state.door.answer(&verdict, Some(&mint)) {
                    Ok(data) => data,
                    Err(Refused(why)) => return self.hush(&why),
                };
                self.keep(&state);
                self.reply(&mut state, &verdict, data)
            }
        }
    }

    /// The being's own answer, which is not the warden's. The warden decodes
    /// the arguments by the blueprint, hands them over, and encodes what comes
    /// back — so what must be bytes at the wire is made so here, never by the
    /// being.
    fn serve(&self, verdict: &Verdict, being: [u8; KEY], method: Method) -> Option<Vec<u8>> {
        let state = self.state();
        let Some(held) = state.beings.get(&being) else {
            return self.hush("no such being");
        };
        let blueprint = held.blueprint.clone();
        let object = held.object.clone();
        drop(state);

        // The blueprint is the scope: a name it never declared is not reached
        // for on the object at all.
        let Some(field) = blueprint.fields.iter().find(|f| f.name == method.name) else {
            return self.hush("a field the blueprint does not declare");
        };
        let types: Vec<Type> = field.arguments.iter().map(|a| a.ty.clone()).collect();
        let Ok(args) = quo_wire::decode_all(&blueprint, &types, &method.args) else {
            return self.hush("arguments that are not what the field declares");
        };
        let kind = match verdict.place {
            Placement::Ask { .. } => Kind::Holder,
            Placement::Rotation { .. } => Kind::Rotation,
            _ => Kind::Stranger,
        };
        let quo = Quo {
            warden: self.clone(),
            being,
            caller: Some(Caller {
                voice: Some(verdict.say.voice),
                kind,
            }),
            leash: verdict.leash,
            arrival: verdict.arrival,
        };
        let answered = object
            .lock()
            .expect("the being")
            .invoke(&field.name, &args, &quo);
        let data = match (&field.answers, answered) {
            (None, _) => None,
            (Some(_), None) => {
                return self.hush("a being that answered nothing to a field that answers")
            }
            (Some(ty), Some(value)) => match quo_wire::encode(&blueprint, ty, &value) {
                Ok(bytes) => Some(bytes),
                Err(_) => return self.hush("an answer that is not what the field declares"),
            },
        };
        let mut state = self.state();
        self.reply(&mut state, verdict, data)
    }

    fn reply(
        &self,
        state: &mut State,
        verdict: &Verdict,
        data: Option<Vec<u8>>,
    ) -> Option<Vec<u8>> {
        match state.door.reply(&verdict.say, data, &self.0.random.draw()) {
            Ok(bytes) => Some(bytes),
            Err(Refused(why)) => self.hush(&why),
        }
    }

    // ---- the caller's side -----------------------------------------

    /// The address this ground hands a stranger: what a card is, and the whole
    /// of it. Nothing here is a standing, so handing one out opens nothing.
    pub fn card(&self) -> Card {
        let state = self.state();
        Card {
            warden: state.door.name,
            commitment: state
                .door
                .beings
                .iter()
                .find(|held| held.being == state.door.name)
                .map(|held| held.commitment)
                .unwrap_or([0u8; KEY]),
            padlock: state.door.padlock,
            hints: state.door.hints.clone(),
        }
    }

    /// Accept an invitation, **with the double rotation done inside and
    /// impossible to forget**.
    ///
    /// Whoever minted the voice has seen its keys, so the holder's first two
    /// acts are rotations onto keys nobody else has ever seen. Then the estate
    /// is described, and **a standing names beings, so accepting one answers a
    /// handle per being it names** — each with its own class's blueprint, so
    /// the holder can tell which handle is which being.
    pub fn accept(&self, invitation: &Invitation) -> Vec<Handle> {
        self.accept_for(invitation, None)
    }

    fn accept_for(&self, invitation: &Invitation, holder: Option<[u8; KEY]>) -> Vec<Handle> {
        let at = {
            let mut state = self.state();
            let at = state.door.remember(invitation);
            if let Some(being) = holder {
                let _ = state.door.holds(at, being);
            }
            at
        };
        let reach = Reach {
            allowance: self.0.allowance,
            hints: self.hints(),
            ..Reach::default()
        };
        // Two rotations, both onto keys nobody else has ever seen. The second
        // names no being and no method, so it is answered with the estate:
        // what this standing may reach.
        if self.rotate(at, &reach).is_none() {
            return Vec::new();
        }
        let Some(second) = self.rotate(at, &reach) else {
            return Vec::new();
        };
        let Some(estate) = read_own("describe", second.data.as_deref())
            .and_then(|value| crate::shape::as_estate(&value).ok())
        else {
            return Vec::new();
        };
        self.handles(at, &estate)
    }

    /// **A standing widened later is re-read from the far door rather than
    /// remembered**: the estate is described again down the relation this
    /// handle spends, and what it names now comes back as handles.
    pub fn reread(&self, handle: &Handle) -> Vec<Handle> {
        let Some(at) = handle.at else {
            return Vec::new();
        };
        let Some(estate) = self
            .own_ask(at, "describe", Vec::new(), self.0.allowance)
            .and_then(|value| crate::shape::as_estate(&value).ok())
        else {
            return Vec::new();
        };
        self.handles(at, &estate)
    }

    /// A handle for every being a described estate names, **the far door's own
    /// public being apart**: a standing names beings, and the public being is
    /// what a knock reaches.
    fn handles(&self, at: usize, estate: &Estate) -> Vec<Handle> {
        let Some(far) = self.state().door.outbound.get(at).map(|row| row.warden) else {
            return Vec::new();
        };
        let mut handles = Vec::new();
        for class in &estate.classes {
            let named: Vec<&crate::Held> = class
                .beings
                .iter()
                .filter(|held| held.being != far)
                .collect();
            if named.is_empty() {
                continue;
            }
            let Some(blueprint) = self.text_for(at, class.digest) else {
                continue;
            };
            for held in named {
                {
                    let mut state = self.state();
                    let _ = state.door.note(at, held.being, held.commitment);
                    self.keep(&state);
                }
                handles.push(Handle {
                    warden: self.clone(),
                    being: held.being,
                    blueprint: blueprint.clone(),
                    at: Some(at),
                    leash: None,
                });
            }
        }
        handles
    }

    /// The blueprint of one class: what this door already holds under that
    /// digest, or the text the far door answers when asked for it. A blueprint
    /// is its digest, so what is held under one is the same text everywhere.
    fn text_for(&self, at: usize, digest: [u8; KEY]) -> Option<Arc<Blueprint>> {
        if let Some(text) = self.state().texts.get(&digest).cloned() {
            return quo_notation::parse(&text).ok().map(Arc::new);
        }
        let args = own_args("blueprint", &Value::B32(digest))?;
        let text = match self.own_ask(at, "blueprint", args, self.0.allowance)? {
            Value::Maybe(Some(held)) => match *held {
                Value::Text(text) => text,
                _ => return None,
            },
            _ => return None,
        };
        let parsed = quo_notation::parse(&text).ok()?;
        let mut state = self.state();
        state.texts.insert(digest, text.clone());
        if !state.door.blueprints.contains(&text) {
            state.door.blueprints.push(text);
        }
        self.keep(&state);
        Some(Arc::new(parsed))
    }

    /// A card turned into a handle at the far door's public being, **held as a
    /// stranger**: the voice is minted here and stands nowhere over there, so
    /// what this handle is shown is what that door shows a stranger.
    pub fn knock(&self, card: &Card) -> Option<Handle> {
        self.knock_for(card, None)
    }

    fn knock_for(&self, card: &Card, holder: Option<[u8; KEY]>) -> Option<Handle> {
        let voice = self.0.random.draw();
        let heir = self.0.random.draw();
        let at = {
            let mut state = self.state();
            let at = state.door.stranger(card, voice, heir);
            if let Some(being) = holder {
                let _ = state.door.holds(at, being);
            }
            self.keep(&state);
            at
        };
        let estate = self
            .own_ask(at, "describe", Vec::new(), self.0.allowance)
            .and_then(|value| crate::shape::as_estate(&value).ok())?;
        // The estate a stranger is shown is the far door's public being, whose
        // pk is that door's own name. A door that showed none is a door that
        // answered something else.
        estate
            .classes
            .iter()
            .flat_map(|class| class.beings.iter())
            .find(|held| held.being == card.warden)?;
        Some(Handle {
            warden: self.clone(),
            being: card.warden,
            blueprint: own_blueprint(),
            at: Some(at),
            leash: None,
        })
    }

    /// Keep a private label beside a handle. **One label names one handle**,
    /// because a standing may name several beings and a label that pointed at
    /// a standing would resolve to none of them.
    pub fn label(&self, label: &str, handle: &Handle) -> bool {
        let mut state = self.state();
        let kept = match handle.at {
            None => Label::Near {
                being: handle.being,
            },
            Some(at) => {
                let Some(row) = state.door.outbound.get(at) else {
                    return false;
                };
                Label::Far {
                    warden: row.warden,
                    being: handle.being,
                    digest: handle.blueprint.digest(),
                }
            }
        };
        if let Label::Far { digest, .. } = &kept {
            if !state.texts.contains_key(digest) {
                return false;
            }
        }
        state.labels.insert(label.to_string(), kept);
        self.keep(&state);
        true
    }

    /// One field of the far door's own blueprint, asked down a relation: the
    /// describe, the sketch, a blueprint by digest, or the limit. Every one is
    /// an ordinary ask and answers a value or silence.
    fn own_ask(
        &self,
        at: usize,
        field: &str,
        args: Vec<u8>,
        allowance: Allowance,
    ) -> Option<Value> {
        let asked = self.spend(
            at,
            &Reach {
                method: Some(Method {
                    name: field.to_string(),
                    args,
                }),
                allowance,
                hints: self.hints(),
                ..Reach::default()
            },
        )?;
        read_own(field, asked.data.as_deref())
    }

    fn rotate(&self, at: usize, reach: &Reach) -> Option<Answer> {
        let next = self.0.random.draw();
        let ephemeral = self.0.random.draw();
        let composed = {
            let mut state = self.state();
            state.door.rotate(at, &ephemeral, &next, reach).ok()
        }?;
        self.put(at, composed.0, composed.1)
    }

    fn spend(&self, at: usize, reach: &Reach) -> Option<Answer> {
        let ephemeral = self.0.random.draw();
        let composed = {
            let mut state = self.state();
            state.door.ask(at, &ephemeral, reach).ok()
        }?;
        self.put(at, composed.0, composed.1)
    }

    /// Hand a composed envelope to delivery and wait for whatever answers it.
    /// **`seal` and `send` are two halves apart**, so a caller that met
    /// silence can resend the identical envelope: this is the second half.
    fn put(&self, at: usize, envelope: Vec<u8>, seq: i64) -> Option<Answer> {
        let (way, far, deadline) = {
            let state = self.state();
            let row = state.door.outbound.get(at)?;
            (
                Way {
                    padlock: row.padlock,
                    hints: row.hints.clone(),
                },
                row.warden,
                self.0.allowance.time,
            )
        };
        let key = (far, seq);
        self.0
            .waiting
            .lock()
            .expect("the asks awaiting")
            .insert(key, None);
        let back = self.0.delivery.send(&way, &envelope);
        let bytes = match back {
            // A road that answers in its own response has answered: bytes, or
            // the empty body that is silence's wire form.
            Carried::Answer(bytes) if bytes.is_empty() => None,
            Carried::Answer(bytes) => Some(bytes),
            Carried::Silence => None,
            // A road that answers through the door: wait for the frame.
            Carried::Later => self.wait(key, deadline),
        };
        self.0
            .waiting
            .lock()
            .expect("the asks awaiting")
            .remove(&key);
        match bytes {
            None => {
                let mut state = self.state();
                state.door.forgo(at, seq);
                None
            }
            Some(bytes) => {
                let mut state = self.state();
                match state.door.hear(at, &bytes) {
                    Ok(answer) => Some(answer),
                    Err(Refused(why)) => self.hush(&why),
                }
            }
        }
    }

    /// Wait for the answer to an ask a road carried but did not answer.
    ///
    /// **The deadline is measured by the clock the host handed in**, never by
    /// one this crate reached for: the caller's own budget is the caller's,
    /// and a warden that read a machine here would be a warden a bench could
    /// not reproduce.
    fn wait(&self, key: Awaiting, deadline: i64) -> Option<Vec<u8>> {
        let patience = Duration::from_millis(deadline.max(0) as u64);
        let mut waiting = self.0.waiting.lock().expect("the asks awaiting");
        loop {
            match waiting.get(&key) {
                Some(Some(bytes)) => return Some(bytes.clone()),
                // Nothing awaits it any more, so nothing will settle it.
                None => return None,
                Some(None) => {}
            }
            let (again, timed) = self
                .0
                .settled
                .wait_timeout(waiting, patience)
                .expect("the asks awaiting");
            waiting = again;
            if timed.timed_out() {
                return match waiting.get(&key) {
                    Some(Some(bytes)) => Some(bytes.clone()),
                    _ => None,
                };
            }
        }
    }
}

/// A field of the warden's own blueprint, read back from an answer's data.
fn read_own(field: &str, data: Option<&[u8]>) -> Option<Value> {
    let field = crate::shape::field(field).ok()?;
    let ty = field.answers.as_ref()?;
    quo_wire::decode(warden_blueprint(), ty, data?).ok()
}

/// The one argument a field of the warden's own blueprint takes, written by
/// the type that field declares for it.
fn own_args(field: &str, value: &Value) -> Option<Vec<u8>> {
    let field = crate::shape::field(field).ok()?;
    let declared = field.arguments.first()?;
    quo_wire::encode(warden_blueprint(), &declared.ty, value).ok()
}

/// The warden's own blueprint as a handle holds one. It is the same text on
/// every ground in the world, so one parse serves them all.
fn own_blueprint() -> Arc<Blueprint> {
    static HELD: OnceLock<Arc<Blueprint>> = OnceLock::new();
    HELD.get_or_init(|| Arc::new(warden_blueprint().clone()))
        .clone()
}

// ---- what a being receives --------------------------------------------

/// The being's whole API to Quo: **facts and acts, never a judgment.**
///
/// It is handed to every call the warden invokes, and a being that starts a
/// walk of its own takes one from [`Warden::quo`]. Nothing on it is a key, a
/// seal or a road.
pub struct Quo {
    warden: Warden,
    being: [u8; KEY],
    caller: Option<Caller>,
    leash: Allowance,
    arrival: i64,
}

impl Quo {
    /// Which being this is the closure of.
    pub fn being(&self) -> [u8; KEY] {
        self.being
    }

    /// Who is asking, for the call in scope: the verified voice and the kind
    /// the judgment found. **A fact for telling callers apart, never a
    /// judgment** — permission lives in the warden's record alone.
    pub fn caller(&self) -> Option<&Caller> {
        self.caller.as_ref()
    }

    /// The leash for the call in scope, as it arrived. A being hands it on and
    /// never widens one.
    pub fn leash(&self) -> Allowance {
        self.leash
    }

    /// Who holds a place at me, as voices only.
    pub fn standings(&self) -> Vec<[u8; KEY]> {
        self.warden.standings(self.being)
    }

    /// A handle at a being elsewhere, under a private label of my own.
    pub fn relation(&self, label: &str) -> Option<Handle> {
        self.warden
            .relation_leashed(label, Some((self.leash, self.arrival)))
    }

    /// Open this being, or another beside it, to somebody.
    pub fn grant(&self, being: [u8; KEY]) -> Option<Invitation> {
        self.warden.grant(being)
    }

    /// Widen or narrow a standing.
    pub fn amend(&self, voice: [u8; KEY], add: &[[u8; KEY]], remove: &[[u8; KEY]]) -> bool {
        self.warden.amend(voice, add, remove)
    }

    /// Take a being away, and every standing at it with it.
    pub fn release(&self, being: [u8; KEY]) -> bool {
        self.warden.release(being)
    }

    /// An invitation received as data, turned into handles — one per being the
    /// standing names, with the double rotation done inside.
    pub fn accept(&self, invitation: &Invitation) -> Vec<Handle> {
        self.warden.accept_for(invitation, Some(self.being))
    }

    /// A card received as data, turned into a handle at the far door's public
    /// being, held as a stranger.
    pub fn knock(&self, card: &Card) -> Option<Handle> {
        self.warden.knock_for(card, Some(self.being))
    }

    /// Keep a private label of my own beside a handle.
    pub fn label(&self, label: &str, handle: &Handle) -> bool {
        self.warden.label(label, handle)
    }

    /// Read a standing again at the far door, so a being widened into it after
    /// the accept comes back as a handle.
    pub fn reread(&self, handle: &Handle) -> Vec<Handle> {
        self.warden.reread(handle)
    }

    /// A smaller being minted beside me. The minting being owns what it
    /// minted.
    pub fn hold(
        &self,
        object: impl Being + 'static,
        blueprint: &str,
        holding: Holding,
    ) -> Option<([u8; KEY], Handle)> {
        self.warden.hold(object, blueprint, holding)
    }

    /// The warden beneath, for a being that mints its own beings and grants at
    /// them. It is the same warden and nothing more of it is reachable.
    pub fn warden(&self) -> &Warden {
        &self.warden
    }
}

// ---- the handle --------------------------------------------------------

/// One ask composed and not yet sent. **A caller that met silence resends the
/// identical envelope, never a fresh one**: every message spends a number
/// once, so the far door either already honoured that number and answers the
/// resend with silence, or never saw it and honours it now.
#[derive(Debug, Clone)]
pub struct Sealed {
    pub envelope: Vec<u8>,
    pub seq: i64,
    field: String,
}

/// A handle at a being: **every declared field callable, answering a value or
/// silence**.
///
/// A handle at a being under this same warden has one shape with the handle at
/// a being across an ocean — leashed, and able to fall silent — and pays no
/// seal and no judgment, because under one warden there are no strangers and
/// no voices.
#[derive(Clone)]
pub struct Handle {
    warden: Warden,
    being: [u8; KEY],
    blueprint: Arc<Blueprint>,
    /// The relation this handle spends, or `None` for a being under this same
    /// warden.
    at: Option<usize>,
    /// The leash the call this handle was taken in arrived with, and the
    /// reading that call arrived at.
    leash: Option<(Allowance, i64)>,
}

impl Handle {
    pub fn being(&self) -> [u8; KEY] {
        self.being
    }

    /// The fields this handle's blueprint declares.
    pub fn fields(&self) -> Vec<String> {
        self.blueprint
            .fields
            .iter()
            .map(|field| field.name.clone())
            .collect()
    }

    /// Call a declared field. A field the blueprint does not declare is
    /// silence, exactly as a refusal is.
    pub fn call(&self, field: &str, args: &[Value]) -> Option<Value> {
        match self.at {
            None => self.near(field, args),
            Some(_) => self.send(&self.seal(field, args)?),
        }
    }

    /// The estate the far door shows this voice. **It is what the row names
    /// and never the rest of that house**, because the answer is composed
    /// there against the standing this handle spends.
    ///
    /// A handle at a being under this same warden answers the house's own
    /// estate: inside one warden there are no voices and nothing to withhold.
    pub fn describe(&self) -> Option<Estate> {
        match self.at {
            None => Some(self.warden.state().door.own_estate()),
            Some(at) => {
                let value = self
                    .warden
                    .own_ask(at, "describe", Vec::new(), self.allowance()?)?;
                crate::shape::as_estate(&value).ok()
            }
        }
    }

    /// This being's own sketch: its pk, the digest of its blueprint, and its
    /// heir commitment.
    pub fn sketch(&self) -> Option<Sketch> {
        match self.at {
            None => self.warden.state().door.own_sketch(&self.being),
            Some(at) => {
                let args = own_args("sketch", &Value::Being(self.being))?;
                match self.warden.own_ask(at, "sketch", args, self.allowance()?)? {
                    Value::Maybe(Some(held)) => crate::shape::as_sketch(&held).ok(),
                    _ => None,
                }
            }
        }
    }

    /// A blueprint by its digest, as the far door holds it.
    pub fn blueprint(&self, digest: [u8; KEY]) -> Option<String> {
        match self.at {
            None => self.warden.state().texts.get(&digest).cloned(),
            Some(at) => {
                let args = own_args("blueprint", &Value::B32(digest))?;
                match self
                    .warden
                    .own_ask(at, "blueprint", args, self.allowance()?)?
                {
                    Value::Maybe(Some(held)) => match *held {
                        Value::Text(text) => Some(text),
                        _ => None,
                    },
                    _ => None,
                }
            }
        }
    }

    /// The largest message the far door accepts, which is the one fact the law
    /// makes a warden publish about itself.
    pub fn limit(&self) -> Option<i64> {
        match self.at {
            None => Some(self.warden.state().door.limit),
            Some(at) => match self
                .warden
                .own_ask(at, "limit", Vec::new(), self.allowance()?)?
            {
                Value::Int(held) => Some(held),
                _ => None,
            },
        }
    }

    /// What this call may spend: the leash in scope, shrunk by a hop and by
    /// this door's dwell, or the warden's default when a being starts a walk
    /// of its own.
    fn allowance(&self) -> Option<Allowance> {
        match self.leash {
            None => Some(self.warden.0.allowance),
            Some((arrived, at)) => onward(&arrived, at, self.warden.0.clock.now()),
        }
    }

    fn field(&self, name: &str) -> Option<&quo_notation::Field> {
        self.blueprint
            .fields
            .iter()
            .find(|field| field.name == name)
    }

    /// Compose the ask without sending it.
    pub fn seal(&self, field: &str, args: &[Value]) -> Option<Sealed> {
        let at = self.at?;
        let declared = self.field(field)?;
        let types: Vec<Type> = declared.arguments.iter().map(|a| a.ty.clone()).collect();
        let blob = quo_wire::encode_all(&self.blueprint, &types, args).ok()?;
        let allowance = self.allowance()?;
        let ephemeral = self.warden.0.random.draw();
        let reach = Reach {
            being: Some(self.being),
            method: Some(Method {
                name: field.to_string(),
                args: blob,
            }),
            allowance,
            hints: self.warden.hints(),
            ..Reach::default()
        };
        let mut state = self.warden.state();
        let (envelope, seq) = state.door.ask(at, &ephemeral, &reach).ok()?;
        Some(Sealed {
            envelope,
            seq,
            field: field.to_string(),
        })
    }

    /// Send an ask already composed, and read whatever answers it.
    pub fn send(&self, sealed: &Sealed) -> Option<Value> {
        let at = self.at?;
        {
            let mut state = self.warden.state();
            let padlock = state.door.padlock;
            if let Some(row) = state.door.outbound.get_mut(at) {
                row.awaiting.insert((padlock, sealed.seq));
            }
        }
        let answer = self.warden.put(at, sealed.envelope.clone(), sealed.seq)?;
        let declared = self.field(&sealed.field)?;
        let ty = declared.answers.as_ref()?;
        quo_wire::decode(&self.blueprint, ty, answer.data.as_deref()?).ok()
    }

    /// A call to a being under this same warden. **One shape**: leashed, and a
    /// value or silence — and no seal, because there are no strangers here.
    /// The value still rides through the codec, so a being cannot answer a
    /// neighbour what it could not answer a stranger.
    fn near(&self, field: &str, args: &[Value]) -> Option<Value> {
        let declared = self.field(field)?.clone();
        let types: Vec<Type> = declared.arguments.iter().map(|a| a.ty.clone()).collect();
        let blob = quo_wire::encode_all(&self.blueprint, &types, args).ok()?;
        let allowance = self.allowance()?;
        let (object, blueprint) = {
            let state = self.warden.state();
            let held = state.beings.get(&self.being)?;
            (held.object.clone(), held.blueprint.clone())
        };
        let values = quo_wire::decode_all(&blueprint, &types, &blob).ok()?;
        let quo = Quo {
            warden: self.warden.clone(),
            being: self.being,
            caller: Some(Caller {
                voice: None,
                kind: Kind::Near,
            }),
            leash: allowance,
            arrival: self.warden.0.clock.now(),
        };
        let answered = object
            .lock()
            .expect("the being")
            .invoke(&declared.name, &values, &quo);
        let ty = declared.answers.as_ref()?;
        let bytes = quo_wire::encode(&blueprint, ty, &answered?).ok()?;
        quo_wire::decode(&blueprint, ty, &bytes).ok()
    }
}

// ---- reading what a call answered -------------------------------------

/// The plain value behind an answer, where the caller knows what it asked for.
/// Each is silence when the answer was silence or was not of that type.
pub fn as_bool(value: Option<Value>) -> Option<bool> {
    match value? {
        Value::Bool(held) => Some(held),
        _ => None,
    }
}

pub fn as_int(value: Option<Value>) -> Option<i64> {
    match value? {
        Value::Int(held) => Some(held),
        _ => None,
    }
}

pub fn as_text(value: Option<Value>) -> Option<String> {
    match value? {
        Value::Text(held) => Some(held),
        _ => None,
    }
}

pub fn as_bytes(value: Option<Value>) -> Option<Vec<u8>> {
    match value? {
        Value::Bytes(held) => Some(held),
        _ => None,
    }
}

pub fn as_invitation(value: Option<Value>) -> Option<Invitation> {
    match value? {
        Value::Invitation(held) => Some(held),
        _ => None,
    }
}

/// An optional the field declared: absent is a legal answer and is not
/// silence, so it comes back as `Some(None)`.
pub fn as_maybe(value: Option<Value>) -> Option<Option<Value>> {
    match value? {
        Value::Maybe(held) => Some(held.map(|inner| *inner)),
        _ => None,
    }
}
