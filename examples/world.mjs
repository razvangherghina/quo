#!/usr/bin/env node
// The world: the example kits speaking Quo to each other over TCP and the
// web, in eight scenes, narrated. It shows Quo working between strangers and
// proves nothing the verifier does not. A scene fails only where it ends
// otherwise than SPEC.md says. Each kit is driven through part two of
// vectors/HARNESS.md; where a scene needs a stranger, the world is the
// stranger, and writes its boxes with the verifier's own primitives.
//   node examples/world.mjs
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";

import { Line, nothingFrame, replyFrame } from "../verifier/frame.js";
import { encaps } from "../verifier/mlkem.js";
import { aesOpen, edSign, edVerify, hkdf, x25519, x25519Pub, ZERO32 } from "../verifier/primitives.js";
import { readReply } from "../verifier/value.js";
import { newKey, payloadBytes, sealAsk, Stand } from "../verifier/verify.js";

const here = dirname(fileURLToPath(import.meta.url));
const J = JSON.stringify;
const hex = (b) => Buffer.from(b).toString("hex");
const unhex = (s) => Buffer.from(s, "hex");

const KITS = [
  ["Go", "go", "stand"],
  ["Zig", "zig", "zig-out/bin/stand"],
  ["Python", "python", "stand"],
  ["JavaScript", "javascript", "stand"],
  ["Rust", "rust", "target/debug/stand"],
];

const SCHEMES = ["tcp", "ws", "http"];

let failures = 0;
const say = (line = "") => process.stdout.write(`${line}\n`);
const expect = (what, ok, got) => {
  say(`    ${ok ? "as SPEC.md says" : "NOT as SPEC.md says"}: ${what}${ok ? "" : `, got ${got}`}`);
  if (!ok) failures++;
};
const shown = (read) => (read.object !== undefined ? `object ${J(read.object)}` : read.quo ? `the word ${read.quo}` : read.silence ? "silence" : "nothing");

// ---------- the kits ----------

class Kit {
  constructor([name, dir, stand]) {
    this.name = name;
    this.stand = new Stand(join(here, dir, stand), [], join(here, dir));
  }

  async req(fields) {
    const a = await this.stand.request(fields);
    if (a.error) throw new Error(`${this.name} answered ${fields.op} with ${a.error}`);
    return a;
  }

  /** The kit's listener of every scheme it stands; `at` is its tcp listener. */
  async start() {
    this.ats = {};
    for (const scheme of SCHEMES) {
      const a = await this.stand.request({ op: "listen", scheme });
      if (typeof a.at === "string") this.ats[scheme] = a.at;
    }
    this.at = this.ats.tcp;
    if (!this.at) throw new Error(`${this.name} holds no tcp listener`);
    this.dialed = {};
  }

  /** Whether the kit dials `scheme`: a route to a ward nobody stands answers so. */
  async dials(scheme, at) {
    if (!(scheme in this.dialed)) {
      const a = await this.stand.request({ op: "route", far: hex(randomBytes(64)), at });
      this.dialed[scheme] = typeof a.routed === "string";
    }
    return this.dialed[scheme];
  }
}

/** A ward stood in a kit, its pk split into the keys a stranger needs. */
async function ward(kit, who, reach) {
  const seed = `${who} ${hex(randomBytes(8))}`;
  const pk = (await kit.req({ op: "ward", seed, ...(reach ? { reach } : {}) })).ward;
  return { kit, who, pk, signPk: unhex(pk.slice(0, 64)), padlock: unhex(pk.slice(64)) };
}

const invite = async (w, heir, reach) => (await w.kit.req({ op: "invite", ward: w.pk, heir, ...(reach ? { reach } : {}) })).invitation;
const route = (asker, far, at) => asker.kit.req({ op: "route", far: far.pk, at });
const send = async (asker, invitation, method, args) =>
  (await asker.kit.req({ op: "send", ward: asker.pk, invitation, ...(method ? { method } : {}), ...(args ? { args } : {}) })).read;

// ---------- the stranger's hand ----------

/** Opens a reply to an ask whose lid secret the world kept: its read and its length. */
function openReply(w, box, lidSecret) {
  if (!lidSecret) return { len: box.length };
  const eph = box.subarray(0, 32);
  const agr = x25519(lidSecret, eph);
  const body = aesOpen(hkdf(agr, "quo-seal", 44), eph, box.subarray(32));
  if (!body) return { len: box.length, bad: "does not open" };
  const text = body.subarray(0, body.length - 64);
  if (!edVerify(w.signPk, text, body.subarray(body.length - 64))) return { len: box.length, bad: "not signed by the ward" };
  const r = readReply(text);
  const read = r.shape === "object" ? { object: JSON.parse(text).object } : r.shape === "word" ? { quo: r.word } : { silence: true };
  return { len: box.length, read };
}

/** An ask the world writes itself, signed by `signer`, and the reply its door gives. */
async function strangerAsk(w, { head = ZERO32, edge = ZERO32, signer = newKey(), to = "null", ct, badSig, padlock = w.padlock, raw }) {
  const line = await Line.dial(w.kit.at);
  let box = raw;
  let lidSecret;
  if (!box) {
    const payload = payloadBytes({ to, by: J(signer.hex), next: J(newKey().hex), seq: "1" }, { method: "hello", args: '{"from":"a stranger"}' });
    const sig = edSign(signer.seed, payload);
    if (badSig) sig[7] ^= 1;
    ({ box, lidSecret } = sealAsk({ padlock, head, edge, body: Buffer.concat([payload, sig]), ct }));
  }
  const f = await line.ask(unhex(w.pk), box);
  line.close();
  if (!f || f.closed || f.kind !== "reply") return { len: 0, read: { nothing: true } };
  return openReply(w, f.box, padlock === w.padlock ? lidSecret : null);
}

// ---------- the scenes ----------

async function aliceAndBob([go, , python, , rust]) {
  say("1. Alice and Bob");
  say("   Alice keeps a ward in the Go kit, Bob in the Python kit, Carol in the Rust kit.");
  const alice = await ward(go, "Alice");
  const bob = await ward(python, "Bob");
  const carol = await ward(rust, "Carol");
  await route(bob, alice, go.at);
  await route(carol, alice, go.at);
  const card = await invite(alice, "for Bob", "echo");
  say("   Alice invites Bob, and the card travels by any channel.");
  let read = await send(bob, card, "hello", { from: "Bob" });
  say(`   Bob knocks with it and hears ${shown(read)}.`);
  expect("the first knock binds, and Alice's door answers", isDeepStrictEqual(read, { object: { from: "Bob" }, seen: null }), shown(read));
  read = await send(bob, card, "again", { n: 2 });
  say(`   Bob asks again under his own key and hears ${shown(read)}.`);
  expect("Bob's relation stands", read.object?.n === 2, shown(read));
  read = await send(carol, card, "hello", { from: "Carol" });
  say(`   Carol finds the same card and knocks. She hears ${shown(read)}.`);
  expect("a spent heir is a stranger's to knock on", read.silence === true, shown(read));
  await alice.kit.req({ op: "release", ward: alice.pk, heir: "for Bob" });
  read = await send(bob, card, "still there?", {});
  say(`   Alice releases Bob. Bob asks and hears ${shown(read)}.`);
  expect("a released relation hears removed, or silence where the door kept no key", read.quo === "removed" || read.silence === true, shown(read));
  return { alice, bob, card };
}

async function bothWays([, zig, , javascript]) {
  say("2. Both ways");
  say("   Dana keeps a ward in the Zig kit, Eli in the JavaScript kit. Each invites the other.");
  const dana = await ward(zig, "Dana");
  const eli = await ward(javascript, "Eli");
  await route(dana, eli, javascript.at);
  await route(eli, dana, zig.at);
  const toDana = await invite(dana, "for Eli", "marked");
  const toEli = await invite(eli, "for Dana", "marked");
  const a = await send(eli, toDana, "ask Dana", { from: "Eli" });
  const b = await send(dana, toEli, "ask Eli", { from: "Dana" });
  say(`   Eli asks Dana and hears ${shown(a)}, seen ${J(a.seen)}. Dana asks Eli and hears ${shown(b)}, seen ${J(b.seen)}.`);
  expect("two relations, one each way, in two languages", a.object?.from === "Eli" && b.object?.from === "Dana" && a.seen === "1" && b.seen === "1", `${shown(a)} and ${shown(b)}`);
}

async function ring(kits) {
  say("3. The ring");
  say("   One ward in each kit. Each is invited by the next, and a note travels all the way round.");
  const wards = [];
  for (const k of kits) wards.push(await ward(k, `ring ${k.name}`));
  let note = { path: [] };
  for (let i = 0; i < wards.length; i++) {
    const from = wards[i];
    const to = wards[(i + 1) % wards.length];
    await route(from, to, to.kit.at);
    const card = await invite(to, `from ${from.kit.name}`, "echo");
    const read = await send(from, card, "pass", { path: [...note.path, from.kit.name] });
    say(`   ${from.kit.name} hands the note to ${to.kit.name}: ${J(read.object)}`);
    if (!read.object) {
      expect(`${to.kit.name} answers ${from.kit.name}`, false, shown(read));
      return;
    }
    note = read.object;
  }
  expect("the note came back round through all five kits", note.path.length === kits.length, J(note));
}

async function mesh(kits) {
  say("4. The mesh");
  say("   Every kit asks every other kit, on a relation of its own.");
  const wards = [];
  for (const k of kits) wards.push(await ward(k, `mesh ${k.name}`));
  say(`   ${"asks ↓ answers →".padEnd(18)}${kits.map((k) => k.name.padEnd(11)).join("")}`);
  let all = true;
  for (const a of wards) {
    let row = `   ${a.kit.name.padEnd(18)}`;
    for (const b of wards) {
      if (a === b) {
        row += "·".padEnd(11);
        continue;
      }
      await route(a, b, b.kit.at);
      const card = await invite(b, `from ${a.kit.name}`, "echo");
      const read = await send(a, card, "hi", { from: a.kit.name, to: b.kit.name });
      const ok = read.object?.from === a.kit.name && read.object?.to === b.kit.name;
      all &&= ok;
      row += (ok ? "answered" : shown(read)).padEnd(11);
    }
    say(row);
  }
  expect("twenty relations, every one answered", all, "a cell above");
}

async function frontDesk([, , python]) {
  say("5. The front desk");
  say("   Fay keeps a ward in the Python kit that answers its zero head. Anyone may ask there, with no card.");
  const fay = await ward(python, "Fay", "echo");
  const signer = newKey();
  const payload = payloadBytes({ to: "null", by: J(signer.hex), next: "null", seq: "1" }, { method: "hours", args: '{"asked":"when are you open"}' });
  const { box, lidSecret } = sealAsk({ padlock: fay.padlock, head: ZERO32, edge: ZERO32, body: Buffer.concat([payload, edSign(signer.seed, payload)]) });
  const once = openReply(fay, await rawReply(fay, box), lidSecret);
  const twice = openReply(fay, await rawReply(fay, box), lidSecret);
  say(`   A passer-by asks, and hears ${shown(once.read ?? {})}.`);
  say(`   The same sealed bytes, sent again, are answered again: ${shown(twice.read ?? {})}.`);
  const asked = (r) => r.read?.object?.asked === "when are you open";
  expect("the zero head answers, keeps nothing, and answers the same bytes twice", asked(once) && asked(twice), `${shown(once.read ?? {})}, then ${shown(twice.read ?? {})}`);
  return fay;
}

async function rawReply(w, box) {
  const line = await Line.dial(w.kit.at);
  const f = await line.ask(unhex(w.pk), box);
  line.close();
  return f?.box ?? Buffer.alloc(0);
}

async function mallory({ alice, card }, fay) {
  say("6. Mallory");
  say("   Mallory tries Alice's and Fay's doors every way she can think of.");
  const inv = card;
  const lengths = [];
  const tryOne = async (what, w, o) => {
    const r = await strangerAsk(w, o);
    lengths.push(r.len);
    say(`   ${what}: ${r.len} bytes${r.read ? `, reading ${shown(r.read)}` : ", sealed to a lid she does not hold"}.`);
    return r;
  };
  await tryOne("noise", alice, { raw: randomBytes(300) });
  await tryOne("a box sealed to someone else's padlock", alice, { padlock: x25519Pub(randomBytes(32)) });
  await tryOne("an ask naming an heir Alice never made", alice, { head: randomBytes(32), to: J(hex(randomBytes(32))) });
  const heirPk = unhex(inv.heir);
  const { key, ct } = encaps(unhex(inv.lock));
  const signer = { seed: unhex(inv.secret), hex: inv.heir };
  await tryOne("Bob's old card, knocked again after Bob took it", alice, { head: heirPk, to: J(inv.heir), edge: hkdf(key, "quo-lock", 32), ct, signer });
  await tryOne("a forged signature at Fay's front desk", fay, { badSig: true });
  expect("every stranger's reply is one length, 128 bytes", lengths.every((n) => n === 128), lengths.join(", "));
}

async function lostReply([, , , javascript, rust]) {
  say("7. The lost reply");
  say("   Gus keeps a ward in the Rust kit, Hal in the JavaScript kit. The world stands between them and loses one reply.");
  const gus = await ward(rust, "Gus");
  const hal = await ward(javascript, "Hal");
  const up = await Line.dial(rust.at);
  let dropNext = false;
  const server = createServer({ noDelay: true }, (socket) => {
    const line = new Line(socket);
    line.onFrame = async (f) => {
      if (f.kind !== "ask") return;
      const r = await up.ask(f.pk, f.box);
      if (dropNext) {
        dropNext = false;
        line.write(nothingFrame(f.id));
      } else line.write(r?.kind === "reply" ? replyFrame(f.id, r.box) : nothingFrame(f.id));
    };
  });
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  await route(hal, gus, `tcp://127.0.0.1:${server.address().port}`);
  const card = await invite(gus, "for Hal", "echo");
  let read = await send(hal, card, "first", { n: 1 });
  say(`   Hal knocks and hears ${shown(read)}.`);
  dropNext = true;
  read = await send(hal, card, "second", { n: 2 });
  say(`   Hal asks again. Gus's door answers and moves its keys, but the world loses the reply: Hal hears ${shown(read)}.`);
  read = await send(hal, card, "third", { n: 3 });
  say(`   Hal asks once more, under the key he still holds, and hears ${shown(read)}.`);
  expect("a lost reply loses nothing: the door still opens the key the asker kept", read.object?.n === 3, shown(read));
  up.close();
  server.close();
}

async function cardSaysWhere(kits) {
  say("8. The card says where");
  say("   Alice keeps a ward in each kit, and her card names her door in at. A friend in the next kit holds the card and no route.");
  const outcomes = new Map(kits.map((k) => [k.name, { reached: [], missed: [] }]));
  let departed = false;
  for (const [i, home] of kits.entries()) {
    const guest = kits[(i + 1) % kits.length];
    for (const scheme of SCHEMES) {
      const door = home.ats[scheme];
      if (!door || !(await guest.dials(scheme, door))) continue;
      const alice = await ward(home, `Alice in ${home.name}, over ${scheme}`);
      const friend = await ward(guest, `a friend in ${guest.name}, over ${scheme}`);
      const card = await invite(alice, "for a friend", "echo");
      // The world writes the card's at with the one address this pass is about.
      const read = await send(friend, { ...card, at: [door] }, "where", { over: scheme });
      const o = outcomes.get(guest.name);
      if (read.object?.over === scheme) {
        o.reached.push(scheme);
        say(`   ${guest.name} reads ${door} on the card and reaches Alice in ${home.name} over ${scheme}.`);
      } else if (read.nothing) {
        o.missed.push(scheme);
        say(`   ${guest.name} holds the card with ${scheme} in at and hears nothing.`);
      } else {
        departed = true;
        say(`   ${guest.name} asks Alice in ${home.name} over ${scheme} and hears ${shown(read)}.`);
      }
    }
  }
  const readers = [...outcomes].filter(([, o]) => o.reached.length).map(([n, o]) => `${n} (${o.reached.join(", ")})`);
  const nonReaders = [...outcomes].filter(([, o]) => !o.reached.length && o.missed.length).map(([n]) => n);
  const mixed = [...outcomes].filter(([, o]) => o.reached.length && o.missed.length).map(([n, o]) => `${n} missed ${o.missed.join(", ")}`);
  say(`   Kits that reached a door through at: ${readers.join(", ") || "none"}.`);
  say(`   Kits that read no at: ${nonReaders.join(", ") || "none"}.`);
  // Reading at is the kit's (KIT-SPEC.md question 25). A kit that reads it
  // and then hears nothing over a scheme it dials has not reached a door that answers.
  expect("each friend reaches Alice through her card, or reads no at at all", !departed && mixed.length === 0, [...mixed, departed ? "a read other than an object or nothing" : ""].filter(Boolean).join("; "));
}

// ---------- the run ----------

const kits = KITS.map((k) => new Kit(k));
try {
  await Promise.all(kits.map((k) => k.start()));
  say(`The world: ${kits.map((k) => `${k.name} at ${Object.values(k.ats).join(" ")}`).join(", ")}.`);
  say();
  const first = await aliceAndBob(kits);
  say();
  await bothWays(kits);
  say();
  await ring(kits);
  say();
  await mesh(kits);
  say();
  const fay = await frontDesk(kits);
  say();
  await mallory(first, fay);
  say();
  await lostReply(kits);
  say();
  await cardSaysWhere(kits);
  say();
} catch (e) {
  failures++;
  say(`The world stopped: ${e.message}`);
} finally {
  await Promise.all(kits.map((k) => k.stand.close()));
}
say(failures ? `world: ${failures} scene${failures === 1 ? "" : "s"} ended otherwise than SPEC.md says` : "world: every scene ended as SPEC.md says");
process.exit(failures ? 1 : 0);
