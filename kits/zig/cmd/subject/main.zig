//! `subject`: a Quo ground another language can knock on, and knock with. It
//! exists so a kit written from the law in one language can be shown to speak
//! to a kit written from the law in another, with neither side ever reading
//! the other's source.
//!
//! Two modes.
//!
//! **serve** hangs a door on the common carriage, holds one granted being,
//! mints an invitation, and prints one line of plain facts on startup —
//! everything a stranger needs to speak to it and nothing about how it is
//! built. It does not publish the being: the invitation does not even name
//! it, so a stranger rotates, describes, and finds what it now reaches.
//!
//! **speak** takes another door's facts the same way and sends it a real
//! message, reporting what came back.
//!
//! Either mode runs over the framed TCP line instead of the common carriage
//! when it is given `-line`, and nothing above the road changes: the same
//! warden, the same invitation, the same messages. Speaking over a line this
//! command can also hold a being of its own and grant the far ground a
//! standing at it, so the ground it dialled can ask down the connection it
//! never opened — which is the whole reason a line is worth holding.
//!
//! Serving over a line, `-push` is the other half of that: this ground asks
//! down a connection it accepted. A standing granted back never travels on the
//! wire, so it is handed to this command one JSON object per line on stdin,
//! and each is spent on a line this door accepted.
//!
//! The facts line is JSON because a hint is an opaque string the protocol
//! never parses, and a space-separated line cannot carry one that holds a
//! space. Every line this command prints on stdout is one JSON object
//! carrying the member `quo`; everything else it has to say goes to stderr.
//!
//! This file is the host, not the kit. Which roads stand, where they listen,
//! how bytes get onto them, when this process draws a key and what it prints
//! are a ground's own affairs, and the kit below declines to do any of them.
//! Everything above the road is the kit's: the door takes whatever arrives at
//! its one entry point and judges it, the being's own method answers, and
//! nothing here ever opens a seal.
//!
//! **It stands below the kit's own seam, and reaches past it on purpose.** It
//! is not an application: it exists to be driven from outside by a harness in
//! another language, and every ask it composes it composes by hand, at
//! `sealAsk` and `rotate`, rather than through a handle. That is deliberate,
//! because each of the four things it must be able to say is one the being's
//! API refuses by design — a handle encodes through the blueprint, so it
//! cannot produce them:
//!
//! - `-args` is hex the harness chose, including bytes no encoder would write.
//! - A bare describe names neither being nor method; a handle always names a
//!   field.
//! - `-being` may name a being whose blueprint this process does not hold, and
//!   `-blueprint` asks for that text at the far door itself.
//! - The seq each message spent is printed, and a handle spends one and keeps
//!   it.
//!
//! It stands its own roads for the same reason: it listens where it is told,
//! publishes the host it was given, holds exactly one line at a time and must
//! know when that line ends. **The seam grows none of that to accommodate
//! this file** — `src/host.zig` is what an application stands on, and what is
//! wanted here is reached for here.

const std = @import("std");
const arithmetic = @import("arithmetic");
const notation = @import("notation");
const wire = @import("wire");
const envelope = @import("envelope");
const warden = @import("warden");
const quo = @import("quo");
const carriage = @import("carriage");
const line = @import("line");
const zero = @import("zero");

const Key = arithmetic.Key;
const net = std.Io.net;

/// The class the door holds. A stranger is told none of this: it learns the
/// digest from a describe and the text by asking the warden for the blueprint
/// that hashes to it, which is the path the law already gives.
///
/// Both fields ride as one `int` — eight bytes, two's complement, most
/// significant first — so a kit in any language can call them without a
/// codec of its own.
const counter_text =
    \\Counter
    \\  bump(by int) int
    \\  count() int
    \\
;

const default_limit: i64 = 1 << 20;
const default_hops: i64 = 8;
const default_time: i64 = 5000;

/// This host's own Io, kept here so a refusal can reach this process's stderr
/// from wherever it was decided.
var host: std.Io = undefined;

/// Permanent storage for the whole process: what is read once at startup and
/// held until the process is gone.
var perm: std.mem.Allocator = undefined;

pub fn main(init: std.process.Init) !void {
    host = init.io;
    perm = init.arena.allocator();
    const gpa = init.gpa;
    const argv = try init.minimal.args.toSlice(perm);
    if (argv.len < 2) return fail("usage: subject serve|speak");

    var args: std.ArrayList([]const u8) = .empty;
    for (argv[2..]) |arg| try args.append(perm, arg);

    if (std.mem.eql(u8, argv[1], "serve")) return serve(gpa, init.io, args.items);
    if (std.mem.eql(u8, argv[1], "speak")) return speak(gpa, init.io, args.items);
    return fail("no mode of that name");
}

fn fail(why: []const u8) noreturn {
    note(why);
    std.process.exit(1);
}

/// This host's own voice, and never the protocol's: a refusal never travels,
/// so everything said here is said to this process's own stderr.
fn note(what: []const u8) void {
    var buffer: [256]u8 = undefined;
    var out = std.Io.File.stderr().writerStreaming(host, &buffer);
    out.interface.print("subject: {s}\n", .{what}) catch {};
    out.interface.flush() catch {};
}

// ------------------------------------------------------------------- flags

/// The flags this command takes, in the one form both existing subjects take
/// them: `-name value` for a value and a bare `-name` for a switch.
const Flags = struct {
    listen: []const u8 = "127.0.0.1:0",
    limit: i64 = default_limit,
    framed: bool = false,
    /// `-zero`: both houses stand in this one process and the road is a
    /// call. There is no listener, no facts line to be handed and no hint,
    /// because no wire exists to disagree about.
    zero: bool = false,
    /// `-push`: serving over a line, ask down a connection this ground
    /// accepted, spending a standing handed to it on stdin.
    pushing: bool = false,
    being: []const u8 = "",
    method: []const u8 = "",
    args: []const u8 = "",
    blueprint: bool = false,
    holding: bool = false,
    /// Whatever was not a flag. The facts line is the only one there is.
    rest: []const []const u8 = &.{},
};

fn flagsOf(argv: []const []const u8) !Flags {
    var flags: Flags = .{};
    var rest: std.ArrayList([]const u8) = .empty;
    var i: usize = 0;
    while (i < argv.len) : (i += 1) {
        const arg = argv[i];
        if (arg.len < 2 or arg[0] != '-') {
            try rest.append(perm, arg);
            continue;
        }
        const name = std.mem.trimStart(u8, arg, "-");
        if (std.mem.eql(u8, name, "line")) {
            flags.framed = true;
        } else if (std.mem.eql(u8, name, "zero")) {
            flags.zero = true;
        } else if (std.mem.eql(u8, name, "blueprint")) {
            flags.blueprint = true;
        } else if (std.mem.eql(u8, name, "hold")) {
            flags.holding = true;
        } else if (std.mem.eql(u8, name, "push")) {
            flags.pushing = true;
        } else {
            i += 1;
            if (i == argv.len) return error.Refused;
            const value = argv[i];
            if (std.mem.eql(u8, name, "listen")) {
                flags.listen = value;
            } else if (std.mem.eql(u8, name, "limit")) {
                flags.limit = std.fmt.parseInt(i64, value, 10) catch return error.Refused;
            } else if (std.mem.eql(u8, name, "being")) {
                flags.being = value;
            } else if (std.mem.eql(u8, name, "method")) {
                flags.method = value;
            } else if (std.mem.eql(u8, name, "args")) {
                flags.args = value;
            } else return error.Refused;
        }
    }
    flags.rest = rest.items;
    return flags;
}

// -------------------------------------------------------------------- keys

fn draw() Key {
    var out: Key = undefined;
    host.random(&out);
    return out;
}

/// The clock the door takes its two readings by, handed in like the
/// randomness. A dwell is the difference between them, so what it counts in
/// is milliseconds.
fn clock() i64 {
    const now = std.Io.Clock.now(.real, host);
    return @intCast(@divFloor(now.nanoseconds, std.time.ns_per_ms));
}

fn hexOf(gpa: std.mem.Allocator, raw: []const u8) ![]u8 {
    const out = try gpa.alloc(u8, raw.len * 2);
    _ = std.fmt.bufPrint(out, "{x}", .{raw}) catch unreachable;
    return out;
}

fn keyOf(text: []const u8) !Key {
    if (text.len != arithmetic.key_length * 2) return error.Refused;
    var out: Key = undefined;
    _ = std.fmt.hexToBytes(&out, text) catch return error.Refused;
    return out;
}

fn bytesOf(gpa: std.mem.Allocator, text: []const u8) ![]u8 {
    if (text.len % 2 != 0) return error.Refused;
    const out = try gpa.alloc(u8, text.len / 2);
    _ = std.fmt.hexToBytes(out, text) catch return error.Refused;
    return out;
}

// --------------------------------------------------------------- the lines

/// One JSON object per line, flushed as it is written, so a driver reading
/// this process line by line sees each one before the process blocks.
const Line = struct {
    gpa: std.mem.Allocator,
    out: std.ArrayList(u8) = .empty,
    /// Whether the object being written is still empty, which is the whole of
    /// what decides a comma.
    fresh: bool = true,

    fn init(gpa: std.mem.Allocator) Line {
        return .{ .gpa = gpa };
    }

    fn raw(self: *Line, chunk: []const u8) !void {
        try self.out.appendSlice(self.gpa, chunk);
    }

    fn begin(self: *Line) !void {
        try self.raw("{");
        self.fresh = true;
    }

    fn end(self: *Line) !void {
        try self.raw("}");
        self.fresh = false;
    }

    fn string(self: *Line, chunk: []const u8) !void {
        try self.out.append(self.gpa, '"');
        for (chunk) |c| switch (c) {
            '"' => try self.raw("\\\""),
            '\\' => try self.raw("\\\\"),
            '\n' => try self.raw("\\n"),
            '\r' => try self.raw("\\r"),
            '\t' => try self.raw("\\t"),
            else => {
                if (c < 0x20) {
                    try self.out.print(self.gpa, "\\u{x:0>4}", .{c});
                } else {
                    try self.out.append(self.gpa, c);
                }
            },
        };
        try self.out.append(self.gpa, '"');
    }

    fn member(self: *Line, name: []const u8) !void {
        if (!self.fresh) try self.raw(",");
        self.fresh = false;
        try self.string(name);
        try self.raw(":");
    }

    fn text(self: *Line, name: []const u8, value: []const u8) !void {
        try self.member(name);
        try self.string(value);
    }

    fn hex(self: *Line, name: []const u8, value: []const u8) !void {
        const written = try hexOf(self.gpa, value);
        defer self.gpa.free(written);
        try self.text(name, written);
    }

    fn number(self: *Line, name: []const u8, value: i64) !void {
        try self.member(name);
        try self.out.print(self.gpa, "{d}", .{value});
    }

    fn truth(self: *Line, name: []const u8, value: bool) !void {
        try self.member(name);
        try self.raw(if (value) "true" else "false");
    }

    fn send(self: *Line) !void {
        try self.raw("}\n");
        var buffer: [256]u8 = undefined;
        var stdout = std.Io.File.stdout().writerStreaming(host, &buffer);
        try stdout.interface.writeAll(self.out.items);
        try stdout.interface.flush();
        self.out.deinit(self.gpa);
        self.out = .empty;
    }
};

/// Every line carries `quo`, and the driver reads no line that does not.
fn opened(gpa: std.mem.Allocator) !Line {
    var l = Line.init(gpa);
    try l.begin();
    try l.number("quo", 1);
    return l;
}

// ------------------------------------------------------------- the ground

/// The being this ground holds. It is an ordinary Zig struct: its public
/// methods are the fields its blueprint declares, and the kit builds the
/// dispatch from the type itself. **It never sees a byte and never touches a
/// key** — what reaches it is an `i64`, and what it answers is an `i64`.
const Counter = struct {
    quo: quo.Cell = .{},
    total: i64 = 0,

    pub fn bump(self: *Counter, by: i64) !i64 {
        self.total = try std.math.add(i64, self.total, by);
        return self.total;
    }

    pub fn count(self: *Counter) i64 {
        return self.total;
    }
};

/// The five things a holder holds. The law never says in what form a door
/// publishes them, so this shape is the crossing's own and the far side is
/// handed it verbatim.
const Facts = struct {
    quo: i64 = 1,
    role: []const u8 = "door",
    warden: []const u8,
    commitment: []const u8,
    padlock: []const u8,
    heir: []const u8,
    heirSecret: []const u8,
    hints: []const []const u8,
};

/// A whole ground: a warden, the object behind its one being, and the road
/// its own bytes leave by.
///
/// **Everything above the road is the kit's now.** The warden is opened on
/// the seeds, the clock and the randomness this host hands it; the being is
/// held with its dispatch built from its own type; the grant, the judgment
/// and the answering are the door's. What is left here is what a host is
/// for: which roads stand, how bytes get onto them, and what this command
/// prints.
const Ground = struct {
    gpa: std.mem.Allocator,
    io: std.Io,
    door: warden.Warden = undefined,
    counter: Counter = .{},
    being: Key = std.mem.zeroes(Key),
    /// The one blueprint every warden holds, parsed once: the records the
    /// warden's own answers are read under.
    own: notation.Blueprint,
    /// How this ground's outbound bytes leave. A listening door that never
    /// asks out has none.
    road: Road = .none,

    fn stand(gpa: std.mem.Allocator, io: std.Io, limit: i64, self: *Ground) !void {
        self.* = .{ .gpa = gpa, .io = io, .own = try notation.parse(gpa, warden.blueprint_text) };
        self.door = try warden.Warden.open(gpa, .{
            .seeds = .{ .name = draw(), .padlock = draw(), .heir = draw() },
            .clock = clock,
            .random = draw,
            .io = io,
            .limit = @intCast(limit),
            .allowance = .{ .time = default_time, .hops = default_hops },
            .observer = .{ .context = @ptrCast(self), .hush = hushed },
            .delivery = .{ .context = @ptrCast(self), .send = carry, .later = true },
        });
    }

    fn deinit(self: *Ground) void {
        self.door.deinit();
        self.own.deinit();
    }

    /// Hold the one being this ground shows. The object is this host's; the
    /// warden keeps the pointer, the keys and the parsed class.
    fn hold(self: *Ground) !Key {
        const handle = try quo.holding(
            &self.door,
            Counter,
            &self.counter,
            counter_text,
            .{ .seed = draw(), .heir_seed = draw() },
            self.gpa,
        );
        self.being = handle.being();
        return self.being;
    }

    /// Why the door fell silent, told inward and never across the wire.
    fn hushed(context: *anyopaque, reason: []const u8) void {
        _ = context;
        note(reason);
    }

    // ------------------------------------------------------------- asking

    /// Compose one utterance, put it on this ground's road, and open what
    /// settles it. Silence is a door speaking and not an error, and it is
    /// printed as its own step.
    ///
    /// **Nothing here waits on a socket.** The envelope goes to delivery; on
    /// a road that answers in its response the answer comes straight back
    /// through the one entry point, and on a line it arrives later as a frame
    /// of its own and settles the ask the door is holding open.
    fn utter(
        self: *Ground,
        a: std.mem.Allocator,
        name: []const u8,
        sealed: ?warden.Warden.Sealed,
    ) !?Step {
        const s = sealed orelse {
            note("nothing to say");
            return null;
        };
        const seq = s.seq;
        var heard = (self.door.sendSealed(a, s) catch null) orelse {
            var l = try opened(a);
            try l.text("step", name);
            try l.number("seq", seq);
            try l.truth("silence", true);
            try l.send();
            return null;
        };
        defer heard.deinit();
        const answer = heard.payload.answer;
        return .{
            .name = name,
            .seq = seq,
            .from = answer.warden,
            .data = try a.dupe(u8, answer.data orelse &.{}),
        };
    }

    /// Whoever minted a voice has seen its keys, so the holder's first act is
    /// a rotate-and-ask to a key nobody else has ever seen. It asks nothing,
    /// and what comes back is what this voice now stands at.
    fn rotated(self: *Ground, a: std.mem.Allocator, at: usize) !?Step {
        self.door.take();
        const roads = try self.door.roads(a);
        const composed = self.door.rotate(a, at, draw(), draw(), .{
            .allowance = .{ .time = default_time, .hops = default_hops },
            .hints = roads,
        }) catch {
            self.door.give();
            return null;
        };
        const deadline = self.door.clock() + default_time;
        self.door.give();
        return self.utter(a, "describe", .{
            .at = at,
            .seq = composed[1],
            .envelope = composed[0],
            .deadline = deadline,
        });
    }

    /// One ordinary ask down a relation.
    fn asked(
        self: *Ground,
        a: std.mem.Allocator,
        name: []const u8,
        at: usize,
        being: ?Key,
        method: envelope.Method,
    ) !?Step {
        self.door.take();
        const sealed = self.door.sealAsk(a, at, .{
            .being = being,
            .method = method,
            .allowance = .{ .time = default_time, .hops = default_hops },
        }) catch null;
        self.door.give();
        return self.utter(a, name, sealed);
    }

    // ------------------------------------------------------------ delivery
    //
    // Delivery is beneath the warden and reads a hint; the warden hands it an
    // envelope and the row's way back, and nothing else ever passes down
    // here.

    fn carry(
        context: *anyopaque,
        gpa: std.mem.Allocator,
        row: warden.Row,
        message: []const u8,
    ) std.mem.Allocator.Error!warden.Carried {
        const self: *Ground = @ptrCast(@alignCast(context));
        switch (self.road) {
            .none => return .silence,
            .near => |far| {
                // The third carriage, and it waives no step: the bytes handed
                // across are the same sealed envelope, copied in and copied
                // out, because two houses in one process are still two.
                const back = try zero.call(
                    gpa,
                    .{ .context = @ptrCast(far), .knock = knock },
                    message,
                    1 << 20,
                ) orelse return .silence;
                return .{ .answered = @constCast(back) };
            },
            .held => |wire_held| {
                // The answer comes back as a frame of its own, through the
                // one entry point.
                return if (wire_held.carry(message)) .later else .silence;
            },
            .door => {
                for (row.hints) |hint| {
                    if (!std.mem.startsWith(u8, hint, "http")) continue;
                    const back = carriage.post(gpa, self.io, hint, message, 1 << 20) catch |e| {
                        note(@errorName(e));
                        continue;
                    };
                    return if (back) |bytes| .{ .answered = @constCast(bytes) } else .silence;
                }
                return .silence;
            },
        }
    }
};

// -------------------------------------------------------------- the estate

/// One line of a describe, flattened for the far side.
const Class = struct {
    digest: Key,
    beings: []const Key,
};

/// Read an estate answer. The warden writes one and never reads one, because
/// a door describes and a caller listens — so the reading is the host's.
fn readEstate(a: std.mem.Allocator, records: []const notation.Block, data: []const u8) ![]Class {
    const decoded = try wire.decode(a, "estate", records, data);
    const fields = switch (decoded.value) {
        .record => |f| f,
        else => return error.Refused,
    };
    if (fields.len != 1) return error.Refused;
    const raw = switch (fields[0]) {
        .list => |items| items,
        else => return error.Refused,
    };
    const classes = try a.alloc(Class, raw.len);
    for (raw, classes) |item, *slot| {
        const one = switch (item) {
            .record => |f| f,
            else => return error.Refused,
        };
        if (one.len != 2) return error.Refused;
        const digest = switch (one[0]) {
            .b32 => |k| k,
            else => return error.Refused,
        };
        const under = switch (one[1]) {
            .list => |items| items,
            else => return error.Refused,
        };
        const beings = try a.alloc(Key, under.len);
        for (under, beings) |entry, *pk| {
            const pair = switch (entry) {
                .record => |f| f,
                else => return error.Refused,
            };
            if (pair.len != 2) return error.Refused;
            pk.* = switch (pair[0]) {
                .being => |k| k,
                else => return error.Refused,
            };
        }
        slot.* = .{ .digest = digest, .beings = beings };
    }
    return classes;
}

/// A `text?` answer: one byte saying present or absent, and the value only
/// when present.
fn readOptionalText(a: std.mem.Allocator, records: []const notation.Block, data: []const u8) !?[]const u8 {
    const decoded = try wire.decode(a, "text?", records, data);
    return switch (decoded.value) {
        .absent => null,
        .present => |held| switch (held.*) {
            .text => |t| t,
            else => error.Refused,
        },
        else => error.Refused,
    };
}

/// The one being an estate holds that is not the door's own public being. It
/// refuses anything else rather than choosing: which of two granted beings
/// was meant is the caller's to say.
fn granted(classes: []const Class) !Key {
    const own = warden.digest();
    var found: ?Key = null;
    var count: usize = 0;
    for (classes) |c| {
        if (std.mem.eql(u8, &c.digest, &own)) continue;
        for (c.beings) |pk| {
            found = pk;
            count += 1;
        }
    }
    if (count != 1) return error.Refused;
    return found.?;
}

// --------------------------------------------------------------- the roads

/// Which road a ground's own bytes leave by. It is the whole of what `-line`
/// and `-zero` change.
const Road = union(enum) {
    /// A listening door that never asks out.
    none,
    /// The common carriage: one POST, one reply, and silence arrives as an
    /// empty body because HTTP forces a response.
    door,
    /// The framed carriage: the road is the connection this ground holds,
    /// from whichever end it took it. The answer rides back as a frame of its
    /// own, so nothing here waits for it.
    held: *Wire,
    /// Distance zero: the far house is in this very process, and the road is
    /// a call. It waives no step — the bytes handed across are the same
    /// sealed envelope the other two roads carry, and the far ground spends
    /// the same eight steps over them.
    near: *Ground,
};

/// One line, held open: the reader and writer of a single connection, and
/// the cap the far end promised.
const Wire = struct {
    ground: *Ground,
    reader: *std.Io.Reader,
    writer: *std.Io.Writer,
    /// What the far end will take.
    cap: i64,
    /// What this end will take, which is what a dialling end promises by
    /// publishing nothing.
    own_cap: i64 = line.default_cap,
    open: bool = true,
    /// One writer at a time: this end answers what arrives on the same
    /// connection its own asks go down.
    writing: std.Io.Mutex = .init,
    /// Raised when the reading half has gone, for whoever is staying until
    /// the line ends.
    done: std.Io.Event = .unset,

    /// Put one frame on the line. **Nothing waits here**: an answer to it, if
    /// there is one, arrives as a frame of its own and the door settles the
    /// ask it belongs to.
    fn carry(self: *Wire, message: []const u8) bool {
        if (!self.open) return false;
        self.writing.lockUncancelable(host);
        defer self.writing.unlock(host);
        line.writeFrame(self.writer, self.cap, message) catch {
            self.open = false;
            return false;
        };
        return true;
    }

    /// Read frames and hand each one whole to the warden's one entry point.
    ///
    /// **This road never opens a seal.** It cannot tell an arriving ask from
    /// an answer to one of its own and does not need to: the record byte is
    /// inside the seal, only the door may read it, and what the door hands
    /// back is bytes to write or nothing to write at all.
    ///
    /// Each frame is judged on a thread of its own, because judging one may
    /// itself wait for an answer riding back down this same line — a reader
    /// that judged would be waiting for a frame only it can read.
    fn hold(self: *Wire, gpa: std.mem.Allocator) void {
        while (self.open) {
            const frame = line.readFrame(gpa, self.reader, self.own_cap) catch break;
            const worker = std.Thread.spawn(.{}, judged, .{ self, gpa, frame }) catch {
                gpa.free(frame);
                break;
            };
            worker.detach();
        }
        self.open = false;
        self.done.set(host);
    }

    /// Let the line go. **A socket a reader is still holding is never closed
    /// under it** — that is a fault in this program, not weather — so the
    /// reader is woken by a shutdown and the close waits until it has gone.
    fn letGo(self: *Wire, io: std.Io, stream: net.Stream) void {
        self.open = false;
        stream.shutdown(io, .both) catch {};
        self.done.waitUncancelable(host);
        stream.close(io);
    }

    fn judged(self: *Wire, gpa: std.mem.Allocator, frame: []u8) void {
        defer gpa.free(frame);
        // Silence has no wire form on a line, so a refusal produces no frame
        // at all; only an answer is written.
        const reply = self.ground.door.arrive(gpa, frame, null) orelse return;
        defer gpa.free(reply);
        _ = self.carry(reply);
    }
};

/// A hint is opaque to the protocol, and this is the one place this command
/// looks inside one.
fn lineIn(hints: []const []const u8) ?[]const u8 {
    for (hints) |hint| {
        if (std.mem.startsWith(u8, hint, "tcp://")) return hint;
    }
    return null;
}

/// A host and a port to an address. The host may be a literal or a name: two
/// grounds on different machines find each other by name far more often than
/// by number, and a subject that could only parse a literal would be a subject
/// that only ever worked on loopback. Resolving is the host's affair and stays
/// here — the two road modules take an address and look nothing up.
fn resolve(io: std.Io, where: []const u8, port: u16) !net.IpAddress {
    if (net.IpAddress.parse(where, port)) |literal| return literal else |_| {}

    const name = net.HostName.init(where) catch return error.Refused;
    var found: [16]net.HostName.LookupResult = undefined;
    var queue: std.Io.Queue(net.HostName.LookupResult) = .init(&found);
    var looking = io.async(net.HostName.lookup, .{ name, io, &queue, .{ .port = port } });
    defer looking.cancel(io) catch {};
    // The first address the name answers with is the one taken: a name that
    // answers with several answers with several roads to the same door.
    while (queue.getOne(io)) |one| {
        switch (one) {
            .address => |address| return address,
            .canonical_name => {},
        }
    } else |_| {}
    return error.Refused;
}

/// The host half of a `host:port`, unbracketed.
fn hostIn(text: []const u8) []const u8 {
    const colon = std.mem.lastIndexOfScalar(u8, text, ':') orelse return text;
    const where = text[0..colon];
    if (where.len >= 2 and where[0] == '[' and where[where.len - 1] == ']') {
        return where[1 .. where.len - 1];
    }
    return where;
}

fn addressOf(io: std.Io, text: []const u8) !net.IpAddress {
    const colon = std.mem.lastIndexOfScalar(u8, text, ':') orelse return error.Refused;
    const port = std.fmt.parseInt(u16, text[colon + 1 ..], 10) catch return error.Refused;
    return resolve(io, text[0..colon], port);
}

// -------------------------------------------------------------- serve

fn serve(gpa: std.mem.Allocator, io: std.Io, argv: []const []const u8) !void {
    const flags = flagsOf(argv) catch return fail("those flags are not this command's");

    var ground: Ground = undefined;
    try Ground.stand(gpa, io, flags.limit, &ground);
    const being = try ground.hold();

    const address = addressOf(io, flags.listen) catch return fail("that is no address");
    // The road a door publishes is the one whoever reads it has to be able to
    // take, so the hint carries the host this door was told to hang at rather
    // than whatever this machine calls itself. On loopback the two are the
    // same; between two machines only the first is any use.
    const where = hostIn(flags.listen);

    if (flags.framed) {
        // The listening half is the one that knows where it ended up, so it
        // is the one with a road to grant.
        var server = try line.listen(io, &address);
        const hint = try line.writeHint(gpa, where, server.socket.address.getPort(), flags.limit);
        try stranger(&ground, being, &.{hint});
        if (flags.pushing) return serveLinePushing(gpa, io, &ground, &server, flags);
        return serveLine(gpa, io, &ground, &server);
    }
    if (flags.pushing) return fail("a push can only ride a line");

    var server = try carriage.listen(io, &address);
    // The hint is the whole address, posted to exactly as given. Plain HTTP
    // here: the law names HTTPS as the common carriage and does not say
    // whether the scheme is part of the carriage or part of the road, and a
    // subject driven on loopback has nothing to gain from a certificate.
    const hint = try std.fmt.allocPrint(gpa, "http://{s}:{d}/", .{ where, server.socket.address.getPort() });
    try stranger(&ground, being, &.{hint});

    const door: carriage.Door = .{ .context = &ground, .knock = knock };
    while (true) {
        const stream = server.accept(io) catch continue;
        defer stream.close(io);
        carriage.serveOnce(gpa, io, stream, @intCast(flags.limit), door) catch {};
    }
}

/// The common carriage's door: bytes in, bytes out, and it never learns
/// anything the carriage saw — not which record it carried, not which step
/// refused, and not a byte of what was inside the seal.
fn knock(context: *anyopaque, gpa: std.mem.Allocator, sealed: []const u8) std.mem.Allocator.Error!carriage.Answer {
    const ground: *Ground = @ptrCast(@alignCast(context));
    return ground.door.arrive(gpa, sealed, null);
}

/// The framed road, listening. One connection at a time is the whole of what
/// this subject needs, and each frame goes straight to the one entry point.
fn serveLine(gpa: std.mem.Allocator, io: std.Io, ground: *Ground, server: *net.Server) !void {
    while (true) {
        const stream = server.accept(io) catch continue;
        defer stream.close(io);
        var in: [4096]u8 = undefined;
        var out: [4096]u8 = undefined;
        var reader = stream.reader(io, &in);
        var writer = stream.writer(io, &out);
        var held: Wire = .{
            .ground = ground,
            .reader = &reader.interface,
            .writer = &writer.interface,
            .cap = line.default_cap,
            .own_cap = @intCast(ground.door.limit),
        };
        held.hold(gpa);
    }
}

/// A standing granted back down a line: the five keys and no road at all,
/// because the ground that granted it has none. It is reachable only down the
/// line it opened, which is why it can be handed over no other way.
const Standing = struct {
    warden: []const u8,
    commitment: []const u8,
    padlock: []const u8,
    heir: []const u8,
    heirSecret: []const u8,
};

/// The framed road, listening and pushing. The standing this ground will spend
/// arrives on stdin rather than on the wire, and it can only be spent down a
/// line already accepted — so the connection is read here and asked down by the
/// other half, which is the whole reason the two are separate threads.
const Pushing = struct {
    gpa: std.mem.Allocator,
    ground: *Ground,
    held: *Wire,
    flags: Flags,

    fn told(self: *Pushing) void {
        var buffer: [8192]u8 = undefined;
        var stdin = std.Io.File.stdin().readerStreaming(host, &buffer);
        while (stdin.interface.takeDelimiterExclusive('\n')) |said| {
            if (std.mem.trim(u8, said, " \t\r").len == 0) continue;
            self.push(said) catch |e| fail(@errorName(e));
        } else |_| {}
    }

    fn push(self: *Pushing, said: []const u8) !void {
        var arena = std.heap.ArenaAllocator.init(self.gpa);
        defer arena.deinit();
        const a = arena.allocator();

        const parsed = std.json.parseFromSlice(Standing, a, said, .{
            .ignore_unknown_fields = true,
        }) catch return fail("that is no standing");
        const s = parsed.value;
        const inv: wire.Invitation = .{
            .warden = keyOf(s.warden) catch return fail("that is no name"),
            .commitment = keyOf(s.commitment) catch return fail("that is no commitment"),
            .padlock = keyOf(s.padlock) catch return fail("that is no padlock"),
            .heir = keyOf(s.heir) catch return fail("that is no heir"),
            .heir_secret = keyOf(s.heirSecret) catch return fail("that is no heir secret"),
            .hints = &.{},
        };
        self.ground.door.take();
        const at = try self.ground.door.remember(inv);
        self.ground.door.give();
        // The standing arrived on stdin and can only be spent down a line
        // this ground already accepted: it is a standing at the ground that
        // opened the connection, which publishes no road at all.
        self.ground.road = .{ .held = self.held };

        const described = (try self.ground.rotated(a, at)) orelse return;
        const classes = try readEstate(a, self.ground.own.records, described.data);
        try emitEstate(a, described, classes);

        var l = try opened(a);
        try l.text("step", "pushed");
        try l.hex("far", &inv.warden);
        try l.send();

        if (self.flags.method.len == 0) return;
        const being: ?Key = if (self.flags.being.len == 0)
            null
        else if (std.mem.eql(u8, self.flags.being, "door"))
            inv.warden
        else if (std.mem.eql(u8, self.flags.being, "auto"))
            granted(classes) catch return fail("the estate holds no single granted being")
        else
            keyOf(self.flags.being) catch return fail("that is no being");

        const args = bytesOf(a, self.flags.args) catch return fail("those arguments are not hex");
        if (try self.ground.asked(a, "ask", at, being, .{
            .name = self.flags.method,
            .args = args,
        })) |step| {
            var out = try opened(a);
            try out.text("step", "ask");
            try out.number("seq", step.seq);
            try out.hex("warden", &step.from);
            try out.hex("data", step.data);
            try out.send();
        }
    }
};

fn serveLinePushing(
    gpa: std.mem.Allocator,
    io: std.Io,
    ground: *Ground,
    server: *net.Server,
    flags: Flags,
) !void {
    // One connection is the whole of what a push needs: the standing spent
    // down it is a standing at the ground that opened it.
    const stream = server.accept(io) catch return fail("no line was ever accepted");
    defer stream.close(io);
    var in: [4096]u8 = undefined;
    var out: [4096]u8 = undefined;
    var reader = stream.reader(io, &in);
    var writer = stream.writer(io, &out);
    var held: Wire = .{
        .ground = ground,
        .reader = &reader.interface,
        .writer = &writer.interface,
        .cap = line.default_cap,
        .own_cap = @intCast(ground.door.limit),
    };
    var pushing: Pushing = .{ .gpa = gpa, .ground = ground, .held = &held, .flags = flags };
    const thread = try std.Thread.spawn(.{}, Pushing.told, .{&pushing});
    defer thread.detach();
    held.hold(gpa);
}

/// Mint the invitation and print the facts line: everything a stranger needs
/// to speak to this ground, over whichever road it was given.
fn stranger(ground: *Ground, being: Key, hints: []const []const u8) !void {
    // A warden does not know where it stands until something stands it up, so
    // the road is told to the door here and every mint after it carries it.
    for (hints) |hint| try ground.door.publishRoad(hint);
    const inv = try ground.door.grant(ground.gpa, being);
    defer ground.gpa.free(inv.hints);
    try emitFacts(ground.gpa, inv);
}

fn emitFacts(gpa: std.mem.Allocator, inv: wire.Invitation) !void {
    var l = try opened(gpa);
    try l.text("role", "door");
    try l.hex("warden", &inv.warden);
    try l.hex("commitment", &inv.commitment);
    try l.hex("padlock", &inv.padlock);
    try l.hex("heir", &inv.heir);
    try l.hex("heirSecret", &inv.heir_secret);
    try l.member("hints");
    try l.raw("[");
    for (inv.hints, 0..) |hint, i| {
        if (i != 0) try l.raw(",");
        try l.string(hint);
    }
    try l.raw("]");
    try l.send();
}

// --------------------------------------------------------------- speak

const Step = struct {
    name: []const u8,
    seq: i64,
    from: Key,
    data: []const u8,
};

fn speak(gpa: std.mem.Allocator, io: std.Io, argv: []const []const u8) !void {
    const flags = flagsOf(argv) catch return fail("those flags are not this command's");
    // At distance zero there is nobody to be handed facts by: the far house
    // stands in this very process. So this mode mints its own invitation
    // rather than reading one, and the invitation carries no hint, because a
    // private carriage needs no naming.
    var near: Ground = undefined;
    var inv: wire.Invitation = undefined;
    // The facts outlive the branch that read them: the invitation points into
    // them for the whole exchange.
    var parsed: ?std.json.Parsed(Facts) = null;
    defer if (parsed) |p| p.deinit();
    var near_invitation: ?wire.Invitation = null;
    defer if (near_invitation) |one| gpa.free(one.hints);
    if (flags.zero) {
        if (flags.rest.len != 0) return fail("usage: subject speak -zero [flags]");
        try Ground.stand(gpa, io, flags.limit, &near);
        const being = try near.hold();
        inv = try near.door.grant(gpa, being);
        near_invitation = inv;
        // The same facts line a listening door prints, so what the far house
        // is can be read the same way on every road.
        try emitFacts(gpa, inv);
    } else {
        if (flags.rest.len != 1) return fail("usage: subject speak [flags] <facts-json>");

        parsed = std.json.parseFromSlice(Facts, gpa, flags.rest[0], .{
            .ignore_unknown_fields = true,
        }) catch return fail("those are not facts");
        const f = parsed.?.value;
        if (f.hints.len == 0) return fail("those facts carry no road");

        inv = .{
            .warden = keyOf(f.warden) catch return fail("that is no name"),
            .commitment = keyOf(f.commitment) catch return fail("that is no commitment"),
            .padlock = keyOf(f.padlock) catch return fail("that is no padlock"),
            .heir = keyOf(f.heir) catch return fail("that is no heir"),
            .heir_secret = keyOf(f.heirSecret) catch return fail("that is no heir secret"),
            .hints = f.hints,
        };
    }

    // A caller is always a being, and always one its own warden holds — so
    // this mode is a whole ground too, and not a bare key.
    // The far house at distance zero is this process's too, so this process
    // owns its teardown.
    defer if (flags.zero) near.deinit();

    var ground: Ground = undefined;
    try Ground.stand(gpa, io, default_limit, &ground);
    defer ground.deinit();
    ground.door.take();
    const at = try ground.door.remember(inv);
    ground.door.give();

    // Which road this ground speaks over is the whole of what `-line` and
    // `-zero` change: the same warden, the same invitation, the same
    // messages, and at distance zero the same eight steps too.
    ground.road = if (flags.zero) .{ .near = &near } else .door;
    var in: [4096]u8 = undefined;
    var out: [4096]u8 = undefined;
    var held: Wire = undefined;
    var stream: ?net.Stream = null;
    // The reader and the writer of a held line outlive the branch that opened
    // it: the road is the connection, and it stays for the whole exchange.
    var reader: net.Stream.Reader = undefined;
    var writer: net.Stream.Writer = undefined;
    if (flags.framed) {
        const hint = lineIn(inv.hints) orelse return fail("those facts carry no tcp:// road");
        const read = line.readHint(hint) catch return fail("that is no line");
        // The road taken is the one the hint names, host and all. Only while
        // both ends stand on one machine is the hint's host the same as this
        // one's.
        const address = resolve(io, read.host, read.port) catch
            return fail("that line names no host this ground can reach");
        const dialled = try line.dial(io, &address);
        stream = dialled;
        reader = dialled.reader(io, &in);
        writer = dialled.writer(io, &out);
        held = .{
            .ground = &ground,
            .reader = &reader.interface,
            .writer = &writer.interface,
            .cap = read.cap(),
        };
        ground.road = .{ .held = &held };
        // The reading half runs on its own thread from the moment the line is
        // held: every frame that lands on it goes to the one entry point, and
        // an answer to this ground's own ask is one of them.
        const reading = try std.Thread.spawn(.{}, Wire.hold, .{ &held, gpa });
        reading.detach();
    }

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    const described = (try ground.rotated(a, at)) orelse return;
    const classes = try readEstate(a, ground.own.records, described.data);
    try emitEstate(a, described, classes);

    if (flags.blueprint) {
        for (classes) |c| {
            const args = try wire.encode(a, "b32", ground.own.records, .{ .b32 = c.digest });
            // `blueprint` is a field on the far door's public being, whose pk
            // is that warden's own name — reached by naming it, like every
            // other field on every other being.
            const step = (try ground.asked(a, "blueprint", at, inv.warden, .{
                .name = "blueprint",
                .args = args,
            })) orelse continue;
            const text = try readOptionalText(a, ground.own.records, step.data);
            var l = try opened(a);
            try l.text("step", "blueprint");
            try l.number("seq", step.seq);
            try l.hex("warden", &step.from);
            try l.hex("digest", &c.digest);
            try l.member("text");
            if (text) |t| try l.string(t) else try l.raw("null");
            try l.send();
        }
    }

    if (flags.method.len != 0) {
        const being: ?Key = if (flags.being.len == 0)
            null
        else if (std.mem.eql(u8, flags.being, "door"))
            inv.warden
        else if (std.mem.eql(u8, flags.being, "auto"))
            granted(classes) catch return fail("the estate holds no single granted being")
        else
            keyOf(flags.being) catch return fail("that is no being");

        const args = bytesOf(a, flags.args) catch return fail("those arguments are not hex");
        if (try ground.asked(a, "ask", at, being, .{ .name = flags.method, .args = args })) |step| {
            var l = try opened(a);
            try l.text("step", "ask");
            try l.number("seq", step.seq);
            try l.hex("warden", &step.from);
            try l.hex("data", step.data);
            try l.send();
        }
    }

    if (!flags.holding) {
        if (stream) |s| held.letGo(io, s);
        return;
    }
    if (ground.road != .held) return fail("a standing granted back can only ride a line");
    try holding(gpa, a, &ground, &held, inv.warden);
    if (stream) |s| held.letGo(io, s);
}

fn emitEstate(a: std.mem.Allocator, step: Step, classes: []const Class) !void {
    var l = try opened(a);
    try l.text("step", "describe");
    try l.number("seq", step.seq);
    try l.hex("warden", &step.from);
    try l.member("classes");
    try l.raw("[");
    for (classes, 0..) |c, i| {
        if (i != 0) try l.raw(",");
        try l.begin();
        try l.hex("digest", &c.digest);
        try l.member("beings");
        try l.raw("[");
        for (c.beings, 0..) |pk, j| {
            if (j != 0) try l.raw(",");
            const written = try hexOf(a, &pk);
            try l.string(written);
        }
        try l.raw("]");
        try l.end();
    }
    try l.raw("]");
    try l.send();
}

/// The other half of a line, and the half a door cannot have: this ground
/// holds a being of its own and grants the ground it dialled a standing at
/// it. The invitation carries no road, because this ground has none — it is
/// reachable only down the line it opened. Then it stays for as long as the
/// far ground keeps the line, and says what its own object was left holding
/// once the line is let go.
fn holding(gpa: std.mem.Allocator, a: std.mem.Allocator, ground: *Ground, held: *Wire, far: Key) !void {
    _ = gpa;
    const being = try ground.hold();
    const inv = try ground.door.grant(a, being);

    var l = try opened(a);
    try l.text("step", "standing");
    try l.hex("far", &far);
    try l.hex("warden", &inv.warden);
    try l.hex("commitment", &inv.commitment);
    try l.hex("padlock", &inv.padlock);
    try l.hex("heir", &inv.heir);
    try l.hex("heirSecret", &inv.heir_secret);
    try l.send();

    // The far end closes the line when it has finished asking, and a line is
    // dumb: there is no goodbye on it, only the fact of whether it is still
    // carrying. The reading half is already running, so this waits for it
    // rather than reading itself.
    held.done.waitUncancelable(host);

    var last = try opened(a);
    try last.text("step", "held");
    try last.hex("being", &being);
    try last.number("total", ground.counter.count());
    try last.send();
}
