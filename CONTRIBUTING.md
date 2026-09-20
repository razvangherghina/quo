# Contributing to Quo

Quo is a protocol. This repository holds the spec, the questions the spec
leaves to a kit, two carriers published beside it, a verifier, the
vectors, and example kits.

## Anyone may write a kit

You do not need permission, and you do not need to tell anyone. No list
of kits is part of Quo, and no kit is a reference. `SPEC.md` is written
so that a kit can be built from it alone.

If your kit passes `verifier/` and meets another kit both ways, it
interoperates. That is the whole of the claim Quo makes.

Your kit belongs in your own repository. The example kits here are not a
collection to join. Each was written cold from these documents, to show
that the documents are enough.

## Disputing a sentence

This is the most useful thing you can do.

Open an issue. Name the sentence, quote it, and give the two readings you
can see. A sentence that two implementers read two ways is a defect in
the spec, whatever it was meant to say.

The same applies to `KIT-SPEC.md`. If it asks a question the spec has
already answered, or fails to ask one the spec leaves open, say so.

## Reporting a verifier defect

`verifier/` checks a kit against `SPEC.md`. If it passes a kit that
departs from the spec, or fails one that follows it, open an issue with
the smallest stand program that shows it.

The verifier is a method offered, not part of Quo. Passing it is
necessary and never sufficient.

## About pull requests

The spec is written by hand and changes rarely. A pull request that
arrives without discussion usually cannot be merged as written, however
good it is. Open an issue first.

This is not a closed door. It is an honest description of how the work
runs, so that nobody spends an evening on a patch that was never going
to land.

## Before 1.0.0

The spec has no version until 1.0.0, when it is frozen once. Until then
it can move, and a good argument moves it.

## Security

Do not open a public issue for a security problem. See
[SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the
Apache License, Version 2.0, the same terms as the rest of this
repository.
