// JSON reading for Quo values and for the harness channel.
// A node is { t, v, s, e } : type, JS value, raw start, raw end.
// Objects carry `fields`: a Map from key to node. Arrays carry `items`.
// Below `depth` levels a container is checked against the grammar and kept as raw text alone, t "raw".

const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export class NotValue extends Error {}

const fail = (why) => {
  throw new NotValue(why);
};

// Bytes to text. Bytes that are not UTF-8 are never mended.
export function utf8(bytes) {
  try {
    return decoder.decode(bytes);
  } catch {
    return fail("not utf-8");
  }
}

const WS = new Set([0x20, 0x09, 0x0a, 0x0d]);
const ESC = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

// `unique`: refuse two keys of one name among the root object's own keys.
// `depth`: how many container levels become nodes; deeper ones are raw.
export function parse(text, { unique = true, depth: nodeDepth = 2 } = {}) {
  let i = 0;
  const n = text.length;
  const ws = () => {
    while (i < n && WS.has(text.charCodeAt(i))) i++;
  };
  const literal = (word, v, t) => {
    if (!text.startsWith(word, i)) fail("token");
    const s = i;
    i += word.length;
    return { t, v, s, e: i };
  };
  const number = () => {
    const s = i;
    NUMBER.lastIndex = i;
    const r = NUMBER.exec(text);
    if (!r) fail("token");
    i += r[0].length;
    return { t: "number", v: Number(r[0]), s, e: i };
  };
  const string = () => {
    const s = i++;
    let out = "";
    let run = i;
    for (;;) {
      if (i >= n) fail("unterminated");
      const ch = text.charCodeAt(i);
      if (ch === 0x22) break;
      if (ch < 0x20) fail("control");
      if (ch !== 0x5c) {
        i++;
        continue;
      }
      out += text.slice(run, i);
      const esc = text[i + 1];
      if (esc === "u") {
        const h = text.slice(i + 2, i + 6);
        if (!/^[0-9a-fA-F]{4}$/.test(h)) fail("escape");
        out += String.fromCharCode(parseInt(h, 16));
        i += 6;
      } else if (esc !== undefined && Object.hasOwn(ESC, esc)) {
        out += ESC[esc];
        i += 2;
      } else fail("escape");
      run = i;
    }
    out += text.slice(run, i++);
    return { t: "string", v: out, s, e: i };
  };
  const scalar = () => {
    const c = text[i];
    if (c === '"') return string();
    if (c === "t") return literal("true", true, "boolean");
    if (c === "f") return literal("false", false, "boolean");
    if (c === "n") return literal("null", null, "null");
    return number();
  };
  const key = () => {
    ws();
    if (text[i] !== '"') fail("key");
    const k = string();
    ws();
    if (text[i++] !== ":") fail("colon");
    return k;
  };
  // A container checked against the grammar with an explicit stack, at any depth.
  const raw = () => {
    const s = i;
    const stack = [];
    for (;;) {
      ws();
      if (i >= n) fail("end");
      const c = text[i];
      if (c === "{" || c === "[") {
        i++;
        ws();
        if (text[i] === (c === "{" ? "}" : "]")) i++;
        else {
          stack.push(c);
          if (c === "{") key();
          continue;
        }
      } else scalar();
      for (;;) {
        if (stack.length === 0) return { t: "raw", s, e: i };
        ws();
        const top = stack[stack.length - 1];
        if (text[i] === ",") {
          i++;
          if (top === "{") key();
          break;
        }
        if (text[i] !== (top === "{" ? "}" : "]")) fail("container");
        stack.pop();
        i++;
      }
    }
  };
  const value = (level) => {
    ws();
    if (i >= n) fail("end");
    const c = text[i];
    if (c !== "{" && c !== "[") return scalar();
    if (level >= nodeDepth) return raw();
    const obj = c === "{";
    const close = obj ? "}" : "]";
    const node = obj ? { t: "object", fields: new Map(), s: i } : { t: "array", items: [], s: i };
    i++;
    ws();
    if (text[i] === close) {
      node.e = ++i;
      return node;
    }
    for (;;) {
      if (obj) {
        const k = key().v;
        const v = value(level + 1);
        if (node.fields.has(k)) {
          if (unique && level === 0) fail("duplicate key");
          node.repeated = true;
          node.fields.delete(k);
        }
        node.fields.set(k, v);
      } else node.items.push(value(level + 1));
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] !== close) fail("container");
      node.e = ++i;
      return node;
    }
  };
  const root = value(0);
  ws();
  if (i !== n) fail("trailing");
  return root;
}

// The raw text of a node with the whitespace between tokens removed.
export function compact(node, text) {
  const src = text.slice(node.s, node.e);
  let out = "";
  let inString = false;
  let run = 0;
  for (let j = 0; j < src.length; j++) {
    const ch = src.charCodeAt(j);
    if (inString) {
      if (ch === 0x5c) j++;
      else if (ch === 0x22) inString = false;
    } else if (ch === 0x22) inString = true;
    else if (WS.has(ch)) {
      out += src.slice(run, j);
      run = j + 1;
    }
  }
  return out + src.slice(run);
}

// A plain JS value of a node. Objects have a null prototype so any key is safe.
export function toJS(node) {
  if (node.t === "object") {
    const o = Object.create(null);
    for (const [k, v] of node.fields) o[k] = toJS(v);
    return o;
  }
  if (node.t === "array") return node.items.map(toJS);
  if (node.t === "raw") return undefined;
  return node.v;
}
