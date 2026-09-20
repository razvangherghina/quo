// ML-KEM-768 of FIPS 203. The verifier holds a lock of its own and
// encapsulates to a kit's lock, and it draws its own d, z and m. It reads
// nothing of how a kit draws them.
import { createHash, randomBytes } from "node:crypto";

const N = 256;
const Q = 3329;
const K = 3;
const ETA1 = 2;
const ETA2 = 2;
const DU = 10;
const DV = 4;

const sha3_256 = (b) => createHash("sha3-256").update(b).digest();
const sha3_512 = (b) => createHash("sha3-512").update(b).digest();
const shake = (alg, b, len) => createHash(alg, { outputLength: len }).update(b).digest();

const G = (b) => {
  const h = sha3_512(b);
  return [h.subarray(0, 32), h.subarray(32, 64)];
};

function modpow(b, e) {
  let r = 1;
  let x = b % Q;
  while (e > 0) {
    if (e & 1) r = (r * x) % Q;
    x = (x * x) % Q;
    e >>= 1;
  }
  return r;
}

function bitrev7(x) {
  let r = 0;
  for (let i = 0; i < 7; i++) r = (r << 1) | ((x >> i) & 1);
  return r;
}

const ZETAS = Array.from({ length: 128 }, (_, i) => modpow(17, bitrev7(i)));
const MZETAS = Array.from({ length: 128 }, (_, i) => modpow(17, 2 * bitrev7(i) + 1));

function ntt(input) {
  const f = input.slice();
  let k = 1;
  for (let len = 128; len >= 2; len >>= 1) {
    for (let start = 0; start < N; start += 2 * len) {
      const z = ZETAS[k++];
      for (let j = start; j < start + len; j++) {
        const t = (z * f[j + len]) % Q;
        f[j + len] = (f[j] - t + Q) % Q;
        f[j] = (f[j] + t) % Q;
      }
    }
  }
  return f;
}

function invntt(input) {
  const f = input.slice();
  let k = 127;
  for (let len = 2; len <= 128; len <<= 1) {
    for (let start = 0; start < N; start += 2 * len) {
      const z = ZETAS[k--];
      for (let j = start; j < start + len; j++) {
        const t = f[j];
        f[j] = (t + f[j + len]) % Q;
        f[j + len] = (z * ((f[j + len] - t + Q) % Q)) % Q;
      }
    }
  }
  for (let j = 0; j < N; j++) f[j] = (f[j] * 3303) % Q;
  return f;
}

function mul(f, g) {
  const h = Array.from({ length: N }, () => 0);
  for (let i = 0; i < 128; i++) {
    const a0 = f[2 * i];
    const a1 = f[2 * i + 1];
    const b0 = g[2 * i];
    const b1 = g[2 * i + 1];
    h[2 * i] = ((a0 * b0) % Q + (((a1 * b1) % Q) * MZETAS[i]) % Q) % Q;
    h[2 * i + 1] = ((a0 * b1) % Q + ((a1 * b0) % Q)) % Q;
  }
  return h;
}

const add = (f, g) => f.map((x, i) => (x + g[i]) % Q);
const sub = (f, g) => f.map((x, i) => (x - g[i] + Q) % Q);

function encode(f, d) {
  const out = Buffer.alloc(32 * d);
  for (let i = 0; i < N; i++) {
    const a = f[i];
    for (let j = 0; j < d; j++) {
      const bit = i * d + j;
      out[bit >> 3] |= ((a >> j) & 1) << (bit & 7);
    }
  }
  return out;
}

function decode(b, d) {
  const f = Array.from({ length: N }, () => 0);
  for (let i = 0; i < N; i++) {
    let a = 0;
    for (let j = 0; j < d; j++) {
      const bit = i * d + j;
      a |= ((b[bit >> 3] >> (bit & 7)) & 1) << j;
    }
    f[i] = d === 12 ? a % Q : a;
  }
  return f;
}

const compress = (f, d) => f.map((x) => Math.floor((x * 2 ** (d + 1) + Q) / (2 * Q)) % 2 ** d);
const decompress = (f, d) => f.map((y) => Math.floor((y * Q * 2 + 2 ** d) / 2 ** (d + 1)));

function sampleNTT(seed) {
  for (let len = 1008; ; len *= 2) {
    const s = shake("shake128", seed, len);
    const a = [];
    for (let p = 0; p + 3 <= len && a.length < N; p += 3) {
      const d1 = s[p] + 256 * (s[p + 1] % 16);
      const d2 = Math.floor(s[p + 1] / 16) + 16 * s[p + 2];
      if (d1 < Q) a.push(d1);
      if (d2 < Q && a.length < N) a.push(d2);
    }
    if (a.length === N) return a;
  }
}

function cbd(b, eta) {
  const bit = (i) => (b[i >> 3] >> (i & 7)) & 1;
  const f = Array.from({ length: N }, () => 0);
  for (let i = 0; i < N; i++) {
    let x = 0;
    let y = 0;
    for (let j = 0; j < eta; j++) {
      x += bit(2 * i * eta + j);
      y += bit(2 * i * eta + eta + j);
    }
    f[i] = (x - y + Q) % Q;
  }
  return f;
}

const prf = (s, n, eta) => shake("shake256", Buffer.concat([s, Buffer.from([n])]), 64 * eta);

function matrix(rho) {
  const a = [];
  for (let i = 0; i < K; i++) {
    a.push([]);
    for (let j = 0; j < K; j++) a[i].push(sampleNTT(Buffer.concat([rho, Buffer.from([j, i])])));
  }
  return a;
}

function pkeKeyGen(d) {
  const [rho, sigma] = G(Buffer.concat([d, Buffer.from([K])]));
  const a = matrix(rho);
  let n = 0;
  const s = [];
  const e = [];
  for (let i = 0; i < K; i++) s.push(ntt(cbd(prf(sigma, n++, ETA1), ETA1)));
  for (let i = 0; i < K; i++) e.push(ntt(cbd(prf(sigma, n++, ETA1), ETA1)));
  const t = [];
  for (let i = 0; i < K; i++) {
    let acc = e[i];
    for (let j = 0; j < K; j++) acc = add(acc, mul(a[i][j], s[j]));
    t.push(acc);
  }
  const ek = Buffer.concat([...t.map((p) => encode(p, 12)), rho]);
  const dk = Buffer.concat(s.map((p) => encode(p, 12)));
  return { ek, dk };
}

function pkeEncrypt(ek, m, r) {
  const t = [];
  for (let i = 0; i < K; i++) t.push(decode(ek.subarray(384 * i, 384 * (i + 1)), 12));
  const a = matrix(ek.subarray(384 * K, 384 * K + 32));
  let n = 0;
  const y = [];
  const e1 = [];
  for (let i = 0; i < K; i++) y.push(ntt(cbd(prf(r, n++, ETA1), ETA1)));
  for (let i = 0; i < K; i++) e1.push(cbd(prf(r, n++, ETA2), ETA2));
  const e2 = cbd(prf(r, n++, ETA2), ETA2);
  const c = [];
  for (let i = 0; i < K; i++) {
    let acc = Array.from({ length: N }, () => 0);
    for (let j = 0; j < K; j++) acc = add(acc, mul(a[j][i], y[j]));
    c.push(encode(compress(add(invntt(acc), e1[i]), DU), DU));
  }
  let acc = Array.from({ length: N }, () => 0);
  for (let i = 0; i < K; i++) acc = add(acc, mul(t[i], y[i]));
  const mu = decompress(decode(m, 1), 1);
  const v = add(add(invntt(acc), e2), mu);
  c.push(encode(compress(v, DV), DV));
  return Buffer.concat(c);
}

function pkeDecrypt(dk, c) {
  let acc = Array.from({ length: N }, () => 0);
  for (let i = 0; i < K; i++) {
    const s = decode(dk.subarray(384 * i, 384 * (i + 1)), 12);
    const u = decompress(decode(c.subarray(320 * i, 320 * (i + 1)), DU), DU);
    acc = add(acc, mul(s, ntt(u)));
  }
  const v = decompress(decode(c.subarray(320 * K), DV), DV);
  return encode(compress(sub(v, invntt(acc)), 1), 1);
}

/** ML-KEM.KeyGen_internal(d, z): the 1184-byte ek and the 2400-byte dk. */
export function keyGenInternal(d, z) {
  const { ek, dk } = pkeKeyGen(Buffer.from(d));
  return { ek, dk: Buffer.concat([dk, ek, sha3_256(ek), Buffer.from(z)]) };
}

/** ML-KEM.Encaps_internal(ek, m): the 32-byte shared secret and the 1088-byte ciphertext. */
export function encapsInternal(ek, m) {
  const [key, r] = G(Buffer.concat([Buffer.from(m), sha3_256(ek)]));
  return { key: Buffer.from(key), ct: pkeEncrypt(Buffer.from(ek), Buffer.from(m), r) };
}

/** ML-KEM.KeyGen: a key pair from d and z the verifier draws. */
export const keyGen = () => keyGenInternal(randomBytes(32), randomBytes(32));

/** ML-KEM.Encaps: the shared secret and ciphertext, from an m the verifier draws. */
export const encaps = (ek) => encapsInternal(ek, randomBytes(32));

/** The encapsulation key check of FIPS 203: 1184 bytes, every coefficient below q. */
export function isEncapsKey(ek) {
  if (ek.length !== 384 * K + 32) return false;
  for (let i = 0; i < K; i++) {
    const part = ek.subarray(384 * i, 384 * (i + 1));
    if (!encode(decode(part, 12), 12).equals(part)) return false;
  }
  return true;
}

/** ML-KEM.Decaps_internal(dk, c): the 32-byte shared secret, implicit rejection included. */
export function decaps(dk, c) {
  dk = Buffer.from(dk);
  c = Buffer.from(c);
  const dkPke = dk.subarray(0, 384 * K);
  const ek = dk.subarray(384 * K, 768 * K + 32);
  const h = dk.subarray(768 * K + 32, 768 * K + 64);
  const z = dk.subarray(768 * K + 64);
  const m = pkeDecrypt(dkPke, c);
  const [key, r] = G(Buffer.concat([m, h]));
  const reject = shake("shake256", Buffer.concat([z, c]), 32);
  return pkeEncrypt(ek, m, r).equals(c) ? Buffer.from(key) : reject;
}
