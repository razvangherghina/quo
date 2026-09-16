#!/usr/bin/env node
// Every example kit: built, its own tests run, judged by the verifier alone,
// and every pair of kits judged against each other, both ways; then, with
// every kit, the world of world.mjs.
//   node examples/check.mjs [kit ...]
// With kit names, only those kits and the pairs among them. Exits 1 on any
// failure. Needs each kit's toolchain: go, zig, python3 with cryptography,
// node and cargo.
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const verifier = join(here, "..", "verifier", "cli.js");

const KITS = {
  go: { build: ["go", "build", "-o", "stand", "."], test: ["go", "test", "-count=1", "./..."], stand: "stand" },
  zig: { build: ["zig", "build"], test: ["zig", "build", "test"], stand: "zig-out/bin/stand" },
  python: { test: ["python3", "-m", "unittest", "discover", "-s", "tests"], stand: "stand" },
  javascript: { test: ["npm", "test", "--silent"], stand: "stand" },
  rust: { build: ["cargo", "build", "-q"], test: ["cargo", "test", "-q"], stand: "target/debug/stand" },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(KITS);
const unknown = names.filter((n) => !KITS[n]);
if (unknown.length) {
  process.stderr.write(`no such kit: ${unknown.join(", ")}\n`);
  process.exit(1);
}

const failed = [];
const step = (label, argv, cwd) => {
  process.stdout.write(`examples: ${label}\n`);
  const r = spawnSync(argv[0], argv.slice(1), { cwd, stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n");
  if (r.status === 0) {
    process.stdout.write(`  ok ${out.at(-1) ?? ""}\n`);
    return;
  }
  failed.push(label);
  process.stdout.write(`  FAIL\n${out.slice(-20).join("\n")}\n`);
};

for (const name of names) {
  const kit = KITS[name];
  const dir = join(here, name);
  if (kit.build) step(`${name}: build`, kit.build, dir);
  step(`${name}: its own tests`, kit.test, dir);
  step(`${name}: the verifier`, ["node", verifier, "--cwd", dir, "--", `./${kit.stand}`], dir);
}
for (const a of names) {
  for (const b of names) {
    if (a === b) continue;
    const first = join(here, a, KITS[a].stand);
    const second = join(here, b, KITS[b].stand);
    step(`${a} asking ${b}: the verifier, two kits`, ["node", verifier, "--two", "--", first, "--", second], join(here, a));
  }
}

if (names.length === Object.keys(KITS).length) step("the world, seven scenes", ["node", join(here, "world.mjs")], here);

process.stdout.write(failed.length ?`examples: ${failed.length} failed\n` : "examples: all green\n");
process.exit(failed.length ? 1 : 0);
