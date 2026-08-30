# Changelog

The JavaScript kit, published as
[`@quo-systems/js`](https://www.npmjs.com/package/@quo-systems/js).

Nothing here carries a compatibility promise before 1.0.0. The wire may move,
and a version is the only safe thing to depend on.

## 0.0.3

- The kit is published from CI with npm provenance, so the package links back
  to the commit and the build that produced it.
- Ships `NOTICE`, and declares `repository`, `bugs` and `sideEffects`.
- The constitution and both kits are published together at
  [github.com/razvangherghina/quo](https://github.com/razvangherghina/quo).
- The corpus cites the constitution at its published address, so the
  provenance resolves for everyone who receives the vectors rather than only
  inside the tree that emits them.
- The bench runs on Node 20, the oldest version the kit claims. It did not
  before: the test script quoted its glob, and Node's own runner only learned
  to expand one in 22.

0.0.2 was never published.

## 0.0.1

First publish. The canonical blueprint notation, the wire encoding of the
closed types, the arithmetic, the envelope, the warden and the carriage, with
the listening door behind its own `./door` export. Zero dependencies. Ships the
vector corpus the kit is judged against.
