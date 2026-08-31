//! The line, asserted from Article III alone — there is no corpus for it.
//! Every test is named for the clause it pins, and a refusal is asserted as
//! strictly as an acceptance. The road is exercised over a real loopback
//! socket bound on an ephemeral port and torn down with the suite; nothing
//! here is faked.

const std = @import("std");
const line = @import("line");
const carriage = @import("carriage");
const envelope = @import("envelope");
const arithmetic = @import("arithmetic");
const src_dir = @import("sources").src_dir;

const net = std.Io.net;

// ------------------------------------------------------------------ the hint

test "III: a bare tcp:// hint promises the default cap of 16,384" {
    const hint = try line.readHint("tcp://example.test:9000");
    try std.testing.expectEqualStrings("example.test", hint.host);
    try std.testing.expectEqual(@as(u16, 9000), hint.port);
    try std.testing.expectEqual(@as(?i64, null), hint.declared_cap);
    try std.testing.expectEqual(@as(i64, 16384), hint.cap());
    try std.testing.expectEqual(@as(i64, 16384), line.default_cap);
}

test "III: a door with a different appetite declares its cap in the hint" {
    const small = try line.readHint("tcp://127.0.0.1:1?cap=64");
    try std.testing.expectEqual(@as(?i64, 64), small.declared_cap);
    try std.testing.expectEqual(@as(i64, 64), small.cap());

    const large = try line.readHint("tcp://127.0.0.1:1?cap=1048576");
    try std.testing.expectEqual(@as(i64, 1048576), large.cap());
}

test "III: an IPv6 literal is written in brackets and the port always after it" {
    const hint = try line.readHint("tcp://[::1]:4400?cap=99");
    try std.testing.expectEqualStrings("::1", hint.host);
    try std.testing.expect(hint.bracketed);
    try std.testing.expectEqual(@as(u16, 4400), hint.port);
    try std.testing.expectEqual(@as(i64, 99), hint.cap());
}

test "III: the port is always written, and a hint without one is not this road's" {
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://example.test"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://example.test:"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://[::1]"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://[::1]4400"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://:9000"));
    // An unbracketed IPv6 literal has no port to read off the end.
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://::1:4400"));
}

test "III: a port of zero and a cap of zero are each no road at all" {
    // A port of zero names a door nothing can be sent to; a cap of zero one
    // nothing can be framed for. Both are refused when offered as a road.
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:0"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://[::1]:0"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:0?cap=1024"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:9000?cap=0"));

    // And the first real port and the first real cap are roads.
    _ = try line.readHint("tcp://h:1");
    _ = try line.readHint("tcp://h:9000?cap=1");
}

test "III: the hint is the cap and nothing after that" {
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:1?cap=64&x=1"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:1?x=1"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:1?cap="));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:1?cap=-1"));
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:1?cap=1x"));
    // No path is part of this road's hint.
    try std.testing.expectError(line.Error.Refused, line.readHint("tcp://h:1/door"));
    // And no other scheme is.
    try std.testing.expectError(line.Error.Refused, line.readHint("https://h:1"));
    try std.testing.expectError(line.Error.Refused, line.readHint("h:1"));
}

test "III: only the listening end has a road to publish, and this is its shape" {
    const gpa = std.testing.allocator;

    const plain = try line.writeHint(gpa, "127.0.0.1", 4400, null);
    defer gpa.free(plain);
    try std.testing.expectEqualStrings("tcp://127.0.0.1:4400", plain);

    const capped = try line.writeHint(gpa, "127.0.0.1", 4400, 64);
    defer gpa.free(capped);
    try std.testing.expectEqualStrings("tcp://127.0.0.1:4400?cap=64", capped);

    const six = try line.writeHint(gpa, "::1", 4400, null);
    defer gpa.free(six);
    try std.testing.expectEqualStrings("tcp://[::1]:4400", six);

    // Every hint this kit writes is a hint this kit reads.
    for ([_][]const u8{ plain, capped, six }) |written| {
        _ = try line.readHint(written);
    }
}

test "III: a warden whose limit is under the default and whose hint declares no cap does not offer the line" {
    try std.testing.expect(!line.offersLine(4096, "tcp://h:1"));
    // Declaring the cap it can actually keep puts it back on the road.
    try std.testing.expect(line.offersLine(4096, "tcp://h:1?cap=4096"));
    // A limit at or above the default needs no declaration.
    try std.testing.expect(line.offersLine(16384, "tcp://h:1"));
    try std.testing.expect(line.offersLine(65536, "tcp://h:1"));
    // A hint that is not a hint offers nothing.
    try std.testing.expect(!line.offersLine(65536, "tcp://h"));
}

// ----------------------------------------------------------------- the frame

test "III: a frame's length is written the way the wire writes an int, and does not count itself" {
    // Pinned bytes, not a round trip: eight bytes, big-endian, two's
    // complement, and the number is the envelope's bytes alone.
    try std.testing.expectEqualSlices(
        u8,
        &.{ 0, 0, 0, 0, 0, 0, 0, 1 },
        &line.writeLength(1),
    );
    try std.testing.expectEqualSlices(
        u8,
        &.{ 0, 0, 0, 0, 0, 0, 0x40, 0x00 },
        &line.writeLength(16384),
    );
    try std.testing.expectEqualSlices(
        u8,
        &.{ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff },
        &line.writeLength(-1),
    );
    try std.testing.expectEqual(@as(usize, 8), line.length_bytes);

    const gpa = std.testing.allocator;
    var out: std.Io.Writer.Allocating = .init(gpa);
    defer out.deinit();
    try line.writeFrame(&out.writer, line.default_cap, "abcde");
    // Five bytes of envelope, and the length in front says five, not thirteen.
    try std.testing.expectEqualSlices(
        u8,
        &.{ 0, 0, 0, 0, 0, 0, 0, 5, 'a', 'b', 'c', 'd', 'e' },
        out.written(),
    );
}

/// Read frames out of a plain byte slice, so the framing rules can be pinned
/// without a socket. The road's own reader is exercised over a real socket
/// further down.
fn framesOf(gpa: std.mem.Allocator, bytes: []const u8, cap: i64) line.ReadError![]u8 {
    var reader: std.Io.Reader = .fixed(bytes);
    return line.readFrame(gpa, &reader, cap);
}

test "III: a zero-length frame is malformed here, though a zero length is legal everywhere else" {
    const gpa = std.testing.allocator;
    try std.testing.expectError(
        line.Framing.Framing,
        framesOf(gpa, &.{ 0, 0, 0, 0, 0, 0, 0, 0 }, line.default_cap),
    );
    // And the sender refuses to make one.
    var out: std.Io.Writer.Allocating = .init(gpa);
    defer out.deinit();
    try std.testing.expectError(line.Error.Refused, line.writeFrame(&out.writer, line.default_cap, ""));
    try std.testing.expectEqual(@as(usize, 0), out.written().len);
}

test "III: a length at or below zero is a framing fault" {
    const gpa = std.testing.allocator;
    try std.testing.expectError(
        line.Framing.Framing,
        framesOf(gpa, &.{ 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff }, line.default_cap),
    );
    // The most negative int, which is a legal int and an illegal length.
    try std.testing.expectError(
        line.Framing.Framing,
        framesOf(gpa, &.{ 0x80, 0, 0, 0, 0, 0, 0, 0 }, line.default_cap),
    );
}

test "III: a length above the receiving end's cap is a framing fault" {
    const gpa = std.testing.allocator;
    var over: [8 + 65]u8 = @splat('x');
    @memcpy(over[0..8], &line.writeLength(65));
    try std.testing.expectError(line.Framing.Framing, framesOf(gpa, &over, 64));

    // Exactly at the cap is not over it.
    const at = try framesOf(gpa, over[0 .. 8 + 65], 65);
    defer gpa.free(at);
    try std.testing.expectEqual(@as(usize, 65), at.len);
}

test "III: a body the connection ends before delivering is the fault having already happened" {
    const gpa = std.testing.allocator;
    // A length of five with three bytes behind it.
    try std.testing.expectError(
        line.Framing.Framing,
        framesOf(gpa, &.{ 0, 0, 0, 0, 0, 0, 0, 5, 'a', 'b', 'c' }, line.default_cap),
    );
    // A length the connection ended in the middle of is the same fault.
    try std.testing.expectError(
        error.EndOfStream,
        framesOf(gpa, &.{ 0, 0, 0 }, line.default_cap),
    );
    // Nothing at all is a clean close between frames, which is weather.
    try std.testing.expectError(
        error.EndOfStream,
        framesOf(gpa, &.{}, line.default_cap),
    );
}

test "III: a sender stays at or under the cap the far road promised" {
    const gpa = std.testing.allocator;
    var out: std.Io.Writer.Allocating = .init(gpa);
    defer out.deinit();

    const body: [65]u8 = @splat('x');
    // Refused in the sender's own kit, and no byte reaches the wire.
    try std.testing.expectError(line.Error.Refused, line.writeFrame(&out.writer, 64, &body));
    try std.testing.expectEqual(@as(usize, 0), out.written().len);

    // Exactly at the cap goes.
    try line.writeFrame(&out.writer, 65, &body);
    try std.testing.expectEqual(@as(usize, 8 + 65), out.written().len);
}

test "III: the frame's whole vocabulary is the length, and the bytes behind it are untouched" {
    const gpa = std.testing.allocator;
    var out: std.Io.Writer.Allocating = .init(gpa);
    defer out.deinit();

    // Two frames back to back on one connection, read one after the other.
    try line.writeFrame(&out.writer, line.default_cap, "first");
    try line.writeFrame(&out.writer, line.default_cap, "second");

    var reader: std.Io.Reader = .fixed(out.written());
    const a = try line.readFrame(gpa, &reader, line.default_cap);
    defer gpa.free(a);
    const b = try line.readFrame(gpa, &reader, line.default_cap);
    defer gpa.free(b);
    try std.testing.expectEqualStrings("first", a);
    try std.testing.expectEqualStrings("second", b);
    try std.testing.expectError(error.EndOfStream, line.readFrame(gpa, &reader, line.default_cap));
}

// ------------------------------------------------------------ the real road

const Peer = struct {
    server: net.Server,
    io: std.Io,

    /// What the far end did, read back by the test after the line closed.
    got: [4][]u8 = @splat(&.{}),
    got_n: usize = 0,
    framing_fault: bool = false,
    ended: bool = false,
    /// The cap this end holds for what arrives.
    cap: i64 = line.default_cap,
    /// Answer every well-formed frame by echoing it back, unless this is set,
    /// in which case the ask is refused and no frame is produced at all.
    silent: bool = false,
    gpa: std.mem.Allocator,

    fn hint(self: *Peer, gpa: std.mem.Allocator, declared: ?i64) ![]u8 {
        return line.writeHint(gpa, "127.0.0.1", self.server.socket.address.getPort(), declared);
    }

    /// One connection, read until the line ends. Each end reads while it
    /// writes; this end answers each frame as it lands.
    fn run(self: *Peer) void {
        const stream = self.server.accept(self.io) catch return;
        defer stream.close(self.io);

        var in: [4096]u8 = undefined;
        var out: [4096]u8 = undefined;
        var reader = stream.reader(self.io, &in);
        var writer = stream.writer(self.io, &out);

        while (true) {
            const frame = line.readFrame(self.gpa, &reader.interface, self.cap) catch |e| {
                // Only a framing fault ends the connection, and it ends
                // without a word.
                if (e == error.Framing) self.framing_fault = true;
                self.ended = true;
                return;
            };
            if (self.got_n < self.got.len) {
                self.got[self.got_n] = frame;
                self.got_n += 1;
            } else {
                self.gpa.free(frame);
            }
            // Silence has no wire form on a line: a refused ask produces no
            // frame at all.
            if (self.silent) continue;
            line.writeFrame(&writer.interface, line.default_cap, frame) catch {
                self.ended = true;
                return;
            };
        }
    }

    fn deinit(self: *Peer) void {
        for (self.got[0..self.got_n]) |g| self.gpa.free(g);
        self.server.deinit(self.io);
    }
};

fn loopback(io: std.Io) !net.Server {
    // An ephemeral port on the loopback, torn down with the suite.
    const address: net.IpAddress = .{ .ip4 = .loopback(0) };
    return line.listen(io, &address);
}

test "III: a real line carries framed envelopes both ways on one connection" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var peer: Peer = .{ .server = loopback(io) catch return error.SkipZigTest, .io = io, .gpa = gpa };
    defer peer.deinit();

    const published = try peer.hint(gpa, null);
    defer gpa.free(published);
    const read = try line.readHint(published);
    try std.testing.expectEqual(@as(i64, line.default_cap), read.cap());

    const thread = try std.Thread.spawn(.{}, Peer.run, .{&peer});

    const address: net.IpAddress = .{ .ip4 = .loopback(read.port) };
    const stream = try line.dial(io, &address);

    var in: [4096]u8 = undefined;
    var out: [4096]u8 = undefined;
    var reader = stream.reader(io, &in);
    var writer = stream.writer(io, &out);

    // A whole sealed envelope, so what rides the line is what the law says
    // rides it.
    const voice = try arithmetic.signingPair(@splat(7));
    const lock = try arithmetic.sealingPair(@splat(9));
    const sealed = try envelope.seal(gpa, @splat(11), lock.public, voice.secret, .{ .say = .{
        .voice = voice.public,
        .recipient = lock.public,
        .padlock = lock.public,
        .seq = 1,
        .allowance = .{ .time = 0, .hops = 1 },
    } });
    defer gpa.free(sealed);

    try line.writeFrame(&writer.interface, read.cap(), sealed);
    const back = try line.readFrame(gpa, &reader.interface, line.default_cap);
    defer gpa.free(back);
    try std.testing.expectEqualSlices(u8, sealed, back);

    // And the envelope that came back off the line still opens.
    var opened = try envelope.open(gpa, lock.secret, .say, back);
    defer opened.deinit();
    try std.testing.expectEqual(@as(i64, 1), opened.payload.say.seq);

    stream.close(io);
    thread.join();
    try std.testing.expect(!peer.framing_fault);
    try std.testing.expectEqual(@as(usize, 1), peer.got_n);
}

test "III: a well-formed frame the door refuses is ordinary silence and the line lives on" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var peer: Peer = .{
        .server = loopback(io) catch return error.SkipZigTest,
        .io = io,
        .gpa = gpa,
        .silent = true,
    };
    defer peer.deinit();

    const port = peer.server.socket.address.getPort();
    const thread = try std.Thread.spawn(.{}, Peer.run, .{&peer});

    const address: net.IpAddress = .{ .ip4 = .loopback(port) };
    const stream = try line.dial(io, &address);
    var out: [4096]u8 = undefined;
    var writer = stream.writer(io, &out);

    // Two asks, both refused above the road. No frame comes back for either,
    // and the connection is still there for the second.
    try line.writeFrame(&writer.interface, line.default_cap, "one");
    try line.writeFrame(&writer.interface, line.default_cap, "two");

    stream.close(io);
    thread.join();

    try std.testing.expectEqual(@as(usize, 2), peer.got_n);
    // The line never took a framing fault: silence cost it nothing.
    try std.testing.expect(!peer.framing_fault);
    try std.testing.expectEqualStrings("one", peer.got[0]);
    try std.testing.expectEqualStrings("two", peer.got[1]);
}

test "III: only a framing fault ends the connection, and it ends without a word" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var peer: Peer = .{
        .server = loopback(io) catch return error.SkipZigTest,
        .io = io,
        .gpa = gpa,
        .cap = 8,
    };
    defer peer.deinit();

    const port = peer.server.socket.address.getPort();
    const thread = try std.Thread.spawn(.{}, Peer.run, .{&peer});

    const address: net.IpAddress = .{ .ip4 = .loopback(port) };
    const stream = try line.dial(io, &address);
    var in: [4096]u8 = undefined;
    var out: [4096]u8 = undefined;
    var reader = stream.reader(io, &in);
    var writer = stream.writer(io, &out);

    // Written past the far end's declared cap on purpose, which the far end
    // cannot frame. `writeFrame` would refuse this, so the bytes are laid
    // down by hand — the point is what the receiving end does.
    const body: [9]u8 = @splat('x');
    try writer.interface.writeAll(&line.writeLength(9));
    try writer.interface.writeAll(&body);
    try writer.interface.flush();

    // Not a word comes back; the connection is simply over.
    const answer = line.readFrame(gpa, &reader.interface, line.default_cap);
    try std.testing.expectError(error.EndOfStream, answer);

    stream.close(io);
    thread.join();
    try std.testing.expect(peer.framing_fault);
    try std.testing.expectEqual(@as(usize, 0), peer.got_n);
}

// -------------------------------------------------- a road is not the core

/// The kit's own source, read so the separation can be asserted rather than
/// observed. Zig cannot introspect a module's imports, so the text is what
/// there is to assert against.
fn readSource(gpa: std.mem.Allocator, name: []const u8) ![]u8 {
    const path = try std.fs.path.join(gpa, &.{ src_dir, name });
    defer gpa.free(path);
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    return std.Io.Dir.cwd().readFileAlloc(threaded.io(), path, gpa, .limited(1 << 20));
}

test "the five below never reach a host: no core module imports std.Io.net or std.http" {
    const gpa = std.testing.allocator;

    const core = [_][]const u8{
        "notation.zig",
        "arithmetic.zig",
        "wire.zig",
        "envelope.zig",
        "warden.zig",
    };
    for (core) |name| {
        const text = try readSource(gpa, name);
        defer gpa.free(text);
        try std.testing.expect(std.mem.indexOf(u8, text, "Io.net") == null);
        try std.testing.expect(std.mem.indexOf(u8, text, "std.http") == null);
        try std.testing.expect(std.mem.indexOf(u8, text, "std.posix") == null);
    }

    // And the two roads are where the reaching lives, so the assertion above
    // is about a separation that exists rather than about absent code.
    const roads = [_]struct { name: []const u8, needle: []const u8 }{
        .{ .name = "line.zig", .needle = "Io.net" },
        .{ .name = "carriage.zig", .needle = "std.http" },
    };
    for (roads) |road| {
        const text = try readSource(gpa, road.name);
        defer gpa.free(text);
        try std.testing.expect(std.mem.indexOf(u8, text, road.needle) != null);
    }
}

// **A warden offers as many roads as it has and a caller tries them.** Choosing
// among them is the caller's whole job, and nothing at a call site says which
// road was taken.
test "III: a caller takes the road it can speak, and is told nothing about which" {
    const gpa = std.testing.allocator;
    const io = std.testing.io;

    var peer: Peer = .{ .server = loopback(io) catch return error.SkipZigTest, .io = io, .gpa = gpa };
    defer peer.deinit();
    const published = try peer.hint(gpa, null);
    defer gpa.free(published);

    const thread = try std.Thread.spawn(.{}, Peer.run, .{&peer});

    // The house stands on the line and ranks nothing. The caller is handed the
    // roads and picks the one it can speak — never told to, never given an
    // option that names a road.
    const hints = [_][]const u8{ "https://ground.example/door", published };
    const sealed = [_]u8{ 1, 2, 3, 4, 5, 6, 7, 8 };
    var caller: line.Caller = .{};
    defer caller.hangUp(gpa);
    const back = try caller.send(gpa, io, &hints, &sealed, 4096);
    try std.testing.expect(back != null);
    defer gpa.free(back.?);
    try std.testing.expectEqualSlices(u8, &sealed, back.?);

    // The line is the caller's until it puts it down, and the far end is still
    // on it: it only reads end-of-stream once this end hangs up.
    caller.hangUp(gpa);
    thread.join();
}

// **Frames flow both directions on one connection**, and the dialing end is
// reachable down the lines it holds and nowhere else. A caller that dialled
// afresh per ask would be the common carriage wearing a socket.
test "III: the caller keeps the line it dialled, one per road" {
    const gpa = std.testing.allocator;
    var threaded: std.Io.Threaded = .init(gpa, .{});
    defer threaded.deinit();
    const io = threaded.io();

    var peer: Peer = .{ .server = loopback(io) catch return error.SkipZigTest, .io = io, .gpa = gpa };
    defer peer.deinit();
    const published = try peer.hint(gpa, null);
    defer gpa.free(published);

    // One connection is accepted and never re-accepted: everything below rides
    // it or rides nothing.
    const thread = try std.Thread.spawn(.{}, Peer.run, .{&peer});

    const hints = [_][]const u8{published};
    var caller: line.Caller = .{};
    defer caller.hangUp(gpa);

    for ([_]u8{ 1, 2, 3 }) |mark| {
        const sealed = [_]u8{ mark, mark, mark, mark };
        const back = try caller.send(gpa, io, &hints, &sealed, 4096);
        try std.testing.expect(back != null);
        defer gpa.free(back.?);
        try std.testing.expectEqualSlices(u8, &sealed, back.?);
    }

    // Three asks, one road, one line — and a hint is matched byte for byte as
    // written, which is what makes it the key it is held under.
    try std.testing.expectEqual(@as(u32, 1), caller.held.count());

    caller.hangUp(gpa);
    thread.join();
    // The far end saw three frames on the one connection it ever accepted.
    try std.testing.expectEqual(@as(usize, 3), peer.got_n);
}

// A road this caller cannot speak is not a road that failed. Nothing was sent
// down it, so no door spoke and no road broke: it is neither silence nor
// weather, and a list of nothing but such roads is no road tried at all.
test "III: a road the caller cannot speak is not a road that failed" {
    const gpa = std.testing.allocator;
    const io = std.testing.io;

    // A hint this road cannot read at all: skipped, not raised, and there is
    // no fault to report the road of.
    const unspeakable = [_][]const u8{"tcp://no-port-here"};
    var caller: line.Caller = .{};
    defer caller.hangUp(gpa);
    try std.testing.expectEqual(
        @as(carriage.Answer, null),
        try caller.send(gpa, io, &unspeakable, &.{1}, 4096),
    );
    // Nothing was sent down it, so nothing was taken up either.
    try std.testing.expectEqual(@as(u32, 0), caller.held.count());
}
