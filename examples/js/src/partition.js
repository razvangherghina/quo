// The partition, chapter 5, and the ids a being mints, chapter 4.
//
// The partition is the ward's state as values, opaque to the harbor:
//
//   beings  by key: her class, her cells and her two records, what is hers
//   relations  by key: the keys, edge keys and counts of her standings and
//              her knocks, and the heir of each occupant, what is the ward's
//   heirs      by heir pk: the door's view of each occupant, the two signing
//              keys and the two edge keys, open and offered
//   removed    by heir pk: the keys and edge keys the door held when an id
//              was removed
//   public     the key of the public being, or null
//   lock       the ward's ML-KEM-768 lock, d then z as 128 hex, drawn at its
//              first invite that names a heir, or null before

export const emptyPartition = () => ({ beings: {}, relations: {}, heirs: {}, removed: {}, public: null, lock: null });

// A kit reserves whatever names its own spelling of the stance would collide
// with, and refuses them at invite and at take. Here: `ROOT`, the root's asker
// id; `then`, which would make her standings a thenable; `__proto__`, which is
// no ordinary key of an object.
export const ROOT = 'ROOT';
const RESERVED = new Set([ROOT, 'then', '__proto__']);

// One id names one record, occupant or standing, since the two are one
// namespace.
export const freshId = (partition, k, id) =>
  typeof id === 'string' &&
  !RESERVED.has(id) &&
  Object.hasOwn(partition.beings, k) &&
  !Object.hasOwn(partition.beings[k].occupants, id) &&
  !Object.hasOwn(partition.beings[k].standings, id);
