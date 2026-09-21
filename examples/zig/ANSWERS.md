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
the zero head, and every ask on it is case 4. The zero head keeps nothing:
no key, no count and no record of any box. So the same sealed bytes
presented twice are answered twice, and the second answer is written from
the arrival alone. Reason: a reach is a pure function of the arrival, so
there is nothing a second presentation could be weighed against.

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

**Question 6. How are a ward's seed and its lock handed in and held? How and when is the lock made, and how many locks does a ward hold? Does the ward keep an heir's secret after it gives the invitation?**
The seed arrives as text on `ward`. It is hashed and derived at once, and
only the derived keys are kept, in memory. The lock is made at the ward's
first `invite`, from sixty-four drawn bytes, and is held in memory for as
long as the process runs. A ward holds one lock, and every invitation it
gives carries that lock's encapsulation key. Reason: one lock is all a
door needs to open every knock, and a second would be a second key to
keep. The heir secret is not kept. The door keeps only
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

**Question 9. When does a door stop holding an heir, and what asks it to?**
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
included), the ward's signing key and padlock, and the lock. Every request
that reads an invitation reads it through one function, which holds the
lock to 2368 lowercase hex and to the modulus check of FIPS 203 section
7.2, every twelve-bit coefficient of the first 1152 bytes below q = 3329.
A lock that check refuses is no invitation, and the kit answers `bad
request` to the `ask` or `send` that hands it one.

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
Over TCP, `send` waits up to eight seconds for each address it dials,
from the moment its frame is written. After that it closes that
connection and takes the address as having delivered nothing. On the
harness's `ask` and `read`, the harness decides.

**Question 22. How does a standing number its asks, which keys does it announce and when, and how does it keep two sends on one relation apart? What does it keep of the keys it moved from, and what does it do when the asks after a move meet silence?**
The numbers count up from one, one number per ask sealed, whatever came
back. The knock announces the one key the standing ever announces, drawn at
the knock. Every ask after it announces nothing, so its `next` is `null`.
Reason: a relation with one key needs no second, and a key announced is a
key that must then be kept.

It keeps two sends on one relation apart by holding one. A relation holds
the last ask alone: its lid secret, its edge key, its signing key and its
number. Every ask replaces it, and `read` opens the reply under that ask's
lid. Sends on one relation are serial, because `stand` runs one request at
a time. So a late reply to an earlier ask does not open under the current
lid, and reads as silence.

Of the keys it moved from it keeps nothing. A move takes the key the ask
was signed with and the edge key that follows the one it was sent under.
What stood before is dropped, and the kept knock is dropped with it.
Reason: this standing is only ever the key the door holds, so an older key
would open no box.

When the asks after a move meet silence, the standing does nothing. It
moves on an object alone. Silence, a word and nothing leave the signing
key, the edge key and the highest number where they stand. The next ask
goes out under the same two keys with the next number. Reason: the door
moves on a choice too, so a refusal leaves both ends together. An object
the standing did not hear leaves it one ask behind, and the ask after it
arrives under the door's open key, which still opens.

The standing also keeps the highest number it has moved on. An object to an
ask at or below it is read and moves nothing. The one ask that can meet
that is the knock sent again, number 1, and it only moves a standing that
has not moved.

**Question 23. What does the kit tell its own code on silence, on a word, and on nothing?**
The union `Read`, with four tags: `object` (the raw object text and the
`seen` token), `silence`, `word` (one of the three strings), and `nothing`.

## What a kit carries

**Question 24. Which carriers does the kit stand, and in which forms? Does it carry them inside TLS, and with which checks? Where does it listen on the web, at which path and for which origins? With which status when it does not carry an ask?**
Quo over TCP alone, as listener and as dialer, from libc sockets, plain and
never inside TLS. It listens nowhere on the web, so no path, origin or
status is its to choose. It
stands neither form of Quo over the web: `listen` of `http` or `ws`, and a
`route` to an address of either, answer `bad request`. The listener binds
to 127.0.0.1 on a port the system chooses, and serves every accepted
connection on a thread of its own, one frame at a time. The dialer
resolves the address's host with `getaddrinfo`, so a name, an IPv4
address and a bracketed IPv6 address are all dialled, and opens one
connection per address per `send`, closed after the answer. Reason: one
carrier proves the frames, and the web's two forms would each be a second
listener and dialer that no other part of this kit uses.

**Question 25. How does the kit learn where a ward is reached? Does it write `at` in its invitations, and with which addresses? How does it try the addresses it reads, and which does it refuse to try?**
Two ways. A `route` names one `tcp` address for a far ward, and replaces
the one before. An invitation's `at` names the rest. Where a ward has a
route, `send` dials the route alone. Where it has none, `send` reads the
invitation's `at` in order and takes each string that is a
`tcp://host:port` address as `CARRIER-TCP.md` writes it.

It refuses to try four kinds of entry, and skips each where it stands. An
entry that is not a string. A string that is no URI with a scheme. A
string whose scheme is not `tcp`, this kit standing no other carrier. A
`tcp` string that `CARRIER-TCP.md` does not write, a missing port or a
path among them. The scheme is read without regard to case. An `at` that is
not an array is read as absent. None of this makes the invitation no
invitation.

The kit tries the addresses it kept one after another, the same box to
each, and stops at the first that answers with a reply. A nothing frame, a
closed connection, a refused dial or eight seconds without an answer moves
it to the next. So a box does go on to the next address after one that may
have heard it, and the door honours its number once whichever address
carried it. With no route and no
`tcp` address, nothing is delivered. Once the program holds its listener,
every invitation it gives carries `at` with that listener's one address,
`tcp://127.0.0.1:<port>`. Before then it writes no `at`. Reason: the
listener is the one place this program is reached, and trying in order
keeps the minting side's preference and sends each box to one address at
a time.

## What is not the kit's either

**Question 26. What do `method` and `args` mean?**
Nothing to the door. The reach looks only at whether `method` is present.
`echo` and `marked` return `args` as they arrived.

## What a kit reads

**Question 27. How deep, how long and how strange a JSON text does the kit read where Quo reads nothing, and what does it answer beyond that?**
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
