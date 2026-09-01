// The caller's own half, which a door's bench never exercises: the record it
// keeps of the asks it has out, and the shorter road Article XII gives an
// answer at the caller's end. Two of that road's four checks need the caller's
// own bookkeeping, and until this record was in the core they lived in a road
// — so a call made without a socket got half a judgment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Warden, accept, commitment, readAnswer, seal, signingPair } from '../src/index.js';

const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();
const still = () => 1_000;
const RANDOM = fixed(200);

const LIST = `ToDo
  add(title text) bool
`;

function todo() {
  return { add: () => utf8.encode('added') };
}

// A door with one being, and a caller standing at it on that door's invitation.
async function pair({ seed = 1 } = {}) {
  const house = await Warden.open({
    nameSeed: fixed(seed),
    padlockSeed: fixed(seed + 1),
    heirSeed: fixed(seed + 2),
  });
  const being = await house.hold(todo(), {
    seed: fixed(seed + 3),
    heirSeed: fixed(seed + 4),
    blueprint: LIST,
  });
  const caller = await Warden.open({
    nameSeed: fixed(seed + 5),
    padlockSeed: fixed(seed + 6),
    heirSeed: fixed(seed + 7),
  });
  const invitation = await house.grant(being, {
    voiceSeed: fixed(seed + 8),
    heirSeed: fixed(seed + 9),
  });
  const row = caller.remember(invitation);
  return { house, being, caller, invitation, row };
}

test('an answer nothing awaits is silence, and hearing one spends the record', async () => {
  const { house, caller, row } = await pair({ seed: 10 });
  const next = await signingPair(fixed(40));

  const envelope = await caller.ask(row, {
    seq: 1n,
    commitment: await commitment(row.warden, next.pk),
    random: RANDOM,
  });
  assert.equal(row.awaiting.size, 1);

  const back = await house.judge(envelope, { clock: still, random: RANDOM });
  const answer = await caller.hear(back);
  assert.equal(answer.seq, 1n);
  assert.equal(row.awaiting.size, 0);

  // The very same bytes again: well-formed, well-signed, from the right door,
  // and silence, because nothing awaits them.
  assert.equal(await caller.hear(back), null);
  // And the envelope's own half still reads it, which is what makes the
  // refusal the caller's bookkeeping rather than the envelope's.
  assert.ok(
    await readAnswer({
      envelope: back,
      padlockSecret: caller.padlock.secret,
      wardenPk: house.name.pk,
    }),
  );
});

test('an answer from a door this caller never asked is silence at the caller', async () => {
  const { caller } = await pair({ seed: 30 });
  // A second house this caller holds no relation with. Somebody else's ask
  // there names this caller's padlock as the way back, so what comes out is a
  // real answer, signed by a real warden, that opens perfectly at this caller.
  const other = await pair({ seed: 50 });
  const mine = await signingPair(fixed(90));
  const asked = await seal({
    payload: {
      voice: other.invitation.heirPublic,
      recipient: other.house.name.pk,
      commitment: await commitment(other.house.name.pk, mine.pk),
      seq: 1n,
      padlock: caller.padlock.pk,
      hints: [],
      allowance: { time: 5_000n, hops: 8n },
      being: null,
      method: null,
    },
    padlock: other.house.padlock.pk,
    voiceSecret: other.invitation.heirSecret,
    random: RANDOM,
  });
  const back = await other.house.judge(asked, { clock: still, random: RANDOM });

  // The envelope's own half reads it: it unseals under this caller's padlock,
  // says `answer`, and its signature verifies against the warden its record
  // carries. The two checks that refuse it are the caller's own.
  assert.ok(
    await readAnswer({
      envelope: back,
      padlockSecret: caller.padlock.secret,
      wardenPk: other.house.name.pk,
    }),
  );
  assert.equal(await caller.hear(back), null);
});

test('two asks whose answers could not be told apart: the kit refuses to send the second', async () => {
  const { caller, row } = await pair({ seed: 70 });
  const first = await signingPair(fixed(100));
  const second = await signingPair(fixed(101));

  assert.ok(
    await caller.ask(row, {
      seq: 1n,
      commitment: await commitment(row.warden, first.pk),
      random: RANDOM,
    }),
  );
  // A rotation starts the far door's mark fresh, so the next one opens at one
  // again — the same padlock, the same warden, the same number, and two
  // answers nothing could tell apart.
  assert.equal(
    await caller.ask(row, {
      seq: 1n,
      commitment: await commitment(row.warden, second.pk),
      random: RANDOM,
    }),
    null,
  );

  // Forgoing is the caller saying it has stopped waiting, and the number is
  // free to come round again.
  assert.equal(caller.forgo(row, 1n), true);
  assert.equal(caller.forgo(row, 1n), false);
  assert.ok(
    await caller.ask(row, {
      seq: 1n,
      commitment: await commitment(row.warden, second.pk),
      random: RANDOM,
    }),
  );
});

test('accept leaves awaiting only the ask it hands an answer back for', async () => {
  const { house, caller, invitation } = await pair({ seed: 110 });

  let grain = 0;
  const spent = await accept(caller, invitation, {
    voiceSeed: fixed(120),
    heirSeed: fixed(121),
    allowance: { time: 5_000n, hops: 8n },
    random: () => fixed((grain += 1) % 251),
    send: (envelope) => house.judge(envelope, { clock: still, random: RANDOM }),
  });
  assert.ok(spent);
  // Both rotations opened at one. The opening is handed back sealed for the
  // caller to judge, so accept stopped awaiting it; the second is the caller's
  // own call and is still out.
  assert.equal(spent.row.awaiting.size, 1);
  const answer = await caller.hear(spent.answer);
  assert.equal(answer.seq, 1n);
  assert.equal(spent.row.awaiting.size, 0);
});
