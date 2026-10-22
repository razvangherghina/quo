# The Rust kit

A kit of Quo in Rust, written cold from the published documents and the
verifier alone. It is one example among equals: none is a reference, a
library or a product, and none is meant to be imported. `ANSWERS.md` is its
answer to every question of `KIT-SPEC.md`.

| Fact | This kit |
| --- | --- |
| Toolchain | Rust 1.98, edition 2021 |
| Depends on | the algorithms' crates |
| Carries | `tcp` |
| Build | `cargo build` |
| Stand program | `target/debug/stand` |
| Its own tests | `cargo test` |

From this folder, the verifier judges the stand program after its build:

```bash
node ../../verifier/cli.js --cwd . -- ./target/debug/stand
```
