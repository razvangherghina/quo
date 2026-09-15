// The frames of Quo over TCP. The stream is a sequence of frames, each a
// four byte big-endian length and then a body:
//
//   frame = length (4, big-endian) || body
//   body  = kind (1) || id (4, big-endian) || rest
//
//   00 ask      rest = ward pk (64) || box     dialer to listener
//   01 reply    rest = box                     listener to dialer
//   02 nothing  rest = empty                   listener to dialer
//
// The carrier opens no box and adds nothing to the door.

import { concat, hex, unhex } from './arithmetic.js';

// The largest body: one kind byte, four id bytes, sixty-four pk bytes and a
// box of one mebibyte, the size of chapter 3.
export const MAX_BODY = 1_048_645;
export const MIN_BODY = 5;

export const ASK = 0x00;
export const REPLY = 0x01;
export const NOTHING = 0x02;

function u32(n) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, n);
  return out;
}

const framed = (body) => concat(u32(body.length), body);

export const askFrame = (id, pk, box) => framed(concat([ASK], u32(id), unhex(pk), box));
export const replyFrame = (id, box) => framed(concat([REPLY], u32(id), box));
export const nothingFrame = (id) => framed(concat([NOTHING], u32(id)));

// One body, read. A length below five or above the bound is refused before
// this, in the reader; here a kind that is none of the three, an ask with
// fewer than sixty-four bytes after its id, and a nothing with bytes after
// its id are the three that are not frames.
export function readBody(body) {
  if (body.length < MIN_BODY || body.length > MAX_BODY) return null;
  const id = new DataView(body.buffer, body.byteOffset).getUint32(1);
  const rest = body.subarray(5);
  if (body[0] === ASK) {
    return rest.length >= 64 ? { kind: 'ask', id, pk: hex(rest.subarray(0, 64)), box: rest.subarray(64) } : null;
  }
  if (body[0] === REPLY) return { kind: 'reply', id, box: rest };
  if (body[0] === NOTHING) return rest.length === 0 ? { kind: 'nothing', id } : null;
  return null;
}

// The stream, read as it arrives. Bytes in, the bodies that came whole out,
// and null for what is not a frame: the side that reads one closes the
// connection.
export function frameReader() {
  let held = new Uint8Array(0);
  return function take(chunk) {
    held = concat(held, chunk);
    const bodies = [];
    for (;;) {
      if (held.length < 4) return bodies;
      const length = new DataView(held.buffer, held.byteOffset).getUint32(0);
      if (length < MIN_BODY || length > MAX_BODY) return null;
      if (held.length < 4 + length) return bodies;
      const body = readBody(held.slice(4, 4 + length));
      if (!body) return null;
      bodies.push(body);
      held = held.slice(4 + length);
    }
  };
}
