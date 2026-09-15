#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// A stand program made of the corpus and nothing else. It prints a ward line
// for each `--ward`, answers every root request with an object, and answers
// each arrival with the bytes the corpus holds for it, found by the story
// told so far. Its digest moves exactly where the corpus says the ward wrote.
// It is not a kit and judges nothing. It is the shape the verifier speaks
// to, so the verifier is proven here without any kit at all.
//
// `QUO_FIXTURE_WRONG` names one thing to get wrong, so the verifier is
// proven to fail: `reply`, `wrote` or `silent` at the record whose case
// `QUO_FIXTURE_AT` names, or `story`, every reply to a story's arrival.

import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';

const corpus = JSON.parse(readFileSync(new URL('../../vectors/door.json', import.meta.url), 'utf8'));
const wrong = process.env.QUO_FIXTURE_WRONG;
const at = process.env.QUO_FIXTURE_AT;

const argv = process.argv.slice(2);
const wards = [];
const rest = [];
let listen;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--listen') listen = argv[++i];
  else if (argv[i] === '--entropy') i++;
  else if (argv[i] === '--ward') wards.push(argv[++i]);
  else rest.push(argv[i]);
}

const token = {
  root: (step) => `root ${step.root.ward} ${step.root.method} ${JSON.stringify(step.root.args ?? null)}`,
  arrive: (step) => `arrive ${step.arrive.ward} ${step.arrive.ask}`,
  restart: (step) => `restart ${JSON.stringify(step.restart)}`,
};
const tokenOf = (step) => token[Object.keys(step).find((k) => k in token)](step);

function storyOf(record) {
  const chain = [];
  for (let name = record.world; name; name = corpus.worlds[name].from) chain.unshift(...corpus.worlds[name].steps);
  return [...chain, ...record.steps];
}

const seeds = wards.map((w) => w.split('=')[0]);
const files = wards.map((w) => w.split('=')[1]).filter(Boolean);
let history = files.length ? JSON.parse(readFileSync(files[0], 'utf8')).history : [];
if (files.length) history.push(`restart ${JSON.stringify(rest)}`);
let digest = files.length ? JSON.parse(readFileSync(files[0], 'utf8')).digest : 0;
const pks = Object.fromEntries(seeds.map((seed, i) => [(i + 1).toString(16).padStart(2, '0').repeat(64), seed]));

// The bytes the corpus answers `ask` with after the story so far, and
// whether this arrival is the record's own.
function answer(seed, ask) {
  const next = `arrive ${seed} ${ask}`;
  for (const record of corpus.vectors) {
    const story = storyOf(record);
    const told = story.map(tokenOf);
    const prefix = history.every((t, i) => told[i] === t);
    if (prefix && told[history.length] === next) return { reply: story[history.length].reply };
    if (prefix && told.length === history.length && record.ward === seed && record.ask === ask) return { reply: record.reply, record };
  }
  return null;
}

const server = createServer((socket) => {
  let buf = Buffer.alloc(0);
  socket.on('error', () => {});
  socket.on('data', (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32BE(0)) {
      const body = buf.subarray(4, 4 + buf.readUInt32BE(0));
      buf = buf.subarray(4 + body.length);
      const id = body.subarray(1, 5);
      const seed = pks[body.subarray(5, 69).toString('hex')];
      const found = answer(seed, body.subarray(69).toString('hex'));
      const mine = found?.record && found.record.case === at;
      if (mine && wrong === 'silent') return socket.destroy();
      let reply = found?.reply ?? null;
      if (mine && wrong === 'reply') reply = `00${reply.slice(2)}`;
      if (!found?.record && wrong === 'story' && reply) reply = `00${reply.slice(2)}`;
      if (found?.record ? found.record.wrote !== (mine && wrong === 'wrote') : false) digest++;
      if (!found?.record) history.push(`arrive ${seed} ${body.subarray(69).toString('hex')}`);
      const out = reply === null ? Buffer.from([2]) : Buffer.concat([Buffer.from([1]), Buffer.from(reply, 'hex')]);
      const length = Buffer.alloc(4);
      length.writeUInt32BE(out.length + 4);
      socket.write(Buffer.concat([length, out.subarray(0, 1), id, out.subarray(1)]));
    }
  });
});

const [host, port] = [listen.slice(0, listen.lastIndexOf(':')), Number(listen.slice(listen.lastIndexOf(':') + 1))];
server.listen(port, host, () => {
  const address = `${host}:${server.address().port}`;
  for (const [pk] of Object.entries(pks)) process.stdout.write(`ward ${pk} ${address}\n`);
  process.stdout.write('ready\n');
});

createInterface({ input: process.stdin })
  .on('line', (line) => {
    const request = JSON.parse(line);
    const seed = pks[request.ward];
    const reply = (object) => process.stdout.write(`${JSON.stringify({ id: request.id, object })}\n`);
    if (request.method === 'digest') return reply({ digest: String(digest) });
    if (request.method === 'save') {
      writeFileSync(request.args.file, JSON.stringify({ history, digest }));
      return reply({ saved: request.args.file });
    }
    history.push(`root ${seed} ${request.method} ${JSON.stringify(request.args ?? null)}`);
    return reply({});
  })
  .on('close', () => {
    server.close();
    process.exit(0);
  });
