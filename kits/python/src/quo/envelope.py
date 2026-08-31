"""The envelope: a sealed box with the key to open it stapled to the lid.

Article XI of the constitution is the whole specification. What crosses is an
ephemeral public key and then one ciphertext, sealed to the recipient's
padlock; nothing else is outside. Inside the seal are the payload and one
signature over it, the signature being the last sixty-four bytes. The payload
begins with one byte naming the record it carries — zero for a ``say``, one
for an ``answer`` — and the signature covers that byte.

The two records ride in Quo's own notation, by the wire's own rules. Their
field order is fixed by the constitution and by nothing else; the blueprint
below is that text.

Every refusal here is the same refusal: :class:`EnvelopeError`, saying nothing
about which step failed. A door turns it into silence.
"""

from __future__ import annotations

from typing import Any, Mapping

from . import arithmetic, notation, wire

__all__ = [
    "EnvelopeError",
    "SAY",
    "ANSWER",
    "SIGNATURE_LENGTH",
    "EPHEMERAL_LENGTH",
    "PAYLOAD_BLUEPRINT",
    "RECORDS",
    "SAY_TYPE",
    "ANSWER_TYPE",
    "encode_record",
    "decode_record",
    "payload",
    "sign_payload",
    "seal",
    "unseal",
]


class EnvelopeError(ValueError):
    """A message the envelope refuses, or a value it cannot write."""


SAY = 0
ANSWER = 1

SIGNATURE_LENGTH = arithmetic.SIGNATURE_LENGTH
EPHEMERAL_LENGTH = arithmetic.KEY_LENGTH

PAYLOAD_BLUEPRINT = (
    "Envelope\n"
    "  say() say\n"
    "  answer() answer\n"
    "\n"
    "say\n"
    "  voice b32\n"
    "  recipient b32\n"
    "  commitment b32?\n"
    "  seq int\n"
    "  padlock b32\n"
    "  hints [text]\n"
    "  allowance allowance\n"
    "  being being?\n"
    "  method method?\n"
    "\n"
    "allowance\n"
    "  time int\n"
    "  hops int\n"
    "\n"
    "method\n"
    "  name text\n"
    "  args bytes\n"
    "\n"
    "answer\n"
    "  warden being\n"
    "  seq int\n"
    "  data bytes?\n"
)
"""The two records, in the field order Article XI fixes.

The class block is a kit's own wrapper: the notation has no way to write a
record without one, and no digest of either record is ever computed or
carried, so the wrapper's name decides nothing.
"""

RECORDS = wire.records_of(notation.parse(PAYLOAD_BLUEPRINT))

SAY_TYPE: notation.Type = notation.Base("say")
ANSWER_TYPE: notation.Type = notation.Base("answer")

_TYPES = {SAY: SAY_TYPE, ANSWER: ANSWER_TYPE}


def _type_of(kind: int) -> notation.Type:
    type_ = _TYPES.get(kind)
    if type_ is None:
        raise EnvelopeError(f"a first byte that names no record: {kind}")
    return type_


def encode_record(kind: int, record: Mapping[str, Any]) -> bytes:
    """Write a ``say`` or an ``answer``, without the byte that names it."""
    try:
        return wire.encode(_type_of(kind), record, RECORDS)
    except wire.WireError as bad:
        raise EnvelopeError(str(bad)) from bad


def decode_record(kind: int, data: bytes) -> dict:
    """Read a ``say`` or an ``answer`` from exactly these bytes, or refuse them."""
    try:
        return wire.decode(_type_of(kind), data, RECORDS)
    except wire.WireError as bad:
        raise EnvelopeError(str(bad)) from bad


def payload(kind: int, record: Mapping[str, Any]) -> bytes:
    """The byte naming the record, then the record."""
    return bytes([kind]) + encode_record(kind, record)


def sign_payload(secret: bytes, kind: int, record: Mapping[str, Any]) -> bytes:
    """The payload with its signature behind it: what goes inside the seal."""
    body = payload(kind, record)
    return body + arithmetic.sign(secret, body)


def seal(
    kind: int,
    record: Mapping[str, Any],
    secret: bytes,
    padlock: bytes,
    ephemeral_secret: bytes,
) -> bytes:
    """One envelope: the ephemeral public key, then one ciphertext.

    ``secret`` signs the payload — the voice for a ``say``, the warden's own
    name for an ``answer``. ``ephemeral_secret`` is drawn fresh for every
    message by the caller and never reached for here.
    """
    inside = sign_payload(secret, kind, record)
    try:
        ephemeral = arithmetic.sealing_public(ephemeral_secret)
        shared = arithmetic.agree(ephemeral_secret, padlock)
        return ephemeral + arithmetic.seal(shared, ephemeral, inside)
    except arithmetic.ArithmeticError as bad:
        raise EnvelopeError(str(bad)) from bad


def unseal(secret: bytes, envelope: bytes, expect: int) -> dict:
    """Open an envelope and read the one record this receiver expects.

    ``expect`` is the byte the leading byte must be: a door expects a ``say``,
    a caller reading an answer expects an ``answer``. Position decides nothing
    and the payload says what it is, so a record arriving under the other
    byte is refused here rather than read as the other record.

    Unsealing, decoding and verifying the signature are one act. What comes
    back is the record; placing the voice, checking the recipient and
    everything after it are the judgment's, not the envelope's.
    """
    wanted = _type_of(expect)
    if not isinstance(envelope, (bytes, bytearray)):
        raise EnvelopeError("an envelope is bytes")
    envelope = bytes(envelope)
    if len(envelope) <= EPHEMERAL_LENGTH:
        raise EnvelopeError("an envelope with no room for a ciphertext")
    ephemeral = envelope[:EPHEMERAL_LENGTH]
    box = envelope[EPHEMERAL_LENGTH:]
    try:
        shared = arithmetic.agree(secret, ephemeral)
        inside = arithmetic.unseal(shared, ephemeral, box)
    except arithmetic.ArithmeticError as bad:
        raise EnvelopeError(str(bad)) from bad
    if len(inside) <= SIGNATURE_LENGTH:
        raise EnvelopeError("no payload behind the signature")
    body = inside[:-SIGNATURE_LENGTH]
    signature = inside[-SIGNATURE_LENGTH:]
    if body[0] != expect:
        raise EnvelopeError(f"a record presented under the byte {body[0]}")
    try:
        record = wire.decode(wanted, body[1:], RECORDS)
    except wire.WireError as bad:
        raise EnvelopeError(str(bad)) from bad
    voice = record["voice"] if expect == SAY else record["warden"]
    if not arithmetic.verify(voice, body, signature):
        raise EnvelopeError("a signature that does not stand")
    return record
