import test from 'node:test';
import assert from 'node:assert/strict';
import { hkdfSync } from 'node:crypto';
import {
  sha256,
  commitment,
  signingPair,
  sealingPair,
  sign,
  verify,
  smallOrder,
  agree,
  seal,
  open,
  unseal,
  derive,
  SEAL_INFO,
  SEAL_SALT,
  NONCE,
  TAG,
  encodePayload,
  decodePayload,
  decodeAnswer,
  tagged,
  untag,
  kindOf,
  box,
  concat,
  SAY,
  ANSWER,
  PAYLOAD_BLUEPRINT,
  parse,
  print,
  Refusal,
} from '../src/index.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const bytesOf = (text) => Uint8Array.from(Buffer.from(text, 'hex'));
// Every draw of randomness is taken as an argument, so the bench hands fixed
// bytes and gets identical output. Nothing here reaches for entropy.
const fixed = (fill) => new Uint8Array(32).fill(fill);

// The arithmetic is asynchronous on every ground, so a refusal arrives as a
// rejected promise. The assertion is the same one.
function rejectedWith(fn, code) {
  return assert.rejects(fn, (error) => error instanceof Refusal && error.code === code);
}

const voice = await signingPair(fixed(1));
const door = await sealingPair(fixed(2));
const caller = await sealingPair(fixed(3));
const EPHEMERAL = fixed(9);

const payload = {
  voice: voice.pk,
  recipient: fixed(7),
  commitment: null,
  seq: 4n,
  padlock: caller.pk,
  hints: ['https://a.example', 'https://b.example'],
  allowance: { time: 5000n, hops: 8n },
  being: fixed(8),
  method: { name: 'complete', args: Uint8Array.of(1, 2, 3) },
};

test('the payload blueprint is itself canonical notation', () => {
  assert.equal(print(parse(PAYLOAD_BLUEPRINT)), PAYLOAD_BLUEPRINT);
});

test('a key is thirty-two bytes and a signature is sixty-four', async () => {
  assert.equal(voice.pk.length, 32);
  assert.equal(door.pk.length, 32);
  assert.equal((await sign(Uint8Array.of(1), voice.secret)).length, 64);
});

test('a keypair is a function of the randomness it was handed', async () => {
  assert.equal(hex((await signingPair(fixed(1))).pk), hex(voice.pk));
  assert.notEqual(hex((await signingPair(fixed(2))).pk), hex(voice.pk));
  assert.equal(hex((await sealingPair(fixed(2))).pk), hex(door.pk));
  await rejectedWith(() => signingPair(new Uint8Array(31)), 'NOT_A_KEY');
});

test('Ed25519 signs, and a signature is refused by any other key or message', async () => {
  const message = new TextEncoder().encode('by whose authority');
  const signature = await sign(message, voice.secret);
  assert.equal(await verify(message, signature, voice.pk), true);
  assert.equal(await verify(message, signature, (await signingPair(fixed(4))).pk), false);
  assert.equal(
    await verify(new TextEncoder().encode('by whose authoritz'), signature, voice.pk),
    false,
  );
  const bent = Uint8Array.from(signature);
  bent[0] ^= 1;
  assert.equal(await verify(message, bent, voice.pk), false);
  assert.equal(await verify(message, signature.subarray(0, 63), voice.pk), false);
});

test('X25519 agrees, and both sides reach the same secret', async () => {
  const ephemeral = await sealingPair(EPHEMERAL);
  assert.equal(
    hex(await agree(ephemeral.secret, door.pk)),
    hex(await agree(door.secret, ephemeral.pk)),
  );
  assert.notEqual(
    hex(await agree(ephemeral.secret, caller.pk)),
    hex(await agree(ephemeral.secret, door.pk)),
  );
});

test('an agreement that hands back thirty-two zero bytes is refused at the point of agreement', async () => {
  const ephemeral = await sealingPair(EPHEMERAL);
  // A padlock that is not a real key. Every small-order point on the curve
  // drives the agreement to zero, and a seal derived from it would protect
  // nothing — so the refusal is where the agreement is, not later.
  for (const dead of [
    new Uint8Array(32),
    Uint8Array.of(1, ...new Uint8Array(31)),
    bytesOf('e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800'),
  ]) {
    await rejectedWith(() => agree(ephemeral.secret, dead), 'DEAD_AGREEMENT');
  }
  // A real padlock still agrees, so what was refused is the key.
  assert.equal((await agree(ephemeral.secret, door.pk)).length, 32);
});

test('an all-zero or small-order public key is silence before any signature is examined', async () => {
  const message = new TextEncoder().encode('by whose authority');
  const signature = await sign(message, voice.secret);
  assert.equal(await verify(message, signature, voice.pk), true);
  // The eight small-order points, the all-zero key among them. The pre-check
  // stands in front of whatever verifier the platform supplies, so a kit never
  // reimplements the arithmetic to comply.
  const points = [
    '0100000000000000000000000000000000000000000000000000000000000000',
    'ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f',
    '0000000000000000000000000000000000000000000000000000000000000000',
    '0000000000000000000000000000000000000000000000000000000000000080',
    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05',
    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a',
    '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85',
    'c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa',
  ].map(bytesOf);
  for (const point of points) {
    assert.equal(smallOrder(point), true);
    assert.equal(await verify(message, signature, point), false);
  }
  // An ordinary key is not one of them, and a key of the wrong size is refused
  // before anything is imported.
  assert.equal(smallOrder(voice.pk), false);
  assert.equal(await verify(message, signature, new Uint8Array(31)), false);
});

test('the heir commitment hashes the door and the heir, in that order', async () => {
  const heir = await signingPair(fixed(5));
  assert.equal(hex(await commitment(door.pk, heir.pk)), hex(await sha256(door.pk, heir.pk)));
  // The key alone is not the commitment, and the two orders are not one hash.
  assert.notEqual(hex(await commitment(door.pk, heir.pk)), hex(await sha256(heir.pk)));
  assert.notEqual(hex(await commitment(door.pk, heir.pk)), hex(await commitment(heir.pk, door.pk)));
  assert.equal((await commitment(door.pk, heir.pk)).length, 32);
});

test('the payload round-trips through its binary form', () => {
  assert.deepEqual(decodePayload(encodePayload(payload)), payload);
});

test('a payload with the optional fields absent round-trips too', () => {
  const bare = { ...payload, commitment: null, being: null, method: null, hints: [] };
  assert.deepEqual(decodePayload(encodePayload(bare)), bare);
});

test('a rotation carries a fresh commitment in the same payload shape', async () => {
  const heir = await signingPair(fixed(6));
  const rotating = { ...payload, commitment: await commitment(fixed(7), heir.pk) };
  assert.deepEqual(decodePayload(encodePayload(rotating)), rotating);
  // Nothing marks the message as an ask or a rotation: the kind is read off
  // the voice, and the two payloads differ only in a field being present.
  assert.notEqual(encodePayload(rotating).length, encodePayload(payload).length);
});

test('the same payload and the same randomness seal to the same bytes', async () => {
  const once = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  const twice = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  assert.equal(hex(once), hex(twice));
  const other = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: fixed(10),
  });
  assert.notEqual(hex(other), hex(once));
});

test('the ephemeral key is outside, and nothing else is', async () => {
  const envelope = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  assert.equal(hex(envelope.subarray(0, 32)), hex((await sealingPair(EPHEMERAL)).pk));
  // Ephemeral key, then one ciphertext: the record byte, the payload, its
  // signature, and a tag. No length rides in front of the payload — the
  // signature is fixed size.
  const inside = 1 + encodePayload(payload).length + 64;
  assert.equal(envelope.length, 32 + inside + TAG);
});

test('the sealing key and its nonce are drawn from one HKDF expansion', async () => {
  // Empty salt, the single ASCII info `quo-seal`, forty-four bytes out:
  // thirty-two of key, then twelve of nonce.
  assert.equal(Buffer.from(SEAL_INFO).toString('ascii'), 'quo-seal');
  assert.equal(SEAL_SALT.length, 0);
  assert.equal(NONCE, 12);
  assert.equal(TAG, 16);
  const shared = await agree((await sealingPair(EPHEMERAL)).secret, door.pk);
  const { key, nonce } = await derive(shared);
  assert.equal(key.length, 32);
  assert.equal(nonce.length, 12);
  const expanded = new Uint8Array(hkdfSync('sha256', shared, SEAL_SALT, SEAL_INFO, 32 + 12));
  assert.equal(hex(key), hex(expanded.subarray(0, 32)));
  assert.equal(hex(nonce), hex(expanded.subarray(32)));
  // A different info is a different key: the label is what keeps a key agreed
  // for one purpose from serving another.
  const other = new Uint8Array(hkdfSync('sha256', shared, SEAL_SALT, Buffer.from('quo-other'), 44));
  assert.notEqual(hex(key), hex(other.subarray(0, 32)));
});

test('the ephemeral key is the seal own additional authenticated data', async () => {
  const envelope = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  // Swap the lid for another well-formed one and the box will not open: the
  // ephemeral pk is bound to the ciphertext, so they cannot be mixed and
  // matched. Without the AAD the agreement would simply fail; with it, even a
  // lid that agrees to the same shared secret is refused.
  const swapped = Uint8Array.from(envelope);
  swapped.set((await sealingPair(fixed(12))).pk, 0);
  await rejectedWith(() => unseal({ envelope: swapped, padlockSecret: door.secret }), 'NOT_OURS');
  // And the tag covers exactly sixteen bytes at the end.
  const short = envelope.subarray(0, envelope.length - 1);
  await rejectedWith(() => unseal({ envelope: short, padlockSecret: door.secret }), 'NOT_OURS');
});

test('the payload rides bare where the notation writes a key bare', () => {
  const bytes = encodePayload(payload);
  // voice, then recipient, each thirty-two bytes with no length in front.
  assert.equal(hex(bytes.subarray(0, 32)), hex(payload.voice));
  assert.equal(hex(bytes.subarray(32, 64)), hex(payload.recipient));
  // Then the commitment optional as one absent byte, then the seq as an int.
  assert.equal(bytes[64], 0);
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset + 65, 8).getBigInt64(0, false), 4n);
  // Then the padlock, bare again.
  assert.equal(hex(bytes.subarray(73, 105)), hex(payload.padlock));
});

test('the allowance is two ints, time in milliseconds then hops', () => {
  const bare = { ...payload, commitment: null, being: null, method: null, hints: [] };
  const bytes = encodePayload(bare);
  // voice 32, recipient 32, commitment absent 1, seq 8, padlock 32, hints
  // count 8 — then the allowance.
  const at = 32 + 32 + 1 + 8 + 32 + 8;
  const view = new DataView(bytes.buffer, bytes.byteOffset + at, 16);
  assert.equal(view.getBigInt64(0, false), 5000n);
  assert.equal(view.getBigInt64(8, false), 8n);
});

test('the method is one optional pair carrying an opaque blob', async () => {
  const opened = await open({
    envelope: await seal({
      payload,
      padlock: door.pk,
      voiceSecret: voice.secret,
      random: EPHEMERAL,
    }),
    padlockSecret: door.secret,
  });
  assert.equal(opened.payload.method.name, 'complete');
  assert.equal(hex(opened.payload.method.args), '010203');
  // Present together or absent together, and the blob may be empty.
  const empty = { ...payload, method: { name: 'items', args: new Uint8Array(0) } };
  assert.deepEqual(decodePayload(encodePayload(empty)), empty);
  assert.equal(decodePayload(encodePayload({ ...payload, method: null })).method, null);
});

test('the signature is the last sixty-four bytes inside the seal', async () => {
  const opened = await open({
    envelope: await seal({
      payload,
      padlock: door.pk,
      voiceSecret: voice.secret,
      random: EPHEMERAL,
    }),
    padlockSecret: door.secret,
  });
  assert.equal(opened.signature.length, 64);
  // What was signed is the record byte and the record together.
  assert.equal(hex(opened.bytes), hex(tagged(SAY, encodePayload(payload))));
  assert.equal(await verify(opened.bytes, opened.signature, voice.pk), true);
});

test('a sealed envelope unseals to the payload it carried', async () => {
  const envelope = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  assert.deepEqual(await unseal({ envelope, padlockSecret: door.secret }), payload);
});

test('a byte flipped anywhere is refused', async () => {
  const envelope = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  for (let at = 0; at < envelope.length; at += 1) {
    const bent = Uint8Array.from(envelope);
    bent[at] ^= 1;
    await assert.rejects(
      () => unseal({ envelope: bent, padlockSecret: door.secret }),
      (error) => error instanceof Refusal,
      `byte ${at} was not refused`,
    );
  }
});

test('only the door the box was sealed to can open it', async () => {
  const envelope = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  await rejectedWith(() => unseal({ envelope, padlockSecret: caller.secret }), 'NOT_OURS');
  await rejectedWith(
    () => unseal({ envelope: envelope.subarray(0, 32), padlockSecret: door.secret }),
    'SHORT_INPUT',
  );
  await rejectedWith(
    () => unseal({ envelope: new Uint8Array(0), padlockSecret: door.secret }),
    'SHORT_INPUT',
  );
});

// Sealing arbitrary bytes as the inside of an envelope: the only way to write
// a payload the kit itself would never write.
async function sealInside(inside, secret = voice.secret) {
  return box(concat([inside, await sign(inside, secret)]), door.pk, EPHEMERAL);
}

test('a payload under any byte but the say byte meets silence at a door', async () => {
  const bytes = encodePayload(payload);
  // The answer byte, a byte naming no record at all, and no byte in front.
  for (const inside of [tagged(ANSWER, bytes), tagged(7, bytes), bytes]) {
    const envelope = await sealInside(inside);
    await rejectedWith(() => unseal({ envelope, padlockSecret: door.secret }), 'WRONG_RECORD');
  }
  // And an empty payload has no byte to read.
  const empty = await sealInside(new Uint8Array(0));
  await rejectedWith(() => unseal({ envelope: empty, padlockSecret: door.secret }), 'SHORT_INPUT');
});

// The confusion the byte exists to kill. Before it, one stretch of bytes could
// be a legal `say` and a legal `answer` at once, so a signature over it proved
// only that its signer had said something — never which of the two.
test('a payload that decodes as both records is judged by the byte alone', async () => {
  const recipient = new Uint8Array(32).fill(3);
  // Read as an answer: the voice is the warden, the recipient's first eight
  // bytes are the seq, its ninth says the data is present, and the eight after
  // it are a length that consumes exactly what remains of the say.
  recipient[8] = 1;
  new DataView(recipient.buffer).setBigInt64(9, BigInt(131 - 49), false);
  const both = encodePayload({
    ...payload,
    recipient,
    commitment: null,
    hints: [],
    being: null,
    method: null,
  });
  assert.equal(both.length, 131);
  // Both decoders take it, which is the ambiguity itself.
  assert.ok(decodePayload(both));
  assert.ok(decodeAnswer(both));

  // Under the say byte it is the say it encodes, and nothing else.
  const asSay = await sealInside(tagged(SAY, both));
  assert.equal(
    hex((await unseal({ envelope: asSay, padlockSecret: door.secret })).voice),
    hex(voice.pk),
  );
  assert.equal(await kindOf({ envelope: asSay, padlockSecret: door.secret }), SAY);

  // Under the answer byte it is not a say at any door, however well it decodes
  // as one and whoever signed it.
  const asAnswer = await sealInside(tagged(ANSWER, both));
  await rejectedWith(
    () => unseal({ envelope: asAnswer, padlockSecret: door.secret }),
    'WRONG_RECORD',
  );
  assert.equal(await kindOf({ envelope: asAnswer, padlockSecret: door.secret }), ANSWER);
});

test('the byte says which record arrived, and refuses to guess', async () => {
  const envelope = await seal({
    payload,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  assert.equal(await kindOf({ envelope, padlockSecret: door.secret }), SAY);
  // A box this padlock cannot open, and a byte naming no record, are one
  // answer: nothing.
  assert.equal(await kindOf({ envelope, padlockSecret: caller.secret }), null);
  assert.equal(
    await kindOf({
      envelope: await sealInside(tagged(9, encodePayload(payload))),
      padlockSecret: door.secret,
    }),
    null,
  );
  // And the inverse of the byte is one refusal, never a silent strip.
  assert.equal(hex(untag(SAY, tagged(SAY, Uint8Array.of(5)))), '05');
  assert.throws(() => untag(SAY, tagged(ANSWER, Uint8Array.of(5))), Refusal);
});

test('a payload signed by one voice and claiming another is refused', async () => {
  const liar = { ...payload, voice: (await signingPair(fixed(11))).pk };
  const envelope = await seal({
    payload: liar,
    padlock: door.pk,
    voiceSecret: voice.secret,
    random: EPHEMERAL,
  });
  await rejectedWith(() => unseal({ envelope, padlockSecret: door.secret }), 'BAD_SIGNATURE');
});
