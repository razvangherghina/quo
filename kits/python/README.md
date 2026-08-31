# The Quo kit in Python

Written from [the constitution](../../constitution.md) alone and judged
against the pinned corpus in [`../js/vectors`](../js/vectors). Today it
carries a core of five modules and the two roads.

- **`quo.notation`** — Article IV. A blueprint's canonical text, its SHA-256
  digest, and every text the notation refuses.
- **`quo.arithmetic`** — Article VI. Ed25519 signs, X25519 seals, SHA-256
  commits, AES-256-GCM encrypts under a key derived through HKDF-SHA-256.
- **`quo.wire`** — Article V. The byte encoding of every closed type.
- **`quo.envelope`** — Article XI. The sealed box and the two records inside it.
- **`quo.warden`** — Articles IX and XII. The door, and the judgment in order.

And the roads, which are not the core:

- **`quo.carriage`** — Article III. The common carriage: one POST, bytes in
  and bytes out. The only module that imports `http`.
- **`quo.line`** — Article III. Framed envelopes over one persistent TCP
  connection. The only module that imports `socket`.

Importing `quo` gives the core and pulls in no host; a road is asked for by
name, and `tests/test_roads.py` asserts that rather than trusting a reader to
keep noticing it.

One third-party import, and it is the whole of it: PyCA
[`cryptography`](https://cryptography.io/), which carries Ed25519, X25519,
AES-256-GCM and HKDF. SHA-256 still comes from `hashlib`, because a primitive
the platform holds is taken from the platform. The core imports no host:
nothing from `socket`, `http` or `asyncio`.

## What it needs

Python 3.11 or newer. The kit is developed and tested on CPython 3.13, pinned
in `.python-version`, with the dependency resolved by the committed
`uv.lock`.

## The interface

```python
from quo import notation

notation.parse(text)        # -> Blueprint, or raises NotationError
notation.render(blueprint)  # -> the canonical text
notation.canonical(text)    # -> the canonical bytes, UTF-8
notation.digest(text)       # -> 32 bytes, the blueprint's identity
```

A text is canonical or it is refused. There is no repair: `parse` reads the
text, then writes the blueprint back and requires the two to be the same
bytes, so a trailing space or a second blank line is a refusal rather than
something quietly dropped.

```python
from quo import arithmetic

arithmetic.digest(data)                     # -> 32 bytes
arithmetic.commitment(warden, heir)         # -> 32 bytes
arithmetic.signing_public(secret)           # -> the Ed25519 pk of that seed
arithmetic.sign(secret, message)            # -> 64 bytes
arithmetic.verify(voice, message, sig)      # -> bool
arithmetic.sealing_public(secret)           # -> the X25519 pk of that key
arithmetic.agree(secret, public)            # -> 32 bytes, or ArithmeticError
arithmetic.derive(shared)                   # -> (32-byte key, 12-byte nonce)
arithmetic.seal(shared, additional, plain)  # -> ciphertext then 16-byte tag
arithmetic.unseal(shared, additional, box)  # -> plaintext, or ArithmeticError
```

A key is 32 bytes; anything else is refused before an algorithm sees it. No
function here mints a key — every draw of randomness is taken as an argument.
`verify` answers false rather than raising, because a signature that does not
stand is an ordinary answer; a seal that does not open is an
`ArithmeticError`. So is a dead agreement — one handing back thirty-two zero
bytes is refused at the point of agreement, said as this module's own refusal
rather than as whatever `cryptography` raised underneath.

```python
from quo import carriage, line

carriage.post(hint, message)            # -> the sealed answer, or b"" for silence
carriage.Door(handle, limit=...)        # one POST in, one body out

line.parse_hint("tcp://host:9000")      # -> Road(host, port, cap, declared)
line.frame(envelope, cap)               # -> the length, then the envelope bytes
line.dial(hint).send(envelope)          # the dialing end publishes nothing
line.Listener(handle, cap=...)          # the listening end, and its hint
```

The default cap is 16,384 bytes, which a bare `tcp://` hint promises; a door
with a different appetite declares it with `?cap=` and a dialer reads it before
connecting. An over-cap send is refused in the sender's own kit. On a line
silence has no wire form — a refused ask puts no frame out — and only a framing
fault ends the connection, without a word.

## The tests

With [uv](https://docs.astral.sh/uv/), from this directory:

```
uv run --frozen --python 3.13 python -m unittest discover -s tests -t tests -v
```

Every vector in `../js/vectors/notation.json` is reproduced — six accepted
texts asserted on both their canonical bytes and their digest, and
twenty-eight refusals asserted as strictly as the acceptances. So is every
vector in `arithmetic.json`, all sixteen, with the case count asserted
against the file. `material.json` carries no vectors: instead every one of
its twenty keys is accounted for, each derived from its own secret or named
as a root the file does not derive.
