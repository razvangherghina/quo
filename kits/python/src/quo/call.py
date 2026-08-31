"""Distance zero: the carriage is a call.

Article III names three carriages. This is the third: two houses in one device
or one process handing envelope bytes as bytes, a private carriage like any
other, needing no naming because no wire exists to disagree about. There is no
hint, because a hint is where to send bytes and here the door itself is the
address.

**Distance zero waives no step of the judgment.** The bytes handed over are the
same sealed, signed envelope the common carriage would have carried, and the
door behind this road spends every step of Article XII on them. The seal and
the signature are what make the two houses two; a ground that strips them for
being local has rebuilt the ambient permission the law exists to end. So this
module carries no shortcut of any kind: it is the carriage with the socket
removed and nothing else removed.

Within one house there is no carriage at all, because there are no strangers.
This road is for two houses that happen to share a process, never for a house
talking to itself.

This module is a road, not the core, and no core module imports it. Unlike the
other two it imports no host at all — there is nothing to import, which is the
whole of what distance zero means.
"""

from __future__ import annotations

from typing import Callable, Optional

__all__ = [
    "CallError",
    "DEFAULT_LIMIT",
    "Door",
    "post",
]


class CallError(Exception):
    """The road failed. Never a word about the message, which the seal owns."""


DEFAULT_LIMIT = 65536

#: What a caller may hand over. A handler answers bytes, or ``None`` for silence.
Handler = Callable[[bytes], Optional[bytes]]


class Door:
    """A warden's door at distance zero: bytes in, bytes out, no wire between.

    ``limit`` is the largest message this door reads, which is the warden's own
    published limit and nothing this road decided. A door that is not open
    carries nothing, the same weather a closed socket is.
    """

    def __init__(self, handle: Handler, limit: int = DEFAULT_LIMIT) -> None:
        self.handle = handle
        self.limit = limit
        self.open = False

    def start(self) -> "Door":
        self.open = True
        return self

    def close(self) -> None:
        self.open = False

    def __enter__(self) -> "Door":
        return self.start()

    def __exit__(self, *_exc) -> None:
        self.close()


def post(door: Door, message: bytes) -> bytes:
    """Hand one message to the door. Returns the answer, empty for silence.

    The bytes cross as bytes and nothing reads them on the way: no length is
    negotiated, no framing is added, and the copy the door sees is its own, so
    neither house can reach into the other's buffer after the call. A door that
    is not open raises :class:`CallError`, which is weather rather than an
    answer.
    """
    if not isinstance(door, Door):
        raise CallError("not a door at distance zero")
    if not isinstance(message, (bytes, bytearray)):
        raise CallError("not bytes")
    if not door.open:
        raise CallError("a door that is not open")
    body = bytes(message)
    if len(body) == 0 or len(body) > door.limit:
        # A message the door would not have read off a socket is not read here
        # either, and it meets the same silence.
        return b""
    try:
        answer = door.handle(body)
    except Exception:  # a door never says which step it was
        return b""
    return bytes(answer) if answer else b""
