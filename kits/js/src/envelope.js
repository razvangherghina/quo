// A message is a sealed box with the key to open it stapled to the lid: an
// ephemeral public key, and then one ciphertext sealed to the recipient's
// padlock. Nothing else is outside. Inside are two things: the payload, and
// one signature over it.
import { refuse } from './refusal.js';
import { parse } from './notation.js';
import { encode, decode, recordsOf } from './wire.js';
import {
  agree,
  decrypt,
  encrypt,
  sealingPair,
  sign,
  verify,
  KEY,
  SIGNATURE,
} from './arithmetic.js';

// The signed payload begins with one byte naming the record it carries, and
// the signature covers that byte with the rest. Position decides nothing: on a
// held line an ask and an answer arrive the same way, so the payload says what
// it is, and what it signs can never be read as the other record.
export const SAY = 0;
export const ANSWER = 1;

// The signed payload is one record in Quo's own notation, encoded by the
// notation's own rules: a key and a commitment alike are `b32`, thirty-two
// bare bytes, as a `being` rides; an
// optional field as the one present-or-absent byte, the hints as `[text]`, the
// allowance as two `int`s — time then hops — and the method as one optional
// pair whose arguments are an opaque, length-prefixed blob. The fields come in
// the order the envelope section lists them.
export const PAYLOAD_BLUEPRINT = `Envelope
  say(say say)

say
  voice b32
  recipient b32
  commitment b32?
  seq int
  padlock b32
  hints [text]
  allowance allowance
  being being?
  method method?

allowance
  time int
  hops int

method
  name text
  args bytes
`;

const RECORDS = recordsOf(parse(PAYLOAD_BLUEPRINT));
const PAYLOAD = { base: 'say' };

export function encodePayload(payload) {
  return encode(PAYLOAD, payload, RECORDS);
}

export function decodePayload(bytes) {
  return decode(PAYLOAD, bytes, RECORDS);
}

export function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

// The whole envelope: ephemeral pk outside, one ciphertext. `random` is the
// 32 bytes the ephemeral pair is made from — every draw of randomness is taken
// as an argument, so a bench can hand fixed bytes and get identical output.
// The box itself, without an opinion about what is in it: the ephemeral pk
// outside, one ciphertext, the signed bytes and their signature within. The
// answer is a box of this shape too.
export async function box(inside, padlock, random) {
  const ephemeral = await sealingPair(random);
  const shared = await agree(ephemeral.secret, padlock);
  return concat([ephemeral.pk, await encrypt(shared, inside, ephemeral.pk)]);
}

export async function unbox(envelope, padlockSecret) {
  if (!(envelope instanceof Uint8Array) || envelope.length <= KEY) refuse('SHORT_INPUT');
  const ephemeralPk = envelope.subarray(0, KEY);
  const shared = await agree(padlockSecret, ephemeralPk);
  const inside = await decrypt(shared, envelope.subarray(KEY), ephemeralPk);
  // The signature is the last sixty-four bytes inside the seal — fixed size,
  // needing no marker and no length in front of the payload.
  if (inside.length <= SIGNATURE) refuse('SHORT_INPUT');
  return {
    bytes: inside.subarray(0, inside.length - SIGNATURE),
    signature: inside.subarray(inside.length - SIGNATURE),
  };
}

// The record byte in front of the encoded record: what the signature covers
// and what a reader judges before it decodes anything.
export function tagged(tag, record) {
  return concat([Uint8Array.of(tag), record]);
}

// And its inverse. Any other first byte is silence, and a record presented
// under the wrong byte is silence too — which is one refusal, because the
// reader knows which record it is reading.
export function untag(tag, bytes) {
  if (bytes.length < 1 || bytes[0] !== tag) refuse('WRONG_RECORD');
  return bytes.subarray(1);
}

export async function seal({ payload, padlock, voiceSecret, random }) {
  const bytes = tagged(SAY, encodePayload(payload));
  return box(concat([bytes, await sign(bytes, voiceSecret)]), padlock, random);
}

// Step one alone: open the box and read what is in it, without judging the
// signature. The warden verifies as its own step. `bytes` is the signed
// payload, the record byte included, because that is what was signed.
export async function open({ envelope, padlockSecret }) {
  const { bytes, signature } = await unbox(envelope, padlockSecret);
  return { payload: decodePayload(untag(SAY, bytes)), bytes, signature };
}

// Which record a sealed envelope carries, read off the byte and nothing else.
// `null` where the box will not open or the byte names no record — the two
// answers a reader that must not guess is allowed.
export async function kindOf({ envelope, padlockSecret }) {
  try {
    const { bytes } = await unbox(envelope, padlockSecret);
    const kind = bytes.length > 0 ? bytes[0] : null;
    return kind === SAY || kind === ANSWER ? kind : null;
  } catch {
    return null;
  }
}

export async function unseal({ envelope, padlockSecret }) {
  const { payload, bytes, signature } = await open({ envelope, padlockSecret });
  // Verified with the voice the payload carries: a signature proves nothing
  // without it, and the door has no other way to find the standing.
  if (!(await verify(bytes, signature, payload.voice))) refuse('BAD_SIGNATURE');
  return payload;
}
