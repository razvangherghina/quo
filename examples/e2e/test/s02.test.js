// `quo/SCENARIOS.md` chapter 2, "Keys rotate", one test per line. A line whose
// asker is a kit runs each kit as the asker; a line between two kits runs
// both ways; a line whose asker is the hand runs each kit as the door. Each
// test first runs its check on evidence where the line's claim is broken, by
// the hand, the observer or a door that breaks the rule, and shows it throws,
// then keeps the claim and shows the check holds.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIONS, KIT_NAMES } from '../src/kits.js';
import { mintKey } from '../src/hand.js';
import { kindOf } from '../src/dial.js';
import { exchanges } from '../src/observer.js';
import { Relation } from '../src/relation.js';
import { handDoor } from '../src/world.js';
import { objectLength, strangerLength } from '../src/lengths.js';
import { askOn, invite, knock, root, sleep, standingAt, take } from '../src/standing.js';
import { brokenDoor, dropOne, kitDoor, knockAsk, plainAsk } from './support/s02.js';

const W = 1000;
const T = { timeout: 120_000 };
const other = (kit) => KIT_NAMES.find((k) => k !== kit);
const lengths = (ex) => JSON.stringify(ex.map((e) => [e.ask.box.length, e.reply?.box.length ?? null]));

// A line the hand asks: the story at a door breaking `breaks` throws the
// check, and at each kit's door the check holds.
function handAsks(line, title, breaks, story, check) {
  for (const kit of KIT_NAMES) {
    test(`2.${line} ${title} (${kit} door)`, T, async () => {
      const broken = await brokenDoor(breaks, story);
      assert.throws(() => check(broken), undefined, `a door that breaks the line passes: ${JSON.stringify(broken)}`);
      const kept = await kitDoor(kit, other(kit), story);
      check(kept);
    });
  }
}

// 1. Every ask is heard and answered, each signed by the key the one before
// announced, each body opened under the edge key that followed the reply
// before it, which the hand's door offered when the ask arrived.
function checkRotates(heard, count) {
  assert.equal(heard.length, count);
  assert.ok(heard[0].ask.knock && heard[0].ask.payload.by === heard[0].ask.heir);
  heard.forEach((h, i) => {
    assert.equal(h.ask.heir, heard[0].ask.heir);
    if (i === 0) return;
    assert.equal(h.ask.payload.by, heard[i - 1].ask.payload.next, `ask ${i} signer`);
    assert.ok(h.offered && h.ask.edge.equals(h.offered), `ask ${i} edge key`);
  });
}

async function hundredAsks(kit, count, policy) {
  const heard = [];
  return handDoor(kit, (ask, hand) => {
    heard.push({ ask, offered: ask.heir ? hand.edgesOf(ask.heir).offered : null });
    return policy(heard.length - 1) === 'forged' ? { text: JSON.stringify({ object: { hi: 'b' }, seen: null }), signer: mintKey() } : { object: { hi: 'b' }, seen: null };
  }, async ({ ask }) => {
    for (let i = 1; i < count; i++) await ask();
    return heard;
  });
}

for (const kit of KIT_NAMES) {
  test(`2.1 one hundred named asks rotate the signing key and the edge key (${kit} asks, the hand is the door)`, T, async () => {
    const broken = await hundredAsks(kit, 12, (n) => (n === 6 ? 'forged' : 'object'));
    assert.throws(() => checkRotates(broken, 12));
    checkRotates(await hundredAsks(kit, 100, () => 'object'), 100);
  });
}

// 2. The lost reply: no reply crosses for the first ask, the second ask
// leaves no sooner than the allowance after it, less the few milliseconds
// between a kit's call and its frame, and an object crosses for the second.
function checkLostReply(ex, objectLen) {
  assert.equal(ex.length, 2, lengths(ex));
  assert.equal(ex[0].reply, null);
  assert.equal(ex[1].reply?.box.length, objectLen, lengths(ex));
  assert.ok(Number(ex[1].ask.t - ex[0].ask.t) / 1e6 >= W - 50);
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  test(`2.2 the lost reply (${doorKit} door, ${askerKit} asks)`, T, () =>
    kitDoor(doorKit, askerKit, async ({ world }) => {
      const { door, asker, a, b, observer } = world;
      const objectLen = await objectLength(door, a.pk, a.at);
      await standingAt(world, 'b', 'a');
      const twice = async () => {
        const from = observer.frames.length;
        await askOn(asker, b.pk, 'a', { wanted: W });
        await askOn(asker, b.pk, 'a', { wanted: W });
        return exchanges(observer.frames, 'door', from);
      };

      await root(door, a.pk, 'drop', { replies: 1 });
      dropOne(observer, 'door', { replyTo: 2 });
      const broken = await twice();
      observer.hook('door', null);
      assert.throws(() => checkLostReply(broken, objectLen));

      await root(door, a.pk, 'drop', { replies: 1 });
      checkLostReply(await twice(), objectLen);
    }));
}

// 3. Replies lost twice: the second, third and fourth asks open under one
// edge key, the one the hand's door offered after the first reply, and the
// fourth is answered.
function checkOneEdge(heard) {
  assert.equal(heard.length, 5);
  const offered = heard[2].offered;
  assert.ok(offered && !offered.equals(heard[1].ask.edge));
  for (const h of heard.slice(2)) assert.ok(h.ask.edge.equals(offered));
}

for (const kit of KIT_NAMES) {
  test(`2.3 replies lost twice keep one edge key (${kit} asks, the hand is the door)`, T, async () => {
    const story = (lost) => {
      const heard = [];
      return handDoor(kit, (ask, hand) => {
        heard.push({ ask, offered: hand.edgesOf(ask.heir).offered });
        return lost.includes(heard.length - 1) ? { none: true } : { object: { hi: 'b' }, seen: null };
      }, async ({ ask }) => {
        for (let i = 0; i < 4; i++) await ask();
        return heard;
      });
    };
    const broken = await story([2]);
    assert.throws(() => checkOneEdge(broken));
    checkOneEdge(await story([2, 3]));
  });
}

for (const [doorKit, askerKit] of DIRECTIONS) {
  // B knocks on a fresh invitation for `b` after `setup`, then `rest`, and
  // answers the exchanges that crossed toward A from the first knock on.
  const knocks = (setup, rest) =>
    kitDoor(doorKit, askerKit, async ({ world }) => {
      const { door, a, observer } = world;
      const refs = { objectLen: await objectLength(door, a.pk, a.at), silenceLen: await strangerLength(a.at, a.pk) };
      const invitation = await invite(door, a.pk, 'b');
      const from = observer.frames.length;
      await setup(world, invitation);
      await rest(world, invitation);
      return { ex: exchanges(observer.frames, 'door', from), ...refs };
    });
  const knockHello = (w, invitation) => knock(w.asker, w.b.pk, invitation, { wanted: W });

  // 4. The knock crossed and no reply did; the ask after it carries no
  // ciphertext and an object crosses for it.
  const checkLostKnock = ({ ex, objectLen }) => {
    assert.equal(ex.length, 2, lengths(ex));
    assert.ok(knockAsk(ex[0].ask.box) && ex[0].reply === null, lengths(ex));
    assert.ok(plainAsk(ex[1].ask.box), lengths(ex));
    assert.equal(ex[1].reply?.box.length, objectLen);
  };

  test(`2.4 the lost knock (${doorKit} door, ${askerKit} asks)`, T, async () => {
    const twice = async (w, invitation) => {
      await knockHello(w, invitation);
      await knockHello(w, invitation);
    };
    const broken = await knocks(async (w) => dropOne(w.observer, 'door', { ask: 1 }), twice);
    assert.throws(() => checkLostKnock(broken), undefined, `the knock never reached the door: ${lengths(broken.ex)}`);
    checkLostKnock(await knocks(async (w) => root(w.door, w.a.pk, 'drop', { replies: 1 }), twice));
  });

  // 5. The first ask that crosses carries no ciphertext and hears the
  // stranger's length; the knock after it carries one and an object crosses.
  const checkHeldKnock = ({ ex, objectLen, silenceLen }) => {
    assert.equal(ex.length, 2, lengths(ex));
    assert.ok(plainAsk(ex[0].ask.box), lengths(ex));
    assert.equal(ex[0].reply?.box.length, silenceLen);
    assert.ok(knockAsk(ex[1].ask.box), lengths(ex));
    assert.equal(ex[1].reply?.box.length, objectLen);
  };

  test(`2.5 the lost knock, the other case (${doorKit} door, ${askerKit} asks)`, T, async () => {
    const broken = await knocks(
      async (w) => root(w.door, w.a.pk, 'drop', { replies: 1 }),
      async (w, invitation) => {
        await knockHello(w, invitation);
        await knockHello(w, invitation);
      },
    );
    assert.throws(() => checkHeldKnock(broken), undefined, `the knock left: ${lengths(broken.ex)}`);
    const kept = await knocks(
      async (w) => root(w.asker, w.b.pk, 'hold', { asks: 1 }),
      async (w, invitation) => {
        // The held knock never settles, so it is not awaited.
        knockHello(w, invitation);
        await sleep(200);
        await knockHello(w, invitation);
      },
    );
    checkHeldKnock(kept);
  });

  // 15. A knock with `quiet` hears silence; the ask after it carries no
  // ciphertext and an object crosses, and so does the first ask on the
  // standing taken.
  const checkQuietKnock = ({ ex, objectLen, silenceLen }) => {
    assert.equal(ex.length, 3, lengths(ex));
    assert.ok(knockAsk(ex[0].ask.box), lengths(ex));
    assert.equal(ex[0].reply?.box.length, silenceLen);
    for (const e of ex.slice(1)) {
      assert.ok(plainAsk(e.ask.box), lengths(ex));
      assert.equal(e.reply?.box.length, objectLen);
    }
  };

  test(`2.15 a knock with quiet, then hello with no ciphertext (${doorKit} door, ${askerKit} asks)`, T, async () => {
    const rest = async (w, invitation) => {
      await knock(w.asker, w.b.pk, invitation, { method: 'quiet' });
      await knockHello(w, invitation);
      await take(w.asker, w.b.pk, 'a', invitation);
      await askOn(w.asker, w.b.pk, 'a', { wanted: W });
    };
    const broken = await knocks(async (w) => dropOne(w.observer, 'door', { ask: 1 }), rest);
    assert.throws(() => checkQuietKnock(broken), undefined, `the quiet knock never reached the door: ${lengths(broken.ex)}`);
    checkQuietKnock(await knocks(async () => {}, rest));
  });

  // 17. Two quiet knocks: the second crosses as a plain ask under her own
  // key, then as a knock whose ciphertext is byte for byte the first's. The
  // hello after them carries no ciphertext and an object crosses.
  const ciphertextOf = (box) => box.subarray(32 + 48, 32 + 48 + 1088);
  const checkSameM = ({ ex, objectLen, silenceLen }) => {
    assert.equal(ex.length, 5, lengths(ex));
    assert.ok(knockAsk(ex[0].ask.box) && plainAsk(ex[1].ask.box) && knockAsk(ex[2].ask.box), lengths(ex));
    for (const e of ex.slice(0, 3)) assert.equal(e.reply?.box.length, silenceLen, lengths(ex));
    assert.ok(ciphertextOf(ex[2].ask.box).equals(ciphertextOf(ex[0].ask.box)), 'the knock again carries the first knock’s ciphertext');
    for (const e of ex.slice(3)) {
      assert.ok(plainAsk(e.ask.box), lengths(ex));
      assert.equal(e.reply?.box.length, objectLen);
    }
  };

  test(`2.17 a knock again after two silences goes under the same m (${doorKit} door, ${askerKit} asks)`, T, async () => {
    const rest = async (w, invitation) => {
      await knock(w.asker, w.b.pk, invitation, { method: 'quiet' });
      await knock(w.asker, w.b.pk, invitation, { method: 'quiet' });
      await knockHello(w, invitation);
      await take(w.asker, w.b.pk, 'a', invitation);
      await askOn(w.asker, w.b.pk, 'a', { wanted: W });
    };
    const broken = await knocks(async (w) => dropOne(w.observer, 'door', { ask: 3 }), rest);
    assert.throws(() => checkSameM(broken), undefined, `the knock again never reached the door: ${lengths(broken.ex)}`);
    checkSameM(await knocks(async () => {}, rest));
  });
}

// 6. B signs each next ask with the key it signed the one before with,
// except after an object, where it signs with the key it had announced.
function checkMovesOnObject(heard, told) {
  assert.equal(heard.length, told.length + 1);
  heard.slice(1).forEach((h, i) => {
    assert.equal(h.payload.by, told[i] === 'object' ? heard[i].payload.next : heard[i].payload.by, `ask ${i + 1} after ${told[i]}`);
  });
}

for (const kit of KIT_NAMES) {
  test(`2.6 B moves to its announced key only after an object (${kit} asks, the hand is the door)`, T, async () => {
    const story = (answers) =>
      handDoor(kit, (ask, hand) => {
        const choice = answers[hand.heard.length - 1] ?? 'object';
        if (choice === 'none') return { none: true };
        if (choice === 'threw') return { quo: 'threw' };
        if (choice === 'silence') return { silence: true };
        return { object: { hi: 'b' }, seen: null };
      }, async ({ hand, ask }) => {
        for (let i = 1; i < answers.length + 1; i++) await ask();
        return hand.heard.slice();
      });
    const told = ['object', 'threw', 'silence', 'object', 'none'];
    const broken = await story(['object', 'object', 'silence', 'object', 'none']);
    assert.throws(() => checkMovesOnObject(broken, told), undefined, 'an asker that moved after an object passes as one that moved after threw');
    checkMovesOnObject(await story(told), told);
  });
}

const kinds = (want) => (got) => assert.deepEqual(got, want);
const seq = async (...asks) => {
  const out = [];
  for (const a of asks) out.push(kindOf((await a()).reply));
  return out;
};

handAsks(
  7,
  'the hand moves to its announced key after a word',
  { vouchOnRefusal: true },
  async (door) => {
    const r = new Relation(door.dialer, door.pk, await door.invite('k'));
    const [k1, k2, k3] = [mintKey(), mintKey(), mintKey()];
    return seq(
      () => r.knock({ next: k1, seq: 1 }),
      () => r.ask({ sign: k1, next: k2, seq: 2 }),
      () => r.ask({ sign: k1, next: k3, seq: 2 }),
      () => r.ask({ sign: k3, seq: 3 }),
      () => r.ask({ sign: k3, seq: 4 }),
      () => r.ask({ sign: k3, next: null, seq: 5 }),
    );
  },
  kinds(['object', 'object', 'repeated', 'silence', 'silence', 'silence']),
);

handAsks(
  8,
  'announcing nothing twice keeps the vouched key',
  { forgetVouchedOnNull: true },
  async (door) => {
    const r = new Relation(door.dialer, door.pk, await door.invite('k'));
    const [k1, k2] = [mintKey(), mintKey()];
    return seq(
      () => r.knock({ next: k1, seq: 1 }),
      () => r.ask({ sign: k1, next: k2, seq: 2 }),
      () => r.ask({ sign: k1, next: null, seq: 3 }),
      () => r.ask({ sign: k1, next: null, seq: 4 }),
      () => r.ask({ sign: k2, next: null, seq: 5 }),
    );
  },
  kinds(['object', 'object', 'object', 'object', 'object']),
);

handAsks(
  9,
  'a key announced, then spoken twice',
  { vouchedSpeaksOnce: true },
  async (door) => {
    const r = new Relation(door.dialer, door.pk, await door.invite('k'));
    const [k1, k] = [mintKey(), mintKey()];
    return seq(
      () => r.knock({ next: k1, seq: 1 }),
      () => r.ask({ sign: k1, next: k, seq: 2 }),
      () => r.ask({ sign: k, next: null, seq: 3 }),
      () => r.ask({ sign: k, next: null, seq: 4 }),
    );
  },
  kinds(['object', 'object', 'object', 'object']),
);

handAsks(
  10,
  'a key announced dies when the held key speaks announcing another',
  { keepOldVouched: true },
  async (door) => {
    const r = new Relation(door.dialer, door.pk, await door.invite('k'));
    const [k1, k, l] = [mintKey(), mintKey(), mintKey()];
    return seq(
      () => r.knock({ next: k1, seq: 1 }),
      () => r.ask({ sign: k1, next: k, seq: 2 }),
      () => r.ask({ sign: k1, next: l, seq: 3 }),
      () => r.ask({ sign: k, next: null, seq: 4 }),
      () => r.ask({ sign: l, next: null, seq: 5 }),
    );
  },
  kinds(['object', 'object', 'object', 'silence', 'object']),
);

handAsks(
  11,
  'the held key named in next replaces the vouched key',
  { nextEqualHeldIgnored: true },
  async (door) => {
    const r = new Relation(door.dialer, door.pk, await door.invite('k'));
    const [k1, v] = [mintKey(), mintKey()];
    return seq(
      () => r.knock({ next: k1, seq: 1 }),
      () => r.ask({ sign: k1, next: v, seq: 2 }),
      () => r.ask({ sign: k1, next: k1, seq: 3 }),
      () => r.ask({ sign: v, next: null, seq: 4 }),
      () => r.ask({ sign: k1, next: null, seq: 5 }),
    );
  },
  kinds(['object', 'object', 'object', 'silence', 'object']),
);

// 12 to 14: silence, and two digests equal across the ask.
const checkSilentUnwritten = (got) => {
  assert.equal(got.reply, 'silence');
  assert.equal(got.after, got.before);
};

handAsks(
  12,
  'a heir never minted',
  { adoptsUnknownHeir: true },
  async (door) => {
    const never = mintKey();
    const r = new Relation(door.dialer, door.pk, { heir: never.signPk, secret: never.seed.toString('hex'), lock: null });
    const before = await door.digest();
    const reply = kindOf((await r.ask({ sign: never, seq: 1 })).reply);
    return { reply, before, after: await door.digest() };
  },
  checkSilentUnwritten,
);

handAsks(
  13,
  "an admitted key's payload signed with another key",
  { noVerify: true },
  async (door) => {
    const r = new Relation(door.dialer, door.pk, await door.invite('k'));
    const k1 = mintKey();
    const knocked = kindOf((await r.knock({ next: k1, seq: 1 })).reply);
    const before = await door.digest();
    const reply = kindOf((await r.ask({ sign: mintKey(), by: k1.signPk, seq: 2 })).reply);
    return { knocked, reply, before, after: await door.digest() };
  },
  (got) => {
    assert.equal(got.knocked, 'object');
    checkSilentUnwritten(got);
  },
);

handAsks(
  14,
  'a spent heir under the open edge key with no ciphertext',
  { heirStillAdmitted: true },
  async (door) => {
    const invitation = await door.invite('k');
    const r = new Relation(door.dialer, door.pk, invitation);
    const knocked = kindOf((await r.knock({ seq: 1 })).reply);
    // The heir's key without the lock signs a plain ask, no ciphertext.
    const heir = mintKey(invitation.secret);
    const before = await door.digest();
    const reply = kindOf((await r.ask({ sign: heir, edge: r.open, seq: 2 })).reply);
    return { knocked, reply, before, after: await door.digest() };
  },
  (got) => {
    assert.equal(got.knocked, 'object');
    checkSilentUnwritten(got);
  },
);

// 16. X under the open edge key and Y under the offered one, sent at once,
// each signed by the key held: exactly one is an object and the other
// silence, and the silent one wrote nothing: its number, asked again under
// the key held and the edge key that followed the answered one, is answered.
function checkRaced({ knocked, x, y, probe }) {
  assert.equal(knocked, 'object');
  assert.deepEqual([x, y].sort(), ['object', 'silence']);
  assert.equal(probe, 'object');
}

async function race(door) {
  const r = new Relation(door.dialer, door.pk, await door.invite('k'));
  const k1 = mintKey();
  const knocked = kindOf((await r.knock({ next: k1, seq: 1 })).reply);
  const [gx, gy] = await Promise.all([
    r.ask({ sign: k1, next: null, seq: 2, edge: r.open, track: false }),
    r.ask({ sign: k1, next: null, seq: 3, edge: r.edge, track: false }),
  ]);
  const [x, y] = [kindOf(gx.reply), kindOf(gy.reply)];
  const [won, lost] = x === 'object' ? [gx, gy] : [gy, gx];
  const probe = won.follows ? kindOf((await r.ask({ sign: k1, next: null, seq: lost.payload.seq, edge: won.follows, track: false })).reply) : 'none';
  return { knocked, x, y, probe };
}

for (const kit of KIT_NAMES) {
  test(`2.16 two asks at once under the open and the offered edge key (${kit} door)`, T, async () => {
    const broken = await brokenDoor({ alsoSpends: [2, 3] }, race);
    assert.throws(() => checkRaced(broken), undefined, `a door that spent the silent ask's number passes: ${JSON.stringify(broken)}`);
    checkRaced(await kitDoor(kit, other(kit), race));
  });
}
