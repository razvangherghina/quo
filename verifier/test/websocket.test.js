import assert from "node:assert/strict";
import { test } from "node:test";

import { acceptKey, closePayload, isClientKey, offered, OP, wsFrame, WsReader } from "../websocket.js";

const client = (max = 1 << 20) => new WsReader({ masked: true, max });
const server = (max = 1 << 20) => new WsReader({ masked: false, max });

test("the accept key is the one RFC 6455 section 1.3 gives", () => {
  assert.equal(acceptKey("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=");
  assert.equal(isClientKey("dGhlIHNhbXBsZSBub25jZQ=="), true);
  for (const no of ["", "abc", "dGhlIHNhbXBsZSBub25jZQ", "dGhlIHNhbXBsZSBub25jZQ==x", null]) assert.equal(isClientKey(no), false, String(no));
});

test("the subprotocols offered are read from a comma list", () => {
  assert.deepEqual(offered("chat, quo ,x"), ["chat", "quo", "x"]);
  assert.deepEqual(offered(undefined), []);
  assert.deepEqual(offered(""), []);
});

test("frames of every length form read back, masked and plain", () => {
  for (const n of [0, 1, 125, 126, 65535, 65536, 200000]) {
    const payload = Buffer.alloc(n, 0xa5);
    const m = client().push(wsFrame(OP.binary, payload, { mask: true }));
    assert.equal(m.length, 1, `masked ${n}`);
    assert.deepEqual([m[0].type, m[0].text, m[0].data.equals(payload)], ["message", false, true]);
    const u = server().push(wsFrame(OP.binary, payload));
    assert.equal(u[0].data.equals(payload), true, `plain ${n}`);
  }
});

test("the RFC 6455 examples read back", () => {
  // Section 5.7: a single-frame unmasked text message, and the masked one.
  assert.deepEqual(server().push(Buffer.from("810548656c6c6f", "hex")), [{ type: "message", text: true, data: Buffer.from("Hello") }]);
  assert.deepEqual(client().push(Buffer.from("818537fa213d7f9f4d5158", "hex")), [{ type: "message", text: true, data: Buffer.from("Hello") }]);
  // A fragmented unmasked text message.
  const r = server();
  assert.deepEqual(r.push(Buffer.from("010348656c", "hex")), []);
  assert.deepEqual(r.push(Buffer.from("80026c6f", "hex")), [{ type: "message", text: true, data: Buffer.from("Hello") }]);
  // A masked ping, then a pong.
  assert.deepEqual(client().push(wsFrame(OP.ping, Buffer.from("Hello"), { mask: true })), [{ type: "ping", data: Buffer.from("Hello") }]);
  assert.deepEqual(client().push(wsFrame(OP.pong, Buffer.alloc(0), { mask: true })), [{ type: "pong" }]);
});

test("the plain frame the verifier writes is the RFC's bytes", () => {
  assert.equal(wsFrame(OP.text, Buffer.from("Hello")).toString("hex"), "810548656c6c6f");
  assert.equal(wsFrame(OP.text, Buffer.from("Hello"), { mask: true, key: Buffer.from("37fa213d", "hex") }).toString("hex"), "818537fa213d7f9f4d5158");
  assert.equal(wsFrame(OP.binary, Buffer.alloc(256)).subarray(0, 4).toString("hex"), "827e0100");
  assert.equal(wsFrame(OP.binary, Buffer.alloc(65536)).subarray(0, 10).toString("hex"), "827f0000000000010000");
});

test("fragments join into one message, with control frames between them", () => {
  const r = client();
  const parts = [
    wsFrame(OP.binary, Buffer.from([1, 2]), { mask: true, fin: false }),
    wsFrame(OP.ping, Buffer.from("p"), { mask: true }),
    wsFrame(OP.cont, Buffer.from([3]), { mask: true, fin: false }),
    wsFrame(OP.cont, Buffer.from([4, 5]), { mask: true }),
  ];
  const got = [];
  for (const b of Buffer.concat(parts)) got.push(...r.push(Buffer.from([b])));
  assert.deepEqual(
    got.map((e) => e.type),
    ["ping", "message"],
  );
  assert.deepEqual([...got[1].data], [1, 2, 3, 4, 5]);
});

test("a close frame gives its code, and nothing after it is read", () => {
  const r = client();
  const got = r.push(Buffer.concat([wsFrame(OP.close, closePayload(1000, "bye"), { mask: true }), wsFrame(OP.binary, Buffer.from([1]), { mask: true })]));
  assert.deepEqual(got, [{ type: "close", code: 1000 }]);
  assert.deepEqual(r.push(wsFrame(OP.binary, Buffer.from([1]), { mask: true })), []);
});

test("a message longer than the reader takes is refused from its header", () => {
  const r = client(10);
  const got = r.push(wsFrame(OP.binary, Buffer.alloc(11), { mask: true }).subarray(0, 6));
  assert.equal(got.length, 1);
  assert.deepEqual([got[0].type, got[0].long], ["error", true]);
  const f = client(10);
  f.push(wsFrame(OP.binary, Buffer.alloc(6), { mask: true, fin: false }));
  assert.equal(f.push(wsFrame(OP.cont, Buffer.alloc(5), { mask: true }))[0].long, true);
  assert.equal(client(10).push(wsFrame(OP.binary, Buffer.alloc(10), { mask: true }))[0].type, "message");
});

test("bytes that break RFC 6455 are refused, and nothing after them is read", () => {
  const cases = [
    ["an unmasked frame from a client", client(), wsFrame(OP.binary, Buffer.from([1]))],
    ["a masked frame from a server", server(), wsFrame(OP.binary, Buffer.from([1]), { mask: true })],
    ["a reserved bit", client(), Buffer.from([0xc2, 0x80, 0, 0, 0, 0])],
    ["an unknown opcode", client(), wsFrame(0x3, Buffer.alloc(0), { mask: true })],
    ["a continuation with nothing begun", client(), wsFrame(OP.cont, Buffer.from([1]), { mask: true })],
    ["a fragmented ping", client(), wsFrame(OP.ping, Buffer.alloc(0), { mask: true, fin: false })],
    ["a ping of 126 bytes", client(), wsFrame(OP.ping, Buffer.alloc(126), { mask: true })],
    ["a length with its top bit set", client(), Buffer.from("82ff8000000000000000", "hex")],
  ];
  for (const [what, r, bytes] of cases) {
    const got = r.push(bytes);
    assert.equal(got.at(-1)?.type, "error", what);
    assert.deepEqual(r.push(wsFrame(OP.binary, Buffer.from([1]), { mask: true })), [], `${what}: nothing after`);
  }
  const r = client();
  r.push(wsFrame(OP.text, Buffer.from("a"), { mask: true, fin: false }));
  assert.equal(r.push(wsFrame(OP.binary, Buffer.from("b"), { mask: true }))[0].type, "error", "a new message inside another");
});

test("a partial header waits for more bytes", () => {
  const r = client();
  const bytes = wsFrame(OP.binary, Buffer.alloc(70000, 1), { mask: true });
  assert.deepEqual(r.push(bytes.subarray(0, 1)), []);
  assert.deepEqual(r.push(bytes.subarray(1, 9)), []);
  assert.deepEqual(r.push(bytes.subarray(9, 100)), []);
  assert.equal(r.push(bytes.subarray(100))[0].data.length, 70000);
});
