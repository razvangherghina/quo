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

    pub fn deinit(self: *Inbound, gpa: std.mem.Allocator) void {
        self.beings.deinit(gpa);
        self.window.deinit(gpa);
    }

    pub fn reaches(self: Inbound, being: Key) bool {
        for (self.beings.items) |b| {
            if (std.mem.eql(u8, &b, &being)) return true;
        }
        return false;
    }
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
    /// News is counted too, against the mark kept for that far warden.
    news: Window,
    hints: []const []const u8 = &.{},

    pub fn deinit(self: *Outbound, gpa: std.mem.Allocator) void {
        self.news.deinit(gpa);
    }
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
};

// -------------------------------------------------------------- the verdict

/// Where a voice was found, and in which record.
pub const Placement = union(enum) {
    /// A current holder in the inbound record.
    ask: usize,
    /// Its hash matched a standing's heir commitment; the standing has
    /// changed hands already.
    rotation: usize,
    /// Found in the outbound record.
    news: usize,
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

    pub fn deinit(self: *Warden) void {
        for (self.inbound.items) |*row| row.deinit(self.gpa);
        for (self.outbound.items) |*row| row.deinit(self.gpa);
        self.inbound.deinit(self.gpa);
        self.outbound.deinit(self.gpa);
        self.beings.deinit(self.gpa);
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
            .news => |i| try self.outbound.items[i].news.spend(self.gpa, say.seq),
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
                if (say.hints.len > 0) self.inbound.items[i].hints = say.hints;
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
            if (std.mem.eql(u8, &row.warden, &say.voice) or
                std.mem.eql(u8, &claimed, &row.commitment))
            {
                // News is not a rotation and does not use this field.
                if (say.commitment != null) return Error.Refused;
                return .{ .news = i };
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

        if (say.being) |pk| {
            // The public being is reachable by everyone, holders included;
            // anything else needs a standing, and what a voice may not reach
            // is silence rather than an absence.
            if (!self.mayReach(voice, pk)) return Error.Refused;
            if (self.being(pk) == null) return Error.Refused;
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
        row.seq += 1;
        const signer = try arithmetic.signingPair(signer_secret);
        const sealed = try envelope.seal(gpa, ephemeral_secret, row.padlock, signer_secret, .{ .say = .{
            .voice = signer.public,
            .recipient = row.warden,
            .commitment = if (r.next) |next| arithmetic.commitment(row.warden, next) else null,
            .seq = row.seq,
            .padlock = self.padlock,
            .hints = r.hints,
            .allowance = r.allowance,
            .being = r.being,
            .method = r.method,
        } });
        return .{ sealed, row.seq };
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

    /// Open an answer sealed to this ground's own padlock.
    ///
    /// The signature is verified against the `warden` the answer's own record
    /// carries; whether that is the door this ground asked is the caller's to
    /// judge, because only the caller knows which door it asked.
    pub fn hear(self: *Warden, gpa: std.mem.Allocator, reply: []const u8) Fault!envelope.Opened {
        return envelope.open(gpa, self.padlock_secret, .answer, reply);
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

        const first, _ = try self.rotate(gpa, at, a.ephemeral[0], a.voice_secret, .{
            .allowance = a.allowance,
            .hints = a.hints,
        });
        const opening = try road.send(road.context, first);

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
