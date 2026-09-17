// The frames of CARRIER-TCP.md, and a line that reads them. A reader says a
// stream is not a frame as soon as its bytes say so, and reads nothing after
// it. The held line of CARRIER-WEB.md carries the same bodies with no length
// in front, so a body is taken apart here once for both.
import { connect } from "node:net";

import { tcpAddress } from "./address.js";

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

/** The bodies of whole frames written one after another, their lengths taken as written. */
export function splitFrames(bytes) {
  const out = [];
  let o = 0;
  while (o + 4 <= bytes.length) {
    const n = bytes.readUInt32BE(o);
    out.push(bytes.subarray(o + 4, o + 4 + n));
    o += 4 + n;
  }
  return out;
}

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

/** One whole body taken apart: `{ frame }`, or `{ bad }` saying why it is no frame. */
export function parseBody(body) {
  const bad = notAFrame(body.length, body.length ? body[0] : undefined);
  if (bad) return { bad };
  const f = { kind: KINDS[body[0]], id: body.readUInt32BE(1) };
  if (body[0] === ASK) {
    f.pk = Buffer.from(body.subarray(5, 69));
    f.box = Buffer.from(body.subarray(69));
  } else if (body[0] === REPLY) f.box = Buffer.from(body.subarray(5));
  return { frame: f };
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
      out.push(parseBody(body).frame);
    }
    return out;
  }
}

export const delay = (ms) => new Promise((res) => setTimeout(res, ms));

/**
 * What every line shares, whatever carries its frames. Frames go to
 * `onFrame` when set, else to `frames`. `bytes` counts what the other side
 * wrote, `bad` says why it wrote no frame, and `closed` is set once.
 */
export class FrameLine {
  constructor() {
    this.frames = [];
    this.onFrame = null;
    this.bytes = 0;
    this.seen = 0;
    this.closed = false;
    this.bad = null;
    this.watchers = new Set();
    this.nextId = 1;
  }

  took(f) {
    this.seen++;
    if (this.onFrame) this.onFrame(f, this);
    else this.frames.push(f);
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
    this.send(askFrame(id, pk, box));
    return this.answer(id, ms);
  }
}

/** One TCP connection speaking frames. */
export class Line extends FrameLine {
  constructor(socket) {
    super();
    this.socket = socket;
    this.reader = new FrameReader();
    socket.on("data", (d) => {
      this.bytes += d.length;
      for (const f of this.reader.push(d)) this.took(f);
      if (this.reader.bad) {
        this.bad = this.reader.bad;
        socket.destroy();
      }
      this.poke();
    });
    socket.on("close", () => {
      this.closed = true;
      this.poke();
    });
    socket.on("error", () => {});
  }

  /** Dials a `tcp` address. */
  static dial(at, ms = 10000) {
    const p = tcpAddress(at);
    if (!p) return Promise.reject(new Error(`${JSON.stringify(at)} is not tcp://host:port`));
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

  /** Writes bytes as they are, frames or not. */
  write(bytes) {
    if (!this.closed && !this.socket.destroyed) this.socket.write(bytes);
  }

  /** Writes whole frames. */
  send(frames) {
    this.write(frames);
  }

  close() {
    this.socket.destroy();
  }
}
