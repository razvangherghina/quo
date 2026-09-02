# Quo — the Go kit

The Go implementation of **Quo**, a small, open protocol that answers exactly
one question — _by whose authority?_ — and refuses every other.

```
go get quo.systems/kit
```

Go 1.24 or newer. The import path is `quo.systems/kit` and it always will be:
it names the protocol rather than a host, an account or a company, because no
vendor owns Quo.

Go resolves an import path to a repository root, so the module cannot be
fetched from this subdirectory. The same source is published whole, at the
root of [github.com/razvangherghina/quo-go](https://github.com/razvangherghina/quo-go),
and quo.systems serves the tag that points there. The two are one mechanism:
this tree is the source, that repository is the address.

## Three parts

**A being** is a plain Go struct. It holds its own fields and writes its own
methods, and Quo never looks at either. What crosses to a stranger is its
blueprint — a short text naming the fields it declares — and nothing else. A
being embeds `warden.Attach` to receive its closure, and reaches a being
elsewhere through a handle, on which every declared field is a call that
answers a value or silence. It never sees a key, a road, or the machine it
runs on.

The closure it is handed is the whole of its API to Quo:

- `Being` and `Standings` — the pk it is named by, and who holds a place at it
  as voices only.
- `Relation` and `Relations` — the handles under one private label of its own.
  A label resolves nothing and travels nowhere.
- `Grant`, `Amend` and `Release` — the social acts, which a being may wrap in
  fields of its own. Granting nothing grants the being itself.
- `Accept` — an invitation received as data, turned into a handle per being the
  standing names, with the double rotation done and impossible to forget.
- `Knock` — a card received as data, turned into a handle at the far door's
  public being, held as a stranger.
- `Reread` — a standing widened after it was accepted, read again from the far
  door rather than remembered.
- `Hold` — a smaller being minted beside it, dropped again with `Release`.

Beside the fields its blueprint declares, every handle offers `Describe`, the
estate the far door shows this voice; `Sketch`, that being's own; `Blueprint`
by digest; and `Limit`. Each answers a value or silence like any other ask, so
a being can learn what it may reach rather than being told in advance. The
caller and the leash reach a method through its context, as `warden.Of(ctx)`,
because Go has no ambient scope and one warden serves several calls at once.
What a being provides rather than receives is `Cells` and `Take`: what of its
state moves with it, and how it takes that state back.

**The warden** is the door. It holds beings, keeps every key, and judges
everything that arrives. To roads it offers one entry point, `Arrive`, which
sorts an ask from an answer itself and hands back bytes or silence; a road
never opens a seal to route. To its own house it offers the two inward
channels, `Observe` and `Offer` — why it fell silent, and the caller it just
verified — because silence is toward the wire alone and a door that could not
tell its operator why it closed could not be run. What it never hands anybody
is a secret.

**The host** stands the warden up and stands roads in front of it. It hands in
the seeds, the clock, the randomness and the store, publishes a hint for every
road it listens on, and is delivery beneath the door: a row with hints goes to
the first road this ground can speak, a row without goes down the line that
peer's last ask arrived on, and neither is weather.

```go
package main

import (
    "context"
    "fmt"

    "quo.systems/kit/host"
    "quo.systems/kit/warden"
)

const dogText = `Dog
  name() text
  logWalk(minutes int) bool
`

// A being: an ordinary object, which never learns it has an address.
type Dog struct {
    warden.Attach
    walks []int64
}

func (d *Dog) Name() string { return "Rex" }

func (d *Dog) LogWalk(minutes int64) bool {
    d.walks = append(d.walks, minutes)
    return true
}

func main() {
    // Two grounds, each a warden of its own, meeting over a real road.
    alice, err := host.Open(host.Standing{Roads: []string{host.HTTP}})
    if err != nil {
        panic(err)
    }
    defer alice.Close()
    bob, err := host.Open(host.Standing{Roads: []string{host.HTTP}})
    if err != nil {
        panic(err)
    }
    defer bob.Close()

    rex := &Dog{}
    if _, _, err := alice.Warden.Hold(rex, warden.Holding{Blueprint: dogText}); err != nil {
        panic(err)
    }

    // Alice grants a standing at Rex. The invitation is the whole of first
    // contact, and getting it to Bob is not Quo's business.
    invitation, err := rex.Quo().Grant(nil)
    if err != nil {
        panic(err)
    }

    // Bob accepts, which rotates to a key nobody else has ever seen, and holds
    // a handle per being the standing names. Every call on one answers a value
    // or silence.
    ctx := context.Background()
    handles, err := bob.Warden.Accept(ctx, invitation, warden.Accepting{Label: "rex"})
    if err != nil {
        panic(err)
    }
    handle := handles[0]
    name, ok := handle.Call(ctx, "name")
    fmt.Println(name, ok)
    fmt.Println(handle.Call(ctx, "logWalk", int64(12)))
}
```

## What a host calls on the door

Beyond opening the warden and handing it bytes, a host has a small surface of
its own on `*warden.Warden`, and this is the whole of it:

- `Publish`, `Retract` and `Hints` — the roads this door answers on, told to it
  by whatever stood them up, because only a road knows where it ended up.
- `Card` — what a stranger begins from: the name, the heir commitment, a
  padlock, and whichever roads the host chooses to publish.
- `Arm` — a commitment this door will take a standing over for, held at the
  door and spent by the first message that proves it.
- `Learn` — the heir commitment of a being this ground stands at, as a describe
  handed it over, without which no succession of that being can be believed.
- `Observe` and `Offer` — the two inward channels.

## The packages

- `notation` — the arithmetic's names, digests and parsing.
- `arithmetic` — the keys, the signatures and the derivations.
- `envelope` — the sealed letter, and the two faces of it.
- `wire` — the bytes on the socket.
- `carriage` — carrying a letter from one house to another.
- `line` — the second road: framed envelopes over one persistent connection.
- `warden` — the door: who is admitted, on whose standing, and for what, and
  the closure a being is handed.
- `host` — the warden stood up, the roads in front of it, and delivery beneath.
- `cmd/subject` — a small executable that speaks the protocol for you, so a kit
  in another language can be shown to speak to this one.
- `cmd/conformance` — this kit answering the conformance subject contract, so a
  scenario written against the law can be run over it.

Both commands stand below the seam an application stands on: they compose asks
a handle could never encode, and each says so at the head of its own file.

Every package ships its bench beside it:

```
go test ./...
```

The bench reads the pinned corpus from the JavaScript kit beside it, under
`../js/vectors`. Both kits are judged against the same bytes, and the crossing
between them is what proves the constitution is implementable from its text
rather than from anyone's source.

## Licence

Apache-2.0. See the `LICENSE` at the root of this repository.
