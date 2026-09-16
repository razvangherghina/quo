import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { encapsInternal, keyGenInternal } from "../mlkem.js";
import { aesOpen, aesSeal, edPub, edSign, edVerify, hkdf, sha256, x25519, x25519Pub } from "../primitives.js";

const { vectors } = JSON.parse(readFileSync(new URL("../../vectors/arithmetic.json", import.meta.url), "utf8"));
const h = (s) => Buffer.from(s, "hex");

// Each record is judged by the fields it carries.
function replay(v) {
  if (v.hash) return assert.equal(sha256(h(v.input)).toString("hex"), v.hash);
  if (v.signature) {
    if (v.secret) assert.equal(edSign(h(v.secret), h(v.message)).toString("hex"), v.signature);
    return assert.equal(edVerify(h(v.pk), h(v.message), h(v.signature)), !v.refuses);
  }
  if (v.d) return assert.equal(keyGenInternal(h(v.d), h(v.z)).ek.toString("hex"), v.ek);
  if (v.m) {
    const { key, ct } = encapsInternal(h(v.ek), h(v.m));
    assert.equal(ct.toString("hex"), v.ciphertext);
    return assert.equal(key.toString("hex"), v.shared);
  }
  if (v.ikm) {
    const out = hkdf(h(v.ikm), h(v.info), v.out ? v.out.length / 2 : 44).toString("hex");
    return assert.equal(out, v.out ?? v.key + v.nonce);
  }
  if (v.ciphertext) {
    const key44 = v.shared ? hkdf(h(v.shared), "quo-seal", 44) : h(v.key + v.nonce);
    const opened = aesOpen(key44, h(v.additional), h(v.ciphertext));
    if (v.refuses) return assert.equal(opened, null);
    assert.equal(opened?.toString("hex"), v.plaintext);
    return assert.equal(aesSeal(key44, h(v.additional), h(v.plaintext)).toString("hex"), v.ciphertext);
  }
  if (v.pk && v.secret && (v.shared || v.refuses)) {
    const agreed = x25519(h(v.secret), h(v.pk)).toString("hex");
    return v.refuses ? assert.equal(agreed, "0".repeat(64)) : assert.equal(agreed, v.shared);
  }
  if (v.pk && v.secret) {
    const pub = v.name.includes("X25519") ? x25519Pub(h(v.secret)) : edPub(h(v.secret));
    return assert.equal(pub.toString("hex"), v.pk);
  }
  assert.fail(`no replay for ${v.name}`);
}

for (const v of vectors) test(`arithmetic: ${v.name}`, () => replay(v));
