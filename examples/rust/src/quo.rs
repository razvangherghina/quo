//! The door and the standing of Quo.

use crate::crypto::*;
use crate::json::{self, Node};
use std::collections::HashMap;

pub const SIZE: usize = 1_048_576;
pub const SILENCE: &[u8] = br#"{"silence":true}"#;
const ZERO: [u8; 32] = [0u8; 32];
const DESCRIBE_NONE: &[u8] = br#"{"asks":[]}"#;

/// What answers behind a door.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reach {
    Echo,
    Marked,
    Moved,
    Null,
    Silent,
}

/// The `at` the reach `moved` writes on every object, as the harness fixes it.
const MOVED_AT: &[u8] = br#"["tcp://127.0.0.1:9"]"#;

impl Reach {
    pub fn named(s: &str) -> Option<Reach> {
        match s {
            "echo" => Some(Reach::Echo),
            "marked" => Some(Reach::Marked),
            "moved" => Some(Reach::Moved),
            "null" => Some(Reach::Null),
            "silent" => Some(Reach::Silent),
            _ => None,
        }
    }

    /// The reply text chosen, or None for silence.
    fn answer(&self, named: bool, args: Option<&[u8]>) -> Option<Vec<u8>> {
        let seen = if *self == Reach::Marked { "\"1\"" } else { "null" };
        let object = match self {
            Reach::Silent => return None,
            // The describe every reach but silent gives the empty ask: no entry, no lang.
            _ if !named => DESCRIBE_NONE,
            Reach::Null => b"null",
            Reach::Echo | Reach::Marked | Reach::Moved => args.unwrap_or(b"{}"),
        };
        let mut t = b"{\"object\":".to_vec();
        t.extend_from_slice(object);
        t.extend_from_slice(b",\"seen\":");
        t.extend_from_slice(seen.as_bytes());
        if *self == Reach::Moved {
            t.extend_from_slice(b",\"at\":");
            t.extend_from_slice(MOVED_AT);
        }
        t.push(b'}');
        Some(t)
    }
}

#[derive(Clone)]
enum HeirState {
    Fresh,
    Spent(Keys),
}

#[derive(Clone)]
struct Keys {
    held: [u8; 32],
    vouched: Option<[u8; 32]>,
    open: [u8; 32],
    offered: [u8; 32],
    highest: u64,
}

struct Heir {
    state: HeirState,
    reach: Reach,
}

/// Which case refused an arrival, for the kit's own eyes.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Case {
    C1,
    C2,
    C3,
    C4,
    C5,
    C6,
    C7,
    C8,
    C9,
    C10,
    C11,
    C12,
    C13,
}

enum Verdict {
    Silence(Case),
    /// A word, with the edge key the ask came under.
    Word(&'static str, Case, [u8; 32]),
    Choice {
        text: Option<Vec<u8>>,
        mv: Option<Move>,
    },
}

struct Move {
    heir: [u8; 32],
    seq: u64,
    by: [u8; 32],
    announced: Option<[u8; 32]>,
    /// The edge key the ask came under.
    under: [u8; 32],
}

pub struct Door {
    pub key: WardKey,
    lock: Lock,
    zero: Option<Reach>,
    heirs: HashMap<[u8; 32], Heir>,
    /// Keys kept at removal, for spent heirs the door stopped holding. Kept forever.
    removed: HashMap<[u8; 32], Keys>,
    names: HashMap<String, [u8; 32]>,
    pub last_case: Option<Case>,
}

pub struct Invitation {
    pub ward: [u8; 64],
    pub heir: [u8; 32],
    pub secret: [u8; 32],
    pub lock: Vec<u8>,
    /// The strings of `at`, in order. Which of them this kit dials is the carrier's to say.
    pub at: Vec<String>,
    /// The invitation text, as signed.
    pub text: String,
    pub sig: [u8; 64],
}

/// The bytes an invitation's `sig` covers: `quo-invitation`, then the invitation text.
fn invitation_signed(text: &str) -> Vec<u8> {
    [b"quo-invitation", text.as_bytes()].concat()
}

impl Invitation {
    /// The invitation: its text as a string, and its signature.
    pub fn to_json(&self) -> String {
        format!("{{\"text\":{},\"sig\":\"{}\"}}", json::quote(&self.text), hex(&self.sig))
    }

    /// Read an invitation: `text` and `sig` and no other field, the `sig` the
    /// signature of the ward the text names over `quo-invitation` then the text.
    pub fn from_json(v: &[u8]) -> Option<Invitation> {
        let n = json::object(v)?;
        if !n.has_only(&["text", "sig"]) {
            return None;
        }
        // A text that denotes a lone surrogate has no UTF-8 bytes, and is no string here.
        let text = n.get("text")?.as_str()?;
        let sig = unhex(&n.get("sig")?.as_str()?, Some(64))?;
        let mut s = [0u8; 64];
        s.copy_from_slice(&sig);
        let inv = Invitation::from_text(text, s)?;
        ed_verify(&inv.sign_pk(), &invitation_signed(&inv.text), &inv.sig).then_some(inv)
    }

    /// Read an invitation text. Fields beside the five are ignored.
    /// An `at` that is not an array is absent, and an element that is not a string is skipped.
    fn from_text(text: String, sig: [u8; 64]) -> Option<Invitation> {
        let t = text.as_bytes();
        let n = json::object(t)?;
        let f = |k: &str, len: usize| -> Option<Vec<u8>> { unhex(&n.get(k)?.as_str()?, Some(len)) };
        let ward = f("ward", 64)?;
        let heir = f("heir", 32)?;
        let secret = f("secret", 32)?;
        let lock = f("lock", LOCK_EK_LEN).filter(|l| ek_valid(l))?;
        let mut w = [0u8; 64];
        w.copy_from_slice(&ward);
        let at = at_of(n.get("at"), t).unwrap_or_default();
        Some(Invitation { ward: w, heir: arr32(&heir), secret: arr32(&secret), lock, at, text, sig })
    }

    pub fn sign_pk(&self) -> [u8; 32] {
        arr32(&self.ward[..32])
    }
    pub fn padlock(&self) -> [u8; 32] {
        arr32(&self.ward[32..])
    }
}

/// The strings of an `at`, in order, or None where it is absent or no array.
/// An element that is not a string is skipped; which strings are addresses is the carrier's to say.
fn at_of(at: Option<&Node>, t: &[u8]) -> Option<Vec<String>> {
    json::elements(at?.text(t)).map(|es| es.iter().filter_map(|e| e.as_str()).collect())
}

fn is_pk(n: &Node) -> Option<[u8; 32]> {
    let b = unhex(&n.as_str()?, Some(32))?;
    if b.iter().all(|x| *x == 0) {
        return None;
    }
    Some(arr32(&b))
}

impl Door {
    pub fn new(seed: &[u8; 32], zero: Option<Reach>) -> Door {
        Door {
            key: WardKey::from_seed(seed),
            lock: Lock::generate(),
            zero,
            heirs: HashMap::new(),
            removed: HashMap::new(),
            names: HashMap::new(),
            last_case: None,
        }
    }

    pub fn holds_name(&self, name: &str) -> bool {
        self.names.contains_key(name)
    }

    /// Make a heir under `name` and give its invitation, signed. The ward keeps the
    /// heir pk and not the secret. `at`, the JSON text of an array, is written in the
    /// invitation text as given.
    pub fn invite(&mut self, name: &str, reach: Reach, at: Option<&str>) -> Invitation {
        let secret = draw::<32>();
        let pk = ed_pub(&secret);
        self.heirs.insert(pk, Heir { state: HeirState::Fresh, reach });
        self.names.insert(name.to_string(), pk);
        let at = at.map(|a| format!(",\"at\":{a}")).unwrap_or_default();
        let text = format!(
            "{{\"ward\":\"{}\",\"heir\":\"{}\",\"secret\":\"{}\",\"lock\":\"{}\"{at}}}",
            self.key.pk_hex(),
            hex(&pk),
            hex(&secret),
            hex(&self.lock.ek)
        );
        let sig = ed_sign(&self.key.sign_secret, &invitation_signed(&text));
        Invitation::from_text(text, sig).expect("the ward writes an invitation text")
    }

    /// Stop holding the heir named `name`. A spent heir's keys are kept at removal.
    pub fn release(&mut self, name: &str) -> bool {
        let Some(pk) = self.names.remove(name) else { return false };
        if let Some(h) = self.heirs.remove(&pk) {
            if let HeirState::Spent(k) = h.state {
                self.removed.insert(pk, k);
            }
        }
        true
    }

    /// Seal a reply under `edge`. It returns the box and the reply's agreement.
    fn seal_reply(&self, lid: Option<[u8; 32]>, edge: &[u8; 32], text: &[u8]) -> (Vec<u8>, [u8; 32]) {
        let lid = match lid {
            Some(l) if takes_seal(&l) => l,
            _ => {
                let r = draw::<32>();
                if takes_seal(&r) {
                    r
                } else {
                    x25519_pub(&draw::<32>())
                }
            }
        };
        let eph = draw::<32>();
        let eph_pk = x25519_pub(&eph);
        let agr = agree(&eph, &lid).expect("the lid takes a seal");
        let mut over = lid.to_vec();
        over.extend_from_slice(text);
        let mut body = text.to_vec();
        body.extend_from_slice(&ed_sign(&self.key.sign_secret, &over));
        let mut out = eph_pk.to_vec();
        out.extend(seal_with(&edge_ikm(&agr, edge), "quo-edge-seal", &eph_pk, &body));
        (out, agr)
    }

    /// An ask's box in, a reply's box out. This door always answers.
    pub fn arrive(&mut self, bx: &[u8]) -> Vec<u8> {
        let lid = if bx.len() >= 32 { Some(arr32(&bx[..32])) } else { None };
        match self.judge(bx) {
            Verdict::Silence(c) => {
                self.last_case = Some(c);
                self.seal_reply(lid, &ZERO, SILENCE).0
            }
            Verdict::Word(w, c, under) => {
                self.last_case = Some(c);
                let t = format!("{{\"quo\":\"{w}\"}}");
                self.seal_reply(lid, &under, t.as_bytes()).0
            }
            Verdict::Choice { text, mv } => {
                let under = mv.as_ref().map_or(ZERO, |m| m.under);
                let (case, edge, t) = match &text {
                    Some(t) => (Case::C12, under, &t[..]),
                    None => (Case::C13, ZERO, SILENCE),
                };
                self.last_case = Some(case);
                let (out, agr) = self.seal_reply(lid, &edge, t);
                if let Some(m) = mv {
                    self.apply(m, &agr);
                }
                out
            }
        }
    }

    fn apply(&mut self, m: Move, agr: &[u8; 32]) {
        let Some(h) = self.heirs.get_mut(&m.heir) else { return };
        let next_keys = match &h.state {
            HeirState::Fresh => Keys {
                held: m.announced.expect("a knock that binds announces"),
                vouched: None,
                open: m.under,
                offered: follow(&m.under, agr),
                highest: m.seq,
            },
            HeirState::Spent(k) => {
                let (held, vouched) = if m.by == k.held {
                    (k.held, m.announced.or(k.vouched))
                } else {
                    (m.by, m.announced)
                };
                Keys { held, vouched, open: m.under, offered: follow(&m.under, agr), highest: m.seq }
            }
        };
        h.state = HeirState::Spent(next_keys);
    }

    fn judge(&self, bx: &[u8]) -> Verdict {
        use Verdict::Silence as S;
        // Case 1: the box does not open.
        if bx.len() > SIZE || bx.len() < 32 + 48 {
            return S(Case::C1);
        }
        let lid = arr32(&bx[..32]);
        let Some(agr) = agree(&self.key.seal_secret, &lid) else { return S(Case::C1) };
        let Some(head) = open_with(&agr, "quo-seal", &lid, &bx[32..80]) else { return S(Case::C1) };
        let head = arr32(&head);

        enum Via {
            Zero,
            Unheld,
            Fresh,
            Spent(Keys),
            Removed(Keys),
        }
        let via = if head == ZERO {
            Via::Zero
        } else if let Some(h) = self.heirs.get(&head) {
            match &h.state {
                HeirState::Fresh => Via::Fresh,
                HeirState::Spent(k) => Via::Spent(k.clone()),
            }
        } else if let Some(k) = self.removed.get(&head) {
            Via::Removed(k.clone())
        } else {
            Via::Unheld
        };

        let (body_ct, edges): (&[u8], Vec<[u8; 32]>) = match &via {
            Via::Zero | Via::Unheld => (&bx[80..], vec![ZERO]),
            Via::Fresh => {
                if bx.len() < 80 + KEM_CT_LEN {
                    return S(Case::C1);
                }
                let ss = self.lock.decapsulate(&bx[80..80 + KEM_CT_LEN]);
                (&bx[80 + KEM_CT_LEN..], vec![hkdf32(&ss, "quo-lock")])
            }
            Via::Spent(k) | Via::Removed(k) => (&bx[80..], vec![k.open, k.offered]),
        };
        let mut opened = None;
        for e in &edges {
            if let Some(pt) = open_with(&edge_ikm(&agr, e), "quo-edge-seal", &lid, body_ct) {
                opened = Some((pt, *e));
                break;
            }
        }
        let Some((pt, under)) = opened else { return S(Case::C1) };
        if pt.len() <= 64 {
            return S(Case::C1);
        }
        let (payload, sig) = pt.split_at(pt.len() - 64);

        // Case 2.
        let Some(p) = json::object(payload) else { return S(Case::C2) };

        // Case 3.
        let Some(to) = p.get("to") else { return S(Case::C3) };
        match &via {
            Via::Zero => {
                if !to.is_null() {
                    return S(Case::C3);
                }
            }
            _ => {
                if is_pk(to) != Some(head) {
                    return S(Case::C3);
                }
            }
        }
        let Some(by) = p.get("by").and_then(is_pk) else { return S(Case::C3) };
        let next = match p.get("next") {
            None => return S(Case::C3),
            Some(n) if n.is_null() => None,
            Some(n) => match is_pk(n) {
                Some(k) => Some(k),
                None => return S(Case::C3),
            },
        };
        let Some(seq) = p.get("seq").and_then(|n| json::count_number(n.text(payload))) else {
            return S(Case::C3);
        };
        let named = match p.get("method") {
            None => false,
            Some(m) if m.is_str() => true,
            Some(_) => return S(Case::C3),
        };
        let args = match p.get("args") {
            None => None,
            Some(a) if a.is_obj() => Some(a.text(payload)),
            Some(_) => return S(Case::C3),
        };

        if let Via::Zero = via {
            // Case 4 and case 5; the zero head keeps nothing.
            let Some(reach) = self.zero else { return S(Case::C4) };
            if !ed_verify(&by, payload, sig) {
                return S(Case::C5);
            }
            return Verdict::Choice { text: reach.answer(named, args), mv: None };
        }

        // Case 6.
        if let Via::Unheld = via {
            return S(Case::C6);
        }

        // Case 7.
        let admitted = match &via {
            Via::Fresh => by == head,
            Via::Spent(k) | Via::Removed(k) => by == k.held || Some(by) == k.vouched,
            _ => false,
        };
        if !admitted {
            return S(Case::C7);
        }
        // Case 8.
        if !ed_verify(&by, payload, sig) {
            return S(Case::C8);
        }
        // Case 9.
        if let Via::Removed(_) = via {
            return Verdict::Word("removed", Case::C9, under);
        }
        let announced = next.filter(|k| *k != head && *k != by);
        match &via {
            Via::Fresh => {
                // Case 10.
                if announced.is_none() {
                    return Verdict::Word("unannounced", Case::C10, under);
                }
            }
            Via::Spent(k) => {
                // Case 11: this door honours only numbers above the highest.
                if seq <= k.highest {
                    return Verdict::Word("repeated", Case::C11, under);
                }
            }
            _ => {}
        }
        // Cases 12 and 13.
        let reach = self.heirs[&head].reach;
        Verdict::Choice {
            text: reach.answer(named, args),
            mv: Some(Move { heir: head, seq, by, announced, under }),
        }
    }
}

// ------------------------------------------------------------------ standing

#[derive(Debug, Clone, PartialEq)]
pub enum Read {
    /// `at` holds the strings of the reply's `at`, None where it carried none.
    Object { object: String, seen: String, at: Option<Vec<String>> },
    Silence,
    Word(String),
    Nothing,
}

impl Read {
    pub fn to_json(&self) -> String {
        match self {
            Read::Object { object, seen, at: None } => format!("{{\"object\":{object},\"seen\":{seen}}}"),
            Read::Object { object, seen, at: Some(at) } => {
                let a: Vec<String> = at.iter().map(|s| json::quote(s)).collect();
                format!("{{\"object\":{object},\"seen\":{seen},\"at\":[{}]}}", a.join(","))
            }
            Read::Silence => "{\"silence\":true}".into(),
            Read::Word(w) => format!("{{\"quo\":{}}}", json::quote(w)),
            Read::Nothing => "{\"nothing\":true}".into(),
        }
    }
}

#[derive(Clone)]
enum Stage {
    New,
    /// A knock brought no object back. `key` is the key it announced, `edge` its
    /// edge key. The next ask is a recovery ask, or the knock again as the same bytes.
    Unsure { key: [u8; 32], edge: [u8; 32], knock: Vec<u8>, knock_lid: [u8; 32], knock_next: bool },
    Bound { key: [u8; 32], edge: [u8; 32] },
}

struct Pending {
    lid_secret: [u8; 32],
    sent_edge: [u8; 32],
    announced: [u8; 32],
    kind: AskKind,
    settled: bool,
    before: Stage,
}

#[derive(Clone, Copy, PartialEq)]
enum AskKind {
    Knock,
    Recovery,
    Bound,
}

pub struct Standing {
    pub inv: Invitation,
    /// The addresses the last reply's `at` gave, which the carrier keeps and dials
    /// in place of an invitation's.
    pub at: Option<Vec<String>>,
    stage: Stage,
    seq: u64,
    pending: Option<Pending>,
}

#[derive(Debug, PartialEq)]
pub enum AskError {
    /// The padlock takes no seal, or the lock is no encapsulation key.
    Unsealable,
}

impl Standing {
    pub fn new(inv: Invitation) -> Standing {
        Standing { inv, at: None, stage: Stage::New, seq: 0, pending: None }
    }

    /// Seal the next ask. `method` and `args` are JSON text already held to the value rules.
    pub fn ask(&mut self, method: Option<&[u8]>, args: Option<&[u8]>) -> Result<Vec<u8>, AskError> {
        let padlock = self.inv.padlock();
        let announced = draw::<32>();
        let before = self.stage.clone();
        let (kind, signer, edge) = match &mut self.stage {
            Stage::New => (AskKind::Knock, self.inv.secret, None),
            Stage::Unsure { key, edge, knock, knock_lid, knock_next: true } => {
                // The knock again, as the same bytes.
                self.pending = Some(Pending {
                    lid_secret: *knock_lid,
                    sent_edge: *edge,
                    announced: *key,
                    kind: AskKind::Knock,
                    settled: false,
                    before,
                });
                let out = knock.clone();
                if let Stage::Unsure { knock_next, .. } = &mut self.stage {
                    *knock_next = false;
                }
                return Ok(out);
            }
            Stage::Unsure { key, edge, .. } => (AskKind::Recovery, *key, Some(*edge)),
            Stage::Bound { key, edge } => (AskKind::Bound, *key, Some(*edge)),
        };
        let (ct, edge) = match edge {
            None => {
                let (c, ss) = encapsulate(&self.inv.lock).ok_or(AskError::Unsealable)?;
                (Some(c), hkdf32(&ss, "quo-lock"))
            }
            Some(e) => (None, e),
        };
        let next_secret = announced;
        let lid_secret = draw::<32>();
        let lid = x25519_pub(&lid_secret);
        let agr = agree(&lid_secret, &padlock).ok_or(AskError::Unsealable)?;

        self.seq += 1;
        let by = if kind == AskKind::Knock { self.inv.heir } else { ed_pub(&signer) };
        let mut payload = format!(
            "{{\"to\":\"{}\",\"by\":\"{}\",\"next\":\"{}\",\"seq\":{}",
            hex(&self.inv.heir),
            hex(&by),
            hex(&ed_pub(&next_secret)),
            self.seq
        )
        .into_bytes();
        if let Some(m) = method {
            payload.extend_from_slice(b",\"method\":");
            payload.extend_from_slice(m);
        }
        if let Some(a) = args {
            payload.extend_from_slice(b",\"args\":");
            payload.extend_from_slice(a);
        }
        payload.push(b'}');
        let mut body = payload.clone();
        body.extend_from_slice(&ed_sign(&signer, &payload));

        let mut out = lid.to_vec();
        out.extend(seal_with(&agr, "quo-seal", &lid, &self.inv.heir));
        if let Some(c) = &ct {
            out.extend_from_slice(c);
        }
        out.extend(seal_with(&edge_ikm(&agr, &edge), "quo-edge-seal", &lid, &body));

        if kind == AskKind::Knock {
            self.stage = Stage::Unsure {
                key: next_secret,
                edge,
                knock: out.clone(),
                knock_lid: lid_secret,
                knock_next: false,
            };
        }
        self.pending = Some(Pending { lid_secret, sent_edge: edge, announced: next_secret, kind, settled: false, before });
        Ok(out)
    }

    /// The last ask's bytes never left: it was not delivered, and the standing
    /// is as it was before that ask.
    pub fn unsent(&mut self) {
        if let Some(p) = self.pending.take() {
            self.stage = p.before;
        }
    }

    /// Read a reply to the last ask. None when there is no last ask.
    pub fn read(&mut self, reply: Option<&[u8]>) -> Option<Read> {
        let p = self.pending.as_mut()?;
        let (r, agr) = match reply {
            None => (Read::Nothing, None),
            Some(b) => match read_reply(&self.inv.sign_pk(), &p.lid_secret, &p.sent_edge, b) {
                Some((r, a)) => (r, Some(a)),
                None => (Read::Silence, None),
            },
        };
        if !p.settled {
            match (&r, agr) {
                (Read::Object { .. }, Some(a)) => {
                    p.settled = true;
                    self.stage = Stage::Bound { key: p.announced, edge: follow(&p.sent_edge, &a) };
                }
                (Read::Word(_), _) if p.kind == AskKind::Recovery => {
                    // A word to a recovery ask proves the heir was bound.
                    p.settled = true;
                }
                _ => {
                    if p.kind == AskKind::Recovery {
                        if let Stage::Unsure { knock_next, .. } = &mut self.stage {
                            *knock_next = true;
                        }
                    }
                    p.settled = true;
                }
            }
        }
        Some(r)
    }
}

/// Open and read a reply's box under the edge key its ask was sent under. Silence
/// sealed under the zero edge key does not open there, and reads as silence as any
/// reply that does not open. None where it reads as silence without opening;
/// Some((read, agreement)) otherwise.
pub fn read_reply(sign_pk: &[u8; 32], lid_secret: &[u8; 32], edge: &[u8; 32], bx: &[u8]) -> Option<(Read, [u8; 32])> {
    if bx.len() > SIZE || bx.len() < 32 + 16 + 65 {
        return None;
    }
    let eph = arr32(&bx[..32]);
    let agr = agree(lid_secret, &eph)?;
    let pt = open_with(&edge_ikm(&agr, edge), "quo-edge-seal", &eph, &bx[32..])?;
    if pt.len() <= 64 {
        return None;
    }
    let (text, sig) = pt.split_at(pt.len() - 64);
    let mut over = x25519_pub(lid_secret).to_vec();
    over.extend_from_slice(text);
    if !ed_verify(sign_pk, &over, sig) {
        return None;
    }
    let silence = Some((Read::Silence, agr));
    let Some(n) = json::object(text) else { return silence };
    if n.has_only(&["object", "seen"]) || n.has_only(&["object", "seen", "at"]) {
        let o = n.get("object")?;
        let s = n.get("seen")?;
        if !(s.is_null() || s.is_str()) {
            return silence;
        }
        return Some((
            Read::Object {
                object: json::minify(o.text(text)),
                seen: json::minify(s.text(text)),
                at: at_of(n.get("at"), text),
            },
            agr,
        ));
    }
    if n.has_only(&["quo"]) {
        if let Some(w) = n.get("quo").and_then(Node::as_str) {
            if matches!(w.as_str(), "removed" | "unannounced" | "repeated") {
                return Some((Read::Word(w), agr));
            }
        }
    }
    silence
}

#[cfg(test)]
mod tests {
    use super::*;

    fn door(reach: Option<Reach>) -> Door {
        Door::new(&seed_from_text("door"), reach)
    }

    fn pair(d: &mut Door, name: &str, reach: Reach) -> Standing {
        Standing::new(d.invite(name, reach, None))
    }

    fn roundtrip(d: &mut Door, s: &mut Standing, method: Option<&str>, args: Option<&str>) -> Read {
        let m = method.map(|m| json::quote(m).into_bytes());
        let b = s.ask(m.as_deref(), args.map(|a| a.as_bytes())).unwrap();
        let r = d.arrive(&b);
        s.read(Some(&r)).unwrap()
    }

    #[test]
    fn ward_key_shape() {
        let w = WardKey::from_seed(&seed_from_text("x"));
        assert_eq!(w.pk_hex().len(), 128);
    }

    #[test]
    fn box_lengths() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        let args = r#"{"k":1}"#;
        let b = s.ask(Some(b"\"m\""), Some(args.as_bytes())).unwrap();
        let payload_len = format!(
            "{{\"to\":\"{}\",\"by\":\"{}\",\"next\":\"{}\",\"seq\":1,\"method\":\"m\",\"args\":{}}}",
            "0".repeat(64), "0".repeat(64), "0".repeat(64), args
        )
        .len();
        assert_eq!(b.len(), payload_len + 1248);
        let r = d.arrive(&b);
        let text = br#"{"object":{"k":1},"seen":null}"#;
        assert_eq!(r.len(), text.len() + 112);
        assert_eq!(s.read(Some(&r)).unwrap(), Read::Object { object: r#"{"k":1}"#.into(), seen: "null".into(), at: None });
        let b2 = s.ask(Some(b"\"m\""), Some(args.as_bytes())).unwrap();
        assert_eq!(b2.len(), payload_len + 160);
    }

    #[test]
    fn a_relation_runs() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Marked);
        for i in 0..5 {
            let a = format!("{{\"i\":{i}}}");
            let r = roundtrip(&mut d, &mut s, Some("go"), Some(&a));
            assert_eq!(r, Read::Object { object: a, seen: "\"1\"".into(), at: None });
        }
        assert_eq!(roundtrip(&mut d, &mut s, None, None), Read::Object { object: r#"{"asks":[]}"#.into(), seen: "\"1\"".into(), at: None });
    }

    #[test]
    fn replays_are_repeated_and_knocks_again_are_strangers() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        let knock = s.ask(Some(b"\"m\""), None).unwrap();
        let r = d.arrive(&knock);
        assert!(matches!(s.read(Some(&r)).unwrap(), Read::Object { .. }));
        // the same knock bytes again: a stranger's; the body opens under no edge key
        let r = d.arrive(&knock);
        assert_eq!(s.read(Some(&r)).unwrap(), Read::Silence);
        assert_eq!(d.last_case, Some(Case::C1));
        let a = s.ask(Some(b"\"m\""), None).unwrap();
        let r = d.arrive(&a);
        assert!(matches!(s.read(Some(&r)).unwrap(), Read::Object { .. }));
        let r = d.arrive(&a);
        assert_eq!(s.read(Some(&r)).unwrap(), Read::Word("repeated".into()));
        assert_eq!(d.last_case, Some(Case::C11));
    }

    #[test]
    fn silence_does_not_move_the_standing_but_moves_the_door() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Silent);
        // knock (13), recovery (13), knock again as same bytes (1), recovery (13)
        let expect = [Case::C13, Case::C13, Case::C1, Case::C13, Case::C1, Case::C13];
        for c in expect {
            assert_eq!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Silence);
            assert_eq!(d.last_case, Some(c));
        }
    }

    #[test]
    fn lost_object_is_recovered() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        let k = s.ask(None, None).unwrap();
        d.arrive(&k);
        assert_eq!(s.read(None).unwrap(), Read::Nothing);
        assert!(matches!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Object { .. }));
        assert!(matches!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Object { .. }));
    }

    #[test]
    fn lost_knock_is_resent() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        let _k = s.ask(None, None).unwrap();
        assert_eq!(s.read(None).unwrap(), Read::Nothing);
        // recovery: the heir is fresh, so the box does not open
        assert_eq!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Silence);
        // then a knock again
        assert!(matches!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Object { .. }));
        assert!(matches!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Object { .. }));
    }

    #[test]
    fn release_spent_is_removed_release_fresh_is_stranger() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        assert!(matches!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Object { .. }));
        assert!(d.release("a"));
        assert!(!d.release("a"));
        assert_eq!(roundtrip(&mut d, &mut s, Some("m"), None), Read::Word("removed".into()));

        let mut f = pair(&mut d, "b", Reach::Echo);
        assert!(d.release("b"));
        assert_eq!(roundtrip(&mut d, &mut f, Some("m"), None), Read::Silence);
        assert_eq!(d.last_case, Some(Case::C1));
    }

    #[test]
    fn echo_takes_any_args() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        let deep = format!("{{\"a\":{}{}}}", "[".repeat(1000), "]".repeat(1000));
        for args in [&deep, r#"{"k":1,"k":2}"#, r#"{"v":"\ud800","n":[-0,1e400]}"#] {
            let r = roundtrip(&mut d, &mut s, Some("m"), Some(args));
            assert_eq!(r, Read::Object { object: args.to_string(), seen: "null".into(), at: None });
        }
    }

    /// An invitation whose text is `text`, signed by `d`'s ward.
    fn signed_by(d: &Door, text: &str) -> String {
        let sig = ed_sign(&d.key.sign_secret, &invitation_signed(text));
        format!("{{\"text\":{},\"sig\":\"{}\"}}", json::quote(text), hex(&sig))
    }

    /// The text of `inv` with `field` laid in before its closing brace.
    fn with_field(inv: &Invitation, field: &str) -> String {
        format!("{},{field}}}", &inv.text[..inv.text.len() - 1])
    }

    #[test]
    fn an_invitation_is_signed_by_its_ward() {
        let mut d = door(None);
        let inv = d.invite("a", Reach::Echo, None);
        let read = Invitation::from_json(inv.to_json().as_bytes()).unwrap();
        assert_eq!((read.text, read.heir), (inv.text.clone(), inv.heir));
        assert!(ed_verify(&d.key.sign_pk, &[&b"quo-invitation"[..], inv.text.as_bytes()].concat(), &inv.sig));

        let other = Door::new(&seed_from_text("other"), None);
        let sig = hex(&inv.sig);
        let five = inv.text.clone();
        for bad in [
            five.clone(),
            format!("{{\"text\":{}}}", json::quote(&five)),
            format!("{{\"text\":{},\"sig\":\"{}\"}}", json::quote(&with_field(&inv, "\"says\":1")), sig),
            signed_by(&other, &five),
            format!("{{\"text\":{},\"sig\":\"{}\"}}", json::quote(&five), hex(&ed_sign(&d.key.sign_secret, five.as_bytes()))),
            format!("{{\"text\":{},\"sig\":\"{}\"}}", json::quote(&five), sig.to_uppercase()),
            format!("{{\"text\":{},\"sig\":\"{}\",\"at\":[]}}", json::quote(&five), sig),
            format!("{{\"text\":{},\"text\":{},\"sig\":\"{}\"}}", json::quote(&five), json::quote(&five), sig),
            format!("{{\"text\":{five},\"sig\":\"{sig}\"}}"),
            signed_by(&d, &format!("{five},")),
            signed_by(&d, &format!("{{\"ward\":\"{}\",{}", d.key.pk_hex(), &five[1..])),
            signed_by(&d, &format!("[{five}]")),
            signed_by(&d, &format!("\u{feff}{five}")),
            format!("{{\"text\":{},\"sig\":\"{}\"}}", json::quote(&with_field(&inv, "\"x\":\"LONE\"")).replace("LONE", "\\ud800"), sig),
        ] {
            assert!(Invitation::from_json(bad.as_bytes()).is_none(), "{bad}");
        }
        for good in [signed_by(&d, &with_field(&inv, "\"says\":\"John\"")), signed_by(&d, &format!(" \n{five}\t "))] {
            assert!(Invitation::from_json(good.as_bytes()).is_some(), "{good}");
        }
    }

    #[test]
    fn a_lock_the_check_refuses_is_no_invitation() {
        let mut d = door(None);
        let inv = d.invite("a", Reach::Echo, None);
        let mut bad = inv.lock.clone();
        bad[0] = 0xff;
        bad[1] |= 0x0f;
        let t = inv.text.replace(&hex(&inv.lock), &hex(&bad));
        assert!(Invitation::from_json(signed_by(&d, &t).as_bytes()).is_none());
    }

    #[test]
    fn at_is_written_and_read() {
        let mut d = door(None);
        let inv = d.invite("a", Reach::Echo, Some(r#"["tcp://127.0.0.1:9","x\"y"]"#));
        let read = Invitation::from_json(inv.to_json().as_bytes()).unwrap();
        assert_eq!(read.at, vec!["tcp://127.0.0.1:9", "x\"y"]);
        assert_eq!(d.invite("e", Reach::Echo, Some("[]")).text.matches("\"at\":[]").count(), 1);
        let bare = d.invite("b", Reach::Echo, None);
        assert!(!bare.text.contains("\"at\""));
        for (at, want) in [
            ("\"tcp://h:1\"", vec![]),
            ("{}", vec![]),
            ("null", vec![]),
            ("[]", vec![]),
            ("[1, null, \"tcp://h:1\", [\"q\"], \"not a uri\"]", vec!["tcp://h:1", "not a uri"]),
        ] {
            let t = signed_by(&d, &with_field(&bare, &format!("\"at\":{at}")));
            let got = Invitation::from_json(t.as_bytes()).expect("still an invitation").at;
            assert_eq!(got, want, "{at}");
        }
    }

    #[test]
    fn the_size() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        // a knock of exactly the size, with many keys
        let base = 1248 + 250 + 20;
        let mut args = String::from("{");
        let mut i = 0;
        while args.len() + base < SIZE - 40 {
            args.push_str(&format!("\"k{i}\":{i},"));
            i += 1;
        }
        args.push_str("\"z\":\"");
        let b0 = s.ask(Some(b"\"m\""), Some(format!("{args}\"}}").as_bytes())).unwrap();
        let pad = SIZE - b0.len();
        let full = format!("{args}{}\"}}", "x".repeat(pad));
        let mut s = pair(&mut d, "b", Reach::Echo);
        let b = s.ask(Some(b"\"m\""), Some(full.as_bytes())).unwrap();
        assert_eq!(b.len(), SIZE);
        let t = std::time::Instant::now();
        let r = d.arrive(&b);
        assert!(t.elapsed().as_secs() < 5);
        // the echo carries the args back
        assert!(r.len() > SIZE - 1500 && r.len() <= SIZE, "{}", r.len());
        assert!(matches!(s.read(Some(&r)).unwrap(), Read::Object { .. }));
        assert_eq!(d.last_case, Some(Case::C12));
        let mut s = pair(&mut d, "c", Reach::Echo);
        let over = format!("{args}{}\"}}", "x".repeat(pad + 1));
        let b = s.ask(Some(b"\"m\""), Some(over.as_bytes())).unwrap();
        assert_eq!(b.len(), SIZE + 1);
        d.arrive(&b);
        assert_eq!(d.last_case, Some(Case::C1));
    }

    #[test]
    fn garbage_and_zero_head() {
        let mut d = door(None);
        for g in [vec![], vec![1u8; 10], vec![9u8; 200], vec![0u8; 200]] {
            let r = d.arrive(&g);
            assert_eq!(r.len(), SILENCE.len() + 112);
            assert_eq!(d.last_case, Some(Case::C1));
        }
    }

    /// A reply's box, sealed under `edge` to `lid` and signed by the door over `over`.
    fn reply_box(d: &Door, lid: &[u8; 32], edge: &[u8; 32], text: &[u8], over: &[u8]) -> Vec<u8> {
        let eph = draw::<32>();
        let eph_pk = x25519_pub(&eph);
        let agr = agree(&eph, lid).unwrap();
        let mut body = text.to_vec();
        body.extend_from_slice(&ed_sign(&d.key.sign_secret, over));
        let mut bx = eph_pk.to_vec();
        bx.extend(seal_with(&edge_ikm(&agr, edge), "quo-edge-seal", &eph_pk, &body));
        bx
    }

    /// A reply is signed over the lid it is sealed to and then the reply text.
    /// Signed over the text alone, or over another ask's lid, it reads as silence.
    #[test]
    fn reply_signature_covers_the_lid() {
        let d = door(None);
        let text = b"{\"object\":1,\"seen\":null}";
        let lid_secret = draw::<32>();
        let lid = x25519_pub(&lid_secret);
        let other = x25519_pub(&draw::<32>());
        for over in [text.to_vec(), [&other[..], &text[..]].concat()] {
            let bx = reply_box(&d, &lid, &ZERO, text, &over);
            assert!(read_reply(&d.key.sign_pk, &lid_secret, &ZERO, &bx).is_none());
        }
        let bx = reply_box(&d, &lid, &ZERO, text, &[&lid[..], &text[..]].concat());
        assert!(matches!(
            read_reply(&d.key.sign_pk, &lid_secret, &ZERO, &bx).unwrap().0,
            Read::Object { .. }
        ));
    }

    /// An object or a word is sealed under the edge key the ask came under. Under
    /// any other key, the zero edge key among them, it reads as silence.
    #[test]
    fn reply_body_is_sealed_under_the_edge_key() {
        let d = door(None);
        let lid_secret = draw::<32>();
        let lid = x25519_pub(&lid_secret);
        let edge = draw::<32>();
        for text in [&br#"{"object":1,"seen":null}"#[..], br#"{"quo":"repeated"}"#] {
            let over = [&lid[..], text].concat();
            let read = |sealed: &[u8; 32]| read_reply(&d.key.sign_pk, &lid_secret, &edge, &reply_box(&d, &lid, sealed, text, &over));
            assert!(!matches!(read(&edge).unwrap().0, Read::Silence));
            assert!(read(&ZERO).is_none());
        }
    }

    /// The door seals an object and a word under the key the ask came under, and
    /// silence, chosen or a stranger's, under the zero edge key.
    #[test]
    fn the_door_seals_each_reply_under_its_edge_key() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        let k = s.ask(Some(b"\"m\""), None).unwrap();
        let ls = s.pending.as_ref().unwrap().lid_secret;
        let edge = s.pending.as_ref().unwrap().sent_edge;
        let opens = |r: &[u8], e: &[u8; 32]| {
            let agr = agree(&ls, &arr32(&r[..32])).unwrap();
            open_with(&edge_ikm(&agr, e), "quo-edge-seal", &r[..32], &r[32..]).is_some()
        };
        let object = d.arrive(&k);
        assert!(opens(&object, &edge) && !opens(&object, &ZERO));
        let stranger = d.arrive(&k);
        assert!(opens(&stranger, &ZERO) && !opens(&stranger, &edge));

        let mut s = pair(&mut d, "b", Reach::Silent);
        let k = s.ask(Some(b"\"m\""), None).unwrap();
        let ls = s.pending.as_ref().unwrap().lid_secret;
        let chosen = d.arrive(&k);
        assert_eq!(d.last_case, Some(Case::C13));
        let agr = agree(&ls, &arr32(&chosen[..32])).unwrap();
        assert!(open_with(&edge_ikm(&agr, &ZERO), "quo-edge-seal", &chosen[..32], &chosen[32..]).is_some());
    }

    /// A reply's `at` is read as an invitation's is, and beside silence or a word it is a field beside the shape.
    #[test]
    fn a_reply_at_is_read() {
        let d = door(None);
        let lid_secret = draw::<32>();
        let lid = x25519_pub(&lid_secret);
        let read = |text: &str| read_reply(&d.key.sign_pk, &lid_secret, &ZERO, &d.seal_reply(Some(lid), &ZERO, text.as_bytes()).0).unwrap().0;
        let object = |o: &str, seen: &str, at: Option<Vec<&str>>| Read::Object {
            object: o.into(),
            seen: seen.into(),
            at: at.map(|a| a.into_iter().map(String::from).collect()),
        };
        for (text, want) in [
            (r#"{"object":{"k":1},"seen":"s2","at":["tcp://127.0.0.1:9","ws://h/q"]}"#, object(r#"{"k":1}"#, "\"s2\"", Some(vec!["tcp://127.0.0.1:9", "ws://h/q"]))),
            (r#"{"at":[5,"no scheme",null,["q"]],"object":[],"seen":null}"#, object("[]", "null", Some(vec!["no scheme"]))),
            (r#"{"object":2,"seen":null,"at":"tcp://h:1"}"#, object("2", "null", None)),
            (r#"{"object":3,"seen":null,"at":null}"#, object("3", "null", None)),
            (r#"{"object":1,"seen":null,"at":[],"at":[]}"#, Read::Silence),
            (r#"{"object":1,"at":[]}"#, Read::Silence),
            (r#"{"silence":true,"at":[]}"#, Read::Silence),
            (r#"{"quo":"repeated","at":[]}"#, Read::Silence),
        ] {
            assert_eq!(read(text), want, "{text}");
        }
        assert_eq!(
            object("1", "null", Some(vec!["tcp://h:1", "x\"y"])).to_json(),
            r#"{"object":1,"seen":null,"at":["tcp://h:1","x\"y"]}"#
        );
        assert_eq!(object("1", "null", None).to_json(), r#"{"object":1,"seen":null}"#);

        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Moved);
        let at = Some(vec!["tcp://127.0.0.1:9".to_string()]);
        assert_eq!(roundtrip(&mut d, &mut s, None, None), Read::Object { object: r#"{"asks":[]}"#.into(), seen: "null".into(), at: at.clone() });
        assert_eq!(roundtrip(&mut d, &mut s, Some("m"), Some(r#"{"k":1}"#)), Read::Object { object: r#"{"k":1}"#.into(), seen: "null".into(), at });
    }

    fn zero_ask(padlock: &[u8; 32], signer: &[u8; 32], payload: &[u8]) -> (Vec<u8>, [u8; 32]) {
        let lid_secret = draw::<32>();
        let lid = x25519_pub(&lid_secret);
        let agr = agree(&lid_secret, padlock).unwrap();
        let mut body = payload.to_vec();
        body.extend_from_slice(&ed_sign(signer, payload));
        let mut out = lid.to_vec();
        out.extend(seal_with(&agr, "quo-seal", &lid, &[0u8; 32]));
        out.extend(seal_with(&edge_ikm(&agr, &[0u8; 32]), "quo-edge-seal", &lid, &body));
        (out, lid_secret)
    }

    #[test]
    fn zero_head() {
        let sk = [5u8; 32];
        let payload = format!("{{\"to\":null,\"by\":\"{}\",\"next\":null,\"seq\":1,\"method\":\"x\",\"args\":{{\"q\":2}}}}", hex(&ed_pub(&sk)));
        let mut d = door(None);
        let (b, _) = zero_ask(&d.key.padlock, &sk, payload.as_bytes());
        d.arrive(&b);
        assert_eq!(d.last_case, Some(Case::C4));

        let mut d = door(Some(Reach::Echo));
        let (b, ls) = zero_ask(&d.key.padlock, &sk, payload.as_bytes());
        let r = d.arrive(&b);
        assert_eq!(read_reply(&d.key.sign_pk, &ls, &ZERO, &r).unwrap().0, Read::Object { object: "{\"q\":2}".into(), seen: "null".into(), at: None });
        let r = d.arrive(&b);
        assert!(matches!(read_reply(&d.key.sign_pk, &ls, &ZERO, &r).unwrap().0, Read::Object { .. }));

        let (b, _) = zero_ask(&d.key.padlock, &[6u8; 32], payload.as_bytes());
        d.arrive(&b);
        assert_eq!(d.last_case, Some(Case::C5));

        let bad = payload.replace("\"to\":null", "\"to\":\"11\"");
        let (b, _) = zero_ask(&d.key.padlock, &sk, bad.as_bytes());
        d.arrive(&b);
        assert_eq!(d.last_case, Some(Case::C3));

        let dup = payload.replace("\"seq\":1", "\"seq\":1,\"seq\":2");
        let (b, _) = zero_ask(&d.key.padlock, &sk, dup.as_bytes());
        d.arrive(&b);
        assert_eq!(d.last_case, Some(Case::C2));

        for (from, to) in [("\"seq\":1", " \"seq\" : 1 ")] {
            let p = payload.replace(from, to);
            let (b, _) = zero_ask(&d.key.padlock, &sk, p.as_bytes());
            d.arrive(&b);
            assert_eq!(d.last_case, Some(Case::C12), "{p}");
        }
        for (from, to) in [("\"seq\":1", "\"seq\":0"), ("\"seq\":1", "\"seq\":1.5"), ("\"seq\":1", "\"seq\":1.0"),
            ("\"seq\":1", "\"seq\":1e0"),("\"seq\":1", "\"seq\":true"),
            ("\"next\":null", "\"next\":\"00\""), ("\"method\":\"x\"", "\"method\":null"), ("\"args\":{\"q\":2}", "\"args\":[]"),
            ("\"next\":null,", "")] {
            let p = payload.replace(from, to);
            let (b, _) = zero_ask(&d.key.padlock, &sk, p.as_bytes());
            d.arrive(&b);
            assert_eq!(d.last_case, Some(Case::C3), "{p}");
        }
    }

    #[test]
    fn unannounced_knock() {
        let mut d = door(None);
        let inv = d.invite("a", Reach::Echo, None);
        let (ct, ss) = encapsulate(&inv.lock).unwrap();
        let e = hkdf32(&ss, "quo-lock");
        let payload = format!("{{\"to\":\"{h}\",\"by\":\"{h}\",\"next\":\"{h}\",\"seq\":7}}", h = hex(&inv.heir));
        let ls = draw::<32>();
        let lid = x25519_pub(&ls);
        let agr = agree(&ls, &inv.padlock()).unwrap();
        let mut body = payload.as_bytes().to_vec();
        body.extend_from_slice(&ed_sign(&inv.secret, payload.as_bytes()));
        let mut b = lid.to_vec();
        b.extend(seal_with(&agr, "quo-seal", &lid, &inv.heir));
        b.extend(ct);
        b.extend(seal_with(&edge_ikm(&agr, &e), "quo-edge-seal", &lid, &body));
        let r = d.arrive(&b);
        assert_eq!(read_reply(&inv.sign_pk(), &ls, &e, &r).unwrap().0, Read::Word("unannounced".into()));
        // the heir is still fresh: a real knock binds
        let mut s = Standing::new(inv);
        assert!(matches!(roundtrip(&mut d, &mut s, None, None), Read::Object { .. }));
    }

    #[test]
    fn signature_edges() {
        let sk = [3u8; 32];
        let pk = ed_pub(&sk);
        let sig = ed_sign(&sk, b"m");
        assert!(ed_verify(&pk, b"m", &sig));
        assert!(!ed_verify(&pk, b"n", &sig));
        assert!(!ed_verify(&pk, b"m", &sig[..63]));
        // identity key (small order), and identity with sign bit set
        let mut id = [0u8; 32];
        id[0] = 1;
        assert!(!ed_verify(&id, b"m", &sig));
        id[31] |= 0x80;
        assert!(!ed_verify(&id, b"m", &sig));
        // non-canonical y
        let mut nc = [0xffu8; 32];
        nc[0] = 0xee;
        nc[31] = 0x7f;
        assert!(!ed_verify(&nc, b"m", &sig));
        // s >= L
        let mut bad = sig;
        bad[63] |= 0xf0;
        assert!(!ed_verify(&pk, b"m", &bad));
    }
}
