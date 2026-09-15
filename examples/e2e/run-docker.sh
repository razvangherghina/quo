#!/usr/bin/env bash
# Stands the world of `SCENARIOS.md` in containers and runs the same
# suite `npm test` runs on loopback against it: builds and starts `js`, `rust` and `observer` (`compose.yaml`), waits for
# the Rust stand's own build (its healthcheck), builds and runs `driver`
# once, then tears the whole world down, whatever the suite decided.
# Loopback's own `npm test` is untouched by any of this: it never sets
# `E2E_DOCKER` and never sees this file.
set -uo pipefail
cd "$(dirname "$0")"

docker compose up -d --build js rust observer
up_status=$?
if [ "$up_status" -ne 0 ]; then
  echo "run-docker.sh: js/rust/observer did not come up" >&2
  docker compose logs --no-color >&2 || true
  docker compose down --remove-orphans >/dev/null 2>&1
  exit "$up_status"
fi

docker compose run --rm --build driver
test_status=$?

docker compose down --remove-orphans >/dev/null 2>&1
exit "$test_status"
