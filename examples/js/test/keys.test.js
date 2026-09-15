// Chapter 3, "Keys" and "The count", as the arithmetic the spec writes.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { honourable, spend } from '../src/count.js';
import { admit, move, removeHeir } from '../src/keys.js';

test('with a mark of one hundred, thirty-seven is honourable and thirty-six is refused', () => {
  const heir = { mark: 0, spent: [] };
  spend(heir, 100);
  assert.equal(honourable(heir, 101), true, 'above the mark');
  assert.equal(honourable(heir, 100), false, 'the mark itself');
  assert.equal(honourable(heir, 37), true);
  assert.equal(honourable(heir, 36), false);
  spend(heir, 37);
  assert.equal(honourable(heir, 37), false, 'honoured once');
});

test('the door holds sixty-four numbers, the mark and the sixty-three under it', () => {
  const heir = { mark: 0, spent: [] };
  for (let n = 1; n <= 200; n++) spend(heir, n);
  assert.equal(heir.mark, 200);
  assert.equal(heir.spent.length, 63);
  assert.equal(Math.min(...heir.spent), 137);
});

test('on a fresh heir the knock binds the key it announced, the heir dies, nothing is vouched for', () => {
  const heir = { held: 'H', vouched: null, fresh: true };
  move(heir, { by: 'H', next: 'K1' });
  assert.deepEqual(heir, { held: 'K1', vouched: null, fresh: false });
  const partition = { heirs: { h: { ...heir } }, removed: {} };
  assert.equal(admit(partition, { to: 'h', by: 'H' }), null, 'the heir is held by nobody');
});

test('the key held speaking announces the next, and announcing nothing leaves the vouched key as it stood', () => {
  const heir = { held: 'K1', vouched: null, fresh: false };
  move(heir, { by: 'K1', next: 'K2' });
  assert.deepEqual(heir, { held: 'K1', vouched: 'K2', fresh: false });
  move(heir, { by: 'K1', next: null });
  assert.deepEqual(heir, { held: 'K1', vouched: 'K2', fresh: false });
});

test('a removal keeps the key held and the key vouched for of a heir that spoke, and nothing of one that never did', () => {
  const partition = {
    heirs: {
      spoke: { held: 'K1', vouched: 'K2', fresh: false },
      unspoken: { held: 'unspoken', vouched: null, fresh: true },
    },
    removed: {},
  };
  removeHeir(partition, 'spoke');
  removeHeir(partition, 'unspoken');
  assert.ok(admit(partition, { to: 'spoke', by: 'K1' })?.removed, 'the key held');
  assert.ok(admit(partition, { to: 'spoke', by: 'K2' })?.removed, 'the key vouched for');
  assert.equal(admit(partition, { to: 'spoke', by: 'K3' }), null);
  assert.equal(admit(partition, { to: 'unspoken', by: 'unspoken' }), null, 'the heir itself, a stranger');
  assert.deepEqual(Object.keys(partition.removed), ['spoke']);
});

test('the vouched key speaking becomes the key held, and the one it replaces is forgotten', () => {
  const heir = { held: 'K1', vouched: 'K2', fresh: false };
  move(heir, { by: 'K2', next: null });
  assert.deepEqual(heir, { held: 'K2', vouched: null, fresh: false });
  const partition = { heirs: { h: heir }, removed: {} };
  assert.equal(admit(partition, { to: 'h', by: 'K1' }), null);
  assert.ok(admit(partition, { to: 'h', by: 'K2' }));
});
