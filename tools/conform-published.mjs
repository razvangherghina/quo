// Drive the conformance scenarios against a kit installed from its public
// registry, never against the sources beside it.
//
//   node tools/conform-published.mjs <js|go|python|rust|zig> <version>
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [kit, version] = process.argv.slice(2);

if (!kit || !version) {
  console.error('usage: node tools/conform-published.mjs <kit> <version>');
  process.exit(2);
}

const run = (cmd, args, options = {}) => {
  const done = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (done.status !== 0) {
    console.error(`\n${cmd} ${args.join(' ')} exited ${done.status ?? done.signal}`);
    process.exit(1);
  }
};

const scratch = mkdtempSync(join(tmpdir(), `quo-published-${kit}-`));
console.log(`${kit} ${version}, from its registry, in ${scratch}\n`);

// Only the kit under them comes from the registry.
cpSync(join(root, 'conformance'), join(scratch, 'conformance'), { recursive: true });

// Each staging answers the command that starts the subject.
const stage = {
  js() {
    writeFileSync(
      join(scratch, 'package.json'),
      JSON.stringify(
        {
          name: 'subject',
          private: true,
          type: 'module',
          dependencies: { '@quo-systems/js': version },
        },
        null,
        2,
      ) + '\n',
    );
    run('npm', ['install', '--no-audit', '--no-fund'], { cwd: scratch });
    // The filename is load-bearing: the subject only starts reading stdin when
    // it sees it was spawned as conformance.js, so a copy under any other name
    // exits 0 and every scenario reports a warden that never stood.
    const source = readFileSync(join(root, 'kits', 'js', 'cmd', 'conformance.js'), 'utf8');
    const at = join(scratch, 'conformance.js');
    writeFileSync(at, source.replace("from '../src/index.js'", "from '@quo-systems/js'"));
    return ['node', [at]];
  },

  go() {
    const at = join(scratch, 'subject');
    mkdirSync(at, { recursive: true });
    cpSync(join(root, 'kits', 'go', 'cmd', 'conformance'), at, { recursive: true });
    run('go', ['mod', 'init', 'subject'], { cwd: at });
    run('go', ['get', `quo.systems/kit@v${version}`], { cwd: at });
    run('go', ['build', '-o', join(scratch, 'go-subject'), '.'], { cwd: at });
    return [join(scratch, 'go-subject'), []];
  },

  python() {
    // An interpreter below 3.11, or the old pip a venv inherits from one,
    // reports the package as having no versions at all rather than as
    // unreachable — so both are worth ruling out before believing that.
    const interpreter = ['python3.13', 'python3.12', 'python3.11', 'python3'].find(
      (one) => spawnSync(one, ['--version'], { encoding: 'utf8' }).status === 0,
    );
    run(interpreter, ['-m', 'venv', join(scratch, '.venv')]);
    const python = join(scratch, '.venv', 'bin', 'python');
    run(python, ['-m', 'pip', 'install', '--quiet', '--upgrade', 'pip']);
    run(python, ['-m', 'pip', 'install', '--quiet', `quo-systems==${version}`]);
    cpSync(join(root, 'kits', 'python', 'conformance.py'), join(scratch, 'conformance.py'));
    return [python, [join(scratch, 'conformance.py')]];
  },

  rust() {
    const at = join(scratch, 'subject');
    run('cargo', ['new', '--quiet', '--bin', at]);
    cpSync(join(root, 'kits', 'rust', 'conformance', 'src', 'main.rs'), join(at, 'src', 'main.rs'));
    // The subject reaches a sibling for its JSON, by a path relative to its
    // own source, so the layout above it has to be the one it expects.
    cpSync(join(root, 'kits', 'rust', 'support'), join(scratch, 'support'), { recursive: true });
    // The subject reaches these by their own names, not through `quo`.
    for (const crate of ['quo-arithmetic', 'quo-notation', 'quo-warden']) {
      run('cargo', ['add', '--quiet', `${crate}@${version}`], { cwd: at });
    }
    run('cargo', ['build', '--quiet', '--release'], { cwd: at });
    return [join(at, 'target', 'release', 'subject'), []];
  },

  zig() {
    const at = join(scratch, 'subject');
    mkdirSync(at, { recursive: true });
    cpSync(join(root, 'kits', 'zig', 'cmd', 'conformance'), at, { recursive: true });

    // `zig init` writes the scaffold because a package needs a fingerprint,
    // which is derived rather than chosen and cannot be written by hand.
    run('zig', ['init'], { cwd: at });
    writeFileSync(
      join(at, 'build.zig'),
      `const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const kit = b.dependency("quo", .{ .target = target, .optimize = optimize });
    const exe = b.addExecutable(.{
        .name = "conformance",
        .root_module = b.createModule(.{
            .root_source_file = b.path("main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "arithmetic", .module = kit.module("arithmetic") },
                .{ .name = "envelope", .module = kit.module("envelope") },
                .{ .name = "notation", .module = kit.module("notation") },
                .{ .name = "warden", .module = kit.module("warden") },
                .{ .name = "wire", .module = kit.module("wire") },
            },
        }),
    });
    b.installArtifact(exe);
}
`,
    );
    run('zig', ['fetch', '--save', tarball(version)], { cwd: at });
    run('zig', ['build', '--summary', 'none'], { cwd: at });
    return [join(at, 'zig-out', 'bin', 'conformance'), []];
  },
};

function tarball(v) {
  return `https://github.com/razvangherghina/quo/releases/download/zig-v${v}/quo-zig-${v}.tar.gz`;
}

if (!stage[kit]) {
  console.error(`no such kit: ${kit}`);
  process.exit(2);
}

const [cmd, args] = stage[kit]();

console.log(`\ndriving ${cmd} through every scenario\n`);
run('node', [join(scratch, 'conformance', 'conform.js'), '--', cmd, ...args]);
console.log(`\n${kit} ${version} conforms as published.`);
