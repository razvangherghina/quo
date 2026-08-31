import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, encode, decode, encodeAll, decodeAll, recordsOf, Refusal } from '../src/index.js';

// `[base]?` when both are asked for: the list wrapped in the optional.
const T = (base, { list = false, optional = false } = {}) => {
  let type = { base };
  if (list) type = { list: type };
  if (optional) type = { optional: type };
  return type;
};
const key = (fill) => new Uint8Array(32).fill(fill);
const hex = (bytes) => Buffer.from(bytes).toString('hex');

function refusedWith(fn, code) {
  assert.throws(fn, (error) => error instanceof Refusal && error.code === code, `expected ${code}`);
}

test('bool is one byte, zero or one', () => {
  assert.equal(hex(encode(T('bool'), false)), '00');
  assert.equal(hex(encode(T('bool'), true)), '01');
  assert.equal(decode(T('bool'), Uint8Array.of(1)), true);
  refusedWith(() => decode(T('bool'), Uint8Array.of(2)), 'NOT_A_FLAG');
});

test('int is eight bytes, signed, most significant first', () => {
  assert.equal(hex(encode(T('int'), 1n)), '0000000000000001');
  assert.equal(hex(encode(T('int'), -1n)), 'ffffffffffffffff');
  assert.equal(hex(encode(T('int'), 258n)), '0000000000000102');
  for (const value of [0n, 1n, -1n, 255n, -(2n ** 63n), 2n ** 63n - 1n]) {
    assert.equal(decode(T('int'), encode(T('int'), value)), value);
  }
  refusedWith(() => encode(T('int'), 2n ** 63n), 'INT_OUT_OF_RANGE');
  refusedWith(() => encode(T('int'), 7), 'NOT_AN_INT');
  refusedWith(() => decode(T('int'), new Uint8Array(7)), 'SHORT_INPUT');
});

test('text is a length in front and UTF-8 after it', () => {
  assert.equal(hex(encode(T('text'), 'hi')), '00000000000000026869');
  assert.equal(hex(encode(T('text'), '')), '0000000000000000');
  for (const value of ['', 'hi', 'a longer line', 'naïve — 世界']) {
    assert.equal(decode(T('text'), encode(T('text'), value)), value);
  }
  // The length counts bytes, not characters.
  assert.equal(encode(T('text'), 'é').length, 10);
  refusedWith(() => encode(T('text'), 7n), 'NOT_TEXT');
});

test('bytes is a length in front and the bytes after it', () => {
  const value = Uint8Array.of(0, 255, 7);
  assert.equal(hex(encode(T('bytes'), value)), '000000000000000300ff07');
  assert.deepEqual(decode(T('bytes'), encode(T('bytes'), value)), value);
  assert.deepEqual(decode(T('bytes'), encode(T('bytes'), new Uint8Array(0))), new Uint8Array(0));
});

test('b32 is thirty-two bytes with no length in front, because it never has another size', () => {
  const value = key(3);
  assert.equal(encode(T('b32'), value).length, 32);
  assert.equal(hex(encode(T('b32'), value)), hex(value));
  assert.deepEqual(decode(T('b32'), encode(T('b32'), value)), value);
  refusedWith(() => encode(T('b32'), new Uint8Array(31)), 'NOT_A_KEY');
  refusedWith(() => encode(T('b32'), new Uint8Array(33)), 'NOT_A_KEY');
  refusedWith(() => decode(T('b32'), new Uint8Array(31)), 'SHORT_INPUT');
  refusedWith(() => decode(T('b32'), new Uint8Array(33)), 'TRAILING_BYTES');
  // A being is a b32 carrying a pk — the same thirty-two bare bytes.
  assert.equal(hex(encode(T('being'), value)), hex(encode(T('b32'), value)));
  // And the combinators compose over it like anything else.
  const many = T('b32', { list: true });
  assert.deepEqual(decode(many, encode(many, [key(1), key(2)])), [key(1), key(2)]);
  assert.equal(hex(encode(T('b32', { optional: true }), null)), '00');
});

test('a method blob is its arguments in declared order, concatenated', () => {
  const types = [T('b32'), T('text'), T('int')];
  const bytes = encodeAll(types, [key(6), 'hi', 9n]);
  assert.equal(bytes.length, 32 + 8 + 2 + 8);
  assert.equal(hex(bytes.subarray(0, 32)), hex(key(6)));
  const [one, two, three] = decodeAll(types, bytes);
  assert.deepEqual(one, key(6));
  assert.equal(two, 'hi');
  assert.equal(three, 9n);
  // A field that takes nothing has an empty blob, and anything else is refused.
  assert.equal(encodeAll([], []).length, 0);
  assert.deepEqual(decodeAll([], new Uint8Array(0)), []);
  refusedWith(() => decodeAll([], Uint8Array.of(1)), 'TRAILING_BYTES');
  refusedWith(() => decodeAll(types, bytes.subarray(0, 40)), 'LENGTH_BEYOND_INPUT');
});

test('being is thirty-two bytes with no length in front', () => {
  const value = key(9);
  assert.equal(encode(T('being'), value).length, 32);
  assert.deepEqual(decode(T('being'), encode(T('being'), value)), value);
  refusedWith(() => encode(T('being'), new Uint8Array(31)), 'NOT_A_KEY');
  refusedWith(() => decode(T('being'), new Uint8Array(31)), 'SHORT_INPUT');
  refusedWith(() => decode(T('being'), new Uint8Array(33)), 'TRAILING_BYTES');
});

test('invitation is the five things in a fixed order, then the hints', () => {
  const value = {
    warden: key(1),
    commitment: key(2),
    padlock: key(3),
    heirPublic: key(4),
    heirSecret: key(5),
    hints: ['https://a.example', 'https://b.example'],
  };
  const bytes = encode(T('invitation'), value);
  // Five keys with no lengths, then the hints as [text].
  assert.equal(hex(bytes.subarray(0, 32)), hex(key(1)));
  assert.equal(hex(bytes.subarray(32, 64)), hex(key(2)));
  assert.equal(hex(bytes.subarray(64, 96)), hex(key(3)));
  assert.equal(hex(bytes.subarray(96, 128)), hex(key(4)));
  assert.equal(hex(bytes.subarray(128, 160)), hex(key(5)));
  assert.equal(hex(bytes.subarray(160, 168)), '0000000000000002');
  assert.deepEqual(decode(T('invitation'), bytes), value);

  const bare = { ...value, hints: [] };
  assert.equal(encode(T('invitation'), bare).length, 168);
  assert.deepEqual(decode(T('invitation'), encode(T('invitation'), bare)), bare);
});

test('card is the invitation with the keypair struck out', () => {
  const value = {
    warden: key(1),
    commitment: key(2),
    padlock: key(3),
    hints: ['https://a.example', 'https://b.example'],
  };
  const bytes = encode(T('card'), value);
  // The three keys it keeps ride exactly as they ride in an invitation.
  assert.equal(
    hex(bytes.subarray(0, 96)),
    hex(
      encode(T('invitation'), { ...value, heirPublic: key(4), heirSecret: key(5) }).subarray(0, 96),
    ),
  );
  assert.equal(hex(bytes.subarray(96, 104)), '0000000000000002');
  assert.deepEqual(decode(T('card'), bytes), value);

  const bare = { ...value, hints: [] };
  assert.equal(encode(T('card'), bare).length, 104);
  assert.deepEqual(decode(T('card'), encode(T('card'), bare)), bare);

  // A card is not an invitation. Reading one as the other lands the hint count
  // on the voice's keypair, which is refused — the two are not interchangeable
  // in either direction, and neither is a prefix of the other's meaning.
  assert.throws(() =>
    decode(
      T('card'),
      encode(T('invitation'), { ...value, heirPublic: key(4), heirSecret: key(5) }),
    ),
  );
  assert.throws(() => decode(T('invitation'), encode(T('card'), value)));
  refusedWith(() => encode(T('card'), { ...value, warden: new Uint8Array(31) }), 'NOT_A_KEY');
  refusedWith(() => encode(T('card'), null), 'NOT_A_CARD');
});

test('[T] is a count in front and that many T after it', () => {
  const type = T('int', { list: true });
  assert.equal(hex(encode(type, [])), '0000000000000000');
  assert.equal(hex(encode(type, [1n])), '00000000000000010000000000000001');
  assert.deepEqual(decode(type, encode(type, [1n, -2n, 3n])), [1n, -2n, 3n]);
  const beings = T('being', { list: true });
  assert.deepEqual(decode(beings, encode(beings, [key(1), key(2)])), [key(1), key(2)]);
});

test('T? is one byte saying present or absent, and the value only when present', () => {
  const type = T('int', { optional: true });
  assert.equal(hex(encode(type, null)), '00');
  assert.equal(hex(encode(type, 5n)), '010000000000000005');
  assert.equal(decode(type, encode(type, null)), null);
  assert.equal(decode(type, encode(type, 5n)), 5n);
  refusedWith(() => decode(type, Uint8Array.of(2, 0, 0, 0, 0, 0, 0, 0, 0)), 'NOT_A_FLAG');
  // Absent means the value does not follow at all.
  assert.equal(encode(type, null).length, 1);
});

test('the combinators compose on the wire as they compose in the text', () => {
  // [T?] — a count, then a present-flag before each value.
  const listOfOptional = { list: { optional: { base: 'int' } } };
  assert.equal(
    hex(encode(listOfOptional, [1n, null])),
    '0000000000000002' + '010000000000000001' + '00',
  );
  assert.deepEqual(decode(listOfOptional, encode(listOfOptional, [1n, null, 3n])), [1n, null, 3n]);

  // [T]? — one flag, then the count, and nothing at all when absent.
  const optionalList = { optional: { list: { base: 'int' } } };
  assert.equal(hex(encode(optionalList, null)), '00');
  assert.equal(hex(encode(optionalList, [])), '01' + '0000000000000000');
  assert.equal(decode(optionalList, encode(optionalList, null)), null);
  assert.deepEqual(decode(optionalList, encode(optionalList, [7n])), [7n]);

  // [[T]] — a count of counts.
  const nested = { list: { list: { base: 'text' } } };
  assert.deepEqual(decode(nested, encode(nested, [['a', 'b'], []])), [['a', 'b'], []]);
  assert.equal(hex(encode(nested, [])), '0000000000000000');
});

test('a record is its fields in declaration order and nothing else', () => {
  const blueprint = parse('ToDo\n  items() [item]\n\nitem\n  id text\n  done bool\n');
  const records = recordsOf(blueprint);
  const item = T('item');
  const bytes = encode(item, { id: 'a', done: true }, records);
  // No names on the wire: a one-byte id, then the bool.
  assert.equal(hex(bytes), '000000000000000161' + '01');
  assert.deepEqual(decode(item, bytes, records), { id: 'a', done: true });

  const list = T('item', { list: true });
  const many = [
    { id: 'a', done: true },
    { id: 'b', done: false },
  ];
  assert.deepEqual(decode(list, encode(list, many, records), records), many);
});

test('records that hold records round-trip', () => {
  const blueprint = parse(
    'Warden\n  describe() estate\n\nestate\n  classes [class]\n\nclass\n  digest bytes\n  beings [being]\n',
  );
  const records = recordsOf(blueprint);
  const estate = T('estate');
  const value = { classes: [{ digest: key(7), beings: [key(1), key(2)] }] };
  assert.deepEqual(decode(estate, encode(estate, value, records), records), value);
});

test('an encoder refuses text it cannot write as UTF-8, as a decoder refuses to read it', () => {
  // A kit may not write what no kit may read. A lone surrogate is no code point
  // and no UTF-8; `TextEncoder` would quietly write U+FFFD for it, and a
  // repaired text is a second spelling of a value named by the hash of its
  // bytes.
  refusedWith(() => encode(T('text'), '\ud800'), 'NOT_UTF8');
  refusedWith(() => encode(T('text'), 'milk\udfff'), 'NOT_UTF8');
  refusedWith(() => encode(T('text', { list: true }), ['fine', '\udbff']), 'NOT_UTF8');
  // A well-formed pair is one code point and rides untouched.
  assert.equal(decode(T('text'), encode(T('text'), '😀')), '😀');
});

test('a text is carried as given and never normalised', () => {
  // Two Unicode normalisation forms are two values, and a kit that repaired
  // either would have forged a second spelling: U+00E9 composed against
  // U+0065 U+0301 decomposed.
  const composed = 'é';
  const decomposed = 'é';
  assert.notEqual(hex(encode(T('text'), composed)), hex(encode(T('text'), decomposed)));
  assert.equal(decode(T('text'), encode(T('text'), decomposed)), decomposed);
  assert.equal(decode(T('text'), encode(T('text'), composed)), composed);
  // A byte order mark inside a text value is ordinary content.
  assert.equal(decode(T('text'), encode(T('text'), '﻿hi')), '﻿hi');
});

test('a T? marker byte that is neither zero nor one is refused', () => {
  const present = encode(T('int', { optional: true }), 7n);
  assert.equal(present[0], 1);
  assert.equal(encode(T('int', { optional: true }), null)[0], 0);
  const bad = Uint8Array.from(present);
  bad[0] = 2;
  refusedWith(() => decode(T('int', { optional: true }), bad), 'NOT_A_FLAG');
  refusedWith(() => decode(T('bool'), Uint8Array.of(2)), 'NOT_A_FLAG');
});

test('malformed wire bytes are refused', () => {
  const negative = new Uint8Array(16);
  new DataView(negative.buffer).setBigInt64(0, -1n, false);
  refusedWith(() => decode(T('text'), negative), 'NEGATIVE_LENGTH');
  refusedWith(() => decode(T('bytes'), negative), 'NEGATIVE_LENGTH');
  refusedWith(() => decode(T('int', { list: true }), negative), 'NEGATIVE_LENGTH');

  const huge = new Uint8Array(16);
  new DataView(huge.buffer).setBigInt64(0, 2n ** 40n, false);
  refusedWith(() => decode(T('text'), huge), 'LENGTH_BEYOND_INPUT');
  refusedWith(() => decode(T('int', { list: true }), huge), 'LENGTH_BEYOND_INPUT');

  refusedWith(() => decode(T('text'), new Uint8Array(4)), 'SHORT_INPUT');
  refusedWith(() => decode(T('text'), encode(T('text'), 'hi').slice(0, 9)), 'LENGTH_BEYOND_INPUT');

  const bad = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 1, 0xff);
  refusedWith(() => decode(T('text'), bad), 'NOT_UTF8');

  const trailing = new Uint8Array([...encode(T('bool'), true), 0]);
  refusedWith(() => decode(T('bool'), trailing), 'TRAILING_BYTES');

  refusedWith(() => decode(T('nothing'), new Uint8Array(0)), 'UNKNOWN_TYPE');
  refusedWith(() => encode(T('nothing'), 1n), 'UNKNOWN_TYPE');
});
