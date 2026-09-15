import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decrypt, ed25519, encrypt, hex, hkdf, mlkem, sha256, unhex, x25519 } from '../src/arithmetic.js';
import { vectors } from './fixtures/vectors.js';

// AES-256-GCM under a key and nonce as they stand. The kit draws both from
// HKDF and never takes them raw, so the published record goes to WebCrypto,
// which is the cipher the kit's own encrypt calls.
async function gcm(v) {
  const key = await crypto.subtle.importKey('raw', unhex(v.key), 'AES-GCM', false, ['encrypt', 'decrypt']);
  const params = { name: 'AES-GCM', iv: unhex(v.nonce), additionalData: unhex(v.additional) };
  assert.equal(hex(new Uint8Array(await crypto.subtle.encrypt(params, key, unhex(v.plaintext)))), v.ciphertext);
  assert.equal(hex(new Uint8Array(await crypto.subtle.decrypt(params, key, unhex(v.ciphertext)))), v.plaintext);
}

for (const v of await vectors('arithmetic')) {
  test(v.name, async () => {
    if (v.d !== undefined) {
      const { ek, dk } = mlkem.keygen(unhex(v.d + v.z));
      assert.equal(hex(ek), v.ek);
      const { ciphertext, shared } = mlkem.encaps(ek, new Uint8Array(32));
      assert.equal(hex(mlkem.decaps(dk, ciphertext)), hex(shared));
    } else if (v.m !== undefined) {
      const { ciphertext, shared } = mlkem.encaps(unhex(v.ek), unhex(v.m));
      assert.equal(hex(ciphertext), v.ciphertext);
      assert.equal(hex(shared), v.shared);
    } else if (v.hash !== undefined) {
      assert.equal(hex(await sha256(unhex(v.input))), v.hash);
    } else if (v.signature !== undefined) {
      if (v.secret) {
        assert.equal(hex(await ed25519.publicKey(unhex(v.secret))), v.pk);
        assert.equal(hex(await ed25519.sign(unhex(v.secret), unhex(v.message))), v.signature);
      }
      assert.equal(await ed25519.verify(unhex(v.pk), unhex(v.message), unhex(v.signature)), !v.refuses);
    } else if (v.ikm !== undefined) {
      assert.equal(v.salt, '');
      if (v.out !== undefined) {
        assert.equal(hex(await hkdf(unhex(v.ikm), unhex(v.info), v.out.length / 2)), v.out);
      } else {
        const out = await hkdf(unhex(v.ikm), unhex(v.info), 44);
        assert.equal(hex(out.subarray(0, 32)), v.key);
        assert.equal(hex(out.subarray(32)), v.nonce);
      }
    } else if (v.key !== undefined) {
      await gcm(v);
    } else if (v.ciphertext !== undefined) {
      const opened = await decrypt(unhex(v.shared), unhex(v.additional), unhex(v.ciphertext));
      if (v.refuses) return assert.equal(opened, null);
      assert.equal(hex(opened), v.plaintext);
      assert.equal(hex(await encrypt(unhex(v.shared), unhex(v.additional), unhex(v.plaintext))), v.ciphertext);
    } else if (v.shared !== undefined || v.refuses) {
      const got = await x25519.agree(unhex(v.secret), unhex(v.pk));
      assert.equal(got && hex(got), v.refuses ? null : v.shared);
    } else if (v.name.includes('Ed25519')) {
      assert.equal(hex(await ed25519.publicKey(unhex(v.secret))), v.pk);
    } else if (v.name.includes('X25519')) {
      assert.equal(hex(await x25519.publicKey(unhex(v.secret))), v.pk);
    } else {
      assert.fail(`no check for ${v.name}`);
    }
  });
}
