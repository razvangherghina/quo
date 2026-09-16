import hashlib
import json
import os
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)

from quokit import crypto as c  # noqa: E402
from quokit.box import (SILENCE, ZERO_EDGE, WardKey, open_reply, payload_text,  # noqa: E402
                        read_reply_text, seal_ask)
from quokit.carrier import ASK, NOTHING, REPLY, dial, frame  # noqa: E402
from quokit.door import REACHES, Ward  # noqa: E402
from quokit.entropy import OsSource  # noqa: E402
from quokit.standing import BOUND, KNOCKED, Standing, zero_ask  # noqa: E402
from quokit.values import Invalid, parse  # noqa: E402

SMALL_ORDER = [
    bytes(32),
    (1).to_bytes(32, "little"),
    bytes.fromhex("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800"),
    bytes.fromhex("5f9c95bca3508c24b1d0b1559c83ef5b04445cc4581c8e86d8224eddd09f1157"),
    bytes.fromhex("ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"),
    bytes.fromhex("edffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f"),
]


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


class Door(unittest.TestCase):
    def setUp(self):
        self.src = OsSource()
        self.ward = Ward("door", self.src)
        self.inv = self.ward.invite(REACHES["echo"])
        self.st = Standing(self.inv, self.src)
        self.sign = self.ward.key.signing_pk

    def bound(self, args='{"v":1}'):
        r = self.st.take(self.ward.arrive(self.st.next_box("echo", args)))
        self.assertEqual(r[0], "object")
        return r

    def test_sizes(self):
        payload = payload_text(None, os.urandom(32), None, 1)
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
        self.assertEqual((r[0], r[2], r[3]), ("object", b"{}", None))
        # an ask announcing nothing keeps the held key; asking under the vouched one moves it
        held = st.signer
        r = st.take(w.arrive(st.ask("echo", "{}", held, st.edge, announce=False)))
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
        self.assertEqual(st.take(w.arrive(st.knock("echo", "{}", announce=False))), ("word", "unannounced"))
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
        st = Standing(dict(self.inv, lock=other.invite(REACHES["echo"])["lock"]), self.src)
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

    def test_zero_head(self):
        signer = os.urandom(32)
        box, ls = zero_ask(self.ward.key.padlock, signer, self.src, "echo", '{"z":1}')
        self.assertEqual(open_reply(self.ward.arrive(box), ls, self.sign)[0], ("silence",))
        w = Ward("door", self.src, zero_reach=REACHES["marked"])
        for _ in range(2):
            r = open_reply(w.arrive(box), ls, self.sign)[0]
            self.assertEqual((r[0], r[2], r[3]), ("object", b'{"z":1}', "1"))

    def test_unopened_lids(self):
        for junk in [b"", b"x" * 10, SMALL_ORDER[1] + b"y" * 100]:
            self.assertEqual(len(self.ward.arrive(junk)), 128)
        lid_secret = os.urandom(32)
        box = c.x25519_public(lid_secret) + os.urandom(100)
        self.assertEqual(open_reply(self.ward.arrive(box), lid_secret, self.sign)[0], ("silence",))
        big = c.x25519_public(lid_secret) + bytes(1048576)
        self.assertEqual(open_reply(self.ward.arrive(big), lid_secret, self.sign)[0], ("silence",))


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
        self.assertEqual(sorted(inv), ["heir", "lock", "secret", "ward"])

        # One program asks, a door here answers, the program reads.
        door = Ward(c.sha256(b"bob"), OsSource())
        dinv = door.invite(REACHES["marked"])
        code, out = stand([json.dumps({"id": "w", "op": "ward", "seed": "carol"}),
                           json.dumps({"id": "a", "op": "ask", "ward": WardKey("carol").pk_hex,
                                       "invitation": dinv, "method": "m", "args": {"k": [1, 1.5]}})])
        box = bytes.fromhex(by_id(out)["a"]["box"])
        reply = door.arrive(box)
        self.assertFalse(door.heirs[bytes.fromhex(dinv["heir"])].fresh)
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
            self.assertEqual(req({"id": "l2", "op": "listen"})["at"], at)
            inv = req({"id": "i", "op": "invite", "ward": pk, "heir": "h"})["invitation"]
            st = Standing(inv, OsSource())
            reply = dial(at, bytes.fromhex(pk), st.next_box("echo", '{"x":1}'), 10)
            self.assertEqual(st.take(reply)[2], b'{"x":1}')
            self.assertIsNone(dial(at, os.urandom(64), st.next_box(), 10))
            host, port = at.split(":")
            s = socket.create_connection((host, int(port)))
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
            self.assertEqual(got, {"id": "s2", "read": {"object": {}, "seen": None}})
        finally:
            proc.stdin.close()
            self.assertEqual(proc.wait(30), 0)
            proc.stdout.close()


if __name__ == "__main__":
    unittest.main()
