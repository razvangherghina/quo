// Quo over TCP: frames, a listener and a dialer.
import * as net from "node:net";

export const MAX_BODY = 1048645;
export const ASK = 0;
export const REPLY = 1;
export const NOTHING = 2;

export function frame(kind, id, rest) {
  const head = Buffer.alloc(9);
  head.writeUInt32BE(5 + rest.length, 0);
  head[4] = kind;
  head.writeUInt32BE(id >>> 0, 5);
  return Buffer.concat([head, rest]);
}

// Feeds bytes; calls onFrame(kind, id, rest) per frame; returns false once the stream is broken.
export function reader(onFrame) {
  let buf = Buffer.alloc(0);
  let broken = false;
  return (chunk) => {
    if (broken) return false;
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    while (buf.length >= 4) {
      const len = buf.readUInt32BE(0);
      if (len > MAX_BODY || len < 5) return !(broken = true);
      if (buf.length < 4 + len) {
        if (buf.length >= 5 && buf[4] > NOTHING) return !(broken = true);
        break;
      }
      const kind = buf[4];
      const id = buf.readUInt32BE(5);
      const rest = buf.subarray(9, 4 + len);
      buf = buf.subarray(4 + len);
      if (kind > NOTHING) return !(broken = true);
      if (kind === ASK && rest.length < 64) return !(broken = true);
      if (kind === NOTHING && rest.length > 0) return !(broken = true);
      onFrame(kind, id, rest);
    }
    return true;
  };
}

// A listener answering for the wards `lookup(pkHex)` returns. `door.arrive(box)` gives a reply box or null.
export function listen(lookup, { host = "127.0.0.1", port = 0, log = () => {} } = {}) {
  const server = net.createServer((sock) => {
    sock.on("error", () => {});
    const feed = reader((kind, id, rest) => {
      if (kind !== ASK) return; // read, nothing said, the connection stands
      const ward = lookup(rest.subarray(0, 64).toString("hex"));
      let reply = null;
      if (ward) {
        try {
          reply = ward.arrive(rest.subarray(64));
        } catch (e) {
          log(`door threw: ${e.message}`);
        }
      }
      sock.write(reply ? frame(REPLY, id, reply) : frame(NOTHING, id, Buffer.alloc(0)));
    });
    sock.on("data", (d) => {
      if (!feed(d)) sock.destroy();
    });
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve(server));
  });
}

// A dialer: one connection per address, many asks at once.
export class Dialer {
  constructor() {
    this.conns = new Map();
  }

  conn(at) {
    let c = this.conns.get(at);
    if (c) return c;
    const i = at.lastIndexOf(":");
    const host = at.slice(0, i).replace(/^\[|\]$/g, "");
    const port = Number(at.slice(i + 1));
    const sock = net.connect({ host, port });
    c = { sock, pending: new Map(), next: 1 };
    const close = () => {
      if (this.conns.get(at) === c) this.conns.delete(at);
      for (const p of c.pending.values()) p(null);
      c.pending.clear();
    };
    const feed = reader((kind, id, rest) => {
      if (kind === ASK) return;
      const p = c.pending.get(id);
      if (!p) return;
      c.pending.delete(id);
      p(kind === REPLY ? Buffer.from(rest) : null);
    });
    sock.on("data", (d) => {
      if (!feed(d)) sock.destroy();
    });
    sock.on("error", close);
    sock.on("close", close);
    this.conns.set(at, c);
    return c;
  }

  // Resolves to a reply box, or null for nothing.
  ask(at, wardPkHex, box, timeoutMs = 5000) {
    const c = this.conn(at);
    const id = c.next++ >>> 0;
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        c.pending.delete(id);
        resolve(null);
      }, timeoutMs);
      c.pending.set(id, (r) => {
        clearTimeout(t);
        resolve(r);
      });
      c.sock.write(frame(ASK, id, Buffer.concat([Buffer.from(wardPkHex, "hex"), box])));
    });
  }

  close() {
    for (const c of this.conns.values()) c.sock.destroy();
  }
}
