"""One suite of judgments, driven over every road this kit has.

Article III makes the carriage a road and nothing more, and its distance-zero
paragraph says the one thing that matters here: **distance zero waives no step
of the judgment.** A road that skipped a step for being local would have
rebuilt the ambient permission the law exists to end, and a road that skipped
one for being framed would be no better.

So the judgments are written once and driven three times — over the common
carriage, over the line, and at distance zero. A step spent on one road and
waived on another is a red rather than an absence, which is the whole reason
this file exists as one suite instead of three.

Each road is asked for one thing: hand these bytes to that door and give back
what came out, empty for silence. How it does that — a POST, a frame, a call —
is the road's own affair and the judgment never learns which one it was.

The sockets are real. The carriage binds an ephemeral loopback port and the
line binds another; distance zero binds nothing, because there is nothing to
bind.
"""

import socket
import unittest

import test_warden as pins
from quo import arithmetic, call, carriage, envelope, line, notation, warden, wire

SILENCE = b""

#: A second padlock, held by nobody in this suite, so an answer can be proved
#: to refuse a reader it was not sealed to.
OTHER_PADLOCK_SECRET = pins.seed(12)

#: How long a road waits before calling nothing an answer. Silence has no wire
#: form on a line, so there is nothing to wait for but the clock.
PATIENCE = 0.4


def forged(door: warden.Warden) -> bytes:
    """A say carrying a voice that holds a standing, signed by a key that does
    not. Only step 2 can catch this: every other field is honest."""
    record = {
        "voice": pins.VOICE,
        "recipient": door.name,
        "commitment": None,
        "seq": 1,
        "padlock": pins.CALLER_PADLOCK,
        "hints": [],
        "allowance": {"time": 1000, "hops": 4},
        "being": pins.BEING_PK,
        "method": pins.method("lit"),
    }
    return envelope.seal(
        envelope.SAY, record, pins.OTHER_SECRET, door.padlock, pins.EPHEMERAL
    )


def an_answer_shaped_message(door: warden.Warden) -> bytes:
    """A well-sealed envelope whose leading byte says ``answer``. At a door
    that byte must say ``say``, and step 1 is where it is caught."""
    return envelope.seal(
        envelope.ANSWER,
        {"warden": pins.VOICE, "seq": 1, "data": b"lit"},
        pins.VOICE_SECRET,
        door.padlock,
        pins.EPHEMERAL,
    )


# ------------------------------------------------------------------ the roads


class ARoad:
    """What every road owes this suite: bytes to the door, bytes back."""

    def raise_door(self, case: unittest.TestCase, door: warden.Warden) -> None:
        raise NotImplementedError

    def send(self, message: bytes) -> bytes:
        raise NotImplementedError


def judging(door: warden.Warden):
    def judge(message: bytes):
        try:
            return door.judge(message).answer
        except pins.warden.Silence:
            return None

    return judge


class TheCommonCarriage(ARoad):
    """Article III: one POST, bytes in and bytes out; an empty body is
    silence's wire form."""

    def raise_door(self, case: unittest.TestCase, door: warden.Warden) -> None:
        judge = judging(door)
        try:
            self.door = carriage.Door(judge, limit=door.limit).start()
        except OSError as bad:  # pragma: no cover - only if loopback is unusable
            case.skipTest(f"no loopback socket: {bad}")
        case.addCleanup(self.door.close)

    def send(self, message: bytes) -> bytes:
        return carriage.post(self.door.hint, message)


class TheLine(ARoad):
    """Article III: framed envelopes over one persistent connection; silence
    has no wire form, so nothing comes back at all."""

    def raise_door(self, case: unittest.TestCase, door: warden.Warden) -> None:
        judge = judging(door)
        try:
            self.listener = line.Listener(
                lambda _road, message: judge(message), cap=door.limit
            ).start()
        except OSError as bad:  # pragma: no cover
            case.skipTest(f"no loopback socket: {bad}")
        case.addCleanup(self.listener.close)
        self.opened = line.dial(self.listener.hint, timeout=5)
        self.opened.cap = door.limit
        case.addCleanup(self.opened.close)

    def send(self, message: bytes) -> bytes:
        self.opened.socket.settimeout(PATIENCE)
        self.opened.send(message)
        try:
            return self.opened.receive() or SILENCE
        except (TimeoutError, socket.timeout):
            return SILENCE
        finally:
            self.opened.socket.settimeout(5)


class DistanceZero(ARoad):
    """Article III: the carriage is a call, and it waives no step."""

    def raise_door(self, case: unittest.TestCase, door: warden.Warden) -> None:
        self.door = call.Door(judging(door), limit=door.limit).start()
        case.addCleanup(self.door.close)

    def send(self, message: bytes) -> bytes:
        return call.post(self.door, message)


# -------------------------------------------------------------- the judgments


class TheJudgment:
    """Article XII, in order, over whichever road the subclass raised.

    Every failure is the same failure — the door answers with silence and never
    says which step it was — and that must be as true of a call between two
    houses in one process as it is of a POST across the world.
    """

    road: type

    def setUp(self) -> None:
        self.warden = pins.a_warden()
        self.standing = self.warden.grant(
            pins.VOICE,
            arithmetic.commitment(self.warden.name, pins.HEIR),
            [pins.BEING_PK],
        )
        self.road = type(self).road()
        self.road.raise_door(self, self.warden)

    def say(self, **over) -> bytes:
        kwargs = {"being": pins.BEING_PK, "call": pins.method("lit")}
        kwargs.update(over)
        return pins.say(self.warden, **kwargs)

    def send(self, message: bytes) -> bytes:
        return self.road.send(message)

    # -- what passes

    def test_xii_an_ask_that_passes_every_step_comes_back_sealed_and_signed(
        self,
    ) -> None:
        answer = pins.opened(self.send(self.say(seq=1)))
        self.assertEqual(answer["warden"], self.warden.name)
        self.assertEqual(answer["seq"], 1)
        self.assertEqual(answer["data"], b"lit")

    def test_xii_the_being_answers_and_never_learns_the_road(self) -> None:
        """Steps 1 through 6 are the warden's alone. The object behind the door
        is the same object on every road, and it is handed the same bytes."""
        seen = []
        self.warden.beings[pins.BEING_PK].invoke = lambda name, args, leash: (
            seen.append((name, args)) or b"lit"
        )
        self.assertEqual(pins.opened(self.send(self.say(seq=1)))["data"], b"lit")
        self.assertEqual(seen, [("lit", b"")])

    # -- step 1: unseal, and the leading byte

    def test_xii_1_bytes_that_do_not_unseal_are_silence(self) -> None:
        self.assertEqual(self.send(b"\x00" * 200), SILENCE)

    def test_xii_1_at_a_door_the_leading_byte_must_say_say(self) -> None:
        self.assertEqual(self.send(an_answer_shaped_message(self.warden)), SILENCE)

    def test_xii_1_an_envelope_sealed_to_another_padlock_is_silence(self) -> None:
        """Sealed correctly, to the wrong house. Nothing local about a road
        makes a door able to open it."""
        elsewhere = arithmetic.sealing_public(OTHER_PADLOCK_SECRET)
        record = {
            "voice": pins.VOICE,
            "recipient": self.warden.name,
            "commitment": None,
            "seq": 1,
            "padlock": pins.CALLER_PADLOCK,
            "hints": [],
            "allowance": {"time": 1000, "hops": 4},
            "being": pins.BEING_PK,
            "method": pins.method("lit"),
        }
        sealed = envelope.seal(
            envelope.SAY, record, pins.VOICE_SECRET, elsewhere, pins.EPHEMERAL
        )
        self.assertEqual(self.send(sealed), SILENCE)

    # -- step 2: verify the signature

    def test_xii_2_a_payload_signed_by_a_key_the_voice_does_not_own_is_silence(
        self,
    ) -> None:
        self.assertEqual(self.send(forged(self.warden)), SILENCE)

    # -- step 3: check the recipient

    def test_xii_3_a_payload_addressed_elsewhere_is_silence(self) -> None:
        self.assertEqual(self.send(self.say(seq=1, recipient=pins.OTHER)), SILENCE)

    def test_xii_3_a_payload_addressed_elsewhere_never_touches_the_records(
        self,
    ) -> None:
        """Here and not later: the number it carried must still be spendable."""
        self.assertEqual(self.send(self.say(seq=1, recipient=pins.OTHER)), SILENCE)
        self.assertEqual(pins.opened(self.send(self.say(seq=1)))["seq"], 1)

    # -- step 4: place the voice

    def test_xii_4_a_voice_at_nothing_gets_the_strangers_case(self) -> None:
        """Not silence — the describe of what the warden's own public being
        exposes. A road that turned every unknown voice away would be refusing
        what the law grants."""
        stranger = pins.say(
            self.warden, secret=pins.OTHER_SECRET, seq=1, being=None, call=None
        )
        answer = pins.opened(self.send(stranger))
        estate = wire.decode(warden.ESTATE_TYPE, answer["data"], warden.WARDEN_RECORDS)
        digests = [bytes(one["digest"]) for one in estate["classes"]]
        self.assertEqual(digests, [warden.WARDEN_DIGEST])

    def test_xiii_a_rotation_changes_the_standing_before_anything_else_is_judged(
        self,
    ) -> None:
        """The old key dies on every road. A local road that let a retired voice
        keep speaking would be the ambient permission this law ends."""
        fresh = arithmetic.signing_public(pins.seed(13))
        rotation = pins.say(
            self.warden,
            secret=pins.HEIR_SECRET,
            seq=1,
            commitment=arithmetic.commitment(self.warden.name, fresh),
            being=pins.BEING_PK,
            call=pins.method("lit"),
        )
        self.assertEqual(pins.opened(self.send(rotation))["data"], b"lit")
        # The key that held the standing a moment ago now holds nothing, and a
        # voice at nothing reaches no granted being.
        self.assertEqual(self.send(self.say(seq=2, being=pins.BEING_PK)), SILENCE)

    # -- step 5: spend the seq

    def test_xii_5_a_number_already_spent_is_silence(self) -> None:
        spoken = self.say(seq=1)
        self.assertTrue(self.send(spoken))
        self.assertEqual(self.send(spoken), SILENCE)

    def test_xii_5_the_seq_is_spent_at_the_door_and_the_window_moves(self) -> None:
        self.assertEqual(pins.opened(self.send(self.say(seq=1)))["seq"], 1)
        self.assertEqual(pins.opened(self.send(self.say(seq=2)))["seq"], 2)
        self.assertEqual(self.send(self.say(seq=1)), SILENCE)
        self.assertEqual(pins.opened(self.send(self.say(seq=3)))["seq"], 3)

    def test_viii_a_number_below_the_window_is_silence(self) -> None:
        far = self.warden.window * 2
        self.assertEqual(pins.opened(self.send(self.say(seq=far)))["seq"], far)
        self.assertEqual(self.send(self.say(seq=far - self.warden.window)), SILENCE)

    def test_viii_the_first_legal_number_is_one(self) -> None:
        self.assertEqual(self.send(self.say(seq=0)), SILENCE)

    def test_viii_a_number_refused_at_routing_has_still_been_spent(self) -> None:
        """Honoured means consumed, and nothing later gives it back. A road
        that replayed a refused number would be handing one back."""
        self.assertEqual(self.send(self.say(seq=1, being=pins.OTHER)), SILENCE)
        self.assertEqual(self.send(self.say(seq=1)), SILENCE)

    # -- step 6: spend the leash

    def test_viii_a_hop_count_below_zero_is_silence(self) -> None:
        self.assertEqual(self.send(self.say(seq=1, hops=-1)), SILENCE)

    def test_viii_a_hop_count_of_zero_is_a_legal_leash_that_goes_no_further(
        self,
    ) -> None:
        self.assertEqual(
            pins.opened(self.send(self.say(seq=1, hops=0)))["data"], b"lit"
        )

    def test_viii_a_time_budget_at_or_below_zero_is_silence(self) -> None:
        self.assertEqual(self.send(self.say(seq=1, time=0)), SILENCE)

    # -- step 7: route

    def test_xii_7_a_being_this_voice_does_not_reach_is_silence(self) -> None:
        self.assertEqual(self.send(self.say(seq=1, being=pins.OTHER)), SILENCE)

    def test_xii_7_being_and_no_method_is_the_describe_of_that_one_being(
        self,
    ) -> None:
        answer = pins.opened(self.send(self.say(seq=1, call=None)))
        sketch = wire.decode(
            notation.Maybe(warden.SKETCH_TYPE), answer["data"], warden.WARDEN_RECORDS
        )
        self.assertEqual(bytes(sketch["being"]), pins.BEING_PK)

    # -- step 8: answer

    def test_xii_8_the_answer_is_sealed_to_the_return_padlock_the_ask_carried(
        self,
    ) -> None:
        sealed = self.send(self.say(seq=1))
        with self.assertRaises(envelope.EnvelopeError):
            envelope.unseal(OTHER_PADLOCK_SECRET, sealed, envelope.ANSWER)
        self.assertEqual(pins.opened(sealed)["data"], b"lit")

    def test_xii_every_failure_is_the_same_failure_and_says_no_step(self) -> None:
        """One fault per step, and the road hands back the same nothing for
        every one of them. A road that distinguished them would be telling a
        stranger which step it reached."""
        faults = [
            b"\x00" * 200,
            an_answer_shaped_message(self.warden),
            forged(self.warden),
            self.say(seq=1, recipient=pins.OTHER),
            self.say(seq=0),
            self.say(seq=1, hops=-1),
            self.say(seq=2, time=0),
            self.say(seq=3, being=pins.OTHER),
        ]
        self.assertEqual([self.send(one) for one in faults], [SILENCE] * len(faults))


class TheJudgmentOnTheCommonCarriage(TheJudgment, unittest.TestCase):
    road = TheCommonCarriage


class TheJudgmentOnTheLine(TheJudgment, unittest.TestCase):
    road = TheLine


class TheJudgmentAtDistanceZero(TheJudgment, unittest.TestCase):
    road = DistanceZero


class EveryRoadThisKitHasIsDriven(unittest.TestCase):
    """A road added without joining this suite would be a road nobody proved
    spends the judgment, which is the failure the whole file is against."""

    def test_iii_the_three_carriages_each_run_the_same_judgments(self) -> None:
        driven = {
            case.road
            for case in (
                TheJudgmentOnTheCommonCarriage,
                TheJudgmentOnTheLine,
                TheJudgmentAtDistanceZero,
            )
        }
        self.assertEqual(driven, {TheCommonCarriage, TheLine, DistanceZero})
        judgments = {name for name in vars(TheJudgment) if name.startswith("test_")}
        for case in (
            TheJudgmentOnTheCommonCarriage,
            TheJudgmentOnTheLine,
            TheJudgmentAtDistanceZero,
        ):
            with self.subTest(road=case.road.__name__):
                self.assertEqual(
                    {n for n in dir(case) if n.startswith("test_")}, judgments
                )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
