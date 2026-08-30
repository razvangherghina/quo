# Releasing

This repository is emitted from a working tree, not edited in place. Anything
written here by hand is lost the next time it is emitted, so a change starts
at the source and arrives here.

`@quo-systems/js` reaches npm from a tag in this repository and from nowhere
else. The kit's `publishConfig` sets `provenance`, which needs the OIDC token
only a CI run holds, so a local `npm publish` fails on purpose. What that buys
is a package that proves which commit and which build produced it.

## The order

1. **Change the kit**, and keep it green where it is developed.
2. **Bump `version`** in `kits/js/package.json`.
3. **Write the entry** in `CHANGELOG.md`. The emit refuses to run when the
   version and the newest entry disagree — a version nobody described is a
   version nobody can tell apart from the one before it.
4. **Emit this repository** from the source tree.
5. **Commit and tag** `js-v<version>`. The tag must match the manifest exactly;
   the publish workflow checks it and stops rather than shipping a mismatch.
6. **Push with `--follow-tags`.** The tag fires `publish-js`, which runs the
   bench and publishes with provenance.

## The workflows

- **`kits`** runs on every push to `main` and every pull request: the JS bench
  on Node 20, 22 and 24, and the Go kit's `gofmt`, `go vet` and `go test`.
- **`publish-js`** runs on a `js-v*` tag. It needs an `NPM_TOKEN` secret on a
  GitHub environment named `npm`, and `id-token: write`, which it declares.

## The law moves too

The constitution is republished whenever it changes, in the same act that
changes it. This repository's whole promise is that citing a commit cites what
you built against; a law that moves without being republished is that promise
broken.
