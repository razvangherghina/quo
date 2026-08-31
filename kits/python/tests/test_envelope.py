"""Every envelope vector in the pinned corpus, reproduced.

The file carries four shapes: a record with its bytes, the signature over a
payload, a whole sealed envelope with the keys that made it, and an envelope
that must be refused. A vector whose shape this file does not recognise fails
rather than being skipped, and a refusal is asserted as strictly as an
acceptance.
"""

import json
import pathlib
import unittest

from quo import arithmetic, envelope, notation, wire

from test_wire import UnknownShape, from_json, under_test

VECTORS = (
    pathlib.Path(__file__).resolve().parents[2] / "js" / "vectors" / "envelope.json"
)

RECORDS = 6
SIGNATURES = 1
SEALED = 2
REFUSED = 9

RECORD_SHAPE = {"name", "law", "blueprint", "bytes", "value"}
SIGNATURE_SHAPE = {"name", "law", "payload", "voice", "secret", "signature"}
SEALED_SHAPE = {
    "name",
    "law",
    "value",
    "padlock",
    "padlockSecret",
    "voiceSecret",
    "ephemeralSecret",
    "envelope",
}
REFUSED_SHAPE = {"name", "law", "padlockSecret", "envelope", "refuses"}


def load() -> dict:
    with VECTORS.open(encoding="utf-8") as handle:
        return json.load(handle)


def kind_of(type_: notation.Type) -> int:
    """The byte that names the record a probe answers."""
    if not isinstance(type_, notation.Base):
        raise UnknownShape(f"a probe answering {type_}")
    if type_.name == "say":
        return envelope.SAY
    if type_.name == "answer":
        return envelope.ANSWER
    raise UnknownShape(f"a probe answering {type_.name!r}")


class Corpus(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = load()
        self.assertEqual(self.corpus["area"], "envelope")
        self.assertEqual(self.corpus["encoding"], "hex")
        self.vectors = self.corpus["vectors"]

    def test_the_file_holds_the_shapes_this_suite_reads(self) -> None:
        self.assertEqual(len(self.vectors), RECORDS + SIGNATURES + SEALED + REFUSED)
        for vector in self.vectors:
            with self.subTest(vector["name"]):
                keys = set(vector)
                self.assertIn(
                    keys,
                    [RECORD_SHAPE, SIGNATURE_SHAPE, SEALED_SHAPE, REFUSED_SHAPE],
                    f"an unrecognised vector shape: {sorted(keys)}",
                )

    def test_every_record_vector(self) -> None:
        seen = 0
        for vector in self.vectors:
            if set(vector) != RECORD_SHAPE:
                continue
            with self.subTest(vector["name"]):
                seen += 1
                type_, records = under_test(vector["blueprint"])
                kind = kind_of(type_)
                mine = self._blocks(envelope.RECORDS)
                for name, text in self._blocks(records).items():
                    self.assertEqual(
                        text, mine.get(name), "the corpus's block is the kit's own"
                    )
                value = from_json(type_, vector["value"], records)
                self.assertEqual(
                    envelope.encode_record(kind, value).hex(),
                    vector["bytes"],
                    "encoded bytes",
                )
                read = envelope.decode_record(kind, bytes.fromhex(vector["bytes"]))
                self.assertEqual(read, value, "decoded value")
                self.assertEqual(
                    envelope.encode_record(kind, read).hex(),
                    vector["bytes"],
                    "re-encoded bytes",
                )
        self.assertEqual(seen, RECORDS)

    def _blocks(self, records) -> dict:
        """The record blocks a blueprint declares, as their canonical text."""
        return {name: block.render() for name, block in records.items()}

    def test_every_signature_vector(self) -> None:
        seen = 0
        for vector in self.vectors:
            if set(vector) != SIGNATURE_SHAPE:
                continue
            with self.subTest(vector["name"]):
                seen += 1
                secret = bytes.fromhex(vector["secret"])
                voice = bytes.fromhex(vector["voice"])
                body = bytes.fromhex(vector["payload"])
                self.assertEqual(
                    arithmetic.signing_public(secret).hex(), vector["voice"]
                )
                self.assertEqual(
                    arithmetic.sign(secret, body).hex(), vector["signature"]
                )
                self.assertTrue(
                    arithmetic.verify(voice, body, bytes.fromhex(vector["signature"]))
                )
                self.assertEqual(body[0], envelope.SAY, "the byte names the record")
                record = envelope.decode_record(envelope.SAY, body[1:])
                self.assertEqual(record["voice"], voice, "the signer's key travels")
                self.assertEqual(
                    envelope.sign_payload(secret, envelope.SAY, record).hex(),
                    vector["payload"] + vector["signature"],
                    "the signature is the last sixty-four bytes inside the seal",
                )
        self.assertEqual(seen, SIGNATURES)

    def test_every_sealed_vector(self) -> None:
        seen = 0
        for vector in self.vectors:
            if set(vector) != SEALED_SHAPE:
                continue
            with self.subTest(vector["name"]):
                seen += 1
                padlock = bytes.fromhex(vector["padlock"])
                padlock_secret = bytes.fromhex(vector["padlockSecret"])
                voice_secret = bytes.fromhex(vector["voiceSecret"])
                ephemeral_secret = bytes.fromhex(vector["ephemeralSecret"])
                self.assertEqual(
                    arithmetic.sealing_public(padlock_secret), padlock, "the padlock"
                )
                value = from_json(envelope.SAY_TYPE, vector["value"], envelope.RECORDS)
                sealed = envelope.seal(
                    envelope.SAY, value, voice_secret, padlock, ephemeral_secret
                )
                self.assertEqual(sealed.hex(), vector["envelope"], "the envelope")
                self.assertEqual(
                    sealed[: envelope.EPHEMERAL_LENGTH],
                    arithmetic.sealing_public(ephemeral_secret),
                    "the ephemeral pk is stapled to the lid",
                )
                record = envelope.unseal(
                    padlock_secret, bytes.fromhex(vector["envelope"]), envelope.SAY
                )
                self.assertEqual(record, value)
                with self.assertRaises(envelope.EnvelopeError):
                    envelope.unseal(
                        padlock_secret,
                        bytes.fromhex(vector["envelope"]),
                        envelope.ANSWER,
                    )
        self.assertEqual(seen, SEALED)

    def test_every_refused_vector(self) -> None:
        seen = 0
        for vector in self.vectors:
            if set(vector) != REFUSED_SHAPE:
                continue
            with self.subTest(vector["name"]):
                seen += 1
                self.assertTrue(vector["refuses"])
                with self.assertRaises(envelope.EnvelopeError):
                    envelope.unseal(
                        bytes.fromhex(vector["padlockSecret"]),
                        bytes.fromhex(vector["envelope"]),
                        envelope.SAY,
                    )
        self.assertEqual(seen, REFUSED)


class TheRecords(unittest.TestCase):
    """Article XI's two records, asserted against the law's own text."""

    def test_the_blueprint_parses_and_renders_back(self) -> None:
        blueprint = notation.parse(envelope.PAYLOAD_BLUEPRINT)
        self.assertEqual(notation.render(blueprint), envelope.PAYLOAD_BLUEPRINT)

    def test_the_records_are_the_four_the_law_names(self) -> None:
        self.assertEqual(
            sorted(envelope.RECORDS), ["allowance", "answer", "method", "say"]
        )

    def test_the_fields_ride_in_the_order_the_law_gives(self) -> None:
        self.assertEqual(
            [field.name for field in envelope.RECORDS["say"].fields],
            [
                "voice",
                "recipient",
                "commitment",
                "seq",
                "padlock",
                "hints",
                "allowance",
                "being",
                "method",
            ],
        )
        self.assertEqual(
            [field.name for field in envelope.RECORDS["answer"].fields],
            ["warden", "seq", "data"],
        )


class TheLeadingByte(unittest.TestCase):
    """Zero for a say, one for an answer, and any other first byte is silence."""

    ANSWER = {
        "warden": bytes(range(32)),
        "seq": 1,
        "data": None,
    }

    def test_the_two_bytes_are_zero_and_one(self) -> None:
        self.assertEqual((envelope.SAY, envelope.ANSWER), (0, 1))

    def test_the_byte_leads_the_payload(self) -> None:
        body = envelope.payload(envelope.ANSWER, self.ANSWER)
        self.assertEqual(body[0], envelope.ANSWER)
        self.assertEqual(body[1:], envelope.encode_record(envelope.ANSWER, self.ANSWER))

    def test_a_byte_that_names_no_record_is_refused(self) -> None:
        for kind in (2, 255):
            with self.subTest(kind):
                with self.assertRaises(envelope.EnvelopeError):
                    envelope.encode_record(kind, self.ANSWER)
                with self.assertRaises(envelope.EnvelopeError):
                    envelope.decode_record(kind, b"")

    def test_bytes_left_over_after_the_record_are_refused(self) -> None:
        body = envelope.encode_record(envelope.ANSWER, self.ANSWER)
        with self.assertRaises(envelope.EnvelopeError):
            envelope.decode_record(envelope.ANSWER, body + b"\x00")


class TheSeal(unittest.TestCase):
    """What crosses is the ephemeral pk and one ciphertext, and nothing else."""

    VOICE_SECRET = bytes([7]) * 32
    PADLOCK_SECRET = bytes([9]) * 32
    EPHEMERAL_SECRET = bytes([11]) * 32

    def say(self) -> dict:
        return {
            "voice": arithmetic.signing_public(self.VOICE_SECRET),
            "recipient": arithmetic.sealing_public(self.PADLOCK_SECRET),
            "commitment": None,
            "seq": 1,
            "padlock": bytes([3]) * 32,
            "hints": ["tcp://ground.example:9000"],
            "allowance": {"time": 30000, "hops": 8},
            "being": None,
            "method": None,
        }

    def sealed(self) -> bytes:
        return envelope.seal(
            envelope.SAY,
            self.say(),
            self.VOICE_SECRET,
            arithmetic.sealing_public(self.PADLOCK_SECRET),
            self.EPHEMERAL_SECRET,
        )

    def test_nothing_but_the_key_and_the_box_is_outside(self) -> None:
        sealed = self.sealed()
        inside = envelope.sign_payload(self.VOICE_SECRET, envelope.SAY, self.say())
        self.assertEqual(
            len(sealed),
            envelope.EPHEMERAL_LENGTH + len(inside) + arithmetic.TAG_LENGTH,
        )

    def test_the_ephemeral_key_is_the_additional_data(self) -> None:
        """Lid and box cannot be mixed and matched."""
        sealed = self.sealed()
        other = arithmetic.sealing_public(bytes([13]) * 32)
        swapped = other + sealed[envelope.EPHEMERAL_LENGTH :]
        with self.assertRaises(envelope.EnvelopeError):
            envelope.unseal(self.PADLOCK_SECRET, swapped, envelope.SAY)

    def test_an_envelope_that_is_only_a_lid_is_refused(self) -> None:
        lid = arithmetic.sealing_public(self.EPHEMERAL_SECRET)
        with self.assertRaises(envelope.EnvelopeError):
            envelope.unseal(self.PADLOCK_SECRET, lid, envelope.SAY)

    def test_an_answer_rides_the_same_road(self) -> None:
        answer = {
            "warden": arithmetic.signing_public(self.VOICE_SECRET),
            "seq": 1,
            "data": b"yes",
        }
        sealed = envelope.seal(
            envelope.ANSWER,
            answer,
            self.VOICE_SECRET,
            arithmetic.sealing_public(self.PADLOCK_SECRET),
            self.EPHEMERAL_SECRET,
        )
        self.assertEqual(
            envelope.unseal(self.PADLOCK_SECRET, sealed, envelope.ANSWER), answer
        )
        with self.assertRaises(envelope.EnvelopeError):
            envelope.unseal(self.PADLOCK_SECRET, sealed, envelope.SAY)

    def test_a_record_presented_under_the_wrong_byte_is_refused(self) -> None:
        answer = {
            "warden": arithmetic.signing_public(self.VOICE_SECRET),
            "seq": 1,
            "data": b"yes",
        }
        body = envelope.payload(envelope.ANSWER, answer)
        turned = bytes([envelope.SAY]) + body[1:]
        inside = turned + arithmetic.sign(self.VOICE_SECRET, body)
        ephemeral = arithmetic.sealing_public(self.EPHEMERAL_SECRET)
        shared = arithmetic.agree(
            self.EPHEMERAL_SECRET, arithmetic.sealing_public(self.PADLOCK_SECRET)
        )
        sealed = ephemeral + arithmetic.seal(shared, ephemeral, inside)
        with self.assertRaises(envelope.EnvelopeError):
            envelope.unseal(self.PADLOCK_SECRET, sealed, envelope.SAY)

    def test_a_fresh_ephemeral_key_makes_a_fresh_envelope(self) -> None:
        first = self.sealed()
        second = envelope.seal(
            envelope.SAY,
            self.say(),
            self.VOICE_SECRET,
            arithmetic.sealing_public(self.PADLOCK_SECRET),
            bytes([17]) * 32,
        )
        self.assertNotEqual(first, second)

    def test_the_core_reaches_no_host(self) -> None:
        source = pathlib.Path(envelope.__file__).read_text(encoding="utf-8")
        for host in ("socket", "http", "asyncio"):
            self.assertNotIn(f"import {host}", source)


class TheWire(unittest.TestCase):
    """The payload is the notation's own encoding and no second format."""

    def test_the_record_is_written_by_the_wire(self) -> None:
        answer = {"warden": bytes(range(32)), "seq": 2, "data": None}
        self.assertEqual(
            envelope.encode_record(envelope.ANSWER, answer),
            wire.encode(envelope.ANSWER_TYPE, answer, envelope.RECORDS),
        )


if __name__ == "__main__":
    unittest.main()
