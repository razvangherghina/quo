// Standing a Quo ground inside the official Node image and reading it back
// from the host. The image is the only thing pulled; the kit is mounted into
// it read-only and run as it stands, because the kit is the thing under test
// and a copy of it would be a copy under test instead.
//
// Nothing here reaches for a library: the docker CLI over child_process and
// node's own stdlib, the same standing the kit itself keeps.
import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const KIT = join(here, '..', '..');
export const IMAGE = 'node:lts';

// The port the ground binds inside its own container. It is fixed because it
// is private to the container; the road the host takes is the ephemeral
// mapping this is published to.
const INSIDE = 8787;

const docker = (args, options = {}) =>
  spawnSync('docker', args, { encoding: 'utf8', timeout: 120_000, ...options });

// Why the container cases cannot run here, or null when they can. A daemon
// that is not there is a skip with a reason; a case that quietly passed
// without a container would be a green that proved nothing.
export function unreachable() {
  const probe = docker(['version', '--format', '{{.Server.Version}}']);
  if (probe.error) return `the docker CLI is not on PATH: ${probe.error.message}`;
  if (probe.status !== 0) {
    return `the docker daemon is unreachable: ${(probe.stderr || probe.stdout).trim()}`;
  }
  return null;
}

// The image is pulled at most once for the whole run, and never when it is
// already here.
let pulled = false;
function image() {
  if (pulled) return;
  if (docker(['image', 'inspect', IMAGE]).status !== 0) {
    const got = docker(['pull', IMAGE], { timeout: 600_000 });
    if (got.status !== 0) throw new Error(`could not pull ${IMAGE}: ${got.stderr}`);
  }
  pulled = true;
}

function quoLines(text) {
  const found = [];
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue;
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object' && 'quo' in value) found.push(value);
    } catch {
      // not a line of ours
    }
  }
  return found;
}

// Run the subject in a container, publish its port to an ephemeral loopback
// port on the host, tell it which port that was, and hand back the facts it
// prints. `carriage` is `door` or `line`.
export async function stand(carriage) {
  image();
  const name = `quo-bench-${carriage}-${process.pid}-${Date.now()}`;
  const child = spawn(
    'docker',
    [
      'run',
      '--rm',
      '-i',
      '--name',
      name,
      '--label',
      'quo-bench=1',
      '-p',
      `127.0.0.1:0:${INSIDE}`,
      '-v',
      `${KIT}:/kit:ro`,
      '-w',
      '/kit',
      IMAGE,
      'node',
      '/kit/bench/container/subject.js',
      carriage,
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  const lines = [];
  const waiting = [];
  let out = '';
  let err = '';
  let rest = '';
  let gone = null;
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => (err += chunk));
  child.stdout.on('data', (chunk) => {
    out += chunk;
    rest += chunk;
    const parts = rest.split('\n');
    rest = parts.pop();
    for (const value of quoLines(parts.join('\n'))) {
      lines.push(value);
      for (const one of waiting.splice(0)) {
        if (one.quo === value.quo) one.settle(value);
        else waiting.push(one);
      }
    }
  });
  child.on('close', (code) => {
    gone = code;
    for (const one of waiting.splice(0)) one.settle(null);
  });

  const ground = {
    name,
    stderr: () => err,
    stdout: () => out,
    say: (word) => child.stdin.write(`${JSON.stringify(word)}\n`),
    at: (quo) => {
      const had = lines.find((one) => one.quo === quo);
      if (had) return Promise.resolve(had);
      if (gone !== null) return Promise.resolve(null);
      return new Promise((settle) => waiting.push({ quo, settle }));
    },
    // Force-removed whatever happened: a case that failed mid-flight must not
    // leave a container standing.
    stop: () => {
      docker(['rm', '-f', name], { timeout: 30_000 });
      child.kill('SIGKILL');
    },
  };

  // The mapping does not exist until the container is running, so it is read
  // back rather than chosen, and only then does the ground inside learn the
  // road the host will take to it.
  const port = await mapped(name, ground);
  ground.port = port;
  ground.say({ do: 'bind', port });
  const facts = await ground.at('standing');
  if (!facts) {
    ground.stop();
    throw new Error(`the containerized ground never stood: ${err}${out}`);
  }
  return { ...ground, facts };
}

async function mapped(name, ground) {
  for (let tries = 0; tries < 200; tries += 1) {
    const asked = docker(['port', name, `${INSIDE}/tcp`], { timeout: 15_000 });
    const at = /:(\d+)\s*$/.exec((asked.stdout || '').trim());
    if (asked.status === 0 && at) return Number(at[1]);
    await new Promise((done) => setTimeout(done, 100));
  }
  ground.stop();
  throw new Error(`the container never published a port: ${ground.stderr()}`);
}
