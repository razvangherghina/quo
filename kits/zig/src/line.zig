//! The line: framed envelopes over one persistent TCP connection.
//!
//! Article III of the constitution is the whole specification. The line is
//! standard but never mandatory — the common carriage is the one every warden
//! answers — and a warden that answers this road answers it exactly as
//! written there, or it has not answered it at all.
//!
//! This module and `carriage.zig` are the only two in the kit that reach a
//! host. Nothing below them imports `std.Io.net` or `std.http`, and the suite
//! asserts that rather than trusting it.

const std = @import("std");
const carriage = @import("carriage");

pub const net = std.Io.net;

/// A refusal the sender makes in its own kit, before a byte flows: an
/// envelope over the far road's cap, or a hint that is not a hint.
pub const Error = error{Refused};

/// A framing fault. It ends the connection and it ends it without a word,
/// because a peer that cannot frame cannot be spoken to. It is not silence:
/// a well-formed frame whose envelope fails the judgment is ordinary silence
/// and the line lives on.
pub const Framing = error{Framing};

/// A bare `tcp://` hint promises this: that end accepts envelopes to 16,384
/// bytes. An end that publishes nothing — the dialing end always — promises
/// it too.
pub const default_cap: i64 = 16384;

/// The length is written the way the wire encoding writes an `int`: eight
/// bytes, big-endian, two's complement. It does not count itself.
pub const length_bytes = 8;

const scheme = "tcp://";

// ------------------------------------------------------------------ the hint

/// The only hint this road has, and only the listening end has one:
/// `tcp://host:port`, optionally followed by `?cap=` and the door's cap in
/// decimal bytes, and nothing after that.
pub const Hint = struct {
    /// The host as written, an IPv6 literal with its brackets already off.
    host: []const u8,
    /// True when the host arrived in brackets, which is how an IPv6 literal
    /// is written and the only thing brackets mean here.
    bracketed: bool,
    port: u16,
    /// What the hint declared, or `null` where it declared nothing — which
    /// promises the default rather than meaning the road is capless.
    declared_cap: ?i64,

    /// The cap a dialer must stay at or under. Nothing declared is the
    /// default promised.
    pub fn cap(self: Hint) i64 {
        return self.declared_cap orelse default_cap;
    }
};

/// Read a hint. Everything the article does not name is refused: no path, no
/// second query field, no missing port, no scheme but this one.
pub fn readHint(text: []const u8) Error!Hint {
    if (!std.mem.startsWith(u8, text, scheme)) return Error.Refused;
    var rest = text[scheme.len..];

    var declared_cap: ?i64 = null;
    if (std.mem.indexOfScalar(u8, rest, '?')) |q| {
        const query = rest[q + 1 ..];
        rest = rest[0..q];
        const prefix = "cap=";
        if (!std.mem.startsWith(u8, query, prefix)) return Error.Refused;
        const digits = query[prefix.len..];
        // "and nothing after that" — the cap is the whole query or the hint
        // is not this road's.
        if (digits.len == 0) return Error.Refused;
        for (digits) |c| if (c < '0' or c > '9') return Error.Refused;
        const declared = std.fmt.parseInt(i64, digits, 10) catch return Error.Refused;
        // A cap of zero names a door that can carry no frame, which is no
        // road at all.
        if (declared <= 0) return Error.Refused;
        declared_cap = declared;
    }

    var host: []const u8 = undefined;
    var bracketed = false;
    var port_text: []const u8 = undefined;
    if (rest.len != 0 and rest[0] == '[') {
        const close = std.mem.indexOfScalar(u8, rest, ']') orelse return Error.Refused;
        host = rest[1..close];
        bracketed = true;
        const after = rest[close + 1 ..];
        if (after.len == 0 or after[0] != ':') return Error.Refused;
        port_text = after[1..];
    } else {
        const colon = std.mem.lastIndexOfScalar(u8, rest, ':') orelse return Error.Refused;
        host = rest[0..colon];
        port_text = rest[colon + 1 ..];
    }

    if (host.len == 0) return Error.Refused;
    // A bare host with no brackets carries no colons: an unbracketed IPv6
    // literal has no port to read off the end.
    if (!bracketed and std.mem.indexOfScalar(u8, host, ':') != null) return Error.Refused;
    if (std.mem.indexOfScalar(u8, host, '/') != null) return Error.Refused;
    if (std.mem.indexOfScalar(u8, port_text, '/') != null) return Error.Refused;

    // The port is always written.
    if (port_text.len == 0) return Error.Refused;
    for (port_text) |c| if (c < '0' or c > '9') return Error.Refused;
    const port = std.fmt.parseInt(u16, port_text, 10) catch return Error.Refused;
    // A port of zero names a door nothing can be sent to, as a cap of zero
    // names one nothing can be framed for. Neither is a road.
    if (port == 0) return Error.Refused;

    return .{ .host = host, .bracketed = bracketed, .port = port, .declared_cap = declared_cap };
}

/// Write the hint a listening door publishes. A cap equal to the default is
/// still worth declaring or not at the caller's choice; both promise the
/// same number.
pub fn writeHint(
    gpa: std.mem.Allocator,
    host: []const u8,
    port: u16,
    declared_cap: ?i64,
) (Error || std.mem.Allocator.Error)![]u8 {
    if (host.len == 0) return Error.Refused;
    const bracketed = std.mem.indexOfScalar(u8, host, ':') != null;
    var out: std.ArrayList(u8) = .empty;
    errdefer out.deinit(gpa);
    try out.appendSlice(gpa, scheme);
    if (bracketed) try out.append(gpa, '[');
    try out.appendSlice(gpa, host);
    if (bracketed) try out.append(gpa, ']');
    try out.print(gpa, ":{d}", .{port});
    if (declared_cap) |c| {
        if (c < 0) return Error.Refused;
        try out.print(gpa, "?cap={d}", .{c});
    }
    return out.toOwnedSlice(gpa);
}

/// "A warden whose published `limit` is under the default and whose hint
/// declares no cap does not offer the line." The hint is the road describing
/// itself; a door that would refuse what its own silence promised is not on
/// this road at all.
pub fn offersLine(published_limit: i64, hint: []const u8) bool {
    const read = readHint(hint) catch return false;
    if (read.declared_cap == null and published_limit < default_cap) return false;
    return true;
}

// ----------------------------------------------------------------- the frame

/// The bytes in front of an envelope on the line, and the whole of the
/// frame's vocabulary.
pub fn writeLength(length: i64) [length_bytes]u8 {
    var head: [length_bytes]u8 = undefined;
    std.mem.writeInt(i64, &head, length, .big);
    return head;
}

pub fn readLength(head: *const [length_bytes]u8) i64 {
    return std.mem.readInt(i64, head, .big);
}

pub const WriteError = Error || std.Io.Writer.Error;

/// Frame one envelope onto the line. The cap is the far road's, read off its
/// hint, and an envelope over it is refused here rather than sent — the
/// refusal is the sender's own kit's, because on the far end it would be a
/// framing fault and cost the connection.
///
/// A zero-length frame is malformed on a line, so this refuses an empty
/// envelope even though a zero length is a legal value everywhere else in
/// the encoding.
pub fn writeFrame(w: *std.Io.Writer, cap: i64, envelope: []const u8) WriteError!void {
    const length = std.math.cast(i64, envelope.len) orelse return Error.Refused;
    if (length <= 0) return Error.Refused;
    if (length > cap) return Error.Refused;
    try w.writeAll(&writeLength(length));
    try w.writeAll(envelope);
    try w.flush();
}

pub const ReadError = Framing || std.Io.Reader.Error || std.mem.Allocator.Error;

/// Read one frame off the line. `error.EndOfStream` means the peer closed
/// between frames, which is weather; `error.Framing` means the connection is
/// over and no word is owed.
///
/// The bytes returned are the caller's, allocated out of `gpa` rather than
/// pointing into the reader's buffer, because the buffer is the next frame's.
pub fn readFrame(gpa: std.mem.Allocator, r: *std.Io.Reader, cap: i64) ReadError![]u8 {
    const head = try r.takeArray(length_bytes);
    const length = readLength(head);

    // A length at or below zero, or a length above this end's cap.
    if (length <= 0) return Framing.Framing;
    if (length > cap) return Framing.Framing;

    const n: usize = @intCast(length);
    const body = try gpa.alloc(u8, n);
    errdefer gpa.free(body);
    r.readSliceAll(body) catch |e| switch (e) {
        // "A body the connection ends before delivering is the fault having
        // already happened."
        error.EndOfStream => return Framing.Framing,
        error.ReadFailed => return e,
    };
    return body;
}

// ------------------------------------------------------------------ the road

/// Dial a listening door. The dialing end publishes nothing and promises the
/// default cap for what arrives back down the line it opened.
pub fn dial(io: std.Io, address: *const net.IpAddress) !net.Stream {
    return net.IpAddress.connect(address, io, .{ .mode = .stream });
}

/// Listen. Only the listening end has a road to publish.
pub fn listen(io: std.Io, address: *const net.IpAddress) !net.Server {
    return net.IpAddress.listen(address, io, .{ .reuse_address = true });
}

// ---------------------------------------------------------------- the caller

/// How much of a frame this end reads and writes at a time. It bounds no
/// envelope — `readFrame` allocates the body out of the caller's allocator and
/// streams into it — so it is this kit's own number and never the law's.
const window = 4096;

/// One line this caller dialled and kept.
///
/// It is allocated rather than held by value because the reader and the writer
/// point into the buffers beside them: a line that moved would leave both
/// pointing where it used to be.
pub const Held = struct {
    stream: net.Stream,
    io: std.Io,
    /// What the far road promised it accepts, read off its hint before the
    /// connection was made. This end publishes nothing and so promises the
    /// default for what comes back.
    far_cap: i64,
    in: [window]u8 = undefined,
    out: [window]u8 = undefined,
    reader: net.Stream.Reader = undefined,
    writer: net.Stream.Writer = undefined,
    open: bool = true,

    /// Send one ask down this line and take the answer off it.
    ///
    /// Silence has no wire form here: a refused ask produces no frame, and the
    /// far end going away between frames is the whole of what nothing looks
    /// like. A dropped line is weather and dialing again is the caller's
    /// affair, so a line that ends is marked shut rather than reopened here.
    pub fn carry(self: *Held, gpa: std.mem.Allocator) !carriage.Answer {
        return readFrame(gpa, &self.reader.interface, default_cap) catch |why| switch (why) {
            error.EndOfStream => {
                self.open = false;
                return null;
            },
            else => {
                self.open = false;
                return why;
            },
        };
    }

    fn ask(self: *Held, gpa: std.mem.Allocator, sealed: []const u8) !carriage.Answer {
        writeFrame(&self.writer.interface, self.far_cap, sealed) catch |why| {
            // An envelope over the far road's cap is refused before a byte
            // flows and costs the line nothing; anything else already cost it.
            if (why != Error.Refused) self.open = false;
            return why;
        };
        return self.carry(gpa);
    }

    fn shut(self: *Held, gpa: std.mem.Allocator) void {
        if (self.open) self.stream.close(self.io);
        self.open = false;
        gpa.destroy(self);
    }
};

pub const SendError = Error || carriage.PostError || ReadError || WriteError || anyerror;

/// The caller a ground with sockets under it holds.
///
/// **A warden offers as many roads as it has and a caller tries them.**
/// Choosing among a peer's hints is the caller's whole job, and nothing at a
/// call site says which road was taken: this walks them, takes the line
/// wherever one is offered, and falls through to the common carriage
/// everywhere else.
///
/// Which roads a caller can speak is never configured and never passed. In Zig
/// it is answered when the program is compiled: one that imports this module
/// has sockets under it, and one that does not calls `carriage.post` and
/// speaks the common carriage alone. There is no browser under a Zig binary,
/// so unlike the JS kit there is nothing to find out at runtime.
///
/// The lines it dials are kept, one per road, because a line is persistent by
/// definition: a fresh connection per ask would be the common carriage wearing
/// a socket, and it would leave a ground that publishes nothing unreachable
/// between calls — Article III's dialing end is reachable down the lines it
/// holds and nowhere else. What Article II leaves to the ground is how a line
/// is guarded once held, not whether the caller has one; a caller that hung up
/// after every ask would be answering the article's own question for the
/// ground and answering it no.
///
/// They belong to the ground that took them up, so `hangUp` is how they are put
/// down.
pub const Caller = struct {
    held: std.StringHashMapUnmanaged(*Held) = .empty,

    /// Carry the sealed bytes down the first road this caller can speak that
    /// actually carried them.
    ///
    /// A road this caller cannot speak is not a road that failed. Nothing was
    /// sent down it, so no door spoke and no road broke — it is walked past
    /// exactly as a hint that was never offered would be, and it is never the
    /// fault raised at the end. Every hint being such a road therefore hands
    /// back `null` without raising: no road was tried, so there is no fault to
    /// report the road of.
    pub fn send(
        self: *Caller,
        gpa: std.mem.Allocator,
        io: std.Io,
        hints: []const []const u8,
        sealed: []const u8,
        cap: usize,
    ) SendError!carriage.Answer {
        var last: ?anyerror = null;
        for (hints) |hint| {
            if (std.mem.startsWith(u8, hint, scheme)) {
                if (self.overLine(gpa, io, hint, sealed)) |answer| {
                    return answer;
                } else |why| {
                    // A hint this road cannot read is not a road at all, and it
                    // is skipped rather than raised: nothing was sent down it.
                    if (why != Error.Refused) last = why;
                }
                continue;
            }
            if (carriage.post(gpa, io, hint, sealed, cap)) |answer| {
                return answer;
            } else |why| {
                last = why;
            }
        }
        if (last) |why| return why;
        return null;
    }

    /// Let go of every line this caller dialled. A line is a held resource and
    /// the ground that took it up is the one that puts it down.
    pub fn hangUp(self: *Caller, gpa: std.mem.Allocator) void {
        var walk = self.held.iterator();
        while (walk.next()) |entry| {
            gpa.free(entry.key_ptr.*);
            entry.value_ptr.*.shut(gpa);
        }
        self.held.deinit(gpa);
        self.held = .empty;
    }

    fn overLine(
        self: *Caller,
        gpa: std.mem.Allocator,
        io: std.Io,
        hint: []const u8,
        sealed: []const u8,
    ) !carriage.Answer {
        const held = try self.take(gpa, io, hint);
        return held.ask(gpa, sealed);
    }

    /// The line held for this road, dialled if there is none or if the one
    /// there is has ended. A hint is matched byte for byte as written, which is
    /// what makes it a key.
    fn take(self: *Caller, gpa: std.mem.Allocator, io: std.Io, hint: []const u8) !*Held {
        if (self.held.get(hint)) |had| {
            if (had.open) return had;
            if (self.held.fetchRemove(hint)) |gone| gpa.free(gone.key);
            had.shut(gpa);
        }

        const read = try readHint(hint);
        const address = try net.IpAddress.parse(read.host, read.port);
        const stream = try dial(io, &address);
        errdefer stream.close(io);

        const held = try gpa.create(Held);
        errdefer gpa.destroy(held);
        held.* = .{ .stream = stream, .io = io, .far_cap = read.cap() };
        held.reader = stream.reader(io, &held.in);
        held.writer = stream.writer(io, &held.out);

        const key = try gpa.dupe(u8, hint);
        errdefer gpa.free(key);
        try self.held.put(gpa, key, held);
        return held;
    }
};
