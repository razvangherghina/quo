// The fuzzer of `SCENARIOS.md` "How the world is built": a story drawn from a
// seed instead of written by hand. The seed draws a sequence of root and
// harbor actions, invite, knock, take, ask, remove, drop a reply, restart,
// and the same sequence is told in both directions. After every step the
// driver writes down what a stranger to both kits can compare: the answer
// B's being heard, the standing she holds, and the lengths of the frames
// that crossed. The two directions write the same list, or a sentence of
// the spec reads two ways, and the seed tells the story again.

import { exchanges } from './observer.js';
import { splitmix64 } from './stream.js';
import { withWorld } from './world.js';

const METHODS = ['hello', 'echo', 'err', 'quiet', 'boom', 'bad', 'shape'];
const ACTIONS = ['invite', 'knock', 'take', 'ask', 'ask', 'ask', 'remove occupant', 'remove standing', 'drop', 'restart', 'standing'];

// A draw below `n`, from the seed's stream.
const below = (draw, n) => draw(4).readUInt32LE() % n;

// The steps a seed draws, the same list whichever kit stands where. Each
// names indexes into what the story holds, so both directions read one plan.
export function plan(seed, length) {
  const draw = splitmix64(seed);
  return Array.from({ length }, () => {
    const action = ACTIONS[below(draw, ACTIONS.length)];
    return { action, pick: below(draw, 1 << 16), method: METHODS[below(draw, METHODS.length)] };
  });
}

// What an answer on the root channel says, in terms both kits share: an
// object is kept whole, a word and silence as they came, and nothing else.
function answerOf(answer) {
  if (!answer) return { nothing: true };
  if ('object' in answer) return { object: answer.object };
  if (answer.silence) return { silence: true };
  return { quo: answer.quo };
}

// Tells one plan with `doorKit` standing A and `askerKit` standing B, and
// answers the list of what each step showed.
export function tell(steps, { doorKit, askerKit }) {
  return withWorld({ doorKit, askerKit }, async ({ door, asker, a, b, observer }) => {
    const invitations = [];
    const standings = [];
    const seen = [];
    const request = (stand, ward, method, args) => stand.request({ ward, method, ...(args ? { args } : {}) });
    const pickOf = (list, pick) => (list.length ? list[pick % list.length] : null);

    for (const [i, step] of steps.entries()) {
      const from = observer.frames.length;
      let shown;
      switch (step.action) {
        case 'invite': {
          const id = `o${i}`;
          const answer = await request(door, a.pk, 'invite', { being: 'h', id });
          if (answer.object?.invitation) invitations.push({ id, invitation: answer.object.invitation });
          shown = { invited: Boolean(answer.object?.invitation) };
          break;
        }
        case 'knock': {
          const chosen = pickOf(invitations, step.pick);
          shown = chosen ? answerOf(await request(asker, b.pk, 'knock', { being: 'h', invitation: chosen.invitation, method: 'hello', wanted: 1000 })) : { none: true };
          break;
        }
        case 'take': {
          const chosen = pickOf(invitations, step.pick);
          if (!chosen) {
            shown = { none: true };
            break;
          }
          const id = `s${i}`;
          const answer = await request(asker, b.pk, 'take', { being: 'h', id, invitation: chosen.invitation });
          if (answer.object?.taken === id) standings.push(id);
          shown = answerOf(answer);
          break;
        }
        case 'ask':
        case 'drop': {
          const id = pickOf(standings, step.pick);
          if (!id) {
            shown = { none: true };
            break;
          }
          if (step.action === 'drop') await request(door, a.pk, 'drop', { replies: 1 });
          const args = step.method === 'shape' ? { mode: ['plain', 'extra'][step.pick % 2] } : step.method === 'echo' ? { v: step.pick } : undefined;
          shown = answerOf(await request(asker, b.pk, 'ask', { being: 'h', id, method: step.method, ...(args ? { args } : {}), wanted: 1000 }));
          // A drop is spent on this ask alone. An ask that never reached the
          // door leaves it outstanding, and a count of zero cancels it, so a
          // later step never meets a drop it did not arm.
          if (step.action === 'drop') await request(door, a.pk, 'drop', { replies: 0 });
          break;
        }
        case 'remove occupant': {
          const chosen = pickOf(invitations, step.pick);
          shown = chosen ? answerOf(await request(door, a.pk, 'remove', { being: 'h', id: chosen.id })) : { none: true };
          break;
        }
        case 'remove standing': {
          const id = pickOf(standings, step.pick);
          shown = id ? answerOf(await request(asker, b.pk, 'remove', { being: 'h', id })) : { none: true };
          break;
        }
        case 'restart': {
          await request(door, a.pk, 'stop');
          shown = { stood: Boolean((await request(door, a.pk, 'stand', {})).object?.stood) };
          break;
        }
        case 'standing': {
          const id = pickOf(standings, step.pick);
          shown = id ? answerOf(await request(asker, b.pk, 'standing', { being: 'h', id })) : { none: true };
          break;
        }
      }
      const crossed = exchanges(observer.frames, 'door', from).map((e) => (e.nothing ? 'nothing' : e.reply ? e.reply.box.length : 'none'));
      seen.push({ step: i, action: step.action, method: step.method, shown, replies: crossed });
    }
    return seen;
  });
}
