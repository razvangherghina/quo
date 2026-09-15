#!/usr/bin/env node
// The stand program, `vectors/HARNESS.md` section 1: one executable that
// a harbor runs, speaking the root channel of section 2 on stdin/stdout and
// standing wards over the reference carrier of `../src/tcp.js`. It is an
// adapter over the kit (`../src/ward.js`, `../src/harbor.js`) and changes
// nothing of it.

import { readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createWard } from '../src/ward.js';
import { emptyPartition } from '../src/partition.js';
import { random as platformRandom } from '../src/harbor.js';
import { splitmix64 } from '../test/fixtures/splitmix64.js';
import { dial, listen } from '../src/tcp.js';
import { wardKey } from '../src/seal.js';
import { SILENCE, wordName as wordNameOf } from '../src/value.js';
import { Host, Caller, Stillborn } from './beings.js';

// ---- args -----------------------------------------------------------------

function parseArgs(argv) {
  const out = { wards: [], classes: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--listen') out.listen = argv[++i];
    else if (a === '--ward') out.wards.push(argv[++i]);
    else if (a === '--class') out.classes.push(argv[++i]);
    else if (a === '--entropy') out.entropy = argv[++i];
    else {
      process.stderr.write(`stand: bad argument ${a}\n`);
      process.exit(1);
    }
  }
  if (!out.listen) {
    process.stderr.write('stand: --listen is required\n');
    process.exit(1);
  }
  return out;
}

function splitHostPort(s) {
  const at = s.lastIndexOf(':');
  return { host: s.slice(0, at), port: Number(s.slice(at + 1)) };
}

// The harness's own class registry: the kit's four classes plus whatever the
// wire calls it under. `--class NAME` is the kit's class of that name;
// `--class NAME=CLASS` is the kit's class CLASS under the name NAME.
const KIT_CLASSES = { Host, Caller, Stillborn };

function buildClasses(specs, registerStance) {
  const out = {};
  for (const spec of specs) {
    const eq = spec.indexOf('=');
    const name = eq === -1 ? spec : spec.slice(0, eq);
    const cls = eq === -1 ? spec : spec.slice(eq + 1);
    const Ctor = KIT_CLASSES[cls];
    if (!Ctor) {
      process.stderr.write(`stand: no such class ${cls}\n`);
      process.exit(1);
    }
    // Wrapped so the harness can reach a freshly made being's own stance
    // (see beings.js): the wrapper records it the instant she is born.
    out[name] = class extends Ctor {
      constructor(stance) {
        super(stance);
        registerStance(stance);
      }
    };
  }
  return out;
}

// ---- random -----------------------------------------------------------------

function randomOf(seedArg) {
  if (seedArg === undefined) return platformRandom;
  return splitmix64(BigInt(seedArg));
}

// ---- wards, listeners and the two harbor faults ----------------------------
//
// A ward is a `record`: the kit's own `door` and `ask`, this harness's own
// tracking of her beings' stances (so the root channel's per-being verbs
// reach the being's own six calls, HARNESS.md section 2), and the two
// counters `stop`/`stand`, `hold` and `drop` spend (section 4). A record
// lives on one listener at a time, named by `record.at`; `copy` is the one
// case where two records share one pk on two listeners at once, told apart
// by `at` on the request (section 2's `at` field).

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const random = randomOf(args.entropy);

  const classes = buildClasses(args.classes, (stance) => pendingStances.push(stance));

  // A list of stances registered since the last being was made, so the
  // adapter can claim the one just made for the key it expects. Every path
  // that can make a being (fresh boot, a ward's own restart-on-load loop, a
  // being's own `boot` call) is serialised against the others below, so this
  // is never ambiguous.
  let pendingStances = [];

  // `instantiate` is called once per being made, in the kit's own order and
  // never told which key it is for; the adapter tracks that itself. During a
  // ward's restart loop (partition beings already there) the keys are read
  // off the partition before the loop runs, in the same order `createWard`
  // walks `Object.entries`; a fresh boot (root's `boot`, or the reflexive
  // relation a root `boot` mints below) sets `currentBootKey` around the one
  // call it causes.
  let currentBootKey = null;

  function makeInstantiate(record) {
    const restartKeys = Object.keys(record.partition.beings);
    let restartIndex = 0;
    let duringRestart = true;
    record.finishRestart = () => {
      duringRestart = false;
    };
    return (cls, stance) => {
      pendingStances = [];
      const Ctor = classes[cls];
      if (!Ctor) return null;
      const being = new Ctor(stance);
      const k = duringRestart ? restartKeys[restartIndex++] : currentBootKey;
      if (typeof k === 'string') record.stances.set(k, pendingStances.at(-1) ?? stance);
      return being;
    };
  }

  const wardsByPk = new Map(); // pk -> record[], almost always length 1
  const listeners = new Map(); // "host:port" -> { host, port, close, byPk: Map<pk, record> }

  // `route` (section 4): where a far pk this program does not stand is
  // dialed, for every ward this program stands. One dialer per address,
  // opened on first use and shared by every far pk routed there, since the
  // carrier is the address's and a second `route` for one `far` only ever
  // replaces the map entry.
  const routes = new Map(); // far pk -> "host:port"
  const dialers = new Map(); // "host:port" -> ReturnType<typeof dial>

  function dialerFor(at) {
    let dialer = dialers.get(at);
    if (!dialer) {
      dialer = dial(splitHostPort(at));
      dialers.set(at, dialer);
    }
    return dialer;
  }

  async function openListener(hostport) {
    const { host, port } = splitHostPort(hostport);
    const byPk = new Map();
    const bound = await listen({ host, port, carry: (pk, bytes) => carryIn(byPk.get(pk), bytes) });
    const entry = { host: bound.host, port: bound.port, close: bound.close, byPk };
    listeners.set(`${bound.host}:${bound.port}`, entry);
    return entry;
  }

  function attach(record, at) {
    record.at = at;
    const list = wardsByPk.get(record.pk) ?? [];
    list.push(record);
    wardsByPk.set(record.pk, list);
    listeners.get(at).byPk.set(record.pk, record);
  }

  function detach(record) {
    const list = wardsByPk.get(record.pk) ?? [];
    const i = list.indexOf(record);
    if (i !== -1) list.splice(i, 1);
    const listener = listeners.get(record.at);
    if (listener && listener.byPk.get(record.pk) === record) listener.byPk.delete(record.pk);
  }

  function resolve(pk, at) {
    const list = wardsByPk.get(pk);
    if (!list || list.length === 0) return null;
    if (list.length === 1) return list[0];
    return list.find((r) => r.at === at) ?? null;
  }

  // A reply this ward's door wrote, on its way out: `drop` spends here,
  // after the door has taken the bytes (section 4), which `record.door`
  // already did by the time this reads `dropRemaining`. HARNESS.md says the
  // far side is ended by its own allowance, not answered `unreached`, so a
  // dropped reply is not returned at all: the promise never settles, and the
  // asker's own `inLine` timer is what ends it, exactly as a reply lost on a
  // real wire would.
  function carryIn(record, bytes) {
    // A stopped ward's pk answers as not delivered from here on (section 4:
    // "its pk answers kind 02 from then on"), whether this is a real inbound
    // frame or another local ward's own outbound send.
    if (!record || record.stopped) return Promise.resolve(null);
    return record.door(bytes.slice()).then((reply) => {
      if (record.dropRemaining > 0) {
        record.dropRemaining -= 1;
        return new Promise(() => {});
      }
      return reply.bytes.slice();
    });
  }

  // An ask this ward's own send() is putting on the wire, to another ward:
  // `hold` spends here: the frame is never sent, not even later (section 4).
  // The kit is never told so, since a sender cannot always know whether a
  // door heard her, so the carrier never settles and her allowance ends the
  // ask as `late`, as a dropped reply does. A pk this process does not stand
  // answers null the same way a real dial that finds nobody would.
  function outboundCarry(record) {
    return async (pk, bytes) => {
      if (record.holdRemaining > 0) {
        record.holdRemaining -= 1;
        return new Promise(() => {});
      }
      const target = wardsByPk.get(pk)?.[0];
      if (target) return carryIn(target, bytes);
      const at = routes.get(pk);
      if (!at) return null; // no route: not delivered, the being hears unreached
      try {
        return await dialerFor(at).carry(pk, bytes);
      } catch {
        return null; // the far address refused or never came up: not delivered
      }
    };
  }

  async function buildWard(seed, partition) {
    const record = {
      seed,
      partition,
      stances: new Map(),
      // The occupant ids a being holds are off the stance, the kit's own
      // choice, so the harness keeps the records it needs itself, and
      // `remove`'s answer needs this to tell an id that named an occupant
      // from one that named nothing at all. Seeded from beings the
      // partition already had, kept in step by `invite` and `remove` below
      // and by `boot`'s own relation.
      occupants: new Set(),
      holdRemaining: 0,
      dropRemaining: 0,
      stopped: false,
    };
    for (const [k, b] of Object.entries(partition.beings)) {
      for (const occId of Object.keys(b.occupants ?? {})) record.occupants.add(`${k}:${occId}`);
    }
    const instantiate = makeInstantiate(record);
    const ward = await createWard({ seed, partition, random, instantiate, carry: outboundCarry(record) });
    record.finishRestart();
    const { pk } = await wardKey(seed);
    record.pk = pk;
    record.door = ward.door;
    record.ask = ward.ask;
    return record;
  }

  function readPartition(file) {
    return JSON.parse(readFileSync(file, 'utf8'));
  }

  // ---- startup: the wards named on the command line, then the listener ----

  const initial = [];
  for (const seedText of args.wards) {
    const eq = seedText.indexOf('=');
    const seed = eq === -1 ? seedText : seedText.slice(0, eq);
    const file = eq === -1 ? null : seedText.slice(eq + 1);
    let partition = emptyPartition();
    if (file) {
      try {
        partition = readPartition(file);
      } catch {
        process.stderr.write(`stand: cannot read partition ${file}\n`);
        process.exit(2);
      }
    }
    initial.push(await buildWard(seed, partition));
  }

  const main0 = await openListener(args.listen);
  const mainAt = `${main0.host}:${main0.port}`;
  for (const record of initial) attach(record, mainAt);

  // `ward <pk> <host>:<port>` per ward, in the order given, then `ready`,
  // both before any answer (HARNESS.md section 1).
  for (const record of initial) process.stdout.write(`ward ${record.pk} ${record.at}\n`);
  process.stdout.write('ready\n');

  // ---- the root channel -----------------------------------------------------

  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.on('line', (line) => {
    line = line.replace(/\r$/, '');
    if (!line) return;
    handle(line).then((answer) => process.stdout.write(`${JSON.stringify(answer)}\n`));
  });
  rl.on('close', async () => {
    for (const listener of listeners.values()) await listener.close();
    for (const dialer of dialers.values()) await dialer.close();
    process.exit(0);
  });

  async function handle(line) {
    let req;
    try {
      req = JSON.parse(line);
    } catch {
      return { id: null, object: { error: 'not json' } };
    }
    const { id, ward, at, method, args: reqArgs } = req;
    const record = resolve(ward, at);
    if (!record) return { id, object: { error: 'no such ward' } };
    try {
      return await answerOn(id, record, method, reqArgs ?? {});
    } catch (e) {
      return { id, object: { error: String(e && e.message ? e.message : e) } };
    }
  }

  function toChannel(id, out) {
    if (out === SILENCE) return { id, silence: true };
    const w = wordNameOf(out);
    if (w) return { id, quo: w };
    return { id, object: out };
  }

  // Verbs a stopped ward still answers: `stand` to stand her again, `stop`
  // idempotently, and `digest`/`save`, which read the partition alone and
  // never the running ward.
  const ALIVE_WHILE_STOPPED = new Set(['stand', 'stop', 'digest', 'save', 'forget']);

  async function answerOn(id, record, method, reqArgs) {
    if (record.stopped && !ALIVE_WHILE_STOPPED.has(method)) {
      return { id, object: { error: 'no such ward' } };
    }

    // The empty ask: the ward's own blueprint (its root asks).
    if (method === undefined) {
      const out = await record.ask();
      return { id, object: out };
    }
    if (method === 'boom') {
      // The root ask that throws, named by the harness (SCENARIOS.md "The
      // root"): the kit's own root has none, so the adapter supplies it and
      // answers as the kit's owner ask would on a throw: silence.
      return { id, silence: true };
    }

    // The harbor's verbs (section 4) act on the ward as a whole.
    switch (method) {
      case 'stop':
        // A stopped ward sends and writes nothing, so what `hold` and `drop`
        // still had to spend goes with its run.
        Object.assign(record, { stopped: true, holdRemaining: 0, dropRemaining: 0 });
        return { id, object: { stopped: record.pk } };
      case 'digest':
        return { id, object: { digest: JSON.stringify(record.partition) } };
      case 'save':
        writeFileSync(reqArgs.file, JSON.stringify(record.partition));
        return { id, object: { saved: reqArgs.file } };
      case 'stand': {
        let partition = record.partition;
        if (reqArgs.file) {
          try {
            partition = readPartition(reqArgs.file);
          } catch {
            return { id, object: { error: 'cannot read partition' } };
          }
        }
        let at = record.at;
        if (reqArgs.listen) {
          const listener = await openListener(reqArgs.listen);
          at = `${listener.host}:${listener.port}`;
        }
        detach(record);
        const fresh = await buildWard(record.seed, partition);
        attach(fresh, at);
        return { id, object: { stood: fresh.pk, at } };
      }
      case 'forget': {
        // Section 4: the occupant record alone goes, from the partition the
        // next `stand` without a file stands. The door's keys for that heir
        // stay, so no `removed` entry is made.
        if (!record.stopped) return { id, object: { error: 'running' } };
        const occupants = record.partition.beings[reqArgs.being]?.occupants;
        if (!occupants || typeof reqArgs.id !== 'string' || !Object.hasOwn(occupants, reqArgs.id)) {
          return { id, object: { forgot: null } };
        }
        delete occupants[reqArgs.id];
        record.occupants.delete(`${reqArgs.being}:${reqArgs.id}`);
        return { id, object: { forgot: reqArgs.id } };
      }
      case 'hold':
        record.holdRemaining = reqArgs.asks;
        return { id, object: { holding: reqArgs.asks } };
      case 'drop':
        record.dropRemaining = reqArgs.replies;
        return { id, object: { dropping: reqArgs.replies } };
      case 'route':
        routes.set(reqArgs.far, reqArgs.at);
        return { id, object: { routed: reqArgs.far } };
      case 'copy': {
        let partition;
        try {
          partition = readPartition(reqArgs.file);
        } catch {
          return { id, object: { error: 'cannot read partition' } };
        }
        const listener = await openListener(reqArgs.listen);
        const at = `${listener.host}:${listener.port}`;
        const fresh = await buildWard(record.seed, partition);
        attach(fresh, at);
        return { id, object: { copy: fresh.pk, at } };
      }
      default:
        break;
    }

    // `boot` (section 2): the being `maker` names makes a being under `key`,
    // and the one relation between the two. The kit's own root `boot` makes
    // a bare being, so the adapter mints the relation by the kit's root
    // calls: the maker invites under `occupant`, and the made being knocks
    // with that invitation and takes it under `standing`. The maker is
    // checked first, so a boot for a maker that is not there makes nobody.
    if (method === 'boot') {
      const relation = typeof reqArgs.occupant === 'string' && typeof reqArgs.standing === 'string';
      if (relation && !record.stances.has(reqArgs.maker)) return { id, object: { error: 'no such being' } };
      currentBootKey = reqArgs.key;
      const raw = await record.ask('boot', { key: reqArgs.key, class: reqArgs.class });
      currentBootKey = null;
      if (raw.error) {
        // The kit's own words for the two boot refusals HARNESS.md's section
        // 2 names differently: `no such class` already matches; a throw at
        // birth is this kit's `threw at birth`, HARNESS.md's `absent`.
        return { id, object: { error: raw.error === 'threw at birth' ? 'absent' : raw.error } };
      }
      if (relation) {
        // The kit's own root `invite` answers the invitation itself, and its
        // root `knock` knocks and takes in one call.
        const invitation = await record.ask('invite', { being: reqArgs.maker, id: reqArgs.occupant });
        if (!invitation || invitation === SILENCE || invitation.error) return { id, object: { error: 'id taken' } };
        record.occupants.add(`${reqArgs.maker}:${reqArgs.occupant}`);
        const knocked = await record.ask('knock', { being: reqArgs.key, id: reqArgs.standing, invitation });
        if (!knocked || knocked === SILENCE || knocked.error || knocked.taken !== reqArgs.standing) {
          return { id, object: { error: knocked?.error ?? 'no relation' } };
        }
      }
      return { id, object: { booted: reqArgs.key } };
    }
    if (method === 'public') {
      const out = await record.ask('public', reqArgs);
      return toChannel(id, out);
    }

    if (['invite', 'knock', 'take', 'ask', 'remove', 'standing'].includes(method)) {
      const stance = record.stances.get(reqArgs.being);
      if (!stance) return { id, object: { error: 'no such being' } };
      return beingVerb(id, record, reqArgs.being, stance, method, reqArgs);
    }

    return { id, object: { error: 'unknown ask' } };
  }

  async function beingVerb(id, record, beingKey, stance, method, reqArgs) {
    switch (method) {
      case 'invite': {
        const invitation = await stance.invite(reqArgs.id, reqArgs.notes ?? {});
        if (invitation) record.occupants.add(`${beingKey}:${reqArgs.id}`);
        return invitation ? { id, object: { invitation } } : { id, object: { error: 'id taken' } };
      }
      case 'knock': {
        const out = await stance.knock(reqArgs.invitation, reqArgs.method, reqArgs.args, allowance(reqArgs.wanted));
        return toChannel(id, out);
      }
      case 'take': {
        const out = await stance.take(reqArgs.id, reqArgs.invitation);
        return { id, object: { taken: out } };
      }
      case 'ask': {
        // No pre-check here: an id that never named a standing and one
        // `remove` just deleted are the same case to the kit's own
        // `stance.ask` (`../src/ward.js`), which answers `dropped`
        // for both (SPEC.md "What her ward tells her"). Pre-checking
        // `stance.standings` and answering `{ error: "no such standing" }`
        // before ever asking would only ever catch a removed id wrong.
        const out = await stance.ask(reqArgs.id, reqArgs.method, reqArgs.args, allowance(reqArgs.wanted));
        return toChannel(id, out);
      }
      case 'remove': {
        const occupantKey = `${beingKey}:${reqArgs.id}`;
        const existed = Object.hasOwn(stance.standings, reqArgs.id) || record.occupants.has(occupantKey);
        stance.remove(reqArgs.id);
        record.occupants.delete(occupantKey);
        return { id, object: { removed: existed ? reqArgs.id : null } };
      }
      case 'standing': {
        const s = stance.standings[reqArgs.id];
        if (!s) return { id, object: { error: 'no such standing' } };
        return { id, object: { id: s.id, digest: s.digest, seen: s.seen } };
      }
      default:
        return { id, object: { error: 'unknown ask' } };
    }
  }
}

// `wanted` on the root channel is milliseconds; the kit's stance reads an
// allowance as `{ time }`. Absent stays absent.
function allowance(wanted) {
  return typeof wanted === 'number' ? { time: wanted } : undefined;
}

main().catch((e) => {
  process.stderr.write(`stand: ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
});
