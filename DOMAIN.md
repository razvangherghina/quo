# A domain vouches for a ward

This document says how a domain name vouches for a ward. It is published
beside `SPEC.md` and is not part of it. A door reads none of it, and no
relation depends on it. Every term here is the term `SPEC.md` defines.

A ward's name is its ward pk, and nothing in the bytes of Quo ties it to a
domain. A person handed an invitation may still want to know whose ward it
is. This document lets the holder of a domain answer: this ward is ours.

## The file

A domain vouches at one URL: `https://`, the domain, then
`/.well-known/quo`. The domain is a host name as RFC 3986 writes it, read
without regard to case. No port and no other path is written.

The reader sends a `GET` to that URL over TLS, and checks the server's
certificate for that domain. A response of status 200 carries the file in
its body. Every other response vouches for nothing. A redirect is not
followed, so the file always comes from the domain it vouches for. The
response's `Content-Type` is not read.

The body is a value, as the chapter on values of `SPEC.md` reads one. A
body above 1,048,576 bytes vouches for nothing.

## The shape

```
vouch = { wards }
```

`wards` is an array. Each item that is a ward pk, 128 lowercase hex, is
vouched for by the domain. An item of any other kind or spelling is
skipped. A field beside `wards` is ignored.

A body that is no value, or is not one object, vouches for nothing. So
does an object with two keys of one name among its own keys, compared as
`SPEC.md` compares a payload's. So does an object whose `wards` is absent
or not an array.

## What a vouch says

A ward that the file of a domain lists is vouched for by that domain. The
holder of the domain names the ward as its own.

A vouch is for the one host it was read from. The file of `example.com`
vouches for nothing at `shop.example.com`, and the reverse holds too. Each
host that vouches serves its own file.

A vouch says nothing of where the ward is reached. A ward vouched for by
`example.com` may be reached at any address, on any carrier. An
invitation's `at` still says where.

A vouch says nothing of any relation and nothing of what stands behind a
door. A ward the file does not list is not vouched for by that domain,
whatever it listed before, and every relation on it stands as it stood.

Which domain a kit checks for a ward, when it reads the file, and how it
shows what it read are the kit's, as question 28 of `KIT-SPEC.md` asks.
