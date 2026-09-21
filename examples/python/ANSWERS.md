<!-- markdownlint-disable MD029 -->
# Answers to KIT-SPEC.md

This kit is Quo in Python: `quokit/` and the `stand` program. Each answer
is followed by its reason.

## What stands behind a door

1. **What stands behind a door.** A reach: a function from the well-formed
   payload to a reply text, or to `None` for silence. The kit holds four,
   `echo`, `marked`, `null` and `silent`. It hands the reach the payload
   after the door has chosen to answer. Reason: the harness names these
   four, and one function shape is enough for all of them.
2. **The way back to what made a ward.** None. A reach gets the payload and
   nothing else. The `Ward` object holds its own seed, and only the program
   that built it can reach it. Reason: nothing behind the door here needs a
   way back.
3. **What answers the zero head, and does anything.** The reach named by
   `reach` on `ward` answers it. With none named, nothing answers, and an
   ask on the zero head is case 4. The zero head holds no relation, so the
   door keeps no number for it and reads none. The same sealed bytes
   presented twice are answered twice, each under a fresh reply ephemeral.
   Reason: the harness names the reach. A door that kept a number for the
   zero head would keep one for every stranger who ever sent one.
4. **How many asks judged at once.** One. One lock guards every door and
   every standing in the program, whether the ask comes from `arrive`, from
   the TCP listener or from the post. The door therefore checks once. Reason: this is
   the simplest correct choice, and Python's crypto here is fast enough.
5. **Names.** `Ward`, `Heir`, `Kept` (the keys kept at removal),
   `Standing`, `Listener` and `dial` for TCP, `PostListener` and `post` for
   the post, and `Address` for an address it stands. A heir is named by the harness
   string, and a relation by its heir pk. Reason: they mirror SPEC.md's
   words.

## What a kit keeps

6. **Seed, lock, heir secret.** A text seed is hashed with SHA-256, and the
   ward keeps the derived signing seed and X25519 scalar in memory. The
   lock is sixty-four drawn bytes, `d || z` of FIPS 203, made at the ward's
   first invitation and kept in memory. The ward does not keep a heir's
   secret after it builds the invitation. Reason: a ward has one lock, and
   drawing it lazily costs nothing. The heir secret travels to the
   standing inside the invitation; a ward keeping it could knock on its
   own heir as the standing, and its occupant needs only the heir pk.
7. **Drawn bytes.** `os.urandom`, for heir secrets, ephemeral secrets and
   the lock seed. The library draws its own bytes for encapsulation.
   Reason: the operating system's source is the right source.
8. **What a door keeps.** For each heir, in a Python object in memory: the
   key held, the key vouched for, the open and offered edge keys, and the
   highest number honoured. Nothing survives a restart. Reason: this is an
   example kit, and SPEC.md fixes what is held but not where.
9. **When a door stops holding a heir.** Only on the harness's `release`.
   Reason: nothing else in this kit asks for it.
10. **How long keys kept at removal are kept.** For as long as the program
    runs. Reason: `removed` is more useful to the other end than silence.
11. **Numbers below the highest honoured.** None. A number at or below the
    highest honoured hears `repeated`. A knock's number, any count number,
    sets the highest. The door therefore never makes a choice below the
    highest, and every choice moves the keys.
    Reason: this keeps one integer per relation and makes a replay plainly
    visible.

## What a kit answers

12. **Does the door answer.** Always, with a reply box. The door gives
    nothing only when there is no ward under the pk, which on TCP is a 02
    frame and on the post status 404. Reason: silence is bytes, and the kit has no cause to withhold
    them.
13. **`seen`.** Always `null`, except `"1"` from `marked` on every ask, the
    empty ask included, as the harness fixes. Reason: nothing behind these
    doors moves, so no `seen` ever changes.
14. **The empty ask.** `echo`, `marked` and `null` answer the describe
    `{"asks":[]}`, the same to every asker and with no `lang`. `silent`
    answers silence. So no entry names any named ask, and each reach
    answers one as the harness fixes: `echo` and `marked` its `args`,
    `null` the object `null`, `silent` silence. Reason: the harness says
    so.
15. **Reply text.** `{"object":<object>,"seen":<seen>}` with no whitespace
    between the kit's own tokens. From `echo` and `marked`, `object` is the
    bytes of `args` exactly as they arrived. A word is `{"quo":"<word>"}`.
    Reason: the shortest form, and echo keeps the bytes.
16. **Padding.** None when writing. Padding is read everywhere. Reason: the
    kit hides no lengths.
17. **Time per refusal.** No effort is made. Refusals that fail earlier
    return earlier. Reason: this is an example kit, and time is on no wire.
18. **What the kit keeps for its own eyes.** The door logs the case number
    of each stranger's reply on stderr. Faults in the program also go to
    stderr. Nothing else is kept. Reason: it is enough to debug.

## What a kit asks

19. **How an invitation reaches its holder.** It is returned to the caller
    as a dict, and the harness carries it. It carries `at` once the program
    holds a listener, as question 25 says. The minting ward keeps only the
    heir pk and the harness name. An invitation whose lock the library's
    FIPS 203 check refuses is no invitation, and `ask`, `read` or `send` on
    it answers `bad request`. Reason: a door reads no route from an
    invitation, and the harness is the only holder here.
20. **Recovering a knock that brought no object back.** The next ask on the
    relation goes under the announced key and the knock's edge key, with no
    ciphertext, and carries the new method and args. If that ask also
    brings no object, the ask after it is the knock sent again as the same
    bytes. The two alternate until an object comes back. Each ask is tried
    once, with no timer. Reason: the recovery ask succeeds where the door
    bound the heir. The resent knock succeeds where the door did not, and
    it is harmless where the heir is spent.
21. **How long an asker waits.** Thirty seconds for each read on the
    socket, over TCP and over the post alike. After that the read is
    `nothing`. A closed connection is
    `nothing` at once. Reason: this is long enough for a Python door and
    short enough for a harness.
22. **Numbering, announcing, two sends, and the keys moved from.** The
    count goes up by one on every box sealed, whatever comes back. The
    knock is numbered 1, and a resent knock keeps its number. Every ask
    announces a newly drawn key, on the knock and on every ask after it.
    One lock per relation keeps two sends apart: each send seals, dials,
    waits and reads before the next begins. The standing keeps the highest
    number it moved on, and moves on an object to a higher number only.
    Of the keys it moved from it keeps nothing. The signing key and the
    edge key it moved to replace what stood before. When the asks after a
    move meet silence, the standing stays where it moved to. It keeps
    asking under that key and that edge key, with the count going up, and
    it never falls back. Reason: a standing moves only on an object,
    so asks that overlap would race on its keys. The door admits the key
    moved from as the key held, so the standing needs no copy of it.
    Silence is a choice the door made, so it says the ask was read.
23. **What the kit tells its own code.** `Standing.take` returns
    `("object", value, raw, seen)`, `("silence",)`, `("word", w)` or
    `("nothing",)`. The harness gets `{object, seen}`, `{silence: true}`,
    `{quo: w}` or `{nothing: true}`. Reason: four outcomes, four tags.

## What a kit carries

24. **Carriers.** Quo over TCP, and the post of Quo over the web, each as
    listener and as dialer, with the standard library alone. The kit does
    not stand the held line: `listen` of `ws` and a `ws` or `wss` route
    answer `bad request`. A program holds at most one listener of each, on
    `127.0.0.1` at a port the system chooses. The TCP listener answers asks
    on one connection concurrently. The post listener answers any path,
    one thread per request. It answers 204 when the door gives nothing,
    404 for a ward it does not stand, 400 or 413 for a body too short or
    too long, 411 without a `Content-Length`, and 405 to any method but
    `POST`. It sends no CORS headers, so it answers no page of another
    origin. The dialer opens a fresh connection for each ask, TCP or HTTP,
    and closes it after the answer. It posts to `https` addresses as well,
    under the system's default TLS checks. Reason: TCP and the post need
    nothing beyond the standard library, while the held line would need a
    WebSocket written by hand. A connection per ask means ids never collide.
25. **Where a ward is reached.** From the harness's `route`, a table from
    ward pk to one address held in memory, and from an invitation's `at`.
    The kit learns no address any other way. Where a route names the ward,
    the kit dials the route alone. Otherwise it reads `at` when it is an
    array, skips every entry that is not a string, not a URI, or not a
    `tcp`, `http` or `https` address as its carrier writes it, and tries
    the rest one after another in the order written. It moves to the next
    when an address gives nothing, of any kind, and stops at the first
    reply. Each try waits as question 21 says. With no address left, the
    read is `nothing`. It carries the same box to the next address after
    one that gave nothing, whether or not that address may have heard it.
    Once the program holds listeners, every invitation it mints carries
    their addresses in `at`, the post first, then TCP.
    Reason: a route is the harness's own word and beats what an invitation
    carries, since whoever carried the invitation may have written its
    `at`. The order in `at` is the minting side's preference, so trying in
    that order honours it. A door honours a number once, whichever address
    carried it, so a second address costs nothing but the wait. The post
    goes first because it reaches where TCP cannot.

## What is not the kit's either

26. **`method` and `args`.** This kit gives them no meaning. The reaches
    echo `args` or ignore both. Its describe names no `lang`, so its asks
    mean what `SPEC.md` says of them and nothing more. Reason: their
    meaning belongs to the two ends.

## What a kit reads

27. **What is read inside `args`, and inside `object` beyond what a
    describe names.** The kit reads only a
    payload's or a reply text's own keys. Every container below them is
    checked against the grammar of RFC 8259, iteratively, with no bound on
    depth or length beyond the size, and its lone surrogates,
    noncharacters, repeated keys and numbers are taken as written. The door
    answers such an `args` as its reach chooses. `null` and `silent` never
    look at it. `echo` and `marked` answer silence, a choice, when two of
    `args`' own keys are one name, and otherwise echo `args` whatever lies
    deeper. The asker hands any `object` it read to its own code as the
    bytes that arrived. Reason: SPEC.md reads nothing there, so the kit
    builds nothing there, and echo declines only a shape it would not
    itself write as a payload's `args`.
