// Ed25519 verification as SPEC.md's signature chapter pins it: RFC 8032,
// cofactorless, strict decoding, small-order public keys refused.
import { createHash } from "node:crypto";

const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const mod = (a, m = P) => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};
const pow = (b, e) => {
  let r = 1n;
  b = mod(b);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
};
const inv = (a) => pow(a, P - 2n);
const D = mod(-121665n * inv(121666n));
const SQRT_M1 = pow(2n, (P - 1n) / 4n);

const leInt = (bytes) => {
  let r = 0n;
  for (let i = bytes.length - 1; i >= 0; i--) r = (r << 8n) | BigInt(bytes[i]);
  return r;
};

// Extended coordinates [X, Y, Z, T].
const ZERO = [0n, 1n, 1n, 0n];
const add = ([X1, Y1, Z1, T1], [X2, Y2, Z2, T2]) => {
  const A = mod((Y1 - X1) * (Y2 - X2));
  const B = mod((Y1 + X1) * (Y2 + X2));
  const C = mod(T1 * 2n * D * T2);
  const Dd = mod(Z1 * 2n * Z2);
  const E = B - A;
  const F = Dd - C;
  const G = Dd + C;
  const H = B + A;
  return [mod(E * F), mod(G * H), mod(F * G), mod(E * H)];
};
const mul = (k, pt) => {
  let r = ZERO;
  let q = pt;
  while (k > 0n) {
    if (k & 1n) r = add(r, q);
    q = add(q, q);
    k >>= 1n;
  }
  return r;
};
const same = ([X1, Y1, Z1], [X2, Y2, Z2]) => mod(X1 * Z2 - X2 * Z1) === 0n && mod(Y1 * Z2 - Y2 * Z1) === 0n;

const B = decode(Uint8Array.from(Buffer.from("5866666666666666666666666666666666666666666666666666666666666666", "hex")));

// RFC 8032 5.1.3, with y at or above p refused. Returns null when it does not decode.
export function decode(bytes) {
  if (bytes.length !== 32) return null;
  const b = Uint8Array.from(bytes);
  const sign = b[31] >> 7;
  b[31] &= 0x7f;
  const y = leInt(b);
  if (y >= P) return null;
  const u = mod(y * y - 1n);
  const v = mod(D * y * y + 1n);
  let x = mod(u * pow(v, 3n) * pow(u * pow(v, 7n), (P - 5n) / 8n));
  const vx2 = mod(v * x * x);
  if (vx2 === u) {
    // root found
  } else if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
  else return null;
  if (x === 0n && sign === 1) return null;
  if (Number(x & 1n) !== sign) x = P - x;
  return [x, y, 1n, mod(x * y)];
}

const smallOrder = (pt) => {
  const q = mul(8n, pt);
  return same(q, ZERO);
};

export function verify(pk, msg, sig) {
  if (!sig || sig.length !== 64 || !pk || pk.length !== 32) return false;
  const s = leInt(sig.subarray(32));
  if (s >= L) return false;
  const R = decode(sig.subarray(0, 32));
  if (!R) return false;
  const A = decode(pk);
  if (!A || smallOrder(A)) return false;
  const h = createHash("sha512").update(sig.subarray(0, 32)).update(pk).update(msg).digest();
  const k = mod(leInt(h), L);
  return same(mul(s, B), add(R, mul(k, A)));
}
