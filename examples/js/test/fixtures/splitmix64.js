// Fixed entropy. A door record hands the ward SplitMix64, a written-down
// stream whose every byte is known, so its bytes can be replayed.

const MASK = (1n << 64n) - 1n;

// Each draw is one sixty-four bit word, spent least significant byte first;
// a count that is not a multiple of eight throws away the tail of its last
// word. `draws` counts the words spent.
export function splitmix64(seed) {
  let state = BigInt(seed) & MASK;

  function next() {
    state = (state + 0x9e3779b97f4a7c15n) & MASK;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    random.draws++;
    return z ^ (z >> 31n);
  }

  function random(count) {
    const out = new Uint8Array(count);
    for (let i = 0; i < count; i += 8) {
      const w = next();
      for (let j = 0; j < 8 && i + j < count; j++) out[i + j] = Number((w >> BigInt(8 * j)) & 0xffn);
    }
    return out;
  }

  random.draws = 0;
  return random;
}
