// Her side, chapters 3 and 4: the lost knock, the size, the allowance, the
// four words her own ward says, and the strict reading of a reply.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hex, mlkem, unhex, x25519 } from '../src/arithmetic.js';
import { MemoryHarbor, random } from '../src/harbor.js';
import { edges } from '../src/keys.js';
import { emptyPartition } from '../src/partition.js';
import { SIZE, ZERO_EDGE_KEY, askBox, beingPk, box, jsonBytes, lockEdge, nextEdge, openAsk, signed, split, unbox, wardKey } from '../src/seal.js';
import { readReply } from '../src/sender.js';
import { SILENCE, parseJson, wordName } from '../src/value.js';
import { createWard } from '../src/ward.js';
import { Host } from './fixtures/beings.js';

const never = new Promise(() => {});

// B stands a Host in a memory harbor. A is a ward whose carrier the test
// writes, and whose one being hands her stance out. Every ask the carrier
// takes is opened as B's door would open it, and the edge key it opened under
// is kept beside its payload, both null for a box that does not open.
async function world(carrier = (deliver) => deliver()) {
  const far = new MemoryHarbor({ classes: { Host }, random });
  const pb = emptyPartition();
  const pa = emptyPartition();
  const B = await far.boot('B', pb);
  await B.ask('boot', { key: 'host', class: 'Host' });
  const payloads = [];
  const opened = [];
  const sizes = [];
  const seal = (await wardKey('B')).seal;
  let stance;
  const A = await createWard({
    seed: 'A',
    partition: pa,
    random,
    instantiate: (cls, s) => ((stance = s), { answer: () => ({}) }),
    carry: async (pk, bytes) => {
      const ask = await openAsk(seal, bytes, (head) => edges(pb, hex(head)));
      payloads.push(ask && parseJson(split(ask.plaintext).body, 66));
      opened.push(ask?.edge ?? null);
      sizes.push(bytes.length);
      return carrier(() => far.carry(pk, bytes), payloads.length);
    },
  });
  await A.ask('boot', { key: 'alice', class: 'Caller' });
  const invite = (id) => B.ask('invite', { being: 'host', id });
  return { B, pa, pb, invite, payloads, opened, sizes, stance: () => stance };
}

// A relation taken: host invites alice, alice knocks and takes it as `b`.
async function taken(w, invitation) {
  invitation ??= await w.invite('alice');
  await w.stance().knock(invitation, 'hello', {});
  await w.stance().take('b', invitation);
  return { invitation, heir: w.pb.heirs[invitation.heir], standing: w.pa.relations.alice.standings.b };
}

// The hand seals one ask to B's door, the head and `to` apart when a test
// names them so, and the body under the edge key it is handed, or, handed a
// lock, a knock under the edge key its ciphertext gives.
async function sealByHand(w, { head, to, secret, edge, lock, next = null, seq = 1001 }) {
  const payload = { to, by: await beingPk(secret), next, seq, time: 30000, method: 'hello', args: {} };
  return askBox(random, unhex(w.B.pk.slice(64)), unhex(head), await signed(secret, jsonBytes(payload)), edge, lock && unhex(lock));
}

// The edge key that follows an ask: the key it came under, then the reply's
// agreement, from the lid's secret and the reply's ephemeral pk.
const follows = async (edge, sealed, reply) => nextEdge(edge, await x25519.agree(sealed.secret, reply.subarray(0, 32)));

test('the lock is drawn once, at the first invite, before its heir secret, and a restart keeps it', async () => {
  const draws = [];
  const counted = (n) => (draws.push(n), random(n));
  const harbor = new MemoryHarbor({ classes: { Host }, random: counted });
  const partition = emptyPartition();
  const B = await harbor.boot('B', partition);
  await B.ask('boot', { key: 'host', class: 'Host' });
  assert.equal(partition.lock, null, 'an empty partition holds no lock');
  const first = await B.ask('invite', { being: 'host', id: 'one' });
  assert.deepEqual(draws, [64, 32], 'sixty-four bytes for the lock, then the heir secret');
  assert.equal(first.lock, hex(mlkem.keygen(unhex(partition.lock)).ek));
  assert.equal(first.lock.length, 2368);
  const second = await B.ask('invite', { being: 'host', id: 'two' });
  assert.deepEqual(draws, [64, 32, 32], 'nothing draws for it again');
  assert.equal(second.lock, first.lock);
  const reborn = await new MemoryHarbor({ classes: { Host }, random }).boot('B', partition);
  assert.equal((await reborn.ask('invite', { being: 'host', id: 'three' })).lock, first.lock, 'a ward stood from its partition keeps its lock');
  assert.equal(partition.lock.length, 128);
});

test('an invitation that names a heir and no lock, or a lock of another shape, is no invitation', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  const { lock, ...unlocked } = invitation;
  for (const shape of [unlocked, { ...invitation, lock: lock.slice(2) }, { ...invitation, lock: lock.toUpperCase() }, { ...invitation, lock: 7 }]) {
    assert.equal(wordName(await w.stance().knock(shape, 'hello', {})), 'invitation');
  }
  assert.equal(wordName(await w.stance().knock({ ward: invitation.ward, lock }, 'hello', {})), 'invitation', 'a lock with no heir');
  assert.equal(w.payloads.length, 0);
  assert.deepEqual(await w.stance().knock({ ...invitation, beside: 1 }, 'hello', {}), { hi: 'alice' }, 'a field beside the four is ignored');
});

test('a knock box is its payload and 1248 bytes, and opens only with the lock', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  const secret = unhex(invitation.secret);
  const payload = { to: invitation.heir, by: invitation.heir, next: await beingPk(random(32)), seq: 1, time: 30000, method: 'hello', args: {} };
  const body = await signed(secret, jsonBytes(payload));
  const knock = await askBox(random, unhex(w.B.pk.slice(64)), unhex(invitation.heir), body, ZERO_EDGE_KEY, unhex(invitation.lock));
  assert.equal(knock.bytes.length, jsonBytes(payload).length + 1248);
  const ask = await askBox(random, unhex(w.B.pk.slice(64)), unhex(invitation.heir), body, ZERO_EDGE_KEY);
  assert.equal(ask.bytes.length, jsonBytes(payload).length + 160, 'every other ask is its payload and 160');
  const seal = (await wardKey('B')).seal;
  assert.notEqual(await openAsk(seal, knock.bytes, () => ({ lock: w.pb.lock })), null, 'the lock opens it');
  assert.equal(await openAsk(seal, knock.bytes, () => ({ lock: hex(random(64)) })), null, 'another lock does not');
  assert.equal(await openAsk(seal, knock.bytes, () => [knock.edge]), null, 'nor its own edge key without the ciphertext read');
  assert.equal(knock.edge, await lockEdge(mlkem.decaps(mlkem.keygen(unhex(w.pb.lock)).dk, knock.bytes.subarray(80, 80 + 1088))));
});

test('a tampered ciphertext is D1: silence, nothing written, and the heir stays fresh', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  const next = await beingPk(random(32));
  const knock = await sealByHand(w, { head: invitation.heir, to: invitation.heir, secret: unhex(invitation.secret), next, seq: 1, lock: invitation.lock });
  const tampered = knock.bytes.slice();
  tampered[80 + 500] ^= 1;
  const before = JSON.stringify(w.pb);
  const out = await w.B.door(tampered);
  assert.equal(out.heard, false);
  assert.deepEqual(parseJson(split(await unbox(knock.secret, out.bytes)).body), { silence: true });
  assert.equal(JSON.stringify(w.pb), before, 'nothing written, edge keys and lock included');
  assert.equal((await w.B.door(knock.bytes)).heard, true, 'the knock as sealed still binds');
});

test('two knocks racing on one invitation: the first binds and the other is silence', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  const knockAs = async () =>
    sealByHand(w, { head: invitation.heir, to: invitation.heir, secret: unhex(invitation.secret), next: await beingPk(random(32)), seq: 1, lock: invitation.lock });
  const knocks = [await knockAs(), await knockAs()];
  const outs = await Promise.all(knocks.map((k) => w.B.door(k.bytes)));
  assert.equal(outs.filter((o) => o.heard).length, 1, 'one binds');
  const won = outs.findIndex((o) => o.heard);
  const [winner, loser] = [knocks[won], knocks[1 - won]];
  const opens = async (sealed, out) => parseJson(split(await unbox(sealed.secret, out.bytes)).body);
  assert.deepEqual((await opens(winner, outs[won])).object, { hi: 'alice' });
  assert.deepEqual(await opens(loser, outs[1 - won]), { silence: true }, 'the other is silenced');
  const heir = w.pb.heirs[invitation.heir];
  assert.equal(heir.open, winner.edge, 'the winner’s edge key is open');
  assert.equal(heir.offered, await follows(winner.edge, winner, outs[won].bytes));
});

test('two asks racing one heir, one under the open edge key and one under the offered: one is answered, the other is silence', async () => {
  const w = await world();
  const { invitation, heir, standing } = await taken(w);
  const secret = typeof standing.by === 'string' ? unhex(standing.by) : standing.by;
  const asks = [
    await sealByHand(w, { head: invitation.heir, to: invitation.heir, secret, edge: heir.open, seq: 2 }),
    await sealByHand(w, { head: invitation.heir, to: invitation.heir, secret, edge: heir.offered, seq: 3 }),
  ];
  const outs = await Promise.all(asks.map((a) => w.B.door(a.bytes)));
  assert.equal(outs.filter((o) => o.heard).length, 1, 'exactly one is answered');
  const lost = outs.findIndex((o) => !o.heard);
  assert.deepEqual(parseJson(split(await unbox(asks[lost].secret, outs[lost].bytes)).body), { silence: true });
});

test('the lost knock: the reply is lost, she asks under her own key and the knock’s edge key, and is answered', async () => {
  let first = true;
  const w = await world((deliver) => (first ? ((first = false), deliver().then(() => never)) : deliver()));
  const invitation = await w.invite('alice');
  assert.equal(wordName(await w.stance().knock(invitation, 'hello', {}, { time: 100 })), 'late');
  const knockEdge = w.opened[0];
  assert.equal(w.pa.relations.alice.knocks[`${invitation.ward}:${invitation.heir}`].edge, knockEdge, 'she holds the knock’s edge key from the moment it is sealed');
  assert.equal(w.pb.heirs[invitation.heir].open, knockEdge, 'which the door that heard it holds open');
  w.payloads.length = 0;
  const sent = w.sizes.length;
  assert.deepEqual(await w.stance().knock(invitation, 'hello', {}, { time: 1000 }), { hi: 'alice' });
  assert.notEqual(w.payloads[0].by, invitation.heir, 'the first send after a lost knock is under her own key');
  assert.equal(w.opened[1], knockEdge, 'and under the knock’s edge key');
  assert.equal(w.sizes[sent], jsonBytes(w.payloads[0]).length + 160, 'with no ciphertext');
  assert.equal(await w.stance().take('b', invitation), 'b');
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' });
});

test('a knock is sealed under the knock’s edge key, and both ends chain the next from it', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  const { heir, standing } = await taken(w, invitation);
  const [knockEdge] = w.opened;
  assert.notEqual(knockEdge, ZERO_EDGE_KEY);
  assert.equal(heir.open, knockEdge);
  assert.equal(standing.edge, heir.offered, 'both ends derive one key from the knock’s and the reply');
  assert.notEqual(standing.edge, knockEdge);
});

test('the next ask is sealed under the key offered, which becomes open while the one after it is offered', async () => {
  const w = await world();
  const { heir, standing } = await taken(w);
  const offered = heir.offered;
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' });
  assert.equal(w.opened.at(-1), offered);
  assert.equal(heir.open, offered);
  assert.notEqual(heir.offered, offered);
  assert.equal(standing.edge, heir.offered);
});

test('the edge key moves as quo-edge of the key the ask came under and the reply’s agreement', async () => {
  const w = await world();
  const { invitation, heir, standing } = await taken(w);
  const secret = unhex(standing.by);
  const sealed = await sealByHand(w, { head: invitation.heir, to: invitation.heir, secret, edge: standing.edge, seq: 50 });
  const out = await w.B.door(sealed.bytes);
  assert.equal(heir.open, standing.edge);
  assert.equal(heir.offered, await follows(standing.edge, sealed, out.bytes));
});

test('repeated silences leave her edge key where it stood, open at the door, and she is heard', async () => {
  const w = await world();
  const { heir, standing } = await taken(w);
  await w.stance().ask('b', 'hello');
  const edge = standing.edge;
  for (const method of ['quiet', 'boom', 'quiet']) await w.stance().ask('b', method);
  assert.equal(standing.edge, edge, 'silence and a word move nothing on her side');
  assert.equal(heir.open, edge, 'an ask opened under open leaves it open');
  assert.deepEqual(w.opened.slice(-3), [edge, edge, edge]);
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' });
  assert.equal(w.opened.at(-1), edge);
});

test('a body sealed under an edge key the door does not hold is D1: silence, nothing written', async () => {
  const w = await world();
  const { invitation, standing } = await taken(w);
  const secret = unhex(standing.by);
  const before = JSON.stringify(w.pb);
  const wrong = await sealByHand(w, { head: invitation.heir, to: invitation.heir, secret, edge: hex(random(32)) });
  const out = await w.B.door(wrong.bytes);
  assert.equal(out.heard, false);
  assert.deepEqual(parseJson(split(await unbox(wrong.secret, out.bytes)).body), { silence: true });
  assert.equal(JSON.stringify(w.pb), before, 'nothing written, edge keys included');
  const right = await sealByHand(w, { head: invitation.heir, to: invitation.heir, secret, edge: standing.edge });
  assert.equal((await w.B.door(right.bytes)).heard, true, 'the same ask under the key offered is heard');
});

test('a `to` that is not the head is D2: silence, nothing written', async () => {
  const w = await world();
  const { invitation, standing } = await taken(w);
  const secret = unhex(standing.by);
  const before = JSON.stringify(w.pb);
  const cases = [
    { head: invitation.heir, to: null, edge: standing.edge },
    { head: invitation.heir, to: 'ff'.repeat(32), edge: standing.edge },
    { head: ZERO_EDGE_KEY, to: invitation.heir, edge: ZERO_EDGE_KEY },
  ];
  for (const c of cases) {
    const sealed = await sealByHand(w, { ...c, secret });
    const out = await w.B.door(sealed.bytes);
    assert.equal(out.heard, false);
    assert.deepEqual(parseJson(split(await unbox(sealed.secret, out.bytes)).body), { silence: true });
  }
  assert.equal(JSON.stringify(w.pb), before);
});

test('a removed key keeps its edge keys, so its ask still opens and hears removed', async () => {
  const w = await world();
  const { invitation } = await taken(w);
  await w.stance().ask('b', 'hello');
  await w.B.ask('remove', { being: 'host', id: 'alice' });
  assert.equal(wordName(await w.stance().ask('b', 'hello')), 'removed');
  assert.ok(w.pb.removed[invitation.heir].open);
});

test('the public being is asked under the zero edge key, and nothing is kept for the asker', async () => {
  const w = await world();
  await w.B.ask('public', { key: 'host' });
  const invitation = { ward: w.B.pk };
  assert.deepEqual(await w.stance().knock(invitation, 'hello', {}), { hi: null });
  assert.equal(await w.stance().take('p', invitation), 'p');
  assert.deepEqual(await w.stance().ask('p', 'hello'), { hi: null });
  assert.deepEqual(w.opened, [ZERO_EDGE_KEY, ZERO_EDGE_KEY]);
  assert.deepEqual(w.pb.heirs, {});
});

test('the lost knock, the other case: the door never heard it, her own key does not open, nothing is written, and the knock again binds under the same m', async () => {
  let written = null;
  let n = 0;
  const w = await world((deliver) => {
    n += 1;
    if (n === 1) return never;
    if (n !== 2) return deliver();
    const before = JSON.stringify(w.pb);
    return deliver().then((out) => ((written = JSON.stringify(w.pb) !== before), out));
  });
  const invitation = await w.invite('alice');
  assert.equal(wordName(await w.stance().knock(invitation, 'hello', {}, { time: 100 })), 'late');
  const lostEdge = w.opened[0];
  w.payloads.length = 0;
  w.opened.length = 0;
  assert.deepEqual(await w.stance().knock(invitation, 'hello', {}, { time: 1000 }), { hi: 'alice' });
  assert.deepEqual(w.payloads.map((p) => p && p.by === invitation.heir), [null, true], 'her own key first, which does not open, then the heir');
  assert.equal(w.opened[1], lostEdge, 'the knock again is under the same m, so the same edge key');
  assert.equal(w.pb.heirs[invitation.heir].open, w.opened[1]);
  assert.equal(written, false, 'the refused ask under her own key wrote nothing');
  assert.equal(await w.stance().take('b', invitation), 'b');
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' });
});

test('a knock answered by silence or a throw spent the heir, and her next knock is still heard', async () => {
  for (const method of ['quiet', 'boom']) {
    const w = await world();
    const invitation = await w.invite('alice');
    const first = await w.stance().knock(invitation, method, {});
    assert.ok(first === SILENCE || wordName(first) === 'threw', method);
    assert.equal(await w.stance().take('b', invitation), null, 'take after a knock no object answered births nothing');
    assert.deepEqual(await w.stance().knock(invitation, 'hello', {}), { hi: 'alice' }, method);
    assert.equal(await w.stance().take('b', invitation), 'b');
  }
});

test('a knock again as the spent heir after her being’s silence goes under the same m, and her own key is still heard', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  // The knock meets silence, and so does the ask under her own key, so she
  // knocks as the heir after it too: with the same m, so the edge key she
  // holds is the one the door bound.
  assert.equal(await w.stance().knock(invitation, 'quiet', {}), SILENCE);
  assert.equal(await w.stance().knock(invitation, 'quiet', {}), SILENCE);
  assert.deepEqual(await w.stance().knock(invitation, 'hello', {}), { hi: 'alice' });
  assert.equal(await w.stance().take('b', invitation), 'b');
});

test('whitespace inside a signed payload is read, and the signature covers it', async () => {
  const w = await world();
  const { invitation, standing } = await taken(w);
  const secret = unhex(standing.by);
  const text = ` \n{ "to" : "${invitation.heir}",\t"by":"${await beingPk(secret)}" , "next": null, "seq": 1001, "time": 30000, "method": "hello", "args": { } }\r\n `;
  const sealed = await askBox(random, unhex(w.B.pk.slice(64)), unhex(invitation.heir), await signed(secret, new TextEncoder().encode(text)), standing.edge);
  const out = await w.B.door(sealed.bytes);
  assert.equal(out.heard, true);
  assert.deepEqual(parseJson(split(await unbox(sealed.secret, out.bytes)).body).object, { hi: 'alice' });
});

test('she threw: the door spends the number and rotates its keys, and her own keys and record do not move on the word', async () => {
  const w = await world();
  const { heir, standing } = await taken(w);
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' });
  const record = w.pa.beings.alice.standings.b;
  const before = { by: standing.by, edge: standing.edge, seen: record.seen, offered: heir.offered };
  assert.equal(wordName(await w.stance().ask('b', 'boom')), 'threw');
  assert.equal(heir.mark, standing.seq, 'the number is spent');
  assert.equal(heir.open, before.edge, 'the ask came under the key offered, now open');
  assert.notEqual(heir.offered, before.offered, 'a new key is offered');
  assert.equal(heir.vouched, await beingPk(unhex(standing.next)), 'the key she announced is vouched for');
  assert.deepEqual({ by: standing.by, edge: standing.edge, seen: record.seen }, { by: before.by, edge: before.edge, seen: before.seen });
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' }, 'a threw never kills a standing');
});

test('a knock with an invitation she already took is a knock, and the spent heir meets it with silence', async () => {
  const w = await world();
  const { invitation } = await taken(w);
  const sent = w.payloads.length;
  assert.equal(await w.stance().knock(invitation, 'hello', {}), SILENCE);
  assert.deepEqual(w.payloads.slice(sent), [null], 'one knock box, which a spent heir does not open');
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' }, 'the standing she took is untouched');
});

test('a payload is written to, by, next, seq, time, method, args, as the framing vectors pin it', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  await w.stance().knock(invitation, 'hello', { n: 1 });
  assert.deepEqual(Object.keys(w.payloads[0]), ['to', 'by', 'next', 'seq', 'time', 'method', 'args']);
});

test('an invitation whose padlock takes no seal is unreached, and nothing reaches the carrier', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  const smallOrder = { ...invitation, ward: invitation.ward.slice(0, 64) + '00'.repeat(32) };
  assert.equal(wordName(await w.stance().knock(smallOrder, 'hello', {})), 'unreached');
  assert.equal(w.payloads.length, 0);
});

test('a knock under a secret that is not the heir is silence, and the right one after it is heard', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  const wrong = { ...invitation, secret: 'ab'.repeat(32) };
  assert.equal(await w.stance().knock(wrong, 'hello', {}), SILENCE);
  assert.deepEqual(await w.stance().knock(invitation, 'hello', {}), { hi: 'alice' });
});

test('an ask above the size is unreached before it is sealed, and the relation is heard after it', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  await w.stance().knock(invitation, 'hello', {});
  await w.stance().take('b', invitation);
  const sent = w.payloads.length;
  assert.equal(wordName(await w.stance().ask('b', 'hello', { blob: 'x'.repeat(1 << 20) })), 'unreached');
  assert.equal(w.payloads.length, sent, 'nothing reached the carrier');
  assert.deepEqual(await w.stance().ask('b', 'hello'), { hi: 'alice' });
});

test('an arg of depth sixty-four stands whatever carries it, and sixty-five is unreached', async () => {
  const w = await world();
  await taken(w);
  const nest = (n) => Array.from({ length: n }).reduce((inner) => [inner], 0);
  const sent = w.payloads.length;
  assert.equal(wordName(await w.stance().ask('b', 'hello', { v: nest(65) })), 'unreached');
  assert.equal(w.payloads.length, sent, 'nothing reached the carrier');
  assert.deepEqual(await w.stance().ask('b', 'hello', { v: nest(64) }), { hi: 'alice' }, 'args sixty-five, the payload sixty-six');
});

test('an ask that waited its turn carries only the time it has left', async () => {
  const w = await world();
  const invitation = await w.invite('alice');
  await w.stance().knock(invitation, 'hello', {});
  await w.stance().take('b', invitation);
  const held = w.stance().ask('b', 'never', {}, { time: 200 });
  const waited = w.stance().ask('b', 'hello', {}, { time: 1000 });
  assert.equal(wordName(await held), 'late');
  await waited;
  const [, first, second] = w.payloads;
  assert.equal(first.time, 200);
  assert.ok(second.time < 1000 && second.time >= 1, `time left: ${second.time}`);
});

test('the four words her own ward says, and nothing sent for any but unreached by the carrier', async () => {
  const w = await world((deliver, n) => (n === 1 ? null : deliver()));
  const invitation = await w.invite('alice');
  assert.equal(wordName(await w.stance().knock({ ward: invitation.ward, heir: invitation.heir })), 'invitation');
  assert.equal(wordName(await w.stance().knock(invitation, 7)), 'unreached');
  assert.equal(w.payloads.length, 0);
  assert.equal(wordName(await w.stance().ask('nobody', 'hello')), 'dropped');
  assert.equal(await w.stance().take('b', invitation), null, 'take before a knock births nothing');
  assert.equal(wordName(await w.stance().knock(invitation, 'hello', {})), 'unreached', 'the carrier answered nothing');
  assert.deepEqual(await w.stance().knock(invitation, 'hello', {}), { hi: 'alice' }, 'unreached tells nothing, and she knocks as the heir');
  assert.equal(w.payloads.at(-1).by, invitation.heir);
});

test('a reply is read strictly: one of three shapes, signed by the ward it went to, and nothing beside', async () => {
  const ward = await wardKey('B');
  const lidSecret = random(32);
  const lid = await x25519.publicKey(lidSecret);
  const reply = async (value, signer = ward.sign) => (await box(lid, await signed(signer, jsonBytes(value)), random(32))).bytes;
  const read = async (value, signer) => readReply(lidSecret, ward.pk, await reply(value, signer));
  assert.deepEqual(await read({ object: 1, seen: null }), { object: 1, seen: null });
  assert.deepEqual(await read({ silence: true }), { silence: true });
  assert.deepEqual(await read({ quo: 'removed' }), { quo: 'removed' });
  assert.equal(await read({ object: 1, seen: null, extra: 1 }), null, 'a field beside its shape');
  assert.equal(await read({ object: 1, seen: 'nope' }), null, 'a seen that is neither a digest nor null');
  assert.equal(await read({ object: 1 }), null, 'seen is always present');
  assert.equal(await read({ quo: 'late' }), null, 'a word no door says');
  assert.equal(await read({ silence: true }, random(32)), null, 'not signed by the ward');
  const nest = (n) => Array.from({ length: n }).reduce((inner) => [inner], 0);
  assert.deepEqual(await read({ object: nest(64), seen: null }), { object: nest(64), seen: null }, 'a reply at depth sixty-five is read');
  assert.equal(await read({ object: nest(65), seen: null }), null, 'a reply at depth sixty-six is refused');
  const over = await reply({ object: 'x'.repeat(SIZE), seen: null });
  assert.ok(over.length > SIZE);
  assert.equal(await readReply(lidSecret, ward.pk, over), null, 'a reply over the size, a box that would open');
});
