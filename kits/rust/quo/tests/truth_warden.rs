//! Part one of `papers/quo-truth.md`: what the warden provides. Written from
//! that part alone, and every case here is one of its sentences made
//! checkable.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use quo::host::{Host, Road, Standing};
use quo::warden::ground::{Clock, Random};
use quo::warden::{as_int, Being, Handle, Holding, Kind, Memory, Quo, Seeds, Store, Warden, KEY};
use quo::wire::Value;

/// A clock that does not move. Nothing here is about time passing.
struct Still;

impl Clock for Still {
    fn now(&self) -> i64 {
        1_000
    }
}

/// Randomness a bench can drive: every draw differs, and **no two grounds in
/// this process ever draw the same key**, because a ground's name is its
/// address at distance zero and several stand at once when the cases run side
/// by side. A host reads the machine; this counts.
struct Counted {
    house: u64,
    at: AtomicU64,
}

impl Counted {
    fn house() -> Arc<Counted> {
        static HOUSES: AtomicU64 = AtomicU64::new(0);
        Arc::new(Counted {
            house: HOUSES.fetch_add(1, Ordering::SeqCst),
            at: AtomicU64::new(0),
        })
    }
}

impl Random for Counted {
    fn draw(&self) -> [u8; KEY] {
        let mut seed = [0x5au8; KEY];
        seed[..8].copy_from_slice(&self.house.to_be_bytes());
        seed[8..16].copy_from_slice(&self.at.fetch_add(1, Ordering::SeqCst).to_be_bytes());
        seed
    }
}

const COUNTER: &str = "Counter\n  bump() int\n  read() int\n";

/// What the bench watches inside a being: the number, and every caller the
/// closure offered.
type Count = Arc<Mutex<i64>>;
type Seen = Arc<Mutex<Vec<(Option<[u8; KEY]>, Kind)>>>;

/// A being is a plain object of the developer's own. What it shares with the
/// bench that made it is the bench's business, not Quo's.
struct Counter {
    n: Count,
    seen: Seen,
}

impl Counter {
    fn new() -> (Counter, Count, Seen) {
        let n: Count = Arc::new(Mutex::new(0));
        let seen: Seen = Arc::new(Mutex::new(Vec::new()));
        (
            Counter {
                n: n.clone(),
                seen: seen.clone(),
            },
            n,
            seen,
        )
    }
}

impl Being for Counter {
    fn invoke(&mut self, field: &str, _args: &[Value], quo: &Quo) -> Option<Value> {
        self.seen
            .lock()
            .expect("the bench")
            .push(match quo.caller() {
                Some(caller) => (caller.voice, caller.kind),
                None => (None, Kind::Near),
            });
        let mut n = self.n.lock().expect("the bench");
        match field {
            "bump" => {
                *n += 1;
                Some(Value::Int(*n))
            }
            "read" => Some(Value::Int(*n)),
            _ => None,
        }
    }
}

/// What a ground here is stood on: this bench's clock and randomness, a store
/// of its own, and distance zero for its only road.
fn on(store: Arc<dyn Store>) -> Standing {
    let random = Counted::house();
    Standing {
        seeds: Seeds::drawn(random.as_ref()),
        clock: Arc::new(Still),
        random,
        store: None,
        roads: vec![Road::Memory],
        hints: Vec::new(),
        limit: 0,
    }
    .keeping(store)
}

/// Two grounds in one process, reaching each other at distance zero: the host
/// hands bytes straight to the far warden's one entry point. No socket, and no
/// step waived.
fn pair() -> (Host, Host) {
    let alice = Host::stand(on(Arc::new(Memory::new()))).expect("a ground stands");
    let bob = Host::stand(on(Arc::new(Memory::new()))).expect("a ground stands");
    (alice, bob)
}

fn counter_at(warden: &Warden) -> ([u8; KEY], Count, Seen) {
    let (object, n, seen) = Counter::new();
    let (being, _) = warden
        .hold(object, COUNTER, Holding::default())
        .expect("a being this warden holds");
    (being, n, seen)
}

fn bump(handle: &Handle) -> Option<i64> {
    as_int(handle.call("bump", &[]))
}

/// Accepting answers a handle per being the standing names. These cases grant
/// one being, so one handle is what comes back.
fn sole(handles: Vec<Handle>) -> Handle {
    assert_eq!(handles.len(), 1);
    handles.into_iter().next().expect("a handle")
}

#[test]
fn one_entry_point_takes_any_arriving_bytes_and_answers_bytes_or_silence() {
    let (one, two) = pair();
    let (alice, bob) = (&one.warden, &two.warden);
    let (counter, _, _) = counter_at(alice);
    let invitation = alice.grant(counter).expect("a grant names its being");
    let handle = sole(bob.accept(&invitation));

    // An ask arriving is judged and answered.
    assert_eq!(bump(&handle), Some(1));
    // Garbage arriving is silence, and the door says nothing about why.
    assert_eq!(alice.arrive(b"not an envelope", None), None);
    assert_eq!(alice.arrive(&[], None), None);
}

#[test]
fn the_closure_offers_the_caller_as_a_fact_holder_rotation_or_stranger() {
    let (one, two) = pair();
    let (alice, bob) = (&one.warden, &two.warden);
    let (counter, _, seen) = counter_at(alice);
    let invitation = alice.grant(counter).expect("a grant");
    let handle = sole(bob.accept(&invitation));

    // Accepting is two rotations; the first call after it is a plain ask.
    assert_eq!(bump(&handle), Some(1));
    assert_eq!(bump(&handle), Some(2));
    let seen = seen.lock().expect("the bench");
    assert_eq!(seen.len(), 2);
    assert_eq!(seen[0].1, Kind::Holder);
    assert!(seen[0].0.is_some());
}

#[test]
fn standings_are_offered_as_voices_only() {
    let (one, two) = pair();
    let (alice, bob) = (&one.warden, &two.warden);
    let (counter, _, _) = counter_at(alice);
    assert!(alice.standings(counter).is_empty());
    let invitation = alice.grant(counter).expect("a grant");
    sole(bob.accept(&invitation));
    // One voice, and a voice is the whole of what is offered: the marks, the
    // window, the padlock and the hints stay at the door.
    assert_eq!(alice.standings(counter).len(), 1);
}

#[test]
fn grant_names_the_being_it_opens_and_release_takes_every_standing_with_it() {
    let (one, two) = pair();
    let (alice, bob) = (&one.warden, &two.warden);
    let (counter, _, _) = counter_at(alice);
    let (other, _, _) = counter_at(alice);
    let invitation = alice.grant(other).expect("a grant");
    let handle = sole(bob.accept(&invitation));
    assert_eq!(bump(&handle), Some(1));
    // Bob reaches `other` and not `counter`.
    assert_eq!(alice.standings(other).len(), 1);
    assert_eq!(alice.standings(counter).len(), 0);
    // Released: Bob's next call meets silence, indistinguishable from
    // anything else.
    assert!(alice.release(other));
    assert_eq!(bump(&handle), None);
}

#[test]
fn hold_mints_a_smaller_being_beside_me_and_relation_reaches_it_through_the_handle() {
    let (one, _two) = pair();
    let alice = &one.warden;
    let (counter, _, _) = counter_at(alice);
    let quo = alice.quo(counter);
    let (object, _, _) = Counter::new();
    let (small, handle) = quo
        .hold(object, COUNTER, Holding::labelled("small"))
        .expect("a smaller being minted beside me");
    // Same warden, same shape: leashed, and a value or silence.
    assert_eq!(bump(&handle), Some(1));
    assert_eq!(
        as_int(quo.relation("small").expect("a label").call("read", &[])),
        Some(1)
    );
    assert!(quo.release(small));
    assert_eq!(bump(&handle), None);
}

#[test]
fn why_it_fell_silent_is_told_inward_and_nothing_crosses_the_wire() {
    let (one, _two) = pair();
    let alice = &one.warden;
    let reasons = Arc::new(Mutex::new(Vec::new()));
    let kept = reasons.clone();
    alice.observe(move |why| kept.lock().expect("the bench").push(why.to_string()));
    assert_eq!(alice.arrive(b"garbage", None), None);
    let reasons = reasons.lock().expect("the bench");
    assert!(!reasons.is_empty());
    assert!(!reasons[0].is_empty());
}

// A ground that knocks at a door as a stranger and then accepts an invitation
// there holds two rows at that one warden, each with its own voice. A label
// resolved by warden alone lands on whichever came first — the knock's — and
// every ask down it is signed by a key that has no standing at the being.
#[test]
fn a_label_names_the_row_it_was_kept_on_and_not_the_first_at_that_warden() {
    let (alice, bob) = pair();
    let (counter, count, _) = counter_at(&alice.warden);
    let (holder, _, _) = counter_at(&bob.warden);

    // The stranger's row comes first, so a warden-only match would take it.
    bob.warden
        .quo(holder)
        .knock(&alice.warden.card())
        .expect("a handle at the far door's public being");
    let invitation = alice.warden.grant(counter).expect("a grant");
    let quo = bob.warden.quo(holder);
    let handle = sole(quo.accept(&invitation));
    assert!(quo.label("counter", &handle));

    assert_eq!(bump(&handle), Some(1));
    let by_label = bob.warden.relation("counter").expect("the label");
    assert_eq!(as_int(by_label.call("bump", &[])), Some(2));
    assert_eq!(*count.lock().expect("the bench"), 2);
}

#[test]
fn a_label_finds_that_same_row_again_after_a_restart() {
    let store: Arc<dyn Store> = Arc::new(Memory::new());
    let random = Counted::house();
    let seeds = Seeds::drawn(random.as_ref());
    let standing = |store: Arc<dyn Store>| {
        Standing {
            seeds: seeds.clone(),
            clock: Arc::new(Still),
            random: random.clone(),
            store: None,
            roads: vec![Road::Memory],
            hints: Vec::new(),
            limit: 0,
        }
        .keeping(store)
    };

    let alice = Host::stand(on(Arc::new(Memory::new()))).expect("a ground stands");
    let (counter, count, _) = counter_at(&alice.warden);
    let invitation = alice.warden.grant(counter).expect("a grant");

    let seed = [0x33u8; KEY];
    let heir_seed = [0x44u8; KEY];
    let first = Host::stand(standing(store.clone())).expect("a ground stands");
    let (object, _, _) = Counter::new();
    let (holder, _) = first
        .warden
        .hold(
            object,
            COUNTER,
            Holding {
                seed: Some(seed),
                heir_seed: Some(heir_seed),
                ..Holding::default()
            },
        )
        .expect("a being");
    let quo = first.warden.quo(holder);
    quo.knock(&alice.warden.card()).expect("a stranger's row");
    let handle = sole(quo.accept(&invitation));
    assert!(quo.label("counter", &handle));
    assert_eq!(bump(&handle), Some(1));

    first.close();
    let second = Host::stand(standing(store)).expect("the ground stands again");
    let (object, _, _) = Counter::new();
    second
        .warden
        .hold(
            object,
            COUNTER,
            Holding {
                seed: Some(seed),
                heir_seed: Some(heir_seed),
                ..Holding::default()
            },
        )
        .expect("the same being, held again");
    let by_label = second.warden.relation("counter").expect("the label");
    assert_eq!(as_int(by_label.call("bump", &[])), Some(2));
    assert_eq!(*count.lock().expect("the bench"), 2);
}

// A ground decides what it offers a voice that merely knocks. Until it says
// so, the stranger gets one room.
#[test]
fn a_being_the_warden_exposes_is_reached_by_a_stranger() {
    let (alice, bob) = pair();
    let (counter, count, _) = counter_at(&alice.warden);
    let (holder, _, _) = counter_at(&bob.warden);

    let at_door = bob
        .warden
        .quo(holder)
        .knock(&alice.warden.card())
        .expect("a handle at the far door's public being");
    assert_eq!(
        at_door.describe().map(|estate| estate.classes.len()),
        Some(1)
    );

    assert!(alice.warden.expose(counter));
    // Exposing a being it does not hold is refused rather than kept.
    assert!(!alice.warden.expose([9u8; KEY]));
    assert_eq!(
        at_door.describe().map(|estate| estate.classes.len()),
        Some(2)
    );

    // Concealed, the house has one room again.
    assert!(alice.warden.conceal(counter));
    assert!(!alice.warden.conceal(counter));
    assert_eq!(
        at_door.describe().map(|estate| estate.classes.len()),
        Some(1)
    );
    assert_eq!(*count.lock().expect("the bench"), 0);
}

#[test]
fn what_a_warden_exposes_survives_a_restart() {
    let store: Arc<dyn Store> = Arc::new(Memory::new());
    let random = Counted::house();
    let seeds = Seeds::drawn(random.as_ref());
    let standing = |store: Arc<dyn Store>| {
        Standing {
            seeds: seeds.clone(),
            clock: Arc::new(Still),
            random: random.clone(),
            store: None,
            roads: vec![Road::Memory],
            hints: Vec::new(),
            limit: 0,
        }
        .keeping(store)
    };

    let seed = [0x55u8; KEY];
    let heir_seed = [0x66u8; KEY];
    let first = Host::stand(standing(store.clone())).expect("a ground stands");
    let (object, _, _) = Counter::new();
    let (being, _) = first
        .warden
        .hold(
            object,
            COUNTER,
            Holding {
                seed: Some(seed),
                heir_seed: Some(heir_seed),
                public: true,
                ..Holding::default()
            },
        )
        .expect("a being");

    first.close();
    let second = Host::stand(standing(store)).expect("the ground stands again");
    let (object, _, _) = Counter::new();
    second
        .warden
        .hold(
            object,
            COUNTER,
            Holding {
                seed: Some(seed),
                heir_seed: Some(heir_seed),
                ..Holding::default()
            },
        )
        .expect("the same being, held again");
    // Held again without `public`, and still exposed: the store says so.
    assert!(second.warden.conceal(being));
}

#[test]
fn a_hint_is_stored_and_carried_as_an_opaque_string_never_parsed() {
    let (one, two) = pair();
    let (alice, bob) = (&one.warden, &two.warden);
    let (counter, _, _) = counter_at(alice);
    alice.publish("anything at all, even this");
    let invitation = alice.grant(counter).expect("a grant");
    assert!(invitation
        .hints
        .iter()
        .any(|hint| hint == "anything at all, even this"));
    // Delivery walks past what it cannot speak; the door still answers on the
    // road it can.
    let handle = sole(bob.accept(&invitation));
    assert_eq!(bump(&handle), Some(1));
}

#[test]
fn what_must_survive_a_restart_lives_in_the_store_the_host_handed_in() {
    // The store is the host's to hand in: where the records live is its
    // choice, and what goes in them is the warden's.
    let store: Arc<dyn Store> = Arc::new(Memory::new());
    let random = Counted::house();
    let seeds = Seeds::drawn(random.as_ref());
    let standing = |store: Arc<dyn Store>| {
        Standing {
            seeds: seeds.clone(),
            clock: Arc::new(Still),
            random: random.clone(),
            store: None,
            roads: vec![Road::Memory],
            hints: Vec::new(),
            limit: 0,
        }
        .keeping(store)
    };

    let first = Host::stand(standing(store.clone())).expect("a ground stands");
    let alice = &first.warden;
    let two = Host::stand(on(Arc::new(Memory::new()))).expect("a ground stands");
    let bob = &two.warden;

    let seed = [0x11u8; KEY];
    let heir_seed = [0x22u8; KEY];
    let (object, _, _) = Counter::new();
    let (counter, _) = alice
        .hold(
            object,
            COUNTER,
            Holding {
                seed: Some(seed),
                heir_seed: Some(heir_seed),
                ..Holding::default()
            },
        )
        .expect("a being");
    let invitation = alice.grant(counter).expect("a grant");
    let handle = sole(bob.accept(&invitation));
    assert_eq!(bump(&handle), Some(1));
    let spent = handle.seal("bump", &[]).expect("an ask composed");
    assert_eq!(as_int(handle.send(&spent)), Some(2));

    // The process dies. A new host stands on the same seeds and the same
    // store, holds the same object again, and Bob's standing is still there.
    // The seeds are the name, so the road it stands publishes the same hint and
    // the invitation Bob already holds still reaches it.
    first.close();
    let second = Host::stand(standing(store)).expect("the ground stands again");
    let again = &second.warden;
    let (object, count, _) = Counter::new();
    again
        .hold(
            object,
            COUNTER,
            Holding {
                seed: Some(seed),
                heir_seed: Some(heir_seed),
                ..Holding::default()
            },
        )
        .expect("the same being, held again");
    assert_eq!(again.standings(counter).len(), 1);
    assert_eq!(bump(&handle), Some(1));
    assert_eq!(*count.lock().expect("the bench"), 1);
    // The marks survived too: the envelope spent before the restart is
    // silence.
    assert_eq!(handle.send(&spent), None);
}
