import { NoRoad, Weather } from './refusal.js';

// What a host hands a warden and the kit does not want to make it write twice:
// seeds drawn from its randomness, a store that keeps the records in memory,
// and a delivery that hands bytes straight to another warden in the same
// process — the road of distance zero, which waives no step.

export function seeds(random) {
  return { name: random(), padlock: random(), heir: random() };
}

export class MemoryStore {
  constructor() {
    this.snapshot = null;
  }
  async save(snapshot) {
    this.snapshot = snapshot;
  }
  async load() {
    return this.snapshot;
  }
}

// Delivery's three rules, at distance zero: a row with hints is handed to the
// first door attached under one of them; a hint nothing is attached under is a
// door that is down, which at distance zero is the whole of weather; a row
// without hints has no road at all. Both are thrown, apart.
// What delivery is given per row is the way back and nothing else.
export function memoryDelivery() {
  const doors = new Map();
  const watchers = [];
  return {
    attach(hint, warden) {
      doors.set(hint, warden);
    },
    detach(hint) {
      doors.delete(hint);
    },
    watch(fn) {
      watchers.push(fn);
    },
    async send(row, envelope) {
      for (const fn of watchers) fn(row);
      for (const hint of row.hints) {
        const far = doors.get(hint);
        if (!far) continue;
        return far.arrive(envelope);
      }
      if (row.hints.length === 0) throw new NoRoad(row.hints);
      throw new Weather(row.hints);
    },
  };
}
