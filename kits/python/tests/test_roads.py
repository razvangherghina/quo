"""The kit's shape: a portable core, and the roads standing outside it.

Article III makes the carriage a road rather than a part of the protocol, and
the law's kit clause requires the core to stay portable — the same reason the
JS core opens in a browser tab, which can open no socket. This suite asserts
that separation rather than trusting a reader to keep noticing it.
"""

import ast
import pathlib
import subprocess
import sys
import unittest

SOURCE = pathlib.Path(__file__).resolve().parents[1] / "src" / "quo"

CORE = ("notation", "arithmetic", "wire", "envelope", "warden")
ROADS = ("carriage", "line", "call")

#: The two roads with a wire under them. Distance zero has none, which is the
#: whole of what it is.
WIRED = ("carriage", "line")
HOSTS = ("socket", "http", "asyncio", "ssl", "selectors", "urllib", "asyncore")


def imported(module: str) -> set:
    """Every top-level module name that file imports, however it imports it."""
    tree = ast.parse((SOURCE / f"{module}.py").read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                names.add(alias.name.split(".")[0])
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                continue
            if node.module:
                names.add(node.module.split(".")[0])
    return names


class TheCoreImportsNoHost(unittest.TestCase):
    def test_the_core_imports_nothing_from_socket_http_or_asyncio(self) -> None:
        for module in CORE:
            with self.subTest(module=module):
                self.assertEqual(imported(module) & set(HOSTS), set())

    def test_the_core_imports_no_road(self) -> None:
        for module in CORE:
            with self.subTest(module=module):
                self.assertEqual(imported(module) & set(ROADS), set())

    def test_the_package_itself_imports_no_road(self) -> None:
        """Importing ``quo`` gives the core. A road is asked for by name."""
        self.assertEqual(imported("__init__") & set(ROADS), set())

    def test_importing_the_core_pulls_in_no_socket(self) -> None:
        """Asserted in a fresh interpreter, because the rest of this suite has
        already imported both roads into this one."""
        done = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys, quo\n"
                "print(sorted(m for m in ('socket', 'asyncio', 'http.client',"
                " 'http.server') if m in sys.modules))",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(done.stdout.strip(), "[]")

    def test_iii_asking_for_distance_zero_by_name_still_pulls_in_no_host(self) -> None:
        """The road with no wire under it opens where the core opens, which is
        anywhere — a sandbox that can hold no socket included."""
        done = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys\nfrom quo import call\n"
                "print(sorted(m for m in ('socket', 'asyncio', 'http.client',"
                " 'http.server') if m in sys.modules))",
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        self.assertEqual(done.stdout.strip(), "[]")


class EachRoadImportsItsHostAndOnlyThere(unittest.TestCase):
    def test_iii_the_carriage_is_the_only_module_that_speaks_http(self) -> None:
        speaks = [m for m in CORE + ROADS if "http" in imported(m)]
        self.assertEqual(speaks, ["carriage"])

    def test_iii_the_line_is_the_only_module_that_speaks_tcp(self) -> None:
        speaks = [m for m in CORE + ROADS if "socket" in imported(m)]
        self.assertEqual(speaks, ["line"])

    def test_the_roads_are_the_only_modules_importing_a_host(self) -> None:
        for module in CORE:
            with self.subTest(module=module):
                self.assertFalse(imported(module) & set(HOSTS))
        for module in WIRED:
            with self.subTest(module=module):
                self.assertTrue(imported(module) & set(HOSTS))

    def test_iii_distance_zero_is_a_road_with_no_host_under_it_at_all(self) -> None:
        """Two houses in one process handing bytes as bytes. There is no wire
        to disagree about, so there is nothing to import — and it is a road all
        the same, standing outside the core with the other two."""
        self.assertEqual(imported("call") & set(HOSTS), set())
        self.assertIn("call", ROADS)
        self.assertNotIn("call", CORE)

    def test_iii_a_road_stands_on_the_core_and_never_on_another_road(self) -> None:
        for module in ROADS:
            with self.subTest(module=module):
                self.assertEqual(imported(module) & set(ROADS), set())

    def test_the_kit_takes_no_second_package(self) -> None:
        """``cryptography`` is the whole of it, and no road adds another."""
        outside = set()
        for module in CORE + ROADS + ("__init__",):
            outside |= {
                name for name in imported(module) if name not in sys.stdlib_module_names
            }
        self.assertEqual(outside, {"cryptography"})


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
