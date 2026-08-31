#!/usr/bin/env node
// Publishes the Rust kit's crates to crates.io, in dependency order, one at a
// time, waiting for each to appear in the registry index before the next.
//
// Run: npm run quo-publish-rust [-- --dry-run]
//
// This file is also emitted into the published repository as tools/, where
// publish-rust.yml runs it on a GitHub runner. The dependency order and the
// index waiting live here once so neither is written down twice.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Dependency order: a crate is listed after every crate it depends on, because
// crates.io refuses a crate whose dependency is not already published.
// notation → wire; arithmetic+notation+wire → envelope → warden;
// carriage and zero depend on nothing; line takes notation and wire; and
// `quo` is last because it is the kit whole and depends on all eight.
const ORDER = [
  'quo-notation',
  'quo-arithmetic',
  'quo-wire',
  'quo-envelope',
  'quo-warden',
  'quo-carriage',
  'quo-line',
  'quo-zero',
  'quo',
];

// Where each crate lives inside the kit, which the rehearsal needs below.
const DIR = {
  quo: 'quo',
  'quo-notation': 'notation',
  'quo-arithmetic': 'arithmetic',
  'quo-wire': 'wire',
  'quo-envelope': 'envelope',
  'quo-warden': 'warden',
  'quo-carriage': 'carriage',
  'quo-line': 'line',
  'quo-zero': 'zero',
};

const KIT = resolve(dirname(fileURLToPath(import.meta.url)), '../kits/rust');
// A rustup install on the Mac puts cargo somewhere the shell adds to PATH and
// a GUI-launched process does not. A runner already has cargo on PATH and no
// such directory, so it is prepended only where it exists.
const CARGO = `${process.env.HOME}/.cargo/bin`;
const ENV = existsSync(CARGO)
  ? { ...process.env, PATH: `${CARGO}:${process.env.PATH}` }
  : { ...process.env };

const flags = process.argv.slice(2);
const dryRun = flags.includes('--dry-run');
const versionOnly = flags.includes('--version');

function cargo(args) {
  return spawnSync('cargo', args, { cwd: KIT, env: ENV, encoding: 'utf8' });
}

const meta = (() => {
  const out = cargo(['metadata', '--no-deps', '--format-version', '1']);
  if (out.status !== 0) throw new Error(out.stderr || 'cargo metadata failed');
  return JSON.parse(out.stdout).packages;
})();

function pkg(crate) {
  const found = meta.find((p) => p.name === crate);
  if (!found) throw new Error(`no such crate in the workspace: ${crate}`);
  return found;
}

// The one version the nine published crates share. They are released
// together, so a crate out of step is a mistake rather than a choice, and the
// workflow checks the tag against this rather than against one manifest it
// picked.
function kitVersion() {
  const versions = [...new Set(ORDER.map((crate) => pkg(crate).version))];
  if (versions.length !== 1) {
    throw new Error(
      `the crates disagree on the version: ${ORDER.map((c) => `${c} ${pkg(c).version}`).join(', ')}`,
    );
  }
  return versions[0];
}

if (versionOnly) {
  console.log(kitVersion());
  process.exit(0);
}

// Every crate of the kit this one needs to build, however deep.
function siblings(crate, seen = new Set()) {
  for (const dep of pkg(crate).dependencies) {
    if (dep.kind !== null || !(dep.name in DIR) || seen.has(dep.name)) continue;
    seen.add(dep.name);
    siblings(dep.name, seen);
  }
  return [...seen];
}

// The registry's own view, which is what the next publish resolves against.
async function published(crate, want) {
  const res = await fetch(`https://crates.io/api/v1/crates/${crate}/${want}`, {
    headers: { 'user-agent': 'quo-publish-rust (razvan@quo.systems)' },
  });
  if (res.status === 404) return false;
  if (!res.ok) return false;
  const body = await res.json();
  return body?.version?.num === want;
}

async function waitFor(crate, want) {
  for (let i = 0; i < 120; i += 1) {
    if (await published(crate, want)) return true;
    await sleep(5000);
  }
  return false;
}

const done = [];
const remaining = [...ORDER];

for (const crate of ORDER) {
  const want = pkg(crate).version;
  remaining.shift();

  if (!dryRun && (await published(crate, want))) {
    console.log(`skip  ${crate} ${want} — already on crates.io`);
    done.push(`${crate} ${want} (already up)`);
    continue;
  }

  console.log(`publishing ${crate} ${want}${dryRun ? ' (dry run)' : ''}`);
  const args = ['publish', '-p', crate];
  if (dryRun) {
    args.push('--dry-run');
    // A rehearsal publishes nothing, so a sibling this crate depends on is not
    // on crates.io yet and cargo 1.88 refuses to resolve it. Point those
    // versions back at the tree for the rehearsal only; the real run resolves
    // them from the index, which is what the waiting below is for.
    for (const name of siblings(crate)) {
      args.push('--config', `patch.crates-io.${name}.path="${DIR[name]}"`);
    }
  }
  // crates.io allows a burst of new crates and then one per ten minutes, so a
  // nine-crate kit meets a 429 partway through and the only cure is time. The
  // error names the minute it lifts, so wait for it rather than making the
  // human run this again — output is captured rather than inherited so that
  // sentence can be read.
  let run;
  for (;;) {
    run = spawnSync('cargo', args, { cwd: KIT, env: ENV, encoding: 'utf8' });
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.status === 0) break;

    const limited = /429 Too Many Requests/.test(run.stderr ?? '');
    const after = (run.stderr ?? '').match(/try again after ([^)\n]+?GMT)/);
    if (!limited || !after) break;

    const until = Date.parse(after[1]);
    if (Number.isNaN(until)) break;
    const waitMs = Math.max(until - Date.now(), 0) + 5_000;
    console.log(
      `rate limited — waiting ${Math.ceil(waitMs / 1000)}s for ${after[1]}, then retrying`,
    );
    await sleep(waitMs);
  }

  if (run.status !== 0) {
    console.error(`\nFAILED: ${crate} ${want}`);
    console.error(`published this run: ${done.length ? done.join(', ') : 'none'}`);
    console.error(`still unpublished: ${[crate, ...remaining].join(', ')}`);
    process.exit(1);
  }

  done.push(`${crate} ${want}`);

  if (!dryRun && remaining.length > 0) {
    process.stdout.write(`waiting for ${crate} ${want} in the index`);
    const seen = await waitFor(crate, want);
    console.log(seen ? ' — there' : '');
    if (!seen) {
      console.error(`\nFAILED: ${crate} ${want} never appeared in the index`);
      console.error(`published this run: ${done.join(', ')}`);
      console.error(`still unpublished: ${remaining.join(', ')}`);
      process.exit(1);
    }
  }
}

console.log(`\n${dryRun ? 'Rehearsed' : 'Published'}: ${done.join(', ')}`);
