package envelope_test

import (
	"bytes"
	"crypto/sha256"
	"testing"

	"quo.systems/kit/arithmetic"
	"quo.systems/kit/envelope"
)

// Everything here is asserted from the constitution's own words, under "The
// envelope": the assembly that adds nothing new, and the boundary every
// message has.

func draw(label string) [32]byte { return sha256.Sum256([]byte("quo-go-bench/" + label)) }

func padlockOf(t *testing.T, label string) ([32]byte, [32]byte) {
	t.Helper()
	secret := draw(label)
	pk, err := arithmetic.SealingKey(secret)
	if err != nil {
		t.Fatal(err)
	}
	return pk, secret
}

// wellFormed is one legal utterance, which each case then bends.
func wellFormed(t *testing.T) envelope.Say {
	t.Helper()
	returnPadlock, _ := padlockOf(t, "return")
	return envelope.Say{
		Voice:     arithmetic.SigningKey(draw("voice")),
		Recipient: arithmetic.SigningKey(draw("name")),
		Seq:       1,
		Padlock:   returnPadlock,
		Hints:     []string{"https://one.example", "https://two.example"},
		Allowance: envelope.Allowance{Time: 5000, Hops: 8},
	}
}

// TestNothingButTheEphemeralKeyIsOutside holds the one thing stapled to the
// lid: it is fresh on every message, belongs to no one, and names neither the
// sender nor the sender's house.
func TestNothingButTheEphemeralKeyIsOutside(t *testing.T) {
	padlock, secret := padlockOf(t, "door")
	ephemeralSecret := draw("ephemeral")
	ephemeral, err := arithmetic.SealingKey(ephemeralSecret)
	if err != nil {
		t.Fatal(err)
	}
	s := wellFormed(t)
	message, err := envelope.SealSay(ephemeralSecret, padlock, draw("voice"), s)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(message[:32], ephemeral[:]) {
		t.Fatal("the first thirty-two bytes are not the ephemeral public key")
	}
	// Nothing else is outside: what remains is one ciphertext, and it carries
	// no plaintext field a reader could pick out.
	if bytes.Contains(message[32:], s.Voice[:]) {
		t.Fatal("the voice is readable outside the seal")
	}
	if bytes.Contains(message[32:], s.Recipient[:]) {
		t.Fatal("the recipient is readable outside the seal")
	}
	for _, hint := range s.Hints {
		if bytes.Contains(message, []byte(hint)) {
			t.Fatal("a hint is readable outside the seal")
		}
	}

	back, err := envelope.OpenSay(secret, message)
	if err != nil {
		t.Fatal(err)
	}
	if back.Voice != s.Voice || back.Recipient != s.Recipient {
		t.Fatal("it did not open to what was sealed")
	}
	// A key sealed inside the thing it opens would be no key at all: strip the
	// lid and nothing opens.
	if _, err := envelope.OpenSay(secret, message[32:]); err == nil {
		t.Fatal("a message with no lid opened")
	}
}

// TestOnlyTheNamedDoorCanOpenIt holds that the seal binds a message to a
// padlock: another house's secret is not a key to this box.
func TestOnlyTheNamedDoorCanOpenIt(t *testing.T) {
	padlock, _ := padlockOf(t, "door")
	_, otherSecret := padlockOf(t, "otherDoor")
	message, err := envelope.SealSay(draw("ephemeral"), padlock, draw("voice"), wellFormed(t))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := envelope.OpenSay(otherSecret, message); err == nil {
		t.Fatal("another door's secret opened it")
	}
}

// TestTheSignatureIsTheLastSixtyFourBytesInsideTheSeal holds the boundary that
// needs no marker and no length in front of the payload.
func TestTheSignatureIsTheLastSixtyFourBytesInsideTheSeal(t *testing.T) {
	padlock, secret := padlockOf(t, "door")
	s := wellFormed(t)
	payload, err := envelope.EncodeSay(s)
	if err != nil {
		t.Fatal(err)
	}
	message, err := envelope.SealSay(draw("ephemeral"), padlock, draw("voice"), s)
	if err != nil {
		t.Fatal(err)
	}
	plain, err := envelope.Unseal(secret, message)
	if err != nil {
		t.Fatal(err)
	}
	if len(plain) != len(payload)+arithmetic.SignatureSize {
		t.Fatalf("inside the seal is %d bytes, want %d", len(plain), len(payload)+arithmetic.SignatureSize)
	}
	if !bytes.Equal(plain[:len(payload)], payload) {
		t.Fatal("the payload is not the front of what is inside the seal")
	}
	var sig [arithmetic.SignatureSize]byte
	copy(sig[:], plain[len(payload):])
	if !arithmetic.Verify(s.Voice, payload, sig) {
		t.Fatal("the last sixty-four bytes are not the voice's signature over the payload")
	}
}

// TestASignatureByAnotherVoiceIsRefused holds step two: the door verifies with
// the voice the payload carries, so a payload one key signed and another
// claims is silence.
func TestASignatureByAnotherVoiceIsRefused(t *testing.T) {
	padlock, secret := padlockOf(t, "door")
	s := wellFormed(t)
	message, err := envelope.SealSay(draw("ephemeral"), padlock, draw("thief"), s)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := envelope.OpenSay(secret, message); err == nil {
		t.Fatal("a payload signed by another key opened")
	}
}

// TestATurnedByteAnywhereIsRefused holds that the seal covers the whole of
// what is inside it, the lid included.
func TestATurnedByteAnywhereIsRefused(t *testing.T) {
	padlock, secret := padlockOf(t, "door")
	message, err := envelope.SealSay(draw("ephemeral"), padlock, draw("voice"), wellFormed(t))
	if err != nil {
		t.Fatal(err)
	}
	for _, at := range []int{0, 31, 32, len(message) - 1} {
		turned := append([]byte(nil), message...)
		turned[at] ^= 1
		if _, err := envelope.OpenSay(secret, turned); err == nil {
			t.Fatalf("a turned byte at %d opened", at)
		}
	}
}

// TestTheThreeOptionalsRideAbsentAndPresent holds that the say's three
// possibly-absent fields survive both ways, because an absent optional is a
// legal value and not a missing one.
func TestTheThreeOptionalsRideAbsentAndPresent(t *testing.T) {
	padlock, secret := padlockOf(t, "door")

	absent := wellFormed(t)
	message, err := envelope.SealSay(draw("ephemeral"), padlock, draw("voice"), absent)
	if err != nil {
		t.Fatal(err)
	}
	back, err := envelope.OpenSay(secret, message)
	if err != nil {
		t.Fatal(err)
	}
	if back.Commitment != nil || back.Being != nil || back.Method != nil {
		t.Fatal("an absent optional came back present")
	}

	commitment := arithmetic.Commit(absent.Recipient, arithmetic.SigningKey(draw("nextHeir")))
	being := arithmetic.SigningKey(draw("being"))
	present := absent
	present.Commitment = &commitment
	present.Being = &being
	// The blob is empty when the method takes nothing, and the pair is present
	// together or absent together.
	present.Method = &envelope.Method{Name: "count", Args: []byte{}}
	message, err = envelope.SealSay(draw("ephemeral"), padlock, draw("voice"), present)
	if err != nil {
		t.Fatal(err)
	}
	back, err = envelope.OpenSay(secret, message)
	if err != nil {
		t.Fatal(err)
	}
	if back.Commitment == nil || *back.Commitment != commitment {
		t.Fatal("the commitment did not survive")
	}
	if back.Being == nil || *back.Being != being {
		t.Fatal("the being did not survive")
	}
	if back.Method == nil || back.Method.Name != "count" || len(back.Method.Args) != 0 {
		t.Fatalf("the method came back as %#v", back.Method)
	}
}

// TestTheHintsRideAsAListOfText holds the field a caller uses to be reachable
// later, including the empty list, which means the road did not change.
func TestTheHintsRideAsAListOfText(t *testing.T) {
	padlock, secret := padlockOf(t, "door")
	s := wellFormed(t)
	s.Hints = nil
	message, err := envelope.SealSay(draw("ephemeral"), padlock, draw("voice"), s)
	if err != nil {
		t.Fatal(err)
	}
	back, err := envelope.OpenSay(secret, message)
	if err != nil {
		t.Fatal(err)
	}
	if len(back.Hints) != 0 {
		t.Fatalf("an empty hints list came back as %v", back.Hints)
	}
}

// TestTheAllowanceRidesAsTwoInts holds the caller's leash: time then hops, the
// time budget in milliseconds, and both carried rather than defaulted.
func TestTheAllowanceRidesAsTwoInts(t *testing.T) {
	padlock, secret := padlockOf(t, "door")
	s := wellFormed(t)
	s.Allowance = envelope.Allowance{Time: 1, Hops: 0}
	message, err := envelope.SealSay(draw("ephemeral"), padlock, draw("voice"), s)
	if err != nil {
		t.Fatal(err)
	}
	back, err := envelope.OpenSay(secret, message)
	if err != nil {
		t.Fatal(err)
	}
	if back.Allowance != s.Allowance {
		t.Fatalf("the allowance came back as %#v", back.Allowance)
	}
}

// TestTheAnswerNamesTheAskBySeq holds the field that does both jobs at once:
// it pairs each answer with its question when three are in flight, and it
// makes a stale answer obvious.
func TestTheAnswerNamesTheAskBySeq(t *testing.T) {
	returnPadlock, returnSecret := padlockOf(t, "return")
	nameSecret := draw("name")
	a := envelope.Answer{Warden: arithmetic.SigningKey(nameSecret), Seq: 7, Data: []byte("yes")}
	sealed, err := envelope.SealAnswer(draw("ephemeral"), returnPadlock, nameSecret, a)
	if err != nil {
		t.Fatal(err)
	}
	back, err := envelope.OpenAnswer(returnSecret, sealed)
	if err != nil {
		t.Fatal(err)
	}
	if back.Seq != 7 {
		t.Fatalf("the answer names ask %d", back.Seq)
	}
	// Signed by the warden's own name, because the caller must know that the
	// door it asked is the door that spoke.
	if back.Warden != a.Warden {
		t.Fatal("the answer is not the name's")
	}
	forged, err := envelope.SealAnswer(draw("ephemeral"), returnPadlock, draw("impostor"), a)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := envelope.OpenAnswer(returnSecret, forged); err == nil {
		t.Fatal("an answer signed by another key opened")
	}
}

// TestAnAnswerWithNoDataIsNotAnAnswerWithEmptyData holds the distinction a
// field that answers nothing depends on: absent, not present and empty.
func TestAnAnswerWithNoDataIsNotAnAnswerWithEmptyData(t *testing.T) {
	nothing, err := envelope.EncodeAnswer(envelope.Answer{Seq: 1})
	if err != nil {
		t.Fatal(err)
	}
	empty, err := envelope.EncodeAnswer(envelope.Answer{Seq: 1, Data: []byte{}})
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Equal(nothing, empty) {
		t.Fatal("an absent answer and an empty one ride the same")
	}
	back, err := envelope.DecodeAnswer(nothing)
	if err != nil {
		t.Fatal(err)
	}
	if back.Data != nil {
		t.Fatal("an absent answer came back present")
	}
	back, err = envelope.DecodeAnswer(empty)
	if err != nil {
		t.Fatal(err)
	}
	if back.Data == nil || len(back.Data) != 0 {
		t.Fatal("an empty answer came back absent")
	}
}

// TestSurplusBytesInsideTheSealAreRefused holds that bytes left over after a
// well-formed value are refused like any other surplus — even under a
// signature that covers them.
func TestSurplusBytesInsideTheSealAreRefused(t *testing.T) {
	payload, err := envelope.EncodeSay(wellFormed(t))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := envelope.DecodeSay(append(payload, 0)); err == nil {
		t.Fatal("a byte left over after a well-formed say was accepted")
	}
	if _, err := envelope.DecodeSay(payload[:len(payload)-1]); err == nil {
		t.Fatal("a truncated say was accepted")
	}
}

// TestNoDigestOfSayOrAnswerIsEverComputed holds what the constitution says about the
// two records: neither is a class and neither is described, so what pins their
// order is this text rather than a hash. The kit's own shapes must therefore
// be exactly the ones written down.
func TestNoDigestOfSayOrAnswerIsEverComputed(t *testing.T) {
	want := `Envelope
  say() say
  answer() answer

say
  voice b32
  recipient b32
  commitment b32?
  seq int
  padlock b32
  hints [text]
  allowance allowance
  being being?
  method method?

allowance
  time int
  hops int

method
  name text
  args bytes

answer
  warden being
  seq int
  data bytes?
`
	if envelope.Shapes != want {
		t.Fatalf("the shapes are\n%s", envelope.Shapes)
	}
}
