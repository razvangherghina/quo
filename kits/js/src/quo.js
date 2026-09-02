// The being's whole API to Quo: the closure a warden hands each object it
// holds, and the handle a being calls a far being through. Nothing here sees a
// key or a road. A handle is a Quo handle and looks like one — every declared
// field an asynchronous method that answers a value or silence — and a being
// always knows which of its references are Quo. Beside those fields every
// handle carries the door's own introspection, because describe is one of the
// things that cross and a being that could not ask it would be composing
// envelopes by hand.
//
// **Everything of the kit's own lives at `_quo`, and the plain namespace is
// the blueprint's alone** — on a being and on a handle alike. Article IV's
// identifier is a letter then letters and digits, so no blueprint in any
// language can spell a name beginning with an underscore. That makes this a
// namespace the grammar cannot reach into rather than a list of names to
// guard, and a guarded list is what fails: it is written from the attributes a
// kit has today, and the one this kit is replacing already ate `quo` on the
// being side and threw on `being` at the handle.
import { parse } from './notation.js';
import { encodeAll, decode, recordsOf } from './wire.js';
import { hex } from './bytes.js';

// The caller and the leash are in scope for the whole of a call, across every
// await inside it, so a being reads them from its closure rather than from an
// argument it has to thread. Node has async context; a platform without it
// falls back to a plain slot, which is exact for a synchronous method and a
// best effort across awaits.
//
// The specifier is held in a variable on purpose: a bundler that could follow
// it would pull a Node module into a browser build and fail there, so the load
// stays a runtime question. And it
// is only asked of a platform that says it is that host — a tab asked anyway
// answers with a failed request and a console full of it, which is a kit
// making noise in somebody else's page about a thing it already handles.
const ASYNC_CONTEXT = 'node:async_hooks';
const node = typeof process !== 'undefined' && Boolean(process.versions?.node);
const context = node
  ? await import(ASYNC_CONTEXT).then((m) => new m.AsyncLocalStorage()).catch(() => null)
  : null;
let slot = null;

export function within(call, work) {
  if (context) return context.run(call, work);
  const before = slot;
  slot = call;
  try {
    return work();
  } finally {
    slot = before;
  }
}

export function current() {
  return context ? (context.getStore() ?? null) : slot;
}

// What a walk may be made under from here: the leash in scope, shrunk, or the
// warden's default when a being starts a walk of its own.
export function allowanceNow(warden) {
  const leash = current()?.leash ?? null;
  if (!leash) return warden.allowance;
  return leash.onward();
}

// A being named by whichever of the three things a caller has to hand: its key,
// the object itself, or a handle at it. The last two are read at one place,
// because a held object and a handle both carry the kit's own there and neither
// can be confused with a field the blueprint declares.
export const pkOf = (target) => {
  if (target instanceof Uint8Array) return target;
  if (target?._quo?.being instanceof Uint8Array) return target._quo.being;
  // `hold` answers `{ being, handle }`, which carries no `_quo`, and callers
  // hand it straight back to `grant`. The `instanceof` is why this is not the
  // shadowing `_quo` exists to end: a declared field named `being` is a
  // function, not a key, and falls through.
  if (target?.being instanceof Uint8Array) return target.being;
  return null;
};

function fieldsOf(text) {
  const parsed = parse(text);
  return { fields: new Map(parsed.fields.map((f) => [f.name, f])), records: recordsOf(parsed) };
}

function readAnswer(field, records, answer) {
  if (!answer) return null;
  if (!field.answer) return undefined;
  if (answer.data === null) return null;
  return decode(field.answer, answer.data, records);
}

// A handle at a being under another warden: each call is sealed by the row
// the handle spends, handed to delivery, and settled by whatever arrives back
// through the warden's one door. `seal` and `send` are the two halves apart,
// so a caller that met silence can resend the identical envelope.
export function remoteHandle(warden, row, beingPk, text) {
  const { fields, records } = fieldsOf(text);
  const view = () => ({ padlock: row.padlock.slice(), hints: [...row.hints] });
  // The name the being wears now. A succession this handle believes moves it,
  // and the row moves house with it, so what the next ask reaches is wherever
  // the being is rather than where it stood when the handle was made.
  let at = beingPk;

  const seal = async (name, ...args) => {
    const field = fields.get(name);
    if (!field) return null;
    const allowance = allowanceNow(warden);
    if (!allowance) return null;
    const seq = row.seq + 1n;
    const envelope = await warden.ask(row, {
      seq,
      allowance,
      being: at,
      method: {
        name,
        args: encodeAll(
          field.args.map((a) => a.type),
          args,
          records,
        ),
      },
      random: warden.random(),
    });
    if (!envelope) return null;
    return { envelope, seq, name, deadline: allowance.time };
  };

  // Weather — no road carried the bytes — is not the far door's silence, and
  // the handle keeps the two apart where it can without changing its shape:
  // the ask still answers `null`, the warden's observer is told the road's
  // fault, and the handle does not go asking whether the being moved.
  let weathered = false;
  const send = async (sealed) => {
    if (!sealed) return null;
    weathered = false;
    warden.await(row, sealed.seq);
    const promise = warden.pending(row, sealed.seq, sealed.deadline);
    let back;
    try {
      back = await warden.delivery.send(view(), sealed.envelope);
    } catch (thrown) {
      warden.weather(row, sealed.seq, thrown);
      weathered = true;
      return null;
    }
    // `null` is silence on a road that answers in its response; `false` is a
    // road that answers through the door later; bytes are the answer itself.
    if (back === null) warden.forgo(row, sealed.seq);
    else if (back) await warden.arrive(back);
    return readAnswer(fields.get(sealed.name), records, await promise);
  };

  // Introspection goes on first and the being's own fields after it: the
  // blueprint is the one document a stranger reads, so what it declares under a
  // name is what that name means. The class that declares them is the Warden's
  // own, and there the two are the same ask — a handle at a public being
  // reaches them as the declared fields they are.
  const door = warden.introspect(row, () => at);

  // The old door only points, so an ask that met a move is silence, and the
  // word saying where the being went is one further ask at that door's own
  // being. Handing it to the warden is the whole of what the news would have
  // done: the same commitment the row already holds is what believes it, the
  // row is rehoused off the word's own fields, and the mark starts fresh.
  //
  // The ask that met the move stays silence and is not retried. Silence is
  // what every ask at a departed being is answered with, and a retry would put
  // in the caller's hands an answer the being it asked never gave, while
  // hiding that anything moved. The next ask down this handle reaches the new
  // house, which is what the caller is owed.
  const follow = async () => {
    // Only a being this row stands at can be rehoused by a word, and the far
    // house itself is not one of them: a warden's own move is a name
    // succession and arrives as news. Without this, every legal silence would
    // cost an ask.
    if (hex(at) === hex(row.warden) || !row.beings.has(hex(at))) return;
    const word = await door.moved(at);
    if (!word) return;
    const now = await warden.believe(row, word);
    if (now) at = now;
  };

  const handle = {
    _quo: {
      get being() {
        return at;
      },
      text,
      ...door,
      seal,
      send,
    },
  };
  for (const name of fields.keys()) {
    handle[name] = async (...args) => {
      const answer = await send(await seal(name, ...args));
      if (answer === null && !weathered) await follow();
      return answer;
    };
  }
  return handle;
}

// A handle at a being under this same warden. One shape: asynchronous, leashed,
// a value or silence — and no seal, because there are no strangers here. The
// value still rides through the codec, so a being cannot answer a neighbour
// what it could not answer a stranger.
export function localHandle(warden, being) {
  const handle = { _quo: { being: being.pk, ...warden.introspectLocal(being.pk) } };
  for (const [name, field] of being.fields) {
    handle[name] = async (...args) => {
      if (!warden.beings.has(hex(being.pk))) return null;
      const allowance = allowanceNow(warden);
      if (!allowance) return null;
      const blob = encodeAll(
        field.args.map((a) => a.type),
        args,
        being.records,
      );
      const arrived = warden.clock();
      const leash = warden.leash(allowance, arrived);
      // A being's own fault is silence here as it is at a door. **One shape**:
      // a caller of a neighbour is told exactly what a caller across an ocean
      // is told, and never a throw the far side would have swallowed.
      let data;
      try {
        data = await being.invoke(name, blob, {
          caller: { voice: null, kind: 'local' },
          leash,
        });
      } catch {
        return null;
      }
      if (!field.answer) return undefined;
      return decode(field.answer, data, being.records);
    };
  }
  return handle;
}

// The closure: facts and acts, never a judgment. It is attached to the object
// at `object._quo`, where nothing the blueprint declares can reach it.
export function closure(warden, being) {
  return {
    being: being.pk,
    get caller() {
      return current()?.caller ?? null;
    },
    get leash() {
      return current()?.leash?.received ?? null;
    },
    standings: () => warden.standings(being.pk),
    relation: (label) => warden.relation(label),
    grant: (target) => warden.grant(pkOf(target ?? being.pk)),
    amend: (voice, changes) =>
      warden.amend(voice, {
        add: (changes?.add ?? []).map(pkOf),
        remove: (changes?.remove ?? []).map(pkOf),
      }),
    release: (target) => warden.release(pkOf(target)),
    expose: (target) => warden.expose(pkOf(target ?? being.pk)),
    conceal: (target) => warden.conceal(pkOf(target ?? being.pk)),
    accept: (invitation, options) => warden.accept(invitation, { ...options, being: being.pk }),
    knock: (card, options) => warden.knock(card, { ...options, being: being.pk }),
    hold: (object, options) => warden.hold(object, options),
  };
}
