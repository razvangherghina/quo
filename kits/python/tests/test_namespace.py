"""The kit's own names are names the notation cannot express.

Article IV's identifier is a letter then letters and digits, so no blueprint in
any language can spell a name beginning with an underscore. This suite holds a
being whose blueprint declares **every name this kit ever used for itself** and
asserts each one answers its own value through a handle — a remote one and a
local one, because a handle keeps one shape wherever the being is.

**It asserts the value, never that nothing threw.** Two of the three ways this
defect showed itself were silent: a field the kit had written over answered
``None``, which is indistinguishable from a refusal, a broken being or an
absent one. A case that only checked for an exception would have passed against
every one of them.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "src"))

from quo.delivery import memory_delivery, seeds  # noqa: E402
from quo.warden import Warden  # noqa: E402

#: Everything this kit has ever reached for on a being or a handle: the closure
#: itself, the handle's own facts, the two halves of a seal, and the four looks.
#: The list is the bench's, never the kit's — the kit guards no list at all.
NAMES = (
    "quo",
    "being",
    "seal",
    "send",
    "describe",
    "sketch",
    "moved",
    "blueprint",
    "limit",
    "handles",
    "text",
    "digest",
    "declares",
)

CLASH = "Clash\n" + "".join(f"  {name}() text\n" for name in NAMES)


def _own(name: str):
    async def method(self) -> str:
        return f"own:{name}"

    method.__name__ = name
    return method


#: A class declaring all of them as ordinary methods, each answering its own
#: name. Built by type() rather than written out because the point is the whole
#: set, and a hand-written class would drift from NAMES.
Clash = type("Clash", (), {name: _own(name) for name in NAMES})

#: A class that answers one of the two fields its blueprint declares. The
#: unanswered one is what a being's own fault looks like from outside, and both
#: handle shapes owe the caller the same silence for it.
LOPSIDED = "Lopsided\n  here() text\n  absent() text\n"


class Lopsided:
    async def here(self) -> str:
        return "here"


PEER = "Peer\n  poke() bool\n"


class Peer:
    def poke(self) -> bool:
        return True


def still() -> int:
    return 1000


def random() -> bytes:
    return secrets.token_bytes(32)


class TheKitsOwnNames(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        delivery = memory_delivery()

        async def ground(hint: str) -> Warden:
            one = await Warden.open(
                seeds(random), clock=still, random=random, delivery=delivery
            )
            delivery.attach(hint, one)
            one.publish(hint)
            return one

        self.here = await ground("mem://here")
        self.there = await ground("mem://there")
        self.clash = Clash()
        self.peer = Peer()
        self.near = await self.here.hold(self.clash, CLASH)
        await self.there.hold(self.peer, PEER)
        [self.far] = await self.peer._quo.accept(self.clash._quo.grant(), label="clash")

    async def test_every_declared_name_answers_its_own_value_through_a_remote_handle(
        self,
    ) -> None:
        for name in NAMES:
            with self.subTest(name=name):
                self.assertEqual(await getattr(self.far, name)(), f"own:{name}")

    async def test_every_declared_name_answers_its_own_value_through_a_local_handle(
        self,
    ) -> None:
        """One shape: a neighbour is told exactly what a stranger is told."""
        for name in NAMES:
            with self.subTest(name=name):
                self.assertEqual(await getattr(self.near, name)(), f"own:{name}")

    async def test_the_kits_own_machinery_stands_beside_the_fields_it_never_ate(
        self,
    ) -> None:
        """A handle that lost its own seal could not resend after silence."""
        self.assertEqual(self.far._quo.being, self.clash._quo.being)
        self.assertEqual(self.far._quo.text, CLASH)
        self.assertEqual(self.far._quo.declares(), NAMES)
        sealed = await self.far._quo.seal("digest")
        self.assertIsNotNone(sealed)
        self.assertEqual(await self.far._quo.send(sealed), "own:digest")
        estate = await self.far._quo.describe()
        self.assertIsNotNone(estate)
        self.assertEqual(await self.far._quo.limit(), self.here.limit)

    async def test_the_being_keeps_its_own_methods_and_the_closure_beside_them(
        self,
    ) -> None:
        """The closure is at ``_quo``, so ``quo()`` is the being's own method."""
        self.assertEqual(await self.clash.quo(), "own:quo")
        self.assertEqual(self.clash._quo.being, self.near._quo.being)

    async def test_a_beings_own_fault_is_the_same_silence_at_either_shape(self) -> None:
        """A caller of a neighbour is told what a caller across an ocean is told.

        The local handle used to raise here where the remote one fell silent,
        which hands a neighbour a fact the far side would have swallowed.
        """
        lopsided = Lopsided()
        near = await self.here.hold(lopsided, LOPSIDED)
        [far] = await self.peer._quo.accept(lopsided._quo.grant(), label="lopsided")
        for handle in (near, far):
            self.assertEqual(await handle.here(), "here")
            self.assertIsNone(await handle.absent())

    async def test_a_name_the_blueprint_does_not_declare_is_not_there(self) -> None:
        """The refusal is asserted as strictly as the acceptance."""
        for handle in (self.far, self.near):
            with self.assertRaises(AttributeError):
                handle.undeclared
            with self.assertRaises(AttributeError):
                handle._fields_that_do_not_exist


if __name__ == "__main__":
    unittest.main()
