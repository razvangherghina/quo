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

CORE = ("notation", "arithmetic", "wire", "envelope", "being", "delivery", "warden")
ROADS = ("carriage", "line", "call")

#: The host adapter: the one module that knows every road by name and stands
#: them in front of a warden. It is not the core and it is not a road.
ADAPTERS = ("host",)

#: The two roads with a wire under them. Distance zero has none, which is the
#: whole of what it is.
WIRED = ("carriage", "line")
HOSTS = ("socket", "http", "ssl", "selectors", "urllib", "asyncore")

#: The one host-shaped name the core may reach for. Every Quo call is
#: asynchronous, so the core is asynchronous, and ``asyncio`` is what Python
#: has for that — it is a language facility rather than a road: importing it
#: binds nothing, listens nowhere and carries nothing. What the core must
#: never reach is a road's host, which is what :data:`HOSTS` names.
ASYNC = "asyncio"


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


def within(module: str) -> set:
    """Every sibling of this kit that file reaches, however it reaches it.

    A module inside one package reaches its siblings relatively, so this is
    what "imports a road" actually looks like in the source.
    """
    tree = ast.parse((SOURCE / f"{module}.py").read_text(encoding="utf-8"))
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.level:
            if node.module:
                names.add(node.module.split(".")[0])
            else:
                names |= {alias.name for alias in node.names}
    return names


class TheCoreImportsNoHost(unittest.TestCase):
    def test_the_core_imports_nothing_from_socket_http_or_asyncio(self) -> None:
        for module in CORE:
            with self.subTest(module=module):
                self.assertEqual(imported(module) & set(HOSTS), set())

    def test_asyncio_is_the_one_host_shaped_name_the_core_reaches_for(self) -> None:
        """A Quo call is asynchronous everywhere, so the core is. That is a
        language facility and not a road: it binds nothing and carries nothing,
        and no core module may reach past it to a road's own host."""
        reaching = {module for module in CORE if ASYNC in imported(module)}
        self.assertEqual(reaching, {"warden"})

    def test_the_core_imports_no_road_and_no_host_adapter(self) -> None:
        for module in CORE:
            with self.subTest(module=module):
                reaches = imported(module) | within(module)
                self.assertEqual(reaches & set(ROADS + ADAPTERS), set())

    def test_the_package_itself_imports_no_road(self) -> None:
        """Importing ``quo`` gives the core. A road is asked for by name."""
        self.assertEqual(imported("__init__") & set(ROADS + ADAPTERS), set())

    def test_importing_the_core_pulls_in_no_road(self) -> None:
        """Asserted in a fresh interpreter, because the rest of this suite has
        already imported every road into this one.

        The list is what the rule forbids: every road module, the host adapter,
        and the wired roads' own hosts. ``socket`` is not on it because
        ``asyncio`` brings it in on its own, so its presence would prove
        nothing about the core.
        """
        done = subprocess.run(
            [
                sys.executable,
                "-c",
                "import sys, quo\n"
                "print(sorted(m for m in ('http.client', 'http.server',"
                " 'quo.call', 'quo.carriage', 'quo.line', 'quo.host')"
                " if m in sys.modules))",
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
                "print(sorted(m for m in ('http.client', 'http.server',"
                " 'quo.carriage', 'quo.line', 'quo.host') if m in sys.modules))",
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
                reaches = imported(module) | within(module)
                self.assertEqual(reaches & set(ROADS + ADAPTERS), set())

    def test_the_host_adapter_is_the_only_module_that_names_every_road(self) -> None:
        """A road never reaches another road. Standing them all in front of one
        warden is the host's work, and it is one file."""
        naming = [
            module
            for module in CORE + ROADS + ADAPTERS
            if len((imported(module) | within(module)) & set(ROADS)) > 1
        ]
        self.assertEqual(naming, ["host"])

    def test_the_kit_takes_no_second_package(self) -> None:
        """``cryptography`` is the whole of it, and no road adds another."""
        outside = set()
        for module in CORE + ROADS + ADAPTERS + ("__init__",):
            outside |= {
                name for name in imported(module) if name not in sys.stdlib_module_names
            }
        self.assertEqual(outside, {"cryptography"})


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
