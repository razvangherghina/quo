package main

import (
	"bytes"
	"encoding/hex"
	"regexp"
	"slices"
)

// ---- what stands behind a door ----

// An Ask is what a target is handed: an admitted ask on a heir, or an ask on
// the zero head. Method is nil on the empty ask. Args is nil when absent, and
// Args is its bytes exactly as they arrived, nil when absent.
type Ask struct {
	Method *string
	Args   []byte
}

// An Answer is an object and its seen, or silence.
type Answer struct {
	Silence bool
	Object  []byte  // JSON text of a value
	Seen    *string // nil for null
}

// A Target answers an arrival.
type Target func(Ask) Answer

var silence = Answer{Silence: true}

// describeNone is the describe every reach but silent gives the empty ask.
var describeNone = []byte(`{"asks":[]}`)

func echoOf(a Ask) Answer {
	if a.Method == nil {
		return Answer{Object: describeNone}
	}
	if a.Args == nil {
		return Answer{Object: []byte("{}")}
	}
	return Answer{Object: a.Args}
}

// Targets are the reaches this kit provides, by the names HARNESS.md sends.
var Targets = map[string]Target{
	"echo": echoOf,
	"marked": func(a Ask) Answer {
		ans := echoOf(a)
		if !ans.Silence {
			one := "1"
			ans.Seen = &one
		}
		return ans
	},
	"null": func(a Ask) Answer {
		if a.Method == nil {
			return Answer{Object: describeNone}
		}
		return Answer{Object: []byte("null")}
	},
	"silent": func(Ask) Answer { return silence },
}

// replyText writes an answer as a reply text: silence as its sixteen bytes,
// an object as {"object":...,"seen":...}. Where there is no value to write,
// the reply is silence.
func replyText(a Answer) []byte {
	if a.Silence {
		return silenceText
	}
	if _, err := Parse(a.Object); err != nil {
		return silenceText
	}
	seen := []byte("null")
	if a.Seen != nil {
		seen = Quote(*a.Seen)
	}
	return slices.Concat([]byte(`{"object":`), a.Object, []byte(`,"seen":`), seen, []byte("}"))
}

// ---- the door ----

var hex64 = regexp.MustCompile(`^[0-9a-f]{64}$`)

type payload struct {
	to, by, next []byte // to and next are nil for null
	seq          uint64
	ask          Ask
}

// Arrive is the door: bytes in, bytes out. This door always answers.
func (w *Ward) Arrive(box []byte) []byte {
	return w.judge(box)
}

// silenceTo is a stranger's silence, sealed to lid.
func (w *Ward) silenceTo(lid []byte) []byte {
	out, _ := sealReply(lid, silenceText, w.Sign)
	return out
}

// nobodysLid is a lid nobody holds.
func nobodysLid() []byte {
	if lid := draw(32); takesSeal(lid) {
		return lid
	}
	return x25519Pub(draw(32))
}

func (w *Ward) word(lid []byte, word string) []byte {
	out, _ := sealReply(lid, []byte(`{"quo":"`+word+`"}`), w.Sign)
	return out
}

// judge walks the thirteen cases in the order SPEC.md gives them.
func (w *Ward) judge(box []byte) []byte {
	// Case 1 before the head opens: the reply is sealed to the first
	// thirty-two bytes where they take a seal, else to a lid nobody holds.
	unopened := func() []byte {
		if len(box) >= pkSize && takesSeal(box[:pkSize]) {
			return w.silenceTo(box[:pkSize])
		}
		return w.silenceTo(nobodysLid())
	}
	if len(box) > boxSize || len(box) < pkSize+headSeal {
		return unopened()
	}
	lid := box[:pkSize]
	agr, ok := w.agree(lid)
	if !ok {
		return unopened()
	}
	head, ok := openWith(sealKN(agr), box[pkSize:pkSize+headSeal], lid)
	if !ok {
		return unopened()
	}
	stranger := func() []byte { return w.silenceTo(lid) }
	rest := box[pkSize+headSeal:]

	zero := isZero(head)
	var h *Heir
	if !zero {
		h = w.byPK[hex.EncodeToString(head)]
	}
	// held: the door holds the heir, or stopped holding it while spent and
	// keeps its keys.
	held := h != nil && (!h.removed || h.spent)

	var body, cameUnder []byte
	switch {
	case held && !h.spent:
		if len(rest) < ctSize {
			return stranger()
		}
		ss, err := w.lock.Decapsulate(rest[:ctSize])
		if err != nil {
			return stranger()
		}
		cameUnder = knockEdge(ss)
		if body, ok = openWith(askBodyKN(agr, cameUnder), rest[ctSize:], lid); !ok {
			return stranger()
		}
	case held:
		for _, k := range [][]byte{h.open, h.offered} {
			if b, ok := openWith(askBodyKN(agr, k), rest, lid); ok {
				body, cameUnder = b, k
				break
			}
		}
		if body == nil {
			return stranger()
		}
	default: // the zero head, or a heir not held
		if body, ok = openWith(askBodyKN(agr, zero32), rest, lid); !ok {
			return stranger()
		}
		cameUnder = zero32
	}
	if len(body) <= sigSize {
		return stranger()
	}
	text := body[:len(body)-sigSize]
	sig := body[len(body)-sigSize:]

	// Case 2.
	po, ok := readPayload(text)
	if !ok {
		return stranger()
	}
	// Case 3.
	pl, ok := wellFormed(po, head)
	if !ok {
		return stranger()
	}
	if zero {
		// Case 4, then case 5. The zero head keeps nothing.
		if w.reach == nil || !Verify(pl.by, text, sig) {
			return stranger()
		}
		out, _ := sealReply(lid, replyText(w.reach(pl.ask)), w.Sign)
		return out
	}
	// Case 6.
	if !held {
		return stranger()
	}
	// Case 7.
	var admitted bool
	if !h.spent {
		admitted = bytes.Equal(pl.by, h.PK)
	} else {
		admitted = bytes.Equal(pl.by, h.held) || h.vouched != nil && bytes.Equal(pl.by, h.vouched)
	}
	if !admitted {
		return stranger()
	}
	// Case 8.
	if !Verify(pl.by, text, sig) {
		return stranger()
	}
	// Case 9.
	if h.removed {
		return w.word(lid, "removed")
	}
	// Case 10.
	announces := pl.next != nil && !bytes.Equal(pl.next, h.PK) && !bytes.Equal(pl.next, pl.by)
	if !h.spent && !announces {
		return w.word(lid, "unannounced")
	}
	// Case 11. This door honours no number at or below the highest.
	if h.spent && pl.seq <= h.highest {
		return w.word(lid, "repeated")
	}

	// Cases 12 and 13: a choice.
	out, ragr := sealReply(lid, replyText(h.reach(pl.ask)), w.Sign)
	h.highest = pl.seq
	if !h.spent {
		h.spent = true
		h.held, h.vouched = pl.next, nil
	} else {
		h.held = pl.by
		switch {
		case announces:
			h.vouched = pl.next
		case h.vouched != nil && bytes.Equal(pl.by, h.vouched):
			h.vouched = nil
		}
	}
	h.open, h.offered = cameUnder, follow(cameUnder, ragr)
	return out
}

// readPayload is case 2: UTF-8 JSON, one object, no two own keys of one name.
func readPayload(text []byte) (*Obj, bool) {
	v, err := Parse(text)
	o, ok := v.(*Obj)
	return o, err == nil && ok
}

// wellFormed is case 3. It answers the payload it reads.
func wellFormed(o *Obj, head []byte) (*payload, bool) {
	pk := func(key string, nullable bool) ([]byte, bool) {
		v, present := o.M[key]
		if !present {
			return nil, false
		}
		if v == nil {
			return nil, nullable
		}
		s, ok := v.(string)
		if !ok || !hex64.MatchString(s) {
			return nil, false
		}
		b, _ := hex.DecodeString(s)
		return b, !isZero(b) // sixty-four zero hex is no pk
	}
	pl := &payload{}
	var ok bool
	if pl.to, ok = pk("to", true); !ok {
		return nil, false
	}
	if isZero(head) {
		if pl.to != nil {
			return nil, false
		}
	} else if !bytes.Equal(pl.to, head) {
		return nil, false
	}
	if pl.by, ok = pk("by", false); !ok {
		return nil, false
	}
	if pl.next, ok = pk("next", true); !ok {
		return nil, false
	}
	if pl.seq, ok = CountOf(o.M["seq"]); !ok {
		return nil, false
	}
	if mv, present := o.M["method"]; present {
		s, isStr := mv.(string)
		if !isStr {
			return nil, false
		}
		pl.ask.Method = &s
	}
	if av, present := o.M["args"]; present {
		if c, isC := av.(Container); !isC || !c.Object {
			return nil, false
		}
		pl.ask.Args = o.Raw["args"]
	}
	return pl, true
}
