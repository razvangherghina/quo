// `quo/SCENARIOS.md` chapter 12, A third party. Each line runs in both
// directions, and 12.1 once more with the hand as the door and each kit as
// the asker, so the keys B mints are read where they are made. Each test
// carries its broken run: the observer puts on the wire what breaks the
// claim, and the check is seen to throw on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withWorld } from '../src/world.js';
import { DIRECTIONS, KIT_NAMES } from '../src/kits.js';
import { encodeFrame } from '../src/observer.js';
import { ZERO_EDGE } from '../src/hand.js';
import { askOn, digestOf, invite, knock, knockAndTake, standingAt } from '../src/standing.js';
import { dial } from '../src/dial.js';
import { repeatedLength, strangerLength } from '../src/lengths.js';
import { exchangeAfter } from './support/s11.js';
import { leaks, needlesOf, sharesWindow, standingAtHand, wireBytes, withHandDoor } from './support/s12.js';

const tag = () => Math.random().toString(36).slice(2, 8);

// Sets `fn` as the hook on `side` of the forward `label` for one frame of
// `kind`; every other frame crosses untouched.
function hookOnce(observer, label, side, kind, fn) {
  observer.hook(label, {
    [side]: (entry, raw, tools) => {
      if (entry.kind !== kind) return tools.write(raw);
      observer.hook(label, null);
      return fn(entry, raw, tools);
    },
  });
}

// The observer's own connection to `addr` through a forward of its own,
// carrying one box under `wardPk`.
async function deliver(observer, addr, wardPk, box) {
  const d = dial(await observer.forward(`own-${tag()}`, addr));
  try {
    return await d.send(wardPk, box);
  } finally {
    d.close();
  }
}

const crossed = (frames) => frames.filter((f) => !f.closed);

function checkNoLeak(frames, needles) {
  const run = crossed(frames);
  assert.ok(run.some((f) => f.kind === 'ask') && run.some((f) => f.kind === 'reply'), 'the run crossed');
  assert.deepEqual(leaks(wireBytes(run), needles), [], 'no secret of the run on the wire');
}

function checkReplyLength(frame, length, what) {
  assert.equal(frame?.kind, 'reply', `${what}: a reply crossed, ${frame?.kind}`);
  assert.equal(frame.box.length, length, `${what}: the reply is ${length} bytes`);
}

// Holds `n` reply frames, then writes them in the reverse of the order they came.
function reversing(n, released) {
  const held = [];
  let timer;
  const flush = () => {
    clearTimeout(timer);
    const batch = held.splice(0);
    released.push(batch.length);
    batch.reverse().forEach((h) => h.tools.write(h.raw));
  };
  return (entry, raw, tools) => {
    if (entry.kind !== 'reply') return tools.write(raw);
    held.push({ raw, tools });
    clearTimeout(timer);
    if (held.length === n) flush();
    else timer = setTimeout(flush, 3000);
    return undefined;
  };
}

// Holds the first two reply frames and writes each with the other's box.
function swapping(swapped) {
  const held = [];
  let timer;
  return (entry, raw, tools) => {
    if (entry.kind !== 'reply' || swapped.done) return tools.write(raw);
    held.push({ entry, raw, tools });
    if (held.length === 1) {
      timer = setTimeout(() => {
        swapped.done = true;
        held[0].tools.write(held[0].raw);
      }, 3000);
      return undefined;
    }
    clearTimeout(timer);
    swapped.done = true;
    const [x, y] = held;
    swapped.count = 2;
    x.tools.write(encodeFrame({ ...x.entry, box: y.entry.box }));
    y.tools.write(encodeFrame({ ...y.entry, box: x.entry.box }));
    return undefined;
  };
}

// Standings `s0..` B holds at A's `Host`, invited as occupants `r0..`.
async function standings(world, n, prefix) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const occupant = `${prefix}${i}`;
    await standingAt(world, occupant, `s${occupant}`);
    out.push({ id: `s${occupant}`, hi: occupant });
  }
  return out;
}

const askAll = (world, list, wanted) => Promise.all(list.map((s) => askOn(world.asker, world.b.pk, s.id, { wanted })));

for (const [doorKit, askerKit] of DIRECTIONS) {
  const dir = `door ${doorKit}, asker ${askerKit}`;

  test(`12.1 ${dir}: no heir, secret, lock, id, method or arg of the run appears in the recorded bytes`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { door, asker, a, b, observer } = world;
      const occupant = `occ${tag()}`;
      const standing = `std${tag()}`;
      const marker = `MARK${tag()}`;
      const invitation = await invite(door, a.pk, occupant);
      await knockAndTake(asker, b.pk, invitation, standing);
      await askOn(asker, b.pk, standing, { method: 'echo', args: { probe: marker } });
      await askOn(asker, b.pk, standing, { args: { probe: marker } });
      const needles = needlesOf({ heir: invitation.heir, secret: invitation.secret, lock: invitation.lock, occupant, standing, hello: 'hello', echo: 'echo', probe: 'probe', marker });
      const kept = observer.frames.slice();

      // Broken: the observer writes the heir secret into one ask's box.
      const mark = observer.frames.length;
      hookOnce(observer, 'door', 'listener', 'ask', (entry, raw, tools) => {
        const box = Buffer.from(entry.box);
        Buffer.from(invitation.secret, 'hex').copy(box, 80);
        tools.write(encodeFrame({ ...entry, box }));
      });
      await askOn(asker, b.pk, standing, { wanted: 1000 });
      assert.throws(() => checkNoLeak(observer.frames.slice(mark), needles));

      checkNoLeak(kept, needles);
    });
  });

  test(`12.2 ${dir}: every ask's first thirty-two bytes differ from every other's`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { asker, b, observer } = world;
      const check = (frames) => {
        const lids = crossed(frames).filter((f) => f.kind === 'ask').map((f) => f.box.subarray(0, 32).toString('hex'));
        assert.ok(lids.length > 1, 'asks crossed');
        assert.equal(new Set(lids).size, lids.length, 'every lid is its own');
      };
      await standingAt(world, 'lid', 'a');

      // Broken: the observer sends one ask twice.
      const mark = observer.frames.length;
      hookOnce(observer, 'door', 'listener', 'ask', (entry, raw, tools) => {
        tools.write(raw);
        tools.write(raw);
      });
      await askOn(asker, b.pk, 'a', { wanted: 1000 });
      await askOn(asker, b.pk, 'a', { wanted: 1000 });
      assert.throws(() => check(observer.frames.slice(mark)));

      const from = observer.frames.length;
      for (let i = 0; i < 10; i++) await askOn(asker, b.pk, 'a');
      check(observer.frames.slice(0, mark).concat(observer.frames.slice(from)));
    });
  });

  test(`12.3 ${dir}: no thirty-two byte window of one edge's boxes appears on the other's`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { asker, b, observer } = world;
      await standingAt(world, 'ea', 'a');
      await standingAt(world, 'eb', 'a2');
      const run = async (id, n) => {
        const mark = observer.frames.length;
        for (let i = 0; i < n; i++) await askOn(asker, b.pk, id, { wanted: 1000 });
        return crossed(observer.frames.slice(mark));
      };
      const check = (one, other) => {
        assert.ok(one.some((f) => f.kind === 'ask') && other.some((f) => f.kind === 'ask'), 'asks crossed on both edges');
        assert.equal(sharesWindow(one, other), false, 'no window shared');
      };
      const one = await run('a', 20);
      assert.equal(one.filter((f) => f.kind === 'ask').length, 20);

      // Broken: the observer copies thirty-two bytes of an ask on `a` into an ask on `a2`.
      const source = one.find((f) => f.kind === 'ask').box.subarray(40, 72);
      hookOnce(observer, 'door', 'listener', 'ask', (entry, raw, tools) => {
        const box = Buffer.from(entry.box);
        source.copy(box, 100);
        tools.write(encodeFrame({ ...entry, box }));
      });
      const altered = await run('a2', 1);
      assert.throws(() => check(one, altered));

      const other = await run('a2', 20);
      assert.equal(other.filter((f) => f.kind === 'ask').length, 20);
      check(one, other);
    });
  });

  test(`12.4 ${dir}: a captured named ask replayed is a word's length and writes nothing, and B's next ask is answered`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { door, asker, a, b, observer } = world;
      await standingAt(world, 'r4', 'a');
      const repeatedLen = await repeatedLength(a.at, a.pk, await invite(door, a.pk, 'r4ref'));
      const check = ({ replay, before, after, next }) => {
        checkReplyLength(replay, repeatedLen, 'the replay');
        assert.equal(after, before, "A's partition digest is unchanged");
        assert.deepEqual(next?.object, { hi: 'r4' }, `B's next ask is answered: ${JSON.stringify(next)}`);
      };
      const story = async (drop) => {
        let captured = null;
        hookOnce(observer, 'door', 'listener', 'ask', (entry, raw, tools) => {
          captured = entry;
          if (!drop) tools.write(raw);
        });
        await askOn(asker, b.pk, 'a', { wanted: 1000 });
        assert.ok(captured, 'setup: the observer captured the ask');
        const before = await digestOf(door, a.pk);
        const replay = await deliver(observer, a.at, captured.ward, captured.box);
        const after = await digestOf(door, a.pk);
        const next = await askOn(asker, b.pk, 'a');
        return { replay, before, after, next };
      };

      // Broken: the ask never reached A, so its replay is the first arrival.
      const broken = await story(true);
      assert.throws(() => check(broken));

      check(await story(false));
    });
  });

  test(`12.5 ${dir}: a captured knock replayed after it was honoured is the stranger's silence`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { door, asker, a, b, observer } = world;
      const strangerLen = await strangerLength(a.at, a.pk);
      const check = ({ replay, before, after }) => {
        checkReplyLength(replay, strangerLen, 'the replay');
        assert.equal(after, before, "A's partition digest is unchanged");
      };
      const story = async (drop, occupant) => {
        const invitation = await invite(door, a.pk, occupant);
        let captured = null;
        hookOnce(observer, 'door', 'listener', 'ask', (entry, raw, tools) => {
          captured = entry;
          if (!drop) tools.write(raw);
        });
        await knock(asker, b.pk, invitation, { wanted: 1000 });
        assert.ok(captured, 'setup: the observer captured the knock');
        const before = await digestOf(door, a.pk);
        const replay = await deliver(observer, a.at, captured.ward, captured.box);
        const after = await digestOf(door, a.pk);
        return { replay, before, after };
      };

      // Broken: the knock never reached A, so its replay spends the heir.
      const broken = await story(true, 'k5x');
      assert.throws(() => check(broken));

      check(await story(false, 'k5'));
    });
  });

  test(`12.6 ${dir}: six replies in flight together passed in reverse, B reads every object under its own ask`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { observer } = world;
      const list = await standings(world, 6, 'r');
      const check = (answers) => list.forEach((s, i) => assert.deepEqual(answers[i]?.object, { hi: s.hi }, `${s.id}: ${JSON.stringify(answers[i])}`));

      // Broken: the observer swaps the boxes of two of the replies.
      const swapped = {};
      observer.hook('door', { dialer: swapping(swapped) });
      const broken = await askAll(world, list, 1000);
      observer.hook('door', null);
      assert.equal(swapped.count, 2, 'setup: two replies were swapped');
      assert.throws(() => check(broken));

      const released = [];
      const mark = observer.frames.length;
      observer.hook('door', { dialer: reversing(list.length, released) });
      const kept = await askAll(world, list, 5000);
      observer.hook('door', null);
      const run = crossed(observer.frames.slice(mark)).filter((f) => f.label === 'door');
      const firstReply = run.findIndex((f) => f.kind === 'reply');
      assert.equal(run.slice(0, firstReply).filter((f) => f.kind === 'ask').length, list.length, 'all six asks crossed before any reply');
      assert.deepEqual(released, [list.length], 'the six replies were held together and passed in reverse');
      check(kept);
    });
  });

  test(`12.7 ${dir}: two reply boxes swapped, B reads neither, each ask ends by its allowance, and the next on each is answered`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { observer, asker, b } = world;
      const list = await standings(world, 2, 'w');
      const wanted = 1000;
      const timed = (s) => {
        const t0 = Date.now();
        return askOn(asker, b.pk, s.id, { wanted }).then((answer) => ({ answer, ms: Date.now() - t0 }));
      };
      const story = async () => {
        const first = await Promise.all(list.map(timed));
        const next = [];
        for (const s of list) next.push(await askOn(asker, b.pk, s.id));
        return { first, next };
      };
      const check = ({ first, next }) => {
        first.forEach(({ answer, ms }) => {
          assert.equal('object' in (answer ?? {}), false, `B reads no object: ${JSON.stringify(answer)}`);
          assert.ok(ms < wanted + 1500, `the ask ended by its allowance: ${ms}ms`);
        });
        list.forEach((s, i) => assert.deepEqual(next[i]?.object, { hi: s.hi }, `the next ask on ${s.id}: ${JSON.stringify(next[i])}`));
      };

      // Broken: the replies cross with their own boxes, and B reads both.
      const broken = await story();
      assert.throws(() => check(broken));

      const swapped = {};
      observer.hook('door', { dialer: swapping(swapped) });
      const first = await Promise.all(list.map(timed));
      observer.hook('door', null);
      assert.equal(swapped.count, 2, 'setup: both replies were swapped');
      const next = [];
      for (const s of list) next.push(await askOn(asker, b.pk, s.id));
      check({ first, next });
    });
  });

  test(`12.8 ${dir}: a byte appended or truncated is the stranger's length, a flipped ward pk is kind 02`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { asker, a, b, observer } = world;
      await standingAt(world, 'al', 'a');
      const strangerLen = await strangerLength(a.at, a.pk);
      const through = async (alter) => {
        hookOnce(observer, 'door', 'listener', 'ask', (entry, raw, tools) => tools.write(alter ? encodeFrame({ ...entry, ...alter(entry) }) : raw));
        const mark = observer.frames.length;
        await askOn(asker, b.pk, 'a', { wanted: 1000 });
        return exchangeAfter(observer.frames, mark, 'door').back;
      };
      const checkStranger = (frame) => checkReplyLength(frame, strangerLen, 'the altered ask');
      const checkNothing = (frame) => assert.equal(frame?.kind, 'nothing', `kind 02: ${frame?.kind}`);

      // Broken: the ask crosses unaltered, and A answers it.
      const untouched = await through(null);
      assert.throws(() => checkStranger(untouched));
      assert.throws(() => checkNothing(untouched));

      checkStranger(await through((e) => ({ box: Buffer.concat([e.box, Buffer.from([0x61])]) })));
      checkStranger(await through((e) => ({ box: e.box.subarray(0, e.box.length - 1) })));
      checkNothing(await through((e) => {
        const ward = Buffer.from(e.ward, 'hex');
        ward[7] ^= 0x01;
        return { ward: ward.toString('hex') };
      }));
    });
  });

  test(`12.9 ${dir}: a reply replayed under the id of B's next ask is silence to B for that ask`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { asker, b, observer } = world;
      await standingAt(world, 'r9', 'a');
      const check = (answer) => {
        assert.equal(answer?.silence, true, `B reads silence: ${JSON.stringify(answer)}`);
        assert.equal('object' in answer, false);
      };

      let first = null;
      hookOnce(observer, 'door', 'dialer', 'reply', (entry, raw, tools) => {
        first = entry;
        tools.write(raw);
      });
      await askOn(asker, b.pk, 'a');
      assert.ok(first, 'setup: the observer captured a reply');

      // Broken: the ask's own reply crosses, and B reads it.
      const own = await askOn(asker, b.pk, 'a', { wanted: 1000 });
      assert.throws(() => check(own));

      let replayed = false;
      hookOnce(observer, 'door', 'dialer', 'reply', (entry, raw, tools) => {
        replayed = true;
        tools.write(encodeFrame({ ...first, id: entry.id }));
      });
      const answer = await askOn(asker, b.pk, 'a', { wanted: 1000 });
      assert.ok(replayed, 'setup: the observer replayed the reply');
      check(answer);
    });
  });

  test(`12.10 ${dir}: an ask sealed to A delivered under B's pk is the stranger's length`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { asker, a, b, observer } = world;
      await standingAt(world, 'sb', 'a');
      const strangerB = await strangerLength(b.at, b.pk);

      let captured = null;
      hookOnce(observer, 'door', 'listener', 'ask', (entry) => {
        captured = entry;
      });
      await askOn(asker, b.pk, 'a', { wanted: 1000 });
      assert.ok(captured, 'setup: the observer captured the ask');
      const check = (frame) => checkReplyLength(frame, strangerB, "under B's pk");

      // Broken: delivered under A's pk, the ask opens at A and is answered.
      const toA = await deliver(observer, a.at, a.pk, captured.box);
      assert.throws(() => check(toA));

      check(await deliver(observer, b.at, b.pk, captured.box));
    });
  });
}

for (const kit of KIT_NAMES) {
  test(`12.1 door the hand, asker ${kit}: no signing key, edge key, heir, lock, id, method or arg of B's appears in the recorded bytes`, async () => {
    await withHandDoor(kit, () => ({ object: { hi: 'hand' }, seen: null }), async (ctx) => {
      const { stand, b, hand, observer } = ctx;
      const marker = `MARK${tag()}`;
      const s = await standingAtHand(ctx, `std${tag()}`);
      for (let i = 0; i < 3; i++) await askOn(stand, b.pk, s.id, { method: 'echo', args: { probe: marker } });
      const heard = hand.heard.filter((h) => h.heir === s.heir);
      assert.equal(heard.length, 4, 'setup: the hand opened the knock and three asks');
      const secrets = { heir: s.invitation.heir, secret: s.invitation.secret, lock: s.invitation.lock, standing: s.id, hello: 'hello', echo: 'echo', probe: 'probe', marker };
      heard.forEach((h, i) => {
        secrets[`by${i}`] = h.payload.by;
        if (h.payload.next) secrets[`next${i}`] = h.payload.next;
        if (!h.edge.equals(ZERO_EDGE)) secrets[`edge${i}`] = h.edge;
      });
      const needles = needlesOf(secrets);
      const kept = observer.frames.slice();

      // Broken: the observer writes the edge key of the last ask into the next.
      const mark = observer.frames.length;
      hookOnce(observer, 'hand', 'listener', 'ask', (entry, raw, tools) => {
        const box = Buffer.from(entry.box);
        heard.at(-1).edge.copy(box, 90);
        tools.write(encodeFrame({ ...entry, box }));
      });
      await askOn(stand, b.pk, s.id, { wanted: 1000 });
      assert.throws(() => checkNoLeak(observer.frames.slice(mark), needles));

      checkNoLeak(kept, needles);
    });
  });
}
