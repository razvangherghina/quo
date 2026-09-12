#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// The verifier from a shell. The same replay a page runs, against a kit
// standing in vector mode at the URL given, reading the corpus beside this
// file. The exit code is the verdict: zero when every record passes.
//
//   node verifier/cli.js http://127.0.0.1:8787
//   node verifier/cli.js http://127.0.0.1:8787 path/to/door.json
import { readFile } from 'node:fs/promises';
import { verify, lines } from './verify.js';

const [url, path] = process.argv.slice(2);
if (!url) {
  console.error('usage: node verifier/cli.js <url of a kit in vector mode> [door.json]');
  process.exit(2);
}
const corpus = JSON.parse(await readFile(path ?? new URL('../vectors/door.json', import.meta.url), 'utf8'));
const report = await verify(url, corpus, { onRecord: (r) => console.log(lines({ records: [r], pass: 0, fail: 0, url })[0]) });
console.log(lines(report).at(-1));
for (const r of report.records) if (!r.ok) for (const l of lines({ ...report, records: [r] }).slice(1, -1)) console.log(l);
process.exit(report.fail === 0 ? 0 : 1);
