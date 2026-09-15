// `vectors/HARNESS.md` section 6: `--entropy` fixes the SplitMix64
// stream at a seed; without it the harbor draws real entropy.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withStand, bootHost } from './helpers.js';

// Two wards of one seed, under one fixed entropy seed, mint the same key at
// invite: the stream is seeded once and drawn in the order the ward makes
// its draws (section 6), so a kit run twice on one seed and one script
// draws one set of bytes.
test('--entropy: one seed reproduces the same draws', async () => {
  const invite = async () => {
    let invitation;
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', '42'], async (stand) => {
      const [a] = await stand.ready(1);
      await bootHost(stand, a.pk, 'h');
      const out = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'friend' } });
      invitation = out.object.invitation;
    });
    return invitation;
  };
  const [first, second] = await Promise.all([invite(), invite()]);
  assert.deepEqual(first, second);
});

test('--entropy: a different seed draws different bytes', async () => {
  const invite = async (seed) => {
    let invitation;
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host', '--entropy', seed], async (stand) => {
      const [a] = await stand.ready(1);
      await bootHost(stand, a.pk, 'h');
      const out = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'friend' } });
      invitation = out.object.invitation;
    });
    return invitation;
  };
  const [a, b] = await Promise.all([invite('1'), invite('2')]);
  assert.notDeepEqual(a, b);
});

// Without `--entropy` the harbor draws from the operating system: two wards
// of one seed, standing twice, mint two different keys at invite.
test('no --entropy: the operating system draws different bytes each run', async () => {
  const invite = async () => {
    let invitation;
    await withStand(['--listen', '127.0.0.1:0', '--ward', 'a', '--class', 'Host'], async (stand) => {
      const [a] = await stand.ready(1);
      await bootHost(stand, a.pk, 'h');
      const out = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'friend' } });
      invitation = out.object.invitation;
    });
    return invitation;
  };
  const [first, second] = await Promise.all([invite(), invite()]);
  assert.notDeepEqual(first, second);
});
