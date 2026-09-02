//! The common carriage, asserted from Article III alone — there is no corpus
//! for it. Every test is named for the clause it pins, and a refusal is
//! asserted as strictly as an acceptance.
//!
//! The road is exercised over a real HTTP door bound on an ephemeral
//! loopback port and torn down with the suite. It is HTTP rather than HTTPS
//! because TLS is redundant crypto Quo relies on for no guarantee — the
//! carriage's promises are about the POST, the body and the silence, and
//! none of them is a TLS promise.

const std = @import("std");
const carriage = @import("carriage");
const src_dir = @import("sources").src_dir;

const net = std.Io.net;

/// A door that records what arrived and answers whatever it was told to.
const Recorder = struct {
    gpa: std.mem.Allocator,
    /// What the door was handed, if it was handed anything.
    heard: ?[]u8 = null,
    knocks: usize = 0,
    /// The bytes to answer with, or `null` for silence.
    answer: ?[]const u8 = null,

    fn knock(context: *anyopaque, gpa: std.mem.Allocator, sealed: []const u8) std.mem.Allocator.Error!carriage.Answer {
        const self: *Recorder = @ptrCast(@alignCast(context));
        self.knocks += 1;
        if (self.heard) |old| self.gpa.free(old);
        self.heard = try self.gpa.dupe(u8, sealed);
        const reply = self.answer orelse return null;
        return try gpa.dupe(u8, reply);
    }

    fn door(self: *Recorder) carriage.Door {
        return .{ .context = self, .knock = knock };
    }

    fn deinit(self: *Recorder) void {
        if (self.heard) |h| self.gpa.free(h);
    }
};

const Ground = struct {
    server: net.Server,
    io: std.Io,
    gpa: std.mem.Allocator,
    door: carriage.Door,
    /// How many requests to answer before the ground goes away.
    rounds: usize = 1,
    failed: bool = false,

    fn run(self: *Ground) void {
        var left = self.rounds;
        while (left > 0) : (left -= 1) {
            const stream = self.server.accept(self.io) catch {
                self.failed = true;
                return;
            };
            defer stream.close(self.io);
            carriage.serveOnce(self.gpa, self.io, stream, 1 << 20, self.door) catch {
                self.failed = true;
                return;
            };
        }
    }

    fn hint(self: *Ground, gpa: std.mem.Allocator) ![]u8 {
        return std.fmt.allocPrint(gpa, "http://127.0.0.1:{d}/", .{self.server.socket.address.getPort()});
    }
};

fn loopback(io: std.Io) !net.Server {
    const address: net.IpAddress = .{ .ip4 = .loopback(0) };
    return carriage.listen(io, &address);
}

test "III: one POST, bytes in and bytes out, and the response body is the sealed answer" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var recorder: Recorder = .{ .gpa = gpa, .answer = "the sealed answer" };
    defer recorder.deinit();

    var ground: Ground = .{
        .server = loopback(io) catch return error.SkipZigTest,
        .io = io,
        .gpa = gpa,
        .door = recorder.door(),
    };
    defer ground.server.deinit(io);

    const hint = try ground.hint(gpa);
    defer gpa.free(hint);

    const thread = try std.Thread.spawn(.{}, Ground.run, .{&ground});
    const answer = try carriage.post(gpa, io, hint, "the sealed ask", 1 << 20);
    thread.join();

    try std.testing.expect(!ground.failed);
    try std.testing.expectEqual(@as(usize, 1), recorder.knocks);
    try std.testing.expectEqualStrings("the sealed ask", recorder.heard.?);
    try std.testing.expect(answer != null);
    defer gpa.free(answer.?);
    try std.testing.expectEqualStrings("the sealed answer", answer.?);
}

test "III: an empty body is silence's wire form" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    // The door answers nothing, which is what a failed judgment looks like at
    // every one of its eight steps.
    var recorder: Recorder = .{ .gpa = gpa, .answer = null };
    defer recorder.deinit();

    var ground: Ground = .{
        .server = loopback(io) catch return error.SkipZigTest,
        .io = io,
        .gpa = gpa,
        .door = recorder.door(),
    };
    defer ground.server.deinit(io);

    const hint = try ground.hint(gpa);
    defer gpa.free(hint);

    const thread = try std.Thread.spawn(.{}, Ground.run, .{&ground});
    const answer = try carriage.post(gpa, io, hint, "the sealed ask", 1 << 20);
    thread.join();

    try std.testing.expect(!ground.failed);
    try std.testing.expectEqual(@as(usize, 1), recorder.knocks);
    // The door was reached and said nothing, and the caller cannot tell that
    // apart from any other failure — which is the point.
    try std.testing.expectEqual(@as(carriage.Answer, null), answer);
}

test "III: anything that is not a POST of a sealed body meets the same silence" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var recorder: Recorder = .{ .gpa = gpa, .answer = "would have answered" };
    defer recorder.deinit();

    var ground: Ground = .{
        .server = loopback(io) catch return error.SkipZigTest,
        .io = io,
        .gpa = gpa,
        .door = recorder.door(),
        .rounds = 3,
    };
    defer ground.server.deinit(io);

    const port = ground.server.socket.address.getPort();
    const url = try std.fmt.allocPrint(gpa, "http://127.0.0.1:{d}/", .{port});
    defer gpa.free(url);

    const thread = try std.Thread.spawn(.{}, Ground.run, .{&ground});

    var client: std.http.Client = .{ .allocator = gpa, .io = io };
    defer client.deinit();

    // A verb with no body, and two carrying the very bytes a POST would have
    // carried — the verb is the whole of what makes them silence.
    const wrong = [_]struct { verb: std.http.Method, payload: ?[]const u8 }{
        .{ .verb = .GET, .payload = null },
        .{ .verb = .PUT, .payload = "the sealed ask" },
        .{ .verb = .PATCH, .payload = "the sealed ask" },
    };
    for (wrong) |attempt| {
        var body: std.Io.Writer.Allocating = .init(gpa);
        defer body.deinit();
        _ = try client.fetch(.{
            .location = .{ .url = url },
            .method = attempt.verb,
            .payload = attempt.payload,
            .keep_alive = false,
            .redirect_behavior = .unhandled,
            .response_writer = &body.writer,
        });
        // Silence, in the only form this road has for it.
        try std.testing.expectEqual(@as(usize, 0), body.written().len);
    }
    thread.join();

    try std.testing.expect(!ground.failed);
    // And the door was never troubled: a verb that is not POST carries no
    // unsealable bytes, so nothing above the carriage ever learned of it.
    try std.testing.expectEqual(@as(usize, 0), recorder.knocks);
}

test "III: no status code carries meaning, so an answer under one is still the answer" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var ground = try oddStatusGround(io);
    defer ground.server.deinit(io);

    const hint = try std.fmt.allocPrint(gpa, "http://127.0.0.1:{d}/", .{ground.server.socket.address.getPort()});
    defer gpa.free(hint);

    const thread = try std.Thread.spawn(.{}, OddStatus.run, .{&ground});
    const answer = try carriage.post(gpa, io, hint, "the sealed ask", 1 << 20);
    thread.join();

    try std.testing.expect(answer != null);
    defer gpa.free(answer.?);
    // A 500 with bytes in it is bytes; the caller never looked at the number.
    try std.testing.expectEqualStrings("sealed under a five hundred", answer.?);
}

/// A door that answers with a status nobody should read. It is written here
/// rather than in `carriage.zig` because the kit's own door has one status
/// and needs no other.
const OddStatus = struct {
    server: net.Server,
    io: std.Io,

    fn run(self: *OddStatus) void {
        const stream = self.server.accept(self.io) catch return;
        defer stream.close(self.io);
        var in: [4096]u8 = undefined;
        var out: [4096]u8 = undefined;
        var reader = stream.reader(self.io, &in);
        var writer = stream.writer(self.io, &out);
        var server = std.http.Server.init(&reader.interface, &writer.interface);
        var request = server.receiveHead() catch return;
        var body_buf: [4096]u8 = undefined;
        const body_reader = request.readerExpectNone(&body_buf);
        _ = body_reader.discardRemaining() catch {};
        request.respond("sealed under a five hundred", .{
            .status = .internal_server_error,
            .keep_alive = false,
        }) catch {};
    }
};

fn oddStatusGround(io: std.Io) !OddStatus {
    return .{ .server = loopback(io) catch return error.SkipZigTest, .io = io };
}

test "III: many wardens may stand behind one hint, and the carriage never reads one" {
    // Quo never parses a hint: it is an opaque string the carriage
    // understands. The carriage's only claim is that it posts to the string
    // it was given, so a string that is not a URL is the carriage's own
    // failure and never a protocol judgment.
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    try std.testing.expectError(
        error.InvalidFormat,
        carriage.post(gpa, io, "not a url at all", "bytes", 1 << 20),
    );
    try std.testing.expectError(
        error.UnsupportedUriScheme,
        carriage.post(gpa, io, "tcp://127.0.0.1:1", "bytes", 1 << 20),
    );
}

fn readSource(gpa: std.mem.Allocator, name: []const u8) ![]u8 {
    const path = try std.fs.path.join(gpa, &.{ src_dir, name });
    defer gpa.free(path);
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    return std.Io.Dir.cwd().readFileAlloc(threaded.io(), path, gpa, .limited(1 << 20));
}

test "nothing above the roads reaches a host: the carriage is where std.http lives" {
    const gpa = std.testing.allocator;

    const above = [_][]const u8{
        "notation.zig",
        "arithmetic.zig",
        "wire.zig",
        "envelope.zig",
        "warden.zig",
        "quo.zig",
    };
    for (above) |name| {
        const text = try readSource(gpa, name);
        defer gpa.free(text);
        try std.testing.expect(std.mem.indexOf(u8, text, "std.http") == null);
        try std.testing.expect(std.mem.indexOf(u8, text, "Io.net") == null);
    }

    const road = try readSource(gpa, "carriage.zig");
    defer gpa.free(road);
    try std.testing.expect(std.mem.indexOf(u8, road, "std.http") != null);
}
