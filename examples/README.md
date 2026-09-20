# Quo examples

Five kits, one language each, each written cold: by an agent holding only
the published documents and the verifier, and never another kit. Each is
one example among equals. None is a reference, a library or a product, and
none is meant to be imported.

Each kit's `ANSWERS.md` is its answer to every question of `KIT-SPEC.md`.
Where two kits answer differently and still speak to each other, the
difference is the kit's, and Quo allows it.

| Folder | Language | Depends on | Carries | Build | Stand program |
| --- | --- | --- | --- | --- | --- |
| `go/` | Go 1.27 | the standard library | `tcp`, `http`, `ws` | `go build -o stand .` | `./stand` |
| `zig/` | Zig 0.16 | the standard library and libc | `tcp` | `zig build` | `zig-out/bin/stand` |
| `python/` | Python 3.9 or later | `cryptography` | `tcp`, `http` | none | `./stand` |
| `javascript/` | Node 24 | Node's own modules | `tcp`, `http`, `ws` | none | `./stand` |
| `rust/` | Rust 1.98, edition 2021 | the algorithms' crates | `tcp` | `cargo build` | `target/debug/stand` |

Every kit writes its listeners' addresses in the `at` of the
invitations it mints. It reaches a ward through the `at` of an
invitation it takes, skipping the schemes it does not carry.

## Running

From this folder, each kit's own tests:

```bash
(cd go && go test ./...)
(cd zig && zig build test)
(cd python && python3 -m unittest discover -s tests)
(cd javascript && npm test)
(cd rust && cargo test)
```

Each kit against the verifier, after its build:

```bash
node ../verifier/cli.js --cwd go -- ./stand
```

Any two kits against each other, through the verifier's proxy:

```bash
node ../verifier/cli.js --two -- "$PWD/go/stand" -- "$PWD/rust/target/debug/stand"
```

The world is eight scenes of the five kits speaking to each other,
narrated. Alice and Bob, both ways. A ring through every kit. The mesh
of every pair. A front desk on the zero head. A stranger trying every
door. A reply lost on the way. A card that says where, reached through
its `at` over every carrier the two kits share.

```bash
node world.mjs
```

All of it at once, every build, test, verifier run, pair and the world:

```bash
node check.mjs
```

Every kit here passes the verifier alone, and every pair passes in both
directions. That is necessary, and it says nothing about whether a kit is
good.
