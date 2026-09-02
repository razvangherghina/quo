//! Part three of `papers/quo-truth.md`: what the host does. The same being,
//! unchanged, is installed under a warden reached by three roads and gives the
//! same answers; a tab that publishes nothing is pushed to down the line it
//! holds; a closed tab is weather. Written from that part alone.

use std::sync::{Arc, Mutex};

use quo::host::{Host, Road, Standing, Urandom, Wall};
use quo::warden::ground::Via;
use quo::warden::{
    as_bool, as_invitation, as_text, Being, Carried, Delivery, Handle, Holding, Memory, Opening,
    Quo, Seeds, Warden, Way, KEY,
};
use quo::wire::Value;

const DOG: &str = "Dog\n  name() text\n  logWalk(minutes int) bool\n";
const INBOX: &str = "Inbox\n  walked(minutes int)\n";
const WALKER: &str = "Walker\n  subscribe(inbox invitation) bool\n  walk(minutes int) bool\n";

struct Dog {
    walks: Arc<Mutex<Vec<i64>>>,
    /// A being never learns the road. This is here to be asserted empty.
    roads: Vec<String>,
}

impl Being for Dog {
    fn invoke(&mut self, field: &str, args: &[Value], _quo: &Quo) -> Option<Value> {
        match field {
            "name" => Some(Value::Text("Rex".to_string())),
            "logWalk" => {
                let Some(Value::Int(minutes)) = args.first() else {
                    return None;
                };
                self.walks.lock().expect("the bench").push(*minutes);
                Some(Value::Bool(self.roads.is_empty()))
            }
            _ => None,
        }
    }
}

struct Inbox {
    heard: Arc<Mutex<Vec<i64>>>,
}

impl Being for Inbox {
    fn invoke(&mut self, field: &str, args: &[Value], _quo: &Quo) -> Option<Value> {
        if field == "walked" {
            if let Some(Value::Int(minutes)) = args.first() {
                self.heard.lock().expect("the bench").push(*minutes);
            }
        }
        None
    }
}

struct Walker {
    listener: Option<Handle>,
}

impl Being for Walker {
    fn invoke(&mut self, field: &str, args: &[Value], quo: &Quo) -> Option<Value> {
        match field {
            "subscribe" => {
                let Some(Value::Invitation(invitation)) = args.first() else {
                    return None;
                };
                self.listener = quo.accept(invitation).into_iter().next();
                Some(Value::Bool(self.listener.is_some()))
            }
            "walk" => {
                let Some(Value::Int(minutes)) = args.first() else {
                    return None;
                };
                if let Some(inbox) = &self.listener {
                    inbox.call("walked", &[Value::Int(*minutes)]);
                }
                Some(Value::Bool(true))
            }
            _ => None,
        }
    }
}

fn stand(roads: &[Road]) -> Host {
    Host::stand(Standing::here(roads)).expect("a ground stands")
}

/// Accepting answers a handle per being the standing names. These cases grant
/// one being, so one handle is what comes back.
fn one(handles: Vec<Handle>) -> Handle {
    assert_eq!(handles.len(), 1);
    handles.into_iter().next().expect("a handle")
}

fn dog(host: &Host) -> ([u8; KEY], Arc<Mutex<Vec<i64>>>) {
    let walks = Arc::new(Mutex::new(Vec::new()));
    let (being, _) = host
        .warden
        .hold(
            Dog {
                walks: walks.clone(),
                roads: Vec::new(),
            },
            DOG,
            Holding::default(),
        )
        .expect("Rex");
    (being, walks)
}

fn the_same_dog_behind(road: Road) {
    let alice = stand(std::slice::from_ref(&road));
    let bob = stand(&[road]);
    let (rex, walks) = dog(&alice);
    let invitation = alice.warden.grant(rex).expect("a grant");
    let handle = one(bob.warden.accept(&invitation));
    assert_eq!(as_text(handle.call("name", &[])), Some("Rex".to_string()));
    // The being never learned the road: it answers true because it names none.
    assert_eq!(
        as_bool(handle.call("logWalk", &[Value::Int(12)])),
        Some(true)
    );
    assert_eq!(*walks.lock().expect("the bench"), vec![12]);
    alice.close();
    bob.close();
}

#[test]
fn the_same_dog_installed_behind_the_common_carriage_gives_the_same_answers() {
    the_same_dog_behind(Road::http());
}

#[test]
fn the_same_dog_installed_behind_the_line_gives_the_same_answers() {
    the_same_dog_behind(Road::tcp());
}

#[test]
fn the_same_dog_installed_at_distance_zero_gives_the_same_answers() {
    the_same_dog_behind(Road::Memory);
}

#[test]
fn a_hint_the_caller_cannot_speak_is_walked_past_and_the_road_it_can_speak_carries() {
    // Alice publishes a road nobody here can speak, first, and HTTP after it.
    let alice = Host::stand(Standing::here(&[Road::http()]).publishing(&["pigeon://loft"]))
        .expect("a ground stands");
    let bob = stand(&[Road::http()]);
    let (rex, _) = dog(&alice);
    let invitation = alice.warden.grant(rex).expect("a grant");
    assert_eq!(invitation.hints.len(), 2);
    assert_eq!(invitation.hints[0], "pigeon://loft");
    let handle = one(bob.warden.accept(&invitation));
    assert_eq!(as_text(handle.call("name", &[])), Some("Rex".to_string()));
    alice.close();
    bob.close();
}

#[test]
fn a_row_of_roads_this_host_cannot_speak_is_weather_and_nothing_is_tried() {
    // A road this host cannot speak is not a road that failed: nothing was
    // sent, so no door spoke and no road broke. A row of nothing but those is
    // weather, and the number it spent stays spent.
    let alice = Host::stand(
        Standing::here(&[Road::Memory])
            .publishing(&["pigeon://loft", "https://nowhere.example/quo"]),
    )
    .expect("a ground stands");
    let bob = stand(&[Road::Memory]);
    let (rex, _) = dog(&alice);
    let invitation = alice.warden.grant(rex).expect("a grant");
    // The hint the host stood is dropped, so only roads it cannot speak are
    // left in the row.
    let mut unreachable = invitation.clone();
    unreachable.hints.retain(|hint| !hint.starts_with("mem://"));
    assert_eq!(unreachable.hints.len(), 2);
    assert!(bob.warden.accept(&unreachable).is_empty());
    alice.close();
    bob.close();
}

#[test]
fn a_tab_publishes_nothing_and_its_pushes_ride_back_down_the_line_it_holds() {
    // Bob's laptop listens. Alice's tab has no road of its own and dials out.
    let laptop = stand(&[Road::tcp()]);
    let tab = stand(&[]);
    let heard = Arc::new(Mutex::new(Vec::new()));
    let (walker, _) = laptop
        .warden
        .hold(Walker { listener: None }, WALKER, Holding::default())
        .expect("Walker");
    let (inbox, _) = tab
        .warden
        .hold(
            Inbox {
                heard: heard.clone(),
            },
            INBOX,
            Holding::default(),
        )
        .expect("Inbox");
    assert!(tab.warden.hints().is_empty());

    let to_walker = laptop.warden.grant(walker).expect("a grant");
    let bob = one(tab.warden.quo(inbox).accept(&to_walker));
    let to_inbox = tab.warden.grant(inbox).expect("a grant");
    assert_eq!(
        as_bool(bob.call("subscribe", &[Value::Invitation(to_inbox)])),
        Some(true)
    );
    assert_eq!(as_bool(bob.call("walk", &[Value::Int(9)])), Some(true));
    assert_eq!(as_bool(bob.call("walk", &[Value::Int(11)])), Some(true));
    assert_eq!(*heard.lock().expect("the bench"), vec![9, 11]);
    laptop.close();
    tab.close();
}

#[test]
fn a_closed_tab_is_weather_the_push_meets_silence_and_nothing_throws() {
    let laptop = stand(&[Road::tcp()]);
    let tab = stand(&[]);
    let heard = Arc::new(Mutex::new(Vec::new()));
    let (walker, _) = laptop
        .warden
        .hold(Walker { listener: None }, WALKER, Holding::default())
        .expect("Walker");
    let (inbox, _) = tab
        .warden
        .hold(
            Inbox {
                heard: heard.clone(),
            },
            INBOX,
            Holding::default(),
        )
        .expect("Inbox");
    let to_walker = laptop.warden.grant(walker).expect("a grant");
    let bob = one(tab.warden.quo(inbox).accept(&to_walker));
    let to_inbox = tab.warden.grant(inbox).expect("a grant");
    bob.call("subscribe", &[Value::Invitation(to_inbox)]);
    bob.call("walk", &[Value::Int(1)]);
    tab.close();

    // Walker's own answer to itself is unaffected; only the push found
    // nobody, and the number it spent stays spent.
    let alone = laptop.warden.relation("walker");
    assert!(alone.is_none());
    let (_, mine) = laptop
        .warden
        .hold(Walker { listener: None }, WALKER, Holding::labelled("mine"))
        .expect("a second Walker");
    assert_eq!(as_bool(mine.call("walk", &[Value::Int(2)])), Some(true));
    assert_eq!(*heard.lock().expect("the bench"), vec![1]);
    laptop.close();
}

/// A delivery that carries nothing and writes down what it was given. It is
/// the bench's, not the kit's: the kit ships one delivery and it is the host's.
struct Watched(Arc<Mutex<Vec<Way>>>);

impl Delivery for Watched {
    fn send(&self, way: &Way, _envelope: &[u8]) -> Carried {
        self.0.lock().expect("the bench").push(way.clone());
        Carried::Weather {
            tried: way.hints.clone(),
        }
    }
}

#[test]
fn a_road_never_holds_a_secret_and_what_it_keeps_is_addresses() {
    // What delivery is given per row is the way back and nothing else. This
    // asserts what was handed down, so the delivery carries nothing: every send
    // is weather, and the ask meets silence.
    let ways: Arc<Mutex<Vec<Way>>> = Arc::new(Mutex::new(Vec::new()));
    let random = Arc::new(Urandom);
    let open = || {
        Warden::open(
            Opening::new(
                Seeds::drawn(random.as_ref()),
                Arc::new(Wall),
                random.clone(),
            )
            .with_delivery(Arc::new(Watched(ways.clone())))
            .with_store(Arc::new(Memory::new())),
        )
    };
    let one = open();
    let two = open();
    one.publish("pigeon://loft");
    let walks = Arc::new(Mutex::new(Vec::new()));
    let (rex, _) = one
        .hold(
            Dog {
                walks,
                roads: Vec::new(),
            },
            DOG,
            Holding::default(),
        )
        .expect("Rex");
    // Nothing carried, so accepting cannot finish: the assertion is about what
    // delivery was handed, not about an answer.
    assert!(two.accept(&one.grant(rex).expect("a grant")).is_empty());

    let ways = ways.lock().expect("the bench");
    assert!(!ways.is_empty());
    for way in ways.iter() {
        // A padlock is a public key used as an address, and the hints are
        // opaque strings the warden never parsed. There is nothing else in a
        // way back: no voice, no seq, no being, and nothing that was in a seal.
        assert_eq!(way.padlock.len(), KEY);
        assert_eq!(way.hints, vec!["pigeon://loft".to_string()]);
    }
}

#[test]
fn a_being_is_written_once_and_installed_anywhere() {
    // The same class text, the same object, three roads, one set of answers.
    for road in [Road::http(), Road::tcp(), Road::Memory] {
        let alice = stand(std::slice::from_ref(&road));
        let (rex, walks) = dog(&alice);
        let bob = stand(&[road]);
        let handle = one(bob
            .warden
            .accept(&alice.warden.grant(rex).expect("a grant")));
        assert_eq!(as_text(handle.call("name", &[])), Some("Rex".to_string()));
        assert_eq!(
            as_bool(handle.call("logWalk", &[Value::Int(3)])),
            Some(true)
        );
        assert_eq!(*walks.lock().expect("the bench"), vec![3]);
        alice.close();
        bob.close();
    }
}

#[test]
fn an_invitation_crosses_as_data_and_becomes_a_handle_on_the_other_side() {
    let alice = stand(&[Road::Memory]);
    let (rex, _) = dog(&alice);
    let invitation = alice.warden.grant(rex).expect("a grant");
    // An invitation is a value of the notation's own `invitation` type, so it
    // rides as an argument like any other.
    let carried = as_invitation(Some(Value::Invitation(invitation))).expect("an invitation");
    let bob = stand(&[Road::Memory]);
    let handle = one(bob.warden.accept(&carried));
    assert_eq!(as_text(handle.call("name", &[])), Some("Rex".to_string()));
    alice.close();
    bob.close();
}

/// A port nothing is on: taken from the machine and let go, so the address is
/// one a host may then be told to stand at.
fn spare_port() -> u16 {
    let scout = std::net::TcpListener::bind("127.0.0.1:0").expect("a port");
    let port = scout.local_addr().expect("an address").port();
    drop(scout);
    port
}

#[test]
fn a_ground_stands_at_the_address_it_is_told_and_is_reached_there() {
    // Where a ground answers is the operator's to say. Told an address, the
    // host listens on exactly that one and publishes it.
    let port = spare_port();
    let at = format!("127.0.0.1:{port}");
    let alice = Host::stand(Standing::here(&[Road::tcp_at(&at)])).expect("a ground stands");
    assert_eq!(alice.standing(), vec![format!("tcp://{at}")]);
    assert_eq!(alice.warden.hints(), vec![format!("tcp://{at}")]);

    let (rex, walks) = dog(&alice);
    let bob = stand(&[]);
    let handle = one(bob
        .warden
        .accept(&alice.warden.grant(rex).expect("a grant")));
    assert_eq!(as_text(handle.call("name", &[])), Some("Rex".to_string()));
    assert_eq!(
        as_bool(handle.call("logWalk", &[Value::Int(4)])),
        Some(true)
    );
    assert_eq!(*walks.lock().expect("the bench"), vec![4]);
    alice.close();
    bob.close();
}

#[test]
fn a_road_told_an_address_it_cannot_have_does_not_stand_and_the_ground_is_not_half_up() {
    // The address is held while a second host is told to stand on it.
    let port = spare_port();
    let at = format!("127.0.0.1:{port}");
    let held = Host::stand(Standing::here(&[Road::http_at(&at)])).expect("a ground stands");

    // An address already taken is a refusal, not a quiet fall back to
    // loopback, and neither is a nonsense address.
    assert!(Host::stand(Standing::here(&[Road::http_at(&at)])).is_err());
    assert!(Host::stand(Standing::here(&[Road::tcp_at(&at)])).is_err());
    assert!(Host::stand(Standing::here(&[Road::tcp_at("not an address")])).is_err());

    // Nothing else claimed the address, and the ground that has it still
    // answers there.
    assert_eq!(held.standing(), vec![format!("http://{at}/")]);
    held.close();
}

#[test]
fn a_host_says_which_lines_it_holds_and_says_nothing_of_what_rides_on_them() {
    let laptop = Host::stand(Standing::here(&[Road::tcp()])).expect("a ground stands");
    let tab = stand(&[]);
    assert!(laptop.lines().is_empty());
    assert!(tab.lines().is_empty());

    let (rex, _) = dog(&laptop);
    let handle = one(tab
        .warden
        .accept(&laptop.warden.grant(rex).expect("a grant")));
    assert_eq!(as_text(handle.call("name", &[])), Some("Rex".to_string()));

    // The tab dialled out; the laptop accepted. Each holds its own end open.
    let dialled = tab.lines();
    assert_eq!(dialled.len(), 1);
    assert!(dialled[0].open);
    assert!(tab.holds(dialled[0].via));
    let accepted = laptop.lines();
    assert_eq!(accepted.len(), 1);
    assert!(accepted[0].open);
    assert!(laptop.holds(accepted[0].via));

    // A token this host never handed out is not held, and asking is not a
    // way to learn one: it answers the same as a line let go.
    assert!(!tab.holds(Via(9_999)));
    assert!(!laptop.holds(Via(9_999)));

    tab.close();
    assert!(!tab.holds(dialled[0].via));
    assert!(tab.lines().iter().all(|line| !line.open));
    // A closed ground stands no road.
    assert!(tab.standing().is_empty());
    laptop.close();
    assert!(!laptop.holds(accepted[0].via));
    assert!(laptop.standing().is_empty());
}
