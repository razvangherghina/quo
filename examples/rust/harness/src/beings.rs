// SPDX-License-Identifier: Apache-2.0
//! The being classes of `SCENARIOS.md` "The beings", written in the
//! harness, over the kit. Nothing here is reachable from a harbor outside
//! this crate.

use quo_kit::value::{Map, Number, Value};
use quo_kit::ward::{Answer, Asker, ROOT};
use quo_kit::ward::{Being, Stance, Thrown};
use std::time::Duration;

/// A being's wait lets go of the wards, so a being that waits holds only
/// her own ask.
fn wait(for_: Duration) {
    crate::gil::pause(for_);
}

/// `wanted` on the root channel is milliseconds; the kit's stance reads an
/// allowance as `{ time }`. Absent stays absent.
fn allowance(args: &Map) -> Option<Map> {
    let time = args.get("wanted").filter(|v| v.as_number().is_some())?;
    let mut w = Map::new();
    w.insert("time", time.clone());
    Some(w)
}

const BLUEPRINT: &str = r#"{
  "asks": [
    {
      "name": "hello",
      "description": "Answers who is asking.",
      "input": { "type": "object" },
      "output": {
        "type": "object",
        "properties": { "hi": { "type": ["string", "null"] } },
        "required": ["hi"],
        "additionalProperties": false
      }
    },
    {
      "name": "echo",
      "description": "Answers the args as they arrived.",
      "input": { "type": "object" },
      "output": { "type": "object" }
    },
    {
      "name": "err",
      "description": "Answers an error she declares.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false },
      "output": {
        "type": "object",
        "properties": { "error": { "type": "string" } },
        "required": ["error"],
        "additionalProperties": false
      }
    },
    {
      "name": "quiet",
      "description": "Answers silence.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "boom",
      "description": "Throws.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "bad",
      "description": "Answers a word.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "never",
      "description": "Never answers.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "slow",
      "description": "Answers two thousand milliseconds after the ask reaches her.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false },
      "output": {
        "type": "object",
        "properties": { "slow": { "const": true } },
        "required": ["slow"],
        "additionalProperties": false
      }
    },
    {
      "name": "join",
      "description": "Mints an occupant for the asker and answers the invitation.",
      "input": {
        "type": "object",
        "properties": { "id": { "type": "string" } },
        "required": ["id"],
        "additionalProperties": false
      },
      "output": {
        "type": "object",
        "properties": {
          "ward": { "type": "string" },
          "heir": { "type": "string" },
          "secret": { "type": "string" },
          "lock": { "type": "string" }
        },
        "required": ["ward", "heir", "secret", "lock"],
        "additionalProperties": false
      }
    },
    {
      "name": "shape",
      "description": "Sets which describe she gives from now on.",
      "input": {
        "type": "object",
        "properties": {
          "mode": { "enum": ["plain", "extra", "throws", "numeric", "field"] }
        },
        "required": ["mode"],
        "additionalProperties": false
      },
      "output": {
        "type": "object",
        "properties": { "mode": { "type": "string" } },
        "required": ["mode"],
        "additionalProperties": false
      }
    },
    {
      "name": "hidden",
      "description": "Answers, and is written in one asker's blueprint alone.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false },
      "output": {
        "type": "object",
        "properties": { "hidden": { "const": true } },
        "required": ["hidden"],
        "additionalProperties": false
      }
    }
  ],
  "notes": {
    "😀": "grin",
    "דּ": "dalet",
    "big": 1e21,
    "small": 1e-7,
    "third": 0.3333333333333333
  }
}"#;

fn plain_blueprint() -> Value {
    Value::parse(BLUEPRINT).expect("the blueprint above parses")
}

fn without_hidden(mut v: Value) -> Value {
    if let Some(obj) = v.as_object_mut() {
        if let Some(Value::Array(asks)) = obj.get_mut("asks") {
            asks.retain(|a| a.get("name").and_then(Value::as_str) != Some("hidden"));
        }
    }
    v
}

/// The class every scenario asks. One method per answer a door can carry.
pub struct Host {
    stance: Stance,
}

impl Host {
    pub fn new(stance: Stance) -> Host {
        Host { stance }
    }

    fn describe(&self, asker: &Asker) -> Value {
        let base = match self.stance.cells().get("describe").and_then(Value::as_str) {
            Some("extra") => extra(plain_blueprint()),
            Some("throws") => return Value::Null, // a describe that throws: handled by caller
            Some("numeric") => numeric(plain_blueprint()),
            Some("field") => field(plain_blueprint()),
            _ => plain_blueprint(),
        };
        if matches!(asker, Asker::Occupant(id) if id == "b") {
            base
        } else {
            without_hidden(base)
        }
    }
}

fn extra(mut v: Value) -> Value {
    if let Some(obj) = v.as_object_mut() {
        if let Some(Value::Array(asks)) = obj.get_mut("asks") {
            let mut entry = Map::new();
            entry.insert("name", "extra");
            entry.insert("input", Value::Object(Map::new()));
            asks.push(Value::Object(entry));
        }
    }
    v
}

fn numeric(mut v: Value) -> Value {
    if let Some(obj) = v.as_object_mut() {
        if let Some(Value::Array(asks)) = obj.get_mut("asks") {
            if let Some(Value::Object(first)) = asks.first_mut() {
                first.insert("name", Value::Number(Number::from_u64(1).expect("one is a double")));
            }
        }
    }
    v
}

fn field(mut v: Value) -> Value {
    if let Some(obj) = v.as_object_mut() {
        obj.insert("mood", "fine");
    }
    v
}

/// The channel's own three answer shapes, `{ok}`, `{silence}` or `{word}`,
/// used only between the harness's root-channel loop and this reserved
/// method: never on the wire, and never a shape a scenario asker sees.
/// The root channel's own `args`, `HARNESS.md` section 2: absent is the
/// empty ask, exactly as it is at a door. `Value::as_object` alone cannot
/// tell that from a JSON array, string, number, bool or null under the
/// field: all of those read `None` too, the same as an absent field, so a
/// non-object `args` would never reach the kit's own `sendable` check
/// (the kit's `src/ward/send.rs`, "args that are not one object of
/// values leave nothing") at all. `Stance::ask`/`knock` only take
/// `Option<&Map>`, with no way to spell "present and not one". This is the
/// one place that distinction is still read, before it is lost.
fn channel_args(args: &Map) -> Result<Option<Map>, ()> {
    match args.get("args") {
        None => Ok(None),
        Some(Value::Object(m)) => Ok(Some(m.clone())),
        Some(_) => Err(()),
    }
}

// The answer itself is held here, beside the kit, and only a ticket for it
// crosses the kit's root ask, so an object of depth sixty-four is never
// nested one level deeper than the value rule allows on its way back.
thread_local! {
    static HELD: std::cell::RefCell<(u64, std::collections::HashMap<String, Answer>)> = std::cell::RefCell::new((0, std::collections::HashMap::new()));
}

fn wrap(answer: quo_kit::ward::Answer) -> Value {
    let ticket = HELD.with(|held| {
        let mut held = held.borrow_mut();
        held.0 += 1;
        let ticket = held.0.to_string();
        held.1.insert(ticket.clone(), answer);
        ticket
    });
    obj(&[("held", ticket.into())])
}

/// The answer a reserved method held under `ticket`, once.
pub fn take_held(ticket: &str) -> Option<Answer> {
    HELD.with(|held| held.borrow_mut().1.remove(ticket))
}

fn obj(entries: &[(&str, Value)]) -> Value {
    let mut m = Map::new();
    for (k, v) in entries {
        m.insert(*k, v.clone());
    }
    Value::Object(m)
}

impl Being for Host {
    fn answer(&self, asker: &Asker, method: Option<&str>, args: &Map) -> Result<Answer, Thrown> {
        use quo_kit::ward::Answer;
        match method {
            None => {
                if self.stance.cells().get("describe").and_then(Value::as_str) == Some("throws") {
                    return Err(Thrown("describe throws".into()));
                }
                Ok(Answer::Value(self.describe(asker)))
            }
            Some("hello") => {
                let hi = match asker {
                    Asker::Occupant(id) => Value::from(id.as_str()),
                    Asker::Nobody => Value::Null,
                    Asker::Root => Value::from(ROOT),
                };
                Ok(Answer::Value(obj(&[("hi", hi)])))
            }
            Some("echo") => {
                self.stance.set("echoed", Value::Object(args.clone())).ok();
                Ok(Answer::Value(Value::Object(args.clone())))
            }
            Some("err") => Ok(Answer::Value(obj(&[("error", "nope".into())]))),
            Some("quiet") => Ok(Answer::Silence),
            Some("boom") => Err(Thrown("boom".into())),
            Some("bad") => Ok(Answer::Word(quo_kit::value::Word::Absent)),
            Some("never") => {
                wait(Duration::from_secs(3600));
                Ok(Answer::Silence)
            }
            Some("slow") => {
                wait(Duration::from_millis(2000));
                Ok(Answer::Value(obj(&[("slow", true.into())])))
            }
            // Shown in no describe, so no digest moves for her.
            Some("huge") => Ok(Answer::Value(obj(&[("blob", "x".repeat(1_048_576).into())]))),
            Some("join") => {
                let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
                let existing = self.stance.cells().get("invitations").and_then(|v| v.get(id)).cloned();
                let invitation = match existing {
                    Some(v) => v,
                    None => {
                        let invitation = self.stance.invite(id, None).ok_or_else(|| Thrown("could not invite".into()))?;
                        let mut invitations = self.stance.cells().get("invitations").cloned().unwrap_or_else(|| Value::Object(Map::new()));
                        if let Some(o) = invitations.as_object_mut() {
                            o.insert(id, invitation.clone());
                        }
                        self.stance.set("invitations", invitations).ok();
                        invitation
                    }
                };
                Ok(Answer::Value(invitation))
            }
            Some("shape") => {
                let mode = args.get("mode").and_then(Value::as_str).unwrap_or("plain").to_owned();
                self.stance.set("describe", mode.as_str()).ok();
                Ok(Answer::Value(obj(&[("mode", mode.into())])))
            }
            Some("hidden") => Ok(Answer::Value(obj(&[("hidden", true.into())]))),
            Some(name) if name.starts_with("__") => reserved_answer(&self.stance, name, args),
            Some(other) => Err(Thrown(format!("no answer to {other:?}"))),
        }
    }
}

/// Reserved for the harness's own root-channel adapter alone: no scenario
/// names these, and they reach the kit's `Stance` calls a root cannot
/// otherwise reach separately (`Ward::ask`'s own "knock" fuses a take, and
/// it has no "ask on a standing", no "standing" verb, and no "boot" with a
/// relation, at all). Section 2 of `HARNESS.md` names the channel's own
/// shapes; this is every being's own way there, shared and never one
/// class's own, since the root channel reaches whichever being a scenario
/// names, `Caller` included (`SCENARIOS.md` 9.4/9.5's own standing to `a`,
/// minted through `__knock`/`__take` exactly as `Host`'s is).
fn reserved_answer(stance: &Stance, name: &str, args: &Map) -> Result<Answer, Thrown> {
    match name {
        "__knock" => {
            let invitation = args.get("invitation").cloned().unwrap_or(Value::Null);
            let method = args.get("method").and_then(Value::as_str);
            let Ok(inner) = channel_args(args) else {
                return Ok(Answer::Value(wrap(Answer::Word(quo_kit::value::Word::Unreached))));
            };
            let wanted = allowance(args);
            Ok(Answer::Value(wrap(stance.knock(&invitation, method, inner.as_ref(), wanted.as_ref()))))
        }
        "__take" => {
            let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
            let invitation = args.get("invitation").cloned().unwrap_or(Value::Null);
            let taken = stance.take(id, &invitation);
            Ok(Answer::Value(wrap(Answer::Value(obj(&[("taken", taken.map(Value::from).unwrap_or(Value::Null))])))))
        }
        "__ask" => {
            let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
            let method = args.get("method").and_then(Value::as_str);
            let Ok(inner) = channel_args(args) else {
                return Ok(Answer::Value(wrap(Answer::Word(quo_kit::value::Word::Unreached))));
            };
            let wanted = allowance(args);
            Ok(Answer::Value(wrap(stance.ask(id, method, inner.as_ref(), wanted.as_ref()))))
        }
        "__standing" => {
            let id = args.get("id").and_then(Value::as_str).unwrap_or_default();
            let record = stance.standing(id);
            let shaped = match record {
                Some(r) => obj(&[("id", r.id.into()), ("digest", r.digest.map(Value::from).unwrap_or(Value::Null)), ("seen", r.seen.map(Value::from).unwrap_or(Value::Null))]),
                None => Value::Null,
            };
            Ok(Answer::Value(wrap(Answer::Value(shaped))))
        }
        // `Stance::boot`, a being's own call to mint another being as her
        // own occupant, and never root's (`KIT-SPEC.md` 4.7: the kit's root
        // ask takes only `class` and `key`). Reserved the same way
        // `__knock`, `__take`, `__ask` and `__standing` are. `main.rs`'s root
        // `boot` reaches it on the being `maker` names, so the relation is
        // the kit's own between the made being and her maker.
        "__boot" => {
            let class = args.get("class").and_then(Value::as_str).unwrap_or_default();
            let key = args.get("key").and_then(Value::as_str).unwrap_or_default();
            let occupant = args.get("occupant").and_then(Value::as_str).unwrap_or_default();
            let standing = args.get("standing").and_then(Value::as_str).unwrap_or_default();
            let booted = stance.boot(class, key, occupant, standing);
            Ok(Answer::Value(wrap(Answer::Value(obj(&[("booted", booted.map(Value::from).unwrap_or(Value::Null))])))))
        }
        other => Err(Thrown(format!("no answer to {other:?}"))),
    }
}

/// She asks while she is being asked, and holds one method, `hi`.
pub struct Caller {
    stance: Stance,
}

impl Caller {
    pub fn new(stance: Stance) -> Caller {
        Caller { stance }
    }

    fn blueprint() -> Value {
        Value::parse(
            r#"{
  "asks": [
    {
      "name": "hi",
      "description": "Asks hello on the standing a and answers what came.",
      "input": {
        "type": "object",
        "properties": { "time": { "type": "integer", "minimum": 1 } },
        "additionalProperties": false
      },
      "output": {
        "type": "object",
        "properties": {
          "got": { "type": ["object", "null"] },
          "quo": { "type": ["string", "null"] }
        },
        "required": ["got", "quo"],
        "additionalProperties": false
      }
    }
  ],
  "notes": {}
}"#,
        )
        .expect("the blueprint above parses")
    }
}

impl Being for Caller {
    fn answer(&self, _asker: &Asker, method: Option<&str>, args: &Map) -> Result<Answer, Thrown> {
        use quo_kit::ward::Answer;
        match method {
            None => Ok(Answer::Value(Caller::blueprint())),
            Some("hi") => {
                let mut wanted = Map::new();
                wanted.insert("time", args.get("time").cloned().unwrap_or_else(|| Value::Number(Number::from_u64(1000).expect("a thousand is a double"))));
                match self.stance.ask("a", Some("hello"), Some(&Map::new()), Some(&wanted)) {
                    Answer::Value(v) => Ok(Answer::Value(obj(&[("got", v), ("quo", Value::Null)]))),
                    Answer::Silence => Ok(Answer::Value(obj(&[("got", Value::Null), ("quo", Value::Null)]))),
                    Answer::Word(w) => Ok(Answer::Value(obj(&[("got", Value::Null), ("quo", w.to_string().into())]))),
                }
            }
            Some(name) if name.starts_with("__") => reserved_answer(&self.stance, name, args),
            Some(other) => Err(Thrown(format!("no answer to {other:?}"))),
        }
    }
}

/// She throws while she is made: absent for the run that made her.
pub struct Stillborn;

impl Stillborn {
    pub fn new(_stance: Stance) -> Result<Box<dyn Being>, Thrown> {
        Err(Thrown("stillborn".into()))
    }
}

impl Being for Stillborn {
    fn answer(&self, _asker: &Asker, _method: Option<&str>, _args: &Map) -> Result<Answer, Thrown> {
        unreachable!("a being never made never answers")
    }
}
