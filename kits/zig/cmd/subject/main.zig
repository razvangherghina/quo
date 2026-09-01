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
//! This file is the host, not the kit. Everything here that is not a call
//! into a module — minting an invitation, keeping the caller's own records,
//! composing an ask, drawing randomness, running an accept loop — is a
//! ground's own affair, and the kit below declines to do any of it.

const std = @import("std");
const arithmetic = @import("arithmetic");
const notation = @import("notation");
const wire = @import("wire");
const envelope = @import("envelope");
const warden = @import("warden");
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

/// One ordinary object. It never learns it has an address, judges nothing,
/// and sees no key.
const Counter = struct {
    total: i64 = 0,
};

const Held = struct {
    pk: Key,
    object: Counter,
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

/// A whole ground: a warden, the objects behind its beings, and the two
/// things a warden does not keep — its own heir commitment, and the roads it
/// publishes.
const Ground = struct {
    gpa: std.mem.Allocator,
    io: std.Io,
    door: warden.Warden,
    /// The commitment to this house's own successor, which every invitation
    /// carries so a holder can believe news from the name that follows.
    heir_commitment: Key,
    hints: []const []const u8 = &.{},
    held: std.ArrayList(Held) = .empty,
    /// The one blueprint every warden holds, parsed once: the records the
    /// warden's own answers are written under.
    own: notation.Blueprint,
    counter: notation.Blueprint,
    /// The one lock that keeps this ground to itself. A warden is not
    /// concurrent, and a ground that pushes is reached from two threads at
    /// once: the reader of a line judges what arrives while the pushing half
    /// composes asks of its own.
    lock: std.Io.Mutex = .init,

    fn stand(gpa: std.mem.Allocator, io: std.Io, limit: i64) !Ground {
        const name = try arithmetic.signingPair(draw());
        const padlock = try arithmetic.sealingPair(draw());
        const successor = try arithmetic.signingPair(draw());
        const public_heir = try arithmetic.signingPair(draw());

        var self: Ground = .{
            .gpa = gpa,
            .io = io,
            .door = .{
                .gpa = gpa,
                .name = name.public,
                .name_secret = name.secret,
                .padlock = padlock.public,
                .padlock_secret = padlock.secret,
                .limit = @intCast(limit),
            },
            .heir_commitment = arithmetic.commitment(name.public, successor.public),
            .own = try notation.parse(gpa, warden.blueprint_text),
            .counter = try notation.parse(gpa, counter_text),
        };
        // The key that names the house and the key that names the being the
        // house speaks as are one key.
        try self.door.beings.append(gpa, .{
            .pk = name.public,
            .secret = name.secret,
            .digest = warden.digest(),
            .commitment = arithmetic.commitment(name.public, public_heir.public),
            .text = warden.blueprint_text,
        });
        return self;
    }

    fn deinit(self: *Ground) void {
        self.door.deinit();
        self.held.deinit(self.gpa);
        self.own.deinit();
        self.counter.deinit();
    }

    /// Hold one being of the counter's class. The object is this host's; the
    /// warden keeps only the pointer, the keys and the digest.
    fn hold(self: *Ground) !Key {
        const pk = try arithmetic.signingPair(draw());
        const heir = try arithmetic.signingPair(draw());
        try self.door.beings.append(self.gpa, .{
            .pk = pk.public,
            .secret = pk.secret,
            .digest = self.counter.digest(),
            .commitment = arithmetic.commitment(self.door.name, heir.public),
            .text = counter_text,
        });
        try self.held.append(self.gpa, .{ .pk = pk.public, .object = .{} });
        return pk.public;
    }

    fn object(self: *Ground, pk: Key) ?*Counter {
        for (self.held.items) |*one| {
            if (std.mem.eql(u8, &one.pk, &pk)) return &one.object;
        }
        return null;
    }

    /// Mint an invitation: one row in the inbound record, and the five things
    /// its holder is handed. The invitation does not name the being, so a
    /// stranger rotates and describes to find what it now reaches.
    fn grant(self: *Ground, being: Key, hints: []const []const u8) !wire.Invitation {
        const voice = try arithmetic.signingPair(draw());
        const heir = try arithmetic.signingPair(draw());
        var row: warden.Inbound = .{
            .voice = voice.public,
            .commitment = arithmetic.commitment(self.door.name, heir.public),
            .minted_name = self.door.name,
            .window = .{ .width = self.door.width },
        };
        try row.beings.append(self.gpa, being);
        try self.door.inbound.append(self.gpa, row);
        return .{
            .warden = self.door.name,
            .commitment = self.heir_commitment,
            .padlock = self.door.padlock,
            .heir = heir.public,
            .heir_secret = heir.secret,
            .hints = hints,
        };
    }

    // ------------------------------------------------------------- asking
    //
    // The composing itself is the kit's — `warden.remember`, `ask` and
    // `rotate`. What is this ground's and stays here is the policy around it:
    // the lock, so a rotation's composing and its key movement cannot be seen
    // apart; the roads this ground publishes; its leash defaults; and the
    // randomness, because the kit takes every draw as an argument.

    const Reach = struct {
        being: ?Key = null,
        method: ?envelope.Method = null,
    };

    fn reaching(self: *Ground, r: Reach) warden.Warden.Reach {
        return .{
            .being = r.being,
            .method = r.method,
            .allowance = .{ .time = default_time, .hops = default_hops },
            .hints = self.hints,
        };
    }

    /// Keep an invitation as a relation. Everything this ground later says to
    /// that house is composed out of this row.
    fn remember(self: *Ground, inv: wire.Invitation) !usize {
        self.lock.lockUncancelable(host);
        defer self.lock.unlock(host);
        return self.door.remember(inv);
    }

    /// Compose one utterance. The number it spends comes back with it,
    /// because an answer is paired to this house by it and it never travels
    /// outside a seal.
    fn ask(self: *Ground, gpa: std.mem.Allocator, at: usize, r: Reach) !struct { []u8, i64 } {
        self.lock.lockUncancelable(host);
        defer self.lock.unlock(host);
        return self.door.ask(gpa, at, draw(), self.reaching(r));
    }

    /// Whoever minted a voice has seen its keys, so the holder's first act is
    /// a rotation to a key nobody else has ever seen.
    fn rotate(self: *Ground, gpa: std.mem.Allocator, at: usize) !struct { []u8, i64 } {
        self.lock.lockUncancelable(host);
        defer self.lock.unlock(host);
        return self.door.rotate(gpa, at, draw(), draw(), self.reaching(.{}));
    }

    /// Open an answer with this ground's own padlock, and believe it only
    /// from the name it names.
    fn hear(self: *Ground, gpa: std.mem.Allocator, reply: []const u8) !envelope.Opened {
        self.lock.lockUncancelable(host);
        defer self.lock.unlock(host);
        return self.door.hear(gpa, reply);
    }

    // ------------------------------------------------------------ judging

    /// The whole of what a door does with an arriving message: the warden
    /// judges, and this ground carries out the routing it hands back. Silence
    /// is the whole of every refusal and the reason never travels — it goes
    /// to this host's own stderr and nowhere else.
    fn judge(self: *Ground, gpa: std.mem.Allocator, message: []const u8) !?[]u8 {
        self.lock.lockUncancelable(host);
        defer self.lock.unlock(host);
        var verdict = self.door.judge(message) catch {
            note("refused");
            return null;
        };
        defer verdict.deinit();

        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();

        const data = self.answerTo(a, verdict) catch {
            note("refused");
            return null;
        };
        return try self.door.answer(gpa, draw(), verdict.say, data);
    }

    fn answerTo(self: *Ground, a: std.mem.Allocator, verdict: warden.Verdict) !?[]const u8 {
        const voice: ?Key = switch (verdict.placement) {
            .stranger => null,
            else => verdict.say.voice,
        };
        return switch (verdict.routing) {
            .estate => try warden.encodeEstate(a, try self.door.estateFor(a, voice)),
            .stranger => try warden.encodeEstate(a, try self.door.estateFor(a, null)),
            .sketch => |pk| try self.door.sketchAnswer(a, voice, pk),
            // The fields of the one blueprint every warden holds are the
            // warden's own to answer, under both of the addresses its being
            // answers to. Nothing about them is this ground's: not the
            // decoding, not the scope, not the refusal.
            .own => try self.door.own(a, verdict),
            .invoke => |call| if (self.door.isPublic(call.being))
                try self.door.own(a, verdict)
            else
                try self.invoke(a, call.being, call.method),
        };
    }

    /// The being answers, and the warden never reads its arguments: bytes
    /// left after the declared arguments are the being's to refuse.
    fn invoke(self: *Ground, a: std.mem.Allocator, being: Key, m: envelope.Method) !?[]const u8 {
        const thing = self.object(being) orelse return error.Refused;
        const records = self.counter.records;
        if (std.mem.eql(u8, m.name, "bump")) {
            var decoded = try wire.decode(a, "int", records, m.args);
            defer decoded.deinit();
            const by = switch (decoded.value) {
                .integer => |n| n,
                else => return error.Refused,
            };
            thing.total = std.math.add(i64, thing.total, by) catch return error.Refused;
        } else if (std.mem.eql(u8, m.name, "count")) {
            if (m.args.len != 0) return error.Refused;
        } else return error.Refused;
        return try wire.encode(a, "int", records, .{ .integer = thing.total });
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

/// A road: one composed message out, and whatever came back, or null for
/// silence. Which road a ground speaks over is the whole of what `-line`
/// changes.
const Road = union(enum) {
    /// The common carriage: one POST, one reply, and silence arrives as an
    /// empty body because HTTP forces a response.
    door: struct { io: std.Io, hints: []const []const u8 },
    /// The framed carriage, where the hints are already spent: the road is
    /// the connection this ground is holding.
    held: *Wire,
    /// The same framed carriage, taken by the end that accepted the
    /// connection rather than the end that dialled it. The road is the same;
    /// only which half of it reads is different.
    pushed: *Wire,
    /// Distance zero: the far house is in this very process, and the road is
    /// a call. It waives no step — the bytes handed across are the same
    /// sealed envelope the other two roads carry, and the far ground runs
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
    /// One connection has one reader, so an end that both serves a line and
    /// asks down it cannot have the asking half read too. These three are how
    /// the reader hands an answer to the half waiting on it, and they are
    /// untouched on a line only one thread is on.
    waiting: ?Waiting = null,
    handed: ?[]u8 = null,
    guard: std.Io.Mutex = .init,
    arrived: std.Io.Condition = .init,
    /// One writer at a time: this end answers what arrives on the same
    /// connection its own asks go down.
    writing: std.Io.Mutex = .init,

    const Waiting = struct { far: Key, seq: i64 };

    /// Put one message down the line and read until the answer to `seq`
    /// arrives. A frame that is not that answer is a message this ground owes
    /// a judgment: the line is symmetric, so the far end may ask at any time.
    fn carry(self: *Wire, gpa: std.mem.Allocator, message: []const u8, far: Key, seq: i64) !?[]u8 {
        try line.writeFrame(self.writer, self.cap, message);
        while (true) {
            const frame = line.readFrame(gpa, self.reader, self.own_cap) catch {
                self.open = false;
                return null;
            };
            if (self.answers(gpa, frame, far, seq)) {
                return frame;
            }
            defer gpa.free(frame);
            try self.serve(gpa, frame);
        }
    }

    /// Whether a frame is the answer this caller is waiting on. Only the seal
    /// says so, and it says so without a byte of it travelling in the clear.
    ///
    /// This sorts frames and spends nothing, so it opens the envelope rather
    /// than calling the warden's `hear`: judging an answer spends the awaiting
    /// record the caller keeps for it, and a road that spent it while sorting
    /// would leave nothing for the caller to judge.
    fn answers(self: *Wire, gpa: std.mem.Allocator, frame: []const u8, far: Key, seq: i64) bool {
        var heard = envelope.open(gpa, self.ground.door.padlock_secret, .answer, frame) catch return false;
        defer heard.deinit();
        const answer = heard.payload.answer;
        return answer.seq == seq and std.mem.eql(u8, &answer.warden, &far);
    }

    /// Put one message down the line and wait for the reader to hand back the
    /// answer to `seq`. This is the asking half of a line whose reading half
    /// is another thread — the shape a ground that pushes has, and the only
    /// difference between the two halves.
    fn push(self: *Wire, message: []const u8, far: Key, seq: i64) !?[]u8 {
        self.guard.lockUncancelable(host);
        defer self.guard.unlock(host);
        self.waiting = .{ .far = far, .seq = seq };
        {
            self.writing.lockUncancelable(host);
            defer self.writing.unlock(host);
            line.writeFrame(self.writer, self.cap, message) catch {
                self.waiting = null;
                return null;
            };
        }
        // Silence has no wire form on a line, so nothing comes back at all:
        // what ends this wait is the answer, or the line itself ending.
        while (self.handed == null and self.open) {
            self.arrived.waitUncancelable(host, &self.guard);
        }
        const back = self.handed;
        self.handed = null;
        self.waiting = null;
        return back;
    }

    /// A frame that was not an answer is an ask, and this end is a door too.
    fn serve(self: *Wire, gpa: std.mem.Allocator, frame: []const u8) !void {
        const reply = try self.ground.judge(gpa, frame) orelse return;
        defer gpa.free(reply);
        self.writing.lockUncancelable(host);
        defer self.writing.unlock(host);
        // Silence has no wire form on a line, so a refusal produces no frame
        // at all; only an answer is written.
        line.writeFrame(self.writer, self.cap, reply) catch {
            self.open = false;
        };
    }

    /// Whether this frame is the answer the pushing half is waiting on. If it
    /// is, it is handed over rather than judged, and the pushing half owns it
    /// from then on.
    fn hand(self: *Wire, gpa: std.mem.Allocator, frame: []u8) bool {
        self.guard.lockUncancelable(host);
        const wanted = self.waiting;
        self.guard.unlock(host);
        const one = wanted orelse return false;
        if (!self.answers(gpa, frame, one.far, one.seq)) return false;
        self.guard.lockUncancelable(host);
        self.handed = frame;
        self.guard.unlock(host);
        self.arrived.signal(host);
        return true;
    }

    /// The line ending is news the pushing half is owed: it is waiting on an
    /// answer that will never come now.
    fn ended(self: *Wire) void {
        self.guard.lockUncancelable(host);
        self.open = false;
        self.guard.unlock(host);
        self.arrived.signal(host);
    }

    /// Stay until the far end lets the line go, judging whatever arrives.
    fn hold(self: *Wire, gpa: std.mem.Allocator) !void {
        defer self.ended();
        while (self.open) {
            const frame = line.readFrame(gpa, self.reader, self.own_cap) catch {
                return;
            };
            if (self.hand(gpa, frame)) continue;
            defer gpa.free(frame);
            try self.serve(gpa, frame);
        }
    }
};

fn send(gpa: std.mem.Allocator, road: Road, message: []const u8, far: Key, seq: i64) !?[]const u8 {
    return switch (road) {
        .door => |over| carriage.post(gpa, over.io, over.hints[0], message, 1 << 20) catch |e| {
            note(@errorName(e));
            return null;
        },
        .held => |held| try held.carry(gpa, message, far, seq),
        .pushed => |held| try held.push(message, far, seq),
        .near => |far_ground| try zero.call(gpa, .{ .context = far_ground, .knock = knock }, message, 1 << 20),
    };
}

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

    var ground = try Ground.stand(gpa, io, flags.limit);
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
/// anything the carriage saw.
fn knock(context: *anyopaque, gpa: std.mem.Allocator, sealed: []const u8) std.mem.Allocator.Error!carriage.Answer {
    const ground: *Ground = @ptrCast(@alignCast(context));
    return ground.judge(gpa, sealed) catch |e| switch (e) {
        error.OutOfMemory => error.OutOfMemory,
        else => null,
    };
}

/// The framed road, listening. One connection at a time is the whole of what
/// this subject needs, and each frame is judged as it lands.
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
        held.hold(gpa) catch {};
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
        const at = try self.ground.remember(inv);
        const road: Road = .{ .pushed = self.held };

        const rotated, const seq = try self.ground.rotate(a, at);
        const described = try exchange(a, self.ground, road, "describe", rotated, inv.warden, seq) orelse return;
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
        const composed, const asked = try self.ground.ask(a, at, .{
            .being = being,
            .method = .{ .name = self.flags.method, .args = args },
        });
        if (try exchange(a, self.ground, road, "ask", composed, inv.warden, asked)) |step| {
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
    held.hold(gpa) catch {};
}

/// Mint the invitation and print the facts line: everything a stranger needs
/// to speak to this ground, over whichever road it was given.
fn stranger(ground: *Ground, being: Key, hints: []const []const u8) !void {
    ground.hints = hints;
    const inv = try ground.grant(being, hints);
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
    if (flags.zero) {
        if (flags.rest.len != 0) return fail("usage: subject speak -zero [flags]");
        near = try Ground.stand(gpa, io, flags.limit);
        const being = try near.hold();
        inv = try near.grant(being, &.{});
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

    var ground = try Ground.stand(gpa, io, default_limit);
    defer ground.deinit();
    const at = try ground.remember(inv);

    // Which road this ground speaks over is the whole of what `-line` and
    // `-zero` change: the same warden, the same invitation, the same
    // messages, and at distance zero the same eight steps too.
    var road: Road = if (flags.zero)
        .{ .near = &near }
    else
        .{ .door = .{ .io = io, .hints = inv.hints } };
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
        // The road taken is the one the hint names. The hint's host was the
        // one thing this command used to throw away, and throwing it away is
        // only invisible while both ends are on the same machine.
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
        road = .{ .held = &held };
    }

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    // Whoever minted a voice has seen its keys, so the holder's first act is
    // a rotate-and-ask to a key nobody else has ever seen. It asks nothing,
    // and what comes back is what this voice now stands at.
    const rotated, const rotation_seq = try ground.rotate(a, at);
    const described = try exchange(a, &ground, road, "describe", rotated, inv.warden, rotation_seq) orelse return;
    const classes = try readEstate(a, ground.own.records, described.data);
    try emitEstate(a, described, classes);

    if (flags.blueprint) {
        for (classes) |c| {
            const args = try wire.encode(a, "b32", ground.own.records, .{ .b32 = c.digest });
            // `blueprint` is a field on the far door's public being, whose pk
            // is that warden's own name — reached by naming it, like every
            // other field on every other being.
            const composed, const seq = try ground.ask(a, at, .{
                .being = inv.warden,
                .method = .{ .name = "blueprint", .args = args },
            });
            const step = try exchange(a, &ground, road, "blueprint", composed, inv.warden, seq) orelse continue;
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
        const composed, const seq = try ground.ask(a, at, .{
            .being = being,
            .method = .{ .name = flags.method, .args = args },
        });
        if (try exchange(a, &ground, road, "ask", composed, inv.warden, seq)) |step| {
            var l = try opened(a);
            try l.text("step", "ask");
            try l.number("seq", step.seq);
            try l.hex("warden", &step.from);
            try l.hex("data", step.data);
            try l.send();
        }
    }

    if (!flags.holding) {
        if (stream) |s| s.close(io);
        return;
    }
    if (road != .held) return fail("a standing granted back can only ride a line");
    try holding(gpa, a, &ground, &held, inv.warden);
    if (stream) |s| s.close(io);
}

/// Put one composed message down the road the far door offered and open what
/// came back. Null is silence, which is a door speaking and not an error.
fn exchange(
    a: std.mem.Allocator,
    ground: *Ground,
    road: Road,
    name: []const u8,
    message: []const u8,
    far: Key,
    seq: i64,
) !?Step {
    const reply = try send(a, road, message, far, seq) orelse {
        var l = try opened(a);
        try l.text("step", name);
        try l.number("seq", seq);
        try l.truth("silence", true);
        try l.send();
        return null;
    };
    const heard = ground.hear(a, reply) catch {
        note("the answer did not open");
        return null;
    };
    const answer = heard.payload.answer;
    if (answer.seq != seq) {
        note("the answer names another ask");
        return null;
    }
    return .{
        .name = name,
        .seq = seq,
        .from = answer.warden,
        .data = answer.data orelse &.{},
    };
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
    const being = try ground.hold();
    const inv = try ground.grant(being, &.{});

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
    // carrying.
    try held.hold(gpa);

    const object = ground.object(being).?;
    var last = try opened(a);
    try last.text("step", "held");
    try last.hex("being", &being);
    try last.number("total", object.total);
    try last.send();
}
