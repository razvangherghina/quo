# The Zig kit

A Quo kit in Zig, written from
[the constitution](../../constitution.md) alone and judged against the
pinned corpus in [`../js/vectors`](../js/vectors/README.md).

## The Zig version

**0.16.0.** Zig's standard library still moves between releases, so a kit
that does not name the version it compiles against is a claim nobody can
check. `build.zig.zon` states the same version as its minimum.

## No dependency

`build.zig.zon` declares no dependency and never will. Zig's `std.crypto`
carries all five primitives the law names, so the kit stands on its
platform's own crypto and nothing else — a kit a stranger reimplements must
be readable whole.

## What is here

- `src/notation.zig` — the notation: a blueprint's grammar, its canonical
  text and its SHA-256 digest. Article IV of the constitution is the whole
  specification.
- `src/arithmetic.zig` — the four algorithms: Ed25519 signs, X25519 seals,
  SHA-256 commits, and AES-256-GCM encrypts under a key derived through
  HKDF-SHA-256 with a fixed label. Article VI is the whole specification.
  Two named refusals stand in front of the platform: a voice that is all
  zeros or one of the eight small-order points is silence before any
  signature is examined, and an agreement that hands back thirty-two zero
  bytes is refused at the point of agreement — that second one `std.crypto`
  refuses itself, so the kit says it once and the bench watches it happen.
- `src/wire.zig` — the byte encoding of the closed types: both combinators,
  records, and the bytes a decoder must refuse. Article V is the whole
  specification. A value's shape is never on the wire, so every read and
  every write is driven by the type the blueprint declares.

- `src/envelope.zig` — the sealed letter and its two faces: the `say` and the
  `answer`, the byte that names which one a payload carries, the signature
  that is the last sixty-four bytes inside the seal, and the ephemeral public
  key that is the only thing outside it. Article XI is the whole
  specification. It is the first module that composes the three above it.

- `src/warden.zig` — the door's judgment: the one blueprint every warden
  holds and its digest, the three describes and the derived order of an
  estate, the two records, the seq window and the leash, and the eight steps
  in their order. Articles VII, VIII, IX, X and XII are its specification.
  The warden is never the road: a letter arrives as bytes and a verdict goes
  back as a routing decision the ground carries out. `succeed` moves the
  door's own name to the heir its founding committed to; every standing stays
  where it was, because each inbound row keeps the name its commitment was
  minted under.

  **And the caller side, because a kit that can only answer a call is half a
  kit.** `remember` keeps an invitation as a relation, `ask` composes one
  utterance, `rotate` composes one signed by the heir and moves the keys under
  the same act, and `hear` opens what comes back. `accept` is those composed:
  it spends an invitation whole in two rotate-and-asks, so no caller can
  forget the second one — and the raw path stays open, because a helper that
  is the only way to do a thing is not a helper. Every draw of randomness is
  an argument here too, and the road is a callback rather than a socket.

- `src/carriage.zig` — the common carriage: HTTPS, the one road every warden
  answers. One POST to the hint exactly as given, bytes in and bytes out; an
  empty body is silence's wire form, and no status code, header or verb
  carries meaning above it.
- `src/line.zig` — the line: framed envelopes over one persistent TCP
  connection. A frame is a length written the way the wire writes an `int`
  and then that many envelope bytes; the cap is 16,384 unless the hint says
  otherwise, and only a framing fault ends a connection.
- `src/zero.zig` — distance zero, where the carriage is a call: two houses in
  one device or one process handing envelope bytes as bytes. There is no
  hint, no scheme and no frame, because no wire exists to disagree about.
  **Distance zero waives no step of the judgment**, so this module judges
  nothing and unseals nothing, exactly like the other two.

**The first two are the only modules in the kit that reach a host**, and the
suite asserts that rather than observing it: no core module names `std.http`
or `std.Io.net`, and neither does distance zero. A road carries bytes and
judges nothing.

`test/judgment_test.zig` is one suite of judgments driven over all three
roads: each case is played down every road against a house standing fresh
for it, and the three roads are asserted to have reached the same judgment
before anything is asserted about what that judgment was. A step waived on
one road and not the others is a red there rather than an absence.

- `cmd/subject/main.zig` — the `subject` executable, a Quo ground another
  language can knock on and knock with. `zig build` installs it at
  `zig-out/bin/subject`, and `quo/demos/crossing` drives it as one of the
  three kits.

  It is the host rather than the kit. Minting an invitation, keeping the
  caller's own records, composing an ask, drawing randomness and running an
  accept loop are all a ground's own affairs, and the modules above decline
  to do any of them.

## The subject

Two modes.

**serve** hangs a door, holds one granted being, mints an invitation and
prints one line of plain facts — the five things a holder holds and the road
to reach them at. It does not name the being: a stranger rotates, describes,
and finds what it now reaches.

**speak** takes another door's facts the same way and sends it a real
message. `-being`, `-method` and `-args` say what to ask; `-blueprint`
fetches the text of every class the describe named.

Either mode runs over the line instead of the common carriage when given
`-line`, and nothing above the road changes. Speaking over a line, `-hold`
also holds a being of its own and grants the far ground a standing at it, so
the ground it dialled can ask down the connection it never opened.

`speak -zero` takes no facts, because at distance zero there is nobody to be
handed any: it stands both houses in this one process, mints the far one's
invitation itself and prints it as the same facts line a door prints, then
speaks across at distance zero. Nothing above the road changes, and the far
house spends all eight steps.

Every line it prints on stdout is one JSON object carrying `quo`. The facts
line is JSON because a hint is an opaque string the protocol never parses,
and a space-separated line cannot carry one that holds a space.

## Running the suite

```
zig build test
```

It reads `../js/vectors/notation.json`, `../js/vectors/arithmetic.json`,
`../js/vectors/material.json`, `../js/vectors/wire.json`,
`../js/vectors/envelope.json` and `../js/vectors/warden.json`, and reproduces every case in them. Each suite
asserts its own count against the corpus's, so a subset cannot pass. A
refusal in the corpus is asserted as strictly as an acceptance.
