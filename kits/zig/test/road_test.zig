//! The caller's half of the trap, and the road's own fault.
//!
//! Article VIII names the trap — **the rotation lands at step 4 and the number
//! is judged at step 5** — so a silence coming back after a rotation may mean
//! the takeover already happened. A caller that reads it as "nothing landed"
//! throws away a standing the far door is holding, and the granter's own key
//! stays live at that door. The recovery the law names is to ask again on the
//! new voice.
//!
//! Article III names the other half: **a road that never carried the bytes
//! said neither an answer nor silence**, and a kit reports the road's fault
//! rather than inventing an empty body. Nothing here crosses the wire: it is
//! Article II delivery, each warden's own, and what a caller does with it.

const std = @import("std");
const arithmetic = @import("arithmetic");
const wire = @import("wire");
const warden = @import("warden");
const quo = @import("quo");

const Key = warden.Key;

const TODO = "Todo\n  add() int\n";

const Todo = struct {
    _quo: quo.Cell = .{},
    added: i64 = 0,

    pub fn add(self: *Todo) i64 {
        self.added += 1;
        return self.added;
    }
};

fn still() i64 {
    return 1_000;
}

var draws: u64 = 0;

fn random() Key {
    draws += 1;
    var out: Key = undefined;
    var seed = draws *% 0x9e3779b97f4a7c15;
    for (&out) |*byte| {
        seed = seed *% 6364136223846793005 +% 1442695040888963407;
        byte.* = @truncate(seed >> 33);
    }
    return out;
}

/// The road between the two houses: distance zero, by hand, with the two
/// faults a road can have under the bench's own control. **It opens no seal**
/// — it hands the bytes to the far door's one entry point and gives back
/// whatever comes.
const Wires = struct {
    far: *warden.Warden,
    hint: []const u8 = "mem://granter",
    /// Answers to swallow after the far door has judged the message. This is
    /// the lost answer: the door heard, the number is spent there, and the
    /// caller sees exactly what it sees when a line drops on the way back.
    drop: usize = 0,
    /// The road itself is out: nothing is carried and the far door never
    /// hears.
    down: bool = false,
    sent: usize = 0,

    fn delivery(self: *Wires) warden.Delivery {
        return .{ .context = @ptrCast(self), .send = carry };
    }

    fn carry(
        context: *anyopaque,
        gpa: std.mem.Allocator,
        row: warden.Row,
        letter: []const u8,
    ) std.mem.Allocator.Error!warden.Carried {
        const self: *Wires = @ptrCast(@alignCast(context));
        self.sent += 1;
        if (self.down) {
            const tried = try gpa.alloc([]const u8, 1);
            tried[0] = try gpa.dupe(u8, self.hint);
            return .{ .weather = tried };
        }
        if (!std.mem.eql(u8, &self.far.padlock, &row.padlock)) return .no_road;
        const back = self.far.arrive(gpa, letter, null) orelse return .silence;
        if (self.drop > 0) {
            self.drop -= 1;
            gpa.free(back);
            return .silence;
        }
        return .{ .answered = back };
    }
};

/// What this ground is told inward, and nobody else ever.
const Watcher = struct {
    gpa: std.mem.Allocator,
    reasons: std.ArrayList([]u8) = .empty,
    tried: std.ArrayList([]u8) = .empty,

    fn deinit(self: *Watcher) void {
        for (self.reasons.items) |one| self.gpa.free(one);
        for (self.tried.items) |one| self.gpa.free(one);
        self.reasons.deinit(self.gpa);
        self.tried.deinit(self.gpa);
    }

    fn observer(self: *Watcher) warden.Observer {
        return .{ .context = @ptrCast(self), .hush = hush, .road = road };
    }

    fn hush(context: *anyopaque, reason: []const u8) void {
        const self: *Watcher = @ptrCast(@alignCast(context));
        const kept = self.gpa.dupe(u8, reason) catch return;
        self.reasons.append(self.gpa, kept) catch self.gpa.free(kept);
    }

    fn road(context: *anyopaque, why: warden.RoadFault) void {
        const self: *Watcher = @ptrCast(@alignCast(context));
        const name = switch (why) {
            .weather => "weather",
            .no_road => "no road",
        };
        const kept = self.gpa.dupe(u8, name) catch return;
        self.reasons.append(self.gpa, kept) catch {
            self.gpa.free(kept);
            return;
        };
        const roads = switch (why) {
            .weather => |one| one,
            .no_road => |one| one,
        };
        for (roads) |one| {
            const road_kept = self.gpa.dupe(u8, one) catch return;
            self.tried.append(self.gpa, road_kept) catch self.gpa.free(road_kept);
        }
    }
};

/// Two grounds and the road between them: one holding the being and granting
/// into it, one about to accept.
const World = struct {
    gpa: std.mem.Allocator,
    granter: warden.Warden,
    holder: warden.Warden,
    todo: Todo = .{},
    at_todo: quo.Handle = undefined,
    at_desk: quo.Handle = undefined,
    desk: Todo = .{},
    wires: Wires = undefined,
    watcher: Watcher,

    fn init(gpa: std.mem.Allocator, self: *World) !void {
        self.* = .{
            .gpa = gpa,
            .granter = try warden.Warden.open(gpa, .{
                .seeds = .{ .name = random(), .padlock = random(), .heir = random() },
                .clock = still,
                .random = random,
                .limit = 1 << 16,
            }),
            .holder = try warden.Warden.open(gpa, .{
                .seeds = .{ .name = random(), .padlock = random(), .heir = random() },
                .clock = still,
                .random = random,
                .limit = 1 << 16,
            }),
            .watcher = .{ .gpa = gpa },
        };
        try self.granter.publishRoad("mem://granter");
        self.wires = .{ .far = &self.granter };
        self.holder.delivery = self.wires.delivery();
        self.holder.observe(self.watcher.observer());
        self.at_todo = try quo.holding(&self.granter, Todo, &self.todo, TODO, .{}, gpa);
        self.at_desk = try quo.holding(&self.holder, Todo, &self.desk, TODO, .{}, gpa);
    }

    fn deinit(self: *World) void {
        self.granter.deinit();
        self.holder.deinit();
        self.watcher.deinit();
    }

    fn invitation(self: *World) !wire.Invitation {
        return self.at_todo.under.grant(self.gpa, self.at_todo.being());
    }

    /// Whether any standing at the granting door still stands on this key or
    /// still commits to it — which is the whole of a key being live there.
    fn live(self: *World, key: Key) bool {
        for (self.granter.inbound.items) |row| {
            if (std.mem.eql(u8, &row.voice, &key)) return true;
            const claimed = arithmetic.commitment(row.minted_name, key);
            if (std.mem.eql(u8, &claimed, &row.commitment)) return true;
        }
        return false;
    }
};

test "accept recovers a rotation whose answer was lost: it asks again on the new voice" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const invitation = try world.invitation();
    defer gpa.free(invitation.hints);

    // The first rotation reaches the door and lands at step 4; the answer
    // never rides back. To the caller that is silence, and the reading that
    // loses the standing is "nothing landed, rotate again" — signed with the
    // key the door has just retired, and refused for it every time after.
    world.wires.drop = 1;

    var accepted = (try world.at_desk.under.accept(invitation)).?;
    defer accepted.deinit();
    try std.testing.expectEqual(@as(usize, 0), world.wires.drop);

    const handle = accepted.only().?;
    try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "add", .{}));
    try std.testing.expectEqual(@as(i64, 1), world.todo.added);

    // Both rotations landed. The door holds the voice this kit minted, with
    // the heir it committed beside it.
    const row = world.holder.outbound.items[accepted.at];
    const standing = world.granter.inbound.items[0];
    try std.testing.expectEqualSlices(u8, &row.voice, &standing.voice);
    try std.testing.expectEqualSlices(
        u8,
        &arithmetic.commitment(world.granter.name, row.heir),
        &standing.commitment,
    );

    // And the invitation's own key is dead at that door: it neither holds nor
    // is committed to, so nobody who saw it can reach through it again.
    try std.testing.expect(!world.live(invitation.heir));
    try std.testing.expect(!std.mem.eql(u8, &row.voice, &invitation.heir));
}

test "accept that met weather leaves the invitation whole, and the same one is accepted next" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const invitation = try world.invitation();
    defer gpa.free(invitation.hints);

    // Weather is not silence: no road carried the bytes, so the far door
    // never heard and the invitation's key is as live as when it was minted.
    world.wires.down = true;
    try std.testing.expect((try world.at_desk.under.accept(invitation)) == null);

    // Told inward, once, and named apart from every other silence — with the
    // road that broke rather than the whole judgment's shrug.
    try std.testing.expectEqual(@as(usize, 1), world.watcher.reasons.items.len);
    try std.testing.expectEqualStrings("weather", world.watcher.reasons.items[0]);
    try std.testing.expectEqualStrings("mem://granter", world.watcher.tried.items[0]);
    // Nothing is kept for a standing never taken, and the road was tried once:
    // weather is never retried from inside accept, because nothing moved.
    try std.testing.expectEqual(@as(usize, 0), world.holder.outbound.items.len);
    try std.testing.expectEqual(@as(usize, 1), world.wires.sent);
    try std.testing.expect(world.live(invitation.heir));

    world.wires.down = false;
    var accepted = (try world.at_desk.under.accept(invitation)).?;
    defer accepted.deinit();
    try std.testing.expectEqual(
        @as(?i64, 1),
        try accepted.only().?.call(gpa, i64, "add", .{}),
    );
    try std.testing.expect(!world.live(invitation.heir));
}

test "a handle that meets weather answers nothing, tells its own ground, and raises nothing" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const invitation = try world.invitation();
    defer gpa.free(invitation.hints);
    var accepted = (try world.at_desk.under.accept(invitation)).?;
    defer accepted.deinit();
    const handle = accepted.only().?;

    world.watcher.reasons.clearRetainingCapacity();
    const before = world.wires.sent;
    world.wires.down = true;

    // The handle keeps its shape — a value or nothing — because a being
    // pushing into a subscriber that closed its tab is not in error. What
    // changes is inward.
    try std.testing.expectEqual(@as(?i64, null), try handle.call(gpa, i64, "add", .{}));
    try std.testing.expectEqual(@as(usize, 1), world.watcher.reasons.items.len);
    try std.testing.expectEqualStrings("weather", world.watcher.reasons.items[0]);
    // And no `moved` is asked on a road that just failed: nothing there moved,
    // so there is nothing to ask after.
    try std.testing.expectEqual(before + 1, world.wires.sent);
    try std.testing.expectEqual(@as(i64, 0), world.todo.added);

    // The number is spent on this side alone, and the next ask rises past it.
    world.wires.down = false;
    try std.testing.expectEqual(@as(?i64, 1), try handle.call(gpa, i64, "add", .{}));
}
