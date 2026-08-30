// The warden: a door, ordinary pointers to the beings it keeps, two records,
// and the seven steps it judges every arriving message by. Every failure is
// the same failure — the door answers with silence and never says which step
// it was — so nothing in here throws outward and nothing narrates.
import { parse, print, digest } from './notation.js';
import { encode, decode, decodeAll, encodeAll, recordsOf } from './wire.js';
import { box, concat, open, seal, unbox } from './envelope.js';
import { commitment as commit, sealingPair, sign, signingPair, verify } from './arithmetic.js';
import { hex } from './bytes.js';

const same = (a, b) => a instanceof Uint8Array && b instanceof Uint8Array && hex(a) === hex(b);
const key32 = (value) => value instanceof Uint8Array && value.length === 32;

// The order is derived, never chosen: bytes ascending, so two wardens
// describing one estate produce one byte sequence.
function ascending(a, b) {
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

class Standing extends Marks {
  constructor({ voice, commitment, beings, padlock, hints, mark = null, spent = [] }) {
    super();
    this.voice = voice;
    this.commitment = commitment;
    this.beings = new Set(beings.map(hex));
    this.padlock = padlock ?? null;
    this.hints = hints ?? [];
    this.mark = mark;
    this.spent = new Set(spent);
  }

  // A rotation starts the mark fresh, because the old key is dead and the new
  // holder never saw the numbers it counted.
  rotate(voice, commitment) {
    this.voice = voice;
    this.commitment = commitment;
    this.fresh();
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
    warden.name = await signingPair(options.nameSeed);
    warden.padlock = await sealingPair(options.padlockSeed);
    warden.heir = await signingPair(options.heirSeed);
    // For a warden's own name the heir would spend at itself.
    warden.commitment = await commit(warden.name.pk, warden.heir.pk);
    for (const text of options.declares ?? []) warden.declares.add(hex(await warden.#learn(text)));
    return warden;
  }

  constructor({ hints = [], limit = 0n } = {}) {
    this.hints = hints;
    this.limit = limit;
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
  }

  // Content-addressed text cannot be swapped for something friendlier by
  // whoever carried it, so what the door keeps is the canonical text itself.
  async #learn(blueprint) {
    const parsed = parse(blueprint);
    const text = print(parsed);
    const at = await digest(parsed);
    this.texts.set(hex(at), text);
    return at;
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
  async hold(object, { seed, heirSeed, blueprint, cells }) {
    const keys = await signingPair(seed);
    const heir = await signingPair(heirSeed ?? seed);
    this.beings.set(hex(keys.pk), {
      pk: keys.pk,
      secret: keys.secret,
      heir,
      commitment: await commit(this.name.pk, heir.pk),
      object,
      cells: cells ?? (() => new Uint8Array(0)),
      digest: await this.#learn(blueprint),
    });
    return keys.pk;
  }

  // Release a being: drop the pointer, and its standings go with it.
  release(beingPk) {
    const at = hex(beingPk);
    if (!this.beings.delete(at)) return false;
    for (const [voice, row] of this.inbound) {
      row.beings.delete(at);
      if (row.beings.size === 0) this.inbound.delete(voice);
    }
    return true;
  }

  // The old door only points: it keeps the succession it published and answers
  // every arriving ask with it instead of doing the work.
  point(beingPk, word) {
    this.gone.set(hex(beingPk), word);
    return true;
  }

  // Grant: mint a voice, write the inbound row, hand out the invitation. The
  // holder's heir is committed with this door's name inside the hash, so a
  // commitment is valid only at the door it was minted for.
  async grant(beingPk, { voiceSeed, heirSeed, padlock, hints }) {
    if (!this.beings.has(hex(beingPk))) return null;
    const voice = await signingPair(voiceSeed);
    const heir = await signingPair(heirSeed);
    this.inbound.set(
      hex(voice.pk),
      new Standing({
        voice: voice.pk,
        commitment: await commit(this.name.pk, heir.pk),
        beings: [beingPk],
        padlock: padlock ?? null,
        hints: hints ?? [],
      }),
    );
    // What a holder holds is five things.
    return {
      warden: this.name.pk,
      commitment: this.commitment,
      padlock: this.padlock.pk,
      heirPublic: heir.pk,
      heirSecret: heir.secret,
      hints: this.hints,
    };
  }

  // A standing is amended, not replaced: the warden adds a being to the list
  // or takes one away. Taking the last being away is release, and there is no
  // separate act for it.
  amend(voicePk, { add = [], remove = [] } = {}) {
    const row = this.inbound.get(hex(voicePk));
    if (!row) return false;
    for (const being of add) if (this.beings.has(hex(being))) row.beings.add(hex(being));
    for (const being of remove) row.beings.delete(hex(being));
    if (row.beings.size === 0) this.inbound.delete(hex(voicePk));
    return true;
  }

  standing(voicePk) {
    return this.inbound.get(hex(voicePk)) ?? null;
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
      heir: { pk: invitation.heirPublic, secret: invitation.heirSecret },
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
      marks: new Marks(),
      being: beingPk,
      seq: relation.seq,
      beings: new Map(),
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
  forget(beingPk) {
    this.outbound = this.outbound.filter((row) => !(row.being && same(row.being, beingPk)));
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

  reference(beingPk) {
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
    being,
    method,
    random,
  }) {
    // An ask that could not be judged is not made: a hop count below zero or a
    // budget at or below zero is what the far door would meet with silence, so
    // the near door never spends the number on it.
    if (allowance.hops < 0n || allowance.time <= 0n) return null;
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
    { seq, commitment = null, allowance = { time: 5_000n, hops: 8n }, being, method, random },
  ) {
    // The count kept against that far door, so it travels with the relation
    // and the being does not repeat a number after it moves.
    if (typeof seq === 'bigint' && seq > row.seq) row.seq = seq;
    return this.carry({
      recipient: row.warden,
      padlock: row.padlock,
      voiceSecret: row.voice.secret,
      voicePk: row.voice.pk,
      commitment,
      seq,
      allowance,
      being,
      method,
      random,
    });
  }

  // The judgment, in order. Every failure is the same failure: silence, which
  // here is `null`, and the door never says which step it was.
  async judge(envelope, { clock, random }) {
    try {
      return await this.#judge(envelope, clock, random);
    } catch {
      // The warden is the global try/catch, and it never throws.
      return null;
    }
  }

  async #judge(envelope, clock, random) {
    // 1. Unseal with the warden's own secret.
    const { payload, bytes, signature } = await open({
      envelope,
      padlockSecret: this.padlock.secret,
    });
    const arrived = clock();

    // 2. Verify the signature over the payload, using the voice it carries.
    if (!(await verify(bytes, signature, payload.voice))) return null;

    // The recipient is named inside, by whichever key the sender holds: the
    // warden's name when it has one, otherwise the padlock it sealed to — a
    // padlock is per door, so the binding job is done either way, and a door
    // that never named its house can still be spoken to first. A message
    // presented at any other door is silence.
    if (!same(payload.recipient, this.name.pk) && !same(payload.recipient, this.padlock.pk)) {
      return null;
    }

    // 3. Place the voice, in the two records and in that order.
    let row = this.inbound.get(hex(payload.voice));
    if (!row) {
      const asHeir = hex(await commit(this.name.pk, payload.voice));
      for (const [at, candidate] of this.inbound) {
        if (hex(candidate.commitment) !== asHeir) continue;
        // A rotation carrying no fresh commitment is a standing that could be
        // taken over once and never again.
        if (!payload.commitment) return null;
        this.inbound.delete(at);
        candidate.rotate(payload.voice, payload.commitment);
        this.inbound.set(hex(payload.voice), candidate);
        row = candidate;
        break;
      }
    }

    // Found in the outbound record → news, judged as its own section says.
    const place = row ? null : await this.#place(payload.voice);
    // Nowhere → the stranger's case, which is a standing at nothing.
    const stranger = !row && !place;

    if (row) {
      // The way back is refreshed by every call that arrives.
      row.padlock = payload.padlock;
      row.hints = payload.hints;
    }

    // 4. Spend the seq. News is counted too, against the mark kept for that
    // far warden. A stranger spends nothing: it has no row, so no mark is kept
    // for it and its numbers are not counted — a door keeping a mark per
    // stranger would be a door with unbounded memory.
    const marks = row ?? place?.row.marks ?? null;
    if (marks && !marks.spend(payload.seq)) return null;

    // 5. Spend the leash, judged on what arrived: a budget at or below zero, or
    // a hop count below zero, is silence. A hop count of zero is a legal leash
    // for a call that goes no further — what it forbids is onward.
    const { time, hops } = payload.allowance;
    if (hops < 0n || time <= 0n) return null;

    // Whatever this call reaches onward carries less than it received: the hop
    // count falls by one, and the time budget by this door's own dwell. Where
    // either would fall below what a leash may be, the onward ask is refused at
    // the moment of carrying and the work already routed stands.
    const onward = () => ({ time: time - BigInt(clock() - arrived), hops: hops - 1n });

    // 6. Route — being and method, being alone, neither, a method with no being
    // reaching the warden's own being, or the stranger's case; and for a voice
    // placed in the outbound record, news.
    if (place) return this.#news(place, payload, random);

    const reach = stranger
      ? new Set([hex(this.name.pk)])
      : new Set([...row.beings, hex(this.name.pk)]);

    if (!payload.being && !payload.method) {
      // Neither — the warden describes the estate, and the estate means what
      // that voice may reach. A stranger gets a house with one room in it.
      return this.#reply(payload, 'describe', this.#estate(reach), random);
    }
    // Method, no being — the warden's own being answers. Addressing the door
    // alone is how you speak to the ground's own affairs, so a caller reaching
    // `limit` or `blueprint` need not pay a describe first to learn the name of
    // the being it is already talking to.
    if (!payload.being) return this.#own(payload, reach, stranger, random);
    if (!reach.has(hex(payload.being))) return null;

    if (!payload.method) {
      // Being, no method — the warden describes that one being.
      return this.#reply(payload, 'sketch', this.#sketch(payload.being), random);
    }

    // The warden is a being, so its own fields are reached the ordinary way.
    if (same(payload.being, this.name.pk)) {
      return this.#own(payload, reach, stranger, random);
    }

    // The old door only points: it never forwards a call and never acts on the
    // being's behalf again.
    const word = this.gone.get(hex(payload.being));
    if (word) return this.#reply(payload, 'moved', word, random);

    const being = this.beings.get(hex(payload.being));
    if (!being) return null;
    const field = being.object[payload.method.name];
    if (typeof field !== 'function') return null;

    // The warden never looks inside a method's arguments. A being in the middle
    // of a chain does its own work before it answers, and reaching another
    // house is asynchronous on every ground, so the door waits for it: what
    // must be bytes or nothing is what the field settles on.
    const data = await field.call(being.object, payload.method.args, onward());
    if (data !== undefined && !(data instanceof Uint8Array)) return null;

    // 7. Answer. Sealed to the return padlock the payload carried, signed by
    // the warden's own name, and naming the ask by its seq.
    return this.#answer(payload, data ?? null, random);
  }

  // The warden's own fields, served from the public being.
  async #own(payload, reach, stranger, random) {
    const name = payload.method.name;
    let args;
    try {
      args = argumentsOf(name, payload.method.args);
    } catch {
      return null;
    }

    switch (name) {
      case 'describe':
        return this.#reply(payload, 'describe', this.#estate(reach), random);
      case 'limit':
        return this.#reply(payload, 'limit', this.limit, random);
      case 'sketch':
        // Silence and absence are two different answers. Asking about a being
        // outside your standing is silence — a door that answered "absent"
        // would be a door confirming the being exists.
        if (!reach.has(hex(args[0]))) return null;
        return this.#reply(payload, 'sketch', this.#sketch(args[0]), random);
      case 'moved':
        // Legal ask, legal answer: nothing has moved, so `moved` answers
        // absence. Outside the standing it is silence, exactly as for sketch.
        if (!reach.has(hex(args[0]))) return null;
        return this.#reply(payload, 'moved', this.gone.get(hex(args[0])) ?? null, random);
      case 'blueprint': {
        // Answered only if the asker already reaches a being of that class, or
        // the warden's own public being declares it. Otherwise silence: a door
        // that answered any digest put to it would be a door that could be
        // asked what it runs, and a probe with a guessed hash is still a probe.
        const at = hex(args[0]);
        const text = this.texts.get(at);
        if (!text) return null;
        const reached = [...reach].some(
          (being) => hex(this.#digestOf(being) ?? new Uint8Array(0)) === at,
        );
        if (!reached && !this.declares.has(at)) return null;
        return this.#reply(payload, 'blueprint', text, random);
      }
      case 'receive': {
        // An ordinary field spent by an ordinary standing — a voice the inbound
        // record already allows, granted in advance the way anything is —
        // because a door any stranger could push a being into is a door with no
        // gate. Refused, it is silence like everything else.
        if (stranger) return null;
        const commitment = await this.#receive(args[0]);
        if (!commitment) return null;
        return this.#reply(payload, 'receive', commitment, random);
      }
      // `tell` is news, and news is placed at step three; a caller holding an
      // ordinary standing cannot announce anything.
      default:
        return null;
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
  #estate(reach) {
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
  #sketch(beingPk) {
    const digestOf = this.#digestOf(hex(beingPk));
    if (!digestOf) return null;
    return { being: beingPk, digest: digestOf, commitment: this.#commitmentOf(hex(beingPk)) };
  }

  // News: believed by a key the peer already holds, and there are only two.
  // `tell` answers nothing, so the answer carries no data.
  async #news(place, payload, random) {
    if (!payload.method || payload.method.name !== 'tell') return null;
    let word;
    try {
      [word] = argumentsOf('tell', payload.method.args);
    } catch {
      return null;
    }
    if (!(await this.#believe(place, payload, word))) return null;
    return this.#reply(payload, 'tell', null, random);
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

    const pk = await this.hold(armed.object, {
      seed: armed.seed,
      heirSeed: armed.heirSeed,
      blueprint: armed.blueprint,
      cells: armed.cells,
    });
    armed.take?.(cargo.cells);

    // The register of standings travels with the being, and the replay marks
    // with it, or every peer's spent numbers would come round again at the new
    // door. The arriving pk stays in the row beside the new one, so a peer
    // still holding the old name reaches the door and is pointed onward.
    for (const one of cargo.standings) {
      this.inbound.set(
        hex(one.voice),
        new Standing({
          voice: one.voice,
          commitment: one.commitment,
          beings: [...one.beings, pk],
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
    const bytes = encode(ANSWER, { warden: this.name.pk, seq: payload.seq, data }, ANSWER_RECORDS);
    // The answer is one sealed box like any other; only what rides in it
    // differs.
    return box(concat([bytes, await sign(bytes, this.name.secret)]), payload.padlock, random);
  }
}

// Read an answer at the caller's side: unbox, take the last sixty-four bytes
// as the warden's signature, and believe it only from the name it names —
// because the caller must know that the door it asked is the door that spoke.
export async function readAnswer({ envelope, padlockSecret, wardenPk }) {
  try {
    const { bytes, signature } = await unbox(envelope, padlockSecret);
    if (!(await verify(bytes, signature, wardenPk))) return null;
    const answer = decodeAnswer(bytes);
    return same(answer.warden, wardenPk) ? answer : null;
  } catch {
    return null;
  }
}

// The caller's side of the same codec: read one of the warden's own fields out
// of an answer's data, by the type the Warden blueprint declares for it.
export function readField(field, data) {
  const declared = wardenField(field);
  if (!declared?.answer || data === null) return null;
  return decode(declared.answer, data, WARDEN_RECORDS);
}

// And its inverse: a field's arguments in declared order, concatenated.
export function writeArgument(field, ...values) {
  const declared = wardenField(field);
  if (!declared) return new Uint8Array(0);
  return encodeAll(
    declared.args.map((arg) => arg.type),
    values,
    WARDEN_RECORDS,
  );
}
