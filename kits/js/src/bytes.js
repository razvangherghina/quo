// The two byte conveniences the kit needs and no runtime hands it: bytes as a
// hex string, for using them as a map key, and its inverse for the few
// constants written as hex. Nothing here is arithmetic.
const HEX = Array.from({ length: 256 }, (_, at) => at.toString(16).padStart(2, '0'));

export function hex(bytes) {
  let out = '';
  for (const byte of bytes) out += HEX[byte];
  return out;
}

export function unhex(text) {
  const out = new Uint8Array(text.length / 2);
  for (let at = 0; at < out.length; at += 1) out[at] = parseInt(text.slice(at * 2, at * 2 + 2), 16);
  return out;
}
