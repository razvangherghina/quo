// `quo/SCENARIOS.md` chapter 7, "The blueprint and the digest": one test per
// line, each run in both directions. Every test first runs its line against
// the hand standing as a door that breaks the line's claim and shows the
// check refuses it, then runs it against the door the line names and shows
// the check holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withWorld } from '../src/world.js';
import { KIT_NAMES } from '../src/kits.js';
import { BLUEPRINT, SHOWN, digestOf } from '../src/blueprint.js';
import { bootHost } from '../src/root-driver.js';
import { root } from '../src/standing.js';
import { HEX64, handTarget, hostScript, kitTarget, occupantAt, standingAt, strangerAt } from './support/s07.js';

const DIRECTIONS = KIT_NAMES.flatMap((d) => KIT_NAMES.filter((x) => x !== d).map((x) => [d, x]));

// Runs `observe` against the hand's broken door, then against the kit's door
// (or the hand again under `kept`), and `check` over each: the first must
// throw, the second must hold.
async function line(world, { broken, kept, observe, check }) {
  const hand = await handTarget(world, 'hand', broken);
  try {
    const bad = await observe(hand);
    assert.throws(() => check(bad), 'the check refuses the door that breaks the line');
    if (kept) hand.set(kept);
    check(await observe(kept ? hand : kitTarget(world)));
  } finally {
    await hand.close();
  }
}

const standingId = (target, name) => `${name}-${target.label}`;

for (const [doorKit, askerKit] of DIRECTIONS) {
  const where = `door ${doorKit}, asker ${askerKit}`;

  test(`7.1 ${where}: the empty ask answers the blueprint with seen null, and B's next seen equals its digest`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      await line(world, {
        broken: hostScript({ mode: 'plain' }, { seen: () => 'ab'.repeat(32) }),
        async observe(target) {
          const b = await standingAt(world, target, 'b', standingId(target, 'a'));
          const described = await b.ask();
          await b.ask('hello');
          const standing = await b.read();
          const hand = await occupantAt(target, 'c');
          const empty = await hand.ask();
          hand.close();
          return { described, standing, empty };
        },
        check({ described, standing, empty }) {
          assert.deepEqual(described.object, BLUEPRINT, "B's empty ask answers A's blueprint");
          assert.ok(empty && 'object' in empty, `the empty ask is answered with an object: ${JSON.stringify(empty)}`);
          assert.equal(empty.seen, null, 'the empty ask carries seen null');
          assert.match(String(standing.digest), HEX64, 'B holds a digest');
          assert.equal(standing.seen, standing.digest, "B's seen equals its digest");
        },
      });
    });
  });

  test(`7.2 ${where}: both doors put beside hello the SHA-256 of the JCS form`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const plainHash = crypto.createHash('sha256').update(JSON.stringify(BLUEPRINT)).digest('hex');
      const observe = async (target) => {
        const hand = await occupantAt(target, 'b');
        const reply = await hand.ask('hello');
        hand.close();
        return reply;
      };
      const check = (reply) => {
        assert.ok(reply && 'object' in reply, `hello is answered with an object: ${JSON.stringify(reply)}`);
        assert.equal(reply.seen, digestOf(BLUEPRINT), 'seen is the digest of the JCS form');
      };
      const hand = await handTarget(world, 'hand', hostScript({ mode: 'plain' }, { seen: () => plainHash }));
      try {
        const bad = await observe(hand);
        assert.throws(() => check(bad), 'the check refuses a door that hashes the written form');
      } finally {
        await hand.close();
      }
      check(await observe(kitTarget(world, 'door')));
      check(await observe(kitTarget(world, 'asker')));
    });
  });

  test(`7.3 ${where}: B's digest of a blueprint written out of order is the JCS digest`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const written = (blueprint) => {
        const text = `{"seen":null,"object":${reversed(blueprint)}}`.replace(/"big":1e\+(\d+)/, '"big":1.0e$1');
        assert.match(text, /"big":1\.0e2\d/, 'the number is spelled 1.0e2x');
        return { text };
      };
      const script = (other) => (ask, id) => (ask.payload?.method === undefined ? written(other) : { object: { hi: id }, seen: digestOf(BLUEPRINT) });
      let n = 0;
      await line(world, {
        broken: script({ ...BLUEPRINT, notes: { ...BLUEPRINT.notes, big: 1e22 } }),
        kept: script(BLUEPRINT),
        async observe(target) {
          const b = await standingAt(world, target, 'b', standingId(target, `k${++n}`));
          await b.ask();
          return b.read();
        },
        check(standing) {
          assert.equal(standing.digest, digestOf(BLUEPRINT), "B's digest is the digest of the JCS form");
        },
      });
    });
  });

  test(`7.4 ${where}: after shape extra B's seen differs, and after the empty ask it agrees`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      await line(world, {
        broken: hostScript({ mode: 'plain' }, { describe: () => SHOWN }),
        async observe(target) {
          const b = await standingAt(world, target, 'b1', standingId(target, 'a'));
          await b.ask();
          await b.ask('hello');
          const before = await b.read();
          const shaper = await occupantAt(target, 'c');
          await shaper.ask('shape', { mode: 'extra' });
          shaper.close();
          await b.ask('hello');
          const changed = await b.read();
          await b.ask();
          await b.ask('hello');
          const after = await b.read();
          return { before, changed, after };
        },
        check({ before, changed, after }) {
          assert.match(String(before.digest), HEX64);
          assert.equal(before.seen, before.digest, 'before the shape, seen equals the digest');
          assert.match(String(changed.seen), HEX64);
          assert.notEqual(changed.seen, changed.digest, "after the shape, B's next seen differs from its digest");
          assert.equal(after.seen, after.digest, 'after the empty ask, seen equals the digest');
        },
      });
    });
  });

  test(`7.5 ${where}: a describe that throws: the named ask is answered with seen null, the empty ask is threw`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      await line(world, {
        broken: hostScript({ mode: 'plain' }, { seen: () => digestOf(SHOWN) }),
        async observe(target) {
          const b = await standingAt(world, target, 'b1', standingId(target, 'a'));
          const hand = await occupantAt(target, 'c');
          await hand.ask('shape', { mode: 'throws' });
          const handNamed = await hand.ask('hello');
          hand.close();
          const named = await b.ask('hello');
          const standing = await b.read();
          const empty = await b.ask();
          return { handNamed, named, standing, empty };
        },
        check({ handNamed, named, standing, empty }) {
          assert.deepEqual(handNamed, { object: { hi: 'c' }, seen: null }, 'the named reply is an object with seen null');
          assert.deepEqual(named.object, { hi: 'b1' }, "B's named ask is answered with its object");
          assert.equal(standing.seen, null, "B's seen is null");
          assert.equal(empty.quo, 'threw', 'the empty ask is threw');
        },
      });
    });
  });

  test(`7.6 ${where}: a numeric name: B's digest is the digest of what came, and seen equals it`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      await line(world, {
        broken: hostScript({ mode: 'plain' }, { seen: () => digestOf(SHOWN) }),
        async observe(target) {
          const b = await standingAt(world, target, 'b1', standingId(target, 'a'));
          const shaper = await occupantAt(target, 'c');
          await shaper.ask('shape', { mode: 'numeric' });
          shaper.close();
          const came = await b.ask();
          const described = await b.read();
          await b.ask('hello');
          const named = await b.read();
          return { came, described, named };
        },
        check({ came, described, named }) {
          assert.equal(came?.object?.asks?.[0]?.name, 1, 'the empty ask answers an asks whose first name is 1');
          assert.equal(described.digest, digestOf(came.object), "B's digest is the hand's digest of what came");
          assert.equal(named.seen, digestOf(came.object), "B's next seen equals it");
        },
      });
    });
  });

  test(`7.7 ${where}: a field beside asks and notes counts in seen and in B's digest`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const expected = digestOf({ ...SHOWN, mood: 'fine' });
      await line(world, {
        broken: hostScript({ mode: 'plain' }, { describe: () => SHOWN }),
        async observe(target) {
          const b = await standingAt(world, target, 'b1', standingId(target, 'a'));
          const shaper = await occupantAt(target, 'c');
          await shaper.ask('shape', { mode: 'field' });
          shaper.close();
          await b.ask('hello');
          const named = await b.read();
          await b.ask();
          const described = await b.read();
          return { named, described };
        },
        check({ named, described }) {
          assert.equal(named.seen, expected, "B's next seen is the digest of the blueprint with mood");
          assert.equal(described.digest, expected, "after the empty ask B's digest is the same");
        },
      });
    });
  });

  test(`7.8 ${where}: hidden is shown to b and not to another occupant or a stranger, and each hears its own`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      await bootHost(world.door, world.a.pk, 'pub');
      await root(world.door, world.a.pk, 'public', { key: 'pub' });
      await line(world, {
        broken: hostScript({ mode: 'plain' }, { describe: () => BLUEPRINT }),
        async observe(target) {
          const b = await standingAt(world, target, 'b', standingId(target, 'a'));
          const other = await occupantAt(target, 's');
          const stranger = strangerAt(target);
          const described = await b.ask();
          const digest = (await b.read()).digest;
          const otherBlueprint = await other.ask();
          const strangerBlueprint = await stranger.ask();
          await b.ask('hello');
          const named = await b.read();
          const otherNamed = await other.ask('hello');
          const strangerNamed = await stranger.ask('hello');
          const hidden = await b.ask('hidden');
          const otherHidden = await other.ask('hidden');
          const strangerHidden = await stranger.ask('hidden');
          other.close();
          stranger.close();
          return { described, digest, named, hidden, otherBlueprint, otherNamed, otherHidden, strangerBlueprint, strangerNamed, strangerHidden };
        },
        check(o) {
          assert.deepEqual(o.strangerBlueprint?.object, SHOWN, "the stranger's blueprint has no hidden");
          assert.equal(o.strangerNamed?.seen, digestOf(o.strangerBlueprint.object), "the stranger's next seen matches its own");
          assert.deepEqual(o.strangerHidden?.object, { hidden: true }, 'the stranger is answered {hidden: true}');
          assert.deepEqual(o.described.object, BLUEPRINT, "b's blueprint is the whole one");
          assert.equal(o.digest, digestOf(BLUEPRINT), "b's digest is the whole one's");
          assert.deepEqual(o.otherBlueprint?.object, SHOWN, "the other's blueprint has no hidden");
          assert.equal(o.named.seen, o.digest, "b's next seen matches b's digest");
          assert.equal(o.otherNamed?.seen, digestOf(o.otherBlueprint.object), "the other's next seen matches its own");
          assert.deepEqual(o.hidden.object, { hidden: true }, 'b is answered {hidden: true}');
          assert.deepEqual(o.otherHidden?.object, { hidden: true }, 'the other is answered {hidden: true}');
        },
      });
    });
  });
}

// A value written as JSON with every object's keys in reverse of the order
// they were given, which for these blueprints is out of JCS order.
function reversed(v) {
  if (Array.isArray(v)) return `[${v.map(reversed).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).reverse().map((k) => `${JSON.stringify(k)}:${reversed(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}
