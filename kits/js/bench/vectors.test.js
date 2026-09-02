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

test('every commitment in the corpus derives from keys the corpus publishes', async () => {
  const { material } = JSON.parse(readFileSync(join(here, 'material.json'), 'utf8'));
  const of = (name) => Buffer.from(material[name], 'hex');
  const commits = async (warden, heir) =>
    Buffer.from(
      await crypto.subtle.digest('SHA-256', Buffer.concat([of(warden), of(heir)])),
    ).toString('hex');

  // Article VII: warden pk then heir pk. Every heir here spends at this one door.
  assert.equal(await commits('wardenName', 'wardenHeir'), material.wardenCommitment);
  assert.equal(await commits('wardenName', 'beingHeir'), material.beingCommitment);
  assert.equal(await commits('wardenName', 'voiceHeir'), material.voiceHeirCommitment);
  assert.equal(await commits('wardenName', 'nextHeir'), material.nextHeirCommitment);
});
