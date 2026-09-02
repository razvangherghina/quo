// The second carriage: sealed envelopes as length-prefixed frames over one
// persistent TCP connection. It is for the roads where both ends are consenting
// grounds — droplet to droplet, same machine, a held line — where TLS and HTTP
// buy nothing, because the envelope already carries all the crypto. It is a
// named road: the law states it in full and makes it standard, never mandatory,
// because a browser tab can open no socket and reach outranks fit.
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
// the portable barrel stays host-free. The host is named inside `dial` and
// `listen` rather than at the top, because `line-ws.js` imports `hold` from
// here and a tab loads that: a static `node:net` would be read on a platform
// that has none, the moment the module loaded.
//
// The line has a second address form — the same frames as the binary messages
// of a WebSocket — and it lives in `line-ws.js` beside this one. Everything
// above the bytes is the same line, so the body below (`hold`, and the cap
// arithmetic it rests on) is exported and shared rather than written twice:
// what differs between the two forms is only what carries a frame's bytes.
import { concat } from './envelope.js';

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
  const at = /^tcp:\/\/(\[[0-9A-Fa-f:.]+\]|[^/:?[\]]+):(\d+)(?:\?cap=(\d+))?$/.exec(hint);
  if (!at) return null;
  const far = at[3] === undefined ? DEFAULT : BigInt(at[3]);
  const port = Number(at[2]);
  // A cap of zero or a port of zero names a door that can take nothing, and is
  // no road at all: it is refused when offered as a road, never dialled.
  if (far <= 0n || port === 0) return null;
  const host = at[1].startsWith('[') ? at[1].slice(1, -1) : at[1];
  return { host, port, far };
}

// What this end accepts. `declares` says whether this half has a road to put
// the number on: a listener does, and so any cap it resolves is legal because
// the hint will carry it. A dialler publishes nothing and therefore promises
// the default, so anything under it is an end that does not offer the line.
export function capOf(warden, limit, declares) {
  const explicit = limit !== null && limit !== undefined && BigInt(limit) > 0n;
  let cap;
  if (explicit) cap = BigInt(limit);
  else if (warden.limit > 0n) cap = warden.limit;
  else cap = CAP;
  // A small cap stands only where the host said the number and the road can
  // carry it. A warden's published limit is not that saying, and a dialler has
  // no road to carry it on.
  if (cap < DEFAULT && !(explicit && declares)) throw new UnderTheDefault(cap);
  // An end that publishes nothing — the dialling end always — promises the
  // default, and there is no way to promise more. So what a dialler accepts on
  // an inbound frame is the default exactly, whatever its own appetite.
  return declares ? cap : DEFAULT;
}

// One live line, from either end: the two halves differ only in who dialled.
// Frames flow both ways on it, so both ends can originate asks down one
// connection.
// `cap` is what this end accepts; `far` is what the road at the other end
// promised, which is the default wherever nothing was declared — the dialling
// half always.
// `socket` is anything that carries bytes the way a socket does: `write`,
// `end`, `destroy`, and `data`/`end`/`close`/`error` events. A `node:net`
// socket is one; the WebSocket carrier in `line-ws.js` is the other, and every
// rule below reads the same over either, which is the point.
export function hold(warden, socket, { cap, far }) {
  let buffer = new Uint8Array(0);
  let alive = true;
  let pumping = false;
  const closers = [];

  function drop() {
    if (!alive) return;
    alive = false;
    socket.destroy();
    for (const fn of closers) fn();
  }

  // An arriving frame goes to the warden's one door and nowhere else. The line
  // never opens a seal: which record the frame carries, whether an answer is
  // awaited, whether a say is judged — the warden decides all of it, and hands
  // back bytes to send or nothing. The line itself is passed along as the
  // road the frame arrived on, so delivery can find its way back down it.
  async function arrive(envelope) {
    const back = await warden.arrive(envelope, line);
    if (back !== null && back !== undefined && alive) send(back);
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
        // Each end reads while it writes. A frame's judgment may itself wait
        // for an answer down this same line, so the pump hands the frame on
        // and reads the next; answers return in whatever order work finishes.
        arrive(envelope).catch(() => {});
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
    if (!alive) return;
    alive = false;
    for (const fn of closers) fn();
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
    // Send one envelope down the line and wait for nothing: whatever comes
    // back arrives as a frame of its own and goes to the warden's door. `true`
    // is a frame on the road; `false` is a line that would not take it.
    carry(envelope) {
      if (!alive) return false;
      return send(envelope);
    },
    // Told when the line stops carrying, so whoever holds it can let go.
    onClose(fn) {
      closers.push(fn);
    },
    close() {
      if (!alive) return;
      alive = false;
      socket.end();
      socket.destroy();
      for (const fn of closers) fn();
    },
  };
  return line;
}

// Open a line to a `tcp://host:port` hint. The dialling half publishes nothing:
// it is reachable only down the lines it holds, which is the tab's case made
// real.
export async function dial(warden, hint, { clock, random, limit = null }) {
  const at = road(hint);
  if (!at) throw new Error('NOT_A_LINE');
  // The cap is resolved before the socket is: an end that cannot promise the
  // default does not open a connection it would have to fail on.
  const cap = capOf(warden, limit, false);
  const { createConnection } = await import('node:net');
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
export async function listen(
  warden,
  { clock, random, host = '127.0.0.1', port = 0, limit = null, hint = null, accepted = null },
) {
  // The cap is judged before anything is bound: a warden that holds less than
  // the default and declares nothing never publishes a road.
  const cap = capOf(warden, limit, true);
  const { createServer } = await import('node:net');
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
