//! The host: it opens a warden on the seeds, the clock, the randomness and
//! the store it is handed, stands roads in front of the warden's one door,
//! and is delivery beneath it.
//!
//! `papers/quo-truth.md` part three is the whole specification. **This is the
//! only file in the kit that knows every road by name, and it holds no secret
//! of its own**: what it keeps per peer is an address — a padlock, which is a
//! public key — beside the line that peer's asks arrive on. The warden makes
//! that association and hands it down, because the padlock is inside the seal
//! and a road may never look there.
//!
//! It also holds the two smallest things a host hands in, so no ground has to
//! write them again: seeds drawn from its own randomness, and a store in
//! memory.
//!
//! Delivery has three rules and no more. A row with hints: the first road
//! this ground can speak that carried. A row without hints, or none it can
//! speak: the line that padlock's last ask arrived on, if still held.
//! Neither: weather where a road was tried and broke, no road where none
//! could be — reported apart, and neither of them the far door's silence.

const std = @import("std");
const warden = @import("warden");
const carriage = @import("carriage");
const line = @import("line");
const zero = @import("zero");

pub const Key = warden.Key;
pub const net = std.Io.net;

/// The three seeds a warden is founded on, drawn from this host's own
/// randomness. **The host holds the seeds and the warden never reaches for
/// one.**
pub fn seeds(random: *const fn () Key) warden.Warden.Seeds {
    return .{ .name = random(), .padlock = random(), .heir = random() };
}

/// A store in memory. Where the records live is the host's choice; what goes
/// in them is the warden's.
pub const MemoryStore = struct {
    gpa: std.mem.Allocator,
    kept: ?[]u8 = null,

    pub fn deinit(self: *MemoryStore) void {
        if (self.kept) |bytes| self.gpa.free(bytes);
        self.kept = null;
    }

    pub fn store(self: *MemoryStore) warden.Store {
        return .{ .context = @ptrCast(self), .save = save, .load = load };
    }

    fn save(context: *anyopaque, bytes: []const u8) anyerror!void {
        const self: *MemoryStore = @ptrCast(@alignCast(context));
        const kept = try self.gpa.dupe(u8, bytes);
        if (self.kept) |old| self.gpa.free(old);
        self.kept = kept;
    }

    fn load(context: *anyopaque, gpa: std.mem.Allocator) anyerror!?[]u8 {
        const self: *MemoryStore = @ptrCast(@alignCast(context));
        const kept = self.kept orelse return null;
        return try gpa.dupe(u8, kept);
    }
};

/// Grounds in one process that reach each other by handing bytes across —
/// **the road of distance zero, which waives no step.** It is attached by
/// hint and process-wide, so two hosts opened in one bench find each other
/// the way two wardens in one device would.
var memory_lock: std.Io.Mutex = .init;
var memory: std.ArrayList(Attached) = .empty;

const Attached = struct { hint: []u8, at: *Host };

/// One road standing in front of the door, and how it is taken down.
const Stood = struct {
    kind: enum { memory, http, line },
    hint: []u8,
    server: ?net.Server = null,
    thread: ?std.Thread = null,
};

/// One line this host holds, from either end. **It never opens a seal**: it
/// reads a frame and hands it whole to the door, and sends back whatever
/// bytes come.
const Line = struct {
    host: *Host,
    stream: net.Stream,
    io: std.Io,
    /// What the far road promised it accepts. The dialling end publishes
    /// nothing and so promises the default for what comes back.
    far_cap: i64 = line.default_cap,
    /// The road this line was dialled on, where it was. A line accepted has
    /// none, which is what makes it the only way back to that peer.
    hint: ?[]u8 = null,
    in: [4096]u8 = undefined,
    out: [4096]u8 = undefined,
    reader: net.Stream.Reader = undefined,
    writer: net.Stream.Writer = undefined,
    /// One writer at a time. Two frames interleaved are two frames neither
    /// end can read.
    writing: std.Io.Mutex = .init,
    open: std.atomic.Value(bool) = .init(true),
    thread: ?std.Thread = null,

    fn carry(self: *Line, envelope: []const u8) bool {
        if (!self.open.load(.acquire)) return false;
        self.writing.lockUncancelable(self.io);
        defer self.writing.unlock(self.io);
        line.writeFrame(&self.writer.interface, self.far_cap, envelope) catch {
            self.open.store(false, .release);
            return false;
        };
        return true;
    }

    /// Read frames and hand each to the door — **on a thread of its own**.
    /// A judgment may itself wait for an answer that rides back down this
    /// same line, so the reader must never be the thread that judges: it
    /// would be waiting for a frame only it can read.
    fn run(self: *Line) void {
        while (self.open.load(.acquire)) {
            const frame = line.readFrame(
                self.host.gpa,
                &self.reader.interface,
                line.default_cap,
            ) catch break;
            const worker = std.Thread.spawn(.{}, judged, .{ self, frame }) catch {
                self.host.gpa.free(frame);
                break;
            };
            worker.detach();
        }
        self.open.store(false, .release);
    }

    fn judged(self: *Line, frame: []u8) void {
        _ = self.host.busy.fetchAdd(1, .acq_rel);
        defer _ = self.host.busy.fetchSub(1, .acq_rel);
        defer self.host.gpa.free(frame);
        // The road hands the frame over whole and is given back bytes or
        // nothing. It never learns which of the two records it carried.
        const answer = self.host.door.arrive(self.host.gpa, frame, @ptrCast(self)) orelse return;
        defer self.host.gpa.free(answer);
        _ = self.carry(answer);
    }

    /// Stop the line without closing it. **A socket another thread is
    /// reading is never closed under it** — that is a fault in this program,
    /// not weather — so the reader is woken by a shutdown and the close waits
    /// until it has gone.
    fn shut(self: *Line) void {
        if (self.open.swap(false, .acq_rel)) self.stream.shutdown(self.io, .both) catch {};
    }

    fn deinit(self: *Line, gpa: std.mem.Allocator) void {
        self.shut();
        if (self.thread) |t| t.join();
        self.stream.close(self.io);
        if (self.hint) |one| gpa.free(one);
        gpa.destroy(self);
    }
};

pub const Roads = enum { memory, http, line };

pub const Opening = struct {
    seeds: warden.Warden.Seeds,
    clock: *const fn () i64,
    random: *const fn () Key,
    io: std.Io,
    store: ?warden.Store = null,
    /// The roads to stand. A ground that stands none publishes nothing and is
    /// reachable only down a line it opened — which is what a tab is, and the
    /// main case rather than the exception.
    roads: []const Roads = &.{},
    /// Roads the host knows about that it does not itself listen on: a proxy,
    /// a tunnel, or a road nobody here can speak.
    hints: []const []const u8 = &.{},
    limit: usize = 0,
    allowance: warden.Allowance = .{ .time = 5000, .hops = 8 },
};

pub const Host = struct {
    gpa: std.mem.Allocator,
    io: std.Io,
    door: warden.Warden,

    /// Lines this host holds, from either end. **It holds no secret**: the
    /// key here is a padlock, which is a public key used as an address and
    /// the only kind of key a road ever sees.
    lock: std.Io.Mutex = .init,
    held: std.ArrayList(*Line) = .empty,
    by_padlock: std.ArrayList(Way) = .empty,
    stood: std.ArrayList(Stood) = .empty,
    /// How many frames are being judged right now, so closing waits for them.
    busy: std.atomic.Value(usize) = .init(0),
    running: std.atomic.Value(bool) = .init(true),

    const Way = struct { padlock: Key, at: *Line };

    pub fn open(gpa: std.mem.Allocator, o: Opening, self: *Host) !void {
        self.* = .{ .gpa = gpa, .io = o.io, .door = undefined };
        self.door = try warden.Warden.open(gpa, .{
            .seeds = o.seeds,
            .clock = o.clock,
            .random = o.random,
            .io = o.io,
            .store = o.store,
            .delivery = .{ .context = @ptrCast(self), .send = send, .arrived = arrived, .later = true },
            .limit = o.limit,
            .allowance = o.allowance,
        });
        errdefer self.door.deinit();
        for (o.hints) |one| try self.door.publishRoad(one);
        for (o.roads) |road| try self.stand(road);
    }

    pub fn close(self: *Host) void {
        self.running.store(false, .release);

        for (self.stood.items) |*one| {
            self.door.retractRoad(one.hint);
            if (one.kind == .memory) detachMemory(self.io, self.gpa, one.hint);
            // A listener blocked in `accept` is woken by one last knock at
            // its own door, and the loop then sees that the host is closing.
            // The socket is never closed under it: that is a fault in this
            // program, not weather.
            if (one.server) |*server| self.knockOnce(server.socket.address.getPort());
            if (one.thread) |t| t.join();
            if (one.server) |*server| server.deinit(self.io);
            self.gpa.free(one.hint);
        }
        self.stood.deinit(self.gpa);

        self.lock.lockUncancelable(self.io);
        const lines = self.held.toOwnedSlice(self.gpa) catch &.{};
        self.by_padlock.deinit(self.gpa);
        self.lock.unlock(self.io);
        for (lines) |one| one.shut();
        // A frame already handed to the door is still being judged, and its
        // being's own work may be halfway through. Nothing is freed under it.
        while (self.busy.load(.acquire) > 0) std.Thread.yield() catch {};
        for (lines) |one| one.deinit(self.gpa);
        self.gpa.free(lines);

        self.door.deinit();
    }

    // ------------------------------------------------------------ the roads

    fn stand(self: *Host, road: Roads) !void {
        switch (road) {
            .memory => {
                const hint = try std.fmt.allocPrint(
                    self.gpa,
                    "mem://{x}",
                    .{self.door.name[0..8]},
                );
                errdefer self.gpa.free(hint);
                memory_lock.lockUncancelable(self.io);
                defer memory_lock.unlock(self.io);
                try memory.append(self.gpa, .{ .hint = hint, .at = self });
                try self.door.publishRoad(hint);
                try self.stood.append(self.gpa, .{ .kind = .memory, .hint = hint });
            },
            .http => {
                const address: net.IpAddress = .{ .ip4 = .loopback(0) };
                var server = try carriage.listen(self.io, &address);
                errdefer server.deinit(self.io);
                const hint = try std.fmt.allocPrint(
                    self.gpa,
                    "http://127.0.0.1:{d}",
                    .{server.socket.address.getPort()},
                );
                errdefer self.gpa.free(hint);
                try self.door.publishRoad(hint);
                try self.stood.append(self.gpa, .{
                    .kind = .http,
                    .hint = hint,
                    .server = server,
                });
                const at = &self.stood.items[self.stood.items.len - 1];
                at.thread = try std.Thread.spawn(.{}, serveHttp, .{ self, at });
            },
            .line => {
                const address: net.IpAddress = .{ .ip4 = .loopback(0) };
                var server = try line.listen(self.io, &address);
                errdefer server.deinit(self.io);
                const hint = try line.writeHint(
                    self.gpa,
                    "127.0.0.1",
                    server.socket.address.getPort(),
                    null,
                );
                errdefer self.gpa.free(hint);
                try self.door.publishRoad(hint);
                try self.stood.append(self.gpa, .{
                    .kind = .line,
                    .hint = hint,
                    .server = server,
                });
                const at = &self.stood.items[self.stood.items.len - 1];
                at.thread = try std.Thread.spawn(.{}, serveLine, .{ self, at });
            },
        }
    }

    /// One connection to our own listening port, so a thread blocked in
    /// `accept` returns and can see that the host is closing.
    fn knockOnce(self: *Host, port: u16) void {
        const address: net.IpAddress = .{ .ip4 = .loopback(port) };
        const stream = net.IpAddress.connect(&address, self.io, .{ .mode = .stream }) catch return;
        stream.close(self.io);
    }

    fn serveHttp(self: *Host, at: *Stood) void {
        while (true) {
            const stream = at.server.?.accept(self.io) catch return;
            if (!self.running.load(.acquire)) {
                stream.close(self.io);
                return;
            }
            const worker = std.Thread.spawn(.{}, oneRequest, .{ self, stream }) catch {
                stream.close(self.io);
                return;
            };
            worker.detach();
        }
    }

    fn oneRequest(self: *Host, stream: net.Stream) void {
        _ = self.busy.fetchAdd(1, .acq_rel);
        defer _ = self.busy.fetchSub(1, .acq_rel);
        defer stream.close(self.io);
        carriage.serveOnce(self.gpa, self.io, stream, 1 << 20, .{
            .context = @ptrCast(self),
            .knock = knock,
        }) catch {};
    }

    /// The common carriage's door: bytes in, bytes out, and it never learns
    /// anything the carriage saw.
    fn knock(
        context: *anyopaque,
        gpa: std.mem.Allocator,
        sealed: []const u8,
    ) std.mem.Allocator.Error!carriage.Answer {
        const self: *Host = @ptrCast(@alignCast(context));
        return self.door.arrive(gpa, sealed, null);
    }

    fn serveLine(self: *Host, at: *Stood) void {
        while (true) {
            const stream = at.server.?.accept(self.io) catch return;
            if (!self.running.load(.acquire)) {
                stream.close(self.io);
                return;
            }
            _ = self.keep(stream, null) catch {
                stream.close(self.io);
                return;
            };
        }
    }

    /// Take up a line and set its reader running.
    fn keep(self: *Host, stream: net.Stream, hint: ?[]u8) !*Line {
        const held = try self.gpa.create(Line);
        errdefer self.gpa.destroy(held);
        held.* = .{ .host = self, .stream = stream, .io = self.io, .hint = hint };
        if (hint) |one| {
            const read = try line.readHint(one);
            held.far_cap = read.cap();
        }
        held.reader = stream.reader(self.io, &held.in);
        held.writer = stream.writer(self.io, &held.out);

        self.lock.lockUncancelable(self.io);
        try self.held.append(self.gpa, held);
        self.lock.unlock(self.io);

        held.thread = try std.Thread.spawn(.{}, Line.run, .{held});
        return held;
    }

    // --------------------------------------------------------- the delivery

    /// The warden's one call downward: an address and an opaque token, with
    /// nothing coming back. **Anything more handed this way is the leak.**
    fn arrived(context: *anyopaque, padlock: Key, via: ?*anyopaque) void {
        const self: *Host = @ptrCast(@alignCast(context));
        const at: *Line = @ptrCast(@alignCast(via orelse return));
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        for (self.by_padlock.items) |*one| {
            if (std.mem.eql(u8, &one.padlock, &padlock)) {
                one.at = at;
                return;
            }
        }
        self.by_padlock.append(self.gpa, .{ .padlock = padlock, .at = at }) catch {};
    }

    fn send(
        context: *anyopaque,
        gpa: std.mem.Allocator,
        row: warden.Row,
        envelope: []const u8,
    ) std.mem.Allocator.Error!warden.Carried {
        const self: *Host = @ptrCast(@alignCast(context));

        // Every road actually tried, so a fault can say what broke. A hint
        // this ground cannot speak never joins it: nothing is sent down one,
        // so no door spoke and no road broke, and it is walked past exactly as
        // a hint never offered is.
        var tried: std.ArrayList([]const u8) = .empty;
        defer {
            for (tried.items) |one| gpa.free(one);
            tried.deinit(gpa);
        }

        // Rule one: the first road this ground can speak that carried.
        for (row.hints) |hint| {
            if (std.mem.startsWith(u8, hint, "mem://")) {
                try tried.append(gpa, try gpa.dupe(u8, hint));
                // A hint nothing is attached under is a door that is down,
                // which at distance zero is the whole of weather.
                const far = attachedAt(self.io, hint) orelse continue;
                // Distance zero, and it waives no step: the bytes handed
                // across are the same sealed envelope, and the far door
                // spends all eight over them.
                const back = try zero.call(
                    gpa,
                    .{ .context = @ptrCast(far), .knock = knock },
                    envelope,
                    1 << 20,
                ) orelse return .silence;
                return .{ .answered = @constCast(back) };
            }
            if (std.mem.startsWith(u8, hint, "http://") or
                std.mem.startsWith(u8, hint, "https://"))
            {
                try tried.append(gpa, try gpa.dupe(u8, hint));
                const back = carriage.post(gpa, self.io, hint, envelope, 1 << 20) catch continue;
                return if (back) |bytes| .{ .answered = @constCast(bytes) } else .silence;
            }
            if (std.mem.startsWith(u8, hint, "tcp://")) {
                try tried.append(gpa, try gpa.dupe(u8, hint));
                const held = self.dial(hint) catch continue;
                // The answer arrives as a frame of its own, through the door.
                if (held.carry(envelope)) return .later;
                continue;
            }
        }

        // Rule two: the line that padlock's last ask arrived on, if still
        // held. This is how a peer that publishes nothing — a tab, a phone —
        // is reached at all.
        if (self.wayBack(row.padlock)) |held| {
            try tried.append(gpa, try gpa.dupe(u8, "the line this padlock last asked on"));
            if (held.carry(envelope)) return .later;
        }

        // Rule three: nothing carried, and the two ways that happens are not
        // one. A road was tried and broke, which is weather; or none could be,
        // which is no road at all — and neither is the far door's silence,
        // because the far door heard nothing either way.
        if (tried.items.len == 0) return .no_road;
        return .{ .weather = try tried.toOwnedSlice(gpa) };
    }

    fn wayBack(self: *Host, padlock: Key) ?*Line {
        self.lock.lockUncancelable(self.io);
        defer self.lock.unlock(self.io);
        for (self.by_padlock.items) |one| {
            if (!std.mem.eql(u8, &one.padlock, &padlock)) continue;
            return if (one.at.open.load(.acquire)) one.at else null;
        }
        return null;
    }

    /// The line held for this road, dialled if there is none or the one there
    /// has ended. A hint is matched byte for byte as written, which is what
    /// makes it a key.
    fn dial(self: *Host, hint: []const u8) !*Line {
        self.lock.lockUncancelable(self.io);
        for (self.held.items) |one| {
            const held = one.hint orelse continue;
            if (!std.mem.eql(u8, held, hint)) continue;
            if (one.open.load(.acquire)) {
                self.lock.unlock(self.io);
                return one;
            }
        }
        self.lock.unlock(self.io);

        const read = try line.readHint(hint);
        const address = try net.IpAddress.parse(read.host, read.port);
        const stream = try line.dial(self.io, &address);
        errdefer stream.close(self.io);
        return self.keep(stream, try self.gpa.dupe(u8, hint));
    }
};

fn attachedAt(io: std.Io, hint: []const u8) ?*Host {
    memory_lock.lockUncancelable(io);
    defer memory_lock.unlock(io);
    for (memory.items) |one| {
        if (std.mem.eql(u8, one.hint, hint)) return one.at;
    }
    return null;
}

fn detachMemory(io: std.Io, gpa: std.mem.Allocator, hint: []const u8) void {
    memory_lock.lockUncancelable(io);
    defer memory_lock.unlock(io);
    var i: usize = 0;
    while (i < memory.items.len) {
        if (std.mem.eql(u8, memory.items[i].hint, hint)) {
            _ = memory.orderedRemove(i);
        } else i += 1;
    }
    // The last ground off this road takes the road with it: a registry that
    // held its own memory after nobody was on it would be a leak nothing
    // could ever reach to free.
    if (memory.items.len == 0) {
        memory.deinit(gpa);
        memory = .empty;
    }
}
