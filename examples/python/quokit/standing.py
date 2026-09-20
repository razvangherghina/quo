"""The standing's side of a relation: knock, ask, recover, and move on an object."""

from . import crypto as c
from .box import ZERO32, ZERO_EDGE, follow, knock_edge, open_reply, payload_text, seal_ask

FRESH, KNOCKED, BOUND = "fresh", "knocked", "bound"


class Standing:
    """One relation, from the end that asks. `args` is JSON text or None."""

    def __init__(self, invitation, source):
        self.source = source
        self.ward_signing = bytes.fromhex(invitation["ward"][:64])
        self.padlock = bytes.fromhex(invitation["ward"][64:])
        self.heir_pk = bytes.fromhex(invitation["heir"])
        self.heir_secret = bytes.fromhex(invitation["secret"])
        self.lock = bytes.fromhex(invitation["lock"])
        self.phase = FRESH
        self.own = None          # the key the knock announced
        self.knock_edge = None
        self.knock_box = None
        self.knock_pending = None
        self.resend_next = False
        self.signer = None
        self.edge = None
        self.seq = 0
        self.moved = 0           # the highest number this standing moved on
        self.pending = None      # (lid secret, key announced, edge sent under, number)

    def next_box(self, method=None, args=None):
        """The box of the next ask on this relation."""
        if self.phase == FRESH:
            return self.knock(method, args)
        if self.phase == KNOCKED:
            # No object came back to the knock. Alternate: ask under the
            # announced key and the knock's edge key, then send the knock again.
            self.resend_next = not self.resend_next
            if not self.resend_next:
                self.pending = self.knock_pending
                return self.knock_box
            return self.ask(method, args, self.own, self.knock_edge)
        return self.ask(method, args, self.signer, self.edge)

    def knock(self, method=None, args=None, announce=True):
        self.own = self.source.draw(32) if announce else None
        nxt = c.ed_public(self.own) if announce else None
        shared, ct = c.mlkem_encaps(self.lock)
        edge = knock_edge(shared)
        self.seq = 1
        lid_secret = self.source.draw(32)
        payload = payload_text(self.heir_pk, self.heir_pk, nxt, 1, method, args)
        box = seal_ask(self.padlock, self.heir_pk, payload, self.heir_secret, edge, lid_secret, ct)
        self.knock_edge, self.knock_box = edge, box
        self.pending = self.knock_pending = (lid_secret, self.own, edge, 1)
        if announce:
            self.phase = KNOCKED
        return box

    def ask(self, method, args, signer, edge, announce=True):
        # A number is spent by sending it, whatever comes back.
        self.seq += 1
        new = self.source.draw(32) if announce else None
        nxt = c.ed_public(new) if announce else None
        lid_secret = self.source.draw(32)
        payload = payload_text(self.heir_pk, c.ed_public(signer), nxt, self.seq, method, args)
        box = seal_ask(self.padlock, self.heir_pk, payload, signer, edge, lid_secret)
        self.pending = (lid_secret, new or signer, edge, self.seq)
        return box

    def take(self, reply):
        """Read the reply to the last box, or None for nothing. Moves only on an object.
        Returns ('object', value, raw, seen), ('silence',), ('word', w) or ('nothing',)."""
        pending, self.pending = self.pending, None
        if reply is None or pending is None:
            return ("nothing",)
        lid_secret, key, edge, seq = pending
        reading, agr = open_reply(reply, lid_secret, self.ward_signing)
        if reading[0] == "object" and seq > self.moved:
            self.moved = seq
            self.signer = key
            self.edge = follow(edge, agr)
            self.phase = BOUND
        return reading


def zero_ask(padlock, signer, source, method=None, args=None, seq=1):
    lid_secret = source.draw(32)
    payload = payload_text(None, c.ed_public(signer), None, seq, method, args)
    return seal_ask(padlock, ZERO32, payload, signer, ZERO_EDGE, lid_secret), lid_secret
