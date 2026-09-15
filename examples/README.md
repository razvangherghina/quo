# Quo examples

Quo written from the spec beside this folder alone, one language each. They
exist to prove the text is enough, and nothing else. Quo offers no library,
and these are not one: they are scholastic, the least a kit can be and keep
every sentence, meant to be read beside the spec and never imported,
depended on or run in production. They sit in this repository because the
vectors, the verifier and the world are proven against them, and no kit is
a reference: another kit is Quo when it reproduces the vectors and meets
these at the door.

Each kit is written cold, by a writer holding the spec and no other kit, so
the two differ wherever the spec leaves a choice. Each carries a
`KIT-SPEC.md` with the choices it made and why.

- `js/`: JavaScript on Node's own modules, with one dependency,
  `@noble/post-quantum`, for ML-KEM-768 alone. No build.
- `rust/`: Rust on the standard library and the algorithms' crates.
- `e2e/`: the world of `SCENARIOS.md`, the two kits speaking Quo to each
  other over TCP, both ways, on loopback or in containers. It proves the
  protocol and never a kit: every claim is what crosses between them. Its
  `trace.js` writes `vectors/door.json` from a story both kits told to the
  same bytes.

## Running

The toolchain is Node 24 or later, since the hand uses ML-KEM-768 and SHA3
from Node's own `crypto`, Rust with cargo, and Docker for the container run.
Each block below runs from the repository's root, in order.

```bash
git clone https://github.com/razvangherghina/quo && cd quo
```

The JavaScript kit has one dependency to install.

```bash
npm --prefix examples/js install
```

### Two kits meet

One command stands the JavaScript kit as one ward and the Rust kit as
another, two processes, with the observer on the wire between them. It
boots a being on each, invites, routes, knocks, takes and asks, and then
knocks as a stranger and hears silence. Each step prints what crossed, and
it exits zero only when every step held. It needs Node 24 and Rust, and
builds the Rust stand itself.

```bash
node examples/e2e/demo.js
```

### Every proof

```bash
npm --prefix examples/js test
```

```bash
node --test "examples/js/harness/test/*.test.js"
```

```bash
cargo test --manifest-path examples/rust/Cargo.toml
```

```bash
cargo test --manifest-path examples/rust/harness/Cargo.toml
```

The verifier replays the door corpus against each stand program.

```bash
node verifier/cli.js -- node examples/js/harness/stand.js
```

```bash
cargo build --manifest-path examples/rust/harness/Cargo.toml --bin stand
```

```bash
node verifier/cli.js -- examples/rust/harness/target/debug/stand
```

A kit of your own is verified the same way. Its stand program answers
`vectors/HARNESS.md`, and everything after `--` is the command that starts
it. The verifier needs Node alone, prints one line per record of
`vectors/door.json` and what differed on a record that fails, and exits
zero when every record passes.

```bash
node verifier/cli.js -- <your stand program and its arguments>
```

The world of `SCENARIOS.md` runs on loopback, and builds the Rust stand
itself.

```bash
npm --prefix examples/e2e test
```

The same suite runs in containers.

```bash
./examples/e2e/run-docker.sh
```

`trace.js` writes `vectors/door.json` again, and only when both kits
recorded the same bytes.

```bash
node examples/e2e/trace.js
```

Apache-2.0.
