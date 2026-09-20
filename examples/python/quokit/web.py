"""Quo over the web, its post: a listener and a dialer."""

import http.client
import http.server
import threading

from .box import SIZE

SHORTEST, LONGEST = 65, 64 + SIZE


class PostListener:
    """Answers posts for the wards `door(pk)` finds, as `carrier.Listener` does."""

    def __init__(self, door, log):
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_POST(self):
                try:
                    length = int(self.headers.get("Content-Length", ""))
                except ValueError:
                    return self.answer(411)
                if length < SHORTEST or length > LONGEST:
                    self.close_connection = True
                    return self.answer(413 if length > LONGEST else 400)
                body = self.rfile.read(length)
                if len(body) != length:
                    self.close_connection = True
                    return
                arrive = door(body[:64].hex())
                if arrive is None:
                    return self.answer(404)
                reply = arrive(body[64:])
                if reply is None:
                    self.answer(204)
                else:
                    self.answer(200, reply)

            def answer(self, status, body=b""):
                self.send_response(status)
                if body:
                    self.send_header("Content-Type", "application/octet-stream")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def not_post(self):
                self.close_connection = True
                self.answer(405)

            do_GET = do_PUT = do_HEAD = do_DELETE = do_OPTIONS = do_PATCH = not_post

            def log_message(self, fmt, *args):
                pass

        class Server(http.server.ThreadingHTTPServer):
            request_queue_size = 64
            daemon_threads = True

        self.server = Server(("127.0.0.1", 0), Handler)
        host, port = self.server.server_address[:2]
        self.at = "http://%s:%d/" % (host, port)
        threading.Thread(target=self.server.serve_forever, daemon=True).start()


def post(at, ward_pk, box, wait):
    """Carry one ask to an http or https Address. Returns the reply box, or None for nothing."""
    kind = http.client.HTTPSConnection if at.scheme == "https" else http.client.HTTPConnection
    conn = kind(at.host, at.port, timeout=wait)
    try:
        conn.request("POST", at.target, body=ward_pk + box,
                     headers={"Content-Type": "application/octet-stream"})
        res = conn.getresponse()
        body = res.read(SIZE + 1)
        return body if res.status == 200 and body else None
    except (OSError, http.client.HTTPException, ValueError):
        return None
    finally:
        conn.close()
