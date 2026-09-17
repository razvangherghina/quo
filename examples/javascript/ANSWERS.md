# Answers to KIT-SPEC.md

1. Behind a door stands one synchronous function per heir, and one for the zero head. The door hands it `{ method, args (raw JSON text), unread, by, heir }`, and the function returns `{ object: raw JSON text, seen }` or `null` for silence (`lib/quo.js`, `reaches`). `unread` is true where this kit does not read `args` (question 27).
2. The ward holds its own keys. The things behind the door get no handle back to the ward, and nothing removes one because none is given.
3. Nothing answers the zero head unless the ward is made with a `zero` function. The harness sets it from `reach` on `ward`.
4. One ask at a time. `Ward.arrive` is synchronous from opening to moving, so the second check is never needed.
5. The parts are `Ward`, `Standing`, `arrive`, `invite`, `release`. A relation is keyed by its heir pk in hex.
6. The seed is handed in as 32 bytes, or as text or bytes that get hashed. It is held in memory as derived key objects only. The lock is drawn when the `Ward` is constructed and is held in memory. The ward does not keep a heir's secret after giving the invitation.
7. `node:crypto` `randomBytes`, and Node's ML-KEM for the lock and each encapsulation.
8. In memory, in a `Map`, per heir: fresh, or `H`, `V`, `O`, `F` and the highest honoured number. Nothing survives a restart.
9. A door stops holding a heir when `release` is called (the harness `release` op).
10. Keys kept at removal are kept for the life of the process.
11. None. Only a number above the highest honoured is honoured, so every choice this door makes on a spent heir moves the keys.
12. The door always answers with bytes. It never gives nothing. Over TCP, an unknown ward pk, or a door that throws, is answered 02.
13. `seen` is whatever the function behind the door returns: `null` for `echo` and `null`, and `"1"` on a named ask for `marked`.
14. For `echo` and `marked`, `{}` with `seen` `null`. For `null`, `null`. For `silent`, silence.
15. `{"object":<raw>,"seen":<seen>}`, with no whitespace outside the raw object, and words as `{"quo":"<word>"}`. The raw object is written as it arrived or as the function made it, and is not parsed again.
16. No padding.
17. No. Refusals take whatever time they take. Case 1 is cheaper than case 8.
18. The refusing case and the word said go to a log function, which the harness sends to stderr.
19. The kit returns the invitation to its caller and keeps no copy. How it travels is the caller's business. An invitation whose lock fails FIPS 203's encapsulation key check (`lockOk`) is refused before anything is sealed to it.
20. After a knock that brought no object: if the reply was nothing, the same knock bytes go again. If it was silence or a word, the next ask is a probe under the own key and the knock's edge key. After that, knock and probe alternate until an object comes back. A word on a probe marks the relation as bound.
21. Five seconds per ask over TCP. Part one does not wait, because `read` hands the reply in.
22. Sends on one relation are chained one after another (`Standing.chain`). Each ask draws a new announced key and the next count number, starting at 1 for the knock. The standing moves only when an object comes back to an ask numbered above every ask it has moved on (`Standing.moved`).
23. `{ kind: "object" | "silence" | "word" | "nothing" }`, with `word` holding the word as spelled on the wire.
24. Quo over TCP only (`lib/tcp.js`), as listener and as dialer, with one connection per address.
25. By an explicit route table, `route` (ward pk to `host:port`). A ward with no route is not delivered to. The kit writes no `at` in its invitations and does not read one, so it tries no address from an invitation.
26. They mean nothing to the kit. `echo` sends `args` back as it arrived.
27. Inside `args` and `object`, and in any field beside a payload's six, the kit reads any JSON text the grammar allows, at any depth up to the box's size: below the second level a container is checked with an explicit stack, not recursion, and kept as raw text. Lone surrogates and noncharacters are taken as written. A repeated key inside a nested value is taken, and the last one wins where the kit looks. The one text the kit does not read is `args` that repeats a key among its own keys: `echo` and `marked` answer that ask with silence, a choice that moves the keys. On the asking side, an `object` of any depth and any repeats is read and handed on as written, whitespace between tokens removed.
