// The ward, chapters 2 and 5: its seed and its partition, with one door. It
// keeps every being it booted, builds every stance, mints every key, seals
// every ask that leaves and judges every one that arrives.
//
// The harbor hands it the ground once, at birth, and receives the door and the
// unsealed ask, whose holder is the ward's root.

import { createDoor, dispatch } from './door.js';
import { ROOT, freshId } from './partition.js';
import { wardKey } from './seal.js';
import { allowance, createSender, sendable } from './sender.js';
import { createStance } from './stance.js';
import { SILENCE, isObject, wordName } from './value.js';

export async function createWard({ seed, partition, instantiate, carry, random }) {
  const key = await wardKey(seed);
  const beings = new Map();
  const door = createDoor({ key, partition, beings, random });
  const sender = createSender({ key, partition, random, carry, door });
  const stance = createStance({ key, partition, random, sender, boot });

  // ---- birth ------------------------------------------------------------------

  // Instantiate, chapter 5: a class that throws while it is made is a being
  // who threw at birth, absent this run, her cells waiting.
  async function make(k, cls) {
    try {
      const being = await instantiate(cls, stance.stanceOf(k));
      if (being) beings.set(k, being);
      return being ? 'made' : 'no such class';
    } catch {
      return 'threw at birth';
    }
  }

  async function born(k, cls) {
    partition.beings[k] = { class: cls, cells: {}, standings: {}, occupants: {} };
    partition.relations[k] = { standings: {}, occupants: {}, knocks: {} };
    const made = await make(k, cls);
    if (made !== 'made') unmake(k);
    return made;
  }

  function unmake(k) {
    for (const heir of Object.values(partition.relations[k].occupants)) delete partition.heirs[heir];
    delete partition.beings[k];
    delete partition.relations[k];
    beings.delete(k);
    if (partition.public === k) partition.public = null;
  }

  // Boot, by a being of the ward. The one made has empty cells and no relation
  // but the one her maker named, made the way all of them are: she invites her
  // maker, and the maker knocks and takes. A relation that could not be made
  // is a boot that made nobody.
  async function boot(maker, cls, newKey, id) {
    if (typeof newKey !== 'string' || newKey === key.pk || Object.hasOwn(partition.beings, newKey)) return null;
    if (!freshId(partition, maker, id) || (await born(newKey, cls)) !== 'made') return null;
    const invitation = await stance.invite(newKey, maker, {});
    const answer = invitation && (await sender.knock(maker, invitation));
    if (answer && answer !== SILENCE && !wordName(answer) && (await sender.take(maker, id, invitation)) === id) return newKey;
    if (invitation) delete partition.relations[maker].knocks[`${invitation.ward}:${invitation.heir}`];
    unmake(newKey);
    return null;
  }

  // ---- the root -----------------------------------------------------------------

  // The one unsealed ask. The ward is a being to its root: its empty ask is its
  // describe. A throw inside is silence.
  async function root(method, args) {
    try {
      return await rootAnswer(method, isObject(args) ? args : {});
    } catch {
      return SILENCE;
    }
  }

  async function rootAnswer(method, a) {
    switch (method) {
      case undefined:
        return { asks: ROOT_ASKS, notes: {} };

      case 'boot': {
        if (typeof a.key !== 'string' || a.key === key.pk || Object.hasOwn(partition.beings, a.key)) return { error: 'key taken' };
        const made = await born(a.key, a.class);
        return made === 'made' ? { booted: a.key } : { error: made };
      }

      case 'public': {
        if (!beings.has(a.key)) return { error: 'not booted' };
        if (partition.public !== null && partition.public !== a.key && beings.has(partition.public)) return { error: 'a public being stands' };
        partition.public = a.key;
        return { public: a.key };
      }

      case 'invite': {
        if (!Object.hasOwn(partition.beings, a.being)) return { error: 'no such being' };
        return (await stance.invite(a.being, a.id, a.notes)) ?? { error: 'id taken' };
      }

      case 'knock': {
        if (!beings.has(a.being)) return { error: 'no such being' };
        const answer = await sender.knock(a.being, a.invitation, a.method, a.args, a.wanted);
        if (answer === SILENCE || wordName(answer)) return { error: wordName(answer) ?? 'silence' };
        return { taken: await sender.take(a.being, a.id, a.invitation), answer };
      }

      case 'remove': {
        if (!Object.hasOwn(partition.beings, a.being)) return { error: 'no such being' };
        return { removed: stance.remove(a.being, a.id) ? a.id : null };
      }

      // The root asks a being as the root, the public being included, and a
      // throw or a silence inside is silence.
      case 'ask': {
        const being = beings.get(a.being);
        if (!being) return { error: 'no such being' };
        if (!sendable(a.method, a.args)) return { error: 'unreached' };
        let timer;
        const late = new Promise((resolve) => (timer = setTimeout(resolve, allowance(a.wanted), { late: true })));
        const out = await Promise.race([dispatch(being, { id: ROOT }, a.method, a.args ?? {}), late]).finally(() => clearTimeout(timer));
        if (out.late) return { error: 'late' };
        return out.object === undefined ? SILENCE : out.object;
      }

      default:
        return { error: 'unknown ask' };
    }
  }

  // A restart is silent: every being whose record names a class is made again,
  // unasked, with the same cells. One who cannot be is absent this run.
  for (const [k, record] of Object.entries(partition.beings)) await make(k, record.class);

  return { door, ask: root };
}

const STRING = { type: 'string' };
const OBJECT = { type: 'object' };
const rootAsk = (name, description, properties, required = []) => ({ name, description, input: { type: 'object', properties, required } });

// What the ward can be asked by its root: capability, and never state.
const ROOT_ASKS = [
  rootAsk('boot', 'Boot a being of a class under a key.', { key: STRING, class: STRING }, ['key', 'class']),
  rootAsk('public', 'Mark a booted being public.', { key: STRING }, ['key']),
  rootAsk('invite', 'Mint an invitation on a being for an id.', { being: STRING, id: STRING, notes: {} }, ['being', 'id']),
  rootAsk('knock', 'Knock for a being with an invitation, and take it under an id.', { being: STRING, id: STRING, invitation: OBJECT, method: STRING, args: OBJECT, wanted: OBJECT }, ['being', 'id', 'invitation']),
  rootAsk('remove', 'Remove a relation, occupant or standing, from a being.', { being: STRING, id: STRING }, ['being', 'id']),
  rootAsk('ask', 'Ask a being as the root.', { being: STRING, method: STRING, args: OBJECT, wanted: OBJECT }, ['being']),
];
