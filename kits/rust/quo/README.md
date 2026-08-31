# quo

**Quo** is a small, open protocol that answers exactly one question — _by
whose authority?_ — and refuses every other.

This crate is the Rust kit whole. It holds no code of its own: each part of
the kit is its own crate, and this one names them all under one dependency.

```toml
[dependencies]
quo = "0.1"
```

```rust
use quo::{notation, arithmetic, wire, envelope, warden};
use quo::{carriage, line, zero};
```

The core — `notation`, `arithmetic`, `wire`, `envelope`, `warden` — touches
no host. The roads — `carriage`, `line`, `zero` — are the three Article III
names, and they are the only parts here that reach one. A caller who wants
one part takes that part instead: `quo-warden`, `quo-line`, and so on.

- The protocol and its law: [quo.systems](https://quo.systems)
- The constitution and all five kits:
  [github.com/razvangherghina/quo](https://github.com/razvangherghina/quo)

No vendor owns Quo. Apache-2.0.
