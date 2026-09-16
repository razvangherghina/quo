// The kit as a carrier, over CARRIER-TCP.md, through part two of
// vectors/HARNESS.md. As a listener the verifier dials the kit and writes
// every frame itself. As a dialer the kit dials a listener of the
// verifier's own. Between two kits the verifier stands in the middle, and
// delivers each frame as it came, late, twice, out of order, altered or
// not at all.
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { askFrame, delay, Hold, Line, MAX_BODY, nothingFrame, parseAt, rawFrame, replyFrame } from "./frame.js";
import { aesOpen, edSign, hkdf, takesNoSeal, x25519, x25519Pub, ZERO32 } from "./primitives.js";
import { Abort, AskerRun, Lost, mint, newKey, payloadBytes, sealAsk, Session, SIZE, Stand, Verifier, verifierWard } from "./verify.js";

/** How long the verifier listens to be sure a kit writes nothing. */
const QUIET_MS = 500;
/** How long a kit has to close a connection after bytes that are not a frame. */
const CLOSE_MS = 5000;
/** How long the verifier holds an ask with no answer before it closes the connection. */
const NO_ANSWER_MS = 4000;
/** How long a delivery is held back to arrive late. */
const LATE_MS = 1000;
/** How long the verifier waits for a frame it is owed. */
const FRAME_MS = 60000;

const J = JSON.stringify;
const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => Buffer.from(s, "hex");
const rand = (n) => randomBytes(n);
const NOTHING = { nothing: true };
const SILENCE = { silence: true };
const shownFrame = (f) => (!f ? "no frame" : f.closed ? "the connection closed" : `a ${f.kind} frame`);

/** A zero-head ask to a ward, named `echo`, with its lid's secret kept. */
function zeroAsk(ward, args) {
  const key = newKey();
  const payload = payloadBytes({ to: "null", by: J(key.hex), next: "null", seq: "1" }, { method: "echo", args });
  return sealAsk({ padlock: ward.padlock, head: ZERO32, edge: ZERO32, body: Buffer.concat([payload, edSign(key.seed, payload)]) });
}

/** A `carry` for Session.arrive: each box goes in an ask frame on the line. */
const carryOn = (s, line) => async (ward, box) => {
  const id = line.nextId++;
  line.write(askFrame(id, unhex(ward.pk), box));
  const f = await line.answer(id, FRAME_MS);
  // A door may give nothing, and then no frame comes back: that is nothing, never a failure.
  if (!f) return { reply: null };
  if (f.closed) return { carrier: `the kit closed the connection with ask ${id} in flight` };
  s.v.frames++;
  return { reply: f.kind === "nothing" ? null : hex(f.box) };
};

// ---------- the kit as a listener ----------

export async function theListener(s) {
  const a = await s.stand.request({ op: "listen" });
  if (a.error === "bad request") {
    s.v.listener = false;
    s.check("listen answers bad request: the kit is judged without a listener", true, "");
    return;
  }
  if (!s.check("listen answers host:port", parseAt(a.at) !== null, J(a), "harness")) return;
  s.v.listener = true;
  const again = await s.stand.request({ op: "listen" });
  s.check("a second listen answers the same address", again.at === a.at, J(again), "harness");
  const c = (name, ok, detail) => s.check(name, ok, detail, "carrier");
  const lines = [];
  const dial = async (what) => {
    try {
      const l = await Line.dial(a.at);
      lines.push(l);
      return l;
    } catch (e) {
      c(`${what}: the verifier reaches the listener`, false, e.message);
      throw new Abort(`the listener at ${a.at} is not reached`);
    }
  };
  // The ward stands after the listener, which answers for every ward it stands.
  const z = await s.ward("carried, the zero head", "echo");
  const zeroJudge = (label, args, r, lidSecret) => {
    const [want, predicate] = s.wantFor("echo", { method: "echo", args });
    return s.judge(s.open(z, r, lidSecret), want, label, predicate);
  };
  try {
    const line = await dial("the first connection");
    const greeted = await line.until(() => (line.bytes > 0 || line.closed ? true : undefined), QUIET_MS);
    c("the kit writes nothing before a frame arrives", !greeted, line.closed ? "the kit closed the connection" : `${line.bytes} bytes`);
    s.carry = carryOn(s, line);

    const over = async (label, args) => {
      const q = zeroAsk(z, args);
      const [want, predicate] = s.wantFor("echo", { method: "echo", args });
      s.judge(await s.arrive(z, q.box, q.lidSecret), want, label, predicate);
    };
    await over("carried: an ask comes back as a reply frame with its id, judged as at arrive", '{"over":"tcp"}');

    let q = zeroAsk(z, '{"one":"byte at a time"}');
    const id = line.nextId++;
    for (const b of askFrame(id, unhex(z.pk), q.box)) line.write(Buffer.from([b]));
    const byteWise = await line.answer(id, FRAME_MS);
    if (c("carried: an ask frame written one byte at a time leaves the connection standing", !byteWise?.closed, shownFrame(byteWise))) {
      const reply = !byteWise || byteWise.kind === "nothing" ? null : hex(byteWise.box);
      zeroJudge("carried: an ask frame written one byte at a time, judged as at arrive", '{"one":"byte at a time"}', reply, q.lidSecret);
    }

    q = zeroAsk(z, "{}");
    const padlockOff = unhex(z.pk);
    padlockOff[63] ^= 1;
    for (const [what, pk] of [
      ["a ward pk the kit does not stand", rand(64)],
      ["the ward pk with one padlock bit altered", padlockOff],
    ]) {
      const n = line.nextId++;
      line.write(askFrame(n, pk, q.box));
      const f = await line.answer(n, FRAME_MS);
      c(`carried: an ask to ${what} comes back as a nothing frame with its id`, f?.kind === "nothing", shownFrame(f));
    }

    await manyInFlight(s, line, z, c, zeroJudge);

    const before = line.bytes;
    line.write(Buffer.concat([replyFrame(0x7ffffff0, rand(128)), nothingFrame(0x7ffffff1), replyFrame(line.nextId, Buffer.alloc(0))]));
    const said = await line.until(() => (line.bytes > before || line.closed ? true : undefined), QUIET_MS);
    c("carried: a reply frame and a nothing frame sent to the listener are answered with nothing", !said || line.closed, `${line.bytes - before} bytes came back`);
    c("carried: after a reply frame and a nothing frame, the connection stands", !line.closed, "the kit closed the connection");
    await over("carried: the connection answers after a reply frame and a nothing frame", '{"after":"reply and nothing"}');

    const big = rand(SIZE);
    const secret = rand(32);
    x25519Pub(secret).copy(big);
    await s.stranger(z, big, secret, "carried: an ask frame of the largest body, 1,048,645, carries a box of the size");
    await s.stranger(z, Buffer.alloc(0), null, "carried: an ask frame with a ward pk and no box is a frame");
    s.carry = null;

    await notAFrame(s, dial, z, c);

    const door = await dial("a connection for the door");
    s.carry = carryOn(s, door);
    const w = await s.ward("carried, the door");
    const h = await s.invite(w, "over tcp");
    await s.bind(h);
    const o = { next: null, method: "echo" };
    await s.ask(h, { ...o, signer: "H", under: "F", seq: 2, args: '{"carried":true}' }, "answer", "carried: an ask on a relation comes back as a reply frame, judged as at arrive");
    await s.ask(h, { ...o, signer: "H", under: "O", seq: 2, args: "{}" }, "repeated", "carried: a number honoured comes back as repeated");
    await s.ask(h, { ...o, knock: true, signer: "heir", next: newKey(), seq: 3, args: "{}" }, "stranger", "carried: a knock on a spent heir is a stranger's");
    await s.ask(h, { ...o, signer: newKey(), under: "O", seq: 4, args: "{}" }, "stranger", "carried: a key not admitted is a stranger's");
    await s.ask(h, { ...o, signer: "H", under: "O", seq: 5, args: '{"still":1}' }, "answer", "carried: the relation still answers");
  } finally {
    s.carry = null;
    for (const l of lines) l.close();
  }
}

async function manyInFlight(s, line, z, c, zeroJudge) {
  const N = 24;
  const ids = new Set();
  while (ids.size < N) ids.add(0x80000000 + rand(4).readUInt32BE(0) % 0x7fffffff);
  const asks = [...ids].map((id, i) => {
    const args = `{"in flight":${i}}`;
    if (i % 6 === 5) return { id, unknown: true, bytes: askFrame(id, rand(64), zeroAsk(z, args).box) };
    const q = zeroAsk(z, args);
    return { id, args, lidSecret: q.lidSecret, bytes: askFrame(id, unhex(z.pk), q.box) };
  });
  line.write(Buffer.concat(asks.map((q) => q.bytes)));
  const got = new Map();
  const order = [];
  const collect = () => {
    const keep = [];
    for (const f of line.frames) {
      if (ids.has(f.id) && f.kind !== "ask") {
        if (!got.has(f.id)) {
          got.set(f.id, []);
          order.push(f.id);
        }
        got.get(f.id).push(f);
      } else keep.push(f);
    }
    line.frames = keep;
  };
  await line.until(() => {
    collect();
    return got.size === N || line.closed ? true : undefined;
  }, FRAME_MS);
  await delay(QUIET_MS);
  collect();
  const missing = asks.filter((q) => !got.has(q.id)).length;
  const twice = [...got.values()].filter((fs) => fs.length > 1).length;
  c(`carried: ${N} asks in flight on one connection each come back once`, missing === 0 && twice === 0, `${missing} never came back, ${twice} came back more than once`);
  const inOrder = asks.every((q, i) => order[i] === q.id);
  s.check(`carried: ${N} asks in flight come back in any order`, true, inOrder ? "in the order sent" : "in another order");
  for (const [i, q] of asks.entries()) {
    const f = got.get(q.id)?.[0];
    if (!f) continue;
    if (q.unknown) c(`carried: in flight, ask ${i} to an unknown ward comes back as a nothing frame`, f.kind === "nothing", shownFrame(f));
    else zeroJudge(`carried: in flight, ask ${i} is judged as at arrive`, q.args, f.kind === "nothing" ? null : hex(f.box), q.lidSecret);
  }
}

async function notAFrame(s, dial, z, c) {
  const ask = (id) => askFrame(id, unhex(z.pk), zeroAsk(z, "{}").box);
  const cases = [
    ["a length above 1,048,645", rawFrame(MAX_BODY + 1)],
    ["a length of 4,294,967,295", rawFrame(0xffffffff)],
    ["a length of four", rawFrame(4, Buffer.from([2, 0, 0, 0]))],
    ["a length of zero", rawFrame(0)],
    ["a kind of three", rawFrame(5, Buffer.from([3, 0, 0, 0, 1]))],
    ["an ask with sixty-three bytes after its id", rawFrame(68, Buffer.concat([Buffer.from([0, 0, 0, 0, 1]), rand(63)]))],
    ["a nothing with a byte after its id", rawFrame(6, Buffer.from([2, 0, 0, 0, 1, 0]))],
  ];
  for (const [what, bytes] of cases) {
    const l = await dial(`after ${what}`);
    // An ask before the bad bytes may go unanswered: a connection that closes
    // with asks in flight answers none of them.
    l.write(Buffer.concat([ask(1), bytes, ask(2)]));
    const closed = await l.until(() => (l.closed ? true : undefined), CLOSE_MS);
    c(`carried: after ${what}, the kit closes the connection`, closed === true, `still open after ${CLOSE_MS / 1000}s`);
    c(`carried: after ${what}, nothing more is read`, !l.frames.some((f) => f.id === 2), "the ask after it was answered");
    l.close();
  }
}

// ---------- the kit as a dialer ----------

/** The carrier side of AskerRun: `send` in place of `ask`, frames in place of `read`. */
class Dial {
  constructor(s, kit, hold) {
    this.s = s;
    this.kit = kit;
    this.hold = hold;
    this.pending = null;
    this.lines = new Set();
    this.probed = false;
  }

  async seal(rel, o, label) {
    const { s } = this;
    const c = (name, ok, detail) => s.check(`${label}: ${name}`, ok, detail, "carrier");
    const send = s.stand.request({ op: "send", ward: this.kit.pk, invitation: rel.inv, ...o });
    const f = await this.hold.nextAsk(FRAME_MS, send);
    if (f?.answered?.error === "bad request") return f.answered;
    if (!f || f.answered) {
      c("an ask frame reaches the verifier's listener", false, f ? `send answered ${J(f.answered).slice(0, 160)} before any frame` : `none within ${FRAME_MS / 1000}s`);
      throw new Lost();
    }
    if (f.bad) {
      c(f.first ? "the kit's first bytes on a connection are a frame" : "the kit writes only frames", false, f.bad);
      await send.catch(() => {});
      throw new Lost();
    }
    if (!this.lines.has(f.line)) {
      this.lines.add(f.line);
      c("the kit's first bytes on a new connection are an ask frame", f.line.firstKind === "ask", `a ${f.line.firstKind} frame came first`);
    }
    s.v.frames++;
    c("the ask frame carries the far ward's pk", f.pk.equals(unhex(rel.inv.ward)), `the frame carries ${hex(f.pk).slice(0, 24)}...`);
    this.pending = { send, f };
    return { box: hex(f.box) };
  }

  async deliver(_rel, _t, written, r, label) {
    const { f, send } = this.pending;
    this.pending = null;
    if (!this.probed) {
      this.probed = true;
      const before = f.line.bytes;
      f.line.write(askFrame(0x7fffffff, rand(64), rand(200)));
      const said = await f.line.until(() => (f.line.bytes > before || f.line.closed ? true : undefined), QUIET_MS);
      this.s.check("carried: an ask frame sent to the dialer is answered with nothing, and the connection stands", !said, f.line.closed ? "the kit closed the connection" : `${f.line.bytes - before} bytes came back`, "carrier");
    }
    if (r.mode === "close") {
      f.line.close();
      return send;
    }
    if (r.mode === "wait") {
      const early = await Promise.race([send, delay(NO_ANSWER_MS).then(() => null)]);
      if (early) return early;
      f.line.close();
      this.s.check(`${label}: send had not answered when the verifier closed the connection after ${NO_ANSWER_MS / 1000}s`, true, "accepted", "carrier");
      return send;
    }
    f.line.write(written ? replyFrame(f.id, written.box) : nothingFrame(f.id));
    return send;
  }
}

export async function theDialer(s) {
  const kit = await s.ward("the dialer");
  const mine = verifierWard("the dialer's far ward");
  const hold = await Hold.listen();
  const holds = [hold];
  try {
    const r = await s.stand.request({ op: "route", far: mine.pk, at: hold.at });
    if (r.error === "bad request") {
      s.v.dialer = false;
      s.check("route answers bad request: the kit is judged without a dialer", true, "");
      return;
    }
    if (!s.check("route answers the far ward pk", r.routed === mine.pk, J(r), "harness")) return;
    const run = new AskerRun(s, kit, mine, new Dial(s, kit, hold));
    const first = [
      "an object with seen",
      "nothing",
      "silence",
      "an object with seen null, padded and reordered",
      "a closed connection",
      "no answer at all",
      "the object null",
      "a box above the size",
      "a reply sealed to another lid",
      "a box of exactly the size",
      "repeated",
      "an object with seen",
    ];
    if (!(await run.relation("carried: a knock met by a reply frame", first))) {
      s.v.dialer = false;
      return;
    }
    s.v.dialer = true;
    await run.relation("carried: a knock met by a nothing frame", ["nothing", "an object with seen", "removed", "an object with seen"]);
    await run.relation("carried: a knock met by a closed connection", ["a closed connection", "an object with seen", "a reply that does not open", "an object with seen"]);
    await run.relation("carried: a knock met by no answer", ["no answer at all", "an object with seen null, padded and reordered"]);

    const lone = mint(verifierWard("the dialer's unrouted ward"));
    const a = await s.stand.request({ op: "send", ward: kit.pk, invitation: lone.inv, method: "echo" });
    s.check("carried: a send to a ward with no route reads nothing", isDeepStrictEqual(a.read, NOTHING), J(a).slice(0, 160), "carrier");

    const moved = await Hold.listen();
    holds.push(moved);
    const r2 = await s.stand.request({ op: "route", far: mine.pk, at: moved.at });
    s.check("a second route for one far ward answers it", r2.routed === mine.pk, J(r2), "harness");
    const after = new AskerRun(s, kit, mine, new Dial(s, kit, moved));
    await after.relation("carried: after a second route", ["an object with seen"]);
    s.check("carried: after a second route, nothing reaches the first address", hold.unwaited === 0, `${hold.unwaited} ask frames reached it`, "carrier");
    s.check("carried: the kit as a dialer writes only ask frames", hold.odd.length === 0 && moved.odd.length === 0, [...hold.odd, ...moved.odd].slice(0, 3).join(", "), "carrier");
  } finally {
    for (const h of holds) h.close();
  }
}

// ---------- two kits ----------

/** The head of an ask's box, opened at the door's side with the ward's seed; null when it does not open. */
function openHead(ward, box) {
  if (box.length < 80) return null;
  const lid = box.subarray(0, 32);
  if (takesNoSeal(lid)) return null;
  return aesOpen(hkdf(x25519(ward.scalar, lid), "quo-seal", 44), lid, box.subarray(32, 80));
}

const invOf = (h) => ({ ward: h.ward.pk, heir: h.pkHex, secret: hex(h.secret), lock: hex(h.ek) });

async function twoKits(v, sA, sB, keep) {
  const la = await sA.stand.request({ op: "listen" });
  if (!sA.check("the first program listens", parseAt(la.at) !== null, J(la), "harness")) throw new Abort("the first program holds no listener");
  const wA = await sA.ward("two kits, the door");
  const hA = await sA.invite(wA, "the second program's", "echo");
  const wB = await sB.ward("two kits, the asker");
  const proxy = await Hold.listen();
  keep.push(proxy);
  const ro = await sB.stand.request({ op: "route", far: wA.pk, at: proxy.at });
  if (!sB.check("the second program takes a route", ro.routed === wA.pk, J(ro), "harness")) throw new Abort("the second program takes no route");
  const up = await Line.dial(la.at);
  keep.push(up);
  const c = (name, ok, detail, kind = "protocol") => sA.check(name, ok, detail, kind);
  let step = 0;

  const catchSend = async (label, rel) => {
    const args = { step: ++step };
    const send = sB.stand.request({ op: "send", ward: wB.pk, invitation: rel.inv, method: "echo", args });
    const f = await proxy.nextAsk(FRAME_MS, send);
    if (!f || f.answered || f.bad) {
      const why = !f ? `none within ${FRAME_MS / 1000}s` : f.bad ?? `send answered ${J(f.answered).slice(0, 160)}`;
      c(`${label}: the second program's ask frame reaches the verifier`, false, why, "carrier");
      throw new Abort(`${label}: no ask frame`);
    }
    v.frames++;
    c(`${label}: the frame carries the first ward's pk`, f.pk.equals(unhex(wA.pk)), `${hex(f.pk).slice(0, 24)}...`, "carrier");
    const head = openHead(wA, f.box);
    v.heads++;
    c(`${label}: at the door, the head opens under the first ward's padlock and names the heir`, head?.equals(rel.heir.pk) === true, head ? `the head is ${hex(head)}` : "the head does not open");
    if (rel.fresh) {
      rel.fresh = false;
      c(`${label}: at the door, the knock is long enough to carry a ciphertext`, f.box.length >= 1249, `${f.box.length} bytes`);
    }
    return { send, f, args };
  };
  const forward = async (label, f, box = f.box) => {
    const r = await up.ask(f.pk, box);
    if (!r || r.closed) {
      c(`${label}: the first program answers the forwarded frame with a frame`, false, shownFrame(r), "carrier");
      throw new Abort(`${label}: the first program did not answer`);
    }
    v.frames++;
    return r;
  };
  const pass = (f, r) => f.line.write(r.kind === "reply" ? replyFrame(f.id, r.box) : nothingFrame(f.id));
  const reads = async (label, send, wants) => {
    const a = await send;
    const ok = wants.some((w) => isDeepStrictEqual(a.read, w));
    const said = ok && wants.length > 1 ? `, of ${wants.length} accepted` : "";
    c(`${label}: the second program reads ${ok ? J(a.read) : wants.map((w) => J(w)).join(" or ")}${said}`, ok, `read ${J(a.read ?? a).slice(0, 160)}`);
    return a.read;
  };
  const object = (args) => ({ object: args, seen: null });
  const straight = async (label, rel) => {
    const x = await catchSend(label, rel);
    pass(x.f, await forward(label, x.f));
    return reads(label, x.send, [object(x.args)]);
  };
  const strangerLen = (label, r, what) =>
    c(`${label}: ${what}`, r.kind === "nothing" || r.box.length === 128, r.kind === "nothing" ? "nothing, accepted" : `a reply of ${r.box.length} bytes`);

  const rel = { inv: invOf(hA), heir: hA, fresh: true };
  const knocked = await straight("two kits: a knock", rel);
  if (!knocked?.object) throw new Abort("the knock brought no object back");
  await straight("two kits: an ask", rel);

  let label = "two kits: an ask delivered late";
  let x = await catchSend(label, rel);
  await delay(LATE_MS);
  pass(x.f, await forward(label, x.f));
  await reads(label, x.send, [object(x.args), NOTHING]);

  label = "two kits: an ask delivered twice";
  x = await catchSend(label, rel);
  await forward(label, x.f);
  pass(x.f, await forward(`${label}, the second time`, x.f));
  await reads(`${label}, carries a number the door has honoured`, x.send, [{ quo: "repeated" }, NOTHING]);

  label = "two kits: an altered ask";
  x = await catchSend(label, rel);
  const altered = Buffer.from(x.f.box);
  altered[altered.length - 1] ^= 1;
  let r = await forward(label, x.f, altered);
  strangerLen(label, r, "the door answers a stranger's silence of 128 bytes");
  pass(x.f, r);
  await reads(`${label}, is a stranger's`, x.send, [SILENCE, NOTHING]);

  label = "two kits: an ask held back";
  const held = await catchSend(label, rel);
  held.f.line.write(nothingFrame(held.f.id));
  await reads(`${label}, answered with a nothing frame`, held.send, [NOTHING]);
  await straight("two kits: the ask after the one held back", rel);
  r = await forward("two kits: the held-back ask, delivered out of order", held.f);
  c("two kits: the held-back ask, delivered after a later one, is answered", r.kind === "reply" || r.kind === "nothing", shownFrame(r), "carrier");
  await straight("two kits: an ask after the out-of-order delivery", rel);

  label = "two kits: an ask never delivered";
  x = await catchSend(label, rel);
  if (!(await Promise.race([x.send, delay(NO_ANSWER_MS).then(() => null)]))) x.f.line.close();
  await reads(`${label}, is nothing`, x.send, [NOTHING]);
  await straight("two kits: the ask after one never delivered", rel);

  label = "two kits: a reply never delivered";
  x = await catchSend(label, rel);
  await forward(label, x.f);
  if (!(await Promise.race([x.send, delay(NO_ANSWER_MS).then(() => null)]))) x.f.line.close();
  await reads(`${label}, is nothing`, x.send, [NOTHING]);
  await straight("two kits: the ask after a reply never delivered", rel);

  const h2 = await sA.invite(wA, "knocked twice", "echo");
  const rel2 = { inv: invOf(h2), heir: h2, fresh: true };
  label = "two kits: a knock delivered twice";
  x = await catchSend(label, rel2);
  await forward(label, x.f);
  r = await forward(`${label}, the second time`, x.f);
  strangerLen(label, r, "the second delivery is on a spent heir, a stranger's silence of 128 bytes");
  pass(x.f, r);
  await reads(`${label}, the second delivery is on a spent heir`, x.send, [SILENCE, NOTHING]);
}

/** Runs the two-kit scenario: a ward stands in `first`, and `second` asks it through the verifier. */
export async function verifyTwo({ first, second, cwd = process.cwd(), onRecord }) {
  const v = new Verifier(onRecord);
  v.two = true;
  const A = new Stand(first[0], first.slice(1), cwd);
  const B = new Stand(second[0], second.slice(1), cwd);
  const scenario = "two kits";
  const sA = new Session(v, A, scenario);
  const sB = new Session(v, B, scenario);
  const keep = [];
  try {
    await twoKits(v, sA, sB, keep);
  } catch (e) {
    const tail = [A, B].map((st) => st.stderr.trim().split("\n").slice(-2).join(" | ")).filter(Boolean).join(" || ");
    v.record({ scenario, name: "the scenario runs to its end", ok: false, detail: `${e.message}${tail ? ` (stderr: ${tail.slice(0, 300)})` : ""}`, kind: e instanceof Abort ? "harness" : "protocol" });
  } finally {
    for (const k of keep) k.close();
  }
  for (const [who, st] of [
    ["the first program", A],
    ["the second program", B],
  ]) {
    const exit = await st.close();
    v.record({ scenario, name: `${who} exits 0 when stdin closes`, ok: exit.code === 0, detail: J(exit), kind: "harness" });
    v.record({ scenario, name: `${who} writes nothing else on stdout`, ok: st.stray.length === 0, detail: st.stray.slice(0, 3).join(" | "), kind: "harness" });
  }
  return { results: v.results, counts: v.counts() };
}
