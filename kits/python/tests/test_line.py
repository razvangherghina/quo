"""The line, asserted from Article III alone.

There is no corpus for the line. Every assertion here comes from what Article
III promises, and every test is named for the clause it pins, so a reader can
tell coverage from a test list.

The socket is real: a listener binds an ephemeral loopback port and is torn
down with the case. Nothing here is faked.
"""

import asyncio
import socket
import unittest

import test_warden as pins
from quo import line

CAP = line.DEFAULT_CAP


def echo(_line, message):
    return b"answered:" + message


def said_nothing_and_ended(raw: socket.socket) -> bool:
    """Whether the far end ended without a word.

    A clean end delivers zero bytes; an end with our unread bytes still in its
    buffer arrives as a reset. Neither carries a word, which is the whole of
    what the law promises here.
    """
    raw.settimeout(5)
    try:
        return raw.recv(64) == b""
    except ConnectionResetError:
        return True


class TheHint(unittest.TestCase):
    """Article III: the listening end's hint is ``tcp://host:port[?cap=N]``."""

    def test_iii_a_bare_tcp_hint_promises_the_default_cap(self) -> None:
        road = line.parse_hint("tcp://example.test:9000")
        self.assertEqual(road.host, "example.test")
        self.assertEqual(road.port, 9000)
        self.assertEqual(road.cap, 16384)
        self.assertFalse(road.declared)

    def test_iii_the_default_cap_is_sixteen_thousand_three_hundred_and_eighty_four(
        self,
    ) -> None:
        self.assertEqual(line.DEFAULT_CAP, 16384)

    def test_iii_a_door_with_a_different_appetite_declares_its_cap_in_the_hint(
        self,
    ) -> None:
        road = line.parse_hint("tcp://10.0.0.4:7?cap=64")
        self.assertEqual(road.cap, 64)
        self.assertTrue(road.declared)

    def test_iii_the_host_may_be_a_literal_address(self) -> None:
        self.assertEqual(line.parse_hint("tcp://192.0.2.10:443").host, "192.0.2.10")

    def test_iii_an_ipv6_literal_is_in_brackets(self) -> None:
        road = line.parse_hint("tcp://[2001:db8::1]:443")
        self.assertEqual(road.host, "2001:db8::1")
        self.assertEqual(road.port, 443)

    def test_iii_an_ipv6_literal_without_brackets_is_refused(self) -> None:
        with self.assertRaises(line.LineError):
            line.parse_hint("tcp://2001:db8::1:443")

    def test_iii_the_port_is_always_written(self) -> None:
        with self.assertRaises(line.LineError):
            line.parse_hint("tcp://example.test")

    def test_iii_nothing_comes_after_the_cap(self) -> None:
        for bad in (
            "tcp://example.test:9000?cap=64&keep=1",
            "tcp://example.test:9000?cap=64/",
            "tcp://example.test:9000/path",
            "tcp://example.test:9000?limit=64",
            "tcp://example.test:9000?cap=",
            "tcp://example.test:9000#tail",
        ):
            with self.subTest(hint=bad), self.assertRaises(line.LineError):
                line.parse_hint(bad)

    def test_iii_a_hint_on_another_road_is_not_a_line_hint(self) -> None:
        for bad in ("https://example.test/door", "tcp:/example.test:9000", ""):
            with self.subTest(hint=bad), self.assertRaises(line.LineError):
                line.parse_hint(bad)

    def test_iii_a_cap_at_or_below_zero_is_refused(self) -> None:
        with self.assertRaises(line.LineError):
            line.parse_hint("tcp://example.test:9000?cap=0")

    def test_iii_a_port_outside_its_range_is_refused(self) -> None:
        with self.assertRaises(line.LineError):
            line.parse_hint("tcp://example.test:70000")

    def test_iii_publish_writes_the_hint_the_law_names(self) -> None:
        self.assertEqual(line.publish("example.test", 9000), "tcp://example.test:9000")
        self.assertEqual(
            line.publish("example.test", 9000, 64), "tcp://example.test:9000?cap=64"
        )
        self.assertEqual(line.publish("2001:db8::1", 443), "tcp://[2001:db8::1]:443")

    def test_iii_a_warden_under_the_default_declaring_no_cap_does_not_offer_the_line(
        self,
    ) -> None:
        bare = "tcp://example.test:9000"
        self.assertFalse(line.offers(4096, bare))
        self.assertTrue(line.offers(CAP, bare))
        self.assertTrue(line.offers(4096, "tcp://example.test:9000?cap=4096"))


class TheFrame(unittest.TestCase):
    """Article III: a length, then that many envelope bytes, and nothing else."""

    def test_iii_a_frame_is_a_length_then_that_many_envelope_bytes(self) -> None:
        self.assertEqual(line.frame(b"hello"), b"\x00" * 7 + b"\x05" + b"hello")

    def test_iii_the_length_is_written_the_way_the_wire_writes_an_int(self) -> None:
        # Eight bytes, big-endian, signed — pinned literally rather than by
        # calling the same encoder the frame calls.
        made = line.frame(b"x" * 258)
        self.assertEqual(made[:8], b"\x00\x00\x00\x00\x00\x00\x01\x02")
        self.assertEqual(len(made[:8]), 8)

    def test_iii_the_length_does_not_count_itself(self) -> None:
        made = line.frame(b"abcdefghij")
        self.assertEqual(int.from_bytes(made[:8], "big"), 10)
        self.assertEqual(len(made), 18)

    def test_iii_and_nothing_else(self) -> None:
        self.assertEqual(len(line.frame(b"y" * 99)), 8 + 99)

    def test_iii_a_zero_length_frame_is_malformed_on_a_line(self) -> None:
        with self.assertRaises(line.LineError):
            line.frame(b"")

    def test_iii_an_over_cap_send_is_refused_in_the_senders_own_kit(self) -> None:
        with self.assertRaises(line.LineError):
            line.frame(b"z" * 65, cap=64)
        self.assertEqual(len(line.frame(b"z" * 64, cap=64)), 8 + 64)


class OverARealSocket(unittest.TestCase):
    """Every case here runs over a bound loopback port, torn down with the case."""

    handler = staticmethod(echo)
    cap = CAP

    def setUp(self) -> None:
        try:
            self.listener = line.Listener(
                type(self).handler, cap=type(self).cap
            ).start()
        except OSError as bad:  # pragma: no cover - only if loopback is unusable
            self.skipTest(f"no loopback socket: {bad}")
        self.addCleanup(self.listener.close)

    def dial(self, timeout: float = 5.0) -> line.Line:
        opened = line.dial(self.listener.hint, timeout=timeout)
        self.addCleanup(opened.close)
        return opened

    def test_iii_a_frame_goes_out_and_the_answer_comes_back_on_the_same_line(
        self,
    ) -> None:
        opened = self.dial()
        opened.send(b"one")
        self.assertEqual(opened.receive(), b"answered:one")

    def test_iii_one_persistent_connection_carries_many_asks(self) -> None:
        opened = self.dial()
        for number in range(5):
            opened.send(f"ask{number}".encode())
            self.assertEqual(opened.receive(), f"answered:ask{number}".encode())

    def test_iii_the_listening_end_publishes_a_hint_a_dialer_reads(self) -> None:
        road = line.parse_hint(self.listener.hint)
        self.assertEqual(road.port, self.listener.port)
        self.assertEqual(road.cap, line.DEFAULT_CAP)

    def test_iii_a_length_at_or_below_zero_ends_the_connection_without_a_word(
        self,
    ) -> None:
        raw = socket.create_connection((self.listener.host, self.listener.port), 5)
        self.addCleanup(raw.close)
        raw.sendall(b"\x00" * 8 + b"anything")
        self.assertTrue(said_nothing_and_ended(raw), "the far end said something")

    def test_iii_a_negative_length_ends_the_connection_without_a_word(self) -> None:
        raw = socket.create_connection((self.listener.host, self.listener.port), 5)
        self.addCleanup(raw.close)
        raw.sendall((-1).to_bytes(8, "big", signed=True))
        self.assertTrue(said_nothing_and_ended(raw))

    def test_iii_a_body_the_connection_ends_before_delivering_is_a_fault(self) -> None:
        opened = self.dial()
        opened.socket.sendall((32).to_bytes(8, "big") + b"only four")
        opened.socket.shutdown(socket.SHUT_WR)
        # The listener saw the fault and ended without a word.
        self.assertTrue(said_nothing_and_ended(opened.socket))

    def test_iii_a_peer_that_simply_goes_away_is_not_a_fault(self) -> None:
        opened = self.dial()
        opened.socket.shutdown(socket.SHUT_WR)
        self.assertTrue(said_nothing_and_ended(opened.socket))


def maybe(_line, message):
    return None if message == b"refused" else b"answered:" + message


class WhenTheDoorIsSilent(unittest.TestCase):
    """Article III: silence has no wire form on a line, and the line lives on."""

    def setUp(self) -> None:
        try:
            self.listener = line.Listener(maybe).start()
        except OSError as bad:  # pragma: no cover
            self.skipTest(f"no loopback socket: {bad}")
        self.addCleanup(self.listener.close)

    def dial(self, timeout: float = 5.0) -> line.Line:
        opened = line.dial(self.listener.hint, timeout=timeout)
        self.addCleanup(opened.close)
        return opened

    def test_iii_a_refused_ask_produces_no_frame(self) -> None:
        opened = self.dial(timeout=0.4)
        opened.send(b"refused")
        with self.assertRaises((TimeoutError, socket.timeout)):
            opened.receive()

    def test_iii_a_frame_that_fails_the_judgment_is_silence_and_the_line_lives_on(
        self,
    ) -> None:
        opened = self.dial(timeout=0.4)
        opened.send(b"refused")
        with self.assertRaises((TimeoutError, socket.timeout)):
            opened.receive()
        opened.socket.settimeout(5)
        opened.send(b"after")
        self.assertEqual(opened.receive(), b"answered:after")


class WhenTheDoorDeclaresACap(unittest.TestCase):
    """Article III: the cap is the receiving end's own, and it says it first."""

    def setUp(self) -> None:
        try:
            self.listener = line.Listener(echo, cap=64).start()
        except OSError as bad:  # pragma: no cover
            self.skipTest(f"no loopback socket: {bad}")
        self.addCleanup(self.listener.close)

    def test_iii_the_road_says_its_cap_before_a_byte_flows(self) -> None:
        self.assertTrue(self.listener.hint.endswith("?cap=64"))
        self.assertEqual(line.parse_hint(self.listener.hint).cap, 64)

    def test_iii_a_dialer_reads_the_cap_and_stays_at_or_under_it(self) -> None:
        opened = line.dial(self.listener.hint, timeout=5)
        self.addCleanup(opened.close)
        self.assertEqual(opened.far_cap, 64)
        with self.assertRaises(line.LineError):
            opened.send(b"q" * 65)
        # Refused in the sender's own kit, so the line never noticed.
        opened.send(b"q" * 64)
        self.assertEqual(opened.receive(), b"answered:" + b"q" * 64)

    def test_iii_a_length_above_the_receiving_ends_cap_ends_the_connection(
        self,
    ) -> None:
        raw = socket.create_connection((self.listener.host, self.listener.port), 5)
        self.addCleanup(raw.close)
        raw.sendall((65).to_bytes(8, "big") + b"r" * 65)
        self.assertTrue(said_nothing_and_ended(raw))

    def test_iii_the_dialing_end_publishes_nothing_and_promises_the_default(
        self,
    ) -> None:
        opened = line.dial(self.listener.hint, timeout=5)
        self.addCleanup(opened.close)
        self.assertEqual(opened.cap, line.DEFAULT_CAP)


class EitherEndMayOriginate(unittest.TestCase):
    """Article III: frames flow both directions on one connection.

    A ground that cannot be called dials out and is asked down the line it
    holds, so the listener is driven here as the asker.
    """

    def setUp(self) -> None:
        self.held = []
        ready = __import__("threading").Event()

        def keep(a_line, message):
            self.held.append(a_line)
            ready.set()
            return b"answered:" + message

        try:
            self.listener = line.Listener(keep).start()
        except OSError as bad:  # pragma: no cover
            self.skipTest(f"no loopback socket: {bad}")
        self.addCleanup(self.listener.close)
        self.dialer = line.dial(self.listener.hint, timeout=5)
        self.addCleanup(self.dialer.close)
        self.dialer.send(b"first")
        self.assertEqual(self.dialer.receive(), b"answered:first")
        ready.wait(5)

    def test_iii_the_listening_end_may_originate_down_a_line_it_holds(self) -> None:
        held = self.held[0]
        held.send(b"asked-outward")
        self.assertEqual(self.dialer.receive(), b"asked-outward")

    def test_iii_answers_return_in_whatever_order_the_work_finishes(self) -> None:
        held = self.held[0]
        held.send(b"second")
        held.send(b"third")
        self.assertEqual(self.dialer.receive(), b"second")
        self.assertEqual(self.dialer.receive(), b"third")


class ARealDoorBehindTheLine(unittest.TestCase):
    """Article III: a well-formed frame that fails the judgment is ordinary
    silence, and the line lives on. Only a framing fault ends it."""

    def setUp(self) -> None:
        self.warden = pins.a_warden()
        self.warden.grant(
            pins.VOICE,
            pins.arithmetic.commitment(self.warden.name, pins.HEIR),
            [pins.BEING_PK],
        )

        def judge(_line, message):
            # The road hands the whole envelope to the warden's one entry
            # point and takes bytes or silence back. It opens no seal.
            return asyncio.run(self.warden.arrive(message))

        try:
            self.listener = line.Listener(judge).start()
        except OSError as bad:  # pragma: no cover
            self.skipTest(f"no loopback socket: {bad}")
        self.addCleanup(self.listener.close)
        self.opened = line.dial(self.listener.hint, timeout=5)
        self.addCleanup(self.opened.close)

    def ask(self, **kwargs) -> bytes:
        return pins.say(
            self.warden, being=pins.BEING_PK, call=pins.method("lit"), **kwargs
        )

    def test_iii_an_answer_returns_on_the_line_its_ask_arrived_on(self) -> None:
        self.opened.send(self.ask(seq=1))
        answer = pins.opened(self.opened.receive())
        self.assertEqual(answer["warden"], self.warden.name)
        self.assertEqual(answer["seq"], 1)
        self.assertEqual(answer["data"], pins.LIT)

    def test_iii_a_frame_that_fails_the_judgment_is_silence_and_the_line_lives_on(
        self,
    ) -> None:
        refused = self.ask(seq=1)
        self.opened.send(refused)
        self.assertEqual(pins.opened(self.opened.receive())["data"], pins.LIT)
        self.opened.send(refused)  # a replay, which is silence
        self.opened.socket.settimeout(0.4)
        with self.assertRaises((TimeoutError, socket.timeout)):
            self.opened.receive()
        # The line lived on.
        self.opened.socket.settimeout(5)
        self.opened.send(self.ask(seq=2))
        self.assertEqual(pins.opened(self.opened.receive())["seq"], 2)


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
