import { refuse } from './refusal.js';
import { sha256 } from './arithmetic.js';

// The closed set. The law names it and says it is closed, so anything not
// here and not a record the blueprint itself declares does not exist.
// `being` is the one specialised `b32` — a pk and nothing more — so the two
// ride identically and differ only in what the blueprint says they mean.
export const SCALARS = new Set([
  'bool',
  'int',
  'text',
  'bytes',
  'b32',
  'being',
  'invitation',
  'card',
]);

// ASCII: a letter, then letters and digits. Unicode brings normalization, and
// two normalizations are two digests.
const IDENTIFIER = /^[A-Za-z][A-Za-z0-9]*$/;
const FIELD_LINE = /^([^ ()]+)\(([^()]*)\)(?: (.+))?$/;

function identifier(word, where) {
  if (word.length === 0) refuse('EMPTY_IDENTIFIER', where);
  if (!IDENTIFIER.test(word)) refuse('BAD_IDENTIFIER', `${JSON.stringify(word)} at ${where}`);
  return word;
}

// The two combinators compose freely, so a type is a tree: `[T]` for many,
// `T?` for possibly absent, a base name at the leaf.
function parseType(token, where) {
  if (token.endsWith('?')) return { optional: parseType(token.slice(0, -1), where) };
  if (token.startsWith('[')) {
    if (!token.endsWith(']')) refuse('MALFORMED_TYPE', `${token} at ${where}`);
    return { list: parseType(token.slice(1, -1), where) };
  }
  if (/[[\]?]/.test(token)) refuse('MALFORMED_TYPE', `${token} at ${where}`);
  return { base: identifier(token, where) };
}

export function printType(type) {
  if (type.optional) return `${printType(type.optional)}?`;
  if (type.list) return `[${printType(type.list)}]`;
  return type.base;
}

export function baseOf(type) {
  let node = type;
  while (!node.base) node = node.list ?? node.optional;
  return node.base;
}

function splitCanonicalLines(text) {
  if (text.length === 0) refuse('EMPTY_TEXT');
  if (text.charCodeAt(0) === 0xfeff) refuse('BYTE_ORDER_MARK');
  if (text.includes('\r')) refuse('CARRIAGE_RETURN');
  if (text.includes('\t')) refuse('TAB');
  if (!text.endsWith('\n')) refuse('NO_FINAL_NEWLINE');
  const lines = text.slice(0, -1).split('\n');
  for (const [index, line] of lines.entries()) {
    if (line.endsWith(' ')) refuse('TRAILING_SPACE', `line ${index + 1}`);
    if (line.includes('  ') && !line.startsWith('  ')) refuse('DOUBLE_SPACE', `line ${index + 1}`);
    if (line.startsWith('  ') && line.slice(2).includes('  '))
      refuse('DOUBLE_SPACE', `line ${index + 1}`);
    if (line.startsWith(' ') && !line.startsWith('  ')) refuse('BAD_INDENT', `line ${index + 1}`);
    if (line.startsWith('   ')) refuse('BAD_INDENT', `line ${index + 1}`);
    if (line.trimStart().startsWith('#')) refuse('COMMENT', `line ${index + 1}`);
  }
  return lines;
}

function splitBlocks(lines) {
  const blocks = [];
  let current = null;
  for (const [index, line] of lines.entries()) {
    const where = `line ${index + 1}`;
    if (line === '') {
      if (current === null) refuse('BLANK_LINE', where);
      if (current.body.length === 0) refuse('EMPTY_BLOCK', current.name);
      blocks.push(current);
      current = null;
      continue;
    }
    if (line.startsWith('  ')) {
      if (current === null) refuse('INDENT_WITHOUT_HEADER', where);
      current.body.push({ text: line.slice(2), where });
      continue;
    }
    if (current !== null) refuse('MISSING_BLANK_LINE', where);
    current = { name: identifier(line, where), body: [], where };
  }
  if (current === null) refuse('TRAILING_BLANK_LINE');
  if (current.body.length === 0) refuse('EMPTY_BLOCK', current.name);
  blocks.push(current);
  return blocks;
}

// Two arguments separate with a comma and one space, and with nothing else.
function parseArguments(inner, where) {
  if (inner === '') return [];
  if (/,(?! )| ,/.test(inner)) refuse('MALFORMED_ARGUMENT', where);
  return inner.split(', ').map((part) => {
    const words = part.split(' ');
    if (words.length !== 2) refuse('MALFORMED_ARGUMENT', where);
    return { name: identifier(words[0], where), type: parseType(words[1], where) };
  });
}

function parseClassBlock(block) {
  const fields = block.body.map(({ text, where }) => {
    const match = FIELD_LINE.exec(text);
    if (!match) refuse('MALFORMED_FIELD', where);
    const [, name, inner, answer] = match;
    if (answer !== undefined && answer.includes(' ')) refuse('MALFORMED_FIELD', where);
    return {
      name: identifier(name, where),
      args: parseArguments(inner, where),
      // A field may answer nothing: no answer type, and zero bytes on the wire.
      answer: answer === undefined ? null : parseType(answer, where),
    };
  });
  noRepeats(fields);
  return { name: block.name, fields };
}

function parseRecordBlock(block) {
  const fields = block.body.map(({ text, where }) => {
    if (text.includes('(') || text.includes(')')) refuse('MALFORMED_FIELD', where);
    const parts = text.split(' ');
    if (parts.length !== 2) refuse('MALFORMED_FIELD', where);
    return { name: identifier(parts[0], where), type: parseType(parts[1], where) };
  });
  noRepeats(fields);
  return { name: block.name, fields };
}

function noRepeats(fields) {
  const seen = new Set();
  for (const field of fields) {
    if (seen.has(field.name)) refuse('DUPLICATE_FIELD', field.name);
    seen.add(field.name);
  }
}

// The record blocks follow the class block in order of first use, depth-first
// through the fields, so the order is derived from the content and no author
// chooses it. This walk is what both the printer and the parser judge by.
function recordOrder(blueprint) {
  const records = new Map(blueprint.records.map((r) => [r.name, r]));
  // A block wearing the name of a closed type would give one name two
  // meanings, and the types are closed.
  if (SCALARS.has(blueprint.name)) refuse('CLOSED_TYPE_NAME', blueprint.name);
  for (const record of blueprint.records) {
    if (SCALARS.has(record.name)) refuse('CLOSED_TYPE_NAME', record.name);
  }
  if (records.has(blueprint.name)) refuse('DUPLICATE_BLOCK', blueprint.name);
  if (records.size !== blueprint.records.length) refuse('DUPLICATE_BLOCK');

  const order = [];
  const mark = new Map();
  const visit = (type, where) => {
    const base = baseOf(type);
    if (SCALARS.has(base)) return;
    if (!records.has(base)) refuse('UNKNOWN_TYPE', `${base} at ${where}`);
    const state = mark.get(base);
    if (state === 'open') refuse('RECORD_RECURSION', base);
    if (state === 'done') return;
    mark.set(base, 'open');
    order.push(base);
    for (const field of records.get(base).fields) visit(field.type, `${base}.${field.name}`);
    mark.set(base, 'done');
  };
  for (const field of blueprint.fields) {
    const where = `${blueprint.name}.${field.name}`;
    for (const arg of field.args) visit(arg.type, where);
    if (field.answer) visit(field.answer, where);
  }
  // A record nothing uses is refused: a block the walk never reached has no
  // place the order could put it.
  for (const record of blueprint.records) {
    if (!mark.has(record.name)) refuse('UNUSED_RECORD', record.name);
  }
  return order.map((name) => records.get(name));
}

export function parse(input) {
  const text =
    typeof input === 'string'
      ? input
      : // The mark is kept rather than stripped, because a mark stripped would be
        // a second way to write one text — so it reaches the refusal below.
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
  const blocks = splitBlocks(splitCanonicalLines(text));
  const blueprint = {
    ...parseClassBlock(blocks[0]),
    records: blocks.slice(1).map(parseRecordBlock),
  };
  const order = recordOrder(blueprint);
  for (const [index, record] of order.entries()) {
    if (blueprint.records[index].name !== record.name) refuse('RECORD_ORDER', record.name);
  }
  return blueprint;
}

export function print(blueprint) {
  const blocks = [];
  const fields = blueprint.fields.map((field) => {
    const args = field.args.map((a) => `${a.name} ${printType(a.type)}`).join(', ');
    const answer = field.answer ? ` ${printType(field.answer)}` : '';
    return `  ${field.name}(${args})${answer}\n`;
  });
  blocks.push(`${blueprint.name}\n${fields.join('')}`);
  for (const record of recordOrder(blueprint)) {
    const lines = record.fields.map((f) => `  ${f.name} ${printType(f.type)}\n`);
    blocks.push(`${record.name}\n${lines.join('')}`);
  }
  return blocks.join('\n');
}

export function canonicalBytes(input) {
  if (typeof input === 'string' || input instanceof Uint8Array) {
    const blueprint = parse(input);
    const text = print(blueprint);
    const given = typeof input === 'string' ? input : new TextDecoder('utf-8').decode(input);
    if (text !== given) refuse('NOT_CANONICAL');
    return new TextEncoder().encode(text);
  }
  return new TextEncoder().encode(print(input));
}

export function digest(input) {
  return sha256(canonicalBytes(input));
}
