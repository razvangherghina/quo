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
export function serve(warden, { clock, random, host = '127.0.0.1', port = 0, limit = null }) {
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
      resolve({
        server,
        hint: `http://${host}:${at.port}`,
        // A caller keeps its connection alive between messages, so closing the
        // door means dropping those sockets too: a `close` that waits for the
        // last idle keep-alive to time out is a door that never shuts.
        close: () =>
          new Promise((done) => {
            server.close(done);
            server.closeAllConnections();
          }),
      });
    });
  });
}
