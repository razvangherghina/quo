// The hand, `quo/vectors/HARNESS.md` section 3 and `quo/SPEC.md` chapter 3:
// a dialer that mints its own keys and writes boxes and frames itself, so it
// can put on the wire what no ward would, and a ward on its own address
// under its own seed, so a kit knocks and asks at it and reads the replies
// it forges. It knocks with invitations the driver obtained through the
// root, so no key is ever exported from a kit. It depends on no library:
// every algorithm is `SPEC.md` chapter 3, "The sealed box", read straight
// onto Node's own `crypto` and `net`, ML-KEM-768 included.

import crypto from 'node:crypto';
import { createServer } from 'node:net';
import { encapsulate } from './kem.js';

// Ed25519 and X25519 read the same thirty-two raw bytes as two unrelated
// scalars (`SPEC.md`: "every other key is a seed and is derived from
// nothing: no hash, no label, no second derivation"). Node's `crypto` takes
// a raw OKP scalar only wrapped in its DER PKCS8/SPKI envelope, so these
// four fixed prefixes (the ASN.1 around the Ed25519 / X25519 OIDs, RFC
// 8410) are the whole cost of reading a bare thirty-two byte seed as either
// kind of key.
const ED_PRIV_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ED_PUB_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const X_PRIV_PREFIX = Buffer.from('302e020100300506032b656e04220420', 'hex');
const X_PUB_PREFIX = Buffer.from('302a300506032b656e032100', 'hex');
// The SPKI envelope around an ML-KEM-768 encapsulation key of 1184 bytes.
const KEM_PUB_PREFIX = Buffer.from('308204b2300b0609608648016503040402038204a100', 'hex');

function edPrivFromSeed(seed) {
  return crypto.createPrivateKey({ key: Buffer.concat([ED_PRIV_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}
function edPubFromRaw(pk) {
  return crypto.createPublicKey({ key: Buffer.concat([ED_PUB_PREFIX, pk]), format: 'der', type: 'spki' });
}
function edPkOf(priv) {
  const der = crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' });
  return der.subarray(der.length - 32);
}
function xPrivFromSeed(seed) {
  return crypto.createPrivateKey({ key: Buffer.concat([X_PRIV_PREFIX, seed]), format: 'der', type: 'pkcs8' });
}
function xPubFromRaw(pk) {
  return crypto.createPublicKey({ key: Buffer.concat([X_PUB_PREFIX, pk]), format: 'der', type: 'spki' });
}
function xPkOf(priv) {
  const der = crypto.createPublicKey(priv).export({ format: 'der', type: 'spki' });
  return der.subarray(der.length - 32);
}

// Where the hand draws every byte of entropy: the operating system's, or a
// fixed stream the trace hands it.
let random = crypto.randomBytes;

export function randomSeed() {
  return random(32);
}

// A minted key: a bare thirty-two byte seed, read both ways. `seed` may be
// text (a heir secret arrives as 64 hex from an invitation) or 32 raw bytes.
// A heir key is handed its invitation's `lock` too, the ward's ML-KEM-768
// encapsulation key, and every ask it signs for its own heir is a knock.
export function mintKey(seed = randomSeed(), lock = null) {
  const bytes = Buffer.isBuffer(seed) ? seed : Buffer.from(seed, 'hex');
  if (bytes.length !== 32) throw new Error(`a key's seed is 32 bytes, got ${bytes.length}`);
  const edPriv = edPrivFromSeed(bytes);
  const xPriv = xPrivFromSeed(bytes);
  return {
    seed: bytes,
    lock,
    signPk: edPkOf(edPriv).toString('hex'),
    xPk: xPkOf(xPriv).toString('hex'),
    sign(msg) {
      return crypto.sign(null, msg, edPriv);
    },
  };
}

// `SPEC.md` chapter 3, "the box": forty-four bytes out of HKDF-SHA-256
// under a label, the first thirty-two the AES-256 key and the last twelve
// the nonce. `quo-seal` takes the agreement, `quo-edge-seal` the agreement
// then the edge key.
function sealBytes(material, label = 'quo-seal') {
  const out = Buffer.from(crypto.hkdfSync('sha256', material, Buffer.alloc(0), Buffer.from(label, 'ascii'), 44));
  return { key: out.subarray(0, 32), nonce: out.subarray(32, 44) };
}

function gcm(key, nonce, aad, plain) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  return Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
}

// The zero edge key: the public being's, and a standing's on `{ ward }` alone.
export const ZERO_EDGE = Buffer.alloc(32);

const hkdf32 = (material, label) => Buffer.from(crypto.hkdfSync('sha256', material, Buffer.alloc(0), Buffer.from(label, 'ascii'), 32));

// The edge key the hand holds per heir, and the heir and edge key each lid
// was sealed for, so a reply that answers with an object moves that heir's
// edge key to `quo-edge` of the key the ask came under and the reply's
// agreement.
const edges = new Map();
const lids = new Map();

// The hand as it stands before its first ask, holding no edge key, drawing
// from `source`. The trace starts every record from one.
export function freshHand(source) {
  random = source;
  edges.clear();
  lids.clear();
}

// Builds and seals one ask, `payload` a plain object shaped as chapter 3's
// `{ to, by, next, seq, time, method?, args? }`. `signKey` is the mintKey()
// this ask is signed with (the heir itself at a fresh knock, or the hand's
// own key after). `padlockHex` is the ward's padlock, the last 32 of its
// 128 hex pk. The head is `to`'s thirty-two bytes, or zero for nobody, and
// the body is sealed under the edge key the hand holds for `to`, or `edge`
// when given. A heir key signing for its own heir knocks: the ephemeral
// secret is drawn, then m, the ciphertext of its lock rides between the head
// and the body, and the body is under the knock's edge key, `quo-lock` of the
// shared secret, which the hand holds for that heir from then on. Returns the
// box and the ephemeral secret needed to open the reply: "the sender keeps
// the ephemeral secret until the reply comes".
export function sealAsk(padlockHex, signKey, payload, edge) {
  return sealAskBytes(padlockHex, signKey, Buffer.from(JSON.stringify(payload), 'utf8'), payload.to, edge);
}

// `sealAsk` over payload bytes already written, with `to` named beside them.
export function sealAskBytes(padlockHex, signKey, payloadBytes, to, edge) {
  const sig = signKey.sign(payloadBytes);
  const body = Buffer.concat([payloadBytes, sig]);
  const payload = { to: /^[0-9a-f]{64}$/.test(to ?? '') ? to : null };
  const head = payload.to ? Buffer.from(payload.to, 'hex') : ZERO_EDGE;
  const knocks = Boolean(signKey.lock && payload.to && payload.to === signKey.signPk);
  if (!knocks) edge ??= (payload.to && edges.get(payload.to)) || ZERO_EDGE;

  const ephemeralSeed = randomSeed();
  const ephemeralPriv = xPrivFromSeed(ephemeralSeed);
  const ephemeralPk = xPkOf(ephemeralPriv);
  let ciphertext = Buffer.alloc(0);
  if (knocks) {
    const sealed = encapsulate(Buffer.from(signKey.lock, 'hex'), randomSeed());
    ciphertext = sealed.ciphertext;
    edge = hkdf32(sealed.shared, 'quo-lock');
    edges.set(payload.to, edge);
  }
  const padlock = xPubFromRaw(Buffer.from(padlockHex, 'hex'));
  const agreement = crypto.diffieHellman({ privateKey: ephemeralPriv, publicKey: padlock });
  const headSeal = sealBytes(agreement);
  const bodySeal = sealBytes(Buffer.concat([agreement, edge]), 'quo-edge-seal');

  if (payload.to) lids.set(ephemeralSeed.toString('hex'), { heir: payload.to, edge });
  return {
    box: Buffer.concat([ephemeralPk, gcm(headSeal.key, headSeal.nonce, ephemeralPk, head), ciphertext, gcm(bodySeal.key, bodySeal.nonce, ephemeralPk, body)]),
    lidSecret: ephemeralSeed,
    edge,
  };
}

// The edge key that follows `edge` under a reply's agreement, `quo-edge`.
export function followEdge(edge, agreement) {
  return hkdf32(Buffer.concat([edge, agreement]), 'quo-edge');
}

// The edge key the hand holds now for a heir it sends on as a dialer.
export function edgeOf(heir) {
  return edges.get(heir) ?? null;
}

// Seals a reply as a ward would, to `lidHex`, signed by `signKey`: the reply
// box has no head and no edge key.
export function sealReply(lidHex, signKey, reply) {
  const replyBytes = Buffer.from(JSON.stringify(reply), 'utf8');
  const body = Buffer.concat([replyBytes, signKey.sign(replyBytes)]);
  const ephemeralSeed = randomSeed();
  const ephemeralPriv = xPrivFromSeed(ephemeralSeed);
  const ephemeralPk = xPkOf(ephemeralPriv);
  const agreement = crypto.diffieHellman({ privateKey: ephemeralPriv, publicKey: xPubFromRaw(Buffer.from(lidHex, 'hex')) });
  const { key, nonce } = sealBytes(agreement);
  return { box: Buffer.concat([ephemeralPk, gcm(key, nonce, ephemeralPk, body)]) };
}

// Opens a reply box with the ephemeral secret the matching `sealAsk` kept.
// Returns `{ payloadBytes, sig }` on a box that opens and is at least a
// signature long, or `null` -- `SPEC.md`: "a reply over the size, or that
// does not open, ... is silence to the sender." A reply that is an object
// moves the edge key of the heir its lid was sealed for to `quo-edge` of
// the edge key the ask came under and the reply's agreement.
export function openReply(lidSecret, box) {
  if (box.length < 112) return null;
  const ephemeralPk = box.subarray(0, 32);
  const ct = box.subarray(32, box.length - 16);
  const tag = box.subarray(box.length - 16);
  try {
    const ephemeralPriv = xPrivFromSeed(lidSecret);
    const senderPk = xPubFromRaw(ephemeralPk);
    const agreement = crypto.diffieHellman({ privateKey: ephemeralPriv, publicKey: senderPk });
    const { key, nonce } = sealBytes(agreement);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(ephemeralPk);
    decipher.setAuthTag(tag);
    const body = Buffer.concat([decipher.update(ct), decipher.final()]);
    if (body.length < 64) return null;
    const payloadBytes = body.subarray(0, body.length - 64);
    const sent = lids.get(Buffer.from(lidSecret).toString('hex'));
    if (sent && readReply(payloadBytes) && 'object' in readReply(payloadBytes)) {
      edges.set(sent.heir, followEdge(sent.edge, agreement));
    }
    return { payloadBytes, sig: body.subarray(body.length - 64), agreement };
  } catch {
    return null;
  }
}

// Verifies a reply body was signed by the ward it was sent to: `by` names
// nobody here, the ward key does, its signing half being the first 32 of
// its 128 hex pk.
export function verifyWard(payloadBytes, sig, wardPkHex) {
  try {
    const signingPk = edPubFromRaw(Buffer.from(wardPkHex, 'hex').subarray(0, 32));
    return crypto.verify(null, payloadBytes, signingPk, sig);
  } catch {
    return false;
  }
}

// Reads a sealed reply's three shapes, `SPEC.md` "the replies", strictly:
// a field beside its shape's, or a `seen` that is neither a digest nor
// null, is none of the three and so is read here as `null` (silence to the
// sender, per the strict-reading rule).
export function readReply(payloadBytes) {
  let v;
  try {
    v = JSON.parse(payloadBytes.toString('utf8'));
  } catch {
    return null;
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const keys = Object.keys(v);
    if (keys.length === 1 && keys[0] === 'silence' && v.silence === true) return { silence: true };
    if (keys.length === 1 && keys[0] === 'quo' && typeof v.quo === 'string') return { quo: v.quo };
    if (keys.length === 2 && 'object' in v && 'seen' in v && (v.seen === null || /^[0-9a-f]{64}$/.test(v.seen))) {
      return { object: v.object, seen: v.seen };
    }
  }
  return null;
}

function idBuf(id) {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(id, 0);
  return b;
}

// `SPEC.md` chapter 6, "the frame": `00 ask rest = ward pk (64) || box`.
export function frameAsk(id, wardPkHex, box) {
  const rest = Buffer.concat([Buffer.from(wardPkHex, 'hex'), box]);
  const body = Buffer.concat([Buffer.from([0x00]), idBuf(id), rest]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

// `SPEC.md` chapter 6, "the frame": a reply `01` or a nothing `02` with the
// ask's id copied onto it.
function frameOut(kind, id, rest = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from([kind]), idBuf(id), rest]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

function openGcm(key, nonce, aad, sealed) {
  if (sealed.length < 16) return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
    decipher.setAAD(aad);
    decipher.setAuthTag(sealed.subarray(sealed.length - 16));
    return Buffer.concat([decipher.update(sealed.subarray(0, sealed.length - 16)), decipher.final()]);
  } catch {
    return null;
  }
}

// The ward key of `SPEC.md` chapter 3: a seed of thirty-two bytes is the
// seed and anything else is SHA-256'd to it, then HKDF-SHA-256 under
// `quo-ward-sign` is the Ed25519 seed and under `quo-ward-seal` the X25519
// scalar.
function wardKeyOf(seed) {
  const bytes = Buffer.isBuffer(seed) && seed.length === 32 ? seed : crypto.createHash('sha256').update(seed).digest();
  const signPriv = edPrivFromSeed(hkdf32(bytes, 'quo-ward-sign'));
  const sealPriv = xPrivFromSeed(hkdf32(bytes, 'quo-ward-seal'));
  const pk = Buffer.concat([edPkOf(signPriv), xPkOf(sealPriv)]).toString('hex');
  return { pk, signPriv, sealPriv };
}

// The 128 hex pk of the ward a seed stands, for a box sealed to a padlock no
// ward in the story holds.
export const wardPkOf = (seed) => wardKeyOf(seed).pk;

// The hand standing as a ward, `SCENARIOS.md` "A hand": it listens on
// `listen`, mints invitations to heirs of its own under a lock of its own,
// opens every ask framed to its pk, and answers each with what `answer`
// returns for it. `answer(ask)` is handed `{ heir, knock, edge, lid,
// payloadBytes, payload, signature }` and returns one of: a JSON value, the
// reply sealed and signed by the hand's ward key; `{ text, signer? }`, reply
// bytes written as given and signed by `signer`, a `mintKey()`, or by the
// ward key when absent; `{ nothing: true }`, a `02`; `{ none: true }`, no
// frame at all. Every ask it opened is kept in `heard`. An ask that does not
// open is answered nothing at all and kept in `unopened`, since the hand
// forges and is judged by no line as a door.
export async function standHand({ seed = randomSeed(), listen, answer }) {
  const ward = wardKeyOf(seed);
  const lock = crypto.generateKeyPairSync('ml-kem-768');
  const lockHex = lock.publicKey.export({ format: 'der', type: 'spki' }).subarray(KEM_PUB_PREFIX.length).toString('hex');
  // heir pk -> { fresh, edges: the edge keys an ask on it may come under }
  const heirs = new Map();
  const heard = [];
  const unopened = [];

  function open(box) {
    if (box.length < 32 + 48 + 16 + 64) return null;
    const lid = box.subarray(0, 32);
    let agreement;
    try {
      agreement = crypto.diffieHellman({ privateKey: ward.sealPriv, publicKey: xPubFromRaw(lid) });
    } catch {
      return null;
    }
    const headSeal = sealBytes(agreement);
    const head = openGcm(headSeal.key, headSeal.nonce, lid, box.subarray(32, 80));
    if (!head) return null;
    const heirHex = head.equals(ZERO_EDGE) ? null : head.toString('hex');
    const held = heirHex && heirs.get(heirHex);
    let rest = box.subarray(80);
    let candidates = [ZERO_EDGE];
    const knock = Boolean(held && held.fresh);
    if (knock) {
      try {
        const sharedKey = crypto.decapsulate(lock.privateKey, rest.subarray(0, 1088));
        candidates = [hkdf32(Buffer.from(sharedKey), 'quo-lock')];
      } catch {
        return null;
      }
      rest = rest.subarray(1088);
    } else if (held) {
      candidates = held.edges;
    }
    for (const edge of candidates) {
      const bodySeal = sealBytes(Buffer.concat([agreement, edge]), 'quo-edge-seal');
      const body = openGcm(bodySeal.key, bodySeal.nonce, lid, rest);
      if (!body || body.length < 64) continue;
      const payloadBytes = body.subarray(0, body.length - 64);
      let payload = null;
      try {
        payload = JSON.parse(payloadBytes.toString('utf8'));
      } catch {
        payload = null;
      }
      return { heir: heirHex, knock, edge, lid: lid.toString('hex'), payloadBytes, payload, signature: body.subarray(body.length - 64) };
    }
    return null;
  }

  function reply(ask, out) {
    const forged = out && typeof out === 'object' && 'text' in out;
    const text = Buffer.from(forged ? out.text : JSON.stringify(out), 'utf8');
    const sig = forged && out.signer ? out.signer.sign(text) : crypto.sign(null, text, ward.signPriv);
    const ephemeralPriv = xPrivFromSeed(randomSeed());
    const ephemeralPk = xPkOf(ephemeralPriv);
    const agreement = crypto.diffieHellman({ privateKey: ephemeralPriv, publicKey: xPubFromRaw(Buffer.from(ask.lid, 'hex')) });
    const { key, nonce } = sealBytes(agreement);
    const held = ask.heir && heirs.get(ask.heir);
    const shaped = readReply(text);
    if (held && shaped && 'object' in shaped) {
      held.fresh = false;
      held.edges = [ask.edge, hkdf32(Buffer.concat([ask.edge, agreement]), 'quo-edge')];
    }
    return Buffer.concat([ephemeralPk, gcm(key, nonce, ephemeralPk, Buffer.concat([text, sig]))]);
  }

  // `SPEC.md` "Noise": an ask that does not open is answered the one silence,
  // sealed to its first thirty-two bytes when there are that many and they
  // take a seal, and to a key nobody holds otherwise.
  function noise(box) {
    const text = Buffer.from('{"silence":true}', 'utf8');
    const body = Buffer.concat([text, crypto.sign(null, text, ward.signPriv)]);
    const candidates = box.length >= 32 ? [box.subarray(0, 32)] : [];
    candidates.push(randomSeed(), xPkOf(xPrivFromSeed(randomSeed())));
    for (const lid of candidates) {
      try {
        const ephemeralPriv = xPrivFromSeed(randomSeed());
        const ephemeralPk = xPkOf(ephemeralPriv);
        const agreement = crypto.diffieHellman({ privateKey: ephemeralPriv, publicKey: xPubFromRaw(lid) });
        if (agreement.equals(ZERO_EDGE)) continue;
        const { key, nonce } = sealBytes(agreement);
        return Buffer.concat([ephemeralPk, gcm(key, nonce, ephemeralPk, body)]);
      } catch {
        continue;
      }
    }
    throw new Error('no lid takes a seal');
  }

  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    let buf = Buffer.alloc(0);
    socket.on('data', async (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      while (buf.length >= 4 && buf.length >= 4 + buf.readUInt32BE(0)) {
        const body = buf.subarray(4, 4 + buf.readUInt32BE(0));
        buf = buf.subarray(4 + body.length);
        if (body.length < 5 + 64 || body[0] !== 0x00) continue;
        const id = body.readUInt32BE(1);
        if (body.subarray(5, 69).toString('hex') !== ward.pk) {
          socket.write(frameOut(0x02, id));
          continue;
        }
        const ask = open(body.subarray(69));
        if (!ask) {
          unopened.push(body.subarray(69));
          socket.write(frameOut(0x01, id, noise(body.subarray(69))));
          continue;
        }
        heard.push(ask);
        const out = await answer(ask);
        if (out && typeof out === 'object' && out.none) continue;
        if (out && typeof out === 'object' && out.nothing) socket.write(frameOut(0x02, id));
        else socket.write(frameOut(0x01, id, reply(ask, out)));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    const { host, port } = splitHostPort(listen);
    server.listen(port, host, resolve);
  });
  const address = server.address();

  return {
    pk: ward.pk,
    at: `${address.address}:${address.port}`,
    heard,
    unopened,
    // The edge keys the hand holds for a heir of its own as a door: `open`,
    // the key the last honoured ask came under, and `offered`, the key that
    // follows the reply to it. Both null before a knock is answered.
    edgesOf(heir) {
      const held = heirs.get(heir);
      return { open: held?.edges[0] ?? null, offered: held?.edges[1] ?? null };
    },
    // A fresh heir of the hand's own and the invitation that carries it.
    invite() {
      const secret = randomSeed();
      const heir = mintKey(secret).signPk;
      heirs.set(heir, { fresh: true, edges: [] });
      return { ward: ward.pk, heir, secret: secret.toString('hex'), lock: lockHex };
    },
    close() {
      for (const socket of sockets) socket.destroy();
      return new Promise((resolve) => server.close(resolve));
    },
  };
}

function splitHostPort(s) {
  const at = s.lastIndexOf(':');
  return { host: s.slice(0, at), port: Number(s.slice(at + 1)) };
}

