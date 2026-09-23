# ANSWERS

This kit answers every question of `KIT-SPEC.md`. Each answer says what the
kit does and why.

## What stands behind a door

**1.** Behind each ward's door stands one reach for each heir, and at most
one more for the zero head, named when the heir or the ward is made. A
reach is one of the five of `vectors/HARNESS.md`: echo, marked, moved, null
and silent. An arrival is handed over as `named`, whether `method` is present,
with the raw bytes of `args` and their depth. The reach returns a reply
text or silence, and never sees the relation's number or keys. The reason
is that the harness names these five and nothing more. A reach is the least
a door can stand behind it and still be driven.

**2.** Nothing behind a door has a way back to what made the ward, so no
path takes that edge away. The seed is hashed once when the ward is stood
and dropped. Only the derived keys stay in the `Door`, and the program that
stood the ward holds the door in its map. The reason is that a reach needs
no such edge, and what is never made needs no removal.

**3.** The `reach` given on `ward` answers the zero head, and a ward holds
at most one. Without one, nothing answers, and a zero-head ask is case 4.
The same sealed bytes presented twice are answered twice, because the zero
head keeps nothing: no key, no number and no record of an arrival. The
reason is that the zero head is the one head a door holds no relation for.
It has nowhere to remember a box it saw before.

**4.** One at a time. Every arrival runs under one mutex, so the door
checks once and the keys move once. The reason is that this is the least
that keeps the move chapter true. A kit that judges one at a time answers
two sent together as it answers two sent apart.

**5.** `Door`, `Standing`, `Invitation`, `Reach` and `Read`. A relation is
a `Heir` entry keyed by heir pk on the door's side, and a `Standing` keyed
by the asking ward with the whole invitation on the asker's side. The
reason is that no name a kit gives crosses a door. Each name is chosen for
the reader of this code.

## What a kit keeps

**6.** The seed arrives as text on the `ward` request and is hashed to
thirty-two bytes. The lock is made from drawn bytes when the ward is stood,
one lock per ward, and is held in memory alone. The ward does not keep an
heir's secret after it gives the invitation. The reason is that a knock's
ciphertext is to the lock of the invitation it came from. One lock per ward
therefore answers every invitation that ward minted. The heir secret is the
holder's from then on.

**7.** `/dev/urandom`, read with the standard library. ML-KEM key
generation and encapsulation take those bytes through the crate's
deterministic entry points. The reason is that the operating system is the
one source this kit trusts without carrying a generator of its own.

**8.** For each heir, in a map in process memory: fresh, or spent with the
held key, the vouched key, the open and offered edge keys, and the highest
number honoured. None of it survives a restart. The reason is that the keys
of a relation fix what is held. A program the harness starts and stops has
nothing to gain from a store on disk.

**9.** A door stops holding an heir when `release` names it. A fresh heir
is forgotten entirely, since it bound nothing and no ask under it could
hear `removed`. A spent heir's keys move to a map of keys kept at removal,
so an ask signed by one still hears `removed`.

**10.** For the life of the process. The reason is that the process is the
whole life of every relation this kit keeps. Nothing outlives it, and a
shorter term would answer no question the verifier asks.

**11.** None. Only a number above the highest honoured is honoured, and
every other hears `repeated`. The reason is that the highest is one number
to hold. The set of numbers seen would grow without bound.

## What a kit answers

**12.** The door always answers, with a reply for every arrival. A
stranger's silence and a box that does not open are answered too. A reply
to an ask whose lid takes no seal is sealed to a lid nobody holds. The
carrier gives nothing only where the listener stands no ward under the pk,
and writes frame 02 there. The reason is that a door which answers
everything puts no case on the wire.

**13.** The kit writes `null`, except for the `marked` reach, which writes
`"1"` on every ask, the empty ask included. The reason is that the harness
fixes the `seen` of every reach. No reach ever changes its `seen`,
and no describe here ever moves.

**14.** With echo, marked, moved and null, the object is the describe
`{"asks":[]}`. It is the same to every asker and names no `lang`. With
silent, silence. The reason is that the harness lists no method a reach
answers, so the describe lists none. So no entry names any named ask, and
each reach answers one as the harness fixes: echo, marked and moved its
`args`, null the object `null`, silent silence.

**15.** `{"object":<value>,"seen":<seen>}`, object first, with no
whitespace between tokens. Under the moved reach, `,"at":[...]` follows
`seen`. A word is `{"quo":"<word>"}`. The reason is that
the order and the spacing are the kit's. The shortest spelling leaves least
to write and least to get wrong.

**16.** The kit pads nothing. The reason is that padding hides a length
this kit has no call to hide. Every kit reads padding whether or not it
writes any.

**17.** No. Every stranger's case returns as soon as it is found, and no
timing is equalised. The reason is that the time a case takes is on no
wire, so the spec asks nothing of it.

**18.** The case number of the last arrival, written to stderr on each
arrive. The reason is that stderr crosses no door. A case named there says
nothing to a stranger.

## What a kit asks

**19.** The invitation is returned on the `invite` answer and nowhere else.
The minting kit keeps no copy, only the heir pk. The reason is that a door
reads no route from an invitation. The ward needs nothing of it but the
name of the heir.

**20.** After a knock that brought no object back, the next ask is a
recovery ask. It is signed by the announced key, under the knock's edge
key, with no ciphertext. Where that ask brings back silence or nothing, the
ask after it is the knock again as the same bytes. The two alternate. A
word on a recovery ask proves the knock bound, and recovery goes on under
the announced key. A knock whose frame never left, or that was answered 02,
is undone as if never sealed. The reason is that the two asks tell the two
worlds apart. The recovery ask is heard only where the knock bound, and the
knock again only where it did not.

**21.** Five seconds from each dial. Where `at` is tried, each address it
dials gets its own five seconds. The reason is that no time is on the wire.
Five seconds is long enough for a listener on one machine, and short enough
that a run does not hang.

**22.** An ask carries the next count number, one above the ask before it,
starting at one. A knock again as the same bytes carries the number and the
key of the knock it repeats. Every other ask announces a newly drawn key in
`next`, so it offers a move whether or not it gets one. The standing is
held for the whole of a send, from sealing until the read. That is how two
sends on one relation stay apart.

The standing moves only where an object is read, once per ask. It moves to
the key that ask announced and to the edge key that follows the reply. Of
the keys it moved from it keeps nothing, since the former signing key and
the former edge key are dropped as the move is made. Where the asks after a
move meet silence, the standing stays where it moved to. It asks again
under the same keys with the next number. The reason is that a door admits
the key held and the key vouched for. An object read means the door made
the move, and one send at a time leaves no later move past it. So an ask
under the key just announced is admitted.

**23.** A `Read` enum: `Object{object, seen, at}`, `Silence`, `Word(String)`
and `Nothing`. The reason is that the three words cross a door and the
kit's own spelling for them does not. An enum says them to Rust alone.

## What a kit carries

**24.** Quo over TCP alone, plain and never inside TLS, as a listener on
127.0.0.1 and as a dialer, one connection for each send. It listens nowhere
on the web, so no path, origin or status is its to choose. It stands
neither form of Quo over the web. So `listen` of `http` or `ws`, and a
route to an address of either, are `bad request`. The reason is that a box
carries its own seal and its own signature, so TCP needs nothing under it.
One carrier is enough to be judged as a carrier.

**25.** The kit learns a ward's address three ways. The first is the
`route` request, a map from ward pk to one `tcp://host:port` held in
memory. The second is the `at` of a reply, kept on the relation's standing.
The third is the `at` of the invitation a send is made on. A route is
trusted first and is dialed alone. Next come the addresses of the last
reply that gave any, and last the invitation's. The reason for that order
is that a route is the kit's own word, and a reply's `at` is signed by the
ward. An invitation's `at` may have been written by whoever carried it.

Once the program holds its listener, every invitation it mints carries
that listener's `tcp://127.0.0.1:port` as the one address in `at`. Before
that it writes no `at`. Its door writes `at` in a reply only under the
moved reach, which writes `["tcp://127.0.0.1:9"]` on every object. No other
reach writes one. The reason is that the harness fixes what moved writes,
and a door that answers its own ward's listener gives an asker no address
it lacked.

A reply's `at` is read as an invitation's is. One that is no array reads
as absent, and the reply is still an object. Of an array, the kit keeps the
`tcp` addresses in their order and skips every other entry. Where it keeps
at least one, those addresses replace the ones it dials for that relation.
Where it keeps none, it dials what it dialed before. The reason is that a
reply's `at` says where the ward that signed it is reached now. An `at`
that names no address this kit dials tells it nowhere to go, so it forgets
nothing for it.

With no route, the kit tries the `tcp` addresses it holds one after another,
in the order written. It skips every other scheme, every string that is no
`tcp://host:port`, and every element that is not a string. It moves to the
next address only where the one before delivered nothing for certain: the
connection never opened, the frame never left, or 02 came back. Once a
frame has left, the kit waits for that address alone and tries no other.
The reason is that a door honours a number once, whichever address carried
it. A box carried on after an address that may have heard it would spend
the number for nothing.

## What is not the kit's either

**26.** The kit gives them no meaning. `method` is sent as the JSON string
text the caller gave, and `args` as the object text the caller gave, byte
for byte. The reason is that their meaning is agreed between the two ends
of a relation. A kit that read them would be one of those ends. Its
describe names no `lang`, so its asks mean what `SPEC.md` says of them and
nothing more.

## What a kit reads

**27.** The door reads `args`, and a field beside the six, by the grammar
of RFC 8259 alone, at any depth. The scan is a loop over a stack of
brackets. Only the duplicate-key check recurses, on a text already known to
nest sixty-four containers deep at most. Any number the grammar allows,
lone surrogates, noncharacters and repeated keys are all taken there. None
of them makes a box a stranger's.

The echo and marked reaches echo `args` only where it nests sixty-four
containers deep or fewer and no object in it repeats a key. Past that the
reach chooses silence, and the choice moves the keys. The asker reads
`object` the same way, at any depth, lone surrogates and repeated keys
included. It hands it on as the text that came, with whitespace outside
strings removed. On the channel, `method` and `args` are taken by the same
grammar and sent byte for byte. The reason is that Quo reads nothing there.
Refusing a text the grammar allows would put the kit's taste in front of
the spec's silence.
