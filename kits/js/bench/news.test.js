// News is not a second kind of message. It is an ordinary envelope judged by
// the same seven steps; what makes it news is only where its voice is found —
// not in the inbound record, which says who may enter, but in the outbound
// one, which is the peer's own memory of the houses it holds relations with.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Warden,
  commitment,
  readAnswer,
  readField,
  seal,
  sealingPair,
  signingPair,
  sha256,
  writeArgument,
} from '../src/index.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();
const still = () => 1_000;
const RANDOM = fixed(200);

const LIST = `ToDo
  complete(id text) bool
`;

const back = await sealingPair(fixed(4));

// Us: the peer holding a relation at a far house.
async function peerAndFar({ farName = 60, farHeir = 62 } = {}) {
  const peer = await Warden.open({ nameSeed: fixed(1), padlockSeed: fixed(2), heirSeed: fixed(3) });
  const far = await Warden.open({
    nameSeed: fixed(farName),
    padlockSeed: fixed(61),
    heirSeed: fixed(farHeir),
  });
  const theirs = await far.hold(
    { complete: () => utf8.encode('done') },
    { seed: fixed(63), blueprint: LIST },
  );
  const invitation = await far.grant(theirs, { voiceSeed: fixed(64), heirSeed: fixed(65) });
  const row = peer.remember(invitation, {
    voiceSecret: invitation.heirSecret,
    voicePk: invitation.heirPublic,
  });
  return { peer, far, row, invitation };
}

function tell(peer, voice, word, seq = 1n) {
  return seal({
    payload: {
      voice: voice.pk,
      recipient: peer.name.pk,
      commitment: null,
      seq,
      padlock: back.pk,
      hints: ['https://far.example'],
      allowance: { time: 5_000n, hops: 4n },
      being: peer.name.pk,
      method: { name: 'tell', args: writeArgument('tell', word) },
    },
    padlock: peer.padlock.pk,
    voiceSecret: voice.secret,
    random: RANDOM,
  });
}

// Fields that mean nothing in a case are absent, not filled — a word carrying
// a commitment for a padlock would be a word two kits read two ways.
const word = (over) => ({
  being: null,
  successor: null,
  commitment: null,
  name: null,
  padlock: null,
  hints: [],
  ...over,
});

// `tell` answers nothing, so what came back is an answer with no data at all.
// Heard or not heard is the whole of it.
async function heard(peer, envelope) {
  const answer = await peer.judge(await envelope, { clock: still, random: RANDOM });
  if (answer === null) return null;
  const read = await readAnswer({
    envelope: answer,
    padlockSecret: back.secret,
    wardenPk: peer.name.pk,
  });
  assert.equal(read.data, null);
  assert.equal(readField('tell', read.data), null);
  return true;
}

test('a padlock replacement carries only the padlock, and is believed by the name', async () => {
  const { peer, far, row } = await peerAndFar();
  const lock = await sealingPair(fixed(70));
  assert.equal(
    await heard(
      peer,
      tell(peer, far.name, word({ padlock: lock.pk, hints: ['https://new.example'] })),
    ),
    true,
  );
  // The handle is rewritten: a new lock, a new road, the same name.
  assert.equal(hex(row.padlock), hex(lock.pk));
  assert.deepEqual(row.hints, ['https://new.example']);
  assert.equal(hex(row.warden), hex(far.name.pk));
});

test('a replayed announcement is refused, because news is counted too', async () => {
  const { peer, far, row } = await peerAndFar();
  const first = await sealingPair(fixed(70));
  const envelope = await tell(peer, far.name, word({ padlock: first.pk }), 500n);
  assert.equal(await heard(peer, envelope), true);
  // A carrier handing the peer last year's announcement, pointing it at a lock
  // whose secret has since been thrown away.
  assert.equal(await heard(peer, envelope), null);
  const older = await sealingPair(fixed(71));
  // Below the window, the same silence as any other refusal.
  assert.equal(await heard(peer, tell(peer, far.name, word({ padlock: older.pk }), 1n)), null);
  // Late but inside it, honoured once, because a carriage may reorder freely.
  assert.equal(await heard(peer, tell(peer, far.name, word({ padlock: first.pk }), 499n)), true);
  assert.equal(hex(row.padlock), hex(first.pk));
});

test('the peer keeps one mark per far warden', async () => {
  const one = await peerAndFar({ farName: 60, farHeir: 62 });
  const two = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
  });
  const theirs = await two.hold({}, { seed: fixed(83), blueprint: LIST });
  const second = one.peer.remember(
    await two.grant(theirs, { voiceSeed: fixed(84), heirSeed: fixed(85) }),
    {},
  );
  const lock = await sealingPair(fixed(70));
  const say = (far, seq) =>
    heard(one.peer, tell(one.peer, far.name, word({ padlock: lock.pk }), seq));
  assert.equal(await say(one.far, 9n), true);
  // The second house's own counter is untouched by the first's.
  assert.equal(await say(two, 1n), true);
  assert.equal(hex(second.padlock), hex(lock.pk));
});

test('a name succession is believed by hashing the successor against the commitment', async () => {
  const { peer, far, row } = await peerAndFar();
  const next = await signingPair(fixed(90));
  const heard1 = await heard(
    peer,
    tell(
      peer,
      far.heir,
      word({
        successor: far.heir.pk,
        commitment: await commitment(far.heir.pk, next.pk),
        name: far.heir.pk,
        hints: ['https://succeeded.example'],
      }),
    ),
  );
  assert.equal(heard1, true);
  // The handle is rewritten with the new key, the new commitment and the
  // new door — and the outbound record is rekeyed to the name now answering.
  assert.equal(hex(row.warden), hex(far.heir.pk));
  assert.equal(hex(row.commitment), hex(await commitment(far.heir.pk, next.pk)));
  assert.deepEqual(row.hints, ['https://succeeded.example']);
  assert.ok(await peer.outboundFor(far.heir.pk));
  assert.equal(hex((await peer.outboundFor(far.heir.pk)).warden), hex(far.heir.pk));
});

test('a name succession keeps the mark, unlike a standing rotation', async () => {
  const { peer, far, row } = await peerAndFar();
  const lock = await sealingPair(fixed(70));
  assert.equal(await heard(peer, tell(peer, far.name, word({ padlock: lock.pk }), 40n)), true);
  const next = await signingPair(fixed(90));
  assert.equal(
    await heard(
      peer,
      tell(
        peer,
        far.heir,
        word({ successor: far.heir.pk, commitment: await commitment(far.heir.pk, next.pk) }),
        41n,
      ),
    ),
    true,
  );
  // The house persisted and only its key changed, so numbers already spent
  // stay spent: 40 does not come round again under the new name.
  assert.equal(row.marks.mark, 41n);
  const later = await sealingPair(fixed(71));
  assert.equal(await heard(peer, tell(peer, far.heir, word({ padlock: later.pk }), 40n)), null);
  assert.equal(await heard(peer, tell(peer, far.heir, word({ padlock: later.pk }), 42n)), true);
});

test('a successor that hashes to nothing the peer holds is silence', async () => {
  const { peer, row } = await peerAndFar();
  const impostor = await signingPair(fixed(91));
  const was = hex(row.warden);
  assert.equal(
    await heard(
      peer,
      tell(peer, impostor, word({ successor: impostor.pk, commitment: await sha256(fixed(9)) })),
    ),
    null,
  );
  assert.equal(hex(row.warden), was);
});

test('a name succession whose word names a different name is silence', async () => {
  const { peer, far, row } = await peerAndFar();
  const next = await signingPair(fixed(90));
  const was = hex(row.warden);
  assert.equal(
    await heard(
      peer,
      tell(
        peer,
        far.heir,
        word({
          successor: far.heir.pk,
          commitment: await commitment(far.heir.pk, next.pk),
          name: fixed(99),
        }),
      ),
    ),
    null,
  );
  assert.equal(hex(row.warden), was);
});

test('a being succession the peer holds no commitment for is silence', async () => {
  const { peer, far, row } = await peerAndFar();
  const next = await signingPair(fixed(96));
  const was = hex(row.padlock);
  // The peer was never described this being, so it has nothing to hash the
  // successor against.
  assert.equal(
    await heard(
      peer,
      tell(
        peer,
        far.name,
        word({
          being: fixed(77),
          successor: far.name.pk,
          commitment: await commitment(far.name.pk, next.pk),
        }),
      ),
    ),
    null,
  );
  assert.equal(hex(row.padlock), was);
  // And the number it carried is spent all the same: a message refused at
  // routing has still consumed its number.
  const lock = await sealingPair(fixed(70));
  assert.equal(await heard(peer, tell(peer, far.name, word({ padlock: lock.pk }))), null);
});

test("a word naming the far warden's own pk as a being is silence", async () => {
  const { peer, far, row } = await peerAndFar();
  const next = await signingPair(fixed(97));
  const after = await commitment(far.heir.pk, next.pk);
  // The peer is even handed a commitment under the far warden's own pk, as if
  // it were one of that house's beings — so nothing but the ruling refuses
  // what follows.
  peer.note(far.name.pk, {
    being: far.name.pk,
    commitment: await commitment(far.name.pk, far.heir.pk),
  });
  const was = hex(row.commitment);

  // The warden's own succession is said by `being` absent. A word naming that
  // same key in `being` would be a second spelling of it, and a value with two
  // spellings is two identities.
  assert.equal(
    await heard(
      peer,
      tell(peer, far.heir, word({ being: far.name.pk, successor: far.heir.pk, commitment: after })),
    ),
    null,
  );
  assert.equal(hex(row.commitment), was, 'a refused word moved the relation');

  // The one spelling stands: the same succession with `being` absent is
  // believed, over a fresh number, because the refusal spent the first.
  assert.equal(
    await heard(
      peer,
      tell(peer, far.heir, word({ successor: far.heir.pk, commitment: after }), 2n),
    ),
    true,
  );
  assert.equal(hex(row.commitment), hex(after));
});

test('a word that is neither a succession nor a replacement is silence', async () => {
  const { peer, far } = await peerAndFar();
  const lock = await sealingPair(fixed(70));
  // A successor with no commitment behind it: a standing that could be taken
  // over once and never again, so it is not a succession at all.
  assert.equal(await heard(peer, tell(peer, far.name, word({ successor: far.heir.pk }))), null);
  // A padlock replacement carrying a commitment is a word two kits read two
  // ways, so it is read as neither.
  assert.equal(
    await heard(peer, tell(peer, far.name, word({ padlock: lock.pk, commitment: fixed(9) }), 2n)),
    null,
  );
  // And a word with nothing present at all.
  assert.equal(await heard(peer, tell(peer, far.name, word({}), 3n)), null);
});

test('a stranger cannot announce anything, and spends nothing announcing it', async () => {
  const { peer } = await peerAndFar();
  const stranger = await signingPair(fixed(95));
  const lock = await sealingPair(fixed(70));
  assert.equal(await heard(peer, tell(peer, stranger, word({ padlock: lock.pk }))), null);
  // A stranger has no row, so no mark is kept for it: the same number again is
  // refused for the same reason and not for a spent one.
  assert.equal(await heard(peer, tell(peer, stranger, word({ padlock: lock.pk }))), null);
});

test('a far warden naming a field that is not tell is silence', async () => {
  const { peer, far } = await peerAndFar();
  const envelope = await seal({
    payload: {
      voice: far.name.pk,
      recipient: peer.name.pk,
      commitment: null,
      seq: 1n,
      padlock: back.pk,
      hints: [],
      allowance: { time: 5_000n, hops: 4n },
      being: peer.name.pk,
      method: { name: 'limit', args: new Uint8Array(0) },
    },
    padlock: peer.padlock.pk,
    voiceSecret: far.name.secret,
    random: RANDOM,
  });
  assert.equal(await peer.judge(envelope, { clock: still, random: RANDOM }), null);
});
