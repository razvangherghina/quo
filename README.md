# Quo

**Quo is a small, open protocol for proving by whose authority a message was
sent** — with keys and sealed letters instead of accounts, logins and master
keys.

It answers exactly one question — _by whose authority?_ — and refuses every
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
  Go kit, written from the constitution's text alone by builders who had not
  seen the first kit. It is imported as `quo.systems/kit`:

  ```
  go get quo.systems/kit
  ```

  Go 1.24 or newer. Because Go resolves an import path to a repository root,
  the module is published from a repository of its own,
  [github.com/razvangherghina/quo-go](https://github.com/razvangherghina/quo-go),
  emitted from the tree here.

The two kits exchange real sealed messages over a real socket and derive
identical digests. That is the proof the constitution is implementable from its
text rather than from anyone's source.

## Status: pre-1.0 working draft

The law is written and complete enough to implement from, and it is still being
argued with — against two working implementations, against a vector corpus, and
against anyone willing to attack it. Articles have moved and more will.

What that means for you: the ideas are stable enough to build a real
understanding on, and the exact spellings are not yet stable enough to ship a
product against without talking to the author first. Pin an exact version of any
kit you depend on.

## Implementing it

Quo binds exactly one thing: **interoperability**. A builder who implements
every article, in any language, produces a Quo that speaks to every other. What
an implementation could do differently without a second implementation ever
noticing — how it stores, how it hosts, how custody is kept — belongs to that
implementation's own papers and binds no one else. Nothing outside the
constitution binds an implementation.

Where bytes are pinned they are pinned exactly; where a choice is left open it
is named as open.

Each kit ships the vector corpus it is judged against, under `vectors/`. A third
implementation in a third language can read those files and prove it agrees on
the bytes. A corpus pins bytes and cannot pin judgment, so the crossing between
two kits doing real work is what finds the rest.

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

Razvan Gherghina — [info@factcurier.ro](mailto:info@factcurier.ro) ·
[linkedin.com/in/razvangh](https://www.linkedin.com/in/razvangh/) ·
[quo.systems](https://quo.systems)

Security reports go to the address in
[SECURITY.md](https://github.com/razvangherghina/quo/blob/main/SECURITY.md).
How a version is cut is in
[RELEASING.md](https://github.com/razvangherghina/quo/blob/main/RELEASING.md);
what is wanted from a contributor is in
[CONTRIBUTING.md](https://github.com/razvangherghina/quo/blob/main/CONTRIBUTING.md).
