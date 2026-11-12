# A link stands for an invitation

This document says how a short text, a link, stands for an invitation, and
how its holder asks for that invitation. It is published beside `SPEC.md`
and is not part of it. A door reads none of it, and no relation depends on
it. Every term here is the term `SPEC.md` defines.

An invitation carries its lock, 2368 hex, and is longer than a picture a
camera reads or a line a person passes on. A link is short. It names a ward
and carries a reference, and the ward gives the invitation to whoever asks
with that reference.

## The link

```
link = "web+quo:" reference "@" ward [ "?" query ]
```

A writer writes a link as a URI of RFC 3986. A reader holds a text to the
shape this chapter gives, and to nothing more of RFC 3986.

The scheme is `web+quo`, read without regard to case, as RFC 3986 reads
it. Everything after the scheme is read as it is written, and nothing in
the reference or the ward is decoded.

`reference` is from one to sixty-four characters, each a lowercase letter
from `a` to `z` or a digit. The side that writes the link chooses it. A
reader reads nothing in it.

`ward` is 128 hex, a ward pk. It is the ward the link names.

`query`, when present, is fields joined by `&`. A field that begins with
`at=` is an address field, and what follows `at=` is its value. Every
other field is skipped, an empty one included.

The value of an address field is an address, percent-encoded as RFC 3986
section 2.1 writes it. A writer encodes every character of the address but
letters, digits, `-`, `.`, `_` and `~`. A reader decodes every `%` followed
by two hexadecimal digits, of either case, and reads every other character
as it is written. A `+` is a `+`. A value with a `%` that two hexadecimal
digits do not follow is skipped, and so is a value whose decoded bytes are
not UTF-8.

The values that are left, in the order written, are then read as the
entries of an invitation's `at` are read: the addresses at which the ward
the link names is reached, the first the one the writing side prefers. A
value that would be skipped as an entry of an invitation's `at` is skipped
as an address, and the link is still a link. A link with no address field
carries no address.

A text of any other shape is no link. A text that holds a `#` is no link.

A link goes anywhere, as an invitation does. It is no invitation.

## The redeeming

The holder of a link redeems it with one ask on the zero head, sent to the
ward the link names.

The ask's `method` is `#redeem`. Its `args` is an object whose `reference`
is a string, the link's reference as the link writes it. A field of `args`
beside `reference` carries no meaning.

The ask is carried to an address the link carries, or to one the holder
learned its own way.

A reply that is an object whose `object` is an invitation redeems the
link, and that invitation is the one the link stands for. It is read as
`SPEC.md` reads an invitation.

Every other reply redeems nothing: silence, and an object that is no
invitation. Nothing means the ask was not delivered, as it does for any
ask.

Whether a ward answers a reference, to whom, how long and how often are
behind its door. Silence gives no reason, here as everywhere.

## What a redeeming shows

The ask is sealed to the padlock the link names, so only that ward reads
the reference. The reply is signed by that ward's signing key over the lid
of the holder's own ask, so no other ward wrote it. The ward the link names
gave the invitation.

The invitation may name another ward than the link does. The link then
shows that the ward it names gave an invitation to that other ward, and
nothing more of that ward.

A link shows nothing of who wrote it. Whoever holds a link may redeem it,
as whoever holds an invitation may knock.

Whether a kit writes links or reads them, and what it shows a person of
one, are the kit's, as question 19 of `KIT-SPEC.md` asks.
