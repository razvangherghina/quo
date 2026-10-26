# The Python kit

A kit of Quo in Python, written cold from the published documents and the
verifier alone. It is one example among equals: none is a reference, a
library or a product, and none is meant to be imported. `ANSWERS.md` is its
answer to every question of `KIT-SPEC.md`.

| Fact | This kit |
| --- | --- |
| Toolchain | Python 3.9 or later |
| Depends on | `cryptography` 48 or later, in a virtual environment: `python3 -m venv .venv && . .venv/bin/activate && pip install 'cryptography>=48'`, where Debian and Ubuntu need the `python3-venv` package first |
| Carries | `tcp`, `http` |
| Build | none |
| Stand program | `stand` |
| Its own tests | `python3 -m unittest discover -s tests` |

From this folder, in the shell where that environment is active, the verifier
judges the stand program:

```bash
node ../../verifier/cli.js --cwd . -- ./stand
```
