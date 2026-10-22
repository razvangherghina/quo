// The web carrier's pieces the verifier writes and reads: the post's answer, the held line's opening.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { MAX_POST, MIN_POST, post, postAnswer, switching } from '../web.js';
import { acceptKey } from '../websocket.js';

test('The post. A post is a ward pk and a box, so it holds at least sixty-five bytes and at most the size and sixty-four', () => {
  assert.equal(MIN_POST, 65);
  assert.equal(MAX_POST, 64 + 1048576);
});

test('The post. A status 200 with a body is a reply, any other status is nothing, and a cut response is a closed line', () => {
  assert.deepEqual(postAnswer({ status: 200, body: Buffer.from('x') }), {
    kind: 'reply',
    box: Buffer.from('x'),
    status: 200,
  });
  assert.equal(postAnswer({ status: 204, body: Buffer.alloc(0) }).kind, 'nothing');
  assert.equal(postAnswer({ status: 500, body: Buffer.from('x') }).kind, 'nothing');
  assert.equal(
    postAnswer({ status: 200, body: Buffer.alloc(0) }).odd,
    'status 200 with an empty body',
  );
  assert.equal(postAnswer({ error: 'cut' }).closed, true);
});

test('The held line. The opening answer selects the subprotocol quo only when it was offered', () => {
  const key = 'dGhlIHNhbXBsZSBub25jZQ==';
  assert.match(switching(key, true), /^HTTP\/1\.1 101 Switching Protocols\r\n/);
  assert.ok(switching(key, true).includes(`Sec-WebSocket-Accept: ${acceptKey(key)}`));
  assert.ok(switching(key, true).includes('Sec-WebSocket-Protocol: quo'));
  assert.ok(!switching(key, false).includes('Sec-WebSocket-Protocol'));
});

test('The post. A post to a server is one request, and its answer is the status and the body', async () => {
  const server = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => res.writeHead(200).end(Buffer.concat(chunks).reverse()));
  });
  await new Promise((res) => server.listen(0, '127.0.0.1', res));
  try {
    const at = `http://127.0.0.1:${server.address().port}/quo/in?w=1`;
    const got = await post(at, Buffer.from('abc'));
    assert.equal(got.status, 200);
    assert.deepEqual(got.body, Buffer.from('cba'));
    assert.ok((await post('not an address', Buffer.from('x'))).error);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
