//! The arithmetic: the four algorithms Quo names once and never negotiates.
//! Article VI of the constitution is the whole specification.
//!
//! Ed25519 signs, X25519 seals, SHA-256 commits, and AES-256-GCM encrypts
//! under a key derived through HKDF-SHA-256 with a fixed label. There is no
//! suite identifier and no negotiation, so nothing here is a parameter.

const std = @import("std");

const Sha256 = std.crypto.hash.sha2.Sha256;
const Ed25519 = std.crypto.sign.Ed25519;
const X25519 = std.crypto.dh.X25519;
const Aes256Gcm = std.crypto.aead.aes_gcm.Aes256Gcm;
const Hkdf = std.crypto.kdf.hkdf.HkdfSha256;

/// Every refusal this module can make. A caller learns that the arithmetic
/// said no, never which internal predicate said it.
pub const Error = error{Refused};

/// A key is 32 bytes. Any prettier spelling of one is a kit's convenience.
pub const key_length = 32;
pub const signature_length = Ed25519.Signature.encoded_length;
pub const nonce_length = Aes256Gcm.nonce_length;
/// The tag is sixteen bytes, full length, and it is the last sixteen bytes
/// of the box.
pub const tag_length = Aes256Gcm.tag_length;

/// The label and the info are one constant, not two.
pub const seal_info = "quo-seal";
/// An empty salt: a salt of zero length, not a run of zero bytes.
pub const seal_salt = "";

pub const Key = [key_length]u8;
pub const Signature = [signature_length]u8;
pub const Nonce = [nonce_length]u8;

/// SHA-256 commits.
pub fn hash(bytes: []const u8) Key {
    var digest: Key = undefined;
    Sha256.hash(bytes, &digest, .{});
    return digest;
}

/// A commitment is the hash of the pk of the warden the heir would spend at,
/// then the heir's pk, each thirty-two bytes, concatenated in that order.
pub fn commitment(warden: Key, heir: Key) Key {
    var both: [key_length * 2]u8 = undefined;
    both[0..key_length].* = warden;
    both[key_length..][0..key_length].* = heir;
    return hash(&both);
}

/// A signing pair. The secret is the thirty-two-byte seed it was minted
/// from, as Ed25519 defines it.
pub const SigningPair = struct {
    public: Key,
    secret: Key,
};

/// Ed25519 signs. The public key is derived by the algorithm's own rules.
pub fn signingPair(seed: Key) Error!SigningPair {
    const pair = Ed25519.KeyPair.generateDeterministic(seed) catch return Error.Refused;
    return .{ .public = pair.public_key.toBytes(), .secret = seed };
}

/// Signatures are deterministic: no noise is drawn, because a draw of
/// randomness is taken as an argument and this algorithm asks for none.
pub fn sign(seed: Key, message: []const u8) Error!Signature {
    const pair = Ed25519.KeyPair.generateDeterministic(seed) catch return Error.Refused;
    const signature = pair.sign(message, null) catch return Error.Refused;
    return signature.toBytes();
}

/// The eight small-order points' encodings — the identity, the point of order
/// two, the two of order four (the all-zero key among them) and the four of
/// order eight — written out as constants so no kit reimplements the
/// arithmetic to comply. A signature under one of these binds to no secret.
const small_order = [8]Key{
    .{ 0x01, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
    .{ 0xec, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x7f },
    .{ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 },
    .{ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x80 },
    .{ 0x26, 0xe8, 0x95, 0x8f, 0xc2, 0xb2, 0x27, 0xb0, 0x45, 0xc3, 0xf4, 0x89, 0xf2, 0xef, 0x98, 0xf0, 0xd5, 0xdf, 0xac, 0x05, 0xd3, 0xc6, 0x33, 0x39, 0xb1, 0x38, 0x02, 0x88, 0x6d, 0x53, 0xfc, 0x05 },
    .{ 0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76, 0x0d, 0x10, 0x67, 0x0f, 0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6, 0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0x7a },
    .{ 0x26, 0xe8, 0x95, 0x8f, 0xc2, 0xb2, 0x27, 0xb0, 0x45, 0xc3, 0xf4, 0x89, 0xf2, 0xef, 0x98, 0xf0, 0xd5, 0xdf, 0xac, 0x05, 0xd3, 0xc6, 0x33, 0x39, 0xb1, 0x38, 0x02, 0x88, 0x6d, 0x53, 0xfc, 0x85 },
    .{ 0xc7, 0x17, 0x6a, 0x70, 0x3d, 0x4d, 0xd8, 0x4f, 0xba, 0x3c, 0x0b, 0x76, 0x0d, 0x10, 0x67, 0x0f, 0x2a, 0x20, 0x53, 0xfa, 0x2c, 0x39, 0xcc, 0xc6, 0x4e, 0xc7, 0xfd, 0x77, 0x92, 0xac, 0x03, 0xfa },
};

/// Whether this public key is all zeros or of small order, which is the one
/// named pre-check verification makes.
pub fn smallOrder(pk: Key) bool {
    for (small_order) |point| {
        if (std.mem.eql(u8, &point, &pk)) return true;
    }
    return false;
}

/// Before RFC 8032's check stands one named refusal: **a public key that is
/// all zeros or of small order is silence, no signature examined.** The
/// pre-check stands in front of whatever verifier the platform supplies; a
/// stricter platform refuses more, which stays legal.
pub fn verify(voice: Key, message: []const u8, signature: Signature) Error!void {
    if (smallOrder(voice)) return Error.Refused;
    const public_key = Ed25519.PublicKey.fromBytes(voice) catch return Error.Refused;
    Ed25519.Signature.fromBytes(signature).verify(message, public_key) catch return Error.Refused;
}

/// A sealing pair. The secret is the private key itself, as X25519 defines
/// it; clamping happens inside the algorithm and nothing is derived from a
/// seed first.
pub const SealingPair = struct {
    public: Key,
    secret: Key,
};

/// X25519 seals. A padlock is one of these public keys.
pub fn sealingPair(secret: Key) Error!SealingPair {
    const public = X25519.recoverPublicKey(secret) catch return Error.Refused;
    return .{ .public = public, .secret = secret };
}

/// The agreement, which is the same from either side.
///
/// **An agreement that hands back thirty-two zero bytes is refused at the
/// point of agreement**: the padlock was not a real key, and a seal derived
/// from it would protect nothing. `std.crypto`'s own scalarmult is where that
/// refusal happens — it returns `error.IdentityElement` rather than the
/// degenerate output — so this kit says it once and does not say it twice.
/// The bench feeds it the degenerate input and holds that it said it, because
/// a refusal nobody has watched is not a refusal anyone should trust.
pub fn agree(secret: Key, public: Key) Error!Key {
    return X25519.scalarmult(secret, public) catch Error.Refused;
}

/// What one agreement draws: thirty-two bytes of key, then twelve of nonce.
pub const Sealing = struct {
    key: Key,
    nonce: Nonce,
};

/// HKDF-SHA-256 used whole — extract, then expand — over the raw
/// thirty-two-byte shared secret exactly as the agreement hands it back.
pub fn derive(shared: Key) Sealing {
    const prk = Hkdf.extract(seal_salt, &shared);
    var drawn: [key_length + nonce_length]u8 = undefined;
    Hkdf.expand(&drawn, seal_info, prk);
    return .{
        .key = drawn[0..key_length].*,
        .nonce = drawn[key_length..][0..nonce_length].*,
    };
}

/// The length of the box a plaintext of this length seals into: ciphertext
/// first, tag after it.
pub fn boxLength(plaintext_length: usize) usize {
    return plaintext_length + tag_length;
}

/// AES-256-GCM encrypts, with the ephemeral public key as the additional
/// authenticated data. `box` is `boxLength(plaintext.len)` bytes.
pub fn seal(box: []u8, shared: Key, additional: []const u8, plaintext: []const u8) void {
    std.debug.assert(box.len == boxLength(plaintext.len));
    const sealing = derive(shared);
    Aes256Gcm.encrypt(
        box[0..plaintext.len],
        box[plaintext.len..][0..tag_length],
        plaintext,
        additional,
        sealing.nonce,
        sealing.key,
    );
}

/// The inverse. `plaintext` is `box.len - tag_length` bytes, and a box
/// shorter than the tag is refused outright.
pub fn open(plaintext: []u8, shared: Key, additional: []const u8, box: []const u8) Error!void {
    if (box.len < tag_length) return Error.Refused;
    std.debug.assert(plaintext.len == box.len - tag_length);
    const sealing = derive(shared);
    Aes256Gcm.decrypt(
        plaintext,
        box[0..plaintext.len],
        box[plaintext.len..][0..tag_length].*,
        additional,
        sealing.nonce,
        sealing.key,
    ) catch return Error.Refused;
}
