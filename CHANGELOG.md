# Changelog

The JavaScript kit, published as
[`@quo-systems/js`](https://www.npmjs.com/package/@quo-systems/js).

Nothing here carries a compatibility promise before 1.0.0. The wire may move,
and a version is the only safe thing to depend on.

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
