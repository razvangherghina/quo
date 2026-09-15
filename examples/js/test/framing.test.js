import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ed25519, hex, mlkem, unhex, utf8, x25519 } from '../src/arithmetic.js';
import { MemoryHarbor } from '../src/harbor.js';
import { emptyPartition } from '../src/partition.js';
import { ZERO_EDGE_KEY, askBox, beingPk, box, lockEdge, lockKeys, openAsk, signed, split, wardKey } from '../src/seal.js';
import { readReply } from '../src/sender.js';
import { canonical, digest, parseJson } from '../src/value.js';
import { Host } from './fixtures/beings.js';
import { vectors } from './fixtures/vectors.js';

const all = await vectors('framing');
const fixed = (h) => () => unhex(h);
const drawn = (...draws) => () => unhex(draws.shift());
const ward = await wardKey(unhex(all[0].seed));
const signedBody = all.find((v) => v.body && v.to !== '');

// An ask is sealed under the zero edge key, its head the heir it names or
// thirty-two zero bytes for nobody.
const sealAsk = async (ephemeralSeed, payload, secret) =>
  askBox(fixed(ephemeralSeed), unhex(ward.pk.slice(64)), unhex(JSON.parse(payload).to ?? ZERO_EDGE_KEY), await signed(unhex(secret), utf8(payload)), ZERO_EDGE_KEY);

for (const v of all) {
  test(v.name, async () => {
    if (v.signPk !== undefined) {
      assert.deepEqual({ pk: ward.pk, signPk: ward.pk.slice(0, 64), padlockPk: ward.pk.slice(64) }, { pk: v.pk, signPk: v.signPk, padlockPk: v.padlockPk });
    } else if (v.secret !== undefined && v.pk !== undefined) {
      assert.equal(await beingPk(unhex(v.secret)), v.pk);
    } else if (v.digest !== undefined) {
      assert.equal(canonical(parseJson(v.blueprint)), v.canonical);
      assert.equal(await digest(parseJson(v.blueprint)), v.digest);
    } else if (v.body !== undefined) {
      // The order the kit writes a payload in is held in sender.test.js,
      // where its own bytes are read off the carrier.
      const plaintext = await signed(unhex(v.secret), unhex(v.body));
      assert.equal(hex(split(plaintext).signature), v.signature);
    } else if (v.ciphertext !== undefined) {
      const { ek, dk } = lockKeys(v.d + v.z);
      assert.equal(hex(ek), v.lock);
      const encapsulated = mlkem.encaps(ek, unhex(v.m));
      assert.deepEqual([hex(encapsulated.ciphertext), hex(encapsulated.shared)], [v.ciphertext, v.shared]);
      assert.equal(hex(mlkem.decaps(dk, unhex(v.ciphertext))), v.shared);
      assert.equal(await lockEdge(unhex(v.shared)), v.edge);
    } else if (v.invitation !== undefined) {
      // The ward mints it: its first draw is its lock, d then z, and the
      // second the heir secret.
      const harbor = new MemoryHarbor({ classes: { Host }, random: drawn(v.d + v.z, v.heirSecret) });
      const minted = await harbor.boot(unhex(v.wardSeed), emptyPartition());
      await minted.ask('boot', { key: 'host', class: 'Host' });
      assert.equal(JSON.stringify(await minted.ask('invite', { being: 'host', id: 'guest' })), v.invitation);
    } else if (v.ownSecret !== undefined) {
      // A knock: the ephemeral secret is drawn, then m, and the body is sealed
      // under the knock's edge key.
      const lock = all.find((a) => a.ciphertext);
      const payload = JSON.parse(v.payload);
      assert.equal(payload.by, await beingPk(unhex(v.heirSecret)));
      assert.equal(payload.next, await beingPk(unhex(v.ownSecret)));
      const head = unhex(payload.to);
      const sealed = await askBox(drawn(v.ephemeralSeed, v.m), unhex(ward.pk.slice(64)), head, await signed(unhex(v.heirSecret), utf8(v.payload)), null, unhex(lock.lock));
      assert.equal(hex(sealed.bytes), v.bytes);
      assert.equal(sealed.bytes.length, utf8(v.payload).length + 1248);
      assert.equal(sealed.edge, lock.edge);
      const knock = await openAsk(ward.seal, sealed.bytes, () => ({ lock: lock.d + lock.z }));
      assert.equal(knock.edge, lock.edge);
      const opened = split(knock.plaintext);
      assert.equal(await ed25519.verify(unhex(payload.by), opened.body, opened.signature), true);
    } else if (v.ephemeralSeed !== undefined) {
      const payload = v.to === '' ? signedBody.payload.replace(/"to":"[0-9a-f]+"/, '"to":null') : signedBody.payload;
      const sealed = await sealAsk(v.ephemeralSeed, payload, signedBody.secret);
      assert.equal(hex(sealed.bytes), v.bytes);
    } else if (v.replySeed !== undefined) {
      // A reply is signed by the ward and sealed to the lid of the ask it
      // answers: here the ephemeral key of the sealed asks above.
      const lid = await x25519.publicKey(unhex(all.find((a) => a.ephemeralSeed && !a.ownSecret).ephemeralSeed));
      const sealed = await box(lid, await signed(ward.sign, utf8(v.reply)), unhex(v.replySeed));
      assert.equal(hex(sealed.bytes), v.bytes);
    } else if (v.reads !== undefined) {
      const lidSecret = unhex(all.find((a) => a.ephemeralSeed && !a.ownSecret).ephemeralSeed);
      const lid = await x25519.publicKey(lidSecret);
      const read = async (text) => readReply(lidSecret, ward.pk, (await box(lid, await signed(ward.sign, utf8(text)), unhex(all.find((a) => a.replySeed).replySeed))).bytes);
      assert.notEqual(await read(v.reads), null, 'reads');
      assert.equal(await read(v.refuses), null, 'refuses');
    } else {
      assert.fail(`no check for ${v.name}`);
    }
  });
}
