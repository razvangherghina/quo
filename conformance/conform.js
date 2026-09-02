#!/usr/bin/env node
// The entry point a stranger runs. It takes the command that starts their
// subject, drives every scenario through it, and reports per field what was
// expected and what came back.
//
//   node conform.js -- ./my-subject
//   node conform.js --scenario leash -- python3 subject.py
//
// It holds no expectations of its own and it knows no kit. Everything it
// asserts is in `scenarios/`, which is data, and everything it says a subject
// must answer is in CONTRACT.md.
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawned } from './pipe.js';
import { report, run, split } from './run.js';

const here = dirname(fileURLToPath(import.meta.url));
const at = join(here, 'scenarios');

const argv = process.argv.slice(2);
let only = null;
const flag = argv.indexOf('--scenario');
if (flag !== -1) {
  only = argv[flag + 1];
  argv.splice(flag, 2);
}
if (argv[0] === '--') argv.shift();
const [cmd, ...args] = argv;

if (!cmd) {
  console.error('usage: node conform.js [--scenario <name>] -- <command> [args...]');
  console.error('');
  console.error('The command starts your subject: one JSON object per line on');
  console.error('stdin, one back on stdout. CONTRACT.md is the whole of what it');
  console.error('must answer.');
  process.exit(2);
}

const names = (await readdir(at))
  .filter((one) => one.endsWith('.json'))
  .filter((one) => !only || one === `${only}.json`)
  .sort();

if (names.length === 0) {
  console.error(only ? `no scenario named ${only}` : `no scenarios found at ${at}`);
  process.exit(2);
}

// A fresh process per scenario. A scenario stands its own warden from the keys
// it hands in, so a subject carrying anything from the one before it would be
// judged on a state no scenario described.
let divergent = 0;
let missing = 0;
for (const name of names) {
  const scenario = JSON.parse(await readFile(join(at, name), 'utf8'));
  const subject = spawned({ cmd, args });
  let out;
  try {
    out = await run(scenario, subject);
  } finally {
    subject.stop();
  }
  const { divergences, gaps } = split(out);
  divergent += divergences.length;
  missing += gaps.length;
  const verdict =
    divergences.length === 0 && gaps.length === 0
      ? 'green'
      : `${divergences.length} diverge, ${gaps.length} unanswered`;
  console.log(`\n=== ${name.replace('.json', '')} — ${verdict}`);
  console.log(report(out));
  const err = subject.stderr().trim();
  if (err && (divergences.length > 0 || gaps.length > 0)) console.log(`\n  stderr:\n${err}`);
}

console.log('');
console.log(`${names.length} scenarios driven.`);
console.log(`${divergent} divergences — your warden disagreeing with the law.`);
console.log(`${missing} facts your subject says it cannot report.`);
// Green is not the same as covered, and the last line of a run is where that
// is worth saying: what these scenarios show is that a kit did not break the
// law in the exchanges it was driven through, never that it never does.
console.log('Neither a divergence nor an unanswered fact is a pass.');
process.exit(divergent + missing === 0 ? 0 : 1);
