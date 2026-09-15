// SPDX-License-Identifier: Apache-2.0
#![allow(dead_code)]
//! What the kit's own tests share: a written-down stream of entropy, so
//! every key a test's harbor draws is known, and the one being every test
//! world boots. Nothing here is a harbor a world runs on, and nothing of it
//! is reachable from a harbor that is not in it. The door's records are
//! replayed by the verifier over the stand program, not here.

use quo_kit::harbor::Entropy;
use quo_kit::value::{Map, Value, Word};
use quo_kit::ward::{Answer, Asker};
use quo_kit::ward::{Being, Stance, Thrown};
use std::cell::RefCell;
use std::rc::Rc;

/// The seed every record's stream starts at.
pub const STREAM_SEED: u64 = 20250901;

/// The deadline every test binary runs under: a test that hangs ends the
/// run, failed, instead of holding it. Armed once per process, by every
/// world and every stream.
pub fn watchdog() {
    static ARMED: std::sync::Once = std::sync::Once::new();
    ARMED.call_once(|| {
        std::thread::spawn(|| {
            std::thread::sleep(std::time::Duration::from_secs(120));
            eprintln!("watchdog: the kit's tests ran past 120 seconds");
            std::process::exit(124);
        });
    });
}

/// A written-down stream of entropy: SplitMix64, for a harbor whose every key
/// must be known. The corpus fixes the entropy so that a verifier holding no
/// key can replay a record and compare bytes, and the stream it fixes is the
/// harness and not the protocol.
#[derive(Clone, Debug)]
pub struct SplitMix64 {
    state: u64,
    words: u64,
}

impl SplitMix64 {
    pub fn new(seed: u64) -> SplitMix64 {
        watchdog();
        SplitMix64 { state: seed, words: 0 }
    }

    pub fn next_word(&mut self) -> u64 {
        self.state = self.state.wrapping_add(0x9e37_79b9_7f4a_7c15);
        self.words += 1;
        let mut z = self.state;
        z = (z ^ (z >> 30)).wrapping_mul(0xbf58_476d_1ce4_e5b9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94d0_49bb_1331_11eb);
        z ^ (z >> 31)
    }

    /// `count` bytes, eight to a word, least significant first. A count not a
    /// multiple of eight spends the head of a fresh word and throws the rest
    /// away.
    pub fn bytes(&mut self, count: usize) -> Vec<u8> {
        let mut out = Vec::with_capacity(count + 8);
        while out.len() < count {
            out.extend_from_slice(&self.next_word().to_le_bytes());
        }
        out.truncate(count);
        out
    }

    /// Thirty-two bytes, a key's worth.
    pub fn key(&mut self) -> [u8; 32] {
        self.bytes(32).try_into().expect("thirty-two bytes")
    }

    /// How many words were spent since the seed.
    pub fn words(&self) -> u64 {
        self.words
    }
}

/// The stream as a harbor draws from it: a count in, that many bytes out.
pub fn stream(entropy: &Rc<RefCell<SplitMix64>>) -> Entropy {
    let entropy = entropy.clone();
    Rc::new(move |count| entropy.borrow_mut().bytes(count))
}

/// The class every test world boots.
pub const PROBE: &str = "probe";

/// The being the test worlds are made of. She answers each of her asks with
/// one of the things a being may answer, or with a throw.
pub struct Probe {
    _stance: Stance,
}

impl Probe {
    pub fn new(stance: Stance) -> Probe {
        Probe { _stance: stance }
    }

    pub fn blueprint() -> Value {
        let asks = ["hello", "err", "nul", "quiet", "boom", "bad", "never"].iter().map(|name| obj(&[("name", (*name).into()), ("input", obj(&[("type", "object".into())]))])).collect::<Vec<_>>();
        obj(&[("asks", Value::Array(asks)), ("notes", obj(&[]))])
    }
}

impl Being for Probe {
    fn answer(&self, asker: &Asker, method: Option<&str>, _args: &Map) -> Result<Answer, Thrown> {
        match method {
            None => Ok(Answer::Value(Probe::blueprint())),
            Some("hello") => Ok(Answer::Value(obj(&[("hi", Value::from(asker.id().map(str::to_owned)))]))),
            Some("err") => Ok(Answer::Value(obj(&[("error", "err".into())]))),
            Some("nul") => Ok(Answer::Value(Value::Null)),
            Some("quiet") => Ok(Answer::Silence),
            Some("bad") => Ok(Answer::Word(Word::Removed)),
            // Not in her blueprint, so a digest a test hashes is unmoved.
            Some("huge") => Ok(Answer::Value(obj(&[("blob", "x".repeat(1 << 20).into())]))),
            Some(_) => Err(Thrown(format!("no answer to {method:?}"))),
        }
    }
}

pub fn obj(entries: &[(&str, Value)]) -> Value {
    Value::Object(entries.iter().map(|(k, v)| (*k, v.clone())).collect::<Map>())
}
