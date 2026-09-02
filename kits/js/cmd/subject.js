// The JS kit as a subject another kit can knock on, and knock with. A ground
// standing in a container is reached only across a socket, so every kit carries
// the same command shape and this is JS's.
//
// A subject is not a host, and it stands below that seam on purpose. It exists
// to prove the kit from outside, which means composing what no application may:
// an ask naming neither being nor method, argument bytes deliberately malformed,
// an ask at a being whose blueprint it does not hold, the seq it spent read back
// directly. Every one of those is a thing the host's surface refuses by design —
// a handle encodes through the blueprint, so it can never produce the malformed
// input a refusal is asserted with. So this file drives the warden's own entry
// point, the way a wire suite hand-writes bytes, and does not use `host.js`.
// The seam never grows a raw-ask surface to accommodate a subject: that would
// ship every application a public way around the blueprint, permanently, for
// the benefit of the harness.
//
// The contract is the one every kit is written against: two modes, `serve` and
// `speak`; one facts line on startup carrying `quo`, `role`, the five keys and
// the roads; `-line` to
// swap the carriage without changing anything above it; `-blueprint` to ask the
// far warden for the text behind every digest a describe named; `-hold` to hold
// a being of this ground's own down a line it dialled.
//
// Two things beyond that contract, because a ground that only answers can
// prove neither of them.
//
// `serve -line -push` is the far half of `-hold`: the listening ground asks
// down a connection it never opened. It cannot know the standing the dialling
// ground granted it — that never travels on the wire — so it is handed one per
// line on stdin, and every line it is handed is spent on the line most recently
// accepted.
//
// `serve -relay <facts>` makes this ground the middle of a chain: it holds a
// `Brief` of its own whose one field is answered by reaching a third house,
// under the leash it was handed rather than under one of its own. That is
// Article VII's "each hop acts as itself", and it needs a being that does its
// work by asking somebody else.
//
// Nothing here is a stand-in. It is the kit itself standing a warden, a being
// and a door, and reading what comes back with the kit's own eyes.
import { webcrypto } from 'node:crypto';
import {
  WARDEN_DIGEST,
  Warden,
  commitment,
  current,
  decode,
  parse,
  reach,
  readAnswer,
  readField,
  recordsOf,
  signingPair,
  writeArgument,
} from '../src/index.js';
import { serve as hangDoor } from '../src/door.js';
import { dial, listen } from '../src/line.js';

// The class this subject holds, written the same in every kit so each hashes
// its own copy and the digests must agree.
const COUNTER = `Counter
  bump(by int) int
  count() int
`;
const RECORDS = recordsOf(parse(COUNTER));
const FIELDS = parse(COUNTER).fields;
const fieldOf = (name) => FIELDS.find((one) => one.name === name);

// What a relaying ground puts in front of whoever it answers to, and the whole
// of it: one field, answering a number it does not itself hold. There is no way
// to write to the far house through it.
const BRIEF = `Brief
  filed() int
`;
const LIMIT = 1_048_576n;
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const un = (text) => Uint8Array.from(Buffer.from(text, 'hex'));
const draw = () => webcrypto.getRandomValues(new Uint8Array(32));

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(error) {
  process.stderr.write(`subject: ${error && error.stack ? error.stack : error}\n`);
  process.exit(1);
}

// The flags a Go `flag.FlagSet` takes: `-name value`, `-name=value`, and bare
// booleans. Written here rather than reached for, the way the kit itself takes
// nothing.
function flags(args, booleans) {
  const out = {};
  const rest = [];
  for (let at = 0; at < args.length; at += 1) {
    const one = args[at];
    if (!one.startsWith('-')) {
      rest.push(one);
      continue;
    }
    const name = one.replace(/^--?/, '');
    const split = name.indexOf('=');
    if (split !== -1) {
      out[name.slice(0, split)] = name.slice(split + 1);
    } else if (booleans.includes(name)) {
      out[name] = true;
    } else {
      at += 1;
      out[name] = args[at];
    }
  }
  return { flags: out, rest };
}

function where(listen) {
  const said = listen ?? '127.0.0.1:0';
  const at = said.lastIndexOf(':');
  return { host: said.slice(0, at), port: Number(said.slice(at + 1)) };
}

// Every whole line that arrives on stdin, handed on as it arrives. A ground
// that pushes is told the standing it was granted this way, because a standing
// granted back down a line never travels on the wire.
function lines(each) {
  let rest = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    rest += chunk;
    const parts = rest.split('\n');
    rest = parts.pop();
    for (const one of parts) if (one.trim() !== '') each(JSON.parse(one));
  });
}

// The five things a holder holds, read off a facts line or off a standing line.
function invitation(said, hints) {
  return {
    warden: un(said.warden),
    commitment: un(said.commitment),
    padlock: un(said.padlock),
    heirPublic: un(said.heir),
    heirSecret: un(said.heirSecret),
    hints,
  };
}

// The object behind the being. Both fields ride as one `int`, so a kit in any
// language calls them without a codec of its own.
function counter() {
  return {
    total: 0n,
    bump(by) {
      this.total += by;
      return this.total;
    },
    count() {
      return this.total;
    },
  };
}

let grain = 100;
const random = () => new Uint8Array(32).fill((grain += 7) % 251);
const clock = () => Date.now();

function stand() {
  return Warden.open({
    nameSeed: draw(),
    padlockSeed: draw(),
    heirSeed: draw(),
    limit: LIMIT,
    clock,
    random,
  });
}

// One exchange over whichever road was handed in: compose the ask, put it down
// the road, and read what the record settles on. A road that answers in its
// response hands the bytes straight back and they go to this ground's own
// door; a road that answers by a frame of its own says only that it carried,
// and the record waits. A `null` is silence, which is a ground speaking and
// never an error, and it is reported where it happened.
function conversation(ground, row, send) {
  let seq = 0n;
  return async (name, over) => {
    seq += 1n;
    const spent = seq;
    const envelope = await ground.ask(row, { seq: spent, random: draw(), ...over });
    const waiting = ground.pending(row, spent, 10_000n);
    const back = envelope === null ? null : await send(envelope, spent);
    if (back === null || back === undefined) ground.forgo(row, spent);
    else if (back !== true) await ground.arrive(back);
    const answer = await waiting;
    if (!answer) {
      emit({ quo: 1, step: name, seq: Number(spent), silence: true });
      return null;
    }
    if (answer.seq !== spent) throw new Error(`the answer names ask ${answer.seq}, not ${spent}`);
    return { seq: spent, warden: hex(answer.warden ?? row.warden), answer };
  };
}

// The first act at any door, over any road: whoever minted a voice has seen its
// keys, so a holder rotates to a key nobody else has ever seen and reads back
// the estate it now stands at.
async function opening(row, exchange) {
  const next = await signingPair(draw());
  const rotated = await exchange('describe', {
    commitment: await commitment(row.warden, next.pk),
  });
  if (!rotated) return null;
  const estate = readField('describe', rotated.answer.data);
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  row.heir = next;
  emit({
    quo: 1,
    step: 'describe',
    seq: Number(rotated.seq),
    warden: rotated.warden,
    classes: estate.classes.map((one) => ({
      digest: hex(one.digest),
      beings: one.beings.map((held) => hex(held.being)),
    })),
  });
  return estate;
}

// The text behind every digest the describe named. `blueprint` is a field on
// the far door's own public being, whose pk is that warden's name — reached by
// naming it, like every other field on every other being.
async function blueprints(row, estate, exchange) {
  for (const one of estate.classes) {
    const step = await exchange('blueprint', {
      being: row.warden,
      method: { name: 'blueprint', args: writeArgument('blueprint', one.digest) },
    });
    if (!step) continue;
    emit({
      quo: 1,
      step: 'blueprint',
      seq: Number(step.seq),
      warden: step.warden,
      digest: hex(one.digest),
      text: readField('blueprint', step.answer.data),
    });
  }
}

// The one ask this command was asked to make: a field on a being it names, or
// on none.
async function invoke(row, estate, exchange, on) {
  const asked = await exchange('ask', {
    being: named(on.being, estate, row),
    method: { name: on.method, args: on.args ? un(on.args) : new Uint8Array(0) },
  });
  if (!asked) return;
  emit({
    quo: 1,
    step: 'ask',
    seq: Number(asked.seq),
    warden: asked.warden,
    data: hex(asked.answer.data ?? new Uint8Array(0)),
  });
}

async function serve(args) {
  const { flags: on } = flags(args, ['line', 'push']);
  const { host, port } = where(on.listen);
  const warden = await stand();
  // The facts line is the first line this command writes, whatever else it did
  // to get there: a relay has already spoken to a third house before it is
  // ready to be spoken to, and what it found waits behind the facts.
  let found = null;
  const being = on.relay
    ? await relay(warden, on.relay, on.args, (one) => (found = one))
    : await counterBeing(warden);
  // A ground that pushes is handed each line it accepts, because the standing
  // it will spend down one arrives later and by another road entirely.
  const accepted = [];
  const waiting = [];
  const standing = on.line
    ? await listen(warden, {
        clock,
        random,
        host,
        port,
        limit: LIMIT,
        accepted: (line) => {
          accepted.push(line);
          for (const settle of waiting.splice(0)) settle(line);
        },
      })
    : await hangDoor(warden, { host, port, limit: LIMIT });
  const invited = await warden.grant(being, { voiceSeed: draw(), heirSeed: draw() });
  emit({
    quo: 1,
    role: 'door',
    warden: hex(invited.warden),
    commitment: hex(invited.commitment),
    padlock: hex(invited.padlock),
    heir: hex(invited.heirPublic),
    heirSecret: hex(invited.heirSecret),
    hints: invited.hints,
  });
  if (found) emit(found);
  if (on.push) {
    if (!on.line) throw new Error('a push can only ride a line');
    const line = () =>
      accepted.length > 0
        ? Promise.resolve(accepted[accepted.length - 1])
        : new Promise((settle) => waiting.push(settle));
    lines((said) => push(warden, said, line, on).catch(fail));
  }
  // The door serves itself; the driver stops this process when it has seen
  // enough, exactly as it stops every other kit's subject.
  await new Promise(() => {});
}

async function counterBeing(warden) {
  const { being } = await warden.hold(counter(), {
    seed: draw(),
    heirSeed: draw(),
    blueprint: COUNTER,
  });
  return being;
}

// The other half of `-hold`, and the half only a listening ground can play: an
// ask down a connection this ground never opened, spending a standing the
// dialling ground granted it. The standing arrives on stdin because it never
// travels on the wire, and it is spent on the line most recently accepted.
async function push(warden, said, line, on) {
  const row = warden.remember(invitation(said, []));
  const held = await line();
  const exchange = conversation(warden, row, (message) => (held.carry(message) ? true : null));
  const estate = await opening(row, exchange);
  if (!estate) return;
  emit({ quo: 1, step: 'pushed', far: hex(row.warden), voice: hex(row.voice.pk) });
  if (on.method) await invoke(row, estate, exchange, on);
}

// The middle of a chain. This ground holds a `Brief` whose one field it cannot
// answer alone: it reaches the house named in the facts it was handed, under
// the leash that arrived rather than under one of its own, and hands back what
// that house said. It never learns who asked it.
async function relay(warden, facts, entry, found) {
  const far = JSON.parse(facts);
  let book = null;
  let row = null;
  const brief = {
    async filed() {
      // The leash belongs to the message and reaches the being in scope. It is
      // handed straight on, never widened.
      const leash = current()?.leash ?? null;
      if (book === null) return null;
      const onward = leash?.onward() ?? null;
      const answer = await ask({
        being: book,
        method: { name: 'count', args: new Uint8Array(0) },
        leash,
      });
      emit({
        quo: 1,
        step: 'relayed',
        far: hex(row.warden),
        voice: hex(row.voice.pk),
        received: leash
          ? { time: Number(leash.received.time), hops: Number(leash.received.hops) }
          : null,
        onward: onward ? { time: Number(onward.time), hops: Number(onward.hops) } : null,
        silence: answer === null,
      });
      if (answer === null) return null;
      return decode(fieldOf('count').answer, answer.data, RECORDS);
    },
  };
  const { being } = await warden.hold(brief, {
    seed: draw(),
    heirSeed: draw(),
    blueprint: BRIEF,
  });
  // The relation belongs to the being that spends it, not to the house: it is
  // `Brief` that reaches the far house, and nothing else here may.
  row = warden.remember(invitation(far, far.hints), { being });
  let seq = 0n;
  const ask = async (over) => {
    const envelope = await warden.ask(row, { seq: (seq += 1n), random: draw(), ...over });
    // A leash with nothing left to hand on composes no ask at all, so no bytes
    // leave for the far house.
    if (envelope === null) return null;
    const back = await reach(row.hints, envelope);
    if (back === null) return null;
    return readAnswer({
      envelope: back,
      padlockSecret: warden.padlock.secret,
      wardenPk: row.warden,
    });
  };
  const next = await signingPair(draw());
  const estate = await ask({ commitment: await commitment(row.warden, next.pk) });
  if (!estate) throw new Error('the far house answered the relay nothing');
  row.voice = { pk: row.heir.pk, secret: row.heir.secret };
  row.heir = next;
  book = named('auto', readField('describe', estate.data), row);
  // What this ground put in the far house's book, if it was told to put
  // anything. Only this ground could have written it and only that house holds
  // it, so a number read back through `Brief` came from there and nowhere else.
  let filed = 0;
  if (entry) {
    const wrote = await ask({ being: book, method: { name: 'bump', args: un(entry) } });
    if (!wrote) throw new Error('the far house would not take the relay`s entry');
    filed = Number(decode(fieldOf('bump').answer, wrote.data, RECORDS));
  }
  found({
    quo: 1,
    step: 'relay',
    far: hex(row.warden),
    being: hex(book),
    brief: hex(being),
    filed,
  });
  return being;
}

async function speak(args) {
  const { flags: on, rest } = flags(args, ['line', 'blueprint', 'hold']);
  if (rest.length !== 1) throw new Error('usage: subject speak [flags] <facts-json>');
  const facts = JSON.parse(rest[0]);
  const guest = await stand();
  const row = guest.remember(invitation(facts, facts.hints));

  // Which road this ground speaks over is the whole of what -line changes.
  const road = on.line
    ? await dial(
        guest,
        facts.hints.find((one) => one.startsWith('tcp://')),
        { clock, random },
      )
    : null;
  const send = road
    ? (message) => (road.carry(message) ? true : null)
    : (message) => reach(row.hints, message);
  const exchange = conversation(guest, row, send);

  const estate = await opening(row, exchange);
  if (!estate) return road?.close();
  if (on.blueprint) await blueprints(row, estate, exchange);
  if (on.method) await invoke(row, estate, exchange, on);
  if (!on.hold) return road?.close();
  if (road === null) throw new Error('a standing granted back can only ride a line');
  await held(guest, row.warden, road);
}

// The half of a line a door cannot have: this ground holds a being of its own
// and grants the ground it dialled a standing at it. The invitation carries no
// road, because this ground has none — it is reachable only down the line it
// opened. Then it stays for as long as the far ground keeps the line, and says
// what its own object was left holding once the line is let go.
async function held(guest, far, road) {
  const own = counter();
  const { being } = await guest.hold(own, {
    seed: draw(),
    heirSeed: draw(),
    blueprint: COUNTER,
  });
  const granted = await guest.grant(being, { voiceSeed: draw(), heirSeed: draw(), hints: [] });
  emit({
    quo: 1,
    step: 'standing',
    far: hex(far),
    warden: hex(granted.warden),
    commitment: hex(granted.commitment),
    padlock: hex(granted.padlock),
    heir: hex(granted.heirPublic),
    heirSecret: hex(granted.heirSecret),
  });
  // The far end closes the line when it has finished asking, and a line is
  // dumb — it has no event to wait on, only the fact of whether it is still
  // carrying. Leaving before it is let go would be leaving mid-answer.
  const at = Date.now();
  while (road.open) {
    if (Date.now() - at > 30_000) throw new Error('the line this ground opened was never let go');
    await new Promise((settle) => setTimeout(settle, 10));
  }
  emit({ quo: 1, step: 'held', being: hex(being), total: Number(own.total) });
}

// `auto` is the one being the describe found that is not the door's own, and
// it is found rather than told: the invitation never names a being.
function named(which, estate, row) {
  if (which === undefined || which === '') return undefined;
  if (which === 'door') return row.warden;
  if (which !== 'auto') return un(which);
  const held = estate.classes.filter((one) => hex(one.digest) !== hex(WARDEN_DIGEST));
  if (held.length !== 1 || held[0].beings.length !== 1) {
    throw new Error('the far estate holds no single granted being to choose');
  }
  return held[0].beings[0].being;
}

const mode = process.argv[2];
const rest = process.argv.slice(3);
const run = mode === 'serve' ? serve(rest) : mode === 'speak' ? speak(rest) : null;
if (run === null) {
  process.stderr.write(`subject: no mode named ${JSON.stringify(mode)}\n`);
  process.exit(1);
}
run.catch(fail);
