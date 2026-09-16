import assert from "node:assert/strict";
import { test } from "node:test";

import { parseValue, readPayload, readReply } from "../value.js";

const b = (s) => Buffer.from(s, "utf8");

test("every number of the JSON grammar is a value", () => {
  for (const lit of ["0", "-0", "1.0", "1e23", "1e400", "1e-400", "9007199254740993", "-0.0e0"]) {
    assert.equal(parseValue(b(lit)).error, undefined, lit);
  }
  for (const lit of ["01", "1.", ".5", "+1", "1e", "-"]) assert.ok(parseValue(b(lit)).error, lit);
});

test("depth counts containers from the value written", () => {
  assert.equal(parseValue(b("1")).depth, 0);
  assert.equal(parseValue(b("[]")).depth, 1);
  assert.equal(parseValue(b("[[]]")).depth, 2);
  assert.equal(parseValue(b(`{"a":${"[".repeat(3)}${"]".repeat(3)}}`)).depth, 4);
});

test("strings, keys and bytes", () => {
  assert.ok(parseValue(b('{"a":1,"\\u0061":2}')).error);
  assert.ok(!parseValue(b('{"a":{"k":1,"k":2}}')).error);
  assert.ok(!parseValue(b('"\\ud800"')).error);
  assert.ok(!parseValue(b('"\\udc00"')).error);
  assert.ok(!parseValue(b('"\\ud83d\\ude00"')).error);
  assert.ok(!parseValue(b('"\\uffff"')).error);
  assert.ok(parseValue(Buffer.from([0x22, 0xff, 0x22])).error);
  assert.ok(parseValue(b("﻿{}")).error);
  assert.ok(!parseValue(b(" \t\r\n{} \n")).error);
});

test("a reply is one of three shapes", () => {
  assert.equal(readReply(b('{"silence":true}')).shape, "silence");
  assert.equal(readReply(b('{"quo":"removed"}')).word, "removed");
  assert.ok(readReply(b('{"quo":"gone"}')).error);
  assert.equal(readReply(b('{"seen":null,"object":{}}')).shape, "object");
  assert.ok(readReply(b('{"object":{}}')).error);
  assert.ok(readReply(b('{"object":1,"seen":2}')).error);
  assert.ok(readReply(b('{"object":1,"seen":null,"x":1}')).error);
  assert.ok(readReply(b('{"object":1,"object":2,"seen":null}')).error);
  assert.ok(!readReply(b(`{"object":${"[".repeat(500)}${"]".repeat(500)},"seen":null}`)).error);
});

test("a payload is well formed or says why not", () => {
  const pk = "ab".repeat(32);
  const base = `"to":"${pk}","by":"${pk}","next":null`;
  const ok = readPayload(b(`{${base},"seq":1,"method":"m","args":{"a":[1]}}`));
  assert.equal(ok.error, undefined);
  assert.equal(ok.seq, 1);
  assert.equal(ok.method, "m");
  assert.equal(readPayload(b(`{ ${base} , "seq" : 2 }`)).method, undefined);
  for (const no of [
    `{${base}}`,
    `{${base},"seq":0}`,
    `{${base},"seq":1.0}`,
    `{${base},"seq":1e0}`,
    `{${base},"seq":9007199254740992}`,
    `{${base},"seq":"1"}`,
    `{${base},"seq":1,"method":null}`,
    `{${base},"seq":1,"args":[]}`,
    `{"to":"${"0".repeat(64)}","by":"${pk}","next":null,"seq":1}`,
    `{"to":null,"by":"${pk.toUpperCase()}","next":null,"seq":1}`,
    `{"to":null,"by":"${pk}","seq":1}`,
    `{${base},"seq":1,"seq":1}`,
    "[1]",
  ]) {
    assert.ok(readPayload(b(no)).error, no);
  }
  assert.equal(readPayload(b(`{${base},"seq":1,"x":${"[".repeat(200)}${"]".repeat(200)}}`)).error, undefined);
  assert.equal(readPayload(b(`{${base},"seq":1,"args":{"k":"\\ud800","k":-0}}`)).error, undefined);
});
