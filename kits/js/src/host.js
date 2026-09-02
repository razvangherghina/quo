// The host, for Node: it opens a warden on the seeds, the clock, the
// randomness and the store it is handed, stands roads in front of the
// warden's one door, and is delivery beneath it. This is the only file that
// knows every road by name, and it holds no secret of its own: what it keeps
// per peer is an address — a padlock, a public key — beside the line that
// peer's asks arrive on.
//
// Delivery has three rules and no more. A row with hints: the first road this
// ground can speak that carried. A row without hints, or none it can speak:
// the line that padlock's last ask arrived on, if still held. Neither:
// weather, and the number was spent.
import { Warden } from './warden.js';
import { hex } from './bytes.js';
import { post } from './carriage.js';
import { serve } from './door.js';
import * as tcp from './line.js';
import * as wss from './line-ws.js';

// Grounds in one process that reach each other by handing bytes across, the
// road of distance zero. Attached by hint, process-wide, so two hosts opened
// in one test find each other the way two wardens in one device would.
const memory = new Map();

export async function host({
  seeds,
  clock,
  random,
  roads = [],
  store = null,
  hints = [],
  limit = 0n,
  declares = [],
  tls = null,
  trust = null,
  allowance,
}) {
  // Lines this host holds, from either end, keyed by the padlock whose asks
  // arrive on them — learned from the warden, which is the only thing that
  // read the padlock. And lines this host dialled, keyed by the hint, so a
  // second ask down one road reuses the line rather than dialling again.
  const byPadlock = new Map();
  const byHint = new Map();

  function keep(line, key, map) {
    map.set(key, line);
    line.onClose(() => {
      if (map.get(key) === line) map.delete(key);
    });
  }

  async function dial(hint) {
    const held = byHint.get(hint);
    if (held?.open) return held;
    const road = hint.startsWith('tcp://') ? tcp : hint.startsWith('wss://') ? wss : null;
    if (!road) return null;
    const line = await road.dial(warden, hint, { clock, random, tls: trust });
    keep(line, hint, byHint);
    return line;
  }

  const delivery = {
    arrived(padlock, via) {
      if (via?.onClose) keep(via, hex(padlock), byPadlock);
    },
    async send(row, envelope) {
      for (const hint of row.hints) {
        try {
          if (hint.startsWith('mem://')) {
            const far = memory.get(hint);
            if (!far) continue;
            return await far.arrive(envelope);
          }
          if (hint.startsWith('http://') || hint.startsWith('https://')) {
            return await post(hint, envelope);
          }
          if (hint.startsWith('tcp://') || hint.startsWith('wss://')) {
            const line = await dial(hint);
            if (!line) continue;
            // The answer arrives as a frame of its own, through the door.
            return line.carry(envelope) ? false : null;
          }
        } catch {
          // Weather on this road; the next may carry.
        }
      }
      const back = byPadlock.get(hex(row.padlock));
      if (back?.open) return back.carry(envelope) ? false : null;
      return null;
    },
  };

  const warden = await Warden.open({
    seeds,
    clock,
    random,
    store,
    delivery,
    hints,
    limit,
    declares,
    allowance,
  });

  const stood = [];
  for (const road of roads) {
    if (road === 'memory') {
      const hint = `mem://${hex(warden.name.pk)}`;
      memory.set(hint, warden);
      warden.publish(hint);
      stood.push({ close: async () => memory.delete(hint) });
    } else if (road === 'http') {
      stood.push(await serve(warden, {}));
    } else if (road === 'tcp') {
      stood.push(await tcp.listen(warden, { clock, random }));
    } else if (road === 'wss') {
      stood.push(await wss.listen(warden, { clock, random, tls }));
    }
  }

  return {
    warden,
    delivery,
    async close() {
      // A ground that knows it is stopping writes its records before it does.
      // Without this, the next number it spends is one the far door has
      // already seen, and its first ask back is refused as a replay.
      await warden.keep();
      for (const line of [...byHint.values(), ...byPadlock.values()]) line.close();
      for (const one of stood) await one.close();
    },
  };
}
