"""A being standing in the middle of a chain, and the leash it is handed.

Article VIII: the caller's allowance rides the message, and every door hands
onward less than it received. What the middle door hands onward is not a number
it worked out in advance — the budget falls by its own dwell, which is only
known at the moment of handing onward — so what the being is given is the leash
itself and never an allowance.

The being here is an ordinary object reaching another house through a handle,
which is the only way a being reaches anything. **It cannot widen a leash even
by trying**, because there is nowhere on a handle to put an allowance: the one
in scope is read at the moment of sealing and that is the whole of it.

Every assertion about what was handed onward is read off the sealed message the
being composed, because the allowance is a fact on the wire and not a fact in
this process.
"""

import asyncio
import unittest

from quo import arithmetic, envelope, warden
from quo.being import RemoteHandle

from test_warden import (
    BEING_BLUEPRINT,
    BEING_PK,
    LIT,
    a_being,
    a_warden,
    judged,
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
    door.beings[BEING_PK] = a_being()
    return door


class Capturing:
    """The middle ground's delivery: it keeps what was handed to it and carries
    nothing, so the onward ask can be read off the wire it was written for."""

    def __init__(self) -> None:
        self.sent: list = []

    def arrived(self, padlock: bytes, via) -> None:
        return None

    async def send(self, row, envelope_bytes: bytes):
        self.sent.append(envelope_bytes)
        return None


class Middleman:
    """An ordinary object that reaches another house before it answers.

    It never learns it has an address, holds no key of the door's, and is
    handed no allowance: the leash belongs to the message rather than to the
    being, and the handle spends the one in scope.
    """

    def __init__(self) -> None:
        self.received = None
        self.reached = None

    async def lit(self) -> bool:
        self.received = self.quo.leash
        self.reached = await self.quo.relation("far").lit()
        return True


class ABeingInTheMiddleOfAChain(unittest.TestCase):
    def setUp(self) -> None:
        self.far = a_far_door()
        self.carried = Capturing()
        self.middle = a_warden(delivery=self.carried)
        invitation = self.far.invite(BEING_PK, seed(34), seed(35))
        self.row = self.middle.stand(invitation)
        # The relation is stood on a key of this ground's own before the chain
        # runs, because that is what holding one means: an ordinary ask down an
        # accepted row is what a being in the middle composes.
        opening, spent = self.middle.ask(self.row, seed(36), next_heir=seed(37))
        judged(self.far, opening)
        self.middle.forgo(self.row, spent)
        self.opening_seq = spent
        self.man = Middleman()
        held = self.middle.beings[BEING_PK]
        held.obj = self.man
        self.man.quo = warden.Quo(self.middle, held)
        self.middle.labels["far"] = {
            "row": self.row,
            "being": BEING_PK,
            "handle": RemoteHandle(self.middle, self.row, BEING_PK, BEING_BLUEPRINT),
        }
        self.middle.grant(
            arithmetic.signing_public(seed(3)),
            arithmetic.commitment(self.middle.name, arithmetic.signing_public(seed(4))),
            [BEING_PK],
        )

    def arriving(self, **over) -> warden.Judgment:
        """One ask at the middle door. The clock is read on arrival, by the
        being when it spends the leash, again when the handle meets silence and
        asks the far door where the being went — this road carries nothing, so
        every onward ask here is silence — and at the answer."""
        readings = iter([100, 130, 140, 150])
        return judged(
            self.middle,
            say(self.middle, being=BEING_PK, call=method("lit"), **over),
            clock=lambda: next(readings),
        )

    def handed(self) -> dict:
        """What the far door received, read off the wire."""
        return envelope.unseal(
            self.far.padlock_secret, self.carried.sent[0], envelope.SAY
        )

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
        """This ground's own default is enormous, and it is not what was sent:
        under a leash the allowance in scope is the leash and nothing else."""
        self.middle.allowance = {"time": 999_999, "hops": 99}
        self.arriving(time=1000, hops=4)
        self.assertEqual(self.handed()["allowance"], {"time": 970, "hops": 3})

    def test_the_far_door_judges_what_the_being_composed(self) -> None:
        self.arriving(time=1000, hops=4)
        judgment = judged(self.far, self.carried.sent[0])
        self.assertEqual(judgment.placement, warden.ASK)
        answer = envelope.unseal(
            self.middle.padlock_secret, judgment.answer, envelope.ANSWER
        )
        self.assertEqual(answer["data"], LIT)

    def test_viii_a_hop_count_of_zero_forbids_the_onward_ask(self) -> None:
        """What it forbids is onward, and the work already routed stands."""
        judgment = self.arriving(time=1000, hops=0)
        self.assertEqual(self.carried.sent, [])
        self.assertIsNone(self.man.reached)
        self.assertEqual(opened(judgment.answer)["data"], LIT)

    def test_viii_a_budget_the_dwell_exhausts_forbids_the_onward_ask(self) -> None:
        judgment = self.arriving(time=30, hops=4)
        self.assertEqual(self.carried.sent, [])
        self.assertEqual(opened(judgment.answer)["data"], LIT)

    def test_viii_a_refused_onward_ask_spends_no_number(self) -> None:
        """The near door never spends a number on a message it did not send."""
        self.arriving(time=1000, hops=0)
        self.assertEqual(self.row.seq, self.opening_seq)
        self.assertEqual(self.row.awaiting, {})

    def test_viii_a_leash_made_with_nothing_refuses_to_be_spent(self) -> None:
        """What a being invoked outside a judgment holds."""
        self.assertIsNone(warden.Leash().onward())

    def test_viii_a_walk_a_being_starts_of_its_own_is_born_the_wardens_default(
        self,
    ) -> None:
        """A leash is born when a being starts a walk of its own, from an event
        or a clock rather than an arriving call: the warden's own allowance."""
        self.middle.allowance = {"time": 4_000, "hops": 2}
        asyncio.run(self.man.lit())
        self.assertEqual(self.handed()["allowance"], {"time": 4_000, "hops": 2})


if __name__ == "__main__":
    unittest.main()
