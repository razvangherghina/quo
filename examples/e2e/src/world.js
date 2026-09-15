// The world of `SCENARIOS.md`, "How the world is built", on loopback:
// two harbors as two processes, the observer a proxy between them, each
// routed to the other only through it.

import { bootHost, startStand } from './root-driver.js';
import { createObserver } from './observer.js';
import { standHand } from './hand.js';
import { knockAndTake, route } from './standing.js';
import { createDockerObserver, resolveContainerAt } from './docker-net.js';

// Set only by `compose.yaml`'s own `driver` service: the world stands in
// containers. `docker-net.js`'s top comment says what changes: a stand
// listens on every interface, and the observer is a service of its own.
const DOCKER = Boolean(process.env.E2E_DOCKER);
export const LISTEN_HOST = DOCKER ? '0.0.0.0' : '127.0.0.1';

// The address a `ready()` or a verb's own report names, resolved exactly as
// `withWorld` resolves `a.at`/`b.at` below: on loopback, `at` unchanged; in
// containers, through `resolveContainerAt`, since a stand told
// `--listen 0.0.0.0:0` echoes the interface it bound, not the name another
// service dials it by. Every site outside this file that stands a second
// listener or dials one directly uses this instead of asking itself whether
// it is running under containers.
export function containerAt(kitName, at) {
  return DOCKER ? resolveContainerAt(kitName, at) : at;
}

// The address a stand dials the hand at, when the hand stands as a ward on
// `LISTEN_HOST` in this process: unchanged on loopback, and in containers
// the port on `driver`, the service this process runs in.
export function handAt(at) {
  return DOCKER ? `driver:${at.slice(at.lastIndexOf(':') + 1)}` : at;
}

// The observer a call site outside `withWorld` needs when it opens its own
// forward: the same choice `withWorld` makes below, so a second stand a
// test raises for itself is reachable the same way the world's two are.
export function createWorldObserver() {
  return DOCKER ? createDockerObserver() : createObserver();
}

// A kit's ward standing as B with the hand standing as the door, answering
// each ask it opens with `answer(ask, hand)`. B holds the standing `a` at the
// hand, knocked with `hello` and taken, unless `standing: false`. `fn` is
// handed `{ stand, b, hand, invitation, ask(opts), route(at) }`, `route` the
// address B dials the hand at.
export async function handDoor(kit, answer, fn, { standing = true } = {}) {
  const stand = startStand(kit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', '--class', 'Host']);
  let hand;
  hand = await standHand({ listen: `${LISTEN_HOST}:0`, answer: (ask) => answer(ask, hand) });
  try {
    const [b] = await stand.ready(1);
    await bootHost(stand, b.pk, 'h');
    const routeTo = (at) => route(stand, b.pk, hand.pk, at);
    await routeTo(handAt(hand.at));
    const invitation = hand.invite();
    if (standing) await knockAndTake(stand, b.pk, invitation, 'a');
    const ask = (opts = {}) => stand.request({ ward: b.pk, method: 'ask', args: { being: 'h', id: 'a', method: 'hello', wanted: 1000, ...opts } });
    return await fn({ stand, b, hand, invitation, ask, route: routeTo });
  } finally {
    await Promise.all([stand.close(), hand.close()]);
  }
}

// Stands a `Host`-carrying ward under `door`'s kit and one under `asker`'s,
// wires an observer between them (one forwarding address per direction, so
// every ask either side sends the other crosses it), and routes each
// harbor to the other's forwarding address rather than its real one. `fn`
// receives the world and its return value is this function's own.
export async function withWorld({ doorKit, askerKit, entropy }, fn) {
  const entropyArgs = (seed) => (seed === undefined ? [] : ['--entropy', String(seed)]);
  const door = startStand(doorKit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'A', '--class', 'Host', ...entropyArgs(entropy)]);
  const asker = startStand(askerKit, ['--listen', `${LISTEN_HOST}:0`, '--ward', 'B', '--class', 'Host', ...entropyArgs(entropy === undefined ? undefined : entropy + 1)]);
  const observer = DOCKER ? createDockerObserver() : createObserver();
  try {
    const [a] = await door.ready(1);
    const [b] = await asker.ready(1);
    // `a.at`/`b.at` are the wards' real addresses, resolved here once so
    // nothing outside this file asks whether it runs under containers.
    if (DOCKER) {
      a.at = resolveContainerAt(doorKit, a.at);
      b.at = resolveContainerAt(askerKit, b.at);
    }
    await bootHost(door, a.pk, 'h');
    await bootHost(asker, b.pk, 'h');

    // `forward('door', a.at)`: a listener the asker's route points its
    // carrier at, that forwards on to the door's real address. Likewise
    // the other way, so both directions of dialing cross the observer.
    const obsForDoor = await observer.forward('door', a.at);
    const obsForAsker = await observer.forward('asker', b.at);

    const routedDoor = await door.request({ ward: a.pk, method: 'route', args: { far: b.pk, at: obsForAsker } });
    if (!routedDoor.object || routedDoor.object.routed !== b.pk) throw new Error(`route (door): ${JSON.stringify(routedDoor)}`);
    const routedAsker = await asker.request({ ward: b.pk, method: 'route', args: { far: a.pk, at: obsForDoor } });
    if (!routedAsker.object || routedAsker.object.routed !== a.pk) throw new Error(`route (asker): ${JSON.stringify(routedAsker)}`);

    const world = { door, asker, a, b, observer, obsForDoor, obsForAsker };
    return await fn(world);
  } finally {
    // The observer's listeners finish closing once the connections they
    // carry end, and the harbors' exits end those, so all three close
    // together.
    await Promise.all([observer.close(), door.close(), asker.close()]);
  }
}
