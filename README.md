# Quo

**My assistant can talk to yours — and to your software — without either of
us handing over a password, opening an account, or trusting a third party to
hold the relation.** Quo is the small, open protocol that makes that
reference real between two processes, in any language, on any host: a
signed, sealed letter from a voice you granted standing to, judged at your
own door, and taken back in one act when you choose.

Here is the whole of what a being looks like in the JavaScript kit. Quo never
looks inside the class; what crosses to strangers is its **blueprint**, and a
method the blueprint does not declare does not exist for a peer.

```js
const DOG = `Dog
  name() text
  logWalk(minutes int) bool
  invite() invitation
`;

class Dog {
  constructor(name) {
    this.dogName = name;
    this.walks = [];
  }
  name() {
    return this.dogName;
  }
  logWalk(minutes) {
    this.walks.push(minutes);
    return true;
  }
  async invite() {
    return this._quo.grant(this);
  }
}
```

A warden holds the dog, hands it `this._quo`, and stands one door in front of
it. Whoever you hand the invitation to — a person's ground, an agent's — can
accept it and call `logWalk` from across the internet, and nobody else can.
Revoke the standing and their key is dead at your door; no token expires, no
broker is asked.

Quo answers exactly one question — _by whose authority?_ — and refuses every
other. You are keys, not an account. Your software lives in its own house, with
one door. Standing is granted by invitation, spent once, and taken back in one
act. Every message is a signed, sealed letter. Strangers get silence, not an
explanation of the locks. And no master key exists — a system where override is
possible is owned by whoever holds the override, so Quo made it impossible,
structurally.

Read it with worked examples, a conformance proof and a demo that runs in your
own tab at **[quo.systems](https://quo.systems)**.

## What is here

- **[constitution.md](https://github.com/razvangherghina/quo/blob/main/constitution.md)**
  — the whole of what binds an implementation, in fifteen articles. The world,
  the carriage and its two roads, the notation and the wire encoding, the
  arithmetic, keys and standings, the warden and its blueprint, the describe,
  the envelope, the judgment, rotation, the news, and what a message may carry.
- **[kits/js](https://github.com/razvangherghina/quo/tree/main/kits/js)** — the
  JavaScript kit, published to npm as
  [`@quo-systems/js`](https://www.npmjs.com/package/@quo-systems/js). Zero
  dependencies: WebCrypto and `Uint8Array`, so the core runs unchanged in a
  browser tab, an edge worker or Node. Only the listening door touches Node.
- **[kits/go](https://github.com/razvangherghina/quo/tree/main/kits/go)** — the
  Go kit. It is imported as `quo.systems/kit`:

  ```
  go get quo.systems/kit
  ```

  Go 1.24 or newer. Because Go resolves an import path to a repository root,
  the module is published from a repository of its own,
  [github.com/razvangherghina/quo-go](https://github.com/razvangherghina/quo-go),
  emitted from the tree here.

- **[kits/zig](https://github.com/razvangherghina/quo/tree/main/kits/zig)** —
  the Zig kit, for Zig 0.16.0. It declares no dependency: `std.crypto` carries
  all five primitives the constitution names. Zig has no registry, so the kit
  is published as a tarball on a
  [GitHub release here](https://github.com/razvangherghina/quo/releases), with
  the `zig fetch` hash printed in the release notes for you to paste into your
  `build.zig.zon`.

- **[kits/rust](https://github.com/razvangherghina/quo/tree/main/kits/rust)** —
  the Rust kit, a workspace of small crates: the core, the three roads, and a
  `subject` binary another language can drive. Edition 2021, toolchain 1.88.0
  or newer. Published to crates.io as [`quo`](https://crates.io/crates/quo),
  which is the kit whole and holds no code of its own:

  ```
  cargo add quo
  ```

  A caller who wants one part takes that part instead — `quo-notation`,
  `quo-arithmetic`, `quo-wire`, `quo-envelope`, `quo-warden`, `quo-carriage`,
  `quo-line`, `quo-zero`. crates.io has no scopes, so the kit costs nine
  names rather than one.

- **[kits/python](https://github.com/razvangherghina/quo/tree/main/kits/python)**
  — the Python kit, Python 3.11 or newer, built and tested with 3.13. It takes
  one third-party import, PyCA `cryptography`, for the four primitives the
  standard library does not carry. Published to PyPI as
  [`quo-systems`](https://pypi.org/project/quo-systems/) and imported as
  `quo`, because PyPI's `quo` has been held since 2023 by an unrelated
  project:

  ```
  pip install quo-systems
  ```

- **[conformance](https://github.com/razvangherghina/quo/tree/main/conformance)**
  — the conformance kit, which is yours rather than ours. The scenarios, the
  runner that drives them, and `CONTRACT.md`, the nine verbs a kit answers to
  be driven. It needs Node and nothing else, and it carries no kit, so it
  cannot hold a sixth implementation to a habit of one of the five.

Five implementations of one text. Each was written from the constitution alone,
and each is judged against the same pinned vector corpus, which lives in
[`kits/js/vectors`](https://github.com/razvangherghina/quo/tree/main/kits/js/vectors).
Each kit also ships a `subject` executable that a driver in another language can
spawn, so any two kits can be made to exchange real sealed messages over a real
socket and shown to derive identical digests. That is the proof the
constitution is implementable from its text rather than from anyone's source.

## Status: pre-1.0 working draft

The law is written and complete enough to implement from, and it is still being
argued with — against five working implementations, against a vector corpus,
and against anyone willing to attack it. Articles have moved and more will.

What that means for you: the ideas are stable enough to build a real
understanding on, and the exact spellings are not yet stable enough to ship a
product against without talking to the author first. Pin an exact version of any
kit you depend on.

**What 1.0 waits on is a condition, not a date:** the wire freezes when a
sixth implementation, written by someone who is not the author from the
constitution and the conformance contract alone, passes conformance. Until a
stranger has built it from the text, the claim that it can be built from the
text is only a claim.

## Implementing it

Quo binds exactly one thing: **interoperability**. A builder who implements
every article, in any language, produces a Quo that speaks to every other. What
an implementation could do differently without a second implementation ever
noticing — how it stores, how it hosts, how custody is kept — belongs to that
implementation's own papers and binds no one else. Nothing outside the
constitution binds an implementation.

Where bytes are pinned they are pinned exactly; where a choice is left open it
is named as open.

The vector corpus every kit is judged against is in
[`kits/js/vectors`](https://github.com/razvangherghina/quo/tree/main/kits/js/vectors),
one JSON file per article it pins. A sixth implementation in a sixth language
can read those files and prove it agrees on the bytes.

**A corpus pins bytes and cannot pin a judgment**, which is why there is a
second instrument. The conformance lane drives one scenario file through every
kit with the clock and the randomness handed in, and pins both the envelope
bytes and the warden's resulting record — so a kit that decides differently is
caught, not merely found to be consistent with itself. Every article of the
law is accounted for there: driven by a case, or named with the reason it
cannot be.

**That lane is in `conformance/`, and it is there for you rather than for us.**
Write one program — your warden with its inputs exposed, reading one JSON
object per line and writing one back, nine verbs and no network, all of it in
[`conformance/CONTRACT.md`](https://github.com/razvangherghina/quo/blob/main/conformance/CONTRACT.md)
— and point the runner at it:

```
node conformance/conform.js -- ./my-subject
```

It reports, per field, what the law expected and what your kit answered. The
scenarios are the same bytes the five are driven through, unchanged.

## Licence and ownership

Copyright 2026 Razvan Gherghina. Licensed under the Apache License, Version 2.0
— see
[LICENSE](https://github.com/razvangherghina/quo/blob/main/LICENSE).

**The protocol is held by a person, not by a company**, deliberately. A standard
owned by the company selling its leading implementation is a standard only for
as long as that suits the company. Held by a person and already published, this
cannot be made unfree: anyone may implement it, no permission is needed, and no
licence already granted can be withdrawn.

Apache-2.0 is chosen over a documentation licence for its express patent grant:
implementing Quo carries a licence to whatever patent claims the author holds
over it, so no implementer can be ambushed later.

Note that copyright covers the text of these documents, not the ideas, the wire
format, or the field names — a protocol cannot be owned, and this one is not
trying to be.

## Contact

Razvan Gherghina — [razvan@quo.systems](mailto:razvan@quo.systems) ·
[linkedin.com/in/razvangh](https://www.linkedin.com/in/razvangh/) ·
[quo.systems](https://quo.systems)

Security reports go to the address in
[SECURITY.md](https://github.com/razvangherghina/quo/blob/main/SECURITY.md).
How a version is cut is in
[RELEASING.md](https://github.com/razvangherghina/quo/blob/main/RELEASING.md);
what is wanted from a contributor is in
[CONTRIBUTING.md](https://github.com/razvangherghina/quo/blob/main/CONTRIBUTING.md).
