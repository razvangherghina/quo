// The two beings of the vectors' world. A being is an ordinary class: it is
// constructed with the stance, and the ward calls one method on it, answer.
// It imports nothing: silence is `Symbol.for('quo.silence')`, and a word is a
// frozen object whose one key is `Symbol.for('quo.word')`.

const SILENCE = Symbol.for('quo.silence');
const word = (name) => Object.freeze({ [Symbol.for('quo.word')]: name });
const shown = (...names) => ({ asks: names.map((name) => ({ name, input: { type: 'object' } })), notes: {} });

export class Host {
  constructor(stance) {
    this.stance = stance;
  }

  answer(asker, method) {
    switch (method) {
      case undefined:
        return shown('hello', 'err', 'nul', 'quiet', 'boom', 'bad', 'never');
      case 'hello':
        return { hi: asker.id ?? null };
      case 'err':
        return { error: 'nope' };
      case 'nul':
        return null;
      case 'quiet':
        return SILENCE;
      case 'boom':
        throw new Error('boom');
      case 'bad':
        return word('removed');
      // Not in her describe, so the blueprint every record hashes is unmoved.
      case 'huge':
        return { blob: 'x'.repeat(1 << 20) };
      case 'never':
        return new Promise(() => {});
      default:
        return SILENCE;
    }
  }
}

export class Caller {
  constructor(stance) {
    this.stance = stance;
  }

  answer(asker, method) {
    if (method === undefined) return shown('hi');
    return method === 'hi' ? { hi: true } : SILENCE;
  }
}
