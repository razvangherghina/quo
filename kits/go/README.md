# Quo — the Go kit

The Go implementation of **Quo**, a small, open protocol that answers exactly
one question — _by whose authority?_ — and refuses every other.

```
go get quo.systems/kit
```

Go 1.24 or newer. The import path is `quo.systems/kit` and it always will be:
it names the protocol rather than a host, an account or a company, because no
vendor owns Quo.

Go resolves an import path to a repository root, so the module cannot be
fetched from this subdirectory. The same source is published whole, at the
root of [github.com/razvangherghina/quo-go](https://github.com/razvangherghina/quo-go),
and quo.systems serves the tag that points there. The two are one mechanism:
this tree is the source, that repository is the address.

## The packages

- `notation` — the arithmetic's names, digests and parsing.
- `arithmetic` — the keys, the signatures and the derivations.
- `envelope` — the sealed letter, and the two faces of it.
- `wire` — the bytes on the socket.
- `carriage` — carrying a letter from one house to another.
- `line` — the second road: framed envelopes over one persistent connection.
- `warden` — the door: who is admitted, on whose standing, and for what.
- `cmd/subject` — a small executable that speaks the protocol for you.

Every package ships its bench beside it:

```
go test ./...
```

The bench reads the pinned corpus from the JavaScript kit beside it, under
`../js/vectors`. Both kits are judged against the same bytes, and the crossing
between them is what proves the constitution is implementable from its text
rather than from anyone's source.

## Licence

Apache-2.0. See the `LICENSE` at the root of this repository.
