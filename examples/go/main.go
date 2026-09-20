package main

import (
	"bufio"
	"bytes"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"sync"
)

// Kit is everything one stand program holds.
type Kit struct {
	mu        sync.Mutex // judges one arrival at a time, and guards all below
	wards     map[string]*Ward
	standings map[string]*Standing
	routes    map[string]*address
	listeners map[string]string // an address by scheme

	dmu   sync.Mutex
	dials map[string]*dialed

	omu sync.Mutex
	out *bufio.Writer
}

func NewKit() *Kit {
	return &Kit{
		wards:     map[string]*Ward{},
		standings: map[string]*Standing{},
		routes:    map[string]*address{},
		listeners: map[string]string{},
		dials:     map[string]*dialed{},
		out:       bufio.NewWriter(os.Stdout),
	}
}

// Arrive hands a box to the door of the ward under that pk, or answers nil
// where the kit stands no such ward.
func (k *Kit) Arrive(wardPK string, box []byte) []byte {
	k.mu.Lock()
	defer k.mu.Unlock()
	w := k.wards[wardPK]
	if w == nil {
		return nil
	}
	return w.Arrive(box)
}

func main() {
	k := NewKit()
	in := bufio.NewReader(os.Stdin)
	for {
		line, err := in.ReadBytes('\n')
		line = bytes.TrimSuffix(line, []byte("\n"))
		line = bytes.TrimSuffix(line, []byte("\r"))
		if len(line) > 0 {
			k.handle(line)
		}
		if err != nil {
			break
		}
	}
	k.omu.Lock()
	k.out.Flush()
	os.Exit(0)
}

func (k *Kit) answer(m map[string]any) {
	b, err := json.Marshal(m)
	if err != nil {
		fmt.Fprintln(os.Stderr, "stand: cannot write an answer:", err)
		return
	}
	k.omu.Lock()
	defer k.omu.Unlock()
	k.out.Write(b)
	k.out.WriteByte('\n')
	k.out.Flush()
}

// harness errors
const (
	eBadRequest = "bad request"
	eNoSuchOp   = "no such op"
	eWardStood  = "ward stood"
	eNoSuchWard = "no such ward"
	eNameHeld   = "name held"
	eNotReached = "not reached"
)

// request is one request line, its fields kept raw.
type request map[string]json.RawMessage

func (r request) has(k string) bool { _, ok := r[k]; return ok }

// str reads a string field. Absent, null and any other type are false.
func (r request) str(k string) (string, bool) {
	raw, ok := r[k]
	if !ok {
		return "", false
	}
	var s string
	if err := json.Unmarshal(raw, &s); err != nil || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return "", false
	}
	return s, true
}

// optStr reads a field that may be absent, and is a string when present.
func (r request) optStr(k string) (*string, bool) {
	if !r.has(k) {
		return nil, true
	}
	s, ok := r.str(k)
	return &s, ok
}

func (r request) hexOf(k string, n int) (string, bool) {
	s, ok := r.str(k)
	return s, ok && len(s) == n && isLowerHex(s)
}

// invitation reads the request's invitation, and the addresses its `at`
// holds that this kit can dial, in their order. An `at` that is not an
// array is absent, and an entry that is no address this kit stands is
// skipped.
func (r request) invitation() (*Standing, []*address, bool) {
	var fields map[string]json.RawMessage
	raw, ok := r["invitation"]
	if !ok || json.Unmarshal(raw, &fields) != nil || fields == nil {
		return nil, nil, false
	}
	f := request(fields)
	var inv Invitation
	for key, to := range map[string]*string{"ward": &inv.Ward, "heir": &inv.Heir, "secret": &inv.Secret, "lock": &inv.Lock} {
		if *to, ok = f.str(key); !ok {
			return nil, nil, false
		}
	}
	s, err := ParseInvitation(inv)
	if err != nil {
		return nil, nil, false
	}
	var entries []json.RawMessage
	json.Unmarshal(f["at"], &entries)
	var at []*address
	for _, e := range entries {
		var text string
		if json.Unmarshal(e, &text) != nil {
			continue
		}
		if a, ok := parseAddress(text); ok {
			at = append(at, a)
		}
	}
	return s, at, true
}

// asked reads method and args of an ask or a send. args is kept as the
// JSON text it came as, held to the value rules.
func (r request) asked() (method *string, args []byte, ok bool) {
	if method, ok = r.optStr("method"); !ok {
		return nil, nil, false
	}
	if raw, present := r["args"]; present {
		var buf bytes.Buffer
		if json.Compact(&buf, raw) != nil {
			return nil, nil, false
		}
		v, err := Parse(buf.Bytes())
		if _, isObj := v.(*Obj); err != nil || !isObj {
			return nil, nil, false
		}
		args = buf.Bytes()
	}
	return method, args, true
}

func (k *Kit) handle(line []byte) {
	var req request
	if err := json.Unmarshal(line, &req); err != nil || req == nil {
		k.answer(map[string]any{"id": nil, "error": eBadRequest})
		return
	}
	id, ok := req.str("id")
	if !ok {
		k.answer(map[string]any{"id": nil, "error": eBadRequest})
		return
	}
	fail := func(e string) { k.answer(map[string]any{"id": id, "error": e}) }
	op, ok := req.str("op")
	if !ok {
		fail(eBadRequest)
		return
	}
	reach := func() (Target, *string, bool) {
		name, ok := req.optStr("reach")
		if !ok || name == nil {
			return nil, name, ok
		}
		return Targets[*name], name, true
	}

	switch op {
	case "ward":
		seed, ok := req.str("seed")
		t, name, ok2 := reach()
		if !ok || !ok2 {
			fail(eBadRequest)
			return
		}
		if name != nil && t == nil {
			fail(eNotReached)
			return
		}
		w := NewWard(SeedOfText(seed))
		k.mu.Lock()
		defer k.mu.Unlock()
		if k.wards[w.PK()] != nil {
			fail(eWardStood)
			return
		}
		w.reach = t
		k.wards[w.PK()] = w
		k.answer(map[string]any{"id": id, "ward": w.PK()})

	case "invite":
		pk, ok := req.hexOf("ward", 128)
		name, ok2 := req.str("heir")
		t, rname, ok3 := reach()
		if !ok || !ok2 || !ok3 {
			fail(eBadRequest)
			return
		}
		k.mu.Lock()
		defer k.mu.Unlock()
		w := k.wards[pk]
		switch {
		case w == nil:
			fail(eNoSuchWard)
			return
		case rname != nil && t == nil:
			fail(eNotReached)
			return
		case rname == nil:
			t = Targets["echo"]
		}
		inv, err := w.Invite(name, t)
		if err != nil {
			fail(eNameHeld)
			return
		}
		for _, scheme := range schemes {
			if at, ok := k.listeners[scheme]; ok {
				inv.At = append(inv.At, at)
			}
		}
		k.answer(map[string]any{"id": id, "invitation": inv})

	case "release":
		pk, ok := req.hexOf("ward", 128)
		name, ok2 := req.str("heir")
		if !ok || !ok2 {
			fail(eBadRequest)
			return
		}
		k.mu.Lock()
		defer k.mu.Unlock()
		w := k.wards[pk]
		if w == nil {
			fail(eNoSuchWard)
			return
		}
		if w.Release(name) {
			k.answer(map[string]any{"id": id, "released": name})
		} else {
			k.answer(map[string]any{"id": id, "released": nil})
		}

	case "arrive":
		pk, ok := req.hexOf("ward", 128)
		boxHex, ok2 := req.str("box")
		if !ok || !ok2 || !isLowerHex(boxHex) {
			fail(eBadRequest)
			return
		}
		box, _ := hex.DecodeString(boxHex)
		k.mu.Lock()
		w := k.wards[pk]
		k.mu.Unlock()
		if w == nil {
			fail(eNoSuchWard)
			return
		}
		reply := k.Arrive(pk, box)
		if reply == nil {
			k.answer(map[string]any{"id": id, "reply": nil})
			return
		}
		k.answer(map[string]any{"id": id, "reply": hex.EncodeToString(reply)})

	case "ask", "send":
		pk, ok := req.hexOf("ward", 128)
		fresh, at, ok2 := req.invitation()
		method, args, ok3 := req.asked()
		if !ok || !ok2 || !ok3 {
			fail(eBadRequest)
			return
		}
		k.mu.Lock()
		if k.wards[pk] == nil {
			k.mu.Unlock()
			fail(eNoSuchWard)
			return
		}
		st := k.standing(pk, fresh)
		sent, err := st.Seal(method, args)
		if err != nil {
			k.mu.Unlock()
			fail(eBadRequest)
			return
		}
		if op == "ask" {
			st.last = sent
			k.mu.Unlock()
			k.answer(map[string]any{"id": id, "box": hex.EncodeToString(sent.Box)})
			return
		}
		wardPK := append(append([]byte{}, st.wardSignPK...), st.padlock...)
		// the route alone where there is one, else the invitation's at in its order
		if route, routed := k.routes[hex.EncodeToString(wardPK)]; routed {
			at = []*address{route}
		}
		k.mu.Unlock()
		go func() {
			reply := k.carryFirst(at, wardPK, sent.Box)
			k.mu.Lock()
			r := st.ReadReply(sent, reply)
			k.mu.Unlock()
			k.readAnswer(id, r)
		}()

	case "read":
		pk, ok := req.hexOf("ward", 128)
		fresh, _, ok2 := req.invitation()
		replyHex, ok3 := req.str("reply")
		isNull := bytes.Equal(bytes.TrimSpace(req["reply"]), []byte("null"))
		if !ok || !ok2 || !(isNull || ok3 && isLowerHex(replyHex)) {
			fail(eBadRequest)
			return
		}
		k.mu.Lock()
		defer k.mu.Unlock()
		if k.wards[pk] == nil {
			fail(eNoSuchWard)
			return
		}
		st := k.standing(pk, fresh)
		var box []byte
		if !isNull {
			box, _ = hex.DecodeString(replyHex)
		}
		sent := st.last
		st.last = nil
		k.readAnswer(id, st.ReadReply(sent, box))

	case "listen":
		scheme, ok := req.optStr("scheme")
		if !ok || scheme != nil && !slices.Contains(schemes, *scheme) {
			fail(eBadRequest)
			return
		}
		if scheme == nil {
			scheme = &schemes[0]
		}
		at, err := k.Listen(*scheme)
		if err != nil {
			fmt.Fprintln(os.Stderr, "stand: cannot listen:", err)
			fail(eBadRequest)
			return
		}
		k.answer(map[string]any{"id": id, "at": at})

	case "route":
		far, ok := req.hexOf("far", 128)
		text, ok2 := req.str("at")
		at, ok3 := parseAddress(text)
		if !ok || !ok2 || !ok3 {
			fail(eBadRequest)
			return
		}
		k.mu.Lock()
		k.routes[far] = at
		k.mu.Unlock()
		k.answer(map[string]any{"id": id, "routed": far})

	default:
		fail(eNoSuchOp)
	}
}

// standing answers the relation an asking ward holds on an invitation.
func (k *Kit) standing(asker string, fresh *Standing) *Standing {
	key := asker + hex.EncodeToString(fresh.wardSignPK) + hex.EncodeToString(fresh.padlock) + hex.EncodeToString(fresh.heirPK)
	if st := k.standings[key]; st != nil {
		return st
	}
	k.standings[key] = fresh
	return fresh
}

// readAnswer writes a read answer by hand, so an object of any nesting is
// carried as it was read.
func (k *Kit) readAnswer(id string, r Read) {
	if r.Kind != "object" {
		k.answer(map[string]any{"id": id, "read": readJSON(r)})
		return
	}
	seen := []byte("null")
	if r.Seen != nil {
		seen, _ = json.Marshal(*r.Seen)
	}
	idText, _ := json.Marshal(id)
	var line bytes.Buffer
	line.WriteString(`{"id":`)
	line.Write(idText)
	line.WriteString(`,"read":{"object":`)
	// the object's bytes as read, with any newline RFC 8259 allows between tokens made a space
	line.Write(bytes.Map(func(r rune) rune {
		if r == '\n' || r == '\r' {
			return ' '
		}
		return r
	}, r.Object))
	line.WriteString(`,"seen":`)
	line.Write(seen)
	line.WriteString("}}\n")
	k.omu.Lock()
	defer k.omu.Unlock()
	k.out.Write(line.Bytes())
	k.out.Flush()
}

func readJSON(r Read) map[string]any {
	switch r.Kind {
	case "quo":
		return map[string]any{"quo": r.Word}
	case "nothing":
		return map[string]any{"nothing": true}
	}
	return map[string]any{"silence": true}
}
