// The line's second address form: the same frames as the binary messages of a
// WebSocket. Two real wardens over a real TLS socket on a real loopback port
// drive an ask, an answer, a push back down the line the caller opened, and
// every way this form is allowed to fail. What is asserted here is that
// nothing above the bytes changed: the frame on the wire is the tcp form's
// frame to the byte, and the caps, the silence and the wordless drop read the
// same.
//
// The certificate below is a fixture and nothing else: self-signed, for
// 127.0.0.1, and its key is in this file on purpose. Node's own `WebSocket` —
// the platform road a browser tab would take — has no way to be told about it,
// so the one case that dials through it waives verification for this process
// alone. `node --test` gives each file its own, so the waiver reaches nothing.
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:tls';
import { createHash, randomBytes } from 'node:crypto';
import { Warden, commitment, readAnswer, readField, signingPair } from '../src/index.js';
import { CAP, DEFAULT, dial, listen } from '../src/line-ws.js';
import { reach } from '../src/carriage.js';

const KEY = `-----BEGIN PRIVATE KEY-----
MIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDvArOtIaUweejL
zw/gG8VfqTre79ylXWdr1lz9AYECBaLunVjHxS+AhWZfsEkXzsDwMHRt4nuuHMMf
otXisLbBxJwYKp9uoiMS1PDBmXHMV12xCIBuDNrCgjCbr5+wMB7WY+ME6f46kesf
wnchuDSc+dkHFa3M0tJ/00A4MU41ms/GsxqrHqdvcq31E7OjY8Wm75y5u1smKEW9
IcWCFzW2F0QHAF0WwPl9HHRixF46FIvSznwRSU1aHg/8Sl2fK0eVWZ8Rbh1MaWsn
iL4Kc/rcV2sY4jDR9AgvwA5bnVK4emnlbGw19Jq00dQziD/XQ8NqeLhnhrO7c4VF
scY/2i1hAgMBAAECggEAOH8vgK/Qz+YpSK/v5T47SBMFJviU9APhtARuY6Hs4FD7
xCKufz5VrbAa1Gijxnxpb/1MMENWkAAdgYdovpaeBKyYZ0AAAtNRrhxmsqS2WSKX
s4a6cQkZ1tuWaN65RRkC2ROwcJNtNGQUq6O4rGBSE38dtYaC2EVHW87QQdgp0BKM
o4aRexkJVq3DR7E/kAAKZF4VA4q712q+twvfq3nl38z++JsTd0I0HQDsh3PFxJmv
VsmpN/0d9RkNHSYu5QrIMHiScvN0Q34qVUWre0A/ZOhGzMS4enEjsrEkw8CqPx5B
rNNh6Ik+WvrsSv8p/VrBIFas1EGOul2lsFIrY74+DwKBgQD/1BgY6pMFRw+FSLKP
keHDPWcMMBFFGTuvXnYuPGM0wJ0QcmKaHQ/nHXp1COrjNfHnmSrz2+/o+dA98rQs
XCRwqAmVNWOsa/tpM/7AYL30R4IZK0pXQpTqUXcfVktpSTzJxYyypXLNRRmNddPN
mWILH+FIUaK/VsfCgc7+421a1wKBgQDvK7itfuYaBQnMsePgL+NA8fDqNavIKi47
RRZ7BEVBH3hSRj6ocEpJheE2y4eT+sQtHssq6bdSedGY22K3OlLCvt1Bf91n/smk
hvXQRQCzXcCC6pGXSpVf9JA/tO0TPRQVpnqadQgJ1RBxJWBZi2W5Mt935y8R92I2
69iaoPgqhwKBgQCknBsZRS5ucefZsgo6+PoUP1kj7XXfSTovQA+49mA7HEizwXYS
heqqojwePCuvIRHTHKoXmQgIl11XzugBtxQ3bNglquHEmwJ9Edi0fksbeDuM6F8A
QLZDA0Ir5sHFMDut9K/wbyasT+7+J7euDiiY0d2KRAT9KuCEFjRTq5C8pwKBgQCB
/d1uTt55netpmfYkz2JQ1i7+3RT0whhGlpJVYkjR0GzxKsS7f+ygcWerBIw33b/q
ViZOuKCu7w8AaZ0JwWVh+6L+CqUn9M9b4Q6RmC99TaNohF2FQUBW2vHb7lY8cqIL
8mQItzsbPPamyI3JnX44XnIfFUP8G90BxMYBpSO82QKBgFpyGAnf/AN2dDdXMWTg
rml+Ef67Lg+C29N5mGO3+O+3lzdvliOUHb/72ZZ5mGa4ha5jw0JYPDNGSBKtE6eK
Gg3aJqkLonu2P32RYMJc1lYpemGVIbK7Mbqagz6gNhddzzOASolUasj2wNF79kfW
hinatbPfTnXlZzKxdVuMXO83
-----END PRIVATE KEY-----
`;

const CERT = `-----BEGIN CERTIFICATE-----
MIIDJzCCAg+gAwIBAgIUNxhh60xBeFczZQ3vh1IWtHogqzEwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMCAXDTI2MDgzMTIyMzkxNloYDzIxMjYw
ODA3MjIzOTE2WjAUMRIwEAYDVQQDDAkxMjcuMC4wLjEwggEiMA0GCSqGSIb3DQEB
AQUAA4IBDwAwggEKAoIBAQDvArOtIaUweejLzw/gG8VfqTre79ylXWdr1lz9AYEC
BaLunVjHxS+AhWZfsEkXzsDwMHRt4nuuHMMfotXisLbBxJwYKp9uoiMS1PDBmXHM
V12xCIBuDNrCgjCbr5+wMB7WY+ME6f46kesfwnchuDSc+dkHFa3M0tJ/00A4MU41
ms/GsxqrHqdvcq31E7OjY8Wm75y5u1smKEW9IcWCFzW2F0QHAF0WwPl9HHRixF46
FIvSznwRSU1aHg/8Sl2fK0eVWZ8Rbh1MaWsniL4Kc/rcV2sY4jDR9AgvwA5bnVK4
emnlbGw19Jq00dQziD/XQ8NqeLhnhrO7c4VFscY/2i1hAgMBAAGjbzBtMB0GA1Ud
DgQWBBRsj2VsENO8ZohdeH2Foita1FjUmzAfBgNVHSMEGDAWgBRsj2VsENO8Zohd
eH2Foita1FjUmzAPBgNVHRMBAf8EBTADAQH/MBoGA1UdEQQTMBGHBH8AAAGCCWxv
Y2FsaG9zdDANBgkqhkiG9w0BAQsFAAOCAQEApo0+Hjahcr73EPX7e+N1mPUx45Nc
Na2FvNv68B+dwqqE8FbxhTHOOc8waqELQ8NDvpQ7W2+IWS9a5wl3uxDNfvM2XJCs
DFzBwX/9R/yTc+7YuYrRbaTzJD4oYxwaSMKks+3MrJLWai0xFagUhBOfKvLeeSIQ
2kfYs3cMWc0j12KrmgIPEo/ObPAUpnT9Ug8MCHX72VDg9M+8TtDqptaAdPFmCj7G
B10d7gDOT2qp3HBL9A2GMQAz3njOjD+B7kzzlQkPdbnyHqv9lr3zlwHy5rHTp3ZQ
QqCROkKk9ORv1uHt/wyVAasqyiIuyyvenxwt1ofbtDFf/dAUVg+9KCEoLQ==
-----END CERTIFICATE-----
`;

const TLS = { key: KEY, cert: CERT };
const TRUST = { ca: CERT };

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

// Two grounds: one listening on an ephemeral loopback port and terminating its
// own TLS, one that only ever dials out and publishes no road at all.
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
    tls: TLS,
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

function header(length) {
  const out = Buffer.alloc(8);
  out.writeBigInt64BE(BigInt(length));
  return out;
}

// A WebSocket of the bench's own, so the cases about framing can put anything
// on the wire — a half message, a text message, a ping — that the road itself
// would never write.
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function encode(opcode, payload) {
  const size = payload.length;
  const head = size < 126 ? 2 : size < 65_536 ? 4 : 10;
  const out = Buffer.alloc(head + 4 + size);
  out[0] = 0x80 | opcode;
  if (size < 126) out[1] = size;
  else if (size < 65_536) {
    out[1] = 126;
    out.writeUInt16BE(size, 2);
  } else {
    out[1] = 127;
    out.writeBigUInt64BE(BigInt(size), 2);
  }
  out[1] |= 0x80;
  const key = randomBytes(4);
  key.copy(out, head);
  for (let i = 0; i < size; i += 1) out[head + 4 + i] = payload[i] ^ key[i % 4];
  return out;
}

// Dial the hint as a plain WebSocket client and hand back the raw port: what
// arrived, whether it was dropped, and a way to write any frame at all.
function port(hint) {
  const at = /^wss:\/\/([^/:?]+):(\d+)([^?]*)/.exec(hint);
  const key = randomBytes(16).toString('base64');
  return new Promise((resolve, reject) => {
    const socket = connect({ host: at[1], port: Number(at[2]), ca: CERT }, () => {
      socket.write(
        `GET ${at[3] || '/'} HTTP/1.1\r\nHost: ${at[1]}\r\nUpgrade: websocket\r\n` +
          `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.once('error', reject);
    let gathered = Buffer.alloc(0);
    const said = [];
    let ready = false;
    let closed = false;
    socket.on('close', () => (closed = true));
    socket.on('data', (chunk) => {
      gathered = Buffer.concat([gathered, chunk]);
      if (!ready) {
        const end = gathered.indexOf('\r\n\r\n');
        if (end < 0) return;
        const head = gathered.subarray(0, end).toString('latin1');
        gathered = gathered.subarray(end + 4);
        ready = true;
        assert.match(head, /^HTTP\/1\.1 101/);
        assert.ok(
          head.includes(
            createHash('sha1')
              .update(key + GUID)
              .digest('base64'),
          ),
        );
        resolve({
          socket,
          said,
          get closed() {
            return closed;
          },
          write: (opcode, payload) => socket.write(encode(opcode, payload)),
          // Wait for the peer to drop us and report every byte it said first.
          dropped: () =>
            new Promise((done) => {
              if (closed) return done(Buffer.concat(said));
              socket.on('close', () => done(Buffer.concat(said)));
            }),
        });
      }
      // The server never masks, so reading its frames is the short form.
      while (gathered.length >= 2) {
        let size = gathered[1] & 0x7f;
        let at2 = 2;
        if (size === 126) {
          size = gathered.readUInt16BE(2);
          at2 = 4;
        } else if (size === 127) {
          size = Number(gathered.readBigUInt64BE(2));
          at2 = 10;
        }
        if (gathered.length < at2 + size) return;
        said.push({ opcode: gathered[0] & 0x0f, payload: gathered.subarray(at2, at2 + size) });
        gathered = gathered.subarray(at2 + size);
      }
    });
  });
}

const settle = () => new Promise((done) => setTimeout(done, 60));

test('an ask and its answer ride one wss line, and the road it publishes says so', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, object, being } = world;

  assert.deepEqual(host.hints, [world.door.hint]);
  // A path, because one domain fronts many doors — and the cap, because this
  // warden published no limit and so holds the kit's number rather than the
  // default.
  assert.match(world.door.hint, /^wss:\/\/127\.0\.0\.1:\d+\/\?cap=1048576$/);

  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  assert.deepEqual(invitation.hints, [world.door.hint]);
  const row = guest.remember(invitation);

  const line = await dial(guest, world.door.hint, {
    clock: still,
    random: grain(50),
    tls: TRUST,
  });
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

  // A second ask down the same connection: one WebSocket, many messages.
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

test("a message's bytes are one frame, the tcp form's frame exactly", async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, being } = world;

  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  const row = guest.remember(invitation);
  const envelope = await guest.ask(row, {
    seq: 1n,
    commitment: await commitment(host.name.pk, (await signingPair(fixed(22))).pk),
    being,
    method: { name: 'count', args: new Uint8Array(0) },
    random: RANDOM,
  });

  const raw = await port(world.door.hint);
  raw.write(0x2, Buffer.concat([header(envelope.length), Buffer.from(envelope)]));
  await settle();

  // One message, and its bytes are the length then the envelope — the prefix
  // is kept inside the message, so what rides here is the tcp form's frame to
  // the byte.
  assert.equal(raw.said.length, 1);
  assert.equal(raw.said[0].opcode, 0x2);
  assert.equal(
    hex(raw.said[0].payload.subarray(0, 8)),
    hex(header(raw.said[0].payload.length - 8)),
  );
  // And it is an answer to the ask, read the way any answer is read.
  const answer = await read(guest, host.name.pk, new Uint8Array(raw.said[0].payload.subarray(8)));
  assert.equal(answer.seq, 1n);
  raw.socket.destroy();
});

test('a push rides back down a wss line the far end dialled out', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest } = world;

  const mine = todo();
  const being = await guest.hold(mine, { seed: fixed(60), heirSeed: fixed(61), blueprint: LIST });
  assert.deepEqual(guest.hints, []);

  const invitation = await guest.grant(being, { voiceSeed: fixed(62), heirSeed: fixed(63) });
  assert.deepEqual(invitation.hints, []);
  const row = host.remember(invitation);

  const line = await dial(guest, world.door.hint, {
    clock: still,
    random: grain(50),
    tls: TRUST,
  });
  t.after(() => line.close());
  const voice = await signingPair(fixed(64));
  await line.carry(
    await guest.carry({
      recipient: host.name.pk,
      padlock: host.padlock.pk,
      voicePk: voice.pk,
      voiceSecret: voice.secret,
      seq: 1n,
      allowance: { time: 5_000n, hops: 4n },
      being: null,
      method: null,
      random: RANDOM,
    }),
  );
  await settle();
  assert.equal(world.accepted.length, 1);

  // The listener now asks down the connection it never opened: either end
  // originates, which is the line's shape on either form.
  const answer = await read(
    host,
    guest.name.pk,
    await world.accepted[0].carry(
      await host.ask(row, {
        seq: 1n,
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

test('a refused ask produces no message at all, and the wss line lives on', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, being } = world;

  const raw = await port(world.door.hint);
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
  raw.write(0x2, Buffer.concat([header(refused.length), Buffer.from(refused)]));
  await settle();
  // Silence has no wire form here either: not an empty message, not a close.
  assert.deepEqual(raw.said, []);
  assert.equal(raw.closed, false);

  // Bytes that are no box at all are the same ordinary silence.
  const noise = utf8.encode('not a box at all, but well framed');
  raw.write(0x2, Buffer.concat([header(noise.length), Buffer.from(noise)]));
  await settle();
  assert.deepEqual(raw.said, []);
  assert.equal(raw.closed, false);

  // And a later, legal ask on the same connection still answers.
  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  const row = guest.remember(invitation);
  const legal = await guest.ask(row, {
    seq: 7n,
    commitment: await commitment(host.name.pk, (await signingPair(fixed(23))).pk),
    being,
    method: { name: 'count', args: new Uint8Array(0) },
    random: RANDOM,
  });
  raw.write(0x2, Buffer.concat([header(legal.length), Buffer.from(legal)]));
  await settle();
  assert.equal(raw.said.length, 1);
  raw.socket.destroy();
});

test('a broken frame inside a message drops the connection without a word', async (t) => {
  const world = await grounds();
  t.after(world.close);

  // A negative length, a zero length, and a length over the cap: the same
  // three refusals the tcp form has, unchanged by the message around them.
  for (const claimed of [-1, 0, CAP + 1n]) {
    const raw = await port(world.door.hint);
    const went = raw.dropped();
    raw.write(0x2, Buffer.concat([header(claimed), Buffer.alloc(Number(claimed > 0n ? 0 : 0))]));
    assert.equal((await went).length, 0, `length ${claimed}`);
  }

  // A message that is not exactly one frame — a length claiming more than the
  // message carries — is a peer that cannot frame, and so is one carrying two.
  const short = await port(world.door.hint);
  const wentShort = short.dropped();
  short.write(0x2, Buffer.concat([header(64), Buffer.alloc(10)]));
  assert.equal((await wentShort).length, 0);

  const two = await port(world.door.hint);
  const wentTwo = two.dropped();
  const one = Buffer.concat([header(4), Buffer.alloc(4)]);
  two.write(0x2, Buffer.concat([one, one]));
  assert.equal((await wentTwo).length, 0);

  // The line rides binary messages. A text message is not a frame.
  const text = await port(world.door.hint);
  const wentText = text.dropped();
  text.write(0x1, Buffer.from('hello'));
  assert.equal((await wentText).length, 0);
});

test('a ping is answered below the line and the line never sees it', async (t) => {
  const world = await grounds();
  t.after(world.close);
  const { host, guest, being } = world;

  const raw = await port(world.door.hint);
  raw.write(0x9, Buffer.from('are you there'));
  await settle();
  // A pong, from the road's own plumbing: a control frame carries no meaning
  // and stays in the port.
  assert.equal(raw.said.length, 1);
  assert.equal(raw.said[0].opcode, 0xa);
  assert.equal(raw.said[0].payload.toString(), 'are you there');
  assert.equal(raw.closed, false);

  // And the line above it is untouched: an ask across the same connection,
  // after the ping, answers exactly as it would have before.
  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  const row = guest.remember(invitation);
  const ask = await guest.ask(row, {
    seq: 1n,
    commitment: await commitment(host.name.pk, (await signingPair(fixed(22))).pk),
    being,
    method: { name: 'count', args: new Uint8Array(0) },
    random: RANDOM,
  });
  raw.write(0x2, Buffer.concat([header(ask.length), Buffer.from(ask)]));
  await settle();
  assert.equal(raw.said.length, 2);
  assert.equal(raw.said[1].opcode, 0x2);
  const answer = await read(guest, host.name.pk, new Uint8Array(raw.said[1].payload.subarray(8)));
  assert.equal(answer.seq, 1n);
  raw.socket.destroy();
});

test('a bare wss road promises the default and a road with another cap says so', async (t) => {
  const plain = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
    limit: DEFAULT,
  });
  const door = await listen(plain, { clock: still, random: grain(100), tls: TLS });
  t.after(door.close);
  assert.match(door.hint, /^wss:\/\/127\.0\.0\.1:\d+\/$/);

  // At the default the frame is carried: what comes of it is ordinary silence,
  // which is the proof it was read and the connection lived.
  const at = await port(door.hint);
  at.write(0x2, Buffer.concat([header(DEFAULT), Buffer.alloc(Number(DEFAULT))]));
  await settle();
  assert.deepEqual(at.said, []);
  assert.equal(at.closed, false);
  at.socket.destroy();

  // One byte over, and the peer cannot frame.
  const over = await port(door.hint);
  const went = over.dropped();
  over.write(0x2, Buffer.concat([header(DEFAULT + 1n), Buffer.alloc(Number(DEFAULT) + 1)]));
  assert.equal((await went).length, 0);

  // Another appetite is a number on the road, exactly as on the tcp form.
  const small = await Warden.open({
    nameSeed: fixed(86),
    padlockSeed: fixed(87),
    heirSeed: fixed(88),
  });
  const narrow = await listen(small, {
    clock: still,
    random: grain(100),
    tls: TLS,
    limit: 4_096n,
  });
  t.after(narrow.close);
  assert.match(narrow.hint, /^wss:\/\/127\.0\.0\.1:\d+\/\?cap=4096$/);
  assert.deepEqual(small.hints, [narrow.hint]);
});

test('a dialler stays under the cap the wss road declared', async (t) => {
  const world = await grounds({ limit: 4_096n });
  t.after(world.close);
  const { host, guest, object, being } = world;
  assert.match(world.door.hint, /\?cap=4096$/);

  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  const row = guest.remember(invitation);
  const line = await dial(guest, world.door.hint, {
    clock: still,
    random: grain(50),
    tls: TRUST,
  });
  t.after(() => line.close());

  // Over what the road promised, the sender's own kit says no and no message
  // is written: the alternative is a frame the far end must drop.
  assert.equal(await line.carry(new Uint8Array(5_000)), null);
  assert.equal(line.open, true);

  const next = await signingPair(fixed(22));
  assert.ok(
    await read(
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
    ),
  );
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
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

test('a warden under the default that declares nothing does not offer the wss line', async () => {
  const small = await Warden.open({
    nameSeed: fixed(80),
    padlockSeed: fixed(81),
    heirSeed: fixed(82),
    limit: DEFAULT - 1n,
  });
  await assert.rejects(
    () => listen(small, { clock: still, random: grain(100), tls: TLS }),
    (thrown) => thrown.name === 'UnderTheDefault',
  );
  assert.deepEqual(small.hints, []);
  await assert.rejects(
    () => dial(small, 'wss://127.0.0.1:1', { clock: still, random: grain(50) }),
    (thrown) => thrown.name === 'UnderTheDefault',
  );

  // A dialler publishes nothing at all, so even an explicit small cap has no
  // road to ride: it always promises the default.
  const roomy = await Warden.open({
    nameSeed: fixed(83),
    padlockSeed: fixed(84),
    heirSeed: fixed(85),
  });
  await assert.rejects(
    () => dial(roomy, 'wss://127.0.0.1:1', { clock: still, random: grain(50), limit: 32n }),
    (thrown) => thrown.name === 'UnderTheDefault',
  );
});

test('the platform WebSocket carries the line where a socket cannot be opened', async (t) => {
  // The tab's road: no `node:tls` under it, no options to pass — the platform
  // owns the framing and the pings, and the line above reads the same.
  const world = await grounds();
  t.after(world.close);
  const { host, guest, object, being } = world;
  assert.equal(typeof globalThis.WebSocket, 'function');

  const invitation = await host.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  const row = guest.remember(invitation);
  const line = await dial(guest, world.door.hint, { clock: still, random: grain(50) });
  t.after(() => line.close());

  const answer = await read(
    guest,
    host.name.pk,
    await line.carry(
      await guest.ask(row, {
        seq: 1n,
        commitment: await commitment(host.name.pk, (await signingPair(fixed(22))).pk),
        being,
        method: { name: 'add', args: utf8.encode('bread') },
        random: RANDOM,
      }),
      { warden: host.name.pk, seq: 1n },
    ),
  );
  assert.equal(answer.seq, 1n);
  assert.deepEqual(object.lines, ['bread']);
});

test('`ws://` names nothing, and a hint that is not a wss line is not dialled', async () => {
  const guest = await Warden.open({
    nameSeed: fixed(90),
    padlockSeed: fixed(91),
    heirSeed: fixed(92),
  });
  for (const hint of [
    // In the clear the line is already `tcp://`, so a second cleartext
    // spelling is refused rather than dialled.
    'ws://127.0.0.1:1',
    'ws://127.0.0.1:1/door',
    'wss://127.0.0.1:1?cap=',
    'wss://127.0.0.1:1?cap=big',
    'wss://127.0.0.1:1?cap=16384x',
    'wss://127.0.0.1:1?cap=16384&x=1',
    'wss://127.0.0.1:1?cap=0',
    'wss://127.0.0.1:0',
    'wss://127.0.0.1:0?cap=65536',
    'wss://127.0.0.1:1?limit=16384',
    'http://127.0.0.1:1',
    'tcp://127.0.0.1:1',
  ]) {
    await assert.rejects(
      () => dial(guest, hint, { clock: still, random: grain(50), tls: TRUST }),
      (thrown) => thrown.message === 'NOT_A_LINE',
      hint,
    );
  }

  // A caller offered nothing but `ws://` is offered no road: it is passed by
  // in silence and never posted to.
  assert.equal(await reach(['ws://127.0.0.1:1'], new Uint8Array(4)), null);
});

test('a hint carries its path to the door untouched', async (t) => {
  const warden = await Warden.open({
    nameSeed: fixed(96),
    padlockSeed: fixed(97),
    heirSeed: fixed(98),
  });
  const asked = [];
  const door = await listen(warden, {
    clock: still,
    random: grain(100),
    tls: TLS,
    path: '/quo/Door%20One',
  });
  t.after(door.close);
  door.server.on('upgrade', (request) => asked.push(request.url));
  assert.match(door.hint, /\/quo\/Door%20One\?cap=1048576$/);

  // The path is the operator's affair: dialled exactly as written, never
  // parsed, never normalised, and the cap rides along as the hint spells it.
  const line = await dial(warden, door.hint, { clock: still, random: grain(50), tls: TRUST });
  t.after(() => line.close());
  assert.deepEqual(asked, ['/quo/Door%20One?cap=1048576']);
});
