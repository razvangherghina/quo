//! Part one of `papers/quo-truth.md`: what the warden provides. Written from
//! that part alone. Every case here is one of its sentences made checkable.

const std = @import("std");
const warden = @import("warden");
const quo = @import("quo");
const host = @import("host");

const Key = warden.Key;

fn still() i64 {
    return 1_000;
}

var draws: u64 = 0;

fn random() Key {
    // Seeds a bench can repeat. Nothing here is a key: the arithmetic derives
    // every key from what this hands it.
    draws += 1;
    var out: Key = undefined;
    var seed = draws *% 0x9e3779b97f4a7c15;
    for (&out) |*byte| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        byte.* = @truncate(seed >> 33);
    }
    return out;
}

const COUNTER =
    \\Counter
    \\  bump() int
    \\  read() int
    \\
;

const Counter = struct {
    quo: quo.Cell = .{},
    n: i64 = 0,
    seen_voice: ?Key = null,
    seen_kind: ?warden.Kind = null,

    pub fn bump(self: *Counter, at: *quo.At) i64 {
        if (at.caller) |who| {
            self.seen_voice = who.voice;
            self.seen_kind = who.kind;
        }
        self.n += 1;
        return self.n;
    }

    pub fn read(self: *Counter) i64 {
        return self.n;
    }
};

/// Two grounds in one process, each under its own host, reaching the other at
/// distance zero. No socket, and no step waived.
const Pair = struct {
    gpa: std.mem.Allocator,
    threaded: std.Io.Threaded,
    here: host.Host = undefined,
    there: host.Host = undefined,
    alice: *warden.Warden = undefined,
    bob: *warden.Warden = undefined,

    fn init(gpa: std.mem.Allocator, self: *Pair) !void {
        self.* = .{ .gpa = gpa, .threaded = .init(gpa, .{}) };
        const io = self.threaded.io();
        try host.Host.open(gpa, opening(io), &self.here);
        try host.Host.open(gpa, opening(io), &self.there);
        self.alice = &self.here.door;
        self.bob = &self.there.door;
    }

    fn opening(io: std.Io) host.Opening {
        return .{
            .seeds = host.seeds(random),
            .clock = still,
            .random = random,
            .io = io,
            .roads = &.{.memory},
        };
    }

    fn deinit(self: *Pair) void {
        self.here.close();
        self.there.close();
        self.threaded.deinit();
    }
};

fn walk(door: *warden.Warden) quo.At {
    return .{ .door = door, .being = door.name, .gpa = std.testing.allocator };
}

/// Accept an invitation that opens one being, and keep a label beside it. A
/// standing naming exactly one being is what `only` answers.
fn joining(
    door: *warden.Warden,
    gpa: std.mem.Allocator,
    invitation: warden.Invitation,
    label: []const u8,
) !quo.Handle {
    var accepted = (try quo.accepting(door, gpa, invitation, walk(door))).?;
    defer accepted.deinit();
    const handle = accepted.only().?;
    try walk(door).label(label, handle);
    return handle;
}

test "one entry point takes any arriving bytes and answers bytes or silence" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var counter: Counter = .{};
    const held = try quo.holding(pair.alice, Counter, &counter, COUNTER, .{}, gpa);
    const invitation = try held.under.grant(gpa, null);
    defer gpa.free(invitation.hints);

    var handle = try joining(pair.bob, gpa, invitation, "counter");
    try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "bump", .{}));

    // Garbage arriving is silence, and the door says nothing about why.
    try std.testing.expect(pair.alice.arrive(gpa, "not an envelope", null) == null);
    try std.testing.expect(pair.alice.arrive(gpa, "", null) == null);
}

test "the closure offers the caller as a fact: holder, rotation or stranger" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var counter: Counter = .{};
    const held = try quo.holding(pair.alice, Counter, &counter, COUNTER, .{}, gpa);
    const invitation = try held.under.grant(gpa, null);
    defer gpa.free(invitation.hints);
    var handle = try joining(pair.bob, gpa, invitation, "counter");

    // Accepting is two rotations; the first call after it is a plain ask.
    _ = try handle.call(gpa, i64, "bump", .{});
    try std.testing.expectEqual(warden.Kind.holder, counter.seen_kind.?);
    try std.testing.expect(counter.seen_voice != null);
}

test "standings are offered as voices only" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var counter: Counter = .{};
    const held = try quo.holding(pair.alice, Counter, &counter, COUNTER, .{}, gpa);

    const none = try held.under.standings(gpa);
    defer gpa.free(none);
    try std.testing.expectEqual(@as(usize, 0), none.len);

    const invitation = try held.under.grant(gpa, null);
    defer gpa.free(invitation.hints);
    _ = try joining(pair.bob, gpa, invitation, "counter");

    const one = try held.under.standings(gpa);
    defer gpa.free(one);
    try std.testing.expectEqual(@as(usize, 1), one.len);
    // A voice and nothing beside it: `[]Key` carries no mark, no window, no
    // padlock and no hint, and there is nowhere here to put one.
    try std.testing.expect(@TypeOf(one) == []Key);
}

test "grant names the being it opens, and release takes every standing with it" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var counter: Counter = .{};
    var other: Counter = .{};
    const one = try quo.holding(pair.alice, Counter, &counter, COUNTER, .{}, gpa);
    const two = try quo.holding(pair.alice, Counter, &other, COUNTER, .{}, gpa);

    const invitation = try one.under.grant(gpa, two.being());
    defer gpa.free(invitation.hints);
    var handle = try joining(pair.bob, gpa, invitation, "other");
    try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "bump", .{}));

    // Bob reaches `other` and not `counter`.
    const at_two = try two.under.standings(gpa);
    defer gpa.free(at_two);
    const at_one = try one.under.standings(gpa);
    defer gpa.free(at_one);
    try std.testing.expectEqual(@as(usize, 1), at_two.len);
    try std.testing.expectEqual(@as(usize, 0), at_one.len);

    // Released: Bob's next call meets silence, indistinguishable from
    // anything else.
    try std.testing.expect(one.under.release(two.being()));
    try std.testing.expect((try handle.call(gpa, i64, "bump", .{})) == null);
}

test "hold mints a smaller being beside me and relation reaches it through the handle" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var counter: Counter = .{};
    var small: Counter = .{};
    const held = try quo.holding(pair.alice, Counter, &counter, COUNTER, .{}, gpa);
    const beside = try held.under.hold(Counter, &small, COUNTER, "small");

    // Same warden, same shape: leashed, a value or silence, no seal paid.
    try std.testing.expectEqual(@as(?i64, 1), try beside.call(gpa, i64, "bump", .{}));
    const by_label = held.under.relation("small").?;
    try std.testing.expectEqual(@as(?i64, 1), try by_label.call(gpa, i64, "read", .{}));

    try std.testing.expect(held.under.release(beside.being()));
    try std.testing.expect((try beside.call(gpa, i64, "read", .{})) == null);
    try std.testing.expect(held.under.relation("small") == null);
}

const Watcher = struct {
    heard: std.ArrayList([]const u8) = .empty,
    gpa: std.mem.Allocator,

    fn observer(self: *Watcher) warden.Observer {
        return .{ .context = @ptrCast(self), .hush = hush };
    }

    fn hush(context: *anyopaque, reason: []const u8) void {
        const self: *Watcher = @ptrCast(@alignCast(context));
        self.heard.append(self.gpa, reason) catch {};
    }
};

test "why it fell silent is told inward, and nothing crosses the wire" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var watcher: Watcher = .{ .gpa = gpa };
    defer watcher.heard.deinit(gpa);
    pair.alice.observe(watcher.observer());

    try std.testing.expect(pair.alice.arrive(gpa, "garbage", null) == null);
    try std.testing.expect(watcher.heard.items.len >= 1);
}

test "a hint is stored and carried as an opaque string, never parsed" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var counter: Counter = .{};
    const held = try quo.holding(pair.alice, Counter, &counter, COUNTER, .{}, gpa);
    try pair.alice.publishRoad("anything at all, even this");

    const invitation = try held.under.grant(gpa, null);
    defer gpa.free(invitation.hints);
    var carried = false;
    for (invitation.hints) |one| {
        if (std.mem.eql(u8, one, "anything at all, even this")) carried = true;
    }
    try std.testing.expect(carried);

    // Delivery walks past what it cannot speak; the door still answers on the
    // road it can.
    var handle = try joining(pair.bob, gpa, invitation, "counter");
    try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "bump", .{}));
}

test "what delivery is given per row is the way back and nothing else" {
    const gpa = std.testing.allocator;
    var pair: Pair = undefined;
    try Pair.init(gpa, &pair);
    defer pair.deinit();

    var counter: Counter = .{};
    const held = try quo.holding(pair.alice, Counter, &counter, COUNTER, .{}, gpa);
    const invitation = try held.under.grant(gpa, null);
    defer gpa.free(invitation.hints);
    var handle = try joining(pair.bob, gpa, invitation, "counter");
    // The bytes went down through delivery and the answer came back up it, so
    // what follows is about a road that carried rather than an absent one.
    try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "bump", .{}));

    // A padlock and some opaque strings. `warden.Row` has two fields and
    // there is nowhere in it to put a secret.
    try std.testing.expectEqual(@as(usize, 2), @typeInfo(warden.Row).@"struct".fields.len);

    // And the row is all delivery is handed beside the envelope: four
    // parameters, and no key, no voice and no seal among them.
    const Send = @typeInfo(@FieldType(warden.Delivery, "send")).pointer.child;
    const params = @typeInfo(Send).@"fn".params;
    try std.testing.expectEqual(@as(usize, 4), params.len);
    try std.testing.expect(params[2].type.? == warden.Row);
    try std.testing.expect(params[3].type.? == []const u8);
}

test "what must survive a restart lives in the store the host handed in" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var kept: host.MemoryStore = .{ .gpa = gpa };
    defer kept.deinit();

    const alice_seeds = host.seeds(random);
    const being_seed = random();

    var there: host.Host = undefined;
    try host.Host.open(gpa, Pair.opening(io), &there);
    defer there.close();
    const bob = &there.door;

    var spent: warden.Warden.Sealed = undefined;
    var handle: quo.Handle = undefined;

    // The ground stands on a road it publishes from its own name, so the one
    // it comes back on after the restart is the one its peer already holds.
    const alice_opening: host.Opening = .{
        .seeds = alice_seeds,
        .clock = still,
        .random = random,
        .io = io,
        .roads = &.{.memory},
        .store = kept.store(),
    };

    {
        var here: host.Host = undefined;
        try host.Host.open(gpa, alice_opening, &here);

        var counter: Counter = .{};
        const held = try quo.holding(
            &here.door,
            Counter,
            &counter,
            COUNTER,
            .{ .seed = being_seed },
            gpa,
        );
        const invitation = try held.under.grant(gpa, null);
        defer gpa.free(invitation.hints);
        handle = try joining(bob, gpa, invitation, "counter");
        try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "bump", .{}));

        spent = (try handle.seal(gpa, "bump", .{})).?;
        try std.testing.expectEqual(@as(?i64, 2), try handle.send(gpa, i64, "bump", spent));
        here.close();
    }

    // The process dies. A new ground opens on the same seeds and the same
    // store, holds the same object again, and Bob's standing is still there.
    var again: host.Host = undefined;
    try host.Host.open(gpa, alice_opening, &again);
    defer again.close();

    var counter: Counter = .{};
    const held = try quo.holding(&again.door, Counter, &counter, COUNTER, .{ .seed = being_seed }, gpa);
    const standing = try held.under.standings(gpa);
    defer gpa.free(standing);
    try std.testing.expectEqual(@as(usize, 1), standing.len);

    // The object is new, so its own count starts again; the standing did not.
    try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "bump", .{}));

    // The marks survived too: the envelope spent before the restart is
    // silence.
    try std.testing.expect((try handle.send(gpa, i64, "bump", spent)) == null);
    spent.deinit(gpa);
}

/// A road that never answers in the response it hands back: whatever it
/// carries returns through the far door on somebody else's thread.
fn carriedOnward(
    _: *anyopaque,
    _: std.mem.Allocator,
    _: warden.Row,
    _: []const u8,
) std.mem.Allocator.Error!warden.Carried {
    return .later;
}

var nowhere: u8 = 0;

fn answersLater() warden.Delivery {
    return .{ .context = @ptrCast(&nowhere), .send = carriedOnward, .later = true };
}

test "a road that answers through the door is refused at open when no platform came with it" {
    const gpa = std.testing.allocator;

    // The refusal is at the opening, not at the ask: a warden with no
    // platform has no thread to bring an answer in and nothing to wait on, so
    // the fault is in what the host handed over and is named there.
    try std.testing.expectError(error.Refused, warden.Warden.open(gpa, .{
        .seeds = host.seeds(random),
        .clock = still,
        .random = random,
        .delivery = answersLater(),
    }));

    // And the same delivery with a platform beside it opens, so what is
    // refused is the pairing and never the road.
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    var door = try warden.Warden.open(gpa, .{
        .seeds = host.seeds(random),
        .clock = still,
        .random = random,
        .io = threaded.io(),
        .delivery = answersLater(),
    });
    door.deinit();
}

/// A road that answers in the response it hands back, which is what every
/// road that is one call does.
fn carriedHere(
    _: *anyopaque,
    _: std.mem.Allocator,
    _: warden.Row,
    _: []const u8,
) std.mem.Allocator.Error!warden.Carried {
    return .silence;
}

test "a delivery that answers in its response needs no platform, and opens without one" {
    const gpa = std.testing.allocator;

    var door = try warden.Warden.open(gpa, .{
        .seeds = host.seeds(random),
        .clock = still,
        .random = random,
        .delivery = .{ .context = @ptrCast(&nowhere), .send = carriedHere, .later = false },
    });
    door.deinit();
}
