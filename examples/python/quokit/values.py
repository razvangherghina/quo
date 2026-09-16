"""The value rules of SPEC.md, applied to the JSON text itself.

Only a top-level object's own keys are read. Every container below them is
checked against the grammar of RFC 8259 and nothing else: no depth, no
repeated keys, no surrogate rule."""

import re

_WS = " \t\n\r"
_ESC = {'"': '"', "\\": "\\", "/": "/", "b": "\b", "f": "\f", "n": "\n", "r": "\r", "t": "\t"}
_STRING = re.compile(r'"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*"')
_NUMBER = re.compile(r"-?(?:0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?")
_ESCAPE = re.compile(r"\\(?:u([0-9a-fA-F]{4})|(.))")


class Invalid(Exception):
    pass


class Num:
    """A number as written. `integer` is its value when the text has no
    fraction and no exponent, and None otherwise."""
    __slots__ = ("text", "integer")

    def __init__(self, text, integer):
        self.text, self.integer = text, integer


class Container:
    """A container Quo does not read into. `kind` is "{" or "["."""
    __slots__ = ("kind",)

    def __init__(self, kind):
        self.kind = kind


class JObj(dict):
    """A top-level object; `spans` maps each key to its value's (start, end)."""

    def __init__(self):
        super().__init__()
        self.spans = {}


def _ws(s, i):
    n = len(s)
    while i < n and s[i] in _WS:
        i += 1
    return i


def _unescape(m):
    if m.group(1) is None:
        return _ESC[m.group(2)]
    return chr(int(m.group(1), 16))


def _string_end(s, i):
    m = _STRING.match(s, i)
    if m is None:
        raise Invalid("string")
    return m.end()


def _string(s, i):
    """(decoded string, end). A surrogate pair is joined; a lone one is kept."""
    end = _string_end(s, i)
    raw = s[i + 1:end - 1]
    out = _ESCAPE.sub(_unescape, raw) if "\\" in raw else raw
    if any("\ud800" <= ch <= "\udfff" for ch in out):
        out = out.encode("utf-16-le", "surrogatepass").decode("utf-16-le", "surrogatepass")
    return out, end


def _scalar(s, i):
    """(value, end) for a string, a literal or a number."""
    c = s[i:i + 1]
    if c == '"':
        return _string(s, i)
    for lit, v in (("true", True), ("false", False), ("null", None)):
        if s.startswith(lit, i):
            return v, i + len(lit)
    m = _NUMBER.match(s, i)
    if m is None:
        raise Invalid("value")
    text = m.group()
    integer = int(text) if m.group(1) is None and m.group(2) is None else None
    return Num(text, integer), m.end()


def _skip(s, i):
    """The end of the value at `i`, checked against the grammar alone."""
    stack = []
    state = "value"
    while True:
        if state == "after" and not stack:
            return i
        i = _ws(s, i)
        c = s[i:i + 1]
        if state == "value":
            if c in ("{", "["):
                j = _ws(s, i + 1)
                if s[j:j + 1] == ("}" if c == "{" else "]"):
                    i, state = j + 1, "after"
                else:
                    stack.append(c)
                    i, state = i + 1, "key" if c == "{" else "value"
            elif c == '"':
                i, state = _string_end(s, i), "after"
            else:
                _, i = _scalar(s, i)
                state = "after"
        elif state == "key":
            i = _ws(s, _string_end(s, i))
            if s[i:i + 1] != ":":
                raise Invalid("colon")
            i, state = i + 1, "value"
        else:
            top = stack[-1]
            if c == ",":
                i, state = i + 1, "key" if top == "{" else "value"
            elif c == ("}" if top == "{" else "]"):
                stack.pop()
                i += 1
            else:
                raise Invalid("container")


def _member(s, i):
    """(value, end) of a top-level object's member value."""
    c = s[i:i + 1]
    if c in ("{", "["):
        return Container(c), _skip(s, i)
    return _scalar(s, i)


def _object(s, i):
    o = JObj()
    i = _ws(s, i + 1)
    if s[i:i + 1] == "}":
        return o, i + 1
    while True:
        i = _ws(s, i)
        k, i = _string(s, i)
        if k in o:
            raise Invalid("duplicate key")
        i = _ws(s, i)
        if s[i:i + 1] != ":":
            raise Invalid("colon")
        start = _ws(s, i + 1)
        o[k], i = _member(s, start)
        o.spans[k] = (start, i)
        i = _ws(s, i)
        c = s[i:i + 1]
        if c == "}":
            return o, i + 1
        if c != ",":
            raise Invalid("object")
        i += 1


def parse(data):
    """Parse bytes as a value. A top-level object is a JObj; any other
    top-level container is a Container. Returns (value, text); raises Invalid."""
    if isinstance(data, (bytes, bytearray)):
        try:
            text = bytes(data).decode("utf-8", errors="strict")
        except UnicodeDecodeError:
            raise Invalid("not UTF-8")
    else:
        text = data
    i = _ws(text, 0)
    if text[i:i + 1] == "{":
        v, i = _object(text, i)
    else:
        v, i = _member(text, i)
    if _ws(text, i) != len(text):
        raise Invalid("trailing")
    return v, text


def minify(text):
    """The JSON text `text` with the whitespace between its tokens removed."""
    out, i, n = [], 0, len(text)
    while i < n:
        c = text[i]
        if c == '"':
            end = _string_end(text, i)
            out.append(text[i:end])
            i = end
        else:
            if c not in _WS:
                out.append(c)
            i += 1
    return "".join(out)


def json_string(s):
    """A JSON string for `s`, escaping only what must be escaped, and a
    lone surrogate as its escape."""
    out = ['"']
    for ch in s:
        o = ord(ch)
        if ch == '"':
            out.append('\\"')
        elif ch == "\\":
            out.append("\\\\")
        elif o < 0x20 or 0xD800 <= o <= 0xDFFF:
            out.append("\\u%04x" % o)
        else:
            out.append(ch)
    out.append('"')
    return "".join(out)
