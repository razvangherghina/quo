package main

import (
	"bufio"
	"bytes"
	"crypto/sha1"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"net/http"
	"slices"
	"strings"
	"sync"
	"time"
)

// Quo over the web: the post and the held line of CARRIER-WEB.md.

// A post's body is a ward pk and a box: sixty-five bytes at the least, and
// a box of the size at the most.
const (
	minPost = 64 + 1
	maxPost = 64 + boxSize
)

func serveHTTP(l net.Listener, h http.HandlerFunc) {
	(&http.Server{Handler: h}).Serve(l)
}

// ---- the post ----

func (k *Kit) servePost(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxPost))
	var tooLong *http.MaxBytesError
	switch {
	case errors.As(err, &tooLong):
		w.WriteHeader(http.StatusRequestEntityTooLarge)
		return
	case err != nil, len(body) < minPost:
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	reply := k.Arrive(hex.EncodeToString(body[:64]), body[64:])
	if reply == nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.WriteHeader(http.StatusOK)
	w.Write(reply)
}

var postClient = &http.Client{
	Transport: &http.Transport{
		DialContext:         (&net.Dialer{Timeout: dialWait}).DialContext,
		TLSClientConfig:     tlsConfig,
		TLSHandshakeTimeout: dialWait,
	},
	// every response but 200 is nothing, a redirect among them
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
	Timeout:       dialWait + sendWait,
}

// post sends one ask as a POST, and answers the reply's box, or nil for
// nothing. A body above the size is read one byte past it, and reads as
// silence.
func post(a *address, wardPK, box []byte) []byte {
	resp, err := postClient.Post(a.text, "application/octet-stream", bytes.NewReader(slices.Concat(wardPK, box)))
	if err != nil {
		return nil
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil
	}
	b, err := io.ReadAll(io.LimitReader(resp.Body, boxSize+1))
	if err != nil || len(b) == 0 {
		return nil
	}
	return b
}

// ---- the held line: WebSocket, RFC 6455 ----

const (
	opCont   = 0x0
	opText   = 0x1
	opBinary = 0x2
	opClose  = 0x8
	opPing   = 0x9
	opPong   = 0xa

	wsGUID      = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	subprotocol = "quo"

	closeProtocol = 1002 // the bytes break RFC 6455
	closeData     = 1003 // a text message
	closePolicy   = 1008 // a binary message that is no frame
	closeTooBig   = 1009 // a message longer than the largest body
)

var errLine = errors.New("the held line ended")

// A wsConn is one end of a held line.
type wsConn struct {
	c    net.Conn
	r    *bufio.Reader
	mask bool // this end masks what it writes: a client
	wmu  sync.Mutex
}

func acceptKey(key string) string {
	sum := sha1.Sum([]byte(key + wsGUID))
	return base64.StdEncoding.EncodeToString(sum[:])
}

// tokens answers every comma-separated token of a header's values.
func tokens(h http.Header, name string) []string {
	var out []string
	for _, v := range h.Values(name) {
		for t := range strings.SplitSeq(v, ",") {
			out = append(out, strings.TrimSpace(t))
		}
	}
	return out
}

func hasToken(h http.Header, name, token string) bool {
	return slices.ContainsFunc(tokens(h, name), func(t string) bool { return strings.EqualFold(t, token) })
}

func (c *wsConn) write(op byte, payload []byte) error {
	head := []byte{0x80 | op, 0}
	switch n := len(payload); {
	case n < 126:
		head[1] = byte(n)
	case n < 65536:
		head[1] = 126
		head = binary.BigEndian.AppendUint16(head, uint16(n))
	default:
		head[1] = 127
		head = binary.BigEndian.AppendUint64(head, uint64(n))
	}
	body := payload
	if c.mask {
		head[1] |= 0x80
		key := draw(4)
		head = append(head, key...)
		body = make([]byte, len(payload))
		for i, b := range payload {
			body[i] = b ^ key[i&3]
		}
	}
	c.wmu.Lock()
	defer c.wmu.Unlock()
	_, err := c.c.Write(slices.Concat(head, body))
	return err
}

// fail closes the line with a status code, as RFC 6455 section 7 asks.
func (c *wsConn) fail(code uint16) error {
	c.write(opClose, binary.BigEndian.AppendUint16(nil, code))
	c.c.Close()
	return errLine
}

// next answers the frame body the next message carries. It answers pings,
// reads pongs, and answers the peer's close. A text message, a message
// that is no frame, and bytes RFC 6455 refuses close the line.
func (c *wsConn) next() (*frame, error) {
	var msg []byte
	inMsg := false
	for {
		var h [2]byte
		if _, err := io.ReadFull(c.r, h[:]); err != nil {
			return nil, err
		}
		fin, op, masked := h[0]&0x80 != 0, h[0]&0x0f, h[1]&0x80 != 0
		if h[0]&0x70 != 0 || masked == c.mask {
			return nil, c.fail(closeProtocol) // reserved bits, or a mask where none belongs
		}
		n := uint64(h[1] & 0x7f)
		switch n {
		case 126:
			var b [2]byte
			if _, err := io.ReadFull(c.r, b[:]); err != nil {
				return nil, err
			}
			n = uint64(binary.BigEndian.Uint16(b[:]))
		case 127:
			var b [8]byte
			if _, err := io.ReadFull(c.r, b[:]); err != nil {
				return nil, err
			}
			n = binary.BigEndian.Uint64(b[:])
			if n>>63 != 0 {
				return nil, c.fail(closeProtocol)
			}
		}
		control := op >= opClose
		switch {
		case op > opBinary && op < opClose, op > opPong:
			return nil, c.fail(closeProtocol)
		case control && (n > 125 || !fin):
			return nil, c.fail(closeProtocol)
		case !control && (op == opCont) != inMsg:
			return nil, c.fail(closeProtocol)
		case op == opText:
			return nil, c.fail(closeData)
		case !control && uint64(len(msg))+n > maxBody:
			return nil, c.fail(closeTooBig)
		}
		var key [4]byte
		if masked {
			if _, err := io.ReadFull(c.r, key[:]); err != nil {
				return nil, err
			}
		}
		payload := make([]byte, n)
		if _, err := io.ReadFull(c.r, payload); err != nil {
			return nil, err
		}
		if masked {
			for i := range payload {
				payload[i] ^= key[i&3]
			}
		}
		switch op {
		case opPing:
			c.write(opPong, payload)
		case opPong:
		case opClose:
			if len(payload) >= 2 {
				payload = payload[:2]
			}
			c.write(opClose, payload)
			c.c.Close()
			return nil, errLine
		default:
			msg, inMsg = append(msg, payload...), true
			if fin {
				f, err := parseBody(msg)
				if err != nil {
					return nil, c.fail(closePolicy)
				}
				return f, nil
			}
		}
	}
}

func (k *Kit) serveLine(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("Sec-WebSocket-Key")
	raw, err := base64.StdEncoding.DecodeString(key)
	if r.Method != http.MethodGet || !hasToken(r.Header, "Connection", "upgrade") ||
		!hasToken(r.Header, "Upgrade", "websocket") || err != nil || len(raw) != 16 {
		w.WriteHeader(http.StatusBadRequest)
		return
	}
	if r.Header.Get("Sec-WebSocket-Version") != "13" {
		w.Header().Set("Sec-WebSocket-Version", "13")
		w.WriteHeader(http.StatusUpgradeRequired)
		return
	}
	if !slices.Contains(tokens(r.Header, "Sec-WebSocket-Protocol"), subprotocol) {
		w.WriteHeader(http.StatusBadRequest) // a line without quo carries no frame
		return
	}
	c, rw, err := http.NewResponseController(w).Hijack()
	if err != nil {
		return
	}
	defer c.Close()
	c.SetDeadline(time.Time{})
	rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
		"Sec-WebSocket-Accept: " + acceptKey(key) + "\r\nSec-WebSocket-Protocol: " + subprotocol + "\r\n\r\n")
	if rw.Flush() != nil {
		return
	}
	ws := &wsConn{c: c, r: rw.Reader}
	k.serveFrames(ws.next, func(body []byte) { ws.write(opBinary, body) })
}

// wsDial opens a held line over a connection already made, offering quo.
func wsDial(c net.Conn, a *address) (*wsConn, error) {
	key := base64.StdEncoding.EncodeToString(draw(16))
	req, err := http.NewRequest(http.MethodGet, a.url.String(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Sec-WebSocket-Key", key)
	req.Header.Set("Sec-WebSocket-Version", "13")
	req.Header.Set("Sec-WebSocket-Protocol", subprotocol)
	c.SetDeadline(time.Now().Add(dialWait))
	if err := req.Write(c); err != nil {
		return nil, err
	}
	r := bufio.NewReader(c)
	resp, err := http.ReadResponse(r, req)
	if err != nil {
		return nil, err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusSwitchingProtocols ||
		!hasToken(resp.Header, "Upgrade", "websocket") || !hasToken(resp.Header, "Connection", "upgrade") ||
		resp.Header.Get("Sec-WebSocket-Accept") != acceptKey(key) ||
		resp.Header.Get("Sec-WebSocket-Protocol") != subprotocol {
		return nil, errLine
	}
	c.SetDeadline(time.Time{})
	return &wsConn{c: c, r: r, mask: true}, nil
}
