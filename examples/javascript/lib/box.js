// Sealing and opening every box of SPEC.md.
import { agree, draw, xSecret, hkdf, seal, open, isZero, sign, encapsulate, ZERO32, SIZE } from "./crypto.js";

export const CT_LEN = 1088;
export const edgeSealKey = (a, edge) => hkdf(Buffer.concat([a, edge]), "quo-edge-seal", 44);
export const follow = (edge, agreement) => hkdf(Buffer.concat([edge, agreement]), "quo-edge", 32);
export const knockEdge = (ss) => hkdf(ss, "quo-lock", 32);

// A fresh ephemeral key that takes a seal with `pub`.
export function ephemeralTo(pub) {
  const eph = xSecret(draw(32));
  const a = agree(eph, pub);
  if (isZero(a)) return null;
  return { eph, a };
}

// An ask's box. `lockEk` present makes it a knock; its edge key is then the knock's.
// Returns { box, lid (the ephemeral secret), edge (the edge key it was sent under) }.
export function sealAsk({ padlock, head, edge, lockEk, payload, signer }) {
  const e = ephemeralTo(padlock);
  if (!e) throw new Error("padlock takes no seal");
  const lid = e.eph.pub;
  const sealedHead = seal(hkdf(e.a, "quo-seal", 44), head, lid);
  let ct = Buffer.alloc(0);
  if (lockEk) {
    const k = encapsulate(lockEk);
    ct = k.ct;
    edge = knockEdge(k.ss);
  }
  const body = Buffer.concat([payload, sign(signer, payload)]);
  const sealedBody = seal(edgeSealKey(e.a, edge), body, lid);
  return { box: Buffer.concat([lid, sealedHead, ct, sealedBody]), lidSecret: e.eph, edge };
}

// A reply's box, sealed to `lid`. Returns the box and the reply's agreement.
export function sealReply({ lid, text, signer }) {
  const e = ephemeralTo(lid);
  if (!e) throw new Error("lid takes no seal");
  const body = Buffer.concat([text, sign(signer, text)]);
  return { box: Buffer.concat([e.eph.pub, seal(hkdf(e.a, "quo-seal", 44), body, e.eph.pub)]), agreement: e.a };
}

// A lid nobody holds.
export function nobodyLid() {
  const r = draw(32);
  if (ephemeralTo(r)) return r;
  return xSecret(draw(32)).pub;
}

// Opens a reply box with the lid's secret. Returns { text, sig, agreement } or null.
export function openReply(box, lidSecret) {
  if (box.length > SIZE || box.length < 32 + 16 + 64) return null;
  const pk = box.subarray(0, 32);
  const a = agree(lidSecret, pk);
  if (isZero(a)) return null;
  const body = open(hkdf(a, "quo-seal", 44), box.subarray(32), pk);
  if (!body || body.length < 64) return null;
  return { text: body.subarray(0, body.length - 64), sig: body.subarray(body.length - 64), agreement: a };
}

export { ZERO32 };
