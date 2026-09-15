// Ground for `SCENARIOS.md` chapters 9 and 10 that no other scenario
// shares: a kit's ward B with the hand standing as its door behind an
// observer, a pair of kit wards whose asker holds `Caller`, `Caller` booted
// with a `Host` of her own, the hand asking itself so a payload no kit writes
// crosses a real wire, the frames of one ask and its reply read off the
// observer, and a root line written by hand for a value `JSON.stringify`
// cannot write.

import { LISTEN_HOST, containerAt, createWorldObserver, handAt } from '../../src/world.js';
import { bootHost, startStand } from '../../src/root-driver.js';
import { mintKey, standHand } from '../../src/hand.js';
import { dial } from '../../src/dial.js';
import { route } from '../../src/standing.js';

const classArgs = (classes) => classes.flatMap((c) => ['--class', c]);

// A kit's ward B with `Host` booted under `h`, and the hand standing as a
// door behind the observer under the label `hand`, B routed to it.
export async function standAtHand(kit, answer, { classes = ['Host'] } = {}) {
  const stand = startStand(kit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', ...classArgs(classes)]);
  const hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer: (ask) => answer(ask) });
  const observer = createWorldObserver();
  const close = () => Promise.all([observer.close(), stand.close(), hand.close()]);
  try {
    const [b] = await stand.ready(1);
    await bootHost(stand, b.pk, 'h');
    const via = await observer.forward('hand', handAt(hand.at));
    await route(stand, b.pk, hand.pk, via);
    return { stand, b, hand, observer, label: 'hand', close };
  } catch (e) {
    await close();
    throw e;
  }
}

// Two kits' wards, A the door and B the asker, `Host` booted under `h` on
// each, B routed to A behind the observer under the label `door`.
export async function standPair(doorKit, askerKit, { askerClasses = ['Host'] } = {}) {
  const door = startStand(doorKit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'A', '--class', 'Host']);
  const asker = startStand(askerKit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', ...classArgs(askerClasses)]);
  const observer = createWorldObserver();
  const close = () => Promise.all([observer.close(), door.close(), asker.close()]);
  try {
    const [a] = await door.ready(1);
    const [b] = await asker.ready(1);
    await bootHost(door, a.pk, 'h');
    await bootHost(asker, b.pk, 'h');
    const via = await observer.forward('door', containerAt(doorKit, a.at));
    await route(asker, b.pk, a.pk, via);
    return { door, asker, a, b, observer, label: 'door', close };
  } catch (e) {
    await close();
    throw e;
  }
}

// `Caller` booted in B under `caller`, and a `Host` under `m` booted by her,
// so `m` holds the standing `caller` at her and the root asks `hi` there.
export async function bootCaller(stand, b) {
  const caller = await stand.request({ ward: b.pk, method: 'boot', args: { key: 'caller', class: 'Caller' } });
  if (caller.object?.booted !== 'caller') throw new Error(`setup: boot caller: ${JSON.stringify(caller)}`);
  const m = await stand.request({ ward: b.pk, method: 'boot', args: { maker: 'caller', key: 'm', class: 'Host', occupant: 'm', standing: 'caller' } });
  if (m.object?.booted !== 'm') throw new Error(`setup: boot m: ${JSON.stringify(m)}`);
}

// The hand, as an asker, knocks at itself as a door with a payload carrying
// `fields`, so what a broken kit would write crosses a real wire, and
// answers what its door heard.
export async function handAsksItself(hand, fields) {
  const invitation = hand.invite();
  const heir = mintKey(invitation.secret, invitation.lock);
  const d = dial(hand.at);
  try {
    await d.ask(hand.pk, heir, { to: invitation.heir, by: heir.signPk, next: null, seq: 1, time: 1000, method: 'hello', ...fields }, { ms: 1500 });
  } finally {
    d.close();
  }
  const heard = hand.heard.find((h) => h.heir === invitation.heir);
  if (!heard) throw new Error('setup: the hand did not hear itself');
  return heard;
}

// The ask frame under `label` whose box opens with the lid `lidHex`, and the
// reply frame that answered it, matched by its id on its connection.
export function askFrameOf(observer, label, lidHex) {
  return observer.frames.find((f) => f.label === label && f.kind === 'ask' && f.box.subarray(0, 32).toString('hex') === lidHex);
}
export function replyFrameOf(observer, ask) {
  return ask && observer.frames.find((f) => f.label === ask.label && f.kind === 'reply' && f.conn === ask.conn && f.id === ask.id && f.t >= ask.t);
}

// Milliseconds between two frames.
export const msBetween = (earlier, later) => Number(later.t - earlier.t) / 1e6;

export const OBJECT = (object) => ({ object, seen: null });

// A root request line written by hand, `id` the id it carries, answered with
// the answer that carries it, or null when `ms` pass first.
export function rawRequest(stand, id, line, ms = 3000) {
  return new Promise((resolve) => {
    let pending = '';
    const onData = (chunk) => {
      pending += chunk.toString('utf8');
      const lines = pending.split('\n');
      pending = lines.pop();
      for (const text of lines) {
        if (!text.startsWith('{')) continue;
        const answer = JSON.parse(text);
        if (answer.id === id) done(answer);
      }
    };
    const done = (v) => {
      clearTimeout(timer);
      stand.child.stdout.off('data', onData);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), ms);
    stand.child.stdout.on('data', onData);
    stand.child.stdin.write(`${line}\n`);
  });
}
