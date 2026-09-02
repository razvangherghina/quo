//! Part two of `papers/quo-truth.md`: what a being receives, played as Alice,
//! Bob and the clinic. Written from that part alone.
//!
//! The beings below are ordinary Zig structs. They know which of their
//! references are Quo — a handle has its own small API and nothing else in
//! the language looks like it — and they know nothing at all about roads or
//! hosts.

const std = @import("std");
const arithmetic = @import("arithmetic");
const wire = @import("wire");
const warden = @import("warden");
const quo = @import("quo");
const host = @import("host");

const Key = warden.Key;

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

// ---------------------------------------------------------------- the world

const DOG =
    \\Dog
    \\  name() text
    \\  logWalk(minutes int) bool
    \\  vaccinated() bool?
    \\  invite() invitation
    \\
;

const Dog = struct {
    _quo: quo.Cell = .{},
    gpa: std.mem.Allocator,
    dog_name: []const u8,
    walks: std.ArrayList(i64) = .empty,
    /// What the leash said when this being was last asked, so the bench can
    /// watch a chain shrink one.
    leash_hops: ?i64 = null,

    pub fn deinit(self: *Dog) void {
        self.walks.deinit(self.gpa);
    }

    pub fn name(self: *Dog) []const u8 {
        return self.dog_name;
    }

    pub fn logWalk(self: *Dog, minutes: i64) bool {
        self.walks.append(self.gpa, minutes) catch return false;
        return true;
    }

    /// The chain: Bob asks Rex, and Rex asks the clinic. The leash it hands on
    /// is the one it received, shrunk — it is never widened here.
    pub fn vaccinated(self: *Dog, at: *quo.At) ?bool {
        self.leash_hops = if (at.leash) |one| one.hops else null;
        const record = at.relation("clinic") orelse return null;
        return record.call(at.gpa, bool, "vaccinated", .{}) catch null;
    }

    pub fn invite(self: *Dog, at: *quo.At) !wire.Invitation {
        _ = self;
        return at.grant(at.gpa, null);
    }

    /// What of this being's state moves with it, and how it takes that state
    /// back. **The being provides these rather than receiving them**: what a
    /// being shows decides what moves with it, and the class is free because
    /// the being writes them.
    pub fn cells(self: *Dog, gpa: std.mem.Allocator) ![]u8 {
        var out: std.ArrayList(u8) = .empty;
        errdefer out.deinit(gpa);
        for (self.walks.items) |one| {
            var head: [8]u8 = undefined;
            std.mem.writeInt(i64, &head, one, .big);
            try out.appendSlice(gpa, &head);
        }
        return out.toOwnedSlice(gpa);
    }

    pub fn take(self: *Dog, bytes: []const u8) !void {
        self.walks.clearRetainingCapacity();
        var rest = bytes;
        while (rest.len >= 8) : (rest = rest[8..]) {
            try self.walks.append(self.gpa, std.mem.readInt(i64, rest[0..8], .big));
        }
    }
};

const RECORD =
    \\Record
    \\  vaccinated() bool
    \\
;

const Record = struct {
    _quo: quo.Cell = .{},
    callers: std.ArrayList(Key) = .empty,
    gpa: std.mem.Allocator,
    leash_hops: ?i64 = null,

    pub fn deinit(self: *Record) void {
        self.callers.deinit(self.gpa);
    }

    pub fn vaccinated(self: *Record, at: *quo.At) bool {
        if (at.caller) |who| {
            if (who.voice) |v| self.callers.append(self.gpa, v) catch {};
        }
        self.leash_hops = if (at.leash) |one| one.hops else null;
        return true;
    }
};

const PROFILE =
    \\Profile
    \\  name() text
    \\  rate() int
    \\
;

const Profile = struct {
    _quo: quo.Cell = .{},

    pub fn name(_: *Profile) []const u8 {
        return "Bob";
    }

    pub fn rate(_: *Profile) i64 {
        return 20;
    }
};

const WALKER =
    \\Walker
    \\  subscribe(inbox invitation) bool
    \\  walk(minutes int) bool
    \\  secret() text
    \\
;

const Walker = struct {
    _quo: quo.Cell = .{},
    listening: bool = false,

    /// **Subscription is a grant backwards.** There is no subscribe verb
    /// beneath this: the invitation arrives as an ordinary argument of a
    /// field Walker declares, and each event afterwards is an ordinary ask.
    pub fn subscribe(self: *Walker, at: *quo.At, inbox: wire.Invitation) bool {
        var accepted = (at.accept(inbox) catch return false) orelse return false;
        defer accepted.deinit();
        const listener = accepted.only() orelse return false;
        at.label("inbox", listener) catch return false;
        self.listening = true;
        return true;
    }

    pub fn walk(self: *Walker, at: *quo.At, minutes: i64) bool {
        _ = self;
        const rex = at.relation("rex") orelse return false;
        const logged = (rex.call(at.gpa, bool, "logWalk", .{minutes}) catch null) orelse
            return false;
        if (!logged) return false;
        if (at.relation("inbox")) |inbox| {
            _ = inbox.call(at.gpa, void, "walked", .{minutes}) catch {};
        }
        return true;
    }

    pub fn secret(_: *Walker) []const u8 {
        return "nobody sees this";
    }
};

const INBOX =
    \\Inbox
    \\  walked(minutes int)
    \\
;

const Inbox = struct {
    _quo: quo.Cell = .{},
    gpa: std.mem.Allocator,
    heard: std.ArrayList(i64) = .empty,

    pub fn deinit(self: *Inbox) void {
        self.heard.deinit(self.gpa);
    }

    pub fn walked(self: *Inbox, minutes: i64) void {
        self.heard.append(self.gpa, minutes) catch {};
    }
};

const World = struct {
    gpa: std.mem.Allocator,
    threaded: std.Io.Threaded,
    /// Three grounds, none a tenant of another: each is its own host, and they
    /// reach one another at distance zero.
    at_phone: host.Host = undefined,
    at_laptop: host.Host = undefined,
    at_clinic: host.Host = undefined,
    phone: *warden.Warden = undefined,
    laptop: *warden.Warden = undefined,
    clinic: *warden.Warden = undefined,

    rex: Dog = undefined,
    inbox: Inbox = undefined,
    walker: Walker = .{},
    profile: Profile = .{},
    record: Record = undefined,

    at_rex: quo.Handle = undefined,
    at_inbox: quo.Handle = undefined,
    at_walker: quo.Handle = undefined,
    at_profile: quo.Handle = undefined,
    at_record: quo.Handle = undefined,

    fn init(gpa: std.mem.Allocator, self: *World) !void {
        self.* = .{ .gpa = gpa, .threaded = .init(gpa, .{}) };
        self.rex = .{ .gpa = gpa, .dog_name = "Rex" };
        self.inbox = .{ .gpa = gpa };
        self.record = .{ .gpa = gpa };

        const io = self.threaded.io();
        inline for (.{ "at_phone", "at_laptop", "at_clinic" }) |which| {
            try host.Host.open(gpa, .{
                .seeds = host.seeds(random),
                .clock = still,
                .random = random,
                .io = io,
                .roads = &.{.memory},
            }, &@field(self, which));
        }
        self.phone = &self.at_phone.door;
        self.laptop = &self.at_laptop.door;
        self.clinic = &self.at_clinic.door;

        self.at_rex = try quo.holding(self.phone, Dog, &self.rex, DOG, .{}, gpa);
        self.at_inbox = try quo.holding(self.phone, Inbox, &self.inbox, INBOX, .{}, gpa);
        self.at_walker = try quo.holding(self.laptop, Walker, &self.walker, WALKER, .{}, gpa);
        self.at_profile = try quo.holding(self.laptop, Profile, &self.profile, PROFILE, .{}, gpa);
        self.at_record = try quo.holding(self.clinic, Record, &self.record, RECORD, .{}, gpa);
    }

    fn deinit(self: *World) void {
        self.rex.deinit();
        self.inbox.deinit();
        self.record.deinit();
        self.at_phone.close();
        self.at_laptop.close();
        self.at_clinic.close();
        self.threaded.deinit();
    }

    /// Hand one being's invitation to another ground, under a label there.
    fn open(self: *World, from: quo.Handle, to: quo.Handle, label: []const u8) !quo.Handle {
        const invitation = try from.under.grant(self.gpa, from.being());
        defer self.gpa.free(invitation.hints);
        var accepted = (try to.under.accept(invitation)).?;
        defer accepted.deinit();
        const handle = accepted.only().?;
        try to.under.label(label, handle);
        return handle;
    }
};

// ------------------------------------------------------------- the five acts

test "1. Alice lets Bob walk Rex: a grant, an accept, and Walker holds a handle" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const rex = try world.open(world.at_rex, world.at_walker, "rex");
    const said = (try rex.call(gpa, []const u8, "name", .{})).?;
    defer gpa.free(said);
    try std.testing.expectEqualStrings("Rex", said);

    try std.testing.expectEqual(@as(?bool, true), try world.at_walker.call(
        gpa,
        bool,
        "walk",
        .{@as(i64, 30)},
    ));
    try std.testing.expectEqualSlices(i64, &.{30}, world.rex.walks.items);
}

test "2. Bob narrows what Alice sees: Profile is granted, Walker never is" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const bob = try world.open(world.at_profile, world.at_rex, "bob");
    const said = (try bob.call(gpa, []const u8, "name", .{})).?;
    defer gpa.free(said);
    try std.testing.expectEqualStrings("Bob", said);
    try std.testing.expectEqual(@as(?i64, 20), try bob.call(gpa, i64, "rate", .{}));

    // Alice's standing at Bob's door opens Profile and nothing of Walker. A
    // field Profile never declared does not exist for her, and asking for one
    // is silence.
    try std.testing.expect((try bob.call(gpa, []const u8, "secret", .{})) == null);
    const at_walker = try world.at_walker.under.standings(gpa);
    defer gpa.free(at_walker);
    try std.testing.expectEqual(@as(usize, 0), at_walker.len);
}

test "3. the chain: Bob asks Rex, Rex asks Record, and the clinic sees Rex, not Bob" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    _ = try world.open(world.at_record, world.at_rex, "clinic");
    const rex = try world.open(world.at_rex, world.at_walker, "rex");

    try std.testing.expectEqual(@as(?bool, true), (try rex.call(gpa, ?bool, "vaccinated", .{})).?);

    // The voice the clinic saw is the one the clinic minted for Rex. Bob has
    // no standing there and could not have asked directly.
    try std.testing.expectEqual(@as(usize, 1), world.record.callers.items.len);
    const at_record = try world.at_record.under.standings(gpa);
    defer gpa.free(at_record);
    try std.testing.expectEqual(@as(usize, 1), at_record.len);
    try std.testing.expectEqualSlices(u8, &at_record[0], &world.record.callers.items[0]);
}

test "3b. the leash shrinks by one hop along the chain, and a being never widens it" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    _ = try world.open(world.at_record, world.at_rex, "clinic");
    const rex = try world.open(world.at_rex, world.at_walker, "rex");
    _ = try rex.call(gpa, ?bool, "vaccinated", .{});

    const at_rex = world.rex.leash_hops.?;
    const at_clinic = world.record.leash_hops.?;
    try std.testing.expectEqual(at_rex - 1, at_clinic);
}

test "4. subscription is a grant backwards: Inbox is the callback, and a push is an ask" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    _ = try world.open(world.at_rex, world.at_walker, "rex");
    const bob = try world.open(world.at_walker, world.at_rex, "walker");

    // Alice hands Bob's Walker an invitation to Inbox, through a field Walker
    // declares. There is no subscribe verb anywhere beneath this.
    const inbox = try world.at_inbox.under.grant(gpa, null);
    defer gpa.free(inbox.hints);
    try std.testing.expectEqual(@as(?bool, true), try bob.call(gpa, bool, "subscribe", .{inbox}));

    try std.testing.expectEqual(@as(?bool, true), try bob.call(gpa, bool, "walk", .{@as(i64, 15)}));
    try std.testing.expectEqual(@as(?bool, true), try bob.call(gpa, bool, "walk", .{@as(i64, 25)}));
    try std.testing.expectEqualSlices(i64, &.{ 15, 25 }, world.inbox.heard.items);
    try std.testing.expectEqualSlices(i64, &.{ 15, 25 }, world.rex.walks.items);
}

test "4b. unsubscribing needs no verb: release Inbox and the push meets silence" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    _ = try world.open(world.at_rex, world.at_walker, "rex");
    const bob = try world.open(world.at_walker, world.at_rex, "walker");
    const inbox = try world.at_inbox.under.grant(gpa, null);
    defer gpa.free(inbox.hints);
    _ = try bob.call(gpa, bool, "subscribe", .{inbox});
    _ = try bob.call(gpa, bool, "walk", .{@as(i64, 10)});

    try std.testing.expect(world.at_inbox.under.release(null));

    // The walk is still logged; only the push finds nobody, and the source
    // cannot tell that from a tab that closed.
    try std.testing.expectEqual(@as(?bool, true), try bob.call(gpa, bool, "walk", .{@as(i64, 20)}));
    try std.testing.expectEqualSlices(i64, &.{10}, world.inbox.heard.items);
    try std.testing.expectEqualSlices(i64, &.{ 10, 20 }, world.rex.walks.items);
}

test "5. Alice fires Bob: amend, and the next call is silence" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const rex = try world.open(world.at_rex, world.at_walker, "rex");
    try std.testing.expectEqual(@as(?bool, true), try rex.call(gpa, bool, "logWalk", .{@as(i64, 5)}));

    const held = try world.at_rex.under.standings(gpa);
    defer gpa.free(held);
    try std.testing.expect(try world.at_rex.under.amend(held[0], &.{}, &.{world.at_rex.being()}));

    try std.testing.expect((try rex.call(gpa, bool, "logWalk", .{@as(i64, 5)})) == null);
    try std.testing.expect((try rex.call(gpa, []const u8, "name", .{})) == null);
    try std.testing.expectEqualSlices(i64, &.{5}, world.rex.walks.items);
}

test "silence after a write: resending the identical envelope is honoured at most once" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const rex = try world.open(world.at_rex, world.at_walker, "rex");
    // The handle hands back the envelope it sealed, so a caller that met
    // silence resends the same bytes and never a fresh number.
    var sealed = (try rex.seal(gpa, "logWalk", .{@as(i64, 40)})).?;
    defer sealed.deinit(gpa);
    try std.testing.expectEqual(@as(?bool, true), try rex.send(gpa, bool, "logWalk", sealed));
    try std.testing.expect((try rex.send(gpa, bool, "logWalk", sealed)) == null);
    try std.testing.expectEqualSlices(i64, &.{40}, world.rex.walks.items);
}

test "a same-warden call goes through the handle: one shape, leashed, no seal" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    var pup: Dog = .{ .gpa = gpa, .dog_name = "Pup" };
    defer pup.deinit();
    const beside = try world.at_rex.under.hold(Dog, &pup, DOG, "pup");

    const said = (try beside.call(gpa, []const u8, "name", .{})).?;
    defer gpa.free(said);
    try std.testing.expectEqualStrings("Pup", said);
    const by_label = world.at_rex.under.relation("pup").?;
    try std.testing.expectEqual(@as(?bool, true), try by_label.call(gpa, bool, "logWalk", .{@as(i64, 3)}));
    try std.testing.expectEqualSlices(i64, &.{3}, pup.walks.items);

    // Nothing was sealed: the two halves of a far call have no second half
    // here, because there is nothing to resend.
    try std.testing.expect((try beside.seal(gpa, "name", .{})) == null);
}

test "what a being shows decides what moves: cells and take are the contract" {
    const gpa = std.testing.allocator;
    var rex: Dog = .{ .gpa = gpa, .dog_name = "Rex" };
    defer rex.deinit();
    _ = rex.logWalk(7);
    _ = rex.logWalk(8);

    // The organ carries them because the class declared them, and would carry
    // neither if it had not: a being that provides neither moves with nothing
    // but its name and its standings.
    const held = quo.organ(Dog, &rex);
    const bytes = try held.cells.?(held.context, gpa);
    defer gpa.free(bytes);

    var again: Dog = .{ .gpa = gpa, .dog_name = "Rex" };
    defer again.deinit();
    const taking = quo.organ(Dog, &again);
    try taking.take.?(taking.context, bytes);
    try std.testing.expectEqualSlices(i64, &.{ 7, 8 }, again.walks.items);

    // Profile declares neither, so nothing of it moves.
    var profile: Profile = .{};
    const bare = quo.organ(Profile, &profile);
    try std.testing.expect(bare.cells == null);
    try std.testing.expect(bare.take == null);
}

test "a migration carries one being: what Rex minted stays where it was minted" {
    const gpa = std.testing.allocator;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    var ground: host.Host = undefined;
    try host.Host.open(gpa, .{
        .seeds = host.seeds(random),
        .clock = still,
        .random = random,
        .io = threaded.io(),
        .roads = &.{.memory},
    }, &ground);
    defer ground.close();
    const phone = &ground.door;

    // Rex is held on a seed of the bench's own, because departing spends the
    // heir this door committed to and a caller cannot invent one.
    const heir_seed: Key = @splat(0x61);
    const committed = try arithmetic.signingPair(heir_seed);
    var rex: Dog = .{ .gpa = gpa, .dog_name = "Rex" };
    defer rex.deinit();
    const at_rex = try quo.holding(phone, Dog, &rex, DOG, .{
        .seed = @splat(0x60),
        .heir_seed = heir_seed,
    }, gpa);

    // Landing is minted beside Rex, and somebody stands at it.
    var landing: Inbox = .{ .gpa = gpa };
    defer landing.deinit();
    const at_landing = try at_rex.under.hold(Inbox, &landing, INBOX, "landing");
    _ = try phone.grant(a, at_landing.being());

    const before = (try phone.standingsAt(a, at_landing.being())).len;
    try std.testing.expectEqual(@as(usize, 1), before);

    // Nothing of Landing's is in Rex's cargo: what a cargo carries is the
    // standings at the being that moves.
    const cargo = try phone.pack(a, at_rex.being(), committed.public, "");
    for (cargo.standings) |one| {
        for (one.beings) |at| {
            try std.testing.expect(!std.mem.eql(u8, &at, &at_landing.being()));
        }
    }

    _ = try phone.depart(a, at_rex.being(), .{
        .heir = committed.public,
        .commitment = arithmetic.commitment(phone.name, committed.public),
        .name = phone.name,
        .padlock = phone.padlock,
    });

    // Landing stands where it was minted, with the standing at it untouched,
    // and it still answers.
    try std.testing.expect(phone.being(at_landing.being()) != null);
    try std.testing.expectEqual(before, (try phone.standingsAt(a, at_landing.being())).len);
    try std.testing.expectEqual(
        @as(?bool, null),
        try at_landing.call(gpa, bool, "walked", .{@as(i64, 11)}),
    );
    try std.testing.expectEqualSlices(i64, &.{11}, landing.heard.items);
}

// ------------------------------------------- accept, knock and introspection

/// The voice one standing at a being stands in. A grant mints exactly one, so
/// this is the row a widening amends.
fn oneVoice(gpa: std.mem.Allocator, at: quo.Handle) !Key {
    const voices = try at.under.standings(gpa);
    defer gpa.free(voices);
    try std.testing.expectEqual(@as(usize, 1), voices.len);
    return voices[0];
}

test "accept answers one handle per being the standing names, and each says which" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const invitation = try world.at_rex.under.grant(gpa, world.at_rex.being());
    defer gpa.free(invitation.hints);
    // The standing is widened before Bob takes it up: one voice, two beings.
    const voice = try oneVoice(gpa, world.at_rex);
    try std.testing.expect(try world.at_rex.under.amend(voice, &.{world.at_inbox.being()}, &.{}));

    var accepted = (try world.at_walker.under.accept(invitation)).?;
    defer accepted.deinit();
    try std.testing.expectEqual(@as(usize, 2), accepted.handles.len);
    // Two beings, so there is no "the" handle.
    try std.testing.expect(accepted.only() == null);

    const rex = accepted.of(world.at_rex.being()).?;
    const inbox = accepted.of(world.at_inbox.being()).?;
    const said = (try rex.call(gpa, []const u8, "name", .{})).?;
    defer gpa.free(said);
    try std.testing.expectEqualStrings("Rex", said);
    _ = try inbox.call(gpa, void, "walked", .{@as(i64, 12)});
    try std.testing.expectEqualSlices(i64, &.{12}, world.inbox.heard.items);

    // A being the standing never named is no handle of this acceptance.
    try std.testing.expect(accepted.of(world.phone.name) == null);
}

test "a widened standing is re-read from the far door, never remembered" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const rex = try world.open(world.at_rex, world.at_walker, "rex");
    const voice = try oneVoice(gpa, world.at_rex);

    // Alice widens the row. Nobody is told, and Bob's handles are what he
    // already had.
    try std.testing.expect(try world.at_rex.under.amend(voice, &.{world.at_inbox.being()}, &.{}));

    var read = (try world.at_walker.under.again(rex)).?;
    defer read.deinit();
    try std.testing.expectEqual(@as(usize, 2), read.handles.len);
    const inbox = read.of(world.at_inbox.being()).?;
    _ = try inbox.call(gpa, void, "walked", .{@as(i64, 7)});
    try std.testing.expectEqualSlices(i64, &.{7}, world.inbox.heard.items);
}

test "a handle's describe shows what the row names, and never the rest of the estate" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const rex = try world.open(world.at_rex, world.at_walker, "rex");
    var seen = (try rex.describe(gpa)).?;
    defer seen.deinit();

    var named: usize = 0;
    var found_rex = false;
    var found_inbox = false;
    for (seen.estate.classes) |class| {
        for (class.beings) |held| {
            named += 1;
            if (std.mem.eql(u8, &held.being, &world.at_rex.being())) found_rex = true;
            if (std.mem.eql(u8, &held.being, &world.at_inbox.being())) found_inbox = true;
        }
    }
    try std.testing.expect(found_rex);
    // Inbox stands at the same door and is not in this row, so it is not here.
    // What is, beside Rex, is the public being everyone is shown.
    try std.testing.expect(!found_inbox);
    try std.testing.expectEqual(@as(usize, 2), named);

    // A blueprint the voice reaches a being of, and the door's own limit.
    const digest = world.phone.being(world.at_rex.being()).?.digest;
    const text = (try rex.blueprint(gpa, digest)).?;
    defer gpa.free(text);
    try std.testing.expectEqualStrings(DOG, text);
    try std.testing.expectEqual(@as(?i64, @intCast(world.phone.limit)), try rex.limit(gpa));

    const sketch = (try rex.sketch(gpa)).?;
    try std.testing.expectEqualSlices(u8, &world.at_rex.being(), &sketch.being);
    try std.testing.expectEqualSlices(u8, &digest, &sketch.digest);
}

// A ground decides what it offers a voice that merely knocks. Until it says
// so, the stranger gets one room.
test "a being the warden exposes is reached by a stranger" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const card = try world.phone.card(gpa);
    defer gpa.free(card.hints);
    const knocked = (try world.at_walker.under.knock(card)).?;

    {
        var seen = (try knocked.describe(gpa)).?;
        defer seen.deinit();
        try std.testing.expectEqual(@as(usize, 1), seen.estate.classes.len);
    }

    try std.testing.expect(try world.phone.expose(world.at_rex.being()));
    // Exposing a being it does not hold is refused rather than kept.
    try std.testing.expect(!try world.phone.expose(@splat(0x09)));
    {
        var seen = (try knocked.describe(gpa)).?;
        defer seen.deinit();
        try std.testing.expectEqual(@as(usize, 2), seen.estate.classes.len);
    }

    // Concealed, the house has one room again.
    try std.testing.expect(world.phone.conceal(world.at_rex.being()));
    try std.testing.expect(!world.phone.conceal(world.at_rex.being()));
    {
        var seen = (try knocked.describe(gpa)).?;
        defer seen.deinit();
        try std.testing.expectEqual(@as(usize, 1), seen.estate.classes.len);
    }
}

test "a knock is held as a stranger: the public being and nothing else" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const card = try world.phone.card(gpa);
    defer gpa.free(card.hints);
    const knocked = (try world.at_walker.under.knock(card)).?;

    // What that door shows a stranger is its public being, and the estate is
    // never enumerable from outside.
    var seen = (try knocked.describe(gpa)).?;
    defer seen.deinit();
    try std.testing.expectEqual(@as(usize, 1), seen.estate.classes.len);
    try std.testing.expectEqualSlices(u8, &warden.digest(), &seen.estate.classes[0].digest);
    try std.testing.expectEqual(@as(usize, 1), seen.estate.classes[0].beings.len);
    try std.testing.expectEqualSlices(
        u8,
        &world.phone.name,
        &seen.estate.classes[0].beings[0].being,
    );

    // The other three, answered to a stranger.
    const text = (try knocked.blueprint(gpa, warden.digest())).?;
    defer gpa.free(text);
    try std.testing.expectEqualStrings(warden.blueprint_text, text);
    const own = (try knocked.sketch(gpa)).?;
    try std.testing.expectEqualSlices(u8, &world.phone.name, &own.being);
    try std.testing.expectEqual(@as(?i64, @intCast(world.phone.limit)), try knocked.limit(gpa));

    // And nothing of Alice's own beings: a class the stranger reaches no being
    // of is silence, and so is a sketch of one. The handle at Rex here is the
    // bench's own composing — the seam hands a stranger no such thing.
    const digest = world.phone.being(world.at_rex.being()).?.digest;
    try std.testing.expect((try knocked.blueprint(gpa, digest)) == null);
    const at_rex: quo.Handle = .{
        .door = world.laptop,
        .under = world.at_walker.under,
        .reach = .{ .far = .{
            .at = knocked.reach.far.at,
            .being = world.at_rex.being(),
            .text = DOG,
        } },
    };
    try std.testing.expect((try at_rex.sketch(gpa)) == null);
    try std.testing.expect((try at_rex.call(gpa, []const u8, "name", .{})) == null);

    // A knock is a standing at nothing, so reading it names no being at all.
    var read = (try world.at_walker.under.again(knocked)).?;
    defer read.deinit();
    try std.testing.expectEqual(@as(usize, 0), read.handles.len);
}

test "the same-warden path answers the same introspection" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    const far = try world.open(world.at_rex, world.at_walker, "rex");
    const near = world.at_rex;
    const digest = world.phone.being(world.at_rex.being()).?.digest;

    const here = (try near.sketch(gpa)).?;
    const there = (try far.sketch(gpa)).?;
    try std.testing.expectEqualSlices(u8, &here.being, &there.being);
    try std.testing.expectEqualSlices(u8, &here.digest, &there.digest);
    try std.testing.expectEqualSlices(u8, &here.commitment, &there.commitment);

    const near_text = (try near.blueprint(gpa, digest)).?;
    defer gpa.free(near_text);
    const far_text = (try far.blueprint(gpa, digest)).?;
    defer gpa.free(far_text);
    try std.testing.expectEqualStrings(near_text, far_text);
    try std.testing.expectEqualStrings(DOG, near.text());
    try std.testing.expectEqualStrings(DOG, far.text());

    try std.testing.expectEqual(try near.limit(gpa), try far.limit(gpa));

    // Only the estate differs, and it differs because there is nothing to
    // scope it by: under one warden there are no strangers and no voices, so a
    // neighbour is shown what the door holds.
    var within = (try near.describe(gpa)).?;
    defer within.deinit();
    var found_inbox = false;
    for (within.estate.classes) |class| {
        for (class.beings) |held| {
            if (std.mem.eql(u8, &held.being, &world.at_inbox.being())) found_inbox = true;
        }
    }
    try std.testing.expect(found_inbox);
}

test "a being reaches its warden only through the closure, and never a key" {
    // What a being is given is `quo.At`, and every field on it is a fact or an
    // act. There is nowhere on it to put a secret, and this is what says so.
    inline for (@typeInfo(quo.At).@"struct".fields) |field| {
        try std.testing.expect(std.mem.indexOf(u8, field.name, "secret") == null);
        try std.testing.expect(std.mem.indexOf(u8, field.name, "padlock") == null);
        try std.testing.expect(std.mem.indexOf(u8, field.name, "seed") == null);
    }
}
