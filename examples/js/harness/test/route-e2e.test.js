// Two `stand` programs of this kit, on two real addresses, routed to each
// other over the root channel of `quo/vectors/HARNESS.md` section 2, where
// a being on one invites and a being on the other knocks, takes and asks
// over real TCP.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withStand, bootHost } from './helpers.js';

test('two stand programs routed to each other invite, knock, take and ask over real TCP', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '31'], async (one) => {
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'b', '--class', 'Host', '--entropy', '37'], async (two) => {
      const [a] = await one.ready(1);
      const [b] = await two.ready(1);
      await bootHost(one, a.pk, 'h');
      await bootHost(two, b.pk, 'h');

      // Each program's carrier is told where the other's listener stands.
      const routedOne = await one.request({ ward: a.pk, method: 'route', args: { far: b.pk, at: b.at } });
      assert.deepEqual(routedOne.object, { routed: b.pk });
      const routedTwo = await two.request({ ward: b.pk, method: 'route', args: { far: a.pk, at: a.at } });
      assert.deepEqual(routedTwo.object, { routed: a.pk });

      // A's h invites B's h under the id `b`.
      const invited = await one.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } });
      assert.ok(invited.object.invitation);
      const invitation = invited.object.invitation;

      // B's h knocks with it, reaching A over the route on a real socket.
      const knocked = await two.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation, method: 'hello' } });
      assert.deepEqual(knocked.object, { hi: 'b' });

      // B takes the invitation as `a` and asks on the standing, twice, over
      // the same route.
      const taken = await two.request({ ward: b.pk, method: 'take', args: { being: 'h', id: 'a', invitation } });
      assert.deepEqual(taken.object, { taken: 'a' });
      const asked = await two.request({ ward: b.pk, method: 'ask', args: { being: 'h', id: 'a', method: 'echo', args: { over: 'route' } } });
      assert.deepEqual(asked.object, { over: 'route' });
      const askedAgain = await two.request({ ward: b.pk, method: 'ask', args: { being: 'h', id: 'a', method: 'hello' } });
      assert.deepEqual(askedAgain.object, { hi: 'b' });
    });
  });
});
