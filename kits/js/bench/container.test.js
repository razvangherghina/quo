// Both carriages across a real container boundary. A Quo ground stands inside
// the official Node image — the kit mounted into it and run as it stands — and
// this suite reaches it from the host over the port the container published:
// the door posted to over HTTP, the line dialled over `tcp://`. Everything
// before this proved the carriages between two wardens in one process; this
// proves them where the two ends are genuinely separate machines as far as the
// sockets are concerned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Warden, commitment, post, readAnswer, readField, signingPair } from '../src/index.js';
import { dial } from '../src/line.js';
import { stand, unreachable } from './container/ground.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const bytes = (text) => Uint8Array.from(Buffer.from(text, 'hex'));
const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();
const still = () => 1_000;
const RANDOM = fixed(200);

const LIST = `ToDo
  add(title text) bool
  count() int
`;

const grain = (start) => {
  let seed = start;
  return () => fixed((seed += 7) % 251);
};

// The daemon is asked once, and its absence is a skip carrying its reason.
// A case that quietly passed without a container would be a green about
// nothing.
const why = unreachable();
const skip = why ? `no container boundary to cross: ${why}` : false;

// The host end: a warden that publishes no road of its own and only calls out.
function caller() {
  return Warden.open({ nameSeed: fixed(10), padlockSeed: fixed(11), heirSeed: fixed(12) });
}

// The invitation the container printed, back in the kit's own types.
function invitationOf(facts) {
  return {
    warden: bytes(facts.invitation.warden),
    commitment: bytes(facts.invitation.commitment),
    padlock: bytes(facts.invitation.padlock),
    heirPublic: bytes(facts.invitation.heirPublic),
    heirSecret: bytes(facts.invitation.heirSecret),
    hints: facts.invitation.hints,
  };
}

async function read(from, farWardenPk, envelope, field) {
  if (envelope === null) return null;
  const answer = await readAnswer({
    envelope,
    padlockSecret: from.padlock.secret,
    wardenPk: farWardenPk,
  });
  if (!answer) return null;
  return field === undefined ? answer : readField(field, answer.data);
}

test('the common carriage crosses a container boundary', { skip }, async (t) => {
  const ground = await stand('door');
  t.after(ground.stop);
  const guest = await caller();
  const { facts } = ground;

  // The road the container published is the mapping the host actually reaches
  // it by, not the address the socket inside bound, and the invitation carries
  // that road because the ground was told it before it minted anything.
  assert.equal(facts.hint, `http://127.0.0.1:${ground.port}`);
  assert.deepEqual(facts.invitation.hints, [facts.hint]);

  const far = bytes(facts.warden);
  const being = bytes(facts.being);
  const row = guest.remember(invitationOf(facts));

  // The holder's first act is the rotation, and what comes back is the estate
  // the far ground stands — read across the boundary and nowhere else.
  const next = await signingPair(fixed(22));
  const estate = await read(
    guest,
    far,
    await post(
      facts.hint,
      await guest.ask(row, {
        seq: 1n,
        commitment: await commitment(far, next.pk),
        random: RANDOM,
      }),
    ),
    'describe',
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  assert.ok(estate.classes.some((one) => one.beings.some((one) => hex(one.being) === facts.being)));

  // An ordinary ask on the being inside the container, judged there and
  // answered back over the one POST.
  const said = await guest.ask(row, {
    seq: 2n,
    being,
    method: { name: 'add', args: utf8.encode('milk') },
    random: RANDOM,
  });
  const answer = await read(guest, far, await post(facts.hint, said));
  assert.equal(answer.seq, 2n);

  // And the far ground really changed: its own being is asked what it now
  // holds, which is the only way this side can know.
  const counted = await read(
    guest,
    far,
    await post(
      facts.hint,
      await guest.ask(row, {
        seq: 3n,
        being,
        method: { name: 'count', args: new Uint8Array(0) },
        random: RANDOM,
      }),
    ),
  );
  assert.equal(Buffer.from(counted.data).toString(), '1');

  // The same envelope again is a spent number, and a spent number is silence —
  // the container's own marks refuse it, and nothing was added twice.
  assert.equal(await post(facts.hint, said), null);
  const again = await read(
    guest,
    far,
    await post(
      facts.hint,
      await guest.ask(row, {
        seq: 4n,
        being,
        method: { name: 'count', args: new Uint8Array(0) },
        random: RANDOM,
      }),
    ),
  );
  assert.equal(Buffer.from(again.data).toString(), '1');
});

test('the line crosses a container boundary, in both directions', { skip }, async (t) => {
  const ground = await stand('line');
  t.after(ground.stop);
  const guest = await caller();
  const { facts } = ground;

  assert.match(facts.hint, new RegExp(`^tcp://127\\.0\\.0\\.1:${ground.port}\\?cap=\\d+$`));
  const far = bytes(facts.warden);
  const being = bytes(facts.being);
  const row = guest.remember(invitationOf(facts));

  const line = await dial(guest, facts.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());

  const next = await signingPair(fixed(22));
  const estate = await read(
    guest,
    far,
    await line.carry(
      await guest.ask(row, {
        seq: 1n,
        commitment: await commitment(far, next.pk),
        random: RANDOM,
      }),
      { warden: far, seq: 1n },
    ),
    'describe',
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  assert.ok(estate.classes.some((one) => one.beings.some((one) => hex(one.being) === facts.being)));

  const answer = await read(
    guest,
    far,
    await line.carry(
      await guest.ask(row, {
        seq: 2n,
        being,
        method: { name: 'add', args: utf8.encode('milk') },
        random: RANDOM,
      }),
      { warden: far, seq: 2n },
    ),
  );
  assert.equal(answer.seq, 2n);

  // The push. This side holds a being and publishes no road at all — it is
  // reachable only down the line it dialled — and it grants the containerized
  // ground a standing there. The invitation goes over stdio because a standing
  // has to change hands as data before anything can be spent.
  const mine = {
    lines: [],
    add(args) {
      this.lines.push(Buffer.from(args).toString());
      return Uint8Array.of(1);
    },
    count() {
      return utf8.encode(String(this.lines.length));
    },
  };
  const here = await guest.hold(mine, { seed: fixed(60), heirSeed: fixed(61), blueprint: LIST });
  assert.deepEqual(guest.hints, []);
  const invitation = await guest.grant(here, { voiceSeed: fixed(62), heirSeed: fixed(63) });
  assert.deepEqual(invitation.hints, []);

  ground.say({
    do: 'push',
    being: hex(here),
    title: 'bread',
    invitation: {
      warden: hex(invitation.warden),
      commitment: hex(invitation.commitment),
      padlock: hex(invitation.padlock),
      heirPublic: hex(invitation.heirPublic),
      heirSecret: hex(invitation.heirSecret),
      hints: invitation.hints,
    },
  });

  // The ground inside the container originates the ask down the connection it
  // never opened, and this side judges it and answers.
  const pushed = await ground.at('push');
  assert.ok(pushed, `the container said nothing back: ${ground.stderr()}${ground.stdout()}`);
  assert.equal(pushed.answered, true);
  assert.equal(pushed.seq, '1');
  assert.deepEqual(mine.lines, ['bread']);
});
