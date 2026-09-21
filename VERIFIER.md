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

It reaches a kit through `vectors/HARNESS.md`. Requests go over the
kit's stdin and stdout, with boxes as hex. Where the kit carries bytes,
it reaches it through the frames of `CARRIER-TCP.md` and the post and
held line of `CARRIER-WEB.md`.

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
- On the empty ask, it accepts silence and every describe, whatever its
  entries and its `lang`. It reads nothing inside `description`, an
  entry's `args`, or a field `SPEC.md` does not name.
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

It checks the ward pk against the seed. It asks for an invitation. It
checks that the heir pk is the public key of the heir secret the
invitation carries, and that the lock is an ML-KEM-768 encapsulation
key. When the invitation carries `at`, it checks that `at` is an array
of addresses. It checks that each address of a scheme a published
carrier names is written as that carrier writes it. It hands the kit
invitations whose
`at` holds a scheme no carrier names, or is not an array, and they are
still invitations.

It writes every ask itself, keeps each ask's lid secret, delivers the box
with `arrive`, and opens what comes back:

- the reply's length is its reply text plus one hundred and twelve;
- the reply opens under `quo-seal` from the lid;
- the signature is the ward's signing key over the lid, then the reply
  text;
- the reply text is one of the three shapes, and silence is the sixteen
  bytes;
- an object that answers the empty ask is a describe, on a relation and on
  the zero head. An object of any other shape there is a departure;
- the edge key that follows the reply is the one `SPEC.md` gives.

It drives each of the thirteen cases of `SPEC.md` by writing the arrival
that provokes it. Every stranger's reply has one reply text and one length.

It drives the signature check's whole failure list. An `s` at or above
the group order. An `R` that does not decode, and an `R` that is not
canonical. A public key that does not decode, and one whose y is at or
above the prime. A small-order public key in each spelling.

It drives the two signatures that list does not hold: a small-order
`R`, and a public key with a torsion component that is not
small-order. It holds that each is answered as an admitted key is.

It drives both tables of the move, and follows the door's keys as they say.

It delivers two arrivals on one relation at one moment, without waiting
for the first answer. Of two knocks on one fresh heir, one binds and the
other is a stranger's. One ask delivered twice is honoured once, and the
other hears `repeated`. A kit that judges one arrival at a time passes
both.

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

The key and edge key for an ask are those the standing moved to. After a
reply that moved nothing, they may instead be the key and edge key the
last move was asked under, which a door may still hold.

The verifier answers with a reply it writes, delivers it with `read`, and
checks what the kit says it read. It answers with objects, silence, each
of the three words, nothing, and replies that read as silence. Among
those are a reply and a word the ward signed over another ask's lid, and a
reply signed over its reply text alone. Objects that are no describe come
back to the empty ask, and the kit reads each as an object and moves on
it.

It holds the number of every ask the kit sealed, and with them the highest
the standing has moved on. It then checks, by the kit's next `ask`,
that the kit moved its signing key and its edge key when an object came
back to an ask above that highest. It checks that it moved neither when
an object came back to an ask at or below it. It runs two relations at
once, answering each ask after
the other's, and holds the kit to keeping them apart.

A kit that answers `ask` with `bad request` is judged as a door alone.

## The kit as a carrier

A kit that answers `listen`, `route` and `send` of part two of
`vectors/HARNESS.md` is judged on `CARRIER-TCP.md` and `CARRIER-WEB.md` as
well. The verifier asks for each scheme the harness names, `tcp`, `http`
and `ws`, one at a time. A scheme a kit answers with `bad request` is one
it does not stand, and the kit is judged without it. A kit that stands
none is judged without a carrier.

Every address a kit answers is taken apart as its carrier writes it. A
`tcp` address is `tcp://host:port`. An `http` or `ws` address is a URI with
a host, and with no user information and no fragment. A second `listen` of
one scheme answers the same address, and `listen` with no scheme is
`listen` of `tcp`. `listen` of `https` or `wss` is `bad request`. A
`route` to an address its scheme's carrier does not write, of a scheme the
kit stands, is `bad request`.

### As a tcp listener

The verifier dials the address `listen` answers:

- the kit writes nothing before a frame arrives, and may close an idle
  connection at any moment;
- an ask to a ward it stands comes back one of three ways. As a reply
  frame with the same id, whose box is judged as at `arrive`. As a
  nothing frame. Or not at all;
- an ask frame written one byte at a time is answered the same way, or the
  connection closes with it in flight and answers none;
- an ask frame of the largest body, 1,048,645, carries a box of the size;
- an ask frame with a ward pk and no box is a frame;
- an ask to a ward pk it does not stand comes back as a nothing frame with
  the same id;
- many asks in flight on one connection each come back once, in any order;
- after bytes that are not a frame, the kit closes the connection, and
  answers no ask written after them;
- a reply frame or a nothing frame sent to it is read, nothing is written
  back, and the connection stands;
- a whole relation runs over the line, a knock and the asks after it,
  each judged as at `arrive`. Among them stand a repeated number, a
  spent heir's knock, and a key the door does not admit.

### As a listener of the held line

The verifier opens a WebSocket to the address, offering the subprotocol
`quo`:

- the kit selects `quo`, and a handshake that selects nothing fails;
- the kit sends no message before a frame arrives;
- an ask message to a ward it stands comes back one of three ways. As a
  reply message with the same id, whose box is judged as at `arrive`.
  As a nothing message. Or not at all;
- an ask message of the largest body, 1,048,645 bytes, carries a box of the
  size, and an ask message with a ward pk and no box is a frame;
- an ask to a ward pk it does not stand comes back as a nothing message
  with the same id;
- many asks in flight on one line each come back once, in any order;
- the kit closes the line after any of six messages, and answers no
  ask sent after it. A binary message longer than 1,048,645 bytes. One
  shorter than five. One of a kind that is none of the three. An ask
  with fewer than sixty-four bytes after its id. A nothing with bytes
  after its id. A text message;
- a reply message or a nothing message sent to it is read, nothing is sent
  back, and the line stands;
- a line that offers no subprotocol carries no frame: its handshake is
  refused, or an ask on it comes back as nothing at all;
- a whole relation runs over the line, as over tcp.

### As a listener of the post

The verifier sends each ask as a `POST` to the address, its body the ward
pk and the box:

- an ask to a ward it stands comes back as status 200 with a body, the
  reply's box, judged as at `arrive`. Or it comes back as any other
  status, which is nothing;
- status 200 with an empty body is a departure;
- the `Content-Type` of the request changes nothing;
- an ask to a ward pk it does not stand comes back with a status other than
  200;
- many posts in flight each come back;
- five requests each come back with a status other than 200 and 204. A
  `GET`. A `PUT` of a whole ask. A `POST` of no body, one of sixty-four
  bytes, and one of 1,048,641 bytes;
- a `POST` of 1,048,641 bytes whose connection closes before a status
  comes back is accepted, since a listener may answer a body too long
  before it reads the whole;
- a `POST` of sixty-five bytes is an ask, and one of 1,048,640 carries a box
  of the size;
- a whole relation runs over posts, as over tcp.

### As a dialer

For each scheme the kit stands, the verifier holds a listener of its own,
and routes a far ward to it with `route`. A web listener of the verifier's
answers at an address with a path and a query, and a request to any other
path departs.

- On tcp, the kit's first bytes on a connection are an ask frame, and it
  writes only ask frames.
- On the held line, the kit offers `quo`, and sends only binary ask
  messages.
- On the post, each ask is a `POST` to the address, with a body of
  sixty-five to 1,048,640 bytes.
- The ask carries the far ward's pk, and its box is judged as at `ask`.
- On tcp and the held line, an ask frame sent to the kit is read, nothing
  comes back, and the connection stands.
- A reply, nothing, a closed connection and no answer at all each reach the
  kit, and the `read` it answers is checked. Nothing is a nothing frame on
  tcp and the held line, and any status other than 200 on the post.
- On the post, status 500, status 200 with an empty body, and status 201
  with a reply's box each read as nothing.
- A send to a ward with no route and no `at` reads nothing.
- After a second route for one far ward, no ask reaches the first address.

### The invitation's `at`

For each scheme the kit dials, the verifier mints an invitation from a
ward no route names. Its `at` is a number, then an address of a scheme
no carrier names, then an address of a listener of its own with its
scheme in capitals. A reader skips the first two and reads the scheme
in any case.

- A kit that reaches that listener is judged there as a dialer, over a
  whole relation.
- A kit that reaches nothing and reads nothing is accepted, since
  `KIT-SPEC.md` leaves reading `at` to the kit. The verifier prints whether
  the kit reached the ward through `at`, scheme by scheme.
- A kit that reaches the ward once and later reaches nothing departs, on
  one relation and across the schemes it dials.
- With a route and an `at` naming another address, the kit dials the route
  alone, and no connection reaches the address in `at`.

### Windows

An ask with no answer at all is closed at once, and a kit that waits
reads the close. Two windows remain, because a kit that writes nothing
can only be seen not to write. One is how long the verifier listens
for bytes that must not come, `QUO_VERIFIER_QUIET_MS`, 500 unless the
environment names another. The other is how long a frame is held to
arrive late, `QUO_VERIFIER_LATE_MS`, 1000 unless named. A kit's own
tests may set both near zero.

## Two kits

The verifier stands wards in one program and asks them from a ward in a
second. It runs one pass for each scheme the first program listens on and
the second dials. Two programs with no scheme in common cannot be judged
together, and the run fails.

In each pass the verifier holds a listener of its own in that scheme, and
forwards each ask to the first program's listener of the same scheme. It
holds the first ward's seed and not its lock. For every ask it forwards, it
checks the ask carries the first ward's pk and that the head opens to an
heir pk. It opens no body and no reply, and judges the rest by what the
second program reads. It checks that what the second program reads is what
the first program's `reach` answers. A forwarded post the first program
answers with any status other than 200 is nothing, and one it answers
with status 200 and an empty body departs.

Over tcp, the second program is routed to the verifier's listener. The
verifier forwards a knock and an ask as they came. Then it delivers
frames late, twice, out of order, altered and not at all, and checks
that each program answers as `SPEC.md` says. An ask delivered twice carries a number
the door has honoured. A knock delivered twice is on a spent heir. An
altered box is a stranger's. A frame not delivered is nothing.

Over the post and the held line, the second program is routed to the
verifier's listener, and a knock and an ask are forwarded as they came.

In every pass, the second program then holds an invitation from a ward no
route names, and whose `at` the verifier writes with its listener's address
alone. A second program that reaches the listener is judged over a knock
and an ask as they came. One that reaches nothing and reads nothing is
accepted, and the verifier prints whether it reached the first program
through `at`.

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
copies of one ward. What a kit draws. How long a kit waits. How many
arrivals a door judges at once, since a kit that judges one at a time
answers two sent together as it answers two sent apart.
