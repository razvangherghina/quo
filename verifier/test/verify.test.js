// The verifier's own helpers, and the proof that it can fail: a kit wrong on purpose is failed, and the
// same kit unaltered is passed.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { aesOpen, edVerify, hkdf, x25519, x25519Pub } from '../primitives.js';
import { follow, nest, newKey, payloadBytes, sealAsk, SIZE, verify, wardKeys } from '../verify.js';

const kit = join(import.meta.dirname, '../../examples/javascript');
const stand = join(kit, 'stand');
const badStand = join(import.meta.dirname, 'bad-stand.js');

test('The ward key. A ward key is the same for the same seed text, and is its signing key then its padlock', () => {
  const a = wardKeys('Alice');
  assert.equal(a.pk, wardKeys('Alice').pk);
  assert.notEqual(a.pk, wardKeys('Bob').pk);
  assert.equal(a.pk.length, 128);
  assert.equal(a.pk.slice(0, 64), a.signPk.toString('hex'));
  assert.equal(a.pk.slice(64), a.padlock.toString('hex'));
});

test('The size. A box is sealed to the size the spec names', () => {
  assert.equal(SIZE, 1048576);
});

test('The payload. A payload is written in the order the spec gives, and what is set changes only its field', () => {
  const base = { to: 'null', by: '"aa"', next: 'null', seq: '1' };
  assert.equal(payloadBytes(base, {}).toString(), '{"to":null,"by":"aa","next":null,"seq":1}');
  assert.equal(
    payloadBytes(base, { method: 'hi', args: '{}' }).toString(),
    '{"to":null,"by":"aa","next":null,"seq":1,"method":"hi","args":{}}',
  );
  assert.equal(
    payloadBytes(base, { set: { seq: '2', next: undefined } }).toString(),
    '{"to":null,"by":"aa","seq":2}',
  );
});

test('The box. A box the verifier seals opens under the keys the spec derives, head and body', () => {
  const ward = wardKeys('Box');
  const edge = Buffer.alloc(32, 7);
  const head = Buffer.alloc(32, 9);
  const body = Buffer.from('the body');
  const { box, lidSecret } = sealAsk({ padlock: ward.padlock, head, edge, body });
  const lid = box.subarray(0, 32);
  assert.deepEqual(lid, x25519Pub(lidSecret));
  const agr = x25519(ward.scalar, lid);
  assert.deepEqual(aesOpen(hkdf(agr, 'quo-seal', 44), lid, box.subarray(32, 32 + 32 + 16)), head);
  assert.deepEqual(
    aesOpen(hkdf(Buffer.concat([agr, edge]), 'quo-edge-seal', 44), lid, box.subarray(32 + 32 + 16)),
    body,
  );
});

test('The edge key. A key follows from the edge key and an agreement, and is thirty-two bytes', () => {
  const next = follow(Buffer.alloc(32, 1), Buffer.alloc(32, 2));
  assert.equal(next.length, 32);
  assert.notDeepEqual(next, follow(Buffer.alloc(32, 1), Buffer.alloc(32, 3)));
});

test('The signature. A key the verifier mints signs for its own public key alone', () => {
  const a = newKey();
  const b = newKey();
  assert.equal(a.hex.length, 64);
  assert.equal(edVerify(a.pk, Buffer.from('x'), Buffer.alloc(64)), false);
  assert.notEqual(a.hex, b.hex);
});

test('Values. A nest of the depth asked is that many brackets', () => {
  assert.equal(nest(3), '[[[1]]]');
  assert.equal(nest(2, 'null'), '[[null]]');
});

test('Case 1. A kit whose doors give a reply one byte short is failed in the strangers it meets, and the kit unaltered is passed', async () => {
  const good = await verify({ command: stand, cwd: kit, only: ['strangers'] });
  assert.equal(good.results.filter((r) => !r.ok).length, 0);
  const bad = await verify({
    command: 'node',
    args: [badStand, 'short', stand],
    cwd: kit,
    only: ['strangers'],
  });
  const failed = bad.results.filter((r) => !r.ok);
  assert.ok(failed.length > 0, 'the verifier failed nothing');
  assert.ok(
    failed.some((r) => r.name.startsWith('case 1:')),
    'no case 1 check failed',
  );
});

test('The verifier. A line on stdout that is no answer is a failure of the harness seam', async () => {
  const bad = await verify({
    command: 'node',
    args: [badStand, 'stray', stand],
    cwd: kit,
    only: ['the size'],
  });
  assert.ok(bad.results.some((r) => !r.ok && r.kind === 'harness'));
});
