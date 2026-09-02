// Part one of papers/quo-truth.md: what the warden provides. Written from the
// paper alone. Every case here is a sentence of that part made checkable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Warden, MemoryStore, memoryDelivery, seeds } from '../src/index.js';

const utf8 = new TextEncoder();
const still = () => 1_000;
const random = () => crypto.getRandomValues(new Uint8Array(32));

const COUNTER = `Counter
  bump() int
  read() int
`;

class Counter {
  constructor() {
    this.n = 0n;
  }
  bump() {
    this.n += 1n;
    return this.n;
  }
  read() {
    return this.n;
  }
}

// Two grounds in one process, reached by a delivery that hands bytes straight
// to the far warden's one entry point. No road, no socket, and no step waived.
async function pair() {
  const delivery = memoryDelivery();
  const alice = await Warden.open({ seeds: seeds(random), clock: still, random, delivery });
  const bob = await Warden.open({ seeds: seeds(random), clock: still, random, delivery });
  delivery.attach('mem://alice', alice);
  delivery.attach('mem://bob', bob);
  alice.publish('mem://alice');
  bob.publish('mem://bob');
  return { alice, bob, delivery };
}

test('one entry point takes any arriving bytes and answers bytes or silence', async () => {
  const { alice, bob } = await pair();
  const counter = new Counter();
  const { being } = await alice.hold(counter, { blueprint: COUNTER });
  const invitation = await counter.quo.grant(counter);
  const [handle] = await bob.accept(invitation, { label: 'counter' });

  // An ask arriving is judged and answered.
  assert.equal(await handle.bump(), 1n);
  // Garbage arriving is silence, and the door says nothing about why.
  assert.equal(await alice.arrive(utf8.encode('not an envelope')), null);
  assert.equal(await alice.arrive(new Uint8Array(0)), null);
  assert.ok(being instanceof Uint8Array);
});

test('the closure offers the caller as a fact: holder, rotation or stranger', async () => {
  const { alice, bob } = await pair();
  const seen = [];
  const counter = new Counter();
  counter.bump = function bump() {
    seen.push({ voice: this.quo.caller.voice, kind: this.quo.caller.kind });
    return ++this.n;
  };
  await alice.hold(counter, { blueprint: COUNTER });
  const invitation = await counter.quo.grant(counter);
  const [handle] = await bob.accept(invitation, { label: 'counter' });
  // Accepting is two rotations; the first call after it is a plain ask.
  await handle.bump();
  await handle.bump();
  assert.equal(seen.length, 2);
  assert.equal(seen[0].kind, 'holder');
  assert.ok(seen[0].voice instanceof Uint8Array);
  // A copy, never the row: mutating it changes nothing at the door.
  seen[0].voice.fill(0);
  assert.equal(await handle.bump(), 3n);
});

test('standings are offered as voices only', async () => {
  const { alice, bob } = await pair();
  const counter = new Counter();
  await alice.hold(counter, { blueprint: COUNTER });
  assert.deepEqual(counter.quo.standings(), []);
  const invitation = await counter.quo.grant(counter);
  await bob.accept(invitation, { label: 'counter' });
  const held = counter.quo.standings();
  assert.equal(held.length, 1);
  assert.deepEqual(Object.keys(held[0]), ['voice']);
});

test('grant names the being it opens, and release takes every standing with it', async () => {
  const { alice, bob } = await pair();
  const counter = new Counter();
  const other = new Counter();
  await alice.hold(counter, { blueprint: COUNTER });
  await alice.hold(other, { blueprint: COUNTER });
  const invitation = await counter.quo.grant(other);
  const [handle] = await bob.accept(invitation, { label: 'other' });
  assert.equal(await handle.bump(), 1n);
  // Bob reaches `other` and not `counter`.
  assert.equal(other.quo.standings().length, 1);
  assert.equal(counter.quo.standings().length, 0);
  // Released: Bob's next call meets silence, indistinguishable from anything.
  counter.quo.release(other);
  assert.equal(await handle.bump(), null);
});

test('hold mints a smaller being beside me and relation reaches it through the handle', async () => {
  const { alice } = await pair();
  const counter = new Counter();
  await alice.hold(counter, { blueprint: COUNTER });
  const { handle } = await counter.quo.hold(new Counter(), { blueprint: COUNTER, label: 'small' });
  // Same warden, same shape: asynchronous, a value or silence.
  const answer = handle.bump();
  assert.ok(answer instanceof Promise);
  assert.equal(await answer, 1n);
  assert.equal(await counter.quo.relation('small').read(), 1n);
  counter.quo.release(counter.quo.relation('small'));
  assert.equal(await handle.read(), null);
});

test('why it fell silent is told inward, and nothing crosses the wire', async () => {
  const { alice } = await pair();
  const reasons = [];
  alice.observe((why) => reasons.push(why.reason));
  assert.equal(await alice.arrive(utf8.encode('garbage')), null);
  assert.ok(reasons.length >= 1);
  assert.equal(typeof reasons[0], 'string');
});

test('a hint is stored and carried as an opaque string, never parsed', async () => {
  const { alice, bob } = await pair();
  const counter = new Counter();
  await alice.hold(counter, { blueprint: COUNTER });
  alice.publish('anything at all, even this');
  const invitation = await counter.quo.grant(counter);
  assert.ok(invitation.hints.includes('anything at all, even this'));
  // Delivery walks past what it cannot speak; the door still answers on the
  // road it can.
  const [handle] = await bob.accept(invitation, { label: 'counter' });
  assert.equal(await handle.bump(), 1n);
});

test('what must survive a restart lives in the store the host handed in', async () => {
  const delivery = memoryDelivery();
  const store = new MemoryStore();
  const aliceSeeds = seeds(random);
  let alice = await Warden.open({ seeds: aliceSeeds, clock: still, random, delivery, store });
  const bob = await Warden.open({ seeds: seeds(random), clock: still, random, delivery });
  delivery.attach('mem://alice', alice);
  delivery.attach('mem://bob', bob);
  alice.publish('mem://alice');
  bob.publish('mem://bob');

  const counter = new Counter();
  const beingSeed = random();
  const { being } = await alice.hold(counter, { blueprint: COUNTER, seed: beingSeed });
  const [handle] = await bob.accept(await counter.quo.grant(counter), { label: 'counter' });
  assert.equal(await handle.bump(), 1n);
  const spent = await handle.seal('bump');
  assert.equal(await handle.send(spent), 2n);

  // The process dies. A new warden opens on the same seeds and the same
  // store, holds the same object again, and Bob's standing is still there.
  alice = await Warden.open({ seeds: aliceSeeds, clock: still, random, delivery, store });
  delivery.attach('mem://alice', alice);
  const again = new Counter();
  await alice.hold(again, { blueprint: COUNTER, seed: beingSeed });
  assert.equal(again.quo.standings().length, 1);
  assert.equal(await handle.bump(), 1n);
  // The marks survived too: the envelope spent before the restart is silence.
  assert.equal(await handle.send(spent), null);
  assert.ok(being);
});
