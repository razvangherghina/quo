// Migration is a double rotation: to the committed heir, then immediately to a
// key the destination warden generated and the origin never saw. After it,
// every key the old warden held is dead. The old door only points.
//
// Nothing here is a message of its own. The state transfer is `receive`, an
// ordinary field spent by an ordinary standing; the two announcements are
// `tell`, an ordinary ask in the other direction. Both are the Warden
// blueprint's own fields, so no bytes are invented.
import { commitment as commit } from './arithmetic.js';
import { writeArgument } from './warden.js';
import { hex } from './bytes.js';

// The rows that stand at one being: who must be told, and how to reach them —
// the padlock the peer named and the hints it gave, refreshed by every call
// that arrived.
export function peers(warden, beingPk) {
  const at = hex(beingPk);
  return [...warden.inbound.values()].filter((row) => row.beings.has(at));
}

// The cargo, packed under the name the first rotation gives the being. Only
// data moves: the blueprint is reproduced at the far end from its digest, and
// what travels is the being's state and its relations — cells, both records of
// standings, and the replay record whole with them — the mark and the spent
// numbers beneath it.
export function pack(origin, beingPk) {
  const being = origin.beings.get(hex(beingPk));
  if (!being) return null;
  return {
    being: being.heir.pk,
    digest: being.digest,
    cells: being.cells(),
    standings: peers(origin, beingPk).map((row) => ({
      voice: row.voice,
      commitment: row.commitment,
      beings: [being.heir.pk],
      mark: row.mark ?? 0n,
      // The replay record travels whole: the mark and the spent numbers beneath
      // it. A mark alone would make the new door either refuse everything at or
      // below it — killing a caller with asks in flight — or honour it all,
      // reopening what was spent.
      spent: row.window(),
      // The way back travels with the standing, or the destination could not
      // send the second news to the peers that just arrived with it.
      padlock: row.padlock,
      hints: row.hints ?? [],
    })),
    // Its outbound record travels too. Nobody is owed news about this half —
    // the far doors know only a voice and have never heard of the being — but
    // a being that cannot reach them has lost everything it could do.
    //
    // The voice's keys means both of them. Carrying the current voice alone
    // would leave the being able to act once and never able to rotate, and
    // would leave the heir secret at the origin — the one key that can take
    // the standing over, held by a door whose keys are all supposed to be
    // dead.
    relations: origin.relationsOf(beingPk).map((row) => ({
      warden: row.warden,
      commitment: row.commitment,
      padlock: row.padlock,
      voice: row.voice.pk,
      secret: row.voice.secret,
      heir: row.heir.pk,
      heirSecret: row.heir.secret,
      seq: row.seq,
      hints: row.hints ?? [],
    })),
  };
}

// The origin's half, after the cargo has landed. It publishes the succession of
// the being's committed heir — carrying as its next commitment the one
// `receive` answered, and naming the new door — and stops acting on the being's
// behalf for good.
export function depart(origin, beingPk, { commitment, name, padlock, hints = [] }) {
  const being = origin.beings.get(hex(beingPk));
  if (!being) return null;

  const word = {
    being: beingPk,
    successor: being.heir.pk,
    commitment,
    // Where it answers has changed, so the word says so, and the peer rewrites
    // its row entire from it.
    name,
    padlock,
    hints,
  };

  const told = peers(origin, beingPk);

  // The old door never forwards a call and never acts on the being's behalf
  // again. The standings stay so a peer still reaches the door and is pointed.
  origin.beings.delete(hex(beingPk));
  // The relations went with the cargo, so the old door holds no voice of the
  // being's any more and can spend nothing on its behalf.
  origin.forget(beingPk);
  origin.point(beingPk, word);

  // The heir is handed back because the first news is signed by it and the
  // origin no longer holds the being: after the double rotation every key the
  // old warden held for it is dead.
  return { word, voice: being.heir, peers: told };
}

// The destination's half: what the second news needs, once the cargo has been
// taken in — the word it published, the key it generated, and the peers that
// arrived with the standings.
export function landed(destination) {
  const arrived = destination.arrived;
  if (!arrived) return null;
  const being = destination.beings.get(hex(arrived.successor));
  return {
    word: arrived.word,
    voice: { pk: being.pk, secret: being.secret },
    peers: arrived.voices.map((voice) => destination.standing(voice)).filter((row) => row !== null),
  };
}

// News is an ordinary envelope: ephemeral key outside, one signed payload
// sealed inside, the recipient named, a number that only rises — arriving at a
// peer's door and judged by the same seven steps. What makes it news is only
// where its voice is found.
//
// The recipient is named by whichever key the sender holds: the peer's warden
// name when it has one, otherwise the padlock it seals to. Speaking first
// therefore has an address, because an inbound row keeps the padlock the peer
// named even though it never learns that peer's name.
export function news(warden, { peer, voice, word, seq, allowance, random }) {
  const padlock = peer.padlock ?? null;
  const recipient = peer.name ?? padlock;
  // A peer that has never spoken left no way back. It is reached by the only
  // means left: it eventually asks, and the old door tells it.
  if (!recipient || !padlock) return null;
  return warden.carry({
    recipient,
    padlock,
    voicePk: voice.pk,
    voiceSecret: voice.secret,
    seq,
    allowance: allowance ?? { time: 5_000n, hops: 8n },
    // News names no being: the voice is placed in the outbound record, and that
    // is the whole of what makes it news.
    being: null,
    method: { name: 'tell', args: writeArgument('tell', word) },
    random,
  });
}

// The commitment a peer must hold to believe a being's succession: the pk of
// the warden the heir would spend at, then the heir's pk.
export { commit };
