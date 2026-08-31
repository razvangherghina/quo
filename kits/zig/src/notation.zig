//! The notation: a blueprint's canonical text, its grammar, and its digest.
//! Article IV of the constitution is the whole specification.

const std = @import("std");

pub const Error = error{Refused};

/// The closed types, in the order the constitution lists them.
pub const closed_types = [_][]const u8{
    "bool",
    "int",
    "text",
    "bytes",
    "b32",
    "being",
    "invitation",
    "card",
};

pub const Argument = struct {
    name: []const u8,
    type: []const u8,
};

pub const Field = struct {
    name: []const u8,
    /// Empty for a record field, which carries no parentheses.
    arguments: []const Argument,
    /// A class field answers nothing when this is null. A record field
    /// always answers, and its type is here.
    answer: ?[]const u8,
};

pub const Block = struct {
    name: []const u8,
    fields: []const Field,
};

pub const Blueprint = struct {
    arena: std.heap.ArenaAllocator,
    /// The canonical text, byte for byte as it was read.
    canonical: []const u8,
    class: Block,
    records: []const Block,

    pub fn deinit(self: *Blueprint) void {
        self.arena.deinit();
    }

    pub fn digest(self: Blueprint) [32]u8 {
        return digestOf(self.canonical);
    }
};

/// SHA-256 over the canonical text as UTF-8.
pub fn digestOf(canonical: []const u8) [32]u8 {
    var out: [32]u8 = undefined;
    std.crypto.hash.sha2.Sha256.hash(canonical, &out, .{});
    return out;
}

/// Read a blueprint, refusing anything the notation does not allow.
/// The returned blueprint borrows `text`; it must outlive the blueprint.
pub fn parse(gpa: std.mem.Allocator, text: []const u8) (Error || std.mem.Allocator.Error)!Blueprint {
    var arena = std.heap.ArenaAllocator.init(gpa);
    errdefer arena.deinit();
    const a = arena.allocator();

    const blocks = try readBlocks(a, text);
    if (blocks.len == 0) return Error.Refused;

    const class = blocks[0];
    const records = blocks[1..];

    // No block wearing a closed type's name — the class included — no block
    // declared twice, no record wearing the class's own name.
    if (isClosed(class.name)) return Error.Refused;
    for (records, 0..) |r, i| {
        if (isClosed(r.name)) return Error.Refused;
        if (std.mem.eql(u8, r.name, class.name)) return Error.Refused;
        for (records[0..i]) |earlier| {
            if (std.mem.eql(u8, earlier.name, r.name)) return Error.Refused;
        }
    }

    // Every type names a closed type or a declared record.
    for (blocks) |b| {
        for (b.fields) |f| {
            for (f.arguments) |arg| try checkType(arg.type, records);
            if (f.answer) |ans| try checkType(ans, records);
        }
    }

    try checkOrder(a, class, records);

    return .{
        .arena = arena,
        .canonical = text,
        .class = class,
        .records = records,
    };
}

// ---------------------------------------------------------------- the text

fn readBlocks(a: std.mem.Allocator, text: []const u8) (Error || std.mem.Allocator.Error)![]const Block {
    if (text.len == 0) return Error.Refused;
    // No byte order mark: a mark stripped would be a second way to write one text.
    if (std.mem.startsWith(u8, text, "\xEF\xBB\xBF")) return Error.Refused;
    // Newline means the one byte.
    if (std.mem.indexOfScalar(u8, text, '\r') != null) return Error.Refused;
    // A final newline, and no trailing blank line.
    if (text[text.len - 1] != '\n') return Error.Refused;
    if (text.len >= 2 and text[text.len - 2] == '\n') return Error.Refused;

    var lines: std.ArrayList([]const u8) = .empty;
    var it = std.mem.splitScalar(u8, text[0 .. text.len - 1], '\n');
    while (it.next()) |line| try lines.append(a, line);

    var blocks: std.ArrayList(Block) = .empty;
    var fields: std.ArrayList(Field) = .empty;
    var name: ?[]const u8 = null;
    var expect_header = true;

    for (lines.items) |line| {
        // No trailing space, no comments, no tabs.
        if (line.len > 0 and line[line.len - 1] == ' ') return Error.Refused;
        if (std.mem.indexOfScalar(u8, line, '\t') != null) return Error.Refused;

        if (line.len == 0) {
            // No blank line but the one between blocks, and never an empty block.
            if (name == null or fields.items.len == 0) return Error.Refused;
            try blocks.append(a, .{ .name = name.?, .fields = try fields.toOwnedSlice(a) });
            name = null;
            expect_header = true;
            continue;
        }

        if (line[0] != ' ') {
            if (!expect_header) return Error.Refused;
            if (!isIdentifier(line)) return Error.Refused;
            name = line;
            expect_header = false;
            continue;
        }

        // Two spaces of indent, exactly.
        if (line.len < 3 or line[1] != ' ' or line[2] == ' ') return Error.Refused;
        if (name == null) return Error.Refused;
        const is_class = blocks.items.len == 0;
        const field = try readField(a, line[2..], is_class);
        for (fields.items) |earlier| {
            if (std.mem.eql(u8, earlier.name, field.name)) return Error.Refused;
        }
        try fields.append(a, field);
    }

    if (name == null or fields.items.len == 0) return Error.Refused;
    try blocks.append(a, .{ .name = name.?, .fields = try fields.toOwnedSlice(a) });
    return blocks.toOwnedSlice(a);
}

fn readField(a: std.mem.Allocator, line: []const u8, is_class: bool) (Error || std.mem.Allocator.Error)!Field {
    if (!is_class) {
        // No field in a record block carries parentheses.
        if (std.mem.indexOfAny(u8, line, "()") != null) return Error.Refused;
        const space = std.mem.indexOfScalar(u8, line, ' ') orelse return Error.Refused;
        const fname = line[0..space];
        const ftype = line[space + 1 ..];
        if (!isIdentifier(fname)) return Error.Refused;
        try checkTypeShape(ftype);
        return .{ .name = fname, .arguments = &.{}, .answer = ftype };
    }

    // Every field in a class block carries parentheses.
    const open = std.mem.indexOfScalar(u8, line, '(') orelse return Error.Refused;
    const close = std.mem.indexOfScalar(u8, line, ')') orelse return Error.Refused;
    if (close < open) return Error.Refused;
    if (std.mem.indexOfScalar(u8, line[close + 1 ..], ')') != null) return Error.Refused;
    if (std.mem.indexOfScalar(u8, line[open + 1 ..], '(') != null) return Error.Refused;

    const fname = line[0..open];
    if (!isIdentifier(fname)) return Error.Refused;

    const arguments = try readArguments(a, line[open + 1 .. close]);

    const rest = line[close + 1 ..];
    var answer: ?[]const u8 = null;
    if (rest.len != 0) {
        // One space between tokens.
        if (rest[0] != ' ') return Error.Refused;
        const ftype = rest[1..];
        try checkTypeShape(ftype);
        answer = ftype;
    }
    return .{ .name = fname, .arguments = arguments, .answer = answer };
}

fn readArguments(a: std.mem.Allocator, list: []const u8) (Error || std.mem.Allocator.Error)![]const Argument {
    if (list.len == 0) return &.{};

    var out: std.ArrayList(Argument) = .empty;
    var rest = list;
    var first = true;
    while (true) {
        // Two arguments separate with a comma and one space.
        var piece = rest;
        if (std.mem.indexOfScalar(u8, rest, ',')) |comma| {
            piece = rest[0..comma];
            const after = rest[comma + 1 ..];
            if (after.len < 2 or after[0] != ' ' or after[1] == ' ') return Error.Refused;
            rest = after[1..];
        } else {
            rest = "";
        }
        if (!first and piece.len == 0) return Error.Refused;
        first = false;

        const space = std.mem.indexOfScalar(u8, piece, ' ') orelse return Error.Refused;
        const aname = piece[0..space];
        const atype = piece[space + 1 ..];
        if (!isIdentifier(aname)) return Error.Refused;
        try checkTypeShape(atype);
        for (out.items) |earlier| {
            // An argument named twice in one list.
            if (std.mem.eql(u8, earlier.name, aname)) return Error.Refused;
        }
        try out.append(a, .{ .name = aname, .type = atype });

        if (rest.len == 0) break;
    }
    return out.toOwnedSlice(a);
}

// --------------------------------------------------------------- the types

fn isIdentifier(s: []const u8) bool {
    // A letter, then letters and digits. ASCII, and nothing else.
    if (s.len == 0) return false;
    if (!std.ascii.isAlphabetic(s[0])) return false;
    for (s[1..]) |c| {
        if (!std.ascii.isAlphanumeric(c)) return false;
    }
    return true;
}

fn isClosed(s: []const u8) bool {
    for (closed_types) |t| {
        if (std.mem.eql(u8, s, t)) return true;
    }
    return false;
}

/// The base name a type reduces to once both combinators are unwrapped.
fn baseOf(s: []const u8) ?[]const u8 {
    if (s.len == 0) return null;
    if (s[s.len - 1] == '?') return baseOf(s[0 .. s.len - 1]);
    if (s[0] == '[' and s[s.len - 1] == ']') return baseOf(s[1 .. s.len - 1]);
    if (!isIdentifier(s)) return null;
    return s;
}

fn checkTypeShape(s: []const u8) Error!void {
    _ = baseOf(s) orelse return Error.Refused;
}

fn checkType(s: []const u8, records: []const Block) Error!void {
    const base = baseOf(s) orelse return Error.Refused;
    if (isClosed(base)) return;
    for (records) |r| {
        if (std.mem.eql(u8, r.name, base)) return;
    }
    return Error.Refused;
}

// --------------------------------------------------------------- the order

const Walk = struct {
    a: std.mem.Allocator,
    records: []const Block,
    order: std.ArrayList([]const u8) = .empty,
    stack: std.ArrayList([]const u8) = .empty,

    fn find(self: Walk, base: []const u8) ?Block {
        for (self.records) |r| {
            if (std.mem.eql(u8, r.name, base)) return r;
        }
        return null;
    }

    fn seen(list: std.ArrayList([]const u8), base: []const u8) bool {
        for (list.items) |n| {
            if (std.mem.eql(u8, n, base)) return true;
        }
        return false;
    }

    fn visit(self: *Walk, type_text: []const u8) (Error || std.mem.Allocator.Error)!void {
        const base = baseOf(type_text) orelse return Error.Refused;
        const record = self.find(base) orelse return; // a closed type
        // A record may not reach itself, directly or through another record.
        if (seen(self.stack, base)) return Error.Refused;
        if (seen(self.order, base)) return;
        try self.order.append(self.a, base);
        try self.stack.append(self.a, base);
        for (record.fields) |f| {
            if (f.answer) |ans| try self.visit(ans);
        }
        _ = self.stack.pop();
    }
};

fn checkOrder(a: std.mem.Allocator, class: Block, records: []const Block) (Error || std.mem.Allocator.Error)!void {
    var walk: Walk = .{ .a = a, .records = records };
    // First use runs left to right as the field is written: its arguments in
    // their declared order, then what it answers.
    for (class.fields) |f| {
        for (f.arguments) |arg| try walk.visit(arg.type);
        if (f.answer) |ans| try walk.visit(ans);
    }
    // A record nothing uses, and a block written out of the derived order,
    // are both refused rather than quietly reordered.
    if (walk.order.items.len != records.len) return Error.Refused;
    for (records, walk.order.items) |declared, derived| {
        if (!std.mem.eql(u8, declared.name, derived)) return Error.Refused;
    }
}
