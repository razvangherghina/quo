// The runner. It is deliberately this small: a stranger rewrites it in an
// afternoon in their own language, and it needs no Quo kit but the one under
// test. Everything it knows is in the scenario file — the keys, the queues,
// the bytes, the states — so nothing about our implementation reaches it.
//
// It compares and it reports. It decides nothing, and it must never repair a
// mismatch into a pass.

// A readable difference rather than a dump. What a stranger needs from a red
// run is which field, what was expected and what came back — anything more is
// noise they have to read past to find the fault.
// A field the scenario deliberately does not assert, because the law does not
// rule it. `standings.*.padlock` is the shape: an index matches `*`. An
// unruled field must be written into the scenario with its reason, so the set
// can never grow quietly — which is the only thing that makes skipping one
// honest rather than convenient.
function unruled(path, list) {
  return (list ?? []).some((one) => {
    const want = one.split('.');
    const have = path.split('.');
    if (want.length !== have.length) return false;
    return want.every((part, at) => part === '*' || part === have[at]);
  });
}

function differ(path, expected, got, out, skip, gaps) {
  if (unruled(path, skip)) return;
  if (JSON.stringify(expected) === JSON.stringify(got)) return;
  if (
    expected &&
    got &&
    typeof expected === 'object' &&
    typeof got === 'object' &&
    !Array.isArray(expected)
  ) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(got)])) {
      differ(path ? `${path}.${key}` : key, expected[key], got[key], out, skip, gaps);
    }
    return;
  }
  if (Array.isArray(expected) && Array.isArray(got) && expected.length === got.length) {
    for (let at = 0; at < expected.length; at += 1) {
      differ(path ? `${path}.${at}` : `${at}`, expected[at], got[at], out, skip, gaps);
    }
    return;
  }
  // A **gap** is a fact the kit says it cannot produce at all — declared by the
  // subject in `cannot`, never guessed from the value. That distinction matters:
  // a row whose padlock is null because the kit never learned it has disagreed
  // with the law, while a row whose padlock the kit cannot report has only
  // failed to answer. Reading both off a null would have called the first the
  // second, and let a real divergence pass as a missing accessor.
  //
  // A gap is still not green. It is named apart because what it costs to fix is
  // an accessor and not a judgment.
  out.push({ at: path, expected, got, gap: unruled(path, gaps) });
}

function check(what, expected, got, faults, skip, gaps = []) {
  const found = [];
  differ('', expected, got, found, skip, gaps);
  for (const one of found) faults.push({ what, ...one });
  return found.length === 0;
}

// One exchange handed to the subject, whichever side it drives. Each verb has
// its own name for the thing that comes back and its own shape of nothing, and
// all three collapse to one value the scenario compares against: bytes, a
// decoded record, or `null`.
// A subject that reports an `error` has not answered the question, and the
// distinction is the whole of Article I-2. A warden is the global try/catch and
// never throws; a kit that lets a fault out is not silent, it is broken — and
// the subject, which must catch to stay alive on its pipe, would otherwise turn
// every such fault into a `null` the runner reads as an ordinary silence. That
// made a door that refuses and a door that falls over indistinguishable here,
// which is the one thing this suite may never let happen: a case that cannot
// come out the other way. So an error is a fault of its own, never nothing.
async function perform(exchange, subject) {
  // Not a message at all: the house changing its own mind about a standing.
  // Nothing crosses, so there is nothing to compare on the wire and the whole
  // of what it claims is in the record afterwards.
  if (exchange.do === 'amend') {
    const done = await subject.obey({
      do: 'amend',
      voice: exchange.voice,
      add: exchange.add ?? [],
      remove: exchange.remove ?? [],
    });
    return { value: null, onward: [], error: done.error ?? null };
  }
  // Also not a message: the house moving its own name. The peers that need to
  // know are told by news, which is a separate act — so nothing crosses here
  // either, and what it claims is in the record after it and in what the door
  // answers to next.
  if (exchange.do === 'succeed') {
    const moved = await subject.obey({
      do: 'succeed',
      nameSeed: exchange.nameSeed,
      heirSeed: exchange.heirSeed,
      heirCommitment: exchange.heirCommitment,
    });
    return { value: null, onward: [], error: moved.error ?? null };
  }
  // The two halves of a migration's news. Neither is a message the door was
  // handed: each is the door composing what it owes its peers, so what comes
  // back is bytes per peer and nothing crossed inward.
  if (exchange.do === 'depart' || exchange.do === 'landed') {
    const told = await subject.obey({
      do: exchange.do,
      being: exchange.being,
      heirSeed: exchange.heirSeed,
      commitment: exchange.commitment,
      gone: exchange.gone,
      hints: exchange.hints ?? [],
      news: exchange.news ?? [],
    });
    return { value: null, onward: [], news: told.news ?? [], error: told.error ?? null };
  }
  if (exchange.do === 'send') {
    const sent = await subject.obey({ do: 'send', ask: exchange.ask });
    return { value: sent.bytes ?? null, onward: [], error: sent.error ?? null };
  }
  if (exchange.do === 'read') {
    const read = await subject.obey({ do: 'read', answer: exchange.give, at: exchange.at });
    return { value: read.answer ?? null, onward: [], error: read.error ?? null };
  }
  const answered = await subject.obey({ do: 'door', bytes: exchange.give });
  return {
    value: answered.answer ?? null,
    onward: answered.onward ?? [],
    error: answered.error ?? null,
  };
}

export async function run(scenario, subject) {
  const faults = [];
  const ran = [];

  const stood = await subject.obey({ do: 'stand', ...scenario.stand });
  if (stood.error)
    return { faults: [{ what: 'stand', at: '', expected: 'a warden', got: stood.error }], ran };
  // Which being's record the scenario reads. Usually the opening state names
  // it, but a scenario may watch a being that is not there yet — a destination
  // waiting for a migration has nothing to read until the cargo arrives, and
  // `null` is the honest opening state for it.
  const being = scenario.being ?? scenario.opening?.being;

  // The opening state, before a byte is handed in. A scenario that asserted
  // only the deltas would be measuring from somewhere it never looked.
  const skip = scenario.unruled?.map((one) => one.field);
  const opened = await subject.obey({ do: 'state', being });
  // What this kit says it cannot report at all, declared once by the subject
  // rather than read off a null.
  const cannot = opened.cannot ?? [];
  check('the opening state', scenario.opening, opened.cargo, faults, skip, cannot);

  for (const exchange of scenario.exchanges) {
    // Three sides a scenario can drive, and the exchange says which. `door` is
    // the warden judging what arrived; `send` and `read` are the same kit as a
    // caller, composing an ask and judging an answer. A third of the
    // obligations are the caller's and no scenario could reach one without
    // these two.
    const got = await perform(exchange, subject);
    // Five words and a value. `silence` is no bytes at all; `refused` is the
    // same absence on the sending side, where the law calls it a refusal to
    // send rather than a silence and the two must not be confused in a report;
    // `done` is the third absence and the only one that is not a refusal of
    // anything — an amend and a succeed cross no wire, so nothing was there to
    // refuse, and calling it a silence would report the house changing its own
    // mind as a door turning a caller away; `answered` says only bytes came back;
    // anything else is the value pinned exactly, whether that is a hex string
    // of bytes or the record a caller decoded.
    const nothing =
      exchange.expect === 'silence' || exchange.expect === 'refused' || exchange.expect === 'done';
    // Before anything is compared: did the kit answer at all, or did it fall
    // over? Silence is an answer and a fault is not, and reading the second as
    // the first is how a broken door passes for a strict one.
    const alive = check(
      `${exchange.name}: the kit answered rather than failing`,
      null,
      got.error,
      faults,
    );
    const wire = check(
      `${exchange.name}: what crossed`,
      nothing ? null : exchange.expect === 'answered' ? 'some bytes' : exchange.expect,
      exchange.expect === 'answered' ? (got.value === null ? null : 'some bytes') : got.value,
      faults,
    );
    // What the door composed and handed onward while judging this. A warden
    // never makes an onward ask of its own, so this is empty unless the call
    // reached a being that calls out — and where a scenario names bytes here,
    // they are the warden's arithmetic on the leash it was handed.
    const handed = check(
      `${exchange.name}: what it handed onward`,
      exchange.onward ?? [],
      got.onward,
      faults,
    );
    // What the door composed for its peers, which only a departure or an
    // arrival produces. Article XIV's two news, asserted as bytes exactly the
    // way an onward ask is: the word's fields, the voice the peer can believe
    // it from, and this door's own padlock and roads inside the envelope.
    const told = check(
      `${exchange.name}: the news it composed`,
      exchange.told ?? [],
      got.news ?? [],
      faults,
    );
    const after = await subject.obey({ do: 'state', being });
    const state = check(
      `${exchange.name}: the state after`,
      exchange.cargo,
      after.cargo,
      faults,
      skip,
      cannot,
    );
    ran.push({
      name: exchange.name,
      obligations: exchange.obligations,
      green: alive && wire && handed && told && state,
    });
  }

  return { faults, ran, unruled: scenario.unruled ?? [] };
}

// What a red run should read like.
export function report({ faults, ran }) {
  const lines = [];
  for (const one of ran) {
    lines.push(`${one.green ? 'green' : 'RED  '}  ${one.name}  [${one.obligations.join(' ')}]`);
  }
  for (const fault of faults) {
    lines.push('');
    lines.push(`${fault.gap ? 'GAP ' : 'RED '} ${fault.what}`);
    lines.push(`     at       ${fault.at || '(the whole value)'}`);
    lines.push(`     expected ${JSON.stringify(fault.expected)}`);
    lines.push(
      fault.gap
        ? '     got      null — the kit says it cannot report this fact'
        : `     got      ${JSON.stringify(fault.got)}`,
    );
  }
  return lines.join('\n');
}

// The faults split by what they cost to fix. A divergence is a kit disagreeing
// with the law; a gap is a kit unable to say. Never collapse the two.
export function split({ faults }) {
  return {
    divergences: faults.filter((one) => !one.gap),
    gaps: faults.filter((one) => one.gap),
  };
}
