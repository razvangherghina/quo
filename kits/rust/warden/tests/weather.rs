//! The caller's side of Article VIII's trap, and Article III's weather.
//!
//! A rotation is judged at the far door before the number is, so an answer
//! lost on the way back leaves the takeover done and the caller unable to see
//! it. A kit that gave up there would throw away a standing that stands, on
//! keys only it has seen, and leave the granter's own key live. The recovery
//! the law names is to ask again on the new voice.
//!
//! Weather is the other half: no road carried the bytes, so no door heard,
//! nothing moved, and the caller retries with exactly what it holds. It is
//! never the far door's silence and is never retried from inside accept.
//!
//! Two whole grounds stand here, joined by a road the bench can break.

use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};

use quo_warden as warden;
use quo_wire::Value;
use warden::ground::Random;
use warden::{
    as_int, Being, Carried, Delivery, Handle, Holding, Memory, Opening, Quo, Seeds, Warden, Way,
    KEY,
};

const COUNTER: &str = "Counter\n  bump() int\n";

const ALICE: &str = "mem://alice";

/// What an accept costs the road: two rotations and the ask for the class's
/// blueprint. One more when the first rotation's answer is lost, and it is
/// the plain ask that finds out the rotation landed.
const SENDS: usize = 3;
const SENDS_RECOVERED: usize = 4;

/// Draws that never repeat and never collide between the two grounds: a
/// ground's name is its address here, and two grounds drawing the same key
/// would be one ground.
struct Counted {
    house: u8,
    at: Mutex<u64>,
}

impl Random for Counted {
    fn draw(&self) -> [u8; KEY] {
        let mut at = self.at.lock().expect("the bench");
        *at += 1;
        let mut key = [0u8; KEY];
        key[0] = self.house;
        key[1..9].copy_from_slice(&at.to_be_bytes());
        key[9] = 0xc0;
        key
    }
}

struct Counter(Arc<Mutex<i64>>);

impl Being for Counter {
    fn invoke(&mut self, field: &str, _args: &[Value], _quo: &Quo) -> Option<Value> {
        let mut n = self.0.lock().expect("the bench");
        match field {
            "bump" => {
                *n += 1;
                Some(Value::Int(*n))
            }
            _ => None,
        }
    }
}

/// The road between the two grounds, and the only thing here that can break.
/// It carries whole envelopes and opens none.
#[derive(Default)]
struct Between {
    doors: Mutex<Vec<(String, Warden)>>,
    /// How many answers still to drop on the floor after the far door has
    /// judged the envelope. This is the trap: the far door heard, and the
    /// caller sees what silence looks like.
    drop: AtomicUsize,
    sends: AtomicUsize,
}

impl Between {
    fn attach(&self, hint: &str, warden: &Warden) {
        self.doors
            .lock()
            .expect("the bench")
            .push((hint.to_string(), warden.clone()));
    }

    fn detach(&self, hint: &str) {
        self.doors
            .lock()
            .expect("the bench")
            .retain(|(under, _)| under != hint);
    }

    fn far(&self, hint: &str) -> Option<Warden> {
        self.doors
            .lock()
            .expect("the bench")
            .iter()
            .find(|(under, _)| under == hint)
            .map(|(_, warden)| warden.clone())
    }
}

impl Delivery for Between {
    fn send(&self, way: &Way, envelope: &[u8]) -> Carried {
        self.sends.fetch_add(1, Ordering::SeqCst);
        for hint in &way.hints {
            let Some(far) = self.far(hint) else { continue };
            let back = far.arrive(envelope, None);
            // The door judged it. Whether its answer rides back is the road's
            // business, and a lost one is silence to the caller.
            if self.drop.load(Ordering::SeqCst) > 0 {
                self.drop.fetch_sub(1, Ordering::SeqCst);
                return Carried::Silence;
            }
            return match back {
                Some(bytes) => Carried::Answer(bytes),
                None => Carried::Silence,
            };
        }
        Carried::Weather {
            tried: way.hints.clone(),
        }
    }
}

struct World {
    road: Arc<Between>,
    alice: Warden,
    bob: Warden,
    counter: [u8; KEY],
    /// The voice the grant minted, which the granter has seen and which both
    /// rotations exist to retire.
    granted: [u8; KEY],
    invitation: quo_wire::Invitation,
}

fn ground(house: u8, road: &Arc<Between>) -> Warden {
    let random = Arc::new(Counted {
        house,
        at: Mutex::new(0),
    });
    Warden::open(
        Opening::new(Seeds::drawn(random.as_ref()), Arc::new(|| 1_000i64), random)
            .with_delivery(road.clone())
            .with_store(Arc::new(Memory::new())),
    )
}

fn world() -> World {
    let road: Arc<Between> = Arc::new(Between::default());
    let alice = ground(0x0a, &road);
    let bob = ground(0x0b, &road);
    road.attach(ALICE, &alice);
    alice.publish(ALICE);

    let (counter, _) = alice
        .hold(
            Counter(Arc::new(Mutex::new(0))),
            COUNTER,
            Holding::default(),
        )
        .expect("a being alice holds");
    let invitation = alice.grant(counter).expect("a grant names its being");
    let standings = alice.standings(counter);
    assert_eq!(standings.len(), 1, "the grant is the only standing there");
    World {
        road,
        alice,
        bob,
        counter,
        granted: standings[0],
        invitation,
    }
}

fn sole(handles: Vec<Handle>) -> Handle {
    assert_eq!(handles.len(), 1);
    handles.into_iter().next().expect("a handle")
}

fn watch(warden: &Warden) -> Arc<Mutex<Vec<String>>> {
    let heard: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));
    let told = heard.clone();
    warden.observe(move |why| told.lock().expect("the bench").push(why.to_string()));
    heard
}

#[test]
fn accept_recovers_a_rotation_whose_answer_was_lost_by_asking_again_on_the_new_voice() {
    // The first rotation reaches the door and lands at step 4; the answer
    // rides a road that drops it. To the caller that is silence, and the
    // reading which loses the standing is "nothing landed, rotate again" —
    // signed with the key the door has just retired. The kit reads it the
    // other way and asks again on the new voice.
    let world = world();
    world.road.drop.store(1, Ordering::SeqCst);

    let handle = sole(world.bob.accept(&world.invitation));
    assert_eq!(world.road.drop.load(Ordering::SeqCst), 0, "one was dropped");
    assert_eq!(
        world.road.sends.load(Ordering::SeqCst),
        SENDS_RECOVERED,
        "one send more than an accept that met no trouble, and it is the plain ask",
    );
    assert_eq!(as_int(handle.call("bump", &[])), Some(1));

    // Both rotations landed: every key the granter ever saw is dead, and the
    // standing stands on one this ground minted.
    let standing = world.alice.standings(world.counter);
    assert_eq!(standing.len(), 1, "one standing, taken over twice");
    assert_ne!(standing[0], world.granted, "the granted voice died");
    assert_ne!(
        standing[0], world.invitation.heir,
        "and so did the invitation's key, at step 4"
    );
}

#[test]
fn accept_that_met_weather_leaves_the_invitation_whole_and_the_same_one_is_accepted_next() {
    // Weather is not silence: no road carried the bytes, so the door never
    // heard and the invitation's key is as live as when it was minted. The
    // ground is told the road's fault and keeps nothing.
    let world = world();
    let heard = watch(&world.bob);
    world.road.detach(ALICE);

    assert!(
        world.bob.accept(&world.invitation).is_empty(),
        "nothing carried, so nothing was accepted"
    );
    let told = heard.lock().expect("the bench").clone();
    assert_eq!(told.len(), 1, "weather is reported once and never retried");
    assert!(told[0].starts_with("weather:"), "told: {}", told[0]);
    assert!(told[0].contains(ALICE), "with the road tried: {}", told[0]);
    assert_eq!(
        world.alice.standings(world.counter),
        vec![world.granted],
        "the granter still holds exactly what it granted",
    );

    world.road.attach(ALICE, &world.alice);
    world.road.sends.store(0, Ordering::SeqCst);
    let handle = sole(world.bob.accept(&world.invitation));
    assert_eq!(as_int(handle.call("bump", &[])), Some(1));
    assert_eq!(
        world.road.sends.load(Ordering::SeqCst),
        SENDS + 1,
        "an accept that met no trouble, and the bump after it",
    );
}

#[test]
fn a_handle_that_meets_weather_answers_silence_and_tells_the_ground_the_road() {
    // The handle keeps its shape — a value or silence — because a being
    // pushing into a subscriber that closed its tab is not in error. What
    // changes is inward: the ground's own observer is told it was the road and
    // not the door, and the handle does not go asking whether the being moved.
    let world = world();
    let handle = sole(world.bob.accept(&world.invitation));
    assert_eq!(as_int(handle.call("bump", &[])), Some(1));

    let heard = watch(&world.bob);
    world.road.detach(ALICE);
    let before = world.road.sends.load(Ordering::SeqCst);
    assert_eq!(as_int(handle.call("bump", &[])), None);
    assert_eq!(
        world.road.sends.load(Ordering::SeqCst) - before,
        1,
        "no `moved` was asked down a road that just failed",
    );
    let told = heard.lock().expect("the bench").clone();
    assert_eq!(told.len(), 1);
    assert!(told[0].starts_with("weather:"), "told: {}", told[0]);

    // The number is spent on this side alone, and the next ask rises past it.
    world.road.attach(ALICE, &world.alice);
    assert_eq!(as_int(handle.call("bump", &[])), Some(2));
}
