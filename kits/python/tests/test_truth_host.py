"""Part three of papers/quo-truth.md: what the host does.

The same being, unchanged, is installed under a warden reached by every road
this kit has and gives the same answers; a peer that publishes nothing is
pushed to down the line it holds; a closed line is weather. Written from the
paper alone.
"""

from __future__ import annotations

import os
import secrets
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "src"))

from quo import call  # noqa: E402
from quo.delivery import memory_delivery, seeds  # noqa: E402
from quo.host import MEMORY, host  # noqa: E402
from quo.warden import Warden  # noqa: E402


def now() -> int:
    return int(time.monotonic() * 1000)


def random() -> bytes:
    return secrets.token_bytes(32)


DOG = "Dog\n  name() text\n  logWalk(minutes int) bool\n"


class Dog:
    def __init__(self) -> None:
        self.walks: list = []

    def name(self) -> str:
        return "Rex"

    def logWalk(self, minutes: int) -> bool:  # noqa: N802 - the blueprint names it
        self.walks.append(minutes)
        return True


INBOX = "Inbox\n  walked(minutes int)\n"


class Inbox:
    def __init__(self) -> None:
        self.heard: list = []

    def walked(self, minutes: int) -> None:
        self.heard.append(minutes)


WALKER = "Walker\n  subscribe(inbox invitation) bool\n  walk(minutes int) bool\n"


class Walker:
    def __init__(self) -> None:
        self.listener = None

    async def subscribe(self, invitation) -> bool:
        [self.listener] = await self.quo.accept(invitation, label="inbox")
        return self.listener is not None

    async def walk(self, minutes: int) -> bool:
        if self.listener is not None:
            await self.listener.walked(minutes)
        return True


async def stand(roads, hints=()):
    return await host(seeds(random), clock=now, random=random, roads=roads, hints=hints)


class TheSameBeingBehindEveryRoad(unittest.IsolatedAsyncioTestCase):
    async def _installed_behind(self, road: str) -> None:
        alice = await stand([road])
        bob = await stand([road])
        try:
            rex = Dog()
            await alice.warden.hold(rex, DOG)
            [handle] = await bob.warden.accept(rex.quo.grant(), label="rex")
            self.assertEqual(await handle.name(), "Rex")
            self.assertIs(await handle.logWalk(12), True)
            self.assertEqual(rex.walks, [12])
            # The being never learned the road: nothing on it names one.
            self.assertFalse(hasattr(rex.quo, "road"))
        finally:
            await alice.close()
            await bob.close()

    async def test_the_same_dog_behind_memory_gives_the_same_answers(self):
        await self._installed_behind("memory")

    async def test_the_same_dog_behind_http_gives_the_same_answers(self):
        await self._installed_behind("http")

    async def test_the_same_dog_behind_tcp_gives_the_same_answers(self):
        await self._installed_behind("tcp")


class EachRoadPublishesItsHintAndRetractsItOnClose(unittest.IsolatedAsyncioTestCase):
    """Part three: the roads a host stands are "each publishing its hint to the
    warden and retracting it on close".

    A hint is where bytes go, so a hint left standing after the road behind it
    is gone is an address that answers nothing — minted into every invitation
    and every describe the warden composes afterwards.
    """

    async def _retracted(self, road: str) -> None:
        ground = await stand([road])
        rex = Dog()
        await ground.warden.hold(rex, DOG)
        standing = ground.warden.hints
        self.assertEqual(len(standing), 1)
        self.assertIn(standing[0], rex.quo.grant().hints)

        await ground.close()
        self.assertEqual(ground.warden.hints, ())
        self.assertEqual(tuple(rex.quo.grant().hints), ())

    async def test_a_closed_ground_mints_its_memory_hint_into_nothing(self):
        await self._retracted("memory")

    async def test_a_closed_ground_mints_its_carriage_hint_into_nothing(self):
        await self._retracted("http")

    async def test_a_closed_ground_mints_its_line_hint_into_nothing(self):
        await self._retracted("tcp")

    async def test_a_hint_the_host_was_handed_is_retracted_with_no_road_of_its_own(
        self,
    ):
        """A hint handed in at open names a road standing somewhere else, so it
        is the host's to publish and never the host's to take down."""
        ground = await stand(["memory"], hints=["pigeon://loft"])
        try:
            self.assertIn("pigeon://loft", ground.warden.hints)
        finally:
            await ground.close()
        self.assertEqual(ground.warden.hints, ("pigeon://loft",))

    async def test_the_in_process_road_is_a_door_at_distance_zero(self):
        """The host stands `quo.call` rather than reaching into the far warden:
        the road of distance zero is a road like the other two."""
        ground = await stand(["memory"])
        hint = ground.warden.hints[0]
        try:
            self.assertIsInstance(MEMORY[hint], call.Door)
            self.assertIs(MEMORY[hint].open, True)
        finally:
            await ground.close()
        self.assertNotIn(hint, MEMORY)


class WhatDeliveryDoes(unittest.IsolatedAsyncioTestCase):
    async def test_a_hint_this_ground_cannot_speak_is_walked_past(self):
        # Alice publishes a road nobody here can speak, first, and HTTP after it.
        alice = await stand(["http"], hints=["pigeon://loft"])
        bob = await stand(["http"])
        try:
            rex = Dog()
            await alice.warden.hold(rex, DOG)
            invitation = rex.quo.grant()
            self.assertEqual(len(invitation.hints), 2)
            self.assertEqual(invitation.hints[0], "pigeon://loft")
            [handle] = await bob.warden.accept(invitation, label="rex")
            self.assertEqual(await handle.name(), "Rex")
        finally:
            await alice.close()
            await bob.close()

    async def test_a_peer_that_publishes_nothing_is_pushed_to_down_its_own_line(self):
        # Bob's laptop listens. Alice's tab has no road of its own and dials out.
        laptop = await stand(["tcp"])
        tab = await stand([])
        try:
            walker = Walker()
            inbox = Inbox()
            await laptop.warden.hold(walker, WALKER)
            await tab.warden.hold(inbox, INBOX)
            self.assertEqual(tab.warden.hints, ())

            [bob] = await inbox.quo.accept(walker.quo.grant(), label="walker")
            self.assertIs(await bob.subscribe(inbox.quo.grant()), True)
            await bob.walk(9)
            await bob.walk(11)
            self.assertEqual(inbox.heard, [9, 11])
        finally:
            await laptop.close()
            await tab.close()

    async def test_a_closed_line_is_weather_and_nothing_throws(self):
        laptop = await stand(["tcp"])
        tab = await stand([])
        walker = Walker()
        inbox = Inbox()
        await laptop.warden.hold(walker, WALKER)
        await tab.warden.hold(inbox, INBOX)
        [bob] = await inbox.quo.accept(walker.quo.grant(), label="walker")
        await bob.subscribe(inbox.quo.grant())
        await bob.walk(1)
        await tab.close()
        # Walker's own answer to itself is unaffected; only the push found
        # nobody, and the number it spent stays spent.
        self.assertIs(await walker.walk(2), True)
        self.assertEqual(inbox.heard, [1])
        await laptop.close()

    async def test_what_delivery_is_given_per_row_is_the_way_back_and_no_more(self):
        delivery = memory_delivery()
        warden = await Warden.open(
            seeds(random), clock=now, random=random, delivery=delivery
        )
        other = await Warden.open(
            seeds(random), clock=now, random=random, delivery=delivery
        )
        delivery.attach("mem://one", warden)
        delivery.attach("mem://two", other)
        warden.publish("mem://one")
        other.publish("mem://two")
        rows: list = []
        delivery.watch(rows.append)
        rex = Dog()
        await warden.hold(rex, DOG)
        [handle] = await other.accept(rex.quo.grant(), label="rex")
        await handle.name()
        self.assertGreater(len(rows), 0)
        for row in rows:
            self.assertEqual(sorted(row), ["hints", "padlock"])


if __name__ == "__main__":
    unittest.main()
