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
