# ANSWERS

1. Each ward's door has one reach from `vectors/HARNESS.md` (echo, marked, null, silent) for each heir and one optional reach for the zero head, chosen when the heir or ward is made. An arrival is handed over as `named` (method present) plus the raw bytes of `args` and their depth; the reach returns a reply text or silence. Only the door reads the relation's number and keys; the reach never sees them.
2. The seed is hashed once when the ward is stood and dropped. Only the derived keys stay in the `Door`, and the program that stood the ward holds the door in its map. Nothing behind a door has a way back to what made the ward, so there is no edge to take away.
3. The `reach` given on `ward` answers the zero head, and there is one per ward at most. Without one, nothing answers, and a zero-head ask is case 4.
4. One ask at a time per program. Every arrival runs under one mutex, so the door checks once.
5. `Door`, `Standing`, `Invitation`, `Reach`, `Read`; a relation is a `Heir` entry keyed by heir pk on the door side, and a `Standing` keyed by the asking ward plus the whole invitation on the asker side.
6. The seed arrives as text on the `ward` request and is hashed to thirty-two bytes. The lock is made from drawn bytes when the ward is stood and is held in memory only. The ward does not keep a heir's secret after it gives the invitation.
7. /dev/urandom, read with the standard library. ML-KEM key generation and encapsulation take those bytes through the crate's deterministic entry points.
8. For each heir, in a process-memory map: fresh, or spent with the held key, the vouched key, the open and offered edge keys, and the highest number honoured. None of it survives a restart.
9. Only when `release` names the heir. A fresh heir is forgotten entirely. A spent heir's keys move to a map of keys kept at removal.
10. For the life of the process.
11. None. Only a number above the highest honoured is honoured.
12. The door always answers, with a reply for every arrival. The carrier gives 02 only when the listener stands no ward under the pk.
13. The kit writes `null`, except for the `marked` reach, which writes `"1"` on a named ask.
14. With echo and marked, `{}` and `seen` null. With null, the object null. With silent, silence.
15. `{"object":<value>,"seen":<seen>}`, object first, with no whitespace. A word is `{"quo":"<word>"}`.
16. The kit pads nothing.
17. No. Every stranger's case returns as soon as it is found, and no timing is equalised.
18. The case number of the last arrival, printed to stderr for each arrive.
19. The invitation is returned on the `invite` answer and nowhere else. The minting kit keeps no copy, only the heir pk.
20. After a knock that brought no object back, the next ask is a recovery ask: signed by the announced key, under the knock's edge key, with no ciphertext. If that ask brings back silence or nothing, the ask after it is the knock again as the same bytes. The two alternate. A word on a recovery ask proves the knock bound, and recovery continues. A knock whose frame never left, or that was answered 02, is undone as if never sealed.
21. Five seconds from the dial.
22. The standing is locked for the whole of a send, from sealing until the read. Each ask announces a newly drawn key, and the standing moves only when an object is read, once per ask.
23. A `Read` enum: `Object{object, seen}`, `Silence`, `Word(String)`, `Nothing`.
24. Quo over TCP only, as a listener on 127.0.0.1 and as a dialer, one connection for each send.
25. Only through the `route` request, a map from ward pk to host:port held in memory.
26. The kit gives them no meaning. `method` is sent as the JSON string text the caller gave, and `args` as the object text the caller gave, byte for byte.
27. The door reads `args`, and a field beside the six, by the grammar of RFC 8259 alone, at any depth: the scan itself is a loop over a stack of brackets, and only the duplicate-key check recurses, on a text already known to nest sixty-four containers deep at most. Any number the grammar allows, lone surrogates, noncharacters and repeated keys are all taken there, so none of them makes a box a stranger's. The echo and marked reaches echo `args` only when it nests sixty-four containers deep or fewer and no object in it repeats a key. Past that the reach chooses silence, and the choice moves the keys. The asker reads `object` the same way, at any depth, lone surrogates and repeated keys included, and hands it on as the text that came, with whitespace outside strings removed. On the channel, `method` and `args` are taken by the same grammar and sent byte for byte.
