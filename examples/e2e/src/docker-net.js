// What `kits.js` and `world.js` need only when the world stands in
// containers (`examples/e2e/compose.yaml`). Nothing here runs unless
// `process.env.E2E_DOCKER` is set, which only `compose.yaml`'s own `driver`
// service sets.
//
// **Reaching a stand.** Each stand is `docker exec -i <service> <its stand>`,
// run from the `driver` service with the host's Docker socket bound in. `-i`
// with no `-t` keeps stdin open and allocates no pseudo-tty, so the root
// channel of `HARNESS.md` section 1 reaches the stand program unchanged.
//
// **Reaching a ward's real address.** A stand told `--listen 0.0.0.0:0`
// reports the interface it bound, `0.0.0.0`, which no other container can
// dial. `resolveContainerAt` pairs the port it chose with the service name,
// which is its DNS name on the compose network.
//
// **The observer.** It runs as its own service, `docker/observer-server.js`,
// in its own network namespace, and `createDockerObserver` is the client half
// of that file's control protocol, answering `frames`, `read`, `illegal`,
// `forward`, `hook` and `close` exactly as `observer.js`'s `createObserver`
// does, so a test never asks which it holds.

import { spawn } from 'node:child_process';
import { createConnection } from 'node:net';
import { createInterface } from 'node:readline';
import { framesIn } from './observer.js';

const STAND_COMMAND = {
  js: ['node', '/app/harness/stand.js'],
  rust: ['/target/debug/stand'],
};

// The service each kit's stand runs on, also its hostname on the network.
export function containerFor(kitName) {
  if (!STAND_COMMAND[kitName]) throw new Error(`no such kit ${kitName}`);
  return kitName;
}

export function dockerSpawn(kitName, args) {
  const cmd = STAND_COMMAND[kitName];
  if (!cmd) throw new Error(`no such kit ${kitName}`);
  return spawn('docker', ['exec', '-i', containerFor(kitName), ...cmd, ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
}

export function resolveContainerAt(kitName, at) {
  const port = at.slice(at.lastIndexOf(':') + 1);
  return `${containerFor(kitName)}:${port}`;
}

// One control connection is one session. Every frame the server reads is
// pushed here and recorded in `read` before anything is decided about it; a
// hook decides its fate here, and each `tools.write(bytes)` is one `act`,
// recorded in `frames` as it is sent, so `frames` is what crossed.
// `tools.close()` is one `kill`. A close the server made or saw arrives as
// `closed` and is recorded in `frames`.
export function createDockerObserver({ host = 'observer', port = Number(process.env.E2E_OBSERVER_PORT || 9000) } = {}) {
  const frames = [];
  const read = [];
  const illegal = [];
  const socket = createConnection({ host, port });
  const rl = createInterface({ input: socket, terminal: false });
  let counter = 0;
  const pending = new Map();
  const hooks = new Map();
  const asks = new Map();
  const askTimes = new Map();

  function send(msg) {
    socket.write(`${JSON.stringify(msg)}\n`);
  }

  function crossed(label, at, conn, bytes) {
    for (const f of framesIn(bytes)) {
      const entry = { label, at, conn, ...f, t: process.hrtime.bigint() };
      const key = `${label}:${conn}:${f.id}`;
      if (f.kind === 'ask') askTimes.set(key, entry.t);
      else if (askTimes.has(key)) entry.replyNanos = Number(entry.t - askTimes.get(key));
      frames.push(entry);
    }
  }

  function settle(rid, fn) {
    const p = pending.get(rid);
    if (!p) return;
    pending.delete(rid);
    fn(p);
  }

  rl.on('line', (line) => {
    const msg = JSON.parse(line);
    if (msg.op === 'frame') {
      const box = msg.box ? Buffer.from(msg.box, 'base64') : Buffer.alloc(0);
      const entry = { label: msg.label, at: msg.at, conn: msg.conn, kind: msg.kind, id: msg.id, length: msg.length, box, t: process.hrtime.bigint() };
      if (msg.kind === 'ask') entry.ward = msg.ward;
      read.push(entry);
      const key = `${msg.label}:${msg.conn}:${msg.id}`;
      if (msg.kind === 'ask') asks.set(key, entry);
      const idBuf = Buffer.alloc(4);
      idBuf.writeUInt32BE(msg.id, 0);
      const kindByte = { ask: 0, reply: 1, nothing: 2 }[msg.kind];
      const rest = msg.kind === 'ask' ? Buffer.concat([Buffer.from(msg.ward, 'hex'), box]) : box;
      const len = Buffer.alloc(4);
      len.writeUInt32BE(5 + rest.length, 0);
      const raw = Buffer.concat([len, Buffer.from([kindByte]), idBuf, rest]);
      const write = (bytes) => {
        crossed(msg.label, msg.at, msg.conn, bytes);
        send({ op: 'act', seq: msg.seq, bytes: Buffer.from(bytes).toString('base64') });
      };
      const tools = { write, close: () => send({ op: 'kill', seq: msg.seq }), original: raw, ask: asks.get(key) };
      const hooked = hooks.get(msg.label);
      const fn = hooked && hooked[msg.at];
      if (fn) fn(entry, raw, tools);
      else write(raw);
    } else if (msg.op === 'illegal') {
      illegal.push({ label: msg.label, at: msg.at, reason: msg.reason });
      send({ op: 'act', seq: msg.seq, bytes: msg.bytes });
    } else if (msg.op === 'closed') {
      frames.push({ label: msg.label, conn: msg.conn, closed: true, by: msg.by, t: process.hrtime.bigint() });
    } else if (msg.op === 'forward-ok') {
      settle(msg.rid, (p) => p.resolve(msg.address));
    } else if (msg.op === 'forward-err') {
      settle(msg.rid, (p) => p.reject(new Error(msg.error)));
    } else if (msg.op === 'close-ok') {
      settle(msg.rid, (p) => p.resolve());
    }
  });

  const open = new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  function hook(label, control) {
    if (control) hooks.set(label, control);
    else hooks.delete(label);
  }

  async function forward(label, target, control) {
    if (control) hooks.set(label, control);
    await open;
    const rid = String(++counter);
    return new Promise((resolve, reject) => {
      pending.set(rid, { resolve, reject });
      send({ op: 'forward', rid, label, target });
    });
  }

  async function close() {
    await open;
    const rid = String(++counter);
    await new Promise((resolve, reject) => {
      pending.set(rid, { resolve, reject });
      send({ op: 'close', rid });
    });
    socket.end();
  }

  return { frames, read, illegal, forward, hook, close };
}
