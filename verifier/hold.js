// A listener of the verifier's own, in any scheme the harness names, and a
// line to a kit's listener in any of them. Every ask that reaches a hold
// goes to the one waiter `nextAsk` holds; an ask nobody waits for is
// answered with nothing.
import http from "node:http";
import { createServer } from "node:net";

import { Line, nothingFrame } from "./frame.js";
import { isClientKey, offered } from "./websocket.js";
import { MAX_POST, MIN_POST, PostLine, PostUp, switching, WsLine, WsServerLine } from "./web.js";

/** The schemes the harness names, in the order the verifier judges them. */
export const SCHEMES = ["tcp", "http", "ws"];
/** The path and query of every web address a hold answers at. */
export const HOLD_PATH = "/quo/in?w=1";

/** A line to a listener at `at`: frames over tcp or the held line, requests over the post. */
export function dial(scheme, at) {
  if (scheme === "tcp") return Line.dial(at);
  if (scheme === "ws") return WsLine.dial(at);
  return Promise.resolve(new PostUp(at));
}

export class Hold {
  constructor(scheme) {
    this.scheme = scheme;
    this.lines = [];
    this.waiter = null;
    this.unwaited = 0;
    this.odd = [];
    this.n = 0;
    this.server = null;
  }

  /** Takes a line in: its asks go to the waiter, and the first bytes that are no ask go to the waiter as bad. */
  accept(line) {
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
        line.send(nothingFrame(f.id));
      }
    };
    line.watchers.add(() => {
      if (!line.bad || line.reported) return;
      line.reported = true;
      if (!this.waiter) {
        this.odd.push(line.bad);
        return;
      }
      const w = this.waiter;
      this.waiter = null;
      w({ bad: line.bad, first: line.seen === 0, line });
    });
  }

  tcp() {
    return createServer({ noDelay: true }, (socket) => this.accept(new Line(socket)));
  }

  ws() {
    const server = http.createServer((req, res) => {
      this.odd.push(`a ${req.method} request with no upgrade`);
      res.writeHead(426, { connection: "close" });
      res.end();
    });
    server.on("upgrade", (req, socket, head) => {
      const line = new WsServerLine(socket);
      this.accept(line);
      const key = req.headers["sec-websocket-key"];
      const handshake = req.method === "GET" && /^websocket$/i.test(req.headers.upgrade ?? "") && isClientKey(key) && req.headers["sec-websocket-version"] === "13";
      const refuse = (why) => {
        socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
        line.bad = why;
        line.poke();
      };
      if (!handshake) return refuse("an opening handshake RFC 6455 does not write");
      if (req.url !== HOLD_PATH) return refuse(`a held line opened to ${req.url}, not to ${HOLD_PATH}`);
      if (!offered(req.headers["sec-websocket-protocol"]).includes("quo")) return refuse("a held line that does not offer the subprotocol quo");
      socket.write(switching(key, true));
      line.start(head);
    });
    return server;
  }

  http() {
    return http.createServer((req, res) => {
      const line = new PostLine(req, res);
      this.accept(line);
      const refuse = (status, why) => {
        line.bad = why;
        line.respond(status);
        req.resume();
        line.poke();
      };
      if (req.url !== HOLD_PATH) return refuse(404, `a request to ${req.url}, not to ${HOLD_PATH}`);
      if (req.method !== "POST") return refuse(405, `a ${req.method} request, not a POST`);
      const chunks = [];
      let len = 0;
      req.on("data", (c) => {
        if (line.bad) return;
        len += c.length;
        if (len > MAX_POST) {
          refuse(413, `a body longer than ${MAX_POST} bytes`);
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        if (line.bad) return;
        if (len < MIN_POST) return refuse(400, `a body of ${len} bytes, shorter than ${MIN_POST}`);
        const body = Buffer.concat(chunks);
        line.bytes = len;
        line.firstKind = "ask";
        line.took({ kind: "ask", id: ++this.n, pk: body.subarray(0, 64), box: body.subarray(64) });
      });
    });
  }

  static async listen(scheme = "tcp") {
    const h = new Hold(scheme);
    h.server = h[scheme]();
    await new Promise((res, rej) => {
      h.server.once("error", rej);
      h.server.listen(0, "127.0.0.1", res);
    });
    const port = h.server.address().port;
    h.at = scheme === "tcp" ? `tcp://127.0.0.1:${port}` : `${scheme}://127.0.0.1:${port}${HOLD_PATH}`;
    return h;
  }

  /** The next ask, or `{ answered }` when `racing` settles first, or `{ bad }`, or null after `ms`. */
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
    this.server.closeAllConnections?.();
  }
}
