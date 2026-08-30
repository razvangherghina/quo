# Releasing

This repository is emitted from a working tree, not edited in place. Anything
written here by hand is lost the next time it is emitted, so a change starts
at the source and arrives here.

`@quo-systems/js` reaches npm from a tag in this repository and from nowhere
else. The kit's `publishConfig` sets `provenance`, which needs the OIDC token
only a CI run holds, so a local `npm publish` fails on purpose. What that buys
is a package that proves which commit and which build produced it.

## The order

1. **Change the kit** in the source tree, and commit it.
2. **Write the entry** in `CHANGELOG.md`. It is prose, so no script writes it,
   and the release refuses to run without it — a version nobody described is a
   version nobody can tell apart from the one before it.
3. **Run the release**, which bumps the manifest, runs the bench, emits this
   repository, commits it and tags `js-v<version>` — annotated, because
   `git push --follow-tags` silently ignores a lightweight tag.
4. **Push.** The tag fires `publish-js`, which checks the tag against the
   manifest, runs the bench and publishes with provenance.

The tag must match the manifest exactly. The workflow stops rather than
shipping a mismatch.

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
