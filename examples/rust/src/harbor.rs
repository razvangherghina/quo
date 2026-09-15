// SPDX-License-Identifier: Apache-2.0
//! A memory harbor: one process, no network, no socket, no persistence. It
//! boots wards on seeds, keeps each partition in memory, holds the map of pk
//! to door, carries bytes by handing each ward the doors of its own and of a
//! harbor it is linked to, reached in process, and draws entropy from the stream it was handed.
//!
//! A class name is held here beside the body that makes a being from her
//! stance, and instantiate is a lookup in that map.

use crate::arithmetic::sha256;
use crate::hex::hex;
use crate::seal::{Seed, WardPk};
use crate::value::Map;
use crate::ward::Answer;
use crate::ward::{Being, Ground, Partition, Stance, Thrown, Unmade, Ward};
use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::rc::{Rc, Weak};

/// A class body: what makes a being from her stance.
pub type Constructor = Rc<dyn Fn(Stance) -> Result<Box<dyn Being>, Thrown>>;

/// A stream of entropy: a count in, that many bytes out. Where a harbor draws
/// its keys from is the harbor's.
pub type Entropy = Rc<dyn Fn(usize) -> Vec<u8>>;

struct Kept {
    seed: Seed,
    partition: Rc<RefCell<Partition>>,
    ward: Ward,
}

struct Core {
    classes: RefCell<BTreeMap<String, Constructor>>,
    wards: RefCell<HashMap<WardPk, Kept>>,
    links: RefCell<Vec<Weak<Core>>>,
    entropy: Entropy,
}

/// One memory harbor. Cloning it is another handle on the same harbor.
#[derive(Clone)]
pub struct MemoryHarbor(Rc<Core>);

impl MemoryHarbor {
    /// A harbor drawing every byte of entropy from `entropy`, which two
    /// linked harbors may share.
    pub fn new(entropy: Entropy) -> MemoryHarbor {
        MemoryHarbor(Rc::new(Core { classes: RefCell::new(BTreeMap::new()), wards: RefCell::new(HashMap::new()), links: RefCell::new(Vec::new()), entropy }))
    }

    /// Holds a class body under a name.
    pub fn hold(&self, class: &str, constructor: impl Fn(Stance) -> Result<Box<dyn Being>, Thrown> + 'static) {
        self.0.classes.borrow_mut().insert(class.into(), Rc::new(constructor));
    }

    /// Stops holding a class body.
    pub fn release(&self, class: &str) {
        self.0.classes.borrow_mut().remove(class);
    }

    /// Links two harbors, each carrying to the other's doors: a wire in
    /// process.
    pub fn link(&self, other: &MemoryHarbor) {
        self.0.links.borrow_mut().push(Rc::downgrade(&other.0));
        other.0.links.borrow_mut().push(Rc::downgrade(&self.0));
    }

    /// Boots a ward on a seed over a fresh partition, and keeps its ask
    /// pointer: this harbor is its root.
    pub fn boot(&self, seed: Seed) -> WardPk {
        self.birth(seed, Rc::new(RefCell::new(Partition::default())))
    }

    /// Boots the ward on this pk again, over the partition kept for it, on
    /// the class bodies held now. `None` is a pk this harbor stands no ward
    /// under.
    pub fn restart(&self, ward: &WardPk) -> Option<WardPk> {
        let kept = self.0.wards.borrow_mut().remove(ward)?;
        Some(self.birth(kept.seed, kept.partition))
    }

    fn birth(&self, seed: Seed, partition: Rc<RefCell<Partition>>) -> WardPk {
        let ground = Rc::new(WardGround { harbor: Rc::downgrade(&self.0) });
        let ward = Ward::birth(&seed, partition.clone(), ground);
        let pk = ward.pk();
        self.0.wards.borrow_mut().insert(pk, Kept { seed, partition, ward });
        pk
    }

    fn ward(&self, pk: &WardPk) -> Option<Ward> {
        self.0.wards.borrow().get(pk).map(|k| k.ward.clone())
    }

    /// The ward's ask pointer, held by this harbor as its root.
    pub fn ask(&self, ward: &WardPk, method: Option<&str>, args: Option<&Map>) -> Option<Answer> {
        Some(self.ward(ward)?.ask(method, args))
    }

    /// Bytes from outside for a pk this harbor holds, handed to that one door.
    pub fn door(&self, ward: &WardPk, bytes: &[u8]) -> Option<(Vec<u8>, bool)> {
        let ward = self.ward(ward)?;
        // Bytes cross as a copy, never a reference, even between own doors.
        let copy = Vec::from(bytes);
        Some(ward.door(&copy))
    }

    /// A digest of a ward's partition: SHA-256 of its canonical form. Two
    /// differ when something was written between them. The partition is not
    /// held to the value rule, since a cell of depth sixty-four nests deeper
    /// inside it.
    pub fn digest(&self, ward: &WardPk) -> Option<String> {
        Some(hex(&sha256(self.partition(ward)?.canonical().as_bytes())))
    }

    /// The partition kept for a ward, as values.
    pub fn partition(&self, ward: &WardPk) -> Option<crate::value::Value> {
        Some(self.0.wards.borrow().get(ward)?.partition.borrow().to_value())
    }
}

/// The ground a memory harbor hands each ward.
struct WardGround {
    harbor: Weak<Core>,
}

impl WardGround {
    fn harbor(&self) -> Option<MemoryHarbor> {
        self.harbor.upgrade().map(MemoryHarbor)
    }
}

impl Ground for WardGround {
    fn instantiate(&self, class: &str, stance: Stance) -> Result<Box<dyn Being>, Unmade> {
        let harbor = self.harbor().ok_or(Unmade::NoClass)?;
        let constructor = harbor.0.classes.borrow().get(class).cloned().ok_or(Unmade::NoClass)?;
        std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| constructor(stance))).unwrap_or_else(|_| Err(Thrown("panicked at birth".into()))).map_err(Unmade::Threw)
    }

    /// A door of this harbor or of a harbor linked to it. The memory harbor
    /// has no carrier: every door it reaches is in this process.
    fn door(&self, ward: &WardPk) -> Option<Ward> {
        let harbor = self.harbor()?;
        if let Some(own) = harbor.ward(ward) {
            return Some(own);
        }
        let links: Vec<MemoryHarbor> = harbor.0.links.borrow().iter().filter_map(Weak::upgrade).map(MemoryHarbor).collect();
        links.iter().find_map(|h| h.ward(ward))
    }

    fn random(&self, count: usize) -> Vec<u8> {
        let harbor = self.harbor().expect("a harbor alive while its wards run");
        let entropy = harbor.0.entropy.clone();
        entropy(count)
    }
}
