// A driver over one `stand` process's own root channel, `HARNESS.md` section
// 2, spoken on its stdin and stdout: spawn it, read its `ward` and `ready`
// lines, send a request, read its answer by id. Works over either kit,
// since the channel's names and shapes bind the adapter and never the kit.

import { createInterface } from 'node:readline';
import { KITS } from './kits.js';

export function startStand(kitName, args) {
  const kit = KITS[kitName];
  if (!kit) throw new Error(`no such kit ${kitName}`);
  const child = kit.spawn(args);
  const lines = createInterface({ input: child.stdout, terminal: false });
  // The `ward` and `ready` lines are read in order; every answer after them
  // goes to the request whose id it carries, so requests overlap.
  const queue = [];
  const waiters = [];
  const answers = new Map();
  lines.on('line', (line) => {
    if (line.startsWith('{')) {
      const answer = JSON.parse(line);
      const resolve = answers.get(answer.id);
      if (resolve) {
        answers.delete(answer.id);
        resolve(answer);
      }
      return;
    }
    if (waiters.length) waiters.shift()(line);
    else queue.push(line);
  });
  const nextLine = () => (queue.length ? Promise.resolve(queue.shift()) : new Promise((resolve) => waiters.push(resolve)));
  let counter = 0;

  const stand = {
    kit: kitName,
    child,
    // Sends one request and answers the answer that carries its id. Any
    // number may be in flight at once.
    request(req) {
      const full = { id: String(++counter), ...req };
      const answered = new Promise((resolve) => answers.set(full.id, resolve));
      child.stdin.write(`${JSON.stringify(full)}\n`);
      return answered;
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

export async function withStand(kitName, args, fn) {
  const stand = startStand(kitName, args);
  try {
    return await fn(stand);
  } finally {
    await stand.close();
  }
}

// Boots a `Host` under key `h` on ward `pk`. `HARNESS.md` "The beings":
// unless a line says otherwise the being asked is A's `Host`.
export async function bootHost(stand, pk, key = 'h') {
  const out = await stand.request({ ward: pk, method: 'boot', args: { key, class: 'Host' } });
  if (!out.object || out.object.booted !== key) throw new Error(`boot failed: ${JSON.stringify(out)}`);
  return key;
}
