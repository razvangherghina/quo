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

From the repository's root:

```bash
git clone https://github.com/razvangherghina/quo && cd quo
```

```bash
cd examples/js && npm install && npm test
```

```bash
cargo test --manifest-path examples/rust/Cargo.toml
```

```bash
cd examples/e2e && npm install && npm test
```

```bash
node verifier/cli.js -- node examples/js/harness/stand.js
```

Apache-2.0.
