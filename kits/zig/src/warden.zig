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
///
/// A dwell is never negative. Where this door's own two readings yield a
/// dwell below zero the onward budget is the arriving one: a clock that has
/// gone backwards is this door's fault and never the peer's, so the call is
/// handed onward under what arrived rather than withheld.
pub fn onward(arriving: Leash, dwell: i64) ?Leash {
    const hops = std.math.sub(i64, arriving.hops, 1) catch return null;
    if (hops < 0) return null;
    const spent = if (dwell > 0) dwell else 0;
    const time = std.math.sub(i64, arriving.time, spent) catch return null;
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
    /// That being's class, as the far door's `blueprint` answered it. It is
    /// what makes the being's fields callable, and it is kept here rather than
    /// beside a label because a standing may name more beings than a label
    /// can, and because a re-read replaces it.
    text: []u8 = &.{},
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
        for (self.beings.items) |one| gpa.free(one.text);
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
    /// The answer that arrived through the door for this ask, held until
    /// whoever asked comes back for it. Owned by the warden's allocator.
    answer: ?[]u8 = null,
    /// True once the door has settled this ask, with an answer or without.
    /// A road that answers later leaves this false until it does.
    settled: bool = false,
    /// What whoever asked is waiting on, where a road answers later. It lives
    /// on its own rather than in the row, because the rows move as the list
    /// they sit in grows and a waiter must not follow.
    woken: ?*std.Io.Event = null,
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
    /// The ordinary pointer to the object, wearing the one shape the warden
    /// knows it by. Absent for a pointer row, and for a being the door holds
    /// keys for but nothing behind — which is silence like any other.
    organ: ?Organ = null,
    /// The blueprint parsed once, when the being is held, and never again at
    /// judgment time. It owns the text `text` points at.
    shape: ?*notation.Blueprint = null,
    /// The bytes the blueprint was parsed out of, where this row owns them.
    /// A parse borrows its text, so the two are kept and dropped together; a
    /// row standing on a text somebody else owns holds nothing here.
    owned_text: ?[]u8 = null,
    /// True where the parse above belongs to this row and must be dropped
    /// with it.
    owns_shape: bool = false,

    pub fn deinit(self: *BeingRow, gpa: std.mem.Allocator) void {
        if (self.owned_text) |bytes| gpa.free(bytes);
        self.owned_text = null;
        if (!self.owns_shape) return;
        if (self.shape) |one| {
            one.deinit();
            gpa.destroy(one);
        }
        self.shape = null;
        self.owns_shape = false;
    }

    /// The field of that name this being's blueprint declares, or nothing.
    /// **The blueprint is the scope**: a name it does not declare is not
    /// reached for on the object at all.
    pub fn declares(self: BeingRow, name: []const u8) ?notation.Field {
        const shape = self.shape orelse return null;
        for (shape.class.fields) |f| {
            if (std.mem.eql(u8, f.name, name)) return f;
        }
        return null;
    }
};

// ---------------------------------------------- what the host hands in

/// A row as delivery sees it: the way back and nothing else. **The warden
/// holds hints without reading them**, and hands them on unparsed.
pub const Row = struct {
    padlock: Key,
    hints: []const []const u8 = &.{},
};

/// What a road said about an envelope handed to it.
pub const Carried = union(enum) {
    /// The road answers in its response and this is the answer, owned by the
    /// caller's allocator.
    answered: []u8,
    /// The road carried it and whatever comes back will arrive through the
    /// door as a message of its own.
    later,
    /// Nothing carried. The number was spent all the same.
    silence,
};

/// Delivery, handed to the warden at open and the one thing beneath it that
/// reads a hint. The warden gives it an envelope and a row view, and nothing
/// else ever passes down this way but a padlock beside an opaque token.
pub const Delivery = struct {
    context: *anyopaque,
    send: *const fn (*anyopaque, std.mem.Allocator, Row, []const u8) std.mem.Allocator.Error!Carried,
    /// The warden's one call downward: having judged a frame, it says which
    /// padlock's asks arrive on the road this one came in on. The token is
    /// the road's own and the warden never read it.
    arrived: ?*const fn (*anyopaque, Key, ?*anyopaque) void = null,
    /// Whether this road may ever answer `.later` — that is, bring an answer
    /// back through the door on a thread of its own rather than in the
    /// response it hands straight back. A road that says so is the whole
    /// reason a warden needs a platform, and `open` refuses one declared here
    /// with no `io` beside it.
    later: bool = false,
};

/// Where the records live. The store's shape is the warden's; where it lives
/// is the host's.
pub const Store = struct {
    context: *anyopaque,
    save: *const fn (*anyopaque, []const u8) anyerror!void,
    /// The bytes come back owned by the caller's allocator, or nothing where
    /// the store is empty.
    load: *const fn (*anyopaque, std.mem.Allocator) anyerror!?[]u8,
};

/// The inward channel: why the door fell silent, told to its own house.
/// Nothing here crosses the wire.
pub const Observer = struct {
    context: *anyopaque,
    hush: *const fn (*anyopaque, []const u8) void,
};

/// Which kind of caller the judgment found. A fact for telling callers apart,
/// never a judgment: permission lives in the inbound record alone.
pub const Kind = enum { holder, rotation, stranger, local };

pub const Caller = struct {
    voice: ?Key = null,
    kind: Kind,
};

/// What the warden hands a being's method, per call.
pub const Call = struct {
    caller: Caller,
    /// The allowance that arrived, and the clock reading taken when it did.
    /// The being hands it on and never widens it.
    leash: Leash,
    arrived: i64,
};

/// A private label beside a row: it resolves nothing and travels nowhere.
/// Either a being minted beside another one here, or a relation accepted at
/// a house elsewhere.
pub const LabelAt = union(enum) {
    /// A being this warden holds.
    local: Key,
    /// A relation: which outbound row, which being at the far house, and the
    /// text of that being's class, which is what makes its fields callable.
    far: struct { at: usize, being: Key, text: []u8 },
};

pub const Label = struct {
    name: []u8,
    at: LabelAt,

    pub fn deinit(self: *Label, gpa: std.mem.Allocator) void {
        gpa.free(self.name);
        switch (self.at) {
            .far => |one| gpa.free(one.text),
            .local => {},
        }
    }
};

/// A clock and a randomness that stand in until a host hands the real ones
/// in. Neither is fit for a ground: the first never moves, and the second
/// draws nothing at all. They exist so a `Warden` built as a plain struct —
/// which is how every judgment case in this kit's bench builds one — has the
/// two fields filled with something that will not reach for a global.
pub fn stillClock() i64 {
    return 0;
}

pub fn zeroRandom() Key {
    return std.mem.zeroes(Key);
}

/// A being as the warden holds it: an ordinary pointer and the one way in.
/// **The being never sees a byte and never touches a key** — the wrapper on
/// the far side of `invoke` decodes the arguments and encodes the answer.
pub const Organ = struct {
    context: *anyopaque,
    /// Answers bytes owned by `gpa`, or nothing for a field that declares no
    /// answer. `Error.Refused` is the being's own fault, and is silence.
    ///
    /// The field and the blueprint's records come with the call because the
    /// door has already found them: **what a being's method is given and what
    /// it answers are both the blueprint's declared types**, and the wrapper
    /// on the other side of this is what turns one into the other. The being
    /// never sees a byte.
    invoke: *const fn (
        *anyopaque,
        std.mem.Allocator,
        notation.Field,
        []const notation.Block,
        []const u8,
        Call,
    ) Fault!?[]u8,
    /// What of the being's state moves with it. Provided by the being, not
    /// received: a being that provides neither moves with nothing.
    cells: ?*const fn (*anyopaque, std.mem.Allocator) Fault![]u8 = null,
    take: ?*const fn (*anyopaque, []const u8) Fault!void = null,
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

    /// The roads this ground publishes, told to the warden rather than fixed
    /// at birth: a door on an ephemeral port has no address until it is
    /// listening. Every mint after one is published carries it.
    hints: std.ArrayList([]u8) = .empty,

    // Handed in at open by the host, never reached for.

    /// Milliseconds since the epoch. The judgment takes two readings and the
    /// difference is this door's dwell.
    clock: *const fn () i64 = stillClock,
    /// Thirty-two fresh bytes. Every key and every ephemeral secret comes
    /// from here, and nothing in this kit draws one without being handed it.
    random: *const fn () Key = zeroRandom,
    /// The one thing beneath the warden that reads a hint.
    delivery: ?Delivery = null,
    /// Where both records, the keys, the marks and the labels survive a
    /// restart.
    store: ?Store = null,
    /// Why the door fell silent, told inward.
    observer: ?Observer = null,
    /// The leash a walk is born with when a being starts one of its own.
    allowance: envelope.Allowance = .{ .time = 5000, .hops = 8 },

    /// Private labels beside the rows: they resolve nothing and travel
    /// nowhere, and a being reaches its relations by them.
    labels: std.ArrayList(Label) = .empty,

    /// The platform, handed in like the clock and the randomness: what the
    /// door waits and takes its turns on. **It is not a road** — no socket,
    /// no address and no hint is reachable through it, and nothing here ever
    /// asks it to carry a byte.
    ///
    /// A warden handed none is a warden nobody runs two threads at, which is
    /// exactly what a warden built as a plain struct for one judgment is.
    /// Then there is nothing to take turns over and nothing that could bring
    /// an answer in later, so a road that answers later meets silence.
    io: ?std.Io = null,
    /// One door, many roads, and a road that reads a frame must not be the
    /// thread that judges it — so what the records hold is guarded here. It
    /// is let go around a being's own work, because a being answering a call
    /// may make one of its own.
    lock: std.Io.Mutex = .init,

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
        for (self.beings.items) |*row| row.deinit(self.gpa);
        for (self.labels.items) |*one| one.deinit(self.gpa);
        for (self.hints.items) |one| self.gpa.free(one);
        self.hints.deinit(self.gpa);
        self.labels.deinit(self.gpa);
        self.inbound.deinit(self.gpa);
        self.outbound.deinit(self.gpa);
        self.beings.deinit(self.gpa);
        self.arms.deinit(self.gpa);
        if (self.arrived) |*one| one.deinit(self.gpa);
    }

    /// The roads, as everything that mints wants them: borrowed, and only for
    /// as long as nothing publishes.
    pub fn roads(self: Warden, a: std.mem.Allocator) std.mem.Allocator.Error![]const []const u8 {
        const out = try a.alloc([]const u8, self.hints.items.len);
        for (self.hints.items, out) |from, *into| into.* = from;
        return out;
    }

    /// A warden does not know where it stands until something stands it up.
    /// Roads accumulate, because a warden offers as many as it has and none
    /// is authoritative; telling it the same road twice adds nothing.
    pub fn publishRoad(self: *Warden, hint: []const u8) std.mem.Allocator.Error!void {
        for (self.hints.items) |one| {
            if (std.mem.eql(u8, one, hint)) return;
        }
        try self.hints.append(self.gpa, try self.gpa.dupe(u8, hint));
    }

    /// A road that has stopped carrying is not a road. Retracting one is not
    /// news on its own; it only stops the dead road being minted into
    /// anything new.
    pub fn retractRoad(self: *Warden, hint: []const u8) void {
        var i: usize = 0;
        while (i < self.hints.items.len) {
            if (std.mem.eql(u8, self.hints.items[i], hint)) {
                self.gpa.free(self.hints.orderedRemove(i));
            } else i += 1;
        }
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

    /// The three describes again, for a handle at a being under this same
    /// warden. **Under one warden there are no strangers and no voices**, so
    /// there is nothing to scope by: what a neighbour is shown is what the
    /// door holds. They answer the same shapes the wire ones do, because a
    /// being written for one kind of neighbour is installed anywhere.
    pub fn estateWithin(self: Warden, gpa: std.mem.Allocator) Fault!ReadEstate {
        var arena = std.heap.ArenaAllocator.init(gpa);
        errdefer arena.deinit();
        const a = arena.allocator();

        var digests: std.ArrayList(Key) = .empty;
        for (self.beings.items) |row| {
            var known = false;
            for (digests.items) |d| {
                if (std.mem.eql(u8, &d, &row.digest)) known = true;
            }
            if (!known) try digests.append(a, row.digest);
        }
        const classes = try a.alloc(Class, digests.items.len);
        for (digests.items, classes) |d, *slot| {
            var beings: std.ArrayList(Held) = .empty;
            for (self.beings.items) |row| {
                if (!std.mem.eql(u8, &row.digest, &d)) continue;
                try beings.append(a, .{ .being = row.pk, .commitment = row.commitment });
            }
            slot.* = .{ .digest = d, .beings = beings.items };
        }
        return .{ .arena = arena, .estate = try order(a, .{ .classes = classes }) };
    }

    pub fn sketchWithin(self: Warden, pk: Key) Error!Sketch {
        const row = self.being(pk) orelse return Error.Refused;
        return .{ .being = row.pk, .digest = row.digest, .commitment = row.commitment };
    }

    pub fn blueprintWithin(self: Warden, want: Key) Error![]const u8 {
        for (self.beings.items) |row| {
            if (std.mem.eql(u8, &row.digest, &want)) return row.text;
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
        // anything is unsealed. A limit of zero is a door that published
        // none, and it reads whatever arrives.
        if (self.limit > 0 and letter.len > self.limit) return Error.Refused;

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
        //
        // Every match is counted before anything moves. Matching more than one
        // standing is silence: no order over the records is law, so a door that
        // took the first it found would have chosen, and the next door would
        // choose differently. A granter that committed one heir at two
        // standings has made its own error.
        var matched: ?usize = null;
        for (self.inbound.items, 0..) |row, i| {
            const claimed = arithmetic.commitment(row.minted_name, say.voice);
            if (!std.mem.eql(u8, &claimed, &row.commitment)) continue;
            if (matched != null) return Error.Refused;
            matched = i;
        }
        if (matched) |i| {
            const row = &self.inbound.items[i];
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
            // News is not a rotation and does not use this field, and a
            // carried commitment is ignored rather than refused: the two
            // refusals Article XI names are the only two. A door that refused
            // news for a stray field would meet a succession with silence,
            // which is the one message a house cannot afford to have refused —
            // and the value most likely to be carried by mistake is the one
            // this row already holds, so the door would find a match.
            if (std.mem.eql(u8, &row.warden, &say.voice)) {
                return .{ .news = .{ .at = i, .by_heir = false } };
            }
            if (std.mem.eql(u8, &claimed, &row.commitment)) {
                return .{ .news = .{ .at = i, .by_heir = true } };
            }
            // Or as the heir a being at that house committed, which a describe
            // published and `note` kept. Which commitment the voice hashed to
            // is what decides whose succession it may announce, so it is
            // placed here rather than read off the word.
            for (row.beings.items) |far| {
                if (!std.mem.eql(u8, &claimed, &far.commitment)) continue;
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
    /// `text` is that being's class as the far door answered it, kept beside
    /// the commitment so a handle can call through it. Nothing where the
    /// caller has not read one; a second note with one replaces what stands.
    pub fn note(self: *Warden, at: usize, pk: Key, commitment: Key, text: ?[]const u8) Fault!void {
        if (at >= self.outbound.items.len) return Error.Refused;
        const row = &self.outbound.items[at];
        // The house's name and its public being are one key, and its
        // commitment is the row's own. A second copy under the beings would be
        // a second place to believe one succession from.
        if (std.mem.eql(u8, &row.warden, &pk)) return Error.Refused;
        const kept: []u8 = if (text) |one| try self.gpa.dupe(u8, one) else &.{};
        errdefer self.gpa.free(kept);
        for (row.beings.items) |*far| {
            if (std.mem.eql(u8, &far.being, &pk)) {
                far.commitment = commitment;
                if (text != null) {
                    self.gpa.free(far.text);
                    far.text = kept;
                }
                return;
            }
        }
        try row.beings.append(self.gpa, .{ .being = pk, .commitment = commitment, .text = kept });
    }

    /// The class this door has read for one being at a far house, or nothing
    /// where it has read none. It lives as long as the relation does, which is
    /// what a handle calls through.
    pub fn textAt(self: Warden, at: usize, pk: Key) ?[]const u8 {
        if (at >= self.outbound.items.len) return null;
        for (self.outbound.items[at].beings.items) |far| {
            if (std.mem.eql(u8, &far.being, &pk)) {
                return if (far.text.len == 0) null else far.text;
            }
        }
        return null;
    }

    /// The far house a relation stands at, which is also its public being.
    pub fn houseAt(self: Warden, at: usize) ?Key {
        if (at >= self.outbound.items.len) return null;
        return self.outbound.items[at].warden;
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
        // To a holder who reached it before, never to a stranger — and holding
        // a standing at some other being here is not having reached this one.
        // At the old door the standings still name the being that left, which
        // `mayReach` catches; at a destination they name it by the key this
        // house minted, so reaching the successor the published word names is
        // what reached-it-before means there.
        const pointed = pointed: {
            const word = pointer orelse break :pointed false;
            const successor = word.successor orelse break :pointed false;
            break :pointed self.mayReach(voice, successor);
        };
        if (!self.mayReach(voice, being_pk) and !pointed) {
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

    /// Drop one relation by the index `remember` answered with. It is what an
    /// acceptance that never completed gives back, and it is the warden's own
    /// act because **the two records are edited here and nowhere else**: a
    /// caller reaching into the list would be the door's judgment written
    /// outside the door.
    pub fn drop(self: *Warden, at: usize) bool {
        if (at >= self.outbound.items.len) return false;
        var gone = self.outbound.orderedRemove(at);
        gone.deinit(self.gpa);
        return true;
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
    /// Keep an invitation as a relation. **The roads are copied in**: an
    /// invitation is read out of a message or handed over by whoever minted
    /// it, and both die long before the relation does — a row pointing at
    /// freed bytes is a way back that reads as whatever landed there next.
    pub fn remember(self: *Warden, inv: wire.Invitation) Fault!usize {
        try self.outbound.append(self.gpa, .{
            .warden = inv.warden,
            .commitment = inv.commitment,
            .padlock = inv.padlock,
            .voice = inv.heir,
            .secret = inv.heir_secret,
            .heir = inv.heir,
            .heir_secret = inv.heir_secret,
            .news = .{ .width = self.width },
        });
        const at = self.outbound.items.len - 1;
        try self.outbound.items[at].keepHints(self.gpa, inv.hints);
        return at;
    }

    /// Keep a card as a relation: the same row, standing on a voice this
    /// ground minted for itself rather than one a granter handed over.
    ///
    /// **A card is a standing at nothing**, so the voice is nobody's grant and
    /// there is no rotation to make: the far door finds this voice in no
    /// record and answers it as the stranger it is. The secret is handed in,
    /// as every key in this kit is.
    pub fn approach(self: *Warden, held: wire.Card, voice_secret: Key) Fault!usize {
        const voice = try arithmetic.signingPair(voice_secret);
        try self.outbound.append(self.gpa, .{
            .warden = held.warden,
            .commitment = held.commitment,
            .padlock = held.padlock,
            .voice = voice.public,
            .secret = voice_secret,
            .heir = voice.public,
            .heir_secret = voice_secret,
            .news = .{ .width = self.width },
        });
        const at = self.outbound.items.len - 1;
        try self.outbound.items[at].keepHints(self.gpa, held.hints);
        return at;
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
                if (one.answer) |bytes| self.gpa.free(bytes);
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

    // ------------------------------------------------- what the host opens

    /// The three seeds a warden is founded on: the name it is known by, the
    /// padlock every message to it is sealed with, and the heir its name
    /// commits to. Handed in and never reached for.
    pub const Seeds = struct {
        name: Key,
        padlock: Key,
        heir: Key,
    };

    pub const Opening = struct {
        seeds: Seeds,
        /// Milliseconds since the epoch.
        clock: *const fn () i64,
        /// Thirty-two fresh bytes, per draw.
        random: *const fn () Key,
        /// The platform the door waits and takes its turns on. **A delivery
        /// that declares `later` must have one**: without it there is no
        /// thread to bring the answer in and nothing to wait on, so the ask
        /// would fall silent at the moment the answer arrived rather than
        /// here. A ground whose roads all answer in the response they hand
        /// back has one thread and needs none.
        io: ?std.Io = null,
        delivery: ?Delivery = null,
        store: ?Store = null,
        observer: ?Observer = null,
        limit: usize = 0,
        width: i64 = 64,
        allowance: envelope.Allowance = .{ .time = 5000, .hops = 8 },
    };

    /// Open a warden on what the host hands it. **A warden is opened, not
    /// built**: its keys are derived from the seeds it is handed, its public
    /// being is minted, and whatever a previous life left in the store is
    /// read back before it answers anything.
    pub fn open(gpa: std.mem.Allocator, o: Opening) Fault!Warden {
        // The one thing an opening can be wrong about that nothing later can
        // recover from: a road that answers through the door, and no platform
        // to hold the ask open until it does.
        if (o.delivery) |d| {
            if (d.later and o.io == null) return Error.Refused;
        }

        const named = try arithmetic.signingPair(o.seeds.name);
        const sealing = try arithmetic.sealingPair(o.seeds.padlock);
        const heir = try arithmetic.signingPair(o.seeds.heir);

        var self: Warden = .{
            .gpa = gpa,
            .name = named.public,
            .name_secret = o.seeds.name,
            .padlock = sealing.public,
            .padlock_secret = o.seeds.padlock,
            .limit = o.limit,
            .width = o.width,
            .clock = o.clock,
            .random = o.random,
            .io = o.io,
            .delivery = o.delivery,
            .store = o.store,
            .observer = o.observer,
            .allowance = o.allowance,
        };
        errdefer self.deinit();

        // The public being: every warden has one, it is a being like any
        // other, and it is named by the warden's own name.
        const shape = try gpa.create(notation.Blueprint);
        errdefer gpa.destroy(shape);
        shape.* = try notation.parse(gpa, blueprint_text);
        try self.beings.append(gpa, .{
            .pk = named.public,
            .secret = o.seeds.name,
            .digest = digest(),
            .commitment = arithmetic.commitment(named.public, heir.public),
            .text = shape.canonical,
            .shape = shape,
            .owns_shape = true,
        });

        // What must survive a restart is read back from the store the host
        // handed in. The beings themselves are pointers and cannot be stored;
        // the host holds them again on the same seeds, and the rows find them
        // by name.
        try self.restore();
        return self;
    }

    /// Take the door's turn, and give it back. Where no platform was handed
    /// in there is only one thread and nothing to take turns over.
    ///
    /// The layer above the warden — the being's own API, and the host — reads
    /// and writes the same records, so both take the same turn. Nothing
    /// beneath the door ever does: a road hands bytes to `arrive` and knows
    /// none of this.
    pub fn take(self: *Warden) void {
        const io = self.io orelse return;
        self.lock.lockUncancelable(io);
    }

    pub fn give(self: *Warden) void {
        const io = self.io orelse return;
        self.lock.unlock(io);
    }

    /// Who is told, inward, when the door falls silent.
    pub fn observe(self: *Warden, o: ?Observer) void {
        self.observer = o;
    }

    /// Every silence goes through here, so the two directions cannot drift:
    /// outward it is always nothing, inward it is a reason. An observer that
    /// falls over is the observer's problem and never the caller's.
    fn hush(self: *Warden, reason: []const u8) ?[]u8 {
        if (self.observer) |o| o.hush(o.context, reason);
        return null;
    }

    // ------------------------------------------------------ holding a being

    pub const Holding = struct {
        /// The text of the class this being shows. It is copied in.
        blueprint: []const u8,
        /// The ordinary pointer, wearing the shape the warden knows it by.
        organ: Organ,
        /// The key the being is named by, and the one it commits to. A seed
        /// handed in is what lets a restarted host hold the same object under
        /// the same name, which is the whole of why a standing survives one.
        seed: ?Key = null,
        heir_seed: ?Key = null,
        /// A private label, so a being minted beside another is reachable.
        label: ?[]const u8 = null,
    };

    /// Hold an object: mint its keys, keep the pointer, and parse the class
    /// it shows. **The class is free and the surface is bound** — what the
    /// blueprint does not declare does not exist for that being, and the door
    /// serves nothing else.
    pub fn hold(self: *Warden, h: Holding) Fault!Key {
        const seed = h.seed orelse self.random();
        const keys = try arithmetic.signingPair(seed);
        const heir = try arithmetic.signingPair(h.heir_seed orelse seed);

        const shape = try self.gpa.create(notation.Blueprint);
        errdefer self.gpa.destroy(shape);
        const text = try self.gpa.dupe(u8, h.blueprint);
        errdefer self.gpa.free(text);
        shape.* = try notation.parse(self.gpa, text);
        errdefer shape.deinit();

        const fresh: BeingRow = .{
            .pk = keys.public,
            .secret = seed,
            .digest = shape.digest(),
            .commitment = arithmetic.commitment(self.name, heir.public),
            .text = shape.canonical,
            .organ = h.organ,
            .shape = shape,
            .owned_text = text,
            .owns_shape = true,
        };

        // A being held twice under one name is one being: the second hold is
        // the host taking the same object up again after a restart, and the
        // standings that were read back are already pointing at it.
        for (self.beings.items) |*row| {
            if (!std.mem.eql(u8, &row.pk, &keys.public)) continue;
            row.deinit(self.gpa);
            row.* = fresh;
            if (h.label) |one| try self.keepLabel(one, .{ .local = keys.public });
            return keys.public;
        }

        try self.beings.append(self.gpa, fresh);
        if (h.label) |one| try self.keepLabel(one, .{ .local = keys.public });
        try self.persist();
        return keys.public;
    }

    /// Let a being go. **A released being takes every standing at it away**,
    /// and whoever held one meets a silence indistinguishable from anything.
    pub fn releaseBeing(self: *Warden, pk: Key) bool {
        var found = false;
        var i: usize = 0;
        while (i < self.beings.items.len) {
            if (std.mem.eql(u8, &self.beings.items[i].pk, &pk)) {
                var gone = self.beings.orderedRemove(i);
                gone.deinit(self.gpa);
                found = true;
            } else i += 1;
        }
        if (!found) return false;

        var at: usize = 0;
        while (at < self.inbound.items.len) {
            const row = &self.inbound.items[at];
            var j: usize = 0;
            while (j < row.beings.items.len) {
                if (std.mem.eql(u8, &row.beings.items[j], &pk)) {
                    _ = row.beings.orderedRemove(j);
                } else j += 1;
            }
            if (row.beings.items.len == 0) {
                var gone = self.inbound.orderedRemove(at);
                gone.deinit(self.gpa);
            } else at += 1;
        }

        var k: usize = 0;
        while (k < self.labels.items.len) {
            const one = self.labels.items[k];
            if (one.at == .local and std.mem.eql(u8, &one.at.local, &pk)) {
                var gone = self.labels.orderedRemove(k);
                gone.deinit(self.gpa);
            } else k += 1;
        }
        self.persist() catch {};
        return true;
    }

    /// Keep a private label beside a row.
    pub fn keepLabel(self: *Warden, text: []const u8, at: LabelAt) Fault!void {
        var i: usize = 0;
        while (i < self.labels.items.len) {
            if (std.mem.eql(u8, self.labels.items[i].name, text)) {
                var gone = self.labels.orderedRemove(i);
                gone.deinit(self.gpa);
            } else i += 1;
        }
        try self.labels.append(self.gpa, .{ .name = try self.gpa.dupe(u8, text), .at = at });
    }

    /// What a label points at, or nothing. **Nothing resolves a label but
    /// this**: labels travel nowhere and mean nothing at any other door.
    pub fn labelled(self: *Warden, text: []const u8) ?Label {
        for (self.labels.items) |one| {
            if (std.mem.eql(u8, one.name, text)) return one;
        }
        return null;
    }

    // ----------------------------------------------------- the social acts

    /// Who holds a place at this being, **as voices only**. Marks, windows,
    /// padlocks and hints stay at the door.
    pub fn standingsAt(
        self: Warden,
        a: std.mem.Allocator,
        being_pk: Key,
    ) std.mem.Allocator.Error![]Key {
        var out: std.ArrayList(Key) = .empty;
        for (self.inbound.items) |row| {
            if (row.reaches(being_pk)) try out.append(a, row.voice);
        }
        return out.toOwnedSlice(a);
    }

    /// Open a being to somebody: mint a voice, record it at that being, and
    /// hand back the five things a holder holds. **A grant names the being it
    /// opens** — there is no grant of a house.
    pub fn grant(self: *Warden, a: std.mem.Allocator, being_pk: Key) Fault!wire.Invitation {
        if (self.being(being_pk) == null) return Error.Refused;
        const voice = try arithmetic.signingPair(self.random());
        const heir = try arithmetic.signingPair(self.random());

        var beings: std.ArrayList(Key) = .empty;
        errdefer beings.deinit(self.gpa);
        try beings.append(self.gpa, being_pk);
        try self.inbound.append(self.gpa, .{
            .voice = voice.public,
            .commitment = arithmetic.commitment(self.name, heir.public),
            .minted_name = self.name,
            .beings = beings,
            .window = .{ .width = self.width },
        });
        try self.persist();

        return .{
            .warden = self.name,
            .commitment = self.being(self.name).?.commitment,
            .padlock = self.padlock,
            .heir = heir.public,
            .heir_secret = heir.secret,
            .hints = try self.roads(a),
        };
    }

    /// The four things a stranger holds: the invitation without the voice.
    /// **It opens nothing** — whoever holds it can reach this door and be
    /// answered as the stranger they are, and a card is what a door may
    /// publish anywhere.
    pub fn card(self: *Warden, a: std.mem.Allocator) Fault!wire.Card {
        return .{
            .warden = self.name,
            .commitment = self.being(self.name).?.commitment,
            .padlock = self.padlock,
            .hints = try self.roads(a),
        };
    }

    /// Amend a standing: beings added, beings taken away. **Taking the last
    /// one away is release, and there is no separate act for it** — the row
    /// goes, the holder is a stranger at its next call, and nobody is told.
    pub fn amend(self: *Warden, voice: Key, add: []const Key, remove: []const Key) Fault!bool {
        const at = self.standingAt(voice) orelse return false;
        for (add) |pk| {
            if (self.being(pk) == null) continue;
            const row = &self.inbound.items[at];
            if (!row.reaches(pk)) try row.beings.append(self.gpa, pk);
        }
        for (remove) |pk| {
            const row = &self.inbound.items[at];
            var i: usize = 0;
            while (i < row.beings.items.len) {
                if (std.mem.eql(u8, &row.beings.items[i], &pk)) {
                    _ = row.beings.orderedRemove(i);
                } else i += 1;
            }
        }
        if (self.inbound.items[at].beings.items.len == 0) {
            var gone = self.inbound.orderedRemove(at);
            gone.deinit(self.gpa);
        }
        try self.persist();
        return true;
    }

    // ------------------------------------------------- the one entry point

    /// **One entry point for anything a road brings.** The record byte inside
    /// the seal says which of the two records arrived, and only the warden
    /// reads it: an answer settles the ask awaiting it and the road gets
    /// nothing back; a say is judged and the road gets bytes or silence.
    ///
    /// **A road never opens a seal to route.** `via` is the road the bytes
    /// arrived on, opaque to the warden and handed back to delivery beside
    /// the caller's padlock once the way back is refreshed — so a peer that
    /// publishes nothing can be reached down the line it holds, and the road
    /// never had to read a byte of what it carried to be remembered.
    ///
    /// The bytes that come back are the caller's to free. Nothing here ever
    /// raises: every failure is the same failure.
    pub fn arrive(
        self: *Warden,
        gpa: std.mem.Allocator,
        letter: []const u8,
        via: ?*anyopaque,
    ) ?[]u8 {
        self.take();
        return self.arriveHeld(gpa, letter, via);
    }

    /// The same, with the door's lock already in hand and given up before it
    /// returns.
    fn arriveHeld(
        self: *Warden,
        gpa: std.mem.Allocator,
        letter: []const u8,
        via: ?*anyopaque,
    ) ?[]u8 {
        // The first of the two readings the dwell is the difference of, taken
        // before anything is unsealed: it marks when the message arrived and
        // not when the door got round to it.
        const arrived_at = self.clock();

        // The published limit binds on every road and not only on the one
        // with a socket in it. It is what a caller can compute before
        // sending, so it is spent before anything is unsealed.
        if (self.limit > 0 and letter.len > self.limit) {
            defer self.give();
            return self.hush("over the limit");
        }

        var opened = envelope.unseal(gpa, self.padlock_secret, letter) catch {
            defer self.give();
            return self.hush("not ours");
        };
        switch (opened.payload) {
            .answer => |said| {
                defer opened.deinit();
                defer self.give();
                self.settle(gpa, said, letter);
                return null;
            },
            .say => opened.deinit(),
        }
        return self.serve(gpa, letter, via, arrived_at);
    }

    /// The eight steps, then the being's own work with the door's lock let go
    /// around it. What comes back is the sealed answer or silence.
    fn serve(
        self: *Warden,
        gpa: std.mem.Allocator,
        letter: []const u8,
        via: ?*anyopaque,
        arrived_at: i64,
    ) ?[]u8 {
        var verdict = self.judge(letter) catch {
            defer self.give();
            return self.hush("refused");
        };
        defer verdict.deinit();

        // Delivery learns the road this padlock's asks arrive on, as an
        // address beside an opaque token. **That is the warden's one call
        // downward**, and it reads nothing else of the message.
        switch (verdict.placement) {
            .ask, .rotation => if (self.delivery) |d| {
                if (d.arrived) |told| told(d.context, verdict.say.padlock, via);
            },
            else => {},
        }
        self.persist() catch {};

        const data: ?[]u8 = self.work(gpa, verdict, arrived_at) catch {
            defer self.give();
            return self.hush("refused");
        };
        defer if (data) |bytes| gpa.free(bytes);
        defer self.give();
        return self.answer(gpa, self.random(), verdict.say, data) catch self.hush("refused");
    }

    /// Step eight's first half: whatever the routing named, done. The lock is
    /// held on the way in and on the way out, and let go only around the
    /// being's own method — because **a being answering a call may make one**,
    /// and the second would otherwise meet a door its own caller is standing
    /// in.
    fn work(self: *Warden, gpa: std.mem.Allocator, verdict: Verdict, arrived_at: i64) Fault!?[]u8 {
        const voice: ?Key = switch (verdict.placement) {
            .stranger => null,
            else => verdict.say.voice,
        };
        switch (verdict.routing) {
            .own => return self.own(gpa, verdict),
            .estate, .stranger => {
                var scratch = std.heap.ArenaAllocator.init(gpa);
                defer scratch.deinit();
                return try encodeEstate(gpa, try self.estateFor(scratch.allocator(), voice));
            },
            .sketch => |pk| return try self.sketchAnswer(gpa, voice, pk),
            .invoke => |call| {
                if (self.isPublic(call.being)) return self.own(gpa, verdict);
                const row = self.being(call.being) orelse return Error.Refused;
                // The blueprint is the scope: a name it never declared is not
                // reached for on the object at all.
                const field = row.declares(call.method.name) orelse return Error.Refused;
                const organ = row.organ orelse return Error.Refused;
                const records = row.shape.?.records;

                self.give();
                const answered = organ.invoke(organ.context, gpa, field, records, call.method.args, .{
                    .caller = .{
                        .voice = voice,
                        .kind = switch (verdict.placement) {
                            .ask => .holder,
                            .rotation => .rotation,
                            else => .stranger,
                        },
                    },
                    .leash = .{
                        .time = verdict.say.allowance.time,
                        .hops = verdict.say.allowance.hops,
                    },
                    .arrived = arrived_at,
                });
                self.take();
                return answered;
            },
        }
    }

    // ------------------------------------------------ the caller's own side

    /// Settle the ask an arriving answer belongs to. **An answer nothing
    /// awaits is the same silence as every other failure**, and settling one
    /// spends the record, so the same bytes never answer twice.
    fn settle(self: *Warden, gpa: std.mem.Allocator, said: Answer, letter: []const u8) void {
        for (self.outbound.items) |*row| {
            if (!std.mem.eql(u8, &row.warden, &said.warden)) continue;
            for (row.awaiting.items) |*one| {
                if (one.seq != said.seq) continue;
                if (!std.mem.eql(u8, &one.padlock, &self.padlock)) continue;
                if (one.settled) return;
                one.answer = gpa.dupe(u8, letter) catch null;
                one.settled = true;
                if (one.woken) |event| {
                    if (self.io) |io| event.set(io);
                }
                return;
            }
        }
    }

    /// Mark an ask as awaiting again, for a caller resending the identical
    /// envelope after silence. The number stays what it was.
    fn awaitAgain(self: *Warden, at: usize, seq: i64) Fault!void {
        const row = &self.outbound.items[at];
        for (row.awaiting.items) |*one| {
            if (one.seq == seq and std.mem.eql(u8, &one.padlock, &self.padlock)) {
                if (one.answer) |bytes| self.gpa.free(bytes);
                one.answer = null;
                one.settled = false;
                return;
            }
        }
        try row.awaiting.append(self.gpa, .{ .padlock = self.padlock, .seq = seq });
    }

    fn awaitingAt(self: *Warden, at: usize, seq: i64) ?usize {
        for (self.outbound.items[at].awaiting.items, 0..) |one, i| {
            if (one.seq == seq and std.mem.eql(u8, &one.padlock, &self.padlock)) return i;
        }
        return null;
    }

    /// The row as delivery sees it: the way back and nothing else.
    fn viewOf(self: *Warden, a: std.mem.Allocator, at: usize) std.mem.Allocator.Error!Row {
        const row = self.outbound.items[at];
        const hints = try a.alloc([]const u8, row.hints.len);
        for (row.hints, hints) |from, *into| into.* = from;
        return .{ .padlock = row.padlock, .hints = hints };
    }

    /// One sealed envelope and the number it spent, kept so a caller that met
    /// silence resends the identical bytes rather than a fresh message.
    pub const Sealed = struct {
        at: usize,
        seq: i64,
        envelope: []u8,
        deadline: i64,

        pub fn deinit(self: *Sealed, gpa: std.mem.Allocator) void {
            gpa.free(self.envelope);
        }
    };

    /// Seal one ask down a relation, ready to be sent. The number is spent
    /// here, which is what makes a resend a resend.
    pub fn sealAsk(self: *Warden, gpa: std.mem.Allocator, at: usize, r: Reach) Fault!Sealed {
        var reaching = r;
        const roads_now = try self.roads(gpa);
        defer gpa.free(roads_now);
        reaching.hints = roads_now;
        const sealed, const seq = try self.ask(gpa, at, self.random(), reaching);
        return .{
            .at = at,
            .seq = seq,
            .envelope = sealed,
            .deadline = self.clock() + reaching.allowance.time,
        };
    }

    /// Hand a sealed ask to delivery and wait for what settles it. **The same
    /// bytes may be sent again**: every message spends a number once, so the
    /// far door either already honoured that number and answers the resend
    /// with silence, or never saw it and honours it now.
    pub fn sendSealed(self: *Warden, gpa: std.mem.Allocator, s: Sealed) Fault!?envelope.Opened {
        self.take();
        defer self.give();
        return self.sendHeld(gpa, s);
    }

    fn sendHeld(self: *Warden, gpa: std.mem.Allocator, s: Sealed) Fault!?envelope.Opened {
        const d = self.delivery orelse return null;
        try self.awaitAgain(s.at, s.seq);

        var scratch = std.heap.ArenaAllocator.init(gpa);
        const view = try self.viewOf(scratch.allocator(), s.at);
        // Delivery is beneath the door and takes its own time, so the door is
        // not held through it: a road that answers by dialling back would
        // otherwise arrive at a door its own caller is standing in.
        self.give();
        const carried = d.send(d.context, gpa, view, s.envelope);
        self.take();
        scratch.deinit();

        switch (carried catch Carried.silence) {
            // A road that answers in its response has answered. What it hands
            // back comes in through the one entry point like anything else,
            // because the road that carried it read none of it.
            .answered => |bytes| {
                defer gpa.free(bytes);
                if (self.arriveHeld(gpa, bytes, null)) |extra| gpa.free(extra);
                self.take();
            },
            // A road that answers through the door says nothing here; what
            // comes back arrives as a message of its own. One that never
            // declared it could is a road contradicting its own opening, and
            // the wait it is asking for is one nothing here can hold.
            .later => if (!d.later) {
                _ = self.forgo(s.at, s.seq);
                _ = self.hush("delivery answered later without declaring it");
                return null;
            },
            .silence => {
                _ = self.forgo(s.at, s.seq);
                return null;
            },
        }
        return self.awaitAnswer(gpa, s);
    }

    /// Take the answer this ask was settled with, or nothing. Taking it
    /// spends the record.
    fn taken(self: *Warden, gpa: std.mem.Allocator, s: Sealed) Fault!?envelope.Opened {
        const i = self.awaitingAt(s.at, s.seq) orelse return null;
        const one = &self.outbound.items[s.at].awaiting.items[i];
        if (!one.settled) return null;
        const bytes = one.answer;
        one.answer = null;
        _ = self.outbound.items[s.at].awaiting.orderedRemove(i);
        const raw = bytes orelse return null;
        defer gpa.free(raw);
        return envelope.open(gpa, self.padlock_secret, .answer, raw) catch null;
    }

    /// Wait until the ask is settled or its own deadline passes. The door is
    /// given up while waiting, which is what lets a road's own thread bring
    /// the answer in through the one entry point.
    ///
    /// **The leash is what ends the wait.** An answer that never comes is
    /// silence when the budget the ask carried runs out, and silence means
    /// refused, broken or absent with no way to tell which.
    fn awaitAnswer(self: *Warden, gpa: std.mem.Allocator, s: Sealed) Fault!?envelope.Opened {
        if (try self.taken(gpa, s)) |opened| return opened;
        const io = self.io orelse {
            // Nobody can bring one in later, so there is nothing to wait for.
            _ = self.forgo(s.at, s.seq);
            return null;
        };

        var event: std.Io.Event = .unset;
        const i = self.awaitingAt(s.at, s.seq) orelse return null;
        self.outbound.items[s.at].awaiting.items[i].woken = &event;

        const left = s.deadline - self.clock();
        if (left > 0) {
            self.give();
            event.waitTimeout(io, .{ .duration = .{
                .clock = .awake,
                .raw = .{ .nanoseconds = @as(i96, left) * std.time.ns_per_ms },
            } }) catch {};
            self.take();
        }

        // The row may have moved while the door was given up, so it is found
        // again rather than remembered.
        if (self.awaitingAt(s.at, s.seq)) |j| {
            self.outbound.items[s.at].awaiting.items[j].woken = null;
        }
        if (try self.taken(gpa, s)) |opened| return opened;
        _ = self.forgo(s.at, s.seq);
        return null;
    }

    /// Seal and send in one act, which is what an ordinary call is.
    pub fn askAt(self: *Warden, gpa: std.mem.Allocator, at: usize, r: Reach) Fault!?envelope.Opened {
        self.take();
        defer self.give();
        var sealed = self.sealAsk(gpa, at, r) catch return null;
        defer sealed.deinit(gpa);
        return self.sendHeld(gpa, sealed);
    }

    // ---------------------------------------------------------- the store

    /// Write everything a restart must not lose into the store the host
    /// handed in. **The store's shape is the warden's; where it lives is the
    /// host's** — what goes down is the two records whole, the replay marks
    /// beneath them, and the private labels.
    ///
    /// Beings are pointers and are not here. The host holds them again on the
    /// same seeds, and the rows find them by the name those seeds mint.
    ///
    /// A store that cannot be written is the host's fault and never the
    /// caller's, so nothing here is raised outward.
    pub fn persist(self: *Warden) Fault!void {
        const s = self.store orelse return;
        const bytes = try self.snapshot(self.gpa);
        defer self.gpa.free(bytes);
        s.save(s.context, bytes) catch {};
    }

    /// The snapshot, as the store keeps it.
    pub fn snapshot(self: *Warden, gpa: std.mem.Allocator) Fault![]u8 {
        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();

        var blueprint = try notation.parse(a, keeping_text);
        defer blueprint.deinit();

        const held = try a.alloc(wire.Value, self.inbound.items.len);
        for (self.inbound.items, held) |row, *slot| {
            const beings = try a.alloc(wire.Value, row.beings.items.len);
            for (row.beings.items, beings) |pk, *one| one.* = .{ .being = pk };
            const spent = try a.alloc(wire.Value, row.window.spent.items.len);
            for (row.window.spent.items, spent) |n, *one| one.* = .{ .integer = n };
            const fields = try a.alloc(wire.Value, 8);
            fields[0] = .{ .b32 = row.voice };
            fields[1] = .{ .b32 = row.commitment };
            fields[2] = .{ .b32 = row.minted_name };
            fields[3] = .{ .list = beings };
            fields[4] = .{ .integer = row.window.mark };
            fields[5] = .{ .list = spent };
            fields[6] = try maybeKey(a, row.padlock);
            fields[7] = try hintsValue(a, row.hints);
            slot.* = .{ .record = fields };
        }

        const bound = try a.alloc(wire.Value, self.outbound.items.len);
        for (self.outbound.items, bound) |row, *slot| {
            const fields = try a.alloc(wire.Value, 11);
            fields[0] = .{ .being = row.warden };
            fields[1] = .{ .b32 = row.commitment };
            fields[2] = .{ .b32 = row.padlock };
            fields[3] = .{ .b32 = row.voice };
            fields[4] = .{ .b32 = row.secret };
            fields[5] = .{ .b32 = row.heir };
            fields[6] = .{ .b32 = row.heir_secret };
            fields[7] = .{ .integer = row.seq };
            fields[8] = .{ .integer = row.news.mark };
            fields[9] = try maybeKey(a, row.holder);
            fields[10] = try hintsValue(a, row.hints);
            slot.* = .{ .record = fields };
        }

        const named = try a.alloc(wire.Value, self.labels.items.len);
        for (self.labels.items, named) |one, *slot| {
            const fields = try a.alloc(wire.Value, 4);
            fields[0] = .{ .text = one.name };
            switch (one.at) {
                .local => |pk| {
                    fields[1] = try maybeKey(a, pk);
                    fields[2] = .{ .integer = 0 };
                    fields[3] = .{ .text = "" };
                },
                .far => |far| {
                    fields[1] = try maybeKey(a, far.being);
                    fields[2] = .{ .integer = @intCast(far.at) };
                    fields[3] = .{ .text = far.text };
                },
            }
            slot.* = .{ .record = fields };
        }

        const whole = try a.alloc(wire.Value, 3);
        whole[0] = .{ .list = held };
        whole[1] = .{ .list = bound };
        whole[2] = .{ .list = named };
        return wire.encode(gpa, "keeping", blueprint.records, .{ .record = whole });
    }

    /// Read back what a previous life left. A store that holds nothing, or
    /// bytes this warden cannot read, leaves it standing as it opened.
    pub fn restore(self: *Warden) Fault!void {
        const s = self.store orelse return;
        const bytes = (s.load(s.context, self.gpa) catch null) orelse return;
        defer self.gpa.free(bytes);
        self.takeSnapshot(bytes) catch {};
    }

    fn takeSnapshot(self: *Warden, raw: []const u8) Fault!void {
        var arena = std.heap.ArenaAllocator.init(self.gpa);
        defer arena.deinit();
        const a = arena.allocator();

        var blueprint = try notation.parse(a, keeping_text);
        defer blueprint.deinit();
        const owned = try a.dupe(u8, raw);
        var read = wire.decode(a, "keeping", blueprint.records, owned) catch return Error.Refused;
        defer read.deinit();

        const whole = try fieldsOf(read.value, 3);
        for (try listOf(whole[0])) |one| {
            const f = try fieldsOf(one, 8);
            var beings: std.ArrayList(Key) = .empty;
            errdefer beings.deinit(self.gpa);
            for (try listOf(f[3])) |pk| try beings.append(self.gpa, try keyOf(pk));
            var window: Window = .{ .mark = try integerOf(f[4]), .width = self.width };
            errdefer window.deinit(self.gpa);
            for (try listOf(f[5])) |n| try window.spent.append(self.gpa, try integerOf(n));
            try self.inbound.append(self.gpa, .{
                .voice = try keyOf(f[0]),
                .commitment = try keyOf(f[1]),
                .minted_name = try keyOf(f[2]),
                .beings = beings,
                .window = window,
                .padlock = try maybeKeyOf(f[6]),
            });
            try self.inbound.items[self.inbound.items.len - 1]
                .keepHints(self.gpa, try hintsOf(a, f[7]));
        }

        for (try listOf(whole[1])) |one| {
            const f = try fieldsOf(one, 11);
            try self.outbound.append(self.gpa, .{
                .warden = try keyOf(f[0]),
                .commitment = try keyOf(f[1]),
                .padlock = try keyOf(f[2]),
                .voice = try keyOf(f[3]),
                .secret = try keyOf(f[4]),
                .heir = try keyOf(f[5]),
                .heir_secret = try keyOf(f[6]),
                .seq = try integerOf(f[7]),
                .news = .{ .mark = try integerOf(f[8]), .width = self.width },
                .holder = try maybeKeyOf(f[9]),
            });
            try self.outbound.items[self.outbound.items.len - 1]
                .keepHints(self.gpa, try hintsOf(a, f[10]));
        }

        for (try listOf(whole[2])) |one| {
            const f = try fieldsOf(one, 4);
            const label = switch (f[0]) {
                .text => |t| t,
                else => return Error.Refused,
            };
            const pk = (try maybeKeyOf(f[1])) orelse continue;
            const text = switch (f[3]) {
                .text => |t| t,
                else => return Error.Refused,
            };
            if (text.len == 0) {
                try self.keepLabel(label, .{ .local = pk });
            } else {
                try self.keepLabel(label, .{ .far = .{
                    .at = @intCast(try integerOf(f[2])),
                    .being = pk,
                    .text = try self.gpa.dupe(u8, text),
                } });
            }
        }
    }
};

/// What a restart must not lose, written as one record. **This is the
/// warden's own shape and crosses no wire** — no peer ever reads it, no
/// digest of it is carried, and it is written with this kit's own encoder
/// only because the encoder is already here and already exact.
const keeping_text =
    \\Keeping
    \\  kept() keeping
    \\
    \\keeping
    \\  inbound [held]
    \\  outbound [bound]
    \\  labels [named]
    \\
    \\held
    \\  voice b32
    \\  commitment b32
    \\  mintedName b32
    \\  beings [being]
    \\  mark int
    \\  spent [int]
    \\  padlock b32?
    \\  hints [text]
    \\
    \\bound
    \\  warden being
    \\  commitment b32
    \\  padlock b32
    \\  voice b32
    \\  secret b32
    \\  heir b32
    \\  heirSecret b32
    \\  seq int
    \\  news int
    \\  holder b32?
    \\  hints [text]
    \\
    \\named
    \\  label text
    \\  being b32?
    \\  at int
    \\  text text
    \\
;

// ------------------------------------------ reading the warden's own answers

/// An estate and the arena that owns every byte it points at.
pub const ReadEstate = struct {
    arena: std.heap.ArenaAllocator,
    estate: Estate,

    pub fn deinit(self: *ReadEstate) void {
        self.arena.deinit();
    }
};

/// The answer a `describe` came back with, read as the type the Warden
/// blueprint declares for it. A caller needs this to find the one being an
/// invitation opened.
pub fn decodeEstate(gpa: std.mem.Allocator, raw: []const u8) Fault!ReadEstate {
    var arena = std.heap.ArenaAllocator.init(gpa);
    errdefer arena.deinit();
    const a = arena.allocator();

    const blueprint = try shapes(a);
    const owned = try a.dupe(u8, raw);
    const read = wire.decode(a, "estate", blueprint.records, owned) catch return Error.Refused;

    const fields = try fieldsOf(read.value, 1);
    const classes_raw = try listOf(fields[0]);
    const classes = try a.alloc(Class, classes_raw.len);
    for (classes_raw, classes) |one, *slot| {
        const f = try fieldsOf(one, 2);
        const beings_raw = try listOf(f[1]);
        const beings = try a.alloc(Held, beings_raw.len);
        for (beings_raw, beings) |b, *into| {
            const g = try fieldsOf(b, 2);
            into.* = .{ .being = try keyOf(g[0]), .commitment = try keyOf(g[1]) };
        }
        slot.* = .{ .digest = try keyOf(f[0]), .beings = beings };
    }
    return .{ .arena = arena, .estate = .{ .classes = classes } };
}

/// The answer a `sketch` came back with: the being it describes, or absence
/// where the far door answered one. Silence is not here — it never arrived.
pub fn decodeSketch(gpa: std.mem.Allocator, raw: []const u8) Fault!?Sketch {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();
    var blueprint = try shapes(a);
    defer blueprint.deinit();
    const owned = try a.dupe(u8, raw);
    var read = wire.decode(a, "sketch?", blueprint.records, owned) catch return Error.Refused;
    defer read.deinit();
    const held = switch (read.value) {
        .absent => return null,
        .present => |one| one.*,
        else => return Error.Refused,
    };
    const f = try fieldsOf(held, 3);
    return .{
        .being = try keyOf(f[0]),
        .digest = try keyOf(f[1]),
        .commitment = try keyOf(f[2]),
    };
}

/// The answer a `limit` came back with.
pub fn decodeLimit(gpa: std.mem.Allocator, raw: []const u8) Fault!i64 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();
    var blueprint = try shapes(a);
    defer blueprint.deinit();
    const owned = try a.dupe(u8, raw);
    var read = wire.decode(a, "int", blueprint.records, owned) catch return Error.Refused;
    defer read.deinit();
    return integerOf(read.value);
}

/// The one argument `sketch(being being)` takes, written as that field
/// declares it.
pub fn writeBeing(gpa: std.mem.Allocator, pk: Key) Fault![]u8 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    var blueprint = try shapes(arena.allocator());
    defer blueprint.deinit();
    return wire.encode(gpa, "being", blueprint.records, .{ .being = pk }) catch Error.Refused;
}

/// The one argument `blueprint(digest b32)` takes, written as that field
/// declares it.
pub fn writeDigest(gpa: std.mem.Allocator, want: Key) Fault![]u8 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    var blueprint = try shapes(arena.allocator());
    defer blueprint.deinit();
    return wire.encode(gpa, "b32", blueprint.records, .{ .b32 = want }) catch Error.Refused;
}

/// The text `blueprint` answered with, or nothing where it answered absence.
/// The bytes come back owned by `gpa`.
pub fn readBlueprint(gpa: std.mem.Allocator, data: []const u8) Fault!?[]u8 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();
    var blueprint = try shapes(a);
    defer blueprint.deinit();
    const owned = try a.dupe(u8, data);
    var read = wire.decode(a, "text?", blueprint.records, owned) catch return null;
    defer read.deinit();
    return switch (read.value) {
        .absent => null,
        .present => |one| switch (one.*) {
            .text => |t| try gpa.dupe(u8, t),
            else => null,
        },
        else => null,
    };
}

pub const Allowance = envelope.Allowance;

fn maybeKey(a: std.mem.Allocator, pk: ?Key) std.mem.Allocator.Error!wire.Value {
    const held = pk orelse return .absent;
    const one = try a.create(wire.Value);
    one.* = .{ .b32 = held };
    return .{ .present = one };
}

fn maybeKeyOf(value: wire.Value) Error!?Key {
    return switch (value) {
        .absent => null,
        .present => |one| try keyOf(one.*),
        else => Error.Refused,
    };
}

fn listOf(value: wire.Value) Error![]const wire.Value {
    return switch (value) {
        .list => |l| l,
        else => Error.Refused,
    };
}
