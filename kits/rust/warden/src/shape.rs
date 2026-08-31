//! The blueprint every warden holds, and the records it is written in.
//!
//! Constitution, Article IX. It is the one blueprint nobody authors, so its
//! text is a constant here rather than something a ground supplies, and its
//! digest is the same on every ground in the world.
//!
//! Every record below is written to the wire by the blueprint's own rules —
//! there is no second encoder in the kit — so this module is the one place
//! that says which Rust shape stands for which record.

use std::sync::OnceLock;

use quo_notation::{Blueprint, Field, Type};
use quo_wire::{decode, encode, Value};

use crate::{refuse, Judged, Refused, KEY};

/// The blueprint every warden holds, in the notation, exactly as Article IX
/// writes it.
pub const WARDEN_BLUEPRINT: &str = "Warden\n  describe() estate\n  sketch(being being) sketch?\n  blueprint(digest b32) text?\n  limit() int\n  tell(word word)\n  moved(being being) word?\n  receive(cargo cargo) b32\n\nestate\n  classes [class]\n\nclass\n  digest b32\n  beings [held]\n\nheld\n  being being\n  commitment b32\n\nsketch\n  being being\n  digest b32\n  commitment b32\n\nword\n  being being?\n  successor b32?\n  commitment b32?\n  name b32?\n  padlock b32?\n  hints [text]\n\ncargo\n  being being\n  digest b32\n  cells bytes\n  standings [standing]\n  relations [relation]\n\nstanding\n  voice b32\n  commitment b32\n  name b32\n  beings [being]\n  mark int\n  spent [int]\n  padlock b32?\n  hints [text]\n\nrelation\n  warden being\n  commitment b32\n  padlock b32\n  voice b32\n  secret b32\n  heir b32\n  heirSecret b32\n  seq int\n  news int\n  hints [text]\n";

/// The parsed blueprint, and its digest, which is the same everywhere.
pub fn warden_blueprint() -> &'static Blueprint {
    static PARSED: OnceLock<Blueprint> = OnceLock::new();
    PARSED.get_or_init(|| {
        quo_notation::parse(WARDEN_BLUEPRINT).expect("the blueprint Article IX writes")
    })
}

/// The digest of the blueprint every warden holds.
pub fn warden_digest() -> [u8; KEY] {
    warden_blueprint().digest()
}

/// One of the warden's own fields, by the name Article IX gives it.
pub fn field(name: &str) -> Judged<&'static Field> {
    match warden_blueprint().fields.iter().find(|f| f.name == name) {
        Some(field) => Ok(field),
        None => refuse("a field the warden's blueprint does not declare"),
    }
}

/// The declared arguments of a field, read from one opaque blob.
///
/// Every field of the warden's own blueprint takes one argument or none, so
/// the blob is either empty or one value read whole. **Bytes left in the blob
/// after the declared arguments are refused** — Article XI — and here the
/// warden is the being, so the refusal is its own.
pub fn read_args(field: &Field, args: &[u8]) -> Judged<Option<Value>> {
    match field.arguments.len() {
        0 if args.is_empty() => Ok(None),
        0 => refuse("bytes in the blob of a field that takes nothing"),
        1 => Ok(Some(
            decode(warden_blueprint(), &field.arguments[0].ty, args)
                .map_err(|why| Refused(why.0))?,
        )),
        _ => refuse("a field of the warden's blueprint taking more than one argument"),
    }
}

/// A field's answer, by the notation's rules — absent when the field answers
/// nothing.
pub fn write_answer(field: &Field, value: Option<Value>) -> Judged<Option<Vec<u8>>> {
    match (&field.answers, value) {
        (None, None) => Ok(None),
        (Some(ty), Some(value)) => Ok(Some(
            encode(warden_blueprint(), ty, &value).map_err(|why| Refused(why.0))?,
        )),
        _ => refuse("an answer that is not the answer the field declares"),
    }
}

fn record(name: &str) -> Type {
    Type::Base(name.to_string())
}

/// Write one record of the warden's blueprint, by name.
pub fn write_record(name: &str, value: &Value) -> Judged<Vec<u8>> {
    encode(warden_blueprint(), &record(name), value).map_err(|why| Refused(why.0))
}

/// Read one record of the warden's blueprint from the whole of these bytes.
pub fn read_record(name: &str, bytes: &[u8]) -> Judged<Value> {
    decode(warden_blueprint(), &record(name), bytes).map_err(|why| Refused(why.0))
}

/// A being's pk and the commitment beside it, as an estate lists them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Held {
    pub being: [u8; KEY],
    pub commitment: [u8; KEY],
}

/// One class of an estate: the digest of its blueprint, and the beings of it
/// this voice may reach.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Class {
    pub digest: [u8; KEY],
    pub beings: Vec<Held>,
}

/// Every being a voice may reach, given as digests with the pks under each.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Estate {
    pub classes: Vec<Class>,
}

/// The describe of one being: its pk, the digest of its blueprint, and its
/// heir commitment.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Sketch {
    pub being: [u8; KEY],
    pub digest: [u8; KEY],
    pub commitment: [u8; KEY],
}

/// What news carries. The case is read off which fields are present, and a
/// field that means nothing in a case is absent rather than filled.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Word {
    pub being: Option<[u8; KEY]>,
    pub successor: Option<[u8; KEY]>,
    pub commitment: Option<[u8; KEY]>,
    pub name: Option<[u8; KEY]>,
    pub padlock: Option<[u8; KEY]>,
    pub hints: Vec<String>,
}

/// An inbound row: which voice may reach which beings, and how to answer it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Standing {
    pub voice: [u8; KEY],
    pub commitment: [u8; KEY],
    /// The door name this heir commitment was hashed under. Without it a
    /// migrated standing could never verify an older commitment again.
    pub name: [u8; KEY],
    pub beings: Vec<[u8; KEY]>,
    pub mark: i64,
    pub spent: Vec<i64>,
    pub padlock: Option<[u8; KEY]>,
    pub hints: Vec<String>,
}

/// An outbound row: the invitation kept whole.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Relation {
    pub warden: [u8; KEY],
    pub commitment: [u8; KEY],
    pub padlock: [u8; KEY],
    pub voice: [u8; KEY],
    pub secret: [u8; KEY],
    pub heir: [u8; KEY],
    pub heir_secret: [u8; KEY],
    pub seq: i64,
    /// The mark kept for that far warden's news, which is its own counter and
    /// never the one this door sends by.
    pub news: i64,
    pub hints: Vec<String>,
}

/// A migration's state transfer: a being, its class, its cells, and both
/// records of standings whole.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Cargo {
    pub being: [u8; KEY],
    pub digest: [u8; KEY],
    pub cells: Vec<u8>,
    pub standings: Vec<Standing>,
    pub relations: Vec<Relation>,
}

fn b32(key: &[u8; KEY]) -> Value {
    Value::B32(*key)
}

fn being(key: &[u8; KEY]) -> Value {
    Value::Being(*key)
}

fn maybe_b32(key: &Option<[u8; KEY]>) -> Value {
    Value::Maybe(key.as_ref().map(|key| Box::new(b32(key))))
}

fn hints(hints: &[String]) -> Value {
    Value::Many(hints.iter().map(|h| Value::Text(h.clone())).collect())
}

impl Held {
    pub fn value(&self) -> Value {
        Value::Record(vec![being(&self.being), b32(&self.commitment)])
    }
}

impl Class {
    pub fn value(&self) -> Value {
        Value::Record(vec![
            b32(&self.digest),
            Value::Many(self.beings.iter().map(Held::value).collect()),
        ])
    }
}

impl Estate {
    pub fn value(&self) -> Value {
        Value::Record(vec![Value::Many(
            self.classes.iter().map(Class::value).collect(),
        )])
    }
}

impl Sketch {
    pub fn value(&self) -> Value {
        Value::Record(vec![
            being(&self.being),
            b32(&self.digest),
            b32(&self.commitment),
        ])
    }
}

impl Word {
    pub fn value(&self) -> Value {
        Value::Record(vec![
            Value::Maybe(self.being.as_ref().map(|key| Box::new(being(key)))),
            maybe_b32(&self.successor),
            maybe_b32(&self.commitment),
            maybe_b32(&self.name),
            maybe_b32(&self.padlock),
            hints(&self.hints),
        ])
    }
}

impl Standing {
    pub fn value(&self) -> Value {
        Value::Record(vec![
            b32(&self.voice),
            b32(&self.commitment),
            b32(&self.name),
            Value::Many(self.beings.iter().map(being).collect()),
            Value::Int(self.mark),
            Value::Many(self.spent.iter().map(|n| Value::Int(*n)).collect()),
            maybe_b32(&self.padlock),
            hints(&self.hints),
        ])
    }
}

impl Relation {
    pub fn value(&self) -> Value {
        Value::Record(vec![
            being(&self.warden),
            b32(&self.commitment),
            b32(&self.padlock),
            b32(&self.voice),
            b32(&self.secret),
            b32(&self.heir),
            b32(&self.heir_secret),
            Value::Int(self.seq),
            Value::Int(self.news),
            hints(&self.hints),
        ])
    }
}

impl Cargo {
    pub fn value(&self) -> Value {
        Value::Record(vec![
            being(&self.being),
            b32(&self.digest),
            Value::Bytes(self.cells.clone()),
            Value::Many(self.standings.iter().map(Standing::value).collect()),
            Value::Many(self.relations.iter().map(Relation::value).collect()),
        ])
    }
}

fn fields(value: &Value, wanted: usize) -> Judged<&[Value]> {
    match value {
        Value::Record(fields) if fields.len() == wanted => Ok(fields),
        _ => refuse("a value the wire did not read as its record"),
    }
}

fn read_b32(value: &Value) -> Judged<[u8; KEY]> {
    match value {
        Value::B32(key) => Ok(*key),
        _ => refuse("a field that is not a b32"),
    }
}

fn read_being(value: &Value) -> Judged<[u8; KEY]> {
    match value {
        Value::Being(key) => Ok(*key),
        _ => refuse("a field that is not a being"),
    }
}

fn read_int(value: &Value) -> Judged<i64> {
    match value {
        Value::Int(held) => Ok(*held),
        _ => refuse("a field that is not an int"),
    }
}

fn read_bytes(value: &Value) -> Judged<Vec<u8>> {
    match value {
        Value::Bytes(held) => Ok(held.clone()),
        _ => refuse("a field that is not bytes"),
    }
}

fn read_maybe<T>(value: &Value, held: fn(&Value) -> Judged<T>) -> Judged<Option<T>> {
    match value {
        Value::Maybe(None) => Ok(None),
        Value::Maybe(Some(inner)) => Ok(Some(held(inner)?)),
        _ => refuse("a field that is not an optional"),
    }
}

fn read_many<T>(value: &Value, held: fn(&Value) -> Judged<T>) -> Judged<Vec<T>> {
    match value {
        Value::Many(items) => items.iter().map(held).collect(),
        _ => refuse("a field that is not a list"),
    }
}

fn read_text(value: &Value) -> Judged<String> {
    match value {
        Value::Text(held) => Ok(held.clone()),
        _ => refuse("a field that is not text"),
    }
}

/// Read a `held` back from what the wire gave.
pub fn as_held(value: &Value) -> Judged<Held> {
    let fields = fields(value, 2)?;
    Ok(Held {
        being: read_being(&fields[0])?,
        commitment: read_b32(&fields[1])?,
    })
}

/// Read a `class` back from what the wire gave.
pub fn as_class(value: &Value) -> Judged<Class> {
    let fields = fields(value, 2)?;
    Ok(Class {
        digest: read_b32(&fields[0])?,
        beings: read_many(&fields[1], as_held)?,
    })
}

/// Read an `estate` back from what the wire gave.
pub fn as_estate(value: &Value) -> Judged<Estate> {
    let fields = fields(value, 1)?;
    Ok(Estate {
        classes: read_many(&fields[0], as_class)?,
    })
}

/// Read a `sketch` back from what the wire gave.
pub fn as_sketch(value: &Value) -> Judged<Sketch> {
    let fields = fields(value, 3)?;
    Ok(Sketch {
        being: read_being(&fields[0])?,
        digest: read_b32(&fields[1])?,
        commitment: read_b32(&fields[2])?,
    })
}

/// Read a `word` back from what the wire gave.
pub fn as_word(value: &Value) -> Judged<Word> {
    let fields = fields(value, 6)?;
    Ok(Word {
        being: read_maybe(&fields[0], read_being)?,
        successor: read_maybe(&fields[1], read_b32)?,
        commitment: read_maybe(&fields[2], read_b32)?,
        name: read_maybe(&fields[3], read_b32)?,
        padlock: read_maybe(&fields[4], read_b32)?,
        hints: read_many(&fields[5], read_text)?,
    })
}

/// Read a `standing` back from what the wire gave.
pub fn as_standing(value: &Value) -> Judged<Standing> {
    let fields = fields(value, 8)?;
    Ok(Standing {
        voice: read_b32(&fields[0])?,
        commitment: read_b32(&fields[1])?,
        name: read_b32(&fields[2])?,
        beings: read_many(&fields[3], read_being)?,
        mark: read_int(&fields[4])?,
        spent: read_many(&fields[5], read_int)?,
        padlock: read_maybe(&fields[6], read_b32)?,
        hints: read_many(&fields[7], read_text)?,
    })
}

/// Read a `relation` back from what the wire gave.
pub fn as_relation(value: &Value) -> Judged<Relation> {
    let fields = fields(value, 10)?;
    Ok(Relation {
        warden: read_being(&fields[0])?,
        commitment: read_b32(&fields[1])?,
        padlock: read_b32(&fields[2])?,
        voice: read_b32(&fields[3])?,
        secret: read_b32(&fields[4])?,
        heir: read_b32(&fields[5])?,
        heir_secret: read_b32(&fields[6])?,
        seq: read_int(&fields[7])?,
        news: read_int(&fields[8])?,
        hints: read_many(&fields[9], read_text)?,
    })
}

/// Read a `cargo` back from what the wire gave.
pub fn as_cargo(value: &Value) -> Judged<Cargo> {
    let fields = fields(value, 5)?;
    Ok(Cargo {
        being: read_being(&fields[0])?,
        digest: read_b32(&fields[1])?,
        cells: read_bytes(&fields[2])?,
        standings: read_many(&fields[3], as_standing)?,
        relations: read_many(&fields[4], as_relation)?,
    })
}
