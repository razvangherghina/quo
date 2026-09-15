# SPEC

This is Quo, the protocol, with the one carrier Quo publishes inside it.
The promise is one sentence: an object asks another object and gets an
answer, and cannot tell whether the other is in its process, on its device,
or on another planet. Everything below is what two kits must share to keep
it. Quo is shaped on how people dealt with each other before anything
could be forced by a machine: one asks, the other answers or does not,
and the one asked judges for herself what the asker is worth. Nothing in
Quo makes a being do anything. It only makes sure that what is said was
said by the one who said it, is heard only by the one it was said to, and
that nobody else learns a thing. This document is the whole truth and
stands on nothing else.

Quo decides a thing only when two kits that have never met cannot
exchange bytes correctly unless both decide it the same way. That one test
is how a sentence enters this document, and every question of what Quo
should add is asked of it first. What fails the test is not Quo's: Quo
neither requires it nor forbids it, weighs no options for it and leaves it
open to nobody's ruling. Where leaving a thing out has a consequence a
reader would not see, the consequence is said once, and chapter 7 holds
them. Nothing in the door, the stance or the ground says how bytes travel,
how a ward is stored, scheduled or defended, or how a language spells a
thing. Those belong to the carrier, the harbor and the kit. Quo names no
carrier the door depends on. Chapter 6 is the one carrier Quo publishes,
so that two kits that have never met can reach each other's doors, and the
door stands without it.

Quo is bytes in, bytes out. An ask sealed to a ward's key is handed to
anything that carries bytes, and what comes back is bytes with Quo meaning
or nothing. The document is shaped around the ward, because the ward is the
one thing that stands on both sides of the line between the wire and the
inside. Its door faces out and is written byte for byte. Its stance faces
in and is written as meaning. Its ground faces down and is written as
meaning. What Quo enforces is on the door. Everywhere else Quo states a
consequence and enforces nothing, because nothing else is observable on
the wire.

## 1. The graph

Quo is a graph. A node is a ward, named by one public key derived from its
seed. An edge is a relation, and it is keyed at both ends: each end holds a
key minted for that edge alone and an id chosen by the being at that end.
A being lives inside a node. She is reached only along an edge that ends at
her, and she holds no name in the graph. The harbor is the physics under
the graph. It gives a node ground to run on and carries bytes between
nodes. It is no node, no edge, and nothing in the graph names it.

An edge is born by invite, knock and take, and nothing else births one:
one being invites, the other knocks with the invitation, and the knocker
takes what answered. Each end names the edge by its own id, and neither id
ever crosses the wire.

An edge has a direction, and the direction is set by who invited. The end
that invited holds an **occupant**: an id the inviting being minted, and
the keys her ward binds to it. The end that knocked and took holds a
**standing**: an id the taking being minted, and the keys her ward speaks
under. Asks flow from a standing to an occupant. A being asks only through
a standing she holds, and she is asked only by an occupant she invited, with
one exception: a ward may have one public being, and a stranger reaches her
with no edge at all.

Two beings who want to ask each other hold two edges, one invited by each,
and the two edges share no key. Two edges that end at one ward share the
ward's key and nothing else, so a far ward learns nothing about one edge
from another.

Nothing inner ever appears in the bytes. An id, a method, an arg, an answer,
a cell, a secret: none is readable on the wire. What the wire sees is ward
keys, ephemeral keys and ciphertext. A heir key is inside the seal and never
outside it.

## 2. The three words

A **harbor** boots wards and carries bytes. It judges nothing and speaks no
Quo. It is nobody's occupant and holds no standing anywhere.

A **ward** is its seed and its partition, and has one door. Between one
run and the next it is its record, and a harbor that stands that record
again stands the same ward. It is itself a being, the first in its own map.
It keeps its beings, mints every key, seals every ask that leaves and
judges every arrival. Only a ward has a door, and only a ward moves, whole.

A **being** is one ordinary object with one answer. She is asked and she
answers. She touches no key, no wire, no address. She never leaves the ward
that booted her.

There is no fourth word.

## 3. The door, outward

This chapter is where two kits meet. Every rule in it is on the bytes, and
a kit that draws any line elsewhere answers differently from a kit that
draws it here.

### Values

Everything that crosses is a value, and a value is I-JSON (RFC 7493) held to
the rules below. Every rule is about the JSON text and never about what a
language parses it into, because a language is where two kits stop
agreeing.

Whitespace that RFC 8259 allows, between tokens and around the value, is
read wherever JSON text is read: a payload, a reply, an invitation. So a
writer may pad what it seals with whitespace, the signature covers the
padding as it covers every byte, and no reader refuses it. A reader that
refused it would silence a kit that hides its lengths.

- A string is valid Unicode text. A surrogate stands in a pair or the text
  is no string. Noncharacters are text and stand.
- A number is representable as an IEEE double. Text naming a whole number
  is refused unless that number is exactly a double or the text is how
  ECMAScript writes a double: `9007199254740993` is refused, `1e21` and
  `1e+23` stand. Text naming a fraction is the double nearest it. Text past
  the largest double is refused. Text naming a value other than zero that
  rounds to zero, `1e-400` among them, is refused. Minus zero, `-0` or
  `-0.0`, is refused. A number is whole when the text names an integer, so
  `1`, `1.0` and `1e0` are one whole number. A boolean is never a number.
- An object has no duplicate keys. Two of one name is refused where it is
  read and never resolved to the last.
- Bytes that are not UTF-8 are no JSON text and are refused, not mended.
- A value nests no deeper than sixty-four. A level is a container, an
  object or an array. The depth of a value is the greatest number of
  containers on any path from the value inward, counting the value itself
  when it is one: a number is depth zero, the empty array is depth one, an
  array holding an array is depth two. Depth sixty-four stands and depth
  sixty-five is refused. Depth is counted from the value written and never
  from a root it is written under: an arg of depth sixty-four stands
  whatever carries it. The payload is itself a value written at its own
  root, one object holding `args` holding that arg, so a payload nests no
  deeper than sixty-six, and that bound is on the payload and never on
  the arg. A reply is written the same way, one object holding `object`,
  so a reply nests no deeper than sixty-five, and that bound is on the
  reply and never on the object.
- Nothing else is a value. No dates, no references, no functions, no native
  types. Larger integers and exact decimals travel as strings. Bytes travel
  as base64 strings, and which base64 is the two beings' business, since no
  ward decodes one.

Every rule above has one reason: a value is a value when every kit gives
back what was put in. Anything one kit would preserve and another would
lose is refused where it is written. The depth bound is Quo's and not a
ward's because a far ward reads what a near one wrote, and a kit with a
deeper stack that stood deeper would call a blueprint a value where another
kit refuses it.

### The sealed box

Six algorithms, named once and never negotiated: Ed25519 signs, X25519
agrees, ML-KEM-768 encapsulates, SHA-256 hashes, AES-256-GCM encrypts, and
HKDF-SHA-256 derives. HKDF appears in three places, and the labels are six
so that two derivations never answer to one name: `quo-seal` and
`quo-edge-seal` at the message cipher, `quo-lock` and `quo-edge` at the
edge key, `quo-ward-sign` and `quo-ward-seal` at the ward key. A label is
HKDF's `info` and is the ASCII bytes of the name, with no length in front
and no prefix, so `quo-seal` is eight bytes. The salt is the zero-length
salt of RFC 5869 everywhere, and not a string.

**The ward key.** One thirty-two byte seed is one ward. Two secrets come
from it, each HKDF-SHA-256 of the seed under its own label, the seed as the
input keying material, thirty-two bytes out. Under `quo-ward-sign` the
thirty-two bytes are the Ed25519 private key as RFC 8032 names it, the seed
that key is expanded from. Under `quo-ward-seal` they are the X25519 scalar
as RFC 7748 takes it, clamped by the function and not before. The ward's
public key on the wire is the signing pk then the padlock, 128 lowercase
hex, and it is the one name that routes. A seed handed in as thirty-two
bytes is the seed. Anything else, text or bytes of another length, is
SHA-256'd to thirty-two bytes first, text as its UTF-8 bytes, so a
thirty-two character name is a name and not a key.

**Every other key is a seed and is derived from nothing.** The thirty-two
bytes drawn for an ephemeral key, and the thirty-two bytes of a heir secret,
are the secret as they stand: no hash, no label, no second derivation.

**The lock.** A ward's lock is its ML-KEM-768 key pair, FIPS 203. It is
born once and lives in the partition: sixty-four bytes drawn in one draw at
the ward's first invite that names a heir, before that invite's heir
secret, `d` the first thirty-two and `z` the last, handed to
`ML-KEM.KeyGen_internal(d, z)`. It is not derived from the seed and it is
not in the ward pk, so the name that routes never grows. Its encapsulation
key, 1184 bytes, travels in every invitation that names a heir. A ward
stood on an empty partition has no lock until it invites.

**The box.** An ask is one box and a reply is one box, and nothing rides
outside either but the ephemeral key in front of it. No relation key, no
tag, no number and no ward key is in the clear.

```
ask box   = ephemeral X25519 pk (32) || AES-256-GCM( head ) || AES-256-GCM( body )
knock box = ephemeral X25519 pk (32) || AES-256-GCM( head ) || ML-KEM-768 ciphertext (1088)
            || AES-256-GCM( body )
reply box = ephemeral X25519 pk (32) || AES-256-GCM( body )
head      = heir pk (32), or thirty-two zero bytes for nobody
```

A knock is an ask on a fresh heir, and it is the one box that carries a
ciphertext. The knocker draws the ephemeral secret, then thirty-two bytes
`m`, and `ML-KEM.Encaps_internal(lock, m)` gives the ciphertext and a
thirty-two byte shared secret.

The sender draws a fresh ephemeral key and agrees it with the padlock the
box is sealed to. The thirty-two byte agreement as it stands goes to
HKDF-SHA-256 under `quo-seal`, with nothing concatenated to it, and seals
the head of an ask and the body of a reply. The body of an ask is sealed
under `quo-edge-seal`, over sixty-four bytes: the agreement, then the edge
key the ask is sent under. Each call gives forty-four bytes: the first
thirty-two are the AES-256 key and the last twelve are the nonce, in that
order. The nonce needs no randomness, since the key beside it is fresh on
every box. Each tag is sixteen bytes and rides at the end of its
ciphertext. The additional authenticated data of every ciphertext is the
ephemeral pk its box carries, and never anything from another box, so a box
is opened without knowing what it answers. An all-zero agreement is a box
that does not open.

An ask's box is one hundred and sixty bytes longer than its payload:
thirty-two of ephemeral pk, forty-eight of sealed head, sixteen of tag and
sixty-four of signature. A knock's box is 1,248 bytes longer: the same, and
the ciphertext. A reply's box is one hundred and twelve longer
than its reply: thirty-two of ephemeral pk, sixteen of tag and sixty-four of
signature. An observer who reads a box's length reads its payload's.

An ask's box is sealed to the ward's padlock. The reply's box is sealed to
the ask's ephemeral pk, the **lid**, and to nothing else. The sender keeps
the ephemeral secret until the reply comes and opens the reply with it. A
lid is one per ask and never reused.

The heir rides inside the box because it is the one name in a relation that
never rotates. Outside the box it would be a handle an intermediary could
follow for as long as the relation lasts. What carries an ask to a ward is
the ward pk, which the carrier holds itself and never reads from these
bytes. The door opens the head with its own padlock, learns which heir the
ask names, and opens the body under an edge key it holds for that heir.
What an intermediary still learns is the ward it is carrying to, and that
is the price of being reachable.

**The edge key.** Every relation carries one secret beside its signing
keys, thirty-two bytes that only its two ends hold and that move on every
choice. A knock's edge key is HKDF-SHA-256 of the knock's shared secret
under `quo-lock`, thirty-two bytes out, and the knock's body is sealed
under it. Both ends compute every reply's agreement, the door from the
reply's ephemeral secret and the lid, the sender from the lid's secret and
the reply's ephemeral pk. The next edge key is HKDF-SHA-256 under
`quo-edge` over sixty-four bytes, the edge key the ask came under then that
agreement, thirty-two bytes out. The **zero edge key** is thirty-two zero
bytes. Every ask to the public being and every ask on a standing taken on
`{ ward }` alone are sent under it, and it never moves.

The edge key is why a stolen ward does not open its past. The padlock never
rotates, so whoever takes a seed can open every head ever sealed to it. A
body is sealed under an edge key as well, and an edge key that has been
replaced is held nowhere, so whoever takes a seed and its partition opens
the bodies sent under the edge keys that partition holds and no older one.

The lock is why a broken curve does not open them either. Every edge key
after a knock is chained from the knock's, and the knock's comes from
ML-KEM-768, so whoever records a relation and later solves X25519 still
needs the lock's secret to open one body on it. The head still says which
heir an ask named, and an ask to the public being is sealed under X25519
alone.

**The body** is a payload then a signature, and the signature is sixty-four
bytes of Ed25519 over the payload bytes exactly as they stand in the box.

```
body    = payload (JSON text) || signature (64)
```

**Verification** is one rule. A signature is checked against the bytes as
they were received, never against a re-serialisation of what they parsed
to, and a kit that canonicalises before verifying refuses its own peers. It
is RFC 8032's cofactorless check, `[s]B = R + [k]A`, and it refuses in four
places and no others: a signature of any length but sixty-four; an `s` at
or above the group order; an `R` whose bytes are not the bytes the point it
names encodes to, so `R` is compared as encoded; and a public key that is
small-order in any spelling, the sign bit set on `x = 0` included, or whose
y coordinate is at or above the field's prime. A public key with a torsion
component that is not small-order verifies like any other, and so does a
small-order `R`.

**The size.** There is one size and it is on the bytes. A door refuses the
bytes of an ask whose count is above 1,048,576, and the asker refuses the
bytes of a reply whose count is above the same, each before anything is
opened: 1,048,576 bytes stand and 1,048,577 are refused. What is refused on
arrival is never sealed. An asker does not seal an ask above the size, and
it is `unreached`, since nothing left. A door does not seal a reply above
the size: her answer is `threw` to a bound key and silence to a stranger,
since she answered and her answer cannot cross, and the number is spent as
on every choice. Only what crosses is bounded. An ask is a message and not
a file, and what is larger is asked for in pieces by a being who knows how
her work divides. A stream is
assembled by a being out of asks, and Quo does not know it is one: no ask
names the one before it, and the door judges each on its own. The bound is
not on what a being may say, since a carrier splits and joins bytes as it
likes. It is on what a door holds before it can judge: the signature covers
the whole body and the seal proves itself at its last byte, so whoever
knows a ward pk can make its door hold that many bytes before a word is
said. The number is one and it is Quo's and not a ward's because a door
that will not hold a box cannot open it to say why, so its refusal is
nothing, and a sender must know before it seals whether a door anywhere
will read what it sends. What a carrier
wraps around the bytes is bounded by that carrier, and the reference
carrier's bound stands in chapter 6.

### The payload

```
payload = JSON { to, by, next, seq, time, method?, args? }
```

- `to` is the heir pk the ask is for, 64 lowercase hex, or `null` for the
  public being.
- `by` is the pk the payload is signed with, 64 lowercase hex.
- `next` is the pk the sender will sign with next, 64 lowercase hex, or
  `null` to announce nothing.
- `seq` is the number for this relation, a whole number from one.
- `time` is the allowance, in milliseconds, a whole number above zero. It
  is a duration and never a moment: no wall-clock time is ever on the wire.
- `method`, when present, is a string. Absent is the empty ask.
- `args`, when present, is one object of values. Absent is handed to her as
  the empty object.

A field the payload owes and does not name is malformed. `to` and `next`
may be null and absent is not null. `method` and `args` may be absent and
never null. A field the payload does not name is not read. The payload is
one JSON object: an array, a string or a number is no payload.

### The replies

```
reply   = JSON { object, seen } | { silence: true } | { quo: word }
```

The reply is a box of the same shape as the ask, sealed to the lid, its
body the reply text then sixty-four bytes of Ed25519 by the ward key over
that text. It is one of three shapes with no field beside its shape's.

- `{ object, seen }`: she answered. `object` is a value. `seen` is always
  present: the digest, 64 lowercase hex, on a named ask that had one, and
  `null` otherwise, the empty ask included.
- `{ silence: true }`: bytes that say nothing. It is what every stranger
  hears and what a bound key hears when the being chose to say nothing.
- `{ quo: word }`: a reason, said only to a key the door has bound. The word
  is one of five: `removed`, `absent`, `unannounced`, `repeated`, `threw`.

**Reading a reply is strict.** A reply over the size, or that does not open,
or that is not signed by the ward it was sent to, or that is none of the
three shapes, is silence to the sender. A reply with a field beside its
shape's, a `seen` that is neither a digest nor null, or an `object` that is
not a value is none of the three shapes. The alternative is to read the
object and drop the field, and then two kits disagree about whether an
answer arrived. That is the one disagreement Quo cannot afford, so an
answer a far being really gave is lost when the kit that wrote it wrote one
field wrong.

**Silence is bytes.** It is never zero bytes and never nothing. Nothing
means not delivered and is the carrier's alone: a ward never answers
nothing.

**Noise.** When an ask does not open, the reply is still a reply: the same
silence, the same length, sealed to the first thirty-two bytes of what
arrived when there are that many, whatever they are, and to a key nobody
holds when there are not. A lid that will not take a seal, a small-order
point among them, is answered the same way, to a key nobody holds. A key
nobody holds is thirty-two bytes drawn from random and taken as a lid, and
when that will not take a seal either, the public key of thirty-two more.
Those are drawn before the reply's own ephemeral key. A reply is never
random bytes, because the law of one silence is a law about length.

### The invitation

An invitation is a value and goes anywhere: by mail, on paper, inside the
args of another ask. It carries no route, because a route inside it would
go stale while the invitation stayed good. It carries no time, because a
moment written into it would be a clock two wards must share.

```
invitation = { ward, heir, secret, lock }   ward: 128 hex. heir: 64 hex, the heir pk. secret: 64 hex,
                                            the heir seed. lock: 2368 hex, the lock's encapsulation key.
             { ward }                        the public being of that ward
```

Nothing else is read from it. A shape that is not one of the two is no
invitation: a ward pk alone with a secret or a lock, a heir with no secret,
a secret with no heir, a heir with no lock, a lock that is not 2368
lowercase hex. A
field beside the four is ignored. A secret that is not the heir's, or a
lock that is not the ward's, is sent and refused at the far door.

### Keys

Three keys per relation over its life, and one rule at the door: the key it
holds for you may speak, and so may the key it vouched for last time, and
each number once.

- **The heir** is minted by the inviting ward at invite, for one id. The
  ward keeps the heir pk beside the id and gives the secret away inside the
  invitation. The heir never rotates: it names the relation outward for as
  long as it lasts, and that is why it rides inside the box and never
  outside it.
- **Her own key** is minted by the knocker at knock. She signs the knock
  with the heir and announces her own key in `next`. The door binds the
  heir to her key and the heir dies as it speaks. From then on she signs
  with a key the inviter never held.
- **Next.** Every ask announces the key she will sign with next. The door
  holds two pks for a heir: the one **held**, which may speak now, and the
  one **vouched for**, which it will admit when it speaks. Whichever speaks
  first wins and the other dies. There is no rotate call: every honoured ask
  rotates.

**Admission.** For a heir, the signer is admitted when it is the key held
for that heir, or the key vouched for, or a key held or vouched for when the
id was removed after the heir spoke. A key that is none of those is a
stranger.

**The door's move** is arithmetic. It moves on an honoured ask and on
nothing else.

- On a fresh heir, the honoured ask is a knock. The key it announced becomes
  the key held. The heir dies as it speaks and is held by nobody. Nothing is
  vouched for. A knock that announces nothing, or announces the heir itself,
  binds nothing and is `unannounced`.
- On a heir already spent, the key that signed becomes the key held,
  whichever of the two was admitted, and the other is forgotten. The key
  the ask announced becomes the key vouched for. An ask that announces
  nothing moves the held key and leaves the vouched key exactly as it stood.
  When the key that signed is the one vouched for, it becomes the key
  held, the key it replaces is forgotten, and nothing is vouched for until
  an ask announces a key.

So the key held for a heir is the key that last spoke. A door that kept the
first one forever would refuse the caller the moment she signed with the
key she announced. A door that forgot the vouched key when an ask announced
nothing would meet that key with silence at the next ask and kill a healthy
relation over a field.

**The edge keys** move by the same arithmetic. The door holds two for a
heir: the one **open**, the edge key that last opened an honoured ask, and
the one **offered**, the edge key that follows the reply to the last
choice. On a fresh heir the door reads the ciphertext, decapsulates it with
its lock, and opens the body under the knock's edge key alone. For nobody,
a heir never minted here or a heir removed before it spoke, it reads no
ciphertext and opens the body under the zero edge key alone. Otherwise it
reads no ciphertext and opens the body under the open key and then the
offered one, and the first that opens is the key the ask came under. On
every choice the door draws the reply's ephemeral key before it writes,
and writes with the choice:

- On a fresh heir, the open key is the knock's edge key, and the offered
  key follows it under the reply.
- On a heir already spent, when the ask came under the offered key, it
  becomes the open key and the one it replaces is forgotten. Either way,
  the offered key follows the key the ask came under, under the reply.

Her side holds the knock's edge key from the moment she seals the knock.
When an object comes back, she moves to the key that follows the one she
sent under, at the moment her signing key moves, and on nothing else. So
the open key is the key she last sent under, whatever the door answered
after it, and a knock that brought no object back leaves her the knock's
edge key, which a door that heard the knock holds open.

**The cost on her side.** The door moves on every choice and on none of its
refusals. On a spent heir it admits both keys, so a sender who moves to her
announced key only when an object came back is always heard. A sender who
moves on a word is refused for good, because the door did not move. A knock
is the one ask after which the door admits one key and not two: the heir
dies and the key she announced is held. So a knock that met silence or
`threw` spent the heir as surely as one answered with an object.

**The lost knock.** When a knock brings no object back, because its reply
was lost or it met silence or `threw`, the door may have spent the heir and
hold the key she announced, and she cannot always know it. Knocking as the
heir again would then be refused for good. She learns which case she is in
by asking: she sends under her own key and the knock's edge key first, with
no ciphertext. If the door bound it, that key is admitted and she is
answered with an object or a word. If it did not, the heir is fresh, the
door looks for a ciphertext that is not there, the box does not open, the
refusal writes nothing, and she knocks as the heir again with the same
`m`. A silence tells her nothing, since the being's silence and the door's
are one reply, so she knocks as the heir after it too: where the heir is
spent that knock is refused and writes nothing. The `m` is the same so the
edge key is one whichever knock the door heard: a knock the door bound
under it and a knock it refused leave her holding the key the door holds,
and a fresh `m` would leave her shut out of a relation the door binds. One
extra round trip where a knock brought no object back, and it gives a
stranger nothing: whoever holds the invitation could always knock as the
heir, and her own key is admitted only where the door already bound it to
her.

**What the knock guarantees.** Until it is used, an invitation is a bearer
secret: the inviter, the channel it went by and anyone who read it hold the
heir. The knock ends that. The door binds the key she announced, which her
ward minted and never gave away, and the heir dies as it speaks. So when
her knock is answered with an object, the relation is hers alone: nobody
who held the invitation can speak on it, the inviter included, and every
key the door admits from then on was announced under a key only she held.
Only the first knock binds. A knock that another met before hers is
silence, take births nothing, and a standing that exists is proof that the
knock was hers. Whether the channel carried the invitation unaltered is
the channel's to prove, and Quo cannot see it.

**Removed.** When a being removes an id whose heir has spoken, the key held
and the key vouched for, with the open and offered edge keys, are what let
the door open her ask and say `removed` to the one party who can sign as
them, and silence to everyone else. A heir removed
before it spoke leaves nothing: the door never bound it, its secret is in
an invitation anyone may hold, and a knock with it is a stranger's. Nothing
else survives a removal. How long a door keeps those keys is the ward's own,
and the cost of a short memory is one thing: the holder of a key past it
hears silence where she would have heard `removed`, which is what every
stranger hears and tells her nothing she can act on.

Every signing key in a relation was minted by one side and its secret never
left that side, except the heir, which the inviter gives away and which
dies the first time it speaks. Every edge key but the zero one is computed
by both ends, the first from a secret only the lock could open and each
after from the one before and a reply only they could open, and is never
sent. No key
serves two relations. No key outlives its relation.

### The count

Every ask on a relation carries the next number in one unbroken count for
that relation, starting at one, and the door honours each number once. The
number rides inside the signed payload, so bytes caught on the road carry
the number they were sent under and cannot be renumbered without breaking
the signature. A caller who means to ask again asks again under the next
number and is heard. Retry and fire-and-forget stay hers to build. Only the
accident and the interception are refused.

The door keeps the highest number honoured, the **mark**, and which numbers
below it are spent, out to a span of sixty-four. With the mark `m` and an
arriving number `n`: `n > m` is honoured and `n` becomes the mark; `n = m`
is refused; `m - 64 < n < m` is honoured once when `n` is not spent and
refused when it is; `n <= m - 64` is refused. With a mark of one hundred,
thirty-seven is honourable and thirty-six is refused, and the door holds
sixty-four numbers, the mark and the sixty-three under it. The width is
Quo's and not a ward's because a caller cannot tell two doors apart by
anything but their answers, and a door that honoured further back would
answer where another refuses.

The count carries over from the knock into the standing at take. Her side
keeps the number it spoke under whether or not a reply came back, because a
lost reply is a door that has already honoured the number, and offering it
twice would silence the relation. A number spent on an ask that never left
leaves a gap, and the gap is harmless: the door honours any number above
its mark.

A door that forgets what it honoured honours it again. The mark and the
spent numbers are part of what a ward is, and a partition put back to an
earlier moment is a door that answers a repeated ask as new.

### The allowance

Every ask carries what it may still spend: `time`, in milliseconds, inside
the signed payload, so a budget caught on the road cannot be widened. It is
a duration, counted from the arrival, and never a moment on any clock, so
two wards need share no clock to agree on it. The receiving door reads it
before anything is done under it, and a payload whose `time` is not a whole
number above zero is malformed.

Time is the only thing an ask measures: no count of doors, no count of
bytes, no count of tries. Each ask is bounded on its own, and the time an
arriving ask has left does not bound the asks a being makes while
answering it. What the allowance is for is that every wait ends. A cycle of
legal asks, A asking B, B answering asks A, A answering asks B on the
relation the first ask still holds, would otherwise produce a wait that is
not an object, not silence and not nothing. The innermost wait gives up,
and the ask ends.

How wide a ward's default and ceiling are is that ward's own, and no far
door can tell one ward's from another's. Budget is granted by a ward and
never minted by a being.

### The public being

A ward may have one public being and no more. Arrivals for nobody, `to`
null, reach her. She is asked by strangers, and she can tell. She may
invite, and an occupant of hers arrives named while strangers still arrive
as nobody.

She is reached without a heir, so the door keeps nothing for whoever asked:
no key it vouched for, and no count. The signature is checked under
whatever key `by` names, and `by`, `next` and `seq` are required of her ask
as of every other, and honoured by nobody. A kit author who goes looking
for the property behind this signature will not find one: the payload has
one shape and the door has one path, and that is the whole reason. The same
sealed bytes presented twice are delivered twice. A count per stranger
would be memory a stranger chooses the size of, which is what the span
exists to refuse.

So her answer must be safe to repeat, and that is her obligation and not a
gap at the door. Anything that must happen once lives behind an invitation,
where there is a heir and a count. A stranger hears silence for whatever
she then does: her choices are hers and her insides are not a stranger's to
read. A ward without a public being answers arrivals for nobody with
silence. A standing taken on `{ ward }` alone has no heir and never rotates.

### Judgment

The door judges thirteen cases, in this order, and the first case met is
the answer. The first seven are strangers: bytes the door cannot admit, met
with one silence and nothing written. The next three are refusals to a key
the door has bound: still nothing written, but a word, because the asker
has proven who it is. The last three are choices: the ask reached her, so
the number is spent and the keys rotate, and what she wrote in her cells is
hers.

```
strangers: silence, nothing written
D1   the box does not open           wrong padlock, garbage, over the size, a head that does not open, a
                                     fresh heir's box too short for a ciphertext, a body that opens under
                                     no edge key the door takes for the head's heir,
                                     or a body of sixty-four bytes or fewer, which hold no payload beside a
                                     signature. a payload that opens and is not UTF-8, not JSON, has a
                                     duplicate key, nests past sixty-six, or is not one object, is a box
                                     that does not open.
D2   the payload is malformed        to, by or next not 64 lowercase hex where a hex is owed, to not the
                                     head (null for a zero head, the heir the head names otherwise), method
                                     not a string, args present and not one object of values, seq not a
                                     whole number from one, time not a whole number above zero, a field
                                     owed and absent.
D3   for nobody, and nobody is home  no public being on this ward, or one that did not come back this run.
D4   for nobody, signature fails     the payload names a key it was not signed with.
D5   the heir is not held            never minted here, or removed before it spoke.
D6   the key is not admitted         not the key held, not the key vouched for, not a key held or vouched
                                     for when the id was removed. a forged key, an unannounced key, a heir
                                     already spent, a heir she removed under a key the door did not keep,
                                     an edge key a racing arrival replaced between opening and writing.
D7   signature fails                 under an admitted key, or under a key kept for a heir she removed.
refusals to a bound key: a word, nothing written
D8   she is not there                `removed`: the id was removed after its heir spoke, and this is a key
                                     held or vouched for when it went.
                                     for a heir still held: `absent`, the being did not come back this run,
                                     and then `removed`, her occupant record is gone. absent is met first
                                     there, since the record is in her cells and they are not read while
                                     she is away.
D9   a knock announces nothing       `unannounced`: the heir is fresh and next is null or the heir itself.
D10  the number is refused           `repeated`: already honoured, or at or below the span.
choices: the number spent, the keys rotated
D11  she threw                       `threw`
D12  she answered silence            on a named ask or on the empty ask. nothing at all is silence too.
D13  she answered a non-value        `threw`: a word, or anything her language holds that is not a value, or
                                     an object whose reply would be above the size.
```

D1 and D2 are one function and then the next, and the line between them is
drawn here so that two kits draw it in one place. D1 asks whether the bytes
yield a payload at all. D2 asks the fields of that payload, one at a time.
A stranger sees nothing of the boundary, because both are one silence of
the same length sealed to the same lid with nothing written either way.

The signature is verified before anything is written and before any word is
said, so a stranger cannot burn a number she could not sign for and cannot
hear a word she could not sign for. Admission is read again after the
signature is checked, with the edge key the body opened under, because a
door judges arrivals concurrently and a knock that raced this one may have
spent the heir or moved its edge keys in between. Only then is anything
said or written.

A **throw** is an answer that ended without one: whatever a language calls
the way a call fails instead of returning. A word coming out of a being is
a throw, since no being may make one. An error object she deliberately
returns is not a throw: it is an ordinary answer, held to the value rule,
and Quo never reads it.

On every answered named ask, the door runs her describe for that asker in
process, hashes it, and puts the digest beside the object as `seen`. A
describe that throws or falls silent costs the digest and nothing else. On
the empty ask the describe is her answer and is judged as one: a throw is
`threw`, silence is silence, and a blueprint is an object whose `seen` is
null, and her side hashes what came.

### The law of one silence

1. Every stranger's case is one reply, `{ silence: true }`, sealed to the
   lid the ask came with and signed by the ward key. Same bytes, same
   length. A stranger cannot tell one refusal from another, nor any of them
   from a being who chose to say nothing. The door equalizes the bytes and
   not the time it took to write them: a fresh heir costs a
   decapsulation, a spent heir up to two edge keys tried, two of the seven
   cases verify a signature and five refuse before they would. So timing
   tells a stranger only about a heir she names, and she names one only by
   holding its invitation: whether it is unspent, which knocking would have
   told her anyway, and whether a spent one was spoken on or removed before
   it spoke. A stranger with no invitation names no heir and learns
   nothing. How far a door evens its time is the kit's. A word, to a bound
   key, is another length and may be, because whoever hears it has already
   proven who they are.
2. A refusal writes nothing. No number, no key, no heir, no cell, no bind.
   The same bytes presented again meet the same refusal, and a stranger who
   knocks a thousand times leaves no mark. This holds for the three refusals
   a bound key hears just the same.
3. A choice writes what a heard ask writes. The number is spent and the keys
   rotate, so the relation goes on: the next ask on it is answered, and a
   silence or a `threw` never kills a standing.
4. Silence and a word leave the caller's record as it was. A silent named
   answer moves no `seen`. A silent empty ask moves no blueprint and no
   digest. A word moves neither, and her keys do not rotate on one.
5. Silence, a word and nothing are told apart always. Silence is bytes the
   far ward wrote and chose to say nothing with. A word is a reason. Nothing
   is not delivered. A ward never answers nothing to its own being, so that
   nothing always means not delivered.
6. Nobody enforces what a being does with silence or a word.

### The blueprint, the digest and `seen`

These three are one mechanism and it is on the wire: a being learns what a
standing can be asked, and learns when that changed, without a second
round trip. The blueprint is what she is told by the empty ask. The digest
is a hash of it that her ward computes on her side. `seen` is the digest
the far door computes on its side and puts in every answered named reply.
The two are compared, so two kits in two languages must hash one blueprint
to one digest, and that is why the hash rule is Quo's and not a kit's. A
kit that hashed otherwise would make every standing between the two wards
refresh on every ask.

A being's blueprint is the shape of an MCP tool list plus notes.

```
blueprint
  asks   list of { name, description?, input: schema, output?: schema }
  notes  any JSON value
```

The schema is JSON Schema draft 2020-12. Quo writes none of it and reads
none of it. Args are one JSON object with named fields.

The digest is SHA-256, as lowercase hex, over the JCS (RFC 8785) canonical
serialization of the blueprint. Two wards in two languages hash one
blueprint to one digest, and a ward that cannot do this is not a ward. Two
places in RFC 8785 are where languages part. Keys sort by UTF-16 code unit,
not by code point and not by byte, so `U+1F600` sorts before `U+FB33`.
Numbers are written as ECMAScript writes them, `1e+21` and `1e-7` and
`0.3333333333333333`, with a negative zero written `0`. A describe that JSON
can write but the value rule refuses is not mended into one: it costs the
digest, as a describe that throws does.

A blueprint is read as one before it is kept as one: an object with `notes`
present, whatever it holds, and `asks` an array, each entry an object with
a string `name` and an `input` that is an object. Nothing else is required
of it, and when it is one the whole value is kept, fields this document
does not name included. A side that broke on a far ward's answer would be
one kit made wrong by another. What is not one is kept as no blueprint, and
its digest is still the digest of what came.

Capability and state are two axes and never mixed. The blueprint is what
she can be asked, hashed into the digest and learned by the empty ask. An
answer is what she says, never hashed and never in the blueprint. A digest
change means one thing: her interface changed and the cached blueprint is
wrong. A being who puts state in her notes makes every standing refresh for
nothing, and that cost is hers.

## 4. The stance, inward

What a being is handed at birth and what she owes. This is meaning, never
a language's spelling. A kit spells it however its language spells things,
and that is the whole reason it is meaning here: a stance is spelled by a
kit, and nothing on the wire observes the spelling.

**She is handed** her cells, her standings, and six calls. Nothing more is
ever offered and nothing here may be missing.

- **Cells.** Her state, values only. A write of a non-value is refused
  where she wrote it, in her own frame. Her ward keeps her cells and her
  two records, and a restart hands her the same cells again. What a restart
  is, she cannot tell from birth.
- **Invite.** She mints an id in her own time, hands notes for it if she
  wants any, and asks for an invitation. The occupant record exists from
  that moment, holding those notes, and the invitation is hers to give
  away. It refuses an id that
  already names a record, occupant or standing, since the two are one
  namespace.
- **Remove.** An id, occupant or standing, goes. Removing what is not there
  is nothing. Her occupant hears `removed` from then on, and she hears
  nothing, ever, about a standing that walked away from her. A relation
  runs one way, from standing to occupant, so Quo names no leave and no
  event: a being who wants to say she left, or anything else happened, asks
  it through a standing she holds, as a method the far being offers.
- **Knock.** An ask carrying an invitation. Her ward seals it, and the far
  door binds the arrival to the id the inviter minted. It answers an
  object, silence, or a word.
- **Take.** After an answered knock, she keeps the far being as a standing
  under an id she mints. That is the only moment a standing is born. Take
  before a knock, or after a silent one, births nothing. Take consumes: the
  invitation names the standing from then on and nothing else, so it is
  exactly as alive as the standing is. Take waits its turn on the
  relation's line, because a relation has one line of keys and one count.
- **Ask.** Method and args to a standing, with an allowance if she wants
  one. An object, silence, or a word comes back. The empty ask, no method,
  is answered with the far being's blueprint. Every ask she makes is a new
  call.
- **Boot.** A being may make a being of her own ward, by class name and
  under a key she chooses. The one made has empty cells and no relation but
  the one her maker named, and that one is made the way all of them are:
  invited, knocked and taken. Which end invites and which ids are named is
  the kit's. A boot whose relation could not be made makes nobody.

**She is asked** through one method, her answer, and the ward calls it
with the asker and the ask. The asker has three shapes and no fourth. Her
own id for the occupant at the door. Nobody, which is how the public being
knows she is public. The root, which is the ward speaking to her on behalf
of whoever holds its unsealed ask. Nothing else ever reaches her.

**The ward is a being to its root** and answers it as one: the empty ask
is its describe, and what it can be asked is learned there, as any being's
is. Which asks those are, and their shapes, is the kit's. A ward piloted
from another ward is piloted by ordinary asks on a relation, and what those
asks are named is a matter between the two kits and not a promise of Quo.

**What she owes.**

1. Args are one object of values, and her answer is a value or silence. An
   error is an ordinary object she declares in her output schema. She never
   throws outward: a throw is caught by her ward and is `threw` to a bound
   key and silence to a stranger.
2. The empty ask is hers and must be safe to repeat. Who gets what
   blueprint is her decision, per asker. Her ward may ask it at any time.
3. A standing's digest arrives with every answer as `seen`. She compares it
   to the one she holds and refreshes by the empty ask if she wants. The
   digest is of what she was told, not of who the far being is: one being,
   many askers, many digests, all true.
4. An occupant has no digest and cannot be asked. To reach an occupant,
   hold a standing at her: she gave you one or she did not.
5. Her cells are hers to guard across every point her language may leave
   her answer and come back. Her ward adds no serialisation of its own, and
   two asks may be inside her at once.
6. A call is delivered once by accident never, and what she asks is always
   a new call. The public being is the exception: she is reached with no
   count, and her answer must be safe to repeat.
7. A silence she meets is not blindly retryable, because the far being may
   have done the work and the answer was lost. Nothing is safe to retry,
   because nothing was delivered. A wait that ran out promises neither.

**What her ward tells her**, and never a stranger. Three kinds of "no
object came back", and only three: an error, which is her object; silence,
which names no reason; and a word, which names one. The five door words
reach her exactly as the far door said them. Four more are her own ward's,
said in process and never on the wire.

```
unreached    no far door was reached. nothing is known to have been delivered. safe to ask again.
late         the wait ran out. the far door may have heard and be working still. what comes back late is not read.
invitation   the invitation is not one. nothing was sent.
dropped      she dropped the standing and asked on what she held. nothing was sent.
```

An ask whose args are not one object of values, or whose method is not a
string, is unreached, because nothing left: a payload is written as JSON,
and a method that could not be written would arrive as the empty ask and
spend a number on a blueprint she did not want. An ask the carrier returned
nothing for is unreached, and the number is spent all the same.

**Ids.** An id is minted by the being, bound by the ward, permanent, and
never crosses the door. Her id for you and your id for her are unrelated.
One id names one record. A kit reserves whatever names its own spelling of
the stance would collide with, and refuses them at invite and at take,
never at the write. Which names those are is the kit's, since no far ward
can tell.

**One relation, one line.** Every send on one relation waits for the one
before it, because the rotation is a conversation: a send reads the key
that speaks now and announces the next, and two sends interleaving would
read each other's half-written keys. Lines are per relation, so beings
still ask concurrently. A line is released by the allowance and by nothing
else: an ask that never comes back holds its line, and a kit that bounds
where a being is waiting and not where the line is held has a relation that
one quiet far side closes for good.

## 5. The ground, downward

What a harbor hands a ward and what it owes. Meaning only: what each thing
is, is Quo's, and how a kit holds them together is not.

- **The seed.** Thirty-two bytes, or what is hashed to them. The ward
  derives its pk from it and from nothing else.
- **The partition.** The ward's state at one moment, as values, opaque to
  the harbor. Everything durable a ward has is in it, every secret
  included, the lock among them, and nothing in it is ever in a being's
  cells. Between one run and the next the ward is this record, and
  standing it again on any harbor is standing the same ward.
- **Instantiate.** A class name and a stance in, the being or nothing out.
  A name the harbor does not hold is nothing, and that boot makes nobody. A
  class that throws while it is made is a being who threw at birth: she is
  absent this run, her cells wait, and her door says `absent` to the keys it
  bound and silence to strangers.
- **Random.** A count in, that many bytes of entropy out. Every key a ward
  mints is drawn from it, the lock and every `m` included.
- **The carrier.** Bytes to a ward key in, bytes or nothing out, and nothing
  means not delivered.

The ward returns its door, sealed bytes in and sealed bytes out, and its
unsealed ask, method and args in and a value or silence out. The unsealed
ask is the one unsealed ask in Quo. Judgment, catching and the three
answers are not skipped on it: a throw inside is silence. Whoever holds it
is the ward's root, and the ward is a being to its root exactly as it is to
anyone.

**What a harbor owes** is stated as costs, because Quo cannot see a harbor.

- The carrier answers nothing only where it knows nothing was delivered.
  A carrier that sent the bytes and then gave up on its own patience must
  answer nothing at all, and the ward's allowance ends the ask as `late`. A
  carrier that answers nothing after sending has turned a `late` into an
  `unreached`, and a being who then asks again has asked twice.
- A harbor that keeps a partition saves in the order it was told. Whether
  what was written is kept is the one thing a ward may learn about storage,
  once, after the being has answered and before the reply is sealed, and it
  learns yes or no and never a reason. The edge key of that reply is among
  what was written, so the reply's ephemeral key is drawn before the save.
  A door that says yes to what was never kept is the worse fault:
  everything written to that being afterwards is lost and every door keeps
  answering success. A no is that arrival's own
  failure, said as a throw is said, `threw` to a bound key and silence to a
  stranger, and a full disk is not a reason the far side may hear.
- A harbor that puts a partition back to an earlier moment puts back a
  being's cells and never what her relations stand on. Her keys, signing and
  edge, rotate when a reply opens and the far door's when it honours, so
  the two move at different moments. Stand either at an earlier moment and
  it speaks under a key the other will not admit, with no way back. A
  relation cannot be put back, only broken. The count needs no such care: a
  door honours any unseen number in its span, and two counts find each
  other again on their own.
- The harbor learns one bit from each arrival beside the bytes: whether a
  key the door holds spoke. It never learns a reason. A ward key that only
  ever brings strangers' bytes is the harbor's to rate or refuse, and Quo
  says nothing about how.

## 6. The reference carrier, Quo over TCP

The door names no carrier. This chapter is the one carrier Quo publishes,
so that two kits that have never met can reach each other's doors. A kit
that speaks the door and this carrier talks to every other kit that does.
Any other carrier, a request, a held socket, a push, a queue, a link
between planets, is a kit's own.

It adds nothing to the door. The carrier in chapter 5 is one sentence:
bytes to a ward key in, bytes or nothing out, and nothing means not
delivered. Everything below is how that sentence is spelled on a TCP
stream.

### The line

A harbor that listens holds a TCP address, a host and a port, and stands
wards behind it. A kit that dials opens a connection to that address and
asks on it. The dialer asks and the listener answers. A connection carries
many asks, in flight at once, and either side may close it at any time.
A ward that cannot be dialed is reached however its implementer chooses, a
held socket, an upgraded request, a push that wakes it to dial, and asks
flowing back on a line the ward opened are that implementer's carrier.

How a dialer learns which address stands a ward is outside this chapter
and outside Quo. An invitation carries no route, so the address comes by
whatever means the two parties already share. Quo names no port: an
address is whatever reaches the listener, an IP or a name, with a port or
behind whatever forwards one to it.

The carrier adds no encryption and no authentication of its own, because
the box is already sealed and signed. The frames are the same bytes on any
reliable stream that reaches the listener: plain TCP, or TCP inside TLS or
a tunnel so that a proxy can route it by name or a firewall lets it pass.
Whether a stream is wrapped, and in what, is the harbor's choice and each
implementer's, and the frames never see it. Quo requires none and forbids
none.

The line does not greet. The first bytes a dialer sends are its first
frame: an ask to the public being or an ask through a standing, and the
door judges it like every other.

### The frame

The stream is a sequence of frames. Each frame is a length and then a body.

```
frame   = length (4, big-endian) || body
body    = kind (1) || id (4, big-endian) || rest
```

`length` counts the bytes of `body`. There are three kinds, and `rest`
depends on the kind.

```
00  ask       rest = ward pk (64) || box         dialer to listener
01  reply     rest = box                         listener to dialer
02  nothing   rest = empty                       listener to dialer
```

- The **ward pk** is the ward's public key as sixty-four raw bytes, the
  signing pk then the padlock, the same key chapter 3 writes as 128 hex.
  It is what the listener routes by, and it is never read from the box.
- The **box** is the sealed bytes exactly as chapter 3 defines them, an
  ask's on `00` and a reply's on `01`. The carrier never opens one.
- The **id** is minted by the dialer, one per ask, and the listener copies
  it onto the reply or the nothing that answers that ask. An id is unique
  among the asks in flight on one connection. Replies arrive in any order.

The largest body is 1,048,645 bytes: one kind byte, four id bytes,
sixty-four pk bytes and a box of 1,048,576, the size of chapter 3. A
length above 1,048,645, a length below five, a kind that is none of the
three, an ask with fewer than sixty-four bytes after its id, and a nothing
with bytes after its id are not frames. The side that reads one closes the
connection, because nothing after it on the stream can be read. A frame
of a kind the side does not read, a reply or a nothing at a listener, an
ask at a dialer, is a frame: it is read, nothing is said to it, and the
connection stands. A side judges what arrives and reacts to nothing, on
the stream as at the door.

The frame bound and the size meet on an ask: an ask's box is `length - 69`
bytes, so a body of 1,048,645 carries a box of 1,048,576 and an ask's box
above the size is never a frame. A reply's box is `length - 5` bytes, so a
body of 1,048,645 carries a box of 1,048,640. A door never seals a reply
above the size, so a reply that is no frame is never written. A reply's box
above the size that is still a frame is carried to the asker, who refuses
it as the size says, before anything is opened.

### Nothing

The listener sends `02` when it knows the ask was not delivered: it stands
no ward under that pk, the ward is not running, or its harbor chose not to
hand these bytes to the door. It never sends `02` after the door has taken
the bytes, because nothing means not delivered and a door that heard the
ask has answered it.

A harbor that sheds load does it here, before the door. A door answers
every arrival it takes, and the law of one silence makes that answer a
sealed and signed reply even to bytes that cost their sender nothing, so
the door is the dearest place to refuse. A listener may cap the bytes it
holds in flight, rate a source, or answer `02` to what it will not carry,
and the dialer hears `unreached`, which is safe to ask again. How is the
harbor's.

A connection that closes with asks in flight answers none of them. The
dialer cannot know whether a door heard one, so this is the carrier's cost
in chapter 5, spelled on a stream: an ask whose frame never left is
`unreached` to the being, and an ask whose frame left is answered nothing
at all and is ended by the allowance as `late`.

### The empty ask

Describe has no frame of its own. The empty ask is an ask like any other,
sealed and framed as `00`, and its blueprint comes back as `01`.

### What an observer sees

Everything on the stream is frame lengths, kinds, ids, ward pks and sealed
boxes. The ward pk is in the clear because it routes, and that is the price
of being reachable that chapter 3 names. The id says which reply answers
which ask and nothing more. A box's length says what chapter 3 says it
says: the length of its payload.

## 7. Costs

Each is a consequence, said once. Quo enforces none of them.

**Custody.** A ward is its seed and its partition, and both are in the
harbor's hands. Two harbors running one seed over one partition are two
wards with one name. Runs that write apart diverge in silence: each honours
numbers the other has not seen and rotates keys the other does not hold. A
peer's door meets the divergence on its relation and refuses it there, as
a key it does not admit or a number it has already honoured. What the peer
may do is refuse and remove, and nothing wider, because nothing wider is
observable.

**Divergence.** The same follows from any two copies of a ward that write
apart, however they came to be. Nothing in the bytes says which copy is
the ward. A relation, once diverged, is broken on both sides and is made
again by invitation.

**An open partition.** The partition holds every secret and every relation
a ward has, under the seed's name. Whoever reads it holds every relation's
keys and can speak as that ward on every one of them, with nothing on the
wire to tell the two apart. It opens every ask to come on those relations
and the asks sent under the edge keys it holds, and no ask sent before
them. A careful harbor stores it sealed under a key derived from the seed,
so that the seed is the one secret; that is a recommendation and not a
rule, since nothing on the wire can tell whether it was followed.

**A stolen seed without its partition** opens every head ever sealed to
that ward, so it learns which heir each recorded ask named, and it opens
every ask to the public being. It opens no knock and no other body, since
the lock and every edge key are in the partition.

**A broken curve.** Whoever records traffic and later solves X25519 opens
every head and every reply, and every ask to the public being. On a
relation it opens nothing sent after the knock unless ML-KEM-768 falls
too. The signatures are Ed25519 alone, so a forger who solves the curve can
speak where a door would admit her from then on, and never in the past.

**Loss of the lock.** The lock is in the partition and in nothing else. A
ward stood from its seed on an empty partition mints a new lock at its
next invite, and every invitation it gave before carries a lock no door of
it holds: those knocks do not open. Such a ward has lost its relations
already and invites again.

**Loss of a seed.** The seed and the partition travel under one name, so
whoever took the seed took every relation with it, and nothing is left to
succeed to. A succession the old key signs is signed as well by whoever
took it. The answer is a new ward, every peer invited again. Lose the seed,
lose the ward, with no recovery inside Quo. Loss of the partition alone is
loss of every relation, announced to nobody.

**A ward moved in pieces.** A being's peers hold a standing at a ward key,
and what they trust is that ward's word about an id. A being moved alone
would ask every peer to trust a ward they never accepted, and asking that
is what an invitation is. So a ward migrates whole or not at all, and a
ward that is moved by seed and partition is the same ward at the same name
whatever harbor, whatever runtime and whatever kit stands it.

## 8. What a stranger can observe

A stranger can observe bytes in and bytes out, and nothing else. The
vectors pin exactly that, so a kit in any language proves it agrees on the
bytes without meeting another kit.

- `vectors/arithmetic.json` pins the primitives the seal rests on: Ed25519,
  X25519, ML-KEM-768, SHA-256, AES-256-GCM, HKDF-SHA-256, with fixed inputs
  and outputs, the four verification refusals among them.
- `vectors/framing.json` pins the ward pk from a seed, the digest of a
  blueprint, including the two places RFC 8785 parts languages, the signed
  body, the sealed shapes with their head and edge key, a lock from fixed
  `d` and `z`, the knock's ciphertext and edge key, the invitation and the
  knock.
- `vectors/door.json` pins the door's thirteen cases, each one an arrival:
  the bytes that come in, the bytes that go out, what those bytes open to
  where a hand holds the lid, and whether the ward wrote while judging.
  Nothing written is a value a kit checks and never a sentence it reads.
- `vectors/tcp.json` pins the reference carrier's frames. The frames are
  observable on the stream exactly as the door's bytes are, and they are
  pinned the same way: the bytes that go onto the stream, the bytes that
  come off it, and what is not a frame.

A kit reproduces them or it is not this protocol.

**What a carrier sees.** Whoever carries a box between two wards cannot
open it and sees it anyway: the ward pk it routes by, when it passes and
how long it is. The payload is sealed as written, so an ask's box is its
payload's length plus one hundred and sixty bytes and a reply's its
reply's plus one hundred and twelve, and a carrier can tell an empty ask
from a named one, silence from an answer, a short answer from a long one.
That is what a voice gives away to anyone in the room who cannot follow the
words. A carrier cannot change a box's length, so hiding it is the
writer's: a sender pads a payload and a door pads a reply with whitespace,
to whatever sizes that kit chooses, and a door that pads keeps every
stranger's silence one length. Hiding when bytes pass, by delays or cover,
is a carrier's own. Neither is Quo's.

**Fixed entropy.** Every byte in a door record that a stranger cannot
compute is a byte of entropy, and the corpus fixes the entropy so that a
verifier holding no key can replay the record and compare bytes. The stream
it fixes, and how a kit is put in a record's state, are documented beside
the vectors and are the harness, not the protocol. A door
replayed this way is the door as it stands: what the door does to a corpus
ask is what it does to every ask, and nothing of the harness is reachable
from a harbor that is not in it.

**What the vectors cannot pin**, because a stranger cannot see it: whether
a reply opened, which is the sender's secret; the bit beside the bytes,
which is the door's word to its harbor; and the value of a partition's
digest, which is the kit's own. Only one thing about that digest is Quo's:
two digests of the same ward differ when something was written between
them and are equal when nothing was. Those three are each kit's own tests
to keep. The conformance suite is that: a checklist written in a kit's own
terms, ported by another kit and never shared with it.

**What two kits meet on** is the door's thirteen cases, the reference
carrier's frames and the vectors, and nothing else. No kit drives a foreign
ward through its door.
