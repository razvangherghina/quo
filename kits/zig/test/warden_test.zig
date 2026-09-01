//! The warden's suite. Two shapes live in `warden.json` — the blueprint every
//! warden holds with its digest, and an estate in its derived order — and
//! both are played on their own terms, with the count asserted against the
//! file so a subset cannot pass.
//!
//! The corpus barely covers this module, so everything after the first test
//! is asserted from the articles alone. Each test is named for the article
//! and the clause it pins, so a reader can tell coverage from a test list.

const std = @import("std");
const arithmetic = @import("arithmetic");
const envelope = @import("envelope");
const notation = @import("notation");
const wire = @import("wire");
const warden = @import("warden");
const warden_path = @import("vectors").warden_path;

const Key = warden.Key;

// ------------------------------------------------------------- the corpus

const Vector = struct {
    name: []const u8,
    law: []const u8,
    /// The blueprint vector: the text, its canonical bytes, its digest.
    blueprint: ?[]const u8 = null,
    canonical: ?[]const u8 = null,
    digest: ?[]const u8 = null,
    /// The estate vector: the order the warden is given, the order it must
    /// derive, and the bytes that order encodes to.
    unordered: std.json.Value = .null,
    value: std.json.Value = .null,
    bytes: ?[]const u8 = null,
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

fn bytesOf(a: std.mem.Allocator, text: []const u8) ![]u8 {
    if (text.len % 2 != 0) return error.TestUnexpectedResult;
    const out = try a.alloc(u8, text.len / 2);
    _ = std.fmt.hexToBytes(out, text) catch return error.TestUnexpectedResult;
    return out;
}

fn key(a: std.mem.Allocator, text: []const u8) !Key {
    if (text.len != warden.key_length * 2) return error.TestUnexpectedResult;
    const raw = try bytesOf(a, text);
    var out: Key = undefined;
    @memcpy(&out, raw);
    return out;
}

fn string(object: std.json.ObjectMap, name: []const u8) ![]const u8 {
    return switch (object.get(name) orelse return error.TestUnexpectedResult) {
        .string => |s| s,
        else => error.TestUnexpectedResult,
    };
}

fn estateOf(a: std.mem.Allocator, json: std.json.Value) !warden.Estate {
    const object = switch (json) {
        .object => |o| o,
        else => return error.TestUnexpectedResult,
    };
    if (object.count() != 1) return error.TestUnexpectedResult;
    const raw_classes = switch (object.get("classes") orelse return error.TestUnexpectedResult) {
        .array => |items| items,
        else => return error.TestUnexpectedResult,
    };
    const classes = try a.alloc(warden.Class, raw_classes.items.len);
    for (raw_classes.items, classes) |item, *slot| {
        const c = switch (item) {
            .object => |o| o,
            else => return error.TestUnexpectedResult,
        };
        if (c.count() != 2) return error.TestUnexpectedResult;
        const raw_beings = switch (c.get("beings") orelse return error.TestUnexpectedResult) {
            .array => |items| items,
            else => return error.TestUnexpectedResult,
        };
        const beings = try a.alloc(warden.Held, raw_beings.items.len);
        for (raw_beings.items, beings) |held, *under| {
            const h = switch (held) {
                .object => |o| o,
                else => return error.TestUnexpectedResult,
            };
            if (h.count() != 2) return error.TestUnexpectedResult;
            under.* = .{
                .being = try key(a, try string(h, "being")),
                .commitment = try key(a, try string(h, "commitment")),
            };
        }
        slot.* = .{ .digest = try key(a, try string(c, "digest")), .beings = beings };
    }
    return .{ .classes = classes };
}

fn sameEstate(x: warden.Estate, y: warden.Estate) bool {
    if (x.classes.len != y.classes.len) return false;
    for (x.classes, y.classes) |a, b| {
        if (!std.mem.eql(u8, &a.digest, &b.digest)) return false;
        if (a.beings.len != b.beings.len) return false;
        for (a.beings, b.beings) |h, g| {
            if (!std.mem.eql(u8, &h.being, &g.being)) return false;
            if (!std.mem.eql(u8, &h.commitment, &g.commitment)) return false;
        }
    }
    return true;
}

test "the pinned corpus" {
    const gpa = std.testing.allocator;

    const text = try read(gpa, warden_path);
    defer gpa.free(text);

    const parsed = try std.json.parseFromSlice(Corpus, gpa, text, .{});
    defer parsed.deinit();

    try std.testing.expectEqualStrings("warden", parsed.value.area);
    try std.testing.expectEqualStrings("hex", parsed.value.encoding);
    try std.testing.expect(parsed.value.vectors.len > 0);

    var blueprints: usize = 0;
    var estates: usize = 0;

    for (parsed.value.vectors) |v| {
        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();

        if (v.digest) |want_digest| {
            // The one blueprint nobody authors and every warden holds. Its
            // text is this kit's own constant, its canonical bytes are the
            // text as UTF-8, and its digest is the same on every ground.
            const declared = v.blueprint orelse return error.TestUnexpectedResult;
            std.testing.expectEqualStrings(declared, warden.blueprint_text) catch {
                std.debug.print("another blueprint text for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            const canonical = v.canonical orelse return error.TestUnexpectedResult;
            try std.testing.expectEqualStrings(canonical, try hex(a, warden.blueprint_text));
            const made = warden.digest();
            std.testing.expectEqualStrings(want_digest, try hex(a, &made)) catch {
                std.debug.print("another digest for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            blueprints += 1;
            continue;
        }

        if (v.bytes) |want_bytes| {
            // The order is derived, never chosen, so the warden is handed the
            // unordered estate and must produce the corpus's own bytes.
            const unordered = estateOf(a, v.unordered) catch {
                std.debug.print("unrecognised vector shape: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };
            const written = try warden.encodeEstate(a, unordered);
            std.testing.expectEqualStrings(want_bytes, try hex(a, written)) catch {
                std.debug.print("wrote other bytes for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            };

            // And the order it derives is the corpus's own ordered value.
            const wanted = try estateOf(a, v.value);
            const ordered = try warden.order(a, unordered);
            if (!sameEstate(wanted, ordered)) {
                std.debug.print("derived another order for: {s}\n", .{v.name});
                return error.TestUnexpectedResult;
            }

            // The ordered estate is already ordered: encoding it again is the
            // same bytes, so ordering is idempotent rather than a shuffle.
            const again = try warden.encodeEstate(a, ordered);
            try std.testing.expectEqualStrings(want_bytes, try hex(a, again));
            estates += 1;
            continue;
        }

        std.debug.print("unrecognised vector shape: {s}\n", .{v.name});
        return error.TestUnexpectedResult;
    }

    // A subset cannot pass.
    try std.testing.expectEqual(parsed.value.vectors.len, blueprints + estates);
    try std.testing.expectEqual(@as(usize, 2), parsed.value.vectors.len);
}

// ------------------------------------------------------------ the fixtures

/// A door with one public being, one ordinary being, one holder and one far
/// warden it holds a relation with. Nothing here is a road: a letter is bytes
/// handed straight to the judgment.
const Ground = struct {
    gpa: std.mem.Allocator,
    arena: std.heap.ArenaAllocator,
    door: warden.Warden,
    /// The holder's voice, and the heir it committed.
    voice: arithmetic.SigningPair,
    heir: arithmetic.SigningPair,
    /// The caller's own padlock, which is how the door answers.
    back: arithmetic.SealingPair,
    /// A far warden this door holds an outbound relation with.
    far: arithmetic.SigningPair,
    /// A being of the ordinary class.
    thing: Key,
    thing_digest: Key,

    fn init(gpa: std.mem.Allocator) !Ground {
        const name = try arithmetic.signingPair(@splat(1));
        const padlock = try arithmetic.sealingPair(@splat(2));
        const voice = try arithmetic.signingPair(@splat(3));
        const heir = try arithmetic.signingPair(@splat(4));
        const back = try arithmetic.sealingPair(@splat(5));
        const far = try arithmetic.signingPair(@splat(6));
        const thing = try arithmetic.signingPair(@splat(7));

        var self: Ground = .{
            .gpa = gpa,
            .arena = std.heap.ArenaAllocator.init(gpa),
            .door = .{
                .gpa = gpa,
                .name = name.public,
                .name_secret = name.secret,
                .padlock = padlock.public,
                .padlock_secret = padlock.secret,
                .limit = 1 << 16,
                .width = 8,
            },
            .voice = voice,
            .heir = heir,
            .back = back,
            .far = far,
            .thing = thing.public,
            .thing_digest = warden.digest(),
        };
        // The public being's pk is the warden's own name, and it wears the
        // one blueprint every warden holds.
        try self.door.beings.append(gpa, .{
            .pk = name.public,
            .secret = name.secret,
            .digest = warden.digest(),
            .commitment = arithmetic.commitment(name.public, heir.public),
            .text = warden.blueprint_text,
        });
        self.thing_digest = arithmetic.hash("Thing\n  poke() int\n");
        try self.door.beings.append(gpa, .{
            .pk = thing.public,
            .secret = thing.secret,
            .digest = self.thing_digest,
            .commitment = arithmetic.commitment(name.public, thing.public),
            .text = "Thing\n  poke() int\n",
        });
        return self;
    }

    fn deinit(self: *Ground) void {
        self.door.deinit();
        self.arena.deinit();
    }

    /// A holder: one row in the inbound record, reaching the ordinary being,
    /// with the hash of its next pk beside it.
    fn admit(self: *Ground) !void {
        var row: warden.Inbound = .{
            .voice = self.voice.public,
            .commitment = arithmetic.commitment(self.door.name, self.heir.public),
            .minted_name = self.door.name,
            .window = .{ .width = self.door.width },
        };
        try row.beings.append(self.gpa, self.thing);
        try self.door.inbound.append(self.gpa, row);
    }

    /// A far warden this door holds a relation with, so what it says is news.
    fn relate(self: *Ground) !void {
        try self.door.outbound.append(self.gpa, .{
            .warden = self.far.public,
            .commitment = arithmetic.commitment(self.far.public, self.heir.public),
            .padlock = self.back.public,
            .voice = self.voice.public,
            .secret = self.voice.secret,
            .heir = self.heir.public,
            .heir_secret = self.heir.secret,
            .news = .{ .width = self.door.width },
        });
    }

    const Letter = struct {
        voice_secret: Key,
        recipient: ?Key = null,
        commitment: ?Key = null,
        seq: i64 = 1,
        time: i64 = 1000,
        hops: i64 = 4,
        being: ?Key = null,
        method: ?warden.Method = null,
        hints: []const []const u8 = &.{},
    };

    /// One sealed letter, written by the caller and handed to the door.
    fn letter(self: *Ground, l: Letter) ![]u8 {
        const a = self.arena.allocator();
        const signer = try arithmetic.signingPair(l.voice_secret);
        return envelope.seal(a, @splat(9), self.door.padlock, l.voice_secret, .{ .say = .{
            .voice = signer.public,
            .recipient = l.recipient orelse self.door.name,
            .commitment = l.commitment,
            .seq = l.seq,
            .padlock = self.back.public,
            .hints = l.hints,
            .allowance = .{ .time = l.time, .hops = l.hops },
            .being = l.being,
            .method = l.method,
        } });
    }
};

// --------------------------------------------------- IX, the warden's blueprint

test "IX — the public being's pk is the warden's own name, and it appears in every estate" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    // The stranger's case: no standing anywhere, so the estate is the
    // warden's own public being and nothing else.
    const stranger = try ground.door.estateFor(a, null);
    try std.testing.expectEqual(@as(usize, 1), stranger.classes.len);
    try std.testing.expectEqual(@as(usize, 1), stranger.classes[0].beings.len);
    try std.testing.expectEqualSlices(u8, &ground.door.name, &stranger.classes[0].beings[0].being);
    try std.testing.expectEqualSlices(u8, &warden.digest(), &stranger.classes[0].digest);

    // A holder reaches one more being, and the public being is still there:
    // it is reachable by everyone, holders included.
    try ground.admit();
    const held = try ground.door.estateFor(a, ground.voice.public);
    try std.testing.expectEqual(@as(usize, 2), held.classes.len);
    var names: usize = 0;
    for (held.classes) |c| {
        for (c.beings) |h| {
            if (std.mem.eql(u8, &h.being, &ground.door.name)) names += 1;
        }
    }
    try std.testing.expectEqual(@as(usize, 1), names);
}

test "IX — limit is the whole envelope as the carriage delivers it" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    const sealed = try ground.letter(.{ .voice_secret = ground.voice.secret });

    // At the published limit the letter is judged; one byte under it, the
    // door never unseals anything.
    ground.door.limit = sealed.len - 1;
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(sealed));

    ground.door.limit = sealed.len;
    var verdict = try ground.door.judge(sealed);
    verdict.deinit();
}

// -------------------------------------------- VII, amending a standing

test "VII — a standing is amended, not replaced: the warden widens it and narrows it" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // A second being of the ordinary class, standing but reached by nobody.
    const other = try arithmetic.signingPair(@splat(8));
    try ground.door.beings.append(gpa, .{
        .pk = other.public,
        .secret = other.secret,
        .digest = ground.thing_digest,
        .commitment = arithmetic.commitment(ground.door.name, other.public),
        .text = "Thing\n  poke() int\n",
    });

    try std.testing.expect(!ground.door.mayReach(ground.voice.public, other.public));
    try ground.door.widen(ground.voice.public, other.public);
    try std.testing.expect(ground.door.mayReach(ground.voice.public, other.public));

    // Nobody was told and no secret was minted: the same row, the same
    // commitment, and the holder finds it on its next describe.
    try std.testing.expectEqual(@as(usize, 1), ground.door.inbound.items.len);
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(ground.door.name, ground.heir.public),
        &ground.door.inbound.items[0].commitment,
    );

    try ground.door.narrow(ground.voice.public, other.public);
    try std.testing.expect(!ground.door.mayReach(ground.voice.public, other.public));
    try std.testing.expect(ground.door.mayReach(ground.voice.public, ground.thing));
}

test "VII — taking the last being away is release, and there is no separate act for it" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();

    try ground.door.narrow(ground.voice.public, ground.thing);
    try std.testing.expectEqual(@as(usize, 0), ground.door.inbound.items.len);

    // What is left is a stranger, whose estate is the public being alone.
    const estate = try ground.door.estateFor(arena.allocator(), ground.voice.public);
    try std.testing.expectEqual(@as(usize, 1), estate.classes.len);
}

test "VII — a voice that stands nowhere cannot be amended, and neither can a being that does not stand" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // A row conjured out of a widening would be a grant by another name.
    const stranger = try arithmetic.signingPair(@splat(11));
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.widen(stranger.public, ground.thing),
    );
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.narrow(stranger.public, ground.thing),
    );

    // A row may only ever name beings that stand here.
    try ground.admit();
    const nowhere: Key = @splat(0x99);
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.widen(ground.voice.public, nowhere),
    );
    try std.testing.expectEqual(@as(usize, 1), ground.door.inbound.items[0].beings.items.len);
}

// ------------------------------------------------------------- X, the describe

test "X — a sketch is answered for a being the voice reaches, and is silence otherwise" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // Silence is for what a voice may not reach: a door that answered
    // "absent" would be confirming the being exists.
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.sketchFor(ground.voice.public, ground.thing),
    );
    // The public being is reachable by everyone, stranger included.
    const public = try ground.door.sketchFor(null, ground.door.name);
    try std.testing.expectEqualSlices(u8, &warden.digest(), &public.digest);

    try ground.admit();
    const sketch = try ground.door.sketchFor(ground.voice.public, ground.thing);
    try std.testing.expectEqualSlices(u8, &ground.thing_digest, &sketch.digest);
    // A describe hands back what the warden already holds, never state.
    try std.testing.expectEqualSlices(u8, &ground.thing, &sketch.being);

    // And a being this door does not hold at all is the same silence.
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.sketchFor(ground.voice.public, @splat(0xaa)),
    );
}

test "X — a blueprint is answered by digest only to a reacher, or from the public being" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // The warden's own public being declares the one blueprint every warden
    // holds, so anyone may ask for it by its digest.
    const held = try ground.door.blueprintFor(null, warden.digest());
    try std.testing.expectEqualStrings(warden.blueprint_text, held);

    // The ordinary class is silence until the asker reaches a being of it.
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.blueprintFor(ground.voice.public, ground.thing_digest),
    );
    try ground.admit();
    const text = try ground.door.blueprintFor(ground.voice.public, ground.thing_digest);
    try std.testing.expectEqualStrings("Thing\n  poke() int\n", text);

    // A digest this door holds nothing of is silence, not absence.
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.blueprintFor(ground.voice.public, @splat(0xbb)),
    );
}

test "X — the order is derived, never chosen" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    const one: Key = @splat(0x01);
    const two: Key = @splat(0x02);
    const three: Key = @splat(0x03);

    var beings = [_]warden.Held{
        .{ .being = three, .commitment = one },
        .{ .being = one, .commitment = two },
    };
    var classes = [_]warden.Class{
        .{ .digest = two, .beings = &beings },
        .{ .digest = one, .beings = &beings },
    };
    const ordered = try warden.order(a, .{ .classes = &classes });

    // Classes by their digest bytes ascending.
    try std.testing.expectEqualSlices(u8, &one, &ordered.classes[0].digest);
    try std.testing.expectEqualSlices(u8, &two, &ordered.classes[1].digest);
    // Beings under each by their pk bytes ascending.
    try std.testing.expectEqualSlices(u8, &one, &ordered.classes[0].beings[0].being);
    try std.testing.expectEqualSlices(u8, &three, &ordered.classes[0].beings[1].being);
    // And the caller's own slices are not reordered under it.
    try std.testing.expectEqualSlices(u8, &three, &beings[0].being);
}

// ------------------------------------------------------- VIII, the seq

test "VIII — the first legal number is one, and a fresh standing has honoured nothing" {
    const gpa = std.testing.allocator;
    var window: warden.Window = .{ .width = 8 };
    defer window.deinit(gpa);

    try std.testing.expectEqual(@as(i64, 0), window.mark);
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 0));
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, -1));
    try window.spend(gpa, 1);
    try std.testing.expectEqual(@as(i64, 1), window.mark);
}

test "VIII — above the mark moves it, inside the window is honoured once, below is silence" {
    const gpa = std.testing.allocator;
    var window: warden.Window = .{ .width = 8 };
    defer window.deinit(gpa);

    try window.spend(gpa, 10);
    try std.testing.expectEqual(@as(i64, 10), window.mark);

    // The mark itself is spent, and nothing later gives it back.
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 10));

    // Inside the window is honoured once and never again.
    try window.spend(gpa, 7);
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 7));
    try std.testing.expectEqual(@as(i64, 10), window.mark);

    // Below the window is silence, whether or not it was ever seen.
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 2));
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 1));

    // Above moves the mark, and what falls out of the window falls out for
    // good: 9 was never spent but is now beneath the sill.
    try window.spend(gpa, 20);
    try std.testing.expectEqual(@as(i64, 20), window.mark);
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 9));
    try window.spend(gpa, 13);
}

test "VIII — a mark that moves leaves the number it held spent" {
    const gpa = std.testing.allocator;
    var window: warden.Window = .{ .width = 8 };
    defer window.deinit(gpa);

    // The door keeps two facts: the highest number honoured, and which
    // numbers below it are already spent. A mark that moves off a number
    // without recording it would honour that number a second time.
    try window.spend(gpa, 3);
    try window.spend(gpa, 9);
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 3));
}

test "VIII — which number a caller opens with, above one, is the caller's own" {
    const gpa = std.testing.allocator;

    // A fresh mark is empty, so every number at or above one stands above it.
    // No door requires a first message to carry exactly one: one that did
    // would refuse a conforming stranger, and the refusal is silence.
    for ([_]i64{ 1, 2, 5, 4096 }) |opening| {
        var window: warden.Window = .{ .width = 8 };
        defer window.deinit(gpa);
        try window.spend(gpa, opening);
        try std.testing.expectEqual(opening, window.mark);
        // And it is honoured once, like every other number.
        try std.testing.expectError(warden.Error.Refused, window.spend(gpa, opening));
    }
}

test "VIII — a rotation starts the mark fresh" {
    const gpa = std.testing.allocator;
    var window: warden.Window = .{ .width = 8 };
    defer window.deinit(gpa);

    try window.spend(gpa, 30);
    try std.testing.expectError(warden.Error.Refused, window.spend(gpa, 1));
    window.reset(gpa);
    try std.testing.expectEqual(@as(i64, 0), window.mark);
    try window.spend(gpa, 1);
}

// ------------------------------------------------------ VIII, the leash

test "VIII — the leash is judged on what arrived, and hops of zero is legal" {
    // A time budget at or below zero is silence.
    try std.testing.expectError(warden.Error.Refused, warden.spendLeash(.{ .time = 0, .hops = 3 }));
    try std.testing.expectError(warden.Error.Refused, warden.spendLeash(.{ .time = -1, .hops = 3 }));
    // A hop count below zero is silence.
    try std.testing.expectError(warden.Error.Refused, warden.spendLeash(.{ .time = 5, .hops = -1 }));
    // A hop count of zero is a legal leash for a call that goes no further.
    try warden.spendLeash(.{ .time = 5, .hops = 0 });
    try warden.spendLeash(.{ .time = 1, .hops = 0 });
}

test "VIII — an onward ask carries less, and the road is never counted" {
    // The hop count falls by one; the time budget falls by this door's own
    // dwell, and by nothing else.
    const onward = warden.onward(.{ .time = 1000, .hops = 4 }, 250).?;
    try std.testing.expectEqual(@as(i64, 750), onward.time);
    try std.testing.expectEqual(@as(i64, 3), onward.hops);

    // A dwell of zero still costs a hop: the leash only shrinks.
    const free = warden.onward(.{ .time = 1000, .hops = 4 }, 0).?;
    try std.testing.expectEqual(@as(i64, 1000), free.time);
    try std.testing.expectEqual(@as(i64, 3), free.hops);

    // Where the hop count would fall below zero the onward ask is not made,
    // which is what a legal hop count of zero forbids.
    try std.testing.expect(warden.onward(.{ .time = 1000, .hops = 0 }, 1) == null);

    // Where the budget would fall to zero, or below it, likewise.
    try std.testing.expect(warden.onward(.{ .time = 250, .hops = 4 }, 250) == null);
    try std.testing.expect(warden.onward(.{ .time = 250, .hops = 4 }, 400) == null);
    try std.testing.expect(warden.onward(.{ .time = 250, .hops = 4 }, 249) != null);

    // No door beneath may widen it, so a dwell that reads backwards hands
    // nothing onward rather than handing on more than arrived.
    try std.testing.expect(warden.onward(.{ .time = 250, .hops = 4 }, -10) == null);
}

// -------------------------------------------------------- XII, the judgment

test "XII — step 3, a payload addressed elsewhere never touches this house's records" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    const elsewhere = try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .recipient = @splat(0xcc),
        .seq = 5,
    });
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(elsewhere));

    // Nothing was spent: the same number is still honourable.
    try std.testing.expectEqual(@as(i64, 0), ground.door.inbound.items[0].window.mark);
    var verdict = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 5,
    }));
    defer verdict.deinit();
    try std.testing.expectEqual(@as(i64, 5), ground.door.inbound.items[0].window.mark);
}

test "XII — step 3, the door answers to its name and to its padlock and to nothing else" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var named = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .recipient = ground.door.name,
        .seq = 1,
    }));
    named.deinit();

    // The padlock is the recipient a caller holding only a card can name.
    var locked = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .recipient = ground.door.padlock,
        .seq = 2,
    }));
    locked.deinit();
}

test "XII — step 4, the voice is placed in the two records and in that order" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();
    try ground.relate();

    // A current holder in the inbound record → an ask.
    var ask = try ground.door.judge(try ground.letter(.{ .voice_secret = ground.voice.secret }));
    defer ask.deinit();
    try std.testing.expect(ask.placement == .ask);

    // A far warden this door holds a relation with → news.
    var news = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.far.secret,
        .method = .{ .name = "tell", .args = "" },
    }));
    defer news.deinit();
    try std.testing.expect(news.placement == .news);

    // Nowhere → the stranger's case, which is a standing at nothing.
    var stranger = try ground.door.judge(try ground.letter(.{ .voice_secret = @splat(0x5a) }));
    defer stranger.deinit();
    try std.testing.expect(stranger.placement == .stranger);
}

test "XII — step 4, a rotation takes the standing over, and the old key dies" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // The old holder is spending numbers.
    var before = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 12,
    }));
    before.deinit();
    try std.testing.expectEqual(@as(i64, 12), ground.door.inbound.items[0].window.mark);

    // The heir presents itself, carrying a fresh commitment. The pk becomes
    // the current holder, the carried commitment becomes the new heir, and
    // the mark starts fresh — so a number the old holder had spent is legal.
    const next: Key = @splat(0x77);
    var rotation = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.heir.secret,
        .commitment = next,
        .seq = 1,
    }));
    defer rotation.deinit();
    try std.testing.expect(rotation.placement == .rotation);
    try std.testing.expectEqualSlices(u8, &ground.heir.public, &ground.door.inbound.items[0].voice);
    try std.testing.expectEqualSlices(u8, &next, &ground.door.inbound.items[0].commitment);
    try std.testing.expectEqual(@as(i64, 1), ground.door.inbound.items[0].window.mark);
    // The standing did not move: it is amended, never replaced.
    try std.testing.expectEqual(@as(usize, 1), ground.door.inbound.items.len);

    // There is one holder always: the previous key is dead and is now a
    // stranger at this door.
    var after = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 20,
    }));
    defer after.deinit();
    try std.testing.expect(after.placement == .stranger);
}

test "XII — step 4, a rotation with no fresh commitment is refused, and so is an ask with one" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // Every rotation carries a fresh commitment, or a standing could be taken
    // over once and never again.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.heir.secret,
        .commitment = null,
    })));
    // The heir did not spend, so it may still rotate.
    var rotation = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.heir.secret,
        .commitment = @splat(0x77),
    }));
    rotation.deinit();

    // The commitment is present only when the message spends an heir: a plain
    // ask carrying one is refused.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.heir.secret,
        .commitment = @splat(0x78),
        .seq = 2,
    })));
}

test "XIV — news is not a rotation and does not use the commitment field" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();

    var news = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.far.secret,
        .method = .{ .name = "tell", .args = "" },
    }));
    news.deinit();

    // The same voice announcing itself with a commitment in the say is not
    // news announcing a succession; that field is the heir's alone.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.far.secret,
        .commitment = @splat(0x33),
        .seq = 2,
        .method = .{ .name = "tell", .args = "" },
    })));

    // The heir the far warden committed to is also found in the outbound
    // record, because a succession is believed by a key already held.
    var heir_news = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.heir.secret,
        .seq = 3,
        .method = .{ .name = "tell", .args = "" },
    }));
    defer heir_news.deinit();
    try std.testing.expect(heir_news.placement == .news);
}

test "XII — step 5, honoured means consumed, and a later refusal does not give it back" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // The seq is spent at step five and the leash at step six, so a message
    // refused for its leash has still spent its number.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 4,
        .time = 0,
    })));
    try std.testing.expectEqual(@as(i64, 4), ground.door.inbound.items[0].window.mark);
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 4,
    })));
}

test "XIV — a stranger spends nothing" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // No row, so no mark is kept for it and its numbers are not counted: the
    // same number twice is judged twice.
    var first = try ground.door.judge(try ground.letter(.{ .voice_secret = @splat(0x5a), .seq = 9 }));
    first.deinit();
    var again = try ground.door.judge(try ground.letter(.{ .voice_secret = @splat(0x5a), .seq = 9 }));
    again.deinit();
    try std.testing.expectEqual(@as(usize, 0), ground.door.inbound.items.len);
}

test "XII — step 6, the leash is spent before routing" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .hops = -1,
    })));
    // A hop count of zero is a legal leash for a call that goes no further.
    var here = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 2,
        .hops = 0,
    }));
    defer here.deinit();
    try std.testing.expect(here.routing == .estate);
}

test "XII — step 7, being and method, being alone, neither, and method alone" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // Being and method — the being is invoked and answers.
    var invoked = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 1,
        .being = ground.thing,
        .method = .{ .name = "poke", .args = "" },
    }));
    defer invoked.deinit();
    try std.testing.expect(invoked.routing == .invoke);
    try std.testing.expectEqualSlices(u8, &ground.thing, &invoked.routing.invoke.being);
    try std.testing.expectEqualStrings("poke", invoked.routing.invoke.method.name);

    // Being, no method — the warden describes that one being.
    var sketched = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 2,
        .being = ground.thing,
    }));
    defer sketched.deinit();
    try std.testing.expect(sketched.routing == .sketch);

    // Neither — the warden describes the estate. There is no empty ask,
    // because there is a default one.
    var described = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 3,
    }));
    defer described.deinit();
    try std.testing.expect(described.routing == .estate);

    // Method, no being — the warden's own being answers. Naming it is the
    // ordinary form and omitting it the shortcut, so both reach it.
    var own = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 4,
        .method = .{ .name = "limit", .args = "" },
    }));
    defer own.deinit();
    try std.testing.expect(own.routing == .own);

    var named = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 5,
        .being = ground.door.name,
        .method = .{ .name = "limit", .args = "" },
    }));
    defer named.deinit();
    try std.testing.expect(named.routing == .invoke);
    try std.testing.expectEqualSlices(u8, &ground.door.name, &named.routing.invoke.being);
}

test "XII — step 7, a being the voice may not reach is silence, and the stranger gets the public one" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // A holder-less voice naming an ordinary being: silence, never absence.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = @splat(0x5a),
        .being = ground.thing,
    })));

    // The same voice naming nothing gets the stranger's describe.
    var stranger = try ground.door.judge(try ground.letter(.{
        .voice_secret = @splat(0x5a),
        .seq = 2,
    }));
    defer stranger.deinit();
    try std.testing.expect(stranger.routing == .stranger);

    // And the warden's own public being is reachable by everyone, so a
    // stranger holding a card may name it.
    var public = try ground.door.judge(try ground.letter(.{
        .voice_secret = @splat(0x5a),
        .seq = 3,
        .being = ground.door.name,
    }));
    defer public.deinit();
    try std.testing.expect(public.routing == .sketch);
}

test "XII — step 8, the answer names the ask by its seq and is signed by the warden's name" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var verdict = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 6,
    }));
    defer verdict.deinit();

    const estate = try ground.door.estateFor(a, ground.voice.public);
    const data = try warden.encodeEstate(a, estate);
    const sealed = try ground.door.answer(a, @splat(0x21), verdict.say, data);

    // Sealed to the return padlock the payload carried, so the caller's own
    // secret opens it and no other does.
    var opened = try envelope.open(a, ground.back.secret, .answer, sealed);
    defer opened.deinit();
    const back = opened.payload.answer;
    try std.testing.expectEqualSlices(u8, &ground.door.name, &back.warden);
    try std.testing.expectEqual(@as(i64, 6), back.seq);
    try std.testing.expectEqualSlices(u8, data, back.data.?);

    // An answer spends nothing: the mark is where the ask left it.
    try std.testing.expectEqual(@as(i64, 6), ground.door.inbound.items[0].window.mark);

    // The wrong padlock opens nothing, and a door is not the caller's end.
    try std.testing.expectError(
        warden.Error.Refused,
        envelope.open(a, ground.door.padlock_secret, .answer, sealed),
    );
    try std.testing.expectError(warden.Error.Refused, envelope.open(a, ground.back.secret, .say, sealed));
}

test "XII — the way back is refreshed by every call that arrives" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // An inbound row keeps a way back and not only a permission, because news
    // is the warden speaking first.
    try std.testing.expect(ground.door.inbound.items[0].padlock == null);
    var verdict = try ground.door.judge(try ground.letter(.{ .voice_secret = ground.voice.secret }));
    defer verdict.deinit();
    try std.testing.expectEqualSlices(
        u8,
        &ground.back.public,
        &ground.door.inbound.items[0].padlock.?,
    );
}

// ------------------------------------------------------------- XIV, the word

test "XIV — a word rides by the notation's own rules, and a case is read off which fields are present" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    // A succession of a being: the pk, the successor and the next commitment.
    const succession: warden.Word = .{
        .being = @splat(0x11),
        .successor = @splat(0x22),
        .commitment = @splat(0x33),
        .hints = &.{},
    };
    const written = try warden.encodeWord(a, succession);
    var back = try warden.decodeWord(a, written);
    defer back.deinit();
    try std.testing.expectEqualSlices(u8, &succession.being.?, &back.word.being.?);
    try std.testing.expectEqualSlices(u8, &succession.successor.?, &back.word.successor.?);
    try std.testing.expect(back.word.padlock == null);
    try std.testing.expectEqual(@as(usize, 0), back.word.hints.len);

    // A succession of the warden's own name is said by `being` absent.
    const name: warden.Word = .{ .successor = @splat(0x44), .commitment = @splat(0x55) };
    var named = try warden.decodeWord(a, try warden.encodeWord(a, name));
    defer named.deinit();
    try std.testing.expect(named.word.being == null);

    // A padlock replacement carries only the new padlock: a lock has no heir,
    // so successor and commitment are absent, and fields that mean nothing in
    // a case are absent rather than filled.
    const hints = [_][]const u8{"quo://one"};
    const lock: warden.Word = .{ .padlock = @splat(0x66), .hints = &hints };
    const lock_bytes = try warden.encodeWord(a, lock);
    var read_lock = try warden.decodeWord(a, lock_bytes);
    defer read_lock.deinit();
    try std.testing.expect(read_lock.word.successor == null);
    try std.testing.expect(read_lock.word.commitment == null);
    try std.testing.expectEqualSlices(u8, &lock.padlock.?, &read_lock.word.padlock.?);
    try std.testing.expectEqualStrings("quo://one", read_lock.word.hints[0]);

    // The word the arena hands back does not point into the caller's bytes.
    @memset(lock_bytes, 0);
    try std.testing.expectEqualStrings("quo://one", read_lock.word.hints[0]);

    // Bytes left over after a well-formed word are refused, as everywhere.
    const longer = try a.alloc(u8, lock_bytes.len + 1);
    @memcpy(longer[0..lock_bytes.len], try warden.encodeWord(a, lock));
    longer[lock_bytes.len] = 0;
    try std.testing.expectError(warden.Error.Refused, warden.decodeWord(a, longer));
}

test "XII — the way back is refreshed between the seq and the leash" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    const live = try arithmetic.sealingPair(@splat(0x41));
    const retired = try arithmetic.sealingPair(@splat(0x42));
    const late = try arithmetic.sealingPair(@splat(0x43));

    // Where the refresh falls decides two things a door would otherwise get
    // wrong, and both are consequences of the placement rather than choices.
    ground.back = live;
    var first = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 5,
    }));
    first.deinit();
    try std.testing.expectEqualSlices(
        u8,
        &live.public,
        &ground.door.inbound.items[0].padlock.?,
    );

    // Not earlier than the seq: a replayed message carries whatever way back
    // the peer had when it was sent, and the seq is the only thing that tells
    // a replay from a call. A door that refreshed first would let anyone
    // holding a copy overwrite a live way back with a retired one.
    ground.back = retired;
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 5,
    })));
    try std.testing.expectEqualSlices(
        u8,
        &live.public,
        &ground.door.inbound.items[0].padlock.?,
    );

    // And not later than the leash: a message refused for its leash still
    // arrived and still spent its number. A door that refreshed only what it
    // went on to route would slowly lose the way back to any peer whose calls
    // it keeps refusing — and news is what that peer would stop receiving.
    ground.back = late;
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 6,
        .time = 0,
    })));
    try std.testing.expectEqualSlices(
        u8,
        &late.public,
        &ground.door.inbound.items[0].padlock.?,
    );
}

test "VII — an arriving call with empty hints leaves the way back standing" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // An end that publishes nothing — the dialing end always — sends an empty
    // hints list by nature, and a door that erased on that would destroy its
    // own way back to that peer on the peer's first ask. So an empty list
    // means the road did not change, exactly as it does outbound.
    const road = [_][]const u8{"quo://caller.example"};
    // The row borrows the road out of this verdict's arena, so the verdict
    // outlives both assertions.
    var carried = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 1,
        .hints = &road,
    }));
    defer carried.deinit();
    try std.testing.expectEqual(@as(usize, 1), ground.door.inbound.items[0].hints.len);
    try std.testing.expectEqualStrings(
        "quo://caller.example",
        ground.door.inbound.items[0].hints[0],
    );

    var empty = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .seq = 2,
    }));
    defer empty.deinit();
    try std.testing.expectEqual(@as(usize, 1), ground.door.inbound.items[0].hints.len);
    try std.testing.expectEqualStrings(
        "quo://caller.example",
        ground.door.inbound.items[0].hints[0],
    );
}

// --------------------------------------------------- the caller side, and accept

/// A road that hands every envelope straight to the granting door and answers
/// nothing. Silence is a legal answer, and what these cases are about is what
/// the two rotations do to the standing rather than what comes back.
const Granting = struct {
    ground: *Ground,
    gpa: std.mem.Allocator,
    sent: usize = 0,

    fn road(self: *Granting) warden.Warden.Road {
        return .{ .context = self, .send = send };
    }

    fn send(context: *anyopaque, message: []const u8) anyerror!?[]const u8 {
        const self: *Granting = @ptrCast(@alignCast(context));
        self.sent += 1;
        var verdict = try self.ground.door.judge(message);
        verdict.deinit();
        return null;
    }
};

/// A holder's own door: it grants nothing and holds nothing, it only calls.
fn holding(gpa: std.mem.Allocator) !warden.Warden {
    const name = try arithmetic.signingPair(@splat(0x41));
    const padlock = try arithmetic.sealingPair(@splat(0x42));
    return .{
        .gpa = gpa,
        .name = name.public,
        .name_secret = name.secret,
        .padlock = padlock.public,
        .padlock_secret = padlock.secret,
        .limit = 1 << 16,
        .width = 8,
    };
}

/// The invitation the fixture's `admit` corresponds to: the granting door has
/// a standing committed to this heir, and these are the five things a holder
/// holds.
fn invitationOf(ground: *Ground) warden.Invitation {
    return .{
        .warden = ground.door.name,
        .commitment = arithmetic.commitment(ground.door.name, ground.heir.public),
        .padlock = ground.door.padlock,
        .heir = ground.heir.public,
        .heir_secret = ground.heir.secret,
        .hints = &.{},
    };
}

test "the caller side stands in the kit: remember, ask, rotate and hear" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var holder = try holding(gpa);
    defer holder.deinit();

    // A kit that can only answer a call is half a kit. This is the whole of
    // making one: keep the invitation, compose, and open what comes back.
    const at = try holder.remember(invitationOf(&ground));
    const next = try arithmetic.signingPair(@splat(0x43));
    const rotated, const seq = try holder.rotate(a, at, @splat(0x44), next.secret, .{});
    try std.testing.expectEqual(@as(i64, 1), seq);

    var verdict = try ground.door.judge(rotated);
    defer verdict.deinit();
    try std.testing.expect(verdict.placement == .rotation);

    // The row moved onto the heir it was handed and committed to the fresh
    // key beside it, under one act with the composing.
    const row = holder.outbound.items[at];
    try std.testing.expectEqualSlices(u8, &ground.heir.public, &row.voice);
    try std.testing.expectEqualSlices(u8, &next.public, &row.heir);

    // And the answer opens under this ground's own padlock.
    const reply = try ground.door.answer(a, @splat(0x45), verdict.say, null);
    var heard = try holder.hear(a, reply);
    defer heard.deinit();
    try std.testing.expectEqual(seq, heard.payload.answer.seq);
    try std.testing.expectEqualSlices(u8, &ground.door.name, &heard.payload.answer.warden);
}

test "accept spends an invitation whole, in two rotations, and the granter's keys die" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var holder = try holding(gpa);
    defer holder.deinit();
    var granting: Granting = .{ .ground = &ground, .gpa = gpa };

    const taken = try holder.accept(a, invitationOf(&ground), .{
        .voice_secret = @splat(0x51),
        .heir_secret = @splat(0x52),
        .ephemeral = .{ @splat(0x53), @splat(0x54) },
        .method = .{ .name = "describe", .args = &.{} },
    }, granting.road());

    // Two rotate-and-asks, never one: the second is what leaves this ground
    // standing on a key the granter has never seen.
    try std.testing.expectEqual(@as(usize, 2), granting.sent);
    const voice = try arithmetic.signingPair(@splat(0x51));
    const heir = try arithmetic.signingPair(@splat(0x52));
    try std.testing.expectEqualSlices(u8, &voice.public, &taken.voice);
    try std.testing.expectEqualSlices(u8, &heir.public, &taken.heir);

    // The granting door's standing stands on that voice and commits to that
    // heir, which is the whole point of paying for the second rotation.
    const standing = ground.door.inbound.items[0];
    try std.testing.expectEqualSlices(u8, &voice.public, &standing.voice);
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(ground.door.name, heir.public),
        &standing.commitment,
    );
    try std.testing.expectEqualSlices(u8, &taken.commitment, &standing.commitment);

    // Every key the granter ever held for this standing is dead. It minted the
    // invitation's voice and its heir and has seen both; neither reaches now.
    for ([_]Key{ ground.voice.secret, ground.heir.secret }) |dead| {
        var after = try ground.door.judge(try ground.letter(.{
            .voice_secret = dead,
            .seq = 90,
        }));
        defer after.deinit();
        try std.testing.expect(after.placement == .stranger);
    }
}

test "accept is remember and rotate composed, and that raw path stays open" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var holder = try holding(gpa);
    defer holder.deinit();

    // The helper exists so no caller forgets the second rotation, not so the
    // steps become unreachable. Walked by hand, they reach the same place.
    const at = try holder.remember(invitationOf(&ground));
    const voice = try arithmetic.signingPair(@splat(0x51));
    const heir = try arithmetic.signingPair(@splat(0x52));

    const first, _ = try holder.rotate(a, at, @splat(0x53), voice.secret, .{});
    var one = try ground.door.judge(first);
    one.deinit();

    const second, _ = try holder.rotate(a, at, @splat(0x54), heir.secret, .{});
    var two = try ground.door.judge(second);
    two.deinit();

    const standing = ground.door.inbound.items[0];
    try std.testing.expectEqualSlices(u8, &voice.public, &standing.voice);
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(ground.door.name, heir.public),
        &standing.commitment,
    );
}

// --------------------------------------------- XIV, the name's own succession

test "XIV — the name moves only to the heir the founding committed to" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    const was = ground.door.name;

    // A key that was never committed does not take the name.
    const stray = try arithmetic.signingPair(@splat(0x5a));
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.succeed(stray.secret, @splat(0x77)),
    );
    try std.testing.expectEqualSlices(u8, &was, &ground.door.name);

    // The founding committed to this ground's heir, so that key spends.
    try ground.door.succeed(ground.heir.secret, @splat(0x77));
    try std.testing.expectEqualSlices(u8, &ground.heir.public, &ground.door.name);

    // The public being's pk is the warden's name, so it moved with it, and it
    // commits to what comes next.
    const public = ground.door.being(ground.door.name) orelse
        return error.TestUnexpectedResult;
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x77)), &public.commitment);
    // No door keeps a retired name alive.
    try std.testing.expect(ground.door.being(was) == null);
}

test "XIV — a name succession keeps the standings, and a holder behind the news succeeds once" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();
    const was = ground.door.name;

    try ground.door.succeed(ground.heir.secret, @splat(0x77));
    try std.testing.expectEqualSlices(u8, &was, &ground.door.inbound.items[0].minted_name);

    // The holder has not heard the news, so it mints its next commitment
    // under the name it still believes. The standing was filed under that
    // name, so this rotation is judged and accepted.
    const next = try arithmetic.signingPair(@splat(0x21));
    var rotation = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.heir.secret,
        .commitment = arithmetic.commitment(was, next.public),
        .seq = 1,
    }));
    defer rotation.deinit();
    try std.testing.expect(rotation.placement == .rotation);

    // And the commitment it carried is filed under the name the door has now,
    // because a door cannot see which name a holder minted one under.
    try std.testing.expectEqualSlices(
        u8,
        &ground.door.name,
        &ground.door.inbound.items[0].minted_name,
    );

    // So the rotation after it will not match. The voice is found nowhere, and
    // a voice found nowhere is a stranger whether or not it carried a
    // commitment — the field is ignored rather than refused, because the kind
    // is read off the voice and never declared.
    var after = try ground.door.judge(try ground.letter(.{
        .voice_secret = next.secret,
        .commitment = @splat(0x88),
        .seq = 2,
    }));
    defer after.deinit();
    try std.testing.expect(after.placement == .stranger);

    // And the standing did not change hands.
    try std.testing.expectEqualSlices(
        u8,
        &ground.heir.public,
        &ground.door.inbound.items[0].voice,
    );
}

test "XII — a voice found nowhere is a stranger whether or not it carried a commitment" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // The caller this meets is a holder whose door has forgotten it — restored
    // from an old backup, or its standing released. Silence would be
    // unrecoverable for it; the stranger's case at least says the house is
    // alive, and both spellings must reach it.
    const nobody = try arithmetic.signingPair(@splat(0x3c));
    for ([_]?Key{ null, @as(Key, @splat(0x88)) }) |carried| {
        var verdict = try ground.door.judge(try ground.letter(.{
            .voice_secret = nobody.secret,
            .commitment = carried,
        }));
        defer verdict.deinit();
        try std.testing.expect(verdict.placement == .stranger);
    }

    // News still refuses one: news is not a rotation and does not use the
    // field, and that voice is found rather than nowhere.
    try ground.relate();
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.far.secret,
        .commitment = @splat(0x88),
    })));
}

test "XIV — hearing the news is what ends it" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    try ground.door.succeed(ground.heir.secret, @splat(0x77));

    // A holder that has heard the news mints under the name the door has now,
    // and keeps rotating.
    const next = try arithmetic.signingPair(@splat(0x21));
    var first = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.heir.secret,
        .commitment = arithmetic.commitment(ground.door.name, next.public),
        .seq = 1,
    }));
    defer first.deinit();
    try std.testing.expect(first.placement == .rotation);

    var second = try ground.door.judge(try ground.letter(.{
        .voice_secret = next.secret,
        .commitment = @splat(0x88),
        .seq = 2,
    }));
    defer second.deinit();
    try std.testing.expect(second.placement == .rotation);
}

// -------------------------------- the awaiting record, and a caller's numbers

test "XII — an answer nothing awaits is silence, and hearing one spends the record" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();
    var holder = try holding(gpa);
    defer holder.deinit();

    const at = try holder.remember(invitationOf(&ground));
    const next = try arithmetic.signingPair(@splat(0x51));
    const rotated, const seq = try holder.rotate(a, at, @splat(0x52), next.secret, .{});
    try std.testing.expectEqual(@as(usize, 1), holder.outbound.items[at].awaiting.items.len);

    var verdict = try ground.door.judge(rotated);
    defer verdict.deinit();
    const reply = try ground.door.answer(a, @splat(0x53), verdict.say, null);

    var heard = try holder.hear(a, reply);
    defer heard.deinit();
    try std.testing.expectEqual(seq, heard.payload.answer.seq);
    try std.testing.expectEqual(@as(usize, 0), holder.outbound.items[at].awaiting.items.len);

    // The very same bytes: well-formed, well-signed, from the door that was
    // asked, and silence, because nothing awaits them.
    try std.testing.expectError(warden.Error.Refused, holder.hear(a, reply));
}

test "XII — an answer from a door this ask never went to is silence at the caller" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();
    var holder = try holding(gpa);
    defer holder.deinit();

    // An ask that never went anywhere, so the caller awaits number one — and
    // an answer signed by a house it holds no relation with, sealed to its own
    // padlock so the envelope's own half reads it perfectly.
    const at = try holder.remember(invitationOf(&ground));
    const next = try arithmetic.signingPair(@splat(0x54));
    _, const seq = try holder.rotate(a, at, @splat(0x55), next.secret, .{});

    const stranger = try arithmetic.signingPair(@splat(0x56));
    const forged = try envelope.seal(a, @splat(0x57), holder.padlock, stranger.secret, .{ .answer = .{
        .warden = stranger.public,
        .seq = seq,
        .data = null,
    } });

    // It unseals here, it says `answer`, and its signature verifies against
    // the warden its own record carries.
    var opened = try envelope.open(a, holder.padlock_secret, .answer, forged);
    defer opened.deinit();
    try std.testing.expectEqual(seq, opened.payload.answer.seq);
    // And it is silence, because that warden is nobody this ground asked.
    try std.testing.expectError(warden.Error.Refused, holder.hear(a, forged));
}

test "XII — two asks whose answers could not be told apart: the second is not sent" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();
    var holder = try holding(gpa);
    defer holder.deinit();

    const at = try holder.remember(invitationOf(&ground));
    const first = try arithmetic.signingPair(@splat(0x58));
    const second = try arithmetic.signingPair(@splat(0x59));
    _, _ = try holder.rotate(a, at, @splat(0x5a), first.secret, .{ .seq = 1 });

    // A rotation starts the far door's mark fresh, so a caller may open at one
    // again — the same padlock, the same warden, the same number.
    try std.testing.expectError(
        warden.Error.Refused,
        holder.rotate(a, at, @splat(0x5b), second.secret, .{ .seq = 1 }),
    );

    // Forgoing is the caller saying it has stopped waiting.
    try std.testing.expect(holder.forgo(at, 1));
    try std.testing.expect(!holder.forgo(at, 1));
    _, _ = try holder.rotate(a, at, @splat(0x5b), second.secret, .{ .seq = 1 });
}

test "VIII — the caller's kit lets it open above one, and counts on from there" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();
    var holder = try holding(gpa);
    defer holder.deinit();

    const at = try holder.remember(invitationOf(&ground));
    const next = try arithmetic.signingPair(@splat(0x5c));
    const rotated, const seq = try holder.rotate(a, at, @splat(0x5d), next.secret, .{ .seq = 4096 });
    try std.testing.expectEqual(@as(i64, 4096), seq);

    var verdict = try ground.door.judge(rotated);
    defer verdict.deinit();
    try std.testing.expect(verdict.placement == .rotation);

    // And the row counts on from there, because per voice the number only
    // rises. A number it has already spent is refused here rather than met
    // with silence at the far door.
    try std.testing.expectError(
        warden.Error.Refused,
        holder.ask(a, at, @splat(0x5e), .{ .seq = 4096 }),
    );
    _, const onward = try holder.ask(a, at, @splat(0x5f), .{});
    try std.testing.expectEqual(@as(i64, 4097), onward);
}

test "IX — the published limit binds where there is no road at all" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    // The one fact this law makes a warden publish about itself is the largest
    // message it will accept, counted in bytes of the whole envelope. It binds
    // on every road, distance zero included: a door that accepted locally what
    // it refuses over the common carriage would have made its own published
    // number false.
    const letter = try ground.letter(.{ .voice_secret = ground.voice.secret });

    // A byte over it is silence, and it is silence before anything is
    // unsealed: the number is not spent and the way back is not refreshed,
    // which the same envelope being honoured next is what proves.
    ground.door.limit = letter.len - 1;
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(letter));
    try std.testing.expectEqual(@as(i64, 0), ground.door.inbound.items[0].window.mark);

    ground.door.limit = letter.len;
    var verdict = try ground.door.judge(letter);
    defer verdict.deinit();
    try std.testing.expectEqual(@as(i64, 1), ground.door.inbound.items[0].window.mark);
}

// ------------------------------------------------------- XIV, believing news

/// News arrives as an ordinary envelope carrying `tell(word)`. What comes back
/// is the verdict, so a case can read the placement the belief was made under.
fn told(ground: *Ground, secret: Key, seq: i64, word: warden.Word) !void {
    const a = ground.arena.allocator();
    const args = try warden.encodeWord(a, word);
    var verdict = try ground.door.judge(try ground.letter(.{
        .voice_secret = secret,
        .seq = seq,
        .method = .{ .name = "tell", .args = args },
    }));
    defer verdict.deinit();
    var decoded = try warden.decodeWord(a, args);
    defer decoded.deinit();
    try ground.door.believe(verdict.placement, verdict.say.voice, decoded.word);
}

test "XIV — a name succession is believed by hashing the successor against the commitment" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();

    // The peer holds the hash of the heir, so the successor signs and the peer
    // hashes. The row moves whole: the name it now answers by, and the
    // commitment that lets the next succession be believed.
    try told(&ground, ground.heir.secret, 1, .{
        .successor = ground.heir.public,
        .commitment = @splat(0x44),
        .padlock = @splat(0x33),
        .hints = &.{"quic://moved"},
    });
    const row = ground.door.outbound.items[0];
    try std.testing.expectEqualSlices(u8, &ground.heir.public, &row.warden);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x44)), &row.commitment);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x33)), &row.padlock);
    try std.testing.expectEqual(@as(usize, 1), row.hints.len);
    // A name succession keeps the mark: the house persisted and only its key
    // changed, so numbers already spent stay spent.
    try std.testing.expectEqual(@as(i64, 1), row.news.mark);
}

test "XIV — a succession the successor did not sign is silence" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();
    const held = ground.door.outbound.items[0].warden;

    // Signed by the heir that was committed, which is the right road, and
    // naming somebody else as the successor, which is the wrong key. Believing
    // it would let a committed heir hand this relation to a third party it
    // chose.
    try std.testing.expectError(warden.Error.Refused, told(&ground, ground.heir.secret, 1, .{
        .successor = @splat(0x66),
        .commitment = @splat(0x44),
    }));
    try std.testing.expectEqualSlices(u8, &held, &ground.door.outbound.items[0].warden);

    // And a succession with no next commitment says nothing about what comes
    // after it: fields that mean nothing in a case are absent, not filled, and
    // a succession's do mean something.
    try std.testing.expectError(warden.Error.Refused, told(&ground, ground.heir.secret, 2, .{
        .successor = ground.heir.public,
    }));
    try std.testing.expectEqualSlices(u8, &held, &ground.door.outbound.items[0].warden);
}

test "XIV — a padlock replacement has exactly one signer, and it is the name" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();
    const held = ground.door.outbound.items[0].padlock;

    // A lock has no heir. A door that believed this from the committed heir
    // would let that heir replace this house's lock at every peer before
    // succeeding anything, and every message those peers sent next would be
    // sealed to a lock the heir chose.
    try std.testing.expectError(warden.Error.Refused, told(&ground, ground.heir.secret, 1, .{
        .padlock = @splat(0x77),
    }));
    try std.testing.expectEqualSlices(u8, &held, &ground.door.outbound.items[0].padlock);

    // The name signs the same word and it is believed.
    try told(&ground, ground.far.secret, 2, .{ .padlock = @splat(0x77) });
    try std.testing.expectEqualSlices(
        u8,
        &@as(Key, @splat(0x77)),
        &ground.door.outbound.items[0].padlock,
    );
    // The mark continues, because a house that replaces its lock persists.
    try std.testing.expectEqual(@as(i64, 2), ground.door.outbound.items[0].news.mark);
}

test "XIV — a word that says nothing, and one that says two things, are both silence" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();

    // Neither a succession nor a replacement.
    try std.testing.expectError(warden.Error.Refused, told(&ground, ground.far.secret, 1, .{
        .hints = &.{"quic://nowhere"},
    }));
    // A commitment with no successor is half a succession, and half of one is
    // none: the case is read off which fields are present.
    try std.testing.expectError(warden.Error.Refused, told(&ground, ground.far.secret, 2, .{
        .commitment = @splat(0x44),
    }));
    // The far warden's name and its public being are one key, so a word naming
    // that pk as a being is a second spelling of the name's own succession —
    // and a value with two spellings is two identities.
    try std.testing.expectError(warden.Error.Refused, told(&ground, ground.heir.secret, 3, .{
        .being = ground.far.public,
        .successor = ground.heir.public,
        .commitment = @splat(0x44),
    }));
}

test "XIV — a being's succession is believed against that being's own commitment" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();

    // A describe hands back a commitment per being, and a peer that means to
    // believe that being's succession keeps it. The being's own heir is a
    // third key, committed for that being alone.
    const being = try arithmetic.signingPair(@splat(0x61));
    const successor = try arithmetic.signingPair(@splat(0x62));
    try ground.door.note(
        0,
        being.public,
        arithmetic.commitment(ground.far.public, successor.public),
    );
    // The house's own name is not a being of it: its commitment is the row's,
    // and a second copy under the beings would be a second place to believe
    // one succession from.
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.note(0, ground.far.public, @splat(0x44)),
    );

    // The house's committed heir announces the being's succession. It is a key
    // this door holds and the wrong one for this act: believing it would let
    // the house's heir succeed every being at that house.
    try std.testing.expectError(warden.Error.Refused, told(&ground, ground.heir.secret, 1, .{
        .being = being.public,
        .successor = ground.heir.public,
        .commitment = @splat(0x44),
    }));
    try std.testing.expectEqualSlices(
        u8,
        &being.public,
        &ground.door.outbound.items[0].beings.items[0].being,
    );

    // The other direction is the more dangerous one: a being's committed heir
    // announcing the house's own succession would take the whole relation,
    // every other being at it included, on a commitment that was only ever
    // about one being.
    const was = ground.door.outbound.items[0].warden;
    try std.testing.expectError(warden.Error.Refused, told(&ground, successor.secret, 2, .{
        .successor = successor.public,
        .commitment = @splat(0x55),
    }));
    try std.testing.expectEqualSlices(u8, &was, &ground.door.outbound.items[0].warden);

    // The being's own committed heir announces it, and it is believed: the
    // entry moves to the successor with the next commitment, and the row's own
    // name and commitment are untouched.
    const commitment = ground.door.outbound.items[0].commitment;
    try told(&ground, successor.secret, 3, .{
        .being = being.public,
        .successor = successor.public,
        .commitment = @splat(0x55),
    });
    const row = ground.door.outbound.items[0];
    try std.testing.expectEqualSlices(u8, &successor.public, &row.beings.items[0].being);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x55)), &row.beings.items[0].commitment);
    try std.testing.expectEqualSlices(u8, &was, &row.warden);
    try std.testing.expectEqualSlices(u8, &commitment, &row.commitment);
    // A being's succession starts the news mark fresh, exactly as a standing's
    // rotation does: the house itself changed, and what comes next is believed
    // by its commitment rather than by its number.
    try std.testing.expectEqual(@as(i64, 0), row.news.mark);
}

test "XIV — a succession of a being this door never noted is not news at all" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();

    // Its heir is a key found nowhere, so the message is a stranger's rather
    // than news — and a stranger announces nothing, whatever its word says.
    const a = ground.arena.allocator();
    const stranger = try arithmetic.signingPair(@splat(0x63));
    const args = try warden.encodeWord(a, .{
        .being = @splat(0x61),
        .successor = stranger.public,
        .commitment = @splat(0x55),
    });
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = stranger.secret,
        .method = .{ .name = "tell", .args = args },
    })));

    // The same voice placed nowhere reaches the stranger's own room, and the
    // belief refuses on the placement rather than on the word: what a voice
    // may announce is decided by where it was found, and a stranger was found
    // nowhere.
    var verdict = try ground.door.judge(try ground.letter(.{
        .voice_secret = stranger.secret,
        .seq = 2,
    }));
    defer verdict.deinit();
    try std.testing.expect(verdict.placement == .stranger);
    var decoded = try warden.decodeWord(a, args);
    defer decoded.deinit();
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.believe(verdict.placement, verdict.say.voice, decoded.word),
    );
}

test "XIV — an empty hints list means the road did not change, never an erasure" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();
    ground.door.outbound.items[0].hints = &.{"quic://one"};

    try told(&ground, ground.far.secret, 1, .{ .padlock = @splat(0x77) });
    try std.testing.expectEqual(@as(usize, 1), ground.door.outbound.items[0].hints.len);
}

test "XII — tell is news, and news is a tell, and neither is the other thing" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();
    try ground.relate();
    const a = ground.arena.allocator();
    const args = try warden.encodeWord(a, .{ .padlock = @splat(0x77) });

    // A caller holding an ordinary standing announces nothing: `tell` is news,
    // and news is placed by the voice rather than declared by the message.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .method = .{ .name = "tell", .args = args },
    })));

    // And a far warden reaching for anything else is silence too: news reaches
    // the warden's own being, and the one field it may reach there is `tell`.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.far.secret,
        .seq = 2,
        .method = .{ .name = "describe", .args = "" },
    })));
    // Including a being of this house it was never granted.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = ground.far.secret,
        .seq = 3,
        .being = ground.thing,
        .method = .{ .name = "tell", .args = args },
    })));
}

// --------------------------------------------- IX and XIII, taking a cargo

fn aCargo(ground: *Ground, digest: Key) warden.Cargo {
    return .{
        .being = @splat(0x50),
        .digest = digest,
        .cells = "remembered",
        .standings = &.{.{
            .voice = @splat(0x70),
            .commitment = @splat(0x71),
            // The name that commitment was minted at, which is the origin's
            // rather than this door's.
            .name = @splat(0x73),
            .beings = &.{@as(Key, @splat(0x50))},
            .mark = 9,
            .spent = &.{ 4, 6 },
            .padlock = @splat(0x72),
            .hints = &.{"quic://back"},
        }},
        .relations = &.{.{
            .warden = ground.far.public,
            .commitment = @splat(0x81),
            .padlock = @splat(0x82),
            .voice = @splat(0x83),
            .secret = @splat(0x84),
            .heir = @splat(0x85),
            .heir_secret = @splat(0x86),
            .seq = 12,
            .news = 7,
            .hints = &.{"quic://third"},
        }},
    };
}

/// The two keys a destination mints, and the class it is armed for.
fn armFor(ground: *Ground) !Key {
    return ground.door.arm(.{
        .digest = ground.thing_digest,
        .text = "Thing\n  poke() int\n",
        .secret = @splat(0x40),
        .heir_secret = @splat(0x41),
    });
}

test "IX — receive answers the commitment of the being's new name" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // The commitment the arm hands back is the one the origin carries into the
    // first news, and it is the same value `receive` answers: the hash of a key
    // this door generated, which tells the origin nothing about the key.
    const promised = try armFor(&ground);
    const answered = try ground.door.receive(aCargo(&ground, ground.thing_digest));
    try std.testing.expectEqualSlices(u8, &promised, &answered);

    // A destination mints two keys — the one the being is named by here and
    // that one's heir — and the commitment is of the first. A commitment to
    // the heir instead names a key that signs nothing until the succession
    // after this one, so the peer disbelieves the second news and is left
    // standing at a house that has stopped answering.
    const name = (try arithmetic.signingPair(@as(Key, @splat(0x40)))).public;
    const heir = (try arithmetic.signingPair(@as(Key, @splat(0x41)))).public;
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(ground.door.name, name),
        &answered,
    );
    try std.testing.expect(
        !std.mem.eql(u8, &arithmetic.commitment(ground.door.name, heir), &answered),
    );

    // The being wears that name here, holding its own heir commitment so it
    // can be succeeded afterwards like any other.
    const held = ground.door.being(name) orelse return error.TestUnexpectedResult;
    try std.testing.expectEqualSlices(u8, &ground.thing_digest, &held.digest);
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(ground.door.name, heir),
        &held.commitment,
    );
    // The arm is spent: a claim held open twice is a door a being can be
    // pushed into twice.
    try std.testing.expectEqual(@as(usize, 0), ground.door.arms.items.len);
}

test "IX — the digest identifies rather than delivers" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();

    // A destination that does not already hold that class refuses the cargo in
    // silence, and there is nobody it may ask.
    _ = try armFor(&ground);
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.receive(aCargo(&ground, @splat(0x99))),
    );
    try std.testing.expectEqual(@as(usize, 2), ground.door.beings.items.len);
    try std.testing.expectEqual(@as(usize, 1), ground.door.arms.items.len);

    // And a receive minting the name the being already wore is no move at all.
    const wearing = (try arithmetic.signingPair(@as(Key, @splat(0x40)))).public;
    var same = aCargo(&ground, ground.thing_digest);
    same.being = wearing;
    try std.testing.expectError(warden.Error.Refused, ground.door.receive(same));
    try std.testing.expectEqual(@as(usize, 1), ground.door.arms.items.len);
}

test "XIII — the records travel with the being, and the replay window whole" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    _ = try armFor(&ground);
    _ = try ground.door.receive(aCargo(&ground, ground.thing_digest));
    const name = (try arithmetic.signingPair(@as(Key, @splat(0x40)))).public;

    const row = &ground.door.inbound.items[0];
    // The name each commitment was minted at travels with the row, so a
    // standing that arrives still rotates at the name it was granted under
    // rather than at this door's.
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x73)), &row.minted_name);
    try std.testing.expect(!std.mem.eql(u8, &row.minted_name, &ground.door.name));
    // The way back travelled with the standing, so this door can speak first
    // to a peer it has never been called by.
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x72)), &row.padlock.?);

    // **An arriving row reaches the being by the name this door minted and by
    // that name alone**, never also by the name it wore before: a name a door
    // must remember for whoever might still be behind is a name it can never
    // stop remembering, and the peer that is behind is not stranded, because
    // the old door still answers `moved`.
    try std.testing.expectEqual(@as(usize, 1), row.beings.items.len);
    try std.testing.expect(row.reaches(name));
    try std.testing.expect(!row.reaches(@splat(0x50)));

    // The replay record travels whole — the mark and the spent numbers beneath
    // it — or a caller's late-arriving in-window numbers would be judged here
    // by a window this door cannot see.
    try std.testing.expectEqual(@as(i64, 9), row.window.mark);
    try std.testing.expectError(warden.Error.Refused, row.window.spend(gpa, 4));
    try std.testing.expectError(warden.Error.Refused, row.window.spend(gpa, 6));
    try std.testing.expectError(warden.Error.Refused, row.window.spend(gpa, 9));
    // And a mark that arrives is a number that was honoured, so it stays
    // honoured once the mark moves off it.
    try row.window.spend(gpa, 10);
    try std.testing.expectError(warden.Error.Refused, row.window.spend(gpa, 9));

    // The outbound record travels too, and nobody is owed news about it: the
    // doors where the being holds a standing know only a voice and have never
    // heard of the being at all. Both counters come with it, or a peer's
    // numbers would all come round again at the new door.
    const out = ground.door.outbound.items[0];
    try std.testing.expectEqualSlices(u8, &ground.far.public, &out.warden);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x86)), &out.heir_secret);
    try std.testing.expectEqual(@as(i64, 12), out.seq);
    try std.testing.expectEqual(@as(i64, 7), out.news.mark);
}

test "XII — a door any stranger could push a being into is a door with no gate" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    const a = ground.arena.allocator();
    const promised = try armFor(&ground);
    const cargo = try warden.encodeCargo(a, aCargo(&ground, ground.thing_digest));

    // `receive` is an ordinary field spent by an ordinary standing, granted in
    // advance the way anything is. Refused, it is silence like everything else.
    try std.testing.expectError(warden.Error.Refused, ground.door.judge(try ground.letter(.{
        .voice_secret = @splat(0x5a),
        .method = .{ .name = "receive", .args = cargo },
    })));

    // The holder reaches it, and the warden spends the field itself.
    try ground.admit();
    var verdict = try ground.door.judge(try ground.letter(.{
        .voice_secret = ground.voice.secret,
        .method = .{ .name = "receive", .args = cargo },
    }));
    defer verdict.deinit();
    try std.testing.expect(verdict.routing == .own);

    var shapes = try notation.parse(a, warden.blueprint_text);
    defer shapes.deinit();
    const answered = (try ground.door.own(a, verdict)).?;
    var minted = try wire.decode(a, "b32", shapes.records, answered);
    defer minted.deinit();
    try std.testing.expectEqualSlices(u8, &promised, &minted.value.b32);
}

test "XIII — the old door only points" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    const word: warden.Word = .{
        .being = ground.thing,
        .successor = @splat(0x50),
        .commitment = @splat(0x51),
        .name = @splat(0x52),
        .padlock = @splat(0x53),
        .hints = &.{"quic://new"},
    };
    // The name need not be a being this door holds. **The new door points as
    // well**, for the name the arriving being wore before, and that name is a
    // being at no door any more — so a pointer for an unheld name becomes a
    // row that answers `moved` and nothing else.
    try ground.door.publish(@splat(0x5b), word);
    try std.testing.expect(ground.door.being(@splat(0x5b)) != null);
    try ground.door.publish(ground.thing, word);

    // The one ask the old door answers about a being that left.
    const pointed = try ground.door.movedFor(ground.voice.public, ground.thing);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x50)), &pointed.?.successor.?);

    // A legal ask has a legal answer: nothing has moved, so `moved` answers
    // absence rather than silence.
    try std.testing.expectEqual(
        @as(?warden.Word, null),
        try ground.door.movedFor(ground.voice.public, ground.door.name),
    );

    // A stranger is answered nothing, as it is by every other describe: a door
    // that pointed for anyone would be a door any passer-by could ask what it
    // once ran.
    try std.testing.expectError(
        warden.Error.Refused,
        ground.door.movedFor(null, ground.thing),
    );

    // And a pointer is reach enough for a holder, because an arriving row
    // names the being by the destination's name alone — so after the move the
    // name the being wore stands in no standing anywhere, and if the pointer
    // were not reach the old door could not point about the one being every
    // peer behind the news comes to ask it about.
    ground.door.inbound.items[0].beings.clearRetainingCapacity();
    const still = try ground.door.movedFor(ground.voice.public, ground.thing);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x50)), &still.?.successor.?);
}

test "IX — a cargo and a word go over the wire by the notation's own rules" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    const a = ground.arena.allocator();

    const sent = aCargo(&ground, ground.thing_digest);
    const raw = try warden.encodeCargo(a, sent);
    var decoded = try warden.decodeCargo(gpa, raw);
    defer decoded.deinit();
    const back = decoded.cargo;
    try std.testing.expectEqualSlices(u8, &sent.being, &back.being);
    try std.testing.expectEqualSlices(u8, &sent.digest, &back.digest);
    try std.testing.expectEqualSlices(u8, sent.cells, back.cells);
    try std.testing.expectEqual(@as(usize, 1), back.standings.len);
    try std.testing.expectEqual(@as(i64, 9), back.standings[0].mark);
    try std.testing.expectEqualSlices(i64, &.{ 4, 6 }, back.standings[0].spent);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x72)), &back.standings[0].padlock.?);
    try std.testing.expectEqualSlices(u8, "quic://back", back.standings[0].hints[0]);
    try std.testing.expectEqual(@as(usize, 1), back.relations.len);
    // Two counters, because one field cannot be two counters.
    try std.testing.expectEqual(@as(i64, 12), back.relations[0].seq);
    try std.testing.expectEqual(@as(i64, 7), back.relations[0].news);

    // And the bytes are the bytes: re-encoding what came back writes the same
    // envelope, which is what makes a cargo a thing two kits can exchange.
    const again = try warden.encodeCargo(a, back);
    try std.testing.expectEqualSlices(u8, raw, again);
}

test "IX — every list in a cargo travels in the derived order, whatever order it was composed in" {
    // A cargo crosses the wire, so two wardens packing one being must produce
    // one byte string. The order is derived rather than chosen: standings by
    // the voice's bytes, relations by the far warden's, beings under a standing
    // by their pk bytes, and spent numerically — all ascending. A record kept
    // in whatever order a map happens to yield is a record that differs from
    // itself between two runs, and nothing could then compare, cache or
    // re-derive it.
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    const a = ground.arena.allocator();

    const low: warden.Standing = .{
        .voice = @splat(0x10),
        .commitment = @splat(0x11),
        .name = @splat(0x12),
        .beings = &.{ @as(Key, @splat(0x20)), @as(Key, @splat(0x02)) },
        .mark = 9,
        .spent = &.{ 6, 4 },
        .hints = &.{"quic://low"},
    };
    const high: warden.Standing = .{
        .voice = @splat(0x90),
        .commitment = @splat(0x91),
        .name = @splat(0x92),
        .beings = &.{@as(Key, @splat(0x03))},
        .mark = 2,
        .spent = &.{1},
        .hints = &.{"quic://high"},
    };
    const near: warden.Relation = .{
        .warden = @splat(0x30),
        .commitment = @splat(0x31),
        .padlock = @splat(0x32),
        .voice = @splat(0x33),
        .secret = @splat(0x34),
        .heir = @splat(0x35),
        .heir_secret = @splat(0x36),
    };
    const far: warden.Relation = .{
        .warden = @splat(0xa0),
        .commitment = @splat(0xa1),
        .padlock = @splat(0xa2),
        .voice = @splat(0xa3),
        .secret = @splat(0xa4),
        .heir = @splat(0xa5),
        .heir_secret = @splat(0xa6),
    };

    const scrambled = try warden.encodeCargo(a, .{
        .being = @splat(0x50),
        .digest = ground.thing_digest,
        .cells = "remembered",
        .standings = &.{ high, low },
        .relations = &.{ far, near },
    });
    const ordered = try warden.encodeCargo(a, .{
        .being = @splat(0x50),
        .digest = ground.thing_digest,
        .cells = "remembered",
        .standings = &.{ low, high },
        .relations = &.{ near, far },
    });
    try std.testing.expectEqualSlices(u8, ordered, scrambled);

    // And the order the bytes are in is the derived one, not merely a stable
    // one: what comes back reads lowest first, at every level.
    var decoded = try warden.decodeCargo(gpa, scrambled);
    defer decoded.deinit();
    const back = decoded.cargo;
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x10)), &back.standings[0].voice);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x02)), &back.standings[0].beings[0]);
    try std.testing.expectEqualSlices(i64, &.{ 4, 6 }, back.standings[0].spent);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x30)), &back.relations[0].warden);
}

// ------------------------------ XII-8, the warden answers its own fields

/// Judge a letter and spend whatever the warden's own being was asked for.
/// Nothing between the two is a host's: the point of these cases is that a
/// caller reaching the door needs no knowledge of the Warden blueprint to be
/// answered by it.
fn ownAnswer(ground: *Ground, a: std.mem.Allocator, l: Ground.Letter) !?[]u8 {
    var verdict = try ground.door.judge(try ground.letter(l));
    defer verdict.deinit();
    return ground.door.own(a, verdict);
}

test "IX — every field of the warden's own blueprint is answered by the warden itself" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();
    var shapes = try notation.parse(a, warden.blueprint_text);
    defer shapes.deinit();

    const held = ground.voice.secret;
    const being_arg = try wire.encode(a, "being", shapes.records, .{ .being = ground.thing });

    // Every answer below is read back as the type the field declares, which
    // is the whole of what the warden promised to write.
    const described = (try ownAnswer(&ground, a, .{
        .voice_secret = held,
        .seq = 1,
        .method = .{ .name = "describe", .args = "" },
    })).?;
    const estate = try warden.encodeEstate(a, try ground.door.estateFor(a, ground.voice.public));
    try std.testing.expectEqualSlices(u8, estate, described);

    const limit = (try ownAnswer(&ground, a, .{
        .voice_secret = held,
        .seq = 2,
        .method = .{ .name = "limit", .args = "" },
    })).?;
    var read_limit = try wire.decode(a, "int", shapes.records, limit);
    defer read_limit.deinit();
    try std.testing.expectEqual(@as(i64, @intCast(ground.door.limit)), read_limit.value.integer);

    const sketched = (try ownAnswer(&ground, a, .{
        .voice_secret = held,
        .seq = 3,
        .method = .{ .name = "sketch", .args = being_arg },
    })).?;
    var read_sketch = try wire.decode(a, "sketch?", shapes.records, sketched);
    defer read_sketch.deinit();
    const fields = read_sketch.value.present.record;
    try std.testing.expectEqualSlices(u8, &ground.thing, &fields[0].being);
    try std.testing.expectEqualSlices(u8, &ground.thing_digest, &fields[1].b32);

    const digest_arg = try wire.encode(a, "b32", shapes.records, .{ .b32 = ground.thing_digest });
    const text = (try ownAnswer(&ground, a, .{
        .voice_secret = held,
        .seq = 4,
        .method = .{ .name = "blueprint", .args = digest_arg },
    })).?;
    var read_text = try wire.decode(a, "text?", shapes.records, text);
    defer read_text.deinit();
    try std.testing.expectEqualStrings("Thing\n  poke() int\n", read_text.value.present.text);

    // A legal ask has a legal answer: nothing has moved, so `moved` answers
    // absence rather than silence.
    const nowhere = (try ownAnswer(&ground, a, .{
        .voice_secret = held,
        .seq = 5,
        .method = .{ .name = "moved", .args = being_arg },
    })).?;
    var read_nowhere = try wire.decode(a, "word?", shapes.records, nowhere);
    defer read_nowhere.deinit();
    try std.testing.expect(read_nowhere.value == .absent);

    try ground.door.publish(ground.thing, .{ .being = ground.thing, .successor = @splat(0x44) });
    const pointed = (try ownAnswer(&ground, a, .{
        .voice_secret = held,
        .seq = 6,
        .method = .{ .name = "moved", .args = being_arg },
    })).?;
    var read_pointed = try wire.decode(a, "word?", shapes.records, pointed);
    defer read_pointed.deinit();
    const word = read_pointed.value.present.record;
    try std.testing.expectEqualSlices(u8, &ground.thing, &word[0].present.being);
    try std.testing.expectEqualSlices(u8, &@as(Key, @splat(0x44)), &word[1].present.b32);
}

test "IX — a name the warden's blueprint does not declare is silence" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    // Anything the blueprint does not declare does not exist for the being it
    // describes, and the warden's own being is no exception.
    try std.testing.expectError(warden.Error.Refused, ownAnswer(&ground, a, .{
        .voice_secret = ground.voice.secret,
        .seq = 1,
        .method = .{ .name = "poke", .args = "" },
    }));

    // Including a name that is a field of some other class this door holds.
    try std.testing.expectError(warden.Error.Refused, ownAnswer(&ground, a, .{
        .voice_secret = ground.voice.secret,
        .seq = 2,
        .being = ground.door.name,
        .method = .{ .name = "poke", .args = "" },
    }));

    // A surplus byte to a field that takes none is refused everywhere.
    try std.testing.expectError(warden.Error.Refused, ownAnswer(&ground, a, .{
        .voice_secret = ground.voice.secret,
        .seq = 3,
        .method = .{ .name = "describe", .args = "\x00" },
    }));
}

test "XII — step 8, the warden's own being answers to both of its addresses" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.admit();

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    // Naming the public being is the ordinary form and omitting it the
    // shortcut, so the two are one answer.
    const shortcut = (try ownAnswer(&ground, a, .{
        .voice_secret = ground.voice.secret,
        .seq = 1,
        .method = .{ .name = "limit", .args = "" },
    })).?;
    const named = (try ownAnswer(&ground, a, .{
        .voice_secret = ground.voice.secret,
        .seq = 2,
        .being = ground.door.name,
        .method = .{ .name = "limit", .args = "" },
    })).?;
    try std.testing.expectEqualSlices(u8, shortcut, named);
}

test "XIV — news is believed by the warden, and answers no bytes at all" {
    const gpa = std.testing.allocator;
    var ground = try Ground.init(gpa);
    defer ground.deinit();
    try ground.relate();

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    const args = try warden.encodeWord(a, .{ .padlock = @splat(0x77) });
    // `tell` declares no answer, and a field that answers nothing answers
    // nothing — not an absent optional, no bytes.
    try std.testing.expectEqual(@as(?[]u8, null), try ownAnswer(&ground, a, .{
        .voice_secret = ground.far.secret,
        .seq = 1,
        .method = .{ .name = "tell", .args = args },
    }));
    try std.testing.expectEqualSlices(
        u8,
        &@as(Key, @splat(0x77)),
        &ground.door.outbound.items[0].padlock,
    );
}
