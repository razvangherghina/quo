package main

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAddresses(t *testing.T) {
	good := map[string]string{
		"tcp://127.0.0.1:9":         "127.0.0.1:9",
		"tcp://[::1]:65535":         "[::1]:65535",
		"tcp://example.org:1":       "example.org:1",
		"http://127.0.0.1:9/quo":    "127.0.0.1:9",
		"https://example.org/q?w=1": "example.org:443",
		"http://example.org":        "example.org:80",
		"ws://127.0.0.1:9/quo":      "127.0.0.1:9",
		"wss://[::1]/":              "[::1]:443",
	}
	for s, hostPort := range good {
		a, ok := parseAddress(s)
		if !ok || a.hostPort != hostPort {
			t.Errorf("%s: %v %+v", s, ok, a)
		}
	}
	bad := []string{
		"", "127.0.0.1:9", "zz://127.0.0.1:9", "tcp://127.0.0.1", "tcp://127.0.0.1:0",
		"tcp://127.0.0.1:65536", "tcp://127.0.0.1:9/", "tcp://127.0.0.1:9?", "tcp://u@127.0.0.1:9",
		"tcp:127.0.0.1:9", "http://127.0.0.1:9/quo#f", "ws://u@127.0.0.1:9/quo", "http:///quo",
		"http://127.0.0.1:9/a b", "http://127.0.0.1:9/%zz", "mailto:a@b",
	}
	for _, s := range bad {
		if _, ok := parseAddress(s); ok {
			t.Errorf("%s should be no address", s)
		}
	}
}

func TestInvitationAt(t *testing.T) {
	w := NewWard(SeedOfText("at"))
	inv, _ := w.Invite("h", Targets["echo"])
	read := func(at any) ([]*address, bool) {
		fields, _ := json.Marshal(inv)
		var m map[string]any
		json.Unmarshal(fields, &m)
		if at != nil {
			m["at"] = at
		}
		raw, _ := json.Marshal(map[string]any{"invitation": m})
		var r request
		json.Unmarshal(raw, &r)
		_, addrs, ok := r.invitation()
		return addrs, ok
	}
	for _, at := range []any{"tcp://127.0.0.1:9", 5, map[string]any{}, []any{}} {
		if addrs, ok := read(at); !ok || len(addrs) != 0 {
			t.Errorf("at %v: %v %d", at, ok, len(addrs))
		}
	}
	addrs, ok := read([]any{"zz://nowhere", 5, nil, "127.0.0.1:9", "ws://127.0.0.1:2/", "tcp://127.0.0.1:1"})
	if !ok || len(addrs) != 2 || addrs[0].form != "line" || addrs[1].form != "tcp" {
		t.Fatalf("%v %+v", ok, addrs)
	}
}

// relationOver runs a knock and an ask from one kit's ward to another's
// door, carried to an address, and answers what each read.
func relationOver(t *testing.T, k *Kit, w *Ward, at []*address) []Read {
	t.Helper()
	inv, err := w.Invite(t.Name()+hex.EncodeToString(draw(4)), Targets["echo"])
	if err != nil {
		t.Fatal(err)
	}
	st, err := ParseInvitation(*inv)
	if err != nil {
		t.Fatal(err)
	}
	wardPK, _ := hex.DecodeString(inv.Ward)
	var reads []Read
	for range 2 {
		m := "m"
		sent, err := st.Seal(&m, []byte(`{"a":1}`))
		if err != nil {
			t.Fatal(err)
		}
		reads = append(reads, st.ReadReply(sent, k.carryFirst(at, wardPK, sent.Box)))
	}
	return reads
}

func standing(t *testing.T) (*Kit, *Ward) {
	t.Helper()
	k := NewKit()
	w := NewWard(SeedOfText("carried"))
	k.wards[w.PK()] = w
	return k, w
}

func mustAddress(t *testing.T, s string) *address {
	t.Helper()
	a, ok := parseAddress(s)
	if !ok {
		t.Fatalf("%s is no address", s)
	}
	return a
}

func TestEverySchemeCarries(t *testing.T) {
	k, w := standing(t)
	for _, scheme := range schemes {
		at, err := k.Listen(scheme)
		if err != nil {
			t.Fatal(err)
		}
		if again, _ := k.Listen(scheme); again != at {
			t.Errorf("a second listen %s answered %s, not %s", scheme, again, at)
		}
		for i, r := range relationOver(t, k, w, []*address{mustAddress(t, at)}) {
			if r.Kind != "object" || string(r.Object) != `{"a":1}` {
				t.Errorf("%s ask %d read %+v", scheme, i, r)
			}
		}
	}
}

func TestAtIsTriedInOrder(t *testing.T) {
	k, w := standing(t)
	at, _ := k.Listen("http")
	closed, _ := net.Listen("tcp", "127.0.0.1:0")
	dead := "tcp://" + closed.Addr().String()
	closed.Close()
	for i, r := range relationOver(t, k, w, []*address{mustAddress(t, dead), mustAddress(t, at)}) {
		if r.Kind != "object" {
			t.Errorf("ask %d read %+v", i, r)
		}
	}
	if reply := k.carryFirst(nil, make([]byte, 64), draw(100)); reply != nil {
		t.Error("no address delivers nothing")
	}
}

func TestAClosedLineIsNothingAndIsDialedAgain(t *testing.T) {
	k, w := standing(t)
	l, _ := net.Listen("tcp", "127.0.0.1:0")
	defer l.Close()
	go func() {
		c, _ := l.Accept()
		readFrame(c)
		c.Close() // the ask in flight is answered by nothing
		k.acceptTCP(l)
	}()
	a := mustAddress(t, "tcp://"+l.Addr().String())
	pk, _ := hex.DecodeString(w.PK())
	if reply := k.carry(a, pk, draw(100)); reply != nil {
		t.Fatal("a closed line answered a reply")
	}
	if reply := k.carry(a, pk, draw(100)); len(reply) != 128 {
		t.Fatalf("the line dialed again answered %d bytes", len(reply))
	}
}

func TestInviteWritesListenersTcpFirst(t *testing.T) {
	k, w := standing(t)
	k.Listen("ws")
	k.Listen("tcp")
	var buf bytes.Buffer
	k.out.Reset(&buf)
	k.handle([]byte(`{"id":"1","op":"invite","ward":"` + w.PK() + `","heir":"h"}`))
	var a struct{ Invitation Invitation }
	if err := json.Unmarshal(buf.Bytes(), &a); err != nil {
		t.Fatal(err, buf.String())
	}
	if at := a.Invitation.At; len(at) != 2 || at[0] != k.listeners["tcp"] || at[1] != k.listeners["ws"] {
		t.Fatalf("at %v", at)
	}
}

func TestOverTLS(t *testing.T) {
	k, w := standing(t)
	for scheme, h := range map[string]http.HandlerFunc{"https": k.servePost, "wss": k.serveLine} {
		srv := httptest.NewTLSServer(h)
		tlsConfig.RootCAs = srv.Client().Transport.(*http.Transport).TLSClientConfig.RootCAs
		at := scheme + strings.TrimPrefix(srv.URL, "https") + "/quo?w=1"
		for i, r := range relationOver(t, k, w, []*address{mustAddress(t, at)}) {
			if r.Kind != "object" {
				t.Errorf("%s ask %d read %+v", scheme, i, r)
			}
		}
		srv.Close()
	}
	tlsConfig.RootCAs = nil
}

func TestPostListenerRefuses(t *testing.T) {
	k, w := standing(t)
	at, _ := k.Listen("http")
	pk, _ := hex.DecodeString(w.PK())
	for _, c := range []struct {
		method string
		body   []byte
		status int
	}{
		{http.MethodGet, nil, http.StatusMethodNotAllowed},
		{http.MethodPost, nil, http.StatusBadRequest},
		{http.MethodPost, pk, http.StatusBadRequest},
		{http.MethodPost, make([]byte, maxPost+1), http.StatusRequestEntityTooLarge},
		{http.MethodPost, append(make([]byte, 64), 1), http.StatusNoContent},
		{http.MethodPost, append(pk, 1), http.StatusOK},
	} {
		req, _ := http.NewRequest(c.method, at, bytes.NewReader(c.body))
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		resp.Body.Close()
		if resp.StatusCode != c.status {
			t.Errorf("%s of %d bytes: status %d, not %d", c.method, len(c.body), resp.StatusCode, c.status)
		}
	}
}

func TestHeldLine(t *testing.T) {
	k, w := standing(t)
	at, _ := k.Listen("ws")
	req, _ := http.NewRequest(http.MethodGet, "http"+strings.TrimPrefix(at, "ws"), nil)
	for name, v := range map[string]string{"Upgrade": "websocket", "Connection": "Upgrade", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ=="} {
		req.Header.Set(name, v)
	}
	if resp, err := http.DefaultClient.Do(req); err != nil || resp.StatusCode == http.StatusSwitchingProtocols {
		t.Fatalf("a line offering no subprotocol was opened: %v", err)
	}

	open := func() *wsConn {
		a := mustAddress(t, at)
		c, err := reach(a)
		if err != nil {
			t.Fatal(err)
		}
		ws, err := wsDial(c, a)
		if err != nil {
			t.Fatal(err)
		}
		return ws
	}
	pk, _ := hex.DecodeString(w.PK())
	ws := open()
	ws.write(opPing, []byte("p"))
	ws.write(opBinary, frameBody(kindNothing, 3))                          // read, nothing said
	ws.write(opBinary, frameBody(kindAsk, 9, make([]byte, 64), draw(100))) // no ward: nothing
	f, err := ws.next()
	if err != nil || f.kind != kindNothing || f.id != 9 {
		t.Fatalf("%+v %v", f, err)
	}
	// an ask split across two frames, masked by a zero key, is one message
	body := frameBody(kindAsk, 10, pk, draw(200))
	ws.c.Write(append([]byte{opBinary, 0x80 | 30, 0, 0, 0, 0}, body[:30]...))
	ws.c.Write(append([]byte{0x80 | opCont, 0x80 | 126, byte((len(body) - 30) >> 8), byte(len(body) - 30), 0, 0, 0, 0}, body[30:]...))
	if f, err := ws.next(); err != nil || f.kind != kindReply || f.id != 10 {
		t.Fatalf("%+v %v", f, err)
	}

	for name, send := range map[string]func(*wsConn){
		"a text message":    func(c *wsConn) { c.write(opText, []byte("x")) },
		"a short message":   func(c *wsConn) { c.write(opBinary, []byte{0, 0, 0}) },
		"an unknown kind":   func(c *wsConn) { c.write(opBinary, frameBody(3, 1)) },
		"a long message":    func(c *wsConn) { c.write(opBinary, make([]byte, maxBody+1)) },
		"an unmasked frame": func(c *wsConn) { c.mask = false; c.write(opBinary, frameBody(kindNothing, 1)) },
	} {
		c := open()
		send(c)
		if _, err := c.next(); err == nil {
			t.Errorf("after %s, the line stands", name)
		}
	}
}
