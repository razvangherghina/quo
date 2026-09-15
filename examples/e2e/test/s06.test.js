// `quo/SCENARIOS.md` chapter 6, "Values across two languages": each value
// is written by the hand as the exact text the line names, sent to A's door
// through the observer, and the claim is what that door says. Each line runs
// with the JavaScript ward as the door, then the Rust ward, and each test
// first shows its check rejecting a run that breaks the line.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintKey } from '../src/hand.js';
import { bootHost } from '../src/root-driver.js';
import { SHOWN } from '../src/blueprint.js';
import { askOn, standingAt } from '../src/standing.js';
import { depthOf, hexText, nested, payloadText, rejects, withDoor } from './support/s06.js';

import { DIRECTIONS } from '../src/kits.js';

// A knock of `hello` on a fresh heir with `over` replacing fields' text.
async function knock(w, over, opts = {}) {
  const h = await w.heir();
  const obs = await w.observe(payloadText(w.knockFields(h, over)), h.heirKey, { to: h.invitation.heir, ...opts });
  return { h, obs };
}

const hiIs = (id) => (object) => assert.deepEqual(object, { hi: id });

for (const [doorKit, askerKit] of DIRECTIONS) {
  const dir = `door ${doorKit}, asker ${askerKit}`;

  test(`6.1 ${dir}: hello with v 9007199254740993 is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const broken = await knock(w, { args: '{"v":9007199254740992}' });
      rejects(() => w.refused(broken.obs), 'an answered 9007199254740992');
      const kept = await knock(w, { args: '{"v":9007199254740993}' });
      w.refused(kept.obs);
    });
  });

  test(`6.2 ${dir}: echo with v 1e21, then 1e+23, answers the doubles`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const doubleIs = (d) => (object) => {
        assert.deepEqual(Object.keys(object), ['v']);
        assert.equal(object.v, d);
      };
      const broken = await knock(w, { method: '"echo"', args: '{"v":1e20}' });
      rejects(() => w.answered(broken.obs, doubleIs(1e21)), 'an echo of another double');
      for (const [text, d] of [['1e21', 1e21], ['1e+23', 1e23]]) {
        const kept = await knock(w, { method: '"echo"', args: `{"v":${text}}` });
        w.answered(kept.obs, doubleIs(d));
      }
      // B, the asker kit, asks the same on a standing and reads the doubles.
      await standingAt(w.world, 'b');
      for (const d of [1e21, 1e23]) {
        const got = await askOn(w.world.asker, w.world.b.pk, 'b', { method: 'echo', args: { v: d } });
        assert.ok(got.object, `B reads an object: ${JSON.stringify(got)}`);
        doubleIs(d)(got.object);
      }
    });
  });

  test(`6.3 ${dir}: hello with v -0, then -0.0, is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const broken = await knock(w, { args: '{"v":0}' });
      rejects(() => w.refused(broken.obs), 'an answered 0');
      for (const text of ['-0', '-0.0']) {
        const kept = await knock(w, { args: `{"v":${text}}` });
        w.refused(kept.obs);
      }
    });
  });

  test(`6.4 ${dir}: hello with v 1e-400 is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const broken = await knock(w, { args: '{"v":1e-300}' });
      rejects(() => w.refused(broken.obs), 'an answered 1e-300');
      const kept = await knock(w, { args: '{"v":1e-400}' });
      w.refused(kept.obs);
    });
  });

  test(`6.5 ${dir}: a lone surrogate is refused, a paired surrogate and a noncharacter echo as themselves`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const broken = await knock(w, { args: '{"v":"\\uD83D\\uDE00"}' });
      rejects(() => w.refused(broken.obs), 'an answered paired surrogate');
      const lone = await knock(w, { args: '{"v":"\\uD800"}' });
      w.refused(lone.obs);

      const same = (s) => (object) => assert.deepEqual(object, { v: s });
      const otherEcho = await knock(w, { method: '"echo"', args: '{"v":"\\uFFFD"}' });
      rejects(() => w.answered(otherEcho.obs, same('￿')), 'an echo of another string');
      const paired = await knock(w, { method: '"echo"', args: '{"v":"\\uD83D\\uDE00"}' });
      w.answered(paired.obs, same('\u{1F600}'));
      const nonchar = await knock(w, { method: '"echo"', args: '{"v":"\\uFFFF"}' });
      w.answered(nonchar.obs, same('￿'));
    });
  });

  test(`6.6 ${dir}: hello with a payload holding one key twice is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const broken = await knock(w, { args: '{"v":1,"w":1}' });
      rejects(() => w.refused(broken.obs), 'an answered payload of two keys');
      const kept = await knock(w, { args: '{"v":1,"v":1}' });
      w.refused(kept.obs);
    });
  });

  test(`6.7 ${dir}: v nested 64 deep is answered, 65 deep is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const shallow = await knock(w, { args: `{"v":${nested(1)}}` });
      rejects(() => w.refused(shallow.obs), 'an answered nesting as refused');
      const over = await knock(w, { args: `{"v":${nested(66)}}` });
      rejects(() => w.answered(over.obs, hiIs(over.h.id)), 'a refused nesting as answered');
      const deep64 = await knock(w, { args: `{"v":${nested(64)}}` });
      const deep65 = await knock(w, { args: `{"v":${nested(65)}}` });
      w.answered(deep64.obs, hiIs(deep64.h.id));
      w.refused(deep65.obs);
    });
  });

  test(`6.8 ${dir}: echo of v 63 deep answers depth 64, of v 64 deep is threw`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      // No digest is read here: what echo writes is not this line's claim.
      const deep63 = await knock(w, { method: '"echo"', args: `{"v":${nested(63)}}` }, { digests: false });
      const deep64 = await knock(w, { method: '"echo"', args: `{"v":${nested(64)}}` }, { digests: false });
      const depth64 = (object) => {
        assert.equal(depthOf(object), 64);
        assert.deepEqual(object, { v: JSON.parse(nested(63)) });
      };
      rejects(() => w.answered(deep64.obs, depth64), 'a threw as an object');
      rejects(() => w.word(deep63.obs, 'threw'), 'an object as threw');
      w.answered(deep63.obs, depth64);
      w.word(deep64.obs, 'threw');
    });
  });

  test(`6.9 ${dir}: seq written 1.0 is honoured, 2 after is honoured, 1 after is repeated`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const broken = await knock(w, { seq: '1.5' });
      rejects(() => w.answered(broken.obs, hiIs(broken.h.id)), 'a refused seq as honoured');

      const { h, obs: first } = await knock(w, { seq: '1.0' });
      const next = (seq) => payloadText([
        ['to', hexText(h.invitation.heir)],
        ['by', hexText(h.own.signPk)],
        ['next', 'null'],
        ['seq', seq],
        ['time', '1000'],
        ['method', '"hello"'],
        ['args', '{}'],
      ]);
      const to = h.invitation.heir;
      const second = await w.observe(next('2'), h.own, { to });
      const third = await w.observe(next('1'), h.own, { to });
      rejects(() => w.word(second, 'repeated'), 'an honoured 2 as repeated');
      rejects(() => w.answered(third, hiIs(h.id)), 'a repeated 1 as honoured');
      w.answered(first, hiIs(h.id));
      w.answered(second, hiIs(h.id));
      w.word(third, 'repeated');
    });
  });

  test(`6.10 ${dir}: echo with args absent answers {}, the empty ask with args {} answers the blueprint, hello with args [] is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const empty = (object) => assert.deepEqual(object, {});
      const brokenEcho = await knock(w, { method: '"echo"', args: '{"v":1}' });
      rejects(() => w.answered(brokenEcho.obs, empty), 'an echo of an arg');
      const echo = await knock(w, { method: '"echo"', args: undefined });
      w.answered(echo.obs, empty);

      const blueprint = (object, obs) => {
        assert.equal(obs.reply.seen, null, 'seen is null');
        assert.deepEqual(object, SHOWN);
      };
      const brokenDescribe = await knock(w, {});
      rejects(() => w.answered(brokenDescribe.obs, blueprint), 'a named answer as the blueprint');
      const describe = await knock(w, { method: undefined, args: '{}' });
      w.answered(describe.obs, blueprint);

      const brokenArray = await knock(w, { args: '{}' });
      rejects(() => w.refused(brokenArray.obs), 'an answered args {}');
      const array = await knock(w, { args: '[]' });
      w.refused(array.obs);
    });
  });

  test(`6.11 ${dir}: a field beside the seven is not read`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const asIfAbsent = (object) => assert.deepEqual(object, { v: 1 });
      const broken = await knock(w, { method: '"echo"', args: '{"v":1,"mood":"x"}' });
      rejects(() => w.answered(broken.obs, asIfAbsent), 'an echo that read the field');
      const h = await w.heir();
      const fields = [...w.knockFields(h, { method: '"echo"', args: '{"v":1}' }), ['mood', '"x"']];
      const kept = await w.observe(payloadText(fields), h.heirKey, { to: h.invitation.heir });
      w.answered(kept, asIfAbsent);
    });
  });

  test(`6.12 ${dir}: with a public being, to absent is refused and to null is answered {hi: null}`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const { door } = w.world;
      await bootHost(door, w.a.pk, 'pub');
      const named = await door.request({ ward: w.a.pk, method: 'public', args: { key: 'pub' } });
      assert.equal(named.object?.public, 'pub', JSON.stringify(named));

      const ask = (to) => {
        const k = mintKey();
        const text = payloadText([['to', to], ['by', hexText(k.signPk)], ['next', 'null'], ['seq', '1'], ['time', '1000'], ['method', '"hello"'], ['args', '{}']]);
        return w.observe(text, k, { to: null });
      };
      const nobody = (object) => assert.deepEqual(object, { hi: null });
      const absent = await ask(undefined);
      const nul = await ask('null');
      rejects(() => w.refused(nul), 'an answered to null as refused');
      rejects(() => w.answered(absent, nobody), 'a refused to absent as answered');
      w.refused(absent);
      w.answered(nul, nobody);
    });
  });

  test(`6.13 ${dir}: method null, args null, time 1.5, -1 and 0 are each refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const broken = await knock(w, {});
      rejects(() => w.refused(broken.obs), 'the answered ask they vary');
      for (const over of [{ method: 'null' }, { args: 'null' }, { time: '1.5' }, { time: '-1' }, { time: '0' }]) {
        const kept = await knock(w, over);
        w.refused(kept.obs);
      }
    });
  });

  test(`6.14 ${dir}: a payload that is a JSON array is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const h = await w.heir();
      const object = payloadText(w.knockFields(h));
      const broken = await w.observe(object, h.heirKey, { to: h.invitation.heir });
      rejects(() => w.refused(broken), 'the answered object it wraps');
      const h2 = await w.heir();
      const kept = await w.observe(`[${payloadText(w.knockFields(h2))}]`, h2.heirKey, { to: h2.invitation.heir });
      w.refused(kept);
    });
  });

  test(`6.15 ${dir}: one byte that is no UTF-8 in an answerable payload is refused`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const withByte = (h, byte) => {
        const text = payloadText(w.knockFields(h, { args: '{"v":"a#b"}' }));
        const bytes = Buffer.from(text, 'utf8');
        bytes[bytes.indexOf('#')] = byte;
        return bytes;
      };
      const h1 = await w.heir();
      const broken = await w.observe(withByte(h1, 0x61), h1.heirKey, { to: h1.invitation.heir });
      rejects(() => w.refused(broken), 'the answered payload with a UTF-8 byte');
      const h2 = await w.heir();
      const kept = await w.observe(withByte(h2, 0xff), h2.heirKey, { to: h2.invitation.heir });
      w.refused(kept);
    });
  });

  test(`6.16 ${dir}: fields in an order no kit writes, with whitespace, signed over those bytes, are answered`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const text = (h) => `{ "args" : { } ,\n "seq": 1, "method":"hello",\t"next": ${hexText(h.own.signPk)}, "time": 1000 , "to": ${hexText(h.invitation.heir)}, "by": ${hexText(h.heirKey.signPk)} }`;
      const h1 = await w.heir();
      const broken = await w.observe(text(h1), h1.heirKey, { to: h1.invitation.heir, signBytes: payloadText(w.knockFields(h1)) });
      rejects(() => w.answered(broken, hiIs(h1.id)), 'bytes signed over another spelling');
      const h2 = await w.heir();
      const kept = await w.observe(text(h2), h2.heirKey, { to: h2.invitation.heir });
      w.answered(kept, hiIs(h2.id));
    });
  });

  test(`6.17 ${dir}: hello with v sized to a box of 1,048,576 bytes is answered`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const { h, obs: first } = await knock(w, {});
      w.answered(first, hiIs(h.id));
      const sized = (seq, boxBytes) => {
        const fields = (v) => payloadText([
          ['to', hexText(h.invitation.heir)],
          ['by', hexText(h.own.signPk)],
          ['next', 'null'],
          ['seq', seq],
          ['time', '1000'],
          ['method', '"hello"'],
          ['args', `{"v":"${v}"}`],
        ]);
        return fields('x'.repeat(boxBytes - 160 - Buffer.byteLength(fields(''))));
      };
      const check = (obs) => {
        assert.equal(obs.askFrame?.box.length, 1_048_576, 'the observer measures the box at 1,048,576');
        assert.equal(obs.askFrame.box.length, obs.payloadBytes.length + 160, "the box is its payload's length plus 160");
        w.answered(obs, hiIs(h.id));
      };
      const over = await w.observe(sized('3', 1_048_577), h.own, { to: h.invitation.heir, dialer: w.newDialer(), allowanceMs: 2000 });
      rejects(() => check(over), 'a box one byte over');
      const kept = await w.observe(sized('2', 1_048_576), h.own, { to: h.invitation.heir });
      check(kept);
    });
  });

  test(`6.18 ${dir}: a payload padded with whitespace to a box of 4,096 bytes is answered as the unpadded ask is`, async () => {
    await withDoor(doorKit, askerKit, async (w) => {
      const { h, obs: unpadded } = await knock(w, {});
      w.answered(unpadded, () => {});
      const text = (seq) => payloadText([
        ['to', hexText(h.invitation.heir)],
        ['by', hexText(h.own.signPk)],
        ['next', 'null'],
        ['seq', seq],
        ['time', '1000'],
        ['method', '"hello"'],
        ['args', '{}'],
      ]);
      const pad = (t) => t + ' '.repeat(4096 - 160 - Buffer.byteLength(t));
      const check = (obs) => {
        assert.equal(obs.askFrame?.box.length, 4096, 'the observer measures the box at 4,096');
        w.answered(obs, (object) => assert.deepEqual(object, unpadded.reply.object));
      };
      const broken = await w.observe(pad(text('2')), h.own, { to: h.invitation.heir, signBytes: text('2') });
      rejects(() => check(broken), 'padding the signature does not cover');
      const kept = await w.observe(pad(text('2')), h.own, { to: h.invitation.heir });
      check(kept);
    });
  });
}
