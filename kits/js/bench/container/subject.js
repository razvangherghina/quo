// The far ground, run inside the official Node image and reached from the host
// suite across a real container boundary. It is the kit itself standing up a
// warden and a door — nothing here is a stand-in for anything.
//
// It converses over stdio, one JSON object per line, every line carrying the
// member `quo`. The first line in is the host-side port the container's port
// was published to, because an ephemeral mapping does not exist until the
// container is running: the ground binds only once it knows the road callers
// will actually take to it.
import { Warden, commitment, encode, signingPair } from '../../src/index.js';
import { serve } from '../../src/door.js';
import { CAP, listen } from '../../src/line.js';

const fixed = (fill) => new Uint8Array(32).fill(fill);
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const bytes = (text) => Uint8Array.from(Buffer.from(text, 'hex'));

const LIST = `ToDo
  add(title text) bool
  count() int
`;

const TEXT = { base: 'text' };

function todo() {
  return {
    lines: [],
    add(title) {
      this.lines.push(title);
      return true;
    },
    count() {
      return BigInt(this.lines.length);
    },
  };
}

const grain = (start) => {
  let seed = start;
  return () => fixed((seed += 7) % 251);
};

function say(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

// One JSON object per line on stdin, handed to `at` as it arrives.
function listenIn(at) {
  let rest = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    rest += chunk;
    const parts = rest.split('\n');
    rest = parts.pop();
    for (const part of parts) {
      if (part.trim() === '') continue;
      at(JSON.parse(part));
    }
  });
}

// Whoever is waiting for the first accepted line, when the push word beat the
// host's dial.
const waiting = [];

function waitable() {
  let settle;
  const promise = new Promise((done) => (settle = done));
  return { promise, settle };
}

async function main() {
  const carriage = process.argv[2];
  const opened = waitable();
  const pushed = waitable();
  listenIn((word) => {
    if (word.do === 'bind') opened.settle(word);
    if (word.do === 'push') pushed.settle(word);
  });

  const clock = () => Date.now();
  const warden = await Warden.open({
    nameSeed: fixed(1),
    padlockSeed: fixed(2),
    heirSeed: fixed(3),
    clock,
    random: grain(100),
  });
  const object = todo();
  const { being } = await warden.hold(object, {
    seed: fixed(5),
    heirSeed: fixed(6),
    blueprint: LIST,
  });

  const { port } = await opened.promise;
  // Inside the container the socket must accept from outside its own loopback;
  // the road it publishes is the one the host actually reaches it by, which is
  // the published mapping and never the address the socket bound.
  const accepted = [];
  const standing =
    carriage === 'line'
      ? await listen(warden, {
          clock,
          random: grain(100),
          host: '0.0.0.0',
          port: 8787,
          hint: `tcp://127.0.0.1:${port}?cap=${CAP}`,
          accepted: (line) => {
            accepted.push(line);
            for (const one of waiting.splice(0)) one(line);
          },
        })
      : await serve(warden, {
          host: '0.0.0.0',
          port: 8787,
          hint: `http://127.0.0.1:${port}`,
        });

  // The invitation the host will spend, minted after the road is known so it
  // carries a hint that reaches.
  const invitation = await warden.grant(being, { voiceSeed: fixed(20), heirSeed: fixed(21) });
  say({
    quo: 'standing',
    hint: standing.hint,
    warden: hex(warden.name.pk),
    padlock: hex(warden.padlock.pk),
    being: hex(being),
    invitation: {
      warden: hex(invitation.warden),
      commitment: hex(invitation.commitment),
      padlock: hex(invitation.padlock),
      heirPublic: hex(invitation.heirPublic),
      heirSecret: hex(invitation.heirSecret),
      hints: invitation.hints,
    },
  });

  // The push: this ground originates an ask down a connection the host opened,
  // spending a standing the host granted it here on stdin.
  const word = await pushed.promise;
  const row = warden.remember({
    warden: bytes(word.invitation.warden),
    commitment: bytes(word.invitation.commitment),
    padlock: bytes(word.invitation.padlock),
    heirPublic: bytes(word.invitation.heirPublic),
    heirSecret: bytes(word.invitation.heirSecret),
    hints: word.invitation.hints,
  });
  const line = accepted[0] ?? (await new Promise((done) => waiting.push(done)));
  const next = await signingPair(fixed(65));
  const envelope = await warden.ask(row, {
    seq: 1n,
    commitment: await commitment(row.warden, next.pk),
    being: bytes(word.being),
    method: { name: 'add', args: encode(TEXT, word.title) },
    random: fixed(200),
  });
  // The line carries and waits for nothing: the answer arrives as a frame of
  // its own through this warden's one door, and the record is what settles it.
  const waitingFor = warden.pending(row, 1n, 5_000n);
  const answer = line.carry(envelope) ? await waitingFor : null;
  say({
    quo: 'push',
    answered: answer !== null,
    seq: answer === null ? null : String(answer.seq),
    said: answer === null || answer.data === null ? null : hex(answer.data),
  });
}

main().catch((error) => {
  say({ quo: 'broke', why: String(error && error.stack ? error.stack : error) });
  process.exit(1);
});
