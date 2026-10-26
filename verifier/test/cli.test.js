// The verifier's command: its usage, and a run of one scenario against a kit.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { test } from 'node:test';

const cli = join(import.meta.dirname, '../cli.js');
const kit = join(import.meta.dirname, '../../examples/javascript');
const run = (...args) =>
  spawnSync('node', [cli, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: undefined },
  });

test('The verifier. With no stand program the command says its usage and exits 1', () => {
  const r = run();
  assert.equal(r.status, 1);
  assert.match(r.stderr, /usage: node verifier\/cli\.js/);
  assert.equal(run('--two', '--', './a').status, 1, 'two programs are owed');
});

test('The verifier. --only judges the scenarios named alone, --cwd is where the stand runs, and a kit that passes exits 0', () => {
  const r = run('--cwd', kit, '--only', 'the size', '--', './stand');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /\d+ checks, \d+ passed, 0 failed/);
  assert.ok(!r.stdout.includes('[the move]'), 'only the size was judged');
});

test('The verifier. --only with a name no scenario carries is a run done wrongly and exits 1', () => {
  const r = run('--cwd', kit, '--only', 'no such scenario', '--', './stand');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no scenario is named no such scenario/);
});

test('The verifier. A stand program that does not exist fails the run and exits 1', () => {
  const r = run('--cwd', kit, '--only', 'the size', '--', './no-such-stand');
  assert.equal(r.status, 1);
});
