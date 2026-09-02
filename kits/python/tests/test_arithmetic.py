"""Every arithmetic vector in the pinned corpus, and the whole of the material."""

import json
import pathlib
import unittest

from quo import arithmetic

VECTORS = pathlib.Path(__file__).resolve().parents[2] / "js" / "vectors"


def load(area: str) -> dict:
    with (VECTORS / f"{area}.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def hexed(vector: dict, field: str) -> bytes:
    return bytes.fromhex(vector[field])


class Corpus(unittest.TestCase):
    """The eighteen vectors of arithmetic.json, each reproduced by its own shape."""

    def setUp(self) -> None:
        self.corpus = load("arithmetic")
        self.assertEqual(self.corpus["area"], "arithmetic")
        self.assertEqual(self.corpus["encoding"], "hex")
        self.vectors = self.corpus["vectors"]

    def test_every_vector_is_claimed_by_a_case(self) -> None:
        """No vector may be skipped: the shapes below must cover all eighteen."""
        counted = (
            len(self.hashes())
            + len(self.commitments())
            + len(self.signing_pairs())
            + len(self.sealing_pairs())
            + len(self.signatures())
            + len(self.bad_signatures())
            + len(self.agreements())
            + len(self.derivations())
            + len(self.seals())
            + len(self.bad_seals())
        )
        self.assertEqual(counted, len(self.vectors))
        self.assertEqual(len(self.vectors), 18)

    # -- the shapes -------------------------------------------------------

    def hashes(self) -> list:
        return [v for v in self.vectors if "hash" in v]

    def commitments(self) -> list:
        return [v for v in self.vectors if "commitment" in v]

    def signing_pairs(self) -> list:
        return [
            v
            for v in self.vectors
            if "pk" in v and "shared" not in v and "Ed25519" in v["name"]
        ]

    def sealing_pairs(self) -> list:
        return [
            v
            for v in self.vectors
            if "pk" in v and "shared" not in v and "X25519" in v["name"]
        ]

    def signatures(self) -> list:
        return [v for v in self.vectors if "signature" in v and not v.get("refuses")]

    def bad_signatures(self) -> list:
        return [v for v in self.vectors if "signature" in v and v.get("refuses")]

    def agreements(self) -> list:
        return [v for v in self.vectors if "shared" in v and "pk" in v]

    def derivations(self) -> list:
        return [v for v in self.vectors if "key" in v and "nonce" in v]

    def seals(self) -> list:
        return [v for v in self.vectors if "ciphertext" in v and not v.get("refuses")]

    def bad_seals(self) -> list:
        return [v for v in self.vectors if "ciphertext" in v and v.get("refuses")]

    # -- the assertions ---------------------------------------------------

    def test_hash(self) -> None:
        cases = self.hashes()
        self.assertEqual(len(cases), 2)
        for vector in cases:
            with self.subTest(vector["name"]):
                self.assertEqual(
                    arithmetic.digest(hexed(vector, "input")).hex(), vector["hash"]
                )

    def test_commitment(self) -> None:
        cases = self.commitments()
        self.assertEqual(len(cases), 2)
        for vector in cases:
            with self.subTest(vector["name"]):
                self.assertEqual(
                    arithmetic.commitment(
                        hexed(vector, "warden"), hexed(vector, "heir")
                    ).hex(),
                    vector["commitment"],
                )

    def test_signing_pair(self) -> None:
        cases = self.signing_pairs()
        self.assertEqual(len(cases), 1)
        for vector in cases:
            with self.subTest(vector["name"]):
                self.assertEqual(
                    arithmetic.signing_public(hexed(vector, "secret")).hex(),
                    vector["pk"],
                )

    def test_sealing_pair(self) -> None:
        cases = self.sealing_pairs()
        self.assertEqual(len(cases), 1)
        for vector in cases:
            with self.subTest(vector["name"]):
                self.assertEqual(
                    arithmetic.sealing_public(hexed(vector, "secret")).hex(),
                    vector["pk"],
                )

    def test_signature(self) -> None:
        cases = self.signatures()
        self.assertEqual(len(cases), 2)
        for vector in cases:
            with self.subTest(vector["name"]):
                message = hexed(vector, "message")
                self.assertEqual(
                    arithmetic.sign(hexed(vector, "secret"), message).hex(),
                    vector["signature"],
                )
                self.assertTrue(
                    arithmetic.verify(
                        hexed(vector, "voice"), message, hexed(vector, "signature")
                    )
                )

    def test_signature_refused(self) -> None:
        cases = self.bad_signatures()
        self.assertEqual(len(cases), 4)
        for vector in cases:
            with self.subTest(vector["name"]):
                self.assertFalse(
                    arithmetic.verify(
                        hexed(vector, "voice"),
                        hexed(vector, "message"),
                        hexed(vector, "signature"),
                    )
                )

    def test_agreement(self) -> None:
        cases = self.agreements()
        self.assertEqual(len(cases), 2)
        for vector in cases:
            with self.subTest(vector["name"]):
                self.assertEqual(
                    arithmetic.agree(
                        hexed(vector, "secret"), hexed(vector, "pk")
                    ).hex(),
                    vector["shared"],
                )

    def test_derivation(self) -> None:
        cases = self.derivations()
        self.assertEqual(len(cases), 1)
        for vector in cases:
            with self.subTest(vector["name"]):
                self.assertEqual(vector["salt"], "")
                self.assertEqual(hexed(vector, "info"), arithmetic.SEAL_INFO)
                key, nonce = arithmetic.derive(hexed(vector, "shared"))
                self.assertEqual(key.hex(), vector["key"])
                self.assertEqual(nonce.hex(), vector["nonce"])
                self.assertEqual(len(key) + len(nonce), 44)

    def test_seal(self) -> None:
        cases = self.seals()
        self.assertEqual(len(cases), 1)
        for vector in cases:
            with self.subTest(vector["name"]):
                shared = hexed(vector, "shared")
                additional = hexed(vector, "additional")
                plaintext = hexed(vector, "plaintext")
                box = arithmetic.seal(shared, additional, plaintext)
                self.assertEqual(box.hex(), vector["ciphertext"])
                self.assertEqual(len(box), len(plaintext) + arithmetic.TAG_LENGTH)
                self.assertEqual(arithmetic.unseal(shared, additional, box), plaintext)

    def test_seal_refused(self) -> None:
        cases = self.bad_seals()
        self.assertEqual(len(cases), 2)
        for vector in cases:
            with self.subTest(vector["name"]):
                with self.assertRaises(arithmetic.ArithmeticError):
                    arithmetic.unseal(
                        hexed(vector, "shared"),
                        hexed(vector, "additional"),
                        hexed(vector, "ciphertext"),
                    )


class Material(unittest.TestCase):
    """Every key in material.json: derived from its secret, or a declared root."""

    DERIVED_SIGNING = {
        "wardenName": "wardenNameSecret",
        "voice": "voiceSecret",
        "voiceHeir": "voiceHeirSecret",
        "successor": "successorSecret",
        "nextHeir": "nextHeirSecret",
    }
    DERIVED_SEALING = {
        "padlock": "padlockSecret",
        "returnPadlock": "returnPadlockSecret",
        "ephemeral": "ephemeralSecret",
    }
    DERIVED_COMMITMENTS = {
        "wardenCommitment": ("wardenName", "wardenHeir"),
        "voiceHeirCommitment": ("wardenName", "voiceHeir"),
        "beingCommitment": ("wardenName", "beingHeir"),
        "nextHeirCommitment": ("wardenName", "nextHeir"),
    }
    ROOTS = frozenset(
        {
            "wardenNameSecret",
            "voiceSecret",
            "voiceHeirSecret",
            "nextHeirSecret",
            "successorSecret",
            "padlockSecret",
            "returnPadlockSecret",
            "ephemeralSecret",
            "wardenHeir",
            # A being's identity, and the heir its commitment is over. Nothing
            # in the material derives these; other areas do.
            "being",
            "beingHeir",
        }
    )

    def setUp(self) -> None:
        corpus = load("material")
        self.assertEqual(corpus["area"], "material")
        self.assertEqual(corpus["encoding"], "hex")
        self.assertNotIn("vectors", corpus)
        self.material = corpus["material"]

    def test_every_entry_is_thirty_two_bytes(self) -> None:
        for name, value in self.material.items():
            with self.subTest(name):
                self.assertEqual(len(bytes.fromhex(value)), arithmetic.KEY_LENGTH)

    def test_every_entry_is_accounted_for(self) -> None:
        claimed = (
            set(self.DERIVED_SIGNING)
            | set(self.DERIVED_SEALING)
            | set(self.DERIVED_COMMITMENTS)
            | self.ROOTS
        )
        self.assertEqual(claimed, set(self.material))
        self.assertEqual(len(self.material), 23)

    def test_signing_pairs(self) -> None:
        for public, secret in self.DERIVED_SIGNING.items():
            with self.subTest(public):
                self.assertEqual(
                    arithmetic.signing_public(
                        bytes.fromhex(self.material[secret])
                    ).hex(),
                    self.material[public],
                )

    def test_sealing_pairs(self) -> None:
        for public, secret in self.DERIVED_SEALING.items():
            with self.subTest(public):
                self.assertEqual(
                    arithmetic.sealing_public(
                        bytes.fromhex(self.material[secret])
                    ).hex(),
                    self.material[public],
                )

    def test_commitments(self) -> None:
        for name, (warden, heir) in self.DERIVED_COMMITMENTS.items():
            with self.subTest(name):
                self.assertEqual(
                    arithmetic.commitment(
                        bytes.fromhex(self.material[warden]),
                        bytes.fromhex(self.material[heir]),
                    ).hex(),
                    self.material[name],
                )

    def test_the_agreement_meets_from_either_side(self) -> None:
        """The padlock and the ephemeral pair agree on the same shared secret."""
        one = arithmetic.agree(
            bytes.fromhex(self.material["ephemeralSecret"]),
            bytes.fromhex(self.material["padlock"]),
        )
        other = arithmetic.agree(
            bytes.fromhex(self.material["padlockSecret"]),
            bytes.fromhex(self.material["ephemeral"]),
        )
        self.assertEqual(one, other)


class DeadAgreement(unittest.TestCase):
    """ "An agreement that hands back thirty-two zero bytes is refused at the
    point of agreement": the padlock was not a real key, and a seal derived
    from it would protect nothing.
    """

    SECRET = bytes(range(32))

    def test_a_degenerate_agreement_is_the_kits_own_refusal(self) -> None:
        # The identity and the point of order two produce the degenerate
        # output whatever secret they are agreed against.
        for padlock in (
            bytes(32),
            bytes.fromhex(
                "0100000000000000000000000000000000000000000000000000000000000000"
            ),
            bytes.fromhex(
                "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"
            ),
        ):
            with self.subTest(padlock.hex()):
                # Not the platform's ValueError leaking through: this module's
                # own refusal, which is what every caller catches.
                with self.assertRaises(arithmetic.ArithmeticError):
                    arithmetic.agree(self.SECRET, padlock)

    def test_a_real_padlock_still_agrees(self) -> None:
        padlock_secret = bytes(range(32, 64))
        shared = arithmetic.agree(
            self.SECRET, arithmetic.sealing_public(padlock_secret)
        )
        self.assertEqual(len(shared), arithmetic.KEY_LENGTH)
        self.assertNotEqual(shared, bytes(32))


class Refusals(unittest.TestCase):
    """A key is 32 bytes; anything else never reaches an algorithm."""

    SECRET = bytes(range(32))

    def test_a_short_key_is_refused(self) -> None:
        for call in (
            lambda k: arithmetic.signing_public(k),
            lambda k: arithmetic.sealing_public(k),
            lambda k: arithmetic.sign(k, b""),
            lambda k: arithmetic.agree(k, self.SECRET),
            lambda k: arithmetic.agree(self.SECRET, k),
            lambda k: arithmetic.derive(k),
            lambda k: arithmetic.commitment(k, self.SECRET),
            lambda k: arithmetic.commitment(self.SECRET, k),
            lambda k: arithmetic.verify(k, b"", bytes(64)),
        ):
            for bad in (b"", bytes(31), bytes(33)):
                with self.subTest(bad=len(bad)):
                    with self.assertRaises(arithmetic.ArithmeticError):
                        call(bad)

    def test_a_signature_of_the_wrong_length_does_not_verify(self) -> None:
        voice = arithmetic.signing_public(self.SECRET)
        for bad in (b"", bytes(63), bytes(65)):
            with self.subTest(length=len(bad)):
                self.assertFalse(arithmetic.verify(voice, b"", bad))

    def test_a_box_shorter_than_the_tag_is_refused(self) -> None:
        shared = arithmetic.agree(self.SECRET, arithmetic.sealing_public(self.SECRET))
        with self.assertRaises(arithmetic.ArithmeticError):
            arithmetic.unseal(shared, b"", bytes(15))

    def test_an_empty_plaintext_seals_to_the_tag_alone(self) -> None:
        shared = arithmetic.agree(self.SECRET, arithmetic.sealing_public(self.SECRET))
        box = arithmetic.seal(shared, b"aad", b"")
        self.assertEqual(len(box), arithmetic.TAG_LENGTH)
        self.assertEqual(arithmetic.unseal(shared, b"aad", box), b"")


if __name__ == "__main__":
    unittest.main()
