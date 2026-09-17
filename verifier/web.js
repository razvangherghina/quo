// The two forms of CARRIER-WEB.md as lines the verifier holds. The held
// line is a WebSocket: dialed with the runtime's own client, and answered by
// a server written here on RFC 6455. The post is one HTTP request per ask:
// sent with node:http, and answered one request at a time.
import http from "node:http";

import { webAddress } from "./address.js";
import { FrameLine, MAX_BODY, parseBody, splitFrames } from "./frame.js";
import { acceptKey, closePayload, OP, wsFrame, WsReader } from "./websocket.js";

/** The longest body a post carries: a ward pk and a box of the size. */
export const MAX_POST = 64 + 1048576;
/** The shortest body a post carries: a ward pk and one byte of box. */
export const MIN_POST = 65;

// ---------- the held line ----------

/** A held line the verifier dials, with the WebSocket client of the runtime. */
export class WsLine extends FrameLine {
  constructor(ws) {
    super();
    this.ws = ws;
    ws.binaryType = "arraybuffer";
    ws.addEventListener("message", (e) => {
      if (this.bad) return;
      if (typeof e.data === "string") {
        this.bytes += Buffer.byteLength(e.data);
        this.fail("a text message");
      } else {
        const b = Buffer.from(e.data);
        this.bytes += b.length;
        const p = parseBody(b);
        if (p.bad) this.fail(p.bad);
        else this.took(p.frame);
      }
      this.poke();
    });
    ws.addEventListener("close", () => {
      this.closed = true;
      this.poke();
    });
    ws.addEventListener("error", () => {});
  }

  /** Opens a held line to an address, offering `protocols`; rejects when the handshake fails. */
  static dial(at, { protocols = ["quo"], ms = 10000 } = {}) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(at, protocols);
      } catch (e) {
        reject(e);
        return;
      }
      const line = new WsLine(ws);
      const t = setTimeout(() => {
        line.close();
        reject(new Error(`no held line to ${at} within ${ms / 1000}s`));
      }, ms);
      ws.addEventListener("open", () => {
        clearTimeout(t);
        resolve(line);
      });
      ws.addEventListener("close", () => {
        clearTimeout(t);
        reject(new Error(`the handshake with ${at} failed`));
      });
    });
  }

  /** The subprotocol the listener selected. */
  get protocol() {
    return this.ws.protocol;
  }

  fail(why) {
    this.bad = why;
    this.close();
  }

  /** Sends each whole frame as one binary message, with no length in front. */
  send(frames) {
    for (const body of splitFrames(frames)) this.sendBody(body);
  }

  sendBody(body) {
    if (this.ws.readyState === 1) this.ws.send(body);
  }

  sendText(text) {
    if (this.ws.readyState === 1) this.ws.send(text);
  }

  close() {
    try {
      this.ws.close();
    } catch {
      // A line not yet open closes as it fails.
    }
  }
}

/** A held line a dialer opened to a listener of the verifier's own. */
export class WsServerLine extends FrameLine {
  constructor(socket) {
    super();
    this.socket = socket;
    this.reader = new WsReader({ masked: true, max: MAX_BODY });
    socket.setNoDelay?.(true);
    socket.on("close", () => {
      this.closed = true;
      this.poke();
    });
    socket.on("error", () => {});
  }

  /** Reads what follows the handshake, `head` first. */
  start(head) {
    this.socket.on("data", (d) => this.read(d));
    if (head?.length) this.read(head);
  }

  read(chunk) {
    for (const ev of this.reader.push(chunk)) {
      if (ev.type === "message") {
        this.bytes += ev.data.length;
        if (ev.text) this.fail("a text message");
        else {
          const p = parseBody(ev.data);
          if (p.bad) this.fail(p.bad);
          else this.took(p.frame);
        }
      } else if (ev.type === "ping") this.write(wsFrame(OP.pong, ev.data));
      else if (ev.type === "close") {
        this.write(wsFrame(OP.close, closePayload(1000)));
        this.socket.end();
      } else if (ev.type === "error") this.fail(ev.why);
      if (this.bad) break;
    }
    this.poke();
  }

  fail(why) {
    this.bad = why;
    this.socket.destroy();
  }

  write(bytes) {
    if (!this.closed && !this.socket.destroyed) this.socket.write(bytes);
  }

  send(frames) {
    for (const body of splitFrames(frames)) this.write(wsFrame(OP.binary, body));
  }

  close() {
    this.socket.destroy();
  }
}

/** The handshake answer that opens a held line, selecting `quo` when it was offered. */
export const switching = (key, quo) =>
  `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${acceptKey(key)}\r\n${quo ? "Sec-WebSocket-Protocol: quo\r\n" : ""}\r\n`;

// ---------- the post ----------

const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

/**
 * One HTTP request to an address: `{ status, body }`, or `{ error }` when no
 * whole response came back.
 */
export function post(at, body, { method = "POST", headers = {}, ms = 60000 } = {}) {
  const a = webAddress(at);
  if (!a) return Promise.resolve({ error: `${JSON.stringify(at)} is no address of the post` });
  return new Promise((resolve) => {
    let done = false;
    const end = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const req = http.request(
      { host: a.host, port: a.port, path: a.path, method, agent, headers: { ...(body ? { "content-length": body.length } : {}), ...headers } },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => end({ status: res.statusCode, body: Buffer.concat(chunks) }));
        res.on("error", (e) => end({ error: e.message, status: res.statusCode }));
        res.on("aborted", () => end({ error: "the response was cut", status: res.statusCode }));
      },
    );
    req.setTimeout(ms, () => {
      req.destroy();
      end({ error: `no response within ${ms / 1000}s` });
    });
    req.on("error", (e) => end({ error: e.message }));
    req.end(body ?? undefined);
  });
}

/**
 * What a response to a post means: a reply, or nothing. Any status other
 * than 200 is nothing. Status 200 with an empty body is nothing to the
 * dialer, and `odd` to a listener, which owes a box with 200.
 */
export function postAnswer(r) {
  if (r.error) return { closed: true, why: r.error };
  if (r.status === 200 && r.body.length > 0) return { kind: "reply", box: r.body, status: 200 };
  if (r.status === 200) return { kind: "nothing", status: 200, odd: "status 200 with an empty body" };
  return { kind: "nothing", status: r.status };
}

/** The post as a line: each ask is one request, answered as a frame would be. */
export class PostUp {
  constructor(at) {
    this.at = at;
    this.closed = false;
  }

  async ask(pk, box) {
    return postAnswer(await post(this.at, Buffer.concat([pk, box])));
  }

  close() {}
}

/** One post that reached a listener of the verifier's own, answered as a frame. */
export class PostLine extends FrameLine {
  constructor(req, res) {
    super();
    this.req = req;
    this.res = res;
    this.post = true;
    res.on("close", () => {
      this.closed = true;
      this.poke();
    });
  }

  /** Answers with a status and a body. */
  respond(status, body) {
    if (this.res.headersSent || this.res.writableEnded) return;
    this.res.writeHead(status, body?.length ? { "content-type": "application/octet-stream", "content-length": body.length } : {});
    this.res.end(body?.length ? body : undefined);
  }

  /** A reply frame answers 200 with its box, and a nothing frame answers 204. */
  send(frames) {
    for (const body of splitFrames(frames)) {
      const f = parseBody(body).frame;
      if (f?.kind === "reply") this.respond(200, f.box);
      else if (f?.kind === "nothing") this.respond(204);
    }
  }

  close() {
    this.req.socket.destroy();
  }
}
