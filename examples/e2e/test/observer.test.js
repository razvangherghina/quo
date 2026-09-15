import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { FrameParser } from '../src/observer.js';

const tcp = JSON.parse(readFileSync(new URL('../../../vectors/tcp.json', import.meta.url), 'utf8'));

// The observer reads the stream as chapter 6 writes it, so the trace, which
// refuses a recording with any bytes the observer could not read as a frame,
// holds every frame it pins to `tcp.json`.
for (const record of tcp.vectors) {
  test(`the observer reads ${record.name}`, () => {
    const bytes = Buffer.concat([Buffer.from(record.frame, 'hex'), record.fill ? Buffer.alloc(record.fill.count, Number.parseInt(record.fill.byte, 16)) : Buffer.alloc(0)]);
    const read = [];
    let illegal = null;
    new FrameParser({ onFrame: (frame) => read.push(frame), onIllegal: (reason) => (illegal = reason) }).push(bytes);
    if (!record['frame?']) {
      assert.equal(read.length, 0);
      assert.ok(illegal, 'not a frame');
      return;
    }
    assert.equal(illegal, null);
    assert.equal(read.length, 1);
    const [frame] = read;
    assert.equal(frame.length, record.length);
    assert.equal({ ask: '00', reply: '01', nothing: '02' }[frame.kind], record.kind);
    assert.equal(frame.id, record.id);
    assert.equal(frame.box.length, record.box);
    if (record.ward) assert.equal(frame.ward, record.ward);
  });
}
