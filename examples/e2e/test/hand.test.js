// The hand standing as a ward, `quo/SCENARIOS.md` "A hand": each kit knocks
// at it with an invitation it minted, and its asker reads the reply the
// hand forges. A reply signed by a key that is not the hand's ward key is
// silence to the asker, and the same reply signed by the ward key is the
// object, so the silence is the signature's and nothing else's.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LISTEN_HOST, handAt } from '../src/world.js';
import { bootHost, startStand } from '../src/root-driver.js';
import { KIT_NAMES } from '../src/kits.js';
import { mintKey, standHand } from '../src/hand.js';

const ANSWER = JSON.stringify({ object: { hi: 'hand' }, seen: null });

for (const kit of KIT_NAMES) {
  test(`${kit}: the asker hears silence from a reply the hand forged`, async () => {
    const stand = startStand(kit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', '--class', 'Host']);
    let signer = mintKey();
    const hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer: () => ({ text: ANSWER, signer }) });
    try {
      const [b] = await stand.ready(1);
      await bootHost(stand, b.pk, 'h');
      const routed = await stand.request({ ward: b.pk, method: 'route', args: { far: hand.pk, at: handAt(hand.at) } });
      assert.equal(routed.object?.routed, hand.pk, JSON.stringify(routed));

      const forged = hand.invite();
      const silence = await stand.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation: forged, method: 'hello' } });
      assert.equal(silence.silence, true, `forged signer: ${JSON.stringify(silence)}`);
      const knock = hand.heard.at(-1);
      assert.ok(knock && knock.knock && knock.payload.to === forged.heir, 'the hand opened the knock');

      signer = null;
      const honest = hand.invite();
      const object = await stand.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation: honest, method: 'hello' } });
      assert.deepEqual(object.object, { hi: 'hand' }, `ward signer: ${JSON.stringify(object)}`);
    } finally {
      await Promise.all([stand.close(), hand.close()]);
    }
  });
}
