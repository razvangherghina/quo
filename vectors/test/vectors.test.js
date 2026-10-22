// The vectors are data: this holds their shape. The verifier's tests replay each record against the
// algorithms (verifier/test/arithmetic.test.js).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const { vectors, corpus, encoding, area, note } = JSON.parse(read('arithmetic.json'));

test('The algorithms. The vector file is one object of records, each named, none twice', () => {
  assert.equal(vectors.length, 34);
  const names = vectors.map((v) => v.name);
  assert.equal(new Set(names).size, names.length, 'a name stands twice');
  for (const v of vectors) assert.equal(typeof v.name, 'string');
  for (const field of [corpus, encoding, area, note]) assert.equal(typeof field, 'string');
});

test('The algorithms. Every value a record carries as bytes is lowercase hex of an even length', () => {
  for (const v of vectors)
    for (const [key, value] of Object.entries(v))
      if (
        typeof value === 'string' &&
        /^(input|hash|ek|d|z|m|ciphertext|shared|ikm|info|out|key|nonce|additional|plaintext|secret|pk|message|signature)$/.test(
          key,
        )
      )
        assert.match(value, /^([0-9a-f]{2})*$/, `${v.name}: ${key}`);
});

test('The algorithms. The six algorithms each have a record that pins them', () => {
  const text = vectors.map((v) => v.name).join('\n');
  for (const algorithm of ['SHA-256', 'Ed25519', 'X25519', 'HKDF', 'AES-256-GCM', 'ML-KEM-768'])
    assert.match(text, new RegExp(algorithm), algorithm);
});

test('The ward key. The seam document names the six requests a kit answers', () => {
  const harness = read('HARNESS.md');
  for (const op of ['ward', 'invite', 'release', 'arrive', 'ask', 'read'])
    assert.ok(harness.includes(`op: "${op}"`), op);
});
