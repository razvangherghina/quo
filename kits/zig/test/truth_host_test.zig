//! Part three of `papers/quo-truth.md`: what the host does. The same being,
//! unchanged, is installed under a warden reached by every road this kit has
//! and gives the same answers; a ground that publishes nothing is pushed to
//! down the line it holds; a closed one is weather. Written from that part
//! alone.

const std = @import("std");
const wire = @import("wire");
const warden = @import("warden");
const quo = @import("quo");
const host = @import("host");

const Key = warden.Key;

/// A clock that moves, because the roads here are real and an ask that waits
/// for an answer waits against a budget. It is handed to the host, which
/// hands it to the warden; nothing below reaches for one.
var ticking: std.atomic.Value(i64) = .init(1_000);

fn now() i64 {
    return ticking.fetchAdd(1, .acq_rel);
}

var draws: std.atomic.Value(u64) = .init(0);

fn random() Key {
    var out: Key = undefined;
    var seed = draws.fetchAdd(1, .acq_rel) *% 0x9e3779b97f4a7c15 +% @as(u64, 0x51_7c_c1);
    for (&out) |*byte| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        byte.* = @truncate(seed >> 33);
    }
    return out;
}

fn founding() warden.Warden.Seeds {
    return .{ .name = random(), .padlock = random(), .heir = random() };
}

const DOG =
    \\Dog
    \\  name() text
    \\  logWalk(minutes int) bool
    \\
;

const Dog = struct {
    quo: quo.Cell = .{},
    gpa: std.mem.Allocator,
    walks: std.ArrayList(i64) = .empty,

    pub fn deinit(self: *Dog) void {
        self.walks.deinit(self.gpa);
    }

    pub fn name(_: *Dog) []const u8 {
        return "Rex";
    }

    pub fn logWalk(self: *Dog, minutes: i64) bool {
        self.walks.append(self.gpa, minutes) catch return false;
        return true;
    }
};

const INBOX =
    \\Inbox
    \\  walked(minutes int)
    \\
;

const Inbox = struct {
    quo: quo.Cell = .{},
    gpa: std.mem.Allocator,
    heard: std.ArrayList(i64) = .empty,

    pub fn deinit(self: *Inbox) void {
        self.heard.deinit(self.gpa);
    }

    pub fn walked(self: *Inbox, minutes: i64) void {
        self.heard.append(self.gpa, minutes) catch {};
    }
};

const WALKER =
    \\Walker
    \\  subscribe(inbox invitation) bool
    \\  walk(minutes int) bool
    \\
;

const Walker = struct {
    quo: quo.Cell = .{},

    pub fn subscribe(_: *Walker, at: *quo.At, inbox: wire.Invitation) bool {
        var accepted = (at.accept(inbox) catch return false) orelse return false;
        defer accepted.deinit();
        const listener = accepted.only() orelse return false;
        at.label("inbox", listener) catch return false;
        return true;
    }

    pub fn walk(_: *Walker, at: *quo.At, minutes: i64) bool {
        const inbox = at.relation("inbox") orelse return true;
        _ = inbox.call(at.gpa, void, "walked", .{minutes}) catch {};
        return true;
    }
};

fn stand(gpa: std.mem.Allocator, io: std.Io, roads: []const host.Roads, at: *host.Host) !void {
    return host.Host.open(gpa, .{
        .seeds = founding(),
        .clock = now,
        .random = random,
        .io = io,
        .roads = roads,
    }, at);
}

fn walkFrom(door: *warden.Warden, gpa: std.mem.Allocator) quo.At {
    return .{ .door = door, .being = door.name, .gpa = gpa };
}

/// Accept an invitation that opens one being, under a label of this ground's
/// own.
fn joining(
    door: *warden.Warden,
    gpa: std.mem.Allocator,
    invitation: wire.Invitation,
    label: []const u8,
) !?quo.Handle {
    var accepted = (try quo.accepting(door, gpa, invitation, walkFrom(door, gpa))) orelse
        return null;
    defer accepted.deinit();
    const handle = accepted.only() orelse return null;
    try walkFrom(door, gpa).label(label, handle);
    return handle;
}

// -------------------------------------------------- the same being, any road

test "the same Dog, installed behind every road this kit has, gives the same answers" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    for ([_]host.Roads{ .memory, .http, .line }) |road| {
        var alice: host.Host = undefined;
        try stand(gpa, io, &.{road}, &alice);
        defer alice.close();
        var bob: host.Host = undefined;
        try stand(gpa, io, &.{road}, &bob);
        defer bob.close();

        var rex: Dog = .{ .gpa = gpa };
        defer rex.deinit();
        const held = try quo.holding(&alice.door, Dog, &rex, DOG, .{}, gpa);

        const invitation = try held.under.grant(gpa, null);
        defer gpa.free(invitation.hints);
        const handle = (try joining(&bob.door, gpa, invitation, "rex")) orelse
            return error.TestUnexpectedResult;

        const said = (try handle.call(gpa, []const u8, "name", .{})) orelse
            return error.TestUnexpectedResult;
        defer gpa.free(said);
        try std.testing.expectEqualStrings("Rex", said);
        try std.testing.expectEqual(
            @as(?bool, true),
            try handle.call(gpa, bool, "logWalk", .{@as(i64, 12)}),
        );
        try std.testing.expectEqualSlices(i64, &.{12}, rex.walks.items);

        // The being never learned the road. `quo.At` has no field naming one,
        // and neither has the cell the being holds.
        inline for (@typeInfo(quo.Cell).@"struct".fields) |field| {
            try std.testing.expect(std.mem.indexOf(u8, field.name, "road") == null);
            try std.testing.expect(std.mem.indexOf(u8, field.name, "hint") == null);
        }
    }
}

test "a hint the caller cannot speak is walked past, and the road it can speak carries" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    // Alice publishes a road nobody here can speak, first, and one it can
    // after it.
    var alice: host.Host = undefined;
    try host.Host.open(gpa, .{
        .seeds = founding(),
        .clock = now,
        .random = random,
        .io = io,
        .roads = &.{.memory},
        .hints = &.{"pigeon://loft"},
    }, &alice);
    defer alice.close();
    var bob: host.Host = undefined;
    try stand(gpa, io, &.{.memory}, &bob);
    defer bob.close();

    var rex: Dog = .{ .gpa = gpa };
    defer rex.deinit();
    const held = try quo.holding(&alice.door, Dog, &rex, DOG, .{}, gpa);
    const invitation = try held.under.grant(gpa, null);
    defer gpa.free(invitation.hints);
    try std.testing.expectEqual(@as(usize, 2), invitation.hints.len);
    try std.testing.expectEqualStrings("pigeon://loft", invitation.hints[0]);

    const handle = (try joining(&bob.door, gpa, invitation, "rex")) orelse
        return error.TestUnexpectedResult;
    const said = (try handle.call(gpa, []const u8, "name", .{})) orelse
        return error.TestUnexpectedResult;
    defer gpa.free(said);
    try std.testing.expectEqualStrings("Rex", said);
}

test "a ground that publishes nothing: its pushes ride back down the line it holds" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    // Bob's laptop listens. Alice's tab has no road of its own and dials out.
    var laptop: host.Host = undefined;
    try stand(gpa, io, &.{.line}, &laptop);
    defer laptop.close();
    var tab: host.Host = undefined;
    try stand(gpa, io, &.{}, &tab);
    defer tab.close();
    try std.testing.expectEqual(@as(usize, 0), tab.door.hints.items.len);

    var walker: Walker = .{};
    var inbox: Inbox = .{ .gpa = gpa };
    defer inbox.deinit();
    const at_walker = try quo.holding(&laptop.door, Walker, &walker, WALKER, .{}, gpa);
    const at_inbox = try quo.holding(&tab.door, Inbox, &inbox, INBOX, .{}, gpa);

    const to_walker = try at_walker.under.grant(gpa, null);
    defer gpa.free(to_walker.hints);
    const bob = (try joining(&tab.door, gpa, to_walker, "walker")) orelse
        return error.TestUnexpectedResult;

    const to_inbox = try at_inbox.under.grant(gpa, null);
    defer gpa.free(to_inbox.hints);
    // The tab publishes nothing, so the invitation carries no road at all.
    try std.testing.expectEqual(@as(usize, 0), to_inbox.hints.len);

    try std.testing.expectEqual(
        @as(?bool, true),
        try bob.call(gpa, bool, "subscribe", .{to_inbox}),
    );
    try std.testing.expectEqual(@as(?bool, true), try bob.call(gpa, bool, "walk", .{@as(i64, 9)}));
    try std.testing.expectEqual(@as(?bool, true), try bob.call(gpa, bool, "walk", .{@as(i64, 11)}));
    try std.testing.expectEqualSlices(i64, &.{ 9, 11 }, inbox.heard.items);
}

test "a closed line is weather: the push meets silence, the number is spent, nothing throws" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var laptop: host.Host = undefined;
    try stand(gpa, io, &.{.line}, &laptop);
    defer laptop.close();

    var walker: Walker = .{};
    const at_walker = try quo.holding(&laptop.door, Walker, &walker, WALKER, .{}, gpa);

    var inbox: Inbox = .{ .gpa = gpa };
    defer inbox.deinit();
    {
        var tab: host.Host = undefined;
        try stand(gpa, io, &.{}, &tab);
        defer tab.close();

        const at_inbox = try quo.holding(&tab.door, Inbox, &inbox, INBOX, .{}, gpa);
        const to_walker = try at_walker.under.grant(gpa, null);
        defer gpa.free(to_walker.hints);
        const bob = (try joining(&tab.door, gpa, to_walker, "walker")) orelse
            return error.TestUnexpectedResult;
        const to_inbox = try at_inbox.under.grant(gpa, null);
        defer gpa.free(to_inbox.hints);
        _ = try bob.call(gpa, bool, "subscribe", .{to_inbox});
        _ = try bob.call(gpa, bool, "walk", .{@as(i64, 1)});
    }

    // The tab is gone. Walker's own answer to itself is unaffected; only the
    // push found nobody, and the source cannot tell that from a released
    // being.
    try std.testing.expectEqual(
        @as(?bool, true),
        try at_walker.call(gpa, bool, "walk", .{@as(i64, 2)}),
    );
    try std.testing.expectEqualSlices(i64, &.{1}, inbox.heard.items);
}

test "a road never holds a secret: what the host keeps per peer is an address" {
    // The host's own table is a padlock beside a line, and a padlock is a
    // public key used as an address — the only kind of key a road ever sees.
    // What the warden hands downward is that address and an opaque token, and
    // there is nowhere in the shape of the call to put anything else.
    const arrived = @typeInfo(@FieldType(warden.Delivery, "arrived")).optional.child;
    const params = @typeInfo(@typeInfo(arrived).pointer.child).@"fn".params;
    try std.testing.expectEqual(@as(usize, 3), params.len);
    try std.testing.expectEqual(Key, params[1].type.?);
    try std.testing.expectEqual(?*anyopaque, params[2].type.?);
}
