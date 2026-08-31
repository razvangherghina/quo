"""The arithmetic: the four algorithms, named once and never negotiated.

Article VI of the constitution is the whole specification. Ed25519 signs,
X25519 seals, SHA-256 commits, AES-256-GCM encrypts under a key derived
through HKDF-SHA-256 with the fixed label ``quo-seal``. There is no suite
identifier and no negotiation.

Every draw of randomness is taken as an argument here, never reached for: no
function in this module mints a key of its own.
"""

from __future__ import annotations

import hashlib
from typing import Tuple

from cryptography.exceptions import InvalidSignature, InvalidTag
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives.asymmetric.x25519 import (
    X25519PrivateKey,
    X25519PublicKey,
)
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.hashes import SHA256
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

__all__ = [
    "ArithmeticError",
    "KEY_LENGTH",
    "SIGNATURE_LENGTH",
    "NONCE_LENGTH",
    "TAG_LENGTH",
    "SEAL_INFO",
    "digest",
    "commitment",
    "signing_public",
    "sign",
    "small_order",
    "verify",
    "sealing_public",
    "agree",
    "derive",
    "seal",
    "unseal",
]


class ArithmeticError(ValueError):
    """An input the arithmetic refuses, or a seal that does not open."""


KEY_LENGTH = 32
SIGNATURE_LENGTH = 64
NONCE_LENGTH = 12
TAG_LENGTH = 16

SEAL_INFO = b"quo-seal"
"""The fixed ASCII label. The label and the info are one constant, not two."""

_DRAWN = KEY_LENGTH + NONCE_LENGTH


def _key(name: str, value: bytes) -> bytes:
    """A key is 32 bytes. Anything else is refused before an algorithm sees it."""
    if not isinstance(value, (bytes, bytearray)):
        raise ArithmeticError(f"{name} must be bytes")
    if len(value) != KEY_LENGTH:
        raise ArithmeticError(f"{name} must be {KEY_LENGTH} bytes, got {len(value)}")
    return bytes(value)


def digest(data: bytes) -> bytes:
    """SHA-256 commits."""
    return hashlib.sha256(data).digest()


def commitment(warden: bytes, heir: bytes) -> bytes:
    """The pk of the warden the heir would spend at, then the heir's pk, hashed.

    For a warden's own name that warden is itself.
    """
    return digest(_key("warden", warden) + _key("heir", heir))


def signing_public(secret: bytes) -> bytes:
    """The Ed25519 public key of the pair minted from these thirty-two bytes.

    The bytes are the seed as Ed25519 defines it; the public key follows by the
    algorithm's own rules.
    """
    private = Ed25519PrivateKey.from_private_bytes(_key("secret", secret))
    return private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)


def sign(secret: bytes, message: bytes) -> bytes:
    """Sign a message under the pair minted from this seed."""
    private = Ed25519PrivateKey.from_private_bytes(_key("secret", secret))
    return private.sign(bytes(message))


# The small-order points of Curve25519's group, as Ed25519 public keys. A
# signature under one binds to no secret, so a voice wearing one is silence.
_SMALL_ORDER = frozenset(
    bytes.fromhex(point)
    for point in (
        "0100000000000000000000000000000000000000000000000000000000000000",
        "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
        "0000000000000000000000000000000000000000000000000000000000000000",
        "0000000000000000000000000000000000000000000000000000000000000080",
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
        "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
        "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
    )
)


def small_order(pk: bytes) -> bool:
    """Whether this public key is one of the curve's small-order points."""
    return bytes(pk) in _SMALL_ORDER


def verify(voice: bytes, message: bytes, signature: bytes) -> bool:
    """Whether this signature stands under this voice over these bytes.

    False rather than an exception: a signature that does not verify is an
    ordinary answer, not a malformed input.
    """
    try:
        public = Ed25519PublicKey.from_public_bytes(_key("voice", voice))
    except ArithmeticError:
        raise
    if len(signature) != SIGNATURE_LENGTH:
        return False
    if small_order(voice):
        return False
    try:
        public.verify(bytes(signature), bytes(message))
    except InvalidSignature:
        return False
    return True


def sealing_public(secret: bytes) -> bytes:
    """The X25519 public key of the pair minted from these thirty-two bytes.

    The bytes are the private key itself. Clamping happens inside the
    algorithm; nothing is derived from a seed first.
    """
    private = X25519PrivateKey.from_private_bytes(_key("secret", secret))
    return private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)


def agree(secret: bytes, public: bytes) -> bytes:
    """The raw thirty-two-byte X25519 shared secret, exactly as it comes back.

    **An agreement that hands back thirty-two zero bytes is refused at the
    point of agreement**: the padlock was not a real key, and a seal derived
    from it would protect nothing. ``cryptography`` refuses the degenerate
    output itself, with a ``ValueError`` of its own that is not this module's
    refusal — so it is caught here and said as one, and the zero check stands
    behind it for a platform that would hand the bytes back instead.
    """
    private = X25519PrivateKey.from_private_bytes(_key("secret", secret))
    other = X25519PublicKey.from_public_bytes(_key("public", public))
    try:
        shared = private.exchange(other)
    except ValueError as bad:
        raise ArithmeticError("a dead agreement") from bad
    if shared == b"\x00" * KEY_LENGTH:
        raise ArithmeticError("a dead agreement")
    return shared


def derive(shared: bytes) -> Tuple[bytes, bytes]:
    """Draw forty-four bytes: thirty-two of key, then twelve of nonce.

    HKDF-SHA-256 used whole, over the raw shared secret with nothing prepended
    and nothing hashed first, under an empty salt — a salt of zero length,
    not a run of zero bytes — and the fixed info ``quo-seal``.
    """
    drawn = HKDF(
        algorithm=SHA256(),
        length=_DRAWN,
        salt=b"",
        info=SEAL_INFO,
    ).derive(_key("shared", shared))
    return drawn[:KEY_LENGTH], drawn[KEY_LENGTH:]


def seal(shared: bytes, additional: bytes, plaintext: bytes) -> bytes:
    """AES-256-GCM under the derived key and nonce: ciphertext first, tag after.

    The additional authenticated data is the ephemeral public key.
    """
    key, nonce = derive(shared)
    return AESGCM(key).encrypt(nonce, bytes(plaintext), bytes(additional))


def unseal(shared: bytes, additional: bytes, box: bytes) -> bytes:
    """Open a box, or refuse it. The last sixteen bytes are the tag."""
    if len(box) < TAG_LENGTH:
        raise ArithmeticError("a box carries at least the sixteen-byte tag")
    key, nonce = derive(shared)
    try:
        return AESGCM(key).decrypt(nonce, bytes(box), bytes(additional))
    except InvalidTag as failure:
        raise ArithmeticError("the seal does not open") from failure
