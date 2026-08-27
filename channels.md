
# The channels — File and Stream

Article IV's channel law names the two types and delegates their whole
choreography here. This paper is the interop surface: a conformant
implementation built from these sentences exchanges a two-kilobyte PDF
or a two-gigabyte binary with any other, without reading its code. What
either side does with bytes at rest is custody's own and appears nowhere
on this surface.

## The two types

`File` is a type of the interface language, valid in query and mutation
positions. It is bounded bytes as a value: content whose size is known
and whose identity is its digest.

`Stream` is a type of the interface language, valid only in
`Subscription` root fields. It is unbounded bytes as a standing flow —
now-only on the wire: a frame not carried while the lane stood is not
carried by this surface at all, and rewind or replay is a being's own
offering (a `File` of a recording), never a lane feature. An interface
naming `Stream` anywhere else does not compile: the refusal is the
schema's, before any door exists.

Neither type ever carries content through the interface. A `File` or
`Stream` value crossing a door is **facts about bytes** — the bytes move
only at the paths below. `@rights` on a `File` or `Stream` field is the
whole access law for its bytes: the field the caller's rights do not
open mints nothing, exactly as it answers nothing.

## The File choreography

A `File` crossing a door, in either direction, is exactly

```
{ digest, size, kind, name, ticket }
```

— `digest` and `size` as pinned below, `kind` an opaque label the
protocol never interprets, `name` an optional label of the same
standing, `ticket` the bytes' own key, present exactly where this
paragraph mints one. The choreography (Article IV): the ticket is minted
by the door in the same proven turn that carries the File, and travels
only inside the sealed answer.

**Down — a File in an answer.** A resolver answers facts; the door mints
a down-ticket scoped to the proven caller and places it in the
serialized File. The caller redeems it at the path with GET and verifies
the digest itself; the pipe proves nothing.

**Up — a File in an argument.** The argument arrives as facts, without a
ticket. The answer echoes the File with an up-ticket; the caller then
lands the bytes at the path with PUT. Landing — the full declared size
arrived and hashed to the declared digest — is what completes the write;
until then the receiving being holds a declared fact awaiting bytes, and
a body that never lands leaves nothing.

A ticket is seat-scoped, expiring, and spent only by landing: a broken
carry leaves it standing at its last whole checkpoint, and it dies with
the seat that earned it.

**The checkpoint answer.** Asking again with the same File facts, while
an unspent up-ticket stands past its first checkpoint for the same seat,
echoes that same ticket rather than minting a fresh one, and the echoed
File carries the checkpoint — `offset` and `chain` beside the five
facts, nowhere else. That signed echo is the proof the chain section
names: the carrier resumes with PUT at the offset path and continues the
chain from there.

## The Stream choreography

Subscribing to an open `Stream` field is the same standing registration
any subscription is. Its first answer carries `{ kind, ticket }` — the
lane's key, sealed like every answer. Frames then flow on the live path
below, chained per frame. The lane ends when either side closes it, when
the ticket's seat falls, or when the transport drops — all three
indistinguishable to the far side, like every refusal.

## The paths

Redemption travels raw over the ground's published endpoint:

- `<endpoint>/blob/<token>` — PUT sends inbound bytes, GET receives
  outbound ones.
- `<endpoint>/blob/<token>/<offset>` — a continued redemption names the
  byte offset of the checkpoint it resumes from; an offset that is not a
  checkpoint the holder stands at is the same refusal as an unknown
  token.
- `<endpoint>/live/<token>` — the stream lane, frames in order.

## The chain

One primitive proves both lanes. The chain opens as 64 zero hex
characters and advances by SHA-256 over the previous chain's raw 32
bytes followed by the block. For a `File` the block is one cadence — a
byte count the ticket names — and a checkpoint is the byte offset and
the chain there; a resumed carry continues chain and bytes from a
checkpoint, never from zero. For a `Stream` the block is one frame, and
a lane opens its chain fresh at 64 zeros where it starts — a mid-stream
join proves continuity from the join, and claims nothing before it.
Whoever needs a checkpoint proved asks at the door and receives it as an
ordinary signed answer.

## The digest

SHA-256 over the plaintext content, spelled as 64 lowercase hex
characters. It is the File's identity between the two parties and the
only integrity either side checks; sealing at rest, on either side, is
invisible to it.

## The refusal spelling

A refused redemption completes the exchange carrying nothing. Over HTTP:
a landing acknowledges 2xx, a serving answers 2xx with the bytes, and
everything else — status, header, or silence — is one indistinguishable
refusal; no other transport fact carries meaning, exactly as the
carriage holds for envelopes.

## What is deliberately not pinned

The cadence's default number, the ticket's encoding, what stands beneath
either side's rest, and every caller ergonomic are implementation. The
op set is untouched: everything above rides `ask` — the one act the door
carries (IV) — and the standing subscription machinery; nothing here is
a second act, and no act exists that is not a declared field.

---

Copyright 2026 Razvan Gherghina

Licensed under the Apache License, Version 2.0. See LICENSE.
