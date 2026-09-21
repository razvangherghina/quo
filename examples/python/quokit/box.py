"""Keys, boxes, the payload's shape and the reply shapes."""

from . import crypto as c
from .values import Container, Invalid, JObj, Num, parse, json_string

SIZE = 1048576
ZERO32 = bytes(32)
ZERO_EDGE = bytes(32)
CT_LEN = 1088
MAX_NUMBER = 2 ** 53 - 1
WORDS = ("removed", "unannounced", "repeated")
SILENCE = b'{"silence":true}'


def seed_bytes(seed):
    if isinstance(seed, (bytes, bytearray)) and len(seed) == 32:
        return bytes(seed)
    if isinstance(seed, str):
        seed = seed.encode("utf-8")
    return c.sha256(bytes(seed))


class WardKey:
    def __init__(self, seed):
        s = seed_bytes(seed)
        self.sign_seed = c.hkdf(s, "quo-ward-sign", 32)
        self.seal_scalar = c.hkdf(s, "quo-ward-seal", 32)
        self.signing_pk = c.ed_public(self.sign_seed)
        self.padlock = c.x25519_public(self.seal_scalar)

    @property
    def pk_hex(self):
        return (self.signing_pk + self.padlock).hex()


def follow(edge, agreement):
    return c.hkdf(edge + agreement, "quo-edge", 32)


def knock_edge(shared):
    return c.hkdf(shared, "quo-lock", 32)


# ---- the standing's side of a box ----

def seal_ask(padlock, head, payload, signer_seed, edge, lid_secret, ciphertext=b""):
    """Seal an ask. For a knock, pass the ciphertext and the knock's edge key."""
    lid = c.x25519_public(lid_secret)
    agr = c.agree(lid_secret, padlock)
    if agr is None:
        raise ValueError("padlock takes no seal")
    hk, hn = c.key_nonce(agr, "quo-seal")
    bk, bn = c.key_nonce(agr + edge, "quo-edge-seal")
    body = payload + c.ed_sign(signer_seed, payload)
    return lid + c.gcm_seal(hk, hn, head, lid) + ciphertext + c.gcm_seal(bk, bn, body, lid)


def open_reply(box, lid_secret, ward_signing_pk):
    """Returns (reading, agreement). reading is ('object', value, raw, seen),
    ('silence',) or ('word', w). Anything that fails reads as silence."""
    silence = (("silence",), None)
    if len(box) > SIZE or len(box) < 32 + 16 + 64:
        return silence
    lid = c.x25519_public(lid_secret)
    rpk = box[:32]
    agr = c.agree(lid_secret, rpk)
    if agr is None:
        return silence
    k, n = c.key_nonce(agr, "quo-seal")
    body = c.gcm_open(k, n, box[32:], rpk)
    if body is None or len(body) <= 64:
        return silence
    text, sig = body[:-64], body[-64:]
    if not c.ed_verify(ward_signing_pk, lid + text, sig):
        return silence
    return read_reply_text(text), agr


def read_reply_text(text):
    try:
        v, s = parse(text)
    except Invalid:
        return ("silence",)
    if not isinstance(v, JObj):
        return ("silence",)
    keys = set(v)
    if keys == {"object", "seen"}:
        seen = v["seen"]
        if seen is not None and not isinstance(seen, str):
            return ("silence",)
        a, b = v.spans["object"]
        return ("object", v["object"], s[a:b].encode("utf-8"), seen)
    if keys == {"silence"} and v["silence"] is True:
        return ("silence",)
    if keys == {"quo"} and v["quo"] in WORDS:
        return ("word", v["quo"])
    return ("silence",)


# ---- the payload ----

HEX = set("0123456789abcdef")


def is_pk_hex(v):
    return isinstance(v, str) and len(v) == 64 and set(v) <= HEX and v != "0" * 64


def is_number(v):
    return isinstance(v, Num) and v.integer is not None and 1 <= v.integer <= MAX_NUMBER


class Payload:
    __slots__ = ("to", "by", "next", "seq", "method", "has_method", "args_raw")


def well_formed(obj, text, head):
    """Case 3. Returns a Payload or None. `obj` is a parsed JObj."""
    for f in ("to", "by", "next", "seq"):
        if f not in obj:
            return None
    to = obj["to"]
    if head == ZERO32:
        if to is not None:
            return None
    elif not (is_pk_hex(to) and to == head.hex()):
        return None
    if not is_pk_hex(obj["by"]):
        return None
    nx = obj["next"]
    if nx is not None and not is_pk_hex(nx):
        return None
    if not is_number(obj["seq"]):
        return None
    p = Payload()
    p.has_method = "method" in obj
    p.method = obj.get("method")
    if p.has_method and not isinstance(p.method, str):
        return None
    if "args" in obj:
        args = obj["args"]
        if not (isinstance(args, Container) and args.kind == "{"):
            return None
        a, b = obj.spans["args"]
        p.args_raw = text[a:b].encode("utf-8")
    else:
        p.args_raw = b"{}"
    p.to = to
    p.by = bytes.fromhex(obj["by"])
    p.next = None if nx is None else bytes.fromhex(nx)
    p.seq = obj["seq"].integer
    return p


def object_text(obj_raw, seen):
    s = b"null" if seen is None else json_string(seen).encode("utf-8")
    return b'{"object":' + obj_raw + b',"seen":' + s + b"}"


def word_text(w):
    return b'{"quo":"' + w.encode("ascii") + b'"}'


def payload_text(to, by, nxt, seq, method=None, args=None):
    """A payload the kit writes. `args` is raw JSON text or None."""
    parts = [
        '"to":' + ("null" if to is None else '"%s"' % to.hex()),
        '"by":"%s"' % by.hex(),
        '"next":' + ("null" if nxt is None else '"%s"' % nxt.hex()),
        '"seq":%d' % seq,
    ]
    if method is not None:
        parts.append('"method":' + json_string(method))
    out = "{" + ",".join(parts)
    if args is not None:
        out += ',"args":' + args
    return (out + "}").encode("utf-8")
