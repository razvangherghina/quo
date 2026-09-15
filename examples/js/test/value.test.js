// Chapter 3, "Values" and "The blueprint, the digest and `seen`", held to the
// examples the spec itself names.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { utf8 } from '../src/arithmetic.js';
import { PAYLOAD_DEPTH, canonical, digest, isValue, parseJson } from '../src/value.js';

const refused = (text, deepest) => assert.throws(() => parseJson(typeof text === 'string' ? utf8(text) : text, deepest), `refused: ${text}`);
const stands = (text, deepest) => parseJson(utf8(text), deepest);
const nest = (n) => '['.repeat(n) + ']'.repeat(n);

test('a whole number stands only when it is exactly a double or written as ECMAScript writes one', () => {
  refused('9007199254740993');
  assert.equal(stands('9007199254740992'), 2 ** 53);
  assert.equal(stands('1e21'), 1e21);
  assert.equal(stands('1e+23'), 1e23);
  assert.equal(stands('1'), stands('1.0'));
  assert.equal(stands('1e0'), 1);
});

test('text past the largest double, text that rounds to zero, and minus zero are refused', () => {
  refused('1e309');
  refused('1e-400');
  refused('-0');
  refused('-0.0');
  assert.equal(stands('0'), 0);
  assert.equal(stands('0.1'), 0.1);
});

test('a string is valid Unicode text: a lone surrogate is no string, a noncharacter stands', () => {
  refused('"\\ud800"');
  refused('"\\udc00x"');
  assert.equal(stands('"\\ud83d\\ude00"'), '\u{1F600}');
  assert.equal(stands('"\\uffff"'), '￿');
});

test('a key twice in one object is refused and never resolved to the last', () => {
  refused('{"a":1,"a":2}');
  assert.deepEqual(stands('{"__proto__":1}'), JSON.parse('{"__proto__":1}'));
});

test('bytes that are not UTF-8 are refused, not mended', () => {
  refused(new Uint8Array([0x22, 0xff, 0x22]));
});

test('depth sixty-four stands and sixty-five is refused; a payload is bound at sixty-six', () => {
  stands(nest(64));
  refused(nest(65));
  stands(nest(66), PAYLOAD_DEPTH);
  refused(nest(67), PAYLOAD_DEPTH);
  assert.equal(isValue(JSON.parse(nest(64))), true);
  assert.equal(isValue(JSON.parse(nest(65))), false);
  assert.equal(isValue(7), true, 'a number is depth zero');
});

test('nothing else is a value', () => {
  for (const v of [undefined, -0, NaN, Infinity, () => 1, new Date(0), Symbol('s'), 1n, Array(2), new Map()]) {
    assert.equal(isValue(v), false, String(v));
  }
});

test('JCS sorts keys by UTF-16 code unit and writes numbers as ECMAScript does', async () => {
  assert.equal(canonical({ '\u{FB33}': 1, '\u{1F600}': 2 }), '{"\u{1F600}":2,"\u{FB33}":1}');
  assert.equal(canonical([1e21, 1e-7, 1 / 3]), '[1e+21,1e-7,0.3333333333333333]');
  assert.equal(await digest({ b: 1, a: 2 }), await digest({ a: 2, b: 1 }));
  assert.equal(await digest(-0), null, 'a describe the value rule refuses costs the digest');
});
