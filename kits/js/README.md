# @quo-systems/js

The JavaScript kit for **Quo**, a protocol that answers one question — **by
whose authority** — and refuses every other one.

Everything arrives at a door signed, sealed to its recipient, and judged by
whose seal it wears. There is no login, no session and no ambient permission:
standing is granted by invitation and spent once.

This kit is written from the Quo constitution alone. It carries the canonical
blueprint notation, the wire encoding of the closed types, the arithmetic, the
envelope and a warden that judges what arrives.

**Zero dependencies.** The core is WebCrypto and `Uint8Array`, so a browser tab
runs it unchanged. Only the listening door touches Node.

> Early release. The protocol is not sealed before 1.0.0 and the wire may still
> move. Pin an exact version.

## Install

```
npm install @quo-systems/js
```

Node 20 or newer.

## Use

The portable half — notation, wire, arithmetic, envelope, warden, carriage:

```js
import { parse, digest, seal, open, Warden, post } from '@quo-systems/js';
```

The listening door is a host adapter behind its own export, so a tab or a
worker can import the kit without importing an API it could never satisfy:

```js
import { serve } from '@quo-systems/js/door';

const door = await serve(warden, { clock, random, host: '0.0.0.0', port: 8443 });
console.log(door.hint);
await door.close();
```

`serve` binds `127.0.0.1` unless you pass a `host`. Pass a `limit` to hold the
door to a maximum envelope size; anything larger is met with silence, the same
as any other refusal.

## The line

`serve` and `post` are the common carriage: one request, one answer, a
connection per act. Beside it stands an optional second road — sealed envelopes
as length-prefixed frames over one persistent TCP connection, for the roads
where both ends are consenting grounds and TLS buys nothing, because the
envelope already carries all the crypto.

```js
import { dial, listen } from '@quo-systems/js/line';

// The listening end publishes its road on its warden.
const door = await listen(warden, { clock, random, port: 8443 });

// The dialling end publishes nothing and is reachable only down the line it
// holds — so either end may originate on it.
const line = await dial(guest, door.hint, { clock, random });
const answer = await line.carry(envelope, { warden: theirWarden, seq });

line.close();
await door.close();
```

A frame is an eight-byte signed length, most significant first, and then that
many envelope bytes — no header, no correlation id, nothing outside the seal
that carries meaning. Silence has no wire form: a refused ask simply produces
no frame, so a zero-length frame is malformed and drops the connection. The
line refuses to open at all under `DEFAULT` (16,384 bytes), the envelope size an
undeclared end promises; a door with another appetite says so with `?cap=` on
the road it publishes. `CAP`, `DEFAULT` and `UnderTheDefault` are exported
beside `dial` and `listen`.

The line has a second address form for the paths a bare socket cannot walk — a
browser tab, an edge that passes only the web — and it changes nothing above the
bytes: the same frames, carried as the binary messages of a WebSocket over TLS.

```js
import { dial, listen } from '@quo-systems/js/line-ws';

// `tls` is the key and certificate this end terminates with. Handed none, the
// server speaks plain HTTP and an edge in front of it does the TLS — then the
// hint is the operator's to give, with `hint`.
const door = await listen(warden, { clock, random, port: 8443, tls: { key, cert } });

// `wss://host[:port][/path][?cap=N]`. The port absent means 443, and the path
// is dialled exactly as given and never parsed, because one domain often fronts
// many doors. `ws://` names nothing: in the clear the line is already `tcp://`.
const line = await dial(guest, door.hint, { clock, random });
```

A message's bytes are one frame exactly as above, length then envelope, so
everything said of frames, caps, silence and faults reads the same on either
form. What the WebSocket adds — its handshake, its masking, its control frames —
is the road's own plumbing below the line: pings are answered there and the line
never learns one arrived. The dialling end takes `globalThis.WebSocket` wherever
the platform has one, which is what makes this the tab's road, and falls back to
the same framing over `node:tls` where it does not.

The constitution names the line as a standard road, never a mandatory one: the
common carriage stays the one every warden answers, and a warden that answers
the line answers it exactly as written there or has not answered it at all.

## Conformance vectors

The published package ships the vectors the kit is judged against, under
`vectors/`. A second implementation in another language can read them and prove
it agrees on the bytes.

## The protocol

- **[quo.systems](https://quo.systems)** — the guide from a ten-minute demo
  to the full API reference, the law with worked examples, the conformance
  proof, and a demo that runs in your own tab.
- **[github.com/razvangherghina/quo](https://github.com/razvangherghina/quo)**
  — the constitution and both kits, source of this package.

## License

Apache-2.0. Quo belongs to
[Razvan Gherghina](https://www.linkedin.com/in/razvangh/) as a private person,
and is published so anyone may implement it in any language and speak with
every other implementation as an equal.
