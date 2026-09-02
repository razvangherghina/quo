//! The Zig kit answering the conformance subject contract.
//!
//! Kit-specific glue: nine verbs over JSON lines, a warden stood up from handed
//! keys, a door handed bytes, and the records read back as Article IX's
//! `cargo`. Written from `papers/quo-conformance-contract.md` and this kit's own
//! public API, and it decides nothing.
//!
//! Three things this kit spells differently, none of which is a decision this
//! file is allowed to make:
//!
//! - **Its door is three calls where the JS one is a single `judge`**: `judge`
//!   settles the route, `own` answers the warden's own fields, and `answer`
//!   seals. Stitching those is ordinary glue — no step is skipped, none is
//!   invented, and **the field dispatch is the kit's own**.
//! - **A being's answer is never the warden's**, so `.invoke` comes back here.
//!   The being in this contract does one thing or nothing.
//! - **Its `judge` reads no clock.** Both readings are the host's, and the
//!   kit's own `onward` does the arithmetic against them — which is why the
//!   leash below is never computed here.
//!
//! **It composes no cargo and no migration news**, so `depart` and `landed`
//! say what the kit cannot do.
//!
//! **This subject stands below the kit's own seam, and reaches past it on
//! purpose.** It drives the warden's own entry points rather than the host
//! module and the being's API, because it must compose what no application
//! may: bytes a handle could never produce, a say at a being whose blueprint
//! this process does not hold, and a door's records read as they stand. It
//! reads both records directly in three places — `state` reports every inbound
//! and outbound row, `invoke` finds the relation to walk onward down by the far
//! warden's name in the outbound record, and `send` finds the relation to speak
//! down the same way — and no surface above the warden offers any of that. The
//! seam grows nothing to accommodate this file: what it needs, it reaches for
//! here.

const std = @import("std");
const arithmetic = @import("arithmetic");
const envelope = @import("envelope");
const notation = @import("notation");
const warden = @import("warden");
const wire = @import("wire");

const Key = [32]byte;
const byte = u8;

/// A finite list drawn in order. Drawing past the end is a fault the scenario
/// must hear about rather than a silent refill, because a kit that drew more
/// than it was given has told the scenario something.
fn Queue(comptime T: type) type {
    return struct {
        values: std.ArrayList(T) = .empty,
        at: usize = 0,

        fn draw(self: *@This()) !T {
            if (self.at >= self.values.items.len) return error.QueueRanOut;
            defer self.at += 1;
            return self.values.items[self.at];
        }
    };
}

/// What one `onward` spec asks the being to do. It decides nothing: the
/// scenario named the far warden, the being, the method and the key.
const Onward = struct {
    when: []const u8,
    at: Key,
    being: ?Key,
    method: ?envelope.Method,
    ephemeral: Key,
    seq: i64,
};

var gpa: std.mem.Allocator = undefined;

var door: ?warden.Warden = null;
var clock: Queue(i64) = .{};
var random: Queue(Key) = .{};
var onward_specs: std.ArrayList(struct { being: Key, spec: Onward }) = .empty;
/// Every ask this warden composed while judging the message in hand.
var handed: std.ArrayList([]u8) = .empty;
/// The roads this door answers on. This kit takes them per call rather than
/// keeping them, so the subject keeps what `stand` was given.
var roads: []const []const u8 = &.{};

fn house() !*warden.Warden {
    if (door) |*one| return one;
    return error.NoWardenStoodUp;
}

/// The clock and the randomness this contract hands the door: finite lists,
/// drawn in the order the scenario fixed. The warden takes each as an
/// argument at `open` and reaches for neither.
///
/// **Drawing past the end is a fault the scenario must hear about**, and the
/// warden's own signature has nowhere to put one — so a queue that ran out
/// answers the one value that cannot be mistaken for a reading, and the
/// scenario sees it as a refusal rather than as a plausible number.
fn ticked() i64 {
    return clock.draw() catch std.math.minInt(i64);
}

fn drawn() Key {
    return random.draw() catch std.mem.zeroes(Key);
}

fn un(text: []const u8) ![32]u8 {
    if (text.len != 64) return error.NotAKey;
    var out: [32]u8 = undefined;
    _ = try std.fmt.hexToBytes(&out, text);
    return out;
}

fn unSlice(a: std.mem.Allocator, text: []const u8) ![]u8 {
    const out = try a.alloc(u8, text.len / 2);
    _ = try std.fmt.hexToBytes(out, text);
    return out;
}

fn hx(a: std.mem.Allocator, raw: []const u8) ![]u8 {
    const out = try a.alloc(u8, raw.len * 2);
    _ = std.fmt.bufPrint(out, "{x}", .{raw}) catch unreachable;
    return out;
}

fn signingPublic(seed: Key) Key {
    const pair = arithmetic.signingPair(seed) catch return @splat(0);
    return pair.public;
}

fn sealingPublic(secret: Key) Key {
    const pair = arithmetic.sealingPair(secret) catch return @splat(0);
    return pair.public;
}

// ---- reading the order -------------------------------------------------

fn get(v: std.json.Value, name: []const u8) ?std.json.Value {
    if (v != .object) return null;
    const found = v.object.get(name) orelse return null;
    if (found == .null) return null;
    return found;
}

fn str(v: std.json.Value, name: []const u8) ?[]const u8 {
    const found = get(v, name) orelse return null;
    return if (found == .string) found.string else null;
}

fn keyOf(v: std.json.Value, name: []const u8) !Key {
    return un(str(v, name) orelse return error.MissingKey);
}

fn maybeKey(v: std.json.Value, name: []const u8) !?Key {
    const text = str(v, name) orelse return null;
    return try un(text);
}

fn items(v: std.json.Value, name: []const u8) []std.json.Value {
    const found = get(v, name) orelse return &.{};
    return if (found == .array) found.array.items else &.{};
}

fn number(v: std.json.Value, name: []const u8, fallback: i64) i64 {
    const found = get(v, name) orelse return fallback;
    return switch (found) {
        .string => |s| std.fmt.parseInt(i64, s, 10) catch fallback,
        .integer => |i| i,
        else => fallback,
    };
}

fn hints(a: std.mem.Allocator, v: std.json.Value, name: []const u8) ![]const []const u8 {
    const list = items(v, name);
    const out = try a.alloc([]const u8, list.len);
    for (list, 0..) |one, at| out[at] = try a.dupe(u8, one.string);
    return out;
}

fn methodOf(a: std.mem.Allocator, v: std.json.Value, name: []const u8) !?envelope.Method {
    const found = get(v, name) orelse return null;
    return .{
        .name = try a.dupe(u8, str(found, "name") orelse return error.MissingKey),
        .args = try unSlice(a, str(found, "args") orelse ""),
    };
}

// ---- writing the reply -------------------------------------------------

const Out = struct {
    buf: std.ArrayList(u8) = .empty,
    a: std.mem.Allocator,

    fn text(self: *Out, s: []const u8) !void {
        try self.buf.appendSlice(self.a, s);
    }

    fn quoted(self: *Out, s: []const u8) !void {
        try self.buf.append(self.a, '"');
        try self.buf.appendSlice(self.a, s);
        try self.buf.append(self.a, '"');
    }

    fn hexed(self: *Out, raw: []const u8) !void {
        try self.quoted(try hx(self.a, raw));
    }

    fn int(self: *Out, value: i64) !void {
        var buf: [24]u8 = undefined;
        try self.quoted(try std.fmt.bufPrint(&buf, "{d}", .{value}));
    }

    fn strings(self: *Out, list: []const []const u8) !void {
        try self.text("[");
        for (list, 0..) |one, at| {
            if (at > 0) try self.text(",");
            try self.quoted(one);
        }
        try self.text("]");
    }
};

// ---- the verbs ---------------------------------------------------------

fn stand(a: std.mem.Allocator, order: std.json.Value, out: *Out) !void {
    if (door) |*old| {
        old.deinit();
        door = null;
    }
    for (pointers.items) |one| gpa.destroy(one);
    pointers = .empty;
    onward_specs = .empty;
    handed = .empty;

    const spec = get(order, "warden") orelse return error.MissingKey;
    const name_secret = try keyOf(spec, "nameSeed");
    const padlock_secret = try keyOf(spec, "padlockSeed");
    const limit = number(spec, "limit", 0);
    roads = try hints(gpa, spec, "hints");

    door = warden.Warden{
        .gpa = gpa,
        .name = signingPublic(name_secret),
        .name_secret = name_secret,
        .padlock = sealingPublic(padlock_secret),
        .padlock_secret = padlock_secret,
        .limit = if (limit > 0) @intCast(limit) else std.math.maxInt(usize),
        .width = 64,
        // Handed in, never reached for. This subject stands a warden from the
        // seeds the scenario names rather than opening one on them, because
        // the contract hands it the two keys already derived.
        .clock = ticked,
        .random = drawn,
    };
    const w = try house();

    // This kit is one of the two that never sees its own heir's key: it takes
    // the commitment where one is given, and derives it from the seed where
    // that is what the scenario handed in.
    const own_commitment = (try maybeKey(spec, "heirCommitment")) orelse blk: {
        const heir = try keyOf(spec, "heirSeed");
        break :blk arithmetic.commitment(w.name, signingPublic(heir));
    };
    // The public being's pk is the warden's own name, and it wears the one
    // blueprint every warden holds.
    try w.beings.append(gpa, .{
        .pk = w.name,
        .secret = name_secret,
        .digest = warden.digest(),
        .commitment = own_commitment,
        .text = warden.blueprint_text,
    });

    try out.text("{\"warden\":{\"name\":");
    try out.hexed(&w.name);
    try out.text(",\"padlock\":");
    try out.hexed(&w.padlock);
    try out.text("},\"beings\":[");

    for (items(order, "beings"), 0..) |one, at| {
        const secret = try keyOf(one, "seed");
        const heir = try keyOf(one, "heirSeed");
        const pk = signingPublic(secret);
        const text = try gpa.dupe(u8, str(one, "blueprint") orelse "");
        const pointer = try gpa.create(Held);
        pointer.* = .{ .being = pk };
        try pointers.append(gpa, pointer);
        _ = try w.hold(.{
            .blueprint = text,
            .organ = pointer.organ(),
            .seed = secret,
            .heir_seed = heir,
        });
        if (get(one, "onward")) |spec_on| {
            try onward_specs.append(gpa, .{ .being = pk, .spec = .{
                .when = try gpa.dupe(u8, str(spec_on, "when") orelse ""),
                .at = try keyOf(spec_on, "at"),
                .being = try maybeKey(spec_on, "being"),
                .method = try methodOf(gpa, spec_on, "method"),
                .ephemeral = try keyOf(spec_on, "ephemeral"),
                .seq = number(spec_on, "seq", 1),
            } });
        }
        if (at > 0) try out.text(",");
        try out.hexed(&pk);
    }
    try out.text("],\"grants\":[");

    // `grants` writes inbound rows. Writing the opening state is setup and no
    // obligation turns on how a row got there — unlike an amend, which is an
    // act the warden performs and which this kit has its own operation for.
    for (items(order, "grants"), 0..) |one, at| {
        const heir = signingPublic(try keyOf(one, "heirSeed"));
        const commitment = arithmetic.commitment(w.name, heir);
        var beings: std.ArrayList(Key) = .empty;
        try beings.append(gpa, try keyOf(one, "being"));
        try w.inbound.append(gpa, .{
            .voice = signingPublic(try keyOf(one, "voiceSeed")),
            .commitment = commitment,
            .minted_name = w.name,
            .beings = beings,
            .window = .{ .width = w.width },
            .padlock = try maybeKey(one, "padlock"),
            .hints = try hints(gpa, one, "hints"),
        });
        if (at > 0) try out.text(",");
        try out.text("{\"warden\":");
        try out.hexed(&w.name);
        try out.text(",\"commitment\":");
        try out.hexed(&commitment);
        try out.text(",\"padlock\":");
        try out.hexed(&w.padlock);
        try out.text(",\"heir\":");
        try out.hexed(&heir);
        try out.text("}");
    }
    try out.text("]}");

    for (items(order, "relations")) |one| {
        const voice_secret = try keyOf(one, "voiceSeed");
        const heir_secret = try keyOf(one, "heirSeed");
        try w.outbound.append(gpa, .{
            .warden = try keyOf(one, "warden"),
            .commitment = try keyOf(one, "commitment"),
            .padlock = try keyOf(one, "padlock"),
            .voice = signingPublic(voice_secret),
            .secret = voice_secret,
            .heir = signingPublic(heir_secret),
            .heir_secret = heir_secret,
            .news = .{ .width = w.width },
            .hints = try hints(gpa, one, "hints"),
        });
    }

    // The being this door is about to take in. Its keys are handed in, which
    // this kit takes through `arm` rather than off a queue — so the two
    // Article II freedoms never cross here.
    if (get(order, "expecting")) |arriving| {
        const text = try gpa.dupe(u8, str(arriving, "blueprint") orelse "");
        var armed = try notation.parse(gpa, text);
        defer armed.deinit();
        _ = try w.arm(.{
            .digest = armed.digest(),
            .text = text,
            .secret = try keyOf(arriving, "seed"),
            .heir_secret = try keyOf(arriving, "heirSeed"),
        });
    }

    for (items(order, "moved")) |one| {
        const word = get(one, "word") orelse return error.MissingKey;
        try w.publish(try keyOf(one, "being"), .{
            .being = try maybeKey(word, "being"),
            .successor = try maybeKey(word, "successor"),
            .commitment = try maybeKey(word, "commitment"),
            .name = try maybeKey(word, "name"),
            .padlock = try maybeKey(word, "padlock"),
            .hints = try hints(gpa, word, "hints"),
        });
    }

    clock = .{};
    for (items(order, "clock")) |one| {
        try clock.values.append(gpa, try std.fmt.parseInt(i64, one.string, 10));
    }
    random = .{};
    for (items(order, "random")) |one| {
        try random.values.append(gpa, try un(one.string));
    }
    _ = a;
}

/// The one thing a being in this contract ever does.
///
/// **The leash spent is the one this kit computed**, through the kit's own
/// `onward`, against the arrival reading and a second reading off the clock
/// queue. Recomputing it here would be the subject doing the arithmetic the
/// case is about, and the case would then measure this file rather than the
/// warden.
fn invoke(a: std.mem.Allocator, being: Key, method: []const u8, arrived: warden.Leash, arrival: i64) !void {
    const w = try house();
    for (onward_specs.items) |one| {
        if (!std.mem.eql(u8, &one.being, &being)) continue;
        if (!std.mem.eql(u8, one.spec.when, method)) continue;
        var at: ?usize = null;
        for (w.outbound.items, 0..) |row, index| {
            if (std.mem.eql(u8, &row.warden, &one.spec.at)) at = index;
        }
        const index = at orelse return error.NoSuchRelation;
        const handed_onward = try clock.draw();
        // A leash with nothing left to spend composes nothing, and the being
        // answers anyway: Article VIII withholds the onward ask while "the
        // work already routed stands".
        const leash = warden.onward(arrived, handed_onward - arrival) orelse return;
        const composed = w.ask(a, index, one.spec.ephemeral, .{
            .being = one.spec.being,
            .method = one.spec.method,
            .seq = one.spec.seq,
            .allowance = .{ .time = leash.time, .hops = leash.hops },
            .hints = roads,
        }) catch return;
        try handed.append(gpa, try gpa.dupe(u8, composed[0]));
    }
}

/// The being this contract has, as the warden holds it: an ordinary pointer
/// the door invokes. What it does is what the scenario said — an onward ask,
/// or nothing at all — and it never sees a byte of the seal or a key.
///
/// Which being is being invoked is the pointer's own, so the pk is what the
/// context carries.
const Held = struct {
    being: Key,

    fn organ(self: *Held) warden.Organ {
        return .{ .context = @ptrCast(self), .invoke = served };
    }

    fn served(
        context: *anyopaque,
        a: std.mem.Allocator,
        field: notation.Field,
        records: []const notation.Block,
        args: []const u8,
        call: warden.Call,
    ) (warden.Error || std.mem.Allocator.Error)!?[]u8 {
        _ = records;
        _ = args;
        const self: *Held = @ptrCast(@alignCast(context));
        invoke(a, self.being, field.name, call.leash, call.arrived) catch {};
        // The one thing a being in this contract ever answers is nothing at
        // all, written as no bytes rather than as an absent optional.
        return try a.dupe(u8, "");
    }
};

/// One pointer per being the scenario stood, kept for as long as the door is.
var pointers: std.ArrayList(*Held) = .empty;

/// The door: bytes in, bytes out, or nothing — and nothing is silence.
///
/// **One entry point takes whatever arrives.** The record byte inside the
/// seal says which of the two records it is and only the door reads it, so
/// nothing above this line sorts anything or looks inside a seal.
fn doorVerb(a: std.mem.Allocator, order: std.json.Value, out: *Out) !void {
    const w = try house();
    for (handed.items) |one| gpa.free(one);
    handed.clearRetainingCapacity();

    const letter = try unSlice(a, str(order, "bytes") orelse "");
    const sealed = w.arrive(a, letter, null) orelse return silence(out);
    try out.text("{\"answer\":");
    try out.hexed(sealed);
    try out.text(",\"onward\":[");
    for (handed.items, 0..) |one, at| {
        if (at > 0) try out.text(",");
        try out.hexed(one);
    }
    try out.text("]}");
}

fn silence(out: *Out) !void {
    try out.text("{\"answer\":null,\"onward\":[");
    for (handed.items, 0..) |one, at| {
        if (at > 0) try out.text(",");
        try out.hexed(one);
    }
    try out.text("]}");
}

fn amend(order: std.json.Value, out: *Out) !void {
    const w = try house();
    const voice = try keyOf(order, "voice");
    for (items(order, "add")) |one| try w.widen(voice, try un(one.string));
    for (items(order, "remove")) |one| try w.narrow(voice, try un(one.string));
    try out.text("{}");
}

fn succeed(order: std.json.Value, out: *Out) !void {
    const w = try house();
    try w.succeed(try keyOf(order, "nameSeed"), try keyOf(order, "heirCommitment"));
    try out.text("{}");
}

/// One piece of news per peer, each sealed with the key it was handed and
/// spending the number it was given. A peer that left no way back composes
/// nothing, which the kit decides and this only passes on.
///
/// **The word is the kit's.** `depart` and `landed` compose it; this file says
/// only which being left and where it went. A subject that built the word and
/// asked the kit to seal it would assert nothing about the warden.
fn told(a: std.mem.Allocator, word: warden.Word, secret: Key, peers: []warden.Peer, order: std.json.Value, out: *Out) !void {
    const w = try house();
    const spec = items(order, "news");
    try out.text("{\"news\":[");
    var wrote: usize = 0;
    for (peers, 0..) |peer, at| {
        if (at >= spec.len) break;
        const one = spec[at];
        const allowance = get(one, "allowance") orelse return error.MissingKey;
        const sealed = w.news(a, try keyOf(one, "ephemeral"), .{
            .peer = peer,
            .voice_secret = secret,
            .word = word,
            .seq = number(one, "seq", 1),
            .allowance = .{
                .time = number(allowance, "time", 0),
                .hops = number(allowance, "hops", 0),
            },
            .hints = roads,
        }) catch continue;
        if (wrote > 0) try out.text(",");
        wrote += 1;
        try out.hexed(sealed);
    }
    try out.text("]}");
}

fn depart(a: std.mem.Allocator, order: std.json.Value, out: *Out) !void {
    const w = try house();
    const gone = get(order, "gone") orelse return error.MissingKey;
    const heir = try keyOf(order, "heirSeed");
    const left = try w.depart(a, try keyOf(order, "being"), .{
        .heir = signingPublic(heir),
        .commitment = try keyOf(order, "commitment"),
        .name = try keyOf(gone, "name"),
        .padlock = try keyOf(gone, "padlock"),
        .hints = try hints(a, gone, "hints"),
    });
    // The first news is signed by the being's committed heir, and the origin
    // no longer holds the being: after the double rotation every key the old
    // warden held for it is dead, so the seed is the one handed in.
    try told(a, left.word, heir, left.peers, order, out);
}

fn landed(a: std.mem.Allocator, order: std.json.Value, out: *Out) !void {
    const w = try house();
    const here = try w.landed(a, try hints(a, order, "hints"));
    try told(a, here.word, here.secret, here.peers, order, out);
}

fn state(a: std.mem.Allocator, order: std.json.Value, out: *Out) !void {
    const w = try house();
    const being = try keyOf(order, "being");
    const held = w.being(being) orelse {
        try out.text("{\"cargo\":null,\"cannot\":[]}");
        return;
    };
    try out.text("{\"cargo\":{\"being\":");
    try out.hexed(&held.pk);
    try out.text(",\"digest\":");
    try out.hexed(&held.digest);
    try out.text(",\"cells\":\"\",\"standings\":[");

    // The rows that stand at this being, by the voice's bytes ascending. That
    // order is the contract's own so that two readings of one state are one
    // text — the law derives an estate's order and says nothing about a
    // cargo's — and a subject that reported its records in whatever order it
    // holds them would make a scenario read as a divergence.
    var standing: std.ArrayList(usize) = .empty;
    for (w.inbound.items, 0..) |row, at| {
        for (row.beings.items) |one| {
            if (std.mem.eql(u8, &one, &being)) {
                try standing.append(a, at);
                break;
            }
        }
    }
    std.mem.sort(usize, standing.items, w, struct {
        fn less(rows: @TypeOf(w), l: usize, r: usize) bool {
            return std.mem.lessThan(u8, &rows.inbound.items[l].voice, &rows.inbound.items[r].voice);
        }
    }.less);

    var wrote: usize = 0;
    for (standing.items) |index| {
        const row = w.inbound.items[index];
        if (wrote > 0) try out.text(",");
        wrote += 1;
        try out.text("{\"voice\":");
        try out.hexed(&row.voice);
        try out.text(",\"commitment\":");
        try out.hexed(&row.commitment);
        // The name the commitment was minted under (Article XIV). This kit
        // calls it `minted_name`.
        try out.text(",\"name\":");
        try out.hexed(&row.minted_name);
        try out.text(",\"beings\":[");
        var names = try a.alloc([]u8, row.beings.items.len);
        for (row.beings.items, 0..) |one, at| names[at] = try hx(a, &one);
        std.mem.sort([]u8, names, {}, struct {
            fn less(_: void, l: []u8, r: []u8) bool {
                return std.mem.lessThan(u8, l, r);
            }
        }.less);
        for (names, 0..) |one, at| {
            if (at > 0) try out.text(",");
            try out.quoted(one);
        }
        try out.text("],\"mark\":");
        try out.int(row.window.mark);
        try out.text(",\"spent\":[");
        const spent = try a.dupe(i64, row.window.spent.items);
        std.mem.sort(i64, spent, {}, std.sort.asc(i64));
        for (spent, 0..) |one, at| {
            if (at > 0) try out.text(",");
            try out.int(one);
        }
        try out.text("],\"padlock\":");
        if (row.padlock) |one| try out.hexed(&one) else try out.text("null");
        try out.text(",\"hints\":");
        try out.strings(row.hints);
        try out.text("}");
    }
    try out.text("],\"relations\":[");
    for (w.outbound.items, 0..) |row, at| {
        if (at > 0) try out.text(",");
        try out.text("{\"warden\":");
        try out.hexed(&row.warden);
        try out.text(",\"commitment\":");
        try out.hexed(&row.commitment);
        try out.text(",\"padlock\":");
        try out.hexed(&row.padlock);
        try out.text(",\"voice\":");
        try out.hexed(&row.voice);
        try out.text(",\"heir\":");
        try out.hexed(&row.heir);
        try out.text(",\"seq\":");
        try out.int(row.seq);
        // Two counters, never one field doing both (Article IX).
        try out.text(",\"news\":");
        try out.int(row.news.mark);
        try out.text(",\"hints\":");
        try out.strings(row.hints);
        try out.text("}");
    }
    try out.text("]},\"cannot\":[]}");
}

fn send(a: std.mem.Allocator, order: std.json.Value, out: *Out) !void {
    const w = try house();
    const ask = get(order, "ask") orelse return error.MissingKey;
    const far = try keyOf(ask, "at");
    var at: ?usize = null;
    for (w.outbound.items, 0..) |row, index| {
        if (std.mem.eql(u8, &row.warden, &far)) at = index;
    }
    const index = at orelse {
        try out.text("{\"error\":\"no relation at that warden\"}");
        return;
    };
    const allowance = get(ask, "allowance") orelse return error.MissingKey;
    const ephemeral = try random.draw();
    // A refusal to send is an ordinary expected outcome, not an error.
    const composed = w.ask(a, index, ephemeral, .{
        .being = try maybeKey(ask, "being"),
        .method = try methodOf(a, ask, "method"),
        .next = try maybeKey(ask, "commitment"),
        .seq = number(ask, "seq", 1),
        .allowance = .{
            .time = number(allowance, "time", 0),
            .hops = number(allowance, "hops", 0),
        },
        .hints = roads,
    }) catch {
        try out.text("{\"bytes\":null}");
        return;
    };
    try out.text("{\"bytes\":");
    try out.hexed(composed[0]);
    try out.text("}");
}

fn read(a: std.mem.Allocator, order: std.json.Value, out: *Out) !void {
    const w = try house();
    const bytes = try unSlice(a, str(order, "answer") orelse "");
    var opened = w.hear(a, bytes) catch {
        try out.text("{\"answer\":null}");
        return;
    };
    defer opened.deinit();
    const answered = opened.payload.answer;
    try out.text("{\"answer\":{\"warden\":");
    try out.hexed(&answered.warden);
    try out.text(",\"seq\":");
    try out.int(answered.seq);
    try out.text(",\"data\":");
    if (answered.data) |one| try out.hexed(one) else try out.text("null");
    try out.text("}}");
}

fn obey(a: std.mem.Allocator, line: []const u8, out: *Out) !void {
    var parsed = try std.json.parseFromSlice(std.json.Value, a, line, .{});
    defer parsed.deinit();
    const order = parsed.value;
    const verb = str(order, "do") orelse return error.MissingKey;

    if (std.mem.eql(u8, verb, "stand")) return stand(a, order, out);
    if (std.mem.eql(u8, verb, "door")) return doorVerb(a, order, out);
    if (std.mem.eql(u8, verb, "amend")) return amend(order, out);
    if (std.mem.eql(u8, verb, "succeed")) return succeed(order, out);
    if (std.mem.eql(u8, verb, "state")) return state(a, order, out);
    if (std.mem.eql(u8, verb, "send")) return send(a, order, out);
    if (std.mem.eql(u8, verb, "read")) return read(a, order, out);
    if (std.mem.eql(u8, verb, "depart")) return depart(a, order, out);
    if (std.mem.eql(u8, verb, "landed")) return landed(a, order, out);
    return error.NoSuchVerb;
}

pub fn main(init: std.process.Init) !void {
    gpa = init.gpa;
    var stdin_buf: [1 << 16]u8 = undefined;
    var stdout_buf: [1 << 16]u8 = undefined;
    var reader = std.Io.File.stdin().readerStreaming(init.io, &stdin_buf);
    var writer = std.Io.File.stdout().writerStreaming(init.io, &stdout_buf);

    // **`takeDelimiter`, not `takeDelimiterExclusive`.** The exclusive one
    // tosses the line and leaves the newline in the buffer, so the next call
    // finds the delimiter immediately and hands back a zero-length slice —
    // forever. A `continue` on that spins the process at full tilt and a
    // `break` on it answers exactly one order. This one advances past the
    // delimiter and returns null at end of stream, which is the shape a
    // line-oriented protocol wants.
    while (try reader.interface.takeDelimiter('\n')) |line| {
        if (line.len == 0) continue;
        var arena = std.heap.ArenaAllocator.init(gpa);
        defer arena.deinit();
        const a = arena.allocator();
        var out = Out{ .a = a };
        if (obey(a, line, &out)) |_| {
            try writer.interface.writeAll(out.buf.items);
        } else |err| {
            try writer.interface.print("{{\"error\":\"{s}\"}}", .{@errorName(err)});
        }
        try writer.interface.writeByte('\n');
        try writer.interface.flush();
    }
}
