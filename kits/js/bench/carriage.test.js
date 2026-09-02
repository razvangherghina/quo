// The common carriage: the hint as the whole address, one POST, bytes in and
// bytes out, and nothing else HTTP offers. Two wardens stand up on ephemeral
// loopback ports and drive a real grant, ask, answer and news across the wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import {
  Warden,
  commitment,
  encode,
  news,
  post,
  readAnswer,
  readField,
  signingPair,
} from '../src/index.js';
import { serve } from '../src/door.js';
import { host as stand } from '../src/host.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const fixed = (fill) => new Uint8Array(32).fill(fill);
const utf8 = new TextEncoder();
const still = () => 1_000;
const RANDOM = fixed(200);
const TEXT = { base: 'text' };

const LIST = `ToDo
  add(title text) bool
  count() int
`;

function todo() {
  return {
    lines: [],
    add(title) {
      this.lines.push(title);
      return true;
    },
    count() {
      return BigInt(this.lines.length);
    },
  };
}

// Two grounds, each with its own door on its own ephemeral loopback port. Two
// wardens are strangers: same machine, same seals, same judgment.
async function grounds() {
  // The clock and the randomness are handed to the warden, never reached for:
  // the door behind a road takes them from the warden it serves.
  let grain = 100;
  const random = () => fixed((grain += 1) % 251);
  const host = await Warden.open({
    nameSeed: fixed(1),
    padlockSeed: fixed(2),
    heirSeed: fixed(3),
    clock: still,
    random,
  });
  const guest = await Warden.open({
    nameSeed: fixed(10),
    padlockSeed: fixed(11),
    heirSeed: fixed(12),
    clock: still,
    random,
  });
  const object = todo();
  const { being } = await host.hold(object, {
    seed: fixed(5),
    heirSeed: fixed(6),
    blueprint: LIST,
  });

  // The door tells the warden where it ended up: neither address exists until
  // the socket is bound, and everything minted after this carries them.
  const there = await serve(host);
  const here = await serve(guest);
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
    await post(
      row.hints[0],
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
        method: { name: 'add', args: encode(TEXT, 'milk') },
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
  const { being } = await host.hold(todo(), {
    seed: fixed(7),
    heirSeed: fixed(8),
    blueprint: LIST,
  });
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

test('a road that never carried the bytes is weather, not silence', async () => {
  // Silence has a wire form on this carriage: an empty body. A connection
  // refused and a name that does not resolve said neither of those, so the kit
  // reports the road's fault rather than inventing an empty body.
  const envelope = new Uint8Array(48);
  await assert.rejects(() => post('http://127.0.0.1:1/', envelope));
  await assert.rejects(() => post('http://a-door-that-is-not.invalid/', envelope));
});

test('a caller tries the hints it holds, because none is authoritative', async (t) => {
  // A hint is a guess about the weather, and delivery is what tries them: the
  // dead road is tried and the live one carries. Nothing is proved by the
  // arrival — everything is proved by the seal.
  const alice = await stand({
    seeds: { name: fixed(60), padlock: fixed(61), heir: fixed(62) },
    clock: still,
    random: () => crypto.getRandomValues(new Uint8Array(32)),
    roads: ['http'],
  });
  const bob = await stand({
    seeds: { name: fixed(63), padlock: fixed(64), heir: fixed(65) },
    clock: still,
    random: () => crypto.getRandomValues(new Uint8Array(32)),
  });
  t.after(() => Promise.all([alice.close(), bob.close()]));

  const object = todo();
  await alice.warden.hold(object, { blueprint: LIST });
  const invitation = await object.quo.grant(object);
  // A road that is nothing but weather, offered first.
  invitation.hints.unshift('http://127.0.0.1:1/');
  const [handle] = await bob.warden.accept(invitation, { label: 'todo' });
  assert.equal(await handle.add('milk'), true);
  assert.deepEqual(object.lines, ['milk']);
});

test('a door that learns its address at serve time mints invitations that reach it', async (t) => {
  // Opened knowing nothing about where it will stand: an ephemeral port has no
  // address until the socket is bound, so a warden that fixed its roads at
  // birth could only hand out hints that reach nobody.
  let grain = 60;
  const house = await Warden.open({
    nameSeed: fixed(30),
    padlockSeed: fixed(31),
    heirSeed: fixed(32),
    clock: still,
    random: () => fixed((grain += 1) % 251),
  });
  assert.deepEqual(house.hints, []);
  const { being } = await house.hold(todo(), {
    seed: fixed(33),
    heirSeed: fixed(34),
    blueprint: LIST,
  });
  const caller = await Warden.open({
    nameSeed: fixed(40),
    padlockSeed: fixed(41),
    heirSeed: fixed(42),
  });

  const door = await serve(house);
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
    await post(
      row.hints[0],
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
  const moved = await serve(house);
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

test('the published limit and the enforced one are two separate acts, and nothing joins them', async (t) => {
  // The warden's part is only to publish the number; enforcing it is the road's
  // and the operator holds the two together by hand. Nothing derives one from
  // the other, so a house can publish a generous number and stand behind a mean
  // door — and every honest caller doing the arithmetic the published number
  // invites is refused in silence, which is what makes it undiagnosable.
  const published = 65_536n;
  const enforced = 4_096n;

  let grain = 150;
  const house = await Warden.open({
    nameSeed: fixed(70),
    padlockSeed: fixed(71),
    heirSeed: fixed(72),
    limit: published,
    clock: still,
    random: () => fixed((grain += 1) % 251),
  });
  const { being } = await house.hold(todo(), {
    seed: fixed(73),
    heirSeed: fixed(74),
    blueprint: LIST,
  });
  const caller = await Warden.open({
    nameSeed: fixed(75),
    padlockSeed: fixed(76),
    heirSeed: fixed(77),
  });

  const door = await serve(house, { limit: enforced });
  t.after(door.close);

  const invitation = await house.grant(being, { voiceSeed: fixed(78), heirSeed: fixed(79) });
  const row = caller.remember(invitation);
  const next = await signingPair(fixed(80));
  await post(
    door.hint,
    await caller.ask(row, {
      seq: 1n,
      commitment: await commitment(house.name.pk, next.pk),
      random: RANDOM,
    }),
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  row.heir = next;

  // What the house says about itself, asked over the wire like anything else.
  const asked = await readBack(
    caller,
    house,
    await post(
      door.hint,
      await caller.ask(row, {
        seq: 2n,
        being: house.name.pk,
        method: { name: 'limit', args: new Uint8Array(0) },
        random: RANDOM,
      }),
    ),
    'limit',
  );
  assert.equal(asked, published, 'the warden publishes the number it was opened with');

  // A caller that believes it and sends something comfortably inside it meets
  // silence, because the road in front of the door was held to a smaller
  // number and the road is what counts the bytes.
  const big = encode(TEXT, 'x'.repeat(Number(enforced)));
  const over = await caller.ask(row, {
    seq: 3n,
    being,
    method: { name: 'add', args: big },
    random: RANDOM,
  });
  assert.ok(
    BigInt(over.length) > enforced && BigInt(over.length) < published,
    'the probe has to sit between the two numbers or it proves nothing',
  );
  assert.equal(await post(door.hint, over), null);

  // And it is the road rather than the judgment: the same envelope handed
  // straight to the warden is answered, so nothing about the message was wrong.
  assert.notEqual(await house.judge(over, { clock: still, random: RANDOM }), null);
});
