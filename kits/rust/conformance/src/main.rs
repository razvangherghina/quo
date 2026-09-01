//! The Rust kit answering the conformance subject contract.
//!
//! Kit-specific glue: seven verbs over JSON lines, a warden stood up from
//! handed keys, a door handed bytes, and the records read back as Article IX's
//! `cargo`. Written from `papers/quo-conformance-contract.md` and this kit's own
//! public API, and it decides nothing.
//!
//! Two things this kit spells differently from the three before it, neither of
//! which is a decision this file is allowed to make:
//!
//! - **Its door is three calls where the JS one is a single `judge`**: `judge`
//!   settles the route, `answer` produces the data for every route but a
//!   being's, and `reply` seals. Stitching those is ordinary glue — no step is
//!   skipped and none is invented.
//! - **A being's answer is never the warden's**, so `Route::Being` comes back
//!   to this file. The being in this contract does one thing or nothing, so
//!   what goes back is the empty answer the other subjects' beings give.
//!
//! **It composes no cargo**, like the Python kit, so `state` reads the two
//! records directly. And it takes both Article II freedoms as arguments —
//! `judge` takes the arrival reading, every seal takes its ephemeral — which is
//! the only hard requirement the contract has.

#[path = "../../support/json.rs"]
mod json;

use std::collections::BTreeMap;
use std::io::{self, BufRead, Write};

use json::Json;
use quo_warden::{
    Allowance, Field as Method, Inbound, Outbound, Reach, Resident, Route, Warden, Word, KEY,
};

/// A finite list drawn in order. Drawing past the end is a fault the scenario
/// must hear about rather than a silent refill, because a kit that drew more
/// than it was given has told the scenario something.
struct Queue {
    name: &'static str,
    values: Vec<Vec<u8>>,
    at: usize,
}

impl Queue {
    fn draw(&mut self) -> Result<[u8; KEY], String> {
        if self.at >= self.values.len() {
            return Err(format!(
                "the {} queue ran out after {}",
                self.name,
                self.values.len()
            ));
        }
        let one = key(&self.values[self.at])?;
        self.at += 1;
        Ok(one)
    }

    fn number(&mut self) -> Result<i64, String> {
        if self.at >= self.values.len() {
            return Err(format!(
                "the {} queue ran out after {}",
                self.name,
                self.values.len()
            ));
        }
        let text = String::from_utf8(self.values[self.at].clone()).map_err(|_| "a bad reading")?;
        self.at += 1;
        text.parse::<i64>().map_err(|_| "a bad reading".to_string())
    }
}

fn un(text: &str) -> Result<Vec<u8>, String> {
    if !text.len().is_multiple_of(2) {
        return Err("hex of an odd length".to_string());
    }
    (0..text.len())
        .step_by(2)
        .map(|at| u8::from_str_radix(&text[at..at + 2], 16).map_err(|_| "bad hex".to_string()))
        .collect()
}

fn key(raw: &[u8]) -> Result<[u8; KEY], String> {
    <[u8; KEY]>::try_from(raw).map_err(|_| "a key that is not 32 bytes".to_string())
}

fn hx(raw: &[u8]) -> String {
    raw.iter().map(|one| format!("{one:02x}")).collect()
}

/// A field that must be there, read as hex into a key.
fn field_key(order: &Json, name: &str) -> Result<[u8; KEY], String> {
    let text = order
        .get(name)
        .ok_or_else(|| format!("no {name}"))?
        .text()
        .to_string();
    key(&un(&text)?)
}

/// The same, where absent stays absent.
fn maybe_key(order: &Json, name: &str) -> Result<Option<[u8; KEY]>, String> {
    match order.get(name) {
        None | Some(Json::Null) => Ok(None),
        Some(one) => Ok(Some(key(&un(one.text())?)?)),
    }
}

fn text_of(order: &Json, name: &str) -> String {
    order
        .get(name)
        .map(|one| one.text().to_string())
        .unwrap_or_default()
}

fn hints_of(order: &Json, name: &str) -> Vec<String> {
    order
        .get(name)
        .map(|one| one.list().iter().map(|h| h.text().to_string()).collect())
        .unwrap_or_default()
}

fn number_of(order: &Json, name: &str, fallback: i64) -> i64 {
    order
        .get(name)
        .and_then(|one| match one {
            Json::Text(text) => text.parse::<i64>().ok(),
            Json::Number(value) => Some(*value as i64),
            _ => None,
        })
        .unwrap_or(fallback)
}

/// What one `onward` spec asks the being to do. It decides nothing: the
/// scenario names the far warden, the being, the method and the key.
#[derive(Clone)]
struct Onward {
    when: String,
    at: [u8; KEY],
    being: Option<[u8; KEY]>,
    method: Option<Method>,
    ephemeral: [u8; KEY],
    seq: i64,
}

struct House {
    warden: Warden,
    clock: Queue,
    random: Queue,
    /// The keys this door will mint for a being it is about to take in.
    expecting: Option<[[u8; KEY]; 2]>,
    /// The one thing a being in this contract ever does, per being.
    onward: BTreeMap<[u8; KEY], Onward>,
    /// Every ask the warden composed while judging the message in hand.
    handed: Vec<Vec<u8>>,
    /// The roads this door answers on. This kit takes them per call rather
    /// than keeping them, so the subject keeps what `stand` was given.
    roads: Vec<String>,
}

static mut HOUSE: Option<House> = None;

#[allow(static_mut_refs)]
fn house() -> Result<&'static mut House, String> {
    unsafe {
        HOUSE
            .as_mut()
            .ok_or_else(|| "no warden stood up".to_string())
    }
}

// ---- the verbs ---------------------------------------------------------

fn stand(order: &Json) -> Result<String, String> {
    let spec = order.get("warden").ok_or("no warden")?;
    let name_secret = field_key(spec, "nameSeed")?;
    let padlock_secret = field_key(spec, "padlockSeed")?;
    // This kit is one of the two that never sees its own heir's key: it takes
    // the commitment and leaves the seed beside it alone.
    let own = match maybe_key(spec, "heirCommitment")? {
        Some(one) => one,
        None => {
            let heir = field_key(spec, "heirSeed")?;
            quo_arithmetic::commitment(
                &quo_arithmetic::signing_pk(&name_secret),
                &quo_arithmetic::signing_pk(&heir),
            )
        }
    };
    let limit = number_of(spec, "limit", 0);
    let mut warden = Warden::new(
        name_secret,
        padlock_secret,
        own,
        if limit > 0 { limit } else { i64::MAX },
        64,
    );

    let mut beings = Vec::new();
    let mut onward = BTreeMap::new();
    for one in order.get("beings").map(|b| b.list()).unwrap_or(&[]) {
        let secret = field_key(one, "seed")?;
        let heir = field_key(one, "heirSeed")?;
        let pk = quo_arithmetic::signing_pk(&secret);
        let text = text_of(one, "blueprint");
        let digest = quo_notation::digest(&text).map_err(|why| why.0)?;
        warden.blueprints.push(text);
        warden.beings.push(Resident {
            being: pk,
            digest,
            commitment: quo_arithmetic::commitment(
                &warden.name,
                &quo_arithmetic::signing_pk(&heir),
            ),
            cells: un(&text_of(one, "cells"))?,
        });
        if let Some(spec) = one.get("onward") {
            onward.insert(
                pk,
                Onward {
                    when: text_of(spec, "when"),
                    at: field_key(spec, "at")?,
                    being: maybe_key(spec, "being")?,
                    method: spec.get("method").map(|m| Method {
                        name: text_of(m, "name"),
                        args: un(&text_of(m, "args")).unwrap_or_default(),
                    }),
                    ephemeral: field_key(spec, "ephemeral")?,
                    seq: number_of(spec, "seq", 1),
                },
            );
        }
        beings.push(hx(&pk));
    }

    // `grants` writes inbound rows. Writing the opening state is setup and no
    // obligation turns on how a row got there — unlike an amend, which is an
    // act the warden performs and which this kit now has its own operation for.
    let mut grants = Vec::new();
    for one in order.get("grants").map(|g| g.list()).unwrap_or(&[]) {
        let heir = quo_arithmetic::signing_pk(&field_key(one, "heirSeed")?);
        let commitment = quo_arithmetic::commitment(&warden.name, &heir);
        warden.inbound.push(Inbound {
            voice: quo_arithmetic::signing_pk(&field_key(one, "voiceSeed")?),
            commitment,
            minted_at: warden.name,
            beings: vec![field_key(one, "being")?],
            mark: 0,
            spent: Vec::new(),
            padlock: maybe_key(one, "padlock")?,
            hints: hints_of(one, "hints"),
        });
        grants.push(format!(
            "{{\"warden\":\"{}\",\"commitment\":\"{}\",\"padlock\":\"{}\",\"heir\":\"{}\"}}",
            hx(&warden.name),
            hx(&commitment),
            hx(&warden.padlock),
            hx(&heir)
        ));
    }

    for one in order.get("relations").map(|r| r.list()).unwrap_or(&[]) {
        let voice_secret = field_key(one, "voiceSeed")?;
        let heir_secret = field_key(one, "heirSeed")?;
        warden.outbound.push(Outbound {
            warden: field_key(one, "warden")?,
            commitment: field_key(one, "commitment")?,
            padlock: field_key(one, "padlock")?,
            voice: quo_arithmetic::signing_pk(&voice_secret),
            secret: voice_secret,
            heir: quo_arithmetic::signing_pk(&heir_secret),
            heir_secret,
            seq: 0,
            news: 0,
            hints: hints_of(one, "hints"),
            // Which of this ground's beings may spend the relation. The
            // contract says the outbound record "says which of its beings may
            // spend which relation", and this kit gained the field with the
            // migration work — a row that named none could not travel when
            // that being moves.
            holder: maybe_key(one, "being")?,
            beings: BTreeMap::new(),
            awaiting: Default::default(),
        });
    }

    // The being this door is about to take in. Its keys are handed in, and in
    // this kit they are handed to `answer` rather than drawn from a queue —
    // which is why the two Article II freedoms never cross here.
    let expecting = match order.get("expecting") {
        Some(one) => {
            warden.blueprints.push(text_of(one, "blueprint"));
            Some([field_key(one, "seed")?, field_key(one, "heirSeed")?])
        }
        None => None,
    };

    for one in order.get("moved").map(|m| m.list()).unwrap_or(&[]) {
        let word = one.get("word").ok_or("a moved with no word")?;
        warden.moved.push((
            field_key(one, "being")?,
            Word {
                being: maybe_key(word, "being")?,
                successor: maybe_key(word, "successor")?,
                commitment: maybe_key(word, "commitment")?,
                name: maybe_key(word, "name")?,
                padlock: maybe_key(word, "padlock")?,
                hints: hints_of(word, "hints"),
            },
        ));
    }

    let name = hx(&warden.name);
    let padlock = hx(&warden.padlock);
    let clock = Queue {
        name: "clock",
        values: order
            .get("clock")
            .map(|c| {
                c.list()
                    .iter()
                    .map(|one| one.text().as_bytes().to_vec())
                    .collect()
            })
            .unwrap_or_default(),
        at: 0,
    };
    let random = Queue {
        name: "random",
        values: order
            .get("random")
            .map(|r| {
                r.list()
                    .iter()
                    .map(|one| un(one.text()).unwrap_or_default())
                    .collect()
            })
            .unwrap_or_default(),
        at: 0,
    };
    unsafe {
        HOUSE = Some(House {
            warden,
            clock,
            random,
            expecting,
            onward,
            handed: Vec::new(),
            roads: hints_of(spec, "hints"),
        });
    }

    Ok(format!(
        "{{\"warden\":{{\"name\":\"{name}\",\"padlock\":\"{padlock}\"}},\"beings\":[{}],\"grants\":[{}]}}",
        beings.iter().map(|one| format!("\"{one}\"")).collect::<Vec<_>>().join(","),
        grants.join(",")
    ))
}

/// The door: bytes in, bytes out, or nothing — and nothing is silence.
///
/// Three calls rather than one, and the middle one is where a being's answer
/// comes back to this file. What the being answers is never asserted by any
/// scenario, so what goes back is empty bytes — and, where the scenario gave
/// that being an `onward`, the ask its own kit composed.
fn door(order: &Json) -> Result<String, String> {
    let h = house()?;
    h.handed.clear();
    let bytes = un(&text_of(order, "bytes"))?;
    let arrival = h.clock.number()?;
    let verdict = match h.warden.judge(&bytes, arrival) {
        Ok(one) => one,
        Err(_) => return Ok("{\"answer\":null,\"onward\":[]}".to_string()),
    };
    let data = match verdict.route.clone() {
        Route::Being { being, method } => {
            match invoke(&being, &method, &verdict.leash, verdict.arrival) {
                Ok(answered) => Some(answered),
                Err(_) => return Ok(handed_only(&house()?.handed)),
            }
        }
        _ => {
            let h = house()?;
            let mint = h.expecting;
            match h.warden.answer(&verdict, mint.as_ref()) {
                Ok(one) => one,
                Err(_) => return Ok(handed_only(&house()?.handed)),
            }
        }
    };
    let h = house()?;
    let ephemeral = h.random.draw()?;
    match h.warden.reply(&verdict.say, data, &ephemeral) {
        Ok(sealed) => Ok(format!(
            "{{\"answer\":\"{}\",\"onward\":[{}]}}",
            hx(&sealed),
            h.handed
                .iter()
                .map(|one| format!("\"{}\"", hx(one)))
                .collect::<Vec<_>>()
                .join(",")
        )),
        Err(_) => Ok(handed_only(&h.handed)),
    }
}

fn handed_only(handed: &[Vec<u8>]) -> String {
    format!(
        "{{\"answer\":null,\"onward\":[{}]}}",
        handed
            .iter()
            .map(|one| format!("\"{}\"", hx(one)))
            .collect::<Vec<_>>()
            .join(",")
    )
}

/// The one thing a being in this contract ever does. It decides nothing: the
/// scenario named the far warden, the being, the method and the ephemeral key,
/// and what this returns is never asserted.
///
/// **The leash spent is the one this kit computed**, through the kit's own
/// `onward`, against the arrival reading the verdict carries and a second
/// reading off the clock queue. Recomputing it here would be the subject doing
/// the arithmetic the case is about.
///
/// **That line is load-bearing and nothing enforces it**, which was proved
/// rather than assumed: replacing the call with the two subtractions it
/// performs leaves every scenario green, while breaking the kit's `onward`
/// turns `chain` red. So the chain scenario measures whichever of the two did
/// the arithmetic — and where the being is the host, as it is in this kit and
/// in Zig, a subject that recomputed the leash would go green over a warden
/// whose own arithmetic is wrong. The contract says not to; no check can.
fn invoke(
    being: &[u8; KEY],
    method: &Method,
    arrived: &Allowance,
    arrival: i64,
) -> Result<Vec<u8>, String> {
    let h = house()?;
    let Some(spec) = h.onward.get(being).cloned() else {
        return Ok(Vec::new());
    };
    if spec.when != method.name {
        return Ok(Vec::new());
    }
    let Some(index) = h
        .warden
        .outbound
        .iter()
        .position(|row| row.warden == spec.at)
    else {
        return Err(format!("no relation at {}", hx(&spec.at)));
    };
    // The second of the two clock readings, taken at the moment of handing
    // onward. The kit's own `onward` does the arithmetic against the arrival
    // reading the verdict carries.
    let handed = h.clock.number()?;
    let Some(leash) = quo_warden::onward(arrived, arrival, handed) else {
        // A leash with nothing left to spend composes nothing, and the being
        // answers anyway: Article VIII withholds the onward ask while "the work
        // already routed stands".
        return Ok(Vec::new());
    };
    let reach = Reach {
        being: spec.being,
        method: spec.method.clone(),
        next: None,
        allowance: leash,
        hints: Vec::new(),
        seq: Some(spec.seq),
    };
    if let Ok((bytes, _)) = h.warden.ask(index, &spec.ephemeral, &reach) {
        h.handed.push(bytes);
    }
    Ok(Vec::new())
}

fn amend(order: &Json) -> Result<String, String> {
    let h = house()?;
    let voice = field_key(order, "voice")?;
    for one in order.get("add").map(|a| a.list()).unwrap_or(&[]) {
        h.warden
            .widen(&voice, &key(&un(one.text())?)?)
            .map_err(|why| why.0)?;
    }
    for one in order.get("remove").map(|r| r.list()).unwrap_or(&[]) {
        h.warden
            .narrow(&voice, &key(&un(one.text())?)?)
            .map_err(|why| why.0)?;
    }
    Ok("{}".to_string())
}

fn succeed(order: &Json) -> Result<String, String> {
    let h = house()?;
    h.warden
        .succeed(
            field_key(order, "nameSeed")?,
            field_key(order, "heirCommitment")?,
        )
        .map_err(|why| why.0)?;
    Ok("{}".to_string())
}

/// Article IX's own shape, read off the records. This kit composes no cargo,
/// so the two records are read directly — the same as the JS and Python
/// subjects, and only the Go one goes through a packer.
/// One piece of news per peer, each sealed with the key it was handed and
/// spending the number it was given. A peer that left no way back composes
/// nothing, which the kit decides and this only passes on.
///
/// **The word is the kit's.** `depart` and `landed` compose it; this file says
/// only which being left and where it went. A subject that built the word and
/// asked the kit to seal it would assert nothing about the warden — and every
/// field of it is reachable from here, so that is a live temptation rather than
/// a theoretical one.
fn told(
    word: &Word,
    secret: [u8; KEY],
    peers: &[quo_warden::Peer],
    order: &Json,
) -> Result<String, String> {
    let h = house()?;
    let mut out = Vec::new();
    for (at, peer) in peers.iter().enumerate() {
        let Some(one) = order.get("news").map(|n| n.list()).unwrap_or(&[]).get(at) else {
            break;
        };
        let allowance = one.get("allowance").ok_or("no allowance")?;
        let sealed = h.warden.news(
            &field_key(one, "ephemeral")?,
            &quo_warden::Tell {
                peer: peer.clone(),
                voice_secret: secret,
                word: word.clone(),
                seq: number_of(one, "seq", 1),
                allowance: Allowance {
                    time: number_of(allowance, "time", 0),
                    hops: number_of(allowance, "hops", 0),
                },
                hints: h.roads.clone(),
            },
        );
        match sealed {
            Ok(bytes) => out.push(format!("\"{}\"", hx(&bytes))),
            Err(_) => continue,
        }
    }
    Ok(format!("{{\"news\":[{}]}}", out.join(",")))
}

fn depart(order: &Json) -> Result<String, String> {
    let h = house()?;
    let gone = order.get("gone").ok_or("no gone")?;
    let heir = field_key(order, "heirSeed")?;
    let left = h
        .warden
        .depart(
            &field_key(order, "being")?,
            &quo_warden::Departing {
                heir: quo_arithmetic::signing_pk(&heir),
                commitment: field_key(order, "commitment")?,
                name: field_key(gone, "name")?,
                padlock: field_key(gone, "padlock")?,
                hints: hints_of(gone, "hints"),
            },
        )
        .map_err(|why| why.0)?;
    // The first news is signed by the being's committed heir, and the origin no
    // longer holds the being: after the double rotation every key the old
    // warden held for it is dead, so the seed is the one handed in.
    told(&left.word.clone(), heir, &left.peers.clone(), order)
}

fn landed(order: &Json) -> Result<String, String> {
    let h = house()?;
    // The key the second news is signed by is the one this door minted for the
    // arriving being, which `stand` handed in as `expecting.seed`.
    let secret = h.expecting.ok_or("nothing was expected here")?[0];
    let here = h
        .warden
        .landed(&hints_of(order, "hints"))
        .map_err(|why| why.0)?;
    told(&here.word.clone(), secret, &here.peers.clone(), order)
}

fn state(order: &Json) -> Result<String, String> {
    let h = house()?;
    let being = field_key(order, "being")?;
    let Some(held) = h.warden.beings.iter().find(|one| one.being == being) else {
        return Ok("{\"cargo\":null,\"cannot\":[]}".to_string());
    };
    let mut standings: Vec<String> = h
        .warden
        .inbound
        .iter()
        .filter(|row| row.beings.contains(&being))
        .map(|row| {
            let mut names: Vec<String> = row.beings.iter().map(|one| hx(one)).collect();
            names.sort();
            let mut spent = row.spent.clone();
            spent.sort_unstable();
            format!(
                "{{\"voice\":\"{}\",\"commitment\":\"{}\",\"name\":\"{}\",\"beings\":[{}],\"mark\":\"{}\",\"spent\":[{}],\"padlock\":{},\"hints\":[{}]}}",
                hx(&row.voice),
                hx(&row.commitment),
                hx(&row.minted_at),
                names.iter().map(|one| format!("\"{one}\"")).collect::<Vec<_>>().join(","),
                row.mark,
                spent.iter().map(|one| format!("\"{one}\"")).collect::<Vec<_>>().join(","),
                row.padlock.map(|one| format!("\"{}\"", hx(&one))).unwrap_or("null".to_string()),
                row.hints.iter().map(|one| format!("\"{one}\"")).collect::<Vec<_>>().join(",")
            )
        })
        .collect();
    standings.sort();
    let mut relations: Vec<String> = h
        .warden
        .outbound
        .iter()
        .map(|row| {
            format!(
                "{{\"warden\":\"{}\",\"commitment\":\"{}\",\"padlock\":\"{}\",\"voice\":\"{}\",\"heir\":\"{}\",\"seq\":\"{}\",\"news\":\"{}\",\"hints\":[{}]}}",
                hx(&row.warden),
                hx(&row.commitment),
                hx(&row.padlock),
                hx(&row.voice),
                hx(&row.heir),
                row.seq,
                row.news,
                row.hints.iter().map(|one| format!("\"{one}\"")).collect::<Vec<_>>().join(",")
            )
        })
        .collect();
    relations.sort();
    Ok(format!(
        "{{\"cargo\":{{\"being\":\"{}\",\"digest\":\"{}\",\"cells\":\"{}\",\"standings\":[{}],\"relations\":[{}]}},\"cannot\":[]}}",
        hx(&held.being),
        hx(&held.digest),
        hx(&held.cells),
        standings.join(","),
        relations.join(",")
    ))
}

fn send(order: &Json) -> Result<String, String> {
    let h = house()?;
    let ask = order.get("ask").ok_or("no ask")?;
    let at = field_key(ask, "at")?;
    let Some(index) = h.warden.outbound.iter().position(|row| row.warden == at) else {
        return Ok(format!("{{\"error\":\"no relation at {}\"}}", hx(&at)));
    };
    let allowance = ask.get("allowance").ok_or("no allowance")?;
    let reach = Reach {
        being: maybe_key(ask, "being")?,
        method: ask.get("method").map(|m| Method {
            name: text_of(m, "name"),
            args: un(&text_of(m, "args")).unwrap_or_default(),
        }),
        next: maybe_key(ask, "commitment")?,
        allowance: Allowance {
            time: number_of(allowance, "time", 0),
            hops: number_of(allowance, "hops", 0),
        },
        hints: Vec::new(),
        seq: Some(number_of(ask, "seq", 1)),
    };
    let ephemeral = h.random.draw()?;
    // A refusal to send is an ordinary expected outcome, not an error.
    match h.warden.ask(index, &ephemeral, &reach) {
        Ok((bytes, _)) => Ok(format!("{{\"bytes\":\"{}\"}}", hx(&bytes))),
        Err(_) => Ok("{\"bytes\":null}".to_string()),
    }
}

fn read(order: &Json) -> Result<String, String> {
    let h = house()?;
    let at = field_key(order, "at")?;
    let Some(index) = h.warden.outbound.iter().position(|row| row.warden == at) else {
        return Ok("{\"answer\":null}".to_string());
    };
    let bytes = un(&text_of(order, "answer"))?;
    match h.warden.hear(index, &bytes) {
        Ok(answer) => Ok(format!(
            "{{\"answer\":{{\"warden\":\"{}\",\"seq\":\"{}\",\"data\":{}}}}}",
            hx(&answer.warden),
            answer.seq,
            answer
                .data
                .as_ref()
                .map(|one| format!("\"{}\"", hx(one)))
                .unwrap_or("null".to_string())
        )),
        Err(_) => Ok("{\"answer\":null}".to_string()),
    }
}

fn obey(line: &str) -> String {
    let order = json::parse(line);
    let verb = order
        .get("do")
        .map(|one| one.text().to_string())
        .unwrap_or_default();
    let out = match verb.as_str() {
        "stand" => stand(&order),
        "door" => door(&order),
        "amend" => amend(&order),
        "succeed" => succeed(&order),
        "state" => state(&order),
        "send" => send(&order),
        "read" => read(&order),
        "depart" => depart(&order),
        "landed" => landed(&order),
        other => Err(format!("no such verb: {other}")),
    };
    match out {
        Ok(text) => text,
        Err(why) => format!("{{\"error\":\"{}\"}}", why.replace('"', "'")),
    }
}

fn main() {
    let stdin = io::stdin();
    let mut stdout = io::stdout();
    for line in stdin.lock().lines() {
        let line = line.expect("a line on stdin");
        if line.trim().is_empty() {
            continue;
        }
        writeln!(stdout, "{}", obey(&line)).expect("a line on stdout");
        stdout.flush().expect("a flushed stdout");
    }
}
