# Contributing

Quo is a constitution and five kits that prove it. What is most useful here is
probably not a pull request.

## What is wanted most

**A sixth implementation.** The whole claim of this project is that the
constitution can be implemented from its text alone. Every implementation
written by someone who has not read an existing kit is worth more than any
patch. If you build one, say so — it belongs in the list on
[quo.systems](https://quo.systems).

**A silence in the law.** If two honest readings of an article produce two
implementations that cannot speak, that is the one failure an
interoperability-only protocol cannot afford. Open an issue with both readings
and what your implementation did.

**A vector the corpus should pin.** An exchange the kits agree on by accident
rather than by law.

## Pull requests

Welcome for the kits: a bug against a guarantee the constitution names, a
missing test case, a portability fix.

Please do not send redesigns of a kit's shape, or a rewrite in another style.
Every kit here is deliberately small.

A kit takes the five primitives the constitution names — Ed25519, X25519,
SHA-256, AES-256-GCM, HKDF-SHA-256 — from wherever its platform keeps them,
and nothing else that shapes what goes on the wire. The digests, the
encoding, the judgment and the refusals come from the constitution or the kit
stops being a proof of it. How many packages that costs is a fact about the
language, not a rule: JavaScript, Go and Zig carry all five in their standard
libraries and so take nothing, while Rust and Python reach for the usual
crypto libraries and nothing beyond them.

The constitution itself is not edited by pull request. Propose the change as an
issue with the failure it fixes; the text moves when the reasoning holds, and it
is rewritten from a running kit rather than ahead of one.

## Running the kits

```bash
cd kits/js     && npm test
cd kits/go     && go test ./...
cd kits/zig    && zig build test
cd kits/rust   && cargo test
cd kits/python && uv run --frozen --python 3.13 python -m unittest discover -s tests -t tests
```

All five must be green. Toolchains: Node 20 or newer, Go 1.24 or newer, Zig
0.16.0 exactly, Rust 1.88.0 or newer, and Python 3.13 through
[uv](https://docs.astral.sh/uv/). The JS and Go kits have no install step —
there is nothing to install.

## Licence

Contributions are accepted under the Apache License, Version 2.0, the same
licence the project is published under.
