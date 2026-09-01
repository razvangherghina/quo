//! A being migrated away, end to end, and the peer that follows it.
//!
//! Articles XIII and XIV. **Migration is a double rotation**: to the committed
//! heir, then immediately to a key the destination warden generated and the
//! origin never saw. It is **one message sent twice** — once by the origin,
//! once by the destination — and after it every key the old warden held for
//! the being is dead.
//!
//! Nothing here stops at the routing. Three houses stand in one process: the
//! cargo is packed, spent as a real `receive` through the destination's door,
//! announced twice as real sealed envelopes, judged and believed at the third
//! house, and that house then reaches the being at its new address and hears
//! its answer.

const std = @import("std");
const arithmetic = @import("arithmetic");
const envelope = @import("envelope");
const notation = @import("notation");
const wire = @import("wire");
const warden = @import("warden");

const Key = warden.Key;

const LAMP = "Lamp\n  lit() int\n";

fn seed(byte: u8) Key {
    return @splat(byte);
}

fn pk(secret: Key) !Key {
    return (try arithmetic.signingPair(secret)).public;
}

fn door(gpa: std.mem.Allocator, name_seed: u8, padlock_seed: u8, heir_seed: u8) !warden.Warden {
    const name = try arithmetic.signingPair(seed(name_seed));
    const padlock = try arithmetic.sealingPair(seed(padlock_seed));
    var self: warden.Warden = .{
        .gpa = gpa,
        .name = name.public,
        .name_secret = name.secret,
        .padlock = padlock.public,
        .padlock_secret = padlock.secret,
        .limit = 1 << 16,
        .width = 8,
    };
    // The public being's pk is the warden's own name, and it wears the one
    // blueprint every warden holds.
    try self.beings.append(gpa, .{
        .pk = name.public,
        .secret = name.secret,
        .digest = warden.digest(),
        .commitment = arithmetic.commitment(name.public, try pk(seed(heir_seed))),
        .text = warden.blueprint_text,
    });
    return self;
}

/// Let a voice in at a being, the way a grant does: the row, the commitment to
/// the heir it will rotate onto, and the name that commitment was minted at.
fn admit(d: *warden.Warden, gpa: std.mem.Allocator, voice: Key, heir: Key, being: Key) !void {
    var row: warden.Inbound = .{
        .voice = voice,
        .commitment = arithmetic.commitment(d.name, heir),
        .minted_name = d.name,
        .window = .{ .width = d.width },
    };
    try row.beings.append(gpa, being);
    try d.inbound.append(gpa, row);
}

/// One turn of a door that answers for itself: judge, serve, seal.
fn served(d: *warden.Warden, gpa: std.mem.Allocator, letter: []const u8, ephemeral: Key) ![]u8 {
    var verdict = try d.judge(letter);
    defer verdict.deinit();
    const data = try d.own(gpa, verdict);
    defer if (data) |bytes| gpa.free(bytes);
    return d.answer(gpa, ephemeral, verdict.say, data);
}

/// The three houses, and everything that stands before anything moves.
const World = struct {
    gpa: std.mem.Allocator,
    arena: std.heap.ArenaAllocator,
    origin: warden.Warden,
    destination: warden.Warden,
    peer: warden.Warden,
    /// The being that travels, and the heir the origin committed to for it.
    traveller: Key,
    committed: Key,
    digest: Key,
    /// The peer's row at the origin, and the origin's at the destination.
    at_origin: usize,
    at_destination: usize,

    /// The keys the destination will mint the arriving being under, which the
    /// origin never sees.
    const minted_being: u8 = 0x90;
    const minted_heir: u8 = 0x91;
    /// The heir the peer's invitation committed, which its first rotation
    /// moves it onto — so this is the voice the peer stands on afterwards.
    const peer_voice: u8 = 0x33;

    fn init(gpa: std.mem.Allocator) !World {
        var self: World = .{
            .gpa = gpa,
            .arena = std.heap.ArenaAllocator.init(gpa),
            .origin = try door(gpa, 0x01, 0x02, 0x03),
            .destination = try door(gpa, 0x11, 0x12, 0x13),
            .peer = try door(gpa, 0x21, 0x22, 0x23),
            .traveller = try pk(seed(0x30)),
            .committed = try pk(seed(0x31)),
            .digest = arithmetic.hash(LAMP),
            .at_origin = 0,
            .at_destination = 0,
        };
        errdefer self.deinit();
        const a = self.arena.allocator();

        try self.origin.beings.append(gpa, .{
            .pk = self.traveller,
            .secret = seed(0x30),
            .digest = self.digest,
            .commitment = arithmetic.commitment(self.origin.name, self.committed),
            .text = LAMP,
        });

        // A peer let in at that being, and its first act: a rotation onto a
        // key the granter has never seen. That is how the origin learns the
        // way back to it, and both facts travel in the cargo.
        try admit(&self.origin, gpa, try pk(seed(0x32)), try pk(seed(peer_voice)), self.traveller);
        self.at_origin = try self.peer.remember(.{
            .warden = self.origin.name,
            .commitment = arithmetic.commitment(self.origin.name, try pk(seed(peer_voice))),
            .padlock = self.origin.padlock,
            .heir = try pk(seed(peer_voice)),
            .heir_secret = seed(peer_voice),
            .hints = &.{"https://origin.example"},
        });
        const first, _ = try self.peer.rotate(a, self.at_origin, seed(0x34), seed(0x35), .{
            .being = self.traveller,
            .method = .{ .name = "lit", .args = "" },
            .hints = &.{"https://peer.example"},
        });
        var opening = try self.origin.judge(first);
        defer opening.deinit();
        if (opening.routing != .invoke) return error.TestUnexpectedResult;

        // The commitment a describe hands over, without which the peer holds
        // no material to believe this being's succession.
        try self.peer.note(
            self.at_origin,
            self.traveller,
            arithmetic.commitment(self.origin.name, self.committed),
        );

        // The destination is armed for the class — the digest identifies
        // rather than delivers — and holds a standing for the origin to spend
        // `receive` with.
        _ = try self.destination.arm(.{
            .digest = self.digest,
            .text = LAMP,
            .secret = seed(minted_being),
            .heir_secret = seed(minted_heir),
        });
        try admit(
            &self.destination,
            gpa,
            try pk(seed(0x36)),
            try pk(seed(0x37)),
            self.destination.name,
        );
        self.at_destination = try self.origin.remember(.{
            .warden = self.destination.name,
            .commitment = arithmetic.commitment(self.destination.name, try pk(seed(0x37))),
            .padlock = self.destination.padlock,
            .heir = try pk(seed(0x37)),
            .heir_secret = seed(0x37),
            .hints = &.{},
        });
        return self;
    }

    fn deinit(self: *World) void {
        self.origin.deinit();
        self.destination.deinit();
        self.peer.deinit();
        self.arena.deinit();
    }

    /// Spend a cargo through the destination's door, and read back the
    /// commitment `receive` answers with.
    fn receive(self: *World, cargo: warden.Cargo) !Key {
        const a = self.arena.allocator();
        const packed_bytes = try warden.encodeCargo(a, cargo);
        const letter, _ = try self.origin.rotate(a, self.at_destination, seed(0x38), seed(0x39), .{
            .method = .{ .name = "receive", .args = packed_bytes },
        });
        const sealed = try served(&self.destination, a, letter, seed(0x77));
        var heard = try self.origin.hear(a, sealed);
        defer heard.deinit();
        var minted = try wire.decode(
            a,
            "b32",
            (try shapes(a)).records,
            heard.payload.answer.data orelse return error.TestUnexpectedResult,
        );
        defer minted.deinit();
        return minted.value.b32;
    }

    /// One piece of news carried to the peer and believed there.
    fn believed(self: *World, from: *warden.Warden, t: warden.Warden.Tell, ephemeral: u8) !void {
        const a = self.arena.allocator();
        const letter = try from.news(a, seed(ephemeral), t);
        var verdict = try self.peer.judge(letter);
        defer verdict.deinit();
        if (verdict.placement != .news) return error.TestUnexpectedResult;
        const data = try self.peer.own(a, verdict);
        if (data != null) return error.TestUnexpectedResult;
    }
};

fn shapes(a: std.mem.Allocator) !notation.Blueprint {
    return notation.parse(a, warden.blueprint_text);
}

test "XIII — a being is migrated away, and its peer follows it" {
    const gpa = std.testing.allocator;
    var w = try World.init(gpa);
    defer w.deinit();
    const a = w.arena.allocator();

    // The cargo is packed under the name the first rotation gives the being,
    // so the second rotation succeeds the name the peer holds by then.
    const cargo = try w.origin.pack(a, w.traveller, w.committed, "a lamp's own memory");
    try std.testing.expectEqualSlices(u8, &w.committed, &cargo.being);
    try std.testing.expectEqualStrings("a lamp's own memory", cargo.cells);
    try std.testing.expectEqual(@as(usize, 1), cargo.standings.len);
    // The row travels under the name the cargo is packed under, and the replay
    // record travels whole, or every spent number comes round again.
    try std.testing.expectEqualSlices(Key, &.{w.committed}, cargo.standings[0].beings);
    try std.testing.expectEqual(@as(i64, 1), cargo.standings[0].mark);
    // The way back travels with the standing, or the destination could not
    // speak to the peer that arrived with it.
    try std.testing.expectEqualSlices(u8, &w.peer.padlock, &cargo.standings[0].padlock.?);

    // A cargo packed under any other name is refused: the destination would be
    // left succeeding a name no peer holds a commitment for.
    try std.testing.expectError(
        warden.Error.Refused,
        w.origin.pack(a, w.traveller, try pk(seed(0x7e)), ""),
    );

    const commitment = try w.receive(cargo);
    const arrived_as = try pk(seed(World.minted_being));
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(w.destination.name, arrived_as),
        &commitment,
    );

    // The destination's half. The word is composed by the kit and not by the
    // host: a house that had to invent the announcement would invent a
    // different one at every ground.
    const landing = try w.destination.landed(a, &.{"https://landing.example"});
    try std.testing.expectEqualSlices(u8, &arrived_as, &landing.being);
    try std.testing.expectEqualSlices(u8, &cargo.being, &landing.word.being.?);
    try std.testing.expectEqualSlices(u8, &arrived_as, &landing.word.successor.?);
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(w.destination.name, try pk(seed(World.minted_heir))),
        &landing.word.commitment.?,
    );
    try std.testing.expectEqual(@as(usize, 1), landing.peers.len);
    try std.testing.expectEqualSlices(u8, &w.peer.padlock, &landing.peers[0].padlock.?);

    // The origin's half, carrying as its next commitment the one `receive`
    // answered — the one fact it cannot invent.
    const departed = try w.origin.depart(a, w.traveller, .{
        .heir = w.committed,
        .commitment = commitment,
        .name = w.destination.name,
        .padlock = w.destination.padlock,
        .hints = &.{"https://landing.example"},
    });
    try std.testing.expectEqualSlices(u8, &w.committed, &departed.word.successor.?);
    try std.testing.expectEqual(@as(usize, 1), departed.peers.len);

    // The first news, signed by the being's committed heir.
    try w.believed(&w.origin, .{
        .peer = departed.peers[0],
        .voice_secret = seed(0x31),
        .word = departed.word,
        .seq = 1,
    }, 0x40);

    // Believed news rewrites the row entire, and the being's own entry with
    // it: the peer now stands at the house that took the being in.
    const row = w.peer.outbound.items[w.at_origin];
    try std.testing.expectEqualSlices(u8, &w.destination.name, &row.warden);
    try std.testing.expectEqualSlices(u8, &w.destination.padlock, &row.padlock);
    try std.testing.expectEqualStrings("https://landing.example", row.hints[0]);
    try std.testing.expectEqualSlices(u8, &w.committed, &row.beings.items[0].being);
    try std.testing.expectEqualSlices(u8, &commitment, &row.beings.items[0].commitment);

    // And the second, from the new house itself, signed by the key it
    // generated and the origin never saw. A being's succession starts the news
    // mark fresh, so it counts from one again.
    try w.believed(&w.destination, .{
        .peer = landing.peers[0],
        .voice_secret = landing.secret,
        .word = landing.word,
        .seq = 1,
        .hints = &.{"https://landing.example"},
    }, 0x41);
    try std.testing.expectEqualSlices(
        u8,
        &arrived_as,
        &w.peer.outbound.items[w.at_origin].beings.items[0].being,
    );

    // The whole point of the move: the peer reaches the being at its new
    // house, by the name that house minted, and hears its answer.
    const asking, _ = try w.peer.ask(a, w.at_origin, seed(0x42), .{
        .being = arrived_as,
        .method = .{ .name = "lit", .args = "" },
    });
    var verdict = try w.destination.judge(asking);
    defer verdict.deinit();
    switch (verdict.routing) {
        .invoke => |call| {
            try std.testing.expectEqualSlices(u8, &arrived_as, &call.being);
            try std.testing.expectEqualStrings("lit", call.method.name);
        },
        else => return error.TestUnexpectedResult,
    }
    const reply = try w.destination.answer(a, seed(0x43), verdict.say, "lit");
    var heard = try w.peer.hear(a, reply);
    defer heard.deinit();
    try std.testing.expectEqualStrings("lit", heard.payload.answer.data.?);

    // Both doors point, and neither vouches for the other: each answers only
    // with a succession it composed itself.
    const holder = try pk(seed(World.peer_voice));
    const pointed = (try w.origin.movedFor(holder, w.traveller)).?;
    try std.testing.expectEqualSlices(u8, &w.committed, &pointed.successor.?);
    const onward = (try w.destination.movedFor(holder, cargo.being)).?;
    try std.testing.expectEqualSlices(u8, &arrived_as, &onward.successor.?);
    try std.testing.expectEqualStrings("https://landing.example", onward.hints[0]);
}

test "XIII — the old door only points, and meets every other ask with silence" {
    const gpa = std.testing.allocator;
    var w = try World.init(gpa);
    defer w.deinit();
    const a = w.arena.allocator();

    _ = try w.origin.depart(a, w.traveller, .{
        .heir = w.committed,
        .commitment = seed(0x09),
        .name = w.destination.name,
        .padlock = w.destination.padlock,
    });
    // The relations went with the cargo, so the old door holds no voice of the
    // being's any more and can spend nothing on its behalf.
    try std.testing.expectEqual(@as(usize, 0), w.origin.forget(w.traveller));

    const asking, _ = try w.peer.ask(a, w.at_origin, seed(0x60), .{
        .being = w.traveller,
        .method = .{ .name = "lit", .args = "" },
    });
    try std.testing.expectError(warden.Error.Refused, w.origin.judge(asking));
}

test "XIII — a key that is not the committed heir departs nothing" {
    const gpa = std.testing.allocator;
    var w = try World.init(gpa);
    defer w.deinit();
    const a = w.arena.allocator();

    // A key this door never committed to would compose news nobody can
    // believe, so it never composes one.
    try std.testing.expectError(warden.Error.Refused, w.origin.depart(a, w.traveller, .{
        .heir = try pk(seed(0x7f)),
        .commitment = seed(0x09),
        .name = w.destination.name,
        .padlock = w.destination.padlock,
    }));
    try std.testing.expect(w.origin.being(w.traveller).?.moved == null);
}

test "XIV — a peer that left no way back is told nothing" {
    const gpa = std.testing.allocator;
    var w = try World.init(gpa);
    defer w.deinit();
    const a = w.arena.allocator();

    // A peer that has never spoken left no padlock behind. It is reached by
    // the only means left: it eventually asks, and the door points it.
    try std.testing.expectError(warden.Error.Refused, w.origin.news(a, seed(0x61), .{
        .peer = .{ .voice = try pk(seed(0x32)) },
        .voice_secret = seed(0x31),
        .word = .{ .being = w.traveller },
        .seq = 1,
    }));
}
