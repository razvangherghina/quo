"""The common carriage, asserted from Article III alone.

There is no corpus for the carriage. Every assertion comes from what Article
III promises: one POST, bytes in and bytes out; no path appended, no query
added, no header read, no status code meaning anything, no verb checked; the
response body is the sealed answer and an empty body is silence's wire form.

The socket is real: an HTTP door binds an ephemeral loopback port and is torn
down with the case. The law names HTTPS, which is TLS the protocol relies on
for no guarantee; the bench runs the same road without it, because a
certificate would prove nothing the seal does not already prove.
"""

import asyncio
import http.client
import unittest

import test_warden as pins
from quo import carriage, line


def echo(message):
    return b"answered:" + message


def silent(_message):
    return None


class OverARealSocket(unittest.TestCase):
    handler = staticmethod(echo)
    limit = 65536

    def setUp(self) -> None:
        try:
            self.door = carriage.Door(
                type(self).handler, limit=type(self).limit
            ).start()
        except OSError as bad:  # pragma: no cover - only if loopback is unusable
            self.skipTest(f"no loopback socket: {bad}")
        self.addCleanup(self.door.close)


class ThePost(OverARealSocket):
    """Article III: one POST, bytes in and bytes out."""

    def test_iii_one_post_carries_the_bytes_in_and_the_bytes_out(self) -> None:
        self.assertEqual(carriage.post(self.door.hint, b"one"), b"answered:one")

    def test_iii_the_body_is_bytes_and_never_text(self) -> None:
        body = bytes(range(256))
        self.assertEqual(carriage.post(self.door.hint, body), b"answered:" + body)

    def test_iii_the_hint_is_posted_to_exactly_as_given(self) -> None:
        self.door.handle = lambda message: b"seen:" + message
        hint = f"{self.door.hint}door/here?road=one"
        self.assertEqual(carriage.post(hint, b"x"), b"seen:x")

    def test_iii_a_hint_on_another_road_is_not_a_carriage_hint(self) -> None:
        for bad in ("tcp://127.0.0.1:9000", "", "example.test"):
            with self.subTest(hint=bad), self.assertRaises(carriage.CarriageError):
                carriage.post(bad, b"x")

    def test_iii_a_road_that_cannot_carry_the_bytes_is_weather_not_an_answer(
        self,
    ) -> None:
        self.door.close()
        with self.assertRaises(carriage.CarriageError):
            carriage.post(self.door.hint, b"x")


class WhatTheCarriageSaysBack(unittest.TestCase):
    """Article III: the body, or an empty body. Those two are the whole of it."""

    def test_iii_an_empty_body_is_silences_wire_form(self) -> None:
        with carriage.Door(silent) as door:
            self.assertEqual(carriage.post(door.hint, b"anything"), b"")

    def test_iii_a_door_that_raises_says_the_same_silence(self) -> None:
        def broken(_message):
            raise ValueError("a step nobody is told about")

        with carriage.Door(broken) as door:
            self.assertEqual(carriage.post(door.hint, b"anything"), b"")

    def test_iii_no_status_code_carries_meaning(self) -> None:
        """A caller reads the body without ever reading the code, so a door that
        answered would be indistinguishable from one that did not, but for the
        body itself."""
        with carriage.Door(echo) as door:
            connection = http.client.HTTPConnection(door.host, door.port, timeout=5)
            self.addCleanup(connection.close)
            connection.request("POST", "/", body=b"two")
            response = connection.getresponse()
            self.assertEqual(response.read(), b"answered:two")


class WhatIsNotAPostOfASealedBody(OverARealSocket):
    """Article III: it carries no unsealable bytes and meets the same silence."""

    def _verb(self, verb: str, body: bytes = b"") -> bytes:
        connection = http.client.HTTPConnection(self.door.host, self.door.port, 5)
        self.addCleanup(connection.close)
        connection.request(verb, "/", body=body)
        return connection.getresponse().read()

    def test_iii_no_verb_is_checked_and_a_get_meets_silence(self) -> None:
        self.assertEqual(self._verb("GET"), b"")

    def test_iii_a_put_of_a_body_meets_the_same_silence(self) -> None:
        self.assertEqual(self._verb("PUT", b"three"), b"")

    def test_iii_a_post_of_nothing_meets_the_same_silence(self) -> None:
        self.assertEqual(carriage.post(self.door.hint, b""), b"")


class TheDoorsOwnLimit(OverARealSocket):
    """Article IX: the limit is the warden's, and the carriage decides no cap."""

    limit = 32

    def test_iii_a_body_above_the_doors_limit_meets_silence(self) -> None:
        self.assertEqual(carriage.post(self.door.hint, b"x" * 33), b"")

    def test_iii_a_body_at_the_limit_is_carried(self) -> None:
        self.assertEqual(
            carriage.post(self.door.hint, b"x" * 23), b"answered:" + b"x" * 23
        )


class TheHint(unittest.TestCase):
    """Article III: a hint is where to send bytes, and Quo never reads one."""

    def test_iii_many_wardens_may_stand_behind_one_hint(self) -> None:
        """The recipient is named inside the signed payload, so one door may
        hand every arriving body to whichever warden it belongs to."""
        seen = []

        def route(message):
            seen.append(message)
            return b"routed"

        with carriage.Door(route) as door:
            self.assertEqual(carriage.post(door.hint, b"for-a"), b"routed")
            self.assertEqual(carriage.post(door.hint, b"for-b"), b"routed")
        self.assertEqual(seen, [b"for-a", b"for-b"])

    def test_iii_nothing_is_proved_by_a_hint_arriving(self) -> None:
        """The carriage hands the bytes over untouched: it neither reads nor
        adds anything the seal would have to account for."""
        seen = []

        def keep(message):
            seen.append(message)
            return b""

        with carriage.Door(keep) as door:
            carriage.post(door.hint, bytes([0, 1, 254, 255]))
        self.assertEqual(seen, [bytes([0, 1, 254, 255])])


class ARealDoorBehindTheCarriage(unittest.TestCase):
    """Article III: the response body is the sealed answer, and nothing else.

    The warden this suite already asserts stands behind a real socket here, so
    the road is proved to carry what the door judges rather than a stand-in.
    """

    def setUp(self) -> None:
        self.warden = pins.a_warden()
        self.warden.grant(
            pins.VOICE,
            pins.arithmetic.commitment(self.warden.name, pins.HEIR),
            [pins.BEING_PK],
        )

        def judge(message):
            # The road hands the whole envelope to the warden's one entry
            # point and takes bytes or silence back. It opens no seal.
            return asyncio.run(self.warden.arrive(message))

        self.door = carriage.Door(judge, limit=self.warden.limit)
        self.addCleanup(self.door.close)
        self.door.start()

    def test_iii_the_response_body_is_the_sealed_answer(self) -> None:
        ask = pins.say(self.warden, being=pins.BEING_PK, call=pins.method("lit"))
        body = carriage.post(self.door.hint, ask)
        self.assertTrue(body)
        answer = pins.opened(body)
        self.assertEqual(answer["warden"], self.warden.name)
        self.assertEqual(answer["seq"], 1)
        self.assertEqual(answer["data"], pins.LIT)

    def test_iii_a_message_the_door_refuses_comes_back_as_an_empty_body(self) -> None:
        stranger = pins.say(self.warden, being=pins.BEING_PK, call=pins.method("lit"))
        self.assertTrue(carriage.post(self.door.hint, stranger))
        # The same number again is a replay, and a replay is silence.
        self.assertEqual(carriage.post(self.door.hint, stranger), b"")

    def test_iii_no_meaning_in_the_carriage_means_bytes_are_handed_over_whole(
        self,
    ) -> None:
        ask = pins.say(self.warden, seq=1, being=pins.BEING_PK, call=pins.method("lit"))
        first = pins.opened(carriage.post(self.door.hint, ask))
        second = pins.say(
            self.warden, seq=2, being=pins.BEING_PK, call=pins.method("lit")
        )
        self.assertEqual(
            first["data"], pins.opened(carriage.post(self.door.hint, second))["data"]
        )


class TheRoadACallerTakes(OverARealSocket):
    """Article III: a warden offers as many roads as it has, and a caller tries
    the ones it can speak.

    Which road a ground takes across all the roads it has is delivery's, under
    the host, and is asserted there. This is the common carriage's own half of
    the rule: it speaks HTTP and walks past everything else.
    """

    def test_iii_a_caller_takes_the_road_it_can_speak_and_is_told_nothing(
        self,
    ) -> None:
        # The house offers what it has and ranks nothing. Nothing at the call
        # site names a road, and a hint on a road this carriage cannot speak
        # is walked past rather than tried.
        hints = ["tcp://127.0.0.1:9", "pigeon://loft", self.door.hint]
        self.assertEqual(
            carriage.reach(hints, b"hello"), carriage.post(self.door.hint, b"hello")
        )

    def test_iii_a_road_the_caller_cannot_speak_is_not_a_road_that_failed(
        self,
    ) -> None:
        # Nothing was sent down it, so no door spoke and no road broke: it is
        # neither silence nor weather, and a list of nothing else raises no
        # fault at all, because there is no road to report the fault of.
        self.assertIsNone(carriage.reach(["tcp://127.0.0.1:9"], b"hello"))
        # A road that is weather all the way down is raised as weather, never
        # as an answer a door gave.
        with self.assertRaises(carriage.CarriageError):
            carriage.reach(["http://127.0.0.1:1/"], b"hello")


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
