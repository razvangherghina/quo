"""A being migrated away, end to end, and the peer that follows it.

Articles XIII and XIV. **Migration is a double rotation**: to the committed
heir, then immediately to a key the destination warden generated and the origin
never saw. It is **one message sent twice** — once by the origin, once by the
destination — and after it every key the old warden held for the being is dead.

Nothing here stops at the routing. The cargo is packed, spent as a real
``receive`` through the destination's door, announced twice as real sealed
envelopes, judged and believed at a third house, and that third house then
reaches the being at its new address and is answered. A test that stopped at
asserting the routing is how the hole this suite fills survived.
"""

import unittest

from quo import arithmetic, envelope, notation, warden, wire

LAMP = "Lamp\n  lit() bool\n"
LAMP_DIGEST = notation.digest(LAMP)

B32 = notation.Base("b32")
MAYBE_WORD = notation.Maybe(warden.WORD_TYPE)


def seed(byte: int) -> bytes:
    return bytes([byte]) * arithmetic.KEY_LENGTH


def a_door(name: int, padlock: int, heir: int, draws) -> warden.Warden:
    """One house, with every draw of randomness handed to it in order."""
    drawn = list(draws)
    return warden.Warden(
        seed(name),
        seed(padlock),
        mint=lambda: drawn.pop(0),
        heir=arithmetic.signing_public(seed(heir)),
    )


def lamp(name: str, args: bytes, leash: warden.Leash):
    return b"lit" if name == "lit" else None


class AMigrationEndToEnd(unittest.TestCase):
    def setUp(self) -> None:
        self.origin = a_door(1, 2, 3, [seed(byte) for byte in range(60, 80)])
        # The destination's first two draws are the keys `receive` mints: the
        # name the being is known by here and that name's heir. Everything
        # after is an answer's ephemeral.
        self.destination = a_door(
            11, 12, 13, [seed(90), seed(91)] + [seed(byte) for byte in range(100, 120)]
        )
        self.peer = a_door(21, 22, 23, [seed(byte) for byte in range(130, 150)])
        self.destination.hints = ("https://landing.example",)

        # The traveller, and a peer standing at it.
        self.traveller = self.origin.hold(LAMP, lamp, seed(30), seed(31))
        self.origin.beings[self.traveller].cells = b"a lamp's own memory"
        invitation = self.origin.invite(
            self.traveller, seed(32), seed(33), hints=("https://origin.example",)
        )
        self.row = self.peer.stand(invitation)

        # The peer speaks once. That is how the origin learns the way back to
        # it and how the standing changes hands; both travel in the cargo.
        message, _ = self.peer.ask(
            self.row,
            seed(34),
            being=self.traveller,
            method={"name": "lit", "args": b""},
            next_heir=seed(35),
        )
        self.assertEqual(self.origin.judge(message).placement, warden.ROTATION)
        self.peer_secret = self.row.secret

        # The commitment a describe hands over, without which the peer holds
        # no material to believe this being's succession.
        self.committed = arithmetic.signing_public(seed(31))
        self.peer.note(
            self.row,
            self.traveller,
            arithmetic.commitment(self.origin.name, self.committed),
        )

        # The destination holds the class — the digest identifies rather than
        # delivers — and a standing for the origin to spend `receive` with.
        self.assertEqual(self.destination.expect(LAMP, lamp), LAMP_DIGEST)
        gate = self.destination.invite(self.destination.name, seed(36), seed(37))
        self.gate = self.origin.stand(gate)

    def receive(self, cargo: dict) -> bytes:
        """Spend the cargo through the destination's door, as any ask is."""
        blob = wire.encode(warden.CARGO_TYPE, cargo, warden.WARDEN_RECORDS)
        message, _ = self.origin.ask(
            self.gate,
            seed(38),
            being=self.destination.name,
            method={"name": "receive", "args": blob},
            next_heir=seed(39),
        )
        judgment = self.destination.judge(message)
        answered = self.origin.hear(judgment.answer)
        return wire.decode(B32, answered["data"], warden.WARDEN_RECORDS)

    def test_xiii_a_being_is_migrated_away_and_its_peer_follows_it(self) -> None:
        # The cargo is packed under the name the first rotation gives the
        # being, so the second rotation succeeds the name the peer holds by
        # then.
        cargo = self.origin.pack(self.traveller)
        self.assertEqual(cargo["being"], self.committed)
        self.assertEqual(cargo["cells"], b"a lamp's own memory")
        # The register of standings travels, the replay record whole with it.
        self.assertEqual(len(cargo["standings"]), 1)
        self.assertEqual(cargo["standings"][0]["beings"], [self.committed])
        self.assertEqual(cargo["standings"][0]["mark"], 1)
        self.assertEqual(cargo["standings"][0]["padlock"], self.peer.padlock)

        commitment = self.receive(cargo)
        arrived_as = arithmetic.signing_public(seed(90))
        self.assertEqual(
            commitment, arithmetic.commitment(self.destination.name, arrived_as)
        )

        # The destination's half. The word is composed by the kit and not by
        # the host: a house that had to invent the announcement would invent a
        # different one at every ground.
        second_word, second_secret, landed_peers = self.destination.landed(
            ["https://landing.example"]
        )
        self.assertEqual(second_word["being"], cargo["being"])
        self.assertEqual(second_word["successor"], arrived_as)
        self.assertEqual(
            second_word["commitment"],
            arithmetic.commitment(
                self.destination.name, arithmetic.signing_public(seed(91))
            ),
        )
        self.assertEqual(len(landed_peers), 1)
        self.assertEqual(landed_peers[0].padlock, self.peer.padlock)

        # The origin's half, carrying as its next commitment the one `receive`
        # answered — the one fact it cannot invent.
        first_word, first_secret, told = self.origin.depart(
            self.traveller,
            commitment,
            self.destination.name,
            self.destination.padlock,
            ["https://landing.example"],
        )
        self.assertEqual(first_word["successor"], self.committed)
        self.assertEqual(len(told), 1)
        # Every key the old warden held for this being is dead.
        self.assertNotIn(self.traveller, self.origin.beings)
        self.assertNotIn(self.traveller, self.origin.secrets)

        first = self.origin.news(told[0], first_secret, first_word, 1, seed(40))
        self.assertEqual(self.peer.judge(first).placement, warden.NEWS)
        # Believed news rewrites the row entire, and the being's own entry with
        # it: the peer now reaches the being by the name the first rotation
        # moved it to, at the house that took it in.
        self.assertEqual(self.row.warden, self.destination.name)
        self.assertEqual(self.row.padlock, self.destination.padlock)
        self.assertEqual(self.row.hints, ("https://landing.example",))
        self.assertEqual(self.row.beings, {self.committed: commitment})

        # And the second, from the new house itself, signed by the key it
        # generated and the origin never saw. A being's succession starts the
        # news mark fresh, so it counts from one again.
        second = self.destination.news(
            landed_peers[0], second_secret, second_word, 1, seed(41)
        )
        self.assertEqual(self.peer.judge(second).placement, warden.NEWS)
        self.assertEqual(self.row.beings, {arrived_as: second_word["commitment"]})

        # The whole point of the move: the peer reaches the being at its new
        # house, by the name that house minted, and is answered.
        message, _ = self.peer.ask(
            self.row,
            seed(42),
            being=arrived_as,
            method={"name": "lit", "args": b""},
        )
        judgment = self.destination.judge(message)
        self.assertEqual(judgment.placement, warden.ASK)
        self.assertEqual(self.peer.hear(judgment.answer)["data"], b"lit")

        # The old door only points: it keeps the succession it published and
        # every other ask meets silence.
        self.assertEqual(self.origin.pointers[self.traveller], first_word)
        with self.assertRaises(warden.Silence):
            self.origin.judge(
                self.say_to(self.origin, self.peer_secret, 3, self.traveller)
            )

        # The new door points as well, for the name the being wore before, and
        # the word it answers with is the one it announced.
        arg = wire.encode(notation.Base("being"), cargo["being"], warden.WARDEN_RECORDS)
        message, _ = self.peer.ask(
            self.row,
            seed(43),
            being=self.destination.name,
            method={"name": "moved", "args": arg},
        )
        judgment = self.destination.judge(message)
        heard = self.peer.hear(judgment.answer)
        self.assertEqual(
            wire.decode(MAYBE_WORD, heard["data"], warden.WARDEN_RECORDS),
            second_word,
        )

    def test_xiii_a_stranger_may_not_push_a_being_into_a_door(self) -> None:
        """`receive` is an ordinary field spent by an ordinary standing.

        A door any stranger could push a being into is a door with no gate, and
        the refusal is the same silence as every other.
        """
        cargo = self.origin.pack(self.traveller)
        blob = wire.encode(warden.CARGO_TYPE, cargo, warden.WARDEN_RECORDS)
        with self.assertRaises(warden.Silence):
            self.destination.judge(
                self.say_to(
                    self.destination,
                    seed(50),
                    1,
                    self.destination.name,
                    {"name": "receive", "args": blob},
                )
            )

    def say_to(
        self,
        door: warden.Warden,
        secret: bytes,
        seq: int,
        being: bytes,
        call=None,
    ) -> bytes:
        record = {
            "voice": arithmetic.signing_public(secret),
            "recipient": door.name,
            "commitment": None,
            "seq": seq,
            "padlock": self.peer.padlock,
            "hints": [],
            "allowance": {"time": 5000, "hops": 8},
            "being": being,
            "method": call if call is not None else {"name": "lit", "args": b""},
        }
        return envelope.seal(envelope.SAY, record, secret, door.padlock, seed(51))


if __name__ == "__main__":
    unittest.main()
