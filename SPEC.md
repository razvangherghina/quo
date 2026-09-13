# SPEC

This is the truth of Quo, and the whole context. It assumes nothing from any
other document. It is the protocol and nothing else: what any ward anywhere
must do, in any language, for its bytes to be Quo. A sentence is here only
because a ward written in another language needs it to interoperate with
ours. What one kit chose, and another kit may refuse, is that kit's paper and
never this one.

It carries no version and keeps no history. There is no 1.0.0 yet, so there
is nobody holding an older Quo to be compatible with, and no changelog to
write. This file is rewritten in place to say what the tree says, and when
the two disagree the fix is to move one of them, the same day. Where the tree
is behind a decision, the chapter "Where the tree stands" says so; that
chapter is the one place a gap is allowed to be named instead of closed.
Before 1.0.0 there is no compatibility promise: this document may still
move under anyone holding it. At 1.0.0 it is frozen once, and versioning
starts to mean something.

## What Quo is

Quo is a protocol that lets an object ask another object and get an answer,
without knowing whether that other object is in the same process, on the same
device, or on another planet. It works on any device and in any language that
can run code. It is three words, two of which are beings, and two edges.
Nothing else is Quo.

- **Harbor.** The program a device runs to boot wards. Owns the wire and the
  operating system. Not a being. Nobody outside its device.
- **Ward.** One process of its harbor. A being plus ward functions. Keeps
  beings and judges its door.
- **Being.** One ordinary object, one voice.

Each word names both the interface and the thing. There is no fourth word.

```
device A                            device B
  harbor A                            harbor B
    map: pk -> door | reach             map: pk -> door | reach
    ward W1  (pk1)                      ward W3  (pk3)
      being b1                            being b4
        standings: [shop, bank]             occupants: [cust7]
        occupants: [owner]                being b5   public
      being b2
    ward W2  (pk2)
      being b3
```

- A ward is named outward by one public key, its pk, derived from its seed.
  That pk routes and nothing else. A being has no pk and no address. She has
  relations, named by ids that never leave her ward.
- A **standing** is a pointer a being holds to another being, through which
  she asks. An **occupant** is a being she invited, whom her ward names when
  she asks.
- Every relation has two keys, one minted by each side for that relation
  alone. Underneath every id her ward keeps the far ward's pk, the key she
  is known by in that relation, and the key the far side is known by. She
  never sees them.
- The harbor routes by ward pk only. Its own pks map to doors, one per ward
  it booted. Foreign pks map to whatever the device calls a reach. How a
  harbor fills the foreign half is its own directory, and Quo says nothing
  about it.
- b1 asking b3 and b1 asking b4 are the same act inside the ward. The first
  never leaves harbor A. The second does. b1 cannot tell, and should not. b1
  asking b2 never leaves the ward at all.
- The ward routes one thing: its own pk. Every other ward pk goes into one
  call the harbor gave it, and what comes back is bytes or nothing.

The rule that closes every chapter: whatever does not fit one of the lines in
this document is not Quo's.

## The two edges

Quo has two edges, harbor to ward and ward to being. At each an object
crosses once, at birth, and calls cross for the rest of the ward's life.
Nothing crosses either of them but what is written here.

### Harbor to ward

The harbor passes the **ground**, once, at birth, and receives two pointers.
The ground is nine things, and a kit gathers them however its
language gathers things. What each one is, is Quo's; how they are held
together is not.

1. **The seed.** The ward derives its pk from it and from nothing else.
   Thirty-two bytes are the seed; anything else, text or bytes of another
   length, is SHA-256'd to thirty-two bytes first. Text is hashed as its
   UTF-8 bytes, whatever its length, so text is never taken as a key.
2. **The partition.** The ward's files, as values, opaque to the harbor.
3. **Instantiate.** A class name and a stance in, the being or nothing out.
   A name the harbor does not hold is nothing, and the boot that named it
   fails. A class that throws while it is made throws out of instantiate,
   and the ward reads that throw as a being that threw at birth: the boot
   fails the same way, and a being booted before is absent this run.
4. **Carry.** A ward pk and bytes in, bytes or nothing out. Nothing means no
   door was reached, and a throw is read the same way.
5. **Random.** A count in, that many bytes of entropy out. Every key a ward
   mints is drawn from it.
6. **Wrote.** The ward says it after every write to its partition, and after
   nothing else, naming the row. What a row is, is the kit's own, since the
   partition's shape is: the harbor keeps rows and reads none. It is told,
   and nothing comes back from it. A harbor that keeps the partition saves
   in the order it was told. A harbor that keeps nothing needs it not at
   all.
7. **Keep.** Whether what was written is kept. The ward asks it once, at the
   end of an arrival, after the being has answered and before the reply is
   sealed, and no in makes that arrival a failed ask. It is the only thing
   the ward learns about storage, and it learns it as yes or no and never as
   a reason. A harbor that keeps nothing needs it not at all, and a ward
   never asked answers as though no store could ever say no.
8. **Calling.** A call of this ward's has begun, and what comes back says it
   has ended. The ward says it, because the ward is the one that knows where
   a call begins: a being reaching another being is one relation and two
   halves, and she writes her side before the bytes go out and again when
   they come back. Between the two her rows are half of a call, and a harbor
   may write them down but may not take them as a point to put a refused ward
   back to. Calls nest, a call that threw ends like any other, and a harbor
   that keeps nothing needs it not at all.
9. **The box.** One invitation on the box's own being, minted for this ward
   alone. The ward takes it at birth as a standing of its own being, and
   that standing is the whole device. A harbor that lends nothing leaves it
   out.

Nine things, and nothing else is ever passed: a harbor that needs a tenth
has found a gap in Quo or a leak into the ward. The box is the whole of what
a device offers, and it offers it as a relation and never as an object: the
things a device can do are beings, booted by the harbor in a ward of its
own, and a being reaches one by holding a standing at her, exactly as she
reaches a being on another planet. One being of that ward is the box's own,
and she holds a standing at each of the others under the name it is lent as.
The name is her namespace and no word of the ward. Which ward may have which
name is her gate, reading who asks, and a stranger's ward holds no standing
at her and is lent nothing. A harbor mints nothing for a lend and nothing
for the box: it holds the ask pointer of the ward it booted, so it is that
ward's root, and it places the box's invitation the way a root invites on
any being of its ward, once, before any ward it hosts is born.

Returned:

- **The door.** One call: sealed bytes in, sealed bytes out, and one bit
  beside them, `heard`: whether a key this door holds spoke. Always bytes:
  when the ask did not open, the reply is a silence sealed to whatever
  ephemeral pk the bytes carried, and to a key nobody holds when they carried
  none. **Noise** is that second reply, and it is noise to whoever receives
  it and not in how it is made: the same silence, the same length, sealed to
  a lid no one can open. A reply is never random bytes, because the law of
  one silence is a law about length. The bit is all a
  harbor learns from an arrival, never a reason: a pk that only ever brings
  strangers' bytes is the harbor's to rate or refuse, and what a bound key
  hears is sealed to its own lid.
- **The ask.** One call: method and args in, a value or silence out. A value,
  not an object: what a being answers is held to the value rule and nothing
  narrower, so a string, a number and an array are all answers.
  In-process and unsealed. This is the one unsealed ask in Quo, and the only
  way a ward is piloted. Judgment, catching, and the return table are not
  skipped: a throw inside is silence, and an unreached shape is silence.

The harbor learns the ward's pk the way anyone learns anything: it asks. The
empty ask on the ask pointer answers with the ward's describe, and the pk is
in its notes.

### Ward to being

The ward passes one object, once, at birth, and receives one object, on
which it calls one method.

```
in    the stance      at birth, once, for life
      the asker       at every ask
out   her answer(asker, method?, args?) -> object | silence      the one method the ward calls
```

The stance is her cells, her standings to ask, the calls to invite,
knock, take and remove, boot, and lend. The ward builds it and hands it
to the harbor's instantiate with a class name, and receives her. No method is
the empty ask, and what she answers to it is her blueprint.

The stance, as every being in every language receives it. Nothing more is
ever offered, and nothing here may be missing.

The table below is written in one language's spelling, and three of its words
mean one thing. `nothing` is a call that answers nothing at all, `null` is a
call that answers an absence where a value was possible, and `undefined` is a
lookup that found no record. A language with one absence spells all three
with it and loses nothing, because no being ever tells them apart: what she
is owed is that a lookup that found nothing is not an error, that a call that
refused says so as an absence and not as a throw, and that an absence is
never a value that crossed a door. A language with none, where a lookup
returns a pair or a case of its own, uses that. The distinction the table
draws is one language's grammar, and no byte on any wire carries it.

```
stance
  cells                                                her state. values only.

  occupants.invite(id, notes?)                         -> invitation | null      awaitable: a key is minted
  occupants.remove(id)                                 -> nothing

  standings.knock(invitation, method?, args?, wanted?) -> object | silence | word
  standings.take(id, invitation)                       -> id | null            awaitable: it waits for the relation
  standings[id]                                        -> standing | undefined
  standings[id].ask(method?, args?, wanted?)           -> object | silence | word
  standings.remove(id)                                 -> nothing

  boot(class, key, id?)                                -> key | null           a new being of her ward, by class name.
                                                                               with an id, her standing to her under it

  lend(name, id)                                       -> id | null            a standing at what this device lends,
                                                                               by the harbor's name for it. awaitable:
                                                                               the ward knocks and takes it for her

  wanted = { time? }                                   what this one ask may spend, in milliseconds. optional,
                                                       and so is saying anything at all
```

Return table.

| call                | returns    | when                                                                                                         |
| ------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| invite(id, notes?)  | invitation | she minted a fresh id; the occupant record exists from now, with those notes on it                           |
|                     | null       | the id already names a record, occupant or standing, or is a reserved word, or the notes are not values      |
| remove(id)          | nothing    | always. removing what is not there is nothing                                                                |
| knock(inv, m, a, w) | object     | the far being answered                                                                                       |
|                     | silence    | no ward claims the invitation, or another consumed it, or the far being chose silence                        |
|                     | word       | why not, when the far door or her own ward can say: removed, absent, unannounced, repeated,                  |
|                     |            | threw, unreached, late, invitation. see "Silence, the words, error"                                          |
| take(id, inv)       | id         | she knocked with this invitation and was answered, and the id is fresh                                       |
|                     | null       | no answered knock on this invitation, or the id already names a record, or is a reserved word                |
| standings[id]       | standing   | the record exists                                                                                            |
|                     | undefined  | it does not. not an error                                                                                    |
| ask(m, a, w)        | object     | she answered                                                                                                 |
|                     | silence    | she chose to say nothing, or bytes came back that are not Quo's                                              |
|                     | word       | why not: removed, absent, repeated, threw, unreached, late, dropped                                          |
| boot(cls, key, id?) | key        | she exists from now, with fresh cells, and a restart finds her; with an id, her maker holds her standing     |
|                     | null       | the key is already booted, the harbor holds no such class, the class threw at birth, the id is one the maker |
|                     |            | already holds or a reserved word, or the relation was refused; nothing of the being made is left             |
| lend(name, id)      | id         | this device lends that name to her ward, and she holds a standing at it under the id she gave                |
|                     | null       | it lends no such name here, the id already names a record or is a reserved word, or the relation was         |
|                     |            | refused; nothing is left behind                                                                              |

A being may make, and only the owner reaches into another. Boot touches
nobody else: the being made has empty cells and no relation but the one her
maker named, and every other is invited and taken like any other. That one is
made the way all of them are, and it is the whole of what making gives: the
being made mints an occupant for her maker under the maker's own key, so she
knows who made her by that name and by nothing else, and her maker knocks
with it and takes the standing under the id she gave. Naming no id makes no
relation at all, and a being made that way is reachable by the owner alone. A
relation that could not be made is a boot that made nobody: the being made
goes out again, and nobody saw her, since she is a moment old and named to
no one yet. What the owner has that the maker does not is every ask that
reaches into a being from outside: public, invite and knock for her, remove,
unboot. Who may ask her to boot is her gate, as who may ask her anything is.

Lend is boot's shape for what the device already has. What a device can do
is beings, in a ward its harbor booted and roots, and `lend` is how a being
of another ward comes to hold a standing at one: her ward asks the box, on
its own standing, for the name, and the box's being answers with the lent
being's own invitation, minted by that being on herself. Her ward knocks
with it and takes it under the id she gave. She is handed the id and
nothing else, exactly as her maker is handed a key. From then on it is an
ordinary standing, counted and rotated, removable by her, and told
`removed` when the far being drops her.

Boot's shape includes what boot does when it fails. A being made whose
relation could not be made is unmade, because she is her maker's ward's own
and that ward may take her out again. The being lent is not: she stands in
the box's ward, which no other ward may reach into. So the ward that was
offered says so instead. A knock refused, a take that lost the id to another
line of hers, a ward gone in between: each answers no, and her ward tells
the box, on the same standing, which offer went untaken. The lent being
removes the occupant she minted for it. Nothing half-lives on either side
of the seam, and a refused lend costs the box nothing, which is what the
table above promises.

The invitation never reaches her, and that is the difference between this
relation and every other one she holds. Her own invitations are hers to
give away, because giving one away is giving her own relation away. This
one is not hers: it is the device's, minted for her ward alone, and a value
she could copy is a capability she could hand to anyone. So she never sees
it. A being who wants to lend her device access to another lends it in the
open, by offering an ask of her own that forwards to her standing, where her
gate reads who is asking and she can stop.

Null is every kind of no, and she cannot tell them apart because there is
nothing she would do differently: this harbor lends nothing, or nothing of
that name, or nothing of that name to her ward, or her ward could not take
the box this run, or what was offered could not be taken. What a device has
is not hers to enumerate.

The ground is the harbor's, so `lend` reaches the box she is running on and
no other. A ward that could not take the box at birth, the box down or the
invitation spent, is born all the same, lends nothing this run, and takes it
again at the next. A ward that moved box is handed the new harbor's ground,
and a standing she woke up holding names a being on the box she left, which is
what a standing means and is why it is not a bug. A being who wants the box
she is on asks for it again at every birth, which she cannot tell from a
restart and does not need to.

Lend is one direction, and the other one is not a second mechanism. A being
who wants to be woken invites, hands that invitation to whoever will wake
her inside an ask, and is woken as the occupant she named. A tick, a
delivery, a push and a stranger's ask are one act at her door, told apart by
the id her ward puts on them and by nothing else. Nothing reaches her that
she did not invite, and nothing wakes her that does not hold a standing at
her.

Ask, knock, invite, take, boot and lend are awaitable. Async where the
language has it, blocking where it does not. Every ask she makes is a new
call.

The asker has three shapes and no fourth, and nothing else ever reaches her.

- `{ id }`: her own id for the occupant at the door, the one she minted when
  she invited her.
- `{}`: she is the public being of her ward, and that is how she knows.
- `{ id: 'OWNER' }`: the arrival came on the ward's ask pointer, from her
  owner.

`OWNER` and `PUBLIC` are reserved words: invite and take refuse them, so no
occupant can ever wear either name. A kit reserves more, because a relation
is written in two places, the ward's keys and her record, and a name either
of them cannot hold is a relation half made and a throw where the table above
promises a null. Which names those are is that kit's, since an id never
crosses a door and no far ward can tell. Where the refusal happens is Quo's:
at the mint and at the take, where every other refusal is, and never at the
write.

## Silence, the words, error

Three kinds of answer to "no object came back", and only three. Everything in
Quo that can go wrong ends in one of them, and a being who knows the three
never needs a fourth.

```
error       an object. hers.             { error: ... }, or any shape her output schema declares.
silence     the ward's silence.          bytes came back, or would have, and said nothing.
                                         it is what a stranger hears, and what she hears when
                                         the far being chose to say nothing.
a word      the ward's word.             one of nine, said only to someone the ward can name,
                                         and never to a stranger: why no object came.
```

- An **error** is an ordinary answer. Quo never reads it, never makes it,
  and never treats it apart from any other object. The owner's asks answer
  error objects for what they refuse, and they are hers to read like any
  object.
- **Silence** names no reason, by law. It is what the door says to bytes it
  cannot admit, so that a stranger learns nothing, and what a being says
  when she chooses to say nothing. It is not blindly retryable: the far
  being may have done the work and the answer was lost.
- **A word** names the reason. It is said to a key the door has bound, sealed
  to that key's lid, or by her own ward to her, in process. Nobody else ever
  hears one. A word is not an object: it carries nothing but its name, a
  being cannot make one, and one that comes out of a being is read as her
  having thrown.

The nine words, and who says them:

```
the door, to a key it has bound, on the wire as { quo: word }
  removed        the relation this key spoke for was removed by the being who invited it
  absent         the being who invited it did not come back this run; her cells wait
  unannounced    the knock announced no key of her own, so it bound nothing
  repeated       the number was already honoured, or is at or below the span
  threw          she threw, or answered a shape that is not hers to make

her own ward, to her, and never on the wire
  unreached      no far door was reached. nothing is known to have been delivered.
  late           the wait ran out. the far door may have heard and be working still.
  invitation     the invitation is not one. nothing was sent.
  dropped        she dropped the standing, and asked on what she held. nothing was sent.
```

- **Unreached** is safe to retry: nothing is known to have been delivered.
  In one case the far ward heard and died before it could answer, and the
  wire says nothing about it; asking again asks under the next number and
  is heard, so the retry is safe all the same. See Closed.
- **Late** is not unreached, and the difference is the whole reason there are
  two words: a bound that expired promises nothing about delivery.
- **Removed**, **absent**, **unannounced** and **repeated** are refusals: the
  ask reached no being and nothing was written. They are said only because
  the key that asked has already proven who it is, so a reason to it is an
  oracle to nobody. **Threw** is a choice: she was reached, and the number is
  spent.

Who says what. A being says objects and silence, never a word: the shape is
the ward's, and a ward that sees one come out of a being answers `threw`. A
ward says all three to its own being, and on the wire objects, silence and
the five door words, each sealed to the lid of the key that asked; the four
ward words never cross, they are her own ward's and are said in process. A
harbor says nothing at all; it returns bytes or nothing, and does not know
any of these words. What it learns from an arrival is one bit, `heard`,
beside the bytes the door hands it: whether a key the door holds spoke. The
owner hears objects: a silence a being met is `{ error: 'silence' }` and a
word is `{ error: word }`, because the owner is piloting and an object is
what a shell can print. The ask pointer answers the value silence only when
the ward itself threw.

### What her ward says to her

Before or after the wire, her own ward answers on its own in five cases,
and each says what it is.

```
S1  the invitation is not one         a shape that is not a ward pk, a heir with no secret, a secret with no heir.
                                      nothing is sent. the word is `invitation`. nothing else is read: a field
                                      beside the three is ignored, and a secret that is not the heir's is sent
                                      and meets D6 at the far door.
S2  the standing is gone              she held a standing, dropped it, and asked on what she held.
                                      nothing is sent. an ask issued while it stood is answered. the word is `dropped`.
S3  the wait ran out                  the ask's time was spent and no reply was read.
                                      what comes back late is not read. the number is spent.
                                      an ask still waiting at its lane when the wait ran out is never sent. the word is `late`.
S4  the reply is not one              bytes came back over the size, or that do not open, or are not signed by the ward they
                                      were sent to, or are none of the three reply shapes. the number is spent.
                                      not Quo's bytes: silence.
S5  the far door answered             silence, or a word, exactly as the door said it.
```

And unreached in two: `U1` the args are not one object of values, or could
not be sealed, or the method is neither a word nor absent, so nothing left.
That last is the same rule and the same reason: a payload is written as JSON,
which drops a field it cannot write, so a method that is not a word would
arrive as no method at all, and no method at all is the empty ask. She would
have asked for work, been handed a blueprint, and spent a number on it. What
a ward cannot send it does not send;
`U2` the harbor returned nothing, or threw, so no door was reached. The number is
taken all the same, and the gap it leaves in the count is harmless: the door
honours any number above its mark.

S4 is strict, and strict is a price paid on purpose. A reply carries `seen`
always, and a reply whose `seen` is neither a digest nor null is none of the
three shapes; so is a reply with any field beside its shape's, and an
`object` that is not a value, nested past sixty-four or a number the value
rule refuses, since what crosses is held to that rule in both directions.
So an answer a far being really gave is read as silence and the
number is spent with it. The alternative is to read the object and drop the
field, and then two kits disagree about whether an answer arrived: one hands
her an object, the other hands her silence, and silence is not blindly
retryable. That is the one disagreement Quo cannot afford, and it is worth
losing an answer from a kit that writes one field wrong. A kit that writes it
wrong is a kit the vectors catch before it ever speaks to anyone.

### What the door says

The door judges thirteen cases, in this order, and the first case met is
the answer. The first seven are strangers: bytes the door cannot admit, met
with one silence whatever the case, and nothing written. The next three are
refusals to a key the door has bound: still nothing written, but a word,
because the asker has proven who it is. The last three are choices: the ask
reached her, so the number is spent and the keys are rotated, and what she
wrote in her cells is hers.

```
strangers: silence, nothing written, heard false
D1   the box does not open           wrong padlock, garbage, too short, over the size. the reply is a silence
                                     sealed to the lid: the first thirty-two bytes of what arrived when there
                                     are that many, whatever they are, and a key nobody holds when there are
                                     not. a lid that will not take a seal, a small-order point among them,
                                     is answered the same way, to a key nobody holds. a key nobody holds is
                                     thirty-two bytes drawn from random and taken as a lid, and when that
                                     will not take a seal either, the public key of thirty-two more. those
                                     are drawn before the reply's own ephemeral key.
                                     too short is anything that does not open, or opens to sixty-four bytes
                                     or fewer, since those hold no payload beside a signature. a payload
                                     that opens and is not JSON text by the value rule, not UTF-8, a
                                     duplicate key, nested past sixty-four, is a box that does not open.
D2   the payload is malformed        to, by or next not 64 lowercase hex where a hex is owed, method not a
                                     string, args present and not one object of values, seq not a whole
                                     number from one, time not a whole number above zero, hops not a whole
                                     number or at zero. to and next may be null; absent is not null, and a
                                     payload missing a field it owes is malformed like any other. method and
                                     args may be absent and never null. a field the payload does not name
                                     is not read, and absent args are handed to her as the empty object.
D3   for nobody, and nobody is home  no public being on this ward, or one that did not come back this run.
D4   for nobody, signature fails     the payload names a key it was not signed with.
D5   the heir is not held            never minted here, and not one she removed either.
D6   the key is not admitted         not the key held for the heir, and not the key it announced. a
                                     forged key, an unannounced key, a heir already spent. a heir she
                                     removed, under a key that was not the one she removed.
D7   signature fails                 under an admitted key, or under the key held for a heir she removed.
refusals to a bound key: a word, nothing written, heard true
D8   she is not there                `removed`: the id was removed and this is a key it held when it went,
                                     kept under `gone`, which names no being, so nothing more is asked.
                                     for a heir still held: `absent`, the being did not come back this run,
                                     and then `removed`, her occupant record is gone. absent is met first
                                     there, since the record is in her cells and they are not read while
                                     she is away.
D9   a knock announces nothing       `unannounced`: the heir is fresh and next is null, or is the heir
                                     itself, which is no key of her own. it binds nothing.
D10  the number is refused           `repeated`: already honoured, or at or below the span.
choices: the number spent, the keys rotated, heard true
D11  she threw                       `threw`
D12  she answered silence            on a named ask, or on the empty ask. nothing at all is silence too.
D13  she answered a non-value        `threw`: a word, or anything her language holds that is not a value. none is hers to make.
```

The signature is verified before anything is written and before any word is
said, so a stranger cannot burn a number she could not sign for and cannot
hear a word she could not sign for. The public being is asked by strangers
only, and a stranger hears silence for whatever she then does: her choices
are hers, and her insides are not a stranger's to read.

A removed relation leaves the door one thing: the keys it held for that
heir when the id went, kept apart from the heirs under `gone` in the
partition, bounded, oldest out. That is what lets the door say `removed` to
the one party who can sign as those keys, and silence to everyone else.
Nothing else survives a removal.

### The law of one silence

1. Every stranger's case is one reply: `{ silence: true }`, sealed to the
   lid the ask came with, signed by the ward key. Same bytes, same length.
   A stranger cannot tell one refusal from another, nor any of them from a
   being who chose to say nothing.
   The door equalizes the bytes and not the time it took to write them, and
   the seven cases are not alike in time: two of them verify a signature and
   five refuse before they would. A heir pk rides in the clear, so whoever
   holds a copy of an invitation can time a knock signed with nothing and
   learn whether that invitation is still unspent. What that buys them is
   what knocking with the invitation would have told them anyway, and
   knocking spends it, which is why the door does not pay for a signature it
   has no reason to check. What is equal is what the door says and what it
   writes, and those are the two a stranger could otherwise use. A word, to a
   key the door has bound, is another length, and may be: whoever hears it
   has already proven who they are.
2. A refusal writes nothing. No number, no key, no heir, no cell, no bind.
   The same bytes presented again meet the same refusal, and a stranger who
   knocks a thousand times leaves no mark. This holds for the three
   refusals a bound key hears just the same: a word costs nothing.
3. A choice writes what a heard ask writes. The number is spent and the keys
   rotate, so the relation goes on: the next ask on it is answered, and a
   silence or a `threw` never kills a standing.
4. Silence and a word leave the caller's record as it was. A silent named
   answer leaves `seen` untouched; a silent empty ask leaves `blueprint` and
   `digest` untouched; a word moves neither, and her keys do not rotate on
   one.
5. Her ward never confuses her. Silence, a word and unreached are told apart
   always, and by nothing else: silence is bytes the far ward wrote and
   chose to say nothing with; a word is a reason, from the far door or her
   own ward; unreached is the wire's nothing. A ward never answers nothing,
   so that nothing always means unreached.
6. Nobody enforces what a being does with silence or a word. Each is one
   value she compares against, and a ward hands them to her unchanged.

## Words and values

### Values

Everything that crosses an edge is I-JSON (RFC 7493): args, answer,
blueprint, invitation, and whatever she caches from them. Strings are valid
Unicode, which is text and not code units: a surrogate stands in a pair or it
is no string, since a lone one is a character nobody has and no encoding on a
wire can carry. Numbers must be representable as IEEE doubles, so integers
are exact up to 2^53, and minus zero is not one of them. Larger integers and
exact decimals travel as strings, with a schema format saying so. Bytes are
base64 strings, and which base64 is nobody's business here: no ward decodes
one, a string crosses as the string it is, and the two beings at the ends of
a relation agree on the spelling the way they agree on everything else in
their args. Nothing else is a value: no dates, no references, no
functions, no native types. An id or a standing is never a value.

Every one of those is a rule about the JSON text, not about what a language
happens to parse it into, because a language is where two kits stop agreeing.
A number is whole when the text names an integer, so `1` and `1.0` and `1e0`
are one whole number and a kit that reads the first as an integer and the
second as a fraction has invented a distinction no wire carries. A number is
minus zero when the text is a negative zero, `-0` or `-0.0` alike, and both
are refused, since JSON writes minus zero as zero and reads it back as zero,
so a harbor keeping objects would hand her a sign a harbor writing bytes
would not. A number is outside the doubles in three ways, and each is
refused. Text that names a whole number is refused unless that number is
exactly a double, or the text is how ECMAScript writes a double:
`9007199254740993` and `9007199254740993.0` are refused, since one kit
keeps them exactly and another rounds, while `1e21`, `2^60` written out and
`1e+23` stand, since the last is the spelling every writer gives the double
nearest it and a kit must read back what it writes. Text that names a
fraction is the double nearest it, as every reader of JSON takes `0.1`.
Text past the largest double, or naming a value other than zero that rounds
to zero, `1e-400` among them, is refused. A boolean is never a number,
however a language files it. And an object has no duplicate keys: two of
one name is not one object, it is text two kits read differently, so it is
refused where it is read and never quietly resolved to the last. Bytes that
are not UTF-8 are no JSON text at all, and are refused rather than mended.
Noncharacters are text, and stand, where I-JSON would refuse them: they
cross any encoding unchanged, so no kit gives back other than it was given.

The two above are the shape of every rule here: a value is a value when every
harbor and every kit gives back what was put in. Anything a harbor keeping
objects would preserve and a harbor writing JSON would lose is refused where
it is written, because the alternative is a harbor that lies to her about
which harbor she is standing in.

Args are held to the same rule before they are sealed: an ask whose args
are not one object of values is unreached, because nothing left. Her answer
is held to it at the door: a shape that is not a value is `threw` to a bound
key and silence to a stranger, so nothing crosses altered. Cells hold values and
refuse anything else at the moment of writing, in her own frame. Anything
else is whatever her language holds that this chapter does not name: a thing
with behaviour rather than shape, a thing that points back at itself, a
number that is not one, a time, a set, a table that is not a plain object.
Which things those are is her language's and never Quo's, and one line
decides every one of them: if a harbor writing this ward to JSON and reading
it back would not hand her the same thing, it is not a value.
The refusal is a throw where she wrote it, which her ward turns into the
silence it turns every throw into. She has not answered, and
nothing was written down that a harbor would later have to lie about. This
holds all the way down: a container read through her cells is part of her
cells.

### Silence and the words

Two of the three kinds of "no object came back". The chapter "Silence, the
words, error" is the whole of them; here only the values. Silence is one
distinguished value. Null is an answer. A word is a second kind of
distinguished value, her ward's own, nine of them, `unreached` among them.
None is an object, and none carries anything but its name. A kit spells each
however its language spells one value standing for neither an object nor an
absence, and the spelling is owed to nobody outside that kit.

### Blueprint, schema, digest

Nothing here is Quo's invention. Four standards, adopted whole, so that two
wards in two languages always read one blueprint the same way.

```
blueprint
  asks   list of { name, description?, input: schema, output?: schema }
  notes  any JSON value
```

The blueprint is the shape of an MCP tool list, plus notes. The schema is
JSON Schema draft 2020-12, the one MCP uses; typed languages generate from
it, untyped languages ignore it, and Quo writes none of it. Args are one JSON
object with named fields, as MCP passes arguments.

The digest is SHA-256, as hex, over the JCS (RFC 8785) canonical
serialization of the blueprint. Same bytes from every language. This is law:
two wards in two languages always hash one blueprint to one digest. A ward
that cannot do this is not a ward. Because only values reach a digest, a key
holding what her language holds and JSON does not is dropped before hashing
and an array slot holding one is null, which is what crossing an edge does
to them anyway. A describe that JSON can write but the value rule refuses,
nested past sixty-four or holding a number outside the doubles, is not
mended into one: it costs the digest, as a describe that throws does. The
digest is written in lowercase hex.

Two places in RFC 8785 are where languages part, and a kit is held to both by
`vectors/framing.json`. Keys sort by **UTF-16 code unit**, not by code point
and not by byte, so an astral character sorts before one in the surrogate
range: `U+1F600` comes before `U+FB33`, which is the reverse of what a
language sorting code points gives. Numbers are written as ECMAScript writes
them, `1e+21` and `1e-7` and `0.3333333333333333`, with a negative zero
written `0`. A kit that reproduces every ASCII vector and neither of these
hashes one blueprint to two digests, and every standing between the two wards
refreshes on every ask.

Capability and state are two axes, never mixed.

```
capability   what she can be asked.   blueprint.  changes rarely.
             hashed into the digest.  learned by the empty ask.
state        what she answers.        answers only. may change every ask.
             never hashed.            never in the blueprint.
```

A digest change means one thing: her interface changed and the cached
blueprint is wrong. Notes in the blueprint are about the interface. A being
that puts state there makes every standing refresh for nothing, and that cost
is hers.

What follows: a being's describe is an MCP tool list with no translation.
Whoever holds a ward's ask can put an MCP server in front of any being of
it, and a being's class may wrap an MCP server; neither is a ward function.
Models are occupants like anyone else. What stays Quo's: silence, unreached,
ids, invitations, knock and take, the digest rule. MCP is the description
and value layer. Quo is the relation layer.

### Ids

An id is minted by the being, bound by the ward, permanent, and never crosses
the door. It is any string, the empty one included. Her id for you and your
id for her are unrelated. One id names one record, and standings and
occupants are one namespace: invite refuses an id a standing holds, take
refuses an id an occupant holds.

Two words are the ward's and no being may mint them: `OWNER` and `PUBLIC`,
the reserved askers of the ward-to-being edge. The ward speaks at every
being's door as `{ id: 'OWNER' }` when it runs her describe for its owner,
and an occupant wearing that name would be two parties with one face.
`PUBLIC` guards nothing today, because a public asker is `{}` and carries no
id, and it is claimed now while claiming it is free.

A kit refuses more names than those two, wherever its own spelling of the
stance would collide with an id: a standing under a name that spelling has
already taken would be unreachable, and invite and take refuse it like the
ward's words. Which names collide is that kit's, because an id never crosses
a door and a kit that spells the stance another way has no collision to
refuse.

### Cells

Cells are I-JSON values. The ward may persist them. A restart is silent: she
is constructed again with the same cells. Three keys at their root are the
ward's, `standings`, `occupants` and `class`, and a write of hers to them is
refused where she wrote it, like a non-value, and removing one is a write to
it. A value nested past sixty-four levels is refused the same way, wherever
it crosses and not in cells alone: a level is a container, a scalar is none,
so sixty-four nested arrays are a value and sixty-five are not, counted from
the value written and never from the root it is written under. That bound
is Quo's because a far ward
reads what a near one wrote: a kit with a deeper stack still refuses at
sixty-four, or two kits disagree about which blueprint is a value. A kit
refuses beside it whatever its own runtime writes one way and reads another,
and those are its own.

```
cells
  standings: { id: { id, digest, blueprint, seen } }   ward writes all four
  occupants: { id: { id, notes } }                     ward writes id, she writes notes
  class                                                ward writes it at boot, so a restart finds her
  anything else                                        hers
```

`standings` and `occupants` stand as empty objects from her birth. A standing
is born at take with `digest`, `blueprint` and `seen` all null, and an
occupant invited with no notes has the empty object for them.

- `digest` is the hash of the blueprint she last fetched by the empty ask.
  It is over what came back, whatever that was.
- `blueprint` is that blueprint, and only if it is one. A far describe is
  somebody else's code and may answer any value at all; the ward reads it as
  a blueprint before writing it as one, and writes `null` when it is not. A
  blueprint is an object with `notes` present, whatever they hold, and
  `asks` an array, each entry an object with a string `name` and an `input`
  that is an object; nothing else is required of it, and when it is one the
  whole value is written, fields this document does not name included. A
  side walks `asks` by name, and a side that broke on a far ward's answer
  would be one kit made wrong by another. The answer itself still goes to
  whoever asked, unread.
- `seen` is the digest her ward last saw arrive with an answer. A silent
  refresh leaves it untouched, and so does an answered empty ask, whose
  reply carries no digest.
- `notes` is hers. Quo never reads it. Tier, expiry, kinship between an
  occupant and a standing that are the same far being: all hers. `invite`
  may seed it, which is how an inviter says the terms it mints under, and
  after that it is written by nobody but her. The owner's `invite` passes
  what it was given straight through; the ward reads none of it. What is
  seeded is values and is kept as a copy, all the way down: notes that were
  not values would be a record no harbor could write back, and notes shared
  with whoever seeded them would be a hand inside her cells that writes
  without the ward being told, so a restart would bring back something she
  never read. Notes that are not values are no invitation.

## Relations

### How a relation is born

There is one way in and one way back.

1. She wants B as an occupant. She mints an id, in her own time, and asks
   her ward for an invitation for it. The occupant record exists from that
   moment. The invitation is a value: it goes by mail, paper, or inside the
   args of some other ask. Quo does not care how.
2. B consumes it by knocking: an ask carrying the invitation. B's ward
   seals it and hands it to its harbor's carry, and her ward, which
   recognises its own seal, and binds the
   arrival to the id she minted. From now on every ask from B arrives as
   that id. The first such ask is how she learns the invitation was
   consumed. Whether it is still welcome is hers: expiry, one use, anything,
   lives in her notes.
3. If she answered, B may take her as a standing, minting B's own id for
   her. That is the only moment a standing is born. Take binds B's side
   only; the knock bound hers. Take before a knock, or after a silent one,
   births nothing. B may also knock, say hello, and never call again. She
   keeps B as an occupant until she decides otherwise. She never learns that
   B walked away.
4. B wants her to reach back? B mints an id, makes an invitation, and puts
   it in the args. She knocks it and takes B if she wants. Two invitations,
   two relations, each chosen by its owner.

She is always the initiator. Nobody becomes her occupant unless she invited
them. Nobody becomes her standing unless she knocked and chose to take, or
her owner knocked for her.

### What take does

Take consumes. Until take the relation lives in a knock record, under the far
ward and the heir; from take it lives in the standing, under her id, and
never in both. Take copies the keys and the count the knock left, deletes the
knock record, and the invitation is spent for her: knocking it again is an
ask on the standing, and taking it again births nothing.

Take waits, because a relation has one line of keys and one count, and every
word spoken for it goes in order. Taken out of that order it would read
between a knock's send and its answer, and the standing would be born holding
a number the far door has already honoured and a key it has already rotated
past. So take goes in the line with the rest.

### One relation, one lane

Every send on one relation waits for the one before it. The rotation is a
conversation: a send reads the key that speaks now, announces the next, and
moves once the far door has answered, and two sends interleaving on one
relation would read each other's half-written keys. Lanes are per relation:
beings still ask concurrently, and a slow relation never holds up another.
Before take the lane is the invitation's; after take it is the standing's,
and a knock on a taken invitation joins the standing's lane.

The standing an ask sends on is taken when she calls, not when the lane
reaches her: an ask issued while the standing stood is answered even if she
drops it in the next line. The keys inside it are read when the lane reaches
her, so an ask queued behind another signs with the key the one before it
moved to. An ask on a standing she has already dropped is
the word `dropped`, and nothing is sent. A knock on the invitation it was
born on, after take and a drop, is a knock as a heir the far door has already
spent, so bytes leave and the door's silence comes back: after take the
invitation names the standing and nothing else, so it is exactly as alive as
the standing is.

A lane is released by the bound and by nothing else. An ask that never comes
back holds its relation's lane, and every later ask on that relation waits
behind it, so the bound ends an occupancy and not only a wait. A kit that
bounds where a being is waiting, and not where the lane is held, has a
relation that one quiet far side closes for good.

### The public being

A ward may have one public being, and no more. She is an ordinary being,
booted by the owner and then marked public by the owner's `public` ask.
Arrivals for no heir reach her. Her
asker is `{}`: she is asked by anyone, and she can tell. She may hold
standings. She may invite, and an occupant of hers arrives named while
strangers still arrive as `{}`. A ward without a public being answers
arrivals for no heir with silence.

An invitation to her is `{ ward }` alone. One with a secret and no heir is
not an invitation. She may be taken as a standing on that invitation, and
such a standing has no heir and never rotates.

The signature is checked here for no property, and the check is kept anyway.
Whoever asks chose that key a moment ago, the box is already authenticated to
the ward's padlock, and the door binds nothing, so nothing is proven by it and
nothing would be lost by dropping it. It stays because the payload has one
shape and the door has one path: `by`, `next` and `seq` are required of her
ask as of every other, and honoured by nobody. A kit author who goes looking
for the property behind this signature will not find one, and is not missing
anything.

She is reached without a heir, so the door keeps nothing for whoever asked:
no key it vouched for, and no count. The bit beside her reply is `heard`
false, as it is for every stranger: no key this door holds spoke. She is the
one place a stranger is answered by design, so she is the one place the
harbor's rating must still see a stranger arrive. A harbor that saves before
its reply goes out follows the ward writing, never the bit, since a public
being writes in her cells like anyone. The signature is still checked, under
whatever key signed. Once-only delivery does not reach her: the same sealed
bytes presented twice are delivered twice, and the number the payload carries
is required and honoured by nobody. A count per voice would be memory a
stranger chooses the size of, which is the thing the span exists to refuse.

So her answer must be safe to repeat. This is her obligation, not a gap at
the door. Anything that must happen once lives behind an invitation, where
there is a heir and a count.

Nothing else about her is different. Her cells, her standings and what she
keeps are hers, exactly as they are for every being, and Quo has no say in
them: she may hold a board every stranger plays on, a catalogue, a queue, or
nothing at all. She is an ordinary being who chose to describe herself to
strangers and to answer them, and that choice is the whole of what makes her
public. A stranger who keeps knocking is the harbor's, never hers and never
the door's.

### How a relation crosses wards

1. She mints an id. Her ward mints a heir for it, keeps the pk, and hands
   her an invitation: her ward's pk, the heir pk, the heir secret. A value.
   It goes anywhere. Rotation one.
2. The invitation is consumed by an ask at some ward, and that ask names a
   being there. Either B holds it, because a standing put it in her args,
   and B knocks. Or an owner holds it, because it came by mail, and the
   owner's ask knocks for a being of theirs, new or existing. There is no
   third way, because a relation cannot end in thin air.
3. B's ward mints her own key, signs the knock with the heir secret,
   announces her key inside, seals the box to her ward's padlock, and
   hands it to carry for the ward pk. No relation between the two wards is needed,
   ever. Her ward opens its own box, admits the heir, verifies, binds the
   id to B's key, and hands her the arrival as the id she minted. The heir
   is spent. Rotation two.
4. B's ward remembers the knock was answered, and lets B take. From then on
   every ask from B on that standing is signed by her current key, announces
   her next, and is sealed to the same padlock. Every answer rotates her.
5. Same ward: her ward recognises its own pk and delivers without the
   harbor. Same harbor: the harbor finds the pk in its own map and calls the
   other door. Two harbors: the wire. The ward's code has one branch between
   these, and the being has none. A same-ward knock is sealed, signed, and
   judged exactly like a far one.

## The door

### Keys

One 32-byte seed is one key. A being's key signs and never seals. The ward's
key does both: an Ed25519 pair to sign replies, an X25519 padlock every ask
is sealed to. Beings never own a padlock.

- **The ward key** comes from the seed. Its pk on the wire is the signing pk
  then the padlock, 128 hex, and it routes. Two curves, and each secret is
  HKDF-SHA-256 of the seed under its own label, `quo-ward-sign` and
  `quo-ward-seal`, empty salt, the seed as the input keying material, 32
  bytes out. The first thirty-two bytes are the Ed25519 private key as
  RFC 8032 names it, the seed that key is expanded from; the second are the
  X25519 scalar as RFC 7748 takes it, clamped by the function and not
  before. Fed the seed straight the two
  scalars would still differ, because Ed25519 hashes what it is given and
  X25519 clamps it raw, but that is an accident of the two designs and no
  separation: one secret would be doing two jobs with nothing said about it,
  and a second kit would have to reproduce a construction nobody named. A
  seed handed in as bytes of the key length is the seed; anything else, text
  or bytes of another length, is SHA-256 first, so a thirty-two character
  name is a name and not a key for being the right size.
  `vectors/framing.json` pins it.
- **The heir** is the key the inviting ward mints at invite, for one id. It
  keeps the heir's pk beside the id and gives the secret away. The
  invitation IS the heir: ward pk, heir pk, heir secret. Rotation one: the
  occupant already has a key, and the inviter chose it.
- **Her own key** is what the knocker mints at knock. She signs the knock
  with the heir and announces her own key in it. The door binds the id to
  her key and the heir dies as it speaks. Rotation two: from now on she
  signs with a key the inviter never held. A knock that announces nothing,
  or announces the heir itself, binds nothing.
- **Next.** Every ask she sends announces the key she will sign with next.
  The door holds two pks for her: the one that may speak now, and the one
  it vouched for. Whichever speaks first wins, and the other dies. There is
  no rotate call: every honoured ask rotates, and a lost reply strands
  nobody. Her side moves to the announced key only when an object came
  back: not on silence, not on `threw`, and not on any other word. The door
  has moved on every choice and on none of its refusals, and it admits both
  keys, so a side that stays behind is always heard and a side that moved
  on a refusal would be refused for good.

The knock is the one place where both sides cannot be brought back into
agreement by that rule alone. If the reply to the first knock is lost, the
door has spent the heir and rotated to the key she announced, and she does
not know it: knocking as the heir again would be refused for good. She cannot
learn which case she is in, so she asks, and the asking tells her. She sends
under her own key first. If the door heard, that is the key it admits and she
is answered. If it did not, the key means nothing there and the ask is
refused; a refusal at a door writes nothing, so the heir is untouched and she
knocks as the heir, as she would have. One extra round trip, in the one case
where a reply was lost. It gives a stranger nothing: whoever holds the
invitation could always knock as the heir, and her own key is admitted only
where the door already bound it to her.

Three keys per relation over its life, one rule at the door: the key I hold
for you may speak, and so may the key it announced last time, and each
number once.

A send that announces nothing leaves the spare standing. Every ask announces
its next but a public one, which holds no heir and is one key for life, so
this is a foreign kit's send and not this one's; and a caller who skipped an
announcement still holds the key she announced before it. The door forgets no
key it vouched for until another replaces it, and forgetting one here would
meet that key with silence at the next ask and kill a healthy relation over a
field. On a fresh heir the rule is the other one: nothing announced is
`unannounced`, because there the announcement is what binds.

Every key in a relation was minted by one side and its secret never left
that side, except the heir, which the inviter gives away and which dies the
first time it speaks. No key serves two relations. No key outlives its
relation. A ward keeps a bounded list of the pks a being's side minted, and
how long it is, is that ward's own: nothing in Quo reads the list, so a
shorter one costs a shorter trail for whoever is looking at the ward, and a
kit that keeps none holds the same ward.

### The count

Every ask she sends carries the next number in one unbroken count for that
relation, starting at one, and the door honours each number once. The number
rides inside the signed payload, so bytes caught on the road carry the number
they were sent under: they cannot be renumbered without breaking her
signature, and they are refused as themselves. A caller who means to ask
again asks again, under the next number, and is heard. Retry and
fire-and-forget stay hers to build; only the accident and the interception
are refused.

The door keeps the highest number honoured, the **mark**, and which numbers
below it are spent, out to a span of sixty-four, because a door that
remembered every number ever seen would be a door with unbounded memory.

The span is arithmetic and is written as arithmetic, since a sentence about
a boundary is a sentence two kits read two ways and a relation that then
dies over one number. A number above the mark is honoured and becomes the
mark. A number equal to the mark is refused. A number below it is honoured
once when it is greater than the mark less sixty-four and has not been spent,
and is refused when it is less than or equal to the mark less sixty-four.
So with a mark of one hundred, thirty-seven is honourable and thirty-six is
refused, and the door holds sixty-four numbers: the mark and the sixty-three
under it. The width is this document's and not a ward's: a ward that
honoured further back would answer where another refuses, and a caller
cannot tell two doors apart by anything but their answers.

The mark and the spent list are in
the partition, because a door that forgets what it honoured honours it again
after a restart.

Her side keeps the number it spoke under whether or not a reply came back. A
reply lost on the way back is a door that has already honoured the number,
and offering it twice would silence the relation for good. The count carries
over from the knock into the standing at take.

### The allowance

Every ask carries what it may still spend: **time**, in milliseconds. It
rides inside the signed payload, so a budget caught on the road cannot be
widened by whoever caught it.

A being who says nothing gets her ward's default and never thinks about it.
A being who wants to say so passes a third argument. What she is given is
what she asked for held to what her ward allows: a number that is not a
positive whole number falls to the default rather than refusing her, and one
above the ceiling is the ceiling, silently, because the ceiling is not hers
to know. Budget is granted by a ward, never minted by a being. How wide the
default and the ceiling are is the ward's own, and no far door can tell one
ward's from another's.

They are two numbers and not one, because the third argument is for both
directions. A being who knows her own work asks for less on the ask she wants
back quickly, and for more on the one she knows is slow. A ceiling equal to
the default would leave her only the narrowing half, and would give the ward
no way to allow one long piece of work without making every ask that
patient.

The sender's wait has an end, and time is the only thing the ward measures:
no count of doors, no count of bytes, no count of tries. The
bound covers the whole of an ask, from the moment she calls: a relation that
comes back round on itself is stopped at its own lane, before a byte is
sealed, and a bound that watched only the wire would never see it. This is
what makes three answers three. A wait that does not end is not an object,
not silence and not unreached, and before the allowance a cycle of legal asks
could produce one: A asks B, B answering asks A back, A answering asks B on
the relation the first ask still holds. Now the innermost wait gives up, the
word `late` unwinds outward, and the ask ends.

**A wait that ran out is the word `late`, never silence and never
unreached.** Unreached promises nothing was delivered and is safe to ask
again. A bound that expired knows no such thing: the far door may have heard
and be working still. What comes back late is not read.

The harbor keeps a patience of its own, and the two never read each other.
What a harbor hands back as nothing came back is unreached, and unreached
says nothing was delivered: a harbor may answer it only where it knows the
bytes never arrived, no reach for that pk, a socket that would not open, a
link that is down. A harbor that sent them and then gave up knows no such
thing, and must not answer at all; the ward's bound will ring, and that is
`late`, which promises nothing. A harbor that throws has answered nothing
in a louder voice, and the ward reads it as nothing: unreached. So a harbor
may hold a shorter patience than the ward for its own reasons, a socket it
wants back or a queue it will not grow, and whichever ends first ends the
ask.

The receiving door reads the allowance before anything is done under it. A
payload whose time is not a whole number above zero is malformed, D2, and
is refused as one. Nothing is spent and nothing rotates, because nothing
was heard.

Each ask is bounded on its own. The time an arriving call has left does not
bound the asks a being makes while answering it, and an ask carries no count
of doors; see Closed. Every wait still ends. How a kit bounds a wait, a
timer, a thread or a deadline read between steps, is its own; that the wait
ends at the bound with `late` is Quo's, in every language, a blocking one
included.

### Judgment

Every arrival is judged by the door, and named by it or falls silent.

1. Open the box with the ward's padlock. Read whether it is for a heir or
   for nobody. Parse the payload and refuse any field of the wrong shape.
2. For nobody: find the public being, verify the signature under the key the
   payload names, and dispatch as `{}`. Nothing is written.
3. For a heir: admit the signer if it is the key held for that heir or the
   key that key announced, or the key held when she removed the id. Verify
   the signature. Read admission again, since the door judges arrivals
   concurrently and a knock that raced this one may have spent the heir
   while the signature was checked. Only then say anything or write
   anything: a removed
   relation is `removed`, a being not back this run is `absent`, a knock
   with no key is `unannounced`, a number already honoured is `repeated`,
   and none of those writes. Else spend the number and settle the keys, so
   a stranger cannot burn a number she could not sign for, and the same
   bytes twice rotate nothing. Dispatch as `{ id }`.
4. Catch every throw and answer `threw` to a bound key, silence at the
   public being. Treat a word coming out of a being as a throw. A **throw**
   is an answer that ended without one: whatever a language calls the way a
   call fails instead of returning, an exception raised, an error returned
   where a value was owed, a task that ended abandoned. The name is the
   language's; the rule is that a being who did not answer has not answered,
   and her ward says so in one word. An error object she deliberately
   returns is not one: it is an ordinary answer, held to the value rule like
   any other, and Quo never reads it. A language where failure is an
   ordinary return value says which of the two a being meant the way it says
   everything else about her shape, in her output schema; what she declared
   as an answer is an answer, and what she did not is a throw.
5. On every answered named ask, run her describe for that asker in process,
   hash it, and put the digest next to the object in the reply. One trip. A
   describe that throws or falls silent costs the digest and nothing else.
   On the empty ask the reply carries no digest; her side hashes what came.
6. Answer by the same call the ask came in on.

A stranger is bytes the ward cannot admit, and every way of being one is
listed, with a number, under "Silence, the words, error". The public being
is the one door a stranger may walk through, and only because she chose it.

### Inner and outer

Inner: being keys, ids, cells, stances, doors, the bind table, every secret,
every method, every arg, every answer. Nothing inner is ever readable in the
bytes, and a kit proves it by reading every byte string that crossed.

Outer: ward pks, heir pks, ephemeral pks, ciphertext. That is the whole of
what the wire sees. The one value a being holds that is outer is the
invitation, which she carries opaque and never opens.

A far ward binds a heir to a pk, never to a being. Two far beings that talk
to two beings of mine see two heirs and one ward pk, and two relations that
share no key learn nothing from each other.

### The wire

Five algorithms, named once and never negotiated: Ed25519 signs, X25519
agrees, SHA-256 hashes, AES-256-GCM encrypts, and the key and nonce it
encrypts under are derived together by HKDF-SHA-256 under an empty salt and
the label `quo-seal`. That
label is the message cipher's and no other: HKDF appears twice in Quo,
here from an agreement and again at the ward key from a seed, and the three
labels, `quo-seal`, `quo-ward-sign`, `quo-ward-seal`, are three so that two
derivations never answer to one name.

The derivation, in full, because a kit that reproduces it by guess is a kit
that does not. A label is HKDF's `info`, and it is the ASCII bytes of the
name written here, with no length in front of it and no prefix: `quo-seal`
is eight bytes. The salt is empty, which is the zero-length salt of RFC 5869
and not a string. The input keying material at the message cipher is the
thirty-two byte X25519 agreement as it stands, and nothing is concatenated
to it. Forty-four bytes come out in one call: the first thirty-two are the
AES-256 key and the last twelve are the nonce, in that order. The nonce
needs no randomness of its own, since the key beside it is fresh on every
message. The tag is sixteen bytes and rides where AES-GCM puts it, at the
end of the ciphertext.

The additional authenticated data of every box is the ephemeral pk that box
carries, the thirty-two bytes in front of its own ciphertext. A reply's is
its own and never the lid it is sealed to: the reader of any box takes the
bytes it opens and the bytes it authenticates from the same box, so a box is
opened without knowing what answered what.

A key is a seed and nothing is derived from it twice. The thirty-two bytes
drawn for an ephemeral, and the thirty-two bytes of a heir secret, are the
secret as they stand: no hash, no label, no second derivation. Only the
ward's key is derived, because only the ward's one seed has two curves to
serve.

Verification is one rule, because two kits that verify differently answer
one ask two ways. A signature is checked against the bytes exactly as they
were received, never against a re-serialisation of what they parsed to, and
a kit that canonicalises before verifying will refuse its own peers. It is
RFC 8032's cofactorless check, `[s]B = R + [k]A`, and it refuses in four
places and no others: a signature of any length but sixty-four; an `s` at or
above the group order; an `R` whose bytes are not the bytes the point it
names encodes to, so `R` is compared as encoded; and a public key that is
small-order in any spelling, the sign bit set on `x = 0` included, or whose
y coordinate is not reduced, at or above the field's prime, since the field
has room for that spelling and it names one of the same points. A public key
with a torsion component that is not small-order verifies like any other,
and so does a small-order `R`: only the key's holder can write either, and
refusing them buys nothing a stranger can use. An all-zero agreement is
refused: at a door it is a box that does not open, D1, and on a reply it is
S4. SHA-256,
AES-GCM and HKDF are everywhere; the two curves are recent, and a terrain
without them is a terrain no ward runs on. `vectors/arithmetic.json` and
`vectors/framing.json` hold fixed inputs and outputs so a kit in another
language proves it agrees on the bytes.

```
ask on the wire     box     = ephemeral X25519 pk (32) || AES-GCM( payload || signature (64) )
                              sealed to the ward padlock. nothing rides outside it.
                    payload = JSON { to, by, next, seq, time, hops?, method?, args? }
                              signed by `by`. to, by, next: 64 lowercase hex. to, next may be null.
                              to names the heir, or null for the public being. seq is a whole
                              number from one. args, when present, is one object of values.
                              hops is reserved: a whole number, never below zero,
                              refused at zero, and nothing sets it.
reply on the wire   box     = ephemeral X25519 pk (32) || AES-GCM( reply || signature (64) )
                              sealed to the ask's ephemeral pk, signed by the ward key
                    reply   = JSON { object, seen } | { silence: true } | { quo: word }
                              seen is always present: the digest, 64 hex, on a named ask that
                              had one, and null otherwise, the empty ask included.
                              word: removed | absent | unannounced | repeated | threw. only to a key the door bound.
```

Nothing rides outside the box, and `to` is the reason to say so. A heir is
the one name in a relation that never rotates, while the keys under it
rotate on every ask. Outside the box it would be a handle on that relation
that never changes: an intermediary carrying the bytes could tell one
relation from another and follow it for as long as it lasts, and so could
anyone who ever saw the invitation, which carries that same heir. What
carries an ask to a ward is the ward pk, which a harbor holds itself and
never reads from these bytes, so the door loses nothing by opening every ask
with its own padlock and reading `to` after. What an intermediary still
learns is the ward it is carrying to, and that is the price of being
reachable.

The sender keeps the ephemeral secret of the box until the reply comes and
opens the reply with it. A reply that does not open, or is not signed by the
ward it was sent to, is silence. Unreached never crosses: the wire's nothing
is it.

There is one size, and it is on the bytes: a door refuses the bytes of an ask
above **one mebibyte**, and a sender refuses the bytes of a reply above the
same, each before anything is opened. Refusing them is bytes that said
nothing, which is already silence, so it is D1 at the door and S4 at the
sender, and there is no tenth word and no case of its own. The number is one
because breadth costs bytes: an ask with a thousand args, a blueprint with a
thousand asks and a reply with a million-element list are all one box that is
too big, and a second number for any of them would be a second thing two kits
must agree on for nothing. What a being holds in her cells is not this
number's business and not Quo's: only what crosses is bounded. One mebibyte
because an ask is a message and not a file, and what is larger is asked for
in pieces, by a being who knows how her own work divides.

The hand to a kit in another language is two things, and they are of two
kinds. `vectors/` is the byte-level hand: fixed inputs and outputs for
everything a stranger can observe, in four areas. `arithmetic.json` is the
primitives the seal rests on. `framing.json` is the ward pk, the digest, the
signed body, the sealed shapes, the invitation and the knock.
`wire.json` is the frames on a socket and the one request a door takes.
`door.json` is the door's thirteen cases, each one an arrival: the bytes that
come in, the bytes that go out, what those bytes open to where a hand holds
the lid, and whether the ward wrote while judging, so `nothing written`
is a value a kit checks and never a sentence it reads. A kit reproduces them
or it is not this protocol. The conformance suite is the behavioural hand,
and it is a checklist and not a harness: one ward is one runtime and one
language, so the beings a suite is shown with run only in the ward its kit
wrote, and a kit ports the suite and its beings and reads them beside its
own. No kit
drives a foreign ward through its door, and nothing is owed
here before 1.0.0 that does: the door's thirteen cases and the vectors are
what two kits meet on, and the suite is what each proves alone.

### Vector mode

`door.json` is replayed against a running kit by a program that holds no
key and seals nothing: the verifier. It can, because every byte in those
records that a stranger cannot compute is a byte of entropy, and the
entropy is fixed. A kit **stands in vector mode** so that the verifier can
put it in the state of one record, send that record's ask, and read the
bytes and the digests that come back. The mode is a harness beside the
door and never a change to the door: what the door does to an ask in
vector mode is what it does to every ask.

A kit in vector mode stands at one URL and answers the request reach
there, `POST <url>/<pk>` with the sealed bytes as the body, exactly as any
listener does. Beside it, and only in this mode, it answers two more:

```
POST <url>/stand      body  { case, name }          one record of door.json, by its two names
                      200   { ward, before, ask }   the pk of the ward whose door judges,
                                                    a digest of that ward's partition at the
                                                    arrival, and the ask the kit's own hand
                                                    seals for it
GET  <url>/digest     200   { after }               a digest of the same ward's partition now
```

The digest is the kit's own. What it is taken over and how it is written is
never read by anyone but the kit that made it, so a corpus carries no value
for it and no kit reproduces another's. Only one thing about it is Quo's:
two digests of the same ward differ when something was written between them
and are equal when nothing was. That is the whole contract, and it is what
lets the partition keep the freedoms it is given, the two bounded lists'
lengths and a `minted` list a kit may keep empty, without a stranger's
replay turning them into a shape everyone must copy.

`ward` is 128 lowercase hex, `before` and `after` are strings, and `ask` is
the sealed bytes in lowercase hex. A body that is not one record by its two
names is answered nothing delivered, and the world the last good `stand`
left stands. The suite header is read on the reach alone, since `stand` and
`digest` are no reach. Each request is answered on its own, and a kit may
close the connection after every answer.

`stand` puts the kit's world in the record's state and leaves its stream
where the record says. The world is the corpus's, because the `ask` a
record returns was sealed in it: the keys that sign it, the numbers it
carries and the ids its answers name are drawn and minted there, so a kit
that builds another world seals other bytes. `door.json`'s note writes that
world out whole, the harbors, the wards and beings, what each relation
draws and in which order, and the hand that seals every ask the corpus
carries, and a kit reads it there rather than recovering it from the bytes.
How a kit's harness builds that world is its own. What the record itself
carries is three things.

The **ward** is the seed of the ward whose door judges, and it is that seed
as text: `A`, `B`, `P`, each of them a name that is not thirty-two bytes and
so is SHA-256'd to thirty-two, as every seed is. Same seed, same key,
in any language.

**`draws`** is how many words of the stream were spent before the arrival,
the hand's sealing of the ask included. A kit that built the world as the
note writes it arrives there on its own, and `draws` is what it checks
itself against; the door then draws the reply's ephemeral key from the same
bytes this corpus drew it from.

**`blueprint`** is on the one record whose reply carries `seen`, and is the
shape that digest is taken over. A being's shape reaches the wire in that
one place and nowhere else in this corpus, so a kit stands a being who
answers exactly that to the empty ask and the bytes are these bytes. Every
other record is the door alone, and needs no being of any particular shape.

So the reply is the record's reply or the kit is not this
protocol. `ask` is returned because the kit's hand sealed it on the way,
and a hand that seals the record's own bytes is proven before its door
is. `digest` reads the ward the last `stand` chose, and before any `stand`
both answer nothing delivered.

The verifier's round on one record is four steps and no key: `stand`, and
`ask` is the record's; the record's `ask` posted to `<url>/<ward>`, and the
body is the record's `reply` byte for byte; `digest`; and `wrote`, whether
the two digests differ, is the record's. What it does not check is what a
stranger cannot see: `opens` needs the hand's secret, `heard` is the door's
word to its harbor, and a digest's value is the kit's own, so all three are
the kit's tests to keep. A record is replayed on its own and in any order, since
each `stand` is a fresh world.

A tab is a verifier too, and a tab runs in a stranger's origin, so a kit in
vector mode answers every origin: `access-control-allow-origin: *` on all
three routes, and an `OPTIONS` answered with the methods and the headers
the reach and the harness use. A kit that answers only its own origin
passes from a shell and fails from every browser, which is a fault in the
stand and says nothing about the door.

The mode is stood by a hand and never by a harbor a world runs on. Its
entropy is a written-down stream, so a ward in it is a ward whose every key
is known, and a harness that resets a partition on request is a harbor
that keeps nothing. The stream is SplitMix64, sixteen lines in any language
and written out here because a kit that reproduces it by recognising it is a
kit that guessed. The state is sixty-four bits and starts at the seed the
corpus names. Every draw adds the golden gamma `0x9e3779b97f4a7c15` to the
state, takes that as `z`, and mixes twice: `z = (z xor (z >> 30)) *
0xbf58476d1ce4e5b9`, then `z = (z xor (z >> 27)) * 0x94d049bb133111eb`, then
`z = z xor (z >> 31)`. Every shift is logical, every add and multiply is
modulo two to the sixty-four. The result is spent eight bytes at a time,
least significant byte first, and a request for a count not a multiple of
eight spends the head of a fresh draw and throws the rest away. The stream
is reset at the head of every record, so a record is reproduced without
running the ones before it.

Nothing in the mode is reachable from a harbor that is
not in it, and a kit that leaves the harness routes answering in an
ordinary harbor has shipped a door anyone can reset.

## The ward

### What a ward is

One process of its harbor. A being plus ward functions. It has one voice, the
door, and every arrival at that door is judged by it and named by it or falls
silent. It keeps every being it booted, builds every stance, mints every
key, seals every ask that leaves, and unseals every one that arrives. Its
beings trust it blindly. It trusts its harbor the same way.

Only a ward moves. A being has no address of her own and never leaves the
ward that booted her: her peers hold a standing at a ward pk, and what they
trust is that ward's word about an id, never the being under it. So which
beings share a ward is settled when they are booted, and a ward migrates
whole, with everyone in it, or not at all. To move one being would be to ask
every peer to trust a ward they never accepted, and asking that is what an
invitation is.

Its ward is itself. It boots itself as the first being in its own map, under
its own pk, and its own stance is built by the same code that builds every
being's. Its cells are its partition, all the way down.

It owns nothing durable. It is three things, all in the harbor's hands:
its seed, its partition, and the classes its beings are made of. The
partition names each class and the harbor holds the bodies, so a ward is
whole only where all three are, and a harbor that keeps one remembers where
the other two came from. It writes as it runs and says so after every
write, naming the row. That word is told and nothing comes back: it never
decides what is kept, when, or in what order. It asks one question, once,
at the end of an
arrival, after the being has answered and before the answer is sealed:
whether what was written is kept. That is the last moment anything can
still be said, because a reply sealed to an asker's lid cannot be unsaid
and only the ward can seal. A no is that arrival's own failure, said with
the words a failed ask already has, and never a reason: what is wrong with
this device is not the far side's to hear. A harbor that keeps nothing is
asked nothing. Between one run and the next, a ward is nothing at all.

One ward is one runtime and one language, and every being in it shares both.
A harbor that wants two languages starts two wards at least. A ward names no
runtime: what it stands on is the language and whatever the terrain hands it,
and a kit that named one would be a ward that runs in one place.

What a ward owes outward is its door, and the door is named here byte for
byte. A kit proves the rest to itself, with a suite written in its own terms
against the stance: which runtime it runs on, what it must open up to be
tested, and how a chapter it cannot stand is skipped are that kit's own, and
no second kit meets any of the three.

### The partition

Everything durable a ward has is here, every secret included, and nothing
here is ever in a being's cells. Values only, so the harbor may persist it as
it likes: as this process's objects, as a row, as a line of JSON on a disk. A
reboot from its JSON is the same ward. A harbor that keeps it copies it
through JSON and by no deeper copy its language offers: what the ward hands
out is already values, behind the cells guard, and a copy that carries more
than JSON does would carry a shape a reboot cannot give back.

```
partition
  version   'pre-1.0.0'
  beings    key -> her cells, with class
  bind      key -> her bind table
              standings   id -> { ward, heir | null, current, next, seq }     her keys for a standing
              occupants   id -> heir pk
              knocks      <ward>:<heir> | public:<ward> -> { current, next, spoke, sent, seq }   before take
                          spoke: bytes came back once. sent: bytes went out once, answered or not
                          bounded, oldest out, and one that answered outlives one that never did
              answered    <ward>:<heir> | public:<ward> -> true                            knocked and answered
              minted      the pks her side minted, bounded. nothing in the ward reads it: it is there to
                          be looked at, and a kit that keeps the list empty holds the same ward
  heirs     heir pk -> { being, id, current, announced, fresh, mark, spent }   the door's view of every occupant
  gone      heir pk -> { current, announced }   the keys held when an id was removed, bounded, oldest out,
                                                so their holder hears `removed` and nobody else a thing
  public    the one public being's key, or null
```

A knock record is filed under the ward and the heir together, never the heir
alone: an invitation carries the heir to whoever it is for, and anyone
holding one could quote that heir back inside an invitation naming a ward of
their own.

Only take ends a knock record, so the list is bounded like `gone`: past the
count the oldest go, and one that was answered outlives one that never was,
since an answered knock is a relation she may still take. A being who knocks
without ever taking keeps a fixed number of keys behind her, not one per
invitation she ever met.

How long each of the three bounded lists is, is the ward's own, and each says
what a reader loses when it bites. A `gone` record past the count is a
removed relation whose holder hears silence where she would have heard
`removed`, which is what every stranger hears and tells her nothing she can
act on. A knock record past the count is an invitation she cannot take, and
she knocks again with it or asks for another. The `minted` list is looked at
and never read, so its oldest entry going costs a name for a key already
dead. None of the three is observable to a far ward as a number: a far side
sees only that some old thing is unknown here, which is what it sees from a
ward that booted onto a fresh partition.

The version is one value and it does not move until 1.0.0. There is nobody
holding a partition of another shape to tell apart: if the shape changes, a
partition is thrown away, not migrated and not counted. A ward opening a
version it cannot read throws at birth and does not boot. Birth is where a
ward is allowed to be loud; silence is the door's word, for asks that were
made, and no ask has been made yet.

The version says which shape, and the ward reads the shape as well, once, at
birth: every field above that the ward, the door or the heirs later act on
without looking again. A partition this ward wrote is that shape by
construction. One adopted from elsewhere was written by a hand, another kit,
or a file that was cut short, and a `spent` that is not a list or a `mark`
that is not a number is a door that honours every number, or one that
rejects where it promised a word. A ward that meets one throws at birth with
the path that failed, which names what is wrong to whoever is holding the
file. A being's own cells are read no further than the two records the ward
keeps in them: what she puts in her own is hers, of any shape JSON carries.

What a ward can read is a list, `READS`, and today it has one member. The
list and the step that carries an older partition forward exist before
1.0.0 because after it there is nowhere to put them. A partition holds every
secret and every relation a world has: the first shape change after the
freeze cannot be answered by throwing it away, and a ward that meets a shape
it has no step for refuses to boot with all of it still inside. Throwing a
partition away is what a version means before 1.0.0, and carrying it forward
is what it means after; the seam is cut now so the second is possible.

### Restart

A restart is silent because the ward cannot tell rebirth from birth. Birth
is in one order: the ward as its own first being, then the box taken, then
every being whose cells record a class constructed again, unasked, with the
same cells, so a being who lends at her birth finds the box there.
Relations and keys are intact on both sides; a knock answered before the
restart can be taken after it; a door that restarts still refuses what it
already honoured.

A constructor that throws on a restart takes only herself down: she is
absent this run, no door, so `absent` at her door to the keys she bound and
silence to strangers, and her cells sit untouched waiting for the run that
can read them. The ward is up and so is everyone
else. Her row is hers while she is absent: the owner sees her as absent, no
class boots under her key, and the owner may unboot her. A class the harbor
does not hold this run is the same absence, and so is a
class the harbor holds at a body the cells were not written for: which body
a ward reboots on is the harbor's decision, and a ward cannot tell an old
one from a new one. Loss of the partition is loss of every relation,
announced to nobody.

### The owner

The owner is a role, not an identity, and it has a root. The root owner is
whoever holds the ward's ask pointer. The harbor hands that pointer to one
holder, by the device's rules: a shell, a UI, a socket only the device's
user can read. Lose the pointer, lose the root; there is no recovery inside
Quo.

Every other owner is an occupant of the ward itself. The ward is a being of
its own map, and the root may invite on it like on any being; whoever knocks
with that invitation is an owner, reached through the door, named by the id
the root chose, counted and rotated like any relation, and removed like any
occupant. That is how a ward is piloted from another device: the piloting
ward holds a standing at it, and every owner ask is a sealed ask. Only the
root may invite on the ward: an owner at the door asking to is refused, so
a carried key pilots and never hands piloting on. Ownership moves by the
root inviting one owner and removing another, and a migrated ward carries
its owners in its bind table, so the harbor that receives it does not
become one.

The root is not an occupant. It holds no heir, no key, no invitation. The
ward names every arrival on the ask `{ id: 'OWNER' }`, the third asker of the
ward-to-being edge, and answers it as such; an owner at the door arrives as
her id. What an owner can do is reach into a being from outside, which no
being can: mark the public being, place a relation into a being of the
ward, take one out of her, take her out of the ward, and ask her. Boot it
shares with every being of the ward. The ward is a being to her owner: the
empty ask is her describe,
and each ask in it carries a description and an input naming its fields, as
a being's asks do, so that a side renders the owner's asks the way it
renders anyone's and holds no list of its own.

```
ask()                                    -> { asks: [boot, public, invite, knock, remove, unboot, ask],
                                              notes: { pk, beings: { key: { class, public, digest, absent? } } } }
ask('boot',   { key, class })            -> { booted: key } | { error }
ask('public', { key })                   -> { public: key } | { error }
ask('invite', { being, id, notes? })     -> invitation | null | { error }
ask('knock',  { being | { boot: class, key },
                id, invitation, method?, args?, wanted? })
                                         -> { taken: id | null, answer } | { error: 'silence' | 'unreached' | ... }
ask('remove', { being, id })             -> { removed: id } | { error }
ask('unboot', { being })                 -> { unbooted: key, removed: [id, ...] } | { error }
ask('ask',    { being?, method?, args?, wanted? })
                                         -> her object | { error: 'silence' | 'threw' | 'late' | ... }
anything else                            -> { error: 'unknown ask' }
```

- The owner is a caller like any other: `wanted` says what its knock or its
  ask may spend, and saying nothing is the ward's default, exactly as for a
  being.
- The describe runs every being's own describe as `OWNER` and hashes it; a
  being that throws or falls silent there shows a null digest. A being
  absent this run is listed with a null digest and `absent: true`.
- Boot refuses a key that has a row in the partition, booted this run or
  absent, and a class the harbor does not know; a boot that made nobody
  leaves the partition as it found it. A throw at birth is that boot's
  error, `{ error: 'threw at birth' }`, and nothing half-lives; a being's
  own boot answers null for it.
- Public marks a being already booted as the ward's one public being. It
  refuses a key not booted, the ward's own pk, and a second public being
  while one stands, since marking a second would leave the first holding
  every relation she had, reachable by nobody at the bare pk and told by
  nobody she was replaced. Marking the one already public again is
  answered, and changes nothing. A public being absent this run is
  reachable by nobody already, so the mark may move to another. A null key
  takes the mark off: the being stays booted with every relation she holds,
  and the ward answers arrivals for no heir with silence as one that never
  had a public being does. Retiring her is not destroying her, and the mark
  is free for another.
- Invite on the ward's own pk mints an owner, and only the root may ask it:
  from the door it is answered as an invite on nobody. The ward has
  occupants, its owners, and one standing, at the box, taken at birth and
  kept in its partition like any relation. A knock for the ward itself is
  still a knock for nobody, because the ward asks nobody anything but its
  box.
- The owner's knock is a being's knock made for her. The ward knocks under a
  key it mints for her, and if answered, takes under the id the owner gave
  and writes the standing into her cells. She finds it there. Her owner
  chose her class and her cells at boot; her owner may choose a relation for
  her too. The boot form names a being new or existing: a key already booted
  is a being of theirs, not a class that failed.
- **Unboot is the inverse of boot, and the only way a being leaves a ward.**
  Every relation she holds goes with her, by the same calls she would have
  used herself, so an occupant of hers hears `removed` from the keys her door
  kept rather than meeting a being who is not there; the owner is told which
  ids went. Her cells and her bind table go too, because a row naming a being
  no door holds would boot her again on the next restart. If she was the
  public being the mark goes with her, and the ward answers arrivals for no
  heir with silence as one that never had a public being does. The ward
  itself is refused, for the reason knock is: it would be a ward deleting
  itself from inside its own map, leaving its owners bound to a door that is
  gone. An absent being is unbooted the same way: she has no stance to speak
  for her, so the ward closes her heirs itself, and her occupants hear
  `removed`.
- The owner's remove is the mirror of its knock: a relation out of a being,
  by id, and the id may be an occupant or a standing, since the two share
  one namespace. The being's own remove says nothing; the owner hears
  objects, so this one says what it removed, and that there was nothing when
  there was nothing. Remove on the ward's own pk unseats an owner, and only
  the root may ask it, for the reason only the root may invite one: from the
  door it is answered as a remove on nobody. Ownership moves by the root
  alone.
- **The owner's ask is the third asker of the ward-to-being edge, filled in
  by the ward.** It reaches into a being and asks her, which is strictly less
  than unboot, and it is the only way to that asker: nothing outside the
  ward names `OWNER`. She is judged as any arrival is, the three choices and
  no others, and the wait is bounded like any other. She hears `threw` for a
  throw, a word out of her, or a shape that is not hers to make, and the
  owner hears each as an object. With no being named it is the public being,
  asked as nobody, and unbound: a stranger's view, so a throw of hers is
  silence, and a device serving her to strangers hears what a stranger hears
  and no more. The ward itself is refused, and so is a name no being holds.

The door is a ward function. It is not the ward's answer: it judges before
anything is named, and a being's answer only ever receives named askers. The
ask is the ward's answer, with the asker filled in as owner. Ward functions
are on the object, and no stance and no standing reaches them.

### Responsibilities, and not

The ward:

- Derives its pk from its seed and names itself outward by that and nothing
  else. Mints every other key from the ground's random, one per side of one
  relation.
- Instantiates beings when the owner or a being of the ward asks, by class
  name. It builds the stance, names the class, and receives the object from
  the harbor's instantiate call. It never sees a class body, its own
  included.
- Keeps, per being, the cells, the standings and the occupants, in the
  partition, and outside her cells the bind table. Never reads notes.
- Mints a heir for every id a being mints, keeps its pk beside the id, and
  hands her the invitation. Names every arrival signed by the key it holds
  for that heir by the id she minted.
- Seals every ask that leaves to the far ward's padlock, signed by the
  standing's own key, announcing its next, carrying its count and its
  allowance. Delivers to its own pk without the harbor. Hands every other
  ward pk to carry. Bounds the wait.
- Tells its own being the truth about her asks: an answer with its digest
  written to seen, silence when bytes came back and said nothing, unreached
  when nothing came back.
- Runs her answers concurrently and never serializes her. Two different asks
  may both be inside her answer at once, one paused, one running. Her cells
  are hers to guard across every point her language may leave her and come
  back: where a language suspends a call, that is the point, and where a
  language runs two calls at once, every point is one. A ward tells her which
  of the two she is in by being written in that language and no other, since
  one ward is one runtime and one language. What Quo promises is only that
  the ward adds no serialisation of its own; the guarding is hers.

Not stressed with:

- Where any pk lives. Sockets, URLs, DNS, containers, planets. It knows pks
  and nothing under them. The wire, retries, or the directory.
- Storage. It writes into its partition and does not know what medium that
  is, whether it persists, or when.
- Defending against its harbor. A ward that distrusts its harbor has no
  move, so Quo gives it none. The harbor vouches, the ward trusts. A being
  trusts her ward, a ward trusts its harbor, a harbor trusts its device. A
  broken vouch is total and silent.
- Deciding who may be an occupant. She invites; it binds and names.
- Restarting a crashed being, retrying a silent ask, or noticing that a
  standing walked away. A being learns about a standing by asking it, and
  from nothing else. There is no estate. The far being is sovereign: she may
  fall silent on the ask after the knock, and nobody is told.
- Blacklists, rate limits, and what to do with a pk that keeps knocking with
  garbage. The door says `heard` or not beside every reply; the rest is the
  harbor's.

## The harbor

A harbor is what a device already has, offered to Quo: processes, storage, a
network, entropy, a clock. It fits into a device carved up by its owner,
users, containers, mounts, profiles, and asks for none of them. It judges
nothing, holds no id, chooses no class, and is nobody outside its device.

It makes every being of every ward it serves, because `instantiate` is in
the ground and the ward calls it, and it keeps what it made. That is not
knowing a being. It has her object and knows nothing about her: not what she
answers, not who her occupants are, not which of her cells is a secret. It
never reads a partition to decide anything, and it never hands one out
except as the values a store keeps.

The harbor:

- Boots wards as processes, one seed each, and keeps each ward's partition:
  saves it when the ward says it wrote, one save at a time per ward and in
  the order it was told, so a being driven in process is kept the way one
  reached through a door is. When the ward asks whether what it wrote is
  kept, the harbor answers before the reply is sealed, and a save that
  failed is that arrival's failure: a door that said yes to what was never
  kept is the worse fault, because everything written to that being
  afterwards is lost and every door keeps answering success. The failure
  carries no reason. The door says what it says of any ask that did not
  take, and a full disk is not a reason the far side may hear. A harbor
  that keeps nothing is asked nothing and answers nothing.
- Stands a ward whose save was refused at what is kept, in memory and in the
  store together, so that a being's memory never runs ahead of the device and
  a reload finds no half-done row. When it does that, and what its store owes
  it to make the two agree, are the harbor's own: no ward and no far ward can
  tell one device's answer from another's.
- Puts back what a being wrote, and never what her relations are standing on:
  her cells, and neither the keys she speaks under nor the door's heirs. A
  relation cannot be put back, only broken. Her keys rotate when a reply
  opens and the far door's when it honours, so the two move at different
  moments and neither side holds the seed of a key it has moved past; stand
  either one at an earlier moment and it speaks under a key the other will
  not admit, with no way back. The count needs no such care, because a door
  honours any unseen number inside its span and a caller's count climbs at
  every attempt, so two counts find each other again on their own. What this
  costs is that a being's keys may stand ahead of what the device kept, which
  a restart can undo; ahead of the device is survivable and behind the far
  side is not.
- Holds the class bodies for its wards, and remembers for each ward where
  its bodies came from, so that a restart is on the same bodies unless the
  harbor decides otherwise. Constructs a being when a ward names a class
  through the ground's instantiate, and never chooses a class itself. A
  name it does not hold is null, and that boot fails. Whose code a ward
  runs is no concern of the harbor: a ward of its owner's and a ward whose
  bodies came from a stranger are hosted the same way.
- Passes every ward the ground, once, at birth. Receives a door and an ask.
  Hands the ask to exactly one holder, by the device's own rules. That
  holder is the ward's owner.
- Boots a ward of its own, when the device has anything to lend, and keeps
  its ask pointer rather than handing it out, so it is that ward's root.
  What the device can do lives there as beings, and one of them is the box's
  own, holding a standing at each under the name it is lent as. Every ward
  it hosts is handed one invitation on her in its ground, and a lend is an
  ask on that standing, answered by the lent being's own invitation. Which
  ward may have which name is the box's being's gate, and a stranger's ward
  is lent nothing. Nothing else about that ward is special: it has a seed, a
  partition, a door and beings, and every ask that reaches one of them is
  sealed, counted and judged like any other. Those beings are where a world's
  time comes from. A being runs only while she is answering, so every ask in
  Quo is asked by a being or by an owner, and a world in which nobody holds a
  clock, a line or a socket is a world where nothing happens that nobody
  asked for. What a device has, one of its beings holds, and she begins
  holding it at birth like anything else she does with her constructor.
- Hands its own device's code the beings it made for a ward, by key, and the
  keys it has. This is not a path around a door. The object is already in
  that process, made there a moment ago by the harbor itself, and reaching
  it is the device's own code calling its own object, the same reach a being
  has on one she booted herself. Nothing of it crosses an edge, so there is
  no door it could have passed instead. A key with no object is a being who
  is not here this run. What the device does not get is the partition: it
  holds every seed the ward has, and a side that wants to know which beings
  there are, or which one is public, asks the ward through the ask pointer,
  which is the only thing that answers for a ward anyway.
- Keeps the map of ward pk to door for its own wards, and ward pk to reach
  for foreign ones. Learns its own wards' pks by asking them. Learns foreign
  pks however it likes.
- Carries bytes to one ward pk and returns what came back, or nothing.
  Copies bytes across, never references, even between two of its own
  doors. Nothing means the bytes never arrived: no reach for that pk, a
  socket that would not open, a link that is down. Once it has sent them it
  never answers nothing on its own patience; it waits, and the ward's bound
  ends the ask.
- Receives bytes from the wire for a ward pk it holds, hands them to that
  one door, and returns what the door returned. Beside the bytes the door
  says whether a key it holds spoke; the harbor may count that per pk and
  act on it, and learns nothing more.
- Vouches: the seed stays secret, the partition is reached by this ward
  alone, the ask reaches its root owner alone, the device is the harbor's
  to defend. How is the device's business. Custody is this vouch: two
  harbors booting one seed over one partition are two wards with one pk,
  diverging in silence, and a harbor refuses to boot a ward another running
  harbor holds, by whatever lease its device offers.

Not stressed with:

- Reading, altering, caching, or retrying bytes. It does not know the word
  silence, and it never answers on a ward's behalf.
- Fanning out, broadcasting, or forwarding to a pk other than the one it was
  given. One pk is one ward is one door.
- Choosing a class, deciding an id, reading the keys inside a relation,
  minting an invitation on a ward it does not root, or acting on anything a
  partition contains.
- Judging anything. A ward judges its door. The harbor delivers to it.
- Speaking Quo. It is nobody's occupant and holds no standing anywhere. The
  harbor is not a ward and is nobody's.

What a harbor on a device keeps is a ward's three parts under one name: the
seed, the partition, and where the class bodies come from. Where it keeps
them, what it asks of whatever keeps them, and what else it writes down
beside them are the harbor's own, and nothing outside that device can tell
one answer from another. A disk, a tab, an edge object and a process's own
memory each hold a ward, and a ward cannot tell which of them it woke up in.

Carrying bytes to a pk off the device is a **reach**: carry bytes to a pk,
get bytes back or nothing. Two kinds, and no third:
a **request**, one URL, the bytes posted to it with the pk as the last
segment and the reply as the answer, listener to listener; and a
**socket**, one held line used in
both directions, opened by whichever side can dial, with a frame id
matching each reply to its ask and one text frame in which a side announces
the ward pks it holds. The framing on a socket is binary: an ask is the kind
byte `00`, a four-byte id, the 64-byte pk and the bytes; a reply is the kind
`01`, the id and the bytes; and nothing delivered is the kind `02` and the
id alone. The id is big-endian and the asking side's own, one for its first
ask on the line and unique among the asks it holds open there. A binary
frame that is none of the three, an unknown kind, an ask too short to hold a
pk or a nothing with bytes after its id, is not a frame and is dropped: it
tells no side that nothing was delivered, so an ask waiting on its id ends at
the ward's bound. The text frame is the JSON object
`{"announce":[pk,...],"suite":1}`, read as JSON and in any key order, an
absent `suite` read as this one.
A request is posted with `content-type: application/octet-stream`, which no
door reads. The reply is the body of a `200` of the same type. `404` is
nothing delivered, and the listener answers it for a pk it holds no door
for, a path that is not one pk in lowercase hex, and a suite it does not
speak; the caller reads `404`, any other `4xx`, `502`, `503` and `504` as
nothing delivered, and any other status as bytes sent and no answer, which
the ward's bound ends. The suite header is compared as HTTP delivers it,
with its outer whitespace gone. A kit
holds either end of a line and never a listener: who accepts a socket is the
terrain's business. A reach reads nothing; a
harbor opens no box but its own probe's.
Nothing comes back only where the reach knows nothing was delivered: no such
pk at the far end, a connection that would not open or closed before it
opened, a line already gone, a status from a request that says the listener
did not take the bytes, refused on their face or with nobody behind the
gateway. A
reach that sent the bytes and lost the line after answers nothing at all,
and the ward's bound ends the ask. The frames are pinned in
`vectors/wire.json`, and every reach of every kind answers alike.

A reach also carries the **wire suite**: which frames these are, and which
five algorithms seal what they travel with. It is one number, it is not
negotiated, and today it is 1. It rides where a line is opened and never on
an ask: in the text frame a socket announces itself with, and as the header
`quo-suite` on a request. So an ask is still bytes from the first one, with
nothing in front of them to say what they are, and a line still learns
before it carries anything whether the far side speaks what this side
speaks. A side meeting a suite it does not know carries nothing for it and
closes, naming the refusal on the way out with close code 4001; a
request door meeting one answers nothing delivered. How long a side refused
that way waits before asking again is its own, and a suite does not become
speakable by asking sooner. Absent is this suite,
because a caller older than the header is this one. Present and different is
refused as it is written: the number is compared as it was sent, so a suite
is one spelling and not a family of them.

This is the only place a second suite could ever be told from the first.
The five algorithms are named once and never negotiated, which is right: a
choice offered on the wire is a choice a stranger can push. But named once
is not the same as unnameable, and a kit that must one day seal differently
has to be able to say so to a kit that cannot, or the day it arrives every
world stops answering at once and none of them can say why. A silence names
no reason, by law. This number is the reason, said before the silence.

A harbor boots every ward it keeps, holds the map of ward pk to door for
its own wards and the **directory**, pk to reach, for foreign ones,
carries bytes to a pk and delivers bytes from the wire to one door. The
directory is filled
four ways, in this order: its own doors; a socket a dialer holds to it,
bound once the door behind the dialer's claim has proved it, and unbound
when the line closes; the claims of a listener this harbor dialed, proven
the same way and reached through that line; and a hint, a pk at a URL. A
hint never displaces a reach proven at a door. An
announce names at most sixty-four pks, proven a few at a time, and is the
newest word: a proof still in flight from an earlier announce on the same
line binds nothing when it lands. A side announces when its line opens and
again whenever the pks it holds change, so a ward booted, adopted or
dropped is reachable on a line already in hand.

An announce is a claim, and a claim binds nothing until proven: anyone who
can reach a listener could otherwise name a pk that is not theirs and take
its reachability, the one thing a rendezvous exists to give. The proof is
the door as it already is. The harbor mints a lid and sends it down the
line with noise after it, an ask for the claimed pk; that is a box that
does not open, D1, and the door answers it with silence sealed to the lid
and signed by the ward key. Only the holder of that seed writes that reply,
the lid is fresh so nothing replays, and a box that does not open writes
nothing at the ward. Each claimed pk is proven on its own, both ways: the
listener proves the dialer's claims and the dialer the listener's. What a
relay that genuinely reaches a ward elsewhere can still do is forward the
probe and pass, and then it is a rendezvous for that ward like any other,
able to drop and nothing more. This is the one box a harbor ever opens,
the one it sealed itself, and it reads nothing from it but that it is the
silence a door owes such a box, signed by the claimed key. One rule makes a
**rendezvous** of
any listener: bytes that arrive from the wire go to an own door or to a
socket this harbor holds for that pk, and never onward by request. So a
harbor that cannot be dialed is reached through one it dialed, by
anyone who holds a hint that its pk is there. How many listeners a harbor
dials, how long it waits before dialing again, what it does when the device
it runs on wakes from sleep, and in what order it tries the lines it holds
are its own and are no part of this document. A rendezvous is a listener and
nothing more, so a ward is never reachable through one place by anything but
its own choice.

A ward is born by minting a seed under a name,
leaves by being dropped, the partition written first, and arrives by
being adopted, same seed, same pk. Adopting is the one path a partition
written elsewhere takes, so it is where the ward's shape check is met: one
that will not boot is not adopted, and the
only copy is the one the caller is still holding.

## The being

### What a being is

One ordinary object, in one language, with one voice. She has state, she can
ask other beings, and other beings can ask her. She does not know where any
of them are, and she cannot find out. She never touches a key, a wire, or a
class. Her ward does all of that, and she trusts it blindly: what the ward
names is true.

She asks her standings by method and args and gets back an object, silence,
or a word. She invites whom she wants, in her own time, and removes them
when she decides. She knocks with invitations she was given and takes the
ones she wants. She answers every ask her ward brings her with an object or
silence; an error is an ordinary object, and she never throws outward. She
describes herself, per asker, by answering the empty ask.

Not stressed with: where anyone lives; crypto, keys, wire, storage, clocks,
or the harbor; strangers, because nobody her ward cannot name reaches her;
whether an occupant is a person, a model or a program.

### Her obligations

1. Args are one object. A throw is the word `threw` outside, to whoever the
   door has bound, and silence to a stranger: the ward is in the middle of
   every call and catches, always, in every language. An error is an object
   her output schema declares.
2. No lifecycle. Construction with the stance is birth. A restart is silent.
3. The empty ask is hers. Who gets what blueprint is her decision. She obeys
   the shape, never a content. The empty ask must be safe to repeat: her
   ward may ask it at any time, and it changes nothing. Nobody enforces
   this, in any language. It is her obligation alone.
4. A standing's digest arrives with every answer, as seen. She compares it
   to digest and refreshes by the empty ask if she wants. The digest is of
   what she told you, not of who she is: one being, many askers, many
   digests, all true.
5. An occupant has no digest. She can only be observed, never asked. To
   reach an occupant, hold a standing at her: she gave you one, or she did
   not.
6. Her cells are hers to guard across every point her language may leave her
   answer and come back into it. Quo does not serialize her, because that
   would narrow what can be built, and it promises her nothing about where
   those points are: that is her language's and she knows it.
7. A call is delivered once. Her ward, and the far ward, never let the same
   call reach a being twice by accident. A repeat is intentional. What she
   asks is always a new call. The one exception is the public being, who is
   reached with no heir and no count: the same bytes reach her twice, and
   her answer must be safe to repeat.
8. A being may make a being of her own ward, by class name and under a key
   she chooses, and holds no relation to her until one is invited and taken
   like any other; the ward builds the stance and the harbor holds the
   class, so she never touches either. Only the owner reaches into a being
   from outside.
9. Whatever her ward cannot name is not hers to worry about: what the ward
   does with an arrival it cannot name is the ward's.

### The raw shape

A being is anything her language can construct with the stance and ask with
`answer`. She needs no import from any kit, and a kit that could only make
beings out of a base class of its own would be a kit standing between a
being and her ward. So the value silence and the words are spelled where a
being reaches them without one: a name her language's runtime already
shares, which every kit of that language spells the same, or a value the
stance hands her. Which is the kit's, and a kit writes it down.

## Where the tree stands

The only place this document may name a gap between itself and the tree.
Each line is a debt to close, not a note to keep.

## Open

Named, not decided. Nothing is here today: every question this document ever
named is decided under Closed, and the slot each one needed is already cut,
because a slot costs two lines before 1.0.0 and a partition or a payload
shape after it.

### Closed

Decided here, so that the answer is not rediscovered:

- **Delivered, then died, is refused on repeat.** The far ward receives and
  crashes, the wire says nothing, and the near ward calls it unreached.
  No ward retries on its own, so a caller who asks again asks
  under the next number and is heard. A repeated number is refused by every
  door of this version, D10, and that is the whole answer: a repeated number
  is only ever seen by the one door it was sent to, so a kit that one day
  answers it from what the door already said interoperates with one that
  refuses, the way one ward's ceiling never meets another's. The slot for the
  reply that kit would keep is a field on the heir, and it costs two lines to
  cut now and a partition shape to cut after 1.0.0.
- **Hops is the door's half, and that half is whole.** An ask carries no
  count of doors, so a chain of relays is bounded by time alone. `hops` is a
  field of the ask, a whole number and never below zero, and a door refuses
  an ask that arrives at zero; nothing sets it and nothing decrements it. It
  is refused now because a count only bounds a chain if every door on it
  refuses, and a door written after the count was invented cannot make the
  doors before it enforce anything. The other half, a being's onward asks
  inheriting a door's remaining time and a count, needs the ward to know
  which arrival an onward ask belongs to, and it cannot learn that without
  naming a runtime. If a relay chain ever needs it, the way in is a field on
  the stance's `ask`, beside `wanted`, that a being who never sends it never
  has to know about: an addition on the ward-to-being edge, and no byte on
  the wire moves.
- **An invitation carries no hint.** It is `ward`, and for a heir `heir` and
  `secret`, and nothing else. Where a ward lives is the harbor's to know and
  a relation's to not: a hint inside the value would put a route inside a
  capability that beings hand around opaquely, and it would go stale while
  the invitation stayed good. A link is the invitation next to a hint, two
  values travelling together, and the hint goes to the directory while the
  being receives the invitation as it receives every invitation.
- **The owner does not set the allowance default or ceiling.** They are the
  ward's own policy, never negotiated and never on the wire, and a far door
  cannot tell one ward's ceiling from another's. A being who wants less than
  the default says so with `wanted` on the ask, which is the whole of what a
  being needs. An owner who wants another ceiling is asking for a different
  ward.
- **A leaked seed is a taken ward, and there is no succession.** The seed has
  one custodian, the harbor, which vouches that it stays secret; a being
  never touches it and no byte on the wire carries it. So it is lost only
  where that vouch broke, and a broken vouch is total and silent. It is not
  lost alone: a harbor keeps the seed and the partition under one name, and
  the partition holds every relation's keys, so there is no event where the
  address is taken and the relations are not. Nothing is left to succeed to.
  A succession signed by the key that speaks now is signed as well by
  whoever took it, and one that could not be forged would have to be
  committed to in advance, in the invitation, which carries nothing. The
  answer is a new ward, and every peer invited again as anyone is invited.
  Lose the seed, lose the ward; there is no recovery inside Quo, and that is
  the same sentence the root owner already hears.

## Glossary

- **being**: one ordinary object with one voice. Asks, answers, decides.
- **stance**: the one object her ward hands her at birth. Cells and calls.
- **cells**: her state. I-JSON values. Three keys are the ward's.
- **standing**: a pointer she holds to another being, through which she asks.
- **occupant**: a being she invited, whom her ward names when she asks.
- **id**: her own permanent name for one relation. Never crosses the door.
- **invitation**: a value her ward makes for an id she minted: its pk, a heir
  pk, the heir secret. Or a ward pk alone, for its public being. Opaque to
  her. Travels anywhere.
- **heir**: the key her ward mints at invite for one id, and gives away.
  Names the id outward. Dies the first time it speaks.
- **next**: the key a standing announces on every ask, and signs with on the
  next one.
- **count**: the number every ask carries for its relation. Honoured once.
- **allowance**: the time an ask may still spend. Inside the seal.
- **owner**: the root, whoever holds a ward's unsealed ask; and every
  occupant of the ward itself, whom only the root invites and only the root
  removes. A role, not an identity.
- **invite**: mint an id and get its invitation.
- **knock**: an ask carrying an invitation. Binds the far side to the id.
- **take**: keep an answered knock as a standing, under her own id.
- **ask**: method and args to a standing. Object, silence, or a word back.
- **answer**: her one function. Object or silence out.
- **the empty ask**: ask with no method. Her answer to it is her blueprint.
- **blueprint**: her interface as she chooses to show it to one asker.
- **digest**: SHA-256 over the JCS of a blueprint. Per relation.
- **seen**: the digest her ward last saw arrive with an answer.
- **silence**: the far side said nothing, or the door would not admit the
  bytes. Names no reason. Not retryable blindly.
- **word**: the ward's reason, said only to a key the door has bound or by
  her own ward to her. Nine: removed, absent, unannounced, repeated, threw,
  unreached, late, invitation, dropped.
- **unreached**: the word for no far door reached. Retryable.
- **notes**: hers, inside every occupant record. Quo never reads it.
- **partition**: the ward's files. Everything durable, every secret.
- **size**: one mebibyte, on the bytes of an ask and on the bytes of a reply.
  Read before anything is opened. Over it is silence, and never a word.
- **lid**: the ephemeral X25519 pk an ask carries in front of its box. The
  reply is sealed to it and to nothing else. One per ask, never reused.
- **edge**: one of the two seams of Quo, harbor to ward and ward to being.
  An object crosses once at birth, calls cross for the rest of the ward's
  life, and nothing else crosses.
- **ground**: the one object a harbor passes a ward. Nine things.
- **box**: the device, as a ward its harbor roots and the beings in it. One
  of them is the box's own being, and every ward the harbor hosts holds one
  standing at her, taken at birth; the rest are the lent beings she names.
- **lend**: a standing at one of the box's beings, by the name the box
  knows it under, offered on the ward's standing at the box. The ward knocks
  and takes it for her; she is handed the id and never the invitation.
- **lent being**: a being of the box's ward, standing for one thing the
  device can do. A lend is answered with an invitation she mints on herself,
  and an offer that goes untaken she removes again. Nothing outside her ward
  reaches her except through a lend.
- **door**: the ward's one voice outward. Sealed bytes in, sealed bytes out.
