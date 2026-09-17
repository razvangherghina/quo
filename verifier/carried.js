// The kit as a carrier, over CARRIER-TCP.md and CARRIER-WEB.md, through part
// two of vectors/HARNESS.md. As a listener the verifier dials the kit and
// writes every frame and every post itself. As a dialer the kit dials a
// listener of the verifier's own, by a route or by an invitation's `at`.
// Between two kits the verifier stands in the middle, and over tcp delivers
// each frame as it came, late, twice, out of order, altered or not at all.
import { randomBytes } from "node:crypto";
import { isDeepStrictEqual } from "node:util";

import { tcpAddress, webAddress } from "./address.js";
import { askFrame, delay, Line, MAX_BODY, nothingFrame, rawFrame, replyFrame } from "./frame.js";
import { dial, Hold, SCHEMES } from "./hold.js";
import { aesOpen, edSign, hkdf, takesNoSeal, x25519, x25519Pub, ZERO32 } from "./primitives.js";
import { Abort, AskerRun, Lost, mint, newKey, payloadBytes, sealAsk, Session, SIZE, Stand, Verifier, verifierWard } from "./verify.js";
import { MAX_POST, MIN_POST, post, postAnswer, WsLine } from "./web.js";

/** A window in ms from the environment, or its default. */
const windowOf = (name, fallback) => {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};
/** How long the verifier listens to be sure a kit writes nothing. */
const QUIET_MS = windowOf("QUO_VERIFIER_QUIET_MS", 500);
/** How long a kit has to close a connection after bytes that are not a frame. */
const CLOSE_MS = 5000;
/** How long a delivery is held back to arrive late. */
const LATE_MS = windowOf("QUO_VERIFIER_LATE_MS", 1000);
/** How long the verifier waits for a frame it is owed. */
const FRAME_MS = 60000;

const J = JSON.stringify;
const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => Buffer.from(s, "hex");
const rand = (n) => randomBytes(n);
const NOTHING = { nothing: true };
const SILENCE = { silence: true };
/**
 * What a send has already answered, or null. The verifier closes on an ask
 * with no answer at once: a kit that answers without one has answered by
 * the time the bytes it wrote were read, and one that waits reads the close.
 */
const answered = (send) => Promise.race([send, new Promise((res) => setImmediate(() => res(null)))]);
const shownFrame = (f) => (!f ? "no frame" : f.closed ? "the connection closed" : `a ${f.kind} frame`);
const shownPost = (r) => (r.error ? `no response: ${r.error}` : `status ${r.status} with ${r.body.length} bytes`);

const listenRequest = (scheme) => (scheme === "tcp" ? { op: "listen" } : { op: "listen", scheme });
const isAddressOf = (scheme, at) => (scheme === "tcp" ? tcpAddress(at) !== null : webAddress(at)?.scheme === scheme);

/** A zero-head ask to a ward, named `echo`, with its lid's secret kept. */
function zeroAsk(ward, args) {
  const key = newKey();
  const payload = payloadBytes({ to: "null", by: J(key.hex), next: "null", seq: "1" }, { method: "echo", args });
  return sealAsk({ padlock: ward.padlock, head: ZERO32, edge: ZERO32, body: Buffer.concat([payload, edSign(key.seed, payload)]) });
}

/** A `carry` for Session.arrive: each box goes in an ask frame on the line. */
const carryLine = (s, line) => async (ward, box) => {
  const id = line.nextId++;
  line.send(askFrame(id, unhex(ward.pk), box));
  const f = await line.answer(id, FRAME_MS);
  // A door may give nothing, and then no frame comes back: that is nothing, never a failure.
  if (!f) return { reply: null };
  if (f.closed) return { carrier: `the kit closed the connection with ask ${id} in flight` };
  s.v.frames++;
  return { reply: f.kind === "nothing" ? null : hex(f.box) };
};

/** A `carry` for Session.arrive: each box goes in a post of its own. */
const carryPost = (s, at, headers) => async (ward, box) => {
  const r = postAnswer(await post(at, Buffer.concat([unhex(ward.pk), box]), { headers, ms: FRAME_MS }));
  if (r.closed) return { carrier: `the post came back with no response: ${r.why}` };
  if (r.odd) return { carrier: `a post to a ward the kit stands came back as ${r.odd}, where status 200 carries a reply's box` };
  s.v.frames++;
  return { reply: r.kind === "reply" ? hex(r.box) : null };
};

/** Asks for a listener of `scheme`; its address, or null when the kit stands none. */
async function listenOn(s, scheme) {
  const a = await s.stand.request(listenRequest(scheme));
  if (a.error === "bad request") {
    s.v.roles.set(`${scheme} listener`, false);
    s.check(`listen ${scheme} answers bad request: the kit is judged with no ${scheme} listener`, true, "");
    return null;
  }
  const form = scheme === "tcp" ? "tcp://host:port" : `${scheme}://host/path, a URI with a host`;
  if (!s.check(`listen ${scheme} answers an address, ${form}`, isAddressOf(scheme, a.at), J(a), "harness")) return null;
  const again = await s.stand.request({ op: "listen", scheme });
  s.check(`a second listen ${scheme} answers the same address`, again.at === a.at, J(again), "harness");
  s.v.roles.set(`${scheme} listener`, true);
  return a.at;
}

/** Judges a zero-head echo that came back some way other than `arrive`. */
const zeroJudgeOf = (s, z) => (label, args, reply, lidSecret) => {
  const [want, predicate] = s.wantFor("echo", { method: "echo", args });
  return s.judge(s.open(z, reply, lidSecret), want, label, predicate);
};

/** A zero-head echo, carried as `s.carry` carries it, and judged as at arrive. */
const overOf = (s, z) => async (label, args) => {
  const q = zeroAsk(z, args);
  const [want, predicate] = s.wantFor("echo", { method: "echo", args });
  s.judge(await s.arrive(z, q.box, q.lidSecret), want, label, predicate);
};

/** A whole relation over whatever `s.carry` is: a knock and the asks after it. */
async function wholeRelation(s, scheme) {
  const p = `carried ${scheme}`;
  const w = await s.ward(`${p}, the door`);
  const h = await s.invite(w, `over ${scheme}`);
  await s.bind(h);
  const o = { next: null, method: "echo" };
  await s.ask(h, { ...o, signer: "H", under: "F", seq: 2, args: '{"carried":true}' }, "answer", `${p}: an ask on a relation is answered with a reply, judged as at arrive`);
  await s.ask(h, { ...o, signer: "H", under: "O", seq: 2, args: "{}" }, "repeated", `${p}: a number honoured comes back as repeated`);
  await s.ask(h, { ...o, knock: true, signer: "heir", next: newKey(), seq: 3, args: "{}" }, "stranger", `${p}: a knock on a spent heir is a stranger's`);
  await s.ask(h, { ...o, signer: newKey(), under: "O", seq: 4, args: "{}" }, "stranger", `${p}: a key not admitted is a stranger's`);
  await s.ask(h, { ...o, signer: "H", under: "O", seq: 5, args: '{"still":1}' }, "answer", `${p}: the relation still answers`);
}

/** When the invitation carries `at`, whether it names the listener. A count, never a failure. */
async function atNames(s, at, scheme) {
  const w = await s.ward(`carried ${scheme}, the invitation`);
  const h = await s.invite(w, "names its listener?");
  if (h.at === undefined) s.check(`carried ${scheme}: the invitation carries no at`, true, "accepted: KIT-SPEC.md question 25");
  else s.check(`carried ${scheme}: the invitation's at ${Array.isArray(h.at) && h.at.includes(at) ? "names" : "does not name"} the ${scheme} listener`, true, J(h.at).slice(0, 200));
}

// ---------- the kit as a tcp listener ----------

export async function theListener(s) {
  const at = await listenOn(s, "tcp");
  if (!at) return;
  const c = (name, ok, detail) => s.check(name, ok, detail, "carrier");
  const lines = [];
  const open = async (what) => {
    try {
      const l = await Line.dial(at);
      lines.push(l);
      return l;
    } catch (e) {
      c(`${what}: the verifier reaches the listener`, false, e.message);
      throw new Abort(`the listener at ${at} is not reached`);
    }
  };
  await atNames(s, at, "tcp");
  // The ward stands after the listener, which answers for every ward it stands.
  const z = await s.ward("carried tcp, the zero head", "echo");
  const zeroJudge = zeroJudgeOf(s, z);
  const over = overOf(s, z);
  try {
    let line = await open("the first connection");
    // Either side closes at any moment, so an idle connection the kit closes
    // departs from nothing. The rule is that it writes nothing before a frame.
    await line.until(() => (line.bytes > 0 || line.closed ? true : undefined), QUIET_MS);
    c("carried tcp: the kit writes nothing before a frame arrives", line.bytes === 0, `${line.bytes} bytes`);
    if (line.closed) line = await open("a connection after the kit closed an idle one");
    s.carry = carryLine(s, line);

    await over("carried tcp: an ask comes back as a reply frame with its id, judged as at arrive", '{"over":"tcp"}');

    const q = zeroAsk(z, '{"one":"byte at a time"}');
    const id = line.nextId++;
    for (const b of askFrame(id, unhex(z.pk), q.box)) line.write(Buffer.from([b]));
    const byteWise = await line.answer(id, FRAME_MS);
    // A connection that closes with asks in flight answers none of them. Where
    // the listener answers, the answer is judged as at arrive.
    if (byteWise && !byteWise.closed) {
      const reply = byteWise.kind === "nothing" ? null : hex(byteWise.box);
      zeroJudge("carried tcp: an ask frame written one byte at a time, judged as at arrive", '{"one":"byte at a time"}', reply, q.lidSecret);
    } else {
      c("carried tcp: an ask frame written one byte at a time is answered, or the connection closes with it in flight", true, shownFrame(byteWise));
    }
    if (line.closed) {
      line = await open("a connection after the byte-wise ask");
      s.carry = carryLine(s, line);
    }

    await unknownWards(s, line, z, c, "tcp");
    await manyInFlight(s, line, z, c, zeroJudge, "tcp");
    await otherKinds(s, line, c, "tcp");
    await over("carried tcp: the connection answers after a reply frame and a nothing frame", '{"after":"reply and nothing"}');
    await largest(s, z, "carried tcp: an ask frame of the largest body, 1,048,645, carries a box of the size");
    await s.stranger(z, Buffer.alloc(0), null, "carried tcp: an ask frame with a ward pk and no box is a frame");
    s.carry = null;

    await notAFrame(open, z, c);

    s.carry = carryLine(s, await open("a connection for the door"));
    await wholeRelation(s, "tcp");
  } finally {
    s.carry = null;
    for (const l of lines) l.close();
  }
}

async function unknownWards(s, line, z, c, scheme) {
  const q = zeroAsk(z, "{}");
  const padlockOff = unhex(z.pk);
  padlockOff[63] ^= 1;
  for (const [what, pk] of [
    ["a ward pk the kit does not stand", rand(64)],
    ["the ward pk with one padlock bit altered", padlockOff],
  ]) {
    const n = line.nextId++;
    line.send(askFrame(n, pk, q.box));
    const f = await line.answer(n, FRAME_MS);
    c(`carried ${scheme}: an ask to ${what} comes back as a nothing frame with its id`, f?.kind === "nothing", shownFrame(f));
  }
}

async function otherKinds(s, line, c, scheme) {
  const before = line.bytes;
  line.send(Buffer.concat([replyFrame(0x7ffffff0, rand(128)), nothingFrame(0x7ffffff1), replyFrame(line.nextId, Buffer.alloc(0))]));
  const said = await line.until(() => (line.bytes > before || line.closed ? true : undefined), QUIET_MS);
  c(`carried ${scheme}: a reply frame and a nothing frame sent to the listener are answered with nothing`, !said || line.closed, `${line.bytes - before} bytes came back`);
  c(`carried ${scheme}: after a reply frame and a nothing frame, the connection stands`, !line.closed, "the kit closed the connection");
}

/** An ask whose box is the size exactly, garbage behind a lid the verifier holds. */
async function largest(s, z, label) {
  const big = rand(SIZE);
  const secret = rand(32);
  x25519Pub(secret).copy(big);
  await s.stranger(z, big, secret, label);
}

async function manyInFlight(s, line, z, c, zeroJudge, scheme) {
  const N = 24;
  const p = `carried ${scheme}`;
  const ids = new Set();
  while (ids.size < N) ids.add(0x80000000 + (rand(4).readUInt32BE(0) % 0x7fffffff));
  const asks = [...ids].map((id, i) => {
    const args = `{"in flight":${i}}`;
    if (i % 6 === 5) return { id, unknown: true, bytes: askFrame(id, rand(64), zeroAsk(z, args).box) };
    const q = zeroAsk(z, args);
    return { id, args, lidSecret: q.lidSecret, bytes: askFrame(id, unhex(z.pk), q.box) };
  });
  line.send(Buffer.concat(asks.map((q) => q.bytes)));
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
  c(`${p}: ${N} asks in flight on one connection each come back once`, missing === 0 && twice === 0, `${missing} never came back, ${twice} came back more than once`);
  const inOrder = asks.every((q, i) => order[i] === q.id);
  s.check(`${p}: ${N} asks in flight come back in any order`, true, inOrder ? "in the order sent" : "in another order");
  for (const [i, q] of asks.entries()) {
    const f = got.get(q.id)?.[0];
    if (!f) continue;
    if (q.unknown) c(`${p}: in flight, ask ${i} to an unknown ward comes back as a nothing frame`, f.kind === "nothing", shownFrame(f));
    else zeroJudge(`${p}: in flight, ask ${i} is judged as at arrive`, q.args, f.kind === "nothing" ? null : hex(f.box), q.lidSecret);
  }
}

async function notAFrame(open, z, c) {
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
    const l = await open(`after ${what}`);
    // An ask before the bad bytes may go unanswered: a connection that closes
    // with asks in flight answers none of them.
    l.write(Buffer.concat([ask(1), bytes, ask(2)]));
    const closed = await l.until(() => (l.closed ? true : undefined), CLOSE_MS);
    c(`carried tcp: after ${what}, the kit closes the connection`, closed === true, `still open after ${CLOSE_MS / 1000}s`);
    c(`carried tcp: after ${what}, nothing more is read`, !l.frames.some((f) => f.id === 2), "the ask after it was answered");
    l.close();
  }
}

// ---------- the kit as a listener of the held line ----------

export async function theLineListener(s) {
  const at = await listenOn(s, "ws");
  if (!at) return;
  const c = (name, ok, detail) => s.check(name, ok, detail, "carrier");
  const lines = [];
  const open = async (what) => {
    try {
      const l = await WsLine.dial(at);
      lines.push(l);
      return l;
    } catch (e) {
      c(`${what}: the verifier opens a held line offering quo, and the listener selects it`, false, e.message);
      throw new Abort(`no held line to ${at}`);
    }
  };
  await atNames(s, at, "ws");
  const z = await s.ward("carried ws, the zero head", "echo");
  const zeroJudge = zeroJudgeOf(s, z);
  const over = overOf(s, z);
  try {
    let line = await open("the first held line");
    c("carried ws: the listener selects the subprotocol quo", line.protocol === "quo", `selected ${J(line.protocol)}`);
    await line.until(() => (line.bytes > 0 || line.closed ? true : undefined), QUIET_MS);
    c("carried ws: the kit sends no message before a frame arrives", line.bytes === 0, `${line.bytes} bytes`);
    if (line.closed) line = await open("a held line after the kit closed an idle one");
    s.carry = carryLine(s, line);

    await over("carried ws: an ask comes back as a reply message with its id, judged as at arrive", '{"over":"ws"}');
    await unknownWards(s, line, z, c, "ws");
    await manyInFlight(s, line, z, c, zeroJudge, "ws");
    await otherKinds(s, line, c, "ws");
    await over("carried ws: the held line answers after a reply frame and a nothing frame", '{"after":"reply and nothing"}');
    await largest(s, z, "carried ws: an ask message of the largest body, 1,048,645, carries a box of the size");
    await s.stranger(z, Buffer.alloc(0), null, "carried ws: an ask message with a ward pk and no box is a frame");
    s.carry = null;

    await notAMessage(open, z, c);
    await withoutQuo(at, z, c);

    s.carry = carryLine(s, await open("a held line for the door"));
    await wholeRelation(s, "ws");
  } finally {
    s.carry = null;
    for (const l of lines) l.close();
  }
}

async function notAMessage(open, z, c) {
  const ask = (id) => askFrame(id, unhex(z.pk), zeroAsk(z, "{}").box);
  const body = (bytes) => (l) => l.sendBody(Buffer.from(bytes));
  const cases = [
    ["a binary message of 1,048,646 bytes", (l) => l.sendBody(Buffer.alloc(MAX_BODY + 1))],
    ["a binary message of four bytes", body([2, 0, 0, 0])],
    ["an empty binary message", body([])],
    ["a kind of three", body([3, 0, 0, 0, 1])],
    ["an ask with sixty-three bytes after its id", (l) => l.sendBody(Buffer.concat([Buffer.from([0, 0, 0, 0, 1]), rand(63)]))],
    ["a nothing with a byte after its id", body([2, 0, 0, 0, 1, 0])],
    ["a text message", (l) => l.sendText("quo")],
  ];
  for (const [what, act] of cases) {
    const l = await open(`after ${what}`);
    l.send(ask(1));
    act(l);
    l.send(ask(2));
    const closed = await l.until(() => (l.closed ? true : undefined), CLOSE_MS);
    c(`carried ws: after ${what}, the kit closes the held line`, closed === true, `still open after ${CLOSE_MS / 1000}s`);
    c(`carried ws: after ${what}, nothing more is read`, !l.frames.some((f) => f.id === 2), "the ask after it was answered");
    l.close();
  }
}

/** A held line that does not offer `quo` carries no frame. */
async function withoutQuo(at, z, c) {
  let bare;
  try {
    bare = await WsLine.dial(at, { protocols: [] });
  } catch {
    c("carried ws: a held line offering no subprotocol carries no frame", true, "the handshake was refused");
    return;
  }
  bare.send(askFrame(1, unhex(z.pk), zeroAsk(z, "{}").box));
  await bare.until(() => (bare.frames.length || bare.bad || bare.closed ? true : undefined), QUIET_MS);
  const came = bare.frames[0];
  c("carried ws: a held line offering no subprotocol carries no frame", !came && !bare.bytes, came ? `a ${came.kind} frame came back` : `${bare.bytes} bytes came back`);
  bare.close();
}

// ---------- the kit as a listener of the post ----------

export async function thePostListener(s) {
  const at = await listenOn(s, "http");
  if (!at) return;
  const c = (name, ok, detail) => s.check(name, ok, detail, "carrier");
  await atNames(s, at, "http");
  const z = await s.ward("carried http, the zero head", "echo");
  const zeroJudge = zeroJudgeOf(s, z);
  const over = overOf(s, z);
  const p = "carried http";
  try {
    s.carry = carryPost(s, at);
    await over(`${p}: an ask comes back as status 200 with a reply's box, judged as at arrive`, '{"over":"http"}');
    for (const type of ["text/plain;charset=utf-8", "application/json"]) {
      s.carry = carryPost(s, at, { "content-type": type });
      await over(`${p}: a post whose Content-Type is ${type} is answered as any other`, `{"type":${J(type)}}`);
    }
    s.carry = carryPost(s, at);

    const q = zeroAsk(z, "{}");
    const padlockOff = unhex(z.pk);
    padlockOff[63] ^= 1;
    for (const [what, pk] of [
      ["a ward pk the kit does not stand", rand(64)],
      ["the ward pk with one padlock bit altered", padlockOff],
    ]) {
      const r = await post(at, Buffer.concat([pk, q.box]), { ms: FRAME_MS });
      c(`${p}: a post to ${what} comes back with a status other than 200`, !r.error && r.status !== 200, shownPost(r));
    }

    await manyPosts(at, z, c, zeroJudge);

    const ask = Buffer.concat([unhex(z.pk), zeroAsk(z, "{}").box]);
    const notAsks = [
      ["a GET", null, { method: "GET" }],
      ["a PUT of a whole ask", ask, { method: "PUT" }],
      ["a POST of no body", Buffer.alloc(0), {}],
      ["a POST of a ward pk and no box, sixty-four bytes", unhex(z.pk), {}],
      ["a POST of 1,048,641 bytes", Buffer.concat([unhex(z.pk), rand(MAX_POST + 1 - 64)]), {}, true],
    ];
    for (const [what, body, o, long] of notAsks) {
      const r = await post(at, body, { ...o, ms: FRAME_MS });
      // A listener may answer a body too long before it is read whole, and the
      // connection then closes under a request still being written.
      const ok = r.error ? long === true : r.status !== 200 && r.status !== 204;
      c(`${p}: ${what} is not an ask, and its status is neither 200 nor 204`, ok, r.error && long ? `${shownPost(r)}, accepted` : shownPost(r));
    }
    s.carry = carryPost(s, at);
    await s.stranger(z, rand(MIN_POST - 64), null, `${p}: a POST of sixty-five bytes, a ward pk and one byte of box, is an ask`);
    await largest(s, z, `${p}: a POST of the largest body, 1,048,640, carries a box of the size`);
    await wholeRelation(s, "http");
  } finally {
    s.carry = null;
  }
}

async function manyPosts(at, z, c, zeroJudge) {
  const N = 24;
  const asks = [...Array(N).keys()].map((i) => {
    const args = `{"in flight":${i}}`;
    const q = zeroAsk(z, args);
    const unknown = i % 6 === 5;
    return { args, unknown, lidSecret: q.lidSecret, body: Buffer.concat([unknown ? rand(64) : unhex(z.pk), q.box]) };
  });
  const got = await Promise.all(asks.map((q) => post(at, q.body, { ms: FRAME_MS }).then(postAnswer)));
  const lost = got.filter((r) => r.closed).length;
  c(`carried http: ${N} posts in flight each come back`, lost === 0, `${lost} came back with no response`);
  for (const [i, q] of asks.entries()) {
    const r = got[i];
    if (r.closed) continue;
    if (q.unknown) c(`carried http: in flight, post ${i} to an unknown ward comes back with a status other than 200`, r.status !== 200, `status ${r.status}`);
    else if (r.odd) c(`carried http: in flight, post ${i} comes back as status 200 with a box, or another status`, false, r.odd);
    else zeroJudge(`carried http: in flight, post ${i} is judged as at arrive`, q.args, r.kind === "nothing" ? null : hex(r.box), q.lidSecret);
  }
}

// ---------- the kit as a dialer ----------

/** The carrier side of AskerRun: `send` in place of `ask`, frames or posts in place of `read`. */
class Dial {
  constructor(s, kit, hold) {
    this.s = s;
    this.kit = kit;
    this.hold = hold;
    this.scheme = hold.scheme;
    this.pending = null;
    this.lines = new Set();
    this.probed = false;
    this.reached = false;
  }

  /** What to throw when the kit answered `send` with no ask reaching the listener, or null to fail it. */
  missed() {
    return null;
  }

  async seal(rel, o, label) {
    const { s } = this;
    const c = (name, ok, detail) => s.check(`${label}: ${name}`, ok, detail, "carrier");
    const send = s.stand.request({ op: "send", ward: this.kit.pk, invitation: rel.inv, ...o });
    const f = await this.hold.nextAsk(FRAME_MS, send);
    if (f?.answered?.error === "bad request") return f.answered;
    if (!f || f.answered) {
      const skip = f && this.missed(f.answered);
      if (skip) throw skip;
      c(`an ask reaches the verifier's ${this.scheme} listener`, false, f ? `send answered ${J(f.answered).slice(0, 160)} before any ask` : `none within ${FRAME_MS / 1000}s`);
      throw new Lost();
    }
    if (f.bad) {
      const name = f.line.post
        ? "the kit's request is a POST of a ward pk and a box to the address"
        : f.first
          ? `the kit's first bytes on a ${this.scheme} connection are an ask frame`
          : `the kit writes only what ${this.scheme === "tcp" ? "CARRIER-TCP.md" : "CARRIER-WEB.md"} names`;
      c(name, false, f.bad);
      await send.catch(() => {});
      throw new Lost();
    }
    if (!this.lines.has(f.line) && !f.line.post) {
      this.lines.add(f.line);
      c("the kit's first frame on a new connection is an ask frame", f.line.firstKind === "ask", `a ${f.line.firstKind} frame came first`);
    }
    this.reached = true;
    s.v.frames++;
    c(`the ask ${f.line.post ? "post" : "frame"} carries the far ward's pk`, f.pk.equals(unhex(rel.inv.ward)), `it carries ${hex(f.pk).slice(0, 24)}...`);
    this.pending = { send, f };
    return { box: hex(f.box) };
  }

  async deliver(_rel, _t, written, r, label) {
    const { f, send } = this.pending;
    this.pending = null;
    if (!this.probed && !f.line.post) {
      this.probed = true;
      const before = f.line.bytes;
      f.line.send(askFrame(0x7fffffff, rand(64), rand(200)));
      const said = await f.line.until(() => (f.line.bytes > before || f.line.closed ? true : undefined), QUIET_MS);
      this.s.check(`carried ${this.scheme}: an ask frame sent to the dialer is answered with nothing, and the connection stands`, !said, f.line.closed ? "the kit closed the connection" : `${f.line.bytes - before} bytes came back`, "carrier");
    }
    if (r.mode === "close") {
      f.line.close();
      return send;
    }
    if (r.mode === "wait") {
      const early = await answered(send);
      if (early) return early;
      f.line.close();
      this.s.check(`${label}: send had not answered when the verifier closed the connection`, true, "accepted", "carrier");
      return send;
    }
    if (r.mode === "status") {
      f.line.respond(r.status, written?.box);
      return send;
    }
    f.line.send(written ? replyFrame(f.id, written.box) : nothingFrame(f.id));
    return send;
  }
}

/** A Dial that accepts a kit that reaches nothing through an invitation's `at`, until it reaches once. */
class AtDial extends Dial {
  missed(a) {
    if (this.reached) return null;
    this.miss = a;
    return new Lost();
  }
}

async function dialer(s, scheme) {
  const p = `carried ${scheme}`;
  const kit = await s.ward(`the ${scheme} dialer`);
  const mine = verifierWard(`the ${scheme} dialer's far ward`);
  const hold = await Hold.listen(scheme);
  const holds = [hold];
  try {
    const r = await s.stand.request({ op: "route", far: mine.pk, at: hold.at });
    if (r.error === "bad request") {
      s.v.roles.set(`${scheme} dialer`, false);
      s.check(`route ${scheme} answers bad request: the kit is judged with no ${scheme} dialer`, true, "");
      return;
    }
    if (!s.check(`route ${scheme} answers the far ward pk`, r.routed === mine.pk, J(r), "harness")) return;
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
    if (scheme === "http") first.push("status 500", "an object with seen", "status 200 with an empty body", "status 201 with a reply's box", "an object with seen");
    if (!(await run.relation(`${p}: a knock met by a reply`, first))) {
      s.v.roles.set(`${scheme} dialer`, false);
      return;
    }
    s.v.roles.set(`${scheme} dialer`, true);
    await run.relation(`${p}: a knock met by nothing`, ["nothing", "an object with seen", "removed", "an object with seen"]);
    await run.relation(`${p}: a knock met by a closed connection`, ["a closed connection", "an object with seen", "a reply that does not open", "an object with seen"]);
    await run.relation(`${p}: a knock met by no answer`, ["no answer at all", "an object with seen null, padded and reordered"]);
    if (scheme === "http") await run.relation(`${p}: a knock met by status 500`, ["status 500", "an object with seen"]);

    const lone = mint(verifierWard(`the ${scheme} dialer's unrouted ward`));
    const a = await s.stand.request({ op: "send", ward: kit.pk, invitation: lone.inv, method: "echo" });
    s.check(`${p}: a send to a ward with no route and no at reads nothing`, isDeepStrictEqual(a.read, NOTHING), J(a).slice(0, 160), "carrier");

    const moved = await Hold.listen(scheme);
    holds.push(moved);
    const r2 = await s.stand.request({ op: "route", far: mine.pk, at: moved.at });
    s.check(`a second route ${scheme} for one far ward answers it`, r2.routed === mine.pk, J(r2), "harness");
    const after = new AskerRun(s, kit, mine, new Dial(s, kit, moved));
    await after.relation(`${p}: after a second route`, ["an object with seen"]);
    s.check(`${p}: after a second route, nothing reaches the first address`, hold.unwaited === 0, `${hold.unwaited} asks reached it`, "carrier");
    s.check(`${p}: the kit as a dialer sends only asks`, hold.odd.length === 0 && moved.odd.length === 0, [...hold.odd, ...moved.odd].slice(0, 3).join(", "), "carrier");
  } finally {
    for (const h of holds) h.close();
  }
}

// Declared, not assigned: verify.js reads these while this module is still loading.
export function theDialer(s) {
  return dialer(s, "tcp");
}
export function thePostDialer(s) {
  return dialer(s, "http");
}
export function theLineDialer(s) {
  return dialer(s, "ws");
}

// ---------- the invitation's at ----------

/**
 * For every scheme the kit dials: an invitation with no route, whose `at`
 * names an address of no carrier and then a listener of the verifier's own;
 * and an invitation whose `at` names one listener while a route names another.
 */
export async function theInvitationAt(s) {
  const kit = await s.ward("the invitation's at");
  const probe = verifierWard("the invitation's at, a probe").pk;
  for (const scheme of SCHEMES) {
    const p = `at ${scheme}`;
    const hold = await Hold.listen(scheme);
    const other = await Hold.listen(scheme);
    try {
      const r = await s.stand.request({ op: "route", far: probe, at: hold.at });
      if (r.error === "bad request") {
        s.check(`${p}: route ${scheme} answers bad request, and no ${scheme} address is tried`, true, "");
        continue;
      }
      // A non-string entry and an address of no carrier are skipped, and a scheme is read in any case.
      const at = [7, "zz://nowhere", hold.at.replace(/^[a-z]+/, (m) => m.toUpperCase())];
      const via = new AtDial(s, kit, hold);
      const run = new AskerRun(s, kit, verifierWard(`the invitation's at, ${scheme}`), via, at);
      await run.relation(`${p}: no route, at ${J(at)}`, ["an object with seen", "nothing", "an object with seen"]);
      if (via.miss) {
        s.check(`${p}: with no route and no ask reaching the address in at, the kit reads nothing`, isDeepStrictEqual(via.miss.read, NOTHING), J(via.miss).slice(0, 160), "carrier");
        s.check(`${p}: the kit did NOT reach the ward through at, which KIT-SPEC.md question 25 leaves to it`, true, "");
        s.v.at.set(scheme, false);
      } else if (via.reached) {
        s.check(`${p}: the kit reached the ward through at, past an address of no carrier`, true, "");
        s.v.at.set(scheme, true);
      }

      const mine = verifierWard(`the invitation's at, ${scheme}, routed`);
      const ro = await s.stand.request({ op: "route", far: mine.pk, at: hold.at });
      if (!s.check(`${p}: route answers the far ward pk`, ro.routed === mine.pk, J(ro), "harness")) continue;
      const routed = new AskerRun(s, kit, mine, new Dial(s, kit, hold), [other.at]);
      await routed.relation(`${p}: a route, and at naming another address`, ["an object with seen", "an object with seen"]);
      s.check(`${p}: with a route, the kit dials the route alone`, other.lines.length === 0 && other.odd.length === 0, `${other.lines.length} connections reached the address in at`, "carrier");
    } finally {
      hold.close();
      other.close();
    }
  }
  const reached = [...s.v.at].filter(([, did]) => did).map(([scheme]) => scheme);
  const missed = [...s.v.at].filter(([, did]) => !did).map(([scheme]) => scheme);
  if (reached.length && missed.length) {
    s.check("at: a kit that reaches a ward through at reaches it over every scheme it dials", false, `reached over ${reached.join(", ")}, not over ${missed.join(", ")}`, "carrier");
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
const object = (args) => ({ object: args, seen: null });

/** One scheme both programs stand: the verifier's proxy, and its line to the first program's listener. */
class Pass {
  constructor(v, sA, sB, wB, { scheme, proxy, up }) {
    Object.assign(this, { v, sA, sB, wB, scheme, proxy, up });
    this.p = `two kits over ${scheme}`;
    this.step = 0;
  }

  c(name, ok, detail, kind = "protocol") {
    return this.sA.check(name, ok, detail, kind);
  }

  /** The second program's ask, caught at the proxy; null when `mayMiss` and it reached nothing and read nothing. */
  async catchSend(label, rel, mayMiss = false) {
    const args = { step: ++this.step };
    const send = this.sB.stand.request({ op: "send", ward: this.wB.pk, invitation: rel.inv, method: "echo", args });
    const f = await this.proxy.nextAsk(FRAME_MS, send);
    if (mayMiss && f?.answered && isDeepStrictEqual(f.answered.read, NOTHING)) return null;
    if (!f || f.answered || f.bad) {
      const why = !f ? `none within ${FRAME_MS / 1000}s` : (f.bad ?? `send answered ${J(f.answered).slice(0, 160)}`);
      this.c(`${label}: the second program's ask reaches the verifier`, false, why, "carrier");
      throw new Abort(`${label}: no ask`);
    }
    this.v.frames++;
    this.c(`${label}: the ask carries the first ward's pk`, f.pk.equals(unhex(rel.heir.ward.pk)), `${hex(f.pk).slice(0, 24)}...`, "carrier");
    const head = openHead(rel.heir.ward, f.box);
    this.v.heads++;
    this.c(`${label}: at the door, the head opens under the first ward's padlock and names the heir`, head?.equals(rel.heir.pk) === true, head ? `the head is ${hex(head)}` : "the head does not open");
    if (rel.fresh) {
      rel.fresh = false;
      this.c(`${label}: at the door, the knock is long enough to carry a ciphertext`, f.box.length >= 1249, `${f.box.length} bytes`);
    }
    return { send, f, args };
  }

  async forward(label, f, box = f.box) {
    const r = await this.up.ask(f.pk, box);
    if (!r || r.closed) {
      this.c(`${label}: the first program answers what the verifier forwards`, false, r?.why ?? shownFrame(r), "carrier");
      throw new Abort(`${label}: the first program did not answer`);
    }
    if (r.odd) this.c(`${label}: the first program answers a forwarded post with status 200 and a box, or another status`, false, r.odd, "carrier");
    this.v.frames++;
    return r;
  }

  pass(f, r) {
    f.line.send(r.kind === "reply" ? replyFrame(f.id, r.box) : nothingFrame(f.id));
  }

  async reads(label, send, wants) {
    const a = await send;
    const ok = wants.some((w) => isDeepStrictEqual(a.read, w));
    const said = ok && wants.length > 1 ? `, of ${wants.length} accepted` : "";
    this.c(`${label}: the second program reads ${ok ? J(a.read) : wants.map((w) => J(w)).join(" or ")}${said}`, ok, `read ${J(a.read ?? a).slice(0, 160)}`);
    return a.read;
  }

  async straight(label, rel) {
    const x = await this.catchSend(label, rel);
    this.pass(x.f, await this.forward(label, x.f));
    return this.reads(label, x.send, [object(x.args)]);
  }

  strangerLen(label, r, what) {
    this.c(`${label}: ${what}`, r.kind === "nothing" || r.box.length === 128, r.kind === "nothing" ? "nothing, accepted" : `a reply of ${r.box.length} bytes`);
  }

  /** A relation whose far ward the second program is routed to the proxy for. */
  async routed(title) {
    const wA = await this.sA.ward(`${this.p}, the door${title ? `, ${title}` : ""}`);
    const ro = await this.sB.stand.request({ op: "route", far: wA.pk, at: this.proxy.at });
    if (!this.sB.check(`${this.p}: the second program takes a route`, ro.routed === wA.pk, J(ro), "harness")) throw new Abort("the second program takes no route");
    const h = await this.sA.invite(wA, "the second program's", "echo");
    return { wA, rel: { inv: invOf(h), heir: h, fresh: true } };
  }

  async plain() {
    const { rel } = await this.routed();
    const knocked = await this.straight(`${this.p}: a knock`, rel);
    if (!knocked?.object) throw new Abort("the knock brought no object back");
    await this.straight(`${this.p}: an ask`, rel);
  }

  async faults() {
    const { p } = this;
    const { wA, rel } = await this.routed();
    const knocked = await this.straight(`${p}: a knock`, rel);
    if (!knocked?.object) throw new Abort("the knock brought no object back");
    await this.straight(`${p}: an ask`, rel);

    let label = `${p}: an ask delivered late`;
    let x = await this.catchSend(label, rel);
    await delay(LATE_MS);
    this.pass(x.f, await this.forward(label, x.f));
    await this.reads(label, x.send, [object(x.args), NOTHING]);

    label = `${p}: an ask delivered twice`;
    x = await this.catchSend(label, rel);
    await this.forward(label, x.f);
    this.pass(x.f, await this.forward(`${label}, the second time`, x.f));
    await this.reads(`${label}, carries a number the door has honoured`, x.send, [{ quo: "repeated" }, NOTHING]);

    label = `${p}: an altered ask`;
    x = await this.catchSend(label, rel);
    const altered = Buffer.from(x.f.box);
    altered[altered.length - 1] ^= 1;
    let r = await this.forward(label, x.f, altered);
    this.strangerLen(label, r, "the door answers a stranger's silence of 128 bytes");
    this.pass(x.f, r);
    await this.reads(`${label}, is a stranger's`, x.send, [SILENCE, NOTHING]);

    label = `${p}: an ask held back`;
    const held = await this.catchSend(label, rel);
    held.f.line.send(nothingFrame(held.f.id));
    await this.reads(`${label}, answered with a nothing frame`, held.send, [NOTHING]);
    await this.straight(`${p}: the ask after the one held back`, rel);
    r = await this.forward(`${p}: the held-back ask, delivered out of order`, held.f);
    this.c(`${p}: the held-back ask, delivered after a later one, is answered`, r.kind === "reply" || r.kind === "nothing", shownFrame(r), "carrier");
    await this.straight(`${p}: an ask after the out-of-order delivery`, rel);

    label = `${p}: an ask never delivered`;
    x = await this.catchSend(label, rel);
    if (!(await answered(x.send))) x.f.line.close();
    await this.reads(`${label}, is nothing`, x.send, [NOTHING]);
    await this.straight(`${p}: the ask after one never delivered`, rel);

    label = `${p}: a reply never delivered`;
    x = await this.catchSend(label, rel);
    await this.forward(label, x.f);
    if (!(await answered(x.send))) x.f.line.close();
    await this.reads(`${label}, is nothing`, x.send, [NOTHING]);
    await this.straight(`${p}: the ask after a reply never delivered`, rel);

    const h2 = await this.sA.invite(wA, "knocked twice", "echo");
    const rel2 = { inv: invOf(h2), heir: h2, fresh: true };
    label = `${p}: a knock delivered twice`;
    x = await this.catchSend(label, rel2);
    await this.forward(label, x.f);
    r = await this.forward(`${label}, the second time`, x.f);
    this.strangerLen(label, r, "the second delivery is on a spent heir, a stranger's silence of 128 bytes");
    this.pass(x.f, r);
    await this.reads(`${label}, the second delivery is on a spent heir`, x.send, [SILENCE, NOTHING]);
  }

  /** No route: the invitation's `at`, written by the verifier, names the proxy. */
  async throughAt() {
    const label = `${this.p}, at`;
    const wA = await this.sA.ward(`${this.p}, the door through at`);
    const h = await this.sA.invite(wA, "reached through at", "echo");
    const rel = { inv: { ...invOf(h), at: [this.proxy.at] }, heir: h, fresh: true };
    const x = await this.catchSend(`${label}: a knock with no route`, rel, true);
    if (!x) {
      this.c(`${label}: the second program did NOT reach the first through at, which KIT-SPEC.md question 25 leaves to it`, true, "");
      this.v.at.set(this.scheme, false);
      return;
    }
    this.pass(x.f, await this.forward(`${label}: a knock with no route`, x.f));
    await this.reads(`${label}: a knock with no route`, x.send, [object(x.args)]);
    await this.straight(`${label}: an ask with no route`, rel);
    this.c(`${label}: the second program reached the first through at`, true, "");
    this.v.at.set(this.scheme, true);
  }
}

async function twoKits(v, sA, sB, keep) {
  const probe = verifierWard("two kits, a probe").pk;
  const pairs = [];
  for (const scheme of SCHEMES) {
    const la = await sA.stand.request(listenRequest(scheme));
    if (la.error === "bad request") {
      sA.check(`the first program answers listen ${scheme} with bad request: no pass over ${scheme}`, true, "", "harness");
      continue;
    }
    if (!sA.check(`the first program listens on ${scheme}`, isAddressOf(scheme, la.at), J(la), "harness")) continue;
    const proxy = await Hold.listen(scheme);
    keep.push(proxy);
    const ro = await sB.stand.request({ op: "route", far: probe, at: proxy.at });
    if (ro.error === "bad request") {
      sB.check(`the second program answers route ${scheme} with bad request: no pass over ${scheme}`, true, "", "harness");
      continue;
    }
    if (!sB.check(`the second program takes a route to ${scheme}`, ro.routed === probe, J(ro), "harness")) continue;
    let up;
    try {
      up = await dial(scheme, la.at);
    } catch (e) {
      sA.check(`the verifier reaches the first program's ${scheme} listener`, false, e.message, "carrier");
      continue;
    }
    keep.push(up);
    pairs.push({ scheme, proxy, up });
  }
  if (!sA.check("the two programs stand a scheme in common", pairs.length > 0, "neither listens where the other dials", "harness")) throw new Abort("no scheme in common");
  const wB = await sB.ward("two kits, the asker");
  for (const pair of pairs) {
    const pass = new Pass(v, sA, sB, wB, pair);
    if (pair.scheme === "tcp") await pass.faults();
    else await pass.plain();
    await pass.throughAt();
  }
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
    const tail = [A, B]
      .map((st) => st.stderr.trim().split("\n").slice(-2).join(" | "))
      .filter(Boolean)
      .join(" || ");
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
