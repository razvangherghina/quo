package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/mlkem"
	"encoding/hex"
	"errors"
	"slices"
	"strconv"
)

// A Standing is the standing's end of one relation, kept by the asking ward.
type Standing struct {
	wardSignPK []byte
	padlock    []byte
	heirPK     []byte
	heir       ed25519.PrivateKey
	lock       *mlkem.EncapsulationKey768

	bound bool               // an object came back
	key   ed25519.PrivateKey // the key it signs with once bound
	edge  []byte             // the edge key it sends under once bound
	seq   uint64             // the last number it sent
	moved uint64             // the highest number it moved on

	knock     *Sent // the last knock, while not bound
	probeNext bool  // after a knock that brought no object: probe, or send it again
	last      *Sent // the last box sealed by `ask`, which `read` answers
}

// A Sent is one sealed ask, and what the standing needs to read its reply.
type Sent struct {
	Box       []byte
	lidSecret []byte
	isKnock   bool
	seq       uint64
	under     []byte             // the edge key it was sent under
	signer    ed25519.PrivateKey // the key that signed it
	announced ed25519.PrivateKey // the key it announced
}

var errBadInvitation = errors.New("no invitation")

// ParseInvitation reads an invitation's four fields.
func ParseInvitation(inv Invitation) (*Standing, error) {
	hx := func(s string, n int) ([]byte, bool) {
		if len(s) != 2*n || !isLowerHex(s) {
			return nil, false
		}
		b, _ := hex.DecodeString(s)
		return b, true
	}
	ward, ok1 := hx(inv.Ward, 64)
	heirPK, ok2 := hx(inv.Heir, 32)
	secret, ok3 := hx(inv.Secret, 32)
	lock, ok4 := hx(inv.Lock, 1184)
	if !ok1 || !ok2 || !ok3 || !ok4 {
		return nil, errBadInvitation
	}
	ek, err := mlkem.NewEncapsulationKey768(lock)
	if err != nil || !takesSeal(ward[32:]) {
		return nil, errBadInvitation
	}
	heir := ed25519.NewKeyFromSeed(secret)
	if !bytes.Equal(heir.Public().(ed25519.PublicKey), heirPK) {
		return nil, errBadInvitation
	}
	return &Standing{wardSignPK: ward[:32], padlock: ward[32:], heirPK: heirPK, heir: heir, lock: ek}, nil
}

func isLowerHex(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f') {
			return false
		}
	}
	return len(s)%2 == 0
}

func newKey() ed25519.PrivateKey { return ed25519.NewKeyFromSeed(draw(32)) }

func pkHex(k ed25519.PrivateKey) string {
	return hex.EncodeToString(k.Public().(ed25519.PublicKey))
}

// Seal makes the standing's next ask. Every ask announces a key drawn for it.
// Before an object comes back, the first ask is a knock. After a knock that
// brought no object back, the standing alternates between asking under the
// key the knock announced and the knock's edge key, and sending the knock
// again as the same bytes.
func (s *Standing) Seal(method *string, argsText []byte) (*Sent, error) {
	if !s.bound && s.knock != nil && !s.probeNext {
		s.probeNext = true
		return s.knock, nil
	}
	sent := &Sent{announced: newKey()}
	var ct []byte
	switch {
	case s.bound:
		sent.signer, sent.under = s.key, s.edge
	case s.knock != nil:
		s.probeNext = false
		sent.signer, sent.under = s.knock.announced, s.knock.under
	default:
		shared, c := s.lock.Encapsulate()
		sent.isKnock, sent.signer, sent.under, ct = true, s.heir, knockEdge(shared), c
	}
	s.seq++
	sent.seq = s.seq
	payload := slices.Concat(
		[]byte(`{"to":"` + hex.EncodeToString(s.heirPK) + `","by":"` + pkHex(sent.signer) +
			`","next":"` + pkHex(sent.announced) + `","seq":` + strconv.FormatUint(s.seq, 10)))
	if method != nil {
		payload = slices.Concat(payload, []byte(`,"method":`), Quote(*method))
	}
	if argsText != nil {
		payload = slices.Concat(payload, []byte(`,"args":`), argsText)
	}
	payload = append(payload, '}')
	box, lidSecret, err := sealAsk(s.padlock, s.heirPK, ct, sent.under, payload, sent.signer)
	if err != nil {
		return nil, err
	}
	sent.Box, sent.lidSecret = box, lidSecret
	if sent.isKnock {
		s.knock = sent
	}
	return sent, nil
}

// A Read is what the standing read: an object, silence, a word or nothing.
type Read struct {
	Kind   string // "object", "silence", "quo" or "nothing"
	Object []byte
	Seen   *string
	Word   string
}

var words = map[string]bool{"removed": true, "unannounced": true, "repeated": true}

// ReadReply reads a reply's box, nil for nothing, as the answer to sent, and
// moves the standing when an object came back.
func (s *Standing) ReadReply(sent *Sent, box []byte) Read {
	if box == nil {
		if sent != nil && sent.isKnock {
			s.probeNext = false // a knock that met nothing is sent again first
		}
		return Read{Kind: "nothing"}
	}
	if sent == nil {
		return Read{Kind: "silence"}
	}
	text, agr, err := openReply(box, sent.lidSecret, s.wardSignPK)
	if err != nil {
		if sent.isKnock {
			s.probeNext = true
		}
		return Read{Kind: "silence"}
	}
	r := readReplyText(text)
	if sent.isKnock && r.Kind != "object" {
		s.probeNext = true // the knock was heard: ask whether it bound
	}
	// A standing moves on an object to an ask numbered above every ask it
	// has moved on, and on nothing else.
	if r.Kind == "object" && sent.seq > s.moved {
		s.moved = sent.seq
		s.bound, s.key, s.edge, s.knock = true, sent.announced, follow(sent.under, agr), nil
	}
	return r
}

// readReplyText reads a reply text as one of the three shapes, or silence.
func readReplyText(text []byte) Read {
	v, err := Parse(text)
	if err != nil {
		return Read{Kind: "silence"}
	}
	o, ok := v.(*Obj)
	if !ok {
		return Read{Kind: "silence"}
	}
	has := func(keys ...string) bool {
		if len(o.Keys) != len(keys) {
			return false
		}
		for _, k := range keys {
			if _, ok := o.M[k]; !ok {
				return false
			}
		}
		return true
	}
	switch {
	case has("object", "seen"), has("object", "seen", "at"):
		// Whatever a reply's `at` holds, the reply is an object. This kit
		// keeps nothing from it.
		r := Read{Kind: "object", Object: o.Raw["object"]}
		switch seen := o.M["seen"].(type) {
		case nil:
		case string:
			r.Seen = &seen
		default:
			return Read{Kind: "silence"}
		}
		return r
	case has("quo"):
		if w, ok := o.M["quo"].(string); ok && words[w] {
			return Read{Kind: "quo", Word: w}
		}
	case has("silence"):
		// {"silence":true} in any spelling is silence, and so is every other
		// text that is none of the three shapes
	}
	return Read{Kind: "silence"}
}
