# @quo-systems/js

The JavaScript kit for **Quo**, a protocol that answers one question — **by
whose authority** — and refuses every other one.

Everything arrives at a door signed, sealed to its recipient, and judged by
whose seal it wears. There is no login, no session and no ambient permission:
standing is granted by invitation and spent once.

This kit is written from the Quo constitution alone. It carries the canonical
blueprint notation, the wire encoding of the closed types, the arithmetic, the
envelope, a warden that judges what arrives, and the roads that carry bytes to
it.

**Zero dependencies.** The core is WebCrypto and `Uint8Array`. A ground that
only calls out — a browser tab, a worker — imports the kit and never reaches a
host module; the roads that listen name Node inside the function that stands
them, so nothing loads until a ground asks for that road.

> Early release. The protocol is not sealed before 1.0.0 and the wire may still
> move. Pin an exact version.

## Install

```
npm install @quo-systems/js
```

Node 20 or newer.

## A being, and what Quo hands it

A being is a plain class. Quo never looks inside it. What crosses to strangers
is its **blueprint** — a closed set of types, canonical text, its digest its
identity — and a method the blueprint does not declare does not exist for a
peer.

The warden hands each being it holds a closure at `this._quo`. That closure is
the whole of the being's API to Quo: the caller during a call, the standings
held at it, its relations elsewhere, and the social acts. It never sees a key,
a seal, a road, or the machine it runs on.

**The underscore is the whole point.** The notation's identifier is a letter
then letters and digits, so no blueprint can spell a name beginning with one.
Your class may therefore declare any field its blueprint names — `quo`,
`describe`, `being`, anything — without the kit eating it.

```js
const DOG = `Dog
  name() text
  logWalk(minutes int) bool
  invite() invitation
`;

class Dog {
  constructor(name) {
    this.dogName = name;
    this.walks = [];
  }
  name() {
    return this.dogName;
  }
  logWalk(minutes) {
    this.walks.push(minutes);
    return true;
  }
  async invite() {
    return this._quo.grant(this);
  }
}
```

The whole of it, on one screen:

- **`this._quo.caller`** — during a call, the verified voice and the kind the
  judgment found. A fact for telling callers apart, never a judgment of its own.
- **`this._quo.leash`** — the allowance that arrived, to be handed on and never
  widened.
- **`this._quo.standings()`** — who holds a place at me, as voices only.
- **`this._quo.relation(label)`** — a handle at a being elsewhere, under a
  private label of this ground's own.
- **`this._quo.grant(target)`**, **`amend(voice, { add, remove })`**,
  **`release(target)`** — the social acts. `grant(this)` opens the being itself.
- **`this._quo.accept(invitation, { label })`** — an invitation received as data
  turned into handles, with the double rotation done. A standing names beings,
  so this answers one handle per being it names.
- **`this._quo.knock(card, { label })`** — a card turned into a handle at the far
  door's public being, held as a stranger.
- **`this._quo.hold(object, { blueprint, label })`** — a smaller being minted
  beside this one, and **`release`** drops it.
- **`cells()`** and **`take(bytes)`** — what the being provides rather than
  receives: what of its state moves with it, and how it takes that state back.

A handle looks like what it is: every declared field is an asynchronous method
that answers a value or **silence**, which is `null` and means refused, broken
or absent with no way to tell which. **Weather is kept apart from silence**: a
road that never carried the bytes is not the far door's refusal, so the handle
still answers `null` but the warden's `observe` callback is told the road's
fault — `weather`, with the roads tried, or `no road`, when no hint offered
was one this ground can speak. Nothing crosses the wire for it.

Beside those fields every handle carries the door's own introspection —
`describe()`, the estate the far door shows this voice; `sketch(being)`, one
being's own, this handle's when asked for none; `blueprint(digest)`; and
`limit()`. Each answers a value or silence like any other ask. `handles()`
reads the standing again, so a standing widened by an `amend` is found rather
than remembered. Where the being's own blueprint declares one of those names,
that declaration is what the name means — which is the case at a public being,
whose class declares all four itself.

## The ground

`host` opens a warden on the seeds, the clock, the randomness and the store it
is handed, stands the roads it is asked for in front of that warden's one door,
and is delivery beneath it. It holds no secret of its own.

```js
import { seeds } from '@quo-systems/js';
import { host } from '@quo-systems/js/host';

const random = () => crypto.getRandomValues(new Uint8Array(32));
const clock = () => Date.now();

const alice = await host({ seeds: seeds(random), clock, random, roads: ['http'] });
const bob = await host({ seeds: seeds(random), clock, random, roads: ['http'] });

const rex = new Dog('Rex');
await alice.warden.hold(rex, { blueprint: DOG });

// Alice grants Bob a standing at Rex, out of band, and Bob accepts it.
const walker = await bob.warden.accept(await rex.invite(), { label: 'rex' });

console.log(await walker.name()); // 'Rex'
console.log(await walker.logWalk(12n)); // true

await alice.close();
await bob.close();
```

The roads `host` can stand are `'http'`, `'tcp'`, `'wss'` and `'memory'`, the
last being two grounds in one process reaching each other by handing bytes
across. `hints` are the roads callers should take where the socket is not the
address; `store` is where the warden keeps what must survive a restart, memory
unless the host hands it somewhere else; `limit` is the size the door is held
to. A ground that stands no road — `roads: []` — is the tab: it publishes
nothing and is reachable only down the lines it dials.

## The common carriage

One request, one answer, a connection per act. `post` calls out and runs
wherever the kit does. Listening is the half that cannot be portable, so it
lives behind its own export.

```js
import { post } from '@quo-systems/js';
import { serve } from '@quo-systems/js/door';

const door = await serve(warden, { host: '0.0.0.0', port: 8443 });
console.log(door.hint);
const answer = await post(door.hint, envelope);
await door.close();
```

`serve` binds `127.0.0.1` unless you pass a `host`. Pass a `limit` to hold the
door to a maximum envelope size; anything larger is met with silence, the same
as any other refusal. Pass a `hint` where the socket is not the address —
behind a proxy the door listens on loopback and the world reaches it by a
domain. Handed none, the door publishes the socket it bound.

## The line

Beside the carriage stands an optional second road — sealed envelopes as
length-prefixed frames over one persistent TCP connection, for the roads where
both ends are consenting grounds and TLS buys nothing, because the envelope
already carries all the crypto.

```js
import { dial, listen } from '@quo-systems/js/line';

// The listening end publishes its road on its warden.
const door = await listen(warden, { clock, random, port: 8443 });

// The dialling end publishes nothing and is reachable only down the line it
// holds — so either end may originate on it.
const line = await dial(guest, door.hint, { clock, random });
line.carry(envelope);

line.close();
await door.close();
```

`carry` takes one envelope and answers whether the frame left. Nothing comes
back from it: the answer arrives as a frame of its own and is settled at the
warden's one door, which is what delivery beneath `host` does for you.

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

## The portable half

Everything that does not listen is on the barrel, for the ground that wants the
pieces directly rather than through a being:

```js
import { parse, print, digest, encode, decode, seal, open, Warden } from '@quo-systems/js';
```

The notation and its digest, the wire encoding of the closed types, the
arithmetic, the envelope, the warden itself, migration, and the carriage.

## Conformance vectors

The published package ships the vectors the kit is judged against, under
`vectors/`. An implementation in another language can read them and prove it
agrees on the bytes.

## The protocol

- **[quo.systems](https://quo.systems)** — the guide from a ten-minute demo
  to the full API reference, the law with worked examples, the conformance
  proof, and a demo that runs in your own tab.
- **[github.com/razvangherghina/quo](https://github.com/razvangherghina/quo)**
  — the constitution and every kit, source of this package.

## License

Apache-2.0. Quo belongs to
[Razvan Gherghina](https://www.linkedin.com/in/razvangh/) as a private person,
and is published so anyone may implement it in any language and speak with
every other implementation as an equal.
