export class Refusal extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'Refusal';
    this.code = code;
  }
}

// A road that never carried the bytes: a connection refused, a name that does
// not resolve, a line that dropped. It said neither an answer nor silence, so
// the kit reports the road's fault (Article III) rather than inventing one.
// Weather spends no number at the far door, because the far door never heard.
// `tried` is the roads that were actually tried and broke — never one walked
// past because nobody here could speak it.
export class Weather extends Error {
  constructor(tried, cause) {
    super('weather: no road carried the bytes');
    this.name = 'Weather';
    this.tried = [...tried];
    if (cause !== undefined) this.cause = cause;
  }
}

// No road at all: every hint offered was one this ground cannot speak, and
// there was no line to fall back to. Nothing was sent, so no door heard and no
// road broke — neither silence nor weather (Article III), and reported apart.
export class NoRoad extends Error {
  constructor(hints) {
    super('no road: none of the hints offered is one this ground can speak');
    this.name = 'NoRoad';
    this.hints = [...hints];
  }
}

export function refuse(code, detail) {
  throw new Refusal(code, detail);
}
