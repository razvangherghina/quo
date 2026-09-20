package main

import (
	"net"
	"net/url"
	"strconv"
	"strings"
)

// An address is a URI of RFC 3986 whose scheme names a carrier this kit
// stands, written as that carrier writes it.
type address struct {
	text     string // as written, what the post is sent to
	form     string // "tcp", "post" or "line"
	secure   bool   // https and wss carry the bytes inside TLS
	hostPort string // what a socket dials
	url      *url.URL
}

// forms is every scheme this kit stands, and the form each names.
var forms = map[string]string{"tcp": "tcp", "http": "post", "https": "post", "ws": "line", "wss": "line"}

// uriChar is every character RFC 3986 lets a URI hold outside a
// percent-encoding.
func uriChar(c byte) bool {
	return c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' ||
		strings.IndexByte("-._~:/?#[]@!$&'()*+,;=", c) >= 0
}

func isHexDigit(c byte) bool {
	return c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F'
}

// parseAddress reads one address. It answers false for a string that is not
// a URI with a scheme, for a scheme this kit does not stand, and for an
// address its carrier does not write.
func parseAddress(s string) (*address, bool) {
	for i := 0; i < len(s); i++ {
		switch {
		case s[i] == '%':
			if i+2 >= len(s) || !isHexDigit(s[i+1]) || !isHexDigit(s[i+2]) {
				return nil, false
			}
		case !uriChar(s[i]):
			return nil, false
		}
	}
	u, err := url.Parse(s)
	if err != nil || u.Opaque != "" || u.User != nil || strings.Contains(s, "#") || u.Hostname() == "" {
		return nil, false
	}
	form, ok := forms[u.Scheme]
	if !ok {
		return nil, false
	}
	a := &address{text: s, form: form, secure: u.Scheme == "https" || u.Scheme == "wss", url: u}
	port := u.Port()
	if form == "tcp" {
		// tcp://host:port, and nothing after the port
		if u.Path != "" || u.RawQuery != "" || u.ForceQuery || port == "" {
			return nil, false
		}
	} else if port == "" {
		port = "80"
		if a.secure {
			port = "443"
		}
	}
	if n, err := strconv.Atoi(port); err != nil || len(port) > 5 || n < 1 || n > 65535 {
		return nil, false
	}
	a.hostPort = net.JoinHostPort(u.Hostname(), port)
	return a, true
}
