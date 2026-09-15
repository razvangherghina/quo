// `vectors/HARNESS.md` section 1 and `SPEC.md` chapter 6: the stand
// program's own TCP listener, reached over a real socket by a far ward that
// dials in, and two stand programs standing on two real addresses at once.
//
// The dialer here is an ordinary kit ward and not a `stand` program, so
// the listener is proven from outside the harness: the `stand` program's
// listener is chapter 6's carrier exactly, reached on a real socket by the
// same dialer `../../test/wire.test.js` proves a raw ward answers. Two
// `stand` programs reaching each other through `route` is
// `route-e2e.test.js`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryHarbor, random } from '../../src/harbor.js';
import { emptyPartition } from '../../src/partition.js';
import { dial } from '../../src/tcp.js';
import { Host } from '../beings.js';
import { withStand } from './helpers.js';

// The same shape `../../test/wire.test.js` uses: a harbor that reaches
// its own wards itself and everything else down the dialer it holds.
class Dialing extends MemoryHarbor {
  constructor(ground, dialer) {
    super(ground);
    this.dialer = dialer;
  }
  async carry(pk, bytes) {
    return (await super.carry(pk, bytes)) ?? this.dialer.carry(pk, bytes);
  }
}

test('a far ward dials the stand program and invites, knocks, takes and asks over real TCP', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '5'], async (stand) => {
    const [a] = await stand.ready(1);
    const boot = await stand.request({ ward: a.pk, method: 'boot', args: { key: 'h', class: 'Host' } });
    assert.deepEqual(boot.object, { booted: 'h' });

    const [host, portText] = a.at.split(':');
    const dialer = dial({ host, port: Number(portText) });
    try {
      const far = new Dialing({ classes: { Host }, random }, dialer);
      const B = await far.boot('far-ward', emptyPartition());
      await B.ask('boot', { key: 'guest', class: 'Host' });

      const invited = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'far' } });
      assert.ok(invited.object.invitation);

      const knocked = await B.ask('knock', {
        being: 'guest',
        id: 'a',
        invitation: invited.object.invitation,
        method: 'hello',
      });
      assert.deepEqual(knocked.answer, { hi: 'far' });
      assert.equal(knocked.taken, 'a');

      const asked = await B.ask('ask', { being: 'guest', id: 'a', method: 'echo', args: { over: 'tcp' } });
      assert.deepEqual(asked, { over: 'tcp' });
    } finally {
      await dialer.close();
    }
  });
});

test('stop: her pk answers kind 02 over the real wire from then on', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '5'], async (stand) => {
    const [a] = await stand.ready(1);
    await stand.request({ ward: a.pk, method: 'boot', args: { key: 'h', class: 'Host' } });
    await stand.request({ ward: a.pk, method: 'stop' });

    const [host, portText] = a.at.split(':');
    const dialer = dial({ host, port: Number(portText) });
    try {
      const reply = await dialer.carry(a.pk, new Uint8Array([1, 2, 3]));
      assert.equal(reply, null); // kind 02, not delivered
    } finally {
      await dialer.close();
    }
  });
});

test('two stand programs stand at once, on two real addresses, each answering its own root channel', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '11'], async (one) => {
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'b', '--class', 'Host', '--entropy', '13'], async (two) => {
      const [a] = await one.ready(1);
      const [b] = await two.ready(1);
      assert.notEqual(a.at, b.at);
      assert.notEqual(a.pk, b.pk);

      const bootA = await one.request({ ward: a.pk, method: 'boot', args: { key: 'h', class: 'Host' } });
      const bootB = await two.request({ ward: b.pk, method: 'boot', args: { key: 'h', class: 'Host' } });
      assert.deepEqual(bootA.object, { booted: 'h' });
      assert.deepEqual(bootB.object, { booted: 'h' });
    });
  });
});
