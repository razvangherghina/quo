# Quo

A protocol for one object to ask another and get an answer, without knowing
whether the other is in its process, on its device or on another planet.
Three words: a harbor boots wards and carries bytes, a ward is its seed and
its partition and judges its one door, a being is one ordinary object with
one answer.

This repository is the protocol, and the least that proves the text is
enough.

- `SPEC.md`: the whole truth. A kit, Quo in any language, is written
  against it alone.
- `KIT-SPEC.md`: every choice the spec leaves to a kit, as questions.
- `SCENARIOS.md`: the claims two kits must agree on when they speak to each
  other.
- `vectors/`: the bytes a kit reproduces or it is not Quo, the arithmetic,
  the framing, the door's cases and the TCP frames, with `HARNESS.md`, the
  adapter a kit exposes to be replayed.
- `verifier/`: replays the door's cases against a kit's stand program and
  reports what differed, byte for byte, holding no key.
  `node verifier/cli.js -- <stand>`.
- `examples/`: two kits, JavaScript and Rust, written cold from the text,
  and the world of `SCENARIOS.md` between them. Scholastic, not a library
  and not a reference: Quo ships none. `examples/README.md` says how to run
  both kits, the world and the verifier from this folder, with Node 24,
  Rust and, for containers, Docker.

Anyone may write Quo, and no list of kits is part of it. The spec has no
version until 1.0.0, when it is frozen once.

- [quo.systems](https://quo.systems): the protocol, read in a tab

Apache-2.0, held by Razvan Gherghina. `spec@quo.systems`.
