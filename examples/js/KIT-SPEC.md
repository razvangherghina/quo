# KIT-SPEC

This is `KIT-SPEC.md`, every choice the spec leaves open, answered for
this kit in the template's own order, chapter by chapter and number by
number, so the two are read side by side. Every answer is this kit's choice
and carries its reason, and another kit choosing otherwise is still Quo.

## The vision

This kit is one reading of the spec in JavaScript, the least a kit can be
and still keep every sentence of it. It is written to be read beside the
spec and to prove that the text is enough, so it owes faithfulness to every
sentence and nothing a deployment would need. `package.json` marks it
private and lists one dependency, `@noble/post-quantum` pinned at an exact
version and used for ML-KEM-768 alone, because Node's own modules hold no
KEM. Everything else runs on Node's own modules, with no build step and one
memory harbor, because a reader should need nothing but the spec and Node.

`src/` holds one concept of the spec per file, each importing only the files
above it, so a reader meets each word before the file that uses it:

```
arithmetic.js  the six algorithms, WebCrypto and ML-KEM-768, and the four refusals of verification
value.js       the value rule, the strict reader, JCS and the digest, silence and the words
seal.js        the ward key, the lock, the two boxes and the knock's, the edge keys, the body, the size
count.js       the count: mark, spent, span
keys.js        admission, the door's move, the edge keys it tries and moves, what a removal leaves
door.js        the thirteen cases and the law of one silence
partition.js   the partition's shape and the ids a being mints
sender.js      her side: knock, take, ask, the line, the lost knock, reading a reply
stance.js      cells, and the six calls a being is handed
ward.js        birth, restart, boot and the root
harbor.js      the memory harbor and the platform's random
frame.js       the reference carrier's frames
tcp.js         listen and dial over node:net
```

Beside `src/` stand two folders that are not the kit. `test/` replays the
arithmetic, framing and tcp vector files and holds the checks a stranger
cannot make. Its fixtures stand under `test/fixtures/`: the vectors' beings
in `beings.js`, SplitMix64 in `splitmix64.js`, and the vector reader in
`vectors.js`. `harness/` is the stand program of `HARNESS.md`, an
adapter over the kit with its own beings and its own tests. Both stay
outside `src/` because nothing of a test or a harness is reachable from a
harbor that is not in it.

Names are the spec's words where the spec has one: `SIZE`, `ZERO_EDGE_KEY`,
`random`, `removed`, `relations`, `by`. A reader who meets a name the spec
does not use has to translate, and translation is where two readings part.

## From chapter 3, the door

### 1. Which base64 bytes travel as

None. Nothing here encodes or decodes base64, because the only bytes turned
into text are keys and digests, and the spec writes those as lowercase hex.

### 2. Does this ward stand a public being

One or none. `partition.public` holds her key or null, set by the root's
`public { key }`, which refuses a key not booted, or a second while one
stands, because the spec allows one public being and no more.

### 3. How long a door keeps a removed heir's keys

Sixty-four heirs, `REMOVED_BOUND` in `src/keys.js`, oldest evicted first by
`removeHeir`. The bound matches the count's span so one number serves for
two, and a stranger cannot grow it past that by asking. A heir that never
spoke leaves nothing and takes no place among them, because the spec keeps
nothing for it.

### 4. The default allowance and the ceiling

Thirty seconds and five minutes, `DEFAULT_TIME` and `CEILING_TIME` in
`src/sender.js`. `wanted.time` is clamped to the ceiling and anything else is
the default, because every wait must end and a being may ask for less.

### 5. What is held beside the mark

An array. Each heir's record holds `mark` and `spent`, filtered by `spend` in
`src/count.js` to what is above `mark - 64`, so at most sixty-three stand in
it. An array of numbers is a value, so it lives in the partition as it is,
and it is the plainest shape a reader checks against the span.

### 6. How a blueprint is hashed

`canonical` in `src/value.js` writes JCS by recursion, and `digest` is
SHA-256 of its UTF-8 bytes as hex. Keys sort by `Array.prototype.sort`,
which compares UTF-16 code units, and numbers are written by
`JSON.stringify`, which writes them as ECMAScript does. Both places where
RFC 8785 parts languages are this language's own defaults, so no code
stands between the spec's rule and what runs.

### 7. What is kept when a reply is none of the three shapes

Nothing. `readReply` in `src/sender.js` gives `null` for it, and the being
meets silence with no note of which rule the reply broke, because a kit
with no logging has nobody to tell.

### 8. Whether the door equalizes the time of its refusals

No. `door.js` refuses as early as each case allows: it opens the body only
under the edge keys the head names, and verifies a signature only once the
case before it has passed. Evening the time would add work a reader must
skip to find the thirteen cases, and what it costs is what the spec says:
only a holder of an invitation learns by timing what state its heir is in.

## From chapter 4, the stance

### 1. How the stance is spelled

One plain object handed to a being's constructor by `stanceOf` in
`src/stance.js`, carrying `cells`, `standings` and the six calls, each a
closure bound to her. A plain object is how JavaScript hands anything over,
and a closure keeps her key out of her reach.

### 2. How she is handed her cells

A plain object of the partition behind a Proxy built by `guard`. A
non-value throws a `TypeError` in her frame, the guard reaches down and
counts the depth, and values are copied in. A Proxy is the one place a write
can be refused where she wrote it, which is where the spec puts the refusal.

### 3. How she is handed her standings

Through a read-only Proxy, `shown` in `src/stance.js`, over
`partition.beings[key].standings`, one record per id, `{ id, digest,
blueprint, seen }`. A write, a delete or a new record throws in her frame,
because they are her ward's records and her ward compares her digest to
what the far door says. No `partition.relations` is in reach, so she never
touches a key.

### 4. How the six calls are spelled

`invite(id, notes)` answers the invitation or null, `notes` absent being no
notes; `remove(id)` answers nothing; `knock(invitation, method, args,
wanted)` and `ask(id, method, args, wanted)` answer her object, silence or
a word, `wanted` being `{ time }`; `take(id, invitation)` and `boot(class,
key, id)` answer the id or the key, or null. Each takes its arguments in the
order the spec names them, so a reader maps each call to its sentence.

`invite` answers `{ ward, heir, secret, lock }`, drawing the ward's lock into
`partition.lock` first when it holds none, because the spec draws the lock
before the first heir secret.

`knock` is a knock whatever she already holds. An untaken knock is held per
ward and heir together with the secret it was knocked under and the edge
key it speaks under, the knock's own from the moment `askBox` seals it,
which `take` moves into the standing. A knock under another secret starts
afresh, so a refused secret leaves nothing that a right one would sign
under. A knock with an invitation she already took knocks as the heir, and
the far door, whose heir died as it spoke, meets it with silence: a knock is
one thing and never an ask in disguise.

A knock that may have been heard with no object back, one that ran late, met
silence or met `threw`, leaves the knock unsure. The next knock sends under
her own key and the knock's edge key first, with no ciphertext, and knocks
as the heir again when that key hears silence, because a silence tells her
nothing. The knock again goes under the same m, kept on the record as
`m`, so the edge key she holds is the one the door holds whichever knock it
heard.

### 5. How the asker's three shapes are spelled

An occupant is `{ id }`, nobody is `{}` with no `id`, and the root is
`{ id: 'ROOT' }`, copied fresh every call so a being cannot mark one for the
next. `asker.id ?? null` is then the whole test, and a being who wants to
know the root reads one reserved id.

### 6. Which ids the kit reserves

Three, `RESERVED` in `src/partition.js`, refused at invite and take and never
at the write: `ROOT`, because it is the root's asker id and an occupant of
that id would be read as the root; `then`, because it would make her
standings a thenable; and `__proto__`, because it is no ordinary key of an
object.

### 7. What the ward can be asked by its root

Six asks, `ROOT_ASKS` in `src/ward.js`, with JSON Schema inputs and empty
notes, learned by the empty ask as any being's are.

- `boot { key, class }` answers `{ booted }`, a being with no relation,
  because the root is no being and holds no standing.
- `public { key }` answers `{ public }`.
- `invite { being, id, notes? }` answers the invitation.
- `knock { being, id, invitation, method?, args?, wanted? }` answers
  `{ taken, answer }`, knocking and taking at once, because a knock the root
  does not take is a relation nobody holds.
- `remove { being, id }` answers `{ removed }`, the id or null.
- `ask { being, method?, args?, wanted? }` asks the being `being` names, the
  public being included, as the root, and answers her object or silence. The
  root speaks as the root and never as nobody, because the spec gives the
  root its own shape, and a throw inside is silence, because the spec says
  so of the unsealed ask.

Every refusal is one object, `{ error: <string> }`, and never a null or a
throw, so that a refusal is told apart from an answer by its shape, as
`HARNESS.md` section 2 answers one: `key taken`, `no such class`,
`threw at birth`, `not booted`, `a public being stands`, `no such being`,
`id taken`, `unreached`, `late`, `unknown ask`, or the word or `silence`
a root knock met.

### 8. What the asks are by which one ward pilots another

There are none. A relation reaches only what the far being answers under her
own method names, so a ward driving this one holds a standing at such a
being, and nothing is named that the spec leaves unnamed.

### 9. How two asks are inside one being at once

They simply are. `dispatch` awaits her answer and nothing serialises the
calls, because the spec says her ward adds no serialisation of its own.

### 10. What holds the line of one relation

`inLine` in `src/sender.js`, a promise chain keyed by being and relation. The
allowance races the whole turn, so an ask waiting when it rings is never
sent, an ask that waited carries in `time` only what it has left, and `take`
waits too. The bound sits where the line is held and not where she waits,
because the spec names that as the way a quiet far side closes a relation.

### 11. How a being names what she boots

`boot(class, key, id)`: the class the harbor holds, the key the new being
lives under, and the id the maker's own standing at her carries. These are
the three things the spec says she chooses, in its order.

### 12. How an ask between two beings of one ward travels

Through the seal and the door: `send` hands an ask for this ward's own pk to
its own door in process and never to the carrier. It is sealed as any ask
is, because one path for every ask is one path to read. A box above the size
is refused before it is sealed and is `unreached`, since no door reads it.

### 13. Who invites at boot, and which ids are named

The one made invites and the maker knocks and takes: her occupant id is the
maker's key and the standing id is the one passed to `boot`. The relation
then runs from maker to made, which is what lets the maker ask what she
made, and the maker's key is already one id unique in the ward.

### 14. How a restart hands her cells again

At the end of `createWard` every being whose record names a class is made
again by `make`, unasked, over the cells that stood. Birth and restart are
one call, so she cannot tell them apart.

## From chapter 5, the ground

### 1. What the harbor is

`MemoryHarbor` in `src/harbor.js`, built with `{ classes, random }`, whose
`boot(seed, partition)` answers `{ pk, door, ask }` and keeps the door by pk
to carry bytes between the wards it booted. Memory is the one storage that
needs no code a reader must skip.

### 2. How the seed is handed in and held

As the first argument to `boot`, any string or bytes. `seedBytes` takes
thirty-two bytes as the seed and SHA-256's the rest, as the spec does, and
custody is the caller's, because the harbor keeps nothing past the process.

### 3. The shape of the partition, and whether it is sealed

A plain object of values, `emptyPartition` in `src/partition.js`, handed to
every `boot`, with six fields:

- `beings`, what is hers: class, cells, standings and occupants by key;
- `relations`, what is the ward's: by key, the keys, edge keys and counts of
  her standings and her untaken knocks, and the heir of each occupant;
- `heirs`, from heir pk to the door's view of the relation: the two signing
  keys, `held` and `vouched`, and the two edge keys, `open` and `offered`,
  as 64 hex or null, with the mark and the spent numbers;
- `removed`, the heirs removed after they spoke, with the keys they kept;
- `public`, a key or null;
- `lock`, the sixty-four bytes the lock is made from, d then z as 128 hex,
  or null before the first invite.

Each is a value, so the partition is written as JSON with no encoding step.
The lock's key pair is derived by `lockKeys` in `src/seal.js` wherever it is
used and never stored, because the sixty-four bytes are the whole of it. The
guard hands out `beings` alone, so no being reaches a key. Nothing is sealed,
since this harbor puts the partition nowhere.

### 4. How one seed holds one run

Nothing holds it. `boot` may be called twice with one seed, and runs that
write apart diverge in silence, because the spec names that cost and a guard
against it would be storage this kit has none of.

### 5. How a being is instantiated

`MemoryHarbor` answers `new this.#classes[cls](stance)` for a name it holds
and `null` otherwise. A throw at birth is caught by the ward and her door
says `absent`, because the spec puts that judgment in the ward.

### 6. Where the random comes from

From the harbor, a count in and that many bytes out. `random` in
`src/harbor.js` is the platform's `crypto.getRandomValues`, because it is
the one source Node and a browser share. `splitmix64` in `test/fixtures/`
is the records' stream and no part of the kit.

### 7. Which carriers stand beside the reference one

None. The TCP carrier of `src/tcp.js` is the only one, because one carrier
is enough to reach another kit.

### 8. How the door tells its harbor what was kept

It does not. The door answers `{ bytes, heard }` and nothing about storage,
because this harbor keeps nothing and so nothing here says yes to what was
never kept. A keeping harbor would add that bit.

### 9. How the harbor rates a ward key

It does not. `heard`, the one bit beside the bytes, is answered and
`MemoryHarbor` reads it not at all, because it has nobody to defend against.

## From chapter 6, the reference carrier

### 1. How a dialer learns which address stands a ward

Not from this kit. `dial({ host, port })` is handed both by whoever calls
it, and `listen({ host, port, carry })` answers the host and port it stands
on, because the spec leaves the address to what two parties already share.

### 2. Which port, and how many connections

No port is named: `listen` holds the host and port its caller hands it, and
`dial` holds one connection until closed, every ask in flight on it at once,
because the spec lets one connection carry them all. It never reconnects: an
ask on a connection already gone never leaves and is nothing at once, since
nothing was delivered.

### 3. How the dialer mints frame ids

A counter, from one, wrapping at thirty-two bits, which is what the frame's
field holds. It is unique in flight because no connection holds four billion
asks.

## From chapter 8, what a stranger can observe

### 1. What the conformance suite holds beyond the vectors

The three things a stranger cannot see, under `test/`, each held where the
chapter it belongs to is tested.

- The door corpus is replayed by `verifier/` over `harness/stand.js`,
  which compares the bytes and whether the ward wrote. The `heard` bit is
  held in `ward.test.js` and `wire.test.js`, and what a reply opens to in
  `sender.test.js`.
- `value.test.js`: the value rule and JCS.
- `keys.test.js`: the count's window, a mark of one hundred honouring
  thirty-seven and refusing thirty-six and itself, and the door's move.
- `sender.test.js`: the lock drawn once and kept across a restart, an
  invitation without a lock, the knock box and its 1248 bytes, a tampered
  ciphertext, two knocks racing, the lost knock both ways, a knock with a
  taken invitation, the size, the time left, her ward's four words, the
  strict reading of a reply and its depth of sixty-five, whitespace read
  inside a signed payload, a throw that spends the number and rotates the
  door's keys while hers stand, and the edge seal from both sides.
- `stance.test.js`: the six calls as she is handed them, her cells, her
  standings read only, a boot or a restart from her side, and the root
  speaking as the root.
- `ward.test.js`: her side moving only when an object came back, a describe
  that throws or falls silent costing the digest alone, and the root
  refusing with an object and never a null.
- `wire.test.js`: a listener and a dialer over loopback.

### 2. The kit's partition digest, and the harness

There is none. The partition is a value, so equality of its JSON text is
what Quo asks of a digest. `harness/stand.js` answers `digest` with that
text, and `verifier/` compares it before and after each arrival of the door
corpus.

The harness that replays a record is `harness/stand.js`: one executable over
the kit's own `createWard` and `tcp.js`, speaking the root channel of
`HARNESS.md` section 2 on stdin and stdout, drawing from the fixed stream of
section 6 when told to, and reading and writing the partition file of
section 5, the one place anything here touches a disk. Its beings are
`harness/beings.js`, and `harness/test/` proves it against the harness paper
alone. It changes nothing of the kit, because the channel's names bind the
adapter and never the kit.

## What this kit leaves out

- No persistent harbor, so no `wrote` bit read and no storage failure.
- No carrier beside TCP, since one is enough to reach another kit.
- No retry, no backoff, no connection pool; retry is the being's to build.
- No rate limit and no refusal by ward pk, which the spec gives the harbor.
- No sealed partition at rest, since there is no rest.
- No logging, no metrics, no configuration, no default argument a caller
  does not use, and no schema validator. A line a reader must skip is a line
  that hides the spec.
