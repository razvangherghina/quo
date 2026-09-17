// Addresses in an invitation's `at`, as CARRIER-TCP.md and CARRIER-WEB.md write them.

// A host as RFC 3986 writes one: a registered name, an IPv4 address, or an IPv6 address in brackets.
const HOST = String.raw`(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9\-._~!$&'()*+,;=%]+)`;
// The scheme is read without regard to case, and nothing follows the port.
const TCP = new RegExp(String.raw`^tcp://${HOST}:(\d+)$`, "i");

// The schemes this kit dials, and those it listens on.
export const DIALED = ["tcp", "http", "https", "ws", "wss"];
export const LISTENED = ["tcp", "http", "ws"];

// Reads one address. Returns { scheme, host, port, url } or null when it is no address this kit dials.
export function readAddress(s) {
  if (typeof s !== "string") return null;
  const m = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(s);
  if (!m) return null;
  const scheme = m[1].toLowerCase();
  if (scheme === "tcp") {
    const t = TCP.exec(s);
    if (!t) return null;
    const port = Number(t[2]);
    if (port < 1 || port > 65535) return null;
    const host = t[1].startsWith("[") ? t[1].slice(1, -1) : t[1];
    if (t[1].startsWith("[") && !URL.canParse(`http://${t[1]}/`)) return null;
    return { scheme, host, port, url: s };
  }
  if (!DIALED.includes(scheme)) return null;
  // RFC 3986: only its characters, and an authority that is not empty.
  if (!/^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+$/.test(s) || !/^[^:]+:\/\/[^/?#]/.test(s)) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  // With a host, and with no user information and no fragment.
  if (!u.hostname || s.includes("#") || u.username || u.password || /^[^/]*\/\/[^/?]*@/.test(s)) return null;
  return { scheme, url: s };
}

// The addresses of `at` this kit dials, in the order written.
export const dialable = (at) => (Array.isArray(at) ? at.map(readAddress).filter(Boolean) : []);
