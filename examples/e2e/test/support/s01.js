// Support for `quo/SCENARIOS.md` chapters 1 and 5: the world with a second
// forward the hand dials, the observer's two moves these chapters need that
// no other chapter shares (a reply forged under a key that is not the
// ward's, knocks held until both racers arrived), and the checks each line
// runs over what crossed. Every check is a plain function that throws on
// evidence where its claim does not hold.

import assert from 'node:assert/strict';
import { withWorld } from '../../src/world.js';
import { encodeFrame } from '../../src/observer.js';
import { frameAsk, mintKey, sealAsk, sealReply } from '../../src/hand.js';
import { dial, opens } from '../../src/dial.js';
import { askOn, digestOf, invite, knock, sleep } from '../../src/standing.js';

// A payload to the public being with the defaults of "The beings".
export function publicPayload(key, over = {}) {
  return { to: null, by: key.signPk, next: null, seq: 1, time: 1000, method: 'hello', args: {}, ...over };
}

// The world, and `hand`, a forward labelled `hand` to A's listener that the
// hand dials. B reaches A through the world's forward labelled `door`.
export function withEdge({ doorKit, askerKit }, story) {
  return withWorld({ doorKit, askerKit }, async (world) => {
    const { door, asker, a, b, observer } = world;
    const handAddr = await observer.forward('hand', a.at);
    const dialers = [];
    const w = {
      ...world,
      handAddr,
      dial(addr = handAddr) {
        const d = dial(addr);
        dialers.push(d);
        return d;
      },
      invite: (id) => invite(door, a.pk, id),
      knock: (invitation, method = 'hello', args) => knock(asker, b.pk, invitation, { method, args }),
      take: (id, invitation) => asker.request({ ward: b.pk, method: 'take', args: { being: 'h', id, invitation } }),
      ask: (id, method = 'hello') => askOn(asker, b.pk, id, { method }),
      digest: () => digestOf(door, a.pk),
      // What `act` answered, with every frame that crossed meanwhile and
      // `quiet` milliseconds after.
      async during(act, quiet = 0) {
        const from = observer.frames.length;
        const result = await act();
        if (quiet) await sleep(quiet);
        return { result, frames: observer.frames.slice(from).filter((f) => !f.closed) };
      },
    };
    try {
      return await story(w);
    } finally {
      for (const d of dialers) d.close();
    }
  });
}

// The observer replaces the next `n` replies crossing `label` with replies
// sealed to their lids and signed by a key that is not the ward's.
export function forgeReplies(observer, label, n = 1) {
  let left = n;
  observer.hook(label, {
    dialer: (entry, raw, tools) => {
      if (left > 0 && entry.kind === 'reply' && tools.ask) {
        left -= 1;
        if (left === 0) observer.hook(label, null);
        const lid = tools.ask.box.subarray(0, 32).toString('hex');
        const { box } = sealReply(lid, mintKey(), { object: { hi: 'forged' }, seen: null });
        tools.write(encodeFrame({ kind: 'reply', id: entry.id, box }));
        return;
      }
      tools.write(raw);
    },
  });
}

// The observer holds the first knock-sized ask on each label until one has
// arrived on every label, then lets them go in the order the labels are
// named, `gap` milliseconds apart. A knock is 1,248 bytes longer than its
// payload, every other ask 160.
export function holdKnocks(observer, labels, gap = 0) {
  const held = new Map();
  const release = async () => {
    for (const label of labels) observer.hook(label, null);
    for (const [i, label] of labels.entries()) {
      if (i && gap) await sleep(gap);
      held.get(label)?.();
    }
  };
  const timer = setTimeout(release, 5000);
  for (const label of labels) {
    observer.hook(label, {
      listener: (entry, raw, tools) => {
        if (entry.kind !== 'ask' || entry.box.length < 1248 || held.has(label)) return tools.write(raw);
        held.set(label, () => tools.write(raw));
        if (held.size === labels.length) {
          clearTimeout(timer);
          release();
        }
      },
    });
  }
}

// Seals one ask and writes it once; the observer may carry it more than
// once. Answers what each reply under its id opens to, up to `n`.
export async function askReplies(d, wardPk, signKey, payload, { n = 2, ms = 3000, edge } = {}) {
  const sealed = sealAsk(wardPk.slice(64), signKey, payload, edge);
  const id = d.mintId();
  await d.write(frameAsk(id, wardPk, sealed.box));
  const frames = await d.frames(id, n, ms);
  return frames.map((f) => (f.kind === 'reply' ? opens(sealed.lidSecret, f.box, wardPk) : null));
}

// The observer writes every ask crossing `label` twice while `on()` holds.
export function replayAsks(observer, label, on) {
  observer.hook(label, {
    listener: (entry, raw, tools) => {
      tools.write(raw);
      if (entry.kind === 'ask' && on()) tools.write(raw);
    },
  });
}

// ---- checks over what crossed ----

// At least one ask frame to `ward` crossed, and each has a reply frame back
// under its id on its connection.
export function checkReplied(frames, ward) {
  const asks = frames.filter((f) => f.kind === 'ask' && f.ward === ward);
  assert.ok(asks.length >= 1, 'an ask frame crossed');
  for (const ask of asks) {
    assert.ok(
      frames.some((f) => f.kind === 'reply' && f.label === ask.label && f.conn === ask.conn && f.id === ask.id),
      `a reply frame crossed for ask ${ask.id}`,
    );
  }
}

export function checkObject(answer, expected) {
  assert.ok(answer && typeof answer === 'object' && 'object' in answer, `an object: ${JSON.stringify(answer)}`);
  if (expected !== undefined) assert.deepEqual(answer.object, expected);
}

export function checkSilence(answer) {
  assert.ok(answer && answer.silence === true && !('object' in answer) && !('quo' in answer), `silence: ${JSON.stringify(answer)}`);
}

export function checkWord(answer, word) {
  assert.ok(answer && answer.quo === word && !('object' in answer), `the word ${word}: ${JSON.stringify(answer)}`);
}

// A kit asker read the object the far door answered, and the exchange
// crossed the wire.
export function checkAnswered({ result, frames }, ward, expected) {
  checkObject(result, expected);
  checkReplied(frames, ward);
}

// No frame crossed at all.
export function checkNoFrames({ frames }) {
  assert.equal(frames.length, 0, `no frame crossed: ${frames.map((f) => `${f.label}:${f.kind}:${f.id}`).join(' ')}`);
}

// The stranger's refusal: silence, every reply box back the stranger's
// length, and the door's partition unwritten.
export function checkStranger({ result, frames }, ward, strangerLen, before, after) {
  checkSilence(result);
  checkReplied(frames, ward);
  for (const f of frames.filter((x) => x.kind === 'reply')) assert.equal(f.box.length, strangerLen, "the stranger's length");
  assert.equal(after, before, 'the partition digest is unchanged');
}
