"""The Python kit answering the conformance subject contract.

Kit-specific glue: seven verbs over JSON lines, a warden stood up from handed
keys, a door handed bytes, and the records read back as Article IX's ``cargo``.
It is written from ``papers/quo-conformance-contract.md`` and from this kit's own
public API, and it decides nothing: it stands a warden, hands it what it is
given, and reports what came back.

This file is an entry point, not part of the kit. It sits outside the package
so that importing ``quo`` still pulls in no host.

Three things this kit spells differently from the two the contract was written
beside, none of which is a decision this file is allowed to make:

- **It composes no cargo.** There is no ``pack``, so ``state`` reads the two
  records directly. The JS subject already does exactly this; only the Go one
  goes through a packer, so the contract has never required one.
- **Its judgment raises rather than returns.** ``Silence`` is this kit's way of
  saying "no answer", so it is caught here and reported as ``null``. **Nothing
  else is caught at the door**, because a subject that swallowed every
  exception would turn a crash into a silence, and telling those two apart is
  the whole of I-2 and of the runner's own liveness check.
- **It arms nothing before a receive.** Its randomness is a ``mint`` callable
  handed to the constructor, so ``expecting``'s keys are served by seeding that
  rather than by an arming call.
"""

from __future__ import annotations

import json
import sys
from typing import Any, Callable, Optional

sys.path.insert(0, "src")

from quo import arithmetic, notation, warden as kit  # noqa: E402


def un(text: str) -> bytes:
    """Hex in, bytes out."""
    return bytes.fromhex(text)


def uno(text: Optional[str]) -> Optional[bytes]:
    """The same, where absent stays absent."""
    return None if text is None else bytes.fromhex(text)


def hx(raw: bytes) -> str:
    return bytes(raw).hex()


def hxo(raw: Optional[bytes]) -> Optional[str]:
    return None if raw is None else bytes(raw).hex()


class Queue:
    """A finite list drawn in order.

    Drawing past the end is a fault the scenario must hear about rather than a
    silent refill, because a kit that drew more than it was given has told us
    something.
    """

    def __init__(self, name: str, values: list) -> None:
        self.name = name
        self.values = list(values)
        self.at = 0

    def draw(self):
        if self.at >= len(self.values):
            raise RuntimeError(
                f"the {self.name} queue ran out after {len(self.values)}"
            )
        one = self.values[self.at]
        self.at += 1
        return one


class House:
    """Everything one stood-up door holds, so a fresh `stand` starts clean."""

    def __init__(self) -> None:
        self.warden: Optional[kit.Warden] = None
        self.clock: Optional[Queue] = None
        self.random: Optional[Queue] = None
        # The keys this door will mint for a being it is about to take in.
        # This kit draws them from `mint` like any other randomness, so they are
        # handed out ahead of the queue rather than through an arming call.
        self.expecting: list = []
        # Every ask this warden composed while judging the message in hand.
        self.onward: list = []


house = House()


def door_of() -> kit.Warden:
    """The warden this run stood up.

    Every verb but `stand` is asked after one, so a missing warden is a fault
    in the run rather than a state to branch on.
    """
    if house.warden is None:
        raise RuntimeError("no warden has been stood up")
    return house.warden


def queue_of(which: str) -> Queue:
    got = house.clock if which == "clock" else house.random
    if got is None:
        raise RuntimeError(f"no {which} queue has been handed in")
    return got


def mint() -> bytes:
    """The one source this kit draws every key from.

    **This is the place the contract and this kit disagree about shape.** The
    contract hands `expecting`'s two keys in separately from the `random`
    queue, because the kits it was written beside take them by an arming call.
    Here both come off one callable, so the arriving being's keys are handed
    out first and the queue serves everything after.

    The consequence is a constraint rather than a decision: it holds only while
    nothing seals an answer before the cargo arrives, because an answer's
    ephemeral is drawn from the same callable. Where that does not hold, the
    scenario diverges and the divergence is the finding.
    """
    if house.expecting:
        return house.expecting.pop(0)
    return queue_of("random").draw()


def being_of(one: dict) -> Callable[[str, bytes, kit.Leash], Optional[bytes]]:
    """The one thing a being in this contract ever does.

    A warden never makes an onward ask of its own: it hands the leash to the
    being it routed to and the being decides. So a being that calls out is the
    only way Article VIII's onward rules can be reached at all.

    **It decides nothing.** The scenario named the far warden, the being, the
    method and the ephemeral key, and what this returns is never asserted.

    **The leash spent is the one this kit handed the being**, passed straight
    back to `ask`, which reads the allowance off it at the moment of sealing.
    Recomputing it here would be the subject doing the arithmetic the case is
    about, and the case would then measure this file rather than the warden.
    """
    spec = one.get("onward")

    def invoke(name: str, args: bytes, leash: kit.Leash) -> Optional[bytes]:
        if not spec or spec["when"] != name:
            return b""
        row = door_of().relation(un(spec["at"]))
        if row is None:
            raise RuntimeError(f"no relation at {spec['at']}")
        method = spec.get("method")
        try:
            composed, _ = door_of().ask(
                row,
                un(spec["ephemeral"]),
                being=uno(spec.get("being")),
                method=(
                    {"name": method["name"], "args": un(method.get("args") or "")}
                    if method
                    else None
                ),
                seq=int(spec["seq"]),
                leash=leash,
            )
        except kit.Silence:
            # A leash with nothing left to spend composes nothing, and the being
            # answers anyway: Article VIII withholds the onward ask while "the
            # work already routed stands".
            return b""
        house.onward.append(composed)
        return b""

    return invoke


def cargo_of(being_pk: bytes) -> Optional[dict]:
    """Article IX's own shape, read off the records.

    Not a format this harness invented: `cargo` is what a warden's state looks
    like when it crosses, which is the level a check has to work at.
    """
    w = door_of()
    being = w.beings.get(being_pk)
    if being is None:
        return None
    standings = []
    for row in w.inbound:
        if being_pk not in [bytes(one) for one in row.beings]:
            continue
        standings.append(
            {
                "voice": hx(row.voice),
                "commitment": hx(row.commitment),
                # The name the commitment was minted under (Article XIV). This
                # kit calls it `minted_at`.
                "name": hx(row.minted_at),
                "beings": sorted(hx(one) for one in row.beings),
                "mark": str(row.mark or 0),
                "spent": [str(one) for one in sorted(row.spent)],
                "padlock": hxo(row.padlock),
                "hints": list(row.hints or ()),
            }
        )
    standings.sort(key=lambda one: str(one["voice"]))
    relations = []
    for row in w.outbound:
        relations.append(
            {
                "warden": hx(row.warden),
                "commitment": hx(row.commitment),
                "padlock": hx(row.padlock),
                "voice": hx(row.voice),
                "heir": hx(row.heir),
                "seq": str(row.seq or 0),
                # Two counters, never one field doing both (Article IX).
                "news": str(row.news or 0),
                "hints": list(row.hints or ()),
            }
        )
    relations.sort(key=lambda one: str(one["warden"]))
    return {
        "being": hx(being.pk),
        "digest": hx(being.digest),
        "cells": hx(being.cells or b""),
        "standings": standings,
        "relations": relations,
    }


def stand(order: dict) -> dict:
    house.__init__()
    spec = order["warden"]
    heir_secret = uno(spec.get("heirSeed"))
    house.warden = kit.Warden(
        name_secret=un(spec["nameSeed"]),
        padlock_secret=un(spec["padlockSeed"]),
        limit=int(spec.get("limit") or 0) or 1 << 62,
        mint=mint,
        heir=arithmetic.signing_public(heir_secret) if heir_secret else None,
    )
    w = door_of()
    w.hints = tuple(spec.get("hints") or ())
    house.clock = Queue("clock", [int(one) for one in order.get("clock") or []])
    house.random = Queue("random", [un(one) for one in order.get("random") or []])

    beings = []
    for one in order.get("beings") or []:
        pk = w.hold(
            one["blueprint"], being_of(one), un(one["seed"]), un(one["heirSeed"])
        )
        w.beings[pk].cells = un(one.get("cells") or "")
        beings.append(hx(pk))

    grants = []
    for one in order.get("grants") or []:
        heir = arithmetic.signing_public(un(one["heirSeed"]))
        # The kit's own arithmetic, called rather than reproduced. `invite`
        # would mint this too, but it also stamps the door's own padlock on the
        # row — and Article VII has the row keep "the padlock it named", the
        # voice's, which at grant time is nothing.
        commitment = arithmetic.commitment(w.name, heir)
        w.grant(
            arithmetic.signing_public(un(one["voiceSeed"])),
            commitment,
            [un(one["being"])],
            padlock=uno(one.get("padlock")),
            hints=one.get("hints") or (),
        )
        grants.append(
            {
                "warden": hx(w.name),
                "commitment": hx(commitment),
                "padlock": hx(w.padlock),
                "heir": hx(heir),
            }
        )

    for one in order.get("relations") or []:
        w.outbound.append(
            kit.Relation(
                warden=un(one["warden"]),
                commitment=un(one["commitment"]),
                padlock=un(one["padlock"]),
                voice=arithmetic.signing_public(un(one["voiceSeed"])),
                secret=un(one["voiceSeed"]),
                heir=arithmetic.signing_public(un(one["heirSeed"])),
                heir_secret=un(one["heirSeed"]),
                hints=tuple(one.get("hints") or ()),
            )
        )

    arriving = order.get("expecting")
    if arriving:
        house.expecting = [un(arriving["seed"]), un(arriving["heirSeed"])]
        text = notation.render(notation.parse(arriving["blueprint"]))
        w.blueprints[notation.digest(text)] = text

    for one in order.get("moved") or []:
        word = one.get("word") or {}
        w.pointers[un(one["being"])] = {
            "being": uno(word.get("being")),
            "successor": uno(word.get("successor")),
            "commitment": uno(word.get("commitment")),
            "name": uno(word.get("name")),
            "padlock": uno(word.get("padlock")),
            "hints": list(word.get("hints") or ()),
        }

    return {
        "warden": {"name": hx(w.name), "padlock": hx(w.padlock)},
        "beings": beings,
        "grants": grants,
    }


def door(order: dict) -> dict:
    """Bytes in, bytes out, or nothing — and nothing is silence.

    `onward` is every ask this warden composed while judging these bytes, in
    the order it composed them, and it is empty for every call that reached no
    being with an `onward` of its own.
    """
    house.onward = []
    try:
        judged = door_of().judge(un(order["bytes"]), clock=queue_of("clock").draw)
    except kit.Silence:
        return {"answer": None, "onward": [hx(one) for one in house.onward]}
    return {"answer": hx(judged.answer), "onward": [hx(one) for one in house.onward]}


def amend(order: dict) -> dict:
    """The house changing its own mind about a standing.

    This kit spells it as one call taking the row's whole membership, where the
    JS one takes an add and a remove list — so the two are computed here and
    the effect is the same. Add first, then remove, and taking the last being
    away is release, which this kit does for itself.
    """
    w = door_of()
    voice = un(order["voice"])
    row = next((one for one in w.inbound if bytes(one.voice) == voice), None)
    if row is None:
        raise kit.Silence("no such standing")
    beings = [bytes(one) for one in row.beings]
    for one in order.get("add") or []:
        if un(one) not in beings:
            beings.append(un(one))
    for one in order.get("remove") or []:
        if un(one) in beings:
            beings.remove(un(one))
    w.amend(voice, beings)
    return {}


def succeed(order: dict) -> dict:
    """The house moving its own name.

    This kit is one of the two that never sees the next heir's key, so it takes
    the commitment and leaves the seed beside it alone.
    """
    door_of().succeed(un(order["nameSeed"]), un(order["heirCommitment"]))
    return {}


def told(word, secret: bytes, peers: list, spec: list) -> list:
    """One piece of news per peer, each sealed with the key it was handed.

    A peer that left no way back composes nothing, which the kit decides and
    this only passes on.

    **The word is the kit's.** `depart` and `landed` compose it; this file says
    only which being left and where it went. Every field of it is reachable
    from here, so a subject that built it and asked the kit only to seal would
    go green while asserting nothing about the warden.
    """
    out = []
    for at, peer in enumerate(peers):
        if at >= len(spec):
            break
        one = spec[at]
        try:
            sealed = door_of().news(
                peer=peer,
                voice_secret=secret,
                word=word,
                seq=int(one["seq"]),
                ephemeral_secret=un(one["ephemeral"]),
                allowance={
                    "time": int(one["allowance"]["time"]),
                    "hops": int(one["allowance"]["hops"]),
                },
            )
        except kit.Silence:
            continue
        out.append(hx(sealed))
    return out


def depart(order: dict) -> dict:
    gone = order["gone"]
    word, secret, peers = door_of().depart(
        un(order["being"]),
        commitment=un(order["commitment"]),
        name=un(gone["name"]),
        padlock=un(gone["padlock"]),
        hints=gone.get("hints") or [],
    )
    return {"news": told(word, secret, peers, order.get("news") or [])}


def landed(order: dict) -> dict:
    word, secret, peers = door_of().landed(order.get("hints") or [])
    return {"news": told(word, secret, peers, order.get("news") or [])}


def state(order: dict) -> dict:
    """The records, as cargo, and the facts this kit cannot report at all.

    `relations` is every outbound row this door holds rather than the ones that
    would travel with this being: **this kit's `Relation` carries no holder**,
    so which being may spend which relation is a fact it has no way to give.
    Every scenario driven so far holds at most one outbound row, where the two
    lists are the same list; a door holding more would have to declare it in
    `cannot` rather than report a wrong one.
    """
    return {"cargo": cargo_of(un(order["being"])), "cannot": []}


def send(order: dict) -> dict:
    w = door_of()
    ask = order["ask"]
    row = w.relation(un(ask["at"]))
    if row is None:
        return {"error": f"no relation at {ask['at']}"}
    method = ask.get("method")
    try:
        composed, _ = w.ask(
            row,
            queue_of("random").draw(),
            being=uno(ask.get("being")),
            method=(
                {"name": method["name"], "args": un(method.get("args") or "")}
                if method
                else None
            ),
            allowance={
                "time": int(ask["allowance"]["time"]),
                "hops": int(ask["allowance"]["hops"]),
            },
            seq=int(ask["seq"]),
        )
    except kit.Silence:
        # A refusal to send is an ordinary expected outcome, not an error.
        return {"bytes": None}
    return {"bytes": hx(composed)}


def read(order: dict) -> dict:
    try:
        answer = door_of().hear(un(order["answer"]))
    except kit.Silence:
        return {"answer": None}
    data = answer.get("data")
    return {
        "answer": {
            "warden": hx(answer["warden"]),
            "seq": str(answer["seq"]),
            "data": hxo(data),
        }
    }


VERBS: dict[str, Callable[[dict], dict]] = {
    "stand": stand,
    "door": door,
    "amend": amend,
    "succeed": succeed,
    "state": state,
    "send": send,
    "read": read,
    "depart": depart,
    "landed": landed,
}


def obey(order: dict) -> Any:
    verb = VERBS.get(order.get("do", ""))
    if verb is None:
        return {"error": f"no such verb: {order.get('do')}"}
    try:
        return verb(order)
    except Exception as thrown:  # noqa: BLE001 - reported, never swallowed
        return {"error": str(thrown) or thrown.__class__.__name__}


def main() -> None:
    for line in sys.stdin:
        if not line.strip():
            continue
        sys.stdout.write(json.dumps(obey(json.loads(line))) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
