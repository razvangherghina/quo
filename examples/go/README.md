# The Go kit

A kit of Quo in Go, written cold from the published documents and the
verifier alone. It is one example among equals: none is a reference, a
library or a product, and none is meant to be imported. `ANSWERS.md` is its
answer to every question of `KIT-SPEC.md`.

| Fact | This kit |
| --- | --- |
| Toolchain | Go 1.27 |
| Depends on | the standard library |
| Carries | `tcp`, `http`, `ws` |
| Build | `go build -o stand .` |
| Stand program | `stand` |
| Its own tests | `go test ./...` |

From this folder, the verifier judges the stand program after its build:

```bash
node ../../verifier/cli.js --cwd . -- ./stand
```
