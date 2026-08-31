//! The wire: the one way each closed type is written, and the refusals a
//! decoder owes. Article V of the constitution is the whole specification.
//!
//! A value's shape is not on the wire — no names, no tags, no lengths but the
//! ones the law names — so every read and every write is driven by the type
//! the blueprint declares. The type is its notation text, and the record
//! blocks that text may name come from the same blueprint.

const std = @import("std");
const notation = @import("notation");

pub const Error = error{Refused};

pub const key_length = 32;
pub const Key = [key_length]u8;

/// The five things a holder holds, as one typed value.
pub const Invitation = struct {
    warden: Key,
    commitment: Key,
    padlock: Key,
    heir: Key,
    heir_secret: Key,
    hints: []const []const u8,
};

/// The four things a stranger holds: the invitation without the voice.
pub const Card = struct {
    warden: Key,
    commitment: Key,
    padlock: Key,
    hints: []const []const u8,
};

/// One value of one closed type. Which variant a value wears is the
/// blueprint's business, not the wire's: a value that does not match the type
/// it is written under is refused.
pub const Value = union(enum) {
    boolean: bool,
    integer: i64,
    text: []const u8,
    bytes: []const u8,
    /// Thirty-two bytes naming nothing.
    b32: Key,
    /// Thirty-two bytes naming a being. Rides identically to `b32`.
    being: Key,
    invitation: Invitation,
    card: Card,
    list: []const Value,
    /// A `T?` that is not there.
    absent,
    /// A `T?` that is there. `T??` nests, and its two absences are two
    /// distinct byte strings.
    present: *const Value,
    /// A record's fields, in the order the blueprint declares them.
    record: []const Value,
};

/// A decoded value and the arena that owns every byte it points at.
pub const Decoded = struct {
    arena: std.heap.ArenaAllocator,
    value: Value,

    pub fn deinit(self: *Decoded) void {
        self.arena.deinit();
    }
};

const Fault = Error || std.mem.Allocator.Error;

// --------------------------------------------------------------- the shape

const Shape = union(enum) {
    closed: Closed,
    list: []const u8,
    optional: []const u8,
    record: notation.Block,
};

const Closed = enum { boolean, integer, text, bytes, b32, being, invitation, card };

fn closedOf(name: []const u8) ?Closed {
    const table = .{
        .{ "bool", Closed.boolean },
        .{ "int", Closed.integer },
        .{ "text", Closed.text },
        .{ "bytes", Closed.bytes },
        .{ "b32", Closed.b32 },
        .{ "being", Closed.being },
        .{ "invitation", Closed.invitation },
        .{ "card", Closed.card },
    };
    inline for (table) |entry| {
        if (std.mem.eql(u8, name, entry[0])) return entry[1];
    }
    return null;
}

/// The two combinators compose freely, and `?` binds outermost: `[int]?` is
/// an optional list, `[int?]` a list of optionals.
fn shapeOf(type_text: []const u8, records: []const notation.Block) Error!Shape {
    if (type_text.len == 0) return Error.Refused;
    if (type_text[type_text.len - 1] == '?') {
        return .{ .optional = type_text[0 .. type_text.len - 1] };
    }
    if (type_text[0] == '[' and type_text[type_text.len - 1] == ']') {
        return .{ .list = type_text[1 .. type_text.len - 1] };
    }
    if (closedOf(type_text)) |c| return .{ .closed = c };
    for (records) |r| {
        if (std.mem.eql(u8, r.name, type_text)) return .{ .record = r };
    }
    return Error.Refused;
}

// -------------------------------------------------------------- the writing

/// Write one value of one type. Nothing else reaches the wire.
pub fn encode(
    gpa: std.mem.Allocator,
    type_text: []const u8,
    records: []const notation.Block,
    value: Value,
) Fault![]u8 {
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(gpa);
    try write(gpa, &out, type_text, records, value);
    return out.toOwnedSlice(gpa);
}

fn putInt(gpa: std.mem.Allocator, out: *std.ArrayList(u8), n: i64) std.mem.Allocator.Error!void {
    var buf: [8]u8 = undefined;
    std.mem.writeInt(i64, &buf, n, .big);
    try out.appendSlice(gpa, &buf);
}

/// Every length and count is written the way an `int` is, and is non-negative
/// by rule — so a length that cannot be said as one is refused.
fn putCount(gpa: std.mem.Allocator, out: *std.ArrayList(u8), n: usize) Fault!void {
    const said = std.math.cast(i64, n) orelse return Error.Refused;
    try putInt(gpa, out, said);
}

fn putHints(gpa: std.mem.Allocator, out: *std.ArrayList(u8), hints: []const []const u8) Fault!void {
    try putCount(gpa, out, hints.len);
    for (hints) |hint| {
        if (!std.unicode.utf8ValidateSlice(hint)) return Error.Refused;
        try putCount(gpa, out, hint.len);
        try out.appendSlice(gpa, hint);
    }
}

fn write(
    gpa: std.mem.Allocator,
    out: *std.ArrayList(u8),
    type_text: []const u8,
    records: []const notation.Block,
    value: Value,
) Fault!void {
    switch (try shapeOf(type_text, records)) {
        .closed => |c| switch (c) {
            .boolean => {
                const v = switch (value) {
                    .boolean => |b| b,
                    else => return Error.Refused,
                };
                try out.append(gpa, if (v) 1 else 0);
            },
            .integer => {
                const v = switch (value) {
                    .integer => |n| n,
                    else => return Error.Refused,
                };
                try putInt(gpa, out, v);
            },
            .text => {
                const v = switch (value) {
                    .text => |t| t,
                    else => return Error.Refused,
                };
                // A length in front and UTF-8 after it; the length counts
                // bytes, not characters.
                if (!std.unicode.utf8ValidateSlice(v)) return Error.Refused;
                try putCount(gpa, out, v.len);
                try out.appendSlice(gpa, v);
            },
            .bytes => {
                const v = switch (value) {
                    .bytes => |b| b,
                    else => return Error.Refused,
                };
                try putCount(gpa, out, v.len);
                try out.appendSlice(gpa, v);
            },
            .b32 => {
                const v = switch (value) {
                    .b32 => |k| k,
                    else => return Error.Refused,
                };
                try out.appendSlice(gpa, &v);
            },
            .being => {
                const v = switch (value) {
                    .being => |k| k,
                    else => return Error.Refused,
                };
                try out.appendSlice(gpa, &v);
            },
            .invitation => {
                const v = switch (value) {
                    .invitation => |i| i,
                    else => return Error.Refused,
                };
                for ([_]Key{ v.warden, v.commitment, v.padlock, v.heir, v.heir_secret }) |k| {
                    try out.appendSlice(gpa, &k);
                }
                try putHints(gpa, out, v.hints);
            },
            .card => {
                const v = switch (value) {
                    .card => |c2| c2,
                    else => return Error.Refused,
                };
                for ([_]Key{ v.warden, v.commitment, v.padlock }) |k| {
                    try out.appendSlice(gpa, &k);
                }
                try putHints(gpa, out, v.hints);
            },
        },
        .list => |inner| {
            const items = switch (value) {
                .list => |l| l,
                else => return Error.Refused,
            };
            try putCount(gpa, out, items.len);
            for (items) |item| try write(gpa, out, inner, records, item);
        },
        .optional => |inner| switch (value) {
            .absent => try out.append(gpa, 0),
            .present => |held| {
                try out.append(gpa, 1);
                try write(gpa, out, inner, records, held.*);
            },
            else => return Error.Refused,
        },
        .record => |block| {
            const fields = switch (value) {
                .record => |f| f,
                else => return Error.Refused,
            };
            // Its fields, in the order the blueprint declares them, and
            // nothing else.
            if (fields.len != block.fields.len) return Error.Refused;
            for (block.fields, fields) |declared, held| {
                try write(gpa, out, declared.answer orelse return Error.Refused, records, held);
            }
        },
    }
}

// -------------------------------------------------------------- the reading

/// Read one value of one type. Bytes left over after a well-formed value has
/// been read are refused, like every other malformation, in silence.
pub fn decode(
    gpa: std.mem.Allocator,
    type_text: []const u8,
    records: []const notation.Block,
    raw: []const u8,
) Fault!Decoded {
    var arena = std.heap.ArenaAllocator.init(gpa);
    errdefer arena.deinit();

    var reader: Reader = .{ .a = arena.allocator(), .records = records, .rest = raw };
    const value = try reader.read(type_text);
    if (reader.rest.len != 0) return Error.Refused;

    return .{ .arena = arena, .value = value };
}

const Reader = struct {
    a: std.mem.Allocator,
    records: []const notation.Block,
    rest: []const u8,

    fn take(self: *Reader, n: usize) Error![]const u8 {
        if (n > self.rest.len) return Error.Refused;
        const out = self.rest[0..n];
        self.rest = self.rest[n..];
        return out;
    }

    fn takeKey(self: *Reader) Error!Key {
        var out: Key = undefined;
        @memcpy(&out, try self.take(key_length));
        return out;
    }

    fn readInt(self: *Reader) Error!i64 {
        const raw = try self.take(8);
        return std.mem.readInt(i64, raw[0..8], .big);
    }

    /// A negative length, a count beyond the bytes that remain, or a size
    /// beyond what the receiver can address is refused. No type encodes to
    /// zero bytes, so a count can never exceed the bytes that are left.
    fn readCount(self: *Reader) Error!usize {
        const said = try self.readInt();
        if (said < 0) return Error.Refused;
        const n = std.math.cast(usize, said) orelse return Error.Refused;
        if (n > self.rest.len) return Error.Refused;
        return n;
    }

    fn readHints(self: *Reader) Fault![]const []const u8 {
        const count = try self.readCount();
        const out = try self.a.alloc([]const u8, count);
        for (out) |*hint| {
            const length = try self.readCount();
            const raw = try self.take(length);
            if (!std.unicode.utf8ValidateSlice(raw)) return Error.Refused;
            hint.* = raw;
        }
        return out;
    }

    fn read(self: *Reader, type_text: []const u8) Fault!Value {
        switch (try shapeOf(type_text, self.records)) {
            .closed => |c| switch (c) {
                .boolean => {
                    const byte = (try self.take(1))[0];
                    // Where this text does not say what something means, it
                    // is refused.
                    if (byte > 1) return Error.Refused;
                    return .{ .boolean = byte == 1 };
                },
                .integer => return .{ .integer = try self.readInt() },
                .text => {
                    const length = try self.readCount();
                    const raw = try self.take(length);
                    if (!std.unicode.utf8ValidateSlice(raw)) return Error.Refused;
                    return .{ .text = raw };
                },
                .bytes => {
                    const length = try self.readCount();
                    return .{ .bytes = try self.take(length) };
                },
                .b32 => return .{ .b32 = try self.takeKey() },
                .being => return .{ .being = try self.takeKey() },
                .invitation => return .{ .invitation = .{
                    .warden = try self.takeKey(),
                    .commitment = try self.takeKey(),
                    .padlock = try self.takeKey(),
                    .heir = try self.takeKey(),
                    .heir_secret = try self.takeKey(),
                    .hints = try self.readHints(),
                } },
                .card => return .{ .card = .{
                    .warden = try self.takeKey(),
                    .commitment = try self.takeKey(),
                    .padlock = try self.takeKey(),
                    .hints = try self.readHints(),
                } },
            },
            .list => |inner| {
                const count = try self.readCount();
                const items = try self.a.alloc(Value, count);
                for (items) |*item| item.* = try self.read(inner);
                return .{ .list = items };
            },
            .optional => |inner| {
                const marker = (try self.take(1))[0];
                if (marker == 0) return .absent;
                if (marker != 1) return Error.Refused;
                const held = try self.a.create(Value);
                held.* = try self.read(inner);
                return .{ .present = held };
            },
            .record => |block| {
                const fields = try self.a.alloc(Value, block.fields.len);
                for (block.fields, fields) |declared, *held| {
                    held.* = try self.read(declared.answer orelse return Error.Refused);
                }
                return .{ .record = fields };
            },
        }
    }
};

// ------------------------------------------------------------ the comparison

/// Two values are the same value when they wear the same variant and say the
/// same thing. Nothing on the wire depends on this; a caller comparing what it
/// wrote with what it read does.
pub fn equal(x: Value, y: Value) bool {
    if (std.meta.activeTag(x) != std.meta.activeTag(y)) return false;
    return switch (x) {
        .boolean => x.boolean == y.boolean,
        .integer => x.integer == y.integer,
        .text => std.mem.eql(u8, x.text, y.text),
        .bytes => std.mem.eql(u8, x.bytes, y.bytes),
        .b32 => std.mem.eql(u8, &x.b32, &y.b32),
        .being => std.mem.eql(u8, &x.being, &y.being),
        .invitation => std.mem.eql(u8, &x.invitation.warden, &y.invitation.warden) and
            std.mem.eql(u8, &x.invitation.commitment, &y.invitation.commitment) and
            std.mem.eql(u8, &x.invitation.padlock, &y.invitation.padlock) and
            std.mem.eql(u8, &x.invitation.heir, &y.invitation.heir) and
            std.mem.eql(u8, &x.invitation.heir_secret, &y.invitation.heir_secret) and
            sameHints(x.invitation.hints, y.invitation.hints),
        .card => std.mem.eql(u8, &x.card.warden, &y.card.warden) and
            std.mem.eql(u8, &x.card.commitment, &y.card.commitment) and
            std.mem.eql(u8, &x.card.padlock, &y.card.padlock) and
            sameHints(x.card.hints, y.card.hints),
        .list => sameAll(x.list, y.list),
        .absent => true,
        .present => equal(x.present.*, y.present.*),
        .record => sameAll(x.record, y.record),
    };
}

fn sameAll(x: []const Value, y: []const Value) bool {
    if (x.len != y.len) return false;
    for (x, y) |a, b| {
        if (!equal(a, b)) return false;
    }
    return true;
}

fn sameHints(x: []const []const u8, y: []const []const u8) bool {
    if (x.len != y.len) return false;
    for (x, y) |a, b| {
        if (!std.mem.eql(u8, a, b)) return false;
    }
    return true;
}
