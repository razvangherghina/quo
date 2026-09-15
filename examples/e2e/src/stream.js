// The fixed stream of `quo/vectors/HARNESS.md` section 6, SplitMix64 from a
// 64-bit seed, each draw spent eight bytes, least significant byte first.
// The hand draws its own keys from one when the trace fixes entropy.

const MASK = (1n << 64n) - 1n;

export function splitmix64(seed) {
  let state = BigInt(seed) & MASK;
  let spare = Buffer.alloc(0);
  const word = () => {
    state = (state + 0x9e3779b97f4a7c15n) & MASK;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    z ^= z >> 31n;
    const bytes = Buffer.alloc(8);
    bytes.writeBigUInt64LE(z);
    return bytes;
  };
  return (count) => {
    while (spare.length < count) spare = Buffer.concat([spare, word()]);
    const out = spare.subarray(0, count);
    spare = spare.subarray(count);
    return Buffer.from(out);
  };
}
