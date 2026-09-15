// SPDX-License-Identifier: Apache-2.0
// The verifier. It replays `vectors/door.json` against a kit's stand program,
// `vectors/HARNESS.md` section 1, and it holds no key: every byte it sends is
// in the corpus and every byte it compares is one a stranger can see. It
// seals nothing, opens nothing and signs nothing. The day it needs to, the
// design is wrong.
//
// One program per record. The verifier starts the stand under the corpus's
// entropy, tells it the record's story, root requests and arrivals as bytes,
// comparing every reply on the way, then reads a digest, sends the record's
// ask, reads a digest again, and compares the reply byte for byte and
// whether the two digests differ. A digest's value is the kit's own and is
// never compared to anything: only its change is Quo's.
//
// It imports nothing but Node's own modules.

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';

const hex = (bytes) => Buffer.from(bytes).toString('hex');

// The seed texts `--ward` names, in their order, each without its file.
const wardsOf = (args) => args.flatMap((a, i) => (args[i - 1] === '--ward' ? [a.split('=')[0]] : []));

// One stand program and the root channel on its stdin and stdout.
async function standUp([program, ...before], args) {
  const child = spawn(program, [...before, ...args], { stdio: ['pipe', 'pipe', 'ignore'] });
  const stdout = createInterface({ input: child.stdout });
  const early = [];
  const waiting = [];
  const answers = new Map();
  let exited = false;
  const gone = () => {
    exited = true;
    for (const wake of waiting.splice(0)) wake(null);
    for (const wake of answers.values()) wake(null);
    answers.clear();
  };
  child.on('exit', gone);
  child.on('error', gone);
  stdout.on('line', (line) => {
    if (line.startsWith('{')) {
      let answer;
      try {
        answer = JSON.parse(line);
      } catch {
        return;
      }
      const wake = answers.get(answer.id);
      answers.delete(answer.id);
      if (wake) wake(answer);
    } else if (waiting.length) waiting.shift()(line);
    else early.push(line);
  });
  const line = () => (early.length ? early.shift() : exited ? null : new Promise((wake) => waiting.push(wake)));
  let counter = 0;
  const stand = {
    wards: {},
    request(ward, method, given) {
      if (exited) return null;
      const id = String(++counter);
      const answered = new Promise((wake) => answers.set(id, wake));
      child.stdin.write(`${JSON.stringify({ id, ward, method, ...(given ? { args: given } : {}) })}\n`);
      return answered;
    },
    close() {
      if (exited) return Promise.resolve();
      const done = new Promise((wake) => child.once('exit', wake));
      child.stdin.end();
      const timer = setTimeout(() => child.kill('SIGKILL'), 2000);
      return done.then(() => clearTimeout(timer));
    },
  };
  for (const seed of wardsOf(args)) {
    const m = (await line())?.match(/^ward ([0-9a-f]{128}) (\S+)$/);
    if (!m) {
      await stand.close();
      return null;
    }
    stand.wards[seed] = { pk: m[1], at: m[2] };
  }
  if ((await line()) !== 'ready') {
    await stand.close();
    return null;
  }
  return stand;
}

// Sends one ask frame of `box` to the ward at `at` and answers the frame
// that comes back under its id: `{ reply }` a box as hex, `{ reply: null }`
// for a `02`, or null when the connection closed or nothing came.
function arrive({ pk, at }, box) {
  return new Promise((done) => {
    const split = at.lastIndexOf(':');
    const socket = createConnection({ host: at.slice(0, split), port: Number(at.slice(split + 1)) });
    const body = Buffer.concat([Buffer.from([0, 0, 0, 0, 1]), Buffer.from(pk, 'hex'), box]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    let buf = Buffer.alloc(0);
    const finish = (out) => {
      clearTimeout(timer);
      socket.destroy();
      done(out);
    };
    const timer = setTimeout(() => finish(null), 10000);
    socket.on('connect', () => socket.write(Buffer.concat([length, body])));
    socket.on('error', () => finish(null));
    socket.on('close', () => finish(null));
    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32BE(0)) {
        const frame = buf.subarray(4, 4 + buf.readUInt32BE(0));
        buf = buf.subarray(4 + frame.length);
        if (frame.length < 5 || frame.readUInt32BE(1) !== 1) continue;
        if (frame[0] === 1) return finish({ reply: hex(frame.subarray(5)) });
        if (frame[0] === 2) return finish({ reply: null });
      }
    });
  });
}

// The steps a record is told, its world's first: a world names the world it
// follows, and its own steps come after that one's.
function storyOf(corpus, record) {
  const chain = [];
  for (let name = record.world; name; name = corpus.worlds[name].from) chain.unshift(...corpus.worlds[name].steps);
  return [...chain, ...record.steps];
}

// One record against the stand program `command`, an array of the program
// and its arguments before the stand's own. What failed is named, with what
// was expected and what came back.
export async function replay(command, corpus, record) {
  const result = (failed, checks = {}, error) => ({ case: record.case, name: record.name, kind: record.kind, ok: failed.length === 0, failed, checks, ...(error ? { error } : {}) });
  const scratch = mkdtempSync(join(tmpdir(), 'quo-verifier-'));
  const base = ['--listen', '127.0.0.1:0', '--entropy', corpus.entropy];
  let stand = await standUp(command, [...corpus.stand, ...base]);
  try {
    if (!stand) return result(['stand'], {}, 'stand: the program did not print its wards and ready');
    const steps = storyOf(corpus, record);
    for (const [i, step] of steps.entries()) {
      if (step.root) {
        const answer = await stand.request(stand.wards[step.root.ward].pk, step.root.method, step.root.args);
        if (!answer?.object || answer.object.error) return result(['story'], {}, `story: step ${i + 1}, ${step.root.method}, answered ${JSON.stringify(answer)}`);
      } else if (step.arrive) {
        const got = await arrive(stand.wards[step.arrive.ward], Buffer.from(step.arrive.ask, 'hex'));
        if (!got || got.reply !== step.reply) return result(['story'], { reply: { expected: step.reply, got: got?.reply } }, `story: step ${i + 1}, an arrival answered other bytes`);
      } else if (step.restart) {
        const files = {};
        for (const [seed, ward] of Object.entries(stand.wards)) {
          files[seed] = join(scratch, `${Object.keys(files).length}.json`);
          const saved = await stand.request(ward.pk, 'save', { file: files[seed] });
          if (!saved?.object || saved.object.error) return result(['story'], {}, `story: step ${i + 1}, save answered ${JSON.stringify(saved)}`);
        }
        await stand.close();
        stand = await standUp(command, [...Object.entries(files).flatMap(([seed, file]) => ['--ward', `${seed}=${file}`]), ...step.restart, ...base]);
        if (!stand) return result(['story'], {}, `story: step ${i + 1}, the program did not stand again`);
      }
    }
    const ward = stand.wards[record.ward];
    const before = await stand.request(ward.pk, 'digest');
    const got = await arrive(ward, Buffer.from(record.ask, 'hex'));
    const after = await stand.request(ward.pk, 'digest');
    if (!got) return result(['reply'], { reply: { expected: record.reply, got: null } }, 'reply: no frame came back');
    const wrote = before?.object?.digest !== after?.object?.digest;
    const checks = { reply: { expected: record.reply, got: got.reply }, wrote: { expected: record.wrote, got: wrote } };
    return result(Object.keys(checks).filter((k) => checks[k].expected !== checks[k].got), checks);
  } finally {
    await stand?.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}

// The whole corpus against `command`, one record after another. `onRecord`
// hears each result as it lands.
export async function verify(command, corpus, { onRecord } = {}) {
  const records = [];
  for (const record of corpus.vectors) {
    const r = await replay(command, corpus, record);
    records.push(r);
    onRecord?.(r);
  }
  const pass = records.filter((r) => r.ok).length;
  return { command: command.join(' '), pass, fail: records.length - pass, records };
}

// The report as lines. One line per record, and what differed under a
// record that failed.
export function lines(report) {
  const out = [];
  for (const r of report.records) {
    out.push(`${r.ok ? 'pass' : 'FAIL'}  ${r.case.padEnd(4)} ${r.name}`);
    if (r.ok) continue;
    if (r.error) out.push(`      ${r.error}`);
    for (const k of r.failed) {
      if (!r.checks[k]) continue;
      out.push(`      ${k}: expected ${String(r.checks[k].expected)}`);
      out.push(`      ${' '.repeat(k.length)}       got ${String(r.checks[k].got)}`);
    }
  }
  out.push(`${report.pass} passed, ${report.fail} failed, ${report.records.length} records, ${report.command}`);
  return out;
}
