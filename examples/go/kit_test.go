package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"io"
	"strings"
	"testing"
)

func TestValues(t *testing.T) {
	nest := func(n int) string { return strings.Repeat(`[{"a":`, n) + "1" + strings.Repeat("}]", n) }
	good := []string{
		`1`, `-9007199254740991`, `9007199254740993`, `1e400`, `-0`, `-0.0`, `1e-400`, `1.5`,
		`0`, "\"\\" + "ud83d\\" + "ude00\"", "\"\\" + "uffff\"", `"\ud800"`, `"\udc00x"`,
		`{"a":1,"b":[true,false,null]}`, ` {"x" : 1} `, `[{"a":1,"a":2}, {}, []]`,
		`{"a":{"b":1,"b":2}}`, nest(100000),
	}
	bad := []string{
		`01`, `[1,]`, `{"a":1,}`, `[`, `{"a"}`, `"\x41"`, "{\"a\":1,\"\\" + "u0061\":2}",
		"\xef\xbb\xbf1", `1 x`, "\"a\x01\"", `tru`, `nul`, `1.`, `-`, `[1 2]`, `{"a":1 "b":2}`,
		`{"\ud800":1,"\ud800":2}`, `[}`, nest(3) + "]",
	}
	for _, s := range good {
		if _, err := Parse([]byte(s)); err != nil {
			t.Errorf("%.40s should be a value", s)
		}
	}
	for _, s := range bad {
		if _, err := Parse([]byte(s)); err == nil {
			t.Errorf("%.40s should not be a value", s)
		}
	}
	if _, err := Parse([]byte{'"', 0xc3, 0x28, '"'}); err == nil {
		t.Error("bytes that are not UTF-8 are no JSON text")
	}
	if _, err := Parse([]byte(`{"\ud800":1,"\ud800x":2}`)); err != nil {
		t.Error("two lone surrogate keys of different code units are two names")
	}
	for s, want := range map[string]bool{`1`: true, `9007199254740991`: true, `9007199254740992`: false, `0`: false, `1.0`: false, `1e0`: false, `-1`: false} {
		v, _ := Parse([]byte(s))
		if _, ok := CountOf(v); ok != want {
			t.Errorf("CountOf(%s) = %v", s, ok)
		}
	}
}

func TestVerifyRefusesSmallOrderKeys(t *testing.T) {
	k := ed25519.NewKeyFromSeed(make([]byte, 32))
	msg := []byte("m")
	sig := ed25519.Sign(k, msg)
	if !Verify(k.Public().(ed25519.PublicKey), msg, sig) {
		t.Fatal("a true signature fails")
	}
	identity := make([]byte, 32)
	identity[0] = 1
	identitySigned := append([]byte{}, identity...)
	identitySigned[31] |= 0x80
	for _, pk := range [][]byte{identity, identitySigned, make([]byte, 32)} {
		if Verify(pk, msg, sig) {
			t.Errorf("small-order key %x verifies", pk)
		}
	}
	if Verify(k.Public().(ed25519.PublicKey), msg, sig[:63]) {
		t.Error("a short signature verifies")
	}
}

// pair is one ward's door and one standing on one of its heirs.
func pair(t *testing.T, reach string) (*Ward, *Standing) {
	t.Helper()
	w := NewWard(SeedOfText("door"))
	inv, err := w.Invite("h", Targets[reach])
	if err != nil {
		t.Fatal(err)
	}
	st, err := ParseInvitation(*inv)
	if err != nil {
		t.Fatal(err)
	}
	return w, st
}

func round(t *testing.T, w *Ward, st *Standing, method string, args string) Read {
	t.Helper()
	sent, err := st.Seal(&method, []byte(args))
	if err != nil {
		t.Fatal(err)
	}
	return st.ReadReply(sent, w.Arrive(sent.Box))
}

func TestRelation(t *testing.T) {
	w, st := pair(t, "echo")
	r := round(t, w, st, "m", `{"a":[1,"two"]}`)
	if r.Kind != "object" || string(r.Object) != `{"a":[1,"two"]}` || r.Seen != nil {
		t.Fatalf("knock read %+v", r)
	}
	for i := range 5 {
		if r := round(t, w, st, "m", `{"i":1}`); r.Kind != "object" {
			t.Fatalf("ask %d read %+v", i, r)
		}
	}
	// the same box again is a number the door has honoured
	m := "m"
	sent, _ := st.Seal(&m, nil)
	if r := st.ReadReply(sent, w.Arrive(sent.Box)); r.Kind != "object" {
		t.Fatalf("read %+v", r)
	}
	if r := st.ReadReply(sent, w.Arrive(sent.Box)); r.Kind != "quo" || r.Word != "repeated" {
		t.Fatalf("a repeat read %+v", r)
	}
	w.Release("h")
	if r := round(t, w, st, "m", `{}`); r.Kind != "quo" || r.Word != "removed" {
		t.Fatalf("after release read %+v", r)
	}
}

func TestKnockLostThenRecovered(t *testing.T) {
	w, st := pair(t, "echo")
	m := "m"
	knock, _ := st.Seal(&m, nil)
	w.Arrive(knock.Box) // the door binds, the reply is lost
	if r := st.ReadReply(knock, nil); r.Kind != "nothing" {
		t.Fatal(r)
	}
	again, _ := st.Seal(&m, nil)
	if !bytes.Equal(again.Box, knock.Box) {
		t.Fatal("after nothing, the knock is sent again as the same bytes")
	}
	if r := st.ReadReply(again, w.Arrive(again.Box)); r.Kind != "silence" {
		t.Fatalf("a knock on a spent heir read %+v", r)
	}
	if r := round(t, w, st, "m", `{"probe":1}`); r.Kind != "object" {
		t.Fatalf("the probe under the knock's keys read %+v", r)
	}
	if r := round(t, w, st, "m", `{}`); r.Kind != "object" {
		t.Fatalf("after the probe read %+v", r)
	}
}

func TestALateReplyMovesNothing(t *testing.T) {
	w, st := pair(t, "echo")
	round(t, w, st, "m", `{}`)
	m := "m"
	early, _ := st.Seal(&m, nil)
	late, _ := st.Seal(&m, nil)
	earlyReply, lateReply := w.Arrive(early.Box), w.Arrive(late.Box)
	if r := st.ReadReply(late, lateReply); r.Kind != "object" {
		t.Fatal(r)
	}
	if r := st.ReadReply(early, earlyReply); r.Kind != "object" {
		t.Fatal(r)
	}
	if r := round(t, w, st, "m", `{}`); r.Kind != "object" {
		t.Fatalf("after a late reply read %+v", r)
	}
}

func TestStrangersHearOneSilence(t *testing.T) {
	w, _ := pair(t, "echo")
	for _, box := range [][]byte{nil, {1}, make([]byte, 200), draw(400)} {
		if n := len(w.Arrive(box)); n != 128 {
			t.Errorf("a stranger's reply of %d bytes", n)
		}
	}
}

func TestSilentAndNull(t *testing.T) {
	w, st := pair(t, "silent")
	if r := round(t, w, st, "m", `{}`); r.Kind != "silence" {
		t.Fatal(r)
	}
	w, st = pair(t, "null")
	if r := round(t, w, st, "m", `{}`); r.Kind != "object" || string(r.Object) != "null" {
		t.Fatal(r)
	}
}

func TestReplyShapes(t *testing.T) {
	for text, want := range map[string]string{
		`{"silence":true}`:                     "silence",
		` { "silence" : true }`:                "silence",
		`{"quo":"repeated"}`:                   "quo",
		`{"quo":"gone"}`:                       "silence",
		`{"object":1,"seen":null}`:             "object",
		`{"seen":"s","object":[1.5]}`:          "object",
		`{"object":1}`:                         "silence",
		`{"object":1,"seen":5}`:                "silence",
		`{"object":-0,"seen":null}`:            "object",
		`{"object":{"a":1,"a":2},"seen":null}`: "object",
		`{"object":1,"object":1,"seen":null}`:  "silence",
		`{"object":1,"seen":null,"x":1}`:       "silence",
		`[1]`:                                  "silence",
	} {
		if r := readReplyText([]byte(text)); r.Kind != want {
			t.Errorf("%s read as %s", text, r.Kind)
		}
	}
}

func TestFrames(t *testing.T) {
	pk := make([]byte, 64)
	f, err := readFrame(bytes.NewReader(withLength(frameBody(kindAsk, 7, pk, []byte("box")))))
	if err != nil || f.id != 7 || string(f.box) != "box" {
		t.Fatal(f, err)
	}
	for _, b := range []string{"00100046", "00000004", "0000000503", "0000004400"} {
		raw, _ := hex.DecodeString(b)
		if _, err := readFrame(io.MultiReader(bytes.NewReader(raw), bytes.NewReader(make([]byte, 100)))); err != errNotFrame {
			t.Errorf("%s: %v", b, err)
		}
	}
}
