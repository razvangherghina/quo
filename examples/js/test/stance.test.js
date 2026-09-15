// Chapter 4, the stance, and the public being of chapter 3: what a being is
// handed, what it refuses, what a restart hands back, and what a stranger's
// repeated bytes are.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unhex } from '../src/arithmetic.js';
import { MemoryHarbor } from '../src/harbor.js';
import { emptyPartition } from '../src/partition.js';
import { ZERO_EDGE_KEY, askBox, beingPk, jsonBytes, signed } from '../src/seal.js';
import { SILENCE, wordName } from '../src/value.js';
import { Host } from './fixtures/beings.js';
import { splitmix64 } from './fixtures/splitmix64.js';

let fragile = false;

// A being that does with her stance whatever she is asked to, and says what
// came back as a value.
class Keeper {
  constructor(stance) {
    if (fragile) throw new Error('threw at birth');
    this.stance = stance;
  }

  async answer(asker, method, args) {
    const s = this.stance;
    switch (method) {
      case undefined:
        return { asks: [], notes: {} };
      case 'set':
        s.cells.n = args.n;
        return {};
      case 'cells':
        return { ...s.cells };
      case 'write': {
        try {
          s.cells.f = args.bigint ? 1n : () => 1;
          return { refused: false };
        } catch {
          return { refused: true };
        }
      }
      case 'invite':
        return { invitation: await s.invite(args.id) };
      case 'remove':
        s.remove(args.id);
        return {};
      case 'knock': {
        const out = await s.knock(args.invitation, 'cells', {});
        return { said: said(out), taken: out !== SILENCE && !wordName(out) ? await s.take(args.id, args.invitation) : null };
      }
      case 'ask':
        return { said: said(await s.ask(args.id, 'cells', {})) };
      case 'boot':
        return { made: await s.boot(args.class, args.key, args.id) };
      case 'spoil': {
        const refused = [];
        for (const write of [() => (s.standings.host.seen = 'ff'.repeat(32)), () => delete s.standings.host, () => (s.standings.forged = {})]) {
          try {
            write();
            refused.push(false);
          } catch {
            refused.push(true);
          }
        }
        return { refused, seen: s.standings.host.seen };
      }
      case 'nest': {
        // An arm sixty-three deep stands alone and under one level more; under
        // two it would make the cell sixty-five deep.
        let arm = 0;
        for (let i = 0; i < 63; i++) arm = [arm];
        const stood = [];
        const write = (f) => {
          try {
            f();
            stood.push(true);
          } catch {
            stood.push(false);
          }
        };
        write(() => (s.cells.deep = { arm: 0 }));
        write(() => (s.cells.deep.arm = arm));
        write(() => (s.cells.deep.more = { arm }));
        return { stood };
      }
      case 'count':
        s.cells.count = (s.cells.count ?? 0) + 1;
        return { count: s.cells.count };
      default:
        return SILENCE;
    }
  }
}

const said = (out) => (out === SILENCE ? 'silence' : (wordName(out) ?? 'object'));

async function world() {
  const harbor = new MemoryHarbor({ classes: { Keeper }, random: splitmix64(3n) });
  const partitions = { A: emptyPartition(), B: emptyPartition() };
  const A = await harbor.boot('A', partitions.A);
  const B = await harbor.boot('B', partitions.B);
  await A.ask('boot', { key: 'a', class: 'Keeper' });
  await B.ask('boot', { key: 'b', class: 'Keeper' });
  const on = (ward, being) => (method, args = {}) => ward.ask('ask', { being, method, args });
  return { harbor, partitions, A, B, a: on(A, 'a'), b: on(B, 'b') };
}

async function related(w) {
  const { invitation } = await w.b('invite', { id: 'guest' });
  const knocked = await w.a('knock', { invitation, id: 'host' });
  assert.deepEqual(knocked, { said: 'object', taken: 'host' });
  return invitation;
}

test('invite refuses an id that names a record, occupant or standing, and the reserved names', async () => {
  const w = await world();
  await related(w);
  assert.equal((await w.b('invite', { id: 'guest' })).invitation, null, 'an occupant already');
  assert.equal((await w.a('invite', { id: 'host' })).invitation, null, 'a standing already: one namespace');
  for (const id of ['ROOT', 'then', '__proto__']) assert.equal((await w.b('invite', { id })).invitation, null, id);
  assert.ok((await w.b('invite', { id: 'other' })).invitation);
});

test('remove: what is not there is nothing, and an occupant removed hears removed', async () => {
  const w = await world();
  await related(w);
  const before = JSON.stringify(w.partitions.B);
  await w.b('remove', { id: 'nobody' });
  assert.equal(JSON.stringify(w.partitions.B), before, 'removing what is not there writes nothing');
  await w.b('remove', { id: 'guest' });
  assert.deepEqual(await w.a('ask', { id: 'host' }), { said: 'removed' });
  await w.a('remove', { id: 'host' });
  assert.deepEqual(await w.a('ask', { id: 'host' }), { said: 'dropped' }, 'a standing she dropped');
});

test('her standings are handed to her to read: a write, a delete or a new record is refused', async () => {
  const w = await world();
  await related(w);
  const before = JSON.stringify(w.partitions.A.beings.a.standings);
  const { refused, seen } = await w.a('spoil');
  assert.deepEqual(refused, [true, true, true]);
  assert.notEqual(seen, 'ff'.repeat(32));
  assert.equal(JSON.stringify(w.partitions.A.beings.a.standings), before);
});

test('a write of a non-value is refused where she wrote it, and her cells stand as they were', async () => {
  const w = await world();
  await w.a('set', { n: 1 });
  assert.deepEqual(await w.a('write'), { refused: true });
  assert.deepEqual(await w.a('write', { bigint: true }), { refused: true });
  assert.deepEqual(await w.a('cells'), { n: 1 });
});

test('a write deep inside a cell is held to the bound of the whole cell', async () => {
  const w = await world();
  assert.deepEqual(await w.a('nest'), { stood: [true, true, false] });
});

test('a boot whose class the harbor does not hold makes nobody, and leaves no record', async () => {
  const w = await world();
  const before = JSON.stringify(w.partitions.A);
  assert.deepEqual(await w.a('boot', { class: 'Nobody', key: 'c', id: 'child' }), { made: null });
  assert.equal(JSON.stringify(w.partitions.A), before);
  assert.deepEqual(await w.a('boot', { class: 'Keeper', key: 'c', id: 'child' }), { made: 'c' });
  assert.deepEqual(await w.a('ask', { id: 'child' }), { said: 'object' }, 'the relation her maker named');
});

test('a restart hands her the same cells, and a being who threw at birth is absent to the keys it bound', async () => {
  const w = await world();
  await related(w);
  await w.b('set', { n: 7 });
  fragile = true;
  try {
    await w.harbor.boot('B', w.partitions.B);
  } finally {
    fragile = false;
  }
  assert.deepEqual(await w.a('ask', { id: 'host' }), { said: 'absent' });
  const B = await w.harbor.boot('B', w.partitions.B);
  assert.deepEqual(await B.ask('ask', { being: 'b', method: 'cells' }), { n: 7 });
  assert.deepEqual(await w.a('ask', { id: 'host' }), { said: 'object' }, 'the relation stands through the restart');
});

test('the root speaks as the root, to the public being as to any being, and names the being it asks', async () => {
  const harbor = new MemoryHarbor({ classes: { Host }, random: splitmix64(5n) });
  const B = await harbor.boot('B', emptyPartition());
  await B.ask('boot', { key: 'host', class: 'Host' });
  await B.ask('public', { key: 'host' });
  assert.deepEqual(await B.ask('ask', { being: 'host', method: 'hello' }), { hi: 'ROOT' });
  assert.deepEqual(await B.ask('ask', { method: 'hello' }), { error: 'no such being' }, 'no asker but the root');
  assert.equal(await B.ask('ask', { being: 'host', method: 'boom' }), SILENCE, 'a throw inside is silence');
});

test('the public being: the same sealed bytes presented twice are delivered twice', async () => {
  const w = await world();
  await w.B.ask('public', { key: 'b' });
  const secret = unhex('07'.repeat(32));
  const payload = { to: null, by: await beingPk(secret), next: null, seq: 1, time: 30000, method: 'count', args: {} };
  const { bytes } = await askBox(splitmix64(9n), unhex(w.B.pk.slice(64)), unhex(ZERO_EDGE_KEY), await signed(secret, jsonBytes(payload)), ZERO_EDGE_KEY);
  const first = await w.B.door(bytes);
  const second = await w.B.door(bytes);
  assert.equal(first.heard, false, 'no key the door holds spoke');
  assert.deepEqual(await w.b('cells'), { count: 2 });
  assert.equal(second.bytes.length, first.bytes.length);
});
