# HARNESS

This is test tooling beside the protocol, offered as a method. It is not
Quo, and it is not the way to build a kit. A kit that answers none of it
still speaks Quo. Every term `SPEC.md` defines is used as `SPEC.md` defines
it. Every other term is defined where it is introduced. Nothing here adds a
byte to a box or a field to a payload.

Part one is what a kit answers to be judged without a carrier. Part two is
what a kit answers to be judged with its bytes carried, to the verifier or
to another kit.

## Part one: judged

A kit under the verifier is one executable, named `stand`. It reads
requests on its stdin and writes answers on its stdout. In part one no
listener is opened and no socket is used. Boxes cross this channel as hex.

The verifier judges a kit twice. As a door, through `arrive`. As an asker,
through `ask` and `read`. A kit that has no asking side answers `ask` with
`bad request`, and is judged as a door alone.

### The channel

Both directions are UTF-8. One JSON value is one line. A line ends with
`\n`, and `\r` is not part of a line. No value carries a newline inside it.
Answers come in any order, and `id` says which request each answers.

```
request = { id, op, ... }
answer  = { id, ... } | { id, error: <string> }
```

`id` is minted by the verifier, a string, unique among the requests in
flight. `op` is a string, one of the requests this document names.

An error is one of these strings and no other:

```
no such op     op is none this document names
bad request    a line that is no JSON object, a field missing, null or of the
               wrong type, hex that is not lowercase hex of the right length,
               an invitation that is not one, or a request the kit does not
               serve
ward stood     a ward with that ward pk already stands
no such ward   ward names no ward this program stands
name held      heir names an heir this ward already holds
not reached    reach names nothing the kit provides
```

A line with no `id`, or an `id` that is not a string, is answered `bad
request` with `id` set to `null`. An empty line is skipped. A channel line
is plain JSON, and the value rules of `SPEC.md` do not apply to it.

Where two errors apply, the first in this order is the answer: `bad
request`, `no such op`, `no such ward`, `not reached`, `ward stood`, `name
held`.

`stand` runs until its stdin closes, and then exits. Exit `0` is a run that
read its stdin to the end. Exit `1` is a run that could not start.

Nothing else is written on stdout. What a kit writes for its own eyes goes
on stderr.

### The six requests

```
{ id, op: "ward",    seed, reach? }               { id, ward: <128 hex> }
{ id, op: "invite",  ward, heir, reach? }         { id, invitation }
{ id, op: "release", ward, heir }                 { id, released: <string> | null }
{ id, op: "arrive",  ward, box }                  { id, reply: <hex> | null }
{ id, op: "ask",     ward, invitation, method?, args? }
                                                  { id, box: <hex> }
{ id, op: "read",    ward, invitation, reply }    { id, read }
```

**`ward`** stands a ward from `seed`. `seed` is text, taken as `SPEC.md`
takes a seed that is not thirty-two bytes. It is hashed whatever its
length. The answer is that ward's ward pk.

In every other request, `ward` is the 128 hex ward pk of a ward this
program stands.

**`invite`** holds a new heir of that ward under the name `heir`, a string
the verifier chooses, and answers the invitation of `SPEC.md`. A released
name may be invited again, and names a new heir.

**`release`** makes that ward stop holding the heir named `heir`. It
answers that name, or `null` where the ward holds no heir of that name.

**`arrive`** delivers `box`, an ask's box as hex, to that ward's door. The
answer is the reply's box as hex, or `null` where the door gives back
nothing.

**`ask`** makes that ward ask, as a standing, on the relation `invitation`
names. The first `ask` on an invitation is a knock. `method` absent is the
empty ask. `args` absent is the empty object. The answer is the box the kit
sealed, as hex. The kit chooses every key it announces and every count
number it sends. After a knock that brought no object back, a kit may
answer `ask` on that invitation with the knock it sent before. It
answers with the same bytes, whatever `method` and `args` ask.

**`read`** hands that ward `reply`, the reply's box as hex, or `null` for
nothing, as the answer to its last `ask` on that invitation. The answer
`read` is what the kit read:

```
{ object, seen }     an object came back
{ silence: true }    silence came back
{ quo: word }        a word came back
{ nothing: true }    nothing came back
```

`object` is the value the kit read, and `seen` the `seen` it read.

### What answers behind a door

`reach` names what answers behind that door. How a kit provides it is the
kit's own. The verifier sends these four and no other:

```
echo     a named ask: the object is the bytes of `args` exactly as they
         arrived, or silence where the kit does not read that `args`.
         the empty ask: the object is the describe {"asks":[]}.
         seen is null.
marked   as echo, and on every ask seen is the string "1", the empty
         ask included.
null     a named ask: the object is null. seen is null.
         the empty ask: as echo.
silent   every ask: silence.
```

A `reach` that is none of the four, and that the kit does not provide, is
answered `not reached`.

`reach` on `ward` names what answers the zero head at that ward. With no
`reach` on `ward`, nothing answers the zero head there, and an ask on the
zero head is case 4 of `SPEC.md`. `reach` on `invite` names what answers
asks on that heir. With no `reach` on `invite`, it is `echo`.

## Part two: carried

Part two is part one, and three requests more, for a kit that carries its
bytes over `CARRIER-TCP.md` or `CARRIER-WEB.md`. A kit that carries no
bytes answers each of the three with `bad request`, and is judged by part
one alone.

An address here is an address of `SPEC.md`, written as the carrier its
scheme names writes it. A scheme is `tcp`, `http` or `ws`. A kit stands a
scheme when it carries bytes in that scheme's carrier. `http` and `ws`
stand for `https` and `wss` as well, since the harness runs no TLS.
`listen` of `https` or `wss` is `bad request`. Whether `route` takes
`https` and `wss` is the kit's.

### The three requests

```
{ id, op: "listen", scheme? }                      { id, at: <address> }
{ id, op: "route",  far, at }                      { id, routed: <128 hex> }
{ id, op: "send",   ward, invitation, method?, args? }
                                                   { id, read }
```

**`listen`** makes the program hold one listener of `scheme`, `tcp` when
absent, on a loopback address it chooses, and answer on it for every ward
it stands. The answer is that listener's address. A second `listen` of one
scheme answers the same address. A scheme the kit does not stand is `bad
request`.

**`invite`**, once the program holds a listener, may write that
listener's address, or any of its listeners' addresses, in the
invitation's `at`.

**`route`** tells the program that the ward whose 128 hex ward pk is `far`
is reached at `at`, one address. A second `route` for one `far` replaces
the first. An `at` that is not an address, as the carrier of its scheme
writes one, of a scheme the kit stands is `bad request`. `far` names a
ward anywhere, and is not held to `no such ward`.

**`send`** makes that ward ask, as a standing, on the relation
`invitation` names, and carry the box to the ward the invitation names.
Where that ward has a route, the kit dials the route alone. Where it has
none, a kit that reads `at` dials the addresses in the invitation's `at`,
as it tries them, and a kit that does not read `at` delivers nothing.
With neither, the ask is not delivered. The first `send` on an
invitation is a knock. The answer `read` is what the kit read, as in part
one. How long the kit waits is its own, and `{ nothing: true }` is the
answer when nothing came back.

### Between two kits

The verifier stands a ward in one program and asks from a ward in another.
It holds no kit. It routes the asking program's far ward to an address
of its own, or hands it an invitation whose `at` names that address.
It forwards the frames to the answering program's listener.
Standing between them, it may deliver a frame as it came, late, twice, out
of order, altered, or not at all. No kit implements any of that.

### What the harness does not reach

How a kit keeps what it keeps, across a restart or across two copies of
one ward, is the kit's own, as `KIT-SPEC.md` asks. The harness names no
partition, no restart and no copy. A door that forgets its relations
departs from nothing.
