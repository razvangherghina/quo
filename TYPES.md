# TYPES

Quo read as types, for an exact reading. The types carry no rule.
`SPEC.md` decides, and where the two seem to differ, the types are wrong.

## Two readings

`SPEC.md` is the whole of Quo. Two readings stand beside it, and neither
is Quo. `IMAGINE.md` reads the spec as a picture, for a first reading.
This document reads the same spec as types, for an exact one. The chapter
"The words side by side" sets the spec's words, the picture's words and
the type names in one table.

## The notation

The types are written in the GraphQL schema language. It is widely read.
It carries a sentence on every field, and it has a shape for one thing out
of several. It is a notation here and nothing more. Nothing in Quo runs
over GraphQL. No kit needs it, no door answers a query, and no byte of it
crosses a door.

The notation reads this way:

- `type` names a shape and its fields.
- `scalar` names a value with a spelling of its own, said in its sentence.
- `enum` is one name out of a closed list.
- `union` is one shape out of several.
- `!` after a type means the field is always there. Without it the field
  may be null.
- `[Pk!]!` is a list of `Pk`.
- A field with parentheses takes what stands inside them and gives what
  follows the colon.
- Text in quotes above a name is that name's sentence.

An enum value in lowercase is written on the wire exactly so. An enum
value in capitals never crosses a door. The fields of `Invitation`,
`Payload`, `Answer`, `Silence` and `WordReply` are the keys of their JSON
text, spelt as on the wire.

A key pair is named by its public key. A secret is a field only where it
crosses, which is `Invitation.secret` alone.

## Where the notation stops

The types say shapes. Four things the spec fixes are outside any shape,
and each is said in a sentence where it matters.

- **Absent and null.** The notation has one null. The spec tells a field
  that is absent from a field that is `null`, and each field's sentence
  says which it takes.
- **Bytes as received.** A signature is checked against the bytes as they
  arrived, padding included, and never against a shape parsed from them.
- **Order.** A door meets its cases in order, and the first met answers.
  A table holds that order.
- **Arithmetic.** The six algorithms, the labels and the signature check
  are not typed. The last chapter names the spec chapter for each.

## Values

```graphql
"""
Bytes as text: two lowercase hexadecimal digits for each byte.
Text of any other spelling, uppercase included, is not hex.
"""
scalar Hex

"Raw bytes, as a carrier moves them. A box is bytes."
scalar Bytes

"""
A public key in a payload or an invitation: 64 hex, thirty-two bytes.
Sixty-four zero hex is no pk.
"""
scalar Pk

"""
A ward pk: 128 hex. The signing pk, then the padlock.
The ward's name is its ward pk.
"""
scalar WardPk

"""
A count number, as its JSON text: no fraction and no exponent,
from 1 to 9007199254740991, which is 2^53 - 1.
1 is a count number. 1.0 and 1e0 are not.
"""
scalar Count

"""
A value: JSON text of RFC 8259, carried as written.
It is UTF-8 and never begins with a byte order mark.
Whitespace between tokens and around the value is read, and is signed.
A number keeps its text: -0, 1e400 and 9007199254740993 are values.
"""
scalar Value

"""
An address: a URI of RFC 3986 at which a ward is reached.
Its scheme, read without regard to case, names a carrier.
Quo names no carrier. A carrier's own document writes its addresses.
"""
scalar Address

"""
AES-256-GCM ciphertext with its sixteen-byte tag at the end.
Its additional authenticated data is the ephemeral pk of its own box.
"""
scalar Sealed
```

## The ward

```graphql
"""
A ward is thirty-two bytes, its seed. Two secrets come from the seed by
HKDF-SHA-256: the signing key under quo-ward-sign, and the X25519 scalar
under quo-ward-seal. No seed crosses a door.
"""
type Ward {
  "The ward's name: the signing pk, then the padlock."
  pk: WardPk!
  "The Ed25519 key every reply of this ward is signed with."
  signingPk: Pk!
  "The X25519 key every ask to this ward is sealed to, 64 hex."
  padlock: Hex!
  """
  The lock's encapsulation key, ML-KEM-768: 1184 bytes, 2368 hex.
  It is not in the ward pk. It travels in every invitation.
  """
  lock: Hex!
  "The one function of this ward."
  door: Door!
  "The relations whose heir this ward made. Asks come in on them."
  occupants(state: HeirState): [Occupant!]!
  "The relations whose invitation this ward holds. Asks go out on them."
  standings(state: StandingState): [Standing!]!
}

"A door is one function: bytes in, bytes or nothing out."
type Door {
  "The box of the reply. Null is nothing: no reply at all."
  handle(box: Bytes!): Bytes
}
```

## What crosses a door

An invitation goes by any channel. Everything else crosses as a box.

```graphql
"""
An invitation is a value of this shape. A field beside the five is
ignored. A door reads no route from it.
"""
type Invitation {
  "The pk of the ward that made the heir."
  ward: WardPk!
  "The heir pk. It names the relation for as long as the relation lasts."
  heir: Pk!
  "The heir secret, 64 hex. A knock is signed with it."
  secret: Hex!
  """
  The ward's lock, 2368 hex. A lock the modulus check of FIPS 203
  section 7.2 refuses makes this no invitation.
  """
  lock: Hex!
  """
  Where the ward is reached, the most preferred first. It may be absent.
  An entry that is no address of a carrier the reader stands is skipped.
  """
  at: [Address!]
}

"""
An ask's box, sealed to the ward's padlock. It is 160 bytes longer than
its payload. Nothing rides outside it but the lid.
"""
type AskBox {
  "The lid: this box's ephemeral X25519 pk, 32 bytes, in the clear."
  lid: Hex!
  "The head, sealed under the agreement alone: an heir pk, or the zero head."
  head: Sealed!
  """
  The payload, then its signature, sealed under the agreement and the
  edge key the ask is sent under.
  """
  body: Sealed!
}

"""
A knock's box: an ask on a fresh heir, and the one box that carries a
ciphertext. It is 1,248 bytes longer than its payload.
"""
type KnockBox {
  lid: Hex!
  head: Sealed!
  """
  ML-KEM-768 encapsulation to the lock, 1088 bytes. Its shared secret
  gives the knock's edge key under quo-lock.
  """
  ciphertext: Bytes!
  body: Sealed!
}

"""
A reply's box, sealed to the lid of its ask and to nothing else.
It is 112 bytes longer than its reply text.
"""
type ReplyBox {
  "A fresh ephemeral X25519 pk, 32 bytes, in the clear."
  ephemeralPk: Hex!
  """
  The reply text, then the ward's signature. The signature covers the
  lid of the ask, then the reply text. The lid is signed and not sent.
  """
  body: Sealed!
}

"""
The payload: one JSON object, signed by the key `by` names over its
bytes exactly as they stand in the box. A field this shape does not
name carries no meaning.
"""
type Payload {
  "The heir pk the ask is for. Null for the zero head. Absent is not null."
  to: Pk
  "The pk the payload is signed with."
  by: Pk!
  "The pk the sender signs with next. Null announces nothing. Never absent."
  next: Pk
  "This ask's number. A door honours a number once on a relation."
  seq: Count!
  "A string Quo does not read. Absent is the empty ask. Never null."
  method: String
  "One object Quo does not read. Absent is the empty object. Never null."
  args: Value
}

"A reply text is one of three shapes, with no field beside its shape's."
union Reply = Answer | Silence | WordReply

"An object came back."
type Answer {
  "Any value."
  object: Value!
  """
  A mark only the answering side makes: a string, or null. Never absent.
  A seen different from the one before means what may be asked has moved.
  """
  seen: String
}

"""
Bytes that say nothing and give no reason. A door writes it as the
sixteen bytes {"silence":true} and no others.
"""
type Silence {
  "Always true."
  silence: Boolean!
}

"A reason, said only to an admitted key or to a key kept at removal."
type WordReply {
  quo: Word!
}

"There are three words and no fourth."
enum Word {
  "The door stopped holding the heir after it was spent."
  removed
  "A knock announced no key of its own and bound nothing."
  unannounced
  "The number is one the door does not honour."
  repeated
}
```

A reply that does not open reads as silence. So does a reply not signed
by the ward over the ask's lid and the reply text. So does a reply above
the size, and a reply text that is none of the three shapes.

## The two ends

A relation runs one way. Asks go from the standing to the occupant, and
replies come back. Two wards that each ask the other hold two relations,
and the two share no key.

```graphql
"""
The occupant: the end at the ward that made the heir. It is what that
ward keeps of the relation: two signing pks, two edge keys and the count.
"""
type Occupant {
  "The heir pk. It never rotates. It rides inside the box, never outside."
  heir: Pk!
  state: HeirState!
  "The key held. Null while the heir itself signs, and when no key is kept."
  held: Pk
  "The key vouched for, or null."
  vouched: Pk
  "The open edge key, 64 hex. Both ends compute it and neither sends it."
  open: Hex
  "The offered edge key: it follows the key the last ask came under."
  offered: Hex
  "The count: every number this door has honoured on the relation."
  honoured: [Count!]!
}

"""
The standing: the end at the other ward. It is what that ward keeps:
the invitation, the key it signs with, the edge key it sends under, and
the numbers of the asks it has moved on.
"""
type Standing {
  invitation: Invitation!
  state: StandingState!
  "The key its next ask is signed with: the heir, then a key of its own."
  signingKey: Pk!
  "The key its last ask announced in next, or null."
  announced: Pk
  "The edge key it sends under. Null before the knock, which gives the first."
  edgeKey: Hex
  "The numbers of the asks it has moved on."
  movedOn: [Count!]!
}

"""
A relation is one heir with the keys and the count that follow it.
This shape joins its two ends on the heir pk. No ward holds this view,
and no wire shows it.
"""
type Relation {
  heir: Pk!
  occupant: Occupant!
  "The end whose knock bound. Null while the heir is fresh."
  standing: Standing
  """
  Every end that holds the invitation. More than one means the invitation
  was copied. Only the first knock a door makes a choice on binds.
  """
  holders: [Standing!]!
}

"""
The reader's view. A reader of this document sees every ward at once.
No ward does: each keeps its own ends and nothing of anyone else's.
"""
type Query {
  ward(pk: WardPk!): Ward
  relation(heir: Pk!): Relation
}
```

### What each end knows

- A standing knows the ward it asks, because the invitation names the
  ward pk.
- An occupant knows its asker by a key alone. A payload carries `by` and
  `next`, and no ward pk of the asker.
- The heir pk is the one name both ends hold. It rides sealed in the head,
  so no carrier reads it.

## The occupant's states

```graphql
enum HeirState {
  "No door has made a choice on it. A knock signed by the heir is admitted."
  FRESH
  "A door has made a choice on it. The heir signs nothing from then on."
  SPENT
  "The door stopped holding it while fresh. A knock on it hears silence."
  DROPPED
  "The door stopped holding it while it was spent, and keeps its keys."
  REMOVED
  "The door stopped holding it while it was spent, and keeps no key of it."
  GONE
}
```

| From | What happens | To | Heard |
| --- | --- | --- | --- |
| nothing | the ward makes an heir | FRESH | |
| FRESH | a knock that announces a key meets a choice | SPENT | an object, or silence |
| FRESH | a knock announces nothing | FRESH | `unannounced` |
| FRESH | the door stops holding the heir | DROPPED | |
| SPENT | a choice on a number above the highest | SPENT, and the keys move | an object, or silence |
| SPENT | a choice on a number below the highest | SPENT, and nothing moves | an object, or silence |
| SPENT | a number the door does not honour | SPENT | `repeated` |
| SPENT | the door stops holding the heir and keeps its keys | REMOVED | |
| SPENT | the door stops holding the heir and keeps no key | GONE | |
| REMOVED | an ask signed by a key kept at removal | REMOVED | `removed` |
| REMOVED | the door forgets the keys kept at removal | GONE | |
| DROPPED, GONE | any ask | the same | silence |

While REMOVED, `held`, `vouched`, `open` and `offered` are the keys kept
at removal. How long a door keeps them is its own.

### The signing keys

A choice on a knock that announces `K` makes `K` the key held, with
nothing vouched for. On a spent heir, `H` is held and `V` is vouched for.
A choice on a number above the highest moves them this way.

| Signed by | Announced | Held after | Vouched for after |
| --- | --- | --- | --- |
| `H` | `K` | `H` | `K` |
| `H` | nothing | `H` | `V` |
| `V` | `K` | `V` | `K` |
| `V` | nothing | `V` | nothing |

A key that is neither held nor vouched for after a move is forgotten. An
ask whose `next` is the heir pk, or is its own `by`, announces nothing.

### The edge keys

`follow(E)` is HKDF-SHA-256 under `quo-edge` over sixty-four bytes: the
edge key `E`, then the agreement of the reply. `E` is the knock's edge
key, `O` the open key and `F` the offered key. A door tries `O` first and
`F` second.

| The ask | Open after | Offered after |
| --- | --- | --- |
| a knock under `E` | `E` | `follow(E)` |
| came under `O` | `O` | `follow(O)` |
| came under `F` | `F` | `follow(F)` |

An edge key that is neither open nor offered after a move is forgotten.
Every ask on the zero head is sent under the zero edge key, thirty-two
zero bytes, which never moves.

## The standing's states

```graphql
enum StandingState {
  "It holds the invitation and has not knocked. Its next ask is the knock."
  UNUSED
  "Its knock brought no object back. The door may have bound the heir or not."
  KNOCKED
  "It knows the door admits a key of its own: an object or a word came back."
  BOUND
  "It heard removed. The door stopped holding the relation."
  REMOVED
}
```

| From | What happens | To |
| --- | --- | --- |
| nothing | the ward holds an invitation | UNUSED |
| UNUSED | the knock brings an object | BOUND |
| UNUSED | the knock brings silence, or nothing | KNOCKED |
| UNUSED | the knock brings `unannounced` | UNUSED |
| KNOCKED | an ask under its own key and the knock's edge key brings an object or `repeated` | BOUND |
| KNOCKED | the same knock, sent again as the same bytes, brings an object | BOUND |
| KNOCKED | that ask brings `removed` | REMOVED |
| KNOCKED | that ask brings silence, or nothing | KNOCKED |
| BOUND | an ask brings `removed` | REMOVED |

A standing moves when an object comes back to an ask numbered above every
ask it has moved on, and on nothing else. It moves to the signing key it
announced, and to the edge key that follows the one it sent under. When
that ask announced nothing, it keeps the signing key it has.

While KNOCKED, silence tells a standing nothing. A chosen silence binds
the heir, and a stranger's silence binds nothing, and the two are the
same bytes.

## What a door tells apart

```graphql
"""
What a door that answers makes of one arrival. Only the door knows the
case. On the zero head nothing is spent and nothing moves.
"""
type Arrival {
  "The case met, from 1 to 13. The first case met is the answer."
  case: Int!
  group: CaseGroup!
  "What the door writes. Silence is a reply the door wrote, and it is bytes."
  reply: Reply!
  "True on a choice on a relation: the number is spent."
  spends: Boolean!
  "True on a knock that binds, and on a choice above the highest number."
  moves: Boolean!
}

enum CaseGroup {
  "Cases 1 to 8. One silence for all of them, and nothing moves."
  STRANGER
  "Cases 9 to 11. A word, and nothing moves."
  REFUSAL
  "Cases 12 and 13. An object, or a silence of the door's own."
  CHOICE
}
```

| Case | When | Heard | Spends | Moves |
| --- | --- | --- | --- | --- |
| 1 | the box does not open | silence | no | no |
| 2 | the payload is not UTF-8, not JSON, not one object, or has two keys of one name | silence | no | no |
| 3 | the payload is not well formed | silence | no | no |
| 4 | the zero head, and nothing answers it | silence | no | no |
| 5 | the zero head, and the signature fails | silence | no | no |
| 6 | the heir is not held: never made here, DROPPED or GONE | silence | no | no |
| 7 | the key is not admitted and is not a key kept at removal | silence | no | no |
| 8 | the signature fails under an admitted key or a key kept at removal | silence | no | no |
| 9 | the key is a key kept at removal | `removed` | no | no |
| 10 | the heir is fresh, and `next` is `null` or the heir itself | `unannounced` | no | no |
| 11 | the number is one the door does not honour | `repeated` | no | no |
| 12 | an object came back | an `Answer` | yes, on a relation | a knock, or a number above the highest |
| 13 | silence came back, on a named ask or the empty ask | silence | yes | as case 12 |

A stranger's silence is sealed to the lid the ask came with and signed by
the ward. Its reply text and its length are the same for cases 1 to 8 and
for case 13. On the zero head, a case that would be a word is silence.

## Sizes

There is one size: 1,048,576 bytes of box. A box above it is not opened.

| Box | Longer than its text by | Made of |
| --- | --- | --- |
| an ask | 160 bytes | 32 of lid, 48 of sealed head, 16 of tag, 64 of signature |
| a knock | 1,248 bytes | an ask's 160, and 1,088 of ciphertext |
| a reply | 112 bytes | 32 of ephemeral pk, 16 of tag, 64 of signature |

## Names that are this reading's own

The spec says each of these in a sentence and gives it no name. The name
is this reading's, and it binds no kit.

| Name | The spec's sentence |
| --- | --- |
| `Answer` | a reply text of the shape `{ object, seen }` |
| `WordReply` | a reply text of the shape `{ quo: word }` |
| `HeirState.DROPPED` | the door stopped holding the heir while it was fresh |
| `HeirState.REMOVED` | the door stopped holding it while it was spent, and keeps keys of it |
| `HeirState.GONE` | the door stopped holding it while it was spent, and keeps no key of it |
| `StandingState.UNUSED` | the standing holds an invitation it has not knocked on |
| `StandingState.KNOCKED` | a knock brought no object back |
| `StandingState.BOUND` | the door bound the heir to a key this standing made, and the standing knows it |
| `StandingState.REMOVED` | the standing heard `removed` |
| `Arrival`, `CaseGroup` | the cases a door tells apart, and their three groups |
| `Relation.holders` | every ward that holds one invitation |
| `Query` | the view of a reader, which no ward has |

## The words side by side

| The spec | The picture | The types |
| --- | --- | --- |
| ward | a house | `Ward` |
| door | the porter | `Door` |
| signing pk and padlock | the ring and the seal | `Ward.signingPk`, `Ward.padlock` |
| lock | the lock printed on the card | `Ward.lock`, `Invitation.lock` |
| relation | a booth | `Relation` |
| occupant | the purple side | `Occupant` |
| standing | the red side | `Standing` |
| heir | the first key | `Invitation.heir`, `Occupant.heir` |
| invitation | the card | `Invitation` |
| knock | stepping in with the first key | `KnockBox` |
| ask | asking | `AskBox`, `Payload` |
| `next`, the key held, the key vouched for | a key that keeps moving | `Payload.next`, `Occupant.held`, `Occupant.vouched` |
| edge key | two keys that follow every answer and are never sent | `Occupant.open`, `Occupant.offered`, `Standing.edgeKey` |
| `seq`, the count | the number of every visit | `Payload.seq`, `Occupant.honoured` |
| `seen` | the small mark | `Answer.seen` |
| an object | an answer | `Answer` |
| silence | the blank sheet | `Silence` |
| a word | a word | `WordReply`, `Word` |
| zero head | the grey booth | `Payload.to` as null |
| a stranger | a stranger | `CaseGroup.STRANGER` |
| nothing | nothing is heard | `Door.handle` gives null |
| carrier | the fold between two houses | `Address`, and no type |

## What is typed and what is not

| Chapter of `SPEC.md` | Here |
| --- | --- |
| Terms | every type's sentence |
| The algorithms | not typed |
| The ward key | `Ward` |
| The lock | `Ward.lock`, `Invitation.lock` |
| The other keys | not typed |
| Values | `Value`, `Count`, `Hex`; duplicate keys and padding are not typed |
| The invitation | `Invitation`, `Address` |
| The relation | `Relation`, `Occupant`, `Standing` |
| The box | `AskBox`, `KnockBox`, `ReplyBox` |
| Sealing | `Sealed`, Sizes; the derivations are not typed |
| The edge key | The edge keys |
| The signature | `ReplyBox.body`, `Payload.by`; the check is not typed |
| The size | Sizes |
| The payload | `Payload` |
| The count | `Count`, `Occupant.honoured` |
| The keys of a relation | The signing keys, `HeirState` |
| The replies | `Reply`, `Answer`, `Silence`, `WordReply`, `Word` |
| The move | The occupant's states |
| The standing's side | The standing's states |
| What a knock binds | `Relation.holders`, `HeirState` |
| The zero head | `Payload.to`, cases 4 and 5 |
| What a door tells apart | `Arrival`, `CaseGroup`, the table of cases |
| The carrier | `Door`, `Address` |
