// A memory harbor. It boots wards, holds the class bodies, keeps each ward's
// partition as this process's objects, and carries bytes to the doors it
// stands. It judges nothing and reads no partition. It keeps nothing past the
// process, so it needs neither `wrote`, `keep` nor `calling`.

import { wardKey } from './seal.js';
import { createWard } from './ward.js';

// Random, chapter 5: a count in, that many bytes of the platform's entropy out.
export const random = (count) => globalThis.crypto.getRandomValues(new Uint8Array(count));

export class MemoryHarbor {
  #classes;
  #random;
  #doors = new Map(); // ward pk -> door, for the wards this harbor booted

  constructor(ground) {
    this.#classes = ground.classes;
    this.#random = ground.random;
  }

  // The ground, once, at birth; the door and the ask back. The pk comes from
  // the seed and from nothing else, which is where the ward's comes from too.
  async boot(seed, partition) {
    const ward = await createWard({
      seed,
      partition,
      random: this.#random,
      instantiate: (cls, stance) => (Object.hasOwn(this.#classes, cls) ? new this.#classes[cls](stance) : null),
      carry: (pk, bytes) => this.carry(pk, bytes),
    });
    const { pk } = await wardKey(seed);
    this.#doors.set(pk, ward.door);
    return { pk, door: ward.door, ask: ward.ask };
  }

  // The carrier: bytes to a ward key in, bytes or nothing out, and nothing
  // means not delivered. Bytes are copied across, never referenced, even
  // between two doors of one harbor.
  async carry(pk, bytes) {
    const door = this.#doors.get(pk);
    return door ? (await door(bytes.slice())).bytes.slice() : null;
  }
}
