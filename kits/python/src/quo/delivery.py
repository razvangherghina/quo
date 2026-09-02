"""What a host hands a warden, and the smallest honest versions of each.

Seeds drawn from the host's randomness, a store that keeps the records in
memory, and a delivery that hands bytes straight to another warden in the same
process — the road of distance zero, which waives no step.

This module is core: it names no host and opens no socket. The delivery here
is a road only in the sense that distance zero is one.
"""

from __future__ import annotations

import secrets as _secrets
from dataclasses import dataclass
from typing import Any, Callable, Mapping, Optional

__all__ = ["Seeds", "seeds", "MemoryStore", "MemoryDelivery", "memory_delivery"]


@dataclass(frozen=True)
class Seeds:
    """The three secrets a warden is opened on, and never reaches for itself."""

    name: bytes
    padlock: bytes
    heir: bytes


def seeds(random: Optional[Callable[[], bytes]] = None) -> Seeds:
    """Three fresh seeds from the host's randomness."""
    draw = random if random is not None else (lambda: _secrets.token_bytes(32))
    return Seeds(name=draw(), padlock=draw(), heir=draw())


class MemoryStore:
    """The store's shape is the warden's; where it lives is the host's. Here it
    lives in a variable, which is what a bench and a browser tab both want."""

    def __init__(self) -> None:
        self.snapshot: Optional[dict] = None

    async def save(self, snapshot: Mapping[str, Any]) -> None:
        self.snapshot = dict(snapshot)

    async def load(self) -> Optional[dict]:
        return self.snapshot


class MemoryDelivery:
    """Delivery's three rules at distance zero.

    A row with hints is handed to the first door attached under one of them; a
    row without hints has no line here to ride, so it is weather; a hint
    nothing is attached under is walked past. What delivery is given per row is
    the way back and nothing else.
    """

    def __init__(self) -> None:
        self.doors: dict = {}
        self.watchers: list = []

    def attach(self, hint: str, warden: Any) -> None:
        self.doors[hint] = warden

    def detach(self, hint: str) -> None:
        self.doors.pop(hint, None)

    def watch(self, watcher: Callable[[Mapping[str, Any]], None]) -> None:
        self.watchers.append(watcher)

    def arrived(self, padlock: bytes, via: Any) -> None:
        """At distance zero there is no line to remember: the doors are attached
        by hint and a peer that publishes none is not reachable from here."""

    async def send(self, row: Mapping[str, Any], envelope: bytes) -> Any:
        for watcher in self.watchers:
            watcher(row)
        for hint in row["hints"]:
            far = self.doors.get(hint)
            if far is None:
                continue
            return await far.arrive(envelope)
        return None


def memory_delivery() -> MemoryDelivery:
    return MemoryDelivery()
