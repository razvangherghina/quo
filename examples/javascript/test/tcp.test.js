import { test } from "node:test";
import assert from "node:assert/strict";
import * as net from "node:net";
import { listen, frame, reader, ASK, REPLY, NOTHING, MAX_BODY } from "../lib/tcp.js";

test("reader refuses what is not a frame", () => {
  const seen = [];
  const len = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    return b;
  };
  assert.equal(reader(() => {})(len(MAX_BODY + 1)), false);
  assert.equal(reader(() => {})(len(4)), false);
  assert.equal(reader(() => {})(frame(3, 1, Buffer.alloc(0))), false);
  assert.equal(reader(() => {})(frame(ASK, 1, Buffer.alloc(63))), false);
  assert.equal(reader(() => {})(frame(NOTHING, 1, Buffer.alloc(1))), false);
  const f = reader((k, id, rest) => seen.push([k, id, rest.length]));
  const two = Buffer.concat([frame(REPLY, 7, Buffer.alloc(3)), frame(NOTHING, 8, Buffer.alloc(0))]);
  assert.equal(f(two.subarray(0, 5)), true);
  assert.equal(f(two.subarray(5)), true);
  assert.deepEqual(seen, [[REPLY, 7, 3], [NOTHING, 8, 0]]);
});

test("listener: unknown ward is nothing, a reply frame is ignored, garbage closes", async () => {
  const server = await listen(() => null);
  const { port } = server.address();
  const sock = net.connect({ host: "127.0.0.1", port });
  const got = [];
  let first;
  const answered = new Promise((res) => (first = res));
  const closed = new Promise((res) => sock.on("close", res));
  const feed = reader((k, id) => {
    got.push([k, id]);
    first();
  });
  sock.on("data", feed);
  sock.write(frame(REPLY, 1, Buffer.alloc(5)));
  sock.write(frame(ASK, 2, Buffer.alloc(100)));
  // The reply frame is ignored, so the first frame back answers ask 2.
  await answered;
  assert.deepEqual(got, [[NOTHING, 2]]);
  sock.write(frame(9, 3, Buffer.alloc(0)));
  await closed;
  server.close();
});
