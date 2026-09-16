// The algorithms Quo names, as the verifier uses them. Signing, agreement,
// hashing, sealing and derivation come from node:crypto. The Ed25519 check
// and the X25519 small-order test are written here, so that they fail exactly
// where SPEC.md says.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createPrivateKey,
  createPublicKey,
  diffieHellman,
  hkdfSync,
  sign,
} from "node:crypto";

export const ZERO32 = Buffer.alloc(32);

export const sha256 = (b) => createHash("sha256").update(b).digest();
const sha512 = (b) => createHash("sha512").update(b).digest();

/** HKDF-SHA-256 with the zero-length salt; the label is the ASCII info. */
export function hkdf(ikm, label, len) {
  const info = typeof label === "string" ? Buffer.from(label, "ascii") : label;
  return Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), info, len));
}

export function aesSeal(key44, aad, plain) {
  const c = createCipheriv("aes-256-gcm", key44.subarray(0, 32), key44.subarray(32, 44));
  c.setAAD(aad);
  return Buffer.concat([c.update(plain), c.final(), c.getAuthTag()]);
}

/** Opens AES-256-GCM with the tag at the end; null when it does not open. */
export function aesOpen(key44, aad, sealed) {
  if (sealed.length < 16) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key44.subarray(0, 32), key44.subarray(32, 44));
    d.setAAD(aad);
    d.setAuthTag(sealed.subarray(sealed.length - 16));
    return Buffer.concat([d.update(sealed.subarray(0, sealed.length - 16)), d.final()]);
  } catch {
    return null;
  }
}

// ---------- X25519 ----------

const X_PKCS8 = Buffer.from("302e020100300506032b656e04220420", "hex");
const X_SPKI = Buffer.from("302a300506032b656e032100", "hex");
const P = 2n ** 255n - 19n;

const mod = (a, m = P) => ((a % m) + m) % m;
function powmod(b, e, m = P) {
  let r = 1n;
  b = mod(b, m);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
    e >>= 1n;
  }
  return r;
}
const le = (b) => BigInt("0x" + (Buffer.from(b).reverse().toString("hex") || "0"));
const toLe = (n, len = 32) => Buffer.from(n.toString(16).padStart(len * 2, "0"), "hex").reverse();

/** RFC 7748 ladder, used to recognise a point that takes no seal. */
function ladder(k, u) {
  const x1 = mod(u);
  let [x2, z2, x3, z3] = [1n, 0n, x1, 1n];
  let swap = 0n;
  for (let t = 254n; t >= 0n; t--) {
    const kt = (k >> t) & 1n;
    if (swap ^ kt) [x2, x3, z2, z3] = [x3, x2, z3, z2];
    swap = kt;
    const a = mod(x2 + z2);
    const aa = (a * a) % P;
    const b = mod(x2 - z2);
    const bb = (b * b) % P;
    const e = mod(aa - bb);
    const c = mod(x3 + z3);
    const d = mod(x3 - z3);
    const da = (d * a) % P;
    const cb = (c * b) % P;
    x3 = mod((da + cb) ** 2n);
    z3 = mod(x1 * mod(da - cb) ** 2n);
    x2 = (aa * bb) % P;
    z2 = mod(e * (aa + 121665n * e));
  }
  if (swap) [x2, z2] = [x3, z3];
  return (x2 * powmod(z2, P - 2n)) % P;
}

/** A public key takes no seal when its agreement with any secret is zero. */
export function takesNoSeal(pub) {
  const u = le(pub) & (2n ** 255n - 1n);
  return ladder(2n ** 254n + 8n, u) === 0n;
}

export function x25519Pub(secret) {
  const k = createPrivateKey({ key: Buffer.concat([X_PKCS8, secret]), format: "der", type: "pkcs8" });
  return createPublicKey(k).export({ format: "der", type: "spki" }).subarray(-32);
}

/** The agreement of a secret and a public key; thirty-two zeros for a point of small order. */
export function x25519(secret, pub) {
  if (takesNoSeal(pub)) return Buffer.from(ZERO32);
  const k = createPrivateKey({ key: Buffer.concat([X_PKCS8, secret]), format: "der", type: "pkcs8" });
  const p = createPublicKey({ key: Buffer.concat([X_SPKI, pub]), format: "der", type: "spki" });
  return diffieHellman({ privateKey: k, publicKey: p });
}

// ---------- Ed25519 ----------

const E_PKCS8 = Buffer.from("302e020100300506032b657004220420", "hex");
export const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const D = mod(-121665n * powmod(121666n, P - 2n));
const SQRT_M1 = powmod(2n, (P - 1n) / 4n);

export function edPub(seed) {
  const k = createPrivateKey({ key: Buffer.concat([E_PKCS8, seed]), format: "der", type: "pkcs8" });
  return createPublicKey(k).export({ format: "der", type: "spki" }).subarray(-32);
}

export function edSign(seed, msg) {
  const k = createPrivateKey({ key: Buffer.concat([E_PKCS8, seed]), format: "der", type: "pkcs8" });
  return sign(null, msg, k);
}

/** The secret scalar RFC 8032 expands from a seed. */
export function edScalar(seed) {
  const h = sha512(seed).subarray(0, 32);
  h[0] &= 248;
  h[31] &= 127;
  h[31] |= 64;
  return le(h);
}

export const IDENTITY = { X: 0n, Y: 1n, Z: 1n, T: 0n };

export function pointAdd(p, q) {
  const a = mod((p.Y - p.X) * (q.Y - q.X));
  const b = mod((p.Y + p.X) * (q.Y + q.X));
  const c = mod(p.T * 2n * D * q.T);
  const d = mod(p.Z * 2n * q.Z);
  const e = b - a;
  const f = d - c;
  const g = d + c;
  const h = b + a;
  return { X: mod(e * f), Y: mod(g * h), T: mod(e * h), Z: mod(f * g) };
}

export const pointNeg = (p) => ({ X: mod(-p.X), Y: p.Y, Z: p.Z, T: mod(-p.T) });

export function pointMul(n, p) {
  let r = IDENTITY;
  let q = p;
  while (n > 0n) {
    if (n & 1n) r = pointAdd(r, q);
    q = pointAdd(q, q);
    n >>= 1n;
  }
  return r;
}

export const pointEq = (p, q) =>
  mod(p.X * q.Z - q.X * p.Z) === 0n && mod(p.Y * q.Z - q.Y * p.Z) === 0n;

/** RFC 8032 decoding: null for y at or above p, x = 0 with the sign bit, or no point. */
export function pointDecode(bytes) {
  const n = le(bytes);
  const signBit = n >> 255n;
  const y = n & (2n ** 255n - 1n);
  if (y >= P) return null;
  const u = mod(y * y - 1n);
  const v = mod(D * y * y + 1n);
  let x = mod(u * v ** 3n * powmod(u * v ** 7n, (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  if (vx2 === u) {
    // x stands
  } else if (vx2 === mod(-u)) {
    x = mod(x * SQRT_M1);
  } else {
    return null;
  }
  if (x === 0n && signBit === 1n) return null;
  if ((x & 1n) !== signBit) x = P - x;
  return { X: x, Y: y, Z: 1n, T: mod(x * y) };
}

export function pointEncode(p) {
  const zi = powmod(p.Z, P - 2n);
  const x = mod(p.X * zi);
  const y = mod(p.Y * zi);
  return toLe(y | ((x & 1n) << 255n));
}

export const isSmallOrder = (p) => pointEq(pointMul(8n, p), IDENTITY);

export const BASE = pointDecode(toLe(mod(4n * powmod(5n, P - 2n))));

export const scalarLe = le;
export const leBytes = toLe;

/** The cofactorless check of RFC 8032, failing exactly where SPEC.md lists. */
export function edVerify(pk, msg, sig) {
  if (sig.length !== 64 || pk.length !== 32) return false;
  const a = pointDecode(pk);
  if (!a || isSmallOrder(a)) return false;
  const rBytes = sig.subarray(0, 32);
  const r = pointDecode(rBytes);
  if (!r || !pointEncode(r).equals(rBytes)) return false;
  const s = le(sig.subarray(32, 64));
  if (s >= L) return false;
  const k = le(sha512(Buffer.concat([rBytes, pk, msg]))) % L;
  return pointEq(pointMul(s, BASE), pointAdd(r, pointMul(k, a)));
}

export const hramScalar = (rBytes, pk, msg) => le(sha512(Buffer.concat([rBytes, pk, msg]))) % L;
