# The Zig kit

A Quo kit in Zig. Everything that crosses the wire is written from
[the constitution](../../constitution.md) alone and judged against the
pinned corpus in [`../js/vectors`](../js/vectors/README.md). Above that line —
the API a being reaches Quo through, and the host that stands roads in front of
the door — the constitution says nothing and mandates nothing, so that part is
this kit's own shape and is judged by its own suites instead.

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
  `succeed` moves the door's own name to the heir its founding committed to;
  every standing stays where it was, because each inbound row keeps the name
  its commitment was minted under.

  **One entry point takes anything a road brings.** `arrive` unseals once,
  reads the record byte itself, settles the ask an arriving answer belongs to
  or judges a say, and answers bytes or silence — so a road never opens a seal
  to route. A warden is opened rather than built, on the seeds, the clock, the
  randomness, the platform, delivery and the store its host hands it; it keeps
  what must survive a restart in that store, tells its own house why it fell
  silent on an inward channel, and holds hints without ever parsing one.

- `src/quo.zig` — the being's whole API to Quo. A being is an ordinary Zig
  struct and the dispatch is built from its own type at compile time: its
  public methods are the fields its blueprint declares, arguments arrive
  already decoded and answers leave encoded, so **the being never sees a byte
  and never touches a key**.

  The closure is `quo.At`, handed to any method that declares `*At` after
  `self` — the caller and the leash arrive as an argument, because Zig has no
  ambient scope to hide them in. On it: `caller` and `leash` as facts of the
  call, `allowance()` for the walk that may be made from here, `standings()`
  as voices only, `relation(name)` for a handle under a private label,
  `grant`, `amend` and `release`, `accept(invitation)`, `knock(card)`,
  `again(handle)`, `label(name, handle)`, and `hold(T, object, blueprint,
name)`. A being outside a call reaches the same acts through the `quo.Cell`
  it carries, whose `at()` is a walk of its own.

  **The cell is one field, declared as `_quo: quo.Cell = .{}`**, and it is the
  only thing Quo asks of a class. The underscore is why a class may declare
  any field its blueprint names: the notation's identifier is a letter then
  letters and digits, so no blueprint can spell `_quo`, and Zig — which
  refuses a struct carrying both a field and a decl of one name — is left free
  to carry a method called `quo` beside it. (A class that does declare `quo()`
  shadows a module bound to `quo` in its own scope; import the kit under
  another name there.)

  **Accepting answers handles, plural.** A standing names beings, so
  `accept` hands back a `quo.Accepted`: one handle per being the standing
  names, `of(being)` to say which is which, `only()` where it names exactly
  one. `again(handle)` reads that standing at the far door again, which is how
  a widening — nobody is told of one — is picked up. `knock(card)` stands at a
  far door as a stranger and answers a handle at its public being.

  **On every handle, beside the fields its blueprint declares**: `describe()`,
  the estate that door shows this voice; `sketch()`, this being's own;
  `blueprint(digest)`; and `limit()`. Each is an ordinary ask and answers a
  value or silence. A handle at a being under the same warden answers all four
  too, and answers them the same — except the estate, which is what the door
  holds, because under one warden there is no voice to scope it by.

  **Weather is kept apart from silence.** A road that never carried the bytes
  is not the far door's refusal, so a handle still answers nothing while the
  warden's observer is told the road's fault — `weather`, with the roads
  tried, or `no road`, where no hint offered was one this ground can speak.
  Nothing crosses the wire for it, and `accept` never retries what no road
  carried: the far door heard nothing, so the invitation is still whole.

- `src/host.zig` — the host: it opens the warden on what it is handed, stands
  roads in front of the one door, and is delivery beneath it with three rules
  and no more. **It is the only module that knows every road by name, and it
  holds no secret**: what it keeps per peer is a padlock beside the line that
  peer's asks arrive on, which is an address and the only kind of key a road
  ever sees. It also carries the two smallest things a host hands in, so that
  no ground writes them twice: seeds drawn from its own randomness, and a store
  in memory.

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

**Only the roads and the host reach a host**, and the suite asserts that
rather than observing it: nothing above them names `std.http` or `std.Io.net`
— not the warden, not the being's own API — and neither does distance zero. A
road carries bytes and judges nothing.

- `cmd/subject/main.zig` — the `subject` executable, a Quo ground another
  language can knock on and knock with. `zig build` installs it at
  `zig-out/bin/subject`, and `quo/demos/crossing` drives it as one of its
  kits, against every other.

  It is the host rather than the kit. Which roads stand, where they listen,
  how bytes get onto them, when the process draws a key and what it prints
  are all a ground's own affairs, and the modules above decline to do any of
  them. Everything above the road is theirs: the door judges, the being's own
  method answers, and the subject sorts nothing.

  It also stands below the kit's own seam and says so at its head. A harness
  drives it from another language and must be able to say things no
  application may — argument bytes it chose, an ask at a being whose blueprint
  it does not hold, a describe naming nothing — so the subject composes every
  message at the warden itself rather than through a handle. **The seam grows
  nothing to accommodate it**: `src/host.zig` is what an application stands
  on.

- `cmd/conformance/main.zig` — the `conformance` executable, this kit under
  the conformance contract: nine verbs over JSON lines, spoken to a warden
  stood up from handed keys. `zig build` installs it at
  `zig-out/bin/conformance`, and `quo/conformance` drives it beside every
  other kit's. It stands below the seam too, and for the same reason.

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

`serve -line -push` is the other half of that pair: this ground asks down a
line it accepted. A standing granted back never travels on the wire, so it is
handed to the command one JSON object per line on stdin, and each one is spent
down the connection this door accepted and never opened.

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

Twelve suites stand under `test/`, and that one command runs every one.

Six reproduce the pinned corpus, one per module that puts bytes on a wire:
`notation_test.zig`, `arithmetic_test.zig`, `wire_test.zig`,
`envelope_test.zig` and `warden_test.zig`, with `migration_test.zig` standing
three houses in one process to prove the half a single door never can.

`carriage_test.zig` and `line_test.zig` are the two roads, each with a real
listener in front of it, and they are also where the separation is asserted:
nothing above a road names `std.http` or `std.Io.net`.

`judgment_test.zig` is one suite of judgments driven over all three roads:
each case is played down every road against a house standing fresh for it, and
the three roads are asserted to have reached the same judgment before anything
is asserted about what that judgment was. A step waived on one road and not
the others is a red there rather than an absence.

`truth_warden_test.zig`, `truth_being_test.zig` and `truth_host_test.zig` are
one suite each for the three parts of the division above: what the warden
provides, what a being receives, and what the host does. The last of them
installs the same being behind every road this kit has and asserts it gives
the same answers, which is the whole reason the layers are cut where they are.

The six corpus suites read `../js/vectors/notation.json`,
`../js/vectors/arithmetic.json`, `../js/vectors/material.json`,
`../js/vectors/wire.json`, `../js/vectors/envelope.json` and
`../js/vectors/warden.json`, and reproduce every case in them. Each asserts its
own count against the corpus's, so a subset cannot pass. A refusal in the
corpus is asserted as strictly as an acceptance.
