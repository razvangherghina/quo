"""The host, for Python: it opens a warden on the seeds, the clock, the
randomness and the store it is handed, stands roads in front of the warden's
one door, and is delivery beneath it.

This is the only file in the kit that knows every road by name, and it holds no
secret of its own: what it keeps per peer is an address — a padlock, a public
key — beside the line that peer's asks arrive on. The warden makes that
association, because the padlock is inside the seal and no road may open one.

Delivery has three rules and no more. A row with hints: the first road this
ground can speak that carried. A row without hints, or none it can speak: the
line that padlock's last ask arrived on, if still held. Neither: weather, and
the number was spent.

This module is a host, not the core, and no core module imports it.
"""

from __future__ import annotations

import asyncio
import threading
from typing import Any, Mapping, Optional, Sequence

from . import call, carriage, line as tcp
from .being import CARRIED
from .warden import Warden

__all__ = ["Ground", "host", "MEMORY"]

#: The distance-zero doors grounds in one process reach each other through,
#: kept by hint and process-wide, so two hosts opened in one bench find each
#: other the way two wardens in one device would. What is kept here is a
#: :class:`quo.call.Door`, never a warden: the road of distance zero is a road
#: like the other two, and the host stands it rather than reimplementing it.
MEMORY: dict = {}


class _AtDistanceZero:
    """The distance-zero road as a host stands it: one door, and the hint this
    process finds it under. Closing it takes both away."""

    def __init__(self, hint: str, door: call.Door) -> None:
        self.hint = hint
        self.door = door

    def close(self) -> None:
        MEMORY.pop(self.hint, None)
        self.door.close()


class Ground:
    """A warden, the roads standing in front of it, and delivery beneath it."""

    def __init__(self, loop: asyncio.AbstractEventLoop) -> None:
        #: Set the moment the warden is opened on this ground as its delivery.
        self.warden: Any = None
        self.loop = loop
        #: Lines this ground holds, from either end, keyed by the padlock whose
        #: asks arrive on them — learned from the warden, which is the only
        #: thing that read the padlock.
        self.by_padlock: dict = {}
        #: Lines this ground dialled, keyed by the hint, so a second ask down
        #: one road reuses the line rather than dialling again.
        self.by_hint: dict = {}
        #: What each road this ground stood answers on, published to the warden
        #: when it is stood and retracted from it when this ground closes.
        self.hints: list = []
        self.stood: list = []

    # -- delivery, which is what the warden is handed

    def arrived(self, padlock: bytes, via: Any) -> None:
        """The warden's one call downward: an address and an opaque token, with
        nothing coming back. The host never read either."""
        if via is not None and hasattr(via, "open"):
            self.by_padlock[bytes(padlock)] = via

    async def send(self, row: Mapping[str, Any], envelope: bytes) -> Any:
        for hint in row["hints"]:
            try:
                if hint.startswith("mem://"):
                    far = MEMORY.get(hint)
                    if far is None:
                        continue
                    body = await asyncio.to_thread(call.post, far, envelope)
                    return body if body else None
                if hint.startswith("http://") or hint.startswith("https://"):
                    body = await asyncio.to_thread(carriage.post, hint, envelope)
                    return body if body else None
                if hint.startswith("tcp://"):
                    held = await self._dial(hint)
                    if held is None:
                        continue
                    # The answer arrives as a frame of its own, through the door.
                    held.send(envelope)
                    return CARRIED
            except (call.CallError, carriage.CarriageError, tcp.LineError, OSError):
                # Weather on this road; the next may carry.
                continue
        back = self.by_padlock.get(bytes(row["padlock"]))
        if back is not None and back.open:
            try:
                back.send(envelope)
                return CARRIED
            except (tcp.LineError, OSError):
                return None
        return None

    async def _dial(self, hint: str):
        held = self.by_hint.get(hint)
        if held is not None and held.open:
            return held
        held = await asyncio.to_thread(tcp.dial, hint)
        self.by_hint[hint] = held
        self._pump(held)
        return held

    # -- the roads, each ending in the warden's one entry point

    def _pump(self, held) -> None:
        """One reader thread per line, at both ends. It hands each frame to the
        warden and never waits for the judgment."""
        threading.Thread(
            target=tcp.serve, args=(held, self._frame), daemon=True
        ).start()

    def _frame(self, held, message: bytes) -> None:
        """A frame off a line: handed to the warden on the ground's own loop,
        and answered when the judgment finishes rather than in this thread."""
        work = asyncio.run_coroutine_threadsafe(
            self.warden.arrive(message, via=held), self.loop
        )

        def answered(done) -> None:
            try:
                answer = done.result()
            except Exception:
                return
            if not answer:
                return
            try:
                held.send(answer)
            except (tcp.LineError, OSError):
                pass

        work.add_done_callback(answered)
        return None

    def _body(self, message: bytes) -> Optional[bytes]:
        """A body off a road that answers where it asked — the common carriage,
        and distance zero. One message in, one answer out, so this thread does
        wait: whatever the judgment reaches onward goes out on a road of its
        own and never on this one."""
        work = asyncio.run_coroutine_threadsafe(self.warden.arrive(message), self.loop)
        try:
            return work.result(timeout=30)
        except Exception:
            return None

    async def close(self) -> None:
        for held in list(self.by_hint.values()) + list(self.by_padlock.values()):
            held.close()
        self.by_hint.clear()
        self.by_padlock.clear()
        for one in self.stood:
            await asyncio.to_thread(one.close)
        self.stood.clear()
        # A road that has stopped carrying is not a road, so the warden is told
        # to stop minting it into invitations and describes.
        self.warden.retract(*self.hints)
        self.hints.clear()


async def host(
    seeds: Any,
    clock: Any = None,
    random: Any = None,
    roads: Sequence[str] = (),
    store: Any = None,
    hints: Sequence[str] = (),
    limit: int = 65536,
    allowance: Optional[Mapping[str, int]] = None,
) -> Ground:
    """Open a ground: a warden on what is handed in, and the roads it is told.

    ``roads`` are the ones this kit can stand — ``memory`` for distance zero,
    ``http`` for the common carriage, ``tcp`` for the line. A ground told none
    publishes nothing and is reachable only down a line it dialled, which is
    what being uncallable means.
    """
    ground = Ground(asyncio.get_running_loop())
    warden = await Warden.open(
        seeds,
        clock=clock,
        random=random,
        delivery=ground,
        store=store,
        hints=hints,
        limit=limit,
        allowance=allowance,
    )
    ground.warden = warden

    for road in roads:
        if road == "memory":
            hint = f"mem://{warden.name.hex()}"
            MEMORY[hint] = call.Door(ground._body, limit=limit).start()
            stood: Any = _AtDistanceZero(hint, MEMORY[hint])
        elif road == "http":
            stood = carriage.Door(ground._body, limit=limit)
            await asyncio.to_thread(stood.start)
            hint = stood.hint
        elif road == "tcp":
            stood = tcp.Listener(ground._frame)
            await asyncio.to_thread(stood.start)
            hint = stood.hint
        else:
            raise ValueError(f"a road this kit cannot stand: {road!r}")
        warden.publish(hint)
        ground.hints.append(hint)
        ground.stood.append(stood)
    return ground
