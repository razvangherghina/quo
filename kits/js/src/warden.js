// The warden: a door, ordinary pointers to the beings it keeps, two records,
// and the eight steps it judges every arriving message by. Every failure is
// the same failure — the door answers with silence and never says which step
// it was — so nothing in here throws outward and nothing narrates.
import { parse, print, digest } from './notation.js';
import { encode, decode, decodeAll, encodeAll, recordsOf } from './wire.js';
import {
  ANSWER as ANSWER_BYTE,
  box,
  concat,
  open,
  seal,
  tagged,
  unbox,
  untag,
} from './envelope.js';
import { commitment as commit, sealingPair, sign, signingPair, verify } from './arithmetic.js';
import { NoRoad, Weather } from './refusal.js';
import { hex, unhex } from './bytes.js';
import { allowanceNow, closure, localHandle, pkOf, remoteHandle, within } from './quo.js';

const same = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array && hex(a) === hex(b);
const key32 = (value) => value instanceof Uint8Array && value.length === 32;
// What a say answers when no road carried it — not the far door's silence,
// which is `null`, and never an answer. Truthy on purpose: nothing reading an
// answer's fields off it finds any, and nothing mistakes it for silence.
const WEATHER = Object.freeze({ weather: true });

// The order is derived, never chosen: bytes ascending, so two wardens
// describing one estate produce one byte sequence — and, by Article IX, so two
// wardens packing one being do.
export function ascending(a, b) {
  for (let at = 0; at < Math.min(a.length, b.length); at += 1) {
    if (a[at] !== b[at]) return a[at] - b[at];
  }
  return a.length - b.length;
}

// The answer, on the ruled bytes: one record in the notation — the answering
// warden's name, the number of the ask it answers, and the data, absent when
// the field answers nothing — with the warden's signature as the last
// sixty-four bytes inside the seal, mirroring the ask.
export const ANSWER_BLUEPRINT = `Answer
  answer(answer answer)

answer
  warden being
  seq int
  data bytes?
`;

const ANSWER_RECORDS = recordsOf(parse(ANSWER_BLUEPRINT));
const ANSWER = { base: 'answer' };

export function decodeAnswer(bytes) {
  return decode(ANSWER, bytes, ANSWER_RECORDS);
}

// The one blueprint nobody authors and every warden holds. Its digest is the
// same on every ground in the world, so from here on the warden is not a
// special case in its own protocol.
export const WARDEN_BLUEPRINT = `Warden
  describe() estate
  sketch(being being) sketch?
  blueprint(digest b32) text?
  limit() int
  tell(word word)
  moved(being being) word?
  receive(cargo cargo) b32

estate
  classes [class]

class
  digest b32
  beings [held]

held
  being being
  commitment b32

sketch
  being being
  digest b32
  commitment b32

word
  being being?
  successor b32?
  commitment b32?
  name b32?
  padlock b32?
  hints [text]

cargo
  being being
  digest b32
  cells bytes
  standings [standing]
  relations [relation]

standing
  voice b32
  commitment b32
  name b32
  beings [being]
  mark int
  spent [int]
  padlock b32?
  hints [text]

relation
  warden being
  commitment b32
  padlock b32
  voice b32
  secret b32
  heir b32
  heirSecret b32
  seq int
  news int
  hints [text]
`;

const WARDEN = parse(WARDEN_BLUEPRINT);
const WARDEN_RECORDS = recordsOf(WARDEN);
export const WARDEN_DIGEST = await digest(WARDEN);

const wardenField = (name) => WARDEN.fields.find((field) => field.name === name);

// The warden's own codec, ruled: a field's arguments ride as its declared
// argument types in declared order, notation-encoded and concatenated, and an
// answer's data is the field's declared answer type by the same rules — so
// both directions ride one encoder and a stranger can decode either from the
// blueprint alone.
function answerBytes(field, value) {
  const declared = wardenField(field);
  if (!declared.answer) return null;
  return encode(declared.answer, value, WARDEN_RECORDS);
}

function argumentsOf(field, blob) {
  const declared = wardenField(field);
  return decodeAll(
    declared.args.map((arg) => arg.type),
    blob,
    WARDEN_RECORDS,
  );
}

// How wide the window is, is the warden's own — wider is more forgiving of a
// rough road, and no peer can tell the difference except by being refused.
const WINDOW = 64;

// Two facts per counterparty: the highest number honoured, and which numbers
// below it are already spent. A door keeps one per voice, and a peer keeps one
// per far warden, exactly the same way.
class Marks {
  constructor() {
    this.mark = null;
    this.spent = new Set();
  }

  // A message above the mark is honoured and moves it; a message inside the
  // window is honoured once and never again; a message below the window is
  // silence, because a door that remembered every number ever seen would be a
  // door with unbounded memory.
  spend(seq) {
    // Counting starts where strangers must agree: the first legal number is
    // one, and a fresh standing's mark says nothing honoured yet.
    if (typeof seq !== 'bigint' || seq < 1n) return false;
    if (this.mark === null || seq > this.mark) {
      if (this.mark !== null) this.spent.add(this.mark);
      this.mark = seq;
      for (const past of this.spent) if (past <= seq - BigInt(WINDOW)) this.spent.delete(past);
      return true;
    }
    if (seq === this.mark) return false;
    if (seq <= this.mark - BigInt(WINDOW)) return false;
    if (this.spent.has(seq)) return false;
    this.spent.add(seq);
    return true;
  }

  fresh() {
    this.mark = null;
    this.spent = new Set();
  }

  // The window as it travels: the numbers below the mark already honoured,
  // ascending so two kits packing one row agree on the bytes. A mark alone
  // would make the new door either refuse everything at or below it or honour
  // it all, and both are wrong.
  window() {
    return [...this.spent].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }
}

// The marks a relation arrives with: the peer's numbers stay spent, so a
// relation that changes house does not honour what it already honoured.
function adoptedMarks(news) {
  const marks = new Marks();
  if (typeof news === 'bigint' && news > 0n) marks.mark = news;
  return marks;
}

class Standing extends Marks {
  constructor({ voice, commitment, name, beings, padlock, hints, mark = null, spent = [] }) {
    super();
    this.voice = voice;
    this.commitment = commitment;
    // The name the heir commitment was minted under. Every commitment was
    // hashed with the door's name inside it, so a door that succeeded its name
    // keeps verifying an older standing's heir at the name it was minted at,
    // and mints new commitments under the new one.
    this.name = name;
    this.beings = new Set(beings.map(hex));
    this.padlock = padlock ?? null;
    this.hints = hints ?? [];
    this.mark = mark;
    this.spent = new Set(spent);
  }

  // A rotation starts the mark fresh, because the old key is dead and the new
  // holder never saw the numbers it counted.
  rotate(voice, commitment, name) {
    this.voice = voice;
    this.commitment = commitment;
    this.name = name;
    this.fresh();
  }
}

// What one arriving call may hand to the next door. It is not a number the
// door worked out in advance: the hop count falls by one, and the time budget
// falls by this door's own dwell — the difference between when the message
// arrived and when it is handed onward. The second of those two readings
// cannot be taken until the handing onward happens, so a leash holds the first
// reading and the clock, and works the rest out at the moment it is spent.
//
// Made with nothing it carries nothing and refuses to be spent, which is what
// a being invoked outside a judgment holds.
export class Leash {
  #arrived;
  #clock;

  constructor(received = null, arrived = 0, clock = null) {
    // What arrived at this door, for a being that wants to look at it. Nothing
    // may be sent onward under it.
    this.received = received;
    this.#arrived = arrived;
    this.#clock = clock;
  }

  // What this call may hand to the next door, read now. A budget that has run
  // out mid-work is refused here exactly as it would have been at the door:
  // the caller's allowance is the caller's, and no door beneath may widen it.
  // A leash that cannot be spent is `null`, the same answer a call that cannot
  // be made gets everywhere else in this kit.
  //
  // A dwell is never negative. Two readings of one clock is what the law asks
  // for, and a clock that has gone backwards between them is a broken clock,
  // not a licence to hand on more time than arrived.
  onward() {
    if (!this.#clock) return null;
    const dwell = BigInt(this.#clock() - this.#arrived);
    const time = this.received.time - (dwell > 0n ? dwell : 0n);
    const hops = this.received.hops - 1n;
    if (time <= 0n || hops < 0n) return null;
    return { time, hops };
  }
}

export class Warden {
  // Every draw of randomness is taken as an argument, never reached for: the
  // name, the padlock and the warden's own heir all come from handed seeds.
  //
  // `limit` and `declares` are what the public being exposes — the warden's
  // own choice, per the law, and so a constructor argument. `limit` is the
  // one fact this document makes a warden publish: the largest message it will
  // accept, counted in bytes of the whole envelope as the carriage delivers it
  // — the ephemeral key and the ciphertext together, which is the one size a
  // caller can compute before sending. `declares` is the set of
  // blueprints it offers to anyone who asks, which is the second half of the
  // rule scoping `blueprint`.
  // A warden is opened, not constructed: every key it holds is derived from a
  // handed seed, the arithmetic that derives one is asynchronous on every
  // ground, and no constructor can wait.
  static async open(options) {
    const warden = new Warden(options);
    const seeds = options.seeds ?? {
      name: options.nameSeed,
      padlock: options.padlockSeed,
      heir: options.heirSeed,
    };
    warden.name = await signingPair(seeds.name);
    warden.padlock = await sealingPair(seeds.padlock);
    warden.heir = await signingPair(seeds.heir);
    // For a warden's own name the heir would spend at itself.
    warden.commitment = await commit(warden.name.pk, warden.heir.pk);
    for (const text of options.declares ?? []) {
      warden.declares.add(hex((await warden.#learn(text)).at));
    }
    // What must survive a restart is read back from the store the host handed
    // in: both records and the replay marks. The beings themselves are
    // pointers and cannot be stored; the host holds them again on the same
    // seeds, and the rows find them by name.
    if (warden.store) await warden.#restore();
    return warden;
  }

  constructor({
    hints = [],
    limit = 0n,
    clock = null,
    random = null,
    delivery = null,
    store = null,
    allowance = { time: 5_000n, hops: 8n },
  } = {}) {
    this.hints = [...hints];
    this.limit = limit;
    // Handed in by the host, never reached for: the clock, the randomness, the
    // store the records live in, and delivery — the one thing beneath the
    // warden that reads a hint.
    this.clock = clock;
    this.random = random;
    this.delivery = delivery;
    this.store = store;
    // The allowance a walk is born with when a being starts one of its own.
    this.allowance = allowance;
    // Private labels beside the outbound rows: they resolve nothing and travel
    // nowhere, and a being reaches its relations by them.
    this.labels = new Map();
    this.beings = new Map();
    // Inbound: which voices may reach which beings, keyed by the voice's pk.
    this.inbound = new Map();
    // Outbound: which of its beings may spend which relation, the invitation
    // kept whole. A list rather than a map, because two beings may hold
    // relations at one far warden and a relation is not identified by the
    // house it stands at.
    this.outbound = [];
    // The words this door published for beings that have moved. The old door
    // only points.
    this.gone = new Map();
    // What this door is armed to take in: the keys a `receive` will mint the
    // being under, and the object its blueprint is reproduced into.
    this.expected = null;
    // What the last `receive` took in: the word it published, the key it
    // generated, and the voices that arrived with the standings — everything
    // the second news is sent from.
    this.arrived = null;
    // Every blueprint text this door can hand back, keyed by its digest. The
    // Warden's own is always here, because every voice reaches the public
    // being and so every voice reaches that class.
    this.texts = new Map([[hex(WARDEN_DIGEST), WARDEN_BLUEPRINT]]);
    // The digests of the blueprints this door offers to anyone who asks, filled
    // as they are learned.
    this.declares = new Set();
    // Commitments this door will take a standing over for, held at the door
    // rather than as rows: an armed commitment is nobody's standing until it is
    // proved, and a lock is never a standing.
    this.armed = [];
    // What the answering side's own layer is told when the door falls silent.
    // Nothing outward changes: the wire still gets the one silence.
    this.observer = null;
    // Who is told the verified caller, per call, before the call is served.
    this.consumer = null;
  }

  // The inward view of silence. The stranger across the wire meets the same
  // nothing it always did; this is the house talking to itself, so a blueprint's
  // own layer can log, degrade, or answer its caller a typed refusal.
  observe(observer) {
    this.observer = typeof observer === 'function' ? observer : null;
    return this;
  }

  // The caller, offered inward. Having verified the voice, the warden hands it
  // to the house's own layer for the call it is about to serve — a fact, never
  // a judgment: permission stays in the inbound record, and nothing here
  // changes a byte of what crosses the wire. The layer registers once and
  // reads the offer as its resolver runs, which is why the offer is made
  // immediately before the call is routed.
  offer(consumer) {
    this.consumer = typeof consumer === 'function' ? consumer : null;
    return this;
  }

  // What is offered is the caller and nothing else: a copy of the voice, so the
  // layer can never reach back into what the warden holds, and which kind of
  // caller the judgment found — a current holder, a voice that arrived by
  // rotation or by proving an armed commitment, or a stranger, whose describe
  // is served like any other. Marks, windows, padlocks, hints and the steps
  // themselves stay at the door. A consumer that throws is the consumer's
  // problem: the answer is the same either way.
  #offer(voice, kind) {
    if (!this.consumer) return;
    try {
      this.consumer({ voice: voice.slice(), kind });
    } catch {
      // The door does not answer differently because the house fell over.
    }
  }

  // Every silence in the judgment goes through here, so the two directions
  // cannot drift: outward it is always `null`, inward it is a reason. An
  // observer that throws is the observer's problem and never the caller's.
  #hush(reason, detail = {}) {
    if (this.observer) {
      try {
        this.observer({ reason, ...detail });
      } catch {
        // The door does not answer differently because a watcher fell over.
      }
    }
    return null;
  }

  // Content-addressed text cannot be swapped for something friendlier by
  // whoever carried it, so what the door keeps is the canonical text itself.
  // The names come back with the digest because they are what the door serves:
  // a blueprint is parsed once, when it is learned, and never again at
  // judgment time.
  async #learn(blueprint) {
    const parsed = parse(blueprint);
    const text = print(parsed);
    const at = await digest(parsed);
    this.texts.set(hex(at), text);
    return { at, declares: new Set(parsed.fields.map((field) => field.name)) };
  }

  // A warden does not know where it stands until something stands it up: a
  // door on an ephemeral port has no address until it is listening, and a
  // domain is the host's fact, not the warden's. So the road is told to the
  // warden rather than fixed at birth, and every mint after it — a card, an
  // invitation, an ask, a word — carries the roads that are true then.
  //
  // Roads accumulate, because a warden offers as many as it has and none is
  // authoritative. Telling it the same road twice adds nothing.
  publish(...hints) {
    for (const hint of hints) if (!this.hints.includes(hint)) this.hints.push(hint);
    return this.hints;
  }

  // A road that has stopped carrying is not a road. Retracting one is not news
  // on its own: the peers that need to hear it are told by whatever moved the
  // door, and this only stops the dead road being minted into anything new.
  retract(...hints) {
    this.hints = this.hints.filter((hint) => !hints.includes(hint));
    return this.hints;
  }

  // The public being: every warden has one, it is a being like any other, and
  // every voice reaches it — so it appears in every estate, holders included.
  // It is named by the warden's own name, because the warden is the being.
  publicBeing() {
    return { pk: this.name.pk, digest: WARDEN_DIGEST, commitment: this.commitment };
  }

  // A stranger holds a card: the invitation without the voice.
  card() {
    return {
      warden: this.name.pk,
      commitment: this.commitment,
      padlock: this.padlock.pk,
      hints: this.hints,
    };
  }

  // Hold an object: mint its keys, record the pointer and the blueprint's
  // digest. A being is named by its pk, and the warden minted it. Its heir
  // lives under its warden, because nobody hand-manages three hundred keys —
  // and the commitment serves the peer, which receives it in every describe.
  //
  // The object is a plain class and stays one. What it gains is the closure
  // at `object._quo`, the one API a being has to Quo, and a codec: its declared
  // methods are called with decoded arguments and answer plain values, which
  // the warden encodes by the field's declared answer type. The being never
  // sees a byte. Its cells, when it moves, are what its own `cells()` says.
  async hold(object, { seed, heirSeed, blueprint, cells, label = null } = {}) {
    const keys = await signingPair(seed ?? this.random());
    const heir = await signingPair(heirSeed ?? seed ?? this.random());
    const learned = await this.#learn(blueprint);
    const parsed = parse(blueprint);
    const records = recordsOf(parsed);
    const fields = new Map(parsed.fields.map((field) => [field.name, field]));
    const being = {
      pk: keys.pk,
      secret: keys.secret,
      heir,
      commitment: await commit(this.name.pk, heir.pk),
      object,
      cells:
        cells ?? (() => (typeof object.cells === 'function' ? object.cells() : new Uint8Array(0))),
      take: (bytes) => object.take?.(bytes),
      digest: learned.at,
      // The scope of every grant at this being: what its blueprint does not
      // declare does not exist for it, so the door serves nothing else.
      declares: learned.declares,
      fields,
      records,
      // The being's method, invoked by the door with the caller and the leash
      // in scope, arguments decoded and the answer encoded. What must be bytes
      // or nothing at the wire is made so here, never by the being.
      invoke: async (name, blob, call) => {
        const field = fields.get(name);
        const args = decodeAll(
          field.args.map((arg) => arg.type),
          blob,
          records,
        );
        const value = await within(call, () => object[name](...args));
        if (!field.answer) return null;
        return encode(field.answer, value, records);
      },
    };
    this.beings.set(hex(keys.pk), being);
    object._quo = closure(this, being);
    if (label) this.labels.set(label, { local: keys.pk });
    await this.#persist();
    return { being: keys.pk, handle: localHandle(this, being) };
  }

  // Release a being: drop the pointer, and its standings go with it.
  release(beingPk) {
    if (!beingPk) return false;
    const at = hex(beingPk);
    if (!this.beings.delete(at)) return false;
    for (const [voice, row] of this.inbound) {
      row.beings.delete(at);
      if (row.beings.size === 0) this.inbound.delete(voice);
    }
    for (const [label, kept] of this.labels) {
      if (kept.local && hex(kept.local) === at) this.labels.delete(label);
    }
    this.#persistSoon();
    return true;
  }

  // A handle by its private label: a being minted beside this one, or a
  // relation accepted under that label. Nothing resolves a label but this map.
  relation(label) {
    const kept = this.labels.get(label);
    if (!kept) return null;
    if (kept.local) {
      const being = this.beings.get(hex(kept.local));
      return being ? localHandle(this, being) : null;
    }
    return kept.handle ?? null;
  }

  // The leash a call is handed: the allowance that arrived, the clock reading
  // taken at arrival, and the clock to take the second reading by.
  leash(allowance, arrived) {
    return new Leash(allowance, arrived, this.clock);
  }

  // Mark an ask as awaiting again, for a caller resending the identical
  // envelope after silence. The number stays what it was.
  await(row, seq) {
    const pending = awaits(this.padlock.pk, seq);
    if (!row.awaiting.has(pending)) row.awaiting.set(pending, null);
  }

  // One ask down an outbound row, sealed, posted and settled — the warden's own
  // half of what a handle does, for the acts the warden makes on its own
  // account: the rotations, the describe, a blueprint by digest.
  //
  // Three outcomes, kept apart because the caller's next move differs: the
  // answer, `null` for silence, and `WEATHER` when no road carried the bytes —
  // the far door never heard, so nothing there moved and the number is spent
  // on this side alone.
  async #say(row, options) {
    const allowance = allowanceNow(this);
    if (!allowance) return null;
    const envelope = await this.ask(row, { ...options, allowance, random: this.random() });
    if (!envelope) return null;
    const promise = this.pending(row, options.seq, allowance.time);
    let back;
    try {
      back = await this.delivery.send(
        { padlock: row.padlock.slice(), hints: [...row.hints] },
        envelope,
      );
    } catch (thrown) {
      return this.weather(row, options.seq, thrown);
    }
    // A road that answers in its response has answered: bytes, or the empty
    // body that is silence's wire form. A road that answers through the door
    // says neither, and the promise waits for what arrives.
    if (back === null) this.forgo(row, options.seq);
    else if (back) await this.arrive(back);
    return promise;
  }

  // Weather, reported inward. The road's fault is not the far door's silence
  // and is never made to look like it: the observer is told which it was — a
  // road that broke, with the roads tried, or no road at all, with the hints
  // nobody here could speak — and the ask is forgone. Anything a road threw
  // that is neither is a defect in the road and is rethrown as one.
  weather(row, seq, thrown) {
    let told;
    if (thrown instanceof Weather) {
      told = { reason: 'weather', tried: thrown.tried, thrown: thrown.cause ?? null };
    } else if (thrown instanceof NoRoad) {
      told = { reason: 'no road', hints: thrown.hints };
    } else {
      throw thrown;
    }
    this.forgo(row, seq);
    if (this.observer) {
      try {
        this.observer(told);
      } catch {
        // The road is not held up because a watcher fell over.
      }
    }
    return WEATHER;
  }

  // The rotating say: signed by the row's voice, which is the heir the far door
  // committed, so it takes the standing over and commits `next` as the heir
  // after it. The mark starts fresh at a rotation, so the count opens at one.
  //
  // The trap is Article VIII's: the rotation lands at step 4 and the number is
  // judged at step 5, so a silence back may mean the takeover already
  // happened — this voice holds, and a rotation sent again would be refused as
  // a plain ask carrying a commitment (Article XI), now and every time after.
  // The recovery the law names is to ask again on the new voice, and that is
  // what this does: a plain ask at the next number. Answered, the takeover had
  // landed and the describe is the proof. Silent, it had not — a voice still
  // matching the heir commitment and carrying no fresh one is refused — so the
  // rotation itself goes once more, at the number after. Three sends, then
  // the kit stops guessing and answers nothing, with the count as it was.
  // Weather is never tried again from here: the far door never heard, nothing
  // there moved, and the caller retries with exactly what it holds.
  //
  // Answers the describe the far door gave, or `null`.
  async #rotate(row, next) {
    const was = row.seq;
    const commitment = await commit(row.warden, next.pk);
    row.seq = 0n;
    let answered = await this.#say(row, { seq: 1n, commitment });
    if (answered === null) answered = await this.#say(row, { seq: 2n });
    if (answered === null) answered = await this.#say(row, { seq: 3n, commitment });
    if (answered && answered !== WEATHER) return answered;
    row.seq = was;
    return null;
  }

  // Accepting an invitation, whole, into handles. Two rotations, both to keys
  // nobody else has seen; then the standing is read from the far door.
  async accept(invitation, { label = null, being = null } = {}) {
    if (!this.delivery) return null;
    const voice = await signingPair(this.random());
    const heir = await signingPair(this.random());
    const row = this.remember(invitation, { being });

    // The invitation's key takes the standing and commits `voice`; then `voice`
    // takes it and commits `heir`. After both, the door holds `voice` with
    // `heir` committed, and no key the granter ever saw is live.
    if (!(await this.#rotate(row, voice))) return this.#abandon(row);
    row.voice = { pk: voice.pk, secret: voice.secret };
    const second = await this.#rotate(row, heir);
    if (!second) return this.#abandon(row);
    row.heir = { pk: heir.pk, secret: heir.secret };

    const handles = await this.handles(row, { label, estate: readField('describe', second.data) });
    if (!handles) return this.#abandon(row);
    return handles;
  }

  // A card is not an invitation: it names a house and the way to it, and no
  // voice. So the knock is signed by a key minted here and placed nowhere at
  // the far door, which is what being a stranger is — and what a stranger is
  // shown is the estate with one room in it, the far door's public being.
  async knock(card, { label = null, being = null } = {}) {
    if (!this.delivery) return null;
    const voice = await signingPair(this.random());
    const row = this.remember(card, {
      voicePk: voice.pk,
      voiceSecret: voice.secret,
      being,
    });
    row.seq = 0n;
    const answered = await this.#say(row, { seq: 1n });
    const estate = readField('describe', answered?.data ?? null);
    const shown = estate?.classes.find((one) => same(one.digest, WARDEN_DIGEST));
    const target = shown?.beings[0];
    if (!target) return this.#abandon(row);
    this.note(row.warden, { being: target.being, commitment: target.commitment });
    const handle = remoteHandle(this, row, target.being, WARDEN_BLUEPRINT);
    if (label) this.labels.set(label, { row, being: target.being, digest: WARDEN_DIGEST, handle });
    await this.#persist();
    return handle;
  }

  // The standing, read from the far door as it stands now: a handle for every
  // being the estate names, the warden's own public being apart, because that
  // one is reached by every voice and is what a knock answers with. A standing
  // widened by an amend is found here rather than remembered, so a holder that
  // describes again holds what was added.
  //
  // An array, not a record keyed by being: every handle names its own being at
  // `handle._quo.being`, so a caller matches by that, and the order is the estate's
  // own — classes by digest, beings by key, both ascending — which is derived
  // from the bytes and the same at every ground. A record would key on a hex
  // string the caller has to spell.
  async handles(row, { label = null, estate = null } = {}) {
    const answered = estate ? null : await this.#say(row, { seq: row.seq + 1n });
    const shown = estate ?? readField('describe', answered?.data ?? null);
    if (!shown) return null;
    const handles = [];
    for (const one of shown.classes) {
      if (same(one.digest, WARDEN_DIGEST)) continue;
      let text = this.texts.get(hex(one.digest));
      if (!text) {
        const asked = await this.#say(row, {
          seq: row.seq + 1n,
          method: { name: 'blueprint', args: writeArgument('blueprint', one.digest) },
        });
        text = readField('blueprint', asked?.data ?? null);
        if (!text) continue;
        this.texts.set(hex(one.digest), text);
      }
      for (const target of one.beings) {
        this.note(row.warden, { being: target.being, commitment: target.commitment });
        const handle = remoteHandle(this, row, target.being, text);
        handles.push(handle);
        // A label is a private name for one being, so it names the first the
        // estate gives; the rest of the standing is in what comes back.
        if (label && !this.labels.has(label)) {
          this.labels.set(label, { row, being: target.being, digest: one.digest, handle });
        }
      }
    }
    if (handles.length === 0) return null;
    await this.#persist();
    return handles;
  }

  // Describe is one of the five things that cross, so it is on the handle
  // beside the being's own fields: a being that could invoke a field but not
  // learn what fields exist would be back to composing envelopes by hand. Each
  // is an ordinary ask at the far door's own fields, answering a value or
  // silence like anything else.
  // `being` is read through a function because a handle's being is not fixed:
  // a succession it believes renames the being it stands at, and these asks
  // must follow it rather than the name the handle was made with.
  introspect(row, being) {
    const beingPk = () => (typeof being === 'function' ? being() : being);
    const at = async (name, ...values) => {
      const answered = await this.#say(row, {
        seq: row.seq + 1n,
        method: { name, args: writeArgument(name, ...values) },
      });
      return readField(name, answered?.data ?? null);
    };
    return {
      describe: () => at('describe'),
      sketch: (target) => at('sketch', pkOf(target) ?? beingPk()),
      // The one place a peer may ask where a being went. It answers the word
      // the far door published, absence when nothing has moved, and silence
      // when that voice never reached the being.
      moved: (target) => at('moved', pkOf(target) ?? beingPk()),
      blueprint: (digestOf) => at('blueprint', digestOf),
      limit: () => at('limit'),
      handles: () => this.handles(row),
    };
  }

  // The same asks, under one warden: no seal and no judgment, because there are
  // no strangers here — and the same values, because a being written for one
  // kind of neighbour is installed anywhere. What a local handle stands on is
  // what a standing at that one being would reach.
  introspectLocal(beingPk) {
    const held = () => this.beings.has(hex(beingPk));
    const reach = () => new Set([hex(beingPk), hex(this.name.pk)]);
    return {
      describe: async () => (held() ? this.estate(reach()) : null),
      sketch: async (target) => {
        const at = pkOf(target) ?? beingPk;
        if (!held() || !reach().has(hex(at))) return null;
        return this.sketchOf(at);
      },
      moved: async (target) =>
        held() ? (this.gone.get(hex(pkOf(target) ?? beingPk)) ?? null) : null,
      blueprint: async (digestOf) => (held() ? this.blueprintFor(reach(), digestOf) : null),
      limit: async () => (held() ? this.limit : null),
      handles: async () => (held() ? [localHandle(this, this.beings.get(hex(beingPk)))] : []),
    };
  }

  #abandon(row) {
    this.outbound = this.outbound.filter((one) => one !== row);
    return null;
  }

  // The records, as the store keeps them: every fact a restart must not lose,
  // written as plain data. Beings are pointers and are not here; the host
  // holds them again on the same seeds, and the rows find them by name.
  #snapshot() {
    const h = (bytes) => (bytes ? hex(bytes) : null);
    return {
      hints: [...this.hints],
      texts: [...this.texts],
      inbound: [...this.inbound.values()].map((row) => ({
        voice: h(row.voice),
        commitment: h(row.commitment),
        name: h(row.name),
        beings: [...row.beings],
        mark: row.mark === null ? null : String(row.mark),
        spent: row.window().map(String),
        padlock: h(row.padlock),
        hints: [...row.hints],
      })),
      outbound: this.outbound.map((row) => ({
        warden: h(row.warden),
        commitment: h(row.commitment),
        padlock: h(row.padlock),
        voice: h(row.voice.pk),
        secret: h(row.voice.secret),
        heir: h(row.heir?.pk),
        heirSecret: h(row.heir?.secret),
        hints: [...row.hints],
        seq: String(row.seq),
        news: row.marks.mark === null ? null : String(row.marks.mark),
        being: h(row.being),
        beings: [...row.beings.values()].map((ref) => ({
          being: h(ref.being),
          commitment: h(ref.commitment),
          warden: h(ref.warden),
          padlock: h(ref.padlock),
          hints: [...ref.hints],
        })),
      })),
      labels: [...this.labels].map(([label, kept]) => ({
        label,
        local: h(kept.local),
        warden: kept.row ? h(kept.row.warden) : null,
        being: h(kept.being),
        digest: h(kept.digest),
      })),
    };
  }

  async #persist() {
    if (!this.store) return;
    await this.store.save(this.#snapshot());
  }

  // Write the records now, whatever has happened since the last act that owed
  // a write. The store is written on the acts that change it — a grant, an
  // accept, an amend — and not on every ask, because a write per message would
  // be a store standing in the way of the wire. The cost of that is a ground
  // which stops between two asks and comes back holding a number the far door
  // has already spent: its first ask is refused as the replay it looks exactly
  // like. A ground that knows it is stopping owes itself this, and a host's
  // `close` is where it is owed.
  async keep() {
    await this.#persist();
  }

  // For the synchronous acts: the write is owed, not awaited.
  #persistSoon() {
    if (!this.store) return;
    this.store.save(this.#snapshot());
  }

  async #restore() {
    const kept = await this.store.load();
    if (!kept) return;
    const u = (text) => (text === null ? null : unhex(text));
    this.hints = [...kept.hints];
    for (const [at, text] of kept.texts) this.texts.set(at, text);
    for (const row of kept.inbound) {
      this.inbound.set(
        row.voice,
        new Standing({
          voice: u(row.voice),
          commitment: u(row.commitment),
          name: u(row.name),
          beings: row.beings.map(unhex),
          padlock: u(row.padlock),
          hints: row.hints,
          mark: row.mark === null ? null : BigInt(row.mark),
          spent: row.spent.map(BigInt),
        }),
      );
    }
    for (const row of kept.outbound) {
      const restored = {
        warden: u(row.warden),
        commitment: u(row.commitment),
        padlock: u(row.padlock),
        voice: { pk: u(row.voice), secret: u(row.secret) },
        heir: row.heir ? { pk: u(row.heir), secret: u(row.heirSecret) } : null,
        hints: row.hints,
        marks: adoptedMarks(row.news === null ? 0n : BigInt(row.news)),
        being: u(row.being),
        seq: BigInt(row.seq),
        beings: new Map(
          row.beings.map((ref) => [
            ref.being,
            {
              being: u(ref.being),
              commitment: u(ref.commitment),
              warden: u(ref.warden),
              padlock: u(ref.padlock),
              hints: ref.hints,
            },
          ]),
        ),
        awaiting: new Map(),
      };
      this.outbound.push(restored);
    }
    for (const one of kept.labels) {
      if (one.local) {
        this.labels.set(one.label, { local: unhex(one.local) });
        continue;
      }
      const row = this.outbound.find((r) => hex(r.warden) === one.warden);
      const text = this.texts.get(one.digest);
      if (!row || !text) continue;
      const being = unhex(one.being);
      this.labels.set(one.label, {
        row,
        being,
        digest: unhex(one.digest),
        handle: remoteHandle(this, row, being, text),
      });
    }
  }

  // Succeed the warden's own name. The heir this door committed to spends, and
  // from here on the house signs by that key and is addressed by it; the key it
  // commits to next is the owner's again, so only a seed for it is given. The
  // public being's pk is the warden's name, so it moves with the name.
  //
  // Every standing stays where it was. Each inbound row keeps the name its own
  // commitment was minted under, so a standing granted before the succession
  // still rotates — its heir hashes to a commitment at the old name — while
  // every commitment minted from here on is under the new one.
  //
  // The key is handed as a seed like every other key this warden holds, and is
  // checked against the commitment before anything moves: a door that adopted
  // a name it never committed to would be a door nobody can believe.
  async succeed({ nameSeed, heirSeed }) {
    const name = await signingPair(nameSeed);
    if (!same(await commit(this.name.pk, name.pk), this.commitment)) return null;
    const heir = await signingPair(heirSeed);
    this.name = name;
    this.heir = heir;
    this.commitment = await commit(name.pk, heir.pk);
    return { name: name.pk, commitment: this.commitment };
  }

  // The old door only points: it keeps the succession it published and answers
  // `moved` with it. Every other ask meets silence.
  point(beingPk, word) {
    this.gone.set(hex(beingPk), word);
    return true;
  }

  // Grant: mint a voice, write the inbound row, hand out the invitation. The
  // holder's heir is committed with this door's name inside the hash, so a
  // commitment is valid only at the door it was minted for.
  async grant(beingPk, { voiceSeed, heirSeed, padlock, hints } = {}) {
    if (!beingPk || !this.beings.has(hex(beingPk))) return null;
    const voice = await signingPair(voiceSeed ?? this.random());
    const heir = await signingPair(heirSeed ?? this.random());
    this.inbound.set(
      hex(voice.pk),
      new Standing({
        voice: voice.pk,
        commitment: await commit(this.name.pk, heir.pk),
        name: this.name.pk,
        beings: [beingPk],
        padlock: padlock ?? null,
        hints: hints ?? [],
      }),
    );
    await this.#persist();
    // What a holder holds is five things.
    return {
      warden: this.name.pk,
      commitment: this.commitment,
      padlock: this.padlock.pk,
      heirPublic: heir.pk,
      heirSecret: heir.secret,
      hints: [...this.hints],
    };
  }

  // Arm a commitment this door did not derive: a claim nobody has made yet,
  // toward the beings a successful claim reaches. `grant` mints the voice and
  // the heir itself, which a ground whose keys were never made on the machine
  // cannot use — here the claimant's own keys become the holder, and the door
  // learns them only when the claim is proved.
  //
  // Nothing is written into the inbound record: an armed commitment is held at
  // the door, because no standing means the public face and a lock is never a
  // standing. It is spent by the first claim that proves it; a wrong proof is
  // ordinary silence and leaves it armed. Re-arming is the caller's own act.
  //
  // `name` is the door name the commitment was hashed under, for a commitment
  // minted before a name succession — the same fact a standing keeps.
  arm(commitment, { beings = [], name = null } = {}) {
    const held = { commitment, name: name ?? this.name.pk, beings: [...beings] };
    this.armed.push(held);
    return held;
  }

  // A standing is amended, not replaced: the warden adds a being to the list
  // or takes one away. Taking the last being away is release, and there is no
  // separate act for it.
  amend(voicePk, { add = [], remove = [] } = {}) {
    const row = this.inbound.get(hex(voicePk));
    if (!row) return false;
    for (const being of add) if (this.beings.has(hex(being))) row.beings.add(hex(being));
    for (const being of remove) if (being) row.beings.delete(hex(being));
    if (row.beings.size === 0) this.inbound.delete(hex(voicePk));
    this.#persistSoon();
    return true;
  }

  standing(voicePk) {
    return this.inbound.get(hex(voicePk)) ?? null;
  }

  // A being's own layer, reading who holds a standing at it — never who is
  // calling on a given message, and never another being's rows. What listing
  // who holds what needs is the voice pk alone: marks, spent windows,
  // padlocks and hints are the door's bookkeeping, not social data. Copies
  // only, so the caller can never reach back into what the warden holds.
  standings(beingPk) {
    const at = hex(beingPk);
    const holders = [];
    for (const row of this.inbound.values()) {
      if (row.beings.has(at)) holders.push({ voice: row.voice.slice() });
    }
    return holders;
  }

  // The outbound record: an invitation kept whole, with the mark this warden
  // keeps for that far warden, and the beings it has been described.
  //
  // `being` is which of this warden's beings spends the relation. A relation
  // nobody here owns belongs to the warden itself and travels nowhere.
  remember(invitation, { voiceSecret, voicePk, being = null } = {}) {
    const row = {
      warden: invitation.warden,
      commitment: invitation.commitment,
      padlock: invitation.padlock,
      voice: { pk: voicePk ?? invitation.heirPublic, secret: voiceSecret ?? invitation.heirSecret },
      // A card carries no heir, because it opens no standing to take over.
      heir: invitation.heirPublic
        ? { pk: invitation.heirPublic, secret: invitation.heirSecret }
        : null,
      hints: invitation.hints,
      marks: new Marks(),
      being,
      // The count kept against that far door: the highest number this side has
      // spent there, so a relation that changes house does not repeat one.
      seq: 0n,
      // What this peer has been told about the beings it stands at: the pk it
      // now names, the commitment that lets it believe the next succession,
      // and where that being now answers.
      beings: new Map(),
      // The asks put on a road down this relation with no answer heard yet.
      // Article XII's fourth check on an answer is that one is awaiting under
      // that padlock, that warden and that seq, so the caller keeps the record
      // that check reads — in the core, because the check is owed whether or
      // not a socket was involved.
      awaiting: new Map(),
    };
    this.outbound.push(row);
    return row;
  }

  // Take in a relation that travelled with a being: the far house, the way to
  // it, both of the voice's keys and the count already spent there. The heir
  // travels or the standing arrives unrotatable — the far door holds a
  // commitment to an heir whose secret would have stayed at the origin.
  adopt(relation, beingPk) {
    const row = {
      warden: relation.warden,
      commitment: relation.commitment,
      padlock: relation.padlock,
      voice: { pk: relation.voice, secret: relation.secret },
      heir: { pk: relation.heir, secret: relation.heirSecret },
      hints: relation.hints,
      // The news mark travels too, so a peer's numbers stay spent across the
      // move rather than coming round again at the new door.
      marks: adoptedMarks(relation.news),
      being: beingPk,
      seq: relation.seq,
      beings: new Map(),
      awaiting: new Map(),
    };
    this.outbound.push(row);
    return row;
  }

  // Every relation one of this warden's beings spends.
  relationsOf(beingPk) {
    return this.outbound.filter((row) => row.being && same(row.being, beingPk));
  }

  // A being that has left takes its relations with it: the old door holds no
  // key of its any more, so it may spend nothing on its behalf.
  //
  // `at` narrows it to the relations that being holds at one far warden, named
  // by that warden's own key — which is how a relation re-remembered at a house
  // supersedes the one it replaces, without a consumer reaching into the
  // record. It answers how many rows it dropped.
  forget(beingPk, { at = null } = {}) {
    const before = this.outbound.length;
    this.outbound = this.outbound.filter(
      (row) => !(row.being && same(row.being, beingPk) && (!at || same(row.warden, at))),
    );
    return before - this.outbound.length;
  }

  // A describe hands back a commitment per being; a peer that means to believe
  // that being's succession keeps it, because otherwise the news arrives with
  // nothing to hash against.
  note(farWardenPk, { being, commitment, warden, padlock, hints }) {
    const row = this.outbound.find((one) => same(one.warden, farWardenPk));
    if (!row) return null;
    const ref = {
      being,
      commitment,
      warden: warden ?? row.warden,
      padlock: padlock ?? row.padlock,
      hints: hints ?? row.hints,
    };
    row.beings.set(hex(being), ref);
    return ref;
  }

  handle(beingPk) {
    for (const row of this.outbound) {
      const ref = row.beings.get(hex(beingPk));
      if (ref) return ref;
    }
    return null;
  }

  // Step three, second half: is this voice one of the houses we hold a
  // relation with, the heir one of them committed, or the heir of a being we
  // stand at? A far key is known only by its commitment, so the hash is the
  // only way to recognise it.
  async #place(voicePk) {
    const at = hex(voicePk);
    for (const row of this.outbound) {
      if (hex(row.warden) === at) return { row, ref: null };
      if (row.heir && hex(row.heir.pk) === at) return { row, ref: null };
      if (same(await commit(row.warden, voicePk), row.commitment)) return { row, ref: null };
      for (const ref of row.beings.values()) {
        if (same(await commit(ref.warden, voicePk), ref.commitment)) return { row, ref };
      }
    }
    return null;
  }

  async outboundFor(voicePk) {
    return (await this.#place(voicePk))?.row ?? null;
  }

  // Carry a call out: sign with the caller's voice, seal to the far padlock.
  // The recipient and the lock come from the record, never from the message
  // being answered.
  // `commitment` is present only when the message spends an heir: nothing
  // marks it as a rotation, the kind being read off the voice at the far door.
  carry({
    recipient,
    padlock,
    voiceSecret,
    voicePk,
    commitment = null,
    seq,
    allowance,
    leash = null,
    being,
    method,
    random,
  }) {
    // `leash` is the call this ask is made in the course of, when it is one. A
    // being standing in the middle of a chain hands its own leash straight
    // back, and the allowance is read off it here, at the moment of sealing —
    // which is the moment the message is handed onward, and the second of the
    // two readings the dwell is the difference of. Present, it overrides
    // `allowance`, so a being under a leash cannot widen one even by mistake.
    if (leash) allowance = leash.onward();
    // An ask that could not be judged is not made: a hop count below zero or a
    // budget at or below zero is what the far door would meet with silence, so
    // the near door never spends the number on it.
    if (!allowance || allowance.hops < 0n || allowance.time <= 0n) return null;
    return seal({
      payload: {
        voice: voicePk,
        recipient,
        commitment,
        seq,
        padlock: this.padlock.pk,
        hints: this.hints,
        allowance,
        being: being ?? null,
        method: method ?? null,
      },
      padlock,
      voiceSecret,
      random,
    });
  }

  // An ordinary ask down an outbound row: the commonest carry there is, and
  // what a source pushing into a subscriber uses like anything else.
  ask(
    row,
    { seq, commitment = null, allowance = this.allowance, leash = null, being, method, random },
  ) {
    // An answer is paired to its ask by the padlock, the warden and the seq,
    // and by nothing else. Two asks out at once carrying the same three would
    // be answered indistinguishably, so this kit refuses to send the second —
    // which is the shape a rotation makes, because it starts the far door's
    // mark fresh and brings a number round again.
    const pending = awaits(this.padlock.pk, seq);
    if (row.awaiting.has(pending)) return null;
    const envelope = this.carry({
      recipient: row.warden,
      padlock: row.padlock,
      voiceSecret: row.voice.secret,
      voicePk: row.voice.pk,
      commitment,
      seq,
      allowance,
      leash,
      being,
      method,
      random,
    });
    // The count kept against that far door, so it travels with the relation and
    // the being does not repeat a number after it moves — raised only once
    // there is something to send. A hop this kit refused itself put no message
    // on the wire, so it spends no number against a door that never heard of
    // it. `carry` refuses synchronously and seals asynchronously, so this reads
    // the refusal without waiting on the seal.
    if (!envelope) return null;
    if (typeof seq === 'bigint' && seq > row.seq) row.seq = seq;
    row.awaiting.set(pending, null);
    return envelope;
  }

  // The promise an awaiting ask resolves: the decoded answer record when one
  // arrives through the door, `null` when the caller's own deadline passes or
  // the ask is forgone. Delivery never touches this; the road hands whatever
  // comes back to `arrive`, and `arrive` settles it.
  pending(row, seq, deadline = null) {
    const pending = awaits(this.padlock.pk, seq);
    if (!row.awaiting.has(pending)) return Promise.resolve(null);
    return new Promise((settle) => {
      let timer = null;
      const done = (answer) => {
        if (timer) clearTimeout(timer);
        settle(answer);
      };
      // The timer holds the process: a caller awaiting its deadline is owed
      // the silence, and an unreferenced timer let a process with nothing
      // else to do exit before it arrived.
      if (deadline !== null) {
        timer = setTimeout(() => {
          row.awaiting.delete(pending);
          done(null);
        }, Number(deadline));
      }
      row.awaiting.set(pending, done);
    });
  }

  // The one entry point for arriving bytes, whatever road carried them. The
  // record byte inside the seal says which of the two records arrived, and
  // only the warden reads it: an answer settles the ask awaiting it and the
  // road gets nothing back; a say is judged and the road gets bytes or silence.
  // A road never opens a seal to route.
  //
  // `via` is the road the bytes arrived on, opaque to the warden and handed
  // back to delivery beside the caller's padlock once the way back is
  // refreshed — so a peer that publishes nothing can be reached down the line
  // it holds, and the road never had to open a seal to be remembered.
  async arrive(envelope, via = null) {
    let inside;
    try {
      inside = await unbox(envelope, this.padlock.secret);
    } catch {
      return this.#hush('not ours');
    }
    if (inside.bytes.length > 0 && inside.bytes[0] === ANSWER_BYTE) {
      await this.hear(envelope);
      return null;
    }
    return this.judge(envelope, { clock: this.clock, random: this.random(), via });
  }

  // The caller's own judgment of an answer — Article XII's shorter road, whole.
  // The envelope's half is `readAnswer`: unseal under the padlock the ask
  // named, take only the `answer` byte, and verify the signature against the
  // `warden` the record itself carries. The two checks left are the caller's
  // bookkeeping and live here, because only the caller knows what it asked:
  // that warden must be a door this ground actually holds a relation with, and
  // an ask must be awaiting under that padlock, that warden and that seq.
  //
  // An answer nothing awaits is the same silence as every other failure, and
  // hearing one spends the record, so the same bytes never answer twice.
  async hear(envelope) {
    const answer = await readAnswerBytes(envelope, this.padlock.secret);
    if (!answer) return null;
    // One far warden may be held by more than one row — the record says which
    // of this ground's beings may spend which relation — so the awaiting entry
    // is what picks the row, not the name alone.
    const pending = awaits(this.padlock.pk, answer.seq);
    for (const row of this.outbound) {
      if (!same(row.warden, answer.warden)) continue;
      if (!row.awaiting.has(pending)) continue;
      const settle = row.awaiting.get(pending);
      row.awaiting.delete(pending);
      settle?.(answer);
      return answer;
    }
    return null;
  }

  // Stop awaiting an ask whose answer will never come — a road that failed to
  // carry, or a caller that has stopped waiting. Nothing on the wire changes:
  // the number stays spent, because a message the far door judged spent it
  // there whatever this end does with its own record.
  forgo(row, seq) {
    const pending = awaits(this.padlock.pk, seq);
    if (!row.awaiting.has(pending)) return false;
    const settle = row.awaiting.get(pending);
    row.awaiting.delete(pending);
    settle?.(null);
    return true;
  }

  // The judgment, in order. Every failure is the same failure: silence, which
  // here is `null`, and the door never says which step it was.
  async judge(envelope, { clock, random, via = null }) {
    try {
      return await this.#judge(envelope, clock, random, via);
    } catch (thrown) {
      // The warden is the global try/catch, and it never throws.
      return this.#hush('threw', { thrown });
    }
  }

  async #judge(envelope, clock, random, via) {
    // The first of the two readings the dwell is the difference of. It is taken
    // before anything is unsealed, because what it marks is when the message
    // arrived and not when the door got round to it.
    const arrived = clock();

    // 0. The published limit, which binds on every road and not only on the
    // one with a socket in it. It is what a caller can compute before sending,
    // so it is judged before anything is unsealed — and a door whose limit was
    // enforced by its line alone would accept over distance zero exactly what
    // it told every caller it would refuse.
    if (this.limit > 0n && BigInt(envelope.length) > this.limit) {
      return this.#hush('over the limit', { bytes: envelope.length });
    }

    // 1. Unseal with the warden's own secret.
    const { payload, bytes, signature } = await open({
      envelope,
      padlockSecret: this.padlock.secret,
    });

    // 2. Verify the signature over the payload, using the voice it carries.
    if (!(await verify(bytes, signature, payload.voice))) return this.#hush('unsigned');

    // 3. Check the recipient, named inside by whichever key the sender holds:
    // the warden's name when it has one, otherwise the padlock it sealed to —
    // a padlock is per door, so the binding job is done either way, and a
    // door that never named its house can still be spoken to first. A
    // message presented at any other door is silence.
    if (!same(payload.recipient, this.name.pk) && !same(payload.recipient, this.padlock.pk)) {
      return this.#hush('misaddressed');
    }

    // 4. Place the voice, in the two records and in that order.
    let row = this.inbound.get(hex(payload.voice));
    // Which kind of caller the placement found, for the inward offer alone.
    let kind = row ? 'holder' : null;
    // Found as a current holder → an ask, and the commitment field is present
    // only when a message spends an heir. A plain ask carrying one is refused.
    if (row && payload.commitment) return this.#hush('ask carrying a commitment');
    if (!row) {
      const matched = [];
      for (const [at, candidate] of this.inbound) {
        // Hashed against the name the commitment was minted under, never this
        // door's current name: after a name succession an older standing must
        // still be able to rotate.
        if (!same(await commit(candidate.name, payload.voice), candidate.commitment)) continue;
        matched.push([at, candidate]);
      }
      // Matching more than one standing is silence. No order over the records
      // is law, so a door that chose between them would choose differently from
      // the next, and a granter that committed one heir at two standings has
      // made its own error. Every match is gathered before anything moves,
      // because a door that took the first it found would have chosen.
      if (matched.length > 1) return this.#hush('ambiguous rotation');
      if (matched.length === 1) {
        const [at, candidate] = matched[0];
        // A rotation carrying no fresh commitment is a standing that could be
        // taken over once and never again.
        if (!payload.commitment) return this.#hush('rotation without a commitment');
        this.inbound.delete(at);
        // New commitments are minted under the name the door has now.
        candidate.rotate(payload.voice, payload.commitment, this.name.pk);
        this.inbound.set(hex(payload.voice), candidate);
        row = candidate;
        kind = 'rotation';
      }
    }

    // Still nowhere, and carrying a commitment → the claim on an armed one. It
    // is the rotation path above with the minting taken out: the claimant's own
    // keys become the holder, and the standing is written at the beings the arm
    // named. Judged after the inbound record, so an arm can never take a
    // standing that already stands away from its holder.
    if (!row && payload.commitment) {
      for (let at = 0; at < this.armed.length; at += 1) {
        const held = this.armed[at];
        if (!same(await commit(held.name, payload.voice), held.commitment)) continue;
        this.armed.splice(at, 1);
        row = new Standing({
          voice: payload.voice,
          commitment: payload.commitment,
          name: this.name.pk,
          beings: held.beings,
          padlock: payload.padlock,
          hints: payload.hints,
        });
        this.inbound.set(hex(payload.voice), row);
        kind = 'rotation';
        break;
      }
    }

    // Found in the outbound record → news, judged as its own section says.
    const place = row ? null : await this.#place(payload.voice);
    // Nowhere → the stranger's case, which is a standing at nothing.
    const stranger = !row && !place;

    // 5. Spend the seq. News is counted too, against the mark kept for that
    // far warden. A stranger spends nothing: it has no row, so no mark is kept
    // for it and its numbers are not counted — a door keeping a mark per
    // stranger would be a door with unbounded memory.
    const marks = row ?? place?.row.marks ?? null;
    if (marks && !marks.spend(payload.seq)) return this.#hush('seq', { seq: payload.seq });

    if (row) {
      // The way back is refreshed here, between the seq and the leash. Not
      // earlier, because a replayed message would otherwise rewrite a live way
      // back with a retired one, and the seq is what tells a replay from a
      // call. Not later, because a message refused for its leash still arrived
      // and still spent its number, and a door that refreshed only what it went
      // on to route would lose the way back to any peer it keeps refusing.
      row.padlock = payload.padlock;
      // An empty hints list means the road did not change, never an erasure:
      // a dialing end publishes nothing by nature, and erasing on that would
      // destroy its way back on its first ask.
      if (payload.hints.length > 0) row.hints = payload.hints;
    }
    // The number is spent and the way back refreshed: what a restart must not
    // lose has just changed.
    await this.#persist();
    // Delivery learns the road this padlock's asks arrive on, as an address
    // beside an opaque token. It reads nothing else of the message.
    if (via && this.delivery?.arrived) this.delivery.arrived(payload.padlock.slice(), via);

    // 6. Spend the leash, judged on what arrived: a budget at or below zero, or
    // a hop count below zero, is silence. A hop count of zero is a legal leash
    // for a call that goes no further — what it forbids is onward.
    const { time, hops } = payload.allowance;
    if (hops < 0n || time <= 0n) return this.#hush('leash', { time, hops });

    // Whatever this call reaches onward carries less than it received: the hop
    // count falls by one, and the time budget by this door's own dwell. The
    // dwell is only known when the handing onward happens, so what the being is
    // handed carries the arrival reading and the clock rather than a number
    // worked out now.
    const leash = new Leash(payload.allowance, arrived, clock);

    // 7. Route — being and method, being alone, neither, a method with no being
    // reaching the warden's own being, or the stranger's case; and for a voice
    // placed in the outbound record, news.
    if (place) return this.#news(place, payload, random);

    // The caller is verified and the call is about to be served: the one moment
    // the house may be told who is asking. News never reaches here, because a
    // peer announcing a succession is calling nobody's layer.
    this.#offer(payload.voice, kind ?? 'stranger');

    const reach = stranger
      ? new Set([hex(this.name.pk)])
      : new Set([...row.beings, hex(this.name.pk)]);

    if (!payload.being && !payload.method) {
      // Neither — the warden describes the estate, and the estate means what
      // that voice may reach. A stranger gets a house with one room in it.
      return this.#reply(payload, 'describe', this.estate(reach), random);
    }
    // Method, no being — the warden's own being answers. Addressing the door
    // alone is how you speak to the ground's own affairs, so a caller reaching
    // `limit` or `blueprint` need not pay a describe first to learn the name of
    // the being it is already talking to.
    if (!payload.being) return this.#own(payload, reach, stranger, random);
    if (!reach.has(hex(payload.being))) {
      return this.#hush('out of reach', { being: payload.being });
    }

    if (!payload.method) {
      // Being, no method — the warden describes that one being.
      return this.#reply(payload, 'sketch', this.sketchOf(payload.being), random);
    }

    // The warden is a being, so its own fields are reached the ordinary way.
    if (same(payload.being, this.name.pk)) {
      return this.#own(payload, reach, stranger, random);
    }

    // The old door only points: it answers `moved` with the succession, asked
    // of the warden itself, and every other ask meets silence. An answer's
    // data is the field's declared answer type, and a succession is not that
    // type, so the succession cannot be put where the caller asked for
    // something else. A peer that never asks `moved` learns by news.
    if (this.gone.has(hex(payload.being))) {
      return this.#hush('moved', { being: payload.being, method: payload.method.name });
    }

    const where = { being: payload.being, method: payload.method.name };

    const being = this.beings.get(hex(payload.being));
    if (!being) return this.#hush('no such being', where);
    // The blueprint is the scope: a name it never declared is not reached for
    // on the object at all.
    if (!being.declares.has(payload.method.name)) return this.#hush('undeclared', where);
    if (typeof being.object[payload.method.name] !== 'function') {
      return this.#hush('unserved', where);
    }

    // The warden never looks inside a method's arguments. A being in the middle
    // of a chain does its own work before it answers, and reaching another
    // house is asynchronous on every ground, so the door waits for it: what
    // must be bytes or nothing is what the field settles on.
    let data;
    try {
      data = await being.invoke(payload.method.name, payload.method.args, {
        caller: { voice: payload.voice.slice(), kind: kind ?? 'stranger' },
        leash,
      });
    } catch (thrown) {
      // The fault the being itself caused, which is the one an answering layer
      // most wants back. Outward it is the same silence as every other.
      return this.#hush('threw', { ...where, thrown });
    }
    if (data !== undefined && data !== null && !(data instanceof Uint8Array)) {
      return this.#hush('not bytes', where);
    }

    // 8. Answer. Sealed to the return padlock the payload carried, signed by
    // the warden's own name, and naming the ask by its seq.
    return this.#answer(payload, data ?? null, random);
  }

  // The warden's own fields, served from the public being.
  async #own(payload, reach, stranger, random) {
    const name = payload.method.name;
    let args;
    try {
      args = argumentsOf(name, payload.method.args);
    } catch (thrown) {
      return this.#hush('arguments', { method: name, thrown });
    }

    switch (name) {
      case 'describe':
        return this.#reply(payload, 'describe', this.estate(reach), random);
      case 'limit':
        return this.#reply(payload, 'limit', this.limit, random);
      case 'sketch':
        // Silence and absence are two different answers. Asking about a being
        // outside your standing is silence — a door that answered "absent"
        // would be a door confirming the being exists.
        if (!reach.has(hex(args[0]))) return this.#hush('out of reach', { method: name });
        return this.#reply(payload, 'sketch', this.sketchOf(args[0]), random);
      case 'moved': {
        // Legal ask, legal answer: nothing has moved, so `moved` answers
        // absence. Outside the standing it is silence, exactly as for sketch.
        //
        // A being this door has moved on is reached by the succession it
        // published, and by nothing else — to a holder who reached it before,
        // never to a stranger. At the old door the standings still name the
        // being that left, so reaching the name asked about is the whole test.
        // At a destination they name it by the key this house minted, and the
        // name it wore before is in no standing here: reaching the successor
        // the published word names is what "reached it before" means there.
        // Neither door points for a voice that never reached the being — that
        // would be a door telling whoever holds anything here that this being
        // exists and where it went.
        const at = hex(args[0]);
        const word = this.gone.get(at) ?? null;
        const pointed = word?.successor ? reach.has(hex(word.successor)) : false;
        if (!reach.has(at) && !pointed) return this.#hush('out of reach', { method: name });
        return this.#reply(payload, 'moved', word, random);
      }
      case 'blueprint': {
        // Answered only if the asker already reaches a being of that class, or
        // the warden's own public being declares it. Otherwise silence: a door
        // that answered any digest put to it would be a door that could be
        // asked what it runs, and a probe with a guessed hash is still a probe.
        if (!this.texts.has(hex(args[0]))) return this.#hush('unknown blueprint', { method: name });
        const text = this.blueprintFor(reach, args[0]);
        if (!text) return this.#hush('undeclared blueprint', { method: name });
        return this.#reply(payload, 'blueprint', text, random);
      }
      case 'receive': {
        // An ordinary field spent by an ordinary standing — a voice the inbound
        // record already allows, granted in advance the way anything is —
        // because a door any stranger could push a being into is a door with no
        // gate. Refused, it is silence like everything else.
        if (stranger) return this.#hush('stranger', { method: name });
        const commitment = await this.#receive(args[0]);
        if (!commitment) return this.#hush('unexpected being', { method: name });
        return this.#reply(payload, 'receive', commitment, random);
      }
      // `tell` is news, and news is placed at step three; a caller holding an
      // ordinary standing cannot announce anything.
      default:
        return this.#hush('no such warden field', { method: name });
    }
  }

  #digestOf(beingHex) {
    if (beingHex === hex(this.name.pk)) return WARDEN_DIGEST;
    return this.beings.get(beingHex)?.digest ?? null;
  }

  #commitmentOf(beingHex) {
    if (beingHex === hex(this.name.pk)) return this.commitment;
    return this.beings.get(beingHex)?.commitment ?? null;
  }

  // The grouping is not a courtesy, it is the identity: two beings of one
  // class carry one digest, so a thousand lists cost one interface. Classes by
  // their digest bytes ascending, beings under each by their pk bytes
  // ascending — two wardens describing one estate produce one byte sequence.
  estate(reach) {
    const byDigest = new Map();
    for (const at of reach) {
      const digestOf = this.#digestOf(at);
      if (!digestOf) continue;
      const key = hex(digestOf);
      if (!byDigest.has(key)) byDigest.set(key, { digest: digestOf, beings: [] });
      byDigest.get(key).beings.push({
        being: at === hex(this.name.pk) ? this.name.pk : this.beings.get(at).pk,
        commitment: this.#commitmentOf(at),
      });
    }
    const classes = [...byDigest.values()].sort((a, b) => ascending(a.digest, b.digest));
    for (const one of classes) one.beings.sort((a, b) => ascending(a.being, b.being));
    return { classes };
  }

  // Its pk, the digest of its blueprint, and its heir commitment — which is
  // what lets the peer believe that being's succession when the news comes.
  // Never the being's state, because a describe is not a read.
  sketchOf(beingPk) {
    const digestOf = this.#digestOf(hex(beingPk));
    if (!digestOf) return null;
    return { being: beingPk, digest: digestOf, commitment: this.#commitmentOf(hex(beingPk)) };
  }

  // The blueprint rule, one place: the text is answered only if the asker
  // already reaches a being of that class, or the public being declares it.
  blueprintFor(reach, digestOf) {
    const at = hex(digestOf);
    const text = this.texts.get(at);
    if (!text) return null;
    const reached = [...reach].some(
      (being) => hex(this.#digestOf(being) ?? new Uint8Array(0)) === at,
    );
    return reached || this.declares.has(at) ? text : null;
  }

  // News: believed by a key the peer already holds, and there are only two.
  // `tell` answers nothing, so the answer carries no data.
  async #news(place, payload, random) {
    if (!payload.method || payload.method.name !== 'tell') return this.#hush('not news');
    let word;
    try {
      [word] = argumentsOf('tell', payload.method.args);
    } catch (thrown) {
      return this.#hush('arguments', { method: 'tell', thrown });
    }
    if (!(await this.#believe(place, payload, word))) return this.#hush('disbelieved');
    return this.#reply(payload, 'tell', null, random);
  }

  // A word met at the old door is the news's own bytes, so it is believed by
  // the steps news is believed by and rehouses the row exactly as the news
  // would have. What news proves with the envelope's signature this proves
  // with the commitment: only the house that committed can name a successor
  // hashing to the commitment the row already holds, and the answer that
  // carried the word was signed by the warden the row names. It answers the
  // name the being now wears, and null when nothing was believed — a word the
  // row's commitment does not cover and a word already believed both leave the
  // row exactly as it was.
  async believe(row, word) {
    if (!word?.being) return null;
    const ref = row.beings.get(hex(word.being));
    if (!ref) return null;
    if (!(await this.#believe({ row, ref }, { voice: word.successor }, word))) return null;
    await this.#persist();
    return ref.being;
  }

  // The case is read off which fields are present: a succession carries the
  // successor and the next commitment; a padlock replacement carries only the
  // padlock, because a lock has no heir.
  async #believe(place, payload, word) {
    const succession = key32(word.successor) && key32(word.commitment);
    const replacement = !word.successor && !word.commitment && key32(word.padlock);

    // The warden's own succession is said by `being` absent. A word naming the
    // far warden's own pk there is refused: its name and its public being are
    // one key, so that word would be a second spelling of the name's own
    // succession, and a value with two spellings is two identities.
    if (word.being && same(word.being, place.row.warden)) return false;

    if (word.being) {
      // A being's succession, believed against the commitment the peer took
      // from a describe. The successor signs and the peer hashes.
      if (!succession) return false;
      const ref = place.ref ?? place.row.beings.get(hex(word.being));
      if (!ref || !same(ref.being, word.being)) return false;
      if (!same(await commit(ref.warden, payload.voice), ref.commitment)) return false;
      if (!same(word.successor, payload.voice)) return false;
      place.row.beings.delete(hex(ref.being));
      ref.being = word.successor;
      ref.commitment = word.commitment;
      if (word.name) ref.warden = word.name;
      if (word.padlock) ref.padlock = word.padlock;
      if (word.hints.length > 0) ref.hints = word.hints;
      place.row.beings.set(hex(ref.being), ref);
      // Believed news rewrites the outbound row entire, because the relation
      // follows the being: a row half-rewritten is a standing at a house that
      // no longer answers for it.
      this.#rehouse(place.row, word);
      // A succession starts the news mark fresh, exactly as a standing's
      // rotation does: the old key died with its count, and what comes next is
      // believed by its commitment rather than its number.
      place.row.marks.fresh();
      return true;
    }

    const far = place.row;

    if (succession) {
      // The warden's own name. The peer holds the hash of the heir, so the
      // successor signs and the peer hashes.
      if (!same(await commit(far.warden, payload.voice), far.commitment)) return false;
      if (!same(word.successor, payload.voice)) return false;
      // Where it now answers, when it has changed: the name is the successor
      // itself, and a word that says otherwise is not this succession.
      if (word.name && !same(word.name, word.successor)) return false;
      this.#rehouse(far, { ...word, name: word.successor });
      // A name succession keeps the mark: the house persisted and only its key
      // changed, so numbers already spent stay spent — unlike a being's
      // succession, where the house itself changed.
      return true;
    }

    if (replacement) {
      // Nothing is succeeded at all, so the news is signed by the warden's
      // name, which has not moved and which the peer has held since the
      // invitation.
      if (!same(payload.voice, far.warden)) return false;
      // A padlock replacement is announced by a house that persists, so it
      // continues the mark it already keeps.
      this.#rehouse(far, word);
      return true;
    }

    return false;
  }

  // The row moved whole: the name it now answers by, the lock, the commitment
  // that lets the next succession be believed, and the roads.
  #rehouse(row, word) {
    if (word.name) row.warden = word.name;
    if (word.padlock) row.padlock = word.padlock;
    if (word.commitment) row.commitment = word.commitment;
    if (word.hints.length > 0) row.hints = word.hints;
  }

  // Take a being in: generate the key the origin never saw, and take the
  // cargo — cells, both records of standings and the replay window whole. Its answer is the
  // commitment of
  // that key, hashed under this door's own name: the one fact the origin must
  // carry into the first news and cannot invent.
  async #receive(cargo) {
    const armed = this.expected;
    if (!armed) return null;
    if (!same(await digest(parse(armed.blueprint)), cargo.digest)) return null;
    this.expected = null;

    const { being: pk } = await this.hold(armed.object, {
      seed: armed.seed,
      heirSeed: armed.heirSeed,
      blueprint: armed.blueprint,
      cells: armed.cells,
    });
    (armed.take ?? this.beings.get(hex(pk)).take)(cargo.cells);

    // The register of standings travels with the being, and the replay marks
    // with it, or every peer's spent numbers would come round again at the new
    // door.
    for (const one of cargo.standings) {
      this.inbound.set(
        hex(one.voice),
        new Standing({
          voice: one.voice,
          commitment: one.commitment,
          // The name each commitment was minted at travels with the row, so a
          // standing that arrives still rotates at the name it was granted
          // under rather than at this door's.
          name: one.name,
          // The name the destination minted, and that name alone. A name a
          // door must keep answering for is a name it can never stop
          // remembering, and the peer that is behind the news is not
          // stranded: the old door still answers `moved`.
          beings: [pk],
          mark: one.mark > 0n ? one.mark : null,
          // The replay record travels whole — the mark and the spent numbers
          // beneath it — or a caller's late-arriving in-window numbers would be
          // judged here by a window this door cannot see.
          spent: one.spent,
          // The way back travelled with the standing, so the destination can
          // speak first to a peer it has never been called by.
          padlock: one.padlock,
          hints: one.hints,
        }),
      );
    }

    // The outbound record travels too, and nobody is owed news about it: the
    // doors where the being holds a standing know only a voice and have never
    // heard of the being at all. A being that arrived without these would be
    // alive and mute.
    for (const one of cargo.relations) this.adopt(one, pk);

    // The second rotation: to a key the destination generated and the origin
    // never saw. The word is the old door's shape exactly, so a peer that
    // hears it and a peer that asks learn the identical thing.
    const word = {
      being: cargo.being,
      successor: pk,
      commitment: this.beings.get(hex(pk)).commitment,
      name: this.name.pk,
      padlock: this.padlock.pk,
      hints: this.hints,
    };
    this.gone.set(hex(cargo.being), word);
    this.arrived = { word, successor: pk, voices: cargo.standings.map((one) => one.voice) };
    // The key the origin never saw, hashed under this door's own name: what the
    // peer will hash the second news against, and what the origin carries into
    // the first as its next commitment.
    return commit(this.name.pk, pk);
  }

  // Arm the door for the being it is about to take in, and hand back the
  // commitment the origin needs for the first news — the hash of a key this
  // door generated, which tells the origin nothing about the key itself.
  async expect({ seed, heirSeed, object, blueprint, cells, take }) {
    this.expected = { seed, heirSeed, object, blueprint, cells, take };
    return commit(this.name.pk, (await signingPair(seed)).pk);
  }

  #reply(payload, field, value, random) {
    return this.#answer(payload, answerBytes(field, value), random);
  }

  async #answer(payload, data, random) {
    const bytes = tagged(
      ANSWER_BYTE,
      encode(ANSWER, { warden: this.name.pk, seq: payload.seq, data }, ANSWER_RECORDS),
    );
    // The answer is one sealed box like any other; only what rides in it
    // differs.
    return box(concat([bytes, await sign(bytes, this.name.secret)]), payload.padlock, random);
  }
}

// Read an answer at the caller's side: unbox with the padlock the ask named,
// read the record byte, which must say answer — the expected byte, checked and
// never merely read — and take the last sixty-four bytes as the signature.
//
// Two checks, and the law names both. The signature is verified against the
// `warden` the record itself carries; that this warden is the door the ask was
// sent to is the caller's separate judgment. Which ask it answers is the
// caller's own bookkeeping and lives where the asks await.
export async function readAnswer({ envelope, padlockSecret, wardenPk }) {
  const answer = await readAnswerBytes(envelope, padlockSecret);
  if (!answer) return null;
  return same(answer.warden, wardenPk) ? answer : null;
}

// The envelope's half alone: unsealed, read under the byte the caller expects,
// and verified against the `warden` the record itself carries. Which door was
// asked and which ask this answers are the caller's own two checks, and both
// need the caller's record — `Warden#hear` is where they are made.
async function readAnswerBytes(envelope, padlockSecret) {
  try {
    const { bytes, signature } = await unbox(envelope, padlockSecret);
    const answer = decodeAnswer(untag(ANSWER_BYTE, bytes));
    return (await verify(bytes, signature, answer.warden)) ? answer : null;
  } catch {
    return null;
  }
}

// One awaiting ask, as the key the record is a set of: the padlock the answer
// will be sealed to and the number the ask spent. The far warden is the row it
// hangs on, which is the third of the three.
export function awaits(padlockPk, seq) {
  return `${hex(padlockPk)}:${seq}`;
}

// The caller's side of the same codec: read one of the warden's own fields out
// of an answer's data, by the type the Warden blueprint declares for it.
export function readField(field, data) {
  const declared = wardenField(field);
  if (!declared?.answer || data === null) return null;
  return decode(declared.answer, data, WARDEN_RECORDS);
}

// The inverse of `readField`: a field's arguments in declared order,
// concatenated.
export function writeArgument(field, ...values) {
  const declared = wardenField(field);
  if (!declared) return new Uint8Array(0);
  return encodeAll(
    declared.args.map((arg) => arg.type),
    values,
    WARDEN_RECORDS,
  );
}
