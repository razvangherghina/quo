// Chapter 6, written from the spec: the three frames, the length in front of
// each, the bound the largest body stands at, what is not a frame, and a
// listener and a dialer on a real loopback socket.

import assert from 'node:assert/strict';
import { connect, createServer } from 'node:net';
import { test } from 'node:test';
import { concat, hex, unhex } from '../src/arithmetic.js';
import { MAX_BODY, askFrame, frameReader, nothingFrame, replyFrame } from '../src/frame.js';
import { MemoryHarbor } from '../src/harbor.js';
import { emptyPartition } from '../src/partition.js';
import { dial, listen } from '../src/tcp.js';
import { Host } from './fixtures/beings.js';
import { splitmix64 } from './fixtures/splitmix64.js';

const PK = 'ab'.repeat(64); // sixty-four raw bytes, the signing pk then the padlock
const BOX = unhex('0102030405');

// One frame off a stream of its own: the body that came whole, or null for
// what is not a frame.
const read = (frame) => {
  const bodies = frameReader()(frame);
  return bodies?.length === 1 ? bodies[0] : null;
};

test('an ask is a length, 00, an id, the ward pk and the box', () => {
  const frame = askFrame(7, PK, BOX);
  // 1 kind byte, 4 id bytes, 64 pk bytes and 5 box bytes is a body of 74.
  assert.equal(hex(frame), `0000004a00${'00000007'}${PK}0102030405`);
  assert.deepEqual({ ...read(frame), box: hex(read(frame).box) }, { kind: 'ask', id: 7, pk: PK, box: '0102030405' });
});

test('a reply is a length, 01, an id and the box', () => {
  const frame = replyFrame(9, BOX);
  assert.equal(hex(frame), `0000000a01${'00000009'}0102030405`);
  assert.equal(hex(read(frame).box), '0102030405');
});

test('a nothing is a length, 02, an id and no rest', () => {
  const frame = nothingFrame(3);
  assert.equal(hex(frame), `0000000502${'00000003'}`);
  assert.deepEqual(read(frame), { kind: 'nothing', id: 3 });
});

test('the length counts the body and nothing else', () => {
  for (const frame of [askFrame(1, PK, BOX), replyFrame(1, BOX), nothingFrame(1)]) {
    const length = new DataView(frame.buffer, frame.byteOffset).getUint32(0);
    assert.equal(length, frame.length - 4);
  }
});

test('the largest body is 1,048,645 bytes and one more is not a frame', () => {
  const box = new Uint8Array(1_048_576);
  const frame = askFrame(1, PK, box);
  assert.equal(frame.length - 4, MAX_BODY);
  assert.equal(read(frame).box.length, 1_048_576);
  const over = askFrame(1, PK, new Uint8Array(1_048_577));
  assert.equal(over.length - 4, MAX_BODY + 1);
  assert.equal(read(over), null);
});

test('what is not a frame: the five, and nothing else', () => {
  const framed = (body) => concat(unhex(Number(body.length).toString(16).padStart(8, '0')), body);
  // a length above 1,048,645 is the test above. a length below five
  assert.equal(read(framed(unhex('00000000'))), null);
  // a kind that is none of the three
  assert.equal(read(framed(unhex('0300000001'))), null);
  // an ask with fewer than sixty-four bytes after its id
  assert.equal(read(framed(concat(unhex('0000000001'), new Uint8Array(63)))), null);
  // a nothing with bytes after its id
  assert.equal(read(framed(unhex('020000000100'))), null);
});

test('the reader takes the frames off a stream and refuses what is not one', () => {
  const take = frameReader();
  const stream = concat(replyFrame(1, BOX), nothingFrame(2));
  assert.deepEqual(take(stream.subarray(0, 6)), []);
  const bodies = take(stream.subarray(6));
  assert.deepEqual(
    bodies.map((b) => [b.kind, b.id]),
    [
      ['reply', 1],
      ['nothing', 2],
    ],
  );
  assert.equal(frameReader()(unhex('00000005030000000100')), null);
});

test('a dialer asks a listener over loopback, and hears nothing for a pk it does not stand', async () => {
  const asked = [];
  const line = await listen({ host: '127.0.0.1', port: 0,
    carry: async (pk, bytes) => {
      asked.push({ pk, bytes: hex(bytes) });
      return pk === PK ? unhex('aabb') : null;
    },
  });
  const dialer = dial({ host: '127.0.0.1', port: line.port });
  const [reply, nothing] = await Promise.all([dialer.carry(PK, BOX), dialer.carry('cd'.repeat(64), BOX)]);
  assert.equal(hex(reply), 'aabb');
  assert.equal(nothing, null);
  assert.equal(asked.length, 2);
  assert.equal(asked[0].bytes, '0102030405');
  await dialer.close();
  await line.close();
});

test('a reply or a nothing at a listener is read, nothing is said to it, and the connection stands', async () => {
  const asked = [];
  const line = await listen({ host: '127.0.0.1', port: 0, carry: async (pk, bytes) => (asked.push(hex(bytes)), unhex('aabb')) });
  const socket = connect({ port: line.port });
  await new Promise((resolve) => socket.once('connect', resolve));
  const heard = [];
  const take = frameReader();
  socket.on('data', (chunk) => heard.push(...take(new Uint8Array(chunk))));
  socket.write(concat(replyFrame(1, BOX), nothingFrame(2), askFrame(3, PK, BOX)));
  while (heard.length === 0) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.deepEqual(asked, ['0102030405'], 'only the ask was carried');
  assert.deepEqual(
    heard.map((b) => [b.kind, b.id]),
    [['reply', 3]],
  );
  socket.destroy();
  await line.close();
});

test('an ask at a dialer is read, answers nothing in flight, and the connection stands', async () => {
  const server = createServer((socket) => {
    const take = frameReader();
    socket.on('data', (chunk) => {
      for (const body of take(new Uint8Array(chunk))) socket.write(concat(askFrame(body.id, PK, BOX), replyFrame(body.id, unhex('ccdd'))));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dialer = dial({ host: '127.0.0.1', port: server.address().port });
  assert.equal(hex(await dialer.carry(PK, BOX)), 'ccdd');
  assert.equal(hex(await dialer.carry(PK, BOX)), 'ccdd', 'the connection stood');
  await dialer.close();
  await new Promise((resolve) => server.close(resolve));
});

test('a listener whose carry throws after taking the bytes sends no frame, never a nothing', async () => {
  const line = await listen({ host: '127.0.0.1', port: 0,
    carry: async (pk) => {
      if (pk === PK) throw new Error('the door threw');
      return unhex('aabb');
    },
  });
  const dialer = dial({ host: '127.0.0.1', port: line.port });
  const thrown = dialer.carry(PK, BOX);
  assert.equal(hex(await dialer.carry('cd'.repeat(64), BOX)), 'aabb', 'the connection stands');
  const unanswered = await Promise.race([thrown, new Promise((resolve) => setTimeout(resolve, 100, 'no frame'))]);
  assert.equal(unanswered, 'no frame');
  await dialer.close();
  await line.close();
});

test('an ask on a connection already gone never leaves, and is nothing at once', async () => {
  const line = await listen({ host: '127.0.0.1', port: 0, carry: async () => unhex('aabb') });
  const dialer = dial({ host: '127.0.0.1', port: line.port });
  assert.equal(hex(await dialer.carry(PK, BOX)), 'aabb');
  await line.close();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(await dialer.carry(PK, BOX), null);
  await dialer.close();
});

// A harbor on this carrier: the wards it stands it reaches itself, and every
// other ward it reaches down the line it dialed.
class Dialing extends MemoryHarbor {
  constructor(ground, dialer) {
    super(ground);
    this.dialer = dialer;
  }

  async carry(pk, bytes) {
    return (await super.carry(pk, bytes)) ?? this.dialer.carry(pk, bytes);
  }
}

test('two wards reach each other over loopback, and a being is asked through the carrier', async () => {
  const random = splitmix64(11n);
  const far = new MemoryHarbor({ classes: { Host }, random });
  const B = await far.boot('B', emptyPartition());
  await B.ask('boot', { key: 'host', class: 'Host' });
  const line = await listen({ host: '127.0.0.1', port: 0, carry: (pk, bytes) => far.carry(pk, bytes) });

  const dialer = dial({ host: '127.0.0.1', port: line.port });
  const near = new Dialing({ classes: { Host }, random }, dialer);
  const A = await near.boot('A', emptyPartition());
  await A.ask('boot', { key: 'alice', class: 'Host' });

  const invitation = await B.ask('invite', { being: 'host', id: 'alice' });
  const knocked = await A.ask('knock', { being: 'alice', id: 'host', invitation, method: 'hello' });
  assert.deepEqual(knocked.answer, { hi: 'alice' });
  assert.equal(knocked.taken, 'host');

  await dialer.close();
  await line.close();
});
