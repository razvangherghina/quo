//! A kit of Quo in Zig: the ward key, the lock, the box, values, the door and the standing.
const std = @import("std");
const Allocator = std.mem.Allocator;
const crypto = std.crypto;
const Ed25519 = crypto.sign.Ed25519;
const Edwards25519 = crypto.ecc.Edwards25519;
const X25519 = crypto.dh.X25519;
const Sha256 = crypto.hash.sha2.Sha256;
const Sha512 = crypto.hash.sha2.Sha512;
const Aes256Gcm = crypto.aead.aes_gcm.Aes256Gcm;
const HkdfSha256 = crypto.kdf.hkdf.HkdfSha256;
pub const MLKem = crypto.kem.ml_kem.MLKem768;
pub const KeyPair = Ed25519.KeyPair;

pub const size_limit: usize = 1_048_576;
pub const ct_len: usize = 1088;
pub const ek_len: usize = 1184;
pub const max_count: u64 = 9_007_199_254_740_991;
pub const zero32 = [_]u8{0} ** 32;
pub const silence_text = "{\"silence\":true}";

// ---------------------------------------------------------------- drawn bytes

/// Every drawn byte. The system's generator, or a fixed stream for the kit's own tests.
pub const Entropy = struct {
    fixed: bool = false,
    state: u64 = 0,

    pub fn fill(self: *Entropy, buf: []u8) void {
        if (!self.fixed) {
            std.c.arc4random_buf(buf.ptr, buf.len);
            return;
        }
        for (buf) |*b| {
            self.state +%= 0x9e3779b97f4a7c15;
            var z = self.state;
            z = (z ^ (z >> 30)) *% 0xbf58476d1ce4e5b9;
            z = (z ^ (z >> 27)) *% 0x94d049bb133111eb;
            b.* = @truncate(z ^ (z >> 31));
        }
    }

    pub fn bytes(self: *Entropy, comptime n: usize) [n]u8 {
        var out: [n]u8 = undefined;
        self.fill(&out);
        return out;
    }
};

// ---------------------------------------------------------------- derivation

pub fn hkdf(out: []u8, ikm: []const u8, label: []const u8) void {
    const prk = HkdfSha256.extract("", ikm);
    HkdfSha256.expand(out, label, prk);
}

fn cat(a: [32]u8, b: [32]u8) [64]u8 {
    var out: [64]u8 = undefined;
    out[0..32].* = a;
    out[32..64].* = b;
    return out;
}

/// `follow(E)`: the edge key after a reply whose agreement is `agreement`.
pub fn follow(edge: [32]u8, agreement: [32]u8) [32]u8 {
    var out: [32]u8 = undefined;
    const ikm = cat(edge, agreement);
    hkdf(&out, &ikm, "quo-edge");
    return out;
}

/// A knock's edge key from its shared secret.
pub fn knockEdge(shared: [32]u8) [32]u8 {
    var out: [32]u8 = undefined;
    hkdf(&out, &shared, "quo-lock");
    return out;
}

pub const WardKeys = struct {
    sign: KeyPair,
    scalar: [32]u8,
    padlock: [32]u8,

    pub fn fromSeed(seed: [32]u8) WardKeys {
        var sign_seed: [32]u8 = undefined;
        hkdf(&sign_seed, &seed, "quo-ward-sign");
        var scalar: [32]u8 = undefined;
        hkdf(&scalar, &seed, "quo-ward-seal");
        return .{
            .sign = KeyPair.generateDeterministic(sign_seed) catch unreachable,
            .scalar = scalar,
            .padlock = X25519.recoverPublicKey(scalar) catch unreachable,
        };
    }

    /// Thirty-two bytes are the seed; any other length is hashed first.
    pub fn fromBytes(b: []const u8) WardKeys {
        if (b.len == 32) return fromSeed(b[0..32].*);
        return fromText(b);
    }

    /// Text is hashed as its UTF-8 bytes, whatever its length.
    pub fn fromText(text: []const u8) WardKeys {
        var h: [32]u8 = undefined;
        Sha256.hash(text, &h, .{});
        return fromSeed(h);
    }

    pub fn raw(self: WardKeys) [64]u8 {
        return cat(self.sign.public_key.toBytes(), self.padlock);
    }

    pub fn wardPk(self: WardKeys) [128]u8 {
        return std.fmt.bytesToHex(self.raw(), .lower);
    }
};

pub fn keyFrom(secret: [32]u8) KeyPair {
    return KeyPair.generateDeterministic(secret) catch unreachable;
}

pub fn sign(kp: KeyPair, msg: []const u8) [64]u8 {
    return (kp.sign(msg, null) catch unreachable).toBytes();
}

// ---------------------------------------------------------------- the check

/// The cofactorless check `[s]B = R + [k]A`, failing where SPEC.md lists and nowhere else.
pub fn verify(pk: [32]u8, msg: []const u8, sig: []const u8) bool {
    if (sig.len != 64) return false;
    const r_bytes = sig[0..32].*;
    const s = sig[32..64].*;
    Edwards25519.scalar.rejectNonCanonical(s) catch return false;
    const r = Edwards25519.fromBytes(r_bytes) catch return false;
    if (!std.mem.eql(u8, &r.toBytes(), &r_bytes)) return false;
    Edwards25519.rejectNonCanonical(pk) catch return false;
    const a = Edwards25519.fromBytes(pk) catch return false;
    if (isIdentity(a.clearCofactor())) return false;
    var h = Sha512.init(.{});
    h.update(&r_bytes);
    h.update(&pk);
    h.update(msg);
    var hram: [64]u8 = undefined;
    h.final(&hram);
    const k = Edwards25519.scalar.reduce64(hram);
    const p = Edwards25519.basePoint.mulDoubleBasePublic(s, a.neg(), k) catch return false;
    return std.mem.eql(u8, &p.toBytes(), &r_bytes);
}

fn isIdentity(p: Edwards25519) bool {
    return p.x.isZero() and p.y.equivalent(p.z);
}

// ---------------------------------------------------------------- the cipher

fn keyNonce(ikm: []const u8, label: []const u8) [44]u8 {
    var out: [44]u8 = undefined;
    hkdf(&out, ikm, label);
    return out;
}

/// Writes plain.len + 16 bytes into out.
pub fn seal(out: []u8, plain: []const u8, ikm: []const u8, label: []const u8, aad: []const u8) void {
    const kn = keyNonce(ikm, label);
    Aes256Gcm.encrypt(out[0..plain.len], out[plain.len..][0..16], plain, aad, kn[32..44].*, kn[0..32].*);
}

/// Opens sealed into out, sealed.len - 16 bytes.
pub fn open(out: []u8, sealed: []const u8, ikm: []const u8, label: []const u8, aad: []const u8) bool {
    if (sealed.len < 16) return false;
    const n = sealed.len - 16;
    const kn = keyNonce(ikm, label);
    Aes256Gcm.decrypt(out[0..n], sealed[0..n], sealed[n..][0..16].*, aad, kn[32..44].*, kn[0..32].*) catch return false;
    return true;
}

/// An agreement, or null where it is thirty-two zero bytes.
pub fn agree(secret: [32]u8, public: [32]u8) ?[32]u8 {
    return X25519.scalarmult(secret, public) catch null;
}

/// A public key takes no seal when it is a point of small order.
pub fn takesNoSeal(public: [32]u8) bool {
    return agree([_]u8{0x55} ** 32, public) == null;
}

/// Seals an ask (ct null) or a knock (ct set) to a padlock.
pub fn sealAsk(a: Allocator, padlock: [32]u8, lid_secret: [32]u8, head: [32]u8, ct: ?*const [ct_len]u8, edge: [32]u8, payload: []const u8, sig: [64]u8) ![]u8 {
    const lid = try X25519.recoverPublicKey(lid_secret);
    const ag = agree(lid_secret, padlock) orelse return error.NoSeal;
    const extra: usize = if (ct != null) ct_len else 0;
    const out = try a.alloc(u8, 80 + extra + payload.len + 64 + 16);
    out[0..32].* = lid;
    seal(out[32..80], &head, &ag, "quo-seal", &lid);
    var at: usize = 80;
    if (ct) |c| {
        @memcpy(out[at..][0..ct_len], c);
        at += ct_len;
    }
    const body = try a.alloc(u8, payload.len + 64);
    defer a.free(body);
    @memcpy(body[0..payload.len], payload);
    body[payload.len..][0..64].* = sig;
    const ikm = cat(ag, edge);
    seal(out[at..], body, &ikm, "quo-edge-seal", &lid);
    return out;
}

/// Seals a reply text to a lid under a fresh ephemeral key, signed by the ward.
pub fn sealReply(a: Allocator, ent: *Entropy, signer: KeyPair, lid: [32]u8, text: []const u8) !struct { box: []u8, agreement: [32]u8 } {
    const eph = ent.bytes(32);
    const ag = agree(eph, lid) orelse return error.NoSeal;
    const eph_pk = try X25519.recoverPublicKey(eph);
    const body = try a.alloc(u8, text.len + 64);
    defer a.free(body);
    @memcpy(body[0..text.len], text);
    // The signature is over the lid this reply is sealed to, then the reply text.
    const signed = try a.alloc(u8, 32 + text.len);
    defer a.free(signed);
    signed[0..32].* = lid;
    @memcpy(signed[32..], text);
    body[text.len..][0..64].* = sign(signer, signed);
    const out = try a.alloc(u8, 32 + body.len + 16);
    out[0..32].* = eph_pk;
    seal(out[32..], body, &ag, "quo-seal", &eph_pk);
    return .{ .box = out, .agreement = ag };
}

/// Opens a reply with the lid's secret and checks the ward's signature. Null reads as silence.
pub fn openReply(a: Allocator, lid_secret: [32]u8, box: []const u8, ward_sign_pk: [32]u8) !?struct { text: []u8, agreement: [32]u8 } {
    if (box.len > size_limit or box.len < 32 + 16 + 64) return null;
    const eph = box[0..32].*;
    const ag = agree(lid_secret, eph) orelse return null;
    const body = try a.alloc(u8, box.len - 48);
    if (!open(body, box[32..], &ag, "quo-seal", &eph)) return null;
    const text = body[0 .. body.len - 64];
    // The signature is checked over the lid of this ask, then the reply text.
    const signed = try a.alloc(u8, 32 + text.len);
    defer a.free(signed);
    signed[0..32].* = X25519.recoverPublicKey(lid_secret) catch return null;
    @memcpy(signed[32..], text);
    if (!verify(ward_sign_pk, signed, body[body.len - 64 ..])) return null;
    return .{ .text = text, .agreement = ag };
}

// ---------------------------------------------------------------- values

pub const Json = struct {
    pub const Kind = enum { null, boolean, number, string, array, object };
    pub const Node = struct {
        kind: Kind,
        raw: []const u8,
        /// The string a string token denotes, escapes read. Set on the levels read.
        str: []const u8 = "",
        /// An object's keys and values, or an array's items. Set on the levels read.
        items: []Node = &.{},
        keys: []Node = &.{},

        pub fn get(self: Node, key: []const u8) ?Node {
            if (self.kind != .object) return null;
            for (self.keys, 0..) |k, i| {
                if (std.mem.eql(u8, k.str, key)) return self.items[i];
            }
            return null;
        }
    };
    pub const Error = error{ NotUtf8, NotJson, Duplicate, OutOfMemory };

    /// Parses JSON text of RFC 8259. The outer `levels` of containers are read into nodes
    /// and refuse two keys of one name. Deeper, the text is only held to the grammar, at
    /// any depth, and carried as written.
    pub fn parse(a: Allocator, s: []const u8, levels: u32) Error!Node {
        if (!std.unicode.utf8ValidateSlice(s)) return error.NotUtf8;
        var p: Parser = .{ .a = a, .s = s };
        const n = try p.value(levels);
        p.ws();
        if (p.i != s.len) return error.NotJson;
        return n;
    }

    const Parser = struct {
        a: Allocator,
        s: []const u8,
        i: usize = 0,

        fn ws(p: *Parser) void {
            while (p.i < p.s.len) : (p.i += 1) switch (p.s[p.i]) {
                ' ', '\t', '\n', '\r' => {},
                else => return,
            };
        }

        fn lit(p: *Parser, word: []const u8) Error!void {
            if (!std.mem.startsWith(u8, p.s[p.i..], word)) return error.NotJson;
            p.i += word.len;
        }

        fn peek(p: *Parser) Error!u8 {
            if (p.i >= p.s.len) return error.NotJson;
            return p.s[p.i];
        }

        fn expect(p: *Parser, c: u8) Error!void {
            p.ws();
            if (try p.peek() != c) return error.NotJson;
            p.i += 1;
        }

        fn value(p: *Parser, levels: u32) Error!Node {
            p.ws();
            const start = p.i;
            switch (try p.peek()) {
                '{', '[' => |open_c| {
                    if (levels == 0) return p.skip();
                    const close_c: u8 = if (open_c == '{') '}' else ']';
                    p.i += 1;
                    var keys: std.ArrayList(Node) = .empty;
                    var vals: std.ArrayList(Node) = .empty;
                    var names: std.StringHashMapUnmanaged(void) = .empty;
                    p.ws();
                    if (try p.peek() == close_c) {
                        p.i += 1;
                    } else while (true) {
                        if (open_c == '{') {
                            p.ws();
                            if (try p.peek() != '"') return error.NotJson;
                            const k = try p.string(true);
                            if ((try names.getOrPut(p.a, k.str)).found_existing) return error.Duplicate;
                            try keys.append(p.a, k);
                            try p.expect(':');
                        }
                        try vals.append(p.a, try p.value(levels - 1));
                        p.ws();
                        const c = try p.peek();
                        p.i += 1;
                        if (c == ',') continue;
                        if (c == close_c) break;
                        return error.NotJson;
                    }
                    const kind: Kind = if (open_c == '{') .object else .array;
                    return .{ .kind = kind, .raw = p.s[start..p.i], .keys = keys.items, .items = vals.items };
                },
                '"' => return p.string(true),
                else => return p.scalar(),
            }
        }

        fn scalar(p: *Parser) Error!Node {
            const start = p.i;
            const kind: Kind = switch (try p.peek()) {
                't' => blk: {
                    try p.lit("true");
                    break :blk .boolean;
                },
                'f' => blk: {
                    try p.lit("false");
                    break :blk .boolean;
                },
                'n' => blk: {
                    try p.lit("null");
                    break :blk .null;
                },
                '-', '0'...'9' => blk: {
                    try p.number();
                    break :blk .number;
                },
                else => return error.NotJson,
            };
            return .{ .kind = kind, .raw = p.s[start..p.i] };
        }

        /// Holds a container to the grammar without recursion, at any depth.
        fn skip(p: *Parser) Error!Node {
            const start = p.i;
            const kind: Kind = if (p.s[p.i] == '{') .object else .array;
            var stack: std.ArrayList(u8) = .empty;
            defer stack.deinit(p.a);
            while (true) {
                // A value is owed here.
                p.ws();
                const c = try p.peek();
                switch (c) {
                    '{', '[' => {
                        p.i += 1;
                        try stack.append(p.a, if (c == '{') '}' else ']');
                        p.ws();
                        if (try p.peek() == stack.items[stack.items.len - 1]) {
                            p.i += 1;
                            _ = stack.pop();
                        } else if (c == '{') {
                            try p.key();
                            continue;
                        } else continue;
                    },
                    '"' => _ = try p.string(false),
                    else => _ = try p.scalar(),
                }
                // A value ended: close what ends here, or go on to the next member.
                while (stack.items.len > 0) {
                    p.ws();
                    const d = try p.peek();
                    p.i += 1;
                    const top = stack.items[stack.items.len - 1];
                    if (d == ',') {
                        if (top == '}') try p.key();
                        break;
                    }
                    if (d != top) return error.NotJson;
                    _ = stack.pop();
                }
                if (stack.items.len == 0) return .{ .kind = kind, .raw = p.s[start..p.i] };
            }
        }

        fn key(p: *Parser) Error!void {
            p.ws();
            if (try p.peek() != '"') return error.NotJson;
            _ = try p.string(false);
            try p.expect(':');
        }

        fn digits(p: *Parser) usize {
            const b = p.i;
            while (p.i < p.s.len and p.s[p.i] >= '0' and p.s[p.i] <= '9') p.i += 1;
            return p.i - b;
        }

        fn number(p: *Parser) Error!void {
            if (p.s[p.i] == '-') p.i += 1;
            if (try p.peek() == '0') {
                p.i += 1;
            } else if (p.digits() == 0) return error.NotJson;
            if (p.i < p.s.len and p.s[p.i] == '.') {
                p.i += 1;
                if (p.digits() == 0) return error.NotJson;
            }
            if (p.i < p.s.len and (p.s[p.i] == 'e' or p.s[p.i] == 'E')) {
                p.i += 1;
                if (p.i < p.s.len and (p.s[p.i] == '+' or p.s[p.i] == '-')) p.i += 1;
                if (p.digits() == 0) return error.NotJson;
            }
        }

        fn hex4(p: *Parser) Error!u16 {
            if (p.i + 4 > p.s.len) return error.NotJson;
            for (p.s[p.i..][0..4]) |c| if (!std.ascii.isHex(c)) return error.NotJson;
            const v = std.fmt.parseInt(u16, p.s[p.i..][0..4], 16) catch return error.NotJson;
            p.i += 4;
            return v;
        }

        /// A string token. With `decode`, the string it denotes: a lone surrogate is kept
        /// as its own three bytes, so two different escapes never read as one name.
        fn string(p: *Parser, decode: bool) Error!Node {
            const start = p.i;
            p.i += 1;
            var buf: std.ArrayList(u8) = .empty;
            while (true) {
                const run = p.i;
                while (p.i < p.s.len and p.s[p.i] != '"' and p.s[p.i] != '\\' and p.s[p.i] >= 0x20) p.i += 1;
                if (decode) try buf.appendSlice(p.a, p.s[run..p.i]);
                const c = try p.peek();
                if (c == '"') {
                    p.i += 1;
                    break;
                }
                if (c < 0x20) return error.NotJson;
                p.i += 1;
                const e = try p.peek();
                p.i += 1;
                const byte: u8 = switch (e) {
                    '"', '\\', '/' => e,
                    'b' => 8,
                    'f' => 12,
                    'n' => '\n',
                    'r' => '\r',
                    't' => '\t',
                    'u' => {
                        const u = try p.hex4();
                        var cp: u21 = u;
                        if (u >= 0xD800 and u <= 0xDBFF and p.i + 6 <= p.s.len and p.s[p.i] == '\\' and p.s[p.i + 1] == 'u') {
                            const save = p.i;
                            p.i += 2;
                            const lo = try p.hex4();
                            if (lo >= 0xDC00 and lo <= 0xDFFF) {
                                cp = 0x10000 + ((@as(u21, u) - 0xD800) << 10) + (lo - 0xDC00);
                            } else p.i = save;
                        }
                        if (decode) {
                            var tmp: [4]u8 = undefined;
                            const n = std.unicode.wtf8Encode(cp, &tmp) catch unreachable;
                            try buf.appendSlice(p.a, tmp[0..n]);
                        }
                        continue;
                    },
                    else => return error.NotJson,
                };
                if (decode) try buf.append(p.a, byte);
            }
            return .{ .kind = .string, .raw = p.s[start..p.i], .str = buf.items };
        }
    };
};

/// A count number: an integer from 1 to 2^53 - 1, no fraction and no exponent.
pub fn countNumber(n: Json.Node) ?u64 {
    if (n.kind != .number) return null;
    for (n.raw) |c| if (!std.ascii.isDigit(c)) return null;
    if (n.raw.len > 16) return null;
    const v = std.fmt.parseInt(u64, n.raw, 10) catch return null;
    if (v < 1 or v > max_count) return null;
    return v;
}

pub fn isLowerHex(s: []const u8, len: usize) bool {
    if (s.len != len) return false;
    for (s) |c| switch (c) {
        '0'...'9', 'a'...'f' => {},
        else => return false,
    };
    return true;
}

/// A pk in a payload: sixty-four lowercase hex, not all zero.
fn pkOf(n: Json.Node) ?[32]u8 {
    if (n.kind != .string or !isLowerHex(n.str, 64)) return null;
    var out: [32]u8 = undefined;
    _ = std.fmt.hexToBytes(&out, n.str) catch return null;
    if (std.mem.eql(u8, &out, &zero32)) return null;
    return out;
}

/// Writes JSON text with the whitespace between tokens taken out.
pub fn writeCompact(w: *std.Io.Writer, raw: []const u8) !void {
    var in_str = false;
    var esc = false;
    var run: usize = 0;
    for (raw, 0..) |c, i| {
        if (in_str) {
            if (esc) {
                esc = false;
            } else if (c == '\\') {
                esc = true;
            } else if (c == '"') in_str = false;
            continue;
        }
        switch (c) {
            '"' => in_str = true,
            ' ', '\t', '\n', '\r' => {
                try w.writeAll(raw[run..i]);
                run = i + 1;
            },
            else => {},
        }
    }
    try w.writeAll(raw[run..]);
}

// ---------------------------------------------------------------- what answers behind a door

pub const Reach = enum {
    echo,
    marked,
    null_,
    silent,

    pub fn fromName(s: []const u8) ?Reach {
        const names = [_]struct { []const u8, Reach }{ .{ "echo", .echo }, .{ "marked", .marked }, .{ "null", .null_ }, .{ "silent", .silent } };
        for (names) |n| if (std.mem.eql(u8, s, n[0])) return n[1];
        return null;
    }
};

const describe_none = "{\"asks\":[]}";

/// What answers behind the door: a reply text, or null for a chosen silence.
fn behind(a: Allocator, reach: Reach, named: bool, args: ?Json.Node) !?[]const u8 {
    const object: []const u8 = switch (reach) {
        .silent => return null,
        // The describe every reach but silent gives the empty ask: no entry, no lang.
        .null_ => if (named) "null" else describe_none,
        .echo, .marked => blk: {
            if (!named) break :blk describe_none;
            const ar = args orelse break :blk "{}";
            // This kit does not read `args` whose own keys repeat a name: silence, by choice.
            _ = Json.parse(a, ar.raw, 1) catch |e| switch (e) {
                error.OutOfMemory => return e,
                else => return null,
            };
            break :blk ar.raw;
        },
    };
    const seen = if (reach == .marked and named) "\"1\"" else "null";
    return try std.fmt.allocPrint(a, "{{\"object\":{s},\"seen\":{s}}}", .{ object, seen });
}

// ---------------------------------------------------------------- the door

pub const Heir = struct {
    pk: [32]u8,
    reach: Reach,
    fresh: bool = true,
    /// The door stopped holding it while spent: its keys are the keys kept at removal.
    removed: bool = false,
    held: [32]u8 = zero32,
    vouched: ?[32]u8 = null,
    open: [32]u8 = zero32,
    offered: [32]u8 = zero32,
    highest: u64 = 0,
};

/// The modulus check of FIPS 203 section 7.2: ByteEncode12(ByteDecode12(ek)) == ek,
/// which holds when each of the 768 twelve-bit coefficients of the first 1152 bytes
/// is below q = 3329.
pub fn lockPasses(ek: *const [ek_len]u8) bool {
    var at: usize = 0;
    while (at < 1152) : (at += 3) {
        const lo = @as(u16, ek[at]) | (@as(u16, ek[at + 1] & 0x0f) << 8);
        const hi = (@as(u16, ek[at + 1]) >> 4) | (@as(u16, ek[at + 2]) << 4);
        if (lo >= 3329 or hi >= 3329) return false;
    }
    return true;
}

pub const Invitation = struct {
    ward: [64]u8,
    heir: [32]u8,
    secret: [32]u8,
    lock: [ek_len]u8,

    /// Writes the invitation, with `at` naming `address` when there is one. An
    /// address is written as JSON string content, so it holds no `"` and no `\`.
    pub fn write(self: Invitation, w: *std.Io.Writer, address: ?[]const u8) !void {
        try w.print("{{\"ward\":\"{s}\",\"heir\":\"{s}\",\"secret\":\"{s}\",\"lock\":\"{s}\"", .{
            &std.fmt.bytesToHex(self.ward, .lower),
            &std.fmt.bytesToHex(self.heir, .lower),
            &std.fmt.bytesToHex(self.secret, .lower),
            &std.fmt.bytesToHex(self.lock, .lower),
        });
        if (address) |at| try w.print(",\"at\":[\"{s}\"]", .{at});
        try w.writeAll("}");
    }
};

const Move = struct {
    heir: [32]u8,
    seq: u64,
    by_held: bool,
    announced: ?[32]u8,
    edge: [32]u8,
};

pub const Door = struct {
    gpa: Allocator,
    keys: WardKeys,
    lock: ?MLKem.KeyPair = null,
    zero_reach: ?Reach,
    heirs: std.AutoHashMapUnmanaged([32]u8, Heir) = .empty,
    names: std.StringHashMapUnmanaged([32]u8) = .empty,

    pub fn init(gpa: Allocator, keys: WardKeys, zero_reach: ?Reach) Door {
        return .{ .gpa = gpa, .keys = keys, .zero_reach = zero_reach };
    }

    pub fn deinit(self: *Door) void {
        var it = self.names.keyIterator();
        while (it.next()) |k| self.gpa.free(k.*);
        self.names.deinit(self.gpa);
        self.heirs.deinit(self.gpa);
    }

    pub fn holdsName(self: *Door, name: []const u8) bool {
        return self.names.contains(name);
    }

    /// Holds a new heir under `name` and gives its invitation. The lock is made at the first.
    pub fn invite(self: *Door, ent: *Entropy, name: []const u8, reach: Reach) !Invitation {
        if (self.lock == null) self.lock = try MLKem.KeyPair.generateDeterministic(ent.bytes(64));
        var secret: [32]u8 = undefined;
        var pk: [32]u8 = undefined;
        while (true) {
            ent.fill(&secret);
            pk = keyFrom(secret).public_key.toBytes();
            if (!self.heirs.contains(pk)) break;
        }
        const owned = try self.gpa.dupe(u8, name);
        errdefer self.gpa.free(owned);
        try self.heirs.put(self.gpa, pk, .{ .pk = pk, .reach = reach });
        try self.names.put(self.gpa, owned, pk);
        return .{ .ward = self.keys.raw(), .heir = pk, .secret = secret, .lock = self.lock.?.public_key.toBytes() };
    }

    /// Stops holding the named heir. False where no heir has that name.
    pub fn release(self: *Door, name: []const u8) bool {
        const kv = self.names.fetchRemove(name) orelse return false;
        self.gpa.free(kv.key);
        if (self.heirs.getPtr(kv.value)) |h| {
            if (h.fresh) _ = self.heirs.remove(kv.value) else h.removed = true;
        }
        return true;
    }

    /// Bytes in, reply box out. This door judges one ask at a time and always answers.
    pub fn arrive(self: *Door, a: Allocator, ent: *Entropy, box: []const u8) ![]u8 {
        var lid: [32]u8 = undefined;
        var ag: ?[32]u8 = null;
        if (box.len >= 32) {
            lid = box[0..32].*;
            ag = agree(self.keys.scalar, lid);
        }
        if (ag == null) {
            ent.fill(&lid);
            if (takesNoSeal(lid)) lid = try X25519.recoverPublicKey(ent.bytes(32));
            return (try sealReply(a, ent, self.keys.sign, lid, silence_text)).box;
        }
        var move: ?Move = null;
        const text = try self.judge(a, box, lid, ag.?, &move) orelse silence_text;
        const r = try sealReply(a, ent, self.keys.sign, lid, text);
        if (move) |m| self.apply(m, r.agreement);
        return r.box;
    }

    /// Moves the keys of a relation on a choice, as the tables of "The move" say.
    fn apply(self: *Door, m: Move, reply_ag: [32]u8) void {
        const h = self.heirs.getPtr(m.heir) orelse return;
        if (h.fresh) {
            h.held = m.announced.?;
            h.vouched = null;
            h.fresh = false;
        } else if (m.by_held) {
            if (m.announced) |k| h.vouched = k;
        } else {
            h.held = h.vouched.?;
            h.vouched = m.announced;
        }
        h.open = m.edge;
        h.offered = follow(m.edge, reply_ag);
        h.highest = m.seq;
    }

    fn judge(self: *Door, a: Allocator, box: []const u8, lid: [32]u8, ag: [32]u8, move_out: *?Move) !?[]const u8 {
        // Case 1: the box does not open.
        if (box.len > size_limit or box.len < 80) return null;
        var head: [32]u8 = undefined;
        if (!open(&head, box[32..80], &ag, "quo-seal", &lid)) return null;
        const zero_head = std.mem.eql(u8, &head, &zero32);
        const rest = box[80..];
        const heir: ?*Heir = if (zero_head) null else self.heirs.getPtr(head);

        var body: []u8 = undefined;
        var edge: [32]u8 = zero32;
        if (heir == null) {
            body = try openBody(a, rest, ag, zero32, lid) orelse return null;
        } else if (heir.?.fresh) {
            if (rest.len < ct_len) return null;
            const shared = self.lock.?.secret_key.decaps(rest[0..ct_len]) catch return null;
            edge = knockEdge(shared);
            body = try openBody(a, rest[ct_len..], ag, edge, lid) orelse return null;
        } else {
            const h = heir.?;
            if (try openBody(a, rest, ag, h.open, lid)) |b| {
                body = b;
                edge = h.open;
            } else if (try openBody(a, rest, ag, h.offered, lid)) |b| {
                body = b;
                edge = h.offered;
            } else return null;
        }
        if (body.len <= 64) return null;
        const payload = body[0 .. body.len - 64];
        const sig = body[body.len - 64 ..];

        // Case 2: the payload is not one object of JSON text with keys of distinct names.
        const node = Json.parse(a, payload, 1) catch |e| switch (e) {
            error.OutOfMemory => return e,
            else => return null,
        };
        if (node.kind != .object) return null;

        // Case 3: the payload is not well formed.
        const to = node.get("to") orelse return null;
        if (zero_head) {
            if (to.kind != .null) return null;
        } else {
            const t = pkOf(to) orelse return null;
            if (!std.mem.eql(u8, &t, &head)) return null;
        }
        const by = pkOf(node.get("by") orelse return null) orelse return null;
        const next_node = node.get("next") orelse return null;
        var next: ?[32]u8 = null;
        if (next_node.kind != .null) next = pkOf(next_node) orelse return null;
        const seq = countNumber(node.get("seq") orelse return null) orelse return null;
        const method = node.get("method");
        if (method) |m| if (m.kind != .string) return null;
        const args = node.get("args");
        if (args) |ar| if (ar.kind != .object) return null;

        if (zero_head) {
            const reach = self.zero_reach orelse return null; // case 4
            if (!verify(by, payload, sig)) return null; // case 5
            return try behind(a, reach, method != null, args);
        }
        const h = heir orelse return null; // case 6
        // Case 7: the key is neither admitted nor kept at removal.
        var by_held = false;
        if (h.fresh) {
            if (!std.mem.eql(u8, &by, &h.pk)) return null;
        } else if (std.mem.eql(u8, &by, &h.held)) {
            by_held = true;
        } else if (h.vouched == null or !std.mem.eql(u8, &by, &h.vouched.?)) {
            return null;
        }
        if (!verify(by, payload, sig)) return null; // case 8
        if (h.removed) return "{\"quo\":\"removed\"}"; // case 9
        if (next) |k| {
            if (std.mem.eql(u8, &k, &h.pk) or std.mem.eql(u8, &k, &by)) next = null;
        }
        if (h.fresh and next == null) return "{\"quo\":\"unannounced\"}"; // case 10
        if (seq <= h.highest) return "{\"quo\":\"repeated\"}"; // case 11
        // Cases 12 and 13: a choice.
        const text = try behind(a, h.reach, method != null, args);
        move_out.* = .{ .heir = h.pk, .seq = seq, .by_held = by_held, .announced = next, .edge = edge };
        return text;
    }
};

// ---------------------------------------------------------------- the standing

/// What a standing read from a reply.
pub const Read = union(enum) {
    object: struct { object: []const u8, seen: ?[]const u8 },
    silence,
    word: []const u8,
    nothing,

    /// The `read` of HARNESS.md; `object` without whitespace, `seen` as its token.
    pub fn write(self: Read, w: *std.Io.Writer) !void {
        switch (self) {
            .object => |o| {
                try w.writeAll("{\"object\":");
                try writeCompact(w, o.object);
                try w.print(",\"seen\":{s}}}", .{o.seen orelse "null"});
            },
            .silence => try w.writeAll(silence_text),
            .word => |x| try w.print("{{\"quo\":\"{s}\"}}", .{x}),
            .nothing => try w.writeAll("{\"nothing\":true}"),
        }
    }
};

/// Reads a reply text as one of the three shapes. Anything else reads as silence.
pub fn readText(a: Allocator, text: []const u8) !Read {
    const n = Json.parse(a, text, 1) catch |e| switch (e) {
        error.OutOfMemory => return e,
        else => return .silence,
    };
    if (n.kind != .object) return .silence;
    if (n.keys.len == 2) {
        const o = n.get("object") orelse return .silence;
        const s = n.get("seen") orelse return .silence;
        return switch (s.kind) {
            .null => .{ .object = .{ .object = o.raw, .seen = null } },
            .string => .{ .object = .{ .object = o.raw, .seen = s.raw } },
            else => .silence,
        };
    }
    if (n.keys.len == 1) {
        if (n.get("quo")) |q| {
            if (q.kind != .string) return .silence;
            for ([_][]const u8{ "removed", "unannounced", "repeated" }) |x| {
                if (std.mem.eql(u8, q.str, x)) return .{ .word = x };
            }
        }
    }
    return .silence;
}

/// One relation seen from the standing's end.
pub const Standing = struct {
    const Sent = enum { knock, probe, plain };
    const Last = struct { lid_secret: [32]u8, edge: [32]u8, key: KeyPair, sent: Sent, seq: u64 };

    gpa: Allocator,
    ward_sign: [32]u8,
    padlock: [32]u8,
    heir: [32]u8,
    heir_key: KeyPair,
    lock: MLKem.PublicKey,
    spent: bool = false,
    /// The key the standing signs with once the heir is bound.
    key: KeyPair,
    edge: [32]u8 = zero32,
    seq: u64 = 0,
    /// The highest number of an ask the standing has moved on.
    moved: u64 = 0,
    knock_box: ?[]u8 = null,
    knock_edge: [32]u8 = zero32,
    knock_lid_secret: [32]u8 = zero32,
    last: ?Last = null,

    pub fn init(gpa: Allocator, inv: Invitation) !Standing {
        return .{
            .gpa = gpa,
            .ward_sign = inv.ward[0..32].*,
            .padlock = inv.ward[32..64].*,
            .heir = inv.heir,
            .heir_key = keyFrom(inv.secret),
            .lock = MLKem.PublicKey.fromBytes(&inv.lock) catch return error.BadLock,
            .key = undefined,
        };
    }

    pub fn deinit(self: *Standing) void {
        if (self.knock_box) |b| self.gpa.free(b);
    }

    fn payload(self: *Standing, a: Allocator, by: [32]u8, next: ?[32]u8, method: ?[]const u8, args: ?[]const u8) ![]u8 {
        self.seq += 1;
        var w: std.Io.Writer.Allocating = .init(a);
        const out = &w.writer;
        try out.print("{{\"to\":\"{s}\",\"by\":\"{s}\",\"next\":", .{ &std.fmt.bytesToHex(self.heir, .lower), &std.fmt.bytesToHex(by, .lower) });
        if (next) |k| try out.print("\"{s}\"", .{&std.fmt.bytesToHex(k, .lower)}) else try out.writeAll("null");
        try out.print(",\"seq\":{d}", .{self.seq});
        if (method) |m| try out.print(",\"method\":{s}", .{m});
        if (args) |x| try out.print(",\"args\":{s}", .{x});
        try out.writeAll("}");
        return w.written();
    }

    /// Seals the next ask. `method` and `args` are JSON tokens. A heir not yet bound is
    /// knocked on; after a knock that brought no object back the standing asks under its
    /// own key and the knock's edge key, and after that it sends the knock again, in turn.
    pub fn ask(self: *Standing, a: Allocator, ent: *Entropy, method: ?[]const u8, args: ?[]const u8) ![]u8 {
        const lid_secret = ent.bytes(32);
        if (!self.spent) {
            if (self.knock_box) |kb| {
                if (self.last == null or self.last.?.sent == .probe) {
                    self.last = .{ .lid_secret = self.knock_lid_secret, .edge = self.knock_edge, .key = self.key, .sent = .knock, .seq = 1 };
                    return a.dupe(u8, kb);
                }
                const p = try self.payload(a, self.key.public_key.toBytes(), null, method, args);
                const box = try sealAsk(a, self.padlock, lid_secret, self.heir, null, self.knock_edge, p, sign(self.key, p));
                if (box.len > size_limit) return error.TooLarge;
                self.last = .{ .lid_secret = lid_secret, .edge = self.knock_edge, .key = self.key, .sent = .probe, .seq = self.seq };
                return box;
            }
            self.key = keyFrom(ent.bytes(32));
            const enc = self.lock.encapsDeterministic(&ent.bytes(32));
            self.knock_edge = knockEdge(enc.shared_secret);
            self.seq = 0;
            const p = try self.payload(a, self.heir, self.key.public_key.toBytes(), method, args);
            const box = try sealAsk(a, self.padlock, lid_secret, self.heir, &enc.ciphertext, self.knock_edge, p, sign(self.heir_key, p));
            if (box.len > size_limit) {
                self.seq = 0;
                return error.TooLarge;
            }
            self.knock_box = try self.gpa.dupe(u8, box);
            self.knock_lid_secret = lid_secret;
            self.last = .{ .lid_secret = lid_secret, .edge = self.knock_edge, .key = self.key, .sent = .knock, .seq = self.seq };
            return box;
        }
        const p = try self.payload(a, self.key.public_key.toBytes(), null, method, args);
        const box = try sealAsk(a, self.padlock, lid_secret, self.heir, null, self.edge, p, sign(self.key, p));
        if (box.len > size_limit) return error.TooLarge;
        self.last = .{ .lid_secret = lid_secret, .edge = self.edge, .key = self.key, .sent = .plain, .seq = self.seq };
        return box;
    }

    /// Reads the reply to the last ask, null for nothing. An object moves the standing.
    pub fn read(self: *Standing, a: Allocator, box: ?[]const u8) !Read {
        const b = box orelse return .nothing;
        const last = self.last orelse return .silence;
        const opened = try openReply(a, last.lid_secret, b, self.ward_sign) orelse return .silence;
        const r = try readText(a, opened.text);
        if (r == .object and last.seq > self.moved) {
            self.moved = last.seq;
            self.key = last.key;
            self.edge = follow(last.edge, opened.agreement);
            self.spent = true;
            self.last = null;
            if (self.knock_box) |kb| self.gpa.free(kb);
            self.knock_box = null;
        }
        return r;
    }
};

fn openBody(a: Allocator, sealed: []const u8, ag: [32]u8, edge: [32]u8, lid: [32]u8) !?[]u8 {
    if (sealed.len < 16) return null;
    const out = try a.alloc(u8, sealed.len - 16);
    const ikm = cat(ag, edge);
    if (!open(out, sealed, &ikm, "quo-edge-seal", &lid)) return null;
    return out;
}

// ---------------------------------------------------------------- tests

const testing = std.testing;

test "count numbers" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    for ([_][]const u8{ "1", "9007199254740991" }) |t| try testing.expect(countNumber(try Json.parse(a, t, 1)) != null);
    for ([_][]const u8{ "0", "-1", "1.0", "1e0", "9007199254740992", "\"1\"", "true" }) |t| try testing.expect(countNumber(try Json.parse(a, t, 1)) == null);
}

test "json text" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    try testing.expectError(error.Duplicate, Json.parse(a, "{\"a\":1,\"\\u0061\":2}", 1));
    try testing.expectError(error.NotJson, Json.parse(a, "{\"a\":1,}", 1));
    try testing.expectError(error.NotJson, Json.parse(a, "\"\\x41\"", 1));
    try testing.expectError(error.NotJson, Json.parse(a, "01", 1));
    try testing.expectError(error.NotUtf8, Json.parse(a, "\"\xed\xa0\x80\"", 1));
    // Only the levels read hold keys to distinct names. A lone surrogate is a name of its own.
    try testing.expectEqual(@as(usize, 1), (try Json.parse(a, "{\"a\":{\"b\":1,\"b\":2}}", 1)).keys.len);
    try testing.expectEqual(@as(usize, 2), (try Json.parse(a, "{\"\\ud800\":1,\"\\ud801\":2}", 1)).keys.len);
    try testing.expectError(error.Duplicate, Json.parse(a, "{\"\\ud800\":1,\"\\ud800\":2}", 1));
    try testing.expectEqualStrings("\u{1F600}", (try Json.parse(a, "\"\\ud83d\\ude00\"", 1)).str);
    const numbers = "[-0,1e400,9007199254740993,-0.0,1E-400]";
    try testing.expectEqualStrings(numbers, (try Json.parse(a, numbers, 0)).raw);
    for ([_][]const u8{ "[1,]", "{\"a\"}", "[{]}", "[[1] 2]", "{\"a\":1,}", "[\"\\q\"]", "[01]", "{1:2}", "[" }) |t| {
        try testing.expectError(error.NotJson, Json.parse(a, t, 0));
    }
    try testing.expectEqualStrings("{\"a\":[{},[]],\"b\":{\"c\":\"}\"}}", (try Json.parse(a, "{\"a\":[{},[]],\"b\":{\"c\":\"}\"}}", 0)).raw);
    var deep: [20000]u8 = undefined;
    @memset(deep[0..10000], '[');
    @memset(deep[10000..], ']');
    try testing.expectEqual(Json.Kind.array, (try Json.parse(a, &deep, 1)).kind);
    try testing.expectError(error.NotJson, Json.parse(a, deep[0..19999], 1));

    var w: std.Io.Writer.Allocating = .init(a);
    try writeCompact(&w.writer, " [1, {\"a b\" :\n\"c \\\" d\"}] ");
    try testing.expectEqualStrings("[1,{\"a b\":\"c \\\" d\"}]", w.written());
}

test "the check" {
    const kp = keyFrom([_]u8{7} ** 32);
    const pk = kp.public_key.toBytes();
    const sig = sign(kp, "hello");
    try testing.expect(verify(pk, "hello", &sig));
    try testing.expect(!verify(pk, "hellO", &sig));
    try testing.expect(!verify(pk, "hello", sig[0..63]));
    var id = zero32;
    id[0] = 1;
    try testing.expect(!verify(id, "hello", &sig));
    id[31] = 0x80;
    try testing.expect(!verify(id, "hello", &sig));
    var bad = sig;
    bad[32..64].* = .{ 0xed, 0xd3, 0xf5, 0x5c, 0x1a, 0x63, 0x12, 0x58, 0xd6, 0x9c, 0xf7, 0xa2, 0xde, 0xf9, 0xde, 0x14, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10 };
    try testing.expect(!verify(pk, "hello", &bad));
    // R with the sign bit set on x = 0 is not the bytes its point encodes to.
    var r_signed = [_]u8{0} ** 64;
    r_signed[0] = 1;
    r_signed[31] = 0x80;
    try testing.expect(!verify(pk, "x", &r_signed));
}

test "a reply's signature covers the lid it is sealed to" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var ent: Entropy = .{ .fixed = true, .state = 11 };
    const w = WardKeys.fromText("replier");
    const lid_secret = [_]u8{2} ** 32;
    const lid = try X25519.recoverPublicKey(lid_secret);
    const text = "{\"object\":1,\"seen\":null}";

    const good = try sealReply(a, &ent, w.sign, lid, text);
    const opened = (try openReply(a, lid_secret, good.box, w.sign.public_key.toBytes())).?;
    try testing.expectEqualStrings(text, opened.text);

    // A signature over the reply text alone, and one over another ask's lid, read as silence.
    const other = try X25519.recoverPublicKey([_]u8{3} ** 32);
    const over_other = try std.fmt.allocPrint(a, "{s}{s}", .{ &other, text });
    for ([_][]const u8{ text, over_other }) |signed_over| {
        const eph = ent.bytes(32);
        const ag = agree(eph, lid).?;
        const eph_pk = try X25519.recoverPublicKey(eph);
        const body = try a.alloc(u8, text.len + 64);
        @memcpy(body[0..text.len], text);
        body[text.len..][0..64].* = sign(w.sign, signed_over);
        const box = try a.alloc(u8, 32 + body.len + 16);
        box[0..32].* = eph_pk;
        seal(box[32..], body, &ag, "quo-seal", &eph_pk);
        try testing.expect(try openReply(a, lid_secret, box, w.sign.public_key.toBytes()) == null);
    }
}

test "ward keys" {
    const w = WardKeys.fromText("alice");
    try testing.expect(isLowerHex(&w.wardPk(), 128));
    try testing.expectEqualSlices(u8, &w.wardPk(), &WardKeys.fromText("alice").wardPk());
    const text32 = "0123456789abcdef0123456789abcdef";
    try testing.expect(!std.mem.eql(u8, &WardKeys.fromText(text32).wardPk(), &WardKeys.fromBytes(text32).wardPk()));
}

test "the lock's modulus check" {
    var seed: [64]u8 = undefined;
    for (&seed, 0..) |*b, i| b.* = @intCast(i);
    const kp = MLKem.KeyPair.generateDeterministic(seed) catch unreachable;
    var ek = kp.public_key.toBytes();
    try testing.expect(lockPasses(&ek));

    // A coefficient of exactly q, and one above it, are both refused.
    var at_q = ek;
    at_q[0] = 3329 & 0xff;
    at_q[1] = (at_q[1] & 0xf0) | (3329 >> 8);
    try testing.expect(!lockPasses(&at_q));
    var high = ek;
    high[1150] |= 0xf0;
    high[1151] = 0xff;
    try testing.expect(!lockPasses(&high));

    // The thirty-two bytes of rho after the polynomials are read as no coefficient.
    ek[1152] = 0xff;
    ek[1183] = 0xff;
    try testing.expect(lockPasses(&ek));
}

test "box sizes" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    const w = WardKeys.fromText("w");
    const payload = "{\"x\":1}";
    const ask_box = try sealAsk(a, w.padlock, [_]u8{3} ** 32, zero32, null, zero32, payload, [_]u8{0} ** 64);
    try testing.expectEqual(payload.len + 160, ask_box.len);
    const ct = [_]u8{0} ** ct_len;
    const knock = try sealAsk(a, w.padlock, [_]u8{3} ** 32, zero32, &ct, zero32, payload, [_]u8{0} ** 64);
    try testing.expectEqual(payload.len + 1248, knock.len);
}

/// A door and a standing with nothing between them.
const Pair = struct {
    a: Allocator,
    ent: *Entropy,
    door: *Door,
    standing: *Standing,

    fn ask(self: Pair, method: ?[]const u8, args: ?[]const u8) ![]u8 {
        return self.standing.ask(self.a, self.ent, method, args);
    }

    fn arrive(self: Pair, box: []const u8) ![]u8 {
        return self.door.arrive(self.a, self.ent, box);
    }

    fn round(self: Pair, method: ?[]const u8, args: ?[]const u8) !Read {
        const box = try self.ask(method, args);
        return self.standing.read(self.a, try self.arrive(box));
    }
};

fn expectObject(r: Read, object: []const u8, seen: ?[]const u8) !void {
    switch (r) {
        .object => |o| {
            try testing.expectEqualStrings(object, o.object);
            if (seen) |s| try testing.expectEqualStrings(s, o.seen.?) else try testing.expect(o.seen == null);
        },
        else => return error.TestUnexpectedResult,
    }
}

test "a standing and a door: knock, asks, and a knock recovered" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var ent: Entropy = .{ .fixed = true, .state = 42 };
    var door = Door.init(testing.allocator, WardKeys.fromText("occupant"), null);
    defer door.deinit();

    // A knock that is lost, then recovered by asking under the knock's edge key.
    const inv = try door.invite(&ent, "h", .marked);
    try testing.expectEqualSlices(u8, &inv.heir, &keyFrom(inv.secret).public_key.toBytes());
    var st = try Standing.init(testing.allocator, inv);
    defer st.deinit();
    const p: Pair = .{ .a = a, .ent = &ent, .door = &door, .standing = &st };
    const knock = try p.ask("\"m\"", "{\"k\":1}");
    try testing.expect(try st.read(a, null) == .nothing);
    _ = try p.arrive(knock); // the door bound the heir; the reply never came back
    try expectObject(try p.round("\"m\"", "{\"probe\":true}"), "{\"probe\":true}", "\"1\"");
    try expectObject(try p.round(null, null), describe_none, null);
    try expectObject(try p.round("\"m\"", null), "{}", "\"1\"");
    // The knock again as the same bytes is a stranger's.
    try testing.expect(try st.read(a, try p.arrive(knock)) == .silence);

    // A knock met by nothing at all is sent again, and binds.
    const inv2 = try door.invite(&ent, "h2", .echo);
    var st2 = try Standing.init(testing.allocator, inv2);
    defer st2.deinit();
    const p2: Pair = .{ .a = a, .ent = &ent, .door = &door, .standing = &st2 };
    const k1 = try p2.ask("\"x\"", "{}");
    try testing.expect(try st2.read(a, null) == .nothing);
    const probe = try p2.ask("\"x\"", "{}");
    try testing.expect(try st2.read(a, try p2.arrive(probe)) == .silence);
    const k2 = try p2.ask("\"x\"", "{\"ignored\":1}");
    try testing.expectEqualSlices(u8, k1, k2);
    try expectObject(try st2.read(a, try p2.arrive(k2)), "{}", null);
    try expectObject(try p2.round("\"x\"", "{\"a\":[1, 2]}"), "{\"a\":[1, 2]}", null);

    // A word does not move the standing.
    const box = try p2.ask("\"x\"", "{}");
    _ = try p2.arrive(box);
    try testing.expectEqualStrings("repeated", (try st2.read(a, try p2.arrive(box))).word);
    try expectObject(try p2.round("\"x\"", "{\"after\":\"repeat\"}"), "{\"after\":\"repeat\"}", null);

    // Inside `args` the text is the kit's: odd numbers are echoed, repeated keys are silence by choice.
    try expectObject(try p2.round("\"x\"", "{\"n\":[-0,1e400,\"\\ud800\",{\"k\":1,\"k\":2}]}"), "{\"n\":[-0,1e400,\"\\ud800\",{\"k\":1,\"k\":2}]}", null);
    try testing.expect(try p2.round("\"x\"", "{\"k\":1,\"\\u006b\":2}") == .silence);
    try expectObject(try p2.round("\"x\"", "{}"), "{}", null);

    // Release while spent: removed; while fresh: a stranger's.
    try testing.expect(door.release("h2"));
    try testing.expectEqualStrings("removed", (try p2.round("\"x\"", "{}")).word);
    const inv3 = try door.invite(&ent, "h3", .echo);
    try testing.expect(door.release("h3"));
    var st3 = try Standing.init(testing.allocator, inv3);
    defer st3.deinit();
    const p3: Pair = .{ .a = a, .ent = &ent, .door = &door, .standing = &st3 };
    try testing.expect(try p3.round("\"x\"", "{}") == .silence);
}

test "the move: vouched keys and edge keys" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var ent: Entropy = .{ .fixed = true, .state = 7 };
    var door = Door.init(testing.allocator, WardKeys.fromText("move"), null);
    defer door.deinit();
    const inv = try door.invite(&ent, "h", .echo);
    const heir = inv.heir;
    var st = try Standing.init(testing.allocator, inv);
    defer st.deinit();
    const p: Pair = .{ .a = a, .ent = &ent, .door = &door, .standing = &st };
    try expectObject(try p.round("\"m\"", "{}"), "{}", null);
    const h = door.heirs.getPtr(heir).?;
    try testing.expectEqualSlices(u8, &st.key.public_key.toBytes(), &h.held);
    try testing.expect(h.vouched == null);
    try testing.expectEqualSlices(u8, &st.edge, &h.offered);

    // An ask by the held key announcing K2, written by hand under the offered key.
    const k2 = keyFrom([_]u8{2} ** 32);
    const by = st.key.public_key.toBytes();
    const text = try std.fmt.allocPrint(a, "{{\"to\":\"{x}\",\"by\":\"{x}\",\"next\":\"{x}\",\"seq\":9}}", .{ &heir, &by, &k2.public_key.toBytes() });
    const lid_secret = [_]u8{5} ** 32;
    const box = try sealAsk(a, door.keys.padlock, lid_secret, heir, null, st.edge, text, sign(st.key, text));
    const reply = (try openReply(a, lid_secret, try p.arrive(box), door.keys.sign.public_key.toBytes())).?;
    try expectObject(try readText(a, reply.text), describe_none, null);
    try testing.expectEqualSlices(u8, &by, &h.held);
    try testing.expectEqualSlices(u8, &k2.public_key.toBytes(), &h.vouched.?);
    try testing.expectEqualSlices(u8, &st.edge, &h.open);
    try testing.expectEqualSlices(u8, &follow(st.edge, reply.agreement), &h.offered);

    // K2 signs: it becomes held and nothing is vouched for.
    const text2 = try std.fmt.allocPrint(a, "{{\"to\":\"{x}\",\"by\":\"{x}\",\"next\":null,\"seq\":10}}", .{ &heir, &k2.public_key.toBytes() });
    const box2 = try sealAsk(a, door.keys.padlock, lid_secret, heir, null, h.offered, text2, sign(k2, text2));
    const reply2 = (try openReply(a, lid_secret, try p.arrive(box2), door.keys.sign.public_key.toBytes())).?;
    try expectObject(try readText(a, reply2.text), describe_none, null);
    try testing.expectEqualSlices(u8, &k2.public_key.toBytes(), &h.held);
    try testing.expect(h.vouched == null);
}

test "the zero head" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var ent: Entropy = .{ .fixed = true, .state = 1 };
    var door = Door.init(testing.allocator, WardKeys.fromText("z"), .marked);
    defer door.deinit();
    const k = keyFrom([_]u8{4} ** 32);
    const signer_pk = std.fmt.bytesToHex(k.public_key.toBytes(), .lower);
    const text = try std.fmt.allocPrint(a, " {{ \"seq\" : 1, \"to\":null,\"by\":\"{s}\",\"next\":null,\"method\":\"m\",\"args\":{{\"q\":true}}}} ", .{&signer_pk});
    const lid_secret = [_]u8{9} ** 32;
    const box = try sealAsk(a, door.keys.padlock, lid_secret, zero32, null, zero32, text, sign(k, text));
    for (0..2) |_| {
        const r = (try openReply(a, lid_secret, try door.arrive(a, &ent, box), door.keys.sign.public_key.toBytes())).?;
        try expectObject(try readText(a, r.text), "{\"q\":true}", "\"1\"");
    }
    const other = keyFrom([_]u8{8} ** 32);
    const forged = try sealAsk(a, door.keys.padlock, lid_secret, zero32, null, zero32, text, sign(other, text));
    const r = (try openReply(a, lid_secret, try door.arrive(a, &ent, forged), door.keys.sign.public_key.toBytes())).?;
    try testing.expectEqualStrings(silence_text, r.text);
}

test "the size, and strangers' silence of one length" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var ent: Entropy = .{ .fixed = true, .state = 3 };
    var door = Door.init(testing.allocator, WardKeys.fromText("s"), .null_);
    defer door.deinit();
    const k = keyFrom([_]u8{6} ** 32);
    const head = try std.fmt.allocPrint(a, "{{\"to\":null,\"by\":\"{x}\",\"next\":null,\"seq\":1,\"args\":{{\"v\":\"", .{&k.public_key.toBytes()});
    const fill = size_limit - 160 - head.len - 3;
    const lid_secret = [_]u8{1} ** 32;
    for ([_]usize{ fill, fill + 1 }, 0..) |l, i| {
        const full = try a.alloc(u8, head.len + l + 3);
        @memcpy(full[0..head.len], head);
        @memset(full[head.len .. head.len + l], 'a');
        @memcpy(full[head.len + l ..], "\"}}");
        const box = try sealAsk(a, door.keys.padlock, lid_secret, zero32, null, zero32, full, sign(k, full));
        try testing.expectEqual(size_limit + i, box.len);
        const r = (try openReply(a, lid_secret, try door.arrive(a, &ent, box), door.keys.sign.public_key.toBytes())).?;
        if (i == 0) try expectObject(try readText(a, r.text), describe_none, null) else try testing.expectEqualStrings(silence_text, r.text);
    }
    try testing.expectEqual(silence_text.len + 112, (try door.arrive(a, &ent, "abc")).len);
    try testing.expectEqual(silence_text.len + 112, (try door.arrive(a, &ent, &([_]u8{0} ** 100))).len);
}

test "reply texts" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    for ([_][]const u8{ "{\"object\":1,\"seen\":null,\"x\":1}", "{\"object\":1,\"seen\":5}", "{\"object\":1}", "{\"object\":1,\"object\":2,\"seen\":null}", "{\"quo\":\"gone\"}", "{\"silence\":false}", "[1]", "{\"object\":1," }) |t| {
        try testing.expect(try readText(a, t) == .silence);
    }
    try testing.expectEqualStrings("repeated", (try readText(a, " { \"quo\" : \"repeated\" } ")).word);
    try expectObject(try readText(a, "{\"seen\":\"s\",\"object\":[1.5]}"), "[1.5]", "\"s\"");
    // Inside `object` the kit takes any JSON text.
    const odd = "{\"x\":-0,\"x\":\"\\udc00\",\"y\":1e400}";
    try expectObject(try readText(a, try std.fmt.allocPrint(a, "{{\"object\":{s},\"seen\":\"\\ud800\"}}", .{odd})), odd, "\"\\ud800\"");
}
