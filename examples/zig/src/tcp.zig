//! Quo over TCP: the frames of CARRIER-TCP.md, one listener and a dialer, over libc sockets.
const std = @import("std");
const c = std.c;
const Allocator = std.mem.Allocator;

pub const max_body: u32 = 1_048_645;
pub const kind_ask: u8 = 0;
pub const kind_reply: u8 = 1;
pub const kind_nothing: u8 = 2;

extern "c" fn signal(sig: c_int, handler: usize) usize;
extern "c" fn gettimeofday(tv: *c.timeval, tz: ?*anyopaque) c_int;

/// A write to a closed connection is an error, never a signal.
pub fn ignoreSigpipe() void {
    _ = signal(13, 1);
}

fn nowMs() i64 {
    var tv: c.timeval = undefined;
    _ = gettimeofday(&tv, null);
    return @as(i64, tv.sec) * 1000 + @divTrunc(@as(i64, tv.usec), 1000);
}

pub fn close(fd: c.fd_t) void {
    _ = c.shutdown(fd, 2);
    _ = c.close(fd);
}

pub fn writeAll(fd: c.fd_t, bytes: []const u8) bool {
    var at: usize = 0;
    while (at < bytes.len) {
        const n = c.write(fd, bytes.ptr + at, bytes.len - at);
        if (n <= 0) return false;
        at += @intCast(n);
    }
    return true;
}

/// Reads exactly buf.len bytes. With a deadline, gives up when it passes.
fn readFull(fd: c.fd_t, buf: []u8, deadline: ?i64) bool {
    var at: usize = 0;
    while (at < buf.len) {
        if (deadline) |d| {
            const left = d - nowMs();
            if (left <= 0) return false;
            var p = [_]c.pollfd{.{ .fd = fd, .events = c.POLL.IN, .revents = 0 }};
            const r = c.poll(&p, 1, @intCast(@min(left, 60_000)));
            if (r < 0) return false;
            if (r == 0) continue;
        }
        const n = c.read(fd, buf.ptr + at, buf.len - at);
        if (n <= 0) return false;
        at += @intCast(n);
    }
    return true;
}

pub const Frame = struct {
    kind: u8,
    id: u32,
    /// The ward pk on an ask, sixty-four bytes.
    pk: [64]u8 = undefined,
    /// The box on an ask or a reply.
    box: []u8 = &.{},
};

/// Reads one frame. Null where the stream closed, the deadline passed, or the bytes are no frame.
pub fn readFrame(a: Allocator, fd: c.fd_t, deadline: ?i64) !?Frame {
    var len_buf: [4]u8 = undefined;
    if (!readFull(fd, &len_buf, deadline)) return null;
    const len = std.mem.readInt(u32, &len_buf, .big);
    if (len > max_body or len < 5) return null;
    var kind: [1]u8 = undefined;
    if (!readFull(fd, &kind, deadline)) return null;
    switch (kind[0]) {
        kind_ask => if (len < 69) return null,
        kind_reply => {},
        kind_nothing => if (len != 5) return null,
        else => return null,
    }
    var id_buf: [4]u8 = undefined;
    if (!readFull(fd, &id_buf, deadline)) return null;
    var f: Frame = .{ .kind = kind[0], .id = std.mem.readInt(u32, &id_buf, .big) };
    var rest_len: usize = len - 5;
    if (f.kind == kind_ask) {
        if (!readFull(fd, &f.pk, deadline)) return null;
        rest_len -= 64;
    }
    const rest = try a.alloc(u8, rest_len);
    if (!readFull(fd, rest, deadline)) {
        a.free(rest);
        return null;
    }
    f.box = rest;
    return f;
}

pub fn writeFrame(a: Allocator, fd: c.fd_t, kind: u8, id: u32, pk: ?[64]u8, box: []const u8) !bool {
    const pk_len: usize = if (pk != null) 64 else 0;
    const out = try a.alloc(u8, 9 + pk_len + box.len);
    defer a.free(out);
    std.mem.writeInt(u32, out[0..4], @intCast(5 + pk_len + box.len), .big);
    out[4] = kind;
    std.mem.writeInt(u32, out[5..9], id, .big);
    if (pk) |p| out[9..73].* = p;
    @memcpy(out[9 + pk_len ..], box);
    return writeAll(fd, out);
}

fn noSigpipe(fd: c.fd_t) void {
    if (@hasDecl(c.SO, "NOSIGPIPE")) {
        const one: c_int = 1;
        _ = c.setsockopt(fd, c.SOL.SOCKET, c.SO.NOSIGPIPE, &one, @sizeOf(c_int));
    }
}

/// "host:port" with an IPv4 host.
pub fn parseAt(at: []const u8) ?c.sockaddr.in {
    const colon = std.mem.lastIndexOfScalar(u8, at, ':') orelse return null;
    const port = std.fmt.parseInt(u16, at[colon + 1 ..], 10) catch return null;
    if (port == 0) return null;
    const host = if (std.mem.eql(u8, at[0..colon], "localhost")) "127.0.0.1" else at[0..colon];
    var octets: [4]u8 = undefined;
    var it = std.mem.splitScalar(u8, host, '.');
    var n: usize = 0;
    while (it.next()) |part| : (n += 1) {
        if (n == 4) return null;
        octets[n] = std.fmt.parseInt(u8, part, 10) catch return null;
    }
    if (n != 4) return null;
    var sa: c.sockaddr.in = .{ .port = std.mem.nativeToBig(u16, port), .addr = @bitCast(octets) };
    _ = &sa;
    return sa;
}

/// Opens a connection, or null.
pub fn dial(at: []const u8) ?c.fd_t {
    const sa = parseAt(at) orelse return null;
    const fd = c.socket(c.AF.INET, c.SOCK.STREAM, 0);
    if (fd < 0) return null;
    noSigpipe(fd);
    if (c.connect(fd, @ptrCast(&sa), @sizeOf(c.sockaddr.in)) != 0) {
        _ = c.close(fd);
        return null;
    }
    const one: c_int = 1;
    _ = c.setsockopt(fd, c.IPPROTO.TCP, c.TCP.NODELAY, &one, @sizeOf(c_int));
    return fd;
}

/// Sends one ask on a fresh connection and waits for what answers it. Null is nothing.
pub fn exchange(a: Allocator, at: []const u8, id: u32, pk: [64]u8, box: []const u8, wait_ms: i64) !?[]u8 {
    const fd = dial(at) orelse return null;
    defer close(fd);
    if (!try writeFrame(a, fd, kind_ask, id, pk, box)) return null;
    const deadline = nowMs() + wait_ms;
    while (true) {
        const f = try readFrame(a, fd, deadline) orelse return null;
        // An ask at a dialer, and an answer to another id, are read and let be.
        if (f.kind == kind_ask or f.id != id) {
            a.free(f.box);
            continue;
        }
        if (f.kind == kind_nothing) return null;
        return f.box;
    }
}

/// Answers one ask: the reply box, or null for a nothing frame.
pub const Handler = struct {
    ctx: *anyopaque,
    answer: *const fn (ctx: *anyopaque, a: Allocator, pk: [64]u8, box: []const u8) anyerror!?[]u8,
};

pub const Listener = struct {
    fd: c.fd_t,
    port: u16,
    handler: Handler,

    pub fn start(handler: Handler) !*Listener {
        const fd = c.socket(c.AF.INET, c.SOCK.STREAM, 0);
        if (fd < 0) return error.NoSocket;
        var sa: c.sockaddr.in = .{ .port = 0, .addr = @bitCast([4]u8{ 127, 0, 0, 1 }) };
        if (c.bind(fd, @ptrCast(&sa), @sizeOf(c.sockaddr.in)) != 0) return error.NoBind;
        if (c.listen(fd, 64) != 0) return error.NoListen;
        var len: c.socklen_t = @sizeOf(c.sockaddr.in);
        if (c.getsockname(fd, @ptrCast(&sa), &len) != 0) return error.NoName;
        const self = try std.heap.c_allocator.create(Listener);
        self.* = .{ .fd = fd, .port = std.mem.bigToNative(u16, sa.port), .handler = handler };
        const t = try std.Thread.spawn(.{}, acceptLoop, .{self});
        t.detach();
        return self;
    }

    fn acceptLoop(self: *Listener) void {
        while (true) {
            const conn = c.accept(self.fd, null, null);
            if (conn < 0) continue;
            noSigpipe(conn);
            const one: c_int = 1;
            _ = c.setsockopt(conn, c.IPPROTO.TCP, c.TCP.NODELAY, &one, @sizeOf(c_int));
            const t = std.Thread.spawn(.{}, serve, .{ self, conn }) catch {
                _ = c.close(conn);
                continue;
            };
            t.detach();
        }
    }

    /// Answers every ask on one connection, in turn, until the stream ends or is no frame.
    fn serve(self: *Listener, fd: c.fd_t) void {
        defer close(fd);
        const gpa = std.heap.c_allocator;
        while (true) {
            var arena = std.heap.ArenaAllocator.init(gpa);
            defer arena.deinit();
            const a = arena.allocator();
            const f = (readFrame(a, fd, null) catch return) orelse return;
            if (f.kind != kind_ask) continue;
            const reply = self.handler.answer(self.handler.ctx, a, f.pk, f.box) catch null;
            const ok = if (reply) |r|
                writeFrame(a, fd, kind_reply, f.id, null, r) catch false
            else
                writeFrame(a, fd, kind_nothing, f.id, null, &.{}) catch false;
            if (!ok) return;
        }
    }
};
