import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { encapsulate } from '../src/kem.js';

const framing = JSON.parse(readFileSync(new URL('../../../vectors/framing.json', import.meta.url), 'utf8'));
const lock = framing.vectors.find((v) => v.lock && v.m);

test('the ciphertext and shared secret of framing.json from its lock and m', () => {
  const out = encapsulate(Buffer.from(lock.lock, 'hex'), Buffer.from(lock.m, 'hex'));
  assert.equal(out.ciphertext.toString('hex'), lock.ciphertext);
  assert.equal(out.shared.toString('hex'), lock.shared);
});
