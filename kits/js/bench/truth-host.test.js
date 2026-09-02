// Part three of papers/quo-truth.md: what the host does. The same being,
// unchanged, is installed under a warden reached by four roads and gives the
// same answers; a tab that publishes nothing is pushed to down the line it
// holds; a closed tab is weather. Written from the paper alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, Warden, memoryDelivery, seeds } from '../src/index.js';
import { host } from '../src/host.js';
import { TLS, TRUST } from './tls.js';

const still = () => 1_000;
const random = () => crypto.getRandomValues(new Uint8Array(32));

const DOG = `Dog
  name() text
  logWalk(minutes int) bool
`;

class Dog {
  constructor() {
    this.walks = [];
  }
  name() {
    return 'Rex';
  }
  logWalk(minutes) {
    this.walks.push(minutes);
    return true;
  }
}

const INBOX = `Inbox
  walked(minutes int)
`;

class Inbox {
  constructor() {
    this.heard = [];
  }
  walked(minutes) {
    this.heard.push(minutes);
  }
}

const WALKER = `Walker
  subscribe(inbox invitation) bool
  walk(minutes int) bool
`;

class Walker {
  async subscribe(invitation) {
    this.listener = (await this.quo.accept(invitation, { label: 'inbox' }))?.[0] ?? null;
    return this.listener !== null;
  }
  async walk(minutes) {
    await this.listener?.walked(minutes);
    return true;
  }
}

// The host: seeds, clock, randomness, store and delivery handed in, roads
// stood up in front of the warden's one entry point. `host` is the kit's own
// hosting for Node, and the roads it can stand are the ones the law names.
async function stand(roads, hints = []) {
  return host({ seeds: seeds(random), clock: still, random, roads, hints, tls: TLS, trust: TRUST });
}

for (const roads of [['http'], ['tcp'], ['wss'], ['memory']]) {
  test(`the same Dog, installed behind ${roads[0]}, gives the same answers`, async () => {
    const alice = await stand(roads);
    const bob = await stand(roads);
    try {
      const rex = new Dog();
      await alice.warden.hold(rex, { blueprint: DOG });
      const [handle] = await bob.warden.accept(await rex.quo.grant(rex), { label: 'rex' });
      assert.equal(await handle.name(), 'Rex');
      assert.equal(await handle.logWalk(12n), true);
      assert.deepEqual(rex.walks, [12n]);
      // The being never learned the road: nothing on it names one.
      assert.equal(rex.quo.road, undefined);
    } finally {
      await alice.close();
      await bob.close();
    }
  });
}

test('a hint the caller cannot speak is walked past, and the road it can speak carries', async () => {
  // Alice publishes a road nobody here can speak, first, and HTTP after it.
  const alice = await stand(['http'], ['pigeon://loft']);
  const bob = await stand(['http']);
  try {
    const rex = new Dog();
    await alice.warden.hold(rex, { blueprint: DOG });
    const invitation = await rex.quo.grant(rex);
    assert.deepEqual(invitation.hints.length, 2);
    assert.equal(invitation.hints[0], 'pigeon://loft');
    const [handle] = await bob.warden.accept(invitation, { label: 'rex' });
    assert.equal(await handle.name(), 'Rex');
  } finally {
    await alice.close();
    await bob.close();
  }
});

test('a tab publishes nothing: its pushes ride back down the line it holds', async () => {
  // Bob's laptop listens. Alice's tab has no road of its own and dials out.
  const laptop = await stand(['wss']);
  const tab = await stand([]);
  try {
    const walker = new Walker();
    const inbox = new Inbox();
    await laptop.warden.hold(walker, { blueprint: WALKER });
    await tab.warden.hold(inbox, { blueprint: INBOX });
    assert.deepEqual(tab.warden.hints, []);

    const [bob] = await inbox.quo.accept(await walker.quo.grant(walker), { label: 'walker' });
    assert.equal(await bob.subscribe(await inbox.quo.grant(inbox)), true);
    await bob.walk(9n);
    await bob.walk(11n);
    assert.deepEqual(inbox.heard, [9n, 11n]);
  } finally {
    await laptop.close();
    await tab.close();
  }
});

test('a closed tab is weather: the push meets silence, the number is spent, nothing throws', async () => {
  const laptop = await stand(['tcp']);
  const tab = await stand([]);
  const walker = new Walker();
  const inbox = new Inbox();
  await laptop.warden.hold(walker, { blueprint: WALKER });
  await tab.warden.hold(inbox, { blueprint: INBOX });
  const [bob] = await inbox.quo.accept(await walker.quo.grant(walker), { label: 'walker' });
  await bob.subscribe(await inbox.quo.grant(inbox));
  await bob.walk(1n);
  await tab.close();
  // Walker's own answer to itself is unaffected; only the push found nobody.
  assert.equal(await walker.walk(2n), true);
  assert.deepEqual(inbox.heard, [1n]);
  await laptop.close();
});

test('a tab that closes and opens again is answered on its first ask', async () => {
  // The store is written on the acts that change it and not on every ask, so a
  // ground that stops between two asks comes back holding a number the far
  // door has already spent — and its first ask back is refused as the replay
  // it looks exactly like, after the caller has waited out its whole
  // allowance. A ground that knows it is stopping writes its records first,
  // and `close` is where it knows.
  const laptop = await stand(['tcp']);
  const walker = new Walker();
  await laptop.warden.hold(walker, { blueprint: WALKER });

  const store = new MemoryStore();
  const kept = { name: random(), padlock: random(), heir: random() };
  const seed = random();

  const open = async () => {
    const tab = await host({ seeds: kept, clock: still, random, roads: [], store });
    const inbox = new Inbox();
    await tab.warden.hold(inbox, { seed, blueprint: INBOX });
    return { tab, inbox };
  };

  const first = await open();
  const [bob] = await first.inbox.quo.accept(await walker.quo.grant(walker), { label: 'walker' });
  // Two asks after the last act that owed a write, so the number is two ahead
  // of what the store would otherwise have held.
  assert.equal(await bob.walk(1n), true);
  assert.equal(await bob.walk(2n), true);
  await first.tab.close();

  const again = await open();
  try {
    const back = again.tab.warden.relation('walker');
    assert.ok(back, 'the relation survived the tab');
    assert.equal(await back.walk(3n), true, 'and the first ask back was answered, not refused');
  } finally {
    await again.tab.close();
    await laptop.close();
  }
});

test('a road never holds a secret: what the host is handed is seeds, and what it keeps is addresses', async () => {
  const delivery = memoryDelivery();
  const warden = await Warden.open({ seeds: seeds(random), clock: still, random, delivery });
  delivery.attach('mem://one', warden);
  // What delivery is given per row is the way back and nothing else.
  const rows = [];
  delivery.watch((row) => rows.push(row));
  const rex = new Dog();
  await warden.hold(rex, { blueprint: DOG });
  const other = await Warden.open({ seeds: seeds(random), clock: still, random, delivery });
  delivery.attach('mem://two', other);
  other.publish('mem://two');
  warden.publish('mem://one');
  const [handle] = await other.accept(await rex.quo.grant(rex), { label: 'rex' });
  await handle.name();
  assert.ok(rows.length > 0);
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), ['hints', 'padlock']);
  }
});
