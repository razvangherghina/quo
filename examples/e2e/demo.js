// Two kits written apart, meeting once, in plain words. The JavaScript
// kit's stand stands ward A and the Rust kit's stand stands ward B, two
// processes on loopback with the observer on the wire between them. The
// driver speaks `vectors/HARNESS.md`'s root channel to each: boot, invite,
// route, knock, take, ask, and then a stranger's knock, answered by silence.
// Each step prints what crossed as it happens, and the program exits 0 only
// when every step held.
//
//   node examples/e2e/demo.js

import { bootHost, startStand } from './src/root-driver.js';
import { createObserver } from './src/observer.js';
import { askOn, digestOf, invite, knock, route, take } from './src/standing.js';
import { randomBytes } from 'node:crypto';

const short = (hex) => `${hex.slice(0, 8)}…`;
const say = (line) => process.stdout.write(`${line}\n`);

function crossed(observer, from) {
  const frames = observer.frames.slice(from).filter((f) => !f.closed);
  for (const f of frames) {
    const side = f.at === 'listener' ? 'B to A' : 'A to B';
    const what = f.kind === 'ask' ? `an ask of ${f.box.length} bytes` : f.kind === 'reply' ? `a reply of ${f.box.length} bytes` : 'a 02, nothing';
    say(`     crossed ${side}: ${what}`);
  }
  return frames;
}

function hold(claim, line) {
  if (!claim) throw new Error(line);
  say(`  ok ${line}`);
}

const a = startStand('js', ['--listen', '127.0.0.1:0', '--ward', 'A', '--class', 'Host']);
const b = startStand('rust', ['--listen', '127.0.0.1:0', '--ward', 'B', '--class', 'Host']);
const observer = createObserver();
let code = 0;

try {
  const [wardA] = await a.ready(1);
  const [wardB] = await b.ready(1);
  hold(wardA.pk !== wardB.pk, `stand: two harbors, ward A on the JavaScript kit at ${wardA.at}, ward B on the Rust kit at ${wardB.at}`);

  await bootHost(a, wardA.pk);
  await bootHost(b, wardB.pk);
  hold(true, 'boot: each ward boots a Host being under the key h');

  const invitation = await invite(a, wardA.pk, 'b');
  hold(invitation.ward === wardA.pk && invitation.heir, `invite: A's Host invites b, an invitation to ward ${short(invitation.ward)} for heir ${short(invitation.heir)}`);

  const toA = await observer.forward('A', wardA.at);
  await route(b, wardB.pk, wardA.pk, toA);
  hold(true, `route: B dials A at ${toA}, where the observer forwards every frame to A`);

  let mark = observer.frames.length;
  const knocked = await knock(b, wardB.pk, invitation);
  hold(knocked.object?.hi === 'b', `knock: B knocks with the invitation and A's Host answers ${JSON.stringify(knocked.object)}`);
  const knockFrames = crossed(observer, mark);
  hold(knockFrames.some((f) => f.kind === 'reply'), 'the knock crossed the wire sealed and a reply came back');

  mark = observer.frames.length;
  const taken = await take(b, wardB.pk, 'a', invitation).then(() => true);
  hold(taken && crossed(observer, mark).length === 0, 'take: B keeps the standing as a, and nothing crosses');

  mark = observer.frames.length;
  const asked = await askOn(b, wardB.pk, 'a');
  hold(asked.object?.hi === 'b', `ask: B asks hello on a and A's Host answers ${JSON.stringify(asked.object)}`);
  hold(crossed(observer, mark).some((f) => f.kind === 'reply'), 'the ask crossed and its answer came back');

  const stranger = await invite(a, wardA.pk, 'x');
  const forged = { ...stranger, secret: randomBytes(32).toString('hex') };
  const before = await digestOf(a, wardA.pk);
  mark = observer.frames.length;
  const refused = await knock(b, wardB.pk, forged, { wanted: 1000 });
  const strangerFrames = crossed(observer, mark);
  const after = await digestOf(a, wardA.pk);
  hold(refused.silence === true, 'a stranger: B knocks with a secret nobody gave it, and hears silence');
  hold(strangerFrames.some((f) => f.kind === 'reply') && before === after, 'the silence crossed as a reply, and A wrote nothing');

  say('every step held');
} catch (err) {
  say(`  not ok ${err.message}`);
  code = 1;
} finally {
  await Promise.all([observer.close(), a.close(), b.close()]);
}
process.exit(code);
