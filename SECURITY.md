# Security Policy

Quo is a protocol whose security rests on sealed bytes. Six algorithms
carry it: Ed25519, X25519, ML-KEM-768, SHA-256, AES-256-GCM and
HKDF-SHA-256. A flaw here is a flaw in every kit at once.

## Reporting

**Do not open a public issue.**

Report through GitHub's private vulnerability reporting, on the Security
tab of this repository, or by email to `spec@quo.systems`.

Say which document and which sentence, and give enough detail to
reproduce. You will get a first reply within five working days.

## What is in scope

- A sequence of bytes that opens a box it should not open.
- A head that passes a door it should not pass.
- A replay the count does not refuse.
- A key derivation, a nonce or a seal that two kits could read two ways.
- Any use of the six algorithms that departs from their own standards.
- A record in `vectors/arithmetic.json` that is wrong.
- A verifier that passes a kit which is not safe.

A problem in one kit's implementation is that kit's, not Quo's. Report it
to the people who wrote it. If you cannot tell which it is, report it
here and say so.

## Versions

The spec has no version until 1.0.0, when it is frozen once. Until then
there is one current state of these documents, and a fix lands in it.
There are no backports and nothing to support.

## Disclosure

A confirmed flaw is fixed in the documents and the fix is published here.
Credit is given unless you ask otherwise.
