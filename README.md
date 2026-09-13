# Quo

Quo is a protocol that lets an object ask another object and get an
answer, without knowing whether that other object is in the same process,
on the same device, or on another planet. It is three words, two of which
are beings: a harbor boots wards, a ward keeps beings and judges its door,
and a being is one ordinary object with one voice. Nothing else is Quo.

This repository is the protocol and nothing that runs it.

- `SPEC.md` is the whole truth, in no language. It assumes nothing from
  any other document, and an implementation in any language, which the
  document calls a kit, is written against it and against nothing else.
- `vectors/` is four files of fixed bytes: the arithmetic, the framing,
  the wire and the door's thirteen cases. An implementation reproduces
  them or it is not this protocol.
- `verifier/` is one program that holds no key. It replays the door's
  cases against an implementation standing in vector mode at an address,
  and reports what differed, byte for byte. `node verifier/cli.js <url>`
  from a shell, or the same run in a tab.

Anyone may write Quo, in any language, and nobody's list is part of it:
the verifier is the whole test, and Quo names no implementer. Its own
examples, Quo written from this spec alone in JavaScript and in Rust,
stand in a repository of their own and on no registry.

The spec has no version. It is rewritten in place to say what is, and at
1.0.0 it is frozen once.

- [quo.systems/write](https://quo.systems/write/): the road to writing one
- [quo.systems/verify](https://quo.systems/verify/): the verifier in a tab
- [quo-examples](https://github.com/razvangherghina/quo-examples): the
  examples

Apache-2.0, held by Razvan Gherghina. `spec@quo.systems`.
