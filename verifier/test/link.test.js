// LINK.md, replayed: every record of vectors/link.json reads as it says.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { readLink } from '../link.js';
import { parseAddress } from '../address.js';

const { links } = JSON.parse(
  readFileSync(new URL('../../vectors/link.json', import.meta.url), 'utf8'),
);

test('Question 19. Every link of the vectors reads as its record says, and what is no link reads as none', () => {
  for (const { name, text, link } of links) assert.deepEqual(readLink(text), link, name);
  assert.ok(links.some(({ link }) => link === null));
  assert.ok(links.some(({ link }) => link !== null && link.at.length > 1));
});

test('Question 19. What is no text is no link, and a link is no invitation', () => {
  for (const given of [undefined, null, 7, {}, '', 'web+quo', 'web+quo:']) {
    assert.equal(readLink(given), null);
  }
  const read = readLink(links[1].text);
  assert.deepEqual(Object.keys(read), ['reference', 'ward', 'at']);
});

test('Question 19. A decoded value is read as an entry of an invitation’s at: one that is no URI with a scheme is skipped there', () => {
  const values = links.flatMap(({ link }) => link?.at ?? []);
  assert.ok(values.some((value) => parseAddress(value) !== null));
  assert.ok(values.some((value) => parseAddress(value) === null));
});
