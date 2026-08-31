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

import secrets
from dataclasses import dataclass, field
from typing import Any, Callable, Mapping, Optional, Sequence

from . import arithmetic, envelope, notation, wire

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
    "Being",
    "Standing",
    "Relation",
    "Accepted",
    "Judgment",
    "Warden",
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


# ------------------------------------------------------------------ the records


@dataclass
class Being:
    """One being this warden holds: its keys, its class, and how it is invoked."""

    pk: bytes
    digest: bytes
    commitment: bytes
    invoke: Optional[Callable[[str, bytes], Optional[bytes]]] = None
    cells: bytes = b""


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

    ``news`` is the door's own bookkeeping and does not travel — the
    ``relation`` record the blueprint declares has no field for it yet.
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


@dataclass
class Accepted:
    """What spending an invitation whole leaves the holder standing on.

    ``row`` is the relation this ground now speaks from. ``voice`` and
    ``heir`` are keys the granter has never seen, which is the whole point.
    """

    row: Relation
    far: bytes
    voice: bytes
    secret: bytes
    heir: bytes
    heir_secret: bytes
    commitment: bytes
    opening: Optional[bytes]
    answer: Optional[bytes]
    seq: int


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

    def __init__(
        self,
        name_secret: bytes,
        padlock_secret: bytes,
        window: int = 64,
        limit: int = 65536,
        mint: Callable[[], bytes] = _mint,
        heir: Optional[bytes] = None,
    ) -> None:
        self.name_secret = name_secret
        self.name = arithmetic.signing_public(name_secret)
        self.padlock_secret = padlock_secret
        self.padlock = arithmetic.sealing_public(padlock_secret)
        self.window = window
        self.limit = limit
        self.mint = mint
        #: The roads this ground can be reached on, which every say it composes
        #: and every invitation it mints carries. A ground that publishes none
        #: is reachable only down a line it opened.
        self.hints: tuple = ()
        self.beings: dict = {}
        self.blueprints: dict = {WARDEN_DIGEST: WARDEN_BLUEPRINT}
        self.inbound: list = []
        self.outbound: list = []
        self.pointers: dict = {}
        self.heirs: dict = {}
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
        voice = bytes(say["voice"])
        for standing in self.inbound:
            if bytes(standing.voice) == voice:
                if say["commitment"] is not None:
                    raise Silence("a plain ask carrying a commitment")
                return ASK, standing
        for standing in self.inbound:
            if arithmetic.commitment(standing.minted_at, voice) == bytes(
                standing.commitment
            ):
                if say["commitment"] is None:
                    raise Silence("a rotation carrying no fresh commitment")
                standing.voice = voice
                standing.commitment = bytes(say["commitment"])
                standing.minted_at = self.name
                standing.mark = 0
                standing.spent = set()
                return ROTATION, standing
        for relation in self.outbound:
            if bytes(relation.warden) == voice or arithmetic.commitment(
                relation.warden, voice
            ) == bytes(relation.commitment):
                return NEWS, relation
        return STRANGER, None

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
            return self._blueprint(standing, bytes(args[0]))
        if name == "limit":
            return wire.encode(notation.Base("int"), self.limit, WARDEN_RECORDS)
        if name == "tell":
            assert row is not None
            self._believe(row, args[0], voice)
            return None
        if name == "moved":
            word = self.pointers.get(bytes(args[0]))
            return wire.encode(notation.Maybe(WORD_TYPE), word, WARDEN_RECORDS)
        return wire.encode(notation.Base("b32"), self._receive(args[0]), WARDEN_RECORDS)

    def _blueprint(self, standing: Optional[Standing], digest: bytes) -> bytes:
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
        return wire.encode(notation.Maybe(notation.Base("text")), text, WARDEN_RECORDS)

    def _receive(self, cargo: Mapping[str, Any]) -> bytes:
        """A migration's state transfer, answered with a commitment nobody has seen.

        The digest identifies rather than delivers: a destination that does not
        already hold that class refuses the cargo in silence.
        """
        digest = bytes(cargo["digest"])
        if digest not in self.blueprints:
            raise Silence("a cargo of a class this door does not hold")
        heir_secret = self.mint()
        heir = arithmetic.signing_public(heir_secret)
        commitment = arithmetic.commitment(self.name, heir)
        pk = bytes(cargo["being"])
        self.beings[pk] = Being(
            pk=pk, digest=digest, commitment=commitment, cells=bytes(cargo["cells"])
        )
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
                    beings=[bytes(one) for one in row["beings"]],
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
                )
            )
        return commitment

    # -- Article XIV, believing the news

    def _believe(self, row: Relation, word: Mapping[str, Any], voice: bytes) -> None:
        """A peer believes it by a key it already holds, and there are only two."""
        if word["being"] is not None and bytes(word["being"]) == bytes(row.warden):
            raise Silence("a word naming the warden's own pk in being")
        succession = word["successor"] is not None
        if succession:
            if word["commitment"] is None:
                raise Silence("a succession carrying no next commitment")
            if bytes(word["successor"]) != bytes(voice):
                raise Silence("a succession the successor did not sign")
            if arithmetic.commitment(row.warden, voice) != bytes(row.commitment):
                raise Silence("a successor that was not named in advance")
            row.commitment = bytes(word["commitment"])
            if word["being"] is None:
                row.warden = bytes(word["successor"])
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

    def judge(
        self, message: bytes, clock: Optional[Callable[[], int]] = None
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
        placement, row = self._place(say)

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

        # 6 — spend the leash.
        spend_leash(say["allowance"])

        # 7 — route.
        data = self._route(say, placement, standing, relation, voice)

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

    def _route(
        self,
        say: Mapping[str, Any],
        placement: str,
        standing: Optional[Standing],
        relation: Optional[Relation],
        voice: bytes,
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
            )
        if placement == NEWS:
            raise Silence("news reaches nothing but tell")
        if being.invoke is None:
            raise Silence("a being that answers nothing")
        return being.invoke(method["name"], bytes(method["args"]))

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

    def hold(
        self,
        blueprint: str,
        invoke: Callable[[str, bytes], Optional[bytes]],
        secret: bytes,
        heir_secret: bytes,
    ) -> bytes:
        """Put up a being of this ground's own, and hold its class text.

        The text is kept canonical, so the blueprint a stranger fetches hashes
        back to the digest the estate named it by.
        """
        text = notation.render(notation.parse(blueprint))
        digest = notation.digest(text)
        self.blueprints[digest] = text
        pk = arithmetic.signing_public(secret)
        heir = arithmetic.signing_public(heir_secret)
        self.beings[pk] = Being(
            pk=pk,
            digest=digest,
            commitment=arithmetic.commitment(self.name, heir),
            invoke=invoke,
        )
        self.heirs[pk] = heir_secret
        return pk

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

    def stand(self, invitation: wire.Invitation) -> Relation:
        """Remember an invitation as a row this ground may speak from.

        The heir is the voice: whoever minted it has seen the voice key, so the
        holder's first act is signed by the heir nobody else holds.
        """
        row = Relation(
            warden=bytes(invitation.warden),
            commitment=bytes(invitation.commitment),
            padlock=bytes(invitation.padlock),
            voice=bytes(invitation.heir),
            secret=bytes(invitation.heir_secret),
            heir=b"",
            heir_secret=b"",
            hints=tuple(invitation.hints),
        )
        self.outbound.append(row)
        return row

    def relation(self, far: bytes) -> Optional[Relation]:
        for row in self.outbound:
            if bytes(row.warden) == bytes(far):
                return row
        return None

    def ask(
        self,
        row: Relation,
        ephemeral_secret: bytes,
        being: Optional[bytes] = None,
        method: Optional[Mapping[str, Any]] = None,
        next_heir: Optional[bytes] = None,
        allowance: Optional[Mapping[str, int]] = None,
        seq: Optional[int] = None,
    ) -> tuple[bytes, int]:
        """Compose one say to the far door, and say what number it spent.

        ``next_heir`` makes it a rotation: the fresh commitment names a key
        nobody has seen, and the row keeps the secret behind it.
        """
        if seq is None:
            row.seq += 1
            seq = row.seq
        record = {
            "voice": arithmetic.signing_public(row.secret),
            "recipient": row.warden,
            "commitment": (
                arithmetic.commitment(row.warden, next_heir)
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
                envelope.SAY, record, row.secret, row.padlock, ephemeral_secret
            )
        except envelope.EnvelopeError as bad:
            raise Silence(str(bad)) from bad
        return message, seq

    def hear(self, message: bytes) -> dict:
        """Open an answer sealed to this ground's padlock, or refuse it.

        The signature is checked against the warden the answer names; whether
        that is the warden this ground asked is the caller's own to judge.
        """
        try:
            return envelope.unseal(self.padlock_secret, message, envelope.ANSWER)
        except envelope.EnvelopeError as bad:
            raise Silence(str(bad)) from bad

    def accept(
        self,
        invitation: wire.Invitation,
        send: Callable[[bytes], Optional[bytes]],
        being: Optional[bytes] = None,
        method: Optional[Mapping[str, Any]] = None,
        allowance: Optional[Mapping[str, int]] = None,
    ) -> Accepted:
        """Spend an invitation whole, which costs two rotate-and-asks.

        **An invitation is spent, not held.** Whoever minted it has seen both
        the voice and the heir behind it, so a holder standing on either is a
        holder the granter can still speak as at its own door. Only a key this
        ground generated ends that, and reaching one takes two rotations:
        forgetting the second is the mistake this helper exists to make
        unmakeable.

        The first is signed by the invitation's heir — the only key the
        granting door will take the standing over for — and commits to a fresh
        voice nobody else has seen. The second is signed by that voice, commits
        to a fresh heir, and carries the caller's own ask. After it, every key
        the granter ever held for this standing is dead.

        Both keys are minted here rather than handed in, because a caller that
        could supply them is a caller that could supply one it did not
        generate. ``send`` is the road: one envelope out, the sealed answer or
        ``None`` back.

        **Nothing here is wire.** It is :meth:`stand` and :meth:`ask` composed,
        and that raw path stays open for a caller that wants the steps. The two
        numbers spent are the row's own, running on from one: a rotation starts
        the far door's mark fresh, and Article VIII leaves which number a caller
        opens with, above one, to the caller.
        """
        if not callable(send):
            raise Silence("accepting an invitation needs a road")

        row = self.stand(invitation)
        voice_secret = self.mint()
        voice = arithmetic.signing_public(voice_secret)

        # The heir signs, and commits to a voice the granter has never seen.
        first, _ = self.ask(row, self.mint(), next_heir=voice)
        opening = send(first)

        # That voice now stands, and commits to a fresh heir beside it.
        row.voice, row.secret = voice, voice_secret
        heir_secret = self.mint()
        heir = arithmetic.signing_public(heir_secret)
        second, seq = self.ask(
            row,
            self.mint(),
            being=being,
            method=method,
            next_heir=heir,
            allowance=allowance,
        )
        answer = send(second)
        row.heir, row.heir_secret = heir, heir_secret

        return Accepted(
            row=row,
            far=bytes(invitation.warden),
            voice=voice,
            secret=voice_secret,
            heir=heir,
            heir_secret=heir_secret,
            commitment=arithmetic.commitment(row.warden, heir),
            opening=opening,
            answer=answer,
            seq=seq,
        )

    def amend(self, voice: bytes, beings: Sequence[bytes]) -> None:
        """A standing is amended, not replaced; taking the last being away is release."""
        for standing in self.inbound:
            if bytes(standing.voice) == bytes(voice):
                standing.beings = [bytes(one) for one in beings]
                if not standing.beings:
                    self.inbound.remove(standing)
                return
        raise Silence("no such standing")
