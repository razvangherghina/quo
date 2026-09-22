#!/usr/bin/env node
// One kit, judged as a door, an asker, a listener and a dialer:
//   node verifier/cli.js [--cwd DIR] [--only NAME[,NAME]] -- <stand program and its arguments>
// Two kits, a ward standing in the first and asked from the second through
// the verifier:
//   node verifier/cli.js --two [--cwd DIR] -- <first program ...> -- <second program ...>
// With --two, the first `--` opens the first program and the second `--`
// opens the second. A program whose arguments hold `--` cannot be named here;
// wrap it in a script. --cwd is the directory both programs run in.
import { verifyTwo } from "./carried.js";
import { verify } from "./verify.js";

const argv = process.argv.slice(2);
const sep = argv.indexOf("--");
const opts = sep < 0 ? [] : argv.slice(0, sep);
const rest = sep < 0 ? argv : argv.slice(sep + 1);
let cwd = process.cwd();
let only;
let two = false;
for (let i = 0; i < opts.length; i++) {
  if (opts[i] === "--cwd") cwd = opts[++i];
  else if (opts[i] === "--only") only = opts[++i].split(",");
  else if (opts[i] === "--two") two = true;
}
const second = two ? rest.indexOf("--") : -1;
const program = two ? rest.slice(0, second) : rest;
const other = two ? rest.slice(second + 1) : [];
if (program.length === 0 || (two && (second < 0 || other.length === 0))) {
  process.stderr.write(
    "usage: node quo/verifier/cli.js [--cwd DIR] [--only NAME,...] -- <stand program and its arguments>\n" +
      "       node quo/verifier/cli.js --two [--cwd DIR] -- <first program ...> -- <second program ...>\n",
  );
  process.exit(1);
}

const onRecord = (r) => {
  const tag = r.kind === "protocol" ? "" : `${r.kind} `;
  const line = `${r.ok ? "ok  " : "FAIL"} ${tag}[${r.scenario}] ${r.name}`;
  process.stdout.write(r.ok && !String(r.detail ?? "").startsWith("nothing") ? `${line}\n` : `${line}${r.detail ? `: ${r.detail}` : ""}\n`);
};

const { results, counts } = two
  ? await verifyTwo({ first: program, second: other, cwd, onRecord })
  : await verify({ command: program[0], args: program.slice(1), cwd, only, onRecord });

const failed = results.filter((r) => !r.ok);
const by = (kind) => failed.filter((r) => r.kind === kind).length;
process.stdout.write(`${counts}\n`);
process.stdout.write(
  `${results.length} checks, ${results.length - failed.length} passed, ${failed.length} failed (${by("protocol")} protocol, ${by("carrier")} carrier, ${by("harness")} harness)\n`,
);
process.exit(failed.length === 0 ? 0 : 1);
