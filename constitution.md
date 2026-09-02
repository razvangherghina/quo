<!-- This is the published form of constitution.md, emitted on every release from the author's working tree, where the law is written beside the five kits that prove it. Propose a change at https://github.com/razvangherghina/quo/issues; an edit made to this file is replaced by the next release. -->

# The Constitution of Quo

Quo answers one question — by whose authority — and refuses every other.

This is the interoperability guarantee. It binds what crosses between
strangers and nothing else. Everything it does not bind is named in
Article II and is each warden's own.

## I. The world

**Quo is the definition of one thing: a warden.** A warden has a door,
holds ordinary pointers to the beings it keeps, and is the only thing
anybody implements. Nothing else touches the wire, sees a key, or opens
a seal.

- A **blueprint** is a class. Its digest is its identity.
- A **being** is an instance: fields, methods, pointers to other
  objects.
- **Cells** are its data fields — its own memory, nobody else's
  business.
- A **handle** is a pointer with an owner.
- A **ground** is a warden and the beings it holds. The process it runs
  in is where it lives, not what it is.

Pass an existing object to a warden and it is a being. Its source is
untouched, it never learns it has an address, and it carries no
authority logic: the warden mints the address, keeps the pointer, holds
the keys and holds the standings. A being is named by its pk, and the
warden minted it.

**A warden is total over what it holds, so Quo's guarantee is a
guarantee between wardens, not inside one.** A warden holds the keys and
reads the cells and can therefore impersonate any being it keeps.
Isolation between beings under one warden is worth nothing as a promise,
and this law does not claim it. A second warden is the only real
boundary.

**Wardens are strangers.** Two wardens on one machine have no privileged
path between each other: same door, same seals, same judgment. Two
beings under one warden need no signing, because it holds both. Two
beings under different wardens are signed by the caller, sealed to the
recipient, and judged from the seal alone — whether or not a network
lies between them. **The device never appears**, and no peer may ask
whether two doors share metal.

**There is no tenancy.** A being never lives under someone else's
warden; you reach across to theirs by standing at their door. A ground
may be as small as a page that mints a key, holds a being and dies —
that is a whole ground for as long as it lasts, and its peers meet
silence afterwards, which is already a legal answer. **A browser
ground's sovereignty is loaned, and this law says so rather than hiding
it**: the page that mints the keys was served by an origin, and whoever
administers the origin stands to the tab as a runner stands to a warden,
able to replace the code that holds the keys. Whoever wants sovereignty
nobody can revoke runs their warden on metal they control, which was
always the price of that.

**Three rules make the rest work.** A being never touches a key: keys
are the warden's, and a being holds a handle and asks its warden to
carry a call. A being judges nothing: the warden already knows whether
that voice may reach that being, and the object is handed the call and
answers. And the warden guards the caller: only after the judgment has
verified the voice and checked its standing may the caller arrive in the
context of the call to the being — a fact the house authenticated,
offered to the house's own layer, and never a judgment handed down. A
call that fails any step carries nothing inward, because it never
becomes a call. What crosses to a stranger says none of this, and the
offer changes no answer: permission lives in the warden's record alone,
and a being that branches on the caller to decide *whether* has rebuilt
the judgment in a place nobody can audit — telling peers apart is the
offer's whole purpose, and beings of their own remain the way to narrow
what a peer may do. The standings held at a being are offered the same
way, to that being's own layer alone.

**Narrowing is done with beings, and there is no other way.** A warden
records that a voice may reach a being and nothing finer, because it
does not know what a field means. A rules engine has nowhere in this
system to live.

**Quo never limits what fields a being has and has no opinion about any
of them.** Everything social — inviting, kicking, listing who holds what
— is an ordinary field an author chose to expose.

**A fact about a door belongs on the door's own being, never in the
envelope.** Anything a warden wishes to publish about itself is an
ordinary field on its own blueprint, asked for with an ordinary
describe. The size limit is the warden's, not the protocol's.

**No name in Quo resolves.** A warden may write private labels beside
its own rows; they resolve nothing and travel nowhere. What Quo refuses
is a name a stranger can look up to find a door, because that requires a
resolver, and a resolver holds the record Quo exists to delete.

**The warden is the global try/catch and it never throws.** A call is
answered with data or with silence, and there is no third thing.
Refused, broken and absent are indistinguishable by design; no door
narrates what happened behind it.

## II. What binds, and what does not

**What produces bytes between strangers is pinned here exactly. What
produces no such bytes is each warden's own and binds no one.** Each
warden's own, without exception:

- **Delivery** — retry, queueing, fire-and-forget, abandonment. Quo
  judges what arrives and has no opinion on how it got there or when.
- **Key custody** — sealed on disk, in memory, on a card, typed in each
  morning. Two wardens that keep their keys in unlike ways still speak.
- **Birth and first ownership** — the runner stands a warden up and owns
  it from the first second. No byte crosses a wire at birth. Quo starts
  at the first grant.
- **The device, and everything beneath the account the warden runs
  under.**
- **The replay window's width**, and whether an old padlock secret is
  kept.
- **Defaults** — what allowance a caller sets when it names none, how
  generous a door is, how it guards itself.
- **The clock and the randomness**, which are handed in rather than
  reached for.
- **How the judgment is carried out beneath its pinned order** — the
  eight steps, their order and what each judges bind (Article XII);
  everything beneath them is the warden's own, with a caller's
  bookkeeping and the shape a warden stores its records in. The two
  records (Article VII) name the facts a warden must keep, never how it
  keeps them.

Two implementations may differ in all of the above and still be Quo.
They may differ in none of what follows.

## III. The carriage

**Delivery's manner is free; the meeting point is not. Every warden
answers one named common carriage, and the common carriage is HTTPS.**
It is chosen for reach rather than for fit: it arrives through every
NAT, firewall and proxy, and out of a browser, which cannot open a
socket.

**The hint a warden published is the URL, posted to exactly as given:
one POST, bytes in and bytes out.** No path is appended, no query is
added, no header carries meaning, no status code carries meaning, and no
verb is checked — anything that is not a POST of a sealed body carries
no unsealable bytes and meets the same silence as any malformed message.
A framing header such as `Content-Length` is read for framing alone, and
a chunked response is legal, because a proxy nobody controls sends them.
The response body is the sealed answer; an empty body is silence's wire
form. Those two are the whole of what the carriage says back. A road
that never carried the bytes — a connection refused, a name that does
not resolve — said neither of them: that is weather, not silence, and a
kit reports it as the road's fault rather than inventing an empty body.
**The carriage's bound is the warden's published `limit`** (Article IX);
this road has no cap of its own. **The `limit` binds on every road,
distance zero included** — it is a fact a warden publishes about itself
rather than about a road, and a door that accepted locally what it
refuses over the common carriage would have made its own published
number false. **Any meaning in the carriage would be meaning outside the
seal, and there is none.** **HTTPS names HTTP's semantics, and the TLS
in front of a door is its operator's** — relied on for no guarantee, and
free to terminate ahead of the warden. A kit that cannot speak TLS
refuses an `https://` hint rather than dialling in the clear.

Beside the common carriage, any private carriage two consenting grounds
share binds only those two.

**On every road an answer rides the road its ask arrived on.** The
carriage answers in its response, the line answers down the connection,
a call returns; a road that cannot carry the answer back has lost it,
which is weather. No warden chooses another road for an answer, so no
caller waits on one.

**A road hands every frame it carries to the warden, and only the warden
learns which record a frame carries.** A road reads framing and nothing
else: it never opens a seal, never sorts asks from answers, and never
decides that a frame is not worth handing over. The payload's leading
byte says which record arrived, and it is inside the seal, so a road
that acted on it read what was not addressed to it and became a second
judge. Where one connection carries both directions, the road hands over
what arrives and takes back what the warden returns, in that order and
with no reading between.

**One more road is named, so that strangers meet on it without
agreement.** Naming makes a carriage standard, never mandatory: the
common carriage stays the one every warden answers, because a browser
tab can open no socket and reach outranks fit. A warden that answers the
named road answers it exactly as written here, or it has not answered it
at all.

**The line: framed envelopes over one persistent TCP connection**, for
the roads where both ends are consenting grounds and TLS and HTTP buy
nothing. A frame is a length written the way the wire encoding writes an
`int`, then that many envelope bytes, and nothing else — the length is
the frame's whole vocabulary, and it does not count itself: the length
is the envelope's bytes alone. Frames flow both directions on one
connection and either end may originate an ask, which is what lets a
ground that cannot be called dial out and be asked down the line it
holds. Each end reads while it writes — a peer that stops reading to
finish writing has made a deadlock, and the deadlock is its own.

**An answer returns on the line its ask arrived on**, even where other
roads stand, and answers return in whatever order the work finishes; a
line that drops before the answer rode it has lost it, which is weather.
Correlation lives inside the seal: the payload's leading byte says which
record arrived, and an answer names its ask by the answering warden and
the seq, read against the asks awaiting under the padlock that unsealed
it. Per voice the seq only rises, so no voice collides with itself;
where two voices, one return padlock, one far warden and one number
would make two answers indistinguishable, the sender's kit refuses to
send the second ask while the first waits (Article XII), and distinct
return padlocks dissolve the collision entirely.

**Silence has no wire form on a line.** The common carriage needs an
empty body because HTTP forces a response; a line does not — a refused
ask produces no frame, and the caller's own deadline is its own affair.
A zero-length frame is therefore malformed here, though a zero length is
a legal value everywhere else in the encoding. **A well-formed frame
whose envelope fails the judgment is ordinary silence, and the line
lives on.** Only a framing fault ends the connection — a length at or
below zero, or a length above the receiving end's cap — and it ends
without a word, because a peer that cannot frame cannot be spoken to. A
body the connection ends before delivering is the fault having already
happened.

**Each end of a line is a door for what arrives, and each holds a cap —
one number, that end's own, and the road says it before a byte flows.**
A bare `tcp://` hint promises the default: that end accepts envelopes to
16,384 bytes. A door with a different appetite declares its cap in the
hint it publishes, and a dialer reads it before connecting — no
handshake, no negotiation on the wire; the road describes itself the way
it already describes where it is, and a wrong cap costs what a wrong
address costs. An end that publishes nothing — the dialing end always —
promises the default, **and there is no way to promise more: a dialer
wanting answers above the default is a listener, or chunks** (Article
XV), the cap being judged on a frame's length before anything says what
the frame carries. A warden whose published `limit` is under the default
and whose hint declares no cap does not offer the line. A sender stays
at or under the cap the far road promised; generosity above it is
learned by asking `limit`, an ask small enough to fit under any cap a
door may declare.

**The line is dumb, not defenceless.** It negotiates nothing, keeps
nothing alive and reconnects for no one; a dropped line is weather, and
dialing again is the caller's affair. Keeping nothing alive is the
line's own discipline, not a muzzle on the road beneath it: a road's
housekeeping — a carrier's ping, answered below the line — is the road's
business, carries no meaning, and never reaches the judgment; a
middlebox that reaps idle connections is why a road may need one, and a
line held through such a road is cut or kept by the road's own care,
which is still weather to the line. How an end guards its socket —
reaping idle lines, bounding connections, bounding the asks it holds in
flight, refusing a frame that arrives one byte a day — is delivery, each
warden's own under Article II; the list is examples, never a licence,
and a reaped line is the same weather as a dropped one. Only the
listening end has a road to publish, and on this form its hint is
`tcp://host:port` — the host a literal address or a name, an IPv6
literal in brackets, the port always written — optionally followed by
`?cap=` and the door's cap in decimal bytes, and nothing after that. **A
hint is matched byte for byte as written** — case, leading zeros and all
— because a hint is compared, republished as news and stored in a row,
and two spellings of one road would be two roads. **A declared cap is a
floor**, as `limit` is: a door may accept more than it promised, never
less. A hint declaring a cap of zero or a port of zero names a door that
can take nothing, and is no road at all. **A `?cap=` that does not parse
is no road either** — a hint outside the grammar is not the hint this
article describes, and a caller walks past it as it walks past a road it
cannot speak, rather than guessing a default and sending frames on a
guess. **A cap above the door's own `limit` is legal**: the cap bounds a
frame and `limit` bounds an envelope, so such a door frames what its
judgment then refuses. **Two hints differing only in cap are two
roads**, by the byte-for-byte rule above and by nothing more — several
roads may lead to one door. The dialing end is reachable down the lines
it holds and publishes nothing; news for a peer that publishes nothing
rides that peer's next line if its sender's delivery kept it, and news
that finds no line is weather.

**The line has a second address form: the same frames carried as the
binary messages of a WebSocket over TLS.** It exists for the paths a
bare socket cannot walk — a browser tab, an edge that passes only the
web — and it changes no law above it: a message's bytes are one frame
exactly as written above, length then envelope, so everything this
article says of frames, caps, silence and faults reads the same on
either form. What the WebSocket adds — its handshake, its masking, its
control frames — is the road's own plumbing below the line, carrying no
meaning, and a road that put meaning there would be a road putting
meaning outside the seal, of which there is none. The hint is `wss://`
then host and optional port — absent, the port is 443 — then an optional
path, then the same optional `?cap=` and nothing after that: the path is
the operator's affair, dialled exactly as given and never parsed,
because a hint is opaque and one domain often fronts many doors. The TLS
is the toll such paths charge, relied on for no guarantee as ever;
**`ws://` names nothing** — in the clear the line is already `tcp://`,
and a second cleartext spelling of one road would be two roads.

**Consent is the road itself, and it gates nothing above the carriage.**
Publishing the line's hint, in either form, is the listener's consent;
dialing is the dialer's. A door reached over the line owes every caller
what any door owes, the stranger's case included — an allowlist on the
socket is a second gate this law does not have. **And the line is a
trade, named plainly:** the seal concedes nothing, but on the `tcp://`
form the road's observer reads what TLS elsewhere hides — the size,
count, direction and timing of every frame — and on either form anyone
on the path may cut the line at will. Both ends chose this road;
choosing it is choosing that.

**And at distance zero the carriage is a call — two houses in one device
or one process handing envelope bytes as bytes — which is a private
carriage like any other, needing no naming because no wire exists to
disagree about. What is law is this: distance zero waives no step of the
judgment.** The seal and the signature are what make them two houses —
and the bytes handed across are the receiver's own copy, never a view
into the sender's memory, or one house could rewrite what the other is
judging. Silence at distance zero is what silence is on every road: no
bytes handed back, a zero-length answer and no answer being one thing. A
ground that strips seal or signature for being local has rebuilt the
ambient permission this law exists to end. Within one house there is no
carriage at all, because there are no strangers.

**A hint is where to send bytes, and the judgment never reads one.** It
is an opaque string the carriage understands and the protocol does not
parse: nothing inside a hint reaches a warden, and no ruling anywhere
turns on what one says. Delivery is the half that reads it, and must —
it cannot tell one road from another otherwise, and a dialer already
reads a line's declared cap before connecting. Reading a hint is
therefore delivery's own affair under Article II, and it is the only
reading of one this law permits.

**There are several roads and none is authoritative, so choosing among
them is the caller's whole job.** A warden offers as many as it has and
ranks none; a caller takes the first it can speak that carried, and
nothing above the carriage names which it took. **A caller that met
silence may try the next road it can speak, and does it by re-sending
the identical envelope, never a fresh one** — the replay window is
exactly what makes that safe, the far door either having spent that
number already, in which case the resend meets silence and rightly, or
not, in which case it is honoured once. A fresh envelope for one
question is the unsafe act, because a message refused at routing or for
its leash has still spent its number. Whether to try at all is delivery,
and delivery is each warden's own. **Which roads a caller can speak is
its own platform's answer and nothing this law asks**: a kit finds it
out rather than being configured with it, and a caller that had to be
told is a caller whose ground was made to know something delivery
already knew.

**A road a caller cannot speak is not a road that failed.** Nothing was
sent down it, so no door spoke and no road broke: it is neither silence
nor weather. A caller walks past it exactly as it walks past a hint it
was never offered, and never reports it as the fault when a later road
turns out to be weather. A caller that can speak none of the roads it
was offered has tried no road at all — which is not weather either,
there being no road to report the fault of, and not silence, no door
having heard anything.

Nothing is proved by a hint arriving, because everything is proved by
the seal. **Many wardens may stand behind one hint**, since the
recipient is named inside the signed payload and only its own door can
unseal a message. And a hint on the common carriage is a domain somebody
else administers, which can be seized — but a warden's identity is its
key, never its hint, so a seized domain costs a peer one message: the
warden publishes new hints as news and every standing follows. The
register is a road, and roads can be rebuilt without anyone's
relationships moving.

## IV. The notation

**A blueprint is one canonical text, and its digest is SHA-256 over that
text as UTF-8.** Two wardens that describe one class and compute two
digests have not implemented one protocol.

```
ToDo
  add(title text) item
  complete(id text) bool
  items() [item]
  members() [being]

item
  id text
  title text
  done bool
```

A blueprint is a class name, its fields, and any record shapes they use.
A field is a name, its arguments, and what it answers. **Nothing else
exists in the notation — no permissions, no versions, no documentation,
no semantics.**

**The grammar.**

- An identifier is ASCII: a letter, then letters and digits.
- Every field in a class block carries parentheses, the zero-argument
  field included. No field in a record block carries them.
- Two arguments separate with a comma and one space.
- A field may answer nothing, written with no answer type; it answers
  zero bytes.
- Record blocks follow the class block **in order of first use,
  depth-first through the fields**. Within one field, first use runs
  left to right as the field is written: its arguments in their declared
  order, then what it answers.
- Field order is part of the identity. Reorder the fields and it is a
  different class.

**Canonical means literally canonical.** UTF-8, no byte order mark,
newline-separated, two spaces of indent, one space between tokens, no
blank line but the one between blocks, no trailing space, a final
newline, and no comments at all. **Newline means the one byte**: a
carriage return anywhere in the text is refused, as is a trailing blank
line and a byte order mark — a mark stripped would be a second way to
write one text.

**Refused, though the grammar allows them:** a record nothing uses; an
empty block; a record block declared twice; a field named twice in one
block; an argument named twice in one list; a class or a record wearing
the name of a closed type; a record wearing the class's own name; a
block written out of the derived order, refused rather than quietly
reordered. **A field and a record may share a name**: the two live in
different namespaces, and the collision decides nothing.

**The law states no maximum for a blueprint** — no line length, field
count, record count or nesting depth. A kit bounds what it will parse
and refuses beyond its own bound, the refusal the ordinary silence,
because guarding a receiver is each warden's own (Article II) and a
bound is never part of a text's identity.

**Capitalisation is a habit and not a rule.** The identifier rule is the
whole of the law.

**The types are closed:** `bool`, `int`, `text`, `bytes`, `b32` —
exactly thirty-two bytes, a key, a digest or a commitment — `being`,
`invitation`, `card`, `[T]` for many, `T?` for possibly absent, and the
record shapes the blueprint itself declares.

- **`being`** is a pk and nothing more, the one specialised `b32`. In a
  blueprint it is a label until it is granted; it opens no door. **A
  `b32` names nothing and a `being` names a being** — they ride
  identically, so the choice tells a reader whether the thirty-two bytes
  are an address it may call or a value it may only carry. A key, a
  digest or a commitment is `b32`; the pk of a being is `being`.
- **`invitation`** is the five things a holder holds, as one typed
  value. The warden never looks inside it, and holding one is not
  standing.
- **`card`** is the four things a stranger holds, as one typed value:
  the invitation without the voice.
- **The two combinators compose freely** — `[T?]`, `[T]?`, `[[T]]` are
  legal, and `T??` with them: an optional of an optional is ordinary,
  and Article V gives its two absences two distinct spellings. A
  trailing `?` binds outermost: `[int]?` is an optional list, `[int?]` a
  list of optionals.
- **A record may not reach itself**, directly or through another record.

**There are no versions.** Change a blueprint and the digest changes, so
it is a different class. Compatibility is the author's ordinary work:
keep the old being answering the old blueprint and grant the new one
beside it.

**A being's digest never changes for the life of its pk.** A different
class is a different being, minted beside the old.

## V. The wire encoding of the types

Each type has exactly one way of being written.

- **`bool`** — one byte: zero is false, one is true.
- **`int`** — eight bytes, signed two's complement over its whole range,
  most significant first.
- **`text`** — a length in front and UTF-8 after it; the length counts
  bytes, not characters. **A text is carried as given and never
  normalised**: two Unicode normalisation forms are two values, and a
  kit that repairs or normalises has forged a second spelling. An
  encoder handed bytes that are not UTF-8 refuses to write them, as a
  decoder refuses to read them — a kit may not write what no kit may
  read.
- **`bytes`** — a length in front and the bytes after it.
- **`b32`** — thirty-two bytes with no length in front.
- **`being`** — a `b32` carrying a pk: the same thirty-two bare bytes.
- **`invitation`** — five things in a fixed order: the granter's warden
  pk, its heir commitment, the padlock pk — thirty-two bytes each, no
  lengths — then the granted voice's heir keypair as public then secret
  key, thirty-two bytes each, then the hints as `[text]`.
- **`card`** — four things in a fixed order: the warden pk, its heir
  commitment, the padlock pk — thirty-two bytes each, no lengths — then
  the hints as `[text]`. An `invitation` with the keypair struck out;
  the fields it keeps ride exactly as they ride there.
- **`[T]`** — a count in front and that many `T` after it.
- **`T?`** — one byte: zero is absent, one is present — and the value
  only when present.
- **A record** — its fields, in the order the blueprint declares them,
  and nothing else. No names on the wire.

**Every length and count is written the way an `int` is, and is
non-negative by rule.**

**No type encodes to zero bytes.** A `bytes` that is present and empty
is not an absent `bytes?`. `T??` is an ordinary type and its two
absences are two distinct byte strings. A byte order mark inside a
`text` **value** is ordinary content.

**Malformed bytes are the receiver's to refuse, and the refusal is
silence.** A negative length, a count beyond the bytes that remain, or a
size beyond what the receiver can address is refused on decode,
indistinguishable from any other refusal. That last bound is
deliberately the receiver's own — a missing constant nowhere, each kit's
to set and refuse.

**And where this text does not say what something means, it is
refused.** A `T?` marker byte that is neither zero nor one, bytes left
over after a well-formed value has been read, and their like: a receiver
meeting one refuses in silence. A value with a second legal spelling is
a value with a second identity, and this protocol names things by the
hash of their bytes.

## VI. The arithmetic

Four algorithms, named once and never negotiated.

- **Ed25519 signs** — every signature in Quo, by a warden's name, a
  voice or an heir. The thirty-two bytes a signing pair is minted from
  are the seed as Ed25519 defines it, and the public key is derived by
  the algorithm's own rules. **Verification is RFC 8032's check, and
  before it one named refusal: a public key that is all zeros or of
  small order is silence, no signature examined.** The pre-check stands
  in front of whatever verifier a platform supplies, so no kit
  reimplements the arithmetic to comply; a platform whose verifier is
  stricter than RFC 8032 refuses more than the law requires of it, and
  what the pre-check covers is the case where that difference could make
  two kits disagree about a key that verifies anything.
- **X25519 seals** — the padlock is an X25519 public key; a caller mints
  an ephemeral pair, agrees with the padlock, and needs no key of its
  own. The thirty-two bytes a pair is minted from are the private key
  itself, as X25519 defines it. Clamping happens inside the algorithm;
  Quo neither restates it nor derives the key from a seed first. **An
  agreement that hands back thirty-two zero bytes is refused at the
  point of agreement**: the padlock was not a real key, and a seal
  derived from it would protect nothing.
- **SHA-256 commits** — every digest, and every heir commitment. **A
  commitment is the hash of the pk of the warden the heir would spend
  at, then the heir's pk, each thirty-two bytes, concatenated in that
  order.** For a standing's heir that warden is the granting door; for a
  being's, the warden that holds it; for a warden's own name, itself.
- **AES-256-GCM encrypts**, with the key derived through **HKDF-SHA-256
  under a fixed label**. HKDF is used whole — extract, then expand — and
  **its input keying material is the raw thirty-two-byte shared secret
  exactly as the X25519 agreement hands it back**: nothing prepended,
  nothing hashed first. The derivation is pinned: an empty salt, meaning
  a salt of zero length rather than a run of zero bytes; the fixed ASCII
  info `quo-seal`, the label and the info being one constant and not
  two; and forty-four bytes drawn — thirty-two of key, then twelve of
  nonce. The nonce needs no randomness of its own, because the key it
  pairs with is fresh on every message by construction. **The tag is
  sixteen bytes, full length, and it is the last sixteen bytes of the
  box**: ciphertext first, tag after it. **The additional authenticated
  data is the ephemeral public key** — the one thing outside the seal,
  bound to it so lid and box cannot be mixed and matched.

**There is no suite identifier and no negotiation.** No message says
which algorithms it used. Changing the suite is not a version of Quo; it
is a different protocol.

**A key is 32 bytes.** Any prettier spelling of one is a kit's
convenience.

**Every draw of randomness is taken as an argument, never reached for**,
and a fresh sealing key is minted on every seal.

## VII. Keys, records and standings

**Two kinds of key, and the padlock is the door's alone.** A warden
carries a signing pair — its name, which never moves without succession
— and one encryption pair, the padlock every message to this ground is
sealed with. Beings and voices only ever sign: a voice is a signing
pair, its heir is a signing pair, a being's pk is a name and never a
lock. A caller locks with the far warden's padlock and needs no key of
its own; only that warden's secret opens what arrives. The padlock is
replaceable without the name moving.

**The padlock is per relation, and whether it is reused is the warden's
own choice.** Quo requires neither, and says only this: one padlock
across many relations is one identifier across many relations.

**The heir is a keypair, and the commitment binds the door as well as
the key** (Article VI). There is no separate secret token: handing out
the heir is handing out a keypair, and an heir-seal signature is a
signature by a key whose public half hashes — with the door's name — to
the committed value. **Every rotation carries a fresh commitment**, or a
standing could be taken over once and never again. **Freshness is the
holder's duty and the door never checks it**: a door comparing the
arriving commitment against the one it holds catches only the case of
committing twice to the same key, and never the case of committing to an
older one, which no door can see without keeping every commitment ever
filed. A half-check tells an implementer it is protected where it is
not.

**A warden keeps two records, and they are not the same shape.**

- **Inbound** — which voices may reach which of its beings, **binary per
  being**. A row is the voice's pk, the hash of the next pk, the beings
  it reaches, the highest number honoured, and how to answer that voice:
  the padlock it named and the hints it gave.
- **Outbound** — which of its beings may spend which relation. A row is
  the invitation kept whole: the far warden's pk and heir commitment,
  the padlock for that relation, the current voice's keys, and the
  hints.

An inbound row keeps a way back and not only a permission, because news
is the warden speaking first. The way back is refreshed by every call
that arrives. **An empty hints list means the road did not change, never
an erasure** — the same rule the news direction carries, for the same
reason: an end that publishes nothing, the dialing end always, sends
empty hints by nature, and erasing on that would destroy the way back on
its first ask.

Per being a warden keeps the ordinary pointer, the being's keys, and the
blueprint's digest.

**What a holder holds — the invitation — is five things:** the granter's
warden pk (the name), the hash of that warden's heir, the padlock pk for
this relation, the heir keypair of the voice being granted, and one or
more hints.

**A stranger holds a card, which is the invitation without the voice:**
a name, an heir commitment, a padlock, and hints. **A card is not a
register and nothing resolves it**; it travels the way a phone number
travels. **A card carries no standing whatsoever** — holding one lets
you seal to a door and be judged as a stranger. Granting remains the
only way anything is opened.

**There is no invitation mechanism.** A call is one of two kinds:

- **ask** — signed by the key that already holds the standing.
- **rotate-and-ask** — presents the heir's secret, takes the standing
  over, and asks in the same act.

The two are told apart at the door by the signature alone. **Rotation is
never a call of its own; it is a prefix on an ask**, and taking over a
standing tells nobody.

**Letting someone in is a rotation.** Mint a voice, hold its keys,
record that it may reach a being, and hand out its heir. **Accepting an
invitation, moving a being to another warden, and succeeding a stolen
key are one act with different arguments.**

**The grant is a relation to a voice, never to a person.**

**A standing is amended, not replaced.** The warden adds a being to a
voice's row or takes one away; nobody is told, no secret is minted, and
the holder finds it on its next describe. **Taking the last being away
is release, and there is no separate act for it.**

**An invitation is spent, not held.** Whoever minted a voice has seen
its keys and its heirs, so until the holder rotates to a key it
generated itself the granter can speak as the holder at its own door.
The holder's first act is a rotate-and-ask carrying a fresh commitment
to a key nobody else has seen.

**A standing can be transferred but never copied.** There is one holder
always: the moment someone else takes the voice over, the previous key
is dead.

**A pointer is not transitive.** An answer may carry a being's name, and
for the receiver that is a label. Standing travels by grant alone —
though an answer may deliver one, as the `invitation` type. Data can
carry an invitation; data can never be a standing.

**A holder can always re-share by proxying, and the granting door never
learns.** A grant is trust in the holder; the narrowing answer is to
grant a small being.

**Getting the secret to the other person is not Quo's business.** It is
an opaque string, and whoever sees it first becomes the holder,
including whoever minted it.

**Nothing expires on its own, nothing sweeps, and no door holds a
timer.** A rotate-and-ask arriving two years late is judged when it
arrives. **A standing ends whenever its warden drops the row**,
including on a date the warden chose; the holder meets silence, and no
peer can tell a term expired from a mind changed.

**In a chain, each hop acts as itself.** The caller at the second door
is the first being's voice, judged by its standing. Authority does not
travel along a walk.

**One voice is used from one place.** Two machines sharing a voice keep
two counters, and one will be silently refused.

**A restart changes nothing a peer can see.** What survives is both
records, the beings' names, and the replay marks.

## VIII. The seq and the leash

**A message spends once, and the seq is what spends it.** Every signed
payload carries a number, and per voice that number only rises. **The
first legal number is one, and a fresh standing's mark says nothing
honoured yet.** No clocks are compared, because two wardens share none.

**Which number a caller opens with, above one, is the caller's own.** A
fresh mark is empty, so every number at or above one stands above it:
the door honours what arrives and the mark moves there. **No door
requires a first message to carry exactly one.** A door that did would
refuse a conforming stranger, and every refusal here is silence — which
tells that stranger nothing to fix and leaves it holding a standing it
cannot use. **And the trap is in where the refusal falls**: the rotation
lands at step 4 and the number is judged at step 5 (Article XII), so
**the takeover has already happened** when the silence comes back. The
standing now stands on the new voice and the old key is dead. A holder
that reads the silence as "the rotation did not land" and tries the
whole rotate-and-ask again signs with the key it just retired, and is
refused for that, and every time after. What was recoverable — ask again
on the new voice — is lost by the one reading of silence a caller would
naturally make. What an opening number reveals about a caller's own
bookkeeping is the caller's to spend, as Article II leaves every such
bookkeeping to it.

**The door keeps a window, not a line.** It keeps two facts per
standing: the highest number honoured, and which numbers below it are
already spent. Above the mark is honoured and moves the mark; inside the
window is honoured once and never again; below the window is silence.
**Honoured means the number is consumed, and nothing later gives it
back** — a message refused at routing or for its leash has still spent
it. **How wide the window is, is the warden's own, and zero is a width**
— a door that honours only strictly rising numbers keeps both facts and
keeps its spent set always empty. No peer can tell a narrow window from
a wide one, because a number below the window meets the same silence a
lost message does. Both facts survive a restart — and forward: a ground
restored from an old backup has rewound its marks and re-opened every
number spent since, which is a real event with a real consequence, and
belongs on the list of things whoever operates a ground watches for.

**A walk carries its own leash, and the leash only shrinks.** The
caller's allowance — a time budget and a hop count — rides the message,
and every door hands onward less than it received, never more. No door
beneath may widen it. **Where a door's own two readings yield a dwell
below zero, the onward budget is the arriving one** — the rule that no
door widens a leash is absolute, and a door's clock is never a peer's
fault.

- **The hop count falls by one at every door.**
- **The time budget falls by each door's own dwell**: the difference
  between when the message arrived and when it was handed onward, two
  readings of one clock. **The road is never counted.**
- **The two readings are taken at the ends of the judgment** — the
  arrival one at the first step, before anything is unsealed; the onward
  one at the moment of handing onward.
- **The leash is judged on what arrived**: a time budget at or below
  zero, or a hop count below zero, is silence. **A hop count of zero is
  a legal leash for a call that goes no further** — what it forbids is
  onward. An onward ask carries the arriving hop count less one and the
  arriving budget less this door's dwell; where either would fall below
  zero, or the budget to zero, the onward ask is not made and the work
  already routed stands.

**A budget that runs out mid-work interrupts nothing.** The leash is
spent before routing, so what an exhausted budget stops is the next
onward ask. A caller's own deadline is its own affair.

## IX. The warden is a being, and here is its blueprint

The warden is a being, so it has a blueprint. It is the one blueprint
nobody authors and every warden holds, and its digest is the same on
every ground in the world.

```
Warden
  describe() estate
  sketch(being being) sketch?
  blueprint(digest b32) text?
  limit() int
  tell(word word)
  moved(being being) word?
  receive(cargo cargo) b32

estate
  classes [class]

class
  digest b32
  beings [held]

held
  being being
  commitment b32

sketch
  being being
  digest b32
  commitment b32

word
  being being?
  successor b32?
  commitment b32?
  name b32?
  padlock b32?
  hints [text]

cargo
  being being
  digest b32
  cells bytes
  standings [standing]
  relations [relation]

standing
  voice b32
  commitment b32
  name b32
  beings [being]
  mark int
  spent [int]
  padlock b32?
  hints [text]

relation
  warden being
  commitment b32
  padlock b32
  voice b32
  secret b32
  heir b32
  heirSecret b32
  seq int
  news int
  hints [text]
```

**Two of these fields carry what a row would otherwise lose in a
migration**: `standing.name` — the name the heir commitment was minted
under (Article XIV), without which a migrated standing could never
verify an older commitment again — and `relation.news`, the mark kept
for that far warden's news, held apart from `seq`, the count of what
this door sends, because one field cannot be two counters.

**Every list in a cargo is ordered, and the order is derived rather than
chosen**: `standings` by the voice's bytes ascending, `relations` by the
far warden's bytes ascending, `beings` under a standing by their pk
bytes ascending, and `spent` numerically ascending. This is Article X's
rule for an estate, and it is here for the same reason: **a cargo
crosses the wire, so two wardens packing one being must produce one byte
string.** A record kept in whatever order a map happens to yield is a
record that differs from itself between two runs of one kit, and nothing
could then compare, cache or re-derive it.

**The public being's pk is the warden's own name.** The key that names
the house and the key that names the being the house speaks as are one
key.

**The public being is reachable by everyone, holders included**, and
appears in every estate.

`describe`, `sketch` and `blueprint` are the three describes, each
scoped by the same binary record. `limit` is the only fact this law
makes a warden publish about itself: **the largest message it will
accept, counted in bytes of the whole envelope as the carriage delivers
it — the ephemeral key and the ciphertext together**, the one size a
caller can compute before sending. Anything else it wishes to publish it
declares in a blueprint of its own beside this one. `tell` is news;
`moved` is the old door's pointer, which is why the two carry one shape.
`receive` is a migration's state transfer — an ordinary field spent by
an ordinary standing granted in advance, and its answer is the
commitment of the key the destination minted and the origin never saw,
hashed under the destination's own name. **A destination mints two keys
— the one the being is named by and that one's heir — and the commitment
is of the first**, the being's new name, because that is the key the
second rotation moves the being's identity to and the key a peer hashes
a succession against when it believes news. **`receive` carries a
digest, never the blueprint's text, and the digest identifies rather
than delivers: a destination that does not already hold that class
refuses the cargo in silence, and there is nobody it may ask.**

## X. The describe

**What a describe contains is the blueprint.** A describe hands back
what the warden already holds, and never a being's state.

- **One being** — its pk, the digest of its blueprint, and its heir
  commitment. The digest is what the caller may do with it: what a
  blueprint does not declare does not exist. The commitment is what lets
  the peer believe that being's succession when the news comes; the peer
  keeps it beside the relation, and believed news rewrites it.
- **An estate** — every being that voice may reach, given as digests
  with the pks and their commitments under each. **The order is derived,
  never chosen: classes by their digest bytes ascending, beings under
  each by their pk bytes ascending**, so two wardens describing one
  estate produce one byte sequence.
- **A blueprint** — asked for by its digest, and answered only if the
  asker already reaches a being of that class or the warden's own public
  being declares it. Otherwise silence.
- **The stranger's case** — no standing anywhere, so the estate is the
  warden's own public being and whatever that warden exposes beside it.
  **What a warden exposes, every voice reaches**, and a warden that
  exposes nothing shows a stranger one room.

**Every describe is scoped by the same binary record, without
exception.**

**Silence and absence are two different answers.** Silence is for what a
voice may not reach. An absent optional is a legal answer to a legal
ask: nothing has moved, so `moved` answers absence. A door that answered
"absent" about a being you do not reach would be a door confirming that
being exists.

**A being that has left is reached for `moved` by the succession the
door published, and by nothing else** — to a holder who reached it
before, never to a stranger. Otherwise Article XIII's own sentence would
be false: the peer it sends to ask `moved` would meet silence, because
after the move that name stands in no standing anywhere. The published
succession is what a holder is owed, and it is the whole of what this
answers.

The describe caches, because a digest never changes meaning; and it
verifies, because content-addressed text cannot be swapped by whoever
carried it.

## XI. The envelope

**A message is a sealed box with the key to open it stapled to the
lid.** What crosses is an ephemeral public key and then one ciphertext,
sealed to the recipient's padlock. **Nothing else is outside**, and the
ephemeral key leaks nothing: fresh on every message, belonging to no
one, never reused, naming neither the sender nor the sender's house.

**Inside the seal are two things: the payload, and one signature over
it.** The signature is the last sixty-four bytes inside the seal — fixed
size, needing no length in front of the payload. **The payload begins
with one byte naming the record it carries — zero for a `say`, one for
an `answer` — and the signature covers that byte with the rest.**
Position decides nothing: on a held line an ask and an answer arrive the
same way, so the payload says what it is, and what it signs can never be
read as the other record. Any other first byte is silence, and a record
presented under the wrong byte is silence too. **The byte is checked
against what the receiver expects, never merely read: a door takes only
the `say` byte, and a caller reading an answer only the `answer` byte.**
There is no generic open — a payload crafted to decode as both records
decides nothing, because neither end ever offers it the choice.

**The signed payload is one record in Quo's own notation, encoded by the
notation's own rules.** Not canonical JSON, and not a second binary
format beside the notation. **The payload is a record and its name is
`say`** — one utterance from a voice to a door.

```
say
  voice b32
  recipient b32
  commitment b32?
  seq int
  padlock b32
  hints [text]
  allowance allowance
  being being?
  method method?

allowance
  time int
  hops int

method
  name text
  args bytes
```

- **The voice** is the signer's public key; it travels, because a
  signature proves nothing without it.
- **The recipient** is the door this message is for, named by whichever
  key the sender holds: the warden's name when it has one, otherwise the
  padlock it seals to. A message presented at any other door is silence.
- **The commitment** is present only when the message spends an heir,
  and is present whenever one is spent. A plain ask carrying one is
  refused, and a rotation carrying none is refused — Article XII's
  fourth step makes the carried commitment the new heir, and with
  nothing carried the step has no outcome and the standing could never
  change hands again. **News is not a rotation and does not use this
  field**; a succession announced as news carries its next commitment in
  the `word`. **Those two are the only refusals, and everywhere else a
  carried commitment is ignored rather than refused** — by news, and by
  a voice this door has never met. They are the two cases where the
  field has work to do and the work cannot be done; elsewhere it decides
  nothing, and a door that refused news for it would meet a succession
  with silence, which is the one message a house cannot afford to have
  refused.
- **The seq** is the number that only rises for this voice.
- **The padlock and hints** are how to answer, and how to speak to this
  caller later.
- **The allowance** is two `int`s, time then hops, **the time budget in
  milliseconds**.
- **The being** is the pk addressed, or absent.
- **The method** is one optional record: a name and its arguments as one
  opaque, length-prefixed blob whose meaning belongs to the blueprint —
  present together or absent together, the blob empty when the method
  takes nothing. A method's blob is its arguments in declared order,
  each by the notation, concatenated. The warden never looks inside.
  **Bytes left in the blob after the declared arguments are refused, and
  the refusal is the being's, never the warden's** — so it reaches the
  wire the way every answer of a being's does, as data of the field's
  declared answer type, and never as silence. Silence is the door's
  alone.

**A call meets two layers, and only the first can be silent.** At the
door the warden judges, and what it produces is silence or a call that
goes through to the being — there is no third outcome and no explanation
of which. **Past the door the being always answers**: data where its
field declares data, and the `answer` record's absent `data` where the
field answers nothing. **A being never produces silence**, and nothing
it does reaches back into the judgment.

**So an error is data.** A being that wants its caller to know it said
no says so in a field its blueprint declares, like everything else a
being says — Article XV's rule, that every such thing is a field
somebody writes in a blueprint, is the whole of the answer here. There
is no refusal channel from a being to the wire, because a being judges
nothing and a channel like that would be a judgment handed down where
nobody can audit it.

The cost is stated rather than hidden: **on a field that answers
nothing, a call that ran and a call the being refused are the same
bytes.** A being whose callers must tell those apart declares a field
that says which, and that is the being author's affair, not the
protocol's.

**The caller's warden is not named.** The payload carries a padlock and
hints and nothing else about the caller's house. This does not make a
caller unlinkable: a caller that answers every door with one padlock has
told them all it is one house.

**Nothing in the message marks it as an ask or a rotation. The kind is
read off the voice, never declared.** A caller cannot claim to be
rotating.

**The answer is one record in the notation, like the ask.**

```
answer
  warden being
  seq int
  data bytes?
```

The answering warden's name, the number of the ask it answers, and the
data — absent when the field answers nothing — with the warden's
signature as the last sixty-four bytes inside the seal, mirroring the
ask. **The signature is verified against the `warden` the record itself
carries**; that this warden is the one the ask was sent to is the
caller's separate judgment, and Article XII names both checks. An
answer's data is the field's declared answer type by the notation's
rules, so both directions ride one encoder.

**`say` and `answer` are named so that two implementers write one shape,
and for nothing else.** Neither is a class, neither is described, and no
digest of either is ever computed or carried. The notation cannot print
a record block with no class above it, so no parsable blueprint of
either exists; a wrapper a kit writes to parse them is its own and
decides nothing. Their fields ride in the order given here, and that
order is agreed because this text fixes it.

**The answer names the ask by its seq, and that is the whole of it.** No
second counter, no identifier, no clock.

## XII. The judgment

**In order. Every failure is the same failure: the door answers with
silence and never says which step it was.**

1. **Unseal** with the warden's own secret, and decode what comes out —
   the leading byte, which at a door must say `say`, then the `say` and
   the signature behind it. Decoding is part of unsealing rather than a
   step of its own.
2. **Verify** the signature over the payload, using the voice the
   payload carries.
3. **Check the recipient.** The name or padlock the payload carries must
   be this door's, or the message is silence. Here and not later: a
   payload addressed elsewhere must never touch this house's records.
4. **Place the voice**, in the two records and in that order. Found as a
   current holder in the **inbound** record → an ask. Not found there,
   but its hash matches a standing's heir commitment → a **rotation**,
   and the standing changes hands before anything else is judged.
   **Matching more than one standing is silence** — no order over the
   records is law, so any door choosing between them would choose
   differently from the next, and a granter that committed one heir at
   two standings has made its own error. Matching exactly one: the pk
   becomes the current holder, the carried commitment becomes the new
   heir, the old key dies, and nobody is told. Found in the **outbound**
   record — as a warden this door holds a relation with, or as the heir
   it committed — → **news**. Nowhere → the stranger's case, which is a
   standing at nothing. **A commitment the message carries changes none
   of this**: the kind is read off the voice and never declared, so a
   voice found nowhere is a stranger whether or not it carried one, and
   the field is ignored rather than refused. A door that refused it
   would meet the holder whose door has forgotten it — restored from an
   old backup, or its standing released — with silence, where the
   stranger's case tells that caller the house is alive and answers what
   any stranger may see.
5. **Spend the seq**, against the window kept for that voice and by the
   window's own rules. **A rotation starts the mark fresh. News is
   counted too**, against the mark kept for that far warden. **The way
   back is refreshed here**, between the seq and the leash: the padlock
   and hints the payload carried replace what the row held. Not earlier,
   because a replayed message would otherwise rewrite a live way back
   with a retired one, and the seq is what tells a replay from a call.
   Not later, because a message refused for its leash still arrived and
   still spent its number — a door that refreshed only what it went on
   to route would slowly lose the way back to any peer whose calls it
   keeps refusing, and news is what that peer would stop receiving.
6. **Spend the leash.** Time exhausted or hops below zero → silence — a
   hop count of zero is a legal leash for a call that goes no further
   (Article VIII). Whatever this call reaches onward carries less than
   it received.
7. **Route.** Being and method — the being is invoked and answers.
   Being, no method — the warden describes that one being. Neither — the
   warden describes the estate, which means what that voice may reach:
   the inbound record, and what this warden exposes, which every voice
   reaches. Method, no being — the warden's own being answers. No
   standing anywhere — the stranger's case, which is that same reach
   with no record under it. **What a warden exposes is reached, not
   merely listed**: a describe naming a being no ask could reach would
   be a worse answer than naming nothing.
8. **Answer.** Sealed to the return padlock the payload carried, and
   signed by the warden's own name.

**Steps 1 through 6 are the warden's alone, and the being never learns
that any of them happened.**

**The warden's own being answers to two addresses, and that is meant.**
Naming it is the ordinary form; omitting it is the shortcut for a
stranger who holds a card and has described nothing yet. Nothing is
identified by how a call was addressed, so nothing here can diverge.

**There is no empty ask, because there is a default one: describe.** And
the describe is the warden's answer, never the being's.

**An answer is judged too, by a shorter road, at the caller's own end.**
Unseal with the padlock the ask named; the leading byte must say
`answer`; verify the signature with the `warden` the record carries,
which must be the warden the ask was sent to; and an ask must be
awaiting under that padlock, that warden and that seq. **An answer
spends nothing** — its number is the ask's own, already spent at the far
door — and an answer nothing awaits is the same silence as every other
failure, retried never. A caller does not put a second ask on a road
while an awaiting one would make the two answers indistinguishable; its
own kit refuses to send it.

## XIII. Rotation

**Being rotation and warden rotation are two different things.**

- **A being's rotation** moves a holder: the heir spends, the old key
  dies, the standing has a new occupant. It happens per standing, at the
  door, through the heir commitment — this is what rotate-and-ask does.
- **A warden's rotation** comes in two weights: replacing the
  **padlock**, which moves no identity and touches no standing, and
  succeeding the **name** itself, the owner's heir spending, reserved
  for a lost or stolen warden.

Every handle carries the current voice and the hash of the heir. A
succession must reveal a preimage, so no successor can be named after
the fact.

**Migration is a double rotation**: to the committed heir, then
immediately to a key the destination warden generated and the origin
never saw. After it, every key the old warden held is dead.

**The old door only points.** It keeps the succession it published and
answers `moved` with it. Every other ask meets silence: an answer's data
is the field's declared answer type by the notation's rules, and a
succession is not that type, so the old door cannot put one where the
caller asked for something else. A peer that never asks `moved` learns
of the move by news. The old door never forwards a call and never acts
on the being's behalf again.

**The new door points as well.** A destination that has taken a being in
answers `moved`, for the name that being wore before, with the word its
own arrival composed — and meets a stranger asking it with the silence
any unheld name meets. Neither door vouches for the other: each answers
only with a succession it composed itself. Both point because the old
door is what keeps a peer that missed the news from being stranded, and
a migration is the one moment at which the old door may not be there at
all.

**Cells and both records of standings travel with the being** — the
inbound one, so its peers keep their standing at it, and the outbound
one, so it keeps its standing at theirs — **and an arriving inbound row
reaches the being by the name the destination minted and by that name
alone**, never also by the name the being wore before: a name a door
must remember for whoever might still be behind is a name it can never
stop remembering, and the peer that is behind is not stranded, because
the old door still answers `moved` with the succession it published —
**and the replay record whole: the mark and the spent numbers beneath
it, the cargo's `spent [int]`**, or a caller's late-arriving in-window
numbers would be judged at the new door by a window it cannot see. The
outbound cargo carries, per row, the far warden, its heir commitment,
the padlock, the voice's keys, the hints, the count kept against that
far door, and the mark kept for its news — two counters, `seq` and
`news`, one for what this door sends and one for what that warden
announces, never one field doing both. **The voice's keys means both of
them**, the current voice and the heir it committed to; the heir travels
and the origin's copy dies with everything else.

**Rotation is revocation, and only of a standing.** A thief who steals a
current voice holds no preimage and can never succeed. **This says
nothing about a stolen warden**: whoever takes a warden takes every key
and heir it holds. The only defence there is the warden's own heir, held
outside the runner's reach.

**Custody splits by count.** A warden's own heir is the owner's, one key
per warden; a being's heirs live under its warden. The manual burden
scales with wardens, not with beings.

**A migrating warden can tell two peers two different stories, and
nothing here stops it.** This is shared fate stated where it bites, not
a hole in migration: a warden is total over what it holds, and migration
hands it no power it did not already have. Detecting equivocation means
a third party seeing both stories, and that is the register Quo exists
to delete.

## XIV. The news

**News is not a second kind of message.** It is an ordinary envelope
judged by the same eight steps. What makes it news is only where its
voice is found: in the **outbound** record rather than the inbound one.
Its arguments are one `word`, decoded by the notation's own rules.

**The case is read off which fields are present.**

- **A succession** — of a being, named by its pk, or of the warden's own
  name, **said by `being` absent** — carries the successor and the next
  commitment. A word naming the warden's own pk in `being` is refused:
  the name and the public being are one key, so that word would be a
  second spelling of the name's own succession.
- **A padlock replacement** carries only the new padlock: a lock has no
  heir, so successor and commitment are absent.
- **Either may carry the new name and hints** when where-it-answers has
  changed.
- **Fields that mean nothing in a case are absent, not filled.**

**A peer believes it by a key it already holds, and there are only
two.** When a signing key is succeeded, the peer holds the hash of the
heir: the successor signs and the peer hashes, and matching, the news is
true. When the padlock is replaced, the news is signed by the warden's
name, which has not moved. **Anything else is silence.** No door is ever
asked to vouch for another.

**Both cases are counted**, against the mark the peer keeps per far
warden. **A name succession keeps that mark**, because the house
persisted and only its key changed; **a being's succession starts the
news mark fresh**, as a standing's rotation does.

**A name succession keeps the standings too.** Every heir commitment was
hashed under the name the door had then, so a door stores the name each
was minted at — the `standing` record's `name`, travelling with the row
— and keeps verifying it there; new commitments are minted under the new
name.

**So a holder that rotates before hearing the news succeeds once, and
must hear it before rotating again.** A commitment is a hash of the
door's name and the heir's key, and it arrives opaque: a door cannot see
which name a holder minted one under, so it files every new one under
the name it has now. A rotation minted under the retired name is
therefore judged and accepted — the standing it spends was filed under
that name — while the commitment it carries is filed under the current
one, and the rotation after it will not match. That is silence, like
every other refusal, and hearing the news is what ends it. **A door
keeps no retired name alive for a peer that has not caught up**, because
a name a door must remember for whoever might still be behind is a name
it can never stop remembering.

**A stranger spends nothing.** It has no row, so no mark is kept for it
and its numbers are not counted.

**Migration is that message sent twice.** First the origin's committed
heir, carrying as its next commitment the one `receive` answered, and
naming the new door, its padlock and its hints. Then the key the
destination generated, sent by the new house itself.

**Believed news rewrites the outbound row entire** — name, padlock, heir
commitment, hints, one for one off the word's own fields. **An empty
hints list means the road did not change, never an erasure.** **Nothing
inbound follows**: an inbound row is keyed by a voice, and no voice's pk
changes when a house succeeds its name — nor does the name a standing
was minted under, which records this door's name at that moment and not
the peer's.

**A peer that is not there is not a problem.** News missed is news
missed; the old door still answers `moved` with the succession it
published, and the bytes are identical either way.

**News is exactly the rotations a peer's own record would otherwise be
wrong about, and nothing else.** That is the test for whether anything
new deserves to be announced: not whether it is interesting, but whether
a peer is holding a key that is dead.

## XV. What a message may carry

A method's arguments and its answer are ordinary data of whatever shape
the blueprint declares, and the warden never looks inside.

**Bulk is different only in that one message cannot hold it, and
chunking is an ordinary being.** A class with a size field and a chunk
field is asked piece by piece, each piece its own sealed message with
its own number. The warden's published limit is what makes this
practical.

**So Quo is not a file transfer protocol and must not grow into one.**
Ranges, resumption, partial reads, compression, progress: every one of
them is a field somebody writes in a blueprint.

**There is one subscription and it is an ordinary grant, backwards.**
The subscriber grants the source a standing at a being of its own, and a
push is an ask in the other direction, judged at the subscriber's door
by the same eight steps. **Granting a being is granting every field it
declares**, here as everywhere: a subscriber who meant one field grants
a being that declares one. The source learns the field by describing,
because no name in Quo travels.

**Staying connected is not a second shape. It is a carriage.** A ground
that cannot be called dials out and holds the line open, and the asks
ride back down the line it opened. The standing and the message are
identical; only the road differs, and roads are delivery's.

**The warden's own news is the subscription a peer already holds.**
Succession is subscription's one built-in case. The only difference is
what it takes to believe it: an ordinary push is believed because a
voice holding a standing signed it, and news is believed because the key
it announces was named in advance — which needs no standing at the
subscriber's door at all.

---

Copyright 2026 Razvan Gherghina

Licensed under the Apache License, Version 2.0. See LICENSE.
