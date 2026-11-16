import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Ward, Standing, reaches, readReply, readInvitation } from '../lib/quo.js';
import { sealAsk, sealReply, follow, openReply, edgeSealKey } from '../lib/box.js';
import { edSecret, draw, hex, fromHex, xSecret, agree, seal, sign, ZERO32 } from '../lib/crypto.js';

const setup = (reach, zero = null) => {
  const w = new Ward(draw(32), { zero });
  const inv = readInvitation(JSON.stringify(w.invite(reach).invitation));
  return { w, inv, s: new Standing(inv) };
};
const read = (s, box) => {
  const r = s.read(box);
  return r.kind === 'object' ? { object: r.text.slice(r.node.s, r.node.e), seen: r.seen } : r;
};

void test('an invitation: a text and the sig its ward made over it, and nothing beside', () => {
  const w = new Ward(draw(32));
  const { heir, invitation } = w.invite(reaches.echo, ['tcp://127.0.0.1:9']);
  const five = JSON.parse(invitation.text);
  assert.deepEqual(Object.keys(five), ['ward', 'heir', 'secret', 'lock', 'at']);
  assert.equal(five.heir, heir);
  assert.deepEqual(readInvitation(JSON.stringify(invitation)), five);
  const signed = (text, signer = w.signer) => ({
    text,
    sig: hex(sign(signer, Buffer.concat([Buffer.from('quo-invitation'), Buffer.from(text)]))),
  });
  const reads = (o) => readInvitation(typeof o === 'string' ? o : JSON.stringify(o));
  // A field beside the five is ignored and signed, padding is read and signed, and an `at`
  // that is not an array is read as absent.
  const { at, ...four } = five;
  void at;
  assert.deepEqual(reads(signed(JSON.stringify({ ...four, says: 'John' }))), four);
  assert.deepEqual(reads(signed(` \n${JSON.stringify(four)}\t `)), four);
  assert.deepEqual(reads(signed(JSON.stringify({ ...four, at: 'tcp://127.0.0.1:9' }))), four);
  const text = JSON.stringify(four);
  for (const no of [
    four,
    { text },
    { ...invitation, text },
    signed(text, edSecret(draw(32))),
    { text, sig: hex(sign(w.signer, Buffer.from(text))) },
    { ...signed(text), sig: signed(text).sig.toUpperCase() },
    { ...signed(text), at: [] },
    { text: four, sig: signed(text).sig },
    signed(`${text},`),
    signed(`[${text}]`),
    signed(`{"ward":${JSON.stringify(four.ward)},${text.slice(1)}`),
    signed(JSON.stringify({ ...four, lock: four.lock.toUpperCase() })),
    signed(JSON.stringify({ ...four, secret: undefined })),
  ])
    assert.equal(reads(no), null, JSON.stringify(no).slice(0, 80));
  // Two keys of one name in the invitation, and a text that denotes a lone surrogate. A lone
  // surrogate escaped inside the text, in a field beside the five, is the text's to carry.
  const { sig } = signed(text);
  assert.equal(reads(`{"text":${JSON.stringify(text)},"sig":"${sig}","sig":"${sig}"}`), null);
  assert.equal(reads(signed(`${text.slice(0, -1)},"x":"\ud800"}`)), null);
  assert.deepEqual(reads(signed(`${text.slice(0, -1)},"x":"\\ud800"}`)), four);
});

void test('box lengths', () => {
  const { w, inv, s } = setup();
  const knock = s.ask('m', '{"a":1}');
  const payloadLen = knock.length - 1248;
  assert.equal(
    payloadLen,
    Buffer.from(
      `{"to":"${inv.heir}","by":"${inv.heir}","next":"${'0'.repeat(64)}","seq":1,"method":"m","args":{"a":1}}`,
    ).length,
  );
  const reply = w.arrive(knock);
  const text = `{"object":{"a":1},"seen":null}`;
  assert.equal(reply.length, text.length + 112);
  assert.equal(
    s.ask('m', undefined).length - 160,
    Buffer.from(`{"to":"${inv.heir}","by":"${inv.heir}","next":"${inv.heir}","seq":2,"method":"m"}`)
      .length,
  );
});

void test('knock, then asks, both tables walk', () => {
  const { w, s } = setup(reaches.marked);
  assert.deepEqual(read(s, w.arrive(s.ask('m', '{"x": [1, 2]}'))), {
    object: '{"x": [1, 2]}',
    seen: '1',
  });
  assert.equal(s.phase, 'bound');
  for (let i = 0; i < 5; i++)
    assert.deepEqual(read(s, w.arrive(s.ask(undefined, undefined))), {
      object: '{"asks":[]}',
      seen: '1',
    });
});

void test('unannounced knock binds nothing', () => {
  const { w, inv } = setup();
  const heir = edSecret(fromHex(inv.secret));
  const payload = Buffer.from(`{"to":"${inv.heir}","by":"${inv.heir}","next":null,"seq":1}`);
  const r = sealAsk({
    padlock: fromHex(inv.ward.slice(64)),
    head: fromHex(inv.heir),
    lockEk: fromHex(inv.lock),
    payload,
    signer: heir,
  });
  const rr = readReply(w.arrive(r.box), r, fromHex(inv.ward.slice(0, 64)));
  assert.deepEqual(rr, { kind: 'word', word: 'unannounced' });
  assert.equal(w.heirs.get(inv.heir).fresh, true);
});

void test("replayed ask is repeated; replayed knock is a stranger's", () => {
  const { w, s } = setup();
  const knock = s.ask('m', undefined);
  read(s, w.arrive(knock));
  const a = s.ask('m', undefined);
  assert.equal(read(s, w.arrive(a)).object, '{}');
  assert.deepEqual(read(s, w.arrive(a)), { kind: 'word', word: 'repeated' });
  const again = w.arrive(knock);
  assert.equal(readReply(again, s.knock, s.wardSign).kind, 'silence');
});

void test('silence on a knock: the probe finds the binding', () => {
  const { w, s } = setup(reaches.silent);
  assert.equal(read(s, w.arrive(s.ask('m'))).kind, 'silence');
  w.heirs.get(s.inv.heir).reach = reaches.echo;
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}');
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}');
});

void test('knock not delivered: the same knock bytes go again and bind', () => {
  const { w, s } = setup();
  const knock = s.ask('m'); // never delivered
  assert.equal(read(s, null).kind, 'nothing');
  const again = s.ask('m');
  assert.deepEqual(again, knock);
  assert.equal(read(s, w.arrive(again)).object, '{}');
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}');
});

void test('knock heard, reply garbled: probe opens, then asks go on', () => {
  const { w, s } = setup();
  w.arrive(s.ask('m'));
  assert.equal(read(s, Buffer.alloc(200)).kind, 'silence');
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}'); // probe under own key and knock edge
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}');
});

void test('knock not heard, reply garbled: probe fails, knock resent binds', () => {
  const { w, s } = setup();
  s.ask('m');
  assert.equal(read(s, Buffer.alloc(200)).kind, 'silence');
  assert.equal(read(s, w.arrive(s.ask('m'))).kind, 'silence'); // probe does not open
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}'); // the same knock bytes
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}');
});

void test('lost reply: door moved, standing did not, still admitted', () => {
  const { w, s } = setup();
  read(s, w.arrive(s.ask('m')));
  w.arrive(s.ask('m'));
  read(s, null);
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}');
  assert.equal(read(s, w.arrive(s.ask('m'))).object, '{}');
});

void test('release: fresh is a stranger, spent hears removed', () => {
  const a = setup();
  a.w.release(a.inv.heir);
  assert.equal(read(a.s, a.w.arrive(a.s.ask('m'))).kind, 'silence');
  const b = setup();
  read(b.s, b.w.arrive(b.s.ask('m')));
  b.w.release(b.inv.heir);
  assert.deepEqual(read(b.s, b.w.arrive(b.s.ask('m'))), { kind: 'word', word: 'removed' });
});

void test('strangers: garbage, short, wrong key, zero head', () => {
  const { w, inv, s } = setup(reaches.echo);
  const signPub = fromHex(inv.ward.slice(0, 64));
  const lid = xSecret(draw(32));
  const garbage = Buffer.concat([lid.pub, draw(300)]);
  assert.equal(
    readReply(w.arrive(garbage), { lidSecret: lid, edge: ZERO32 }, signPub).kind,
    'silence',
  );
  assert.equal(w.arrive(Buffer.alloc(3)).length, 16 + 112);
  assert.equal(w.arrive(Buffer.alloc(40)).length, 16 + 112); // zero lid takes no seal
  read(s, w.arrive(s.ask('m')));
  // A stranger key on a spent heir.
  const k = edSecret(draw(32));
  const p = Buffer.from(`{"to":"${inv.heir}","by":"${hex(k.pub)}","next":null,"seq":9}`);
  const r = sealAsk({
    padlock: fromHex(inv.ward.slice(64)),
    head: fromHex(inv.heir),
    edge: s.edge,
    payload: p,
    signer: k,
  });
  const rep = w.arrive(r.box);
  assert.equal(rep.length, 16 + 112);
  assert.equal(readReply(rep, r, signPub).kind, 'silence');
  // Zero head, nothing answers: case 4.
  const zp = Buffer.from(`{"to":null,"by":"${hex(k.pub)}","next":null,"seq":1,"method":"x"}`);
  const z = sealAsk({
    padlock: fromHex(inv.ward.slice(64)),
    head: ZERO32,
    edge: ZERO32,
    payload: zp,
    signer: k,
  });
  assert.equal(readReply(w.arrive(z.box), z, signPub).kind, 'silence');
});

void test('zero head answered, twice, and signature checked', () => {
  const w = new Ward('zero', { zero: reaches.echo });
  const k = edSecret(draw(32));
  const signPub = w.signer.pub;
  const zp = Buffer.from(
    `{"to":null,"by":"${hex(k.pub)}","next":null,"seq":1,"method":"x","args":{"q":1e21}}`,
  );
  const z = sealAsk({ padlock: w.sealer.pub, head: ZERO32, edge: ZERO32, payload: zp, signer: k });
  for (let i = 0; i < 2; i++) {
    const r = readReply(w.arrive(z.box), z, signPub);
    assert.equal(r.kind, 'object');
    assert.equal(r.text.slice(r.node.s, r.node.e), '{"q":1e21}');
  }
  const other = edSecret(draw(32));
  const bad = sealAsk({
    padlock: w.sealer.pub,
    head: ZERO32,
    edge: ZERO32,
    payload: zp,
    signer: other,
  });
  assert.equal(readReply(w.arrive(bad.box), bad, signPub).kind, 'silence');
});

void test('payload refusals', () => {
  const w = new Ward('p', { zero: reaches.echo });
  const k = edSecret(draw(32));
  const by = hex(k.pub);
  const tryP = (p) => {
    const z = sealAsk({
      padlock: w.sealer.pub,
      head: ZERO32,
      edge: ZERO32,
      payload: Buffer.from(p),
      signer: k,
    });
    return readReply(w.arrive(z.box), z, w.signer.pub).kind;
  };
  assert.equal(tryP(`{"to":null,"by":"${by}","next":null,"seq":1}`), 'object');
  // A payload's bytes beyond ASCII reach what answers exactly as they arrived.
  assert.equal(
    tryP(
      `{"to":null,"by":"${by}","next":null,"seq":1,"method":"m","args":{"v":"\\uffff\uffff\\ud83d\\ude00😀"}}`,
    ),
    'object',
  );
  for (const p of [
    `{"to":null,"by":"${by}","next":null,"seq":1.0}`,
    `{"to":null,"by":"${by}","next":null,"seq":1e0}`,
    `{"to":null,"by":"${by}","next":null,"seq":0}`,
    `{"to":null,"by":"${by}","next":null,"seq":1.5}`,
    `{"to":null,"by":"${by}","next":null,"seq":9007199254740992}`,
    `{"to":null,"by":"${by}","next":null,"seq":"1"}`,
    `{"to":null,"by":"${by}","seq":1}`,
    `{"to":null,"by":"${by.toUpperCase()}","next":null,"seq":1}`,
    `{"to":null,"by":"${'0'.repeat(64)}","next":null,"seq":1}`,
    `{"to":null,"by":"${by}","next":null,"seq":1,"method":null}`,
    `{"to":null,"by":"${by}","next":null,"seq":1,"args":[]}`,
    `{"to":null,"by":"${by}","by":"${by}","next":null,"seq":1}`,
    `{"to":"${by}","by":"${by}","next":null,"seq":1}`,
    `[1]`,
    `{"to":null,"by":"${by}","next":null,"seq":1,"x":${'['.repeat(65)}${']'.repeat(64)}}`,
  ])
    assert.equal(tryP(p), 'silence', p);
  // Numbers are carried as written; args and fields beside the six at any depth; repeats inside args are JSON's.
  for (const x of [
    '-0',
    '1e400',
    '9007199254740993',
    `${'['.repeat(5000)}${']'.repeat(5000)}`,
    '{"a":1,"a":2}',
    '"\\ud800"',
  ])
    assert.equal(
      tryP(`{"to":null,"by":"${by}","next":null,"seq":1,"x":${x},"method":"m","args":{"a":${x}}}`),
      'object',
      x,
    );
  assert.equal(
    tryP(`{"to":null,"by":"${by}","next":null,"seq":1,"method":"m","args":{"k":1,"k":2}}`),
    'object',
  );
  assert.equal(tryP(`{"to":null,"by":"${by}","next":null,"seq":9007199254740991}`), 'object');
  assert.equal(tryP(`  {"to":null,"by":"${by}","next":null,"seq":1}\n`), 'object');
});

void test("a reply's signature covers the lid, then the reply text", () => {
  const { w, inv, s } = setup();
  const signPub = fromHex(inv.ward.slice(0, 64));
  const ask = s.ask('m');
  const sent = s.last;
  const lid = sent.lidSecret;
  assert.equal(readReply(w.arrive(ask), sent, signPub).kind, 'object');
  // A reply the ward signed over its reply text alone, or over another ask's lid, reads as silence.
  const text = Buffer.from('{"object":1,"seen":null}');
  const write = (msg) => {
    const e = xSecret(draw(32));
    const a = agree(e, lid.pub);
    const body = Buffer.concat([text, sign(w.signer, msg)]);
    return Buffer.concat([e.pub, seal(edgeSealKey(a, sent.edge), body, e.pub)]);
  };
  assert.equal(readReply(write(Buffer.concat([lid.pub, text])), sent, signPub).kind, 'object');
  assert.equal(readReply(write(text), sent, signPub).kind, 'silence');
  assert.equal(readReply(write(Buffer.concat([draw(32), text])), sent, signPub).kind, 'silence');
});

void test("a reply's at: written by the reach moved, read as an invitation's is", () => {
  const { w, inv, s } = setup(reaches.moved);
  const signPub = fromHex(inv.ward.slice(0, 64));
  const knock = s.ask('m', '{"k":1}');
  const sent = s.last;
  const lid = sent.lidSecret;
  const opened = openReply(w.arrive(knock), sent);
  assert.equal(opened.text.toString(), '{"object":{"k":1},"seen":null,"at":["tcp://127.0.0.1:9"]}');
  // The standing reads that object and moves on it.
  assert.equal(read(s, w.arrive(s.ask(undefined, undefined))).object, '{"asks":[]}');
  assert.equal(s.phase, 'bound');
  const write = (text) => {
    const e = xSecret(draw(32));
    const body = Buffer.concat([
      Buffer.from(text),
      sign(w.signer, Buffer.concat([lid.pub, Buffer.from(text)])),
    ]);
    return Buffer.concat([e.pub, seal(edgeSealKey(agree(e, lid.pub), sent.edge), body, e.pub)]);
  };
  const kind = (text) => readReply(write(text), sent, signPub).kind;
  // An at that is no array reads as absent, a skipped entry skips, and the reply is still an object.
  for (const at of [
    '["tcp://127.0.0.1:9"]',
    '[5,"no scheme",null,"TCP://127.0.0.1:9"]',
    '"tcp://127.0.0.1:9"',
    'null',
    '[]',
  ]) {
    assert.equal(kind(`{"at":${at},"object":1,"seen":null}`), 'object', at);
  }
  // Beside silence or a word, or twice, at is a field beside the shape.
  assert.equal(kind('{"silence":true,"at":[]}'), 'silence');
  assert.equal(kind('{"quo":"repeated","at":[]}'), 'silence');
  assert.equal(kind('{"object":1,"seen":null,"at":[],"at":[]}'), 'silence');
});

void test('follow is shared by both ends', () => {
  const e = draw(32);
  const a = draw(32);
  assert.equal(follow(e, a).length, 32);
  assert.ok(openReply(Buffer.alloc(10), { lidSecret: xSecret(draw(32)), edge: ZERO32 }) === null);
});

const SILENCE_TEXT = '{"silence":true}';
const openedText = (box, sent, edge) => openReply(box, { ...sent, edge })?.text.toString();

void test('an object and a word go over the edge key the ask came under', () => {
  const { w, s } = setup();
  const knock = s.ask('m', '{"k":1}');
  const sent = s.last;
  const reply = w.arrive(knock);
  assert.equal(openedText(reply, sent, sent.edge), '{"object":{"k":1},"seen":null}');
  assert.equal(openedText(reply, sent, ZERO32), undefined);
  s.read(reply);
  const ask = s.ask('m');
  const asked = s.last;
  w.arrive(ask);
  const word = w.arrive(ask);
  assert.equal(openedText(word, asked, asked.edge), '{"quo":"repeated"}');
  assert.equal(openedText(word, asked, ZERO32), undefined);
});

void test('every silence goes over the zero edge key', () => {
  const chosen = setup(reaches.silent);
  const knock = chosen.s.ask('m');
  const sent = chosen.s.last;
  const reply = chosen.w.arrive(knock);
  assert.equal(openedText(reply, sent, ZERO32), SILENCE_TEXT);
  assert.equal(openedText(reply, sent, sent.edge), undefined);
  const lid = xSecret(draw(32));
  const stranger = chosen.w.arrive(Buffer.concat([lid.pub, draw(300)]));
  assert.equal(openedText(stranger, { lidSecret: lid }, ZERO32), SILENCE_TEXT);
});

void test('the zero head: an object and silence both go over the zero edge key', () => {
  const w = new Ward('zero edge', { zero: reaches.echo });
  const k = edSecret(draw(32));
  const ask = (text) =>
    sealAsk({
      padlock: w.sealer.pub,
      head: ZERO32,
      edge: ZERO32,
      payload: Buffer.from(text),
      signer: k,
    });
  const named = ask(`{"to":null,"by":"${hex(k.pub)}","next":null,"seq":1,"method":"m"}`);
  assert.equal(openedText(w.arrive(named.box), named, ZERO32), '{"object":{},"seen":null}');
  const refused = ask(`{"to":null,"by":"${hex(draw(32))}","next":null,"seq":1}`);
  assert.equal(openedText(w.arrive(refused.box), refused, ZERO32), SILENCE_TEXT);
});

void test('an object or a word sealed under the zero edge key reads as silence on a relation', () => {
  const { w, inv, s } = setup();
  s.ask('m');
  const sent = s.last;
  const signPub = fromHex(inv.ward.slice(0, 64));
  for (const text of ['{"object":1,"seen":null}', '{"quo":"repeated"}']) {
    const box = sealReply({
      lid: sent.lidSecret.pub,
      text: Buffer.from(text),
      edge: ZERO32,
      signer: w.signer,
    }).box;
    assert.equal(readReply(box, sent, signPub).kind, 'silence');
  }
});
