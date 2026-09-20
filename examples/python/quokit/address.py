"""Addresses of an invitation's `at`: URIs of RFC 3986, as each carrier writes them."""

import re

# RFC 3986 appendix B, with the characters a URI may hold checked apart.
_SPLIT = re.compile(r"\A(?:([^:/?#]+):)?(?://([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?\Z", re.S)
_CHARS = re.compile(r"\A(?:[A-Za-z0-9\-._~:/?#\[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*\Z")
_SCHEME = re.compile(r"\A[A-Za-z][A-Za-z0-9+.\-]*\Z")
_REG_NAME = re.compile(r"\A(?:[A-Za-z0-9\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})*\Z")
_IP_LITERAL = re.compile(r"\A\[(?:[0-9A-Fa-f:.]+|v[0-9A-Fa-f]+\.[A-Za-z0-9\-._~!$&'()*+,;=:]+)\]\Z")
_HOST_PORT = re.compile(r"\A(\[[^\]]*\]|[^:\[\]]*)(?::([0-9]*))?\Z")

WEB = ("http", "https")


class Address:
    def __init__(self, scheme, host, port, target):
        self.scheme, self.host, self.port, self.target = scheme, host, port, target


def _parts(s):
    """(scheme, userinfo, host, port, path, query, fragment) of a URI with a
    scheme and an authority, or None."""
    if not isinstance(s, str) or not _CHARS.match(s):
        return None
    m = _SPLIT.match(s)
    if m is None or m.group(1) is None or not _SCHEME.match(m.group(1)) or m.group(2) is None:
        return None
    scheme, rest, path, query, fragment = m.group(1).lower(), m.group(2), m.group(3), m.group(4), m.group(5)
    userinfo = None
    if "@" in rest:
        userinfo, _, rest = rest.rpartition("@")
    hp = _HOST_PORT.match(rest)
    if hp is None or not hp.group(1):
        return None
    host = hp.group(1)
    if not (_IP_LITERAL if host.startswith("[") else _REG_NAME).match(host):
        return None
    port = hp.group(2)
    if port is not None and port != "":
        if len(port) > 5 or int(port) > 65535:
            return None
        port = int(port)
    else:
        port = None
    return scheme, userinfo, host.strip("[]"), port, path, query, fragment


def address(s):
    """An address of a carrier this kit stands, `tcp`, `http` or `https`, or None."""
    p = _parts(s)
    if p is None:
        return None
    scheme, userinfo, host, port, path, query, fragment = p
    if userinfo is not None or fragment is not None:
        return None
    if scheme == "tcp":
        if path or query is not None or port is None or port < 1:
            return None
        return Address(scheme, host, port, None)
    if scheme in WEB:
        target = (path or "/") + ("" if query is None else "?" + query)
        return Address(scheme, host, port if port is not None else (443 if scheme == "https" else 80), target)
    return None
