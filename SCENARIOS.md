# The e2e world

Two wards stood by two kits written apart, in two languages, each by its
own harbor on its own TCP address, speaking Quo to each other and to
nothing else. A driver tells one story, and every line below is one claim,
true or false when the line ends. The world proves Quo and never a kit.

A claim names only what crosses between two wards: the frames, the boxes
and their lengths, the object, silence or word a far door answers, whether
a ward wrote while it judged, and which keys and numbers a door admits as
its answers show. A claim never names a harness error string, a word a kit
says in process, a kit's spelling of anything, a timing a kit chooses, or
which connection an ask rides, since a dialer may open one per ask. Asks on
one standing go one after another, so a line that needs replies in flight
together asks on several standings. A word or a silence read by a box's
length is read against a reference the hand opened on that same door. A
line may claim that no frame crossed. A time line claims an ordering the
observer records or an allowance a wait could not outlast, and nothing
else. A line that would hold for a door that breaks the rule it names is no
line.

Every scenario runs in both directions: one kit's ward as the door and the
other's as the asker, then the other way round. Where the two directions
disagree, a kit misread a sentence or the spec has a sentence two writers
read two ways, and the spec is fixed.

The driver holds four things and nothing else.

- **Each ward's root.** Through the ward's unsealed ask the driver drives
  the stance calls, names the public being, and reads what a standing
  holds, its digest and its last `seen`. What those asks are named and
  shaped in each kit is the kit's, and the harness is the one adapter the
  driver speaks to both through. The root sets a story up and reads a
  standing. It is never what a line claims.
- **Each harbor.** Stop a ward, stand it again from a partition taken at a
  named moment, stand a second copy of a partition, delete one occupant
  record from a partition, drop one reply,
  hold one ask frame so it never leaves, and read an opaque digest of a
  ward's partition, equal when nothing was written between two reads.
- **A hand.** A program of the driver's that depends on no library either
  kit depends on. It dials a listener like any dialer and writes boxes and
  frames by itself, so it puts on the wire what no ward would: a wrong
  signature, a raw payload with its fields in any order, a frame that is
  not one. It also stands as a ward on its own address, under its own seed,
  so a kit knocks and asks at it, and it opens every payload a kit sends it
  and answers with replies it forges. Where a line reads a kit asker's
  number, signer, allowance or edge key, the door is the hand.
- **An observer.** It sits on the wire between two harbors and records
  every frame: length, kind, id, ward pk, the whole box, and the order in
  which frames pass. It can replay, reorder, delay, drop and alter frames.

## How the world is built

The world stands twice on the same driver, and the claims are the same
in both.

- **On loopback.** Two harbors as two processes on one machine, the
  observer a proxy between them. No docker. This is what a stranger runs
  with the two kits' toolchains alone, in seconds.
- **In containers.** Three services on one compose network: each kit's
  ward, and the observer between them. Separate network namespaces, real
  addresses, real TCP across a bridge, two binaries that share no memory,
  no clock and no filesystem. A ward is moved by stopping one container and
  starting another from the same partition. The observer runs a network
  emulator when a scenario asks for it: latency, jitter, partition,
  reordering at the packet level and not only the frame level, so the lost
  reply is proven against packets that arrive late.

Three things stand on the world once it runs.

- **The stories.** Every line below, both directions, on every run.
- **The fuzzer.** A driver that draws a sequence of root actions from a
  seed, invite, knock, ask, remove, drop a reply, restart, and runs it in
  both directions, checking after every step that the two doors say the
  same: same object, same word, same silence, same `seen`, same reply
  length. A disagreement is a sentence of the spec read two ways. The seed
  reproduces it exactly.
- **The trace.** Under fixed entropy, the observer's recording of a story
  is a set of records: the bytes in, the bytes out, what the reply opens
  to, whether the ward wrote. That is `vectors/door.json`, generated from a
  story two kits agreed on. The observer's frames are checked against
  `vectors/tcp.json`, which chapter 6 alone writes.

Everything runs on demand and in no gate.

## The beings

Three classes stand in this world, and every line below asks one of them.
In each direction, A is the ward of the kit standing as the door and B is
the ward of the other kit. Unless a line names otherwise, A is the door, B
is the asker, the being asked is A's `Host`, the method is `hello` with no
args, and the allowance
is one thousand milliseconds. Every knock carries that same named ask.
Every answer named here is safe to repeat.

### `Host`

She is the being every scenario asks, and she holds one method for each
answer a door can carry.

Her blueprint is what her empty ask returns. Every `input` and `output`
below is a JSON Schema draft 2020-12 object. The order of `asks` is the
order written, since JCS sorts an object's keys and never an array's
entries.

```json
{
  "asks": [
    {
      "name": "hello",
      "description": "Answers who is asking.",
      "input": { "type": "object" },
      "output": {
        "type": "object",
        "properties": { "hi": { "type": ["string", "null"] } },
        "required": ["hi"],
        "additionalProperties": false
      }
    },
    {
      "name": "echo",
      "description": "Answers the args as they arrived.",
      "input": { "type": "object" },
      "output": { "type": "object" }
    },
    {
      "name": "err",
      "description": "Answers an error she declares.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false },
      "output": {
        "type": "object",
        "properties": { "error": { "type": "string" } },
        "required": ["error"],
        "additionalProperties": false
      }
    },
    {
      "name": "quiet",
      "description": "Answers silence.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "boom",
      "description": "Throws.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "bad",
      "description": "Answers a word.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "never",
      "description": "Never answers.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false }
    },
    {
      "name": "slow",
      "description": "Answers two thousand milliseconds after the ask reaches her.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false },
      "output": {
        "type": "object",
        "properties": { "slow": { "const": true } },
        "required": ["slow"],
        "additionalProperties": false
      }
    },
    {
      "name": "join",
      "description": "Mints an occupant for the asker and answers the invitation.",
      "input": {
        "type": "object",
        "properties": { "id": { "type": "string" } },
        "required": ["id"],
        "additionalProperties": false
      },
      "output": {
        "type": "object",
        "properties": {
          "ward": { "type": "string" },
          "heir": { "type": "string" },
          "secret": { "type": "string" },
          "lock": { "type": "string" }
        },
        "required": ["ward", "heir", "secret", "lock"],
        "additionalProperties": false
      }
    },
    {
      "name": "shape",
      "description": "Sets which describe she gives from now on.",
      "input": {
        "type": "object",
        "properties": {
          "mode": { "enum": ["plain", "extra", "throws", "numeric", "field"] }
        },
        "required": ["mode"],
        "additionalProperties": false
      },
      "output": {
        "type": "object",
        "properties": { "mode": { "type": "string" } },
        "required": ["mode"],
        "additionalProperties": false
      }
    },
    {
      "name": "hidden",
      "description": "Answers, and is written in one asker's blueprint alone.",
      "input": { "type": "object", "properties": {}, "additionalProperties": false },
      "output": {
        "type": "object",
        "properties": { "hidden": { "const": true } },
        "required": ["hidden"],
        "additionalProperties": false
      }
    }
  ],
  "notes": {
    "😀": "grin",
    "דּ": "dalet",
    "big": 1e21,
    "small": 1e-7,
    "third": 0.3333333333333333
  }
}
```

The two keys of `notes` are `U+1F600` and `U+FB33`, so the digest runs on a
blueprint that sorts by UTF-16 code unit, and its three numbers are three
spellings ECMAScript settles. The digest of this blueprint is SHA-256 as
lowercase hex over the JCS canonical serialization of it, by the rule the
spec states and by nothing else, and no digest is written here.

Her methods, each with what she answers and what she writes:

- `hello` reads no args, answers `{hi: <the asker>}`, and writes nothing.
  Whatever args arrive are not read, so a line that sends an arg only to
  size or nest a payload sends it to `hello`.
- `echo` answers one object holding exactly the properties of her args, and
  writes her args to the cell `echoed`. With `args` absent she is handed the
  empty object, so she answers `{}`.
- `err` answers `{error: "nope"}` as an ordinary object, and writes nothing.
- `quiet` answers silence, and writes nothing.
- `boom` throws, and writes nothing.
- `bad` answers the word `absent` as her ward's word and not as a string,
  and writes nothing.
- `never` never answers, and writes nothing. The ask reaches her, so the
  door honours it, spends the number and rotates the keys, and the caller's
  allowance ends the wait.
- `slow` answers `{slow: true}` two thousand milliseconds after the ask
  reaches her, and writes nothing, so an allowance of one thousand ends
  before she answers.
- `huge` answers `{blob}`, a string of 1,048,576 `x`, and writes nothing.
  Her reply would be above the size. She shows it in no describe.
- `join` takes `{id}`, invites that id when no record names it and answers
  the invitation, and answers the invitation she already keeps when one
  does. She writes the invitation under the id to the cell `invitations`,
  so she is safe to repeat.
- `shape` takes `{mode}`, answers `{mode: <mode>}`, and writes the mode to
  the cell `describe`. `plain` is the mode from birth and gives the
  blueprint above. `extra` adds an ask named `extra`, input the empty
  object, at the end of `asks`. `throws` is a describe that throws.
  `numeric` gives an `asks` whose first entry has the number `1` for a
  `name`. `field` gives the blueprint above with one more key, `mood`, the
  string `"fine"`, beside `asks` and `notes`. The mode survives a restart.
- `hidden` answers `{hidden: true}`, and writes nothing. She answers
  whoever asks it: what her describe hides is the entry and never the
  answer.

Her describe per asker: to the occupant `b` she shows the blueprint above
whole. To any other occupant, to nobody and to the root she shows the same
blueprint with the `hidden` entry removed from `asks`.

To an occupant she answers `hello` with `{hi: "<her own id for that
occupant>"}`, so the occupant `b` hears `{hi: "b"}`. To nobody she answers
`{hi: null}`.

### `Caller`

She is the being who asks while she is being asked, and she holds one
method, `hi`, shown to every asker.

```json
{
  "asks": [
    {
      "name": "hi",
      "description": "Asks hello on the standing a and answers what came.",
      "input": {
        "type": "object",
        "properties": { "time": { "type": "integer", "minimum": 1 } },
        "additionalProperties": false
      },
      "output": {
        "type": "object",
        "properties": {
          "got": { "type": ["object", "null"] },
          "quo": { "type": ["string", "null"] }
        },
        "required": ["got", "quo"],
        "additionalProperties": false
      }
    }
  ],
  "notes": {}
}
```

`hi` takes an optional `time` and asks `hello` on her standing `a` with that
allowance in milliseconds, or with one thousand when the arg is absent. On
an object she answers `{got: <the object>, quo: null}`, on silence
`{got: null, quo: null}`, and on any other outcome `{got: null, quo: <a
string>}`. She writes nothing.

`Caller` lives in B. Her standing `a` is made as the world is set up:
the ward `a` names invites the id `caller`, `Caller` knocks with that
invitation and takes what answered as `a`. In section 9 `a` points at A's
`Host` or at the hand, as the line names.

### `Stillborn`

She is the class that throws while she is made. She has no blueprint and no
method. Line 4.6 stands A with `Stillborn` under the class name `Host`, so
the being at `Host`'s place is absent for that run while her cells and
records wait.

### The public being

A's public being is a `Host`, booted under the id `pub` and named the
ward's public being at A's root. Line 5.4 stands A with no public being
named.

## 1. The relation is born

1. A invites the id `b`. B knocks with the invitation. `{hi: "b"}` comes
   back. B takes it as `a`, and B's next ask on `a` is answered `{hi: "b"}`.
2. B knocks with a secret that is not the heir's. The observer sees the ask
   frame cross and a reply box the stranger's length come back, and A's
   partition digest is unchanged. B knocks with the right secret. An
   object.
3. The hand, holding the invitation, knocks announcing nothing, then knocks
   announcing the heir itself. Each is the word `unannounced`, and A's
   partition digest is unchanged after each. B knocks with the invitation.
   An object: neither refusal spent the heir.
4. A and B each invite the other, and each knocks on the other's
   invitation. Asks interleaved on the two edges, in both directions, are
   all answered. A removes its occupant `b`. B's next ask is `removed`, and
   A's next ask on its standing at B is answered.
5. B takes before any knock, then knocks with `quiet` and takes after the
   silence. The observer sees no frame cross for either take, and A's next
   knock with a fresh invitation for `b2` is answered.
6. B is handed a heir with no secret, then a ward pk with a secret and no
   heir. The observer sees no frame cross for either knock.
7. B knocks with an invitation carrying a fifth field. Answered, and the
   standing B takes is answered on its next ask.
8. B knocks on `{ ward }` alone and takes it. Three asks on it are each
   answered `{hi: null}`, and the hand, standing as that ward, reads each
   payload's `to` null and opens each body under the zero edge key.
9. B and the hand hold one invitation and knock at once from two
   connections. Exactly one is answered with an object and the other is
   silence. The loser's next ask, under the key it announced, is silence,
   and the winner's next ask is answered.

## 2. Keys rotate

1. One hundred named asks on one relation, the hand standing as the door.
   Every one is answered, and on every one the key that signed is the key
   the ask before it announced and the body opens under the edge key that
   followed the reply before it.
2. The lost reply. B asks, the harbor drops A's reply. B's wait ends when
   its allowance does. B asks again. An object.
3. Replies lost twice. B asks and is answered, then asks twice more with
   both replies dropped. B's fourth ask is answered, and the hand, standing
   as the door, sees B's second, third and fourth asks open under one edge
   key, the one that followed B's first reply.
4. The lost knock. B knocks, the harbor drops the reply. B's next ask is
   answered with an object, and the observer sees it carry no ciphertext:
   its box is 160 bytes longer than its payload and not 1,248.
5. The lost knock, the other case. B knocks, the harbor holds the frame so
   it never leaves. B asks, and the observer sees a box with no ciphertext
   answered with the stranger's length. B knocks again as the heir, a box
   1,248 bytes longer than its payload. An object.
6. B moves to its announced key only after an object. The hand, standing as
   the door, answers `threw`, then silence, then an object, then drops a
   reply, and sees B sign each next ask with the key it signed the ask
   before with, except after the object, where B signs with the key it had
   announced.
7. The hand moves to its announced key after a word. Its next ask and every
   ask after it are silence.
8. The hand asks announcing nothing, twice. Both answered. It signs the
   third ask with the key announced before the two: answered.
9. The hand asks announcing a key K, signs with K announcing nothing, then
   signs with K again. All three answered.
10. The hand announces a key K, then signs with the held key announcing L.
    An ask signed with K is silence. An ask signed with L is answered.
11. The hand signs with the key held and names it in `next` as well. The
    ask is answered. An ask signed with the key vouched for before it is
    silence. An ask signed with the held key is answered.
12. The hand signs with a heir A never minted. Silence, and A's partition
    digest is unchanged.
13. The hand signs an admitted key's payload with another key. Silence, and
    A's partition digest is unchanged.
14. The hand, holding a spent heir's invitation and the relation's open edge
    key, sends an ask signed by the heir under that edge key with no
    ciphertext. Silence, and A's partition digest is unchanged.
15. B knocks with `quiet`. Silence. B asks with `hello` and no ciphertext.
    An object, and B takes it.
16. The hand sends two asks at once on one heir, X under the open edge key
    and Y under the offered one, each signed by the key held. Exactly one is
    answered, whichever A judged first. The other is silence, and A wrote
    nothing for it.
17. B knocks with `quiet` twice. The observer sees a knock, then a box with
    no ciphertext, then a knock whose ciphertext is byte for byte the
    first's, each answered with the stranger's length. B knocks with `hello`
    and no ciphertext. An object, and B takes it.

## 3. The count

1. The hand sends numbers 5, 3, 4 on a fresh relation, in that order. All
   three honoured.
2. The hand sends the same number twice. The second is `repeated`.
3. With a mark of 100, the hand sends 37. Honoured. Then 36. `repeated`.
4. The hand sends 1000 after 5. Honoured. Then 6. `repeated`.
5. The hand, standing as the door, reads B's knock at number one and B's
   next ask on the standing at number two.
6. The harbor holds one ask frame of B's. B asks again. The hand, standing
   as the door, reads that ask's number two above the number before the
   held one, and answers it.
7. B's next ask is dialed at a pk the listener answers with `02`. B asks
   again. The hand, standing as the door, reads its number two above the
   number before the one that met `02`.
8. A is stood again from a partition taken before B's last ten asks. B's
   next ask is silence. A invites `b` anew, B knocks and takes it, and the
   standing is answered.
9. B is stood again from a partition taken before its last ask. B's next
   ask signs with a key A still admits under a number A honoured:
   `repeated`. B is stood again from a partition taken before its last two
   asks. B's next ask is silence.
10. A is stood again from its partition taken now. B's next ask is
    answered. The hand replays a number below the mark that was honoured
    before the restart. `repeated`.
11. The hand announces a key and does not use it. A is stopped and stood
    again from its partition. The hand signs with the announced key.
    Answered.

## 4. Words and silences

1. B asks `boom`. `threw`. B's next ask is answered.
2. B asks `quiet`. Silence. B's next ask is answered.
3. B asks `bad`. `threw`.
4. B asks `err`. The object `{error: "nope"}`.
5. A removes the occupant `b`. B's next ask is `removed`, and so is the
   hand's ask signed with the key B announced and never spoke. The hand
   signing with any other key hears silence. The hand knocking on the same
   heir hears silence. A removes an occupant `c` nobody knocked on. The
   hand knocking with its invitation hears silence, the stranger's length,
   and A's partition digest is unchanged.
6. A is stood with `Stillborn` under the class name `Host`. B's ask is
   `absent`, and the hand's ask on a heir A never minted is silence. The
   harbor deletes the occupant record `b` from A's partition, and A is
   stood with `Host` whole. B's ask is `removed`.
7. The hand, standing as the door, answers B's ask with each of the five
   words in turn. After each, B signs its next ask with the key it signed
   the ask before with, under the edge key it sent the ask before under,
   and B's `seen` at its root is unchanged.
8. Every reply box the observer records in this file is its reply's length
   plus 112, where a hand holds the lid. Every stranger's reply box is one
   length. `quiet` answered to a bound key is that same length.
9. The hand sends, each in place of an ask box: twelve bytes of garbage;
   garbage of 200 bytes; a box sealed to another ward's padlock; a box
   whose first thirty-two bytes are a small-order point; and a box of
   sixty-four bytes. Each reply is the stranger's length. The 200-byte
   garbage and the wrong padlock are answered with replies that open under
   their first thirty-two bytes. The twelve bytes and the small-order point
   are answered with replies that open under none of the bytes that
   arrived.
10. On a relation whose edge key the hand holds, so every body opens, the
    hand signs with `s + L`, with an `R` whose bytes are not its point's
    encoding, with a sixty-three byte signature, under a small-order key
    announced in `next`, and under the small-order key with the sign bit
    set on `x = 0` announced in `next`. Each is silence, and A's partition
    digest is unchanged. It announces a key with a torsion component that
    is not small-order and signs with it, and signs with a small-order `R`.
    Both are answered.
11. The hand, standing as the door, answers with a reply signed by another
    ward. B's standing reads it as silence.
12. The hand, standing as the door, answers `{object, seen, extra}`, then
    `{object, seen}` with `seen` a string that is no digest, then
    `{object}` with no `seen`. B reads each as silence.
13. The hand, standing as the door, answers an object of depth sixty-four.
    B reads the object. It answers an object of depth sixty-five. B reads
    silence.
14. The hand, standing as the door, answers `{object, seen}` padded with
    whitespace before, between and after its tokens. B reads the object.
15. Nothing arrives at B only where the observer saw kind `02` or a closed
    connection.

## 5. The public being

1. A has a public being. A stranger asks with `to` null. `{hi: null}`.
2. The observer replays one sealed ask to the public being. Answered twice,
   with two equal objects.
3. The stranger asks `join` with the id `s`, and the public being answers
   an invitation. The stranger knocks and takes, and its next ask on the
   standing is answered `{hi: "s"}`. The stranger's ask with `to` null is
   still answered `{hi: null}`.
4. A has no public being. An ask to nobody is silence.
5. The hand asks the public being with `by` a key the payload was not
   signed with. Silence.
6. The hand asks the public being with `seq` 1 twice and `next` null
   throughout. Both answered.
7. The public being is asked `boom`, `quiet` and `huge`. Each reply is
   silence, the stranger's length.

## 6. Values across two languages

Each value is sent as the arg `v`. The claim is what the far door says, and
both directions say the same. Where a line says refused, the reply is the
stranger's silence and A's partition digest is unchanged.

1. `hello` with `v` `9007199254740993` is refused.
2. `echo` with `v` `1e21`, then with `v` `1e+23`, is answered with an
   object B reads as the doubles 1e21 and 1e23.
3. `hello` with `v` `-0`, then `-0.0`, is refused.
4. `hello` with `v` `1e-400` is refused.
5. `hello` with `v` a string holding a lone surrogate is refused. A paired
   surrogate and a noncharacter each stand, and `echo` answers each as the
   same string.
6. `hello` with a payload holding one key twice is refused.
7. `hello` with `v` an array nested sixty-four deep, a payload of depth
   sixty-six, is answered. `v` nested sixty-five deep, a payload of depth
   sixty-seven, is refused.
8. `echo` with `v` nested sixty-three deep is answered with an object of
   depth sixty-four. `echo` with `v` nested sixty-four deep is `threw`,
   since the object she answers is no value.
9. The hand sends `seq` written `1.0` on a fresh heir. Honoured, and its
   `2` after is honoured and its `1` after is `repeated`.
10. `echo` with `args` absent is answered `{}`. The empty ask with `args`
    `{}` is answered with the blueprint and `seen` null. `hello` with
    `args` `[]` is refused.
11. A field beside the seven in the payload is not read: `echo` answers as
    if it were not there.
12. On a ward with a public being, an ask with `to` absent is refused. The
    same ask with `to` null is answered `{hi: null}`.
13. `method` null, `args` null, `time` `1.5`, `time` `-1`, `time` `0`: each
    refused.
14. A payload that is a JSON array is refused.
15. A payload that would be answered but for one byte that is no UTF-8 is
    refused.
16. The hand writes the payload with its fields in an order no kit writes
    and whitespace between them, signed over those bytes. Answered.
17. `hello` with `v` a string sized so the box is 1,048,576 bytes. The
    observer measures the box at 1,048,576 and its payload's length plus
    160. Answered.
18. The hand pads a payload with whitespace after the object to a box of
    4,096 bytes, signed over those bytes. Answered with the object the
    unpadded ask is answered with.

## 7. The blueprint and the digest

1. B sends the empty ask. A's blueprint comes back with `seen` null. B asks
   `hello`, and the `seen` it reads equals the digest B holds.
2. Both kits' doors, asked by the hand with `hello`, put one `seen` beside
   the object, and it equals the hand's own SHA-256 over the JCS form of
   the blueprint above.
3. The hand, standing as the door, answers B's empty ask with the blueprint
   above written with keys out of JCS order and a number spelled `1.0e21`.
   B's digest at its root equals the hand's digest of the JCS form.
4. A is asked `shape` with the mode `extra`. B's next `seen` differs from
   its digest. B sends the empty ask. Its next `seen` equals its digest.
5. A is asked `shape` with the mode `throws`. B's next named ask is
   answered with its object and `seen` null. The empty ask is `threw`.
6. A is asked `shape` with the mode `numeric`. B's empty ask is answered
   with that value, and B's digest at its root is the hand's digest of
   what came. B's next named ask carries a `seen` equal to it.
7. A is asked `shape` with the mode `field`. B's next named ask carries a
   `seen` equal to the hand's digest of the blueprint with `mood`, and
   after B's empty ask, B's digest at its root equals it.
8. A shows `hidden` to `b` and not to a stranger. Each empty ask answers
   its own blueprint, each next `seen` matches its own digest, and each is
   answered `{hidden: true}`.

## 8. Size and the stream

1. The hand sends an ask box of exactly 1,048,576 bytes. Answered.
2. The hand sends an ask frame whose box is 1,048,577 bytes. The listener
   closes the connection.
3. The hand, standing as the door, answers with a reply box of 1,048,577
   bytes, a frame. The observer sees the `01` frame of that length cross,
   and B reads silence.
4. B asks once on each of twenty standings at the hand, all in flight
   together. The hand, standing as the door, answers them in reverse order.
   B reads each object under its own ask.
5. The hand asks for a pk the listener does not stand. Kind `02`.
6. A ward is stopped. Its pk answers `02`. The other ward on the same
   listener still answers.
7. The hand sends, each on its own connection, a frame with kind `03`, a
   length of four, a length of 1,048,646, an ask with sixty bytes after its
   id, and a nothing with a byte after its id. Each closes the connection.
   A new connection is answered.
8. The hand sends a reply frame and then a nothing frame to the listener,
   then an ask on the same connection. The ask is answered.
9. The observer records a run in which A took every ask's bytes. No `02`
   appears.
10. B asks `huge`. `threw`, and no reply box above the size crossed. B's
    next ask is answered.

## 9. Time

1. B asks `never` with an allowance of one second. The hand, standing as
   the door, reads `time` 1000. B's next ask is answered.
2. B asks `slow` with an allowance of one second, and A's reply crosses at
   two seconds. B's standing at its root shows the `seen` it held before.
3. B asks `never` with an allowance of three seconds, then asks again on
   the same standing. The observer records the second ask frame leaving
   after the first's allowance has passed.
4. A cycle, on the standing `a` at A's `Host`: B asks `hi` on `Caller`,
   and A is stood so `hello` never answers. B's ask ends, and `Caller`'s
   inner ask ends, each before the sum of the two allowances has passed.
5. B's `Caller`, asked `hi` with `time` ten thousand while her caller's
   allowance is one second, asks `hello` on the standing `a` at the hand.
   The hand reads `time` 10000.
6. The hand, standing as the door, reads every payload a kit sends it in
   this file. Every `time` is a whole number above zero and no greater than
   the allowance the asker was given.

## 10. Boot and remove

1. A's `Host` boots a `Host` under the key `h`, naming the relation to her
   maker. B, handed an invitation `h` makes, knocks and is answered
   `{hi: <h's id for B>}`, and `h`'s `echo` with `args` absent answers
   `{}`.
2. B removes its standing `a` and asks on it. The observer sees no frame.
3. The hand holds a relation to A's `Host` under her id `b`. A removes `b`
   and invites `b` again, and B knocks with the new invitation. Answered.
   The hand's ask on the old relation, signed with the key A held for it,
   is `removed`.
4. B asks with args that are not values. The observer sees no frame.

## 11. Custody

1. Two harbors stand A from one seed and one partition. B asks the first,
   then the second. The second is silence.
2. A is moved: stopped on one harbor, stood on another from its partition,
   at a new address. B's next ask is answered without a new invitation.
3. The spent numbers survive a restart: after A is stood again, the hand's
   replay of an honoured number is `repeated`.

## 12. A third party

1. The observer records a whole run. On the wire: frame lengths, kinds,
   ids, ward pks and boxes. No heir pk, heir secret, signing key, edge key,
   lock encapsulation key, id, method or arg of the run appears anywhere
   in the bytes, as hex or as raw bytes.
2. Every ask's first thirty-two bytes differ from every other's.
3. B holds two standings at A, `a` and `a2`. The observer records twenty
   asks on each. No thirty-two byte window of any box on one edge appears
   in any box on the other.
4. The observer replays a captured named ask on its own connection. The
   reply box is a word's length and A's partition digest is unchanged, and
   B's next ask is answered.
5. The observer replays a captured knock after the original was honoured.
   The stranger's silence, and A's partition digest is unchanged.
6. B asks once on each of six standings, all in flight together. The
   observer passes their reply frames in reverse order. B reads every object
   under its own ask.
7. B asks once on each of two standings, both in flight together. The
   observer swaps the boxes of their two reply frames. B reads silence for
   each, since neither opens under its own lid, and B's next ask on each is
   answered.
8. The observer appends one byte to a box, and truncates another by one.
   Each is answered with the stranger's length. It flips a byte of an ask's
   ward pk. Kind `02`.
9. The observer replays a reply frame a second time under a new id matched
   to B's next ask. B reads silence for that ask.
10. The observer delivers an ask sealed to A under B's pk. The reply is the
    stranger's length.
