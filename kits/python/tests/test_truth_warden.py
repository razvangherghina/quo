"""Part one of papers/quo-truth.md: what the warden provides.

Written from the paper alone. Every case here is a sentence of that part made
checkable: one entry point for arriving bytes, the caller as a fact, standings
as voices only, the social acts, why the door fell silent told inward, a hint
held without being read, and what must survive a restart.
"""

from __future__ import annotations

import os
import secrets
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "src"))

from quo.delivery import MemoryStore, memory_delivery, seeds  # noqa: E402
from quo.warden import Warden  # noqa: E402


def still() -> int:
    return 1000


def random() -> bytes:
    return secrets.token_bytes(32)


COUNTER = "Counter\n  bump() int\n  read() int\n"


class Counter:
    def __init__(self) -> None:
        self.n = 0

    def bump(self) -> int:
        self.n += 1
        return self.n

    def read(self) -> int:
        return self.n


async def pair():
    """Two grounds in one process, reached by a delivery that hands bytes
    straight to the far warden's one entry point. No road, no socket, and no
    step waived."""
    delivery = memory_delivery()
    alice = await Warden.open(
        seeds(random), clock=still, random=random, delivery=delivery
    )
    bob = await Warden.open(
        seeds(random), clock=still, random=random, delivery=delivery
    )
    delivery.attach("mem://alice", alice)
    delivery.attach("mem://bob", bob)
    alice.publish("mem://alice")
    bob.publish("mem://bob")
    return alice, bob, delivery


class WhatTheWardenProvides(unittest.IsolatedAsyncioTestCase):
    async def test_one_entry_point_takes_any_bytes_and_answers_bytes_or_silence(self):
        alice, bob, _ = await pair()
        counter = Counter()
        await alice.hold(counter, COUNTER)
        [handle] = await bob.accept(counter._quo.grant(), label="counter")
        # An ask arriving is judged and answered.
        self.assertEqual(await handle.bump(), 1)
        # Garbage arriving is silence, and the door says nothing about why.
        self.assertIsNone(await alice.arrive(b"not an envelope"))
        self.assertIsNone(await alice.arrive(b""))

    async def test_the_closure_offers_the_caller_as_a_fact_and_never_a_judgment(self):
        alice, bob, _ = await pair()
        seen = []

        class Watching(Counter):
            def bump(self) -> int:
                seen.append((self._quo.caller.voice, self._quo.caller.kind))
                return super().bump()

        counter = Watching()
        await alice.hold(counter, COUNTER)
        [handle] = await bob.accept(counter._quo.grant(), label="counter")
        # Accepting is two rotations; the first call after it is a plain ask.
        await handle.bump()
        await handle.bump()
        self.assertEqual(len(seen), 2)
        self.assertEqual(seen[0][1], "holder")
        self.assertIsInstance(seen[0][0], bytes)
        # A copy, never the row: the door hands out its own bytes.
        self.assertIsNot(seen[0][0], seen[1][0])
        self.assertEqual(await handle.bump(), 3)

    async def test_standings_are_offered_as_voices_only(self):
        alice, bob, _ = await pair()
        counter = Counter()
        await alice.hold(counter, COUNTER)
        self.assertEqual(counter._quo.standings(), [])
        await bob.accept(counter._quo.grant(), label="counter")
        held = counter._quo.standings()
        self.assertEqual(len(held), 1)
        self.assertEqual(list(held[0]), ["voice"])

    async def test_grant_names_the_being_and_release_takes_every_standing_with_it(self):
        alice, bob, _ = await pair()
        counter = Counter()
        other = Counter()
        await alice.hold(counter, COUNTER)
        await alice.hold(other, COUNTER)
        [handle] = await bob.accept(counter._quo.grant(other), label="other")
        self.assertEqual(await handle.bump(), 1)
        # Bob reaches `other` and not `counter`.
        self.assertEqual(len(other._quo.standings()), 1)
        self.assertEqual(len(counter._quo.standings()), 0)
        # Released: Bob's next call meets silence, and nothing tells it apart.
        counter._quo.release(other)
        self.assertIsNone(await handle.bump())

    async def test_hold_mints_a_smaller_being_beside_me_reached_by_a_handle(self):
        alice, _, _ = await pair()
        counter = Counter()
        await alice.hold(counter, COUNTER)
        handle = await counter._quo.hold(Counter(), COUNTER, label="small")
        # Same warden, same shape: asynchronous, a value or silence.
        self.assertEqual(await handle.bump(), 1)
        self.assertEqual(await counter._quo.relation("small").read(), 1)
        counter._quo.release(counter._quo.relation("small"))
        self.assertIsNone(await handle.read())

    async def test_why_it_fell_silent_is_told_inward_and_nothing_crosses_the_wire(self):
        alice, _, _ = await pair()
        reasons = []
        alice.observe(reasons.append)
        self.assertIsNone(await alice.arrive(b"garbage"))
        self.assertGreaterEqual(len(reasons), 1)
        self.assertIsInstance(reasons[0], str)

    async def test_a_hint_is_stored_and_carried_opaquely_and_never_parsed(self):
        alice, bob, _ = await pair()
        counter = Counter()
        await alice.hold(counter, COUNTER)
        alice.publish("anything at all, even this")
        invitation = counter._quo.grant()
        self.assertIn("anything at all, even this", invitation.hints)
        # Delivery walks past what it cannot speak; the door still answers on
        # the road it can.
        [handle] = await bob.accept(invitation, label="counter")
        self.assertEqual(await handle.bump(), 1)

    async def test_what_must_survive_a_restart_lives_in_the_store_handed_in(self):
        delivery = memory_delivery()
        store = MemoryStore()
        keys = seeds(random)
        alice = await Warden.open(
            keys, clock=still, random=random, delivery=delivery, store=store
        )
        bob = await Warden.open(
            seeds(random), clock=still, random=random, delivery=delivery
        )
        delivery.attach("mem://alice", alice)
        delivery.attach("mem://bob", bob)
        alice.publish("mem://alice")
        bob.publish("mem://bob")

        counter = Counter()
        being_secret = random()
        await alice.hold(counter, COUNTER, secret=being_secret)
        [handle] = await bob.accept(counter._quo.grant(), label="counter")
        self.assertEqual(await handle.bump(), 1)
        spent = await handle._quo.seal("bump")
        self.assertEqual(await handle._quo.send(spent), 2)

        # The process dies. A new warden opens on the same seeds and the same
        # store, holds the same object again, and Bob's standing is still there.
        alice = await Warden.open(
            keys, clock=still, random=random, delivery=delivery, store=store
        )
        delivery.attach("mem://alice", alice)
        again = Counter()
        await alice.hold(again, COUNTER, secret=being_secret)
        self.assertEqual(len(again._quo.standings()), 1)
        self.assertEqual(await handle.bump(), 1)
        # The marks survived too: the envelope spent before the restart is
        # silence at the door that opened again.
        self.assertIsNone(await handle._quo.send(spent))


if __name__ == "__main__":
    unittest.main()
