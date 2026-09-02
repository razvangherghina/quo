// A subject in another process, spoken to the way the contract says: one JSON
// object per line in, one back. This is the whole of what driving a foreign kit
// takes — no socket, no container, no framework — and it is what a stranger's
// subject is reached through.
//
// It ships. Nothing here knows a kit, a path or a language: it spawns whatever
// command it is handed and reads lines.
import { spawn } from 'node:child_process';

export function spawned({ cmd, args = [], cwd }) {
  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], cwd });
  let out = '';
  let err = '';
  const waiting = [];
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (err += chunk));
  child.stdout.on('data', (chunk) => {
    out += chunk;
    const lines = out.split('\n');
    out = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const settle = waiting.shift();
      if (settle) settle(JSON.parse(line));
    }
  });
  // A subject that dies mid-scenario must fail the run rather than hang it.
  child.on('exit', (code) => {
    for (const settle of waiting.splice(0)) {
      settle({ error: `the subject exited ${code}: ${err.trim()}` });
    }
  });
  // A subject that never answers must fail the run rather than hang it either.
  // A stranger's first subject is the one most likely to read a line and say
  // nothing back, and a driver that waits forever tells them nothing about why.
  child.on('error', (fault) => {
    for (const settle of waiting.splice(0)) {
      settle({ error: `the subject could not be started: ${fault.message}` });
    }
  });
  return {
    obey: (order) =>
      new Promise((settle) => {
        waiting.push(settle);
        child.stdin.write(`${JSON.stringify(order)}\n`);
      }),
    stderr: () => err,
    stop: () => child.kill('SIGKILL'),
  };
}
