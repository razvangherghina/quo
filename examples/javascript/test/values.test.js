import { test } from "node:test";
import assert from "node:assert/strict";
import { parse, compact, utf8 } from "../lib/json.js";
import { verify } from "../lib/ed25519.js";
import { edSecret, sign, draw, hkdf, sha256, hex, lockOk, makeLock, lockPub } from "../lib/crypto.js";
import { wardKeys, seedBytes } from "../lib/quo.js";

const ok = (t, o) => assert.doesNotThrow(() => parse(t, o), t);
const bad = (t, o) => assert.throws(() => parse(t, o), t);

void test("any number the grammar allows is a value, carried as written", () => {
  for (const t of ["1", "1.0", "1e0", "-0", "-0.0", "1e400", "1e-400", "9007199254740993", "5e-324"]) {
    ok(t);
    assert.equal(compact(parse(`{"a":${t}}`).fields.get("a"), `{"a":${t}}`), t);
  }
  for (const t of ["01", "1.", ".5", "+1", "-", "1e", "Infinity"]) bad(t);
});

void test("strings, keys, depth", () => {
  ok('"\\ud83d\\ude00"');
  ok('"\\ud83d"');
  ok('"\\uffff"');
  bad('{"a":1,"\\u0061":2}');
  ok('{"x":{"a":1,"\\u0061":2}}');
  ok('{"a":1,"a":2}', { unique: false });
  ok(" \t\r\n{ } ");
  bad("﻿{}");
  bad("{} x");
  const deep = "[".repeat(200000) + '{"a" : [1, {}]}' + "]".repeat(200000);
  ok(deep);
  const doc = `{"d": ${deep}}`;
  assert.equal(compact(parse(doc).fields.get("d"), doc).length, deep.length - 3);
  bad("[".repeat(200000) + "]".repeat(199999));
  bad('{"d":[1,]}');
  bad('{"d":[{"a"}]}');
  assert.throws(() => utf8(Buffer.from([0xed, 0xa0, 0x80])));
  assert.throws(() => utf8(Buffer.from([0xff])));
});

void test("ed25519 verify agrees with node on ordinary signatures and refuses the listed places", () => {
  const k = edSecret(draw(32));
  const m = Buffer.from("hello");
  const s = sign(k, m);
  assert.ok(verify(k.pub, m, s));
  assert.ok(!verify(k.pub, Buffer.from("hellp"), s));
  assert.ok(!verify(k.pub, m, s.subarray(0, 63)));
  // s + L is at or above the group order
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  let sv = 0n;
  for (let i = 63; i >= 32; i--) sv = (sv << 8n) | BigInt(s[i]);
  const big = sv + L;
  const s2 = Buffer.from(s);
  for (let i = 0; i < 32; i++) s2[32 + i] = Number((big >> BigInt(8 * i)) & 0xffn);
  assert.ok(!verify(k.pub, m, s2));
  // identity public key, and its sign-bit spelling
  const id = Buffer.alloc(32);
  id[0] = 1;
  assert.ok(!verify(id, m, s));
  const idNeg = Buffer.from(id);
  idNeg[31] = 0x80;
  assert.ok(!verify(idNeg, m, s));
  // y at or above p
  const nonCanon = Buffer.alloc(32, 0xff);
  nonCanon[0] = 0xed;
  nonCanon[31] = 0x7f;
  assert.ok(!verify(nonCanon, m, s));
});

void test("the check of an encapsulation key", () => {
  const ek = Buffer.from(lockPub(makeLock()));
  assert.ok(lockOk(ek));
  const bent = Buffer.from(ek);
  bent[0] = 0xff;
  bent[1] |= 0x0f;
  assert.ok(!lockOk(bent));
});

void test("the ward key", () => {
  const seed = Buffer.alloc(32, 7);
  const k = wardKeys(seed);
  assert.equal(k.pk.length, 128);
  assert.equal(k.signer.seed.toString("hex"), hkdf(seed, "quo-ward-sign", 32).toString("hex"));
  assert.deepEqual(seedBytes("abc"), sha256(Buffer.from("abc")));
  assert.deepEqual(seedBytes(Buffer.alloc(31)), sha256(Buffer.alloc(31)));
  assert.equal(wardKeys("x").pk, wardKeys("x").pk);
  assert.match(hex(k.sealer.pub), /^[0-9a-f]{64}$/);
});
