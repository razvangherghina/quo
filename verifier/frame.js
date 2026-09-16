// The frames of CARRIER-TCP.md, and one TCP connection that reads them. A
// reader says a stream is not a frame as soon as its bytes say so, and reads
// nothing after it.
import { connect, createServer } from "node:net";

export const ASK = 0;
export const REPLY = 1;
export const NOTHING = 2;
export const KINDS = ["ask", "reply", "nothing"];
export const MAX_BODY = 1048645;

const head = (length) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(length >>> 0);
  return b;
};

/** One frame: length, kind, id, rest. `id` is a 32-bit unsigned number. */
export function frame(kind, id, rest = Buffer.alloc(0)) {
  const body = Buffer.alloc(5);
  body[0] = kind;
  body.writeUInt32BE(id >>> 0, 1);
  return Buffer.concat([head(5 + rest.length), body, rest]);
}

export const askFrame = (id, pk, box) => frame(ASK, id, Buffer.concat([pk, box]));
export const replyFrame = (id, box) => frame(REPLY, id, box);
export const nothingFrame = (id) => frame(NOTHING, id);

/** Bytes whose length field says `length`, with `body` after it as given. */
export const rawFrame = (length, body = Buffer.alloc(0)) => Buffer.concat([head(length), body]);

/** Why a body of this length and first byte is no frame, or null. */
export function notAFrame(length, kind) {
  if (length > MAX_BODY) return `a length of ${length}, above ${MAX_BODY}`;
  if (length < 5) return `a length of ${length}, below five`;
  if (kind === undefined) return null;
  if (kind > NOTHING) return `a kind of ${kind}`;
  if (kind === ASK && length < 69) return `an ask with ${length - 5} bytes after its id`;
  if (kind === NOTHING && length !== 5) return `a nothing with ${length - 5} bytes after its id`;
  return null;
}

/** Reads frames from a stream of chunks. After bytes that are not a frame, `bad` says why and nothing more is read. */
export class FrameReader {
  constructor() {
    this.buf = Buffer.alloc(0);
    this.bad = null;
  }

  push(chunk) {
    if (this.bad) return [];
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    const out = [];
    while (this.buf.length >= 4) {
      const length = this.buf.readUInt32BE(0);
      const why = notAFrame(length, this.buf.length > 4 ? this.buf[4] : undefined);
      if (why) {
        this.bad = why;
        this.buf = Buffer.alloc(0);
        return out;
      }
      if (this.buf.length < 4 + length) break;
      const body = this.buf.subarray(4, 4 + length);
      this.buf = this.buf.subarray(4 + length);
      const f = { kind: KINDS[body[0]], id: body.readUInt32BE(1) };
      if (body[0] === ASK) {
        f.pk = Buffer.from(body.subarray(5, 69));
        f.box = Buffer.from(body.subarray(69));
      } else if (body[0] === REPLY) f.box = Buffer.from(body.subarray(5));
      out.push(f);
    }
    return out;
  }
}

/** "host:port" to its parts, or null. A host in brackets is an IPv6 address. */
export function parseAt(at) {
  if (typeof at !== "string") return null;
  const m = /^(?:\[([^\]]+)\]|([^:[\]]+)):(\d{1,5})$/.exec(at);
  if (!m) return null;
  const port = Number(m[3]);
  if (port < 1 || port > 65535) return null;
  return { host: m[1] ?? m[2], port };
}

export const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/** One TCP connection speaking frames. Frames go to `onFrame` when set, else to `frames`. */
export class Line {
  constructor(socket) {
    this.socket = socket;
    this.reader = new FrameReader();
    this.frames = [];
    this.onFrame = null;
    this.bytes = 0;
    this.seen = 0;
    this.closed = false;
    this.watchers = new Set();
    this.nextId = 1;
    socket.on("data", (d) => {
      this.bytes += d.length;
      for (const f of this.reader.push(d)) {
        this.seen++;
        if (this.onFrame) this.onFrame(f, this);
        else this.frames.push(f);
      }
      if (this.reader.bad) socket.destroy();
      this.poke();
    });
    socket.on("close", () => {
      this.closed = true;
      this.poke();
    });
    socket.on("error", () => {});
  }

  static dial(at, ms = 10000) {
    const p = parseAt(at);
    if (!p) return Promise.reject(new Error(`${JSON.stringify(at)} is not host:port`));
    return new Promise((resolve, reject) => {
      const socket = connect(p.port, p.host);
      const t = setTimeout(() => {
        socket.destroy();
        reject(new Error(`no connection to ${at} within ${ms / 1000}s`));
      }, ms);
      socket.once("connect", () => {
        clearTimeout(t);
        socket.setNoDelay(true);
        resolve(new Line(socket));
      });
      socket.once("error", (e) => {
        clearTimeout(t);
        reject(e);
      });
    });
  }

  poke() {
    for (const w of [...this.watchers]) w();
  }

  /** Resolves with the first value `test` gives other than undefined, or null after `ms`. */
  until(test, ms) {
    return new Promise((resolve) => {
      let t;
      const w = () => {
        const v = test();
        if (v === undefined) return;
        clearTimeout(t);
        this.watchers.delete(w);
        resolve(v);
      };
      t = setTimeout(() => {
        this.watchers.delete(w);
        resolve(null);
      }, ms);
      this.watchers.add(w);
      w();
    });
  }

  /** Takes the first queued frame with this id that is not an ask; `{ closed }` when the line closes first. */
  answer(id, ms) {
    return this.until(() => {
      const i = this.frames.findIndex((f) => f.id === id && f.kind !== "ask");
      if (i >= 0) return this.frames.splice(i, 1)[0];
      if (this.closed) return { closed: true };
      return undefined;
    }, ms);
  }

  /** Writes an ask frame and waits for what answers it. */
  ask(pk, box, ms = 60000) {
    const id = this.nextId++;
    this.write(askFrame(id, pk, box));
    return this.answer(id, ms);
  }

  write(bytes) {
    if (!this.closed && !this.socket.destroyed) this.socket.write(bytes);
  }

  close() {
    this.socket.destroy();
  }
}

/**
 * A listener of the verifier's own. Every ask frame goes to the one waiter
 * `nextAsk` holds; an ask nobody waits for is answered with a nothing frame.
 */
export class Hold {
  constructor() {
    this.lines = [];
    this.waiter = null;
    this.unwaited = 0;
    this.odd = [];
    this.server = createServer({ noDelay: true }, (socket) => {
      const line = new Line(socket);
      line.firstKind = null;
      this.lines.push(line);
      line.onFrame = (f) => {
        if (line.firstKind === null) line.firstKind = f.kind;
        if (f.kind !== "ask") {
          this.odd.push(`a ${f.kind} frame from the kit`);
          return;
        }
        if (this.waiter) {
          const w = this.waiter;
          this.waiter = null;
          w({ ...f, line });
        } else {
          this.unwaited++;
          line.write(nothingFrame(f.id));
        }
      };
      line.watchers.add(() => {
        if (line.reader.bad && this.waiter && !line.reported) {
          line.reported = true;
          const w = this.waiter;
          this.waiter = null;
          w({ bad: line.reader.bad, first: line.seen === 0, line });
        }
      });
    });
  }

  static async listen() {
    const h = new Hold();
    await new Promise((res, rej) => {
      h.server.once("error", rej);
      h.server.listen(0, "127.0.0.1", res);
    });
    h.at = `127.0.0.1:${h.server.address().port}`;
    return h;
  }

  /** The next ask frame, or `{ answered }` when `racing` settles first, or null after `ms`. */
  nextAsk(ms, racing) {
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.waiter = null;
        resolve(null);
      }, ms);
      const mine = (f) => {
        clearTimeout(t);
        resolve(f);
      };
      this.waiter = mine;
      racing?.then(
        (a) => {
          if (this.waiter !== mine) return;
          this.waiter = null;
          clearTimeout(t);
          resolve({ answered: a });
        },
        () => {},
      );
    });
  }

  close() {
    for (const l of this.lines) l.close();
    this.server.close();
  }
}
