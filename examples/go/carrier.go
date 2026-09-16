package main

import (
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"sync"
	"time"
)

// Quo over TCP: the frames of CARRIER-TCP.md.
const (
	kindAsk     = 0
	kindReply   = 1
	kindNothing = 2
	maxBody     = 1048645
)

// sendWait is how long a dialer waits for the answer to an ask.
const sendWait = 10 * time.Second

type frame struct {
	kind byte
	id   uint32
	pk   []byte // an ask's ward pk, 64 raw bytes
	box  []byte
}

var errNotFrame = errors.New("not a frame")

// readFrame reads one frame. It answers errNotFrame as soon as the bytes say
// they are no frame, before reading what follows them.
func readFrame(r io.Reader) (*frame, error) {
	var head [5]byte
	if _, err := io.ReadFull(r, head[:4]); err != nil {
		return nil, err
	}
	n := binary.BigEndian.Uint32(head[:4])
	if n > maxBody || n < 5 {
		return nil, errNotFrame
	}
	if _, err := io.ReadFull(r, head[4:5]); err != nil {
		return nil, err
	}
	kind := head[4]
	switch {
	case kind > kindNothing,
		kind == kindAsk && n < 69,
		kind == kindNothing && n != 5:
		return nil, errNotFrame
	}
	rest := make([]byte, n-1)
	if _, err := io.ReadFull(r, rest); err != nil {
		return nil, err
	}
	f := &frame{kind: kind, id: binary.BigEndian.Uint32(rest[:4])}
	switch kind {
	case kindAsk:
		f.pk, f.box = rest[4:68], rest[68:]
	case kindReply:
		f.box = rest[4:]
	}
	return f, nil
}

func frameBytes(kind byte, id uint32, parts ...[]byte) []byte {
	n := 5
	for _, p := range parts {
		n += len(p)
	}
	b := make([]byte, 9, 4+n)
	binary.BigEndian.PutUint32(b[0:4], uint32(n))
	b[4] = kind
	binary.BigEndian.PutUint32(b[5:9], id)
	for _, p := range parts {
		b = append(b, p...)
	}
	return b
}

// ---- the listener ----

// Listen holds one listener that answers for every ward the kit stands.
func (k *Kit) Listen() (string, error) {
	k.mu.Lock()
	defer k.mu.Unlock()
	if k.listener != nil {
		return k.listener.Addr().String(), nil
	}
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "", err
	}
	k.listener = l
	go func() {
		for {
			c, err := l.Accept()
			if err != nil {
				return
			}
			go k.serve(c)
		}
	}()
	return l.Addr().String(), nil
}

func (k *Kit) serve(c net.Conn) {
	defer c.Close()
	var wmu sync.Mutex
	write := func(b []byte) {
		wmu.Lock()
		defer wmu.Unlock()
		c.Write(b)
	}
	for {
		f, err := readFrame(c)
		if err != nil {
			return // bytes that are no frame, or the stream ended
		}
		if f.kind != kindAsk {
			continue // read, and nothing is said to it
		}
		go func() {
			reply := k.Arrive(hex.EncodeToString(f.pk), f.box)
			if reply == nil {
				write(frameBytes(kindNothing, f.id))
				return
			}
			write(frameBytes(kindReply, f.id, reply))
		}()
	}
}

// ---- the dialer ----

type dialed struct {
	c       net.Conn
	wmu     sync.Mutex
	mu      sync.Mutex
	nextID  uint32
	waiting map[uint32]chan *frame
	closed  bool
}

func (k *Kit) conn(at string) (*dialed, error) {
	k.dmu.Lock()
	defer k.dmu.Unlock()
	if d := k.dials[at]; d != nil {
		d.mu.Lock()
		closed := d.closed
		d.mu.Unlock()
		if !closed {
			return d, nil
		}
	}
	c, err := net.DialTimeout("tcp", at, 5*time.Second)
	if err != nil {
		return nil, err
	}
	d := &dialed{c: c, waiting: map[uint32]chan *frame{}}
	k.dials[at] = d
	go d.read()
	return d, nil
}

func (d *dialed) read() {
	defer d.shut()
	for {
		f, err := readFrame(d.c)
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

// shut closes the connection; every ask in flight on it is answered nothing.
func (d *dialed) shut() {
	d.c.Close()
	d.mu.Lock()
	defer d.mu.Unlock()
	d.closed = true
	for id, ch := range d.waiting {
		close(ch)
		delete(d.waiting, id)
	}
}

// carry sends an ask's box to a ward pk at an address, and answers the
// reply's box, or nil for nothing.
func (k *Kit) carry(at string, wardPK []byte, box []byte) []byte {
	d, err := k.conn(at)
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

	d.wmu.Lock()
	_, err = d.c.Write(frameBytes(kindAsk, id, wardPK, box))
	d.wmu.Unlock()
	if err != nil {
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
