//! The door and the standing of Quo.

use crate::crypto::*;
use crate::json::{self, Node};
use std::collections::HashMap;

pub const SIZE: usize = 1_048_576;
pub const SILENCE: &[u8] = br#"{"silence":true}"#;
const ZERO: [u8; 32] = [0u8; 32];

/// What answers behind a door.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Reach {
    Echo,
    Marked,
    Null,
    Silent,
}

impl Reach {
    pub fn named(s: &str) -> Option<Reach> {
        match s {
            "echo" => Some(Reach::Echo),
            "marked" => Some(Reach::Marked),
            "null" => Some(Reach::Null),
            "silent" => Some(Reach::Silent),
            _ => None,
        }
    }

    /// The reply text chosen, or None for silence.
    fn answer(&self, named: bool, args: Option<(&Node, &[u8])>) -> Option<Vec<u8>> {
        let (object, seen): (Vec<u8>, &str) = match self {
            Reach::Silent => return None,
            Reach::Null => (b"null".to_vec(), "null"),
            Reach::Echo | Reach::Marked => {
                if !named {
                    (b"{}".to_vec(), "null")
                } else {
                    let obj = match args {
                        Some((n, src)) => {
                            // This kit echoes args nesting sixty-four deep at most,
                            // with no key repeated in any object.
                            if n.depth > 64 || !json::keys_unique_throughout(n.text(src)) {
                                return None;
                            }
                            n.text(src).to_vec()
                        }
                        None => b"{}".to_vec(),
                    };
                    (obj, if *self == Reach::Marked { "\"1\"" } else { "null" })
                }
            }
        };
        let mut t = b"{\"object\":".to_vec();
        t.extend_from_slice(&object);
        t.extend_from_slice(b",\"seen\":");
        t.extend_from_slice(seen.as_bytes());
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
    ZeroAnswered,
}

enum Verdict {
    Silence(Case),
    Word(&'static str, Case),
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
}

impl Invitation {
    pub fn to_json(&self) -> String {
        let at = if self.at.is_empty() {
            String::new()
        } else {
            let a: Vec<String> = self.at.iter().map(|s| json::quote(s)).collect();
            format!(",\"at\":[{}]", a.join(","))
        };
        format!(
            "{{\"ward\":\"{}\",\"heir\":\"{}\",\"secret\":\"{}\",\"lock\":\"{}\"{at}}}",
            hex(&self.ward),
            hex(&self.heir),
            hex(&self.secret),
            hex(&self.lock)
        )
    }

    /// Read an invitation from a JSON text. Fields beside the five are ignored.
    /// An `at` that is not an array is absent, and an element that is not a string is skipped.
    pub fn from_text(t: &[u8]) -> Option<Invitation> {
        let n = json::object(t)?;
        let f = |k: &str, len: usize| -> Option<Vec<u8>> { unhex(&n.get(k)?.as_str()?, Some(len)) };
        let ward = f("ward", 64)?;
        let heir = f("heir", 32)?;
        let secret = f("secret", 32)?;
        let lock = f("lock", LOCK_EK_LEN).filter(|l| ek_valid(l))?;
        let mut w = [0u8; 64];
        w.copy_from_slice(&ward);
        let at = n
            .get("at")
            .and_then(|a| json::elements(a.text(t)))
            .map(|es| es.iter().filter_map(|e| e.as_str()).collect())
            .unwrap_or_default();
        Some(Invitation { ward: w, heir: arr32(&heir), secret: arr32(&secret), lock, at })
    }

    pub fn sign_pk(&self) -> [u8; 32] {
        arr32(&self.ward[..32])
    }
    pub fn padlock(&self) -> [u8; 32] {
        arr32(&self.ward[32..])
    }
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

    /// Make a heir under `name` and give its invitation. The ward keeps the heir pk
    /// and not the secret. `at` is written in the invitation as given.
    pub fn invite(&mut self, name: &str, reach: Reach, at: Vec<String>) -> Invitation {
        let secret = draw::<32>();
        let pk = ed_pub(&secret);
        self.heirs.insert(pk, Heir { state: HeirState::Fresh, reach });
        self.names.insert(name.to_string(), pk);
        Invitation { ward: self.key.pk_bytes(), heir: pk, secret, lock: self.lock.ek.clone(), at }
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

    fn seal_reply(&self, lid: Option<[u8; 32]>, text: &[u8]) -> (Vec<u8>, [u8; 32]) {
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
        loop {
            let eph = draw::<32>();
            let eph_pk = x25519_pub(&eph);
            let Some(agr) = agree(&eph, &lid) else { continue };
            let mut over = lid.to_vec();
            over.extend_from_slice(text);
            let mut body = text.to_vec();
            body.extend_from_slice(&ed_sign(&self.key.sign_secret, &over));
            let mut out = eph_pk.to_vec();
            out.extend(seal_with(&agr, "quo-seal", &eph_pk, &body));
            return (out, agr);
        }
    }

    /// An ask's box in, a reply's box out. This door always answers.
    pub fn arrive(&mut self, bx: &[u8]) -> Vec<u8> {
        let lid = if bx.len() >= 32 { Some(arr32(&bx[..32])) } else { None };
        match self.judge(bx) {
            Verdict::Silence(c) => {
                self.last_case = Some(c);
                self.seal_reply(lid, SILENCE).0
            }
            Verdict::Word(w, c) => {
                self.last_case = Some(c);
                let t = format!("{{\"quo\":\"{w}\"}}");
                self.seal_reply(lid, t.as_bytes()).0
            }
            Verdict::Choice { text, mv } => {
                self.last_case = Some(match (&mv, &text) {
                    (None, _) => Case::ZeroAnswered,
                    (_, Some(_)) => Case::C12,
                    (_, None) => Case::C13,
                });
                let t = text.as_deref().unwrap_or(SILENCE);
                let (out, agr) = self.seal_reply(lid, t);
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
            Some(a) if a.is_obj() => Some((a, payload)),
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
            return Verdict::Word("removed", Case::C9);
        }
        let announced = next.filter(|k| *k != head && *k != by);
        match &via {
            Via::Fresh => {
                // Case 10.
                if announced.is_none() {
                    return Verdict::Word("unannounced", Case::C10);
                }
            }
            Via::Spent(k) => {
                // Case 11: this door honours only numbers above the highest.
                if seq <= k.highest {
                    return Verdict::Word("repeated", Case::C11);
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
    Object { object: String, seen: String },
    Silence,
    Word(String),
    Nothing,
}

impl Read {
    pub fn to_json(&self) -> String {
        match self {
            Read::Object { object, seen } => format!("{{\"object\":{object},\"seen\":{seen}}}"),
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
        Standing { inv, stage: Stage::New, seq: 0, pending: None }
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
            Some(b) => match read_reply(&self.inv.sign_pk(), &p.lid_secret, b) {
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

/// Open and read a reply's box. None where it reads as silence without opening;
/// Some((read, agreement)) otherwise.
pub fn read_reply(sign_pk: &[u8; 32], lid_secret: &[u8; 32], bx: &[u8]) -> Option<(Read, [u8; 32])> {
    if bx.len() > SIZE || bx.len() < 32 + 16 + 65 {
        return None;
    }
    let eph = arr32(&bx[..32]);
    let agr = agree(lid_secret, &eph)?;
    let pt = open_with(&agr, "quo-seal", &eph, &bx[32..])?;
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
    if n.has_only(&["object", "seen"]) {
        let o = n.get("object")?;
        let s = n.get("seen")?;
        if !(s.is_null() || s.is_str()) {
            return silence;
        }
        return Some((
            Read::Object { object: json::minify(o.text(text)), seen: json::minify(s.text(text)) },
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
        Standing::new(d.invite(name, reach, vec![]))
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
        assert_eq!(seed_from_bytes(&[7u8; 32]), [7u8; 32]);
        assert_eq!(seed_from_bytes(b"abc"), sha256(b"abc"));
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
        assert_eq!(s.read(Some(&r)).unwrap(), Read::Object { object: r#"{"k":1}"#.into(), seen: "null".into() });
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
            assert_eq!(r, Read::Object { object: a, seen: "\"1\"".into() });
        }
        assert_eq!(roundtrip(&mut d, &mut s, None, None), Read::Object { object: "{}".into(), seen: "null".into() });
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
    fn echo_depth() {
        let mut d = door(None);
        let mut s = pair(&mut d, "a", Reach::Echo);
        let deep65 = format!("{{\"a\":{}{}}}", "[".repeat(64), "]".repeat(64));
        assert_eq!(roundtrip(&mut d, &mut s, Some("m"), Some(&deep65)), Read::Silence);
        assert_eq!(d.last_case, Some(Case::C13));
        let deep64 = format!("{{\"a\":{}{}}}", "[".repeat(63), "]".repeat(63));
        assert!(matches!(roundtrip(&mut d, &mut s, Some("m"), Some(&deep64)), Read::Object { .. }));
        let deep1000 = format!("{{\"a\":{}{}}}", "[".repeat(1000), "]".repeat(1000));
        assert_eq!(roundtrip(&mut d, &mut s, Some("m"), Some(&deep1000)), Read::Silence);
        assert_eq!(d.last_case, Some(Case::C13));
        assert_eq!(roundtrip(&mut d, &mut s, Some("m"), Some(r#"{"k":1,"k":2}"#)), Read::Silence);
        assert_eq!(d.last_case, Some(Case::C13));
        let odd = r#"{"v":"\ud800","n":[-0,1e400]}"#;
        assert_eq!(roundtrip(&mut d, &mut s, Some("m"), Some(odd)), Read::Object { object: odd.into(), seen: "null".into() });
    }

    #[test]
    fn a_lock_the_check_refuses_is_no_invitation() {
        let mut d = door(None);
        let inv = d.invite("a", Reach::Echo, vec![]);
        assert!(Invitation::from_text(inv.to_json().as_bytes()).is_some());
        let mut bad = inv.lock.clone();
        bad[0] = 0xff;
        bad[1] |= 0x0f;
        let t = Invitation { lock: bad, ..inv }.to_json();
        assert!(Invitation::from_text(t.as_bytes()).is_none());
    }

    #[test]
    fn at_is_written_and_read() {
        let mut d = door(None);
        let inv = d.invite("a", Reach::Echo, vec!["tcp://127.0.0.1:9".into(), "x\"y".into()]);
        let read = Invitation::from_text(inv.to_json().as_bytes()).unwrap();
        assert_eq!(read.at, inv.at);
        assert!(!d.invite("b", Reach::Echo, vec![]).to_json().contains("\"at\""));
        let base = inv.to_json();
        let with = |at: &str| format!("{},\"at\":{at}}}", &base[..base.find(",\"at\"").unwrap()]);
        for (at, want) in [
            ("\"tcp://h:1\"", vec![]),
            ("{}", vec![]),
            ("null", vec![]),
            ("[]", vec![]),
            ("[1, null, \"tcp://h:1\", [\"q\"], \"not a uri\"]", vec!["tcp://h:1", "not a uri"]),
        ] {
            let got = Invitation::from_text(with(at).as_bytes()).expect("still an invitation").at;
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
            let eph = draw::<32>();
            let eph_pk = x25519_pub(&eph);
            let agr = agree(&eph, &lid).unwrap();
            let mut body = text.to_vec();
            body.extend_from_slice(&ed_sign(&d.key.sign_secret, &over));
            let mut bx = eph_pk.to_vec();
            bx.extend(seal_with(&agr, "quo-seal", &eph_pk, &body));
            assert!(read_reply(&d.key.sign_pk, &lid_secret, &bx).is_none());
        }
        let mut bx = Vec::new();
        {
            let eph = draw::<32>();
            let eph_pk = x25519_pub(&eph);
            let agr = agree(&eph, &lid).unwrap();
            let mut body = text.to_vec();
            body.extend_from_slice(&ed_sign(&d.key.sign_secret, &[&lid[..], &text[..]].concat()));
            bx.extend_from_slice(&eph_pk);
            bx.extend(seal_with(&agr, "quo-seal", &eph_pk, &body));
        }
        assert!(matches!(
            read_reply(&d.key.sign_pk, &lid_secret, &bx).unwrap().0,
            Read::Object { .. }
        ));
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
        assert_eq!(read_reply(&d.key.sign_pk, &ls, &r).unwrap().0, Read::Object { object: "{\"q\":2}".into(), seen: "null".into() });
        let r = d.arrive(&b);
        assert!(matches!(read_reply(&d.key.sign_pk, &ls, &r).unwrap().0, Read::Object { .. }));

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
            assert_eq!(d.last_case, Some(Case::ZeroAnswered), "{p}");
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
        let inv = d.invite("a", Reach::Echo, vec![]);
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
        assert_eq!(read_reply(&inv.sign_pk(), &ls, &r).unwrap().0, Read::Word("unannounced".into()));
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
