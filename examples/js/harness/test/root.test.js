// The root channel of `vectors/HARNESS.md` section 2: the requests every
// adapter answers, and the six named refusals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withStand, bootHost } from './helpers.js';

test('the empty ask answers the ward blueprint, and boom is silence', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);

    const blueprint = await stand.request({ ward: a.pk });
    assert.ok(Array.isArray(blueprint.object.asks));
    assert.ok(blueprint.object.asks.some((ask) => ask.name === 'boot'));

    const boomed = await stand.request({ ward: a.pk, method: 'boom' });
    assert.deepEqual(boomed, { id: boomed.id, silence: true });
  });
});

test('a request for a ward this program does not stand', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    await stand.ready(1);
    const out = await stand.request({ ward: '0'.repeat(128) });
    assert.deepEqual(out.object, { error: 'no such ward' });
  });
});

test('boot: no such class', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    const out = await stand.request({ ward: a.pk, method: 'boot', args: { key: 'x', class: 'Nowhere' } });
    assert.deepEqual(out.object, { error: 'no such class' });
  });
});

test('boot: absent, a class that throws while it is made', async () => {
  const spec = ['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--class', 'Stillborn', '--entropy', '1'];
  await withStand(spec, async (stand) => {
    const [a] = await stand.ready(1);
    const out = await stand.request({ ward: a.pk, method: 'boot', args: { key: 'x', class: 'Stillborn' } });
    assert.deepEqual(out.object, { error: 'absent' });
  });
});

test('boot: key taken', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    await bootHost(stand, a.pk, 'h');
    const out = await stand.request({ ward: a.pk, method: 'boot', args: { key: 'h', class: 'Host' } });
    assert.deepEqual(out.object, { error: 'key taken' });
  });
});

test('boot with occupant and standing mints one real relation', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    await bootHost(stand, a.pk, 'm');
    const booted = await stand.request({
      ward: a.pk,
      method: 'boot',
      args: { maker: 'm', key: 'h', class: 'Host', occupant: 'occ', standing: 'stand' },
    });
    assert.deepEqual(booted.object, { booted: 'h' });

    // The made being holds the standing `stand` at her maker, and the maker
    // hears her as the occupant `occ`.
    const standing = await stand.request({ ward: a.pk, method: 'standing', args: { being: 'h', id: 'stand' } });
    assert.equal(standing.object.id, 'stand');
    const asked = await stand.request({ ward: a.pk, method: 'ask', args: { being: 'h', id: 'stand', method: 'hello' } });
    assert.deepEqual(asked.object, { hi: 'occ' });

    // No relation of the made being to herself: the maker holds no standing
    // `stand`, and the made being no occupant `occ`.
    const makerStanding = await stand.request({ ward: a.pk, method: 'standing', args: { being: 'm', id: 'stand' } });
    assert.deepEqual(makerStanding.object, { error: 'no such standing' });
    const selfOccupant = await stand.request({ ward: a.pk, method: 'remove', args: { being: 'h', id: 'occ' } });
    assert.deepEqual(selfOccupant.object, { removed: null });
  });
});

test('boot with a maker that is not there makes nobody', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    const out = await stand.request({
      ward: a.pk,
      method: 'boot',
      args: { maker: 'nobody', key: 'h', class: 'Host', occupant: 'occ', standing: 'stand' },
    });
    assert.deepEqual(out.object, { error: 'no such being' });
  });
});

test('invite: id taken', async () => {
  const spec = ['--listen', '127.0.0.1:0', '--ward', 'a', '--ward', 'b', '--class', 'Host', '--entropy', '1'];
  await withStand(spec, async (stand) => {
    const [a, b] = await stand.ready(2);
    await bootHost(stand, a.pk, 'h');
    await bootHost(stand, b.pk, 'h');
    const first = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } });
    assert.ok(first.object.invitation);
    const second = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } });
    assert.deepEqual(second.object, { error: 'id taken' });
  });
});

test('no such being: an unbooted key on every per-being verb', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    for (const method of ['invite', 'knock', 'take', 'ask', 'remove', 'standing']) {
      const out = await stand.request({ ward: a.pk, method, args: { being: 'nobody', id: 'x', invitation: {} } });
      assert.deepEqual(out.object, { error: 'no such being' }, method);
    }
  });
});

test('public: marks a booted being the ward\'s public one', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    await bootHost(stand, a.pk, 'pub');
    const marked = await stand.request({ ward: a.pk, method: 'public', args: { key: 'pub' } });
    assert.deepEqual(marked.object, { public: 'pub' });

    // A second mark of a different key, while `pub` still stands, is the
    // kit's own refusal, passed through as an ordinary object: it is not
    // one of HARNESS.md's six named refusals, so no translation is owed.
    await bootHost(stand, a.pk, 'other');
    const again = await stand.request({ ward: a.pk, method: 'public', args: { key: 'other' } });
    assert.deepEqual(again.object, { error: 'a public being stands' });
  });
});

test('standing on an id that names none: no such standing; ask on the same id: dropped', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '1'], async (stand) => {
    const [a] = await stand.ready(1);
    await bootHost(stand, a.pk, 'h');
    // `standing` (section 4) has no kit call of its own for "no standing
    // here": the adapter is the one place that tells it apart from "no such
    // being", so it stays its own refusal.
    const standing = await stand.request({ ward: a.pk, method: 'standing', args: { being: 'h', id: 'nope' } });
    assert.deepEqual(standing.object, { error: 'no such standing' });
    // `ask` (section 2) is the kit's own call: `stance.ask` answers `dropped`
    // for an id that never named a standing exactly as it does for one that
    // did and was removed (SPEC.md "What her ward tells her"). The adapter
    // asks nothing about it beforehand.
    const asked = await stand.request({ ward: a.pk, method: 'ask', args: { being: 'h', id: 'nope', method: 'hello' } });
    assert.deepEqual(asked, { id: asked.id, quo: 'dropped' });
  });
});
