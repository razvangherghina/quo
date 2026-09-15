// The harbor's verbs, `vectors/HARNESS.md` section 4.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withStand, bootHost } from './helpers.js';

const scratchDir = mkdtempSync(join(tmpdir(), 'quo-js-harness-'));
const scratch = (name) => join(scratchDir, `${name}.json`);

test('stop: her pk answers no such ward, and every other ward still answers', async () => {
  const spec = ['--listen', '127.0.0.1:0', '--ward', 'a', '--ward', 'b', '--class', 'Host', '--entropy', '1'];
  await withStand(spec, async (stand) => {
    const [a, b] = await stand.ready(2);
    const stopped = await stand.request({ ward: a.pk, method: 'stop' });
    assert.deepEqual(stopped.object, { stopped: a.pk });

    const afterStop = await stand.request({ ward: a.pk, method: 'boom' });
    assert.deepEqual(afterStop.object, { error: 'no such ward' });

    const stillUp = await stand.request({ ward: b.pk });
    assert.ok(Array.isArray(stillUp.object.asks));
  });
});

test('forget: a forgotten occupant record makes the door say removed after stand', async () => {
  const spec = ['--listen', '127.0.0.1:0', '--ward', 'a', '--ward', 'b', '--class', 'Host', '--entropy', '1'];
  await withStand(spec, async (stand) => {
    const [a, b] = await stand.ready(2);
    await bootHost(stand, a.pk, 'h');
    await bootHost(stand, b.pk, 'h');
    const { invitation } = (await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } })).object;
    const knocked = await stand.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation, method: 'hello' } });
    assert.deepEqual(knocked.object, { hi: 'b' });
    await stand.request({ ward: b.pk, method: 'take', args: { being: 'h', id: 'a', invitation } });

    const running = await stand.request({ ward: a.pk, method: 'forget', args: { being: 'h', id: 'b' } });
    assert.deepEqual(running.object, { error: 'running' });

    await stand.request({ ward: a.pk, method: 'stop' });
    const none = await stand.request({ ward: a.pk, method: 'forget', args: { being: 'h', id: 'nobody' } });
    assert.deepEqual(none.object, { forgot: null });
    const forgot = await stand.request({ ward: a.pk, method: 'forget', args: { being: 'h', id: 'b' } });
    assert.deepEqual(forgot.object, { forgot: 'b' });
    await stand.request({ ward: a.pk, method: 'stand' });

    // The door kept no key for a removed id: `removed` is empty and the heir
    // still stands, so the word comes from the missing record alone.
    const partition = JSON.parse((await stand.request({ ward: a.pk, method: 'digest' })).object.digest);
    assert.deepEqual(partition.removed, {});
    assert.equal(Object.keys(partition.heirs).length, 1);
    assert.ok(!Object.hasOwn(partition.beings.h.occupants, 'b'));

    const asked = await stand.request({ ward: b.pk, method: 'ask', args: { being: 'h', id: 'a', method: 'hello' } });
    assert.deepEqual(asked, { id: asked.id, quo: 'removed' });
  });
});

test('digest: equal when nothing was written between two answers, and differs after a write', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    await bootHost(stand, a.pk, 'h');
    const before = await stand.request({ ward: a.pk, method: 'digest' });
    const again = await stand.request({ ward: a.pk, method: 'digest' });
    assert.equal(before.object.digest, again.object.digest);

    await stand.request({ ward: a.pk, method: 'ask', args: { being: 'h', id: 'x' } }); // no such standing, no write
    await stand.request({ ward: a.pk, method: 'boot', args: { key: 'h2', class: 'Host' } });
    const after = await stand.request({ ward: a.pk, method: 'digest' });
    assert.notEqual(before.object.digest, after.object.digest);
  });
});

test('save and stand: the file round-trips the same ward, and a per-being verb still reaches her', async () => {
  const file = scratch('save-stand');
  try {
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'seed-one', '--class', 'Host', '--entropy', '7'], async (stand) => {
      const [a] = await stand.ready(1);
      await bootHost(stand, a.pk, 'h');
      await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'friend' } });

      const saved = await stand.request({ ward: a.pk, method: 'save', args: { file } });
      assert.deepEqual(saved.object, { saved: file });
      const onDisk = JSON.parse(readFileSync(file, 'utf8'));
      assert.ok(Object.hasOwn(onDisk.beings, 'h'));

      const stopped = await stand.request({ ward: a.pk, method: 'stop' });
      assert.deepEqual(stopped.object, { stopped: a.pk });

      const stood = await stand.request({ ward: a.pk, method: 'stand', args: { file } });
      assert.equal(stood.object.stood, a.pk); // same seed, same pk
      assert.equal(stood.object.at, a.at); // no `listen` arg: stands where she stood

      // `h`, loaded back from the file, answers every per-being verb again:
      // an `ask` on an id she never held a standing for is her own kit's
      // `dropped` (SPEC.md "What her ward tells her"), which still needs her
      // reached to answer at all.
      const asked = await stand.request({ ward: a.pk, method: 'ask', args: { being: 'h', id: 'nope' } });
      assert.deepEqual(asked, { id: asked.id, quo: 'dropped' });
      const invited = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'someone' } });
      assert.ok(invited.object.invitation);
    });
  } finally {
    rmSync(file, { force: true });
  }
});

test('stand: listen moves the ward to a new address', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    await stand.request({ ward: a.pk, method: 'stop' });
    const stood = await stand.request({ ward: a.pk, method: 'stand', args: { listen: '127.0.0.1:0' } });
    assert.equal(stood.object.stood, a.pk);
    assert.notEqual(stood.object.at, a.at);
    const blueprint = await stand.request({ ward: a.pk });
    assert.ok(Array.isArray(blueprint.object.asks));
  });
});

test('copy: a second ward of one pk on a second listener, told apart by at', async () => {
  const file = scratch('copy');
  try {
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'seed-two', '--class', 'Host', '--entropy', '3'], async (stand) => {
      const [a] = await stand.ready(1);
      await bootHost(stand, a.pk, 'h');
      await stand.request({ ward: a.pk, method: 'save', args: { file } });

      const copied = await stand.request({ ward: a.pk, method: 'copy', args: { file, listen: '127.0.0.1:0' } });
      assert.equal(copied.object.copy, a.pk);
      assert.notEqual(copied.object.at, a.at);

      // Told apart by `at`: the original still answers at its own address,
      // and so does the copy at its own, both under the one pk.
      const original = await stand.request({ ward: a.pk, at: a.at, method: 'boot', args: { key: 'only-original', class: 'Host' } });
      assert.deepEqual(original.object, { booted: 'only-original' });
      const onCopy = await stand.request({ ward: a.pk, at: copied.object.at, method: 'boot', args: { key: 'only-original', class: 'Host' } });
      assert.deepEqual(onCopy.object, { booted: 'only-original' }); // the copy never saw the original's boot
    });
  } finally {
    rmSync(file, { force: true });
  }
});

test('hold: the next n outbound asks never leave and are never settled, so the asker ends as late', async () => {
  const spec = ['--listen', '127.0.0.1:0', '--ward', 'a', '--ward', 'b', '--class', 'Host', '--entropy', '1'];
  await withStand(spec, async (stand) => {
    const [a, b] = await stand.ready(2);
    await bootHost(stand, a.pk, 'h');
    await bootHost(stand, b.pk, 'h');
    const invited = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } });

    const held = await stand.request({ ward: b.pk, method: 'hold', args: { asks: 1 } });
    assert.deepEqual(held.object, { holding: 1 });

    const knocked = await stand.request({
      ward: b.pk,
      method: 'knock',
      args: { being: 'h', invitation: invited.object.invitation, method: 'hello', wanted: 200 },
    });
    assert.deepEqual(knocked, { id: knocked.id, quo: 'late' });

    // Spent: the next knock leaves for real. The first knock may have been
    // heard for all she knows, so she asks under her own key first, meets
    // silence, and knocks as the heir.
    const again = await stand.request({
      ward: b.pk,
      method: 'knock',
      args: { being: 'h', invitation: invited.object.invitation, method: 'hello' },
    });
    assert.deepEqual(again.object, { hi: 'b' });
  });
});

test('drop: the next n replies never reach the asker, who ends as late', async () => {
  const spec = ['--listen', '127.0.0.1:0', '--ward', 'a', '--ward', 'b', '--class', 'Host', '--entropy', '1'];
  await withStand(spec, async (stand) => {
    const [a, b] = await stand.ready(2);
    await bootHost(stand, a.pk, 'h');
    await bootHost(stand, b.pk, 'h');
    const invited = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } });

    const dropped = await stand.request({ ward: a.pk, method: 'drop', args: { replies: 1 } });
    assert.deepEqual(dropped.object, { dropping: 1 });

    const knocked = await stand.request({
      ward: b.pk,
      method: 'knock',
      args: { being: 'h', invitation: invited.object.invitation, method: 'hello', wanted: { time: 200 } },
    });
    assert.deepEqual(knocked, { id: knocked.id, quo: 'late' });
  });
});
