const std = @import("std");

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});

    const notation = b.addModule("notation", .{
        .root_source_file = b.path("src/notation.zig"),
        .target = target,
        .optimize = optimize,
    });

    const arithmetic = b.addModule("arithmetic", .{
        .root_source_file = b.path("src/arithmetic.zig"),
        .target = target,
        .optimize = optimize,
    });

    // The wire is driven by the types a blueprint declares, so it reads the
    // notation's own blocks.
    const wire = b.addModule("wire", .{
        .root_source_file = b.path("src/wire.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "notation", .module = notation },
        },
    });

    // The envelope is the first module that composes the three below it: the
    // shapes are the notation's, the bytes are the wire's, and the seal and
    // the signature are the arithmetic's.
    const envelope = b.addModule("envelope", .{
        .root_source_file = b.path("src/envelope.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "notation", .module = notation },
            .{ .name = "wire", .module = wire },
            .{ .name = "arithmetic", .module = arithmetic },
        },
    });

    // The warden is the door's judgment: the blueprint every warden holds,
    // the two records, the seq and the leash, the three describes and the
    // eight steps. It composes everything below it and adds no road.
    const warden = b.addModule("warden", .{
        .root_source_file = b.path("src/warden.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "notation", .module = notation },
            .{ .name = "wire", .module = wire },
            .{ .name = "arithmetic", .module = arithmetic },
            .{ .name = "envelope", .module = envelope },
        },
    });

    // The two roads, and the only two modules in this kit that reach a host.
    // They stand beside the warden rather than under it: a road carries
    // bytes and judges nothing, and the five modules below never import one.
    const carriage = b.addModule("carriage", .{
        .root_source_file = b.path("src/carriage.zig"),
        .target = target,
        .optimize = optimize,
    });

    // The line knows the common carriage because a caller that walks a peer's
    // hints must be able to take either road. Choosing among them is the
    // caller's whole job, and the two roads disagree about how silence rides,
    // so the walking lives with the one that has to fall through.
    const line = b.addModule("line", .{
        .root_source_file = b.path("src/line.zig"),
        .target = target,
        .optimize = optimize,
        .imports = &.{
            .{ .name = "carriage", .module = carriage },
        },
    });

    // The third carriage: distance zero, where the carriage is a call. It is
    // a road like the other two and stands with them rather than in the core
    // — and it is the one road that reaches no host, because no wire exists
    // to disagree about.
    const zero = b.addModule("zero", .{
        .root_source_file = b.path("src/zero.zig"),
        .target = target,
        .optimize = optimize,
    });

    // The eighth part: a ground another language can knock on, and knock
    // with. It is the host rather than the kit — it composes asks, keeps the
    // caller's own records and runs the accept loops, none of which the
    // modules below will do for it.
    const subject = b.addExecutable(.{
        .name = "subject",
        .root_module = b.createModule(.{
            .root_source_file = b.path("cmd/subject/main.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "notation", .module = notation },
                .{ .name = "arithmetic", .module = arithmetic },
                .{ .name = "wire", .module = wire },
                .{ .name = "envelope", .module = envelope },
                .{ .name = "warden", .module = warden },
                .{ .name = "carriage", .module = carriage },
                .{ .name = "line", .module = line },
                .{ .name = "zero", .module = zero },
            },
        }),
    });
    b.installArtifact(subject);

    // The suite asserts the separation rather than observing it, so it needs
    // to read the kit's own source.
    const sources = b.addOptions();
    sources.addOption([]const u8, "src_dir", b.pathJoin(&.{ b.build_root.path.?, "src" }));
    const sources_module = sources.createModule();

    // The pinned corpus lives outside this kit: the bytes are the law's, not
    // any kit's. Its absolute path reaches the test as a build option.
    const vectors = b.addOptions();
    for ([_][]const u8{ "notation", "arithmetic", "material", "wire", "envelope", "warden" }) |area| {
        vectors.addOption(
            []const u8,
            b.fmt("{s}_path", .{area}),
            b.pathJoin(&.{ b.build_root.path.?, "..", "js", "vectors", b.fmt("{s}.json", .{area}) }),
        );
    }
    const vectors_module = vectors.createModule();

    const tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/notation_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "notation", .module = notation },
                .{ .name = "vectors", .module = vectors_module },
            },
        }),
    });

    const arithmetic_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/arithmetic_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "arithmetic", .module = arithmetic },
                .{ .name = "vectors", .module = vectors_module },
            },
        }),
    });

    const wire_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/wire_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "notation", .module = notation },
                .{ .name = "wire", .module = wire },
                .{ .name = "vectors", .module = vectors_module },
            },
        }),
    });

    const envelope_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/envelope_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "envelope", .module = envelope },
                .{ .name = "vectors", .module = vectors_module },
            },
        }),
    });

    const warden_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/warden_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "arithmetic", .module = arithmetic },
                .{ .name = "envelope", .module = envelope },
                .{ .name = "warden", .module = warden },
                .{ .name = "vectors", .module = vectors_module },
            },
        }),
    });

    const carriage_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/carriage_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "carriage", .module = carriage },
                .{ .name = "sources", .module = sources_module },
            },
        }),
    });

    const line_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/line_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "line", .module = line },
                .{ .name = "carriage", .module = carriage },
                .{ .name = "envelope", .module = envelope },
                .{ .name = "arithmetic", .module = arithmetic },
                .{ .name = "sources", .module = sources_module },
            },
        }),
    });

    // One suite of judgments, driven over all three roads: a step waived on
    // one road and not the others is a red here rather than an absence.
    const judgment_tests = b.addTest(.{
        .root_module = b.createModule(.{
            .root_source_file = b.path("test/judgment_test.zig"),
            .target = target,
            .optimize = optimize,
            .imports = &.{
                .{ .name = "arithmetic", .module = arithmetic },
                .{ .name = "envelope", .module = envelope },
                .{ .name = "warden", .module = warden },
                .{ .name = "carriage", .module = carriage },
                .{ .name = "line", .module = line },
                .{ .name = "zero", .module = zero },
                .{ .name = "sources", .module = sources_module },
            },
        }),
    });

    const test_step = b.step("test", "Run the kit's suite against the pinned corpus");
    for ([_]*std.Build.Step.Compile{ tests, arithmetic_tests, wire_tests, envelope_tests, warden_tests, carriage_tests, line_tests, judgment_tests }) |suite| {
        const run = b.addRunArtifact(suite);
        run.has_side_effects = true;
        test_step.dependOn(&run.step);
    }
}
