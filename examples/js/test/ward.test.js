import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dispatch } from '../src/door.js';
import { MemoryHarbor } from '../src/harbor.js';
import { emptyPartition } from '../src/partition.js';
import { Host } from './fixtures/beings.js';
import { splitmix64 } from './fixtures/splitmix64.js';

const WORD = Symbol.for('quo.word');

// A being that asks her standing whatever she is told to, and hands back what
// came, so the test reads the reply as she met it.
class Probe {
  constructor(stance) {
    this.stance = stance;
  }

  async answer(asker, method, args) {
    if (method === undefined) return { asks: [{ name: 'go', input: { type: 'object' } }], notes: {} };
    const out = await this.stance.ask('host', args.method, {});
    Probe.last = out;
    return {};
  }
}

test('her side moves to the announced key only when an object came back', async () => {
  const random = splitmix64(7n);
  const harbor = new MemoryHarbor({ classes: { Host, Probe }, random });
  const pa = emptyPartition();
  const A = await harbor.boot('A', pa);
  const B = await harbor.boot('B', emptyPartition());
  await A.ask('boot', { key: 'probe', class: 'Probe' });
  await B.ask('boot', { key: 'host', class: 'Host' });
  const invitation = await B.ask('invite', { being: 'host', id: 'probe' });
  const knocked = await A.ask('knock', { being: 'probe', id: 'host', invitation, method: 'hello' });
  assert.equal(knocked.taken, 'host');
  const current = () => pa.relations.probe.standings.host.by;

  const go = async (method) => {
    const before = current();
    await A.ask('ask', { being: 'probe', method: 'go', args: { method } });
    return { out: Probe.last, moved: current() !== before };
  };

  const threw = await go('boom');
  assert.deepEqual(Reflect.ownKeys(threw.out), [WORD]);
  assert.equal(threw.out[WORD], 'threw');
  assert.ok(Object.isFrozen(threw.out));
  assert.equal(threw.moved, false, 'threw moves nothing');

  const quiet = await go('quiet');
  assert.equal(quiet.out, Symbol.for('quo.silence'));
  assert.equal(quiet.moved, false, 'silence moves nothing');

  const hello = await go('hello');
  assert.deepEqual(hello.out, { hi: 'probe' });
  assert.equal(hello.moved, true, 'an object moves her side');

  // Behind by two refusals and heard all the same.
  assert.deepEqual((await go('hello')).out, { hi: 'probe' });
});

test('a describe that throws or falls silent costs the digest and nothing else, and on the empty ask is judged as her answer', async () => {
  const silence = Symbol.for('quo.silence');
  for (const describe of [() => { throw new Error('describe'); }, () => silence]) {
    const being = { answer: (asker, method) => (method === undefined ? describe() : { hi: asker.id }) };
    assert.deepEqual(await dispatch(being, { id: 'x' }, 'hello', {}), { object: { hi: 'x' }, seen: null });
  }
  assert.deepEqual(await dispatch({ answer: () => { throw new Error('describe'); } }, { id: 'x' }, undefined, {}), { threw: true });
  assert.deepEqual(await dispatch({ answer: () => silence }, { id: 'x' }, undefined, {}), { silence: true });
});

test('the root refuses an invite on a taken id with a word, never a null', async () => {
  const harbor = new MemoryHarbor({ classes: { Host }, random: splitmix64(11n) });
  const B = await harbor.boot('B', emptyPartition());
  await B.ask('boot', { key: 'host', class: 'Host' });
  assert.ok(await B.ask('invite', { being: 'host', id: 'probe' }));
  assert.deepEqual(await B.ask('invite', { being: 'host', id: 'probe' }), { error: 'id taken' });
});
