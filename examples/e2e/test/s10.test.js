// `SCENARIOS.md` chapter 10, "Boot and remove". Each line runs with the
// JavaScript ward as the door and the Rust ward as the asker, then the
// reverse. Each test breaks its claim once, through the hand or the
// observer, and shows the check rejects it, then keeps it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withWorld } from '../src/world.js';
import { dial } from '../src/dial.js';
import { Relation } from '../src/relation.js';
import { DIRECTIONS } from '../src/kits.js';
import { askOn, invite, knock as knockAt, knockAndTake, sleep, take } from '../src/standing.js';
import { rawRequest } from './support/s09.js';

// B's `Host` knocks with `hello` on `invitation`, given one thousand
// milliseconds.
const knock = (asker, ward, invitation) => knockAt(asker, ward, invitation, { wanted: 1000 });

// Drops the next reply frame toward B.
function dropNextReply(observer) {
  observer.hook('door', {
    dialer: (entry, raw, tools) => {
      if (entry.kind === 'reply') return observer.hook('door', null);
      return tools.write(raw);
    },
  });
}

// The frames that crossed from `from` on, once a moment has passed.
async function framesSince(observer, from) {
  await sleep(300);
  return observer.frames.slice(from).filter((f) => !f.closed);
}
function checkNoFrame(frames) {
  assert.deepEqual(
    frames.map((f) => `${f.label} ${f.kind} ${f.length}`),
    [],
    'no frame crossed',
  );
}

// 10.1. The made being answered the knock with her own id for B, and her
// `echo` with `args` absent answered the empty object.
function checkMade(knocked, echoed) {
  assert.deepEqual(knocked?.object, { hi: 'b' }, `knock: ${JSON.stringify(knocked)}`);
  assert.deepEqual(echoed?.object, {}, `echo: ${JSON.stringify(echoed)}`);
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  test(`10.1 ${doorKit} door, ${askerKit} asker: a Host A's Host boots answers B's knock and echoes {}`, async () => {
    await withWorld({ doorKit, askerKit }, async ({ door, asker, a, b, observer }) => {
      const booted = await door.request({ ward: a.pk, method: 'boot', args: { maker: 'h', key: 'h2', class: 'Host', occupant: 'h2', standing: 'maker' } });
      assert.equal(booted.object?.booted, 'h2', JSON.stringify(booted));

      // Broken: the observer drops the made being's reply to a knock.
      const lost = await invite(door, a.pk, 'bx', 'h2');
      dropNextReply(observer);
      const lostKnock = await knock(asker, b.pk, lost);
      assert.throws(() => checkMade(lostKnock, { object: {} }));

      const invitation = await invite(door, a.pk, 'b', 'h2');
      const knocked = await knock(asker, b.pk, invitation);
      await take(asker, b.pk, 'a2', invitation);

      // Broken: the observer drops the reply to echo.
      dropNextReply(observer);
      const lostEcho = await askOn(asker, b.pk, 'a2', { method: 'echo', wanted: 1000 });
      assert.throws(() => checkMade(knocked, lostEcho));

      checkMade(knocked, await askOn(asker, b.pk, 'a2', { method: 'echo', wanted: 1000 }));
    });
  });
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  test(`10.2 ${doorKit} door, ${askerKit} asker: B removes its standing a and asks on it, and no frame crosses`, async () => {
    await withWorld({ doorKit, askerKit }, async ({ door, asker, a, b, observer }) => {
      await knockAndTake(asker, b.pk, await invite(door, a.pk, 'b'), 'a');

      // Broken: B asks on the standing it still holds.
      let from = observer.frames.length;
      await askOn(asker, b.pk, 'a');
      assert.throws(() => checkNoFrame(observer.frames.slice(from)));

      const removed = await asker.request({ ward: b.pk, method: 'remove', args: { being: 'h', id: 'a' } });
      assert.equal(removed.object?.removed, 'a', JSON.stringify(removed));
      from = observer.frames.length;
      await askOn(asker, b.pk, 'a');
      checkNoFrame(await framesSince(observer, from));
    });
  });
}

// 10.3. B's knock on the new invitation was answered, and the hand's ask on
// the old relation, signed with the key A held for it, opened to `removed`.
function checkRenewed(knocked, oldKeyReply) {
  assert.ok(knocked?.object, `the knock on the new invitation: ${JSON.stringify(knocked)}`);
  assert.equal(oldKeyReply?.quo, 'removed', `the old key: ${JSON.stringify(oldKeyReply)}`);
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  test(`10.3 ${doorKit} door, ${askerKit} asker: A removes b and invites b again; B's new knock is answered and the hand's old key hears removed`, async () => {
    await withWorld({ doorKit, askerKit }, async ({ door, asker, a, b, observer, obsForDoor }) => {
      const d = dial(obsForDoor);
      try {
        // The hand holds the relation of `b`: it knocks, then asks once, so A
        // holds the key the ask announced.
        const rel = new Relation(d, a.pk, await invite(door, a.pk, 'b'));
        const knocked0 = await rel.knock();
        assert.ok(knocked0.reply && 'object' in knocked0.reply, `setup: the hand's knock: ${JSON.stringify(knocked0.reply)}`);

        // Broken: the hand's ask before A removes `b` is answered, and a
        // knock whose reply the observer drops is no answer.
        const held = await rel.ask();
        const spare = await invite(door, a.pk, 'spare');
        dropNextReply(observer);
        const lostKnock = await knock(asker, b.pk, spare);
        assert.throws(() => checkRenewed({ object: {} }, held.reply));
        assert.throws(() => checkRenewed(lostKnock, { quo: 'removed' }));

        const removed = await door.request({ ward: a.pk, method: 'remove', args: { being: 'h', id: 'b' } });
        assert.equal(removed.object?.removed, 'b', JSON.stringify(removed));
        const renewed = await invite(door, a.pk, 'b');
        const knocked = await knock(asker, b.pk, renewed);
        const oldKey = await rel.ask();
        checkRenewed(knocked, oldKey.reply);
      } finally {
        d.close();
      }
    });
  });
}

// 10.4. Args that are not values, written on the root channel by hand.
const NOT_VALUES = ['{"v":-0}', '{"v":-0.0}', '{"v":1e400}'];

for (const [doorKit, askerKit] of DIRECTIONS) {
  test(`10.4 ${doorKit} door, ${askerKit} asker: B asks with args that are not values, and no frame crosses`, async () => {
    await withWorld({ doorKit, askerKit }, async ({ door, asker, a, b, observer }) => {
      await knockAndTake(asker, b.pk, await invite(door, a.pk, 'b'), 'a');
      const line = (id, args) => `{"id":"${id}","ward":"${b.pk}","method":"ask","args":{"being":"h","id":"a","method":"hello","args":${args},"wanted":1000}}`;

      // Broken: args that are values cross.
      let from = observer.frames.length;
      await rawRequest(asker, 'v0', line('v0', '{"v":0}'));
      assert.throws(() => checkNoFrame(observer.frames.slice(from)));

      for (const [i, args] of NOT_VALUES.entries()) {
        from = observer.frames.length;
        await rawRequest(asker, `nv${i}`, line(`nv${i}`, args));
        checkNoFrame(await framesSince(observer, from));
      }
    });
  });
}
