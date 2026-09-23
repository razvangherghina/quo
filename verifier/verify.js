// The verifier. It stands a kit's `stand` program and speaks
// vectors/HARNESS.md to it. It judges the kit as a door, writing every ask
// itself, and as an asker, opening every box the kit seals and writing every
// reply. Where the kit carries bytes, carried.js judges it as a listener and
// a dialer over CARRIER-TCP.md and CARRIER-WEB.md, and as a reader of an
// invitation's `at`. It takes every byte apart under SPEC.md, compares
// against no stored bytes, and reads nothing of what a kit draws.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";

import { carrierWritingOf, parseAddress } from "./address.js";
import { theDialer, theInvitationAt, theLineDialer, theLineListener, theListener, thePostDialer, thePostListener } from "./carried.js";
import { decaps, encaps, isEncapsKey, keyGen } from "./mlkem.js";
import {
  aesOpen,
  aesSeal,
  BASE,
  edPub,
  edScalar,
  edSign,
  edVerify,
  hkdf,
  hramScalar,
  IDENTITY,
  L,
  leBytes,
  pointAdd,
  pointDecode,
  pointEncode,
  pointEq,
  pointMul,
  pointNeg,
  scalarLe,
  sha256,
  takesNoSeal,
  x25519,
  x25519Pub,
  ZERO32,
} from "./primitives.js";
import { parseValue, readPayload, readReply, sameValue, whyNoDescribe } from "./value.js";

const EMPTY_DESCRIBE = parseValue(Buffer.from('{"asks":[]}')).value;
// The `at` HARNESS.md's reach `moved` writes on every object.
const MOVED_AT = ["tcp://127.0.0.1:9"];

/** Why an `at` a door wrote on an object is not an array of addresses, each as its carrier writes it, or null. */
function whyNoAt(v) {
  if (v.type !== "array") return "at is not an array";
  for (const [n, e] of v.items.entries()) {
    if (e.type !== "string" || !parseAddress(e.value)) return `entry ${n} of at is not an address`;
    const why = carrierWritingOf(e.value);
    if (why) return `entry ${n} of at is ${why}`;
  }
  return null;
}

/** The addresses a reader may keep from a reply's `at`: every address a carrier writes, in order. */
function keepable(at) {
  return at.filter((s) => typeof s === "string" && parseAddress(s) && ["tcp", "http", "https", "ws", "wss"].includes(parseAddress(s).scheme) && !carrierWritingOf(s));
}

/** Whether `got` holds some of `from`, in the order `from` gives them. */
function inOrder(got, from) {
  let i = 0;
  for (const g of got) {
    while (i < from.length && from[i] !== g) i++;
    if (i++ >= from.length) return false;
  }
  return true;
}

export const SIZE = 1048576;
const SILENCE = Buffer.from('{"silence":true}');
const MAX_SEQ = 9007199254740991;
const J = JSON.stringify;
const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => Buffer.from(s, "hex");
const isHex = (s, n) => typeof s === "string" && (n === undefined || s.length === n) && s.length % 2 === 0 && /^[0-9a-f]*$/.test(s);
const rand = (n) => randomBytes(n);

export class Abort extends Error {}

// ---------- the channel ----------

export class Stand {
  constructor(command, args, cwd) {
    this.proc = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
    this.waiters = new Map();
    this.nullWaiters = [];
    this.stray = [];
    this.stderr = "";
    this.n = 0;
    this.dead = null;
    this.exited = new Promise((res) => {
      this.proc.on("exit", (code, signal) => {
        this.dead = { code, signal };
        for (const w of [...this.waiters.values(), ...this.nullWaiters]) w.fail(new Error(`stand exited (${code ?? signal})`));
        this.waiters.clear();
        this.nullWaiters = [];
        res(this.dead);
      });
      this.proc.on("error", (e) => {
        this.dead = { code: null, signal: String(e.message) };
        res(this.dead);
      });
    });
    this.proc.stdin.on("error", () => {});
    this.proc.stderr.on("data", (d) => {
      if (this.stderr.length < 20000) this.stderr += d;
    });
    createInterface({ input: this.proc.stdout, crlfDelay: Infinity }).on("line", (line) => this.onLine(line));
  }

  onLine(line) {
    let v;
    try {
      v = JSON.parse(line);
    } catch {
      this.stray.push(line.slice(0, 200));
      return;
    }
    if (!v || typeof v !== "object" || Array.isArray(v) || !("id" in v)) {
      this.stray.push(line.slice(0, 200));
      return;
    }
    if (v.id === null && this.nullWaiters.length) {
      this.nullWaiters.shift().done(v);
      return;
    }
    const w = this.waiters.get(v.id);
    if (w) {
      this.waiters.delete(v.id);
      w.done(v);
    } else this.stray.push(line.slice(0, 200));
  }

  /** Writes one line and waits for the answer carrying `id` (null for an id-less answer). */
  raw(line, id, timeoutMs = 180000) {
    return new Promise((resolve, reject) => {
      if (this.dead) {
        reject(new Error(`stand exited (${this.dead.code ?? this.dead.signal})`));
        return;
      }
      const t = setTimeout(() => {
        if (id === null) this.nullWaiters = this.nullWaiters.filter((x) => x !== w);
        else this.waiters.delete(id);
        reject(new Error(`no answer within ${timeoutMs / 1000}s`));
      }, timeoutMs);
      const w = {
        done: (v) => {
          clearTimeout(t);
          resolve(v);
        },
        fail: (e) => {
          clearTimeout(t);
          reject(e);
        },
      };
      if (id === null) this.nullWaiters.push(w);
      else this.waiters.set(id, w);
      this.proc.stdin.write(line + "\n");
    });
  }

  request(fields) {
    const id = `q${this.n++}`;
    return this.raw(J({ id, ...fields }), id);
  }

  async close() {
    this.proc.stdin.end();
    const t = new Promise((res) => setTimeout(() => res("timeout"), 20000));
    const r = await Promise.race([this.exited, t]);
    if (r === "timeout") {
      this.proc.kill("SIGKILL");
      await this.exited;
      return { code: null, signal: "killed after stdin closed" };
    }
    return r;
  }
}

// ---------- keys and boxes ----------

export function wardKeys(seedText) {
  const seed = sha256(Buffer.from(seedText, "utf8"));
  const signSeed = hkdf(seed, "quo-ward-sign", 32);
  const scalar = hkdf(seed, "quo-ward-seal", 32);
  const signPk = edPub(signSeed);
  const padlock = x25519Pub(scalar);
  return { seedText, signSeed, signPk, scalar, padlock, pk: hex(signPk) + hex(padlock) };
}

export const newKey = (seed = rand(32)) => {
  const pk = edPub(seed);
  return { seed, pk, hex: hex(pk) };
};

export const follow = (edge, agreement) => hkdf(Buffer.concat([edge, agreement]), "quo-edge", 32);

/** Seals an ask's box to a padlock under an edge key; keeps the lid's secret. */
export function sealAsk({ padlock, head, edge, body, ct, lidSecret = rand(32) }) {
  const lid = x25519Pub(lidSecret);
  const agr = x25519(lidSecret, padlock);
  const k1 = hkdf(agr, "quo-seal", 44);
  const k2 = hkdf(Buffer.concat([agr, edge]), "quo-edge-seal", 44);
  const box = Buffer.concat([lid, aesSeal(k1, lid, head), ct ?? Buffer.alloc(0), aesSeal(k2, lid, body)]);
  return { box, lidSecret };
}

export function payloadBytes(base, o) {
  const fields = [
    ["to", base.to],
    ["by", base.by],
    ["next", base.next],
    ["seq", base.seq],
  ];
  if (o.method !== undefined) fields.push(["method", J(o.method)]);
  if (o.args !== undefined) fields.push(["args", o.args]);
  for (const [k, v] of Object.entries(o.set ?? {})) {
    const at = fields.findIndex((f) => f[0] === k);
    if (v === undefined) {
      if (at >= 0) fields.splice(at, 1);
    } else if (at >= 0) fields[at][1] = v;
    else fields.push([k, v]);
  }
  fields.push(...(o.extra ?? []));
  if (o.reverse) fields.reverse();
  const pad = o.pad ?? "";
  const key = (k) => (k.startsWith('"') ? k : J(k));
  const text = `{${pad}${fields.map(([k, v]) => `${key(k)}${pad}:${pad}${v}`).join(`${pad},${pad}`)}${pad}}`;
  return Buffer.from(text, "utf8");
}

export const nest = (depth, inner = "1") => "[".repeat(depth) + inner + "]".repeat(depth);

// ---------- the session: one stand, one fixed stream ----------

export class Session {
  constructor(v, stand, scenario) {
    this.v = v;
    this.stand = stand;
    this.scenario = scenario;
    this.strangerLens = new Set();
  }

  check(name, ok, detail, kind = "protocol") {
    this.v.record({ scenario: this.scenario, name, ok, detail, kind });
    return ok;
  }

  async ward(seedText, reach) {
    const k = wardKeys(seedText);
    const req = { op: "ward", seed: seedText };
    if (reach !== undefined) req.reach = reach;
    const a = await this.stand.request(req);
    if (!this.check(`ward ${J(seedText)}${reach ? ` reach ${reach}` : ""} stands`, typeof a.ward === "string", J(a), "harness")) {
      throw new Abort(`ward refused: ${J(a)}`);
    }
    this.check(`ward pk of seed ${J(seedText)} is derived from the seed`, a.ward === k.pk, `got ${a.ward}`);
    return { ...k, lock: null, reach };
  }

  async invite(ward, name, reach) {
    // The scenarios name echo; null sends no reach, which HARNESS.md makes echo.
    reach = reach === undefined ? "echo" : reach;
    const req = { op: "invite", ward: ward.pk, heir: name };
    if (reach !== null) req.reach = reach;
    const a = await this.stand.request(req);
    const inv = a.invitation;
    const label = `invitation ${J(name)}`;
    if (!this.check(`${label} is given`, inv && typeof inv === "object" && !Array.isArray(inv), J(a).slice(0, 300), "harness")) {
      throw new Abort(`invite refused: ${J(a).slice(0, 200)}`);
    }
    const shape =
      inv.ward === ward.pk && isHex(inv.heir, 64) && isHex(inv.secret, 64) && isHex(inv.lock, 2368);
    this.check(`${label} has the four fields of their sizes`, shape, J(inv).slice(0, 300));
    if (!shape) throw new Abort("invitation malformed");
    if (inv.at !== undefined) {
      const addresses = Array.isArray(inv.at) && inv.at.every((s) => parseAddress(s) !== null);
      this.check(`${label} at is an array of addresses`, addresses, J(inv.at).slice(0, 300));
      for (const address of addresses ? inv.at : []) {
        const why = carrierWritingOf(address);
        const scheme = parseAddress(address).scheme;
        if (why !== null || ["tcp", "http", "https", "ws", "wss"].includes(scheme)) {
          this.check(`${label} ${scheme} address ${J(address)} is written as its carrier writes it`, why === null, why);
        }
      }
    }
    const secret = unhex(inv.secret);
    this.check(`${label} heir pk is the Ed25519 pk of its secret`, edPub(secret).equals(unhex(inv.heir)), inv.heir);
    const ek = unhex(inv.lock);
    this.check(`${label} lock is an ML-KEM-768 encapsulation key`, isEncapsKey(ek), "a coefficient is at or above q");
    if (ward.lock) this.check(`${label} carries the ward's one lock`, ward.lock.equals(ek), "the lock differs from the ward's first invitation");
    else ward.lock = ek;
    const heir = {
      name,
      ward,
      at: inv.at,
      reach: reach ?? "echo",
      pk: unhex(inv.heir),
      pkHex: inv.heir,
      secret,
      ek,
      state: "fresh",
      honoured: new Set(),
      highest: 0,
      edges: [],
    };
    // The lock is judged by behaviour: a knock under this ciphertext must be
    // admitted when it binds.
    const { key, ct } = encaps(ek);
    heir.ct = ct;
    heir.E = hkdf(key, "quo-lock", 32);
    return heir;
  }

  async release(ward, name, expect) {
    const a = await this.stand.request({ op: "release", ward: ward.pk, heir: name });
    this.check(`release ${J(name)} answers ${J(expect)}`, "released" in a && a.released === expect, J(a), "harness");
  }

  /**
   * Delivers bytes to a ward and opens what comes back. With `carry` set, the
   * bytes go in an ask frame instead of `arrive`, and `carry` answers as
   * `arrive` would, or `{ carrier }` with why the frames departed.
   */
  async arrive(ward, box, lidSecret) {
    const a = this.carry ? await this.carry(ward, box) : await this.stand.request({ op: "arrive", ward: ward.pk, box: hex(box) });
    if (a.carrier) return { kind: "error", carrier: true, why: a.carrier };
    if ("error" in a || !("reply" in a)) return { kind: "error", why: `harness answered ${J(a).slice(0, 200)}` };
    return this.open(ward, a.reply, lidSecret);
  }

  /** Opens a reply's box, given as hex or null for nothing, under the lid's secret. */
  open(ward, reply, lidSecret) {
    const a = { reply };
    this.v.arrivals++;
    if (a.reply === null) {
      this.v.nothings++;
      return { kind: "nothing" };
    }
    if (!isHex(a.reply)) return { kind: "invalid", why: "reply is not lowercase hex" };
    const rb = unhex(a.reply);
    if (rb.length < 112) return { kind: "invalid", why: `reply box of ${rb.length} bytes is shorter than 112` };
    if (rb.length > SIZE) return { kind: "invalid", why: "reply box above the size" };
    if (!lidSecret) {
      // Sealed to a lid nobody holds, the verifier included. Only a stranger's
      // silence answers such an arrival, and its length is all that shows.
      this.v.unopened++;
      return { kind: "sealed", boxLen: rb.length };
    }
    this.v.judged++;
    const replyEph = rb.subarray(0, 32);
    // The reply's ephemeral key is judged only by the reply opening under the lid.
    const agr = x25519(lidSecret, replyEph);
    if (agr.equals(ZERO32)) return { kind: "invalid", why: "reply ephemeral pk takes no seal" };
    const body = aesOpen(hkdf(agr, "quo-seal", 44), replyEph, rb.subarray(32));
    if (!body) return { kind: "invalid", why: "reply does not open under the ask's lid" };
    if (body.length < 64) return { kind: "invalid", why: "reply body shorter than a signature" };
    const text = body.subarray(0, body.length - 64);
    // A reply is signed over the lid it is sealed to, then its reply text.
    if (!edVerify(ward.signPk, Buffer.concat([x25519Pub(lidSecret), text]), body.subarray(body.length - 64))) {
      return { kind: "invalid", why: "reply not signed by the ward's signing key over the lid and the reply text" };
    }
    if (rb.length !== text.length + 112) return { kind: "invalid", why: "reply box is not its text plus 112" };
    const rr = readReply(text);
    if (rr.error) return { kind: "invalid", why: `reply text: ${rr.error}: ${text.toString("utf8").slice(0, 120)}` };
    if (rr.shape === "silence" && !text.equals(SILENCE)) {
      return { kind: "invalid", why: `silence written as ${J(text.toString("utf8"))}, not the sixteen bytes` };
    }
    const noAt = rr.at && whyNoAt(rr.at);
    if (noAt) return { kind: "invalid", why: `reply text: ${noAt}: ${text.toString("utf8").slice(0, 120)}` };
    return { ...rr, kind: rr.shape, agr, text, boxLen: rb.length };
  }

  /** Delivers raw bytes that should meet a stranger's silence. */
  async stranger(ward, box, lidSecret, label) {
    const r = await this.arrive(ward, box, lidSecret);
    return this.judge(r, "stranger", label);
  }

  judge(r, want, label, predicate) {
    const shown = r.kind === "word" ? `quo ${r.word}` : r.kind;
    if (r.kind === "nothing" || r.kind === "error" || r.kind === "invalid") {
      const kind = r.kind !== "error" ? "protocol" : r.carrier ? "carrier" : "harness";
      this.check(label, r.kind === "nothing", r.kind === "nothing" ? "nothing, accepted" : r.why, kind);
      return r;
    }
    if (r.kind === "sealed") {
      this.strangerLens.add(r.boxLen);
      const ok = want === "stranger" && r.boxLen === 128;
      this.check(label, ok, ok ? "" : `a reply of ${r.boxLen} bytes to a lid nobody holds, wanted a stranger's silence of 128`);
      return r;
    }
    let ok;
    let detail = shown;
    // An answer the door chose, of the wrong content, departs from the reach
    // HARNESS.md names and from nothing in SPEC.md.
    let kind = "protocol";
    switch (want) {
      case "stranger":
        ok = r.kind === "silence";
        if (ok) this.strangerLens.add(r.boxLen);
        break;
      case "silence":
        ok = r.kind === "silence";
        if (r.kind === "object") kind = "harness";
        break;
      case "object":
        ok = r.kind === "object";
        if (ok && predicate) {
          const why = predicate(r);
          if (why) [ok, detail, kind] = [false, why, "harness"];
        }
        break;
      case "below":
        ok = r.kind === "object" || r.kind === "silence" || (r.kind === "word" && r.word === "repeated");
        break;
      case "chosen":
        // What a door answers to a JSON text it does not read is its choice
        // (KIT-SPEC.md question 27): the reach's object, or silence.
        ok = r.kind === "silence" || r.kind === "object";
        if (r.kind === "object" && predicate) {
          const why = predicate(r);
          if (why) [ok, detail, kind] = [false, why, "harness"];
        }
        break;
      case "removed":
        ok = (r.kind === "word" && r.word === "removed") || r.kind === "silence";
        break;
      default:
        ok = r.kind === "word" && r.word === want;
    }
    if (!ok && detail === shown) detail = `wanted ${want}, got ${shown}${r.kind === "object" ? ` ${r.text.toString("utf8").slice(0, 120)}` : ""}`;
    this.check(label, ok, detail, kind);
    return r;
  }

  resolve(heir, who) {
    if (who === "H") return heir.H;
    if (who === "V") return heir.V;
    if (who === "heir") return { seed: heir.secret, pk: heir.pk, hex: heir.pkHex };
    return who;
  }

  /** What the heir's reach answers to an ask, as SPEC.md and HARNESS.md fix it. */
  wantFor(reach, o) {
    const named = o.method !== undefined;
    if (reach === "silent") return ["silence"];
    // The reach `moved` writes MOVED_AT on every object, and every other reach writes no `at`.
    const wantAt = (r) => {
      const got = r.at ? r.at.items.map((e) => e.value) : undefined;
      if (reach === "moved") return isDeepStrictEqual(got, MOVED_AT) ? null : `moved at ${J(got)}, wanted ${J(MOVED_AT)}`;
      return got === undefined ? null : `at ${J(got)}, wanted none`;
    };
    if (reach === "null" && named) return ["object", (r) => (r.object.type === "null" && r.seen === null ? wantAt(r) : `wanted object null seen null, got ${r.text}`)];
    // Every reach but silent answers the empty ask with the describe {"asks":[]}.
    let args = named ? { type: "object", entries: new Map() } : EMPTY_DESCRIBE;
    if (named && o.args !== undefined) {
      args = parseValue(Buffer.from(o.args), { outer: false }).value;
    }
    return [
      "object",
      (r) => {
        if (!sameValue(r.object, args)) return `object is not the args: ${r.text.toString("utf8").slice(0, 160)}`;
        if (reach === "marked") return r.seen === "1" ? wantAt(r) : `marked seen ${J(r.seen)}, wanted "1"`;
        if (r.seen !== null) return `${named ? "named" : "empty"} ask seen ${J(r.seen)}, wanted null`;
        return wantAt(r);
      },
    ];
  }

  /**
   * Builds an ask on an heir (or the zero head), delivers it, judges the reply
   * and follows the door's move. `want` is "answer" for what the reach gives.
   */
  async ask(heir, o, want, label) {
    const ward = o.ward ?? heir.ward;
    const signer = this.resolve(heir, o.signer ?? "H");
    const zero = !!o.zero;
    const edge = o.edge ?? (zero ? ZERO32 : o.knock ? heir.E : o.under === "F" ? heir.F : heir.O);
    let next = "null";
    let announced = null;
    if (o.next && typeof o.next === "object") {
      next = J(o.next.hex);
      announced = o.next;
    } else if (o.next === "heir") next = J(heir.pkHex);
    else if (o.next === "self") next = J(signer.hex);
    if (announced && (announced.hex === heir?.pkHex || announced.hex === signer.hex)) announced = null;
    const seq = o.seq ?? 1;
    const payload =
      o.raw ??
      payloadBytes({ to: zero ? "null" : J(heir.pkHex), by: J(signer.hex), next, seq: String(seq) }, o);
    const sig = o.sig ? o.sig(payload) : edSign(signer.seed, payload);
    if (o.badSig) sig[40] ^= 0x01;
    const body = o.body ?? Buffer.concat([payload, sig]);
    let ct;
    if (o.knock) ct = o.ct ?? heir.ct;
    const head = o.head ?? (zero ? ZERO32 : heir.pk);
    let { box, lidSecret } = sealAsk({ padlock: o.padlock ?? ward.padlock, head, edge, body, ct });
    if (o.mutate) box = o.mutate(box);
    // Sealed and not delivered, for a scenario that delivers two at one moment.
    if (o.sealOnly) return { box, lidSecret, announced, edge, seq };
    let predicate = o.predicate;
    if (want === "answer" || want === "chosen") {
      const [w, p] = this.wantFor(o.reach ?? heir.reach, o);
      [want, predicate] = want === "chosen" ? ["chosen", p] : [w, p];
    }
    const r = this.judge(await this.arrive(ward, box, lidSecret), want, label, predicate);
    if (r.kind === "object") {
      // An object that answers the empty ask is a describe, whatever reach answered.
      const p = readPayload(payload);
      if (!p.error && p.method === undefined) {
        const why = whyNoDescribe(r.object);
        this.check(`${label}: the object that answers the empty ask is a describe`, !why, why ?? "");
      }
    }
    const moves = !zero && ["object", "silence", "chosen"].includes(want) && (r.kind === "object" || r.kind === "silence");
    if (moves) this.move(heir, o, announced, edge, seq, r.agr);
    return r;
  }

  move(heir, o, announced, edge, seq, agr) {
    if (heir.state === "fresh") {
      heir.H = announced;
      heir.V = null;
      heir.O = heir.E;
      heir.F = follow(heir.E, agr);
      heir.state = "spent";
    } else {
      const byH = (o.signer ?? "H") === "H";
      const held = byH ? heir.H : heir.V;
      heir.V = announced ?? (byH ? heir.V : null);
      heir.H = held;
      heir.edges.push(heir.O, heir.F);
      heir.O = edge;
      heir.F = follow(edge, agr);
    }
    heir.honoured.add(seq);
    heir.highest = Math.max(heir.highest, seq);
  }

  /** A knock that binds, announcing a fresh key. */
  async bind(heir, seq = 1, extra = {}) {
    const k = newKey();
    await this.ask(heir, { knock: true, signer: "heir", next: k, seq, method: "echo", args: '{"k":1}', ...extra }, "answer", `knock on ${J(heir.name)} binds`);
    if (heir.state !== "spent") throw new Abort(`knock on ${heir.name} did not bind`);
    return k;
  }

  nextSeq(heir) {
    return heir.highest + 1;
  }

  finish() {
    if (this.strangerLens.size) {
      this.check("every stranger's silence has one length, 128 bytes", this.strangerLens.size === 1 && this.strangerLens.has(128), [...this.strangerLens].join(","));
    }
  }
}

// ---------- the scenarios ----------

async function wardsAndInvitations(s) {
  const seeds = ["alpha", "a".repeat(32), "Ωμέγα, a ward", "0123456789abcdef0123456789abcdef"];
  const wards = [];
  for (const seed of seeds) wards.push(await s.ward(seed));
  const [a, b] = wards;
  const one = await s.invite(a, "one");
  const two = await s.invite(a, "two", "echo");
  await s.invite(b, "first");
  s.check("one ward has one lock across its invitations", one.ek.equals(two.ek), "");
  await s.release(a, "one", "one");
  await s.release(a, "one", null);
  await s.release(a, "never", null);
  const again = await s.invite(a, "one");
  s.check("a released name invited again names a new heir", !again.pk.equals(one.pk), "");
  await s.bind(again);
  await s.ask(again, { signer: "H", under: "O", next: null, seq: 2, method: "echo", args: '{"after":"rebind"}' }, "answer", "the new heir answers its standing");
}

async function theMove(s) {
  const w = await s.ward("the move");
  let rows = 0;
  // Each row of the spent-heir table on an heir of its own: bind with K1, then
  // K1 announces K2, so H = K1 and V = K2 before the row's ask.
  const row = async (label, o, after) => {
    const h = await s.invite(w, `row ${rows++}`);
    const K1 = await s.bind(h, 5);
    const at = (what) => `move: ${label}: ${what}`;
    const ask = (x, want, what) => s.ask(h, { method: "echo", args: `{"row":${J(label)}}`, ...x }, want, at(what));
    await ask({ signer: "H", next: newKey(), under: "F", seq: 6 }, "answer", "K1 announces K2");
    const K2 = h.V;
    const K3 = newKey();
    const r = await ask({ seq: 7, ...o(K3) }, "answer", "the row's ask");
    if (r.kind !== "object") return;
    await after({ ask, h, K1, K2, K3 });
  };
  const stranger = (ask, key, what) => ask({ signer: key, next: null, under: "O", seq: 20 }, "stranger", what);
  const answers = (ask, who, what, seq = 21) => ask({ signer: who, next: null, under: "O", seq }, "answer", what);
  for (const under of ["O", "F"]) {
    await row(`H announces K under ${under}`, (K3) => ({ signer: "H", next: K3, under }), async ({ ask, K2 }) => {
      await stranger(ask, K2, "K2, vouched for before, is forgotten");
      await answers(ask, "V", "K3 is vouched for");
    });
  }
  for (const [how, next] of [
    ["announcing nothing", null],
    ["with next its own by", "self"],
    ["with next the heir", "heir"],
  ]) {
    await row(`H ${how}`, () => ({ signer: "H", next, under: "O" }), async ({ ask }) => {
      await answers(ask, "V", "K2 is still vouched for", 21);
      await answers(ask, "H", "K2 is now held", 22);
    });
    await row(`V ${how}`, () => ({ signer: "V", next, under: "F" }), async ({ ask, K1 }) => {
      await stranger(ask, K1, "K1 is forgotten");
      await answers(ask, "H", "K2 is held");
    });
  }
  await row("V announces K", (K3) => ({ signer: "V", next: K3, under: "O" }), async ({ ask, K1 }) => {
    await stranger(ask, K1, "K1 is forgotten");
    await answers(ask, "V", "K3 is vouched for", 21);
    await answers(ask, "H", "K3 is held after it signed", 22);
  });
  const h = await s.invite(w, "relation");
  const at = (label) => `move: ${label}`;
  const ask = (o, want, label) => s.ask(h, { method: "echo", args: `{"step":${J(label)}}`, ...o }, want, at(label));
  const K1 = await s.bind(h, 5);
  s.check("move: a knock leaves K held and nothing vouched for", h.H === K1 && h.V === null, "model");
  await ask({ signer: "H", next: null, under: "F", seq: 6 }, "answer", "held key, announcing nothing, under the offered key");
  await ask({ signer: "H", next: null, under: "O", seq: 7 }, "answer", "held key under the open key");
  await ask({ signer: "H", next: null, under: "F", seq: 8 }, "answer", "held key under the offered key again");
  const stale = h.edges.find((e) => !e.equals(h.O) && !e.equals(h.F));
  await ask({ signer: "H", next: null, edge: stale, seq: 21 }, "stranger", "an edge key neither open nor offered does not open");
  await ask({ signer: "heir", next: null, under: "O", seq: 22 }, "stranger", "the heir signs nothing after the knock");
  await s.ask(h, { knock: true, signer: "heir", next: K1, seq: 23, method: "echo", args: "{}" }, "stranger", at("a knock again with the binding ciphertext on a spent heir"));
  await s.ask(h, { signer: "H", next: null, under: "O", seq: 24 }, "answer", at("the empty ask answers the describe {\"asks\":[]} with seen null"));
  await ask({ signer: "H", next: null, under: "F", seq: 25, pad: " \t\r\n ", reverse: true }, "answer", "padding and any field order are read");
  await ask({ signer: "H", next: null, under: "O", seq: 26, extra: [["zz", '{"x":[1]}']] }, "answer", "a field beside the six carries no meaning");
  await ask({ signer: "H", next: null, under: "F", seq: 27 }, "answer", "open against offered, after all of it");
}

async function theCount(s) {
  const w = await s.ward("the count");
  const h = await s.invite(w, "h");
  await s.bind(h, 10);
  const ask = (seq, want, label, o = {}) => s.ask(h, { signer: "H", under: "O", next: null, seq, method: "echo", args: `{"seq":${seq}}`, ...o }, want, `count: ${label}`);
  await ask(10, "repeated", "the knock's number is honoured once");
  await ask(20, "answer", "a number above the highest is honoured");
  await ask(15, "below", "a number below the highest, never seen");
  await ask(21, "answer", "a choice below the highest moved no key", { under: "F" });
  await ask(20, "repeated", "a number honoured is not honoured again");
  await ask(20, "stranger", "a repeated number with a bad signature is a stranger's", { badSig: true });
  await ask(20, "stranger", "a repeated number from an unadmitted key is a stranger's", { signer: newKey() });
  await ask(MAX_SEQ, "answer", "2^53 - 1 is a count number");
  await ask(MAX_SEQ, "repeated", "2^53 - 1 is honoured once");
  await ask(MAX_SEQ + 1, "stranger", "2^53 is no count number", { set: { seq: "9007199254740992" } });
  await ask(1, "below", "one, below the highest");
  // A knock carries any count number, and the asks after it continue that count.
  for (const [how, seq] of [
    ["one", 1],
    ["a middle number", 4503599627370496],
    ["2^53 - 2", MAX_SEQ - 1],
    ["2^53 - 1", MAX_SEQ],
  ]) {
    const kh = await s.invite(w, `knock at ${how}`);
    await s.bind(kh, seq);
    await s.ask(kh, { signer: "H", under: "O", next: null, seq, method: "echo", args: "{}" }, "repeated", `count: a knock at ${how} honoured that number`);
    if (seq < MAX_SEQ) {
      await s.ask(kh, { signer: "H", under: "F", next: null, seq: seq + 1, method: "echo", args: '{"after":"the knock"}' }, "answer", `count: the ask after a knock at ${how} continues the count`);
    }
  }
}

/**
 * Two arrivals on one relation at one moment. A door honours a number once
 * and only the first knock binds, however many arrivals it judges at once.
 */
async function atOneMoment(s) {
  const w = await s.ward("at one moment");
  const together = (sealed) => Promise.all(sealed.map((x) => s.arrive(w, x.box, x.lidSecret)));
  // Judges a pair of replies: at most one object, and beside it only what
  // `others` takes. Answers the index of the object, or -1.
  const one = (replies, label, others) => {
    for (const r of replies) if (r.kind === "error" || r.kind === "invalid") s.judge(r, "object", label);
    const objects = replies.filter((r) => r.kind === "object").length;
    const rest = replies.every((r) => r.kind === "object" || r.kind === "nothing" || others(r));
    const shown = replies.map((r) => (r.kind === "word" ? `quo ${r.word}` : r.kind)).join(" and ");
    s.check(label, objects <= 1 && rest, `got ${shown}`);
    return objects === 1 ? replies.findIndex((r) => r.kind === "object") : -1;
  };

  const h = await s.invite(w, "two knocks");
  const knocks = [0, 1].map(() => {
    const { key, ct } = encaps(h.ek);
    return { E: hkdf(key, "quo-lock", 32), ct, k: newKey() };
  });
  const knock = (kn) => ({ knock: true, signer: "heir", next: kn.k, seq: 1, method: "echo", args: '{"k":1}', ct: kn.ct, edge: kn.E });
  const sealedKnocks = await Promise.all(knocks.map((kn) => s.ask(h, { ...knock(kn), sealOnly: true })));
  const knockReplies = await together(sealedKnocks);
  const won = one(knockReplies, "at one moment: of two knocks on one fresh heir, one binds and the other is a stranger's", (r) => r.kind === "silence");
  if (won >= 0) {
    const [winner, loser] = [knocks[won], knocks[1 - won]];
    h.E = winner.E;
    const sent = sealedKnocks[won];
    s.move(h, knock(winner), sent.announced, sent.edge, sent.seq, knockReplies[won].agr);
    await s.ask(h, { signer: "H", under: "F", next: null, seq: 2, method: "echo", args: '{"after":"the knock"}' }, "answer", "at one moment: the knock that bound holds the relation");
    await s.ask(h, { signer: loser.k, edge: loser.E, next: null, seq: 2, method: "echo", args: "{}" }, "stranger", "at one moment: the knock that did not bind holds no relation");
  }

  const h2 = await s.invite(w, "one ask twice");
  await s.bind(h2, 1);
  const o = { signer: "H", under: "F", next: newKey(), seq: 2, method: "echo", args: '{"twice":true}' };
  const sealed = await s.ask(h2, { ...o, sealOnly: true });
  const replies = await together([sealed, sealed]);
  const at = one(replies, "at one moment: one ask delivered twice is honoured once", (r) => r.kind === "word" && r.word === "repeated");
  if (at >= 0) {
    s.move(h2, o, sealed.announced, sealed.edge, sealed.seq, replies[at].agr);
    await s.ask(h2, { signer: "V", under: "F", next: null, seq: 3, method: "echo", args: '{"after":"twice"}' }, "answer", "at one moment: the relation moved by the one choice");
  }
}

async function theReaches(s) {
  const w = await s.ward("the reaches");
  for (const reach of [null, "echo", "marked", "moved", "null", "silent"]) {
    const name = reach ?? "default";
    let h;
    try {
      h = await s.invite(w, name, reach);
    } catch (e) {
      if (e instanceof Abort) continue;
      throw e;
    }
    const want = reach === "silent" ? "silence" : "answer";
    await s.ask(h, { knock: true, signer: "heir", next: newKey(), seq: 1, method: "m", args: '{"a":[1,"two",{"three":null}]}' }, want, `reach ${name}: a named knock`);
    await s.ask(h, { signer: "H", under: "F", next: null, seq: 2 }, want, `reach ${name}: the empty ask`);
    await s.ask(h, { signer: "H", under: "O", next: null, seq: 3, method: "m" }, want, `reach ${name}: a named ask with no args`);
    await s.ask(h, { signer: "H", under: "F", next: null, seq: 4, method: "", args: "{}" }, want, `reach ${name}: the empty method name`);
  }
  const e = await s.invite(w, "deep", "echo");
  await s.bind(e);
  await s.ask(e, { signer: "H", under: "O", next: null, seq: 2, method: "echo", args: `{"d":${nest(63)}}` }, "chosen", "echo: args of depth sixty-four, echoed or refused by choice");
  await s.ask(e, { signer: "H", under: "F", next: null, seq: 3, method: "echo", args: `{"d":${nest(999)}}` }, "chosen", "echo: args of depth a thousand, echoed or refused by choice");
  await s.ask(e, { signer: "H", under: "F", next: null, seq: 4, method: "echo", args: '{"after":"depth"}' }, "answer", "either choice moved the edge keys");
  const sl = await s.invite(w, "silent-move", "silent");
  await s.ask(sl, { knock: true, signer: "heir", next: newKey(), seq: 1, method: "x" }, "silence", "silent: a knock meets a chosen silence");
  await s.ask(sl, { signer: "H", under: "F", next: null, seq: 2, method: "x" }, "silence", "silent: the knock bound, and the offered key follows");
  await s.ask(sl, { signer: "H", under: "F", next: null, seq: 3, badSig: true, method: "x" }, "stranger", "silent: a bad signature is a stranger's");
}

async function theZeroHead(s) {
  const zero = (ward, o, want, label) => s.ask({ ward, reach: ward.reach, pkHex: null }, { zero: true, ward, signer: newKey(), next: null, seq: 1, ...o }, want, `zero head: ${label}`);
  for (const reach of ["echo", "marked", "moved", "null", "silent"]) {
    let w;
    try {
      w = await s.ward(`zero head ${reach}`, reach);
    } catch (e) {
      if (e instanceof Abort) continue;
      throw e;
    }
    const want = reach === "silent" ? "silence" : "answer";
    await zero(w, { method: "hello", args: '{"z":[0]}', reach }, want, `reach ${reach}, a named ask`);
    await zero(w, { reach }, want, `reach ${reach}, the empty ask`);
  }
  const none = await s.ward("zero head, nothing answers");
  await zero(none, { method: "hello", args: "{}" }, "stranger", "with no reach, case 4");
  await zero(none, { method: "hello", args: "{}", badSig: true }, "stranger", "with no reach and a bad signature");
  const w = await s.ward("zero head echo again", "echo");
  const o = { method: "echo", args: '{"twice":true}', reach: "echo", next: newKey(), seq: 7 };
  const key = newKey();
  const payload = payloadBytes({ to: "null", by: J(key.hex), next: J(o.next.hex), seq: "7" }, o);
  const { box, lidSecret } = sealAsk({ padlock: w.padlock, head: ZERO32, edge: ZERO32, body: Buffer.concat([payload, edSign(key.seed, payload)]) });
  const [want, predicate] = s.wantFor("echo", o);
  for (const n of ["once", "twice"]) s.judge(await s.arrive(w, box, lidSecret), want, `zero head: the same sealed bytes are answered, ${n}`, predicate);
  await zero(w, { ...o, seq: 7 }, "answer", "the same number again is answered: no count");
  await zero(w, { ...o, badSig: true }, "stranger", "a bad signature, case 5");
  await zero(w, { ...o, set: { to: J(hex(rand(32))) } }, "stranger", "to not null, case 3");
  await zero(w, { ...o, set: { by: J("0".repeat(64)) } }, "stranger", "by zero hex, case 3");
  await zero(w, { ...o, set: { next: J("0".repeat(64)) } }, "stranger", "next zero hex, case 3");
  await zero(w, { ...o, set: { seq: "0" } }, "stranger", "seq zero, case 3");
  await zero(w, { ...o, edge: rand(32) }, "stranger", "a body not under the zero edge key, case 1");
  await zero(w, { ...o, signer: { seed: rand(32), pk: null, hex: "0".repeat(64) } }, "stranger", "by zero hex with a signature");
  await zero(w, { ...o, next: "self" }, "answer", "next equal to by");
}

// ---------- the signature's failure list ----------

const PRIME = 2n ** 255n - 19n;
/** The one small-order X25519 point the verifier writes, of order eight. */
const SMALL_ORDER_X = Buffer.from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800", "hex");

/** A point of order eight, drawn. */
function order8Point() {
  for (;;) {
    const p = pointDecode(rand(32));
    if (!p) continue;
    const t = pointMul(L, p);
    if (!pointEq(pointMul(4n, t), IDENTITY)) return t;
  }
}

/** A signature whose R is given, holding the cofactorless equation for the key `scalar`B. */
const withR = (rBytes, pk, scalar, msg) => Buffer.concat([rBytes, leBytes((hramScalar(rBytes, pk, msg) * scalar) % L)]);

/** The first y with no point on the curve. */
function undecodable() {
  let y = 2n;
  while (pointDecode(leBytes(y))) y++;
  return leBytes(y);
}

/**
 * Every place SPEC.md says the signature check fails, and the two it says it
 * does not, driven at the door on the zero head, where `by` is read and a
 * failing check is case 5: silence.
 */
async function theSignature(s) {
  const w = await s.ward("the signature", "echo");
  const k = newKey();
  const a = edScalar(k.seed);
  const args = '{"sig":1}';
  let n = 0;
  const zero = (o, want, label) =>
    s.ask(
      { ward: w, reach: "echo", pkHex: null },
      { zero: true, ward: w, signer: k, next: null, seq: ++n, method: "echo", args, ...o },
      want,
      `the signature: ${label}`,
    );
  const asKey = (pk) => ({ seed: k.seed, pk, hex: hex(pk) });
  /** The payload a zero-head ask carries at that number, so an R can be chosen for it. */
  const payloadAt = (seq, pk) => payloadBytes({ to: "null", by: J(hex(pk)), next: "null", seq: String(seq) }, { method: "echo", args });
  /** The first number at or above `from` whose payload gives an `h` of that residue modulo eight. */
  const numberFor = (from, pk, rBytes, residue) => {
    for (let q = from; ; q++) {
      const payload = payloadAt(q, pk);
      if (hramScalar(rBytes, pk, payload) % 8n === residue) return { seq: q, payload };
    }
  };

  await zero({ sig: (p) => { const g = edSign(k.seed, p); return Buffer.concat([g.subarray(0, 32), leBytes(scalarLe(g.subarray(32)) + L)]); } }, "stranger", "an s above the group order, though the equation holds");
  await zero({ sig: (p) => Buffer.concat([edSign(k.seed, p).subarray(0, 32), leBytes(L)]) }, "stranger", "an s equal to the group order");
  await zero({ sig: (p) => withR(undecodable(), k.pk, a, p) }, "stranger", "an R that does not decode to a point");
  await zero({ sig: (p) => withR(leBytes(1n + PRIME), k.pk, a, p) }, "stranger", "an R whose bytes are not the bytes its point encodes to");
  await zero({ sig: (p) => withR(leBytes(1n | (1n << 255n)), k.pk, a, p) }, "stranger", "an R spelled with the sign bit set on x zero");
  await zero({ signer: asKey(undecodable()) }, "stranger", "a public key that does not decode to a point");
  let good = 2n;
  while (!pointDecode(leBytes(good)) || pointEq(pointMul(8n, pointDecode(leBytes(good))), IDENTITY)) good++;
  const unreduced = leBytes(good + PRIME);
  await zero({ signer: asKey(unreduced), sig: (p) => withR(leBytes(1n), unreduced, 0n, p) }, "stranger", "a public key whose y is at or above the prime");
  const t8 = order8Point();
  const spellings = [
    ["the identity", leBytes(1n)],
    ["y equal to p minus one", leBytes(PRIME - 1n)],
    ["the identity with the sign bit set on x zero", leBytes(1n | (1n << 255n))],
    ["y equal to p minus one with the sign bit set on x zero", leBytes((PRIME - 1n) | (1n << 255n))],
    ["a point of order eight", pointEncode(t8)],
    ["a point of order four", pointEncode(pointMul(2n, t8))],
  ];
  for (const [how, pk] of spellings) {
    await zero({ signer: asKey(pk), sig: () => Buffer.concat([leBytes(1n), leBytes(0n)]) }, "stranger", `a small-order public key, ${how}`);
  }

  // The two the list does not hold: both are answered as the reach answers.
  await zero({ sig: (p) => withR(leBytes(1n), k.pk, a, p) }, "answer", "a small-order R, the identity, verifies");
  const torsion = pointEncode(pointAdd(pointMul(a, BASE), t8));
  const r = 12345n;
  const rB = pointEncode(pointMul(r, BASE));
  const one = numberFor(1000, torsion, rB, 0n);
  await zero(
    { signer: asKey(torsion), raw: one.payload, seq: one.seq, sig: () => Buffer.concat([rB, leBytes((r + hramScalar(rB, torsion, one.payload) * a) % L)]) },
    "answer",
    "a public key with a torsion component that is not small-order verifies",
  );
  const rB8 = pointEncode(pointNeg(t8));
  const two = numberFor(2000, torsion, rB8, 1n);
  await zero(
    { signer: asKey(torsion), raw: two.payload, seq: two.seq, sig: () => Buffer.concat([rB8, leBytes((hramScalar(rB8, torsion, two.payload) * a) % L)]) },
    "answer",
    "an R of order eight verifies under a key with a torsion component",
  );
  await zero({}, "answer", "the door still answers after every failure");
}

async function theStrangers(s) {
  const w = await s.ward("strangers");
  const other = await s.ward("strangers, the other ward");
  const h = await s.invite(w, "spent");
  const f = await s.invite(w, "fresh");
  const o = await s.invite(other, "elsewhere");
  await s.bind(h);
  await s.ask(h, { signer: "H", under: "O", next: newKey(), seq: 2, method: "echo", args: "{}" }, "answer", "the spent heir vouches for a key");
  let seq = 3;
  const lidded = (len) => {
    const secret = rand(32);
    return { box: Buffer.concat([x25519Pub(secret), rand(len - 32)]), secret };
  };
  let g = lidded(200);
  await s.stranger(w, g.box, g.secret, "case 1: garbage behind a lid");
  g = lidded(80);
  await s.stranger(w, g.box, g.secret, "case 1: eighty bytes");
  await s.stranger(w, rand(31), null, "case 1: thirty-one bytes, sealed to a lid nobody holds");
  await s.stranger(w, rand(1), null, "case 1: one byte, sealed to a lid nobody holds");
  await s.stranger(w, Buffer.concat([ZERO32, rand(400)]), null, "case 1: a zero lid, sealed to a lid nobody holds");
  const order8 = Buffer.from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800", "hex");
  await s.stranger(w, Buffer.concat([order8, rand(400)]), null, "case 1: a small-order lid, sealed to a lid nobody holds");
  const good = { signer: "H", under: "O", next: null, method: "echo", args: "{}" };
  await s.ask(h, { ...good, seq: seq++, padlock: x25519Pub(rand(32)) }, "stranger", "case 1: a wrong padlock");
  await s.ask(h, { ...good, seq: seq++, mutate: (b) => ((b[40] ^= 1), b) }, "stranger", "case 1: a head that does not open");
  await s.ask(h, { ...good, seq: seq++, mutate: (b) => ((b[b.length - 1] ^= 1), b) }, "stranger", "case 1: a body that does not open");
  await s.ask(h, { ...good, seq: seq++, edge: rand(32) }, "stranger", "case 1: a body under no edge key of the heir");
  await s.ask(h, { ...good, seq: seq++, edge: ZERO32 }, "stranger", "case 1: a spent heir's body under the zero edge key");
  await s.ask(h, { ...good, seq: seq++, body: edSign(h.H.seed, Buffer.alloc(0)) }, "stranger", "case 1: a body of sixty-four bytes");
  await s.ask(h, { ...good, seq: seq++, body: rand(10) }, "stranger", "case 1: a body of ten bytes");
  await s.ask(h, { ...good, seq: seq++, knock: true, ct: h.ct }, "stranger", "case 1: a box with a ciphertext on a spent heir");
  await s.ask(f, { knock: true, signer: "heir", next: newKey(), seq: 1, mutate: (b) => b.subarray(0, 80 + 500) }, "stranger", "case 1: a fresh heir's box too short for a ciphertext");
  await s.ask(f, { knock: true, signer: "heir", next: newKey(), seq: 1, body: edSign(f.secret, Buffer.alloc(0)) }, "stranger", "case 1: a knock's body of sixty-four bytes");
  const alien = encaps(keyGen().ek);
  await s.ask(f, { knock: true, signer: "heir", next: newKey(), seq: 1, ct: alien.ct, edge: hkdf(alien.key, "quo-lock", 32), method: "x" }, "stranger", "a knock on a lock that is not the ward's");
  await s.ask(f, { knock: true, signer: "heir", next: newKey(), seq: 1, ct: alien.ct, method: "x" }, "stranger", "a knock whose ciphertext is not the lock's, under the true edge key");
  await s.ask(f, { signer: "heir", next: newKey(), seq: 1, edge: f.E, method: "x" }, "stranger", "a fresh heir's ask with no ciphertext");
  await s.ask(f, { signer: "heir", next: newKey(), seq: 1, edge: ZERO32, method: "x" }, "stranger", "a fresh heir's ask under the zero edge key");
  await s.ask(f, { knock: true, signer: newKey(), next: newKey(), seq: 1, method: "x" }, "stranger", "case 7: a knock on a secret that is not the heir's");
  await s.ask(f, { knock: true, signer: "heir", next: newKey(), seq: 1, method: "x", badSig: true }, "stranger", "case 8: a knock with a bad signature");
  await s.ask(f, { knock: true, signer: "heir", next: null, seq: 1, badSig: true }, "stranger", "case 8 before 10: an unannounced knock with a bad signature");
  await s.ask(f, { knock: true, signer: "heir", next: newKey(), seq: 0 }, "stranger", "case 3: a knock with seq zero");
  const ghost = { name: "ghost", ward: w, pk: rand(32), pkHex: "", E: ZERO32, ct: f.ct };
  ghost.pkHex = hex(ghost.pk);
  await s.ask(ghost, { edge: ZERO32, signer: newKey(), next: null, seq: 1, method: "x" }, "stranger", "case 6: an heir never made here");
  await s.ask(ghost, { knock: true, signer: newKey(), next: newKey(), seq: 1, method: "x" }, "stranger", "case 6: a knock on an heir never made here");
  await s.ask({ ...o, ward: w }, { knock: true, signer: "heir", next: newKey(), seq: 1 }, "stranger", "case 6: a knock on another ward's heir");
  await s.ask(h, { ...good, seq: seq++, signer: newKey() }, "stranger", "case 7: a key not admitted");
  await s.ask(h, { ...good, seq: seq++, set: { by: J(newKey().hex) } }, "stranger", "case 7: by names a key not admitted, signed by the held key");
  await s.ask(h, { ...good, seq: seq++, badSig: true }, "stranger", "case 8: a bad signature by the held key");
  await s.ask(h, { ...good, seq: seq++, signer: "V", badSig: true }, "stranger", "case 8: a bad signature by the vouched key");
  await s.ask(h, { ...good, seq: seq++ }, "answer", "the held key still answers after every stranger");
  await s.ask(f, { knock: true, signer: "heir", next: newKey(), seq: 9, method: "echo", args: '{"still":"fresh"}' }, "answer", "no stranger spent the fresh heir");
}

async function thePayload(s) {
  const w = await s.ward("payloads");
  const h = await s.invite(w, "h");
  await s.bind(h);
  let seq = 2;
  const bad = async (label, o) => {
    await s.ask(h, { signer: "H", under: "O", next: null, seq: seq++, method: "echo", args: "{}", ...o }, "stranger", label);
  };
  const good = async (label, o) => {
    await s.ask(h, { signer: "H", under: "O", next: null, seq: seq++, method: "echo", args: "{}", ...o }, "answer", label);
  };
  const raw = (text) => ({ raw: Buffer.from(text, "utf8") });
  const pk = h.H.hex;
  const whole = (n) => `{"to":${J(h.pkHex)},"by":${J(pk)},"next":null,"seq":${n}`;
  await bad("case 2: not UTF-8", { raw: Buffer.concat([Buffer.from(whole(seq) + ',"x":"'), Buffer.from([0xc3, 0x28]), Buffer.from('"}')]) });
  await bad("case 2: an encoded surrogate", { raw: Buffer.concat([Buffer.from(whole(seq) + ',"x":"'), Buffer.from([0xed, 0xa0, 0x80]), Buffer.from('"}')]) });
  await bad("case 2: not JSON", raw(`${whole(seq)},`));
  await bad("case 2: trailing text", raw(`${whole(seq)}} x`));
  await bad("case 2: a byte order mark", raw(`\ufeff${whole(seq)}}`));
  await bad("case 2: no-break space is not whitespace", raw(`${whole(seq)}\u00a0}`));
  await bad("case 2: an array", raw("[1,2]"));
  await bad("case 2: a string", raw('"payload"'));
  await bad("case 2: a number", raw("42"));
  await bad("case 2: null", raw("null"));
  await bad("case 2: a duplicate to", { extra: [["to", J(h.pkHex)]] });
  await bad("case 2: a duplicate key after escapes", { extra: [["a", "1"], ['"\\u0061"', "2"]] });
  const chosen = async (label, o) => {
    await s.ask(h, { signer: "H", under: "O", next: null, seq: seq++, method: "echo", args: "{}", ...o }, "chosen", label);
  };
  await chosen("args: a repeated key inside args is the kit's", { args: '{"k":1,"\\u006b":2}' });
  await chosen("args: args nesting a hundred deep is the kit's", { args: `{"d":${nest(100)}}` });
  await chosen("args: a field beside the six nesting a hundred deep is the kit's", { extra: [["d", nest(100)]] });
  for (const [text, why] of [
    ['"\\ud800"', "a lone high surrogate"],
    ['"\\udc00x"', "a lone low surrogate"],
    ['"\\ud800\\u0041"', "a high surrogate before no low one"],
  ]) {
    await chosen(`args: ${why}, ${text}, is the kit's`, { args: `{"v":${text}}` });
    await chosen(`args: ${why}, ${text}, beside the six, is the kit's`, { extra: [["v", text]] });
  }
  await bad("case 3: to in uppercase hex", { set: { to: J(h.pkHex.toUpperCase()) } });
  await bad("case 3: to of 63 hex", { set: { to: J(h.pkHex.slice(1)) } });
  await bad("case 3: to zero hex", { set: { to: J("0".repeat(64)) } });
  await bad("case 3: to null on an heir's head", { set: { to: "null" } });
  await bad("case 3: to another heir", { set: { to: J(hex(rand(32))) } });
  await bad("case 3: to absent", { set: { to: undefined } });
  await bad("case 3: by in uppercase hex", { set: { by: J(pk.toUpperCase()) } });
  await bad("case 3: by null", { set: { by: "null" } });
  await bad("case 3: by absent", { set: { by: undefined } });
  await bad("case 3: next zero hex", { set: { next: J("0".repeat(64)) } });
  await bad("case 3: next in uppercase hex", { set: { next: J(newKey().hex.toUpperCase()) } });
  await bad("case 3: next of 66 hex", { set: { next: J(newKey().hex + "00") } });
  await bad("case 3: next absent", { set: { next: undefined } });
  await bad("case 3: next a number", { set: { next: "7" } });
  await bad("case 3: seq zero", { set: { seq: "0" } });
  await bad("case 3: seq negative", { set: { seq: "-5" } });
  await bad("case 3: seq a fraction", { set: { seq: `${seq}.5` } });
  await bad("case 3: seq a string", { set: { seq: J(String(seq)) } });
  await bad("case 3: seq absent", { set: { seq: undefined } });
  await bad("case 3: seq null", { set: { seq: "null" } });
  await bad("case 3: seq true", { set: { seq: "true" } });
  await bad("case 3: seq minus zero", { set: { seq: "-0" } });
  await bad("case 3: method a number", { set: { method: "5" } });
  await bad("case 3: method null", { set: { method: "null" } });
  await bad("case 3: args an array", { args: "[]" });
  await bad("case 3: args null", { args: "null" });
  await bad("case 3: args a string", { args: '"x"' });
  for (const [text, why] of [
    ['"a\u0001b"', "a raw control character"],
    ['"\\x41"', "an unknown escape"],
    ["01", "a leading zero"],
    ["[1,]", "a trailing comma"],
  ]) {
    await bad(`value: ${why}, ${text}, beside the six`, { extra: [["v", text]] });
  }
  for (const [text, why] of [
    ["1e21", "an exponent"],
    ["1e23", "an exponent whose double is not exact"],
    ["1e+23", "an exponent with a plus"],
    ["1E+23", "an exponent in capitals"],
    ["10e22", "an exponent after two digits"],
    ["1.7976931348623157e308", "the largest double"],
    ["-0", "minus zero"],
    ["-0.0", "minus zero with a fraction"],
    ["9007199254740993", "an integer no double holds"],
    ["-9007199254740993", "a negative integer no double holds"],
    ["100000000000000000000000", "a long integer"],
    ["1e-400", "a number whose double is zero"],
    ["-1e-400", "a negative number whose double is zero"],
    ["1e400", "a number no double holds"],
    ["9007199254740992.0", "a fraction above the double integers"],
    ["1.0", "one, written with a fraction"],
    ["0.1", "a fraction"],
    ["-0.5e-3", "a small negative fraction"],
    ['"\\uffff\uFFFF"', "noncharacters"],
    ['"\\ud83d\\ude00😀"', "a surrogate pair"],
    ['"\\u0000"', "an escaped NUL"],
    ['{"":1,"\\/":2,"/x":3}', "keys that differ after escapes"],
  ]) {
    await chosen(`value: ${why}, beside the six and in args, echoed or refused by choice`, { extra: [["v", text]], args: `{"v":${text}}` });
  }
  await bad("case 3: seq written with a fraction", { set: { seq: `${seq}.0` } });
  await bad("case 3: seq written with an exponent", { set: { seq: "1e1" } });
  await good("the payload still answers after every refusal", {});
}

async function unannounced(s) {
  const w = await s.ward("unannounced");
  const h = await s.invite(w, "h");
  const knock = (o, want, label) => s.ask(h, { knock: true, signer: "heir", seq: 1, method: "echo", args: "{}", ...o }, want, `unannounced: ${label}`);
  await knock({ next: null }, "unannounced", "a knock with next null");
  await knock({ next: "heir" }, "unannounced", "a knock with next the heir, its own by");
  await knock({ next: null, method: undefined, args: undefined }, "unannounced", "an empty knock with next null");
  await knock({ next: null, seq: 1 }, "unannounced", "the same number again: a refusal honoured nothing");
  await knock({ next: null, set: { next: J("0".repeat(64)) } }, "stranger", "next zero hex is case 3");
  await knock({ next: null, reach: undefined, set: { next: undefined } }, "stranger", "next absent is case 3");
  s.check("unannounced: the heir is still fresh", h.state === "fresh", "model");
  await s.bind(h, 1);
  await s.ask(h, { signer: "H", under: "O", next: null, seq: 2, method: "echo", args: '{"bound":true}' }, "answer", "unannounced: the next knock bound the heir");
  await s.ask(h, { signer: "H", under: "F", next: "heir", seq: 3, method: "echo", args: "{}" }, "answer", "unannounced: on a spent heir next the heir is no word");
}

async function removal(s) {
  const w = await s.ward("removal");
  const sp = await s.invite(w, "spent");
  const fr = await s.invite(w, "fresh");
  const fr2 = await s.invite(w, "fresh, unannounced");
  await s.bind(sp);
  await s.ask(sp, { signer: "H", under: "O", next: newKey(), seq: 2, method: "echo", args: "{}" }, "answer", "removal: the spent heir vouches for a key");
  await s.release(w, "spent", "spent");
  await s.release(w, "fresh", "fresh");
  await s.release(w, "fresh, unannounced", "fresh, unannounced");
  await s.release(w, "spent", null);
  const o = { next: null, method: "echo", args: "{}" };
  await s.ask(sp, { ...o, signer: "H", under: "F", seq: 3 }, "removed", "removal: the held key under the kept offered key hears removed");
  await s.ask(sp, { ...o, signer: "V", under: "O", seq: 4 }, "removed", "removal: the vouched key under the kept open key hears removed");
  await s.ask(sp, { ...o, signer: "H", under: "O", seq: 2 }, "removed", "removal: case 9 comes before case 11");
  await s.ask(sp, { ...o, signer: "H", under: "O", seq: 5 }, "removed", "removal: removed moved nothing");
  await s.ask(sp, { ...o, signer: "H", under: "O", seq: 6, badSig: true }, "stranger", "removal: a bad signature by a kept key is case 8");
  await s.ask(sp, { ...o, signer: "H", under: "O", seq: 10, set: { seq: "0" } }, "stranger", "removal: case 3 before case 9, a kept key with seq zero");
  await s.ask(sp, { ...o, signer: "H", under: "O", seq: 11, set: { next: J("0".repeat(64)) } }, "stranger", "removal: case 3 before case 9, a kept key with next zero hex");
  await s.ask(sp, { ...o, signer: "H", under: "O", seq: 12, set: { to: "null" } }, "stranger", "removal: case 3 before case 9, a kept key with to null");
  await s.ask(sp, { ...o, signer: "H", under: "O", seq: 13, raw: Buffer.from("[1,2]", "utf8") }, "stranger", "removal: case 2 before case 9, a kept key with a payload that is no object");
  await s.ask(sp, { ...o, signer: newKey(), under: "O", seq: 7 }, "stranger", "removal: a key never kept is a stranger's");
  await s.ask(sp, { ...o, signer: "heir", under: "O", seq: 8 }, "stranger", "removal: the heir is a stranger's");
  await s.ask(sp, { ...o, signer: "H", edge: rand(32), seq: 9 }, "stranger", "removal: a body under no kept edge key");
  await s.ask(fr, { knock: true, signer: "heir", next: newKey(), seq: 1, method: "echo", args: "{}" }, "stranger", "removal: case 6, a knock on an heir released while fresh");
  await s.ask(fr2, { knock: true, signer: "heir", next: null, seq: 1 }, "stranger", "removal: case 6 before case 10");
  await s.ask(fr, { signer: "heir", edge: ZERO32, next: newKey(), seq: 1, method: "echo", args: "{}" }, "stranger", "removal: case 6 under the zero edge key");
  const again = await s.invite(w, "spent");
  s.check("removal: the name invited again is a new heir", !again.pk.equals(sp.pk), "");
  await s.bind(again);
}

async function theSize(s) {
  const w = await s.ward("the size");
  const h = await s.invite(w, "h", "null");
  await s.bind(h);
  const sized = (seq, total, knock) => {
    const next = knock ? J("0".repeat(64)) : "null";
    const base = payloadBytes({ to: J(h.pkHex), by: J("0".repeat(64)), next, seq: String(seq) }, { method: "echo", args: '{"v":""}' }).length;
    const len = total - (knock ? 1248 : 160) - base;
    return { method: "echo", args: `{"v":"${"a".repeat(len)}"}`, seq, next: null };
  };
  await s.ask(h, { signer: "H", under: "O", ...sized(2, SIZE + 1) }, "stranger", "size: an ask of 1,048,577 bytes");
  await s.ask(h, { signer: "H", under: "O", ...sized(3, SIZE) }, "answer", "size: an ask of 1,048,576 bytes");
  const big = rand(SIZE + 1);
  const secret = rand(32);
  x25519Pub(secret).copy(big);
  await s.stranger(w, big, secret, "size: garbage of 1,048,577 bytes");
  const k1 = await s.invite(w, "knock above", "null");
  await s.ask(k1, { knock: true, signer: "heir", ...sized(1, SIZE + 1, true), next: newKey() }, "stranger", "size: a knock of 1,048,577 bytes");
  await s.bind(k1);
  const k2 = await s.invite(w, "knock at", "null");
  await s.ask(k2, { knock: true, signer: "heir", ...sized(1, SIZE, true), next: newKey() }, "answer", "size: a knock of 1,048,576 bytes");
}

// ---------- the kit as an asker ----------

/** A ward of the verifier's own, with a lock it holds in full. */
export function verifierWard(seedText) {
  return { ...wardKeys(seedText), lock: keyGen() };
}

/** An invitation the verifier mints from its own ward, with `at` when given, and the relation it opens. */
export function mint(mine, at) {
  const heir = newKey();
  const inv = { ward: mine.pk, heir: heir.hex, secret: hex(heir.seed), lock: hex(mine.lock.ek) };
  if (at !== undefined) inv.at = at;
  return { inv, heir, state: "fresh", knock: null, key: null, edge: null, movedAt: 0 };
}

const SIL = { silence: true };
const word = (w) => ({ text: J({ quo: w }), read: { quo: w } });
const big = (len) => "a".repeat(len - 137);

/** The replies the verifier writes to a kit's ask, and what the kit must read. */
const REPLIES = {
  "an object with seen": { text: '{"object":{"n":[1,"two",null],"t":true},"seen":"s1"}', read: { object: { n: [1, "two", null], t: true }, seen: "s1" } },
  "an object with seen null, padded and reordered": { text: ' {\n "seen" : null ,\t"object" : [1.5, {"k":"v"}] } ', read: { object: [1.5, { k: "v" }], seen: null } },
  "the object null": { text: '{"object":null,"seen":""}', read: { object: null, seen: "" } },
  "a box of exactly the size": { text: `{"object":"${big(SIZE)}","seen":null}`, read: { object: big(SIZE), seen: null } },
  "an object with at": {
    text: '{"object":{"k":1},"seen":"s2","at":["tcp://127.0.0.1:9","ws://127.0.0.1:9/quo"]}',
    read: { object: { k: 1 }, seen: "s2" },
    at: ["tcp://127.0.0.1:9", "ws://127.0.0.1:9/quo"],
  },
  "an object whose at holds what is skipped": {
    text: '{"at":[5,"no scheme","tcp://127.0.0.1","mailto:x@example.org",null,"TCP://127.0.0.1:9"],"object":[],"seen":null}',
    read: { object: [], seen: null },
    at: [5, "no scheme", "tcp://127.0.0.1", "mailto:x@example.org", null, "TCP://127.0.0.1:9"],
  },
  "an object whose at is no array": { text: '{"object":2,"seen":null,"at":"tcp://127.0.0.1:9"}', read: { object: 2, seen: null }, at: "tcp://127.0.0.1:9" },
  "an object whose at is null": { text: '{"object":3,"seen":null,"at":null}', read: { object: 3, seen: null }, at: null },
  silence: { text: '{"silence":true}', read: SIL },
  "silence padded": { text: ' { "silence" : true }\n', read: SIL },
  removed: word("removed"),
  unannounced: word("unannounced"),
  repeated: word("repeated"),
  nothing: { none: true, read: { nothing: true } },
  "a reply that does not open": { text: '{"object":1,"seen":null}', read: SIL, flip: true },
  "a reply sealed to another lid": { text: '{"object":1,"seen":null}', read: SIL, otherLid: true },
  "a reply signed by another key": { text: '{"object":1,"seen":null}', read: SIL, otherSigner: true },
  "a reply the ward signed over another ask's lid": { text: '{"object":1,"seen":null}', read: SIL, signedLid: "another" },
  "a word the ward signed over another ask's lid": { ...word("repeated"), read: SIL, signedLid: "another" },
  "a reply signed over its reply text alone": { text: '{"object":1,"seen":null}', read: SIL, textAlone: true },
  "a reply whose s is above the group order": {
    text: '{"object":1,"seen":null}',
    read: SIL,
    sig: (mine, text) => {
      const g = edSign(mine.signSeed, text);
      return Buffer.concat([g.subarray(0, 32), leBytes(scalarLe(g.subarray(32)) + L)]);
    },
  },
  "a reply whose R is the identity spelled unreduced": {
    text: '{"object":1,"seen":null}',
    read: SIL,
    sig: (mine, text) => withR(leBytes(1n + PRIME), mine.signPk, edScalar(mine.signSeed), text),
  },
  "a reply whose ephemeral pk is a small-order point": { text: '{"object":1,"seen":null}', read: SIL, smallEph: true },
  "a box too short to open": { raw: 60, read: SIL },
  "a box above the size": { text: `{"object":"${big(SIZE + 1)}","seen":null}`, read: SIL },
  "a field beside the shape": { text: '{"object":1,"seen":null,"x":1}', read: SIL },
  "seen a number": { text: '{"object":1,"seen":5}', read: SIL },
  "seen absent": { text: '{"object":1}', read: SIL },
  "a duplicate key": { text: '{"object":1,"object":2,"seen":null}', read: SIL },
  "at twice": { text: '{"object":1,"seen":null,"at":[],"at":[]}', read: SIL },
  "silence with at": { text: '{"silence":true,"at":[]}', read: SIL },
  "a word with at": { text: '{"quo":"repeated","at":[]}', read: SIL },
  "a fourth word": { text: '{"quo":"gone"}', read: SIL },
  "silence false": { text: '{"silence":false}', read: SIL },
  "a reply text that is no JSON": { text: '{"object":1,', read: SIL },
  "an array": { text: "[1]", read: SIL },
};

const ASKS = [{ method: "echo", args: { i: 1, s: "x" } }, {}, { method: "m" }];

/**
 * Replies only a carrier can give: the connection closes, no frame comes
 * back, or a post is answered with a status that is no reply.
 */
export const CARRIED_REPLIES = {
  "a closed connection": { none: true, mode: "close", read: { nothing: true } },
  "no answer at all": { none: true, mode: "wait", read: { nothing: true } },
  "status 500": { none: true, mode: "status", status: 500, read: { nothing: true } },
  "status 200 with an empty body": { none: true, mode: "status", status: 200, read: { nothing: true } },
  "status 201 with a reply's box": { text: '{"object":1,"seen":null}', mode: "status", status: 201, read: { nothing: true } },
};

export class Lost extends Error {}

/** Takes a kit's box apart as the verifier's door would, and says which keys it came under. */
function openKitBox(mine, rel, box) {
  if (box.length > SIZE) return { why: `a box of ${box.length} bytes, above the size` };
  if (box.length < 161) return { why: `a box of ${box.length} bytes is too short for an ask` };
  const lid = box.subarray(0, 32);
  if (takesNoSeal(lid)) return { why: "the lid takes no seal" };
  const agr = x25519(mine.scalar, lid);
  const head = aesOpen(hkdf(agr, "quo-seal", 44), lid, box.subarray(32, 80));
  if (!head) return { why: "the head does not open under quo-seal to the verifier's padlock" };
  if (!head.equals(rel.heir.pk)) return { why: `the head is ${hex(head)}, not the heir pk` };
  const under = (edge, from) => aesOpen(hkdf(Buffer.concat([agr, edge]), "quo-edge-seal", 44), lid, box.subarray(from));
  const done = (t) => {
    if (t.body.length <= 64) return { why: "a body of sixty-four bytes or fewer" };
    const payload = t.body.subarray(0, t.body.length - 64);
    if (box.length !== payload.length + t.over) return { why: `a box of ${box.length} bytes over a payload of ${payload.length}, wanted ${t.over} more` };
    return { ...t, lid, payload, sig: t.body.subarray(t.body.length - 64) };
  };
  const tried = [];
  if (rel.state === "fresh") {
    if (box.length >= 1249) {
      const E = hkdf(decaps(mine.lock.dk, box.subarray(80, 1168)), "quo-lock", 32);
      const body = under(E, 1168);
      if (body) return done({ knock: true, edge: E, by: rel.heir.hex, body, over: 1248 });
    }
    tried.push("a knock whose ciphertext decapsulates under the verifier's lock");
    if (rel.knock?.announced) {
      const body = under(rel.knock.edge, 80);
      if (body) return done({ knock: false, edge: rel.knock.edge, by: rel.knock.announced, body, over: 160 });
      tried.push("an ask under the knock's edge key");
    }
  } else {
    const body = under(rel.edge, 80);
    if (body) return done({ knock: false, edge: rel.edge, by: rel.key, body, over: 160 });
    tried.push("the edge key that follows the last object");
    // After a reply that moved nothing, the door may still hold the key and
    // edge key the last move was asked under, so an ask may go back to them.
    if (rel.back && rel.from) {
      const back = under(rel.from.edge, 80);
      if (back) return done({ knock: false, edge: rel.from.edge, by: rel.from.key, body: back, over: 160 });
      tried.push("the edge key the last move was asked under, after a reply that moved nothing");
    }
  }
  return { why: `the body opens as none of: ${tried.join("; ")}` };
}

function sameAsk(p, o) {
  if (p.method !== o.method) return `method ${J(p.method)}, asked ${J(o.method)}`;
  const want = parseValue(Buffer.from(J(o.args ?? {}))).value;
  const got = p.args ?? { type: "object", entries: new Map() };
  return sameValue(got, want) ? null : "args are not the args asked";
}

function writeReply(mine, t, r) {
  if (r.none) return null;
  if (r.raw) return { box: rand(r.raw) };
  const eph = rand(32);
  // A small-order ephemeral pk gives an all-zero agreement, and a box sealed
  // under it is a box that does not open.
  const ephPk = r.smallEph ? SMALL_ORDER_X : x25519Pub(eph);
  const agr = r.smallEph ? Buffer.from(ZERO32) : x25519(eph, r.otherLid ? x25519Pub(rand(32)) : t.lid);
  const text = Buffer.from(r.text, "utf8");
  // What a reply's signature covers: the lid it is sealed to, then its text.
  const signed = r.textAlone ? text : Buffer.concat([r.signedLid === "another" ? x25519Pub(rand(32)) : t.lid, text]);
  const sig = r.sig ? r.sig(mine, signed) : edSign(r.otherSigner ? rand(32) : mine.signSeed, signed);
  const body = Buffer.concat([text, sig]);
  const box = Buffer.concat([ephPk, aesSeal(hkdf(agr, "quo-seal", 44), ephPk, body)]);
  if (r.flip) box[box.length - 1] ^= 1;
  return { box, agr };
}

/**
 * Runs a kit's asking side. With `via` set, the box comes over a carrier
 * instead of `ask`, and the reply goes back over it instead of `read`:
 * `via.seal(rel, o, label)` answers `{ box }` as `ask` would, and
 * `via.deliver(rel, t, written, r, label)` answers `{ read }` as `read` would.
 * With `at` set, every invitation it mints carries that `at`.
 */
export class AskerRun {
  constructor(s, ward, mine, via = null, at = undefined) {
    this.s = s;
    this.ward = ward;
    this.mine = mine;
    this.n = 0;
    this.via = via;
    this.at = at;
    this.boxes = 0;
  }

  /** One `ask`, taken apart; null when the kit answers `bad request`. */
  async ask(rel, label) {
    const { s } = this;
    const o = ASKS[this.n++ % ASKS.length];
    const a = this.via ? await this.via.seal(rel, o, label) : await s.stand.request({ op: "ask", ward: this.ward.pk, invitation: rel.inv, ...o });
    if (a.error === "bad request") return null;
    if (!s.check(`${label}: the kit seals a box`, isHex(a.box), J(a).slice(0, 200), "harness")) throw new Lost();
    s.v.boxes++;
    this.boxes++;
    const t = openKitBox(this.mine, rel, unhex(a.box));
    if (!s.check(`${label}: the box opens under the keys SPEC.md gives`, !t.why, t.why)) throw new Lost();
    const p = readPayload(t.payload);
    if (!s.check(`${label}: the payload is well formed`, !p.error, p.error)) throw new Lost();
    s.check(`${label}: to is the heir`, p.to === rel.heir.hex, `to ${J(p.to)}`);
    s.check(`${label}: signed by the key by names, over the payload as sent`, edVerify(unhex(p.by), t.payload, t.sig), "the signature fails");
    if (!s.check(`${label}: by is the key the relation admits`, p.by === t.by, `by ${p.by}, wanted ${t.by}`)) throw new Lost();
    // A knock that brought nothing back may be sent again as the same bytes, whatever was asked.
    const resent = t.knock && rel.knockBox === a.box;
    const why = resent ? null : sameAsk(p, o);
    s.check(`${label}: method and args are the ones asked, or the knock is sent again as the same bytes`, !why, why, "harness");
    const announced = p.next !== null && p.next !== rel.heir.hex && p.next !== p.by ? p.next : null;
    return { ...t, announced, box: a.box, seq: p.seq };
  }

  /** Hands the kit a reply, checks what it read, and follows the standing as SPEC.md moves it. */
  async reply(rel, t, name, label) {
    const { s } = this;
    const r = REPLIES[name] ?? CARRIED_REPLIES[name];
    const w = writeReply(this.mine, t, r);
    const a = this.via
      ? await this.via.deliver(rel, t, w, r, label)
      : await s.stand.request({ op: "read", ward: this.ward.pk, invitation: rel.inv, reply: w ? hex(w.box) : null });
    if (!s.check(`${label}: read answers`, "read" in a, J(a).slice(0, 200), "harness")) throw new Lost();
    const shown = J(a.read).slice(0, 160);
    // `at` is read apart: a kit that reads it keeps some of the addresses a
    // reply's array carries, in their order, and one that does not reports none.
    const { at: kept, ...read } = a.read && typeof a.read === "object" ? a.read : { at: undefined };
    s.check(`${label}: the kit reads ${name} as ${J(r.read).slice(0, 60)}`, isDeepStrictEqual(a.read && typeof a.read === "object" ? read : a.read, r.read), `read ${shown}`);
    if (kept !== undefined) {
      const from = Array.isArray(r.at) ? keepable(r.at) : [];
      const ok = r.read.object !== undefined && Array.isArray(kept) && inOrder(kept, from);
      s.check(`${label}: the at the kit keeps is addresses the reply's at carries, in order`, ok, `kept ${J(kept).slice(0, 160)}`);
    }
    if (r.read.object !== undefined) {
      // The standing moves when an object comes back to an ask whose number is
      // above every ask it has moved on, and on nothing else. The verifier
      // holds the kit's numbers from the payloads it sent.
      const above = t.seq > rel.movedAt;
      s.check(`${label}: the object came back to number ${t.seq}, ${above ? "above" : "at or below"} the highest the standing moved on, ${rel.movedAt}`, true, above ? "the standing moves" : "the standing keeps its keys");
      if (above) {
        rel.from = t.knock ? null : { key: t.by, edge: t.edge };
        rel.key = t.announced ?? t.by;
        rel.edge = follow(t.edge, w.agr);
        rel.movedAt = t.seq;
        rel.state = "spent";
        rel.back = false;
        return;
      }
    } else if (t.knock) {
      rel.knock = t;
      rel.knockBox = t.box;
    }
    rel.back = true;
  }

  /**
   * Two relations at once, each ask answered after the other's: `read` answers
   * the last `ask` on its own invitation, and the two are kept apart.
   */
  async interleaved(title) {
    const [a, b] = [mint(this.mine), mint(this.mine)];
    const rounds = [
      ["an object with seen", "an object with seen"],
      ["silence", "an object with seen"],
      ["an object with seen", "nothing"],
      ["an object with seen", "an object with seen"],
    ];
    const named = (t, name) => (t.knock && !t.announced ? "unannounced" : name);
    try {
      for (const [i, [x, y]] of rounds.entries()) {
        const ta = await this.ask(a, `${title}: round ${i + 1}, the first relation`);
        const tb = await this.ask(b, `${title}: round ${i + 1}, the second relation`);
        if (!ta || !tb) return;
        await this.reply(b, tb, named(tb, y), `${title}: round ${i + 1}, the second relation answered first`);
        await this.reply(a, ta, named(ta, x), `${title}: round ${i + 1}, the first relation answered second`);
      }
    } catch (e) {
      if (!(e instanceof Lost)) throw e;
    }
  }

  /** Runs one relation through the replies named, then one ask more to judge the last. */
  async relation(title, names) {
    const { s } = this;
    const rel = mint(this.mine, this.at);
    try {
      for (let i = 0; i <= names.length; i++) {
        const label = `${title}: ask ${i + 1}${i ? `, after ${names[i - 1]}` : ""}`;
        const t = await this.ask(rel, label);
        if (!t) {
          if (this.via && this.boxes === 0) {
            s.check("send answers bad request: the kit is judged without a dialer", true, "");
            return false;
          }
          if (!this.via && s.v.boxes === 0) {
            s.v.doorAlone = true;
            s.check("ask answers bad request: the kit is judged as a door alone", true, "");
            return false;
          }
          s.check(`${label}: the kit asks no more on this relation`, true, "bad request, accepted");
          return true;
        }
        if (i === names.length) {
          await this.reply(rel, t, "silence", `${title}: the last ask`);
          break;
        }
        let name = names[i];
        if (t.knock && !t.announced) {
          // A knock that announces nothing binds nothing: a door answers it
          // `unannounced`, and the verifier writes no object to it.
          name = "unannounced";
          s.check(`${label}: the knock announces nothing, and hears unannounced`, true, "");
        }
        await this.reply(rel, t, name, label);
      }
    } catch (e) {
      if (!(e instanceof Lost)) throw e;
    }
    return true;
  }
}

async function theAsker(s) {
  const ward = await s.ward("the asker");
  const run = new AskerRun(s, ward, verifierWard("the verifier's ward"));
  const objects = [
    "an object with seen",
    "an object with at",
    "an object with seen null, padded and reordered",
    "an object whose at holds what is skipped",
    "the object null",
    "an object whose at is no array",
    "an object whose at is null",
  ];
  const still = Object.keys(REPLIES).filter((k) => REPLIES[k].read.object === undefined);
  const long = ["silence", "an object with seen"];
  still.forEach((k, i) => long.push(k, objects[i % objects.length]));
  long.push("a box of exactly the size");
  if (!(await run.relation("a knock met by silence, then every reply", long))) return;
  await run.relation("a knock met by an object", ["an object with seen null, padded and reordered", "nothing", "an object with seen", "silence"]);
  await run.relation("a knock met by nothing", ["nothing", "nothing", "an object with seen", "removed", "the object null"]);
  await run.relation("a knock met by a reply that does not open", ["a reply that does not open", "repeated", "an object with seen", "a reply signed by another key", "an object with seen"]);
  await run.interleaved("two relations answered out of order");
}

// ---------- the harness seam ----------

async function harnessErrors(v, spawnStand) {
  const scenario = "harness errors";
  const rec = (name, ok, detail) => v.record({ scenario, name, ok, detail, kind: "harness" });
  const stand = spawnStand();
  const err = async (label, line, want, id = "e") => {
    try {
      const a = await stand.raw(line, id, 15000);
      rec(`${label} is ${J(want)}`, a.error === want && a.id === id, J(a).slice(0, 200));
    } catch (e) {
      rec(`${label} is ${J(want)}`, false, e.message);
    }
  };
  const ok = async (label, fields, test) => {
    try {
      const a = await stand.request(fields);
      rec(label, test(a), J(a).slice(0, 200));
      return a;
    } catch (e) {
      rec(label, false, e.message);
      return {};
    }
  };
  const fakeWard = hex(rand(64));
  let n = 0;
  const line = (fields) => J({ id: `e${n}`, ...fields });
  const errq = (label, fields, want) => err(label, line(fields), want, `e${n++}`);
  await err("a line that is not JSON", "not json", "bad request", null);
  await err("a line that is an array", "[1]", "bad request", null);
  await err("a request with no id", J({ op: "ward", seed: "x" }), "bad request", null);
  await err("a request whose id is a number", J({ id: 5, op: "ward", seed: "x" }), "bad request", null);
  stand.proc.stdin.write("\n");
  await errq("an op none of the nine", { op: "frob" }, "no such op");
  await errq("a request with no op", {}, "bad request");
  await errq("an op that is a number", { op: 7 }, "bad request");
  await errq("ward with no seed", { op: "ward" }, "bad request");
  await errq("ward with a null seed", { op: "ward", seed: null }, "bad request");
  await errq("ward with a numeric seed", { op: "ward", seed: 5 }, "bad request");
  await errq("ward with a null reach", { op: "ward", seed: "h1", reach: null }, "bad request");
  await errq("ward with a numeric reach", { op: "ward", seed: "h1", reach: 5 }, "bad request");
  await errq("ward with a reach nobody provides", { op: "ward", seed: "h1", reach: "no such reach" }, "not reached");
  const w = await ok("ward stands", { op: "ward", seed: "h1" }, (a) => a.ward === wardKeys("h1").pk);
  await errq("the same ward again", { op: "ward", seed: "h1" }, "ward stood");
  await errq("the same ward again with an unknown reach", { op: "ward", seed: "h1", reach: "no such reach" }, "not reached");
  await errq("the same ward again with a bad reach", { op: "ward", seed: "h1", reach: 5 }, "bad request");
  await errq("an entropy request, which is none of the nine", { op: "entropy", seed: "1" }, "no such op");
  const pk = w.ward ?? fakeWard;
  const box = hex(rand(100));
  await errq("arrive at no ward", { op: "arrive", ward: fakeWard, box }, "no such ward");
  await errq("arrive at an uppercase ward", { op: "arrive", ward: pk.toUpperCase(), box }, "bad request");
  await errq("arrive at a short ward", { op: "arrive", ward: pk.slice(2), box }, "bad request");
  await errq("arrive with a numeric ward", { op: "arrive", ward: 1, box }, "bad request");
  await errq("arrive with no box", { op: "arrive", ward: pk }, "bad request");
  await errq("arrive with a null box", { op: "arrive", ward: pk, box: null }, "bad request");
  await errq("arrive with a non-hex box", { op: "arrive", ward: pk, box: "zz" }, "bad request");
  await errq("arrive with an uppercase box", { op: "arrive", ward: pk, box: "ABCD" }, "bad request");
  await errq("arrive with an odd-length box", { op: "arrive", ward: pk, box: "abc" }, "bad request");
  await errq("arrive at no ward with a bad box", { op: "arrive", ward: fakeWard, box: "zz" }, "bad request");
  await errq("invite at no ward", { op: "invite", ward: fakeWard, heir: "n" }, "no such ward");
  await errq("invite at no ward with an unknown reach", { op: "invite", ward: fakeWard, heir: "n", reach: "no such reach" }, "no such ward");
  await errq("invite at no ward with no heir", { op: "invite", ward: fakeWard }, "bad request");
  await errq("invite with no heir", { op: "invite", ward: pk }, "bad request");
  await errq("invite with a numeric heir", { op: "invite", ward: pk, heir: 5 }, "bad request");
  await errq("invite with a null heir", { op: "invite", ward: pk, heir: null }, "bad request");
  await errq("invite with a null reach", { op: "invite", ward: pk, heir: "n", reach: null }, "bad request");
  await errq("invite with an unknown reach", { op: "invite", ward: pk, heir: "n", reach: "no such reach" }, "not reached");
  await ok("invite n", { op: "invite", ward: pk, heir: "n" }, (a) => a.invitation && isHex(a.invitation.lock, 2368));
  await errq("invite n again", { op: "invite", ward: pk, heir: "n" }, "name held");
  await errq("invite n again with an unknown reach", { op: "invite", ward: pk, heir: "n", reach: "no such reach" }, "not reached");
  await errq("release at no ward", { op: "release", ward: fakeWard, heir: "n" }, "no such ward");
  await errq("release with no heir", { op: "release", ward: pk }, "bad request");
  await ok("release of a name never held answers null", { op: "release", ward: pk, heir: "m" }, (a) => "released" in a && a.released === null);
  await ok("release n answers n", { op: "release", ward: pk, heir: "n" }, (a) => a.released === "n");
  await ok("invite n again after release", { op: "invite", ward: pk, heir: "n" }, (a) => a.invitation && isHex(a.invitation.heir, 64));

  // `ask` and `read`. A kit that does not serve them answers `bad request`,
  // which comes before every other error.
  const mine = verifierWard("harness errors, the verifier's ward");
  const invitation = mint(mine).inv;
  const probe = await ok("ask with a true invitation answers a box or bad request", { op: "ask", ward: pk, invitation }, (a) => isHex(a.box) || a.error === "bad request");
  const serves = isHex(probe.box);
  const unserved = serves ? null : "bad request";
  const noWard = unserved ?? "no such ward";
  const inv = (fields) => ({ ...invitation, ...fields });
  await errq("ask at no ward", { op: "ask", ward: fakeWard, invitation }, noWard);
  await errq("ask at no ward with no invitation", { op: "ask", ward: fakeWard }, "bad request");
  await errq("ask with no invitation", { op: "ask", ward: pk }, "bad request");
  await errq("ask with a null invitation", { op: "ask", ward: pk, invitation: null }, "bad request");
  await errq("ask with a string invitation", { op: "ask", ward: pk, invitation: J(invitation) }, "bad request");
  await errq("ask with a lock one byte short", { op: "ask", ward: pk, invitation: inv({ lock: invitation.lock.slice(2) }) }, "bad request");
  await errq("ask with an uppercase lock", { op: "ask", ward: pk, invitation: inv({ lock: invitation.lock.toUpperCase() }) }, "bad request");
  await errq("ask with an heir and no secret", { op: "ask", ward: pk, invitation: inv({ secret: undefined }) }, "bad request");
  await errq("ask with a secret and no heir", { op: "ask", ward: pk, invitation: inv({ heir: undefined }) }, "bad request");
  await errq("ask with an heir and no lock", { op: "ask", ward: pk, invitation: inv({ lock: undefined }) }, "bad request");
  await errq("ask with a short ward in the invitation", { op: "ask", ward: pk, invitation: inv({ ward: invitation.ward.slice(2) }) }, "bad request");
  // A field beside the five is ignored, and an invitation with one is still an
  // invitation. An address no carrier stands is skipped, and an `at` that is
  // not an array is read as absent. A lock the modulus check of FIPS 203 section 7.2 refuses is no
  // invitation.
  if (serves) {
    await ok("ask with a sixth field in the invitation answers a box", { op: "ask", ward: pk, invitation: inv({ route: "nowhere" }) }, (a) => isHex(a.box));
    await ok("ask with an unknown scheme in at answers a box", { op: "ask", ward: pk, invitation: inv({ at: ["zz://nowhere", "tcp://[::1]:1"] }) }, (a) => isHex(a.box));
    await ok("ask with an at that is not an array answers a box", { op: "ask", ward: pk, invitation: inv({ at: "nowhere" }) }, (a) => isHex(a.box));
  }
  const highLock = Buffer.from(unhex(invitation.lock));
  highLock[0] = 0xff;
  highLock[1] |= 0x0f;
  await errq("ask with a lock of 2368 hex whose coefficient is at or above q", { op: "ask", ward: pk, invitation: inv({ lock: hex(highLock) }) }, "bad request");
  await errq("ask with a numeric method", { op: "ask", ward: pk, invitation, method: 5 }, "bad request");
  await errq("ask with a null method", { op: "ask", ward: pk, invitation, method: null }, "bad request");
  await errq("ask with args an array", { op: "ask", ward: pk, invitation, args: [] }, "bad request");
  await errq("ask with null args", { op: "ask", ward: pk, invitation, args: null }, "bad request");
  await errq("read at no ward", { op: "read", ward: fakeWard, invitation, reply: null }, noWard);
  await errq("read with no reply", { op: "read", ward: pk, invitation }, "bad request");
  await errq("read with a numeric reply", { op: "read", ward: pk, invitation, reply: 5 }, "bad request");
  await errq("read with a non-hex reply", { op: "read", ward: pk, invitation, reply: "zz" }, "bad request");
  await errq("read with no invitation", { op: "read", ward: pk, reply: null }, "bad request");
  if (serves) {
    await ok("read of nothing answers nothing", { op: "read", ward: pk, invitation, reply: null }, (a) => isDeepStrictEqual(a.read, { nothing: true }));
  }

  // `listen`, `route` and `send` of part two. A kit that carries no bytes
  // answers each with `bad request`, which comes before every other error.
  for (const scheme of ["tcp", "http", "ws"]) {
    await ok(`listen ${scheme} answers an address or bad request`, { op: "listen", scheme }, (a) => typeof a.at === "string" || a.error === "bad request");
  }
  await errq("listen of a scheme the harness does not name", { op: "listen", scheme: "zz" }, "bad request");
  await errq("listen of https, which the harness runs without TLS", { op: "listen", scheme: "https" }, "bad request");
  await errq("listen of wss, which the harness runs without TLS", { op: "listen", scheme: "wss" }, "bad request");
  await errq("listen with a numeric scheme", { op: "listen", scheme: 5 }, "bad request");
  await errq("listen with a null scheme", { op: "listen", scheme: null }, "bad request");
  const far = verifierWard("harness errors, the far ward").pk;
  // Port 9 on loopback: a route is only told, and nothing here is sent.
  const stood = [];
  for (const at of ["tcp://127.0.0.1:9", "http://127.0.0.1:9/quo", "ws://127.0.0.1:9/quo"]) {
    const a = await ok(`route to ${at} answers the far ward pk or bad request`, { op: "route", far, at }, (x) => x.routed === far || x.error === "bad request");
    if (a.routed === far) stood.push(at);
  }
  const at = stood[0] ?? "tcp://127.0.0.1:9";
  await errq("route with no far", { op: "route", at }, "bad request");
  await errq("route with a far of 126 hex", { op: "route", far: far.slice(2), at }, "bad request");
  await errq("route with an uppercase far", { op: "route", far: far.toUpperCase(), at }, "bad request");
  await errq("route with no at", { op: "route", far }, "bad request");
  await errq("route with a numeric at", { op: "route", far, at: 9 }, "bad request");
  await errq("route with an at of a scheme no carrier names", { op: "route", far, at: "zz://127.0.0.1:9" }, "bad request");
  await errq("route with an at that is host:port, no URI", { op: "route", far, at: "127.0.0.1:9" }, "bad request");
  await errq("route with an at that is an array", { op: "route", far, at: [at] }, "bad request");
  // An at that is not an address as its scheme's carrier writes one, of a scheme the kit stands.
  const malformed = {
    "tcp://127.0.0.1:9": ["a tcp address with no port", "tcp://127.0.0.1"],
    "http://127.0.0.1:9/quo": ["an http address with a fragment", "http://127.0.0.1:9/quo#f"],
    "ws://127.0.0.1:9/quo": ["a ws address with user information", "ws://u@127.0.0.1:9/quo"],
  };
  for (const good of stood) {
    const [what, bad] = malformed[good];
    await errq(`route with ${what}`, { op: "route", far, at: bad }, "bad request");
  }
  if (stood.length) {
    await ok("route of a ward no program stands is not no such ward", { op: "route", far: fakeWard, at }, (a) => a.routed === fakeWard);
  }
  const sendProbe = await ok("send at no ward answers no such ward or bad request", { op: "send", ward: fakeWard, invitation }, (a) => a.error === "no such ward" || a.error === "bad request");
  const noSendWard = sendProbe.error === "no such ward" ? "no such ward" : "bad request";
  await errq("send with no invitation", { op: "send", ward: pk }, "bad request");
  await errq("send with an heir and no lock", { op: "send", ward: pk, invitation: inv({ lock: undefined }) }, "bad request");
  await errq("send with a numeric method", { op: "send", ward: pk, invitation, method: 5 }, "bad request");
  await errq("send at no ward with null args", { op: "send", ward: fakeWard, invitation, args: null }, "bad request");
  await errq("send at no ward again", { op: "send", ward: fakeWard, invitation }, noSendWard);
  const exit = await stand.close();
  rec("stdin closed, the program exits 0", exit.code === 0, J(exit));
  rec("nothing else is written on stdout", stand.stray.length === 0, stand.stray.slice(0, 3).join(" | "));

  const e3 = spawnStand();
  const x3 = await e3.close();
  rec("a program whose stdin closes at once exits 0", x3.code === 0, J(x3));
}

// ---------- the run ----------

const SCENARIOS = [
  ["wards and invitations", wardsAndInvitations],
  ["the move", theMove],
  ["the count", theCount],
  ["at one moment", atOneMoment],
  ["the reaches", theReaches],
  ["the zero head", theZeroHead],
  ["the signature", theSignature],
  ["strangers", theStrangers],
  ["the payload", thePayload],
  ["unannounced", unannounced],
  ["removal", removal],
  ["the size", theSize],
  ["the asker", theAsker],
  ["the listener", theListener],
  ["the dialer", theDialer],
  ["the post listener", thePostListener],
  ["the post dialer", thePostDialer],
  ["the held line listener", theLineListener],
  ["the held line dialer", theLineDialer],
  ["the invitation's at", theInvitationAt],
];

export class Verifier {
  constructor(onRecord) {
    this.results = [];
    this.onRecord = onRecord ?? (() => {});
    this.arrivals = 0;
    this.judged = 0;
    this.unopened = 0;
    this.nothings = 0;
    this.boxes = 0;
    this.doorAlone = false;
    this.roles = new Map();
    this.at = new Map();
    this.frames = 0;
    this.two = false;
    this.heads = 0;
  }
  record(r) {
    this.results.push(r);
    this.onRecord(r);
  }
  /** How much was judged. A count, never a failure. */
  counts() {
    const at = [...this.at].map(([scheme, did]) => `; ${did ? "reached" : "did NOT reach"} a ward through at over ${scheme}`).join("");
    if (this.two) return `${this.frames} frames and posts carried between two programs; ${this.heads} ask heads opened at the door's side${at}`;
    const asker = this.doorAlone ? "the kit has no asking side and was judged as a door alone" : `${this.boxes} boxes the kit sealed were taken apart`;
    const roles = [...this.roles].map(([name, how]) => `; judged ${how ? "as" : "without"} ${name.startsWith("http") ? "an" : "a"} ${name}`).join("");
    const carried = `${roles}${this.frames ? `; ${this.frames} frames and posts read from the kit` : ""}${at}`;
    return `${this.arrivals} arrivals at the door: ${this.judged} replies opened, ${this.unopened} sealed to a lid nobody holds, ${this.nothings} answered nothing; ${asker}${carried}`;
  }
}

/** Runs every scenario against a stand program; returns the results and the counts. */
export async function verify({ command, args = [], cwd = process.cwd(), onRecord, only }) {
  const v = new Verifier(onRecord);
  const spawnStand = () => new Stand(command, args, cwd);
  for (const [name, fn] of SCENARIOS) {
    if (only && !only.includes(name)) continue;
    const stand = spawnStand();
    const s = new Session(v, stand, name);
    try {
      await fn(s);
    } catch (e) {
      const tail = stand.stderr.trim().split("\n").slice(-3).join(" | ");
      v.record({ scenario: name, name: "the scenario runs to its end", ok: false, detail: `${e.message}${tail ? ` (stderr: ${tail.slice(0, 300)})` : ""}`, kind: e instanceof Abort ? "harness" : "protocol" });
    }
    s.finish();
    const exit = await stand.close();
    v.record({ scenario: name, name: "the program exits 0 when stdin closes", ok: exit.code === 0, detail: J(exit), kind: "harness" });
    v.record({ scenario: name, name: "nothing else is written on stdout", ok: stand.stray.length === 0, detail: stand.stray.slice(0, 3).join(" | "), kind: "harness" });
  }
  if (!only || only.includes("harness errors")) await harnessErrors(v, spawnStand);
  return { results: v.results, counts: v.counts() };
}
