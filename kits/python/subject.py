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
"""

from __future__ import annotations

import argparse
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
    call,
    carriage,
    envelope,
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
    and sees no key."""

    def __init__(self) -> None:
        self.total = 0

    def invoke(self, name: str, args: bytes, leash: warden.Leash) -> bytes:
        if name == "bump":
            # Bytes left after the declared arguments are the being's to
            # refuse, never the warden's.
            if len(args) != 8:
                raise ValueError("bump takes one int")
            self.total += int.from_bytes(args, "big", signed=True)
        elif name == "count":
            if args:
                raise ValueError("count takes nothing")
        else:
            raise ValueError("the blueprint declares no such field")
        return self.total.to_bytes(8, "big", signed=True)


class Ground:
    """This command's warden with the one lock that keeps it to itself.

    A warden is not concurrent, and both roads reach it from several threads at
    once: an HTTP door serves each request on its own, and a line judges
    arriving frames on its reader while the main thread composes asks.
    """

    def __init__(self, limit: int = LIMIT) -> None:
        self.warden = warden.Warden(
            name_secret=draw(),
            padlock_secret=draw(),
            limit=limit,
            heir=arithmetic.signing_public(draw()),
        )
        self.lock = threading.Lock()

    def judge(self, message: bytes) -> Optional[bytes]:
        """The whole of what a door does with an arriving message."""
        with self.lock:
            try:
                return self.warden.judge(message).answer
            except Exception as bad:
                # Silence is the whole of every refusal, and the reason never
                # travels. It goes to this host's own stderr and nowhere else.
                note("refused:", bad)
                return None

    def ask(self, row: warden.Relation, **over: Any) -> tuple[bytes, int]:
        with self.lock:
            return self.warden.ask(row, draw(), allowance=ALLOWANCE, **over)

    def hear(self, message: bytes) -> dict:
        with self.lock:
            return self.warden.hear(message)


# ------------------------------------------------------------------- serve


def stranger(ground: Ground, being: bytes, hint: str) -> None:
    """Mint the invitation and print the facts line: everything a stranger
    needs to speak to this ground, over whichever road it was given."""
    ground.warden.hints = (hint,)
    invitation = ground.warden.invite(being, draw(), draw())
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
    being = ground.warden.hold(COUNTER, Counter().invoke, draw(), draw())

    if flags.framed:
        # A ground that pushes keeps every line it accepts, because the
        # standing it will spend down one arrives later and by another road
        # entirely. One that does not simply judges what lands.
        pushing = Pushing(ground) if flags.pushing else None
        # The listening half is the one that knows where it ended up, so it is
        # the one with a road to grant. Nothing above this changes: the same
        # warden judges the same messages.
        ears = line.Listener(
            pushing.arrive
            if pushing
            else (lambda _road, message: ground.judge(message)),
            host=host or "127.0.0.1",
            port=int(port),
            cap=flags.limit,
        ).start()
        stranger(ground, being, ears.hint)
        if pushing is not None:
            threading.Thread(target=pushing.told, args=(flags,), daemon=True).start()
        # The listener runs itself, so there is no serve loop to hold this
        # process up; the driver kills it when it has seen enough.
        while True:
            time.sleep(3600)

    if flags.pushing:
        raise SystemExit("a push can only ride a line")

    door = carriage.Door(
        ground.judge, host=host or "127.0.0.1", port=int(port), limit=flags.limit
    ).start()
    stranger(ground, being, door.hint)
    while True:
        time.sleep(3600)


class Pushing:
    """The other half of ``-hold``, and the half only a listening ground can
    play: an ask down a connection this ground never opened.

    The standing it spends never travels on the wire — it is the dialling
    ground's own to hand over however it likes — so it arrives one JSON object
    per line on stdin, and each is spent on a line this door accepted.

    Every frame that lands on an accepted line is either an answer to something
    this ground pushed or a say for it to judge, and the seal says which: an
    answer opens under the byte a caller expects and a say does not. Nothing
    about the frame carries the difference, which is the point.
    """

    def __init__(self, ground: Ground) -> None:
        self.ground = ground
        self.accepted: queue.Queue = queue.Queue()
        self.known: set = set()
        self.waiting: dict = {}
        self.lock = threading.Lock()

    def arrive(self, road: line.Line, message: bytes) -> Optional[bytes]:
        with self.lock:
            if id(road) not in self.known:
                self.known.add(id(road))
                self.accepted.put(road)
        try:
            answer = self.ground.hear(message)
        except warden.Silence:
            return self.ground.judge(message)
        with self.lock:
            box = self.waiting.pop((bytes(answer["warden"]), answer["seq"]), None)
        if box is not None:
            box.put(answer)
        return None

    def carry(self, road: line.Line, message: bytes, far: bytes, seq: int):
        box: queue.Queue = queue.Queue(maxsize=1)
        with self.lock:
            self.waiting[(bytes(far), seq)] = box
        road.send(message)
        try:
            return box.get(timeout=10)
        except queue.Empty:
            return None

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
        with self.ground.lock:
            row = self.ground.warden.stand(invitation)
        road = Down(self, self.accepted.get())

        step = exchange(
            self.ground,
            road,
            row,
            "describe",
            next_heir=draw(),
        )
        if step is None:
            return
        classes = classes_of(step["data"])
        emit({**step, "data": None, "classes": classes})
        emit({"quo": 1, "step": "pushed", "far": row.warden.hex()})
        if not flags.method:
            return
        answered = exchange(
            self.ground,
            road,
            row,
            "ask",
            being=being_named(flags.being, classes, row),
            method={"name": flags.method, "args": bytes.fromhex(flags.blob)},
        )
        if answered is not None:
            emit({**answered, "data": (answered["data"] or b"").hex()})


class Down:
    """One accepted line, as a road: what ``exchange`` puts an ask down."""

    def __init__(self, pushing: Pushing, road: line.Line) -> None:
        self.pushing = pushing
        self.road = road

    def carry(self, message: bytes, far: bytes, seq: int) -> Optional[dict]:
        return self.pushing.carry(self.road, message, far, seq)


# ------------------------------------------------------------------- speak


class Held:
    """A dialled line, read by one thread that sorts what arrives.

    A frame is either an answer to something this ground asked or a say for it
    to judge, and the seal says which: an answer opens under the byte a caller
    expects and a say does not. Nothing about the frame carries the difference,
    which is the point.
    """

    def __init__(self, road: line.Line, ground: Ground) -> None:
        self.road = road
        self.ground = ground
        self.waiting: dict = {}
        self.lock = threading.Lock()
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self) -> None:
        while True:
            try:
                message = self.road.receive()
            except line.LineError:
                return
            if message is None:
                return
            try:
                answer = self.ground.hear(message)
            except warden.Silence:
                reply = self.ground.judge(message)
                if reply is not None:
                    try:
                        self.road.send(reply)
                    except line.LineError:
                        return
                continue
            key = (bytes(answer["warden"]), answer["seq"])
            with self.lock:
                box = self.waiting.pop(key, None)
            if box is not None:
                box.put(answer)

    def carry(self, message: bytes, far: bytes, seq: int) -> Optional[dict]:
        """Put one ask down the line and wait for its answer.

        Silence has no wire form here, so nothing comes back at all and the
        deadline is this caller's own affair.
        """
        box: queue.Queue = queue.Queue(maxsize=1)
        with self.lock:
            self.waiting[(bytes(far), seq)] = box
        self.road.send(message)
        try:
            return box.get(timeout=10)
        except queue.Empty:
            return None


def exchange(
    ground: Ground,
    road: Optional[Any],
    row: warden.Relation,
    name: str,
    hand: Optional[Callable[[bytes], bytes]] = None,
    **over: Any,
) -> Optional[dict]:
    """One utterance, put down whichever road the far door offered, and what
    came back opened. ``None`` is silence, which is a door speaking and not an
    error.

    ``hand`` is a road that answers in the same breath — the common carriage,
    or distance zero. A line answers on its own thread instead, so ``road``
    and ``hand`` are the two shapes a road can have and never both at once.
    """
    message, seq = ground.ask(row, **over)
    if road is not None:
        answer = road.carry(message, row.warden, seq)
    else:
        if hand is None:
            raise SystemExit("no road to put this ask down")
        reply = hand(message)
        answer = ground.hear(reply) if reply else None
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


def held(ground: Ground, far: bytes, road: Held) -> int:
    """The other half of a line, and the half a door cannot have: this ground
    holds a being of its own and grants the ground it dialled a standing at it.

    The invitation carries no road, because this ground has none — it is
    reachable only down the line it opened. Then it stays for as long as the
    far ground keeps the line, and says what its own object was left holding
    once the line is let go.
    """
    own = Counter()
    with ground.lock:
        being = ground.warden.hold(COUNTER, own.invoke, draw(), draw())
        invitation = ground.warden.invite(being, draw(), draw(), hints=())
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
    at = time.monotonic()
    while road.road.open:
        if time.monotonic() - at > 10:
            raise SystemExit("the line this ground opened was never let go")
        time.sleep(0.01)
    with ground.lock:
        total = own.total
    emit({"quo": 1, "step": "held", "being": being.hex(), "total": total})
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
    being = far.warden.hold(COUNTER, Counter().invoke, draw(), draw())
    door = call.Door(far.judge, limit=far.warden.limit).start()
    invitation = far.warden.invite(being, draw(), draw(), hints=())
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

    road: Optional[Held] = None
    hand: Optional[Callable[[bytes], bytes]] = None

    if flags.zero:
        if flags.framed:
            raise SystemExit("distance zero has no line under it")
        if flags.facts:
            raise SystemExit("a door at distance zero is raised here, not addressed")
        far, door, invitation = at_distance_zero()
        hand = lambda message: call.post(door, message)  # noqa: E731
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
    row = ground.warden.stand(invitation)

    # Which road this ground speaks over is the whole of what -line and -zero
    # change. Everything below is the same warden saying the same things.
    if flags.framed:
        dialled = line.dial(line_in(list(invitation.hints)))
        # This end reads against its own appetite, which is not the default.
        dialled.cap = ground.warden.limit
        road = Held(dialled, ground)
    elif hand is None:
        hand = lambda message: carriage.post(row.hints[0], message)  # noqa: E731

    # Whoever minted a voice has seen its keys, so the holder's first act is a
    # rotate-and-ask to a key nobody else has ever seen. It asks nothing, and
    # what comes back is what this voice now stands at.
    step = exchange(
        ground,
        road,
        row,
        "describe",
        hand=hand,
        next_heir=draw(),
    )
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
                road,
                row,
                "blueprint",
                hand=hand,
                being=row.warden,
                method={"name": "blueprint", "args": blob},
            )
            if fetched is None:
                continue
            text = wire.decode(TEXT, fetched["data"], warden.WARDEN_RECORDS)
            emit({**fetched, "data": None, "digest": one["digest"], "text": text})

    if flags.method:
        being = being_named(flags.being, classes, row)
        answered = exchange(
            ground,
            road,
            row,
            "ask",
            hand=hand,
            being=being,
            method={"name": flags.method, "args": bytes.fromhex(flags.blob)},
        )
        if answered is not None:
            emit({**answered, "data": (answered["data"] or b"").hex()})

    if not flags.holding:
        return 0
    if road is None:
        raise SystemExit("a standing granted back can only ride a line")
    return held(ground, row.warden, road)


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
