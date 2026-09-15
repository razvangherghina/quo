// `SCENARIOS.md` chapter 5, "The public being": one test per line, each
// run in both directions. Every test first runs its check on evidence where
// the line's claim is broken and shows it throws, then keeps the claim and
// shows the check holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bootHost } from '../src/root-driver.js';
import { mintKey } from '../src/hand.js';
import { Relation } from '../src/relation.js';
import { strangerLength } from '../src/lengths.js';
import { root, take } from '../src/standing.js';
import { DIRECTIONS } from '../src/kits.js';
import { askReplies, checkAnswered, checkObject, checkSilence, publicPayload, replayAsks, withEdge } from './support/s01.js';

// Names a `Host` booted under `pub` the public being of `ward` on `stand`.
async function makePublic(stand, ward) {
  await bootHost(stand, ward, 'pub');
  await root(stand, ward, 'public', { key: 'pub' });
}

// A's public being: a `Host` booted under `pub` and named at A's root.
function withPublic(kits, story) {
  return withEdge(kits, async (w) => {
    await makePublic(w.door, w.a.pk);
    return story(w);
  });
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  const kits = { doorKit, askerKit };
  const dir = `${doorKit} door, ${askerKit} asker`;

  test(`5.1 ${dir}: a stranger's ask with to null is answered {hi: null}`, () =>
    withEdge(kits, async (w) => {
      const d = w.dial();
      const key = mintKey();
      // Broken: A before its public being is named.
      const broken = await d.ask(w.a.pk, key, publicPayload(key));
      assert.throws(() => checkObject(broken.reply, { hi: null }));
      await makePublic(w.door, w.a.pk);
      checkObject((await d.ask(w.a.pk, key, publicPayload(key))).reply, { hi: null });
    }));

  test(`5.2 ${dir}: one sealed ask to the public being, replayed by the observer, is answered twice with two equal objects`, () =>
    withPublic(kits, async (w) => {
      const d = w.dial();
      let replay = false;
      replayAsks(w.observer, 'hand', () => replay);
      const check = (replies) => {
        assert.equal(replies.length, 2, 'two replies came back');
        for (const r of replies) checkObject(r);
        assert.deepEqual(replies[0].object, replies[1].object, 'the two objects are equal');
      };

      // Broken: the same replay of an ask on a relation, where the count
      // refuses the second.
      const rel = new Relation(d, w.a.pk, await w.invite('x'));
      checkObject((await rel.knock()).reply);
      replay = true;
      const broken = await askReplies(d, w.a.pk, rel.held, rel.payload(rel.held, { next: mintKey(), seq: 2 }), { edge: rel.edge });
      assert.throws(() => check(broken));

      const key = mintKey();
      check(await askReplies(d, w.a.pk, key, publicPayload(key)));
    }));

  test(`5.3 ${dir}: join answers an invitation; the stranger knocks, takes, and is answered {hi: "s"}; to null is still {hi: null}`, () =>
    withPublic(kits, async (w) => {
      const pub = { ward: w.a.pk };
      const checkInvitation = (knocked) => {
        checkAnswered(knocked, w.a.pk);
        const inv = knocked.result.object;
        assert.equal(inv?.ward, w.a.pk, 'the invitation names A');
        for (const field of ['heir', 'secret']) assert.match(inv[field] ?? '', /^[0-9a-f]{64}$/);
        assert.match(inv.lock ?? '', /^[0-9a-f]{2368}$/);
      };
      // Broken: `hello` asked of her in place of `join`.
      const broken = await w.during(() => w.knock(pub));
      assert.throws(() => checkInvitation(broken));
      const joined = await w.during(() => w.knock(pub, 'join', { id: 's' }));
      checkInvitation(joined);
      await take(w.asker, w.b.pk, 'p', pub);

      const invitation = joined.result.object;
      const knocked = await w.knock(invitation);
      assert.ok(knocked.object, `setup: knock: ${JSON.stringify(knocked)}`);
      await take(w.asker, w.b.pk, 'a', invitation);
      const named = await w.during(() => w.ask('a'));
      const stranger = await w.during(() => w.ask('p'));

      // Each answer is the other's broken evidence: an occupant heard as
      // nobody, and a stranger heard as the occupant.
      assert.throws(() => checkAnswered(stranger, w.a.pk, { hi: 's' }));
      checkAnswered(named, w.a.pk, { hi: 's' });
      assert.throws(() => checkAnswered(named, w.a.pk, { hi: null }));
      checkAnswered(stranger, w.a.pk, { hi: null });
    }));

  test(`5.4 ${dir}: with no public being, an ask to nobody is silence`, () =>
    withEdge(kits, async (w) => {
      const key = mintKey();
      // Broken: the same ask at B, which has a public being.
      await makePublic(w.asker, w.b.pk);
      const broken = await w.dial(w.obsForAsker).ask(w.b.pk, key, publicPayload(key));
      assert.throws(() => checkSilence(broken.reply));
      checkSilence((await w.dial().ask(w.a.pk, key, publicPayload(key))).reply);
    }));

  test(`5.5 ${dir}: an ask to the public being whose by is not the key that signed is silence`, () =>
    withPublic(kits, async (w) => {
      const d = w.dial();
      const signer = mintKey();
      // Broken: `by` names the key that signed.
      const broken = await d.ask(w.a.pk, signer, publicPayload(signer));
      assert.throws(() => checkSilence(broken.reply));
      checkSilence((await d.ask(w.a.pk, signer, publicPayload(signer, { by: mintKey().signPk }))).reply);
    }));

  test(`5.6 ${dir}: two asks to the public being with seq 1 and next null are both answered`, () =>
    withPublic(kits, async (w) => {
      const d = w.dial();
      const check = (replies) => {
        assert.equal(replies.length, 2);
        for (const r of replies) checkObject(r);
      };

      // Broken: one number twice with next null on a relation, where the
      // count refuses the second.
      const rel = new Relation(d, w.a.pk, await w.invite('x'));
      checkObject((await rel.knock()).reply);
      const broken = [(await rel.ask({ seq: 2, next: null })).reply, (await rel.ask({ seq: 2, next: null })).reply];
      assert.throws(() => check(broken));

      const key = mintKey();
      check([(await d.ask(w.a.pk, key, publicPayload(key))).reply, (await d.ask(w.a.pk, key, publicPayload(key))).reply]);
    }));

  test(`5.7 ${dir}: boom, quiet and huge asked of the public being are each silence, the stranger's length`, () =>
    withPublic(kits, async (w) => {
      const len = await strangerLength(w.handAddr, w.a.pk);
      const d = w.dial();
      const check = (got) => {
        checkSilence(got.reply);
        assert.equal(got.frame.box.length, len, "the stranger's length");
      };
      const key = mintKey();
      // Broken: `hello`, which she answers.
      const broken = await d.ask(w.a.pk, key, publicPayload(key));
      assert.throws(() => check(broken));
      for (const method of ['boom', 'quiet', 'huge']) check(await d.ask(w.a.pk, key, publicPayload(key, { method }), { ms: 10000 }));
    }));
}
