// The line's second address form: the same frames carried as the binary
// messages of a WebSocket over TLS. It exists for the paths a bare socket
// cannot walk — a browser tab, an edge that passes only the web — and it
// changes no law above it. A message's bytes are one frame exactly as
// `line.js` writes one, length then envelope, so everything the constitution
// says of frames, caps, silence and faults reads the same on either form. That
// is why the body below is not written here: `hold` is imported from the line
// and handed a carrier that speaks WebSocket instead of a socket.
//
// What the WebSocket adds — its handshake, its masking, its control frames —
// is this road's own plumbing below the line, carrying no meaning. Pings are
// answered here and never reach the line; a close frame is the peer hanging
// up. A message that is not exactly one frame, a text message, a masking side
// that is wrong, a reserved bit set: each is a peer that cannot frame, and the
// connection drops without a word, exactly as a broken frame does on the tcp
// form.
//
// The hint is `wss://host[:port][/path][?cap=N]`. The port absent means 443.
// The path is the operator's affair — dialled exactly as given and never
// parsed, because one domain often fronts many doors. `ws://` names nothing: in
// the clear the line is already `tcp://`, and a second cleartext spelling would
// be two roads.
//
// Zero packages, as the kit is: the server side is RFC 6455 written out over
// `node:http`, and the dialling side prefers `globalThis.WebSocket` where the
// platform has one — a browser, and Node since 22 — falling back to the same
// framing over `node:tls` where it does not, or where the caller passed TLS
// options a `WebSocket` cannot take.
//
// This file names a host, so it lives behind its own export beside the door and
// the line, and the portable barrel stays host-free.
//
// The host is named nowhere at the top of this file, and that is deliberate:
// the browser is the very case this form exists for, so the pieces only a
// server or a socket needs are imported where they are used. What a tab loads
// is the shim, `hold`, and the one rule that a message is one frame.
import { concat } from './envelope.js';
import { CAP, DEFAULT, UnderTheDefault, capOf, hold } from './line.js';

export { CAP, DEFAULT, UnderTheDefault };

// The line's own length prefix, which stays inside the message.
const LENGTH = 8;

const CONTINUATION = 0x0;
const TEXT = 0x1;
const BINARY = 0x2;
const CLOSE = 0x8;
const PING = 0x9;
const PONG = 0xa;

// RFC 6455's constant. It is the whole of the handshake's arithmetic.
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const accept = (createHash, key) =>
  createHash('sha1')
    .update(key + GUID)
    .digest('base64');

// The events `hold` listens for, without naming a host to get them: a browser
// has no `EventEmitter` and needs none.
function bell() {
  const listeners = new Map();
  return {
    on(name, listener) {
      const kept = listeners.get(name);
      if (kept) kept.push(listener);
      else listeners.set(name, [listener]);
    },
    emit(name, value) {
      for (const listener of listeners.get(name) ?? []) listener(value);
    },
  };
}

function encode(opcode, payload, mask) {
  const size = payload.length;
  const head = size < 126 ? 2 : size < 65_536 ? 4 : 10;
  const out = new Uint8Array(head + (mask ? 4 : 0) + size);
  const view = new DataView(out.buffer);
  out[0] = 0x80 | opcode;
  if (size < 126) out[1] = size;
  else if (size < 65_536) {
    out[1] = 126;
    view.setUint16(2, size);
  } else {
    out[1] = 127;
    view.setBigUint64(2, BigInt(size));
  }
  let at = head;
  if (mask) {
    out[1] |= 0x80;
    const key = globalThis.crypto.getRandomValues(new Uint8Array(4));
    out.set(key, at);
    at += 4;
    for (let i = 0; i < size; i += 1) out[at + i] = payload[i] ^ key[i % 4];
  } else out.set(payload, at);
  return out;
}

// The port's reader. It answers one question — what whole messages arrived —
// and calls `broken` for every way the peer failed to be a WebSocket. It knows
// nothing of envelopes.
function reader({ maskedIn, limit, message, ping, hungUp, broken }) {
  let buffer = new Uint8Array(0);
  let fragments = null;
  let gathered = 0;
  let done = false;
  const fail = () => {
    if (done) return;
    done = true;
    broken();
  };
  return (chunk) => {
    if (done) return;
    buffer = concat([buffer, chunk]);
    for (;;) {
      if (buffer.length < 2) return;
      const first = buffer[0];
      const second = buffer[1];
      // No extension was negotiated, so a reserved bit is a peer speaking
      // something this road did not agree to.
      if (first & 0x70) return fail();
      const fin = (first & 0x80) !== 0;
      const opcode = first & 0x0f;
      const masked = (second & 0x80) !== 0;
      // A client masks and a server does not. The wrong side is not a peer.
      if (masked !== maskedIn) return fail();
      let size = second & 0x7f;
      let at = 2;
      if (opcode >= 0x8 && (!fin || size > 125)) return fail();
      if (size === 126) {
        if (buffer.length < 4) return;
        size = (buffer[2] << 8) | buffer[3];
        at = 4;
      } else if (size === 127) {
        if (buffer.length < 10) return;
        const claimed = new DataView(
          buffer.buffer,
          buffer.byteOffset,
          buffer.byteLength,
        ).getBigUint64(2);
        if (claimed > BigInt(limit)) return fail();
        size = Number(claimed);
        at = 10;
      }
      if (size > limit) return fail();
      let key = null;
      if (masked) {
        if (buffer.length < at + 4) return;
        key = buffer.slice(at, at + 4);
        at += 4;
      }
      if (buffer.length < at + size) return;
      const payload = buffer.slice(at, at + size);
      buffer = buffer.slice(at + size);
      if (key) for (let i = 0; i < size; i += 1) payload[i] ^= key[i % 4];
      if (opcode === PING) {
        ping(payload);
        continue;
      }
      if (opcode === PONG) continue;
      if (opcode === CLOSE) {
        done = true;
        hungUp();
        return;
      }
      // The line rides binary messages. Text is not a frame and never was.
      if (opcode === TEXT) return fail();
      if (opcode === BINARY) {
        if (fragments) return fail();
        if (fin) {
          message(payload);
          continue;
        }
        fragments = [payload];
        gathered = size;
        continue;
      }
      if (opcode === CONTINUATION) {
        if (!fragments) return fail();
        gathered += size;
        if (gathered > limit) return fail();
        fragments.push(payload);
        if (!fin) continue;
        const whole = concat(fragments);
        fragments = null;
        gathered = 0;
        message(whole);
        continue;
      }
      return fail();
    }
  };
}

// One message is one frame, and a message that is not one is broken framing.
// The length's own judgment — zero, negative, over the cap — stays where it is
// on the tcp form, in `hold`, so both forms refuse by the same words.
function whole(bytes) {
  if (bytes.length < LENGTH) return false;
  const claimed = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigInt64(0);
  if (claimed < 0n) return false;
  return claimed === BigInt(bytes.length - LENGTH);
}

// A socket-shaped thing over a WebSocket connection: `write`, `end`, `destroy`
// and the four events `hold` listens for. Every byte of WebSocket plumbing ends
// here, which is what keeps the line above it identical on either form.
function carrier(socket, { side, cap, head = null }) {
  const events = bell();
  const maskOut = side === 'client';
  let alive = true;

  function drop() {
    if (!alive) return;
    alive = false;
    socket.destroy();
    events.emit('close');
  }

  const feed = reader({
    maskedIn: side === 'server',
    limit: Number(cap) + LENGTH,
    ping: (payload) => {
      // The road answers its own pings. The line never learns one arrived.
      if (alive) socket.write(encode(PONG, payload, maskOut));
    },
    hungUp: () => {
      if (!alive) return;
      events.emit('end');
      drop();
    },
    message: (bytes) => {
      if (!alive) return;
      if (!whole(bytes)) return drop();
      events.emit('data', bytes);
    },
    broken: drop,
  });

  socket.on('data', (chunk) => alive && feed(new Uint8Array(chunk)));
  socket.on('error', drop);
  socket.on('close', () => {
    if (!alive) return;
    alive = false;
    events.emit('close');
  });
  if (head && head.length) feed(new Uint8Array(head));

  return {
    on: (name, listener) => {
      events.on(name, listener);
    },
    write: (bytes) => {
      if (alive) socket.write(encode(BINARY, bytes, maskOut));
    },
    end: () => {
      if (alive) socket.write(encode(CLOSE, new Uint8Array(0), maskOut));
    },
    destroy: drop,
  };
}

// The same carrier shape over a platform `WebSocket` — a browser tab's only
// door outward. The platform owns the framing, the masking and the pings there;
// what is left is the one rule this road adds, that a message is one frame.
function shim(ws) {
  const events = bell();
  let alive = true;
  const drop = () => {
    if (!alive) return;
    alive = false;
    try {
      ws.close();
    } catch {
      // A socket already gone needs no closing.
    }
    events.emit('close');
  };
  ws.binaryType = 'arraybuffer';
  ws.onmessage = (event) => {
    if (!alive) return;
    // A text message is not a frame.
    if (typeof event.data === 'string') return drop();
    const bytes = new Uint8Array(event.data);
    if (!whole(bytes)) return drop();
    events.emit('data', bytes);
  };
  ws.onclose = () => {
    if (!alive) return;
    events.emit('end');
    drop();
  };
  ws.onerror = () => drop();
  return {
    on: (name, listener) => {
      events.on(name, listener);
    },
    write: (bytes) => {
      if (alive) ws.send(bytes);
    },
    end: () => {},
    destroy: drop,
  };
}

// The hint is the whole address. Host, optional port, optional path, then the
// same optional `?cap=` the tcp form has and nothing after that. The path is
// never parsed — it is carried into the request line exactly as written.
function road(hint) {
  const at = /^wss:\/\/(\[[0-9A-Fa-f:.]+\]|[^/:?[\]]+)(?::(\d+))?(\/[^?]*)?(?:\?cap=(\d+))?$/.exec(
    hint,
  );
  if (!at) return null;
  const far = at[4] === undefined ? DEFAULT : BigInt(at[4]);
  const port = at[2] === undefined ? 443 : Number(at[2]);
  if (far <= 0n || port === 0) return null;
  const host = at[1].startsWith('[') ? at[1].slice(1, -1) : at[1];
  const dial = `${at[3] ?? '/'}${at[4] === undefined ? '' : `?cap=${at[4]}`}`;
  return { host, port, far, dial };
}

// Dial a `wss://` hint. The dialling half publishes nothing: it is reachable
// only down the lines it holds, which is the tab's case made real.
export async function dial(warden, hint, { clock, random, limit = null, tls = null }) {
  const at = road(hint);
  if (!at) throw new Error('NOT_A_LINE');
  // The cap is resolved before the socket is: an end that cannot promise the
  // default does not open a connection it would have to fail on.
  const cap = capOf(warden, limit, false);
  const settings = { clock, random, cap, far: at.far };
  // A platform `WebSocket` is preferred wherever there is one, because on the
  // paths this form exists for it is the only thing there is. TLS options are
  // the exception: a `WebSocket` takes none, so a caller that named one is
  // asking for the socket underneath.
  if (!tls && typeof globalThis.WebSocket === 'function') {
    return new Promise((resolve, reject) => {
      const ws = new globalThis.WebSocket(hint);
      ws.onopen = () => {
        ws.onerror = null;
        resolve(hold(warden, shim(ws), settings));
      };
      ws.onerror = () => reject(new Error('NOT_REACHED'));
    });
  }
  const [{ connect }, { createHash }] = await Promise.all([
    import('node:tls'),
    import('node:crypto'),
  ]);
  return new Promise((resolve, reject) => {
    const socket = connect({
      host: at.host,
      port: at.port,
      // RFC 6066 has no server name for an address, and Node warns on one.
      ...(/^[\d.]+$/.test(at.host) || at.host.includes(':') ? {} : { servername: at.host }),
      ...(tls ?? {}),
    });
    let handshake = Buffer.alloc(0);
    const key = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16))).toString(
      'base64',
    );
    const stop = (why) => {
      socket.removeAllListeners('data');
      socket.destroy();
      reject(new Error(why));
    };
    socket.once('error', reject);
    socket.on('secureConnect', () => {
      socket.setNoDelay(true);
      socket.write(
        `GET ${at.dial} HTTP/1.1\r\nHost: ${at.host}:${at.port}\r\nUpgrade: websocket\r\n` +
          `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
      );
    });
    socket.on('data', (chunk) => {
      handshake = Buffer.concat([handshake, chunk]);
      const end = handshake.indexOf('\r\n\r\n');
      if (end < 0) return handshake.length > 16_384 && stop('NOT_A_LINE');
      const head = handshake.subarray(0, end).toString('latin1');
      const rest = handshake.subarray(end + 4);
      socket.removeAllListeners('data');
      socket.removeListener('error', reject);
      const agreed = /\r\nsec-websocket-accept:\s*([^\r\n]+)/i.exec(head)?.[1]?.trim();
      if (!/^HTTP\/1\.1 101/.test(head) || agreed !== accept(createHash, key)) {
        socket.destroy();
        return reject(new Error('NOT_A_LINE'));
      }
      resolve(hold(warden, carrier(socket, { side: 'client', cap, head: rest }), settings));
    });
  });
}

// The listening half. It is the one that knows where it ended up, so it tells
// its warden the road, exactly as the tcp form does — and `close` retracts it.
//
// `tls` is the key and certificate this end terminates with. Handed none, the
// server speaks plain HTTP and the TLS is somebody else's — an edge, a proxy —
// which is the ordinary shape of this road; the hint it publishes is then the
// operator's to give, because only the operator knows the name out front.
export async function listen(
  warden,
  {
    clock,
    random,
    host = '127.0.0.1',
    port = 0,
    path = '/',
    tls = null,
    limit = null,
    hint = null,
    accepted = null,
  },
) {
  // The cap is judged before anything is bound: a warden that holds less than
  // the default and declares nothing never publishes a road.
  const cap = capOf(warden, limit, true);
  const [{ createServer }, { createHash }] = await Promise.all([
    tls ? import('node:https') : import('node:http'),
    import('node:crypto'),
  ]);
  const lines = new Set();
  const server = tls ? createServer(tls) : createServer();
  // Nothing but the upgrade is served here. A door is not a web page.
  server.on('request', (_request, response) => {
    response.writeHead(426);
    response.end();
  });
  server.on('upgrade', (request, socket, head) => {
    const key = request.headers['sec-websocket-key'];
    const asked = String(request.headers.upgrade ?? '').toLowerCase();
    if (asked !== 'websocket' || !key) return socket.destroy();
    socket.setNoDelay(true);
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept(createHash, key)}\r\n\r\n`,
    );
    // Whoever dialled published nothing, so what this end may send down an
    // accepted line is the default and only the default.
    const line = hold(warden, carrier(socket, { side: 'server', cap, head }), {
      clock,
      random,
      cap,
      far: DEFAULT,
    });
    lines.add(line);
    socket.on('close', () => lines.delete(line));
    accepted?.(line);
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const at = server.address();
      const declared = cap === DEFAULT ? '' : `?cap=${cap}`;
      const published = hint ?? `wss://${host}:${at.port}${path}${declared}`;
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
