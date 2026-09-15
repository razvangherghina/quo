// `quo/SCENARIOS.md` chapter 9, "Time". Where the door is the hand, each kit
// is the asker; where the door is a kit, each kit is the door once. Each test
// breaks its claim once, through the hand or the observer, and shows the
// check rejects it, then keeps it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, KIT_NAMES } from '../src/kits.js';
import { askOn, invite, knockAndTake, readStanding, sleep, take } from '../src/standing.js';
import { OBJECT, askFrameOf, bootCaller, handAsksItself, msBetween, replyFrameOf, standAtHand, standPair } from './support/s09.js';


const lastHeard = (hand, method) => [...hand.heard].reverse().find((h) => h.payload?.method === method);
const heardAfter = (hand, heard, method) => hand.heard.slice(hand.heard.indexOf(heard) + 1).find((h) => h.payload?.method === method);

// Drops the next reply frame under `label`.
function dropNextReply(observer, label) {
  observer.hook(label, {
    dialer: (entry, raw, tools) => {
      if (entry.kind === 'reply') return observer.hook(label, null);
      return tools.write(raw);
    },
  });
}

// 9.1. The door read `time` equal to the allowance given, and B's next ask
// crossed and was answered.
function checkNever(observer, label, never, allowance, next) {
  assert.ok(never, 'the door heard never');
  assert.ok(Number.isInteger(never.payload.time) && never.payload.time === allowance, `time ${never.payload.time}, allowance ${allowance}`);
  assert.ok(next, 'the door heard the next ask');
  assert.ok(replyFrameOf(observer, askFrameOf(observer, label, next.lid)), 'the next ask was answered');
}

for (const kit of KIT_NAMES) {
  test(`9.1 ${kit} asks never at the hand: time 1000, and its next ask is answered`, async () => {
    const w = await standAtHand(kit, (ask) => (ask.payload?.method === 'never' ? { none: true } : OBJECT({ hi: 'hand' })));
    try {
      const { stand, b, hand, observer, label } = w;
      await knockAndTake(stand, b.pk, hand.invite(), 'a');

      // Broken: the observer drops the reply to the ask after never, and the
      // hand itself writes a time that is not the allowance.
      await askOn(stand, b.pk, 'a', { method: 'never', wanted: 1000 });
      const brokenNever = lastHeard(hand, 'never');
      dropNextReply(observer, label);
      await askOn(stand, b.pk, 'a', { wanted: 1000 });
      assert.throws(() => checkNever(observer, label, brokenNever, 1000, heardAfter(hand, brokenNever, 'hello')));
      const forged = await handAsksItself(hand, { method: 'never', time: 999 });
      assert.throws(() => checkNever(observer, label, forged, 1000, lastHeard(hand, 'hello')));

      await askOn(stand, b.pk, 'a', { method: 'never', wanted: 1000 });
      const never = lastHeard(hand, 'never');
      await askOn(stand, b.pk, 'a', { wanted: 1000 });
      checkNever(observer, label, never, 1000, heardAfter(hand, never, 'hello'));
    } finally {
      await w.close();
    }
  });
}

// 9.2. The reply to `slow` crossed after the allowance ended, and B's
// standing shows the `seen` it held before.
function checkLateSeen(observer, label, slow, allowance, before, after) {
  const askFrame = askFrameOf(observer, label, slow.lid);
  const replyFrame = replyFrameOf(observer, askFrame);
  assert.ok(replyFrame, 'the reply to slow crossed');
  assert.ok(msBetween(askFrame, replyFrame) >= allowance, `the reply crossed ${msBetween(askFrame, replyFrame)}ms after the ask`);
  assert.equal(after, before, 'the standing shows the seen it held before');
}

for (const kit of KIT_NAMES) {
  test(`9.2 ${kit} asks slow at the hand: the reply crosses at two seconds and the standing keeps its seen`, async () => {
    const state = { slowMs: 2000, seen: null };
    const w = await standAtHand(kit, async (ask) => {
      if (ask.payload?.method !== 'slow') return OBJECT({ hi: 'hand' });
      await sleep(state.slowMs);
      return { object: { slow: true }, seen: state.seen };
    });
    try {
      const { stand, b, hand, observer, label } = w;
      await knockAndTake(stand, b.pk, hand.invite(), 'a');
      const seenOf = async () => (await readStanding(stand, b.pk, 'a')).seen;
      const waitReply = async (heard) => {
        for (let i = 0; i < 60 && !replyFrameOf(observer, askFrameOf(observer, label, heard.lid)); i++) await sleep(100);
        await sleep(200);
      };

      // Broken: the hand answers inside the allowance with a new seen.
      state.slowMs = 300;
      state.seen = 'ab'.repeat(32);
      const brokenBefore = await seenOf();
      await askOn(stand, b.pk, 'a', { method: 'slow', wanted: 1000 });
      const brokenSlow = lastHeard(hand, 'slow');
      await waitReply(brokenSlow);
      const brokenAfter = await seenOf();
      assert.throws(() => checkLateSeen(observer, label, brokenSlow, 1000, brokenBefore, brokenAfter));

      state.slowMs = 2000;
      state.seen = 'cd'.repeat(32);
      const before = await seenOf();
      await askOn(stand, b.pk, 'a', { method: 'slow', wanted: 1000 });
      const slow = lastHeard(hand, 'slow');
      await waitReply(slow);
      checkLateSeen(observer, label, slow, 1000, before, await seenOf());
    } finally {
      await w.close();
    }
  });
}

// 9.3. The second ask frame left after the first's allowance had passed.
const SLACK_MS = 100;
function checkLine(observer, label, first, second, allowance) {
  const f1 = first && askFrameOf(observer, label, first.lid);
  const f2 = second && askFrameOf(observer, label, second.lid);
  assert.ok(f1 && f2, `both ask frames crossed: never ${Boolean(f1)}, hello ${Boolean(f2)}`);
  assert.ok(msBetween(f1, f2) >= allowance - SLACK_MS, `the second left ${msBetween(f1, f2)}ms after the first, allowance ${allowance}`);
}

for (const kit of KIT_NAMES) {
  test(`9.3 ${kit} asks never for three seconds, then again: the second frame leaves after the allowance`, async () => {
    const w = await standAtHand(kit, (ask) => (ask.payload?.method === 'never' ? { none: true } : OBJECT({ hi: 'hand' })));
    try {
      const { stand, b, hand, observer, label } = w;
      await knockAndTake(stand, b.pk, hand.invite(), 'a');
      // The second ask is given five seconds, so its own wait outlasts the
      // line it waits in and what the observer records is the line alone.
      const both = async () => {
        const first = askOn(stand, b.pk, 'a', { method: 'never', wanted: 3000 });
        await sleep(20);
        return Promise.all([first, askOn(stand, b.pk, 'a', { wanted: 5000 })]);
      };
      const found = (from, method) => hand.heard.slice(from).find((h) => h.payload?.method === method);

      // Broken: the observer holds the first ask frame past the second.
      let held = false;
      observer.hook(label, {
        listener: (entry, raw, tools) => {
          if (held || entry.kind !== 'ask') return tools.write(raw);
          held = true;
          setTimeout(() => tools.write(raw), 3500);
          return undefined;
        },
      });
      const brokenFrom = hand.heard.length;
      await both();
      await sleep(700);
      observer.hook(label, null);
      assert.throws(() => checkLine(observer, label, found(brokenFrom, 'never'), found(brokenFrom, 'hello'), 3000));

      const from = hand.heard.length;
      await both();
      checkLine(observer, label, found(from, 'never'), found(from, 'hello'), 3000);
    } finally {
      await w.close();
    }
  });
}

// 9.4. In a cycle whose far `hello` never answers, the second `hi`'s inner
// ask leaves before the sum of the two allowances has passed since the
// first's inner ask left: both waits of the first `hi` ended by then, since
// asks on one standing go one after another.
const OUTER_MS = 2000;
const INNER_MS = 1000;
function checkCycle(asks) {
  assert.ok(asks.length >= 2, `two inner asks crossed, saw ${asks.length}`);
  assert.ok(msBetween(asks[0], asks[1]) < OUTER_MS + INNER_MS, `the second inner ask left ${msBetween(asks[0], asks[1])}ms after the first`);
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  test(`9.4 ${doorKit} door, ${askerKit} asker: a cycle through Caller ends before the sum of the allowances`, async () => {
    const w = await standPair(doorKit, askerKit, { askerClasses: ['Host', 'Caller'] });
    try {
      const { door, asker, a, b, observer, label } = w;
      await bootCaller(asker, b);
      await knockAndTake(asker, b.pk, await invite(door, a.pk, 'caller'), 'a', 'caller');

      const run = async (settle) => {
        const start = observer.frames.length;
        const dropping = await door.request({ ward: a.pk, method: 'drop', args: { replies: 1 } });
        assert.equal(dropping.object?.dropping, 1, JSON.stringify(dropping));
        const hi = () => askOn(asker, b.pk, 'caller', { being: 'm', method: 'hi', args: { time: INNER_MS }, wanted: OUTER_MS });
        const first = hi();
        await sleep(50);
        const second = hi();
        await Promise.race([Promise.all([first, second]), sleep(8000)]);
        await sleep(settle);
        return observer.frames.slice(start).filter((f) => f.label === label && f.kind === 'ask');
      };

      // Broken: the observer holds the second inner ask past the sum.
      let seen = 0;
      observer.hook(label, {
        listener: (entry, raw, tools) => {
          if (entry.kind !== 'ask' || ++seen !== 2) return tools.write(raw);
          setTimeout(() => tools.write(raw), OUTER_MS + INNER_MS + 500);
          return undefined;
        },
      });
      const brokenAsks = await run(OUTER_MS + INNER_MS + 1500);
      observer.hook(label, null);
      assert.throws(() => checkCycle(brokenAsks));

      checkCycle(await run(500));
    } finally {
      await w.close();
    }
  });
}

// 9.5. The door read the `time` Caller was given, not what her caller had
// left.
function checkInnerTime(heard, given) {
  assert.ok(heard, 'the door heard the inner hello');
  assert.equal(heard.payload.time, given);
}

for (const kit of KIT_NAMES) {
  test(`9.5 ${kit}'s Caller, given time 10000 inside a one second ask, asks the hand with time 10000`, async () => {
    const w = await standAtHand(kit, () => OBJECT({ hi: 'hand' }), { classes: ['Host', 'Caller'] });
    try {
      const { stand, b, hand } = w;
      await bootCaller(stand, b);
      const invitation = hand.invite();
      await knockAndTake(stand, b.pk, invitation, 'a', 'caller');

      // Broken: the hand writes the time a clamping kit would.
      const forged = await handAsksItself(hand, { time: 1000 });
      assert.throws(() => checkInnerTime(forged, 10000));

      const heardBefore = hand.heard.length;
      await askOn(stand, b.pk, 'caller', { being: 'm', method: 'hi', args: { time: 10000 }, wanted: 1000 });
      const inner = hand.heard.slice(heardBefore).find((h) => h.heir === invitation.heir && !h.knock && h.payload?.method === 'hello');
      checkInnerTime(inner, 10000);
    } finally {
      await w.close();
    }
  });
}

// 9.6. Every `time` the hand read is a whole number above zero and no
// greater than the allowance its asker was given.
function checkTimes(pairs) {
  assert.ok(pairs.length > 0, 'the hand read payloads');
  for (const [heard, given] of pairs) {
    const time = heard?.payload?.time;
    assert.ok(Number.isInteger(time) && time > 0 && time <= given, `time ${time}, given ${given}`);
  }
}

for (const kit of KIT_NAMES) {
  test(`9.6 ${kit}: every time the hand reads is whole, above zero and within the allowance`, async () => {
    const w = await standAtHand(kit, (ask) => (ask.payload?.method === 'never' ? { none: true } : OBJECT({ hi: 'hand' })), { classes: ['Host', 'Caller'] });
    try {
      const { stand, b, hand } = w;
      for (const time of [0, 1.5, 1001]) {
        const forged = await handAsksItself(hand, { time });
        assert.throws(() => checkTimes([[forged, 1000]]), `time ${time} is refused by the check`);
      }

      const pairs = [];
      const after = async (given, act) => {
        const count = hand.heard.length;
        await act();
        assert.equal(hand.heard.length, count + 1, 'one payload heard');
        pairs.push([hand.heard.at(-1), given]);
      };
      // A knock is given its allowance as an ask is, `wanted` beside it.
      const knock = (invitation, wanted, being = 'h') => stand.request({ ward: b.pk, method: 'knock', args: { being, invitation, method: 'hello', wanted } });
      await after(1500, () => knock(hand.invite(), 1500));
      const invitation = hand.invite();
      await after(1000, () => knock(invitation, 1000));
      await take(stand, b.pk, 'a', invitation);
      for (const wanted of [50, 2500, 1000]) await after(wanted, () => askOn(stand, b.pk, 'a', { wanted }));
      await after(700, () => askOn(stand, b.pk, 'a', { method: 'never', wanted: 700 }));
      await bootCaller(stand, b);
      const callerInvitation = hand.invite();
      await after(1000, () => knock(callerInvitation, 1000, 'caller'));
      await take(stand, b.pk, 'a', callerInvitation, 'caller');
      await after(4000, () => askOn(stand, b.pk, 'caller', { being: 'm', method: 'hi', args: { time: 4000 }, wanted: 5000 }));
      checkTimes(pairs);
    } finally {
      await w.close();
    }
  });
}
