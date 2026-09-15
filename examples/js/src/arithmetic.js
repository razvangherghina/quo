// The six algorithms the seal rests on, named once and never negotiated:
// Ed25519 signs, X25519 agrees, ML-KEM-768 encapsulates, SHA-256 hashes,
// AES-256-GCM encrypts and HKDF-SHA-256 derives. A secret is always the
// thirty-two bytes a key is made from, and a lock the sixty-four, d then z.

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';

const subtle = globalThis.crypto.subtle;

export const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
export const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
export const utf8 = (text) => new TextEncoder().encode(text);

export function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export async function sha256(bytes) {
  return new Uint8Array(await subtle.digest('SHA-256', bytes));
}

// HKDF-SHA-256 under the zero-length salt, with the label's ASCII bytes as info.
export async function hkdf(ikm, label, length) {
  const key = await subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const info = typeof label === 'string' ? utf8(label) : label;
  const bits = await subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info }, key, length * 8);
  return new Uint8Array(bits);
}

// WebCrypto takes a raw private key only wrapped in PKCS#8; these are the
// fixed prefixes for a 32-byte Ed25519 seed and a 32-byte X25519 scalar.
const PKCS8 = {
  Ed25519: unhex('302e020100300506032b657004220420'),
  X25519: unhex('302e020100300506032b656e04220420'),
};

const privateKey = (name, secret, usages) => subtle.importKey('pkcs8', concat(PKCS8[name], secret), { name }, true, usages);

async function publicOf(name, secret, usages) {
  const { x } = await subtle.exportKey('jwk', await privateKey(name, secret, usages));
  return Uint8Array.from(atob(x.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}

// Ed25519 signs. Verification is RFC 8032's cofactorless check, and it refuses
// in exactly four places: a signature not sixty-four bytes, an s at or above
// the group order, an R that is not how its point encodes, and a public key
// that is small-order or whose y is not reduced.
const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const littleEndian = (bytes) => bytes.reduceRight((n, b) => (n << 8n) | BigInt(b), 0n);
const yOf = (point) => littleEndian(point) & ((1n << 255n) - 1n);
const SMALL_ORDER_Y = new Set([
  0n,
  1n,
  P - 1n,
  yOf(unhex('26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05')),
  yOf(unhex('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a')),
]);

export const ed25519 = {
  publicKey: (secret) => publicOf('Ed25519', secret, ['sign']),

  async sign(secret, message) {
    return new Uint8Array(await subtle.sign('Ed25519', await privateKey('Ed25519', secret, ['sign']), message));
  },

  async verify(publicKey, message, signature) {
    if (publicKey.length !== 32 || signature.length !== 64) return false;
    const y = yOf(publicKey);
    if (y >= P || SMALL_ORDER_Y.has(y)) return false;
    if (yOf(signature.subarray(0, 32)) >= P) return false;
    if (littleEndian(signature.subarray(32)) >= L) return false;
    // The equation itself, `[s]B = R + [k]A`, computed here: a library's own
    // check may refuse where RFC 8032's cofactorless check does not, a
    // small-order R among them. [s]B - [k]A is encoded and compared with R
    // as it was received.
    const A = decodePoint(publicKey);
    if (!A) return false;
    const R = signature.subarray(0, 32);
    const k = littleEndian(new Uint8Array(await subtle.digest('SHA-512', concat(R, publicKey, message)))) % L;
    const s = littleEndian(signature.subarray(32));
    const check = encodePoint(addPoints(multiply(s, BASE), negate(multiply(k, A))));
    return check.every((b, i) => b === R[i]);
  },
};

// Edwards25519 in extended coordinates, RFC 8032 section 5.1.
const mod = (x) => ((x % P) + P) % P;
function power(b, e) {
  let r = 1n;
  b = mod(b);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
}
const inverse = (x) => power(x, P - 2n);
const D = mod(-121665n * inverse(121666n));
const SQRT_M1 = power(2n, (P - 1n) / 4n);

function decodePoint(bytes) {
  const y = yOf(bytes);
  if (y >= P) return null;
  const sign = bytes[31] >> 7;
  const x2 = mod((y * y - 1n) * inverse(D * y * y + 1n));
  let x = power(x2, (P + 3n) / 8n);
  if (mod(x * x - x2) !== 0n) x = mod(x * SQRT_M1);
  if (mod(x * x - x2) !== 0n) return null;
  if (x === 0n && sign === 1) return null;
  if (Number(x & 1n) !== sign) x = P - x;
  return [x, y, 1n, mod(x * y)];
}

function encodePoint([X, Y, Z]) {
  const zi = inverse(Z);
  const x = mod(X * zi);
  let y = mod(Y * zi);
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = Number(y & 0xffn);
    y >>= 8n;
  }
  out[31] |= Number(x & 1n) << 7;
  return out;
}

function addPoints([X1, Y1, Z1, T1], [X2, Y2, Z2, T2]) {
  const a = mod((Y1 - X1) * (Y2 - X2));
  const b = mod((Y1 + X1) * (Y2 + X2));
  const c = mod(T1 * 2n * D * T2);
  const d = mod(Z1 * 2n * Z2);
  const [e, f, g, h] = [b - a, d - c, d + c, b + a];
  return [mod(e * f), mod(g * h), mod(f * g), mod(e * h)];
}

const negate = ([X, Y, Z, T]) => [mod(-X), Y, Z, mod(-T)];

function multiply(n, point) {
  let result = [0n, 1n, 1n, 0n];
  let q = point;
  while (n > 0n) {
    if (n & 1n) result = addPoints(result, q);
    q = addPoints(q, q);
    n >>= 1n;
  }
  return result;
}

const BASE = decodePoint(unhex('5866666666666666666666666666666666666666666666666666666666666666'));

// X25519 agrees. An agreement that comes out all zero is no agreement at all.
export const x25519 = {
  publicKey: (secret) => publicOf('X25519', secret, ['deriveBits']),

  async agree(secret, publicKey) {
    try {
      const pub = await subtle.importKey('raw', publicKey, 'X25519', false, []);
      const priv = await privateKey('X25519', secret, ['deriveBits']);
      const shared = new Uint8Array(await subtle.deriveBits({ name: 'X25519', public: pub }, priv, 256));
      return shared.some((b) => b !== 0) ? shared : null;
    } catch {
      return null;
    }
  },
};

// ML-KEM-768 in its deterministic internal forms, FIPS 203: a key pair from d
// and z, a ciphertext and shared secret from an encapsulation key and m, and
// decapsulation with implicit rejection. A ciphertext of another length is no
// secret at all.
export const mlkem = {
  keygen(dz) {
    const { publicKey, secretKey } = ml_kem768.keygen(dz);
    return { ek: publicKey, dk: secretKey };
  },

  encaps(ek, m) {
    const { cipherText, sharedSecret } = ml_kem768.encapsulate(ek, m);
    return { ciphertext: cipherText, shared: sharedSecret };
  },

  decaps(dk, ciphertext) {
    try {
      return ml_kem768.decapsulate(ciphertext, dk);
    } catch {
      return null;
    }
  },
};

// The message cipher: forty-four bytes from HKDF, the first thirty-two the
// AES-256 key and the last twelve the nonce. The label is `quo-seal` over an
// agreement, and `quo-edge-seal` over an agreement then an edge key for the
// body of an ask. The nonce needs no randomness of its own, because the key
// beside it is fresh on every message.
async function messageKey(ikm, label) {
  const out = await hkdf(ikm, label, 44);
  const key = await subtle.importKey('raw', out.subarray(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { key, iv: out.subarray(32) };
}

export async function encrypt(ikm, additionalData, plaintext, label = 'quo-seal') {
  const { key, iv } = await messageKey(ikm, label);
  return new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintext));
}

export async function decrypt(ikm, additionalData, ciphertext, label = 'quo-seal') {
  const { key, iv } = await messageKey(ikm, label);
  try {
    return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv, additionalData }, key, ciphertext));
  } catch {
    return null;
  }
}
