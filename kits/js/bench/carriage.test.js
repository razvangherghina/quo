// The common carriage: the hint as the whole address, one POST, bytes in and
// bytes out, and nothing else HTTP offers. Two wardens stand up on ephemeral
// loopback ports and drive a real grant, ask, answer and news across the wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import {
  Warden,
  commitment,
  news,
  post,
  reach,
  readAnswer,
  readField,
  signingPair,
} from '../src/index.js';
import { serve } from '../src/door.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();
const still = () => 1_000;
const RANDOM = fixed(200);

const LIST = `ToDo
  add(title text) bool
  count() int
`;

function todo() {
  return {
    lines: [],
    add(args) {
      this.lines.push(Buffer.from(args).toString());
      return Uint8Array.of(1);
    },
    count() {
      return utf8.encode(String(this.lines.length));
    },
  };
}

// Two grounds, each with its own door on its own ephemeral loopback port. Two
// wardens are strangers: same machine, same seals, same judgment.
async function grounds() {
  const host = await Warden.open({ nameSeed: fixed(1), padlockSeed: fixed(2), heirSeed: fixed(3) });
  const guest = await Warden.open({
    nameSeed: fixed(10),
    padlockSeed: fixed(11),
    heirSeed: fixed(12),
  });
  const object = todo();
  const being = await host.hold(object, { seed: fixed(5), heirSeed: fixed(6), blueprint: LIST });

  // Every draw of randomness is taken as an argument, so the door is handed a
  // supplier rather than reaching for entropy.
  let grain = 100;
  const random = () => fixed((grain += 1) % 251);
  // The door tells the warden where it ended up: neither address exists until
  // the socket is bound, and everything minted after this carries them.
  const there = await serve(host, { clock: still, random });
  const here = await serve(guest, { clock: still, random });
  return {
    host,
    guest,
    object,
    being,
    there,
    here,
    close: () => Promise.all([there.close(), here.close()]),
  };
}

async function readBack(guest, host, envelope, field) {
  if (envelope === null) return null;
  const answer = await readAnswer({
    envelope,
    padlockSecret: guest.padlock.secret,
    wardenPk: host.name.pk,
  });
  if (!answer) return null;
  return field ? readField(field, answer.data) : answer;
}

test('a grant, an ask and an answer cross the wire as bytes in and bytes out', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, object, being } = world;

  // The invitation changes hands as data, carrying the hints — the only thing
  // that can, because delivery cannot begin from nothing.
  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  assert.deepEqual(invitation.hints, [world.there.hint]);
  const row = guest.remember(invitation);

  // The holder's first act: rotate, ask nothing, and read back what it stands
  // at — over the wire, at the hint and nowhere else.
  const next = await signingPair(fixed(22));
  const estate = await readBack(
    guest,
    host,
    await reach(
      row.hints,
      await guest.ask(row, {
        seq: 1n,
        commitment: await commitment(host.name.pk, next.pk),
        random: RANDOM,
      }),
    ),
    'describe',
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  assert.equal(estate.classes.length, 2);
  assert.ok(
    estate.classes.some((one) => one.beings.some((held) => hex(held.being) === hex(being))),
  );

  // And an ordinary ask on the being, answered across the same one POST.
  const answer = await readBack(
    guest,
    host,
    await post(
      world.there.hint,
      await guest.ask(row, {
        seq: 2n,
        being,
        method: { name: 'add', args: utf8.encode('milk') },
        random: RANDOM,
      }),
    ),
  );
  assert.equal(answer.seq, 2n);
  assert.deepEqual(object.lines, ['milk']);
});

test('news crosses the wire in the other direction, judged by the same steps', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest } = world;

  // The guest holds a relation with the host's house, so the host's own name
  // is placed in the guest's outbound record: what arrives is news.
  const being = await host.hold(todo(), { seed: fixed(7), heirSeed: fixed(8), blueprint: LIST });
  const invitation = await host.grant(being, { voiceSeed: fixed(30), heirSeed: fixed(31) });
  guest.remember(invitation);

  const lock = fixed(70);
  const answer = await post(
    world.here.hint,
    await news(host, {
      // A warden must be able to reach a peer it is not answering. Here it
      // holds the peer's name as well as its lock, so the recipient is the
      // name; a peer known only by its padlock is named by that instead.
      peer: { name: guest.name.pk, padlock: guest.padlock.pk },
      voice: host.name,
      word: {
        being: null,
        successor: null,
        commitment: null,
        name: null,
        padlock: lock,
        hints: ['https://moved.example'],
      },
      seq: 1n,
      random: RANDOM,
    }),
  );
  // `tell` answers nothing, so what comes back is an answer with no data.
  const read = await readAnswer({
    envelope: answer,
    padlockSecret: host.padlock.secret,
    wardenPk: guest.name.pk,
  });
  assert.equal(read.data, null);
  assert.equal(hex((await guest.outboundFor(host.name.pk)).padlock), hex(lock));
  assert.deepEqual((await guest.outboundFor(host.name.pk)).hints, ['https://moved.example']);
});

test('silence is an empty body, and no status code carries meaning', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, being } = world;

  // A voice in neither record, at a being it does not reach.
  const stranger = await signingPair(fixed(50));
  const envelope = await guest.carry({
    recipient: host.name.pk,
    padlock: host.padlock.pk,
    voicePk: stranger.pk,
    voiceSecret: stranger.secret,
    seq: 1n,
    allowance: { time: 5_000n, hops: 4n },
    being,
    method: { name: 'count', args: new Uint8Array(0) },
    random: RANDOM,
  });
  assert.equal(await post(world.there.hint, envelope), null);

  // The door answers the same way to bytes that are no box at all — a refusal
  // and an answer leave by the same door, and neither narrates.
  assert.equal(await post(world.there.hint, new Uint8Array(0)), null);
  assert.equal(await post(world.there.hint, utf8.encode('not a box')), null);

  // And nothing else of HTTP is read or written: the status is 200 whether the
  // door spoke or was silent, and the body is the whole of the message.
  const status = await statusOf(world.there.hint, new Uint8Array(0));
  assert.equal(status.code, 200);
  assert.equal(status.length, 0);
  const spoke = await statusOf(
    world.there.hint,
    await guest.carry({
      recipient: host.name.pk,
      padlock: host.padlock.pk,
      voicePk: stranger.pk,
      voiceSecret: stranger.secret,
      seq: 1n,
      allowance: { time: 5_000n, hops: 4n },
      being: null,
      method: null,
      random: RANDOM,
    }),
  );
  assert.equal(spoke.code, 200);
  assert.ok(spoke.length > 0);
});

test('the hint is posted to exactly as given, with no path and no query', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const seen = [];
  world.there.server.on('request', (incoming) => seen.push(incoming.url));
  const stranger = await signingPair(fixed(50));
  await post(
    world.there.hint,
    await world.guest.carry({
      recipient: world.host.name.pk,
      padlock: world.host.padlock.pk,
      voicePk: stranger.pk,
      voiceSecret: stranger.secret,
      seq: 1n,
      allowance: { time: 5_000n, hops: 4n },
      being: null,
      method: null,
      random: RANDOM,
    }),
  );
  // No path was appended and no query added: the URL the hint named is the
  // whole of the address.
  assert.deepEqual(seen, ['/']);
});

test('a caller tries the hints it holds, because none is authoritative', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const stranger = await signingPair(fixed(50));
  const envelope = await world.guest.carry({
    recipient: world.host.name.pk,
    padlock: world.host.padlock.pk,
    voicePk: stranger.pk,
    voiceSecret: stranger.secret,
    seq: 1n,
    allowance: { time: 5_000n, hops: 4n },
    being: null,
    method: null,
    random: RANDOM,
  });
  // A hint is a guess about the weather. The dead road is tried and the live
  // one answers, and nothing is proved by the arrival — everything is proved
  // by the seal.
  const answer = await reach(['http://127.0.0.1:1', world.there.hint], envelope);
  const estate = await readBack(world.guest, world.host, answer, 'describe');
  assert.equal(estate.classes.length, 1);
  assert.equal(hex(estate.classes[0].beings[0].being), hex(world.host.name.pk));
});

test('a door that learns its address at serve time mints invitations that reach it', async (t) => {
  // Opened knowing nothing about where it will stand: an ephemeral port has no
  // address until the socket is bound, so a warden that fixed its roads at
  // birth could only hand out hints that reach nobody.
  const house = await Warden.open({
    nameSeed: fixed(30),
    padlockSeed: fixed(31),
    heirSeed: fixed(32),
  });
  assert.deepEqual(house.hints, []);
  const being = await house.hold(todo(), { seed: fixed(33), heirSeed: fixed(34), blueprint: LIST });
  const caller = await Warden.open({
    nameSeed: fixed(40),
    padlockSeed: fixed(41),
    heirSeed: fixed(42),
  });

  let grain = 60;
  const door = await serve(house, { clock: still, random: () => fixed((grain += 1) % 251) });
  t.after(door.close);
  assert.deepEqual(house.hints, [door.hint]);

  const invitation = await house.grant(being, { voiceSeed: fixed(43), heirSeed: fixed(44) });
  assert.deepEqual(invitation.hints, [door.hint]);

  // The proof is not that the strings match but that the road carries: the
  // holder posts down the hints it was given and a door answers.
  const row = caller.remember(invitation);
  const next = await signingPair(fixed(45));
  const estate = await readBack(
    caller,
    house,
    await reach(
      row.hints,
      await caller.ask(row, {
        seq: 1n,
        commitment: await commitment(house.name.pk, next.pk),
        random: RANDOM,
      }),
    ),
    'describe',
  );
  const stands = estate.classes.flatMap((one) => one.beings.map((each) => hex(each.being)));
  assert.ok(stands.includes(hex(being)));

  // A second road is added, never swapped: a warden offers as many as it has.
  house.publish('https://house.example');
  const card = house.card();
  assert.deepEqual(card.hints, [door.hint, 'https://house.example']);

  // And a road that stops carrying stops being minted: the second door is the
  // whole of a warden moving house, which is open the new road, close the old.
  const moved = await serve(house, { clock: still, random: () => fixed(7) });
  t.after(moved.close);
  assert.deepEqual(house.hints, [door.hint, 'https://house.example', moved.hint]);
  await moved.close();
  assert.deepEqual(house.card().hints, [door.hint, 'https://house.example']);
});

function statusOf(hint, body) {
  return new Promise((resolve, reject) => {
    const call = request(hint, { method: 'POST' }, (incoming) => {
      const chunks = [];
      incoming.on('data', (chunk) => chunks.push(chunk));
      incoming.on('end', () =>
        resolve({ code: incoming.statusCode, length: Buffer.concat(chunks).length }),
      );
    });
    call.on('error', reject);
    call.end(Buffer.from(body));
  });
}
