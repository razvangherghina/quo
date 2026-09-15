// The trace of `SCENARIOS.md` "How the world is built" and
// `vectors/HARNESS.md` section 8: one kit's stand under fixed entropy, the
// hand on its own fixed stream, and the observer between them. Each record
// of `vectors/door.json` is one story told from nothing, and what the
// observer recorded of its last arrival is the record. Every step before it
// is written into the record too, root requests and arrivals as bytes, so a
// verifier holding no key puts a kit in the record's state by replaying them.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dial, opens } from './dial.js';
import { freshHand, mintKey, randomSeed, sealAsk, wardPkOf, ZERO_EDGE } from './hand.js';
import { createObserver, exchanges } from './observer.js';
import { startStand } from './root-driver.js';
import { splitmix64 } from './stream.js';
import { digestOf, SHOWN } from './blueprint.js';

export const ENTROPY = 20250901;
export const WARDS = ['B', 'P'];
export const STAND = ['--ward', 'B', '--ward', 'P', '--class', 'Host'];

const HELLO = { time: 1000, method: 'hello' };

// A payload in chapter 3's order, `to` first, `args` only where named.
function payload(to, by, fields = {}) {
  const { next = null, seq, time, method, args } = { ...HELLO, ...fields };
  const out = { to, by, next, seq, time };
  if (method !== undefined) out.method = method;
  if (args !== undefined) out.args = args;
  return out;
}

const nested = (depth) => (depth === 0 ? 0 : [nested(depth - 1)]);

// One story against one kit: the stand, the observer, the hand's dialer, and
// every step written down as it is taken.
async function story(kit, tell) {
  freshHand(splitmix64(ENTROPY));
  const scratch = mkdtempSync(join(tmpdir(), 'quo-trace-'));
  const observer = createObserver();
  const steps = [];
  let stand;
  let pks;
  let dialer;

  async function start(extra) {
    stand = startStand(kit, ['--listen', '127.0.0.1:0', ...extra, '--entropy', String(ENTROPY)]);
    const lines = await stand.ready(WARDS.length);
    pks = Object.fromEntries(WARDS.map((w, i) => [w, lines[i]]));
    dialer = dial(await observer.forward(`at${steps.length}`, lines[0].at));
    await dialer.ready;
  }

  async function root(ward, method, args) {
    steps.push({ root: { ward, method, ...(args ? { args } : {}) } });
    const answer = await stand.request({ ward: pks[ward].pk, method, ...(args ? { args } : {}) });
    if (!answer.object || answer.object.error) throw new Error(`${kit}: ${method}: ${JSON.stringify(answer)}`);
    return answer.object;
  }

  // Sends `box` to `ward` through the observer and answers what crossed.
  async function send(ward, box) {
    const from = observer.frames.length;
    const frame = await dialer.send(pks[ward].pk, box);
    if (!frame) throw new Error(`${kit}: no frame came back`);
    const [crossed] = exchanges(observer.frames, observer.frames[from].label, from);
    return { ask: crossed.ask.box, reply: crossed.reply?.box ?? null };
  }

  const ctx = {
    pk: (ward) => pks[ward].pk,
    root,
    async ask(ward, key, body, { edge, padlock } = {}) {
      const sealed = sealAsk(padlock ?? pks[ward].pk.slice(64), key, body, edge);
      const crossed = await send(ward, sealed.box);
      steps.push({ arrive: { ward, ask: crossed.ask.toString('hex') }, reply: crossed.reply?.toString('hex') ?? null });
      return crossed.reply && opens(sealed.lidSecret, crossed.reply, pks[ward].pk);
    },
    async restart(classes) {
      const files = {};
      for (const ward of WARDS) {
        files[ward] = join(scratch, `${ward}.json`);
        await stand.request({ ward: pks[ward].pk, method: 'save', args: { file: files[ward] } });
      }
      await stand.close();
      dialer.close();
      steps.push({ restart: classes });
      await start([...WARDS.flatMap((w) => ['--ward', `${w}=${files[w]}`]), ...classes]);
    },
    world: null,
    mark(name) {
      ctx.world = { name, steps: steps.length };
    },
    // The record's own arrival: the digest before, the box, the digest after.
    async pin(ward, sealed) {
      const before = (await stand.request({ ward: pks[ward].pk, method: 'digest' })).object.digest;
      const crossed = await send(ward, sealed.box);
      const after = (await stand.request({ ward: pks[ward].pk, method: 'digest' })).object.digest;
      const opened = sealed.lidSecret && crossed.reply ? opens(sealed.lidSecret, crossed.reply, pks[ward].pk) : null;
      const kind = !crossed.reply ? 'nothing' : !opened ? 'silence' : 'object' in opened ? 'object' : opened.silence ? 'silence' : 'word';
      const record = { ward, ask: crossed.ask.toString('hex'), reply: crossed.reply?.toString('hex') ?? null, kind, opens: opened, wrote: before !== after };
      if (opened?.seen) {
        if (digestOf(SHOWN) !== opened.seen) throw new Error(`${kit}: seen is not the digest of the blueprint shown`);
        record.blueprint = SHOWN;
      }
      return record;
    },
  };

  await start(STAND);
  try {
    await ctx.root('B', 'boot', { key: 'h', class: 'Host' });
    await ctx.root('P', 'boot', { key: 'p', class: 'Host' });
    await ctx.root('P', 'public', { key: 'p' });
    ctx.mark('home');
    const record = await tell(ctx);
    if (observer.illegal.length) throw new Error(`${kit}: the observer read bytes that are not a frame`);
    const world = ctx.world;
    return { world: world.name, worldSteps: steps.slice(0, world.steps), steps: steps.slice(world.steps), record };
  } finally {
    dialer.close();
    await Promise.all([stand.close(), observer.close()]);
  }
}

// A relation the hand holds at `h` on B: `h` invites `g1`, the hand knocks
// as its heir announcing a key of its own, and the knock is answered.
async function bound(ctx) {
  const invitation = await ctx.root('B', 'invite', { being: 'h', id: 'g1' });
  const { heir, secret, lock } = invitation.invitation;
  const own = mintKey(randomSeed());
  const knocked = await ctx.ask('B', mintKey(secret, lock), payload(heir, heir, { next: own.signPk, seq: 1 }));
  if (!knocked || !('object' in knocked)) throw new Error(`the knock was not answered: ${JSON.stringify(knocked)}`);
  ctx.mark('bound');
  return { heir, own };
}

const seal = (ctx, ward, key, body, options = {}) => sealAsk(options.padlock ?? ctx.pk(ward).slice(64), key, body, options.edge);

// One recipe per record: the case, its name, and the story that ends in it.
export const RECIPES = [
  ['D1', 'the wrong padlock', async (ctx) => {
    const { heir, own } = await bound(ctx);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2 }), { padlock: wardPkOf('other').slice(64) }));
  }],
  ['D1', 'noise', async (ctx) => ctx.pin('B', { box: Buffer.concat([Buffer.from([1]), randomSeed(), randomSeed(), randomSeed(), randomSeed().subarray(0, 16)]) })],
  ...[
    ['method is not a string', { method: 7 }],
    ['args is not an object', { args: 7 }],
    ['seq is zero', { seq: 0 }],
    ['time is negative', { time: -1 }],
    ['args nested past sixty-four', { args: { v: nested(65) } }],
  ].map(([name, fields]) => ['D2', name, async (ctx) => {
    const { heir, own } = await bound(ctx);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2, ...fields })));
  }]),
  ['D2', 'by is not a key', async (ctx) => {
    const { heir, own } = await bound(ctx);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, 'nope', { seq: 2 })));
  }],
  ['D2', 'args nested sixty-four is answered, the payload sixty-six', async (ctx) => {
    const { heir, own } = await bound(ctx);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2, args: { v: nested(64) } })));
  }],
  ['D3', 'for nobody, and nobody is home', async (ctx) => {
    const key = mintKey(randomSeed());
    return ctx.pin('B', seal(ctx, 'B', key, payload(null, key.signPk, { seq: 1 })));
  }],
  ['D4', 'for nobody, the signature fails', async (ctx) => {
    const named = mintKey(randomSeed());
    const signer = mintKey(randomSeed());
    return ctx.pin('P', seal(ctx, 'P', signer, payload(null, named.signPk, { seq: 1 })));
  }],
  ['D5', 'a heir never minted here', async (ctx) => {
    const key = mintKey(randomSeed());
    return ctx.pin('B', seal(ctx, 'B', key, payload('ff'.repeat(32), key.signPk, { seq: 1 }), { edge: ZERO_EDGE }));
  }],
  ['D5', 'a heir removed before it spoke', async (ctx) => {
    const { invitation } = await ctx.root('B', 'invite', { being: 'h', id: 'g1' });
    await ctx.root('B', 'remove', { being: 'h', id: 'g1' });
    const heir = mintKey(invitation.secret);
    const next = mintKey(randomSeed());
    return ctx.pin('B', seal(ctx, 'B', heir, payload(invitation.heir, heir.signPk, { next: next.signPk, seq: 1 }), { edge: ZERO_EDGE }));
  }],
  ['D6', 'a key nobody announced', async (ctx) => {
    const { heir } = await bound(ctx);
    const stranger = mintKey(randomSeed());
    return ctx.pin('B', seal(ctx, 'B', stranger, payload(heir, stranger.signPk, { seq: 2 })));
  }],
  ['D6', 'a key forgotten when the key it vouched for spoke', async (ctx) => {
    const { heir, own } = await bound(ctx);
    const spare = mintKey(randomSeed());
    await ctx.ask('B', own, payload(heir, own.signPk, { seq: 2, next: spare.signPk }));
    await ctx.ask('B', spare, payload(heir, spare.signPk, { seq: 3 }));
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 4 })));
  }],
  ['D7', 'the signature fails under an admitted key', async (ctx) => {
    const { heir, own } = await bound(ctx);
    const forger = mintKey(randomSeed());
    return ctx.pin('B', seal(ctx, 'B', forger, payload(heir, own.signPk, { seq: 2 })));
  }],
  ['D8', 'she did not come back this run', async (ctx) => {
    const { heir, own } = await bound(ctx);
    await ctx.restart(['--class', 'Host=Stillborn']);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2 })));
  }],
  ['D8', 'the id was removed after its heir spoke', async (ctx) => {
    const { heir, own } = await bound(ctx);
    await ctx.root('B', 'remove', { being: 'h', id: 'g1' });
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2 })));
  }],
  ['D8', 'she is there and her occupant record is not', async (ctx) => {
    const { heir, own } = await bound(ctx);
    await ctx.root('B', 'stop');
    await ctx.root('B', 'forget', { being: 'h', id: 'g1' });
    await ctx.root('B', 'stand', {});
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2 })));
  }],
  ['D9', 'a knock that announces nothing', async (ctx) => {
    const { invitation } = await ctx.root('B', 'invite', { being: 'h', id: 'g1' });
    return ctx.pin('B', seal(ctx, 'B', mintKey(invitation.secret, invitation.lock), payload(invitation.heir, invitation.heir, { seq: 1 })));
  }],
  ['D9', 'a knock that announces the heir itself', async (ctx) => {
    const { invitation } = await ctx.root('B', 'invite', { being: 'h', id: 'g1' });
    return ctx.pin('B', seal(ctx, 'B', mintKey(invitation.secret, invitation.lock), payload(invitation.heir, invitation.heir, { seq: 1, next: invitation.heir })));
  }],
  ['D9', 'a bound key that announces nothing is answered', async (ctx) => {
    const { heir, own } = await bound(ctx);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2 })));
  }],
  ['D10', 'a number already honoured', async (ctx) => {
    const { heir, own } = await bound(ctx);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 1 })));
  }],
  ['D10', 'a number at the span', async (ctx) => {
    const { heir, own } = await bound(ctx);
    await ctx.ask('B', own, payload(heir, own.signPk, { seq: 70 }));
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 6 })));
  }],
  ['D10', 'a number inside the span, not yet spent', async (ctx) => {
    const { heir, own } = await bound(ctx);
    await ctx.ask('B', own, payload(heir, own.signPk, { seq: 70 }));
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 7 })));
  }],
  ...[
    ['D11', 'she threw', 'boom'],
    ['D12', 'she answered silence', 'quiet'],
    ['D13', 'she answered a word', 'bad'],
    ['D13', 'her answer is above the size', 'huge'],
  ].map(([id, name, method]) => [id, name, async (ctx) => {
    const { heir, own } = await bound(ctx);
    return ctx.pin('B', seal(ctx, 'B', own, payload(heir, own.signPk, { seq: 2, method })));
  }]),
];

// Every record, told against one kit.
export async function trace(kit) {
  const out = [];
  for (const [id, name, tell] of RECIPES) out.push({ case: id, name, ...(await story(kit, tell)) });
  return out;
}
