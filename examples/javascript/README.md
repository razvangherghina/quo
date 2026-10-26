# The JavaScript kit

A kit of Quo in JavaScript, written cold from the published documents and the
verifier alone. It is one example among equals: none is a reference, a
library or a product, and none is meant to be imported. `ANSWERS.md` is its
answer to every question of `KIT-SPEC.md`.

| Fact | This kit |
| --- | --- |
| Toolchain | Node 24 |
| Depends on | Node's own modules |
| Carries | `tcp`, `http`, `ws` |
| Build | none |
| Stand program | `stand` |
| Its own tests | `npm test` |

From this folder, the verifier judges the stand program:

```bash
node ../../verifier/cli.js --cwd . -- ./stand
```
