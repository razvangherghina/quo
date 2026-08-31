//! Every case in the pinned corpus, reproduced. A refusal is asserted as
//! strictly as an acceptance.

const std = @import("std");
const notation = @import("notation");
const vectors_path = @import("vectors").notation_path;

const Vector = struct {
    name: []const u8,
    law: []const u8,
    blueprint: []const u8,
    canonical: ?[]const u8 = null,
    digest: ?[]const u8 = null,
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

fn hex(a: std.mem.Allocator, bytes: []const u8) ![]u8 {
    const out = try a.alloc(u8, bytes.len * 2);
    _ = std.fmt.bufPrint(out, "{x}", .{bytes}) catch unreachable;
    return out;
}

test "the pinned corpus" {
    const a = std.testing.allocator;

    var threaded: std.Io.Threaded = .init(a, .{});
    defer threaded.deinit();

    const text = try std.Io.Dir.cwd().readFileAlloc(threaded.io(), vectors_path, a, .limited(1 << 20));
    defer a.free(text);

    const parsed = try std.json.parseFromSlice(Corpus, a, text, .{});
    defer parsed.deinit();

    try std.testing.expectEqualStrings("notation", parsed.value.area);
    try std.testing.expectEqualStrings("hex", parsed.value.encoding);
    try std.testing.expect(parsed.value.vectors.len > 0);

    var accepted: usize = 0;
    var refused: usize = 0;

    for (parsed.value.vectors) |v| {
        if (v.refuses orelse false) {
            const result = notation.parse(a, v.blueprint);
            if (result) |*ok| {
                var b = ok.*;
                b.deinit();
                std.debug.print("accepted what must be refused: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            } else |err| {
                std.testing.expectEqual(notation.Error.Refused, err) catch {
                    std.debug.print("wrong error for: {s}\n", .{v.name});
                    return error.TestUnexpectedResult;
                };
            }
            refused += 1;
            continue;
        }

        var blueprint = notation.parse(a, v.blueprint) catch |err| {
            std.debug.print("refused what must be accepted: {s} ({any})\n", .{ v.name, err });
            return error.TestUnexpectedResult;
        };
        defer blueprint.deinit();

        const canonical_hex = try hex(a, blueprint.canonical);
        defer a.free(canonical_hex);
        const digest_bytes = blueprint.digest();
        const digest_hex = try hex(a, &digest_bytes);
        defer a.free(digest_hex);

        std.testing.expectEqualStrings(v.canonical.?, canonical_hex) catch {
            std.debug.print("canonical disagrees for: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        };
        std.testing.expectEqualStrings(v.digest.?, digest_hex) catch {
            std.debug.print("digest disagrees for: {s}\n", .{v.name});
            return error.TestUnexpectedResult;
        };
        accepted += 1;
    }

    // Every case in the corpus was reproduced, and both kinds were present.
    try std.testing.expectEqual(parsed.value.vectors.len, accepted + refused);
    try std.testing.expect(accepted > 0);
    try std.testing.expect(refused > 0);
}

test "refusals the law names that the corpus does not pin" {
    const a = std.testing.allocator;
    const cases = [_][]const u8{
        // A record block declared twice.
        "Order\n  first() a\n\na\n  x int\n\na\n  y int\n",
        // An argument named twice in one list.
        "Small\n  pair(one text, one int) bool\n",
        // A record wearing the name of a closed type.
        "Order\n  first() text\n\ntext\n  x int\n",
        // A record wearing the class's own name.
        "Order\n  first() Order\n\nOrder\n  x int\n",
        // An empty argument list written with a comma.
        "Small\n  yes(, ) bool\n",
        // A field that is only a name.
        "Small\n  yes\n",
    };
    for (cases) |text| {
        const result = notation.parse(a, text);
        if (result) |*ok| {
            var b = ok.*;
            b.deinit();
            std.debug.print("accepted what must be refused: {s}\n", .{text});
            return error.TestUnexpectedResult;
        } else |err| {
            try std.testing.expectEqual(notation.Error.Refused, err);
        }
    }
}

test "the combinators compose freely" {
    const a = std.testing.allocator;
    const text = "Deep\n  a() [[text]]\n  b() [int?]\n  c() [b32]?\n  d(one r, two [r?]) r\n\nr\n  x int\n";
    var blueprint = try notation.parse(a, text);
    defer blueprint.deinit();
    try std.testing.expectEqualStrings("Deep", blueprint.class.name);
    try std.testing.expectEqual(@as(usize, 1), blueprint.records.len);
    try std.testing.expectEqual(@as(usize, 4), blueprint.class.fields.len);
}
