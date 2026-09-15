// Keys and boxes. A ward key from a seed, a being key from a secret, and the
// two boxes a relation travels in. A reply:
//
//   box = ephemeral X25519 pk (32) || AES-256-GCM( body || Ed25519 signature (64) )
//
// and an ask, its head apart and its body sealed a second time under the edge
// key only the two ends hold:
//
//   box = ephemeral X25519 pk (32) || AES-256-GCM( head (32) ) || AES-256-GCM( body || signature (64) )
//
// with the ephemeral pk as the additional data of every ciphertext. A knock
// carries an ML-KEM-768 ciphertext between its head and its body:
//
//   box = ephemeral X25519 pk (32) || AES-256-GCM( head ) || ciphertext (1088) || AES-256-GCM( body || signature )

import { concat, decrypt, ed25519, encrypt, hex, hkdf, mlkem, sha256, unhex, utf8, x25519 } from './arithmetic.js';

// The size: a box of more than 1,048,576 bytes is refused before it is opened.
// A reply is its text and one hundred and twelve bytes more, an ask its
// payload and one hundred and sixty, a knock its payload and 1248. SEAL_BYTES
// is what the seal adds to a signed reply, the ephemeral pk and the tag;
// ASK_BYTES what it adds to a signed ask, the ephemeral pk, the head and two
// tags; KNOCK_BYTES that and the ciphertext.
export const SIZE = 1_048_576;
export const SEAL_BYTES = 32 + 16;
export const ASK_BYTES = 32 + 32 + 16 + 16;
export const CIPHERTEXT_BYTES = 1088;
export const KNOCK_BYTES = ASK_BYTES + CIPHERTEXT_BYTES;

// The zero edge key: every ask to the public being, and every standing taken
// on `{ ward }` alone, is sealed under it. An edge key is held as 64 hex, as
// every key in the partition is.
export const ZERO_EDGE_KEY = '00'.repeat(32);

// The knock's edge key, from the ML-KEM shared secret. The next edge key, from
// the edge key the ask came under then the reply's agreement, which both ends
// compute.
export const lockEdge = async (shared) => hex(await hkdf(shared, 'quo-lock', 32));
export const nextEdge = async (edge, agreement) => hex(await hkdf(concat(unhex(edge), agreement), 'quo-edge', 32));

// The ward's lock: its ML-KEM-768 key pair from the sixty-four bytes drawn
// for it, held as 128 hex. The encapsulation key goes out in an invitation.
export const lockKeys = (lock) => mlkem.keygen(unhex(lock));

// Thirty-two bytes are the seed; text, or bytes of another length, is
// SHA-256'd first, so a name is never taken as a key for being the right size.
async function seedBytes(seed) {
  if (typeof seed !== 'string' && seed.length === 32) return seed;
  return sha256(typeof seed === 'string' ? utf8(seed) : seed);
}

// The ward key: one seed, two curves, each secret derived under its own label.
// Outward it is the signing pk then the padlock, 128 hex, and it routes.
export async function wardKey(seed) {
  const bytes = await seedBytes(seed);
  const sign = await hkdf(bytes, 'quo-ward-sign', 32);
  const seal = await hkdf(bytes, 'quo-ward-seal', 32);
  const pk = hex(await ed25519.publicKey(sign)) + hex(await x25519.publicKey(seal));
  return { pk, sign, seal };
}

export const signingPkOf = (wardPk) => unhex(wardPk.slice(0, 64));
export const padlockOf = (wardPk) => unhex(wardPk.slice(64));
export const beingPk = async (secret) => hex(await ed25519.publicKey(secret));

// Sealed to a lid. The sender keeps the ephemeral secret to open the reply.
// A lid that will not take a seal, a small-order point among them, seals
// nothing: null. The ephemeral secret is drawn by the caller, in its order.
export async function box(lid, plaintext, secret) {
  const ephemeral = await x25519.publicKey(secret);
  const shared = await x25519.agree(secret, lid);
  if (!shared) return null;
  return { bytes: concat(ephemeral, await encrypt(shared, ephemeral, plaintext)), secret };
}

// An ask, sealed to a padlock: the head under `quo-seal` of the agreement,
// the body under `quo-edge-seal` of the agreement then the edge key. The head
// is the heir pk, or thirty-two zero bytes for nobody. A knock is handed the
// lock, the encapsulation key, in place of an edge key: m is drawn after the
// ephemeral secret unless the knock before it on the record is handed down,
// and its ciphertext rides before the body, which is sealed under the
// knock's edge key. The edge key sealed under and the m go back beside it.
export async function askBox(random, padlock, head, body, edge, lock, again) {
  const secret = random(32);
  const ephemeral = await x25519.publicKey(secret);
  const shared = await x25519.agree(secret, padlock);
  if (!shared) return null;
  let ciphertext = new Uint8Array(0);
  let m = null;
  if (lock) {
    m = again ?? random(32);
    const encapsulated = mlkem.encaps(lock, m);
    ciphertext = encapsulated.ciphertext;
    edge = await lockEdge(encapsulated.shared);
  }
  const sealedHead = await encrypt(shared, ephemeral, head);
  const sealedBody = await encrypt(concat(shared, unhex(edge)), ephemeral, body, 'quo-edge-seal');
  return { bytes: concat(ephemeral, sealedHead, ciphertext, sealedBody), secret, edge, m };
}

// An ask, opened with the ward's padlock secret. Fewer bytes than an
// ephemeral pk, a sealed head and a tag, an all-zero agreement, or a head
// that does not open: nothing. The head names the edge keys the body is
// tried under, in order, and the first that opens is the one it opened under.
// Or it names `{ lock }`, a fresh heir: the 1088 bytes after the head are a
// ciphertext, decapsulated with the lock, and the body is tried under the
// knock's edge key alone. A box too short for a ciphertext and a tag does not
// open.
export async function openAsk(secret, bytes, edgesFor) {
  if (bytes.length < ASK_BYTES) return null;
  const lid = bytes.subarray(0, 32);
  const shared = await x25519.agree(secret, lid);
  const head = shared && (await decrypt(shared, lid, bytes.subarray(32, 80)));
  if (!head) return null;
  let tries = edgesFor(head);
  let rest = bytes.subarray(80);
  if (!Array.isArray(tries)) {
    if (rest.length < CIPHERTEXT_BYTES + 16) return null;
    const secretOfKnock = mlkem.decaps(lockKeys(tries.lock).dk, rest.subarray(0, CIPHERTEXT_BYTES));
    if (!secretOfKnock) return null;
    tries = [await lockEdge(secretOfKnock)];
    rest = rest.subarray(CIPHERTEXT_BYTES);
  }
  for (const edge of tries) {
    const plaintext = await decrypt(concat(shared, unhex(edge)), lid, rest, 'quo-edge-seal');
    if (plaintext) return { head, plaintext, edge };
  }
  return null;
}

// Opened with the key the box was sealed to, or nothing.
export async function unbox(secret, bytes) {
  if (bytes.length < 32) return null;
  const lid = bytes.subarray(0, 32);
  const shared = await x25519.agree(secret, lid);
  return shared && decrypt(shared, lid, bytes.subarray(32));
}

// A body and its signature, and the split back. Sixty-four bytes or fewer hold
// no body beside a signature.
export const signed = async (secret, body) => concat(body, await ed25519.sign(secret, body));
export const split = (plaintext) =>
  plaintext && plaintext.length > 64 ? { body: plaintext.subarray(0, -64), signature: plaintext.subarray(-64) } : null;

// JSON bytes of a value, as a payload or a reply is written.
export const jsonBytes = (value) => utf8(JSON.stringify(value));

// A lid takes a seal unless every agreement with it is zero, which is what a
// small-order point does; a fixed scalar is enough to ask.
const PROBE = new Uint8Array(32).fill(9);
export const takesSeal = async (lid) => lid !== null && (await x25519.agree(PROBE, lid)) !== null;
