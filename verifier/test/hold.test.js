// The verifier's own listener, which a kit's dialer meets in every scheme.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dial, HOLD_PATH, Hold, SCHEMES } from '../hold.js';

const PK = Buffer.alloc(64, 1);
const BOX = Buffer.alloc(100, 2);

test('The carrier. The schemes the harness names are tcp, http and ws, and a hold stands at an address of its own', async () => {
  assert.deepEqual(SCHEMES, ['tcp', 'http', 'ws']);
  for (const scheme of SCHEMES) {
    const hold = await Hold.listen(scheme);
    try {
      assert.match(
        hold.at,
        scheme === 'tcp'
          ? /^tcp:\/\/127\.0\.0\.1:\d+$/
          : new RegExp(`^${scheme}://127\\.0\\.0\\.1:\\d+${HOLD_PATH.replace('?', '\\?')}$`),
      );
    } finally {
      hold.close();
    }
  }
});

test('Nothing. An ask nobody waits for is answered with nothing, over every scheme', async () => {
  for (const scheme of SCHEMES) {
    const hold = await Hold.listen(scheme);
    try {
      const line = await dial(scheme, hold.at);
      const answer = await line.ask(PK, BOX);
      assert.equal(answer.kind, 'nothing', scheme);
      assert.equal(hold.unwaited, 1, scheme);
      line.close();
    } finally {
      hold.close();
    }
  }
});

test('The carrier. An ask a hold waits for reaches the waiter whole, over every scheme', async () => {
  for (const scheme of SCHEMES) {
    const hold = await Hold.listen(scheme);
    try {
      const line = await dial(scheme, hold.at);
      const next = hold.nextAsk(5000);
      line.ask(PK, BOX).catch(() => {});
      const got = await next;
      assert.deepEqual(got.pk, PK, scheme);
      assert.deepEqual(got.box, BOX, scheme);
      line.close();
    } finally {
      hold.close();
    }
  }
});

test('The carrier. A hold that hears nothing within the time it is given says so', async () => {
  const hold = await Hold.listen('tcp');
  try {
    assert.equal(await hold.nextAsk(30), null);
  } finally {
    hold.close();
  }
});
