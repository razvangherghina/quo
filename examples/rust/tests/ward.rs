// SPDX-License-Identifier: Apache-2.0
// The ward as a being meets it: what she is handed, what her cells hold from
// birth, how her ward reads an invitation, and what the door says to a key it
// bound and to bytes it cannot open.

mod harness;

use harness::{stream, SplitMix64};
use quo_kit::harbor::{Entropy, MemoryHarbor};
use quo_kit::seal::{Seed, WardPk};
use quo_kit::value::{Map, Value};
use quo_kit::ward::{Answer, Asker};
use quo_kit::ward::{Being, Ground, Partition, Stance, Thrown, Unmade, Ward};
use std::cell::{Cell, RefCell};
use std::rc::Rc;

/// A being that shows what she is handed and speaks through her stance.
struct Echo {
    stance: Stance,
}

fn obj(entries: &[(&str, Value)]) -> Map {
    entries.iter().map(|(k, v)| (*k, v.clone())).collect()
}

/// The args of a boot: a class, a key, and the one relation her maker names.
fn boot(class: &str, key: &str) -> Value {
    Value::Object(obj(&[("class", class.into()), ("key", key.into()), ("occupant", "g".into()), ("standing", "s".into())]))
}

/// What her ward told her, as an object she can answer.
fn heard(answer: Answer) -> Map {
    match answer {
        Answer::Value(v) => obj(&[("object", v)]),
        Answer::Silence => obj(&[("silence", true.into())]),
        Answer::Word(w) => obj(&[("word", w.as_str().into())]),
    }
}

impl Being for Echo {
    fn answer(&self, asker: &Asker, method: Option<&str>, args: &Map) -> Result<Answer, Thrown> {
        let text = |f: &str| args.get(f).and_then(Value::as_str);
        Ok(match method {
            None => Answer::Value(Value::Object(obj(&[("asks", Value::Array(vec![])), ("notes", Map::new().into())]))),
            Some("args") => Answer::Value(Value::Object(obj(&[("args", args.clone().into())]))),
            Some("cells") => Answer::Value(self.stance.cells().to_value()),
            Some("invite") => Answer::Value(self.stance.invite(text("id").unwrap(), None).unwrap_or(Value::Null)),
            Some("asker") => Answer::Value(Value::from(asker.id().map(str::to_owned))),
            Some("throw") => return Err(Thrown("she threw".into())),
            Some("quiet") => Answer::Silence,
            Some("boot") => Answer::Value(Value::from(self.stance.boot(text("class").unwrap(), text("key").unwrap(), text("occupant").unwrap(), text("standing").unwrap()))),
            Some("standings") => Answer::Value(self.stance.cells().to_value().get("standings").cloned().unwrap_or(Value::Null)),
            Some("ask") => Answer::Value(Value::Object(heard(self.stance.ask(text("id").unwrap(), text("method"), None, None)))),
            Some("ask deep") => {
                let depth = args.get("depth").and_then(Value::as_number).and_then(|n| n.as_u64()).unwrap() as usize;
                let mut arg = Value::Null;
                for _ in 0..depth {
                    arg = Value::Array(vec![arg]);
                }
                let deep = obj(&[("v", arg)]);
                Answer::Value(Value::Object(heard(self.stance.ask(text("id").unwrap(), Some("asker"), Some(&deep), None))))
            }
            Some("ask big") => {
                let blob = obj(&[("blob", "x".repeat(1 << 20).into())]);
                Answer::Value(Value::Object(heard(self.stance.ask(text("id").unwrap(), Some("args"), Some(&blob), None))))
            }
            Some("knock") => {
                let invitation = args.get("invitation").cloned().unwrap_or(Value::Null);
                let id = text("id").unwrap().to_owned();
                let answer = self.stance.knock(&invitation, Some("args"), None, None);
                let taken = matches!(answer, Answer::Value(_)) && self.stance.take(&id, &invitation).is_some();
                let mut said = heard(answer);
                said.insert("taken", taken);
                Answer::Value(Value::Object(said))
            }
            Some(_) => Answer::Silence,
        })
    }
}

struct World {
    far: MemoryHarbor,
    near: MemoryHarbor,
    a: WardPk,
    b: WardPk,
}

impl World {
    fn new() -> World {
        let entropy = Rc::new(RefCell::new(SplitMix64::new(7)));
        let far = MemoryHarbor::new(stream(&entropy));
        let near = MemoryHarbor::new(stream(&entropy));
        far.link(&near);
        for h in [&far, &near] {
            h.hold("Echo", |stance| Ok(Box::new(Echo { stance })));
        }
        let a = far.boot(Seed::from_text("A"));
        let b = near.boot(Seed::from_text("B"));
        let world = World { far, near, a, b };
        world.root_on(&world.far, &a, "boot", &[("key", "a".into()), ("class", "Echo".into())]);
        world.root_on(&world.near, &b, "boot", &[("key", "b".into()), ("class", "Echo".into())]);
        world
    }

    fn root_on(&self, harbor: &MemoryHarbor, ward: &WardPk, method: &str, args: &[(&str, Value)]) -> Value {
        match harbor.ask(ward, Some(method), Some(&obj(args))) {
            Some(Answer::Value(v)) => v,
            other => panic!("{method}: {other:?}"),
        }
    }

    fn on_a(&self, method: &str, args: &[(&str, Value)]) -> Value {
        self.root_on(&self.far, &self.a, method, args)
    }

    fn on_b(&self, method: &str, args: &[(&str, Value)]) -> Value {
        self.root_on(&self.near, &self.b, method, args)
    }

    /// `a`'s being knocks with `invitation` and takes what answered as `id`.
    fn knock(&self, id: &str, invitation: Value) -> Value {
        self.on_a("ask", &[("being", "a".into()), ("method", "knock".into()), ("args", Value::Object(obj(&[("id", id.into()), ("invitation", invitation)])))])
    }

    fn invite(&self, id: &str) -> Value {
        self.on_b("invite", &[("being", "b".into()), ("id", id.into())])
    }
}

#[test]
fn absent_args_are_handed_to_her_as_the_empty_object() {
    let w = World::new();
    // Across the door: the knock carries no args.
    let knocked = w.knock("g", w.invite("g"));
    assert_eq!(knocked.get("object").unwrap().to_json(), r#"{"args":{}}"#);
    // And the root's ask with none.
    let asked = w.on_b("ask", &[("being", "b".into()), ("method", "args".into())]);
    assert_eq!(asked.to_json(), r#"{"args":{}}"#);
}

#[test]
fn cells_stand_with_standings_and_occupants_from_birth() {
    let w = World::new();
    let cells = w.on_b("ask", &[("being", "b".into()), ("method", "cells".into())]);
    assert_eq!(cells.get("standings"), Some(&Value::Object(Map::new())));
    assert_eq!(cells.get("occupants"), Some(&Value::Object(Map::new())));
    // Nothing of the ward's partition beside her two records is in her cells.
    assert_eq!(cells.as_object().map(Map::count), Some(2));
}

#[test]
fn an_occupant_invited_with_no_notes_has_the_empty_object() {
    let w = World::new();
    w.invite("g");
    w.on_b("ask", &[("being", "b".into()), ("method", "invite".into()), ("args", Value::Object(obj(&[("id", "h".into())])))]);
    let cells = w.on_b("ask", &[("being", "b".into()), ("method", "cells".into())]);
    for id in ["g", "h"] {
        assert_eq!(cells.get("occupants").and_then(|o| o.get(id)).and_then(|r| r.get("notes")), Some(&Value::Object(Map::new())), "{id}");
    }
}

#[test]
fn an_invitation_is_read_by_s1_and_nothing_else() {
    let w = World::new();
    // A field beside the three is ignored.
    let Value::Object(mut beside) = w.invite("g") else { panic!() };
    beside.insert("hint", "somewhere");
    let knocked = w.knock("g", Value::Object(beside));
    assert_eq!(knocked.get("taken").and_then(Value::as_bool), Some(true));
    // A secret that is not the heir's is sent, and meets D6 at the far door:
    // silence, never `invitation`.
    let Value::Object(mut foreign) = w.invite("h") else { panic!() };
    foreign.insert("secret", "5".repeat(64));
    let knocked = w.knock("h", Value::Object(foreign));
    assert_eq!(knocked.get("silence").and_then(Value::as_bool), Some(true));
    // A heir with no secret is no invitation, and nothing was sent.
    let Value::Object(mut halved) = w.invite("i") else { panic!() };
    halved.remove("secret");
    let knocked = w.knock("i", Value::Object(halved));
    assert_eq!(knocked.get("word").and_then(Value::as_str), Some("invitation"));
}

fn ask_on_standing(w: &World, id: &str) -> Value {
    w.on_a("ask", &[("being", "a".into()), ("method", "ask".into()), ("args", Value::Object(obj(&[("id", id.into()), ("method", "args".into())])))])
}

#[test]
fn a_key_kept_under_gone_is_removed_and_absent_is_for_a_heir_still_held() {
    // Removed, while she is there.
    let w = World::new();
    w.knock("g", w.invite("g"));
    assert_eq!(w.on_b("remove", &[("being", "b".into()), ("id", "g".into())]).as_str(), Some("g"));
    assert_eq!(ask_on_standing(&w, "g").to_json(), r#"{"word":"removed"}"#);
    // Removed, and she did not come back this run: `gone` names no being, so
    // still removed.
    let w = World::new();
    w.knock("g", w.invite("g"));
    w.on_b("remove", &[("being", "b".into()), ("id", "g".into())]);
    w.near.release("Echo");
    w.near.restart(&w.b).unwrap();
    assert_eq!(ask_on_standing(&w, "g").to_json(), r#"{"word":"removed"}"#);
    // Still held, and she did not come back this run: absent.
    let w = World::new();
    w.knock("g", w.invite("g"));
    w.near.release("Echo");
    w.near.restart(&w.b).unwrap();
    assert_eq!(ask_on_standing(&w, "g").to_json(), r#"{"word":"absent"}"#);
}

#[test]
fn the_key_vouched_for_when_a_spoken_heir_was_removed_hears_removed() {
    let w = World::new();
    w.knock("g", w.invite("g"));
    // One answered ask: the door holds her key and vouches for the one it
    // announced, and her side moves to that one.
    assert!(ask_on_standing(&w, "g").get("object").is_some());
    w.on_b("remove", &[("being", "b".into()), ("id", "g".into())]);
    // She signs with the key the door vouched for, and it was kept.
    assert_eq!(ask_on_standing(&w, "g").to_json(), r#"{"word":"removed"}"#);
}

#[test]
fn an_ask_above_the_size_is_never_sealed_and_the_relation_is_heard_after_it() {
    let w = World::new();
    w.knock("g", w.invite("g"));
    let before = w.near.digest(&w.b);
    let big = w.on_a("ask", &[("being", "a".into()), ("method", "ask big".into()), ("args", Value::Object(obj(&[("id", "g".into())])))]);
    assert_eq!(big.to_json(), r#"{"word":"unreached"}"#);
    assert_eq!(w.near.digest(&w.b), before, "nothing reached the far door");
    assert!(ask_on_standing(&w, "g").get("object").is_some(), "the gap in the count is harmless");
}

#[test]
fn an_arg_of_depth_sixty_four_stands_whatever_carries_it() {
    let w = World::new();
    w.knock("g", w.invite("g"));
    let deep = |depth: u64| {
        let args = obj(&[("id", "g".into()), ("depth", Value::Number(quo_kit::value::Number::from_u64(depth).unwrap()))]);
        w.on_a("ask", &[("being", "a".into()), ("method", "ask deep".into()), ("args", Value::Object(args))])
    };
    assert_eq!(deep(64).to_json(), r#"{"object":"g"}"#, "sealed, opened and answered");
    let before = w.near.digest(&w.b);
    assert_eq!(deep(65).to_json(), r#"{"word":"unreached"}"#, "an arg past sixty-four is never sealed");
    assert_eq!(w.near.digest(&w.b), before);
}

#[test]
fn a_held_heir_whose_occupant_record_is_gone_hears_removed() {
    let entropy = Rc::new(RefCell::new(SplitMix64::new(7)));
    let wards = Rc::new(RefCell::new(Vec::new()));
    let ground = Rc::new(Storage { wards: wards.clone(), entropy: stream(&entropy), keep: true, asked: Cell::new(0) });
    let (pa, pb) = (Rc::new(RefCell::new(Partition::default())), Rc::new(RefCell::new(Partition::default())));
    let a = Ward::birth(&Seed::from_text("A"), pa, ground.clone());
    let b = Ward::birth(&Seed::from_text("B"), pb.clone(), ground.clone());
    wards.borrow_mut().extend([a.clone(), b.clone()]);
    let value = |answer| match answer {
        Answer::Value(v) => v,
        other => panic!("{other:?}"),
    };
    value(a.ask(Some("boot"), Some(&obj(&[("key", "a".into()), ("class", "Echo".into())]))));
    value(b.ask(Some("boot"), Some(&obj(&[("key", "b".into()), ("class", "Echo".into())]))));
    let invitation = value(b.ask(Some("invite"), Some(&obj(&[("being", "b".into()), ("id", "a".into())]))));
    let knock = obj(&[("invitation", invitation), ("id", "b".into())]);
    let said = value(a.ask(Some("ask"), Some(&obj(&[("being", "a".into()), ("method", "knock".into()), ("args", knock.into())]))));
    assert_eq!(said.get("taken").and_then(Value::as_bool), Some(true));
    // The occupant record goes while the ward is stopped, and the heir it
    // named stays held; the ward is stood again on that partition.
    drop(b);
    wards.borrow_mut().retain(|w| w.pk() != Seed::from_text("B").ward_pk());
    {
        assert!(pb.borrow_mut().forget("b", "a"));
    }
    let b = Ward::birth(&Seed::from_text("B"), pb, ground);
    wards.borrow_mut().push(b);
    let asked = value(a.ask(Some("ask"), Some(&obj(&[("being", "a".into()), ("method", "ask".into()), ("args", Value::Object(obj(&[("id", "b".into()), ("method", "asker".into())])))]))));
    assert_eq!(asked.to_json(), r#"{"word":"removed"}"#);
}

#[test]
fn a_heir_removed_before_it_spoke_leaves_nothing_and_its_knock_is_a_strangers() {
    let w = World::new();
    let invitation = w.invite("g");
    w.on_b("remove", &[("being", "b".into()), ("id", "g".into())]);
    let before = w.near.digest(&w.b);
    let knocked = w.knock("g", invitation);
    assert_eq!(knocked.get("silence").and_then(Value::as_bool), Some(true), "silence, not removed: {knocked}");
    assert_eq!(knocked.get("taken").and_then(Value::as_bool), Some(false));
    assert_eq!(w.near.digest(&w.b), before, "the door wrote nothing");
}

#[test]
fn only_the_first_knock_binds_and_a_later_knocker_births_nothing() {
    let w = World::new();
    w.on_a("boot", &[("key", "c".into()), ("class", "Echo".into())]);
    let invitation = w.invite("g");
    assert_eq!(w.knock("g", invitation.clone()).get("taken").and_then(Value::as_bool), Some(true));
    // Another holder of the same invitation knocks after, twice: her own key
    // first, then the spent heir, and each is a stranger's silence.
    let knock_as_c = || w.on_a("ask", &[("being", "c".into()), ("method", "knock".into()), ("args", Value::Object(obj(&[("id", "g".into()), ("invitation", invitation.clone())])))]);
    for _ in 0..2 {
        let knocked = knock_as_c();
        assert_eq!(knocked.get("silence").and_then(Value::as_bool), Some(true), "{knocked}");
        assert_eq!(knocked.get("taken").and_then(Value::as_bool), Some(false));
    }
    // The relation stays the first knocker's alone.
    assert!(ask_on_standing(&w, "g").get("object").is_some());
}

#[test]
fn a_boot_makes_a_being_with_the_one_relation_her_maker_named() {
    let w = World::new();
    let made = w.on_b("ask", &[("being", "b".into()), ("method", "boot".into()), ("args", boot("Echo", "made"))]);
    assert_eq!(made.as_str(), Some("made"));
    // The one made holds the standing her maker named, and nothing else.
    let standings = w.on_b("ask", &[("being", "made".into()), ("method", "standings".into())]);
    assert_eq!(standings.as_object().map(Map::count), Some(1));
    assert!(standings.get("s").is_some());
    // And her maker holds the occupant that relation was invited under.
    let cells = w.on_b("ask", &[("being", "b".into()), ("method", "cells".into())]);
    assert!(cells.get("occupants").and_then(|o| o.get("g")).is_some());
    // She is reached along that edge, and arrives at her maker as `g`.
    let asked = w.on_b("ask", &[("being", "made".into()), ("method", "ask".into()), ("args", Value::Object(obj(&[("id", "s".into()), ("method", "asker".into())])))]);
    assert_eq!(asked.get("object").and_then(Value::as_str), Some("g"));
}

#[test]
fn a_boot_whose_relation_could_not_be_made_makes_nobody() {
    let w = World::new();
    // The id her maker would invite under already names a record of hers.
    w.invite("g");
    let made = w.on_b("ask", &[("being", "b".into()), ("method", "boot".into()), ("args", boot("Echo", "made"))]);
    assert!(made.is_null());
    // Nobody was made, so there is nobody of that key to ask.
    let asked = w.near.ask(&w.b, Some("ask"), Some(&obj(&[("being", "made".into()), ("method", "cells".into())])));
    assert_eq!(asked, Some(Answer::Silence));
    // And a class the harbor holds no name for makes nobody either.
    let made = w.on_b("ask", &[("being", "b".into()), ("method", "boot".into()), ("args", boot("Nothing", "none"))]);
    assert!(made.is_null());
}

#[test]
fn the_unsealed_ask_answers_a_value_or_silence() {
    let w = World::new();
    // A throw inside is silence, and so is her silence.
    for method in ["throw", "quiet"] {
        assert_eq!(w.near.ask(&w.b, Some("ask"), Some(&obj(&[("being", "b".into()), ("method", method.into())]))), Some(Answer::Silence), "{method}");
    }
    // An ask the ward cannot answer is silence too.
    assert_eq!(w.near.ask(&w.b, Some("nowhere"), None), Some(Answer::Silence));
}

#[test]
fn the_unsealed_ask_is_always_the_root() {
    let w = World::new();
    // The root names the being it asks, and the asker is the root, public
    // being or not. An ask naming nobody is silence: the root has no default.
    assert_eq!(w.on_b("ask", &[("being", "b".into()), ("method", "asker".into())]).as_str(), Some("ROOT"));
    w.on_b("public", &[("key", "b".into())]);
    assert_eq!(w.on_b("ask", &[("being", "b".into()), ("method", "asker".into())]).as_str(), Some("ROOT"));
    assert_eq!(w.near.ask(&w.b, Some("ask"), Some(&obj(&[("method", "asker".into())]))), Some(Answer::Silence));
}

#[test]
fn a_key_nobody_holds_is_drawn_from_random() {
    let entropy = Rc::new(RefCell::new(SplitMix64::new(9)));
    let harbor = MemoryHarbor::new(stream(&entropy));
    let b = harbor.boot(Seed::from_text("B"));
    let at = entropy.borrow().words();
    // The key nobody holds is drawn first, the reply's own key after it: the
    // reply's lid is the public key of the second draw.
    let mut copy = entropy.borrow().clone();
    let _nobody = copy.key();
    let reply_lid = quo_kit::arithmetic::agreement_pk(&copy.key());
    // Thirty-one bytes: no lid, so the reply's key and a lid nobody holds are
    // drawn, four words each.
    let (short, heard) = harbor.door(&b, &[1u8; 31]).unwrap();
    assert!(!heard);
    assert_eq!(short[..32], reply_lid);
    assert_eq!(entropy.borrow().words(), at + 8);
    // Thirty-two bytes that are a lid: only the reply's key is drawn.
    let lid = quo_kit::arithmetic::agreement_pk(&[3u8; 32]);
    let (long, _) = harbor.door(&b, &lid).unwrap();
    assert_eq!(entropy.borrow().words(), at + 12);
    assert_eq!(short.len(), long.len());
    // A lid that will not take a seal, the all-zero point, is answered the
    // same way, and the same short arrival twice is sealed to two keys.
    harbor.door(&b, &[0u8; 32]).unwrap();
    assert_eq!(entropy.borrow().words(), at + 20);
    let (again, _) = harbor.door(&b, &[1u8; 31]).unwrap();
    assert_ne!(again, short);
}

/// A ground that stands wards in one list, and whose storage says `keep`.
struct Storage {
    wards: Rc<RefCell<Vec<Ward>>>,
    entropy: Entropy,
    keep: bool,
    asked: Cell<usize>,
}

impl Ground for Storage {
    fn instantiate(&self, _class: &str, stance: Stance) -> Result<Box<dyn Being>, Unmade> {
        Ok(Box::new(Echo { stance }))
    }
    fn door(&self, ward: &WardPk) -> Option<Ward> {
        self.wards.borrow().iter().find(|w| w.pk() == *ward).cloned()
    }
    fn random(&self, count: usize) -> Vec<u8> {
        (self.entropy)(count)
    }
    fn keep(&self) -> bool {
        self.asked.set(self.asked.get() + 1);
        self.keep
    }
}

#[test]
fn storage_is_asked_after_she_answered_and_its_no_is_a_throw() {
    let entropy = Rc::new(RefCell::new(SplitMix64::new(7)));
    let wards = Rc::new(RefCell::new(Vec::new()));
    let storage = |keep| Rc::new(Storage { wards: wards.clone(), entropy: stream(&entropy), keep, asked: Cell::new(0) });
    let (near, far) = (storage(true), storage(false));
    let a = Ward::birth(&Seed::from_text("A"), Rc::new(RefCell::new(Partition::default())), near.clone());
    let b = Ward::birth(&Seed::from_text("B"), Rc::new(RefCell::new(Partition::default())), far.clone());
    wards.borrow_mut().extend([a.clone(), b.clone()]);
    let value = |answer| match answer {
        Answer::Value(v) => v,
        other => panic!("{other:?}"),
    };
    value(a.ask(Some("boot"), Some(&obj(&[("key", "a".into()), ("class", "Echo".into())]))));
    value(b.ask(Some("boot"), Some(&obj(&[("key", "b".into()), ("class", "Echo".into())]))));
    let invitation = value(b.ask(Some("invite"), Some(&obj(&[("being", "b".into()), ("id", "a".into())]))));

    b.door(&[7u8; 200]);
    assert_eq!(far.asked.get(), 0, "a refusal wrote nothing and asks nothing of storage");

    let knock = obj(&[("invitation", invitation), ("id", "b".into())]);
    let said = value(a.ask(Some("ask"), Some(&obj(&[("being", "a".into()), ("method", "knock".into()), ("args", knock.into())]))));
    assert_eq!(said.get("word").and_then(Value::as_str), Some("threw"), "a no is said as a throw to a bound key");
    assert!(far.asked.get() >= 1, "asked once she answered");
}
