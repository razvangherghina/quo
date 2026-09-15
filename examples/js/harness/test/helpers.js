// A small driver over one `stand` process: the root channel of
// `vectors/HARNESS.md` section 2, spoken on its stdin and stdout, used by
// every test in this directory.

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

export const STAND = fileURLToPath(new URL('../stand.js', import.meta.url));

export function startStand(args) {
  const child = spawn(process.execPath, [STAND, ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
  const lines = createInterface({ input: child.stdout, terminal: false });
  const queue = [];
  const waiters = [];
  lines.on('line', (line) => {
    if (waiters.length) waiters.shift()(line);
    else queue.push(line);
  });
  const nextLine = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve)));
  let counter = 0;
  const stand = {
    child,
    nextLine,
    send(line) {
      child.stdin.write(`${line}\n`);
    },
    async request(req) {
      const full = { id: String(++counter), ...req };
      stand.send(JSON.stringify(full));
      for (;;) {
        const line = await nextLine();
        const answer = JSON.parse(line);
        if (answer.id === full.id) return answer;
      }
    },
    async ready(count) {
      const wardLines = [];
      for (let i = 0; i < count; i++) wardLines.push(await nextLine());
      const readyLine = await nextLine();
      if (readyLine !== 'ready') throw new Error(`expected ready, got ${readyLine}`);
      return wardLines.map((line) => {
        const m = line.match(/^ward ([0-9a-f]{128}) (.+)$/);
        if (!m) throw new Error(`not a ward line: ${line}`);
        return { pk: m[1], at: m[2] };
      });
    },
    async close() {
      if (child.exitCode !== null) return child.exitCode;
      child.stdin.end();
      const exited = new Promise((resolve) => child.once('exit', (code) => resolve(code)));
      const code = await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 2000, null))]);
      if (code === null) child.kill('SIGKILL');
      return code;
    },
  };
  return stand;
}

// Runs `fn(stand)` and always closes the child after, even when `fn` throws,
// so one failing assertion never leaves a `stand` process (and its listener)
// running for the rest of the suite.
export async function withStand(args, fn) {
  const stand = startStand(args);
  try {
    return await fn(stand);
  } finally {
    await stand.close();
  }
}

// Boots a `Host` under key `h` on ward `pk` and returns nothing: a shared
// first step for tests that only need one ordinary being to talk to.
export async function bootHost(stand, pk, key = 'h') {
  const out = await stand.request({ ward: pk, method: 'boot', args: { key, class: 'Host' } });
  if (!out.object || out.object.booted !== key) throw new Error(`boot failed: ${JSON.stringify(out)}`);
  return key;
}
