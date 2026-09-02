"""The warden, judged against the corpus and against the articles themselves.

``warden.json`` carries two vectors: the blueprint every warden holds with its
digest, and the derived order of an estate. Everything else the door does —
the judgment's steps and their order, the window, the leash, the describes,
what a standing spends and when — is asserted from the constitution alone.

Every test is named for the article and the clause it pins, so a reader can
tell coverage from a test list.
"""

import asyncio
import json
import pathlib
import unittest

from quo import arithmetic, envelope, notation, warden, wire


def judged(door: "warden.Warden", *args, **kwargs) -> warden.Judgment:
    """One judgment, run to completion.

    The judgment is asynchronous because a being in the middle of a chain
    reaches another house before it answers. These cases reach nowhere, so a
    loop of their own is the whole of what running one costs.
    """
    return asyncio.run(door.judge(*args, **kwargs))


VECTORS = pathlib.Path(__file__).resolve().parents[2] / "js" / "vectors" / "warden.json"

BLUEPRINT_SHAPE = {"name", "law", "blueprint", "canonical", "digest"}
ORDER_SHAPE = {"name", "law", "blueprint", "unordered", "value", "bytes"}


def load() -> dict:
    with VECTORS.open(encoding="utf-8") as handle:
        return json.load(handle)


def seed(byte: int) -> bytes:
    return bytes([byte]) * arithmetic.KEY_LENGTH


NAME_SECRET = seed(1)
PADLOCK_SECRET = seed(2)
VOICE_SECRET = seed(3)
HEIR_SECRET = seed(4)
OTHER_SECRET = seed(5)
EPHEMERAL = seed(6)
CALLER_PADLOCK_SECRET = seed(7)
WARDEN_HEIR_SECRET = seed(8)
FAR_NAME_SECRET = seed(9)
FAR_HEIR_SECRET = seed(10)

VOICE = arithmetic.signing_public(VOICE_SECRET)
HEIR = arithmetic.signing_public(HEIR_SECRET)
OTHER = arithmetic.signing_public(OTHER_SECRET)
CALLER_PADLOCK = arithmetic.sealing_public(CALLER_PADLOCK_SECRET)
WARDEN_HEIR = arithmetic.signing_public(WARDEN_HEIR_SECRET)
FAR_NAME = arithmetic.signing_public(FAR_NAME_SECRET)
FAR_HEIR = arithmetic.signing_public(FAR_HEIR_SECRET)

BEING_BLUEPRINT = "Lamp\n  lit() bool\n"
BEING_DIGEST = notation.digest(BEING_BLUEPRINT)
BEING_PK = arithmetic.signing_public(seed(11))
BEING_COMMITMENT = arithmetic.digest(b"a lamp's heir")

ESTATE = warden.ESTATE_TYPE
MAYBE_SKETCH = notation.Maybe(warden.SKETCH_TYPE)
MAYBE_WORD = notation.Maybe(warden.WORD_TYPE)
MAYBE_TEXT = notation.Maybe(notation.Base("text"))
INT = notation.Base("int")


class Lamp:
    """An ordinary object. Its blueprint is the whole of what crosses."""

    def lit(self) -> bool:
        return True


#: What a lamp answers on the wire: the field's declared type, written by the
#: warden and never by the being.
LIT = wire.encode(notation.Base("bool"), True)


def a_being(pk: bytes = BEING_PK, obj=None) -> warden.Being:
    parsed = notation.parse(BEING_BLUEPRINT)
    return warden.Being(
        pk=pk,
        digest=BEING_DIGEST,
        commitment=BEING_COMMITMENT,
        obj=Lamp() if obj is None else obj,
        fields={one.name: one for one in parsed.klass.fields},
        records=wire.records_of(parsed),
    )


def a_warden(**kwargs) -> warden.Warden:
    door = warden.Warden(
        NAME_SECRET,
        PADLOCK_SECRET,
        mint=lambda: EPHEMERAL,
        heir=WARDEN_HEIR,
        **kwargs,
    )
    door.beings[BEING_PK] = a_being()
    door.blueprints[BEING_DIGEST] = BEING_BLUEPRINT
    return door


def method(name: str, args: bytes = b"") -> dict:
    return {"name": name, "args": args}


def say(
    door: warden.Warden,
    *,
    secret: bytes = VOICE_SECRET,
    recipient=None,
    seq: int = 1,
    commitment=None,
    being=None,
    call=None,
    time: int = 1000,
    hops: int = 4,
    padlock: bytes = CALLER_PADLOCK,
    hints=(),
) -> bytes:
    record = {
        "voice": arithmetic.signing_public(secret),
        "recipient": door.name if recipient is None else recipient,
        "commitment": commitment,
        "seq": seq,
        "padlock": padlock,
        "hints": list(hints),
        "allowance": {"time": time, "hops": hops},
        "being": being,
        "method": call,
    }
    return envelope.seal(envelope.SAY, record, secret, door.padlock, EPHEMERAL)


def opened(sealed: bytes) -> dict:
    return envelope.unseal(CALLER_PADLOCK_SECRET, sealed, envelope.ANSWER)


class Corpus(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = load()
        self.assertEqual(self.corpus["area"], "warden")
        self.assertEqual(self.corpus["encoding"], "hex")
        self.vectors = self.corpus["vectors"]

    def test_the_file_holds_exactly_the_two_shapes_this_suite_reads(self) -> None:
        self.assertEqual(len(self.vectors), 2)
        self.assertEqual(
            [set(vector) for vector in self.vectors],
            [BLUEPRINT_SHAPE, ORDER_SHAPE],
        )

    def test_ix_the_blueprint_every_warden_holds_and_its_digest(self) -> None:
        vector = self.vectors[0]
        self.assertEqual(warden.WARDEN_BLUEPRINT, vector["blueprint"])
        self.assertEqual(
            notation.canonical(warden.WARDEN_BLUEPRINT).hex(), vector["canonical"]
        )
        self.assertEqual(warden.WARDEN_DIGEST.hex(), vector["digest"])

    def test_x_an_estate_is_ordered_by_digest_then_by_pk(self) -> None:
        vector = self.vectors[1]
        type_, records = under_test(vector["blueprint"])
        unordered = from_json(vector["unordered"])
        wanted = from_json(vector["value"])
        ordered = warden.order_estate(unordered)
        self.assertEqual(ordered, wanted)
        self.assertEqual(wire.encode(type_, ordered, records).hex(), vector["bytes"])
        self.assertEqual(
            wire.decode(type_, bytes.fromhex(vector["bytes"]), records), wanted
        )

    def test_x_the_ordering_is_derived_and_does_not_depend_on_the_input_order(
        self,
    ) -> None:
        vector = self.vectors[1]
        wanted = from_json(vector["value"])
        shuffled = {
            "classes": [
                {"digest": klass["digest"], "beings": list(reversed(klass["beings"]))}
                for klass in reversed(from_json(vector["unordered"])["classes"])
            ]
        }
        self.assertEqual(warden.order_estate(shuffled), wanted)


def under_test(text: str):
    blueprint = notation.parse(text)
    fields = blueprint.klass.fields
    if len(fields) != 1 or fields[0].answers is None:
        raise AssertionError(f"a probe that is not one answering field: {text!r}")
    return fields[0].answers, wire.records_of(blueprint)


def from_json(node: dict) -> dict:
    return {
        "classes": [
            {
                "digest": bytes.fromhex(klass["digest"]),
                "beings": [
                    {
                        "being": bytes.fromhex(held["being"]),
                        "commitment": bytes.fromhex(held["commitment"]),
                    }
                    for held in klass["beings"]
                ],
            }
            for klass in node["classes"]
        ]
    }


class TheSeqWindow(unittest.TestCase):
    """Article VIII, the seq: a message spends once, and the seq is what spends it."""

    def test_viii_the_first_legal_number_is_one(self) -> None:
        for bad in (0, -1):
            with self.subTest(bad):
                with self.assertRaises(warden.Silence):
                    warden.spend_seq(0, set(), bad, 8)

    def test_viii_a_fresh_standing_honours_anything_above_its_mark(self) -> None:
        mark, spent = warden.spend_seq(0, set(), 1, 8)
        self.assertEqual((mark, spent), (1, set()))

    def test_viii_above_the_mark_is_honoured_and_moves_the_mark(self) -> None:
        mark, spent = warden.spend_seq(3, {1}, 7, 8)
        self.assertEqual(mark, 7)
        self.assertIn(3, spent)

    def test_viii_inside_the_window_is_honoured_once_and_never_again(self) -> None:
        mark, spent = warden.spend_seq(7, set(), 5, 8)
        self.assertEqual((mark, spent), (7, {5}))
        with self.assertRaises(warden.Silence):
            warden.spend_seq(mark, spent, 5, 8)

    def test_viii_the_mark_itself_is_never_honoured_twice(self) -> None:
        with self.assertRaises(warden.Silence):
            warden.spend_seq(7, set(), 7, 8)

    def test_viii_below_the_window_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            warden.spend_seq(20, set(), 12, 8)

    def test_viii_how_wide_the_window_is_is_the_wardens_own(self) -> None:
        self.assertEqual(warden.spend_seq(20, set(), 15, 8)[0], 20)
        with self.assertRaises(warden.Silence):
            warden.spend_seq(20, set(), 15, 4)

    def test_viii_the_window_forgets_what_the_mark_has_left_behind(self) -> None:
        mark, spent = warden.spend_seq(4, set(), 2, 8)
        self.assertEqual(spent, {2})
        mark, spent = warden.spend_seq(mark, spent, 40, 8)
        self.assertEqual((mark, spent), (40, set()))
        with self.assertRaises(warden.Silence):
            warden.spend_seq(mark, spent, 2, 8)


class TheLeash(unittest.TestCase):
    """Article VIII, the leash: it only shrinks, and it is judged on what arrived."""

    def test_viii_a_time_budget_at_or_below_zero_is_silence(self) -> None:
        for time in (0, -1):
            with self.subTest(time):
                with self.assertRaises(warden.Silence):
                    warden.spend_leash({"time": time, "hops": 3})

    def test_viii_a_hop_count_below_zero_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            warden.spend_leash({"time": 10, "hops": -1})

    def test_viii_a_hop_count_of_zero_is_a_legal_leash(self) -> None:
        warden.spend_leash({"time": 10, "hops": 0})

    def test_viii_what_a_hop_count_of_zero_forbids_is_onward(self) -> None:
        self.assertIsNone(warden.onward({"time": 10, "hops": 0}, 1))

    def test_viii_the_hop_count_falls_by_one_at_every_door(self) -> None:
        self.assertEqual(warden.onward({"time": 10, "hops": 3}, 0)["hops"], 2)

    def test_viii_the_budget_falls_by_this_doors_own_dwell(self) -> None:
        self.assertEqual(warden.onward({"time": 10, "hops": 3}, 4)["time"], 6)

    def test_viii_an_onward_ask_whose_budget_would_reach_zero_is_not_made(self) -> None:
        self.assertIsNone(warden.onward({"time": 10, "hops": 3}, 10))
        self.assertIsNone(warden.onward({"time": 10, "hops": 3}, 11))

    def test_viii_the_leash_only_shrinks(self) -> None:
        arriving = {"time": 100, "hops": 5}
        handed = warden.onward(arriving, 7)
        self.assertLess(handed["time"], arriving["time"])
        self.assertLess(handed["hops"], arriving["hops"])


class TheJudgment(unittest.TestCase):
    """Article XII: in order, and every failure is the same failure."""

    def setUp(self) -> None:
        self.door = a_warden()
        self.standing = self.door.grant(
            VOICE, arithmetic.commitment(self.door.name, HEIR), [BEING_PK]
        )

    def test_xii_1_an_envelope_that_will_not_unseal_is_silence(self) -> None:
        message = say(self.door)
        with self.assertRaises(warden.Silence):
            judged(self.door, message[:-1])

    def test_xii_1_a_record_arriving_under_the_answer_byte_is_silence(self) -> None:
        message = envelope.seal(
            envelope.ANSWER,
            {"warden": self.door.name, "seq": 1, "data": None},
            NAME_SECRET,
            self.door.padlock,
            EPHEMERAL,
        )
        with self.assertRaises(warden.Silence):
            judged(self.door, message)

    def test_xii_2_a_signature_that_does_not_stand_is_silence(self) -> None:
        message = bytearray(say(self.door))
        message[-1] ^= 0xFF
        with self.assertRaises(warden.Silence):
            judged(self.door, bytes(message))

    def test_xii_3_a_payload_addressed_elsewhere_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, recipient=OTHER))

    def test_xii_3_the_recipient_may_be_the_name_or_the_padlock(self) -> None:
        for recipient in (self.door.name, self.door.padlock):
            with self.subTest(recipient.hex()):
                door = a_warden()
                door.grant(VOICE, arithmetic.commitment(door.name, HEIR), [BEING_PK])
                judged(door, say(door, recipient=recipient))

    def test_xii_3_a_payload_addressed_elsewhere_never_touches_the_records(
        self,
    ) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, recipient=OTHER, seq=9))
        self.assertEqual(self.standing.mark, 0)

    def test_xii_4_a_known_voice_is_an_ask(self) -> None:
        self.assertEqual(judged(self.door, say(self.door)).placement, warden.ASK)

    def test_xii_4_a_plain_ask_carrying_a_commitment_is_refused(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, commitment=arithmetic.digest(b"next")))

    def test_xii_4_an_heir_is_a_rotation_and_the_standing_changes_hands(self) -> None:
        next_commitment = arithmetic.digest(b"a key nobody has seen")
        judgment = judged(
            self.door, say(self.door, secret=HEIR_SECRET, commitment=next_commitment)
        )
        self.assertEqual(judgment.placement, warden.ROTATION)
        self.assertEqual(self.standing.voice, HEIR)
        self.assertEqual(self.standing.commitment, next_commitment)

    def test_xii_4_a_rotation_carrying_no_fresh_commitment_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, secret=HEIR_SECRET))

    def test_xii_4_the_old_key_dies_the_moment_the_heir_spends(self) -> None:
        judged(
            self.door,
            say(self.door, secret=HEIR_SECRET, commitment=arithmetic.digest(b"n")),
        )
        judgment = judged(self.door, say(self.door, secret=VOICE_SECRET, seq=1))
        self.assertEqual(judgment.placement, warden.STRANGER)

    def test_xii_4_a_voice_nowhere_is_the_strangers_case(self) -> None:
        judgment = judged(self.door, say(self.door, secret=OTHER_SECRET))
        self.assertEqual(judgment.placement, warden.STRANGER)

    def test_xii_4_the_records_are_read_inbound_first(self) -> None:
        """A voice that is both a current holder and an outbound peer is an ask."""
        self.door.outbound.append(
            warden.Relation(
                warden=VOICE,
                commitment=arithmetic.digest(b"x"),
                padlock=CALLER_PADLOCK,
                voice=OTHER,
                secret=OTHER_SECRET,
                heir=OTHER,
                heir_secret=OTHER_SECRET,
            )
        )
        self.assertEqual(judged(self.door, say(self.door)).placement, warden.ASK)

    def test_xii_5_a_number_is_honoured_once(self) -> None:
        judged(self.door, say(self.door, seq=4))
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=4))

    def test_xii_5_honoured_means_consumed_whatever_happens_after(self) -> None:
        """A message refused at routing has still spent its number."""
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=6, being=OTHER))
        self.assertEqual(self.standing.mark, 6)
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=6))

    def test_xii_5_a_message_refused_for_its_leash_has_still_spent_its_seq(
        self,
    ) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=6, time=0))
        self.assertEqual(self.standing.mark, 6)

    def test_xii_5_a_rotation_starts_the_mark_fresh(self) -> None:
        judged(self.door, say(self.door, seq=90))
        judged(
            self.door,
            say(
                self.door,
                secret=HEIR_SECRET,
                seq=1,
                commitment=arithmetic.digest(b"next"),
            ),
        )
        self.assertEqual(self.standing.mark, 1)

    def test_xiv_a_stranger_spends_nothing(self) -> None:
        for _ in range(2):
            judged(self.door, say(self.door, secret=OTHER_SECRET, seq=1))
        self.assertEqual(self.door.inbound, [self.standing])

    def test_xii_6_the_leash_is_spent_after_the_seq_and_before_routing(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=3, hops=-1))
        self.assertEqual(self.standing.mark, 3)

    def test_xii_6_a_hop_count_of_zero_still_reaches_this_door(self) -> None:
        judged(self.door, say(self.door, hops=0))

    def test_viii_the_two_readings_are_taken_at_the_ends_of_the_judgment(self) -> None:
        readings = iter([100, 130])
        judgment = judged(
            self.door, say(self.door, time=1000, hops=3), clock=lambda: next(readings)
        )
        self.assertEqual((judgment.arrived, judgment.handed), (100, 130))
        self.assertEqual(judgment.onward, {"time": 970, "hops": 2})

    def test_viii_the_road_is_never_counted(self) -> None:
        """Only this door's own dwell leaves the budget, not the wait before it."""
        readings = iter([1000, 1005])
        judgment = judged(
            self.door, say(self.door, time=50), clock=lambda: next(readings)
        )
        self.assertEqual(judgment.onward["time"], 45)

    def test_xii_7_being_and_method_invokes_the_being(self) -> None:
        judgment = judged(self.door, say(self.door, being=BEING_PK, call=method("lit")))
        self.assertEqual(opened(judgment.answer)["data"], LIT)

    def test_xii_7_being_without_method_describes_that_one_being(self) -> None:
        judgment = judged(self.door, say(self.door, being=BEING_PK))
        sketch = wire.decode(
            MAYBE_SKETCH, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
        )
        self.assertEqual(
            sketch,
            {
                "being": BEING_PK,
                "digest": BEING_DIGEST,
                "commitment": BEING_COMMITMENT,
            },
        )

    def test_xii_7_neither_is_the_default_ask_the_describe(self) -> None:
        judgment = judged(self.door, say(self.door))
        estate = wire.decode(
            ESTATE, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
        )
        self.assertEqual(estate, self.door.estate(self.standing))

    def test_xii_7_method_without_being_reaches_the_wardens_own_being(self) -> None:
        judgment = judged(self.door, say(self.door, call=method("limit")))
        self.assertEqual(
            wire.decode(INT, opened(judgment.answer)["data"], warden.WARDEN_RECORDS),
            self.door.limit,
        )

    def test_ix_the_wardens_own_being_answers_to_two_addresses(self) -> None:
        by_name = judged(
            self.door, say(self.door, seq=1, being=self.door.name, call=method("limit"))
        )
        by_omission = judged(self.door, say(self.door, seq=2, call=method("limit")))
        self.assertEqual(
            opened(by_name.answer)["data"], opened(by_omission.answer)["data"]
        )

    def test_xii_7_a_being_this_voice_does_not_reach_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, secret=OTHER_SECRET, being=BEING_PK))

    def test_xii_8_the_answer_names_the_ask_by_its_seq_and_is_signed_by_the_name(
        self,
    ) -> None:
        judgment = judged(self.door, say(self.door, seq=11))
        answer = opened(judgment.answer)
        self.assertEqual(answer["warden"], self.door.name)
        self.assertEqual(answer["seq"], 11)

    def test_xii_8_the_answer_is_sealed_to_the_padlock_the_payload_carried(
        self,
    ) -> None:
        judgment = judged(self.door, say(self.door))
        with self.assertRaises(envelope.EnvelopeError):
            envelope.unseal(PADLOCK_SECRET, judgment.answer, envelope.ANSWER)
        opened(judgment.answer)

    def test_vii_the_way_back_is_refreshed_by_every_call_that_arrives(self) -> None:
        other = arithmetic.sealing_public(seed(21))
        judged(self.door, say(self.door, padlock=other, hints=["quic://one"]))
        self.assertEqual(self.standing.padlock, other)
        self.assertEqual(self.standing.hints, ("quic://one",))

    def test_ix_the_limit_is_counted_in_bytes_of_the_whole_envelope(self) -> None:
        """And it binds on every road, distance zero included.

        The limit is a fact a warden publishes about itself rather than about
        a road, so a door that accepted locally what it refuses over the common
        carriage would have made its own published number false. Neither
        envelope here ever met a socket.
        """
        message = say(self.door)
        door = a_warden(limit=len(message) - 1)
        door.grant(VOICE, arithmetic.commitment(door.name, HEIR), [BEING_PK])
        with self.assertRaises(warden.Silence):
            judged(door, message)

        # One byte more and the same envelope is honoured: the limit is
        # inclusive, and the refused one spent nothing on its way out, because
        # an envelope beyond the bound is not accepted and so is not judged.
        door = a_warden(limit=len(message))
        row = door.grant(VOICE, arithmetic.commitment(door.name, HEIR), [BEING_PK])
        judged(door, message)
        self.assertEqual(row.mark, 1)


class TheDescribe(unittest.TestCase):
    """Article X: what a describe contains is the blueprint, and it is scoped."""

    def setUp(self) -> None:
        self.door = a_warden()
        self.standing = self.door.grant(
            VOICE, arithmetic.commitment(self.door.name, HEIR), [BEING_PK]
        )

    def test_x_a_describe_never_hands_back_a_beings_state(self) -> None:
        sketch = self.door.sketch(self.door.beings[BEING_PK])
        self.assertEqual(set(sketch), {"being", "digest", "commitment"})

    def test_ix_the_public_being_appears_in_every_estate(self) -> None:
        for standing in (self.standing, None):
            with self.subTest(standing is None and "stranger" or "holder"):
                estate = self.door.estate(standing)
                pks = [
                    held["being"]
                    for klass in estate["classes"]
                    for held in klass["beings"]
                ]
                self.assertIn(self.door.name, pks)

    def test_x_the_strangers_estate_is_the_public_being_alone(self) -> None:
        estate = self.door.estate(None)
        self.assertEqual(
            estate,
            {
                "classes": [
                    {
                        "digest": warden.WARDEN_DIGEST,
                        "beings": [
                            {
                                "being": self.door.name,
                                "commitment": self.door.public.commitment,
                            }
                        ],
                    }
                ]
            },
        )

    def test_x_an_estate_is_what_that_voice_may_reach(self) -> None:
        estate = self.door.estate(self.standing)
        self.assertEqual(
            sorted(klass["digest"] for klass in estate["classes"]),
            sorted([warden.WARDEN_DIGEST, BEING_DIGEST]),
        )

    def test_x_the_estate_a_door_produces_is_already_in_the_derived_order(self) -> None:
        estate = self.door.estate(self.standing)
        self.assertEqual(warden.order_estate(estate), estate)

    def test_x_a_blueprint_is_answered_to_a_voice_that_reaches_its_class(self) -> None:
        judgment = judged(
            self.door, say(self.door, call=method("blueprint", BEING_DIGEST))
        )
        self.assertEqual(
            wire.decode(
                MAYBE_TEXT, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
            ),
            BEING_BLUEPRINT,
        )

    def test_x_a_blueprint_the_asker_reaches_nothing_of_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(
                self.door,
                say(
                    self.door,
                    secret=OTHER_SECRET,
                    call=method("blueprint", BEING_DIGEST),
                ),
            )

    def test_x_the_wardens_own_blueprint_is_answered_to_a_stranger(self) -> None:
        judgment = judged(
            self.door,
            say(
                self.door,
                secret=OTHER_SECRET,
                call=method("blueprint", warden.WARDEN_DIGEST),
            ),
        )
        self.assertEqual(
            wire.decode(
                MAYBE_TEXT, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
            ),
            warden.WARDEN_BLUEPRINT,
        )

    def test_x_silence_and_absence_are_two_different_answers(self) -> None:
        """`moved` answers absence; a being you do not reach answers nothing."""
        judgment = judged(self.door, say(self.door, call=method("moved", BEING_PK)))
        self.assertIsNone(
            wire.decode(
                MAYBE_WORD, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
            )
        )
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=2, call=method("sketch", OTHER)))

    def test_x_every_describe_is_scoped_by_the_same_binary_record(self) -> None:
        """A voice with no standing meets the stranger's case in all three."""
        for name, blob in (("sketch", BEING_PK), ("blueprint", BEING_DIGEST)):
            with self.subTest(name):
                door = a_warden()
                with self.assertRaises(warden.Silence):
                    judged(door, say(door, call=method(name, blob)))
        door = a_warden()
        judgment = judged(door, say(door, call=method("describe", b"")))
        estate = wire.decode(
            ESTATE, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
        )
        self.assertEqual(estate, door.estate(None))

    def test_ix_a_field_taking_nothing_refuses_bytes_left_in_the_blob(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, call=method("describe", b"\x00")))

    def test_ix_a_field_the_blueprint_does_not_declare_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, call=method("open")))


class TheStanding(unittest.TestCase):
    """Article VII: a standing is amended, not replaced."""

    def setUp(self) -> None:
        self.door = a_warden()
        self.standing = self.door.grant(
            VOICE, arithmetic.commitment(self.door.name, HEIR), [BEING_PK]
        )

    def test_vii_adding_a_being_tells_nobody_and_shows_on_the_next_describe(
        self,
    ) -> None:
        second = arithmetic.signing_public(seed(31))
        self.door.beings[second] = warden.Being(
            pk=second, digest=BEING_DIGEST, commitment=BEING_COMMITMENT
        )
        before = self.door.estate(self.standing)
        self.door.amend(VOICE, [BEING_PK, second])
        after = self.door.estate(self.standing)
        self.assertNotEqual(before, after)
        self.assertEqual(len(after["classes"]), 2)

    def test_vii_taking_the_last_being_away_is_release(self) -> None:
        self.door.amend(VOICE, [])
        self.assertEqual(self.door.inbound, [])
        self.assertEqual(judged(self.door, say(self.door)).placement, warden.STRANGER)

    def test_vii_a_standing_ends_whenever_its_warden_drops_the_row(self) -> None:
        self.door.inbound.remove(self.standing)
        self.assertEqual(judged(self.door, say(self.door)).placement, warden.STRANGER)


class TheNews(unittest.TestCase):
    """Article XIV: news is only where its voice is found — the outbound record."""

    def setUp(self) -> None:
        self.door = a_warden()
        self.relation = warden.Relation(
            warden=FAR_NAME,
            commitment=arithmetic.commitment(FAR_NAME, FAR_HEIR),
            padlock=arithmetic.sealing_public(seed(12)),
            voice=VOICE,
            secret=VOICE_SECRET,
            heir=HEIR,
            heir_secret=HEIR_SECRET,
            hints=("quic://far",),
        )
        self.door.outbound.append(self.relation)

    def tell(self, secret: bytes, word: dict, seq: int = 1) -> warden.Judgment:
        blob = wire.encode(warden.WORD_TYPE, word, warden.WARDEN_RECORDS)
        return judged(
            self.door, say(self.door, secret=secret, seq=seq, call=method("tell", blob))
        )

    @staticmethod
    def word(**fields) -> dict:
        base = {
            "being": None,
            "successor": None,
            "commitment": None,
            "name": None,
            "padlock": None,
            "hints": [],
        }
        base.update(fields)
        return base

    def test_xiv_news_is_placed_by_the_outbound_record(self) -> None:
        judgment = self.tell(
            FAR_HEIR_SECRET,
            self.word(successor=FAR_HEIR, commitment=arithmetic.digest(b"next")),
        )
        self.assertEqual(judgment.placement, warden.NEWS)

    def test_xiv_a_succession_is_believed_by_the_hash_the_peer_already_holds(
        self,
    ) -> None:
        next_commitment = arithmetic.digest(b"next")
        self.tell(
            FAR_HEIR_SECRET,
            self.word(successor=FAR_HEIR, commitment=next_commitment),
        )
        self.assertEqual(self.relation.warden, FAR_HEIR)
        self.assertEqual(self.relation.commitment, next_commitment)

    def test_xiv_a_successor_not_named_in_advance_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            self.tell(
                OTHER_SECRET,
                self.word(successor=OTHER, commitment=arithmetic.digest(b"n")),
            )

    def test_xiv_a_succession_carrying_no_next_commitment_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            self.tell(FAR_HEIR_SECRET, self.word(successor=FAR_HEIR))

    def test_xiv_a_succession_the_successor_did_not_sign_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            self.tell(
                FAR_HEIR_SECRET,
                self.word(successor=OTHER, commitment=arithmetic.digest(b"n")),
            )

    def test_xiv_a_padlock_replacement_is_signed_by_the_name(self) -> None:
        new_padlock = arithmetic.sealing_public(seed(13))
        self.tell(FAR_NAME_SECRET, self.word(padlock=new_padlock))
        self.assertEqual(self.relation.padlock, new_padlock)
        self.assertEqual(self.relation.warden, FAR_NAME)

    def test_xiv_a_padlock_replacement_the_committed_heir_signed_is_silence(
        self,
    ) -> None:
        """Article XIV gives this act exactly one signer, and the heir is not it.

        The far house's committed heir is a key this peer holds and is placed
        as news by it — the second of the two roads of belief, and the wrong
        road for this act. A door that believed any key it managed to place
        would let a house's heir replace that house's lock at every peer
        before it had succeeded anything, and every message those peers sent
        next would be sealed to a lock the heir chose.
        """
        held = self.relation.padlock
        stolen = arithmetic.sealing_public(seed(14))
        with self.assertRaises(warden.Silence):
            self.tell(FAR_HEIR_SECRET, self.word(padlock=stolen))
        self.assertEqual(self.relation.padlock, held)
        # The name signs the same word and it is believed, so what refused the
        # first is the signer and nothing else about the word.
        self.tell(FAR_NAME_SECRET, self.word(padlock=stolen), seq=2)
        self.assertEqual(self.relation.padlock, stolen)

    def test_xiv_a_lock_has_no_heir_so_a_padlock_word_carries_no_commitment(
        self,
    ) -> None:
        with self.assertRaises(warden.Silence):
            self.tell(
                FAR_NAME_SECRET,
                self.word(
                    padlock=arithmetic.sealing_public(seed(13)),
                    commitment=arithmetic.digest(b"n"),
                ),
            )

    def test_xiv_a_word_that_announces_nothing_is_silence(self) -> None:
        with self.assertRaises(warden.Silence):
            self.tell(FAR_NAME_SECRET, self.word())

    def test_xiv_a_word_naming_the_wardens_own_pk_in_being_is_refused(self) -> None:
        with self.assertRaises(warden.Silence):
            self.tell(
                FAR_HEIR_SECRET,
                self.word(
                    being=FAR_NAME,
                    successor=FAR_HEIR,
                    commitment=arithmetic.digest(b"n"),
                ),
            )

    def test_xiv_believed_news_rewrites_the_row_off_the_words_own_fields(self) -> None:
        new_name = arithmetic.signing_public(seed(14))
        new_padlock = arithmetic.sealing_public(seed(15))
        self.tell(
            FAR_HEIR_SECRET,
            self.word(
                successor=FAR_HEIR,
                commitment=arithmetic.digest(b"n"),
                name=new_name,
                padlock=new_padlock,
                hints=["quic://new"],
            ),
        )
        self.assertEqual(self.relation.warden, new_name)
        self.assertEqual(self.relation.padlock, new_padlock)
        self.assertEqual(self.relation.hints, ("quic://new",))

    def test_xiv_an_empty_hints_list_means_the_road_did_not_change(self) -> None:
        self.tell(
            FAR_HEIR_SECRET,
            self.word(successor=FAR_HEIR, commitment=arithmetic.digest(b"n")),
        )
        self.assertEqual(self.relation.hints, ("quic://far",))

    def test_xiv_news_is_counted_against_the_mark_per_far_warden(self) -> None:
        self.tell(
            FAR_NAME_SECRET,
            self.word(padlock=arithmetic.sealing_public(seed(13))),
            seq=5,
        )
        self.assertEqual(self.relation.news, 5)
        with self.assertRaises(warden.Silence):
            self.tell(
                FAR_NAME_SECRET,
                self.word(padlock=arithmetic.sealing_public(seed(13))),
                seq=5,
            )

    def test_xiv_a_name_succession_keeps_that_mark(self) -> None:
        self.tell(
            FAR_HEIR_SECRET,
            self.word(successor=FAR_HEIR, commitment=arithmetic.digest(b"n")),
            seq=7,
        )
        self.assertEqual(self.relation.news, 7)

    def test_xiv_a_beings_succession_starts_the_news_mark_fresh(self) -> None:
        # A being's succession is believed against the being's own commitment,
        # which a describe published and `note` keeps — never the row's, which
        # belongs to the house's name.
        self.door.note(self.relation, BEING_PK, arithmetic.commitment(FAR_NAME, OTHER))
        self.tell(
            OTHER_SECRET,
            self.word(
                being=BEING_PK,
                successor=OTHER,
                commitment=arithmetic.digest(b"n"),
            ),
            seq=7,
        )
        self.assertEqual(self.relation.news, 0)

    def test_xiv_a_beings_succession_the_houses_heir_announced_is_silence(self) -> None:
        """The commitment the voice hashed to says what it may succeed.

        The far house's own committed heir is placed as news, and a door that
        believed any key it managed to place would let that heir succeed every
        being at the house — or, the other way, let a being's heir take the
        house's name.
        """
        with self.assertRaises(warden.Silence):
            self.tell(
                FAR_HEIR_SECRET,
                self.word(
                    being=BEING_PK,
                    successor=FAR_HEIR,
                    commitment=arithmetic.digest(b"n"),
                ),
            )

    def test_xiv_the_news_mark_and_the_send_count_are_two_counters(self) -> None:
        """ "the mark kept for that far warden's news, split from ``seq``, the
        count of what this door sends, because one field cannot be two
        counters."
        """
        # This door has sent that peer nine asks. Nothing about that number is
        # a statement about what the peer has said to this door.
        self.relation.seq = 9
        self.tell(
            FAR_NAME_SECRET,
            self.word(padlock=arithmetic.sealing_public(seed(13))),
            seq=4,
        )
        self.assertEqual(self.relation.news, 4)
        self.assertEqual(self.relation.seq, 9)

        # And the other direction: the send count rising does not silence the
        # peer's next number.
        self.relation.seq = 40
        self.tell(
            FAR_NAME_SECRET,
            self.word(padlock=arithmetic.sealing_public(seed(14))),
            seq=5,
        )
        self.assertEqual(self.relation.news, 5)
        self.assertEqual(self.relation.seq, 40)

    def test_xiv_tell_is_news_and_news_is_nothing_else(self) -> None:
        door = a_warden()
        door.grant(VOICE, arithmetic.commitment(door.name, HEIR), [BEING_PK])
        blob = wire.encode(
            warden.WORD_TYPE,
            self.word(padlock=arithmetic.sealing_public(seed(13))),
            warden.WARDEN_RECORDS,
        )
        with self.assertRaises(warden.Silence):
            judged(door, say(door, call=method("tell", blob)))

    def test_xiv_a_news_voice_reaches_nothing_but_tell(self) -> None:
        with self.assertRaises(warden.Silence):
            judged(
                self.door, say(self.door, secret=FAR_NAME_SECRET, call=method("limit"))
            )


class Migration(unittest.TestCase):
    """Articles IX and XIII: receive, and the door that only points."""

    def setUp(self) -> None:
        # The mint walks a fixed list rather than handing one key out over and
        # over: a receive draws two, and a door whose draws are all the same
        # key cannot tell the two apart — which is how a kit committing to the
        # wrong one of them stays green.
        self.drawn = [seed(byte) for byte in (40, 41, 42, 43, 44, 45)]
        self.door = a_warden()
        self.door.mint = lambda: self.drawn.pop(0)
        self.standing = self.door.grant(
            VOICE, arithmetic.commitment(self.door.name, HEIR), [BEING_PK]
        )

    def cargo(self, digest: bytes) -> bytes:
        return wire.encode(
            warden.CARGO_TYPE,
            {
                "being": OTHER,
                "digest": digest,
                "cells": b"remembered",
                "standings": [
                    {
                        "voice": VOICE,
                        "commitment": arithmetic.digest(b"c"),
                        # The name that commitment was minted at, which is the
                        # origin's rather than this door's.
                        "name": FAR_NAME,
                        "beings": [OTHER],
                        "mark": 9,
                        "spent": [4, 7],
                        "padlock": CALLER_PADLOCK,
                        "hints": ["quic://back"],
                    }
                ],
                "relations": [],
            },
            warden.WARDEN_RECORDS,
        )

    def test_ix_receive_answers_the_commitment_of_the_beings_new_name(
        self,
    ) -> None:
        """A destination mints two keys, and the commitment is of the first.

        The being's new name is where the migration's second news moves the
        being's identity, and it is what a peer hashes that succession against.
        A commitment to that name's heir instead names a key that signs nothing
        until the succession after this one, so the news is disbelieved and the
        peer is left standing at a house that has stopped answering.
        """
        judgment = judged(
            self.door, say(self.door, call=method("receive", self.cargo(BEING_DIGEST)))
        )
        answered = wire.decode(
            notation.Base("b32"),
            opened(judgment.answer)["data"],
            warden.WARDEN_RECORDS,
        )
        name = arithmetic.signing_public(seed(40))
        heir = arithmetic.signing_public(seed(41))
        self.assertEqual(answered, arithmetic.commitment(self.door.name, name))
        self.assertNotEqual(answered, arithmetic.commitment(self.door.name, heir))

        # The being wears that name here, holding its own heir commitment so it
        # can be succeeded afterwards like any other.
        self.assertIn(name, self.door.beings)
        self.assertEqual(
            self.door.beings[name].commitment,
            arithmetic.commitment(self.door.name, heir),
        )
        # An arriving row reaches the being by the name this door minted and by
        # that name alone (Article XIII), never also by the name it wore
        # before: a name a door must remember for whoever might still be behind
        # is a name it can never stop remembering, and the peer that is behind
        # is not stranded, because the old door still answers `moved`.
        arrived = [row for row in self.door.inbound if row is not self.standing][0]
        self.assertEqual(list(arrived.beings), [name])
        self.assertNotIn(OTHER, arrived.beings)

    def test_ix_a_destination_that_does_not_hold_that_class_refuses_in_silence(
        self,
    ) -> None:
        with self.assertRaises(warden.Silence):
            judged(
                self.door,
                say(
                    self.door,
                    call=method("receive", self.cargo(arithmetic.digest(b"?"))),
                ),
            )
        self.assertNotIn(OTHER, self.door.beings)

    def test_xiii_the_replay_record_travels_whole(self) -> None:
        judged(
            self.door, say(self.door, call=method("receive", self.cargo(BEING_DIGEST)))
        )
        arrived = [row for row in self.door.inbound if row is not self.standing][0]
        self.assertEqual(arrived.mark, 9)
        self.assertEqual(arrived.spent, {4, 7})

        # A mark that arrives in a cargo is a number that was honoured — that
        # is what a mark is — so as the mark moves past it, it belongs in the
        # window beneath as spent. A door that only moved the mark would honour
        # nine a second time here.
        with self.assertRaises(warden.Silence):
            warden.spend_seq(arrived.mark, arrived.spent, 9, 64)
        mark, spent = warden.spend_seq(arrived.mark, arrived.spent, 10, 64)
        with self.assertRaises(warden.Silence):
            warden.spend_seq(mark, spent, 9, 64)

    def test_xiii_the_old_door_only_points(self) -> None:
        moved = {
            "being": BEING_PK,
            "successor": OTHER,
            "commitment": arithmetic.digest(b"n"),
            "name": arithmetic.signing_public(seed(16)),
            "padlock": arithmetic.sealing_public(seed(17)),
            "hints": ["quic://new"],
        }
        self.door.pointers[BEING_PK] = moved
        # A method ask meets silence: an answer's data is the field's declared
        # answer type by the notation's rules, and a succession is not that
        # type, so the old door cannot put the word where the caller asked for
        # the work. A peer that never asks `moved` learns of the move by news.
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, being=BEING_PK, call=method("lit")))

        # The one ask the old door does answer about a being that left.
        judgment = judged(
            self.door, say(self.door, seq=2, call=method("moved", BEING_PK))
        )
        self.assertEqual(
            wire.decode(
                MAYBE_WORD, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
            ),
            moved,
        )

    def test_xiii_a_published_pointer_is_reach_enough_and_a_stranger_gets_none(
        self,
    ) -> None:
        """`moved` is scoped like every describe, and a pointer is scope.

        An arriving row names the being by the name the destination minted and
        by that name alone, so the name it wore before stands in no standing
        anywhere. If a published pointer were not reach enough, a door could
        not point about the one being Article XIII sends every peer behind the
        news to ask it about — and the peer that is behind would be stranded,
        which is the case the article says cannot arise.
        """
        moved = {
            "being": OTHER,
            "successor": BEING_PK,
            "commitment": arithmetic.digest(b"n"),
            "name": None,
            "padlock": None,
            "hints": [],
        }
        self.door.pointers[OTHER] = moved
        # OTHER stands in no standing at this door, and the holder is answered
        # anyway, because the pointer is what it is being asked for.
        self.assertNotIn(OTHER, self.standing.beings)
        judgment = judged(self.door, say(self.door, call=method("moved", OTHER)))
        self.assertEqual(
            wire.decode(
                MAYBE_WORD, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
            ),
            moved,
        )

        # A stranger holds no standing, so it is answered nothing — a door that
        # pointed for anyone would be a door any passer-by could ask what it
        # once ran.
        stranger = a_warden()
        stranger.pointers[OTHER] = moved
        with self.assertRaises(warden.Silence):
            judged(stranger, say(stranger, call=method("moved", OTHER)))

    def test_x_moved_answers_the_succession_the_door_published(self) -> None:
        moved = {
            "being": BEING_PK,
            "successor": OTHER,
            "commitment": arithmetic.digest(b"n"),
            "name": None,
            "padlock": None,
            "hints": [],
        }
        self.door.pointers[BEING_PK] = moved
        judgment = judged(self.door, say(self.door, call=method("moved", BEING_PK)))
        self.assertEqual(
            wire.decode(
                MAYBE_WORD, opened(judgment.answer)["data"], warden.WARDEN_RECORDS
            ),
            moved,
        )


class TheWayBack(unittest.TestCase):
    """Article XII places the refresh between the seq and the leash.

    Where it falls decides two things a door would otherwise get wrong, and
    both are consequences of the placement rather than choices.
    """

    LIVE = arithmetic.sealing_public(seed(41))
    RETIRED = arithmetic.sealing_public(seed(42))
    LATE = arithmetic.sealing_public(seed(43))

    def setUp(self) -> None:
        self.door = a_warden()
        self.standing = self.door.grant(
            VOICE, arithmetic.commitment(self.door.name, HEIR), [BEING_PK]
        )

    def test_xii_the_way_back_is_refreshed_between_the_seq_and_the_leash(self) -> None:
        judged(self.door, say(self.door, seq=5, padlock=self.LIVE))
        self.assertEqual(self.standing.padlock, self.LIVE)

        # Not earlier than the seq: a replayed message carries whatever way
        # back the peer had when it was sent, and the seq is the only thing
        # that tells a replay from a call. A door that refreshed first would
        # let anyone holding a copy overwrite a live way back with a retired
        # one.
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=5, padlock=self.RETIRED))
        self.assertEqual(
            self.standing.padlock, self.LIVE, "a refused replay rewrote the way back"
        )

        # And not later than the leash: a message refused for its leash still
        # arrived and still spent its number. A door that refreshed only what
        # it went on to route would slowly lose the way back to any peer whose
        # calls it keeps refusing — and news is what that peer would stop
        # receiving.
        with self.assertRaises(warden.Silence):
            judged(self.door, say(self.door, seq=6, padlock=self.LATE, time=0))
        self.assertEqual(
            self.standing.padlock,
            self.LATE,
            "refused for its leash, and the way back stood still",
        )

    def test_vii_an_arriving_call_with_empty_hints_leaves_the_way_back_standing(
        self,
    ) -> None:
        """Article VII's mirror of Article XIV.

        An empty hints list means the road did not change, never an erasure.
        An end that publishes nothing — the dialing end always — sends empty
        hints by nature, and a door that erased on that would destroy its own
        way back to that peer on the peer's first ask.
        """
        judged(self.door, say(self.door, seq=1, hints=("https://caller.example",)))
        self.assertEqual(self.standing.hints, ("https://caller.example",))

        judged(self.door, say(self.door, seq=2, hints=()))
        self.assertEqual(
            self.standing.hints,
            ("https://caller.example",),
            "an empty hints list erased the way back",
        )


class NameSuccession(unittest.TestCase):
    """Article XIV, the door's own name moving, and what it costs a holder.

    The standings are kept, because every heir commitment was hashed under the
    name the door had then and the door stores the name each was minted at.
    """

    NEXT_SECRET = seed(20)

    def setUp(self) -> None:
        self.door = a_warden()
        self.was = self.door.name
        self.standing = self.door.grant(
            VOICE, arithmetic.commitment(self.door.name, HEIR), [BEING_PK]
        )
        self.next = arithmetic.signing_public(self.NEXT_SECRET)

    def test_xiv_the_name_moves_only_to_the_heir_the_founding_committed_to(
        self,
    ) -> None:
        with self.assertRaises(warden.Silence):
            self.door.succeed(OTHER_SECRET, arithmetic.digest(b"after"))
        self.assertEqual(self.door.name, self.was)

        self.door.succeed(WARDEN_HEIR_SECRET, arithmetic.digest(b"after"))
        self.assertEqual(self.door.name, WARDEN_HEIR)
        self.assertEqual(self.door.public.pk, WARDEN_HEIR)
        self.assertEqual(self.door.public.commitment, arithmetic.digest(b"after"))

    def test_xiv_a_name_succession_keeps_the_standings(self) -> None:
        self.door.succeed(WARDEN_HEIR_SECRET, arithmetic.digest(b"after"))
        self.assertEqual(self.standing.minted_at, self.was)

        # The holder has not heard the news, so it mints its next commitment
        # under the name it still believes. The standing was filed under that
        # name, so this rotation is judged and accepted.
        judgment = judged(
            self.door,
            say(
                self.door,
                secret=HEIR_SECRET,
                commitment=arithmetic.commitment(self.was, self.next),
            ),
        )
        self.assertEqual(judgment.placement, warden.ROTATION)
        # And the commitment it carried is filed under the name the door has
        # now, because a door cannot see which name a holder minted one under.
        self.assertEqual(self.standing.minted_at, self.door.name)

    def test_xiv_a_holder_behind_the_news_succeeds_once_and_no_more(self) -> None:
        self.door.succeed(WARDEN_HEIR_SECRET, arithmetic.digest(b"after"))
        judged(
            self.door,
            say(
                self.door,
                secret=HEIR_SECRET,
                commitment=arithmetic.commitment(self.was, self.next),
            ),
        )
        # The rotation after it will not match, and that is silence like every
        # other refusal.
        judgment = judged(
            self.door,
            say(
                self.door,
                secret=self.NEXT_SECRET,
                seq=2,
                commitment=arithmetic.digest(b"further"),
            ),
        )
        self.assertEqual(judgment.placement, warden.STRANGER)

    def test_xiv_hearing_the_news_is_what_ends_it(self) -> None:
        self.door.succeed(WARDEN_HEIR_SECRET, arithmetic.digest(b"after"))
        # A holder that has heard the news mints under the name the door has
        # now, and keeps rotating.
        judged(
            self.door,
            say(
                self.door,
                secret=HEIR_SECRET,
                commitment=arithmetic.commitment(self.door.name, self.next),
            ),
        )
        judgment = judged(
            self.door,
            say(
                self.door,
                secret=self.NEXT_SECRET,
                seq=2,
                commitment=arithmetic.digest(b"further"),
            ),
        )
        self.assertEqual(judgment.placement, warden.ROTATION)


class Accepting(unittest.TestCase):
    """Spending an invitation whole, which is two rotate-and-asks.

    An invitation is spent, not held: the granter minted both keys behind it,
    so until the holder stands on one this ground generated, the granter can
    still speak as the holder at its own door.
    """

    def setUp(self) -> None:
        # The granting door, and an invitation to its ordinary being.
        self.granter = a_warden()
        self.invitation = self.granter.invite(BEING_PK, VOICE_SECRET, HEIR_SECRET)

        # The accepting ground, whose mint walks a fixed list so the case is
        # deterministic and every drawn key is distinct.
        self.drawn = [seed(byte) for byte in range(30, 90)]
        self.holder = warden.Warden(
            seed(21),
            seed(22),
            mint=lambda: self.drawn.pop(0),
            heir=arithmetic.signing_public(seed(23)),
            delivery=self,
        )
        self.sent: list = []

    # -- this case's own delivery: bytes straight to the granter's one door

    def arrived(self, padlock: bytes, via) -> None:
        return None

    async def send(self, row, message: bytes):
        self.sent.append(message)
        return (await self.granter.judge(message)).answer

    def test_accept_costs_two_rotations_and_the_second_carries_the_ask(self) -> None:
        [handle] = asyncio.run(self.holder.accept(self.invitation, label="lamp"))

        # Two rotations, then the blueprint of the class the grant opened.
        self.assertEqual(len(self.sent), 3)
        self.assertEqual(handle._quo.declares(), ("lit",))

        # The far door's standing now stands on the voice this ground drew,
        # and commits to the heir beside it.
        row = self.holder.outbound[0]
        standing = self.granter.inbound[0]
        self.assertEqual(standing.voice, row.voice)
        self.assertEqual(
            standing.commitment,
            arithmetic.commitment(self.granter.name, row.heir),
        )
        self.assertNotIn(row.voice, (VOICE, HEIR))

    def test_every_key_the_granter_held_is_dead_afterwards(self) -> None:
        asyncio.run(self.holder.accept(self.invitation))
        row = self.holder.outbound[0]

        # The granter minted the invitation's voice and its heir and has seen
        # both. Neither reaches the standing any more.
        for secret in (VOICE_SECRET, HEIR_SECRET):
            with self.subTest(secret.hex()):
                judgment = judged(
                    self.granter, say(self.granter, secret=secret, seq=90)
                )
                self.assertEqual(judgment.placement, warden.STRANGER)

        # Only the key this ground drew stands, and the granter never saw it.
        judgment = judged(
            self.granter,
            say(self.granter, secret=row.secret, seq=90, being=BEING_PK),
        )
        self.assertEqual(judgment.placement, warden.ASK)
        self.assertNotIn(row.secret, (VOICE_SECRET, HEIR_SECRET))

    def test_accept_without_a_road_is_refused_before_anything_is_spent(self) -> None:
        self.holder.delivery = None
        self.assertEqual(asyncio.run(self.holder.accept(self.invitation)), ())
        # The standing still stands on the voice the granter minted: nothing
        # was sent and nothing rotated.
        self.assertEqual(self.granter.inbound[0].voice, VOICE)
        self.assertEqual(self.sent, [])

    def test_the_raw_path_stays_open_and_reaches_the_same_place(self) -> None:
        """accept is stand and ask composed, and neither is closed off."""
        row = self.holder.stand(self.invitation)
        voice_secret = seed(40)
        voice = arithmetic.signing_public(voice_secret)
        first, _ = self.holder.ask(row, seed(41), next_heir=voice_secret)
        asyncio.run(self.send(row, first))
        # The row moved with the rotation: it stands on the key that signed and
        # keeps the secret behind the one it committed to, so the caller does
        # no bookkeeping of its own between the two acts.
        self.assertEqual(row.voice, self.invitation.heir)
        self.assertEqual(row.heir, voice)
        heir = arithmetic.signing_public(seed(42))
        second, _ = self.holder.ask(row, seed(43), next_heir=seed(42))
        asyncio.run(self.send(row, second))
        self.assertEqual(row.voice, voice)

        standing = self.granter.inbound[0]
        self.assertEqual(standing.voice, voice)
        self.assertEqual(
            standing.commitment, arithmetic.commitment(self.granter.name, heir)
        )


if __name__ == "__main__":
    unittest.main()
