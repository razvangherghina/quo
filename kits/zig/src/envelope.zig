//! The envelope: the sealed letter and its two faces. Article XI of the
//! constitution is the whole specification.
//!
//! What crosses is an ephemeral public key and then one ciphertext, sealed to
//! the recipient's padlock. Nothing else is outside. Inside the seal are two
//! things: the payload, and one signature over it — the last sixty-four bytes.
//! The payload begins with one byte naming the record it carries, zero for a
//! `say` and one for an `answer`, and the signature covers that byte with the
//! rest.
//!
//! This is the first module that composes the three below it: the shapes are
//! the notation's, the bytes are the wire's, and the seal and the signature
//! are the arithmetic's.

const std = @import("std");
const notation = @import("notation");
const wire = @import("wire");
const arithmetic = @import("arithmetic");

pub const Error = error{Refused};

const Fault = Error || std.mem.Allocator.Error;

pub const key_length = arithmetic.key_length;
pub const Key = arithmetic.Key;
pub const signature_length = arithmetic.signature_length;
pub const Signature = arithmetic.Signature;

/// The byte in front of the payload. Any other first byte is silence.
pub const Kind = enum(u8) {
    say = 0,
    answer = 1,

    pub fn of(byte: u8) Error!Kind {
        return switch (byte) {
            0 => .say,
            1 => .answer,
            else => Error.Refused,
        };
    }
};

/// The two records, in the notation, with their fields in the order Article
/// XI gives them — the order is agreed because that text fixes it. The class
/// block exists only so this text is a blueprint the notation will read; no
/// digest of either record is ever computed or carried. The blocks themselves
/// stand in the order the notation derives from first use, which is a rule of
/// the notation and touches no byte on the wire.
pub const shapes_text =
    \\Envelope
    \\  say() say
    \\  answer() answer
    \\
    \\say
    \\  voice b32
    \\  recipient b32
    \\  commitment b32?
    \\  seq int
    \\  padlock b32
    \\  hints [text]
    \\  allowance allowance
    \\  being being?
    \\  method method?
    \\
    \\allowance
    \\  time int
    \\  hops int
    \\
    \\method
    \\  name text
    \\  args bytes
    \\
    \\answer
    \\  warden being
    \\  seq int
    \\  data bytes?
    \\
;

/// The time budget in milliseconds, then the hops.
pub const Allowance = struct {
    time: i64,
    hops: i64,
};

/// A name and its arguments as one opaque, length-prefixed blob whose meaning
/// belongs to the blueprint. The blob is empty when the method takes nothing.
pub const Method = struct {
    name: []const u8,
    args: []const u8,
};

/// One utterance from a voice to a door.
pub const Say = struct {
    voice: Key,
    recipient: Key,
    /// Present only when the message spends an heir.
    commitment: ?Key = null,
    seq: i64,
    padlock: Key,
    hints: []const []const u8 = &.{},
    allowance: Allowance,
    being: ?Key = null,
    method: ?Method = null,
};

/// The answering warden's name, the number of the ask it answers, and the
/// data — absent when the field answers nothing.
pub const Answer = struct {
    warden: Key,
    seq: i64,
    data: ?[]const u8 = null,
};

pub const Payload = union(Kind) {
    say: Say,
    answer: Answer,

    /// The voice a payload's signature must be checked against: the signer
    /// travels inside, because a signature proves nothing without it.
    pub fn signer(self: Payload) Key {
        return switch (self) {
            .say => |s| s.voice,
            .answer => |a| a.warden,
        };
    }
};

/// A payload and the arena that owns every byte it points at.
pub const Opened = struct {
    arena: std.heap.ArenaAllocator,
    payload: Payload,

    pub fn deinit(self: *Opened) void {
        self.arena.deinit();
    }
};

// ------------------------------------------------------------- the records

fn blockOf(blueprint: notation.Blueprint, name: []const u8) Error!notation.Block {
    for (blueprint.records) |r| {
        if (std.mem.eql(u8, r.name, name)) return r;
    }
    return Error.Refused;
}

fn shapes(a: std.mem.Allocator) Fault!notation.Blueprint {
    return notation.parse(a, shapes_text) catch |e| switch (e) {
        error.OutOfMemory => error.OutOfMemory,
        else => Error.Refused,
    };
}

fn optionalKey(a: std.mem.Allocator, held: ?Key, names_a_being: bool) Fault!wire.Value {
    const k = held orelse return .absent;
    const inner = try a.create(wire.Value);
    inner.* = if (names_a_being) .{ .being = k } else .{ .b32 = k };
    return .{ .present = inner };
}

fn valueOf(a: std.mem.Allocator, payload: Payload) Fault!wire.Value {
    switch (payload) {
        .say => |s| {
            const hints = try a.alloc(wire.Value, s.hints.len);
            for (s.hints, hints) |text, *slot| slot.* = .{ .text = text };

            const allowance = try a.alloc(wire.Value, 2);
            allowance[0] = .{ .integer = s.allowance.time };
            allowance[1] = .{ .integer = s.allowance.hops };

            var method: wire.Value = .absent;
            if (s.method) |m| {
                const pair = try a.alloc(wire.Value, 2);
                pair[0] = .{ .text = m.name };
                pair[1] = .{ .bytes = m.args };
                const held = try a.create(wire.Value);
                held.* = .{ .record = pair };
                method = .{ .present = held };
            }

            const fields = try a.alloc(wire.Value, 9);
            fields[0] = .{ .b32 = s.voice };
            fields[1] = .{ .b32 = s.recipient };
            fields[2] = try optionalKey(a, s.commitment, false);
            fields[3] = .{ .integer = s.seq };
            fields[4] = .{ .b32 = s.padlock };
            fields[5] = .{ .list = hints };
            fields[6] = .{ .record = allowance };
            fields[7] = try optionalKey(a, s.being, true);
            fields[8] = method;
            return .{ .record = fields };
        },
        .answer => |ans| {
            var data: wire.Value = .absent;
            if (ans.data) |d| {
                const held = try a.create(wire.Value);
                held.* = .{ .bytes = d };
                data = .{ .present = held };
            }
            const fields = try a.alloc(wire.Value, 3);
            fields[0] = .{ .being = ans.warden };
            fields[1] = .{ .integer = ans.seq };
            fields[2] = data;
            return .{ .record = fields };
        },
    }
}

fn keyOf(value: wire.Value) Error!Key {
    return switch (value) {
        .b32 => |k| k,
        .being => |k| k,
        else => Error.Refused,
    };
}

fn optionalOf(value: wire.Value) Error!?wire.Value {
    return switch (value) {
        .absent => null,
        .present => |held| held.*,
        else => Error.Refused,
    };
}

fn intOf(value: wire.Value) Error!i64 {
    return switch (value) {
        .integer => |n| n,
        else => Error.Refused,
    };
}

fn sayOf(a: std.mem.Allocator, value: wire.Value) Fault!Say {
    const fields = switch (value) {
        .record => |f| f,
        else => return Error.Refused,
    };
    if (fields.len != 9) return Error.Refused;

    const raw_hints = switch (fields[5]) {
        .list => |items| items,
        else => return Error.Refused,
    };
    const hints = try a.alloc([]const u8, raw_hints.len);
    for (raw_hints, hints) |item, *slot| {
        slot.* = switch (item) {
            .text => |t| t,
            else => return Error.Refused,
        };
    }

    const raw_allowance = switch (fields[6]) {
        .record => |f| f,
        else => return Error.Refused,
    };
    if (raw_allowance.len != 2) return Error.Refused;

    var method: ?Method = null;
    if (try optionalOf(fields[8])) |held| {
        const pair = switch (held) {
            .record => |f| f,
            else => return Error.Refused,
        };
        if (pair.len != 2) return Error.Refused;
        method = .{
            .name = switch (pair[0]) {
                .text => |t| t,
                else => return Error.Refused,
            },
            .args = switch (pair[1]) {
                .bytes => |b| b,
                else => return Error.Refused,
            },
        };
    }

    return .{
        .voice = try keyOf(fields[0]),
        .recipient = try keyOf(fields[1]),
        .commitment = if (try optionalOf(fields[2])) |held| try keyOf(held) else null,
        .seq = try intOf(fields[3]),
        .padlock = try keyOf(fields[4]),
        .hints = hints,
        .allowance = .{
            .time = try intOf(raw_allowance[0]),
            .hops = try intOf(raw_allowance[1]),
        },
        .being = if (try optionalOf(fields[7])) |held| try keyOf(held) else null,
        .method = method,
    };
}

fn answerOf(value: wire.Value) Error!Answer {
    const fields = switch (value) {
        .record => |f| f,
        else => return Error.Refused,
    };
    if (fields.len != 3) return Error.Refused;
    return .{
        .warden = try keyOf(fields[0]),
        .seq = try intOf(fields[1]),
        .data = if (try optionalOf(fields[2])) |held| switch (held) {
            .bytes => |b| b,
            else => return Error.Refused,
        } else null,
    };
}

// ------------------------------------------------------------- the payload

/// The record alone, by the notation's own rules — no byte in front of it.
pub fn encodeRecord(gpa: std.mem.Allocator, payload: Payload) Fault![]u8 {
    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const a = arena.allocator();

    var blueprint = try shapes(a);
    defer blueprint.deinit();

    const name = @tagName(std.meta.activeTag(payload));
    _ = try blockOf(blueprint, name);

    const value = try valueOf(a, payload);
    return wire.encode(gpa, name, blueprint.records, value);
}

/// The signed payload: the byte naming the record, then the record.
pub fn encodePayload(gpa: std.mem.Allocator, payload: Payload) Fault![]u8 {
    const record = try encodeRecord(gpa, payload);
    defer gpa.free(record);

    const out = try gpa.alloc(u8, record.len + 1);
    out[0] = @intFromEnum(std.meta.activeTag(payload));
    @memcpy(out[1..], record);
    return out;
}

/// Read one record of the named kind. Bytes left over are refused, as
/// everywhere else.
pub fn decodeRecord(gpa: std.mem.Allocator, kind: Kind, raw: []const u8) Fault!Opened {
    var arena = std.heap.ArenaAllocator.init(gpa);
    errdefer arena.deinit();
    const a = arena.allocator();

    const blueprint = try shapes(a);
    // The blueprint's own arena is the caller's arena; nothing is freed here.

    // A decoded payload points into the bytes it was read from, and those
    // bytes are the unsealing's own scratch. The arena owns a copy, so what
    // comes back outlives the letter it came out of.
    const owned = try a.dupe(u8, raw);

    const decoded = wire.decode(a, @tagName(kind), blueprint.records, owned) catch |e| switch (e) {
        error.OutOfMemory => return error.OutOfMemory,
        else => return Error.Refused,
    };

    const payload: Payload = switch (kind) {
        .say => .{ .say = try sayOf(a, decoded.value) },
        .answer => .{ .answer = try answerOf(decoded.value) },
    };

    return .{ .arena = arena, .payload = payload };
}

/// Read a payload that carries its own byte in front. The byte is read rather
/// than assumed, and a record presented under the wrong byte is silence: the
/// caller says which record it is expecting, because every end of a road
/// expects one. A door expects a `say`; a caller awaiting an answer expects an
/// `answer`.
pub fn decodePayload(gpa: std.mem.Allocator, expected: Kind, raw: []const u8) Fault!Opened {
    if (raw.len == 0) return Error.Refused;
    if (try Kind.of(raw[0]) != expected) return Error.Refused;
    return decodeRecord(gpa, expected, raw[1..]);
}

// -------------------------------------------------------------- the letter

/// The length of the envelope a payload of this length seals into: the
/// ephemeral public key, the payload, its signature, and the tag.
pub fn envelopeLength(payload_length: usize) usize {
    return key_length + arithmetic.boxLength(payload_length + signature_length);
}

/// Seal one payload to a padlock. The ephemeral key is fresh on every
/// message, belongs to no one and is never reused; its secret is the
/// caller's to draw.
pub fn seal(
    gpa: std.mem.Allocator,
    ephemeral_secret: Key,
    padlock: Key,
    voice_secret: Key,
    payload: Payload,
) Fault![]u8 {
    const signed = try encodePayload(gpa, payload);
    defer gpa.free(signed);

    const ephemeral = try arithmetic.sealingPair(ephemeral_secret);
    const shared = try arithmetic.agree(ephemeral_secret, padlock);
    const signature = try arithmetic.sign(voice_secret, signed);

    const inner = try gpa.alloc(u8, signed.len + signature_length);
    defer gpa.free(inner);
    @memcpy(inner[0..signed.len], signed);
    @memcpy(inner[signed.len..], &signature);

    const out = try gpa.alloc(u8, envelopeLength(signed.len));
    errdefer gpa.free(out);
    out[0..key_length].* = ephemeral.public;
    arithmetic.seal(out[key_length..], shared, &ephemeral.public, inner);
    return out;
}

/// Unseal with the recipient's own secret, split the signature off the back,
/// read the payload under the byte this end expects, and check the signature
/// against the voice that travels inside it. Every failure is the same
/// failure, and this one never says which step it was.
pub fn open(
    gpa: std.mem.Allocator,
    padlock_secret: Key,
    expected: Kind,
    envelope: []const u8,
) Fault!Opened {
    var opened = try unseal(gpa, padlock_secret, envelope);
    errdefer opened.deinit();
    if (opened.payload != expected) return Error.Refused;
    return opened;
}

/// Unseal without saying which record is expected: the byte in front of the
/// payload is read rather than assumed, and what comes back says which of the
/// two arrived.
///
/// **This is the warden's, and only the warden's.** A road that called it
/// would be a road that opened a seal, which is the one thing a road may
/// never do. It exists because one entry point takes anything a road brings
/// and must sort an answer from an ask itself, having unsealed exactly once.
pub fn unseal(
    gpa: std.mem.Allocator,
    padlock_secret: Key,
    envelope: []const u8,
) Fault!Opened {
    if (envelope.len < key_length) return Error.Refused;
    const ephemeral: Key = envelope[0..key_length].*;
    const box = envelope[key_length..];
    if (box.len < arithmetic.tag_length + signature_length + 1) return Error.Refused;

    const shared = try arithmetic.agree(padlock_secret, ephemeral);

    const inner = try gpa.alloc(u8, box.len - arithmetic.tag_length);
    defer gpa.free(inner);
    try arithmetic.open(inner, shared, &ephemeral, box);

    const signed = inner[0 .. inner.len - signature_length];
    const signature: Signature = inner[inner.len - signature_length ..][0..signature_length].*;

    if (signed.len == 0) return Error.Refused;
    var opened = try decodeRecord(gpa, try Kind.of(signed[0]), signed[1..]);
    errdefer opened.deinit();

    try arithmetic.verify(opened.payload.signer(), signed, signature);
    return opened;
}
