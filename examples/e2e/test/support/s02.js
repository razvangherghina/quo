// What `quo/SCENARIOS.md` chapter 2, "Keys rotate", needs beside `src/`: a
// door written from `quo/SPEC.md` "Keys" and "The count" that stands on the
// hand and breaks one rule on demand, a kit's door the hand dials, and the
// lengths a line reads an ask box by.

import { LISTEN_HOST, withWorld } from '../../src/world.js';
import { standHand, verifyWard } from '../../src/hand.js';
import { dial } from '../../src/dial.js';
import { digestOf, invite } from '../../src/standing.js';

// A kit's ward standing as A, the door the hand asks, with the other kit as
// B beside it: `{ world, pk, dialer, invite(id), digest() }`.
export function kitDoor(doorKit, askerKit, fn) {
  return withWorld({ doorKit, askerKit }, async (world) => {
    const dialer = dial(world.a.at);
    try {
      await dialer.ready;
      return await fn({
        world,
        pk: world.a.pk,
        dialer,
        invite: (id) => invite(world.door, world.a.pk, id),
        digest: () => digestOf(world.door, world.a.pk),
      });
    } finally {
      dialer.close();
    }
  });
}

// A door the hand stands, judging keys and the count as `SPEC.md` "Keys" and
// "The count" say, and breaking the one rule `breaks` names, so a line's
// check is shown to throw for a door that breaks it. Its digest counts what
// it wrote. Its edge keys are the hand's own, `hand.js` `standHand`.
export async function brokenDoor(breaks, fn) {
  const rels = new Map();
  let writes = 0;
  const signed = (ask) => /^[0-9a-f]{64}$/.test(ask.payload.by ?? '') && verifyWard(ask.payloadBytes, ask.signature, ask.payload.by + '0'.repeat(64));
  const answerOf = (method) => (method === 'quiet' ? { silence: true } : { object: { hi: 'hand' }, seen: null });

  function honour(r, n) {
    if (!Number.isInteger(n) || n < 1) return false;
    if (n > r.mark) r.mark = n;
    else if (n === r.mark || n <= r.mark - 64 || r.spent.has(n)) return false;
    r.spent.add(n);
    return true;
  }

  function answer(ask) {
    const p = ask.payload;
    if (!p || typeof p !== 'object' || !ask.heir) return { silence: true };
    let r = rels.get(ask.heir);
    if (!r) {
      if (!breaks.adoptsUnknownHeir) return { silence: true };
      r = { fresh: false, held: p.by, vouched: null, mark: 0, spent: new Set(), old: new Set() };
      rels.set(ask.heir, r);
    }
    const sigOk = breaks.noVerify || signed(ask);
    if (r.fresh) {
      if (p.by !== ask.heir || !sigOk) return { silence: true };
      if (p.next === null || p.next === ask.heir) return { quo: 'unannounced' };
    } else {
      const admitted = p.by === r.held || p.by === r.vouched || (breaks.heirStillAdmitted && p.by === ask.heir) || (breaks.keepOldVouched && r.old.has(p.by));
      if (!admitted || !sigOk) return { silence: true };
    }
    if (!honour(r, p.seq)) {
      if (breaks.vouchOnRefusal && p.next) {
        r.vouched = p.next;
        writes += 1;
      }
      return { quo: 'repeated' };
    }
    for (const n of breaks.alsoSpends ?? []) {
      r.spent.add(n);
      r.mark = Math.max(r.mark, n);
    }
    if (r.fresh) {
      Object.assign(r, { fresh: false, held: p.next, vouched: null });
    } else if (p.by !== r.held && p.by === r.vouched) {
      if (!breaks.vouchedSpeaksOnce) r.held = p.by;
      r.vouched = p.next;
    } else if (p.next !== null) {
      if (!(breaks.nextEqualHeldIgnored && p.next === p.by)) r.vouched = p.next;
    } else if (breaks.forgetVouchedOnNull) {
      r.vouched = null;
    }
    if (r.vouched) r.old.add(r.vouched);
    writes += 1;
    return answerOf(p.method);
  }

  const hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer });
  const dialer = dial(hand.at);
  try {
    await dialer.ready;
    return await fn({
      pk: hand.pk,
      dialer,
      async invite() {
        const invitation = hand.invite();
        rels.set(invitation.heir, { fresh: true, held: null, vouched: null, mark: 0, spent: new Set(), old: new Set() });
        return invitation;
      },
      digest: async () => String(writes),
    });
  } finally {
    dialer.close();
    await hand.close();
  }
}

// A hook on the observer's `label` that keeps the n-th ask frame from
// crossing (`{ ask: n }`) or the reply to it (`{ replyTo: n }`), counted from
// when it is set.
export function dropOne(observer, label, { ask, replyTo }) {
  let count = 0;
  const doomed = new Set();
  observer.hook(label, {
    listener(entry, raw, { write }) {
      count += 1;
      if (count === replyTo) doomed.add(`${entry.conn}:${entry.id}`);
      if (count !== ask) write(raw);
    },
    dialer(entry, raw, { write }) {
      const key = `${entry.conn}:${entry.id}`;
      if (doomed.has(key)) doomed.delete(key);
      else write(raw);
    },
  });
}

// The lengths a `hello` or `quiet` payload of one-digit `seq` can have as a
// kit writes it with no whitespace: `to` and `by` in hex, `next` in hex or
// null, `time` of one to six digits, `args` absent or `{}`. A box with no
// ciphertext is its payload plus 160, a knock's plus 1,248.
const HEX = '0'.repeat(64);
const BARE = JSON.stringify({ to: HEX, by: HEX, next: HEX, seq: 1, time: 1, method: 'hello' }).length - 1;
const PAYLOADS = [1, 2, 3, 4, 5, 6].flatMap((d) => [0, `"${HEX}"`.length - 'null'.length].flatMap((n) => [BARE + d - n, BARE + d - n + ',"args":{}'.length]));
export const plainAsk = (box) => PAYLOADS.includes(box.length - 160);
export const knockAsk = (box) => PAYLOADS.includes(box.length - 1248);
