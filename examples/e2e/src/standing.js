// The root steps a story is set up with, `quo/vectors/HARNESS.md` section 2
// and 4, spoken to a stand's root channel: invite, knock and take, ask on a
// standing, read a standing, digest, route, a partition file path. A step
// that the setup cannot do without throws, so a story never mistakes a
// broken setup for a claim. None of these is what a line claims.

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

let scratch;
// A fresh path for a partition file `save` writes and `stand` reads.
export function partitionFile(name = 'partition') {
  scratch ??= mkdtempSync(join(tmpdir(), 'quo-e2e-'));
  return join(scratch, `${name}-${randomBytes(4).toString('hex')}.json`);
}

// A root request whose answer must be an object and no refusal.
export async function root(stand, ward, method, args) {
  const answer = await stand.request({ ward, method, args });
  if (!answer.object || answer.object.error) throw new Error(`setup: ${method}: ${JSON.stringify(answer)}`);
  return answer.object;
}

export async function invite(stand, ward, id, being = 'h') {
  return (await root(stand, ward, 'invite', { being, id })).invitation;
}

export async function digestOf(stand, ward) {
  return (await root(stand, ward, 'digest')).digest;
}

export async function route(stand, ward, far, at) {
  const out = await root(stand, ward, 'route', { far, at });
  if (out.routed !== far) throw new Error(`setup: route: ${JSON.stringify(out)}`);
}

// Knocks on `invitation`, with `wanted` the allowance in milliseconds when
// named, so a knock whose reply is lost ends by that allowance.
export function knock(stand, ward, invitation, { being = 'h', method = 'hello', args, wanted } = {}) {
  return stand.request({ ward, method: 'knock', args: { being, invitation, method, ...(args ? { args } : {}), ...(wanted !== undefined ? { wanted } : {}) } });
}

export async function take(stand, ward, id, invitation, being = 'h') {
  const out = await root(stand, ward, 'take', { being, id, invitation });
  if (out.taken !== id) throw new Error(`setup: take ${id}: ${JSON.stringify(out)}`);
}

// Knocks with `hello` on `invitation`, expects an object, and takes it as `id`.
export async function knockAndTake(stand, ward, invitation, id, being = 'h') {
  const knocked = await knock(stand, ward, invitation, { being });
  if (!knocked.object) throw new Error(`setup: knock for ${id}: ${JSON.stringify(knocked)}`);
  await take(stand, ward, id, invitation, being);
  return invitation;
}

// The world's B holds a standing `id` at A's `Host`, invited as `occupant`.
export async function standingAt(world, occupant, id = occupant) {
  const invitation = await invite(world.door, world.a.pk, occupant);
  return knockAndTake(world.asker, world.b.pk, invitation, id);
}

// Asks on the standing `id` the being holds: `{ method, args, wanted }`,
// `method: null` the empty ask.
export function askOn(stand, ward, id, { being = 'h', method = 'hello', args, wanted } = {}) {
  const req = { being, id };
  if (method !== null) req.method = method;
  if (args !== undefined) req.args = args;
  if (wanted !== undefined) req.wanted = wanted;
  return stand.request({ ward, method: 'ask', args: req });
}

// What a standing holds, `{ id, digest, seen }`.
export async function readStanding(stand, ward, id, being = 'h') {
  return root(stand, ward, 'standing', { being, id });
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
