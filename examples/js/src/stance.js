// The stance, chapter 4: what a being is handed at birth. Her cells, her
// standings and six calls, and nothing else.

import { hex } from './arithmetic.js';
import { removeHeir } from './keys.js';
import { freshId } from './partition.js';
import { beingPk, lockKeys } from './seal.js';
import { copy, isValue } from './value.js';

export function createStance({ key, partition, random, sender, boot }) {
  // The stance of the being under key `k`, one plain object of closures.
  function stanceOf(k) {
    return {
      cells: guard(partition.beings[k].cells, 0),
      standings: shown(partition.beings[k].standings),
      invite: (id, notes) => invite(k, id, notes),
      remove: (id) => void remove(k, id),
      knock: (invitation, method, args, wanted) => sender.knock(k, invitation, method, args, wanted),
      take: (id, invitation) => sender.take(k, id, invitation),
      ask: (id, method, args, wanted) => sender.ask(k, id, method, args, wanted),
      boot: (cls, newKey, id) => boot(k, cls, newKey, id),
    };
  }

  // Invite. The occupant record exists from this moment, holding her notes.
  // The ward keeps the heir pk beside the id and gives the secret away, with
  // its lock's encapsulation key. The lock is drawn once, at the first invite
  // that finds none, before that invite's heir secret.
  async function invite(k, id, notes = {}) {
    if (!freshId(partition, k, id) || !isValue(notes)) return null;
    partition.lock ??= hex(random(64));
    const secret = random(32);
    const heir = await beingPk(secret);
    if (!freshId(partition, k, id)) return null;
    partition.heirs[heir] = { being: k, id, held: heir, vouched: null, fresh: true, mark: 0, spent: [] };
    partition.relations[k].occupants[id] = heir;
    partition.beings[k].occupants[id] = { id, notes: copy(notes) };
    return { ward: key.pk, heir, secret: hex(secret), lock: hex(lockKeys(partition.lock).ek) };
  }

  // Remove. An id, occupant or standing, goes; removing what is not there is
  // nothing. The answer says whether something went.
  function remove(k, id) {
    if (typeof id !== 'string' || !partition.relations[k]) return false;
    const relations = partition.relations[k];
    if (Object.hasOwn(relations.occupants, id)) {
      if (partition.heirs[relations.occupants[id]]) removeHeir(partition, relations.occupants[id]);
      delete relations.occupants[id];
      delete partition.beings[k].occupants[id];
      return true;
    }
    if (Object.hasOwn(relations.standings, id)) {
      delete relations.standings[id];
      delete partition.beings[k].standings[id];
      return true;
    }
    return false;
  }

  return { stanceOf, invite, remove };
}

// Her standings are her ward's records of them, handed to her to read: the id,
// the blueprint she was told, its digest and the last `seen`. She writes none
// of them, since the ward compares her digest to what the far door says.
function shown(target) {
  const refuse = () => {
    throw new TypeError('standings are read, never written');
  };
  return new Proxy(target, {
    get(t, p) {
      const v = t[p];
      return typeof p === 'string' && v !== null && typeof v === 'object' ? shown(v) : v;
    },
    set: refuse,
    defineProperty: refuse,
    deleteProperty: refuse,
  });
}

// Her cells hold values and refuse anything else where she wrote it, in her
// own frame. The guard reaches all the way down, since a container read
// through her cells is her cells, and it counts how deep it reached, so a
// write deep inside a cell is held to the bound of the whole cell.
function guard(target, depth) {
  return new Proxy(target, {
    get(t, p) {
      const v = t[p];
      return typeof p === 'string' && v !== null && typeof v === 'object' ? guard(v, depth + 1) : v;
    },
    set(t, p, v) {
      if (typeof p !== 'string' || !isValue(v, depth)) throw new TypeError(`cells refuse ${String(p)}`);
      if (p === '__proto__') Object.defineProperty(t, p, { value: copy(v), enumerable: true, writable: true, configurable: true });
      else t[p] = copy(v);
      return true;
    },
    defineProperty() {
      throw new TypeError('cells take values by assignment');
    },
  });
}
