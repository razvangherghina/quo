import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parse, print, canonicalBytes, digest, encode, Refusal } from '../src/index.js';

// The two blueprints the law writes out, copied byte for byte.
const TODO = `ToDo
  add(title text) item
  complete(id text) bool
  items() [item]
  members() [being]

item
  id text
  title text
  done bool
`;

const WARDEN = `Warden
  describe() estate
  sketch(being being) sketch?
  blueprint(digest b32) text?
  limit() int
  tell(word word)
  moved(being being) word?
  receive(cargo cargo) b32

estate
  classes [class]

class
  digest b32
  beings [held]

held
  being being
  commitment b32

sketch
  being being
  digest b32
  commitment b32

word
  being being?
  successor b32?
  commitment b32?
  name b32?
  padlock b32?
  hints [text]

cargo
  being being
  digest b32
  cells bytes
  standings [standing]

standing
  voice b32
  commitment b32
  beings [being]
  mark int
  padlock b32?
  hints [text]
`;

const hex = (bytes) => Buffer.from(bytes).toString('hex');

function refusedWith(text, code) {
  assert.throws(
    () => digest(text),
    (error) => error instanceof Refusal && error.code === code,
    `expected ${code} for ${JSON.stringify(text)}`,
  );
}

test('the law’s own blueprints parse and print back byte for byte', () => {
  for (const text of [TODO, WARDEN]) {
    assert.equal(print(parse(text)), text);
    assert.deepEqual(canonicalBytes(text), new TextEncoder().encode(text));
  }
});

test('the digest is SHA-256 over the canonical bytes', async () => {
  for (const text of [TODO, WARDEN]) {
    const expected = createHash('sha256').update(Buffer.from(text, 'utf8')).digest();
    assert.equal(hex(await digest(text)), hex(expected));
    assert.equal((await digest(text)).length, 32);
  }
});

test('a blueprint digests the same from its text and from its structure', async () => {
  assert.equal(hex(await digest(TODO)), hex(await digest(parse(TODO))));
  assert.equal(hex(await digest(WARDEN)), hex(await digest(parse(WARDEN))));
});

test('the digests are stable', async () => {
  assert.equal(
    hex(await digest(TODO)),
    '44c9b17ff1a0ede4fc5a2ce62b932a0b7c3353e1c146078fa7767cde94df79e7',
  );
  assert.equal(
    hex(await digest(WARDEN)),
    '096116df788a2618e5f7629e6c31057bf369b5e60f3e5071909befcaa2b7402d',
  );
});

test('b32 is a closed type of its own, and being is its one specialised case', async () => {
  canonical('ToDo\n  seal(digest b32) b32\n');
  canonical('ToDo\n  many() [b32]\n');
  // Two texts naming different types are two classes, however alike they ride.
  assert.notEqual(
    hex(await digest('ToDo\n  seal(digest b32) b32\n')),
    hex(await digest('ToDo\n  seal(digest being) being\n')),
  );
  refusedWith('ToDo\n  seal(digest b33) bool\n', 'UNKNOWN_TYPE');
});

test('a field may answer nothing in the Warden blueprint too', () => {
  const warden = parse(WARDEN);
  assert.equal(warden.fields.find((f) => f.name === 'tell').answer, null);
  assert.equal(warden.fields.find((f) => f.name === 'receive').answer.base, 'b32');
});

test('field order is part of the identity', async () => {
  const swapped = TODO.replace(
    '  add(title text) item\n  complete(id text) bool\n',
    '  complete(id text) bool\n  add(title text) item\n',
  );
  assert.notEqual(swapped, TODO);
  assert.notEqual(hex(await digest(swapped)), hex(await digest(TODO)));
});

test('a class name is part of the identity', async () => {
  assert.notEqual(hex(await digest(TODO.replace('ToDo', 'Todo'))), hex(await digest(TODO)));
});

test('non-canonical texts are refused', () => {
  refusedWith(TODO.slice(0, -1), 'NO_FINAL_NEWLINE');
  refusedWith(TODO + '\n', 'TRAILING_BLANK_LINE');
  refusedWith(TODO.replace('  add(', '   add('), 'BAD_INDENT');
  refusedWith(TODO.replace('  add(', ' add('), 'BAD_INDENT');
  refusedWith(TODO.replace('items() [item]', 'items() [item] '), 'TRAILING_SPACE');
  refusedWith(TODO.replace('add(title text)', 'add(title  text)'), 'DOUBLE_SPACE');
  refusedWith(TODO.replace('items() [item]', 'items()  [item]'), 'DOUBLE_SPACE');
  refusedWith(TODO.replace('\n\nitem', '\n\n\nitem'), 'BLANK_LINE');
  refusedWith(TODO.replace('\n\nitem', '\nitem'), 'MISSING_BLANK_LINE');
  refusedWith(TODO.replace('  add', '\tadd'), 'TAB');
  refusedWith(TODO.replaceAll('\n', '\r\n'), 'CARRIAGE_RETURN');
  refusedWith('\u{feff}' + TODO, 'BYTE_ORDER_MARK');
  refusedWith('\n' + TODO, 'BLANK_LINE');
  refusedWith('', 'EMPTY_TEXT');
});

test('there are no comments at all', () => {
  refusedWith(TODO.replace('ToDo\n', 'ToDo\n  # a list\n'), 'COMMENT');
  refusedWith('# a list\n' + TODO, 'COMMENT');
});

test('only the closed types and the records the blueprint declares exist', () => {
  refusedWith(TODO.replace('complete(id text) bool', 'complete(id text) float'), 'UNKNOWN_TYPE');
  refusedWith(TODO.replace('add(title text) item', 'add(title text) thing'), 'UNKNOWN_TYPE');
});

test('a block nothing uses, an empty block and a repeated name are refused', () => {
  refusedWith(TODO + '\nspare\n  x text\n', 'UNUSED_RECORD');
  refusedWith('ToDo\n', 'EMPTY_BLOCK');
  refusedWith('ToDo\n  items() [item]\n\nitem\n  id text\n\nitem\n  id text\n', 'DUPLICATE_BLOCK');
  refusedWith('ToDo\n  limit() int\n  limit() int\n', 'DUPLICATE_FIELD');
});

test('a byte order mark is refused in the bytes, not stripped out of them', () => {
  // A mark stripped would be a second way to write one text, and this protocol
  // names things by the hash of their bytes.
  const marked = new TextEncoder().encode('﻿' + TODO);
  assert.throws(
    () => parse(marked),
    (error) => error instanceof Refusal && error.code === 'BYTE_ORDER_MARK',
  );
});

test('a class or a record wearing the name of a closed type is refused', () => {
  const closed = ['bool', 'int', 'text', 'bytes', 'b32', 'being', 'invitation', 'card'];
  for (const name of closed) {
    refusedWith(`${name}\n  one() bool\n`, 'CLOSED_TYPE_NAME');
    refusedWith(`Thing\n  one() ${name}\n\n${name}\n  at int\n`, 'CLOSED_TYPE_NAME');
  }
  // The same two shapes with a name outside the closed set stand, so what the
  // refusal is about is the name and nothing else.
  assert.equal(print(parse('Thing\n  one() bool\n')), 'Thing\n  one() bool\n');
  assert.equal(
    print(parse('Thing\n  one() row\n\nrow\n  at int\n')),
    'Thing\n  one() row\n\nrow\n  at int\n',
  );
});

const canonical = (text) => assert.equal(print(parse(text)), text);

test('an identifier is ASCII: a letter, then letters and digits', () => {
  canonical('ToDo\n  item2(title text) bool\n');
  canonical('ToDo\n  a1B2c3() bool\n');
  refusedWith('ToDo\n  add_item(title text) bool\n', 'BAD_IDENTIFIER');
  refusedWith('ToDo\n  add-item(title text) bool\n', 'BAD_IDENTIFIER');
  refusedWith('ToDo\n  2add(title text) bool\n', 'BAD_IDENTIFIER');
  refusedWith('ToDo\n  état(title text) bool\n', 'BAD_IDENTIFIER');
  refusedWith('ToDo\n  add(1title text) bool\n', 'BAD_IDENTIFIER');
  refusedWith('ToDo\n  add(title tëxt) bool\n', 'BAD_IDENTIFIER');
  refusedWith('2Do\n  add(title text) bool\n', 'BAD_IDENTIFIER');
});

test('two arguments separate with a comma and one space, and with nothing else', () => {
  canonical('ToDo\n  add(title text, due int) bool\n');
  canonical('ToDo\n  add(title text, due int, tags [text]) bool\n');
  refusedWith('ToDo\n  add(title text,due int) bool\n', 'MALFORMED_ARGUMENT');
  refusedWith('ToDo\n  add(title text due int) bool\n', 'MALFORMED_ARGUMENT');
  refusedWith('ToDo\n  add(title text ,due int) bool\n', 'MALFORMED_ARGUMENT');
  refusedWith('ToDo\n  add(title text,  due int) bool\n', 'DOUBLE_SPACE');
});

test('every class field carries parentheses and no record field does', () => {
  canonical('ToDo\n  limit() int\n');
  refusedWith('ToDo\n  limit int\n', 'MALFORMED_FIELD');
  refusedWith('ToDo\n  items() [item]\n\nitem\n  id() text\n', 'MALFORMED_FIELD');
});

test('a field may answer nothing, and answers zero bytes', () => {
  canonical('ToDo\n  ping()\n');
  canonical('ToDo\n  clear(id text)\n');
  const blueprint = parse('ToDo\n  ping()\n');
  assert.equal(blueprint.fields[0].answer, null);
  assert.equal(encode({ base: 'text' }, '').length, 8);
});

test('the two combinators compose freely', () => {
  for (const written of ['[text?]', '[text]?', '[[text]]', '[[text]?]?', '[[[int]]]']) {
    canonical(`ToDo\n  items() ${written}\n`);
  }
  refusedWith('ToDo\n  items() [text\n', 'MALFORMED_TYPE');
  refusedWith('ToDo\n  items() te]xt\n', 'MALFORMED_TYPE');
});

test('the record blocks follow in order of first use, depth-first', () => {
  const text = 'Warden\n  a() one\n  b() three\n\none\n  x two\n\ntwo\n  y int\n\nthree\n  z int\n';
  canonical(text);
  // The same class with the blocks in any other order is a second text for
  // one meaning, so it is refused rather than accepted and reprinted.
  const swapped =
    'Warden\n  a() one\n  b() three\n\none\n  x two\n\nthree\n  z int\n\ntwo\n  y int\n';
  // That refused order is exactly the breadth-first one: `two` is reached
  // through `one`, so depth-first puts it before `three`.
  refusedWith(swapped, 'RECORD_ORDER');
  // The Warden blueprint the law writes is already in this order.
  canonical(WARDEN);
});

test('a record may not reach itself, directly or through another', () => {
  refusedWith('ToDo\n  items() [node]\n\nnode\n  next node\n', 'RECORD_RECURSION');
  refusedWith(
    'ToDo\n  items() [node]\n\nnode\n  child leaf\n\nleaf\n  parent node\n',
    'RECORD_RECURSION',
  );
  refusedWith('ToDo\n  items() [node]\n\nnode\n  next [node]\n', 'RECORD_RECURSION');
  refusedWith('ToDo\n  items() [node]\n\nnode\n  next node?\n', 'RECORD_RECURSION');
});

test('a record may hold a record that holds no record', () => {
  const text =
    'Warden\n  describe() estate\n\nestate\n  classes [class]\n\nclass\n  digest bytes\n';
  assert.equal(print(parse(text)), text);
});
