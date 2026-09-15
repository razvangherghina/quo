// Ground for `SCENARIOS.md` chapter 7, "The blueprint and the digest",
// that no other scenario shares: a target that is either a kit's door or the
// hand standing as a door that breaks a line, B's standing at a target, the
// hand holding a relation at a target, and a script for the hand as a door
// that answers as `Host` would.

import { LISTEN_HOST, handAt } from '../../src/world.js';
import { mintKey, standHand } from '../../src/hand.js';
import { dial } from '../../src/dial.js';
import { Relation } from '../../src/relation.js';
import { BLUEPRINT, SHOWN, digestOf } from '../../src/blueprint.js';
import { invite, knockAndTake, readStanding, askOn } from '../../src/standing.js';

export const HEX64 = /^[0-9a-f]{64}$/;

// A kit's door as a target: the `Host` of the world's door or asker ward,
// reached through the world's observer.
export function kitTarget(world, side = 'door') {
  const stand = side === 'door' ? world.door : world.asker;
  const pk = side === 'door' ? world.a.pk : world.b.pk;
  return {
    pk,
    label: side,
    via: side === 'door' ? world.obsForDoor : world.obsForAsker,
    invite: (id) => invite(stand, pk, id),
  };
}

// The hand standing as a door, behind the world's observer under `label`, B
// routed to it. `script(ask, id)` answers each ask it opens, `id` the id the
// hand invited the ask's heir under.
export async function handTarget(world, label, script) {
  const ids = new Map();
  let current = script;
  const hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer: (ask) => current(ask, ids.get(ask.heir)) });
  const via = await world.observer.forward(label, handAt(hand.at));
  const routed = await world.asker.request({ ward: world.b.pk, method: 'route', args: { far: hand.pk, at: via } });
  if (routed.object?.routed !== hand.pk) throw new Error(`setup: route to the hand: ${JSON.stringify(routed)}`);
  return {
    pk: hand.pk,
    label,
    via,
    async invite(id) {
      const invitation = hand.invite();
      ids.set(invitation.heir, id);
      return invitation;
    },
    set(fn) {
      current = fn;
    },
    close: () => hand.close(),
  };
}

// B's `Host` knocks at a target with `hello` and takes the standing `id`.
// `ask` answers B's root answer, `read` what the standing holds.
export async function standingAt(world, target, occupant, id) {
  const invitation = await target.invite(occupant);
  const { asker, b } = world;
  await knockAndTake(asker, b.pk, invitation, id);
  return {
    ask: (method = null, args) => askOn(asker, b.pk, id, { method, args }),
    read: () => readStanding(asker, b.pk, id),
  };
}

// The hand holding a relation at a target as its occupant: it knocks with
// `hello` and reads every reply's `object` and `seen` itself. `ask()` with no
// method is the empty ask.
export async function occupantAt(target, occupant) {
  const invitation = await target.invite(occupant);
  const dialer = dial(target.via);
  await dialer.ready;
  const rel = new Relation(dialer, target.pk, invitation);
  const knocked = await rel.knock();
  if (!knocked.reply || !('object' in knocked.reply)) throw new Error(`setup: the hand's knock: ${JSON.stringify(knocked.reply)}`);
  return {
    async ask(method = null, args) {
      return (await rel.ask({ method, args: args ?? null })).reply;
    },
    close: () => dialer.close(),
  };
}

// A stranger at a target: an asker with no edge, reaching its public being
// with `to` null under the zero edge key, a fresh key each ask. `ask()` with
// no method is the empty ask.
export function strangerAt(target) {
  const dialer = dial(target.via);
  return {
    async ask(method = null, args) {
      const key = mintKey();
      const payload = { to: null, by: key.signPk, next: null, seq: 1, time: 1000 };
      if (method !== null) payload.method = method;
      if (args !== undefined) payload.args = args;
      return (await dialer.ask(target.pk, key, payload)).reply;
    },
    close: () => dialer.close(),
  };
}

const THROWS = Symbol('throws');

function describeOf(mode, blueprint) {
  if (mode === 'throws') return THROWS;
  if (mode === 'extra') return { ...blueprint, asks: [...blueprint.asks, { name: 'extra', input: {} }] };
  if (mode === 'numeric') return { ...blueprint, asks: [{ ...blueprint.asks[0], name: 1 }, ...blueprint.asks.slice(1)] };
  if (mode === 'field') return { ...blueprint, mood: 'fine' };
  return blueprint;
}

// A script for the hand as a door that answers as `Host` would under
// `state.mode`, each piece overridable by a line's broken run.
export function hostScript(state, overrides = {}) {
  return (ask, id) => {
    const method = ask.payload?.method;
    const blueprint = id === 'b' ? BLUEPRINT : SHOWN;
    const describe = overrides.describe ? overrides.describe(state, id) : describeOf(state.mode, blueprint);
    if (method === 'shape') {
      state.mode = ask.payload.args.mode;
      return { object: { mode: state.mode }, seen: null };
    }
    if (method === undefined) {
      if (describe === THROWS) return { quo: 'threw' };
      return { object: describe, seen: null };
    }
    const seen = overrides.seen ? overrides.seen(state, id) : describe === THROWS ? null : digestOf(describe);
    if (method === 'hidden') return { object: { hidden: true }, seen };
    return { object: { hi: id ?? null }, seen };
  };
}
