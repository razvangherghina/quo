// The common carriage: the hint as the whole address, one POST, bytes in and
// bytes out, and nothing else HTTP offers. Two wardens stand up on ephemeral
// loopback ports and drive a real grant, ask, answer and news across the wire.
import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import {
  Warden,
  commitment,
  hangUp,
  news,
  post,
  reach,
  readAnswer,
  readField,
  signingPair,
} from '../src/index.js';
import { serve } from '../src/door.js';
import { listen } from '../src/line.js';

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

test('a road that never carried the bytes is weather, not silence', async () => {
  // Silence has a wire form on this carriage: an empty body. A connection
  // refused and a name that does not resolve said neither of those, so the kit
  // reports the road's fault rather than inventing an empty body.
  const envelope = new Uint8Array(48);
  await assert.rejects(() => post('http://127.0.0.1:1/', envelope));
  await assert.rejects(() => post('http://a-door-that-is-not.invalid/', envelope));
  // And a caller that tried every hint it held raises the last of them rather
  // than handing back the nothing an answered door would have given.
  await assert.rejects(() =>
    reach(['http://127.0.0.1:1/', 'http://a-door-that-is-not.invalid/'], envelope),
  );
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

// Which roads a caller can speak is nothing it is told and nothing it is
// passed. It finds out by trying to pick one up, and what it can pick up is
// what the platform under it has. These three cases are the whole of that
// claim: it takes the line where it has one, it walks past the line where it
// has none, and walking past is neither silence nor weather.
test('a caller takes the road it can speak, and is told nothing about which', async (t) => {
  const world = await grounds();
  t.after(world.close);
  // The host stands on both roads at once. Nothing about the two is ranked and
  // the warden does not know which a caller will take: it offers what it has.
  const road = await listen(world.host, { clock: still, random: () => fixed(77) });
  t.after(road.close);
  assert.ok(world.host.hints.some((hint) => hint.startsWith('tcp://')));

  const stranger = await signingPair(fixed(51));
  const ask = (seq) =>
    world.guest.carry({
      recipient: world.host.name.pk,
      padlock: world.host.padlock.pk,
      voicePk: stranger.pk,
      voiceSecret: stranger.secret,
      seq,
      allowance: { time: 5_000n, hops: 4n },
      being: null,
      method: null,
      random: RANDOM,
    });

  // Handed the ground it is calling for, the caller loads the line, finds it,
  // and takes the `tcp://` hint the host offered first. Not a flag, not an
  // option: the file loaded, so the road is there.
  const over = { warden: world.guest, clock: still, random: () => fixed(78) };
  const line = await reach([road.hint, world.there.hint], await ask(1n), {
    ...over,
    far: world.host.name.pk,
    seq: 1n,
  });
  const overLine = await readBack(world.guest, world.host, line, 'describe');
  assert.ok(overLine, 'the line carried it');
  assert.equal(road.lines.size, 1, 'and it went down a connection, not a POST');
  t.after(() => hangUp(world.guest));

  // The same caller, the same hints, handed no ground: it has nowhere to hold a
  // line, so the `tcp://` hint is a road it cannot speak and it posts instead.
  // The answer is the same answer, because the road never was the point.
  const posted = await reach([road.hint, world.there.hint], await ask(2n));
  const overPost = await readBack(world.guest, world.host, posted, 'describe');
  assert.ok(overPost, 'the carriage carried it');
  assert.equal(road.lines.size, 1, 'and no second line was opened');
  assert.equal(overLine.classes.length, overPost.classes.length);
  assert.equal(
    hex(overLine.classes[0].beings[0].being),
    hex(overPost.classes[0].beings[0].being),
    'one estate, two roads, and the seal is what proved it either way',
  );
});

test('a road the caller cannot speak is not a road that failed', async () => {
  // Nothing was sent down it, so no door spoke and no road broke: it is neither
  // silence nor weather, and the caller walks past it exactly as it would past
  // a hint it had never been offered. Here every hint is unspeakable — one
  // because this caller holds no ground for a line, one because it is weather —
  // and what comes back is the weather, never the skip.
  const envelope = new Uint8Array(48);
  await assert.rejects(
    () => reach(['tcp://127.0.0.1:9', 'http://127.0.0.1:1/'], envelope),
    /ECONNREFUSED|fetch failed/,
    'the raised fault is the road that broke, not the road that was skipped',
  );
  // And a list of nothing but roads it cannot speak is no road tried at all,
  // which is not weather either: there is nothing to report the fault of.
  assert.equal(await reach(['tcp://127.0.0.1:9'], envelope), null);
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

test('the published limit and the enforced one are two separate acts, and nothing joins them', async (t) => {
  // The warden's part is only to publish the number; enforcing it is the road's
  // and the operator holds the two together by hand. Nothing derives one from
  // the other, so a house can publish a generous number and stand behind a mean
  // door — and every honest caller doing the arithmetic the published number
  // invites is refused in silence, which is what makes it undiagnosable.
  const published = 65_536n;
  const enforced = 4_096n;

  const house = await Warden.open({
    nameSeed: fixed(70),
    padlockSeed: fixed(71),
    heirSeed: fixed(72),
    limit: published,
  });
  const being = await house.hold(todo(), { seed: fixed(73), heirSeed: fixed(74), blueprint: LIST });
  const caller = await Warden.open({
    nameSeed: fixed(75),
    padlockSeed: fixed(76),
    heirSeed: fixed(77),
  });

  let grain = 150;
  const random = () => fixed((grain += 1) % 251);
  const door = await serve(house, { clock: still, random, limit: enforced });
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
  const big = utf8.encode('x'.repeat(Number(enforced)));
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
