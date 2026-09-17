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

/// A `tcp` address: the host as a socket takes it, brackets taken off, and the port.
pub const Address = struct { host: []const u8, port: u16 };

/// `tcp://host:port` as CARRIER-TCP.md writes it, or null. The host is a name or an
/// IPv4 address of RFC 3986, or an IPv6 address in brackets.
pub fn parseAddress(s: []const u8) ?Address {
    const sep = std.mem.indexOf(u8, s, "://") orelse return null;
    if (!std.ascii.eqlIgnoreCase(s[0..sep], "tcp")) return null;
    const auth = s[sep + 3 ..];
    const colon = std.mem.lastIndexOfScalar(u8, auth, ':') orelse return null;
    const digits = auth[colon + 1 ..];
    if (digits.len == 0) return null;
    for (digits) |d| if (!std.ascii.isDigit(d)) return null;
    // A port above a socket's sixteen bits names nothing a dialer can open.
    const port = std.fmt.parseInt(u16, digits, 10) catch return null;
    const host = auth[0..colon];
    if (host.len == 0) return null;
    if (host[0] == '[') {
        if (host.len < 3 or host[host.len - 1] != ']') return null;
        const inner = host[1 .. host.len - 1];
        for (inner) |ch| if (!(std.ascii.isHex(ch) or ch == ':' or ch == '.')) return null;
        return .{ .host = inner, .port = port };
    }
    var i: usize = 0;
    while (i < host.len) : (i += 1) {
        const ch = host[i];
        if (std.ascii.isAlphanumeric(ch) or std.mem.indexOfScalar(u8, "-._~!$&'()*+,;=", ch) != null) continue;
        if (ch == '%' and i + 2 < host.len and std.ascii.isHex(host[i + 1]) and std.ascii.isHex(host[i + 2])) {
            i += 2;
            continue;
        }
        return null;
    }
    return .{ .host = host, .port = port };
}

/// Opens a connection to the first of the host's socket addresses that takes one, or null.
pub fn dial(a: Allocator, at: Address) !?c.fd_t {
    const host = try a.dupeZ(u8, at.host);
    defer a.free(host);
    var port_buf: [6]u8 = undefined;
    const port = std.fmt.bufPrintZ(&port_buf, "{d}", .{at.port}) catch unreachable;
    var hints = std.mem.zeroes(c.addrinfo);
    hints.family = c.AF.UNSPEC;
    hints.socktype = c.SOCK.STREAM;
    var res: ?*c.addrinfo = null;
    if (@intFromEnum(c.getaddrinfo(host, port, &hints, &res)) != 0) return null;
    const first = res orelse return null;
    defer c.freeaddrinfo(first);
    var it: ?*c.addrinfo = first;
    while (it) |ai| : (it = ai.next) {
        const sa = ai.addr orelse continue;
        const fd = c.socket(@intCast(ai.family), @intCast(ai.socktype), @intCast(ai.protocol));
        if (fd < 0) continue;
        noSigpipe(fd);
        if (c.connect(fd, sa, ai.addrlen) != 0) {
            _ = c.close(fd);
            continue;
        }
        const one: c_int = 1;
        _ = c.setsockopt(fd, c.IPPROTO.TCP, c.TCP.NODELAY, &one, @sizeOf(c_int));
        return fd;
    }
    return null;
}

/// Sends one ask on a fresh connection and waits for what answers it. Null is nothing.
pub fn exchange(a: Allocator, at: Address, id: u32, pk: [64]u8, box: []const u8, wait_ms: i64) !?[]u8 {
    const fd = try dial(a, at) orelse return null;
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

const testing = std.testing;

test "tcp addresses" {
    const v4 = parseAddress("tcp://127.0.0.1:9000").?;
    try testing.expectEqualStrings("127.0.0.1", v4.host);
    try testing.expectEqual(@as(u16, 9000), v4.port);
    try testing.expectEqualStrings("::1", parseAddress("tcp://[::1]:1").?.host);
    try testing.expectEqualStrings("example.org", parseAddress("TCP://example.org:65535").?.host);
    const not_ones = [_][]const u8{
        "127.0.0.1:9000",     "tcp://127.0.0.1",       "tcp://127.0.0.1:",
        "tcp://127.0.0.1:-1", "tcp://127.0.0.1:65536", "tcp://127.0.0.1:+80",
        "tcp://:80",          "tcp://h:80/",           "tcp://h:80?q",
        "tcp://h:80#f",       "tcp://u@h:80",          "tcp://[::1:80",
        "tcp://::1:80",       "ws://127.0.0.1:80",     "http://127.0.0.1:80",
        "zz://nowhere",       "tcp://h h:80",          "tcp://h:123456",
    };
    for (not_ones) |s| try testing.expect(parseAddress(s) == null);
}

fn echoBack(ctx: *anyopaque, a: Allocator, pk: [64]u8, box: []const u8) anyerror!?[]u8 {
    _ = ctx;
    if (box.len == 0) return null;
    const out = try a.alloc(u8, box.len + 1);
    out[0] = pk[0];
    @memcpy(out[1..], box);
    return out;
}

test "a dialer reaches a listener by its address, and a nothing frame is nothing" {
    ignoreSigpipe();
    var ctx: u8 = 0;
    const l = try Listener.start(.{ .ctx = &ctx, .answer = echoBack });
    var buf: [32]u8 = undefined;
    const text = try std.fmt.bufPrint(&buf, "tcp://127.0.0.1:{d}", .{l.port});
    const at = parseAddress(text).?;
    const pk = [_]u8{7} ** 64;
    const got = (try exchange(testing.allocator, at, 1, pk, "box", 2000)).?;
    defer testing.allocator.free(got);
    try testing.expectEqualStrings("\x07box", got);
    try testing.expect(try exchange(testing.allocator, at, 2, pk, "", 2000) == null);
    try testing.expect(try exchange(testing.allocator, .{ .host = "127.0.0.1", .port = 1 }, 3, pk, "box", 2000) == null);
}
