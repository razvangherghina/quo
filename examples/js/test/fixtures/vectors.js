// Reads a vector file of the protocol, beside this example in the repository.
import { readFile } from 'node:fs/promises';

export const vectors = async (area) => JSON.parse(await readFile(new URL(`../../../../vectors/${area}.json`, import.meta.url), 'utf8')).vectors;
