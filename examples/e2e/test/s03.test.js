// `quo/SCENARIOS.md` chapter 3, "The count", one test per line and per
// direction. Each test first runs its check on evidence where the line's
// claim is broken, by the hand, the observer or the harbor, and shows it
// throws, then keeps the claim and shows the check holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withWorld, createWorldObserver, handAt, handDoor, LISTEN_HOST } from '../src/world.js';
import { DIRECTIONS, KIT_NAMES } from '../src/kits.js';
import { mintKey, standHand } from '../src/hand.js';
import { dial, kindOf, opens } from '../src/dial.js';
import { exchanges } from '../src/observer.js';
import { Relation } from '../src/relation.js';
import { objectLength, repeatedLength, strangerLength } from '../src/lengths.js';
import { askOn, invite, partitionFile, root, sleep, standingAt, knockAndTake } from '../src/standing.js';

const T = { timeout: 120_000 };

// A relation of the hand's at A's door, from a fresh invitation for `id`.
async function handAtDoor(world, id, fn) {
  const d = dial(world.a.at);
  try {
    await d.ready;
    return await fn(new Relation(d, world.a.pk, await invite(world.door, world.a.pk, id)), d);
  } finally {
    d.close();
  }
}

const checkKinds = (want) => (got) => assert.deepEqual(got, want);
const kinds = async (...asks) => {
  const out = [];
  for (const a of asks) out.push(kindOf((await a()).reply));
  return out;
};

// B asks `hello` on its standing `id`, and answers what crossed toward A for
// it: `{ ex }`, each ask with its reply.
async function crossing(world, id) {
  const from = world.observer.frames.length;
  await askOn(world.asker, world.b.pk, id, { wanted: 1000 });
  return exchanges(world.observer.frames, 'door', from);
}
const replyLengths = (ex) => JSON.stringify(ex.map((e) => e.reply?.box.length ?? null));
const checkAnsweredAt = (length) => (ex) => {
  assert.equal(ex.length, 1, replyLengths(ex));
  assert.equal(ex[0].reply?.box.length, length, replyLengths(ex));
};

for (const [doorKit, askerKit] of DIRECTIONS) {
  const dir = `door ${doorKit}, asker ${askerKit}`;
  const world = (fn) => withWorld({ doorKit, askerKit }, fn);

  test(`3.1 ${dir}: numbers 5, 3, 4 on a fresh relation are all honoured`, T, () =>
    world(async (w) => {
      const check = checkKinds(['object', 'object', 'object']);
      const broken = await handAtDoor(w, 'broken', (r) => kinds(() => r.knock({ seq: 5 }), () => r.ask({ seq: 3 }), () => r.ask({ seq: 3 })));
      assert.throws(() => check(broken), undefined, `3 twice: ${broken}`);
      check(await handAtDoor(w, 'kept', (r) => kinds(() => r.knock({ seq: 5 }), () => r.ask({ seq: 3 }), () => r.ask({ seq: 4 }))));
    }));

  test(`3.2 ${dir}: the same number twice, the second is repeated`, T, () =>
    world(async (w) => {
      const check = checkKinds(['object', 'object', 'repeated']);
      const broken = await handAtDoor(w, 'broken', (r) => kinds(() => r.knock({ seq: 1 }), () => r.ask({ seq: 2 }), () => r.ask({ seq: 3 })));
      assert.throws(() => check(broken), undefined, `a new number: ${broken}`);
      check(await handAtDoor(w, 'kept', (r) => kinds(() => r.knock({ seq: 1 }), () => r.ask({ seq: 2 }), () => r.ask({ seq: 2 }))));
    }));

  test(`3.3 ${dir}: with a mark of 100, 37 is honoured and then 36 is repeated`, T, () =>
    world(async (w) => {
      const check = checkKinds(['object', 'object', 'repeated']);
      const broken = await handAtDoor(w, 'broken', (r) => kinds(() => r.knock({ seq: 100 }), () => r.ask({ seq: 37 }), () => r.ask({ seq: 38 })));
      assert.throws(() => check(broken), undefined, `38 unspent: ${broken}`);
      check(await handAtDoor(w, 'kept', (r) => kinds(() => r.knock({ seq: 100 }), () => r.ask({ seq: 37 }), () => r.ask({ seq: 36 }))));
    }));

  test(`3.4 ${dir}: 1000 after 5 is honoured and then 6 is repeated`, T, () =>
    world(async (w) => {
      const check = checkKinds(['object', 'object', 'repeated']);
      const broken = await handAtDoor(w, 'broken', (r) => kinds(() => r.knock({ seq: 5 }), () => r.ask({ seq: 1000 }), () => r.ask({ seq: 1001 })));
      assert.throws(() => check(broken), undefined, `a number above the mark: ${broken}`);
      check(await handAtDoor(w, 'kept', (r) => kinds(() => r.knock({ seq: 5 }), () => r.ask({ seq: 1000 }), () => r.ask({ seq: 6 }))));
    }));

  test(`3.8 ${dir}: A stood again from before B's last ten asks, B's next ask is silence and a new invitation is answered`, T, () =>
    world(async (w) => {
      const { door, a } = w;
      const silence = checkAnsweredAt(await strangerLength(a.at, a.pk));
      const answered = checkAnsweredAt(await objectLength(door, a.pk, a.at));
      await standingAt(w, 'b');

      // Broken: A stood again from the partition as it is now.
      for (let i = 0; i < 10; i++) answered(await crossing(w, 'b'));
      await root(door, a.pk, 'stop');
      await root(door, a.pk, 'stand');
      const broken = await crossing(w, 'b');
      assert.throws(() => silence(broken), undefined, `a door stood from now: ${replyLengths(broken)}`);

      const file = partitionFile('before-ten');
      await root(door, a.pk, 'save', { file });
      for (let i = 0; i < 10; i++) answered(await crossing(w, 'b'));
      await root(door, a.pk, 'stop');
      await root(door, a.pk, 'stand', { file });
      silence(await crossing(w, 'b'));

      await root(door, a.pk, 'remove', { being: 'h', id: 'b' });
      await knockAndTake(w.asker, w.b.pk, await invite(door, a.pk, 'b'), 'anew');
      answered(await crossing(w, 'anew'));
    }));

  test(`3.9 ${dir}: B stood again from before its last ask hears repeated, from before its last two asks silence`, T, () =>
    world(async (w) => {
      const { door, asker, a, b } = w;
      const silence = checkAnsweredAt(await strangerLength(a.at, a.pk));
      const repeated = checkAnsweredAt(await repeatedLength(a.at, a.pk, await invite(door, a.pk, 'r')));
      await standingAt(w, 'b');
      await crossing(w, 'b');

      // Broken: B stood again from its partition as it is now.
      await root(asker, b.pk, 'stop');
      await root(asker, b.pk, 'stand');
      const now = await crossing(w, 'b');
      assert.throws(() => repeated(now), undefined, `B stood from now: ${replyLengths(now)}`);

      const beforeTwo = partitionFile('b-before-two');
      await root(asker, b.pk, 'save', { file: beforeTwo });
      await crossing(w, 'b');
      const beforeOne = partitionFile('b-before-one');
      await root(asker, b.pk, 'save', { file: beforeOne });
      await crossing(w, 'b');

      await root(asker, b.pk, 'stop');
      await root(asker, b.pk, 'stand', { file: beforeOne });
      const one = await crossing(w, 'b');
      repeated(one);
      assert.throws(() => silence(one), undefined, `one ask back: ${replyLengths(one)}`);

      await root(asker, b.pk, 'stop');
      await root(asker, b.pk, 'stand', { file: beforeTwo });
      silence(await crossing(w, 'b'));
    }));

  test(`3.10 ${dir}: A stood again from now, B's next ask is answered and a number honoured before is repeated`, T, () =>
    world(async (w) => {
      const { door, a } = w;
      const answered = checkAnsweredAt(await objectLength(door, a.pk, a.at));
      const isRepeated = (reply) => assert.equal(kindOf(reply), 'repeated');
      await standingAt(w, 'b');
      await handAtDoor(w, 'hand', async (r, d) => {
        await r.knock({ seq: 1 });
        const early = partitionFile('a-early');
        await root(door, a.pk, 'save', { file: early });
        const two = await r.ask({ seq: 2 });
        await r.ask({ seq: 3 });
        const now = partitionFile('a-now');
        await root(door, a.pk, 'save', { file: now });

        // Broken: A stood from before 2 was honoured, and 2's box replayed.
        await root(door, a.pk, 'stop');
        await root(door, a.pk, 'stand', { file: early });
        const again = await d.send(a.pk, two.box);
        const brokenReply = again?.kind === 'reply' ? opens(two.lidSecret, again.box, a.pk) : null;
        assert.throws(() => isRepeated(brokenReply), undefined, `a door that forgot: ${JSON.stringify(brokenReply)}`);

        await root(door, a.pk, 'stop');
        await root(door, a.pk, 'stand', { file: now });
        answered(await crossing(w, 'b'));
        isRepeated((await r.ask({ seq: 2 })).reply);
      });
    }));

  test(`3.11 ${dir}: a key announced and unused before A is stood again is answered after`, T, () =>
    world(async (w) => {
      const { door, a } = w;
      const isObject = (reply) => assert.equal(kindOf(reply), 'object');
      await handAtDoor(w, 'hand', async (r) => {
        const k1 = mintKey();
        const k2 = mintKey();
        await r.knock({ next: k1, seq: 1 });
        const early = partitionFile('a-early');
        await root(door, a.pk, 'save', { file: early });
        await r.ask({ sign: k1, next: k2, seq: 2 });
        const now = partitionFile('a-now');
        await root(door, a.pk, 'save', { file: now });

        // Broken: A stood from before K2 was announced.
        await root(door, a.pk, 'stop');
        await root(door, a.pk, 'stand', { file: early });
        const broken = await r.ask({ sign: k2, seq: 3, track: false });
        assert.throws(() => isObject(broken.reply), undefined, `a door that never heard K2 announced: ${JSON.stringify(broken.reply)}`);

        await root(door, a.pk, 'stop');
        await root(door, a.pk, 'stand', { file: now });
        isObject((await r.ask({ sign: k2, seq: 4 })).reply);
      });
    }));
}

// Lines 5 to 7: the hand is the door and each kit asks.
const OBJECT = { object: { hi: 'b' }, seen: null };

// `later` is `step` above `earlier`, on one relation, neither a knock.
function checkStep(earlier, later, step) {
  assert.ok(earlier && later, 'two asks heard');
  assert.equal(later.heir, earlier.heir);
  assert.equal(later.knock, false);
  assert.equal(later.payload.seq, earlier.payload.seq + step);
}

for (const kit of KIT_NAMES) {
  test(`3.5 asker ${kit}: the hand reads B's knock at number one and the next ask at two`, T, () =>
    handDoor(kit, () => OBJECT, async ({ hand, ask }) => {
      await ask();
      await ask();
      const [knock, first, second] = hand.heard;
      const check = (k, n) => {
        assert.ok(k.knock);
        assert.equal(k.payload.seq, 1);
        checkStep(k, n, 1);
      };
      assert.throws(() => check(knock, second), undefined, 'the knock and the second ask after it');
      check(knock, first);
    }));

  test(`3.6 asker ${kit}: an ask after a held frame is two above the one before it`, T, () =>
    handDoor(kit, () => OBJECT, async ({ stand, b, hand, ask }) => {
      await ask();
      await ask();
      const [, before, unheld] = hand.heard;
      assert.throws(() => checkStep(before, unheld, 2), undefined, 'two asks with nothing held');

      await root(stand, b.pk, 'hold', { asks: 1 });
      const heard = hand.heard.length;
      // The held ask never settles, so it is not awaited.
      ask();
      await sleep(200);
      const got = await ask();
      assert.equal(hand.heard.length, heard + 1, 'the held frame never left');
      assert.ok(got.object, JSON.stringify(got));
      checkStep(unheld, hand.heard.at(-1), 2);
    }));

  test(`3.7 asker ${kit}: an ask after one that met 02 is two above the one before it`, T, async () => {
    const elsewhere = await standHand({ listen: `${LISTEN_HOST}:0`, answer: () => OBJECT });
    const observer = createWorldObserver();
    try {
      await handDoor(kit, () => OBJECT, async ({ hand, ask, route }) => {
        await ask();
        await ask();
        const [, before, plain] = hand.heard;
        assert.throws(() => checkStep(before, plain, 2), undefined, 'two asks with no 02 between');

        await route(await observer.forward('other', handAt(elsewhere.at)));
        const from = observer.frames.length;
        await ask();
        const met = exchanges(observer.frames, 'other', from);
        assert.deepEqual(met.map((e) => e.nothing), [true], 'the listener answered the ask with 02');
        await route(handAt(hand.at));
        await ask();
        checkStep(plain, hand.heard.at(-1), 2);
      });
    } finally {
      await Promise.all([observer.close(), elsewhere.close()]);
    }
  });
}
