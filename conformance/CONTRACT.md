<!-- This is the published form of the subject contract, emitted on every release from the author's working tree, where it is written beside the runner and the scenarios that drive it. Propose a change at https://github.com/razvangherghina/quo/issues; an edit made to this file is replaced by the next release. -->

# The subject contract

You have written a Quo kit in a language nobody here has touched. This is the
whole of what you implement so the conformance scenarios can drive it.

It is not a test framework and it holds no expectations. It is your warden with
its inputs exposed: keys handed in, bytes handed in, records readable. Every
expectation lives in the scenario files, which are data.

## The shape

One process. JSON objects, one per line, on stdin; one JSON object per line
back on stdout. Every object has a `do`. Every reply is either the named result
or `{"error": "..."}`.

All byte strings are lowercase hex. All integers that are Quo `int`s are
decimal **strings**, so nothing is lost to a language's float.

## The nine verbs

### `stand`

Build a warden and everything it holds. After this, nothing is random and
nothing is timed.

```json
{
  "do": "stand",
  "warden": {
    "nameSeed": "…",
    "padlockSeed": "…",
    "heirSeed": "…",
    "heirCommitment": "…",
    "limit": "1048576",
    "hints": []
  },
  "beings": [
    {
      "seed": "…",
      "heirSeed": "…",
      "blueprint": "Counter\n  …\n",
      "cells": "",
      "onward": {
        "when": "bump",
        "at": "…",
        "being": "…",
        "method": { "name": "count", "args": "" },
        "ephemeral": "…",
        "seq": "1"
      }
    }
  ],
  "grants": [{ "being": "…", "voiceSeed": "…", "heirSeed": "…", "padlock": "…", "hints": [] }],
  "relations": [
    {
      "being": "…",
      "warden": "…",
      "commitment": "…",
      "padlock": "…",
      "voiceSeed": "…",
      "heirSeed": "…",
      "hints": []
    }
  ],
  "moved": [
    {
      "being": "…",
      "word": {
        "being": "…",
        "successor": "…",
        "commitment": "…",
        "name": "…",
        "padlock": "…",
        "hints": []
      }
    }
  ],
  "expecting": { "seed": "…", "heirSeed": "…", "blueprint": "Counter\n  …\n", "cells": "" },
  "clock": ["1000", "1001", "…"],
  "random": ["…", "…"]
}
```

Reply: `{"warden": {"name": "…", "padlock": "…"}, "beings": ["…"], "grants":
[{"warden": "…", "commitment": "…", "padlock": "…", "heir": "…"}]}`.

**`onward` gives a being one thing to do, and it is the only thing any being in
this contract ever does.** A warden never makes an onward ask of its own: it
hands the leash to the being it routed to, and the being decides. So every rule
in Article VIII about what a door hands onward is unreachable unless some being
calls out, and `onward` is the smallest way to make one that does.

**It asks the being to decide nothing.** `when` names the method that triggers
it, `at` names the far warden whose relation to spend, `being` and `method` name
what to ask there, and `ephemeral` is the key that ask is sealed with — handed
in like the queues and for the same reason. What a scenario then asserts is
**the bytes your warden composed**: the hop count one lower than what arrived,
the time budget less this door's own dwell. That is your warden's arithmetic.
**What the being answers is never asserted** — it belongs to the blueprint, and
a scenario that pinned it would be testing a being this harness invented.

**Spend the leash your kit handed the being. Never one your subject computed —
and here is why, because this is the one rule in this contract that nothing can
check.**

The obligation these exchanges assert is that the leash a door hands onward is
the one it was given, less what this door cost. **If your subject does that
arithmetic instead of your warden, the exchange measures your subject** — and a
warden whose own arithmetic is wrong passes, because the bytes on the wire came
out right anyway. It is two subtractions. It is very easy to write inline, and
nothing will ever go red if you do.

**This bites hardest where your kit hands a being to the host**, so the subject
is the being and the leash arrives as something to pass along. That is exactly
where reaching for the subtraction is the obvious thing to do. **Call whatever
your kit calls to compute an onward leash, even when you can see what it would
return.** If your kit has no such call, say so — that is a finding about the
kit, and it is worth more than a green run.

**It was found by breaking a subject on purpose and watching nothing happen.**
Breaking a kit's onward arithmetic turned the case red; replacing the subject's
call to that same function with the arithmetic it performs left every scenario
green. Both are true, and together they say the case measures whichever of the
two did the work.

**`expecting` makes this door a destination.** Article IX's `receive` is "an
ordinary field spent by an ordinary standing granted in advance", so a cargo
arrives as an ordinary ask and needs no verb of its own — but a door about to
take a being in has to have been told, or any holder could push a being into
any house. The keys are the ones this door will mint for the arriving being,
and they are handed in for the same reason every other key is: so the run is
deterministic. A kit that mints them itself takes the seeds; a kit that needs
only one of them takes that one.

**`moved` makes this door an old door.** Each entry says a being has gone and
records the succession this door published for it — Article IX's `word`, whose
absent fields are absent. After it, Article XIII holds: the door "keeps the
succession it published and answers `moved` with it. Every other ask meets
silence." Nothing here moves a being; it records that one has, which is the
only half of a migration a single door can be driven through.

**`grants` writes inbound rows and `relations` writes outbound ones.** A grant
is a voice this door lets in; a relation is an invitation this door holds at
another house, which Article VII gives as five things — "the granter's warden
pk (the name), the hash of that warden's heir, the padlock pk for this
relation, the heir keypair of the voice being granted, and one or more hints" —
plus the being of yours that may spend it, because the outbound record "says
which of its beings may spend which relation." Without this a subject can only
ever be a door, and a third of the obligations are the caller's.

**The seeds are the thirty-two bytes Article VI names.** For a signing pair,
the seed as Ed25519 defines it; for the padlock, the X25519 private key itself.
Your kit derives the public halves by the algorithm's own rules, and if it
derives them differently the scenario fails at `stand`, which is the earliest
and clearest place to fail.

**The warden's own heir arrives twice, and you take whichever your kit wants.**
`heirSeed` is for a kit that mints the warden's heir itself; `heirCommitment`
is for a kit that holds the owner's heir outside the runner's reach, as
Article XIII describes, and never sees the key. Both name the same heir, so no
subject has to derive one from the other. This is not a choice the protocol
makes — it is two honest places to keep one key, and the contract refuses to
force either.

**`clock` and `random` are queues, drawn in order.** This is the contract's
load-bearing part. Article II hands both in — "The clock and the randomness,
which are handed in rather than reached for" — and that is what lets a scenario
pin exact bytes for a message your kit seals. A kit that reaches for the system
clock or the system RNG cannot be driven, and cannot be shown to conform.

**A clock queue may go backwards, and your kit must not assume it does not.**
Article VIII rules the case — where a door's own two readings yield a dwell
below zero, the onward budget is the arriving one — and the `dwell` scenario
hands in a queue that falls at every reading to drive it. Handing on more time
than arrived is a widened leash, and refusing the call is punishing a peer for
this door's clock; the ruling is neither.

**Drawing past the end of a queue is an error, not a refill.** A kit that drew
more than it was given has told the scenario something, and a silent refill
would hide it.

**No scenario asks how far you drew.** Kits take their draws at different
moments — one hands them to the door per message whether or not a seal
follows, another draws only when it seals — and both are conforming, because
Article II hands the randomness in without saying when it is spent. So the
queues exist to make bytes deterministic, and a draw _count_ is never
asserted. What a scenario asserts instead is the bytes themselves: two seals
that must differ carry two different ephemeral keys, and both are pinned.

### `door`

```json
{ "do": "door", "bytes": "…" }
```

Reply: `{"answer": "…", "onward": ["…"]}` or `{"answer": null, "onward": []}`.

Hand the bytes to your door exactly as a carriage would. `null` is silence.

**`onward` is every ask your warden composed while judging these bytes**, in
the order it composed them, and it is empty for every call that reached no
being with an `onward` of its own. A door with no such being answers `[]` here
always, and the two are the same thing: nothing was handed onward.

This is distance zero, which Article III names as a carriage like any other and
rules on directly: **"distance zero waives no step of the judgment."** So no
step may be skipped because no socket was involved, and the bytes you are
handed are your own copy.

### `amend`

```json
{ "do": "amend", "voice": "…", "add": ["…"], "remove": ["…"] }
```

Reply: `{}`.

**The one thing a door does to a standing that is not a message.** Article VII:
"the warden adds a being to a voice's row or takes one away; nobody is told, no
secret is minted, and the holder finds it on its next describe." So this
crosses no wire, spends no number and mints nothing — it is the house changing
its own mind, and the only way anyone learns of it is by asking again.

Add first, then remove. **Taking the last being away is release**, and there is
no separate act for it: the row goes, and that voice is a stranger here
afterwards. Do not invent a separate release, and do not keep an empty row —
a voice with a row holding no beings is a state the law does not have.

Your kit almost certainly spells this as two calls rather than one; that is
fine and expected. What the contract fixes is the effect, not the spelling.

### `depart` and `landed`

**Migration is one message sent twice, so it is two verbs at two doors.**
Article XIV: "First the origin's committed heir, carrying as its next
commitment the one `receive` answered, and naming the new door, its padlock and
its hints. Then the key the destination generated, sent by the new house
itself."

```json
{
  "do": "depart",
  "being": "…",
  "heirSeed": "…",
  "commitment": "…",
  "gone": { "name": "…", "padlock": "…", "hints": [] },
  "news": [{ "ephemeral": "…", "seq": "1", "allowance": { "time": "5000", "hops": "4" } }]
}
```

```json
{
  "do": "landed",
  "hints": [],
  "news": [{ "ephemeral": "…", "seq": "1", "allowance": { "time": "5000", "hops": "4" } }]
}
```

Reply, for both: `{"news": ["…"]}` — **the sealed bytes your warden composed,
one per peer owed the news, in the order your kit reads its peers.** A door with
no peer to tell answers `[]`.

**`depart` is the origin's half**, after the cargo has landed. It publishes the
succession of the being's committed heir and stops the door acting for that
being: the standings stay so a peer is still pointed, the relations went with
the cargo. `commitment` is the one `receive` answered — the one fact the origin
cannot invent — and `gone` is where the being answers now, carrying the new
door's name, its padlock and its roads. **It is nested because every one of its
three fields is a field of the `word` your kit composes**, and a flat `name`
beside a being and a commitment reads like this door's own. **`heirSeed` is the being's committed heir**, given because a kit that
does not hold that key needs it and a kit that holds it will ignore it; both
name the key `stand` already committed to.

**`landed` is the destination's half**, after a cargo has arrived. It needs
nothing but the roads this door answers on, because everything else already
arrived: the word your `receive` composed, the key you generated, and the peers
that came with the standings. A kit that fixed its roads at `stand` may ignore
`hints`.

**The bytes are the point, and they are yours.** Each entry in `news` is one
piece of news your warden composes: the ephemeral it seals with and the number
it spends against that peer's own mark, handed in like every other draw. **What
a scenario asserts is the envelope your kit produced** — the word's fields
present and absent by the case, the voice the peer can believe it from, the
recipient, and this door's own padlock and roads inside.

**Do not compose the word yourself.** Every field of it is reachable from
outside — the door's name and padlock are yours to read, the being's key came
from a seed handed in, the commitment is one hash — so a subject that built the
word and asked the kit only to seal it would go green while asserting nothing
about your warden. **The word is the warden's or the case is worthless**, and
this is the same rule the leash carries above, for the same reason.

**If your kit cannot compose one of the two, say so rather than fill it in.**
That is a finding about the kit and it is worth more than a green run — two kits
were missing one half each when this verb was written, and both were found this
way.

### `succeed`

```json
{ "do": "succeed", "nameSeed": "…", "heirSeed": "…", "heirCommitment": "…" }
```

Reply: `{}`.

**The house moving its own name.** The heir it committed to spends: from here
on the door signs by that key and is addressed by it, and the key it commits to
next is named by the two fields after it. Like `amend`, this crosses no wire,
spends no number and mints nothing — the peers that need to know are told by
news, which is a separate act and not this one.

`nameSeed` is the heir this door committed to. **A key the door never committed
to is an error, not a silent no-op**: a scenario that thought it had succeeded a
door and had not would go on asserting against a door that never moved.

**The next heir arrives twice for the same reason it does in `stand`.**
`heirSeed` is for a kit that mints the heir itself; `heirCommitment` is for a
kit that never sees the key. Both name the same heir.

**Your standings do not move.** Each inbound row keeps the name its own
commitment was minted under — Article XIV: "a door stores the name each was
minted at ... and keeps verifying it there; new commitments are minted under
the new one." A kit that re-derived a row's name from the door's current one
would refuse the rotation a holder behind the news is entitled to make.

### `state`

```json
{ "do": "state", "being": "…" }
```

Reply: `{"cargo": { … }}` — **Article IX's `cargo`, in JSON**.

**Report the cargo as it would travel with that being, not a dump of your
records.** Article IX's cargo is what a migration carries, so a standing in it
is that voice's row **as it goes with this being**: what else that voice may
reach here is your door's affair and stays. Two kits disagreed on this and the
contract had not said, which was the contract's fault rather than either
kit's — so no scenario reads a row's whole membership from here, and one that
wants to watch a standing widen watches the holder's next describe, which is
where Article VII puts it. **A being this
door does not hold answers `{"cargo": null}`**, which is a record that does not
exist rather than a fault: a destination is asked about a being before it
arrives, and "nothing here" is the true answer.

**A being that has departed is one of those, and the contract says so because
two kits read it differently.** After a `depart` this door keeps the succession
it published and answers `moved` with it — but the being itself has gone, and a
cargo is what travels _with_ a being. It would travel from the new house now,
not from here. So `cargo` is `null` for a departed being, exactly as it is for
one that never arrived. **Nothing on the wire turns on this**: both kits point,
and both meet every other ask with silence. It is the harness's window that
needed saying, not the law.

```json
{
  "being": "…",
  "digest": "…",
  "cells": "",
  "standings": [
    {
      "voice": "…",
      "commitment": "…",
      "name": "…",
      "beings": ["…"],
      "mark": "0",
      "spent": [],
      "padlock": "…",
      "hints": []
    }
  ],
  "relations": [
    {
      "warden": "…",
      "commitment": "…",
      "padlock": "…",
      "voice": "…",
      "heir": "…",
      "seq": "0",
      "news": "0",
      "hints": []
    }
  ]
}
```

**The conformance kit invents no state format.** `cargo` is the record the
constitution already declares for migration, and it carries exactly what a
verdict turns on: per standing the `mark`, the `spent` list, the `commitment`
and the `name` it was minted under; per relation the two counters `seq` and
`news`. Article II leaves you free in how you _store_ your records — `cargo` is
what those records look like when they cross, which is the only level at which
five implementations that store differently can be read the same way.

Two ordering notes, neither of them protocol. `standings` is sorted by `voice`
ascending and `beings` within a standing likewise, so that two readings of one
state are one text. The law derives an _estate's_ order (Article X) and says
nothing about a cargo's; this order is the harness's and decides nothing.

**Say what you cannot report, and say it in `cannot`.** The reply carries a
second field beside `cargo`:

```json
{ "cargo": { … }, "cannot": ["standings.*.name", "relations.*.news"] }
```

Each entry is a field path, with `*` for an index. A path listed there means
your kit has no such fact to give — not that the fact is absent, which is an
ordinary `null`. Those two are different and only you know which is which: a
row whose padlock is null because your door never learned it has **disagreed
with the law**, while a row whose padlock you cannot read has only **failed to
answer**. Reading both off a null would call the first the second and let a
real divergence pass as a missing accessor.

A path in `cannot` produces a **gap** rather than a divergence. A gap does not
pass — but what it costs to fix is an accessor and not a judgment, and the two
are worth telling apart.

Two fields are worth naming because they are the ones a kit is most likely to
keep in memory and never export: `standings[].name`, the name a commitment was
minted under (Article XIV), and `relations[].news`, the mark kept for a far
warden's news, separate from `seq`, the count of what this door sends — Article
IX: "one field cannot be two counters." **Never report `0` for either.** A zero
reads as agreement and would be a lie.

### `send`

```json
{
  "do": "send",
  "ask": {
    "at": "…",
    "being": "…",
    "commitment": null,
    "seq": "1",
    "allowance": { "time": "5000", "hops": "4" },
    "method": { "name": "describe", "args": "" }
  }
}
```

Reply: `{"bytes": "…"}`, or `{"bytes": null}` when your caller **refuses to
send**.

`at` names the far warden, which is what picks the outbound row — the relation
is already held, because `stand` wrote it. `being` is the being addressed at
that far door, or absent.

A third of the obligations are the caller's, not the door's, and refusing to
send is one of them — Article III: "the sender's kit refuses to send the second
ask while the first waits." A `null` here is an ordinary expected outcome, not
an error.

### `read`

```json
{ "do": "read", "answer": "…", "at": "…" }
```

Reply: `{"answer": {"warden": "…", "seq": "…", "data": "…"}}` — the record your
caller decoded — or `{"answer": null}` for silence. `data` is `null` where the
field answers nothing.

`at` is the far warden the ask was sent to. It is handed in because Article XI
makes it a check and not a lookup: "The signature is verified against the
`warden` the record itself carries; that this warden is the one the ask was
sent to is the caller's separate judgment." A subject that read the warden off
the record and then compared it with itself would pass that check by
construction.

Article XII gives an answer four checks at the caller's own end, and this is
where a scenario reaches them: unseal with the padlock the ask named, the
leading byte must say `answer`, verify against the record's warden which must
be the one asked, and **an ask must be awaiting under that padlock, that warden
and that seq.** The fourth is bookkeeping the caller keeps, not bytes it reads,
and `null` is the whole of what a failure of any of them looks like.

## What the contract deliberately does not ask you for

- **Not how you store anything.** `stand` hands keys in and `state` reads
  `cargo` out. Between those two, do as you like.
- **Not your replay window's width.** No scenario asserts a number whose
  verdict a width decides — only above the mark, at the mark, and already
  honoured.
- **Not your defaults, your delivery, or your key custody.** Article II leaves
  all of it to you, and a conformance kit that asserted any of it would be
  making one implementation the standard.
- **Not a network.** No socket, no HTTP, no container. Distance zero is a road
  the law names.

## What it cannot check, and says so

A harness can show your kit did not do a thing in the exchanges it was driven
through. It cannot show your kit never does it. So the negatives — the device
never appears, there is no suite identifier, no name resolves, Quo does not
grow into a file transfer protocol — are **named as uncovered** rather than
implied by a green run. Green is not the same as covered.

## What it costs you

Nine verbs over a kit you have already written, with no framework and no
network. The state readout is the only real work, and you did it already for
`receive`.

---

Copyright 2026 Razvan Gherghina

Licensed under the Apache License, Version 2.0. See LICENSE.
