<!-- markdownlint-disable MD029 -->
# This kit's answers to KIT-SPEC.md

The Go kit in this folder, one program `stand`, standard library only. Each
answer is the kit's choice, with its reason. Each number is the number
`KIT-SPEC.md` gives the question.

## What stands behind a door

1. **What stands behind a door.** One `Target` per heir and one per ward
   for the zero head: a Go function handed the method, the parsed args and
   the args' bytes as they arrived, answering an object with its `seen` or
   silence. The kit provides four, `echo`, `marked`, `null` and `silent`,
   the names `vectors/HARNESS.md` sends. Reason: a function is the smallest
   thing that can stand behind a door, and the harness names nothing more.
2. **The way back to what made the ward.** None. A target is a plain
   function, holds no reference to the ward or the kit, and nothing removes
   what was never given. Reason: no target here needs one.
3. **The zero head.** The target named by `reach` on `ward`, one per ward.
   Without it nothing answers, and every zero-head ask is case 4. The door
   keeps nothing for the zero head: no signing key, no edge key, no number.
   So the same sealed bytes presented twice are answered twice, each answer
   sealed to the one lid those bytes carry. Reason: the harness fixes the
   target, and a head that names no relation has nothing to keep.
4. **Asks judged at once.** One. A single mutex holds every door and every
   standing, so each arrival, from `arrive` or from any listener, is
   judged alone and checked once. Reason: the second check buys nothing
   when nothing races.
5. **Names.** `Kit`, `Ward`, `Heir` (the occupant's relation), `Standing`
   (the standing's relation), `Sent` (one sealed ask), `Target`, `Read`.
   A relation at the door is named by the name `invite` gave; at the
   standing by the asking ward, the far ward pk and the heir pk. The
   carriers' parts are `address`, `frame`, `dialed` (a line a dialer holds)
   and `wsConn` (one end of a held line).

## What a kit keeps

6. **Seed and lock.** The seed is text from `ward`, hashed with SHA-256, and
   is not kept once the ward's keys are derived. The lock is drawn with
   `mlkem.GenerateKey768` when the ward stands, once. The ward keeps the
   heir pk and never the heir secret: it is drawn, put in the invitation,
   and dropped. Reason: what is not kept cannot leak.
7. **Drawn bytes.** `crypto/rand` for heir secrets, ephemeral secrets, lids
   nobody holds and the lock; `crypto/mlkem` draws its own for
   encapsulation. Reason: the operating system is the only honest source.
8. **What a door keeps.** In memory, per heir: its pk, fresh or spent,
   released or not, the key held, the key vouched for, the open and offered
   edge keys, the highest number honoured and its target. Nothing survives
   a restart. Reason: the harness names no restart, and a door that forgets
   departs from nothing.
9. **When a door stops holding a heir.** Only on `release`. The name is
   freed at once and may be invited again as a new heir.
10. **Keys kept at removal.** For as long as the program runs. Every ask by
    one of them, under a kept edge key, hears `removed`.
11. **Numbers below the highest.** None. Every number at or below the
    highest honoured hears `repeated`. Reason: one integer per relation, no
    window to keep.

## What a kit answers

12. **Does the door answer.** Always, with a reply. A listener gives
    nothing only for a ward pk the program does not stand: a nothing frame
    on tcp and the held line, status 204 on the post.
13. **`seen`.** `null`, except behind `marked`, which writes `"1"` on a
    named ask as the harness fixes.
14. **The empty ask.** Behind `echo`, `marked` and `null`, the describe
    `{"asks":[]}` with `seen` null, the same to every asker and with no
    `lang`. Behind `silent`, silence.
15. **Reply text.** `{"object":<value>,"seen":<seen>}`, in that order, with
    no whitespace of its own. `echo` writes the args' bytes exactly as they
    arrived, whitespace included. A word is `{"quo":"<word>"}`.
16. **Padding.** None is written. Every text is read with the whitespace
    RFC 8259 allows.
17. **Time of a refusal.** Not equalised. Every stranger's case seals the
    same sixteen bytes, but cases that end earlier return earlier. Reason:
    this kit is an example, and a timing floor is a deployment's choice.
18. **Its own eyes.** Nothing is logged per arrival. stderr carries only a
    failure to write an answer or to open a listener, and what Go's HTTP
    server says of its own connections.

## What a kit asks

19. **Invitations.** Handed in and out as the harness's JSON object. The
    minting ward keeps no copy. The standing checks the four fields' hex,
    that the secret gives the heir pk, that the lock passes FIPS 203's
    encapsulation key check, which `crypto/mlkem` makes, and that the
    padlock takes a seal, and refuses anything else as `bad request`. `at`
    is read as question 25 says, and nothing in it refuses an invitation.
20. **A knock that brought no object back.** After nothing, the knock is
    sent again as the same bytes. After silence, a word or a reply that did
    not open, the standing asks under the key the knock announced and the
    knock's edge key. After each further non-object it alternates between
    the two. Each retry happens only when asked to ask again.
21. **How long an asker waits.** Five seconds to reach an address, TLS
    and the WebSocket handshake included, then ten seconds for the reply to
    an ask, then nothing. A closed connection is nothing at once. Each
    address in `at` is given the same, one after another.
22. **Numbering, announcing, and two sends on one relation.** Numbers come
    from one counter per relation, raised once per sealed ask and never
    reused, and the knock carries the number one. Every ask announces in
    `next` a signing key drawn for that ask alone. A knock sent again as
    the same bytes carries the same number and the same announced key.
    Each send keeps its own box, lid secret, number, signing
    key, announced key and edge key, so two sends in flight read their
    replies apart. The standing keeps the highest number it moved on, so a
    late object to an older ask moves nothing. Of the keys it moved from it
    keeps nothing: the ask that moved it replaces the signing key and the
    edge key, and the knock is dropped. When the asks after a move meet
    silence, a word or nothing, the standing keeps sending under the key
    and edge key it moved to. Reason: the door admits the key held and the
    key vouched for, so the key just announced is admitted next, and a
    standing that went back would announce a key the door already holds.
23. **What the kit tells its own code.** A `Read` whose `Kind` is `object`,
    `silence`, `quo` (with `Word`) or `nothing`.

## What a kit carries

24. **Carriers.** Both published ones, and no other, with Go's standard
    library alone: Quo over TCP, and Quo over the web in both forms, the
    post on `net/http` and the held line written by hand on RFC 6455.
    - As a listener, one per scheme, `tcp`, `http` and `ws`, each on
      `127.0.0.1` at a port the system chooses, plain. A web listener
      answers at every path, and its address is written with the path `/`.
      The post answers 405 to a method other than `POST`, 400 to a body
      under sixty-five bytes, 413 to one over 1,048,640, 204 for nothing and
      200 with the reply's box. It sends no CORS headers, so it answers no
      page of another origin. The held line refuses a handshake that does
      not offer `quo`, and closes with status 1002 on bytes RFC 6455
      refuses, 1003 on a text message, 1009 on a message longer than the
      largest body, and 1008 on any other message that is no frame. It
      answers pings and never pings.
    - As a dialer, `tcp`, `http`, `https`, `ws` and `wss`, the secure two
      inside TLS under the system's roots, since the harness counts them as
      the same carrier. It keeps one line per address on tcp and the held
      line, dials it again after it closes, and numbers its asks per line.
      Each post is one request that follows no redirect. Reason: the
      standard library holds HTTP and TLS, and RFC 6455 is small enough to
      write where the library has none.
25. **Where a ward is reached.** From `route`, and from an invitation's
    `at`; the kit learns no address any other way.
    - Where a ward has a route, the kit dials the route alone.
    - Where it has none, the kit reads `at` in its order, skips every entry
      that is not a string, not a URI with a scheme, of a scheme it does not
      dial, or not written as that scheme's carrier writes it, and tries the
      rest one after another, never two at once, each given the waits of
      question 21. It stops at the first that answers with a reply, whatever
      the reply says. Reason: the first entry is the minting side's
      preference, and this kit trusts no other source over it.
    - The kit carries the same box to the next address after every nothing.
      It draws no line between an address it never reached and one that may
      have heard the box before the line closed. Reason: a door honours a
      number once, whichever address carried it, so a box that may have been
      heard costs at worst a `repeated` and never a second choice. The ask
      reads nothing when no address answered.
    - An `at` that is not an array is read as absent.
    - Once the program holds listeners, every invitation it mints carries
      `at` with each listener's address, `tcp` first, then `http`, then
      `ws`. With no listener, it writes no `at`. Reason: TCP carries the
      bytes with the least around them, and a reader that stands only the
      web still finds its own scheme further on.

## What is not the kit's either

26. **`method` and `args`.** The kit reads them only to hand them to a
    target. The four targets ignore `method` except to tell a named ask
    from the empty one.

## What a kit reads

27. **JSON inside `args` and `object`.** Any JSON text RFC 8259's grammar
    allows, of any length the size admits and any nesting: containers
    there are checked against the grammar without recursion and never
    parsed further. Lone surrogates, noncharacters and repeated keys there
    are taken. `echo` and `marked` answer every such `args` with its bytes
    as they arrived; nothing is refused beyond the grammar. A read `object`
    is handed on as its bytes as they arrived. Among a payload's or a reply
    text's own keys, a lone surrogate is kept as its code unit, so two keys
    are one name exactly when their code units are equal. Reason: reading
    nothing is the least code and the fewest refusals.
