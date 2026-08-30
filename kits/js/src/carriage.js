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

// A hint is where to send bytes, and Quo never reads one: it is posted to
// exactly as given.
export async function post(hint, envelope) {
  const answer = await fetch(hint, { method: 'POST', body: envelope });
  const body = new Uint8Array(await answer.arrayBuffer());
  return body.length === 0 ? null : body;
}

// There are several hints and none is authoritative: a hint is a guess about
// the weather, so a caller tries them.
export async function reach(hints, envelope) {
  let last = null;
  for (const hint of hints) {
    try {
      return await post(hint, envelope);
    } catch (error) {
      last = error;
    }
  }
  if (last) throw last;
  return null;
}
