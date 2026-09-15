// Support for `test/s11.test.js` and `test/s12.test.js`: a second harbor of
// one kit standing the ward `A`, and the frame the observer recorded coming
// back for the first ask that crossed a forward after a mark.

import { LISTEN_HOST, containerAt } from '../../src/world.js';
import { startStand } from '../../src/root-driver.js';

// A harbor of `kit` of its own, standing the ward `A` under the seed the
// world's `A` has, from `file`, or from an empty partition when `file` is
// absent.
export async function harborOf(kit, file) {
  const stand = startStand(kit, ['--listen', `${LISTEN_HOST}:0`, '--ward', file ? `A=${file}` : 'A', '--class', 'Host']);
  const [ward] = await stand.ready(1);
  ward.at = containerAt(kit, ward.at);
  return { stand, ward };
}

// The first ask recorded as crossed on the forward `label` from `mark` on,
// and the frame that crossed back under its id on its connection.
export function exchangeAfter(frames, mark, label) {
  const i = frames.findIndex((f, n) => n >= mark && f.label === label && f.at === 'listener' && f.kind === 'ask');
  if (i < 0) return { ask: null, back: null };
  const ask = frames[i];
  const back = frames.find((f, n) => n > i && f.label === label && f.at === 'dialer' && f.conn === ask.conn && f.id === ask.id && !f.closed) ?? null;
  return { ask, back };
}
