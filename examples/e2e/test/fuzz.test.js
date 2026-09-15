// The fuzzer, `SCENARIOS.md` "How the world is built": each seed's story told
// in both directions, and the two lists of what every step showed are one.
// `FUZZ_SEEDS` names how many seeds run, from `FUZZ_FROM`, and a failure
// names the seed and the step where the two directions part.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plan, tell } from '../src/fuzz.js';

const SEEDS = Number(process.env.FUZZ_SEEDS ?? 16);
const FROM = Number(process.env.FUZZ_FROM ?? 1);
const LENGTH = 48;

test('a seed draws one plan, whichever kit stands where', () => {
  assert.deepEqual(plan(7, LENGTH), plan(7, LENGTH));
  assert.notDeepEqual(plan(7, LENGTH), plan(8, LENGTH));
});

for (let seed = FROM; seed < FROM + SEEDS; seed++) {
  test(`seed ${seed}: both directions show the same at every step`, async () => {
    const steps = plan(seed, LENGTH);
    const jsDoor = await tell(steps, { doorKit: 'js', askerKit: 'rust' });
    const rustDoor = await tell(steps, { doorKit: 'rust', askerKit: 'js' });
    for (let i = 0; i < steps.length; i++) {
      assert.deepEqual(rustDoor[i], jsDoor[i], `seed ${seed}, step ${i}: the directions part`);
    }
  });
}
