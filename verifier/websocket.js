// The WebSocket framing of RFC 6455, as far as the verifier speaks it: the
// accept key of the handshake, frames written masked or plain, and a reader
// that joins fragments into messages and says as soon as the bytes break the
// RFC or a message runs past the longest the reader takes.
import { createHash, randomBytes } from "node:crypto";

export const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
export const OP = { cont: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa };

/** The Sec-WebSocket-Accept value for a Sec-WebSocket-Key. */
export const acceptKey = (key) => createHash("sha1").update(`${key}${GUID}`).digest("base64");

/** Whether a Sec-WebSocket-Key is sixteen bytes in base64. */
export const isClientKey = (key) => typeof key === "string" && /^[A-Za-z0-9+/]{22}==$/.test(key) && Buffer.from(key, "base64").length === 16;

/** The subprotocols a Sec-WebSocket-Protocol header offers. */
export const offered = (header) =>
  String(header ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);

/** One frame. A client masks every frame it writes, and a server masks none. */
export function wsFrame(opcode, payload = Buffer.alloc(0), { mask = false, fin = true, key = randomBytes(4) } = {}) {
  const len = payload.length;
  const ext = len < 126 ? 0 : len < 65536 ? 2 : 8;
  const out = Buffer.alloc(2 + ext + (mask ? 4 : 0) + len);
  out[0] = (fin ? 0x80 : 0) | opcode;
  out[1] = (mask ? 0x80 : 0) | (ext === 0 ? len : ext === 2 ? 126 : 127);
  if (ext === 2) out.writeUInt16BE(len, 2);
  if (ext === 8) out.writeBigUInt64BE(BigInt(len), 2);
  let o = 2 + ext;
  if (mask) {
    key.copy(out, o);
    o += 4;
    for (let i = 0; i < len; i++) out[o + i] = payload[i] ^ key[i & 3];
  } else payload.copy(out, o);
  return out;
}

/** A close frame's payload: the code, then the reason. */
export const closePayload = (code, reason = "") => {
  const b = Buffer.alloc(2);
  b.writeUInt16BE(code);
  return Buffer.concat([b, Buffer.from(reason, "utf8")]);
};

/**
 * Reads frames from a stream of chunks, as one side of a connection.
 * `masked` is whether the other side masks, true for a server reading a
 * client. `max` is the longest message it takes. `push` gives events:
 * `{ type: "message", text, data }`, `{ type: "ping", data }`,
 * `{ type: "pong" }`, `{ type: "close", code }`, and once
 * `{ type: "error", why, long }`, after which nothing more is read.
 */
export class WsReader {
  constructor({ masked, max }) {
    this.masked = masked;
    this.max = max;
    this.buf = Buffer.alloc(0);
    this.parts = null;
    this.partLen = 0;
    this.text = false;
    this.bad = null;
  }

  fail(out, why, long = false) {
    this.bad = why;
    this.buf = Buffer.alloc(0);
    out.push({ type: "error", why, long });
    return out;
  }

  push(chunk) {
    const out = [];
    if (this.bad) return out;
    this.buf = this.buf.length ? Buffer.concat([this.buf, chunk]) : Buffer.from(chunk);
    while (this.buf.length >= 2) {
      const b0 = this.buf[0];
      const b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0;
      const op = b0 & 0x0f;
      if (b0 & 0x70) return this.fail(out, "a frame with a reserved bit set");
      const isMasked = (b1 & 0x80) !== 0;
      if (isMasked !== this.masked) return this.fail(out, this.masked ? "an unmasked frame from a client" : "a masked frame from a server");
      const control = op >= 0x8;
      if (![OP.cont, OP.text, OP.binary, OP.close, OP.ping, OP.pong].includes(op)) return this.fail(out, `a frame of opcode ${op}`);
      let len = b1 & 0x7f;
      let at = 2;
      if (len === 126) {
        if (this.buf.length < 4) break;
        len = this.buf.readUInt16BE(2);
        at = 4;
      } else if (len === 127) {
        if (this.buf.length < 10) break;
        const big = this.buf.readBigUInt64BE(2);
        if (big >> 63n) return this.fail(out, "a frame length with its top bit set");
        len = big > BigInt(Number.MAX_SAFE_INTEGER) ? Infinity : Number(big);
        at = 10;
      }
      if (control && (len > 125 || !fin)) return this.fail(out, "a control frame fragmented or longer than 125 bytes");
      if (!control) {
        if (op === OP.cont && !this.parts) return this.fail(out, "a continuation with no message begun");
        if (op !== OP.cont && this.parts) return this.fail(out, "a new message before the last one ended");
        const text = op === OP.cont ? this.text : op === OP.text;
        if ((op === OP.cont ? this.partLen : 0) + len > this.max) return this.fail(out, `a ${text ? "text" : "binary"} message longer than ${this.max} bytes`, true);
      }
      const keyAt = at;
      if (this.masked) at += 4;
      if (this.buf.length < at + len) break;
      const payload = Buffer.from(this.buf.subarray(at, at + len));
      if (this.masked) for (let i = 0; i < len; i++) payload[i] ^= this.buf[keyAt + (i & 3)];
      this.buf = this.buf.subarray(at + len);
      if (op === OP.ping) out.push({ type: "ping", data: payload });
      else if (op === OP.pong) out.push({ type: "pong" });
      else if (op === OP.close) {
        out.push({ type: "close", code: payload.length >= 2 ? payload.readUInt16BE(0) : null });
        this.bad = "closed";
        return out;
      } else {
        if (op !== OP.cont) {
          this.parts = [];
          this.partLen = 0;
          this.text = op === OP.text;
        }
        this.parts.push(payload);
        this.partLen += len;
        if (fin) {
          out.push({ type: "message", text: this.text, data: Buffer.concat(this.parts) });
          this.parts = null;
          this.partLen = 0;
        }
      }
    }
    return out;
  }
}
