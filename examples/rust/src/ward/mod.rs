// SPDX-License-Identifier: Apache-2.0
//! The ward, chapters 2, 4 and 5: its seed and its partition, with one door.
//! It keeps every being it booted, builds every stance, mints every key,
//! seals every ask that leaves and judges every one that arrives.

mod answer;
mod asker;
mod cells;
mod door;
mod partition;
mod root;
mod send;
mod stance;

pub use answer::Answer;
pub use asker::{is_reserved, Asker, ROOT};
pub use cells::{Cells, OccupantRecord, StandingRecord, WARD_KEYS};
pub(crate) use partition::{Bind, Heir, KnockKeys, StandingKeys};
pub use partition::{Partition, SPAN};
pub use stance::Stance;

use crate::arithmetic::{self, WardKey, LOCK_SEED_LEN};
use crate::hex::{hex, unhex};
use crate::seal::{Invitation, Seed, WardPk};
use crate::value::{Map, Value};
use std::cell::RefCell;
use std::collections::{BTreeMap, BTreeSet};
use std::rc::{Rc, Weak};
use std::sync::Arc;
use std::time::{Duration, Instant};

/// A being did not answer: an answer that ended without one. An `Err` from her
/// `answer`, and a panic, are both one.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Thrown(pub String);

impl<E: std::error::Error> From<E> for Thrown {
    fn from(e: E) -> Thrown {
        Thrown(e.to_string())
    }
}

/// A being: one ordinary object with one voice. The ward calls `answer`, and
/// nothing else. `method` absent is the empty ask, and what she answers to it
/// is her blueprint. Args are always one object: absent args are handed to
/// her as the empty object.
pub trait Being {
    fn answer(&self, asker: &Asker, method: Option<&str>, args: &Map) -> Result<Answer, Thrown>;
}

/// Why instantiate made nobody.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Unmade {
    /// The harbor holds no class of that name.
    NoClass,
    /// The class threw at birth.
    Threw(Thrown),
}

/// The ground, less the seed and the partition, which are handed beside it.
pub trait Ground {
    /// A class name and a stance in, the being or nothing out.
    fn instantiate(&self, class: &str, stance: Stance) -> Result<Box<dyn Being>, Unmade>;
    /// The ward of this pk, when it runs in this process: its door is reached
    /// on the asker's stack, as the ward's own door is.
    fn door(&self, _ward: &WardPk) -> Option<Ward> {
        None
    }
    /// The carrier, taken once at birth. `None` carries nowhere.
    fn carrier(&self) -> Option<Arc<dyn Carrier>> {
        None
    }
    /// That many bytes of entropy.
    fn random(&self, count: usize) -> Vec<u8>;
    /// Whether what was written is kept. A harbor that keeps nothing says yes.
    fn keep(&self) -> bool {
        true
    }
    /// The ward waits here, for a reply its carrier has not brought yet and
    /// for its turn on a relation's line: `ready` is asked on this thread
    /// until it says yes or `until` passes. A harbor that runs other work
    /// while a ward waits runs it here, and asks `ready` only where that work
    /// is not running. The default sleeps between askings.
    fn wait(&self, ready: &dyn Fn() -> bool, until: Instant) {
        while !ready() {
            let Some(left) = until.checked_duration_since(Instant::now()).filter(|d| !d.is_zero()) else {
                return;
            };
            std::thread::sleep(left.min(Duration::from_millis(1)));
        }
    }
}

/// The carrier: a ward pk and bytes in, bytes or nothing out, and nothing
/// means not delivered. It is `Send` and `Sync` because the ward calls it on
/// a thread of its own and waits for the allowance at most, so a carrier that
/// blocks, answers nothing at all or panics is an ask ended as `late`.
pub trait Carrier: Send + Sync {
    fn carry(&self, ward: &WardPk, bytes: &[u8]) -> Option<Vec<u8>>;
}

/// The ward's own allowance policy, in milliseconds.
pub const DEFAULT_TIME: u64 = 30_000;
pub const CEILING_TIME: u64 = 600_000;

pub(crate) struct Core {
    pub(crate) key: WardKey,
    pub(crate) pk: WardPk,
    pub(crate) ground: Rc<dyn Ground>,
    pub(crate) carrier: Option<Arc<dyn Carrier>>,
    pub(crate) partition: Rc<RefCell<Partition>>,
    pub(crate) beings: RefCell<BTreeMap<String, Rc<dyn Being>>>,
    /// The relations whose line is held now, one send at a time on each.
    lines: RefCell<BTreeSet<String>>,
    me: Weak<Core>,
}

/// One relation's line, held until this is dropped.
pub(crate) struct Line<'a> {
    core: &'a Core,
    key: String,
}

impl Drop for Line<'_> {
    fn drop(&mut self) {
        self.core.lines.borrow_mut().remove(&self.key);
    }
}

/// A ward, as the harbor holds it: its two pointers are [`Ward::door`] and
/// [`Ward::ask`].
#[derive(Clone)]
pub struct Ward(Rc<Core>);

impl Ward {
    /// Birth: the seed, the partition, the ground. Every being the partition
    /// records a class for is constructed again; one that cannot be is absent.
    pub fn birth(seed: &Seed, partition: Rc<RefCell<Partition>>, ground: Rc<dyn Ground>) -> Ward {
        let key = seed.ward_key();
        let pk = seed.ward_pk();
        let core = Rc::new_cyclic(|me| Core { key, pk, carrier: ground.carrier(), ground, partition, beings: RefCell::new(BTreeMap::new()), lines: RefCell::new(BTreeSet::new()), me: me.clone() });
        let rows: Vec<(String, String)> = core.partition.borrow().classes.iter().map(|(k, c)| (k.clone(), c.clone())).collect();
        for (key, class) in rows {
            if let Ok(being) = core.ground.instantiate(&class, Stance::new(&core, &key)) {
                core.beings.borrow_mut().insert(key, Rc::from(being));
            }
        }
        Ward(core)
    }

    pub fn pk(&self) -> WardPk {
        self.0.pk
    }

    /// The door: sealed bytes in, sealed bytes out, and whether a key this
    /// door holds spoke.
    pub fn door(&self, bytes: &[u8]) -> (Vec<u8>, bool) {
        door::arrive(&self.0, bytes)
    }

    /// The unsealed ask, the one unsealed ask in Quo: method and args in, a
    /// value or silence out. Whoever holds it is the ward's root, and the ward
    /// is a being to its root. A throw inside is silence.
    pub fn ask(&self, method: Option<&str>, args: Option<&Map>) -> Answer {
        match root::ask(&self.0, method, args) {
            Answer::Value(object) => Answer::Value(object),
            _ => Answer::Silence,
        }
    }
}

impl Core {
    pub(crate) fn random_key(&self) -> [u8; 32] {
        self.ground.random(32).try_into().expect("the ground's random answers the count asked")
    }

    /// The lock this ward drew, as `d || z`, when it has drawn one.
    pub(crate) fn lock(&self) -> Option<[u8; LOCK_SEED_LEN]> {
        self.partition.borrow().lock.as_deref().and_then(unhex)
    }

    pub(crate) fn being(&self, key: &str) -> Option<Rc<dyn Being>> {
        self.beings.borrow().get(key).cloned()
    }

    /// The line of the relation `being` holds toward `ward` under `heir`,
    /// `None` for the public being: waited for until `until`, and `None` when
    /// the wait ran out with the line still held.
    pub(crate) fn line(&self, being: &str, ward: &str, heir: Option<&str>, until: Instant) -> Option<Line<'_>> {
        let key = format!("{being} {ward} {}", heir.unwrap_or("public"));
        let free = || !self.lines.borrow().contains(&key);
        self.ground.wait(&free, until);
        if !free() {
            return None;
        }
        self.lines.borrow_mut().insert(key.clone());
        Some(Line { core: self, key })
    }

    fn cells(&self, being: &str) -> Cells {
        self.partition.borrow().beings.get(being).cloned().unwrap_or_default()
    }

    fn write_cells(&self, being: &str, change: impl FnOnce(&mut Cells)) {
        {
            let mut p = self.partition.borrow_mut();
            let Some(cells) = p.beings.get_mut(being) else {
                return;
            };
            change(cells);
        }
    }

    fn bind_mut<R>(&self, being: &str, change: impl FnOnce(&mut Bind) -> R) -> R {
        change(self.partition.borrow_mut().bind.entry(being.to_owned()).or_default())
    }

    /// The allowance she is given: what she asked for held to the ward's.
    fn allowance(wanted: Option<&Map>) -> u64 {
        match wanted.and_then(|w| w.get("time")).and_then(Value::as_number).and_then(|n| n.as_u64()) {
            Some(t) if t >= 1 => t.min(CEILING_TIME),
            _ => DEFAULT_TIME,
        }
    }

    // What a being's stance reaches, and the root's asks beside it.

    fn invite(&self, being: &str, id: &str, notes: Option<Value>) -> Option<Value> {
        if is_reserved(id) || self.cells(being).holds_id(id) || !self.partition.borrow().beings.contains_key(being) {
            return None;
        }
        let notes = notes.unwrap_or_else(|| Value::Object(Map::new()));
        notes.check().ok()?;
        // The lock is drawn once, at the first invite, before that invite's
        // heir secret, in one draw of sixty-four bytes: d then z.
        let lock = match self.lock() {
            Some(lock) => lock,
            None => {
                let drawn: [u8; LOCK_SEED_LEN] = self.ground.random(LOCK_SEED_LEN).try_into().expect("the ground's random answers the count asked");
                self.partition.borrow_mut().lock = Some(hex(&drawn));
                drawn
            }
        };
        let secret = self.random_key();
        let invitation = Invitation::for_heir(self.pk, secret, arithmetic::lock_pk(&lock));
        let heir = hex(&invitation.heir.as_ref().expect("a heir's invitation").0);
        self.partition.borrow_mut().heirs.insert(
            heir.clone(),
            Heir { being: being.into(), id: id.into(), held: heir.clone(), vouched: None, fresh: true, mark: 0, spent: vec![], open: hex(&crate::seal::ZERO_EDGE), offered: None },
        );
        self.bind_mut(being, |b| b.occupants.insert(id.into(), heir.clone()));
        self.write_cells(being, |c| {
            c.set_occupant(id, notes).expect("notes checked");
        });
        Some(invitation.to_value())
    }

    /// Removes an occupant or a standing by id. Whether there was one.
    fn remove(&self, being: &str, id: &str) -> bool {
        let heir = self.partition.borrow().bind.get(being).and_then(|b| b.occupants.get(id).cloned());
        if let Some(heir) = heir {
            self.partition.borrow_mut().bury(&heir);
            self.bind_mut(being, |b| b.occupants.remove(id));
            self.write_cells(being, |c| {
                c.remove_occupant(id);
            });
            return true;
        }
        let standing = self.partition.borrow().bind.get(being).is_some_and(|b| b.standings.contains_key(id));
        if standing {
            self.bind_mut(being, |b| b.standings.remove(id));
            self.write_cells(being, |c| {
                c.remove_standing(id);
            });
        }
        standing
    }

    fn take(&self, being: &str, id: &str, invitation: &Value) -> Option<String> {
        if is_reserved(id) || self.cells(being).holds_id(id) {
            return None;
        }
        let invitation = Invitation::read(invitation)?;
        // Take waits its turn on the relation's line.
        let heir = invitation.heir.as_ref().map(|(pk, _, _)| hex(pk));
        let _line = self.line(being, &invitation.ward.to_string(), heir.as_deref(), Instant::now() + Duration::from_millis(DEFAULT_TIME))?;
        let key = send::knock_key(&invitation);
        let answered = self.partition.borrow().bind.get(being).and_then(|b| b.knock(&key)).is_some_and(|r| r.spoke);
        if !answered {
            return None;
        }
        let keys = self.bind_mut(being, |b| {
            let record = b.end_knock(&key)?;
            let standing = StandingKeys {
                ward: invitation.ward.to_string(),
                heir: invitation.heir.as_ref().map(|(pk, _, _)| hex(pk)),
                by: record.by,
                next: None,
                seq: record.seq,
                // Take keeps the edge key the answered knock moved to.
                edge: record.edge,
            };
            b.standings.insert(id.into(), standing);
            Some(())
        });
        keys?;
        self.write_cells(being, |c| c.set_standing(&StandingRecord { id: id.into(), digest: None, blueprint: None, seen: None }));
        Some(id.into())
    }

    /// Makes a being of this ward, by class name and under a key, with empty
    /// cells. `None` is nobody made.
    fn make(&self, class: &str, key: &str) -> Option<String> {
        if key == self.pk.to_string() || self.partition.borrow().beings.contains_key(key) {
            return None;
        }
        {
            let mut p = self.partition.borrow_mut();
            p.beings.insert(key.into(), Cells::born());
            p.classes.insert(key.into(), class.into());
        }
        let core = self.me.upgrade().expect("a ward alive while it boots");
        match self.ground.instantiate(class, Stance::new(&core, key)) {
            Ok(being) => {
                self.beings.borrow_mut().insert(key.into(), Rc::from(being));
                Some(key.into())
            }
            // A class that throws while it is made is a being who threw at
            // birth: she is absent this run and her cells wait.
            Err(Unmade::Threw(_)) => Some(key.into()),
            // A name the harbor does not hold is nothing, and that boot makes
            // nobody.
            Err(Unmade::NoClass) => {
                self.unmake(key);
                None
            }
        }
    }

    /// Nobody is made: what a boot wrote goes.
    fn unmake(&self, key: &str) {
        self.beings.borrow_mut().remove(key);
        {
            let mut p = self.partition.borrow_mut();
            p.beings.remove(key);
            p.classes.remove(key);
            p.bind.remove(key);
        }
    }

    /// A being makes a being of her ward. The one made has empty cells and no
    /// relation but the one her maker named, and that one is made the way all
    /// of them are: invited, knocked and taken. A boot whose relation could
    /// not be made makes nobody.
    fn boot(&self, maker: &str, class: &str, key: &str, occupant: &str, standing: &str) -> Option<String> {
        self.make(class, key)?;
        let made = (|| {
            let invitation = self.invite(maker, occupant, None)?;
            let core = self.me.upgrade().expect("a ward alive while it boots");
            match send::knock(&core, key, &invitation, None, None, DEFAULT_TIME) {
                Answer::Value(_) => self.take(key, standing, &invitation),
                _ => None,
            }
        })();
        if made.is_none() {
            self.remove(maker, occupant);
            self.unmake(key);
        }
        made.map(|_| key.to_owned())
    }
}
