# HARNESS

This is the one interface every kit exposes so that one driver runs the e2e
world of `SCENARIOS.md` and replays the vectors, against any kit in any
language. It is test tooling beside the vectors, not the protocol, and what
it drives is there to prove Quo and never the kit behind it. Nothing here
crosses a door and nothing here is on the wire.

## 1. The stand program

One executable per kit, named `stand`, that a harbor runs. It listens on one
TCP address, stands the wards it is told to stand, and speaks the root
channel of section 2 on its stdin and stdout.

```
stand --listen HOST:PORT
      --ward SEED[=FILE] ...
      --class NAME[=CLASS] ...
      [--entropy SEED]
```

- `--listen` is the host and the port the listener holds. Port `0` is a port
  the operating system chooses, and the printed address says which.
- `--ward` is given once per ward. `SEED` is the seed as text, taken as
  chapter 3 takes a seed that is not thirty-two bytes. `=FILE` is a partition
  file of section 5, and the ward is stood from it. Without it the ward is
  stood on an empty partition.
- `--class` is given once per class the harbor holds. `NAME` alone stands the
  kit's class of that name. `NAME=CLASS` stands the kit's class `CLASS` under
  the name `NAME`. A class the kit does not hold is a bad argument.
- `--entropy` fixes the stream of section 6 at a 64-bit seed, written in
  decimal. Without it the harbor draws real entropy.

On start `stand` prints one line per ward, in the order they were given, and
then one line saying it is ready. Both come before any answer.

```
ward <128 lowercase hex> <host>:<port>
ready
```

Nothing else is ever printed on stdout but the answers of section 2. What a
kit writes for its own eyes goes on stderr. `stand` runs until its stdin
closes, and then stops every ward and exits.

```
0   it stood, it ran, its stdin closed
1   an argument is not one
2   a ward cannot be stood: the partition file is not one, or is not this
    ward's
```

## 2. The root channel

The driver reaches each ward, and the harbor's verbs, over the program's
stdin and stdout. The stand program is an adapter written in the kit's
language over the kit's own code: it is a harbor of that kit, it holds
the ward's root and, where it helps, a being's stance, and it answers each
request below by whatever calls the kit offers. How a kit names its own
root asks, shapes its refusals, fuses or separates its calls, or keeps its
partition is the kit's and is not changed to fit this channel. The
channel's names and shapes bind the adapter and never the kit.

**The channel.** Both directions are UTF-8. One JSON value is one line. A
line ends with `\n`, and `\r` is not part of a line. No value carries a
newline inside it, since a line is the frame. The `ward` lines and the
`ready` line come before any answer. Answers come in any order, and the id
says which request each answers.

```
request = { id, ward, at?, method?, args? }
answer  = { id, object } | { id, silence: true } | { id, quo: word }
```

- `id` is minted by the driver, a string, unique among the requests in
  flight.
- `ward` is the 128 hex pk of the ward whose root is asked.
- `at` is `host:port`, and it names which listener, where `copy` has stood
  two wards of one pk. Absent where one stands.
- `method` absent is the empty ask, exactly as it is at a door.
- `args` absent is the empty object.

The answer is exactly the reply's three shapes with the request id in front.
Every root ask and every harbor verb answers inside `object`, a word inside
`quo`, and silence as `silence: true`. A null answer is `object: null`, and
it is not silence. A word is the five door words, `removed`, `absent`,
`unannounced`, `repeated`, `threw`, or the four the ward says in process,
`unreached`, `late`, `invitation`, `dropped`. A refusal of the request
itself, whatever the kit's root says when it refuses, an object, silence or
nothing, is answered on the channel as an ordinary object,
`{ error: <reason> }`, by the adapter, and a request for a ward this
program does not stand is answered `{ id, object: { error: "no such ward" } }`.

The root's asks are the kit's. These are the requests every adapter
answers for the driver, by the kit's own calls.

```
(empty)   args none                      the ward's blueprint
boom      args none                      throws
boot      { maker, key, class, occupant, standing }   { booted: key }
public    { key }                        { public: key }
invite    { being, id }                  { invitation }
knock     { being, invitation, method?, args? }   the answer
take      { being, id, invitation }      { taken: id | null }
ask       { being, id, method?, args?, wanted? }  the answer
remove    { being, id }                  { removed: id | null }
standing  { being, id }                  { id, digest, seen }
```

- `being` is the key a being was booted under, and `key` is the same thing
  at `boot` and `public`. `id` is the being's own id for a relation.
- `boom` is the root ask that throws, so the root's own throw has a method.
- `boot` is the being `maker`'s boot: it makes a being of this ward under
  `key` and the one relation between the made being and her maker, the being
  `maker` names. The relation never ends at the made being twice.
  `occupant` is the maker's id for the made being, and `standing` is the made
  being's id for her maker. Which side invites is the kit's, and each end
  holds the id named here whichever way the edge points.
- `wanted`, when present, is the allowance in milliseconds.
- `knock` answers what the knock answered: an object, silence, or a word. It
  takes nothing; `take` is its own ask, so the driver can knock and not take.
  Where two holders of one invitation knock at once, the second holder is the
  hand of section 3, on its own connection.
- `ask` asks on the standing `id` the being holds. The empty ask, `method`
  absent, answers the far being's blueprint.
- `standing` answers `{ id, digest, seen }` inside `object`: `digest` is the
  digest of the blueprint she keeps, 64 hex or null, and `seen` is the last
  `seen` that arrived, 64 hex or null.

Each refuses with one object and writes nothing.

```
{ error: "no such being" }     the key names no being of this ward
{ error: "no such standing" }  the id names no standing of that being
{ error: "id taken" }          invite on an id that already names a record
{ error: "key taken" }         boot under a key a being already holds
{ error: "no such class" }     boot of a class the harbor does not hold
{ error: "absent" }            boot of a class that threw while it was made
```

## 3. What the driver brings

The hand and the observer are the driver's own programs, in the driver's
language, and no kit implements either. The hand depends on no library
either kit depends on. It is a dialer: it holds keys it minted itself,
writes boxes and frames byte by byte, and puts on the wire what no ward
would, a wrong signature, a payload with its fields in any order, a frame
that is not one. It knocks with invitations the driver obtained through the
root, so no key is ever exported from a kit. It is also a ward, on its own
address under its own seed, with a lock of its own: it mints invitations to
heirs of its own, a kit's harbor is routed to it and knocks and asks there,
and it opens every ask a kit sends it and answers with a reply it forges,
signed by its ward key or by any key it chooses. The
observer sits on the wire between two harbors, records every frame, and can
replay, reorder, delay, drop and alter one.

**Sizing an ask.** The hand writes its own payload, so it sizes a box from
chapter 3 alone. An ask's box is its payload plus one hundred and sixty
bytes. The hand writes the payload as JSON with no whitespace between
tokens, so its length is the sum of its parts: two braces, six commas, and
per field the quoted name, a colon and the value's text. An `echo` with
`to` and `by` in hex, `next` null, `seq` S, `time` T and the one string arg
`v` of L bytes that need no escape is a payload of
`205 + digits(S) + digits(T) + L` bytes and a box of
`365 + digits(S) + digits(T) + L`. A box of exactly 1,048,576 bytes is
`L = 1048211 - digits(S) - digits(T)`.

**Sizing a knock.** A knock as the heir carries the ML-KEM-768 ciphertext of
the invitation's `lock` between the sealed head and the sealed body, so its
box is its payload plus 1248 bytes, and the hand draws its m after the lid.
A knock is sealed only with an invitation of four fields, `ward`, `heir`,
`secret` and `lock`, the lock 2368 lowercase hex.

## 4. The harbor's verbs

The harbor answers on the same channel, under the same request and answer
shapes. A harbor verb names the ward it acts on in `ward`, and `at` where
two stand under one pk, as any request does.

```
stop    args none                { stopped: ward }
stand   { file?, listen? }       { stood: ward, at: "host:port" }
save    { file }                 { saved: file }
digest  args none                { digest: <string> }
forget  { being, id }            { forgot: id | null }
hold    { asks: n }              { holding: n }
drop    { replies: n }           { dropping: n }
copy    { file, listen }         { copy: ward, at: "host:port" }
route   { far, at }              { routed: far }
```

- `stop` stops the ward. Its pk answers kind `02` from then on, and every
  other ward on the listener still answers.
- `stand` stands the ward again, from the partition file when one is named
  and from the partition it had when none is. The seed is the one the ward
  was given at start. `listen` is a new address, opened by this program, and
  the ward moves to it; absent, the ward stands where it stood.
- `save` writes the ward's partition to that path now, as section 5 says.
- `digest` answers an opaque string of the kit's own. The driver compares two
  answers for equality and reads nothing else, which is the one thing the
  spec says about it: two digests of one ward differ when something was
  written between them and are equal when nothing was.
- `forget` acts on a stopped ward. It deletes the occupant record `id` of
  the being `being` from the partition the next `stand` without a file
  stands, and nothing else: no key the door keeps for a removed id, no
  cell and no other record moves. It answers `null` where no occupant
  record of that id is there, and refuses a running ward with
  `{ error: "running" }`. It is how a record goes while its being is
  absent, which no stance call can do.
- `hold` holds the next `n` ask frames this ward sends, so they never leave.
  A held frame is never sent, not even later.
- `drop` drops the next `n` replies this ward's door writes, after the door
  has taken the bytes, so the far side is ended by its allowance.
- `copy` stands a second ward from that partition file, under this ward's
  seed, on a second address this program opens, and answers that address.
  The two are one name on two listeners, which is the custody
  cost of chapter 7, and `at` tells them apart from then on.

- `route` tells this program's carrier that the ward whose 128 hex pk is
  `far` is dialed at `at`, `host:port`, from then on, for every ward this
  program stands. A far ward with no route is not delivered, and the ask
  ends `unreached`. It is how the driver hands a harbor the address chapter
  6 leaves to whatever two parties share, and how it puts the observer
  between two harbors: the route names the observer, and the observer
  forwards to the far listener. A second `route` for one `far` replaces the
  first. The verb acts on the program, so `ward` names any ward it stands.

`hold` and `drop` take a count so the driver spends exactly what a claim
needs. A count of zero cancels what is outstanding, and so does `stop`,
since a stopped ward sends and writes nothing.

## 5. The partition file

A partition file is the ward's partition, as chapter 5 names it, written as
one JSON value to a file, and nothing else is in the file. The harbor does
not read inside it: it is opaque, as chapter 5 says, and the harness adds no
envelope of its own, no seed and no pk, because the seed is an argument of
`stand` already. What the file must let a kit do is one thing: stand the same
ward again, on the same kit, so that it is the same ward at the same name.
The file is one kit's own, so the driver moves a JavaScript ward to a
JavaScript harbor and a Rust ward to a Rust harbor. A kit that cannot read a
file its own `stand` wrote exits 2.

## 6. Fixed entropy

Under `--entropy` every byte any ward of the program draws comes from one
SplitMix64 stream, seeded when the program starts. A program started again
starts its stream again at the seed.

```
state = (state + 0x9e3779b97f4a7c15) mod 2^64
z     = state
z     = ((z xor (z >> 30)) * 0xbf58476d1ce4e5b9) mod 2^64
z     = ((z xor (z >> 27)) * 0x94d049bb133111eb) mod 2^64
z     = z xor (z >> 31)
```

The state starts at the 64-bit seed. `z` is the draw, spent eight bytes,
least significant byte first. One draw is one word. Every key in Quo is
thirty-two bytes, so every key is four words.

Every draw a ward makes, in the order it makes them, so that two kits
standing one world draw one set of bytes.

- **At boot.** Nothing. Standing a ward, booting a being, making one public
  and stopping a ward draw nothing at all.
- **At invite.** At the ward's first invite that names a heir, when its
  partition holds no lock, eight words for the lock, sixty-four bytes, d
  the first thirty-two and z the last. Then four words, the heir secret. The
  heir pk is derived from that secret, and the invitation's lock from d and
  z. A ward stood from a partition that holds a lock never draws for one.
- **At knock.** Four words for her own key, which the knock announces in
  `next`, at the first knock on an invitation, and then the ask's own draws
  below. A knock again on that invitation announces the same key and draws
  none for it.
- **At seal, on every ask that leaves.** Four words for the lid, the ask's
  ephemeral key, drawn after every key the ask announces. The first knock as
  the heir on an invitation draws four words more, m, right after the lid,
  and draws last. A knock again as that heir carries the same m and draws
  none. An ask under her own key after a lost knock carries no ciphertext
  and draws no m.
- **At reply.** Four words for the reply's ephemeral key. On noise, the key
  nobody holds is drawn first, four words, and four more when the first will
  not take a seal, and only then the reply's own four.

A ward that mints a key for anything else draws four words for it, at the
moment it mints it, before the lid of the ask that carries it.

The hand has a stream of its own, seeded with the same seed, and it never
shares a ward's.

## 7. A record's story

A record carries the story that puts a kit in its state, written as steps a
program holding no key can replay. The hand's keys are spent while the story
is recorded, and what is left of them is bytes. So a verifier replays a
record with the stand program of section 1 and a TCP socket, and nothing
else.

The corpus names what every story starts from, beside `vectors`, the list
of its records.

- `entropy` is the seed of section 6, as decimal text.
- `stand` is the program's arguments beside `--listen` and `--entropy`: the
  wards, as seed texts, and the classes.
- `worlds` names the stories records share. A world is `{ from, steps }`:
  the world it continues, or null, and its own steps after that one's.

A record names its `world` and carries its own `steps` after it. A step is
one of three.

- `{ root: { ward, method, args? } }` is a request of section 2 or section
  4, to the ward whose seed text `ward` names. It is answered with an object
  that is no refusal.
- `{ arrive: { ward, ask }, reply }` is `ask`, a box as hex, sent to that
  ward as one ask frame. `reply` is the box that comes back, or null where
  the frame is `02`, and a kit that answers other bytes has left the story.
- `{ restart: [args] }` saves every ward with `save`, closes the program's
  stdin, and starts it again with each ward stood from its file, under the
  classes `args` names and the same entropy. It is how a being does not come
  back in a run.

A kit that told the story arrives at the record's arrival in the record's
state, and `ward` is the seed text of the ward whose door judges it.

`verifier/` is the program that does this. It starts the stand once per
record, tells the story, reads `digest`, sends the record's ask, reads
`digest` again, and compares the reply byte for byte and whether the two
digests differ.

## 8. The trace

The observer records, per frame: the frame's length, its kind, its id, the
ward pk on an ask, the whole box, and the moment it passed. Under fixed
entropy the hand tells a story to one kit's
stand through the observer, and the recording becomes a record of
`vectors/door.json`. The observer reads every frame as `vectors/tcp.json`
pins, and a recording holding bytes it could not read as a frame is no
record. The trace tells every story to both kits and writes the corpus only
when the two recorded the same bytes, so a record is a story two kits agreed
on and never one kit's.

A record of `vectors/door.json` pairs one ask with its reply.

```
case        the door case of chapter 3, D1 to D13
name        what this record is, among the cases of that number
world       section 7
steps       section 7
ward        section 7
ask         the ask's box, hex, the observer's whole box on the ask frame
reply       the reply's box, hex, the observer's whole box on the reply
            frame, or null where the frame is kind 02
kind        silence, word, object, or nothing, read from what the reply
            opens to, and nothing where the frame is kind 02
opens       what the reply opens to, where the hand holds the lid's secret,
            and null where nobody holds it
wrote       whether the ward wrote while judging, from two `digest` answers,
            one before the arrival and one after, compared for equality
blueprint   on a record whose reply carries a seen, the shape that digest is
            taken over
```

A verifier compares `reply` and `wrote` and nothing else, because it holds
no lid's secret. `kind`, `opens` and `blueprint` are what the hand read
while recording, so a reader of a record sees what its bytes say. Whether
the being was reached is the bit beside the bytes, and no record carries
it: chapter 8 leaves it to each kit's own tests, since no stranger sees it.

A record of `vectors/tcp.json` is one frame, on its own, and what a side
made of it.

```
name        what this frame is
at          the side that reads the bytes, listener or dialer
frame       the frame's bytes, hex, length and body together
fill        where present, { byte, count }: the frame goes on with count
            bytes of that value, so a large box is written by its length
length      the body's length, as the four bytes say it
kind        the kind byte, absent where the body has none
id          the dialer's id for the ask this frame belongs to, absent where
            frame? is false
ward        on an ask, the 128 hex pk the frame routes by, absent where
            frame? is false
box         the box's length, absent where frame? is false
frame?      whether these bytes are a frame at all
closed      whether the side that read them closes the connection
carried     on a frame, whether the side carries what it holds, to the door
            or to the ask whose id it copies, and false for a kind the side
            does not read
```

A door record is generated from one story that two kits agreed on, so it is
a line of the scenarios frozen and never a generator's invention. A tcp
record is written from chapter 6 alone: the carrier never opens a box, so
its boxes are opaque bytes and it needs no story and no entropy.

## 9. What the harness is not

None of this is the protocol. The stand program, the root channel, the
harbor's verbs, the partition file and the fixed stream are reachable only
from a harbor that is in the harness. Nothing here adds a byte to a box, a
field to a payload or a kind to a frame, so a kit with the whole harness
exposes on the wire exactly what a kit without it exposes. A door replayed
under fixed entropy is the door as it stands.
