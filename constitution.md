
# The Constitution of Quo

For most of history there were no accounts. A person was known by their
hand and their seal: a letter carried its author's signature, wax closed
it against every eye but the addressee's, and the house that received it
judged it by the seal it wore — never by who carried it, and never by
asking a third house's permission. Houses were sovereign. Each held its
own people, its own records, and one gate; what happened inside was
nobody's business outside, and what crossed between houses was provable
for as long as the paper survived. A house named its heir before it
needed one, so when the hand changed, the correspondence carried on. And
a stranger at the gate was met with silence, not with an explanation of
the locks.

Computing lost this arrangement. To act on today's networks is to be a
row in someone else's ledger: identity is an account, granted and
revoked by a platform; authority is ambient — being logged in is being
allowed; relations between two parties are recorded by a third who was
in none of them; and every refusal explains itself to whoever probes.
The houses were replaced by landlords.

Quo writes the old arrangement down for machines. A **voice** is the
seal — keys that sign and read, with an heir committed in advance. A
**being** is the correspondent — one entity, reached at its ground's one
door. A **ground** is the house — one sovereign process holding its
residents, and holding them honestly: running is custody, as it always
was. Standing with a house is granted the way it always was, by
invitation — a letter of introduction, spent once — and kept at the gate
as a **reference**. Messages are letters: signed by the sender's hand,
sealed so only the addressee reads, judged at the door by whose seal
they wear. Every house has its boss: within the walls the holder's rule
is absolute, and this document says so plainly instead of hiding it. But
no emperor stands above the houses — across the walls nothing commands,
no house holds a master key to another, and the only authority that
travels is a sealed letter.

Quo answers one question — **by whose authority** — and refuses every
other. This document is the whole of what that means, and it binds
exactly one thing: **interoperability**. A builder who implements every
article, in any language, produces a Quo that speaks to every other.
What an implementation could do differently without a second
implementation ever noticing — how it stores, how it hosts, how custody
is kept — belongs to that implementation's own papers and binds no one
else. Where bytes are pinned they are pinned exactly; where a choice is
left open it is named as open. Nothing outside this document binds an
implementation.

## I. The world

- A **voice** is the ability to be someone: keys that speak, read, and
  survive into the future. Nothing else in the system is an identity.
- A **being** is one addressable entity, reached at its ground's one
  door: a voice, a program compiled from a blueprint, memory of its own,
  and the references it grants and holds.
- A **ground** is one sovereign process holding many beings. It creates
  them, destroys them, and exposes exactly one handler where every
  message for every being arrives. The ground holds every resident
  voice: **running is custody**, and this constitution states it rather
  than hiding it.
- A **blueprint** is the species, not the creature: one serializable
  text describing a kind of being, with no identity, no ground, and no
  ambient power inside it. A **program** is a blueprint made executable.
  Many beings may run one blueprint; its digest is its identity.
- A **contract** is a named interface with a digest — the published
  shape a module slot requires, never an implementation.
- A **module** is what a being uses, never something that speaks: host
  code offered by the ground, or another being standing behind a
  contract.

There is no person, no account, and no session anywhere in the system. A
human is as many voices as they choose to mint. Within its walls a
ground's holder is sovereign — running is custody (XI) — and across the
wire no one outranks anyone: authority is only ever a signature checked
against a reference, and being local grants nothing at any door.

**There are exactly two ways to speak with a being**: from a seat —
being to being, whatever ground, terrain, or implementation the caller
stands on — or by hosting a ground and becoming one. **There is no
client category**: no third kind of thing stands on the wire's either
end, and the speaking side is always some ground's own hand (IV).
**Every participant speaks from a ground of its own**: a person or a
model enters the world only as the occupant of its own ground — minted
as cheaply as a browser tab or an authenticated session, silently where
the surface law wants silence — and its standing anywhere else is the
seats its ground holds. A guest is a small ground on its own terrain; a
stranger is a ground the door does not recognize; a bare voice with no
ground behind it can always be manufactured with the arithmetic alone,
and the world owes it nothing and records nothing for it.

## II. The arithmetic

Public, stateless, and identical on every machine. Nothing in it holds a
key.

- **digest(bytes)** — SHA-256, rendered as 64 lowercase hex characters.
- **canon(value)** — the canonical bytes of a claim, and they are RFC
  8785 (JSON Canonicalization Scheme): the value is JSON — objects,
  arrays, strings, finite numbers, `true`, `false`, `null` — with every
  object's keys sorted as sequences of UTF-16 code units, recursively,
  **including objects inside arrays**; numbers render as ECMAScript
  renders them, so an integer within ±2⁵³ − 1 prints without fraction or
  exponent; strings escape exactly as ECMAScript's `JSON.stringify`
  escapes them; the whole serializes as UTF-8 with no added whitespace.
  Two semantically equal claims canonicalize to identical bytes on every
  machine, or signatures do not interoperate.
- **address(pk)** — the one spelling of identity: Stellar StrKey.
  Prepend version byte 48 (`6 << 3`) to the 32-byte Ed25519 public key,
  append a CRC16-XModem checksum (polynomial 0x1021, initial 0) in
  little-endian byte order, and encode the 35 bytes in RFC 4648 base32
  without padding: exactly 56 characters, beginning with `G`.
  **pkOf(address)** reverses it and answers null — never an error — on
  wrong length, wrong version, or wrong checksum. **The spelling is
  Stellar's on purpose**: a Quo address is a valid account address on
  that ledger, and the key that signs an envelope signs there too — so a
  being can hold and move value without a second identity, on Stellar or
  on any ledger sharing the curve. Quo requires no ledger, depends on
  none, and stands with none present.
- **Signatures** — Ed25519 over canonical bytes, carried as base64 — and
  base64, everywhere this document says it, is RFC 4648 §4: the standard
  alphabet, with padding.
- **seal(secret, value)** — AES-256-GCM: the secret is exactly 32 bytes
  and is the key itself, underived; a random 12-byte IV, a 16-byte auth
  tag, no additional authenticated data, and the plaintext is `value`'s
  JSON serialization — the implementation's own spelling, since only the
  holder of the key ever reads it and it parses what it opens; canonical
  bytes are the law of signatures, never of seals; carried as base64(iv
  ‖ tag ‖ ciphertext). **unseal** answers undefined — silence — on a
  wrong key or one tampered bit.
- **sealTo(boxPk, value)** — seal to an identity rather than a password:
  mint an ephemeral X25519 pair, agree with the recipient's box key
  (Diffie-Hellman), hash the shared secret with SHA-256 into an AES key,
  and carry `base64(ephemeralPk) + "." + seal(...)`. Only the holder of
  the box private key opens it; tampering anywhere is silence. A being's
  box key is read off `describe` (IV) — that is where a peer learns whom
  to seal to, and a fresh box after succession is learned the same way.

## III. The voice

A voice holds three private keys, unreachable from outside — and one of
them, the future's, it may be born without:

- **present** (Ed25519) — the speaking hand. Signs envelopes and writes.
- **next** (Ed25519) — the future, minted at birth and never shown. The
  world sees only its commitment: `nextPkHash = digest(next.pk)`. A
  voice is never alive without a committed future, but it may be alive
  without holding the key that future names: a voice born to a
  commitment someone else keeps speaks, is spoken to, and can never
  succeed itself. That is how a machine is handed a hand and not a
  lineage.
- **box** (X25519) — the reading hand. Others seal to it; only the box's
  holder reads.

Succession retires both hands in one act: the committed key starts
speaking, a fresh future is committed, a fresh box starts reading; a
voice that does not hold its future has no such act. What was sealed to
the old box must be deliberately re-wrapped during the handover, while
the retiring voice still stands. How a voice's keys are carried,
exported, and kept is each implementation's own law; what every
implementation shares is the three keys, the commitment, and the one act
that moves them.

## IV. The envelope and the door

The wire is plain JSON. An envelope is:

```json
{ "from": "G…", "to": "G…", "seq": 1755170000000,
  "sealed": "base64",
  "sig": "base64" }
```

`from` and `to` are addresses — identity has one spelling. **`to` names
the ground**, never a being: a ground is itself addressable, holding an
address and a box key of its own (II) exactly as a being does, and every
envelope aimed at it seals to that key. The being it is meant for, when
the call names one, travels inside the seal rather than beside `to` —
below. `sig` is the sender's Ed25519 signature over `canon({ from, op,
seq, to })`, and those canonical bytes are the envelope's **claim**,
unchanged by sealing — it is on these bytes, before anything is sealed,
that the measure below is counted. `seq` is a positive integer carried
as a JSON number, at most 2⁵³ − 1, strictly rising per relationship; a
sender may draw every number from one rising source. The door keeps only
the high-water mark, so of two envelopes in flight the later can silence
the earlier forever; one envelope in flight per counterparty is the
sender's own discipline, never the door's promise. **Across
relationships the door promises no order**: each relationship's own
rising `seq` is the only order this surface speaks; envelopes from
different counterparties settle as the host happens to schedule them,
and that accident carries no meaning a caller or an implementation may
read.

**Payload sealing is as mandatory as signing.** `op` — the target
`being` beside it where the call names one, and always the caller's
`reply` key — travels only as `sealed = sealTo(groundBoxPk, { op,
being?, reply })` (II), itself already base64: the receiving ground's
box key is the one every caller seals to, and the wire shows only who
talked to which ground, nothing of what was asked or of whom. The signer
computes `sig` over the plain claim first — `op` in the clear, as the
table below states it — then seals; the door, holding its own box key,
unseals first and recomputes the identical claim bytes to check `sig`
against them. `reply` is an **ephemeral box public key**, minted for
this one envelope and never reused, whose secret half never leaves the
caller: it is the key the answer comes back sealed to (step 6), so a
caller that forgets that secret once its call settles leaves nothing
behind that opens a recorded exchange, and a long-term key taken
tomorrow opens no yesterday. An envelope whose sealed payload carries no
usable `reply` is silence — every ask answers, so every envelope carries
one. A caller with no being to name simply omits it, and an omitted
`being` **names the public being** — whatever the reserved alias
`public` names, the one being every ground always holds and every caller
may reach (X). There is no unaddressed call and no ground that answers a
question for itself: every question reaches a being, that being answers
under the caller's roles, and the door holds no schema and no resolver
of its own. **Nothing is ever routed by guessing** which being offers
the named field; describe is where a caller reads the name to use.

**The substrate is total at the door**. The door carries one op —
**ask**, `{ source, variables? }` answering `{ data }` — and an envelope
opens into recognition: the seat worn, the roles fixed, and everything
after is GraphQL over the caller's role-filtered composed schema —
declared fields and their resolvers, nothing else. Every act the core
owes is a composed field (the composed core schema, pinned in X); **an
act with no field does not exist**: no op beside ask, no authority
beside the seat, no answer that did not come from a resolver. `data` is
the ask's GraphQL data object, and no `errors` member ever stands beside
it — silence is the only error; introspection is GraphQL's own
`__schema` over the same role-filtered schema, so the substrate carries
it with no field declared; `reply` is a box public key as base64 (II),
the one-use one the envelope minted, and it is the only thing that ever
travels beside a body (step 6).

**An op is an act only when it carries `ask` alone**. One field, spelled
`ask`, and nothing beside it: an op carrying a second field is not a
well-spelled act wearing a decoration, it is not an act at all, and
which field was written first decides nothing. A door that read the
first key would let the same two fields mean one thing in one spelling
and another in the other, and nothing is ever routed by guessing.

**A non-act is answered, never silenced**. An envelope that proved
itself and carries no act asked nothing, so nothing runs — and the door
says so in its own name: one body, `carries`, naming the acts this door
carries, sealed to the envelope's `reply` like every other answer. That
body is the door's own standing shape and never a reading of what
arrived — identical for every caller, seated or stranger, and identical
for every non-act — so it narrates no error (XII), tells one proven
caller nothing about another, and hands back nothing the sender's own
construction did not already hold. It is the same thing the door does
for a caller sealing to a box the ground has retired, which buys the
fresh box and nothing more. These two are the whole of what a door ever
says in its own name, and neither is an answer to a question.

The composed acts' authority is the one primitive (V), never the field's
reachability: `describe` and `__schema` answer out of the caller's
role-filtered world, and where that world is empty they answer it empty
— an empty world is data, never silence, while `offer` mints an
embryonic seat under its role's ceiling (VI), and `acceptInvite`,
`rotate`, `release`, `attach` and `detach` execute only against the seat
each one proves — a commitment matched, a standing seat, an offer spent
— executed by the seat it moves: there is no unseated caller of any of
them, because the seat an invitation mints exists from the mint.
`attach` alone needs more than proof: it requires a standing written
seat, so a caller holding nothing but its fake seat at public may never
attach — there is nothing to reach it at.

**Silence has exactly two causes**, and no third is ever written. The
first is an envelope the door cannot read as a question at all:
addressed elsewhere, sealed so it will not open, signed so it will not
verify, past the measure, or a replay — which is not a second question
but the same one again. The second is a question naming what the
caller's own world does not contain: a field its rights do not open, one
never written, a being it cannot see — one silence, so that absence and
refusal stay indistinguishable and visibility is worth something.

Everything else is data, **and an empty world is data**. Standing is
never a cause: every caller that proved itself holds at least its fake
seat at public (VI), so describe always answers it — with what its seats
open, and with an empty lobby when they open nothing. A ground never
answers a proven caller by pretending not to be there. An envelope
carrying no act is not a cause either: it names nothing the caller's
world could fail to contain, so it is answered with what the door
carries rather than silenced.

The door judges every envelope in this order, and the order is law:

1. **Address** — `to` must be this ground; anything else is silence.
2. **Proof** — `pkOf(from)` must verify `sig` over the claim. A ground
   may vouch for envelopes it built with its own hands (custody proves
   nothing to itself); a vouch is never a shape on the wire — no bytes
   arriving at any endpoint are ever vouched, it exists only as the
   ground handing its own construction to its own door in process, and
   each implementation states its mechanism in its own paper. And every
   envelope is already sealed to the ground's box key (II), which
   travels only by invitation or by its holder's choice to tell — even
   the never-invited caller passed a gate the world can see. Proof
   passed, an envelope carrying no `ask` stops here: it is not a
   question, so it is answered with the acts the door carries and never
   reaches the mark below — a non-act advances nothing, and the one body
   it buys is worth nothing replayed.
3. **Replay** — if the caller's ground holds a seat, `seq` must exceed
   the seat's remembered high-water mark, kept per ground-pair, which
   then advances. A replayed or stale envelope is silence. A caller
   holding no seat is unnumbered: the public seat is fake and carries no
   mark (VI), the core's own acts reachable there are one-shot by
   construction — an offer spends, a commitment matches once — and a
   blueprint public carries accepts the replay of its own mutations, a
   cost custody takes when it puts them there. Vouched local calls skip
   this gate.
4. **Roles** — the caller is `SELF` at the ground's own hand, wears what
   its seat carries at a being it holds one at, and wears `MEMBER` at
   public (VI).
5. **The ask**, under those roles — handed to the being the call names,
   and to public when it names none. One hand-off, no routing: the door
   never reads the ask to decide where it goes.
6. **The answer** — `{ body, sig }`, `sig` by the answering being over
   `canon({ body, claim })` where `claim` is `digest` of the claim bytes
   it answers — an answer is bound to its question, so a kept answer
   fits no other envelope — and `succession` beside the body when the
   being has succeeded itself. **An answer is signed first and sealed
   second**: the being signs, and the whole signed answer — `{ body,
   sig, succession? }` — then travels only as `sealTo(reply, answer)`,
   sealed to the ephemeral key the envelope carried. That seal is all
   that leaves the door, so on the wire an answer is opaque exactly as a
   question is, and a relay carrying it learns nothing but that a ground
   answered. The caller unseals with the one-use secret it minted, then
   verifies what it opened, in that order: a seal that will not open,
   and a seal that opens to something that does not verify, are one
   silence. The body names the answering being's own address: the caller
   verifies from that name alone — `pkOf(name)` is the key the being was
   born with, each handover in `succession` is checked against the key
   before it (VII), and the answer must verify under the key the last
   one names — and, beyond the signature, checks that its own seat
   record justifies that being answering that op: a name `sig` verifies
   but no seat backs is worth exactly as little as a broken chain. An
   answer whose chain breaks anywhere is dropped exactly as an unsigned
   one is, and a chain is worth nothing at any address but the one it
   names. Or **silence**, for one of the causes named above and no
   other: indistinguishable absence, never a message saying so. Errors
   never leave the house.

`describe` names, for the caller, everything it may reach at this
ground. It is one field on every being's own schema and it answers
whichever being is asked: a being asked by name answers its own contract
— its filtered schema — signed by itself, and the being an envelope
reaches by naming none — **public** (X) — answers for the ground as a
whole, signed by itself. The wider answer is no wider power: the seat
map is the ground's own knowledge, handed to that resolver by the door
exactly as the composed acts' machinery is, so public holds nothing of
the registry and could not answer it unasked. What it answers is the
union of the caller's seats with public appended: a **seat map**,
`groups`, one entry per **contract digest** (IX) the caller holds a seat
under — never the blueprint digest, because what a caller cares to know
is the surface it can speak to, not the implementation behind it, and
the interface digest is all a stranger may ever learn. Each group names
its contract and carries that contract's own schema, filtered to the
caller's best right among its seats there and always a valid,
self-contained SDL — the pinned shape (X) is the whole of a group: its
contract, its name, the visible beings answering it (`members`), and its
filtered schema. `members` never widens the caller's world, naming only
beings the caller's own rights already open, so describe answers the
caller's own world grouped, while the full table — every resident, every
guest, every seat — stays the administration's own `contacts` to answer.
**A type name is disclosure exactly as a field is**: the filtered schema
names only the types its surviving fields reach, so a type standing
behind doors the caller's rights do not open appears nowhere, not even
as vocabulary — the interface language's own scaffolding (the
directives, the `Rights` enum, `File` and `Stream`) alone stands
regardless. `schema` is the flat convenience beside it: every group's
schema merged, identical type definitions folding into one; a type name
defined two different ways across contracts refuses the flat merge
outright — `schema` is then absent from the body, an open refusal, never
a silent rename — while every group's own schema keeps working
regardless, so a collision never blocks a caller who reads the grouped
view. Invocation never follows that shape: every op is reached by naming
its being, exactly as step 5 hands it, and describe is where the caller
reads that name. **A caller holding nothing is described exactly as
anyone is**: its world is public alone, and public is a group like any
other. Where public's blueprint is empty the seat map carries that one
group with nothing runnable in it, and that is an answer — a ground with
an empty lobby, never a ground pretending not to be there.

`introspect` answers the same schema describe would, as machine-readable
introspection — never more than describe shows; it exists so a caller
without a GraphQL parser still reads the world, a re-encoding on purpose
and never a second surface. **It is always the answering being's own
schema**, never a merged one: introspection is GraphQL's own, run
against the very schema the ask executes against, and a machine-readable
schema a caller could not then execute against would be a lie told in
the one place a machine trusts. The world across beings is read through
describe's `groups`, and its flat `schema` beside them. Visibility
equals permission: that a being stands at an address is itself the first
thing visibility guards.

**`ask` answers out of that same filtered world and no other.** The
question language is GraphQL: `source` is a GraphQL document judged
against the schema the answering being's own contract describes, and
`variables` are its variables — one language for every being on every
implementation, the same one the blueprint's interface is written in
(VIII). A field the caller's rights do not open is not a field it may
name: naming one is silence, exactly as naming a field that was never
written is, so a caller holding one field learns nothing of the fields
it does not hold. There are two things a being ever hands back — **data,
or silence** — and never an error, a refusal, or a null standing in for
a field. What a caller may ask is what describe already showed it.

**The measure.** One number binds every implementation: eight mebibytes
— 8,388,608 canonical bytes, counted on the claim — `canon({ from, op,
seq, to })` — before anything is sealed, because sealing's overhead is
never this surface's concern. No signed claim exceeds it: an envelope
whose claim renders more bytes than the measure is silence at every
door, and a being whose answer body's `canon` would exceed it is mute —
counted on the plain body, before that answer is sealed to `reply`,
symmetric with the claim; for every cause, indistinguishable, like every
refusal. A conformant door accepts every lawful envelope up to the
measure, and a lawful envelope's carriage body never exceeds the measure
by more than its own framing — the sealed payload, the `sig` field, and
JSON punctuation — so a door may stop reading anything past that, and
the stop is silence; carrying more than the measure is never this
surface's work — it rides a channel, outside the door's one op (below).

**`attach` and `detach`.** A signed, sealed `attach` binds the caller's
identity to the transport channel the envelope arrived on: while
attached, deliveries meant for that caller flow down that same channel
instead of waiting to be asked for. The channel — the pipe itself — is
the wire module's own; the binding of an identity to it is the
protocol's, proven at the same door as everything else. `detach` ends
the binding explicitly, and a channel that drops ends it exactly the
same way without waiting to be told. A seat says a caller may ask; an
attachment says it may be reached — both proven at the one door, and a
seat counts for `attach` even where visibility shuts everything behind
it: attach is reachability, never sight, and a peer whose view has
narrowed to nothing is still owed the deliveries meant for it.

**The channel law**. Bytes beyond the measure never ride an envelope —
and neither do bytes below it: the interface carries facts about bytes,
never the bytes themselves, at any size. Quo does not pin one transport
for them; it gives the interface language two types — **`File`** for
bounded bytes, valid in queries and mutations, and **`Stream`** for
unbounded ones, valid only under a subscription and refused by the
interface anywhere else — and the door itself owns their choreography,
published whole beside this constitution
([spec-channels.md](spec-channels.md)). A `File` crossing a door in
either direction is its facts beside a ticket for its bytes, minted by
the door in that same proven turn and carried inside the sealed answer,
so no blueprint writes grant machinery and no bearer proof ever travels
plain. Authority still never travels with the bytes: access to a channel
endpoint is that ticket — a seat-scoped, expiring grant, spent by
landing, kept in cells like any other fact a being holds, dying with the
seat that earned it (release or drop the reference and its channels end
in flight) — and the integrity of what moves rides a digest carried
inside the same sealed answer, end to end, exactly as a signed answer
carries its own proof. Nothing here moves the op set: every act above
rides `ask`, and no ninth op exists. A party whose infrastructure cannot
wear the published choreography keeps Quo for control — grants, attach
and detach, eventing — and wires its own module where its own transport
meets its peer's endpoint; a pipe or a function call binds only its own
two ends, and nothing here reaches past them.

**The speaking side is bound to its own door.** An envelope is built
inside the custody that holds the voice and leaves through the hand of
the ground that serves that voice — step 2's vouch is exactly this
binding seen from inside, and I's no-client law is it seen from outside.
A voice seated at a foreign ground still speaks from its own side: what
crosses grounds is the envelope, never the hand that built it, so no
ground's machinery ever signs, seals, or delivers on behalf of a voice
it does not serve.

**The carriage**. One binding is canonical, and every ground reachable
across machines answers it: an envelope travels as an HTTP POST whose
body is the envelope's JSON in UTF-8, sent to the ground's endpoint, and
the answer — when there is one — returns in the response body as JSON.
Nothing but a verifiable signed answer is an answer: no status code,
header, or transport fact carries meaning, and everything that is not an
answer is silence. Silence's own spelling is an empty response body — a
refusing ground completes the exchange carrying nothing — and a caller
treats whatever else transport produces exactly as it treats that
emptiness. The carriage binds the door's endpoint and nothing else: how
a channel module reaches its own endpoint is that module's contract to
state (above), how an address finds a door's endpoint is custody's, and
any private carriage two grounds share beside the canonical one — a pipe
or a function call binds only its own two ends — is left open by name.

## V. References

**A seat is standing between two grounds, and the ground keeps it**: one
seat table per ground, held by its administration (X), one seat in each
direction per counterparty ground, and no third party holds a record of
any relation — each ground remembers its own side, and nothing else
exists anywhere. Recognition is the door's one act: an arriving ground
matches a seat and wears that seat's roles, or matches nothing and holds
only its fake seat at public (VI) — never nothing, and never a stored
row it did not earn. A seat names the ground beside the being it was
granted through — standing is kept with a house, not with a name
floating free of one — and what a program distinguishes about callers
beyond their roles it keeps in its own memory as data, because the
substrate answers by-whose-authority once per ground and refuses every
finer question.

- **Inbound**, one capability this ground issued: who may call, as what
  roles, the replay high-water mark — kept per ground-pair — and the
  caller's succession commitment. Seats are granted at creation, by
  invitation, or by a program's own act; never automatically — authority
  is only ever an act, including between two beings on the same ground.
  A grant that names no roles is `MEMBER`.
- **Outbound**, whom I call, and where I sit: the peer's ground — its
  address and box key — beside the peer being's own address, the
  **mask** I wear there, my committed `nextPkHash`, the rights I hold,
  and a rendezvous hint — how to reach, or where to leave mail for, this
  peer. An invitation is a seat record in embryo: it carries the
  ground's identity beside the inviting being's, so a bearer arrives
  already knowing the house as well as the host.

**One primitive moves identity everywhere: prove-and-replace of a
seat**. An invitation is a seat whose occupant is a commitment — the
offer standing under `digest(proof)` — with its roles fixed at mint;
**acceptInvite** proves the commitment and replaces the occupant with
the bearer's key; **rotate** proves `nextPkHash` and replaces the keys
with the standing intact; a ground's **init** is the seat of the being
it stands as before it is claimed, rotated into custody's hand (its
implementation paper states that being); **succession** is rotate at the
ground's own altitude, chain-certified (VII). Four names, one act.

The **mask** is minted per ground, never per counterparty: one identity,
by the program's own deliberate act, worn toward every being I hold a
seat with on that ground, and a different mask at every other ground, so
no two grounds can correlate the same caller by its keys. Until a mask
is minted, the being speaks with its own voice. A ground's own **public
being** — what it shows anyone at the door (X) — is a different thing
entirely: a mask is what a caller shows outward, and public is what a
ground shows in.

**rotate** is prove-and-replace at the door: a new voice proves
`digest(pkOf(from))` equals the `nextPkHash` some reference committed
to; the old reference falls, the new one stands with a fresh commitment,
rights carried, replay mark fresh. An arriving address that already
holds a reference of its own is silence: rotation replaces a
relationship, it never merges two.

**Rotation always propagates.** A being that rotates walks its own
outbound seat records and reaches every peer named there with an
ordinary signed envelope carrying its news, so a peer's held reference
is never left stale by the being's own silence. A ground rotates rarely,
and no less carefully: its own new box key must reach every peer the
same way, or the ground goes deaf to every envelope already sealed to
the key it retired. The succession chain (VII) is the proof a peer
checks, and the heir holds the retiring box key through the handover
window, so what was sealed before the change still opens.

**release** removes the caller's own reference, no permission needed;
the second release is silence. The caller drops its matching outbound
record in the same act.

**drop** removes a reference from the ground's one table — the
administration's own mutation (X), behind the rights it names, and every
ground holds the act because the administration's schema is pinned. The
reference goes whole — rights, replay mark and succession commitment
together — and the dropped party is a stranger from that moment,
indistinguishable from one that never called. The commitment going with
the reference is the act's purpose: a dropped peer cannot rotate back
into standing it no longer holds. Nothing drops automatically, and no
ground reaches into another's table: a ground removes only its own
seats, exactly as it grants only its own — and a resident holds no seat
row to remove or grant, the table being the administration's alone.

A dropped peer returns the way anyone arrives — by invitation.
**acceptInvite** writes the new mark from the spending envelope's own
`seq`, and `seq` rises strictly per relationship, so every envelope sent
before the drop sits under the new mark and is silence.

**acceptInvite** spends an invitation: the being's program stored an
offer under `digest(proof)` — the digest of the proof's decoded bytes,
never of their base64 spelling; the bearer presents `proof` (base64
bytes); and the bearer's reference is written whole with the rights the
offer named, the envelope's `seq` as its high-water mark, and the
`nextPkHash` the bearer enclosed, or null when it enclosed none. A
bearer that already holds a reference is rewritten whole to what the
offer names; the replay gate has already refused anything at or under
the standing mark, so the fresh mark never lowers one.

**An offer carries a count and an expiry.** The count is how many times
it may be spent — an integer of one or more — and every spend takes one
from it; an offer with none left is silence, for anyone, forever. The
expiry is a stamp in milliseconds since the epoch, `0` meaning the offer
never expires on its own; the stamp is the last moment the offer stands,
so a spend arriving at it is admitted and one arriving after it is
silence the same way an emptied offer is. Both are the program's to
name, within the ceiling the ground declared for the role the offer
grants (VI), and an offer naming neither is spendable once and never
expires — which is what an invitation is wherever nothing says
otherwise. An offer with a count of N is N embryonic seats sharing one
proof, each born whole at its spend; the default, count one, is the
embryonic seat itself.

**The expiry is judged by the being that emitted the offer**, at the
moment a spend arrives at its own door, against the clock its own host
feeds it — never the spender's clock and never any intermediary's,
because an offer is a fact one being holds and no one else's reading of
the time bears on it. Enforcement is at the spend and nowhere else:
nothing sweeps, an expired offer sits in memory exactly as it sat, and a
being that is not running has no opinion about the hour. A host that
stops ticking simply stops (XI), so a ground judges by whatever time it
is fed when it next runs.

## VI. Rights

**Roles are the ground's vocabulary**: declared on the administration
and extended there, never per blueprint. One is structural — `SELF`, the
ground's own hand — and its meaning is no one's to redefine. `MEMBER`
completes the built-in vocabulary every ground starts with. Every other
role is the ground's own, and roles are a set, never a ladder.

**There is no role that means everyone**. Nothing is opened to the world
by a right, because a right is what a seat carries and the unseated
carry none. What a ground opens to everyone it opens by putting it on
the **public being** (X) — the one being every caller reaches without
being granted anything — and a caller's world is the beings it holds
seats at with public **appended**, never substituted: a caller holding
three seats holds four worlds, and public is the fourth for the seated
exactly as it is the only one for the unseated. A ground that wants a
field answered to anyone declares it on public's blueprint under
ordinary roles, and the reach comes from the being rather than from the
declaration.

**At public every caller wears `MEMBER`**, and the ground's own hand
wears `SELF` there as it does everywhere. No new word is minted for it:
`MEMBER` already means one this ground has admitted, and public is the
being that admits everyone. The seat is **fake** — it is never written,
never counted, never given a replay mark, and costs a ground nothing per
caller, because a floor that allocated a row to whoever knocked would be
a way to make a ground spend by knocking. A blueprint binds its root
fields to role names with a directive on the field — `@rights(is: [A,
B])` — under the definition `directive @rights(is: [Rights!]!) on
FIELD_DEFINITION`; every implementation places that definition and the
ground's own role enum before the author's schema — the completed order
VIII states — so the enum is the ground's at install, never the
author's. A blueprint naming a role the ground does not hold is refused
whole at install, exactly as `create` refuses (X), so what a species
requires of a ground's vocabulary is read off its digest before it
stands.

**A role declares how it is invited into.** `@invites(count: Int!,
within: Int!)` on a role's declaration — under the definition `directive
@invites(count: Int!, within: Int!) on ENUM_VALUE`, placed beside
`@rights` — is the ceiling every offer naming that role stands under:
`count` the most spends an offer may carry, `within` the longest life it
may be given, in milliseconds, and `0` on either axis meaning that axis
is unbounded. A role declaring no `@invites` is bounded on neither. The
ceiling is the ground's, declared where the role is declared, so what an
invitation to a seat may be is read off the ground that would grant it;
an offer exceeding it is refused where it is written, never at the door
that would spend it.

Every root-level field carries an explicit rights declaration; a
blueprint with an undeclared root field, or one naming a right its enum
never defined, **does not compile**. Rights gate the root and only the
root: a root field's declaration covers everything its answer reaches,
and what one root field's answer carries is that field's own business,
the author's to shape — visibility equals permission root field by root
field, never field by field beneath one. The same declaration does every
job at once: it filters describe, filters introspection, and refuses
execution — including fields with no resolver of their own.

## VII. The succession

**A being's key is minted where it is born.** The core mints it at
`create` (X); no caller supplies one, and nothing on the wire carries a
voice into a being. A being's birth key — the key its address spells
(II) — therefore leaves the ground that raised it by no act this
document names, and no two grounds lawfully answer for one address; what
a stolen shelf takes anyway is XI's honesty. Raising the ground itself
is the one place a voice is handed in, and this article leaves that
where X does: a custodian hands its own machine a hand, which is
custody's act and no door's.

A being's key moves only by prove-and-replace: the successor proves
`digest(newPk)` equals the committed `nextPkHash`, and the act commits a
fresh future in the same motion. Even the current voice cannot hand its
being over by fiat — a handover no commitment named is no handover at
all.

**A handover certifies itself as it happens.** In the same act, the
retiring voice signs, over `canon({ at, next, v })` (II), `{ at, next, v
}` — the address it stands down at, the replacing key spelled as an
address, because identity has one spelling, and this handover's position
in the being's chain: the birth key stands at zero, the first
certificate carries a `v` of 1, and each after it rises by one. A
certificate is written once and never again; the signature travels as
base64. The being's `succession` is these certificates in order, carried
beside every answer it signs (IV, step 6) — they are what let a caller
holding nothing but an address follow a being across every succession it
has made. How an implementation stores its chain is its own law; what
every implementation shares is the certificate's bytes, its
immutability, and the walk that verifies it.

## VIII. The blueprint law

A blueprint is written by an author who knows neither the identity of
the being that will run it nor the ground where it will stand. It is one
serializable text declaring:

- **name** — dotted vocabulary for humans; settles nothing at any field,
  and lives in the digest like every other byte of the text: renaming a
  species is a new species.
- **needs.modules** — each entry names the module slot, the **contract**
  it must satisfy, and, where per-being authority is required, a typed
  **binding**. A ground missing a declared module refuses creation
  rather than failing later.
- **needs.config** — a typed input; values are coerced against the
  declared types, defaults fill, unknown or ill-typed values refuse.
- **needs.caller** — whether this program is told who knocked (X, _The
  caller, introduced_). Absent, it never learns; the digest therefore
  states what a species may record about its visitors.
- **memory** — every cell the program keeps, exact or under a
  `prefix/*`, each with its class. The classes are a closed set of nine
  — `bindings, chain, config, data, handles, identity, keyring, program,
  refs` — so one blueprint compiles and digests the same everywhere;
  what a class means at rest is each implementation's own law, stated in
  its own paper. The reservation is twofold. Four *classes* are the
  core's alone to assign — `chain`, `identity`, `keyring`, `program` —
  and a blueprint declaring any cell under them does not compile. And
  the core's own *cells* — the prefixes `archive/`, `chain/`,
  `keyring/`, `refs/`, `handles/`, `bindings/`, `identity/`, and the
  exact names `config` and `program` — are nobody's to declare, exact or
  under a prefix that reaches them, whatever class the declaration
  wears. A resolver may write only its declared memory, plus its own
  references and outbound records — rows only the administration holds,
  the seat table being the ground's one (V); a seat-shaped row in any
  other being's cells is data, never standing. A reference it writes
  never carries a structural right (VI), never lowers a standing replay
  mark, and never drops **nor replaces** a standing succession
  commitment (V). Erasing a reference whole is the other act, V's own:
  the commitment leaves with the reference it lived in, which is what
  dropping is for. An undeclared write is refused; a declared class
  outside the closed set, or a collision with a core cell, does not
  compile.
- **interface** — the schema (GraphQL SDL), with the rights enum and a
  rights declaration on every field.
- **resolvers** — one function per field, closing over nothing, and the
  language is pinned: a blueprint's source text is ECMAScript — the 2023
  edition's grammar — on every implementation, whatever language the
  implementation itself is written in; an implementation embeds an
  ECMAScript engine to grow beings, and that is what makes one species
  portable across all of them.

No ambient power exists: reading a forbidden name — the runtime globals,
process, network, clock, randomness, eval, module machinery, prototype
reach — refuses the blueprint by name at compile, and time and
randomness arrive only as declared modules. Implementations state their
scan's honest strength; a bounded blast radius is claimed, a jail never
is. The compile scan refuses the forbidden names by name and does not
see a closure — a resolver closing over its blueprint's own scope
compiles, and what it shares that way is unpromised, unportable state
living and dying with its being's process; closing over nothing is the
author's obligation, not the door's check. The scan's boundary is each
implementation's own, so portability is written to the narrowest: a
blueprint touching none of the forbidden categories compiles everywhere,
and one probing the edge is portable only by test.

**The text is the identity.** A schema travels and digests as the exact
bytes its author wrote, UTF-8, whitespace and all: there is no canonical
reprint, because a printer's behaviour is a library wearing a law's
clothes. The **completed** schema is a construction, never a reformat,
and it is this, one line feed between each: the `@rights` directive
definition (VI); the `@invites` directive definition (VI); the `File`
and `Stream` channel types the channel law names (IV); the ground's own
`Rights` enum — the default where the ground declared no more (VI —
roles are the ground's vocabulary, so the enum is never the author's);
the author's text unchanged; and the core's own composed chunks (X).
**Two directive definitions are composed and no more.** An
implementation with a vocabulary of its own — a deadline, a widget hint
— defines it in the author's own text like any other vocabulary
([spec-seats.md](spec-seats.md), _Surfaces_), because a definition the
host injects is one that moves the digest on that host alone, and a
blueprint would then be a different blueprint on every implementation
that carried a word of its own. The same law governs composition: where
a base type declaration stands, every `extend type` of that name — a
part's, or the core's own — prints as its own separate chunk, never
folded into the base or into each other; the fold is the schema
builder's reading, not the text's. A caller counting blocks in the
printed SDL counts chunks, not types.

**The digest** is `digest(canon({ interface, memory, name, needs,
resolvers }))` where `interface` is the completed schema text exactly as
constructed above, `memory` and `needs` are the declared objects, `{}`
where absent, and `resolvers` is the sorted list of `Type.field=<source
text>`. The text being the identity, a reformatted schema is a different
blueprint: changing a resolver's text, the name, who may open a field,
or any byte of the schema moves the digest. Two implementations must
mint the same species key for the same blueprint, and the same digest
for it wherever the completion's own inputs agree — the ground's
declared vocabulary is one of those inputs — or pinning a program's
identity means nothing across them.

**The species key** is that same canon with the author's own interface
text in place of the completed one — the blueprint as written, before
any ground completed it. A ground files and names a species by this and
not by the digest above, because completion is the ground's act: it
folds in the `Rights` enum that ground declares (VI), so a species filed
under the completed digest would be renamed the moment the ground
learned a role, and every being already running it orphaned. The two
answer different questions and both stand — the digest is what a
standing program is, the species key is what its author wrote.

**A blueprint may be held already built**. An implementation may hold a
blueprint as the object its text settles to, fed to a ground at
construction the way modules are, and that is the same blueprint rather
than a second kind: `interface` is the author's text already, `memory`,
`name` and `needs` are the declared data, and each resolver's source is
the function's own. The digest is therefore unchanged, and a ground fed
its species stands them with no evaluator at all. An evaluator is
required for one thing only — a blueprint arriving as text while the
ground runs — which is one act and one alone (X, `install`). A ground
built without that act is not a lesser ground; it is a ground whose
species were settled before it started.

## IX. Contracts

A contract is `{ name, interface }` with digest `digest(canon({
interface, name }))` where `interface` is the contract's schema text
exactly as its author wrote it — the text is the identity (VIII). A
stander **satisfies** a contract when every type the contract names
exists bearing every field the contract gave it with exactly the same
type, every argument the contract names exists with exactly the same
type, every enum value the contract names exists, and the stander
demands nothing extra that is required — no extra required argument, no
extra required input field. More is fine only when it is optional; less
is never fine. A digest pins shape; what the words mean is the contract
author's prose. Attestation is the ground's own act: ask the stander to
describe, judge against the contract, refuse the pretender — and
describe answers only what the asker's rights open (IV), so custody
seats the attesting ground with the rights the contract's fields demand
before it asks, and a stander that hides those fields from those rights
is refused by that very silence.

## X. The ground

A ground is one sovereign process behind one handler; how it is
constructed, booted, and kept is its implementation's own law. What
every ground answers for at the wire is this article.

**Everything is a module.** Whatever a ground reaches out with arrives
as a module in the set it was raised with — its cells, its keys, its
wire, its clock, every offer it makes a program, and every channel on
which it speaks outward. A host that wires a capability into a ground by
any other means — reaching around the set, or wrapping a module the
ground was handed to add behaviour the ground cannot see — has not
implemented this article, because a ground can neither declare, scope,
attest nor refuse what it was never handed. The door is not an
exception: a door calls the ground and holds none of its power, and is
therefore no part of the set.

**Scoping.** The ground introduces the caller: a module offering `scope`
is handed to each program as `scope(address, binding)`'s answer —
isolation between beings is the ground's own act, exactly as with
memory, and a being never names itself. The second argument is the typed
binding that being's own blueprint declared for that slot (VIII), absent
where it declared none: the ground reads it from the `bindings/` cell it
wrote at creation and hands it over, so a module may be per-being
without the program ever holding what makes it so. **A program never
reads its own binding** — the cell is the creator's, kept by the ground
and spent by the module, and a resolver asking its own memory for it is
answered nothing. It is the one core prefix closed to a program's reads
as well as its writes, and it is closed because a binding a program can
print is a credential it can spend anywhere. A module without `scope` is
shared machinery, one object for all. External authority — a credential
to spend, a key that seals — still arrives as parameters from the
being's own cells; identity never travels as a parameter.

**A module that is a being** is reached the way any being is reached,
and the reaching is two acts, not one: the slot's coordinates are bound
where the ground is raised, and the seat itself is granted at the
stander's own ground — an outbound reference at the using being's
creation, or an invitation after it. A slot bound but never seated is
silence, like any unseated call. Once seated, calls leave as that
being's own signed envelopes — its voice, or the mask it minted there —
and what comes back arrives as data or silence like any answer. The slot
is a name over the wire, never a second channel, and the stander's
silence is the module's silence.

**The program's reach.** A program reaches its own memory and the
modules its blueprint declared, and nothing else. The ground's own
machinery — storage, keys, transport, delivery — is never a module a
program can find, and a module the blueprint did not declare is not
there to be found. A being speaks outward as itself alone: what it sends
is signed by its own voice or a mask it minted, so no program can wear
another's name. A module carries no secret of its own and opens no way
into the ground; authority arrives as parameters from the being's own
cells. Installing a blueprint — from anyone, unread — therefore risks
nothing but the being it grows, and a badly written module is the one
way custody harms itself.

**The caller, introduced.** A blueprint that declares it receives the
caller's proven address — the one the door verified, never a claim
carried in the body; a blueprint that does not declare it never learns
who knocked. Without this a being could neither answer twice to the same
peer nor return anything tomorrow. The declaration lives in the digest,
so what a program may record about who visits it is read before it is
installed.

**The clock is nobody's power.** The core holds no clock: it hands a
program no time, and no being fires on its own. Whatever wakes a being
is an ordinary signed envelope through the one handler, admitted or
refused by the receiving being's own references exactly like any other
caller — a being that wants waking grants that voice a reference and
names the call it wants repeated, so the waker composes nothing. Time
reaches a program as data in that call or through a module its blueprint
declared (VIII) — never from the core.

**Every ground holds two beings it did not choose to hold.** The
**administration** sits at the ground's own address and holds the
registry. The **public being** is whatever the reserved alias `public`
names, and it is the ground's whole surface to anyone holding no seat:
an envelope naming no being names it (IV), every caller wears `MEMBER`
there (VI), and its blueprint is the ground's own — a species from the
archive, named when the ground was built and standing at init, empty
where none was named, repointed afterwards with `alias` and upgraded
like any other being. **The alias is never absent**: `alias` refuses to
drop it and `destroy` refuses the being it names, so the one target an
unaddressed envelope resolves to always stands and the door never holds
a call it cannot hand anywhere. A ground answering strangers nothing
simply leaves public's blueprint empty — that is a ground with an empty
lobby, not a ground pretending not to be there.

**The administration** is a being like any other, and the only one whose
context holds the registry. Its fields mean the same on every ground,
and the pinned schema below names them all. `create` names the species
by digest and refuses one the archive does not hold, and refuses missing
modules, ill-typed bindings or config, unknown rights, malformed refs,
and initial data for undeclared cells — whole, never partially.
`destroy` takes a being off the wire and off the directory, never back
at reboot; what a shelf keeps afterward is the implementation's own
memory law. **upgrade** is custody replacing a being's program in place,
naming the new species by digest exactly as `create` does — identity,
cells, references and chain surviving, and visible because describe
answers the digest. It is refused whole when a held cell would go
undeclared **or would change the class it was declared under** — a class
is a standing cell's own shape, never the program's to rewrite beneath
it — and it refuses the administration's own address, because the fields
`SELF` stands behind are not a member's to rewrite. It drops the
ground's own seats (V) — no other being holds any — and **invite** and
**drop** stand behind `SELF, MEMBER`: admins are equals — a member seats
and removes members — and the ground's own voice remains the standing
court of appeal from wherever the self keys are kept. A ground wanting
membership governed narrower seats fewer members, or seats stewards
through its custom part; the fence of these two mutations does not move
per ground.

**The administration's own invitations are the tightest grant on a
ground**, and the core holds them so everywhere: an offer stored on the
administration is spendable exactly once, carries an expiry that is
never `0`, and that expiry stands no further out than a fixed maximum
horizon, which each implementation states in its own paper. What seats a
member is therefore always single-use and always dated — no blueprint
widens it, because this ceiling is the core's rather than a right's
(VI), and the custom part `extend` installs stands under it like
anything else. An offer breaking any of the three is refused where it is
written.

**The administration is extended, never redefined.** The acts are the
core's own: a custom blueprint reaches them through the same registry
surface the default uses and can invent no power the default lacked.
**extend** is the mutation that installs one, and it stands behind
`SELF` alone: it takes the custom part by itself and the core composes
it with the fixed administration, so what a custodian supplies is never
the whole program and can never arrive without the acts this article
names. A ground may equally be built naming a part out of its archive,
which stands from init and moves afterwards only through this mutation —
the same composition, chosen where the vault and the cells are chosen
rather than sent as text. The standard field names are reserved — a part
declaring one is refused whole, and so is one colliding on a cell or a
module slot — so a ground adds fields beside them and never changes what
one means. The same mutation replaces the part and removes it, and a
replacement or removal that would strand a declared cell, or drop a role
a standing resident's blueprint names, is refused like any other upgrade
— a role in use is load-bearing exactly as a held cell is (VI). A field
is closed the way anything is closed here, by declaring it behind a
right the ground never grants: it stands, it means what this article
says, and it answers no one. Everything else a custodian wants is module
code, chosen and owned by custody. So a stranger reading any ground may
trust that if `create` answers, it created.

**The archive** is every species a ground can stand, held by its species
key (VIII) — which `archive` answers and `create` and `upgrade` name. It
is seeded at construction from what the ground was fed — blueprints
already built, chosen by whoever stood the ground exactly as its modules
are — and it is extended at runtime by one mutation. **install** takes a
blueprint as text, compiles it, keeps it, and answers its digest; it
stands nothing up by itself, and installing a species the archive
already holds answers that same digest and changes nothing. It stands
behind `SELF, MEMBER` beside `create`, because splitting one act into
two moves no rights: what a member could introduce by creating a being
of it, a member may still introduce. It is the only administration field
that takes a program as text, which is what makes it the only one an
implementation without an evaluator must refuse (VIII). A ground so
built answers `install` never and every other field exactly as this
article says: its archive is what it was fed, and `create` reaches no
further. Whether an installed species outlives a restart is the
implementation's own memory law, under the core's own `archive/` cells
(VIII); a fed one returns with the ground that was fed it.

**The administration's schema** is pinned, completed like any
blueprint's (VIII), and a field it does not declare is not an
administration field:

```graphql
input RefInput { address: String!, nextPkHash: String, rights: String, groundAddress: String, groundBoxPk: String }
type Resident { address: String!, alias: String, digest: String, active: Boolean! }
type Census { residents: [Resident!]!, stored: Int!, active: Int! }
type Guest { address: String!, rights: String! }
type Species { digest: String!, name: String }
type Seat { ground: String!, being: String!, rights: String }
type Contact { resident: String!, guests: [Guest!]!, seats: [Seat!]! }
type Query {
  census: Census                   @rights(is: [SELF, MEMBER])
  contacts: [Contact!]!            @rights(is: [SELF, MEMBER])
  aliasOf(name: String!): String   @rights(is: [SELF, MEMBER])
  attest(module: String!): Boolean @rights(is: [SELF, MEMBER])
  archive: [Species!]!             @rights(is: [SELF, MEMBER])
}
type Mutation {
  invite(address: String!, nextPkHash: String, rights: String): Boolean @rights(is: [SELF, MEMBER])
  drop(address: String!): Boolean                       @rights(is: [SELF, MEMBER])
  extend(program: String): Boolean                      @rights(is: [SELF])
  install(program: String!): String                     @rights(is: [SELF, MEMBER])
  create(blueprint: String!, refs: [RefInput!], data: String, config: String, bindings: String): String
    @rights(is: [SELF, MEMBER])
  activate(address: String!): String                   @rights(is: [SELF, MEMBER])
  destroy(address: String!): String                    @rights(is: [SELF, MEMBER])
  upgrade(address: String!, blueprint: String!): Boolean @rights(is: [SELF, MEMBER])
  alias(name: String!, address: String!): Boolean       @rights(is: [SELF, MEMBER])
}
```

`archive` answers every species the ground can stand — fed and installed
alike, each with the digest `create` names it by; it is how a member
learns what a ground offers without a being of that species already
standing. `census` reads the registry, and the registry is every being
the ground holds, the administration included — a being like any other
counts itself; `stored` is what the shelf holds, `active` what stands
raised in the running process; `contacts` answers the two-sided union
the ground alone holds — per resident, who sits at its table and where
it sits — the owner's address book and the propagation work list, and no
being's own narrow view widens by it; `aliasOf` resolves a local alias,
and `alias` writes one — including `public`, the one name the core
reserves and refuses to leave unset. `create`'s `blueprint` and
`upgrade`'s name a species held in the archive; `install` is the one
field taking a program's text. `create`'s `data`, `config` and
`bindings` carry JSON as a string — `bindings` an object keyed by module
slot, each value the typed binding that slot's declaration named (VIII),
type-checked at creation and kept in the core's own `bindings/` cells
thereafter, where no resolver reads it and the ground alone carries it
to the module (_Scoping_). `RefInput`'s `groundAddress` and
`groundBoxPk` are optional, present only when the address named sits at
another ground: the same address and box key an outbound reference
already carries (V), seeded here so the reference this call writes can
be answered — a reply, a knock — without ever asking a directory. What
each field does is this article's prose; the shape is this schema, byte
for byte as this document writes it — the text is the identity (VIII).

**The composed core schema** — composed by the core at install, never
author-written, the fields behind IV's total-substrate law; byte for
byte as this document writes it, the text the identity (VIII). **Each
block below is one chunk**, appended in the order written here and only
where the being's own kind names it, its fields indented two spaces: the
comments are this document's and belong to no schema, and `extend type`
becomes a bare `type` for the first chunk of a root the author never
declared, because graphql extends nothing that does not stand (VIII):

```graphql
# Into every schema, and it carries no rights declaration — describe is
# how a caller learns its world, so every caller that proved itself is
# answered it, at whatever being it reached:
type Describe { address: String!, box: String!, schema: String, groups: [DescribeGroup!] }
type DescribeGroup { contract: String, name: String, members: [String!]!, schema: String! }
extend type Query {
  describe: Describe
}

# Into the public being's schema alone — the acts a caller uses to get
# standing, which by definition it cannot already have, and the one act
# whose whole authority is the proof it carries:
type Accepted { referred: String!, rights: [String!]! }
extend type Mutation {
  acceptInvite(proof: String!, nextPkHash: String): Accepted @rights(is: [MEMBER])
  rotate(nextPkHash: String!): String                        @rights(is: [MEMBER])
  release: String                                            @rights(is: [MEMBER])
  attach: String                                             @rights(is: [MEMBER])
  detach: String                                             @rights(is: [MEMBER])
  succeed(present: String!, box: String!, nextPkHash: String, heirBoxPk: String): String @rights(is: [MEMBER])
}

# Into the administration's schema alone — the act that spends standing
# a ground already has, and the two reads only its own hand may take:
type Unproven { at: String!, last: Float!, seen: Int!, since: Float! }
extend type Query {
  seated(being: String!, from: String!): Boolean @rights(is: [SELF])
  unproven: [Unproven!]                          @rights(is: [SELF])
}
extend type Mutation {
  offer(role: String, count: Int, expiresAt: Float): String  @rights(is: [SELF, MEMBER])
}
```

One field more is composed and is not pinned here: **`init`**, onto the
one being an unclaimed ground stands. What that being is and what the
act does belong to the implementation that stands it — a ground before
it is claimed is the one thing this document leaves to an
implementation's own paper (V, the one primitive) — so the field is
named here and spelled there.

`describe`'s `box` is the answering being's box public key as base64
(II) — the administration's being the ground's own; its `schema` and
`groups` are the caller's world, **and an empty world is answered
empty**: `groups` carries the one public group with nothing runnable in
it, and `schema` carries the scaffolding alone. A caller that proved
itself always learns the ground is there and always learns it holds
nothing for it, which are two different facts and both are owed. Public
is always one of the groups, so a world is empty only when public is
(X). `offer` mints an embryonic seat under the named role's `@invites`
ceiling (VI) and answers the proof, exactly once — the answer is the
only copy that ever exists. `acceptInvite` answers the bearer's address
as the door now knows it beside the roles the seat carries; `rotate`,
`release`, `attach` and `detach` answer the caller's address the same
way — the field name now carries what IV's retired table spelled as
`rotated`, `released`, `attached`, `detached`. **`succeed` stands on
public and not on the administration**, behind the same role
`acceptInvite` wears, because the proof is the whole authority: a hand
whose key hashes to the committed `nextPkHash` is the successor, and
nothing in this system asks where a caller stands. Its own `nextPkHash`
is optional — a successor may carry no commitment of its own, exactly as
a ground may stand with none — and a required one at the door would make
a succession the machine's own handle accepts refuse over the wire
(2026-08-27, found by a world running both paths). `seated` and
`unproven` are the ground's own reads of itself — whether a being would
answer a given voice at all, and the addresses whose writes have stopped
proving — and they stand behind `SELF` because they are custody looking
at its own machine, never anything a member is owed. A `@rights` line
here publishes where the field is visible; the authority that moves
anything is the seat each act proves (IV, V), never the line.

The administration is aliased `Ground` on its own ground; an alias is
local and settles nothing — the address is the only name.

## XI. Custody, and the honest limits

Running is custody: the machine's sovereign holds every voice on it, and
no cryptography on the same machine restrains its own host. Below the
door, protect custody with the host's own tools; above it, everything is
references. What this constitution deliberately does not close, every
implementation must state rather than hide:

- **An invitation is the only thing at the doors that expires, and it
  expires only when something spends against it.** The offer's own being
  judges the expiry it carries (V) against the clock its host feeds it,
  at the door, in the moment; nothing sweeps, so an expired offer sits
  in memory exactly as it sat and costs a refusal rather than a death. A
  peer that dies without releasing leaves its reference until the being
  drops it, and nothing else above the door falls away on its own —
  leases are a future mechanism, and a channel grant's own expiry (IV)
  is that law's own, not this layer's.
- **A tick is nobody's promise.** A claim is honoured while the host
  runs and no longer: a host that stops ticking simply stops, delivery
  is not retried, and no being can tell a silent clock from a slow one.
- **A sender's rising source** falling behind across a restart is
  silence at every door whose remembered mark it no longer exceeds: the
  receiver keeps the mark, the sender keeps nothing, and nothing lowers
  a mark short of V's own acts.
- **A seq spent is spent.** A relationship whose numbers overshot — a
  counter at the ceiling, an accident, a hostile envelope carrying a
  giant `seq` — is not repaired in place: a mark never lowers. The way
  back is V's own pair, drop and a fresh invitation.
- **A retired key kept is a fork kept.** A retiring voice that survives
  its own handover can certify a second successor at the same `v`: two
  chains verify, and the wire cannot choose between them. A peer that
  remembers the last key it trusted follows only a chain extending it; a
  stranger holding nothing but the address inherits the fork whole.
  Destroy what retires — an anchor outside the wire is a future
  mechanism.
- **The castle has a boss.** The administration's members replace any
  resident's program in place (`upgrade`, X), identity and references
  surviving, and the ground's self keys rewrite the administration
  itself. A peer detects a replaced program only by pinning the digest
  and asking describe again. Sovereignty inside the walls is this
  system's honesty, never its defect; what is refused is a master across
  the wire (XII).
- **A hand is today; a minted voice is today and tomorrow both.** A
  voice *handed* to a machine is a hand — the speaking and reading keys
  and a commitment whose key is kept elsewhere (III) — so whoever takes
  that machine takes the present and no future. A voice the ground
  *minted* is another matter: `create` mints it whole (VII), successor
  included, and it lives on the same shelf as the being it speaks for.
  Taking the shelf takes the present and the future of every being born
  there. Neither case cures a theft — everything a being holds today is
  the thief's the moment they have it — and the difference is only
  whether the name can be recovered afterwards.

What custody's own tools cost and concede — what a shelf reveals, what a
stolen copy still reads — is each implementation's to state in its own
paper, with the same honesty this section keeps.

## XII. The refusals

These are doctrine, not gaps. Quo never answers: a master across the
wire — an authority reaching into another's ground, an override no
signature carries — because a system where that reach is possible is
owned by whoever holds it; ambient authority of any kind; a shared
record of any relation; an unsigned word carrying authority; an error
that narrates to a stranger; a reference granted by proximity; or an
identity spelled two ways. And Quo never rules past the wire: a law an
implementation could vary without a second implementation noticing —
storage, hosting, custody's keeping — is that implementation's own to
state and never this document's to bind. Every one of these will be
requested by a reasonable adopter, and the committed answer is a
library, a module, or the adopter's own systems — never this core.

---

Copyright 2026 Razvan Gherghina

Licensed under the Apache License, Version 2.0. See LICENSE.
