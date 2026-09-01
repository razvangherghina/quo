//! The warden: the door's judgment. Article IX gives the one blueprint every
//! warden holds, Article X the three describes, Article VII the two records
//! and the standings they keep, Article VIII the seq and the leash, and
//! Article XII the eight steps in their order.
//!
//! The warden is the judgment and never the road. Nothing here reads a
//! socket, holds a connection or knows a carriage: a letter arrives as bytes
//! and a verdict goes back as a routing decision the ground carries out.
//!
//! Every failure is the same failure — `Error.Refused` — and no caller ever
//! learns which step said no.

const std = @import("std");
const notation = @import("notation");
const wire = @import("wire");
const arithmetic = @import("arithmetic");
const envelope = @import("envelope");

pub const Error = error{Refused};
const Fault = Error || std.mem.Allocator.Error;

pub const key_length = arithmetic.key_length;
pub const Key = arithmetic.Key;
pub const Method = envelope.Method;
pub const Say = envelope.Say;
pub const Answer = envelope.Answer;
/// The five things a holder holds. It is `remember`'s one argument, so a
/// caller of this module never has to reach for the wire's own module.
pub const Invitation = wire.Invitation;

/// The one blueprint nobody authors and every warden holds. Its digest is the
/// same on every ground in the world, so this text is copied from Article IX
/// byte for byte and is never regenerated from anything.
pub const blueprint_text =
    \\Warden
    \\  describe() estate
    \\  sketch(being being) sketch?
    \\  blueprint(digest b32) text?
    \\  limit() int
    \\  tell(word word)
    \\  moved(being being) word?
    \\  receive(cargo cargo) b32
    \\
    \\estate
    \\  classes [class]
    \\
    \\class
    \\  digest b32
    \\  beings [held]
    \\
    \\held
    \\  being being
    \\  commitment b32
    \\
    \\sketch
    \\  being being
    \\  digest b32
    \\  commitment b32
    \\
    \\word
    \\  being being?
    \\  successor b32?
    \\  commitment b32?
    \\  name b32?
    \\  padlock b32?
    \\  hints [text]
    \\
    \\cargo
    \\  being being
    \\  digest b32
    \\  cells bytes
    \\  standings [standing]
    \\  relations [relation]
    \\
    \\standing
    \\  voice b32
    \\  commitment b32
    \\  name b32
    \\  beings [being]
    \\  mark int
    \\  spent [int]
    \\  padlock b32?
    \\  hints [text]
    \\
    \\relation
    \\  warden being
    \\  commitment b32
    \\  padlock b32
    \\  voice b32
    \\  secret b32
    \\  heir b32
    \\  heirSecret b32
    \\  seq int
    \\  news int
    \\  hints [text]
    \\
;

/// The digest of the blueprint every warden holds.
pub fn digest() Key {
    return notation.digestOf(blueprint_text);
}

fn shapes(a: std.mem.Allocator) Fault!notation.Blueprint {
    return notation.parse(a, blueprint_text) catch |e| switch (e) {
        error.OutOfMemory => error.OutOfMemory,
        else => Error.Refused,
    };
}

// ----------------------------------------------------------- what a describe says

/// One being under a class: its pk and its heir commitment.
pub const Held = struct {
    being: Key,
    commitment: Key,
};

/// One class in an estate: the digest of its blueprint and the beings of it.
pub const Class = struct {
    digest: Key,
    beings: []const Held,
};

/// Every being a voice may reach, given as digests with the pks under each.
pub const Estate = struct {
    classes: []const Class,
};

/// One being: its pk, the digest of its blueprint, and its heir commitment.
pub const Sketch = struct {
    being: Key,
    digest: Key,
    commitment: Key,
};

/// What news carries. Fields that mean nothing in a case are absent, not
/// filled.
pub const Word = struct {
    being: ?Key = null,
    successor: ?Key = null,
    commitment: ?Key = null,
    name: ?Key = null,
    padlock: ?Key = null,
    hints: []const []const u8 = &.{},
};

/// The order is derived, never chosen: classes by their digest bytes
/// ascending, beings under each by their pk bytes ascending. Two wardens
/// describing one estate produce one byte sequence, so ordering happens here
/// and no caller is trusted to have done it.
pub fn order(a: std.mem.Allocator, estate: Estate) std.mem.Allocator.Error!Estate {
    const classes = try a.alloc(Class, estate.classes.len);
    for (estate.classes, classes) |from, *into| {
        const beings = try a.dupe(Held, from.beings);
        std.mem.sort(Held, beings, {}, struct {
            fn less(_: void, x: Held, y: Held) bool {
                return std.mem.order(u8, &x.being, &y.being) == .lt;
            }
        }.less);
        into.* = .{ .digest = from.digest, .beings = beings };
    }
    std.mem.sort(Class, classes, {}, struct {
        fn less(_: void, x: Class, y: Class) bool {
            return std.mem.order(u8, &x.digest, &y.digest) == .lt;
        }
    }.less);
    return .{ .classes = classes };
}

fn hintsValue(a: std.mem.Allocator, hints: []const []const u8) std.mem.Allocator.Error!wire.Value {
    const items = try a.alloc(wire.Value, hints.len);
    for (hints, items) |text, *slot| slot.* = .{ .text = text };
    return .{ .list = items };
}

fn optionalKey(a: std.mem.Allocator, held: ?Key, names_a_being: bool) std.mem.Allocator.Error!wire.Value {
    const k = held orelse return .absent;
    const inner = try a.create(wire.Value);
    inner.* = if (names_a_being) .{ .being = k } else .{ .b32 = k };
    return .{ .present = inner };
}

fn estateValue(a: std.mem.Allocator, estate: Estate) std.mem.Allocator.Error!wire.Value {
    const classes = try a.alloc(wire.Value, estate.classes.len);
    for (estate.classes, classes) |c, *slot| {
        const beings = try a.alloc(wire.Value, c.beings.len);
        for (c.beings, beings) |h, *under| {
            const pair = try a.alloc(wire.Value, 2);
            pair[0] = .{ .being = h.being };
            pair[1] = .{ .b32 = h.commitment };
            under.* = .{ .record = pair };
        }
        const fields = try a.alloc(wire.Value, 2);
        fields[0] = .{ .b32 = c.digest };
        fields[1] = .{ .list = beings };
        slot.* = .{ .record = fields };
    }
    const outer = try a.alloc(wire.Value, 1);
    outer[0] = .{ .list = classes };
    return .{ .record = outer };
}

fn encodeUnder(gpa: std.mem.Allocator, type_text: []const u8, value_of: anytype, subject: anytype) Fault![]u8 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var blueprint = try shapes(a);
    defer blueprint.deinit();

    const value = try value_of(a, subject);
    return wire.encode(gpa, type_text, blueprint.records, value) catch |e| switch (e) {
        error.OutOfMemory => error.OutOfMemory,
        else => Error.Refused,
    };
}

/// An estate on the wire, ordered first. What a describe hands back is the
/// blueprint and never a being's state.
pub fn encodeEstate(gpa: std.mem.Allocator, estate: Estate) Fault![]u8 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const ordered = try order(arena.allocator(), estate);
    return encodeUnder(gpa, "estate", estateValue, ordered);
}

fn sketchValue(a: std.mem.Allocator, sketch: Sketch) std.mem.Allocator.Error!wire.Value {
    const fields = try a.alloc(wire.Value, 3);
    fields[0] = .{ .being = sketch.being };
    fields[1] = .{ .b32 = sketch.digest };
    fields[2] = .{ .b32 = sketch.commitment };
    return .{ .record = fields };
}

pub fn encodeSketch(gpa: std.mem.Allocator, sketch: Sketch) Fault![]u8 {
    return encodeUnder(gpa, "sketch", sketchValue, sketch);
}

fn wordValue(a: std.mem.Allocator, word: Word) std.mem.Allocator.Error!wire.Value {
    const fields = try a.alloc(wire.Value, 6);
    fields[0] = try optionalKey(a, word.being, true);
    fields[1] = try optionalKey(a, word.successor, false);
    fields[2] = try optionalKey(a, word.commitment, false);
    fields[3] = try optionalKey(a, word.name, false);
    fields[4] = try optionalKey(a, word.padlock, false);
    fields[5] = try hintsValue(a, word.hints);
    return .{ .record = fields };
}

pub fn encodeWord(gpa: std.mem.Allocator, word: Word) Fault![]u8 {
    return encodeUnder(gpa, "word", wordValue, word);
}

/// The Warden blueprint declares `sketch(being being) sketch?` and
/// `moved(being being) word?`, so each answer wears the optional its field
/// declared.
fn optionalSketch(a: std.mem.Allocator, sketch: Sketch) std.mem.Allocator.Error!wire.Value {
    const held = try a.create(wire.Value);
    held.* = try sketchValue(a, sketch);
    return .{ .present = held };
}

fn optionalWord(a: std.mem.Allocator, word: ?Word) std.mem.Allocator.Error!wire.Value {
    const held = word orelse return .absent;
    const record = try a.create(wire.Value);
    record.* = try wordValue(a, held);
    return .{ .present = record };
}

/// Write one value as the answer type the blueprint declares for that field,
/// so a field's answer can only ever wear the shape it promised.
fn answerOf(gpa: std.mem.Allocator, field: []const u8, value: wire.Value) Fault![]u8 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var blueprint = try shapes(a);
    defer blueprint.deinit();
    const declared = fieldOf(blueprint.class, field) orelse return Error.Refused;
    const answer_type = declared.answer orelse return Error.Refused;
    return wire.encode(gpa, answer_type, blueprint.records, value) catch |e| switch (e) {
        error.OutOfMemory => error.OutOfMemory,
        else => Error.Refused,
    };
}

fn fieldOf(class: notation.Block, name: []const u8) ?notation.Field {
    for (class.fields) |f| {
        if (std.mem.eql(u8, f.name, name)) return f;
    }
    return null;
}

/// Every field of the Warden blueprint takes at most one argument, so the
/// blob is that argument alone and needs no second decoder. A surplus byte to
/// a field that takes none is refused, as a surplus byte is everywhere.
fn oneArgument(
    a: std.mem.Allocator,
    blueprint: notation.Blueprint,
    field: notation.Field,
    args: []const u8,
) Fault!?wire.Value {
    if (field.arguments.len == 0) {
        if (args.len != 0) return Error.Refused;
        return null;
    }
    // The bytes an argument is read from are the ask's own scratch, so the
    // arena that owns the result owns a copy of them too.
    const owned = try a.dupe(u8, args);
    const decoded = wire.decode(a, field.arguments[0].type, blueprint.records, owned) catch |e| switch (e) {
        error.OutOfMemory => return error.OutOfMemory,
        else => return Error.Refused,
    };
    return decoded.value;
}

/// One standing as it travels: the voice, what it may reach, the name its
/// commitment was minted under, and the replay record whole.
pub const Standing = struct {
    voice: Key,
    commitment: Key,
    /// The name the heir commitment was minted under (Article XIV), without
    /// which a migrated standing could never verify an older commitment again.
    name: Key,
    beings: []const Key = &.{},
    mark: i64 = 0,
    spent: []const i64 = &.{},
    padlock: ?Key = null,
    hints: []const []const u8 = &.{},
};

/// One relation as it travels: the far house, both of the voice's keys, and
/// **two counters, because one field cannot be two counters** — what this door
/// has sent that peer, and the mark it keeps against that peer's news.
pub const Relation = struct {
    warden: Key,
    commitment: Key,
    padlock: Key,
    voice: Key,
    secret: Key,
    heir: Key,
    heir_secret: Key,
    seq: i64 = 0,
    news: i64 = 0,
    hints: []const []const u8 = &.{},
};

/// A migration's state transfer: the being's class, its cells, and both
/// records of standings — the inbound one so its peers keep their standing at
/// it, the outbound one so it keeps its standing at theirs.
pub const Cargo = struct {
    being: Key,
    digest: Key,
    cells: []const u8 = &.{},
    standings: []const Standing = &.{},
    relations: []const Relation = &.{},
};

/// A word and the arena that owns every byte it points at.
pub const ReadWord = struct {
    arena: std.heap.ArenaAllocator,
    word: Word,

    pub fn deinit(self: *ReadWord) void {
        self.arena.deinit();
    }
};

fn keyOf(value: wire.Value) Error!Key {
    return switch (value) {
        .b32 => |k| k,
        .being => |k| k,
        else => Error.Refused,
    };
}

fn optionalKeyOf(value: wire.Value) Error!?Key {
    return switch (value) {
        .absent => null,
        .present => |held| try keyOf(held.*),
        else => Error.Refused,
    };
}

/// News arguments are one `word`, decoded by the notation's own rules.
pub fn decodeWord(gpa: std.mem.Allocator, raw: []const u8) Fault!ReadWord {
    var arena = std.heap.ArenaAllocator.init(gpa);
    errdefer arena.deinit();
    const a = arena.allocator();

    const blueprint = try shapes(a);
    // The bytes a word is read from are the ask's own scratch, so the arena
    // that owns the result owns a copy of them too.
    const owned = try a.dupe(u8, raw);

    const decoded = wire.decode(a, "word", blueprint.records, owned) catch |e| switch (e) {
        error.OutOfMemory => return error.OutOfMemory,
        else => return Error.Refused,
    };

    const fields = switch (decoded.value) {
        .record => |f| f,
        else => return Error.Refused,
    };
    if (fields.len != 6) return Error.Refused;

    const raw_hints = switch (fields[5]) {
        .list => |items| items,
        else => return Error.Refused,
    };
    const hints = try a.alloc([]const u8, raw_hints.len);
    for (raw_hints, hints) |item, *slot| {
        slot.* = switch (item) {
            .text => |t| t,
            else => return Error.Refused,
        };
    }

    return .{ .arena = arena, .word = .{
        .being = try optionalKeyOf(fields[0]),
        .successor = try optionalKeyOf(fields[1]),
        .commitment = try optionalKeyOf(fields[2]),
        .name = try optionalKeyOf(fields[3]),
        .padlock = try optionalKeyOf(fields[4]),
        .hints = hints,
    } };
}

/// Every list in a cargo is ordered, and the order is derived rather than
/// chosen: standings by the voice's bytes, relations by the far warden's,
/// beings under a standing by their pk bytes, and spent numerically — all
/// ascending (Article IX). A cargo crosses the wire, so two wardens packing one
/// being must produce one byte string, and the ordering is imposed here, where
/// the bytes are made, rather than trusted to whoever composed the record.
fn byKey(_: void, x: Key, y: Key) bool {
    return std.mem.lessThan(u8, &x, &y);
}

fn byVoice(_: void, x: Standing, y: Standing) bool {
    return std.mem.lessThan(u8, &x.voice, &y.voice);
}

fn byWarden(_: void, x: Relation, y: Relation) bool {
    return std.mem.lessThan(u8, &x.warden, &y.warden);
}

fn ascending(_: void, x: i64, y: i64) bool {
    return x < y;
}

fn standingValue(a: std.mem.Allocator, one: Standing) std.mem.Allocator.Error!wire.Value {
    const orderedBeings = try a.dupe(Key, one.beings);
    std.mem.sort(Key, orderedBeings, {}, byKey);
    const beings = try a.alloc(wire.Value, orderedBeings.len);
    for (orderedBeings, beings) |pk, *slot| slot.* = .{ .being = pk };
    const orderedSpent = try a.dupe(i64, one.spent);
    std.mem.sort(i64, orderedSpent, {}, ascending);
    const spent = try a.alloc(wire.Value, orderedSpent.len);
    for (orderedSpent, spent) |n, *slot| slot.* = .{ .integer = n };
    const fields = try a.alloc(wire.Value, 8);
    fields[0] = .{ .b32 = one.voice };
    fields[1] = .{ .b32 = one.commitment };
    fields[2] = .{ .b32 = one.name };
    fields[3] = .{ .list = beings };
    fields[4] = .{ .integer = one.mark };
    fields[5] = .{ .list = spent };
    fields[6] = try optionalKey(a, one.padlock, false);
    fields[7] = try hintsValue(a, one.hints);
    return .{ .record = fields };
}

fn relationValue(a: std.mem.Allocator, one: Relation) std.mem.Allocator.Error!wire.Value {
    const fields = try a.alloc(wire.Value, 10);
    fields[0] = .{ .being = one.warden };
    fields[1] = .{ .b32 = one.commitment };
    fields[2] = .{ .b32 = one.padlock };
    fields[3] = .{ .b32 = one.voice };
    fields[4] = .{ .b32 = one.secret };
    fields[5] = .{ .b32 = one.heir };
    fields[6] = .{ .b32 = one.heir_secret };
    fields[7] = .{ .integer = one.seq };
    fields[8] = .{ .integer = one.news };
    fields[9] = try hintsValue(a, one.hints);
    return .{ .record = fields };
}

fn cargoValue(a: std.mem.Allocator, cargo: Cargo) std.mem.Allocator.Error!wire.Value {
    const orderedStandings = try a.dupe(Standing, cargo.standings);
    std.mem.sort(Standing, orderedStandings, {}, byVoice);
    const standings = try a.alloc(wire.Value, orderedStandings.len);
    for (orderedStandings, standings) |one, *slot| slot.* = try standingValue(a, one);
    const orderedRelations = try a.dupe(Relation, cargo.relations);
    std.mem.sort(Relation, orderedRelations, {}, byWarden);
    const relations = try a.alloc(wire.Value, orderedRelations.len);
    for (orderedRelations, relations) |one, *slot| slot.* = try relationValue(a, one);
    const fields = try a.alloc(wire.Value, 5);
    fields[0] = .{ .being = cargo.being };
    fields[1] = .{ .b32 = cargo.digest };
    fields[2] = .{ .bytes = cargo.cells };
    fields[3] = .{ .list = standings };
    fields[4] = .{ .list = relations };
    return .{ .record = fields };
}

pub fn encodeCargo(gpa: std.mem.Allocator, cargo: Cargo) Fault![]u8 {
    return encodeUnder(gpa, "cargo", cargoValue, cargo);
}

/// A cargo and the arena that owns every byte it points at.
pub const ReadCargo = struct {
    arena: std.heap.ArenaAllocator,
    cargo: Cargo,

    pub fn deinit(self: *ReadCargo) void {
        self.arena.deinit();
    }
};

fn fieldsOf(value: wire.Value, want: usize) Error![]const wire.Value {
    const fields = switch (value) {
        .record => |f| f,
        else => return Error.Refused,
    };
    if (fields.len != want) return Error.Refused;
    return fields;
}

fn hintsOf(a: std.mem.Allocator, value: wire.Value) Fault![]const []const u8 {
    const items = switch (value) {
        .list => |l| l,
        else => return Error.Refused,
    };
    const hints = try a.alloc([]const u8, items.len);
    for (items, hints) |item, *slot| {
        slot.* = switch (item) {
            .text => |t| t,
            else => return Error.Refused,
        };
    }
    return hints;
}

fn integerOf(value: wire.Value) Error!i64 {
    return switch (value) {
        .integer => |n| n,
        else => Error.Refused,
    };
}

/// A cargo, decoded by the notation's own rules.
pub fn decodeCargo(gpa: std.mem.Allocator, raw: []const u8) Fault!ReadCargo {
    var arena = std.heap.ArenaAllocator.init(gpa);
    errdefer arena.deinit();
    const a = arena.allocator();

    const blueprint = try shapes(a);
    // The bytes a cargo is read from are the ask's own scratch, so the arena
    // that owns the result owns a copy of them too.
    const owned = try a.dupe(u8, raw);
    const decoded = wire.decode(a, "cargo", blueprint.records, owned) catch |e| switch (e) {
        error.OutOfMemory => return error.OutOfMemory,
        else => return Error.Refused,
    };

    const fields = try fieldsOf(decoded.value, 5);
    const cells = switch (fields[2]) {
        .bytes => |b| b,
        else => return Error.Refused,
    };

    const raw_standings = switch (fields[3]) {
        .list => |l| l,
        else => return Error.Refused,
    };
    const standings = try a.alloc(Standing, raw_standings.len);
    for (raw_standings, standings) |item, *slot| {
        const f = try fieldsOf(item, 8);
        const raw_beings = switch (f[3]) {
            .list => |l| l,
            else => return Error.Refused,
        };
        const beings = try a.alloc(Key, raw_beings.len);
        for (raw_beings, beings) |b, *into| into.* = try keyOf(b);
        const raw_spent = switch (f[5]) {
            .list => |l| l,
            else => return Error.Refused,
        };
        const spent = try a.alloc(i64, raw_spent.len);
        for (raw_spent, spent) |n, *into| into.* = try integerOf(n);
        slot.* = .{
            .voice = try keyOf(f[0]),
            .commitment = try keyOf(f[1]),
            .name = try keyOf(f[2]),
            .beings = beings,
            .mark = try integerOf(f[4]),
            .spent = spent,
            .padlock = try optionalKeyOf(f[6]),
            .hints = try hintsOf(a, f[7]),
        };
    }

    const raw_relations = switch (fields[4]) {
        .list => |l| l,
        else => return Error.Refused,
    };
    const relations = try a.alloc(Relation, raw_relations.len);
    for (raw_relations, relations) |item, *slot| {
        const f = try fieldsOf(item, 10);
        slot.* = .{
            .warden = try keyOf(f[0]),
            .commitment = try keyOf(f[1]),
            .padlock = try keyOf(f[2]),
            .voice = try keyOf(f[3]),
            .secret = try keyOf(f[4]),
            .heir = try keyOf(f[5]),
            .heir_secret = try keyOf(f[6]),
            .seq = try integerOf(f[7]),
            .news = try integerOf(f[8]),
            .hints = try hintsOf(a, f[9]),
        };
    }

    return .{ .arena = arena, .cargo = .{
        .being = try keyOf(fields[0]),
        .digest = try keyOf(fields[1]),
        .cells = cells,
        .standings = standings,
        .relations = relations,
    } };
}

// ---------------------------------------------------------------- the leash

/// A time budget in milliseconds and a hop count. The leash only shrinks.
pub const Leash = struct {
    time: i64,
    hops: i64,
};

/// The leash is judged on what arrived: a time budget at or below zero, or a
/// hop count below zero, is silence. A hop count of zero is a legal leash for
/// a call that goes no further — what it forbids is onward.
pub fn spendLeash(arriving: Leash) Error!void {
    if (arriving.time <= 0) return Error.Refused;
    if (arriving.hops < 0) return Error.Refused;
}

/// What an onward ask carries: the arriving hop count less one and the
/// arriving budget less this door's own dwell — the difference between the
/// two readings taken at the ends of the judgment, the road never counted.
/// Where either would fall below zero, or the budget to zero, the onward ask
/// is not made and null comes back; the work already routed stands.
pub fn onward(arriving: Leash, dwell: i64) ?Leash {
    const hops = std.math.sub(i64, arriving.hops, 1) catch return null;
    if (hops < 0) return null;
    const time = std.math.sub(i64, arriving.time, dwell) catch return null;
    // No door hands onward more than it received, so a negative dwell cannot
    // widen the budget.
    if (dwell < 0) return null;
    if (time <= 0) return null;
    return .{ .time = time, .hops = hops };
}

// --------------------------------------------------------------- the window

/// The door keeps a window, not a line: the highest number honoured, and
/// which numbers below it are already spent. How wide the window is, is the
/// warden's own.
pub const Window = struct {
    /// Nothing honoured yet. The first legal number is one.
    mark: i64 = 0,
    spent: std.ArrayList(i64) = .empty,
    width: i64,

    pub fn deinit(self: *Window, gpa: std.mem.Allocator) void {
        self.spent.deinit(gpa);
    }

    /// A rotation starts the mark fresh, as does a being's succession
    /// announced as news.
    pub fn reset(self: *Window, gpa: std.mem.Allocator) void {
        self.mark = 0;
        self.spent.clearAndFree(gpa);
    }

    fn holds(self: Window, seq: i64) bool {
        for (self.spent.items) |n| {
            if (n == seq) return true;
        }
        return false;
    }

    /// Honoured means the number is consumed, and nothing later gives it
    /// back: a caller that refuses after this has still spent it.
    pub fn spend(self: *Window, gpa: std.mem.Allocator, seq: i64) Fault!void {
        if (seq < 1) return Error.Refused;
        if (seq > self.mark) {
            // The number the mark held is honoured and must stay honoured, so
            // it joins the spent set as the mark moves off it. A mark that
            // simply moved would leave what it held free to arrive again.
            const was = self.mark;
            self.mark = seq;
            if (was >= 1) try self.spent.append(gpa, was);
            self.prune();
            return;
        }
        // The mark itself is honoured, and so is anything already in the set.
        if (seq == self.mark) return Error.Refused;
        if (seq <= self.mark - self.width) return Error.Refused;
        if (self.holds(seq)) return Error.Refused;
        try self.spent.append(gpa, seq);
    }

    fn prune(self: *Window) void {
        var i: usize = 0;
        while (i < self.spent.items.len) {
            if (self.spent.items[i] <= self.mark - self.width) {
                _ = self.spent.swapRemove(i);
            } else {
                i += 1;
            }
        }
    }
};

// -------------------------------------------------------------- the records

/// One inbound row: which voices may reach which of this warden's beings,
/// binary per being, and how to answer that voice.
pub const Inbound = struct {
    voice: Key,
    /// The hash of the next pk.
    commitment: Key,
    /// Every heir commitment was hashed under the name the door had then, so
    /// the door stores the name each was minted at and keeps verifying it
    /// there.
    minted_name: Key,
    beings: std.ArrayList(Key) = .empty,
    window: Window,
    /// The way back, refreshed by every call that arrives.
    padlock: ?Key = null,
    hints: []const []const u8 = &.{},
    /// The roads a row is granted with belong to whoever wrote the grant; the
    /// roads an arriving call replaces them with live in an arena that dies
    /// with the message, so the row takes a copy and owns it. Which of the two
    /// `hints` points at is what this says.
    owned_hints: ?[][]u8 = null,

    pub fn deinit(self: *Inbound, gpa: std.mem.Allocator) void {
        self.beings.deinit(gpa);
        self.window.deinit(gpa);
        self.dropHints(gpa);
    }

    fn dropHints(self: *Inbound, gpa: std.mem.Allocator) void {
        const held = self.owned_hints orelse return;
        for (held) |one| gpa.free(one);
        gpa.free(held);
        self.owned_hints = null;
    }

    /// Take the roads an arriving call carried, owned by this row from here.
    pub fn keepHints(self: *Inbound, gpa: std.mem.Allocator, hints: []const []const u8) Fault!void {
        const kept = try gpa.alloc([]u8, hints.len);
        errdefer gpa.free(kept);
        for (hints, kept) |from, *into| into.* = try gpa.dupe(u8, from);
        self.dropHints(gpa);
        self.owned_hints = kept;
        self.hints = kept;
    }

    pub fn reaches(self: Inbound, being: Key) bool {
        for (self.beings.items) |b| {
            if (std.mem.eql(u8, &b, &being)) return true;
        }
        return false;
    }
};

/// One being at a far house, as this door knows it: the commitment a describe
/// published for that being. **A being's succession is believed against the
/// being's own commitment, never the row's**, which belongs to the house's
/// name — a door that hashed one against the other would let the house's
/// committed heir succeed every being at it, and a being's heir take the
/// house.
///
/// It does not travel. A `relation` record carries what the far door knows
/// about this holder; what this door has learned about the beings there is its
/// own reading, re-taken from a describe.
pub const FarBeing = struct {
    being: Key,
    commitment: Key,
};

/// One outbound row: the invitation kept whole, plus the mark this door keeps
/// against that far warden's news.
pub const Outbound = struct {
    warden: Key,
    commitment: Key,
    padlock: Key,
    voice: Key,
    secret: Key,
    heir: Key,
    heir_secret: Key,
    /// The count kept against that far door for what this door sends.
    seq: i64 = 0,
    /// Which of this ground's beings may spend the relation. **A row that
    /// named none could not travel when that being moves**, and a relation
    /// nobody here owns belongs to the warden itself and travels nowhere.
    holder: ?Key = null,
    /// News is counted too, against the mark kept for that far warden.
    news: Window,
    hints: []const []const u8 = &.{},
    /// The asks put on a road down this relation with no answer heard yet.
    /// Article XII's fourth check on an answer is that one is awaiting under
    /// that padlock, that warden and that seq, so the caller keeps the record
    /// that check reads — in the core, because the check is owed whether or
    /// not a socket was involved. The warden is the row it hangs on.
    awaiting: std.ArrayList(Await) = .empty,
    /// The commitment this door holds for each being it stands at down this
    /// relation, taken from a describe and kept by `note`.
    beings: std.ArrayList(FarBeing) = .empty,
    /// The roads a row is founded with belong to whoever handed the invitation
    /// over; the roads believed news replaces them with arrive in an arena
    /// that dies with the message, so the row takes a copy and owns it. Which
    /// of the two `hints` points at is what this says.
    owned_hints: ?[][]u8 = null,

    pub fn deinit(self: *Outbound, gpa: std.mem.Allocator) void {
        self.news.deinit(gpa);
        self.awaiting.deinit(gpa);
        self.beings.deinit(gpa);
        self.dropHints(gpa);
    }

    fn dropHints(self: *Outbound, gpa: std.mem.Allocator) void {
        const held = self.owned_hints orelse return;
        for (held) |one| gpa.free(one);
        gpa.free(held);
        self.owned_hints = null;
    }

    /// Take the roads a word or a cargo carried, owned by this row from here.
    pub fn keepHints(self: *Outbound, gpa: std.mem.Allocator, hints: []const []const u8) Fault!void {
        const kept = try gpa.alloc([]u8, hints.len);
        errdefer gpa.free(kept);
        for (hints, kept) |from, *into| into.* = try gpa.dupe(u8, from);
        self.dropHints(gpa);
        self.owned_hints = kept;
        self.hints = kept;
    }
};

/// One row that stands at a being, read as the way back to whoever holds it.
pub const Peer = struct {
    voice: Key,
    padlock: ?Key = null,
    hints: []const []const u8 = &.{},
};

fn byPeer(_: void, x: Peer, y: Peer) bool {
    return std.mem.lessThan(u8, &x.voice, &y.voice);
}

/// What a `receive` leaves behind for the migration's second news: the name
/// the being wore before, the name this door minted for it, and the voices
/// that arrived with the standings.
pub const Arrived = struct {
    was: Key,
    being: Key,
    voices: std.ArrayList(Key) = .empty,

    pub fn deinit(self: *Arrived, gpa: std.mem.Allocator) void {
        self.voices.deinit(gpa);
    }
};

/// One ask still out: the padlock the answer will be sealed to and the number
/// the ask spent. Two asks carrying the same pair down one relation are two
/// asks whose answers cannot be told apart, which is what a caller's own kit
/// refuses to send.
pub const Await = struct {
    padlock: Key,
    seq: i64,
};

/// Per being a warden keeps the ordinary pointer, the being's keys, and the
/// blueprint's digest.
pub const BeingRow = struct {
    pk: Key,
    secret: Key,
    digest: Key,
    commitment: Key,
    /// The blueprint's own text, which `blueprint(digest)` answers with.
    text: []const u8 = "",
    /// The succession this door published for a being that left, which is all
    /// `moved` ever answers and all the old door ever does again.
    moved: ?Word = null,
};

// -------------------------------------------------------------- the verdict

/// Where a voice was found, and in which record.
pub const Placement = union(enum) {
    /// A current holder in the inbound record.
    ask: usize,
    /// Its hash matched a standing's heir commitment; the standing has
    /// changed hands already.
    rotation: usize,
    /// Found in the outbound record. `being` names which being's commitment
    /// the voice hashed to, and is absent when it hashed to the house's own —
    /// which is the whole of what says whose succession this voice may
    /// announce.
    news: struct { at: usize, by_heir: bool, being: ?Key = null },
    /// Nowhere: a standing at nothing.
    stranger,
};

/// What step seven decided. The warden hands this back and the ground carries
/// it out; steps one through six are the warden's alone and the being never
/// learns that any of them happened.
pub const Routing = union(enum) {
    /// Being and method: the being is invoked and answers.
    invoke: struct { being: Key, method: Method },
    /// Being, no method: the warden describes that one being.
    sketch: Key,
    /// Neither: the warden describes the estate, which means what that voice
    /// may reach.
    estate,
    /// Method, no being: the warden's own being answers.
    own: Method,
    /// No standing anywhere: the describe of whatever the warden's own public
    /// being exposes.
    stranger,
};

pub const Verdict = struct {
    arena: std.heap.ArenaAllocator,
    say: Say,
    placement: Placement,
    routing: Routing,

    pub fn deinit(self: *Verdict) void {
        self.arena.deinit();
    }
};

// --------------------------------------------------------------- the warden

pub const Warden = struct {
    gpa: std.mem.Allocator,
    /// The key that names the house and the key that names the being the
    /// house speaks as are one key.
    name: Key,
    name_secret: Key,
    /// The padlock every message to this ground is sealed with. Replaceable
    /// without the name moving.
    padlock: Key,
    padlock_secret: Key,
    /// The largest message this warden will accept, counted in bytes of the
    /// whole envelope as the carriage delivers it.
    limit: usize,
    /// How wide the replay window is, is the warden's own.
    width: i64 = 64,

    inbound: std.ArrayList(Inbound) = .empty,
    outbound: std.ArrayList(Outbound) = .empty,
    beings: std.ArrayList(BeingRow) = .empty,
    /// The claims this door is holding open for beings about to arrive.
    arms: std.ArrayList(Arm) = .empty,
    /// What the last `receive` took in, until `landed` reads it.
    arrived: ?Arrived = null,

    pub fn deinit(self: *Warden) void {
        for (self.inbound.items) |*row| row.deinit(self.gpa);
        for (self.outbound.items) |*row| row.deinit(self.gpa);
        self.inbound.deinit(self.gpa);
        self.outbound.deinit(self.gpa);
        self.beings.deinit(self.gpa);
        self.arms.deinit(self.gpa);
        if (self.arrived) |*one| one.deinit(self.gpa);
    }

    pub fn being(self: Warden, pk: Key) ?BeingRow {
        for (self.beings.items) |row| {
            if (std.mem.eql(u8, &row.pk, &pk)) return row;
        }
        return null;
    }

    /// The public being's pk is the warden's own name, and it is reachable by
    /// everyone, holders included.
    pub fn isPublic(self: Warden, pk: Key) bool {
        return std.mem.eql(u8, &pk, &self.name);
    }

    /// Move this door's own name to the heir its founding committed to —
    /// Article XIV. The heir the founding named is the only key that may
    /// spend, `heir_commitment` is what the new name commits to next, and the
    /// public being's pk is the warden's name, so it moves with it.
    ///
    /// **Every standing stays where it was.** Each inbound row keeps the name
    /// its commitment was minted at, so an older standing still rotates; the
    /// commitment that rotation carries is filed under the new name, and the
    /// one after it will not match until the holder has heard the news.
    pub fn succeed(self: *Warden, name_secret: Key, heir_commitment: Key) Error!void {
        const successor = (try arithmetic.signingPair(name_secret)).public;
        const was = self.name;
        for (self.beings.items) |*row| {
            if (!std.mem.eql(u8, &row.pk, &was)) continue;
            const claimed = arithmetic.commitment(was, successor);
            if (!std.mem.eql(u8, &claimed, &row.commitment)) return Error.Refused;
            row.pk = successor;
            row.secret = name_secret;
            row.commitment = heir_commitment;
            self.name = successor;
            self.name_secret = name_secret;
            return;
        }
        return Error.Refused;
    }

    fn inboundOf(self: *Warden, voice: Key) ?usize {
        for (self.inbound.items, 0..) |row, i| {
            if (std.mem.eql(u8, &row.voice, &voice)) return i;
        }
        return null;
    }

    // ----------------------------------------------------------- describes

    /// Every describe is scoped by the same binary record, without exception.
    /// A stranger's estate is the warden's own public being; a holder's is
    /// every being its row names, the public being always among them.
    pub fn estateFor(self: Warden, a: std.mem.Allocator, voice: ?Key) std.mem.Allocator.Error!Estate {
        var reachable: std.ArrayList(Key) = .empty;
        try reachable.append(a, self.name);
        if (voice) |v| {
            for (self.inbound.items) |row| {
                if (!std.mem.eql(u8, &row.voice, &v)) continue;
                for (row.beings.items) |b| {
                    if (self.isPublic(b)) continue;
                    try reachable.append(a, b);
                }
            }
        }

        // One class per distinct digest, every reachable being of it under it.
        var digests: std.ArrayList(Key) = .empty;
        for (reachable.items) |pk| {
            const row = self.being(pk) orelse continue;
            var known = false;
            for (digests.items) |d| {
                if (std.mem.eql(u8, &d, &row.digest)) known = true;
            }
            if (!known) try digests.append(a, row.digest);
        }

        const classes = try a.alloc(Class, digests.items.len);
        for (digests.items, classes) |d, *slot| {
            var beings: std.ArrayList(Held) = .empty;
            for (reachable.items) |pk| {
                const row = self.being(pk) orelse continue;
                if (!std.mem.eql(u8, &row.digest, &d)) continue;
                try beings.append(a, .{ .being = row.pk, .commitment = row.commitment });
            }
            slot.* = .{ .digest = d, .beings = beings.items };
        }
        return order(a, .{ .classes = classes });
    }

    /// One being: answered only for a being the voice may reach. Silence is
    /// for what a voice may not reach, and a door that answered "absent"
    /// about a being you do not reach would be a door confirming that being
    /// exists.
    pub fn sketchFor(self: Warden, voice: ?Key, pk: Key) Error!Sketch {
        if (!self.mayReach(voice, pk)) return Error.Refused;
        const row = self.being(pk) orelse return Error.Refused;
        return .{ .being = row.pk, .digest = row.digest, .commitment = row.commitment };
    }

    /// A blueprint, asked for by its digest, and answered only if the asker
    /// already reaches a being of that class or the warden's own public being
    /// declares it. Otherwise silence.
    pub fn blueprintFor(self: Warden, voice: ?Key, want: Key) Error![]const u8 {
        for (self.beings.items) |row| {
            if (!std.mem.eql(u8, &row.digest, &want)) continue;
            if (self.isPublic(row.pk) or self.mayReach(voice, row.pk)) return row.text;
        }
        return Error.Refused;
    }

    pub fn mayReach(self: Warden, voice: ?Key, pk: Key) bool {
        if (self.isPublic(pk)) return true;
        const v = voice orelse return false;
        for (self.inbound.items) |row| {
            if (std.mem.eql(u8, &row.voice, &v) and row.reaches(pk)) return true;
        }
        return false;
    }

    /// The row this voice stands in, or nothing.
    fn standingAt(self: *Warden, voice: Key) ?usize {
        for (self.inbound.items, 0..) |row, i| {
            if (std.mem.eql(u8, &row.voice, &voice)) return i;
        }
        return null;
    }

    /// Widen a standing: the warden adds a being to a voice's row.
    ///
    /// **A standing is amended, not replaced** — nobody is told, no secret is
    /// minted, and the holder finds it on its next describe.
    ///
    /// The warden is the actor, not the caller. A host appending to the row
    /// itself would widen a standing without asking the door, which is the
    /// ambient permission Quo refuses.
    ///
    /// Two refusals: a voice with no row here, because a row conjured from a
    /// widening would be a grant by another name; and a being this door does
    /// not hold, because a row may only ever name beings that stand.
    pub fn widen(self: *Warden, voice: Key, pk: Key) Fault!void {
        if (self.being(pk) == null) return Error.Refused;
        const at = self.standingAt(voice) orelse return Error.Refused;
        const row = &self.inbound.items[at];
        if (row.reaches(pk)) return;
        try row.beings.append(self.gpa, pk);
    }

    /// Narrow a standing: the warden takes a being away.
    ///
    /// **Taking the last being away is release, and there is no separate act
    /// for it.** The row goes, the holder is a stranger at its next call, and
    /// nobody is told. Narrowing a being the row never named is no refusal —
    /// the row already says what the narrowing asks for.
    pub fn narrow(self: *Warden, voice: Key, pk: Key) Error!void {
        const at = self.standingAt(voice) orelse return Error.Refused;
        const row = &self.inbound.items[at];
        var i: usize = 0;
        while (i < row.beings.items.len) {
            if (std.mem.eql(u8, &row.beings.items[i], &pk)) {
                _ = row.beings.orderedRemove(i);
            } else i += 1;
        }
        if (row.beings.items.len == 0) {
            var gone = self.inbound.orderedRemove(at);
            gone.deinit(self.gpa);
        }
    }

    // ------------------------------------------------------- the judgment

    /// The eight steps, in order. Steps one through six are the warden's
    /// alone; step seven is the routing decision this hands back, and step
    /// eight is `answer`.
    pub fn judge(self: *Warden, letter: []const u8) Fault!Verdict {
        // What a caller can compute before sending, so it is judged before
        // anything is unsealed.
        if (letter.len > self.limit) return Error.Refused;

        // 1. Unseal with the warden's own secret, and decode what comes out.
        // 2. Verify the signature over the payload, using the voice the
        //    payload carries. Both are the envelope's, and a door expects a
        //    `say`.
        var opened = try envelope.open(self.gpa, self.padlock_secret, .say, letter);
        errdefer opened.deinit();
        const say = opened.payload.say;

        // 3. Check the recipient, here and not later: a payload addressed
        //    elsewhere must never touch this house's records.
        if (!std.mem.eql(u8, &say.recipient, &self.name) and
            !std.mem.eql(u8, &say.recipient, &self.padlock))
        {
            return Error.Refused;
        }

        // 4. Place the voice, in the two records and in that order.
        const placement = try self.place(say);

        // 5. Spend the seq, against the window kept for that voice.
        switch (placement) {
            .ask, .rotation => |i| try self.inbound.items[i].window.spend(self.gpa, say.seq),
            .news => |n| try self.outbound.items[n.at].news.spend(self.gpa, say.seq),
            // A stranger spends nothing: it has no row, so no mark is kept
            // for it and its numbers are not counted.
            .stranger => {},
        }

        // The way back is refreshed here, between the seq and the leash: the
        // padlock and hints the payload carried replace what the row held.
        // Not earlier, because a replayed message would otherwise rewrite a
        // live way back with a retired one, and the seq is what tells a replay
        // from a call. Not later, because a message refused for its leash
        // still arrived and still spent its number — a door that refreshed
        // only what it went on to route would slowly lose the way back to any
        // peer whose calls it keeps refusing, and news is what that peer would
        // stop receiving.
        switch (placement) {
            .ask, .rotation => |i| {
                self.inbound.items[i].padlock = say.padlock;
                // An empty hints list means the road did not change, never an
                // erasure: a dialing end publishes nothing by nature, and a
                // door that erased on that would destroy its own way back to
                // that peer on the peer's first ask.
                if (say.hints.len > 0) {
                    try self.inbound.items[i].keepHints(self.gpa, say.hints);
                }
            },
            else => {},
        }

        // 6. Spend the leash.
        try spendLeash(.{ .time = say.allowance.time, .hops = say.allowance.hops });

        // 7. Route.
        const routing = try self.route(placement, say);

        return .{
            .arena = opened.arena,
            .say = say,
            .placement = placement,
            .routing = routing,
        };
    }

    fn place(self: *Warden, say: Say) Error!Placement {
        // Found as a current holder in the inbound record → an ask.
        if (self.inboundOf(say.voice)) |i| {
            // The commitment is present only when the message spends an
            // heir; a plain ask carrying one is refused.
            if (say.commitment != null) return Error.Refused;
            return .{ .ask = i };
        }

        // Not found there, but its hash matches a standing's heir commitment
        // → a rotation, and the standing changes hands before anything else
        // is judged.
        for (self.inbound.items, 0..) |*row, i| {
            const claimed = arithmetic.commitment(row.minted_name, say.voice);
            if (!std.mem.eql(u8, &claimed, &row.commitment)) continue;
            // Every rotation carries a fresh commitment, or a standing could
            // be taken over once and never again.
            const fresh = say.commitment orelse return Error.Refused;
            row.voice = say.voice;
            row.commitment = fresh;
            row.minted_name = self.name;
            row.window.reset(self.gpa);
            return .{ .rotation = i };
        }

        // Found in the outbound record — as a warden this door holds a
        // relation with, or as the heir it committed → news.
        for (self.outbound.items, 0..) |row, i| {
            const claimed = arithmetic.commitment(row.warden, say.voice);
            if (std.mem.eql(u8, &row.warden, &say.voice)) {
                // News is not a rotation and does not use this field.
                if (say.commitment != null) return Error.Refused;
                return .{ .news = .{ .at = i, .by_heir = false } };
            }
            if (std.mem.eql(u8, &claimed, &row.commitment)) {
                if (say.commitment != null) return Error.Refused;
                return .{ .news = .{ .at = i, .by_heir = true } };
            }
            // Or as the heir a being at that house committed, which a describe
            // published and `note` kept. Which commitment the voice hashed to
            // is what decides whose succession it may announce, so it is
            // placed here rather than read off the word.
            for (row.beings.items) |far| {
                if (!std.mem.eql(u8, &claimed, &far.commitment)) continue;
                if (say.commitment != null) return Error.Refused;
                return .{ .news = .{ .at = i, .by_heir = true, .being = far.being } };
            }
        }

        // Nowhere → the stranger's case, which is a standing at nothing. **A
        // commitment the message carries changes none of this**: the kind is
        // read off the voice and never declared, so the field is ignored here
        // rather than refused. A door that refused it would meet the holder
        // whose door has forgotten it — restored from an old backup, or its
        // standing released — for whom silence is unrecoverable.
        return .stranger;
    }

    fn route(self: *Warden, placement: Placement, say: Say) Error!Routing {
        const voice: ?Key = switch (placement) {
            .stranger => null,
            else => say.voice,
        };

        // News reaches the warden's own being, named or not: a granting warden
        // sending news has never had a describe from its peer, so naming the
        // door alone is the only address it is sure of. And news is a `tell`
        // and nothing else — while `tell` is news and nothing else, because a
        // caller holding an ordinary standing announces nothing.
        const telling = say.method != null and std.mem.eql(u8, say.method.?.name, "tell");
        if (placement == .news) {
            if (say.being) |pk| {
                if (!self.isPublic(pk)) return Error.Refused;
            }
            if (!telling) return Error.Refused;
            return .{ .own = say.method.? };
        }
        if (telling) return Error.Refused;

        // `receive` is an ordinary field spent by an ordinary standing —
        // granted in advance the way anything is — because a door any stranger
        // could push a being into is a door with no gate.
        if (voice == null and say.method != null and
            std.mem.eql(u8, say.method.?.name, "receive"))
        {
            return Error.Refused;
        }

        if (say.being) |pk| {
            // The public being is reachable by everyone, holders included;
            // anything else needs a standing, and what a voice may not reach
            // is silence rather than an absence.
            if (!self.mayReach(voice, pk)) return Error.Refused;
            const row = self.being(pk) orelse return Error.Refused;
            // **The old door only points.** It answers `moved` with the
            // succession it published, asked of the warden itself, and every
            // other ask meets silence: an answer's data is the field's
            // declared answer type, and a succession is not that type, so the
            // word cannot be put where the caller asked for the work.
            if (row.moved != null) return Error.Refused;
            if (say.method) |m| return .{ .invoke = .{ .being = pk, .method = m } };
            return .{ .sketch = pk };
        }

        // The warden's own being answers to two addresses, and that is meant:
        // naming it is the ordinary form, omitting it the shortcut.
        if (say.method) |m| return .{ .own = m };

        // There is no empty ask, because there is a default one: describe.
        if (voice == null) return .stranger;
        return .estate;
    }

    // ----------------------------------------------------------- the answer

    /// Step eight: sealed to the return padlock the payload carried, and
    /// signed by the warden's own name.
    pub fn answer(
        self: *Warden,
        gpa: std.mem.Allocator,
        ephemeral_secret: Key,
        say: Say,
        data: ?[]const u8,
    ) Fault![]u8 {
        return envelope.seal(gpa, ephemeral_secret, say.padlock, self.name_secret, .{ .answer = .{
            .warden = self.name,
            .seq = say.seq,
            .data = data,
        } });
    }

    /// A describe of one being, written as the `sketch` field's declared
    /// answer type. The routing that names a being and no method is that
    /// field asked without its name, so it answers in the same shape.
    pub fn sketchAnswer(self: Warden, gpa: std.mem.Allocator, voice: ?Key, pk: Key) Fault![]u8 {
        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const found = try self.sketchFor(voice, pk);
        return answerOf(gpa, "sketch", try optionalSketch(arena.allocator(), found));
    }

    /// The second half of step eight for the warden's own being: the fields
    /// of the one blueprint every warden holds, answered by the warden.
    ///
    /// **Every part of this is judgment, so none of it is the host's.** The
    /// field is looked up in the blueprint, its one argument is decoded as
    /// the type that blueprint declares, and the answer is written as the
    /// type it declares — so nothing outside this kit chooses an encoding, a
    /// scope or a refusal. A name the blueprint does not declare meets
    /// `Error.Refused`, which reaches the far side as silence like every
    /// other refusal.
    ///
    /// Null is an answer of no bytes rather than an absent optional: `tell`
    /// declares no answer, and a field that answers nothing answers nothing.
    /// The bytes come from `gpa` and are the caller's to free.
    pub fn own(self: *Warden, gpa: std.mem.Allocator, verdict: Verdict) Fault!?[]u8 {
        const m = switch (verdict.routing) {
            .own => |method| method,
            // The warden's own being answers to two addresses, and that is
            // meant: naming it is the ordinary form, omitting it the
            // shortcut. So a field invoked on the public being is a field of
            // this blueprint and not an object's.
            .invoke => |call| if (self.isPublic(call.being)) call.method else return Error.Refused,
            else => return Error.Refused,
        };
        const voice: ?Key = switch (verdict.placement) {
            .stranger => null,
            else => verdict.say.voice,
        };

        // News and a migration arrive as records this kit already reads, and
        // each mutates a record rather than describing one, so they are taken
        // before the ordinary argument path.
        if (std.mem.eql(u8, m.name, "tell")) {
            var read = try decodeWord(gpa, m.args);
            defer read.deinit();
            try self.believe(verdict.placement, verdict.say.voice, read.word);
            return null;
        }
        if (std.mem.eql(u8, m.name, "receive")) {
            // `receive` is an ordinary field spent by an ordinary standing,
            // because a door any stranger could push a being into is a door
            // with no gate.
            if (voice == null) return Error.Refused;
            var read = try decodeCargo(gpa, m.args);
            defer read.deinit();
            const commitment = try self.receive(read.cargo);
            return try answerOf(gpa, "receive", .{ .b32 = commitment });
        }

        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();

        var blueprint = try shapes(a);
        defer blueprint.deinit();
        const field = fieldOf(blueprint.class, m.name) orelse return Error.Refused;
        const argument = try oneArgument(a, blueprint, field, m.args);

        if (std.mem.eql(u8, m.name, "describe")) {
            return try encodeEstate(gpa, try self.estateFor(a, voice));
        }
        if (std.mem.eql(u8, m.name, "limit")) {
            return try answerOf(gpa, "limit", .{ .integer = @intCast(self.limit) });
        }
        if (std.mem.eql(u8, m.name, "sketch")) {
            return try self.sketchAnswer(gpa, voice, try keyOf(argument orelse return Error.Refused));
        }
        if (std.mem.eql(u8, m.name, "blueprint")) {
            const text = try self.blueprintFor(voice, try keyOf(argument orelse return Error.Refused));
            const held = try a.create(wire.Value);
            held.* = .{ .text = text };
            return try answerOf(gpa, "blueprint", .{ .present = held });
        }
        if (std.mem.eql(u8, m.name, "moved")) {
            // A legal ask has a legal answer: nothing has moved, so `moved`
            // answers absence. Outside the scope it is silence, exactly as a
            // sketch is.
            const word = try self.movedFor(voice, try keyOf(argument orelse return Error.Refused));
            return try answerOf(gpa, "moved", try optionalWord(a, word));
        }
        return Error.Refused;
    }

    // ----------------------------------------------- Article XIV, the news

    /// Keep the commitment a describe published for one being at a far house.
    /// A peer that means to believe that being's succession must keep it: the
    /// news arrives signed by a key this door has never seen, and the hash
    /// against this commitment is the only thing that recognises it.
    pub fn note(self: *Warden, at: usize, pk: Key, commitment: Key) Fault!void {
        if (at >= self.outbound.items.len) return Error.Refused;
        const row = &self.outbound.items[at];
        // The house's name and its public being are one key, and its
        // commitment is the row's own. A second copy under the beings would be
        // a second place to believe one succession from.
        if (std.mem.eql(u8, &row.warden, &pk)) return Error.Refused;
        for (row.beings.items) |*far| {
            if (std.mem.eql(u8, &far.being, &pk)) {
                far.commitment = commitment;
                return;
            }
        }
        try row.beings.append(self.gpa, .{ .being = pk, .commitment = commitment });
    }

    /// Believe a word, or refuse it. **A peer believes it by a key it already
    /// holds, and there are only two**: a signing key succeeded is believed by
    /// the heir it committed, and a padlock replaced is believed by the name,
    /// which has not moved. Anything else is silence.
    ///
    /// **Believed news rewrites the outbound row entire**, one for one off the
    /// word's own fields, because the relation follows the being. An empty
    /// hints list means the road did not change, never an erasure.
    pub fn believe(self: *Warden, placement: Placement, voice: Key, word: Word) Fault!void {
        const placed = switch (placement) {
            .news => |n| n,
            else => return Error.Refused,
        };
        const row = &self.outbound.items[placed.at];

        // The far warden's name and its public being are one key, so a word
        // naming that pk as a being would be a second spelling of the name's
        // own succession, and a value with two spellings is two identities.
        if (word.being) |b| {
            if (std.mem.eql(u8, &b, &row.warden)) return Error.Refused;
        }

        const succeeding = word.successor != null or word.commitment != null;
        if (succeeding) {
            // Fields that mean nothing in a case are absent, not filled.
            const successor = word.successor orelse return Error.Refused;
            const next = word.commitment orelse return Error.Refused;
            if (!placed.by_heir) return Error.Refused;
            // The successor signs and the peer hashes. A word naming a
            // successor the signer is not proves nothing about that key: it
            // would let a committed heir hand this relation to a third party
            // it chose.
            if (!std.mem.eql(u8, &successor, &voice)) return Error.Refused;
            // The commitment the voice hashed to is placed already, and it is
            // the whole of what this voice may succeed: a being's heir cannot
            // move the house's name, and the house's heir cannot move a being.
            if (word.being) |b| {
                const held = placed.being orelse return Error.Refused;
                if (!std.mem.eql(u8, &b, &held)) return Error.Refused;
                for (row.beings.items) |*far| {
                    if (!std.mem.eql(u8, &far.being, &b)) continue;
                    far.being = successor;
                    far.commitment = next;
                    break;
                }
            } else {
                if (placed.being != null) return Error.Refused;
                row.warden = successor;
                row.commitment = next;
            }
        } else {
            // A lock has no heir, so the news is signed by the name, which has
            // not moved and which the peer has held since the invitation.
            // Article XIV gives this act exactly one signer, and anything else
            // is silence: a door that believed it from the committed heir
            // would let that heir replace this house's lock at every peer
            // before succeeding anything, and every message those peers sent
            // next would be sealed to a lock the heir chose.
            if (word.padlock == null) return Error.Refused;
            if (placed.by_heir) return Error.Refused;
        }

        if (word.name) |name| row.warden = name;
        if (word.padlock) |lock| row.padlock = lock;
        // An empty hints list means the road did not change, never an erasure.
        if (word.hints.len > 0) try row.keepHints(self.gpa, word.hints);
        // A being's succession starts the news mark fresh, exactly as a
        // standing's rotation does: the house itself changed, and what comes
        // next is believed by its commitment rather than by its number. A name
        // succession keeps the mark — the house persisted and only its key
        // moved, so numbers already spent stay spent.
        if (word.being != null) row.news.reset(self.gpa);
    }

    // ------------------------------------------------ Article XIII, a cargo

    /// What this door is holding a claim open for: the class it will take, and
    /// the two keys it will mint the arriving being under. **A door any
    /// stranger could push a being into is a door with no gate**, so `receive`
    /// is an ordinary field spent by an ordinary standing — and the arm is
    /// what says the destination was expecting this being at all.
    pub const Arm = struct {
        digest: Key,
        text: []const u8,
        /// The key the being is named by here, which the origin never saw.
        secret: Key,
        /// That name's own heir, so the arriving being can be succeeded
        /// afterwards like any other.
        heir_secret: Key,
    };

    /// Arm the door for the being it is about to take in, and hand back the
    /// commitment the origin carries into the first news — the hash of a key
    /// this door generated, which tells the origin nothing about the key.
    pub fn arm(self: *Warden, a: Arm) Fault!Key {
        try self.arms.append(self.gpa, a);
        const pk = (try arithmetic.signingPair(a.secret)).public;
        return arithmetic.commitment(self.name, pk);
    }

    /// Take a being in. **The digest identifies rather than delivers**: a
    /// destination that does not already hold that class refuses the cargo in
    /// silence, and there is nobody it may ask.
    ///
    /// **A destination mints two keys — the one the being is named by here and
    /// that one's heir — and the answer is the commitment of the first**
    /// (Article IX), hashed under this door's own name. The being's new name
    /// is where the migration's second news moves the being's identity, and it
    /// is what a peer hashes that succession against; a commitment to the heir
    /// instead names a key that signs nothing until the succession after this
    /// one, so the peer disbelieves the news and is left standing at a house
    /// that has stopped answering.
    pub fn receive(self: *Warden, cargo: Cargo) Fault!Key {
        const at = for (self.arms.items, 0..) |a, i| {
            if (std.mem.eql(u8, &a.digest, &cargo.digest)) break i;
        } else return Error.Refused;
        const armed = self.arms.items[at];

        const pk = (try arithmetic.signingPair(armed.secret)).public;
        const heir = (try arithmetic.signingPair(armed.heir_secret)).public;
        if (std.mem.eql(u8, &pk, &cargo.being)) return Error.Refused;
        if (self.being(pk) != null) return Error.Refused;
        _ = self.arms.orderedRemove(at);

        try self.beings.append(self.gpa, .{
            .pk = pk,
            .secret = armed.secret,
            .digest = cargo.digest,
            .commitment = arithmetic.commitment(self.name, heir),
            .text = armed.text,
        });

        // The inbound record travels with the being, and the replay record
        // whole — the mark and the spent numbers beneath it — or every peer's
        // standing would have to be regranted and a caller's late-arriving
        // in-window numbers would be judged here by a window this door cannot
        // see.
        for (cargo.standings) |one| {
            var window: Window = .{ .mark = one.mark, .width = self.width };
            for (one.spent) |n| try window.spent.append(self.gpa, n);
            var beings: std.ArrayList(Key) = .empty;
            // **An arriving row reaches the being by the name this door minted
            // and by that name alone** (Article XIII), never also by the name
            // the being wore before: a name a door must remember for whoever
            // might still be behind is a name it can never stop remembering,
            // and the peer that is behind is not stranded, because the old
            // door still answers `moved`.
            try beings.append(self.gpa, pk);
            try self.inbound.append(self.gpa, .{
                .voice = one.voice,
                .commitment = one.commitment,
                // The name each commitment was minted at travels with the row,
                // so a standing that arrives still rotates at the name it was
                // granted under rather than at this door's.
                .minted_name = one.name,
                .beings = beings,
                .window = window,
                // The way back travelled with the standing, so this door can
                // speak first to a peer it has never been called by.
                .padlock = one.padlock,
            });
            // A cargo is read into an arena that dies with the message, so
            // every road that arrives on one is copied into a row that owns
            // it. A row pointing at freed bytes is a way back that reads as
            // whatever landed there next.
            try self.inbound.items[self.inbound.items.len - 1]
                .keepHints(self.gpa, one.hints);
        }

        // The outbound record travels too, and nobody is owed news about it:
        // the doors where the being holds a standing know only a voice and
        // have never heard of the being at all. A being that arrived without
        // these would be alive and mute.
        for (cargo.relations) |one| {
            try self.outbound.append(self.gpa, .{
                .warden = one.warden,
                .commitment = one.commitment,
                .padlock = one.padlock,
                .voice = one.voice,
                .secret = one.secret,
                .heir = one.heir,
                .heir_secret = one.heir_secret,
                .seq = one.seq,
                // Both counters travel, so a peer's numbers stay spent across
                // the move rather than coming round again at the new door.
                .news = .{ .mark = one.news, .width = self.width },
                .holder = pk,
            });
            try self.outbound.items[self.outbound.items.len - 1]
                .keepHints(self.gpa, one.hints);
        }

        // What the second news is composed from, held until `landed` is asked
        // for it. A standing granted here afterwards is owed nothing: it never
        // knew the being anywhere else.
        if (self.arrived) |*old| old.deinit(self.gpa);
        var voices: std.ArrayList(Key) = .empty;
        for (cargo.standings) |one| try voices.append(self.gpa, one.voice);
        self.arrived = .{ .was = cargo.being, .being = pk, .voices = voices };

        return arithmetic.commitment(self.name, pk);
    }

    /// Record the succession this door published for a being that left, so the
    /// old door can point every arriving ask at where the being went.
    /// The name need not be a being this door holds, and a door that required
    /// one could not point for the half of a migration that matters most: **the
    /// new door points as well** (Article XIII), for the name the arriving
    /// being wore before, and that name is a being at no door any more. Where
    /// there is no row the pointer becomes one — a row that holds no key,
    /// stands in no standing and answers nothing but `moved`.
    ///
    /// The word is kept as it is handed over, roads included, so whatever owns
    /// those bytes must outlive the door.
    pub fn publish(self: *Warden, being_pk: Key, word: Word) Fault!void {
        for (self.beings.items) |*row| {
            if (!std.mem.eql(u8, &row.pk, &being_pk)) continue;
            row.moved = word;
            return;
        }
        try self.beings.append(self.gpa, .{
            .pk = being_pk,
            .secret = std.mem.zeroes(Key),
            .digest = std.mem.zeroes(Key),
            .commitment = std.mem.zeroes(Key),
            .moved = word,
        });
    }

    /// **The old door only points.** It answers `moved` with the succession it
    /// published and meets every other ask with silence.
    ///
    /// A being this door has moved on is reached by that pointer and by
    /// nothing else: an arriving row names the being by the name the
    /// destination minted and by that name alone, so the name it wore before
    /// stands in no standing here. If a published pointer were not reach
    /// enough, the old door could not point about the one being Article XIII
    /// sends every peer behind the news to ask it about. A stranger is
    /// answered nothing, as it is by every other describe.
    pub fn movedFor(self: Warden, voice: ?Key, being_pk: Key) Error!?Word {
        const pointer = pointer: {
            for (self.beings.items) |row| {
                if (std.mem.eql(u8, &row.pk, &being_pk)) break :pointer row.moved;
            }
            break :pointer null;
        };
        const holder = holder: {
            const v = voice orelse break :holder false;
            for (self.inbound.items) |row| {
                if (std.mem.eql(u8, &row.voice, &v)) break :holder true;
            }
            break :holder false;
        };
        if (!self.mayReach(voice, being_pk) and !(pointer != null and holder)) {
            return Error.Refused;
        }
        return pointer;
    }

    // ------------------------- Articles XIII and XIV, migrating a being away

    /// The rows that stand at one being: **who must be told when that being
    /// moves, and how to reach them**. The padlock and the roads are refreshed
    /// by every call that arrives, so a row read here is the freshest way back
    /// this door has.
    ///
    /// Ordered by the voice's bytes ascending, so a list of who is owed news
    /// does not differ between two readings. The slice comes from `a` and is
    /// the caller's to free.
    pub fn peers(self: Warden, a: std.mem.Allocator, being_pk: Key) Fault![]Peer {
        var found: std.ArrayList(Peer) = .empty;
        errdefer found.deinit(a);
        for (self.inbound.items) |row| {
            if (!row.reaches(being_pk)) continue;
            try found.append(a, .{
                .voice = row.voice,
                .padlock = row.padlock,
                .hints = row.hints,
            });
        }
        const out = try found.toOwnedSlice(a);
        std.mem.sort(Peer, out, {}, byPeer);
        return out;
    }

    /// Say which of this ground's beings spends a relation. It is a separate
    /// act because an invitation says nothing about who here will hold it, and
    /// a row that named nobody could not travel when that being moves.
    pub fn holds(self: *Warden, at: usize, being_pk: Key) Error!void {
        if (at >= self.outbound.items.len) return Error.Refused;
        self.outbound.items[at].holder = being_pk;
    }

    /// Drop the relations a being holds outward, and say how many went. It is
    /// what a being leaving takes with it: **the old door holds no voice of
    /// the being's any more**, so it may spend nothing on its behalf.
    pub fn forget(self: *Warden, being_pk: Key) usize {
        var dropped: usize = 0;
        var i: usize = self.outbound.items.len;
        while (i > 0) {
            i -= 1;
            const holder = self.outbound.items[i].holder orelse continue;
            if (!std.mem.eql(u8, &holder, &being_pk)) continue;
            var row = self.outbound.orderedRemove(i);
            row.deinit(self.gpa);
            dropped += 1;
        }
        return dropped;
    }

    /// A migration's cargo, read off what this door holds for one being: its
    /// class, its cells, and both records of standings — the inbound one so
    /// its peers keep their standing at it, and the outbound one so it keeps
    /// its standing at theirs.
    ///
    /// `heir` is the being's committed heir, handed in like every other key
    /// this kit works with and checked against the commitment this door
    /// published. **The cargo is packed under it**: migration is one message
    /// sent twice, the first moving the being's identity to that heir and the
    /// second moving it on to the key the destination minted, so a cargo
    /// packed under the name the being wears here would leave the destination
    /// composing a succession of a name every peer has already succeeded past.
    ///
    /// The cells come from the host, because a being's memory is its own and
    /// this kit never holds it. Every slice comes from `a` and the whole cargo
    /// dies with it, so an arena is what this wants.
    pub fn pack(
        self: Warden,
        a: std.mem.Allocator,
        being_pk: Key,
        heir: Key,
        cells: []const u8,
    ) Fault!Cargo {
        const row = self.being(being_pk) orelse return Error.Refused;
        if (!std.mem.eql(u8, &arithmetic.commitment(self.name, heir), &row.commitment)) {
            return Error.Refused;
        }
        const travelling = try a.dupe(Key, &.{heir});

        var standings: std.ArrayList(Standing) = .empty;
        for (self.inbound.items) |one| {
            if (!one.reaches(being_pk)) continue;
            try standings.append(a, .{
                .voice = one.voice,
                .commitment = one.commitment,
                // The name the heir commitment was minted under travels with
                // the row, or a migrated standing could never verify an older
                // commitment again.
                .name = one.minted_name,
                // Only the being that moves travels in the row, and under the
                // name the cargo is packed under: what the voice reaches here
                // besides it is this door's affair and stays.
                .beings = travelling,
                .mark = one.window.mark,
                // The replay record travels whole. A mark alone would make the
                // new door either refuse everything at or below it — killing a
                // caller with asks in flight — or honour it all.
                .spent = try a.dupe(i64, one.window.spent.items),
                // The way back travels with the standing, or the destination
                // could not speak to the peers that arrived with it.
                .padlock = one.padlock,
                .hints = one.hints,
            });
        }

        var relations: std.ArrayList(Relation) = .empty;
        for (self.outbound.items) |one| {
            const holder = one.holder orelse continue;
            if (!std.mem.eql(u8, &holder, &being_pk)) continue;
            // **The voice's keys means both of them.** Carrying the current
            // voice alone would leave the being able to act once and never
            // able to rotate, and would leave the heir secret at a door whose
            // keys are all supposed to be dead.
            try relations.append(a, .{
                .warden = one.warden,
                .commitment = one.commitment,
                .padlock = one.padlock,
                .voice = one.voice,
                .secret = one.secret,
                .heir = one.heir,
                .heir_secret = one.heir_secret,
                .seq = one.seq,
                // The mark kept for that far warden's news, which is its own
                // counter and never the one this door sends by.
                .news = one.news.mark,
                .hints = one.hints,
            });
        }

        return .{
            .being = heir,
            .digest = row.digest,
            .cells = cells,
            .standings = try standings.toOwnedSlice(a),
            .relations = try relations.toOwnedSlice(a),
        };
    }

    /// What the origin's half of a migration needs, once the cargo has landed.
    pub const Departing = struct {
        /// The being's committed heir, which signs the first news and is the
        /// successor the peer hashes.
        heir: Key,
        /// The commitment `receive` answered — **the one fact the origin
        /// cannot invent**, being the hash of a key the destination generated.
        commitment: Key,
        /// Where the being answers now.
        name: Key,
        padlock: Key,
        hints: []const []const u8 = &.{},
    };

    /// What the origin holds after departing. The key that signs the word is
    /// the heir the caller handed in.
    pub const Departed = struct {
        word: Word,
        peers: []Peer,
    };

    /// The origin's half, after the cargo has landed. It publishes the
    /// succession of the being's committed heir — carrying as its next
    /// commitment the one `receive` answered — and stops acting on the being's
    /// behalf for good.
    ///
    /// **The old door only points.** The row stays and answers `moved` alone;
    /// the standings stay, so a peer still reaches this door and is pointed;
    /// the relations go, so this door can spend nothing on the being's behalf.
    /// What the row still holds is a key the double rotation has killed.
    pub fn depart(
        self: *Warden,
        a: std.mem.Allocator,
        being_pk: Key,
        d: Departing,
    ) Fault!Departed {
        const row = self.being(being_pk) orelse return Error.Refused;
        // The peer believes the succession by hashing the successor against
        // the commitment it holds, so a key this door never committed to would
        // compose news nobody can believe.
        if (!std.mem.eql(u8, &arithmetic.commitment(self.name, d.heir), &row.commitment)) {
            return Error.Refused;
        }
        const word: Word = .{
            .being = being_pk,
            .successor = d.heir,
            .commitment = d.commitment,
            // Where it answers has changed, so the word says so, and the peer
            // rewrites its row entire from it.
            .name = d.name,
            .padlock = d.padlock,
            .hints = d.hints,
        };
        const told = try self.peers(a, being_pk);
        errdefer a.free(told);
        _ = self.forget(being_pk);
        try self.publish(being_pk, word);
        return .{ .word = word, .peers = told };
    }

    /// What the destination holds after a cargo has landed.
    pub const Landing = struct {
        word: Word,
        /// The name the arriving being wears here, and its key. The second
        /// news is signed by it: the peer holds the hash of it from the first
        /// news, so it is the one key the peer can believe that news from.
        being: Key,
        secret: Key,
        peers: []Peer,
    };

    /// The destination's half, once a cargo has been taken in.
    ///
    /// The word is composed by the kit and not by the host — a house that had
    /// to invent its own announcement would invent a different one at every
    /// ground — and the roads are handed in, as they are for a card, a grant
    /// and an ask, because a door does not know where it stands until
    /// something stands it up.
    ///
    /// **The new door points as well** (Article XIII), for the name the being
    /// wore before, so the word a peer hears and the word a peer gets by
    /// asking are the identical bytes.
    pub fn landed(
        self: *Warden,
        a: std.mem.Allocator,
        hints: []const []const u8,
    ) Fault!Landing {
        const arrived = self.arrived orelse return Error.Refused;
        const row = self.being(arrived.being) orelse return Error.Refused;
        const word: Word = .{
            .being = arrived.was,
            .successor = arrived.being,
            .commitment = row.commitment,
            .name = self.name,
            .padlock = self.padlock,
            .hints = hints,
        };
        try self.publish(arrived.was, word);

        // The rows that came with the cargo, and only those: a standing
        // granted here since the being landed was never told the being moved,
        // because it never knew the being anywhere else.
        const standing = try self.peers(a, arrived.being);
        defer a.free(standing);
        var told: std.ArrayList(Peer) = .empty;
        errdefer told.deinit(a);
        for (standing) |one| {
            for (arrived.voices.items) |voice| {
                if (!std.mem.eql(u8, &voice, &one.voice)) continue;
                try told.append(a, one);
                break;
            }
        }
        return .{
            .word = word,
            .being = row.pk,
            .secret = row.secret,
            .peers = try told.toOwnedSlice(a),
        };
    }

    /// One piece of news this door composes for one peer.
    pub const Tell = struct {
        peer: Peer,
        /// Whichever key the peer can believe this word from. Article XIV
        /// gives two roads and only two: the name, which has not moved, or a
        /// key the peer holds the hash of.
        voice_secret: Key,
        word: Word,
        /// The number this news spends, against the mark the peer keeps for
        /// this house — its own counter and never the one this door's callers
        /// spend, so the sender names it.
        seq: i64,
        allowance: envelope.Allowance = .{ .time = 5000, .hops = 8 },
        hints: []const []const u8 = &.{},
    };

    /// Compose one piece of news and hand back the sealed bytes.
    ///
    /// It is an ordinary envelope judged at the peer's door by the same steps
    /// as any ask. **What makes it news is only where its voice is found**: in
    /// the peer's outbound record rather than its inbound one — so this names
    /// no being, and the key that signs is handed in rather than held.
    ///
    /// The recipient is the padlock. An inbound row keeps the padlock the peer
    /// named and never that peer's warden name — a door never learns the house
    /// behind a voice — and a padlock is per door, so it binds the message to
    /// one door exactly as a name would.
    pub fn news(
        self: Warden,
        gpa: std.mem.Allocator,
        ephemeral_secret: Key,
        t: Tell,
    ) Fault![]u8 {
        // A peer that has never spoken left no way back. It is reached by the
        // only means left: it eventually asks, and this door points it.
        const padlock = t.peer.padlock orelse return Error.Refused;
        try spendLeash(.{ .time = t.allowance.time, .hops = t.allowance.hops });
        const args = try encodeWord(gpa, t.word);
        defer gpa.free(args);
        const signer = try arithmetic.signingPair(t.voice_secret);
        return envelope.seal(gpa, ephemeral_secret, padlock, t.voice_secret, .{ .say = .{
            .voice = signer.public,
            .recipient = padlock,
            .commitment = null,
            .seq = t.seq,
            .padlock = self.padlock,
            .hints = t.hints,
            .allowance = t.allowance,
            .being = null,
            .method = .{ .name = "tell", .args = args },
        } });
    }

    // ------------------------------------------------------- the caller side

    /// Keep an invitation as a relation: the outbound row everything this
    /// ground later says to that house is composed out of. The row's index is
    /// what a caller holds onto, because the record is a list and a pointer
    /// into it does not survive the next append.
    ///
    /// Nothing has been spent yet, so the voice this row speaks with is the
    /// heir it was handed, until the first ask rotates it.
    pub fn remember(self: *Warden, inv: wire.Invitation) std.mem.Allocator.Error!usize {
        try self.outbound.append(self.gpa, .{
            .warden = inv.warden,
            .commitment = inv.commitment,
            .padlock = inv.padlock,
            .voice = inv.heir,
            .secret = inv.heir_secret,
            .heir = inv.heir,
            .heir_secret = inv.heir_secret,
            .news = .{ .width = self.width },
            .hints = inv.hints,
        });
        return self.outbound.items.len - 1;
    }

    /// What one utterance reaches for. `next` is the pk this ask commits to,
    /// present on a rotation and on nothing else.
    pub const Reach = struct {
        being: ?Key = null,
        method: ?Method = null,
        next: ?Key = null,
        /// The number to spend, when the caller wants to choose it. Article
        /// VIII leaves that choice to the caller: a fresh mark is empty, so
        /// every number at or above one stands above it, and no door may
        /// require a first message to carry exactly one. Absent, the row
        /// counts on from what it last spent.
        seq: ?i64 = null,
        allowance: envelope.Allowance = .{ .time = 5000, .hops = 8 },
        /// The roads this ground publishes, which every say it composes
        /// carries. A ground that publishes none is reachable only down a
        /// line it opened.
        hints: []const []const u8 = &.{},
    };

    /// Compose one utterance to a far door. The number it spends comes back
    /// with it, because an answer is paired to this house by that number and
    /// it never travels outside a seal.
    ///
    /// The ephemeral secret is an argument, as every draw of randomness in
    /// this kit is: nothing here reaches for a random number generator.
    pub fn ask(
        self: *Warden,
        gpa: std.mem.Allocator,
        at: usize,
        ephemeral_secret: Key,
        r: Reach,
    ) Fault!struct { []u8, i64 } {
        if (at >= self.outbound.items.len) return Error.Refused;
        return self.askSigned(gpa, at, ephemeral_secret, self.outbound.items[at].secret, r);
    }

    /// The composing itself, told which key signs. An ordinary ask is signed
    /// by the voice that holds the standing; **a rotation is signed by the
    /// heir**, because the heir is the only key the far door will take the
    /// standing over for. The two are different keys the moment a standing
    /// has been rotated once, which is why this is a parameter rather than
    /// always the row's voice.
    fn askSigned(
        self: *Warden,
        gpa: std.mem.Allocator,
        at: usize,
        ephemeral_secret: Key,
        signer_secret: Key,
        r: Reach,
    ) Fault!struct { []u8, i64 } {
        if (at >= self.outbound.items.len) return Error.Refused;
        const row = &self.outbound.items[at];
        // A rotation starts the far door's mark fresh, so every number at or
        // above one stands above it again; on an ordinary ask the floor is
        // what this relation has already spent, because per voice the number
        // only rises.
        const floor: i64 = if (r.next != null) 0 else row.seq;
        const seq: i64 = if (r.seq) |chosen| blk: {
            if (chosen <= floor) return Error.Refused;
            break :blk chosen;
        } else row.seq + 1;

        // An answer is paired to its ask by the padlock, the warden and the
        // seq, and by nothing else. Two asks out at once carrying the same
        // three would be answered indistinguishably, so this kit refuses to
        // send the second — the shape a rotation makes, because it starts the
        // far door's mark fresh and brings a number round again.
        for (row.awaiting.items) |one| {
            if (one.seq == seq and std.mem.eql(u8, &one.padlock, &self.padlock)) {
                return Error.Refused;
            }
        }

        row.seq = seq;
        const signer = try arithmetic.signingPair(signer_secret);
        const sealed = try envelope.seal(gpa, ephemeral_secret, row.padlock, signer_secret, .{ .say = .{
            .voice = signer.public,
            .recipient = row.warden,
            .commitment = if (r.next) |next| arithmetic.commitment(row.warden, next) else null,
            .seq = seq,
            .padlock = self.padlock,
            .hints = r.hints,
            .allowance = r.allowance,
            .being = r.being,
            .method = r.method,
        } });
        // There is an envelope: the ask is out, and the caller keeps the
        // record its answer will be judged against.
        try row.awaiting.append(self.gpa, .{ .padlock = self.padlock, .seq = seq });
        return .{ sealed, seq };
    }

    /// Whoever minted a voice has seen its keys, so a holder's first act is a
    /// rotation to a key nobody else has ever seen. `next_secret` is that key,
    /// handed in rather than drawn here.
    ///
    /// The composing and the moving of the keys are one act, so the two can
    /// never be seen apart: the row ends standing on the key that just signed
    /// and committing to `next_secret` beside it.
    pub fn rotate(
        self: *Warden,
        gpa: std.mem.Allocator,
        at: usize,
        ephemeral_secret: Key,
        next_secret: Key,
        r: Reach,
    ) Fault!struct { []u8, i64 } {
        if (at >= self.outbound.items.len) return Error.Refused;
        const next = try arithmetic.signingPair(next_secret);
        var reaching = r;
        reaching.next = next.public;

        // Signed by the heir, never by the voice. On the first rotation the
        // two are the same key, because an invitation hands one out as both;
        // on every rotation after it they differ, and signing with the voice
        // would present a standing's current holder as its own heir.
        const heir_secret = self.outbound.items[at].heir_secret;
        const composed = try self.askSigned(gpa, at, ephemeral_secret, heir_secret, reaching);

        const row = &self.outbound.items[at];
        row.voice = row.heir;
        row.secret = row.heir_secret;
        row.heir = next.public;
        row.heir_secret = next_secret;
        return composed;
    }

    /// Judge an answer at this caller's end — Article XII's shorter road,
    /// whole.
    ///
    /// The envelope's half is the unseal, the leading byte, and the signature
    /// verified against the `warden` the answer's own record carries. The two
    /// left are the caller's own bookkeeping, because only the caller knows
    /// what it asked: that warden must be a door this ground holds a relation
    /// with, and **an ask must be awaiting under that padlock, that warden and
    /// that seq**.
    ///
    /// An answer nothing awaits is the same silence as every other failure,
    /// and hearing one spends the record, so the same bytes never answer
    /// twice.
    pub fn hear(self: *Warden, gpa: std.mem.Allocator, reply: []const u8) Fault!envelope.Opened {
        var opened = try envelope.open(gpa, self.padlock_secret, .answer, reply);
        errdefer opened.deinit();
        const said = opened.payload.answer;
        for (self.outbound.items) |*row| {
            if (!std.mem.eql(u8, &row.warden, &said.warden)) continue;
            for (row.awaiting.items, 0..) |one, i| {
                if (one.seq != said.seq) continue;
                if (!std.mem.eql(u8, &one.padlock, &self.padlock)) continue;
                _ = row.awaiting.orderedRemove(i);
                return opened;
            }
        }
        return Error.Refused;
    }

    /// Stop awaiting an ask whose answer will never come — a road that failed
    /// to carry, or a caller that has stopped waiting. Nothing on the wire
    /// changes: the number stays spent, because a message the far door judged
    /// spent it there whatever this end does with its own record.
    pub fn forgo(self: *Warden, at: usize, seq: i64) bool {
        if (at >= self.outbound.items.len) return false;
        const row = &self.outbound.items[at];
        for (row.awaiting.items, 0..) |one, i| {
            if (one.seq == seq and std.mem.eql(u8, &one.padlock, &self.padlock)) {
                _ = row.awaiting.orderedRemove(i);
                return true;
            }
        }
        return false;
    }

    /// The road `accept` spends: one envelope out, the sealed answer or
    /// nothing back. It is a callback rather than a socket because the warden
    /// is never the road.
    pub const Road = struct {
        context: *anyopaque,
        send: *const fn (*anyopaque, []const u8) anyerror!?[]const u8,
    };

    /// The keys accepting an invitation costs, all four handed in.
    pub const Accepting = struct {
        /// The voice this ground will stand on, which the granter has never
        /// seen.
        voice_secret: Key,
        /// The heir it commits to beside that voice.
        heir_secret: Key,
        /// One ephemeral per envelope, and there are two.
        ephemeral: [2]Key,
        being: ?Key = null,
        method: ?Method = null,
        allowance: envelope.Allowance = .{ .time = 5000, .hops = 8 },
        hints: []const []const u8 = &.{},
    };

    /// What spending an invitation whole leaves the holder standing on.
    pub const Accepted = struct {
        at: usize,
        far: Key,
        voice: Key,
        heir: Key,
        commitment: Key,
        opening: ?[]const u8,
        answer: ?[]const u8,
        seq: i64,
    };

    /// Accept an invitation, whole — Razvan's ruling, 2026-08-31.
    ///
    /// **An invitation is spent, not held.** Whoever minted it has seen both
    /// the voice and the heir behind it, so a holder standing on either is a
    /// holder the granter can still speak as at the granter's own door. Only
    /// a key this ground generated ends that, and reaching one costs **two**
    /// rotate-and-asks. Forgetting the second is the mistake this helper
    /// exists to make unmakeable.
    ///
    /// The first is signed by the invitation's heir — the only key the
    /// granting door will take the standing over for — and commits to a fresh
    /// voice nobody else has seen. The second is signed by that voice,
    /// commits to a fresh heir, and carries the caller's own ask. After it,
    /// every key the granter ever held for this standing is dead.
    ///
    /// **Nothing here is wire.** It is `remember` and `rotate` composed, and
    /// that raw path stays open: a caller that wants the steps takes them.
    pub fn accept(
        self: *Warden,
        gpa: std.mem.Allocator,
        inv: wire.Invitation,
        a: Accepting,
        road: Road,
    ) !Accepted {
        const at = try self.remember(inv);

        const first, const opening_seq = try self.rotate(gpa, at, a.ephemeral[0], a.voice_secret, .{
            .allowance = a.allowance,
            .hints = a.hints,
        });
        const opening = try road.send(road.context, first);
        // The opening is handed back sealed for the caller to judge, so this
        // helper stops awaiting it: a record nothing will ever spend is a
        // leak, and where both rotations open at one it is what would make
        // the second ask indistinguishable from the first.
        _ = self.forgo(at, opening_seq);

        const second, const seq = try self.rotate(gpa, at, a.ephemeral[1], a.heir_secret, .{
            .being = a.being,
            .method = a.method,
            .allowance = a.allowance,
            .hints = a.hints,
        });
        const replied = try road.send(road.context, second);

        const row = self.outbound.items[at];
        return .{
            .at = at,
            .far = inv.warden,
            .voice = row.voice,
            .heir = row.heir,
            .commitment = arithmetic.commitment(row.warden, row.heir),
            .opening = opening,
            .answer = replied,
            .seq = seq,
        };
    }
};
