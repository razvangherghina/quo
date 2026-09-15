// `SCENARIOS.md` chapter 1, "The relation is born": one test per line,
// each run in both directions. Every test first runs its check on evidence
// where the line's claim is broken, by the hand or the observer, and shows
// it throws, then keeps the claim and shows the check holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LISTEN_HOST, handAt } from '../src/world.js';
import { bootHost, startStand } from '../src/root-driver.js';
import { DIRECTIONS, KIT_NAMES } from '../src/kits.js';
import { ZERO_EDGE, mintKey, randomSeed, standHand } from '../src/hand.js';
import { Relation } from '../src/relation.js';
import { strangerLength } from '../src/lengths.js';
import { askOn, invite, knock, knockAndTake, root, route, standingAt, take } from '../src/standing.js';
import {
  checkAnswered, checkNoFrames, checkObject, checkReplied, checkSilence, checkStranger, checkWord,
  forgeReplies, holdKnocks, withEdge,
} from './support/s01.js';

for (const [doorKit, askerKit] of DIRECTIONS) {
  const dir = `${doorKit} door, ${askerKit} asker`;

  test(`1.1 ${dir}: B knocks on A's invitation, is answered {hi: "b"}, takes it, and its next ask is answered {hi: "b"}`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      const x = await w.invite('x');
      forgeReplies(w.observer, 'door');
      const broken = await w.during(() => w.knock(x));
      assert.throws(() => checkAnswered(broken, w.a.pk, { hi: 'x' }));

      const invitation = await w.invite('b');
      checkAnswered(await w.during(() => w.knock(invitation)), w.a.pk, { hi: 'b' });
      await take(w.asker, w.b.pk, 'a', invitation);
      checkAnswered(await w.during(() => w.ask('a')), w.a.pk, { hi: 'b' });
    }));

  test(`1.2 ${dir}: a secret that is not the heir's crosses and meets the stranger's length, A unwritten; the right secret is an object`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      const len = await strangerLength(w.handAddr, w.a.pk);

      // Broken: the heir's own secret, which the door binds.
      const x = await w.invite('x');
      const d0 = await w.digest();
      const broken = await w.during(() => w.knock(x));
      const d1 = await w.digest();
      assert.throws(() => checkStranger(broken, w.a.pk, len, d0, d1));

      const invitation = await w.invite('b');
      const wrong = { ...invitation, secret: randomSeed().toString('hex') };
      const e0 = await w.digest();
      const kept = await w.during(() => w.knock(wrong));
      const e1 = await w.digest();
      checkStranger(kept, w.a.pk, len, e0, e1);

      checkAnswered(await w.during(() => w.knock(invitation)), w.a.pk, { hi: 'b' });
    }));

  test(`1.3 ${dir}: the hand's knock announcing nothing, then announcing the heir, is each unannounced with A unwritten; B's knock is then an object`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      const d = w.dial();
      const check = (got, before, after) => {
        checkWord(got.reply, 'unannounced');
        assert.equal(after, before, 'the partition digest is unchanged');
      };

      // Broken: a knock announcing a fresh key, which binds.
      const x = new Relation(d, w.a.pk, await w.invite('x'));
      const d0 = await w.digest();
      const broken = await x.knock({ seq: 1 });
      const d1 = await w.digest();
      assert.throws(() => check(broken, d0, d1));

      const invitation = await w.invite('b');
      const rel = new Relation(d, w.a.pk, invitation);
      const e0 = await w.digest();
      check(await rel.knock({ seq: 1, next: null }), e0, await w.digest());
      const e1 = await w.digest();
      check(await rel.knock({ seq: 1, next: rel.heirKey }), e1, await w.digest());

      checkAnswered(await w.during(() => w.knock(invitation)), w.a.pk, { hi: 'b' });
    }));

  test(`1.4 ${dir}: two edges each way answer interleaved asks; after A removes b, B hears removed and A's standing at B is answered`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      const { door, asker, a, b, observer } = w;
      await standingAt(w, 'b', 'a');
      await knockAndTake(door, a.pk, await invite(asker, b.pk, 'aa'), 'bb');
      const aAsks = () => askOn(door, a.pk, 'bb');

      const round = () => w.during(() => Promise.all([w.ask('a'), aAsks()]));
      const check = ({ result: [fromB, fromA], frames }) => {
        checkObject(fromB, { hi: 'b' });
        checkObject(fromA, { hi: 'aa' });
        checkReplied(frames, a.pk);
        checkReplied(frames, b.pk);
      };
      forgeReplies(observer, 'door');
      const broken = await round();
      assert.throws(() => check(broken));
      for (let i = 0; i < 3; i++) check(await round());

      const checkRemoved = ({ result, frames }) => {
        checkWord(result, 'removed');
        checkReplied(frames, a.pk);
      };
      // Broken: B's ask before the removal.
      const brokenRemoved = await w.during(() => w.ask('a'));
      assert.throws(() => checkRemoved(brokenRemoved));
      await root(door, a.pk, 'remove', { being: 'h', id: 'b' });
      checkRemoved(await w.during(() => w.ask('a')));
      checkAnswered(await w.during(aAsks), b.pk, { hi: 'aa' });
    }));

  test(`1.5 ${dir}: take before any knock and take after a silent knock send no frame; B's knock for b2 is then answered`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      // Broken: a take that knocked would put a knock on the wire.
      const x = await w.invite('x');
      const broken = await w.during(async () => {
        await w.take('x', x);
        await w.knock(x);
      }, 200);
      assert.throws(() => checkNoFrames(broken));

      const invitation = await w.invite('b');
      checkNoFrames(await w.during(() => w.take('a', invitation), 200));
      checkSilence(await w.knock(invitation, 'quiet'));
      checkNoFrames(await w.during(() => w.take('a', invitation), 200));

      const b2 = await w.invite('b2');
      checkAnswered(await w.during(() => w.knock(b2)), w.a.pk, { hi: 'b2' });
    }));

  test(`1.6 ${dir}: a heir with no secret, and a ward pk with a secret and no heir, send no frame`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      // Broken: the whole invitation, which is sent.
      const x = await w.invite('x');
      const broken = await w.during(() => w.knock(x), 200);
      assert.throws(() => checkNoFrames(broken));

      const invitation = await w.invite('b');
      checkNoFrames(await w.during(() => w.knock({ ward: invitation.ward, heir: invitation.heir }), 200));
      checkNoFrames(await w.during(() => w.knock({ ward: invitation.ward, secret: invitation.secret }), 200));
    }));

  test(`1.7 ${dir}: an invitation with a fifth field is answered, and the standing taken on it is answered`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      const x = { ...(await w.invite('x')), note: 'a fifth field' };
      forgeReplies(w.observer, 'door');
      const broken = await w.during(() => w.knock(x));
      assert.throws(() => checkAnswered(broken, w.a.pk, { hi: 'x' }));

      const invitation = { ...(await w.invite('b')), note: 'a fifth field' };
      checkAnswered(await w.during(() => w.knock(invitation)), w.a.pk, { hi: 'b' });
      await take(w.asker, w.b.pk, 'a', invitation);
      checkAnswered(await w.during(() => w.ask('a')), w.a.pk, { hi: 'b' });
    }));

  test(`1.9 ${dir}: B and the hand knock one invitation at once; one object, one silence; the loser's next ask is silence, the winner's answered`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      const d = w.dial();
      // B knocks on `forB` and the hand on `forHand`, both held by the
      // observer until both arrived, then let go B's first and the hand's
      // `gap` milliseconds after. B dials a fresh connection per ask, so with
      // no gap the hand's frame reaches the door first.
      const race = async (forB, forHand, gap = 0) => {
        const rel = new Relation(d, w.a.pk, forHand);
        const own = mintKey();
        holdKnocks(w.observer, ['door', 'hand'], gap);
        const [fromB, fromHand] = await Promise.all([w.knock(forB), rel.knock({ next: own })]);
        return { rel, own, fromB, fromHand: fromHand.reply };
      };
      const checkRace = ({ fromB, fromHand }) => {
        const answers = [fromB, fromHand];
        assert.equal(answers.filter((r) => r && 'object' in r).length, 1, 'exactly one object');
        assert.equal(answers.filter((r) => r && r.silence === true).length, 1, 'exactly one silence');
      };
      const loserNext = (run) => run.rel.ask({ sign: run.own, track: false });

      // Broken: two invitations, so each knock binds its own heir.
      const broken = await race(await w.invite('x1'), await w.invite('x2'));
      assert.throws(() => checkRace(broken));
      // Broken: the hand's next ask where its knock bound.
      const brokenNext = await loserNext(broken);
      assert.throws(() => checkSilence(brokenNext.reply));

      for (let i = 0; i < 8; i++) {
        const invitation = await w.invite(`b${i}`);
        const run = await race(invitation, invitation, i);
        checkRace(run);
        if (run.fromHand && 'object' in run.fromHand) {
          // The hand won; B's kit, having lost, holds no standing to ask on.
          checkObject((await run.rel.ask()).reply);
          continue;
        }
        checkSilence((await loserNext(run)).reply);
        await take(w.asker, w.b.pk, `a${i}`, invitation);
        checkAnswered(await w.during(() => w.ask(`a${i}`)), w.a.pk, { hi: `b${i}` });
        return;
      }
      assert.fail('the hand won every race, so the kit asker never lost one');
    }));

  test(`1.10 ${dir}: an answered knock not taken; a knock again is silence; a third is an object; take and ask are answered`, () =>
    withEdge({ doorKit, askerKit }, async (w) => {
      const invitation = await w.invite('b');
      const check = (answers) => {
        assert.deepEqual(
          answers.map((a) => ('object' in a ? 'object' : a.silence ? 'silence' : a.quo)),
          ['object', 'silence', 'object'],
        );
      };
      // Broken: three invitations, so every knock binds a fresh heir.
      assert.throws(() => check([{ object: {} }, { object: {} }, { object: {} }]));

      const answers = [];
      for (let i = 0; i < 3; i++) answers.push(await w.knock(invitation));
      check(answers);
      await take(w.asker, w.b.pk, 'a', invitation);
      checkAnswered(await w.during(() => w.ask('a')), w.a.pk, { hi: 'b' });
    }));
}

// 1.8: the door is the hand, each kit the asker.
for (const kit of KIT_NAMES) {
  test(`1.8 ${kit} asker, the hand the door: a standing on { ward } alone asks with to null under the zero edge key and reads {hi: null}`, async () => {
    const stand = startStand(kit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', '--class', 'Host']);
    const hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer: () => ({ object: { hi: null }, seen: null }) });
    try {
      const [b] = await stand.ready(1);
      await bootHost(stand, b.pk, 'h');
      await route(stand, b.pk, hand.pk, handAt(hand.at));

      const threeAsks = async (invitation, id) => {
        const knocked = await knock(stand, b.pk, invitation);
        assert.ok(knocked.object, `setup: knock: ${JSON.stringify(knocked)}`);
        await take(stand, b.pk, id, invitation);
        const from = hand.heard.length;
        const answers = [];
        for (let i = 0; i < 3; i++) answers.push(await askOn(stand, b.pk, id));
        return { answers, heard: hand.heard.slice(from) };
      };
      const check = ({ answers, heard }) => {
        assert.equal(heard.length, 3, 'the hand opened three asks');
        for (const ask of heard) {
          assert.equal(ask.payload?.to, null, 'to is null');
          assert.equal(ask.heir, null, 'the head names nobody');
          assert.ok(ask.edge.equals(ZERO_EDGE), 'the body opened under the zero edge key');
        }
        for (const answer of answers) checkObject(answer, { hi: null });
      };

      // Broken: a standing on a whole invitation, whose asks name a heir.
      const broken = await threeAsks(hand.invite(), 'x');
      assert.throws(() => check(broken));
      check(await threeAsks({ ward: hand.pk }, 'a'));
    } finally {
      await Promise.all([stand.close(), hand.close()]);
    }
  });
}
