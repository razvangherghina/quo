import hashlib
import http.client
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from quokit import crypto as c  # noqa: E402
from quokit.address import address  # noqa: E402
from quokit.web import post  # noqa: E402
from quokit.box import (INVITATION, SILENCE, ZERO_EDGE, WardKey, invitation, knock_edge,  # noqa: E402
                        open_reply, payload_text, read_invitation, read_reply_text, seal_ask)
from quokit.carrier import ASK, NOTHING, REPLY, dial, frame  # noqa: E402
from quokit.door import REACHES, Ward  # noqa: E402
from quokit.entropy import OsSource  # noqa: E402
from quokit.standing import BOUND, KNOCKED, Standing  # noqa: E402
from quokit.values import Invalid, parse  # noqa: E402

SMALL_ORDER = [
    bytes(32),
    (1).to_bytes(32, "little"),
    bytes.fromhex("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800"),
    bytes.fromhex("5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157"),
    bytes.fromhex("ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"),
    bytes.fromhex("edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"),
]


def written(to, by, nxt, seq=1, method=None, args=None):
    """A payload the kit's standing never writes: on the zero head, or announcing nothing."""
    fields = {"to": to and to.hex(), "by": by.hex(), "next": nxt and nxt.hex(), "seq": seq}
    if method is not None:
        fields["method"] = method
    if args is not None:
        fields["args"] = json.loads(args)
    return json.dumps(fields, separators=(",", ":")).encode()


def unannounced(st, signer, edge):
    """An ask on the relation announcing nothing: its box and its lid's secret."""
    st.seq += 1
    lid_secret = os.urandom(32)
    payload = written(st.heir_pk, c.ed_public(signer), None, st.seq, "echo", "{}")
    return seal_ask(st.padlock, st.heir_pk, payload, signer, edge, lid_secret), lid_secret


def resigned(key, text):
    """An invitation of `text`, signed by the WardKey `key`."""
    return {"text": text, "sig": c.ed_sign(key.sign_seed, INVITATION + text.encode("utf-8")).hex()}


def ward_reply(ward, text, lid_secret, edge, signed=None):
    """A reply the ward wrote, sealed to the lid under `edge`, signed over `signed` then the text."""
    eph = os.urandom(32)
    rpk = c.x25519_public(eph)
    lid = c.x25519_public(lid_secret)
    k, n = c.key_nonce(c.agree(eph, lid) + edge, "quo-edge-seal")
    body = text + c.ed_sign(ward.key.sign_seed, (lid if signed is None else signed) + text)
    return rpk + c.gcm_seal(k, n, body, rpk)


def reply_text(box, lid_secret, edge):
    """The reply text of a box opened under `edge` alone, or None where it does not open."""
    k, n = c.key_nonce(c.agree(lid_secret, box[:32]) + edge, "quo-edge-seal")
    body = c.gcm_open(k, n, box[32:], box[:32])
    return None if body is None else body[:-64]


class Keys(unittest.TestCase):
    def test_hkdf_rfc5869_case3(self):
        ikm = bytes.fromhex("0b" * 22)
        self.assertEqual(c.hkdf(ikm, "", 42).hex(),
                         "8da4e775a563c18f715f802a063c5a31b8a11f5c5ee1879ec3454e5f3c738d2d9d201395faa4b61a96c8")

    def test_ward_key(self):
        a = WardKey("alice")
        self.assertEqual(len(a.pk_hex), 128)
        self.assertEqual(WardKey(b"alice").pk_hex, a.pk_hex)
        s = c.sha256(b"alice")
        self.assertEqual(WardKey(s).pk_hex, a.pk_hex)
        self.assertEqual(a.sign_seed, c.hkdf(s, "quo-ward-sign", 32))
        self.assertEqual(a.padlock, c.x25519_public(c.hkdf(s, "quo-ward-seal", 32)))

    def test_small_order_takes_no_seal(self):
        for p in SMALL_ORDER:
            self.assertFalse(c.takes_seal(p), p.hex())
        self.assertTrue(c.takes_seal(c.x25519_public(os.urandom(32))))

    def test_mlkem(self):
        dz = os.urandom(64)
        ek = c.mlkem_public(dz)
        self.assertEqual(len(ek), 1184)
        k, ct = c.mlkem_encaps(ek)
        self.assertEqual(len(ct), 1088)
        self.assertEqual(c.mlkem_decaps(dz, ct), k)
        self.assertTrue(c.mlkem_valid(ek))
        self.assertFalse(c.mlkem_valid(b"\xff" * 1184))


def point_bytes(k):
    return c.encode(c._mul(k, c.BASE))


class Signature(unittest.TestCase):
    def setUp(self):
        self.seed = os.urandom(32)
        self.pk = c.ed_public(self.seed)
        self.sig = c.ed_sign(self.seed, b"hello")

    def test_ok(self):
        self.assertTrue(c.ed_verify(self.pk, b"hello", self.sig))
        self.assertFalse(c.ed_verify(self.pk, b"hellp", self.sig))

    def test_rfc8032_vector1(self):
        pk = bytes.fromhex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a")
        sig = bytes.fromhex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")
        self.assertTrue(c.ed_verify(pk, b"", sig))

    def test_length_and_s(self):
        self.assertFalse(c.ed_verify(self.pk, b"hello", self.sig[:63]))
        s = int.from_bytes(self.sig[32:], "little") + c._L
        self.assertFalse(c.ed_verify(self.pk, b"hello", self.sig[:32] + s.to_bytes(32, "little")))

    def test_small_order_key_refused(self):
        ident = (1).to_bytes(32, "little")
        s = 5
        sig = point_bytes(s) + s.to_bytes(32, "little")
        self.assertFalse(c.ed_verify(ident, b"m", sig))
        signed = bytearray(ident)
        signed[31] |= 0x80
        self.assertFalse(c.ed_verify(bytes(signed), b"m", sig))

    def test_small_order_R_verifies(self):
        a = 7
        Ab = point_bytes(a)
        Rb = (1).to_bytes(32, "little")
        k = int.from_bytes(hashlib.sha512(Rb + Ab + b"m").digest(), "little") % c._L
        self.assertTrue(c.ed_verify(Ab, b"m", Rb + (k * a % c._L).to_bytes(32, "little")))

    def test_noncanonical_R_refused(self):
        a = 7
        Ab = point_bytes(a)
        # The identity spelled with the sign bit set, then with y = p + 1.
        for Rb in (bytes([1] + [0] * 30 + [0x80]), (c._P + 1).to_bytes(32, "little")):
            k = int.from_bytes(hashlib.sha512(Rb + Ab + b"m").digest(), "little") % c._L
            self.assertFalse(c.ed_verify(Ab, b"m", Rb + (k * a % c._L).to_bytes(32, "little")))


class Values(unittest.TestCase):
    def ok(self, t):
        return parse(t.encode("utf-8"))[0]

    def bad(self, t):
        with self.assertRaises(Invalid, msg=t):
            parse(t.encode("utf-8") if isinstance(t, str) else t)

    def test_numbers(self):
        for t in ["1", "1.0", "1e0", "1e23", "0", "-0", "-0.0", "1e400", "1e-400",
                  "9007199254740993", "-9007199254740993", "100000000000000000000000"]:
            self.assertEqual(self.ok(t).text, t)
        for t in ["01", "1.", ".5", "+1", "1e", "-"]:
            self.bad(t)
        self.assertEqual(self.ok("12").integer, 12)
        self.assertIsNone(self.ok("1e0").integer)
        self.assertIsNone(self.ok("1.0").integer)

    def test_strings_and_keys(self):
        self.assertEqual(self.ok('"\\ud83d\\ude00"'), "\U0001F600")
        self.ok('"\\uffff"')
        self.ok('"\\ud83d"')
        self.ok('"\\ude00x"')
        self.bad('{"a":1,"\\u0061":2}')
        self.bad('"a\tb"')
        self.bad(b'"\xff"')
        self.bad(b'"\xed\xa0\x80"')
        self.bad('{"a":1,"a":2}')
        self.bad("﻿{}")

    def test_only_own_keys_are_read(self):
        o, text = parse(b'{"a":{"k":1,"k":2,"s":"\\ud800"}, "b" : [ 1 ] , "c":-0}')
        self.assertEqual(text[slice(*o.spans["b"])], "[ 1 ]")
        self.assertEqual(o["a"].kind, "{")
        self.assertEqual(o["c"].text, "-0")
        deep = "[" * 100000 + "]" * 100000
        self.assertEqual(parse(('{"d":' + deep + "}").encode())[0].spans["d"], (5, 5 + len(deep)))
        self.bad('{"d":' + "[" * 10 + "]" * 9 + "}")
        self.bad('{"d":[1,]}')
        self.bad('{"d":{"k"}}')

    def test_whitespace_and_trailing(self):
        self.ok(" \r\n\t{} ")
        self.bad("{} x")
        self.bad("")
        self.bad("tru")

    def test_reply_shapes(self):
        self.assertEqual(read_reply_text(SILENCE), ("silence",))
        self.assertEqual(read_reply_text(b' { "silence" : true }\n'), ("silence",))
        self.assertEqual(read_reply_text(b'{"quo":"removed"}'), ("word", "removed"))
        self.assertEqual(read_reply_text(b'{"quo":"other"}'), ("silence",))
        self.assertEqual(read_reply_text(b'{"seen":null,"object":[1]}')[0], "object")
        self.assertEqual(read_reply_text(b'{"seen":1,"object":[1]}'), ("silence",))
        self.assertEqual(read_reply_text(b'{"seen":null,"object":1,"x":1}'), ("silence",))
        self.assertEqual(read_reply_text(b'{"seen":null}'), ("silence",))
        deep = b'{"object":' + b"[" * 5000 + b"]" * 5000 + b',"seen":null}'
        self.assertEqual(read_reply_text(deep)[0], "object")
        odd = b'{"object":{"k":1e400,"k":"\\udc00"},"seen":null}'
        self.assertEqual(read_reply_text(odd)[2], b'{"k":1e400,"k":"\\udc00"}')

    def test_reply_at(self):
        self.assertIsNone(read_reply_text(b'{"seen":null,"object":1}')[4])
        r = read_reply_text(b'{"at":[5,"no scheme","tcp://127.0.0.1",{"a":[1]},"mailto:x@example.org",null,'
                            b'"TCP://127.0.0.1:9","ws://127.0.0.1:9/quo", "\\u0068ttp://h/q"],"object":[],"seen":null}')
        self.assertEqual((r[0], r[2], r[4]), ("object", b"[]", ["TCP://127.0.0.1:9", "http://h/q"]))
        self.assertEqual(read_reply_text(b'{"object":1,"seen":null,"at":[]}')[4], [])
        # an at that is no array reads as absent, and the reply is still an object
        for at in (b'"tcp://127.0.0.1:9"', b"null", b"{}", b"7"):
            r = read_reply_text(b'{"object":2,"seen":null,"at":' + at + b"}")
            self.assertEqual((r[0], r[4]), ("object", None), at)
        for text in (b'{"object":1,"seen":null,"at":[],"at":[]}', b'{"silence":true,"at":[]}',
                     b'{"quo":"repeated","at":[]}'):
            self.assertEqual(read_reply_text(text), ("silence",), text)


class Invitations(unittest.TestCase):
    def setUp(self):
        self.ward = Ward("inviter", OsSource())
        self.heir, self.inv = self.ward.invite(REACHES["echo"])
        self.fields = read_invitation(self.inv)

    def test_written_and_read(self):
        self.assertEqual(self.fields["ward"], self.ward.pk_hex)
        self.assertEqual(self.fields["heir"], self.heir.hex())
        self.assertNotIn("at", self.fields)
        self.assertEqual(c.ed_public(bytes.fromhex(self.fields["secret"])), self.heir)
        # `at` is written as given, a lone surrogate as its escape
        at = ["tcp://127.0.0.1:1", "x\ud800"]
        self.assertEqual(read_invitation(self.ward.invite(REACHES["echo"], at)[1])["at"], at)
        self.assertEqual(read_invitation(self.ward.invite(REACHES["echo"], [])[1])["at"], [])

    def test_the_signature(self):
        key, text = self.ward.key, self.inv["text"]
        for inv in (dict(self.inv, text=" " + text),
                    resigned(WardKey("another"), text),
                    {"text": text, "sig": c.ed_sign(key.sign_seed, text.encode()).hex()},
                    dict(self.inv, sig=self.inv["sig"].upper()),
                    {"text": text},
                    dict(self.inv, at=[]),
                    self.fields,
                    dict(self.inv, text=self.fields)):
            self.assertIsNone(read_invitation(inv))

    def test_the_text(self):
        key, text, body = self.ward.key, self.inv["text"], self.inv["text"][1:]
        for bad in (text + ",", "[" + text + "]",
                    '{"ward":"%s",%s' % (self.fields["ward"], body),
                    '{"\\u0077ard":"%s",%s' % (self.fields["ward"], body)):
            self.assertIsNone(read_invitation(resigned(key, bad)))
        # a text that denotes a lone surrogate has no UTF-8 bytes
        self.assertIsNone(read_invitation(dict(self.inv, text=text[:-1] + ',"x":"\ud800"}')))

    def test_beside_the_five_and_padding(self):
        key, body = self.ward.key, self.inv["text"][1:]
        for text in ('{"says":"John",' + body, " \n" + self.inv["text"] + "\t ",
                     '{"at":[5,"tcp://127.0.0.1:2",{"a":1}],' + body, '{"at":"nowhere",' + body):
            fields = read_invitation(resigned(key, text))
            self.assertEqual({k: fields[k] for k in self.fields}, self.fields)
        self.assertEqual(read_invitation(resigned(key, '{"at":[5,"tcp://127.0.0.1:2"],' + body))["at"][1],
                         "tcp://127.0.0.1:2")
        self.assertNotIn("at", read_invitation(resigned(key, '{"at":"nowhere",' + body)))


class Door(unittest.TestCase):
    def setUp(self):
        self.src = OsSource()
        self.ward = Ward("door", self.src)
        self.inv = read_invitation(self.ward.invite(REACHES["echo"])[1])
        self.st = Standing(self.inv, self.src)
        self.sign = self.ward.key.signing_pk

    def bound(self, args='{"v":1}'):
        r = self.st.take(self.ward.arrive(self.st.next_box("echo", args)))
        self.assertEqual(r[0], "object")
        return r

    def test_sizes(self):
        payload = written(None, os.urandom(32), None)
        box = seal_ask(self.ward.key.padlock, bytes(32), payload, os.urandom(32), ZERO_EDGE, os.urandom(32))
        self.assertEqual(len(box), len(payload) + 160)
        knock = self.st.next_box("echo", '{"v":1}')
        own = c.ed_public(self.st.own)
        self.assertEqual(len(knock), len(payload_text(self.st.heir_pk, self.st.heir_pk, own, 1, "echo", '{"v":1}')) + 1248)
        reply = self.ward.arrive(knock)
        self.assertEqual(len(reply), len(b'{"object":{"v":1},"seen":null}') + 112)
        self.assertEqual(len(self.ward.arrive(b"junk")), len(SILENCE) + 112)

    def test_relation(self):
        w, st = self.ward, self.st
        r = self.bound(' {"v" : [1, 2]} ')
        self.assertEqual((r[2], r[3]), (b'{"v" : [1, 2]}', None))
        heir = w.heirs[st.heir_pk]
        # the heir no longer signs
        self.assertEqual(st.take(w.arrive(st.ask("echo", "{}", st.heir_secret, st.edge))), ("silence",))
        # repeated
        st.seq = 0
        self.assertEqual(st.take(w.arrive(st.next_box("echo", "{}"))), ("word", "repeated"))
        # the knock again is a stranger's
        st.pending = st.knock_pending
        self.assertEqual(st.take(w.arrive(st.knock_box)), ("silence",))
        st.seq = 5
        self.bound()
        # the empty ask
        r = st.take(w.arrive(st.next_box()))
        self.assertEqual((r[0], r[2], r[3]), ("object", b'{"asks":[]}', None))
        # an ask announcing nothing keeps the held key; asking under the vouched one moves it
        held = st.signer
        box, lid_secret = unannounced(st, held, st.edge)
        self.assertEqual(open_reply(w.arrive(box), lid_secret, self.sign, st.edge)[0][0], "object")
        self.assertEqual(heir.held, c.ed_public(held))
        self.bound()
        self.assertEqual(heir.held, c.ed_public(held))
        self.assertEqual(heir.vouched, c.ed_public(st.signer))
        self.bound()
        self.assertNotEqual(heir.held, c.ed_public(held))
        # the old key is forgotten
        self.assertEqual(st.take(w.arrive(st.ask("echo", "{}", held, st.edge))), ("silence",))
        # a reply lost: the offered edge key still opens
        w.arrive(st.next_box("echo", "{}"))
        st.pending = None
        self.bound()
        # removal
        w.release(st.heir_pk)
        self.assertEqual(st.take(w.arrive(st.next_box("echo", "{}"))), ("word", "removed"))
        self.assertEqual(st.take(w.arrive(st.ask("echo", "{}", os.urandom(32), st.edge))), ("silence",))

    def test_unannounced_leaves_fresh(self):
        w, st = self.ward, self.st
        shared, ct = c.mlkem_encaps(st.lock)
        edge, lid_secret = knock_edge(shared), os.urandom(32)
        box = seal_ask(st.padlock, st.heir_pk, written(st.heir_pk, st.heir_pk, None), st.heir_secret,
                       edge, lid_secret, ct)
        self.assertEqual(open_reply(w.arrive(box), lid_secret, self.sign, edge)[0], ("word", "unannounced"))
        self.assertTrue(w.heirs[st.heir_pk].fresh)
        self.bound()

    def test_knock_lost_then_recovered(self):
        w, st = self.ward, self.st
        w.arrive(st.next_box("echo", "{}"))
        st.take(None)
        self.assertEqual(st.phase, KNOCKED)
        # the next box asks under the announced key and the knock's edge key
        r = st.take(w.arrive(st.next_box("echo", '{"a":2}')))
        self.assertEqual((r[0], r[2]), ("object", b'{"a":2}'))
        self.assertEqual(st.phase, BOUND)
        self.bound()

    def test_knock_never_arrived_then_resent(self):
        w, st = self.ward, self.st
        knock = st.next_box("echo", "{}")
        st.take(None)
        # the recovery ask does not open at a door that did not bind
        self.assertEqual(st.take(w.arrive(st.next_box("echo", "{}"))), ("silence",))
        self.assertEqual(st.next_box("echo", "{}"), knock)
        self.assertEqual(st.take(w.arrive(knock))[0], "object")
        self.bound()

    def test_released_fresh_is_stranger(self):
        w, st = self.ward, self.st
        w.release(st.heir_pk)
        self.assertEqual(st.take(w.arrive(st.next_box("echo", "{}"))), ("silence",))

    def test_wrong_secret_or_lock(self):
        w = self.ward
        st = Standing(dict(self.inv, secret=os.urandom(32).hex()), self.src)
        self.assertEqual(st.take(w.arrive(st.next_box("echo", "{}"))), ("silence",))
        other = Ward("other", self.src)
        st = Standing(dict(self.inv, lock=read_invitation(other.invite(REACHES["echo"])[1])["lock"]), self.src)
        self.assertEqual(st.take(w.arrive(st.next_box("echo", "{}"))), ("silence",))
        self.assertTrue(w.heirs[self.st.heir_pk].fresh)

    def test_payload_rules_are_strangers(self):
        w, st = self.ward, self.st
        self.assertEqual(st.take(w.arrive(st.knock("echo", "[1]"))), ("silence",))
        self.assertTrue(w.heirs[st.heir_pk].fresh)

    def test_echo_carries_numbers_and_depth(self):
        w, st = self.ward, self.st
        args = '{"a":-0,"b":1e400,"c":9007199254740993,"d":' + "[" * 2000 + "]" * 2000 + "}"
        self.assertEqual(st.take(w.arrive(st.next_box("echo", args)))[2], args.encode())

    def test_echo_declines_repeated_keys(self):
        w, st = self.ward, self.st
        self.assertEqual(st.take(w.arrive(st.next_box("echo", '{"k":1,"\\u006b":2}'))), ("silence",))
        # silence is a choice: the heir is spent
        self.assertFalse(w.heirs[st.heir_pk].fresh)
        r = st.take(w.arrive(st.next_box("echo", '{"k":{"k":1,"k":2}}')))
        self.assertEqual(r[2], b'{"k":{"k":1,"k":2}}')

    def test_standing_moves_only_above(self):
        st = self.st
        self.bound()
        early_reply = self.ward.arrive(st.next_box("echo", "{}"))
        early_pending = st.pending
        self.bound()
        signer, edge = st.signer, st.edge
        st.pending = early_pending
        self.assertEqual(st.take(early_reply)[0], "object")
        self.assertEqual((st.signer, st.edge), (signer, edge))
        self.bound()

    def test_moved_at_is_kept_on_a_move(self):
        w = self.ward
        st = Standing(read_invitation(w.invite(REACHES["moved"])[1]), self.src)
        knock = st.next_box("echo", '{"m":1}')
        reply = w.arrive(knock)
        r = st.take(reply)
        self.assertEqual((r[2], r[4]), (b'{"m":1}', ["tcp://127.0.0.1:9"]))
        self.assertEqual(len(reply), len(b'{"object":{"m":1},"seen":null,"at":["tcp://127.0.0.1:9"]}') + 112)
        self.assertEqual(st.at, ["tcp://127.0.0.1:9"])
        # an object that moves nothing leaves the addresses kept
        st.at = []
        early = w.arrive(st.next_box("echo", "{}"))
        early_pending = st.pending
        st.take(w.arrive(st.next_box("echo", "{}")))
        st.at = []
        st.pending = early_pending
        self.assertEqual(st.take(early)[4], ["tcp://127.0.0.1:9"])
        self.assertEqual(st.at, [])

    def test_zero_head(self):
        signer, ls = os.urandom(32), os.urandom(32)
        payload = written(None, c.ed_public(signer), None, 1, "echo", '{"z":1}')
        box = seal_ask(self.ward.key.padlock, bytes(32), payload, signer, ZERO_EDGE, ls)
        self.assertEqual(reply_text(self.ward.arrive(box), ls, ZERO_EDGE), SILENCE)
        w = Ward("door", self.src, zero_reach=REACHES["marked"])
        for _ in range(2):
            r = open_reply(w.arrive(box), ls, self.sign, ZERO_EDGE)[0]
            self.assertEqual((r[0], r[2], r[3]), ("object", b'{"z":1}', "1"))

    def test_object_and_word_are_sealed_under_the_ask_edge_key(self):
        w, st = self.ward, self.st
        knock = st.next_box("echo", '{"a":1}')
        lid_secret, _, edge, _ = st.pending
        reply = w.arrive(knock)
        self.assertEqual(reply_text(reply, lid_secret, edge), b'{"object":{"a":1},"seen":null}')
        self.assertIsNone(reply_text(reply, lid_secret, ZERO_EDGE))
        st.take(reply)
        st.seq = 0
        box = st.next_box("echo", "{}")
        lid_secret, _, edge, _ = st.pending
        reply = w.arrive(box)
        self.assertEqual(reply_text(reply, lid_secret, edge), b'{"quo":"repeated"}')
        self.assertIsNone(reply_text(reply, lid_secret, ZERO_EDGE))

    def test_a_word_of_removal_is_sealed_under_the_kept_key(self):
        w, st = self.ward, self.st
        self.bound()
        w.release(st.heir_pk)
        box = st.next_box("echo", "{}")
        lid_secret, _, edge, _ = st.pending
        self.assertEqual(reply_text(w.arrive(box), lid_secret, edge), b'{"quo":"removed"}')

    def test_every_silence_is_sealed_under_the_zero_edge_key(self):
        w, st = self.ward, self.st
        self.bound()
        # a stranger's: a key the door does not admit
        box = st.ask("echo", "{}", os.urandom(32), st.edge)
        lid_secret = st.pending[0]
        reply = w.arrive(box)
        self.assertEqual(reply_text(reply, lid_secret, ZERO_EDGE), SILENCE)
        self.assertIsNone(reply_text(reply, lid_secret, st.edge))
        # a chosen one: echo declines, and the keys still move
        heir = w.heirs[st.heir_pk]
        was = heir.offered
        box = st.next_box("echo", '{"k":1,"k":2}')
        lid_secret = st.pending[0]
        reply = w.arrive(box)
        self.assertEqual(reply_text(reply, lid_secret, ZERO_EDGE), SILENCE)
        self.assertEqual(heir.open, st.edge)
        self.assertNotEqual(heir.offered, was)
        self.assertEqual(st.take(reply), ("silence",))
        self.bound()

    def test_object_or_word_under_the_zero_edge_key_reads_as_silence(self):
        w, st = self.ward, self.st
        self.bound()
        for text in (b'{"object":1,"seen":null}', b'{"quo":"repeated"}'):
            st.next_box("echo", "{}")
            lid_secret, _, edge, _ = st.pending
            self.assertEqual(open_reply(ward_reply(w, text, lid_secret, edge), lid_secret, self.sign, edge)[0][0],
                             read_reply_text(text)[0])
            forged = ward_reply(w, text, lid_secret, ZERO_EDGE)
            signer, at_edge = st.signer, st.edge
            self.assertEqual(st.take(forged), ("silence",))
            self.assertEqual((st.signer, st.edge), (signer, at_edge))

    def test_reply_signature_covers_the_lid(self):
        w, st = self.ward, self.st
        self.bound()
        st.next_box("echo", '{"a":1}')
        lid_secret, _, edge, _ = st.pending
        text = b'{"object":1,"seen":null}'
        self.assertEqual(open_reply(ward_reply(w, text, lid_secret, edge), lid_secret, self.sign, edge)[0][0],
                         "object")
        other = c.x25519_public(os.urandom(32))
        for signed in (other, b""):
            reply = ward_reply(w, text, lid_secret, edge, signed=signed)
            self.assertEqual(open_reply(reply, lid_secret, self.sign, edge)[0], ("silence",))

    def test_unopened_lids(self):
        for junk in [b"", b"x" * 10, SMALL_ORDER[1] + b"y" * 100]:
            self.assertEqual(len(self.ward.arrive(junk)), 128)
        lid_secret = os.urandom(32)
        box = c.x25519_public(lid_secret) + os.urandom(100)
        self.assertEqual(reply_text(self.ward.arrive(box), lid_secret, ZERO_EDGE), SILENCE)
        big = c.x25519_public(lid_secret) + bytes(1048576)
        self.assertEqual(reply_text(self.ward.arrive(big), lid_secret, ZERO_EDGE), SILENCE)


class Addresses(unittest.TestCase):
    def test_tcp(self):
        a = address("tcp://[::1]:9")
        self.assertEqual((a.scheme, a.host, a.port), ("tcp", "::1", 9))
        self.assertEqual(address("TCP://example.org:65535").port, 65535)
        for s in ["tcp://h", "tcp://h:0", "tcp://h:65536", "tcp://h:1/", "tcp://h:1?q", "tcp://h:1#f",
                  "tcp://u@h:1", "tcp://:1", "h:1", "tcp://h 1:1"]:
            self.assertIsNone(address(s), s)

    def test_web(self):
        a = address("http://example.org/quo?w=1")
        self.assertEqual((a.scheme, a.host, a.port, a.target), ("http", "example.org", 80, "/quo?w=1"))
        self.assertEqual(address("https://h").port, 443)
        self.assertEqual(address("https://h").target, "/")
        self.assertEqual(address("http://[fe80::1]:8/").host, "fe80::1")
        for s in ["http://u@h/", "http://h/#f", "http:/h", "ws://h/", "wss://h/", "zz://h", "",
                  None, 7, "http://h:99999/"]:
            self.assertIsNone(address(s), s)


def stand(lines):
    p = subprocess.run([os.path.join(HERE, "stand")], input="".join(line + "\n" for line in lines).encode(),
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=120)
    return p.returncode, [json.loads(line) for line in p.stdout.decode().splitlines()]


def by_id(out):
    return {o["id"]: o for o in out}


class Harness(unittest.TestCase):
    def test_door_and_asker_through_the_channel(self):
        pk = WardKey("alice").pk_hex
        code, out = stand([
            json.dumps({"id": "w", "op": "ward", "seed": "alice", "reach": "null"}),
            json.dumps({"id": "i", "op": "invite", "ward": pk, "heir": "h", "reach": "marked"}),
            json.dumps({"id": "i2", "op": "invite", "ward": pk, "heir": "h"}),
        ])
        self.assertEqual(code, 0)
        o = by_id(out)
        self.assertEqual(o["w"], {"id": "w", "ward": pk})
        self.assertEqual(o["i2"], {"id": "i2", "error": "name held"})
        inv = o["i"]["invitation"]
        self.assertEqual(sorted(inv), ["sig", "text"])
        self.assertEqual(sorted(read_invitation(inv)), ["heir", "lock", "secret", "ward"])

        # One program asks, a door here answers, the program reads.
        door = Ward(c.sha256(b"bob"), OsSource())
        heir, dinv = door.invite(REACHES["marked"])
        code, out = stand([json.dumps({"id": "w", "op": "ward", "seed": "carol"}),
                           json.dumps({"id": "a", "op": "ask", "ward": WardKey("carol").pk_hex,
                                       "invitation": dinv, "method": "m", "args": {"k": [1, 1.5]}})])
        box = bytes.fromhex(by_id(out)["a"]["box"])
        reply = door.arrive(box)
        self.assertFalse(door.heirs[heir].fresh)
        carol = WardKey("carol").pk_hex
        code, out = stand([json.dumps({"id": "w", "op": "ward", "seed": "carol"}),
                           json.dumps({"id": "a", "op": "ask", "ward": carol, "invitation": dinv}),
                           json.dumps({"id": "r", "op": "read", "ward": carol, "invitation": dinv,
                                       "reply": reply.hex()})])
        # A fresh program knocked anew, so the old reply is sealed to another lid.
        self.assertEqual(by_id(out)["r"]["read"], {"silence": True})

    def test_errors(self):
        pk = WardKey("bob").pk_hex
        code, out = stand([
            "",
            "not json",
            "[1]",
            json.dumps({"op": "ward", "seed": "x"}),
            json.dumps({"id": "1", "op": "fly"}),
            json.dumps({"id": "2", "op": "arrive", "ward": pk, "box": "00"}),
            json.dumps({"id": "3", "op": "arrive", "ward": pk.upper(), "box": "00"}),
            json.dumps({"id": "4", "op": "ward", "seed": "bob", "reach": "nope"}),
            json.dumps({"id": "5", "op": "ward", "seed": "bob"}),
            json.dumps({"id": "6", "op": "ward", "seed": "bob"}),
            json.dumps({"id": "7", "op": "entropy", "seed": "1"}),
            json.dumps({"id": "8", "op": "invite", "ward": pk, "heir": "h", "reach": "zzz"}),
            json.dumps({"id": "9", "op": "arrive", "ward": pk, "box": "0"}),
            json.dumps({"id": 10, "op": "fly"}),
            json.dumps({"id": "11", "op": "route", "far": pk, "at": "nowhere"}),
        ])
        self.assertEqual(code, 0)
        self.assertEqual([o.get("error") for o in out], [
            "bad request", "bad request", "bad request", "no such op", "no such ward",
            "bad request", "not reached", None, "ward stood", "no such op", "not reached",
            "bad request", "bad request", "bad request"])
        self.assertIsNone(out[0]["id"])

    def test_carried(self):
        # A listener here, a door in this process dialed through it.
        from quokit.carrier import read_frame
        import socket
        pk = WardKey("dora").pk_hex
        proc = subprocess.Popen([os.path.join(HERE, "stand")], stdin=subprocess.PIPE,
                                stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

        def req(obj):
            proc.stdin.write((json.dumps(obj) + "\n").encode())
            proc.stdin.flush()
            return json.loads(proc.stdout.readline())

        try:
            req({"id": "w", "op": "ward", "seed": "dora"})
            at = req({"id": "l", "op": "listen"})["at"]
            self.assertEqual(req({"id": "l2", "op": "listen", "scheme": "tcp"})["at"], at)
            self.assertEqual(req({"id": "l3", "op": "listen", "scheme": "ws"}),
                             {"id": "l3", "error": "bad request"})
            tcp = address(at)
            self.assertEqual((tcp.scheme, tcp.host), ("tcp", "127.0.0.1"))
            inv = req({"id": "i", "op": "invite", "ward": pk, "heir": "h"})["invitation"]
            self.assertEqual(read_invitation(inv)["at"], [at])
            st = Standing(read_invitation(inv), OsSource())
            reply = dial(tcp, bytes.fromhex(pk), st.next_box("echo", '{"x":1}'), 10)
            self.assertEqual(st.take(reply)[2], b'{"x":1}')
            self.assertIsNone(dial(tcp, os.urandom(64), st.next_box(), 10))
            s = socket.create_connection((tcp.host, tcp.port))
            s.sendall(frame(REPLY, 1, b"x") + frame(ASK, 2, os.urandom(64) + b"y"))
            self.assertEqual(read_frame(s), (NOTHING, 2, b""))
            s.sendall(b"\x00\x00\x00\x01")
            self.assertIsNone(read_frame(s))
            s.close()
            # the program dials its own listener
            self.assertEqual(req({"id": "r", "op": "route", "far": pk, "at": at})["routed"], pk)
            me = req({"id": "w2", "op": "ward", "seed": "ed"})["ward"]
            inv2 = req({"id": "i2", "op": "invite", "ward": pk, "heir": "g"})["invitation"]
            got = req({"id": "s", "op": "send", "ward": me, "invitation": inv2, "method": "e", "args": {"q": 2}})
            self.assertEqual(got, {"id": "s", "read": {"object": {"q": 2}, "seen": None}})
            got = req({"id": "s2", "op": "send", "ward": me, "invitation": inv2})
            self.assertEqual(got, {"id": "s2", "read": {"object": {"asks": []}, "seen": None}})

            # the post: listened on, written first in `at`, and read through `at`
            web = req({"id": "l4", "op": "listen", "scheme": "http"})["at"]
            post_at = address(web)
            self.assertEqual((post_at.scheme, post_at.target), ("http", "/"))
            inv3 = req({"id": "i3", "op": "invite", "ward": pk, "heir": "f"})["invitation"]
            self.assertEqual(read_invitation(inv3)["at"], [web, at])
            st = Standing(read_invitation(inv3), OsSource())
            self.assertEqual(st.take(post(post_at, bytes.fromhex(pk), st.next_box("e", '{"p":1}'), 10))[2],
                             b'{"p":1}')
            self.assertIsNone(post(post_at, os.urandom(64), st.next_box(), 10))
            for method, body, status in [("GET", None, 405), ("POST", b"", 400),
                                         ("POST", os.urandom(64), 400)]:
                conn = http.client.HTTPConnection(post_at.host, post_at.port, timeout=10)
                conn.request(method, "/", body=body)
                self.assertEqual(conn.getresponse().status, status)
                conn.close()

            far = req({"id": "w3", "op": "ward", "seed": "fay"})["ward"]
            self.assertEqual(req({"id": "r2", "op": "route", "far": far, "at": "ws://127.0.0.1:1/"}),
                             {"id": "r2", "error": "bad request"})
            self.assertEqual(req({"id": "i0", "op": "invite", "ward": far, "heir": "k", "at": [7]}),
                             {"id": "i0", "error": "bad request"})
            inv4 = req({"id": "i4", "op": "invite", "ward": far, "heir": "k",
                        "at": ["zz://nowhere", "not a uri", "ws://127.0.0.1:1/", web]})["invitation"]
            got = req({"id": "s3", "op": "send", "ward": me, "invitation": inv4, "method": "e", "args": {"a": 1}})
            self.assertEqual(got, {"id": "s3", "read": {"object": {"a": 1}, "seen": None}})
            # the same relation, its text signed again with an `at` that is not an array: read as absent
            text = invitation(WardKey("fay").sign_seed, read_invitation(inv4))["text"]
            inv4 = resigned(WardKey("fay"), text[:-1] + ',"at":' + json.dumps(web) + "}")
            got = req({"id": "s4", "op": "send", "ward": me, "invitation": inv4})
            self.assertEqual(got, {"id": "s4", "read": {"nothing": True}})

            # a reply's at is read, and dialed before the invitation's
            inv5 = req({"id": "i5", "op": "invite", "ward": far, "heir": "m", "reach": "moved",
                        "at": [web]})["invitation"]
            got = req({"id": "s5", "op": "send", "ward": me, "invitation": inv5, "method": "e", "args": {"b": 1}})
            self.assertEqual(got, {"id": "s5", "read": {"object": {"b": 1}, "seen": None, "at": ["tcp://127.0.0.1:9"]}})
            got = req({"id": "s6", "op": "send", "ward": me, "invitation": inv5, "method": "e", "args": {"b": 2}})
            self.assertEqual(got["read"]["object"], {"b": 2})
        finally:
            proc.stdin.close()
            self.assertEqual(proc.wait(30), 0)
            proc.stdout.close()


if __name__ == "__main__":
    unittest.main()
