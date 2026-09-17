// Addresses, as SPEC.md names them in an invitation's `at`: a URI of RFC
// 3986 whose scheme names a carrier. CARRIER-TCP.md writes `tcp`, and
// CARRIER-WEB.md writes `http`, `https`, `ws` and `wss`.

// RFC 3986 appendix B, with the characters a URI may hold checked apart.
const SPLIT = /^(?:([^:/?#]+):)?(?:\/\/([^/?#]*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/;
const URI_CHARS = /^(?:[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]|%[0-9A-Fa-f]{2})*$/;
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*$/;
const REG_NAME = /^(?:[A-Za-z0-9\-._~!$&'()*+,;=]|%[0-9A-Fa-f]{2})*$/;
const IP_LITERAL = /^\[(?:[0-9A-Fa-f:.]+|v[0-9A-Fa-f]+\.[A-Za-z0-9\-._~!$&'()*+,;=:]+)\]$/;

/** The schemes the web carrier writes, and the form each names. */
export const WEB_SCHEMES = { http: "post", https: "post", ws: "held line", wss: "held line" };

/**
 * A URI with a scheme, taken apart, or null. `host` is as written, brackets
 * included; `port` is the digits as written, or null.
 */
export function parseAddress(s) {
  if (typeof s !== "string" || !URI_CHARS.test(s)) return null;
  const m = SPLIT.exec(s);
  if (!m || m[1] === undefined || !SCHEME.test(m[1])) return null;
  const out = { scheme: m[1].toLowerCase(), authority: m[2] ?? null, userinfo: null, host: null, port: null, path: m[3], query: m[4] ?? null, fragment: m[5] ?? null };
  if (out.authority === null) return out;
  let rest = out.authority;
  const at = rest.lastIndexOf("@");
  if (at >= 0) {
    out.userinfo = rest.slice(0, at);
    rest = rest.slice(at + 1);
  }
  const hp = /^(\[[^\]]*\]|[^:[\]]*)(?::([0-9]*))?$/.exec(rest);
  if (!hp) return null;
  if (hp[1].startsWith("[") ? !IP_LITERAL.test(hp[1]) : !REG_NAME.test(hp[1])) return null;
  out.host = hp[1];
  out.port = hp[2] ?? null;
  return out;
}

/** The host as a socket takes it: an IPv6 literal without its brackets. */
const bare = (host) => (host.startsWith("[") ? host.slice(1, -1) : host);

/** A `tcp` address as CARRIER-TCP.md writes one, as `{ host, port }`, or null. */
export function tcpAddress(s) {
  const a = parseAddress(s);
  if (!a || a.scheme !== "tcp" || a.authority === null) return null;
  if (a.userinfo !== null || a.path !== "" || a.query !== null || a.fragment !== null) return null;
  if (!a.host || a.port === null || !/^[0-9]+$/.test(a.port)) return null;
  const port = Number(a.port);
  if (port < 1 || port > 65535) return null;
  return { host: bare(a.host), port };
}

/**
 * An address of CARRIER-WEB.md, as `{ scheme, form, host, port, path }`, or
 * null. `path` is the path and query a request names, `/` when both are empty.
 */
export function webAddress(s) {
  const a = parseAddress(s);
  if (!a || !(a.scheme in WEB_SCHEMES) || a.authority === null) return null;
  if (a.userinfo !== null || a.fragment !== null || !a.host) return null;
  if (a.port !== null && a.port !== "" && (!/^[0-9]+$/.test(a.port) || Number(a.port) > 65535)) return null;
  const secure = a.scheme === "https" || a.scheme === "wss";
  const port = a.port ? Number(a.port) : secure ? 443 : 80;
  const path = `${a.path || "/"}${a.query !== null ? `?${a.query}` : ""}`;
  return { scheme: a.scheme, form: WEB_SCHEMES[a.scheme], host: bare(a.host), port, path };
}

/** Why an address of a scheme a carrier writes is not written as that carrier writes it, or null. */
export function carrierWritingOf(s) {
  const a = parseAddress(s);
  if (!a) return null;
  if (a.scheme === "tcp") return tcpAddress(s) ? null : "not tcp://host:port as CARRIER-TCP.md writes it";
  if (a.scheme in WEB_SCHEMES) return webAddress(s) ? null : "not a URI with a host and no user information or fragment, as CARRIER-WEB.md writes it";
  return null;
}
