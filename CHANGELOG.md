# Changelog

**All five kits, at one version, released together.** A kit out of step is a
mistake rather than a choice, so this file covers them all: JavaScript as
[`@quo-systems/js`](https://www.npmjs.com/package/@quo-systems/js), Go as the
module `quo.systems/kit`, Python as `quo-systems` on PyPI, Rust as the
`quo-*` crates, and Zig as a release asset with its hash.

Entries before 0.2.0 covered the JavaScript kit alone.

Nothing here carries a compatibility promise before 1.0.0. The wire may move,
and a version is the only safe thing to depend on.

## 0.4.0

**Breaking, in JavaScript and Python: the kit's own names move behind `_quo`.**
A blueprint's identifier is a letter then letters and digits (Article IV), so
no blueprint in any language can spell a leading underscore. That is where the
kit's own names now live, and the plain namespace belongs to the blueprint
alone on both sides of the seam.

**What to change.** `object.quo` becomes `object._quo`, and on a handle
`handle.being`, `handle.seal`, `handle.send`, `handle.describe`, `handle.sketch`,
`handle.blueprint`, `handle.limit`, `handle.moved`, `handle.text`,
`handle.digest` and `handle.declares` become `handle._quo.<name>`. Everything a
handle exposes directly is now exactly the fields the blueprint declares.

**Why it could not stay a guarded list.** Both kits kept one, and both were
written from the attributes that kit happened to have: JavaScript guarded seven
names and missed `being`, Python guarded four and missed seven. A list also
rots — the next fact a kit gains silently eats a field somebody already
declared. Three failures were watched before the fix: a class declaring `quo()`
had its own method overwritten and answered **silence**, which no caller can
tell from a refusal; a class declaring `being()` killed the whole handle at
`accept`; and Python's seven failed as `'str' object is not callable`, naming
nothing.

**Zig moves too, on the being side only** — the cell is `_quo`, so a class
declaring `quo()` compiles. **Go and Rust are unchanged**: both reach a declared
field by string and keep the handle's own facts as methods, so the two
namespaces never touched.

**No wire behaviour changes.** Not a byte of the envelope, the judgment or the
records moves; conformance drives all five kits to the same bytes as before.
This is the shape a kit offers its own language, which the law leaves to each
kit — and which four kits had got wrong in four different ways.

## 0.3.1

**A peer that missed a migration's news is no longer stranded.** A handle
that meets silence at a being asks the far door `moved`, hands the word it
gets back to its own warden through the same path news takes — the same
commitment the row already holds, the same mark — and the row is rehoused.
Both doors of a migration point, so the handle follows both words to the new
house. The ask that met the move stays silence, as every ask at a departed
being is; the next reaches. No new wire behaviour: `moved` was always a field
the door answers, and the word was always the news's bytes.

**Two defects it found.** The Python origin could never answer `moved` after
a departure, because its reach test asked whether the being was still held.
The Zig origin answered `moved` with an empty road where the destination's
should be, because the word's hints were borrowed from the call that composed
them. Neither was visible to conformance, which had only ever asked `moved`
at the destination. The departure scenario now asks it at the origin too, and
asks an ordinary field there and pins the silence.

## 0.3.0

**Every kit has the same three-layer shape, and a being's seam is complete.**
The warden is road-agnostic and never byte-agnostic; a road hands every frame
to the warden's one entry point and never opens a seal; the being is a plain
class handed a closure; the host stands roads, hands in the seeds, the clock
and the store, and does delivery. This release is the five kits brought level
on that shape, with the leftovers of the older one gone.

**What a being can do at a handle grew.** Accepting an invitation answers one
handle per being the standing names, so a standing that opens two beings, or
one widened later, is reachable by its holder — before, every kit collapsed
it to the first being it found. A being may knock at a card and be shown what
that door shows a stranger. And every handle carries the four introspections
the door answers — `describe`, `sketch`, `blueprint` and `limit` — as
ordinary asks, so a being that could invoke a field can also learn what
fields exist without composing an envelope by hand. Nothing on the wire moved
for any of it.

**The warden is the only editor of its records, in every kit.** Zig's being
layer had been removing outbound rows itself; Rust shipped a second delivery
inside its core crate; Python's host stood its in-process road twice and
never retracted a closed road's hints; Go carried a second entry point beside
`Arrive` and handed out its padlock secret. All gone. Each kit's conformance
subject now states, at its head, why it stands below the seam and what it
composes that no application may.

**Every README describes the kit that exists**, with examples run against the
tree before they were written down: the being's closure, the host, the roads.

## 0.2.0

**The first release of all five kits together, and the first with every
article of the law accounted for by a running case.**

**Twenty silences are ruled and in the constitution.** A silence is a place
where two strangers implementing from the law alone would produce different
bytes. Five of the twenty were live disagreements between the two kits already
published — the same text, honestly read, running differently. Each ruling is
a sentence in the constitution now, so the fork is closed for anyone reading
it rather than for us alone.

**The conformance lane.** One scenario file is driven through every kit with
the clock and the randomness handed in, and both the envelope bytes and the
warden's resulting record are pinned. A corpus proves bytes and cannot prove a
judgment; this proves the judgment, because a decision leaves a record and the
record travels as a cargo. Sixteen scenarios, and all 149 obligations the law
carries are either driven or named with the reason they cannot be.

**Ten defects it found, none of which any kit's own tests could see.** Every
one sat behind a capability nothing exercised. The two worth naming: a peer
verified a being's succession against the _house's_ commitment rather than the
being's, so whoever held a house's heir key could have taken over every being
at it; and two kits let a stranger spend `receive`, a door anyone could push a
being into. Both are closed.

**What each kit gained.** Rust and Zig can now widen and narrow a standing at
the warden — before, a host reached in and edited the record, which is the
ambient permission Quo exists to refuse. Zig's warden answers its own being's
fields instead of leaving that to its host. Python composes an onward ask under
a real budget. Go's arriving beings answer. And Rust, Python and Zig can now
migrate a being away, not only receive one.

**All five order a cargo's lists**, so two kits packing one being agree on the
bytes because the law says so rather than by coincidence.

## 0.1.1

The kit as the other four kits speak it. The package published at 0.1.0
predates the corpus re-pin and disagrees with every other kit on the warden's
own blueprint digest, so a stranger installing two of them got two protocols.
Nothing in the source moved for this release that had not already moved; this
is the published bytes catching up with the tree.

**The re-pin.** A blueprint carries `standing.name` as b32 and `relation.news`
as an int, so the warden's blueprint digest is now
`c6e6574d0d2c246a00a10920934eca77acfabec923df4d86fc9fae84d326ebcb`. The
pinned corpus every kit ships carries the same fact, and all five kits derive
it.

**A caller takes the road it can speak**, choosing between the carriage and
the line from what the far house published rather than from what the near one
prefers.

**The warden offers the verified caller inward, per call**, so a resolver can
ask whose seal it is answering without identity travelling as a parameter.
A being reads the standings held at it, never who called.

**A subject can push down a line it accepted**, and stand in the middle of a
chain rather than only at its end.

**The old door answers only moved**, and an empty hint never erases the way
back — the way back is refreshed after the seq rather than before it.

## 0.1.0

The line, the record byte, and the leash. Nothing here is compatible with
0.0.3 on the wire: an envelope sealed by the older kit is refused by this one,
and the other way around.

**A second road, behind `./line`.** Framed envelopes over one persistent TCP
connection, standing beside the HTTP carriage rather than replacing it. Both
ends of a held line may send, so a house that dialled out can be reached
afterwards by the house it called — which is what lets a ground behind a
firewall be spoken to at all. The Go kit carries the same road, and the two
kits speak it to each other in both directions.

**Every signed payload now names its record.** One byte in front of the
encoded record, covered by the signature, so an ask can never be read as an
answer or the reverse — on a held line the two arrive the same way, and
position decides nothing. `SAY`, `ANSWER`, `tagged`, `untag` and `kindOf` are
exported for anyone building their own carriage.

**An answer is judged.** A reply carries its own signed record and is checked
before it is believed, rather than trusted because it arrived on the
connection the ask went out on.

**A road declares its own size limit.** The largest message a door accepts
defaults to 16,384 bytes; a road that accepts more says so with `?cap=` in the
hint it publishes, and a sender refuses an over-cap message in its own kit
instead of putting it on the wire.

**`Leash` — what one call may hand to the next door.** A being handling a
message asks its leash what it may spend onward: the hop count falls by one
and the time budget falls by however long this door actually took. A budget
that ran out mid-work is refused here exactly as it would have been at the
door, so no house beneath can widen the allowance it was given.

**A door tells its warden where it ended up.** `serve` now publishes the
address the warden should hand out, and takes a `hint` for the ordinary case
where the socket is not the address — behind a proxy or a tunnel the door
listens on loopback while the world reaches it by a domain.

**Renamed:** `Warden.reference` is `Warden.handle`. "Standing" is the only
word for a voice's right to reach a being; "reference" is gone.

**Fixed:** a door served fields a being's blueprint did not declare, and the
kit read its clock too early when handing a message onward, charging the
dwell to the wrong side.

The vector corpus is regenerated against all of it, and the Go kit is
published as its own module at `quo.systems/kit`.

## 0.0.3

- The kit is published from CI with npm provenance, so the package links back
  to the commit and the build that produced it.
- Ships `NOTICE`, and declares `repository`, `bugs` and `sideEffects`.
- The constitution and both kits are published together at
  [github.com/razvangherghina/quo](https://github.com/razvangherghina/quo).
- The corpus cites the constitution at its published address, so the
  provenance resolves for everyone who receives the vectors rather than only
  inside the tree that emits them.
- The bench runs on Node 20, the oldest version the kit claims. It did not
  before: the test script quoted its glob, and Node's own runner only learned
  to expand one in 22.

0.0.2 was never published.

## 0.0.1

First publish. The canonical blueprint notation, the wire encoding of the
closed types, the arithmetic, the envelope, the warden and the carriage, with
the listening door behind its own `./door` export. Zero dependencies. Ships the
vector corpus the kit is judged against.
