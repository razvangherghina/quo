// Quo over the web (CARRIER-WEB.md): the post and the held line, each as listener and dialer.
import * as http from "node:http";
import { createHash } from "node:crypto";
import { frame, readBody, ASK, REPLY, NOTHING, MAX_BODY } from "./tcp.js";

const MIN_POST = 65;
const MAX_POST = 1048640;
const WAIT_MS = 5000;

// What the ward pk names answers the box: { known, reply }.
function deliver(lookup, pk, box, log) {
  const ward = lookup(Buffer.from(pk).toString("hex"));
  if (!ward) return { known: false, reply: null };
  try {
    return { known: true, reply: ward.arrive(Buffer.from(box)) };
  } catch (e) {
    log(`door threw: ${e.message}`);
    return { known: true, reply: null };
  }
}

const started = (server, host) =>
  new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => resolve(server));
  });

// ---- The post ----

export function listenPost(lookup, { host = "127.0.0.1", log = () => {} } = {}) {
  const server = http.createServer((req, res) => {
    req.on("error", () => {});
    const refuse = (status) => {
      res.writeHead(status, { "content-length": 0, connection: "close" });
      res.end();
    };
    if (req.method !== "POST") {
      req.resume();
      return refuse(405);
    }
    const chunks = [];
    let length = 0;
    let over = false;
    req.on("data", (d) => {
      if (over) return;
      length += d.length;
      if (length > MAX_POST) {
        over = true;
        refuse(413);
        req.destroy();
        return;
      }
      chunks.push(d);
    });
    req.on("end", () => {
      if (over) return;
      if (length < MIN_POST) return refuse(400);
      const body = Buffer.concat(chunks);
      const { known, reply } = deliver(lookup, body.subarray(0, 64), body.subarray(64), log);
      if (!known) return refuse(404);
      if (!reply) return refuse(204);
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": reply.length });
      res.end(reply);
    });
  });
  server.on("upgrade", (_req, sock) => sock.destroy());
  return started(server, host);
}

// Resolves to a reply box, or null for nothing.
export async function askPost(at, wardPkHex, box, timeoutMs = WAIT_MS) {
  try {
    const res = await fetch(at.url, {
      method: "POST",
      body: Buffer.concat([Buffer.from(wardPkHex, "hex"), box]),
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = Buffer.from(await res.arrayBuffer());
    return res.status === 200 && body.length > 0 ? body : null;
  } catch {
    return null;
  }
}

// ---- The held line: WebSocket of RFC 6455 ----

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP_TEXT = 1;
const OP_BINARY = 2;
const OP_CLOSE = 8;
const OP_PING = 9;
const OP_PONG = 10;

// A server's frame: unmasked, final.
export function wsFrame(opcode, payload) {
  const n = payload.length;
  const head = n < 126 ? Buffer.alloc(2) : n < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (n < 126) head[1] = n;
  else if (n < 65536) {
    head[1] = 126;
    head.writeUInt16BE(n, 2);
  } else {
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(n), 2);
  }
  return Buffer.concat([head, payload]);
}

// Feeds bytes from a client; calls onMessage(opcode, payload) per whole message and
// onControl(opcode, payload) per control frame. Returns false once the line is broken.
export function wsReader(onMessage, onControl) {
  let buf = Buffer.alloc(0);
  let parts = null; // { opcode, chunks, length } while a message is fragmented
  let broken = false;
  return (chunk) => {
    if (broken) return false;
    buf = buf.length ? Buffer.concat([buf, chunk]) : chunk;
    for (;;) {
      if (buf.length < 2) return true;
      const fin = (buf[0] & 0x80) !== 0;
      const rsv = buf[0] & 0x70;
      const opcode = buf[0] & 0x0f;
      const masked = (buf[1] & 0x80) !== 0;
      let n = buf[1] & 0x7f;
      let at = 2;
      if (rsv || !masked) return !(broken = true);
      if (n === 126) {
        if (buf.length < 4) return true;
        n = buf.readUInt16BE(2);
        at = 4;
      } else if (n === 127) {
        if (buf.length < 10) return true;
        const big = buf.readBigUInt64BE(2);
        if (big > BigInt(MAX_BODY)) return !(broken = true);
        n = Number(big);
        at = 10;
      }
      const control = opcode >= 8;
      if (control && (!fin || n > 125)) return !(broken = true);
      if (!control && (parts ? parts.length : 0) + n > MAX_BODY) return !(broken = true);
      if (buf.length < at + 4 + n) return true;
      const mask = buf.subarray(at, at + 4);
      const payload = Buffer.from(buf.subarray(at + 4, at + 4 + n));
      for (let i = 0; i < n; i++) payload[i] ^= mask[i & 3];
      buf = buf.subarray(at + 4 + n);
      if (control) {
        if (![OP_CLOSE, OP_PING, OP_PONG].includes(opcode)) return !(broken = true);
        onControl(opcode, payload);
        continue;
      }
      if (opcode === 0) {
        if (!parts) return !(broken = true);
        parts.chunks.push(payload);
        parts.length += n;
      } else {
        if (parts || (opcode !== OP_TEXT && opcode !== OP_BINARY)) return !(broken = true);
        parts = { opcode, chunks: [payload], length: n };
      }
      if (fin) {
        const whole = parts;
        parts = null;
        if (!onMessage(whole.opcode, Buffer.concat(whole.chunks))) return !(broken = true);
      }
    }
  };
}

export function listenLine(lookup, { host = "127.0.0.1", log = () => {} } = {}) {
  const server = http.createServer((req, res) => {
    req.resume();
    res.writeHead(426, { "content-length": 0, connection: "close" });
    res.end();
  });
  server.on("upgrade", (req, sock, head) => {
    sock.on("error", () => {});
    const key = req.headers["sec-websocket-key"];
    const offered = (req.headers["sec-websocket-protocol"] ?? "").split(",").map((p) => p.trim());
    const upgrade = (req.headers.upgrade ?? "").toLowerCase() === "websocket";
    if (req.method !== "GET" || !upgrade || !key || req.headers["sec-websocket-version"] !== "13" || !offered.includes("quo")) {
      sock.end("HTTP/1.1 400 Bad Request\r\nconnection: close\r\ncontent-length: 0\r\n\r\n");
      return;
    }
    const accept = createHash("sha1").update(key + GUID).digest("base64");
    sock.write(
      "HTTP/1.1 101 Switching Protocols\r\nupgrade: websocket\r\nconnection: Upgrade\r\n" +
        `sec-websocket-accept: ${accept}\r\nsec-websocket-protocol: quo\r\n\r\n`,
    );
    let closing = false;
    const close = (code) => {
      if (closing) return;
      closing = true;
      const payload = Buffer.alloc(2);
      payload.writeUInt16BE(code);
      sock.end(wsFrame(OP_CLOSE, payload));
    };
    const onMessage = (opcode, body) => {
      if (opcode !== OP_BINARY) return false;
      const f = readBody(body);
      if (!f) return false;
      if (f.kind !== ASK) return true; // read, nothing said, the line stands
      const { reply } = deliver(lookup, f.rest.subarray(0, 64), f.rest.subarray(64), log);
      const out = reply ? frame(REPLY, f.id, reply) : frame(NOTHING, f.id, Buffer.alloc(0));
      if (!closing) sock.write(wsFrame(OP_BINARY, out.subarray(4)));
      return true;
    };
    const onControl = (opcode, payload) => {
      if (opcode === OP_PING && !closing) sock.write(wsFrame(OP_PONG, payload));
      if (opcode === OP_CLOSE) close(1000);
    };
    const feed = wsReader(onMessage, onControl);
    const take = (d) => {
      if (closing) return;
      if (!feed(d)) close(1002);
    };
    if (head.length) take(head);
    sock.on("data", take);
  });
  return started(server, host);
}

// A dialer of the held line: one WebSocket per address, many asks at once.
export class LineDialer {
  constructor() {
    this.lines = new Map();
  }

  line(url) {
    let l = this.lines.get(url);
    if (l) return l;
    const ws = new WebSocket(url, "quo");
    ws.binaryType = "arraybuffer";
    l = { ws, pending: new Map(), next: 1 };
    l.open = new Promise((resolve) => {
      ws.addEventListener("open", () => resolve(ws.protocol === "quo"));
      ws.addEventListener("close", () => resolve(false));
    });
    const end = () => {
      if (this.lines.get(url) === l) this.lines.delete(url);
      for (const p of l.pending.values()) p(null);
      l.pending.clear();
    };
    ws.addEventListener("message", (e) => {
      const f = typeof e.data === "string" ? null : readBody(Buffer.from(e.data));
      if (!f) return ws.close(1002);
      if (f.kind === ASK) return;
      const p = l.pending.get(f.id);
      if (!p) return;
      l.pending.delete(f.id);
      p(f.kind === REPLY ? Buffer.from(f.rest) : null);
    });
    ws.addEventListener("close", end);
    ws.addEventListener("error", () => {});
    this.lines.set(url, l);
    return l;
  }

  // Resolves to a reply box, or null for nothing. `at` is a ws or wss address read by lib/address.js.
  async ask(at, wardPkHex, box, timeoutMs = WAIT_MS) {
    const l = this.line(at.url);
    const id = l.next++ >>> 0;
    return new Promise((resolve) => {
      const done = (r) => {
        clearTimeout(t);
        l.pending.delete(id);
        resolve(r);
      };
      const t = setTimeout(() => done(null), timeoutMs);
      l.pending.set(id, done);
      l.open.then((ok) => {
        if (!ok) {
          if (l.ws.readyState === WebSocket.OPEN) l.ws.close();
          return done(null);
        }
        if (l.ws.readyState !== WebSocket.OPEN) return done(null);
        l.ws.send(frame(ASK, id, Buffer.concat([Buffer.from(wardPkHex, "hex"), box])).subarray(4));
      });
    });
  }

  close() {
    for (const l of this.lines.values()) l.ws.close();
  }
}
