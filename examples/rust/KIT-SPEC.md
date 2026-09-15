# KIT-SPEC

This paper is the template `quo/KIT-SPEC.md` answered for this kit, question
by question in its order. Each answer is one choice, and another kit choosing
otherwise is still Quo.

## The vision

This kit is the spec in Rust, written to be read. It is one crate,
`quo-kit`, whose modules stand in the order the spec is written: the
algorithms and ML-KEM-768 in `src/arithmetic.rs`, lowercase hex in
`src/hex.rs`, the value rule, the words and the digest in `src/value/`, the
seed and the ward pk, the framing, the edge seal, the knock box and the one
size in `src/seal/`, the door, the sender, the partition, the cells, the
askers and the answer in `src/ward/`, the carrier in `src/wire.rs`, one
memory harbor in `src/harbor.rs`. A module leans only on the chapters
before it. It
is not a product: `publish = false` at `0.0.0`, no runtime, no scheduler.
The one binary is `harness/`, the stand program of `HARNESS.md`, an
adapter over the crate that changes nothing of it. All of the crate is the
standard library but the algorithms, and its
JSON is its own, because no general-purpose parser draws the spec's lines.
ML-KEM-768 is RustCrypto's `ml-kem`, pinned at `=0.2.3` with its
`deterministic` feature, the release that exposes `generate_deterministic`
and `encapsulate_deterministic`, so the vectors pin its bytes.

## 3.1 Which base64 do bytes travel as?

None. The kit holds no base64 and never writes bytes into a value: every key,
seed, digest and ward pk is lowercase hex, and a being who puts bytes in an
arg picks her own base64. No cost is named, since no ward decodes one.

## 3.2 Does this ward stand a public being, and which being is she?

A fresh ward stands none. The root's `public` ask names one by the key of a
being this ward holds, and `null` marks nobody.

## 3.3 How long does a door keep the keys of a removed heir?

`GONE_BOUND` is 256 in `src/ward/partition.rs`: the last 256 removed heirs,
oldest out, each keeping its two signing keys and its two edge keys, so a
removed key's ask still opens and hears `removed`. A count and not a clock,
because the partition holds no clock.

## 3.4 What is a ward's default allowance and what is its ceiling?

`DEFAULT_TIME` is thirty seconds, which carries a chain of asks over a real
network, and `CEILING_TIME` ten minutes, a line no quiet far side holds for a
working day.

## 3.5 What does the kit hold beside the mark to know which numbers are spent?

A `Heir` holds `mark: u64` and `spent: Vec<u64>`, sorted, which `Heir::spend`
prunes to the span, so it holds at most sixty-three. A vector and not a
bitmask: that many numbers scanned linearly are one thing to get right.

## 3.6 How does the kit hash a blueprint into its digest?

`src/value/canonical.rs` sorts keys by `str::encode_utf16`, RFC 8785's order
and not Rust's byte order, and `es_number` in `src/value/number.rs` is a
hand-written ECMAScript `Number::toString`. Hashing otherwise would refresh
every standing on every ask.

## 3.7 What does the kit keep when a reply is none of the three shapes?

Nothing. `seal::open_reply` gives `None` for a reply that is not one of the
three shapes, and `send.rs` turns that into `Reply::Silence` without noting
which rule it broke.

## 3.8 Does the door equalize the time of its refusals, and how far?

No. `judge` in `src/ward/door.rs` refuses as early as each case allows: it
tries only the keys the head names, and verifies a signature only once the
case before it has passed.

## 4.1 How is the stance spelled?

A `Stance` struct in `src/ward/stance.rs`, holding a weak pointer to the ward and
her own key, offering `cells`, `set`, `standing` and the six calls.

## 4.2 How is a being handed her cells?

`Stance::cells` answers a `Cells` value by copy, so a container she read
cannot change behind her guard, and `Stance::set` refuses a non-value in her
own frame. Her two records are kept in her cells under the root keys
`standings` and `occupants`, this kit's choice of where to put them, so a
restart brings her state and her records back in one piece. Those keys are
refused to her own writes by name, this kit's spelling and not the spec's rule
about ids, at the cost of two words she may not use as cells of her own.

## 4.3 How is a being handed her standings?

Through her cells. `Stance::standing` reads a `StandingRecord` out of the
`standings` map: the id, her cached blueprint, its digest and the last `seen`.

## 4.4 How are the six calls spelled?

`invite(id, notes)`, `take(id, invitation)` and `boot(class, key, occupant,
standing)` answer an id, an invitation or nothing, `remove(id)` answers
nothing, and `knock` and `ask`, each with a method, args and a `wanted`,
answer an `Answer`: a value, silence or a word.

## 4.5 How are the asker's three shapes spelled?

`Asker` in `src/ward/asker.rs` is an enum of exactly three: `Occupant(id)`,
`Nobody`, `Root`. An enum and not a string, so no fourth can be written.

## 4.6 Which ids does the kit reserve, and how does it refuse them?

One name, `ROOT`, refused by `is_reserved` at invite and at take, because
`Asker::id` spells the root as `ROOT` and a being reading that id must not meet
an occupant of the same name. One, because this stance takes an id as an
argument and never as a name beside its calls.

## 4.7 What can the ward be asked by its root?

Six asks through `Ward::ask`, one object of args in and a value out: `boot`
takes `class` and `key`, `public` takes `key` or `null`, `invite` takes
`being`, `id` and `notes`, `remove` takes `being` and `id`, `ask` takes the
`being` it asks and has no default, and `knock` takes an invitation and, on
an answered knock, takes in the same breath and answers `{ taken, answer }`,
since a root driving a ward wants the relation. Every refusal is silence.

## 4.8 What are the asks named by which one ward pilots another?

There are none. The six root asks are reachable through `Ward::ask` alone,
which never arrives through a door, so two wards of this kit meet as ordinary
beings and agree their own names, and nothing here pilots a far ward.

## 4.9 How may two asks be inside one being at once?

They may, wherever a ward waits. The kit is on `Rc` and `RefCell` and runs
on whichever thread its harbor gives it, one at a time, and every wait goes
through `Ground::wait`: a harbor that runs other work there puts a second
ask inside her while the first waits on a far side. `MemoryHarbor` sleeps
there, so under it her `answer` runs to its end before another ask enters.

## 4.10 What holds the line of one relation, and what releases it?

`Core::line` in `src/ward/mod.rs`: a set of the relations whose line is held
now, keyed by the being, the far ward and the heir, and a `Line` guard that
lets go when it drops. A knock, an ask and a take each wait for their
relation's line through `Ground::wait` before they read a key, and an ask
whose allowance runs out in line sent nothing and is `unreached`. The ward
holds the bound, not the carrier. The ward takes a `Carrier` from its ground
once at birth, and the type holds it: `Send` and `Sync`, behind an `Arc`.
`transmit` in `src/ward/send.rs` calls `Carrier::carry(ward, bytes)` on a
thread of its own and waits through `Ground::wait` for the allowance at
most, then answers `late` and reads nothing that comes back after. A carrier
that blocks forever, never answers, or ends without a word is an ask ended
as `late`, so a quiet far side releases its line when the allowance runs
out. An ask to its own door, or to a door `Ground::door` names in this
process, runs on this stack, and what it returns past the allowance is not
read.

## 4.11 How does a being name the class she boots?

`Stance::boot` takes the class name and the key the new being stands under,
both strings she chooses, and a key already held makes nobody.

## 4.12 How does an ask between two beings of one ward travel?

`transmit` hands the bytes to its own door when the target ward pk is its own,
sealed, signed, judged and opened as over a network: a route, not a shortcut.

## 4.13 Who invites at boot, and which ids are named?

`Stance::boot` takes an `occupant` her maker mints and a `standing` the new
being mints, and a failed step removes the occupant and unmakes the being.

## 4.14 How does a restart hand a being her cells again?

`Ward::birth` walks the partition's `classes` and instantiates each being over
the cells filed under her key. The class is the ward's record and never a cell.

## 5.1 What is the harbor, as a thing the kit names?

A `Ground` trait of six methods, `instantiate`, `door`, `carrier`, `random`,
`keep` and `wait`, with the seed and the partition handed beside it to
`Ward::birth`. The carrier of chapter 5 is two of them: `door` names a ward
running in this process, and `carrier` hands the `Carrier` that reaches any
other. `MemoryHarbor` is the one harbor: one process, no socket, no
disk, every door in process and no carrier.

## 5.2 How is a seed handed in and held?

A `Seed` goes to `MemoryHarbor::boot`, which files it beside the partition in
memory, sealed by nothing, so custody past this process is a harbor's.

## 5.3 What shape is the partition, and is it sealed?

One struct of seven fields: `beings` holding each being's cells, `classes`
her class, `bind` her keys outside them, `heirs` the door's view of each
occupant, `gone` what a removal left, `public`, and `lock`. The lock is kept as
the sixty-four bytes it was drawn as, `d || z` in lowercase hex, `null` until
the first invite, and its key pair is derived from them again at each invite
and each knock the door opens: the pair is a function of those bytes, and one
row of 128 hex is one thing to get right. The edge keys ride as lowercase hex
beside the signing keys, `open` and `offered` on a `Heir` and on a `Gone`,
`edge` on a `StandingKeys` and on a `KnockKeys`, the zero edge key spelled out
as sixty-four zeros rather than left absent, so every row reads one way. A
fresh `Heir` keeps sixty-four zeros under `open` until its knock, and the door
never tries a body under it: a fresh heir is tried under its knock's
ciphertext alone. A `KnockKeys` holds the knock's edge key from the moment
the knock is sealed. Not sealed: whoever reads this memory speaks as that
ward.

## 5.4 How does one seed hold one run?

Nothing here holds it. `MemoryHarbor::boot` twice on one seed stands two wards
with one name over two partitions, without a word. The cost is divergence in
full: a relation, once diverged, is made again only by invitation.

## 5.5 How is a being instantiated from a class name?

The harbor holds class name to `Constructor`, a closure from a `Stance` to a
being, and `instantiate` is a lookup: a name it does not hold is
`Unmade::NoClass`, and one that returns `Err` or panics is `Unmade::Threw`.

## 5.6 Where does the random come from?

An `Entropy` closure the harbor is handed, a count in and that many bytes out.
Every key this ward mints is drawn from it, so a test can write it down: the
lock in one draw of sixty-four, every heir secret, own key and ephemeral key
in draws of thirty-two, and a knock's m in a draw of thirty-two right after
its ephemeral key.

## 5.7 Which carriers does the kit stand beside the reference one?

One: the memory harbor's in-process copy, to a door of its own or of a linked
harbor, always a copy and never a reference.

## 5.8 How does the door tell its harbor what was written, and when?

It does not tell it what was written: the partition is the harbor's own
object, so a harbor that keeps it reads it whole. It asks `Ground::keep()`
once on an arrival that reached her, after she answered and before the reply
is sealed, and never on a refusal. This harbor answers yes.

## 5.9 How does the harbor rate a ward key by the one bit it learns?

It does not. `Ward::door` answers the bytes and the bit, and `MemoryHarbor`
drops it, so a key bringing only strangers' bytes is carried as any other.

## 6.1 How does a dialer learn which address stands a ward?

It does not. `Dialer::dial` takes an address from its caller, and the kit
holds no directory and no cache, so the two parties bring it by what they
share.

## 6.2 Which port, and how many connections, held how long?

No port is named: `Listener::stand` binds whatever address it is handed, and
`serve_one` serves one connection to its end. `Dialer` holds one connection
and the replies that answer an id nobody asked for yet, with no reconnect.
Neither is a `Carrier`: which address stands a ward is a harbor's to know, so
the harbor that holds the addresses wraps a `Dialer` as its carrier.

## 6.3 How does the dialer mint frame ids?

From one, upward, wrapping. An id is unique among the asks in flight on one
connection, and the kit owes nothing beyond that.

## 8.1 What does the kit's conformance suite hold that the vectors cannot?

Three things, in `tests/`: whether a reply opened, read as the `Answer` a
being got back and never as bytes; the bit beside the bytes, which
`Ward::door` answers; and nothing written, as one digest before and after.

## 8.2 What is the kit's partition digest?

SHA-256, lowercase hex, over the canonical form of `Partition::to_value`,
whose maps stand in a stable order, so two digests differ when a write fell
between them. The partition is hashed as it stands and never held to the
value rule, since a cell of depth sixty-four nests deeper inside it.

The harness that replays a record is `harness/`: it stands wards over the
crate's own `Ward` and TCP carrier, speaks the root channel on stdin and
stdout, draws from the fixed stream of `HARNESS.md` section 6 when told
to, and writes and reads the partition file of section 5, which is the one
place anything of this kit touches a disk.

## What this kit does not do

- No persistence in the crate and no sealed partition: the partition file
  is the harness's, and that seal is a harbor's.
- No async and no executor: the ward runs on one thread at a time and waits
  through its ground. The one thread beside it is the carrier's, so the
  allowance can end a carrier that never returns.
- No rate limiting or refusal by ward pk, which the spec gives the harbor.
- No carrier but TCP and the in-process copy. No log, no metric, no trace.
- No retry, no fire-and-forget, no stream: those are a being's to build.

This file is the kit's opinion, and another kit choosing otherwise is still
Quo.
