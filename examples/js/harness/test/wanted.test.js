// `wanted` on the root channel of `vectors/HARNESS.md` section 2 is the
// allowance in milliseconds: an ask to `never` with wanted 200 ends `late`
// long before the kit's own default.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withStand, bootHost } from './helpers.js';

test('an ask with wanted 200 on never ends late', async () => {
  await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '41'], async (one) => {
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'b', '--class', 'Host', '--entropy', '43'], async (two) => {
      const [a] = await one.ready(1);
      const [b] = await two.ready(1);
      await bootHost(one, a.pk, 'h');
      await bootHost(two, b.pk, 'h');
      await two.request({ ward: b.pk, method: 'route', args: { far: a.pk, at: a.at } });

      const { invitation } = (await one.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } })).object;
      const knocked = await two.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation, method: 'hello' } });
      assert.deepEqual(knocked.object, { hi: 'b' });
      const taken = await two.request({ ward: b.pk, method: 'take', args: { being: 'h', id: 'a', invitation } });
      assert.deepEqual(taken.object, { taken: 'a' });

      const started = Date.now();
      const asked = await two.request({ ward: b.pk, method: 'ask', args: { being: 'h', id: 'a', method: 'never', wanted: 200 } });
      assert.equal(asked.quo, 'late', JSON.stringify(asked));
      assert.ok(Date.now() - started < 5000, 'ended by the 200 ms allowance, not the default');
    });
  });
});
