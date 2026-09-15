// Quo over TCP, the one carrier Quo publishes. A harbor that listens holds a
// host and a port and stands wards behind it. A kit that dials opens a
// connection and asks on it. Many asks are in flight at once, the dialer
// mints the ids, and the listener copies each onto the reply or the nothing
// that answers it, so replies arrive in any order.
//
// Nothing is wrapped around the stream: the box is already sealed and signed.

import { createServer, connect } from 'node:net';
import { askFrame, frameReader, nothingFrame, replyFrame } from './frame.js';

// The listener. `carry` is bytes to a ward pk in, the door's bytes out, and
// null when this harbor stands no ward under that pk or the ward is not
// running. Nothing, `02`, is sent on that null and never after the door has
// taken the bytes.
export function listen({ host, port, carry }) {
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => socket.destroy());
    const read = frameReader();
    socket.on('data', (chunk) => {
      // The connection closes on what is not a frame and on nothing else. The
      // dialer asks, so an ask is what the listener answers.
      const bodies = read(new Uint8Array(chunk));
      if (!bodies) return socket.destroy();
      for (const body of bodies) if (body.kind === 'ask') void answer(socket, body);
    });
  });

  // A carry that throws may have handed the bytes to a door already, so it is
  // answered with no frame at all and the asker's allowance ends it as late.
  async function answer(socket, { id, pk, box }) {
    let bytes;
    try {
      bytes = await carry(pk, box.slice());
    } catch {
      return;
    }
    if (socket.destroyed) return;
    socket.write(bytes ? replyFrame(id, bytes) : nothingFrame(id));
  }

  const standing = new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve(server.address()));
  });

  return standing.then((address) => ({
    host: address.address,
    port: address.port,
    close: () =>
      new Promise((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  }));
}

// The dialer. One connection, many asks, ids minted here. A connection that
// closes with asks in flight answers none of them: those asks are ended by
// the ward's allowance as `late`, which is what chapter 6 asks of a carrier
// that has already sent the bytes.
export function dial({ host, port }) {
  const waiting = new Map();
  let id = 0;

  const socket = connect({ host, port });
  socket.on('error', () => socket.destroy());
  const read = frameReader();
  socket.on('data', (chunk) => {
    const bodies = read(new Uint8Array(chunk));
    if (!bodies) return socket.destroy();
    // The listener answers, so a reply and a nothing are what the dialer
    // reads. An ask is a frame and closes nothing; it answers no ask of this
    // side, so nothing is waiting for it.
    for (const body of bodies) {
      const answer = body.kind === 'ask' ? undefined : waiting.get(body.id);
      if (!answer) continue;
      waiting.delete(body.id);
      answer(body.kind === 'reply' ? body.box.slice() : null);
    }
  });

  const open = new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });

  return {
    // Bytes to a ward key in, bytes or nothing out. Nothing means the
    // listener said it stands no such ward, or the connection is gone and the
    // frame never left; a frame that left and was never answered waits, and
    // the allowance ends it.
    async carry(pk, bytes) {
      await open;
      if (socket.destroyed) return null;
      const mine = (id = (id + 1) >>> 0);
      return new Promise((resolve) => {
        waiting.set(mine, resolve);
        socket.write(askFrame(mine, pk, bytes));
      });
    },
    close: () =>
      new Promise((resolve) => {
        socket.end(() => resolve());
        socket.destroy();
      }),
  };
}
