# The vectors

Data the verifier replays, and the seam it speaks through.

- `HARNESS.md`: the requests a stand program answers on stdin and stdout, in
  full, and the errors it gives.
- `arithmetic.json`: the six algorithms against their own standards. One
  record is one precomputed case, taken from the standard that publishes it
  or built on one and saying how. A kit may check itself against it without
  running the verifier; a vector is a convenience and is not the authority.

The verifier's tests replay every record
(`verifier/test/arithmetic.test.js`), and
`vectors/test/vectors.test.js` holds the shape of the file.

```bash
node --test 'vectors/test/*.test.js'
```
