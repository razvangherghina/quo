package main

import (
	"errors"
	"strconv"
	"strings"
	"unicode/utf16"
	"unicode/utf8"
)

// A parsed value. null is nil, a boolean is bool, a string is string, a
// number is *Num. A text whose outermost value is an object is *Obj. A
// container inside that object, or an outermost array, is Container: its
// grammar is checked and nothing inside it is read.
type Num struct {
	Text string // the number as written
}

type Obj struct {
	Keys []string          // in the order written
	M    map[string]any    // parsed
	Raw  map[string][]byte // each value's bytes exactly as they arrived
}

type Container struct {
	Object bool
}

var errNotValue = errors.New("not a value")

// Parse reads JSON text. Only the outermost object's own keys are held to
// one name each. Inside it any JSON text is a value, whatever its nesting,
// strings or keys.
func Parse(b []byte) (any, error) {
	if !utf8.Valid(b) {
		return nil, errNotValue
	}
	p := &parser{s: b}
	p.ws()
	var v any
	var err error
	if p.at('{') {
		v, err = p.object()
	} else {
		v, err = p.value()
	}
	if err != nil {
		return nil, err
	}
	p.ws()
	if p.i != len(p.s) {
		return nil, errNotValue
	}
	return v, nil
}

type parser struct {
	s []byte
	i int
}

// ws skips the four whitespace bytes of RFC 8259 and nothing else.
func (p *parser) ws() {
	for p.i < len(p.s) {
		switch p.s[p.i] {
		case ' ', '\t', '\n', '\r':
			p.i++
		default:
			return
		}
	}
}

func (p *parser) at(c byte) bool { return p.i < len(p.s) && p.s[p.i] == c }

func (p *parser) lit(word string) bool {
	if strings.HasPrefix(string(p.s[p.i:min(len(p.s), p.i+len(word))]), word) {
		p.i += len(word)
		return true
	}
	return false
}

// value reads one value. A container is skipped over and answered as its kind.
func (p *parser) value() (any, error) {
	if p.i >= len(p.s) {
		return nil, errNotValue
	}
	switch c := p.s[p.i]; {
	case c == '{' || c == '[':
		return Container{Object: c == '{'}, p.skip()
	case c == '"':
		return p.str()
	case c == 't':
		if p.lit("true") {
			return true, nil
		}
	case c == 'f':
		if p.lit("false") {
			return false, nil
		}
	case c == 'n':
		if p.lit("null") {
			return nil, nil
		}
	case c == '-' || (c >= '0' && c <= '9'):
		return p.number()
	}
	return nil, errNotValue
}

// key reads an object key and its colon.
func (p *parser) key() (string, error) {
	p.ws()
	if !p.at('"') {
		return "", errNotValue
	}
	k, err := p.str()
	if err != nil {
		return "", err
	}
	p.ws()
	if !p.at(':') {
		return "", errNotValue
	}
	p.i++
	p.ws()
	return k.(string), nil
}

// skip checks a container against the grammar without recursion, so no
// nesting is too deep to read.
func (p *parser) skip() error {
	var stack []byte
	for {
		// a value is owed here
		p.ws()
		if p.at('{') || p.at('[') {
			c := p.s[p.i]
			p.i++
			p.ws()
			if p.at(c + 2) { // '}' is '{'+2, ']' is '['+2
				p.i++
			} else {
				stack = append(stack, c)
				if c == '{' {
					if _, err := p.key(); err != nil {
						return err
					}
				}
				continue
			}
		} else if _, err := p.value(); err != nil {
			return err
		}
		// a value was read
		for {
			if len(stack) == 0 {
				return nil
			}
			p.ws()
			top := stack[len(stack)-1]
			if p.at(',') {
				p.i++
				if top == '{' {
					if _, err := p.key(); err != nil {
						return err
					}
				}
				break
			}
			if !p.at(top + 2) {
				return errNotValue
			}
			p.i++
			stack = stack[:len(stack)-1]
		}
	}
}

// object reads the outermost object, whose own keys are one name each.
func (p *parser) object() (any, error) {
	p.i++
	o := &Obj{M: map[string]any{}, Raw: map[string][]byte{}}
	p.ws()
	if p.at('}') {
		p.i++
		return o, nil
	}
	for {
		key, err := p.key()
		if err != nil {
			return nil, err
		}
		// two keys are one name when equal after escapes are read
		if _, dup := o.M[key]; dup {
			return nil, errNotValue
		}
		start := p.i
		v, err := p.value()
		if err != nil {
			return nil, err
		}
		o.Keys = append(o.Keys, key)
		o.M[key] = v
		o.Raw[key] = p.s[start:p.i]
		p.ws()
		switch {
		case p.at(','):
			p.i++
		case p.at('}'):
			p.i++
			return o, nil
		default:
			return nil, errNotValue
		}
	}
}

func hex4(b []byte) (rune, bool) {
	if len(b) < 4 {
		return 0, false
	}
	for _, c := range b[:4] {
		if !(c >= '0' && c <= '9' || c >= 'a' && c <= 'f' || c >= 'A' && c <= 'F') {
			return 0, false
		}
	}
	v, err := strconv.ParseUint(string(b[:4]), 16, 16)
	return rune(v), err == nil
}

// str reads a string. A lone surrogate is a value, and is kept as its
// generalized UTF-8 bytes, which no UTF-8 text spells, so two strings are
// equal exactly when their code units are.
func (p *parser) str() (any, error) {
	p.i++ // the opening quote
	var sb strings.Builder
	for {
		if p.i >= len(p.s) {
			return nil, errNotValue
		}
		c := p.s[p.i]
		switch {
		case c == '"':
			p.i++
			return sb.String(), nil
		case c < 0x20:
			return nil, errNotValue
		case c == '\\':
			if p.i+1 >= len(p.s) {
				return nil, errNotValue
			}
			e := p.s[p.i+1]
			p.i += 2
			switch e {
			case '"', '\\', '/':
				sb.WriteByte(e)
			case 'b':
				sb.WriteByte('\b')
			case 'f':
				sb.WriteByte('\f')
			case 'n':
				sb.WriteByte('\n')
			case 'r':
				sb.WriteByte('\r')
			case 't':
				sb.WriteByte('\t')
			case 'u':
				r, ok := hex4(p.s[p.i:])
				if !ok {
					return nil, errNotValue
				}
				p.i += 4
				if r >= 0xd800 && r < 0xdc00 && p.i+6 <= len(p.s) && p.s[p.i] == '\\' && p.s[p.i+1] == 'u' {
					if r2, ok := hex4(p.s[p.i+2:]); ok && r2 >= 0xdc00 && r2 <= 0xdfff {
						p.i += 6
						r = utf16.DecodeRune(r, r2)
					}
				}
				if utf16.IsSurrogate(r) {
					sb.Write([]byte{byte(0xe0 | r>>12), byte(0x80 | (r>>6)&0x3f), byte(0x80 | r&0x3f)})
				} else {
					sb.WriteRune(r)
				}
			default:
				return nil, errNotValue
			}
		default:
			sb.WriteByte(c)
			p.i++
		}
	}
}

// number reads any number the grammar of RFC 8259 allows, as written.
func (p *parser) number() (any, error) {
	st := p.i
	if p.at('-') {
		p.i++
	}
	digits := func() int {
		n := 0
		for p.i < len(p.s) && p.s[p.i] >= '0' && p.s[p.i] <= '9' {
			p.i++
			n++
		}
		return n
	}
	if p.at('0') {
		p.i++
	} else if digits() == 0 {
		return nil, errNotValue
	}
	if p.at('.') {
		p.i++
		if digits() == 0 {
			return nil, errNotValue
		}
	}
	if p.at('e') || p.at('E') {
		p.i++
		if p.at('+') || p.at('-') {
			p.i++
		}
		if digits() == 0 {
			return nil, errNotValue
		}
	}
	return &Num{Text: string(p.s[st:p.i])}, nil
}

// MaxCount is 2^53 - 1, the highest count number.
const MaxCount = 1<<53 - 1

// CountOf answers a count number: no fraction, no exponent, 1 to 2^53 - 1.
// The grammar already refused a leading zero.
func CountOf(v any) (uint64, bool) {
	n, ok := v.(*Num)
	if !ok || strings.ContainsAny(n.Text, "-.eE") {
		return 0, false
	}
	c, err := strconv.ParseUint(n.Text, 10, 64)
	return c, err == nil && c >= 1 && c <= MaxCount
}

// Quote writes a string as JSON text.
func Quote(s string) []byte {
	var sb strings.Builder
	sb.WriteByte('"')
	for _, r := range s {
		switch {
		case r == '"':
			sb.WriteString(`\"`)
		case r == '\\':
			sb.WriteString(`\\`)
		case r < 0x20:
			sb.WriteString(`\u00`)
			sb.WriteByte("0123456789abcdef"[r>>4])
			sb.WriteByte("0123456789abcdef"[r&15])
		default:
			sb.WriteRune(r)
		}
	}
	sb.WriteByte('"')
	return []byte(sb.String())
}
