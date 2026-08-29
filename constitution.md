
# The Constitution of Quo

For most of history there were no accounts. A person was known by their
hand and their seal: a letter carried its author's signature, wax closed
it against every eye but the addressee's, and the house that received it
judged it by the seal it wore — never by who carried it, and never by
asking a third house's permission. Houses were sovereign; each held its
own people and one gate; a house named its heir before it needed one;
and a stranger at the gate was met with silence, not with an explanation
of the locks.

Computing lost this arrangement, and Quo writes it down for machines. It
tells the story from the caller's chair, because that is where Quo is
lived:

**Quo is a pointer at a distance.** Someone offers you a way to reach
something of theirs. You claim it, and from that moment you hold a
pointer: you dereference a field, you await the answer, and what comes
back that has an address is another pointer to walk. The far side can
move without breaking your pointer, because a move is proved rather than
performed. The far side can also refuse you — every dereference is
judged again, at their door, against the standing you actually hold, in
that moment. A memory pointer carries authority just by being held; a
Quo pointer is a pointer that can say no. That single difference is the
entire protocol.

Quo answers one question — **by whose authority** — and refuses every
other. It binds exactly one thing: **interoperability**. A builder who
implements every article, in any language, produces a Quo that speaks to
every other.

**The line is drawn between strangers, not between implementations.**
What crosses from one house to a house that knows nothing about it is
pinned exactly: the arithmetic, the envelope, the door's judging order,
the one act that moves an occupant, the facts a first contact requires,
and the two fields a caller must be able to call before it holds
anything. What happens inside one house — how it stores, how it hosts,
what stands behind a field, how custody is kept — belongs to that
house's own papers and binds no one. So does what one house does against
a door whose contract its caller can already read: minting an offer and
dropping a seat are acts an owner performs at home, on a ground it can
already `describe`, and they are named by that ground's own contract
rather than by this document.

The narrower test matters, because the wider one — *could a second
implementation notice the difference* — is true of nearly everything and
would grow this document without end. Where bytes are pinned they are
pinned exactly; where a choice is left open it is named as open.

## I. The world

- A **voice** is the ability to be someone: keys that sign and read.
  Nothing else in the system is an identity, and there is no account, no
  person and no session anywhere. A human is as many voices as they
  choose to mint.
- A **being** is state with an address, reached at its ground's one
  door. Its address is a voice's (III) — a being that speaks holds keys,
  and `from` on the wire is always a being. What stands behind its
  fields is its implementation's own business and never this document's.
- A **ground** is one sovereign process holding zero or more beings
  behind exactly one door. It is not itself a being; what it shows the
  world is its own being, standing at the ground's own address.
- A **runner** is whoever stands a ground up: the host, holding every
  secret on its machine. Running is custody, and this document states it
  rather than hiding it.

**How a ground is born is told, never bound.** Folders, vaults,
processes, terrains — a laptop, a browser tab, an edge worker — are each
implementation's own. The law starts at the first envelope: a freshly
stood, unclaimed ground already answers its door, and the first act in
its life is an ordinary `claim` (VI) by whoever holds the proof its
standing committed to. An operator's tool written against this document
can therefore stand and claim any implementation's ground, which is the
first interoperability promise.

**There is no client category.** Every participant speaks from a ground
of its own, minted as cheaply as a browser tab; the minimal caller is a
small ground holding one being. Only a being can hold an edge, and
beings live in grounds — the law never needs an exception for "just a
user."

## II. The arithmetic

Public, stateless, identical on every machine. Nothing in it holds a
key, reaches a clock, or touches a store.

- **digest(bytes)** — SHA-256, rendered as 64 lowercase hex characters.
- **canon(value)** — the canonical bytes of a claim: RFC 8785 (JSON
  Canonicalization Scheme). Object keys sorted as UTF-16 code *units* —
  not code points, so a key outside the Basic Multilingual Plane sorts
  below one inside it — recursively, including objects inside arrays;
  numbers as RFC 8785 §3.2.2.3 renders them, which is ECMAScript's
  `Number::toString` in full and is implemented rather than approximated
  by a language's own float printing; `NaN` and `Infinity` are not
  values; strings escaped as JSON escapes them; UTF-8, no added
  whitespace. A member whose value is absent is dropped; an absent array
  element renders as `null`. Two semantically equal claims canonicalize
  to identical bytes on every machine, or signatures do not interoperate
  — and because a door verifies over the claim it *recomputes* (V), a
  disagreement here is never a mismatched field, only an envelope that
  will not verify.
- **address(pk)** — the one spelling of identity: prepend version byte
  48 (`6 << 3`) to the 32-byte Ed25519 public key, compute a
  CRC16-XModem checksum (polynomial 0x1021, initial 0) **over those 33
  bytes** and append it little-endian, encode the 35 bytes in RFC 4648
  §6 base32 (A–Z, 2–7) without padding: exactly 56 characters, beginning
  with `G`. **pkOf(address)** reverses it and answers nothing — never an
  error — on wrong length, wrong version or wrong checksum. The spelling
  is Stellar's on purpose: the key that signs an envelope can hold and
  move value on any ledger sharing the curve, with no second identity.
  Quo requires no ledger and stands with none present.
- **Signatures** — Ed25519 over canonical bytes, carried as base64.
  **Every base64 in this document is RFC 4648 §4 — the standard
  alphabet, with padding — without exception**: signatures, box keys,
  ephemeral keys and sealed bytes alike. A 32-byte key is therefore 44
  characters and never 43; a URL-safe alphabet is a different protocol
  and does not decode.
- **Sealing** — AES-256-GCM: a 32-byte key, a random 12-byte IV, a
  16-byte auth tag, no additional authenticated data; the plaintext is
  the value's JSON serialization in UTF-8. Whitespace and key order
  inside a seal are the sender's own, because the reader parses it
  rather than comparing its bytes — a seal is never canonicalized and
  never signed over. Carried as base64(iv ‖ tag ‖ ciphertext). Unsealing
  under a wrong key, or over one tampered bit, is silence and never an
  error.
- **sealTo(boxPk, value)** — seal to an identity: `boxPk` is a 32-byte
  X25519 public key; mint an ephemeral X25519 pair, agree with it, hash
  the shared secret with SHA-256 into the AES key, and carry
  `base64(ephemeralPk) + "." + sealed`. Only the box secret's holder
  opens it.

**Sealing is this article's only entropy, and everything else in it is
pure.** A fresh IV on every seal, a fresh pair on every `sealTo`. Both
**take their randomness as an argument** rather than reaching for a
global source, because the corpus (XI) pins every draw, and a seal whose
draws cannot be handed in cannot be pinned to the byte. Thread the
source in from the start; an implementation that does not will be
rewritten until it does.

## III. The voice

A voice holds two private keys, unreachable from outside:

- **present** (Ed25519) — the speaking hand. Signs claims; its public
  key is the address.
- **box** (X25519) — the reading hand. Others seal to it; only its
  holder reads.

A voice **may commit a future**: the `digest` of an opaque string it
keeps, carried into any seat it claims under the wire name `nextPkHash`.
**The commitment names no key.** It is the digest of a secret's own
UTF-8 spelling, and whoever shows the preimage becomes the occupant,
under whatever key signed the spending envelope (VI). The wire name is a
misnomer held for now, not a promise about what is hashed; nothing
derives it from a public key, and an implementation that did would
interoperate with nobody. Because the commitment is a secret rather than
a key, **an heir can be a passphrase on paper.**

Only a committed future can ever be claimed (VI), so a voice that
commits nothing can never be succeeded, and a voice born to a commitment
someone else keeps can speak but never succeed itself — which is how a
machine is handed a hand and not a lineage.

**Replacing the box key never moves the address.** The signing key is
the identity; the box is only what strangers seal to. So a voice may
rotate what it reads with as often as it likes, and every seat naming it
stands untouched (VI, the handover window).

How keys are derived, kept, exported and destroyed is each
implementation's own law. What every implementation shares is the two
keys, the optional commitment, and the one act that moves an occupant.

## IV. The envelope

The wire is plain JSON. **An envelope carries exactly five members**:

```json
{ "from": "G…", "to": "G…", "seq": 1,
  "sealed": "base64.base64",
  "sig": "base64" }
```

`from` and `to` are addresses — identity has one spelling. `from` is the
**calling being**, never its ground: the far door sees one being asking,
and keying a seat by ground would be authority by proximity (X). `to`
names the **ground**.

`sig` is the sender's Ed25519 signature over `canon({ from, op, seq, to
})` — those bytes are the envelope's **claim**.

`seq` is an integer, **strictly greater than zero** and no larger than
2⁵³ − 1, drawn from **one strictly rising source per voice** and checked
per seat, where the door keeps only that seat's high-water mark. One
source, many seats — because a `claim` arrives at the open door and
writes its mark on another being's seat (VI), so a counter kept per seat
would leave that fresh seat holding a number from an unrelated series,
and the caller's very next envelope to it would fall below its own mark.
The floor at one is not decoration: a seat written by `claim` takes its
mark from the spending envelope, and a mark below one would sit under
every envelope its occupant ever sent, handing the fresh seat a whole
replayable past.

The source must rise across restarts, or every seat this voice holds
refuses it. The law asks only that it rise, never that it be contiguous,
so a wall clock serves as well as a counter.

`sealed` is `sealTo(groundBoxPk, { op, reply })`: the op and the reply
key travel shut to the recipient's box, so the wire shows only who spoke
to which ground and nothing of what was asked.

`reply` is an **ephemeral box public key**, minted for this one envelope
and never reused; the answer comes back sealed to it, so a caller that
forgets the secret leaves nothing behind that opens a recorded exchange.

Nothing binds `sig` to a particular ciphertext, and nothing needs to:
the door verifies over the op it **opened**, so a substituted seal must
carry the same op to verify at all, and whoever cannot read the op
cannot rebuild it. That is also why `reply`, riding inside the seal, is
not in the claim.

**The op is a dereference, never a document.**

```json
{ "ask": "fieldName", "at": "G…", "params": { }, "budget": 30000, "reach": 8 }
```

One field, its params, the being it is aimed at. No query language
crosses a door and no contract notation does either (VIII): what travels
is a pointer's dereference — `ask` the field, `at` the being, `params`
the arguments, judged against the being's own contract. `params` is
optional and its absence means none. `budget` and `reach` are the span.

**The span** — what a caller allows a walk to cost, and the two numbers
answer two different questions:

- **budget** bounds what a walk *costs*: a duration in milliseconds,
  never a moment, because no two grounds share a clock and nothing here
  makes them agree. Each door measures from the envelope's arrival,
  spends as it goes, and hands onward what is left. A door still waiting
  when its share is gone stops waiting — and so does a door whose own
  turn outlives its share: a late answer is silence, because the caller
  has stopped listening.
- **reach** bounds whether a walk *ends*: a count, checked on arrival
  and decremented once when the walk is handed on, so `reach: 1` is this
  door and no further. Nothing based on time stops a loop, because a
  loop spends almost nothing.

A span member spelled anything but an integer above zero is **silence,
never a default** — a caller that meant thirty seconds and wrote it
wrong would otherwise inherit a door's generous default and never learn.
A caller naming neither is given the door's own defaults, which are the
door's to choose and generous by intent.

**The span is enforced by the door and handed onward to what answers.**
The door spends it, cuts a turn off when it runs out, and gives the
answering side what remains so a walk can carry it to the next hop. A
field is therefore able to read what is left of it; what a field must
not do is *widen* it, because the allowance is the caller's and no door
beneath may raise it.

## V. The door

**Every envelope arrives at one door and is judged in this order, and
the order is law.**

1. **Opening** — the sealed payload opens with the ground's box secret.
   A door that cannot open it has no question in front of it. Through a
   handover window a retired box still opens (VI); past the window it
   does not.
2. **Address** — `to` is this ground's own address, or silence.
3. **Proof** — `sig` verifies over the recomputed claim under
   `pkOf(from)`. Opening happens before verifying, because a signature
   over ciphertext would let anyone forward what they could not read.
4. **Shape and span** — the op carries a string `ask` and a string `at`;
   `budget` and `reach`, where carried, are integers above zero; and the
   span has something left. Anything else is silence.
5. **The seat** — the caller stands at the being named, or `at` is the
   ground's own being, **whose door is open**: any caller that proved a
   key is answered there. A caller with no seat at any other being is
   silence there.
6. **Replay** — at a held seat, `seq` exceeds the seat's mark, and the
   mark advances **before** the ask runs, so a turn that fails still
   costs its number. **The open door keeps no mark**, and keeps none
   even for a caller that holds a seat at the ground's own being,
   because the being decides this and never the seat. What is reachable
   there is one-shot by construction: an offer spends, a proof matches
   once, and a replayed `describe` re-answers into a reply key the
   replayer cannot open.
7. **The ask** — handed to the being named, whole, with the caller's
   address, the fact that it stands there, and what is left of the span.
   The door holds no schema and no resolver of its own; one hand-off, no
   routing. Whatever else a door hands inward is its implementation's
   own business.
8. **The answer** — the being's data, or silence — sealed to the
   envelope's reply key and nothing else.

**The sealed plaintext is `{"answer": <the field's own value>}`** — that
one member, the value whole inside it, and nothing else: no errors
member, no field name, no partial result. The member is not decoration.
A door seals exactly two things to a reply key and they must be told
apart by shape alone: an answer wears `answer`, and the handover news
(VI) — which is not an answer to a question — wears `handover`. A bare
value could be either.

Only the ground that opened the ask can seal to that key, so **the seal
is the answer's authenticity**: trust rides the seat the caller holds,
never a per-answer signature. What this deliberately does not give a
caller is proof to a third party of what a being answered. A receipt,
where an adopter needs one, is a field an author declares — a signed
body is data like any other — and never this surface's.

**The door judges two things and no more**, because these are the two
that cannot be fields on anybody's contract: whether the envelope was
written by the address it claims and sealed to us, and whether that
address stands here and is ahead of its own last word. Everything past
those is a field on a being. The one exception is `claim`, which the
door answers itself, because claim moves the very rows the door judges
and nothing else may write them.

**Silence has exactly two causes, and no third is ever written.** An
envelope the door cannot read as a question at all — addressed
elsewhere, unopenable, unverifiable, malformed, spent-span, replayed;
and a question naming what the caller's own world does not contain — a
field it may not open, one never written, a being it cannot see. One
silence, so absence and refusal stay indistinguishable and visibility is
worth something.

Everything else is data, **and an empty world is data**: a caller that
proved itself is always answered at the open door, with an empty estate
when it holds nothing — a ground with an empty lobby, never a ground
pretending not to be there.

**The measure.** One mebibyte — 1,048,576 bytes, counted on the wire, in
both directions: the envelope's body as it arrives at a door, and a
sealed answer as it arrives at a caller. It is counted on the transport
body rather than on the claim, because the count has to be enforceable
before anything is parsed — a door that must canonicalize a body to
learn whether it was allowed to read it has already spent what the
measure exists to bound.

**A door past the measure reads to the end and answers the same
silence.** It does not hang up: refusing faster, or refusing
differently, tells the caller *why*, which is a transport fact carrying
meaning (IX). The bytes cost nothing to discard; keeping them is what
would have cost.

Bytes beyond the measure never ride an envelope, and this document pins
nothing that carries them instead: a field answering where bytes may be
fetched, and on what terms, is data like any other, and the pointer it
hands back is judged at its own door like any other. A bulk transport is
a capability, not the minimum that proves a pointer, so it is an
implementation's or an adopter's and never this core's (X).

## VI. The seat, the pointer, and the one act

**A seat is standing granted at a being's door, kept by the ground that
granted it.** One row: who may ask, the replay mark, and the occupant's
committed future when it carries one — beside whatever standing the
implementation subdivides that seat into, which is its own affair.

**A pointer is the other side of the same relationship, kept by its
holder, and it is four facts:**

```
{ at, box, endpoint, ground }
```

the peer's **being**, the **box key** of the ground that holds it, that
ground's **endpoint**, and that **ground**'s address. Anything short of
all four is not a pointer: a being told only an address holds nothing,
because an address is a key and a key is not a place.

**An introduction is the three facts about a ground** — its address, its
box key (32 bytes, base64) and its endpoint (the absolute `http:` or
`https:` URL its door answers at, IX) — and an envelope cannot be built
without them. An introduction that also carries a being to start at and
an offer's proof is an **invitation**: everything a stranger needs to
arrive, which is why arrival takes no account, no ceremony and no third
party.

**A pointer is a fact in one being's memory — never a being, and never
the ground's.** An edge is not a node: if a pointer had an address, the
graph would traverse into its own bookkeeping. And it cannot be
ground-wide, or any being in a ground could spend any pointer —
authority by proximity, refused (X). The far door sees one being asking;
the edge belongs to that being. **No third party holds a record of any
relation.**

**How those facts reach a stranger is not this document's.** Printed on
a card, scanned from a screen, mailed, configured, resolved from a name
— each works, and pinning one would be pinning a user interface into a
wire protocol. What is pinned is *what they are*, so that a caller
handed them by any means can build an envelope against a ground it has
never met. A library may choose a spelling and share it — a URL, a card,
a code — and any two parties who both read that library will
interoperate by it. No such spelling is this document's, none is
canonical, and a builder who wants a different one is not deviating from
Quo. This document cites no library, and none speaks for it.

**A seat is held or it is not, and that is the whole of what this
document knows about standing.** Roles subdivide a seat, and subdividing
is an implementation's own business: a role name appears in no contract
a stranger can read and opens no field any ground can compute, so
nothing crossing a door has ever depended on one. What reaches a
resolver is a caller that stands at this being or a caller that does
not; everything finer is the answering being's own, judged by its own
resolvers, which are sovereign.

### The one act

**One act moves identity everywhere: prove-and-replace of a seat's
occupant** — the field `claim`, standing on the ground's open being:

```graphql
claim(at: String!, nextPkHash: String, proof: String!): Claimed
type Claimed { at: String! }
```

The seat at being `at` holds a commitment — an offer's `digest(proof)`,
or an occupant's committed `nextPkHash`. The caller presents the
preimage; the occupant is replaced by the caller, with the seat's
standing intact and a fresh commitment written when the caller carries
one — **and cleared when it does not**, because a commitment surviving
its own spend could be spent a second time.

Four old names — accept an invitation, rotate a key, claim an unclaimed
ground, succeed a voice — are this one act with different arguments.
`Claimed.at` is the being now held, `at` naming a being here as it does
everywhere else. It carries nothing more: a claimer that succeeded holds
the seat, and what that seat opens is read from the contract like
everything else.

**The proof is an opaque string, and the commitment is `digest` of its
UTF-8 bytes** — the spelling itself, decoded by no one. Nothing about a
commitment names a key. That is what makes an invitation, a rotation, a
ground's first claim and a succession one act instead of four: the seat
commits to a secret, and custody of the secret is custody of the seat's
future.

**A claim by an address that already holds a seat at that being is
silence.** The act moves an occupant, and nobody can be moved into
themselves; standing changes by a drop and a fresh invitation, never by
claiming over oneself. Without this, a seat table keyed by its occupant
must merge two relationships into one row — and a merge is how standing
nobody granted quietly appears.

**A seat written by `claim` takes its replay mark from the spending
envelope's own `seq`**, never a fresh zero: `seq` rises strictly per
relationship from the sender's own rising source, so every envelope the
occupant sent before — before a drop, before a rotation — sits at or
under the new mark and is silence. A fresh mark would reopen a recorded
past.

**An invitation is a seat in embryo.** A being mints an offer — the
standing it grants in its own vocabulary, and an expiry — and the proof
is answered exactly once, to the asker, sealed to that ask's reply key
and kept nowhere. The bearer spends it at `claim`. The expiry is judged
by the being that minted the offer, at the moment a spend arrives,
against its own host's clock — nothing sweeps, and an expired offer
costs a refusal rather than a death. An offer spends once; a spent or
expired offer is silence, for anyone, forever.

**Dropping** removes the seat whole — standing, mark, commitment
together — and the dropped party is a stranger from that moment,
indistinguishable from one that never called. A dropped peer returns the
way anyone arrives: by invitation. Nothing drops automatically.

### Rotation, and the handover window

**Rotation is news, not a mechanism.** A ground that replaces the box
key strangers seal to tells nobody by law: a peer that cares subscribes
to the being's own announcements the way it subscribes to anything
(VIII), and nobody is told what they did not ask to hear.

A peer that never subscribed goes stale, and its envelopes — sealed to a
retired box — are silence until it re-learns, with one mercy: **through
the handover window, the retired box still opens.** A ground holds the
retired secret for a window custody names in its own paper, and an
envelope sealed to it in that window is answered one standing body,
sealed to that envelope's reply:

```json
{ "handover": "<base64 X25519 public key>" }
```

That one member and no other, so a caller tells news from an answer by
shape and never by guessing. The body is **the door's own standing
shape, identical for every caller on earth and never a reading of what
arrived** — so it narrates no error and discloses nothing. It is the one
thing a door ever says in its own name, and it is not an answer to a
question.

**The news always names the box the ground reads with now**, never the
generation a stale caller happened to catch, so two rotations in a row
are caught in one hop. Past the window, a stale seal is pure silence
like any unopenable thing.

**A caller pays a handover once.** It takes the news, re-sends the same
ask against the fresh key, and answers its own program as though nothing
happened — and it does this exactly once per ask, never in a loop,
because a door that answered news to the fresh key as well would be a
door that never answers anything. A rotation is therefore invisible to
the program holding the pointer. A subscription already armed is not
disturbed by a rotation at all.

**Custody stands above the seat table, and this is honesty, not
defect.** The runner holds every secret on its machine and can already
speak as anyone it hosts; its standing at every resident is derived,
never granted, because a grant would be ceremony over a power it cannot
not have. On the wire, an owner's seat is a seat like any other —
grantable, claimable, droppable, several owners each able to unseat the
other. No seat binds the runner. Across the wire, no one outranks
anyone: authority is only ever a signature checked against a seat, and
being local grants nothing at any door.

## VII. Custody, and the honest limits

Running is custody: the machine's sovereign holds every voice on it, and
no cryptography on the same machine restrains its own host. Below the
door, protect custody with the host's own tools; above it, everything is
seats.

**The runner's own hand is not a caller, and is judged by nothing.** A
host holding every secret can already seal an envelope to itself and
answer it; making it do so would be encrypting a program's memory to
itself over a loopback socket, and the ceremony would prove nothing to
anyone. So an implementation may offer its runner a direct hand into its
own beings — no envelope, no seal, no seat, no replay mark — and this
document neither pins it nor pretends it away. It grants the runner
nothing custody did not already grant. **The door stays the only way in
from outside.**

**Distance changes latency, never judgement — for a caller.** One being
asking another inside a single ground is judged exactly as it would be
from across the world: the seat is read, the standing is the same, and
what the inside path skips is the encoding and nothing else. A ground
that let proximity widen a seat would have ambient authority back.

What this document deliberately does not close, every implementation
states rather than hides:

- **An offer is the only thing at the doors that expires**, and only
  when something spends against it. Nothing else above the door falls
  away on its own; a peer that dies without releasing leaves its seat
  until the being drops it.
- **A tick is nobody's promise.** A host that stops ticking simply
  stops; delivery is not retried by law; no being can tell a silent
  clock from a slow one.
- **A seq spent is spent.** A mark never lowers; the way back from an
  overshot counter is a drop and a fresh invitation.
- **A retired key kept is a fork kept.** An occupant that survives its
  own replacement can claim against a second door that never heard the
  news. Destroy what retires; a peer that remembers the last key it
  trusted follows only what extends it.
- **The castle has a boss.** The runner rewrites any resident, and a
  peer detects a replaced program only by asking `describe` again.
  Sovereignty inside the walls is this system's honesty; what is refused
  is a master across the wire.
- **The seat lifecycle is one third pinned, and deliberately.** `claim`
  is this document's field and works against any ground on earth,
  because a stranger arrives by it and a stranger knows nothing. Minting
  an offer and dropping a seat are never a stranger's acts: whoever
  performs them already stands at the being and can already read its
  contract, so they are that being's own fields under its own names. The
  cost is real and named rather than hidden — a tool that wants to
  invite against an unfamiliar ground must read its schema first, where
  a tool that wants to claim needs nothing.
- **A hand is today; a minted voice is today and tomorrow both.** A
  voice handed to a machine without its future's key loses only its
  present when the machine is taken. A voice a ground minted lives whole
  on that ground's shelf, and taking the shelf takes its future too.
  Neither case cures a theft; the difference is only whether the name
  can be recovered after.

## VIII. The ask

**A being's surface is a contract: named fields, each taking named
arguments.** That is everything the wire needs, because a dereference
carries a field name and its arguments and nothing else. How a contract
is *written down* is not this document's law — see `describe` below.

**Data or silence** — no partial results, no errors member, no null
standing in for a refused field. A field the caller may not open is not
a field it may name: naming it is silence, exactly as naming one never
written is. **A resolver that fails is silence at its own door, and the
ground stands.**

**A dereference either answers or arms, and no wire fact tells them
apart.** Most answer once; whether the author thinks of that as reading
or as acting is the author's own word and never this document's, because
the op carries a field name and no operation type. So **a being's field
names are one flat namespace** and two fields may never share a name.

The one that differs is a **subscription** — arming a field at the
source: *when this yields, deliver to me*. A subscription is a field and
fields take arguments, so there is no event vocabulary to pin:
`onTime(cron: "0 9 * * *")` is no more special than any other field.
Subscribing calls the source, so the source arms only what somebody
actually asked for; unsubscribing asks the source to let go, and which
subscription dies is the source's own reading of who is asking — one
peer cannot end another's. Stopping twice is not an error.

**A subscription's answers travel one of two ways, and the registration
never chooses:** down the channel the subscriber holds open — many
answers until it leaves — or, when the subscriber is not attached, as an
ordinary ask to the being the registration named. **The row names a
recipient, never a route.** Offline delivery needs no new anything: it
is an envelope from the source along an edge the source holds, and the
callback is itself a pointer pointing back. How a subscriber names that
recipient is the source contract's own argument.

**Many answers to one ask, and each is an answer like any other.** Every
one is sealed to the arming envelope's reply key — the same key again
and again — so the seal is still the authenticity and the subscriber
still needs nothing but the secret it kept. They arrive in the order the
source produced them, because the channel carrying them is ordered;
**nothing numbers them and nothing acknowledges them.**

**A subscription ends when the subscriber asks the source to let go, or
when the channel it rode closes.** There is no end marker: a channel
that closed has already said everything a marker would, and a marker
would be a transport fact carrying meaning (IX).

**The seat is judged once, when a subscription arms.** Dropping a peer
does not stop a stream that peer already holds, and a voluntary
unsubscribe is not instant either, because nothing acknowledges one. A
stream already armed stands through silence: its source is parked on a
push that has not come, and the push that finally ends it is the one
message the dropped caller never receives. An idle revoked subscription
is a held resource, not a leaked read.

**Revocation that must be immediate is a pattern, not a missing
primitive:** mint the subscription as its own being, and have its
resolver check the seat before every yield. The subscription is then
dropped by dropping that being, which touches nothing at the being it
was watching.

**Within an answer, everything is computed; beyond a pointer, nothing
is.** One ask runs one field's resolver, and the answer is whole — the
contract's nested types describe its shape, but no sub-resolver waits
inside it to be selected. A field that answers a being answers a pointer
— its address and the facts to reach it, never flattened content — and
walking into it is a new ask, judged again at its own door. Where the
line falls between folded data, a second field, and a pointer is the
author's craft, decided once in the contract where a reviewer can see
it.

### describe

**`describe` is the one pinned field besides `claim`**, on every
ground's open being, and it is where every stranger's story starts:

```graphql
type Describe { at: String!, box: String!, groups: [Group!]! }
type Group { contract: String!, language: String!, members: [String!]!, schema: String! }
```

(The shapes in this document are written in GraphQL's schema language
because it is compact and widely read. That is this document's notation,
the way a grammar is written in BNF, and it binds no implementation.)

`at` and `box` are whose door this is and the key to seal to — `box` the
ground's 32-byte X25519 public key in base64. `groups` is the caller's
own world, grouped: one group per contract the caller holds a seat
under, each carrying `contract`, the contract's **name**; the
**members**, only beings the caller's own standing already opens; and
the contract itself — `schema` as text, whole, and `language` naming
what that text is written in.

**The name is a label, never an integrity check.** It is how a caller
says *this being speaks the thing I know how to speak*, and two grounds
that never met may spell the same contract differently or spell
different contracts the same. A caller that needs to pin what it was
handed digests `schema` itself — the bytes are right there — and
compares that. This document pins no registry of names and adjudicates
no collision between two: a name is worth exactly what the seat that
disclosed it is worth.

**The contract's language is named, not dictated.** Two implementations
writing their contracts in different notations still exchange every
envelope, seat and claim without noticing, so a pinned notation would be
an opinion wearing law's clothes. But `describe` is where a stranger's
story starts, and a stranger that cannot read what it may call is
holding an address rather than a pointer. So one floor and no ceiling:
**every implementation can answer `"graphql"`** — GraphQL's schema
language, types and fields and typed arguments, never a query on the
wire — so any door is legible to anyone. Any other value is open by
name, exactly as a private carriage is (IX).

**`groups` are ordered by `contract` ascending and `members`
lexicographically**, so one state has one rendering and the corpus (XI)
can pin it.

**The ground's own being is never a group.** It declares no contract —
what it answers is `claim` and `describe`, which are this document's and
known in advance — so there is nothing to carry and nothing to group it
under. A stranger therefore never reads `claim`'s signature out of
`describe`, and a seated owner reads no more of the door than a stranger
does.

**The seat is the visibility grant.** A stranger is shown no group, no
being, no schema — that a being stands at an address is the first thing
a seat discloses — and a seated caller is shown the contract whole,
because the contract is the offer of the door it stands at. Nothing
finer is filtered, because nothing finer is filterable: rights are
judged inside sovereign resolvers, so no ground can compute which fields
a role opens. What a caller may actually call is judged per dereference,
data or silence. The schema travels as text, so a caller reads its world
with no engine of any kind — nothing parses a contract to answer an ask,
because an ask is a field name and its arguments.

**A group is a rendering, never a node.** It has no address and nothing
can be called on it; it exists so a schema is carried once instead of
once per member. It must never grow a filter — a group with filters is a
being with no address, and that is how every twist starts. Where members
are many, the way in is a field answering pointers: a collection is
itself a being, holding the index, answering in one turn, walked into
member by member — and a collection holding seats at its members is a
fresh authority, deliberately granted, never a view. **`describe`'s size
is bounded by grants, never by data**: a caller with ten thousand
members in its world holds them because somebody performed ten thousand
deliberate acts, so it needs no pagination and must not grow one.

**No on-behalf-of crosses the wire.** Authority does not flow along
edges: if A asks B and B walks to C, C answers B — shaped by B's own
standing, never A's. There is no delegation header and no origin; a
claim of "for whom" inside params is data, unverified, owed nothing. A
deputy acts as itself, deliberately; the transitive case is answered by
introduction — mint the third party its own offer — never by tunnelling.

## IX. The carriage

**One binding is canonical, and every ground reachable across machines
answers it:** an envelope travels as an HTTP POST whose body is the
envelope's JSON in UTF-8, to the ground's **endpoint** — the absolute
`http:` or `https:` URL carried in an introduction (VI), never guessed
and never discovered, because an address is a key and a key is not a
place.

The answer returns in the response body: **the sealed string itself, raw
UTF-8, unquoted and unwrapped.** Nothing but a sealed answer that opens
is an answer: no status code, header, or transport fact carries meaning,
and everything else is silence, whose own spelling is an empty response
body.

Because a status is meaningless to read, it must be constant to write:
**a ground answers `200` to everything it answers at all**, silence
included, with an empty body for silence. A ground spelling silence
`403` or `500` hands a stranger a narration (X) wearing transport's
clothes — and turns silence into an exception in a stock HTTP client,
which is the same defect with a stack trace. Anything arriving that is
not an envelope — a wrong method, a truncated body, a body past the
measure, plain noise — is answered the same way, and leaves nothing
behind.

**The second canonical carriage is the first one, held open.** An ask
that arms a subscription (VIII) travels as the same POST to the same
endpoint; its response is not closed after one answer but left open, and
each further answer is written to it as the source produces one,
separated by a single newline — a sealed answer is base64 and a dot, and
a newline appears in neither. The subscriber reads until the response
ends. A ground with nothing more to say closes, which is how a
subscription ends; silence is still an empty response body; and a caller
that armed nothing sees no difference from the paragraph above, because
one answer and a close is exactly what it always was.

**Nothing is added to the wire and no second port is opened.** A
subscriber behind a NAT, a proxy or a hotel wifi holds a channel open by
dialling out, which is the only way it could ever hold one — and one
door is enough for a relationship, because the row names a recipient and
never a route.

**An unreachable endpoint and a refusing door are the same nothing.** A
caller that could tell them apart would be learning from a door that
never answered it.

Any private carriage two parties share beside the canonical ones — a
pipe, a function call, a broker — binds only its own two ends and is
left open by name: freedom of transport between consenting grounds, one
mandatory way for strangers to meet.

## X. The refusals

Doctrine, not gaps. Quo never answers: a master across the wire — an
authority reaching into another's ground, an override no signature
carries; ambient authority of any kind; a shared record of any relation;
an unsigned word carrying authority; an error that narrates to a
stranger; a pointer granted by proximity; an identity spelled two ways;
a role vocabulary; a field name of its own beyond `claim` and
`describe`; a contract notation of its own; a query document on the
wire; or an on-behalf-of.

And Quo never rules past the wire: how a being computes, what stands
behind its fields, how a ground keeps its bytes at rest, where a ground
is hosted, how it is found, how bulk bytes travel, what a seat means to
a person or to a model — anything a house does at home, or against a
door whose contract its caller can already read, is that house's own.

Every one of these will be requested by a reasonable adopter, and the
committed answer is a library, a module, or the adopter's own systems —
never this core.

**A library is one interpretation of Quo, never the way to speak it.**

## XI. The proof

This document's conformance kit is a **vector corpus**: worlds described
in words — two, three, four grounds, who stands seated where — and
exchanges enumerated to the byte: this envelope, this answer; this
envelope, silence. Every input is pinned — keys, entropy, clock — fed to
the subject through its own shim, so byte-exact vectors are possible and
every silence in this text is dragged into the open: **a vector that
cannot be written down is a decision that has not been made.**

The corpus is a stranger to every subject. It carries its own
arithmetic, built independently, and speaks to a subject the way
anything else would — so a green is two implementations agreeing on
pinned bytes, never one implementation checking itself against itself.

An implementation passes the corpus, in any language, or it is not a
Quo.

---

Copyright 2026 Razvan Gherghina

Licensed under the Apache License, Version 2.0. See LICENSE.
