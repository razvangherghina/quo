// ML-KEM-768 encapsulation from a chosen m, `Encaps_internal(ek, m)` of FIPS
// 203, which `SPEC.md` chapter 3 names for the knock. Node's own
// `crypto.encapsulate` draws m itself, so a hand drawing from a fixed stream
// needs the arithmetic spelled out here, on Node's SHA3 and SHAKE alone.

import crypto from 'node:crypto';

const Q = 3329;
const N = 256;
const K = 3;
const ETA = 2;
const DU = 10;
const DV = 4;

const bitRev7 = (i) => parseInt(i.toString(2).padStart(7, '0').split('').reverse().join(''), 2);

function power(base, exp) {
  let out = 1;
  for (let i = 0; i < exp; i++) out = (out * base) % Q;
  return out;
}

const ZETAS = Array.from({ length: 128 }, (_, i) => power(17, bitRev7(i)));
const GAMMAS = Array.from({ length: 128 }, (_, i) => power(17, 2 * bitRev7(i) + 1));

const mod = (x) => ((x % Q) + Q) % Q;
const sha3 = (bits, data) => crypto.createHash(`sha3-${bits}`).update(data).digest();
const shake = (bits, data, outputLength) => crypto.createHash(`shake${bits}`, { outputLength }).update(data).digest();

function ntt(f) {
  const a = f.slice();
  let i = 1;
  for (let len = 128; len >= 2; len /= 2) {
    for (let start = 0; start < N; start += 2 * len) {
      const zeta = ZETAS[i++];
      for (let j = start; j < start + len; j++) {
        const t = (zeta * a[j + len]) % Q;
        a[j + len] = mod(a[j] - t);
        a[j] = (a[j] + t) % Q;
      }
    }
  }
  return a;
}

function inverseNtt(f) {
  const a = f.slice();
  let i = 127;
  for (let len = 2; len <= 128; len *= 2) {
    for (let start = 0; start < N; start += 2 * len) {
      const zeta = ZETAS[i--];
      for (let j = start; j < start + len; j++) {
        const t = a[j];
        a[j] = (t + a[j + len]) % Q;
        a[j + len] = (zeta * mod(a[j + len] - t)) % Q;
      }
    }
  }
  return a.map((x) => (x * 3303) % Q);
}

function multiplyNtts(f, g) {
  const h = new Array(N);
  for (let i = 0; i < 128; i++) {
    const [a0, a1, b0, b1] = [f[2 * i], f[2 * i + 1], g[2 * i], g[2 * i + 1]];
    h[2 * i] = (a0 * b0 + ((a1 * b1) % Q) * GAMMAS[i]) % Q;
    h[2 * i + 1] = (a0 * b1 + a1 * b0) % Q;
  }
  return h;
}

const add = (f, g) => f.map((x, i) => (x + g[i]) % Q);

function sampleNtt(seed) {
  for (let length = 840; ; length *= 2) {
    const bytes = shake(128, seed, length);
    const a = [];
    for (let at = 0; at + 3 <= bytes.length && a.length < N; at += 3) {
      const d1 = bytes[at] + 256 * (bytes[at + 1] % 16);
      const d2 = Math.floor(bytes[at + 1] / 16) + 16 * bytes[at + 2];
      if (d1 < Q) a.push(d1);
      if (d2 < Q && a.length < N) a.push(d2);
    }
    if (a.length === N) return a;
  }
}

function sampleCbd(bytes) {
  const bit = (i) => (bytes[i >> 3] >> (i & 7)) & 1;
  return Array.from({ length: N }, (_, i) => {
    let x = 0;
    let y = 0;
    for (let j = 0; j < ETA; j++) {
      x += bit(2 * i * ETA + j);
      y += bit(2 * i * ETA + ETA + j);
    }
    return mod(x - y);
  });
}

function byteEncode(values, d) {
  const out = Buffer.alloc((values.length * d) / 8);
  values.forEach((value, i) => {
    for (let j = 0; j < d; j++) if ((value >> j) & 1) out[(i * d + j) >> 3] |= 1 << ((i * d + j) & 7);
  });
  return out;
}

function byteDecode(bytes, d) {
  return Array.from({ length: (bytes.length * 8) / d }, (_, i) => {
    let value = 0;
    for (let j = 0; j < d; j++) value |= ((bytes[(i * d + j) >> 3] >> ((i * d + j) & 7)) & 1) << j;
    return d === 12 ? value % Q : value;
  });
}

const compress = (x, d) => Math.floor((x * 2 ** d + (Q - 1) / 2) / Q) % 2 ** d;

// `Encaps_internal(ek, m)`: the 1088 byte ciphertext and the 32 byte shared
// secret, from the 1184 byte encapsulation key and 32 bytes m.
export function encapsulate(ek, m) {
  const g = sha3(512, Buffer.concat([m, sha3(256, ek)]));
  const shared = g.subarray(0, 32);
  const r = g.subarray(32, 64);
  const t = [0, 1, 2].map((i) => byteDecode(ek.subarray(384 * i, 384 * (i + 1)), 12));
  const rho = ek.subarray(1152, 1184);
  const a = [0, 1, 2].map((i) => [0, 1, 2].map((j) => sampleNtt(Buffer.concat([rho, Buffer.from([j, i])]))));
  let counter = 0;
  const prf = () => shake(256, Buffer.concat([r, Buffer.from([counter++])]), 64 * ETA);
  const y = [0, 1, 2].map(() => sampleCbd(prf()));
  const e1 = [0, 1, 2].map(() => sampleCbd(prf()));
  const e2 = sampleCbd(prf());
  const yHat = y.map(ntt);
  const u = [0, 1, 2].map((i) => {
    let sum = new Array(N).fill(0);
    for (let j = 0; j < K; j++) sum = add(sum, multiplyNtts(a[j][i], yHat[j]));
    return add(inverseNtt(sum), e1[i]);
  });
  let tDotY = new Array(N).fill(0);
  for (let i = 0; i < K; i++) tDotY = add(tDotY, multiplyNtts(t[i], yHat[i]));
  const mu = byteDecode(m, 1).map((bit) => bit * 1665);
  const v = add(add(inverseNtt(tDotY), e2), mu);
  const c1 = Buffer.concat(u.map((poly) => byteEncode(poly.map((x) => compress(x, DU)), DU)));
  const c2 = byteEncode(v.map((x) => compress(x, DV)), DV);
  return { ciphertext: Buffer.concat([c1, c2]), shared: Buffer.from(shared) };
}
