// The observer, `vectors/HARNESS.md` section 3 and the opening of
// `SCENARIOS.md`: a TCP proxy that sits on the wire between
// two harbors, reads every frame by `SPEC.md` chapter 6, "The frame",
// and records every frame as it crossed on:
//
//   frame  = length (4, big-endian) || body
//   body   = kind (1) || id (4, big-endian) || rest
//   00 ask     rest = ward pk (64) || box
//   01 reply   rest = box
//   02 nothing rest = empty
//
// `forward(label, target)` opens a listener that forwards every connection
// to `target`, frame by frame. Each frame read is offered to the hook set for
// that label and direction, `hook(label, { listener, dialer })`: `listener`
// for frames the dialer sends toward the real listener, `dialer` for frames
// the listener sends back. A hook is called `(entry, raw, tools)`: `entry` the
// frame read, `raw` its bytes, and `tools.write(bytes)` puts bytes on the
// wire toward the far side, zero times to drop, once to forward or alter, more
// to replay; `tools.close()` closes both sides of that connection;
// `tools.ask` is, on a frame back, the ask read under the same id on that
// connection. With no hook a frame is written on untouched.
//
// `frames` is what crossed: every frame as written on, after any hook
// altered it, with its label, its direction `at` (the side that reads it),
// its connection, and the time it was written. A close the observer made
// or saw is recorded there too, `{ closed: true }`. `read` is every frame as
// it arrived, before any hook. Bytes that are not a frame cross untouched,
// and from them on the connection is a blind pipe, since the side that reads
// them closes it; `illegal` records where.

import { createConnection, createServer } from 'node:net';

const MAX_BODY = 1_048_645;
const MIN_BODY = 5;

function splitHostPort(s) {
  const at = s.lastIndexOf(':');
  return { host: s.slice(0, at), port: Number(s.slice(at + 1)) };
}

const KIND_BYTE = { ask: 0x00, reply: 0x01, nothing: 0x02 };

// One frame's exact bytes from its fields: `{ kind, id, ward?, box? }`.
export function encodeFrame({ kind, id, ward, box = Buffer.alloc(0) }) {
  const idBuf = Buffer.alloc(4);
  idBuf.writeUInt32BE(id, 0);
  const rest = kind === 'ask' ? Buffer.concat([Buffer.from(ward, 'hex'), box]) : kind === 'reply' ? box : Buffer.alloc(0);
  const body = Buffer.concat([Buffer.from([KIND_BYTE[kind]]), idBuf, rest]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

// Reads frames off a byte stream. `onFrame(frame, raw)` for each legal frame;
// `onIllegal(reason, rest)` once, on the first bytes that are not a frame,
// with every byte from there on.
export class FrameParser {
  constructor({ onFrame, onIllegal }) {
    this.buf = Buffer.alloc(0);
    this.onFrame = onFrame;
    this.onIllegal = onIllegal;
    this.stopped = false;
  }

  push(chunk) {
    if (this.stopped) return;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : chunk;
    for (;;) {
      if (this.buf.length < 4) return;
      const length = this.buf.readUInt32BE(0);
      if (length < MIN_BODY || length > MAX_BODY) return this.illegal(`length ${length}`);
      if (this.buf.length < 4 + length) return;
      const raw = Buffer.from(this.buf.subarray(0, 4 + length));
      const body = raw.subarray(4);
      const kind = body[0];
      const id = body.readUInt32BE(1);
      const rest = body.subarray(5);
      let frame;
      if (kind === 0x00) {
        if (rest.length < 64) return this.illegal('an ask with fewer than sixty-four bytes after its id');
        frame = { kind: 'ask', id, ward: rest.subarray(0, 64).toString('hex'), box: rest.subarray(64) };
      } else if (kind === 0x01) {
        frame = { kind: 'reply', id, box: rest };
      } else if (kind === 0x02) {
        if (rest.length !== 0) return this.illegal('a nothing with bytes after its id');
        frame = { kind: 'nothing', id, box: Buffer.alloc(0) };
      } else {
        return this.illegal(`kind ${kind}`);
      }
      frame.length = length;
      this.buf = this.buf.subarray(4 + length);
      this.onFrame(frame, raw);
    }
  }

  illegal(reason) {
    this.stopped = true;
    const rest = this.buf;
    this.buf = Buffer.alloc(0);
    this.onIllegal(reason, rest);
  }
}

// Frames in bytes a hook wrote, read leniently for the record: every whole
// frame, whatever its kind.
export function framesIn(bytes) {
  const out = [];
  let at = 0;
  while (bytes.length - at >= 9) {
    const length = bytes.readUInt32BE(at);
    if (length < MIN_BODY || bytes.length - at < 4 + length) break;
    const body = bytes.subarray(at + 4, at + 4 + length);
    const kind = body[0];
    const rest = body.subarray(5);
    const frame = { kind: kind === 0 ? 'ask' : kind === 1 ? 'reply' : kind === 2 ? 'nothing' : kind, id: body.readUInt32BE(1), length };
    if (kind === 0 && rest.length >= 64) {
      frame.ward = rest.subarray(0, 64).toString('hex');
      frame.box = Buffer.from(rest.subarray(64));
    } else {
      frame.box = Buffer.from(rest);
    }
    out.push(frame);
    at += 4 + length;
  }
  return out;
}

// The asks that crossed toward the listener under `label` from index `from`
// of `frames` on, each with the reply that crossed back for it on its
// connection (`reply`), or a `02` (`nothing: true`), or neither.
export function exchanges(frames, label, from = 0) {
  const out = [];
  const open = new Map();
  for (const f of frames.slice(from)) {
    if (f.label !== label || f.closed) continue;
    const key = `${f.conn}:${f.id}`;
    if (f.kind === 'ask' && f.at === 'listener') {
      const e = { ask: f, reply: null, nothing: false };
      out.push(e);
      open.set(key, e);
    } else if (f.at === 'dialer' && open.has(key)) {
      const e = open.get(key);
      open.delete(key);
      if (f.kind === 'reply') e.reply = f;
      else if (f.kind === 'nothing') e.nothing = true;
    }
  }
  return out;
}

export function createObserver() {
  const frames = [];
  const read = [];
  const illegal = [];
  const servers = [];
  const sockets = new Set();
  const hooks = new Map();
  const askTimes = new Map();
  let conns = 0;

  function crossed(label, at, conn, bytes) {
    for (const f of framesIn(bytes)) {
      const entry = { label, at, conn, ...f, t: process.hrtime.bigint() };
      const key = `${label}:${conn}:${f.id}`;
      if (f.kind === 'ask') askTimes.set(key, entry.t);
      else if (askTimes.has(key)) entry.replyNanos = Number(entry.t - askTimes.get(key));
      frames.push(entry);
    }
  }

  function hook(label, control) {
    if (control) hooks.set(label, control);
    else hooks.delete(label);
  }

  function forward(label, targetAddr, control) {
    if (control) hooks.set(label, control);
    const server = createServer((client) => {
      const conn = ++conns;
      const upstream = createConnection(splitHostPort(targetAddr));
      sockets.add(client);
      sockets.add(upstream);
      const asks = new Map();
      let closing = false;
      const shut = (by) => {
        if (closing) return;
        closing = true;
        frames.push({ label, conn, closed: true, by, t: process.hrtime.bigint() });
        client.destroy();
        upstream.destroy();
      };
      const side = (at, dst) => {
        const write = (bytes) => {
          if (dst.destroyed) return;
          crossed(label, at, conn, bytes);
          dst.write(bytes);
        };
        return new FrameParser({
          onFrame: (frame, raw) => {
            const entry = { label, at, conn, ...frame, t: process.hrtime.bigint() };
            read.push(entry);
            if (frame.kind === 'ask') asks.set(frame.id, entry);
            const hooked = hooks.get(label);
            const fn = hooked && hooked[at];
            if (fn) fn(entry, raw, { write, close: () => shut('observer'), original: raw, ask: asks.get(frame.id) });
            else write(raw);
          },
          onIllegal: (reason, rest) => {
            illegal.push({ label, at, conn, reason });
            if (!dst.destroyed) dst.write(rest);
            blind[at] = true;
          },
        });
      };
      const blind = { listener: false, dialer: false };
      const toUpstream = side('listener', upstream);
      const toClient = side('dialer', client);
      client.on('data', (chunk) => (blind.listener ? upstream.write(chunk) : toUpstream.push(chunk)));
      upstream.on('data', (chunk) => (blind.dialer ? client.write(chunk) : toClient.push(chunk)));
      client.on('close', () => {
        sockets.delete(client);
        if (!closing) shut('dialer');
      });
      upstream.on('close', () => {
        sockets.delete(upstream);
        if (!closing) shut('listener');
      });
      client.on('error', () => {});
      upstream.on('error', () => {});
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        servers.push(server);
        resolve(`127.0.0.1:${server.address().port}`);
      });
    });
  }

  async function close() {
    for (const s of sockets) s.destroy();
    await Promise.all(servers.map((server) => new Promise((resolve) => server.close(() => resolve()))));
  }

  return { frames, read, illegal, forward, hook, close };
}
