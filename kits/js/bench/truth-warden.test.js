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
  const invitation = await counter._quo.grant(counter);
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
    seen.push({ voice: this._quo.caller.voice, kind: this._quo.caller.kind });
    return ++this.n;
  };
  await alice.hold(counter, { blueprint: COUNTER });
  const invitation = await counter._quo.grant(counter);
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
  assert.deepEqual(counter._quo.standings(), []);
  const invitation = await counter._quo.grant(counter);
  await bob.accept(invitation, { label: 'counter' });
  const held = counter._quo.standings();
  assert.equal(held.length, 1);
  assert.deepEqual(Object.keys(held[0]), ['voice']);
});

test('grant names the being it opens, and release takes every standing with it', async () => {
  const { alice, bob } = await pair();
  const counter = new Counter();
  const other = new Counter();
  await alice.hold(counter, { blueprint: COUNTER });
  await alice.hold(other, { blueprint: COUNTER });
  const invitation = await counter._quo.grant(other);
  const [handle] = await bob.accept(invitation, { label: 'other' });
  assert.equal(await handle.bump(), 1n);
  // Bob reaches `other` and not `counter`.
  assert.equal(other._quo.standings().length, 1);
  assert.equal(counter._quo.standings().length, 0);
  // Released: Bob's next call meets silence, indistinguishable from anything.
  counter._quo.release(other);
  assert.equal(await handle.bump(), null);
});

test('hold mints a smaller being beside me and relation reaches it through the handle', async () => {
  const { alice } = await pair();
  const counter = new Counter();
  await alice.hold(counter, { blueprint: COUNTER });
  const { handle } = await counter._quo.hold(new Counter(), { blueprint: COUNTER, label: 'small' });
  // Same warden, same shape: asynchronous, a value or silence.
  const answer = handle.bump();
  assert.ok(answer instanceof Promise);
  assert.equal(await answer, 1n);
  assert.equal(await counter._quo.relation('small').read(), 1n);
  counter._quo.release(counter._quo.relation('small'));
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
  const invitation = await counter._quo.grant(counter);
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
  const [handle] = await bob.accept(await counter._quo.grant(counter), { label: 'counter' });
  assert.equal(await handle.bump(), 1n);
  const spent = await handle._quo.seal('bump');
  assert.equal(await handle._quo.send(spent), 2n);

  // The process dies. A new warden opens on the same seeds and the same
  // store, holds the same object again, and Bob's standing is still there.
  alice = await Warden.open({ seeds: aliceSeeds, clock: still, random, delivery, store });
  delivery.attach('mem://alice', alice);
  const again = new Counter();
  await alice.hold(again, { blueprint: COUNTER, seed: beingSeed });
  assert.equal(again._quo.standings().length, 1);
  assert.equal(await handle.bump(), 1n);
  // The marks survived too: the envelope spent before the restart is silence.
  assert.equal(await handle._quo.send(spent), null);
  assert.ok(being);
});

test('a label survives a restart onto the row it named, not another at the same door', async () => {
  const delivery = memoryDelivery();
  const store = new MemoryStore();
  const alice = await Warden.open({ seeds: seeds(random), clock: still, random, delivery });
  const bobSeeds = seeds(random);
  let bob = await Warden.open({ seeds: bobSeeds, clock: still, random, delivery, store });
  delivery.attach('mem://alice', alice);
  delivery.attach('mem://bob', bob);
  alice.publish('mem://alice');
  bob.publish('mem://bob');

  const counter = new Counter();
  await alice.hold(counter, { blueprint: COUNTER });
  assert.ok(await bob.knock(alice.card(), { label: 'front' }));
  const [handle] = await bob.accept(await counter._quo.grant(counter), { label: 'counter' });
  assert.equal(await handle.bump(), 1n);
  await bob.keep();

  bob = await Warden.open({ seeds: bobSeeds, clock: still, random, delivery, store });
  delivery.attach('mem://bob', bob);
  const kept = bob.labels.get('counter');
  assert.equal(await kept.handle.bump(), 2n);
  assert.ok(bob.labels.get('front'));
});

// "The graph is nobody's — every being holds only its own edges, so no one
// holds the whole." The whole-graph half of that is a claim about the world and
// no case can hold it: nothing here can speak for every vantage point that
// could ever exist. What is assertable is the mechanism the claim rests on, and
// it is assertable at its strongest point — not what a caller is shown, which
// `subcontractor.test.js` already holds, but what the house itself keeps.
//
// A warden's store snapshot is the fullest vantage that exists anywhere in this
// system: every fact a restart must not lose, including the secrets. So a chain
// of three houses, and the end of it read whole. It is asserted as text rather
// than field by field on purpose — a field added later would slip past a check
// written against the fields of today, and the promise is about the record and
// not about the fields anyone remembered.
test('the fullest vantage in the system stops at one hop: a whole record names no third house', async () => {
  const delivery = memoryDelivery();
  const houses = {};
  for (const name of ['studio', 'agency', 'retailer']) {
    houses[name] = { store: new MemoryStore(), hint: `mem://${name}` };
    houses[name].warden = await Warden.open({
      seeds: seeds(random),
      clock: still,
      random,
      delivery,
      store: houses[name].store,
    });
    delivery.attach(`mem://${name}`, houses[name].warden);
    houses[name].warden.publish(`mem://${name}`);
  }
  const { studio, agency, retailer } = houses;

  // The retailer holds the assets and lets the agency in; the agency holds the
  // brief and lets the studio in. Nobody grants anybody two houses away,
  // because there is no way to.
  const assets = new Counter();
  await retailer.warden.hold(assets, { blueprint: COUNTER, seed: random() });
  await agency.warden.accept(await assets._quo.grant(assets), { label: 'assets' });

  const brief = new Counter();
  await agency.warden.hold(brief, { blueprint: COUNTER, seed: random() });
  await studio.warden.accept(await brief._quo.grant(brief), { label: 'brief' });

  const hex = (bytes) => Buffer.from(bytes).toString('hex');
  const whole = (house) => JSON.stringify(house.store.snapshot);
  const names = (house) => [hex(house.warden.name.pk), hex(house.warden.padlock.pk), house.hint];

  // The middle house holds an edge at each end, and that is the bound rather
  // than a leak. But the two edges are not the same size: the house it reached
  // out to is in its record whole, and the house that reached in is a voice and
  // a way back — its padlock and its hint, never its name. A granting house
  // does not learn who its caller's house is.
  for (const one of names(retailer)) {
    assert.ok(whole(agency).includes(one), 'the agency has lost the house it reached out to');
  }
  assert.ok(whole(agency).includes(hex(studio.warden.padlock.pk)), 'no way back to the studio');
  assert.ok(whole(agency).includes(studio.hint), 'no way back to the studio');
  assert.equal(
    whole(agency).includes(hex(studio.warden.name.pk)),
    false,
    'the agency learned the name of the house that reached in',
  );

  // And the ends know only the middle. Not the far warden's key, not its
  // padlock, not the road it publishes — nothing of it is anywhere in the
  // fullest thing this house holds.
  for (const one of names(retailer)) {
    assert.equal(whole(studio).includes(one), false, `the studio's record names the retailer`);
  }
  for (const one of names(studio)) {
    assert.equal(whole(retailer).includes(one), false, `the retailer's record names the studio`);
  }
});
