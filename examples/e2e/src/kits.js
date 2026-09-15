// The two `stand` programs of `vectors/HARNESS.md` section 1, as
// executables the driver spawns and speaks the root channel to on stdin and
// stdout. Read only as programs to run: nothing here imports a kit's own
// library, in JavaScript or in Rust.

import { spawn, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dockerSpawn } from './docker-net.js';

// Set only by `compose.yaml`'s own `driver` service: the world stands in
// containers, and each stand is reached by
// `docker exec` into its own service rather than spawned as a local
// process. `docker-net.js`'s own top comment says which is the smallest
// honest bridge and why.
const DOCKER = Boolean(process.env.E2E_DOCKER);

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..');

const JS_STAND = join(repoRoot, 'examples/js/harness/stand.js');
const RUST_HARNESS_DIR = join(repoRoot, 'examples/rust/harness');
const RUST_STAND = join(RUST_HARNESS_DIR, 'target/debug/stand');

let rustBuilt = false;
function ensureRustBuilt() {
  if (rustBuilt) return;
  // Built once per process, always: cargo is incremental, so a stale binary
  // never stands in for the harness as it is now.
  const res = spawnSync('cargo', ['build', '--bin', 'stand'], { cwd: RUST_HARNESS_DIR, stdio: 'inherit' });
  if (res.error?.code === 'ENOENT') throw new Error('cargo is not on PATH: the Rust stand needs Rust, https://rustup.rs');
  if (res.status !== 0) throw new Error('cargo build --bin stand failed');
  rustBuilt = true;
}

export const KITS = {
  js: {
    name: 'js',
    spawn(args) {
      if (DOCKER) return dockerSpawn('js', args);
      return spawn(process.execPath, [JS_STAND, ...args], { stdio: ['pipe', 'pipe', 'inherit'] });
    },
  },
  rust: {
    name: 'rust',
    spawn(args) {
      if (DOCKER) return dockerSpawn('rust', args);
      ensureRustBuilt();
      return spawn(RUST_STAND, args, { stdio: ['pipe', 'pipe', 'inherit'] });
    },
  },
};

export const KIT_NAMES = Object.keys(KITS);

// Every scenario runs both ways: `[doorKit, askerKit]`.
export const DIRECTIONS = [
  ['js', 'rust'],
  ['rust', 'js'],
];
