# Quo

Quo is a protocol that lets an object ask another object and get an
answer, without knowing whether that other object is in the same process,
on the same device, or on another planet. It is three words, two of which
are beings: a harbor boots wards, a ward keeps beings and judges its door,
and a being is one ordinary object with one voice. Nothing else is Quo.

This repository is the protocol and nothing that runs it.

- `SPEC.md` is the whole truth, in no language. It assumes nothing from
  any other document, and a kit in any language is written against it and
  against nothing else.
- `vectors/` is four files of fixed bytes: the arithmetic, the framing,
  the wire and the door's thirteen cases. A kit reproduces them or it is
  not this protocol.
- `verifier/` is one program that holds no key. It replays the door's
  cases against a kit standing in vector mode at an address, and reports
  what differed, byte for byte. `node verifier/cli.js <url>` from a shell,
  or the same run in a tab at [quo.systems/verify](https://quo.systems/verify/).

Quo publishes no code and no kit. Anyone may write a kit, in any language,
and a kit is Quo when its door answers the vectors. Kits that pass are
listed at [quo.systems/kits](https://quo.systems/kits/) by a run anyone can
repeat.

The spec has no version. It is rewritten in place to say what is, and at
1.0.0 it is frozen once.

Apache-2.0, held by Razvan Gherghina. `spec@quo.systems`.
