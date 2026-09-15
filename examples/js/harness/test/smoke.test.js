// The smoke test HARNESS.md asks for: two wards on one listener, driven over
// the root channel of section 2, that invite, knock, take and ask.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const STAND = fileURLToPath(new URL('../stand.js', import.meta.url));

function startStand(args) {
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
  return {
    child,
    nextLine,
    send(line) {
      child.stdin.write(`${line}\n`);
    },
    async request(req) {
      const full = { id: String(++counter), ...req };
      this.send(JSON.stringify(full));
      for (;;) {
        const line = await nextLine();
        const answer = JSON.parse(line);
        if (answer.id === full.id) return answer;
      }
    },
    close() {
      child.stdin.end();
    },
  };
}

test('two wards on one listener invite, knock, take and ask', async () => {
  const stand = startStand(['--listen', '127.0.0.1:0', '--ward', 'alice', '--ward', 'bob', '--class', 'Host', '--entropy', '1']);

  // The two `ward` lines, in the order given, then `ready`, all before any
  // answer (HARNESS.md section 1).
  const wardLines = [];
  for (let i = 0; i < 2; i++) wardLines.push(await stand.nextLine());
  const readyLine = await stand.nextLine();
  assert.equal(readyLine, 'ready');
  const wards = wardLines.map((line) => {
    const [, pk, at] = line.match(/^ward ([0-9a-f]{128}) (.+)$/);
    return { pk, at };
  });
  assert.equal(wards.length, 2);

  const [a, b] = wards;

  // The empty ask on A answers her blueprint, the ward's own root asks.
  const blueprint = await stand.request({ ward: a.pk });
  assert.ok(Array.isArray(blueprint.object.asks));

  // A boots a Host under a key, B boots a Host under a key.
  const bootA = await stand.request({ ward: a.pk, method: 'boot', args: { key: 'h', class: 'Host' } });
  assert.deepEqual(bootA.object, { booted: 'h' });
  const bootB = await stand.request({ ward: b.pk, method: 'boot', args: { key: 'h', class: 'Host' } });
  assert.deepEqual(bootB.object, { booted: 'h' });

  // A's Host invites B under the id `b`.
  const invited = await stand.request({ ward: a.pk, method: 'invite', args: { being: 'h', id: 'b' } });
  assert.ok(invited.object.invitation);
  const invitation = invited.object.invitation;

  // B's Host knocks with that invitation and the named ask `hello`.
  const knocked = await stand.request({ ward: b.pk, method: 'knock', args: { being: 'h', invitation, method: 'hello' } });
  assert.deepEqual(knocked.object, { hi: 'b' });

  // B takes it as `a`.
  const taken = await stand.request({ ward: b.pk, method: 'take', args: { being: 'h', id: 'a', invitation } });
  assert.deepEqual(taken.object, { taken: 'a' });

  // B asks hello again on the standing `a` and hears the same thing.
  const asked = await stand.request({ ward: b.pk, method: 'ask', args: { being: 'h', id: 'a', method: 'hello' } });
  assert.deepEqual(asked.object, { hi: 'b' });

  stand.close();
});
