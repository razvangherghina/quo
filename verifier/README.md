# The verifier

A checker any kit may run. It says where a kit departs from `SPEC.md`, and
nothing about whether the kit is good: passing it is necessary and never
sufficient. `../VERIFIER.md` is its document, what it holds and what it
refuses; this page says where its parts stand.

```bash
node verifier/cli.js [--cwd DIR] [--only NAME[,NAME]] -- <stand program>
node verifier/cli.js --two [--cwd DIR] -- <first program> -- <second program>
```

It needs Node 24 and nothing else. A stand program is one executable
answering the requests of `../vectors/HARNESS.md` on stdin and stdout.

| File | What it does |
| --- | --- |
| `cli.js` | the command: one kit, or two through the proxy |
| `verify.js` | the scenarios that judge a kit as a door and as an asker |
| `carried.js` | the scenarios that judge a kit as a carrier, and two kits together |
| `hold.js` | the verifier's own listener in every scheme, which a kit's dialer meets |
| `web.js`, `websocket.js` | the post and the held line, and RFC 6455 |
| `frame.js`, `address.js` | the frames of the line, and the addresses of a carrier |
| `value.js` | the values, payloads and replies of the spec |
| `primitives.js`, `mlkem.js` | the six algorithms, written out |

## Tests

```bash
node --test 'verifier/test/*.test.js'
```

The gate runs these, each under five seconds. Two of them start the
JavaScript kit's stand program: `verify.test.js` and `carried.test.js`.

One file of tests stands beside each file above that a test can reach: the
algorithms replay every record of `../vectors/arithmetic.json`, and
`test/verify.test.js` holds the proof that the verifier can fail, a kit
wrong on purpose (`test/bad-stand.js`) failed where it is wrong and the same kit
passed where it is not.
