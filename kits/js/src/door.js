// Listening is the one half of the carriage that cannot be portable: a browser
// tab never listens. So the door is a host adapter and lives behind its own
// export, which is what lets a ground that only calls out — a tab, a worker —
// import the kit without importing a host's API it could never satisfy.
//
// This is the only file in the kit that names a host.
import { createServer } from 'node:http';
import { concat } from './envelope.js';

// TLS is redundant crypto Quo does not rely on for a single guarantee; it is
// there because it is what the world's middleboxes pass unmolested. On
// loopback there are no middleboxes, so the bench speaks plain HTTP and the
// bytes are identical.
// `limit` is the size the host holds this door to, counted in bytes of the
// whole envelope as the carriage delivers it — the ephemeral key and the
// ciphertext together, which is exactly the number `limit()` publishes. It is
// the host's to pass, the same way it passes the clock, and a door handed none
// reads whatever arrives.
// `hint` is the road callers should take to this door, for the ordinary case
// where the socket is not the address: behind a proxy or a tunnel the door
// listens on loopback and the world reaches it by a domain. Handed none, the
// door publishes the socket it actually bound.
export function serve(
  warden,
  { clock, random, host = '127.0.0.1', port = 0, limit = null, hint = null },
) {
  const server = createServer((incoming, outgoing) => {
    const chunks = [];
    incoming.on('data', (chunk) => chunks.push(chunk));
    incoming.on('end', async () => {
      const message = concat(chunks.map((chunk) => new Uint8Array(chunk)));
      // Over the published limit is silence, exactly as any other refusal: a
      // door that took an unbounded body would be a door anyone can exhaust.
      const answer =
        limit !== null && BigInt(message.length) > limit
          ? null
          : await warden.judge(message, {
              clock,
              random: random(),
            });
      // Silence is an empty body. No status code carries meaning, so the
      // refusal and the answer leave by the same door.
      outgoing.end(answer === null ? new Uint8Array(0) : answer);
    });
  });
  return new Promise((resolve) => {
    server.listen(port, host, () => {
      const at = server.address();
      // A door is the only thing that knows where it ended up, and it already
      // holds the warden it serves — so it tells it, rather than making the
      // host carry the address from one to the other.
      const road = hint ?? `http://${host}:${at.port}`;
      warden.publish(road);
      resolve({
        server,
        hint: road,
        // A caller keeps its connection alive between messages, so closing the
        // door means dropping those sockets too: a `close` that waits for the
        // last idle keep-alive to time out is a door that never shuts.
        close: () =>
          new Promise((done) => {
            warden.retract(road);
            server.close(done);
            server.closeAllConnections();
          }),
      });
    });
  });
}
