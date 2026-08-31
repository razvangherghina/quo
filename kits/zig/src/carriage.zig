//! The common carriage: HTTPS, the one road every warden answers.
//!
//! Article III of the constitution is the whole specification. The carriage
//! is chosen for reach rather than for fit — it arrives through every NAT,
//! firewall and proxy, and out of a browser, which cannot open a socket.
//!
//! The hint a warden published is the URL, posted to exactly as given: one
//! POST, bytes in and bytes out. No path is appended, no query is added, no
//! header is read, no status code carries meaning, and no verb is checked.
//! The response body is the sealed answer; an empty body is silence's wire
//! form. Those two are the whole of what the carriage says back.
//!
//! This module and `line.zig` are the only two in the kit that reach a host.

const std = @import("std");

pub const net = std.Io.net;

pub const Error = error{Refused};

/// What a door answers with. `null` is silence, and silence's wire form here
/// is an empty body — the common carriage needs one because HTTP forces a
/// response.
pub const Answer = ?[]const u8;

/// A door on the common carriage: bytes in, bytes out, and it never learns
/// anything the carriage saw. Everything above the seal is the warden's.
pub const Door = struct {
    context: *anyopaque,
    /// Owns nothing it is handed and returns bytes owned by `gpa`.
    knock: *const fn (context: *anyopaque, gpa: std.mem.Allocator, sealed: []const u8) std.mem.Allocator.Error!Answer,
};

// --------------------------------------------------------------- the calling

pub const PostError = Error || std.mem.Allocator.Error || anyerror;

/// One POST to the hint, exactly as given. The bytes that come back are the
/// answer; no bytes at all is silence. The status is not read, because any
/// meaning in the carriage would be meaning outside the seal, and there is
/// none.
///
/// `cap` bounds what this caller is willing to take back. The article names
/// no cap for this road; it is the caller's own affair and is passed in.
pub fn post(
    gpa: std.mem.Allocator,
    io: std.Io,
    hint: []const u8,
    sealed: []const u8,
    cap: usize,
) PostError!Answer {
    var client: std.http.Client = .{ .allocator = gpa, .io = io };
    defer client.deinit();

    var body: std.Io.Writer.Allocating = .init(gpa);
    defer body.deinit();

    _ = client.fetch(.{
        .location = .{ .url = hint },
        .method = .POST,
        .payload = sealed,
        // The hint is posted to exactly as given: a redirect is somebody
        // else's path, not this one.
        .redirect_behavior = .unhandled,
        .keep_alive = false,
        .response_writer = &body.writer,
    }) catch |e| return e;

    const bytes = body.written();
    if (bytes.len == 0) return null;
    if (bytes.len > cap) return null;
    return try gpa.dupe(u8, bytes);
}

// --------------------------------------------------------------- the serving

pub const ServeError = anyerror;

/// Answer one request on an accepted connection and be done with it.
///
/// Anything that is not a POST of a sealed body carries no unsealable bytes
/// and meets the same silence as any malformed message — so the verb is
/// checked exactly once, here, to decide that it is not a POST and therefore
/// carries nothing; the door is never troubled with it. No header is read
/// for meaning, and the status is always the same because no status code
/// carries meaning.
pub fn serveOnce(
    gpa: std.mem.Allocator,
    io: std.Io,
    stream: net.Stream,
    cap: usize,
    door: Door,
) ServeError!void {
    var in: [4096]u8 = undefined;
    var out: [4096]u8 = undefined;
    var reader = stream.reader(io, &in);
    var writer = stream.writer(io, &out);
    var server = std.http.Server.init(&reader.interface, &writer.interface);

    var request = try server.receiveHead();

    if (request.head.method != .POST) {
        try request.respond("", .{ .keep_alive = false });
        return;
    }

    var body_buf: [4096]u8 = undefined;
    const body_reader = request.readerExpectNone(&body_buf);
    const sealed = body_reader.allocRemaining(gpa, .limited(cap)) catch {
        try request.respond("", .{ .keep_alive = false });
        return;
    };
    defer gpa.free(sealed);

    const answer = try door.knock(door.context, gpa, sealed);
    if (answer) |bytes| {
        defer gpa.free(bytes);
        try request.respond(bytes, .{ .keep_alive = false });
    } else {
        try request.respond("", .{ .keep_alive = false });
    }
}

/// Listen for the common carriage.
pub fn listen(io: std.Io, address: *const net.IpAddress) !net.Server {
    return net.IpAddress.listen(address, io, .{ .reuse_address = true });
}
