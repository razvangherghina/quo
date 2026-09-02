//! `subject`: a Quo ground another language can knock on, and knock with.
//!
//! It exists so a kit written from the law in one language can be shown to
//! speak to a kit written from the law in another, with neither side ever
//! reading the other's source.
//!
//! **Two modes.** `serve` hangs a door on the common carriage, holds one
//! granted being, mints an invitation, and prints one line of plain facts on
//! startup — everything a stranger needs to speak to it and nothing about how
//! it is built. It does not publish the being: the invitation does not even
//! name it, so a stranger rotates, describes, and finds what it now reaches.
//! `speak` takes another door's facts the same way and sends it a real
//! message, reporting what came back.
//!
//! **And `speak -zero` is the third road.** It takes no facts, because there
//! is no stranger to hand them over: the process stands the far house itself,
//! mints the invitation, prints it, and then speaks to it exactly as it would
//! speak to a house on another continent. Distance zero waives no step, so
//! this is the mode that shows it — the same rotation, the same numbers, the
//! same seals, over a road with no wire.
//!
//! Either mode runs over the framed line instead of the common carriage when
//! it is given `-line`, and **nothing above the road changes**: the same
//! warden, the same invitation, the same messages. Speaking over a line this
//! command can also hold a being of its own and grant the far ground a
//! standing at it, so the ground it dialled can ask down the connection it
//! never opened — which is the whole reason a line is worth holding.
//!
//! **Serving over a line, `-push` is the other half of that**: this ground
//! asks down a connection it accepted. A standing granted back never travels
//! on the wire, so it is handed to this command one JSON object per line on
//! stdin, and each is spent on a line this door accepted.
//!
//! The facts line is JSON because a hint is an opaque string the protocol
//! never parses, and a space-separated line cannot carry one that holds a
//! space. Every line this command prints is one JSON object carrying the
//! member `quo`, and that is the whole of its contract with a driver.
//!
//! **A subject is not a host, and this one stands below the host's seam on
//! purpose.** It exists to prove the kit from outside, which means composing
//! what no application may: an ask naming neither being nor method, argument
//! bytes handed over as raw hex and deliberately malformed, an ask at a being
//! whose blueprint this side does not hold, and the seq it spent read straight
//! back. Every one of those is something `quo::host` refuses by design — a
//! handle encodes through the blueprint, so it cannot produce the input a
//! refusal is asserted with, and it never hands its caller a number. So this
//! drives [`Door`] itself, the way a wire suite hand-writes bytes, and it
//! stands its own roads because a ground is one thing and cannot be half a
//! host. **The seam never grows a raw-ask surface to accommodate this**: that
//! would ship every application a public way around the blueprint, permanently,
//! for the harness's benefit.
//!
//! Standing below the seam, this file is where the host things are for this
//! binary: the clock, the sockets and every draw of randomness. The crates
//! beneath it reach for none of them.

#[path = "../../support/json.rs"]
mod json;

use std::collections::BTreeMap;
use std::fs::File;
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use json::Json;
use quo_arithmetic as arithmetic;
use quo_envelope::{Allowance, Method};
use quo_line::{Arrival, Line, Listener};
use quo_notation::{Blueprint, Type};
use quo_warden::{warden_digest, Door, Estate, Inbound, Resident, Route, KEY};
use quo_wire::Value;

/// The class the door holds. A stranger is told none of this: it learns the
/// digest from a describe and the text by asking the warden for the blueprint
/// that hashes to it, which is the path the law already gives.
///
/// Both fields ride as one `int`, so a kit in any language can call them
/// without a codec of its own.
const COUNTER: &str = "Counter\n  bump(by int) int\n  count() int\n";

/// What this ground will take in, and — on a line — what its road promises.
const LIMIT: i64 = 1 << 20;

/// How long a caller waits on a road that has no wire form for silence.
const PATIENCE: Duration = Duration::from_secs(10);

type Told<T> = Result<T, String>;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let outcome = match args.first().map(String::as_str) {
        Some("serve") => serve(&args[1..]),
        Some("speak") => speak(&args[1..]),
        Some(other) => Err(format!("no mode named {other:?}")),
        None => Err("usage: subject serve|speak".to_string()),
    };
    if let Err(why) = outcome {
        eprintln!("subject: {why}");
        std::process::exit(1);
    }
}

// ---- the ground ------------------------------------------------------

/// This command's warden and the one object it holds. A warden is not
/// concurrent and both roads reach it from more than one thread — a line
/// judges arriving frames on its reader while the main thread composes asks
/// of its own — so it is reached only under one lock.
struct Ground {
    w: Door,
    /// The being this ground holds, and the number inside it. An ordinary
    /// object: it never learns it has an address, judges nothing, and sees no
    /// key.
    held: Option<([u8; KEY], i64)>,
}

impl Ground {
    /// A whole ground. Every key is a fresh draw: nothing here is pinned,
    /// because nothing here is a vector.
    fn stand(limit: i64) -> Told<Ground> {
        let name_secret = draw()?;
        let heir = arithmetic::signing_pk(&draw()?);
        let name = arithmetic::signing_pk(&name_secret);
        Ok(Ground {
            w: Door::new(
                name_secret,
                draw()?,
                arithmetic::commitment(&name, &heir),
                limit,
                64,
            ),
            held: None,
        })
    }

    /// Put the one being up. The warden holds the class text, so a stranger
    /// can fetch it by the digest a describe named.
    fn hold(&mut self) -> Told<[u8; KEY]> {
        let being = arithmetic::signing_pk(&draw()?);
        let heir = arithmetic::signing_pk(&draw()?);
        let digest = quo_notation::digest(COUNTER).map_err(|why| why.0)?;
        self.w.beings.push(Resident {
            being,
            digest,
            commitment: arithmetic::commitment(&self.w.name, &heir),
            cells: Vec::new(),
        });
        self.w.blueprints.push(COUNTER.to_string());
        self.held = Some((being, 0));
        Ok(being)
    }

    /// Mint one invitation to that being: a voice this ground draws and never
    /// hands out, and the heir it commits to, which is the whole of what a
    /// holder is given. **The holder's first act is therefore a rotation**,
    /// because whoever minted a voice has seen its keys.
    fn grant(&mut self, being: [u8; KEY]) -> Told<Invitation> {
        let voice = arithmetic::signing_pk(&draw()?);
        let heir_secret = draw()?;
        let heir = arithmetic::signing_pk(&heir_secret);
        let commitment = arithmetic::commitment(&self.w.name, &heir);
        self.w.inbound.push(Inbound {
            voice,
            commitment,
            minted_at: self.w.name,
            beings: vec![being],
            mark: 0,
            spent: Vec::new(),
            padlock: None,
            hints: Vec::new(),
        });
        Ok(Invitation {
            warden: self.w.name,
            commitment,
            padlock: self.w.padlock,
            heir,
            heir_secret,
            hints: Vec::new(),
        })
    }

    /// The whole of what a door does with an arriving message. Every failure
    /// is the same failure: the door answers with silence, and the reason
    /// goes to this host's own stderr and nowhere else.
    fn judge(&mut self, envelope: &[u8]) -> Option<Vec<u8>> {
        match self.answer(envelope) {
            Ok(reply) => reply,
            Err(why) => {
                eprintln!("subject: refused: {why}");
                None
            }
        }
    }

    fn answer(&mut self, envelope: &[u8]) -> Told<Option<Vec<u8>>> {
        let verdict = self.w.judge(envelope, now()).map_err(|why| why.0)?;
        // A route to a being is not the warden's to answer: steps one through
        // six were the warden's alone, and the being never learns any of them
        // happened.
        let data = match verdict.route.clone() {
            Route::Being { being, method } => Some(self.invoke(&being, &method)?),
            _ => self
                .w
                // A destination mints two keys for an arriving being: the name
                // it takes here and that name's heir.
                .answer(&verdict, Some(&[draw()?, draw()?]))
                .map_err(|why| why.0)?,
        };
        self.w
            .reply(&verdict.say, data, &draw()?)
            .map(Some)
            .map_err(|why| why.0)
    }

    fn invoke(&mut self, being: &[u8; KEY], method: &Method) -> Told<Vec<u8>> {
        let Some((held, total)) = self.held.as_mut() else {
            return Err("a call at a being this ground does not hold".to_string());
        };
        if held != being {
            return Err("a call at a being this ground does not hold".to_string());
        }
        match method.name.as_str() {
            // Bytes left after the declared arguments are the being's to
            // refuse, never the warden's.
            "bump" => *total += read_int(&method.args)?,
            "count" => {
                if !method.args.is_empty() {
                    return Err("count takes nothing".to_string());
                }
            }
            _ => return Err("the blueprint declares no such field".to_string()),
        }
        write_int(*total)
    }
}

/// The five things a holder holds, and the roads it holds them at.
#[derive(Clone)]
struct Invitation {
    warden: [u8; KEY],
    commitment: [u8; KEY],
    padlock: [u8; KEY],
    heir: [u8; KEY],
    heir_secret: [u8; KEY],
    hints: Vec<String>,
}

impl Invitation {
    /// What a stranger is owed and no more. The law never says in what form a
    /// door publishes it, so this shape is this subject's own and the far
    /// side is handed it verbatim.
    fn facts(&self) -> String {
        object(&[
            ("quo", J::Int(1)),
            ("role", J::Text("door".to_string())),
            ("warden", J::key(&self.warden)),
            ("commitment", J::key(&self.commitment)),
            ("padlock", J::key(&self.padlock)),
            ("heir", J::key(&self.heir)),
            ("heirSecret", J::key(&self.heir_secret)),
            (
                "hints",
                J::List(self.hints.iter().cloned().map(J::Text).collect()),
            ),
        ])
    }

    /// The facts a stranger was handed: five keys and at least one road.
    fn read(from: &Json) -> Told<Invitation> {
        let invitation = Invitation::keys(from)?;
        if invitation.hints.is_empty() {
            return Err("those facts carry no road".to_string());
        }
        Ok(invitation)
    }

    /// A standing granted back down a line: the same five keys and no road at
    /// all, because the ground that granted it has none.
    fn keys(from: &Json) -> Told<Invitation> {
        let key = |name: &str| -> Told<[u8; KEY]> {
            match from.get(name) {
                Some(Json::Text(written)) => unhex(written),
                _ => Err(format!("those facts carry no {name}")),
            }
        };
        let hints = match from.get("hints") {
            Some(Json::List(each)) => each
                .iter()
                .map(|one| match one {
                    Json::Text(hint) => Ok(hint.clone()),
                    _ => Err("a hint that is not a string".to_string()),
                })
                .collect::<Told<Vec<String>>>()?,
            _ => Vec::new(),
        };
        Ok(Invitation {
            warden: key("warden")?,
            commitment: key("commitment")?,
            padlock: key("padlock")?,
            heir: key("heir")?,
            heir_secret: key("heirSecret")?,
            hints,
        })
    }
}

// ---- serve -----------------------------------------------------------

fn serve(args: &[String]) -> Told<()> {
    let flags = Flags::read(args, &["line", "push"])?;
    let listen = flags.text("listen", "127.0.0.1:0");
    let limit = flags.int("limit", LIMIT)?;
    let framed = flags.on("line");
    let pushing = flags.on("push");

    let mut ground = Ground::stand(limit)?;
    let being = ground.hold()?;

    if framed {
        // The listening half is the one that knows where it ended up, so it
        // is the one with a road to grant. The road publishes this door's
        // appetite, which is the one fact the law makes a warden publish.
        let listener = Listener::bind(&listen, limit).map_err(|why| why.to_string())?;
        let hint = listener.hint().map_err(|why| why.to_string())?;
        stranger(&mut ground, being, &hint)?;
        let shared = Arc::new(Mutex::new(ground));
        // A ground that pushes keeps every line it accepts, because the
        // standing it will spend down one arrives later and by another road
        // entirely.
        let (accepted, taking) = channel();
        if pushing {
            let ground = Arc::clone(&shared);
            let being = flags.text("being", "");
            let method = flags.text("method", "");
            let args = flags.text("args", "");
            std::thread::spawn(move || {
                if let Err(why) = pushes(&ground, taking, &being, &method, &args) {
                    eprintln!("subject: {why}");
                    std::process::exit(1);
                }
            });
        }
        loop {
            let line = listener.accept().map_err(|why| why.to_string())?;
            let ground = Arc::clone(&shared);
            if pushing {
                // A line this ground will ask down is read by the road itself,
                // which sorts an answer from an ask exactly as a dialled one
                // does — so the same connection still serves what arrives.
                let road = Road::over(line, &ground)?;
                if accepted.send(road).is_err() {
                    return Err("the pushing half is gone".to_string());
                }
                continue;
            }
            std::thread::spawn(move || answer_line(&ground, line));
        }
    }
    if pushing {
        return Err("a push can only ride a line".to_string());
    }

    let door = quo_carriage::Door::bind(&listen)
        .map_err(|why| why.to_string())?
        .with_body_cap(limit as usize);
    let hint = door.hint().map_err(|why| why.to_string())?;
    stranger(&mut ground, being, &hint)?;
    let shared = Mutex::new(ground);
    loop {
        door.serve_one(|body| shared.lock().expect("the ground's lock").judge(body))
            .map_err(|why| why.to_string())?;
    }
}

/// Mint the invitation and print the facts: everything a stranger needs to
/// speak to this ground, over whichever road it was given.
fn stranger(ground: &mut Ground, being: [u8; KEY], hint: &str) -> Told<()> {
    let mut invitation = ground.grant(being)?;
    invitation.hints = vec![hint.to_string()];
    say(&invitation.facts())
}

/// One line, served: every frame that arrives is judged, and an answer goes
/// back down the same connection. A judgment that refuses produces no frame,
/// because silence has no wire form on a line.
fn answer_line(ground: &Arc<Mutex<Ground>>, mut line: Line) {
    loop {
        match line.receive() {
            Ok(Arrival::Frame(envelope)) => {
                let reply = ground.lock().expect("the ground's lock").judge(&envelope);
                if let Some(reply) = reply {
                    if line.send(&reply).is_err() {
                        return;
                    }
                }
            }
            // The far end closing is weather, and a framing fault has already
            // shut the connection.
            Ok(Arrival::Closed) | Err(_) => return,
        }
    }
}

/// The other half of `-hold`, and the half only a listening ground can play:
/// an ask down a connection this ground never opened, spending a standing the
/// dialling ground granted it. The standing never travels on the wire — it is
/// the dialler's own to hand over however it likes — so it arrives here one
/// JSON object per line on stdin, and each is spent on a line this door
/// accepted.
fn pushes(
    ground: &Arc<Mutex<Ground>>,
    accepted: Receiver<Road>,
    being: &str,
    method: &str,
    args: &str,
) -> Told<()> {
    let stdin = std::io::stdin();
    let mut told = String::new();
    loop {
        told.clear();
        match std::io::BufRead::read_line(&mut stdin.lock(), &mut told) {
            Ok(0) | Err(_) => return Ok(()),
            Ok(_) => {}
        }
        if told.trim().is_empty() {
            continue;
        }
        let invitation = Invitation::keys(&json::parse(told.trim()))?;
        let road = accepted
            .recv()
            .map_err(|_| "no line was ever accepted to push down".to_string())?;
        push(ground, &invitation, &road, being, method, args)?;
    }
}

fn push(
    ground: &Arc<Mutex<Ground>>,
    invitation: &Invitation,
    road: &Road,
    being: &str,
    method: &str,
    args: &str,
) -> Told<()> {
    let mut row = Row::stand(ground, invitation);
    let Some(estate) = exchange(ground, &mut row, "describe", None, None, road)? else {
        return Ok(()); // silence has already been reported where it happened
    };
    let classes = classes_of(&estate.data)?;
    say(&estate.line(&[("classes", written(&classes))]))?;
    say(&object(&[
        ("quo", J::Int(1)),
        ("step", J::Text("pushed".to_string())),
        ("far", J::key(&row.warden)),
    ]))?;
    if method.is_empty() {
        return Ok(());
    }
    let named = match being {
        "" => None,
        "door" => Some(row.warden),
        "auto" => Some(granted(&classes)?),
        written => Some(unhex(written)?),
    };
    let method = Method {
        name: method.to_string(),
        args: unhex_bytes(args)?,
    };
    if let Some(step) = exchange(ground, &mut row, "ask", named, Some(method), road)? {
        say(&step.line(&[("data", J::Text(hex(&step.data)))]))?;
    }
    Ok(())
}

/// One describe, flattened for the far side: a digest and the pks under it, in
/// the order the warden derived.
fn written(classes: &[quo_warden::Class]) -> J {
    J::List(
        classes
            .iter()
            .map(|one| {
                J::Object(vec![
                    ("digest".to_string(), J::key(&one.digest)),
                    (
                        "beings".to_string(),
                        J::List(one.beings.iter().map(|b| J::key(&b.being)).collect()),
                    ),
                ])
            })
            .collect(),
    )
}

// ---- speak -----------------------------------------------------------

fn speak(args: &[String]) -> Told<()> {
    let flags = Flags::read(args, &["blueprint", "line", "hold", "zero"])?;

    // At distance zero there is no facts line to be given, because there is
    // no stranger to give it: this process stands the far house itself and
    // then speaks to it as a stranger would. It prints the facts anyway, so a
    // driver reads the same shape it reads on every other road.
    let far = if flags.on("zero") {
        Some(Arc::new(Mutex::new(Ground::stand(LIMIT)?)))
    } else {
        None
    };
    let invitation = match &far {
        Some(far) => {
            let mut far = far.lock().expect("the far ground's lock");
            let being = far.hold()?;
            let invitation = far.grant(being)?;
            say(&invitation.facts())?;
            invitation
        }
        None => {
            let [written] = flags.rest.as_slice() else {
                return Err("usage: subject speak [flags] <facts-json>".to_string());
            };
            Invitation::read(&json::parse(written))?
        }
    };

    // A caller is always a being, and always one its own warden holds, so
    // this mode is a whole ground too and not a bare key.
    let ground = Arc::new(Mutex::new(Ground::stand(LIMIT)?));
    let mut row = Row::stand(&ground, &invitation);

    // Which road this ground speaks over is the whole of what -line and -zero
    // change. **Nothing above the road knows which one it got.**
    let road = match far {
        Some(far) => Road::Zero(quo_zero::Door::new(Held(far))),
        None if flags.on("line") => Road::dial(&invitation.hints, &ground)?,
        None => Road::Door(invitation.hints.clone()),
    };

    // Whoever minted a voice has seen its keys, so the holder's first act is
    // a rotate-and-ask to a key nobody else has ever seen. It asks nothing,
    // and what comes back is what this voice now stands at.
    let Some(estate) = exchange(&ground, &mut row, "describe", None, None, &road)? else {
        return Ok(()); // the door answered silence, and it has already been reported
    };
    let classes = classes_of(&estate.data)?;
    say(&estate.line(&[("classes", written(&classes))]))?;

    if flags.on("blueprint") {
        for class in &classes {
            // `blueprint` is a field on the far door's public being, whose pk
            // is that warden's own name — reached by naming it, like every
            // other field on every other being.
            let method = Method {
                name: "blueprint".to_string(),
                args: quo_wire::encode(
                    quo_warden::warden_blueprint(),
                    &Type::Base("b32".to_string()),
                    &Value::B32(class.digest),
                )
                .map_err(|why| why.0)?,
            };
            let step = exchange(
                &ground,
                &mut row,
                "blueprint",
                Some(invitation.warden),
                Some(method),
                &road,
            )?;
            let Some(step) = step else { continue };
            let text = read_text(&step.data)?;
            say(&step.line(&[
                ("digest", J::key(&class.digest)),
                ("text", text.map(J::Text).unwrap_or(J::Null)),
            ]))?;
        }
    }

    if let Some(name) = flags.get("method") {
        let being = match flags.text("being", "").as_str() {
            "" => None,
            "door" => Some(invitation.warden),
            // The invitation does not name the being, so a holder finds it by
            // describing. The one class every estate carries is the warden's
            // own, whose digest is the same on every ground in the world;
            // what is left is what this voice was granted.
            "auto" => Some(granted(&classes)?),
            written => Some(unhex(written)?),
        };
        let method = Method {
            name: name.to_string(),
            args: unhex_bytes(&flags.text("args", ""))?,
        };
        if let Some(step) = exchange(&ground, &mut row, "ask", being, Some(method), &road)? {
            say(&step.line(&[("data", J::Text(hex(&step.data)))]))?;
        }
    }

    if !flags.on("hold") {
        return Ok(());
    }
    let Road::Line { open, .. } = &road else {
        return Err("a standing granted back can only ride a line".to_string());
    };
    held(&ground, invitation.warden, Arc::clone(open))
}

/// The other half of a line, and the half a door cannot have: this ground
/// holds a being of its own and grants the ground it dialled a standing at
/// it. The invitation carries no road, because this ground has none — it is
/// reachable only down the line it opened. Then it stays for as long as the
/// far ground keeps the line, and says what its own object was left holding
/// once the line is let go.
fn held(ground: &Arc<Mutex<Ground>>, far: [u8; KEY], open: Arc<AtomicBool>) -> Told<()> {
    let (being, invitation) = {
        let mut ground = ground.lock().expect("the ground's lock");
        let being = ground.hold()?;
        (being, ground.grant(being)?)
    };
    say(&object(&[
        ("quo", J::Int(1)),
        ("step", J::Text("standing".to_string())),
        ("far", J::key(&far)),
        ("warden", J::key(&invitation.warden)),
        ("commitment", J::key(&invitation.commitment)),
        ("padlock", J::key(&invitation.padlock)),
        ("heir", J::key(&invitation.heir)),
        ("heirSecret", J::key(&invitation.heir_secret)),
    ]))?;

    // The far end closes the line when it has finished asking, and a line is
    // dumb — it has no event to wait on, only the fact of whether it is still
    // carrying. Leaving before it is let go would be leaving mid-answer.
    let waited = std::time::Instant::now();
    while open.load(Ordering::SeqCst) {
        if waited.elapsed() > PATIENCE {
            return Err("the line this ground opened was never let go".to_string());
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    let total = ground
        .lock()
        .expect("the ground's lock")
        .held
        .map(|(_, total)| total)
        .unwrap_or(0);
    say(&object(&[
        ("quo", J::Int(1)),
        ("step", J::Text("held".to_string())),
        ("being", J::key(&being)),
        ("total", J::Int(total)),
    ]))
}

/// What this caller keeps about the house it holds a standing in: the
/// invitation, the number it has spent, and whether the standing has changed
/// hands yet.
struct Row {
    /// Where this relation sits in the ground's own outbound record. The row
    /// itself is the kit's: what is kept here is where to find it, and the
    /// two facts this subject needs without taking the lock.
    at: usize,
    warden: [u8; KEY],
    hints: Vec<String>,
    rotated: bool,
}

impl Row {
    /// Hand the invitation to the ground's warden and keep where it landed.
    fn stand(ground: &Arc<Mutex<Ground>>, invitation: &Invitation) -> Row {
        let mut held = ground.lock().expect("the ground's lock");
        let at = held.w.remember(&quo_warden::Invitation {
            warden: invitation.warden,
            commitment: invitation.commitment,
            padlock: invitation.padlock,
            heir: invitation.heir,
            heir_secret: invitation.heir_secret,
            hints: invitation.hints.clone(),
        });
        Row {
            at,
            warden: invitation.warden,
            hints: invitation.hints.clone(),
            rotated: false,
        }
    }
}

/// One exchange: the number it spent, the door that signed the answer, and
/// the answer's data.
struct Step {
    name: String,
    seq: i64,
    warden: [u8; KEY],
    data: Vec<u8>,
}

impl Step {
    fn line(&self, extra: &[(&str, J)]) -> String {
        let mut pairs = vec![
            ("quo", J::Int(1)),
            ("step", J::Text(self.name.clone())),
            ("seq", J::Int(self.seq)),
            ("warden", J::key(&self.warden)),
        ];
        pairs.extend(extra.iter().map(|(name, value)| (*name, value.clone())));
        object(&pairs)
    }
}

/// Compose one utterance, put it down the road the far door offered, and open
/// what came back. `Ok(None)` is silence, which is a door speaking and not an
/// error.
fn exchange(
    ground: &Arc<Mutex<Ground>>,
    row: &mut Row,
    name: &str,
    being: Option<[u8; KEY]>,
    method: Option<Method>,
    road: &Road,
) -> Told<Option<Step>> {
    // The composing is the kit's. What stays here is this ground's own
    // policy: the lock, its leash, and the randomness, because the kit takes
    // every draw as an argument.
    let reach = quo_warden::Reach {
        being,
        method,
        allowance: Allowance {
            time: 5_000,
            hops: 8,
        },
        ..quo_warden::Reach::default()
    };
    let (envelope, seq) = {
        let mut held = ground.lock().expect("the ground's lock");
        // The first ask a holder makes is the one that takes the standing
        // over, and nothing after it is a rotation.
        if row.rotated {
            held.w.ask(row.at, &draw()?, &reach)
        } else {
            held.w.rotate(row.at, &draw()?, &draw()?, &reach)
        }
        .map_err(|why| why.0)?
    };
    row.rotated = true;

    let Some(reply) = road.carry(&row.hints, &envelope)? else {
        say(&object(&[
            ("quo", J::Int(1)),
            ("step", J::Text(name.to_string())),
            ("seq", J::Int(seq)),
            ("silence", J::Bool(true)),
        ]))?;
        return Ok(None);
    };
    // Verified against the warden the answer's own record carries, and matched
    // to the door this caller actually asked — two checks, not one.
    let answer = {
        let mut held = ground.lock().expect("the ground's lock");
        held.w.hear(row.at, &reply).map_err(|why| why.0)?
    };
    if answer.seq != seq {
        return Err(format!("the answer names ask {}, not {seq}", answer.seq));
    }
    Ok(Some(Step {
        name: name.to_string(),
        seq,
        warden: answer.warden,
        data: answer.data.unwrap_or_default(),
    }))
}

// ---- the two roads ---------------------------------------------------

/// A road: it takes one composed message to the far ground and hands back
/// what came back, or nothing for silence.
enum Road {
    /// The common carriage: one POST, one reply, and silence arrives as an
    /// empty body because HTTP forces a response.
    Door(Vec<String>),
    /// The framed line, where the hints are already spent: the road is the
    /// connection this ground is holding. Silence has no wire form here, so
    /// nothing comes back at all and the deadline is this caller's own
    /// affair. A reader runs behind it, because an end that stops reading to
    /// finish writing has made its own deadlock — and because the far ground
    /// may ask down this line at any moment.
    Line {
        writing: Arc<Mutex<Line>>,
        answers: Receiver<Vec<u8>>,
        open: Arc<AtomicBool>,
    },
    /// Distance zero: the far house is standing in this same process and the
    /// envelope is handed over as bytes. **It waives no step**, which is why
    /// nothing above this line changes when it is the road: the same seal,
    /// the same signature, the same seq spent at the same warden.
    Zero(quo_zero::Door<Held>),
}

/// A ground this process is holding, reachable at distance zero.
struct Held(Arc<Mutex<Ground>>);

impl quo_zero::Ground for Held {
    fn arrive(&self, envelope: &[u8]) -> Option<Vec<u8>> {
        self.0.lock().expect("the ground's lock").judge(envelope)
    }
}

impl Road {
    fn dial(hints: &[String], ground: &Arc<Mutex<Ground>>) -> Told<Road> {
        // A hint is opaque to the protocol, and this is the one place this
        // command looks inside one.
        let Some(hint) = hints.iter().find(|hint| hint.starts_with("tcp://")) else {
            return Err("those facts carry no tcp:// road".to_string());
        };
        let line = Line::dial(hint).map_err(|why| why.0)?;
        Road::over(line, ground)
    }

    /// One line, held as a road: a reader behind it and a writer in front. It
    /// is the same shape whichever end opened the connection — an end that
    /// asks down a line has to read it too.
    fn over(line: Line, ground: &Arc<Mutex<Ground>>) -> Told<Road> {
        let (reading, writing) = line.split().map_err(|why| why.to_string())?;
        let writing = Arc::new(Mutex::new(writing));
        let open = Arc::new(AtomicBool::new(true));
        let (sender, answers) = channel();
        let carrying = Arc::clone(&open);
        let back = Arc::clone(&writing);
        let ground = Arc::clone(ground);
        std::thread::spawn(move || {
            read_line(&ground, reading, &back, &sender);
            carrying.store(false, Ordering::SeqCst);
        });
        Ok(Road::Line {
            writing,
            answers,
            open,
        })
    }

    fn carry(&self, hints: &[String], envelope: &[u8]) -> Told<Option<Vec<u8>>> {
        match self {
            Road::Door(published) => {
                let hints = if published.is_empty() {
                    hints
                } else {
                    published
                };
                let Some(hint) = hints.iter().find(|hint| hint.starts_with("http")) else {
                    return Err("those facts carry no http:// road".to_string());
                };
                let body = quo_carriage::post(hint, envelope).map_err(|why| why.0)?;
                Ok(if body.is_empty() { None } else { Some(body) })
            }
            Road::Line {
                writing, answers, ..
            } => {
                writing
                    .lock()
                    .expect("the line's lock")
                    .send(envelope)
                    .map_err(|why| why.0)?;
                Ok(answers.recv_timeout(PATIENCE).ok())
            }
            Road::Zero(door) => {
                let back = door.post(envelope);
                Ok(if back.is_empty() { None } else { Some(back) })
            }
        }
    }
}

/// The reader behind a held line. What comes up it is either an answer to
/// something this ground asked, or an ask from the ground at the far end —
/// and the two are told apart the way the law tells them apart, by the byte
/// in front of the payload.
fn read_line(
    ground: &Arc<Mutex<Ground>>,
    mut reading: Line,
    writing: &Arc<Mutex<Line>>,
    answers: &Sender<Vec<u8>>,
) {
    loop {
        let envelope = match reading.receive() {
            Ok(Arrival::Frame(envelope)) => envelope,
            Ok(Arrival::Closed) | Err(_) => return,
        };
        let padlock_secret = ground.lock().expect("the ground's lock").w.padlock_secret;
        if quo_envelope::open_at_caller(&padlock_secret, &envelope).is_ok() {
            if answers.send(envelope).is_err() {
                return;
            }
            continue;
        }
        let reply = ground.lock().expect("the ground's lock").judge(&envelope);
        if let Some(reply) = reply {
            if writing
                .lock()
                .expect("the line's lock")
                .send(&reply)
                .is_err()
            {
                return;
            }
        }
    }
}

// ---- reading what came back ------------------------------------------

fn classes_of(data: &[u8]) -> Told<Vec<quo_warden::Class>> {
    let estate: Estate = quo_warden::decode_estate(data).map_err(|why| why.0)?;
    Ok(estate.classes)
}

/// The one being an estate holds that is not the door's own public being. It
/// refuses anything else rather than choosing: which of two granted beings
/// was meant is the caller's to say.
fn granted(classes: &[quo_warden::Class]) -> Told<[u8; KEY]> {
    let own = warden_digest();
    let found: Vec<[u8; KEY]> = classes
        .iter()
        .filter(|class| class.digest != own)
        .flat_map(|class| class.beings.iter().map(|held| held.being))
        .collect();
    match found.as_slice() {
        [one] => Ok(*one),
        other => Err(format!(
            "the estate holds {} beings besides the door's own",
            other.len()
        )),
    }
}

/// A `text?` answer: present or absent, and the value only when present.
fn read_text(data: &[u8]) -> Told<Option<String>> {
    let ty = Type::Maybe(Box::new(Type::Base("text".to_string())));
    match quo_wire::decode(quo_warden::warden_blueprint(), &ty, data).map_err(|why| why.0)? {
        Value::Maybe(Some(held)) => match *held {
            Value::Text(text) => Ok(Some(text)),
            _ => Err("a blueprint that is not a text".to_string()),
        },
        Value::Maybe(None) => Ok(None),
        _ => Err("an answer that is not the answer the field declares".to_string()),
    }
}

// ---- the counter's one type ------------------------------------------

fn counter() -> &'static Blueprint {
    static PARSED: std::sync::OnceLock<Blueprint> = std::sync::OnceLock::new();
    PARSED.get_or_init(|| quo_notation::parse(COUNTER).expect("the class this subject holds"))
}

fn read_int(bytes: &[u8]) -> Told<i64> {
    match quo_wire::decode(counter(), &Type::Base("int".to_string()), bytes) {
        Ok(Value::Int(value)) => Ok(value),
        _ => Err("a field whose one argument is not an int".to_string()),
    }
}

fn write_int(value: i64) -> Told<Vec<u8>> {
    quo_wire::encode(
        counter(),
        &Type::Base("int".to_string()),
        &Value::Int(value),
    )
    .map_err(|why| why.0)
}

// ---- the host things -------------------------------------------------

/// The wall clock in milliseconds. Only differences are ever taken of it.
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|since| since.as_millis() as i64)
        .unwrap_or(0)
}

/// The one place this kit draws. Every crate beneath takes its draws as
/// arguments, which is what lets them be reproduced; a running ground has to
/// get them from somewhere, and this is the somewhere.
fn draw() -> Told<[u8; KEY]> {
    let mut bytes = [0u8; KEY];
    let mut source = File::open("/dev/urandom").map_err(|why| why.to_string())?;
    source
        .read_exact(&mut bytes)
        .map_err(|why| why.to_string())?;
    Ok(bytes)
}

// ---- the flags -------------------------------------------------------

struct Flags {
    named: BTreeMap<String, String>,
    rest: Vec<String>,
}

impl Flags {
    fn read(args: &[String], switches: &[&str]) -> Told<Flags> {
        let mut named = BTreeMap::new();
        let mut rest = Vec::new();
        let mut at = 0;
        while at < args.len() {
            let arg = &args[at];
            let Some(name) = arg
                .strip_prefix('-')
                .map(|name| name.trim_start_matches('-'))
            else {
                rest.push(arg.clone());
                at += 1;
                continue;
            };
            if let Some((name, value)) = name.split_once('=') {
                named.insert(name.to_string(), value.to_string());
                at += 1;
                continue;
            }
            if switches.contains(&name) {
                named.insert(name.to_string(), "true".to_string());
                at += 1;
                continue;
            }
            let Some(value) = args.get(at + 1) else {
                return Err(format!("the flag -{name} was given no value"));
            };
            named.insert(name.to_string(), value.clone());
            at += 2;
        }
        Ok(Flags { named, rest })
    }

    fn get(&self, name: &str) -> Option<&str> {
        self.named.get(name).map(String::as_str)
    }

    fn text(&self, name: &str, fallback: &str) -> String {
        self.get(name).unwrap_or(fallback).to_string()
    }

    fn on(&self, name: &str) -> bool {
        self.get(name) == Some("true")
    }

    fn int(&self, name: &str, fallback: i64) -> Told<i64> {
        match self.get(name) {
            None => Ok(fallback),
            Some(written) => written
                .parse::<i64>()
                .map_err(|_| format!("the flag -{name} was given something that is not a count")),
        }
    }
}

// ---- the one line this command writes --------------------------------

/// A JSON value, only as much of one as this command prints.
#[derive(Clone)]
enum J {
    Null,
    Bool(bool),
    Int(i64),
    Text(String),
    List(Vec<J>),
    Object(Vec<(String, J)>),
}

impl J {
    fn key(bytes: &[u8; KEY]) -> J {
        J::Text(hex(bytes))
    }

    fn write(&self, out: &mut String) {
        match self {
            J::Null => out.push_str("null"),
            J::Bool(value) => out.push_str(if *value { "true" } else { "false" }),
            J::Int(value) => out.push_str(&value.to_string()),
            J::Text(value) => quote(value, out),
            J::List(each) => {
                out.push('[');
                for (at, one) in each.iter().enumerate() {
                    if at > 0 {
                        out.push(',');
                    }
                    one.write(out);
                }
                out.push(']');
            }
            J::Object(pairs) => {
                out.push('{');
                for (at, (name, value)) in pairs.iter().enumerate() {
                    if at > 0 {
                        out.push(',');
                    }
                    quote(name, out);
                    out.push(':');
                    value.write(out);
                }
                out.push('}');
            }
        }
    }
}

fn quote(text: &str, out: &mut String) {
    out.push('"');
    for character in text.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            other if (other as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", other as u32));
            }
            other => out.push(other),
        }
    }
    out.push('"');
}

fn object(pairs: &[(&str, J)]) -> String {
    let mut out = String::new();
    J::Object(
        pairs
            .iter()
            .map(|(name, value)| (name.to_string(), value.clone()))
            .collect(),
    )
    .write(&mut out);
    out
}

/// One line of JSON on stdout, flushed, so a driver reading this process line
/// by line sees it before the process blocks.
fn say(line: &str) -> Told<()> {
    use std::io::Write;
    let mut out = std::io::stdout().lock();
    writeln!(out, "{line}").map_err(|why| why.to_string())?;
    out.flush().map_err(|why| why.to_string())
}

fn hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push_str(&format!("{byte:02x}"));
    }
    out
}

fn unhex_bytes(written: &str) -> Told<Vec<u8>> {
    if !written.len().is_multiple_of(2) {
        return Err("hex comes in pairs".to_string());
    }
    (0..written.len())
        .step_by(2)
        .map(|at| {
            u8::from_str_radix(&written[at..at + 2], 16).map_err(|_| "not a hex pair".to_string())
        })
        .collect()
}

fn unhex(written: &str) -> Told<[u8; KEY]> {
    let read = unhex_bytes(written)?;
    read.try_into()
        .map_err(|_| "a key is thirty-two bytes".to_string())
}
