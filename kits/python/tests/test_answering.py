"""The caller's own half, which a door's bench never exercises.

The record a caller keeps of the asks it has out, and the shorter road Article
XII gives an answer at the caller's end. Two of that road's four checks need
the caller's own bookkeeping — that the answering warden is a door this ground
asked, and that an ask is awaiting under that padlock, that warden and that
seq — and until this record existed neither was made anywhere.

The rest is Article VII's fifth thing: a held relation keeps the heir keypair,
and a rotation is signed by the heir. A caller side that has only ever rotated
once is a caller side nobody has tested, so every case here rotates twice.
"""

import asyncio
import unittest

from quo import arithmetic, envelope, warden

from test_warden import (
    BEING_BLUEPRINT,
    BEING_DIGEST,
    BEING_PK,
    HEIR_SECRET,
    VOICE_SECRET,
    a_being,
    a_warden,
    judged,
    method,
    seed,
)


def a_caller(first: int = 30) -> warden.Warden:
    """A second ground, standing nowhere until it is handed an invitation."""
    drawn = [seed(byte) for byte in range(first, first + 12)]
    return warden.Warden(
        seed(21),
        seed(22),
        mint=lambda: drawn.pop(0),
        heir=arithmetic.signing_public(seed(23)),
    )


class TheHeirAHolderHolds(unittest.TestCase):
    """Article VII: what a holder holds is five things, the heir among them."""

    def setUp(self) -> None:
        self.granter = a_warden()
        self.invitation = self.granter.invite(BEING_PK, VOICE_SECRET, HEIR_SECRET)
        self.caller = a_caller()

    def test_a_held_relation_keeps_the_heir_the_invitation_carried(self) -> None:
        row = self.caller.stand(self.invitation)
        self.assertEqual(row.heir, self.invitation.heir)
        self.assertEqual(row.heir_secret, self.invitation.heir_secret)

    def test_a_second_rotation_is_signed_by_the_heir_and_not_the_voice(self) -> None:
        row = self.caller.stand(self.invitation)

        first = seed(70)
        message, _ = self.caller.ask(row, seed(71), next_heir=first)
        self.assertEqual(judged(self.granter, message).placement, warden.ROTATION)

        # The one no demo makes. It can only be signed by the key the first
        # rotation committed to; signing with the voice would present the
        # standing's current holder as its own heir, and the door would place
        # it as a holder carrying a commitment, which is refused.
        second = seed(72)
        message, _ = self.caller.ask(row, seed(73), next_heir=second)
        self.assertEqual(judged(self.granter, message).placement, warden.ROTATION)

        standing = self.granter.inbound[0]
        self.assertEqual(standing.voice, arithmetic.signing_public(first))
        self.assertEqual(
            standing.commitment,
            arithmetic.commitment(self.granter.name, arithmetic.signing_public(second)),
        )

    def test_a_relation_with_no_heir_cannot_rotate(self) -> None:
        row = self.caller.stand(self.invitation)
        row.heir, row.heir_secret = b"", b""
        with self.assertRaises(warden.Silence):
            self.caller.ask(row, seed(74), next_heir=seed(75))
        # An ordinary ask still stands: what is missing is the heir, not the
        # voice.
        self.caller.ask(row, seed(76))


class TheAnswerAtTheCallersEnd(unittest.TestCase):
    """Article XII: the shorter road, and the two checks only a caller can make."""

    def setUp(self) -> None:
        self.granter = a_warden()
        self.invitation = self.granter.invite(BEING_PK, VOICE_SECRET, HEIR_SECRET)
        self.caller = a_caller()
        self.row = self.caller.stand(self.invitation)

    def exchange(self, **over) -> tuple[bytes, int]:
        message, seq = self.caller.ask(self.row, seed(80), **over)
        outcome = judged(self.granter, message)
        self.assertIsNotNone(outcome.answer)
        return outcome.answer, seq

    def test_an_answer_nothing_awaits_is_silence(self) -> None:
        reply, seq = self.exchange(next_heir=seed(81), method=method("limit"))
        self.assertEqual(len(self.row.awaiting), 1)

        answer = self.caller.hear(reply)
        self.assertEqual(answer["seq"], seq)
        self.assertEqual(len(self.row.awaiting), 0)

        # The very same bytes: well-formed, well-signed, from the right door,
        # and silence, because nothing awaits them.
        with self.assertRaises(warden.Silence):
            self.caller.hear(reply)
        # And the envelope's own half still reads them, which is what makes the
        # refusal the caller's bookkeeping rather than the envelope's.
        self.assertEqual(
            envelope.unseal(self.caller.padlock_secret, reply, envelope.ANSWER)["seq"],
            seq,
        )

    def test_an_answer_from_a_door_this_ask_never_went_to(self) -> None:
        # A second house, standing on its own name, that this caller holds no
        # relation with. Somebody else's ask there names this caller's padlock
        # as the way back, so what comes out opens perfectly here.
        other = warden.Warden(
            seed(50),
            seed(51),
            mint=lambda: seed(52),
            heir=arithmetic.signing_public(seed(53)),
        )
        other.beings[BEING_PK] = a_being()
        other.blueprints[BEING_DIGEST] = BEING_BLUEPRINT
        theirs = other.invite(BEING_PK, seed(54), seed(55))

        elsewhere = a_caller(first=90)
        away = elsewhere.stand(theirs)
        # Sealed to this caller's padlock rather than the asker's own.
        elsewhere.padlock = self.caller.padlock
        message, _ = elsewhere.ask(away, seed(56), next_heir=seed(57))
        reply = judged(other, message).answer
        self.assertIsNotNone(reply)

        # It unseals here, it says `answer`, and its signature verifies against
        # the warden its own record carries. It is still silence.
        envelope.unseal(self.caller.padlock_secret, reply, envelope.ANSWER)
        with self.assertRaises(warden.Silence):
            self.caller.hear(reply)

    def test_two_asks_whose_answers_could_not_be_told_apart(self) -> None:
        message, seq = self.caller.ask(self.row, seed(82), next_heir=seed(83), seq=1)
        self.assertEqual(seq, 1)
        # A rotation starts the far door's mark fresh, so a caller may open at
        # one again — the same padlock, the same warden, the same number, and
        # two answers nothing could tell apart.
        with self.assertRaises(warden.Silence):
            self.caller.ask(self.row, seed(84), next_heir=seed(85), seq=1)

        # Forgoing is the caller saying it has stopped waiting.
        self.assertTrue(self.caller.forgo(self.row, 1))
        self.assertFalse(self.caller.forgo(self.row, 1))
        self.caller.ask(self.row, seed(84), next_heir=seed(85), seq=1)
        self.assertIsNotNone(message)

    def test_accept_leaves_awaiting_only_what_it_hands_an_answer_back_for(
        self,
    ) -> None:
        caller = a_caller(first=110)

        class Straight:
            """This case's own delivery: bytes straight to the granting door."""

            def arrived(inner, padlock, via) -> None:
                return None

            async def send(inner, row, message):
                return (await self.granter.judge(message)).answer

        caller.delivery = Straight()
        [handle] = asyncio.run(caller.accept(self.invitation, label="lamp"))
        self.assertIsNotNone(handle)
        # Every ask accept made was settled by the answer that came back, so
        # nothing is left awaiting: an ask nobody is waiting on any more is an
        # answer that could never be paired.
        self.assertEqual(len(caller.outbound[0].awaiting), 0)


class TheNumberACallerOpensWith(unittest.TestCase):
    """Article VIII: which number a caller opens with, above one, is its own."""

    def test_a_caller_chooses_and_the_row_counts_on_from_there(self) -> None:
        granter = a_warden()
        invitation = granter.invite(BEING_PK, VOICE_SECRET, HEIR_SECRET)
        caller = a_caller()
        row = caller.stand(invitation)

        opening = 4_096
        message, seq = caller.ask(row, seed(86), next_heir=seed(87), seq=opening)
        self.assertEqual(seq, opening)
        outcome = judged(granter, message)
        self.assertEqual(outcome.placement, warden.ROTATION)
        self.assertEqual(caller.hear(outcome.answer)["seq"], opening)

        # A rotation starts the far door's mark fresh, so the number above one
        # is honoured and the mark moves there.
        self.assertEqual(granter.inbound[0].mark, opening)


if __name__ == "__main__":
    unittest.main()
