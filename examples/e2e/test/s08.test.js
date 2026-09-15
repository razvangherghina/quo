// `SCENARIOS.md` chapter 8, "Size and the stream": one test per line,
// each run in both directions. Every test first shows its check refusing a
// run where the hand or the observer breaks the line's claim, then shows the
// check holding over the kits.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LISTEN_HOST, containerAt, createWorldObserver, handAt, withWorld } from '../src/world.js';
import { bootHost, startStand } from '../src/root-driver.js';
import { encodeFrame } from '../src/observer.js';
import { mintKey, randomSeed, sealAsk, standHand } from '../src/hand.js';
import { dial, rawFrame } from '../src/dial.js';
import { Relation } from '../src/relation.js';
import { ASK_OVER, REPLY_OVER, SIZE } from '../src/lengths.js';
import { askOn, invite, knockAndTake, route, standingAt } from '../src/standing.js';

import { DIRECTIONS } from '../src/kits.js';

// A reply text whose sealed box is exactly `boxBytes`.
function sizedReply(boxBytes) {
  const base = JSON.stringify({ object: { v: '' }, seen: null });
  return { text: JSON.stringify({ object: { v: 'x'.repeat(boxBytes - REPLY_OVER - base.length) }, seen: null }) };
}

const plainAnswer = () => ({ object: { hi: 'hand' }, seen: null });

// The hand standing as a door behind the world's observer under `label`, and
// B routed to it.
async function handDoor(world, label, answer) {
  const hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer: (ask) => answer(ask) });
  const via = await world.observer.forward(label, handAt(hand.at));
  await route(world.asker, world.b.pk, hand.pk, via);
  return { hand, via, label, pk: hand.pk, invite: () => hand.invite(), close: () => hand.close() };
}

// A door the hand dials: A's `Host` through the observer, or the hand.
const kitDoor = (world) => ({ via: world.obsForDoor, pk: world.a.pk, label: 'door', invite: (id) => invite(world.door, world.a.pk, id) });

// The hand's relation at `door`, knocked and answered.
async function relationAt(door, id) {
  const d = dial(door.via);
  await d.ready;
  const rel = new Relation(d, door.pk, await door.invite(id));
  const knocked = await rel.knock();
  if (!knocked.reply || !('object' in knocked.reply)) throw new Error(`setup: the hand's knock: ${JSON.stringify(knocked.reply)}`);
  return rel;
}

// A `hello` on `rel` whose arg `v` sizes its box to exactly `boxBytes`.
function sizedAsk(rel, boxBytes) {
  const next = mintKey();
  const seq = rel.seq + 1;
  const bare = rel.payload(rel.held, { next, seq, args: { v: '' } });
  const v = 'x'.repeat(boxBytes - ASK_OVER - Buffer.byteLength(JSON.stringify(bare)));
  return rel.ask({ next, seq, args: { v }, ms: 8000 });
}

// A public ask from a fresh key to `wardPk`.
function publicPayload(key) {
  return { to: null, by: key.signPk, next: null, seq: 1, time: 1000, method: 'hello', args: {} };
}

// A forward whose `02` frames back become a reply of 112 bytes.
function nothingBecomesReply(observer, label, target) {
  return observer.forward(label, target, {
    dialer: (entry, raw, tools) => tools.write(entry.kind === 'nothing' ? encodeFrame({ kind: 'reply', id: entry.id, box: Buffer.alloc(112, 7) }) : raw),
  });
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  const where = `door ${doorKit}, asker ${askerKit}`;

  test(`8.1 ${where}: an ask box of exactly 1,048,576 bytes is answered`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { observer } = world;
      const observe = async (door) => {
        const rel = await relationAt(door, 'c');
        try {
          const got = await sizedAsk(rel, SIZE);
          const crossed = observer.frames.filter((f) => f.label === door.label && f.kind === 'ask' && f.box.equals(got.box)).map((f) => f.box.length);
          return { crossed, reply: got.reply };
        } finally {
          rel.dialer.close();
        }
      };
      const check = ({ crossed, reply }) => {
        assert.deepEqual(crossed, [SIZE], 'the observer measures the ask box at 1,048,576');
        assert.ok(reply && 'object' in reply, `answered with an object: ${JSON.stringify(reply)}`);
      };
      const hand = await handDoor(world, 'hand', (ask) => (ask.payloadBytes.length > 1_000_000 ? { silence: true } : plainAnswer()));
      try {
        const broken = await observe(hand);
        assert.throws(() => check(broken), 'the check refuses a door that answers the full box with silence');
      } finally {
        await hand.close();
      }
      check(await observe(kitDoor(world)));
    });
  });

  test(`8.2 ${where}: an ask frame whose box is 1,048,577 bytes closes the connection`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const observe = async (door) => {
        const d = dial(door.via);
        try {
          await d.ready;
          const key = mintKey();
          const bare = publicPayload(key);
          const payload = { ...bare, args: { v: 'x'.repeat(SIZE + 1 - ASK_OVER - Buffer.byteLength(JSON.stringify({ ...bare, args: { v: '' } }))) } };
          const { box } = sealAsk(door.pk.slice(64), key, payload);
          const id = d.mintId();
          await d.write(rawFrame(0x00, id, Buffer.concat([Buffer.from(door.pk, 'hex'), box])));
          const closed = await d.whenClosed(4000);
          return { box: box.length, closed, answered: (await d.frames(id, 1, 10)).length };
        } finally {
          d.close();
        }
      };
      const check = ({ box, closed, answered }) => {
        assert.equal(box, SIZE + 1, 'the box is 1,048,577 bytes');
        assert.equal(closed, true, 'the listener closes the connection');
        assert.equal(answered, 0, 'no frame answers it');
      };
      const hand = await handDoor(world, 'hand', plainAnswer);
      try {
        const bad = await observe(hand);
        assert.throws(() => check(bad), 'the check refuses a listener that keeps the connection');
      } finally {
        await hand.close();
      }
      check(await observe(kitDoor(world)));
    });
  });

  test(`8.3 ${where}: a reply box of 1,048,577 bytes crosses as a frame and B reads silence`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { observer } = world;
      const observe = async (label, replyBytes) => {
        let over = false;
        const door = await handDoor(world, label, () => (over ? sizedReply(replyBytes) : plainAnswer()));
        try {
          await knockAndTake(world.asker, world.b.pk, door.invite(), label);
          over = true;
          const mark = observer.frames.length;
          const heardAt = door.hand.heard.length;
          await askOn(world.asker, world.b.pk, label, { wanted: 5000 });
          over = false;
          const replies = observer.frames.slice(mark).filter((f) => f.label === label && f.kind === 'reply').map((f) => f.box.length);
          await askOn(world.asker, world.b.pk, label);
          const [first, second] = door.hand.heard.slice(heardAt).map((a) => a.payload);
          return { replies, first, second };
        } finally {
          await door.close();
        }
      };
      const check = ({ replies, first, second }) => {
        assert.deepEqual(replies, [SIZE + 1], 'the observer sees one reply frame whose box is 1,048,577 bytes');
        assert.ok(first && second, 'the hand opened both asks');
        assert.notEqual(first.next, null, 'the ask announced a key');
        assert.equal(second.by, first.by, 'B read silence: it signs its next ask with the key it signed the ask before with');
      };
      const bad = await observe('hand-under', SIZE);
      assert.throws(() => check(bad), 'the check refuses a reply B reads as an object');
      check(await observe('hand-over', SIZE + 1));
    });
  });

  test(`8.4 ${where}: asks on twenty standings in flight together, answered in reverse, each read under its own`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { observer } = world;
      const observe = async (label, release) => {
        const door = await handDoor(world, label, (ask) => ({ object: { n: ask.payload?.args?.n ?? null }, seen: null }));
        try {
          const ids = Array.from({ length: 20 }, (_, n) => `${label}-${n}`);
          for (const id of ids) await knockAndTake(world.asker, world.b.pk, door.invite(), id);
          const held = [];
          observer.hook(label, {
            dialer: (entry, raw, tools) => {
              if (entry.kind !== 'reply') return tools.write(raw);
              held.push({ entry, raw, tools });
              if (held.length === 20) release(held.reverse());
              return undefined;
            },
          });
          const mark = observer.frames.length;
          const heardAt = door.hand.heard.length;
          await Promise.all(ids.map((id, n) => askOn(world.asker, world.b.pk, id, { args: { n }, wanted: 5000 })));
          observer.hook(label, null);
          const inFlight = door.hand.heard.slice(heardAt).map((a) => a.payload);
          const frames = observer.frames.slice(mark).filter((f) => f.label === label && !f.closed);
          const asked = frames.filter((f) => f.kind === 'ask').map((f) => `${f.conn}:${f.id}`);
          const answered = frames.filter((f) => f.kind === 'reply').map((f) => `${f.conn}:${f.id}`);
          await Promise.all(ids.map((id, n) => askOn(world.asker, world.b.pk, id, { args: { n } })));
          const after = door.hand.heard.slice(heardAt + inFlight.length).map((a) => a.payload);
          return { inFlight, asked, answered, after };
        } finally {
          observer.hook(label, null);
          await door.close();
        }
      };
      const check = ({ inFlight, asked, answered, after }) => {
        assert.equal(inFlight.length, 20, 'twenty asks were in flight before any was answered');
        assert.deepEqual(answered, [...asked].reverse(), 'the replies crossed in the reverse of the asks');
        for (let n = 0; n < 20; n++) {
          const first = inFlight.find((p) => p.args?.n === n);
          const next = after.find((p) => p.args?.n === n);
          assert.ok(first && next, `the hand opened both asks of standing ${n}`);
          assert.equal(next.by, first.next, `B read the object of standing ${n} under its own ask`);
        }
      };
      const swapped = (held) => {
        held.forEach(({ entry, tools }, k) => {
          const other = held[k === 0 ? 1 : k === 1 ? 0 : k].entry;
          tools.write(encodeFrame({ kind: 'reply', id: entry.id, box: other.box }));
        });
      };
      const bad = await observe('swapped', swapped);
      assert.throws(() => check(bad), 'the check refuses replies whose boxes the observer swapped');
      check(await observe('reverse', (held) => held.forEach(({ raw, tools }) => tools.write(raw))));
    });
  });

  test(`8.5 ${where}: an ask for a pk the listener does not stand is answered 02`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const stranger = mintKey();
      const pk = stranger.signPk + stranger.xPk;
      const observe = async (addr) => {
        const d = dial(addr);
        try {
          const key = mintKey();
          const { box } = sealAsk(pk.slice(64), key, publicPayload(key));
          return await d.send(pk, box);
        } finally {
          d.close();
        }
      };
      const check = (got) => assert.equal(got?.kind, 'nothing', 'kind 02');
      const altered = await nothingBecomesReply(world.observer, 'altered', world.a.at);
      const bad = await observe(altered);
      assert.throws(() => check(bad), 'the check refuses a 02 the observer turned into a reply');
      check(await observe(world.obsForDoor));
    });
  });

  test(`8.7 ${where}: five frames that are not frames each close the connection, and a new one is answered`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const frames = [
        rawFrame(0x03, 1, Buffer.alloc(164)),
        rawFrame(0x02, 1, Buffer.alloc(0), 4),
        rawFrame(0x00, 1, Buffer.alloc(64), 1_048_646),
        rawFrame(0x00, 1, Buffer.alloc(60)),
        rawFrame(0x02, 1, Buffer.from([0])),
      ];
      const observe = async (door) => {
        const closed = [];
        for (const bytes of frames) {
          const d = dial(door.via);
          await d.ready;
          await d.write(bytes);
          closed.push(await d.whenClosed(1000));
          d.close();
        }
        const rel = await relationAt(door, 'c');
        const got = await rel.ask();
        rel.dialer.close();
        return { closed, reply: got.reply };
      };
      const check = ({ closed, reply }) => {
        assert.deepEqual(closed, [true, true, true, true, true], 'each closes the connection');
        assert.ok(reply && 'object' in reply, 'a new connection is answered');
      };
      const hand = await handDoor(world, 'hand', plainAnswer);
      try {
        const bad = await observe(hand);
        assert.throws(() => check(bad), 'the check refuses a listener that reads on past what is not a frame');
      } finally {
        await hand.close();
      }
      check(await observe(kitDoor(world)));
    });
  });

  test(`8.8 ${where}: a reply frame and a nothing frame at the listener leave the connection standing`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      let n = 0;
      const observe = async (via) => {
        const rel = await relationAt({ ...kitDoor(world), via }, `c${++n}`);
        try {
          await rel.dialer.write(rawFrame(0x01, 900, Buffer.alloc(120, 1)));
          await rel.dialer.write(rawFrame(0x02, 901));
          const got = await rel.ask();
          return { reply: got.reply, closed: rel.dialer.closed };
        } finally {
          rel.dialer.close();
        }
      };
      const check = ({ reply, closed }) => {
        assert.equal(closed, false, 'the connection stands');
        assert.ok(reply && 'object' in reply, `the ask is answered: ${JSON.stringify(reply)}`);
      };
      let strays = 0;
      const dropping = await world.observer.forward('dropping', world.a.at, {
        listener: (entry, raw, tools) => {
          if (entry.kind !== 'ask') strays += 1;
          if (entry.kind === 'ask' && strays > 0) return undefined;
          return tools.write(raw);
        },
      });
      const bad = await observe(dropping);
      assert.throws(() => check(bad), 'the check refuses a run where the ask after the strays never reached the door');
      check(await observe(world.obsForDoor));
    });
  });

  test(`8.9 ${where}: a run in which the door took every ask shows no 02`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { observer } = world;
      const observe = async (label, id) => {
        const mark = observer.frames.length;
        for (let k = 0; k < 5; k++) await askOn(world.asker, world.b.pk, id);
        const frames = observer.frames.slice(mark).filter((f) => f.label === label);
        return { asks: frames.filter((f) => f.kind === 'ask').length, replies: frames.filter((f) => f.kind === 'reply').length, nothings: frames.filter((f) => f.kind === 'nothing').length };
      };
      const check = ({ asks, replies, nothings }) => {
        assert.equal(asks, 5, 'five asks crossed');
        assert.equal(nothings, 0, 'no 02 appears');
        assert.equal(replies, asks, 'every ask was answered by a reply');
      };
      let knocked = false;
      const hand = await handDoor(world, 'hand', () => {
        if (knocked) return { nothing: true };
        knocked = true;
        return plainAnswer();
      });
      try {
        await knockAndTake(world.asker, world.b.pk, hand.invite(), 'at-hand');
        const bad = await observe('hand', 'at-hand');
        assert.throws(() => check(bad), 'the check refuses a listener that answers 02 to an ask its door opened');
      } finally {
        await hand.close();
      }
      await standingAt(world, 'b9', 'at-a');
      check(await observe('door', 'at-a'));
    });
  });

  test(`8.10 ${where}: huge is threw, no reply box above the size crosses, and the next ask is answered`, async () => {
    await withWorld({ doorKit, askerKit }, async (world) => {
      const { observer } = world;
      // References the hand opens on A's door: the length of `threw`, from
      // `boom`, and of `{hi: <an id of three characters>}` with its `seen`.
      const rel = await relationAt(kitDoor(world), 'c10');
      const boom = await rel.ask({ method: 'boom' });
      if (boom.reply?.quo !== 'threw') throw new Error(`setup: the threw reference: ${JSON.stringify(boom.reply)}`);
      const hello = await rel.ask();
      if (!hello.reply || !('object' in hello.reply)) throw new Error(`setup: the object reference: ${JSON.stringify(hello.reply)}`);
      rel.dialer.close();
      const refs = { threw: boom.frame.box.length, object: hello.frame.box.length };

      const observe = async (label, id) => {
        const mark = observer.frames.length;
        await askOn(world.asker, world.b.pk, id, { method: 'huge', wanted: 8000 });
        await askOn(world.asker, world.b.pk, id);
        const replies = observer.frames.slice(mark).filter((f) => f.label === label && f.kind === 'reply').map((f) => f.box.length);
        return { replies };
      };
      const check = ({ replies }) => {
        assert.ok(replies.every((n) => n <= SIZE), `no reply box above the size crossed: ${replies}`);
        assert.deepEqual(replies, [refs.threw, refs.object], 'huge is threw, and the next ask is answered with an object');
      };
      const hand = await handDoor(world, 'huge-hand', (ask) => (ask.payload?.method === 'huge' ? sizedReply(SIZE + 1) : { object: { hi: 'b10' }, seen: randomSeed().toString('hex') }));
      try {
        await knockAndTake(world.asker, world.b.pk, hand.invite(), 'huge-hand');
        const bad = await observe('huge-hand', 'huge-hand');
        assert.throws(() => check(bad), 'the check refuses a door that writes a reply above the size');
      } finally {
        await hand.close();
      }
      await standingAt(world, 'b10', 'at-a');
      check(await observe('door', 'at-a'));
    });
  });
}

for (const doorKit of ['js', 'rust']) {
  test(`8.6 door ${doorKit}, asker the hand: a stopped ward answers 02, the other ward on its listener still answers`, async () => {
    const stand = startStand(doorKit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'S1', '--ward', 'S2', '--class', 'Host']);
    const observer = createWorldObserver();
    try {
      const [w1, w2] = await stand.ready(2);
      for (const w of [w1, w2]) {
        await bootHost(stand, w.pk, 'h');
        await stand.request({ ward: w.pk, method: 'public', args: { key: 'h' } });
      }
      const listener = containerAt(doorKit, w1.at);
      const plain = await observer.forward('plain', listener);
      const altered = await nothingBecomesReply(observer, 'altered', listener);
      const stopped = await stand.request({ ward: w1.pk, method: 'stop' });
      if (stopped.object?.stopped !== w1.pk) throw new Error(`setup: stop: ${JSON.stringify(stopped)}`);

      const observe = async (addr) => {
        const d = dial(addr);
        try {
          const key = mintKey();
          const { box } = sealAsk(w1.pk.slice(64), key, publicPayload(key));
          const toStopped = await d.send(w1.pk, box);
          const other = mintKey();
          const toOther = await d.ask(w2.pk, other, publicPayload(other));
          return { stopped: toStopped, other: toOther };
        } finally {
          d.close();
        }
      };
      const check = ({ stopped: s, other }) => {
        assert.equal(s?.kind, 'nothing', "the stopped ward's pk answers 02");
        assert.equal(other.frame?.kind, 'reply');
        assert.deepEqual(other.reply?.object, { hi: null }, 'the other ward still answers');
      };
      const bad = await observe(altered);
      assert.throws(() => check(bad), 'the check refuses a 02 the observer turned into a reply');
      check(await observe(plain));
    } finally {
      await Promise.all([observer.close(), stand.close()]);
    }
  });
}
