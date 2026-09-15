// Support for `test/s12.test.js`: the searches chapter 12 reads the recorded
// bytes with, and a kit's ward B routed through an observer to the hand
// standing as the door.

import { LISTEN_HOST, createWorldObserver, handAt } from '../../src/world.js';
import { bootHost, startStand } from '../../src/root-driver.js';
import { encodeFrame } from '../../src/observer.js';
import { standHand } from '../../src/hand.js';
import { knockAndTake, route } from '../../src/standing.js';

// The bytes of every frame that crossed, as it crossed.
export const wireBytes = (frames) => Buffer.concat(frames.filter((f) => !f.closed).map((f) => encodeFrame(f)));

// Each secret as raw bytes and as lowercase hex text.
export function needlesOf(named) {
  const out = [];
  for (const [name, value] of Object.entries(named)) {
    const hex = !Buffer.isBuffer(value) && /^([0-9a-f]{2})+$/.test(value);
    const raw = Buffer.isBuffer(value) ? value : hex ? Buffer.from(value, 'hex') : Buffer.from(value, 'utf8');
    out.push({ name: `${name} raw`, bytes: raw });
    out.push({ name: `${name} hex`, bytes: Buffer.from(raw.toString('hex'), 'ascii') });
  }
  return out;
}

// The names of the needles found in `bytes`.
export function leaks(bytes, needles) {
  return needles.filter((n) => n.bytes.length && bytes.includes(n.bytes)).map((n) => n.name);
}

function windowsOf(frames) {
  const set = new Set();
  for (const f of frames) {
    if (!f.box) continue;
    for (let i = 0; i + 32 <= f.box.length; i++) set.add(f.box.subarray(i, i + 32).toString('hex'));
  }
  return set;
}

// Whether a thirty-two byte window of a box in `one` appears in a box in `other`.
export function sharesWindow(one, other) {
  const set = windowsOf(one);
  return other.some((f) => {
    if (!f.box) return false;
    for (let i = 0; i + 32 <= f.box.length; i++) if (set.has(f.box.subarray(i, i + 32).toString('hex'))) return true;
    return false;
  });
}

// A kit's ward B with a `Host`, the hand standing as a ward answering
// `answer`, and an observer forward `hand` between them that B's route names.
export async function withHandDoor(kit, answer, fn) {
  const stand = startStand(kit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', '--class', 'Host']);
  const hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer });
  const observer = createWorldObserver();
  try {
    const [b] = await stand.ready(1);
    await bootHost(stand, b.pk, 'h');
    await route(stand, b.pk, hand.pk, await observer.forward('hand', handAt(hand.at)));
    return await fn({ stand, b, hand, observer });
  } finally {
    observer.close();
    await Promise.all([stand.close(), hand.close()]);
  }
}

// A standing `id` B holds at the hand: knocked with `hello` and taken.
export async function standingAtHand({ stand, b, hand }, id) {
  const invitation = hand.invite();
  await knockAndTake(stand, b.pk, invitation, id);
  return { id, heir: invitation.heir, invitation };
}
