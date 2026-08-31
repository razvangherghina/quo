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

## The Go kit

The Go kit is released differently, because Go releases differently. There is
no registry and no publish step: a Go module is versioned by its tag alone, and
the toolchain fetches the source.

The module declares `quo.systems/kit`, an import path that names the protocol
rather than a host. Go resolves such a path by fetching it over HTTPS and
reading a `go-import` meta tag, and that tag can only name a repository **root**
whose own `go.mod` declares the same path. Here the kit sits at `kits/go`, so
it is also published whole, at the root, as
[github.com/razvangherghina/quo-go](https://github.com/razvangherghina/quo-go),
with quo.systems serving the tag at `/kit`. That repository is emitted from the
same source tree as this one and nothing is authored there.

Cutting a version is therefore: emit that repository, prove it with
`go build ./... && go test ./...` where the kit stands alone, commit, and cut
the annotated tag `v<version>` — no `js-` prefix, because Go reads the tag as
the module's version. The number follows the JavaScript kit's minor, so the two
kits carry the same version. The push is what publishes.

## The workflows

- **`kits`** runs on every push to `main` and every pull request: the JS bench
  on Node 20, 22 and 24, and the Go kit's `gofmt`, `go vet` and `go test` on
  Go 1.24 — the floor the module declares — and on current Go.
- **`kit`**, in the Go repository, runs `go build` and `go test` there on the
  same two versions, because a bench that only ever runs beside its sibling
  proves nothing about the repository a Go builder actually fetches.
- **`publish-js`** runs on a `js-v*` tag. It needs an `NPM_TOKEN` secret on a
  GitHub environment named `npm`, and `id-token: write`, which it declares.

## The law moves too

The constitution is republished whenever it changes, in the same act that
changes it. This repository's whole promise is that citing a commit cites what
you built against; a law that moves without being republished is that promise
broken.
