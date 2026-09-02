//! The wire: the one way each closed type is written, and the bytes a decoder
//! refuses.
//!
//! Constitution, Article V. Each type has exactly one way of being written, so
//! a value is never repaired and a second legal spelling never exists. A
//! decoder reads the whole of what it was handed or refuses in silence.

use quo_notation::{Blueprint, Type, CLOSED};

/// The width of an `int`, and so of every length and every count.
pub const INT: usize = 8;

/// The width of a `b32`, and of a `being`.
pub const B32: usize = 32;

/// The one byte a `T?` carries, and the one byte a `bool` carries.
pub const MARKER: usize = 1;

/// Why bytes are not a value, or a value is not of its type. The reason is for
/// a reader; the refusal is the fact, and on the wire it is silence.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refused(pub String);

impl std::fmt::Display for Refused {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "refused: {}", self.0)
    }
}

impl std::error::Error for Refused {}

type Judged<T> = Result<T, Refused>;

fn refuse<T>(why: &str) -> Judged<T> {
    Err(Refused(why.to_string()))
}

/// The five things a holder holds, as one typed value.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Invitation {
    pub warden: [u8; 32],
    pub commitment: [u8; 32],
    pub padlock: [u8; 32],
    pub heir: [u8; 32],
    pub heir_secret: [u8; 32],
    pub hints: Vec<String>,
}

/// The four things a stranger holds: the invitation without the voice.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Card {
    pub warden: [u8; 32],
    pub commitment: [u8; 32],
    pub padlock: [u8; 32],
    pub hints: Vec<String>,
}

/// A value of one of the closed types, or of a record the blueprint declares.
///
/// A record carries its fields in the order the blueprint declares them and
/// nothing else — there are no names on the wire, so there are none here.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Value {
    Bool(bool),
    Int(i64),
    Text(String),
    Bytes(Vec<u8>),
    B32([u8; 32]),
    Being([u8; 32]),
    Invitation(Invitation),
    Card(Card),
    Many(Vec<Value>),
    Maybe(Option<Box<Value>>),
    Record(Vec<Value>),
}

/// Write a value of the given type. The blueprint is what a record name means.
pub fn encode(blueprint: &Blueprint, ty: &Type, value: &Value) -> Judged<Vec<u8>> {
    let mut out = Vec::new();
    write(blueprint, ty, value, &mut out)?;
    Ok(out)
}

/// Read a value of the given type from the whole of these bytes.
///
/// Bytes left over after a well-formed value has been read are refused, which
/// is why nothing here reads a prefix.
pub fn decode(blueprint: &Blueprint, ty: &Type, bytes: &[u8]) -> Judged<Value> {
    let mut reader = Reader { bytes, at: 0 };
    let value = read(blueprint, ty, &mut reader)?;
    if reader.at != bytes.len() {
        return refuse("bytes left over after the value");
    }
    Ok(value)
}

/// Write a field's arguments as the one opaque blob a method carries: each
/// value of its declared type, in the declared order, one after another.
///
/// **This is not a second encoding.** It is [`encode`] applied in sequence, so
/// a blob of one argument is byte for byte what `encode` writes, and a field
/// that takes nothing carries nothing.
pub fn encode_all(blueprint: &Blueprint, types: &[Type], values: &[Value]) -> Judged<Vec<u8>> {
    if types.len() != values.len() {
        return refuse("a call with a different count of values than declared types");
    }
    let mut out = Vec::new();
    for (ty, value) in types.iter().zip(values) {
        write(blueprint, ty, value, &mut out)?;
    }
    Ok(out)
}

/// Read a field's arguments back out of that blob. **Bytes left over after the
/// declared arguments are refused** — Article XI.
pub fn decode_all(blueprint: &Blueprint, types: &[Type], bytes: &[u8]) -> Judged<Vec<Value>> {
    let mut reader = Reader { bytes, at: 0 };
    let mut out = Vec::with_capacity(types.len());
    for ty in types {
        out.push(read(blueprint, ty, &mut reader)?);
    }
    if reader.at != bytes.len() {
        return refuse("bytes left over after the arguments");
    }
    Ok(out)
}

fn record<'a>(blueprint: &'a Blueprint, name: &str) -> Judged<&'a quo_notation::Record> {
    match blueprint.records.iter().find(|shape| shape.name == name) {
        Some(shape) => Ok(shape),
        None => refuse("a type no block declares"),
    }
}

fn write(blueprint: &Blueprint, ty: &Type, value: &Value, out: &mut Vec<u8>) -> Judged<()> {
    match (ty, value) {
        (Type::Many(inner), Value::Many(items)) => {
            write_count(items.len(), out)?;
            for item in items {
                write(blueprint, inner, item, out)?;
            }
            Ok(())
        }
        (Type::Maybe(inner), Value::Maybe(held)) => match held {
            None => {
                out.push(0);
                Ok(())
            }
            Some(held) => {
                out.push(1);
                write(blueprint, inner, held, out)
            }
        },
        (Type::Base(name), value) => write_base(blueprint, name, value, out),
        _ => refuse("a value that is not of its type"),
    }
}

fn write_base(blueprint: &Blueprint, name: &str, value: &Value, out: &mut Vec<u8>) -> Judged<()> {
    match (name, value) {
        ("bool", Value::Bool(held)) => {
            out.push(u8::from(*held));
            Ok(())
        }
        ("int", Value::Int(held)) => {
            out.extend_from_slice(&held.to_be_bytes());
            Ok(())
        }
        ("text", Value::Text(held)) => {
            write_count(held.len(), out)?;
            out.extend_from_slice(held.as_bytes());
            Ok(())
        }
        ("bytes", Value::Bytes(held)) => {
            write_count(held.len(), out)?;
            out.extend_from_slice(held);
            Ok(())
        }
        ("b32", Value::B32(held)) | ("being", Value::Being(held)) => {
            out.extend_from_slice(held);
            Ok(())
        }
        ("invitation", Value::Invitation(held)) => {
            out.extend_from_slice(&held.warden);
            out.extend_from_slice(&held.commitment);
            out.extend_from_slice(&held.padlock);
            out.extend_from_slice(&held.heir);
            out.extend_from_slice(&held.heir_secret);
            write_hints(&held.hints, out)
        }
        ("card", Value::Card(held)) => {
            out.extend_from_slice(&held.warden);
            out.extend_from_slice(&held.commitment);
            out.extend_from_slice(&held.padlock);
            write_hints(&held.hints, out)
        }
        (name, Value::Record(fields)) if !CLOSED.contains(&name) => {
            let shape = record(blueprint, name)?;
            if fields.len() != shape.members.len() {
                return refuse("a record whose fields are not the fields its block declares");
            }
            for (member, field) in shape.members.iter().zip(fields) {
                write(blueprint, &member.ty, field, out)?;
            }
            Ok(())
        }
        _ => refuse("a value that is not of its type"),
    }
}

fn write_hints(hints: &[String], out: &mut Vec<u8>) -> Judged<()> {
    write_count(hints.len(), out)?;
    for hint in hints {
        write_count(hint.len(), out)?;
        out.extend_from_slice(hint.as_bytes());
    }
    Ok(())
}

/// Every length and count is written the way an `int` is, and is non-negative
/// by rule — so one too large to be an `int` has no spelling at all.
fn write_count(count: usize, out: &mut Vec<u8>) -> Judged<()> {
    match i64::try_from(count) {
        Ok(count) => {
            out.extend_from_slice(&count.to_be_bytes());
            Ok(())
        }
        Err(_) => refuse("a length beyond what an int can carry"),
    }
}

struct Reader<'a> {
    bytes: &'a [u8],
    at: usize,
}

impl Reader<'_> {
    fn take(&mut self, wanted: usize) -> Judged<&[u8]> {
        match self.bytes.get(self.at..self.at + wanted) {
            Some(slice) => {
                self.at += wanted;
                Ok(slice)
            }
            None => refuse("bytes short of the value"),
        }
    }

    fn byte(&mut self) -> Judged<u8> {
        Ok(self.take(MARKER)?[0])
    }

    fn int(&mut self) -> Judged<i64> {
        let read: [u8; INT] = self.take(INT)?.try_into().expect("eight bytes");
        Ok(i64::from_be_bytes(read))
    }

    fn key(&mut self) -> Judged<[u8; 32]> {
        Ok(self.take(B32)?.try_into().expect("thirty-two bytes"))
    }

    /// A length or a count: an `int`, non-negative by rule, and never beyond
    /// what the receiver can address or beyond the bytes that remain.
    fn count(&mut self) -> Judged<usize> {
        let read = self.int()?;
        if read < 0 {
            return refuse("a length that is negative");
        }
        let count = match usize::try_from(read) {
            Ok(count) => count,
            Err(_) => return refuse("a size beyond what the receiver can address"),
        };
        if count > self.bytes.len() - self.at {
            return refuse("a length beyond the bytes that remain");
        }
        Ok(count)
    }

    fn text(&mut self) -> Judged<String> {
        let width = self.count()?;
        let read = self.take(width)?;
        match std::str::from_utf8(read) {
            Ok(text) => Ok(text.to_string()),
            Err(_) => refuse("a text that is not UTF-8"),
        }
    }

    fn hints(&mut self) -> Judged<Vec<String>> {
        let count = self.count()?;
        let mut hints = Vec::new();
        for _ in 0..count {
            hints.push(self.text()?);
        }
        Ok(hints)
    }
}

fn read(blueprint: &Blueprint, ty: &Type, reader: &mut Reader) -> Judged<Value> {
    match ty {
        Type::Many(inner) => {
            // A count is checked against the bytes that remain, but an item may
            // be wider than a byte, so the take is what finally refuses.
            let count = reader.count()?;
            let mut items = Vec::new();
            for _ in 0..count {
                items.push(read(blueprint, inner, reader)?);
            }
            Ok(Value::Many(items))
        }
        Type::Maybe(inner) => match reader.byte()? {
            0 => Ok(Value::Maybe(None)),
            1 => Ok(Value::Maybe(Some(Box::new(read(
                blueprint, inner, reader,
            )?)))),
            _ => refuse("an optional whose marker is neither present nor absent"),
        },
        Type::Base(name) => read_base(blueprint, name, reader),
    }
}

fn read_base(blueprint: &Blueprint, name: &str, reader: &mut Reader) -> Judged<Value> {
    match name {
        "bool" => match reader.byte()? {
            0 => Ok(Value::Bool(false)),
            1 => Ok(Value::Bool(true)),
            _ => refuse("a bool that is neither zero nor one"),
        },
        "int" => Ok(Value::Int(reader.int()?)),
        "text" => Ok(Value::Text(reader.text()?)),
        "bytes" => {
            let width = reader.count()?;
            Ok(Value::Bytes(reader.take(width)?.to_vec()))
        }
        "b32" => Ok(Value::B32(reader.key()?)),
        "being" => Ok(Value::Being(reader.key()?)),
        "invitation" => Ok(Value::Invitation(Invitation {
            warden: reader.key()?,
            commitment: reader.key()?,
            padlock: reader.key()?,
            heir: reader.key()?,
            heir_secret: reader.key()?,
            hints: reader.hints()?,
        })),
        "card" => Ok(Value::Card(Card {
            warden: reader.key()?,
            commitment: reader.key()?,
            padlock: reader.key()?,
            hints: reader.hints()?,
        })),
        name => {
            let shape = record(blueprint, name)?;
            let mut fields = Vec::new();
            for member in &shape.members {
                fields.push(read(blueprint, &member.ty, reader)?);
            }
            Ok(Value::Record(fields))
        }
    }
}
