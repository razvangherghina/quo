// Part two of papers/quo-truth.md: what a being receives, played as Alice, Bob
// and the clinic. Written from the paper alone. The beings below know which of
// their references are Quo and nothing about roads or hosts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  Warden,
  WARDEN_DIGEST,
  memoryDelivery,
  seeds,
  digest,
  parse,
  print,
  encode,
  decode,
  pack,
  depart,
} from '../src/index.js';
import { hex } from '../src/bytes.js';

const still = () => 1_000;
const random = () => crypto.getRandomValues(new Uint8Array(32));
const INT_LIST = { list: { base: 'int' } };

const DOG = `Dog
  name() text
  logWalk(minutes int) bool
  vaccinated() bool?
  invite() invitation
`;

class Dog {
  constructor(name) {
    this.dogName = name;
    this.walks = [];
  }
  name() {
    return this.dogName;
  }
  logWalk(minutes) {
    this.walks.push(minutes);
    return true;
  }
  async vaccinated() {
    const record = this.quo.relation('clinic');
    if (!record) return null;
    return (await record.vaccinated()) ?? null;
  }
  async invite() {
    return this.quo.grant(this);
  }
  cells() {
    return encode(INT_LIST, this.walks);
  }
  take(bytes) {
    this.walks = decode(INT_LIST, bytes);
  }
}

const RECORD = `Record
  vaccinated() bool
`;

class Record {
  vaccinated() {
    return true;
  }
}

const PROFILE = `Profile
  name() text
  rate() int
`;

class Profile {
  name() {
    return 'Bob';
  }
  rate() {
    return 20n;
  }
}

const WALKER = `Walker
  subscribe(inbox invitation) bool
  walk(minutes int) bool
  secret() text
`;

class Walker {
  constructor() {
    this.listener = null;
  }
  async subscribe(invitation) {
    this.listener = (await this.quo.accept(invitation, { label: 'inbox' }))?.[0] ?? null;
    return this.listener !== null;
  }
  async walk(minutes) {
    const rex = this.quo.relation('rex');
    if (!rex) return false;
    const logged = await rex.logWalk(minutes);
    if (logged === null) return false;
    await this.listener?.walked(minutes);
    return true;
  }
  secret() {
    return 'nobody sees this';
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

async function world() {
  const delivery = memoryDelivery();
  const open = async (hint) => {
    const warden = await Warden.open({ seeds: seeds(random), clock: still, random, delivery });
    delivery.attach(hint, warden);
    warden.publish(hint);
    return warden;
  };
  const phone = await open('mem://alice');
  const laptop = await open('mem://bob');
  const clinic = await open('mem://clinic');

  const rex = new Dog('Rex');
  const inbox = new Inbox();
  const walker = new Walker();
  const profile = new Profile();
  const record = new Record();
  await phone.hold(rex, { blueprint: DOG });
  await phone.hold(inbox, { blueprint: INBOX });
  await laptop.hold(walker, { blueprint: WALKER });
  await laptop.hold(profile, { blueprint: PROFILE });
  await clinic.hold(record, { blueprint: RECORD });

  return { phone, laptop, clinic, rex, inbox, walker, profile, record };
}

test('1. Alice lets Bob walk Rex: a grant, an accept, and Walker holds a handle', async () => {
  const { rex, walker } = await world();
  const invitation = await rex.invite();
  await walker.quo.accept(invitation, { label: 'rex' });
  assert.equal(await walker.quo.relation('rex').name(), 'Rex');
  assert.equal(await walker.walk(30n), true);
  assert.deepEqual(rex.walks, [30n]);
});

test('2. Bob narrows what Alice sees: Profile is granted, Walker never is', async () => {
  const { rex, walker, profile } = await world();
  const [handle] = await rex.quo.accept(await profile.quo.grant(profile), { label: 'bob' });
  assert.equal(await handle.name(), 'Bob');
  assert.equal(await handle.rate(), 20n);
  // Alice's estate at Bob's door holds Profile and the public being, nothing
  // of Walker. Its fields do not exist for her.
  assert.equal(handle.secret, undefined);
  assert.equal(walker.quo.standings().length, 0);
});

test('3. the chain: Bob asks Rex, Rex asks Record, and the clinic sees Rex, not Bob', async () => {
  const { rex, walker, record } = await world();
  const callers = [];
  record.vaccinated = function vaccinated() {
    callers.push(this.quo.caller.voice);
    return true;
  };
  await rex.quo.accept(await record.quo.grant(record), { label: 'clinic' });
  await walker.quo.accept(await rex.invite(), { label: 'rex' });
  assert.equal(await walker.quo.relation('rex').vaccinated(), true);
  // Rex's voice at the clinic is the one the clinic minted for Rex; Bob has
  // no standing there and could not ask directly.
  assert.equal(callers.length, 1);
  assert.deepEqual(callers[0], record.quo.standings()[0].voice);
});

test('3b. the leash shrinks by one hop along the chain, and a being never widens it', async () => {
  const { rex, walker, record } = await world();
  const leashes = [];
  rex.vaccinated = async function vaccinated() {
    leashes.push(this.quo.leash.hops);
    return (await this.quo.relation('clinic').vaccinated()) ?? null;
  };
  record.vaccinated = function vaccinated() {
    leashes.push(this.quo.leash.hops);
    return true;
  };
  await rex.quo.accept(await record.quo.grant(record), { label: 'clinic' });
  await walker.quo.accept(await rex.invite(), { label: 'rex' });
  await walker.quo.relation('rex').vaccinated();
  assert.equal(leashes.length, 2);
  assert.equal(leashes[1], leashes[0] - 1n);
});

test('4. subscription is a grant backwards: Inbox is the callback, and a push is an ask', async () => {
  const { rex, inbox, walker } = await world();
  await walker.quo.accept(await rex.invite(), { label: 'rex' });
  // Alice hands Bob's Walker an invitation to Inbox, through a field Walker
  // declares. There is no subscribe verb anywhere beneath this.
  const [bob] = await rex.quo.accept(await walker.quo.grant(walker), { label: 'walker' });
  assert.equal(await bob.subscribe(await inbox.quo.grant(inbox)), true);
  await bob.walk(15n);
  await bob.walk(25n);
  assert.deepEqual(inbox.heard, [15n, 25n]);
  assert.deepEqual(rex.walks, [15n, 25n]);
});

test('4b. unsubscribing needs no verb: release Inbox and the push meets silence', async () => {
  const { rex, inbox, walker } = await world();
  await walker.quo.accept(await rex.invite(), { label: 'rex' });
  const [bob] = await rex.quo.accept(await walker.quo.grant(walker), { label: 'walker' });
  await bob.subscribe(await inbox.quo.grant(inbox));
  await bob.walk(10n);
  inbox.quo.release(inbox);
  // The walk is still logged; only the push finds nobody.
  assert.equal(await bob.walk(20n), true);
  assert.deepEqual(inbox.heard, [10n]);
  assert.deepEqual(rex.walks, [10n, 20n]);
});

test('5. Alice fires Bob: amend, and the next call is silence', async () => {
  const { rex, walker } = await world();
  await walker.quo.accept(await rex.invite(), { label: 'rex' });
  const handle = walker.quo.relation('rex');
  assert.equal(await handle.logWalk(5n), true);
  const [bob] = rex.quo.standings();
  rex.quo.amend(bob.voice, { remove: [rex] });
  assert.equal(await handle.logWalk(5n), null);
  assert.equal(await handle.name(), null);
  assert.deepEqual(rex.walks, [5n]);
});

test('silence after a write: resending the identical envelope is honoured at most once', async () => {
  const { rex, walker } = await world();
  await walker.quo.accept(await rex.invite(), { label: 'rex' });
  const handle = walker.quo.relation('rex');
  // The handle can hand back the envelope it sealed, so a caller that met
  // silence resends the same bytes and never a fresh number.
  const sealed = await handle.seal('logWalk', 40n);
  assert.equal(await handle.send(sealed), true);
  assert.equal(await handle.send(sealed), null);
  assert.deepEqual(rex.walks, [40n]);
});

test('a same-warden call goes through the handle: asynchronous, no seal, one shape', async () => {
  const { phone, rex } = await world();
  const { handle } = await rex.quo.hold(new Dog('Pup'), { blueprint: DOG, label: 'pup' });
  const reasons = [];
  phone.observe((why) => reasons.push(why));
  const answer = handle.name();
  assert.ok(answer instanceof Promise);
  assert.equal(await answer, 'Pup');
  assert.equal(await rex.quo.relation('pup').logWalk(3n), true);
  // Nothing was judged: the door was never asked and never fell silent.
  assert.deepEqual(reasons, []);
});

test('what a being shows decides what moves: cells and take are the contract', () => {
  const rex = new Dog('Rex');
  rex.logWalk(7n);
  rex.logWalk(8n);
  const bytes = rex.cells();
  const again = new Dog('Rex');
  again.take(bytes);
  assert.deepEqual(again.walks, [7n, 8n]);
});

// A migration carries one being. Rex mints Landing beside itself and Bob takes
// a standing at Landing; when Rex moves, Landing does not go with it, and the
// standing at Landing is untouched by the move. No warden records which being
// minted which, and this is why none needs to.
test('a migration carries one being: what Rex minted stays where it was minted', async () => {
  const { phone, laptop, rex, walker } = await world();
  const landing = new Inbox();
  const { being: landingPk } = await rex.quo.hold(landing, { blueprint: INBOX, label: 'landing' });
  await walker.quo.accept(await phone.grant(landingPk), { label: 'landing' });
  assert.equal(walker.quo.relation('landing') !== null, true);

  const cargo = pack(phone, rex.quo.being);
  const carried = cargo.standings.flatMap((one) => one.beings.map((pk) => hex(pk)));
  assert.equal(carried.includes(hex(landingPk)), false, 'Landing is not in the cargo');

  const before = phone.standings(landingPk).length;
  depart(phone, rex.quo.being, {
    commitment: new Uint8Array(32),
    name: laptop.name.pk,
    padlock: laptop.padlock.pk,
    hints: laptop.hints,
  });

  // Rex is gone from the old door; Landing stands where it was minted, and the
  // standing at it is what it was before the move.
  assert.equal(phone.beings.has(hex(rex.quo.being)), false);
  assert.equal(phone.beings.has(hex(landingPk)), true);
  assert.equal(phone.standings(landingPk).length, before);
  await walker.quo.relation('landing').walked(11n);
  assert.deepEqual(landing.heard, [11n]);
});

// A standing names beings, plural, and accepting one answers a handle for each
// of them. The public being is not among them: it is reached by every voice and
// is what a knock answers with.
test('accept answers one handle per being the standing names', async () => {
  const { rex, inbox, walker } = await world();
  const invitation = await rex.quo.grant(rex);
  const [held] = rex.quo.standings();
  rex.quo.amend(held.voice, { add: [inbox] });

  const handles = await walker.quo.accept(invitation);
  assert.equal(handles.length, 2);
  const atRex = handles.find((one) => hex(one.being) === hex(rex.quo.being));
  const atInbox = handles.find((one) => hex(one.being) === hex(inbox.quo.being));
  // Each handle is at its own being, carrying that being's own declared fields.
  assert.equal(await atRex.name(), 'Rex');
  await atInbox.walked(9n);
  assert.deepEqual(inbox.heard, [9n]);
  assert.equal(atRex.walked, undefined);
  assert.equal(atInbox.name, undefined);
});

test('a standing widened later is re-read from the far door, never remembered', async () => {
  const { rex, inbox, walker } = await world();
  const [handle] = await walker.quo.accept(await rex.quo.grant(rex));
  assert.deepEqual(
    (await handle.handles()).map((one) => hex(one.being)),
    [hex(rex.quo.being)],
  );

  const [held] = rex.quo.standings();
  rex.quo.amend(held.voice, { add: [inbox] });

  const widened = await handle.handles();
  assert.equal(widened.length, 2);
  const atInbox = widened.find((one) => hex(one.being) === hex(inbox.quo.being));
  await atInbox.walked(4n);
  assert.deepEqual(inbox.heard, [4n]);
});

test("a holder's describe shows what its row names, and never the rest of the estate", async () => {
  const { rex, walker, profile } = await world();
  const [handle] = await rex.quo.accept(await profile.quo.grant(profile));
  const estate = await handle.describe();
  const shown = estate.classes.map((one) => hex(one.digest)).sort();
  const expected = [hex(await digest(parse(PROFILE))), hex(WARDEN_DIGEST)].sort();
  assert.deepEqual(shown, expected);

  // The being it holds sketches; the one it does not is silence, because a door
  // that answered absent would be a door confirming the being exists.
  const sketch = await handle.sketch();
  assert.equal(hex(sketch.being), hex(profile.quo.being));
  assert.equal(await handle.sketch(walker), null);
  // A blueprint by digest, for a class it reaches and for one it does not.
  assert.equal(await handle.blueprint(await digest(parse(PROFILE))), print(parse(PROFILE)));
  assert.equal(await handle.blueprint(await digest(parse(WALKER))), null);
  assert.equal(typeof (await handle.limit()), 'bigint');
});

test('a knock is a card turned into a handle at the public being, held as a stranger', async () => {
  const { laptop, rex, walker } = await world();
  const knocked = await rex.quo.knock(laptop.card());
  assert.equal(hex(knocked.being), hex(laptop.name.pk));

  // The estate a stranger is shown has one room in it: the public being.
  const estate = await knocked.describe();
  assert.equal(estate.classes.length, 1);
  assert.equal(hex(estate.classes[0].digest), hex(WARDEN_DIGEST));
  assert.equal(estate.classes[0].beings.length, 1);
  // Its own fields answer; a being it holds no standing at is silence. The
  // public being is of the Warden's own class, which declares these four
  // itself, so on this one handle they are the blueprint's fields and the
  // being is named rather than defaulted.
  assert.equal(typeof (await knocked.limit()), 'bigint');
  assert.equal(hex((await knocked.sketch(knocked.being)).being), hex(laptop.name.pk));
  assert.equal(await knocked.sketch(walker.quo.being), null);
  assert.equal(await knocked.blueprint(await digest(parse(WALKER))), null);
  // A stranger reaches no being of Bob's, so nothing is accepted from a knock.
  assert.equal(await knocked.handles(), null);
});

test('a same-warden handle answers the same introspection, with nothing judged', async () => {
  const { phone, rex } = await world();
  const { being, handle } = await rex.quo.hold(new Dog('Pup'), { blueprint: DOG, label: 'pup' });
  const reasons = [];
  phone.observe((why) => reasons.push(why));

  const estate = await handle.describe();
  const shown = estate.classes.map((one) => hex(one.digest)).sort();
  assert.deepEqual(shown, [hex(await digest(parse(DOG))), hex(WARDEN_DIGEST)].sort());
  assert.equal(hex((await handle.sketch()).being), hex(being));
  // Outside what a standing at this being would reach: silence, as at a door.
  assert.equal(await handle.sketch(rex), null);
  assert.equal(await handle.blueprint(await digest(parse(DOG))), print(parse(DOG)));
  assert.equal(await handle.blueprint(await digest(parse(WALKER))), null);
  assert.equal(await handle.limit(), phone.limit);
  assert.deepEqual(
    (await handle.handles()).map((one) => hex(one.being)),
    [hex(being)],
  );

  // Released, every one of them is the same silence a far door would answer.
  rex.quo.release(being);
  assert.equal(await handle.describe(), null);
  assert.equal(await handle.sketch(), null);
  assert.equal(await handle.limit(), null);
  assert.deepEqual(reasons, []);
});

test('a being reaches its warden only through the closure, and never a key', async () => {
  const { rex } = await world();
  const keys = Object.keys(rex.quo);
  for (const name of keys) assert.ok(!/secret|padlock|seed/i.test(name), name);
});
