// A relation the hand holds at a kit's door, `SPEC.md` "Keys" and "The
// edge keys" read from her side, with every key in plain view: `held` is the
// key she signs with now, `edge` the edge key she sends under now, `open` the
// edge key the last ask answered with an object came under, and `seq` the
// last number she spent. She moves `held` to the key she announced, and
// `edge` to the key that follows, only when an object comes back, unless an
// ask says otherwise. Every choice a line makes against the rule is an
// argument: the signer, `by`, `next`, the number, the edge key.

import { mintKey } from './hand.js';

export class Relation {
  // `dialer` is a `dial()` to the door's listener, `wardPk` its pk.
  constructor(dialer, wardPk, invitation) {
    Object.assign(this, { dialer, wardPk, invitation, heir: invitation.heir });
    this.heirKey = mintKey(invitation.secret, invitation.lock);
    this.held = this.heirKey;
    this.edge = null;
    this.open = null;
    this.seq = 0;
  }

  // The payload of one ask: `to` the heir, `by` the signer, `next` a fresh
  // key unless named (a key, or null), the next number unless named,
  // `time` 1000, `method` hello, `args` {}. `method: null` or `args: null`
  // leaves the field out.
  payload(signer, { next, seq, time = 1000, method = 'hello', args = {}, by, to } = {}) {
    const p = { to: to === undefined ? this.heir : to, by: by ?? signer.signPk, next: next === null ? null : next.signPk, seq, time };
    if (method !== null) p.method = method;
    if (args !== null) p.args = args;
    return p;
  }

  // Knocks as the heir, announcing a fresh key unless `next` names one.
  knock(opts = {}) {
    return this.ask({ sign: this.heirKey, ...opts });
  }

  // Signs with `sign` (the held key unless named) and sends under `edge`
  // (the edge key she holds unless named). `track: false` leaves her keys
  // and edge where they stand whatever comes back. Answers what `dial.ask`
  // answers, with `next`, the key announced.
  async ask({ sign = this.held, next = mintKey(), seq, edge, track = true, ms = 3000, ...fields } = {}) {
    const number = seq ?? this.seq + 1;
    if (typeof number === 'number' && number > this.seq) this.seq = number;
    const payload = this.payload(sign, { next, seq: number, ...fields });
    // A key holding the invitation's lock and signing for its own heir knocks,
    // and the knock's edge key is hers from the moment she seals it.
    const knocks = Boolean(sign.lock) && payload.to === sign.signPk;
    const got = await this.dialer.ask(this.wardPk, sign, payload, { ms, edge: knocks ? undefined : (edge ?? this.edge ?? undefined) });
    if (knocks && track) this.edge = got.edge;
    if (track && got.reply && 'object' in got.reply) {
      this.open = got.edge;
      this.edge = got.follows;
      if (next) this.held = next;
    }
    return { ...got, next, payload };
  }
}
