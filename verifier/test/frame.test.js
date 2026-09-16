import assert from "node:assert/strict";
import { test } from "node:test";

import { askFrame, FrameReader, MAX_BODY, nothingFrame, parseAt, rawFrame, replyFrame } from "../frame.js";

const pk = Buffer.alloc(64, 7);
const body = (kind, id, rest = Buffer.alloc(0)) => {
  const b = Buffer.alloc(5);
  b[0] = kind;
  b.writeUInt32BE(id, 1);
  return Buffer.concat([b, rest]);
};

test("the three kinds read back", () => {
  const r = new FrameReader();
  const got = r.push(Buffer.concat([askFrame(1, pk, Buffer.from("box")), replyFrame(0xffffffff, Buffer.from("r")), nothingFrame(3)]));
  assert.equal(r.bad, null);
  assert.equal(got.length, 3);
  assert.deepEqual([got[0].kind, got[0].id, got[0].pk, got[0].box.toString()], ["ask", 1, pk, "box"]);
  assert.deepEqual([got[1].kind, got[1].id, got[1].box.toString()], ["reply", 0xffffffff, "r"]);
  assert.deepEqual([got[2].kind, got[2].id, got[2].box], ["nothing", 3, undefined]);
});

test("a frame split into single bytes reads as one", () => {
  const r = new FrameReader();
  const bytes = askFrame(9, pk, Buffer.alloc(300, 1));
  const got = [];
  for (const b of bytes) got.push(...r.push(Buffer.from([b])));
  assert.equal(got.length, 1);
  assert.equal(got[0].box.length, 300);
});

test("an ask with an empty box, a reply with an empty box, and the largest body are frames", () => {
  const r = new FrameReader();
  assert.equal(r.push(askFrame(1, pk, Buffer.alloc(0)))[0].box.length, 0);
  assert.equal(r.push(replyFrame(2, Buffer.alloc(0)))[0].box.length, 0);
  const big = askFrame(3, pk, Buffer.alloc(1048576));
  assert.equal(big.readUInt32BE(0), MAX_BODY);
  assert.equal(r.push(big)[0].box.length, 1048576);
  assert.equal(r.push(replyFrame(4, Buffer.alloc(MAX_BODY - 5)))[0].box.length, MAX_BODY - 5);
  assert.equal(r.bad, null);
});

test("what is not a frame is refused from the first bytes that say so", () => {
  const cases = [
    ["a length above the largest body", rawFrame(MAX_BODY + 1)],
    ["the largest length there is", rawFrame(0xffffffff)],
    ["a length of zero", rawFrame(0)],
    ["a length of four", rawFrame(4, Buffer.from([1, 0, 0, 0]))],
    ["a kind of three", rawFrame(5, Buffer.from([3]))],
    ["a kind of 255", rawFrame(5, Buffer.from([255]))],
    ["an ask with sixty-three bytes after its id", rawFrame(68, Buffer.from([0]))],
    ["an ask with nothing after its id", rawFrame(5, Buffer.from([0]))],
    ["a nothing with a byte after its id", rawFrame(6, Buffer.from([2]))],
  ];
  for (const [what, bytes] of cases) {
    const r = new FrameReader();
    assert.deepEqual(r.push(bytes), [], what);
    assert.notEqual(r.bad, null, what);
    assert.deepEqual(r.push(nothingFrame(1)), [], `${what}: nothing after it is read`);
  }
});

test("frames before bytes that are not a frame are read, and nothing after", () => {
  const r = new FrameReader();
  const got = r.push(Buffer.concat([nothingFrame(1), rawFrame(6, body(2, 2, Buffer.from([0]))), nothingFrame(3)]));
  assert.deepEqual(
    got.map((f) => f.id),
    [1],
  );
  assert.match(r.bad, /nothing with 1 bytes/);
});

test("a partial header waits for more bytes", () => {
  const r = new FrameReader();
  assert.deepEqual(r.push(Buffer.from([0, 0])), []);
  assert.equal(r.bad, null);
  assert.deepEqual(r.push(Buffer.from([0, 5])), []);
  assert.equal(r.bad, null);
  assert.equal(r.push(body(2, 8))[0].id, 8);
});

test("an address is host:port", () => {
  assert.deepEqual(parseAt("127.0.0.1:4000"), { host: "127.0.0.1", port: 4000 });
  assert.deepEqual(parseAt("[::1]:80"), { host: "::1", port: 80 });
  assert.deepEqual(parseAt("example.org:65535"), { host: "example.org", port: 65535 });
  for (const no of ["127.0.0.1", ":80", "host:0", "host:65536", "host:x", "::1:80", 5, null]) assert.equal(parseAt(no), null, String(no));
});
