//! One suite of judgments, played over all three of Article III's carriages.
//!
//! Article III names three roads — the common carriage, the line, and
//! distance zero, where the carriage is a call. **What is law is this:
//! distance zero waives no step of the judgment.** A ground that strips the
//! seal or the signature for being local has rebuilt the ambient permission
//! this law exists to end, so the same eight steps of Article XII must be
//! spent whichever road the bytes arrived over.
//!
//! That is why every case here is written once and driven over all three. The
//! suite plays a letter down each road against a house standing fresh for
//! each, and asserts first that the three roads reached the same judgment and
//! only then what that judgment was — so a step waived on one road and not
//! the others is a red rather than an absence.
//!
//! The two socketed roads run over a real loopback socket on an ephemeral
//! port, torn down with the case; a failed bind is `error.SkipZigTest`.
//! Distance zero has no socket to fail on, which is the only difference the
//! law allows it.

const std = @import("std");
const arithmetic = @import("arithmetic");
const envelope = @import("envelope");
const warden = @import("warden");
const carriage = @import("carriage");
const line = @import("line");
const zero = @import("zero");
const src_dir = @import("sources").src_dir;

const net = std.Io.net;
const Key = warden.Key;

const cap = 1 << 20;

// -------------------------------------------------------------- the house

/// A whole ground: a warden with one public being, one ordinary being it
/// grants, one holder in the inbound record, and a door that runs the eight
/// steps and seals the answer. It is the same house whichever road reaches
/// it — a door owes every caller what any door owes, and the road is not part
/// of the judgment.
const House = struct {
    gpa: std.mem.Allocator,
    arena: std.heap.ArenaAllocator,
    door: warden.Warden,
    /// The holder's voice, the heir it committed, and a voice no record
    /// anywhere names.
    voice: arithmetic.SigningPair,
    heir: arithmetic.SigningPair,
    outsider: arithmetic.SigningPair,
    /// The caller's own padlock, which is how the door answers, and one it
    /// never carried.
    back: arithmetic.SealingPair,
    other_back: arithmetic.SealingPair,
    /// A being of the ordinary class, granted to the holder, and one the
    /// holder does not reach.
    thing: Key,
    unreachable_being: Key,

    /// What the door was asked, and what step seven decided — read only after
    /// the serving thread has been joined.
    knocks: usize = 0,
    routing: ?std.meta.Tag(warden.Routing) = null,

    /// Every key in the fixture is derived from a fixed seed, so a case can
    /// name a key without standing a house to read it off.
    const seed = struct {
        const name: Key = @splat(1);
        const holder: Key = @splat(3);
        /// A voice no record of this house names.
        const stranger: Key = @splat(12);
        /// The granted being, and one the holder does not reach.
        const thing: Key = @splat(7);
        const hidden: Key = @splat(8);
    };

    fn init(gpa: std.mem.Allocator) !House {
        const name = try arithmetic.signingPair(seed.name);
        const padlock = try arithmetic.sealingPair(@splat(2));
        const voice = try arithmetic.signingPair(seed.holder);
        const heir = try arithmetic.signingPair(@splat(4));
        const back = try arithmetic.sealingPair(@splat(5));
        const other_back = try arithmetic.sealingPair(@splat(6));
        const thing = try arithmetic.signingPair(seed.thing);
        const hidden = try arithmetic.signingPair(seed.hidden);
        const outsider = try arithmetic.signingPair(seed.stranger);

        var self: House = .{
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
            .outsider = outsider,
            .back = back,
            .other_back = other_back,
            .thing = thing.public,
            .unreachable_being = hidden.public,
        };

        const digest = arithmetic.hash("Thing\n  poke() int\n");
        try self.door.beings.append(gpa, .{
            .pk = name.public,
            .secret = name.secret,
            .digest = warden.digest(),
            .commitment = arithmetic.commitment(name.public, heir.public),
            .text = warden.blueprint_text,
        });
        for ([_]arithmetic.SigningPair{ thing, hidden }) |pair| {
            try self.door.beings.append(gpa, .{
                .pk = pair.public,
                .secret = pair.secret,
                .digest = digest,
                .commitment = arithmetic.commitment(name.public, pair.public),
                .text = "Thing\n  poke() int\n",
            });
        }

        // One holder, reaching the ordinary being and not the hidden one.
        var row: warden.Inbound = .{
            .voice = voice.public,
            .commitment = arithmetic.commitment(name.public, heir.public),
            .minted_name = name.public,
            .window = .{ .width = self.door.width },
        };
        try row.beings.append(gpa, thing.public);
        try self.door.inbound.append(gpa, row);
        return self;
    }

    fn deinit(self: *House) void {
        self.door.deinit();
        self.arena.deinit();
    }

    /// The highest number this door has honoured for the holder. Nothing
    /// later gives a spent number back, so this is what "the seq was spent"
    /// is read off.
    fn mark(self: House) i64 {
        return self.door.inbound.items[0].window.mark;
    }

    /// The door itself: the eight steps, and an answer sealed to the return
    /// padlock the payload carried. Every failure is the same failure, and
    /// the road never learns which step it was.
    fn knock(context: *anyopaque, gpa: std.mem.Allocator, sealed: []const u8) std.mem.Allocator.Error!carriage.Answer {
        const self: *House = @ptrCast(@alignCast(context));
        self.knocks += 1;

        var verdict = self.door.judge(sealed) catch |e| switch (e) {
            error.OutOfMemory => return error.OutOfMemory,
            else => return null,
        };
        defer verdict.deinit();
        self.routing = verdict.routing;

        // Step seven is a routing decision the ground carries out, and what
        // this ground answers with is the decision itself — the being is
        // never invoked here, because what is under assertion is the
        // judgment rather than any being's behaviour.
        const data = [_]u8{@intFromEnum(std.meta.activeTag(verdict.routing))};
        return self.door.answer(gpa, @splat(13), verdict.say, &data) catch |e| switch (e) {
            error.OutOfMemory => return error.OutOfMemory,
            else => return null,
        };
    }

    fn asDoor(self: *House) carriage.Door {
        return .{ .context = self, .knock = knock };
    }

    const Letter = struct {
        /// The secret that signs. `voice` is what the payload declares it
        /// signed with, and the two differ only where a case wants them to.
        voice_secret: Key,
        voice: ?Key = null,
        recipient: ?Key = null,
        seq: i64 = 1,
        time: i64 = 1000,
        hops: i64 = 4,
        being: ?Key = null,
        method: ?warden.Method = null,
        padlock: ?Key = null,
        /// Bytes handed to the road verbatim, for what is not an envelope at
        /// all.
        raw: ?[]const u8 = null,
    };

    /// One sealed letter, written by the caller and handed to a road.
    fn write(self: *House, l: Letter) ![]const u8 {
        if (l.raw) |bytes| return bytes;
        const a = self.arena.allocator();
        const signer = try arithmetic.signingPair(l.voice_secret);
        return envelope.seal(a, @splat(9), self.door.padlock, l.voice_secret, .{ .say = .{
            .voice = l.voice orelse signer.public,
            .recipient = l.recipient orelse self.door.name,
            .seq = l.seq,
            .padlock = l.padlock orelse self.back.public,
            .allowance = .{ .time = l.time, .hops = l.hops },
            .being = l.being,
            .method = l.method,
        } });
    }
};

// -------------------------------------------------------------- the roads

const Road = enum { zero, carriage, line };

const roads = [_]Road{ .zero, .carriage, .line };

/// The serving half of a socketed road, run on its own thread and torn down
/// with the case.
const Serving = struct {
    road: Road,
    server: net.Server,
    io: std.Io,
    gpa: std.mem.Allocator,
    door: carriage.Door,
    /// How many messages to take before the ground goes away.
    rounds: usize,
    failed: bool = false,

    fn run(self: *Serving) void {
        var left = self.rounds;
        while (left > 0) : (left -= 1) {
            const stream = self.server.accept(self.io) catch {
                self.failed = true;
                return;
            };
            defer stream.close(self.io);
            switch (self.road) {
                .carriage => carriage.serveOnce(self.gpa, self.io, stream, cap, self.door) catch {
                    self.failed = true;
                    return;
                },
                .line => self.frame(stream) catch {
                    self.failed = true;
                    return;
                },
                .zero => unreachable,
            }
        }
    }

    /// One framed exchange. Silence has no wire form on a line, so a refusal
    /// produces no frame at all.
    fn frame(self: *Serving, stream: net.Stream) !void {
        var in: [4096]u8 = undefined;
        var out: [4096]u8 = undefined;
        var reader = stream.reader(self.io, &in);
        var writer = stream.writer(self.io, &out);
        const sealed = try line.readFrame(self.gpa, &reader.interface, line.default_cap);
        defer self.gpa.free(sealed);
        const answer = try self.door.knock(self.door.context, self.gpa, sealed) orelse return;
        defer self.gpa.free(answer);
        try line.writeFrame(&writer.interface, line.default_cap, answer);
    }
};

fn loopback(io: std.Io) !net.Server {
    const address: net.IpAddress = .{ .ip4 = .loopback(0) };
    return net.IpAddress.listen(&address, io, .{ .reuse_address = true });
}

/// Carry one sealed envelope to a house's door over one road, and bring back
/// whatever the door said. Null is silence, in whatever form the road has for
/// it: an empty body on the common carriage, no frame at all on a line, and
/// nothing handed back at distance zero.
fn ride(gpa: std.mem.Allocator, io: std.Io, road: Road, house: *House, sealed: []const u8) !carriage.Answer {
    const door = house.asDoor();

    if (road == .zero) {
        // No socket, no hint, no frame: the carriage is a call.
        return zero.call(gpa, .{ .context = door.context, .knock = door.knock }, sealed, cap);
    }

    var serving: Serving = .{
        .road = road,
        .server = loopback(io) catch return error.SkipZigTest,
        .io = io,
        .gpa = gpa,
        .door = door,
        .rounds = 1,
    };
    defer serving.server.deinit(io);
    const port = serving.server.socket.address.getPort();
    const thread = try std.Thread.spawn(.{}, Serving.run, .{&serving});

    var answer: carriage.Answer = null;
    switch (road) {
        .carriage => {
            const hint = try std.fmt.allocPrint(gpa, "http://127.0.0.1:{d}/", .{port});
            defer gpa.free(hint);
            answer = try carriage.post(gpa, io, hint, sealed, cap);
        },
        .line => {
            const address: net.IpAddress = .{ .ip4 = .loopback(port) };
            const stream = try line.dial(io, &address);
            defer stream.close(io);
            var in: [4096]u8 = undefined;
            var out: [4096]u8 = undefined;
            var reader = stream.reader(io, &in);
            var writer = stream.writer(io, &out);
            try line.writeFrame(&writer.interface, line.default_cap, sealed);
            answer = line.readFrame(gpa, &reader.interface, line.default_cap) catch |e| switch (e) {
                // The far end wrote no frame: silence, in the only form this
                // road has for it.
                error.EndOfStream => null,
                else => return e,
            };
        },
        .zero => unreachable,
    }
    thread.join();
    try std.testing.expect(!serving.failed);
    return answer;
}

// ------------------------------------------------------- what a road returns

/// What one letter down one road came to. Everything here is either the same
/// on all three roads or the law has been broken.
const Step = struct {
    /// Whether the door said nothing, which is what every failed step looks
    /// like at every road.
    silent: bool,
    /// The seq the answer named, where there was an answer.
    answer_seq: ?i64 = null,
    /// Whether the answer opened under the padlock the payload carried.
    opened_to_padlock: bool = false,
    /// Whether the answer was signed by the warden's own name.
    signed_by_warden: bool = false,
    /// What step seven decided.
    routing: ?std.meta.Tag(warden.Routing) = null,
};

const max_letters = 3;

const Run = struct {
    steps: [max_letters]Step,
    count: usize,
    /// The highest number the door had honoured when the letters were done.
    mark: i64,
    /// How many times the door was reached at all — a road that filtered a
    /// message above the judgment would show here.
    knocks: usize,
};

/// Play a sequence of letters at a house standing fresh for this road, and
/// report what each came to.
fn play(gpa: std.mem.Allocator, io: std.Io, road: Road, letters: []const House.Letter) !Run {
    std.debug.assert(letters.len <= max_letters);
    var house = try House.init(gpa);
    defer house.deinit();

    var run: Run = .{ .steps = undefined, .count = letters.len, .mark = 0, .knocks = 0 };
    for (letters, 0..) |l, i| {
        house.routing = null;
        const sealed = try house.write(l);
        const answer = try ride(gpa, io, road, &house, sealed);

        if (answer) |bytes| {
            defer gpa.free(bytes);
            // An answer is sealed to the return padlock the ask named, and to
            // no other: the padlock it was not sealed to must not open it.
            var wrong = envelope.open(gpa, house.other_back.secret, .answer, bytes) catch null;
            if (wrong) |*w| w.deinit();

            var opened = envelope.open(gpa, house.back.secret, .answer, bytes) catch null;
            if (opened) |*o| {
                defer o.deinit();
                run.steps[i] = .{
                    .silent = false,
                    .answer_seq = o.payload.answer.seq,
                    .opened_to_padlock = wrong == null,
                    .signed_by_warden = std.mem.eql(u8, &o.payload.answer.warden, &house.door.name),
                    .routing = house.routing,
                };
            } else {
                run.steps[i] = .{ .silent = false, .opened_to_padlock = wrong == null };
            }
        } else {
            run.steps[i] = .{ .silent = true, .routing = house.routing };
        }
    }
    run.mark = house.mark();
    run.knocks = house.knocks;
    return run;
}

/// The public key a seed names, so a case can address a being without
/// standing a house first.
fn pk(secret: Key) !Key {
    return (try arithmetic.signingPair(secret)).public;
}

/// Play the same letters down every road and assert the three roads reached
/// the same judgment before anything else is asserted about it. This is the
/// whole point of the suite: a step waived on one road and not the others is
/// a red here, not an absence.
fn everyRoad(gpa: std.mem.Allocator, io: std.Io, letters: []const House.Letter) !Run {
    var first: ?Run = null;
    for (roads) |road| {
        const run = try play(gpa, io, road, letters);
        const known = first orelse {
            first = run;
            continue;
        };
        try std.testing.expectEqual(known.count, run.count);
        try std.testing.expectEqual(known.mark, run.mark);
        try std.testing.expectEqual(known.knocks, run.knocks);
        for (known.steps[0..known.count], run.steps[0..run.count]) |want, got| {
            try std.testing.expectEqual(want.silent, got.silent);
            try std.testing.expectEqual(want.answer_seq, got.answer_seq);
            try std.testing.expectEqual(want.opened_to_padlock, got.opened_to_padlock);
            try std.testing.expectEqual(want.signed_by_warden, got.signed_by_warden);
            try std.testing.expectEqual(want.routing, got.routing);
        }
    }
    return first.?;
}

// ------------------------------------------------------------- the judgments

test "XII — an ordinary ask is judged and answered the same on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    const run = try everyRoad(gpa, t.io(), &.{.{
        .voice_secret = House.seed.holder,
        .seq = 5,
        .being = try pk(House.seed.thing),
        .method = .{ .name = "poke", .args = "" },
    }});

    try std.testing.expect(!run.steps[0].silent);
    // Step 7: being and method, so the being is invoked and answers.
    try std.testing.expectEqual(@as(?std.meta.Tag(warden.Routing), .invoke), run.steps[0].routing);
    // Step 8: sealed to the return padlock the payload carried, signed by the
    // warden's own name, naming the ask by its seq.
    try std.testing.expect(run.steps[0].opened_to_padlock);
    try std.testing.expect(run.steps[0].signed_by_warden);
    try std.testing.expectEqual(@as(?i64, 5), run.steps[0].answer_seq);
    // Step 5: the number is honoured, and the mark moved to it.
    try std.testing.expectEqual(@as(i64, 5), run.mark);
    try std.testing.expectEqual(@as(usize, 1), run.knocks);
}

test "XII — step 1, bytes that are not an envelope are silence on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    const run = try everyRoad(gpa, t.io(), &.{.{
        .voice_secret = @splat(3),
        .raw = "these bytes were never sealed to anyone",
    }});

    try std.testing.expect(run.steps[0].silent);
    // The door was reached: no road filtered the message above the judgment,
    // and the refusal is the warden's own.
    try std.testing.expectEqual(@as(usize, 1), run.knocks);
    try std.testing.expectEqual(@as(i64, 0), run.mark);
}

test "XII — step 2, a signature that does not verify is silence on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    // The payload names the holder's voice and was signed by another key.
    // The seal is intact and the recipient is right; only the signature is
    // wrong, and the door must not reach step 3 with it.
    const run = try everyRoad(gpa, t.io(), &.{.{
        .voice_secret = House.seed.stranger,
        .voice = try pk(House.seed.holder),
        .seq = 4,
    }});

    try std.testing.expect(run.steps[0].silent);
    try std.testing.expectEqual(@as(i64, 0), run.mark);
}

test "XII — step 3, a payload addressed elsewhere never touches this house's records, on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    // Addressed elsewhere, then the very same number sent again properly.
    // Step 3 is before step 5, so the first spent nothing and the second is
    // still honourable — that is what "never touches this house's records"
    // is read off.
    const run = try everyRoad(gpa, t.io(), &.{
        .{ .voice_secret = House.seed.holder, .recipient = @splat(0xcc), .seq = 6 },
        .{ .voice_secret = House.seed.holder, .seq = 6 },
    });

    try std.testing.expect(run.steps[0].silent);
    try std.testing.expect(!run.steps[1].silent);
    try std.testing.expectEqual(@as(i64, 6), run.mark);
}

test "XII — step 4, a voice no record names is the stranger's case on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    const run = try everyRoad(gpa, t.io(), &.{.{ .voice_secret = House.seed.stranger, .seq = 1 }});

    // A standing at nothing is still answered: the stranger's case is the
    // describe of whatever the warden's own public being exposes, and being
    // local does not make a stranger a holder.
    try std.testing.expect(!run.steps[0].silent);
    try std.testing.expectEqual(@as(?std.meta.Tag(warden.Routing), .stranger), run.steps[0].routing);
    // A stranger spends nothing: it has no row, so no mark is kept for it.
    try std.testing.expectEqual(@as(i64, 0), run.mark);
}

test "XII — step 5, honoured means consumed, and a replay is silence on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    const run = try everyRoad(gpa, t.io(), &.{
        .{ .voice_secret = House.seed.holder, .seq = 3 },
        .{ .voice_secret = House.seed.holder, .seq = 3 },
    });

    try std.testing.expect(!run.steps[0].silent);
    // The same letter a second time, byte for byte. A road that answered it
    // twice would be a road where a replay costs nothing.
    try std.testing.expect(run.steps[1].silent);
    try std.testing.expectEqual(@as(i64, 3), run.mark);
    try std.testing.expectEqual(@as(usize, 2), run.knocks);
}

test "XII — step 6, an exhausted leash is silence and the seq is still spent, on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    // The leash is spent at step 6, after the seq at step 5, so a letter
    // refused for its leash has still consumed its number and cannot be sent
    // again. This is the strictest reading of "waives no step": the order
    // holds too, and a road that ran the steps out of order would show here.
    const run = try everyRoad(gpa, t.io(), &.{
        .{ .voice_secret = House.seed.holder, .seq = 7, .time = 0 },
        .{ .voice_secret = House.seed.holder, .seq = 7 },
    });

    try std.testing.expect(run.steps[0].silent);
    try std.testing.expect(run.steps[1].silent);
    try std.testing.expectEqual(@as(i64, 7), run.mark);
}

test "XII — step 6, a hop count below zero is silence on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    const run = try everyRoad(gpa, t.io(), &.{
        .{ .voice_secret = House.seed.holder, .seq = 1, .hops = -1 },
        // A hop count of zero is a legal leash for a call that goes no
        // further, and no road may narrow that.
        .{ .voice_secret = House.seed.holder, .seq = 2, .hops = 0 },
    });

    try std.testing.expect(run.steps[0].silent);
    try std.testing.expect(!run.steps[1].silent);
}

test "XII — step 7, a being the voice may not reach is silence on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    const run = try everyRoad(gpa, t.io(), &.{
        // A being this door holds and this voice does not reach. Silence
        // rather than an absence: a door that answered "absent" would be
        // confirming the being exists.
        .{ .voice_secret = House.seed.holder, .seq = 1, .being = try pk(House.seed.hidden) },
        // The public being is reachable by everyone, and the road does not
        // change that either.
        .{ .voice_secret = House.seed.holder, .seq = 2, .being = try pk(House.seed.name) },
    });

    try std.testing.expect(run.steps[0].silent);
    try std.testing.expect(!run.steps[1].silent);
    try std.testing.expectEqual(@as(?std.meta.Tag(warden.Routing), .sketch), run.steps[1].routing);
    // Step 7 is after step 5, so the refused being still cost its number.
    try std.testing.expectEqual(@as(i64, 2), run.mark);
}

test "XII — step 7, neither being nor method is the describe of the estate on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    // There is no empty ask, because there is a default one: describe.
    const run = try everyRoad(gpa, t.io(), &.{.{ .voice_secret = House.seed.holder, .seq = 1 }});
    try std.testing.expectEqual(@as(?std.meta.Tag(warden.Routing), .estate), run.steps[0].routing);
}

test "XII — step 8, the answer is sealed to the padlock the payload carried, on all three roads" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();

    const run = try everyRoad(gpa, t.io(), &.{.{ .voice_secret = House.seed.holder, .seq = 1 }});

    // `opened_to_padlock` is true only where the answer opened under the
    // padlock the ask named and refused the one it did not — so a road that
    // handed back a plaintext answer, or one sealed to anything else, is a
    // red here.
    try std.testing.expect(run.steps[0].opened_to_padlock);
    try std.testing.expect(run.steps[0].signed_by_warden);
}

test "IX — the published limit is spent at distance zero too, and it is spent first" {
    const gpa = std.testing.allocator;
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();
    const io = t.io();

    // The limit is what a caller can compute before sending, so it is judged
    // before anything is unsealed — and no road is exempt from it. This is
    // asserted road by road rather than through `everyRoad`, because the
    // limit has to be lowered on the house after the letter is written.
    for (roads) |road| {
        var house = try House.init(gpa);
        defer house.deinit();

        const sealed = try house.write(.{ .voice_secret = house.voice.secret, .seq = 1 });
        house.door.limit = sealed.len - 1;

        const refused = try ride(gpa, io, road, &house, sealed);
        try std.testing.expect(refused == null);
        // Nothing was unsealed, so nothing was spent.
        try std.testing.expectEqual(@as(i64, 0), house.mark());

        house.door.limit = sealed.len;
        const answered = try ride(gpa, io, road, &house, sealed);
        try std.testing.expect(answered != null);
        gpa.free(answered.?);
        try std.testing.expectEqual(@as(i64, 1), house.mark());
    }
}

// ------------------------------------------------ a road is not the core

fn readSource(gpa: std.mem.Allocator, name: []const u8) ![]u8 {
    const path = try std.fs.path.join(gpa, &.{ src_dir, name });
    defer gpa.free(path);
    var t: std.Io.Threaded = .init(gpa, .{});
    defer t.deinit();
    return std.Io.Dir.cwd().readFileAlloc(t.io(), path, gpa, .limited(1 << 20));
}

/// A module's source with its `//!` header dropped, so an assertion about
/// what the code names is not answered by what the prose above it says.
fn code(gpa: std.mem.Allocator, name: []const u8) ![]u8 {
    const text = try readSource(gpa, name);
    defer gpa.free(text);
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(gpa);
    var lines = std.mem.splitScalar(u8, text, '\n');
    while (lines.next()) |l| {
        const bare = std.mem.trimStart(u8, l, " ");
        if (std.mem.startsWith(u8, bare, "//")) continue;
        try out.appendSlice(gpa, l);
        try out.append(gpa, '\n');
    }
    return out.toOwnedSlice(gpa);
}

test "III — distance zero is the road with no wire: it reaches no host at all" {
    const gpa = std.testing.allocator;

    // The other two roads are where the reaching lives; this one needs no
    // wire because no wire exists to disagree about, and it must not have
    // grown one. Zig cannot introspect a module's imports, so the text is
    // what there is to assert against.
    const text = try code(gpa, "zero.zig");
    defer gpa.free(text);
    try std.testing.expect(std.mem.indexOf(u8, text, "std.http") == null);
    try std.testing.expect(std.mem.indexOf(u8, text, "Io.net") == null);
    try std.testing.expect(std.mem.indexOf(u8, text, "std.posix") == null);

    // And it judges nothing: a road that unsealed, verified or placed
    // anything would be a road holding a piece of the judgment, and every
    // one of those lives in a module this road does not import.
    for ([_][]const u8{ "envelope", "warden", "arithmetic", "notation", "wire" }) |core| {
        try std.testing.expect(std.mem.indexOf(u8, text, core) == null);
    }

    // The assertion above is about a separation that exists rather than
    // about absent code: the socketed roads do reach a host.
    for ([_]struct { name: []const u8, needle: []const u8 }{
        .{ .name = "carriage.zig", .needle = "std.http" },
        .{ .name = "line.zig", .needle = "Io.net" },
    }) |road| {
        const road_text = try code(gpa, road.name);
        defer gpa.free(road_text);
        try std.testing.expect(std.mem.indexOf(u8, road_text, road.needle) != null);
    }
}
