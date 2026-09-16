# Answers to KIT-SPEC

These are this Zig kit's answers to the questions in `KIT-SPEC.md`. The
code is `src/quo.zig` (keys, values, the door, the standing), `src/tcp.zig`
(Quo over TCP) and `src/main.zig` (the `stand` program).

## What stands behind a door

**Question 1. What stands behind a door, and how does the kit hand it an arrival?**
A `Reach`, one of the four behaviours the harness names: `echo`, `marked`,
`null` and `silent`. The door hands it three things: whether the ask is
named, and the bytes of `args` as they arrived, if present. It gives back a
reply text, or null for a chosen silence. Reason: this kit exists to be
judged, and the harness names nothing else. A hook for arbitrary code would
add a second interface with no second user.

**Question 2. How is what constructed a ward reached, and can that edge be taken away?**
The `stand` program constructs every ward and holds it in one map, keyed by
the raw ward pk. What stands behind a door has no way back to it. A reach is
a pure function of the arrival. Nothing needs to be taken away because
nothing is given.

**Question 3. What answers the zero head, and does anything?**
The `reach` given on `ward`, if there is one. With no reach, nothing answers
the zero head, and every ask on it is case 4. The zero head keeps nothing.

**Question 4. How many asks does a door judge at once?**
One. One process-wide mutex covers every door, every standing, and every
listener thread. So one check is enough. Reason: correctness is simple to
see, and the harness never measures throughput.

**Question 5. What does the kit call its parts, and its relations?**
`Door` is a ward's door. `Heir` is one relation at the occupant's end.
`Standing` is one relation at the standing's end. `WardKeys` is the key
material derived from the seed. `Stand` is the harness program. The
harness's heir names are only strings in a map beside the heirs, which are
keyed by heir pk.

## What a kit keeps

**Question 6. How are a ward's seed and its lock handed in and held, how and when is the lock made, and does the ward keep a heir's secret after it gives the invitation?**
The seed arrives as text on `ward`. It is hashed and derived at once, and
only the derived keys are kept, in memory. The lock is made at the ward's
first `invite`, from sixty-four drawn bytes, and is held in memory for as
long as the process runs. The heir secret is not kept. The door keeps only
the heir pk. Reason: the relation chapter asks for no more, and keeping the
secret would let the occupant sign as its own standing.

**Question 7. Where do drawn bytes come from?**
`arc4random_buf` from libc. The kit's own tests use a fixed SplitMix64
stream instead, so their runs repeat.

**Question 8. What does a door keep for a relation, and in what?**
Per heir: the heir pk, its reach, whether it is fresh, whether it was
removed, the held key, the vouched key (optional), the open and offered
edge keys, and the highest honoured number. It is all in a hash map in
process memory. Nothing survives a restart.

**Question 9. When does a door stop holding a heir, and what asks it to?**
Only `release`. A fresh heir is forgotten entirely. A spent heir is marked
removed, and its keys become the keys kept at removal.

**Question 10. How long are keys kept at removal kept?**
For the life of the process. So a removed relation hears `removed` until
the program exits.

**Question 11. Which count numbers below the highest honoured does a door still honour?**
None. Every number at or below the highest is answered `repeated`. Reason:
this needs one integer per relation, and so no choice is ever made on a
number below the highest, the choice that moves no key.

## What a kit answers

**Question 12. Does the door answer, and when does it give nothing?**
The door always answers. Every arrival gets a reply box: a stranger's
silence, a word, or a choice. Nothing is given only by the carrier: a
nothing frame for a ward pk this program does not stand.

**Question 13. How is `seen` made, and when does it change?**
The kit does not make one. `seen` is `null`, except under the `marked`
reach, where a named ask gets `"1"` as the harness fixes.

**Question 14. What does the empty ask answer?**
Under `echo` and `marked`: the object `{}` with `seen` null. Under `null`:
the object `null`. Under `silent`: silence.

**Question 15. How is a reply text other than silence written?**
`{"object":…,"seen":…}`, in that order, with no whitespace of the kit's own.
Under `echo`, the object is the bytes of `args` exactly as they arrived,
inner whitespace included. A word is `{"quo":"…"}`.

**Question 16. Does the kit pad what it seals with whitespace, and how much?**
No. The kit writes no padding and reads any padding RFC 8259 allows.

**Question 17. Does every refusal take the same time?**
No. The door returns at the first case met, so a garbage box is answered
faster than a bad signature. The length and text of every stranger's
silence are the same.

**Question 18. What does the kit keep for its own eyes?**
Nothing. The door does not log which case refused an arrival, and the
standing does not log which rule a reply broke. Nothing is written to
stderr.

## What a kit asks

**Question 19. How does an invitation reach its holder, and does the minting kit keep a copy?**
The `invite` answer carries it, and the harness takes it from there. The
minting door keeps no copy: it keeps the heir pk and the name only. The
asking side keeps what it needs in its `Standing`, keyed by the
invitation's ward pk and heir pk. That is the heir key pair (the secret
included), the ward's signing key and padlock, and the lock. A lock that
FIPS 203's check of an encapsulation key refuses is no invitation, and the
kit answers `bad request` to the `ask` or `send` that hands it one.

**Question 20. How does a standing recover a knock that brought no object back?**
It alternates. After the knock, the next ask is sealed under the standing's
own announced key and the knock's edge key, with no ciphertext and a new
number. If that also brings no object back, the next ask sends the knock
again as the same bytes, with the same lid secret, whatever `method` and
`args` ask. The two alternate until an object comes back. There is no
timer: an ask happens only when the program is asked. Reason: the probe
succeeds when the door bound the heir, and the resend succeeds when it did
not. Only an object tells the standing which case it is in, so alternating
covers both.

**Question 21. How long does an asker wait for a reply?**
Over TCP, `send` waits up to eight seconds from the moment its frame is
written. After that it closes the connection and reads nothing. On the
harness's `ask` and `read`, the harness decides.

**Question 22. How does the kit keep two sends on one relation apart?**
It doesn't. A relation holds only the last ask. Every ask replaces it, and
`read` opens the reply under that ask's lid. Sends on one relation are
serial, because `stand` runs one request at a time. The numbers increase
with every ask, so a late reply to an earlier ask does not open under the
current lid, and reads as silence. The standing also keeps the highest
number it has moved on, and an object to an ask at or below it is read
and moves nothing. The one ask that can meet that is the knock sent again,
number 1, and it only moves a standing that has not moved.

**Question 23. What does the kit tell its own code on silence, on a word, and on nothing?**
The union `Read`, with four tags: `object` (the raw object text and the
`seen` token), `silence`, `word` (one of the three strings), and `nothing`.

## What a kit carries

**Question 24. Which carriers does the kit stand?**
Quo over TCP only, over IPv4, from libc sockets. The listener binds to
127.0.0.1 on a port the system chooses, and serves every accepted
connection on a thread of its own, one frame at a time. The dialer opens
one connection per `send` and closes it after the answer.

**Question 25. How does the kit learn where a ward is reached?**
Only through `route`: a map from a far ward pk to `host:port`, with the
host written as a dotted IPv4 address or `localhost`. A ward with no route
is not asked, and `send` reads nothing.

## What is not the kit's either

**Question 26. What do `method` and `args` mean?**
Nothing to the door. The reach looks only at whether `method` is present.
`echo` and `marked` return `args` as they arrived.

## What a kit reads

**Question 27. How deep, how long and how strange a JSON text does the kit read inside `args` and `object`, and what does it answer beyond that?**
Any depth and any length the size allows. The kit reads into nodes only the
outer object of a payload or a reply text (and two levels of a harness
line). Inside `args` and `object` it holds the text to the RFC 8259 grammar
with a loop and a stack of brackets, not recursion, so depth costs one byte
of heap per level. Numbers are carried as written, whatever their size.
Lone surrogates, noncharacters and repeated keys there are taken and
carried as written. A lone surrogate escape in a key the kit does read is
kept as its own three bytes, so two different lone surrogates are two
names. One choice beyond that: `echo` and `marked` answer silence, a
choice that moves the keys, to `args` whose own keys repeat a name. The
standing reads any `object` it is given, repeated keys included, and hands
it back as written with the whitespace between tokens taken out. Reason:
the kit reads nothing it does not use, and a bound it does not need is a
bound it would have to answer for.
