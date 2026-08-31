import { refuse } from './refusal.js';
import { SCALARS, baseOf } from './notation.js';

const KEY = 32;
const INT_MIN = -(2n ** 63n);
const INT_MAX = 2n ** 63n - 1n;

class Writer {
  constructor() {
    this.parts = [];
  }
  push(bytes) {
    this.parts.push(bytes);
  }
  // Every length and count is written the same way an int is.
  int(value) {
    if (typeof value !== 'bigint') refuse('NOT_AN_INT', String(value));
    if (value < INT_MIN || value > INT_MAX) refuse('INT_OUT_OF_RANGE', String(value));
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigInt64(0, value, false);
    this.push(out);
  }
  done() {
    const total = this.parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let at = 0;
    for (const part of this.parts) {
      out.set(part, at);
      at += part.length;
    }
    return out;
  }
}

class Reader {
  constructor(bytes) {
    this.bytes = bytes;
    this.at = 0;
  }
  take(n) {
    if (n > this.bytes.length - this.at) refuse('SHORT_INPUT');
    const out = this.bytes.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  int() {
    const slice = this.take(8);
    return new DataView(slice.buffer, slice.byteOffset, 8).getBigInt64(0, false);
  }
  // A length or a count is an int, and an int that cannot describe a stretch
  // of bytes describes nothing.
  size() {
    const value = this.int();
    if (value < 0n) refuse('NEGATIVE_LENGTH', String(value));
    const remaining = BigInt(this.bytes.length - this.at);
    if (value > remaining) refuse('LENGTH_BEYOND_INPUT', String(value));
    return Number(value);
  }
  flag() {
    const byte = this.take(1)[0];
    if (byte !== 0 && byte !== 1) refuse('NOT_A_FLAG', String(byte));
    return byte === 1;
  }
}

const utf8 = new TextEncoder();
// `ignoreBOM: true` keeps a leading byte order mark in the string rather than
// stripping it: inside a text value a mark is ordinary content, and a decoder
// that ate it would hand back a second spelling of what arrived.
const fromUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

function bytesOf(value, what) {
  if (!(value instanceof Uint8Array)) refuse('NOT_BYTES', what);
  return value;
}

function writeText(writer, value) {
  if (typeof value !== 'string') refuse('NOT_TEXT', String(value));
  // A kit may not write what no kit may read. JavaScript's strings can hold an
  // unpaired surrogate, which is no code point and no UTF-8; `TextEncoder`
  // would quietly write U+FFFD for it, and a repaired text is a second
  // spelling of a value this protocol names by the hash of its bytes.
  if (/\p{Surrogate}/u.test(value)) refuse('NOT_UTF8');
  const encoded = utf8.encode(value);
  writer.int(BigInt(encoded.length));
  writer.push(encoded);
}

function readText(reader) {
  const slice = reader.take(reader.size());
  try {
    return fromUtf8.decode(slice);
  } catch {
    refuse('NOT_UTF8');
  }
}

function writeKey(writer, value, what) {
  const bytes = bytesOf(value, what);
  if (bytes.length !== KEY) refuse('NOT_A_KEY', `${what} is ${bytes.length} bytes`);
  writer.push(bytes);
}

function writeHints(writer, hints) {
  if (!Array.isArray(hints)) refuse('NOT_A_LIST', 'hints');
  writer.int(BigInt(hints.length));
  for (const hint of hints) writeText(writer, hint);
}

function readHints(reader) {
  const count = reader.size();
  const hints = [];
  for (let i = 0; i < count; i += 1) hints.push(readText(reader));
  return hints;
}

function writeInvitation(writer, value) {
  if (value === null || typeof value !== 'object') refuse('NOT_AN_INVITATION');
  writeKey(writer, value.warden, 'warden');
  writeKey(writer, value.commitment, 'commitment');
  writeKey(writer, value.padlock, 'padlock');
  writeKey(writer, value.heirPublic, 'heirPublic');
  writeKey(writer, value.heirSecret, 'heirSecret');
  writeHints(writer, value.hints);
}

function readInvitation(reader) {
  return {
    warden: reader.take(KEY).slice(),
    commitment: reader.take(KEY).slice(),
    padlock: reader.take(KEY).slice(),
    heirPublic: reader.take(KEY).slice(),
    heirSecret: reader.take(KEY).slice(),
    hints: readHints(reader),
  };
}

// A card is an invitation with the keypair struck out, and the fields it keeps
// ride exactly as they ride there.
function writeCard(writer, value) {
  if (value === null || typeof value !== 'object') refuse('NOT_A_CARD');
  writeKey(writer, value.warden, 'warden');
  writeKey(writer, value.commitment, 'commitment');
  writeKey(writer, value.padlock, 'padlock');
  writeHints(writer, value.hints);
}

function readCard(reader) {
  return {
    warden: reader.take(KEY).slice(),
    commitment: reader.take(KEY).slice(),
    padlock: reader.take(KEY).slice(),
    hints: readHints(reader),
  };
}

function writeScalar(writer, base, value, records) {
  switch (base) {
    case 'bool':
      if (typeof value !== 'boolean') refuse('NOT_A_BOOL', String(value));
      writer.push(Uint8Array.of(value ? 1 : 0));
      return;
    case 'int':
      writer.int(value);
      return;
    case 'text':
      writeText(writer, value);
      return;
    case 'bytes': {
      const bytes = bytesOf(value, 'bytes');
      writer.int(BigInt(bytes.length));
      writer.push(bytes);
      return;
    }
    // `b32` is thirty-two bytes with no length in front, because it never has
    // another size; `being` is a `b32` carrying a pk.
    case 'b32':
      writeKey(writer, value, 'b32');
      return;
    case 'being':
      writeKey(writer, value, 'being');
      return;
    case 'invitation':
      writeInvitation(writer, value);
      return;
    case 'card':
      writeCard(writer, value);
      return;
    default:
      writeRecord(writer, records.get(base), value, records);
  }
}

function readScalar(reader, base, records) {
  switch (base) {
    case 'bool':
      return reader.flag();
    case 'int':
      return reader.int();
    case 'text':
      return readText(reader);
    case 'bytes':
      return reader.take(reader.size()).slice();
    case 'b32':
    case 'being':
      return reader.take(KEY).slice();
    case 'invitation':
      return readInvitation(reader);
    case 'card':
      return readCard(reader);
    default:
      return readRecord(reader, records.get(base), records);
  }
}

// A record is its fields, in the order the blueprint declares them, and
// nothing else — no names on the wire.
function writeRecord(writer, record, value, records) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    refuse('NOT_A_RECORD', record.name);
  }
  for (const field of record.fields) {
    writeValue(writer, field.type, value[field.name], records);
  }
}

function readRecord(reader, record, records) {
  const out = {};
  for (const field of record.fields) {
    out[field.name] = readValue(reader, field.type, records);
  }
  return out;
}

// The combinators compose freely, so the encoding composes with them.
export function writeValue(writer, type, value, records) {
  if (type.optional) {
    const present = value !== undefined && value !== null;
    writer.push(Uint8Array.of(present ? 1 : 0));
    if (present) writeValue(writer, type.optional, value, records);
    return;
  }
  if (type.list) {
    if (!Array.isArray(value)) refuse('NOT_A_LIST', printableType(type));
    writer.int(BigInt(value.length));
    for (const item of value) writeValue(writer, type.list, item, records);
    return;
  }
  writeScalar(writer, type.base, value, records);
}

export function readValue(reader, type, records) {
  if (type.optional) return reader.flag() ? readValue(reader, type.optional, records) : null;
  if (type.list) {
    const count = reader.size();
    const out = [];
    for (let i = 0; i < count; i += 1) out.push(readValue(reader, type.list, records));
    return out;
  }
  return readScalar(reader, type.base, records);
}

function printableType(type) {
  if (type.optional) return `${printableType(type.optional)}?`;
  if (type.list) return `[${printableType(type.list)}]`;
  return type.base;
}

function known(type, records) {
  const base = baseOf(type);
  if (!SCALARS.has(base) && !records.has(base)) refuse('UNKNOWN_TYPE', base);
}

export function recordsOf(blueprint) {
  return new Map((blueprint?.records ?? []).map((r) => [r.name, r]));
}

export function encode(type, value, records = new Map()) {
  known(type, records);
  const writer = new Writer();
  writeValue(writer, type, value, records);
  return writer.done();
}

// A method's blob is its arguments in declared order, each by the notation,
// concatenated — so many arguments ride in one stretch of bytes with nothing
// between them, and the declared order is the whole of what separates them.
export function encodeAll(types, values, records = new Map()) {
  const writer = new Writer();
  for (const [index, type] of types.entries()) {
    known(type, records);
    writeValue(writer, type, values[index], records);
  }
  return writer.done();
}

export function decodeAll(types, bytes, records = new Map()) {
  const reader = new Reader(bytesOf(bytes, 'input'));
  const out = types.map((type) => {
    known(type, records);
    return readValue(reader, type, records);
  });
  if (reader.at !== bytes.length) refuse('TRAILING_BYTES');
  return out;
}

export function decode(type, bytes, records = new Map()) {
  known(type, records);
  const reader = new Reader(bytesOf(bytes, 'input'));
  const value = readValue(reader, type, records);
  if (reader.at !== bytes.length) refuse('TRAILING_BYTES');
  return value;
}
