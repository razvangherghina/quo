import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const STAND = fileURLToPath(new URL("../stand", import.meta.url));
const children = [];
after(() => children.forEach((p) => p.kill()));

function program() {
  const p = spawn(STAND, [], { stdio: ["pipe", "pipe", "ignore"] });
  children.push(p);
  const waiting = new Map();
  const lines = [];
  let buf = "";
  let n = 0;
  p.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      lines.push(line);
      const v = JSON.parse(line);
      const w = waiting.get(v.id);
      if (w) {
        waiting.delete(v.id);
        w(v);
      }
    }
  });
  const req = (o) => {
    const id = `r${n++}`;
    return new Promise((res) => {
      waiting.set(id, res);
      p.stdin.write(JSON.stringify({ id, ...o }) + "\n");
    });
  };
  const raw = (s) => p.stdin.write(s);
  const end = () =>
    new Promise((res) => {
      p.on("exit", (code) => res(code));
      p.stdin.end();
    });
  return { req, raw, end, lines };
}

test("part one: errors", async () => {
  const k = program();
  const w = (await k.req({ op: "ward", seed: "a" })).ward;
  assert.match(w, /^[0-9a-f]{128}$/);
  assert.equal((await k.req({ op: "ward", seed: "a" })).error, "ward stood");
  assert.equal((await k.req({ op: "ward", seed: "a", reach: "nope" })).error, "not reached");
  assert.equal((await k.req({ op: "zap" })).error, "no such op");
  assert.equal((await k.req({ op: "ward" })).error, "bad request");
  assert.equal((await k.req({ op: "invite", ward: "0".repeat(128), heir: "h" })).error, "no such ward");
  assert.equal((await k.req({ op: "invite", ward: w, heir: "h", reach: "nope" })).error, "not reached");
  assert.ok((await k.req({ op: "invite", ward: w, heir: "h" })).invitation);
  assert.equal((await k.req({ op: "invite", ward: w, heir: "h" })).error, "name held");
  assert.equal((await k.req({ op: "release", ward: w, heir: "h" })).released, "h");
  assert.equal((await k.req({ op: "release", ward: w, heir: "h" })).released, null);
  assert.equal((await k.req({ op: "arrive", ward: w, box: "ABCD" })).error, "bad request");
  k.raw("\n");
  k.raw("not json\n");
  k.raw('{"op":"ward"}\n');
  assert.equal(await k.end(), 0);
  assert.ok(k.lines.includes('{"id":null,"error":"bad request"}'));
});

test("part one: two programs, door and asker", async () => {
  const door = program();
  const asker = program();
  const w = (await door.req({ op: "ward", seed: "door", reach: "null" })).ward;
  const me = (await asker.req({ op: "ward", seed: "asker" })).ward;
  const { invitation } = await door.req({ op: "invite", ward: w, heir: "h", reach: "marked" });
  const turn = async (method, args) => {
    const { box } = await asker.req({ op: "ask", ward: me, invitation, method, args });
    const { reply } = await door.req({ op: "arrive", ward: w, box });
    return (await asker.req({ op: "read", ward: me, invitation, reply })).read;
  };
  assert.deepEqual(await turn("m", { big: 1e21, s: "x" }), { object: { big: 1e21, s: "x" }, seen: "1" });
  assert.deepEqual(await turn(undefined, undefined), { object: { asks: [] }, seen: "1" });
  assert.deepEqual(await turn("m", undefined), { object: {}, seen: "1" });
  const { box } = await asker.req({ op: "ask", ward: me, invitation, method: "m" });
  assert.deepEqual((await asker.req({ op: "read", ward: me, invitation, reply: null })).read, { nothing: true });
  const { reply } = await door.req({ op: "arrive", ward: w, box: "00" });
  assert.equal(reply.length, 2 * (16 + 112));
  assert.deepEqual((await asker.req({ op: "read", ward: me, invitation, reply })).read, { silence: true });
  void box;
  assert.equal(await door.end(), 0);
  assert.equal(await asker.end(), 0);
});

test("part two: carried over TCP", async () => {
  const door = program();
  const asker = program();
  const w = (await door.req({ op: "ward", seed: "door2" })).ward;
  const me = (await asker.req({ op: "ward", seed: "asker2" })).ward;
  // Minted before any listener, so it carries no `at`.
  const { invitation } = await door.req({ op: "invite", ward: w, heir: "h" });
  const { at } = await door.req({ op: "listen" });
  assert.equal((await door.req({ op: "listen" })).at, at);
  assert.deepEqual((await asker.req({ op: "send", ward: me, invitation, method: "m" })).read, { nothing: true });
  assert.equal((await asker.req({ op: "route", far: w, at })).routed, w);
  // The knock was not delivered, so its same bytes go again, with no args.
  assert.deepEqual((await asker.req({ op: "send", ward: me, invitation, method: "m", args: { z: 1 } })).read, { object: {}, seen: null });
  const sends = [];
  for (let i = 0; i < 5; i++) sends.push(asker.req({ op: "send", ward: me, invitation, method: "m", args: { i } }));
  const reads = (await Promise.all(sends)).map((x) => x.read);
  for (let i = 0; i < 5; i++) assert.deepEqual(reads[i], { object: { i }, seen: null });
  // A route to a program that stands no such ward answers nothing.
  const other = program();
  const o = (await other.req({ op: "ward", seed: "other" })).ward;
  const inv2 = (await other.req({ op: "invite", ward: o, heir: "x" })).invitation;
  await asker.req({ op: "route", far: o, at });
  assert.deepEqual((await asker.req({ op: "send", ward: me, invitation: inv2 })).read, { nothing: true });
  assert.equal(await asker.end(), 0);
  assert.equal(await door.end(), 0);
  assert.equal(await other.end(), 0);
});

test("part two: every scheme, and the invitation's at", async () => {
  const door = program();
  const asker = program();
  const w = (await door.req({ op: "ward", seed: "door3" })).ward;
  const me = (await asker.req({ op: "ward", seed: "asker3" })).ward;
  assert.equal((await door.req({ op: "listen", scheme: "https" })).error, "bad request");
  assert.equal((await door.req({ op: "listen", scheme: 1 })).error, "bad request");
  const plain = (await door.req({ op: "invite", ward: w, heir: "plain" })).invitation;
  assert.equal(plain.at, undefined);
  const tcp = (await door.req({ op: "listen" })).at;
  const http = (await door.req({ op: "listen", scheme: "http" })).at;
  const ws = (await door.req({ op: "listen", scheme: "ws" })).at;
  assert.match(tcp, /^tcp:\/\/127\.0\.0\.1:\d+$/);
  assert.match(http, /^http:\/\/127\.0\.0\.1:\d+\/$/);
  assert.match(ws, /^ws:\/\/127\.0\.0\.1:\d+\/$/);
  assert.equal((await door.req({ op: "listen", scheme: "tcp" })).at, tcp);

  for (const bad of ["127.0.0.1:1", "ftp://h/", "http://u@h/"]) {
    assert.equal((await asker.req({ op: "route", far: w, at: bad })).error, "bad request", bad);
  }

  // Every invitation names the listeners, ws first, and `at` alone reaches the ward.
  const inv = async (heir) => (await door.req({ op: "invite", ward: w, heir })).invitation;
  const all = await inv("all");
  assert.deepEqual(all.at, [ws, http, tcp]);
  const send = (invitation, args) => asker.req({ op: "send", ward: me, invitation, method: "m", args });
  assert.deepEqual((await send(all, { a: 1 })).read, { object: { a: 1 }, seen: null });
  for (const [name, at] of [["tcp", tcp], ["http", http], ["ws", ws]]) {
    const invitation = { ...(await inv(name)), at: ["gopher://h/", "not a uri", at] };
    assert.deepEqual((await send(invitation, { name })).read, { object: { name }, seen: null }, name);
    assert.deepEqual((await send(invitation, { again: name })).read, { object: { again: name }, seen: null }, name);
  }

  // An address that delivers nothing is passed over for the next.
  const dead = (await asker.req({ op: "listen", scheme: "http" })).at;
  const past = { ...(await inv("past")), at: [dead, tcp] };
  assert.deepEqual((await send(past, { p: 1 })).read, { object: { p: 1 }, seen: null });

  // An `at` that is not an array is absent, and a route is dialed alone.
  const lone = { ...(await inv("lone")), at: tcp };
  assert.deepEqual((await send(lone, {})).read, { nothing: true });
  assert.equal((await asker.req({ op: "route", far: w, at: dead })).routed, w);
  assert.deepEqual((await send(all, { b: 2 })).read, { nothing: true });
  assert.equal((await asker.req({ op: "route", far: w, at: ws })).routed, w);
  // The knock on `lone` was not delivered, so its same bytes go again.
  assert.deepEqual((await send(lone, { c: 3 })).read, { object: {}, seen: null });
  assert.deepEqual((await send(lone, { d: 4 })).read, { object: { d: 4 }, seen: null });

  assert.equal(await asker.end(), 0);
  assert.equal(await door.end(), 0);
});
