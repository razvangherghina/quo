// The beings of `quo/SCENARIOS.md` "The beings", written here over the kit
// and never inside it. Each class is constructed with the stance the kit
// hands her (`quo/KIT-SPEC.md`, chapter 4 #4) and answers her own asks by it
// alone. `stanceOf` below is a harness-only hook: it lets `stand.js` reach a
// being's own stance (`invite`, `knock`, `take`, `ask`, `remove`, `boot`,
// `cells`, `standings`) directly, since the root channel's per-being verbs
// (section 2 of `HARNESS.md`) are the being's own calls and not the ward's
// fused root ask.

const SILENCE = Symbol.for('quo.silence');
const WORD = Symbol.for('quo.word');
const word = (name) => Object.freeze({ [WORD]: name });

const ROOT_ID = 'ROOT';
const rootString = 'ROOT';

const plainAsks = () => [
  { name: 'hello', description: 'Answers who is asking.', input: { type: 'object' }, output: { type: 'object', properties: { hi: { type: ['string', 'null'] } }, required: ['hi'], additionalProperties: false } },
  { name: 'echo', description: 'Answers the args as they arrived.', input: { type: 'object' }, output: { type: 'object' } },
  { name: 'err', description: 'Answers an error she declares.', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'], additionalProperties: false } },
  { name: 'quiet', description: 'Answers silence.', input: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'boom', description: 'Throws.', input: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'bad', description: 'Answers a word.', input: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'never', description: 'Never answers.', input: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'slow', description: 'Answers two thousand milliseconds after the ask reaches her.', input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'object', properties: { slow: { const: true } }, required: ['slow'], additionalProperties: false } },  { name: 'join', description: 'Mints an occupant for the asker and answers the invitation.', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output: { type: 'object', properties: { ward: { type: 'string' }, heir: { type: 'string' }, secret: { type: 'string' }, lock: { type: 'string' } }, required: ['ward', 'heir', 'secret', 'lock'], additionalProperties: false } },
  { name: 'shape', description: 'Sets which describe she gives from now on.', input: { type: 'object', properties: { mode: { enum: ['plain', 'extra', 'throws', 'numeric', 'field'] } }, required: ['mode'], additionalProperties: false }, output: { type: 'object', properties: { mode: { type: 'string' } }, required: ['mode'], additionalProperties: false } },
  { name: 'hidden', description: "Answers, and is written in one asker's blueprint alone.", input: { type: 'object', properties: {}, additionalProperties: false }, output: { type: 'object', properties: { hidden: { const: true } }, required: ['hidden'], additionalProperties: false } },
];

const NOTES = { '\u{1F600}': 'grin', '\u{FB33}': 'dalet', big: 1e21, small: 1e-7, third: 0.3333333333333333 };

function shapedAsks(mode) {
  const asks = plainAsks();
  if (mode === 'extra') asks.push({ name: 'extra', input: {} });
  if (mode === 'numeric') asks[0] = { ...asks[0], name: 1 };
  return asks;
}


export class Host {
  constructor(stance) {
    this.stance = stance;
    // `describe` is the cell `shape` writes; it survives a restart because
    // it is read from the cells and never from instance state alone.
  }

  askerId(asker) {
    return Object.hasOwn(asker, 'id') ? asker.id : undefined;
  }

  blueprintFor(asker) {
    const mode = this.stance.cells.describe ?? 'plain';
    if (mode === 'throws') throw new Error('describe throws');
    const id = this.askerId(asker);
    const asks = shapedAsks(mode).filter((a) => id === 'b' || a.name !== 'hidden');
    if (mode === 'field') return { asks, notes: NOTES, mood: 'fine' };
    return { asks, notes: NOTES };
  }

  async answer(asker, method, args) {
    const id = this.askerId(asker);
    switch (method) {
      case undefined:
        return this.blueprintFor(asker);
      case 'hello':
        return { hi: id === ROOT_ID ? rootString : (id ?? null) };
      case 'echo': {
        const value = args && typeof args === 'object' ? args : {};
        this.stance.cells.echoed = value;
        return { ...value };
      }
      case 'err':
        return { error: 'nope' };
      case 'quiet':
        return SILENCE;
      case 'boom':
        throw new Error('boom');
      case 'bad':
        return word('absent');
      case 'never':
        return new Promise(() => {});
      case 'slow':
        return new Promise((resolve) => setTimeout(() => resolve({ slow: true }), 2000));
      case 'huge':
        return { blob: 'x'.repeat(1_048_576) };
      case 'join': {
        const invites = this.stance.cells.invitations ?? {};
        if (Object.hasOwn(invites, args.id)) return invites[args.id];
        const invitation = await this.stance.invite(args.id, {});
        this.stance.cells.invitations = { ...invites, [args.id]: invitation };
        return invitation;
      }
      case 'shape':
        this.stance.cells.describe = args.mode;
        return { mode: args.mode };
      case 'hidden':
        return { hidden: true };
      default:
        return SILENCE;
    }
  }
}

export class Caller {
  constructor(stance) {
    this.stance = stance;
  }

  async answer(asker, method, args) {
    if (method === undefined) {
      return {
        asks: [
          {
            name: 'hi',
            description: 'Asks hello on the standing a and answers what came.',
            input: { type: 'object', properties: { time: { type: 'integer', minimum: 1 } }, additionalProperties: false },
            output: { type: 'object', properties: { got: { type: ['object', 'null'] }, quo: { type: ['string', 'null'] } }, required: ['got', 'quo'], additionalProperties: false },
          },
        ],
        notes: {},
      };
    }
    if (method !== 'hi') return SILENCE;
    const time = Number.isInteger(args.time) && args.time >= 1 ? args.time : 1000;
    const reply = await this.stance.ask('a', 'hello', {}, { time });
    if (reply === SILENCE) return { got: null, quo: null };
    if (reply && typeof reply === 'object' && reply[WORD]) return { got: null, quo: reply[WORD] };
    return { got: reply, quo: null };
  }
}

// She throws while she is made: her constructor throws, so the ward's
// `make` catches it and her door says `absent`.
export class Stillborn {
  constructor() {
    throw new Error('stillborn');
  }

  // Never reached: the constructor above always throws first.
  answer() {
    return SILENCE;
  }
}
