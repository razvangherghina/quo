//! `stand`: HARNESS.md parts one and two, over stdin and stdout.
const std = @import("std");
const c = std.c;
const Allocator = std.mem.Allocator;
const Writer = std.Io.Writer;
const quo = @import("quo");
const tcp = @import("tcp.zig");
const Json = quo.Json;

/// How long `send` waits for its answer.
const wait_ms = 8000;

/// The longest listener address: `tcp://127.0.0.1:` and five digits.
const address_max = 21;

const Ward = struct {
    door: quo.Door,
    /// The relations this ward stands on, by the invitation's ward pk and heir pk.
    standings: std.AutoHashMapUnmanaged([96]u8, *quo.Standing) = .empty,
};

const Fail = error{ BadRequest, NoSuchOp, NoSuchWard, NotReached, WardStood, NameHeld };

pub const Stand = struct {
    gpa: Allocator,
    ent: quo.Entropy = .{},
    lock: c.pthread_mutex_t = c.PTHREAD_MUTEX_INITIALIZER,
    wards: std.AutoHashMapUnmanaged([64]u8, *Ward) = .empty,
    routes: std.AutoHashMapUnmanaged([64]u8, []u8) = .empty,
    listener: ?*tcp.Listener = null,
    next_id: u32 = 1,

    pub fn deinit(self: *Stand) void {
        var it = self.wards.valueIterator();
        while (it.next()) |w| {
            var si = w.*.standings.valueIterator();
            while (si.next()) |s| {
                s.*.deinit();
                self.gpa.destroy(s.*);
            }
            w.*.standings.deinit(self.gpa);
            w.*.door.deinit();
            self.gpa.destroy(w.*);
        }
        self.wards.deinit(self.gpa);
        var ri = self.routes.valueIterator();
        while (ri.next()) |r| self.gpa.free(r.*);
        self.routes.deinit(self.gpa);
    }

    fn enter(self: *Stand) void {
        _ = c.pthread_mutex_lock(&self.lock);
    }

    fn leave(self: *Stand) void {
        _ = c.pthread_mutex_unlock(&self.lock);
    }

    /// Answers one line.
    pub fn line(self: *Stand, a: Allocator, text: []const u8, out: *Writer) !void {
        const node = Json.parse(a, text, 2) catch |e| switch (e) {
            error.OutOfMemory => return e,
            else => return writeError(out, null, "bad request"),
        };
        const id_node = node.get("id");
        const id: ?[]const u8 = if (id_node != null and id_node.?.kind == .string) id_node.?.raw else null;
        if (id == null) return writeError(out, null, "bad request");
        self.dispatch(a, node, id.?, out) catch |e| {
            const msg = switch (e) {
                error.BadRequest, error.TooLarge => "bad request",
                error.NoSuchOp => "no such op",
                error.WardStood => "ward stood",
                error.NoSuchWard => "no such ward",
                error.NameHeld => "name held",
                error.NotReached => "not reached",
                else => return e,
            };
            return writeError(out, id, msg);
        };
    }

    fn dispatch(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        const op = try str(req, "op");
        const ops = .{ "ward", "invite", "release", "arrive", "ask", "read", "listen", "route", "send" };
        inline for (ops) |name| {
            if (std.mem.eql(u8, op, name)) {
                const f = @field(Stand, "op_" ++ name);
                return f(self, a, req, id, out);
            }
        }
        return error.NoSuchOp;
    }

    fn op_ward(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        _ = a;
        const seed = try str(req, "seed");
        const reach_name = try optStr(req, "reach");
        const reach: ?quo.Reach = if (reach_name) |r| quo.Reach.fromName(r) orelse return error.NotReached else null;
        const keys = quo.WardKeys.fromText(seed);
        const raw = keys.raw();
        self.enter();
        defer self.leave();
        if (self.wards.contains(raw)) return error.WardStood;
        const w = try self.gpa.create(Ward);
        errdefer self.gpa.destroy(w);
        w.* = .{ .door = quo.Door.init(self.gpa, keys, reach) };
        try self.wards.put(self.gpa, raw, w);
        try out.print("{{\"id\":{s},\"ward\":\"{s}\"}}\n", .{ id, &keys.wardPk() });
    }

    fn op_invite(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        _ = a;
        const pk = try hexField(req, "ward", 64);
        const name = try str(req, "heir");
        const reach_name = try optStr(req, "reach");
        self.enter();
        defer self.leave();
        const w = self.wards.get(pk) orelse return error.NoSuchWard;
        const reach: quo.Reach = if (reach_name) |r| quo.Reach.fromName(r) orelse return error.NotReached else .echo;
        if (w.door.holdsName(name)) return error.NameHeld;
        const inv = try w.door.invite(&self.ent, name, reach);
        var buf: [address_max]u8 = undefined;
        try out.print("{{\"id\":{s},\"invitation\":", .{id});
        try inv.write(out, self.listenerAddress(&buf));
        try out.writeAll("}\n");
    }

    fn op_release(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        _ = a;
        const pk = try hexField(req, "ward", 64);
        const name = try str(req, "heir");
        const name_raw = req.get("heir").?.raw;
        self.enter();
        defer self.leave();
        const w = self.wards.get(pk) orelse return error.NoSuchWard;
        const had = w.door.release(name);
        try out.print("{{\"id\":{s},\"released\":{s}}}\n", .{ id, if (had) name_raw else "null" });
    }

    fn op_arrive(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        const pk = try hexField(req, "ward", 64);
        const box = try anyHex(a, req, "box");
        self.enter();
        defer self.leave();
        const w = self.wards.get(pk) orelse return error.NoSuchWard;
        const reply = try w.door.arrive(a, &self.ent, box);
        try out.print("{{\"id\":{s},\"reply\":\"{x}\"}}\n", .{ id, reply });
    }

    const AskFields = struct {
        ward: [64]u8,
        inv: quo.Invitation,
        /// The `tcp` addresses of the invitation's `at`, in its order.
        at: []tcp.Address,
        method: ?[]const u8,
        args: ?[]const u8,
    };

    fn askFields(a: Allocator, req: Json.Node) !AskFields {
        const pk = try hexField(req, "ward", 64);
        const inv = try invitationOf(req);
        const at = try tcpAt(a, req.get("invitation").?);
        var method: ?[]const u8 = null;
        if (req.get("method")) |m| {
            if (m.kind != .string) return error.BadRequest;
            method = m.raw;
        }
        var args: ?[]const u8 = null;
        if (req.get("args")) |x| {
            if (x.kind != .object) return error.BadRequest;
            args = x.raw;
        }
        return .{ .ward = pk, .inv = inv, .at = at, .method = method, .args = args };
    }

    /// The listener's address, once the program holds one.
    fn listenerAddress(self: *Stand, buf: *[address_max]u8) ?[]const u8 {
        const l = self.listener orelse return null;
        return std.fmt.bufPrint(buf, "tcp://127.0.0.1:{d}", .{l.port}) catch unreachable;
    }

    /// The standing of `ward` on the relation `inv` names, made at its first use.
    fn standing(self: *Stand, w: *Ward, inv: quo.Invitation) !*quo.Standing {
        var key: [96]u8 = undefined;
        key[0..64].* = inv.ward;
        key[64..96].* = inv.heir;
        if (w.standings.get(key)) |s| return s;
        const s = try self.gpa.create(quo.Standing);
        errdefer self.gpa.destroy(s);
        s.* = quo.Standing.init(self.gpa, inv) catch return error.BadRequest;
        try w.standings.put(self.gpa, key, s);
        return s;
    }

    fn op_ask(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        const f = try askFields(a, req);
        self.enter();
        defer self.leave();
        const w = self.wards.get(f.ward) orelse return error.NoSuchWard;
        const s = try self.standing(w, f.inv);
        const box = try s.ask(a, &self.ent, f.method, f.args);
        try out.print("{{\"id\":{s},\"box\":\"{x}\"}}\n", .{ id, box });
    }

    fn op_read(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        const pk = try hexField(req, "ward", 64);
        const inv = try invitationOf(req);
        const reply_node = req.get("reply") orelse return error.BadRequest;
        const reply: ?[]u8 = if (reply_node.kind == .null) null else try anyHex(a, req, "reply");
        self.enter();
        defer self.leave();
        const w = self.wards.get(pk) orelse return error.NoSuchWard;
        const s = try self.standing(w, inv);
        const r = try s.read(a, reply);
        try out.print("{{\"id\":{s},\"read\":", .{id});
        try r.write(out);
        try out.writeAll("}\n");
    }

    fn op_listen(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        _ = a;
        if (try optStr(req, "scheme")) |scheme| {
            if (!std.mem.eql(u8, scheme, "tcp")) return error.BadRequest;
        }
        self.enter();
        defer self.leave();
        if (self.listener == null) {
            self.listener = try tcp.Listener.start(.{ .ctx = self, .answer = answerFrame });
        }
        var buf: [address_max]u8 = undefined;
        try out.print("{{\"id\":{s},\"at\":\"{s}\"}}\n", .{ id, self.listenerAddress(&buf).? });
    }

    fn answerFrame(ctx: *anyopaque, a: Allocator, pk: [64]u8, box: []const u8) anyerror!?[]u8 {
        const self: *Stand = @ptrCast(@alignCast(ctx));
        self.enter();
        defer self.leave();
        const w = self.wards.get(pk) orelse return null;
        return try w.door.arrive(a, &self.ent, box);
    }

    fn op_route(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        _ = a;
        const far = try hexField(req, "far", 64);
        const at = try str(req, "at");
        if (tcp.parseAddress(at) == null) return error.BadRequest;
        self.enter();
        defer self.leave();
        const owned = try self.gpa.dupe(u8, at);
        errdefer self.gpa.free(owned);
        const gop = try self.routes.getOrPut(self.gpa, far);
        if (gop.found_existing) self.gpa.free(gop.value_ptr.*);
        gop.value_ptr.* = owned;
        try out.print("{{\"id\":{s},\"routed\":\"{x}\"}}\n", .{ id, &far });
    }

    fn op_send(self: *Stand, a: Allocator, req: Json.Node, id: []const u8, out: *Writer) !void {
        const f = try askFields(a, req);
        var r: quo.Read = .nothing;
        self.enter();
        const w = self.wards.get(f.ward) orelse {
            self.leave();
            return error.NoSuchWard;
        };
        // The route alone where there is one, else the invitation's `at`.
        var targets = f.at;
        if (self.routes.get(f.inv.ward)) |route| {
            const one = try a.alloc(tcp.Address, 1);
            one[0] = tcp.parseAddress(try a.dupe(u8, route)).?;
            targets = one;
        }
        if (targets.len > 0) {
            const s = self.standing(w, f.inv) catch |e| {
                self.leave();
                return e;
            };
            const box = s.ask(a, &self.ent, f.method, f.args) catch |e| {
                self.leave();
                return e;
            };
            const frame_id = self.next_id;
            self.next_id +%= 1;
            self.leave();
            // One box, to each address in turn, until one delivers.
            var reply: ?[]u8 = null;
            for (targets) |at| {
                reply = try tcp.exchange(a, at, frame_id, f.inv.ward, box, wait_ms);
                if (reply != null) break;
            }
            self.enter();
            r = try s.read(a, reply);
        }
        self.leave();
        try out.print("{{\"id\":{s},\"read\":", .{id});
        try r.write(out);
        try out.writeAll("}\n");
    }
};

fn str(obj: Json.Node, key: []const u8) Fail![]const u8 {
    const n = obj.get(key) orelse return error.BadRequest;
    if (n.kind != .string) return error.BadRequest;
    return n.str;
}

fn optStr(obj: Json.Node, key: []const u8) Fail!?[]const u8 {
    if (obj.get(key) == null) return null;
    return try str(obj, key);
}

fn hexField(obj: Json.Node, key: []const u8, comptime n: usize) Fail![n]u8 {
    const s = try str(obj, key);
    if (!quo.isLowerHex(s, 2 * n)) return error.BadRequest;
    var out: [n]u8 = undefined;
    _ = std.fmt.hexToBytes(&out, s) catch return error.BadRequest;
    return out;
}

fn anyHex(a: Allocator, obj: Json.Node, key: []const u8) ![]u8 {
    const s = try str(obj, key);
    if (s.len % 2 != 0 or !quo.isLowerHex(s, s.len)) return error.BadRequest;
    const out = try a.alloc(u8, s.len / 2);
    _ = std.fmt.hexToBytes(out, s) catch return error.BadRequest;
    return out;
}

fn invitationOf(req: Json.Node) Fail!quo.Invitation {
    const inv = req.get("invitation") orelse return error.BadRequest;
    if (inv.kind != .object) return error.BadRequest;
    const out: quo.Invitation = .{
        .ward = try hexField(inv, "ward", 64),
        .heir = try hexField(inv, "heir", 32),
        .secret = try hexField(inv, "secret", 32),
        .lock = try hexField(inv, "lock", quo.ek_len),
    };
    if (!quo.lockPasses(&out.lock)) return error.BadRequest;
    return out;
}

/// The `tcp` addresses an invitation's `at` names, in order. Every other string is
/// skipped, and an `at` that is not an array is absent.
fn tcpAt(a: Allocator, inv: Json.Node) ![]tcp.Address {
    const at = inv.get("at") orelse return &.{};
    if (at.kind != .array) return &.{};
    const list = Json.parse(a, at.raw, 1) catch |e| switch (e) {
        error.OutOfMemory => return e,
        else => unreachable,
    };
    var out: std.ArrayList(tcp.Address) = .empty;
    for (list.items) |item| {
        if (item.kind != .string) continue;
        if (tcp.parseAddress(item.str)) |address| try out.append(a, address);
    }
    return out.items;
}

fn writeError(out: *Writer, id: ?[]const u8, msg: []const u8) !void {
    try out.print("{{\"id\":{s},\"error\":\"{s}\"}}\n", .{ id orelse "null", msg });
}

pub fn main() !void {
    const gpa = std.heap.c_allocator;
    tcp.ignoreSigpipe();
    var stand: Stand = .{ .gpa = gpa };
    defer stand.deinit();

    var pending: std.ArrayList(u8) = .empty;
    defer pending.deinit(gpa);
    var chunk: [1 << 16]u8 = undefined;
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    var out: Writer.Allocating = .init(gpa);
    defer out.deinit();

    var eof = false;
    while (!eof) {
        const n = c.read(0, &chunk, chunk.len);
        if (n <= 0) eof = true else try pending.appendSlice(gpa, chunk[0..@intCast(n)]);
        var start: usize = 0;
        while (true) {
            const nl = std.mem.indexOfScalarPos(u8, pending.items, start, '\n') orelse {
                if (!eof or start == pending.items.len) break;
                // A last line with no newline.
                try handle(&stand, arena.allocator(), pending.items[start..], &out);
                start = pending.items.len;
                break;
            };
            try handle(&stand, arena.allocator(), pending.items[start..nl], &out);
            _ = arena.reset(.retain_capacity);
            start = nl + 1;
        }
        const rest = pending.items.len - start;
        std.mem.copyForwards(u8, pending.items[0..rest], pending.items[start..]);
        pending.shrinkRetainingCapacity(rest);
    }
}

fn handle(stand: *Stand, a: Allocator, raw_line: []const u8, out: *Writer.Allocating) !void {
    var text = raw_line;
    if (text.len > 0 and text[text.len - 1] == '\r') text = text[0 .. text.len - 1];
    if (text.len == 0) return;
    out.clearRetainingCapacity();
    try stand.line(a, text, &out.writer);
    if (!tcp.writeAll(1, out.written())) return error.StdoutClosed;
}

// ---------------------------------------------------------------- tests

const testing = std.testing;

fn run(stand: *Stand, a: Allocator, text: []const u8) ![]const u8 {
    var w: Writer.Allocating = .init(a);
    try stand.line(a, text, &w.writer);
    return w.written();
}

test "the requests and their errors" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var stand: Stand = .{ .gpa = testing.allocator };
    defer stand.deinit();

    const w = try run(&stand, a, "{\"id\":\"2\",\"op\":\"ward\",\"seed\":\"alice\"}");
    try testing.expect(std.mem.startsWith(u8, w, "{\"id\":\"2\",\"ward\":\""));
    const pk = w[18 .. 18 + 128];
    try testing.expectEqualStrings("{\"id\":\"3\",\"error\":\"ward stood\"}\n", try run(&stand, a, "{\"id\":\"3\",\"op\":\"ward\",\"seed\":\"alice\"}"));
    try testing.expectEqualStrings("{\"id\":\"4\",\"error\":\"not reached\"}\n", try run(&stand, a, "{\"id\":\"4\",\"op\":\"ward\",\"seed\":\"alice\",\"reach\":\"nope\"}"));
    try testing.expectEqualStrings("{\"id\":\"5\",\"error\":\"no such op\"}\n", try run(&stand, a, "{\"id\":\"5\",\"op\":\"entropy\"}"));
    try testing.expectEqualStrings("{\"id\":null,\"error\":\"bad request\"}\n", try run(&stand, a, "nonsense"));
    try testing.expectEqualStrings("{\"id\":null,\"error\":\"bad request\"}\n", try run(&stand, a, "{\"id\":5,\"op\":\"ward\"}"));

    const inv_line = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"6\",\"op\":\"invite\",\"ward\":\"{s}\",\"heir\":\"x\"}}", .{pk}));
    try testing.expect(std.mem.indexOf(u8, inv_line, "\"lock\":\"") != null);
    try testing.expectEqualStrings("{\"id\":\"7\",\"error\":\"name held\"}\n", try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"7\",\"op\":\"invite\",\"ward\":\"{s}\",\"heir\":\"x\"}}", .{pk})));
    try testing.expectEqualStrings("{\"id\":\"8\",\"released\":\"x\"}\n", try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"8\",\"op\":\"release\",\"ward\":\"{s}\",\"heir\":\"x\"}}", .{pk})));
    try testing.expectEqualStrings("{\"id\":\"9\",\"released\":null}\n", try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"9\",\"op\":\"release\",\"ward\":\"{s}\",\"heir\":\"x\"}}", .{pk})));

    const rep = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"10\",\"op\":\"arrive\",\"ward\":\"{s}\",\"box\":\"00\"}}", .{pk}));
    try testing.expectEqual(@as(usize, 20 + 2 * (16 + 112) + 3), rep.len);
    try testing.expectEqualStrings("{\"id\":\"11\",\"error\":\"no such ward\"}\n", try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"11\",\"op\":\"arrive\",\"ward\":\"{s}\",\"box\":\"00\"}}", .{"a" ** 128})));
    try testing.expectEqualStrings("{\"id\":\"12\",\"error\":\"bad request\"}\n", try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"12\",\"op\":\"arrive\",\"ward\":\"{s}\",\"box\":\"abc\"}}", .{"a" ** 128})));
}

test "listen and route stand tcp alone, and send reaches a ward through at" {
    tcp.ignoreSigpipe();
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var stand: Stand = .{ .gpa = testing.allocator };
    defer stand.deinit();

    const door = try run(&stand, a, "{\"id\":\"1\",\"op\":\"ward\",\"seed\":\"at door\"}");
    const door_pk = door[18 .. 18 + 128];
    const asker = try run(&stand, a, "{\"id\":\"2\",\"op\":\"ward\",\"seed\":\"at asker\"}");
    const asker_pk = asker[18 .. 18 + 128];

    // Before any listener, an invitation carries no at.
    const bare = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"3\",\"op\":\"invite\",\"ward\":\"{s}\",\"heir\":\"bare\"}}", .{door_pk}));
    try testing.expect(std.mem.indexOf(u8, bare, "\"at\"") == null);

    for ([_][]const u8{ "http", "ws", "wss", "" }) |scheme| {
        const got = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"4\",\"op\":\"listen\",\"scheme\":\"{s}\"}}", .{scheme}));
        try testing.expectEqualStrings("{\"id\":\"4\",\"error\":\"bad request\"}\n", got);
    }
    const heard = try run(&stand, a, "{\"id\":\"5\",\"op\":\"listen\"}");
    try testing.expect(std.mem.startsWith(u8, heard, "{\"id\":\"5\",\"at\":\"tcp://127.0.0.1:"));
    const address = heard[16 .. heard.len - 3];
    try testing.expect(tcp.parseAddress(address) != null);
    try testing.expectEqualStrings(
        try std.fmt.allocPrint(a, "{{\"id\":\"6\",\"at\":\"{s}\"}}\n", .{address}),
        try run(&stand, a, "{\"id\":\"6\",\"op\":\"listen\",\"scheme\":\"tcp\"}"),
    );

    for ([_][]const u8{ "http://127.0.0.1:80/", "ws://127.0.0.1:80", "127.0.0.1:80", "tcp://127.0.0.1:80/" }) |at| {
        const got = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"7\",\"op\":\"route\",\"far\":\"{s}\",\"at\":\"{s}\"}}", .{ door_pk, at }));
        try testing.expectEqualStrings("{\"id\":\"7\",\"error\":\"bad request\"}\n", got);
    }

    // Once the program listens, the invitation's at names the listener.
    const inv_line = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"8\",\"op\":\"invite\",\"ward\":\"{s}\",\"heir\":\"h\"}}", .{door_pk}));
    try testing.expect(std.mem.endsWith(u8, inv_line, try std.fmt.allocPrint(a, ",\"at\":[\"{s}\"]}}}}\n", .{address})));
    const inv_at = std.mem.indexOf(u8, inv_line, "{\"ward\"").?;
    const inv = inv_line[inv_at .. inv_line.len - 2];
    const fields = inv[0..std.mem.indexOf(u8, inv, ",\"at\"").?];

    // With no route and no tcp address, nothing is delivered, and a malformed at is absent.
    for ([_][]const u8{ "", ",\"at\":\"tcp://127.0.0.1:1\"", ",\"at\":[7,null,\"zz://nowhere\",\"ws://127.0.0.1:1\"]" }) |at| {
        const got = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"9\",\"op\":\"send\",\"ward\":\"{s}\",\"invitation\":{s}{s}}},\"method\":\"m\"}}", .{ asker_pk, fields, at }));
        try testing.expectEqualStrings("{\"id\":\"9\",\"read\":{\"nothing\":true}}\n", got);
    }

    // Past an address of no carrier, and past one that reaches nothing, the listener answers.
    const at = try std.fmt.allocPrint(a, ",\"at\":[\"zz://nowhere\",\"tcp://127.0.0.1:1\",\"{s}\"]", .{address});
    const read = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"10\",\"op\":\"send\",\"ward\":\"{s}\",\"invitation\":{s}{s}}},\"method\":\"m\",\"args\":{{\"via\":\"at\"}}}}", .{ asker_pk, fields, at }));
    try testing.expectEqualStrings("{\"id\":\"10\",\"read\":{\"object\":{\"via\":\"at\"},\"seen\":null}}\n", read);

    // A route is dialled alone, whatever at names.
    const routed = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"11\",\"op\":\"route\",\"far\":\"{s}\",\"at\":\"tcp://127.0.0.1:1\"}}", .{door_pk}));
    try testing.expectEqualStrings(try std.fmt.allocPrint(a, "{{\"id\":\"11\",\"routed\":\"{s}\"}}\n", .{door_pk}), routed);
    const missed = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"12\",\"op\":\"send\",\"ward\":\"{s}\",\"invitation\":{s},\"method\":\"m\"}}", .{ asker_pk, inv }));
    try testing.expectEqualStrings("{\"id\":\"12\",\"read\":{\"nothing\":true}}\n", missed);
}

test "one stand asks another ward it stands, through ask, arrive and read" {
    var arena = std.heap.ArenaAllocator.init(testing.allocator);
    defer arena.deinit();
    const a = arena.allocator();
    var stand: Stand = .{ .gpa = testing.allocator };
    defer stand.deinit();

    const door = try run(&stand, a, "{\"id\":\"1\",\"op\":\"ward\",\"seed\":\"door\"}");
    const door_pk = door[18 .. 18 + 128];
    const asker = try run(&stand, a, "{\"id\":\"2\",\"op\":\"ward\",\"seed\":\"asker\"}");
    const asker_pk = asker[18 .. 18 + 128];
    const inv_line = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"3\",\"op\":\"invite\",\"ward\":\"{s}\",\"heir\":\"h\",\"reach\":\"marked\"}}", .{door_pk}));
    const inv_at = std.mem.indexOf(u8, inv_line, "{\"ward\"").?;
    const inv = inv_line[inv_at .. inv_line.len - 2];

    for (0..3) |i| {
        const box_line = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"a{d}\",\"op\":\"ask\",\"ward\":\"{s}\",\"invitation\":{s},\"method\":\"m\",\"args\":{{\"i\":{d}}}}}", .{ i, asker_pk, inv, i }));
        const box_at = std.mem.indexOf(u8, box_line, "\"box\":\"").? + 7;
        const box = box_line[box_at .. box_line.len - 3];
        const reply_line = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"b{d}\",\"op\":\"arrive\",\"ward\":\"{s}\",\"box\":\"{s}\"}}", .{ i, door_pk, box }));
        const reply_at = std.mem.indexOf(u8, reply_line, "\"reply\":\"").? + 9;
        const reply = reply_line[reply_at .. reply_line.len - 3];
        const read = try run(&stand, a, try std.fmt.allocPrint(a, "{{\"id\":\"c{d}\",\"op\":\"read\",\"ward\":\"{s}\",\"invitation\":{s},\"reply\":\"{s}\"}}", .{ i, asker_pk, inv, reply }));
        try testing.expectEqualStrings(try std.fmt.allocPrint(a, "{{\"id\":\"c{d}\",\"read\":{{\"object\":{{\"i\":{d}}},\"seen\":\"1\"}}}}\n", .{ i, i }), read);
    }
}
