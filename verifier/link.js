// A link, as LINK.md writes one: `web+quo:` reference `@` ward, then the
// address fields of its query. It stands for an invitation and is none.

const LINK = /^web\+quo:([a-z0-9]{1,64})@([0-9a-f]{128})(?:\?([^#]*))?$/;
const utf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** The decoded value of an address field, or null where it is skipped. */
function decodeValue(value) {
  const bytes = [];
  const raw = Buffer.from(value, 'utf8');
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] !== 0x25) {
      bytes.push(raw[i]);
      continue;
    }
    const pair = raw.subarray(i + 1, i + 3).toString('latin1');
    if (!/^[0-9A-Fa-f]{2}$/.test(pair)) return null;
    bytes.push(parseInt(pair, 16));
    i += 2;
  }
  try {
    return utf8.decode(Uint8Array.from(bytes));
  } catch {
    return null;
  }
}

/**
 * A link read from its text: `{ reference, ward, at }`, or null where the
 * text is no link. `at` holds the decoded value of every address field that
 * is not skipped, in the order written. Each is read as an entry of an
 * invitation's `at` after this.
 */
export function readLink(text) {
  if (typeof text !== 'string') return null;
  const colon = text.indexOf(':');
  if (colon < 0) return null;
  const m = LINK.exec(text.slice(0, colon).toLowerCase() + text.slice(colon));
  if (!m) return null;
  const at = (m[3] ?? '')
    .split('&')
    .filter((field) => field.startsWith('at='))
    .map((field) => decodeValue(field.slice(3)))
    .filter((value) => value !== null);
  return { reference: m[1], ward: m[2], at };
}
