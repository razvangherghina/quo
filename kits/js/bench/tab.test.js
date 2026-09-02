import test from 'node:test';
import assert from 'node:assert/strict';
import { host } from '../src/host.js';
import { listen } from '../src/line-ws.js';
import { openTab, writeInvitation } from '../src/tab.js';
import { KEY, CERT } from './tls.js';

const TLS = { key: KEY, cert: CERT };
const TRUST = { ca: CERT };
const random = () => crypto.getRandomValues(new Uint8Array(32));
const clock = () => Date.now();
const seeds = () => ({ name: random(), padlock: random(), heir: random() });

const SHOP = `Shop
  products() [text]
`;
const MAILBOX = `Mailbox
  unread() int
`;

const memory = () => {
  const m = new Map();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => m.set(k, v), remove: (k) => m.delete(k) };
};

async function door() {
  const ground = await host({ seeds: seeds(), clock, random, roads: [] });
  const stood = await listen(ground.warden, { clock, random, tls: TLS });
  await ground.warden.hold({ products: () => ['pear', 'plum'] }, { blueprint: SHOP, public: true });
  const { being: mailbox } = await ground.warden.hold({ unread: () => 3n }, { blueprint: MAILBOX });
  return {
    ground,
    mailbox,
    card: ground.warden.card(),
    close: async () => {
      await stood.close();
      await ground.close();
    },
  };
}

test('a tab knocks as a stranger and reaches what the door exposes', async (t) => {
  const d = await door();
  t.after(d.close);
  const tab = await openTab({ card: d.card, keep: memory(), tls: TRUST });
  t.after(() => tab.close());
  assert.equal(tab.returning, false);
  const shown = await tab.knock();
  assert.equal(shown.length, 2);
  assert.deepEqual(await shown[1].products(), ['pear', 'plum']);
});

test('a tab spends an invitation carried as a link, and keeps the standing across a reopen', async (t) => {
  const d = await door();
  t.after(d.close);
  const keep = memory();
  const link = writeInvitation(await d.ground.warden.grant(d.mailbox));

  const first = await openTab({ card: d.card, keep, tls: TRUST });
  const [mailbox] = await first.accept(link);
  assert.equal(await mailbox.unread(), 3n);
  assert.equal(await first.accept(link), null);
  await first.close();

  const again = await openTab({ card: d.card, keep, tls: TRUST });
  t.after(() => again.close());
  assert.equal(again.returning, true);
  const kept = await again.kept();
  assert.equal(kept.length, 2);
  const box = kept.find((h) => typeof h.unread === 'function');
  assert.equal(await box.unread(), 3n);
});

test('one tab accepts invitations from two doors and reaches each down its own line', async (t) => {
  const a = await door();
  const b = await door();
  t.after(a.close);
  t.after(b.close);
  const { being: seven } = await b.ground.warden.hold({ unread: () => 7n }, { blueprint: MAILBOX });

  const tab = await openTab({ card: a.card, keep: memory(), tls: TRUST });
  t.after(() => tab.close());
  const [fromA] = await tab.accept(await a.ground.warden.grant(a.mailbox), { label: 'a' });
  const [fromB] = await tab.accept(await b.ground.warden.grant(seven), { label: 'b' });
  assert.equal(await fromA.unread(), 3n);
  assert.equal(await fromB.unread(), 7n);
});

test('a being the tab holds is found again by label after a reopen', async (t) => {
  const d = await door();
  t.after(d.close);
  const keep = memory();
  const SCREEN = `Screen
  show(html text) bool
`;
  const first = await openTab({ card: d.card, keep, tls: TRUST });
  const { being: a } = await first.hold(
    { show: () => true },
    { blueprint: SCREEN, label: 'screen' },
  );
  await first.close();
  const again = await openTab({ card: d.card, keep, tls: TRUST });
  t.after(() => again.close());
  const { being: b } = await again.hold(
    { show: () => true },
    { blueprint: SCREEN, label: 'screen' },
  );
  assert.deepEqual(Buffer.from(a), Buffer.from(b));
});
