// SPDX-License-Identifier: Apache-2.0
//! What a being answers, and what her ward tells her came back.

use crate::value::{Value, Word};

/// What comes back where an answer was owed: a value, silence, or a word.
///
/// A being answers only the first two; a word out of her is read as her
/// having thrown.
#[derive(Clone, Debug, PartialEq)]
pub enum Answer {
    Value(Value),
    Silence,
    Word(Word),
}

impl From<Value> for Answer {
    fn from(v: Value) -> Answer {
        Answer::Value(v)
    }
}

impl From<Word> for Answer {
    fn from(w: Word) -> Answer {
        Answer::Word(w)
    }
}
