// The framed carriage: sealed envelopes as length-prefixed frames over one
// persistent TCP connection. Two real wardens on a real loopback socket drive
// an ask, an answer, a push back down the line the caller opened, and every way
// the line is allowed to fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';
import { Warden, commitment, readAnswer, readField, signingPair } from '../src/index.js';
import { CAP, DEFAULT, dial, listen } from '../src/line.js';

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

const grain = (start) => {
  let seed = start;
  return () => fixed((seed += 7) % 251);
};

// Two grounds: one listening on an ephemeral loopback port, one that only ever
// dials out and publishes no road at all.
async function grounds(options = {}) {
  const host = await Warden.open({ nameSeed: fixed(1), padlockSeed: fixed(2), heirSeed: fixed(3) });
  const guest = await Warden.open({
    nameSeed: fixed(10),
    padlockSeed: fixed(11),
    heirSeed: fixed(12),
  });
  const object = todo();
  const being = await host.hold(object, { seed: fixed(5), heirSeed: fixed(6), blueprint: LIST });
  const accepted = [];
  const door = await listen(host, {
    clock: still,
    random: grain(100),
    accepted: (line) => accepted.push(line),
    ...options,
  });
  return { host, guest, object, being, door, accepted, close: () => door.close() };
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

// The plain wire, for the cases that are about framing rather than about Quo.
function raw(hint) {
  const at = /^tcp:\/\/([^/:?]+):(\d+)(?:\?cap=\d+)?$/.exec(hint);
  return new Promise((resolve) => {
    const socket = connect({ host: at[1], port: Number(at[2]) }, () => resolve(socket));
  });
}

function header(length) {
  const out = Buffer.alloc(8);
  out.writeBigInt64BE(BigInt(length));
  return out;
}

// The peer dropped us without a word: the socket closed and nothing was ever
// written back.
function dropped(socket) {
  return new Promise((resolve) => {
    const said = [];
    socket.on('data', (chunk) => said.push(chunk));
    socket.on('close', () => resolve(Buffer.concat(said)));
  });
}

test('an ask and its answer ride one line, and the listener publishes its road', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, object, being } = world;

  // The listening half tells the warden where it ended up, the same way the
  // door does — so everything minted after this carries the road.
  assert.deepEqual(host.hints, [world.door.hint]);
  // This warden published no limit, so the door's appetite is the kit's number
  // rather than the default — and the road says so before a byte flows.
  assert.match(world.door.hint, /^tcp:\/\/127\.0\.0\.1:\d+\?cap=1048576$/);

  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  assert.deepEqual(invitation.hints, [world.door.hint]);
  const row = guest.remember(invitation);

  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());

  const next = await signingPair(fixed(22));
  const estate = await read(
    guest,
    host.name.pk,
    await line.carry(
      await guest.ask(row, {
        seq: 1n,
        commitment: await commitment(host.name.pk, next.pk),
        random: RANDOM,
      }),
      { warden: host.name.pk, seq: 1n },
    ),
    'describe',
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  assert.ok(
    estate.classes.some((one) => one.beings.some((held) => hex(held.being) === hex(being))),
  );

  // A second ask down the same connection: one socket, many messages.
  const answer = await read(
    guest,
    host.name.pk,
    await line.carry(
      await guest.ask(row, {
        seq: 2n,
        being,
        method: { name: 'add', args: utf8.encode('milk') },
        random: RANDOM,
      }),
      { warden: host.name.pk, seq: 2n },
    ),
  );
  assert.equal(answer.seq, 2n);
  assert.deepEqual(object.lines, ['milk']);
});

test('a push rides back down a line the far end dialled out', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest } = world;

  // The dialling ground holds a being and publishes no road — it cannot be
  // called, and it does not pretend it can.
  const mine = todo();
  const being = await guest.hold(mine, { seed: fixed(60), heirSeed: fixed(61), blueprint: LIST });
  assert.deepEqual(guest.hints, []);

  // The dialler grants the listener a standing at that being, and the
  // invitation carries no hint at all: the road is the line already open.
  const invitation = await guest.grant(being, { voiceSeed: fixed(62), heirSeed: fixed(63) });
  assert.deepEqual(invitation.hints, []);
  const row = host.remember(invitation);

  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());
  // The dialler speaks first, which is what makes the connection exist.
  await line.carry(
    await guest.carry({
      recipient: host.name.pk,
      padlock: host.padlock.pk,
      voicePk: (await signingPair(fixed(64))).pk,
      voiceSecret: (await signingPair(fixed(64))).secret,
      seq: 1n,
      allowance: { time: 5_000n, hops: 4n },
      being: null,
      method: null,
      random: RANDOM,
    }),
  );
  await new Promise((done) => setTimeout(done, 20));
  assert.equal(world.accepted.length, 1);

  // And now the listener asks down the connection it never opened.
  const answer = await read(
    host,
    guest.name.pk,
    await world.accepted[0].carry(
      await host.ask(row, {
        seq: 1n,
        // The holder's first act is a rotation, on this carriage as on any
        // other: what travelled was an heir, and it is spent by being used.
        commitment: await commitment(guest.name.pk, (await signingPair(fixed(65))).pk),
        being,
        method: { name: 'add', args: utf8.encode('bread') },
        random: RANDOM,
      }),
      { warden: guest.name.pk, seq: 1n },
    ),
  );
  assert.equal(answer.seq, 1n);
  assert.deepEqual(mine.lines, ['bread']);
});

test('a refused ask produces no frame at all, and the line lives on', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, being } = world;

  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());

  // A voice in neither record, at a being it does not reach. On this carriage
  // silence has no wire form, so nothing comes back and the caller's deadline
  // is its own affair.
  const stranger = await signingPair(fixed(50));
  const refused = await guest.carry({
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
  const waited = await Promise.race([
    line.carry(refused, { warden: host.name.pk, seq: 1n }),
    new Promise((done) => setTimeout(() => done('nothing came back'), 60)),
  ]);
  assert.equal(waited, 'nothing came back');
  assert.equal(line.open, true);

  // Bytes that are no box at all are the same ordinary silence, and the line
  // still stands after them.
  const noise = await Promise.race([
    line.carry(utf8.encode('not a box at all, but well framed'), {
      warden: host.name.pk,
      seq: 99n,
    }),
    new Promise((done) => setTimeout(() => done('nothing came back'), 60)),
  ]);
  assert.equal(noise, 'nothing came back');
  assert.equal(line.open, true);

  // And a later, legal ask on the same line still answers.
  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  const row = guest.remember(invitation);
  const answer = await read(
    guest,
    host.name.pk,
    await line.carry(
      await guest.ask(row, {
        seq: 7n,
        commitment: await commitment(host.name.pk, (await signingPair(fixed(23))).pk),
        being,
        method: { name: 'count', args: new Uint8Array(0) },
        random: RANDOM,
      }),
      { warden: host.name.pk, seq: 7n },
    ),
  );
  assert.equal(answer.seq, 7n);
});

test('a broken frame drops the connection without a word', async (t) => {
  const world = await grounds();
  t.after(world.close);

  // A negative length. Eight signed bytes can say it, and it means nothing.
  const negative = await raw(world.door.hint);
  const wentNegative = dropped(negative);
  negative.write(header(-1));
  assert.equal((await wentNegative).length, 0);

  // A zero-length frame is malformed, not silence: silence has no wire form
  // here, so an empty frame is a peer that cannot frame.
  const empty = await raw(world.door.hint);
  const wentEmpty = dropped(empty);
  empty.write(header(0));
  assert.equal((await wentEmpty).length, 0);

  // Over the cap, which the kit sets where the host gave the warden no limit.
  const huge = await raw(world.door.hint);
  const wentHuge = dropped(huge);
  huge.write(header(CAP + 1n));
  assert.equal((await wentHuge).length, 0);

  // A body cut short: the length claims more than ever arrives, and the peer
  // stops speaking.
  const short = await raw(world.door.hint);
  const wentShort = dropped(short);
  short.write(Buffer.concat([header(64), Buffer.alloc(10)]));
  short.end();
  assert.equal((await wentShort).length, 0);
});

// A frame the far end reads rather than drops: what it holds is no box at all,
// so what comes of it is ordinary silence — which is the proof the frame was
// read and the line lived.
async function carried(hint, size) {
  const at = await raw(hint);
  const said = [];
  at.on('data', (chunk) => said.push(chunk));
  const cut = new Promise((done) => at.on('close', () => done('the line was dropped')));
  at.write(Buffer.concat([header(size), Buffer.alloc(Number(size))]));
  const waited = await Promise.race([
    cut,
    new Promise((done) => setTimeout(() => done('the frame was carried'), 100)),
  ]);
  at.destroy();
  return said.length === 0 ? waited : 'the peer answered';
}

test('a bare road promises the default and a road with another cap says so', async (t) => {
  const plain = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
    limit: DEFAULT,
  });
  const door = await listen(plain, { clock: still, random: grain(100) });
  t.after(door.close);
  // The default is what a bare road promises, so a door holding exactly it
  // declares nothing.
  assert.match(door.hint, /^tcp:\/\/127\.0\.0\.1:\d+$/);
  assert.equal(await carried(door.hint, DEFAULT), 'the frame was carried');

  const over = await raw(door.hint);
  const went = dropped(over);
  over.write(header(DEFAULT + 1n));
  assert.equal((await went).length, 0);

  // Another appetite is a number on the road. A door under the default is one
  // of those: declared, it is a legal small line.
  const small = await Warden.open({
    nameSeed: fixed(86),
    padlockSeed: fixed(87),
    heirSeed: fixed(88),
  });
  const narrow = await listen(small, { clock: still, random: grain(100), limit: 4_096n });
  t.after(narrow.close);
  assert.match(narrow.hint, /^tcp:\/\/127\.0\.0\.1:\d+\?cap=4096$/);
  assert.deepEqual(small.hints, [narrow.hint]);
});

test('a dialler stays under the cap the far road declared', async (t) => {
  const world = await grounds({ limit: 4_096n });
  t.after(world.close);
  const { host, guest, object, being } = world;
  assert.match(world.door.hint, /\?cap=4096$/);

  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  const row = guest.remember(invitation);
  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());

  // Over what the road promised, the sender's own kit says no and no byte
  // flows: the alternative is a frame the far end must drop, which would kill
  // the line this end still wants.
  assert.equal(await line.carry(new Uint8Array(5_000)), null);
  assert.equal(line.open, true);

  // And the line is the ordinary line still.
  const next = await signingPair(fixed(22));
  const estate = await read(
    guest,
    host.name.pk,
    await line.carry(
      await guest.ask(row, {
        seq: 1n,
        commitment: await commitment(host.name.pk, next.pk),
        random: RANDOM,
      }),
      { warden: host.name.pk, seq: 1n },
    ),
    'describe',
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  assert.ok(estate);
  const answer = await read(
    guest,
    host.name.pk,
    await line.carry(
      await guest.ask(row, {
        seq: 2n,
        being,
        method: { name: 'add', args: utf8.encode('milk') },
        random: RANDOM,
      }),
      { warden: host.name.pk, seq: 2n },
    ),
  );
  assert.equal(answer.seq, 2n);
  assert.deepEqual(object.lines, ['milk']);
});

test('a warden under the default that declares nothing does not offer the line', async () => {
  const small = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
    limit: DEFAULT - 1n,
  });
  // Neither half stands. The refusal is plain and it is at the open: an end
  // holding less than the default, with no cap said anywhere, is not a small
  // line but no line, so nothing is bound and nothing is dialled.
  await assert.rejects(
    () => listen(small, { clock: still, random: grain(100) }),
    (thrown) => thrown.name === 'UnderTheDefault',
  );
  assert.deepEqual(small.hints, []);
  await assert.rejects(
    () => dial(small, 'tcp://127.0.0.1:1', { clock: still, random: grain(50) }),
    (thrown) => thrown.name === 'UnderTheDefault',
  );

  // The dialling half publishes nothing at all, so even an explicit small cap
  // has no road to ride: a dialler always promises the default.
  const roomy = await Warden.open({
    nameSeed: fixed(83),
    padlockSeed: fixed(84),
    heirSeed: fixed(85),
  });
  await assert.rejects(
    () => dial(roomy, 'tcp://127.0.0.1:1', { clock: still, random: grain(50), limit: 32n }),
    (thrown) => thrown.name === 'UnderTheDefault',
  );
});

test('a hint is matched byte for byte as written', async () => {
  // A hint is compared, republished as news and stored in a row, so two
  // spellings of one road would be two roads. Case, leading zeros and all.
  const warden = await Warden.open({
    nameSeed: fixed(93),
    padlockSeed: fixed(94),
    heirSeed: fixed(95),
  });
  warden.publish('tcp://127.0.0.1:9000');
  warden.publish('tcp://127.0.0.1:9000');
  assert.deepEqual(warden.hints, ['tcp://127.0.0.1:9000']);
  warden.publish('TCP://127.0.0.1:9000', 'tcp://127.0.0.1:09000', 'tcp://127.0.0.1:9000 ');
  assert.equal(warden.hints.length, 4);
  // And retracting one road retracts that road and no other spelling of it.
  warden.retract('tcp://127.0.0.1:9000');
  assert.deepEqual(warden.hints, [
    'TCP://127.0.0.1:9000',
    'tcp://127.0.0.1:09000',
    'tcp://127.0.0.1:9000 ',
  ]);
});

test('a dialling end promises the default and accepts no more', async (t) => {
  // The listener holds a megabyte and says so on its road; the dialler
  // publishes nothing, so it promises the default and there is no way to
  // promise more — whatever its own appetite.
  const world = await grounds({ limit: 1n << 20n });
  t.after(world.close);
  assert.match(world.door.hint, /\?cap=1048576$/);
  const line = await dial(world.guest, world.door.hint, { clock: still, random: grain(50) });
  while (world.accepted.length === 0) await new Promise((done) => setImmediate(done));

  // A frame one byte over the default, written straight onto the socket the
  // listener holds. The dialler cannot frame it, so it drops without a word.
  const closed = new Promise((done) => line.socket.on('close', done));
  const over = Number(DEFAULT) + 1;
  world.accepted[0].socket.write(Buffer.concat([header(over), Buffer.alloc(over)]));
  await closed;
  assert.equal(line.open, false);
});

test('an envelope at the default rides a line whose warden published no limit', async (t) => {
  const world = await grounds();
  t.after(world.close);
  assert.equal(world.host.limit, 0n);
  assert.equal(await carried(world.door.hint, DEFAULT), 'the frame was carried');
});

test('a closed line resolves its pending asks to null', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, being } = world;

  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  const stranger = await signingPair(fixed(50));
  const refused = await guest.carry({
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
  const waiting = line.carry(refused, { warden: host.name.pk, seq: 1n });
  // Closing is the same nothing a shut door gives, and re-dialling is the
  // caller's affair.
  line.close();
  assert.equal(await waiting, null);
  assert.equal(line.open, false);
  assert.equal(await line.carry(refused, { warden: host.name.pk, seq: 2n }), null);
});

test('a listening line stops carrying when its road is retracted', async (t) => {
  const world = await grounds();
  const { host, guest, being } = world;
  assert.deepEqual(host.hints, [world.door.hint]);

  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());
  const stranger = await signingPair(fixed(50));
  const waiting = line.carry(
    await guest.carry({
      recipient: host.name.pk,
      padlock: host.padlock.pk,
      voicePk: stranger.pk,
      voiceSecret: stranger.secret,
      seq: 1n,
      allowance: { time: 5_000n, hops: 4n },
      being,
      method: { name: 'count', args: new Uint8Array(0) },
      random: RANDOM,
    }),
    { warden: host.name.pk, seq: 1n },
  );
  await world.close();
  // A road that has stopped carrying is not a road, and the dead line's
  // pending ask resolves to the same nothing.
  assert.deepEqual(host.hints, []);
  assert.equal(await waiting, null);
});

test('a second ask whose answer would be indistinguishable is not sent', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, being } = world;

  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());

  // A voice at nothing, so nothing ever answers and the first ask stays
  // awaiting.
  const stranger = await signingPair(fixed(50));
  const ask = (seq) =>
    guest.carry({
      recipient: host.name.pk,
      padlock: host.padlock.pk,
      voicePk: stranger.pk,
      voiceSecret: stranger.secret,
      seq,
      allowance: { time: 5_000n, hops: 4n },
      being,
      method: { name: 'count', args: new Uint8Array(0) },
      random: RANDOM,
    });

  const first = line.carry(await ask(1n), { warden: host.name.pk, seq: 1n });
  // One return padlock, one far warden, one number: the two answers would be
  // indistinguishable, so the sender's own kit refuses to send the second
  // while the first waits. It answers the same nothing everything else does.
  assert.equal(await line.carry(await ask(1n), { warden: host.name.pk, seq: 1n }), null);
  // A different number collides with nothing and rides.
  const other = line.carry(await ask(2n), { warden: host.name.pk, seq: 2n });
  const settled = await Promise.race([
    Promise.any([first, other]),
    new Promise((done) => setTimeout(() => done('both still waiting'), 60)),
  ]);
  assert.equal(settled, 'both still waiting');
  assert.equal(line.open, true);
});

test('a hint that is not a line is not dialled', async () => {
  const guest = await Warden.open({
    nameSeed: fixed(90),
    padlockSeed: fixed(91),
    heirSeed: fixed(92),
  });
  await assert.rejects(() =>
    dial(guest, 'http://127.0.0.1:1', { clock: still, random: grain(50) }),
  );
  await assert.rejects(() =>
    dial(guest, 'tcp://127.0.0.1:1/path', { clock: still, random: grain(50) }),
  );
  // A cap is decimal bytes and nothing after it. Anything else is a hint this
  // end cannot read, and an unreadable road is not dialled at all.
  for (const hint of [
    'tcp://127.0.0.1:1?cap=',
    'tcp://127.0.0.1:1?cap=big',
    'tcp://127.0.0.1:1?cap=16384x',
    'tcp://127.0.0.1:1?cap=16384&x=1',
    // A cap of zero or a port of zero names a door that can take nothing, and
    // is no road at all: refused when offered as a road, never dialled.
    'tcp://127.0.0.1:1?cap=0',
    'tcp://127.0.0.1:0',
    'tcp://127.0.0.1:0?cap=65536',
    'tcp://127.0.0.1:1?limit=16384',
  ]) {
    await assert.rejects(
      () => dial(guest, hint, { clock: still, random: grain(50) }),
      (thrown) => thrown.message === 'NOT_A_LINE',
      hint,
    );
  }
});
