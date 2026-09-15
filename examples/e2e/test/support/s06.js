// Support for `SCENARIOS.md` chapter 6, "Values across two languages",
// that no other scenario shares. The hand writes each payload's exact text,
// since no JavaScript value spells `9007199254740993`, `-0`, `1.0`, a
// duplicate key or bytes that are not UTF-8. It dials A's door through the
// observer, and every observation joins what the hand sent, what the
// observer measured crossing, what the reply opens to under the lid the
// hand holds, and two partition digests. Every checker throws on an
// observation that breaks its claim, so a test shows it rejecting a broken
// run before it accepts the kept one.

import assert from 'node:assert/strict';
import { withWorld } from '../../src/world.js';
import { mintKey, sealAskBytes } from '../../src/hand.js';
import { dial, opens } from '../../src/dial.js';
import { strangerLength } from '../../src/lengths.js';
import { digestOf, invite } from '../../src/standing.js';

export const hexText = (s) => JSON.stringify(s);

// One payload's text from `[name, literal text]` pairs, in the order given,
// with no whitespace. A pair whose text is `undefined` is left out.
export function payloadText(fields) {
  return `{${fields.filter(([, v]) => v !== undefined).map(([k, v]) => `"${k}":${v}`).join(',')}}`;
}

// An array nested `n` deep around a zero, as text: depth `n`.
export function nested(n) {
  return `${'['.repeat(n)}0${']'.repeat(n)}`;
}

// The greatest number of containers on any path inward, `SPEC.md` "Values".
export function depthOf(v) {
  if (v === null || typeof v !== 'object') return 0;
  const inner = Object.values(v).map(depthOf);
  return 1 + (inner.length ? Math.max(...inner) : 0);
}

// Stands the world with `doorKit`'s ward as A, and hands `fn` the tools a
// chapter 6 line needs against A's door.
export async function withDoor(doorKit, askerKit, fn) {
  return withWorld({ doorKit, askerKit }, async (world) => {
    const { door, a, observer, obsForDoor } = world;
    const dialers = [];
    const newDialer = () => {
      const d = dial(obsForDoor);
      dialers.push(d);
      return d;
    };
    const main = newDialer();
    let ids = 0;

    // A fresh heir at A's `Host`: its id, its heir key (which knocks) and a
    // key of the hand's own to announce in `next`.
    async function heir() {
      const id = `v${++ids}`;
      const invitation = await invite(door, a.pk, id);
      return { id, invitation, heirKey: mintKey(invitation.secret, invitation.lock), own: mintKey() };
    }

    // The seven fields as text for a knock on `h`, each overridable by
    // literal text; `undefined` leaves a field out.
    const knockFields = (h, over = {}) => [
      ['to', hexText(h.invitation.heir)],
      ['by', hexText(h.heirKey.signPk)],
      ['next', hexText(h.own.signPk)],
      ['seq', '1'],
      ['time', '1000'],
      ['method', '"hello"'],
      ['args', '{}'],
    ].map(([k, v]) => [k, k in over ? over[k] : v]);

    // Sends `bytes` signed by `signKey` (over `signBytes` when given), with
    // the head naming `to`, and observes what crossed and what A wrote.
    async function observe(bytes, signKey, { to, signBytes, dialer = main, allowanceMs = 5000, digests = true } = {}) {
      const payloadBytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes, 'utf8');
      const signer = signBytes ? { ...signKey, sign: () => signKey.sign(Buffer.from(signBytes, 'utf8')) } : signKey;
      const before = digests ? await digestOf(door, a.pk) : undefined;
      const { box, lidSecret } = sealAskBytes(a.pk.slice(64), signer, payloadBytes, to);
      const got = await dialer.send(a.pk, box, allowanceMs);
      const after = digests ? await digestOf(door, a.pk) : undefined;
      const askFrame = observer.frames.find((f) => f.label === 'door' && f.at === 'listener' && f.kind === 'ask' && f.box.equals(box));
      const replyFrame = askFrame
        ? observer.frames.find((f) => f.label === 'door' && f.at === 'dialer' && f.conn === askFrame.conn && f.id === askFrame.id && f.t > askFrame.t)
        : undefined;
      const reply = got?.kind === 'reply' ? opens(lidSecret, got.box, a.pk) : null;
      return { payloadBytes, askFrame, replyFrame, reply, wrote: digests ? before !== after : undefined };
    }

    // The stranger's length, a reference the hand opened on this door.
    const stranger = await strangerLength(obsForDoor, a.pk);

    // Refused: the reply crossed as a reply of the stranger's length, opens
    // to silence signed by A, and two digests show A wrote nothing.
    function refused(obs) {
      assert.equal(obs.replyFrame?.kind, 'reply', 'a reply crossed');
      assert.equal(obs.replyFrame.box.length, stranger, "the reply is the stranger's length");
      assert.deepEqual(obs.reply, { silence: true }, 'the reply opens to silence');
      assert.equal(obs.wrote, false, 'A wrote nothing');
    }

    // Answered: the reply opens to an object, and `check` holds of it.
    function answered(obs, check) {
      assert.equal(obs.replyFrame?.kind, 'reply', 'a reply crossed');
      assert.ok(obs.reply && 'object' in obs.reply, `the reply opens to an object: ${JSON.stringify(obs.reply)}`);
      check(obs.reply.object, obs);
    }

    // A word to a bound key.
    function word(obs, w) {
      assert.equal(obs.replyFrame?.kind, 'reply', 'a reply crossed');
      assert.deepEqual(obs.reply, { quo: w }, `the reply opens to ${w}`);
    }

    try {
      return await fn({ world, a, heir, knockFields, observe, refused, answered, word, newDialer });
    } finally {
      for (const d of dialers) d.close();
    }
  });
}

// The broken run: `check` must reject the observation.
export function rejects(check, label) {
  assert.throws(check, assert.AssertionError, `the check rejects ${label}`);
}
