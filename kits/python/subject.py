"""A Quo ground another language can knock on, and knock with.

It exists so a kit written from the law in one language can be shown to speak
to a kit written from the law in another, with neither side ever reading the
other's source.

Two modes.

Serve hangs a door on the common carriage, holds one granted being, mints an
invitation, and prints one line of plain facts on startup — everything a
stranger needs to speak to it and nothing about how it is built. It does not
publish the being: the invitation does not even name it, so a stranger
rotates, describes, and finds what it now reaches.

Speak takes another door's facts the same way and sends it a real message,
reporting what came back.

Either mode will run over the framed TCP carriage instead of HTTP when it is
given ``-line``, and nothing above it changes: the same warden, the same
invitation, the same messages, a different road. Speaking over a line, this
command can also hold a being of its own and grant the far ground a standing
at it, so that the ground it dialled can ask down the connection it never
opened — which is the whole reason a line is worth holding.

Serving over a line, ``-push`` is the other half of that: this ground asks
down a connection it accepted. A standing granted back never travels on the
wire, so it is handed to this command one JSON object per line on stdin, and
each is spent on a line this door accepted.

Given ``-zero`` instead, speak raises the far house in this very process and
hands it the envelope bytes as bytes, with no socket anywhere. It takes no
facts, because there is no road to address: at distance zero the door itself
is the address. Two grounds, two voices, two sets of keys, one process — and
every step of the judgment spent exactly as it is spent across a wire, which
is the whole point of the mode.

The facts line is JSON because a hint is an opaque string the protocol never
parses, and a space-separated line cannot carry one that holds a space. Every
line this command prints is one JSON object carrying the member ``quo``.

This file is an entry point, not part of the kit. It sits outside the package
so that importing ``quo`` still pulls in no host.

**It stands its own ground rather than using ``quo.host``, and does so on
purpose.** A subject exists to prove the kit from outside, which means it must
compose what no application may. Three of the things it does have no surface on
the host and are not owed one: it raises a door at distance zero with no hint
at all, because at distance zero the door itself is the address and there is
nothing to publish; it keeps the accepted lines in the order it first heard
from them, so ``-push`` can spend a standing down a connection this ground
never opened; and it drives the warden from a synchronous command with a loop
of its own on a thread of its own. The seam never grows a surface to
accommodate a harness, so the harness reaches past it — and everything else
here is the warden's own public API, called rather than reproduced.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import queue
import secrets
import sys
import threading
import time
from typing import Any, Callable, Optional

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "src"))

from quo import (  # noqa: E402
    arithmetic,
    being,
    call,
    carriage,
    delivery,
    line,
    notation,
    warden,
    wire,
)

# The class the door holds. A stranger is told none of this: it learns the
# digest from a describe and the text by asking the warden for the blueprint
# that hashes to it, which is the path the law already gives.
#
# Both fields ride as one `int` — eight bytes, signed two's complement, most
# significant first — so a kit in any language can call them without a codec.
COUNTER = "Counter\n  bump(by int) int\n  count() int\n"

LIMIT = 1 << 20
ALLOWANCE = {"time": 5000, "hops": 8}
B32 = notation.Base("b32")
TEXT = notation.Maybe(notation.Base("text"))


def draw() -> bytes:
    return secrets.token_bytes(arithmetic.KEY_LENGTH)


def emit(value: dict) -> None:
    """One line of JSON, flushed, so a driver reading line by line sees it
    before the process blocks."""
    sys.stdout.write(json.dumps(value) + "\n")
    sys.stdout.flush()


def note(*what: Any) -> None:
    """A refusal goes to this host's own stderr and nowhere else."""
    print("subject:", *what, file=sys.stderr, flush=True)


class Counter:
    """An ordinary object. It never learns it has an address, judges nothing,
    sees no key and never touches a byte: the warden decodes what arrives by
    the blueprint and encodes what this answers by it."""

    def __init__(self) -> None:
        self.total = 0

    def bump(self, by: int) -> int:
        self.total += by
        return self.total

    def count(self) -> int:
        return self.total


class Ground:
    """This command's warden, the loop it judges on, and delivery beneath it.

    Every road ends in :meth:`arrive`, the warden's one entry point, and no
    road here opens a seal: the record byte inside says whether an answer or an
    ask arrived, and only the warden reads it. What this object keeps per peer
    is an address — a padlock — beside the line that peer's asks arrive on, and
    the warden is what puts them together, having judged the frame.
    """

    def __init__(self, limit: int = LIMIT) -> None:
        self.loop = asyncio.new_event_loop()
        self.spinning = threading.Thread(target=self._spin, daemon=True)
        self.spinning.start()
        #: Lines this ground holds, from either end, keyed by the padlock whose
        #: asks arrive on them.
        self.by_padlock: dict = {}
        #: Lines this ground dialled, keyed by the hint.
        self.by_hint: dict = {}
        #: Every line this ground has been spoken on, in the order it first
        #: heard from them: what the pushing half spends its standings down.
        self.accepted: queue.Queue = queue.Queue()
        self.known: set = set()
        #: A door at distance zero, when that is the road.
        self.zero: Any = None
        self.warden = self.run(
            warden.Warden.open(
                delivery.Seeds(name=draw(), padlock=draw(), heir=draw()),
                random=draw,
                limit=limit,
                delivery=self,
                allowance=ALLOWANCE,
            )
        )

    def _spin(self) -> None:
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def run(self, work: Any) -> Any:
        """Run one piece of the warden's work on this ground's own loop.

        A warden is not concurrent, and every road reaches it from a thread of
        its own: an HTTP door serves each request on one, and a line reads on
        another. One loop is what keeps the door to itself.
        """
        return asyncio.run_coroutine_threadsafe(work, self.loop).result(timeout=30)

    def call(self, fn: Callable, *args: Any, **kwargs: Any) -> Any:
        async def once():
            return fn(*args, **kwargs)

        return self.run(once())

    def arrive(self, message: bytes, via: Any = None) -> Optional[bytes]:
        """What every road hands this ground, and the whole of what it hands."""
        return self.run(self.warden.arrive(message, via=via))

    # -- delivery, which the warden was handed and calls downward

    def arrived(self, padlock: bytes, via: Any) -> None:
        if via is None or not getattr(via, "open", False):
            return
        self.by_padlock[bytes(padlock)] = via
        if id(via) not in self.known:
            self.known.add(id(via))
            self.accepted.put(via)

    async def send(self, row: dict, message: bytes) -> Any:
        for hint in row["hints"]:
            try:
                if hint.startswith("tcp://"):
                    held = self.dial(hint)
                    held.send(message)
                    return being.CARRIED
                if hint.startswith("http://") or hint.startswith("https://"):
                    body = await asyncio.to_thread(carriage.post, hint, message)
                    return body or None
            except (carriage.CarriageError, line.LineError, OSError) as bad:
                note("weather:", bad)
                continue
        if self.zero is not None:
            return await asyncio.to_thread(call.post, self.zero, message) or None
        back = self.by_padlock.get(bytes(row["padlock"]))
        if back is not None and back.open:
            back.send(message)
            return being.CARRIED
        return None

    def dial(self, hint: str):
        held = self.by_hint.get(hint)
        if held is not None and held.open:
            return held
        held = line.dial(hint)
        # This end reads against its own appetite, which is not the default.
        held.cap = self.warden.limit
        self.by_hint[hint] = held
        self.pump(held)
        return held

    def frame(self, road, message: bytes) -> None:
        """One frame off a line, at either end: handed to the warden on this
        ground's loop and answered when the judgment finishes.

        **This reader never waits for that judgment**, because a judgment may
        itself be waiting for an answer arriving on this very line, and a
        reader blocked on it would be waiting for bytes only it can read.
        """
        work = asyncio.run_coroutine_threadsafe(
            self.warden.arrive(message, via=road), self.loop
        )

        def answered(done) -> None:
            try:
                reply = done.result()
            except Exception as bad:
                note("refused:", bad)
                return
            if not reply:
                return
            try:
                road.send(reply)
            except (line.LineError, OSError):
                pass

        work.add_done_callback(answered)
        return None

    def pump(self, held) -> None:
        """One reader thread per line this ground dialled. The listening end
        gets the same reader from its own listener."""
        threading.Thread(
            target=line.serve, args=(held, self.frame), daemon=True
        ).start()


# ------------------------------------------------------------------- serve


def stranger(ground: Ground, at: bytes, hint: str) -> None:
    """Mint the invitation and print the facts line: everything a stranger
    needs to speak to this ground, over whichever road it was given."""
    ground.warden.publish(hint)
    invitation = ground.call(ground.warden.invite, at, draw(), draw())
    emit(
        {
            "quo": 1,
            "role": "door",
            "warden": invitation.warden.hex(),
            "commitment": invitation.commitment.hex(),
            "padlock": invitation.padlock.hex(),
            "heir": invitation.heir.hex(),
            "heirSecret": invitation.heir_secret.hex(),
            "hints": list(invitation.hints),
        }
    )


def serve(argv: list) -> int:
    parser = argparse.ArgumentParser(prog="subject serve", add_help=False)
    parser.add_argument("-listen", default="127.0.0.1:0")
    parser.add_argument("-limit", type=int, default=LIMIT)
    parser.add_argument("-line", dest="framed", action="store_true")
    parser.add_argument("-push", dest="pushing", action="store_true")
    parser.add_argument("-being", default="")
    parser.add_argument("-method", default="")
    parser.add_argument("-args", dest="blob", default="")
    flags = parser.parse_args(argv)
    host, _, port = flags.listen.rpartition(":")

    ground = Ground(flags.limit)
    at = ground.run(ground.warden.hold(Counter(), COUNTER, draw(), draw()))._quo.being

    if flags.framed:
        # A ground that pushes keeps every line it accepts, because the
        # standing it will spend down one arrives later and by another road
        # entirely. One that does not simply judges what lands.
        pushing = Pushing(ground) if flags.pushing else None
        # The listening half is the one that knows where it ended up, so it is
        # the one with a road to grant. Nothing above this changes: the same
        # warden judges the same messages, and the road hands every frame to
        # its one entry point whether this ground pushes or not.
        ears = line.Listener(
            ground.frame,
            host=host or "127.0.0.1",
            port=int(port),
            cap=flags.limit,
        ).start()
        stranger(ground, at, ears.hint)
        if pushing is not None:
            threading.Thread(target=pushing.told, args=(flags,), daemon=True).start()
        # The listener runs itself, so there is no serve loop to hold this
        # process up; the driver kills it when it has seen enough.
        while True:
            time.sleep(3600)

    if flags.pushing:
        raise SystemExit("a push can only ride a line")

    door = carriage.Door(
        ground.arrive, host=host or "127.0.0.1", port=int(port), limit=flags.limit
    ).start()
    stranger(ground, at, door.hint)
    while True:
        time.sleep(3600)


class Pushing:
    """The other half of ``-hold``, and the half only a listening ground can
    play: an ask down a connection this ground never opened.

    The standing it spends never travels on the wire — it is the dialling
    ground's own to hand over however it likes — so it arrives one JSON object
    per line on stdin, and each is spent on a line this door accepted.

    **Nothing here reads a frame.** Which line a push rides is delivery's, and
    it finds it by the padlock the warden handed down after judging what
    arrived on it. A row with no hints has no road to post to, and the line
    that voice's last ask came in on is the whole of its way back.
    """

    def __init__(self, ground: Ground) -> None:
        self.ground = ground

    def told(self, flags: Any) -> None:
        for said in sys.stdin:
            if not said.strip():
                continue
            self.push(json.loads(said), flags)

    def push(self, said: dict, flags: Any) -> None:
        # A standing granted back down a line carries no road at all, because
        # the ground that granted it has none: it is reachable only down the
        # line it opened.
        invitation = wire.Invitation(
            warden=bytes.fromhex(said["warden"]),
            commitment=bytes.fromhex(said["commitment"]),
            padlock=bytes.fromhex(said["padlock"]),
            heir=bytes.fromhex(said["heir"]),
            heir_secret=bytes.fromhex(said["heirSecret"]),
            hints=(),
        )
        row = self.ground.call(self.ground.warden.stand, invitation)
        # Wait until a line has been spoken on, because until a peer has said
        # something there is no way back to it at all.
        self.ground.accepted.get()

        step = exchange(self.ground, row, "describe", next_heir=draw())
        if step is None:
            return
        classes = classes_of(step["data"])
        emit({**step, "data": None, "classes": classes})
        emit({"quo": 1, "step": "pushed", "far": row.warden.hex()})
        if not flags.method:
            return
        answered = exchange(
            self.ground,
            row,
            "ask",
            being=being_named(flags.being, classes, row),
            method={"name": flags.method, "args": bytes.fromhex(flags.blob)},
        )
        if answered is not None:
            emit({**answered, "data": (answered["data"] or b"").hex()})


# ------------------------------------------------------------------- speak


def exchange(
    ground: Ground,
    row: warden.Relation,
    name: str,
    **over: Any,
) -> Optional[dict]:
    """One utterance, handed to delivery, and what came back opened.

    ``None`` is silence, which is a door speaking and not an error. **Nothing
    at this call site names a road**: which one carried it, and whether the
    answer came back in the same breath or as a frame of its own later, is
    delivery's affair and the warden's.
    """
    seq = row.seq + 1
    answer = ground.run(ground.warden.spend(row, seq=seq, **over))
    if answer is None:
        emit({"quo": 1, "step": name, "seq": seq, "silence": True})
        return None
    if bytes(answer["warden"]) != bytes(row.warden):
        raise SystemExit(f"an answer signed by a warden this ground did not ask")
    if answer["seq"] != seq:
        raise SystemExit(f"the answer names ask {answer['seq']}, not {seq}")
    return {
        "quo": 1,
        "step": name,
        "seq": seq,
        "warden": answer["warden"].hex(),
        "data": answer["data"],
    }


def classes_of(data: bytes) -> list:
    """One describe, flattened for the far side: a digest and the pks under it,
    in the order the warden derived."""
    estate = wire.decode(warden.ESTATE_TYPE, data, warden.WARDEN_RECORDS)
    return [
        {
            "digest": bytes(one["digest"]).hex(),
            "beings": [bytes(held["being"]).hex() for held in one["beings"]],
        }
        for one in estate["classes"]
    ]


def granted(classes: list) -> bytes:
    """The one being an estate holds that is not the door's own public being.

    It refuses anything else rather than choosing: which of two granted beings
    was meant is the caller's to say.
    """
    own = warden.WARDEN_DIGEST.hex()
    found = [pk for one in classes if one["digest"] != own for pk in one["beings"]]
    if len(found) != 1:
        raise SystemExit(f"the estate holds {len(found)} beings besides the door's own")
    return bytes.fromhex(found[0])


def being_named(which: str, classes: list, row: warden.Relation) -> Optional[bytes]:
    """Which being an ask names, from the one word a driver gave.

    ``auto`` is found rather than told: the invitation does not name the being,
    so a holder finds it by describing. The one class every estate carries is
    the Warden's own, whose digest is the same on every ground in the world;
    what is left is what this voice was granted.
    """
    if which == "":
        return None
    if which == "door":
        return row.warden
    if which == "auto":
        return granted(classes)
    return bytes.fromhex(which)


def held(ground: Ground, far: bytes, road) -> int:
    """The other half of a line, and the half a door cannot have: this ground
    holds a being of its own and grants the ground it dialled a standing at it.

    The invitation carries no road, because this ground has none — it is
    reachable only down the line it opened. Then it stays for as long as the
    far ground keeps the line, and says what its own object was left holding
    once the line is let go.
    """
    own = Counter()
    at = ground.run(ground.warden.hold(own, COUNTER, draw(), draw()))._quo.being
    invitation = ground.call(ground.warden.invite, at, draw(), draw(), hints=())
    emit(
        {
            "quo": 1,
            "step": "standing",
            "far": far.hex(),
            "warden": invitation.warden.hex(),
            "commitment": invitation.commitment.hex(),
            "padlock": invitation.padlock.hex(),
            "heir": invitation.heir.hex(),
            "heirSecret": invitation.heir_secret.hex(),
        }
    )
    # The far end closes the line when it has finished asking, and a line is
    # dumb — it has no event to wait on, only the fact of whether it is still
    # carrying. Leaving before it is let go would be leaving mid-answer.
    since = time.monotonic()
    while road.open:
        if time.monotonic() - since > 10:
            raise SystemExit("the line this ground opened was never let go")
        time.sleep(0.01)
    emit({"quo": 1, "step": "held", "being": at.hex(), "total": own.total})
    return 0


def at_distance_zero() -> tuple:
    """Raise the far house in this very process, and hold the door to it.

    Two grounds, two voices, two sets of keys, one process. Nothing here is a
    shortcut: the ground raised is exactly the ground ``serve`` raises, holding
    the same being behind the same warden, and the only thing missing is the
    socket. The invitation carries no hint because there is no road to name —
    at distance zero the door itself is the address.

    The facts line is printed all the same, so a driver watching this process
    sees the same door it would have seen across a wire, and can tell that the
    two houses really are two.
    """
    far = Ground(LIMIT)
    at = far.run(far.warden.hold(Counter(), COUNTER, draw(), draw()))._quo.being
    door = call.Door(far.arrive, limit=far.warden.limit).start()
    invitation = far.call(far.warden.invite, at, draw(), draw(), hints=())
    emit(
        {
            "quo": 1,
            "role": "door",
            "warden": invitation.warden.hex(),
            "commitment": invitation.commitment.hex(),
            "padlock": invitation.padlock.hex(),
            "heir": invitation.heir.hex(),
            "heirSecret": invitation.heir_secret.hex(),
            "hints": [],
            "distance": 0,
        }
    )
    return far, door, invitation


def line_in(hints: list) -> str:
    """The first road that is a line. A hint is opaque to the protocol and this
    is the one place this command looks inside one."""
    for hint in hints:
        if hint.startswith("tcp://"):
            return hint
    raise SystemExit("those facts carry no tcp:// road")


def speak(argv: list) -> int:
    parser = argparse.ArgumentParser(prog="subject speak", add_help=False)
    parser.add_argument("-being", default="")
    parser.add_argument("-method", default="")
    parser.add_argument("-args", dest="blob", default="")
    parser.add_argument("-blueprint", dest="texts", action="store_true")
    parser.add_argument("-line", dest="framed", action="store_true")
    parser.add_argument("-zero", dest="zero", action="store_true")
    parser.add_argument("-hold", dest="holding", action="store_true")
    parser.add_argument("facts", nargs="?", default="")
    flags = parser.parse_args(argv)

    door = None
    if flags.zero:
        if flags.framed:
            raise SystemExit("distance zero has no line under it")
        if flags.facts:
            raise SystemExit("a door at distance zero is raised here, not addressed")
        _far, door, invitation = at_distance_zero()
    else:
        if not flags.facts:
            raise SystemExit("usage: subject speak [flags] <facts>")
        facts = json.loads(flags.facts)
        if not facts.get("hints"):
            raise SystemExit("those facts carry no road")
        invitation = wire.Invitation(
            warden=bytes.fromhex(facts["warden"]),
            commitment=bytes.fromhex(facts["commitment"]),
            padlock=bytes.fromhex(facts["padlock"]),
            heir=bytes.fromhex(facts["heir"]),
            heir_secret=bytes.fromhex(facts["heirSecret"]),
            hints=tuple(facts["hints"]),
        )

    # A caller is always a being, and always one its own warden holds — so this
    # mode is a whole ground too, not a bare key.
    ground = Ground()
    ground.zero = door
    row = ground.call(ground.warden.stand, invitation)

    # Which road this ground speaks over is the whole of what -line and -zero
    # change, and it is delivery's alone. Everything below is the same warden
    # saying the same things, with nothing at a call site naming a road.
    dialled = None
    if flags.framed:
        dialled = ground.dial(line_in(list(invitation.hints)))

    # Whoever minted a voice has seen its keys, so the holder's first act is a
    # rotate-and-ask to a key nobody else has ever seen. It asks nothing, and
    # what comes back is what this voice now stands at.
    step = exchange(ground, row, "describe", next_heir=draw())
    if step is None:
        return 0  # the door answered silence, and it has already been reported
    classes = classes_of(step["data"])
    emit({**step, "data": None, "classes": classes})

    if flags.texts:
        for one in classes:
            digest = bytes.fromhex(one["digest"])
            blob = wire.encode(B32, digest, warden.WARDEN_RECORDS)
            # blueprint is a field on the far door's public being, whose pk is
            # that warden's own name — reached by naming it, like every other
            # field on every other being.
            fetched = exchange(
                ground,
                row,
                "blueprint",
                being=row.warden,
                method={"name": "blueprint", "args": blob},
            )
            if fetched is None:
                continue
            text = wire.decode(TEXT, fetched["data"], warden.WARDEN_RECORDS)
            emit({**fetched, "data": None, "digest": one["digest"], "text": text})

    if flags.method:
        answered = exchange(
            ground,
            row,
            "ask",
            being=being_named(flags.being, classes, row),
            method={"name": flags.method, "args": bytes.fromhex(flags.blob)},
        )
        if answered is not None:
            emit({**answered, "data": (answered["data"] or b"").hex()})

    if not flags.holding:
        return 0
    if dialled is None:
        raise SystemExit("a standing granted back can only ride a line")
    return held(ground, row.warden, dialled)


def main(argv: list) -> int:
    if not argv:
        raise SystemExit("usage: subject serve|speak")
    if argv[0] == "serve":
        return serve(argv[1:])
    if argv[0] == "speak":
        return speak(argv[1:])
    raise SystemExit(f"no mode named {argv[0]!r}")


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except SystemExit:
        raise
    except Exception as bad:  # a subject reports its own faults and leaves
        note(bad)
        sys.exit(1)
