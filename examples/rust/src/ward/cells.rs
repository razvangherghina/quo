// SPDX-License-Identifier: Apache-2.0
//! Cells: her state, values only, with two root keys that are the ward's.

use crate::value::{Map, Value, ValueError};

/// The root keys of cells that are the ward's and never hers to write: her two
/// records, which her ward keeps beside her cells.
pub const WARD_KEYS: [&str; 2] = ["standings", "occupants"];

/// A being's cells. Her writes go through [`Cells::set`], which refuses the
/// ward's keys and a value past the bound where she wrote it. What she
/// reads is shared and immutable, so a
/// container read through her cells cannot be changed behind the guard.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Cells {
    root: Map,
}

/// What the ward keeps in her cells for one standing.
#[derive(Clone, Debug, PartialEq)]
pub struct StandingRecord {
    pub id: String,
    /// The digest of what the empty ask last brought back, or `None` before
    /// she fetched one.
    pub digest: Option<String>,
    /// That describe when it read as a blueprint, and `None` when it did not
    /// or when there was none.
    pub blueprint: Option<Value>,
    /// The digest her ward last saw arrive with an answer.
    pub seen: Option<String>,
}

/// What the ward keeps in her cells for one occupant.
#[derive(Clone, Debug, PartialEq)]
pub struct OccupantRecord {
    pub id: String,
    /// Hers. The empty object when invite was given none.
    pub notes: Value,
}

impl Cells {
    pub fn new() -> Cells {
        Cells::default()
    }

    /// A being's cells at her birth: empty, with her two records standing as
    /// empty objects.
    pub fn born() -> Cells {
        let mut cells = Cells::new();
        cells.ward_map("standings");
        cells.ward_map("occupants");
        cells
    }

    /// Cells as a harbor kept them, back from an object of values: each cell
    /// held to the bound on its own, and the two records of the ward read
    /// field by field, since a record around a blueprint nests deeper than
    /// one value may.
    pub fn from_value(value: Value) -> Result<Cells, ValueError> {
        let Value::Object(saved) = value else {
            return Err(ValueError::NotObject);
        };
        let mut cells = Cells::new();
        let text = |v: Option<&Value>| v.and_then(Value::as_str).map(str::to_owned);
        for (key, value) in saved.iter() {
            match key {
                "standings" => {
                    cells.ward_map(key);
                    for (id, record) in value.as_object().ok_or(ValueError::NotObject)?.iter() {
                        cells.set_standing(&StandingRecord {
                            id: text(record.get("id")).unwrap_or_else(|| id.to_owned()),
                            digest: text(record.get("digest")),
                            blueprint: record.get("blueprint").filter(|b| !b.is_null()).cloned(),
                            seen: text(record.get("seen")),
                        });
                    }
                }
                "occupants" => {
                    cells.ward_map(key);
                    for (id, record) in value.as_object().ok_or(ValueError::NotObject)?.iter() {
                        cells.set_occupant(id, record.get("notes").cloned().unwrap_or(Value::Null))?;
                    }
                }
                _ => cells.set(key, value.clone())?,
            }
        }
        Ok(cells)
    }

    pub fn to_value(&self) -> Value {
        Value::Object(self.root.clone())
    }

    pub fn get(&self, key: &str) -> Option<&Value> {
        self.root.get(key)
    }

    /// Her write. Refused for a ward's key and for a value past the bound;
    /// the value is hers from here, moved in and shared with nobody.
    pub fn set(&mut self, key: &str, value: impl Into<Value>) -> Result<(), ValueError> {
        refuse_ward_key(key)?;
        let value = value.into();
        value.check()?;
        self.root.insert(key, value);
        Ok(())
    }

    pub fn standing(&self, id: &str) -> Option<StandingRecord> {
        let record = self.root.get("standings")?.get(id)?;
        let text = |field: &str| record.get(field).and_then(Value::as_str).map(str::to_owned);
        Some(StandingRecord { id: text("id").unwrap_or_else(|| id.to_owned()), digest: text("digest"), blueprint: record.get("blueprint").filter(|b| !b.is_null()).cloned(), seen: text("seen") })
    }

    /// The ward's write of all four fields of a standing.
    pub fn set_standing(&mut self, record: &StandingRecord) {
        let mut entry = Map::new();
        entry.insert("id", record.id.as_str());
        entry.insert("digest", record.digest.clone());
        entry.insert("blueprint", record.blueprint.clone());
        entry.insert("seen", record.seen.clone());
        self.ward_map("standings").insert(record.id.as_str(), entry);
    }

    pub fn remove_standing(&mut self, id: &str) -> bool {
        self.ward_map("standings").remove(id).is_some()
    }

    pub fn occupant(&self, id: &str) -> Option<OccupantRecord> {
        let record = self.root.get("occupants")?.get(id)?;
        Some(OccupantRecord { id: record.get("id").and_then(Value::as_str).unwrap_or(id).to_owned(), notes: record.get("notes").cloned().unwrap_or(Value::Null) })
    }

    /// The ward's write of an occupant record, with the notes invite seeded.
    /// The notes are held to the value rule, and moved in as her own copy.
    pub fn set_occupant(&mut self, id: &str, notes: Value) -> Result<(), ValueError> {
        notes.check()?;
        let mut entry = Map::new();
        entry.insert("id", id);
        entry.insert("notes", notes);
        self.ward_map("occupants").insert(id, entry);
        Ok(())
    }

    pub fn remove_occupant(&mut self, id: &str) -> bool {
        self.ward_map("occupants").remove(id).is_some()
    }

    /// Whether the id names a record, occupant or standing: one namespace.
    pub fn holds_id(&self, id: &str) -> bool {
        ["standings", "occupants"].iter().any(|k| self.root.get(k).and_then(|m| m.get(id)).is_some())
    }

    fn ward_map(&mut self, key: &str) -> &mut Map {
        if !matches!(self.root.get(key), Some(Value::Object(_))) {
            self.root.insert(key, Map::new());
        }
        self.root.get_mut(key).and_then(Value::as_object_mut).expect("an object just made")
    }
}

fn refuse_ward_key(key: &str) -> Result<(), ValueError> {
    if WARD_KEYS.contains(&key) {
        Err(ValueError::WardKey(key.to_owned()))
    } else {
        Ok(())
    }
}
