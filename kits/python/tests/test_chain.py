"""A being standing in the middle of a chain, and the leash it is handed.

Article VIII: the caller's allowance rides the message, and every door hands
onward less than it received. What the middle door hands onward is not a number
it worked out in advance — the budget falls by its own dwell, which is only
known at the moment of handing onward — so what the being is given is the leash
itself and never an allowance.

Every assertion about what was handed onward is read off the sealed message the
being composed, because the allowance is a fact on the wire and not a fact in
this process.
"""

import unittest

from quo import arithmetic, envelope, warden

from test_warden import (
    BEING_COMMITMENT,
    BEING_DIGEST,
    BEING_PK,
    a_warden,
    method,
    opened,
    say,
    seed,
)


def a_far_door() -> warden.Warden:
    """The third house of the chain: its own keys, and a lamp behind them."""
    drawn = [seed(byte) for byte in range(40, 52)]
    door = warden.Warden(
        seed(31),
        seed(32),
        mint=lambda: drawn.pop(0),
        heir=arithmetic.signing_public(seed(33)),
    )
    door.beings[BEING_PK] = warden.Being(
        pk=BEING_PK,
        digest=BEING_DIGEST,
        commitment=BEING_COMMITMENT,
        invoke=lambda name, args, leash: b"lit" if name == "lit" else None,
    )
    return door


class Middleman:
    """An ordinary object that reaches another house before it answers.

    It never learns it has an address and holds no key of the door's. The one
    thing its author could not hold in advance is the allowance, because that
    belongs to the message rather than to the being, so that is the one thing
    the call carries.
    """

    def __init__(self, door: warden.Warden, row: warden.Relation) -> None:
        self.door = door
        self.row = row
        self.received = None
        self.onward = None
        self.refused = False
        #: What this being would ask for if it were free to. It is not.
        self.allowance = None

    def invoke(self, name: str, args: bytes, leash: warden.Leash) -> bytes:
        self.received = leash.received
        try:
            self.onward, _ = self.door.ask(
                self.row,
                seed(60),
                next_heir=seed(61),
                being=BEING_PK,
                method=method("lit"),
                allowance=self.allowance,
                leash=leash,
            )
        except warden.Silence:
            self.refused = True
        return b"lit"


class ABeingInTheMiddleOfAChain(unittest.TestCase):
    def setUp(self) -> None:
        self.far = a_far_door()
        self.middle = a_warden()
        invitation = self.far.invite(BEING_PK, seed(34), seed(35))
        self.row = self.middle.stand(invitation)
        self.man = Middleman(self.middle, self.row)
        self.middle.beings[BEING_PK].invoke = self.man.invoke
        self.middle.grant(
            arithmetic.signing_public(seed(3)),
            arithmetic.commitment(self.middle.name, arithmetic.signing_public(seed(4))),
            [BEING_PK],
        )

    def arriving(self, **over) -> warden.Judgment:
        """One ask at the middle door. The clock is read three times: on
        arrival, by the being when it spends the leash, and at the answer."""
        readings = iter([100, 130, 140])
        return self.middle.judge(
            say(self.middle, being=BEING_PK, call=method("lit"), **over),
            clock=lambda: next(readings),
        )

    def handed(self) -> dict:
        """What the far door received, read off the wire."""
        return envelope.unseal(self.far.padlock_secret, self.man.onward, envelope.SAY)

    def test_viii_the_being_is_handed_what_arrived(self) -> None:
        self.arriving(time=1000, hops=4)
        self.assertEqual(self.man.received, {"time": 1000, "hops": 4})

    def test_viii_the_onward_ask_carries_one_hop_less(self) -> None:
        self.arriving(time=1000, hops=4)
        self.assertEqual(self.handed()["allowance"]["hops"], 3)

    def test_viii_the_onward_budget_falls_by_this_doors_own_dwell(self) -> None:
        """The being spends the leash at the second reading: a dwell of thirty."""
        self.arriving(time=1000, hops=4)
        self.assertEqual(self.handed()["allowance"]["time"], 970)

    def test_viii_a_being_under_a_leash_cannot_widen_one(self) -> None:
        """An allowance handed beside a leash is not the allowance sent."""
        self.man.allowance = {"time": 999_999, "hops": 99}
        self.arriving(time=1000, hops=4)
        self.assertEqual(self.handed()["allowance"], {"time": 970, "hops": 3})

    def test_the_far_door_judges_what_the_being_composed(self) -> None:
        self.arriving(time=1000, hops=4)
        judgment = self.far.judge(self.man.onward)
        self.assertEqual(judgment.placement, warden.ROTATION)
        answer = envelope.unseal(
            self.middle.padlock_secret, judgment.answer, envelope.ANSWER
        )
        self.assertEqual(answer["data"], b"lit")

    def test_viii_a_hop_count_of_zero_forbids_the_onward_ask(self) -> None:
        """What it forbids is onward, and the work already routed stands."""
        judgment = self.arriving(time=1000, hops=0)
        self.assertTrue(self.man.refused)
        self.assertIsNone(self.man.onward)
        self.assertEqual(opened(judgment.answer)["data"], b"lit")

    def test_viii_a_budget_the_dwell_exhausts_forbids_the_onward_ask(self) -> None:
        judgment = self.arriving(time=30, hops=4)
        self.assertTrue(self.man.refused)
        self.assertEqual(opened(judgment.answer)["data"], b"lit")

    def test_viii_a_refused_onward_ask_spends_no_number(self) -> None:
        """The near door never spends a number on a message it did not send."""
        self.arriving(time=1000, hops=0)
        self.assertEqual(self.row.seq, 0)
        self.assertEqual(self.row.awaiting, set())

    def test_viii_a_being_invoked_outside_a_judgment_holds_a_leash_that_refuses(
        self,
    ) -> None:
        self.assertIsNone(warden.Leash().onward())


if __name__ == "__main__":
    unittest.main()
