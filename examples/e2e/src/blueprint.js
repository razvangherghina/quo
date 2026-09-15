// `Host`'s blueprint as `quo/SCENARIOS.md` "The beings" writes it, and the
// digest by `quo/SPEC.md` "The blueprint, the digest and seen" alone:
// SHA-256, lowercase hex, over the JCS (RFC 8785) form, keys sorted by UTF-16
// code unit and numbers as ECMAScript writes them.

import crypto from 'node:crypto';

export function canonicalize(v) {
  if (v === null || v === true || v === false) return String(v);
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('not a value');
    return Object.is(v, -0) ? '0' : String(v);
  }
  if (typeof v === 'string') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonicalize).join(',')}]`;
  if (typeof v === 'object') {
    // JavaScript compares strings by UTF-16 code unit, which is JCS's order.
    const keys = Object.keys(v).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(v[k])}`).join(',')}}`;
  }
  throw new Error('not a value');
}

export function digestOf(v) {
  return crypto.createHash('sha256').update(canonicalize(v), 'utf8').digest('hex');
}

const closed = { type: 'object', properties: {}, additionalProperties: false };

// Whole, as the occupant `b` is shown it.
export const BLUEPRINT = {
  asks: [
    { name: 'hello', description: 'Answers who is asking.', input: { type: 'object' }, output: { type: 'object', properties: { hi: { type: ['string', 'null'] } }, required: ['hi'], additionalProperties: false } },
    { name: 'echo', description: 'Answers the args as they arrived.', input: { type: 'object' }, output: { type: 'object' } },
    { name: 'err', description: 'Answers an error she declares.', input: closed, output: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'], additionalProperties: false } },
    { name: 'quiet', description: 'Answers silence.', input: closed },
    { name: 'boom', description: 'Throws.', input: closed },
    { name: 'bad', description: 'Answers a word.', input: closed },
    { name: 'never', description: 'Never answers.', input: closed },
    { name: 'slow', description: 'Answers two thousand milliseconds after the ask reaches her.', input: closed, output: { type: 'object', properties: { slow: { const: true } }, required: ['slow'], additionalProperties: false } },
    { name: 'join', description: 'Mints an occupant for the asker and answers the invitation.', input: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'], additionalProperties: false }, output: { type: 'object', properties: { ward: { type: 'string' }, heir: { type: 'string' }, secret: { type: 'string' }, lock: { type: 'string' } }, required: ['ward', 'heir', 'secret', 'lock'], additionalProperties: false } },
    { name: 'shape', description: 'Sets which describe she gives from now on.', input: { type: 'object', properties: { mode: { enum: ['plain', 'extra', 'throws', 'numeric', 'field'] } }, required: ['mode'], additionalProperties: false }, output: { type: 'object', properties: { mode: { type: 'string' } }, required: ['mode'], additionalProperties: false } },
    { name: 'hidden', description: "Answers, and is written in one asker's blueprint alone.", input: closed, output: { type: 'object', properties: { hidden: { const: true } }, required: ['hidden'], additionalProperties: false } },
  ],
  notes: { '\u{1F600}': 'grin', '\u{FB33}': 'dalet', big: 1e21, small: 1e-7, third: 0.3333333333333333 },
};

// As every asker but `b` is shown it: the `hidden` entry removed.
export const SHOWN = { asks: BLUEPRINT.asks.filter((a) => a.name !== 'hidden'), notes: BLUEPRINT.notes };
