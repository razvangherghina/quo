"""The warden: the door, and the judgment that decides who is admitted.

Article IX gives the one blueprint nobody authors and every warden holds.
Article XII gives the judgment, in order, and its one failure: silence. Article
VII gives the two records, Article VIII the seq window and the leash, Article X
the three describes, Articles XIII and XIV rotation and news.

Nothing here reaches a road. The warden is the door's judgment, not the road:
what arrives is bytes, what leaves is bytes, and how either travelled is
delivery's.

Every refusal is :class:`Silence`, carrying nothing a caller may read. The
message it holds is for the operator of the ground and never for the wire.
"""

from __future__ import annotations

import asyncio
import secrets
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Optional, Sequence

from . import arithmetic, envelope, notation, wire
from .being import (
    CARRIED,
    Call,
    Caller,
    Handle,
    LocalHandle,
    Quo,
    RemoteHandle,
    resolve,
    within,
)

__all__ = [
    "Silence",
    "WARDEN_BLUEPRINT",
    "WARDEN_RECORDS",
    "WARDEN_DIGEST",
    "ESTATE_TYPE",
    "SKETCH_TYPE",
    "WORD_TYPE",
    "CARGO_TYPE",
    "ASK",
    "ROTATION",
    "NEWS",
    "STRANGER",
    "order_estate",
    "spend_seq",
    "spend_leash",
    "onward",
    "Leash",
    "Being",
    "Standing",
    "Relation",
    "Judgment",
    "Warden",
    "Call",
    "Caller",
    "Handle",
    "LocalHandle",
    "RemoteHandle",
    "Quo",
]


class Silence(Exception):
    """Every failure the door has. It never says which step it was."""


WARDEN_BLUEPRINT = (
    "Warden\n"
    "  describe() estate\n"
    "  sketch(being being) sketch?\n"
    "  blueprint(digest b32) text?\n"
    "  limit() int\n"
    "  tell(word word)\n"
    "  moved(being being) word?\n"
    "  receive(cargo cargo) b32\n"
    "\n"
    "estate\n"
    "  classes [class]\n"
    "\n"
    "class\n"
    "  digest b32\n"
    "  beings [held]\n"
    "\n"
    "held\n"
    "  being being\n"
    "  commitment b32\n"
    "\n"
    "sketch\n"
    "  being being\n"
    "  digest b32\n"
    "  commitment b32\n"
    "\n"
    "word\n"
    "  being being?\n"
    "  successor b32?\n"
    "  commitment b32?\n"
    "  name b32?\n"
    "  padlock b32?\n"
    "  hints [text]\n"
    "\n"
    "cargo\n"
    "  being being\n"
    "  digest b32\n"
    "  cells bytes\n"
    "  standings [standing]\n"
    "  relations [relation]\n"
    "\n"
    "standing\n"
    "  voice b32\n"
    "  commitment b32\n"
    "  name b32\n"
    "  beings [being]\n"
    "  mark int\n"
    "  spent [int]\n"
    "  padlock b32?\n"
    "  hints [text]\n"
    "\n"
    "relation\n"
    "  warden being\n"
    "  commitment b32\n"
    "  padlock b32\n"
    "  voice b32\n"
    "  secret b32\n"
    "  heir b32\n"
    "  heirSecret b32\n"
    "  seq int\n"
    "  news int\n"
    "  hints [text]\n"
)
"""Article IX, verbatim. Its digest is the same on every ground in the world."""

_WARDEN = notation.parse(WARDEN_BLUEPRINT)
WARDEN_RECORDS = wire.records_of(_WARDEN)
WARDEN_DIGEST = notation.digest(WARDEN_BLUEPRINT)

ESTATE_TYPE: notation.Type = notation.Base("estate")
SKETCH_TYPE: notation.Type = notation.Base("sketch")
WORD_TYPE: notation.Type = notation.Base("word")
CARGO_TYPE: notation.Type = notation.Base("cargo")

_FIELDS = {f.name: f for f in _WARDEN.klass.fields}

ASK = "ask"
ROTATION = "rotation"
NEWS = "news"
STRANGER = "stranger"


# ---------------------------------------------------------------- the describe


def order_estate(estate: Mapping[str, Any]) -> dict:
    """Article X: classes by digest bytes ascending, beings by pk bytes ascending.

    The order is derived, never chosen, so two wardens describing one estate
    produce one byte sequence.
    """
    classes = []
    for klass in estate["classes"]:
        beings = sorted(klass["beings"], key=lambda held: bytes(held["being"]))
        classes.append({"digest": klass["digest"], "beings": beings})
    classes.sort(key=lambda klass: bytes(klass["digest"]))
    return {"classes": classes}


# ------------------------------------------------------- the seq and the leash


def spend_seq(mark: int, spent: set, seq: int, width: int) -> tuple[int, set]:
    """Article VIII: honour a number once against the window, or fall silent.

    ``mark`` is the highest number honoured and ``spent`` the numbers below it
    already consumed. Honoured means consumed: the caller keeps what comes back
    whatever the rest of the judgment then does with the message.
    """
    if not isinstance(seq, int) or isinstance(seq, bool):
        raise Silence("a seq that is not an integer")
    if seq < 1:
        raise Silence("the first legal number is one")
    floor = mark - width
    if seq > mark:
        kept = {number for number in spent if number > seq - width}
        if mark >= 1:
            kept.add(mark)
        return seq, {number for number in kept if number > seq - width}
    if seq <= floor:
        raise Silence("a number below the window")
    if seq == mark or seq in spent:
        raise Silence("a number already spent")
    return mark, spent | {seq}


def spend_leash(allowance: Mapping[str, int]) -> None:
    """Article VIII: the leash is judged on what arrived.

    A time budget at or below zero, or a hop count below zero, is silence. A
    hop count of zero is a legal leash for a call that goes no further.
    """
    if allowance["time"] <= 0:
        raise Silence("a time budget at or below zero")
    if allowance["hops"] < 0:
        raise Silence("a hop count below zero")


def onward(allowance: Mapping[str, int], dwell: int) -> Optional[dict]:
    """The leash an onward ask carries, or ``None`` when it cannot be made.

    The hop count falls by one; the budget falls by this door's own dwell, the
    road never counted. Where either would fall below zero, or the budget to
    zero, the onward ask is not made and the work already routed stands.
    """
    hops = allowance["hops"] - 1
    time = allowance["time"] - dwell
    if hops < 0 or time <= 0:
        return None
    return {"time": time, "hops": hops}


@dataclass(frozen=True)
class Leash:
    """What one arriving call may hand to the next door.

    It is not a number the door worked out in advance: the hop count falls by
    one, and the budget by this door's own dwell — the difference between when
    the message arrived and when it is handed onward. The second of those two
    readings cannot be taken until the handing onward happens, so a leash holds
    the first reading and the clock, and works the rest out when it is spent.

    Made with nothing it carries nothing and refuses to be spent, which is what
    a being invoked outside a judgment holds.
    """

    received: Optional[Mapping[str, int]] = None
    arrived: int = 0
    clock: Optional[Callable[[], int]] = None

    def onward(self) -> Optional[dict]:
        """What this call may hand to the next door, read now.

        A budget that has run out mid-work is refused here exactly as it would
        have been at the door: the caller's allowance is the caller's, and no
        door beneath may widen it.

        A dwell is never negative. Two readings of one clock is what the law
        asks for, and a clock that has gone backwards between them is a broken
        clock, not a licence to hand on more time than arrived.
        """
        if self.clock is None or self.received is None:
            return None
        dwell = self.clock() - self.arrived
        return onward(self.received, dwell if dwell > 0 else 0)


# ------------------------------------------------------------------ the records


@dataclass
class Being:
    """One being this warden holds: its keys, its class, and the object itself.

    The object is a plain class of the developer's and stays one. What it gains
    is the closure at ``obj.quo``, the one API a being has to Quo, and a codec:
    its declared methods are called with decoded arguments and answer plain
    values, which the warden encodes by the field's declared answer type. **The
    being never sees a byte.**
    """

    pk: bytes
    digest: bytes
    commitment: bytes
    obj: Any = None
    #: What its blueprint declares, parsed once when the being was held and
    #: never again at judgment time. It is also the scope of every grant at
    #: this being: what the blueprint does not declare does not exist for it.
    fields: dict = field(default_factory=dict)
    records: dict = field(default_factory=dict)
    #: What moves with it when nothing else says: a being that provides neither
    #: ``cells()`` nor ``take()`` moves with its name and its standings alone.
    cells: bytes = b""

    @property
    def declares(self) -> frozenset:
        return frozenset(self.fields)

    def state(self) -> bytes:
        """What of this being's state moves with it, which the being decides."""
        said = getattr(self.obj, "cells", None)
        return bytes(said()) if callable(said) else bytes(self.cells)

    def take(self, blob: bytes) -> None:
        """And how it takes that state back."""
        taker = getattr(self.obj, "take", None)
        if callable(taker):
            taker(bytes(blob))
        else:
            self.cells = bytes(blob)

    async def serve(self, name: str, blob: bytes, call: Call) -> Optional[bytes]:
        """One declared method, with the caller and the leash in scope, the
        arguments decoded and the answer encoded. What must be bytes or nothing
        at the wire is made so here, never by the being."""
        declared = self.fields.get(name)
        if declared is None:
            raise Silence(f"a field this blueprint does not declare: {name!r}")
        method = getattr(self.obj, name, None)
        if not callable(method):
            raise Silence(f"a declared field this object does not serve: {name!r}")
        try:
            args = wire.decode_all(
                [argument.type for argument in declared.arguments], blob, self.records
            )
        except wire.WireError as bad:
            raise Silence(str(bad)) from bad
        with within(call):
            value = await resolve(method(*args))
        if declared.answers is None:
            return None
        try:
            return wire.encode(declared.answers, value, self.records)
        except wire.WireError as bad:
            raise Silence(str(bad)) from bad


@dataclass
class Standing:
    """An inbound row: which voice may reach which beings, and the way back.

    ``minted_at`` is the name this door wore when the commitment was minted.
    A name succession keeps the standings, so every commitment keeps being
    verified under the name it was minted at (Article XIV).
    """

    voice: bytes
    commitment: bytes
    minted_at: bytes
    beings: list = field(default_factory=list)
    mark: int = 0
    spent: set = field(default_factory=set)
    padlock: Optional[bytes] = None
    hints: tuple = ()


@dataclass
class Relation:
    """An outbound row: the invitation kept whole, and two counters.

    ``seq`` is the count kept against that far door for what this door sends.
    ``news`` is the mark kept for that far warden's news (Article XIV). They
    are two fields **because one field cannot be two counters**: a peer's
    numbers and this door's own would otherwise walk on each other.

    ``holder`` is which of this ground's beings may spend the relation. A row
    that named none could not travel when that being moves, and a relation
    nobody here owns belongs to the warden itself and travels nowhere.
    """

    warden: bytes
    commitment: bytes
    padlock: bytes
    voice: bytes
    secret: bytes
    heir: bytes
    heir_secret: bytes
    seq: int = 0
    news: int = 0
    hints: tuple = ()
    holder: Optional[bytes] = None
    #: The commitment this door holds for each being it stands at down this
    #: relation, taken from a describe and kept by :meth:`Warden.note`. **A
    #: being's succession is believed against the being's own commitment,
    #: never the row's**: the row's belongs to the house's name, and a door
    #: that hashed one against the other would let the house's committed heir
    #: succeed every being at it, or let a being's heir take the house.
    #:
    #: It does not travel. A ``relation`` record carries what the far door
    #: knows about this holder; what this door has learned about the beings
    #: there is its own reading, re-taken from a describe.
    beings: dict = field(default_factory=dict)
    #: The asks put on a road down this relation with no answer heard yet, each
    #: as the padlock the answer will be sealed to and the number the ask
    #: spent. Article XII's fourth check on an answer reads it, so it lives in
    #: the core: the check is owed whether or not a socket was involved.
    awaiting: dict = field(default_factory=dict)


@dataclass
class Judgment:
    """What one turn of the door produced."""

    answer: bytes
    placement: str
    arrived: Optional[int] = None
    handed: Optional[int] = None
    onward: Optional[dict] = None


# ------------------------------------------------------------------- the door


def _mint() -> bytes:
    return secrets.token_bytes(arithmetic.KEY_LENGTH)


class Warden:
    """A ground's one door: the eight steps of Article XII and nothing else.

    ``window`` is how wide the replay window is, which Article VIII leaves to
    the warden. ``limit`` is the largest whole envelope this door accepts, the
    one fact Article IX makes a warden publish about itself. ``mint`` draws the
    fresh thirty-two bytes an answer's ephemeral key and a migration's new heir
    need; it is injected so a bench can make a door deterministic.
    """

    @classmethod
    async def open(
        cls,
        seeds: Any,
        clock: Optional[Callable[[], int]] = None,
        random: Optional[Callable[[], bytes]] = None,
        delivery: Any = None,
        store: Any = None,
        hints: Sequence[str] = (),
        limit: int = 65536,
        window: int = 64,
        allowance: Optional[Mapping[str, int]] = None,
    ) -> "Warden":
        """Open a warden on what the host hands it and nothing it reached for.

        The seeds, the clock, the randomness, the store and delivery all arrive
        from outside; the warden derives its keys from the seeds and reads back
        whatever a previous run left in the store. **Opened rather than
        constructed**, because the records the store keeps are read with an
        await and no constructor can wait.
        """
        warden = cls(
            name_secret=bytes(seeds.name),
            padlock_secret=bytes(seeds.padlock),
            window=window,
            limit=limit,
            random=random,
            heir=arithmetic.signing_public(bytes(seeds.heir)),
            clock=clock,
            delivery=delivery,
            store=store,
            hints=hints,
            allowance=allowance,
        )
        warden.heir_secret = bytes(seeds.heir)
        if store is not None:
            await warden.restore()
        return warden

    def __init__(
        self,
        name_secret: bytes,
        padlock_secret: bytes,
        window: int = 64,
        limit: int = 65536,
        mint: Callable[[], bytes] = _mint,
        heir: Optional[bytes] = None,
        clock: Optional[Callable[[], int]] = None,
        random: Optional[Callable[[], bytes]] = None,
        delivery: Any = None,
        store: Any = None,
        hints: Sequence[str] = (),
        allowance: Optional[Mapping[str, int]] = None,
    ) -> None:
        self.name_secret = name_secret
        self.name = arithmetic.signing_public(name_secret)
        self.padlock_secret = padlock_secret
        self.padlock = arithmetic.sealing_public(padlock_secret)
        self.window = window
        self.limit = limit
        #: The randomness, handed in by the host and never reached for: every
        #: ephemeral key, every voice and every being's key is drawn from it.
        self.mint = random if random is not None else mint
        self.random = self.mint
        #: The clock, the store the records live in, and delivery — the one
        #: thing beneath the warden that reads a hint. All handed in.
        self.clock = clock
        self.store = store
        self.delivery = delivery
        #: The allowance a walk is born with when a being starts one of its own,
        #: which each warden sets for itself.
        self.allowance: dict = dict(allowance or {"time": 5000, "hops": 8})
        #: The warden's own heir seed, when it was opened on one.
        self.heir_secret: Optional[bytes] = None
        #: Private labels beside the rows: they resolve nothing and travel
        #: nowhere, and a being reaches its relations by them.
        self.labels: dict = {}
        #: What the answering side's own layer is told when the door falls
        #: silent. Nothing outward changes: the wire still gets the one silence.
        self.observer: Optional[Callable[[str], None]] = None
        #: The roads this ground can be reached on, which every say it composes
        #: and every invitation it mints carries. A ground that publishes none
        #: is reachable only down a line it opened.
        self.hints: tuple = tuple(hints)
        self.beings: dict = {}
        self.blueprints: dict = {WARDEN_DIGEST: WARDEN_BLUEPRINT}
        self.inbound: list = []
        self.outbound: list = []
        self.pointers: dict = {}
        #: A being's own key, and the heir it committed to. Both are the
        #: warden's to hold — nobody hand-manages three hundred keys — and both
        #: sign: the heir signs a migration's first news, and the being's own
        #: key signs the second, at the house it landed in.
        self.secrets: dict = {}
        self.heirs: dict = {}
        #: How a being of each class this door is armed for is made once it has
        #: landed. **The digest identifies rather than delivers**: a cargo
        #: carries state and never code, so the program an arriving being runs
        #: is the destination's own and is put here before the cargo comes.
        self.arriving: dict = {}
        #: What the last ``receive`` took in, until :meth:`landed` reads it.
        self.arrived: Optional[tuple] = None
        self.public = Being(
            pk=self.name,
            digest=WARDEN_DIGEST,
            commitment=(
                arithmetic.commitment(self.name, heir)
                if heir is not None
                else b"\x00" * arithmetic.KEY_LENGTH
            ),
        )

    # -- the estate a voice may reach

    def _held(self, pk: bytes) -> Optional[Being]:
        if pk == self.name:
            return self.public
        return self.beings.get(bytes(pk))

    def _reaches(self, standing: Optional[Standing], pk: bytes) -> Optional[Being]:
        """The public being is reachable by everyone, holders included."""
        if pk == self.name:
            return self.public
        if standing is None:
            return None
        if bytes(pk) not in [bytes(one) for one in standing.beings]:
            return None
        return self.beings.get(bytes(pk))

    def estate(self, standing: Optional[Standing]) -> dict:
        """Every being that voice may reach, given as digests with the pks under each.

        The stranger's case is the warden's own public being, and being public
        is not a flag on anything.
        """
        reachable = [self.public]
        if standing is not None:
            for pk in standing.beings:
                being = self.beings.get(bytes(pk))
                if being is not None:
                    reachable.append(being)
        classes: dict = {}
        for being in reachable:
            classes.setdefault(bytes(being.digest), []).append(
                {"being": being.pk, "commitment": being.commitment}
            )
        return order_estate(
            {
                "classes": [
                    {"digest": digest, "beings": beings}
                    for digest, beings in classes.items()
                ]
            }
        )

    def sketch(self, being: Being) -> dict:
        return {
            "being": being.pk,
            "digest": being.digest,
            "commitment": being.commitment,
        }

    # -- step 4, placing the voice

    def _place(self, say: Mapping[str, Any]) -> tuple:
        """Where the voice is found, which is the whole of what a message's kind is.

        The third element says how a news voice was placed: ``(by_heir,
        being)``, where ``being`` is whose commitment the voice hashed to and
        is absent when it hashed to the house's own. **That is what says whose
        succession this voice may announce** — a being's heir cannot move the
        house's name, and the house's heir cannot move a being.
        """
        voice = bytes(say["voice"])
        for standing in self.inbound:
            if bytes(standing.voice) == voice:
                if say["commitment"] is not None:
                    raise Silence("a plain ask carrying a commitment")
                return ASK, standing, None
        # Every match is gathered before anything moves. Matching more than one
        # standing is silence: no order over the records is law, so a door that
        # took the first it found would have chosen, and the next door would
        # choose differently. A granter that committed one heir at two standings
        # has made its own error.
        matched = [
            standing
            for standing in self.inbound
            if arithmetic.commitment(standing.minted_at, voice)
            == bytes(standing.commitment)
        ]
        if len(matched) > 1:
            raise Silence("a hash matching more than one standing")
        if matched:
            standing = matched[0]
            if say["commitment"] is None:
                raise Silence("a rotation carrying no fresh commitment")
            standing.voice = voice
            standing.commitment = bytes(say["commitment"])
            standing.minted_at = self.name
            standing.mark = 0
            standing.spent = set()
            return ROTATION, standing, None
        for relation in self.outbound:
            if bytes(relation.warden) == voice:
                return NEWS, relation, (False, None)
            if arithmetic.commitment(relation.warden, voice) == bytes(
                relation.commitment
            ):
                return NEWS, relation, (True, None)
            for being, commitment in relation.beings.items():
                if arithmetic.commitment(relation.warden, voice) == commitment:
                    return NEWS, relation, (True, being)
        return STRANGER, None, None

    # -- step 7, the warden's own being

    def _arguments(self, name: str, blob: bytes) -> list:
        declared = _FIELDS[name].arguments
        if not declared:
            if blob:
                raise Silence("bytes left in the blob of a field taking nothing")
            return []
        if len(declared) != 1:
            raise Silence("a warden field taking more than one argument")
        try:
            return [wire.decode(declared[0].type, blob, WARDEN_RECORDS)]
        except wire.WireError as bad:
            raise Silence(str(bad)) from bad

    def _own(
        self,
        name: str,
        blob: bytes,
        placement: str,
        standing: Optional[Standing],
        row: Optional[Relation],
        voice: bytes,
        placed: tuple,
    ) -> Optional[bytes]:
        if name not in _FIELDS:
            raise Silence(f"a field the Warden blueprint does not declare: {name!r}")
        if (name == "tell") != (placement == NEWS):
            raise Silence("tell is news, and news is nothing else")
        args = self._arguments(name, blob)
        if name == "describe":
            return wire.encode(ESTATE_TYPE, self.estate(standing), WARDEN_RECORDS)
        if name == "sketch":
            being = self._reaches(standing, args[0])
            if being is None:
                raise Silence("a sketch of a being this voice does not reach")
            return wire.encode(
                notation.Maybe(SKETCH_TYPE), self.sketch(being), WARDEN_RECORDS
            )
        if name == "blueprint":
            return wire.encode(
                notation.Maybe(notation.Base("text")),
                self.blueprint_for(standing, bytes(args[0])),
                WARDEN_RECORDS,
            )
        if name == "limit":
            return wire.encode(notation.Base("int"), self.limit, WARDEN_RECORDS)
        if name == "tell":
            assert row is not None
            self._believe(row, args[0], voice, placed)
            return None
        if name == "moved":
            # Scoped by the same binary record every describe is, and silence
            # rather than absence outside it. A being this door has moved on is
            # reached by the succession it published and by nothing else: an
            # arriving row names the being by the name the destination minted
            # and by that name alone, so the name it wore before stands in no
            # standing here. If a published pointer were not reach enough, the
            # old door could not point about the one being Article XIII sends
            # every peer behind the news to ask it about.
            # To a holder who reached it before, never to a stranger — and
            # holding a standing at some other being here is not having reached
            # this one. At the old door the standings still name the being that
            # left, which the reach test catches; at a destination they name it
            # by the key this house minted, so reaching the successor the
            # published word names is what reached-it-before means there.
            asked = bytes(args[0])
            word = self.pointers.get(asked)
            pointed = (
                word is not None
                and word.get("successor") is not None
                and self._reaches(standing, bytes(word["successor"])) is not None
            )
            if self._reaches(standing, asked) is None and not pointed:
                raise Silence("a pointer for a being this voice does not reach")
            return wire.encode(notation.Maybe(WORD_TYPE), word, WARDEN_RECORDS)
        # `receive` is an ordinary field spent by an ordinary standing, granted
        # in advance the way anything is: a door any stranger could push a
        # being into is a door with no gate (Article IX).
        if standing is None:
            raise Silence("a stranger pushing a being into this door")
        return wire.encode(notation.Base("b32"), self._receive(args[0]), WARDEN_RECORDS)

    def blueprint_for(self, standing: Optional[Standing], digest: bytes) -> str:
        """Answered only if the asker already reaches a being of that class, or
        the warden's own public being declares it. Otherwise silence."""
        allowed = {bytes(self.public.digest)}
        if standing is not None:
            for pk in standing.beings:
                being = self.beings.get(bytes(pk))
                if being is not None:
                    allowed.add(bytes(being.digest))
        if digest not in allowed:
            raise Silence("a blueprint of a class this voice reaches nothing of")
        text = self.blueprints.get(digest)
        if text is None:
            raise Silence("a blueprint this door does not hold")
        return text

    def _receive(self, cargo: Mapping[str, Any]) -> bytes:
        """A migration's state transfer, answered with a commitment nobody has seen.

        The digest identifies rather than delivers: a destination that does not
        already hold that class refuses the cargo in silence.

        **A destination mints two keys — the one the being is named by here and
        that one's heir — and the commitment is of the first** (Article IX).
        The being's new name is where the migration's second news moves the
        being's identity, and it is what a peer hashes that succession against;
        a commitment to the heir instead names a key that signs nothing until
        the succession after this one, so the peer disbelieves the news and is
        left standing at a house that has stopped answering.
        """
        digest = bytes(cargo["digest"])
        if digest not in self.blueprints:
            raise Silence("a cargo of a class this door does not hold")
        arriving = bytes(cargo["being"])
        secret = self.mint()
        pk = arithmetic.signing_public(secret)
        if pk == arriving:
            raise Silence("a receive minting the name the being already wore")
        heir_secret = self.mint()
        heir = arithmetic.signing_public(heir_secret)
        parsed = notation.parse(self.blueprints[digest])
        make = self.arriving.get(digest)
        held = Being(
            pk=pk,
            digest=digest,
            # The being's own heir commitment, which is what lets this name be
            # succeeded afterwards like any other.
            commitment=arithmetic.commitment(self.name, heir),
            obj=make() if make is not None else None,
            fields={one.name: one for one in parsed.klass.fields},
            records=wire.records_of(parsed),
        )
        self.beings[pk] = held
        # A cargo carries state and never code: the program the arriving being
        # runs is this door's own, and what travelled is what it takes back.
        held.take(bytes(cargo["cells"]))
        if held.obj is not None:
            held.obj.quo = Quo(self, held)
        self.secrets[pk] = secret
        self.heirs[pk] = heir_secret
        for row in cargo["standings"]:
            self.inbound.append(
                Standing(
                    voice=bytes(row["voice"]),
                    commitment=bytes(row["commitment"]),
                    # The name each commitment was minted at travels with the
                    # row, so a standing that arrives still rotates at the name
                    # it was granted under rather than at this door's.
                    minted_at=bytes(row["name"]),
                    # An arriving row reaches the being by the name this door
                    # minted and by that name alone (Article XIII), never also
                    # by the name it wore before: a name a door must remember
                    # for whoever might still be behind is a name it can never
                    # stop remembering, and the peer that is behind is not
                    # stranded, because the old door still answers `moved`.
                    beings=[pk],
                    mark=row["mark"],
                    spent=set(row["spent"]),
                    padlock=row["padlock"],
                    hints=tuple(row["hints"]),
                )
            )
        for row in cargo["relations"]:
            self.outbound.append(
                Relation(
                    warden=bytes(row["warden"]),
                    commitment=bytes(row["commitment"]),
                    padlock=bytes(row["padlock"]),
                    voice=bytes(row["voice"]),
                    secret=bytes(row["secret"]),
                    heir=bytes(row["heir"]),
                    heir_secret=bytes(row["heirSecret"]),
                    seq=row["seq"],
                    # The news mark travels too, so a peer's numbers stay
                    # spent across the move rather than coming round again.
                    news=row["news"],
                    hints=tuple(row["hints"]),
                    holder=pk,
                )
            )
        # What the second news is composed from, held until :meth:`landed` is
        # asked for it: the name this door minted, the name the being wore
        # before, and the voices that arrived with the standings. A standing
        # granted here afterwards is owed nothing — it never knew the being
        # anywhere else.
        self.arrived = (
            arriving,
            pk,
            tuple(bytes(row["voice"]) for row in cargo["standings"]),
        )
        # The commitment of the being's new name, hashed under this door's own.
        return arithmetic.commitment(self.name, pk)

    # -- Article XIV, believing the news

    def _believe(
        self,
        row: Relation,
        word: Mapping[str, Any],
        voice: bytes,
        placed: tuple,
    ) -> None:
        """A peer believes it by a key it already holds, and there are only two."""
        by_heir, hashed_to = placed
        announced = bytes(word["being"]) if word["being"] is not None else None
        if announced is not None and announced == bytes(row.warden):
            raise Silence("a word naming the warden's own pk in being")
        succession = word["successor"] is not None
        if succession:
            if word["commitment"] is None:
                raise Silence("a succession carrying no next commitment")
            if bytes(word["successor"]) != bytes(voice):
                raise Silence("a succession the successor did not sign")
            if not by_heir:
                raise Silence("a succession not signed by the heir that was committed")
            # The commitment the voice hashed to is placed already, so it says
            # what this voice may succeed and nothing else does.
            if announced != hashed_to:
                raise Silence("a succession announced by an heir committed elsewhere")
            if announced is None:
                row.warden = bytes(word["successor"])
                row.commitment = bytes(word["commitment"])
            else:
                # A being's succession moves the being's own entry. The row's
                # own commitment belongs to the house and is untouched.
                row.beings.pop(announced, None)
                row.beings[bytes(word["successor"])] = bytes(word["commitment"])
        else:
            if word["commitment"] is not None:
                raise Silence("a padlock replacement carrying a commitment")
            if word["padlock"] is None:
                raise Silence("a word that announces nothing")
            if bytes(voice) != bytes(row.warden):
                raise Silence("a padlock replacement the name did not sign")
        if word["name"] is not None:
            row.warden = bytes(word["name"])
        if word["padlock"] is not None:
            row.padlock = bytes(word["padlock"])
        if word["hints"]:
            row.hints = tuple(word["hints"])
        # A name succession keeps the news mark, because the house persisted
        # and only its key changed; a being's succession starts it fresh.
        if succession and word["being"] is not None:
            row.news = 0

    # -- the eight steps

    async def judge(
        self,
        message: bytes,
        clock: Optional[Callable[[], int]] = None,
        via: Any = None,
    ) -> Judgment:
        """Article XII, in order. Every failure is silence.

        The two clock readings are taken at the ends of the judgment: the
        arrival one at the first step, before anything is unsealed, the onward
        one at the moment of handing onward. What an onward ask may carry comes
        back on the :class:`Judgment`; making it is the road's, never the door's.
        """
        arrived = clock() if clock is not None else None
        if len(message) > self.limit:
            raise Silence("an envelope larger than the limit")

        # 1 and 2 — unseal, decode, and verify the signature.
        try:
            say = envelope.unseal(self.padlock_secret, message, envelope.SAY)
        except envelope.EnvelopeError as bad:
            raise Silence(str(bad)) from bad

        # 3 — check the recipient, here and not later.
        recipient = bytes(say["recipient"])
        if recipient != self.name and recipient != self.padlock:
            raise Silence("a payload addressed elsewhere")

        # 4 — place the voice, in the two records and in that order.
        voice = bytes(say["voice"])
        placement, row, placed = self._place(say)

        standing = row if placement in (ASK, ROTATION) else None
        relation = row if placement == NEWS else None

        # 5 — spend the seq. A stranger spends nothing.
        if standing is not None:
            standing.mark, standing.spent = spend_seq(
                standing.mark, standing.spent, say["seq"], self.window
            )
            standing.padlock = bytes(say["padlock"])
            # An empty hints list means the road did not change, never an
            # erasure: a dialing end publishes nothing by nature, and a door
            # that erased on that would destroy its own way back to that peer
            # on the peer's first ask.
            if say["hints"]:
                standing.hints = tuple(say["hints"])
        elif relation is not None:
            if not isinstance(say["seq"], int) or say["seq"] < 1:
                raise Silence("the first legal number is one")
            # Counted against the mark kept for that far warden, which is its
            # own number and never the one this door sends by.
            if say["seq"] <= relation.news:
                raise Silence("a news number that does not rise")
            relation.news = say["seq"]

        # The number is spent and the way back refreshed: what a restart must
        # not lose has just changed.
        await self.persist()
        # Delivery learns the road this padlock's asks arrive on, as an address
        # beside an opaque token. It reads nothing else of the message, and the
        # warden read nothing of the token.
        if via is not None and self.delivery is not None:
            arrived_at = getattr(self.delivery, "arrived", None)
            if callable(arrived_at):
                arrived_at(bytes(say["padlock"]), via)

        # 6 — spend the leash.
        spend_leash(say["allowance"])

        # 7 — route. Whatever the being reaches onward carries less than
        # arrived, and the dwell is only known at the moment it reaches, so the
        # being is handed the leash rather than a number worked out here.
        leash = Leash(say["allowance"], arrived if arrived is not None else 0, clock)
        data = await self._route(
            say, placement, standing, relation, voice, placed, leash
        )

        # 8 — answer, sealed to the return padlock and signed by the name.
        handed = clock() if clock is not None else None
        answer = envelope.seal(
            envelope.ANSWER,
            {"warden": self.name, "seq": say["seq"], "data": data},
            self.name_secret,
            bytes(say["padlock"]),
            self.mint(),
        )
        return Judgment(
            answer=answer,
            placement=placement,
            arrived=arrived,
            handed=handed,
            onward=(
                onward(say["allowance"], handed - arrived)
                if arrived is not None and handed is not None
                else None
            ),
        )

    async def _route(
        self,
        say: Mapping[str, Any],
        placement: str,
        standing: Optional[Standing],
        relation: Optional[Relation],
        voice: bytes,
        placed: tuple,
        leash: Leash,
    ) -> Optional[bytes]:
        being_pk = say["being"]
        method = say["method"]
        if being_pk is not None and bytes(being_pk) in self.pointers:
            # The old door only points: it answers `moved` with the succession,
            # asked of the warden itself, and every other ask meets silence. An
            # answer's data is the field's declared answer type by the
            # notation's rules, and a succession is not that type, so the word
            # cannot be put where the caller asked for something else. A peer
            # that never asks `moved` learns of the move by news.
            raise Silence("a being that has moved: the old door only points")
        if being_pk is None and method is None:
            # There is no empty ask, because there is a default one: describe.
            return wire.encode(ESTATE_TYPE, self.estate(standing), WARDEN_RECORDS)
        if being_pk is None:
            return self._own(
                method["name"],
                bytes(method["args"]),
                placement,
                standing,
                relation,
                voice,
                placed,
            )
        being = self._reaches(standing, bytes(being_pk))
        if being is None:
            raise Silence("a being this voice does not reach")
        if method is None:
            return wire.encode(
                notation.Maybe(SKETCH_TYPE), self.sketch(being), WARDEN_RECORDS
            )
        if bytes(being_pk) == self.name:
            return self._own(
                method["name"],
                bytes(method["args"]),
                placement,
                standing,
                relation,
                voice,
                placed,
            )
        if placement == NEWS:
            raise Silence("news reaches nothing but tell")
        if being.obj is None:
            raise Silence("a being that answers nothing")
        # The blueprint is the scope: a name it never declared is not reached
        # for on the object at all.
        if method["name"] not in being.declares:
            raise Silence("a field this being's blueprint does not declare")
        call = Call(
            caller=Caller(
                voice=bytes(voice),
                kind="holder" if placement == ASK else placement,
            ),
            leash=leash,
        )
        try:
            return await being.serve(method["name"], bytes(method["args"]), call)
        except Silence:
            raise
        except Exception as bad:
            # The fault the being itself caused, which is the one an answering
            # layer most wants back. Outward it is the same silence.
            raise Silence(f"a being that threw: {bad!r}") from bad

    # -- Article XIV, the name's own succession

    def succeed(self, name_secret: bytes, heir_commitment: bytes) -> None:
        """Move this door's own name to the heir its founding committed to.

        The public being's pk is the warden's name, so it moves with it, and
        ``heir_commitment`` is what the new name commits to next.

        **Every standing stays where it was.** Each row keeps the name its
        commitment was minted at, so an older standing still rotates; the
        commitment that rotation carries is filed under the new name, and the
        one after it will not match until the holder has heard the news.
        """
        successor = arithmetic.signing_public(name_secret)
        if arithmetic.commitment(self.name, successor) != bytes(self.public.commitment):
            raise Silence("a name that is not the heir the founding committed to")
        self.name = successor
        self.name_secret = name_secret
        self.public = Being(
            pk=successor,
            digest=WARDEN_DIGEST,
            commitment=bytes(heir_commitment),
        )

    # -- what a ground does between calls

    def grant(
        self,
        voice: bytes,
        commitment: bytes,
        beings: Sequence[bytes],
        padlock: Optional[bytes] = None,
        hints: Sequence[str] = (),
    ) -> Standing:
        """Letting someone in is a rotation: record that a voice may reach a being."""
        standing = Standing(
            voice=bytes(voice),
            commitment=bytes(commitment),
            minted_at=self.name,
            beings=[bytes(one) for one in beings],
            padlock=padlock,
            hints=tuple(hints),
        )
        self.inbound.append(standing)
        return standing

    async def hold(
        self,
        obj: Any,
        blueprint: str,
        secret: Optional[bytes] = None,
        heir_secret: Optional[bytes] = None,
        label: Optional[str] = None,
    ) -> "Handle":
        """Hold an object: mint its keys, keep the pointer and the class text.

        The object is a plain class and stays one. What it gains is the closure
        at ``obj.quo`` — the one API a being has to Quo — and a codec. Its heir
        lives under this warden, because nobody hand-manages three hundred
        keys, and the commitment serves the peer, which receives it in every
        describe.

        The text is kept canonical, so the blueprint a stranger fetches hashes
        back to the digest the estate named it by. What comes back is a handle
        at the being, which is the one shape a caller ever holds.
        """
        secret = self.mint() if secret is None else bytes(secret)
        heir_secret = self.mint() if heir_secret is None else bytes(heir_secret)
        parsed = notation.parse(blueprint)
        text = notation.render(parsed)
        digest = notation.digest(text)
        self.blueprints[digest] = text
        pk = arithmetic.signing_public(secret)
        heir = arithmetic.signing_public(heir_secret)
        held = Being(
            pk=pk,
            digest=digest,
            commitment=arithmetic.commitment(self.name, heir),
            obj=obj,
            fields={one.name: one for one in parsed.klass.fields},
            records=wire.records_of(parsed),
        )
        self.beings[pk] = held
        self.secrets[pk] = secret
        self.heirs[pk] = heir_secret
        obj.quo = Quo(self, held)
        if label is not None:
            self.labels[label] = {"local": pk}
        await self.persist()
        return LocalHandle(self, held)

    async def hold_beside(
        self, obj: Any, blueprint: str, label: Optional[str] = None
    ) -> "Handle":
        """A smaller being minted beside another, which is what a being's own
        ``quo.hold`` is. Nothing here differs but who asked."""
        return await self.hold(obj, blueprint, label=label)

    # -- what the warden offers to roads and to its own house

    def publish(self, *hints: str) -> tuple:
        """A warden does not know where it stands until something stands it up,
        so the road is told to it rather than fixed at birth. Roads accumulate:
        a warden offers as many as it has and none is authoritative."""
        roads = list(self.hints)
        for hint in hints:
            if hint not in roads:
                roads.append(hint)
        self.hints = tuple(roads)
        return self.hints

    def retract(self, *hints: str) -> tuple:
        """A road that has stopped carrying is not a road. Retracting one is
        not news: it only stops the dead road being minted into anything new."""
        self.hints = tuple(one for one in self.hints if one not in hints)
        return self.hints

    def observe(self, observer: Optional[Callable[[str], None]]) -> "Warden":
        """The inward view of silence: why the door fell silent, told to the
        house that runs it. Nothing crosses the wire, and the stranger meets
        the same nothing it always did."""
        self.observer = observer if callable(observer) else None
        return self

    def _hush(self, reason: str) -> None:
        """Every silence goes through here, so the two directions cannot drift:
        outward it is always nothing, inward it is a reason."""
        if self.observer is None:
            return
        try:
            self.observer(reason)
        except Exception:
            # The door does not answer differently because a watcher fell over.
            pass

    async def arrive(self, message: bytes, via: Any = None) -> Optional[bytes]:
        """The one entry point for arriving bytes, whatever road carried them.

        The record byte inside the seal says which of the two records arrived,
        and **only the warden reads it**: an answer settles the ask awaiting it
        and the road gets nothing back; a say is judged and the road gets bytes
        or silence. A road never opens a seal to route.

        ``via`` is the road the bytes arrived on, opaque to the warden and
        handed back to delivery beside the caller's padlock once the way back
        is refreshed — so a peer that publishes nothing can be reached down the
        line it holds, and the road never had to open a seal to be remembered.
        """
        try:
            kind, record = envelope.open_envelope(self.padlock_secret, message)
        except envelope.EnvelopeError as bad:
            self._hush(str(bad))
            return None
        if kind == envelope.ANSWER:
            try:
                self.hear_record(record)
            except Silence as bad:
                self._hush(str(bad))
            return None
        try:
            return (await self.judge(message, self.clock, via=via)).answer
        except Silence as bad:
            self._hush(str(bad))
            return None
        except Exception as bad:  # the warden is the global try/except
            self._hush(f"threw: {bad!r}")
            return None

    def invite(
        self,
        being: bytes,
        voice_secret: bytes,
        heir_secret: bytes,
        hints: Sequence[str] = (),
    ) -> wire.Invitation:
        """Mint an invitation to one being: the five things a holder holds.

        It does not name the being. A holder rotates, describes, and finds what
        it now reaches, which is why the invitation carries no more than this.
        """
        heir = arithmetic.signing_public(heir_secret)
        commitment = arithmetic.commitment(self.name, heir)
        roads = tuple(hints) if hints else tuple(self.hints)
        self.grant(
            arithmetic.signing_public(voice_secret),
            commitment,
            [being],
            padlock=self.padlock,
            hints=roads,
        )
        return wire.Invitation(
            warden=self.name,
            commitment=commitment,
            padlock=self.padlock,
            heir=heir,
            heir_secret=heir_secret,
            hints=roads,
        )

    def card(self, hints: Sequence[str] = ()) -> wire.Card:
        """The four things a stranger holds: this door, without a voice.

        It grants nothing. Whoever knocks with it is a stranger there, and what
        a stranger is shown is the public being and nothing else.
        """
        return wire.Card(
            warden=self.name,
            commitment=bytes(self.public.commitment),
            padlock=self.padlock,
            hints=tuple(hints) if hints else tuple(self.hints),
        )

    def own(self, name: str, arg: Any = None) -> Optional[dict]:
        """One of the Warden blueprint's own fields, ready to be asked.

        The argument encoded by what Article IX declares for it, and the type
        the answer reads by beside it — so a handle asks the far door's own
        being without holding the blueprint that door answers from.
        """
        declared = _FIELDS.get(name)
        if declared is None:
            return None
        types = [argument.type for argument in declared.arguments]
        try:
            blob = wire.encode_all(types, () if not types else (arg,), WARDEN_RECORDS)
        except wire.WireError:
            return None
        return {"args": blob, "answers": declared.answers, "records": WARDEN_RECORDS}

    def look(self, at: bytes, name: str, arg: Any = None) -> Any:
        """The four introspections, answered about a being under this warden.

        A handle keeps one shape wherever the being is, so a neighbour is shown
        exactly what a holder of a standing at that one being would be shown:
        the same estate, the same reach test, the same blueprint gate. Silence
        is silence here too, told inward the way the door tells it.
        """
        standing = Standing(
            voice=b"",
            commitment=b"",
            minted_at=self.name,
            beings=[bytes(at)],
        )
        try:
            if name == "describe":
                return self.estate(standing)
            if name == "sketch":
                being = self._reaches(standing, bytes(arg))
                if being is None:
                    raise Silence("a sketch of a being this voice does not reach")
                return self.sketch(being)
            if name == "blueprint":
                return self.blueprint_for(standing, bytes(arg))
            if name == "limit":
                return self.limit
        except Silence as bad:
            self._hush(str(bad))
        return None

    def stand(
        self, invitation: wire.Invitation, holder: Optional[bytes] = None
    ) -> Relation:
        """Remember an invitation as a row this ground may speak from.

        The heir is the voice: whoever minted it has seen the voice key, so the
        holder's first act is signed by the heir nobody else holds.

        **Kept whole means all five things Article VII names, the heir keypair
        included.** A rotation is signed by the heir and by nothing else, so a
        row that dropped it could rotate exactly once — on the first rotation
        the voice and the heir are one key, and on every one after they are
        not, which is why a caller side that has only ever rotated once is a
        caller side nobody has tested.
        """
        row = Relation(
            warden=bytes(invitation.warden),
            commitment=bytes(invitation.commitment),
            padlock=bytes(invitation.padlock),
            voice=bytes(invitation.heir),
            secret=bytes(invitation.heir_secret),
            heir=bytes(invitation.heir),
            heir_secret=bytes(invitation.heir_secret),
            hints=tuple(invitation.hints),
            holder=bytes(holder) if holder is not None else None,
        )
        self.outbound.append(row)
        return row

    def relation(self, far: bytes) -> Optional[Relation]:
        for row in self.outbound:
            if bytes(row.warden) == bytes(far):
                return row
        return None

    def note(self, row: Relation, being: bytes, commitment: bytes) -> None:
        """Keep the commitment a describe published for one being at a far house.

        A peer that means to believe that being's succession must keep it: the
        news arrives signed by a key this door has never seen, and the hash
        against this commitment is the only thing that recognises it.
        """
        row.beings[bytes(being)] = bytes(commitment)

    def handle(self, being: bytes) -> Optional[Relation]:
        """The relation down which this door reaches that far being."""
        for row in self.outbound:
            if bytes(being) in row.beings:
                return row
        return None

    def ask(
        self,
        row: Relation,
        ephemeral_secret: Optional[bytes] = None,
        being: Optional[bytes] = None,
        method: Optional[Mapping[str, Any]] = None,
        next_heir: Optional[bytes] = None,
        allowance: Optional[Mapping[str, int]] = None,
        seq: Optional[int] = None,
        leash: Optional[Leash] = None,
    ) -> tuple[bytes, int]:
        """Compose one say to the far door, and say what number it spent.

        ``leash`` is the call this ask is made in the course of, when it is
        one. A being standing in the middle of a chain hands its own leash
        straight back, and the allowance is read off it here, at the moment of
        sealing — which is the moment the message is handed onward, and the
        second of the two readings the dwell is the difference of. Present, it
        overrides ``allowance``, so a being under a leash cannot widen one even
        by mistake.

        ``next_heir`` is the **secret** of a key nobody has ever seen, and it
        makes this a rotation. The message is **signed by the heir and by
        nothing else**, because the heir is the only key the far door will take
        the standing over for and signing with the voice would present a
        standing's current holder as its own heir. The row ends standing on the
        key that just signed and keeping the secret behind the key it committed
        to, because nothing else in Quo carries it — a row that committed to a
        key it then threw away holds a standing it can never rotate again.

        ``seq`` is the number to spend, when the caller wants to choose it:
        Article VIII leaves that choice to the caller, because a fresh mark is
        empty and no door may require a first message to carry exactly one.
        Absent, the row counts on from what it last spent.
        """
        if ephemeral_secret is None:
            ephemeral_secret = self.mint()
        # An ask that could not be judged is not made: a hop count below zero
        # or a budget at or below zero is what the far door would meet with
        # silence, so the near door never spends a number on it.
        if leash is not None:
            allowance = leash.onward()
            if allowance is None:
                raise Silence("a leash that cannot be spent onward")

        # A rotation starts the far door's mark fresh, so every number at or
        # above one stands above it again; on an ordinary ask the floor is what
        # this relation has already spent, because per voice the number only
        # rises. The default counts on either way, which costs nothing: a
        # number above a fresh mark is honoured whatever it is.
        floor = 0 if next_heir is not None else row.seq
        if seq is None:
            seq = row.seq + 1
        elif seq <= floor:
            raise Silence("a number this relation has already spent")
        signer = row.secret
        if next_heir is not None:
            if not row.heir_secret:
                raise Silence("a relation with no heir cannot rotate")
            signer = row.heir_secret

        # An answer is paired to its ask by the padlock, the warden and the seq,
        # and by nothing else. Two asks out at once carrying the same three
        # would be answered indistinguishably, so this kit refuses to send the
        # second — the shape a rotation makes, because it starts the far door's
        # mark fresh and brings a number round again.
        pending = (bytes(self.padlock), seq)
        if pending in row.awaiting:
            raise Silence("an ask on that number is already awaiting an answer")

        record = {
            "voice": arithmetic.signing_public(signer),
            "recipient": row.warden,
            "commitment": (
                arithmetic.commitment(row.warden, arithmetic.signing_public(next_heir))
                if next_heir is not None
                else None
            ),
            "seq": seq,
            "padlock": self.padlock,
            "hints": list(self.hints),
            "allowance": dict(allowance) if allowance else {"time": 5000, "hops": 8},
            "being": being,
            "method": dict(method) if method is not None else None,
        }
        try:
            message = envelope.seal(
                envelope.SAY, record, signer, row.padlock, ephemeral_secret
            )
        except envelope.EnvelopeError as bad:
            raise Silence(str(bad)) from bad
        # There is an envelope: the key that just signed is the holder from
        # here on, the one committed to is the heir after it, and the row keeps
        # its secret because nothing else in Quo does.
        if next_heir is not None:
            row.voice, row.secret = arithmetic.signing_public(signer), signer
            row.heir, row.heir_secret = (
                arithmetic.signing_public(next_heir),
                next_heir,
            )
        row.seq = max(row.seq, seq) if next_heir is None else seq
        row.awaiting[pending] = None
        return message, seq

    def hear(self, message: bytes) -> dict:
        """Judge an answer at this caller's end — Article XII's shorter road.

        The envelope's half is the unseal, the leading byte and the signature
        verified against the ``warden`` the answer's own record carries. The
        two left are the caller's own bookkeeping, because only the caller
        knows what it asked: that warden must be a door this ground holds a
        relation with, and **an ask must be awaiting under that padlock, that
        warden and that seq**.

        An answer nothing awaits is the same silence as every other failure,
        and hearing one spends the record, so the same bytes never answer
        twice.
        """
        try:
            answer = envelope.unseal(self.padlock_secret, message, envelope.ANSWER)
        except envelope.EnvelopeError as bad:
            raise Silence(str(bad)) from bad
        return self.hear_record(answer)

    def hear_record(self, answer: dict) -> dict:
        """The caller's own two checks on an answer already opened.

        That warden must be a door this ground holds a relation with, and an
        ask must be awaiting under that padlock, that warden and that seq. The
        seal was opened once, at the one entry point, and never here.
        """
        pending = (bytes(self.padlock), answer["seq"])
        for row in self.outbound:
            if bytes(row.warden) != bytes(answer["warden"]):
                continue
            if pending in row.awaiting:
                settle = row.awaiting.pop(pending)
                if settle is not None and not settle.done():
                    settle.set_result(answer)
                return answer
        raise Silence("an answer nothing awaits")

    def forgo(self, row: Relation, seq: int) -> bool:
        """Stop awaiting an ask whose answer will never come.

        A road that failed to carry, or a caller that has stopped waiting.
        Nothing on the wire changes: the number stays spent, because a message
        the far door judged spent it there whatever this end does.
        """
        pending = (bytes(self.padlock), seq)
        if pending not in row.awaiting:
            return False
        settle = row.awaiting.pop(pending)
        if settle is not None and not settle.done():
            settle.set_result(None)
        return True

    # ------------------------------------------- what the closure spends
    #
    # Everything below is what a being reaches through ``obj.quo``, and what
    # a handle spends on its behalf. None of it is a judgment: permission
    # lives in the inbound record alone, and narrowing is done with beings.

    def leash(self, allowance: Mapping[str, int]) -> Leash:
        """The leash a call made from here is handed."""
        return Leash(
            dict(allowance),
            self.clock() if self.clock is not None else 0,
            self.clock,
        )

    def compose(
        self,
        row: Relation,
        seq: Optional[int] = None,
        allowance: Optional[Mapping[str, int]] = None,
        being: Optional[bytes] = None,
        method: Optional[Mapping[str, Any]] = None,
    ) -> Optional[bytes]:
        """One ask down a row, or nothing. The refusal is told inward only."""
        try:
            message, _ = self.ask(
                row, seq=seq, allowance=allowance, being=being, method=method
            )
            return message
        except Silence as bad:
            self._hush(str(bad))
            return None

    def awaiting(self, row: Relation, seq: int) -> None:
        """Mark an ask as awaiting again, for a caller resending the identical
        envelope after silence. The number stays what it was."""
        key = (bytes(self.padlock), seq)
        if key not in row.awaiting:
            row.awaiting[key] = None

    def pending(self, row: Relation, seq: int) -> Optional[Any]:
        """The future an awaiting ask settles on. Delivery never touches it: the
        road hands whatever comes back to :meth:`arrive`, and that settles it."""
        key = (bytes(self.padlock), seq)
        if key not in row.awaiting:
            return None
        settle = asyncio.get_running_loop().create_future()
        row.awaiting[key] = settle
        return settle

    async def settled(
        self, row: Relation, seq: int, settle: Optional[Any], deadline: Optional[int]
    ) -> Optional[dict]:
        """Wait for the answer, or for the caller's own budget to run out.

        The deadline is the caller's allowance and nothing the road promised: a
        road that never answers is the same silence as a door that refused.
        """
        if settle is None:
            return None
        if settle.done():
            return settle.result()
        try:
            return await asyncio.wait_for(
                asyncio.shield(settle), None if deadline is None else deadline / 1000
            )
        except (TimeoutError, asyncio.TimeoutError):
            self.forgo(row, seq)
            return None

    async def spend(
        self,
        row: Relation,
        seq: Optional[int] = None,
        being: Optional[bytes] = None,
        method: Optional[Mapping[str, Any]] = None,
        next_heir: Optional[bytes] = None,
        allowance: Optional[Mapping[str, int]] = None,
    ) -> Optional[dict]:
        """Compose one ask, hand it to delivery, and answer with what came back."""
        if self.delivery is None:
            return None
        try:
            message, spent = self.ask(
                row,
                being=being,
                method=method,
                next_heir=next_heir,
                allowance=allowance,
                seq=seq,
            )
        except Silence as bad:
            self._hush(str(bad))
            return None
        settle = self.pending(row, spent)
        view = {"padlock": bytes(row.padlock), "hints": tuple(row.hints)}
        back = await self.delivery.send(view, message)
        if back is None:
            self.forgo(row, spent)
        elif back is not CARRIED:
            await self.arrive(back)
        budget = dict(allowance or self.allowance)["time"]
        return await self.settled(row, spent, settle, budget)

    def standings_at(self, being: bytes) -> list:
        """Who holds a place at one being, as voices only.

        Marks, windows, padlocks and hints stay at the door: they are the
        door's bookkeeping and not social data. Copies only, so a being can
        never reach back into what the warden holds.
        """
        at = bytes(being)
        return [
            {"voice": bytes(row.voice)}
            for row in self.inbound
            if at in [bytes(one) for one in row.beings]
        ]

    def relation_at(self, label: str) -> Optional[Handle]:
        """A handle by its private label: a being minted beside this one, or a
        relation accepted under that label. Nothing resolves a label but this."""
        kept = self.labels.get(label)
        if kept is None:
            return None
        local = kept.get("local")
        if local is not None:
            held = self.beings.get(bytes(local))
            return LocalHandle(self, held) if held is not None else None
        return kept.get("handle")

    def grant_at(self, being: Optional[bytes]) -> Optional[wire.Invitation]:
        """Mint a voice, write the inbound row, hand out the invitation.

        A grant names the being it opens, and nothing else at this ground.
        """
        if being is None or bytes(being) not in self.beings:
            return None
        invitation = self.invite(bytes(being), self.mint(), self.mint())
        self.persist_soon()
        return invitation

    def amend_at(
        self,
        voice: bytes,
        add: Sequence[Optional[bytes]],
        remove: Sequence[Optional[bytes]],
    ) -> bool:
        """Add a being to a standing or take one away. Taking the last one away
        is release, and there is no separate act for it."""
        for standing in self.inbound:
            if bytes(standing.voice) != bytes(voice):
                continue
            beings = [bytes(one) for one in standing.beings]
            for one in add:
                if (
                    one is not None
                    and bytes(one) in self.beings
                    and bytes(one) not in beings
                ):
                    beings.append(bytes(one))
            for one in remove:
                if one is not None and bytes(one) in beings:
                    beings.remove(bytes(one))
            standing.beings = beings
            if not beings:
                self.inbound.remove(standing)
            self.persist_soon()
            return True
        return False

    def release_at(self, being: Optional[bytes]) -> bool:
        """Drop a being, and every standing at it goes with it."""
        if being is None:
            return False
        at = bytes(being)
        if self.beings.pop(at, None) is None:
            return False
        self.secrets.pop(at, None)
        self.heirs.pop(at, None)
        for standing in list(self.inbound):
            beings = [bytes(one) for one in standing.beings if bytes(one) != at]
            standing.beings = beings
            if not beings:
                self.inbound.remove(standing)
        for label, kept in list(self.labels.items()):
            if kept.get("local") is not None and bytes(kept["local"]) == at:
                del self.labels[label]
        self.persist_soon()
        return True

    async def _handles(self, row: Relation, estate: Any = None) -> list:
        """A handle per being a row reaches, read from the far door.

        The estate that door shows this voice is described, every being under
        it noted with its commitment, and each class's text fetched by digest.
        The far door's own public being is not one of them: it is shown to
        everyone and is not what any standing names.

        Ordered by the being's bytes ascending, the way Article X orders an
        estate — derived rather than chosen, so two runs hand back one order.
        """
        if estate is None:
            described = await self.spend(row, method={"name": "describe", "args": b""})
            estate = self._read_own(
                "describe", described.get("data") if described else None
            )
        found = []
        for klass in (estate or {"classes": []})["classes"]:
            for held in klass["beings"]:
                if bytes(held["being"]) == bytes(row.warden):
                    continue
                found.append((bytes(held["being"]), bytes(klass["digest"]), held))
        found.sort(key=lambda one: one[0])

        handles = []
        for pk, digest, held in found:
            text = self.blueprints.get(digest)
            if text is None:
                asked = await self.spend(
                    row,
                    method={
                        "name": "blueprint",
                        "args": wire.encode(
                            notation.Base("b32"), digest, WARDEN_RECORDS
                        ),
                    },
                )
                text = self._read_own("blueprint", asked.get("data") if asked else None)
                if not text:
                    continue
                self.blueprints[digest] = text
            self.note(row, pk, bytes(held["commitment"]))
            handles.append(RemoteHandle(self, row, pk, text))
        return handles

    def _label(self, label: Optional[str], row: Relation, handles: Sequence) -> None:
        """Keep a row under a private label. The label names the row, so the
        handle kept beside it is the first being the row reaches; the rest are
        re-read whenever the holder asks for them."""
        if label is None or not handles:
            return
        self.labels[label] = {
            "row": row,
            "being": bytes(handles[0].being),
            "digest": bytes(handles[0].digest),
            "handle": handles[0],
        }

    async def accept(
        self,
        invitation: wire.Invitation,
        label: Optional[str] = None,
        being: Optional[bytes] = None,
    ) -> tuple:
        """An invitation received as data, turned into handles.

        The double rotation is done here and is impossible to forget: until the
        holder has rotated to a key nobody else has seen, an invitation is a
        bearer secret, and whoever minted it is still a holder at its own door.

        After it, the estate is described and **a handle comes back per being
        the standing names**, each carrying the being it is at and what that
        being declares, so the holder tells them apart. An invitation that
        opened nothing answers with no handles at all.
        """
        if self.delivery is None:
            return ()
        row = self.stand(invitation, holder=being)
        voice_secret = self.mint()
        if await self.spend(row, next_heir=voice_secret) is None:
            self._abandon(row)
            return ()
        heir_secret = self.mint()
        second = await self.spend(row, next_heir=heir_secret)
        if second is None:
            self._abandon(row)
            return ()

        estate = self._read_own("describe", second.get("data"))
        handles = await self._handles(row, estate)
        if not handles:
            self._abandon(row)
            return ()
        self._label(label, row, handles)
        await self.persist()
        return tuple(handles)

    async def knock(
        self,
        card: wire.Card,
        label: Optional[str] = None,
        being: Optional[bytes] = None,
    ) -> Optional[Handle]:
        """A card received as data, turned into a handle at the far door's
        public being, held as a stranger.

        A fresh voice nobody granted anything, and a row standing on the four
        things the card carries. There is no rotation: a rotation takes a
        standing over, and a stranger holds none. What that door shows a
        stranger is what this handle asks it for, and the class it answers from
        is the one blueprint every ground in the world already holds.
        """
        if self.delivery is None:
            return None
        secret = self.mint()
        voice = arithmetic.signing_public(secret)
        row = Relation(
            warden=bytes(card.warden),
            commitment=bytes(card.commitment),
            padlock=bytes(card.padlock),
            # The voice and the heir are one key, because nothing here will ever
            # rotate: there is no standing at the far door to take over.
            voice=voice,
            secret=secret,
            heir=voice,
            heir_secret=secret,
            hints=tuple(card.hints),
            holder=bytes(being) if being is not None else None,
        )
        self.outbound.append(row)
        handle = RemoteHandle(self, row, bytes(card.warden), WARDEN_BLUEPRINT)
        self._label(label, row, [handle])
        await self.persist()
        return handle

    async def relations_at(self, label: str) -> tuple:
        """Every being a label's row reaches, read from the far door now.

        A standing widened by an amend at the far end is learned by asking, not
        by remembering: the row is described again and what was added comes
        back as an ordinary handle. A label on a being beside this one has
        nothing to re-read and answers with the handle it always had.
        """
        kept = self.labels.get(label)
        if kept is None:
            return ()
        if kept.get("local") is not None:
            handle = self.relation_at(label)
            return (handle,) if handle is not None else ()
        row = kept.get("row")
        if row is None:
            return ()
        handles = await self._handles(row)
        if handles:
            self._label(label, row, handles)
            await self.persist()
        return tuple(handles)

    def _abandon(self, row: Relation) -> None:
        self.outbound = [one for one in self.outbound if one is not row]
        return None

    def _read_own(self, field: str, data: Optional[bytes]) -> Any:
        """One of the warden's own fields, read out of an answer's data by the
        type the Warden blueprint declares for it."""
        declared = _FIELDS[field]
        if declared.answers is None or data is None:
            return None
        try:
            return wire.decode(declared.answers, bytes(data), WARDEN_RECORDS)
        except wire.WireError:
            return None

    # ------------------------------------------------------- the store

    def snapshot(self) -> dict:
        """Every fact a restart must not lose, as plain data.

        Beings are pointers and are not here: the host holds them again on the
        same seeds, and the rows find them by name.
        """
        return {
            "hints": list(self.hints),
            "blueprints": {
                digest.hex(): text for digest, text in self.blueprints.items()
            },
            "inbound": [
                {
                    "voice": row.voice.hex(),
                    "commitment": row.commitment.hex(),
                    "name": row.minted_at.hex(),
                    "beings": [bytes(one).hex() for one in row.beings],
                    "mark": row.mark,
                    "spent": sorted(row.spent),
                    "padlock": row.padlock.hex() if row.padlock is not None else None,
                    "hints": list(row.hints),
                }
                for row in self.inbound
            ],
            "outbound": [
                {
                    "warden": row.warden.hex(),
                    "commitment": row.commitment.hex(),
                    "padlock": row.padlock.hex(),
                    "voice": row.voice.hex(),
                    "secret": row.secret.hex(),
                    "heir": row.heir.hex(),
                    "heirSecret": row.heir_secret.hex(),
                    "seq": row.seq,
                    "news": row.news,
                    "hints": list(row.hints),
                    "holder": row.holder.hex() if row.holder is not None else None,
                    "beings": {
                        being.hex(): commitment.hex()
                        for being, commitment in row.beings.items()
                    },
                }
                for row in self.outbound
            ],
            "labels": [
                {
                    "label": label,
                    "local": kept["local"].hex() if kept.get("local") else None,
                    "warden": kept["row"].warden.hex() if kept.get("row") else None,
                    "being": kept["being"].hex() if kept.get("being") else None,
                    "digest": kept["digest"].hex() if kept.get("digest") else None,
                }
                for label, kept in self.labels.items()
            ],
        }

    async def persist(self) -> None:
        if self.store is None:
            return
        await self.store.save(self.snapshot())

    def persist_soon(self) -> None:
        """For the synchronous acts: the write is owed, not awaited."""
        if self.store is None:
            return
        try:
            asyncio.get_running_loop().create_task(self.persist())
        except RuntimeError:
            # No loop under us, which is a ground not running yet. The next
            # awaited act writes the same snapshot.
            pass

    async def restore(self) -> None:
        """Read back what a previous run left, so a restart keeps its word."""
        kept = await self.store.load()
        if not kept:
            return
        self.hints = tuple(kept["hints"])
        for digest, text in kept["blueprints"].items():
            self.blueprints[bytes.fromhex(digest)] = text
        for row in kept["inbound"]:
            self.inbound.append(
                Standing(
                    voice=bytes.fromhex(row["voice"]),
                    commitment=bytes.fromhex(row["commitment"]),
                    minted_at=bytes.fromhex(row["name"]),
                    beings=[bytes.fromhex(one) for one in row["beings"]],
                    mark=row["mark"],
                    spent=set(row["spent"]),
                    padlock=(
                        bytes.fromhex(row["padlock"])
                        if row["padlock"] is not None
                        else None
                    ),
                    hints=tuple(row["hints"]),
                )
            )
        for row in kept["outbound"]:
            self.outbound.append(
                Relation(
                    warden=bytes.fromhex(row["warden"]),
                    commitment=bytes.fromhex(row["commitment"]),
                    padlock=bytes.fromhex(row["padlock"]),
                    voice=bytes.fromhex(row["voice"]),
                    secret=bytes.fromhex(row["secret"]),
                    heir=bytes.fromhex(row["heir"]),
                    heir_secret=bytes.fromhex(row["heirSecret"]),
                    seq=row["seq"],
                    news=row["news"],
                    hints=tuple(row["hints"]),
                    holder=(
                        bytes.fromhex(row["holder"])
                        if row["holder"] is not None
                        else None
                    ),
                    beings={
                        bytes.fromhex(being): bytes.fromhex(commitment)
                        for being, commitment in row["beings"].items()
                    },
                )
            )
        for one in kept["labels"]:
            if one["local"] is not None:
                self.labels[one["label"]] = {"local": bytes.fromhex(one["local"])}
                continue
            row = self.relation(bytes.fromhex(one["warden"]))
            text = self.blueprints.get(bytes.fromhex(one["digest"]))
            if row is None or text is None:
                continue
            being = bytes.fromhex(one["being"])
            self.labels[one["label"]] = {
                "row": row,
                "being": being,
                "digest": bytes.fromhex(one["digest"]),
                "handle": RemoteHandle(self, row, being, text),
            }

    def amend(self, voice: bytes, beings: Sequence[bytes]) -> None:
        """A standing is amended, not replaced; taking the last being away is release."""
        for standing in self.inbound:
            if bytes(standing.voice) == bytes(voice):
                standing.beings = [bytes(one) for one in beings]
                if not standing.beings:
                    self.inbound.remove(standing)
                return
        raise Silence("no such standing")

    # -- Articles XIII and XIV, migrating a being away

    def expect(self, blueprint: str, make: Callable[[], Any]) -> bytes:
        """Arm this door for a class of being it is willing to take in.

        **A destination that does not already hold the class refuses the cargo
        in silence, and there is nobody it may ask** (Article IX). Holding the
        class means both halves: the text, so the digest identifies something,
        and the program an arriving being runs, because a cargo carries state
        and never code.
        """
        text = notation.render(notation.parse(blueprint))
        digest = notation.digest(text)
        self.blueprints[digest] = text
        self.arriving[digest] = make
        return digest

    def peers(self, being: bytes) -> list:
        """The rows that stand at one being: who must be told when it moves.

        The padlock and the roads are refreshed by every call that arrives, so
        a row read here is the freshest way back this door has. Ordered by the
        voice's bytes ascending, so a list of who is owed news does not differ
        between two runs.
        """
        at = bytes(being)
        return sorted(
            (row for row in self.inbound if at in [bytes(one) for one in row.beings]),
            key=lambda row: bytes(row.voice),
        )

    def forget(self, being: bytes, at: Optional[bytes] = None) -> int:
        """Drop the relations a being holds outward, and say how many went.

        ``at`` narrows it to one far warden, which is how a relation
        re-remembered at a house supersedes the one it replaces. Absent, all of
        them go — which is what a being leaving takes with it.
        """
        held = bytes(being)
        keeping = [
            row
            for row in self.outbound
            if not (
                row.holder is not None
                and bytes(row.holder) == held
                and (at is None or bytes(row.warden) == bytes(at))
            )
        ]
        dropped = len(self.outbound) - len(keeping)
        self.outbound = keeping
        return dropped

    def point(self, being: bytes, word: Mapping[str, Any]) -> None:
        """Publish the succession this door answers ``moved`` with.

        The name need not be a being here, and a door that required one could
        not point for the half of a migration that matters most: a destination
        points for the name the arriving being wore before, and that name is a
        being at no door any more.
        """
        self.pointers[bytes(being)] = dict(word)

    def pack(self, being: bytes, cells: Optional[bytes] = None) -> dict:
        """A migration's cargo, read off what this door holds for one being.

        Packed **under the name the first rotation gives the being**, which is
        its committed heir. Migration is one message sent twice: the first
        moves the being's identity to that heir and the second moves it on to
        the key the destination minted, so a cargo packed under the name the
        being wears here would leave the destination composing a succession of
        a name every peer has already succeeded past.

        Every list is ordered by the rule Article IX gives, and the order is
        derived rather than chosen: standings by the voice's bytes, relations
        by the far warden's, beings under a standing by their pk bytes, and
        spent numerically — all ascending. **A cargo crosses the wire, so two
        wardens packing one being must produce one byte string.**
        """
        at = bytes(being)
        held = self.beings.get(at)
        if held is None:
            raise Silence("no being of that name")
        heir_secret = self.heirs.get(at)
        if heir_secret is None:
            raise Silence("a being whose committed heir this door does not hold")
        heir = arithmetic.signing_public(heir_secret)
        standings = [
            {
                "voice": bytes(row.voice),
                "commitment": bytes(row.commitment),
                # The name the heir commitment was minted under travels with
                # the row. Without it a migrated standing could never verify an
                # older commitment again.
                "name": bytes(row.minted_at),
                "beings": [heir],
                "mark": row.mark,
                # The replay record travels whole: the mark and the spent
                # numbers beneath it. A mark alone would make the new door
                # either refuse everything at or below it — killing a caller
                # with asks in flight — or honour it all.
                "spent": sorted(row.spent),
                # The way back travels with the standing, or the destination
                # could not send the second news to the peers that arrived.
                "padlock": bytes(row.padlock) if row.padlock is not None else None,
                "hints": list(row.hints),
            }
            for row in self.peers(at)
        ]
        relations = [
            {
                "warden": bytes(row.warden),
                "commitment": bytes(row.commitment),
                "padlock": bytes(row.padlock),
                # **The voice's keys means both of them.** Carrying the current
                # voice alone would leave the being able to act once and never
                # able to rotate, and would leave the heir secret at a door
                # whose keys are all supposed to be dead.
                "voice": bytes(row.voice),
                "secret": bytes(row.secret),
                "heir": bytes(row.heir),
                "heirSecret": bytes(row.heir_secret),
                "seq": row.seq,
                # The mark kept for that far warden's news, which is its own
                # counter and never the one this door sends by.
                "news": row.news,
                "hints": list(row.hints),
            }
            for row in self.outbound
            if row.holder is not None and bytes(row.holder) == at
        ]
        return {
            "being": heir,
            "digest": bytes(held.digest),
            # What moves with a being is what the being itself says moves.
            "cells": held.state() if cells is None else bytes(cells),
            "standings": sorted(standings, key=lambda one: one["voice"]),
            "relations": sorted(relations, key=lambda one: one["warden"]),
        }

    def depart(
        self,
        being: bytes,
        commitment: bytes,
        name: bytes,
        padlock: bytes,
        hints: Sequence[str] = (),
    ) -> tuple:
        """The origin's half, after the cargo has landed.

        It publishes the succession of the being's committed heir — carrying as
        its next commitment the one ``receive`` answered, which is the one fact
        the origin cannot invent — and stops acting on the being's behalf for
        good. It hands back the word, the secret that signs the first news, and
        the peers owed it.

        **After the double rotation every key the old warden held for this
        being is dead**, so this door drops the being itself: its cells are its
        own memory and its heir is the key the first news spends, and a door
        that kept either would be holding what it has just announced it no
        longer holds. The standings stay, so a peer still reaches the door and
        is pointed.
        """
        at = bytes(being)
        held = self.beings.get(at)
        heir_secret = self.heirs.get(at)
        if held is None or heir_secret is None:
            raise Silence("no being of that name")
        successor = arithmetic.signing_public(heir_secret)
        # The peer believes the succession by hashing the successor against the
        # commitment it holds, so a key this door never committed to would
        # compose news nobody can believe.
        if arithmetic.commitment(self.name, successor) != bytes(held.commitment):
            raise Silence("a being whose heir is not the one it committed to")
        word = {
            "being": at,
            "successor": successor,
            "commitment": bytes(commitment),
            # Where it answers has changed, so the word says so, and the peer
            # rewrites its row entire from it.
            "name": bytes(name),
            "padlock": bytes(padlock),
            "hints": list(hints),
        }
        told = self.peers(at)
        # The relations went with the cargo, so the old door holds no voice of
        # the being's any more and can spend nothing on its behalf.
        self.forget(at)
        del self.beings[at]
        del self.heirs[at]
        self.secrets.pop(at, None)
        self.point(at, word)
        return word, heir_secret, told

    def landed(self, hints: Sequence[str] = ()) -> tuple:
        """The destination's half, once a cargo has been taken in.

        The word is composed by the kit and not by the host: a house that took
        a cargo in and then had to invent the announcement would invent a
        different one at every ground. The roads are handed in, as they are for
        a card, a grant and an ask, because a door does not know where it
        stands until something stands it up.

        **The new door points as well** (Article XIII), for the name the being
        wore before, with the word its own arrival composed — so the word a
        peer hears and the word a peer gets by asking are the identical bytes.
        """
        if self.arrived is None:
            raise Silence("nothing has landed here")
        was, pk, voices = self.arrived
        held = self.beings[pk]
        word = {
            "being": was,
            "successor": pk,
            "commitment": bytes(held.commitment),
            "name": self.name,
            "padlock": self.padlock,
            "hints": list(hints),
        }
        self.point(was, word)
        arrived = set(voices)
        told = [row for row in self.peers(pk) if bytes(row.voice) in arrived]
        # The being's own key signs the second news: the peer holds the hash of
        # it from the first, so it is the one key the peer can believe it from.
        return word, self.secrets[pk], told

    def news(
        self,
        peer: Standing,
        voice_secret: bytes,
        word: Mapping[str, Any],
        seq: int,
        ephemeral_secret: bytes,
        allowance: Optional[Mapping[str, int]] = None,
    ) -> bytes:
        """Compose one piece of news for one peer.

        It is an ordinary envelope judged at the peer's door by the same steps
        as any ask. **What makes it news is only where its voice is found**: in
        the peer's outbound record rather than its inbound one. News names no
        being, because that placement is the whole of what makes it news.

        The recipient is the padlock. An inbound row keeps the padlock the peer
        named and never that peer's warden name — a door never learns the house
        behind a voice — and a padlock is per door, so it binds the message to
        one door exactly as a name would.
        """
        if peer.padlock is None:
            # A peer that has never spoken left no way back. It is reached by
            # the only means left: it eventually asks, and the door tells it.
            raise Silence("a peer that left no way back")
        record = {
            "voice": arithmetic.signing_public(voice_secret),
            "recipient": bytes(peer.padlock),
            "commitment": None,
            "seq": seq,
            "padlock": self.padlock,
            "hints": list(self.hints),
            "allowance": dict(allowance) if allowance else {"time": 5000, "hops": 8},
            "being": None,
            "method": {
                "name": "tell",
                "args": wire.encode(WORD_TYPE, dict(word), WARDEN_RECORDS),
            },
        }
        spend_leash(record["allowance"])
        try:
            return envelope.seal(
                envelope.SAY,
                record,
                voice_secret,
                bytes(peer.padlock),
                ephemeral_secret,
            )
        except envelope.EnvelopeError as bad:
            raise Silence(str(bad)) from bad
