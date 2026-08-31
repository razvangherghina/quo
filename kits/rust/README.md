# The Quo kit in Rust

A Quo kit written from [the constitution](../../constitution.md) alone.
Today it carries five parts of the core: **the notation** — a blueprint's
canonical text, its digest, and everything Article IV refuses — **the
arithmetic**, the four algorithms of Article VI, **the wire**, the one way
each closed type is written, **the envelope**, the sealed letter and its two
faces, and **the warden**, the door and the judgment everything arriving at
it is put through. Beside them stand the three roads Article III names: **the
carriage**, the common HTTPS road every warden answers, **the line**, framed
envelopes over one persistent TCP connection, and **distance zero**, the call
— two houses in one process handing envelope bytes as bytes. Above them
stands **`subject`**, the executable a driver in another language spawns to
speak to this kit.

**A road is not the core.** `carriage` and `line` are the only crates here
that reach a host; the five beneath them open no socket, read no clock and
draw no key, and the suite asserts that separation rather than trusting it.
`zero` is a road with no wire, so it reaches no host either.

**Distance zero waives no step of the judgment**, and that is asserted rather
than described: `zero/tests/judgment.rs` writes Article XII's steps once and
drives them over all three roads, so a step honoured on one and waived on
another is a red rather than an absence.

## Toolchain

- **Rust edition 2021.**
- **Minimum toolchain 1.88.0**, which is what the kit is built and tested
  with. Nothing here reaches for a newer feature; the floor is a promise, not
  a limit found by experiment.
- No build script, no C toolchain, no async runtime. The core is synchronous
  and touches no host.

## Layout

| Path          | What it is                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| `Cargo.toml`  | The workspace.                                                                                       |
| `notation/`   | The crate `quo-notation`: the parser, the canonical text, the digest.                                |
| `arithmetic/` | The crate `quo-arithmetic`: the four algorithms of Article VI.                                       |
| `wire/`       | The crate `quo-wire`: the byte encoding of Article V.                                                |
| `envelope/`   | The crate `quo-envelope`: the sealed letter of Article XI.                                           |
| `warden/`     | The crate `quo-warden`: the door of Articles VII to XII.                                             |
| `carriage/`   | The crate `quo-carriage`: the common carriage of Article III.                                        |
| `line/`       | The crate `quo-line`: the framed line of Article III.                                                |
| `zero/`       | The crate `quo-zero`: the call at distance zero, and the judgment suite driven over all three roads. |
| `subject/`    | The `subject` binary: a whole ground, on any of the three roads.                                     |
| `support/`    | The JSON and hex readers the bench and the binary share.                                             |

## Dependencies

Five, one per primitive, and every one of them a primitive rather than a
decision about bytes:

| Crate           | For                  |
| --------------- | -------------------- |
| `ed25519-dalek` | Ed25519 signs        |
| `x25519-dalek`  | X25519 seals         |
| `sha2`          | SHA-256 commits      |
| `aes-gcm`       | AES-256-GCM encrypts |
| `hkdf`          | HKDF-SHA-256 derives |

Pure Rust throughout, so the kit builds on any target without a C toolchain.
`aes-gcm` is taken without its default features, because the default pulls in
the host's random number generator and the core reaches for none.

### One build flag worth setting for bulk

`aes-gcm` compiles to portable software AES on aarch64 unless the build asks
for the ARMv8 crypto instructions, and the crate gates them on a `cfg` rather
than on the target feature — so `-C target-cpu=native` does **not** turn them
on. Building with them on is a straight win wherever envelopes are large:

```sh
RUSTFLAGS="--cfg aes_armv8 -C target-feature=+aes,+neon,+sha2" cargo build --release
```

Measured on one core of an Apple M1 Max, 2026-08-31: opening a 64 KB envelope
falls from 648 µs to 307 µs, and a 1 MB envelope from 8.6 ms to 3.7 ms. Small
asks are unaffected — they are dominated by X25519 and Ed25519, not by AES.
Nothing in the kit's own code changes, and the bytes on the wire are identical
either way; this is a property of how the dependency is compiled.

The pinned corpus is read by a JSON reader that lives in the bench
(`support/json.rs`), so no crate enters for the tests either. It sits beside
the crates rather than inside one, and it is the one place to extend when a
later corpus needs more of JSON than it reads today.

## What the notation crate promises

```rust
let text = "Small\n  yes() bool\n";
let blueprint = quo_notation::parse(text)?;      // or refuses
assert_eq!(blueprint.canonical(), text);
let digest = blueprint.digest();                  // SHA-256 over the canonical text
```

**A text that is not already canonical is refused, never repaired.** Parsing
reads the text into a blueprint, writes the blueprint's one canonical text,
and refuses unless the two are the same bytes. That is why a doubled space, a
trailing space or a reordered record block is a refusal rather than a
correction: a text with a second legal spelling would be a second identity for
one class.

## What the arithmetic crate promises

```rust
use quo_arithmetic as arithmetic;

let commitment = arithmetic::commitment(&warden, &heir);   // SHA-256, warden first
let voice = arithmetic::signing_pk(&seed);                 // Ed25519
let signature = arithmetic::sign(&seed, message);
arithmetic::verify(&voice, message, &signature)?;          // or refuses

let padlock = arithmetic::sealing_pk(&secret);             // X25519
let shared = arithmetic::agree(&ephemeral_secret, &padlock)?;  // or refuses
let sealed = arithmetic::seal(&shared, &ephemeral, plaintext);
let opened = arithmetic::open(&shared, &ephemeral, &sealed)?;
```

**Two refusals are the crate's own, not the platform's.** A voice that is all
zeros or one of the eight small-order points is silence before any signature is
examined, and an agreement handing back thirty-two zero bytes is refused at the
point of agreement — `x25519-dalek` returns the degenerate output rather than
erroring, so this crate is where that is said.

**Every draw of randomness is taken as an argument.** Nothing in the crate
reaches for a random number generator: a seed, a secret and an ephemeral pair
all arrive from the caller. That is what lets the whole of Article VI be
reproduced from the pinned corpus rather than merely round-tripped.

**The derivation is the byte the kits most easily disagree on.** An empty
salt of zero length, the fixed ASCII info `quo-seal` as one constant, and
forty-four bytes drawn — thirty-two of key, then twelve of nonce — over the
raw shared secret exactly as the agreement hands it back.

## What the wire crate promises

```rust
let bytes = quo_wire::encode(&blueprint, &ty, &value)?;   // or refuses
let value = quo_wire::decode(&blueprint, &ty, &bytes)?;   // or refuses
```

**A decoder reads the whole of what it was handed or refuses.** Bytes left
over after a well-formed value, a negative length, a marker byte that is
neither present nor absent: each is a refusal, and on the wire every refusal
is silence.

## What the envelope crate promises

```rust
use quo_envelope as envelope;

let sealed = envelope::seal(&voice_secret, &ephemeral_secret, &padlock, &message)?;
let say = envelope::open_at_door(&warden_padlock_secret, &sealed)?;    // or refuses
let answer = envelope::open_at_caller(&caller_padlock_secret, &reply)?; // or refuses
```

**The payload is a record in Quo's own notation**, so the crate declares the
two shapes Article XI writes as notation text and hands them to the wire.
There is no second encoder anywhere in the kit.

**The payload's first byte names the record and the signature covers it**, so
what a voice signs as a `say` can never be read as an `answer`. A door takes
only the `say` byte and a caller only the `answer` byte — Article XII's first
step — which is why a payload crafted to decode as both records is accepted
under one byte and silence under the other.

**The ephemeral secret is taken as an argument**, like every other draw, which
is what lets a whole envelope be reproduced byte for byte rather than merely
round-tripped.

## What the warden crate promises

```rust
use quo_warden as warden;

let verdict = door.judge(&envelope, arrival_ms)?;   // steps one to seven, or silence
let data = door.answer(&verdict, None)?;            // what the warden answers itself
let reply = door.reply(&verdict.say, data, &ephemeral_secret)?;
door.succeed(name_secret, next_commitment)?;        // the name moves to its heir

// And the caller side, because a kit that can only answer a call is half a
// kit. `remember` keeps an invitation, `ask` composes one utterance, `rotate`
// composes one signed by the heir and moves the keys under the same act, and
// `hear` opens what comes back.
let at = door.remember(&invitation);
let (envelope, seq) = door.rotate(at, &ephemeral, &fresh_voice, &Reach::default())?;
let answer = door.hear(at, &reply)?;
let taken = door.accept(&invitation, &accepting, |out| road(out))?;
```

**`accept` spends an invitation whole, in two rotate-and-asks**, so no caller
can forget the second one — and the raw path above it stays open, because a
helper that is the only way to do a thing is not a helper. Every draw of
randomness is an argument here too, and the road is a closure rather than a
socket.

**The door's own rows are not the `standing` and `relation` records.**
`Inbound` and `Outbound` are what a door keeps; the records are what travels
in a cargo, and each row converts to and from its record. `Inbound::minted_at`
is the door name a commitment was hashed under, so a door that succeeded its
name keeps verifying an older standing's heir where it was minted, and it
travels as `standing.name`. `Outbound` keeps `seq` for what this door sends
and `news` for the mark against that peer's news, **because one field cannot
be two counters**, and both travel.

**The judgment is one road with eight steps in one order**, and every failure
is the same failure: the reason on a [`Refused`] is for a reader, and on the
wire it is silence.

**Nothing here reads a clock, opens a socket or draws a key.** The arrival
reading is an argument to `judge`, the onward reading an argument to
`onward`, and the one key `receive` commits to is an argument too — the road
is delivery's, and the door is only the judgment.

**A route to a being is not the warden's to answer.** `judge` hands back a
`Route`, and `Route::Being` is where the warden stops: steps one through six
are the warden's alone and the being never learns that any of them happened.

## What the three roads promise

```rust
// The common carriage: one POST, bytes in and bytes out.
let answer = quo_carriage::post("http://warden.example/door", &sealed)?;
let door = quo_carriage::Door::bind("127.0.0.1:0")?;
door.serve_one(|body| judge(body))?;   // `None` is silence, and an empty body

// The line: a length written the way the wire writes an `int`, then that
// many envelope bytes, and nothing else.
let listener = quo_line::Listener::bind("127.0.0.1:0", quo_line::DEFAULT_CAP)?;
let hint = listener.hint()?;           // tcp://127.0.0.1:54321
let mut held = quo_line::Line::dial(&hint)?;
held.send(&sealed)?;                   // refused above the cap the hint promised
let arrival = held.receive()?;         // a Refused here is a framing fault

// Distance zero: no hint, no framing, no socket. The far house is standing
// in this same process and is handed the envelope as bytes.
let door = quo_zero::Door::new(|envelope: &[u8]| ground.judge(envelope));
let answer = door.post(&sealed);       // empty is silence, as on the carriage
```

**No road opens a seal.** They carry bytes and nothing else, which is why none
of them depends on a crate in the kit — `carriage` and `zero` depend on
nothing at all, and `line` takes `quo-wire` only so the frame's length has the
one spelling an `int` has.

**No status code carries meaning and no header is read for meaning.** The
carriage reads `Content-Length` because HTTP has no other way to say where a
body ends, and a body under a 500 is the same body as one under a 200.

**The line's silence has no wire form.** A refused ask produces no frame, so a
zero-length frame is malformed here though a zero length is legal everywhere
else in the encoding. Only a framing fault ends the connection — a length at
or below zero, or a length above this end's cap — and it ends without a word.
A well-formed frame whose envelope fails the judgment is ordinary silence, and
the line lives on.

**HTTPS is named by the law and this kit has no TLS crate.** `post` refuses an
`https://` hint rather than quietly dialling it in the clear; put a TLS
terminator in front of the road. `rustls` is approved for the carriage and is
not taken yet: its own default crypto provider needs a C toolchain, which this
kit refuses, and the pure-Rust provider is a further crate nobody has
approved. Until that is settled the refusal stands, and the separation suite
already refuses a TLS crate anywhere but `carriage/Cargo.toml`.

## Running it

```sh
cargo test
```

The suite reproduces every vector in
[`../js/vectors/notation.json`](../js/vectors/notation.json),
[`../js/vectors/arithmetic.json`](../js/vectors/arithmetic.json),
[`../js/vectors/wire.json`](../js/vectors/wire.json),
[`../js/vectors/envelope.json`](../js/vectors/envelope.json) and
[`../js/vectors/warden.json`](../js/vectors/warden.json), and every
relation between the fixed keys in
[`../js/vectors/material.json`](../js/vectors/material.json) — the pinned
corpus, whose bytes belong to the law. Each refusal is asserted as strictly as
each acceptance, each suite asserts its own case count against the file so
nothing is skipped silently, and each adds the cases its article names that
the corpus does not carry.

**The roads have no corpus at all**, so every case they carry is read from
Article III and named for the clause it pins. The two wired roads are
exercised over a real socket on an ephemeral loopback port, bound by the case
and dropped when it ends — nothing is faked and nothing outlives the suite.

**And Article XII is asserted once for all three.** `zero/tests/judgment.rs`
builds one ground and one caller and drives the same judgments over the
carriage, the line and distance zero, naming the road in every assertion: the
whole ask answered, the replayed number, the number past the window's edge,
the exhausted leash, the payload addressed elsewhere, the tampered envelope,
the being no standing reaches, the stranger's describe, the answer sealed to
the padlock the ask carried, and the warden's own being answering to both its
addresses.

## What the subject binary promises

`subject` is this kit standing up as a whole ground, so a driver in another
language can speak to it without reading a line of Rust.

```sh
cargo build -p quo-subject

# A door on the common carriage. One line of JSON on stdout says everything a
# stranger needs and nothing about how it is built.
target/debug/subject serve
target/debug/subject serve -line          # the same ground, the framed road

# A caller, handed those facts verbatim as one argument.
target/debug/subject speak -being auto -method count '<facts-json>'
target/debug/subject speak -line -being auto -method bump -args <hex> -hold '<facts-json>'

# Distance zero: no facts are given, because there is no stranger to give
# them. The process stands the far house itself, prints its invitation, and
# then speaks to it as a stranger would.
target/debug/subject speak -zero -being auto -method bump -args <hex>
```

**Every line it prints is one JSON object carrying `quo`**, and that is the
whole of its contract with a driver. The facts line is JSON because a hint is
an opaque string the protocol never parses, and a line split on spaces cannot
carry one that holds a space.

**The invitation does not name the being.** A holder rotates, describes, and
finds what it now reaches, which is the path the law already gives.

**`-hold` is the half a door cannot have.** Speaking down a line, this ground
holds a being of its own and grants the far ground a standing at it, with an
invitation that carries no road at all — because the road is the connection
already open. The crossing in
[`../../demos/crossing`](../../demos/crossing) drives it against the JS and Go
kits, on both roads and in both directions.

**Every host thing lives here**: the clock, the sockets, and the one place
this kit draws randomness. The crates beneath take all three as arguments.
