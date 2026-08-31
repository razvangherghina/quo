"""Every wire vector in the pinned corpus, reproduced.

A vector names a blueprint whose class carries exactly one field; the type
under test is that field's answer type. The JSON value is read by one rule per
type — the corpus README's table — and a shape this file does not recognise
raises rather than being skipped.
"""

import json
import pathlib
import unittest
from typing import Any, Mapping

from quo import notation, wire

VECTORS = pathlib.Path(__file__).resolve().parents[2] / "js" / "vectors" / "wire.json"

ACCEPTED = 41
REFUSED = 12


def load() -> dict:
    with VECTORS.open(encoding="utf-8") as handle:
        return json.load(handle)


class UnknownShape(Exception):
    """A vector whose type this file cannot read. Never skipped."""


def under_test(text: str) -> tuple[notation.Type, dict[str, notation.Block]]:
    blueprint = notation.parse(text)
    fields = blueprint.klass.fields
    if len(fields) != 1 or fields[0].answers is None:
        raise UnknownShape(f"a probe that is not one answering field: {text!r}")
    return fields[0].answers, wire.records_of(blueprint)


def from_json(
    type_: notation.Type, node: Any, records: Mapping[str, notation.Block]
) -> Any:
    if isinstance(type_, notation.Many):
        if not isinstance(node, list):
            raise UnknownShape(f"a list written as {node!r}")
        return [from_json(type_.of, item, records) for item in node]
    if isinstance(type_, notation.Maybe):
        if node is None:
            return None
        return from_json(type_.of, node, records)
    name = type_.name
    if name == "bool":
        if not isinstance(node, bool):
            raise UnknownShape(f"a bool written as {node!r}")
        return node
    if name == "int":
        if not isinstance(node, str):
            raise UnknownShape(f"an int written as {node!r}")
        return int(node)
    if name == "text":
        if not isinstance(node, str):
            raise UnknownShape(f"a text written as {node!r}")
        return node
    if name in ("bytes", "b32", "being"):
        if not isinstance(node, str):
            raise UnknownShape(f"{name} written as {node!r}")
        return bytes.fromhex(node)
    if name == "invitation":
        keys = {"warden", "commitment", "padlock", "heir", "heirSecret", "hints"}
        if not isinstance(node, dict) or set(node) != keys:
            raise UnknownShape(f"an invitation written as {node!r}")
        return wire.Invitation(
            warden=bytes.fromhex(node["warden"]),
            commitment=bytes.fromhex(node["commitment"]),
            padlock=bytes.fromhex(node["padlock"]),
            heir=bytes.fromhex(node["heir"]),
            heir_secret=bytes.fromhex(node["heirSecret"]),
            hints=tuple(node["hints"]),
        )
    if name == "card":
        keys = {"warden", "commitment", "padlock", "hints"}
        if not isinstance(node, dict) or set(node) != keys:
            raise UnknownShape(f"a card written as {node!r}")
        return wire.Card(
            warden=bytes.fromhex(node["warden"]),
            commitment=bytes.fromhex(node["commitment"]),
            padlock=bytes.fromhex(node["padlock"]),
            hints=tuple(node["hints"]),
        )
    block = records.get(name)
    if block is None:
        raise UnknownShape(f"a type no block declares: {name!r}")
    if not isinstance(node, dict) or set(node) != {f.name for f in block.fields}:
        raise UnknownShape(f"a {name} written as {node!r}")
    return {
        field.name: from_json(field.answers, node[field.name], records)
        for field in block.fields
    }


class Corpus(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = load()
        self.assertEqual(self.corpus["area"], "wire")
        self.assertEqual(self.corpus["encoding"], "hex")

    def test_every_vector(self) -> None:
        vectors = self.corpus["vectors"]
        self.assertEqual(len(vectors), ACCEPTED + REFUSED)
        accepted = 0
        refused = 0
        for vector in vectors:
            with self.subTest(vector["name"]):
                type_, records = under_test(vector["blueprint"])
                if vector.get("refuses"):
                    refused += 1
                    self.assertNotIn("value", vector)
                    with self.assertRaises(wire.WireError):
                        wire.decode(type_, bytes.fromhex(vector["bytes"]), records)
                    continue
                accepted += 1
                value = from_json(type_, vector["value"], records)
                self.assertEqual(
                    wire.encode(type_, value, records).hex(),
                    vector["bytes"],
                    "encoded bytes",
                )
                read = wire.decode(type_, bytes.fromhex(vector["bytes"]), records)
                self.assertEqual(read, value, "decoded value")
                self.assertEqual(
                    wire.encode(type_, read, records).hex(),
                    vector["bytes"],
                    "re-encoded bytes",
                )
        self.assertEqual(accepted, ACCEPTED)
        self.assertEqual(refused, REFUSED)

    def test_no_accepted_value_encodes_to_zero_bytes(self) -> None:
        """Article V: no type encodes to zero bytes."""
        for vector in self.corpus["vectors"]:
            if vector.get("refuses"):
                continue
            with self.subTest(vector["name"]):
                self.assertNotEqual(vector["bytes"], "")

    def test_every_vector_is_one_of_the_two_shapes(self) -> None:
        for vector in self.corpus["vectors"]:
            with self.subTest(vector["name"]):
                keys = set(vector)
                self.assertIn("bytes", keys)
                self.assertTrue(
                    keys == {"name", "law", "blueprint", "bytes", "value"}
                    or keys == {"name", "law", "blueprint", "bytes", "refuses"},
                    f"an unrecognised vector shape: {sorted(keys)}",
                )


class Widths(unittest.TestCase):
    """Article V's fixed sizes, asserted directly rather than through a vector."""

    INT = notation.Base("int")
    B32 = notation.Base("b32")
    BOOL = notation.Base("bool")
    TEXT = notation.Base("text")
    BYTES = notation.Base("bytes")

    def test_an_int_is_eight_bytes_most_significant_first(self) -> None:
        self.assertEqual(wire.encode(self.INT, 1).hex(), "0000000000000001")
        self.assertEqual(wire.encode(self.INT, 256).hex(), "0000000000000100")

    def test_an_int_outside_its_range_is_refused(self) -> None:
        for value in (wire.INT_MAX + 1, wire.INT_MIN - 1):
            with self.subTest(value):
                with self.assertRaises(wire.WireError):
                    wire.encode(self.INT, value)

    def test_a_bool_is_not_an_int(self) -> None:
        with self.assertRaises(wire.WireError):
            wire.encode(self.INT, True)

    def test_a_b32_is_exactly_thirty_two_bytes(self) -> None:
        with self.assertRaises(wire.WireError):
            wire.encode(self.B32, bytes(31))
        with self.assertRaises(wire.WireError):
            wire.encode(self.B32, bytes(33))
        self.assertEqual(len(wire.encode(self.B32, bytes(32))), 32)

    def test_a_bool_is_one_byte(self) -> None:
        self.assertEqual(len(wire.encode(self.BOOL, True)), 1)

    def test_an_empty_bytes_is_not_an_absent_bytes(self) -> None:
        """Article V: a `bytes` that is present and empty is not an absent `bytes?`."""
        present = wire.encode(notation.Maybe(self.BYTES), b"")
        absent = wire.encode(notation.Maybe(self.BYTES), None)
        self.assertNotEqual(present, absent)
        self.assertEqual(present.hex(), "010000000000000000")
        self.assertEqual(absent.hex(), "00")

    def test_two_absences_of_a_double_optional_are_distinct(self) -> None:
        """Article V: `T??` is ordinary and its two absences are two byte strings."""
        double = notation.Maybe(notation.Maybe(self.INT))
        outer = wire.encode(double, None)
        inner = bytes([wire.PRESENT]) + wire.encode(notation.Maybe(self.INT), None)
        self.assertNotEqual(outer, inner)
        self.assertEqual(outer.hex(), "00")
        self.assertEqual(inner.hex(), "0100")
        self.assertIsNone(wire.decode(double, inner))
        self.assertIsNone(wire.decode(double, outer))

    def test_a_byte_order_mark_inside_a_text_is_ordinary_content(self) -> None:
        written = wire.encode(self.TEXT, "﻿hi")
        self.assertEqual(written.hex(), "0000000000000005efbbbf6869")
        self.assertEqual(wire.decode(self.TEXT, written), "﻿hi")

    def test_a_negative_length_is_refused_on_decode(self) -> None:
        with self.assertRaises(wire.WireError):
            wire.decode(self.TEXT, bytes.fromhex("ffffffffffffffff"))

    def test_a_lone_surrogate_is_not_a_text(self) -> None:
        with self.assertRaises(wire.WireError):
            wire.encode(self.TEXT, "\ud800")


class Records(unittest.TestCase):
    BLUEPRINT = "Probe\n  probe() pair\n\npair\n  left int\n  right text\n"

    def setUp(self) -> None:
        self.type, self.records = under_test(self.BLUEPRINT)

    def test_a_record_carries_no_names_on_the_wire(self) -> None:
        written = wire.encode(self.type, {"left": 1, "right": "a"}, self.records)
        self.assertEqual(written.hex(), "0000000000000001000000000000000161")

    def test_a_record_missing_a_field_is_refused(self) -> None:
        with self.assertRaises(wire.WireError):
            wire.encode(self.type, {"left": 1}, self.records)

    def test_a_record_carrying_a_field_the_blueprint_does_not_declare(self) -> None:
        with self.assertRaises(wire.WireError):
            wire.encode(self.type, {"left": 1, "right": "a", "x": 1}, self.records)


if __name__ == "__main__":
    unittest.main()
