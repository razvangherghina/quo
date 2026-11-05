package main

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"io"
	"slices"
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
	sent := st.Seal(&method, []byte(args))
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
	sent := st.Seal(&m, nil)
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
	knock := st.Seal(&m, nil)
	w.Arrive(knock.Box) // the door binds, the reply is lost
	if r := st.ReadReply(knock, nil); r.Kind != "nothing" {
		t.Fatal(r)
	}
	again := st.Seal(&m, nil)
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
	early := st.Seal(&m, nil)
	late := st.Seal(&m, nil)
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

// A reply's signature covers the lid it is sealed to, then the reply text.
func TestAReplySignedOverAnythingElseReadsAsSilence(t *testing.T) {
	w, st := pair(t, "echo")
	round(t, w, st, "m", `{}`)
	m := "m"
	sent := st.Seal(&m, nil)
	other := st.Seal(&m, nil)
	text := []byte(`{"object":1,"seen":null}`)
	lid := x25519Pub(sent.lidSecret)
	for name, signedOver := range map[string][]byte{
		"the reply text alone": text,
		"another ask's lid":    slices.Concat(x25519Pub(other.lidSecret), text),
	} {
		eph := draw(32)
		ephPK := x25519Pub(eph)
		agr, err := x25519(eph, lid)
		if err != nil {
			t.Fatal(err)
		}
		body := slices.Concat(text, ed25519.Sign(w.Sign, signedOver))
		box := slices.Concat(ephPK, sealWith(bodyKN(agr, sent.under), body, ephPK))
		if r := st.ReadReply(sent, box); r.Kind != "silence" {
			t.Errorf("a reply signed over %s read %+v", name, r)
		}
	}
}

// A reply's body is sealed under the edge key the ask came under, and under
// the zero edge key when the reply is silence.
func TestAReplyIsSealedUnderItsEdgeKey(t *testing.T) {
	opens := func(sent *Sent, reply, under []byte, st *Standing) string {
		text, _, err := openReply(reply, sent.lidSecret, under, st.wardSignPK)
		if err != nil {
			return ""
		}
		return string(text)
	}
	m := "m"

	w, st := pair(t, "echo")
	knock := st.Seal(&m, []byte(`{}`))
	reply := w.Arrive(knock.Box)
	if got := opens(knock, reply, knock.under, st); got != `{"object":{},"seen":null}` {
		t.Errorf("an object under the ask's edge key opened to %q", got)
	}
	if got := opens(knock, reply, zero32, st); got != "" {
		t.Errorf("an object opened under the zero edge key to %q", got)
	}
	st.ReadReply(knock, reply)

	sent := st.Seal(&m, nil)
	st.ReadReply(sent, w.Arrive(sent.Box))
	reply = w.Arrive(sent.Box)
	if got := opens(sent, reply, sent.under, st); got != `{"quo":"repeated"}` {
		t.Errorf("a word under the ask's edge key opened to %q", got)
	}

	w, st = pair(t, "silent")
	knock = st.Seal(&m, []byte(`{}`))
	reply = w.Arrive(knock.Box)
	if got := opens(knock, reply, zero32, st); got != string(silenceText) {
		t.Errorf("a chosen silence under the zero edge key opened to %q", got)
	}
	if got := opens(knock, reply, knock.under, st); got != "" {
		t.Errorf("a chosen silence opened under the ask's edge key to %q", got)
	}

	forged := slices.Clone(knock.Box)
	forged[len(forged)-1] ^= 1
	if got := opens(knock, w.Arrive(forged), zero32, st); got != string(silenceText) {
		t.Errorf("a stranger's silence under the zero edge key opened to %q", got)
	}
}

// Only an object under the ask's edge key moves the standing: an object or a
// word under the zero edge key reads as silence and moves nothing, and
// silence reads as silence under either key.
func TestTheStandingReadsAReplyUnderItsEdgeKey(t *testing.T) {
	w, st := pair(t, "echo")
	round(t, w, st, "m", `{}`)
	m := "m"
	for _, c := range []struct {
		text  string
		under []byte
	}{
		{`{"object":1,"seen":null}`, zero32},
		{`{"quo":"repeated"}`, zero32},
		{`{"silence":true}`, zero32},
		{`{"silence":true}`, nil},
	} {
		sent := st.Seal(&m, nil)
		under := c.under
		if under == nil {
			under = sent.under
		}
		reply, _ := sealReply(x25519Pub(sent.lidSecret), []byte(c.text), under, w.Sign)
		key, edge := st.key, st.edge
		if r := st.ReadReply(sent, reply); r.Kind != "silence" {
			t.Errorf("%s read %+v", c.text, r)
		}
		if !key.Equal(st.key) || !bytes.Equal(edge, st.edge) {
			t.Errorf("%s moved the standing", c.text)
		}
	}
}

// Inside `args` Quo reads nothing, so a repeated key there is taken.
func TestARepeatedKeyInsideArgsIsAnswered(t *testing.T) {
	w, st := pair(t, "echo")
	if r := round(t, w, st, "m", `{"a":1,"a":2}`); r.Kind != "object" || string(r.Object) != `{"a":1,"a":2}` {
		t.Fatalf("read %+v", r)
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

// The reach `moved` writes `at` on every object, and the standing reads the
// reply as an object and moves on it.
func TestMovedWritesAt(t *testing.T) {
	w, st := pair(t, "moved")
	for i := range 3 {
		m := "m"
		sent := st.Seal(&m, []byte(`{"i":1}`))
		reply := w.Arrive(sent.Box)
		text, _, err := openReply(reply, sent.lidSecret, sent.under, st.wardSignPK)
		if err != nil || string(text) != `{"object":{"i":1},"seen":null,"at":["tcp://127.0.0.1:9"]}` {
			t.Fatalf("ask %d: reply text %s, %v", i, text, err)
		}
		if r := st.ReadReply(sent, reply); r.Kind != "object" || string(r.Object) != `{"i":1}` {
			t.Fatalf("ask %d read %+v", i, r)
		}
	}
}

func TestReplyShapes(t *testing.T) {
	for text, want := range map[string]string{
		`{"silence":true}`:                                    "silence",
		` { "silence" : true }`:                               "silence",
		`{"quo":"repeated"}`:                                  "quo",
		`{"quo":"gone"}`:                                      "silence",
		`{"object":1,"seen":null}`:                            "object",
		`{"seen":"s","object":[1.5]}`:                         "object",
		`{"object":1}`:                                        "silence",
		`{"object":1,"seen":5}`:                               "silence",
		`{"object":-0,"seen":null}`:                           "object",
		`{"object":{"a":1,"a":2},"seen":null}`:                "object",
		`{"object":1,"object":1,"seen":null}`:                 "silence",
		`{"object":1,"seen":null,"x":1}`:                      "silence",
		`[1]`:                                                 "silence",
		`{"object":1,"seen":null,"at":["tcp://127.0.0.1:9"]}`: "object",
		`{"at":[5,"no scheme",null,"TCP://127.0.0.1:9"],"object":1,"seen":null}`: "object",
		`{"object":1,"seen":null,"at":"tcp://127.0.0.1:9"}`:                      "object",
		`{"object":1,"seen":null,"at":null}`:                                     "object",
		`{"object":1,"seen":null,"at":[],"at":[]}`:                               "silence",
		`{"object":1,"seen":5,"at":[]}`:                                          "silence",
		`{"object":1,"at":[]}`:                                                   "silence",
		`{"silence":true,"at":[]}`:                                               "silence",
		`{"quo":"repeated","at":[]}`:                                             "silence",
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
