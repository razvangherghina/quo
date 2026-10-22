# The Zig kit

A kit of Quo in Zig, written cold from the published documents and the
verifier alone. It is one example among equals: none is a reference, a
library or a product, and none is meant to be imported. `ANSWERS.md` is its
answer to every question of `KIT-SPEC.md`.

| Fact | This kit |
| --- | --- |
| Toolchain | Zig 0.16 |
| Depends on | the standard library and libc |
| Carries | `tcp` |
| Build | `zig build` |
| Stand program | `zig-out/bin/stand` |
| Its own tests | `zig build test` |

From this folder, the verifier judges the stand program after its build:

```bash
node ../../verifier/cli.js --cwd . -- ./zig-out/bin/stand
```
