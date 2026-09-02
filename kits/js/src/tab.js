// The host for a browser tab. `keep` is any string store shaped like
// localStorage — get, set, remove — and nothing here touches a document.
import { Warden } from './warden.js';
import { dial } from './line-ws.js';
import { hex, unhex } from './bytes.js';

export const readCard = (c) => ({
  warden: unhex(c.warden),
  commitment: unhex(c.commitment),
  padlock: unhex(c.padlock),
  hints: c.hints,
});

export function readInvitation(encoded) {
  const text = atob(encoded.replace(/-/g, '+').replace(/_/g, '/'));
  const j = JSON.parse(new TextDecoder().decode(Uint8Array.from(text, (ch) => ch.charCodeAt(0))));
  return {
    warden: unhex(j.warden),
    commitment: unhex(j.commitment),
    padlock: unhex(j.padlock),
    heirPublic: unhex(j.heirPublic),
    heirSecret: unhex(j.heirSecret),
    hints: j.hints,
  };
}

export function writeInvitation(invitation) {
  const json = JSON.stringify({
    warden: hex(invitation.warden),
    commitment: hex(invitation.commitment),
    padlock: hex(invitation.padlock),
    heirPublic: hex(invitation.heirPublic),
    heirSecret: hex(invitation.heirSecret),
    hints: invitation.hints,
  });
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function openTab({
  card,
  keep,
  prefix = 'quo',
  clock = () => Date.now(),
  random = () => crypto.getRandomValues(new Uint8Array(32)),
  tls = null,
  observe = null,
  allowance,
}) {
  const KEYS = `${prefix}.seeds`;
  const RECORDS = `${prefix}.records`;
  let seeds = null;
  try {
    seeds = JSON.parse(keep.get(KEYS));
  } catch {
    seeds = null;
  }
  const returning = !!seeds;
  if (!seeds) {
    seeds = { name: hex(random()), padlock: hex(random()), heir: hex(random()) };
    keep.set(KEYS, JSON.stringify(seeds));
  }
  const seed = (label) => {
    if (!seeds[`being:${label}`]) {
      seeds[`being:${label}`] = hex(random());
      keep.set(KEYS, JSON.stringify(seeds));
    }
    return unhex(seeds[`being:${label}`]);
  };
  const store = {
    async load() {
      try {
        return JSON.parse(keep.get(RECORDS));
      } catch {
        return null;
      }
    },
    async save(snapshot) {
      keep.set(RECORDS, JSON.stringify(snapshot));
    },
  };

  const door = card.hints.find((h) => h.startsWith('wss://'));
  // A row with no wss hint rides the card's door.
  const lines = new Map();
  const delivery = {
    arrived() {},
    async send(row, envelope) {
      const hints = row.hints.filter((h) => h.startsWith('wss://'));
      if (hints.length === 0 && door) hints.push(door);
      for (const hint of hints) {
        let line = lines.get(hint);
        if (!line?.open) {
          line = await dial(warden, hint, { clock, random, tls });
          lines.set(hint, line);
        }
        if (line.carry(envelope)) return false;
      }
      throw new Error('LINE_WOULD_NOT_CARRY');
    },
  };

  const warden = await Warden.open({
    seeds: { name: unhex(seeds.name), padlock: unhex(seeds.padlock), heir: unhex(seeds.heir) },
    clock,
    random,
    delivery,
    store,
    hints: [],
    ...(allowance ? { allowance } : {}),
  });
  if (observe) warden.observe(observe);

  return {
    warden,
    door,
    returning,
    async hold(object, { blueprint, label, public: shown = false }) {
      return warden.hold(object, { blueprint, label, seed: seed(label), public: shown });
    },
    // `[]` when the door no longer answers the kept standing; `null` when none
    // was kept.
    async kept(label = 'ground') {
      const kept = warden.labels.get(label);
      if (!kept?.row) return null;
      const handles = await warden.handles(kept.row);
      await warden.keep();
      return handles ?? [];
    },
    async knock() {
      const front = await warden.knock(card, { label: 'front' });
      if (!front) return null;
      const shown = (await warden.handles(warden.labels.get('front').row)) ?? [];
      await warden.keep();
      return [front, ...shown];
    },
    async accept(invitation, { label = 'ground' } = {}) {
      const value = typeof invitation === 'string' ? readInvitation(invitation) : invitation;
      const handles = await warden.accept(value, { label });
      await warden.keep();
      return handles;
    },
    grant(beingPk) {
      return warden.grant(beingPk);
    },
    keep() {
      return warden.keep();
    },
    forget() {
      keep.remove(KEYS);
      keep.remove(RECORDS);
    },
    async close() {
      await warden.keep();
      for (const line of lines.values()) line.close?.();
    },
  };
}
