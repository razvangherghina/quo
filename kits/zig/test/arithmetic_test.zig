//! Every case in the pinned corpus, reproduced — `arithmetic.json` and the
//! fixed keys of `material.json`. A refusal is asserted as strictly as an
//! acceptance.

const std = @import("std");
const arithmetic = @import("arithmetic");
const arithmetic_path = @import("vectors").arithmetic_path;
const material_path = @import("vectors").material_path;

const Vector = struct {
    name: []const u8,
    law: []const u8,
    refuses: ?bool = null,
    unpinned: ?bool = null,

    input: ?[]const u8 = null,
    hash: ?[]const u8 = null,

    warden: ?[]const u8 = null,
    heir: ?[]const u8 = null,
    commitment: ?[]const u8 = null,

    secret: ?[]const u8 = null,
    pk: ?[]const u8 = null,

    voice: ?[]const u8 = null,
    message: ?[]const u8 = null,
    signature: ?[]const u8 = null,

    shared: ?[]const u8 = null,
    info: ?[]const u8 = null,
    salt: ?[]const u8 = null,
    key: ?[]const u8 = null,
    nonce: ?[]const u8 = null,

    additional: ?[]const u8 = null,
    plaintext: ?[]const u8 = null,
    ciphertext: ?[]const u8 = null,
};

const Corpus = struct {
    corpus: []const u8,
    law: []const u8,
    encoding: []const u8,
    area: []const u8,
    vectors: []const Vector,
};

const Material = struct {
    corpus: []const u8,
    law: []const u8,
    encoding: []const u8,
    area: []const u8,
    material: Keys,
};

const Keys = struct {
    wardenName: []const u8,
    wardenNameSecret: []const u8,
    wardenHeir: []const u8,
    wardenCommitment: []const u8,
    being: []const u8,
    beingCommitment: []const u8,
    voice: []const u8,
    voiceSecret: []const u8,
    voiceHeir: []const u8,
    voiceHeirSecret: []const u8,
    voiceHeirCommitment: []const u8,
    nextHeirCommitment: []const u8,
    padlock: []const u8,
    padlockSecret: []const u8,
    returnPadlock: []const u8,
    returnPadlockSecret: []const u8,
    ephemeralSecret: []const u8,
    ephemeral: []const u8,
    successor: []const u8,
    successorSecret: []const u8,
};

fn read(a: std.mem.Allocator, path: []const u8) ![]u8 {
    var threaded: std.Io.Threaded = .init(a, .{});
    defer threaded.deinit();
    return std.Io.Dir.cwd().readFileAlloc(threaded.io(), path, a, .limited(1 << 20));
}

fn hex(a: std.mem.Allocator, raw: []const u8) ![]u8 {
    const out = try a.alloc(u8, raw.len * 2);
    _ = std.fmt.bufPrint(out, "{x}", .{raw}) catch unreachable;
    return out;
}

fn bytes(a: std.mem.Allocator, text: []const u8) ![]u8 {
    const out = try a.alloc(u8, text.len / 2);
    errdefer a.free(out);
    if (text.len % 2 != 0) return error.TestUnexpectedResult;
    _ = std.fmt.hexToBytes(out, text) catch return error.TestUnexpectedResult;
    return out;
}

fn key(text: []const u8) !arithmetic.Key {
    var out: arithmetic.Key = undefined;
    if (text.len != arithmetic.key_length * 2) return error.TestUnexpectedResult;
    _ = std.fmt.hexToBytes(&out, text) catch return error.TestUnexpectedResult;
    return out;
}

fn expectHex(a: std.mem.Allocator, expected: []const u8, produced: []const u8, name: []const u8) !void {
    const written = try hex(a, produced);
    defer a.free(written);
    std.testing.expectEqualStrings(expected, written) catch {
        std.debug.print("disagrees for: {s}\n", .{name});
        return error.TestUnexpectedResult;
    };
}

test "the pinned corpus" {
    const a = std.testing.allocator;

    const text = try read(a, arithmetic_path);
    defer a.free(text);

    const parsed = try std.json.parseFromSlice(Corpus, a, text, .{});
    defer parsed.deinit();

    try std.testing.expectEqualStrings("arithmetic", parsed.value.area);
    try std.testing.expectEqualStrings("hex", parsed.value.encoding);
    try std.testing.expect(parsed.value.vectors.len > 0);

    var accepted: usize = 0;
    var refused: usize = 0;

    for (parsed.value.vectors) |v| {
        if (v.hash) |expected| {
            const input = try bytes(a, v.input.?);
            defer a.free(input);
            const digest = arithmetic.hash(input);
            try expectHex(a, expected, &digest, v.name);
            accepted += 1;
        } else if (v.commitment) |expected| {
            const produced = arithmetic.commitment(try key(v.warden.?), try key(v.heir.?));
            try expectHex(a, expected, &produced, v.name);
            accepted += 1;
        } else if (v.signature) |written| {
            const message = try bytes(a, v.message.?);
            defer a.free(message);
            var signature: arithmetic.Signature = undefined;
            _ = std.fmt.hexToBytes(&signature, written) catch return error.TestUnexpectedResult;

            if (v.refuses orelse false) {
                std.testing.expectError(
                    arithmetic.Error.Refused,
                    arithmetic.verify(try key(v.voice.?), message, signature),
                ) catch {
                    std.debug.print("verified what must be refused: {s}\n", .{v.name});
                    return error.TestUnexpectedResult;
                };
                refused += 1;
                continue;
            }

            const produced = try arithmetic.sign(try key(v.secret.?), message);
            try expectHex(a, written, &produced, v.name);
            arithmetic.verify(try key(v.voice.?), message, signature) catch {
                std.debug.print("refused a signature that must verify: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            accepted += 1;
        } else if (v.ciphertext) |written| {
            const shared = try key(v.shared.?);
            const additional = try bytes(a, v.additional.?);
            defer a.free(additional);
            const box = try bytes(a, written);
            defer a.free(box);

            if (v.refuses orelse false) {
                const opened = try a.alloc(u8, box.len - arithmetic.tag_length);
                defer a.free(opened);
                std.testing.expectError(
                    arithmetic.Error.Refused,
                    arithmetic.open(opened, shared, additional, box),
                ) catch {
                    std.debug.print("opened what must be refused: {s}\n", .{v.name});
                    return error.TestUnexpectedResult;
                };
                refused += 1;
                continue;
            }

            const plaintext = try bytes(a, v.plaintext.?);
            defer a.free(plaintext);
            const sealed = try a.alloc(u8, arithmetic.boxLength(plaintext.len));
            defer a.free(sealed);
            arithmetic.seal(sealed, shared, additional, plaintext);
            try expectHex(a, written, sealed, v.name);

            const opened = try a.alloc(u8, box.len - arithmetic.tag_length);
            defer a.free(opened);
            try arithmetic.open(opened, shared, additional, box);
            try std.testing.expectEqualSlices(u8, plaintext, opened);
            accepted += 1;
        } else if (v.key) |expected| {
            // The derivation is pinned: an empty salt, the fixed ASCII info
            // `quo-seal`, and forty-four bytes drawn — key then nonce.
            const info = try bytes(a, v.info.?);
            defer a.free(info);
            try std.testing.expectEqualStrings(arithmetic.seal_info, info);
            try std.testing.expectEqualStrings(arithmetic.seal_salt, v.salt.?);

            const sealing = arithmetic.derive(try key(v.shared.?));
            try expectHex(a, expected, &sealing.key, v.name);
            try expectHex(a, v.nonce.?, &sealing.nonce, v.name);
            accepted += 1;
        } else if (v.shared) |expected| {
            const produced = try arithmetic.agree(try key(v.secret.?), try key(v.pk.?));
            try expectHex(a, expected, &produced, v.name);
            accepted += 1;
        } else if (v.pk) |expected| {
            // The corpus names no algorithm field on a pair vector; the
            // vector's own name is what says which of the two it is.
            const secret = try key(v.secret.?);
            if (std.mem.indexOf(u8, v.name, "Ed25519") != null) {
                const pair = try arithmetic.signingPair(secret);
                try expectHex(a, expected, &pair.public, v.name);
            } else if (std.mem.indexOf(u8, v.name, "X25519") != null) {
                const pair = try arithmetic.sealingPair(secret);
                try expectHex(a, expected, &pair.public, v.name);
            } else {
                std.debug.print("a pair vector naming no algorithm: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            }
            accepted += 1;
        } else {
            std.debug.print("a vector this suite does not know how to play: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        }
    }

    // Every case in the corpus was played, and both kinds were present.
    try std.testing.expectEqual(parsed.value.vectors.len, accepted + refused);
    try std.testing.expect(accepted > 0);
    try std.testing.expect(refused > 0);
}

/// Every key in `material.json` is either derived here from another key in
/// it, or is a pinned input whose preimage the corpus does not publish. The
/// two lists together must name every field, so a key cannot be added to the
/// corpus and go unexamined.
const derived = [_][]const u8{
    "wardenName",
    "voice",
    "voiceHeir",
    "successor",
    "padlock",
    "returnPadlock",
    "ephemeral",
    "wardenCommitment",
    "voiceHeirCommitment",
};

const pinned = [_][]const u8{
    "wardenNameSecret",
    "voiceSecret",
    "voiceHeirSecret",
    "successorSecret",
    "padlockSecret",
    "returnPadlockSecret",
    "ephemeralSecret",
    // The warden's heir: the corpus publishes no secret for it.
    "wardenHeir",
    // A being's name, and two commitments over heirs the corpus does not
    // publish, so nothing here can recompute them.
    "being",
    "beingCommitment",
    "nextHeirCommitment",
};

test "the fixed keys" {
    const a = std.testing.allocator;

    const text = try read(a, material_path);
    defer a.free(text);

    const parsed = try std.json.parseFromSlice(Material, a, text, .{});
    defer parsed.deinit();

    try std.testing.expectEqualStrings("material", parsed.value.area);
    try std.testing.expectEqualStrings("hex", parsed.value.encoding);
    const m = parsed.value.material;

    // A key is 32 bytes, every one of them, and every field is accounted
    // for by exactly one of the two lists above.
    var covered: usize = 0;
    inline for (@typeInfo(Keys).@"struct".fields) |field| {
        try std.testing.expectEqual(
            @as(usize, arithmetic.key_length * 2),
            @field(m, field.name).len,
        );
        _ = try key(@field(m, field.name));

        var seen: usize = 0;
        for (derived) |name| {
            if (std.mem.eql(u8, name, field.name)) seen += 1;
        }
        for (pinned) |name| {
            if (std.mem.eql(u8, name, field.name)) seen += 1;
        }
        std.testing.expectEqual(@as(usize, 1), seen) catch {
            std.debug.print("unaccounted material key: {s}\n", .{field.name});
            return error.TestUnexpectedResult;
        };
        covered += 1;
    }
    try std.testing.expectEqual(derived.len + pinned.len, covered);

    // The signing pairs.
    try expectHex(a, m.wardenName, &(try arithmetic.signingPair(try key(m.wardenNameSecret))).public, "wardenName");
    try expectHex(a, m.voice, &(try arithmetic.signingPair(try key(m.voiceSecret))).public, "voice");
    try expectHex(a, m.voiceHeir, &(try arithmetic.signingPair(try key(m.voiceHeirSecret))).public, "voiceHeir");
    try expectHex(a, m.successor, &(try arithmetic.signingPair(try key(m.successorSecret))).public, "successor");

    // The sealing pairs. A padlock is an X25519 public key.
    try expectHex(a, m.padlock, &(try arithmetic.sealingPair(try key(m.padlockSecret))).public, "padlock");
    try expectHex(a, m.returnPadlock, &(try arithmetic.sealingPair(try key(m.returnPadlockSecret))).public, "returnPadlock");
    try expectHex(a, m.ephemeral, &(try arithmetic.sealingPair(try key(m.ephemeralSecret))).public, "ephemeral");

    // The commitments the corpus publishes both halves of: a warden's own
    // name hashed under itself, and the voice's heir at that warden.
    const warden_name = try key(m.wardenName);
    try expectHex(
        a,
        m.wardenCommitment,
        &arithmetic.commitment(warden_name, try key(m.wardenHeir)),
        "wardenCommitment",
    );
    try expectHex(
        a,
        m.voiceHeirCommitment,
        &arithmetic.commitment(warden_name, try key(m.voiceHeir)),
        "voiceHeirCommitment",
    );
}

test "the agreement is the same from either side, on the corpus's own keys" {
    const a = std.testing.allocator;

    const text = try read(a, material_path);
    defer a.free(text);
    const parsed = try std.json.parseFromSlice(Material, a, text, .{});
    defer parsed.deinit();
    const m = parsed.value.material;

    const mine = try arithmetic.agree(try key(m.ephemeralSecret), try key(m.padlock));
    const theirs = try arithmetic.agree(try key(m.padlockSecret), try key(m.ephemeral));
    try std.testing.expectEqualSlices(u8, &mine, &theirs);

    // A seal opens under the agreement and under nothing else: the lid and
    // the box cannot be mixed and matched.
    const plaintext = "by whose authority";
    var box: [plaintext.len + arithmetic.tag_length]u8 = undefined;
    const additional = try key(m.ephemeral);
    arithmetic.seal(&box, mine, &additional, plaintext);

    var opened: [plaintext.len]u8 = undefined;
    try arithmetic.open(&opened, theirs, &additional, &box);
    try std.testing.expectEqualStrings(plaintext, &opened);

    const other = try key(m.returnPadlock);
    try std.testing.expectError(
        arithmetic.Error.Refused,
        arithmetic.open(&opened, mine, &other, &box),
    );
    try std.testing.expectError(
        arithmetic.Error.Refused,
        arithmetic.open(&opened, try key(m.being), &additional, &box),
    );

    // A box shorter than the tag is refused outright rather than indexed.
    try std.testing.expectError(
        arithmetic.Error.Refused,
        arithmetic.open(opened[0..0], mine, &additional, box[0..4]),
    );
}

/// The eight small-order point encodings, which the law names and the corpus
/// carries only one of.
const small_order_points = [_][]const u8{
    "0100000000000000000000000000000000000000000000000000000000000000",
    "ecffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff7f",
    "0000000000000000000000000000000000000000000000000000000000000000",
    "0000000000000000000000000000000000000000000000000000000000000080",
    "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc05",
    "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac037a",
    "26e8958fc2b227b045c3f489f2ef98f0d5dfac05d3c63339b13802886d53fc85",
    "c7176a703d4dd84fba3c0b760d10670f2a2053fa2c39ccc64ec7fd7792ac03fa",
};

test "VI — a voice of small order is silence before any signature is examined" {
    // The corpus carries one of the eight. The law names all eight, so all
    // eight are asserted here, in front of whatever the platform would do.
    for (small_order_points) |text| {
        const pk = try key(text);
        try std.testing.expect(arithmetic.smallOrder(pk));
        try std.testing.expectError(
            arithmetic.Error.Refused,
            arithmetic.verify(pk, "by whose authority", [_]u8{0} ** arithmetic.signature_length),
        );
    }

    // And an ordinary voice is not one of them, so the pre-check refuses
    // nothing it was not written to refuse.
    const seed: arithmetic.Key = [_]u8{7} ** arithmetic.key_length;
    const pair = try arithmetic.signingPair(seed);
    try std.testing.expect(!arithmetic.smallOrder(pair.public));
    const signature = try arithmetic.sign(seed, "by whose authority");
    try arithmetic.verify(pair.public, "by whose authority", signature);
}

test "VI — a dead agreement is refused at the point of agreement" {
    // The refusal is the platform's here rather than this kit's, and that is
    // only worth relying on because this case watched it happen: the
    // degenerate input goes in and `Refused` comes out. Reading the
    // documentation would not have been payment.
    const secret: arithmetic.Key = [_]u8{9} ** arithmetic.key_length;
    for ([_][]const u8{
        small_order_points[2], // the identity, all zeros
        small_order_points[0], // the point of order two
        small_order_points[1],
    }) |text| {
        try std.testing.expectError(
            arithmetic.Error.Refused,
            arithmetic.agree(secret, try key(text)),
        );
    }

    // A real padlock still agrees, and the two sides meet.
    const other: arithmetic.Key = [_]u8{11} ** arithmetic.key_length;
    const mine = try arithmetic.sealingPair(secret);
    const theirs = try arithmetic.sealingPair(other);
    const one = try arithmetic.agree(mine.secret, theirs.public);
    const two = try arithmetic.agree(theirs.secret, mine.public);
    try std.testing.expectEqualSlices(u8, &one, &two);
    try std.testing.expect(!std.mem.allEqual(u8, &one, 0));
}
