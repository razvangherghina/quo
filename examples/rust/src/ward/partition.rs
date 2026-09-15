// SPDX-License-Identifier: Apache-2.0
//! The partition: everything durable a ward has, every secret included.

use super::Cells;
use crate::value::{Map, Number, Value, ValueError};
use std::collections::BTreeMap;

/// How many removed heirs the door remembers, oldest out.
pub const GONE_BOUND: usize = 256;
/// The span of numbers under the mark a door remembers.
pub const SPAN: u64 = 64;

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Partition {
    pub(crate) beings: BTreeMap<String, Cells>,
    /// The class each being was booted under, which is the ward's record of
    /// her and never a cell of hers.
    pub(crate) classes: BTreeMap<String, String>,
    pub(crate) bind: BTreeMap<String, Bind>,
    pub(crate) heirs: BTreeMap<String, Heir>,
    /// Oldest first.
    pub(crate) gone: Vec<(String, Gone)>,
    pub(crate) public: Option<String>,
    /// The lock, the ward's ML-KEM-768 key pair, as the sixty-four bytes it
    /// was drawn as, `d || z`, in hex. None until the first invite that names
    /// a heir.
    pub(crate) lock: Option<String>,
}

/// One being's keys, outside her cells.
#[derive(Clone, Debug, Default, PartialEq)]
pub(crate) struct Bind {
    pub(crate) standings: BTreeMap<String, StandingKeys>,
    /// id -> heir pk.
    pub(crate) occupants: BTreeMap<String, String>,
    /// `<ward>:<heir>` or `public:<ward>`, oldest first.
    pub(crate) knocks: Vec<(String, KnockKeys)>,
}

/// Her keys for a standing: secrets, as hex.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct StandingKeys {
    pub(crate) ward: String,
    pub(crate) heir: Option<String>,
    pub(crate) by: String,
    pub(crate) next: Option<String>,
    pub(crate) seq: u64,
    /// The edge key her next ask is sealed under, zero on `{ ward }` alone.
    pub(crate) edge: String,
}

/// Her keys for a knock before take: her own key, whether an object answered
/// a knock under it, whether a knock was ever sent, the count, and the edge
/// key, zero until an object answers.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct KnockKeys {
    pub(crate) by: String,
    pub(crate) spoke: bool,
    pub(crate) sent: bool,
    pub(crate) seq: u64,
    pub(crate) edge: String,
    /// The `m` her knock encapsulated under, hex, or empty before the first
    /// knock: a knock again as the heir reuses it, so the edge key is one
    /// whichever knock the door heard.
    pub(crate) m: String,
}

/// The door's view of one occupant.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Heir {
    pub(crate) being: String,
    pub(crate) id: String,
    pub(crate) held: String,
    pub(crate) vouched: Option<String>,
    pub(crate) fresh: bool,
    pub(crate) mark: u64,
    pub(crate) spent: Vec<u64>,
    /// The edge key that last opened an honoured ask, zero until the knock.
    pub(crate) open: String,
    /// The edge key derived from the reply to the last choice.
    pub(crate) offered: Option<String>,
}

/// The keys held for a heir when its id was removed, edge keys included.
#[derive(Clone, Debug, PartialEq)]
pub(crate) struct Gone {
    pub(crate) held: String,
    pub(crate) vouched: Option<String>,
    pub(crate) open: String,
    pub(crate) offered: Option<String>,
}

// ---- reading a partition back ----------------------------------------------
//
// The mirror of `to_value`: what a harbor kept as values becomes the
// partition again. A value of another shape is `NotObject`.

fn map_of(v: &Value) -> Result<&Map, ValueError> {
    v.as_object().ok_or(ValueError::NotObject)
}

fn text_of(v: &Value) -> Result<String, ValueError> {
    v.as_str().map(str::to_owned).ok_or(ValueError::NotObject)
}

fn text_or_none(v: Option<&Value>) -> Result<Option<String>, ValueError> {
    match v {
        None | Some(Value::Null) => Ok(None),
        Some(v) => text_of(v).map(Some),
    }
}

fn field<'a>(m: &'a Map, name: &str) -> Result<&'a Value, ValueError> {
    m.get(name).ok_or(ValueError::NotObject)
}

fn count_of(v: &Value) -> Result<u64, ValueError> {
    v.as_number().and_then(|n| n.as_u64()).ok_or(ValueError::NotObject)
}

fn each<T>(v: Option<&Value>, mut read: impl FnMut(&Value) -> Result<T, ValueError>) -> Result<BTreeMap<String, T>, ValueError> {
    match v {
        None => Ok(BTreeMap::new()),
        Some(v) => map_of(v)?.iter().map(|(k, v)| Ok((k.to_owned(), read(v)?))).collect(),
    }
}

fn each_in_order<T>(v: Option<&Value>, mut read: impl FnMut(&Value) -> Result<T, ValueError>) -> Result<Vec<(String, T)>, ValueError> {
    match v {
        None => Ok(Vec::new()),
        Some(v) => map_of(v)?.iter().map(|(k, v)| Ok((k.to_owned(), read(v)?))).collect(),
    }
}

impl Partition {
    /// The partition as a harbor kept it, back from its values: the mirror
    /// of [`Partition::to_value`].
    pub fn from_value(value: &Value) -> Result<Partition, ValueError> {
        let root = map_of(value)?;
        Ok(Partition {
            beings: each(root.get("beings"), |v| Cells::from_value(v.clone()))?,
            classes: each(root.get("classes"), text_of)?,
            bind: each(root.get("bind"), Bind::from_value)?,
            heirs: each(root.get("heirs"), Heir::from_value)?,
            gone: each_in_order(root.get("gone"), Gone::from_value)?,
            public: text_or_none(root.get("public"))?,
            lock: text_or_none(root.get("lock"))?,
        })
    }

    /// Whether a being of this key was booted.
    pub fn has_being(&self, key: &str) -> bool {
        self.beings.contains_key(key)
    }

    /// A being's cells, read.
    pub fn cells(&self, key: &str) -> Option<&Cells> {
        self.beings.get(key)
    }

    /// Forgets an occupant record of a being outside any ask, which is a
    /// harbor's fault and not a being's remove: the heir it named stays held
    /// by the door. Whether there was one to forget.
    pub fn forget(&mut self, being: &str, id: &str) -> bool {
        if self.bind.get_mut(being).and_then(|b| b.occupants.remove(id)).is_none() {
            return false;
        }
        if let Some(cells) = self.beings.get_mut(being) {
            cells.remove_occupant(id);
        }
        true
    }
}

impl Bind {
    fn from_value(v: &Value) -> Result<Bind, ValueError> {
        let o = map_of(v)?;
        Ok(Bind { standings: each(o.get("standings"), StandingKeys::from_value)?, occupants: each(o.get("occupants"), text_of)?, knocks: each_in_order(o.get("knocks"), KnockKeys::from_value)? })
    }
}

impl StandingKeys {
    fn from_value(v: &Value) -> Result<StandingKeys, ValueError> {
        let o = map_of(v)?;
        Ok(StandingKeys {
            ward: text_of(field(o, "ward")?)?,
            heir: text_or_none(o.get("heir"))?,
            by: text_of(field(o, "by")?)?,
            next: text_or_none(o.get("next"))?,
            seq: count_of(field(o, "seq")?)?,
            edge: text_of(field(o, "edge")?)?,
        })
    }
}

impl KnockKeys {
    fn from_value(v: &Value) -> Result<KnockKeys, ValueError> {
        let o = map_of(v)?;
        Ok(KnockKeys {
            by: text_of(field(o, "by")?)?,
            spoke: field(o, "spoke")?.as_bool().ok_or(ValueError::NotObject)?,
            sent: field(o, "sent")?.as_bool().ok_or(ValueError::NotObject)?,
            seq: count_of(field(o, "seq")?)?,
            edge: text_of(field(o, "edge")?)?,
            m: text_of(field(o, "m")?)?,
        })
    }
}

impl Heir {
    fn from_value(v: &Value) -> Result<Heir, ValueError> {
        let o = map_of(v)?;
        let spent = match field(o, "spent")? {
            Value::Array(items) => items.iter().map(count_of).collect::<Result<Vec<_>, _>>()?,
            _ => return Err(ValueError::NotObject),
        };
        Ok(Heir {
            being: text_of(field(o, "being")?)?,
            id: text_of(field(o, "id")?)?,
            held: text_of(field(o, "held")?)?,
            vouched: text_or_none(o.get("vouched"))?,
            fresh: field(o, "fresh")?.as_bool().ok_or(ValueError::NotObject)?,
            mark: count_of(field(o, "mark")?)?,
            spent,
            open: text_of(field(o, "open")?)?,
            offered: text_or_none(o.get("offered"))?,
        })
    }
}

impl Gone {
    fn from_value(v: &Value) -> Result<Gone, ValueError> {
        let o = map_of(v)?;
        Ok(Gone { held: text_of(field(o, "held")?)?, vouched: text_or_none(o.get("vouched"))?, open: text_of(field(o, "open")?)?, offered: text_or_none(o.get("offered"))? })
    }
}

fn whole(n: u64) -> Value {
    Value::Number(Number::from_u64(n).expect("a count within the doubles"))
}

fn object<'a, I: IntoIterator<Item = (&'a String, Value)>>(entries: I) -> Value {
    Value::Object(entries.into_iter().map(|(k, v)| (k.clone(), v)).collect::<Map>())
}

impl Partition {
    /// The partition as the values a harbor keeps.
    pub fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("beings", object(self.beings.iter().map(|(k, c)| (k, c.to_value()))));
        map.insert("classes", object(self.classes.iter().map(|(k, c)| (k, Value::from(c.as_str())))));
        map.insert("bind", object(self.bind.iter().map(|(k, b)| (k, b.to_value()))));
        map.insert("heirs", object(self.heirs.iter().map(|(k, h)| (k, h.to_value()))));
        map.insert("gone", object(self.gone.iter().map(|(k, g)| (k, g.to_value()))));
        map.insert("public", self.public.clone());
        map.insert("lock", self.lock.clone());
        Value::Object(map)
    }

    /// Forgets a heir. One that spoke leaves its keys in `gone`, bounded,
    /// oldest out; one removed before it spoke leaves nothing, since the door
    /// never bound it and its secret is in an invitation anyone may hold.
    pub fn bury(&mut self, heir: &str) {
        if let Some(h) = self.heirs.remove(heir).filter(|h| !h.fresh) {
            self.gone.retain(|(k, _)| k != heir);
            self.gone.push((heir.to_owned(), Gone { held: h.held, vouched: h.vouched, open: h.open, offered: h.offered }));
            if self.gone.len() > GONE_BOUND {
                self.gone.remove(0);
            }
        }
    }

    pub(crate) fn gone(&self, heir: &str) -> Option<&Gone> {
        self.gone.iter().find(|(k, _)| k == heir).map(|(_, g)| g)
    }
}

impl Bind {
    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("standings", object(self.standings.iter().map(|(k, s)| (k, s.to_value()))));
        map.insert("occupants", object(self.occupants.iter().map(|(k, h)| (k, Value::from(h.as_str())))));
        map.insert("knocks", object(self.knocks.iter().map(|(k, r)| (k, r.to_value()))));
        Value::Object(map)
    }

    pub fn knock(&self, key: &str) -> Option<&KnockKeys> {
        self.knocks.iter().find(|(k, _)| k == key).map(|(_, r)| r)
    }

    pub fn knock_mut(&mut self, key: &str) -> Option<&mut KnockKeys> {
        self.knocks.iter_mut().find(|(k, _)| k == key).map(|(_, r)| r)
    }

    /// Files a knock record. It holds her own key, which the lost knock is
    /// recovered by, so it stands until take consumes it.
    pub fn file_knock(&mut self, key: &str, record: KnockKeys) {
        self.knocks.push((key.to_owned(), record));
    }

    pub fn end_knock(&mut self, key: &str) -> Option<KnockKeys> {
        let at = self.knocks.iter().position(|(k, _)| k == key)?;
        Some(self.knocks.remove(at).1)
    }
}

impl StandingKeys {
    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("ward", self.ward.as_str());
        map.insert("heir", self.heir.clone());
        map.insert("by", self.by.as_str());
        map.insert("next", self.next.clone());
        map.insert("seq", whole(self.seq));
        map.insert("edge", self.edge.as_str());
        Value::Object(map)
    }
}

impl KnockKeys {
    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("by", self.by.as_str());
        map.insert("spoke", self.spoke);
        map.insert("sent", self.sent);
        map.insert("seq", whole(self.seq));
        map.insert("edge", self.edge.as_str());
        map.insert("m", self.m.as_str());
        Value::Object(map)
    }
}

impl Heir {
    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("being", self.being.as_str());
        map.insert("id", self.id.as_str());
        map.insert("held", self.held.as_str());
        map.insert("vouched", self.vouched.clone());
        map.insert("fresh", self.fresh);
        map.insert("mark", whole(self.mark));
        map.insert("spent", Value::Array(self.spent.iter().map(|n| whole(*n)).collect()));
        map.insert("open", self.open.as_str());
        map.insert("offered", self.offered.clone());
        Value::Object(map)
    }

    /// The edge keys an ask on this spent heir is tried under, in order:
    /// open, then offered when one is held. A fresh heir is tried under its
    /// knock's ciphertext and holds none.
    pub fn edges(&self) -> Vec<String> {
        match self.fresh {
            true => vec![],
            false => std::iter::once(self.open.clone()).chain(self.offered.clone()).collect(),
        }
    }

    /// Whether the count honours `seq`: above the mark, or under it inside
    /// the span and not yet spent.
    pub fn honours(&self, seq: u64) -> bool {
        if seq > self.mark {
            return true;
        }
        seq < self.mark && seq + SPAN > self.mark && !self.spent.contains(&seq)
    }

    /// Spends `seq`, which [`Heir::honours`].
    pub fn spend(&mut self, seq: u64) {
        if seq > self.mark {
            if self.mark > 0 {
                self.spent.push(self.mark);
            }
            self.mark = seq;
        } else {
            self.spent.push(seq);
        }
        let mark = self.mark;
        self.spent.retain(|n| n + SPAN > mark);
        self.spent.sort_unstable();
    }
}

impl Gone {
    /// The edge keys kept when the heir was removed, open then offered.
    pub fn edges(&self) -> Vec<String> {
        std::iter::once(self.open.clone()).chain(self.offered.clone()).collect()
    }

    fn to_value(&self) -> Value {
        let mut map = Map::new();
        map.insert("held", self.held.as_str());
        map.insert("vouched", self.vouched.clone());
        map.insert("open", self.open.as_str());
        map.insert("offered", self.offered.clone());
        Value::Object(map)
    }
}
