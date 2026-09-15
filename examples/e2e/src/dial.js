// A dialer of `SPEC.md` chapter 6, "The line", as the hand is one: one
// TCP connection to a listener, frames written byte for byte, and every
// frame that comes back kept under the id it copies, so a replayed ask's two
// replies are both read, a `02` is told from a reply, and a connection the
// far side closed is told from a wait that ran out.

import { createConnection } from 'node:net';
import { followEdge, frameAsk, openReply, readReply, sealAsk, verifyWard } from './hand.js';

function splitHostPort(s) {
  const at = s.lastIndexOf(':');
  return { host: s.slice(0, at), port: Number(s.slice(at + 1)) };
}

// A frame written byte by byte: `length (4) || kind (1) || id (4) || rest`,
// the length written as `length` when given, so a frame that is not one can
// be put on the wire.
export function rawFrame(kind, id, rest = Buffer.alloc(0), length) {
  const head = Buffer.alloc(9);
  head.writeUInt32BE(length ?? 5 + rest.length, 0);
  head[4] = kind;
  head.writeUInt32BE(id, 5);
  return Buffer.concat([head, rest]);
}

// What a reply box opens to under the lid's secret, when the ward `wardPk`
// signed it: one of the three shapes, or null for what is silence to the
// sender by the strict reading.
export function opens(lidSecret, box, wardPk) {
  if (!box || box.length > 1_048_576) return null;
  const opened = openReply(lidSecret, box);
  if (!opened || !verifyWard(opened.payloadBytes, opened.sig, wardPk)) return null;
  return readReply(opened.payloadBytes);
}

// What a reply reads as: `object`, `silence`, a word, or `none` where no
// reply opened.
export const kindOf = (reply) => (!reply ? 'none' : 'object' in reply ? 'object' : reply.silence ? 'silence' : reply.quo);

export function dial(addr) {
  const socket = createConnection(splitHostPort(addr));
  const got = new Map();
  const wake = new Set();
  let buf = Buffer.alloc(0);
  let nextId = 1;
  let closed = false;
  const notify = () => {
    for (const fn of [...wake]) fn();
  };
  socket.on('error', () => {});
  socket.on('close', () => {
    closed = true;
    notify();
  });
  socket.on('data', (chunk) => {
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32BE(0)) {
      const body = buf.subarray(4, 4 + buf.readUInt32BE(0));
      buf = buf.subarray(4 + body.length);
      if (body.length < 5) continue;
      const id = body.readUInt32BE(1);
      if (!got.has(id)) got.set(id, []);
      got.get(id).push(body[0] === 0x02 ? { kind: 'nothing' } : { kind: body[0] === 0x01 ? 'reply' : body[0], box: Buffer.from(body.subarray(5)) });
      notify();
    }
  });
  const ready = new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  // Waits until `test()` holds, the connection closes, or `ms` pass.
  function until(test, ms) {
    return new Promise((resolve) => {
      const check = () => {
        if (test() || closed) {
          wake.delete(check);
          clearTimeout(timer);
          resolve();
        }
      };
      const timer = setTimeout(() => {
        wake.delete(check);
        resolve();
      }, ms);
      wake.add(check);
      check();
    });
  }

  const d = {
    ready,
    get closed() {
      return closed;
    },
    mintId: () => nextId++,
    async write(bytes) {
      await ready;
      socket.write(bytes);
    },
    // Every frame that came back under `id`, once `n` have or `ms` passed.
    async frames(id, n = 1, ms = 3000) {
      await until(() => (got.get(id)?.length ?? 0) >= n, ms);
      return got.get(id) ?? [];
    },
    // True once the far side closed the connection, false when `ms` passed.
    async whenClosed(ms) {
      await until(() => closed, ms);
      return closed;
    },
    // Sends `box` as one ask frame to `wardPk` and answers the first frame
    // under its id, `{ kind: 'reply', box }` or `{ kind: 'nothing' }`, or
    // null when none came in `ms`.
    async send(wardPk, box, ms = 3000) {
      const id = d.mintId();
      await d.write(frameAsk(id, wardPk, box));
      const [first] = await d.frames(id, 1, ms);
      return first ?? null;
    },
    // Seals `payload` with `signKey` to `wardPk`'s padlock, under `edge` when
    // given, sends it, and answers what crossed back: `{ frame, box, lidSecret,
    // edge, reply }`, `reply` what the reply opens to where the ward signed it.
    // `follows` is the edge key that follows `edge` under the reply, where the
    // reply opened.
    async ask(wardPk, signKey, payload, { ms = 3000, edge } = {}) {
      const sealed = sealAsk(wardPk.slice(64), signKey, payload, edge);
      const frame = await d.send(wardPk, sealed.box, ms);
      const out = { frame, box: sealed.box, lidSecret: sealed.lidSecret, edge: sealed.edge, reply: null, follows: null };
      if (frame?.kind === 'reply' && frame.box.length <= 1_048_576) {
        const opened = openReply(sealed.lidSecret, frame.box);
        if (opened && verifyWard(opened.payloadBytes, opened.sig, wardPk)) {
          out.reply = readReply(opened.payloadBytes);
          out.follows = followEdge(sealed.edge, opened.agreement);
        }
      }
      return out;
    },
    close() {
      socket.destroy();
    },
  };
  return d;
}
