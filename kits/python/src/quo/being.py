"""The being's whole API to Quo: the closure a warden hands each object it
holds, and the handle a being calls a far being through.

Nothing here sees a key or a road. A handle is a Quo handle and looks like one
— every declared field an awaitable answering a value or ``None`` for silence —
so a being always knows which of its references are Quo and which are ordinary
pointers.

This module is core. It imports no road and no host: what it reaches is the
warden it was handed, and the warden reaches everything else.
"""

from __future__ import annotations

import inspect
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Iterator, Mapping, Optional, Sequence

from . import notation, wire

__all__ = [
    "Caller",
    "Call",
    "within",
    "current",
    "Silence",
    "Own",
    "Handle",
    "RemoteHandle",
    "LocalHandle",
    "Quo",
    "CARRIED",
    "resolve",
]


class Silence(Exception):
    """Every failure the door has. It never says which step it was.

    It lives here rather than with the warden because a handle under this same
    warden must swallow one: a being's own fault reaches a neighbour as the
    silence it would reach a stranger as, and never as an exception.
    """


class _Carried:
    """The road took the envelope; the answer comes back through the door.

    A sentinel rather than a second meaning for empty bytes: on the common
    carriage an empty body is silence's wire form, so silence and
    carried-onward cannot be the same value.
    """

    def __repr__(self) -> str:  # pragma: no cover - a name for a debugger
        return "CARRIED"


CARRIED = _Carried()


@dataclass(frozen=True)
class Caller:
    """Who is calling, as the judgment found them. A fact, never a judgment.

    ``kind`` is one of ``holder``, ``rotation``, ``stranger`` — or ``local``,
    for a call between two beings under one warden, where there are no voices
    because there are no strangers.
    """

    voice: Optional[bytes]
    kind: str


@dataclass(frozen=True)
class Call:
    """The caller and the leash, for the call in scope."""

    caller: Caller
    leash: Any


#: The call in scope, carried across every await inside it. A being reads it
#: from its closure rather than from an argument it has to thread, and a
#: contextvar is what Python has for exactly that: it is copied into each task
#: and restored on the way out, which is what the JS kit's async context does.
_call: ContextVar[Optional[Call]] = ContextVar("quo.call", default=None)


@contextmanager
def within(call: Optional[Call]) -> Iterator[None]:
    """Run the block with this call in scope. A context manager, because that is
    what Python has where the JS kit passes a function to run inside."""
    token = _call.set(call)
    try:
        yield
    finally:
        _call.reset(token)


def current() -> Optional[Call]:
    return _call.get()


def _allowance_now(warden: Any) -> Optional[dict]:
    """What a walk may be made under from here: the leash in scope, shrunk, or
    the warden's own default when a being starts a walk of its own."""
    call = current()
    if call is None or call.leash is None:
        return dict(warden.allowance)
    return call.leash.onward()


def _fields_of(text: str) -> tuple[dict, dict]:
    parsed = notation.parse(text)
    return (
        {field.name: field for field in parsed.klass.fields},
        wire.records_of(parsed),
    )


class Own:
    """Everything of the kit's own on a handle, reached at ``handle._quo``.

    **The notation's identifier is a letter then letters and digits** (Article
    IV), so no blueprint in any language can declare a name beginning with an
    underscore. That is what makes this a namespace the grammar cannot reach
    into rather than a list of names to guard: a handle's plain namespace is
    the blueprint's alone, and the kit can gain a fact tomorrow without eating
    a field somebody already declared.
    """

    def __init__(self, handle: "Handle") -> None:
        self._handle = handle

    @property
    def being(self) -> bytes:
        """The pk this handle reaches, by the name it wears now."""
        return self._handle._at

    @property
    def text(self) -> str:
        """The class this handle calls through."""
        return self._handle._text

    @property
    def digest(self) -> bytes:
        """That class's identity."""
        return self._handle._digest

    def declares(self) -> tuple[str, ...]:
        """The names this handle's blueprint declares."""
        return tuple(self._handle._fields)

    # -- introspection, which is describe and is one of the five things that cross

    async def describe(self) -> Any:
        """The estate the far door shows this voice."""
        return await self._handle._look("describe")

    async def sketch(self, being: Any = None) -> Any:
        """One being's sketch — this handle's own unless another is named."""
        at = self.being if being is None else _pk_of(being, None)
        return await self._handle._look("sketch", at)

    async def blueprint(self, digest: bytes) -> Any:
        """The text of a class this voice reaches something of."""
        return await self._handle._look("blueprint", bytes(digest))

    async def limit(self) -> Any:
        """The largest whole envelope the far door accepts."""
        return await self._handle._look("limit")

    async def seal(self, name: str, *args: Any) -> Any:
        """The envelope alone, spent against the row but not yet handed to a road.

        A handle under this same warden answers silence: there are no strangers
        there and nothing is sealed, so there is nothing to resend.
        """
        return await self._handle._seal(name, *args)

    async def send(self, sealed: Any) -> Any:
        """Hand a sealed envelope to delivery and answer with what comes back."""
        return await self._handle._send(sealed)


class Handle:
    """A Quo handle. Every declared field is an awaitable; nothing else is there.

    Reaching a name the blueprint does not declare raises ``AttributeError``,
    which is Python's way of saying what the JS kit says with an absent
    property: a field the peer never declared does not exist for the caller.

    **Nothing public lives on this class.** Everything of the kit's own is at
    ``_quo``, so ``__getattr__`` answers for every name a blueprint may
    declare and no field is ever shadowed by something the kit needed.
    """

    def __init__(self, being: bytes, fields: Mapping[str, notation.Field]) -> None:
        self._at = being
        self._fields = dict(fields)
        self._text = ""
        self._digest = b""
        self._quo = Own(self)

    def _field(self, name: str) -> Any:
        async def call(*args: Any) -> Any:
            return await self._spend(name, *args)

        call.__name__ = name
        return call

    def __getattr__(self, name: str) -> Any:
        fields = self.__dict__.get("_fields") or {}
        if name not in fields:
            raise AttributeError(f"a field this blueprint does not declare: {name!r}")
        return self._field(name)

    async def _seal(self, name: str, *args: Any) -> Any:
        return None

    async def _send(self, sealed: Any) -> Any:
        return None

    async def _spend(self, name: str, *args: Any) -> Any:  # pragma: no cover - abstract
        raise NotImplementedError

    async def _look(self, name: str, arg: Any = None) -> Any:  # pragma: no cover
        raise NotImplementedError


class RemoteHandle(Handle):
    """A being under another warden.

    Each call is sealed by the row the handle spends, handed to delivery, and
    settled by whatever arrives back through the warden's one door.
    ``_quo.seal`` and ``_quo.send`` are the two halves apart, so a caller that
    met silence can resend the identical envelope rather than a fresh one.
    """

    def __init__(self, warden: Any, row: Any, being: bytes, text: str) -> None:
        fields, records = _fields_of(text)
        super().__init__(being, fields)
        self._warden = warden
        self._row = row
        self._records = records
        self._text = text
        self._digest = notation.digest(text)
        #: True while this handle is asking the door where the being went, so
        #: that ask's own silence never asks again.
        self._pointing = False

    def _view(self) -> dict:
        """What delivery is given per row: the way back and nothing else."""
        return {"padlock": bytes(self._row.padlock), "hints": tuple(self._row.hints)}

    async def _seal_at(
        self,
        being: Optional[bytes],
        name: str,
        blob: bytes,
        answers: Any,
        records: Mapping[str, Any],
    ) -> Optional[dict]:
        """One ask down this row, sealed and not yet handed to a road.

        ``being`` absent is the far door's own being, which is how the four
        introspections cross: they are the Warden blueprint's fields and are
        asked at the door itself, by the same row and under the same leash.

        The sealed envelope carries the type its answer reads by, so a caller
        that met silence resends the identical bytes and the answer is still
        read as what was asked for.
        """
        allowance = _allowance_now(self._warden)
        if allowance is None:
            return None
        seq = self._row.seq + 1
        envelope = self._warden.compose(
            self._row,
            seq=seq,
            allowance=allowance,
            being=being,
            method={"name": name, "args": blob},
        )
        if envelope is None:
            return None
        # Composing spent the row's number, and a number this door has spent is
        # what a restart must not lose: a row restored one behind spends it
        # again, and the far door judges the second a replay and answers
        # silence — so the ask after a restart is the one that vanishes.
        await self._warden.persist()
        return {
            "envelope": envelope,
            "seq": seq,
            "answers": answers,
            "records": records,
            "deadline": allowance["time"],
        }

    async def _seal(self, name: str, *args: Any) -> Optional[dict]:
        """The envelope alone, spent against the row but not yet handed to a road."""
        field = self._fields.get(name)
        if field is None:
            return None
        try:
            blob = wire.encode_all(
                [argument.type for argument in field.arguments], args, self._records
            )
        except wire.WireError:
            return None
        return await self._seal_at(self._at, name, blob, field.answers, self._records)

    async def _send(self, sealed: Optional[Mapping[str, Any]]) -> Any:
        """Hand a sealed envelope to delivery and answer with what comes back."""
        return self._read(sealed, await self._settle(sealed))

    async def _settle(
        self, sealed: Optional[Mapping[str, Any]]
    ) -> Optional[Mapping[str, Any]]:
        """The answer's own record, or nothing — which is silence and is told
        apart from a field that answered absent only here."""
        if sealed is None:
            return None
        seq = sealed["seq"]
        self._warden.awaiting(self._row, seq)
        settle = self._warden.pending(self._row, seq)
        back = await self._warden.delivery.send(self._view(), sealed["envelope"])
        if back is None:
            self._warden.forgo(self._row, seq)
        elif back is not CARRIED:
            await self._warden.arrive(back)
        return await self._warden.settled(self._row, seq, settle, sealed["deadline"])

    def _read(
        self,
        sealed: Optional[Mapping[str, Any]],
        answer: Optional[Mapping[str, Any]],
    ) -> Any:
        if sealed is None or answer is None:
            return None
        if sealed["answers"] is None or answer["data"] is None:
            return None
        try:
            return wire.decode(
                sealed["answers"], bytes(answer["data"]), sealed["records"]
            )
        except wire.WireError:
            return None

    async def _spend(self, name: str, *args: Any) -> Any:
        sealed = await self._seal(name, *args)
        answer = await self._settle(sealed)
        if sealed is not None and answer is None:
            await self._point()
        return self._read(sealed, answer)

    async def _point(self) -> None:
        """Silence may be a being that has left, so ask the door where it went.

        Article XIII: the old door only points, and it points with the same
        signed word it sent as news, so a peer that missed the news is rehoused
        without a new invitation. The word is handed to this ground's own
        warden, which believes it by the steps news is believed by, or by none.

        **The ask that met the move stays silence, and this handle does not
        retry at the new house.** The caller has already been told nothing, and
        a retry would spend a second number on a call it cannot know was never
        run — at-most-once is what the row's numbering is for. The next ask down
        this handle goes to the new house.
        """
        if self._pointing:
            return
        self._pointing = True
        try:
            own = self._warden.own("moved", self._at)
            if own is None:
                return
            sealed = await self._seal_at(
                None, "moved", own["args"], own["answers"], own["records"]
            )
            word = self._read(sealed, await self._settle(sealed))
            if not word:
                return
            successor = self._warden.rehouse(self._row, word)
            if successor is not None:
                # The row reaches the being by its new name, so this handle
                # must ask by it: a name a door has moved on from is a name no
                # door answers for again.
                self._at = successor
        finally:
            self._pointing = False

    async def _look(self, name: str, arg: Any = None) -> Any:
        own = self._warden.own(name, arg)
        if own is None:
            return None
        sealed = await self._seal_at(
            None, name, own["args"], own["answers"], own["records"]
        )
        return await self._send(sealed)


class LocalHandle(Handle):
    """A being under this same warden.

    One shape: asynchronous, leashed, a value or silence — and no seal, because
    under one warden there are no strangers and no voices. The value still
    rides through the codec, so a being cannot answer a neighbour what it could
    not answer a stranger.
    """

    def __init__(self, warden: Any, held: Any) -> None:
        super().__init__(held.pk, held.fields)
        self._warden = warden
        self._held = held
        self._digest = bytes(held.digest)
        # A handle keeps one shape wherever the being is, so a local one names
        # its class the same way a remote one does.
        self._text = warden.blueprints.get(bytes(held.digest), "")

    async def _look(self, name: str, arg: Any = None) -> Any:
        """The same four, answered by this warden about this being.

        A handle keeps one shape wherever the being is, so the introspections
        are answered here by the same estate, reach and blueprint the door
        answers a stranger with — not by reading the object.
        """
        return self._warden.look(self._at, name, arg)

    async def _spend(self, name: str, *args: Any) -> Any:
        held = self._warden.beings.get(bytes(self._at))
        if held is None:
            return None
        allowance = _allowance_now(self._warden)
        if allowance is None:
            return None
        field = self._fields[name]
        try:
            blob = wire.encode_all(
                [argument.type for argument in field.arguments], args, held.records
            )
        except wire.WireError:
            return None
        leash = self._warden.leash(allowance)
        # A being's own fault is silence here as it is at a door. **One shape**:
        # a caller of a neighbour is told exactly what a caller across an ocean
        # is told, and never an exception the far side would have swallowed.
        try:
            data = await held.serve(
                name, blob, Call(caller=Caller(voice=None, kind="local"), leash=leash)
            )
        except Silence:
            return None
        if field.answers is None or data is None:
            return None
        try:
            return wire.decode(field.answers, bytes(data), held.records)
        except wire.WireError:
            return None


class Quo:
    """The closure: facts and acts, never a judgment.

    It is attached to the object at ``obj._quo`` when the warden holds it, and
    it is the whole of what a being has of Quo. The underscore is what the
    notation cannot spell, so a blueprint may declare any name at all and none
    of them can reach this.
    """

    def __init__(self, warden: Any, held: Any) -> None:
        self._warden = warden
        self.being = held.pk

    # -- the facts

    @property
    def caller(self) -> Optional[Caller]:
        call = current()
        return call.caller if call is not None else None

    @property
    def leash(self) -> Optional[Mapping[str, int]]:
        call = current()
        if call is None or call.leash is None:
            return None
        return call.leash.received

    def standings(self) -> list:
        """Who holds a place at me, as voices only."""
        return self._warden.standings_at(self.being)

    def relation(self, label: str) -> Optional[Handle]:
        """A handle at a being elsewhere, or beside me, under a private label."""
        return self._warden.relation_at(label)

    async def relations(self, label: str) -> tuple:
        """Every being this label's row reaches, read from the far door now.

        A standing widened after it was accepted is re-read rather than
        remembered, so what was added is reached by asking who holds the row
        what it names today.
        """
        return await self._warden.relations_at(label)

    # -- the acts

    def grant(self, target: Any = None) -> Optional[wire.Invitation]:
        return self._warden.grant_at(_pk_of(target, self.being))

    def amend(
        self,
        voice: bytes,
        add: Sequence[Any] = (),
        remove: Sequence[Any] = (),
    ) -> bool:
        return self._warden.amend_at(
            voice,
            [_pk_of(one, None) for one in add],
            [_pk_of(one, None) for one in remove],
        )

    def release(self, target: Any = None) -> bool:
        return self._warden.release_at(_pk_of(target, self.being))

    def expose(self, target: Any = None) -> bool:
        """Offer a being to every voice, the stranger included; ``conceal``
        takes it back. No argument opens the being itself, as ``grant`` does."""
        return self._warden.expose(_pk_of(target, self.being))

    def conceal(self, target: Any = None) -> bool:
        return self._warden.conceal(_pk_of(target, self.being))

    async def accept(
        self, invitation: wire.Invitation, label: Optional[str] = None
    ) -> tuple:
        """An invitation turned into handles, one per being the standing names."""
        return await self._warden.accept(invitation, label=label, being=self.being)

    async def knock(
        self, card: wire.Card, label: Optional[str] = None
    ) -> Optional[Handle]:
        """A card turned into a handle at the far door's public being, as a
        stranger: what that door shows a stranger is what this answers with."""
        return await self._warden.knock(card, label=label, being=self.being)

    async def hold(
        self, obj: Any, blueprint: str, label: Optional[str] = None
    ) -> Optional[Handle]:
        return await self._warden.hold_beside(obj, blueprint, label=label)


def _pk_of(target: Any, fallback: Optional[bytes]) -> Optional[bytes]:
    """A being named by whichever of the three things a caller has to hand: its
    key, the object itself, or a handle at it.

    The last two are read at ``_quo``, which is one place rather than two: a
    held object and a handle both carry the kit's own there, and neither can be
    confused with a field the blueprint declares.
    """
    if target is None:
        return fallback
    if isinstance(target, (bytes, bytearray)):
        return bytes(target)
    own = getattr(target, "_quo", None)
    if own is not None and isinstance(getattr(own, "being", None), (bytes, bytearray)):
        return bytes(own.being)
    return None


async def resolve(value: Any) -> Any:
    """A being's method may be a coroutine function or a plain one, and the
    warden calls both the same way."""
    if inspect.isawaitable(value):
        return await value
    return value
