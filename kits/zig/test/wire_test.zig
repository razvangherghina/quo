//! Every case in the pinned corpus, reproduced — `wire.json`. Each accepted
//! vector is written from its value and read back into it; each refused one is
//! refused on decode. A refusal is asserted as strictly as an acceptance, and
//! a vector whose shape this suite does not recognise fails rather than being
//! skipped.

const std = @import("std");
const notation = @import("notation");
const wire = @import("wire");
const wire_path = @import("vectors").wire_path;

const Vector = struct {
    name: []const u8,
    law: []const u8,
    blueprint: []const u8,
    /// A refused vector carries no value at all: there is nothing it decodes
    /// to. An absent key and a JSON null both read as `.null` here, and only
    /// an accepted vector's value is ever looked at.
    value: std.json.Value = .null,
    bytes: []const u8,
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
    errdefer a.free(out);
    _ = std.fmt.hexToBytes(out, text) catch return error.TestUnexpectedResult;
    return out;
}

fn key(a: std.mem.Allocator, json: std.json.Value) !wire.Key {
    const text = switch (json) {
        .string => |s| s,
        else => return error.TestUnexpectedResult,
    };
    if (text.len != wire.key_length * 2) return error.TestUnexpectedResult;
    const raw = try bytes(a, text);
    defer a.free(raw);
    var out: wire.Key = undefined;
    @memcpy(&out, raw);
    return out;
}

fn field(object: std.json.ObjectMap, name: []const u8) !std.json.Value {
    return object.get(name) orelse error.TestUnexpectedResult;
}

fn hints(a: std.mem.Allocator, json: std.json.Value) ![]const []const u8 {
    const array = switch (json) {
        .array => |items| items,
        else => return error.TestUnexpectedResult,
    };
    const out = try a.alloc([]const u8, array.items.len);
    for (array.items, out) |item, *hint| {
        hint.* = switch (item) {
            .string => |s| s,
            else => return error.TestUnexpectedResult,
        };
    }
    return out;
}

/// The corpus writes one value per type, by the rule the README states. A
/// shape this does not recognise is an error, never a skip.
fn valueOf(
    a: std.mem.Allocator,
    type_text: []const u8,
    records: []const notation.Block,
    json: std.json.Value,
) !wire.Value {
    if (type_text.len == 0) return error.TestUnexpectedResult;

    if (type_text[type_text.len - 1] == '?') {
        if (json == .null) return .absent;
        const held = try a.create(wire.Value);
        held.* = try valueOf(a, type_text[0 .. type_text.len - 1], records, json);
        return .{ .present = held };
    }

    if (type_text[0] == '[' and type_text[type_text.len - 1] == ']') {
        const array = switch (json) {
            .array => |items| items,
            else => return error.TestUnexpectedResult,
        };
        const out = try a.alloc(wire.Value, array.items.len);
        for (array.items, out) |item, *slot| {
            slot.* = try valueOf(a, type_text[1 .. type_text.len - 1], records, item);
        }
        return .{ .list = out };
    }

    if (std.mem.eql(u8, type_text, "bool")) {
        return .{ .boolean = switch (json) {
            .bool => |b| b,
            else => return error.TestUnexpectedResult,
        } };
    }
    if (std.mem.eql(u8, type_text, "int")) {
        // A decimal string, so no precision is lost.
        const text = switch (json) {
            .string => |s| s,
            else => return error.TestUnexpectedResult,
        };
        return .{ .integer = std.fmt.parseInt(i64, text, 10) catch return error.TestUnexpectedResult };
    }
    if (std.mem.eql(u8, type_text, "text")) {
        return .{ .text = switch (json) {
            .string => |s| s,
            else => return error.TestUnexpectedResult,
        } };
    }
    if (std.mem.eql(u8, type_text, "bytes")) {
        const text = switch (json) {
            .string => |s| s,
            else => return error.TestUnexpectedResult,
        };
        return .{ .bytes = try bytes(a, text) };
    }
    if (std.mem.eql(u8, type_text, "b32")) return .{ .b32 = try key(a, json) };
    if (std.mem.eql(u8, type_text, "being")) return .{ .being = try key(a, json) };

    if (std.mem.eql(u8, type_text, "invitation") or std.mem.eql(u8, type_text, "card")) {
        const object = switch (json) {
            .object => |o| o,
            else => return error.TestUnexpectedResult,
        };
        const warden = try key(a, try field(object, "warden"));
        const commitment = try key(a, try field(object, "commitment"));
        const padlock = try key(a, try field(object, "padlock"));
        const carried = try hints(a, try field(object, "hints"));
        if (std.mem.eql(u8, type_text, "card")) {
            if (object.count() != 4) return error.TestUnexpectedResult;
            return .{ .card = .{
                .warden = warden,
                .commitment = commitment,
                .padlock = padlock,
                .hints = carried,
            } };
        }
        if (object.count() != 6) return error.TestUnexpectedResult;
        return .{ .invitation = .{
            .warden = warden,
            .commitment = commitment,
            .padlock = padlock,
            .heir = try key(a, try field(object, "heir")),
            .heir_secret = try key(a, try field(object, "heirSecret")),
            .hints = carried,
        } };
    }

    for (records) |block| {
        if (!std.mem.eql(u8, block.name, type_text)) continue;
        const object = switch (json) {
            .object => |o| o,
            else => return error.TestUnexpectedResult,
        };
        // An object keyed by the names the blueprint declares, and by no
        // others: a stray key would be a value this suite never asserted.
        if (object.count() != block.fields.len) return error.TestUnexpectedResult;
        const out = try a.alloc(wire.Value, block.fields.len);
        for (block.fields, out) |declared, *slot| {
            slot.* = try valueOf(
                a,
                declared.answer orelse return error.TestUnexpectedResult,
                records,
                try field(object, declared.name),
            );
        }
        return .{ .record = out };
    }

    return error.TestUnexpectedResult;
}

/// The type under test is the one field of the vector's blueprint.
fn typeUnderTest(blueprint: notation.Blueprint) ![]const u8 {
    if (blueprint.class.fields.len != 1) return error.TestUnexpectedResult;
    return blueprint.class.fields[0].answer orelse error.TestUnexpectedResult;
}

test "the pinned corpus" {
    const gpa = std.testing.allocator;

    const text = try read(gpa, wire_path);
    defer gpa.free(text);

    const parsed = try std.json.parseFromSlice(Corpus, gpa, text, .{});
    defer parsed.deinit();

    try std.testing.expectEqualStrings("wire", parsed.value.area);
    try std.testing.expectEqualStrings("hex", parsed.value.encoding);
    try std.testing.expect(parsed.value.vectors.len > 0);

    var accepted: usize = 0;
    var refused: usize = 0;

    for (parsed.value.vectors) |v| {
        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();

        var blueprint = notation.parse(a, v.blueprint) catch {
            std.debug.print("blueprint refused for: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        };
        defer blueprint.deinit();

        const type_text = try typeUnderTest(blueprint);
        const raw = try bytes(a, v.bytes);

        if (v.refuses orelse false) {
            // Malformed bytes are the receiver's to refuse, and the refusal
            // is silence: one error and no other.
            std.testing.expectError(
                wire.Error.Refused,
                wire.decode(a, type_text, blueprint.records, raw),
            ) catch {
                std.debug.print("decoded what must be refused: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            refused += 1;
            continue;
        }

        const value = valueOf(a, type_text, blueprint.records, v.value) catch {
            std.debug.print("unrecognised vector shape: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        };

        // Written from the value, the bytes are the corpus's own.
        const written = try wire.encode(a, type_text, blueprint.records, value);
        const said = try hex(a, written);
        std.testing.expectEqualStrings(v.bytes, said) catch {
            std.debug.print("wrote other bytes for: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        };

        // Read back, the bytes are the value again, and nothing is left over.
        var decoded = wire.decode(a, type_text, blueprint.records, raw) catch {
            std.debug.print("refused what must be read: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        };
        defer decoded.deinit();
        if (!wire.equal(value, decoded.value)) {
            std.debug.print("read back another value for: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        }

        accepted += 1;
    }

    // A subset cannot pass.
    try std.testing.expectEqual(parsed.value.vectors.len, accepted + refused);

    var declared_refusals: usize = 0;
    for (parsed.value.vectors) |v| {
        if (v.refuses orelse false) declared_refusals += 1;
    }
    try std.testing.expectEqual(declared_refusals, refused);
}

// Refusals Article V names that no vector in the corpus covers.
test "the refusals the law names beyond the corpus" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var blueprint = try notation.parse(a,
        \\Probe
        \\  probe() int??
        \\
    );
    defer blueprint.deinit();
    const records = blueprint.records;

    // `T??` is an ordinary type and its two absences are two distinct byte
    // strings: the outer absence is one byte, the inner two.
    var outer = try wire.decode(a, "int??", records, &.{0x00});
    defer outer.deinit();
    try std.testing.expect(outer.value == .absent);

    var inner = try wire.decode(a, "int??", records, &.{ 0x01, 0x00 });
    defer inner.deinit();
    try std.testing.expect(inner.value == .present);
    try std.testing.expect(inner.value.present.* == .absent);

    // No type encodes to zero bytes: nothing at all is refused wherever a
    // value is due.
    for ([_][]const u8{ "bool", "int", "text", "bytes", "b32", "being", "invitation", "card", "[int]", "int?" }) |type_text| {
        try std.testing.expectError(
            wire.Error.Refused,
            wire.decode(a, type_text, records, ""),
        );
    }

    // A length that cannot be said as a non-negative `int`, and a count
    // beyond the bytes that remain.
    try std.testing.expectError(
        wire.Error.Refused,
        wire.decode(a, "bytes", records, &.{ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff }),
    );
    try std.testing.expectError(
        wire.Error.Refused,
        wire.decode(a, "[[bool]]", records, &.{ 0, 0, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0 }),
    );

    // A `bytes` that is present and empty is not an absent `bytes?`.
    const empty = try wire.encode(a, "bytes", records, .{ .bytes = "" });
    const nothing = try wire.encode(a, "bytes?", records, .absent);
    try std.testing.expectEqual(@as(usize, 8), empty.len);
    try std.testing.expectEqual(@as(usize, 1), nothing.len);
    try std.testing.expect(!std.mem.eql(u8, empty, nothing));

    // A byte order mark inside a `text` value is ordinary content.
    const marked = try wire.encode(a, "text", records, .{ .text = "\xEF\xBB\xBFhi" });
    try std.testing.expectEqual(@as(usize, 8 + 5), marked.len);

    // A value that does not wear the type it is written under never reaches
    // the wire.
    try std.testing.expectError(
        wire.Error.Refused,
        wire.encode(a, "int", records, .{ .boolean = true }),
    );
    // Text is UTF-8 in both directions.
    try std.testing.expectError(
        wire.Error.Refused,
        wire.encode(a, "text", records, .{ .text = "\xc3\x28" }),
    );
}
