// JSON text held to the chapter on values of SPEC.md. The parser returns a
// tree that keeps each number's text and each object's keys after escapes
// are read. Only the outermost object is refused for a repeated key.

// How deep this reader goes. It is the verifier's own bound, not Quo's, and
// lies far past anything the verifier sends.
const LIMIT = 4096;

class NotValue extends Error {}

/**
 * Parses bytes; returns { value, depth } or { error }. `outer` refuses a
 * repeated key in the outermost object, as Quo does where it reads.
 */
export function parseValue(bytes, { outer = true } = {}) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { error: "not UTF-8" };
  }
  let i = 0;
  const fail = (why) => {
    throw new NotValue(`${why} at ${i}`);
  };
  const ws = () => {
    while (i < text.length && " \t\n\r".includes(text[i])) i++;
  };

  function value(level) {
    if (level > LIMIT) fail("too deep");
    const c = text[i];
    if (c === "{") return object(level);
    if (c === "[") return array(level);
    if (c === '"') return { type: "string", value: string(), depth: 0 };
    for (const [lit, v] of [
      ["true", true],
      ["false", false],
      ["null", null],
    ]) {
      if (text.startsWith(lit, i)) {
        i += lit.length;
        return { type: v === null ? "null" : "boolean", value: v, depth: 0 };
      }
    }
    return number();
  }

  function object(level) {
    i++;
    const entries = new Map();
    let depth = 1;
    let dup = false;
    ws();
    if (text[i] === "}") {
      i++;
      return { type: "object", entries, depth, dup };
    }
    for (;;) {
      ws();
      if (text[i] !== '"') fail("key expected");
      const key = string();
      if (outer && level === 1 && entries.has(key)) fail(`duplicate key ${JSON.stringify(key)}`);
      // Deeper, a repeated key is kept as a mark, for a describe refuses one.
      if (entries.has(key)) dup = true;
      ws();
      if (text[i] !== ":") fail("colon expected");
      i++;
      ws();
      const v = value(level + 1);
      entries.set(key, v);
      depth = Math.max(depth, v.depth + 1);
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return { type: "object", entries, depth, dup };
      }
      fail("comma or brace expected");
    }
  }

  function array(level) {
    i++;
    const items = [];
    let depth = 1;
    ws();
    if (text[i] === "]") {
      i++;
      return { type: "array", items, depth };
    }
    for (;;) {
      ws();
      const v = value(level + 1);
      items.push(v);
      depth = Math.max(depth, v.depth + 1);
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return { type: "array", items, depth };
      }
      fail("comma or bracket expected");
    }
  }

  function hex4() {
    const h = text.slice(i, i + 4);
    if (!/^[0-9a-fA-F]{4}$/.test(h)) fail("bad escape");
    i += 4;
    return parseInt(h, 16);
  }

  function string() {
    i++;
    let out = "";
    for (;;) {
      if (i >= text.length) fail("unterminated string");
      const c = text[i];
      const code = c.charCodeAt(0);
      if (c === '"') {
        i++;
        return out;
      }
      if (code < 0x20) fail("control character in string");
      if (c !== "\\") {
        out += c;
        i++;
        continue;
      }
      i++;
      const e = text[i++];
      const simple = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
      if (e in simple) {
        out += simple[e];
        continue;
      }
      if (e !== "u") fail("bad escape");
      out += String.fromCharCode(hex4());
    }
  }

  function number() {
    const m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(i, i + 4096));
    if (!m) fail("not JSON");
    let lit = m[0];
    if (lit.length === 4096) {
      const rest = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(text.slice(i));
      lit = rest[0];
    }
    i += lit.length;
    return { type: "number", value: Number(lit), text: lit, depth: 0 };
  }

  try {
    ws();
    if (i >= text.length) return { error: "not JSON" };
    const v = value(1);
    ws();
    if (i !== text.length) return { error: "trailing text" };
    return { value: v, depth: v.depth };
  } catch (e) {
    if (e instanceof NotValue) return { error: e.message };
    throw e;
  }
}

/** Whether a JSON number text is an integer: no fraction and no exponent. */
export const isInteger = (lit) => /^-?(0|[1-9][0-9]*)$/.test(lit);

/** Structural equality of two parsed values, numbers by their text. */
export function sameValue(a, b) {
  if (a.type !== b.type) return false;
  if (a.type === "object") {
    if (a.entries.size !== b.entries.size) return false;
    for (const [k, v] of a.entries) if (!b.entries.has(k) || !sameValue(v, b.entries.get(k))) return false;
    return true;
  }
  if (a.type === "array") return a.items.length === b.items.length && a.items.every((v, i) => sameValue(v, b.items[i]));
  if (a.type === "number") return a.text === b.text;
  return a.value === b.value;
}

const MAX_COUNT = 9007199254740991;
const isPk = (v) => v.type === "string" && /^[0-9a-f]{64}$/.test(v.value) && !/^0{64}$/.test(v.value);

/** Reads a payload under the chapters on values and the payload, or says why it is none. */
export function readPayload(bytes) {
  const p = parseValue(bytes);
  if (p.error) return { error: p.error };
  const v = p.value;
  if (v.type !== "object") return { error: "payload is not one object" };
  const get = (k) => v.entries.get(k);
  for (const k of ["to", "by", "next", "seq"]) if (!get(k)) return { error: `${k} is absent` };
  const nullable = (k) => (get(k).type === "null" ? null : isPk(get(k)) ? get(k).value : undefined);
  const to = nullable("to");
  const next = nullable("next");
  if (to === undefined) return { error: "to is not a pk or null" };
  if (next === undefined) return { error: "next is not a pk or null" };
  if (!isPk(get("by"))) return { error: "by is not a pk" };
  const seq = get("seq");
  if (seq.type !== "number" || !isInteger(seq.text) || seq.value < 1 || seq.value > MAX_COUNT) {
    return { error: "seq is not a count number" };
  }
  const method = get("method");
  if (method && method.type !== "string") return { error: "method is not a string" };
  const args = get("args");
  if (args && args.type !== "object") return { error: "args is not one object" };
  return { to, by: get("by").value, next, seq: seq.value, method: method?.value, args };
}

/**
 * Says why a value is no describe, under the chapter on what may be asked,
 * or null where it is one. Nothing inside `description`, an entry's `args`
 * or an unnamed field is read.
 */
export function whyNoDescribe(v) {
  if (v.type !== "object") return "the object is not one object";
  if (v.dup) return "the describe has two keys of one name";
  const lang = v.entries.get("lang");
  if (lang && lang.type !== "string") return "lang is not a string";
  const asks = v.entries.get("asks");
  if (!asks) return "asks is absent";
  if (asks.type !== "array") return "asks is not an array";
  const methods = new Set();
  for (const [n, e] of asks.items.entries()) {
    if (e.type !== "object") return `entry ${n} is not an object`;
    if (e.dup) return `entry ${n} has two keys of one name`;
    const m = e.entries.get("method");
    if (!m) return `entry ${n} has no method`;
    if (m.type !== "string") return `the method of entry ${n} is not a string`;
    if (methods.has(m.value)) return `two entries name the method ${JSON.stringify(m.value)}`;
    methods.add(m.value);
  }
  return null;
}

/** Reads a reply text into one of the three shapes, or says why it is none. */
export function readReply(bytes) {
  const p = parseValue(bytes);
  if (p.error) return { error: p.error };
  const v = p.value;
  if (v.type !== "object") return { error: "reply text is not an object" };
  const keys = [...v.entries.keys()].toSorted().join(",");
  if (keys === "silence") {
    const s = v.entries.get("silence");
    return s.type === "boolean" && s.value === true ? { shape: "silence" } : { error: "silence is not true" };
  }
  if (keys === "quo") {
    const w = v.entries.get("quo");
    if (w.type === "string" && ["removed", "unannounced", "repeated"].includes(w.value)) return { shape: "word", word: w.value };
    return { error: "quo is not one of the three words" };
  }
  if (keys === "object,seen" || keys === "at,object,seen") {
    const o = v.entries.get("object");
    const s = v.entries.get("seen");
    if (s.type !== "string" && s.type !== "null") return { error: "seen is neither a string nor null" };
    const at = v.entries.get("at");
    return { shape: "object", object: o, seen: s.value, ...(at ? { at } : {}) };
  }
  return { error: `fields ${keys} are none of the three shapes` };
}
