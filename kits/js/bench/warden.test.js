import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Warden,
  Leash,
  readAnswer,
  seal,
  signingPair,
  sealingPair,
  commitment,
  decodeAnswer,
  open,
  encode,
  decode,
  current,
  memoryDelivery,
  ANSWER_BLUEPRINT,
  parse,
  print,
} from '../src/index.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();

// The clock is handed in, never reached for, and so is every draw of
// randomness. A clock that does not move is a door with no dwell.
const still = () => 1_000;
const RANDOM = fixed(200);

const TEXT = { base: 'text' };
const BOOL = { base: 'bool' };
// A method's arguments and its answer both ride the declared types, so a case
// working at the envelope level writes and reads them the same way the door
// does.
const title = (value) => encode(TEXT, value);
const answered = (data) => decode(BOOL, data);

const LIST = `ToDo
  add(title text) bool
  complete() bool
  silent()
  breaks() bool
  lies() bool
`;

function ground() {
  return Warden.open({
    nameSeed: fixed(1),
    padlockSeed: fixed(2),
    heirSeed: fixed(3),
    hints: ['https://door.example'],
    clock: still,
    random: () => RANDOM,
  });
}

// The pk alone, where a case names a being and never calls it from here.
async function holding(warden, object, options) {
  return (await warden.hold(object, options)).being;
}

// An ordinary object. It carries no authority logic of any kind, never learns
// it has an address, and never learns who is calling. Its methods take decoded
// arguments and answer plain values; the warden does the codec.
function todo() {
  return {
    calls: [],
    leashes: [],
    add(title) {
      this.calls.push(title);
      this.leashes.push(current()?.leash ?? null);
      return true;
    },
    complete() {
      return true;
    },
    breaks() {
      throw new Error('the being fell over');
    },
    // A value the field's declared type cannot carry. The being never touches
    // bytes, so what refuses this is the codec at the door.
    lies() {
      return 'not a bool';
    },
    // A field may answer nothing: a command owed no reply is ordinary.
    silent() {},
  };
}

const caller = await sealingPair(fixed(4));

function payloadFor(warden, voice, over = {}) {
  return {
    voice: voice.pk,
    recipient: warden.name.pk,
    commitment: null,
    seq: 1n,
    padlock: caller.pk,
    hints: ['https://caller.example'],
    allowance: { time: 5_000n, hops: 4n },
    being: null,
    method: null,
    ...over,
  };
}

function ask(warden, voice, over = {}, random = RANDOM) {
  return seal({
    payload: payloadFor(warden, voice, over),
    padlock: warden.padlock.pk,
    voiceSecret: over.signWith ?? voice.secret,
    random,
  });
}

function invoke(name, args = new Uint8Array(0)) {
  return { name, args };
}

// A ground with one being held and one voice granted at it.
async function granted() {
  const warden = await ground();
  const object = todo();
  const being = await holding(warden, object, { seed: fixed(5), blueprint: LIST });
  const voice = await signingPair(fixed(6));
  const heir = await signingPair(fixed(7));
  const invitation = await warden.grant(being, { voiceSeed: fixed(6), heirSeed: fixed(7) });
  return { warden, object, being, voice, heir, invitation };
}

test('the answer blueprint is itself canonical notation', () => {
  assert.equal(print(parse(ANSWER_BLUEPRINT)), ANSWER_BLUEPRINT);
});

test('holding an object mints its keys and records its blueprint digest', async () => {
  const warden = await ground();
  const object = todo();
  const before = Object.keys(object).sort();
  const being = await holding(warden, object, { seed: fixed(5), blueprint: LIST });
  // A being is named by its pk, and the warden minted it.
  assert.equal(being.length, 32);
  assert.equal(hex(being), hex((await signingPair(fixed(5))).pk));
  // The object gains one thing and one only: the closure, which is the whole
  // of its API to Quo. Nothing else of the object is touched, and nothing in
  // the closure is a key or a road.
  assert.deepEqual(Object.keys(object).sort(), [...before, 'quo'].sort());
  assert.equal(typeof object.quo.grant, 'function');
  for (const name of Object.keys(object.quo)) assert.ok(!/secret|padlock|seed/i.test(name), name);
  // The warden keeps the pointer, the being's keys, and the blueprint digest.
  const held = warden.beings.get(hex(being));
  assert.equal(held.object, object);
  assert.equal(held.digest.length, 32);
  assert.equal(held.secret.length, 32);
});

test('a card is the invitation without the voice', async () => {
  const warden = await ground();
  const card = warden.card();
  assert.deepEqual(Object.keys(card).sort(), ['commitment', 'hints', 'padlock', 'warden']);
  // The warden's own heir is committed at itself.
  assert.equal(hex(card.commitment), hex(await commitment(warden.name.pk, warden.heir.pk)));
});

test('granting writes the row and hands out the five things', async () => {
  const { warden, being, voice, heir, invitation } = await granted();
  assert.deepEqual(Object.keys(invitation).sort(), [
    'commitment',
    'heirPublic',
    'heirSecret',
    'hints',
    'padlock',
    'warden',
  ]);
  assert.equal(hex(invitation.warden), hex(warden.name.pk));
  assert.equal(hex(invitation.heirPublic), hex(heir.pk));
  const row = warden.standing(voice.pk);
  assert.equal(hex(row.voice), hex(voice.pk));
  assert.ok(row.beings.has(hex(being)));
  // The heir commitment is domain-separated by the door's own name, so a
  // reused heir hashes to nothing anywhere else.
  assert.equal(hex(row.commitment), hex(await commitment(warden.name.pk, heir.pk)));
  assert.notEqual(hex(row.commitment), hex(await commitment(fixed(99), heir.pk)));
  // Granting at a being the warden does not hold opens nothing.
  assert.equal(await warden.grant(fixed(98), { voiceSeed: fixed(9), heirSeed: fixed(10) }), null);
});

test('a being lists the voices holding a standing at it, and nothing of another being', async () => {
  const warden = await ground();
  const object = todo();
  const beingOne = await holding(warden, object, { seed: fixed(5), blueprint: LIST });
  const beingTwo = await holding(warden, todo(), { seed: fixed(11), blueprint: LIST });
  const one = await signingPair(fixed(6));
  const two = await signingPair(fixed(12));
  const three = await signingPair(fixed(13));
  const other = await signingPair(fixed(14));
  await warden.grant(beingOne, { voiceSeed: fixed(6), heirSeed: fixed(7) });
  await warden.grant(beingOne, { voiceSeed: fixed(12), heirSeed: fixed(15) });
  await warden.grant(beingOne, { voiceSeed: fixed(13), heirSeed: fixed(16) });
  await warden.grant(beingTwo, { voiceSeed: fixed(14), heirSeed: fixed(17) });

  const holders = warden.standings(beingOne);
  assert.deepEqual(
    holders.map((holder) => hex(holder.voice)).sort(),
    [hex(one.pk), hex(two.pk), hex(three.pk)].sort(),
  );
  assert.ok(!holders.some((holder) => hex(holder.voice) === hex(other.pk)));
  assert.deepEqual(Object.keys(holders[0]), ['voice']);

  // The result is a copy: mutating it changes nothing the warden holds.
  holders[0].voice[0] = 255;
  assert.notEqual(warden.standings(beingOne)[0].voice[0], 255);

  // An unknown being answers empty.
  assert.deepEqual(warden.standings(fixed(97)), []);

  // A voice granted then released stops appearing.
  warden.amend(one.pk, { remove: [beingOne] });
  assert.deepEqual(
    warden
      .standings(beingOne)
      .map((holder) => hex(holder.voice))
      .sort(),
    [hex(two.pk), hex(three.pk)].sort(),
  );
});

test('a granted voice is answered, and the answer names the ask by its seq', async () => {
  const { warden, being, voice, object } = await granted();
  const envelope = await ask(warden, voice, { being, method: invoke('add', title('milk')) });
  const back = await warden.judge(envelope, { clock: still, random: RANDOM });
  assert.notEqual(back, null);
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  assert.equal(answer.seq, 1n);
  assert.equal(answered(answer.data), true);
  // The warden never looks inside the arguments; the being got them whole.
  assert.equal(object.calls[0], 'milk');
});

test('the door serves only what the being blueprint declares', async () => {
  const warden = await ground();
  const object = todo();
  // The object carries `complete`, but this being's blueprint declares only
  // `add`. What the blueprint does not declare does not exist for it.
  const being = await holding(warden, object, {
    seed: fixed(5),
    blueprint: `ToDo
  add(title text) bool
`,
  });
  const voice = await signingPair(fixed(6));
  await warden.grant(being, { voiceSeed: fixed(6), heirSeed: fixed(7) });

  const undeclared = await warden.judge(
    await ask(warden, voice, { being, method: invoke('complete') }),
    { clock: still, random: RANDOM },
  );
  assert.equal(undeclared, null);
  // And the object was never reached for at all.
  assert.equal(object.calls.length, 0);

  const declared = await warden.judge(
    await ask(warden, voice, { seq: 2n, being, method: invoke('add', title('milk')) }),
    { clock: still, random: RANDOM },
  );
  const answer = await readAnswer({
    envelope: declared,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  assert.equal(answered(answer.data), true);
});

test('the answer is signed by the warden own name and sealed to the return padlock', async () => {
  const { warden, being, voice } = await granted();
  const back = await warden.judge(await ask(warden, voice, { being, method: invoke('complete') }), {
    clock: still,
    random: RANDOM,
  });
  // Only the padlock the payload named opens it.
  assert.equal(
    await readAnswer({
      envelope: back,
      padlockSecret: (await sealingPair(fixed(30))).secret,
      wardenPk: warden.name.pk,
    }),
    null,
  );
  // And it is believed only from the name that spoke.
  assert.equal(
    await readAnswer({
      envelope: back,
      padlockSecret: caller.secret,
      wardenPk: (await signingPair(fixed(31))).pk,
    }),
    null,
  );
  assert.ok(
    await readAnswer({ envelope: back, padlockSecret: caller.secret, wardenPk: warden.name.pk }),
  );
});

test('the answer data is absent when the field answers nothing', async () => {
  const { warden, being, voice } = await granted();
  const back = await warden.judge(await ask(warden, voice, { being, method: invoke('silent') }), {
    clock: still,
    random: RANDOM,
  });
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  // Absent, not zero bytes: a dummy answer would be an opinion.
  assert.equal(answer.data, null);
  assert.equal(answer.seq, 1n);
});

test('the way back is refreshed by every call that arrives', async () => {
  const { warden, being, voice } = await granted();
  const other = await sealingPair(fixed(40));
  await warden.judge(await ask(warden, voice, { being, method: invoke('complete') }), {
    clock: still,
    random: RANDOM,
  });
  assert.equal(hex(warden.standing(voice.pk).padlock), hex(caller.pk));
  await warden.judge(
    await ask(warden, voice, {
      seq: 2n,
      being,
      method: invoke('complete'),
      padlock: other.pk,
      hints: ['https://moved.example'],
    }),
    { clock: still, random: RANDOM },
  );
  assert.equal(hex(warden.standing(voice.pk).padlock), hex(other.pk));
  assert.deepEqual(warden.standing(voice.pk).hints, ['https://moved.example']);
});

test('an arriving call with empty hints leaves the way back standing', async () => {
  // An end that publishes nothing — the dialing end always — sends empty
  // hints by nature, and a door that erased on that would destroy its own way
  // back to that peer on the peer's first ask.
  const { warden, being, voice } = await granted();
  await warden.judge(
    await ask(warden, voice, {
      being,
      method: invoke('complete'),
      hints: ['https://reachable.example'],
    }),
    { clock: still, random: RANDOM },
  );
  assert.deepEqual(warden.standing(voice.pk).hints, ['https://reachable.example']);
  await warden.judge(
    await ask(warden, voice, { seq: 2n, being, method: invoke('complete'), hints: [] }),
    { clock: still, random: RANDOM },
  );
  assert.deepEqual(warden.standing(voice.pk).hints, ['https://reachable.example']);
});

test('the way back is refreshed between the seq and the leash, so a replay cannot rewrite it', async () => {
  // Where the refresh falls decides two things the door would otherwise get
  // wrong, and both are consequences rather than choices.
  const { warden, being, voice } = await granted();
  const live = await sealingPair(fixed(41));
  const retired = await sealingPair(fixed(42));
  const late = await sealingPair(fixed(43));

  await warden.judge(
    await ask(warden, voice, { seq: 5n, being, method: invoke('complete'), padlock: live.pk }),
    { clock: still, random: RANDOM },
  );
  assert.equal(hex(warden.standing(voice.pk).padlock), hex(live.pk));

  // Not earlier than the seq: a replayed message carries whatever way back the
  // peer had when it was sent, and the seq is the only thing that tells a
  // replay from a call. A door that refreshed first would let anyone who kept a
  // copy overwrite a live way back with a retired one.
  assert.equal(
    await warden.judge(
      await ask(warden, voice, { seq: 5n, being, method: invoke('complete'), padlock: retired.pk }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.equal(
    hex(warden.standing(voice.pk).padlock),
    hex(live.pk),
    'the replay was refused and left the way back alone',
  );

  // And not later than the leash: a message refused for its leash still arrived
  // and still spent its number. A door that refreshed only what it went on to
  // route would slowly lose the way back to any peer whose calls it keeps
  // refusing — and news is what that peer would stop receiving.
  assert.equal(
    await warden.judge(
      await ask(warden, voice, {
        seq: 6n,
        being,
        method: invoke('complete'),
        padlock: late.pk,
        allowance: { time: 0n, hops: 4n },
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.equal(
    hex(warden.standing(voice.pk).padlock),
    hex(late.pk),
    'refused for its leash, and the way back moved anyway',
  );
});

// Step four: the window.

test('a seq above the mark is honoured and moves it', async () => {
  const { warden, being, voice } = await granted();
  for (const seq of [1n, 5n, 6n]) {
    const back = await warden.judge(
      await ask(warden, voice, { seq, being, method: invoke('complete') }),
      { clock: still, random: RANDOM },
    );
    assert.notEqual(back, null, `seq ${seq}`);
  }
  assert.equal(warden.standing(voice.pk).mark, 6n);
});

test('a seq inside the window is honoured once and never again', async () => {
  const { warden, being, voice } = await granted();
  const at = async (seq) =>
    warden.judge(await ask(warden, voice, { seq, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    });
  assert.notEqual(await at(10n), null);
  // Late but inside the window: honoured, because a carriage may reorder.
  assert.notEqual(await at(8n), null);
  // The same bytes again are yesterday's number, and the door has spent it.
  assert.equal(await at(8n), null);
  assert.equal(await at(10n), null);
});

test('a seq below the window is silence', async () => {
  const { warden, being, voice } = await granted();
  const at = async (seq) =>
    warden.judge(await ask(warden, voice, { seq, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    });
  assert.notEqual(await at(1_000n), null);
  assert.equal(await at(1n), null);
  assert.equal(await at(936n), null);
  // The far edge of the window still stands.
  assert.notEqual(await at(937n), null);
});

// Step five: the leash.

test('the leash only shrinks, and the door hands onward less than it received', async () => {
  const { warden, being, voice, object } = await granted();
  let tick = 1_000;
  const moving = () => (tick += 25);
  await warden.judge(
    await ask(warden, voice, {
      being,
      method: invoke('add', title('x')),
      allowance: { time: 5_000n, hops: 4n },
    }),
    { clock: moving, random: RANDOM },
  );
  const onward = object.leashes[0].onward();
  // The hop count falls by one at every door.
  assert.equal(onward.hops, 3n);
  // The time budget falls by this door's own dwell — two readings of one
  // clock, so no two wardens ever compare theirs.
  assert.equal(onward.time, 4_975n);
});

test('a leash exhausted in either dimension is silence, and hops at zero is not exhausted', async () => {
  const { warden, being, voice } = await granted();
  const at = async (allowance, seq) =>
    warden.judge(await ask(warden, voice, { seq, being, method: invoke('complete'), allowance }), {
      clock: still,
      random: RANDOM,
    });
  // The leash is judged on what arrived. A budget at or below zero is silence
  // in either spelling.
  assert.equal(await at({ time: 0n, hops: 4n }, 1n), null);
  assert.equal(await at({ time: -1n, hops: 4n }, 2n), null);
  // A hop count below zero is silence; a hop count of zero is not. Zero is a
  // legal leash for a call that goes no further — what it forbids is onward —
  // so the door judges it and the being answers.
  assert.equal(await at({ time: 5_000n, hops: -1n }, 3n), null);
  assert.notEqual(await at({ time: 5_000n, hops: 0n }, 4n), null);
  assert.notEqual(await at({ time: 1n, hops: 1n }, 5n), null);
});

test('a hop count of zero forbids only the onward ask, and the local work stands', async () => {
  const { warden, being, voice, object } = await granted();
  // The being is reached and does its own work under a leash with nothing left
  // to hand on.
  assert.notEqual(
    await warden.judge(
      await ask(warden, voice, {
        being,
        method: invoke('add', title('endpoint')),
        allowance: { time: 5_000n, hops: 0n },
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.equal(object.calls.length, 1);
  // And what it was handed to reach onward with is a leash no door would take:
  // it refuses to be spent, and an ask made under it is not made at all.
  const leash = object.leashes[0];
  assert.equal(leash.received.hops, 0n);
  assert.equal(leash.onward(), null);
  const elsewhere = await Warden.open({
    nameSeed: fixed(90),
    padlockSeed: fixed(91),
    heirSeed: fixed(92),
  });
  const row = warden.remember({
    warden: elsewhere.name.pk,
    commitment: elsewhere.commitment,
    padlock: elsewhere.padlock.pk,
    heirPublic: elsewhere.name.pk,
    heirSecret: elsewhere.name.secret,
    hints: [],
  });
  assert.equal(warden.ask(row, { seq: 1n, leash, random: RANDOM }), null);
});

test('a leash held outside a judgment carries nothing and cannot be spent', () => {
  const leash = new Leash();
  assert.equal(leash.received, null);
  assert.equal(leash.onward(), null);
});

// The onward reading is taken at the moment of handing onward, so a being that
// dwells inside its own field pays for that dwell out of the budget it hands
// on. This is the case an eagerly computed allowance gets wrong: it charges the
// forwarding being's own thinking time to nobody.
test('a being that dwells in its own field hands onward a budget short by that dwell', async () => {
  const warden = await ground();
  const elsewhere = await Warden.open({
    nameSeed: fixed(93),
    padlockSeed: fixed(94),
    heirSeed: fixed(95),
  });

  let tick = 1_000;
  const moving = () => (tick += 25);

  // A being that acts. It takes its warden the ordinary way any dependency is
  // taken, by its author, on purpose; what it cannot hold in advance is the
  // leash, because that belongs to the message.
  const relay = {
    sent: null,
    row: null,
    async add() {
      // The leash belongs to the message and reaches the being in scope, not
      // as an argument it could have held in advance.
      const leash = current().leash;
      // The work it does on the caller's behalf, before it reaches onward.
      moving();
      moving();
      this.sent = await warden.ask(this.row, { seq: 1n, leash, random: RANDOM });
      return true;
    },
  };
  const being = await holding(warden, relay, { seed: fixed(96), blueprint: LIST });
  relay.row = warden.remember(
    {
      warden: elsewhere.name.pk,
      commitment: elsewhere.commitment,
      padlock: elsewhere.padlock.pk,
      heirPublic: elsewhere.name.pk,
      heirSecret: elsewhere.name.secret,
      hints: [],
    },
    { being },
  );
  const voice = await signingPair(fixed(6));
  await warden.grant(being, { voiceSeed: fixed(6), heirSeed: fixed(7) });

  // Four readings of a clock that moves twenty-five milliseconds each time:
  // arrival, the two ticks of work, and the one taken at the moment of sealing.
  // The dwell is the difference between the first and the last.
  assert.notEqual(
    await warden.judge(await ask(warden, voice, { being, method: invoke('add', title('x')) }), {
      clock: moving,
      random: RANDOM,
    }),
    null,
  );

  const { payload } = await open({
    envelope: relay.sent,
    padlockSecret: elsewhere.padlock.secret,
  });
  assert.equal(payload.allowance.hops, 3n);
  assert.equal(payload.allowance.time, 5_000n - 75n);
});

// Step three: placing the voice, and rotation.

test('rotate-and-ask takes the standing over and asks in the same act', async () => {
  const { warden, being, voice, heir } = await granted();
  const next = await signingPair(fixed(8));
  const back = await warden.judge(
    await ask(
      warden,
      heir,
      {
        commitment: await commitment(warden.name.pk, next.pk),
        seq: 1n,
        being,
        method: invoke('complete'),
      },
      fixed(201),
    ),
    { clock: still, random: RANDOM },
  );
  assert.notEqual(back, null);
  // The pk becomes the current holder, the carried commitment becomes the new
  // heir, and the old key dies.
  const row = warden.standing(heir.pk);
  assert.equal(hex(row.voice), hex(heir.pk));
  assert.equal(hex(row.commitment), hex(await commitment(warden.name.pk, next.pk)));
  assert.equal(warden.standing(voice.pk), null);
  // A standing can be transferred but never copied.
  assert.equal(
    await warden.judge(await ask(warden, voice, { seq: 9n, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
});

test('a rotation starts the mark fresh', async () => {
  const { warden, being, voice, heir } = await granted();
  await warden.judge(await ask(warden, voice, { seq: 500n, being, method: invoke('complete') }), {
    clock: still,
    random: RANDOM,
  });
  const next = await signingPair(fixed(8));
  // The new holder never saw the numbers the old key counted, so a low seq is
  // honoured where it would otherwise be far below the window.
  const back = await warden.judge(
    await ask(warden, heir, {
      commitment: await commitment(warden.name.pk, next.pk),
      seq: 1n,
      being,
      method: invoke('complete'),
    }),
    { clock: still, random: RANDOM },
  );
  assert.notEqual(back, null);
  assert.equal(warden.standing(heir.pk).mark, 1n);
});

test('a rotation carrying no fresh commitment is silence', async () => {
  const { warden, being, heir } = await granted();
  assert.equal(
    await warden.judge(
      await ask(warden, heir, { commitment: null, being, method: invoke('complete') }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
});

test('an heir committed at one door hashes to nothing at another', async () => {
  const { warden, being, heir } = await granted();
  const elsewhere = await Warden.open({
    nameSeed: fixed(20),
    padlockSeed: fixed(21),
    heirSeed: fixed(22),
  });
  const object = todo();
  const there = await holding(elsewhere, object, { seed: fixed(23), blueprint: LIST });
  const next = await signingPair(fixed(8));
  assert.equal(
    await elsewhere.judge(
      await ask(elsewhere, heir, {
        commitment: await commitment(elsewhere.name.pk, next.pk),
        being: there,
        method: invoke('complete'),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  // And it still spends perfectly at the door that minted it.
  assert.notEqual(
    await warden.judge(
      await ask(warden, heir, {
        commitment: await commitment(warden.name.pk, next.pk),
        being,
        method: invoke('complete'),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
});

// Amending, releasing.

test('nothing expires on its own: no door holds a timer and nothing sweeps', async () => {
  // Page 09 says a standing ends when its warden drops the row and never
  // otherwise, so a term-limited relationship is something an operator builds
  // in its own scheduler. Someone will trust that in both directions — building
  // a term on it and finding it does not end, or building a permanent one and
  // finding it does — so the clock is what this case moves.
  const { warden, being, voice } = await granted();
  const granted_at = 1_000;
  let now = granted_at;
  const clock = () => now;

  assert.notEqual(
    await warden.judge(await ask(warden, voice, { seq: 1n, being, method: invoke('complete') }), {
      clock,
      random: RANDOM,
    }),
    null,
  );

  // A hundred years later, on this door's own clock, with nothing having
  // touched the row in between.
  now = granted_at + 100 * 365 * 24 * 60 * 60 * 1000;
  assert.notEqual(
    await warden.judge(await ask(warden, voice, { seq: 2n, being, method: invoke('complete') }), {
      clock,
      random: RANDOM,
    }),
    null,
    'the standing outlived a century because nothing sweeps',
  );

  // And the row itself is untouched by the passage of time: the same voice, the
  // same being, the same commitment it has held since the grant.
  const row = warden.standing(voice.pk);
  assert.notEqual(row, null);
  assert.equal(hex(row.voice), hex(voice.pk), 'the same voice, a century on');

  // The only thing that ends it is the warden dropping the row, which is the
  // case below this one.
  warden.amend(voice.pk, { remove: [being] });
  assert.equal(warden.standing(voice.pk), null);
});

test('a standing is amended, not replaced, and nobody is told', async () => {
  const { warden, being, voice } = await granted();
  const second = await holding(warden, todo(), { seed: fixed(11), blueprint: LIST });
  assert.equal(
    await warden.judge(await ask(warden, voice, { being: second, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
  warden.amend(voice.pk, { add: [second] });
  assert.notEqual(
    await warden.judge(
      await ask(warden, voice, { seq: 2n, being: second, method: invoke('complete') }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  warden.amend(voice.pk, { remove: [second] });
  assert.equal(
    await warden.judge(
      await ask(warden, voice, { seq: 3n, being: second, method: invoke('complete') }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  // The first being is still reached: narrowing took one away, not the row.
  assert.notEqual(
    await warden.judge(await ask(warden, voice, { seq: 4n, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
});

test('taking the last being away is release, and there is no separate act', async () => {
  const { warden, being, voice } = await granted();
  warden.amend(voice.pk, { remove: [being] });
  assert.equal(warden.standing(voice.pk), null);
});

test('releasing a being takes its standings with it', async () => {
  const { warden, being, voice } = await granted();
  assert.equal(warden.release(being), true);
  assert.equal(warden.standing(voice.pk), null);
  assert.equal(warden.release(being), false);
});

test('distance zero waives no step of the judgment', async () => {
  const { warden, being, voice } = await granted();

  // The local road works: a well-formed sealed ask, handed straight to the
  // warden's judge in the same process, answers.
  const envelope = await ask(warden, voice, { being, method: invoke('add', title('milk')) });
  const back = await warden.judge(envelope, { clock: still, random: RANDOM });
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  assert.equal(answered(answer.data), true);

  // The same at distance zero refused: a signature stripped or corrupted in
  // what would have been transit meets silence even though there was no
  // transit — the bytes are handed directly, and the judge still checks
  // every one of them.
  const stranger = await ask(warden, voice, {
    seq: 2n,
    being,
    method: invoke('add', title('milk')),
  });
  for (let at = 0; at < stranger.length; at += 1) {
    const bent = Uint8Array.from(stranger);
    bent[at] ^= 1;
    assert.equal(
      await warden.judge(bent, { clock: still, random: RANDOM }),
      null,
      `byte ${at} bent was answered`,
    );
  }

  // A replayed envelope meets silence too: the same seq handed to the judge
  // a second time, in the very process that spent it, is still spent.
  assert.notEqual(await warden.judge(stranger, { clock: still, random: RANDOM }), null);
  assert.equal(await warden.judge(stranger, { clock: still, random: RANDOM }), null);
});

// Every failure is the same silence.

test('refused, broken, absent and unspendable are indistinguishable', async () => {
  const { warden, being, voice, object } = await granted();
  const stranger = await signingPair(fixed(50));
  const wrongSigner = await signingPair(fixed(51));
  const elsewhere = await Warden.open({
    nameSeed: fixed(60),
    padlockSeed: fixed(61),
    heirSeed: fixed(62),
  });

  const silences = {
    // A signature by a key other than the voice the payload carries.
    'wrong signature': await ask(warden, voice, {
      being,
      method: invoke('complete'),
      signWith: wrongSigner.secret,
    }),
    // A voice in neither record: the stranger's case, a standing at nothing.
    'unknown voice': await ask(warden, stranger, { being, method: invoke('complete') }),
    // A being the voice does not reach.
    'unreached being': await ask(warden, voice, { being: fixed(70), method: invoke('complete') }),
    // A field the blueprint does not declare.
    'absent method': await ask(warden, voice, { being, method: invoke('nosuchfield') }),
    // A being whose code breaks fails inside its warden.
    'broken being': await ask(warden, voice, { being, method: invoke('breaks') }),
    // And one that answers something that is not bytes.
    'nonsense answer': await ask(warden, voice, { being, method: invoke('lies') }),
    // The leash spent: a hop count below zero. Zero itself is legal, because a
    // call that goes no further needs nothing to hand on.
    'exhausted leash': await ask(warden, voice, {
      being,
      method: invoke('complete'),
      allowance: { time: 5_000n, hops: -1n },
    }),
    // A message named for another door, presented here.
    'wrong recipient': await ask(warden, voice, {
      recipient: elsewhere.name.pk,
      being,
      method: invoke('complete'),
    }),
    // Bytes that are not a box this door can open.
    'not our box': await ask(elsewhere, voice, { being, method: invoke('complete') }),
  };

  for (const [what, envelope] of Object.entries(silences)) {
    const back = await warden.judge(envelope, { clock: still, random: RANDOM });
    assert.equal(back, null, `${what} was answered`);
  }
  // Not one of them reached the object.
  assert.equal(object.calls.length, 0);
  // The door stands: a good message still lands. It must carry a fresh
  // number, because the seq is spent at step four, before anything routes —
  // which is exactly why a refusal at step six is not a free retry.
  assert.notEqual(
    await warden.judge(
      await ask(warden, voice, { seq: 2n, being, method: invoke('add', title('ok')) }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.equal(object.calls.length, 1);
});

test('a spent seq is the same silence as a wrong signature', async () => {
  const { warden, being, voice } = await granted();
  const envelope = await ask(warden, voice, { being, method: invoke('complete') });
  assert.notEqual(await warden.judge(envelope, { clock: still, random: RANDOM }), null);
  // A thief replaying yesterday's bytes replays yesterday's number.
  assert.equal(await warden.judge(envelope, { clock: still, random: RANDOM }), null);
  assert.equal(
    await warden.judge(
      await ask(warden, voice, { seq: 2n, being, method: invoke('complete'), signWith: fixed(51) }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
});

test('a voice in the outbound record is news, and news cannot invoke a being', async () => {
  const { warden, being } = await granted();
  const far = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
  });
  const theirBeing = await holding(far, todo(), { seed: fixed(83), blueprint: LIST });
  const invitation = await far.grant(theirBeing, { voiceSeed: fixed(84), heirSeed: fixed(85) });
  warden.remember(invitation, {
    voiceSecret: invitation.heirSecret,
    voicePk: invitation.heirPublic,
  });
  // The far warden's own name is in our outbound record, so a message it
  // signs is placed there rather than in the inbound one.
  assert.ok(await warden.outboundFor(far.name.pk));
  const asFar = { pk: far.name.pk, secret: far.name.secret };
  assert.equal(
    await warden.judge(await ask(warden, asFar, { being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
});

// Step three: the commitment field, and the name it was minted under.

test('a plain ask carrying a commitment is refused', async () => {
  const { warden, being, voice } = await granted();
  const next = await signingPair(fixed(8));
  // The commitment is present only when a message spends an heir. This voice
  // is found as a current holder, so it is an ask and not a rotation.
  assert.equal(
    await warden.judge(
      await ask(warden, voice, {
        seq: 1n,
        commitment: await commitment(warden.name.pk, next.pk),
        being,
        method: invoke('complete'),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  // The standing is untouched by the refusal, and the same ask without the
  // field stands — so what refused it is the field.
  assert.notEqual(
    await warden.judge(await ask(warden, voice, { seq: 2n, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
  assert.equal(
    hex(warden.standing(voice.pk).commitment),
    hex(await commitment(warden.name.pk, (await signingPair(fixed(7))).pk)),
  );
});

test('a commitment is verified at the name it was minted under, so a name succession keeps the standings', async () => {
  const { warden, being, heir } = await granted();
  const mintedAt = warden.name.pk;
  assert.equal(hex(warden.standing((await signingPair(fixed(6))).pk).name), hex(mintedAt));

  // The heavy rotation: the owner's heir spends and the house answers by a new
  // key from here on. The standings stay, and every one of their commitments
  // was hashed under the name the door had then.
  const afterThat = await signingPair(fixed(60));
  warden.name = warden.heir;
  warden.heir = afterThat;
  warden.commitment = await commitment(warden.name.pk, afterThat.pk);
  assert.notEqual(hex(warden.name.pk), hex(mintedAt));

  // The older standing still rotates: its heir hashes to the commitment at the
  // old name, and hashing at the door's current name would find nothing.
  const next = await signingPair(fixed(61));
  const back = await warden.judge(
    await ask(
      warden,
      heir,
      {
        commitment: await commitment(warden.name.pk, next.pk),
        seq: 1n,
        being,
        method: invoke('complete'),
      },
      fixed(202),
    ),
    { clock: still, random: RANDOM },
  );
  assert.notEqual(back, null);

  // And new commitments are minted under the new name, so the chain runs on.
  const row = warden.standing(heir.pk);
  assert.equal(hex(row.name), hex(warden.name.pk));
  const after = await signingPair(fixed(62));
  assert.notEqual(
    await warden.judge(
      await ask(
        warden,
        next,
        {
          commitment: await commitment(warden.name.pk, after.pk),
          seq: 1n,
          being,
          method: invoke('complete'),
        },
        fixed(203),
      ),
      { clock: still, random: RANDOM },
    ),
    null,
  );
});

test('a holder behind a name succession succeeds once, and the rotation after it is silence', async () => {
  // The other side of the case above, and the one the article warns about. A
  // commitment arrives opaque, so a door cannot see which name a holder minted
  // it under and files every new one under the name it has now. A holder that
  // has not heard the news mints under the retired name: the standing it spends
  // was filed there, so the rotation is accepted — and the commitment it
  // carried is filed under the current name, which its own next rotation will
  // not match.
  const { warden, being, heir } = await granted();
  const retired = warden.name.pk;

  const afterThat = await signingPair(fixed(60));
  warden.name = warden.heir;
  warden.heir = afterThat;
  warden.commitment = await commitment(warden.name.pk, afterThat.pk);

  // It succeeds once. The holder is behind, so it hashes against the name it
  // still believes the door wears.
  const next = await signingPair(fixed(63));
  assert.notEqual(
    await warden.judge(
      await ask(
        warden,
        heir,
        {
          commitment: await commitment(retired, next.pk),
          seq: 1n,
          being,
          method: invoke('add', title('x')),
        },
        fixed(204),
      ),
      { clock: still, random: RANDOM },
    ),
    null,
    'the standing it spends was filed under the retired name',
  );

  // The commitment it carried was filed under the door's current name, not the
  // one the holder hashed it under.
  const row = warden.standing(heir.pk);
  assert.equal(hex(row.name), hex(warden.name.pk));
  assert.equal(hex(row.commitment), hex(await commitment(retired, next.pk)));

  // So the rotation after it is silence. Nothing the next message carries can
  // change that: the door places a voice by hashing it against the commitment
  // the row holds, at the name the row holds, and both were fixed by the
  // rotation above. What the new message commits to is never read, because the
  // voice is never recognised as a holder in the first place.
  const after = await signingPair(fixed(64));
  assert.notEqual(
    hex(await commitment(warden.name.pk, next.pk)),
    hex(row.commitment),
    'the door would hash the next voice at its current name and find something else',
  );
  assert.equal(
    await warden.judge(
      await ask(
        warden,
        next,
        {
          commitment: await commitment(warden.name.pk, after.pk),
          seq: 1n,
          being,
          method: invoke('add', title('x')),
        },
        fixed(205),
      ),
      { clock: still, random: RANDOM },
    ),
    null,
  );

  // And hearing the news is what ends it: a holder that learns the succession
  // rotates from a commitment minted under the current name, which is the case
  // above this one. A door keeps no retired name alive to rescue this, because
  // a name it must remember for whoever might still be behind is a name it can
  // never stop remembering.
  assert.equal(warden.standing(after.pk), null);
});

// Step five: the leash, judged on what arrived.

test('a hop count of zero is legal and a hop count below zero is silence', async () => {
  const { warden, object, being, voice } = await granted();
  // What a zero forbids is onward, never the call itself.
  assert.notEqual(
    await warden.judge(
      await ask(warden, voice, {
        seq: 1n,
        allowance: { time: 5_000n, hops: 0n },
        being,
        method: invoke('add', title('milk')),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.equal(object.leashes[0].received.hops, 0n);
  assert.equal(object.leashes[0].onward(), null);
  // Below zero is what the law calls silence, and it never reaches the being.
  assert.equal(
    await warden.judge(
      await ask(warden, voice, {
        seq: 2n,
        allowance: { time: 5_000n, hops: -1n },
        being,
        method: invoke('add', title('bread')),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.equal(object.leashes.length, 1);
});

// The answer's own judgment, at the caller's end.

test('an answer is verified against the warden its record carries, and the door it was asked is a second check', async () => {
  const { warden, being, voice } = await granted();
  const back = await warden.judge(await ask(warden, voice, { being, method: invoke('complete') }), {
    clock: still,
    random: RANDOM,
  });
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  assert.notEqual(answer, null);
  assert.equal(hex(answer.warden), hex(warden.name.pk));
  // That this warden is the one the ask was sent to is the caller's separate
  // judgment, and it refuses on its own.
  assert.equal(
    await readAnswer({ envelope: back, padlockSecret: caller.secret, wardenPk: fixed(99) }),
    null,
  );
});

test('a caller reading an answer takes only the answer byte', async () => {
  const { warden, voice } = await granted();
  // A well-formed say, sealed to the caller's own padlock and signed by the
  // door. There is no generic open: the caller never offers the payload the
  // choice of being read as the other record.
  const say = await seal({
    payload: payloadFor(warden, voice),
    padlock: caller.pk,
    voiceSecret: voice.secret,
    random: fixed(204),
  });
  assert.equal(
    await readAnswer({ envelope: say, padlockSecret: caller.secret, wardenPk: warden.name.pk }),
    null,
  );
});

// Accepting an invitation: the double rotation, done by the kit so that it
// cannot be forgotten. The road is a delivery that hands the bytes straight to
// the granting warden's one door.

async function accepting(granting, invitation, options = {}) {
  const delivery = memoryDelivery();
  const caller = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
    clock: still,
    random: () => crypto.getRandomValues(new Uint8Array(32)),
    delivery,
  });
  for (const hint of invitation.hints) delivery.attach(hint, granting);
  const [handle] = await caller.accept(invitation, options);
  return { caller, handle, row: caller.outbound[0] };
}

test('accept spends the invitation whole, and the granter keys are dead after it', async () => {
  const { warden, voice, heir, invitation } = await granted();
  const { caller, handle, row } = await accepting(warden, invitation);
  // The handle is what a being calls: every declared field an asynchronous
  // method answering a value.
  assert.equal(await handle.add('milk'), true);

  // The standing now stands on a key the caller generated and the granter
  // never saw, committed to an heir the granter never saw either.
  const standing = warden.standing(row.voice.pk);
  assert.ok(standing);
  assert.equal(hex(standing.commitment), hex(await commitment(warden.name.pk, row.heir.pk)));
  // Both of the granter's keys are dead: the voice it minted and the heir it
  // handed out. A standing is transferred and never copied.
  assert.equal(warden.standing(voice.pk), null);
  assert.equal(warden.standing(heir.pk), null);
  assert.ok(caller.padlock.pk);
});

test("the row is scoped to a being of the caller's own, apart from the being addressed", async () => {
  const { warden, being, invitation } = await granted();
  const delivery = memoryDelivery();
  const caller = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
    clock: still,
    random: () => crypto.getRandomValues(new Uint8Array(32)),
    delivery,
  });
  for (const hint of invitation.hints) delivery.attach(hint, warden);
  const mine = await holding(caller, todo(), { seed: fixed(83), blueprint: LIST });
  assert.ok(await caller.accept(invitation, { being: mine }));
  // The row is spent by the caller's own being, never the far being it opens
  // — the two carry different meanings.
  assert.equal(hex(caller.outbound[0].being), hex(mine));
  assert.notEqual(hex(caller.outbound[0].being), hex(being));
});

test('a copy of the invitation can no longer take the standing', async () => {
  const { warden, being, invitation } = await granted();
  await accepting(warden, invitation);

  // Somebody else holding the same invitation — the granter included — replays
  // the holder's first act at the door.
  const thief = await Warden.open({
    nameSeed: fixed(90),
    padlockSeed: fixed(91),
    heirSeed: fixed(92),
  });
  const row = thief.remember(invitation);
  const mine = await signingPair(fixed(93));
  assert.equal(
    await warden.judge(
      await thief.ask(row, {
        seq: 1n,
        commitment: await commitment(warden.name.pk, mine.pk),
        being,
        method: invoke('complete'),
        random: fixed(205),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  // The heir it holds is nobody's holder and hashes to nothing this door keeps.
  assert.equal(warden.standing(invitation.heirPublic), null);
});

test('a warden is total over what it holds, and two wardens are strangers', async () => {
  const { warden, being, voice } = await granted();
  const neighbour = await Warden.open({
    nameSeed: fixed(90),
    padlockSeed: fixed(91),
    heirSeed: fixed(92),
  });
  // Same machine, no privileged path: the neighbour holds no row for this
  // voice and no pointer to this being.
  assert.equal(neighbour.standing(voice.pk), null);
  assert.equal(
    await neighbour.judge(await ask(neighbour, voice, { being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
});

// An armed commitment: a door standing open for a claim whose keys it never
// minted. The claimant arrives as any stranger does, and its own keys become
// the holder — the step-three rotation path with the minting taken out.
async function armed() {
  const warden = await ground();
  const object = todo();
  const being = await holding(warden, object, { seed: fixed(5), blueprint: LIST });
  // The keys were made somewhere else entirely; the door is handed the hash.
  const key = await signingPair(fixed(30));
  warden.arm(await commitment(warden.name.pk, key.pk), { beings: [being] });
  return { warden, object, being, key };
}

// The claim, exactly as a rotation is made: signed by the key the commitment
// was hashed from, committing to a fresh heir of the claimant's own.
async function claim(warden, key, over = {}) {
  return ask(warden, key, {
    commitment: await commitment(warden.name.pk, (await signingPair(fixed(31))).pk),
    ...over,
  });
}

test('an armed commitment is claimed by a stranger, and the standing is written at the named beings', async () => {
  const { warden, being, key } = await armed();
  // Nothing was written in advance: an armed commitment is held at the door,
  // never as a row, so before the claim this voice stands at nothing.
  assert.equal(warden.standing(key.pk), null);
  assert.equal(warden.inbound.size, 0);

  const back = await warden.judge(
    await claim(warden, key, { being, method: invoke('add', title('milk')) }),
    { clock: still, random: RANDOM },
  );
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  assert.equal(answered(answer.data), true);

  // The claimant's own keys are the holder, and the door minted nothing.
  const row = warden.standing(key.pk);
  assert.equal(hex(row.voice), hex(key.pk));
  assert.ok(row.beings.has(hex(being)));
  // And the arm is spent.
  assert.equal(warden.armed.length, 0);
});

test('a wrong proof of an armed commitment is ordinary silence and leaves the arm standing', async () => {
  const { warden, being, object } = await armed();
  // A voice that hashes to nothing this door holds. It is a stranger, and a
  // stranger reaches the public being alone.
  const thief = await signingPair(fixed(40));
  assert.equal(
    await warden.judge(await claim(warden, thief, { being, method: invoke('add', title('x')) }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
  assert.equal(object.calls.length, 0);
  assert.equal(warden.standing(thief.pk), null);
  // The arm stands: a claim nobody proved spends nothing.
  assert.equal(warden.armed.length, 1);
});

test('an armed commitment is spent once, and a second claim on it meets silence', async () => {
  const { warden, being, key } = await armed();
  assert.notEqual(
    await warden.judge(await claim(warden, key, { being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );

  assert.equal(warden.armed.length, 0);

  // Take the standing the claim wrote back out, so the voice is unknown to the
  // door again and only the arm could let it in. It cannot: the arm was spent
  // by the first claim, and a second claim on it is silence like any other.
  warden.inbound.delete(hex(key.pk));
  assert.equal(
    await warden.judge(await claim(warden, key, { seq: 2n, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
  assert.equal(warden.standing(key.pk), null);
});

test('one outbound row is dropped at one far warden, and the being other rows stand', async () => {
  const warden = await ground();
  const being = await holding(warden, todo(), { seed: fixed(5), blueprint: LIST });
  const other = await holding(warden, todo(), { seed: fixed(50), blueprint: LIST });

  const houses = [];
  for (const at of [60, 70]) {
    houses.push(
      await Warden.open({
        nameSeed: fixed(at),
        padlockSeed: fixed(at + 1),
        heirSeed: fixed(at + 2),
      }),
    );
  }
  const invitationTo = (house) => ({
    warden: house.name.pk,
    commitment: house.commitment,
    padlock: house.padlock.pk,
    heirPublic: house.name.pk,
    heirSecret: house.name.secret,
    hints: [],
  });
  warden.remember(invitationTo(houses[0]), { being });
  warden.remember(invitationTo(houses[1]), { being });
  warden.remember(invitationTo(houses[0]), { being: other });
  assert.equal(warden.outbound.length, 3);

  // One row goes, named by the being and the far door it stands at — no
  // consumer reaches into the record to do it.
  assert.equal(warden.forget(being, { at: houses[0].name.pk }), 1);
  assert.equal(warden.relationsOf(being).length, 1);
  assert.equal(hex(warden.relationsOf(being)[0].warden), hex(houses[1].name.pk));
  // The other being's row at that same house is untouched.
  assert.equal(warden.relationsOf(other).length, 1);
  // And without `at` it is still the whole being.
  assert.equal(warden.forget(being), 1);
  assert.equal(warden.relationsOf(being).length, 0);
});

test('silence is observable inward, and the wire answer is the same silence either way', async () => {
  const { warden, being, voice } = await granted();
  // `breaks` throws, which is the fault an answering layer most wants back.
  const envelope = await ask(warden, voice, { being, method: invoke('breaks') });

  // First without an observer at all: the door falls silent.
  const quiet = await warden.judge(envelope, { clock: still, random: RANDOM });
  assert.equal(quiet, null);

  const seen = [];
  warden.observe((fault) => seen.push(fault));
  // The same fault again, one seq on, so it is the fault being judged and not
  // the replay.
  const watched = await warden.judge(
    await ask(warden, voice, { seq: 2n, being, method: invoke('breaks') }),
    { clock: still, random: RANDOM },
  );

  // Inward, the house knows exactly what happened and where.
  assert.equal(seen.length, 1);
  assert.equal(seen[0].reason, 'threw');
  assert.equal(seen[0].method, 'breaks');
  assert.equal(hex(seen[0].being), hex(being));
  assert.equal(seen[0].thrown.message, 'the being fell over');
  // Outward, byte for byte, it is the identical nothing: no envelope, watched
  // or not.
  assert.equal(watched, null);
  assert.equal(watched, quiet);

  // An observer that falls over changes no answer either.
  warden.observe(() => {
    throw new Error('the watcher fell over');
  });
  assert.equal(
    await warden.judge(await ask(warden, voice, { seq: 3n, being, method: invoke('breaks') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
});

test('the verified caller is offered inward, and a stranger is offered as one', async () => {
  const { warden, being, voice } = await granted();
  const offered = [];
  warden.offer((one) => offered.push(one));

  // An ordinary ask: the house is told the holder that made it, and nothing
  // else — no marks, no window, no padlock, no hints.
  await warden.judge(await ask(warden, voice, { being, method: invoke('complete') }), {
    clock: still,
    random: RANDOM,
  });
  assert.equal(offered.length, 1);
  assert.deepEqual(Object.keys(offered[0]).sort(), ['kind', 'voice']);
  assert.equal(offered[0].kind, 'holder');
  assert.equal(hex(offered[0].voice), hex(voice.pk));
  // A copy: writing to it reaches nothing the warden holds.
  offered[0].voice[0] = 255;
  assert.notEqual(warden.standing(voice.pk).voice[0], 255);

  // A stranger's describe is served, and offered as what it is.
  const nobody = await signingPair(fixed(88));
  await warden.judge(await ask(warden, nobody, { seq: 4n }), { clock: still, random: RANDOM });
  assert.equal(offered.length, 2);
  assert.equal(offered[1].kind, 'stranger');
  assert.equal(hex(offered[1].voice), hex(nobody.pk));

  // The offer is made once the caller is verified, so a call the routing then
  // refuses was still offered — the caller is a fact, and the refusal is the
  // door's own.
  await warden.judge(
    await ask(warden, voice, { seq: 2n, being: fixed(96), method: invoke('add', title('x')) }),
    {
      clock: still,
      random: RANDOM,
    },
  );
  assert.equal(offered.length, 3);
  assert.equal(offered[2].kind, 'holder');
});

test('after a rotation the offered voice is the new holder', async () => {
  const { warden, being, heir } = await granted();
  const next = await signingPair(fixed(8));
  const offered = [];
  warden.offer((one) => offered.push(one));
  const back = await warden.judge(
    await ask(
      warden,
      heir,
      {
        commitment: await commitment(warden.name.pk, next.pk),
        seq: 1n,
        being,
        method: invoke('complete'),
      },
      fixed(201),
    ),
    { clock: still, random: RANDOM },
  );
  assert.notEqual(back, null);
  assert.equal(offered.length, 1);
  assert.equal(offered[0].kind, 'rotation');
  assert.equal(hex(offered[0].voice), hex(heir.pk));
});

test('the offer changes no byte of the answer', async () => {
  const one = await granted();
  const two = await granted();
  const envelope = await ask(one.warden, one.voice, {
    being: one.being,
    method: invoke('add', title('milk')),
  });

  const quiet = await one.warden.judge(envelope, { clock: still, random: RANDOM });
  two.warden.offer(() => {});
  const watched = await two.warden.judge(envelope, { clock: still, random: RANDOM });
  assert.notEqual(quiet, null);
  assert.equal(hex(watched), hex(quiet));

  // And a consumer that falls over is the consumer's problem.
  const three = await granted();
  three.warden.offer(() => {
    throw new Error('the house fell over');
  });
  assert.equal(
    hex(await three.warden.judge(envelope, { clock: still, random: RANDOM })),
    hex(quiet),
  );
});

test('a hop this kit refuses itself spends no number against the far door', async () => {
  const warden = await ground();
  const elsewhere = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
  });
  const row = warden.remember({
    warden: elsewhere.name.pk,
    commitment: elsewhere.commitment,
    padlock: elsewhere.padlock.pk,
    heirPublic: elsewhere.name.pk,
    heirSecret: elsewhere.name.secret,
    hints: [],
  });

  // A budget with nothing left in it. The kit refuses the hop itself and puts
  // no message on the wire.
  assert.equal(
    warden.ask(row, { seq: 5n, allowance: { time: 0n, hops: 4n }, random: RANDOM }),
    null,
  );
  assert.equal(row.seq, 0n);
  assert.equal(
    warden.ask(row, { seq: 5n, allowance: { time: 5_000n, hops: -1n }, random: RANDOM }),
    null,
  );
  assert.equal(row.seq, 0n);

  // A message actually sent spends its number.
  assert.notEqual(await warden.ask(row, { seq: 5n, random: RANDOM }), null);
  assert.equal(row.seq, 5n);
});

test('a rotation whose answer never comes has either landed or not, and both keys are needed to find out', async () => {
  // The one awkward moment no helper removes: between sending a rotation and
  // reading its answer, a caller does not know which key the far door now
  // holds, and the door will not say. The two cases below are the same silence
  // from the caller's side and opposite states at the door — which is the whole
  // reason a caller keeps both keys until a message signed with the new one is
  // answered.
  const landed = await granted();
  const next = await signingPair(fixed(8));
  // It arrived and was answered into a connection that dropped. The caller saw
  // nothing; the door moved on.
  await landed.warden.judge(
    await ask(landed.warden, landed.heir, {
      commitment: await commitment(landed.warden.name.pk, next.pk),
      seq: 1n,
      being: landed.being,
      method: invoke('complete'),
    }),
    { clock: still, random: RANDOM },
  );
  const spent = async (one, voice, seq) =>
    one.warden.judge(
      await ask(one.warden, voice, { seq, being: one.being, method: invoke('complete') }),
      { clock: still, random: RANDOM },
    );
  // The old key is dead and the new one is the holder: a caller that threw the
  // old key away on the strength of having sent something would be fine, and a
  // caller that kept only the old one would be locked out.
  assert.equal(await spent(landed, landed.voice, 2n), null);
  assert.notEqual(await spent(landed, landed.heir, 2n), null);

  const lost = await granted();
  // The mirror: the envelope never arrived at all. Nothing is judged.
  await ask(lost.warden, lost.heir, {
    commitment: await commitment(lost.warden.name.pk, next.pk),
    seq: 1n,
    being: lost.being,
    method: invoke('complete'),
  });
  // Now the opposite pair holds, and the caller cannot tell this apart from the
  // case above by anything the door said.
  assert.notEqual(await spent(lost, lost.voice, 2n), null);
  assert.equal(await spent(lost, lost.heir, 2n), null);
});

test('a rotation refused for its number has taken the standing over anyway, and asking again on the new voice recovers it', async () => {
  // The trap is where the refusal falls. The rotation lands at step 4 and the
  // number is judged at step 5, so the takeover has already happened when the
  // silence comes back: the standing stands on the new voice and the old key is
  // dead. Nothing is beyond recovery — a refusal at step 5 spends nothing — but
  // the caller cannot see any of that, and the natural reading of silence is
  // the one that loses it.
  const { warden, being, voice, heir } = await granted();
  const next = await signingPair(fixed(8));
  const refused = await warden.judge(
    await ask(warden, heir, {
      commitment: await commitment(warden.name.pk, next.pk),
      // Below the first legal number, so step 5 refuses it.
      seq: 0n,
      being,
      method: invoke('complete'),
    }),
    { clock: still, random: RANDOM },
  );
  assert.equal(refused, null);

  // Silence, and the takeover happened all the same.
  assert.equal(warden.standing(voice.pk), null, 'the old key died at step 4');
  const row = warden.standing(heir.pk);
  assert.notEqual(row, null, 'the standing changed hands before the number was judged');
  assert.equal(hex(row.commitment), hex(await commitment(warden.name.pk, next.pk)));

  // The recovery, which is the whole point of the correction: ask again on the
  // voice the rotation moved to. Nothing was spent, so a plain ask is answered.
  assert.notEqual(
    await warden.judge(await ask(warden, heir, { seq: 1n, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
    'a refusal at step 5 spends nothing, so the new voice opens where it likes',
  );

  // And the loss, which is a reading of silence rather than a rule. A holder
  // that takes silence for "the rotation did not land" retries the whole
  // rotate-and-ask — signing with the key it just retired — and is refused for
  // that, now and every time after.
  const retry = async (seq) =>
    warden.judge(
      await ask(warden, voice, {
        commitment: await commitment(warden.name.pk, next.pk),
        seq,
        being,
        method: invoke('complete'),
      }),
      { clock: still, random: RANDOM },
    );
  assert.equal(await retry(1n), null);
  assert.equal(await retry(2n), null, 'and no number it picks brings the retired key back');
});

test('a fresh mark honours any number at or above one, so no door may require exactly one', async () => {
  // A door that required a first message to carry exactly one would refuse a
  // conforming stranger in silence, telling it nothing to fix — and by the case
  // above, leaving a live standing dead with no fault anyone can find. Which
  // number a caller opens with, above one, is the caller's own.
  const { warden, being, heir } = await granted();
  const next = await signingPair(fixed(8));
  const back = await warden.judge(
    await ask(warden, heir, {
      commitment: await commitment(warden.name.pk, next.pk),
      seq: 8_675_309n,
      being,
      method: invoke('complete'),
    }),
    { clock: still, random: RANDOM },
  );
  assert.notEqual(back, null, 'a fresh mark stands below every legal number');

  // And the mark moved there, so the numbers under it are gone rather than
  // waiting to be used.
  assert.equal(
    await warden.judge(await ask(warden, heir, { seq: 12n, being, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
});

// The same ground twice over, holding whatever object the case wants to put
// behind one blueprint. Every seed is the one `granted` uses, so two of these
// are the same house down to the keys and only the being's own code differs —
// which is what lets two answers be compared byte for byte.
async function standing(object) {
  const warden = await ground();
  const being = await holding(warden, object, { seed: fixed(5), blueprint: LIST });
  const voice = await signingPair(fixed(6));
  await warden.grant(being, { voiceSeed: fixed(6), heirSeed: fixed(7) });
  return { warden, object, being, voice };
}

test('a being never produces silence, whatever it answers', async () => {
  // A call meets two layers and only the first can be silent. Past the door the
  // being always answers, so nothing a being returns can make the door go
  // quiet — which is why a being that wants to say no says it in a field.
  const beings = {
    'the value the field declares': { add: () => true, silent() {} },
    'a refusal written into the field, which is the only way to refuse': {
      add: () => false,
      silent() {},
    },
    'nothing at all, where the field answers nothing': { add: () => true, silent() {} },
  };

  for (const [what, object] of Object.entries(beings)) {
    const one = await standing(object);
    // A number apiece: two asks under one seq would be a replay, which is the
    // door's silence and would prove nothing about the being.
    for (const [at, field] of ['add', 'silent'].entries()) {
      const back = await one.warden.judge(
        await ask(one.warden, one.voice, {
          seq: BigInt(at + 1),
          being: one.being,
          method: field === 'add' ? invoke('add', title('x')) : invoke(field),
        }),
        { clock: still, random: RANDOM },
      );
      assert.notEqual(back, null, `${what}, asked ${field}, went silent`);
    }
  }

  // And the refusal a being writes for itself arrives as an ordinary answer,
  // named by the ask's own number like any other.
  const refuser = await standing({ add: () => false, silent() {} });
  const answer = await readAnswer({
    envelope: await refuser.warden.judge(
      await ask(refuser.warden, refuser.voice, {
        being: refuser.being,
        method: invoke('add', title('x')),
      }),
      { clock: still, random: RANDOM },
    ),
    padlockSecret: caller.secret,
    wardenPk: refuser.warden.name.pk,
  });
  assert.equal(answered(answer.data), false);
  assert.equal(answer.seq, 1n);
});

test('on a field answering nothing, a call that ran and one the being refused are the same bytes', async () => {
  // The cost of the rule above, stated rather than hidden. A being whose
  // callers must tell these apart declares a field that says which, and that is
  // the being author's affair rather than the protocol's.
  const ran = [];
  const worked = await standing({
    silent() {
      ran.push('did the work');
    },
  });
  const declined = await standing({
    silent() {
      // Decided against it, and has no way to say so on this field.
    },
  });

  const envelope = await ask(worked.warden, worked.voice, {
    being: worked.being,
    method: invoke('silent'),
  });
  const one = await worked.warden.judge(envelope, { clock: still, random: RANDOM });
  const two = await declined.warden.judge(envelope, { clock: still, random: RANDOM });

  assert.equal(ran.length, 1, 'one being did the work and the other did not');
  assert.notEqual(one, null);
  assert.equal(hex(two), hex(one), 'and the two answers are the same bytes on the wire');
});

test('a warden succeeds its own name only to the key it committed to', async () => {
  const warden = await ground();
  const was = warden.name.pk;
  const wasCommitment = warden.commitment;

  // A key this door never committed to moves nothing. A door that adopted one
  // would be a door no peer could believe: every peer holds the hash of the
  // heir and nothing else.
  assert.equal(await warden.succeed({ nameSeed: fixed(9), heirSeed: fixed(10) }), null);
  assert.equal(hex(warden.name.pk), hex(was));
  assert.equal(hex(warden.commitment), hex(wasCommitment));

  const heir = await signingPair(fixed(3));
  const next = await signingPair(fixed(10));
  const moved = await warden.succeed({ nameSeed: fixed(3), heirSeed: fixed(10) });
  assert.equal(hex(moved.name), hex(heir.pk), 'the heir the founding committed to is the name now');
  // The next commitment is minted under the name the door has now, so the peer
  // that believes this succession can believe the one after it.
  assert.equal(hex(warden.commitment), hex(await commitment(heir.pk, next.pk)));
  // The public being's pk is the warden's own name, so it moved with it — and
  // so did the card a stranger begins from.
  assert.equal(hex(warden.publicBeing().pk), hex(heir.pk));
  assert.equal(hex(warden.card().warden), hex(heir.pk));
  // Which is exactly what a peer hashes the succession against: the old name
  // and the new one hash to the commitment the peer already held.
  assert.equal(hex(await commitment(was, heir.pk)), hex(wasCommitment));
});

test('a standing granted before a name succession still rotates, at the name its commitment was minted under', async () => {
  // The consequence a standing keeps its own name for. Every commitment was
  // hashed with a door's name inside it, so a door that verified an older
  // standing's heir at the name it wears now would refuse a rotation the
  // holder is entitled to make — and by the correction above, refusing a
  // rotation costs the holder the standing.
  const { warden, being, heir } = await granted();
  await warden.succeed({ nameSeed: fixed(3), heirSeed: fixed(10) });

  const next = await signingPair(fixed(8));
  const answer = await warden.judge(
    await ask(warden, heir, {
      // Minted under the name the door has now, because that is where this
      // heir would spend.
      commitment: await commitment(warden.name.pk, next.pk),
      being,
      method: invoke('complete'),
    }),
    { clock: still, random: RANDOM },
  );
  assert.notEqual(answer, null, 'the older standing rotated at the name it was minted at');

  const row = warden.standing(heir.pk);
  assert.equal(hex(row.name), hex(warden.name.pk), 'and the row is at the new name from here on');

  // Which is the whole of it: the next rotation is verified at the new name.
  assert.notEqual(
    await warden.judge(
      await ask(warden, next, {
        commitment: await commitment(warden.name.pk, (await signingPair(fixed(11))).pk),
        seq: 1n,
        being,
        method: invoke('complete'),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
});
