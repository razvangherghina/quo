// Every describe is scoped by the same binary record, without exception, and
// the answer is the same shape whoever asks: digests, and the pks under them.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Warden,
  WARDEN_BLUEPRINT,
  WARDEN_DIGEST,
  digest,
  parse,
  print,
  readAnswer,
  readField,
  writeArgument,
  seal,
  sealingPair,
  signingPair,
  sha256,
} from '../src/index.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();
const still = () => 1_000;
const RANDOM = fixed(200);

const LIST = `ToDo
  add(title text) bool
  complete(id text) bool
`;

const NOTE = `Note
  read() text
`;

const caller = await sealingPair(fixed(4));

function ground(over = {}) {
  return Warden.open({
    nameSeed: fixed(1),
    padlockSeed: fixed(2),
    heirSeed: fixed(3),
    hints: ['https://door.example'],
    ...over,
  });
}

function todo() {
  return {
    complete: () => utf8.encode('done'),
  };
}

function ask(warden, voice, over = {}) {
  return seal({
    payload: {
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
    },
    padlock: warden.padlock.pk,
    voiceSecret: voice.secret,
    random: RANDOM,
  });
}

// Ask, and read the field's own answer back out of the data.
async function answered(warden, voice, over, field) {
  const back = await warden.judge(await ask(warden, voice, over), { clock: still, random: RANDOM });
  if (back === null) return null;
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: caller.secret,
    wardenPk: warden.name.pk,
  });
  assert.equal(answer.seq, over.seq ?? 1n);
  return field ? readField(field, answer.data) : answer;
}

// The warden's own fields take their single argument encoded by the notation,
// exactly as every other argument in Quo — so a `bytes` argument carries its
// length and a `being` rides bare.
function field(name, value) {
  return { name, args: writeArgument(name, value) };
}

function invoke(name, args = new Uint8Array(0)) {
  return { name, args };
}

// A ground holding two lists and a note, with one voice granted at one list.
async function estate() {
  const warden = await ground({ limit: 65_536n });
  const one = await warden.hold(todo(), { seed: fixed(5), blueprint: LIST });
  const two = await warden.hold(todo(), { seed: fixed(11), blueprint: LIST });
  const note = await warden.hold(
    { read: () => utf8.encode('n') },
    { seed: fixed(12), blueprint: NOTE },
  );
  const voice = await signingPair(fixed(6));
  await warden.grant(one, { voiceSeed: fixed(6), heirSeed: fixed(7) });
  warden.amend(voice.pk, { add: [two] });
  return { warden, one, two, note, voice };
}

const stranger = await signingPair(fixed(50));

test('the warden blueprint is canonical notation and every warden shares its digest', async () => {
  assert.equal(print(parse(WARDEN_BLUEPRINT)), WARDEN_BLUEPRINT);
  const other = await Warden.open({
    nameSeed: fixed(20),
    padlockSeed: fixed(21),
    heirSeed: fixed(22),
  });
  assert.equal(hex((await ground()).publicBeing().digest), hex(WARDEN_DIGEST));
  assert.equal(hex(other.publicBeing().digest), hex(WARDEN_DIGEST));
  // Its digest is a fact about the text, not about the door that holds it.
  assert.equal(hex(WARDEN_DIGEST), hex(await digest(parse(WARDEN_BLUEPRINT))));
});

test('the estate is what that voice may reach, grouped by digest', async () => {
  const { warden, one, two, note, voice } = await estate();
  const answer = await answered(warden, voice, {}, 'describe');
  const classes = new Map(answer.classes.map((c) => [hex(c.digest), c.beings]));
  // Two beings of one class carry one digest: a thousand lists cost one
  // interface. The grouping is the identity, not a courtesy.
  const list = classes.get(hex(await digest(parse(LIST))));
  assert.deepEqual(
    list.map((held) => hex(held.being)),
    [hex(one), hex(two)].sort(),
  );
  // Each being comes with its heir commitment — what lets the peer believe
  // that being's succession when the news comes.
  for (const held of list) {
    assert.deepEqual(Object.keys(held).sort(), ['being', 'commitment']);
    assert.equal(held.commitment.length, 32);
    assert.equal(hex(held.commitment), hex(warden.beings.get(hex(held.being)).commitment));
  }
  // The order is derived, never chosen: classes by digest bytes ascending,
  // beings under each by pk bytes ascending.
  const bytes = (a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b));
  for (let at = 1; at < answer.classes.length; at += 1) {
    assert.ok(bytes(answer.classes[at - 1].digest, answer.classes[at].digest) < 0);
  }
  assert.ok(bytes(list[0].being, list[1].being) < 0);
  // The note is held by this door and reached by nobody, so it is not here.
  assert.equal(classes.has(hex(await digest(parse(NOTE)))), false);
  assert.equal(hex(note).length, 64);
  // The public being is reachable by everyone, holders included, so it appears
  // in every estate.
  assert.deepEqual(
    classes.get(hex(WARDEN_DIGEST)).map((held) => hex(held.being)),
    [hex(warden.name.pk)],
  );
  // And the warden's own commitment is its own heir, committed at itself.
  assert.equal(hex(classes.get(hex(WARDEN_DIGEST))[0].commitment), hex(warden.commitment));
});

test('a stranger gets a house with one room in it, in the holder shape', async () => {
  const { warden, voice } = await estate();
  const mine = await answered(warden, stranger, {}, 'describe');
  assert.equal(mine.classes.length, 1);
  assert.equal(hex(mine.classes[0].digest), hex(WARDEN_DIGEST));
  assert.deepEqual(
    mine.classes[0].beings.map((one) => hex(one.being)),
    [hex(warden.name.pk)],
  );
  // The same shape whoever asks: digests, and the pks under them.
  const held = await answered(warden, voice, {}, 'describe');
  const shape = (e) =>
    e.classes.map((c) => [
      c.digest.length,
      c.beings.every((b) => b.being.length === 32 && b.commitment.length === 32),
    ]);
  assert.deepEqual(shape(mine), [[32, true]]);
  assert.deepEqual(shape(held).length, 2);
});

test('the estate is also the answer to describe on the public being', async () => {
  const { warden, voice } = await estate();
  const bare = await answered(warden, voice, {}, 'describe');
  const named = await answered(
    warden,
    voice,
    { seq: 2n, being: warden.name.pk, method: invoke('describe') },
    'describe',
  );
  assert.deepEqual(named, bare);
});

test('a being named with no method is a sketch: pk, digest and commitment, never state', async () => {
  const { warden, one, voice } = await estate();
  const sketch = await answered(warden, voice, { being: one }, 'sketch');
  assert.deepEqual(Object.keys(sketch).sort(), ['being', 'commitment', 'digest']);
  assert.equal(hex(sketch.being), hex(one));
  assert.equal(hex(sketch.digest), hex(await digest(parse(LIST))));
  // The commitment serves the peer, and the describe is where it receives it.
  assert.equal(hex(sketch.commitment), hex(warden.beings.get(hex(one)).commitment));
});

test('asking about a being outside your standing is silence, in either form', async () => {
  const { warden, note, voice } = await estate();
  // Silence and absence are two different answers, ruled apart: a door that
  // answered "absent" about a being you do not reach would be a door
  // confirming the being exists, and that is a probe answered.
  assert.equal(
    await warden.judge(await ask(warden, voice, { being: note }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
  assert.equal(
    await warden.judge(
      await ask(warden, voice, { seq: 2n, being: warden.name.pk, method: sketchOf(note) }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  // A being nobody in the world holds is the same silence, so nothing is
  // learned by guessing.
  assert.equal(
    await warden.judge(
      await ask(warden, voice, { seq: 3n, being: warden.name.pk, method: sketchOf(fixed(123)) }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
  assert.ok(
    await answered(
      warden,
      voice,
      { seq: 4n, being: warden.name.pk, method: sketchOf(warden.name.pk) },
      'sketch',
    ),
  );
});

function sketchOf(beingPk) {
  return field('sketch', beingPk);
}

test('a blueprint is answered to a voice that reaches that class, and it verifies', async () => {
  const { warden, voice } = await estate();
  const at = await digest(parse(LIST));
  const text = await answered(
    warden,
    voice,
    { being: warden.name.pk, method: field('blueprint', at) },
    'blueprint',
  );
  assert.equal(text, LIST);
  // Content-addressed text cannot be swapped for something friendlier by
  // whoever carried it: hash what comes back.
  assert.equal(hex(await digest(parse(text))), hex(at));
});

test('a blueprint digest the voice does not reach is silence, guessed or held', async () => {
  const { warden, voice } = await estate();
  const held = await digest(parse(NOTE));
  const guessed = await sha256(utf8.encode('a hash nobody minted'));
  for (const [what, at] of [
    ['held but unreached', held],
    ['guessed', guessed],
  ]) {
    assert.equal(
      await warden.judge(
        await ask(warden, voice, { being: warden.name.pk, method: field('blueprint', at) }),
        { clock: still, random: RANDOM },
      ),
      null,
      what,
    );
  }
});

test('the public being declares what the warden chooses, and a stranger is answered it', async () => {
  const warden = await ground({ declares: [NOTE] });
  const at = await digest(parse(NOTE));
  assert.equal(
    await answered(
      warden,
      stranger,
      { being: warden.name.pk, method: field('blueprint', at) },
      'blueprint',
    ),
    NOTE,
  );
  // A door that declared nothing answers the same digest with silence.
  const closed = await ground();
  assert.equal(
    await closed.judge(
      await ask(closed, stranger, { being: closed.name.pk, method: field('blueprint', at) }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
});

test('the warden own digest text is answered on request, to a stranger too', async () => {
  const { warden } = await estate();
  const text = await answered(
    warden,
    stranger,
    { being: warden.name.pk, method: field('blueprint', WARDEN_DIGEST) },
    'blueprint',
  );
  assert.equal(text, WARDEN_BLUEPRINT);
});

test('limit is the one fact the document makes a warden publish', async () => {
  const { warden, voice } = await estate();
  const asStranger = await answered(
    warden,
    stranger,
    { being: warden.name.pk, method: invoke('limit') },
    'limit',
  );
  const asHolder = await answered(
    warden,
    voice,
    { being: warden.name.pk, method: invoke('limit') },
    'limit',
  );
  // The caller with something enormous to send can ask rather than learn by
  // silence, and holding a standing costs it nothing.
  assert.equal(asStranger, 65_536n);
  assert.equal(asHolder, 65_536n);
});

test('a method with no being reaches the warden’s own being', async () => {
  const { warden, voice } = await estate();
  // Addressing the door alone is how you speak to the ground's own affairs, so
  // a caller reaching `limit` or `blueprint` does not pay a describe first to
  // learn the name of the being it is already talking to.
  let seq = 0n;
  const bare = (who, method, read) => answered(warden, who, { seq: (seq += 1n), method }, read);

  for (const who of [stranger, voice]) {
    assert.equal(await bare(who, invoke('limit'), 'limit'), 65_536n);
    assert.equal(await bare(who, field('blueprint', WARDEN_DIGEST), 'blueprint'), WARDEN_BLUEPRINT);
  }

  // And it is the same being either way: naming the warden's own name answers
  // identically, because the public being's pk is the warden's own name.
  assert.equal(
    await answered(
      warden,
      voice,
      { seq: (seq += 1n), being: warden.name.pk, method: invoke('limit') },
      'limit',
    ),
    await bare(voice, invoke('limit'), 'limit'),
  );

  // The scoping does not loosen: a field the warden does not declare is still
  // silence, and so is a digest the caller does not reach.
  const silent = async (who, method) =>
    warden.judge(await ask(warden, who, { seq: (seq += 1n), being: null, method }), {
      clock: still,
      random: RANDOM,
    });
  assert.equal(await silent(voice, invoke('nosuch')), null);
  assert.equal(await silent(stranger, field('blueprint', await digest(parse(NOTE)))), null);
});

test('a stranger reaches the public being and nothing else', async () => {
  const { warden, one } = await estate();
  assert.equal(
    await warden.judge(await ask(warden, stranger, { being: one, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
  assert.equal(
    await warden.judge(await ask(warden, stranger, { being: one }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
});

test('the old door only points: a moved being answers only `moved`, work is silence', async () => {
  const { warden, one, voice } = await estate();
  const word = {
    being: one,
    successor: fixed(77),
    commitment: await sha256(fixed(77)),
    name: null,
    padlock: null,
    hints: ['https://elsewhere.example'],
  };
  assert.equal(warden.point(one, word), true);
  // A method ask meets silence: an answer's data is the field's declared
  // answer type, and a succession is not `bool`, so the old door cannot put
  // the word where the caller asked for the work.
  assert.equal(
    await warden.judge(await ask(warden, voice, { being: one, method: invoke('complete') }), {
      clock: still,
      random: RANDOM,
    }),
    null,
  );
  // The succession is learned by asking `moved`, which is the one ask the old
  // door answers about a being that left.
  const pointed = await answered(
    warden,
    voice,
    { seq: 2n, being: warden.name.pk, method: field('moved', one) },
    'moved',
  );
  assert.equal(hex(pointed.being), hex(one));
  assert.equal(hex(pointed.successor), hex(fixed(77)));
  assert.deepEqual(pointed.hints, ['https://elsewhere.example']);
  // A being that has not moved answers the absence.
  const { two } = await estate();
  assert.equal(
    await answered(
      warden,
      voice,
      { seq: 3n, being: warden.name.pk, method: field('moved', two) },
      'moved',
    ),
    null,
  );
});

test('a method blob that does not decode by the declared arguments is silence', async () => {
  const { warden, voice } = await estate();
  for (const [what, method] of [
    ['a cargo that is not one', invoke('receive', new Uint8Array(8))],
    ['a b32 argument cut short', invoke('blueprint', new Uint8Array(31))],
    ['trailing bytes after the argument', invoke('sketch', new Uint8Array(33))],
    ['an argument where none is declared', invoke('limit', new Uint8Array(1))],
  ]) {
    assert.equal(
      await warden.judge(await ask(warden, voice, { being: warden.name.pk, method }), {
        clock: still,
        random: RANDOM,
      }),
      null,
      what,
    );
  }
});

test('tell answers nothing, and a holder cannot announce anything with it', async () => {
  const { warden, voice } = await estate();
  // `tell` is news, and news is placed at step three: a caller holding an
  // ordinary standing is in the inbound record, so it never routes here.
  assert.equal(
    await warden.judge(
      await ask(warden, voice, {
        being: warden.name.pk,
        method: field('tell', {
          being: null,
          successor: null,
          commitment: null,
          name: null,
          padlock: fixed(70),
          hints: [],
        }),
      }),
      { clock: still, random: RANDOM },
    ),
    null,
  );
});
