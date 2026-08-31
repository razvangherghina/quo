// Four algorithms, named once and never negotiated: Ed25519 signs, X25519
// seals, SHA-256 commits, AES-256-GCM encrypts with the key derived through
// HKDF-SHA-256 under a fixed label. Every JavaScript ground has all four in
// `crypto.subtle` — which is why the law chose them — so the kit takes no
// package for any of them and runs the same code in a browser tab as on a
// server. Subtle is asynchronous, so everything here is.
import { refuse } from './refusal.js';
import { unhex } from './bytes.js';

const subtle = globalThis.crypto.subtle;

// A key is 32 bytes. Any prettier spelling of one is a kit's convenience.
export const KEY = 32;
export const SIGNATURE = 64;

// The seal's derivation, pinned to the byte: an empty salt, the fixed ASCII
// info `quo-seal` — the label and the info are one constant, not two — and
// forty-four bytes drawn, thirty-two of key then twelve of nonce. The tag is
// sixteen bytes, full length.
export const SEAL_INFO = new TextEncoder().encode('quo-seal');
export const SEAL_SALT = new Uint8Array(0);
export const NONCE = 12;
export const TAG = 16;

// Subtle takes a private key only wrapped in its PKCS#8 clothes, and a 32-byte
// secret plus a fixed prefix is the whole of that wrapping for both curves.
// These are bytes, not a platform's API.
const ED_SECRET = unhex('302e020100300506032b657004220420');
const X_SECRET = unhex('302e020100300506032b656e04220420');

const ED = { name: 'Ed25519' };
const X = { name: 'X25519' };

// Verification is RFC 8032's check, and before it one named refusal: a public
// key that is all zeros or of small order is silence, no signature examined.
// These are the eight small-order points' encodings — the identity, the point
// of order two, the two of order four (the all-zero key among them) and the
// four of order eight — written out as constants so no kit reimplements the
// arithmetic to comply. The pre-check stands in front of whatever verifier the
// platform supplies; a stricter platform refuses more, which stays legal.
const SMALL_ORDER = [
  '0100000000000000000000000000000000000000000000000000000000000000',
  'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
  '0000000000000000000000000000000000000000000000000000000000000000',
  '0000000000000000000000000000000000000000000000000000000000000080',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
  '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
  'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
].map(unhex);

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let at = 0; at < a.length; at += 1) if (a[at] !== b[at]) return false;
  return true;
}

export function smallOrder(pk) {
  return SMALL_ORDER.some((point) => sameBytes(point, pk));
}

function key32(value, what) {
  if (!(value instanceof Uint8Array)) refuse('NOT_BYTES', what);
  if (value.length !== KEY) refuse('NOT_A_KEY', `${what} is ${value.length} bytes`);
  return value;
}

function pkcs8(prefix, value, what) {
  const out = new Uint8Array(prefix.length + KEY);
  out.set(prefix, 0);
  out.set(key32(value, what), prefix.length);
  return out;
}

function secretKey(algorithm, prefix, value, what, uses) {
  return subtle.importKey('pkcs8', pkcs8(prefix, value, what), algorithm, true, uses);
}

function publicKey(algorithm, value, what, uses) {
  return subtle.importKey('raw', key32(value, what), algorithm, true, uses);
}

// Subtle exports no public half of a private key except through a JWK, where
// `x` is exactly the 32 raw bytes in base64url.
async function rawPublic(secret) {
  const jwk = await subtle.exportKey('jwk', secret);
  const binary = atob(jwk.x.replaceAll('-', '+').replaceAll('_', '/'));
  const out = new Uint8Array(binary.length);
  for (let at = 0; at < binary.length; at += 1) out[at] = binary.charCodeAt(at);
  return out;
}

export async function sha256(...parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const all = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return new Uint8Array(await subtle.digest('SHA-256', all));
}

// The heir commitment: the pk of the warden the heir would spend at, then the
// heir's pk, each 32 bytes, concatenated in that order.
export function commitment(wardenPk, heirPk) {
  return sha256(key32(wardenPk, 'warden'), key32(heirPk, 'heir'));
}

// Every draw of randomness is taken as an argument, never reached for.
export async function signingPair(seed) {
  const secret = await secretKey(ED, ED_SECRET, seed, 'seed', ['sign']);
  return { secret: Uint8Array.from(seed), pk: await rawPublic(secret) };
}

export async function sealingPair(seed) {
  const secret = await secretKey(X, X_SECRET, seed, 'seed', ['deriveBits']);
  return { secret: Uint8Array.from(seed), pk: await rawPublic(secret) };
}

export async function sign(message, secret) {
  const key = await secretKey(ED, ED_SECRET, secret, 'secret', ['sign']);
  return new Uint8Array(await subtle.sign(ED, key, message));
}

export async function verify(message, signature, pk) {
  if (!(signature instanceof Uint8Array) || signature.length !== SIGNATURE) return false;
  if (!(pk instanceof Uint8Array) || pk.length !== KEY) return false;
  if (smallOrder(pk)) return false;
  try {
    const key = await publicKey(ED, pk, 'voice', ['verify']);
    return await subtle.verify(ED, key, signature, message);
  } catch {
    return false;
  }
}

export async function agree(secret, peerPk) {
  const key = await secretKey(X, X_SECRET, secret, 'secret', ['deriveBits']);
  const peer = await publicKey(X, peerPk, 'padlock', []);
  let shared;
  try {
    shared = new Uint8Array(await subtle.deriveBits({ name: X.name, public: peer }, key, KEY * 8));
  } catch {
    // A platform that refuses the degenerate agreement itself has said the
    // same thing this kit says next, and it says it as one refusal.
    refuse('DEAD_AGREEMENT');
  }
  // An agreement that hands back thirty-two zero bytes is refused at the point
  // of agreement: the padlock was not a real key, and a seal derived from it
  // would protect nothing.
  if (shared.every((byte) => byte === 0)) refuse('DEAD_AGREEMENT');
  return shared;
}

// One HKDF-SHA-256 yields the AES key and the nonce together. The nonce needs
// no randomness of its own, because the key it pairs with is fresh on every
// message by construction.
export async function derive(shared) {
  const material = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
  const out = new Uint8Array(
    await subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: SEAL_SALT, info: SEAL_INFO },
      material,
      (KEY + NONCE) * 8,
    ),
  );
  return { key: out.subarray(0, KEY), nonce: out.subarray(KEY) };
}

async function cipherKey(shared, use) {
  const { key, nonce } = await derive(shared);
  return { key: await subtle.importKey('raw', key, 'AES-GCM', false, [use]), nonce };
}

// The additional authenticated data is the ephemeral public key — the one
// thing outside the seal, bound to it so the lid and the box cannot be mixed
// and matched. It is handed in, never assumed. Subtle writes the sixteen-byte
// tag as the last bytes of what it returns, which is where the law puts it.
export async function encrypt(shared, plaintext, aad) {
  const { key, nonce } = await cipherKey(shared, 'encrypt');
  const box = await subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: key32(aad, 'aad'), tagLength: TAG * 8 },
    key,
    plaintext,
  );
  return new Uint8Array(box);
}

export async function decrypt(shared, ciphertext, aad) {
  if (!(ciphertext instanceof Uint8Array) || ciphertext.length < TAG) refuse('SHORT_INPUT');
  const additionalData = key32(aad, 'aad');
  const { key, nonce } = await cipherKey(shared, 'decrypt');
  try {
    const body = await subtle.decrypt(
      { name: 'AES-GCM', iv: nonce, additionalData, tagLength: TAG * 8 },
      key,
      ciphertext,
    );
    return new Uint8Array(body);
  } catch {
    refuse('NOT_OURS');
  }
}
