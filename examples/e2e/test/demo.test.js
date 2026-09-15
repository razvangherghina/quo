// `demo.js`, run as an adopter runs it: two kits meet, every step prints,
// and the program exits 0.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test('the demo: the JavaScript and Rust stands meet, each step prints, and it exits 0', () => {
  const run = spawnSync(process.execPath, ['examples/e2e/demo.js'], { cwd: root, encoding: 'utf8', timeout: 120000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  for (const step of ['ok stand:', 'ok boot:', 'ok invite:', 'ok route:', 'ok knock:', 'ok take:', 'ok ask:', 'ok a stranger:', 'hears silence', 'every step held']) {
    assert.ok(run.stdout.includes(step), `printed ${step}`);
  }
  assert.ok(!run.stdout.includes('not ok'), 'no step failed');
});
