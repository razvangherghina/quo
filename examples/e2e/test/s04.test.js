// `SCENARIOS.md` chapter 4, "Words and silences", one test per line.
// Where a kit is the door, each line runs with the JavaScript door and the
// Rust asker, then the reverse. Where the hand is the door, each kit is the
// asker. Every test breaks its claim once on the wire, by the hand or the
// observer, and shows the check refuses it, then keeps the claim and shows
// the same check holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { withWorld, LISTEN_HOST, containerAt, handAt } from '../src/world.js';
import { startStand, bootHost } from '../src/root-driver.js';
import { DIRECTIONS, KIT_NAMES } from '../src/kits.js';
import { mintKey, openReply, randomSeed, sealAsk, sealReply, standHand } from '../src/hand.js';
import { dial, opens, rawFrame } from '../src/dial.js';
import { Relation } from '../src/relation.js';
import { strangerLength } from '../src/lengths.js';
import { digestOf as digestOfBlueprint } from '../src/blueprint.js';
import { askOn, digestOf, invite, knockAndTake, partitionFile, readStanding, root, route, standingAt } from '../src/standing.js';
import {
  opensUnderZero, zeroSealedBox,
  arithKey, sPlusL, shortSig, nonCanonicalR, smallOrderR, smallOrderKey, torsionKey, IDENTITY_ENC, IDENTITY_SIGNED_ENC,
} from './support/s04.js';

const SILENCE = { silence: true };
const DOOR_WORDS = ['removed', 'absent', 'unannounced', 'repeated', 'threw'];
const EMPTY_DIGEST = digestOfBlueprint({ asks: [], notes: {} });
const OTHER_DIGEST = crypto.createHash('sha256').update('another blueprint').digest('hex');

// The check refuses what a broken run put on the wire: it fails on a claim,
// and not on anything else.
function refuses(check) {
  assert.throws(check, assert.AssertionError);
}

function kitDoor(name, fn) {
  for (const [doorKit, askerKit] of DIRECTIONS) {
    test(`${name} (door ${doorKit}, asker ${askerKit})`, () => withWorld({ doorKit, askerKit }, (w) => fn({ ...w, doorKit, askerKit })));
  }
}

// What an answer on the root channel says, without its request id.
function said(answer) {
  const { id, ...shape } = answer;
  return shape;
}

// Whether B read something from a far door: an object, silence or a door word.
function heardSomething(answer) {
  return 'object' in answer || answer.silence === true || DOOR_WORDS.includes(answer.quo);
}

// Sets a hook on the frames the listener sends back under `label`, acting
// once and then clearing.
function onceBack(observer, label, fn) {
  observer.hook(label, {
    dialer: (entry, raw, tools) => {
      observer.hook(label, null);
      fn(entry, raw, tools);
    },
  });
}

// The observer puts a reply in place of the door's, sealed to the ask's lid
// and carrying `reply`, signed by a key no ward holds.
function forgeBack(observer, label, reply) {
  onceBack(observer, label, (entry, raw, tools) => {
    const lid = tools.ask.box.subarray(0, 32).toString('hex');
    tools.write(rawFrame(0x01, entry.id, sealReply(lid, mintKey(), reply).box));
  });
}

// Runs `fn` and answers what it answered with every frame the observer
// passed under `label` meanwhile, and the frames back among them.
async function during(w, fn, label = 'door') {
  const from = w.observer.frames.length;
  const got = await fn();
  const crossed = w.observer.frames.slice(from).filter((f) => f.label === label);
  return { got, crossed, backs: crossed.filter((f) => f.at === 'dialer' && !f.closed) };
}

// B asks `method` on its standing `b`, the observer forging the reply with
// `forge` when given.
async function bAsk(w, method, { forge, label = 'door' } = {}) {
  if (forge) forgeBack(w.observer, label, forge);
  const run = await during(w, () => askOn(w.asker, w.b.pk, 'b', { method, wanted: 1000 }), label);
  return { answer: said(run.got), crossed: run.crossed, backs: run.backs };
}

// A stranger's ask: a heir the ward never minted.
function strangerAsk(d, wardPk) {
  const key = mintKey();
  return d.ask(wardPk, key, { to: randomSeed().toString('hex'), by: key.signPk, next: null, seq: 1, time: 1000, method: 'hello', args: {} });
}

// B's run carried one reply box, the length of the reference `ref` the hand
// opened on the same door, and `ref` opened to `shape`, and B read `shape`.
// An object shape compares B's object alone, since the hand's own occupant id
// is another id of the same length.
function sameAs(run, ref, shape, bObject) {
  if ('object' in shape) assert.ok(ref.reply && 'object' in ref.reply, 'the reference opened to an object');
  else assert.deepEqual(ref.reply, shape, 'the reference the hand opened');
  assert.equal(run.backs.length, 1, 'one frame back');
  assert.equal(run.backs[0].kind, 'reply', 'kind 01');
  assert.equal(run.backs[0].box.length, ref.frame.box.length, 'the reference length');
  if ('object' in shape) assert.deepEqual(run.answer.object, bObject ?? shape.object, 'B read the object');
  else assert.deepEqual(run.answer, shape, 'B read it');
}

// 4.1 to 4.4: B asks `method` once with the reply forged to `forge`, once as
// it is, then asks `hello`; the hand, on an occupant `c` of its own at the
// same door, asks `method` and `hello` for the references.
async function wordLine(w, method, forge) {
  await standingAt(w, 'b');
  const d = dial(w.obsForDoor);
  try {
    const rel = new Relation(d, w.a.pk, await invite(w.door, w.a.pk, 'c'));
    await rel.knock();
    const ref = await rel.ask({ method });
    const helloRef = await rel.ask();
    const broken = await bAsk(w, method, { forge });
    const kept = await bAsk(w, method);
    const next = await bAsk(w, 'hello');
    return { ref, helloRef, broken, kept, next };
  } finally {
    d.close();
  }
}

kitDoor('4.1 B asks boom: threw, and the next ask is answered', async (w) => {
  const o = await wordLine(w, 'boom', SILENCE);
  const check = (run) => {
    sameAs(run, o.ref, { quo: 'threw' });
    sameAs(o.next, o.helloRef, { object: { hi: 'b' } });
  };
  refuses(() => check(o.broken));
  check(o.kept);
});

kitDoor('4.2 B asks quiet: silence, and the next ask is answered', async (w) => {
  const o = await wordLine(w, 'quiet', { quo: 'threw' });
  const check = (run) => {
    sameAs(run, o.ref, SILENCE);
    sameAs(o.next, o.helloRef, { object: { hi: 'b' } });
  };
  refuses(() => check(o.broken));
  check(o.kept);
});

kitDoor('4.3 B asks bad: threw', async (w) => {
  const o = await wordLine(w, 'bad', SILENCE);
  const check = (run) => sameAs(run, o.ref, { quo: 'threw' });
  refuses(() => check(o.broken));
  check(o.kept);
});

kitDoor('4.4 B asks err: the object {error: "nope"}', async (w) => {
  const o = await wordLine(w, 'err', SILENCE);
  const check = (run) => {
    assert.deepEqual(o.ref.reply?.object, { error: 'nope' }, 'the reference object');
    sameAs(run, o.ref, { object: { error: 'nope' } });
  };
  refuses(() => check(o.broken));
  check(o.kept);
});

kitDoor('4.5 removed to the keys the door kept, silence to every other', async (w) => {
  const { door, a, observer } = w;
  await standingAt(w, 'b');
  const d = dial(w.obsForDoor);
  try {
    // The hand's own relation at A: it knocks, then announces V and keeps
    // signing with the key held, so V is vouched for and never spoke.
    const rel = new Relation(d, a.pk, await invite(door, a.pk, 'hb'));
    await rel.knock();
    const vouched = mintKey();
    await rel.ask({ next: vouched, track: false });
    await root(door, a.pk, 'remove', { being: 'h', id: 'b' });
    await root(door, a.pk, 'remove', { being: 'h', id: 'hb' });

    const bBroken = await bAsk(w, 'hello', { forge: SILENCE });
    const b = await bAsk(w, 'hello');
    forgeBack(observer, 'door', { quo: 'removed' });
    const vouchedBroken = await rel.ask({ sign: vouched, next: null, track: false });
    const vouchedRun = await rel.ask({ sign: vouched, next: null, track: false });
    const other = await rel.ask({ sign: mintKey(), next: null, track: false });
    const reknock = await rel.knock({ track: false });

    const c = await invite(door, a.pk, 'c');
    await root(door, a.pk, 'remove', { being: 'h', id: 'c' });
    const before = await digestOf(door, a.pk);
    const cKnock = await new Relation(d, a.pk, c).knock();
    const after = await digestOf(door, a.pk);
    const strangerLen = await strangerLength(w.obsForDoor, a.pk);

    const kept = { b, vouchedRun, other, reknock, cKnock, before, after };
    const check = (o) => {
      sameAs(o.b, o.vouchedRun, { quo: 'removed' });
      assert.deepEqual(o.other.reply, SILENCE, 'any other key hears silence');
      assert.deepEqual(o.reknock.reply, SILENCE, 'a knock on the same heir hears silence');
      assert.deepEqual(o.cKnock.reply, SILENCE, 'a knock on a heir removed before it spoke hears silence');
      assert.equal(o.cKnock.frame.box.length, strangerLen, 'the stranger length');
      assert.equal(o.after, o.before, 'A wrote nothing');
    };
    refuses(() => check({ ...kept, b: bBroken }));
    refuses(() => check({ ...kept, vouchedRun: vouchedBroken }));
    check(kept);
  } finally {
    d.close();
  }
});

kitDoor('4.6 absent while Host is Stillborn, removed once her record is gone', async (w) => {
  const { door, asker, a, b, observer, doorKit } = w;
  await standingAt(w, 'b');
  const d = dial(w.obsForDoor);
  const rel = new Relation(d, a.pk, await invite(door, a.pk, 'hb'));
  try {
    await rel.knock();
  } finally {
    d.close();
  }
  const file = partitionFile('s04-a');
  await root(door, a.pk, 'save', { file });
  await root(door, a.pk, 'stop');

  const o = {};
  const still = startStand(doorKit, ['--listen', `${LISTEN_HOST}:0`, '--ward', `A=${file}`, '--class', 'Host=Stillborn']);
  try {
    const [a2] = await still.ready(1);
    assert.equal(a2.pk, a.pk);
    const stillAt = await observer.forward('still', containerAt(doorKit, a2.at));
    await route(asker, b.pk, a.pk, stillAt);
    const d2 = dial(stillAt);
    rel.dialer = d2;
    try {
      o.hand = await rel.ask({ next: null, track: false });
      o.bAbsentBroken = await bAsk(w, 'hello', { forge: SILENCE, label: 'still' });
      o.bAbsent = await bAsk(w, 'hello', { label: 'still' });
      o.stranger = await strangerAsk(d2, a.pk);
    } finally {
      d2.close();
    }
  } finally {
    await still.close();
  }

  assert.equal((await root(door, a.pk, 'forget', { being: 'h', id: 'b' })).forgot, 'b');
  await root(door, a.pk, 'stand', {});
  await route(asker, b.pk, a.pk, w.obsForDoor);
  const d3 = dial(w.obsForDoor);
  try {
    const r = new Relation(d3, a.pk, await invite(door, a.pk, 'r'));
    await r.knock();
    await root(door, a.pk, 'remove', { being: 'h', id: 'r' });
    o.removedRef = await r.ask({ next: null, track: false });
  } finally {
    d3.close();
  }
  o.bRemovedBroken = await bAsk(w, 'hello', { forge: SILENCE });
  o.bRemoved = await bAsk(w, 'hello');

  const check = (x) => {
    sameAs(x.bAbsent, x.hand, { quo: 'absent' });
    assert.deepEqual(x.stranger.reply, SILENCE, 'a heir never minted hears silence');
    sameAs(x.bRemoved, x.removedRef, { quo: 'removed' });
  };
  refuses(() => check({ ...o, bAbsent: o.bAbsentBroken }));
  refuses(() => check({ ...o, bRemoved: o.bRemovedBroken }));
  check(o);
});

// ---- the hand as the door ----

// Stands `kit`'s ward B with `Host`, the hand as a ward B is routed to, and
// a standing `s` B took on the hand's invitation. `plan.answer(ask)` answers
// every named `hello` after the knock; the knock and everything else is
// answered `{hi: "hand"}` with the digest of the empty blueprint.
function handDoor(name, fn) {
  for (const kit of KIT_NAMES) {
    test(`${name} (door the hand, asker ${kit})`, async () => {
      const stand = startStand(kit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', '--class', 'Host']);
      const plan = { answer: null };
      const object = () => ({ object: { hi: 'hand' }, seen: EMPTY_DIGEST });
      const hand = await standHand({
        listen: `${LISTEN_HOST}:0`,
        answer: (ask) => (plan.answer && !ask.knock && ask.payload?.method === 'hello' ? plan.answer(ask) : object()),
      });
      try {
        const [b] = await stand.ready(1);
        await bootHost(stand, b.pk, 'h');
        await route(stand, b.pk, hand.pk, handAt(hand.at));
        await knockAndTake(stand, b.pk, hand.invite(), 's');
        const h = {
          plan,
          object,
          // B asks `hello` on `s`: what B read, and the ask the hand opened.
          async ask() {
            const from = hand.heard.length;
            const answer = said(await askOn(stand, b.pk, 's', { wanted: 1000 }));
            return { answer, heard: hand.heard.slice(from).filter((x) => x.payload?.method === 'hello').at(-1) };
          },
          async seen() {
            return (await readStanding(stand, b.pk, 's')).seen;
          },
        };
        await fn(h);
      } finally {
        await Promise.all([stand.close(), hand.close()]);
      }
    });
  }
}

// B asks once answered an object, once answered `out`, once more answered
// an object: the two asks the hand opened after the first, what B read for
// `out`, and B's `seen` read between.
async function handRun(h, out) {
  h.plan.answer = h.object;
  await h.ask();
  h.plan.answer = () => out;
  const x = await h.ask();
  const seen = await h.seen();
  h.plan.answer = h.object;
  const n = await h.ask();
  return { x: x.heard, answer: x.answer, n: n.heard, seen };
}

// B signed the ask after `x` with the key and under the edge key it sent `x`
// with, and its `seen` did not move.
function unmoved({ x, n, seen }) {
  assert.ok(x && n, 'the hand opened both asks');
  assert.equal(n.payload.by, x.payload.by, 'the same signing key');
  assert.ok(n.edge.equals(x.edge), 'the same edge key');
  assert.equal(seen, EMPTY_DIGEST, 'seen unchanged');
}

// B read silence, and moved nothing.
function readSilence(r) {
  assert.deepEqual(r.answer, SILENCE, 'B read silence');
  unmoved(r);
}

// B read the object: it signed the ask after with the key `x` announced,
// under the edge key that followed, which it does on an object alone. With
// `object` named, B's root shows it too; 4.13 names none, since a root
// answer carrying an object of depth sixty-four is itself deeper than a
// value, and a root channel need not carry it.
function readObject(r, object) {
  if (object !== undefined) assert.deepEqual(r.answer.object, object, 'B read the object');
  assert.ok(r.x && r.n, 'the hand opened both asks');
  assert.equal(r.n.payload.by, r.x.payload.next, 'the announced key');
  assert.ok(!r.n.edge.equals(r.x.edge), 'the edge key that followed');
}

handDoor("4.7 a word moves none of B's keys and not its seen", async (h) => {
  const broken = await handRun(h, { object: { hi: 'hand' }, seen: OTHER_DIGEST });
  refuses(() => unmoved(broken));
  for (const word of DOOR_WORDS) unmoved(await handRun(h, { quo: word }));
});

handDoor('4.11 a reply signed by another ward is silence to B', async (h) => {
  const text = JSON.stringify({ object: { hi: 'forged' }, seen: OTHER_DIGEST });
  const broken = await handRun(h, { text });
  refuses(() => readSilence(broken));
  readSilence(await handRun(h, { text, signer: mintKey() }));
});

handDoor('4.12 a reply of none of the three shapes is silence to B', async (h) => {
  const broken = await handRun(h, { object: { hi: 'hand' }, seen: OTHER_DIGEST });
  refuses(() => readSilence(broken));
  readSilence(await handRun(h, { text: JSON.stringify({ object: { hi: 'hand' }, seen: OTHER_DIGEST, extra: true }) }));
  readSilence(await handRun(h, { text: JSON.stringify({ object: { hi: 'hand' }, seen: 'no digest' }) }));
  readSilence(await handRun(h, { text: JSON.stringify({ object: { hi: 'hand' } }) }));
});

// An array of depth `depth`: the empty array is depth one.
const nest = (depth) => (depth === 1 ? [] : [nest(depth - 1)]);

handDoor('4.13 B reads an object of depth sixty-four and silence at sixty-five', async (h) => {
  const deep = (depth) => ({ object: nest(depth), seen: EMPTY_DIGEST });
  const broken = await handRun(h, deep(65));
  refuses(() => readObject(broken));
  readObject(await handRun(h, deep(64)));
  readSilence(await handRun(h, deep(65)));
});

handDoor('4.14 B reads a reply padded with whitespace', async (h) => {
  const padded = (tail) => ({ text: ` \n{ "object" :\t{ "hi" : "pad" } ,\r\n "seen" : "${OTHER_DIGEST}" }${tail}` });
  const check = (r) => {
    readObject(r, { hi: 'pad' });
    assert.equal(r.seen, OTHER_DIGEST, 'the padded seen arrived');
  };
  const broken = await handRun(h, padded(' x'));
  refuses(() => check(broken));
  check(await handRun(h, padded(' \t\n')));
});

kitDoor('4.8 every reply box is its reply plus 112, and every stranger one length', async (w) => {
  const { door, a, observer } = w;
  const d = dial(w.obsForDoor);
  try {
    const recorded = async (fn) => {
      const r = await during(w, fn);
      return { lidSecret: r.got.lidSecret, backs: r.backs };
    };
    const rel = new Relation(d, a.pk, await invite(door, a.pk, 'hb'));
    const bound = [await recorded(() => rel.knock())];
    for (const method of ['hello', 'quiet', 'boom', 'bad', 'err']) bound.push(await recorded(() => rel.ask({ method })));
    const quiet = bound[2];
    let asked;
    bound.push(await recorded(async () => (asked = await rel.ask())));
    bound.push(await recorded(async () => {
      await d.send(a.pk, asked.box);
      return { lidSecret: asked.lidSecret };
    }));

    const strangers = async () => [
      await recorded(() => strangerAsk(d, a.pk)),
      await recorded(() => rel.ask({ sign: mintKey(), next: null, track: false })),
      await recorded(async () => {
        const key = mintKey();
        const sealed = sealAsk(mintKey().xPk, key, { to: randomSeed().toString('hex'), by: key.signPk, next: null, seq: 1, time: 1000, method: 'hello', args: {} });
        await d.send(a.pk, sealed.box);
        return { lidSecret: sealed.lidSecret };
      }),
      await recorded(async () => {
        const seed = randomSeed();
        await d.send(a.pk, Buffer.concat([Buffer.from(mintKey(seed).xPk, 'hex'), crypto.randomBytes(168)]));
        return { lidSecret: seed };
      }),
    ];
    // The first stranger's reply is put in place by a silence with a field
    // beside it, which opens to its own length plus 112 and is another length.
    forgeBack(observer, 'door', { silence: true, pad: '' });
    const broken = await strangers();
    const kept = await strangers();

    const check = (strangerRuns) => {
      for (const r of [...bound, ...strangerRuns]) {
        assert.equal(r.backs.length, 1, 'one frame back');
        assert.equal(r.backs[0].kind, 'reply', 'kind 01');
        const opened = openReply(r.lidSecret, r.backs[0].box);
        assert.ok(opened, 'the reply opens under the lid the hand kept');
        assert.equal(r.backs[0].box.length, opened.payloadBytes.length + 112, 'the box is its reply plus 112');
      }
      const lengths = new Set(strangerRuns.map((r) => r.backs[0].box.length));
      assert.equal(lengths.size, 1, 'every stranger reply one length');
      assert.deepEqual(opens(quiet.lidSecret, quiet.backs[0].box, a.pk), SILENCE, 'quiet to a bound key is silence');
      assert.equal(quiet.backs[0].box.length, [...lengths][0], 'quiet to a bound key is the stranger length');
    };
    refuses(() => check(broken));
    check(kept);
  } finally {
    d.close();
  }
});

const SMALL_ORDER_X25519 = Buffer.from('e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800', 'hex');

kitDoor('4.9 noise is answered the stranger length, sealed to the first thirty-two bytes or to nobody', async (w) => {
  const { a, observer } = w;
  const d = dial(w.obsForDoor);
  try {
    const strangerLen = await strangerLength(w.obsForDoor, a.pk);
    const noise = async (box) => (await d.send(a.pk, box)) ?? { kind: null, box: Buffer.alloc(0) };

    onceBack(observer, 'door', (entry, raw, tools) => tools.write(rawFrame(0x01, entry.id, zeroSealedBox())));
    const brokenTwelve = await noise(crypto.randomBytes(12));

    const o = {};
    o.twelve = await noise(crypto.randomBytes(12));
    const seed = randomSeed();
    o.garbage = await noise(Buffer.concat([Buffer.from(mintKey(seed).xPk, 'hex'), crypto.randomBytes(168)]));
    const key = mintKey();
    const sealed = sealAsk(mintKey().xPk, key, { to: randomSeed().toString('hex'), by: key.signPk, next: null, seq: 1, time: 1000, method: 'hello', args: {} });
    o.padlock = await noise(sealed.box);
    o.smallOrder = await noise(Buffer.concat([SMALL_ORDER_X25519, crypto.randomBytes(168)]));
    o.sixtyFour = await noise(crypto.randomBytes(64));

    const check = (x) => {
      for (const name of ['twelve', 'garbage', 'padlock', 'smallOrder', 'sixtyFour']) {
        assert.equal(x[name].kind, 'reply', `${name}: a reply`);
        assert.equal(x[name].box.length, strangerLen, `${name}: the stranger length`);
      }
      assert.deepEqual(opens(seed, x.garbage.box, a.pk), SILENCE, 'garbage opens under its first thirty-two bytes');
      assert.deepEqual(opens(sealed.lidSecret, x.padlock.box, a.pk), SILENCE, 'the wrong padlock opens under its lid');
      assert.ok(!opensUnderZero(x.twelve.box), 'twelve bytes: sealed to nobody');
      assert.ok(!opensUnderZero(x.smallOrder.box), 'a small-order lid: sealed to nobody');
    };
    refuses(() => check({ ...o, twelve: brokenTwelve }));
    check(o);
  } finally {
    d.close();
  }
});

kitDoor('4.10 the four verification refusals are silence, and a torsion key and a small-order R are answered', async (w) => {
  const { door, a } = w;
  const d = dial(w.obsForDoor);
  try {
    const rel = new Relation(d, a.pk, await invite(door, a.pk, 'hb'));
    await rel.knock();
    const refused = async (sign) => {
      const before = await digestOf(door, a.pk);
      const got = await rel.ask({ sign, next: null });
      return { reply: got.reply, wrote: (await digestOf(door, a.pk)) !== before };
    };
    const held = () => arithKey(rel.held.seed);

    const brokenRefusal = await refused(mintKey(rel.held.seed));
    const refusals = [];
    refusals.push(await refused(sPlusL(held())));
    refusals.push(await refused(nonCanonicalR(held())));
    refusals.push(await refused(shortSig(held())));
    for (const enc of [IDENTITY_ENC, IDENTITY_SIGNED_ENC]) {
      const small = smallOrderKey(enc);
      await rel.ask({ next: small, track: false });
      refusals.push(await refused(small));
    }

    const answered = [(await rel.ask({ sign: smallOrderR(held()), next: null })).reply];
    const tk = torsionKey(held());
    await rel.ask({ next: tk, track: false });
    const torsionAsk = async (aligned) => {
      const seq = rel.seq + 1;
      const { n, signer } = tk.grind((i) => rel.payload(tk, { next: null, seq, args: { n: i } }), aligned);
      return (await rel.ask({ sign: signer, next: null, seq, args: { n } })).reply;
    };
    const brokenTorsion = await torsionAsk(false);
    answered.push(await torsionAsk(true));

    const check = (refusedRuns, answeredReplies) => {
      for (const r of refusedRuns) {
        assert.deepEqual(r.reply, SILENCE, 'silence');
        assert.equal(r.wrote, false, 'A wrote nothing');
      }
      for (const reply of answeredReplies) assert.ok(reply && 'object' in reply, 'answered');
    };
    refuses(() => check([brokenRefusal, ...refusals], answered));
    refuses(() => check(refusals, [answered[0], brokenTorsion]));
    check(refusals, answered);
  } finally {
    d.close();
  }
});

kitDoor('4.15 nothing reaches B only where a 02 or a closed connection crossed', async (w) => {
  const { door, a, observer } = w;
  await standingAt(w, 'b');
  const runs = [];
  for (const method of ['hello', 'quiet', 'boom']) runs.push(await bAsk(w, method));

  // A reply the observer swallows, with no 02 and no close.
  onceBack(observer, 'door', () => {});
  const broken = await bAsk(w, 'hello');

  await root(door, a.pk, 'stop');
  runs.push(await bAsk(w, 'hello'));
  await root(door, a.pk, 'stand', {});
  runs.push(await bAsk(w, 'hello'));

  // The observer closes the connection on B's next ask frame.
  observer.hook('door', {
    listener: (entry, raw, tools) => {
      observer.hook('door', null);
      tools.close();
    },
  });
  runs.push(await bAsk(w, 'hello'));

  const check = (all) => {
    for (const r of all) {
      if (heardSomething(r.answer)) continue;
      const nothing = r.crossed.some((f) => f.at === 'dialer' && f.kind === 'nothing');
      const closed = r.crossed.some((f) => f.closed);
      assert.ok(nothing || closed, 'nothing reached B, and a 02 or a close crossed');
    }
  };
  refuses(() => check([...runs, broken]));
  check(runs);
});
