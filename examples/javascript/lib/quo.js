// The ward, its door, and its standing side.
import {
  sha256, hkdf, edSecret, xSecret, hex, fromHex, isHex, isZero, agree, open, verify, draw,
  makeLock, lockPub, lockOk, decapsulate, ZERO32, SIZE,
} from "./crypto.js";
import { sealAsk, sealReply, openReply, nobodyLid, edgeSealKey, knockEdge, follow, CT_LEN } from "./box.js";
import { utf8, parse, compact, NotValue } from "./json.js";

const MAX_COUNT = 2n ** 53n - 1n;
export const SILENCE = Buffer.from('{"silence":true}');
export const WORDS = ["removed", "unannounced", "repeated"];
const isPk = (s) => isHex(s, 64) && !/^0{64}$/.test(s);
const isCount = (t) => /^[1-9]\d{0,15}$/.test(t) && BigInt(t) <= MAX_COUNT;

export function seedBytes(seed) {
  if ((Buffer.isBuffer(seed) || seed instanceof Uint8Array) && seed.length === 32) return Buffer.from(seed);
  if (typeof seed === "string") return sha256(Buffer.from(seed, "utf8"));
  return sha256(Buffer.from(seed));
}

export function wardKeys(seed) {
  const s = seedBytes(seed);
  const signer = edSecret(hkdf(s, "quo-ward-sign", 32));
  const sealer = xSecret(hkdf(s, "quo-ward-seal", 32));
  return { signer, sealer, pk: hex(signer.pub) + hex(sealer.pub) };
}

// An invitation read from a plain object. Returns null when it is no invitation.
export function readInvitation(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const { ward, heir, secret, lock } = o;
  if (!isHex(ward, 128) || !isHex(heir, 64) || !isHex(secret, 64) || !isHex(lock, 2368)) return null;
  if (!lockOk(fromHex(lock))) return null;
  // An `at` that is not an array is read as absent; its entries are judged when dialed.
  return Array.isArray(o.at) ? { ward, heir, secret, lock, at: o.at } : { ward, heir, secret, lock };
}

// The payload judged: case 2 or case 3, or the fields.
export function judgePayload(bytes, headHex) {
  let node;
  let text;
  try {
    text = utf8(bytes);
    node = parse(text);
  } catch (e) {
    if (e instanceof NotValue) return { refuse: 2 };
    throw e;
  }
  if (node.t !== "object") return { refuse: 2 };
  const f = node.fields;
  const to = f.get("to");
  const by = f.get("by");
  const next = f.get("next");
  const seq = f.get("seq");
  const method = f.get("method");
  const args = f.get("args");
  if (!to || !by || !next || !seq) return { refuse: 3 };
  if (headHex === null ? to.t !== "null" : to.t !== "string" || to.v !== headHex) return { refuse: 3 };
  if (headHex !== null && !isPk(to.v)) return { refuse: 3 };
  if (by.t !== "string" || !isPk(by.v)) return { refuse: 3 };
  if (!(next.t === "null" || (next.t === "string" && isPk(next.v)))) return { refuse: 3 };
  if (seq.t !== "number" || !isCount(text.slice(seq.s, seq.e))) return { refuse: 3 };
  if (method && method.t !== "string") return { refuse: 3 };
  if (args && args.t !== "object") return { refuse: 3 };
  return {
    by: by.v,
    next: next.t === "null" ? null : next.v,
    seq: Number(text.slice(seq.s, seq.e)),
    method: method ? method.v : undefined,
    args: args ? text.slice(args.s, args.e) : undefined,
    unread: args?.repeated === true, // this kit does not read args that repeat a key among its own keys
  };
}

// Writes a reply text. `object` is raw JSON text, vouched for by what stands behind the door.
export function objectText(object, seen) {
  return Buffer.from(`{"object":${object},"seen":${seen === null ? "null" : JSON.stringify(seen)}}`);
}

// What stands behind a door: a function of an arrival giving { object, seen } or null for silence.
// `args` arrives as the raw text of a JSON object, at any depth; `unread` marks args the kit does not read.
// The describe every reach but silent gives the empty ask: no entry, no lang.
const describeNone = '{"asks":[]}';
const echo = (seen) => (a) => {
  if (a.method === undefined) return { object: describeNone, seen };
  return a.unread ? null : { object: a.args ?? "{}", seen };
};
export const reaches = {
  echo: echo(null),
  marked: echo("1"),
  null: (a) => ({ object: a.method === undefined ? describeNone : "null", seen: null }),
  silent: () => null,
};

export class Ward {
  constructor(seed, { zero = null, log = () => {} } = {}) {
    const k = wardKeys(seed);
    this.signer = k.signer;
    this.sealer = k.sealer;
    this.pk = k.pk;
    this.lock = makeLock();
    this.lockHex = hex(lockPub(this.lock));
    this.zero = zero;
    this.log = log;
    this.heirs = new Map(); // heir hex -> relation
    this.removed = new Map(); // heir hex -> kept keys, or null when stopped while fresh
    this.standings = new Map();
  }

  // Makes a heir and gives its invitation. The ward keeps the heir pk, not the secret.
  // `at` is the addresses the ward is reached at, the preferred first; none writes no `at`.
  invite(reach = reaches.echo, at = []) {
    const heir = edSecret(draw(32));
    const heirHex = hex(heir.pub);
    this.heirs.set(heirHex, { fresh: true, reach });
    const inv = { ward: this.pk, heir: heirHex, secret: hex(heir.seed), lock: this.lockHex };
    return at.length ? { ...inv, at: [...at] } : inv;
  }

  release(heirHex) {
    const r = this.heirs.get(heirHex);
    if (!r) return false;
    this.heirs.delete(heirHex);
    this.removed.set(heirHex, r.fresh ? null : { H: r.H, V: r.V, O: r.O, F: r.F });
    return true;
  }

  refuse(lid, why) {
    this.log(`refused: ${why}`);
    return sealReply({ lid: lid ?? nobodyLid(), text: SILENCE, signer: this.signer }).box;
  }

  // The door: bytes in, bytes out. This door always answers.
  arrive(box) {
    box = Buffer.from(box);
    if (box.length < 32) return this.refuse(null, "case 1: short");
    const lid = box.subarray(0, 32);
    const a = agree(this.sealer, lid);
    if (isZero(a)) return this.refuse(null, "case 1: lid takes no seal");
    if (box.length > SIZE) return this.refuse(lid, "case 1: above the size");
    const head = box.length >= 80 ? open(hkdf(a, "quo-seal", 44), box.subarray(32, 80), lid) : null;
    if (!head) return this.refuse(lid, "case 1: head");
    const zeroHead = isZero(head);
    const heirHex = zeroHead ? null : hex(head);
    const rel = zeroHead ? null : this.heirs.get(heirHex);
    const kept = zeroHead || rel ? undefined : this.removed.get(heirHex);
    let rest = box.subarray(80);
    let edges;
    if (rel && rel.fresh) {
      if (rest.length < CT_LEN) return this.refuse(lid, "case 1: no ciphertext");
      const ss = decapsulate(this.lock, rest.subarray(0, CT_LEN));
      if (!ss) return this.refuse(lid, "case 1: ciphertext");
      edges = [knockEdge(ss)];
      rest = rest.subarray(CT_LEN);
    } else if (rel) edges = [rel.O, rel.F];
    else if (kept) edges = [kept.O, kept.F];
    else edges = [ZERO32];
    if (rest.length <= 16 + 64) return this.refuse(lid, "case 1: body too short");
    let body = null;
    let under = null;
    for (const e of edges) {
      body = open(edgeSealKey(a, e), rest, lid);
      if (body) {
        under = e;
        break;
      }
    }
    if (!body) return this.refuse(lid, "case 1: body opens under no edge key");
    const text = body.subarray(0, body.length - 64);
    const sig = body.subarray(body.length - 64);
    const p = judgePayload(text, heirHex);
    if (p.refuse) return this.refuse(lid, `case ${p.refuse}: payload`);
    const arrival = { method: p.method, args: p.args, unread: p.unread, by: p.by, heir: heirHex };

    if (zeroHead) {
      if (!this.zero) return this.refuse(lid, "case 4: nothing answers the zero head");
      if (!verify(fromHex(p.by), text, sig)) return this.refuse(lid, "case 5: signature");
      return this.answer(lid, this.zero(arrival)).box;
    }
    if (!rel && !kept) return this.refuse(lid, "case 6: heir not held");
    let signedBy;
    if (rel && rel.fresh) signedBy = p.by === heirHex ? "heir" : null;
    else {
      const keys = rel ?? kept;
      signedBy = p.by === keys.H ? "H" : keys.V !== null && p.by === keys.V ? "V" : null;
    }
    if (!signedBy) return this.refuse(lid, "case 7: key not admitted");
    if (!verify(fromHex(p.by), text, sig)) return this.refuse(lid, "case 8: signature");
    if (kept) return this.word(lid, "removed");
    const announces = p.next !== null && p.next !== heirHex && p.next !== p.by ? p.next : null;
    if (rel.fresh && announces === null) return this.word(lid, "unannounced");
    // This door honours no number below the highest, so every choice here is on a number above it.
    if (!rel.fresh && !(p.seq > rel.high)) return this.word(lid, "repeated");

    // A choice. This door judges one ask at a time: nothing moved since the checks.
    const reply = this.answer(lid, rel.reach(arrival));
    const nextEdge = follow(under, reply.agreement);
    if (rel.fresh) {
      Object.assign(rel, { fresh: false, H: announces, V: null, O: under, F: nextEdge, high: p.seq });
    } else {
      const H = signedBy === "H" ? rel.H : rel.V;
      const V = announces !== null ? announces : signedBy === "H" ? rel.V : null;
      Object.assign(rel, { H, V, O: under, F: nextEdge, high: p.seq });
    }
    return reply.box;
  }

  word(lid, w) {
    this.log(`word: ${w}`);
    return sealReply({ lid, text: Buffer.from(`{"quo":"${w}"}`), signer: this.signer }).box;
  }

  answer(lid, out) {
    return sealReply({ lid, text: out ? objectText(out.object, out.seen) : SILENCE, signer: this.signer });
  }

  // The standing side of this ward on one invitation.
  standing(inv) {
    const key = `${inv.ward}/${inv.heir}/${inv.secret}/${inv.lock}`;
    let s = this.standings.get(key);
    if (!s) this.standings.set(key, (s = new Standing(inv)));
    return s;
  }
}

// Reads a reply box. Returns { kind, ... }.
export function readReply(box, lidSecret, signPub) {
  if (box === null) return { kind: "nothing" };
  const r = openReply(box, lidSecret);
  if (!r) return { kind: "silence" };
  // The ward's signing key over the lid of this ask, then the reply text.
  if (!verify(signPub, Buffer.concat([r.lid, r.text]), r.sig)) return { kind: "silence" };
  let node;
  let text;
  try {
    text = utf8(r.text);
    node = parse(text);
  } catch {
    return { kind: "silence" };
  }
  if (node.t !== "object") return { kind: "silence" };
  const keys = [...node.fields.keys()].sort().join(",");
  const f = node.fields;
  if (keys === "object,seen") {
    const seen = f.get("seen");
    if (!(seen.t === "null" || seen.t === "string")) return { kind: "silence" };
    return { kind: "object", node: f.get("object"), text, seen: seen.v, agreement: r.agreement };
  }
  if (keys === "quo") {
    const w = f.get("quo");
    if (w.t === "string" && WORDS.includes(w.v)) return { kind: "word", word: w.v };
  }
  return { kind: "silence" };
}

// One relation seen from the standing. It moves on an object to an ask numbered above
// every ask it has moved on, and on nothing else.
export class Standing {
  constructor(inv) {
    this.inv = inv;
    this.padlock = fromHex(inv.ward.slice(64));
    this.wardSign = fromHex(inv.ward.slice(0, 64));
    this.signer = edSecret(fromHex(inv.secret)); // the heir, until the knock binds
    this.phase = "fresh"; // fresh | uncertain | bound
    this.edge = null;
    this.seq = 0;
    this.moved = 0; // the highest number an object moved this standing on
    this.knock = null;
    this.probeNext = true;
    this.last = null;
    this.chain = Promise.resolve();
  }

  payload(by, next, method, args) {
    let s = `{"to":"${this.inv.heir}","by":"${hex(by)}","next":"${hex(next)}","seq":${++this.seq}`;
    if (method !== undefined) s += `,"method":${JSON.stringify(method)}`;
    if (args !== undefined) s += `,"args":${args}`;
    return Buffer.from(s + "}");
  }

  // Seals the next ask. `args` is raw JSON text or undefined.
  ask(method, args) {
    const head = fromHex(this.inv.heir);
    if (this.phase === "uncertain" && !this.probeNext) {
      this.probeNext = true;
      this.last = this.knock;
      return this.knock.box;
    }
    const announce = edSecret(draw(32));
    if (this.phase === "fresh") {
      const payload = this.payload(this.signer.pub, announce.pub, method, args);
      const r = sealAsk({ padlock: this.padlock, head, lockEk: fromHex(this.inv.lock), payload, signer: this.signer });
      this.knock = { box: r.box, lidSecret: r.lidSecret, edge: r.edge, announce, seq: this.seq, kind: "knock" };
      this.edge = r.edge;
      this.signer = announce; // the heir dies at the knock; the own key signs from now on
      this.phase = "uncertain";
      this.probeNext = true;
      this.last = this.knock;
      return r.box;
    }
    const payload = this.payload(this.signer.pub, announce.pub, method, args);
    const r = sealAsk({ padlock: this.padlock, head, edge: this.edge, payload, signer: this.signer });
    const kind = this.phase === "uncertain" ? "probe" : "ask";
    if (kind === "probe") this.probeNext = false;
    this.last = { box: r.box, lidSecret: r.lidSecret, edge: r.edge, announce, seq: this.seq, kind };
    return r.box;
  }

  // Reads the reply to the last ask, and moves on an object.
  read(box) {
    const last = this.last;
    if (!last) return null;
    const r = readReply(box, last.lidSecret, this.wardSign);
    if (r.kind === "object" && last.seq > this.moved) {
      this.moved = last.seq;
      this.phase = "bound";
      this.signer = last.announce;
      this.edge = follow(last.edge, r.agreement);
    } else if (r.kind === "word" && last.kind === "probe") {
      this.phase = "bound";
    } else if (last.kind === "knock" && this.phase === "uncertain") {
      // Nothing: the knock was not delivered, so send it again. Silence: probe first.
      this.probeNext = r.kind !== "nothing";
    }
    return r;
  }
}

// The harness shape of a read, as one JSON text with the object kept as it was written.
export function readJSON(r) {
  if (r.kind === "nothing") return '{"nothing":true}';
  if (r.kind === "silence") return '{"silence":true}';
  if (r.kind === "word") return `{"quo":${JSON.stringify(r.word)}}`;
  return `{"object":${compact(r.node, r.text)},"seen":${r.seen === null ? "null" : JSON.stringify(r.seen)}}`;
}
