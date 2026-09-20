import assert from "node:assert/strict";
import { createPrivateKey, createPublicKey, decapsulate, randomBytes } from "node:crypto";
import { test } from "node:test";

import { decaps, encaps, encapsInternal, isEncapsKey, keyGen, keyGenInternal } from "../mlkem.js";
import {
  BASE,
  edPub,
  edScalar,
  edSign,
  edVerify,
  hkdf,
  hramScalar,
  IDENTITY,
  isSmallOrder,
  L,
  leBytes,
  pointAdd,
  pointDecode,
  pointEncode,
  pointEq,
  pointMul,
  pointNeg,
  scalarLe,
  takesNoSeal,
  x25519,
  x25519Pub,
} from "../primitives.js";

const P = 2n ** 255n - 19n;

test("ML-KEM-768 round trips, and a changed ciphertext is rejected implicitly", () => {
  const { ek, dk } = keyGenInternal(randomBytes(32), randomBytes(32));
  assert.equal(ek.length, 1184);
  assert.equal(dk.length, 2400);
  const m = randomBytes(32);
  const { key, ct } = encapsInternal(ek, m);
  assert.equal(ct.length, 1088);
  assert.ok(decaps(dk, ct).equals(key));
  assert.ok(encapsInternal(ek, m).ct.equals(ct), "the same m gives the same ciphertext");
  const bad = Buffer.from(ct);
  bad[7] ^= 1;
  assert.ok(!decaps(dk, bad).equals(key));
  assert.ok(decaps(dk, bad).equals(decaps(dk, bad)));
});

test("ML-KEM-768 agrees with node:crypto where it is built in", (t) => {
  const d = randomBytes(32);
  const z = randomBytes(32);
  // PKCS#8 of ML-KEM-768 in its seed form: the seed is d then z.
  const der = Buffer.concat([Buffer.from("3054020100300b060960864801650304040204428040", "hex"), d, z]);
  let priv;
  try {
    priv = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  } catch {
    t.skip("node:crypto has no ML-KEM-768 here");
    return;
  }
  const { ek } = keyGenInternal(d, z);
  const spki = createPublicKey(priv).export({ format: "der", type: "spki" });
  assert.ok(spki.subarray(spki.length - 1184).equals(ek));
  const { key, ct } = encapsInternal(ek, randomBytes(32));
  assert.ok(decapsulate(priv, ct).equals(key));
});

test("HKDF-SHA-256 is RFC 5869 test case 3", () => {
  const out = hkdf(Buffer.alloc(22, 0x0b), Buffer.alloc(0), 42);
  assert.equal(out.toString("hex"), "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8");
});

test("ML-KEM-768 in its standard forms, and the encapsulation key check", () => {
  const { ek, dk } = keyGen();
  assert.ok(isEncapsKey(ek));
  const { key, ct } = encaps(ek);
  assert.ok(decaps(dk, ct).equals(key));
  assert.ok(!encaps(ek).ct.equals(ct), "each encapsulation draws its own m");
  assert.ok(!isEncapsKey(ek.subarray(1)));
  const high = Buffer.from(ek);
  high[0] = 0xff;
  high[1] |= 0x0f;
  assert.ok(!isEncapsKey(high), "a coefficient of 4095 is at or above q");
});

test("X25519 agrees both ways, and a small-order point takes no seal", () => {
  const a = randomBytes(32);
  const b = randomBytes(32);
  assert.ok(x25519(a, x25519Pub(b)).equals(x25519(b, x25519Pub(a))));
  assert.ok(!takesNoSeal(x25519Pub(a)));
  const order8 = Buffer.from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800", "hex");
  for (const p of [Buffer.alloc(32), leBytes(1n), order8, leBytes(P - 1n), leBytes(P), leBytes(P + 1n)]) {
    assert.ok(takesNoSeal(p), p.toString("hex"));
    assert.ok(x25519(a, p).equals(Buffer.alloc(32)));
  }
});

// ---------- Ed25519, against the failure list of SPEC.md ----------

const seed = randomBytes(32);
const pk = edPub(seed);
const a = edScalar(seed);
const msg = Buffer.from("quo");

function order8Point() {
  for (;;) {
    const p = pointDecode(randomBytes(32));
    if (!p) continue;
    const t = pointMul(L, p);
    if (!pointEq(pointMul(4n, t), IDENTITY)) return t;
  }
}

/** A signature whose R is given, valid under the cofactorless equation for the key aB. */
function withR(rBytes, pub = pk, scalar = a) {
  const k = hramScalar(rBytes, pub, msg);
  return Buffer.concat([rBytes, leBytes((k * scalar) % L)]);
}

test("Ed25519 verifies a node signature and refuses a changed message", () => {
  const sig = edSign(seed, msg);
  assert.ok(edVerify(pk, msg, sig));
  assert.ok(!edVerify(pk, Buffer.from("qu0"), sig));
});

test("Ed25519 fails on a signature of any length but sixty-four", () => {
  const sig = edSign(seed, msg);
  assert.ok(!edVerify(pk, msg, sig.subarray(0, 63)));
  assert.ok(!edVerify(pk, msg, Buffer.concat([sig, Buffer.alloc(1)])));
  assert.ok(!edVerify(pk, msg, Buffer.alloc(0)));
});

test("Ed25519 fails on an s at or above the group order", () => {
  const sig = edSign(seed, msg);
  const s = scalarLe(sig.subarray(32));
  assert.ok(!edVerify(pk, msg, Buffer.concat([sig.subarray(0, 32), leBytes(s + L)])));
  assert.ok(!edVerify(pk, msg, Buffer.concat([sig.subarray(0, 32), leBytes(L)])));
});

test("Ed25519 fails on an R that does not decode, or is not canonical", () => {
  let y = 2n;
  while (pointDecode(leBytes(y))) y++;
  assert.ok(!edVerify(pk, msg, withR(leBytes(y))));
  const id = leBytes(1n);
  assert.ok(edVerify(pk, msg, withR(id)), "the identity R, canonical, verifies");
  assert.ok(!edVerify(pk, msg, withR(leBytes(1n + P))), "the identity spelled y + p fails");
  assert.ok(!edVerify(pk, msg, withR(leBytes(1n | (1n << 255n)))), "x = 0 with the sign bit fails");
});

test("Ed25519 fails on a public key that does not decode, or whose y is at or above p", () => {
  let y = 2n;
  while (pointDecode(leBytes(y))) y++;
  assert.ok(!edVerify(leBytes(y), msg, edSign(seed, msg)));
  let good = 2n;
  while (!pointDecode(leBytes(good)) || isSmallOrder(pointDecode(leBytes(good)))) good++;
  assert.ok(good < 19n);
  assert.ok(!edVerify(leBytes(good + P), msg, withR(leBytes(1n), leBytes(good + P), 0n)));
});

test("Ed25519 fails on a small-order public key in any spelling", () => {
  const t8 = order8Point();
  const keys = [leBytes(1n), leBytes(P - 1n), leBytes(1n | (1n << 255n)), leBytes((P - 1n) | (1n << 255n)), pointEncode(t8)];
  for (let i = 1n; i < 8n; i++) keys.push(pointEncode(pointMul(i, t8)));
  for (const k of keys) {
    const sig = Buffer.concat([leBytes(1n), leBytes(0n)]);
    assert.ok(!edVerify(k, msg, sig), k.toString("hex"));
  }
  assert.ok(!edVerify(leBytes(1n), msg, Buffer.concat([pointEncode(BASE), leBytes(1n)])));
});

test("Ed25519 verifies a public key with a torsion component that is not small order", () => {
  const t8 = order8Point();
  const pub = pointEncode(pointAdd(pointMul(a, BASE), t8));
  const r = 12345n;
  const rBytes = pointEncode(pointMul(r, BASE));
  for (let i = 0; ; i++) {
    const m = Buffer.from(`torsion ${i}`);
    const k = hramScalar(rBytes, pub, m);
    if (k % 8n !== 0n) continue;
    const sig = Buffer.concat([rBytes, leBytes((r + k * a) % L)]);
    assert.ok(edVerify(pub, m, sig));
    break;
  }
});

test("Ed25519 verifies a small-order R", () => {
  assert.ok(edVerify(pk, msg, withR(leBytes(1n))), "the identity");
  const t8 = order8Point();
  const pub = pointEncode(pointAdd(pointMul(a, BASE), t8));
  const rBytes = pointEncode(pointNeg(t8));
  assert.ok(isSmallOrder(pointDecode(rBytes)));
  for (let i = 0; ; i++) {
    const m = Buffer.from(`small R ${i}`);
    const k = hramScalar(rBytes, pub, m);
    if (k % 8n !== 1n) continue;
    const sig = Buffer.concat([rBytes, leBytes((k * a) % L)]);
    assert.ok(edVerify(pub, m, sig), "an R of order eight");
    break;
  }
});
