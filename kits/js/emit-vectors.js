// Emits the pinned corpus under `vectors/`: for every closed type and every
// operation the law names, the input, the exact output bytes, and the section
// of the constitution that governs it. Fixed material, no randomness and no clock, so a
// regeneration is byte-identical. `node emit-vectors.js` writes the files;
// `bench/vectors.test.js` asserts that writing them again changes nothing.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SAY,
  WARDEN_BLUEPRINT,
  agree,
  box,
  concat,
  tagged,
  canonicalBytes,
  commitment,
  decode,
  decodeAnswer,
  decodePayload,
  derive,
  digest,
  encode,
  encodePayload,
  encrypt,
  parse,
  recordsOf,
  seal,
  sealingPair,
  sha256,
  sign,
  signingPair,
  unseal,
  verify,
} from './src/index.js';

const hex = (bytes) => Buffer.from(bytes).toString('hex');
const bin = (string) => new Uint8Array(Buffer.from(string, 'hex'));
const utf8 = (string) => new TextEncoder().encode(string);

// Fixed material, derived from labels so every byte in the corpus is
// reproducible from this file alone.
const seed = (label) => sha256(utf8(`quo-vectors/${label}`));

const wardenName = await signingPair(await seed('warden name'));
const wardenHeir = await signingPair(await seed('warden heir'));
const beingKey = await signingPair(await seed('being'));
const beingHeir = await signingPair(await seed('being heir'));
const voice = await signingPair(await seed('voice'));
const voiceHeir = await signingPair(await seed('voice heir'));
const nextHeir = await signingPair(await seed('voice heir after'));
const padlock = await sealingPair(await seed('padlock'));
const returnPadlock = await sealingPair(await seed('return padlock'));
const ephemeral = await seed('ephemeral');
const successor = await signingPair(await seed('successor'));
const ephemeralPair = await sealingPair(ephemeral);

const material = {
  wardenName: hex(wardenName.pk),
  wardenNameSecret: hex(wardenName.secret),
  wardenHeir: hex(wardenHeir.pk),
  wardenCommitment: hex(await commitment(wardenName.pk, wardenHeir.pk)),
  being: hex(beingKey.pk),
  beingCommitment: hex(await commitment(wardenName.pk, beingHeir.pk)),
  voice: hex(voice.pk),
  voiceSecret: hex(voice.secret),
  voiceHeir: hex(voiceHeir.pk),
  voiceHeirSecret: hex(voiceHeir.secret),
  voiceHeirCommitment: hex(await commitment(wardenName.pk, voiceHeir.pk)),
  nextHeirCommitment: hex(await commitment(wardenName.pk, nextHeir.pk)),
  padlock: hex(padlock.pk),
  padlockSecret: hex(padlock.secret),
  returnPadlock: hex(returnPadlock.pk),
  returnPadlockSecret: hex(returnPadlock.secret),
  ephemeralSecret: hex(ephemeral),
  ephemeral: hex(ephemeralPair.pk),
  successor: hex(successor.pk),
  successorSecret: hex(successor.secret),
};

// A wire vector carries a blueprint whose class has exactly one field; the
// type under test is that field's answer type. So a reader needs the notation
// parser it already has and no second grammar for type expressions.
const probe = (type, ...records) =>
  [`Probe\n  probe() ${type}\n`, ...records.map((record) => `${record}\n`)].join('\n');

function typeOf(blueprint) {
  const parsed = parse(blueprint);
  return { type: parsed.fields[0].answer, records: recordsOf(parsed) };
}

// The JSON shape of a value, one rule per type: bool is a boolean, int is a
// decimal string, text is a string, bytes and the thirty-two-byte types are
// hex, a list is an array, an absent optional is null, a record is an object
// keyed by the names the blueprint declares.
function fromJson(type, value, records) {
  if (type.optional) return value === null ? null : fromJson(type.optional, value, records);
  if (type.list) return value.map((item) => fromJson(type.list, item, records));
  switch (type.base) {
    case 'bool':
      return value;
    case 'int':
      return BigInt(value);
    case 'text':
      return value;
    case 'bytes':
    case 'b32':
    case 'being':
      return bin(value);
    case 'invitation':
      return {
        warden: bin(value.warden),
        commitment: bin(value.commitment),
        padlock: bin(value.padlock),
        heirPublic: bin(value.heir),
        heirSecret: bin(value.heirSecret),
        hints: value.hints,
      };
    case 'card':
      return {
        warden: bin(value.warden),
        commitment: bin(value.commitment),
        padlock: bin(value.padlock),
        hints: value.hints,
      };
    default: {
      const record = records.get(type.base);
      const out = {};
      for (const field of record.fields) {
        out[field.name] = fromJson(field.type, value[field.name], records);
      }
      return out;
    }
  }
}

function refused(work) {
  try {
    work();
    return false;
  } catch {
    return true;
  }
}

// The same question of an operation that is asynchronous, which every one
// touching the arithmetic now is.
async function refusedAsync(work) {
  try {
    await work();
    return false;
  } catch {
    return true;
  }
}

function must(condition, what) {
  if (!condition) throw new Error(`the emitter disagrees with the kit: ${what}`);
}

// ---------------------------------------------------------------- notation

const TODO = `ToDo
  add(title text) item
  complete(id text) bool
  items() [item]
  members() [being]

item
  id text
  title text
  done bool
`;

const ORDER = `Order
  first() outer
  second() other

outer
  inner inner

inner
  count int

other
  flag bool
`;

const CLOSED = `Closed
  yes() bool
  count() int
  label() text
  blob() bytes
  hash() b32
  who() being
  way() invitation
  door() card
  many() [text]
  maybe() int?
  nested() [[bool]]
  both() [text?]
  listMaybe() [int]?
  quiet(one text, two int)
`;

const notationAccepts = [
  ['the blueprint the notation section writes', TODO],
  ['a class whose one field answers a bool', 'Small\n  yes() bool\n'],
  ['a field that answers nothing', 'Quiet\n  tell(word text)\n'],
  ['every closed type and both combinators', CLOSED],
  ['record blocks in order of first use, depth-first', ORDER],
  ['the blueprint every warden holds', WARDEN_BLUEPRINT],
];

const notationRefuses = [
  [
    'a record block out of the derived order',
    'Order\n  first() a\n  second() b\n\nb\n  x int\n\na\n  y int\n',
  ],
  ['a record nothing uses', 'Order\n  first() bool\n\nspare\n  x int\n'],
  ['a record that reaches itself', 'Order\n  first() a\n\na\n  self a\n'],
  ['a record that reaches itself through another', 'Order\n  first() a\n\na\n  b b\n\nb\n  a a\n'],
  ['a type no block declares', 'Order\n  first() nothere\n'],
  ['an empty class block', 'Order\n'],
  ['an empty record block', 'Order\n  first() a\n\na\n'],
  ['a byte order mark', '﻿Small\n  yes() bool\n'],
  ['a carriage return', 'Small\r\n  yes() bool\r\n'],
  ['a tab in place of the indent', 'Small\n\tyes() bool\n'],
  ['no final newline', 'Small\n  yes() bool'],
  ['a trailing space', 'Small\n  yes() bool \n'],
  ['a comment', 'Small\n  # nothing\n  yes() bool\n'],
  ['two blank lines between blocks', 'Order\n  first() a\n\n\na\n  x int\n'],
  ['a trailing blank line', 'Small\n  yes() bool\n\n'],
  ['four spaces of indent', 'Small\n    yes() bool\n'],
  ['three spaces of indent', 'Small\n   yes() bool\n'],
  ['a class field written without parentheses', 'Small\n  yes bool\n'],
  ['a record field written with parentheses', 'Order\n  first() a\n\na\n  x() int\n'],
  ['two arguments separated by a comma alone', 'Small\n  pair(one text,two int) bool\n'],
  ['two arguments separated by a space alone', 'Small\n  pair(one text two int) bool\n'],
  ['an identifier that is not ASCII', 'Småll\n  yes() bool\n'],
  ['an identifier that starts with a digit', '1Small\n  yes() bool\n'],
  ['an identifier that carries an underscore', 'Small\n  is_yes() bool\n'],
  ['two spaces between tokens', 'Small\n  yes()  bool\n'],
  ['a field named twice in one class', 'Small\n  yes() bool\n  yes() int\n'],
  ['a field named twice in one record', 'Order\n  first() a\n\na\n  x int\n  x bool\n'],
  ['the class block used as a type', 'Small\n  first() Small\n'],
  ["a class wearing a closed type's name", 'text\n  yes() bool\n'],
];

const notation = (
  await Promise.all(
    notationAccepts.map(async ([name, text]) => ({
      name,
      law: 'The notation',
      blueprint: text,
      canonical: hex(canonicalBytes(text)),
      digest: hex(await digest(text)),
    })),
  )
).concat(
  notationRefuses.map(([name, text]) => {
    must(
      refused(() => canonicalBytes(text)),
      `notation should refuse: ${name}`,
    );
    return {
      name,
      law: 'The notation',
      blueprint: text,
      refuses: true,
    };
  }),
);

// -------------------------------------------------------------------- wire

const KEY_HEX = material.being;
const OTHER_KEY_HEX = material.voice;

const ITEM = probe('[item]', 'item\n  id text\n  title text\n  done bool');
const NESTED = probe(
  'outer',
  'outer\n  inner inner\n  tail [int]',
  'inner\n  count int\n  label text',
);

const wireAccepts = [
  ['bool true', 'bool', true],
  ['bool false', 'bool', false],
  ['int zero', 'int', '0'],
  ['int one', 'int', '1'],
  ['int minus one', 'int', '-1'],
  ['int at the top of its range', 'int', '9223372036854775807'],
  ['int at the bottom of its range', 'int', '-9223372036854775808'],
  ['text empty', 'text', ''],
  ['text ASCII', 'text', 'hello'],
  ['text beyond ASCII', 'text', 'héllo 世界'],
  ['text outside the basic plane', 'text', '\u{1f513}'],
  // A text is carried as given and never normalised, so a byte order mark is
  // three bytes of the value like any other. A decoder that swallows it hands
  // back a second spelling of the same text.
  ['text carrying a byte order mark', 'text', '﻿hello'],
  ['bytes empty', 'bytes', ''],
  ['bytes one', 'bytes', '00'],
  ['bytes five', 'bytes', '0001027fff'],
  ['b32', 'b32', KEY_HEX],
  ['being', 'being', KEY_HEX],
  [
    'invitation with no hints',
    'invitation',
    {
      warden: material.wardenName,
      commitment: material.wardenCommitment,
      padlock: material.padlock,
      heir: material.voiceHeir,
      heirSecret: material.voiceHeirSecret,
      hints: [],
    },
  ],
  [
    'invitation with two hints',
    'invitation',
    {
      warden: material.wardenName,
      commitment: material.wardenCommitment,
      padlock: material.padlock,
      heir: material.voiceHeir,
      heirSecret: material.voiceHeirSecret,
      hints: ['https://one.example/quo', 'https://two.example/quo'],
    },
  ],
  [
    'card with no hints',
    'card',
    {
      warden: material.wardenName,
      commitment: material.wardenCommitment,
      padlock: material.padlock,
      hints: [],
    },
  ],
  [
    'card with two hints',
    'card',
    {
      warden: material.wardenName,
      commitment: material.wardenCommitment,
      padlock: material.padlock,
      hints: ['https://one.example/quo', 'https://two.example/quo'],
    },
  ],
  ['a list with nothing in it', '[int]', []],
  ['a list of int', '[int]', ['1', '2', '-3']],
  ['a list of text', '[text]', ['one', '', 'three']],
  ['a list of being', '[being]', [KEY_HEX, OTHER_KEY_HEX]],
  ['an optional that is present', 'int?', '7'],
  ['an optional that is absent', 'int?', null],
  ['an optional text that is present', 'text?', ''],
  ['an optional text that is absent', 'text?', null],
  ['a list of optionals', '[text?]', ['one', null, 'three']],
  ['an optional list that is present', '[int]?', ['1']],
  ['an optional list that is absent', '[int]?', null],
  ['a list of lists', '[[bool]]', [[true, false], []]],
  ['an optional optional that is present', 'int??', '1'],
];

const wire = wireAccepts
  .map(([name, type, value]) => {
    const blueprint = probe(type);
    const { type: parsed, records } = typeOf(blueprint);
    const bytes = encode(parsed, fromJson(parsed, value, records), records);
    // The other direction too: what the corpus pins is read back and written
    // again. A decoder that alters the value on the way in — swallowing a byte
    // order mark, say — is caught here rather than by a later kit.
    must(
      hex(encode(parsed, decode(parsed, bytes, records), records)) === hex(bytes),
      `wire does not round-trip: ${name}`,
    );
    return {
      name,
      law: 'The wire encoding of the types',
      blueprint,
      value,
      bytes: hex(bytes),
    };
  })
  .concat(
    [
      [
        'a record is its fields in the order the blueprint declares them',
        ITEM,
        [
          { id: 'a', title: 'first', done: false },
          { id: 'b', title: '', done: true },
        ],
      ],
      [
        'a record inside a record',
        NESTED,
        { inner: { count: '3', label: 'deep' }, tail: ['1', '2'] },
      ],
      [
        'the estate a describe answers',
        probe(
          'estate',
          'estate\n  classes [class]',
          'class\n  digest b32\n  beings [held]',
          'held\n  being being\n  commitment b32',
        ),
        {
          classes: [
            {
              digest: material.wardenCommitment,
              beings: [{ being: material.being, commitment: material.beingCommitment }],
            },
          ],
        },
      ],
      [
        'the sketch of one being',
        probe('sketch', 'sketch\n  being being\n  digest b32\n  commitment b32'),
        {
          being: material.being,
          digest: material.wardenCommitment,
          commitment: material.beingCommitment,
        },
      ],
      [
        'the word a succession carries',
        probe(
          'word',
          'word\n  being being?\n  successor b32?\n  commitment b32?\n  name b32?\n  padlock b32?\n  hints [text]',
        ),
        {
          being: material.being,
          successor: material.successor,
          commitment: material.nextHeirCommitment,
          name: material.wardenName,
          padlock: material.padlock,
          hints: ['https://new.example/quo'],
        },
      ],
      [
        'the word a padlock replacement carries',
        probe(
          'word',
          'word\n  being being?\n  successor b32?\n  commitment b32?\n  name b32?\n  padlock b32?\n  hints [text]',
        ),
        {
          being: null,
          successor: null,
          commitment: null,
          name: null,
          padlock: material.returnPadlock,
          hints: [],
        },
      ],
      [
        'the cargo a migration carries',
        probe(
          'cargo',
          'cargo\n  being being\n  digest b32\n  cells bytes\n  standings [standing]\n  relations [relation]',
          'standing\n  voice b32\n  commitment b32\n  beings [being]\n  mark int\n  spent [int]\n  padlock b32?\n  hints [text]',
          'relation\n  warden being\n  commitment b32\n  padlock b32\n  voice b32\n  secret b32\n  heir b32\n  heirSecret b32\n  seq int\n  hints [text]',
        ),
        {
          being: material.being,
          digest: material.wardenCommitment,
          cells: '0102030405',
          standings: [
            {
              voice: material.voice,
              commitment: material.voiceHeirCommitment,
              beings: [material.being],
              mark: '4',
              // The window travels whole: the numbers below the mark already
              // honoured, ascending, gaps and all.
              spent: ['1', '3'],
              padlock: material.returnPadlock,
              hints: ['https://caller.example/quo'],
            },
            {
              voice: material.successor,
              commitment: material.nextHeirCommitment,
              beings: [],
              mark: '0',
              spent: [],
              padlock: null,
              hints: [],
            },
          ],
          relations: [
            {
              warden: material.wardenName,
              commitment: material.wardenCommitment,
              padlock: material.padlock,
              voice: material.voice,
              secret: material.voiceSecret,
              heir: material.voiceHeir,
              heirSecret: material.voiceHeirSecret,
              seq: '7',
              hints: ['https://far.example/quo'],
            },
          ],
        },
      ],
    ].map(([name, blueprint, value]) => {
      const { type, records } = typeOf(blueprint);
      return {
        name,
        law: 'The warden is a being, and here is its blueprint',
        blueprint,
        value,
        bytes: hex(encode(type, fromJson(type, value, records), records)),
      };
    }),
  )
  .concat(
    [
      ['a length that is negative', 'text', 'ffffffffffffffff'],
      ['a length beyond the bytes that remain', 'text', '000000000000000f6869'],
      ['a count beyond the bytes that remain', '[int]', '00000000000000ff'],
      ['bytes left over after the value', 'bool', '0100'],
      ['bytes short of the value', 'b32', '00112233'],
      ['no bytes at all where a value is due', 'int', ''],
      ['a bool that is neither zero nor one', 'bool', '02'],
      ['an optional whose marker is neither present nor absent', 'int?', '020000000000000001'],
      ['text that is not UTF-8', 'text', '0000000000000002c328'],
      ['a truncated invitation', 'invitation', `${material.wardenName}${material.padlock}`],
      ['a truncated card', 'card', `${material.wardenName}${material.padlock}`],
      [
        'a card carrying the voice an invitation would',
        'card',
        `${material.wardenName}${material.wardenCommitment}${material.padlock}0000000000000000${material.voiceHeir}`,
      ],
    ].map(([name, type, bytes]) => {
      const blueprint = probe(type);
      const { type: parsed, records } = typeOf(blueprint);
      must(
        refused(() => decode(parsed, bin(bytes), records)),
        `wire should refuse: ${name}`,
      );
      return { name, law: 'The wire encoding of the types', blueprint, bytes, refuses: true };
    }),
  );

// ------------------------------------------------------------- arithmetic

const shared = await agree(ephemeral, padlock.pk);
const derived = await derive(shared);
const plaintext = utf8('by whose authority');
const ciphertext = await encrypt(shared, plaintext, ephemeralPair.pk);

// The one named refusal that stands in front of the platform's verifier: a
// public key that is all zeros or of small order is silence, no signature
// examined. Two kits could otherwise disagree about a key that verifies
// anything, because platform verifiers differ exactly here.
const ALL_ZERO_KEY = '0'.repeat(64);
const SMALL_ORDER_KEY = '26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05';
const boundaryMessage = utf8('by whose authority');
const boundarySignature = await sign(boundaryMessage, voice.secret);

const arithmetic = [
  {
    name: 'SHA-256 of nothing',
    law: 'The arithmetic',
    input: '',
    hash: hex(await sha256(new Uint8Array(0))),
  },
  {
    name: 'SHA-256 of three bytes',
    law: 'The arithmetic',
    input: hex(utf8('abc')),
    hash: hex(await sha256(utf8('abc'))),
  },
  {
    name: 'the heir commitment is the warden pk then the heir pk, hashed',
    law: 'The arithmetic',
    warden: material.wardenName,
    heir: material.voiceHeir,
    commitment: material.voiceHeirCommitment,
  },
  {
    name: "a warden's own commitment hashes its name under itself",
    law: 'The arithmetic',
    warden: material.wardenName,
    heir: material.wardenHeir,
    commitment: material.wardenCommitment,
  },
  {
    name: 'an Ed25519 pair from a fixed secret',
    law: 'The arithmetic',
    secret: material.voiceSecret,
    pk: material.voice,
  },
  {
    name: 'an X25519 pair from a fixed secret',
    law: 'The arithmetic',
    secret: material.padlockSecret,
    pk: material.padlock,
  },
  {
    name: 'a signature over nothing',
    law: 'The arithmetic',
    secret: material.voiceSecret,
    voice: material.voice,
    message: '',
    signature: hex(await sign(new Uint8Array(0), voice.secret)),
  },
  {
    name: 'a signature over a message',
    law: 'The arithmetic',
    secret: material.voiceSecret,
    voice: material.voice,
    message: hex(utf8('by whose authority')),
    signature: hex(await sign(utf8('by whose authority'), voice.secret)),
  },
  {
    name: 'a signature under the wrong voice does not verify',
    law: 'The arithmetic',
    voice: material.successor,
    message: hex(utf8('by whose authority')),
    signature: hex(await sign(utf8('by whose authority'), voice.secret)),
    refuses: true,
  },
  {
    name: 'a signature over other bytes does not verify',
    law: 'The arithmetic',
    voice: material.voice,
    message: hex(utf8('by whose authority ')),
    signature: hex(await sign(utf8('by whose authority'), voice.secret)),
    refuses: true,
  },
  {
    name: 'a signature under an all-zero public key is silence',
    law: 'The arithmetic',
    voice: ALL_ZERO_KEY,
    message: hex(boundaryMessage),
    signature: hex(boundarySignature),
    refuses: true,
  },
  {
    name: 'a signature under a small-order public key is silence',
    law: 'The arithmetic',
    voice: SMALL_ORDER_KEY,
    message: hex(boundaryMessage),
    signature: hex(boundarySignature),
    refuses: true,
  },
  {
    name: 'an X25519 agreement',
    law: 'The arithmetic',
    secret: material.ephemeralSecret,
    pk: material.padlock,
    shared: hex(shared),
  },
  {
    name: 'the agreement is the same from either side',
    law: 'The arithmetic',
    secret: material.padlockSecret,
    pk: material.ephemeral,
    shared: hex(await agree(padlock.secret, ephemeralPair.pk)),
  },
  {
    name: 'forty-four bytes drawn under the fixed info, key then nonce',
    law: 'The arithmetic',
    info: hex(utf8('quo-seal')),
    salt: '',
    shared: hex(shared),
    key: hex(derived.key),
    nonce: hex(derived.nonce),
  },
  {
    name: 'AES-256-GCM with the ephemeral pk as the additional data',
    law: 'The arithmetic',
    shared: hex(shared),
    additional: material.ephemeral,
    plaintext: hex(plaintext),
    ciphertext: hex(ciphertext),
  },
  {
    name: 'a ciphertext with one byte turned does not open',
    law: 'The arithmetic',
    shared: hex(shared),
    additional: material.ephemeral,
    ciphertext: hex(turn(ciphertext, 0)),
    refuses: true,
  },
  {
    name: 'a ciphertext under other additional data does not open',
    law: 'The arithmetic',
    shared: hex(shared),
    additional: material.padlock,
    ciphertext: hex(ciphertext),
    refuses: true,
  },
];

// Every signature vector the corpus refuses, asserted against this kit here:
// the emitter writes no refusal it does not itself refuse.
for (const vector of arithmetic) {
  if (!vector.refuses || !vector.signature || !vector.voice) continue;
  must(
    !(await verify(bin(vector.message), bin(vector.signature), bin(vector.voice))),
    `verification should refuse: ${vector.name}`,
  );
}

function turn(bytes, at) {
  const out = new Uint8Array(bytes);
  out[at] ^= 1;
  return out;
}

// --------------------------------------------------------------- envelope

const PAYLOAD_PROBE = probe(
  'say',
  'say\n  voice b32\n  recipient b32\n  commitment b32?\n  seq int\n  padlock b32\n  hints [text]\n  allowance allowance\n  being being?\n  method method?',
  'allowance\n  time int\n  hops int',
  'method\n  name text\n  args bytes',
);
const ANSWER_PROBE = probe('answer', 'answer\n  warden being\n  seq int\n  data bytes?');

const askPayload = {
  voice: material.voice,
  recipient: material.wardenName,
  commitment: null,
  seq: '1',
  padlock: material.returnPadlock,
  hints: ['https://caller.example/quo'],
  allowance: { time: '30000', hops: '8' },
  being: material.being,
  method: { name: 'complete', args: hex(encodeText('item-1')) },
};

const describePayload = {
  voice: material.voice,
  recipient: material.padlock,
  commitment: null,
  seq: '1',
  padlock: material.returnPadlock,
  hints: [],
  allowance: { time: '30000', hops: '8' },
  being: null,
  method: null,
};

const rotationPayload = {
  voice: material.voiceHeir,
  recipient: material.wardenName,
  commitment: material.nextHeirCommitment,
  seq: '1',
  padlock: material.returnPadlock,
  hints: ['https://caller.example/quo'],
  allowance: { time: '30000', hops: '8' },
  being: null,
  method: null,
};

const emptyMethodPayload = {
  ...askPayload,
  seq: '2',
  method: { name: 'items', args: '' },
};

function encodeText(value) {
  const blueprint = probe('text');
  const { type, records } = typeOf(blueprint);
  return encode(type, value, records);
}

function payloadBytes(json) {
  const { type, records } = typeOf(PAYLOAD_PROBE);
  const value = fromJson(type, json, records);
  const bytes = encode(type, value, records);
  must(hex(encodePayload(value)) === hex(bytes), 'the payload probe and the kit disagree');
  must(hex(encodePayload(decodePayload(bytes))) === hex(bytes), 'the payload does not round-trip');
  return bytes;
}

async function sealed(json, secret, random, opens = true) {
  const bytes = await seal({
    payload: fromJson(typeOf(PAYLOAD_PROBE).type, json, typeOf(PAYLOAD_PROBE).records),
    padlock: padlock.pk,
    voiceSecret: secret,
    random,
  });
  must(
    opens ===
      !(await refusedAsync(() => unseal({ envelope: bytes, padlockSecret: padlock.secret }))),
    'the seal does not judge as expected',
  );
  return bytes;
}

const askBytes = payloadBytes(askPayload);
const sealedAsk = await sealed(askPayload, voice.secret, ephemeral);

// What is signed is the record byte and the record together. A door reads that
// byte before it decodes anything, so these three are the whole of what an
// envelope carrying the wrong one meets.
const signedAsk = tagged(SAY, askBytes);

// A payload crafted to decode as both records — the ambiguity the byte kills.
// Read as a `say` it is the ask below; read as an `answer` its first
// thirty-two bytes are the warden, the next eight the seq, and the recipient's
// own bytes make the data present and exactly as long as what remains. Nothing
// but the byte separates them.
function ambiguous() {
  const recipient = new Uint8Array(32).fill(3);
  // The data's presence byte, then its length: the say is 131 bytes, and the
  // answer's data begins at 49.
  recipient[8] = 1;
  new DataView(recipient.buffer).setBigInt64(9, BigInt(131 - 49), false);
  const json = {
    voice: material.voice,
    recipient: hex(recipient),
    commitment: null,
    seq: '1',
    padlock: material.returnPadlock,
    hints: [],
    allowance: { time: '30000', hops: '8' },
    being: null,
    method: null,
  };
  const bytes = payloadBytes(json);
  must(bytes.length === 131, 'the crafted payload is not the length it was crafted for');
  must(decodeAnswer(bytes) !== null, 'the crafted payload does not decode as an answer too');
  return { json, bytes };
}

// Sealing arbitrary bytes as the inside of an envelope, which is the only way
// to write a payload the kit itself would never write.
async function sealedInside(inside, secret, random) {
  return box(concat([inside, await sign(inside, secret)]), padlock.pk, random);
}

const ambiguousPayload = ambiguous();

const answerValues = [
  ['an answer carrying data', { warden: material.wardenName, seq: '1', data: hex(utf8('yes')) }],
  [
    'an answer to a field that answers nothing',
    { warden: material.wardenName, seq: '2', data: null },
  ],
];

const envelope = [
  {
    name: 'a payload naming a being and a method',
    law: 'The envelope',
    blueprint: PAYLOAD_PROBE,
    value: askPayload,
    bytes: hex(askBytes),
  },
  {
    name: 'a payload naming neither, addressed by padlock',
    law: 'The envelope',
    blueprint: PAYLOAD_PROBE,
    value: describePayload,
    bytes: hex(payloadBytes(describePayload)),
  },
  {
    name: 'a payload spending an heir, carrying the next commitment',
    law: 'The envelope',
    blueprint: PAYLOAD_PROBE,
    value: rotationPayload,
    bytes: hex(payloadBytes(rotationPayload)),
  },
  {
    name: 'a payload whose method takes nothing carries an empty blob',
    law: 'The envelope',
    blueprint: PAYLOAD_PROBE,
    value: emptyMethodPayload,
    bytes: hex(payloadBytes(emptyMethodPayload)),
  },
  {
    name: 'the signature is the last sixty-four bytes inside the seal',
    law: 'The envelope',
    payload: hex(signedAsk),
    voice: material.voice,
    secret: material.voiceSecret,
    signature: hex(await sign(signedAsk, voice.secret)),
  },
  {
    name: 'the whole envelope: ephemeral pk, then one ciphertext',
    law: 'The envelope',
    value: askPayload,
    padlock: material.padlock,
    padlockSecret: material.padlockSecret,
    voiceSecret: material.voiceSecret,
    ephemeralSecret: material.ephemeralSecret,
    envelope: hex(sealedAsk),
  },
  {
    name: 'an envelope with no room for a ciphertext',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: material.ephemeral,
    refuses: true,
  },
  {
    name: 'an envelope with one byte of the ciphertext turned',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: hex(turn(sealedAsk, 32)),
    refuses: true,
  },
  {
    name: 'an envelope with one byte of the ephemeral pk turned',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: hex(turn(sealedAsk, 0)),
    refuses: true,
  },
  {
    name: 'an envelope opened with another secret',
    law: 'The envelope',
    padlockSecret: material.returnPadlockSecret,
    envelope: hex(sealedAsk),
    refuses: true,
  },
  {
    name: 'an envelope whose payload another voice signed',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: hex(await sealed(askPayload, successor.secret, ephemeral, false)),
    refuses: true,
  },
  {
    name: 'a say presented under the answer byte',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: hex(await sealedInside(tagged(1, askBytes), voice.secret, ephemeral)),
    refuses: true,
  },
  {
    name: 'a payload under a byte that names no record',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: hex(await sealedInside(tagged(2, askBytes), voice.secret, ephemeral)),
    refuses: true,
  },
  {
    name: 'a payload with no byte in front of it at all',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: hex(await sealedInside(askBytes, voice.secret, ephemeral)),
    refuses: true,
  },
  {
    name: 'a payload that decodes as both records, under the answer byte',
    law: 'The envelope',
    padlockSecret: material.padlockSecret,
    envelope: hex(await sealedInside(tagged(1, ambiguousPayload.bytes), voice.secret, ephemeral)),
    refuses: true,
  },
  {
    name: 'a payload that decodes as both records, under the say byte',
    law: 'The envelope',
    value: ambiguousPayload.json,
    padlock: material.padlock,
    padlockSecret: material.padlockSecret,
    voiceSecret: material.voiceSecret,
    ephemeralSecret: material.ephemeralSecret,
    envelope: hex(await sealed(ambiguousPayload.json, voice.secret, ephemeral)),
  },
].concat(
  answerValues.map(([name, value]) => {
    const { type, records } = typeOf(ANSWER_PROBE);
    const bytes = encode(type, fromJson(type, value, records), records);
    must(decodeAnswer(bytes) !== null, 'the answer does not decode');
    return { name, law: 'The envelope', blueprint: ANSWER_PROBE, value, bytes: hex(bytes) };
  }),
);

// ----------------------------------------------------------------- warden

// The order is derived, never chosen: classes by their digest bytes
// ascending, beings under each by their pk bytes ascending.
function ascending(a, b) {
  for (let at = 0; at < Math.min(a.length, b.length); at += 1) {
    if (a[at] !== b[at]) return a[at] - b[at];
  }
  return a.length - b.length;
}

const classes = [await digest(TODO), await digest(CLOSED), await digest(WARDEN_BLUEPRINT)];
const beings = [beingKey.pk, successor.pk, voice.pk];
const unordered = await Promise.all(
  classes.map(async (d, index) => ({
    digest: hex(d),
    beings: await Promise.all(
      beings
        .slice()
        .reverse()
        .slice(index)
        .map(async (pk) => ({
          being: hex(pk),
          commitment: hex(await commitment(wardenName.pk, pk)),
        })),
    ),
  })),
);
const ordered = unordered
  .slice()
  .sort((a, b) => ascending(bin(a.digest), bin(b.digest)))
  .map((entry) => ({
    digest: entry.digest,
    beings: entry.beings.slice().sort((a, b) => ascending(bin(a.being), bin(b.being))),
  }));

const ESTATE_PROBE = probe(
  'estate',
  'estate\n  classes [class]',
  'class\n  digest b32\n  beings [held]',
  'held\n  being being\n  commitment b32',
);

const warden = [
  {
    name: 'the blueprint every warden holds, and its digest',
    law: 'The warden is a being, and here is its blueprint',
    blueprint: WARDEN_BLUEPRINT,
    canonical: hex(canonicalBytes(WARDEN_BLUEPRINT)),
    digest: hex(await digest(WARDEN_BLUEPRINT)),
  },
  {
    name: 'an estate ordered by digest bytes ascending, pks ascending under each',
    law: 'The describe',
    blueprint: ESTATE_PROBE,
    unordered: { classes: unordered },
    value: { classes: ordered },
    bytes: hex(
      (() => {
        const { type, records } = typeOf(ESTATE_PROBE);
        return encode(type, fromJson(type, { classes: ordered }, records), records);
      })(),
    ),
  },
];

// ------------------------------------------------------------------ write

// A vector the constitution does not compel to these exact bytes. It is
// emitted anyway, because the two kits still have to meet somewhere, but a
// disagreement here is a question for the constitution rather than a defect
// in either kit.
// Empty, and kept empty rather than deleted: every silence this corpus
// exposed has since been ruled into the constitution, and the slices still to
// come will expose more.
const UNPINNED = new Set([]);

const marked = new Set();

function mark(vectors) {
  return vectors.map((vector) => {
    if (!UNPINNED.has(vector.name)) return vector;
    marked.add(vector.name);
    return { ...vector, unpinned: true };
  });
}

const README = `# The pinned corpus

Bytes a Quo kit must reproduce. Every vector states its input, the exact
output, and the section of the constitution that governs it. Nothing here is
randomised, timed or environment-dependent, so a second kit either produces
these bytes or disagrees with the law.

## How to read a file

Each file is one JSON object: \`area\`, \`encoding\` — always \`hex\` — and
\`vectors\`, a list. \`material.json\` carries no vectors; it holds the fixed
keys every other file refers to.

Every vector carries a \`name\` and a \`law\`, which is the heading of the
constitution's section that rules it.

- **\`refuses: true\`** — the input is invalid and the operation must refuse
  it. A refusal is asserted as strictly as an acceptance.
- **\`unpinned: true\`** — the constitution does not compel these exact bytes.
  The vector is here so two kits meet somewhere, but a disagreement is a
  question for the constitution rather than a defect in either kit.

## How a value is written

A vector under test names a \`blueprint\`: a class with exactly one field. The
type under test is that field's answer type, so reading a vector needs the
notation parser and no second grammar.

The \`value\` is the same value the \`bytes\` encode, written in JSON by one
rule per type.

| Type | JSON |
| --- | --- |
| \`bool\` | a boolean |
| \`int\` | a decimal string, so no precision is lost |
| \`text\` | a string |
| \`bytes\`, \`b32\`, \`being\` | lowercase hex |
| \`invitation\` | an object: \`warden\`, \`commitment\`, \`padlock\`, \`heir\`, \`heirSecret\`, \`hints\` |
| \`card\` | an object: \`warden\`, \`commitment\`, \`padlock\`, \`hints\` |
| \`[T]\` | an array |
| \`T?\` | \`null\` when absent, the value when present |
| a record | an object keyed by the names the blueprint declares |

## The areas

- **\`notation.json\`** — a blueprint's canonical text and its digest, and the
  texts that are refused.
- **\`wire.json\`** — the encoding of every closed type, both combinators,
  records, and the bytes a decoder must refuse.
- **\`arithmetic.json\`** — the four algorithms: the hash, the heir
  commitment, the two kinds of pair, signing, agreement, the derivation and
  the seal.
- **\`envelope.json\`** — the signed payload, the answer, and the whole sealed
  message.
- **\`warden.json\`** — the blueprint every warden holds, and the derived
  order of an estate.
`;

// The corpus travels: into the published repository, into the npm tarball,
// into a stranger's own tree. A path only this monorepo can resolve is a dead
// reference everywhere it actually gets read, so the provenance is the
// published address.
const HEADER = {
  corpus: 'quo',
  law: 'https://github.com/razvangherghina/quo/blob/main/constitution.md',
  encoding: 'hex',
};

const files = {
  'material.json': { ...HEADER, area: 'material', material },
  'notation.json': { ...HEADER, area: 'notation', vectors: mark(notation) },
  'wire.json': { ...HEADER, area: 'wire', vectors: mark(wire) },
  'arithmetic.json': { ...HEADER, area: 'arithmetic', vectors: mark(arithmetic) },
  'envelope.json': { ...HEADER, area: 'envelope', vectors: mark(envelope) },
  'warden.json': { ...HEADER, area: 'warden', vectors: mark(warden) },
};

must(marked.size === UNPINNED.size, 'a vector named unpinned is not in the corpus');

export function corpus() {
  return Object.fromEntries(
    [
      ['README.md', README],
      ...Object.entries(files).map(([name, body]) => [name, `${JSON.stringify(body, null, 2)}\n`]),
    ].map(([name, text]) => [name, text]),
  );
}

const here = dirname(fileURLToPath(import.meta.url));

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const [name, text] of Object.entries(corpus())) {
    writeFileSync(join(here, 'vectors', name), text);
  }
}
