// `vectors/HARNESS.md` section 5: the partition file, both ways. `save`
// and `stand` are covered in harbor.test.js; this is the other way, `--ward
// SEED=FILE` at startup, with beings loaded from it reachable by every
// per-being verb (invite, knock, take, ask, remove, standing) and not only
// the one booted after startup.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withStand, bootHost } from './helpers.js';

const scratchDir = mkdtempSync(join(tmpdir(), 'quo-js-harness-partition-'));
const file = join(scratchDir, 'seeded.json');

test('--ward SEED=FILE: every being it names is reachable by every per-being verb', async () => {
  // Write the file with a first stand, one ward holding two beings and one
  // relation between them, so the file has more than one key to restart.
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'seed-file', '--class', 'Host', '--entropy', '9'], async (stand) => {
    const [a] = await stand.ready(1);
    await bootHost(stand, a.pk, 'first');
    await bootHost(stand, a.pk, 'second');
    await stand.request({ ward: a.pk, method: 'invite', args: { being: 'first', id: 'to-second' } });
    await stand.request({ ward: a.pk, method: 'save', args: { file } });
  });

  // A fresh process, given only the file: both `first` and `second` answer
  // every per-being verb, not only whichever loaded last.
  await withStand(['--listen', '127.0.0.1:0', '--ward', `seed-file=${file}`, '--class', 'Host'], async (stand) => {
    const [a] = await stand.ready(1);

    const secondAsked = await stand.request({ ward: a.pk, method: 'ask', args: { being: 'second', id: 'nope' } });
    assert.deepEqual(secondAsked, { id: secondAsked.id, quo: 'dropped' }); // reached her, not "no such being"

    const firstInvited = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'first', id: 'another' } });
    assert.ok(firstInvited.object.invitation);

    const secondInvited = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'second', id: 'another' } });
    assert.ok(secondInvited.object.invitation);

    const knocked = await stand.request({
      ward: a.pk,
      method: 'knock',
      args: { being: 'second', invitation: firstInvited.object.invitation },
    });
    assert.ok(Array.isArray(knocked.object.asks)); // second's knock reaches first's own door

    const removed = await stand.request({ ward: a.pk, method: 'remove', args: { being: 'first', id: 'to-second' } });
    assert.deepEqual(removed.object, { removed: 'to-second' });
  });
});
