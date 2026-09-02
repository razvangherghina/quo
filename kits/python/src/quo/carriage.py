"""The common carriage: HTTPS, one POST, bytes in and bytes out.

Article III of the constitution is the whole specification. The hint a warden
published is the URL, posted to exactly as given: no path is appended, no
query is added, no header is read, no status code carries meaning, and no verb
is checked. The response body is the sealed answer; an empty body is silence's
wire form. Those two are the whole of what the carriage says back.

This module is a road, not the core. It is one of exactly two modules in this
kit that import a host — here ``http.client`` and ``http.server`` — and no core
module imports it.
"""

from __future__ import annotations

import http.client
import http.server
import threading
import urllib.parse
from typing import Any, Callable, Optional, cast

__all__ = [
    "CarriageError",
    "DEFAULT_TIMEOUT",
    "post",
    "reach",
    "Door",
]


class CarriageError(Exception):
    """The road failed. Never a word about the message, which the seal owns."""


DEFAULT_TIMEOUT = 30.0

#: What a caller may send. A handler answers bytes, or ``None`` for silence.
Handler = Callable[[bytes], Optional[bytes]]


def post(hint: str, message: bytes, timeout: float = DEFAULT_TIMEOUT) -> bytes:
    """One POST to the hint exactly as given. Returns the body, empty for silence.

    A status code carries no meaning, so none is read. A road that cannot carry
    the bytes at all raises :class:`CarriageError`, which is weather rather than
    an answer.
    """
    if not isinstance(message, (bytes, bytearray)):
        raise CarriageError("not bytes")
    parts = urllib.parse.urlsplit(hint)
    if parts.scheme not in ("http", "https"):
        raise CarriageError(f"not a carriage hint: {hint!r}")
    if not parts.hostname:
        raise CarriageError(f"a hint with no host: {hint!r}")
    if parts.scheme == "https":
        connection: http.client.HTTPConnection = http.client.HTTPSConnection(
            parts.hostname, parts.port, timeout=timeout
        )
    else:
        connection = http.client.HTTPConnection(
            parts.hostname, parts.port, timeout=timeout
        )
    # Exactly as given: whatever path and query the hint carried, and nothing
    # this kit decided to add.
    target = parts.path or "/"
    if parts.query:
        target = f"{target}?{parts.query}"
    try:
        connection.request("POST", target, body=bytes(message))
        response = connection.getresponse()
        return response.read()
    except OSError as bad:
        raise CarriageError(str(bad)) from bad
    finally:
        connection.close()


def reach(
    hints: list[str], message: bytes, timeout: float = DEFAULT_TIMEOUT
) -> Optional[bytes]:
    """Carry the message down the first road this caller can speak that carried.

    A warden offers as many roads as it has and a caller tries them: a hint is
    a guess about the weather, and none is authoritative. Choosing among them is
    the caller's whole job, and nothing at a call site says which road was
    taken.

    A road this caller cannot speak is not a road that failed. Nothing was sent
    down it, so no door spoke and no road broke — it is neither silence nor
    weather, it is walked past exactly as a hint that was never offered would
    be, and it is never the fault raised at the end. A list of nothing but such
    roads therefore returns ``None`` rather than raising: no road was tried, so
    there is no fault to report the road of.

    **Holding a line is not this file's work.** Delivery, beneath the warden,
    is what holds the roads a ground has dialled and what chooses between the
    roads a ground can speak. This is the common carriage alone, and a hint on
    any other road is walked past here.
    """
    last: Optional[Exception] = None
    for hint in hints:
        try:
            if not (hint.startswith("http://") or hint.startswith("https://")):
                continue
            return post(hint, message, timeout=timeout)
        except (CarriageError, OSError) as bad:
            last = bad
    if last is not None:
        raise CarriageError(str(last)) from last
    return None


class _Handler(http.server.BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:  # a door keeps no log
        return

    def _answer(self, body: bytes) -> None:
        self.send_response(200)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _turn(self) -> None:
        door: Door = cast(_Server, self.server).door
        length = int(self.headers.get("Content-Length") or 0)
        if self.command != "POST" or length <= 0 or length > door.limit:
            # Anything that is not a POST of a sealed body carries no unsealable
            # bytes and meets the same silence as any malformed message.
            if length > 0:
                self.rfile.read(min(length, door.limit))
            self._answer(b"")
            return
        message = self.rfile.read(length)
        try:
            answer = door.handle(message)
        except Exception:  # a door never says which step it was
            answer = None
        self._answer(answer or b"")

    do_POST = _turn
    do_GET = _turn
    do_PUT = _turn
    do_DELETE = _turn
    do_HEAD = _turn


class _Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    #: The door this socket belongs to. A handler reaches it and nothing else.
    door: "Door"


class Door:
    """A warden's door on the common carriage: one POST in, one body out.

    ``limit`` is the largest body this door reads, which is the warden's own
    published limit and nothing the carriage decided.
    """

    def __init__(
        self,
        handle: Handler,
        host: str = "127.0.0.1",
        port: int = 0,
        limit: int = 65536,
    ) -> None:
        self.handle = handle
        self.limit = limit
        self._server = _Server((host, port), _Handler)
        self._server.door = self
        self._thread: Optional[threading.Thread] = None

    @property
    def host(self) -> str:
        # An AF_INET address is a host and a port, and this door binds no other
        # family; the standard library types it wider than it can be here.
        return cast(str, self._server.server_address[0])

    @property
    def port(self) -> int:
        return self._server.server_address[1]

    @property
    def hint(self) -> str:
        """The URL this door publishes. A caller posts to it exactly as given."""
        return f"http://{self.host}:{self.port}/"

    def start(self) -> "Door":
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()
        return self

    def close(self) -> None:
        self._server.shutdown()
        self._server.server_close()
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def __enter__(self) -> "Door":
        return self.start()

    def __exit__(self, *_exc) -> None:
        self.close()
