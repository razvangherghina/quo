# The verifier

The verifier is a method, offered beside Quo. It is not Quo, and it is not
the way to build a kit. It says where a kit departs from `SPEC.md`, and
nothing else. It is necessary to show a kit departs from nothing, and it is
never enough to show a kit is good, useful or finished.

A kit that answers every arrival with silence, or with nothing, departs
from nothing and passes. The verifier reports how many arrivals it could
judge, and a count is never a failure.

The verifier prints one line per check and a summary. It exits `0` when
no check failed, and `1` when a check failed or it was run wrongly.

## What the verifier holds

The verifier holds the six algorithms and `SPEC.md`. It holds no kit, and
no bytes any kit produced.

It reaches a kit through `vectors/HARNESS.md`: requests over the kit's stdin
and stdout, with boxes as hex, and, where the kit carries bytes, the frames
of `CARRIER-TCP.md`.

It holds that seam as well as Quo. It drives every error `HARNESS.md` names,
and holds the kit to that vocabulary and to the order in which two errors
are answered. It holds a kit to exiting `0` when its stdin closes, and to
writing nothing on its stdout but the answers `HARNESS.md` names.

## What the verifier refuses

The verifier refuses a kit only where `SPEC.md` fixes the bytes. It accepts
every answer to every question `KIT-SPEC.md` asks.

- On a count number below the highest a door has honoured, it accepts an
  object, silence and `repeated`, and holds that none of them moves a key.
- On a delivered ask, it accepts a reply and nothing.
- On `seen`, it accepts any string and `null`, except where a `reach` of the
  harness fixes it.
- A reply text other than silence it parses, and never compares byte for
  byte.
- The bytes a kit draws are the kit's. The verifier reads none of them
  except through what `SPEC.md` makes visible.

## Checking, not comparing

The verifier takes bytes apart under `SPEC.md`. A check that holds for every
correct box holds for a kit whatever it draws.

The sixteen bytes of silence are the one thing it compares, because `SPEC.md`
fixes them. Nothing else a kit wrote is held against stored bytes.

## The kit as a door

The verifier stands a ward from a seed it chooses, and derives from that
seed the signing key and the padlock. It holds the padlock's secret.

It checks the ward pk against the seed. It asks for an invitation, and
checks that the heir pk is the public key of the heir secret the
invitation carries, and that the lock is an ML-KEM-768 encapsulation key.

It writes every ask itself, keeps each ask's lid secret, delivers the box
with `arrive`, and opens what comes back:

- the reply's length is its reply text plus one hundred and twelve;
- the reply opens under `quo-seal` from the lid;
- the signature is the ward's signing key over the reply text;
- the reply text is one of the three shapes, and silence is the sixteen
  bytes;
- the edge key that follows the reply is the one `SPEC.md` gives.

It drives each of the thirteen cases of `SPEC.md` by writing the arrival
that provokes it. Every stranger's reply has one reply text and one length.

It drives the signature check's whole failure list: an `s` at or above the
group order, an `R` that does not decode, an `R` that is not canonical, a
public key that does not decode, a public key whose y is at or above the
prime, and a small-order public key in each spelling. It drives the two
signatures that list does not hold, a small-order `R` and a public key with
a torsion component that is not small-order, and holds that each is answered
as an admitted key is.

It drives both tables of the move, and follows the door's keys as they say.

## The kit as an asker

The verifier stands its own ward, mints an invitation, and hands it to the
kit with `ask`. It takes apart the box the kit sealed, as the kit's door
would:

- on a knock, the ciphertext decapsulates under the verifier's lock, and
  the box is its payload plus 1,248;
- otherwise the box is its payload plus one hundred and sixty;
- the head opens under `quo-seal` to the heir pk;
- the body opens under `quo-edge-seal` over the agreement and the edge key
  `SPEC.md` gives for that ask;
- the payload is well formed, and signed by `by` over the bytes as sent;
- `by` is the key the relation admits, and `next` is read as `SPEC.md`
  reads it.

The verifier answers with a reply it writes, delivers it with `read`, and
checks what the kit says it read. It answers with objects, silence, each
of the three words, nothing, and replies that read as silence.

It holds the number of every ask the kit sealed, and with them the highest
the standing has moved on. It then checks, by the kit's next `ask`, that the
kit moved its signing key and its edge key when an object came back to an ask
above that highest, and that it moved neither when an object came back to an
ask at or below it. It runs two relations at once, answering each ask after
the other's, and holds the kit to keeping them apart.

A kit that answers `ask` with `bad request` is judged as a door alone.

## The kit as a carrier

A kit that answers `listen`, `route` and `send` of part two of
`vectors/HARNESS.md` is judged on `CARRIER-TCP.md` as well. A kit that
answers them with `bad request` is judged without a carrier.

As a listener, the verifier dials the address `listen` answers:

- the kit writes nothing before a frame arrives, and may close an idle
  connection at any moment;
- an ask to a ward it stands comes back as a reply frame with the same id,
  whose box is judged as at `arrive`, or as a nothing frame, or not at all;
- an ask frame written one byte at a time is answered the same way, or the
  connection closes with it in flight and answers none;
- an ask frame of the largest body, 1,048,645, carries a box of the size;
- an ask to a ward pk it does not stand comes back as a nothing frame with
  the same id;
- many asks in flight on one connection each come back once, in any order;
- after bytes that are not a frame, the kit closes the connection;
- a reply frame or a nothing frame sent to it is read, nothing is written
  back, and the connection stands;
- a whole relation runs over the line, a knock and the asks after it, each
  judged as at `arrive`, with a repeated number, a spent heir's knock and a
  key the door does not admit among them.

As a dialer, the verifier holds a listener of its own, and routes a far
ward to it with `route`:

- on `send`, the kit's first bytes on the connection are an ask frame;
- the frame carries the far ward's pk, and its box is judged as at `ask`;
- a reply frame, a nothing frame, a closed connection and no answer at all
  each reach the kit, and the `read` it answers is checked;
- a nothing frame and a closed connection read as nothing.

An ask with no answer at all is closed at once, and a kit that waits
reads the close. Two windows remain, because a kit that writes nothing
can only be seen not to write: how long the verifier listens for bytes
that must not come, `QUO_VERIFIER_QUIET_MS`, 500 unless the environment
names another, and how long a frame is held to arrive late,
`QUO_VERIFIER_LATE_MS`, 1000 unless named. A kit's own tests may set
both near zero.

## Two kits

The verifier stands a ward in one program, routes a far ward of a second
program to a listener of its own, and forwards each frame to the first
program. It holds the first ward's seed and not its lock. For every ask it
forwards, it checks the frame carries the first ward's pk and that the head
opens to an heir pk. It opens no body and no reply, and judges the rest by
what the second program reads.

It checks that what the second program reads is what the first program's
`reach` answers. It then delivers frames late, twice, out of order, altered
and not at all, and checks that each program answers as `SPEC.md` says. An
ask delivered twice carries a number the door has honoured. A knock
delivered twice is on a spent heir. An altered box is a stranger's. A frame
not delivered is nothing.

## Vectors

A vector is one precomputed case a kit checks itself against without
running the verifier. A vector is a convenience and is not the authority.

`vectors/arithmetic.json` is the one file of vectors. It pins the six
algorithms, each record taken from the standard that publishes it or built
on one and saying how. The verifier's own tests replay every record.

## What no check derives

The six HKDF labels, `quo-seal`, `quo-edge-seal`, `quo-lock`, `quo-edge`,
`quo-ward-sign` and `quo-ward-seal`, are the ASCII bytes of those names.
Every HKDF-SHA-256 call takes the zero-length salt of RFC 5869. The fixed
sizes stand as `SPEC.md` writes them. These stand on the text alone.

## What the verifier does not see

Whatever a kit keeps, and how it keeps it, across a restart or across two
copies of one ward. What a kit draws. How long a kit waits. What a door
does with two arrivals on one relation at one moment, since no request of
the harness makes it judge two at once.
