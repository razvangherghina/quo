// What the kit reaches for, and what it refuses to reach for. Both cases here
// are swept over the kit's own source rather than driven through its API,
// because both are promises about the whole surface: they must hold for code
// nobody thought to call, and a case that drove one path would pass while
// another path reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Every module an entry can reach, by walking the relative specifiers out of
// its text. Flat files, plain specifiers: no resolver is needed and none is
// wanted, because a resolver is a thing that could be wrong.
async function reachable(from) {
  const seen = new Map();
  const queue = [new URL(from, import.meta.url).href];
  while (queue.length > 0) {
    const at = queue.pop();
    if (seen.has(at)) continue;
    const text = await readFile(new URL(at), 'utf8');
    const specifiers = [
      ...[...text.matchAll(/\bfrom\s+'([^']+)'/g)].map((one) => one[1]),
      ...[...text.matchAll(/\bimport\('([^']+)'\)/g)].map((one) => one[1]),
      ...[...text.matchAll(/\brequire\('([^']+)'\)/g)].map((one) => one[1]),
    ];
    seen.set(at, { text, specifiers });
    for (const one of specifiers) if (one.startsWith('.')) queue.push(new URL(one, at).href);
  }
  return seen;
}

// Every way this platform hands out randomness. The arithmetic's own
// `crypto.subtle` is deliberately not among them: taking SHA-256 from the
// platform is Article VI, and drawing a key out of sight is the thing being
// refused.
const DRAWS = [
  'getRandomValues',
  'randomUUID',
  'Math.random',
  'randomBytes',
  'randomFillSync',
  'randomFill',
  'randomInt',
  'generateKey',
  'generateKeyPair',
];

test('the kit never reaches for randomness, on any road', async () => {
  // A house that mints its own keys out of sight cannot be rebuilt, backed up,
  // or tested twice with the same result — so every draw is an argument. The
  // day one call reaches for entropy itself, this goes red and no case that
  // drives the API would notice, because the reached-for draw would work.
  const roads = ['../src/index.js', '../src/door.js', '../src/line.js'];

  const walked = new Map();
  for (const road of roads) for (const [at, one] of await reachable(road)) walked.set(at, one);
  assert.ok(walked.size >= 10, 'the whole kit was walked');

  for (const [at, module] of walked) {
    for (const draw of DRAWS) {
      assert.equal(
        module.text.includes(draw),
        false,
        `${at} draws its own randomness with ${draw}`,
      );
    }
    // The one import that would carry a draw past a name sweep. The portable
    // half cannot name a host at all; the two roads may, and neither may take
    // this one.
    assert.equal(
      module.specifiers.includes('node:crypto'),
      false,
      `${at} imports the host's randomness`,
    );
  }

  // And the positive half of the same promise, which is why it is worth
  // keeping: what the kit does take, it takes as an argument it was handed.
  const { Warden } = await import('../src/index.js');
  await assert.rejects(() => Warden.open({}), 'a warden with no seeds cannot quietly mint its own');
});

test('the kit declares no dependencies at all', async () => {
  // Read by every builder as a supply-chain promise, and published on the
  // guide's first page beside the install line. Nothing else in any gate
  // reads it, so it would survive the first day somebody added one.
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

  for (const field of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    assert.deepEqual(manifest[field] ?? {}, {}, `the kit declares ${field}`);
  }
  // Nothing in the published files reaches for a bare specifier either: what
  // the manifest does not declare cannot arrive by being imported.
  for (const road of ['../src/index.js', '../src/door.js', '../src/line.js']) {
    for (const [at, module] of await reachable(road)) {
      for (const specifier of module.specifiers) {
        const own = specifier.startsWith('.') || specifier.startsWith('node:');
        assert.ok(own, `${at} imports ${specifier}, which is neither its own nor the host's`);
      }
    }
  }
});
