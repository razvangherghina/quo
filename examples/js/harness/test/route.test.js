// `route`, `quo/vectors/HARNESS.md` section 4: where a far pk this program
// does not stand is dialed, for every ward this program stands, and how a
// second `route` for one `far` replaces the first.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withStand, bootHost } from './helpers.js';

test('route: unreached with no route, reached once routed, and a second route replaces the first', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '23'], async (one) => {
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'b', '--class', 'Host', '--entropy', '29'], async (two) => {
      const [a] = await one.ready(1);
      const [b] = await two.ready(1);
      await bootHost(one, a.pk, 'h');
      await bootHost(two, b.pk, 'h');

      const invited = await one.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'far' } });
      assert.ok(invited.object.invitation);
      const invitation = invited.object.invitation;

      // No route yet on `two` for a.pk: the knock never leaves, so it ends
      // unreached.
      const beforeRoute = await two.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation, method: 'hello' } });
      assert.deepEqual(beforeRoute, { id: beforeRoute.id, quo: 'unreached' });

      // Routed at an address nothing answers on: still unreached, not an
      // exception on the channel.
      const wrongRoute = await two.request({ ward: b.pk, method: 'route', args: { far: a.pk, at: '127.0.0.1:1' } });
      assert.deepEqual(wrongRoute.object, { routed: a.pk });
      const stillUnreached = await two.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation, method: 'hello' } });
      assert.deepEqual(stillUnreached, { id: stillUnreached.id, quo: 'unreached' });

      // A second route for the same far pk replaces the first: routed at
      // a's real address, the knock reaches her over real TCP.
      const rightRoute = await two.request({ ward: b.pk, method: 'route', args: { far: a.pk, at: a.at } });
      assert.deepEqual(rightRoute.object, { routed: a.pk });
      const reached = await two.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation, method: 'hello' } });
      assert.deepEqual(reached.object, { hi: 'far' });
    });
  });
});
