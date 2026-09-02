//! The kit's own names are names the notation cannot express.
//!
//! Article IV's identifier is a letter then letters and digits, so no
//! blueprint in any language can spell a name beginning with an underscore.
//! This kit asks a class for exactly one field of its own, the cell, and it is
//! named `_quo` for that reason.
//!
//! **Zig is the one kit where this defect is loud.** A struct may not carry
//! both a field and a decl of one name, so a cell named `quo` made a blueprint
//! declaring `quo()` impossible to write a class for — `error: duplicate
//! struct member name 'quo'`, at the being's own declaration. Loud, and still
//! a name the law allows that this kit could not serve.
//!
//! The handle side needs nothing: a field is reached by string through
//! `Handle.call`, and the handle's own facts are methods no field is written
//! over, so the two namespaces never touch here.

const std = @import("std");
const warden = @import("warden");
// Imported under a short name on purpose. A class declaring `quo()` shadows a
// module bound to `quo` inside its own scope, which is Zig's ordinary scoping
// and not this kit's business — but it is what an author of such a class meets,
// so the bench meets it too and names the way through.
const q = @import("quo");
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

/// Every name this kit has ever reached for on either side of the seam. On the
/// being side only `quo` was ever the kit's; the rest are the handle's own
/// methods, declared here to prove they were never the being's to lose.
const CLASH =
    \\Clash
    \\  quo() text
    \\  being() text
    \\  seal() text
    \\  send() text
    \\  describe() text
    \\  sketch() text
    \\  moved() text
    \\  blueprint() text
    \\  limit() text
    \\  text() text
    \\  digest() text
    \\  declares() text
    \\
;

const Clash = struct {
    _quo: q.Cell = .{},

    pub fn quo(_: *Clash) []const u8 {
        return "own:quo";
    }
    pub fn being(_: *Clash) []const u8 {
        return "own:being";
    }
    pub fn seal(_: *Clash) []const u8 {
        return "own:seal";
    }
    pub fn send(_: *Clash) []const u8 {
        return "own:send";
    }
    pub fn describe(_: *Clash) []const u8 {
        return "own:describe";
    }
    pub fn sketch(_: *Clash) []const u8 {
        return "own:sketch";
    }
    pub fn moved(_: *Clash) []const u8 {
        return "own:moved";
    }
    pub fn blueprint(_: *Clash) []const u8 {
        return "own:blueprint";
    }
    pub fn limit(_: *Clash) []const u8 {
        return "own:limit";
    }
    pub fn text(_: *Clash) []const u8 {
        return "own:text";
    }
    pub fn digest(_: *Clash) []const u8 {
        return "own:digest";
    }
    pub fn declares(_: *Clash) []const u8 {
        return "own:declares";
    }
};

const NAMES = [_][]const u8{
    "quo",   "being",     "seal",  "send", "describe", "sketch",
    "moved", "blueprint", "limit", "text", "digest",   "declares",
};

const World = struct {
    gpa: std.mem.Allocator,
    threaded: std.Io.Threaded = undefined,
    at_here: host.Host = undefined,
    at_there: host.Host = undefined,
    here: *warden.Warden = undefined,
    there: *warden.Warden = undefined,
    clash: Clash = .{},
    at_clash: q.Handle = undefined,

    fn init(gpa: std.mem.Allocator, self: *World) !void {
        self.* = .{ .gpa = gpa, .threaded = .init(gpa, .{}) };

        const io = self.threaded.io();
        inline for (.{ "at_here", "at_there" }) |which| {
            try host.Host.open(gpa, .{
                .seeds = host.seeds(random),
                .clock = still,
                .random = random,
                .io = io,
                .roads = &.{.memory},
            }, &@field(self, which));
        }
        self.here = &self.at_here.door;
        self.there = &self.at_there.door;
        self.at_clash = try q.holding(self.here, Clash, &self.clash, CLASH, .{}, gpa);
    }

    fn deinit(self: *World) void {
        self.at_here.close();
        self.at_there.close();
        self.threaded.deinit();
    }
};

test "every name this kit uses for itself is a field a being may declare" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    // A standing at it from the second ground, so the answers cross a door.
    const invitation = try world.at_clash.under.grant(gpa, world.at_clash.being());
    defer gpa.free(invitation.hints);
    const under = (q.Cell{ .door = world.there, .being = world.there.name }).at(gpa).?;
    var accepted = (try under.accept(invitation)).?;
    defer accepted.deinit();
    const far = accepted.only().?;

    // The value, never merely that nothing threw: two of the three ways this
    // defect showed itself in the other kits answered silence, which no caller
    // can tell from a refusal.
    inline for (NAMES) |name| {
        const said = (try far.call(gpa, []const u8, name, .{})) orelse
            return error.Silence;
        defer gpa.free(said);
        try std.testing.expectEqualStrings("own:" ++ name, said);
    }
}

test "the handle's own facts stand beside the fields, and answer their own" {
    const gpa = std.testing.allocator;
    var world: World = undefined;
    try World.init(gpa, &world);
    defer world.deinit();

    // `being` and `text` are the handle's, not the being's, and the class
    // declaring fields of those names takes nothing from them.
    try std.testing.expectEqual(world.at_clash.being(), world.clash._quo.being);
    try std.testing.expectEqualStrings(CLASH, world.at_clash.text());
    const said = (try world.at_clash.call(gpa, []const u8, "text", .{})).?;
    defer gpa.free(said);
    try std.testing.expectEqualStrings("own:text", said);
}
