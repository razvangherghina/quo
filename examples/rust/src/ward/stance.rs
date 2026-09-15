// SPDX-License-Identifier: Apache-2.0
//! The stance, chapter 4: what her ward hands her at birth.

use super::*;

/// What her ward hands her at birth: her cells, her standings, and six calls.
/// Nothing more is ever offered and nothing here is missing.
#[derive(Clone)]
pub struct Stance {
    ward: Weak<Core>,
    key: String,
}

impl Stance {
    pub(super) fn new(core: &Rc<Core>, key: &str) -> Stance {
        Stance { ward: Rc::downgrade(core), key: key.into() }
    }

    fn core(&self) -> Rc<Core> {
        self.ward.upgrade().expect("a stance outliving its ward")
    }

    /// Her cells, as they stand now.
    pub fn cells(&self) -> Cells {
        self.core().cells(&self.key)
    }

    /// Her write to her cells, refused where she wrote it.
    pub fn set(&self, key: &str, value: impl Into<Value>) -> Result<(), Thrown> {
        let value = value.into();
        let mut result = Ok(());
        self.core().write_cells(&self.key, |c| result = c.set(key, value));
        result.map_err(Thrown::from)
    }

    pub fn invite(&self, id: &str, notes: Option<Value>) -> Option<Value> {
        self.core().invite(&self.key, id, notes)
    }

    /// An id, occupant or standing, goes. Removing what is not there is
    /// nothing.
    pub fn remove(&self, id: &str) {
        let core = self.core();
        let cells = core.cells(&self.key);
        if cells.occupant(id).is_some() || cells.standing(id).is_some() {
            core.remove(&self.key, id);
        }
    }

    pub fn knock(&self, invitation: &Value, method: Option<&str>, args: Option<&Map>, wanted: Option<&Map>) -> Answer {
        send::knock(&self.core(), &self.key, invitation, method, args, Core::allowance(wanted))
    }

    pub fn take(&self, id: &str, invitation: &Value) -> Option<String> {
        self.core().take(&self.key, id, invitation)
    }

    pub fn standing(&self, id: &str) -> Option<StandingRecord> {
        self.cells().standing(id)
    }

    pub fn ask(&self, id: &str, method: Option<&str>, args: Option<&Map>, wanted: Option<&Map>) -> Answer {
        send::ask(&self.core(), &self.key, id, method, args, Core::allowance(wanted))
    }

    /// A new being of her ward, by class name and under a key she chooses.
    /// The one made has empty cells and no relation but the one this names:
    /// her occupant `occupant`, held by the new being as the standing
    /// `standing`. A boot whose relation could not be made makes nobody.
    pub fn boot(&self, class: &str, key: &str, occupant: &str, standing: &str) -> Option<String> {
        self.core().boot(&self.key, class, key, occupant, standing)
    }
}
