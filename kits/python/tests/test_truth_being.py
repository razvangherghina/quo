"""Part two of papers/quo-truth.md: what a being receives, played as Alice,
Bob and the clinic.

Written from the paper alone. The beings below are plain Python classes: they
know which of their references are Quo, and nothing about roads or hosts.
"""

from __future__ import annotations

import os
import secrets
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(__file__)), "src"))

from quo import notation, wire  # noqa: E402
from quo.delivery import memory_delivery, seeds  # noqa: E402
from quo.warden import Warden  # noqa: E402

INT_LIST = notation.Many(notation.Base("int"))


def still() -> int:
    return 1000


def random() -> bytes:
    return secrets.token_bytes(32)


DOG = (
    "Dog\n"
    "  name() text\n"
    "  logWalk(minutes int) bool\n"
    "  vaccinated() bool?\n"
    "  invite() invitation\n"
)


class Dog:
    def __init__(self, name: str) -> None:
        self.dog_name = name
        self.walks: list = []

    def name(self) -> str:
        return self.dog_name

    def logWalk(self, minutes: int) -> bool:  # noqa: N802 - the blueprint names it
        self.walks.append(minutes)
        return True

    async def vaccinated(self):
        record = self.quo.relation("clinic")
        if record is None:
            return None
        return await record.vaccinated()

    def invite(self):
        return self.quo.grant()

    def cells(self) -> bytes:
        return wire.encode(INT_LIST, self.walks)

    def take(self, blob: bytes) -> None:
        self.walks = list(wire.decode(INT_LIST, blob))


RECORD = "Record\n  vaccinated() bool\n"


class Record:
    def vaccinated(self) -> bool:
        return True


PROFILE = "Profile\n  name() text\n  rate() int\n"


class Profile:
    def name(self) -> str:
        return "Bob"

    def rate(self) -> int:
        return 20


WALKER = (
    "Walker\n"
    "  subscribe(inbox invitation) bool\n"
    "  walk(minutes int) bool\n"
    "  secret() text\n"
)


class Walker:
    def __init__(self) -> None:
        self.listener = None

    async def subscribe(self, invitation) -> bool:
        [self.listener] = await self.quo.accept(invitation, label="inbox")
        return self.listener is not None

    async def walk(self, minutes: int) -> bool:
        rex = self.quo.relation("rex")
        if rex is None:
            return False
        if await rex.logWalk(minutes) is None:
            return False
        if self.listener is not None:
            await self.listener.walked(minutes)
        return True

    def secret(self) -> str:
        return "nobody sees this"


INBOX = "Inbox\n  walked(minutes int)\n"


class Inbox:
    def __init__(self) -> None:
        self.heard: list = []

    def walked(self, minutes: int) -> None:
        self.heard.append(minutes)


class World:
    pass


async def world() -> World:
    delivery = memory_delivery()

    async def ground(hint: str) -> Warden:
        warden = await Warden.open(
            seeds(random), clock=still, random=random, delivery=delivery
        )
        delivery.attach(hint, warden)
        warden.publish(hint)
        return warden

    at = World()
    at.phone = await ground("mem://alice")
    at.laptop = await ground("mem://bob")
    at.clinic = await ground("mem://clinic")
    at.rex = Dog("Rex")
    at.inbox = Inbox()
    at.walker = Walker()
    at.profile = Profile()
    at.record = Record()
    await at.phone.hold(at.rex, DOG)
    await at.phone.hold(at.inbox, INBOX)
    await at.laptop.hold(at.walker, WALKER)
    await at.laptop.hold(at.profile, PROFILE)
    await at.clinic.hold(at.record, RECORD)
    return at


class AliceBobAndTheClinic(unittest.IsolatedAsyncioTestCase):
    async def test_1_alice_lets_bob_walk_rex_and_walker_holds_a_handle(self):
        at = await world()
        await at.walker.quo.accept(at.rex.invite(), label="rex")
        self.assertEqual(await at.walker.quo.relation("rex").name(), "Rex")
        self.assertIs(await at.walker.walk(30), True)
        self.assertEqual(at.rex.walks, [30])

    async def test_2_bob_narrows_what_alice_sees_profile_is_granted_walker_never(self):
        at = await world()
        [handle] = await at.rex.quo.accept(at.profile.quo.grant(), label="bob")
        self.assertEqual(await handle.name(), "Bob")
        self.assertEqual(await handle.rate(), 20)
        # Alice's estate at Bob's door holds Profile and the public being and
        # nothing of Walker. Walker's fields do not exist for her.
        with self.assertRaises(AttributeError):
            handle.secret
        self.assertEqual(len(at.walker.quo.standings()), 0)

    async def test_3_the_chain_the_clinic_sees_rexs_voice_and_never_bobs(self):
        at = await world()
        callers = []

        def vaccinated() -> bool:
            callers.append(at.record.quo.caller.voice)
            return True

        at.record.vaccinated = vaccinated
        await at.rex.quo.accept(at.record.quo.grant(), label="clinic")
        await at.walker.quo.accept(at.rex.invite(), label="rex")
        self.assertIs(await at.walker.quo.relation("rex").vaccinated(), True)
        self.assertEqual(len(callers), 1)
        self.assertEqual(callers[0], at.record.quo.standings()[0]["voice"])

    async def test_3b_the_leash_shrinks_by_one_hop_and_a_being_never_widens_it(self):
        at = await world()
        leashes = []

        async def vaccinated_at_rex():
            leashes.append(at.rex.quo.leash["hops"])
            return await at.rex.quo.relation("clinic").vaccinated()

        def vaccinated_at_record() -> bool:
            leashes.append(at.record.quo.leash["hops"])
            return True

        at.rex.vaccinated = vaccinated_at_rex
        at.record.vaccinated = vaccinated_at_record
        await at.rex.quo.accept(at.record.quo.grant(), label="clinic")
        await at.walker.quo.accept(at.rex.invite(), label="rex")
        await at.walker.quo.relation("rex").vaccinated()
        self.assertEqual(len(leashes), 2)
        self.assertEqual(leashes[1], leashes[0] - 1)

    async def test_4_subscription_is_a_grant_backwards_and_a_push_is_an_ask(self):
        at = await world()
        await at.walker.quo.accept(at.rex.invite(), label="rex")
        # Alice hands Bob's Walker an invitation to Inbox, through a field
        # Walker declares. There is no subscribe verb anywhere beneath this.
        [bob] = await at.rex.quo.accept(at.walker.quo.grant(), label="walker")
        self.assertIs(await bob.subscribe(at.inbox.quo.grant()), True)
        await bob.walk(15)
        await bob.walk(25)
        self.assertEqual(at.inbox.heard, [15, 25])
        self.assertEqual(at.rex.walks, [15, 25])

    async def test_4b_unsubscribing_needs_no_verb_and_the_push_meets_silence(self):
        at = await world()
        await at.walker.quo.accept(at.rex.invite(), label="rex")
        [bob] = await at.rex.quo.accept(at.walker.quo.grant(), label="walker")
        await bob.subscribe(at.inbox.quo.grant())
        await bob.walk(10)
        at.inbox.quo.release()
        # The walk is still logged; only the push finds nobody.
        self.assertIs(await bob.walk(20), True)
        self.assertEqual(at.inbox.heard, [10])
        self.assertEqual(at.rex.walks, [10, 20])

    async def test_5_alice_fires_bob_amend_and_the_next_call_is_silence(self):
        at = await world()
        await at.walker.quo.accept(at.rex.invite(), label="rex")
        handle = at.walker.quo.relation("rex")
        self.assertIs(await handle.logWalk(5), True)
        [bob] = at.rex.quo.standings()
        at.rex.quo.amend(bob["voice"], remove=[at.rex])
        self.assertIsNone(await handle.logWalk(5))
        self.assertIsNone(await handle.name())
        self.assertEqual(at.rex.walks, [5])

    async def test_silence_after_a_write_is_honoured_at_most_once_on_a_resend(self):
        at = await world()
        await at.walker.quo.accept(at.rex.invite(), label="rex")
        handle = at.walker.quo.relation("rex")
        # The handle hands back the envelope it sealed, so a caller that met
        # silence resends the same bytes and never a fresh number.
        sealed = await handle.seal("logWalk", 40)
        self.assertIs(await handle.send(sealed), True)
        self.assertIsNone(await handle.send(sealed))
        self.assertEqual(at.rex.walks, [40])

    async def test_a_same_warden_call_goes_through_the_handle_and_pays_no_seal(self):
        at = await world()
        reasons = []
        at.phone.observe(reasons.append)
        handle = await at.rex.quo.hold(Dog("Pup"), DOG, label="pup")
        self.assertEqual(await handle.name(), "Pup")
        self.assertIs(await at.rex.quo.relation("pup").logWalk(3), True)
        # Nothing was judged: the door was never asked and never fell silent.
        self.assertEqual(reasons, [])

    def test_what_a_being_shows_decides_what_moves_cells_and_take(self):
        rex = Dog("Rex")
        rex.logWalk(7)
        rex.logWalk(8)
        again = Dog("Rex")
        again.take(rex.cells())
        self.assertEqual(again.walks, [7, 8])

    async def test_a_migration_carries_one_being_and_what_it_minted_stays(self):
        # Rex mints Landing beside itself and Bob takes a standing at Landing.
        # When Rex moves, Landing does not go with it and the standing at
        # Landing is untouched. No warden records which being minted which,
        # and this is why none needs to.
        at = await world()
        landing = Inbox()
        handle = await at.rex.quo.hold(landing, INBOX, label="landing")
        await at.walker.quo.accept(at.phone.grant_at(handle.being), label="landing")

        cargo = at.phone.pack(at.rex.quo.being, at.rex.cells())
        carried = [one for row in cargo["standings"] for one in row["beings"]]
        self.assertNotIn(handle.being, carried)

        before = len(at.phone.standings_at(handle.being))
        at.phone.depart(
            at.rex.quo.being,
            commitment=bytes(32),
            name=at.laptop.name,
            padlock=at.laptop.padlock,
            hints=at.laptop.hints,
        )

        # Rex is gone from the old door; Landing stands where it was minted,
        # with the standing at it what it was before the move.
        self.assertNotIn(at.rex.quo.being, at.phone.beings)
        self.assertIn(handle.being, at.phone.beings)
        self.assertEqual(len(at.phone.standings_at(handle.being)), before)
        await at.walker.quo.relation("landing").walked(11)
        self.assertEqual(landing.heard, [11])

    async def test_accepting_answers_one_handle_per_being_the_standing_names(self):
        # Alice grants Bob a standing at Rex, then widens it to Inbox before he
        # accepts. What comes back is a handle at each, and the caller tells
        # them apart by the being each is at and by what each declares.
        at = await world()
        invitation = at.rex.quo.grant()
        [bob] = at.rex.quo.standings()
        self.assertIs(at.rex.quo.amend(bob["voice"], add=[at.inbox]), True)
        handles = await at.walker.quo.accept(invitation, label="alice")
        self.assertEqual(len(handles), 2)
        self.assertEqual(
            {handle.being for handle in handles},
            {at.rex.quo.being, at.inbox.quo.being},
        )
        at_rex = next(one for one in handles if one.being == at.rex.quo.being)
        at_inbox = next(one for one in handles if one.being == at.inbox.quo.being)
        self.assertEqual(at_inbox.declares(), ("walked",))
        self.assertEqual(await at_rex.name(), "Rex")
        await at_inbox.walked(4)
        self.assertEqual(at.inbox.heard, [4])

    async def test_a_holders_describe_shows_what_the_row_names_and_no_more(self):
        at = await world()
        # A third being at Alice's door that no standing of Bob's names.
        pup = Dog("Pup")
        await at.phone.hold(pup, DOG)
        [handle] = await at.walker.quo.accept(at.rex.invite(), label="rex")

        estate = await handle.describe()
        shown = {
            bytes(held["being"])
            for klass in estate["classes"]
            for held in klass["beings"]
        }
        self.assertEqual(shown, {at.phone.name, at.rex.quo.being})
        self.assertNotIn(pup.quo.being, shown)

        # The sketch of what it holds, and silence for what it does not.
        sketch = await handle.sketch()
        self.assertEqual(bytes(sketch["being"]), at.rex.quo.being)
        self.assertEqual(bytes(sketch["digest"]), handle.digest)
        self.assertIsNone(await handle.sketch(pup))

        # The blueprint of the class it reaches, and silence for any other.
        self.assertEqual(await handle.blueprint(handle.digest), handle.text)
        self.assertIsNone(await handle.blueprint(notation.digest(INBOX)))
        self.assertEqual(await handle.limit(), at.phone.limit)

    async def test_a_stranger_knocks_and_is_shown_the_public_being_and_nothing(self):
        # Rex holds a card for Bob's door and no standing there at all.
        at = await world()
        handle = await at.rex.quo.knock(at.laptop.card(), label="bobs door")
        self.assertIsNotNone(handle)
        self.assertEqual(handle.being, at.laptop.name)

        estate = await handle.describe()
        shown = {
            bytes(held["being"])
            for klass in estate["classes"]
            for held in klass["beings"]
        }
        self.assertEqual(shown, {at.laptop.name})

        # Bob's own beings are not reached, sketched or read by a stranger.
        self.assertIsNone(await handle.sketch(at.profile))
        self.assertIsNone(await handle.blueprint(notation.digest(PROFILE)))
        with self.assertRaises(AttributeError):
            handle.secret
        self.assertEqual(await handle.limit(), at.laptop.limit)
        self.assertEqual(len(at.profile.quo.standings()), 0)

    async def test_a_standing_widened_later_is_re_read_and_never_remembered(self):
        at = await world()
        [handle] = await at.walker.quo.accept(at.rex.invite(), label="alice")
        first = await at.walker.quo.relations("alice")
        self.assertEqual([one.being for one in first], [handle.being])

        [bob] = at.rex.quo.standings()
        self.assertIs(at.rex.quo.amend(bob["voice"], add=[at.inbox]), True)
        # The handle held before still names the being it was built at: what
        # was added is learned by asking the far door, not by remembering.
        self.assertEqual(handle.being, at.rex.quo.being)
        widened = await at.walker.quo.relations("alice")
        self.assertEqual(
            {one.being for one in widened},
            {at.rex.quo.being, at.inbox.quo.being},
        )
        added = next(one for one in widened if one.being == at.inbox.quo.being)
        await added.walked(6)
        self.assertEqual(at.inbox.heard, [6])

    async def test_the_same_warden_path_answers_the_same_introspection(self):
        at = await world()
        pup = Dog("Pup")
        handle = await at.rex.quo.hold(pup, DOG, label="pup")

        estate = await handle.describe()
        shown = {
            bytes(held["being"])
            for klass in estate["classes"]
            for held in klass["beings"]
        }
        self.assertEqual(shown, {at.phone.name, pup.quo.being})
        sketch = await handle.sketch()
        self.assertEqual(bytes(sketch["being"]), pup.quo.being)
        self.assertEqual(bytes(sketch["digest"]), handle.digest)
        self.assertEqual(
            await handle.blueprint(handle.digest), notation.render(notation.parse(DOG))
        )
        self.assertEqual(await handle.limit(), at.phone.limit)
        # A neighbour is no more reached than a stranger is: this handle is at
        # one being, and the sketch of another under the same warden is silence.
        self.assertIsNone(await handle.sketch(at.rex))
        self.assertIsNone(await handle.blueprint(notation.digest(INBOX)))

    async def test_a_being_reaches_its_warden_only_through_the_closure(self):
        at = await world()
        for name in dir(at.rex.quo):
            if name.startswith("_"):
                continue
            self.assertNotRegex(name.lower(), "secret|padlock|seed|key")


if __name__ == "__main__":
    unittest.main()
