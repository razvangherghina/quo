// Command subject is a Quo ground another language can knock on, and knock
// with. It exists so a kit written from the law in one language can be shown
// to speak to a kit written from the law in another, with neither side ever
// reading the other's source.
//
// Two modes.
//
// Serve hangs a door on the common carriage, holds one granted being, mints an
// invitation, and prints one line of plain facts on startup — everything a
// stranger needs to speak to it and nothing about how it is built. It does not
// publish the being: the invitation does not even name it, so a stranger
// rotates, describes, and finds what it now reaches.
//
// Speak takes another door's facts the same way and sends it a real message,
// reporting what came back.
//
// The facts line is JSON because a hint is an opaque string the protocol never
// parses, and a space-separated line cannot carry one that holds a space. It
// is the only line this command writes that is meant to be read by a machine
// looking for it: every line it prints is one JSON object carrying the member
// "quo".
package main

import (
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"

	"quo.systems/kit/arithmetic"
	"quo.systems/kit/carriage"
	"quo.systems/kit/envelope"
	"quo.systems/kit/warden"
	"quo.systems/kit/wire"
)

// Counter is the class the door holds. A stranger is told none of this: it
// learns the digest from a describe and the text by asking the warden for the
// blueprint that hashes to it, which is the path the law already gives.
//
// Both fields ride as one `int` — eight bytes, signed two's complement, most
// significant first — so a kit in any language can call them without a codec.
const Counter = `Counter
  bump(by int) int
  count() int
`

func main() {
	if len(os.Args) < 2 {
		fail(errors.New("usage: subject serve|speak"))
	}
	var err error
	switch os.Args[1] {
	case "serve":
		err = serve(os.Args[2:])
	case "speak":
		err = speak(os.Args[2:])
	default:
		err = fmt.Errorf("no mode named %q", os.Args[1])
	}
	if err != nil {
		fail(err)
	}
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, "subject:", err)
	os.Exit(1)
}

// facts is what a stranger is owed and no more: the five things a holder
// holds. The law never says in what form a door publishes them, so this
// shape is this subject's own and the far side is given it verbatim.
type facts struct {
	Quo        int      `json:"quo"`
	Role       string   `json:"role"`
	Warden     string   `json:"warden"`
	Commitment string   `json:"commitment"`
	Padlock    string   `json:"padlock"`
	Heir       string   `json:"heir"`
	HeirSecret string   `json:"heirSecret"`
	Hints      []string `json:"hints"`
}

func serve(args []string) error {
	fs := flag.NewFlagSet("serve", flag.ContinueOnError)
	listen := fs.String("listen", "127.0.0.1:0", "where the door hangs")
	limit := fs.Int64("limit", 1<<20, "what this door will take, the one fact the law makes a warden publish")
	if err := fs.Parse(args); err != nil {
		return err
	}

	w, err := stand(*limit)
	if err != nil {
		return err
	}
	being, err := w.Hold(Counter, &counter{}, warden.Keys{Secret: draw(), HeirSecret: draw()})
	if err != nil {
		return err
	}

	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		return err
	}
	// The hint is the whole address, posted to exactly as given. Plain HTTP
	// here: the law names HTTPS as the common carriage and does not say
	// whether the scheme is part of the carriage or part of the road, and a
	// subject driven on loopback has nothing to gain from a certificate.
	hint := "http://" + ln.Addr().String() + "/"

	inv, err := w.Grant(being, warden.Keys{Secret: draw(), HeirSecret: draw()}, w.Padlock(), []string{hint})
	if err != nil {
		return err
	}
	if err := emit(facts{
		Quo:        1,
		Role:       "door",
		Warden:     hexOf(inv.Warden),
		Commitment: hexOf(inv.Commitment),
		Padlock:    hexOf(inv.Padlock),
		Heir:       hexOf(inv.Heir),
		HeirSecret: hexOf(inv.HeirSecret),
		Hints:      inv.Hints,
	}); err != nil {
		return err
	}

	return http.Serve(ln, carriage.Handler(w.Limit(), func(message []byte) []byte {
		// Every draw of randomness is taken as an argument rather than reached
		// for, so the host draws them here, once per judgment.
		reply, err := w.Judge(warden.Draws{Ephemeral: draw(), Heir: draw()}, message)
		if err != nil {
			// Silence is the whole of every refusal, and the reason never
			// travels. It goes to this host's own stderr and nowhere else.
			fmt.Fprintln(os.Stderr, "subject: refused:", err)
			return nil
		}
		return reply
	}))
}

func speak(args []string) error {
	fs := flag.NewFlagSet("speak", flag.ContinueOnError)
	beingHex := fs.String("being", "", `the pk of the being to address; "door" is the far warden's own public being, whose pk is its name; "auto" is the one being the describe found that is not the door's own; empty names no being at all, which with a method named is silence`)
	method := fs.String("method", "", "the field named on it, or empty for a describe")
	argsHex := fs.String("args", "", "that field's arguments, already encoded, as hex")
	texts := fs.Bool("blueprint", false, "ask the far warden for the text of every class the describe named")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if fs.NArg() != 1 {
		return errors.New("usage: subject speak [flags] <facts-json>")
	}
	var f facts
	if err := json.Unmarshal([]byte(fs.Arg(0)), &f); err != nil {
		return err
	}
	inv, err := f.invitation()
	if err != nil {
		return err
	}

	// A caller is always a being, and always one its own warden holds — so
	// this mode is a whole ground too, not a bare key.
	w, err := stand(1 << 20)
	if err != nil {
		return err
	}
	w.Stand(w.Self(), inv, inv.HeirSecret)

	// Whoever minted a voice has seen its keys, so the holder's first act is a
	// rotate-and-ask to a key nobody else has ever seen. It asks nothing, and
	// what comes back is what this voice now stands at.
	next := draw()
	estate, err := exchange(w, inv.Warden, "describe", warden.Reach{
		Far:       inv.Warden,
		Allowance: envelope.Allowance{Time: 5000, Hops: 8},
		NextHeir:  &next,
	})
	if err != nil {
		return err
	}
	if estate == nil {
		return nil // the door answered silence, and it has already been reported
	}
	classes, err := readEstate(estate.data)
	if err != nil {
		return err
	}
	if err := emit(estate.with(map[string]any{"classes": classes})); err != nil {
		return err
	}

	if *texts {
		for _, c := range classes {
			digest, err := keyOf(c.Digest)
			if err != nil {
				return err
			}
			blob, err := wire.Encode(warden.Own, warden.ArgType(warden.FieldBlueprint), digest)
			if err != nil {
				return err
			}
			// blueprint is a field on the far door's public being, whose pk is
			// that warden's own name — reached by naming it, like every other
			// field on every other being.
			door := inv.Warden
			step, err := exchange(w, inv.Warden, "blueprint", ask(inv.Warden, &door, &envelope.Method{
				Name: warden.FieldBlueprint, Args: blob,
			}))
			if err != nil {
				return err
			}
			if step == nil {
				continue
			}
			text, err := readOptionalText(step.data)
			if err != nil {
				return err
			}
			if err := emit(step.with(map[string]any{"digest": c.Digest, "text": text})); err != nil {
				return err
			}
		}
	}

	if *method == "" {
		return nil
	}
	var being *[32]byte
	switch *beingHex {
	case "":
	case "door":
		door := inv.Warden
		being = &door
	case "auto":
		// The invitation does not name the being, so a holder finds it by
		// describing. The one class every estate carries is the Warden's own,
		// whose digest is the same on every ground in the world; what is left
		// is what this voice was granted.
		b, err := granted(classes)
		if err != nil {
			return err
		}
		being = &b
	default:
		b, err := keyOf(*beingHex)
		if err != nil {
			return err
		}
		being = &b
	}
	blob, err := hex.DecodeString(*argsHex)
	if err != nil {
		return err
	}
	step, err := exchange(w, inv.Warden, "ask", ask(inv.Warden, being, &envelope.Method{
		Name: *method, Args: blob,
	}))
	if err != nil || step == nil {
		return err
	}
	return emit(step.with(map[string]any{"data": hex.EncodeToString(step.data)}))
}

func ask(far [32]byte, being *[32]byte, m *envelope.Method) warden.Reach {
	return warden.Reach{
		Far:       far,
		Being:     being,
		Method:    m,
		Allowance: envelope.Allowance{Time: 5000, Hops: 8},
	}
}

// step is one exchange: the number it spent, the door that signed the answer,
// and the answer's data.
type step struct {
	name string
	seq  int64
	from [32]byte
	data []byte
}

func (s *step) with(extra map[string]any) map[string]any {
	out := map[string]any{
		"quo": 1, "step": s.name, "seq": s.seq, "warden": hexOf(s.from),
	}
	for k, v := range extra {
		out[k] = v
	}
	return out
}

// exchange composes one utterance, puts it down the roads the far door
// offered, and opens what came back. A nil step is silence, which is a door
// speaking and not an error.
func exchange(w *warden.Warden, far [32]byte, name string, r warden.Reach) (*step, error) {
	message, seq, err := w.Ask(draw(), r)
	if err != nil {
		return nil, err
	}
	_, _, _, hints, ok := w.Relation(far)
	if !ok {
		return nil, errors.New("no relation with that house")
	}
	reply, err := carriage.Caller{}.Send(hints, message)
	if err != nil {
		return nil, err
	}
	if reply == nil {
		return nil, emit(map[string]any{"quo": 1, "step": name, "seq": seq, "silence": true})
	}
	answer, err := w.Hear(w.PadlockSecret(), reply)
	if err != nil {
		return nil, err
	}
	if answer.Seq != seq {
		return nil, fmt.Errorf("the answer names ask %d, not %d", answer.Seq, seq)
	}
	return &step{name: name, seq: seq, from: answer.Warden, data: answer.Data}, nil
}

// class is one line of a describe, flattened for the far side: a digest and
// the pks under it, in the order the warden derived.
type class struct {
	Digest string   `json:"digest"`
	Beings []string `json:"beings"`
}

// granted picks the one being an estate holds that is not the door's own
// public being. It refuses anything else rather than choosing: which of two
// granted beings was meant is the caller's to say.
func granted(classes []class) ([32]byte, error) {
	own := hexOf(warden.Digest)
	var found []string
	for _, c := range classes {
		if c.Digest == own {
			continue
		}
		found = append(found, c.Beings...)
	}
	if len(found) != 1 {
		return [32]byte{}, fmt.Errorf("the estate holds %d beings besides the door's own", len(found))
	}
	return keyOf(found[0])
}

func readEstate(data []byte) ([]class, error) {
	e, err := warden.DecodeEstate(data)
	if err != nil {
		return nil, err
	}
	out := make([]class, 0, len(e.Classes))
	for _, c := range e.Classes {
		beings := make([]string, 0, len(c.Beings))
		for _, h := range c.Beings {
			beings = append(beings, hexOf(h.Being))
		}
		out = append(out, class{Digest: hexOf(c.Digest), Beings: beings})
	}
	return out, nil
}

// readOptionalText reads a `text?` answer: one byte saying present or absent,
// and the value only when present.
func readOptionalText(data []byte) (any, error) {
	t, ok := warden.AnswerType(warden.FieldBlueprint)
	if !ok {
		return nil, errors.New("that field answers nothing")
	}
	return wire.Decode(warden.Own, t, data)
}

func (f facts) invitation() (wire.Invitation, error) {
	var inv wire.Invitation
	for _, pair := range []struct {
		into *[32]byte
		from string
	}{
		{&inv.Warden, f.Warden}, {&inv.Commitment, f.Commitment}, {&inv.Padlock, f.Padlock},
		{&inv.Heir, f.Heir}, {&inv.HeirSecret, f.HeirSecret},
	} {
		k, err := keyOf(pair.from)
		if err != nil {
			return wire.Invitation{}, err
		}
		*pair.into = k
	}
	if len(f.Hints) == 0 {
		return wire.Invitation{}, errors.New("those facts carry no road")
	}
	inv.Hints = f.Hints
	return inv, nil
}

// stand puts up a whole ground. Every key is a fresh draw: nothing here is
// pinned, because nothing here is a vector.
func stand(limit int64) (*warden.Warden, error) {
	name := draw()
	return warden.New(warden.Founding{
		NameSecret:     name,
		HeirCommitment: arithmetic.Commit(arithmetic.SigningKey(name), arithmetic.SigningKey(draw())),
		PadlockSecret:  draw(),
		Limit:          limit,
		// A clock is taken as an argument for the same reason a draw of
		// randomness is. This host lends the warden the wall clock in
		// milliseconds; only differences are ever taken of it.
		Clock: func() int64 { return time.Now().UnixMilli() },
	})
}

// counter is an ordinary object. It never learns it has an address, judges
// nothing, and sees no key.
type counter struct{ total int64 }

func (c *counter) Invoke(call warden.Call) ([]byte, error) {
	args := call.Args
	switch call.Method {
	case "bump":
		if len(args) != 8 {
			// Bytes left after the declared arguments are the being's to
			// refuse, never the warden's.
			return nil, errors.New("bump takes one int")
		}
		c.total += int64(binary.BigEndian.Uint64(args))
	case "count":
		if len(args) != 0 {
			return nil, errors.New("count takes nothing")
		}
	default:
		return nil, errors.New("the blueprint declares no such field")
	}
	out := make([]byte, 8)
	binary.BigEndian.PutUint64(out, uint64(c.total))
	return out, nil
}

func draw() [32]byte {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		fail(err)
	}
	return b
}

func hexOf(k [32]byte) string { return hex.EncodeToString(k[:]) }

func keyOf(s string) ([32]byte, error) {
	b, err := hex.DecodeString(s)
	if err != nil {
		return [32]byte{}, err
	}
	if len(b) != 32 {
		return [32]byte{}, fmt.Errorf("a key is 32 bytes, got %d", len(b))
	}
	return [32]byte(b), nil
}

// emit writes one line of JSON to stdout and flushes it, so a driver reading
// this process line by line sees it before the process blocks.
func emit(v any) error {
	b, err := json.Marshal(v)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintln(os.Stdout, string(b))
	return err
}
