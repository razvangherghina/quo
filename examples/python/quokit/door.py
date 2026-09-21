"""A ward and its door: the thirteen cases in order, the move, the count."""

from . import crypto as c
from .box import (CT_LEN, SILENCE, SIZE, ZERO32, ZERO_EDGE, WardKey, follow,
                  knock_edge, object_text, well_formed, word_text)
from .values import Invalid, JObj, parse


# ---- what stands behind a door: a reach answers (payload) with reply text or None ----

# The describe every reach but silent gives the empty ask: no entry, no lang.
DESCRIBE_NONE = b'{"asks":[]}'


def reach_echo(p, marked=False):
    if not p.has_method:
        return object_text(DESCRIBE_NONE, None)
    try:
        parse(p.args_raw)  # echo does not read args whose own keys repeat
    except Invalid:
        return None
    return object_text(p.args_raw, "1" if marked else None)


REACHES = {
    "echo": lambda p: reach_echo(p),
    "marked": lambda p: reach_echo(p, True),
    "null": lambda p: object_text(b"null" if p.has_method else DESCRIBE_NONE, None),
    "silent": lambda p: None,
}


class Heir:
    def __init__(self, pk, reach):
        self.pk, self.reach = pk, reach
        self.fresh = True
        self.held = self.vouched = None
        self.open = self.offered = None
        self.highest = 0


class Kept:
    def __init__(self, heir):
        self.held, self.vouched = heir.held, heir.vouched
        self.open, self.offered = heir.open, heir.offered


class Ward:
    def __init__(self, seed, source, zero_reach=None, log=None):
        self.key = WardKey(seed)
        self.source = source
        self.zero_reach = zero_reach
        self.lock_seed = None
        self.lock_ek = None
        self.heirs = {}
        self.kept = {}
        self.log = log or (lambda msg: None)

    @property
    def pk_hex(self):
        return self.key.pk_hex

    def invite(self, reach):
        """Hold a new heir. Returns the invitation as a dict of hex."""
        if self.lock_seed is None:
            self.lock_seed = self.source.draw(64)
            self.lock_ek = c.mlkem_public(self.lock_seed)
        secret = self.source.draw(32)
        pk = c.ed_public(secret)
        self.heirs[pk] = Heir(pk, reach)
        return {"ward": self.pk_hex, "heir": pk.hex(), "secret": secret.hex(),
                "lock": self.lock_ek.hex()}

    def release(self, pk):
        heir = self.heirs.pop(pk, None)
        if heir is not None and not heir.fresh:
            self.kept[pk] = Kept(heir)

    # ---- replies ----

    def _seal_reply(self, text, lid):
        eph = self.source.draw(32)
        rpk = c.x25519_public(eph)
        agr = c.agree(eph, lid)
        k, n = c.key_nonce(agr, "quo-seal")
        body = text + c.ed_sign(self.key.sign_seed, lid + text)
        return rpk + c.gcm_seal(k, n, body, rpk), agr

    def _stranger(self, box, case, opened):
        self.log("case %d" % case)
        if opened or (len(box) >= 32 and c.takes_seal(box[:32])):
            lid = box[:32]
        else:
            lid = self.source.draw(32)
            if not c.takes_seal(lid):
                lid = c.x25519_public(self.source.draw(32))
        return self._seal_reply(SILENCE, lid)[0]

    # ---- the door ----

    def arrive(self, box):
        box = bytes(box)
        if len(box) > SIZE or len(box) < 80:
            return self._stranger(box, 1, False)
        lid = box[:32]
        agr = c.agree(self.key.seal_scalar, lid)
        if agr is None:
            return self._stranger(box, 1, False)
        hk, hn = c.key_nonce(agr, "quo-seal")
        head = c.gcm_open(hk, hn, box[32:80], lid)
        if head is None:
            return self._stranger(box, 1, False)

        heir = kept = None
        zero = head == ZERO32
        if zero:
            tries = [(ZERO_EDGE, box[80:])]
        elif head in self.heirs:
            heir = self.heirs[head]
            if heir.fresh:
                if len(box) < 80 + CT_LEN:
                    return self._stranger(box, 1, True)
                shared = c.mlkem_decaps(self.lock_seed, box[80:80 + CT_LEN])
                tries = [(knock_edge(shared), box[80 + CT_LEN:])]
            else:
                tries = [(heir.open, box[80:]), (heir.offered, box[80:])]
        elif head in self.kept:
            kept = self.kept[head]
            tries = [(kept.open, box[80:]), (kept.offered, box[80:])]
        else:
            tries = [(ZERO_EDGE, box[80:])]

        edge = body = None
        for e, sealed in tries:
            bk, bn = c.key_nonce(agr + e, "quo-edge-seal")
            body = c.gcm_open(bk, bn, sealed, lid)
            if body is not None:
                edge = e
                break
        if body is None or len(body) <= 64:
            return self._stranger(box, 1, True)
        payload, sig = body[:-64], body[-64:]

        # 2
        try:
            obj, text = parse(payload)
        except Invalid:
            return self._stranger(box, 2, True)
        if not isinstance(obj, JObj):
            return self._stranger(box, 2, True)
        # 3
        p = well_formed(obj, text, head)
        if p is None:
            return self._stranger(box, 3, True)

        if zero:
            # 4, 5
            if self.zero_reach is None:
                return self._stranger(box, 4, True)
            if not c.ed_verify(p.by, payload, sig):
                return self._stranger(box, 5, True)
            return self._answer(self.zero_reach(p), lid)[0]

        # 6
        if heir is None and kept is None:
            return self._stranger(box, 6, True)
        # 7
        if heir is not None:
            admitted = (p.by == heir.pk) if heir.fresh else p.by in (heir.held, heir.vouched)
            if not admitted:
                return self._stranger(box, 7, True)
        elif p.by not in (kept.held, kept.vouched):
            return self._stranger(box, 7, True)
        # 8
        if not c.ed_verify(p.by, payload, sig):
            return self._stranger(box, 8, True)
        # 9
        if kept is not None:
            return self._seal_reply(word_text("removed"), lid)[0]
        announced = p.next if p.next not in (None, heir.pk, p.by) else None
        # 10
        if heir.fresh and announced is None:
            return self._seal_reply(word_text("unannounced"), lid)[0]
        # 11
        if not heir.fresh and p.seq <= heir.highest:
            return self._seal_reply(word_text("repeated"), lid)[0]
        # 12, 13
        reply, ragr = self._answer(heir.reach(p), lid)
        self._move(heir, p, announced, edge, ragr)
        return reply

    def _answer(self, text, lid):
        return self._seal_reply(SILENCE if text is None else text, lid)

    def _move(self, heir, p, announced, edge, ragr):
        if heir.fresh:
            heir.fresh = False
            heir.held, heir.vouched = announced, None
        elif p.by == heir.held:
            if announced is not None:
                heir.vouched = announced
        else:
            heir.held, heir.vouched = heir.vouched, announced
        heir.open, heir.offered = edge, follow(edge, ragr)
        heir.highest = max(heir.highest, p.seq)
