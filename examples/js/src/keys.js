// Keys, chapter 3. The door holds two pks for a heir: the one held, which may
// speak now, and the one vouched for, which it admits when it speaks. The
// door's move is arithmetic, and it moves on an honoured ask and on nothing
// else.
//
// Beside them it holds two edge keys: open, the one that last opened an
// honoured ask on the heir, and offered, the one derived from the reply to
// the last choice.

import { ZERO_EDGE_KEY } from './seal.js';

const REMOVED_BOUND = 64;

// The edge keys an ask for this heir is tried under, in order. A zero head, or
// a heir never minted here: the zero edge key. A fresh heir: the ward's lock,
// since a knock carries its own edge key in its ciphertext. A spent heir, or
// one removed after it spoke: open, then offered when one is held.
export function edges(partition, to) {
  const heir = partition.heirs[to] ?? partition.removed[to];
  if (!heir) return [ZERO_EDGE_KEY];
  if (heir.fresh) return { lock: partition.lock };
  return heir.offered ? [heir.open, heir.offered] : [heir.open];
}

// The edge key an ask opened under still stands: open or offered for that
// heir. A heir still fresh was opened under its knock's own ciphertext.
export const edgeStands = ({ heir, removed }, edge) => {
  const h = heir ?? removed;
  return h.fresh || edge === h.open || edge === h.offered;
};

// The edge keys move with a choice. The key the ask opened under becomes
// open, the knock's edge key on a knock, and the same key again when it was
// open already; the key derived from it and the reply's agreement is offered.
export function moveEdges(heir, edge, offered) {
  Object.assign(heir, { open: edge, offered });
}

// Admission: the key held for the heir, or the key vouched for, or a key the
// door held when the id was removed. Anything else is a stranger.
export function admit(partition, { to, by }) {
  const heir = partition.heirs[to];
  if (heir) return by === heir.held || by === heir.vouched ? { heir } : null;
  const removed = partition.removed[to];
  if (removed) return by === removed.held || by === removed.vouched ? { removed } : null;
  return null;
}

// The door's move. On a fresh heir the honoured ask is a knock: the key it
// announced becomes the key held, the heir dies as it speaks, and nothing is
// vouched for. On a heir already spent the key that signed becomes the key
// held and the other is forgotten; the key announced becomes the key vouched
// for, and an ask that announces nothing leaves the vouched key as it stood.
export function move(heir, { by, next }) {
  if (heir.fresh) {
    Object.assign(heir, { held: next, vouched: null, fresh: false });
  } else if (by === heir.vouched) {
    Object.assign(heir, { held: by, vouched: next });
  } else if (next !== null) {
    heir.vouched = next;
  }
}

// A removed id whose heir has spoken leaves the door the key held and the key
// vouched for, and the edge keys beside them, so the removed key's ask still
// opens and hears `removed`. A heir removed before it spoke was never bound
// and leaves nothing. How long is the ward's own: here the last sixty-four,
// oldest out.
export function removeHeir(partition, pk) {
  const { held, vouched, fresh, open, offered } = partition.heirs[pk];
  delete partition.heirs[pk];
  if (fresh) return;
  partition.removed[pk] = { held, vouched, open, offered };
  const names = Object.keys(partition.removed);
  for (const old of names.slice(0, Math.max(0, names.length - REMOVED_BOUND))) delete partition.removed[old];
}
