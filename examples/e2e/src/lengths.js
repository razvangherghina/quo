// Lengths read on the wire, `quo/SPEC.md` "The box" and "What a carrier
// sees". A word or a silence is read by a box's length only against a
// reference the hand opened on that same door, so the references here are
// asks the hand sends to the door a line reads, whose replies it opens.

import { mintKey, randomSeed } from './hand.js';
import { dial, kindOf, opens } from './dial.js';
import { invite } from './standing.js';
import { Relation } from './relation.js';

export const SIZE = 1_048_576;
export const ASK_OVER = 160;
export const KNOCK_OVER = 1248;
export const REPLY_OVER = 112;

// The stranger's reply length at `wardPk` on `addr`: an ask naming a heir
// the ward never minted, opened by the hand and seen to be silence.
export async function strangerLength(addr, wardPk) {
  const d = dial(addr);
  try {
    const key = mintKey();
    const got = await d.ask(wardPk, key, { to: randomSeed().toString('hex'), by: key.signPk, next: null, seq: 1, time: 1000, method: 'hello', args: {} });
    if (got.reply?.silence !== true) throw new Error(`setup: the stranger reference: ${JSON.stringify(got.reply)}`);
    return got.frame.box.length;
  } finally {
    d.close();
  }
}

// The box length of the object `{hi: "x"}` with its `seen` at the door on
// `addr`: `stand`'s root invites an occupant `x` at `Host`, and the hand
// knocks, asks, and opens the object.
export async function objectLength(stand, wardPk, addr) {
  const d = dial(addr);
  try {
    const rel = new Relation(d, wardPk, await invite(stand, wardPk, 'x'));
    const knocked = await rel.knock();
    const got = await rel.ask();
    if (kindOf(knocked.reply) !== 'object' || got.reply?.object?.hi !== 'x') throw new Error(`setup: the object reference: ${JSON.stringify(got.reply)}`);
    return got.frame.box.length;
  } finally {
    d.close();
  }
}

// The length of the word `repeated` at `wardPk` on `addr`, on a relation the
// hand holds from `invitation`: it knocks, asks, presents that ask's box
// again, and opens the word.
export async function repeatedLength(addr, wardPk, invitation) {
  const d = dial(addr);
  try {
    const rel = new Relation(d, wardPk, invitation);
    const knocked = await rel.knock();
    if (!knocked.reply || !('object' in knocked.reply)) throw new Error(`setup: the word reference knock: ${JSON.stringify(knocked.reply)}`);
    const first = await rel.ask();
    const again = await d.send(wardPk, first.box);
    const read = again?.kind === 'reply' ? opens(first.lidSecret, again.box, wardPk) : null;
    if (read?.quo !== 'repeated') throw new Error(`setup: the word reference: ${JSON.stringify(read)}`);
    return again.box.length;
  } finally {
    d.close();
  }
}
