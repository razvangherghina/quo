// SPDX-License-Identifier: Apache-2.0
// The verifier against a stand program made of the corpus alone, once right
// and once wrong in each of the ways a kit can be wrong. A verifier nobody
// has seen fail is a green light nobody should trust.

import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { lines, replay, verify } from '../verify.js';

const corpus = JSON.parse(await readFile(new URL('../../vectors/door.json', import.meta.url), 'utf8'));
const fixture = fileURLToPath(new URL('./fixture.js', import.meta.url));

// The fixture as a command, wrong in `what` at the record whose case is `at`.
const stand = (what, at) => ['/usr/bin/env', ...(what ? [`QUO_FIXTURE_WRONG=${what}`, `QUO_FIXTURE_AT=${at}`] : []), process.execPath, fixture];

test("[verifier] the corpus holds the door's thirteen cases, each with its story and what a stranger can see", () => {
  assert.equal(corpus.area, 'door');
  assert.match(corpus.entropy, /^\d+$/);
  const numbers = new Set(corpus.vectors.map((v) => v.case));
  for (let n = 1; n <= 13; n++) assert.ok(numbers.has(`D${n}`), `D${n}`);
  for (const v of corpus.vectors) {
    for (const k of ['world', 'steps', 'ward', 'ask', 'reply', 'kind', 'opens', 'wrote']) assert.ok(k in v, `${v.case} ${v.name} carries ${k}`);
    for (const k of ['heard', 'draws', 'before', 'after']) assert.ok(!(k in v), `${v.case} ${v.name} carries no ${k}: no stranger sees it`);
    assert.ok(v.world in corpus.worlds, `${v.case} ${v.name} names a world the corpus holds`);
    if (typeof v.opens?.seen === 'string') assert.ok(v.blueprint, `${v.case} ${v.name}: a reply carrying seen carries the shape it is of`);
  }
});

test('[verifier] a stand that answers the corpus passes every record, and the report says so', async () => {
  const heard = [];
  const report = await verify(stand(), corpus, { onRecord: (r) => heard.push(r.case) });
  assert.equal(report.fail, 0, lines(report).join('\n'));
  assert.equal(report.pass, corpus.vectors.length);
  assert.equal(heard.length, corpus.vectors.length, 'every record is heard as it lands');
  assert.match(lines(report).at(-1), /0 failed/);
});

test('[verifier] each thing a kit can get wrong is caught by name: the reply, the writing, the story, and a connection that closes', async () => {
  const d4 = corpus.vectors.find((v) => v.case === 'D4');
  for (const [what, failed] of [
    ['reply', 'reply'],
    ['wrote', 'wrote'],
    ['silent', 'reply'],
  ]) {
    const r = await replay(stand(what, 'D4'), corpus, d4);
    assert.equal(r.ok, false, what);
    assert.ok(r.failed.includes(failed), `${what}: ${failed} is named, got ${r.failed}`);
  }
  const bound = corpus.vectors.find((v) => v.world === 'bound' && v.steps.some((s) => s.arrive));
  const astray = await replay(stand('story', bound.case), corpus, bound);
  assert.deepEqual(astray.failed, ['story']);
});

test('[verifier] a digest is never compared to the corpus: only whether it moved is read', async () => {
  const d1 = corpus.vectors.find((v) => v.case === 'D1');
  const r = await replay(stand('wrote', 'D1'), corpus, d1);
  assert.deepEqual(r.failed, ['wrote']);
  assert.equal(r.checks.wrote.expected, false);
  assert.equal(r.checks.wrote.got, true);
  assert.ok(!('before' in r.checks) && !('after' in r.checks), 'neither digest is a check');
});

test('[verifier] a program that stands nothing is a failure at stand, not an exception', async () => {
  const r = await replay([process.execPath, '-e', ''], corpus, corpus.vectors[0]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.failed, ['stand']);
});

test('[verifier] from a shell the exit code is the verdict', async () => {
  const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
  const run = (command) => new Promise((ok) => execFile(process.execPath, [cli, '--', ...command], (err, stdout) => ok({ code: err ? err.code : 0, stdout })));
  const good = await run(stand());
  assert.equal(good.code, 0);
  assert.match(good.stdout, /0 failed/);
  const bad = await run(stand('reply', 'D3'));
  assert.equal(bad.code, 1);
  assert.match(bad.stdout, /FAIL {2}D3/);
  assert.match(bad.stdout, /reply: expected/);
});
