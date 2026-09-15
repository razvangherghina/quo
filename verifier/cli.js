#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// The verifier from a shell, against the stand program named after `--`,
// reading the corpus beside this file. The exit code is the verdict: zero
// when every record passes.
//
//   node verifier/cli.js -- node path/to/stand.js
//   node verifier/cli.js -- path/to/stand

import { readFile } from 'node:fs/promises';
import { lines, verify } from './verify.js';

const split = process.argv.indexOf('--');
const command = split === -1 ? [] : process.argv.slice(split + 1);
if (command.length === 0) {
  process.stderr.write('usage: node verifier/cli.js -- <stand program and its arguments>\n');
  process.exit(2);
}
const corpus = JSON.parse(await readFile(new URL('../vectors/door.json', import.meta.url), 'utf8'));
const report = await verify(command, corpus, { onRecord: (r) => process.stdout.write(`${lines({ records: [r], pass: 0, fail: 0, command: '' })[0]}\n`) });
for (const r of report.records) if (!r.ok) for (const l of lines({ ...report, records: [r] }).slice(1, -1)) process.stdout.write(`${l}\n`);
process.stdout.write(`${lines(report).at(-1)}\n`);
process.exit(report.fail === 0 ? 0 : 1);
