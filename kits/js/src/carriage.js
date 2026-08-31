// The common carriage. Quo uses the hint as the whole address, one POST, bytes
// in and bytes out, and nothing else HTTP offers: the hint a warden published
// is the URL, posted to exactly as given — no path is appended, no query is
// added, no header is read, no status code carries meaning. Any meaning in the
// carriage would be meaning outside the seal, and there is none.
//
// The response body is the sealed answer, and an empty body is silence's wire
// form; those two are the whole of what the carriage says back.
//
// Calling out is `fetch`, which every ground has, so this file names no host
// and runs wherever the kit does. Listening is the half that cannot be
// portable, and it lives in `door.js` behind its own export.
//
// This file is also where a caller works out which roads it can speak, because
// choosing among the hints a peer offered is the caller's whole job. It works
// it out by trying, never by being told.

// A hint is where to send bytes, and Quo never reads one: it is posted to
// exactly as given.
export async function post(hint, envelope) {
  const answer = await fetch(hint, { method: 'POST', body: envelope });
  const body = new Uint8Array(await answer.arrayBuffer());
  return body.length === 0 ? null : body;
}

// Which roads this ground can speak is not configured and not passed: the
// caller finds out by trying to pick one up. A browser has no socket under it,
// so the line does not load and the carriage is all there is; a ground that has
// one loads it once and takes a `tcp://` hint from then on.
//
// The specifier is held in a variable on purpose. A bundler that could follow
// it would pull `node:net` into a browser build and fail there, which is the
// one place this must not fail — so the load stays a runtime question, asked
// once and answered by the platform.
const LINE = './line.js';
let picked;

async function lineRoad() {
  if (picked === undefined) {
    try {
      picked = await import(LINE);
    } catch {
      picked = null;
    }
  }
  return picked;
}

// The lines a ground holds, one per road it has dialled, kept because the line
// is persistent by definition: a fresh connection per ask would be the common
// carriage wearing a socket, and it would leave a ground that publishes nothing
// unreachable between calls. They belong to the ground, so they are keyed by
// its warden and go when it hangs up.
const held = new WeakMap();

async function overLine(road, hint, envelope, { warden, clock, random, far, seq }) {
  let lines = held.get(warden);
  if (!lines) held.set(warden, (lines = new Map()));
  let line = lines.get(hint);
  if (!line || !line.open) {
    line = await road.dial(warden, hint, { clock, random });
    lines.set(hint, line);
  }
  // The ask is named by the far warden and the number it was sealed with, both
  // of them the caller's own knowledge of the ask it built. Handed neither,
  // this is a say and nothing is waited for.
  return line.carry(envelope, far && seq !== undefined ? { warden: far, seq } : null);
}

// Let go of every line this ground dialled. A line is a held resource and the
// ground that took it up is the one that puts it down.
export function hangUp(warden) {
  for (const line of held.get(warden)?.values() ?? []) line.close();
  held.delete(warden);
}

// There are several hints and none is authoritative: a hint is a guess about
// the weather, so a caller tries them.
export async function reach(hints, envelope, over = null) {
  let last = null;
  for (const hint of hints) {
    try {
      if (hint.startsWith('tcp://')) {
        // A road this ground cannot speak is not a road that failed to carry:
        // nothing was sent, so it is not weather either. The caller moves on
        // exactly as it would past a hint it had never been offered.
        const road = over && (await lineRoad());
        if (!road) continue;
        return await overLine(road, hint, envelope, over);
      }
      return await post(hint, envelope);
    } catch (error) {
      last = error;
    }
  }
  if (last) throw last;
  return null;
}
