// SPDX-License-Identifier: Apache-2.0
// The verifier against a stand made of the corpus alone, once right and
// once wrong in each of the ways a kit can be wrong. A verifier nobody has
// seen fail is a green light nobody should trust.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verify, replay, lines } from '../verify.js';
import { fixture } from './fixture.js';

const corpus = JSON.parse(await readFile(new URL('../../vectors/door.json', import.meta.url), 'utf8'));

test('[verifier] the corpus holds the door\'s thirteen cases, each with the five things a stranger can see', () => {
  assert.equal(corpus.area, 'door');
  const numbers = new Set(corpus.vectors.map((v) => v.case));
  for (let n = 1; n <= 13; n++) assert.ok(numbers.has(`D${n}`), `D${n}`);
  for (const v of corpus.vectors) for (const k of ['ask', 'reply', 'before', 'after', 'wrote']) assert.ok(k in v, `${v.case} ${v.name} carries ${k}`);
});

test('[verifier] a stand that answers the corpus passes every record, and the report says so', async () => {
  const { url, close } = await fixture(corpus);
  try {
    const heard = [];
    const report = await verify(url, corpus, { onRecord: (r) => heard.push(r.case) });
    assert.equal(report.fail, 0);
    assert.equal(report.pass, corpus.vectors.length);
    assert.equal(heard.length, corpus.vectors.length, 'every record is heard as it lands');
    assert.match(lines(report).at(-1), /0 failed/);
  } finally {
    await close();
  }
});

test('[verifier] each thing a kit can get wrong is caught by name: before, the hand, the reply, after, and a step that does not answer', async () => {
  for (const [wrong, step] of [
    [{ before: true }, 'before'],
    [{ ask: true }, 'ask'],
    [{ reply: true }, 'reply'],
    [{ after: true }, 'after'],
    [{ silent: true }, 'reply'],
  ]) {
    const { url, close } = await fixture(corpus, { ...wrong, at: 'D5' });
    try {
      const report = await verify(url, corpus);
      const bad = report.records.filter((r) => !r.ok);
      assert.equal(bad.length, 1, `${step}: one record fails`);
      assert.equal(bad[0].case, 'D5');
      assert.ok(bad[0].failed.includes(step), `${step} is named, got ${bad[0].failed}`);
      assert.match(lines(report).join('\n'), /FAIL  D5/);
    } finally {
      await close();
    }
  }
});

test('[verifier] a wrong after is also a wrong wrote, since wrote is the two digests compared', async () => {
  const { url, close } = await fixture(corpus, { after: true, at: 'D1' });
  try {
    const r = await replay(url, corpus.vectors.find((v) => v.case === 'D1'));
    assert.deepEqual(new Set(r.failed), new Set(['after', 'wrote']));
    assert.equal(r.checks.after.got, 'e'.repeat(64));
  } finally {
    await close();
  }
});

test('[verifier] nobody home is a failure at stand, not an exception', async () => {
  const r = await replay('http://127.0.0.1:1', corpus.vectors[0]);
  assert.equal(r.ok, false);
  assert.deepEqual(r.failed, ['stand']);
  assert.match(r.error, /^stand: /);
});

test('[verifier] from a shell the exit code is the verdict', async () => {
  const cli = fileURLToPath(new URL('../cli.js', import.meta.url));
  const run = (url) => new Promise((ok) => execFile(process.execPath, [cli, url], (err, stdout) => ok({ code: err ? err.code : 0, stdout })));
  const good = await fixture(corpus);
  const bad = await fixture(corpus, { reply: true, at: 'D3' });
  try {
    const g = await run(good.url);
    assert.equal(g.code, 0);
    assert.match(g.stdout, /0 failed/);
    const b = await run(bad.url);
    assert.equal(b.code, 1);
    assert.match(b.stdout, /FAIL  D3/);
    assert.match(b.stdout, /reply: expected/);
  } finally {
    await good.close();
    await bad.close();
  }
});
