// Run from the repository's root:
//
//   node examples/e2e/trace.js
//
// Writes `vectors/door.json` from the trace: every door case, with the story
// that puts a kit in its state, told against both kits, and the file written
// only when the two recorded the same bytes, since a door record is a line
// two kits agreed on and never one kit's.

import { writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { ENTROPY, STAND, trace } from './src/trace.js';

const NOTE = [
  "The door's thirteen cases as fixed bytes, each record one arrival at one door: the ask as it arrives, the reply as it leaves, what the reply opens to where the hand holds the lid, and whether the ward wrote while judging it.",
  'Each record carries the story that puts a kit in its state, as `vectors/HARNESS.md` section 7 says: a stand program started with `stand` beside `--listen` and `--entropy`, the steps of the world the record names, then its own steps, then its arrival.',
  'A `root` step is a request of the root channel, its `ward` the seed text of the ward it names. An `arrive` step is an ask box sent to that ward as one frame, and `reply` the box that came back, or null for a `02`. A `restart` step saves every ward, closes the program, and starts it again from those partitions with the classes it names, under the same entropy.',
  'Every byte a ward draws comes from the SplitMix64 stream of section 6 seeded at `entropy`, and every key the hand draws from its own stream at the same seed, restarted with every record.',
  '`kind` is silence, word, object or nothing. `opens` is null where nobody holds the lid. `blueprint`, on a record whose reply carries a seen, is the shape that digest is taken over.',
].join(' ');

const [js, rust] = [await trace('js'), await trace('rust')];
for (let i = 0; i < js.length; i++) {
  if (!isDeepStrictEqual(js[i], rust[i])) {
    process.stderr.write(`the kits disagree on ${js[i].case} ${js[i].name}\n${JSON.stringify({ js: js[i], rust: rust[i] }, null, 2)}\n`);
    process.exit(1);
  }
}

const worlds = {};
for (const told of js) {
  if (worlds[told.world] && !isDeepStrictEqual(worlds[told.world], told.worldSteps)) {
    process.stderr.write(`the world ${told.world} is not one story across records\n`);
    process.exit(1);
  }
  worlds[told.world] ??= told.worldSteps;
}
const parents = { home: null, bound: 'home' };
const own = Object.fromEntries(Object.entries(worlds).map(([name, steps]) => [name, { from: parents[name], steps: parents[name] ? steps.slice(worlds[parents[name]].length) : steps }]));

const corpus = {
  corpus: 'quo',
  encoding: 'hex',
  area: 'door',
  note: NOTE,
  entropy: String(ENTROPY),
  stand: STAND,
  worlds: own,
  vectors: js.map((told) => ({ case: told.case, name: told.name, world: told.world, steps: told.steps, ...told.record })),
};
writeFileSync(new URL('../../vectors/door.json', import.meta.url), `${JSON.stringify(corpus, null, 2)}\n`);
process.stdout.write(`${corpus.vectors.length} records, both kits agreed\n`);
