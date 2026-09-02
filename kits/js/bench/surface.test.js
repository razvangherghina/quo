// What the kit reaches for, and what it refuses to reach for. Both cases here
// are swept over the kit's own source rather than driven through its API,
// because both are promises about the whole surface: they must hold for code
// nobody thought to call, and a case that drove one path would pass while
// another path reached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

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

// Every entry point the manifest publishes. A promise about the surface holds
// for the whole surface or for none of it, so nothing here is swept from fewer
// than all five.
const ENTRIES = [
  '../src/index.js',
  '../src/host.js',
  '../src/door.js',
  '../src/line.js',
  '../src/line-ws.js',
];

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
  const walked = new Map();
  for (const road of ENTRIES) for (const [at, one] of await reachable(road)) walked.set(at, one);
  assert.ok(walked.size >= 10, 'the whole kit was walked');

  // The WebSocket road is the one file that draws, and what it draws is not
  // Quo's: a frame's masking key and the handshake nonce, both the road's own
  // plumbing below the seal, in a file that never holds a being, a voice or a
  // padlock. So its draws are asserted rather than waived — the form is pinned
  // and every other name stays refused, and a key minted there still goes red.
  const WS = new URL('../src/line-ws.js', import.meta.url).href;

  for (const [at, module] of walked) {
    const road = at === WS;
    for (const draw of DRAWS) {
      if (road && draw === 'getRandomValues') continue;
      assert.equal(
        module.text.includes(draw),
        false,
        `${at} draws its own randomness with ${draw}`,
      );
    }
    if (road) {
      const drawn = [...module.text.matchAll(/[\w.]*\bgetRandomValues\b/g)].map((one) => one[0]);
      assert.deepEqual(
        [...new Set(drawn)],
        ['globalThis.crypto.getRandomValues'],
        'the WebSocket road draws by some other hand than the platform’s',
      );
    }
    // The one import that would carry a draw past a name sweep. The portable
    // half cannot name a host at all; the roads may, and only the WebSocket
    // handshake's digest takes this one.
    assert.equal(
      module.specifiers.includes('node:crypto') && !road,
      false,
      `${at} imports the host's randomness`,
    );
  }

  // And the positive half of the same promise, which is why it is worth
  // keeping: what the kit does take, it takes as an argument it was handed.
  const { Warden } = await import('../src/index.js');
  await assert.rejects(() => Warden.open({}), 'a warden with no seeds cannot quietly mint its own');
});

test('the law never names the company, and neither does any kit', async () => {
  // A standard whose text names its leading vendor is that vendor's standard,
  // whatever the ownership papers say — so this is a promise about who owns Quo
  // rather than about what it does, and the first thing a second implementer
  // would check. A sweep is the only honest form: it has to hold for every
  // article and every file, including the ones nobody thought about.
  const roots = [
    new URL('../../../law/', import.meta.url),
    new URL('../../../kits/', import.meta.url),
  ];
  // The company, never the author. Quo belongs to a private person and is
  // published under his name, so the licence, the notice and the repository URL
  // all carry it and must — what a standard may not carry is the name of the
  // vendor selling its leading implementation.
  const names = ['nervur', 'bookarest', 'parma digital'];

  let swept = 0;
  const walk = async (at) => {
    for (const entry of await readdir(at, { withFileTypes: true })) {
      // What a build put there is not what a kit says. These carry the
      // checkout's own absolute path, which is the repository's name and not
      // the protocol's text.
      const built = ['target', 'node_modules', '.zig-cache', '.venv', 'zig-out', '__pycache__'];
      if (built.includes(entry.name)) continue;
      const here = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, at);
      if (entry.isDirectory()) {
        await walk(here);
        continue;
      }
      if (!/\.(md|js|mjs|go|rs|zig|py|json|toml)$/.test(entry.name)) continue;
      // This file is the one place under `kits/` that has to write the names
      // down, because it is the thing looking for them.
      if (here.href === import.meta.url) continue;
      swept += 1;
      const text = (await readFile(here, 'utf8')).toLowerCase();
      for (const name of names) {
        assert.equal(text.includes(name), false, `${here.href} names ${name}`);
      }
    }
  };
  for (const root of roots) await walk(root);
  assert.ok(swept > 100, `only ${swept} files were swept, which is too few to mean anything`);
});

test('the JS kit supplies no private carriage', async () => {
  // Article III blesses any private carriage two consenting grounds share, and
  // binds only those two — so a kit that shipped one would be handing every
  // user the same private road, which is a contradiction in terms. The stall
  // demo's whole defence of its held call rests on this: the call is a function
  // it wrote itself, correctly, because no kit offers one.
  const kit = await import('../src/index.js');
  const roads = ['post', 'reach'];
  for (const road of roads) assert.ok(road in kit, `the barrel lost ${road}`);

  // What the barrel carries is the common carriage and nothing else. The host
  // and the lines stand behind their own exports, and none of them is private.
  const carried = [];
  for (const entry of ENTRIES) carried.push(...Object.keys(await import(entry)));
  for (const name of carried) {
    assert.doesNotMatch(
      name,
      /^(call|inProcess|direct|loopback|bridge|pipe)/i,
      `${name} reads as a private carriage the kit supplies`,
    );
  }

  // The delivery the kit hands a host for two grounds in one process is the
  // road of distance zero, and it is not a private carriage: it reaches a far
  // ground by that ground's one entry point and by nothing else, so every step
  // of the judgment is paid. Read from the source, because the promise is about
  // every path through the file and not the one a case happens to drive.
  const text = await readFile(new URL('../src/delivery.js', import.meta.url), 'utf8');
  const reaches = [...text.matchAll(/\bfar\.(\w+)/g)].map((one) => one[1]);
  assert.deepEqual([...new Set(reaches)], ['arrive'], 'delivery reaches past the far door');
});

test('a tab can load the host, because no file names a host at the top of itself', async () => {
  // A browser tab is a ground: it stands no road and is reachable only down the
  // lines it dials, which is what `host({ roads: [] })` is. Nothing stopped it
  // being one except where the imports sat — `node:net` and `node:http` read at
  // the top of a module are read the moment a bundler loads it, on a platform
  // that has neither, so the tab failed before a line of Quo ran. Every host
  // import is now inside the one function that stands that road, and only a
  // ground that asks for the road ever reaches it.
  //
  // Swept over the source rather than driven, because the promise is about
  // every module the host reaches and not the ones a case happens to load.
  for (const [at, module] of await reachable('../src/host.js')) {
    const named = [...module.text.matchAll(/\bfrom\s+'(node:[^']+)'/g)].map((one) => one[1]);
    assert.deepEqual(named, [], `${at} names a host at the top of itself`);
  }
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
  for (const entry of ENTRIES) {
    for (const [at, module] of await reachable(entry)) {
      for (const specifier of module.specifiers) {
        const own = specifier.startsWith('.') || specifier.startsWith('node:');
        assert.ok(own, `${at} imports ${specifier}, which is neither its own nor the host's`);
      }
    }
  }
});
