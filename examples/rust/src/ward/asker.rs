// SPDX-License-Identifier: Apache-2.0
//! Ids, the reserved words, and the three askers.

/// The ward's own asker at every being's door, on the unsealed ask.
pub const ROOT: &str = "ROOT";

/// Whether no being may mint this id. This kit's spelling of the stance takes
/// ids as arguments and never as names beside its own calls, so the root's
/// name is the whole list of what collides.
pub fn is_reserved(id: &str) -> bool {
    id == ROOT
}

/// Who reached her. Three shapes and no fourth.
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum Asker {
    /// Her own id for the occupant at the door.
    Occupant(String),
    /// Nobody, which is how the public being knows she is public.
    Nobody,
    /// The root: the ward speaking to her on behalf of whoever holds its
    /// unsealed ask.
    Root,
}

impl Asker {
    /// The id this asker carries, [`ROOT`] for the root and none for nobody.
    pub fn id(&self) -> Option<&str> {
        match self {
            Asker::Occupant(id) => Some(id),
            Asker::Nobody => None,
            Asker::Root => Some(ROOT),
        }
    }
}
