//! The envelope: a sealed box with the key to open it stapled to the lid.
//!
//! Constitution, Article XI. What crosses is an ephemeral public key and then
//! one ciphertext, sealed to the recipient's padlock; nothing else is outside.
//! Inside the seal are two things — the payload, and one signature over it as
//! the last sixty-four bytes. The payload begins with one byte naming the
//! record it carries, zero for a `say` and one for an `answer`, and the
//! signature covers that byte with the rest.
//!
//! The payload is a record in Quo's own notation, so this crate declares the
//! two shapes as notation text and hands them to the wire. There is no second
//! encoder here.

use std::sync::OnceLock;

use quo_notation::{Blueprint, Type};
use quo_wire::{decode, encode, Value};

/// The byte a `say` rides under.
pub const SAY: u8 = 0;

/// The byte an `answer` rides under.
pub const ANSWER: u8 = 1;

/// The ephemeral public key stapled to the lid, and every other key.
pub const KEY: usize = quo_arithmetic::KEY;

/// The signature inside the seal — fixed size, so the payload needs no length
/// in front of it.
pub const SIGNATURE: usize = quo_arithmetic::SIGNATURE;

/// Why an envelope is not a message. Every one of these is silence on the
/// wire; the reason is for a reader alone.
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

/// The time budget in milliseconds, and the hops.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Allowance {
    pub time: i64,
    pub hops: i64,
}

/// A name and its arguments as one opaque blob whose meaning belongs to the
/// blueprint. The warden never looks inside.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Method {
    pub name: String,
    pub args: Vec<u8>,
}

/// One utterance from a voice to a door.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Say {
    pub voice: [u8; KEY],
    pub recipient: [u8; KEY],
    pub commitment: Option<[u8; KEY]>,
    pub seq: i64,
    pub padlock: [u8; KEY],
    pub hints: Vec<String>,
    pub allowance: Allowance,
    pub being: Option<[u8; KEY]>,
    pub method: Option<Method>,
}

/// The answering warden's name, the number of the ask it answers, and the
/// data — absent when the field answers nothing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Answer {
    pub warden: [u8; KEY],
    pub seq: i64,
    pub data: Option<Vec<u8>>,
}

/// What was inside the seal. The payload says what it is; position decides
/// nothing.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Message {
    Say(Say),
    Answer(Answer),
}

impl Message {
    /// The byte this record rides under.
    pub fn byte(&self) -> u8 {
        match self {
            Message::Say(_) => SAY,
            Message::Answer(_) => ANSWER,
        }
    }

    /// The voice whose signature stands over this payload: the caller's for a
    /// `say`, the answering warden's for an `answer`.
    pub fn signer(&self) -> [u8; KEY] {
        match self {
            Message::Say(say) => say.voice,
            Message::Answer(answer) => answer.warden,
        }
    }
}

/// The `say` shape as Article XI writes it, in the notation, wrapped in the
/// one class a blueprint needs.
pub const SAY_SHAPE: &str = "Envelope\n  say() say\n\nsay\n  voice b32\n  recipient b32\n  commitment b32?\n  seq int\n  padlock b32\n  hints [text]\n  allowance allowance\n  being being?\n  method method?\n\nallowance\n  time int\n  hops int\n\nmethod\n  name text\n  args bytes\n";

/// The `answer` shape as Article XI writes it.
pub const ANSWER_SHAPE: &str =
    "Envelope\n  answer() answer\n\nanswer\n  warden being\n  seq int\n  data bytes?\n";

struct Shape {
    blueprint: Blueprint,
    ty: Type,
}

fn shape(text: &str) -> Shape {
    let blueprint = quo_notation::parse(text).expect("the shape Article XI writes");
    let ty = blueprint.fields[0]
        .answers
        .clone()
        .expect("the field answers the record");
    Shape { blueprint, ty }
}

fn say_shape() -> &'static Shape {
    static SHAPE: OnceLock<Shape> = OnceLock::new();
    SHAPE.get_or_init(|| shape(SAY_SHAPE))
}

fn answer_shape() -> &'static Shape {
    static SHAPE: OnceLock<Shape> = OnceLock::new();
    SHAPE.get_or_init(|| shape(ANSWER_SHAPE))
}

fn b32(key: &[u8; KEY]) -> Value {
    Value::B32(*key)
}

fn maybe(held: Option<Value>) -> Value {
    Value::Maybe(held.map(Box::new))
}

fn as_say(value: &Value) -> Judged<Say> {
    let fields = match value {
        Value::Record(fields) if fields.len() == 9 => fields,
        _ => return refuse("a say the wire did not read as its record"),
    };
    Ok(Say {
        voice: read_b32(&fields[0])?,
        recipient: read_b32(&fields[1])?,
        commitment: read_maybe(&fields[2], read_b32)?,
        seq: read_int(&fields[3])?,
        padlock: read_b32(&fields[4])?,
        hints: read_hints(&fields[5])?,
        allowance: read_allowance(&fields[6])?,
        being: read_maybe(&fields[7], read_being)?,
        method: read_maybe(&fields[8], read_method)?,
    })
}

fn as_answer(value: &Value) -> Judged<Answer> {
    let fields = match value {
        Value::Record(fields) if fields.len() == 3 => fields,
        _ => return refuse("an answer the wire did not read as its record"),
    };
    Ok(Answer {
        warden: read_being(&fields[0])?,
        seq: read_int(&fields[1])?,
        data: read_maybe(&fields[2], read_bytes)?,
    })
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

fn read_text(value: &Value) -> Judged<String> {
    match value {
        Value::Text(held) => Ok(held.clone()),
        _ => refuse("a field that is not text"),
    }
}

fn read_maybe<T>(value: &Value, held: fn(&Value) -> Judged<T>) -> Judged<Option<T>> {
    match value {
        Value::Maybe(None) => Ok(None),
        Value::Maybe(Some(inner)) => Ok(Some(held(inner)?)),
        _ => refuse("a field that is not an optional"),
    }
}

fn read_hints(value: &Value) -> Judged<Vec<String>> {
    match value {
        Value::Many(items) => items.iter().map(read_text).collect(),
        _ => refuse("hints that are not a list"),
    }
}

fn read_allowance(value: &Value) -> Judged<Allowance> {
    match value {
        Value::Record(fields) if fields.len() == 2 => Ok(Allowance {
            time: read_int(&fields[0])?,
            hops: read_int(&fields[1])?,
        }),
        _ => refuse("an allowance that is not its record"),
    }
}

fn read_method(value: &Value) -> Judged<Method> {
    match value {
        Value::Record(fields) if fields.len() == 2 => Ok(Method {
            name: read_text(&fields[0])?,
            args: read_bytes(&fields[1])?,
        }),
        _ => refuse("a method that is not its record"),
    }
}

fn say_value(say: &Say) -> Value {
    Value::Record(vec![
        b32(&say.voice),
        b32(&say.recipient),
        maybe(say.commitment.as_ref().map(b32)),
        Value::Int(say.seq),
        b32(&say.padlock),
        Value::Many(say.hints.iter().map(|h| Value::Text(h.clone())).collect()),
        Value::Record(vec![
            Value::Int(say.allowance.time),
            Value::Int(say.allowance.hops),
        ]),
        maybe(say.being.as_ref().map(|being| Value::Being(*being))),
        maybe(say.method.as_ref().map(|method| {
            Value::Record(vec![
                Value::Text(method.name.clone()),
                Value::Bytes(method.args.clone()),
            ])
        })),
    ])
}

fn answer_value(answer: &Answer) -> Value {
    Value::Record(vec![
        Value::Being(answer.warden),
        Value::Int(answer.seq),
        maybe(answer.data.as_ref().map(|data| Value::Bytes(data.clone()))),
    ])
}

/// The record's bytes, without the byte that names it.
pub fn encode_say(say: &Say) -> Judged<Vec<u8>> {
    let shape = say_shape();
    encode(&shape.blueprint, &shape.ty, &say_value(say)).map_err(|why| Refused(why.0))
}

/// The record's bytes, without the byte that names it.
pub fn encode_answer(answer: &Answer) -> Judged<Vec<u8>> {
    let shape = answer_shape();
    encode(&shape.blueprint, &shape.ty, &answer_value(answer)).map_err(|why| Refused(why.0))
}

/// Read a `say` from the whole of these bytes, the naming byte already struck
/// off.
pub fn decode_say(bytes: &[u8]) -> Judged<Say> {
    let shape = say_shape();
    let value = decode(&shape.blueprint, &shape.ty, bytes).map_err(|why| Refused(why.0))?;
    as_say(&value)
}

/// Read an `answer` from the whole of these bytes, the naming byte already
/// struck off.
pub fn decode_answer(bytes: &[u8]) -> Judged<Answer> {
    let shape = answer_shape();
    let value = decode(&shape.blueprint, &shape.ty, bytes).map_err(|why| Refused(why.0))?;
    as_answer(&value)
}

/// The signed payload: one byte naming the record, then the record itself.
pub fn payload(message: &Message) -> Judged<Vec<u8>> {
    let mut out = vec![message.byte()];
    match message {
        Message::Say(say) => out.extend_from_slice(&encode_say(say)?),
        Message::Answer(answer) => out.extend_from_slice(&encode_answer(answer)?),
    }
    Ok(out)
}

/// Read a payload back, byte and all. Any first byte but the two is silence,
/// and a record presented under the wrong byte is silence too, because it
/// will not decode as the record that byte names.
pub fn read_payload(payload: &[u8]) -> Judged<Message> {
    match payload.split_first() {
        Some((&SAY, rest)) => Ok(Message::Say(decode_say(rest)?)),
        Some((&ANSWER, rest)) => Ok(Message::Answer(decode_answer(rest)?)),
        Some(_) => refuse("a first byte that names no record"),
        None => refuse("a payload with no byte in front of it at all"),
    }
}

/// Seal a message to a padlock. The ephemeral secret is taken as an argument,
/// never reached for, and it is fresh on every message by rule.
pub fn seal(
    voice_secret: &[u8; KEY],
    ephemeral_secret: &[u8; KEY],
    padlock: &[u8; KEY],
    message: &Message,
) -> Judged<Vec<u8>> {
    let payload = payload(message)?;
    let signature = quo_arithmetic::sign(voice_secret, &payload);

    let mut inside = payload;
    inside.extend_from_slice(&signature);

    let ephemeral = quo_arithmetic::sealing_pk(ephemeral_secret);
    let shared =
        quo_arithmetic::agree(ephemeral_secret, padlock).map_err(|why| Refused(why.to_string()))?;

    let mut envelope = ephemeral.to_vec();
    envelope.extend_from_slice(&quo_arithmetic::seal(&shared, &ephemeral, &inside));
    Ok(envelope)
}

/// Open an envelope with the padlock's own secret and read what was inside:
/// the payload and the one signature over it. Every refusal here is the same
/// refusal, and on the wire it is silence.
pub fn open(padlock_secret: &[u8; KEY], envelope: &[u8]) -> Judged<Message> {
    if envelope.len() < KEY {
        return refuse("an envelope with no room for an ephemeral key");
    }
    let ephemeral: [u8; KEY] = envelope[..KEY].try_into().expect("thirty-two bytes");
    let box_ = &envelope[KEY..];

    let shared = quo_arithmetic::agree(padlock_secret, &ephemeral)
        .map_err(|why| Refused(why.to_string()))?;
    let inside = quo_arithmetic::open(&shared, &ephemeral, box_)
        .map_err(|_| Refused("the box does not open".to_string()))?;

    if inside.len() < SIGNATURE {
        return refuse("no room inside the seal for a signature");
    }
    let (payload, signature) = inside.split_at(inside.len() - SIGNATURE);
    let signature: [u8; SIGNATURE] = signature.try_into().expect("sixty-four bytes");

    let message = read_payload(payload)?;
    quo_arithmetic::verify(&message.signer(), payload, &signature)
        .map_err(|_| Refused("the signature does not stand over this payload".to_string()))?;
    Ok(message)
}

/// Open an envelope arriving at a door, where the leading byte must say `say`
/// — Article XII's first step. A payload that decodes as both records is
/// refused here under the answer byte and accepted under the say byte, which
/// is the whole point of the byte: the record says what it is, and the door
/// answers only asks.
pub fn open_at_door(padlock_secret: &[u8; KEY], envelope: &[u8]) -> Judged<Say> {
    match open(padlock_secret, envelope)? {
        Message::Say(say) => Ok(say),
        Message::Answer(_) => refuse("an answer presented at a door"),
    }
}

/// Open an envelope arriving back at the caller, which mirrors the door: an
/// ask presented as a reply is silence too.
pub fn open_at_caller(padlock_secret: &[u8; KEY], envelope: &[u8]) -> Judged<Answer> {
    match open(padlock_secret, envelope)? {
        Message::Answer(answer) => Ok(answer),
        Message::Say(_) => refuse("an ask presented as a reply"),
    }
}

/// Read an answer the caller asked for. **The signature is verified against
/// the `warden` the answer's own record carries, and the match to the door
/// that was asked is a separate check** — a well-signed answer from another
/// house is a perfectly good answer to nobody's question, and the caller is
/// the only party that knows which door it asked.
pub fn read_answer(
    padlock_secret: &[u8; KEY],
    envelope: &[u8],
    warden: &[u8; KEY],
) -> Judged<Answer> {
    let answer = open_at_caller(padlock_secret, envelope)?;
    if &answer.warden != warden {
        return refuse("an answer from a door this caller did not ask");
    }
    Ok(answer)
}
