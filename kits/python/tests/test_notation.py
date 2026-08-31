"""Every notation vector in the pinned corpus, reproduced."""

import json
import pathlib
import unittest

from quo import notation

VECTORS = (
    pathlib.Path(__file__).resolve().parents[2] / "js" / "vectors" / "notation.json"
)


def load() -> dict:
    with VECTORS.open(encoding="utf-8") as handle:
        return json.load(handle)


class Corpus(unittest.TestCase):
    def setUp(self) -> None:
        self.corpus = load()
        self.assertEqual(self.corpus["area"], "notation")
        self.assertEqual(self.corpus["encoding"], "hex")

    def test_every_vector(self) -> None:
        vectors = self.corpus["vectors"]
        self.assertGreater(len(vectors), 0)
        accepted = 0
        refused = 0
        for vector in vectors:
            with self.subTest(vector["name"]):
                text = vector["blueprint"]
                if vector.get("refuses"):
                    refused += 1
                    with self.assertRaises(notation.NotationError):
                        notation.digest(text)
                    continue
                accepted += 1
                self.assertEqual(
                    notation.canonical(text).hex(),
                    vector["canonical"],
                    "canonical bytes",
                )
                self.assertEqual(
                    notation.digest(text).hex(), vector["digest"], "digest"
                )
        self.assertEqual(accepted + refused, len(vectors))

    def test_canonical_text_round_trips(self) -> None:
        for vector in self.corpus["vectors"]:
            if vector.get("refuses"):
                continue
            with self.subTest(vector["name"]):
                blueprint = notation.parse(vector["blueprint"])
                self.assertEqual(notation.render(blueprint), vector["blueprint"])


class Grammar(unittest.TestCase):
    """Refusals Article IV names that the corpus does not carry a case for."""

    def refuses(self, text: str) -> None:
        with self.assertRaises(notation.NotationError):
            notation.parse(text)

    def test_argument_named_twice(self) -> None:
        self.refuses("Small\n  pair(one text, one int) bool\n")

    def test_record_declared_twice(self) -> None:
        self.refuses("Order\n  first() a\n\na\n  x int\n\na\n  y int\n")

    def test_record_wearing_a_closed_type_name(self) -> None:
        self.refuses("Order\n  first() text\n\ntext\n  x int\n")

    def test_record_wearing_the_class_name(self) -> None:
        self.refuses("Order\n  first() a\n\na\n  x int\n\nOrder\n  y int\n")

    def test_combinators_compose(self) -> None:
        text = "Small\n  a() [text?]\n  b() [int]?\n  c() [[bool]]\n"
        self.assertEqual(notation.render(notation.parse(text)), text)

    def test_field_order_is_identity(self) -> None:
        one = notation.digest("Small\n  a() bool\n  b() int\n")
        two = notation.digest("Small\n  b() int\n  a() bool\n")
        self.assertNotEqual(one, two)


if __name__ == "__main__":
    unittest.main()
