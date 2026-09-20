package main

import (
	"crypto/tls"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"slices"
	"sync"
	"time"
)

// The frames of CARRIER-TCP.md, which the held line of CARRIER-WEB.md
// carries without their length.
const (
	kindAsk     = 0
	kindReply   = 1
	kindNothing = 2
	maxBody     = 1048645
)

const (
	dialWait = 5 * time.Second  // how long a dialer waits to reach an address
	sendWait = 10 * time.Second // how long a dialer waits for the answer to an ask
)

// tlsConfig is what https and wss dial with.
var tlsConfig = &tls.Config{}

type frame struct {
	kind byte
	id   uint32
	pk   []byte // an ask's ward pk, 64 raw bytes
	box  []byte
}

var errNotFrame = errors.New("not a frame")

// checkHead says whether a body of n bytes that begins with kind can be a
// frame, before the rest of it is read.
func checkHead(n int, kind byte) error {
	switch {
	case n > maxBody || n < 5,
		kind > kindNothing,
		kind == kindAsk && n < 69,
		kind == kindNothing && n != 5:
		return errNotFrame
	}
	return nil
}

// parseBody reads one frame body: kind, id and rest.
func parseBody(b []byte) (*frame, error) {
	if len(b) < 5 {
		return nil, errNotFrame
	}
	if err := checkHead(len(b), b[0]); err != nil {
		return nil, err
	}
	f := &frame{kind: b[0], id: binary.BigEndian.Uint32(b[1:5])}
	switch f.kind {
	case kindAsk:
		f.pk, f.box = b[5:69], b[69:]
	case kindReply:
		f.box = b[5:]
	}
	return f, nil
}

// readFrame reads one length-prefixed frame. It answers errNotFrame as soon
// as the bytes say they are no frame, before reading what follows them.
func readFrame(r io.Reader) (*frame, error) {
	var head [4]byte
	if _, err := io.ReadFull(r, head[:]); err != nil {
		return nil, err
	}
	n := int(binary.BigEndian.Uint32(head[:]))
	if n > maxBody || n < 5 {
		return nil, errNotFrame
	}
	body := make([]byte, n)
	if _, err := io.ReadFull(r, body[:1]); err != nil {
		return nil, err
	}
	if err := checkHead(n, body[0]); err != nil {
		return nil, err
	}
	if _, err := io.ReadFull(r, body[1:]); err != nil {
		return nil, err
	}
	return parseBody(body)
}

// frameBody writes a frame body, with no length in front.
func frameBody(kind byte, id uint32, parts ...[]byte) []byte {
	b := []byte{kind, 0, 0, 0, 0}
	binary.BigEndian.PutUint32(b[1:], id)
	return slices.Concat(append([][]byte{b}, parts...)...)
}

// withLength puts a frame body's length in front of it.
func withLength(body []byte) []byte {
	return slices.Concat(binary.BigEndian.AppendUint32(nil, uint32(len(body))), body)
}

// ---- the listeners ----

// schemes is the order a program's listeners are written in an invitation's at.
var schemes = []string{"tcp", "http", "ws"}

// Listen holds one listener of a scheme, on a loopback port the system
// chooses, that answers for every ward the kit stands. A second Listen of
// one scheme answers the same address.
func (k *Kit) Listen(scheme string) (string, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if at, ok := k.listeners[scheme]; ok {
		return at, nil
	}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	at := scheme + "://" + l.Addr().String()
	switch scheme {
	case "tcp":
		go k.acceptTCP(l)
	case "http":
		at += "/"
		go serveHTTP(l, k.servePost)
	case "ws":
		at += "/"
		go serveHTTP(l, k.serveLine)
	}
	k.listeners[scheme] = at
	return at, nil
}

func (k *Kit) acceptTCP(l net.Listener) {
	for {
		c, err := l.Accept()
		if err != nil {
			return
		}
		go func() {
			defer c.Close()
			var wmu sync.Mutex
			k.serveFrames(func() (*frame, error) { return readFrame(c) }, func(body []byte) {
				wmu.Lock()
				defer wmu.Unlock()
				c.Write(withLength(body))
			})
		}()
	}
}

// serveFrames answers every ask a line carries until the line ends or
// carries something that is no frame. write sends one frame body back.
func (k *Kit) serveFrames(next func() (*frame, error), write func(body []byte)) {
	for {
		f, err := next()
		if err != nil {
			return
		}
		if f.kind != kindAsk {
			continue // read, and nothing is said to it
		}
		go func() {
			if reply := k.Arrive(hex.EncodeToString(f.pk), f.box); reply != nil {
				write(frameBody(kindReply, f.id, reply))
			} else {
				write(frameBody(kindNothing, f.id))
			}
		}()
	}
}

// ---- the dialer ----

// A dialed is one line a dialer holds to an address, tcp or held.
type dialed struct {
	send    func(body []byte) error
	close   func()
	mu      sync.Mutex
	nextID  uint32
	waiting map[uint32]chan *frame
	closed  bool
}

// reach opens a connection to an address, inside TLS where it says so.
func reach(a *address) (net.Conn, error) {
	c, err := net.DialTimeout("tcp", a.hostPort, dialWait)
	if err != nil || !a.secure {
		return c, err
	}
	conf := tlsConfig.Clone()
	conf.ServerName = a.url.Hostname()
	t := tls.Client(c, conf)
	t.SetDeadline(time.Now().Add(dialWait))
	if err := t.Handshake(); err != nil {
		c.Close()
		return nil, err
	}
	t.SetDeadline(time.Time{})
	return t, nil
}

// line answers the open line to an address, dialing one when none stands.
func (k *Kit) line(a *address) (*dialed, error) {
	k.dmu.Lock()
	defer k.dmu.Unlock()
	if d := k.dials[a.text]; d != nil {
		d.mu.Lock()
		closed := d.closed
		d.mu.Unlock()
		if !closed {
			return d, nil
		}
	}
	c, err := reach(a)
	if err != nil {
		return nil, err
	}
	d := &dialed{waiting: map[uint32]chan *frame{}, close: func() { c.Close() }}
	var next func() (*frame, error)
	if a.form == "tcp" {
		var wmu sync.Mutex
		d.send = func(body []byte) error {
			wmu.Lock()
			defer wmu.Unlock()
			_, err := c.Write(withLength(body))
			return err
		}
		next = func() (*frame, error) { return readFrame(c) }
	} else {
		ws, err := wsDial(c, a)
		if err != nil {
			c.Close()
			return nil, err
		}
		d.send = func(body []byte) error { return ws.write(opBinary, body) }
		next = ws.next
	}
	k.dials[a.text] = d
	go d.read(next)
	return d, nil
}

func (d *dialed) read(next func() (*frame, error)) {
	defer d.shut()
	for {
		f, err := next()
		if err != nil {
			return
		}
		if f.kind == kindAsk {
			continue // an ask at a dialer is read, and nothing is said to it
		}
		d.mu.Lock()
		ch := d.waiting[f.id]
		delete(d.waiting, f.id)
		d.mu.Unlock()
		if ch != nil {
			ch <- f
		}
	}
}

// shut closes the line; every ask in flight on it is answered nothing.
func (d *dialed) shut() {
	d.close()
	d.mu.Lock()
	defer d.mu.Unlock()
	d.closed = true
	for id, ch := range d.waiting {
		close(ch)
		delete(d.waiting, id)
	}
}

// carryFirst tries the addresses in order, one after another, until one
// delivers, and answers that reply's box, or nil when none delivered.
func (k *Kit) carryFirst(at []*address, wardPK, box []byte) []byte {
	for _, a := range at {
		if reply := k.carry(a, wardPK, box); reply != nil {
			return reply
		}
	}
	return nil
}

// carry sends an ask's box to a ward pk at an address, and answers the
// reply's box, or nil for nothing.
func (k *Kit) carry(a *address, wardPK, box []byte) []byte {
	if a.form == "post" {
		return post(a, wardPK, box)
	}
	d, err := k.line(a)
	if err != nil {
		return nil
	}
	ch := make(chan *frame, 1)
	d.mu.Lock()
	if d.closed {
		d.mu.Unlock()
		return nil
	}
	d.nextID++
	id := d.nextID
	d.waiting[id] = ch
	d.mu.Unlock()

	if err := d.send(frameBody(kindAsk, id, wardPK, box)); err != nil {
		d.shut()
		return nil
	}
	t := time.NewTimer(sendWait)
	defer t.Stop()
	select {
	case f, ok := <-ch:
		if !ok || f.kind != kindReply {
			return nil
		}
		return f.box
	case <-t.C:
		d.mu.Lock()
		delete(d.waiting, id)
		d.mu.Unlock()
		return nil
	}
}
