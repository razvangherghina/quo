// The JS kit answering the subject contract, and nothing more. A subject is
// kit-specific glue: nine verbs over JSON lines, a warden stood up from handed
// keys, a door handed bytes, and the records read back as Article IX's `cargo`.
// Every other kit writes its own, and a stranger's is the only thing they must
// implement to be driven.
//
// What this file must never do is decide anything. It stands a warden, hands
// it what it is given, and reports what came back. The judgment is the kit's;
// the expectations are the scenario's; this is the wire between them.
//
// A subject is not a host, and it stands below that seam on purpose. Proving
// the kit from outside means composing what no application may: an ask naming
// neither being nor method, argument bytes deliberately malformed, an ask at a
// being whose blueprint it does not hold, the seq it spent read back directly.
// The host's surface refuses every one of those by design — a handle encodes
// through the blueprint, so it can never produce the malformed input a refusal
// is asserted with. So this file drives the warden's own entry point rather
// than the kit's host module, and the seam never grows a raw-ask surface to
// accommodate it: that would ship every application a public way around the
// blueprint, permanently, for the benefit of the harness.
import { Warden, current, depart, landed, news, signingPair } from '../src/index.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const un = (text) => Uint8Array.from(Buffer.from(text, 'hex'));

// The two Article II freedoms, handed in as queues. A finite list, drawn in
// order: the whole reason a scenario's bytes can be pinned at all. Drawing past
// the end is a fault the scenario must hear about rather than a silent refill,
// because a kit that drew more than it was given has told us something.
function queue(name, values) {
  let at = 0;
  return () => {
    if (at >= values.length) throw new Error(`the ${name} queue ran out after ${values.length}`);
    const one = values[at];
    at += 1;
    return one;
  };
}

let warden = null;
let clock = null;
let random = null;
// Every ask this warden composed while judging the message in hand. A door
// with no being that calls out leaves it empty, which is the same thing as
// nothing having been handed onward.
let onward = [];

// The one thing a being in this contract does. A warden never makes an onward
// ask of its own — it hands the leash to the being it routed to — so a being
// that calls out is the only way Article VIII's onward rules can be reached at
// all. It decides nothing: the scenario named the far warden, the being, the
// method and the ephemeral key, and what this returns is never asserted.
function being(one) {
  if (!one.onward) return {};
  const spec = one.onward;
  return {
    [spec.when]: async () => {
      const row = warden.outbound.find((at) => hex(at.warden) === spec.at);
      if (!row) throw new Error(`no relation at ${spec.at}`);
      // The leash the kit handed this call, spent as it was handed. Recomputing
      // it here would be the subject doing the arithmetic the case is about.
      const leash = current()?.leash ?? null;
      const composed = await warden.ask(row, {
        seq: BigInt(spec.seq),
        leash,
        being: spec.being ? un(spec.being) : null,
        method: spec.method ? { name: spec.method.name, args: un(spec.method.args ?? '') } : null,
        random: un(spec.ephemeral),
      });
      // A leash with nothing left to spend composes nothing, and the being
      // answers anyway: Article VIII has the onward ask withheld while "the
      // work already routed stands". A being that failed here would be turning
      // its own kit's refusal into the door's silence.
      if (composed) onward.push(composed);
      // What this being answers belongs to its blueprint and is asserted
      // nowhere: the scenario is about what went onward.
      return 0n;
    },
  };
}

// Article IX's own shape, read off the records. Not a format this harness
// invented: `cargo` is what a warden's state looks like when it crosses, which
// is the level a check has to work at, because five kits store differently and
// all five must be readable the same way.
function cargoOf(beingPk) {
  const being = warden.beings.get(hex(beingPk));
  if (!being) return null;
  const at = hex(beingPk);
  const standings = [];
  for (const row of warden.inbound.values()) {
    if (!row.beings.has(at)) continue;
    standings.push({
      voice: hex(row.voice),
      commitment: hex(row.commitment),
      // The name the commitment was minted under (Article XIV).
      name: hex(row.name),
      beings: [...row.beings].sort(),
      mark: (row.mark ?? 0n).toString(),
      spent: row.window().map((one) => one.toString()),
      padlock: row.padlock ? hex(row.padlock) : null,
      hints: row.hints ?? [],
    });
  }
  // Ordered so two readings of one state are one text. The law derives an
  // estate's order (Article X) and says nothing about a cargo's; this order is
  // the harness's, and it decides nothing about the protocol.
  standings.sort((a, b) => (a.voice < b.voice ? -1 : a.voice > b.voice ? 1 : 0));
  const relations = (warden.relationsOf ? warden.relationsOf(beingPk) : []).map((row) => ({
    warden: hex(row.warden),
    commitment: hex(row.commitment),
    padlock: hex(row.padlock),
    voice: hex(row.voice.pk),
    heir: hex(row.heir.pk),
    seq: (row.seq ?? 0n).toString(),
    // Two counters, never one field doing both (Article IX). The mark kept for
    // that far warden's news lives on the row's own marks, which is where the
    // kit's `pack` reads it from.
    news: (row.marks?.mark ?? 0n).toString(),
    hints: row.hints ?? [],
  }));
  return {
    being: hex(being.pk),
    digest: hex(being.digest),
    cells: hex(being.cells()),
    standings,
    relations,
  };
}

// One piece of news per peer, each with the key it seals with and the number it
// spends against that peer's own mark — both handed in, like every other draw.
// A peer that left no way back composes nothing, which the kit decides and this
// file only passes on.
async function told(word, voice, rows, spec) {
  const out = [];
  for (let at = 0; at < rows.length; at += 1) {
    const one = spec[at];
    if (!one) break;
    const sealed = news(warden, {
      peer: rows[at],
      voice,
      word,
      seq: BigInt(one.seq),
      allowance: { time: BigInt(one.allowance.time), hops: BigInt(one.allowance.hops) },
      random: un(one.ephemeral),
    });
    if (sealed) out.push(hex(await sealed));
  }
  return out;
}

const verbs = {
  // Stand a warden up from handed keys, hold the beings, write the standings,
  // and take the two queues. Everything after this is deterministic.
  async stand(order) {
    warden = await Warden.open({
      nameSeed: un(order.warden.nameSeed),
      padlockSeed: un(order.warden.padlockSeed),
      heirSeed: un(order.warden.heirSeed),
      limit: BigInt(order.warden.limit ?? 0),
      hints: order.warden.hints ?? [],
      // The two Article II freedoms, handed to the warden at the moment it
      // opens: it draws from the scenario's queues and never reaches for
      // either.
      clock: () => clock(),
      random: () => random(),
    });
    const beings = [];
    for (const one of order.beings ?? []) {
      const { being: pk } = await warden.hold(being(one), {
        seed: un(one.seed),
        heirSeed: un(one.heirSeed),
        blueprint: one.blueprint,
        cells: () => un(one.cells ?? ''),
      });
      beings.push(hex(pk));
    }
    const grants = [];
    for (const one of order.grants ?? []) {
      const invitation = await warden.grant(un(one.being), {
        voiceSeed: un(one.voiceSeed),
        heirSeed: un(one.heirSeed),
        padlock: one.padlock ? un(one.padlock) : null,
        hints: one.hints ?? [],
      });
      grants.push({
        warden: hex(invitation.warden),
        commitment: hex(invitation.commitment),
        padlock: hex(invitation.padlock),
        heir: hex(invitation.heirPublic),
      });
    }
    // The outbound rows: invitations this ground holds at other houses, each
    // held by the being that may spend it.
    for (const one of order.relations ?? []) {
      const voice = await signingPair(un(one.voiceSeed));
      const heir = await signingPair(un(one.heirSeed));
      warden.remember(
        {
          warden: un(one.warden),
          commitment: un(one.commitment),
          padlock: un(one.padlock),
          heirPublic: heir.pk,
          heirSecret: heir.secret,
          hints: one.hints ?? [],
        },
        {
          voicePk: voice.pk,
          voiceSecret: voice.secret,
          being: one.being ? un(one.being) : null,
        },
      );
    }
    // The being this door is about to take in. Article IX's `receive` arrives
    // as an ordinary ask, so nothing else is needed to drive it — but a door
    // that had not been told is a door any holder could push a being into.
    if (order.expecting) {
      await warden.expect({
        seed: un(order.expecting.seed),
        heirSeed: un(order.expecting.heirSeed),
        object: {},
        blueprint: order.expecting.blueprint,
        cells: () => un(order.expecting.cells ?? ''),
      });
    }
    // The beings that have gone, and the succession this door published for
    // each. An absent field of the `word` stays absent.
    for (const one of order.moved ?? []) {
      const word = one.word ?? {};
      const key = (name) => (word[name] ? un(word[name]) : null);
      warden.point(un(one.being), {
        being: key('being'),
        successor: key('successor'),
        commitment: key('commitment'),
        name: key('name'),
        padlock: key('padlock'),
        hints: word.hints ?? [],
      });
    }
    clock = queue(
      'clock',
      (order.clock ?? []).map((one) => BigInt(one)),
    );
    random = queue(
      'random',
      (order.random ?? []).map((one) => un(one)),
    );
    return {
      warden: { name: hex(warden.name.pk), padlock: hex(warden.padlock.pk) },
      beings,
      grants,
    };
  },

  // The door. Bytes in, bytes out, or nothing — and nothing is silence.
  async door(order) {
    // One draw per message, taken before the door is handed anything and spent
    // only if the judgment reaches step 8. This kit takes the draw as a value
    // and the clock as a function; another takes both at once. Both are
    // conforming, and it is exactly why no scenario asserts how far a queue was
    // drawn down.
    onward = [];
    const answer = await warden.judge(un(order.bytes), { clock, random: random() });
    return {
      answer: answer ? hex(answer) : null,
      onward: onward.map(hex),
    };
  },

  // The caller's half: one ask composed down an outbound row. `null` bytes are
  // a refusal to send, which Article III makes an ordinary outcome — the ask
  // never reaches the road — and never an error.
  async send(order) {
    const ask = order.ask;
    const row = warden.outbound.find((one) => hex(one.warden) === ask.at);
    if (!row) return { error: `no relation at ${ask.at}` };
    const bytes = await warden.ask(row, {
      seq: BigInt(ask.seq),
      commitment: ask.commitment ? un(ask.commitment) : null,
      allowance: { time: BigInt(ask.allowance.time), hops: BigInt(ask.allowance.hops) },
      being: ask.being ? un(ask.being) : null,
      method: ask.method ? { name: ask.method.name, args: un(ask.method.args ?? '') } : null,
      random: random(),
    });
    return { bytes: bytes ? hex(bytes) : null };
  },

  // And the caller's other half: one answer judged at this end. `null` is the
  // whole of what any failed check looks like, and the kit is asked which
  // warden the ask went to rather than reading it off the record it is judging.
  async read(order) {
    // The kit's own caller surface, which makes all four of Article XII's
    // checks: the two the envelope carries, that the warden is one this ground
    // holds a relation with, and that an ask is awaiting under that padlock,
    // that warden and that seq. `at` is not handed to it — this kit satisfies
    // the warden check from its own record, which is the stronger form.
    const answer = await warden.hear(un(order.answer));
    if (!answer) return { answer: null };
    return {
      answer: {
        warden: hex(answer.warden),
        seq: (answer.seq ?? 0n).toString(),
        data: answer.data === null || answer.data === undefined ? null : hex(answer.data),
      },
    };
  },

  // The records, as `cargo`, and the facts this kit cannot report at all.
  // The house changing its own mind about a standing. Nothing crosses, nothing
  // is spent, and this kit spells it as one call where another may spell it as
  // two — the contract fixes the effect and not the spelling.
  amend(order) {
    warden.amend(un(order.voice), {
      add: (order.add ?? []).map(un),
      remove: (order.remove ?? []).map(un),
    });
    return {};
  },

  // The house moving its own name. Like an amend it crosses no wire, and like
  // an amend the whole of what it claims is in the record afterwards and in
  // what the door answers to next. This kit takes the next heir as a seed; a
  // kit that never sees that key takes the commitment instead.
  //
  // A key this door never committed to comes back null here, and that is an
  // error rather than nothing: a scenario that believed it had succeeded a
  // door and had not would assert every exchange after it against a door that
  // never moved.
  async succeed(order) {
    const moved = await warden.succeed({
      nameSeed: un(order.nameSeed),
      heirSeed: un(order.heirSeed),
    });
    if (!moved) throw new Error('that key is not the heir this door committed to');
    return {};
  },

  // The origin's half of a migration's news. This kit holds the being's heir
  // itself, so the handed-in seed is ignored; a kit that does not hold it takes
  // that seed instead, and both name one key.
  //
  // The word is the kit's — `depart` composes it — and this file only says
  // which being left and where it went. A subject that built the word and asked
  // the kit to seal it would assert nothing about the warden.
  async depart(order) {
    const gone = depart(warden, un(order.being), {
      commitment: un(order.commitment),
      name: un(order.gone.name),
      padlock: un(order.gone.padlock),
      hints: order.gone.hints ?? [],
    });
    if (!gone) throw new Error('no being of that name');
    return { news: await told(gone.word, gone.voice, gone.peers, order.news ?? []) };
  },

  // The destination's half, after a cargo has arrived. It needs nothing but the
  // roads this door answers on — and this kit fixed those at `stand`, so even
  // those it takes from its own record.
  async landed(order) {
    const here = landed(warden);
    if (!here) throw new Error('nothing has arrived at this door');
    return { news: await told(here.word, here.voice, here.peers, order.news ?? []) };
  },

  // Declared rather than left to be inferred from a null, because a null value
  // and an unanswerable question are different things and only the subject
  // knows which is which. This kit now reports every Article IX field, so the
  // list is empty.
  state(order) {
    return { cargo: cargoOf(un(order.being)), cannot: [] };
  },
};

export async function obey(order) {
  const verb = verbs[order.do];
  if (!verb) return { error: `no such verb: ${order.do}` };
  try {
    return await verb(order);
  } catch (thrown) {
    return { error: String(thrown && thrown.message ? thrown.message : thrown) };
  }
}

// Spawned as a process, the contract is JSON lines on stdin and stdout. Driven
// in-process, `obey` is the same contract without the pipe.
if (process.argv[1] && process.argv[1].endsWith('conformance.js')) {
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const out = await obey(JSON.parse(line));
      process.stdout.write(`${JSON.stringify(out)}\n`);
    }
  });
}
