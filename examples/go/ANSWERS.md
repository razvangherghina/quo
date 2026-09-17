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
3. **The zero head.** The target named by `reach` on `ward`. Without it
   nothing answers, and every zero-head ask is case 4. Reason: the harness
   fixes this.
4. **Asks judged at once.** One. A single mutex holds every door and every
   standing, so each arrival, from `arrive` or from any TCP connection, is
   judged alone and checked once. Reason: the second check buys nothing
   when nothing races.
5. **Names.** `Kit`, `Ward`, `Heir` (the occupant's relation), `Standing`
   (the standing's relation), `Sent` (one sealed ask), `Target`, `Read`.
   A relation at the door is named by the name `invite` gave; at the
   standing by the asking ward, the far ward pk and the heir pk.

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

12. **Does the door answer.** Always, with a reply. A carrier gives nothing
    only for a ward pk the program does not stand.
13. **`seen`.** `null`, except behind `marked`, which writes `"1"` on a
    named ask as the harness fixes.
14. **The empty ask.** Behind `echo` and `marked`, the object `{}` with
    `seen` null. Behind `null`, the object null. Behind `silent`, silence.
15. **Reply text.** `{"object":<value>,"seen":<seen>}`, in that order, with
    no whitespace of its own. `echo` writes the args' bytes exactly as they
    arrived, whitespace included. A word is `{"quo":"<word>"}`.
16. **Padding.** None is written. Every text is read with the whitespace
    RFC 8259 allows.
17. **Time of a refusal.** Not equalised. Every stranger's case seals the
    same sixteen bytes, but cases that end earlier return earlier. Reason:
    this kit is an example, and a timing floor is a deployment's choice.
18. **Its own eyes.** Nothing is logged per arrival. stderr carries only a
    failure to write an answer or to open a listener.

## What a kit asks

19. **Invitations.** Handed in and out as the harness's JSON object. The
    minting ward keeps no copy. The standing checks the four fields' hex,
    that the secret gives the heir pk, that the lock passes FIPS 203's
    encapsulation key check, which `crypto/mlkem` makes, and that the
    padlock takes a seal, and refuses anything else as `bad request`.
20. **A knock that brought no object back.** After nothing, the knock is
    sent again as the same bytes. After silence, a word or a reply that did
    not open, the standing asks under the key the knock announced and the
    knock's edge key. After each further non-object it alternates between
    the two. Each retry happens only when asked to ask again.
21. **How long an asker waits.** Five seconds to dial a far ward, then ten
    seconds for the reply to an ask, then nothing. A closed connection is
    nothing at once.
22. **Two sends on one relation.** Each send carries its own sealed ask and
    lid secret and number. Numbers come from one counter per relation, so
    no two asks share one, and the standing keeps the highest number it
    moved on, so a late object to an older ask moves nothing.
23. **What the kit tells its own code.** A `Read` whose `Kind` is `object`,
    `silence`, `quo` (with `Word`) or `nothing`.

## What a kit carries

24. **Carriers.** Quo over TCP alone, as listener and dialer. The listener
    binds `127.0.0.1` on a port the system chooses. The dialer keeps one
    connection per address, redials after it closes, and numbers its asks
    per connection.
25. **Where a ward is reached.** Only from `route`. A ward with no route is
    not delivered to.

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
