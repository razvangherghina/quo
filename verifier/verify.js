// SPDX-License-Identifier: Apache-2.0
// The verifier. It replays `vectors/door.json` against a kit standing in
// vector mode at a URL, the way `SPEC.md` describes under that name, and it
// holds no key: every byte it sends is in the corpus and every byte it
// compares is one a stranger can see. It seals nothing, opens nothing and
// signs nothing. The day it needs to, the design is wrong.
//
// One round per record, four steps: stand, and the kit's `before` and `ask`
// are the record's; the record's ask posted to the ward, and the reply is
// the record's byte for byte; digest, and `after` is the record's; and
// `wrote` is whether the two digests differ. Each record stands on its own,
// so an order is a choice and never a dependency.
//
// This file runs wherever `fetch` does: a page in a tab, a shell under Node,
// an edge worker. It imports nothing.

const SUITE = '1';

const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));

// Reads a corpus from a URL or a path-like base, `<base>/vectors/door.json`.
export async function corpusAt(base) {
  const res = await fetch(new URL('vectors/door.json', base.endsWith('/') ? base : base + '/'));
  if (!res.ok) throw new Error(`no corpus at ${res.url}: ${res.status}`);
  return res.json();
}

// What one record's round found. `checks` holds every comparison by name
// with what was expected and what came back, so a failure says which bytes
// differed and not merely that some did.
function judge(record, got) {
  const checks = {
    before: { expected: record.before, got: got.before },
    ask: { expected: record.ask, got: got.ask },
    reply: { expected: record.reply, got: got.reply },
    after: { expected: record.after, got: got.after },
    wrote: { expected: record.wrote, got: got.wrote },
  };
  const failed = Object.keys(checks).filter((k) => checks[k].expected !== checks[k].got);
  return { case: record.case, name: record.name, state: record.state, kind: record.kind, ok: failed.length === 0, failed, checks };
}

// One record against the kit at `url`. A step that does not answer is a
// failure of that step, named, and the round stops there: nothing after it
// could mean anything.
export async function replay(url, record) {
  const base = url.replace(/\/$/, '');
  const got = {};
  const fail = (step, why) => ({ case: record.case, name: record.name, state: record.state, kind: record.kind, ok: false, failed: [step], checks: {}, error: `${step}: ${why}` });
  let stood;
  try {
    const res = await fetch(`${base}/stand`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ case: record.case, name: record.name }) });
    if (!res.ok) return fail('stand', `status ${res.status}`);
    stood = await res.json();
  } catch (e) {
    return fail('stand', e instanceof Error ? e.message : String(e));
  }
  got.before = stood.before;
  got.ask = stood.ask;
  if (typeof stood.ward !== 'string' || !/^[0-9a-f]{128}$/.test(stood.ward)) return fail('stand', 'no ward pk in the answer');
  try {
    const body = unhex(record.ask);
    const res = await fetch(`${base}/${stood.ward}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'quo-suite': SUITE }, body });
    if (!res.ok) return fail('reply', `status ${res.status}`);
    got.reply = hex(new Uint8Array(await res.arrayBuffer()));
  } catch (e) {
    return fail('reply', e instanceof Error ? e.message : String(e));
  }
  try {
    const res = await fetch(`${base}/digest`);
    if (!res.ok) return fail('digest', `status ${res.status}`);
    got.after = (await res.json()).after;
  } catch (e) {
    return fail('digest', e instanceof Error ? e.message : String(e));
  }
  got.wrote = got.before !== got.after;
  return judge(record, got);
}

// The whole corpus against the kit at `url`, one record after another.
// `onRecord` hears each result as it lands, so a page can draw the report
// while the rest runs. The report is the records, and the two counts.
export async function verify(url, corpus, { onRecord } = {}) {
  const records = [];
  for (const record of corpus.vectors) {
    const r = await replay(url, record);
    records.push(r);
    if (onRecord) onRecord(r);
  }
  const pass = records.filter((r) => r.ok).length;
  return { url, corpus: corpus.corpus, pass, fail: records.length - pass, records };
}

// The report as lines, for a shell or a <pre>. One line per record, and the
// bytes that differed under a record that failed.
export function lines(report) {
  const out = [];
  for (const r of report.records) {
    out.push(`${r.ok ? 'pass' : 'FAIL'}  ${r.case.padEnd(4)} ${r.name}`);
    if (r.ok) continue;
    if (r.error) out.push(`      ${r.error}`);
    for (const k of r.failed) {
      if (!r.checks[k]) continue;
      out.push(`      ${k}: expected ${String(r.checks[k].expected)}`);
      out.push(`      ${' '.repeat(k.length)}       got ${String(r.checks[k].got)}`);
    }
  }
  out.push(`${report.pass} passed, ${report.fail} failed, ${report.records.length} records, ${report.url}`);
  return out;
}
