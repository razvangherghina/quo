//! The being's whole API to Quo: what a held object is given, and the handle
//! it reaches a far being through. **Nothing here sees a key or a road.**
//!
//! `papers/quo-truth.md` part two is the whole specification. A being's class
//! is unrestricted — any field, any private state — and its blueprint is the
//! projection of that class which crosses to strangers. This module is what
//! joins the two: the blueprint's declared types on one side, the class's own
//! Zig types on the other, and the codec between them written once, at
//! compile time, from the class itself.
//!
//! **The idiom, and why.** Zig has no way to add a method to an object at
//! runtime and no async-local scope to hide a caller in, so neither of the
//! JS kit's two devices is available. What Zig has instead is reflection over
//! a type at compile time. So a being declares ordinary public methods, and
//! `organ` builds the dispatch from the type itself: for the field the door
//! found, the method of that name is called with arguments already decoded
//! into the parameter types it declared, and whatever it answers is encoded
//! as the type the blueprint declared. A mismatch between the two is a
//! compile error at the `organ` call and never a silence at run time.
//!
//! **The caller and the leash arrive as an argument**, not out of a hidden
//! scope: a method that wants either declares `*At` as its first parameter
//! after `self` and receives the call whole. That is the one honest way in a
//! language with no ambient context, and it is what makes a being safe to
//! call on two threads at once.

const std = @import("std");
const notation = @import("notation");
const wire = @import("wire");
const envelope = @import("envelope");
const warden = @import("warden");

pub const Key = warden.Key;
pub const Error = warden.Error;
const Fault = Error || std.mem.Allocator.Error;

// ------------------------------------------------------------- the closure

/// What a being is given: the facts of the call it is in, and the acts it may
/// perform. **Facts and acts, never a judgment** — permission lives in the
/// warden's record alone, and a being that refused by caller would be writing
/// a refusal nobody can audit.
pub const At = struct {
    door: *warden.Warden,
    /// The being this is the closure of.
    being: Key,
    gpa: std.mem.Allocator,
    /// The verified caller and the kind the judgment found, or nothing where
    /// the being started this walk itself.
    caller: ?warden.Caller = null,
    /// What arrived, and when. Absent for a walk of the being's own.
    leash: ?warden.Leash = null,
    arrived: i64 = 0,

    /// What a walk from here may be made under: the leash in scope, shrunk by
    /// this door's own dwell and one hop, or the warden's own default where
    /// the being started the walk itself. **A being hands its leash on and
    /// never widens one.**
    pub fn allowance(self: At) ?warden.Allowance {
        const held = self.leash orelse return self.door.allowance;
        const onward = warden.onward(held, self.door.clock() - self.arrived) orelse return null;
        return .{ .time = onward.time, .hops = onward.hops };
    }

    /// Who holds a place at me, **as voices only**.
    pub fn standings(self: At, a: std.mem.Allocator) std.mem.Allocator.Error![]Key {
        self.door.take();
        defer self.door.give();
        return self.door.standingsAt(a, self.being);
    }

    /// A handle at a being elsewhere, or beside me, under a private label.
    pub fn relation(self: At, name: []const u8) ?Handle {
        self.door.take();
        defer self.door.give();
        const kept = self.door.labelled(name) orelse return null;
        return switch (kept.at) {
            .local => |pk| if (self.door.being(pk) == null) null else Handle{
                .door = self.door,
                .under = self,
                .reach = .{ .near = pk },
            },
            .far => |one| if (self.door.rowAt(one.warden, one.voice)) |at| Handle{
                .door = self.door,
                .under = self,
                .reach = .{ .far = .{ .at = at, .being = one.being, .text = one.text } },
            } else null,
        };
    }

    /// Open a being to somebody. `grant(null)` opens this being itself, which
    /// is what a being's own `invite` field is.
    pub fn grant(self: At, a: std.mem.Allocator, target: ?Key) Fault!wire.Invitation {
        self.door.take();
        defer self.door.give();
        return self.door.grant(a, target orelse self.being);
    }

    pub fn amend(self: At, voice: Key, add: []const Key, remove: []const Key) Fault!bool {
        self.door.take();
        defer self.door.give();
        return self.door.amend(voice, add, remove);
    }

    /// Let a being go: this one, or a smaller one minted beside it.
    pub fn release(self: At, target: ?Key) bool {
        self.door.take();
        defer self.door.give();
        return self.door.releaseBeing(target orelse self.being);
    }

    /// Offer a being to every voice, the stranger included; `conceal` takes it
    /// back. No target opens this being itself, as `grant` does.
    pub fn expose(self: At, target: ?Key) Fault!bool {
        self.door.take();
        defer self.door.give();
        return self.door.expose(target orelse self.being);
    }

    pub fn conceal(self: At, target: ?Key) bool {
        self.door.take();
        defer self.door.give();
        return self.door.conceal(target orelse self.being);
    }

    /// An invitation received as data, turned into handles — **with the
    /// double rotation done and impossible to forget**. A standing names
    /// beings, so what comes back is one handle per being it names.
    pub fn accept(self: At, invitation: wire.Invitation) Fault!?Accepted {
        return accepting(self.door, self.gpa, invitation, self);
    }

    /// A card received as data, turned into a handle at the far door's public
    /// being — **held as a stranger**. What that door shows a stranger is what
    /// this handle's `describe` answers, and nothing else.
    pub fn knock(self: At, card: wire.Card) Fault!?Handle {
        return knocking(self.door, card, self);
    }

    /// Read a standing again at the far door this handle reaches down.
    /// **A standing widened by an amend is re-read rather than remembered**:
    /// nobody was told it grew, and this is how a holder finds what was added.
    pub fn again(self: At, from: Handle) Fault!?Accepted {
        const far = switch (from.reach) {
            .near => return null,
            .far => |one| one,
        };
        return standingAt(self.door, self.gpa, far.at, self);
    }

    /// Keep a private label beside a handle. **Labels resolve nothing and
    /// travel nowhere**: they are this being's own name for a relation, and
    /// `relation(label)` is the only thing that reads one.
    pub fn label(self: At, text: []const u8, handle: Handle) Fault!void {
        const kept: warden.LabelAt = switch (handle.reach) {
            .near => |pk| .{ .local = pk },
            .far => |one| .{
                .far = .{
                    // The row is named rather than positioned: dropping any
                    // earlier row shifts every index after it.
                    .warden = self.door.houseAt(one.at) orelse return Error.Refused,
                    .voice = self.door.voiceAt(one.at) orelse return Error.Refused,
                    .being = one.being,
                    // The label is the warden's record, so the text it keeps is
                    // the warden's to free.
                    .text = try self.door.gpa.dupe(u8, one.text),
                },
            },
        };
        self.door.take();
        defer self.door.give();
        try self.door.keepLabel(text, kept);
        self.door.persist() catch {};
    }

    /// Mint a smaller being beside me and hold it. The minting being owns
    /// what it minted, and releasing it takes every standing at it away.
    pub fn hold(
        self: At,
        comptime T: type,
        object: *T,
        blueprint: []const u8,
        name: ?[]const u8,
    ) Fault!Handle {
        return holding(self.door, T, object, blueprint, .{ .label = name }, self.gpa);
    }
};

/// What a being holds so it can reach Quo outside a call — from a clock, an
/// event, or a walk of its own. It is filled in when the warden takes the
/// object up, and is nothing at all until then.
///
/// A class carries it as `_quo: quo.Cell = .{}`, and under that name it can
/// never collide with a field the class declares.
pub const Cell = struct {
    door: ?*warden.Warden = null,
    being: Key = std.mem.zeroes(Key),

    /// A closure for a walk this being is starting itself. **A leash is born
    /// here**, as the warden's own default allowance.
    pub fn at(self: Cell, gpa: std.mem.Allocator) ?At {
        const door = self.door orelse return null;
        return .{ .door = door, .being = self.being, .gpa = gpa };
    }
};

/// What one far call met: the value or nothing, and whether that nothing was
/// a road that never carried rather than the far door's silence. **The second
/// half never leaves this ground** — outward the two are one, as they must be.
fn Met(comptime A: type) type {
    return struct { value: ?A, weather: bool };
}

// -------------------------------------------------------------- the handle

/// A handle at a being: **every field its blueprint declares is callable, and
/// every call answers a value or silence.** A being always knows which of its
/// references are Quo, because a Quo handle looks like one and nothing else
/// in Zig does.
///
/// A being under the same warden is reached through a handle too, with **one
/// shape** — leashed, possibly silent, the value still through the codec — and
/// it pays no seal and no judgment, because under one warden there are no
/// strangers and no voices.
pub const Handle = struct {
    door: *warden.Warden,
    /// The closure the call is made from, which is what carries the leash on.
    under: At,
    reach: union(enum) {
        far: struct { at: usize, being: Key, text: []const u8 },
        near: Key,
    },

    /// The being this handle points at, by the name it wears now. A handle
    /// keeps the name it was made with; **a being that migrated wears the
    /// name its new house minted**, and the row is where a believed
    /// succession put it.
    pub fn being(self: Handle) Key {
        return switch (self.reach) {
            .far => |one| blk: {
                self.door.take();
                defer self.door.give();
                break :blk self.door.currentAt(one.at, one.being);
            },
            .near => |pk| pk,
        };
    }

    /// The class this handle calls through, which is the blueprint the far
    /// door answered for that being.
    pub fn text(self: Handle) []const u8 {
        return switch (self.reach) {
            .far => |one| one.text,
            .near => |pk| blk: {
                self.door.take();
                defer self.door.give();
                const row = self.door.being(pk) orelse break :blk "";
                break :blk row.text;
            },
        };
    }

    // ------------------------------------------------- introspection, beside
    // the fields. Each of the four is an ordinary ask at the far door's own
    // fields, and each answers a value or silence like any other.

    /// The estate the far door shows this voice. **What a stranger is shown is
    /// the public being and nothing else**, and what a holder is shown is what
    /// its row names — neither is the estate, which is never enumerable from
    /// outside.
    pub fn describe(self: Handle, gpa: std.mem.Allocator) Fault!?warden.ReadEstate {
        switch (self.reach) {
            .near => {
                self.door.take();
                defer self.door.give();
                return self.door.estateWithin(gpa) catch null;
            },
            .far => {
                var opened = (try self.askDoor(gpa, "describe", "")) orelse return null;
                defer opened.deinit();
                const data = opened.payload.answer.data orelse return null;
                return warden.decodeEstate(gpa, data) catch null;
            },
        }
    }

    /// This being's own sketch. A being the voice may not reach is silence,
    /// never an absence: a door answering "absent" about a being you do not
    /// reach would be a door confirming that being exists.
    pub fn sketch(self: Handle, gpa: std.mem.Allocator) Fault!?warden.Sketch {
        switch (self.reach) {
            .near => |pk| {
                self.door.take();
                defer self.door.give();
                return self.door.sketchWithin(pk) catch null;
            },
            .far => {
                const blob = try warden.writeBeing(gpa, self.being());
                defer gpa.free(blob);
                var opened = (try self.askDoor(gpa, "sketch", blob)) orelse return null;
                defer opened.deinit();
                const data = opened.payload.answer.data orelse return null;
                return warden.decodeSketch(gpa, data) catch null;
            },
        }
    }

    /// A blueprint by digest. The text comes back owned by `gpa`.
    pub fn blueprint(self: Handle, gpa: std.mem.Allocator, want: Key) Fault!?[]u8 {
        switch (self.reach) {
            .near => {
                self.door.take();
                defer self.door.give();
                const held = self.door.blueprintWithin(want) catch return null;
                return try gpa.dupe(u8, held);
            },
            .far => {
                const blob = try warden.writeDigest(gpa, want);
                defer gpa.free(blob);
                var opened = (try self.askDoor(gpa, "blueprint", blob)) orelse return null;
                defer opened.deinit();
                const data = opened.payload.answer.data orelse return null;
                return warden.readBlueprint(gpa, data) catch null;
            },
        }
    }

    /// The far door's limit: the largest message it will read.
    pub fn limit(self: Handle, gpa: std.mem.Allocator) Fault!?i64 {
        switch (self.reach) {
            .near => {
                self.door.take();
                defer self.door.give();
                return @intCast(self.door.limit);
            },
            .far => {
                var opened = (try self.askDoor(gpa, "limit", "")) orelse return null;
                defer opened.deinit();
                const data = opened.payload.answer.data orelse return null;
                return warden.decodeLimit(gpa, data) catch null;
            },
        }
    }

    /// One ask at the far door's own being, named by no being at all — which
    /// is the shortcut the judgment reads as the warden's own.
    fn askDoor(
        self: Handle,
        gpa: std.mem.Allocator,
        name: []const u8,
        args: []const u8,
    ) Fault!?envelope.Opened {
        const far = switch (self.reach) {
            .near => return null,
            .far => |one| one,
        };
        const budget = self.under.allowance() orelse return null;
        return self.door.askAt(gpa, far.at, .{
            .method = .{ .name = name, .args = args },
            .allowance = budget,
        }) catch null;
    }

    /// Call one declared field. `A` is the Zig type the answer is wanted as,
    /// and `void` where the field declares none; `args` is a tuple of the
    /// arguments, which this kit's notation caps at one.
    ///
    /// Silence is `null`, and it means refused, broken or absent with no way
    /// to tell which.
    pub fn call(
        self: Handle,
        gpa: std.mem.Allocator,
        comptime A: type,
        name: []const u8,
        args: anytype,
    ) Fault!?A {
        switch (self.reach) {
            .near => |pk| return self.near(gpa, A, name, pk, args),
            .far => {
                var sealed = try self.seal(gpa, name, args);
                defer if (sealed) |*one| one.deinit(gpa);
                const answered = try self.met(gpa, A, name, sealed);
                // **Weather is not the far door's silence**: no road carried
                // the bytes, so nothing there moved and there is nothing to
                // ask after. The handle keeps its shape and answers nothing;
                // the ground was told the road's fault inward.
                if (answered.value == null and !answered.weather) self.follow(gpa);
                return answered.value;
            },
        }
    }

    /// Follow a being that moved, having met the move. **The old door only
    /// points**: an ask at a being that left is silence like any other
    /// refusal, and the succession that door published is answered by `moved`
    /// and by nothing else — so a peer that missed the news asks for it here,
    /// after the silence, and hands what comes back to its own warden to
    /// believe by the steps news is believed by.
    ///
    /// Nothing is retried. **The ask that met the move is silence**, as every
    /// ask at a departed being is, and the next call down this handle reaches
    /// the new house — a retry would turn one call into two at the far door
    /// and hide from the caller that anything moved at all.
    ///
    /// Silence has many causes and this asks after every one of them: only
    /// the door that actually published a succession answers with one, and
    /// every other silence costs one ask that answers absence.
    fn follow(self: Handle, gpa: std.mem.Allocator) void {
        const far = switch (self.reach) {
            .near => return,
            .far => |one| one,
        };
        const blob = warden.writeBeing(gpa, self.being()) catch return;
        defer gpa.free(blob);
        var opened = (self.askDoor(gpa, "moved", blob) catch null) orelse return;
        defer opened.deinit();
        const data = opened.payload.answer.data orelse return;
        var read = (warden.decodeMoved(gpa, data) catch null) orelse return;
        defer read.deinit();

        self.door.take();
        defer self.door.give();
        self.door.pointed(far.at, read.word) catch return;
        self.door.persist() catch {};
    }

    /// The two halves of a call apart, so a caller that met silence can send
    /// the identical envelope again rather than a fresh one. A same-warden
    /// call seals nothing, and there is nothing to resend.
    pub fn seal(
        self: Handle,
        gpa: std.mem.Allocator,
        name: []const u8,
        args: anytype,
    ) Fault!?warden.Warden.Sealed {
        const far = switch (self.reach) {
            .near => return null,
            .far => |one| one,
        };
        var shape = notation.parse(gpa, far.text) catch return null;
        defer shape.deinit();
        // **What the blueprint does not declare does not exist for that
        // being**, so asking for it is silence here rather than a fault: the
        // caller cannot tell an undeclared field from a released being, and
        // must not be able to.
        const field = fieldOf(shape.class, name) orelse return null;
        const blob = writeArguments(gpa, field, shape.records, args) catch return null;
        defer gpa.free(blob);
        const budget = self.under.allowance() orelse return null;
        const now = self.being();

        self.door.take();
        defer self.door.give();
        return self.door.sealAsk(gpa, far.at, .{
            .being = now,
            .method = .{ .name = name, .args = blob },
            .allowance = budget,
        }) catch null;
    }

    /// Send what was sealed, or make the same call without a seal where the
    /// being is under this warden.
    pub fn send(
        self: Handle,
        gpa: std.mem.Allocator,
        comptime A: type,
        name: []const u8,
        sealed: ?warden.Warden.Sealed,
    ) Fault!?A {
        return (try self.met(gpa, A, name, sealed)).value;
    }

    /// The same send, keeping what only this ground learns: whether the
    /// nothing it answers was the far door's silence or a road that never
    /// carried. Outward the two are one, which is what `send` answers.
    fn met(
        self: Handle,
        gpa: std.mem.Allocator,
        comptime A: type,
        name: []const u8,
        sealed: ?warden.Warden.Sealed,
    ) Fault!Met(A) {
        const nothing: Met(A) = .{ .value = null, .weather = false };
        switch (self.reach) {
            .near => return nothing,
            .far => |far| {
                const s = sealed orelse return nothing;
                var shape = notation.parse(gpa, far.text) catch return nothing;
                defer shape.deinit();
                const field = fieldOf(shape.class, name) orelse return nothing;

                // The door takes its own turn here: sending gives it up
                // around delivery and waits for the answer without it, so a
                // caller that held it would be holding the door against the
                // very road that must bring the answer in.
                var said = self.door.sendSaid(gpa, s) catch warden.Warden.Said.silence;
                switch (said) {
                    .silence => return nothing,
                    .weather => return .{ .value = null, .weather = true },
                    .answered => |*opened| {
                        defer opened.deinit();
                        const data = opened.payload.answer.data orelse return nothing;
                        return .{
                            .value = try readAnswer(A, gpa, field, shape.records, data),
                            .weather = false,
                        };
                    },
                }
            },
        }
    }

    /// A call at a being under this same warden. **No seal and no judgment**,
    /// because under one warden there are no strangers and no voices — and
    /// the value still rides through the codec, so a being cannot answer a
    /// neighbour what it could not answer a stranger.
    fn near(
        self: Handle,
        gpa: std.mem.Allocator,
        comptime A: type,
        name: []const u8,
        pk: Key,
        args: anytype,
    ) Fault!?A {
        self.door.take();
        const row = self.door.being(pk) orelse {
            self.door.give();
            return null;
        };
        const shape = row.shape orelse {
            self.door.give();
            return null;
        };
        const field = fieldOf(shape.class, name) orelse {
            self.door.give();
            return null;
        };
        const held = row.organ orelse {
            self.door.give();
            return null;
        };
        const records = shape.records;
        self.door.give();

        const budget = self.under.allowance() orelse return null;
        const blob = writeArguments(gpa, field, records, args) catch return null;
        defer gpa.free(blob);

        const data = held.invoke(held.context, gpa, field, records, blob, .{
            .caller = .{ .voice = null, .kind = .local },
            .leash = .{ .time = budget.time, .hops = budget.hops },
            .arrived = self.door.clock(),
        }) catch return null;
        const bytes = data orelse return if (A == void) {} else null;
        defer gpa.free(bytes);
        return try readAnswer(A, gpa, field, records, bytes);
    }
};

fn fieldOf(class: notation.Block, name: []const u8) ?notation.Field {
    for (class.fields) |f| {
        if (std.mem.eql(u8, f.name, name)) return f;
    }
    return null;
}

// --------------------------------------------------------------- the codec

/// One Zig value written as the type a blueprint declares. The mapping is
/// fixed and total: what has no place in the closed types cannot be declared,
/// so a type this refuses is a class the notation would refuse too.
fn valueOf(
    comptime V: type,
    a: std.mem.Allocator,
    type_text: []const u8,
    value: V,
) Fault!wire.Value {
    if (V == void) return .absent;
    if (V == bool) return .{ .boolean = value };
    if (V == i64) return .{ .integer = value };
    if (V == Key) {
        return if (std.mem.eql(u8, type_text, "being"))
            .{ .being = value }
        else
            .{ .b32 = value };
    }
    if (V == []const u8 or V == []u8) {
        return if (std.mem.eql(u8, type_text, "bytes"))
            .{ .bytes = value }
        else
            .{ .text = value };
    }
    if (V == wire.Invitation) return .{ .invitation = value };
    if (V == wire.Card) return .{ .card = value };
    switch (@typeInfo(V)) {
        .optional => |o| {
            const held = value orelse return .absent;
            const inner = try a.create(wire.Value);
            const under = if (type_text.len > 0 and type_text[type_text.len - 1] == '?')
                type_text[0 .. type_text.len - 1]
            else
                type_text;
            inner.* = try valueOf(o.child, a, under, held);
            return .{ .present = inner };
        },
        else => @compileError("no closed type carries " ++ @typeName(V)),
    }
}

/// The same, backwards.
fn readValue(comptime V: type, value: wire.Value) Error!V {
    if (V == void) return {};
    if (V == bool) return switch (value) {
        .boolean => |b| b,
        else => Error.Refused,
    };
    if (V == i64) return switch (value) {
        .integer => |n| n,
        else => Error.Refused,
    };
    if (V == Key) return switch (value) {
        .b32, .being => |k| k,
        else => Error.Refused,
    };
    if (V == []const u8) return switch (value) {
        .text, .bytes => |t| t,
        else => Error.Refused,
    };
    if (V == wire.Invitation) return switch (value) {
        .invitation => |i| i,
        else => Error.Refused,
    };
    if (V == wire.Card) return switch (value) {
        .card => |c| c,
        else => Error.Refused,
    };
    switch (@typeInfo(V)) {
        .optional => |o| return switch (value) {
            .absent => null,
            .present => |one| try readValue(o.child, one.*),
            else => Error.Refused,
        },
        else => @compileError("no closed type carries " ++ @typeName(V)),
    }
}

/// The arguments a call carries. Every field in this kit's notation takes at
/// most one, so the blob is that one argument or nothing.
fn writeArguments(
    gpa: std.mem.Allocator,
    field: notation.Field,
    records: []const notation.Block,
    args: anytype,
) Fault![]u8 {
    const T = @TypeOf(args);
    const info = @typeInfo(T).@"struct";
    if (info.fields.len != field.arguments.len) return Error.Refused;
    if (info.fields.len == 0) return gpa.dupe(u8, "");

    var arena = std.heap.ArenaAllocator.init(gpa);
    defer arena.deinit();
    const one = args[0];
    const value = try valueOf(@TypeOf(one), arena.allocator(), field.arguments[0].type, one);
    return wire.encode(gpa, field.arguments[0].type, records, value) catch Error.Refused;
}

/// An answer, read as the type the field declared and handed back as the Zig
/// type the caller wanted.
fn readAnswer(
    comptime A: type,
    gpa: std.mem.Allocator,
    field: notation.Field,
    records: []const notation.Block,
    data: []const u8,
) Fault!?A {
    if (A == void) return {};
    const answer_type = field.answer orelse return null;
    var read = wire.decode(gpa, answer_type, records, data) catch return null;
    defer read.deinit();
    const held = readValue(A, read.value) catch return null;
    return try own(A, gpa, held);
}

/// A decoded value points into the arena it was read from, which dies with
/// the decoding. Anything that is bytes is copied out; everything else is a
/// plain value and travels as it is.
fn own(comptime A: type, gpa: std.mem.Allocator, value: A) Fault!A {
    if (A == []const u8) return gpa.dupe(u8, value);
    switch (@typeInfo(A)) {
        .optional => |o| {
            const held = value orelse return null;
            return try own(o.child, gpa, held);
        },
        else => return value,
    }
}

// --------------------------------------------------------------- the organ

/// Build the one way in from the class itself. For the field the door found,
/// the public method of that name is called with its arguments already
/// decoded, and what it answers is encoded as the type the blueprint declared.
///
/// A method may take `*At` as its first parameter after `self`, and is then
/// handed the call whole: the caller, the kind and the leash. One that does
/// not is a method that never needed them.
///
/// `cells` and `take` are the migration contract, and the being provides them
/// rather than receives them: declared on the class, they are used; not
/// declared, the being moves with nothing but its name and its standings.
/// Whether a closed type carries this Zig type at all. It is the same set
/// `valueOf` writes and `readValue` reads, asked as a question rather than
/// answered with a compile error.
fn carries(comptime V: type) bool {
    if (V == void or V == bool or V == i64 or V == Key) return true;
    if (V == []const u8 or V == []u8) return true;
    if (V == wire.Invitation or V == wire.Card) return true;
    return switch (@typeInfo(V)) {
        .optional => |o| carries(o.child),
        else => false,
    };
}

/// Whether a public declaration on the class could be a field of any
/// blueprint. **A method the closed types cannot carry cannot be declared**,
/// so one that does not fit is not a field this door could ever route to, and
/// is passed over rather than compiled into the dispatch. That is what lets a
/// class carry `deinit`, `cells` and whatever else its author wants beside
/// the surface it shows.
fn servable(comptime T: type, comptime name: []const u8) bool {
    const Decl = @TypeOf(@field(T, name));
    if (@typeInfo(Decl) != .@"fn") return false;
    const info = @typeInfo(Decl).@"fn";
    if (info.params.len == 0) return false;
    if (info.params[0].type != *T) return false;

    const answers = info.return_type orelse return false;
    const A = switch (@typeInfo(answers)) {
        .error_union => |u| u.payload,
        else => answers,
    };
    if (!carries(A)) return false;

    var i: usize = 1;
    if (info.params.len >= 2 and info.params[1].type == *At) i = 2;
    if (info.params.len > i + 1) return false;
    if (info.params.len == i + 1) {
        const P = info.params[i].type orelse return false;
        if (!carries(P)) return false;
    }
    return true;
}

pub fn organ(comptime T: type, object: *T) warden.Organ {
    const Wrapper = struct {
        fn invoke(
            context: *anyopaque,
            gpa: std.mem.Allocator,
            field: notation.Field,
            records: []const notation.Block,
            args: []const u8,
            call: warden.Call,
        ) Fault!?[]u8 {
            const self: *T = @ptrCast(@alignCast(context));
            inline for (@typeInfo(T).@"struct".decls) |decl| {
                if (comptime servable(T, decl.name)) {
                    if (std.mem.eql(u8, decl.name, field.name)) {
                        return serve(@field(T, decl.name), self, gpa, field, records, args, call);
                    }
                }
            }
            // Declared by the blueprint and not written on the class: silence,
            // the same silence as everything else.
            return Error.Refused;
        }

        fn serve(
            comptime method: anytype,
            self: *T,
            gpa: std.mem.Allocator,
            field: notation.Field,
            records: []const notation.Block,
            args: []const u8,
            call: warden.Call,
        ) Fault!?[]u8 {
            const info = @typeInfo(@TypeOf(method)).@"fn";
            const wants_at = info.params.len >= 2 and info.params[1].type == *At;

            var at: At = .{
                .door = cellOf(self).door.?,
                .being = cellOf(self).being,
                .gpa = gpa,
                .caller = call.caller,
                .leash = call.leash,
                .arrived = call.arrived,
            };

            var decoded: ?wire.Decoded = null;
            defer if (decoded) |*one| one.deinit();

            const answered = answered: {
                const taken = info.params.len - @as(usize, if (wants_at) 2 else 1);
                if (taken == 0) {
                    if (args.len != 0) return Error.Refused;
                    break :answered if (wants_at) method(self, &at) else method(self);
                }
                if (field.arguments.len == 0) return Error.Refused;
                const P = info.params[info.params.len - 1].type.?;
                decoded = wire.decode(gpa, field.arguments[0].type, records, args) catch
                    return Error.Refused;
                const one = try readValue(P, decoded.?.value);
                break :answered if (wants_at) method(self, &at, one) else method(self, one);
            };

            const value = switch (@typeInfo(@TypeOf(answered))) {
                .error_union => answered catch return Error.Refused,
                else => answered,
            };
            const A = @TypeOf(value);
            if (A == void) return null;
            const answer_type = field.answer orelse return null;

            var arena = std.heap.ArenaAllocator.init(gpa);
            defer arena.deinit();
            const written = try valueOf(A, arena.allocator(), answer_type, value);
            return wire.encode(gpa, answer_type, records, written) catch Error.Refused;
        }

        fn cellsOf(context: *anyopaque, gpa: std.mem.Allocator) Fault![]u8 {
            const self: *T = @ptrCast(@alignCast(context));
            return self.cells(gpa);
        }

        fn takeOf(context: *anyopaque, bytes: []const u8) Fault!void {
            const self: *T = @ptrCast(@alignCast(context));
            return self.take(bytes);
        }
    };

    return .{
        .context = @ptrCast(object),
        .invoke = Wrapper.invoke,
        .cells = if (@hasDecl(T, "cells")) Wrapper.cellsOf else null,
        .take = if (@hasDecl(T, "take")) Wrapper.takeOf else null,
    };
}

/// Every being carries one field of this kit's own: the cell that says which
/// warden holds it and under what name. It is the only thing Quo asks of a
/// class, and it is filled in by the warden rather than by the author.
///
/// **It is named `_quo` because the notation cannot spell that.** Article IV's
/// identifier is a letter then letters and digits, so no blueprint in any
/// language declares a field beginning with an underscore. Zig refuses a
/// struct carrying both a field and a decl of one name, so a cell named `quo`
/// would make a blueprint declaring `quo()` impossible to write a class for —
/// a name the law allows that this kit could not serve.
fn cellOf(object: anytype) *Cell {
    return &object._quo;
}

// ------------------------------------------------------- holding a being

pub const Holding = struct {
    seed: ?Key = null,
    heir_seed: ?Key = null,
    label: ?[]const u8 = null,
    /// Offer the being to every voice, the stranger included, as `expose`
    /// does after the fact.
    public: bool = false,
};

/// Take an object up under a warden. What it gains is its cell filled in and
/// a place in the door's records; what it stays is an ordinary Zig struct.
pub fn holding(
    door: *warden.Warden,
    comptime T: type,
    object: *T,
    blueprint: []const u8,
    h: Holding,
    gpa: std.mem.Allocator,
) Fault!Handle {
    door.take();
    const pk = door.hold(.{
        .blueprint = blueprint,
        .organ = organ(T, object),
        .seed = h.seed,
        .heir_seed = h.heir_seed,
        .label = h.label,
    }) catch |why| {
        door.give();
        return why;
    };
    if (h.public) _ = door.expose(pk) catch {};
    door.give();
    object._quo = .{ .door = door, .being = pk };
    return .{
        .door = door,
        .under = .{ .door = door, .being = pk, .gpa = gpa },
        .reach = .{ .near = pk },
    };
}

/// What accepting an invitation answers: **one handle per being the standing
/// names**, and the relation they all reach down. A caller tells them apart by
/// the being each points at, which is what `of` reads.
pub const Accepted = struct {
    gpa: std.mem.Allocator,
    /// The relation the standing stands in, which is what a re-read reads.
    at: usize,
    handles: []Handle,

    pub fn deinit(self: *Accepted) void {
        self.gpa.free(self.handles);
        self.handles = &.{};
    }

    /// The handle at one named being, or nothing.
    pub fn of(self: Accepted, pk: Key) ?Handle {
        for (self.handles) |one| {
            const points_at = one.being();
            if (std.mem.eql(u8, &points_at, &pk)) return one;
        }
        return null;
    }

    /// The one handle, where the standing names exactly one being. A standing
    /// naming several has no "the" handle and answers nothing here.
    pub fn only(self: Accepted) ?Handle {
        return if (self.handles.len == 1) self.handles[0] else null;
    }
};

/// Accept an invitation into handles: **two rotations, both to keys nobody
/// else has ever seen**, and then the standing is read. Whoever minted the
/// invitation has seen both keys behind it, and only a key this ground
/// generated ends that — which is why forgetting the second rotation is a
/// mistake this cannot make.
pub fn accepting(
    door: *warden.Warden,
    gpa: std.mem.Allocator,
    invitation: wire.Invitation,
    under: At,
) Fault!?Accepted {
    door.take();
    const at = door.remember(invitation) catch {
        door.give();
        return null;
    };
    door.give();

    const budget = under.allowance() orelse return null;

    // The first rotation stands the relation on a voice the granter has never
    // seen; the second stands it on an heir it has never seen either.
    var first = (try rotateAt(door, gpa, at, budget)) orelse {
        _ = forget(door, at);
        return null;
    };
    first.deinit();

    var second = (try rotateAt(door, gpa, at, budget)) orelse {
        _ = forget(door, at);
        return null;
    };
    second.deinit();

    const standing = (try standingAt(door, gpa, at, under)) orelse {
        _ = forget(door, at);
        return null;
    };
    return standing;
}

/// A card into a handle at the far door's public being. **No rotation and no
/// standing**: the voice is one this ground minted for itself, the far door
/// finds it in no record, and what it answers is what it answers a stranger.
/// The public being's class is the one blueprint every warden holds, so there
/// is nothing to fetch before the handle is callable.
pub fn knocking(door: *warden.Warden, card: wire.Card, under: At) Fault!?Handle {
    door.take();
    const at = door.approach(card, door.random()) catch {
        door.give();
        return null;
    };
    door.persist() catch {};
    door.give();
    return .{
        .door = door,
        .under = under,
        .reach = .{ .far = .{
            .at = at,
            .being = card.warden,
            .text = warden.blueprint_text,
        } },
    };
}

/// Read the standing this relation holds, and answer a handle per being it
/// names. **It is read from the far door rather than remembered**: a describe
/// says what the voice may reach now, and each class is fetched by digest so
/// every being that came back is callable.
///
/// The far door's public being is shown to everyone and is named by no
/// standing, so it is not one of these handles; a knock is what reaches it.
pub fn standingAt(
    door: *warden.Warden,
    gpa: std.mem.Allocator,
    at: usize,
    under: At,
) Fault!?Accepted {
    const budget = under.allowance() orelse return null;
    door.take();
    const house = door.houseAt(at);
    door.give();
    const public = house orelse return null;

    var opened = (door.askAt(gpa, at, .{
        .method = .{ .name = "describe", .args = "" },
        .allowance = budget,
    }) catch null) orelse return null;
    defer opened.deinit();
    const data = opened.payload.answer.data orelse return null;
    var read = warden.decodeEstate(gpa, data) catch return null;
    defer read.deinit();

    var handles: std.ArrayList(Handle) = .empty;
    errdefer handles.deinit(gpa);

    for (read.estate.classes) |class| {
        var wanted = false;
        for (class.beings) |held| {
            if (!std.mem.eql(u8, &held.being, &public)) wanted = true;
        }
        if (!wanted) continue;

        const text = (try askBlueprint(door, gpa, at, class.digest, budget)) orelse continue;
        defer gpa.free(text);
        for (class.beings) |held| {
            if (std.mem.eql(u8, &held.being, &public)) continue;
            door.take();
            door.note(at, held.being, held.commitment, text) catch {};
            const kept = door.textAt(at, held.being);
            door.give();
            const held_text = kept orelse continue;
            try handles.append(gpa, .{
                .door = door,
                .under = under,
                .reach = .{ .far = .{
                    .at = at,
                    .being = held.being,
                    .text = held_text,
                } },
            });
        }
    }

    door.take();
    door.persist() catch {};
    door.give();
    return .{ .gpa = gpa, .at = at, .handles = try handles.toOwnedSlice(gpa) };
}

/// Give back the relation `remember` opened, where the acceptance it was kept
/// for went no further. **The dropping is the warden's**; this is the door's
/// turn around it.
fn forget(door: *warden.Warden, at: usize) bool {
    door.take();
    defer door.give();
    return door.drop(at);
}

/// One rotation down a relation, recovered where its answer is lost: the
/// warden holds the whole of it, because the trap it walks around is the
/// judgment's own (Article VIII).
fn rotateAt(
    door: *warden.Warden,
    gpa: std.mem.Allocator,
    at: usize,
    budget: warden.Allowance,
) Fault!?envelope.Opened {
    return door.rotating(gpa, at, budget) catch null;
}

fn askBlueprint(
    door: *warden.Warden,
    gpa: std.mem.Allocator,
    at: usize,
    want: Key,
    budget: warden.Allowance,
) Fault!?[]u8 {
    const blob = try warden.writeDigest(gpa, want);
    defer gpa.free(blob);
    var opened = (door.askAt(gpa, at, .{
        .method = .{ .name = "blueprint", .args = blob },
        .allowance = budget,
    }) catch null) orelse return null;
    defer opened.deinit();
    const data = opened.payload.answer.data orelse return null;
    return warden.readBlueprint(gpa, data);
}
