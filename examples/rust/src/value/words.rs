// SPDX-License-Identifier: Apache-2.0
//! Silence and the words: the five the door says on the wire, and the four
//! her own ward says in process.

use std::fmt;

/// The ward's reason why no object came. A word carries nothing but its name.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Word {
    /// The relation this key spoke for was removed by the being who invited it.
    Removed,
    /// The being who invited it did not come back this run.
    Absent,
    /// The knock announced no key of her own, so it bound nothing.
    Unannounced,
    /// The number was already honoured, or is at or below the span.
    Repeated,
    /// She threw, or answered a shape that is not hers to make.
    Threw,
    /// No far door was reached.
    Unreached,
    /// The wait ran out.
    Late,
    /// The invitation is not one.
    Invitation,
    /// She dropped the standing, and asked on what she held.
    Dropped,
}

impl Word {
    pub const ALL: [Word; 9] = [Word::Removed, Word::Absent, Word::Unannounced, Word::Repeated, Word::Threw, Word::Unreached, Word::Late, Word::Invitation, Word::Dropped];

    /// The name, as it is spelled on the wire for the five that cross.
    pub fn as_str(self) -> &'static str {
        match self {
            Word::Removed => "removed",
            Word::Absent => "absent",
            Word::Unannounced => "unannounced",
            Word::Repeated => "repeated",
            Word::Threw => "threw",
            Word::Unreached => "unreached",
            Word::Late => "late",
            Word::Invitation => "invitation",
            Word::Dropped => "dropped",
        }
    }

    /// The word of this name, among the five and the four.
    pub fn from_name(name: &str) -> Option<Word> {
        Word::ALL.into_iter().find(|w| w.as_str() == name)
    }

    /// Whether the door says it, on the wire as `{ quo: word }`. The other
    /// four are her own ward's and never cross.
    pub fn is_door_word(self) -> bool {
        matches!(self, Word::Removed | Word::Absent | Word::Unannounced | Word::Repeated | Word::Threw)
    }
}

impl fmt::Display for Word {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}
