# Quo over TCP

This is one carrier of Quo. Any other carrier is a kit's own. Every term
here is the term `SPEC.md` defines.

## The line

A listener holds a TCP address, a host and a port, and answers for the
wards behind it. A dialer opens a connection to that address and asks on
it. The dialer asks and the listener answers.

A connection carries many asks at once. Either side closes it at any
moment.

Quo names no port. An address is whatever reaches the listener.

In an invitation's `at`, this carrier's scheme is `tcp`, and an address is
written `tcp://host:port`. The host is a name, an IPv4 address, or an IPv6
address in brackets, as RFC 3986 writes them. The port is decimal. An
address with a path, a query, a fragment or user information is not one of
this carrier's.

The frames are the same bytes on any reliable stream that reaches the
listener, plain TCP, TCP inside TLS, or a tunnel.

The line does not greet. The first bytes a dialer sends are its first
frame.

## The frame

```
frame   = length (4, big-endian) || body
body    = kind (1) || id (4, big-endian) || rest
```

`length` counts the bytes of `body`.

There are three kinds and no fourth. `rest` follows the kind.

```
00  ask       rest = ward pk (64) || box      dialer to listener
01  reply     rest = box                      listener to dialer
02  nothing   rest = empty                    listener to dialer
```

The ward pk in an ask is sixty-four raw bytes, the signing pk followed by
the padlock, the key `SPEC.md` writes as 128 hex. The listener routes by
it. It is never read from the box.

The box is the box of `SPEC.md`, an ask's box on 00 and a reply's box on
01.

The dialer chooses the id. The listener copies it onto the reply or the
nothing that answers that ask. A dialer that reuses an id among its asks
in flight does not tell their replies apart. Replies arrive in any order.

## What is not a frame

The largest body is 1,048,645 bytes: one kind byte, four id bytes,
sixty-four pk bytes, and a box of 1,048,576.

A length above 1,048,645 is not a frame. A length below five is not a
frame. A kind that is none of the three is not a frame. An ask with fewer
than sixty-four bytes after its id is not a frame. A nothing with bytes
after its id is not a frame.

Nothing after one of these is read on that stream. The side that reads one
closes the connection.

A frame of a kind a side does not read is a frame: a reply or a nothing at
a listener, an ask at a dialer. It is read, nothing is said to it, and the
connection stands.

An ask's box is `length - 69` bytes. A body of 1,048,645 carries a box of
1,048,576. A reply's box is `length - 5` bytes. A reply's box above the
size is a frame, and it reads as silence.

## Nothing

02 means the ask was not delivered. The listener answers for no ward under
that pk, or did not hand those bytes on.

After the bytes reach a door that answers, the answer is a reply and never
02. When a door gives nothing, the listener answers 02 or writes no frame
for that id.

A listener that does not carry an ask answers 02, and the ask may be sent
again.

A connection that closes with asks in flight answers none of them.

An ask whose frame never left was not delivered. An ask whose frame left
may have been heard. How long a dialer waits for its answer is the
dialer's own.

## The empty ask

The empty ask is framed as 00, like every other ask. Its reply comes back
as 01.
