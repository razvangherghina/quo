# IMAGINE

A picture of Quo, for a first reading. The picture carries no rule.
`SPEC.md` decides, and where the two seem to differ, the picture is wrong.

## The picture

Imagine houses standing all over the world, and further. A palace with a
hundred clerks. A wagon on the road. A single scribe at a desk with a
quill. A house on another planet. Nobody travels between them, and nobody
outside ever sees in. Who lives in a house, how many, how they are born,
how they keep their books and how they decide: all of it is the house's
own affair.

**The porter.** Every house has one porter at its gate. The porter does
one thing: a sealed envelope comes in, and the porter hands back a sealed
envelope, or nothing. The porter fits every lock, checks every key, stamps
everything the house says with the house's ring, and seals it so only
that visitor can open it. Who inside answers, and what, is the house's.

**The mirror.** Around the porter stand booths, each split by a mirror.
The mirror folds two far worlds until they stand one millimetre apart: one
side of the booth in this house, the other in a house you may never see. A
booth to the next room and a booth to another planet look exactly the
same.

**Purple booths.** A purple booth faces outwards. The house builds it,
fits its first lock, and gives its key to someone, any way it likes. The
key can be copied a thousand times. Someone far away steps in there, and
the house sees that the booth is occupied, and a key, never a name. The
first one to step in with that key whom the house lets in changes the lock
to a key of their own that nobody else has ever seen. From that moment
every copy of the first key is dead. The house can tear a purple booth
down.

**Red booths.** A red booth is one where this house holds the key. Its
other side is in someone else's house. Nobody appears in it unless this
house goes in. Every time it steps in, it may bring the next key, and the
lock takes it when an answer comes back. Only this house makes those keys,
so nobody on the other side can take the booth from it. The house can
forget a red booth.

**The grey booth.** The porter keeps one place with no lock at all.
Anyone may step in, and still signs what they ask with a key of their own,
which the porter checks and does not keep. Whether anyone inside ever
comes to it, and what they say, is the house's.

**Which booth is whose.** A house may seat someone at a booth when it is
built, and call that one its owner, or call nobody that. The porter does
not know the word. To the porter, every booth is a booth.

**Asking.** Whoever steps into a booth simply asks. On the other side, the
house decides whether to come to the mirror at all. It answers, or says
nothing. With an answer may come a small mark the house alone makes, so
the visitor notices when something changed.

**One visit, one question.** When the answer is given, the visitor is
gone. There is no line held open. The next question is a new visit. The
porter keeps the number of every visit it answered, for as long as the
booth stands, and a visit bearing a number already kept is turned away
with a word.

**A key that keeps moving.** Every visit may bring the next key. When the
house answers, the lock takes the new key beside the old, and the old dies
at the next visit made with the new one. So the booth opens to the key
used last or to the one just brought, and a visit whose answer is lost on
the way loses nothing. The visitor moves to the new key only when a real
answer comes back. A late visit, arriving after a newer one, moves no key
at all.

**Strangers.** No key, a dead key, a fake key, or noise: the porter hands
every one of them the same blank sheet, and writes nothing down. A
stranger cannot tell why.

**Both ways.** A purple booth never lets its house out, and a red booth
never lets anyone in. If two houses want to ask each other, each builds a
purple booth and hands the other its key.

**What nobody can force.** A house may answer once and never again,
forget its booths, or burn down. Visitors then hear nothing. No house is
ever made to speak.

## The picture in Quo

**A house** is a **ward**, and a kit may stand many. What runs it, and
what is inside, is not Quo's.

**The porter** is the **door**: one function, bytes in, bytes or nothing
out. Its ring and seal are the **ward key**, an Ed25519 key and an X25519
padlock, and the lock printed on a card is the ward's ML-KEM-768 key.

**The mirror** is what the bytes allow: an asker cannot tell from them
how far the door is.

**A booth** is a **relation**, and it runs one way. The purple side is
the door's, the red side is the **standing** that asks.

**The first key** is the **heir**, and the card it is printed on is the
**invitation**: `{ ward, heir, secret, lock, at? }`. It goes by any channel,
and `at` may write on the card where the house is reached.

**Stepping in with the first key** is the **knock**. It announces the
visitor's own key in `next`, and the first knock the door answers binds
it.

**A key that keeps moving** is `next`, and the door's two signing keys,
the one held and the one vouched for, beside two edge keys that follow
every answer and are never sent.

**Asking** is an **ask**: a `method` and `args` Quo never reads, sealed,
signed and numbered by `seq`, so each number is honoured once.

**The small mark** is `seen`.

**What comes back** is an object, silence, or one of three words,
`removed`, `unannounced` and `repeated`, said only to a key the door
knows.

**The blank sheet** is **silence**.

**The grey booth** is the **zero head**. What answers it is the kit's.

**The fold between two houses** is a **carrier**, and it is not Quo's.
One carrier over TCP is published beside the spec, so two strangers' kits
can meet.

**What nobody can force** is the rule under all of it: Quo says what bytes
mean when they are sent, and never that anyone must send them.
