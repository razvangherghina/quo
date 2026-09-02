"""The line: framed envelopes over one persistent TCP connection.

Article III of the constitution names one road beside the common carriage, so
that strangers meet on it without agreement. A frame is a length written the
way the wire encoding writes an ``int``, then that many envelope bytes, and
nothing else — the length is the frame's whole vocabulary, and it does not
count itself. Frames flow both directions on one connection and either end may
originate an ask.

Silence has no wire form here: a refused ask produces no frame, and a
zero-length frame is malformed. Only a framing fault ends the connection — a
length at or below zero, or a length above the receiving end's cap — and it
ends without a word.

This module is a road, not the core. It is one of exactly two modules in this
kit that import a host — here ``socket`` — and no core module imports it.
"""

from __future__ import annotations

import re
import socket
import threading
from dataclasses import dataclass
from typing import Callable, Optional

from . import notation, wire

__all__ = [
    "LineError",
    "FramingFault",
    "DEFAULT_CAP",
    "LENGTH_LENGTH",
    "Road",
    "parse_hint",
    "publish",
    "offers",
    "frame",
    "Line",
    "dial",
    "serve",
    "Listener",
]


class LineError(Exception):
    """This end refuses. The connection stands."""


class FramingFault(LineError):
    """A peer that cannot frame cannot be spoken to. The connection ends."""


#: A bare ``tcp://`` hint promises this: envelopes to 16,384 bytes.
DEFAULT_CAP = 16384

#: The length is one wire ``int``, and the line invents no second encoding.
LENGTH_LENGTH = wire.INT_LENGTH

_LENGTH = notation.Base("int")

#: The handler answers bytes, or ``None`` for silence, which puts no frame out.
Handler = Callable[["Line", bytes], Optional[bytes]]


# --------------------------------------------------------------- the road


@dataclass(frozen=True)
class Road:
    """What a ``tcp://`` hint says: where the door is, and what it will accept."""

    host: str
    port: int
    cap: int
    declared: bool


_HINT = re.compile(
    r"^tcp://(?:\[(?P<six>[0-9A-Fa-f:.]+)\]|(?P<host>[^\[\]:/?#]+))"
    r":(?P<port>[0-9]+)(?:\?cap=(?P<cap>[0-9]+))?$"
)


def parse_hint(hint: str) -> Road:
    """Read a ``tcp://`` hint, or refuse it. The port is always written.

    An end that publishes nothing promises the default, so a hint with no
    ``?cap=`` reads as :data:`DEFAULT_CAP`.
    """
    if not isinstance(hint, str):
        raise LineError(f"not a hint: {hint!r}")
    found = _HINT.match(hint)
    if found is None:
        raise LineError(f"not a line hint: {hint!r}")
    port = int(found.group("port"))
    if port < 1 or port > 65535:
        raise LineError(f"a port outside its range: {port}")
    declared = found.group("cap") is not None
    cap = int(found.group("cap")) if declared else DEFAULT_CAP
    if declared and cap < 1:
        raise LineError("a cap at or below zero")
    return Road(
        host=found.group("six") or found.group("host"),
        port=port,
        cap=cap,
        declared=declared,
    )


def publish(host: str, port: int, cap: Optional[int] = None) -> str:
    """The hint a listening end publishes. Only the listening end has one."""
    if port < 1 or port > 65535:
        raise LineError(f"a port outside its range: {port}")
    if cap is not None and cap < 1:
        raise LineError("a cap at or below zero")
    written = f"[{host}]" if ":" in host else host
    hint = f"tcp://{written}:{port}"
    if cap is not None:
        hint = f"{hint}?cap={cap}"
    return hint


def offers(limit: int, hint: str) -> bool:
    """Whether that hint offers the line at all, given the warden's own limit.

    A warden whose published ``limit`` is under the default and whose hint
    declares no cap does not offer the line: the road would promise more than
    the door accepts.
    """
    road = parse_hint(hint)
    if not road.declared:
        return limit >= DEFAULT_CAP
    return True


# -------------------------------------------------------------- the frame


def frame(envelope: bytes, cap: int = DEFAULT_CAP) -> bytes:
    """One frame: the length, then that many envelope bytes, and nothing else.

    A sender stays at or under the cap the far road promised, so an over-cap
    send is refused here rather than sent and cut. A zero-length frame is
    malformed on a line, so it is refused too.
    """
    if not isinstance(envelope, (bytes, bytearray)):
        raise LineError(f"not bytes: {envelope!r}")
    if len(envelope) == 0:
        raise LineError("a zero-length frame, which is malformed on a line")
    if len(envelope) > cap:
        raise LineError(f"an envelope above the cap: {len(envelope)} > {cap}")
    return wire.encode(_LENGTH, len(envelope)) + bytes(envelope)


# --------------------------------------------------------------- the line


class Line:
    """One persistent connection, framed. Either end may originate an ask."""

    def __init__(
        self,
        connection: socket.socket,
        cap: int = DEFAULT_CAP,
        far_cap: int = DEFAULT_CAP,
    ) -> None:
        self.socket = connection
        #: This end's own appetite, which every arriving frame is read against.
        self.cap = cap
        #: What the far road promised, which every frame this end sends is held to.
        self.far_cap = far_cap
        self.open = True
        self._write = threading.Lock()

    def send(self, envelope: bytes, cap: Optional[int] = None) -> None:
        """Put one frame out. Refuses above the far road's cap, and stays open."""
        body = frame(envelope, self.far_cap if cap is None else cap)
        if not self.open:
            raise FramingFault("a line that has ended")
        with self._write:
            self.socket.sendall(body)

    def _take(self, count: int) -> bytes:
        got = bytearray()
        while len(got) < count:
            try:
                chunk = self.socket.recv(count - len(got))
            except TimeoutError:
                raise
            except OSError:
                # The connection went away under us, which is the peer having
                # already gone: the same weather as a clean end.
                break
            if not chunk:
                break
            got.extend(chunk)
        return bytes(got)

    def receive(self) -> Optional[bytes]:
        """The next envelope, or ``None`` when the peer simply went away.

        A framing fault ends the connection without a word: a length at or
        below zero, a length above this end's cap, or a body the connection
        ended before delivering.
        """
        head = self._take(LENGTH_LENGTH)
        if not head:
            self.close()
            return None
        if len(head) < LENGTH_LENGTH:
            self.close()
            raise FramingFault("a length the connection ended inside")
        try:
            length = wire.decode(_LENGTH, head)
        except wire.WireError as bad:  # pragma: no cover - eight bytes always read
            self.close()
            raise FramingFault(str(bad)) from bad
        if length <= 0:
            self.close()
            raise FramingFault(f"a length at or below zero: {length}")
        if length > self.cap:
            self.close()
            raise FramingFault(f"a length above the cap: {length} > {self.cap}")
        body = self._take(length)
        if len(body) < length:
            # A body the connection ends before delivering is the fault having
            # already happened.
            self.close()
            raise FramingFault("a body the connection ended inside")
        return body

    def close(self) -> None:
        if not self.open:
            return
        self.open = False
        try:
            self.socket.close()
        except OSError:
            pass

    def __enter__(self) -> "Line":
        return self

    def __exit__(self, *_exc) -> None:
        self.close()


def dial(hint: str, timeout: Optional[float] = None) -> Line:
    """Dial the listening end. The dialing end publishes nothing.

    The line this end reads is its own door, so it holds the default cap; the
    cap the hint declared is what this end may *send*.
    """
    road = parse_hint(hint)
    connection = socket.create_connection((road.host, road.port), timeout=timeout)
    connection.settimeout(timeout)
    return Line(connection, cap=DEFAULT_CAP, far_cap=road.cap)


def serve(line: Line, handle: Handler) -> None:
    """Read frames off one line until it ends, handing each to the handler.

    Both ends of a line do this, because either end may originate an ask: the
    listening end runs it per line it accepts, and the dialling end runs it on
    the line it opened, which is the only way a ground that publishes nothing
    hears a push at all.

    A well-formed frame that fails the judgment is ordinary silence and the
    line lives on. **The handler answering nothing is not always silence**: it
    is also a handler that took the frame away to be judged elsewhere and will
    put the answer out itself. Which of the two it was is the handler's own
    business, and this reader never waits to find out — a judgment may itself
    wait for an answer arriving on this very line, and a reader blocked on it
    would be a reader waiting for bytes only it can read.
    """
    while True:
        try:
            message = line.receive()
        except FramingFault:
            return
        if message is None:
            return
        try:
            answer = handle(line, message)
        except Exception:
            answer = None
        if answer is None:
            continue
        try:
            line.send(answer)
        except LineError:
            return


class Listener:
    """The listening end: a bound socket, and one thread per line it accepts.

    ``cap`` is this door's own appetite, the one number it says in its hint
    before a byte flows. How it guards the socket beyond that is delivery's.
    """

    def __init__(
        self,
        handle: Handler,
        host: str = "127.0.0.1",
        port: int = 0,
        cap: int = DEFAULT_CAP,
    ) -> None:
        self.handle = handle
        self.cap = cap
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.socket.bind((host, port))
        self.socket.listen(16)
        self.lines: list = []
        self.open = False
        self._thread: Optional[threading.Thread] = None

    @property
    def host(self) -> str:
        return self.socket.getsockname()[0]

    @property
    def port(self) -> int:
        return self.socket.getsockname()[1]

    @property
    def hint(self) -> str:
        """Only the listening end has a road to publish."""
        return publish(
            self.host, self.port, None if self.cap == DEFAULT_CAP else self.cap
        )

    def start(self) -> "Listener":
        self.open = True
        self._thread = threading.Thread(target=self._accept, daemon=True)
        self._thread.start()
        return self

    def _accept(self) -> None:
        while self.open:
            try:
                connection, _ = self.socket.accept()
            except OSError:
                return
            line = Line(connection, self.cap)
            self.lines.append(line)
            threading.Thread(target=self.serve, args=(line,), daemon=True).start()

    def serve(self, line: Line) -> None:
        serve(line, self.handle)

    def close(self) -> None:
        self.open = False
        try:
            self.socket.close()
        except OSError:
            pass
        for line in self.lines:
            line.close()
        self.lines = []
        if self._thread is not None:
            self._thread.join(timeout=5)
            self._thread = None

    def __enter__(self) -> "Listener":
        return self.start()

    def __exit__(self, *_exc) -> None:
        self.close()
