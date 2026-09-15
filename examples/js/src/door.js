// The door, chapter 3: sealed bytes in, sealed bytes out, and one bit beside
// them, whether a key the door holds spoke.
//
// It judges thirteen cases in order and the first met is the answer. The
// first seven are strangers, met with one silence and nothing written. The
// next three are refusals to a key the door has bound: a word, nothing
// written. The last three are choices: the number is spent, the keys rotate,
// and what she answered goes back.

import { ed25519, hex, unhex, x25519 } from './arithmetic.js';
import { honourable, spend } from './count.js';
import { admit, edgeStands, edges, move, moveEdges } from './keys.js';
import { SEAL_BYTES, SIZE, ZERO_EDGE_KEY, box, jsonBytes, nextEdge, openAsk, signed, split, takesSeal } from './seal.js';
import { PAYLOAD_DEPTH, SILENCE, copy, digest, isArgs, isObject, isValue, parseJson, wordName } from './value.js';

const HEX64 = /^[0-9a-f]{64}$/;

// Her answer, judged. A throw, a word out of her, or a shape that is not a
// value are all a throw; silence, or nothing at all, is silence. On a named
// ask her describe for the same asker is hashed and rides beside the object.
export async function dispatch(being, asker, method, args) {
  let out;
  try {
    out = await being.answer({ ...asker }, method, args);
  } catch {
    return { threw: true };
  }
  if (out === SILENCE || out === undefined) return { silence: true };
  if (wordName(out) || !isValue(out)) return { threw: true };
  return { object: copy(out), seen: method === undefined ? null : await describe(being, asker) };
}

// The size. A door never seals a reply above it: an object whose reply would
// be larger is her answer that cannot cross, and it is judged a throw.
function crossing(out) {
  if (out.object === undefined) return out;
  return jsonBytes(out).length + 64 + SEAL_BYTES > SIZE ? { threw: true } : out;
}

// A describe that throws or falls silent costs the digest and nothing else.
async function describe(being, asker) {
  try {
    return await digest(await being.answer({ ...asker }));
  } catch {
    return null;
  }
}

export function createDoor({ key, partition, beings, random }) {
  // Every reply is signed by the ward key and sealed to the lid the ask came
  // with. A lid that will not take a seal, or none at all, is replaced by a
  // key nobody holds, drawn before the reply's own ephemeral key. A choice
  // drew that key already, before it wrote; every other reply draws it here.
  async function seal(lid, reply, drawn) {
    if (!(await takesSeal(lid))) {
      lid = random(32);
      if (!(await takesSeal(lid))) lid = await x25519.publicKey(random(32));
    }
    return (await box(lid, await signed(key.sign, jsonBytes(reply)), drawn ?? random(32))).bytes;
  }

  return async function door(bytes) {
    const lid = bytes.length >= 32 ? bytes.slice(0, 32) : null;
    const stranger = async () => ({ bytes: await seal(lid, { silence: true }, null), heard: false });
    const bound = async (reply, secret) => ({ bytes: await seal(lid, reply, secret), heard: true });

    // D1: over the size, the box or its head does not open, the body opens
    // under none of the edge keys the head names, a fresh heir's ciphertext
    // is missing or opens the body under no key, or it holds no payload
    // beside a signature, or what it holds yields no payload at all.
    const sealed = bytes.length <= SIZE ? await openAsk(key.seal, bytes, (head) => edges(partition, hex(head))) : null;
    const opened = sealed && split(sealed.plaintext);
    if (!opened) return stranger();
    const payload = readPayload(opened.body);
    if (!payload) return stranger();

    // D2: the payload is malformed, field by field, and `to` is the head.
    const ask = readFields(payload);
    const head = hex(sealed.head);
    if (!ask || (ask.to ?? ZERO_EDGE_KEY) !== head || ask.to === ZERO_EDGE_KEY) return stranger();
    const { edge } = sealed;
    const verified = () => ed25519.verify(unhex(ask.by), opened.body, opened.signature);

    // For nobody: D3 nobody is home, D4 the signature fails. She is asked by
    // strangers only, so whatever she chooses short of an object is silence.
    if (ask.to === null) {
      const pub = partition.public !== null ? beings.get(partition.public) : undefined;
      if (!pub || !(await verified())) return stranger();
      const out = crossing(await dispatch(pub, {}, ask.method, ask.args));
      return { bytes: await seal(lid, out.object !== undefined ? out : { silence: true }), heard: false };
    }

    // For a heir: D5 not held, D6 not admitted, D7 the signature fails. The
    // door judges concurrently, so admission is read again after the check,
    // and nothing is awaited between that reading and the writes below. The
    // edge key the ask opened under must still stand for that heir, or D6.
    const admits = () => {
      const a = admit(partition, ask);
      return a && edgeStands(a, edge) ? a : null;
    };
    if (!admits()) return stranger();
    if (!(await verified())) return stranger();
    const admitted = admits();
    if (!admitted) return stranger();

    // D8 she is not there, D9 a knock announces nothing, D10 the number is
    // refused. Each is a word, and none writes.
    if (admitted.removed) return bound({ quo: 'removed' });
    const { heir } = admitted;
    const being = beings.get(heir.being);
    if (!being) return bound({ quo: 'absent' });
    if (!Object.hasOwn(partition.beings[heir.being].occupants, heir.id)) return bound({ quo: 'removed' });
    if (heir.fresh && (ask.next === null || ask.next === ask.to)) return bound({ quo: 'unannounced' });
    if (!honourable(heir, ask.seq)) return bound({ quo: 'repeated' });

    // A choice: the number is spent and the keys move before she is asked.
    spend(heir, ask.seq);
    move(heir, ask);
    // The edge key the ask came under is open from the choice on, and the key
    // it replaced no longer stands, so an arrival racing this one under that
    // key meets D6 when it reads admission again. The key offered follows
    // under the reply.
    moveEdges(heir, edge, null);

    // D11 she threw, D12 she said silence, D13 she answered a non-value or an
    // object whose reply would be above the size.
    const out = crossing(await dispatch(being, { id: heir.id }, ask.method, ask.args));

    // The edge keys move with the choice. The reply's ephemeral key is drawn,
    // still the last draw of the arrival, the edge key the ask came under and
    // the reply's agreement give the key offered,
    // and the reply is sealed with that same key. A heir removed while she
    // answered moves the edge keys its removal kept.
    const secret = random(32);
    const offered = await nextEdge(edge, await x25519.agree(secret, lid));
    moveEdges(partition.heirs[ask.to] ?? partition.removed[ask.to] ?? heir, edge, offered);
    if (out.threw) return bound({ quo: 'threw' }, secret);
    return bound(out.silence ? { silence: true } : out, secret);
  };
}

// D1's half: bytes that are not UTF-8, not JSON, hold a duplicate key, nest
// past the payload's bound or are not one object yield no payload.
function readPayload(body) {
  try {
    const p = parseJson(body, PAYLOAD_DEPTH);
    return isObject(p) ? p : null;
  } catch {
    return null;
  }
}

// D2's half: the fields of that payload, one at a time. A field it does not
// name is not read, and absent args are the empty object. Each arg is held to
// the value's own bound, since depth is counted from the value written and
// never from a root it is written under.
function readFields(p) {
  const has = (k) => Object.hasOwn(p, k);
  const keyOrNull = (v) => v === null || (typeof v === 'string' && HEX64.test(v));
  const whole = (v, least) => Number.isInteger(v) && v >= least;
  if (!has('to') || !keyOrNull(p.to)) return null;
  if (!has('by') || p.by === null || !keyOrNull(p.by)) return null;
  if (!has('next') || !keyOrNull(p.next)) return null;
  if (!has('seq') || !whole(p.seq, 1)) return null;
  if (!has('time') || !whole(p.time, 1)) return null;
  if (has('method') && typeof p.method !== 'string') return null;
  if (has('args') && !isArgs(p.args)) return null;
  return { to: p.to, by: p.by, next: p.next, seq: p.seq, time: p.time, method: p.method, args: p.args ?? {} };
}
