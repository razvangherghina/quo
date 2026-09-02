//! Part two of `papers/quo-truth.md`: what a being receives, played as Alice,
//! Bob and the clinic. Written from that part alone. The beings below know
//! which of their references are Quo and nothing about roads or hosts.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use quo::arithmetic::{commitment, signing_pk};
use quo::host::{Host, Road, Standing};
use quo::notation::Type;
use quo::warden::ground::{Clock, Random};
use quo::warden::{
    as_bool, as_bytes, as_int, as_invitation, as_maybe, as_text, Being, Departing, Door, Estate,
    Handle, Holding, Inbound, Memory, Quo, Resident, Seeds, Warden, KEY,
};
use quo::wire::Value;

struct Still;

impl Clock for Still {
    fn now(&self) -> i64 {
        1_000
    }
}

/// Randomness a bench can drive: every draw differs, and **no two grounds in
/// this process ever draw the same key**, because a ground's name is its
/// address at distance zero and two worlds stand at once when the cases run
/// side by side. A host reads the machine; this counts.
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
        let mut seed = [0x71u8; KEY];
        seed[..8].copy_from_slice(&self.house.to_be_bytes());
        seed[8..16].copy_from_slice(&self.at.fetch_add(1, Ordering::SeqCst).to_be_bytes());
        seed
    }
}

const DOG: &str = "Dog\n  name() text\n  logWalk(minutes int) bool\n  vaccinated() bool?\n  invite() invitation\n";
const RECORD: &str = "Record\n  vaccinated() bool\n";
const PROFILE: &str = "Profile\n  name() text\n  rate() int\n";
const WALKER: &str =
    "Walker\n  subscribe(inbox invitation) bool\n  walk(minutes int) bool\n  secret() text\n";
const INBOX: &str = "Inbox\n  walked(minutes int)\n";
const PHOTO: &str = "Photo\n  size() int\n  chunk(at int, many int) bytes\n";

fn int_list() -> Type {
    Type::Many(Box::new(Type::Base("int".to_string())))
}

/// What of a being's state moves with it is the being's own to say, and it
/// says so by writing these two.
fn walks_out(walks: &[i64]) -> Vec<u8> {
    let blueprint = quo_notation::parse(DOG).expect("a blueprint");
    quo_wire::encode(
        &blueprint,
        &int_list(),
        &Value::Many(walks.iter().map(|held| Value::Int(*held)).collect()),
    )
    .expect("the cells write")
}

fn walks_in(cells: &[u8]) -> Vec<i64> {
    let blueprint = quo_notation::parse(DOG).expect("a blueprint");
    match quo_wire::decode(&blueprint, &int_list(), cells) {
        Ok(Value::Many(held)) => held
            .iter()
            .filter_map(|value| match value {
                Value::Int(held) => Some(*held),
                _ => None,
            })
            .collect(),
        _ => Vec::new(),
    }
}

struct Dog {
    dog_name: String,
    walks: Arc<Mutex<Vec<i64>>>,
    leashes: Arc<Mutex<Vec<i64>>>,
}

impl Being for Dog {
    fn invoke(&mut self, field: &str, args: &[Value], quo: &Quo) -> Option<Value> {
        match field {
            "name" => Some(Value::Text(self.dog_name.clone())),
            "logWalk" => {
                let Some(Value::Int(minutes)) = args.first() else {
                    return None;
                };
                self.walks.lock().expect("the bench").push(*minutes);
                Some(Value::Bool(true))
            }
            "vaccinated" => {
                self.leashes
                    .lock()
                    .expect("the bench")
                    .push(quo.leash().hops);
                // A Quo handle looks like what it is, and it may fall silent.
                let record = quo.relation("clinic")?;
                let said = as_bool(record.call("vaccinated", &[]));
                Some(Value::Maybe(said.map(|held| Box::new(Value::Bool(held)))))
            }
            "invite" => Some(Value::Invitation(quo.grant(quo.being())?)),
            _ => None,
        }
    }

    fn cells(&self) -> Vec<u8> {
        walks_out(&self.walks.lock().expect("the bench"))
    }

    fn take(&mut self, cells: &[u8]) {
        *self.walks.lock().expect("the bench") = walks_in(cells);
    }
}

struct Record {
    callers: Arc<Mutex<Vec<[u8; KEY]>>>,
    leashes: Arc<Mutex<Vec<i64>>>,
}

impl Being for Record {
    fn invoke(&mut self, field: &str, _args: &[Value], quo: &Quo) -> Option<Value> {
        if field != "vaccinated" {
            return None;
        }
        if let Some(caller) = quo.caller().and_then(|caller| caller.voice) {
            self.callers.lock().expect("the bench").push(caller);
        }
        self.leashes
            .lock()
            .expect("the bench")
            .push(quo.leash().hops);
        Some(Value::Bool(true))
    }
}

struct Profile;

impl Being for Profile {
    fn invoke(&mut self, field: &str, _args: &[Value], _quo: &Quo) -> Option<Value> {
        match field {
            "name" => Some(Value::Text("Bob".to_string())),
            "rate" => Some(Value::Int(20)),
            _ => None,
        }
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
                let rex = quo.relation("rex")?;
                as_bool(rex.call("logWalk", &[Value::Int(*minutes)]))?;
                if let Some(inbox) = &self.listener {
                    inbox.call("walked", &[Value::Int(*minutes)]);
                }
                Some(Value::Bool(true))
            }
            "secret" => Some(Value::Text("nobody sees this".to_string())),
            _ => None,
        }
    }
}

/// Anything larger than one message crosses as an ordinary being with a size
/// field and a chunk field, asked piece by piece. There is no stream and no
/// second mechanism: a photo is a being like any other.
struct Photo(Vec<u8>);

impl Being for Photo {
    fn invoke(&mut self, field: &str, args: &[Value], _quo: &Quo) -> Option<Value> {
        match field {
            "size" => Some(Value::Int(self.0.len() as i64)),
            "chunk" => {
                let (Some(Value::Int(at)), Some(Value::Int(many))) = (args.first(), args.get(1))
                else {
                    return None;
                };
                let at = usize::try_from(*at).ok()?;
                let many = usize::try_from(*many).ok()?;
                let end = at.saturating_add(many).min(self.0.len());
                Some(Value::Bytes(self.0.get(at..end)?.to_vec()))
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

/// Three grounds, none a tenant of another. Each is a whole host of its own,
/// standing at distance zero, and the hosts are kept because a ground that is
/// dropped takes its road down with it.
struct World {
    _hosts: [Host; 3],
    phone: Warden,
    laptop: Warden,
    clinic: Warden,
    rex: [u8; KEY],
    rex_handle: Handle,
    inbox: [u8; KEY],
    walker: [u8; KEY],
    profile: [u8; KEY],
    record: [u8; KEY],
    walks: Arc<Mutex<Vec<i64>>>,
    heard: Arc<Mutex<Vec<i64>>>,
    callers: Arc<Mutex<Vec<[u8; KEY]>>>,
    dog_leashes: Arc<Mutex<Vec<i64>>>,
    record_leashes: Arc<Mutex<Vec<i64>>>,
}

fn open() -> Host {
    let random = Counted::house();
    Host::stand(
        Standing {
            seeds: Seeds::drawn(random.as_ref()),
            clock: Arc::new(Still),
            random,
            store: None,
            roads: vec![Road::Memory],
            hints: Vec::new(),
            limit: 0,
        }
        .keeping(Arc::new(Memory::new())),
    )
    .expect("a ground stands")
}

/// Accepting answers a handle per being the standing names, and a label names
/// one handle. Every grant below opens one being.
fn sole(handles: Vec<Handle>) -> Handle {
    assert_eq!(handles.len(), 1);
    handles.into_iter().next().expect("a handle")
}

/// The one handle a grant of one being answers, kept under a label of the
/// holder's own.
fn stand(
    warden: &Warden,
    holder: [u8; KEY],
    invitation: &quo::wire::Invitation,
    label: &str,
) -> Handle {
    let quo = warden.quo(holder);
    let handle = sole(quo.accept(invitation));
    assert!(quo.label(label, &handle));
    handle
}

fn world() -> World {
    let hosts = [open(), open(), open()];
    let phone = hosts[0].warden.clone();
    let laptop = hosts[1].warden.clone();
    let clinic = hosts[2].warden.clone();

    let walks = Arc::new(Mutex::new(Vec::new()));
    let heard = Arc::new(Mutex::new(Vec::new()));
    let callers = Arc::new(Mutex::new(Vec::new()));
    let dog_leashes = Arc::new(Mutex::new(Vec::new()));
    let record_leashes = Arc::new(Mutex::new(Vec::new()));

    let (rex, rex_handle) = phone
        .hold(
            Dog {
                dog_name: "Rex".to_string(),
                walks: walks.clone(),
                leashes: dog_leashes.clone(),
            },
            DOG,
            Holding::default(),
        )
        .expect("Rex");
    let (inbox, _) = phone
        .hold(
            Inbox {
                heard: heard.clone(),
            },
            INBOX,
            Holding::default(),
        )
        .expect("Inbox");
    let (walker, _) = laptop
        .hold(Walker { listener: None }, WALKER, Holding::default())
        .expect("Walker");
    let (profile, _) = laptop
        .hold(Profile, PROFILE, Holding::default())
        .expect("Profile");
    let (record, _) = clinic
        .hold(
            Record {
                callers: callers.clone(),
                leashes: record_leashes.clone(),
            },
            RECORD,
            Holding::default(),
        )
        .expect("Record");

    World {
        _hosts: hosts,
        phone,
        laptop,
        clinic,
        rex,
        rex_handle,
        inbox,
        walker,
        profile,
        record,
        walks,
        heard,
        callers,
        dog_leashes,
        record_leashes,
    }
}

/// Every being a described estate names, whatever class it is of.
fn named(estate: &Estate) -> Vec<[u8; KEY]> {
    estate
        .classes
        .iter()
        .flat_map(|class| class.beings.iter().map(|held| held.being))
        .collect()
}

// The two names the notation can spell that the being already owns: it
// provides cells and take rather than receiving them, so a blueprint
// declaring either would make one name mean a caller's ask and the warden's
// own migration hook at once.
#[test]
fn a_blueprint_declaring_cells_or_take_is_refused() {
    let world = world();
    for reserved in ["cells", "take"] {
        let text = format!("Thing\n  {reserved}() bytes\n");
        assert!(
            world
                .phone
                .hold(Profile, &text, Holding::default())
                .is_none(),
            "a blueprint declaring {reserved} was held"
        );
    }
}

#[test]
fn accepting_answers_a_handle_per_being_the_standing_names() {
    let world = world();
    let invitation = world.phone.grant(world.rex).expect("a grant");
    let voice = world.phone.standings(world.rex)[0];
    assert!(world.phone.amend(voice, &[world.inbox], &[]));

    let handles = world.laptop.quo(world.walker).accept(&invitation);
    assert_eq!(handles.len(), 2);
    // The caller can tell which handle is which being: each carries the being
    // it opens and the fields of that being's own class.
    let rex = handles
        .iter()
        .find(|handle| handle.being() == world.rex)
        .expect("a handle at Rex");
    let inbox = handles
        .iter()
        .find(|handle| handle.being() == world.inbox)
        .expect("a handle at Inbox");
    assert!(rex.fields().iter().any(|field| field == "logWalk"));
    assert_eq!(inbox.fields(), vec!["walked".to_string()]);
    assert_eq!(as_text(rex.call("name", &[])), Some("Rex".to_string()));
    inbox.call("walked", &[Value::Int(6)]);
    assert_eq!(*world.heard.lock().expect("the bench"), vec![6]);
}

#[test]
fn a_handles_describe_shows_what_the_row_names_and_never_the_rest_of_the_estate() {
    let world = world();
    let invitation = world.phone.grant(world.rex).expect("a grant");
    let handle = sole(world.laptop.quo(world.walker).accept(&invitation));
    let estate = handle.describe().expect("the estate this voice is shown");
    let named = named(&estate);
    // Rex, and the public being every estate carries. Inbox stands at the same
    // door and the row does not name it, so it is not there.
    assert!(named.contains(&world.rex));
    assert!(named.contains(&world.phone.name()));
    assert!(!named.contains(&world.inbox));
    assert_eq!(named.len(), 2);
}

#[test]
fn a_handle_carries_its_beings_sketch_its_blueprint_and_the_far_doors_limit() {
    let world = world();
    let invitation = world.phone.grant(world.rex).expect("a grant");
    let handle = sole(world.laptop.quo(world.walker).accept(&invitation));
    let digest = quo_notation::digest(DOG).expect("a blueprint");

    let sketch = handle.sketch().expect("Rex's own sketch");
    assert_eq!(sketch.being, world.rex);
    assert_eq!(sketch.digest, digest);
    assert_eq!(handle.blueprint(digest), Some(DOG.to_string()));
    assert_eq!(handle.limit(), Some(0));
}

#[test]
fn a_sketch_of_a_being_this_voice_may_not_reach_is_silence() {
    let world = world();
    let invitation = world.phone.grant(world.rex).expect("a grant");
    let handle = sole(world.laptop.quo(world.walker).accept(&invitation));
    assert!(handle.sketch().is_some());
    let voice = world.phone.standings(world.rex)[0];
    assert!(world.phone.amend(voice, &[], &[world.rex]));
    // The row is gone, so the holder is a stranger and every one of these is
    // the same silence.
    assert_eq!(handle.sketch(), None);
    assert_eq!(
        handle.blueprint(quo_notation::digest(DOG).expect("a blueprint")),
        None
    );
    assert!(handle
        .describe()
        .is_some_and(|estate| named(&estate) == vec![world.phone.name()]));
}

#[test]
fn a_stranger_knocks_at_a_card_and_is_shown_the_public_being_and_nothing_else() {
    let world = world();
    let card = world.phone.card();
    let handle = world
        .laptop
        .quo(world.walker)
        .knock(&card)
        .expect("a handle at the far door's public being");
    assert_eq!(handle.being(), world.phone.name());
    // The estate a stranger is shown is the public being alone, and the
    // blueprint of a class it reaches nothing of is silence.
    assert_eq!(
        handle.describe().map(|estate| named(&estate)),
        Some(vec![world.phone.name()])
    );
    assert_eq!(
        handle.blueprint(quo_notation::digest(DOG).expect("a blueprint")),
        None
    );
    // The public being answers what the warden's own blueprint declares: the
    // limit it publishes, and its own sketch.
    assert_eq!(handle.limit(), Some(0));
    assert_eq!(
        handle.sketch().map(|sketch| sketch.being),
        Some(world.phone.name())
    );
    assert!(handle.fields().iter().any(|field| field == "describe"));
}

#[test]
fn a_widened_standing_is_re_read_from_the_far_door_rather_than_remembered() {
    let world = world();
    let invitation = world.phone.grant(world.rex).expect("a grant");
    let quo = world.laptop.quo(world.walker);
    let handle = sole(quo.accept(&invitation));
    // Nobody is told a standing was widened, and the holder was not holding a
    // handle at Inbox when it was.
    let voice = world.phone.standings(world.rex)[0];
    assert!(world.phone.amend(voice, &[world.inbox], &[]));

    let again = quo.reread(&handle);
    assert_eq!(again.len(), 2);
    let inbox = again
        .iter()
        .find(|held| held.being() == world.inbox)
        .expect("a handle at what was added");
    inbox.call("walked", &[Value::Int(12)]);
    assert_eq!(*world.heard.lock().expect("the bench"), vec![12]);
}

#[test]
fn the_same_warden_path_answers_the_same_introspection() {
    let world = world();
    let invitation = world.phone.grant(world.rex).expect("a grant");
    let far = sole(world.laptop.quo(world.walker).accept(&invitation));
    let near = &world.rex_handle;
    let digest = quo_notation::digest(DOG).expect("a blueprint");

    assert_eq!(near.sketch(), far.sketch());
    assert_eq!(near.blueprint(digest), far.blueprint(digest));
    assert_eq!(near.limit(), far.limit());
    // The house's own view of its estate is all of it: under one warden there
    // are no voices and nothing to withhold.
    let mine = named(&near.describe().expect("the house's own estate"));
    assert!(mine.contains(&world.rex));
    assert!(mine.contains(&world.inbox));
    assert!(mine.contains(&world.phone.name()));
}

#[test]
fn one_alice_lets_bob_walk_rex_a_grant_an_accept_and_walker_holds_a_handle() {
    let world = world();
    // Rex declares `invite`, so opening himself is a field of his own and the
    // grant is made from inside the being.
    let invitation =
        as_invitation(world.rex_handle.call("invite", &[])).expect("Rex opens himself");
    stand(&world.laptop, world.walker, &invitation, "rex");
    let rex = world.laptop.relation("rex").expect("the label");
    assert_eq!(as_text(rex.call("name", &[])), Some("Rex".to_string()));
    assert_eq!(
        as_bool(
            world
                .laptop
                .quo(world.walker)
                .relation("rex")
                .expect("the label")
                .call("logWalk", &[Value::Int(30)])
        ),
        Some(true)
    );
    assert_eq!(*world.walks.lock().expect("the bench"), vec![30]);
}

#[test]
fn two_bob_narrows_what_alice_sees_profile_is_granted_walker_never_is() {
    let world = world();
    let invitation = world.laptop.grant(world.profile).expect("a grant");
    let handle = stand(&world.phone, world.rex, &invitation, "bob");
    assert_eq!(as_text(handle.call("name", &[])), Some("Bob".to_string()));
    assert_eq!(as_int(handle.call("rate", &[])), Some(20));
    // What Profile's blueprint does not declare does not exist for Alice, and
    // nothing of Walker was opened.
    assert!(!handle.fields().iter().any(|field| field == "secret"));
    assert_eq!(handle.call("secret", &[]), None);
    assert!(world.laptop.standings(world.walker).is_empty());
}

#[test]
fn three_the_chain_bob_asks_rex_rex_asks_record_and_the_clinic_sees_rex_not_bob() {
    let world = world();
    let to_clinic = world.clinic.grant(world.record).expect("a grant");
    stand(&world.phone, world.rex, &to_clinic, "clinic");
    let to_rex = world.phone.grant(world.rex).expect("a grant");
    stand(&world.laptop, world.walker, &to_rex, "rex");

    let rex = world.laptop.relation("rex").expect("the label");
    assert_eq!(
        as_maybe(rex.call("vaccinated", &[])),
        Some(Some(Value::Bool(true)))
    );
    // Rex's voice at the clinic is the one the clinic minted for Rex; Bob has
    // no standing there and could not ask directly.
    let callers = world.callers.lock().expect("the bench");
    assert_eq!(callers.len(), 1);
    assert_eq!(vec![callers[0]], world.clinic.standings(world.record));
}

#[test]
fn three_b_the_leash_shrinks_by_one_hop_along_the_chain_and_a_being_never_widens_it() {
    let world = world();
    let to_clinic = world.clinic.grant(world.record).expect("a grant");
    stand(&world.phone, world.rex, &to_clinic, "clinic");
    let to_rex = world.phone.grant(world.rex).expect("a grant");
    stand(&world.laptop, world.walker, &to_rex, "rex");

    world
        .laptop
        .relation("rex")
        .expect("the label")
        .call("vaccinated", &[]);
    let at_rex = world.dog_leashes.lock().expect("the bench")[0];
    let at_clinic = world.record_leashes.lock().expect("the bench")[0];
    assert_eq!(at_clinic, at_rex - 1);
}

#[test]
fn four_subscription_is_a_grant_backwards_inbox_is_the_callback_and_a_push_is_an_ask() {
    let world = world();
    let to_rex = world.phone.grant(world.rex).expect("a grant");
    stand(&world.laptop, world.walker, &to_rex, "rex");
    // Alice hands Bob's Walker an invitation to Inbox, through a field Walker
    // declares. There is no subscribe verb anywhere beneath this.
    let to_walker = world.laptop.grant(world.walker).expect("a grant");
    let bob = stand(&world.phone, world.inbox, &to_walker, "walker");
    let to_inbox = world.phone.grant(world.inbox).expect("a grant");
    assert_eq!(
        as_bool(bob.call("subscribe", &[Value::Invitation(to_inbox)])),
        Some(true)
    );
    assert_eq!(as_bool(bob.call("walk", &[Value::Int(15)])), Some(true));
    assert_eq!(as_bool(bob.call("walk", &[Value::Int(25)])), Some(true));
    assert_eq!(*world.heard.lock().expect("the bench"), vec![15, 25]);
    assert_eq!(*world.walks.lock().expect("the bench"), vec![15, 25]);
}

#[test]
fn four_b_unsubscribing_needs_no_verb_release_inbox_and_the_push_meets_silence() {
    let world = world();
    let to_rex = world.phone.grant(world.rex).expect("a grant");
    stand(&world.laptop, world.walker, &to_rex, "rex");
    let to_walker = world.laptop.grant(world.walker).expect("a grant");
    let bob = stand(&world.phone, world.inbox, &to_walker, "walker");
    let to_inbox = world.phone.grant(world.inbox).expect("a grant");
    bob.call("subscribe", &[Value::Invitation(to_inbox)]);
    bob.call("walk", &[Value::Int(10)]);
    assert!(world.phone.release(world.inbox));
    // The walk is still logged; only the push finds nobody.
    assert_eq!(as_bool(bob.call("walk", &[Value::Int(20)])), Some(true));
    assert_eq!(*world.heard.lock().expect("the bench"), vec![10]);
    assert_eq!(*world.walks.lock().expect("the bench"), vec![10, 20]);
}

#[test]
fn five_alice_fires_bob_amend_and_the_next_call_is_silence() {
    let world = world();
    let to_rex = world.phone.grant(world.rex).expect("a grant");
    stand(&world.laptop, world.walker, &to_rex, "rex");
    let handle = world.laptop.relation("rex").expect("the label");
    assert_eq!(
        as_bool(handle.call("logWalk", &[Value::Int(5)])),
        Some(true)
    );
    let bob = world.phone.standings(world.rex)[0];
    assert!(world.phone.amend(bob, &[], &[world.rex]));
    assert_eq!(handle.call("logWalk", &[Value::Int(5)]), None);
    assert_eq!(handle.call("name", &[]), None);
    assert_eq!(*world.walks.lock().expect("the bench"), vec![5]);
}

#[test]
fn silence_after_a_write_resending_the_identical_envelope_is_honoured_at_most_once() {
    let world = world();
    let to_rex = world.phone.grant(world.rex).expect("a grant");
    stand(&world.laptop, world.walker, &to_rex, "rex");
    let handle = world.laptop.relation("rex").expect("the label");
    // The handle hands back the envelope it sealed, so a caller that met
    // silence resends the same bytes and never a fresh number.
    let sealed = handle
        .seal("logWalk", &[Value::Int(40)])
        .expect("an ask composed");
    assert_eq!(as_bool(handle.send(&sealed)), Some(true));
    assert_eq!(handle.send(&sealed), None);
    assert_eq!(*world.walks.lock().expect("the bench"), vec![40]);
}

#[test]
fn a_same_warden_call_goes_through_the_handle_no_seal_one_shape() {
    let world = world();
    let reasons = Arc::new(Mutex::new(Vec::new()));
    let kept = reasons.clone();
    world
        .phone
        .observe(move |why| kept.lock().expect("the bench").push(why.to_string()));
    let quo = world.phone.quo(world.rex);
    let (_pup, handle) = quo
        .hold(
            Dog {
                dog_name: "Pup".to_string(),
                walks: Arc::new(Mutex::new(Vec::new())),
                leashes: Arc::new(Mutex::new(Vec::new())),
            },
            DOG,
            Holding::labelled("pup"),
        )
        .expect("a smaller being beside Rex");
    assert_eq!(as_text(handle.call("name", &[])), Some("Pup".to_string()));
    assert_eq!(
        as_bool(
            quo.relation("pup")
                .expect("the label")
                .call("logWalk", &[Value::Int(3)])
        ),
        Some(true)
    );
    // Nothing was judged: the door was never asked and never fell silent.
    assert!(reasons.lock().expect("the bench").is_empty());
}

/// A migration carries one being, so what a being minted stays where it was
/// minted with the standings at it untouched. This kit's ground has no
/// migration of its own — a host drives one through the door — so the clause is
/// asserted where it is observable. The door holds two beings and knows nothing
/// of which minted which, and that is exactly why the second one stays.
#[test]
fn a_migration_carries_one_being_and_what_it_minted_stays_where_it_was_minted() {
    let name_secret = [0x51u8; 32];
    let mut door = Door::new(
        name_secret,
        [0x52u8; 32],
        commitment(&signing_pk(&name_secret), &signing_pk(&[0x53u8; 32])),
        65_536,
        8,
    );

    // The minter, with the heir its door committed to, and what it minted
    // beside it.
    let minter = signing_pk(&[0x54u8; 32]);
    let committed = signing_pk(&[0x55u8; 32]);
    let landing = signing_pk(&[0x56u8; 32]);
    let digest = quo_notation::digest(INBOX).expect("a blueprint");
    door.blueprints.push(INBOX.to_string());
    for (being, heir) in [(minter, committed), (landing, signing_pk(&[0x57u8; 32]))] {
        door.beings.push(Resident {
            being,
            digest,
            commitment: commitment(&door.name, &heir),
            cells: Vec::new(),
        });
    }

    // One voice standing at each.
    for (voice, at) in [([0x58u8; 32], minter), ([0x59u8; 32], landing)] {
        door.inbound.push(Inbound {
            voice,
            commitment: commitment(&door.name, &signing_pk(&[0x5au8; 32])),
            minted_at: door.name,
            beings: vec![at],
            mark: 0,
            spent: Vec::new(),
            padlock: None,
            hints: Vec::new(),
        });
    }

    // The cargo carries the standings at the being that moves, and no other.
    let cargo = door.pack(&minter, &committed).expect("a cargo");
    for standing in &cargo.standings {
        assert!(
            !standing.beings.contains(&landing),
            "what the minter minted travelled in its cargo"
        );
    }

    door.depart(
        &minter,
        &Departing {
            heir: committed,
            commitment: commitment(&door.name, &signing_pk(&[0x5bu8; 32])),
            name: door.name,
            padlock: door.padlock,
            hints: Vec::new(),
        },
    )
    .expect("the origin departs the being");

    // The minter is gone; what it minted stands where it was minted, with the
    // standing at it untouched.
    assert!(!door.beings.iter().any(|one| one.being == minter));
    assert!(door.beings.iter().any(|one| one.being == landing));
    assert_eq!(
        door.inbound
            .iter()
            .filter(|row| row.beings.contains(&landing))
            .count(),
        1
    );
}

#[test]
fn anything_larger_than_one_message_crosses_as_a_being_with_a_size_and_a_chunk() {
    let world = world();
    let whole: Vec<u8> = (0..=255u8).cycle().take(1_000).collect();
    let (photo, _) = world
        .phone
        .hold(Photo(whole.clone()), PHOTO, Holding::default())
        .expect("a Photo beside Rex");
    let handle = stand(
        &world.laptop,
        world.walker,
        &world.phone.grant(photo).expect("a grant"),
        "photo",
    );

    // Piece by piece, and each piece an ordinary answer of the declared type.
    let size = as_int(handle.call("size", &[])).expect("the size");
    assert_eq!(size, whole.len() as i64);
    let mut taken = Vec::new();
    while (taken.len() as i64) < size {
        let piece =
            as_bytes(handle.call("chunk", &[Value::Int(taken.len() as i64), Value::Int(256)]))
                .expect("a piece");
        assert!(!piece.is_empty());
        taken.extend_from_slice(&piece);
    }
    assert_eq!(taken, whole);

    // A reader reads its own type and nothing else: what the field answers as
    // an int is not bytes, and reading it as bytes is silence.
    assert_eq!(as_bytes(handle.call("size", &[])), None);
}

#[test]
fn what_a_being_shows_decides_what_moves_cells_and_take_are_the_contract() {
    let walks = Arc::new(Mutex::new(vec![7i64, 8]));
    let rex = Dog {
        dog_name: "Rex".to_string(),
        walks: walks.clone(),
        leashes: Arc::new(Mutex::new(Vec::new())),
    };
    let cells = rex.cells();
    let landed = Arc::new(Mutex::new(Vec::new()));
    let mut again = Dog {
        dog_name: "Rex".to_string(),
        walks: landed.clone(),
        leashes: Arc::new(Mutex::new(Vec::new())),
    };
    again.take(&cells);
    assert_eq!(*landed.lock().expect("the bench"), vec![7, 8]);
}
