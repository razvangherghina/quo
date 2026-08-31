//! Distance zero: the carriage that is a call.
//!
//! Article III names three carriages and this is the third — two houses in
//! one device or one process handing envelope bytes as bytes. It is a private
//! carriage like any other, needing no naming because no wire exists to
//! disagree about, so there is no hint to publish, no scheme to parse and no
//! frame to write. There is nothing here but the handing.
//!
//! **What is law is this: distance zero waives no step of the judgment.** The
//! seal and the signature are what make them two houses, and a ground that
//! strips them for being local has rebuilt the ambient permission this law
//! exists to end. So this module judges nothing, unseals nothing and reads
//! nothing — exactly like the other two roads — and the eight steps are spent
//! above it, by the warden, unchanged.
//!
//! It is a road, so it stands beside `carriage.zig` and `line.zig` rather
//! than under the five core modules. It is the one road that reaches no host:
//! no `std.http`, no `std.Io.net`, no `std.posix`, and the suite asserts that
//! rather than trusting it.

const std = @import("std");

/// What a door answers with. `null` is silence, and at distance zero silence
/// needs no wire form to be carried in — there is no wire.
pub const Answer = ?[]const u8;

/// A door at distance zero. The shape is the common carriage's on purpose: a
/// ground hangs one door and the road it is reached over is not the door's
/// affair.
pub const Door = struct {
    context: *anyopaque,
    /// Owns nothing it is handed and returns bytes owned by `gpa`.
    knock: *const fn (context: *anyopaque, gpa: std.mem.Allocator, sealed: []const u8) std.mem.Allocator.Error!Answer,
};

pub const CallError = std.mem.Allocator.Error;

/// Hand one sealed envelope across and take back whatever the far house
/// says. Nothing at all coming back is silence, the same silence the other
/// two roads carry, and it is the same at every one of the eight steps.
///
/// The bytes are copied in and copied out, because two houses in one process
/// are still two houses: neither may hold a pointer into the other's memory,
/// and a road that handed the receiver the caller's own buffer would be one
/// house pretending to be two.
///
/// `cap` bounds what this caller is willing to take back, as on every road.
/// The article names no cap for this one; it is the caller's own affair.
pub fn call(
    gpa: std.mem.Allocator,
    door: Door,
    sealed: []const u8,
    cap: usize,
) CallError!Answer {
    const handed = try gpa.dupe(u8, sealed);
    defer gpa.free(handed);

    const answer = try door.knock(door.context, gpa, handed) orelse return null;
    // No bytes is silence on every road, so no bytes is silence here.
    if (answer.len == 0 or answer.len > cap) {
        gpa.free(answer);
        return null;
    }
    return answer;
}
