const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{ .preferred_optimize_mode = .ReleaseSafe });

    const quo = b.addModule("quo", .{
        .root_source_file = b.path("src/quo.zig"),
        .target = target,
        .optimize = optimize,
        .link_libc = true,
    });

    const exe = b.addExecutable(.{
        .name = "stand",
        .root_module = b.createModule(.{
            .root_source_file = b.path("src/main.zig"),
            .target = target,
            .optimize = optimize,
            .link_libc = true,
            .imports = &.{.{ .name = "quo", .module = quo }},
        }),
    });
    b.installArtifact(exe);

    const test_step = b.step("test", "Run tests");
    const quo_tests = b.addTest(.{ .root_module = quo });
    test_step.dependOn(&b.addRunArtifact(quo_tests).step);
    const exe_tests = b.addTest(.{ .root_module = exe.root_module });
    test_step.dependOn(&b.addRunArtifact(exe_tests).step);
}
