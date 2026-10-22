// Two kits judged against each other through the verifier's proxy.
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';

import { verifyTwo } from '../carried.js';

const kit = join(import.meta.dirname, '../../examples/javascript');

test("The carrier. One kit asking another, both read through the verifier's proxy, is judged without a failure", async () => {
  const stand = join(kit, 'stand');
  const { results, counts } = await verifyTwo({
    first: [stand],
    second: [stand],
    cwd: kit,
    onRecord: () => {},
  });
  assert.deepEqual(
    results.filter((r) => !r.ok).map((r) => r.name),
    [],
  );
  assert.ok(results.length > 50);
  assert.match(counts, /frames and posts carried between two programs/);
});
