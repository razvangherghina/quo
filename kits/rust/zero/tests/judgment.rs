//! **The same judgment, over all three roads Article III names.**
//!
//! Article III makes the road free and the judgment law: *distance zero
//! waives no step of the judgment*, and by the same sentence neither does any
//! other road. So the cases here are written once and driven three times —
//! over the common carriage on a real loopback socket, over the framed line
//! on another, and over the call at distance zero — with the road's name
//! carried into every assertion. A step honoured on one road and waived on
//! another is a red rather than an absence, which is the whole reason this
//! file exists and the reason it is one file.
//!
//! It lives in `zero` because `zero` is the road that depends on nothing:
//! putting the suite here lets it dev-depend on the other two roads without
//! any crate in the kit depending on a road it does not need.
//!
//! Every key here is pinned. Nothing in this file draws, so every case is
//! reproducible rather than merely repeatable, and the ground is rebuilt for
//! each road so no road inherits another's spent numbers.

#[path = "../../support/hex.rs"]
mod hex;

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use hex::key;
use quo_envelope::{Allowance, Answer, Message, Method, Say};
use quo_warden::{Inbound, Resident, Route, Warden, KEY};

const COUNTER: &str = "Counter\n  bump(by int) int\n  count() int\n";
const LIMIT: i64 = 1 << 20;
const WINDOW: i64 = 64;

const WARDEN_SECRET: &str = "1101010101010101010101010101010101010101010101010101010101010101";
const PADLOCK_SECRET: &str = "2202020202020202020202020202020202020202020202020202020202020202";
const BEING_SECRET: &str = "3303030303030303030303030303030303030303030303030303030303030303";
const HEIR_SECRET: &str = "4404040404040404040404040404040404040404040404040404040404040404";
const VOICE_SECRET: &str = "5505050505050505050505050505050505050505050505050505050505050505";
const CALLER_PADLOCK_SECRET: &str =
    "6606060606060606060606060606060606060606060606060606060606060606";
const STRANGER_SECRET: &str = "7707070707070707070707070707070707070707070707070707070707070707";
const ELSEWHERE_PADLOCK_SECRET: &str =
    "8808080808080808080808080808080808080808080808080808080808080808";
const EPHEMERAL: &str = "9909090909090909090909090909090909090909090909090909090909090909";
const REPLY_EPHEMERAL: &str = "aa0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a0a";
const MINT: &str = "bb0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b";

/// How long a road with no wire form for silence is waited on before silence
/// is what it said. Only the line needs it; the other two say silence with an
/// empty body.
const PATIENCE: Duration = Duration::from_millis(400);

// ---- the ground under test -------------------------------------------

/// One warden, the one being it holds, and one standing granted to
/// [`VOICE_SECRET`]. Exactly the ground every case judges against, rebuilt
/// per road.
struct Ground {
    w: Warden,
    being: [u8; KEY],
    total: i64,
    /// So a reply's ephemeral is never reused inside one road's run — the law
    /// makes it fresh, and reusing one would hide a seal that leaked.
    replies: u8,
}

impl Ground {
    fn stand() -> Ground {
        let name = quo_arithmetic::signing_pk(&key(WARDEN_SECRET));
        let heir = quo_arithmetic::signing_pk(&key(HEIR_SECRET));
        let being = quo_arithmetic::signing_pk(&key(BEING_SECRET));
        let voice = quo_arithmetic::signing_pk(&key(VOICE_SECRET));
        let mut w = Warden::new(
            key(WARDEN_SECRET),
            key(PADLOCK_SECRET),
            quo_arithmetic::commitment(&name, &heir),
            LIMIT,
            WINDOW,
        );
        w.beings.push(Resident {
            being,
            digest: quo_notation::digest(COUNTER).expect("the class this ground holds"),
            commitment: quo_arithmetic::commitment(&name, &heir),
            cells: Vec::new(),
        });
        w.blueprints.push(COUNTER.to_string());
        w.inbound.push(Inbound {
            voice,
            commitment: quo_arithmetic::commitment(&name, &heir),
            minted_at: name,
            beings: vec![being],
            mark: 0,
            spent: Vec::new(),
            padlock: None,
            hints: Vec::new(),
        });
        Ground {
            w,
            being,
            total: 0,
            replies: 0,
        }
    }

    fn name(&self) -> [u8; KEY] {
        self.w.name
    }

    fn padlock(&self) -> [u8; KEY] {
        self.w.padlock
    }

    /// The whole of what a door does with an arriving envelope, on any road.
    /// **Every failure is the same failure**: the door answers with silence
    /// and never says which step it was.
    fn judge(&mut self, envelope: &[u8]) -> Option<Vec<u8>> {
        let verdict = self.w.judge(envelope, 1_000).ok()?;
        let data = match verdict.route.clone() {
            Route::Being { being, method } => Some(self.invoke(&being, &method).ok()?),
            _ => self.w.answer(&verdict, Some(&key(MINT))).ok()?,
        };
        let mut ephemeral = key(REPLY_EPHEMERAL);
        ephemeral[0] = ephemeral[0].wrapping_add(self.replies);
        self.replies = self.replies.wrapping_add(1);
        self.w.reply(&verdict.say, data, &ephemeral).ok()
    }

    fn invoke(&mut self, being: &[u8; KEY], method: &Method) -> Result<Vec<u8>, String> {
        if being != &self.being {
            return Err("a call at a being this ground does not hold".to_string());
        }
        match method.name.as_str() {
            "bump" => self.total += read_int(&method.args)?,
            "count" => {
                if !method.args.is_empty() {
                    return Err("count takes nothing".to_string());
                }
            }
            _ => return Err("the blueprint declares no such field".to_string()),
        }
        write_int(self.total)
    }
}

fn counter() -> &'static quo_notation::Blueprint {
    static PARSED: std::sync::OnceLock<quo_notation::Blueprint> = std::sync::OnceLock::new();
    PARSED.get_or_init(|| quo_notation::parse(COUNTER).expect("the class this ground holds"))
}

fn read_int(bytes: &[u8]) -> Result<i64, String> {
    match quo_wire::decode(
        counter(),
        &quo_notation::Type::Base("int".to_string()),
        bytes,
    ) {
        Ok(quo_wire::Value::Int(value)) => Ok(value),
        _ => Err("a field whose one argument is not an int".to_string()),
    }
}

fn write_int(value: i64) -> Result<Vec<u8>, String> {
    quo_wire::encode(
        counter(),
        &quo_notation::Type::Base("int".to_string()),
        &quo_wire::Value::Int(value),
    )
    .map_err(|why| why.0)
}

// ---- what a caller composes ------------------------------------------

/// Everything a case may vary about one ask. The defaults are a whole, valid
/// ask from the voice that holds the standing.
struct Ask {
    speaking: [u8; KEY],
    recipient: Option<[u8; KEY]>,
    seq: i64,
    allowance: Allowance,
    being: Option<[u8; KEY]>,
    method: Option<Method>,
    /// Flip one byte of the sealed envelope's signature after it is sealed.
    unsigned: bool,
}

impl Ask {
    fn whole(ground: &Ground) -> Ask {
        Ask {
            speaking: key(VOICE_SECRET),
            recipient: None,
            seq: 1,
            allowance: Allowance {
                time: 30_000,
                hops: 8,
            },
            being: Some(ground.being),
            method: Some(Method {
                name: "bump".to_string(),
                args: write_int(2).expect("an int"),
            }),
            unsigned: false,
        }
    }

    fn seal(&self, ground: &Ground) -> Vec<u8> {
        let say = Say {
            voice: quo_arithmetic::signing_pk(&self.speaking),
            recipient: self.recipient.unwrap_or_else(|| ground.name()),
            commitment: None,
            seq: self.seq,
            padlock: quo_arithmetic::sealing_pk(&key(CALLER_PADLOCK_SECRET)),
            hints: Vec::new(),
            allowance: self.allowance,
            being: self.being,
            method: self.method.clone(),
        };
        // Always sealed to this door's padlock: a message a door cannot
        // unseal never reaches a step to be refused at, and the recipient
        // check is step three precisely because a door can open what is not
        // addressed to it.
        let mut envelope = quo_envelope::seal(
            &self.speaking,
            &key(EPHEMERAL),
            &ground.padlock(),
            &Message::Say(say),
        )
        .expect("a sealed ask");
        if self.unsigned {
            // The signature rides inside the ciphertext, so a flip anywhere in
            // the sealed body is a message the door either cannot open or
            // cannot verify. Both are the same silence, which is the point.
            let at = envelope.len() - 20;
            envelope[at] ^= 0x40;
        }
        envelope
    }
}

/// What came back, opened at the caller by the shorter road of Article XII.
fn opened(back: &[u8]) -> Answer {
    quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), back)
        .expect("an answer at the caller")
}

// ---- the three roads -------------------------------------------------

/// A road: it takes one composed envelope to the far ground and hands back
/// what came back, or `None` for silence. **This is the whole of what a road
/// is**, and the three below differ only in how they say those two things.
trait Road {
    fn carry(&mut self, envelope: &[u8]) -> Option<Vec<u8>>;
}

/// The common carriage: a door on a real loopback socket, one POST per ask.
struct Carriage {
    ground: Arc<Mutex<Ground>>,
    door: Arc<quo_carriage::Door>,
}

impl Road for Carriage {
    fn carry(&mut self, envelope: &[u8]) -> Option<Vec<u8>> {
        let hint = self.door.hint().expect("a hint");
        let door = Arc::clone(&self.door);
        let ground = Arc::clone(&self.ground);
        let serving = thread::spawn(move || {
            door.serve_one(|body| ground.lock().expect("the ground").judge(body))
                .expect("one post carried")
        });
        let back = quo_carriage::post(&hint, envelope).expect("a carriage that carried");
        serving.join().expect("the door served");
        // An empty body is silence's wire form.
        if back.is_empty() {
            None
        } else {
            Some(back)
        }
    }
}

/// The framed line: one persistent connection, answered by a reader behind
/// the door. Silence has no wire form here — nothing comes back at all — so
/// silence is a deadline this caller keeps itself.
struct LineRoad {
    mine: quo_line::Line,
}

impl Road for LineRoad {
    fn carry(&mut self, envelope: &[u8]) -> Option<Vec<u8>> {
        self.mine.send(envelope).expect("a frame sent");
        match self.mine.receive() {
            Ok(quo_line::Arrival::Frame(back)) => Some(back),
            _ => None,
        }
    }
}

/// Distance zero: the call. No socket, no framing, no hint.
struct Zero {
    door: quo_zero::Door<Held>,
}

struct Held(Arc<Mutex<Ground>>);

impl quo_zero::Ground for Held {
    fn arrive(&self, envelope: &[u8]) -> Option<Vec<u8>> {
        self.0.lock().expect("the ground").judge(envelope)
    }
}

impl Road for Zero {
    fn carry(&mut self, envelope: &[u8]) -> Option<Vec<u8>> {
        let back = self.door.post(envelope);
        if back.is_empty() {
            None
        } else {
            Some(back)
        }
    }
}

/// The three roads Article III names, by the names the law gives them.
const ROADS: [&str; 3] = ["the common carriage", "the line", "distance zero"];

/// Open one road onto a ground standing behind it. The ground is the caller's
/// to inspect afterwards, which is how a case asks whether a step was spent.
fn open(road: &str, ground: &Arc<Mutex<Ground>>) -> Box<dyn Road> {
    match road {
        "the common carriage" => Box::new(Carriage {
            ground: Arc::clone(ground),
            door: Arc::new(quo_carriage::Door::bind("127.0.0.1:0").expect("a loopback port")),
        }),
        "the line" => {
            let listener = quo_line::Listener::bind("127.0.0.1:0", LIMIT).expect("a loopback port");
            let hint = listener.hint().expect("a hint");
            let ground = Arc::clone(ground);
            thread::spawn(move || {
                let Ok(mut held) = listener.accept() else {
                    return;
                };
                while let Ok(quo_line::Arrival::Frame(envelope)) = held.receive() {
                    // A judgment that refuses produces no frame, because
                    // silence has no wire form on a line.
                    let reply = ground.lock().expect("the ground").judge(&envelope);
                    if let Some(reply) = reply {
                        if held.send(&reply).is_err() {
                            return;
                        }
                    }
                }
            });
            let mine = quo_line::Line::dial(&hint).expect("a line");
            mine.stream()
                .set_read_timeout(Some(PATIENCE))
                .expect("a deadline of the caller's own");
            Box::new(LineRoad { mine })
        }
        "distance zero" => Box::new(Zero {
            door: quo_zero::Door::new(Held(Arc::clone(ground))),
        }),
        other => panic!("no road named {other}"),
    }
}

/// Run one case over all three roads, each against its own fresh ground.
fn over_every_road(case: impl Fn(&str, &mut dyn Road, &Arc<Mutex<Ground>>)) {
    for road in ROADS {
        let ground = Arc::new(Mutex::new(Ground::stand()));
        let mut open = open(road, &ground);
        case(road, open.as_mut(), &ground);
    }
}

// ---- the judgment, over all three -------------------------------------

// **Article XII, whole: a sealed ask from a voice that holds a standing is
// unsealed, verified, placed, its number spent, its leash spent, routed to
// the being, and answered — sealed to the padlock the payload carried and
// signed by the warden's own name.** The road changes none of it.

#[test]
fn article_xii_a_whole_ask_is_judged_and_answered_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let envelope = {
            let ground = ground.lock().expect("the ground");
            Ask::whole(&ground).seal(&ground)
        };
        let back = carrying
            .carry(&envelope)
            .unwrap_or_else(|| panic!("{road}: a whole ask met silence"));
        let answer = opened(&back);
        let ground = ground.lock().expect("the ground");
        assert_eq!(answer.seq, 1, "{road}: the answer names the ask");
        assert_eq!(
            answer.warden,
            ground.name(),
            "{road}: signed by the warden's own name"
        );
        assert_eq!(
            read_int(&answer.data.clone().expect("data")).expect("an int"),
            2,
            "{road}: the being was invoked and answered"
        );
        assert_eq!(ground.total, 2, "{road}: the being actually ran");
    });
}

// **Step five: spend the seq. Honoured means consumed, and nothing later
// gives it back.** A number already spent is silence on every road.

#[test]
fn article_xii_a_replayed_number_is_silence_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let envelope = {
            let ground = ground.lock().expect("the ground");
            Ask::whole(&ground).seal(&ground)
        };
        assert!(
            carrying.carry(&envelope).is_some(),
            "{road}: the first spending of a number is answered"
        );
        assert!(
            carrying.carry(&envelope).is_none(),
            "{road}: a number already spent is silence"
        );
        assert_eq!(
            ground.lock().expect("the ground").total,
            2,
            "{road}: the replay never reached the being"
        );
    });
}

// **Step five, the other half: the window has an edge.** A number too far
// below the mark is silence, and the mark is the standing's own — so the road
// cannot widen it.

#[test]
fn article_xii_a_number_below_the_window_is_silence_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let (high, stale) = {
            let ground = ground.lock().expect("the ground");
            let mut high = Ask::whole(&ground);
            high.seq = 500;
            let mut stale = Ask::whole(&ground);
            stale.seq = 500 - WINDOW - 1;
            (high.seal(&ground), stale.seal(&ground))
        };
        assert!(
            carrying.carry(&high).is_some(),
            "{road}: a number above the mark is answered and sets it"
        );
        assert!(
            carrying.carry(&stale).is_none(),
            "{road}: a number past the window's edge is silence"
        );
    });
}

// **Step six: spend the leash. Time exhausted or hops at zero → silence.**
//
// Only the two unambiguous exhaustions are asserted: a time budget at or
// below zero, and a hop count below zero. **A hop count of exactly zero is a
// fork in the law and is not asserted here** — Article XII step 6 reads "hops
// at zero → silence", while the same step's next sentence makes the hop count
// govern what a call carries *onward*, under which a zero is a legal leash
// for a call that goes no further. This kit takes the second reading. Two
// builders will read it two ways, so the table rules it and the case that
// pins it is written after.

#[test]
fn article_xii_an_exhausted_leash_is_silence_on_every_road() {
    for spent in [
        Allowance { time: 0, hops: 8 },
        Allowance {
            time: 30_000,
            hops: -1,
        },
    ] {
        over_every_road(|road, carrying, ground| {
            let envelope = {
                let ground = ground.lock().expect("the ground");
                let mut ask = Ask::whole(&ground);
                ask.allowance = spent;
                ask.seal(&ground)
            };
            assert!(
                carrying.carry(&envelope).is_none(),
                "{road}: an exhausted leash ({spent:?}) is silence"
            );
            assert_eq!(
                ground.lock().expect("the ground").total,
                0,
                "{road}: the leash was spent before the being was reached"
            );
        });
    }
}

// **Step three: check the recipient, here and not later — a payload addressed
// elsewhere must never touch this house's records.**

#[test]
fn article_xii_a_message_addressed_elsewhere_is_silence_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let envelope = {
            let ground = ground.lock().expect("the ground");
            let mut ask = Ask::whole(&ground);
            // Sealed to this door, but naming another house inside the signed
            // payload: the door can open it and must still refuse it.
            ask.recipient = Some(quo_arithmetic::signing_pk(&key(STRANGER_SECRET)));
            ask.seal(&ground)
        };
        assert!(
            carrying.carry(&envelope).is_none(),
            "{road}: a payload addressed elsewhere is silence"
        );
        let ground = ground.lock().expect("the ground");
        assert_eq!(
            ground.w.inbound[0].mark, 0,
            "{road}: it never touched this house's records"
        );
        assert!(
            ground.w.inbound[0].spent.is_empty(),
            "{road}: it never touched this house's records"
        );
    });
}

// **Steps one and two: unseal, and verify the signature over the payload.** A
// tampered envelope is silence, and it is silence for the same reason on a
// road that has no wire at all.

#[test]
fn article_xii_a_tampered_envelope_is_silence_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let envelope = {
            let ground = ground.lock().expect("the ground");
            let mut ask = Ask::whole(&ground);
            ask.unsigned = true;
            ask.seal(&ground)
        };
        assert!(
            carrying.carry(&envelope).is_none(),
            "{road}: a tampered envelope is silence"
        );
        assert_eq!(
            ground.lock().expect("the ground").total,
            0,
            "{road}: nothing tampered with reaches a being"
        );
    });
}

// **Step seven: a being this voice may not reach is silence** — the standing
// is what grants the reach, and no road grants it instead.

#[test]
fn article_xii_a_voice_with_no_standing_reaches_no_being_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let (stranger, holder) = {
            let ground = ground.lock().expect("the ground");
            let mut stranger = Ask::whole(&ground);
            stranger.speaking = key(STRANGER_SECRET);
            let mut holder = Ask::whole(&ground);
            holder.method = None;
            holder.seq = 2;
            (stranger.seal(&ground), holder.seal(&ground))
        };
        assert!(
            carrying.carry(&stranger).is_none(),
            "{road}: a stranger reaches no being it was granted nothing at"
        );
        // And the same being, asked for by the voice that does hold the
        // standing, is described — so it was the standing that decided.
        assert!(
            carrying.carry(&holder).is_some(),
            "{road}: the holder reaches what it holds"
        );
    });
}

// **There is no empty ask, because there is a default one: describe. And the
// describe is the warden's answer, never the being's** — including for a
// stranger, whose describe is the warden's own public being.

#[test]
fn article_xii_a_stranger_that_asks_nothing_is_described_to_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let envelope = {
            let ground = ground.lock().expect("the ground");
            let mut ask = Ask::whole(&ground);
            ask.speaking = key(STRANGER_SECRET);
            ask.being = None;
            ask.method = None;
            ask.seal(&ground)
        };
        let back = carrying
            .carry(&envelope)
            .unwrap_or_else(|| panic!("{road}: a stranger's describe met silence"));
        let answer = opened(&back);
        let estate = quo_warden::decode_estate(&answer.data.expect("data")).expect("an estate");
        let held: Vec<[u8; KEY]> = estate
            .classes
            .iter()
            .flat_map(|class| class.beings.iter().map(|one| one.being))
            .collect();
        let ground = ground.lock().expect("the ground");
        assert_eq!(
            held,
            vec![ground.name()],
            "{road}: a stranger is described the public being and nothing else"
        );
    });
}

// **Step eight: the answer is sealed to the return padlock the payload
// carried.** A house holding another padlock cannot read it, whichever road
// it came home on.

#[test]
fn article_xii_the_answer_is_sealed_to_the_padlock_the_ask_carried_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let envelope = {
            let ground = ground.lock().expect("the ground");
            Ask::whole(&ground).seal(&ground)
        };
        let back = carrying
            .carry(&envelope)
            .unwrap_or_else(|| panic!("{road}: a whole ask met silence"));
        assert!(
            quo_envelope::open_at_caller(&key(ELSEWHERE_PADLOCK_SECRET), &back).is_err(),
            "{road}: another padlock opened the answer"
        );
        assert!(
            quo_envelope::open_at_caller(&key(CALLER_PADLOCK_SECRET), &back).is_ok(),
            "{road}: the padlock the ask carried did not open the answer"
        );
    });
}

// **The warden's own being answers to two addresses, and that is meant** —
// named, and omitted — and nothing here can diverge, on any road.

#[test]
fn article_xii_the_wardens_own_being_answers_to_two_addresses_on_every_road() {
    over_every_road(|road, carrying, ground| {
        let (named, omitted) = {
            let ground = ground.lock().expect("the ground");
            let limit = Some(Method {
                name: "limit".to_string(),
                args: Vec::new(),
            });
            let mut named = Ask::whole(&ground);
            named.being = Some(ground.name());
            named.method = limit.clone();
            let mut omitted = Ask::whole(&ground);
            omitted.being = None;
            omitted.method = limit;
            omitted.seq = 2;
            (named.seal(&ground), omitted.seal(&ground))
        };
        let one = opened(&carrying.carry(&named).expect("an answer")).data;
        let two = opened(&carrying.carry(&omitted).expect("an answer")).data;
        assert_eq!(one, two, "{road}: the two addresses diverged");
    });
}

// ---- what distance zero is, and is not --------------------------------

// **Envelope bytes as bytes**: the far house is handed exactly what was
// handed in and the answer comes back exactly as it was given, because there
// is no wire to disagree about and so nothing for this road to add. A hint,
// a frame or a header appearing here would be this road inventing a wire.

#[test]
fn article_iii_distance_zero_hands_the_envelope_over_and_adds_nothing() {
    let seen = Arc::new(Mutex::new(Vec::new()));
    let kept = Arc::clone(&seen);
    let door = quo_zero::Door::new(move |envelope: &[u8]| {
        kept.lock().expect("what arrived").push(envelope.to_vec());
        Some(b"a sealed answer".to_vec())
    });
    assert_eq!(
        door.post(b"a sealed envelope"),
        b"a sealed answer".to_vec(),
        "the answer came back as it was given"
    );
    assert_eq!(
        *seen.lock().expect("what arrived"),
        vec![b"a sealed envelope".to_vec()],
        "the far house was handed the envelope and nothing else"
    );
}

// **Silence is silence at distance zero too**, and it is the same empty
// answer the common carriage puts on the wire.

#[test]
fn article_iii_distance_zero_says_silence_the_way_the_carriage_does() {
    let door = quo_zero::Door::new(|_: &[u8]| None);
    assert!(door.post(b"anything").is_empty());
}

// **An envelope past the cap is not taken in, so it is not judged** — the
// same guard the carriage's door keeps, because a road that has no wire is
// still a road with an appetite.

#[test]
fn article_ii_distance_zero_takes_in_no_more_than_its_cap() {
    let reached = Arc::new(AtomicUsize::new(0));
    let counted = Arc::clone(&reached);
    let door = quo_zero::Door::new(move |_: &[u8]| {
        counted.fetch_add(1, Ordering::SeqCst);
        Some(b"judged".to_vec())
    })
    .with_body_cap(8);
    assert!(door.post(&[0u8; 9]).is_empty(), "past the cap is silence");
    assert_eq!(reached.load(Ordering::SeqCst), 0, "and it was never judged");
    assert_eq!(
        door.post(&[0u8; 8]),
        b"judged".to_vec(),
        "at the cap it goes"
    );
}
