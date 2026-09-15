// Support for `SCENARIOS.md` chapter 4, "Words and silences", holding
// only what no other scenario needs: the Ed25519 arithmetic line 4.10 puts
// on the wire where no library signs, and the seal under the all-zero
// agreement line 4.9 reads a reply against. Built on Node's own `crypto`
// and on `src/`, never on a kit's library.

import crypto from 'node:crypto';
import { mintKey } from '../../src/hand.js';

// ---- the all-zero agreement, `SPEC.md` "The sealed box" ----

const zeroSeal = () => Buffer.from(crypto.hkdfSync('sha256', Buffer.alloc(32), Buffer.alloc(0), Buffer.from('quo-seal'), 44));

// Whether a reply box opens under the all-zero agreement, which is what a
// seal to a small-order lid agrees to.
export function opensUnderZero(box) {
  if (box.length < 48) return false;
  const out = zeroSeal();
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', out.subarray(0, 32), out.subarray(32));
    d.setAAD(box.subarray(0, 32));
    d.setAuthTag(box.subarray(box.length - 16));
    Buffer.concat([d.update(box.subarray(32, box.length - 16)), d.final()]);
    return true;
  } catch {
    return false;
  }
}

// A reply box sealed under the all-zero agreement, the length of a silence.
export function zeroSealedBox(reply = { silence: true }) {
  const out = zeroSeal();
  const eph = crypto.randomBytes(32);
  const text = Buffer.from(JSON.stringify(reply));
  const c = crypto.createCipheriv('aes-256-gcm', out.subarray(0, 32), out.subarray(32));
  c.setAAD(eph);
  return Buffer.concat([eph, c.update(Buffer.concat([text, mintKey().sign(text)])), c.final(), c.getAuthTag()]);
}

// ---- Ed25519 arithmetic, RFC 8032 ----

const P = 2n ** 255n - 19n;
export const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const mod = (x, m = P) => ((x % m) + m) % m;
function pow(b, e, m = P) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}
const inv = (x) => pow(x, P - 2n);
const D = mod(-121665n * inv(121666n));
const I = pow(2n, (P - 1n) / 4n);

const leToInt = (buf) => BigInt(`0x${Buffer.from(buf).reverse().toString('hex') || '0'}`);
function intToLe(n, len = 32) {
  const hex = n.toString(16).padStart(len * 2, '0');
  return Buffer.from(hex, 'hex').reverse();
}

function decode(bytes) {
  const b = Buffer.from(bytes);
  const sign = b[31] >> 7;
  b[31] &= 0x7f;
  const y = leToInt(b);
  const u = mod(y * y - 1n);
  const v = mod(D * y * y + 1n);
  const x2 = mod(u * inv(v));
  let x = pow(x2, (P + 3n) / 8n);
  if (mod(x * x - x2) !== 0n) x = mod(x * I);
  if (mod(x * x - x2) !== 0n) throw new Error('not a point');
  if (Number(x & 1n) !== sign) x = mod(-x);
  return [x, y, 1n, mod(x * y)];
}
function encode([X, Y, Z]) {
  const zi = inv(Z);
  const x = mod(X * zi);
  const y = mod(Y * zi);
  const out = intToLe(y);
  out[31] |= Number(x & 1n) << 7;
  return out;
}
function add([X1, Y1, Z1, T1], [X2, Y2, Z2, T2]) {
  const A = mod((Y1 - X1) * (Y2 - X2));
  const B = mod((Y1 + X1) * (Y2 + X2));
  const C = mod(T1 * 2n * D * T2);
  const Dd = mod(Z1 * 2n * Z2);
  const E = B - A;
  const F = Dd - C;
  const G = Dd + C;
  const H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
}
const IDENTITY = [0n, 1n, 1n, 0n];
function mul(n, pt) {
  let r = IDENTITY;
  let q = pt;
  while (n > 0n) {
    if (n & 1n) r = add(r, q);
    q = add(q, q);
    n >>= 1n;
  }
  return r;
}
const BASE = decode(Buffer.from('5866666666666666666666666666666666666666666666666666666666666666', 'hex'));

// The identity, canonical; the identity with the sign bit set on x = 0; and
// the identity's y written as y + p, bytes that are not its encoding.
export const IDENTITY_ENC = Buffer.from(`01${'00'.repeat(31)}`, 'hex');
export const IDENTITY_SIGNED_ENC = Buffer.from(`01${'00'.repeat(30)}80`, 'hex');
const IDENTITY_NONCANONICAL_ENC = intToLe(P + 1n);
// A point of order eight.
const TORSION = decode(Buffer.from('c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a', 'hex'));

const sha512 = (...parts) => crypto.createHash('sha512').update(Buffer.concat(parts)).digest();

// A signer over arithmetic: `a` the secret scalar, `pkEnc` the encoding it
// announces. `sign(msg)` writes `R || s` with `s = r + k a`, `k` over the
// bytes of `R`, and `R` the encoding of `[r]B` unless `opts.rEnc` names it.
function arithSigner(a, pkEnc, opts = {}) {
  return {
    signPk: pkEnc.toString('hex'),
    k(msg, rEnc) {
      return mod(leToInt(sha512(rEnc, pkEnc, msg)), L);
    },
    sign(msg) {
      const r = opts.r ?? mod(leToInt(crypto.randomBytes(64)), L);
      const rEnc = opts.rEnc ?? encode(mul(r, BASE));
      const s = mod(r + this.k(msg, rEnc) * a, L);
      return Buffer.concat([rEnc, intToLe(s)]);
    },
  };
}

function scalarOf(seed) {
  const h = sha512(seed).subarray(0, 32);
  h[0] &= 248;
  h[31] &= 127;
  h[31] |= 64;
  return leToInt(h);
}

// A key minted from a seed, signing by arithmetic, checked against Node's.
export function arithKey(seed = crypto.randomBytes(32)) {
  const a = scalarOf(seed);
  const pkEnc = encode(mul(a, BASE));
  if (pkEnc.toString('hex') !== mintKey(seed).signPk) throw new Error('ed25519 arithmetic disagrees with node');
  return { a, pkEnc, seed };
}

// Signs with the real key and adds L to `s`.
export function sPlusL(key) {
  const k = mintKey(key.seed);
  return {
    signPk: k.signPk,
    sign(msg) {
      const sig = k.sign(msg);
      return Buffer.concat([sig.subarray(0, 32), intToLe(leToInt(sig.subarray(32)) + L)]);
    },
  };
}

// Signs with the real key and a signature one byte short.
export function shortSig(key) {
  const k = mintKey(key.seed);
  return { signPk: k.signPk, sign: (msg) => k.sign(msg).subarray(0, 63) };
}

// Signs with R the identity written as y + p, and s = k a over those bytes.
export function nonCanonicalR(key) {
  return arithSigner(key.a, key.pkEnc, { r: 0n, rEnc: IDENTITY_NONCANONICAL_ENC });
}

// Signs with R the identity, canonical, a small-order R.
export function smallOrderR(key) {
  return arithSigner(key.a, key.pkEnc, { r: 0n, rEnc: IDENTITY_ENC });
}

// Signs under a small-order public key `enc`: with A the identity, `[s]B =
// R` for `s = r`, whatever the message.
export function smallOrderKey(enc) {
  return {
    signPk: enc.toString('hex'),
    sign() {
      const r = mod(leToInt(crypto.randomBytes(64)), L);
      return Buffer.concat([encode(mul(r, BASE)), intToLe(r)]);
    },
  };
}

// A key with a torsion component that is not small-order: `A + T`, `T` of
// order eight. The cofactorless check holds when `k` is a multiple of eight,
// so `grind(payloadFor, aligned)` draws over `n` until `k` is one, or until
// it is not when `aligned` is false, and answers the payload and a signer
// that writes that one signature.
export function torsionKey(key) {
  const pkEnc = encode(add(mul(key.a, BASE), TORSION));
  const s = arithSigner(key.a, pkEnc);
  s.grind = (payloadFor, aligned = true) => {
    for (let n = 0; ; n++) {
      const payload = payloadFor(n);
      const msg = Buffer.from(JSON.stringify(payload));
      const r = mod(leToInt(crypto.randomBytes(64)), L);
      const rEnc = encode(mul(r, BASE));
      const k = s.k(msg, rEnc);
      if ((k % 8n === 0n) === aligned) {
        const sig = Buffer.concat([rEnc, intToLe(mod(r + k * key.a, L))]);
        return { n, signer: { signPk: s.signPk, sign: () => sig } };
      }
    }
  };
  return s;
}
