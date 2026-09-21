import { test } from "node:test";
import assert from "node:assert/strict";
import { Ward, Standing, reaches, readReply } from "../lib/quo.js";
import { sealAsk, follow, openReply } from "../lib/box.js";
import { edSecret, draw, hex, fromHex, xSecret, agree, hkdf, seal, sign, ZERO32 } from "../lib/crypto.js";

const setup = (reach, zero = null) => {
  const w = new Ward(draw(32), { zero });
  const inv = w.invite(reach);
  return { w, inv, s: new Standing(inv) };
};
const read = (s, box) => {
  const r = s.read(box);
  return r.kind === "object" ? { object: r.text.slice(r.node.s, r.node.e), seen: r.seen } : r;
};

test("box lengths", () => {
  const { w, inv, s } = setup();
  const knock = s.ask("m", '{"a":1}');
  const payloadLen = knock.length - 1248;
  assert.equal(payloadLen, Buffer.from(`{"to":"${inv.heir}","by":"${inv.heir}","next":"${"0".repeat(64)}","seq":1,"method":"m","args":{"a":1}}`).length);
  const reply = w.arrive(knock);
  const text = `{"object":{"a":1},"seen":null}`;
  assert.equal(reply.length, text.length + 112);
  assert.equal(s.ask("m", undefined).length - 160, Buffer.from(`{"to":"${inv.heir}","by":"${inv.heir}","next":"${inv.heir}","seq":2,"method":"m"}`).length);
});

test("knock, then asks, both tables walk", () => {
  const { w, s } = setup(reaches.marked);
  assert.deepEqual(read(s, w.arrive(s.ask("m", '{"x": [1, 2]}'))), { object: '{"x": [1, 2]}', seen: "1" });
  assert.equal(s.phase, "bound");
  for (let i = 0; i < 5; i++) assert.deepEqual(read(s, w.arrive(s.ask(undefined, undefined))), { object: "{}", seen: null });
});

test("unannounced knock binds nothing", () => {
  const { w, inv } = setup();
  const heir = edSecret(fromHex(inv.secret));
  const payload = Buffer.from(`{"to":"${inv.heir}","by":"${inv.heir}","next":null,"seq":1}`);
  const r = sealAsk({ padlock: fromHex(inv.ward.slice(64)), head: fromHex(inv.heir), lockEk: fromHex(inv.lock), payload, signer: heir });
  const rr = readReply(w.arrive(r.box), r.lidSecret, fromHex(inv.ward.slice(0, 64)));
  assert.deepEqual(rr, { kind: "word", word: "unannounced" });
  assert.equal(w.heirs.get(inv.heir).fresh, true);
});

test("replayed ask is repeated; replayed knock is a stranger's", () => {
  const { w, s } = setup();
  const knock = s.ask("m", undefined);
  read(s, w.arrive(knock));
  const a = s.ask("m", undefined);
  assert.equal(read(s, w.arrive(a)).object, "{}");
  assert.deepEqual(read(s, w.arrive(a)), { kind: "word", word: "repeated" });
  const again = w.arrive(knock);
  assert.equal(readReply(again, s.knock.lidSecret, s.wardSign).kind, "silence");
});

test("silence on a knock: the probe finds the binding", () => {
  const { w, s } = setup(reaches.silent);
  assert.equal(read(s, w.arrive(s.ask("m"))).kind, "silence");
  w.heirs.get(s.inv.heir).reach = reaches.echo;
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}");
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}");
});

test("knock not delivered: the same knock bytes go again and bind", () => {
  const { w, s } = setup();
  const knock = s.ask("m"); // never delivered
  assert.equal(read(s, null).kind, "nothing");
  const again = s.ask("m");
  assert.deepEqual(again, knock);
  assert.equal(read(s, w.arrive(again)).object, "{}");
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}");
});

test("knock heard, reply garbled: probe opens, then asks go on", () => {
  const { w, s } = setup();
  w.arrive(s.ask("m"));
  assert.equal(read(s, Buffer.alloc(200)).kind, "silence");
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}"); // probe under own key and knock edge
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}");
});

test("knock not heard, reply garbled: probe fails, knock resent binds", () => {
  const { w, s } = setup();
  s.ask("m");
  assert.equal(read(s, Buffer.alloc(200)).kind, "silence");
  assert.equal(read(s, w.arrive(s.ask("m"))).kind, "silence"); // probe does not open
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}"); // the same knock bytes
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}");
});

test("lost reply: door moved, standing did not, still admitted", () => {
  const { w, s } = setup();
  read(s, w.arrive(s.ask("m")));
  w.arrive(s.ask("m"));
  read(s, null);
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}");
  assert.equal(read(s, w.arrive(s.ask("m"))).object, "{}");
});

test("release: fresh is a stranger, spent hears removed", () => {
  const a = setup();
  a.w.release(a.inv.heir);
  assert.equal(read(a.s, a.w.arrive(a.s.ask("m"))).kind, "silence");
  const b = setup();
  read(b.s, b.w.arrive(b.s.ask("m")));
  b.w.release(b.inv.heir);
  assert.deepEqual(read(b.s, b.w.arrive(b.s.ask("m"))), { kind: "word", word: "removed" });
});

test("strangers: garbage, short, wrong key, zero head", () => {
  const { w, inv, s } = setup(reaches.echo);
  const signPub = fromHex(inv.ward.slice(0, 64));
  const lid = xSecret(draw(32));
  const garbage = Buffer.concat([lid.pub, draw(300)]);
  assert.equal(readReply(w.arrive(garbage), lid, signPub).kind, "silence");
  assert.equal(w.arrive(Buffer.alloc(3)).length, 16 + 112);
  assert.equal(w.arrive(Buffer.alloc(40)).length, 16 + 112); // zero lid takes no seal
  read(s, w.arrive(s.ask("m")));
  // A stranger key on a spent heir.
  const k = edSecret(draw(32));
  const p = Buffer.from(`{"to":"${inv.heir}","by":"${hex(k.pub)}","next":null,"seq":9}`);
  const r = sealAsk({ padlock: fromHex(inv.ward.slice(64)), head: fromHex(inv.heir), edge: s.edge, payload: p, signer: k });
  const rep = w.arrive(r.box);
  assert.equal(rep.length, 16 + 112);
  assert.equal(readReply(rep, r.lidSecret, signPub).kind, "silence");
  // Zero head, nothing answers: case 4.
  const zp = Buffer.from(`{"to":null,"by":"${hex(k.pub)}","next":null,"seq":1,"method":"x"}`);
  const z = sealAsk({ padlock: fromHex(inv.ward.slice(64)), head: ZERO32, edge: ZERO32, payload: zp, signer: k });
  assert.equal(readReply(w.arrive(z.box), z.lidSecret, signPub).kind, "silence");
});

test("zero head answered, twice, and signature checked", () => {
  const w = new Ward("zero", { zero: reaches.echo });
  const k = edSecret(draw(32));
  const signPub = w.signer.pub;
  const zp = Buffer.from(`{"to":null,"by":"${hex(k.pub)}","next":null,"seq":1,"method":"x","args":{"q":1e21}}`);
  const z = sealAsk({ padlock: w.sealer.pub, head: ZERO32, edge: ZERO32, payload: zp, signer: k });
  for (let i = 0; i < 2; i++) {
    const r = readReply(w.arrive(z.box), z.lidSecret, signPub);
    assert.equal(r.kind, "object");
    assert.equal(r.text.slice(r.node.s, r.node.e), '{"q":1e21}');
  }
  const other = edSecret(draw(32));
  const bad = sealAsk({ padlock: w.sealer.pub, head: ZERO32, edge: ZERO32, payload: zp, signer: other });
  assert.equal(readReply(w.arrive(bad.box), bad.lidSecret, signPub).kind, "silence");
});

test("payload refusals", () => {
  const w = new Ward("p", { zero: reaches.echo });
  const k = edSecret(draw(32));
  const by = hex(k.pub);
  const tryP = (p) => {
    const z = sealAsk({ padlock: w.sealer.pub, head: ZERO32, edge: ZERO32, payload: Buffer.from(p), signer: k });
    return readReply(w.arrive(z.box), z.lidSecret, w.signer.pub).kind;
  };
  assert.equal(tryP(`{"to":null,"by":"${by}","next":null,"seq":1}`), "object");
  // A payload's bytes beyond ASCII reach what answers exactly as they arrived.
  assert.equal(tryP(`{"to":null,"by":"${by}","next":null,"seq":1,"method":"m","args":{"v":"\\uffff\uffff\\ud83d\\ude00😀"}}`), "object");
  for (const p of [
    `{"to":null,"by":"${by}","next":null,"seq":1.0}`,
    `{"to":null,"by":"${by}","next":null,"seq":1e0}`,
    `{"to":null,"by":"${by}","next":null,"seq":0}`,
    `{"to":null,"by":"${by}","next":null,"seq":1.5}`,
    `{"to":null,"by":"${by}","next":null,"seq":9007199254740992}`,
    `{"to":null,"by":"${by}","next":null,"seq":"1"}`,
    `{"to":null,"by":"${by}","seq":1}`,
    `{"to":null,"by":"${by.toUpperCase()}","next":null,"seq":1}`,
    `{"to":null,"by":"${"0".repeat(64)}","next":null,"seq":1}`,
    `{"to":null,"by":"${by}","next":null,"seq":1,"method":null}`,
    `{"to":null,"by":"${by}","next":null,"seq":1,"args":[]}`,
    `{"to":null,"by":"${by}","by":"${by}","next":null,"seq":1}`,
    `{"to":"${by}","by":"${by}","next":null,"seq":1}`,
    `[1]`,
    `{"to":null,"by":"${by}","next":null,"seq":1,"x":${"[".repeat(65)}${"]".repeat(64)}}`,
    `{"to":null,"by":"${by}","next":null,"seq":1,"method":"m","args":{"k":1,"k":2}}`, // the kit's choice: not read
  ])
    assert.equal(tryP(p), "silence", p);
  // Numbers are carried as written; args and fields beside the six at any depth; repeats inside args are JSON's.
  for (const x of ["-0", "1e400", "9007199254740993", `${"[".repeat(5000)}${"]".repeat(5000)}`, '{"a":1,"a":2}', '"\\ud800"'])
    assert.equal(tryP(`{"to":null,"by":"${by}","next":null,"seq":1,"x":${x},"method":"m","args":{"a":${x}}}`), "object", x);
  assert.equal(tryP(`{"to":null,"by":"${by}","next":null,"seq":9007199254740991}`), "object");
  assert.equal(tryP(`  {"to":null,"by":"${by}","next":null,"seq":1}\n`), "object");
});

test("a reply's signature covers the lid, then the reply text", () => {
  const { w, inv, s } = setup();
  const signPub = fromHex(inv.ward.slice(0, 64));
  const ask = s.ask("m");
  const lid = s.last.lidSecret;
  assert.equal(readReply(w.arrive(ask), lid, signPub).kind, "object");
  // A reply the ward signed over its reply text alone, or over another ask's lid, reads as silence.
  const text = Buffer.from('{"object":1,"seen":null}');
  const write = (msg) => {
    const e = xSecret(draw(32));
    const a = agree(e, lid.pub);
    const body = Buffer.concat([text, sign(w.signer, msg)]);
    return Buffer.concat([e.pub, seal(hkdf(a, "quo-seal", 44), body, e.pub)]);
  };
  assert.equal(readReply(write(Buffer.concat([lid.pub, text])), lid, signPub).kind, "object");
  assert.equal(readReply(write(text), lid, signPub).kind, "silence");
  assert.equal(readReply(write(Buffer.concat([draw(32), text])), lid, signPub).kind, "silence");
});

test("follow is shared by both ends", () => {
  const e = draw(32);
  const a = draw(32);
  assert.equal(follow(e, a).length, 32);
  assert.ok(openReply(Buffer.alloc(10), xSecret(draw(32))) === null);
});
