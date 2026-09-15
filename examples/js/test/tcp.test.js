import assert from 'node:assert/strict';
import { test } from 'node:test';
import { concat, hex, unhex } from '../src/arithmetic.js';
import { askFrame, frameReader, nothingFrame, replyFrame } from '../src/frame.js';
import { vectors } from './fixtures/vectors.js';

const all = await vectors('tcp');
const kinds = { ask: '00', reply: '01', nothing: '02' };

const bytesOf = (v) => (v.fill ? concat(unhex(v.frame), new Uint8Array(v.fill.count).fill(parseInt(v.fill.byte, 16))) : unhex(v.frame));

for (const v of all) {
  test(v.name, () => {
    const bytes = bytesOf(v);
    const bodies = frameReader()(bytes);
    // The reader answers null for bytes that are no frame, and the side closes.
    assert.equal(bodies === null, v.closed);
    assert.equal(bodies !== null, v['frame?']);
    if (!v['frame?']) return;

    assert.equal(bodies.length, 1);
    const [body] = bodies;
    assert.equal(kinds[body.kind], v.kind);
    assert.equal(body.id, v.id);
    assert.equal(body.pk, v.ward);
    assert.equal(body.box?.length ?? 0, v.box);

    // Whether a side carries a frame of this kind is the listener's and the
    // dialer's, held on a socket in wire.test.js.

    const encoded = body.kind === 'ask' ? askFrame(body.id, body.pk, body.box) : body.kind === 'reply' ? replyFrame(body.id, body.box) : nothingFrame(body.id);
    assert.equal(hex(encoded), hex(bytes));
  });
}
