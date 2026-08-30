export class Refusal extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'Refusal';
    this.code = code;
  }
}

export function refuse(code, detail) {
  throw new Refusal(code, detail);
}
