// The second carriage: sealed envelopes as length-prefixed frames over one
// persistent TCP connection. It is for the roads where both ends are consenting
// grounds — droplet to droplet, same machine, a held line — where TLS and HTTP
// buy nothing, because the envelope already carries all the crypto. It is a
// private carriage: the law names it nowhere and needs to name it nowhere.
//
// A frame is a length written the way the wire encoding writes an `int` — eight
// bytes, signed two's complement, most significant first — and then that many
// envelope bytes. That is the frame's whole vocabulary. There is no direction
// bit, no correlation id, no header and no negotiation, because anything
// outside the seal that carried meaning would be meaning outside the seal.
//
// Silence has no wire form here. HTTP forces a response and so the common
// carriage needs an empty body for it; a persistent line does not. A refused or
// unresolvable ask simply produces no frame, and the caller's own deadline is
// its own affair. A zero-length frame is therefore malformed, not silence.
//
// Two failures, two consequences. A well-framed envelope that fails judgment is
// ordinary silence and the line lives on. A broken frame — negative length,
// zero length, a length over the cap, a body cut short — drops the connection
// without a word, because a peer that cannot frame cannot be spoken to.
//
// This file names a host, so it lives behind its own export beside the door and
// the portable barrel stays host-free.
import { createConnection, createServer } from 'node:net';
import { ANSWER, concat, kindOf } from './envelope.js';
import { readAnswer } from './warden.js';
import { hex } from './bytes.js';

const LENGTH = 8;

// Eight signed bytes can claim an exabyte, so a line that read whatever the
// length claimed would be a line anyone can exhaust. The cap is the warden's
// published limit where the host gave one, else this — the kit's number, never
// the law's.
export const CAP = 1n << 20n;

// The default is the law's number, not the kit's: a bare `tcp://` hint promises
// that this end accepts envelopes to 16,384 bytes, and the dialling end — which
// publishes nothing — always promises exactly this. A door with another
// appetite says so in the hint it publishes.
export const DEFAULT = 16_384n;

// What a line refuses to open under: an end that holds less than the default
// and declares nothing does not offer the line at all. It is thrown where the
// line is opened rather than met mid-frame, because such an end never had a
// line to fail on.
export class UnderTheDefault extends Error {
  constructor(cap) {
    super(`UNDER_THE_DEFAULT: an undeclared line accepts ${DEFAULT} bytes; this end holds ${cap}`);
    this.name = 'UnderTheDefault';
    this.cap = cap;
  }
}

function frame(envelope) {
  const out = new Uint8Array(LENGTH + envelope.length);
  new DataView(out.buffer).setBigInt64(0, BigInt(envelope.length));
  out.set(envelope, LENGTH);
  return out;
}

// The hint is the whole address here too: `tcp://host:port`, optionally
// followed by `?cap=` and the door's cap in decimal bytes, and nothing after
// that. No path, no second query, no second scheme. A bare road promises the
// default.
function road(hint) {
  const at = /^tcp:\/\/([^/:?]+):(\d+)(?:\?cap=(\d+))?$/.exec(hint);
  if (!at) return null;
  const far = at[3] === undefined ? DEFAULT : BigInt(at[3]);
  if (far <= 0n) return null;
  return { host: at[1], port: Number(at[2]), far };
}

// What this end accepts. `declares` says whether this half has a road to put
// the number on: a listener does, and so any cap it resolves is legal because
// the hint will carry it. A dialler publishes nothing and therefore promises
// the default, so anything under it is an end that does not offer the line.
function capOf(warden, limit, declares) {
  const explicit = limit !== null && limit !== undefined && BigInt(limit) > 0n;
  let cap;
  if (explicit) cap = BigInt(limit);
  else if (warden.limit > 0n) cap = warden.limit;
  else cap = CAP;
  // A small cap stands only where the host said the number and the road can
  // carry it. A warden's published limit is not that saying, and a dialler has
  // no road to carry it on.
  if (cap < DEFAULT && !(explicit && declares)) throw new UnderTheDefault(cap);
  return cap;
}

// One live line, from either end: the two halves differ only in who dialled.
// Frames flow both ways on it, so both ends can originate asks down one
// connection.
// `cap` is what this end accepts; `far` is what the road at the other end
// promised, which is the default wherever nothing was declared — the dialling
// half always.
function hold(warden, socket, { clock, random, cap, far }) {
  // What this end is waiting to hear, keyed by the far warden and the number of
  // the ask. Both facts are the caller's own — it built the ask — and neither
  // travels outside a seal.
  const pending = new Map();
  let buffer = new Uint8Array(0);
  let alive = true;
  let pumping = false;

  // Closing a line resolves its pending asks to null — the same nothing a shut
  // door gives.
  function settleAll() {
    for (const waiter of pending.values()) waiter.settle(null);
    pending.clear();
  }

  function drop() {
    alive = false;
    settleAll();
    socket.destroy();
  }

  // An arriving frame is resolved by unsealing and by nothing else, and the
  // record byte inside the seal says which of the two it is — nothing is tried
  // as one record and then as the other. An answer is collected against the
  // return padlock the ask carried, which is this warden's own, and pairs by
  // the warden and the seq inside the seal; an answer nothing awaits is
  // ordinary silence. Otherwise the envelope is a say, handed to judgment; its
  // answer, when there is one, goes back as a frame.
  async function arrive(envelope) {
    if ((await kindOf({ envelope, padlockSecret: warden.padlock.secret })) === ANSWER) {
      for (const [key, waiter] of pending) {
        const answer = await readAnswer({
          envelope,
          padlockSecret: warden.padlock.secret,
          wardenPk: waiter.warden,
        });
        if (!answer || answer.seq !== waiter.seq) continue;
        pending.delete(key);
        waiter.settle(envelope);
        return;
      }
      return;
    }
    const back = await warden.judge(envelope, { clock, random: random() });
    if (back !== null && alive) send(back);
  }

  // Every byte this end puts on the road goes through here, so the far cap is
  // held in one place. An envelope over what the far road promised is refused
  // before a byte flows: sending it would have the far end drop the connection
  // without a word, and killing your own line is worse than not sending.
  function send(envelope) {
    if (BigInt(envelope.length) > far) return false;
    socket.write(frame(envelope));
    return true;
  }

  async function pump() {
    if (pumping) return;
    pumping = true;
    try {
      while (alive && buffer.length >= LENGTH) {
        const claimed = new DataView(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        ).getBigInt64(0);
        // Negative, zero, or over the cap: the peer cannot frame.
        if (claimed <= 0n || claimed > cap) return drop();
        const size = Number(claimed);
        if (buffer.length - LENGTH < size) break;
        const envelope = buffer.slice(LENGTH, LENGTH + size);
        buffer = buffer.slice(LENGTH + size);
        await arrive(envelope);
      }
    } finally {
      pumping = false;
    }
  }

  socket.on('data', (chunk) => {
    if (!alive) return;
    buffer = concat([buffer, new Uint8Array(chunk)]);
    pump();
  });
  // A peer that stops speaking mid-frame has cut a body short, which is the same
  // broken framing as any other and gets the same wordless drop.
  socket.on('end', () => (buffer.length > 0 ? drop() : line.close()));
  socket.on('close', () => {
    alive = false;
    settleAll();
  });
  // The line is dumb: no reconnect, no keep-alive, no health probe. A socket
  // error is a line that has stopped carrying, and re-dialling is the caller's
  // affair the way trying another hint already is.
  socket.on('error', () => drop());

  const line = {
    socket,
    get open() {
      return alive;
    },
    // Send one envelope down the line. `expect` names the ask this end wants an
    // answer to — the far warden and the seq it was sealed with, both of them
    // the caller's own knowledge of the ask it built. Handed none, this is a
    // say: the frame goes and nothing is waited for.
    carry(envelope, expect = null) {
      if (!alive) return Promise.resolve(null);
      if (BigInt(envelope.length) > far) return Promise.resolve(null);
      if (!expect) {
        send(envelope);
        return Promise.resolve(null);
      }
      // One return padlock — this warden's own — one far warden and one number
      // would make two answers indistinguishable, so the second ask is not
      // sent while the first waits. Refusing here is the sender's own kit
      // saying no; the ask never reaches the road.
      const key = `${hex(expect.warden)}:${expect.seq}`;
      if (pending.has(key)) return Promise.resolve(null);
      send(envelope);
      return new Promise((settle) => {
        pending.set(key, { warden: expect.warden, seq: expect.seq, settle });
      });
    },
    close() {
      if (!alive) return;
      alive = false;
      settleAll();
      socket.end();
      socket.destroy();
    },
  };
  return line;
}

// Open a line to a `tcp://host:port` hint. The dialling half publishes nothing:
// it is reachable only down the lines it holds, which is the tab's case made
// real.
export function dial(warden, hint, { clock, random, limit = null }) {
  const at = road(hint);
  if (!at) return Promise.reject(new Error('NOT_A_LINE'));
  // The cap is resolved before the socket is: an end that cannot promise the
  // default does not open a connection it would have to fail on.
  let cap;
  try {
    cap = capOf(warden, limit, false);
  } catch (refusal) {
    return Promise.reject(refusal);
  }
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: at.host, port: at.port }, () => {
      socket.removeListener('error', reject);
      resolve(hold(warden, socket, { clock, random, cap, far: at.far }));
    });
    socket.once('error', reject);
  });
}

// The listening half. It is the one that knows where it ended up, so it tells
// its warden the road, exactly as `serve` already does — and `close` retracts
// it. `accepted` is handed each line as it arrives, for a ground that means to
// push down a connection somebody else opened.
export function listen(
  warden,
  { clock, random, host = '127.0.0.1', port = 0, limit = null, hint = null, accepted = null },
) {
  // The cap is judged before anything is bound: a warden that holds less than
  // the default and declares nothing never publishes a road.
  let cap;
  try {
    cap = capOf(warden, limit, true);
  } catch (refusal) {
    return Promise.reject(refusal);
  }
  const lines = new Set();
  // Whoever dialled published nothing, so what this end may send down an
  // accepted line is the default and only the default.
  const server = createServer((socket) => {
    const line = hold(warden, socket, { clock, random, cap, far: DEFAULT });
    lines.add(line);
    socket.on('close', () => lines.delete(line));
    accepted?.(line);
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const at = server.address();
      // The road says the cap before a byte flows. A bare road is the promise
      // of the default, so only a door with another appetite writes the query.
      const declared = cap === DEFAULT ? '' : `?cap=${cap}`;
      const published = hint ?? `tcp://${host}:${at.port}${declared}`;
      warden.publish(published);
      resolve({
        server,
        lines,
        hint: published,
        close: () =>
          new Promise((done) => {
            warden.retract(published);
            for (const line of [...lines]) line.close();
            server.close(done);
          }),
      });
    });
  });
}
