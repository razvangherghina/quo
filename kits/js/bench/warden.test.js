import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Warden,
  readAnswer,
  seal,
  signingPair,
  sealingPair,
  commitment,
  decodeAnswer,
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

const LIST = `ToDo
  add(title text) bool
  complete(id text) bool
`;

function ground() {
  return Warden.open({
    nameSeed: fixed(1),
    padlockSeed: fixed(2),
    heirSeed: fixed(3),
    hints: ['https://door.example'],
  });
}

// An ordinary object. It carries no authority logic of any kind, never learns
// it has an address, and never learns who is calling.
function todo() {
  return {
    calls: [],
    leashes: [],
    add(args, leash) {
      this.calls.push(args);
      this.leashes.push(leash);
      return utf8.encode('added');
    },
    complete() {
      return utf8.encode('done');
    },
    breaks() {
      throw new Error('the being fell over');
    },
    lies() {
      return 'not bytes';
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
  const being = await warden.hold(object, { seed: fixed(5), blueprint: LIST });
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
  const being = await warden.hold(object, { seed: fixed(5), blueprint: LIST });
  // A being is named by its pk, and the warden minted it.
  assert.equal(being.length, 32);
  assert.equal(hex(being), hex((await signingPair(fixed(5))).pk));
  // Nothing is ever injected into an object behind its back: the object's own
  // source is untouched and it never learns it has an address.
  assert.deepEqual(Object.keys(object).sort(), before);
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

test('a granted voice is answered, and the answer names the ask by its seq', async () => {
  const { warden, being, voice, object } = await granted();
  const envelope = await ask(warden, voice, { being, method: invoke('add', utf8.encode('milk')) });
  const back = await warden.judge(envelope, { clock: still, random: RANDOM });
  assert.notEqual(back, null);
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  assert.equal(answer.seq, 1n);
  assert.equal(Buffer.from(answer.data).toString(), 'added');
  // The warden never looks inside the arguments; the being got them whole.
  assert.equal(Buffer.from(object.calls[0]).toString(), 'milk');
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
      method: invoke('add', utf8.encode('x')),
      allowance: { time: 5_000n, hops: 4n },
    }),
    { clock: moving, random: RANDOM },
  );
  const onward = object.leashes[0];
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
        method: invoke('add', utf8.encode('endpoint')),
        allowance: { time: 5_000n, hops: 0n },
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.equal(object.calls.length, 1);
  // And what it was handed to reach onward with is a leash no door would take:
  // an ask made under it is not made at all.
  const onward = object.leashes[0];
  assert.equal(onward.hops, -1n);
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
  assert.equal(warden.ask(row, { seq: 1n, allowance: onward, random: RANDOM }), null);
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
  const there = await elsewhere.hold(object, { seed: fixed(23), blueprint: LIST });
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

test('a standing is amended, not replaced, and nobody is told', async () => {
  const { warden, being, voice } = await granted();
  const second = await warden.hold(todo(), { seed: fixed(11), blueprint: LIST });
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
      await ask(warden, voice, { seq: 2n, being, method: invoke('add', utf8.encode('ok')) }),
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
  const theirBeing = await far.hold(todo(), { seed: fixed(83), blueprint: LIST });
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
