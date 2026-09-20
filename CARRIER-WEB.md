# Quo over the web

This is one carrier of Quo, in two forms: the post and the held line. Any
other carrier is a kit's own. Every term here is the term `SPEC.md`
defines, and a frame is the frame of `CARRIER-TCP.md`.

A listener answers for the wards behind it. A dialer asks, and the
listener answers.

## The addresses

In an invitation's `at`, this carrier writes four schemes.

- `https` and `http` name the post. The address is the URL the dialer
  posts to.
- `wss` and `ws` name the held line. The address is the URL the dialer
  opens.

An address is a URI of RFC 3986 with a host, and any port, path and query
it needs. An address with user information or a fragment is not one of
this carrier's.

`https` and `wss` carry the bytes inside TLS. `http` and `ws` carry them
plain. The bytes of Quo are the same in both.

## The post

The post is one ask in one HTTP request, and its reply in the response.

The dialer sends a `POST` to the address. Its body is the ward pk, sixty-four
raw bytes, followed by the ask's box. The listener routes by that ward pk.
It is never read from the box. The request's `Content-Type` is not read.

A response of status 200 with a body that is not empty is a reply, and its
body is the reply's box. A reply's box above the size reads as silence.
Every other response is nothing.

A listener that gives nothing answers status 204 with an empty body.
Two listeners answer any status other than 200: one that does not carry
an ask, and one that answers for no ward under that pk. After either,
the ask may be sent again. A listener never answers status 200 with an
empty body.

A request that is not a `POST`, or whose body is shorter than sixty-five
bytes or longer than 1,048,640, is not an ask. The listener answers it
with a status other than 200 and 204.

A listener that answers pages of other origins answers them as the CORS
protocol of the Fetch standard says. Which origins it answers is its own.

## The held line

The held line is a WebSocket of RFC 6455, opened to the address. It
carries many asks at once, and either side closes it at any moment.

The dialer offers the subprotocol `quo`, and the listener selects it. A
listener refuses a handshake that does not offer it, or completes it and
answers no frame on that connection.

Each message is binary and carries one frame body: kind, id and rest, as
`CARRIER-TCP.md` writes them, with no length in front. The message's
length is the body's length. The three kinds, their rest, their
directions and the id are those of `CARRIER-TCP.md`.

A binary message longer than 1,048,645 bytes or shorter than five is not a
frame, and so is a text message. The rest of what `CARRIER-TCP.md` says is
not a frame holds as written. The side that reads one closes the
connection.

A frame of a kind a side does not read is read, nothing is said to it, and
the connection stands.

## Nothing on the web

Nothing means the ask was not delivered, as `CARRIER-TCP.md` says, on the
post and on the held line alike. After the bytes reach a door that answers,
the answer is a reply and never nothing.

A post whose response never came may have been heard. How long a dialer
waits is its own.
