# Quo

Quo is a language spoken in bytes. A door is one function: bytes in, bytes
or nothing out. Quo is what those bytes mean: a few JSON shapes and six
algorithms. How the bytes travel, and what stands behind a door, are not
Quo's.

- `SPEC.md`: the whole of Quo. A kit, Quo in any language, is written
  against it alone.
- `KIT-SPEC.md`: every choice `SPEC.md` leaves to a kit, as questions.
  Quo answers none of them.
- `CARRIER-TCP.md`: one way to carry the bytes over TCP. Published beside
  the spec, and not part of it.
- `CARRIER-WEB.md`: one way to carry the bytes over HTTP and WebSocket,
  where TCP cannot go. Published beside the spec, and not part of it.
- `IMAGINE.md`: a picture of Quo for a first reading. The spec decides, and
  the picture does not.
- `TYPES.md`: the same spec read as types, for an exact reading. GraphQL
  is its notation and nothing more: nothing in Quo runs over it. The spec
  decides, and the types do not.
- `VERIFIER.md` and `verifier/`: a checker any kit may run. It says where a
  kit departs from `SPEC.md`, and nothing about whether the kit is good.
  Passing it is necessary and never sufficient.
  `node verifier/cli.js -- <stand program>`, with Node 24 and nothing else.
  A stand program is one executable answering the requests of
  `vectors/HARNESS.md` on stdin and stdout.
- `vectors/HARNESS.md`: those requests in full. `vectors/arithmetic.json`:
  the six algorithms against their own standards.
- `examples/`: kits in several languages, each written cold from these
  documents, each one example among equals. None is a reference.

Anyone may write a kit. No list of kits is part of Quo. The spec has no
version until 1.0.0, when it is frozen once.

Quo is read at <https://quo.systems>.

Apache-2.0, held by Razvan Gherghina. `spec@quo.systems`.
