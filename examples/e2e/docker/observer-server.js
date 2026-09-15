// The observer's own program when the world stands in containers,
// `quo/SCENARIOS.md` "How the world is built": "the observer runs a
// network emulator when a scenario asks for it" lives here because the
// observer must sit on the wire for real, in its own network namespace, on
// this compose network's `observer` service. It adds only what a process
// boundary costs: a control connection over which the driver keeps its own
// `frames`, `read` and `illegal`, and decides a frame's fate the way a hook
// of `../src/observer.js` does on loopback.
//
// One control connection is one session. `src/docker-net.js`'s
// `createDockerObserver()` opens one per `withWorld`, exactly as
// `createObserver()` is a fresh instance per call on loopback; everything
// this connection opened is closed when it ends, on a `close` request or
// on the socket's own close.
//
// The protocol. Every legal frame this reads, as it is read -- nothing
// here ever waits on the driver before reading the next one, the same as
// `../src/observer.js`'s own `FrameParser`, whose loop never waits on a
// hook either -- is offered to the driver, `{op:"frame", seq, ...}`, and
// this side does nothing with it on its own: `src/docker-net.js` puts
// bytes on the wire toward that frame's destination only by naming its
// `seq` in an `{op:"act", seq, bytes}`, zero or more times, whenever it
// chooses to, for as long as this forward stands. Zero, ever, is a drop;
// one, right away, is an ordinary forward; more than one, or one sent
// after other frames' own acts, is a replay or a reorder -- `HARNESS.md`
// section 3's own "replay, reorder, delay, drop and alter", read onto a
// process boundary rather than a function call, and needing no reply from
// this side for the same reason a write needs none: a hook may decide a
// frame's fate some calls later, holding an earlier frame's `tools.write`
// until a later one arrives, so nothing here treats "not yet" as "never".
// `{op:"kill", seq}` closes both sides of that frame's connection, and every
// close is told to the driver as `{op:"closed"}`. An illegal frame's undecodable
// bytes are offered and acted on the same way, since chapter 6 says the
// reading side closes the connection there, and nothing here reads what
// was never a frame.
//
// Ordering. A test checks `observer.frames`/`observer.illegal` right after
// awaiting a root request, never after awaiting the observer itself, so
// the driver's mirror must already hold a frame's record before that
// frame's crossing can have any effect the root channel reports. That
// holds by construction on `src/docker-net.js`'s own side, not by luck of
// timing: it records a pushed frame into `frames`/`illegal` before it ever
// decides what, if anything, to write back -- this file only ever writes
// what an `act` names, so nothing crosses before that recording did.

import { createServer, connect } from 'node:net';
import { createInterface } from 'node:readline';

const CONTROL_PORT = Number(process.env.E2E_OBSERVER_PORT || 9000);
const MAX_BODY = 1_048_645;
const MIN_BODY = 5;

function splitHostPort(s) {
  const at = s.lastIndexOf(':');
  return { host: s.slice(0, at), port: Number(s.slice(at + 1)) };
}

// The inverse of `encodeFrame`, read straight off `quo/SPEC.md` chapter 6
// exactly as `../src/observer.js`'s own `FrameParser` is (that class is
// not exported, so a process boundary away from it writes its own): a
// length below five, above the largest body, a kind that is none of the
// three, an ask with fewer than sixty-four bytes after its id, or a
// nothing with bytes after its id, end the reading side there. The loop
// below never waits on anything: every legal frame the buffer already
// holds is offered before this call returns, exactly as `../src/
// observer.js`'s own reading always has.
class FrameParser {
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
      if (length < MIN_BODY || length > MAX_BODY) return this.illegal(`length ${length} out of [${MIN_BODY}, ${MAX_BODY}]`);
      if (this.buf.length < 4 + length) return;
      const bodyEnd = 4 + length;
      const body = this.buf.subarray(4, bodyEnd);
      const kind = body[0];
      const id = body.readUInt32BE(1);
      const rest = body.subarray(5);
      let record;
      if (kind === 0x00) {
        if (rest.length < 64) return this.illegal('an ask with fewer than sixty-four bytes after its id');
        record = { kind: 'ask', id, ward: rest.subarray(0, 64).toString('hex'), box: rest.subarray(64) };
      } else if (kind === 0x01) {
        record = { kind: 'reply', id, box: rest };
      } else if (kind === 0x02) {
        if (rest.length !== 0) return this.illegal('a nothing with bytes after its id');
        record = { kind: 'nothing', id, box: Buffer.alloc(0) };
      } else {
        return this.illegal(`kind ${kind} is none of the three`);
      }
      record.length = length;
      record.t = process.hrtime.bigint();
      this.onFrame(record);
      this.buf = this.buf.subarray(bodyEnd);
    }
  }

  illegal(reason) {
    this.stopped = true;
    this.onIllegal(reason, this.buf);
  }
}

const server = createServer((ctrl) => {
  // One session per control connection: its own forwarding listeners, its
  // own `asksById` for `replyNanos`, its own frame sequence. `acts` holds
  // one destination-writer per frame this session has ever offered, kept
  // for as long as the session stands (a hook may hold a frame's `tools`
  // and act on it many exchanges later), and dropped only when every
  // forward this connection opened closes.
  const listeners = [];
  const asksById = new Map();
  let seq = 0;
  let conns = 0;
  const acts = new Map(); // seq -> (bytes) => void

  function send(msg) {
    if (ctrl.destroyed) return;
    ctrl.write(`${JSON.stringify(msg)}\n`);
  }

  const kills = new Map(); // seq -> closes both sides of the frame's connection

  function offerFrame(label, at, frame, dst, kill) {
    const mySeq = ++seq;
    const entry = { op: 'frame', seq: mySeq, label, at, conn: frame.conn, kind: frame.kind, id: frame.id, length: frame.length, t: frame.t.toString() };
    if (frame.kind === 'ask') entry.ward = frame.ward;
    if (frame.box && frame.box.length) entry.box = frame.box.toString('base64');
    if (frame.kind === 'ask') asksById.set(`${label}:${frame.id}`, frame.t);
    else {
      const askT = asksById.get(`${label}:${frame.id}`);
      if (askT !== undefined) entry.replyNanos = Number(frame.t - askT);
    }
    acts.set(mySeq, (bytes) => dst.write(bytes));
    kills.set(mySeq, kill);
    send(entry);
  }

  // `buf` is offered as `bytes` too: nothing here decoded it (chapter 6
  // says the reading side closes the connection on what is not a frame),
  // so the driver is given only the choice `../src/observer.js`'s own
  // plain proxy always takes for it, forwarding it on untouched.
  function offerIllegal(label, at, reason, buf, dst) {
    const mySeq = ++seq;
    acts.set(mySeq, (bytes) => dst.write(bytes));
    send({ op: 'illegal', seq: mySeq, label, at, reason, bytes: buf.toString('base64') });
  }

  function openForward(label, targetAddr) {
    const { host, port } = splitHostPort(targetAddr);
    const fwd = createServer((client) => {
      const conn = ++conns;
      const upstream = connect({ host, port });
      let closing = false;
      const shut = (by) => {
        if (closing) return;
        closing = true;
        send({ op: 'closed', label, conn, by });
        client.destroy();
        upstream.destroy();
      };
      const blind = { listener: false, dialer: false };
      const toUpstream = new FrameParser({
        onFrame: (f) => offerFrame(label, 'listener', { ...f, conn }, upstream, () => shut('observer')),
        onIllegal: (reason, buf) => {
          blind.listener = true;
          offerIllegal(label, 'listener', reason, buf, upstream);
        },
      });
      const toClient = new FrameParser({
        onFrame: (f) => offerFrame(label, 'dialer', { ...f, conn }, client, () => shut('observer')),
        onIllegal: (reason, buf) => {
          blind.dialer = true;
          offerIllegal(label, 'dialer', reason, buf, client);
        },
      });
      client.on('data', (chunk) => (blind.listener ? upstream.write(chunk) : toUpstream.push(chunk)));
      upstream.on('data', (chunk) => (blind.dialer ? client.write(chunk) : toClient.push(chunk)));
      client.on('close', () => shut('dialer'));
      upstream.on('close', () => shut('listener'));
      client.on('error', () => {});
      upstream.on('error', () => {});
    });
    return new Promise((resolve, reject) => {
      fwd.once('error', reject);
      fwd.listen(0, '0.0.0.0', () => {
        listeners.push(fwd);
        resolve(fwd.address().port);
      });
    });
  }

  async function closeSession() {
    await Promise.all(listeners.map((s) => new Promise((resolve) => s.close(() => resolve()))));
    acts.clear();
  }

  const rl = createInterface({ input: ctrl, terminal: false });
  rl.on('line', (line) => {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // not this protocol's concern: the driver writes only what it means
    }
    if (msg.op === 'act') {
      const write = acts.get(msg.seq);
      if (write && msg.bytes) write(Buffer.from(msg.bytes, 'base64'));
    } else if (msg.op === 'kill') {
      const kill = kills.get(msg.seq);
      if (kill) kill();
    } else if (msg.op === 'forward') {
      openForward(msg.label, msg.target)
        .then((port) => send({ op: 'forward-ok', rid: msg.rid, address: `${process.env.HOSTNAME || 'observer'}:${port}` }))
        .catch((err) => send({ op: 'forward-err', rid: msg.rid, error: String(err && err.message ? err.message : err) }));
    } else if (msg.op === 'close') {
      closeSession().then(() => send({ op: 'close-ok', rid: msg.rid }));
    }
  });

  ctrl.on('close', () => {
    closeSession();
  });
  ctrl.on('error', () => {});
});

server.listen(CONTROL_PORT, '0.0.0.0', () => {
  process.stderr.write(`observer-server: listening on :${CONTROL_PORT}\n`);
});
