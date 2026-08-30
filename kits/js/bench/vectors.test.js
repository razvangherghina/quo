import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { corpus } from '../emit-vectors.js';

const here = join(dirname(fileURLToPath(import.meta.url)), '..', 'vectors');
const emitted = corpus();

test('regenerating the corpus changes nothing that is checked in', () => {
  for (const [name, text] of Object.entries(emitted)) {
    assert.equal(readFileSync(join(here, name), 'utf8'), text, name);
  }
});

test('nothing sits in the corpus that the emitter does not write', () => {
  assert.deepEqual(readdirSync(here).sort(), Object.keys(emitted).sort());
});

test('a second run of the emitter is byte-identical to the first', () => {
  assert.deepEqual(corpus(), emitted);
});
