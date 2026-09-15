// Her side of a relation, chapters 3 and 4: the knock, the take, the ask, the
// one line each relation holds, and the strict reading of what comes back.
//
// A send signs under the key that speaks now, announces the key it will sign
// with next, and carries the next number. Her side moves to the announced key
// only when an object came back, so she is always heard: a word is a door
// that did not move.
//
// A relation her side holds is `{ by, next, edge, seq }`: `by` the secret of
// the key she signs with, `next` the secret of the key she announces, `edge`
// the edge key she sends under, and `seq` the last number she spoke.

import { ed25519, hex, unhex, x25519 } from './arithmetic.js';
import { freshId } from './partition.js';
import { ASK_BYTES, KNOCK_BYTES, SIZE, ZERO_EDGE_KEY, askBox, beingPk, jsonBytes, nextEdge, padlockOf, signed, signingPkOf, split, unbox } from './seal.js';
import { DOOR_WORDS, REPLY_DEPTH, SILENCE, digest, isArgs, isBlueprint, isObject, isValue, parseJson, word } from './value.js';

const DEFAULT_TIME = 30_000;
const CEILING_TIME = 300_000;
const HEX64 = /^[0-9a-f]{64}$/;
const HEX128 = /^[0-9a-f]{128}$/;

const HEXLOCK = /^[0-9a-f]{2368}$/;

// An invitation is a ward pk, and for a heir the heir, its secret and the
// ward's lock. A shape that is not one of the two is no invitation, and a
// field beside the four is ignored.
export function readInvitation(invitation) {
  if (!isObject(invitation) || typeof invitation.ward !== 'string' || !HEX128.test(invitation.ward)) return null;
  const { ward, heir, secret, lock } = invitation;
  if (heir === undefined && secret === undefined && lock === undefined) return { ward, heir: null, secret: null, lock: null };
  const isKey = (v) => typeof v === 'string' && HEX64.test(v);
  return isKey(heir) && isKey(secret) && typeof lock === 'string' && HEXLOCK.test(lock) ? { ward, heir, secret, lock } : null;
}

// An ask whose args are not one object of values, or whose method is not a
// string, is unreached, because a payload is written as JSON and nothing left.
export const sendable = (method, args) =>
  (method === undefined || typeof method === 'string') && (args === undefined || isArgs(args));

// What she asked for, held to what the ward allows.
export function allowance(wanted) {
  const time = isObject(wanted) ? wanted.time : undefined;
  return Number.isInteger(time) && time > 0 ? Math.min(time, CEILING_TIME) : DEFAULT_TIME;
}

const relationName = ({ ward, heir }) => (heir ? `${ward}:${heir}` : `public:${ward}`);

export function createSender({ key, partition, random, carry, door }) {
  const lines = new Map();

  // A knock is an ask carrying an invitation, and it is a knock whatever she
  // already holds. Until it is taken, what it spoke under is held per ward
  // and heir together with the secret it was knocked under, so a knock under
  // another secret starts afresh.
  async function knock(k, invitation, method, args, wanted) {
    const target = readInvitation(invitation);
    if (!target) return word('invitation');
    if (!sendable(method, args)) return word('unreached');
    const name = relationName(target);
    const relations = partition.relations[k];
    return inLine(`${k} ${name}`, allowance(wanted), async (time, isLate) => {
      if (relations.knocks[name] && relations.knocks[name].invited !== target.secret) delete relations.knocks[name];
      const knocking = (relations.knocks[name] ??= { invited: target.secret, by: target.secret, next: null, edge: ZERO_EDGE_KEY, m: null, seq: 0, answered: false, unsure: false });

      // The lost knock. A knock that may have been heard without an object
      // coming back may have spent the heir and bound her own key. She sends
      // under her own key first, with no ciphertext: a key the door bound
      // hears an object or a word, and a silence tells her nothing, so after
      // it she knocks as the heir with a fresh m. She still holds the knock's
      // edge key, which is the door's open where it heard the knock, so the
      // ask opens there; where it did not, the heir is fresh, the door reads a
      // ciphertext that is not there, and the box does not open. The number
      // is taken before the send, since a send may never return.
      if (knocking.unsure) {
        knocking.seq += 1;
        const own = { by: knocking.next, next: null, edge: knocking.edge, seq: knocking.seq - 1 };
        const reply = await speak(own, target, method, args, time, isLate, null);
        if (!reply) return word('late');
        if (reply.unreached) return toBeing(reply);
        if (reply.object !== undefined || reply.quo) {
          Object.assign(knocking, { by: own.by, next: own.next, edge: own.edge, unsure: false, answered: reply.object !== undefined });
          return toBeing(reply);
        }
      }

      // As the heir. A knock is unsure from the moment it is sent, since a
      // send may never return. A knock nothing left for tells nothing. One
      // that met a silence or a throw may have been heard: the door moves on
      // every choice, and no object came back to move her side.
      const was = knocking.unsure;
      knocking.unsure = target.heir !== null;
      const reply = await speak(knocking, target, method, args, time, isLate, target.lock);
      if (!reply) return word('late');
      if (reply.unreached) {
        knocking.unsure = was;
        return toBeing(reply);
      }
      knocking.unsure = target.heir !== null && (reply.silence === true || reply.quo === 'threw');
      if (reply.object !== undefined) knocking.answered = true;
      return toBeing(reply);
    });
  }

  // Take waits its turn on the relation's line, then moves the knock's keys,
  // its edge key and its count into a standing under her own id. Before a
  // knock, or after one no object answered, it births nothing.
  async function take(k, id, invitation) {
    const target = readInvitation(invitation);
    if (!target) return null;
    const name = relationName(target);
    await lines.get(`${k} ${name}`);
    const relations = partition.relations[k];
    if (!relations?.knocks[name]?.answered || !freshId(partition, k, id)) return null;
    const { by, next, edge, seq } = relations.knocks[name];
    relations.standings[id] = { ward: target.ward, heir: target.heir, by, next, edge, seq };
    partition.beings[k].standings[id] = { id, digest: null, blueprint: null, seen: null };
    delete relations.knocks[name];
    return id;
  }

  // An ask on a standing she holds, or `dropped` when she holds none.
  function ask(k, id, method, args, wanted) {
    const standings = partition.relations[k]?.standings ?? {};
    const relation = Object.hasOwn(standings, id) ? standings[id] : undefined;
    if (relation === undefined) return word('dropped');
    if (!sendable(method, args)) return word('unreached');
    return inLine(`${k} ${relationName(relation)}`, allowance(wanted), async (time, isLate) => {
      const reply = await speak(relation, relation, method, args, time, isLate, null);
      if (!reply) return word('late');
      const record = partition.beings[k]?.standings[id];
      if (reply.object !== undefined && record && partition.relations[k]?.standings[id] === relation) {
        if (method === undefined) {
          record.digest = await digest(reply.object);
          record.blueprint = isBlueprint(reply.object) ? reply.object : null;
        } else {
          record.seen = reply.seen;
        }
      }
      return toBeing(reply);
    });
  }

  // One relation, one line. Every send waits for the one before it, and the
  // allowance runs from the moment she calls: it ends her wait and releases
  // the line, and an ask still waiting its turn when it rings is never sent.
  // An ask that waited carries only the time it has left.
  function inLine(name, time, work) {
    const ahead = lines.get(name);
    const called = Date.now();
    let timer;
    let late = false;
    const bound = new Promise((resolve) => {
      timer = setTimeout(() => resolve(word('late')), time);
    }).then((w) => ((late = true), w));
    const left = () => (ahead ? Math.max(1, time - (Date.now() - called)) : time);
    const turn = (ahead ?? Promise.resolve()).then(() => (late ? word('late') : work(left(), () => late)));
    const done = Promise.race([turn, bound]).finally(() => clearTimeout(timer));
    lines.set(name, done);
    void done.then(() => lines.get(name) === done && lines.delete(name));
    return done;
  }

  // One send. A public standing holds one key for life, announces nothing and
  // is sealed under the zero edge key. A knock as the heir is handed the lock
  // and seals under the knock's edge key, which the relation holds from the
  // moment it is sealed. Every other send is handed no lock and is sealed
  // under the edge key the relation holds, which moves with the signing key,
  // when an object came back, to the edge key of that key and the reply's
  // agreement. A reply that comes back after the wait ran out is not read:
  // null.
  async function speak(relation, { ward, heir }, method, args, time, isLate, lock) {
    const announces = heir !== null;
    relation.by ??= hex(random(32));
    if (announces) relation.next ??= hex(random(32));
    relation.seq += 1;
    const secret = unhex(relation.by);
    const payload = {
      to: heir,
      by: await beingPk(secret),
      next: announces ? await beingPk(unhex(relation.next)) : null,
      seq: relation.seq,
      time,
      method,
      args,
    };
    // A knock's record holds the edge key it was sealed under and its m, so
    // a knock again as the heir goes under the same edge key.
    const sealedUnder = (edge, m) => {
      if (announces) relation.edge = edge;
      if (m) relation.m = hex(m);
    };
    const reply = await send(ward, payload, secret, announces ? relation.edge : ZERO_EDGE_KEY, lock, sealedUnder, relation.m && unhex(relation.m));
    if (isLate()) return null;
    if (announces && reply.object !== undefined) {
      relation.by = relation.next;
      relation.next = null;
      relation.edge = reply.edge;
    }
    return reply;
  }

  // Sealed to the far ward's padlock, the head `to` and the body under the
  // edge key. A box above the size is refused before it is sealed, since no
  // door anywhere reads it. The ward's own pk it delivers itself; every other
  // goes to the carrier, and nothing back, or a throw, is unreached. An
  // object carries the next edge key, from the edge key the ask was sealed
  // under and the agreement of the lid's secret with the reply's ephemeral pk.
  async function send(ward, payload, secret, edge, lock, sealedUnder, again) {
    const body = await signed(secret, jsonBytes(payload));
    if (body.length + (lock ? KNOCK_BYTES : ASK_BYTES) > SIZE) return { unreached: true };
    // A padlock that takes no seal is a box that was never made: nothing left.
    const head = payload.to === null ? unhex(ZERO_EDGE_KEY) : unhex(payload.to);
    const sealed = await askBox(random, padlockOf(ward), head, body, edge, lock && unhex(lock), again);
    if (!sealed) return { unreached: true };
    sealedUnder(sealed.edge, sealed.m);
    let back;
    try {
      back = ward === key.pk ? (await door(sealed.bytes)).bytes : await carry(ward, sealed.bytes);
    } catch {
      back = null;
    }
    if (!back) return { unreached: true };
    const reply = await readReply(sealed.secret, ward, back);
    if (reply?.object === undefined) return reply ?? { silence: true };
    return { ...reply, edge: await nextEdge(sealed.edge, await x25519.agree(sealed.secret, back.subarray(0, 32))) };
  }

  return { knock, take, ask };
}

// Reading a reply is strict: over the size, does not open, not signed by the
// ward it went to, or none of the three shapes exactly. Any of those is
// silence. A field beside its shape's, a `seen` that is neither a digest nor
// null, or an `object` that is not a value is none of the three shapes.
export async function readReply(secret, ward, bytes) {
  if (bytes.length > SIZE) return null;
  const opened = split(await unbox(secret, bytes));
  if (!opened || !(await ed25519.verify(signingPkOf(ward), opened.body, opened.signature))) return null;
  let reply;
  try {
    reply = parseJson(opened.body, REPLY_DEPTH);
  } catch {
    return null;
  }
  if (!isObject(reply)) return null;
  const shape = Object.keys(reply).sort().join(',');
  const seen = reply.seen === null || (typeof reply.seen === 'string' && HEX64.test(reply.seen));
  if (shape === 'object,seen' && seen && isValue(reply.object)) return reply;
  if (shape === 'silence' && reply.silence === true) return reply;
  if (shape === 'quo' && DOOR_WORDS.includes(reply.quo)) return reply;
  return null;
}

// What the being meets: her object, silence, or a word.
function toBeing(reply) {
  if (reply.unreached) return word('unreached');
  if (reply.quo) return word(reply.quo);
  return reply.object !== undefined ? reply.object : SILENCE;
}
