# Quo conformance

You have written a Quo kit in a language none of the ones here is. This drives
your warden through the exchanges the constitution rules on and tells you, per
field, where it disagrees.

It needs Node 20 or later and nothing else. It carries no Quo kit, so it cannot
quietly hold your kit to another implementation's habits.

## What you write

One program: your warden with its inputs exposed. It reads one JSON object per
line on stdin and writes one back on stdout. Nine verbs, no framework, no
network. `CONTRACT.md`, beside this file, is the whole of it.

The keys, the clock and the randomness are handed in, which is what lets a
scenario pin the exact bytes your kit seals. A kit that reaches for the system
clock or the system random cannot be driven here, and cannot be shown to
conform.

## Running it

```sh
node conform.js -- ./my-subject
node conform.js --scenario leash -- python3 subject.py
```

Everything after `--` is the command that starts your subject. It is spawned
once per scenario, because each scenario stands its own warden from the keys it
hands in.

## Reading the report

Each exchange is one line, green or RED, with the articles it rests on in
brackets. Under them, each fault names the check, the field, what the scenario
expected and what your kit answered.

Two kinds of fault, and they cost different things to fix.

- **A divergence** is your warden disagreeing with the law. The scenario says
  what the bytes or the record must be, and yours were something else.
- **An unanswered fact** is your subject saying, in `cannot`, that it has no
  such fact to give. Your kit has not disagreed — it has not spoken. What it
  costs to fix is an accessor rather than a judgment.

Neither is a pass. The run exits non-zero for either.

## What the scenarios are

Data. JSON files under `scenarios/`, each an opening state, a list of exchanges
and the record after every one. Each exchange names the article it rests on and
states why it is derived the way it is. Nothing is generated at run time, so
what you are compared against is a file you can read.

The runner in `run.js` is deliberately small. If Node is inconvenient where you
work, rewrite it in your own language in an afternoon — it compares and it
reports, and it decides nothing. What must never happen is a runner that repairs
a mismatch into a pass.

## What green does not mean

A run shows your kit did not break the law in the exchanges it was driven
through. It cannot show your kit never does. Some obligations have no window a
harness can look through at all, and they are not implied by a green run.

Green is not the same as covered.

## The sixth kit

Five kits carry the law today — JavaScript, Go, Zig, Rust and Python — and that
set is closed. A sixth is a stranger's to write, from the constitution and the
pinned vectors, and this is how it is proved.

Where a scenario and the constitution disagree, the constitution wins and the
scenario is wrong. Say so at
<https://github.com/razvangherghina/quo/issues>.
