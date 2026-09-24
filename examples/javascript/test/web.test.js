import { test } from "node:test";
import assert from "node:assert/strict";
import { listenPost, askPost, listenLine, LineDialer, wsReader } from "../lib/web.js";
import { readAddress } from "../lib/address.js";

const KNOWN = "ab".repeat(64);
const SILENT = "cd".repeat(64);
// A door that echoes the box reversed, and one that gives nothing.
const lookup = (pk) =>
  pk === KNOWN ? { arrive: (box) => Buffer.from(box).reverse() } : pk === SILENT ? { arrive: () => null } : undefined;
const urlOf = (scheme, s) => `${scheme}://127.0.0.1:${s.address().port}/`;

void test("the post: a reply, nothing, and what is not an ask", async () => {
  const server = await listenPost(lookup);
  const url = urlOf("http", server);
  const at = readAddress(url);
  const box = Buffer.from([1, 2, 3]);
  assert.deepEqual(await askPost(at, KNOWN, box), Buffer.from([3, 2, 1]));
  assert.equal(await askPost(at, SILENT, box), null);
  assert.equal(await askPost(at, "ef".repeat(64), box), null);
  const post = (body) => fetch(url, { method: "POST", body });
  assert.equal((await post(Buffer.concat([Buffer.from(SILENT, "hex"), box]))).status, 204);
  assert.equal((await post(Buffer.concat([Buffer.from("ef".repeat(64), "hex"), box]))).status, 404);
  for (const body of [Buffer.alloc(0), Buffer.alloc(64), Buffer.alloc(1048641)]) {
    const status = await post(body).then((r) => r.status, () => 0);
    assert.ok(![200, 204].includes(status), `${body.length}: ${status}`);
  }
  assert.equal((await fetch(url)).status, 405);
  server.close();
  server.closeAllConnections();
  assert.equal(await askPost(at, KNOWN, box), null);
});

void test("the held line: replies, nothing, and a line that breaks", async () => {
  const server = await listenLine(lookup);
  const url = urlOf("ws", server);
  const at = readAddress(url);
  const dialer = new LineDialer();
  const asks = [1, 2, 3].map((n) => dialer.ask(at, KNOWN, Buffer.from([n, 0])));
  assert.deepEqual(await Promise.all(asks), [1, 2, 3].map((n) => Buffer.from([0, n])));
  assert.equal(await dialer.ask(at, SILENT, Buffer.from([1])), null);
  assert.equal(await dialer.ask(at, "ef".repeat(64), Buffer.from([1])), null);

  // A line with no `quo` is refused.
  const bare = new WebSocket(url);
  assert.equal(await new Promise((r) => bare.addEventListener("close", () => r("closed"))), "closed");

  // A text message breaks the line.
  const ws = new WebSocket(url, "quo");
  await new Promise((r) => ws.addEventListener("open", r));
  assert.equal(ws.protocol, "quo");
  const closed = new Promise((r) => ws.addEventListener("close", (e) => r(e.code)));
  ws.send("not a frame");
  assert.equal(await closed, 1002);

  dialer.close();
  server.close();
  server.closeAllConnections();
});

void test("wsReader reassembles fragments and refuses what RFC 6455 and the carrier refuse", () => {
  const masked = (b0, payload) => {
    const mask = Buffer.from([1, 2, 3, 4]);
    const body = Buffer.from(payload.map((x, i) => x ^ mask[i & 3]));
    return Buffer.concat([Buffer.from([b0, 0x80 | payload.length]), mask, body]);
  };
  const got = [];
  const feed = wsReader((op, p) => got.push([op, [...p]]) > 0, (op) => got.push(["control", op]));
  assert.equal(feed(masked(0x02, [1, 2])), true);
  assert.equal(feed(masked(0x89, [])), true);
  assert.equal(feed(masked(0x00, [3])), true);
  assert.equal(feed(masked(0x80, [4])), true);
  assert.deepEqual(got, [["control", 9], [2, [1, 2, 3, 4]]]);

  const one = (bytes) => wsReader(() => true, () => {})(bytes);
  assert.equal(one(Buffer.from([0x82, 0x01, 0x00])), false, "unmasked");
  assert.equal(one(masked(0xc2, [1])), false, "reserved bit");
  assert.equal(one(masked(0x83, [1])), false, "unknown opcode");
  assert.equal(one(masked(0x80, [1])), false, "continuation with no start");
  const big = Buffer.alloc(10);
  big[0] = 0x82;
  big[1] = 0xff;
  big.writeBigUInt64BE(1048646n, 2);
  assert.equal(one(big), false, "above the largest body");
});
