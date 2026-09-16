// The six algorithms of Quo, over node:crypto.
import * as c from "node:crypto";
import { verify as edVerify } from "./ed25519.js";

const X_PRIV = Buffer.from("302e020100300506032b656e04220420", "hex");
const X_PUB = Buffer.from("302a300506032b656e032100", "hex");
const ED_PRIV = Buffer.from("302e020100300506032b657004220420", "hex");

export const ZERO32 = Buffer.alloc(32);
export const SIZE = 1048576;

export const draw = (n) => c.randomBytes(n);
export const sha256 = (b) => c.createHash("sha256").update(b).digest();
export const hex = (b) => Buffer.from(b).toString("hex");
export const isHex = (s, len) => typeof s === "string" && s.length === len && /^[0-9a-f]*$/.test(s);
export const fromHex = (s) => Buffer.from(s, "hex");

// HKDF-SHA-256 with the zero-length salt and the label's ASCII bytes as info.
export const hkdf = (ikm, label, len) =>
  Buffer.from(c.hkdfSync("sha256", ikm, Buffer.alloc(0), Buffer.from(label, "ascii"), len));

// X25519. A scalar is taken raw; the function clamps it.
export function xSecret(scalar) {
  const key = c.createPrivateKey({ key: Buffer.concat([X_PRIV, scalar]), format: "der", type: "pkcs8" });
  const pub = Buffer.from(c.createPublicKey(key).export({ format: "jwk" }).x, "base64url");
  return { key, pub };
}

// The agreement, or the zero bytes when the public key is of small order.
export function agree(secret, pub) {
  try {
    const pk = c.createPublicKey({ key: Buffer.concat([X_PUB, pub]), format: "der", type: "spki" });
    return c.diffieHellman({ privateKey: secret.key, publicKey: pk });
  } catch {
    return Buffer.from(ZERO32);
  }
}

export const isZero = (b) => b.every((x) => x === 0);

// Ed25519 from the 32-byte RFC 8032 private key.
export function edSecret(seed) {
  const key = c.createPrivateKey({ key: Buffer.concat([ED_PRIV, seed]), format: "der", type: "pkcs8" });
  const pub = Buffer.from(c.createPublicKey(key).export({ format: "jwk" }).x, "base64url");
  return { key, pub, seed: Buffer.from(seed) };
}
export const sign = (secret, msg) => c.sign(null, msg, secret.key);
export const verify = (pub, msg, sig) => edVerify(pub, msg, sig);

// AES-256-GCM under forty-four HKDF bytes: key then nonce. Tag rides at the end.
export function seal(k44, plain, aad) {
  const ci = c.createCipheriv("aes-256-gcm", k44.subarray(0, 32), k44.subarray(32, 44));
  ci.setAAD(aad);
  return Buffer.concat([ci.update(plain), ci.final(), ci.getAuthTag()]);
}
export function open(k44, sealed, aad) {
  if (sealed.length < 16) return null;
  try {
    const de = c.createDecipheriv("aes-256-gcm", k44.subarray(0, 32), k44.subarray(32, 44));
    de.setAAD(aad);
    de.setAuthTag(sealed.subarray(sealed.length - 16));
    return Buffer.concat([de.update(sealed.subarray(0, sealed.length - 16)), de.final()]);
  } catch {
    return null;
  }
}

// ML-KEM-768.
export const makeLock = () => c.generateKeyPairSync("ml-kem-768");
// FIPS 203's check of an encapsulation key: every 12-bit coefficient below q, and the length.
export function lockOk(ek) {
  if (ek.length !== 1184) return false;
  for (let j = 0; j < 1152; j += 3) {
    if ((ek[j] | ((ek[j + 1] & 0x0f) << 8)) >= 3329) return false;
    if (((ek[j + 1] >> 4) | (ek[j + 2] << 4)) >= 3329) return false;
  }
  return true;
}
export const lockPub =(lock) => lock.publicKey.export({ format: "raw-public" });
export function encapsulate(ek) {
  const pk = c.createPublicKey({ key: ek, format: "raw-public", asymmetricKeyType: "ml-kem-768" });
  const r = c.encapsulate(pk);
  return { ct: Buffer.from(r.ciphertext), ss: Buffer.from(r.sharedKey) };
}
export function decapsulate(lock, ct) {
  try {
    return Buffer.from(c.decapsulate(lock.privateKey, ct));
  } catch {
    return null;
  }
}
