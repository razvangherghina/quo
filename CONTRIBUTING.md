# Contributing

Quo is a constitution and two kits that prove it. What is most useful here is
probably not a pull request.

## What is wanted most

**A third implementation.** The whole claim of this project is that the
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

Please do not send redesigns of a kit's shape, new dependencies, or a rewrite
in another style. Both kits are deliberately zero-dependency and deliberately
small.

The constitution itself is not edited by pull request. Propose the change as an
issue with the failure it fixes; the text moves when the reasoning holds, and it
is rewritten from a running kit rather than ahead of one.

## Running the kits

```bash
cd kits/js && npm test
cd kits/go && go test ./...
```

Both must be green. The JS kit needs Node 20 or newer and has no install step —
there is nothing to install.

## Licence

Contributions are accepted under the Apache License, Version 2.0, the same
licence the project is published under.
