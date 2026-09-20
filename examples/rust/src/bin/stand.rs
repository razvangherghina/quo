//! `stand`: HARNESS.md part one and part two on stdin and stdout.

use quokit::carrier;
use quokit::crypto::{hex, seed_from_text, sha256, unhex};
use quokit::json::{self, Object};
use quokit::quo::{Door, Invitation, Reach, Read, Standing};
use std::collections::HashMap;
use std::io::{BufRead, Write};
use std::sync::{Arc, Mutex};
use std::time::Duration;

const SEND_WAIT: Duration = Duration::from_secs(5);

#[derive(Default)]
struct Kit {
    wards: HashMap<String, Door>,
    standings: HashMap<String, Arc<Mutex<Standing>>>,
    routes: HashMap<String, String>,
    at: Option<String>,
}

type Shared = Arc<Mutex<Kit>>;

fn out(line: String) {
    let so = std::io::stdout();
    let mut l = so.lock();
    let _ = l.write_all(line.as_bytes());
    let _ = l.write_all(b"\n");
    let _ = l.flush();
}

fn err_line(id: Option<&str>, e: &str) -> String {
    let id = id.map(json::quote).unwrap_or_else(|| "null".into());
    format!("{{\"id\":{id},\"error\":\"{e}\"}}")
}

const BAD: &str = "bad request";

/// A required field of type string.
fn s(n: &Object, k: &str) -> Result<String, &'static str> {
    n.get(k).and_then(|v| v.as_str()).ok_or(BAD)
}

/// An optional field of type string; present null is a bad request.
fn opt_s(n: &Object, k: &str) -> Result<Option<String>, &'static str> {
    match n.get(k) {
        None => Ok(None),
        Some(v) => v.as_str().map(Some).ok_or(BAD),
    }
}

fn ward_field(n: &Object) -> Result<String, &'static str> {
    let w = s(n, "ward")?;
    unhex(&w, Some(64)).ok_or(BAD)?;
    Ok(w)
}

fn invitation(n: &Object, line: &[u8]) -> Result<Invitation, &'static str> {
    n.get("invitation").and_then(|i| Invitation::from_text(i.text(line))).ok_or(BAD)
}

fn standing_key(ward: &str, inv: &Invitation) -> String {
    format!("{ward}/{}/{}/{}/{}", hex(&inv.ward), hex(&inv.heir), hex(&inv.secret), hex(&sha256(&inv.lock)))
}

/// `method` and `args` from the line, as the raw text the caller gave.
fn method_args(n: &Object, line: &[u8]) -> Result<(Option<Vec<u8>>, Option<Vec<u8>>), &'static str> {
    let method = match n.get("method") {
        None => None,
        Some(m) if m.is_str() => Some(m.text(line).to_vec()),
        Some(_) => return Err(BAD),
    };
    let args = match n.get("args") {
        None => None,
        Some(a) if a.is_obj() => Some(a.text(line).to_vec()),
        Some(_) => return Err(BAD),
    };
    Ok((method, args))
}

fn reach_of(r: Option<String>) -> Result<Option<Reach>, &'static str> {
    match r {
        None => Ok(None),
        Some(x) => Reach::named(&x).map(Some).ok_or("not reached"),
    }
}

/// Answer one request. Ok is the answer body after `"id":..,`.
fn handle(kit: &Shared, n: &Object, line: &[u8], op: &str, id: &str) -> Option<Result<String, &'static str>> {
    Some(match op {
        "ward" => (|| {
            let seed = s(n, "seed")?;
            let reach = opt_s(n, "reach")?;
            let reach = reach_of(reach)?;
            let mut k = kit.lock().unwrap();
            let door = Door::new(&seed_from_text(&seed), reach);
            let pk = door.key.pk_hex();
            if k.wards.contains_key(&pk) {
                return Err("ward stood");
            }
            k.wards.insert(pk.clone(), door);
            Ok(format!("\"ward\":\"{pk}\""))
        })(),
        "invite" => (|| {
            let w = ward_field(n)?;
            let heir = s(n, "heir")?;
            let reach = opt_s(n, "reach")?;
            let mut k = kit.lock().unwrap();
            let door = k.wards.get_mut(&w).ok_or("no such ward")?;
            let reach = reach_of(reach)?.unwrap_or(Reach::Echo);
            if door.holds_name(&heir) {
                return Err("name held");
            }
            let at = k.at.iter().cloned().collect();
            let door = k.wards.get_mut(&w).ok_or("no such ward")?;
            Ok(format!("\"invitation\":{}", door.invite(&heir, reach, at).to_json()))
        })(),
        "release" => (|| {
            let w = ward_field(n)?;
            let heir = s(n, "heir")?;
            let mut k = kit.lock().unwrap();
            let door = k.wards.get_mut(&w).ok_or("no such ward")?;
            Ok(if door.release(&heir) {
                format!("\"released\":{}", json::quote(&heir))
            } else {
                "\"released\":null".to_string()
            })
        })(),
        "arrive" => (|| {
            let w = ward_field(n)?;
            let bx = unhex(&s(n, "box")?, None).ok_or(BAD)?;
            let mut k = kit.lock().unwrap();
            let door = k.wards.get_mut(&w).ok_or("no such ward")?;
            let r = door.arrive(&bx);
            eprintln!("stand: arrive {id}: {:?}", door.last_case);
            Ok(format!("\"reply\":\"{}\"", hex(&r)))
        })(),
        "ask" => (|| {
            let w = ward_field(n)?;
            let inv = invitation(n, line)?;
            let (m, a) = method_args(n, line)?;
            let st = standing(kit, &w, inv)?;
            let mut st = st.lock().unwrap();
            let bx = st.ask(m.as_deref(), a.as_deref()).map_err(|_| BAD)?;
            Ok(format!("\"box\":\"{}\"", hex(&bx)))
        })(),
        "read" => (|| {
            let w = ward_field(n)?;
            let inv = invitation(n, line)?;
            let reply = match n.get("reply") {
                None => return Err(BAD),
                Some(r) if r.is_null() => None,
                Some(r) => Some(unhex(&r.as_str().ok_or(BAD)?, None).ok_or(BAD)?),
            };
            let key = standing_key(&w, &inv);
            let st = {
                let k = kit.lock().unwrap();
                if !k.wards.contains_key(&w) {
                    return Err("no such ward");
                }
                k.standings.get(&key).cloned().ok_or(BAD)?
            };
            let mut st = st.lock().unwrap();
            let r = st.read(reply.as_deref()).ok_or(BAD)?;
            Ok(format!("\"read\":{}", r.to_json()))
        })(),
        "listen" => (|| {
            // This kit stands tcp alone.
            if opt_s(n, "scheme")?.is_some_and(|s| s != "tcp") {
                return Err(BAD);
            }
            let mut k = kit.lock().unwrap();
            if let Some(at) = &k.at {
                return Ok(format!("\"at\":\"{at}\""));
            }
            let kk = kit.clone();
            let h: carrier::Handler = Arc::new(move |ward: &[u8; 64], bx: &[u8]| {
                let mut k = kk.lock().unwrap();
                let door = k.wards.get_mut(&hex(ward))?;
                let r = door.arrive(bx);
                eprintln!("stand: carried arrive: {:?}", door.last_case);
                Some(r)
            });
            let at = carrier::listen(h).map_err(|_| BAD)?;
            k.at = Some(at.clone());
            Ok(format!("\"at\":\"{at}\""))
        })(),
        "route" => (|| {
            let far = s(n, "far")?;
            unhex(&far, Some(64)).ok_or(BAD)?;
            let at = carrier::tcp_address(&s(n, "at")?).ok_or(BAD)?;
            kit.lock().unwrap().routes.insert(far.clone(), at);
            Ok(format!("\"routed\":\"{far}\""))
        })(),
        "send" => return None, // served on its own thread
        _ => Err("no such op"),
    })
}

fn standing(kit: &Shared, w: &str, inv: Invitation) -> Result<Arc<Mutex<Standing>>, &'static str> {
    let mut k = kit.lock().unwrap();
    if !k.wards.contains_key(w) {
        return Err("no such ward");
    }
    let key = standing_key(w, &inv);
    Ok(k.standings.entry(key).or_insert_with(|| Arc::new(Mutex::new(Standing::new(inv)))).clone())
}

fn prepare_send(kit: &Shared, n: &Object, line: &[u8]) -> Result<impl FnOnce() -> String, &'static str> {
    let w = ward_field(n)?;
    let inv = invitation(n, line)?;
    let (m, a) = method_args(n, line)?;
    let far = inv.ward;
    let from_at: Vec<String> = inv.at.iter().filter_map(|a| carrier::tcp_address(a)).collect();
    let st = standing(kit, &w, inv)?;
    let kit = kit.clone();
    Ok(move || {
        // One send at a time on a relation: the standing is held for the whole send.
        let mut st = st.lock().unwrap();
        let Ok(bx) = st.ask(m.as_deref(), a.as_deref()) else {
            return format!("\"error\":\"{BAD}\"");
        };
        // A route is dialed alone. Without one, the invitation's tcp addresses are
        // tried in order, each only after the one before it delivered nothing.
        let route = kit.lock().unwrap().routes.get(&hex(&far)).cloned();
        let addresses = route.map(|r| vec![r]).unwrap_or(from_at);
        let mut dialed = carrier::Dialed::Unsent;
        for at in &addresses {
            dialed = carrier::dial(at, &far, &bx, SEND_WAIT);
            if dialed != carrier::Dialed::Unsent {
                break;
            }
        }
        let r = match dialed {
            carrier::Dialed::Unsent => {
                st.unsent();
                Read::Nothing
            }
            carrier::Dialed::Nothing => st.read(None).expect("an ask was just made"),
            carrier::Dialed::Reply(b) => st.read(Some(&b)).expect("an ask was just made"),
        };
        format!("\"read\":{}", r.to_json())
    })
}

fn main() {
    let kit: Shared = Arc::new(Mutex::new(Kit::default()));
    let mut threads = Vec::new();
    let stdin = std::io::stdin();
    let mut lock = stdin.lock();
    let mut buf = Vec::new();
    loop {
        buf.clear();
        match lock.read_until(b'\n', &mut buf) {
            Ok(0) => break,
            Ok(_) => {}
            Err(_) => break,
        }
        while matches!(buf.last(), Some(b'\n' | b'\r')) {
            buf.pop();
        }
        if buf.is_empty() {
            continue;
        }
        let line = buf.clone();
        let Some(n) = json::object(&line) else {
            out(err_line(None, BAD));
            continue;
        };
        let Some(id) = n.get("id").and_then(|v| v.as_str()) else {
            out(err_line(None, BAD));
            continue;
        };
        let Some(op) = n.get("op").and_then(|v| v.as_str()) else {
            out(err_line(Some(&id), BAD));
            continue;
        };
        let qid = json::quote(&id);
        match handle(&kit, &n, &line, &op, &id) {
            Some(Ok(body)) => out(format!("{{\"id\":{qid},{body}}}")),
            Some(Err(e)) => out(err_line(Some(&id), e)),
            None => match prepare_send(&kit, &n, &line) {
                Err(e) => out(err_line(Some(&id), e)),
                Ok(job) => threads.push(std::thread::spawn(move || {
                    out(format!("{{\"id\":{qid},{}}}", job()));
                })),
            },
        }
    }
    for t in threads {
        let _ = t.join();
    }
    std::process::exit(0);
}
