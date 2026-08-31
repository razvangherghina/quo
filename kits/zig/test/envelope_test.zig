//! Every case in the pinned corpus, reproduced — `envelope.json`. Four shapes
//! live in that file and each is played on its own terms: a payload record
//! written from its value and read back, a signature over a payload, a whole
//! sealed envelope written and opened, and an envelope that must be refused.
//! A vector whose shape this suite does not recognise fails rather than being
//! skipped.

const std = @import("std");
const envelope = @import("envelope");
const envelope_path = @import("vectors").envelope_path;

const Vector = struct {
    name: []const u8,
    law: []const u8,
    /// A payload vector carries the record's own blueprint and its bytes.
    blueprint: ?[]const u8 = null,
    bytes: ?[]const u8 = null,
    value: std.json.Value = .null,
    /// A signature vector.
    payload: ?[]const u8 = null,
    voice: ?[]const u8 = null,
    secret: ?[]const u8 = null,
    signature: ?[]const u8 = null,
    /// An envelope vector.
    envelope: ?[]const u8 = null,
    padlock: ?[]const u8 = null,
    padlockSecret: ?[]const u8 = null,
    voiceSecret: ?[]const u8 = null,
    ephemeralSecret: ?[]const u8 = null,
    refuses: ?bool = null,
    unpinned: ?bool = null,
};

const Corpus = struct {
    corpus: []const u8,
    law: []const u8,
    encoding: []const u8,
    area: []const u8,
    vectors: []const Vector,
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
    if (text.len % 2 != 0) return error.TestUnexpectedResult;
    const out = try a.alloc(u8, text.len / 2);
    _ = std.fmt.hexToBytes(out, text) catch return error.TestUnexpectedResult;
    return out;
}

fn key(a: std.mem.Allocator, text: []const u8) !envelope.Key {
    if (text.len != envelope.key_length * 2) return error.TestUnexpectedResult;
    const raw = try bytes(a, text);
    var out: envelope.Key = undefined;
    @memcpy(&out, raw);
    return out;
}

fn keyField(a: std.mem.Allocator, object: std.json.ObjectMap, name: []const u8) !envelope.Key {
    return key(a, try string(object, name));
}

fn string(object: std.json.ObjectMap, name: []const u8) ![]const u8 {
    return switch (object.get(name) orelse return error.TestUnexpectedResult) {
        .string => |s| s,
        else => error.TestUnexpectedResult,
    };
}

fn optionalKeyField(a: std.mem.Allocator, object: std.json.ObjectMap, name: []const u8) !?envelope.Key {
    return switch (object.get(name) orelse return error.TestUnexpectedResult) {
        .null => null,
        .string => |s| try key(a, s),
        else => error.TestUnexpectedResult,
    };
}

fn intField(object: std.json.ObjectMap, name: []const u8) !i64 {
    // A decimal string, so no precision is lost.
    return std.fmt.parseInt(i64, try string(object, name), 10) catch error.TestUnexpectedResult;
}

fn objectOf(json: std.json.Value) !std.json.ObjectMap {
    return switch (json) {
        .object => |o| o,
        else => error.TestUnexpectedResult,
    };
}

/// The `say` a vector's value writes, by the rule the corpus README states.
fn sayOf(a: std.mem.Allocator, json: std.json.Value) !envelope.Say {
    const object = try objectOf(json);
    // Keyed by the names the record declares, and by no others.
    if (object.count() != 9) return error.TestUnexpectedResult;

    const raw_hints = switch (object.get("hints") orelse return error.TestUnexpectedResult) {
        .array => |items| items,
        else => return error.TestUnexpectedResult,
    };
    const hints = try a.alloc([]const u8, raw_hints.items.len);
    for (raw_hints.items, hints) |item, *slot| {
        slot.* = switch (item) {
            .string => |s| s,
            else => return error.TestUnexpectedResult,
        };
    }

    const allowance = try objectOf(object.get("allowance") orelse return error.TestUnexpectedResult);
    if (allowance.count() != 2) return error.TestUnexpectedResult;

    var method: ?envelope.Method = null;
    switch (object.get("method") orelse return error.TestUnexpectedResult) {
        .null => {},
        .object => |m| {
            if (m.count() != 2) return error.TestUnexpectedResult;
            method = .{
                .name = try string(m, "name"),
                .args = try bytes(a, try string(m, "args")),
            };
        },
        else => return error.TestUnexpectedResult,
    }

    return .{
        .voice = try keyField(a, object, "voice"),
        .recipient = try keyField(a, object, "recipient"),
        .commitment = try optionalKeyField(a, object, "commitment"),
        .seq = try intField(object, "seq"),
        .padlock = try keyField(a, object, "padlock"),
        .hints = hints,
        .allowance = .{
            .time = try intField(allowance, "time"),
            .hops = try intField(allowance, "hops"),
        },
        .being = try optionalKeyField(a, object, "being"),
        .method = method,
    };
}

fn answerOf(a: std.mem.Allocator, json: std.json.Value) !envelope.Answer {
    const object = try objectOf(json);
    if (object.count() != 3) return error.TestUnexpectedResult;
    return .{
        .warden = try keyField(a, object, "warden"),
        .seq = try intField(object, "seq"),
        .data = switch (object.get("data") orelse return error.TestUnexpectedResult) {
            .null => null,
            .string => |s| try bytes(a, s),
            else => return error.TestUnexpectedResult,
        },
    };
}

/// The record under test is the answer type of the vector blueprint's one
/// class field: `say` or `answer` and nothing else.
fn kindOf(blueprint: []const u8) !envelope.Kind {
    if (std.mem.indexOf(u8, blueprint, "probe() say") != null) return .say;
    if (std.mem.indexOf(u8, blueprint, "probe() answer") != null) return .answer;
    return error.TestUnexpectedResult;
}

fn payloadOf(a: std.mem.Allocator, kind: envelope.Kind, json: std.json.Value) !envelope.Payload {
    return switch (kind) {
        .say => .{ .say = try sayOf(a, json) },
        .answer => .{ .answer = try answerOf(a, json) },
    };
}

fn sameSay(x: envelope.Say, y: envelope.Say) bool {
    if (!std.mem.eql(u8, &x.voice, &y.voice)) return false;
    if (!std.mem.eql(u8, &x.recipient, &y.recipient)) return false;
    if (!sameOptionalKey(x.commitment, y.commitment)) return false;
    if (x.seq != y.seq) return false;
    if (!std.mem.eql(u8, &x.padlock, &y.padlock)) return false;
    if (x.hints.len != y.hints.len) return false;
    for (x.hints, y.hints) |a, b| {
        if (!std.mem.eql(u8, a, b)) return false;
    }
    if (x.allowance.time != y.allowance.time) return false;
    if (x.allowance.hops != y.allowance.hops) return false;
    if (!sameOptionalKey(x.being, y.being)) return false;
    if ((x.method == null) != (y.method == null)) return false;
    if (x.method) |m| {
        if (!std.mem.eql(u8, m.name, y.method.?.name)) return false;
        if (!std.mem.eql(u8, m.args, y.method.?.args)) return false;
    }
    return true;
}

fn sameOptionalKey(x: ?envelope.Key, y: ?envelope.Key) bool {
    if ((x == null) != (y == null)) return false;
    if (x) |k| return std.mem.eql(u8, &k, &y.?);
    return true;
}

fn sameAnswer(x: envelope.Answer, y: envelope.Answer) bool {
    if (!std.mem.eql(u8, &x.warden, &y.warden)) return false;
    if (x.seq != y.seq) return false;
    if ((x.data == null) != (y.data == null)) return false;
    if (x.data) |d| return std.mem.eql(u8, d, y.data.?);
    return true;
}

fn same(x: envelope.Payload, y: envelope.Payload) bool {
    if (std.meta.activeTag(x) != std.meta.activeTag(y)) return false;
    return switch (x) {
        .say => sameSay(x.say, y.say),
        .answer => sameAnswer(x.answer, y.answer),
    };
}

test "the pinned corpus" {
    const gpa = std.testing.allocator;

    const text = try read(gpa, envelope_path);
    defer gpa.free(text);

    const parsed = try std.json.parseFromSlice(Corpus, gpa, text, .{});
    defer parsed.deinit();

    try std.testing.expectEqualStrings("envelope", parsed.value.area);
    try std.testing.expectEqualStrings("hex", parsed.value.encoding);
    try std.testing.expect(parsed.value.vectors.len > 0);

    var records: usize = 0;
    var signatures: usize = 0;
    var letters: usize = 0;
    var refused: usize = 0;

    for (parsed.value.vectors) |v| {
        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();

        if (v.refuses orelse false) {
            // A refusal is asserted as strictly as an acceptance, and the
            // refusal is one error and no other.
            const sealed = try bytes(a, v.envelope orelse {
                std.debug.print("unrecognised refusal shape: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            });
            const secret = try key(a, v.padlockSecret orelse return error.TestUnexpectedResult);
            // Every sealed vector in this file is opened at a door, which is
            // the end that expects a `say`.
            std.testing.expectError(
                envelope.Error.Refused,
                envelope.open(a, secret, .say, sealed),
            ) catch {
                std.debug.print("opened what must be refused: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            refused += 1;
            continue;
        }

        if (v.blueprint) |blueprint| {
            // A payload record: written from its value, the bytes are the
            // corpus's own, and read back they are the value again.
            const kind = try kindOf(blueprint);
            const payload = payloadOf(a, kind, v.value) catch {
                std.debug.print("unrecognised vector shape: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            const expected = v.bytes orelse return error.TestUnexpectedResult;

            const written = try envelope.encodeRecord(a, payload);
            std.testing.expectEqualStrings(expected, try hex(a, written)) catch {
                std.debug.print("wrote other bytes for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };

            var opened = envelope.decodeRecord(a, kind, try bytes(a, expected)) catch {
                std.debug.print("refused what must be read: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            defer opened.deinit();
            if (!same(payload, opened.payload)) {
                std.debug.print("read back another value for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            }
            records += 1;
            continue;
        }

        if (v.signature) |signature| {
            // The signature covers the leading byte with the rest, and
            // Ed25519 signs deterministically, so the bytes are pinned.
            const signed = try bytes(a, v.payload orelse return error.TestUnexpectedResult);
            const secret = try key(a, v.secret orelse return error.TestUnexpectedResult);
            const voice = try key(a, v.voice orelse return error.TestUnexpectedResult);

            const made = try arithmeticSign(secret, signed);
            try std.testing.expectEqualStrings(signature, try hex(a, &made));
            try verify(voice, signed, made);

            // The payload the signature covers is a `say` under its own byte.
            try std.testing.expectEqual(envelope.Kind.say, try kindByte(signed));
            var opened = try envelope.decodePayload(a, .say, signed);
            defer opened.deinit();
            try std.testing.expect(std.meta.activeTag(opened.payload) == .say);
            signatures += 1;
            continue;
        }

        if (v.envelope) |sealed| {
            // The whole letter: an ephemeral public key, then one ciphertext,
            // and nothing else outside.
            const payload = payloadOf(a, .say, v.value) catch {
                std.debug.print("unrecognised vector shape: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            const ephemeral_secret = try key(a, v.ephemeralSecret orelse return error.TestUnexpectedResult);
            const padlock = try key(a, v.padlock orelse return error.TestUnexpectedResult);
            const voice_secret = try key(a, v.voiceSecret orelse return error.TestUnexpectedResult);
            const padlock_secret = try key(a, v.padlockSecret orelse return error.TestUnexpectedResult);

            const made = try envelope.seal(a, ephemeral_secret, padlock, voice_secret, payload);
            std.testing.expectEqualStrings(sealed, try hex(a, made)) catch {
                std.debug.print("sealed other bytes for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };

            var opened = envelope.open(a, padlock_secret, .say, try bytes(a, sealed)) catch {
                std.debug.print("refused what must open: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            defer opened.deinit();
            if (!same(payload, opened.payload)) {
                std.debug.print("opened another value for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            }
            letters += 1;
            continue;
        }

        std.debug.print("unrecognised vector shape: {s}\n", .{v.name});
        return error.TestUnexpectedResult;
    }

    // A subset cannot pass.
    try std.testing.expectEqual(
        parsed.value.vectors.len,
        records + signatures + letters + refused,
    );

    var declared_refusals: usize = 0;
    for (parsed.value.vectors) |v| {
        if (v.refuses orelse false) declared_refusals += 1;
    }
    try std.testing.expectEqual(declared_refusals, refused);
}

fn kindByte(payload: []const u8) !envelope.Kind {
    if (payload.len == 0) return error.TestUnexpectedResult;
    return switch (payload[0]) {
        0 => envelope.Kind.say,
        1 => envelope.Kind.answer,
        else => error.TestUnexpectedResult,
    };
}

fn arithmeticSign(secret: envelope.Key, message: []const u8) !envelope.Signature {
    const pair = try std.crypto.sign.Ed25519.KeyPair.generateDeterministic(secret);
    return (try pair.sign(message, null)).toBytes();
}

fn verify(voice: envelope.Key, message: []const u8, signature: envelope.Signature) !void {
    const public = try std.crypto.sign.Ed25519.PublicKey.fromBytes(voice);
    try std.crypto.sign.Ed25519.Signature.fromBytes(signature).verify(message, public);
}

// Refusals Article XI names that no vector in the corpus covers.
test "the refusals the law names beyond the corpus" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    // Any first byte but zero and one is silence.
    var payload = try envelope.encodePayload(a, .{ .answer = .{
        .warden = @splat(7),
        .seq = 3,
        .data = null,
    } });
    try std.testing.expectEqual(@as(u8, 1), payload[0]);

    // An answer under its own byte is read, and the same bytes under any
    // other byte are silence.
    var back = try envelope.decodePayload(a, .answer, payload);
    defer back.deinit();
    try std.testing.expectEqual(@as(i64, 3), back.payload.answer.seq);

    payload[0] = 2;
    try std.testing.expectError(envelope.Error.Refused, envelope.decodePayload(a, .answer, payload));
    payload[0] = 0xff;
    try std.testing.expectError(envelope.Error.Refused, envelope.decodePayload(a, .answer, payload));

    // A payload with nothing in it at all names no record.
    try std.testing.expectError(envelope.Error.Refused, envelope.decodePayload(a, .say, ""));

    // A record presented under the other record's byte is silence, and so is
    // a record the end it arrived at was not expecting.
    payload[0] = 0;
    try std.testing.expectError(envelope.Error.Refused, envelope.decodePayload(a, .say, payload));
    payload[0] = 1;
    try std.testing.expectError(envelope.Error.Refused, envelope.decodePayload(a, .say, payload));

    // An envelope with no room for an ephemeral key, and one with no room for
    // a payload under its signature and tag.
    const secret: envelope.Key = @splat(9);
    try std.testing.expectError(envelope.Error.Refused, envelope.open(a, secret, .say, ""));
    try std.testing.expectError(
        envelope.Error.Refused,
        envelope.open(a, secret, .say, &[_]u8{0} ** (envelope.key_length + 16 + 64)),
    );
}
