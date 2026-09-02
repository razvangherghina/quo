// The kit's own names are names the notation cannot express.
//
// Article IV's identifier is a letter then letters and digits, so no blueprint
// in any language can spell a name beginning with an underscore. This suite
// holds a being whose blueprint declares every name this kit ever used for
// itself and asserts each answers its own value through a handle — a remote
// one and a local one, because a handle keeps one shape wherever the being is.
//
// **It asserts the value, never that nothing threw.** Two of the three ways
// this defect showed itself were silent: a field the kit had written over
// answered `null`, which is indistinguishable from a refusal, a broken being
// or an absent one. A case that only checked for an exception would have
// passed against every one of them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Warden, memoryDelivery, seeds } from '../src/index.js';
import { hex } from '../src/bytes.js';

const still = () => 1_000;
const random = () => crypto.getRandomValues(new Uint8Array(32));

// Everything this kit has ever reached for on a being or a handle: the closure
// itself, the handle's own facts, the two halves of a seal, and the five looks.
// The list is the bench's, never the kit's — the kit guards no list at all.
const NAMES = [
  'quo',
  'being',
  'seal',
  'send',
  'describe',
  'sketch',
  'moved',
  'blueprint',
  'limit',
  'handles',
  'text',
  'digest',
  'declares',
];

const CLASH = `Clash\n${NAMES.map((name) => `  ${name}() text`).join('\n')}\n`;

class Clash {}
for (const name of NAMES) {
  Clash.prototype[name] = function () {
    return `own:${name}`;
  };
}

// A being that answers one of the two fields its blueprint declares. The
// unanswered one is what a being's own fault looks like from outside, and both
// handle shapes owe the caller the same silence for it.
const LOPSIDED = `Lopsided\n  here() text\n  absent() text\n`;
class Lopsided {
  here() {
    return 'here';
  }
}

const PEER = `Peer\n  poke() bool\n`;
class Peer {
  poke() {
    return true;
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
  const here = await open('mem://here');
  const there = await open('mem://there');

  const clash = new Clash();
  const peer = new Peer();
  const { handle: near } = await here.hold(clash, { blueprint: CLASH });
  await there.hold(peer, { blueprint: PEER });
  const [far] = await peer._quo.accept(await clash._quo.grant(clash), { label: 'clash' });
  return { here, there, clash, peer, near, far };
}

test('every name this kit uses for itself is a field a being may declare, across a door', async () => {
  const { far } = await world();
  for (const name of NAMES) {
    assert.equal(await far[name](), `own:${name}`, name);
  }
});

test('the same is true under one warden: one shape, and the same answers', async () => {
  const { near } = await world();
  for (const name of NAMES) {
    assert.equal(await near[name](), `own:${name}`, name);
  }
});

test("the kit's own machinery stands beside the fields it never ate", async () => {
  const { here, clash, far } = await world();
  // A handle that lost its own seal could not resend after silence, which is
  // the one safe act Article VIII gives a caller.
  assert.equal(hex(far._quo.being), hex(clash._quo.being));
  assert.equal(far._quo.text, CLASH);
  const sealed = await far._quo.seal('digest');
  assert.notEqual(sealed, null);
  assert.equal(await far._quo.send(sealed), 'own:digest');
  assert.notEqual(await far._quo.describe(), null);
  assert.equal(await far._quo.limit(), here.limit);
});

test('the closure is at _quo, so a being declaring quo() keeps its own method', async () => {
  const { clash, near } = await world();
  assert.equal(clash.quo(), 'own:quo');
  assert.equal(typeof clash._quo.grant, 'function');
  assert.equal(hex(near._quo.being), hex(clash._quo.being));
});

test("a being's own fault is the same silence at either shape", async () => {
  const { here, peer } = await world();
  const lopsided = new Lopsided();
  const { handle: near } = await here.hold(lopsided, { blueprint: LOPSIDED });
  const [far] = await peer._quo.accept(await lopsided._quo.grant(lopsided), { label: 'lopsided' });
  for (const handle of [near, far]) {
    assert.equal(await handle.here(), 'here');
    // Never a throw the far side would have swallowed.
    assert.equal(await handle.absent(), null);
  }
});

for (const reserved of ['cells', 'take']) {
  test(`a blueprint declaring ${reserved} is refused`, async () => {
    const { here } = await world();
    await assert.rejects(
      () => here.hold({}, { blueprint: `Thing\n  ${reserved}() bytes\n` }),
      /may not declare/,
      'the being provides this name, so a blueprint may not also claim it',
    );
  });
}

test('a name the blueprint does not declare is not on the handle at all', async () => {
  const { near, far } = await world();
  for (const handle of [near, far]) {
    assert.equal(handle.undeclared, undefined);
    assert.equal(handle.secret, undefined);
  }
});
