# Quo

Quo is a language spoken in bytes. A door is one function: bytes in,
bytes or nothing out.

What is inside those bytes is Quo's. How they arrive is not, and what
stands behind the door is not.

A sentence is here for one of two reasons: two kits that never met could
not exchange bytes correctly unless both read it the same way, or no kit
could provide it for itself. What fails both is not Quo's, and this
document neither asks it nor forbids it.

Every rule has one form: bytes written this way mean this. None says that
anyone must speak. Silence is open at every moment, and a kit that answers
once and never again still speaks Quo.

This document is the whole of Quo and stands on nothing but the standards
it names.

## Terms

A kit is an implementation of this document.

Hex is bytes written as text, two lowercase hexadecimal digits for each
byte. Text of any other spelling is not hex.

An ask is bytes sent to a door. A reply is the bytes that door gives back
for that ask. The bytes of an ask are its box, and the bytes of a reply are
its box.

A ward is thirty-two bytes, its seed. A ward has a signing pair, an Ed25519
key pair, and an X25519 scalar. The public key of the signing pair is the
signing pk. The public key of the X25519 scalar is the padlock.

An heir is an Ed25519 key pair a ward makes. Its secret is the heir secret,
thirty-two bytes. Its public key is the heir pk.

A head is thirty-two bytes inside an ask's box: an heir pk, or thirty-two
zero bytes. The head of thirty-two zero bytes is the zero head.

An ephemeral key is an X25519 key pair used for one box and for nothing
after it. The public key of an ephemeral key is an ephemeral pk. The
ephemeral pk of an ask's box is the lid.

A signature is sixty-four bytes. An ask's body is JSON text (RFC 8259)
followed by a signature. That JSON text is the payload. A reply's body is
JSON text followed by a signature. That JSON text is the reply text.

A container is an object or an array.

A relation is one heir with the keys and the count that follow it. A count
is the set of numbers a door has honoured on one relation. A relation has
one count. A count number is a JSON number written with no fraction and no
exponent, from 1 to 9,007,199,254,740,991, which is 2^53 − 1. `1` is a
count number. `1.0` and `1e0` are not. In the chapters on the count and
the move, a number is a count number.

A choice is what a door gives an ask when it gives an object or a silence
of its own. A refusal is what a door gives an ask it does not choose on:
silence, or a word. A door honours a number when it makes a
choice on an ask that carries it.

Silence is a reply whose reply text is the object `{"silence":true}`. A
door writes it as those sixteen bytes and no others. A reader reads any
reply text of that value as silence. Nothing is no reply at all.

## The algorithms

Quo uses six algorithms. Each is named here once and none is negotiated.
Ed25519 signs. X25519 agrees. ML-KEM-768 encapsulates. SHA-256 hashes.
AES-256-GCM encrypts. HKDF-SHA-256 derives.

Every HKDF-SHA-256 call uses the zero-length salt of RFC 5869. The salt is
not a string.

An HKDF label is the `info` of the call. It is the ASCII bytes of the
label's name, with no length in front and no prefix. `quo-seal` is eight
bytes.

There are six labels. `quo-seal` and `quo-edge-seal` are used at the
message cipher. `quo-lock` and `quo-edge` are used at the edge key.
`quo-ward-sign` and `quo-ward-seal` are used at the ward key.

## The ward key

Two secrets come from the ward's seed. Each is HKDF-SHA-256 of the seed under one
label, with the seed as the input keying material and thirty-two bytes out.

The thirty-two bytes under `quo-ward-sign` are the Ed25519 private key as
RFC 8032 names it, the seed the signing key is expanded from.

The thirty-two bytes under `quo-ward-seal` are the X25519 scalar as RFC
7748 takes it. The function clamps it, and nothing clamps it before.

The ward pk is the signing pk followed by the padlock, 128 lowercase hex.
The ward's name is its ward pk.

Only bytes given as exactly thirty-two are the seed. Text is hashed with
SHA-256 to thirty-two bytes whatever its length, as its UTF-8 bytes, and so
are bytes of any other length.

## The lock

A ward's lock is an ML-KEM-768 key pair of FIPS 203. The lock is not in
the ward pk.

The lock's encapsulation key is 1184 bytes. It travels in every invitation.

## The other keys

Every key other than the ward key is drawn, and nothing derives it.

An heir secret is thirty-two drawn bytes, and they are the Ed25519 private
key as RFC 8032 names it, the seed the signing key is expanded from. No
label and no hash is applied before RFC 8032 takes them.

An ephemeral secret is thirty-two drawn bytes, and they are the X25519
scalar as RFC 7748 takes it, clamped by the function and not before.

An agreement is the thirty-two bytes X25519 gives from one secret and one
public key.

A public key takes no seal when it is an X25519 point of small order. Its
agreement with any secret is thirty-two zero bytes.

## Values

Everything that crosses inside a box is a value. A value is JSON text (RFC
8259) held to the rules of this chapter.

Every rule here is about the JSON text. No rule here is about what a
language parses that text into. A text that breaks a rule is not a value.

Whitespace that RFC 8259 allows, between tokens and around the value, is
read wherever JSON text is read: a payload, a reply text, an invitation. A
writer may pad what it seals with such whitespace. The signature covers the
padding as it covers every byte.

Bytes that are not UTF-8 are no JSON text. They are never mended into JSON
text. A byte order mark is not whitespace, and bytes that begin with one
are no JSON text here.

A number is any number the grammar of RFC 8259 allows. Its text is carried
as written. Quo reads no number but a count number. `-0`, `1e400` and
`9007199254740993` are values.

A payload, a reply text and an invitation have no duplicate keys among
their own keys. Two keys are one name when the strings they denote are
equal after escapes are read, compared code unit by code unit as RFC 8259
section 8.3 compares them. An escaped lone surrogate is one code unit like
any other. A key written as the letter `a`, and a key written as the
six-character escape for that letter, are one name.

Quo reads nothing inside `args`, nothing inside `object` but what the
chapter on what may be asked names, nothing of `method` but that it is a
string, nothing inside an entry of `at` that is not a string, and nothing
of a field this document does not name. Every
JSON text is a value there, whatever its strings, its keys or its nesting.
A door that will not read what stands there answers with a choice, silence
among them, and never with a stranger's case: the number is spent and the
keys move as on any choice.

## The invitation

An invitation is a value of this shape:

```
invitation = { ward, heir, secret, lock, at? }
```

`ward` is 128 hex, a ward pk. `heir` is 64 hex, an heir pk. `secret` is 64
hex, the heir secret. `lock` is 2368 hex, the lock's encapsulation key.

An invitation goes anywhere. A door reads no route from it.

`at`, when present, is an array of strings. Each string is an address: a
URI of RFC 3986 at which the ward is reached. The scheme of an address
names its carrier. The first address is the one the minting side prefers,
and each after it is preferred less.

A scheme is read without regard to case, as RFC 3986 reads it. An address
whose scheme names no carrier the reader stands is skipped. A string that
is not a URI with a scheme, or that the carrier of its scheme does not
write as an address, is skipped. An entry that is not a string is skipped.
An `at` that is not an array is read as absent. None of these makes an
invitation no invitation.

An address that reaches no door of that ward is not delivered.

Nothing else is read from an invitation. A field beside the five is
ignored, and an invitation with one is still an invitation.

A shape other than this one is no invitation. A ward pk alone with a secret
or a lock is no invitation. An heir with no secret is no invitation. A secret
with no heir is no invitation. An heir with no lock is no invitation. A lock
that is not 2368 lowercase hex, or that the modulus check of
FIPS 203 section 7.2 refuses, is no invitation.

## The relation

A relation runs one way.

The end at the ward that made the heir is the occupant. The end at the
other ward is the standing. Asks go from the standing to the occupant.
Replies come back from the occupant to the standing.

An edge key is thirty-two bytes. Each relation carries one edge key beside
its signing keys. Both ends compute it. Neither end sends it.

An end is what its ward keeps of the relation. The occupant is the
signing keys and the edge keys the door holds for the heir, and the count.
The standing is the invitation, the key it signs with, the edge key it
sends under, and the numbers of the asks it has moved on.

Two wards that each ask the other hold two relations. Each ward made the
heir of one. The two relations share no key.

An heir on which no door has made a choice is fresh. An heir on which a door
has made a choice is spent. A refusal does not spend an heir.

A knock is an ask on a fresh heir.

A door may stop holding an heir.

## The box

```
ask box   = ephemeral X25519 pk (32) || AES-256-GCM( head ) || AES-256-GCM( body )
knock box = ephemeral X25519 pk (32) || AES-256-GCM( head ) || ML-KEM-768 ciphertext (1088)
            || AES-256-GCM( body )
reply box = ephemeral X25519 pk (32) || AES-256-GCM( body )
head      = heir pk (32), or thirty-two zero bytes
body      = JSON text || signature (64)
```

Nothing rides outside a box but the ephemeral pk in front of it. No
relation key, no tag, no number and no ward key is in the clear.

A knock's box is the one box that carries a ciphertext.

The ciphertext is ML-KEM-768 encapsulation of FIPS 203 to the lock's
encapsulation key. It gives a thirty-two byte shared secret, which the lock
decapsulates.

## Sealing

The sender takes a fresh ephemeral key and agrees it with the padlock the
box is sealed to.

The agreement as it stands, with nothing concatenated to it, goes to
HKDF-SHA-256 under `quo-seal`. The result seals the head of an ask and the
body of a reply.

The body of an ask is sealed under `quo-edge-seal` over sixty-four bytes:
the agreement, then the edge key the ask is sent under.

Each of these HKDF calls gives forty-four bytes. The first thirty-two are
the AES-256 key. The last twelve are the nonce.

Each AES-256-GCM tag is sixteen bytes and rides at the end of its
ciphertext.

The additional authenticated data of every ciphertext is the ephemeral pk
its own box carries. It is never anything from another box.

An all-zero agreement is a box that does not open.

An ask's box is sealed to the ward's padlock.

A reply's box is sealed to the lid of the ask and to nothing else. It is
opened with the lid's secret.

An ask's box is one hundred and sixty bytes longer than its payload:
thirty-two of ephemeral pk, forty-eight of sealed head, sixteen of tag and
sixty-four of signature.

A knock's box is 1,248 bytes longer than its payload.

A reply's box is one hundred and twelve bytes longer than its reply text:
thirty-two of ephemeral pk, sixteen of tag and sixty-four of signature.

## The edge key

A knock's edge key is HKDF-SHA-256 of the knock's shared secret under
`quo-lock`, thirty-two bytes out. The knock's body is sealed under it.

Every reply carries an agreement both ends compute. The door computes it
from the reply's ephemeral secret and the lid. The asker computes it from
the lid's secret and the reply's ephemeral pk.

The edge key that follows a reply is HKDF-SHA-256 under `quo-edge` over
sixty-four bytes: the edge key the ask came under, then that agreement,
thirty-two bytes out.

The zero edge key is thirty-two zero bytes. Every ask on the zero head is
sent under it. The zero edge key never moves.

## The signature

The signature of an ask is sixty-four bytes of Ed25519 over the payload
bytes exactly as they stand in the box.

The signature of a reply is by the ward's signing key over the thirty-two
bytes of the lid the reply is sealed to, then the reply text. The lid is
signed and is not in the reply's body. The lid a reply is sealed to is the
lid whose secret opens it. A reader checks the signature over the lid of
its own ask.

On every head the signature is checked under the key `by` names.

A signature is checked against the bytes as they were received. It is never
checked against a re-serialisation of what those bytes parsed to.

A signature is Ed25519 as RFC 8032 defines it, and is deterministic. The
check is the cofactorless check of RFC 8032, `[s]B = R + [k]A`.

The check fails when the equation does not hold, and beside that in these
places and in no other:

- a signature of any length but sixty-four;
- an `s` at or above the group order;
- an `R` that does not decode to a point;
- an `R` whose bytes are not the bytes its point encodes to;
- a public key that does not decode to a point;
- a public key whose y, the low 255 bits read as an integer, is at or above
  the field's prime;
- a public key of small order, in any spelling, the sign bit set on `x = 0`
  included.

A public key with a torsion component that is not small-order verifies like
any other. A small-order `R` verifies like any other.

## The size

There is one size: 1,048,576 bytes of box. 1,048,577 bytes is above it.

A box above the size is not opened. An ask above it meets silence. A reply
above it reads as silence.

The size bounds a box and bounds nothing else.

## The payload

```
payload = JSON { to, by, next, seq, method?, args? }
```

In a payload, a pk is sixty-four hex. Sixty-four zero hex is no pk.

`to` is the heir pk the ask is for, 64 lowercase hex, or `null` for the
zero head.

`by` is the pk the payload is signed with, 64 lowercase hex.

`next` is the pk the sender will sign with next, 64 lowercase hex, or
`null` to announce nothing.

`seq` is a count number.

`method`, when present, is a string. An ask whose `method` is present is a
named ask. An ask whose `method` is absent is the empty ask.

`args`, when present, is one object. Absent is the empty object.

A payload that names every field it owes, each as above, is well formed.

`to` and `next` may be `null`. Absent is not `null`.

`method` and `args` may be absent and are never `null`.

The payload is one JSON object. An array, a string or a number is no
payload. A field this document does not name carries no meaning.

A door reads neither `method` nor `args` beyond this chapter. What a named
ask names is said in the chapter on what may be asked.

## The count

Every ask on a relation carries one number. A knock carries any count
number.

A door that keeps the relation honours each number once.

The number rides inside the signed payload, in `seq`.

A number above the highest the door has honoured is honoured whether or not
the numbers below it were seen.

Which numbers below the highest a door still honours is the door's own.

A knock's number is the first number the relation honours. The asks after
it continue the same count.

## The keys of a relation

A relation's signing keys are the heir, then the key the knock announces,
then each key an ask announces after it.

The heir is made by the inviting ward for one relation. The ward keeps the
heir pk. The ward gives the heir secret away inside the invitation.

The heir never rotates. It names the relation for as long as the relation
lasts. It rides inside the box and never outside it.

The standing's own key is made by the knocking ward. The knock is signed
with the heir and announces that key in `next`.

Every ask announces in `next` the key its sender will sign with next.

A door that keeps a relation holds two signing pks for an heir: the key held
and the key vouched for. It holds two edge keys: the open key and the
offered key.

After a door stops holding a spent heir, it may keep the signing
keys it held and vouched for and the open and offered edge keys. These are
the keys kept at removal.

On a fresh heir, a knock signed by the heir secret is admitted. On a spent
heir, an ask signed by the key held or by the key vouched for is admitted.
An ask signed by a key kept at removal is not admitted, and is answered `removed`.

How long a door keeps the keys kept at removal is its own. Past that, the
holder of those keys hears silence.

On a head that names an heir, `by` is owed to be a key the door admits or a
key kept at removal, and an ask by any other key is case 7.

An ask is a stranger's when the door does not admit it, it is not signed by
a key kept at removal, and it is not on the zero head. An ask on the zero
head is a stranger's when nothing answers it or its signature fails. A
stranger hears silence.

## The replies

```
reply = JSON { object, seen, at? } | { silence: true } | { quo: word }
```

A reply text is one of three shapes, with no field beside its shape's.

`{ object, seen, at? }`: `object` is any JSON value. `seen` is always
present. It is a string the answering side chooses, or `null`.

`at`, when present, is the addresses at which the ward that signed the
reply is reached, the first the one that ward prefers. It is written and
read as an invitation's `at` is. What
makes an invitation's `at` read as absent, or an entry skipped, does the
same here, and the reply is still an object.

A `seen` different from the one its asker heard before means that the
describe that asker would hear has moved, its `lang` included. The
chapter on what may be asked defines a describe. Quo does not say how a
`seen` is made. No end other than the answering side computes one.

`{ silence: true }`: bytes that say nothing and give no reason.

`{ quo: word }`: a reason, said only to an admitted key or to a key kept at
removal. Where a word would go to anyone else, the reply is silence.

There are three words and no fourth. `removed`: the door stopped holding
the heir after it was spent. `unannounced`: a knock announced no key of its
own and bound nothing. `repeated`: the number is one the door does not
honour.

A reply that does not open reads as silence. A reply not signed by the
signing key of the ward the ask was sent to, over the lid of that ask and
then the reply text, reads as silence. A reply that
is none of the three shapes reads as silence, and a `quo` whose word is not
one of the three is none of the three shapes.

A reply with a field beside its shape's is none of the three shapes. A
reply whose `seen` is neither a string nor `null` is none of the three
shapes. A reply text with two keys of one name among its own keys is none
of the three shapes.

Silence is a reply the door wrote, and it is bytes.

Nothing is not Quo's. Nothing means the ask was not delivered.

## What may be asked

```
describe = JSON { lang?, asks }
entry    = JSON { method, description?, args? }
```

The empty ask asks what may be asked. A describe is the object that
answers it.

`asks` is an array. Each of its items is an entry.

An entry is one object. Its `method` is a string.

A named ask asks the entry whose `method` is the ask's `method`. The ask's
`args` are what that entry takes.

`lang`, when present, is a string. It names the language the describe's
asks are read in. Quo reads nothing of `lang` but that it is a string.

A describe with no `lang` names no language. Its asks mean what this
document says of them and nothing more.

`description`, when present, is any value for whoever reads the entry.
`args`, when present, is what the entry's method takes. Quo reads neither.

A field of a describe or of an entry that this document does not name
carries no meaning.

A describe has no duplicate keys among its own keys, and neither has an
entry. Two keys are one name as they are in a payload.

No two entries of one describe name one `method`. Two methods are one
when their strings are equal after escapes are read, compared code unit by
code unit.

A value of any other shape is no describe. A value whose `asks` is absent
or not an array is no describe. An entry that is not an object, or whose
`method` is absent or not a string, makes no describe. A `lang` that is
not a string makes no describe.

What may be asked is for the asker who asks. One door may give two askers
two describes.

An object that answers the empty ask is a describe, beside any `seen`.
Silence on the empty ask is a choice like any other.

An object that is no describe is still an object. It moves the standing
as any object does.

## The move

A door that keeps a relation moves on a choice and on nothing else. A
refusal moves nothing.

A choice on a number below the highest the door had honoured before it
moves nothing. The tables below are for a choice on a number above it, and
for a knock.

A number the door does not honour is answered `repeated`.

An ask whose `next` is the heir pk, or is its own `by`, announces nothing,
on a fresh heir and on a spent one.

### The signing keys

On a fresh heir the choice is a knock. A knock that announces nothing binds
nothing and is answered `unannounced`. A knock that announces a key `K`
moves the keys this way, and the heir is held as a signing key by nobody
from then on:

| before     | after: held | after: vouched for |
| ---------- | ----------- | ------------------ |
| fresh heir | `K`         | nothing            |

On a spent heir, `H` is the key held and `V` the key vouched for, where `V`
may be nothing. The ask was signed by `H` or by `V`, and announced a key `K`
or nothing. A choice moves the keys this way:

| signed by | announced | after: held | after: vouched for |
| --------- | --------- | ----------- | ------------------ |
| `H`       | `K`       | `H`         | `K`                |
| `H`       | nothing   | `H`         | `V`                |
| `V`       | `K`       | `V`         | `K`                |
| `V`       | nothing   | `V`         | nothing            |

A key that is neither held nor vouched for after a move is forgotten.

### The edge keys

`follow(E)` is HKDF-SHA-256 under `quo-edge` over sixty-four bytes: the
edge key `E`, then the reply's agreement. It gives thirty-two bytes.

On a fresh heir, the door reads the ciphertext, decapsulates it with the
lock, and opens the body under the knock's edge key alone.

For the zero head, for an heir the door does not hold, and for an heir the
door stopped holding while it was fresh, the door reads no ciphertext and
opens the body under the zero edge key alone.

Otherwise the door reads no ciphertext. It tries the open key first and the
offered key second. For a spent heir the door stopped holding, it
tries the kept open key first and the kept offered key second. The first
key that opens the body is the key the ask came under.

`E` is the knock's edge key, `O` the open key and `F` the offered key. A
choice moves the edge keys this way:

| the ask           | after: open | after: offered |
| ----------------- | ----------- | -------------- |
| a knock under `E` | `E`         | `follow(E)`    |
| came under `O`    | `O`         | `follow(O)`    |
| came under `F`    | `F`         | `follow(F)`    |

An edge key that is neither open nor offered after a move is forgotten.

## The standing's side

A standing moves to its announced signing key, and to the edge key that
follows the one it sent under, when an object comes back to an ask whose
number is above every ask it has moved on, and on nothing else.

When the ask that brought the object announced nothing, the standing keeps
the signing key it has.

A knock is the one ask after which the door admits one key: the heir dies
and the announced key is held.

When a knock brings no object back, the door may have bound the heir or
not. The knocking ward learns which by asking under its own key and the
knock's edge key, with no ciphertext. If the door bound the heir, that ask
is admitted. If the door did not bind it, that box does not open.

A knock may be sent again as the same bytes. Where the heir is spent, that
knock moves nothing.

## What a knock binds

A knock binds when the door makes a choice on it. Only the first such knock
binds. A knock on a spent heir is a stranger's.

A knock on an heir a door stopped holding while it was fresh is a stranger's.

A knock on a secret that is not the heir's meets silence. A knock on a lock
that is not the ward's meets silence.

## The zero head

A head of thirty-two zero bytes names no heir. What answers it, and whether
anything does, is behind the door.

On the zero head the door keeps nothing for whoever asked: no key and no
count.

On the zero head no key is admitted, so the signature is checked under the
key `by` names and nothing more is asked of `by`.

On the zero head `next` and `seq` are held to the payload's rules, and the
door keeps nothing by them.

On the zero head the same sealed bytes presented twice are answered twice.

To the zero head, a case that would be a word to an admitted key is
silence.

A head that names an heir the door does not hold is not the zero head. It is
a stranger's and hears silence.

## What a door tells apart

These are the cases a door that answers tells apart, in the order they are
met. The first case met is the answer.

Strangers hear silence, and nothing moves. The stranger's cases are these,
in this order.

- **Case 1.** The box does not open: a wrong padlock, garbage, a box above
  the size, a head that does not open, a fresh heir's box too short for a
  ciphertext, a body that opens under no edge key the door takes for the
  head's heir, or a body of sixty-four bytes or fewer.
- **Case 2.** A payload that opens and is not UTF-8, is not JSON, is not one
  object, or has two keys of one name among its own keys. It is answered as
  case 1 is.
- **Case 3.** The payload is not well formed: `to`, `by` or `next` not a pk
  where a pk is owed, sixty-four zero hex included; on the zero head, `to`
  not `null`; on any other head, `to` not the heir pk the head names;
  `method` not a string; `args` present and not one object; `seq`
  not a count number; a field owed and absent.
- **Case 4.** The zero head, and nothing answers it.
- **Case 5.** The zero head, and the signature fails.
- **Case 6.** The heir is not held: never made here, or the door stopped
  holding it while it was fresh, or the door stopped holding it while it
  was spent and keeps no key of it.
- **Case 7.** The key is not admitted and is not a key kept at removal.
- **Case 8.** The signature fails under an admitted key or under a key kept
  at removal.

Refusals hear a word, and nothing moves.

- **Case 9.** `removed`: the key is a key kept at removal.
- **Case 10.** `unannounced`: the heir is fresh, and `next` is `null` or the
  heir itself.
- **Case 11.** `repeated`: the number is one the door does not honour.

Choices spend the number. A knock, and a choice on a number above the
highest, move the keys.

- **Case 12.** An object came back.
- **Case 13.** Silence came back, on a named ask or on the empty ask.

A stranger's silence is one reply whose reply text is `{"silence":true}`,
sealed to the lid the ask came with and signed by the ward's signing key.
Its reply text and its length are the same for every stranger's case and
for a chosen silence.

When an ask does not open, the reply is sealed to the first thirty-two
bytes of what arrived when there are that many. When there are not that
many, or when those bytes take no seal, the reply is sealed to a lid nobody
holds.

A lid nobody holds is thirty-two drawn bytes taken as a lid. When those
take no seal either, it is the X25519 public key, on the RFC 7748 base
point, of thirty-two more drawn bytes.

Whichever lid a reply is sealed to, its signature covers that lid.

The signature is checked before anything moves and before any word is said.

Where a door has no value to write, the reply is silence.

## The carrier

A carrier is one sentence: bytes to a ward pk in, bytes or nothing out, and
nothing means not delivered.

Quo names no carrier and no port. A carrier's own document names the
scheme its addresses are written in, and how they are written.
