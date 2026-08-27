# Quo

**Quo is a small, open protocol for proving by whose authority a message
was sent** — with keys and sealed letters instead of accounts, logins and
master keys.

It answers exactly one question — _by whose authority?_ — and refuses
every other. You are keys, not an account. Your software lives in its own
house, with one door. Standing is granted by invitation, spent once, and
taken back in one act. Every message is a signed, sealed letter.
Strangers get silence, not an explanation of the locks. And no master key
exists — a system where override is possible is owned by whoever holds
the override, so Quo made it impossible, structurally.

This repository is the protocol itself, and nothing else: the text, the
licence, and no implementation.

- **[constitution.md](constitution.md)** — the whole of what binds an
  implementation. The world, the arithmetic, the voice, the envelope and
  the door, references, rights, succession, blueprints, contracts, the
  ground, custody, and the refusals.
- **[channels.md](channels.md)** — published beside it and part of the
  same law: everything two strangers need to exchange bytes of any size.

Read it at **[quo.is](https://quo.is)**, where the same law is presented
with worked examples.

## Status: pre-1.0 working draft

The law is written and complete enough to implement from, and it is still
being argued with — against a working implementation, against a
conformance suite, and against anyone willing to attack it. Articles have
moved and more will. Nothing here carries a version number yet.

What that means for you: the ideas are stable enough to build a real
understanding on, and the exact spellings are not yet stable enough to
ship a product against without talking to the author first.

## Implementing it

Quo binds exactly one thing: **interoperability**. A builder who
implements every article, in any language, produces a Quo that speaks to
every other. What an implementation could do differently without a second
implementation ever noticing — how it stores, how it hosts, how custody
is kept — belongs to that implementation's own papers and binds no one
else. Nothing outside the constitution binds an implementation.

Where bytes are pinned they are pinned exactly; where a choice is left
open it is named as open.

A conformance suite exists and runs against the first implementation. It
is not published yet; it goes out as the protocol approaches 1.0.0. If
you are implementing now and want it sooner, say so.

## Licence and ownership

Copyright 2026 Razvan Gherghina. Licensed under the Apache License,
Version 2.0 — see [LICENSE](LICENSE).

**The protocol is held by a person, not by a company**, deliberately. A
standard owned by the company selling its leading implementation is a
standard only for as long as that suits the company. Held by a person and
already published, this cannot be made unfree: anyone may implement it,
no permission is needed, and no licence already granted can be withdrawn.

Apache-2.0 is chosen over a documentation licence for its express patent
grant: implementing Quo carries a licence to whatever patent claims the
author holds over it, so no implementer can be ambushed later.

Note that copyright covers the text of these documents, not the ideas,
the wire format, or the field names — a protocol cannot be owned, and
this one is not trying to be.

## Contact

Quo is early, and the arguments it has not survived yet are the ones
worth having. If you are implementing it, or you think an article is
wrong, the author would rather hear it now than after 1.0.0:
[Razvan Gherghina on LinkedIn](https://www.linkedin.com/in/razvangh/).
