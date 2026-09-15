// `quo/SCENARIOS.md` chapter 11, Custody. Each line runs in both directions,
// or with each kit as the door where the asker is the hand, and each carries
// its broken run: a story in which the claim does not hold, and the check
// seen to throw on it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { containerAt, withWorld } from '../src/world.js';
import { DIRECTIONS, KIT_NAMES } from '../src/kits.js';
import { askOn, invite, partitionFile, root, route, standingAt } from '../src/standing.js';
import { dial, opens } from '../src/dial.js';
import { strangerLength } from '../src/lengths.js';
import { Relation } from '../src/relation.js';
import { exchangeAfter, harborOf } from './support/s11.js';


// B's ask on its standing `id` through the forward `label`: what B read, and
// the frame that crossed back for it.
async function bAsks(world, label, id) {
  const mark = world.observer.frames.length;
  const answer = await askOn(world.asker, world.b.pk, id);
  return { answer, back: exchangeAfter(world.observer.frames, mark, label).back };
}

function checkObject({ answer, back }, hi) {
  assert.deepEqual(answer?.object, { hi }, `B reads the object: ${JSON.stringify(answer)}`);
  assert.equal(back?.kind, 'reply', 'a reply crossed');
}

function checkStrangerSilence({ answer, back }, strangerLen) {
  assert.equal(back?.kind, 'reply', `a reply crossed: ${back?.kind}`);
  assert.equal(back.box.length, strangerLen, "the reply is the stranger's length");
  assert.equal('object' in (answer ?? {}), false, `B reads no object: ${JSON.stringify(answer)}`);
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  const dir = `door ${doorKit}, asker ${askerKit}`;

  test(`11.1 ${dir}: two harbors of one seed and one partition, the second is silence`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { door, a, b, asker, observer } = world;
      const opened = [];
      try {
        await standingAt(world, 'cu11', 'a');
        checkObject(await bAsks(world, 'door', 'a'), 'cu11');

        const file = partitionFile('s11-1');
        await root(door, a.pk, 'save', { file });
        const second = await harborOf(doorKit, file);
        opened.push(second.stand);
        assert.equal(second.ward.pk, a.pk, 'one seed');
        const toSecond = await observer.forward('second', second.ward.at);
        const strangerLen = await strangerLength(second.ward.at, a.pk);

        const first = await bAsks(world, 'door', 'a');
        await route(asker, b.pk, a.pk, toSecond);
        const fromSecond = await bAsks(world, 'second', 'a');

        // Broken: a third harbor stood from the partition as it is after the
        // first answered has not diverged, and answers.
        const now = partitionFile('s11-1-now');
        await root(door, a.pk, 'save', { file: now });
        const third = await harborOf(doorKit, now);
        opened.push(third.stand);
        await route(asker, b.pk, a.pk, await observer.forward('third', third.ward.at));
        const thirdStranger = await strangerLength(third.ward.at, a.pk);
        const fromThird = await bAsks(world, 'third', 'a');
        checkObject(first, 'cu11');
        assert.throws(() => checkStrangerSilence(fromThird, thirdStranger));

        checkStrangerSilence(fromSecond, strangerLen);
      } finally {
        await Promise.all(opened.map((s) => s.close()));
      }
    });
  });

  test(`11.2 ${dir}: A moved to a new harbor and address answers without a new invitation`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { door, a, b, asker, observer } = world;
      const opened = [];
      try {
        await standingAt(world, 'mv12', 'a');
        checkObject(await bAsks(world, 'door', 'a'), 'mv12');

        // Broken: the same seed on an empty partition holds no relation.
        const bare = await harborOf(doorKit);
        opened.push(bare.stand);
        await route(asker, b.pk, a.pk, await observer.forward('bare', bare.ward.at));
        const fromBare = await bAsks(world, 'bare', 'a');
        assert.throws(() => checkObject(fromBare, 'mv12'));

        const file = partitionFile('s11-2');
        await root(door, a.pk, 'save', { file });
        await root(door, a.pk, 'stop');
        const moved = await harborOf(doorKit, file);
        opened.push(moved.stand);
        assert.equal(moved.ward.pk, a.pk, 'one seed');
        assert.notEqual(moved.ward.at, a.at, 'a new address');
        await route(asker, b.pk, a.pk, await observer.forward('moved', moved.ward.at));
        checkObject(await bAsks(world, 'moved', 'a'), 'mv12');
      } finally {
        await Promise.all(opened.map((s) => s.close()));
      }
    });
  });
}

for (const doorKit of KIT_NAMES) {
  test(`11.3 door ${doorKit}, asker the hand: a replay of an honoured number after a restart is repeated`, async () => {
    await withWorld({ doorKit, askerKit: doorKit }, async (world) => {
      const { door, a } = world;
      const dialers = [];
      try {
        const d = dial(a.at);
        dialers.push(d);
        const rel = new Relation(d, a.pk, await invite(door, a.pk, 'rs11'));
        const knocked = await rel.knock();
        assert.ok(knocked.reply && 'object' in knocked.reply, `setup: knock: ${JSON.stringify(knocked.reply)}`);
        const before = partitionFile('s11-3-before');
        await root(door, a.pk, 'save', { file: before });
        const honoured = await rel.ask();
        assert.ok(honoured.reply && 'object' in honoured.reply, `setup: the number is honoured: ${JSON.stringify(honoured.reply)}`);

        const after = partitionFile('s11-3-after');
        await root(door, a.pk, 'save', { file: after });

        const checkRepeated = (read) => assert.deepEqual(read, { quo: 'repeated' });
        const replayAfter = async (file) => {
          await root(door, a.pk, 'stop');
          const stood = await root(door, a.pk, 'stand', { file });
          const again = dial(containerAt(doorKit, stood.at));
          dialers.push(again);
          const frame = await again.send(a.pk, honoured.box);
          return frame?.kind === 'reply' ? opens(honoured.lidSecret, frame.box, a.pk) : null;
        };

        // Broken: stood from a partition taken before the number was spent.
        const forgot = await replayAfter(before);
        assert.throws(() => checkRepeated(forgot));

        checkRepeated(await replayAfter(after));
      } finally {
        dialers.forEach((x) => x.close());
      }
    });
  });
}
