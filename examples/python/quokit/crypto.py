"""The six algorithms: Ed25519, X25519, ML-KEM-768, SHA-256, AES-256-GCM, HKDF-SHA-256."""

import hashlib
import hmac

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.asymmetric import ed25519, x25519
from cryptography.hazmat.primitives.asymmetric.mlkem import MLKEM768PrivateKey, MLKEM768PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def sha256(data):
    return hashlib.sha256(data).digest()


def hkdf(ikm, label, length):
    """HKDF-SHA-256 with the zero-length salt; `label` is the ASCII info."""
    prk = hmac.new(b"", ikm, hashlib.sha256).digest()
    info = label.encode("ascii")
    out, block, i = b"", b"", 1
    while len(out) < length:
        block = hmac.new(prk, block + info + bytes([i]), hashlib.sha256).digest()
        out += block
        i += 1
    return out[:length]


def key_nonce(ikm, label):
    k = hkdf(ikm, label, 44)
    return k[:32], k[32:]


def gcm_seal(key, nonce, plain, aad):
    return AESGCM(key).encrypt(nonce, plain, aad)


def gcm_open(key, nonce, sealed, aad):
    if len(sealed) < 16:
        return None
    try:
        return AESGCM(key).decrypt(nonce, sealed, aad)
    except InvalidTag:
        return None


# ---- X25519 ----

def x25519_public(secret):
    return x25519.X25519PrivateKey.from_private_bytes(secret).public_key().public_bytes_raw()


def agree(secret, public):
    """The agreement, or None where it is thirty-two zero bytes."""
    try:
        pk = x25519.X25519PublicKey.from_public_bytes(public)
        out = x25519.X25519PrivateKey.from_private_bytes(secret).exchange(pk)
    except ValueError:
        return None
    if out == bytes(32):
        return None
    return out


# A clamped scalar is a multiple of eight, so its agreement with a point of
# small order is zero, and with any other point it is not.
_PROBE = bytes([0x55]) * 32


def takes_seal(public):
    """False for a point of small order, in any spelling."""
    return len(public) == 32 and agree(_PROBE, public) is not None


# ---- Ed25519 ----

def ed_public(seed):
    return ed25519.Ed25519PrivateKey.from_private_bytes(seed).public_key().public_bytes_raw()


def ed_sign(seed, msg):
    return ed25519.Ed25519PrivateKey.from_private_bytes(seed).sign(msg)


_P = 2 ** 255 - 19
_L = 2 ** 252 + 27742317777372353535851937790883648493
_D = (-121665 * pow(121666, _P - 2, _P)) % _P
_I = pow(2, (_P - 1) // 4, _P)


def _add(a, b):
    x1, y1, z1, t1 = a
    x2, y2, z2, t2 = b
    A = (y1 - x1) * (y2 - x2) % _P
    B = (y1 + x1) * (y2 + x2) % _P
    C = 2 * t1 * t2 * _D % _P
    Dd = 2 * z1 * z2 % _P
    E, F, G, H = B - A, Dd - C, Dd + C, B + A
    return (E * F % _P, G * H % _P, F * G % _P, E * H % _P)


def _mul(s, pt):
    q = (0, 1, 1, 0)
    while s > 0:
        if s & 1:
            q = _add(q, pt)
        pt = _add(pt, pt)
        s >>= 1
    return q


def _eq(a, b):
    return (a[0] * b[2] - b[0] * a[2]) % _P == 0 and (a[1] * b[2] - b[1] * a[2]) % _P == 0


def _decode(b):
    """Decode a point; y at or above p is refused. x = 0 with the sign bit set
    decodes to x = 0, and the callers judge that spelling."""
    if len(b) != 32:
        return None
    y = int.from_bytes(b, "little")
    sign = y >> 255
    y &= (1 << 255) - 1
    if y >= _P:
        return None
    x2 = (y * y - 1) * pow(_D * y * y + 1, _P - 2, _P) % _P
    if x2 == 0:
        return (0, y, 1, 0)
    x = pow(x2, (_P + 3) // 8, _P)
    if (x * x - x2) % _P != 0:
        x = x * _I % _P
    if (x * x - x2) % _P != 0:
        return None
    if (x & 1) != sign:
        x = _P - x
    return (x, y, 1, x * y % _P)


def encode(pt):
    zi = pow(pt[2], _P - 2, _P)
    x, y = pt[0] * zi % _P, pt[1] * zi % _P
    return (y | ((x & 1) << 255)).to_bytes(32, "little")


_GY = 4 * pow(5, _P - 2, _P) % _P
BASE = _decode(_GY.to_bytes(32, "little"))
_ZERO = (0, 1, 1, 0)


def _small_order(pt):
    return _eq(_mul(8, pt), _ZERO)


def ed_verify(pk, msg, sig):
    """RFC 8032 cofactorless check, failing in SPEC.md's listed places and no other."""
    if len(sig) != 64 or len(pk) != 32:
        return False
    s = int.from_bytes(sig[32:], "little")
    if s >= _L:
        return False
    R = _decode(sig[:32])
    if R is None or encode(R) != sig[:32]:
        return False
    # x = 0 with the sign bit set decodes, and is refused as small order.
    A = _decode(pk)
    if A is None or _small_order(A):
        return False
    k = int.from_bytes(hashlib.sha512(sig[:32] + pk + msg).digest(), "little") % _L
    return _eq(_mul(s, BASE), _add(R, _mul(k, A)))


# ---- ML-KEM-768 ----

def mlkem_public(dz):
    """The encapsulation key of the lock whose 64-byte seed is d || z."""
    return MLKEM768PrivateKey.from_seed_bytes(dz).public_key().public_bytes_raw()


def mlkem_decaps(dz, ct):
    return MLKEM768PrivateKey.from_seed_bytes(dz).decapsulate(ct)


def mlkem_valid(ek):
    """FIPS 203's check of an encapsulation key, as the library makes it."""
    try:
        MLKEM768PublicKey.from_public_bytes(ek)
    except ValueError:
        return False
    return True


def mlkem_encaps(ek):
    return MLKEM768PublicKey.from_public_bytes(ek).encapsulate()
