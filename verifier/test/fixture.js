// SPDX-License-Identifier: Apache-2.0
// A kit standing in vector mode, made of the corpus and nothing else: it
// answers `stand` with the record's own ward and ask, the ward with the
// record's own reply, and the two digest routes with a pair that differs
// exactly when the record says the ward wrote. The digests are its own
// invention, because a digest's value is every kit's own and the corpus
// carries none. It is not a kit and judges nothing. It is the shape the
// verifier speaks to, so the verifier can be proven here without any kit at
// all, and `wrong` is the same shape with one thing off, so the verifier is
// proven to fail.
//
// The pk it stands on is any 128 hex characters: the verifier reads the pk
// from `stand` and never computes one.
import { createServer } from 'node:http';

const PK = 'ab'.repeat(64);
const BEFORE = '11'.repeat(32);
const AFTER = '22'.repeat(32);

export function fixture(corpus, wrong = {}) {
  let current = null;
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      const json = (status, v) => {
        res.writeHead(status, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        res.end(JSON.stringify(v));
      };
      if (req.method === 'POST' && path === '/stand') {
        const named = JSON.parse(body);
        current = corpus.vectors.find((v) => v.case === named.case && v.name === named.name) ?? null;
        if (!current) return json(404, {});
        return json(200, { ward: PK, before: BEFORE, ask: wrong.ask && current.case === wrong.at ? 'ff' + current.ask.slice(2) : current.ask });
      }
      if (req.method === 'GET' && path === '/digest') {
        if (!current) return json(404, {});
        const wrote = wrong.wrote && current.case === wrong.at ? !current.wrote : current.wrote;
        return json(200, { after: wrote ? AFTER : BEFORE });
      }
      if (req.method === 'POST' && path === `/${PK}`) {
        if (!current) return json(404, {});
        if (wrong.silent && current.case === wrong.at) return json(500, {});
        const reply = wrong.reply && current.case === wrong.at ? '00' + current.reply.slice(2) : current.reply;
        res.writeHead(200, { 'content-type': 'application/octet-stream', 'access-control-allow-origin': '*' });
        return res.end(Buffer.from(reply, 'hex'));
      }
      return json(404, {});
    });
  });
  return new Promise((ok) => {
    server.listen(0, '127.0.0.1', () => {
      ok({ url: `http://127.0.0.1:${server.address().port}`, close: () => new Promise((done) => server.close(done)) });
    });
  });
}
