// Migration is a double rotation: to the committed heir, then immediately to a
// key the destination generated and the origin never saw. Cells and the
// register of standings travel with the being, the old door only points, and
// the peers follow with nobody asked.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Warden,
  commitment,
  decode,
  encode,
  depart,
  landed,
  memoryDelivery,
  news,
  pack,
  readAnswer,
  readField,
  remoteHandle,
  signingPair,
  writeArgument,
} from '../src/index.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();
const still = () => 1_000;
const RANDOM = fixed(200);

const TEXT = { base: 'text' };
const INT = { base: 'int' };
const BOOL = { base: 'bool' };

const LIST = `ToDo
  add(title text) bool
  count() int
`;

const DOCK = `Dock
  ping() bool
`;

// An ordinary object with ordinary state. Its cells are its own memory and
// nobody else's business; what travels is bytes the host reads and writes.
function todo(lines = []) {
  return {
    lines: [...lines],
    add(title) {
      this.lines.push(title);
      return true;
    },
    count() {
      return BigInt(this.lines.length);
    },
  };
}

const cellsOf = (object) => () => utf8.encode(object.lines.join('\n'));
const takeInto = (object) => (bytes) => {
  const text = Buffer.from(bytes).toString();
  object.lines = text === '' ? [] : text.split('\n');
};

async function world() {
  const origin = await Warden.open({
    nameSeed: fixed(1),
    padlockSeed: fixed(2),
    heirSeed: fixed(3),
    hints: ['https://origin.example'],
  });
  const destination = await Warden.open({
    nameSeed: fixed(10),
    padlockSeed: fixed(11),
    heirSeed: fixed(12),
    hints: ['https://destination.example'],
  });
  const object = todo(['milk', 'bread']);
  const { being } = await origin.hold(object, {
    seed: fixed(5),
    heirSeed: fixed(6),
    blueprint: LIST,
    cells: cellsOf(object),
  });
  // A third house, where the moving being itself holds a standing. Nobody
  // there has ever heard of the being: that door knows a voice and nothing
  // else, which is why nobody is owed news when the being moves.
  const third = await Warden.open({
    nameSeed: fixed(70),
    padlockSeed: fixed(71),
    heirSeed: fixed(72),
    hints: ['https://third.example'],
  });
  const { being: far } = await third.hold(
    { ping: () => true },
    { seed: fixed(73), blueprint: DOCK },
  );
  const relation = origin.remember(
    await third.grant(far, { voiceSeed: fixed(74), heirSeed: fixed(75) }),
    {
      being,
    },
  );
  // The holder's first act is the rotation to its committed heir, so the
  // relation's live voice is the heir and the far door has spent one number.
  const next = await signingPair(fixed(76));
  await third.judge(
    await origin.ask(relation, {
      seq: 1n,
      being: far,
      method: { name: 'ping', args: new Uint8Array(0) },
      commitment: await commitment(third.name.pk, next.pk),
      random: RANDOM,
    }),
    { clock: still, random: RANDOM },
  );
  relation.voice = { pk: relation.heir.pk, secret: relation.heir.secret };
  relation.heir = next;
  return { origin, destination, object, being, third, far, relation };
}

// A peer holding a standing at that being, which has claimed its invitation
// and been described what it stands at — so it holds the commitment that lets
// it believe the being's succession.
async function peerAt(origin, being, { seed, voiceSeed, heirSeed, nextSeed }) {
  const peer = await Warden.open({ nameSeed: seed, padlockSeed: seed, heirSeed: seed });
  const invitation = await origin.grant(being, { voiceSeed, heirSeed });
  const row = peer.remember(invitation);
  // The holder's first act: rotate, ask nothing, and what comes back is what
  // it now stands at.
  const next = await signingPair(nextSeed);
  const envelope = await peer.ask(row, {
    seq: 1n,
    commitment: await commitment(origin.name.pk, next.pk),
    random: RANDOM,
  });
  const back = await origin.judge(envelope, { clock: still, random: RANDOM });
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  row.heir = next;
  const estate = readField(
    'describe',
    (
      await readAnswer({
        envelope: back,
        padlockSecret: peer.padlock.secret,
        wardenPk: origin.name.pk,
      })
    ).data,
  );
  // The commitment serves the peer, and the describe is where it receives it.
  for (const one of estate.classes) {
    for (const held of one.beings) {
      peer.note(origin.name.pk, { being: held.being, commitment: held.commitment });
    }
  }
  return { peer, row, seq: 1n };
}

// An ordinary ask down a peer's own record, at whatever the handle now says.
function askThere(peer, row, being, method, seq) {
  const ref = peer.handle(being);
  return peer.carry({
    recipient: ref ? ref.warden : row.warden,
    padlock: ref ? ref.padlock : row.padlock,
    voicePk: row.voice.pk,
    voiceSecret: row.voice.secret,
    seq,
    allowance: { time: 5_000n, hops: 4n },
    being: ref ? ref.being : being,
    method,
    random: RANDOM,
  });
}

async function readAt(peer, warden, envelope, field) {
  const back = await warden.judge(await envelope, { clock: still, random: RANDOM });
  if (back === null) return null;
  const answer = await readAnswer({
    envelope: back,
    padlockSecret: peer.padlock.secret,
    wardenPk: warden.name.pk,
  });
  if (!answer) return null;
  return field ? readField(field, answer.data) : answer;
}

// The destination is armed and given a standing, because `receive` is an
// ordinary field spent by an ordinary standing, granted in advance the way
// anything is, and judged by the same seven steps.
async function armed(origin, destination, object) {
  const { being: dock } = await destination.hold(
    { ping: () => true },
    {
      seed: fixed(50),
      heirSeed: fixed(51),
      blueprint: DOCK,
    },
  );
  const invitation = await destination.grant(dock, { voiceSeed: fixed(52), heirSeed: fixed(53) });
  const row = origin.remember(invitation);
  const next = await signingPair(fixed(54));
  // Claim it, so the origin holds an ordinary standing at the destination.
  await destination.judge(
    await origin.ask(row, {
      seq: 1n,
      commitment: await commitment(destination.name.pk, next.pk),
      random: RANDOM,
    }),
    { clock: still, random: RANDOM },
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  const arriving = todo();
  await destination.expect({
    seed: fixed(40),
    heirSeed: fixed(41),
    object: arriving,
    blueprint: LIST,
    cells: cellsOf(arriving),
    take: takeInto(arriving),
  });
  assert.equal(object.lines.length, 2);
  return { row, landing: arriving };
}

// The state transfer, as it actually goes: pack the cargo, spend `receive` over
// an ordinary standing, and take from its answer the commitment the origin must
// carry into the first news and cannot invent.
function transfer(origin, destination, dock, cargo, seq = 2n) {
  return readAt(
    origin,
    destination,
    origin.ask(dock.row, {
      seq,
      being: destination.name.pk,
      method: { name: 'receive', args: writeArgument('receive', cargo) },
      random: RANDOM,
    }),
    'receive',
  );
}

// The whole walk, run once and asserted from several angles.
async function walk() {
  const { origin, destination, object, being, third, far, relation } = await world();
  const one = await peerAt(origin, being, {
    seed: fixed(20),
    voiceSeed: fixed(21),
    heirSeed: fixed(22),
    nextSeed: fixed(23),
  });
  const two = await peerAt(origin, being, {
    seed: fixed(30),
    voiceSeed: fixed(31),
    heirSeed: fixed(32),
    nextSeed: fixed(33),
  });
  const dock = await armed(origin, destination, object);
  const cargo = pack(origin, being);
  const taken = await transfer(origin, destination, dock, cargo);

  // Only then does the origin publish the succession: the commitment it carries
  // is the one `receive` answered.
  const moving = depart(origin, being, {
    commitment: taken,
    name: destination.name.pk,
    padlock: destination.padlock.pk,
    hints: destination.hints,
  });

  return {
    origin,
    destination,
    object,
    being,
    one,
    two,
    dock,
    cargo,
    moving,
    taken,
    third,
    far,
    relation,
  };
}

// The first news, signed by the being's committed heir; the second, by the key
// the destination generated. Both are ordinary envelopes.
async function tell(from, to, voice, word, seq, peer) {
  const envelope = await news(from, { peer, voice, word, seq, random: RANDOM });
  if (envelope === null) return null;
  return to.judge(envelope, { clock: still, random: RANDOM });
}

// What the origin holds about a peer that stood at the moved being: the padlock
// it named and the hints it gave, and never that peer's warden name.
const wayTo = async (moving, heirSeed) => {
  const heir = await signingPair(heirSeed);
  return moving.peers.find((row) => hex(row.voice) === hex(heir.pk));
};

test('the state transfer lands: cells, digest and the standings travel', async () => {
  const { destination, dock, taken, cargo } = await walk();
  // `receive` answers the commitment of the key the destination minted, hashed
  // under its own name — never a bare yes.
  // A destination mints two keys — the one the being is named by here and that
  // one's heir — and the commitment is of the first. The being's new name is
  // where the second news moves the being's identity, and it is what a peer
  // hashes that succession against; a commitment to the heir instead names a
  // key that signs nothing until the succession after this one, so the news is
  // disbelieved and the peer is left standing at a house that stopped
  // answering.
  const landedPk = (await signingPair(fixed(40))).pk;
  const landedHeir = (await signingPair(fixed(41))).pk;
  assert.equal(hex(taken), hex(await commitment(destination.name.pk, landedPk)));
  assert.notEqual(hex(taken), hex(await commitment(destination.name.pk, landedHeir)));
  // Only data moves: the blueprint was reproduced at the far end from its
  // digest, and the cells arrived whole.
  assert.deepEqual(dock.landing.lines, ['milk', 'bread']);
  assert.equal(hex(destination.beings.get(hex(landedPk)).digest), hex(cargo.digest));
  // Every peer's standing survives the move without being regranted, and the
  // replay marks and the way back came with them.
  assert.equal(cargo.standings.length, 2);
  for (const one of cargo.standings) {
    const row = destination.standing(one.voice);
    assert.ok(row, 'the standing travelled');
    assert.equal(row.mark, one.mark);
    assert.ok(row.beings.has(hex(landedPk)));
    assert.equal(hex(row.padlock), hex(one.padlock));
    assert.deepEqual(row.hints, one.hints);
  }
});

// Article XIII: an arriving inbound row reaches the being by the name the
// destination minted and by that name alone. A name a door must remember for
// whoever might still be behind is a name it can never stop remembering — and
// the peer that is behind is not stranded, because the old door still answers
// `moved` with the succession it published.
test('an arriving row names the being the destination minted, and no other', async () => {
  const { destination, cargo } = await walk();
  const landedPk = (await signingPair(fixed(40))).pk;
  for (const one of cargo.standings) {
    const row = destination.standing(one.voice);
    assert.deepEqual(
      [...row.beings],
      [hex(landedPk)],
      'the name the being wore before did not come with it',
    );
    for (const wore of one.beings) {
      assert.ok(!row.beings.has(hex(wore)), 'and is reached by nothing here');
    }
  }
});

test('a peer that receives both news arrives at the new door and its standing works', async () => {
  const { origin, destination, being, one, moving } = await walk();
  const way = await wayTo(moving, fixed(22));
  assert.ok(way);
  const was = await one.peer.outboundFor(origin.name.pk);
  assert.ok(was);

  // News one: the origin's committed heir, believed by hashing it against the
  // commitment the describe handed over.
  assert.notEqual(
    await tell(origin, one.peer, moving.voice, moving.word, 40n, way),
    null,
    'the first news was believed',
  );
  const after = one.peer.handle(moving.word.successor);
  assert.ok(after);
  assert.equal(hex(after.warden), hex(destination.name.pk));

  // Believed news rewrites the outbound row entire: the relation follows the
  // being, so the row is rekeyed to the house that now answers for it.
  assert.equal(await one.peer.outboundFor(origin.name.pk), null);
  const row = await one.peer.outboundFor(destination.name.pk);
  assert.ok(row, 'the row moved house');
  assert.equal(hex(row.padlock), hex(destination.padlock.pk));
  assert.equal(hex(row.commitment), hex(moving.word.commitment));
  assert.deepEqual(row.hints, destination.hints);
  assert.equal(row, was, 'the same row, rewritten rather than replaced');

  // News two: the key the destination generated and the origin never saw, sent
  // by the new house itself over the way back that travelled with the standing.
  const second = landed(destination);
  const peer = second.peers.find((standing) => hex(standing.voice) === hex(one.row.voice.pk));
  assert.ok(peer, 'the destination can reach a peer it has never been called by');
  // A succession starts the news mark fresh, exactly as a standing's rotation
  // does: the old key died with its count, so the second news counts from one
  // though the first spent forty, and is believed by its commitment rather than
  // its number.
  assert.notEqual(
    await tell(destination, one.peer, second.voice, second.word, 1n, peer),
    null,
    'the second news was believed',
  );
  const now = one.peer.handle(second.word.successor);
  assert.ok(now);
  assert.equal(hex(now.warden), hex(destination.name.pk));
  assert.equal(hex(now.padlock), hex(destination.padlock.pk));
  assert.deepEqual(now.hints, destination.hints);

  // And the standing works there without a regrant: the peer asks at the new
  // door, over the same voice, and is answered.
  const answer = await readAt(
    one.peer,
    destination,
    askThere(one.peer, one.row, now.being, { name: 'count', args: new Uint8Array(0) }, 5n),
  );
  assert.ok(answer, 'the travelled standing answers at the new door');
  assert.equal(decode(INT, answer.data), 2n);
  // Nothing was regranted: the destination never minted a voice for this peer.
  assert.equal(hex(destination.standing(one.row.voice.pk).voice), hex(one.row.voice.pk));
  assert.equal(hex(being).length, 64);
});

test('news names the door by the padlock, because speaking first holds no name', async () => {
  const { origin, destination, one, two, moving } = await walk();
  const way = await wayTo(moving, fixed(22));
  // The origin never learned this peer's warden name: an inbound row keeps the
  // padlock it named and the hints it gave, and nothing else about the house.
  // The one name on the row is the origin's own — the name this standing's
  // heir commitment was minted under, which says nothing about the peer.
  assert.equal(hex(way.name), hex(origin.name.pk));
  assert.ok(way.padlock);
  const envelope = await news(origin, {
    peer: way,
    voice: moving.voice,
    word: moving.word,
    seq: 1n,
    random: RANDOM,
  });
  // Accepted at the door that padlock belongs to.
  assert.notEqual(await one.peer.judge(envelope, { clock: still, random: RANDOM }), null);
  // And refused at every other, exactly as a name would be: a message presented
  // at any other door is silence.
  assert.equal(await two.peer.judge(envelope, { clock: still, random: RANDOM }), null);
  assert.equal(await destination.judge(envelope, { clock: still, random: RANDOM }), null);
});

test('a peer that follows the first news early meets the weather', async () => {
  const { origin, destination, object, being } = await world();
  const one = await peerAt(origin, being, {
    seed: fixed(20),
    voiceSeed: fixed(21),
    heirSeed: fixed(22),
    nextSeed: fixed(23),
  });
  const dock = await armed(origin, destination, object);
  const cargo = pack(origin, being);
  // The origin publishes the succession before the cargo has landed, and the
  // peer follows it at once.
  const moving = depart(origin, being, {
    commitment: await commitment(destination.name.pk, (await signingPair(fixed(40))).pk),
    name: destination.name.pk,
    padlock: destination.padlock.pk,
    hints: destination.hints,
  });
  assert.notEqual(
    await tell(origin, one.peer, moving.voice, moving.word, 1n, await wayTo(moving, fixed(22))),
    null,
  );

  // The being does not answer there yet: the standings have not arrived, so the
  // voice is a stranger at that door. Delivery is not Quo's, and this is its
  // weather — retried like any of it.
  assert.equal(
    await readAt(
      one.peer,
      destination,
      askThere(
        one.peer,
        one.row,
        moving.word.successor,
        {
          name: 'count',
          args: new Uint8Array(0),
        },
        5n,
      ),
    ),
    null,
  );

  // And when the cargo lands, the same ask is answered.
  assert.ok(await transfer(origin, destination, dock, cargo));
  const answer = await readAt(
    one.peer,
    destination,
    askThere(
      one.peer,
      one.row,
      landed(destination).word.successor,
      {
        name: 'count',
        args: new Uint8Array(0),
      },
      6n,
    ),
  );
  assert.equal(decode(INT, answer.data), 2n);
});

test('a peer that missed the news asks the old door and is told, then asks the new', async () => {
  const { origin, destination, being, two, moving } = await walk();
  // The old door only points: the work ask meets silence, because the word is
  // not the answer type `count` declared.
  assert.equal(
    await readAt(
      two.peer,
      origin,
      askThere(two.peer, two.row, being, { name: 'count', args: new Uint8Array(0) }, 5n),
      'moved',
    ),
    null,
  );
  // The peer learns the succession by asking the old door `moved`.
  const pointed = await readAt(
    two.peer,
    origin,
    two.peer.carry({
      recipient: origin.name.pk,
      padlock: origin.padlock.pk,
      voicePk: two.row.voice.pk,
      voiceSecret: two.row.voice.secret,
      seq: 6n,
      allowance: { time: 5_000n, hops: 4n },
      being: origin.name.pk,
      method: { name: 'moved', args: being },
      random: RANDOM,
    }),
    'moved',
  );
  assert.equal(hex(pointed.being), hex(being));
  assert.equal(hex(pointed.successor), hex(moving.word.successor));
  assert.equal(hex(pointed.name), hex(destination.name.pk));

  // The peer follows the word to the new door, where the arriving name is
  // pointed onward in exactly the same shape.
  const again = await readAt(
    two.peer,
    destination,
    two.peer.carry({
      recipient: pointed.name,
      padlock: pointed.padlock,
      voicePk: two.row.voice.pk,
      voiceSecret: two.row.voice.secret,
      seq: 6n,
      allowance: { time: 5_000n, hops: 4n },
      being: pointed.name,
      method: { name: 'moved', args: pointed.successor },
      random: RANDOM,
    }),
    'moved',
  );
  assert.equal(hex(again.successor), hex(landed(destination).word.successor));
  // And the bytes are identical either way: what the old door told and what
  // the destination tells are the same shape the news carried.
  assert.deepEqual(again, landed(destination).word);

  // One more hop and the peer is home, over the standing that travelled.
  const answer = await readAt(
    two.peer,
    destination,
    two.peer.carry({
      recipient: destination.name.pk,
      padlock: destination.padlock.pk,
      voicePk: two.row.voice.pk,
      voiceSecret: two.row.voice.secret,
      seq: 7n,
      allowance: { time: 5_000n, hops: 4n },
      being: again.successor,
      method: { name: 'count', args: new Uint8Array(0) },
      random: RANDOM,
    }),
  );
  assert.equal(decode(INT, answer.data), 2n);
});

test('the same news twice is refused, because the heir chain has moved on', async () => {
  const { origin, one, moving } = await walk();
  const way = await wayTo(moving, fixed(22));
  assert.notEqual(await tell(origin, one.peer, moving.voice, moving.word, 4n, way), null);
  // The succession starts the mark fresh, so what refuses the replay is the
  // chain rather than the count: the successor no longer hashes to the
  // commitment the peer now holds.
  assert.equal(await tell(origin, one.peer, moving.voice, moving.word, 4n, way), null);
  assert.equal(await tell(origin, one.peer, moving.voice, moving.word, 5n, way), null);
});

test('after the move every key the old warden held for the being is dead', async () => {
  const { origin, being, one } = await walk();
  // The pointer, the keys and the heir are gone from the origin.
  assert.equal(origin.beings.has(hex(being)), false);
  // It never acts on the being's behalf again: the work is not done, and the
  // word is not put in its place either — the ask meets silence.
  assert.equal(
    await readAt(
      one.peer,
      origin,
      askThere(one.peer, one.row, being, { name: 'add', args: encode(TEXT, 'eggs') }, 9n),
      'moved',
    ),
    null,
  );
  // What the old door still answers is `moved`, asked of the warden itself.
  const answer = await readAt(
    one.peer,
    origin,
    one.peer.carry({
      recipient: origin.name.pk,
      padlock: origin.padlock.pk,
      voicePk: one.row.voice.pk,
      voiceSecret: one.row.voice.secret,
      seq: 10n,
      allowance: { time: 5_000n, hops: 4n },
      being: origin.name.pk,
      method: { name: 'moved', args: being },
      random: RANDOM,
    }),
    'moved',
  );
  assert.ok(answer);
  assert.equal(hex(answer.being), hex(being));
});

test('the outbound record travels: a being that acts arrives able to act', async () => {
  const { destination, cargo, relation, third, far } = await walk();

  // One row for the relation the being held, and the voice's own keypair with
  // it — the far door knows only that voice, so the keys are what carry.
  assert.equal(cargo.relations.length, 1);
  const [carried] = cargo.relations;
  assert.equal(hex(carried.warden), hex(third.name.pk));
  assert.equal(hex(carried.voice), hex(relation.voice.pk));
  assert.equal(hex(carried.secret), hex(relation.voice.secret));
  // Both of the voice's keys: the heir the far door holds a commitment to
  // travels as well, or the standing arrives able to act once and never to
  // rotate.
  assert.equal(hex(carried.heir), hex(relation.heir.pk));
  assert.equal(hex(carried.heirSecret), hex(relation.heir.secret));
  assert.equal(hex(carried.padlock), hex(third.padlock.pk));
  assert.deepEqual(carried.hints, third.hints);

  // And it is installed at the destination, owned by the being under the name
  // the move gave it.
  const landedPk = (await signingPair(fixed(40))).pk;
  const rows = destination.relationsOf(landedPk);
  assert.equal(rows.length, 1);
  assert.equal(hex(rows[0].warden), hex(third.name.pk));
  assert.equal(hex(rows[0].voice.pk), hex(relation.voice.pk));

  // The whole point: the being spends the inherited relation at the third
  // door, from its new house, and is answered. Nothing there was regranted and
  // nothing there was told.
  const answer = await readAt(
    destination,
    third,
    destination.ask(rows[0], {
      seq: carried.seq + 1n,
      being: far,
      method: { name: 'ping', args: new Uint8Array(0) },
      random: RANDOM,
    }),
  );
  assert.ok(answer, 'the inherited relation answers at a door that heard nothing');
  assert.equal(decode(BOOL, answer.data), true);
});

test('the inherited standing can be rotated, because the heir moved with it', async () => {
  const { destination, third, far, relation } = await walk();
  const landedPk = (await signingPair(fixed(40))).pk;
  const [row] = destination.relationsOf(landedPk);
  assert.equal(hex(row.heir.pk), hex(relation.heir.pk));
  assert.equal(hex(row.heir.secret), hex(relation.heir.secret));

  // The being takes its own standing over at a door that heard nothing about
  // the move: the heir signs, carrying the commitment to the heir after it.
  const after = await signingPair(fixed(77));
  const answer = await readAt(
    destination,
    third,
    destination.carry({
      recipient: third.name.pk,
      padlock: row.padlock,
      voicePk: row.heir.pk,
      voiceSecret: row.heir.secret,
      commitment: await commitment(third.name.pk, after.pk),
      allowance: { time: 5_000n, hops: 4n },
      // A rotation starts the far door's mark fresh, so the count the relation
      // carried died with the key it counted for.
      seq: 1n,
      being: far,
      method: { name: 'ping', args: new Uint8Array(0) },
      random: RANDOM,
    }),
  );
  assert.ok(answer, 'the inherited standing rotates at the far door');
  assert.equal(decode(BOOL, answer.data), true);

  // And the far door now stands at the heir, with the next commitment held.
  const standing = third.standing(row.heir.pk);
  assert.ok(standing);
  assert.equal(hex(standing.commitment), hex(await commitment(third.name.pk, after.pk)));
  assert.equal(third.standing(row.voice.pk), null);
});

test('the heir does not stay behind: the origin keeps no key of the standing', async () => {
  const { origin, being, third } = await walk();
  // Neither key is at the old door any more. The far door cannot tell the
  // difference — it knows a voice and nothing about the move — so what
  // protects the standing is that the origin's copy is gone, which is the
  // same shared fate every other key of the being's rests on.
  assert.deepEqual(origin.relationsOf(being), []);
  assert.equal(await origin.outboundFor(third.name.pk), null);
  assert.equal(
    origin.outbound.some((row) => row.heir && third.standing(row.heir.pk) !== null),
    false,
  );
});

test('the count kept against the far door travels, so no number comes round twice', async () => {
  const { destination, cargo, third, far } = await walk();
  const [carried] = cargo.relations;
  // The origin spent one there, and that count arrived with the relation.
  assert.equal(carried.seq, 1n);
  const [row] = destination.relationsOf((await signingPair(fixed(40))).pk);
  const ping = (seq) =>
    readAt(
      destination,
      third,
      destination.ask(row, {
        seq,
        being: far,
        method: { name: 'ping', args: new Uint8Array(0) },
        random: RANDOM,
      }),
    );
  // Spending it again is silence, because the far door's mark did not move
  // when the being did.
  assert.equal(await ping(carried.seq), null);
  assert.ok(await ping(carried.seq + 1n));
});

test('the replay window travels whole, so a caller with asks in flight survives the move', async () => {
  const { origin, destination, object, being } = await world();
  const one = await peerAt(origin, being, {
    seed: fixed(20),
    voiceSeed: fixed(21),
    heirSeed: fixed(22),
    nextSeed: fixed(23),
  });

  // The peer's numbers arrive out of order, which is the ordinary weather: one
  // and three land, and two is still on the road. The mark is three and two is
  // the one number below it still open.
  assert.ok(
    await readAt(
      one.peer,
      origin,
      askThere(one.peer, one.row, being, { name: 'count', args: new Uint8Array(0) }, 3n),
    ),
  );

  const cargo = pack(origin, being);
  const [carried] = cargo.standings;
  assert.equal(carried.mark, 3n);
  // The window as it travels: the numbers below the mark already honoured,
  // ascending. Two is absent, because two never arrived.
  assert.deepEqual(carried.spent, [1n]);

  const dock = await armed(origin, destination, object);
  const taken = await transfer(origin, destination, dock, cargo);
  const moving = depart(origin, being, {
    commitment: taken,
    name: destination.name.pk,
    padlock: destination.padlock.pk,
    hints: destination.hints,
  });

  const way = await wayTo(moving, fixed(22));
  assert.notEqual(await tell(origin, one.peer, moving.voice, moving.word, 40n, way), null);
  const second = landed(destination);
  const peer = second.peers.find((standing) => hex(standing.voice) === hex(one.row.voice.pk));
  assert.notEqual(await tell(destination, one.peer, second.voice, second.word, 1n, peer), null);
  const now = one.peer.handle(second.word.successor);

  const at = (seq) =>
    readAt(
      one.peer,
      destination,
      askThere(one.peer, one.row, now.being, { name: 'count', args: new Uint8Array(0) }, seq),
    );

  // A mark alone would leave the new door two wrong answers. It gives neither:
  // what was spent at the old door is spent here, and the number still in
  // flight is still honoured.
  assert.equal(await at(1n), null, 'a number spent at the old door was honoured at the new');
  assert.equal(await at(3n), null, 'the mark itself was honoured again');
  assert.ok(await at(2n), 'a caller with an ask in flight was killed by the move');
  // And once, like anywhere else.
  assert.equal(await at(2n), null);
});

// A handle is what a being actually holds, so the catch-up is asserted where a
// being would meet it: a road under the wardens, and the ordinary field the
// caller was calling all along. The road of distance zero waives no step.
async function overARoad() {
  const world = await walk();
  const delivery = memoryDelivery();
  for (const warden of [world.origin, world.destination, world.one.peer, world.two.peer]) {
    warden.delivery = delivery;
    warden.clock = still;
    warden.random = () => RANDOM;
    for (const hint of warden.hints) delivery.attach(hint, warden);
  }
  const ledger = (at) => remoteHandle(at.peer, at.row, world.being, LIST);
  return { ...world, ledger };
}

test('a peer that missed the news meets silence, is rehoused, and reaches the new house', async () => {
  const { origin, destination, being, two, moving, ledger } = await overARoad();
  const handle = ledger(two);
  const row = await two.peer.outboundFor(origin.name.pk);
  assert.ok(row);

  // The ask that met the move is silence, as every ask at a departed being is:
  // the old door only points, and the word is not the type `count` declared.
  // What the handle does with the silence is ask where the being went and hand
  // the word to its own warden — the same steps the news would have taken.
  assert.equal(await handle.count(), null, 'the ask that met the move was silence');
  assert.equal(hex(handle._quo.being), hex(moving.word.successor), 'and the handle moved with it');
  assert.equal(await two.peer.outboundFor(origin.name.pk), null);
  assert.equal(await two.peer.outboundFor(destination.name.pk), row, 'the same row, rehoused');
  assert.equal(hex(row.padlock), hex(destination.padlock.pk));
  assert.deepEqual(row.hints, destination.hints);
  // A succession starts the news mark fresh, exactly as it does when the word
  // arrives as news: the old key died with its count.
  assert.equal(row.marks.mark, null);

  // The destination points onward in the same shape, because the name the
  // origin published is not the name the destination minted. One more silence,
  // one more word, and the peer is home over the standing that travelled —
  // nothing regranted and nobody asked.
  assert.equal(await handle.count(), null, 'the arriving name is pointed onward too');
  assert.equal(hex(handle._quo.being), hex(landed(destination).word.successor));
  assert.equal(await handle.count(), 2n, 'the next ask reaches the new house');
  assert.equal(hex(being).length, 64);
});

test('a word the row has no commitment for rehouses nothing', async () => {
  const { origin, being, two, moving, ledger } = await overARoad();
  const handle = ledger(two);
  const row = await two.peer.outboundFor(origin.name.pk);
  const was = { warden: hex(row.warden), padlock: hex(row.padlock), hints: [...row.hints] };

  // The word says where the being went, and what makes it believable is that
  // only the house that committed can name a successor hashing to the
  // commitment the peer already holds. A successor nobody committed to is a
  // stranger's word, and a stranger announces nothing.
  const forged = { ...moving.word, successor: (await signingPair(fixed(99))).pk };
  assert.equal(await two.peer.believe(row, forged), null);
  assert.equal(hex(row.warden), was.warden, 'the row is where it was');
  assert.equal(hex(row.padlock), was.padlock);
  assert.deepEqual(row.hints, was.hints);
  assert.ok(await two.peer.outboundFor(origin.name.pk), 'and still at the old house');
  assert.equal(hex(handle._quo.being), hex(being), 'the handle stands where it stood');
});

test('the same word twice rehouses once, because the chain has moved on', async () => {
  const { origin, destination, two, moving } = await overARoad();
  const row = await two.peer.outboundFor(origin.name.pk);

  assert.equal(hex(await two.peer.believe(row, moving.word)), hex(moving.word.successor));
  const commitment = hex(row.commitment);

  // The word replayed says a being the row no longer stands at succeeded: the
  // ref was rekeyed to the successor when the word was believed, so there is
  // nothing left for the second telling to move. The mark cannot be walked
  // forward by it either — a succession left it fresh, and this changes nothing.
  assert.equal(await two.peer.believe(row, moving.word), null);
  assert.equal(hex(row.warden), hex(destination.name.pk));
  assert.equal(hex(row.commitment), commitment);
  assert.equal(row.marks.mark, null);
});

test('a peer that heard the news is not moved twice by meeting the word', async () => {
  const { origin, destination, one, moving } = await overARoad();
  const way = await wayTo(moving, fixed(22));
  assert.notEqual(await tell(origin, one.peer, moving.voice, moving.word, 40n, way), null);
  const row = await one.peer.outboundFor(destination.name.pk);
  assert.ok(row, 'the news moved the row');
  const ref = one.peer.handle(moving.word.successor);

  // The word carries no news the row has not already believed: what refuses it
  // is the chain rather than the count, exactly as a replayed news is refused.
  assert.equal(await one.peer.believe(row, moving.word), null);
  assert.equal(one.peer.handle(moving.word.successor), ref, 'nothing about the being changed');
  assert.equal(hex(row.warden), hex(destination.name.pk));
  assert.equal(hex(row.commitment), hex(moving.word.commitment));
});

test('the old door keeps no relation of a being that left', async () => {
  const { origin, being, third } = await walk();
  assert.deepEqual(origin.relationsOf(being), []);
  // Nor by any other road: the voice went with the cargo, so the old house
  // cannot reach that door on the being's behalf at all.
  assert.equal(await origin.outboundFor(third.name.pk), null);
});

test('a relation the warden holds for itself is nobody being migrated', async () => {
  const { origin, cargo, dock } = await walk();
  // The origin's own standing at the destination — the one `receive` was spent
  // over — belongs to no being, so it never appeared in the cargo.
  assert.equal(
    cargo.relations.some((one) => hex(one.warden) === hex(dock.row.warden)),
    false,
  );
  assert.ok(await origin.outboundFor(dock.row.warden), 'and it stayed where it was');
});

test('receive is silence when the door is not armed, and to a stranger', async () => {
  const { origin, destination, dock, cargo } = await walk();
  // The door armed once and took once: the same cargo again finds nothing
  // waiting, and a refused receive is silence like every other refusal.
  assert.equal(await transfer(origin, destination, dock, cargo, 3n), null);

  // A stranger holds no standing anywhere: a door any stranger could push a
  // being into is a door with no gate.
  const elsewhere = await Warden.open({
    nameSeed: fixed(60),
    padlockSeed: fixed(61),
    heirSeed: fixed(62),
  });
  const stranger = await signingPair(fixed(63));
  await destination.expect({
    seed: fixed(64),
    heirSeed: fixed(65),
    object: todo(),
    blueprint: LIST,
  });
  assert.equal(
    await readAt(
      elsewhere,
      destination,
      elsewhere.carry({
        recipient: destination.name.pk,
        padlock: destination.padlock.pk,
        voicePk: stranger.pk,
        voiceSecret: stranger.secret,
        seq: 1n,
        allowance: { time: 5_000n, hops: 4n },
        being: destination.name.pk,
        method: { name: 'receive', args: writeArgument('receive', cargo) },
        random: RANDOM,
      }),
      'receive',
    ),
    null,
  );
});
