"""The notation: a blueprint's canonical text, its digest, and what it refuses.

Article IV of the constitution is the whole specification. A blueprint is one
canonical text; its digest is SHA-256 over that text as UTF-8.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from typing import Optional, Union

__all__ = [
    "NotationError",
    "Type",
    "Base",
    "Many",
    "Maybe",
    "Argument",
    "Field",
    "Block",
    "Blueprint",
    "parse",
    "render",
    "canonical",
    "digest",
]


class NotationError(ValueError):
    """A text the notation refuses."""


CLOSED_TYPES = frozenset(
    {"bool", "int", "text", "bytes", "b32", "being", "invitation", "card"}
)

_IDENTIFIER = re.compile(r"[A-Za-z][A-Za-z0-9]*\Z")
_CLASS_FIELD = re.compile(r"([A-Za-z][A-Za-z0-9]*)\((.*)\)(?: (.+))?\Z")
_RECORD_FIELD = re.compile(r"([A-Za-z][A-Za-z0-9]*) (.+)\Z")

INDENT = "  "


@dataclass(frozen=True)
class Base:
    """A closed type or a record shape, named."""

    name: str

    def __str__(self) -> str:
        return self.name


@dataclass(frozen=True)
class Many:
    """`[T]` — many of a type."""

    of: "Type"

    def __str__(self) -> str:
        return f"[{self.of}]"


@dataclass(frozen=True)
class Maybe:
    """`T?` — possibly absent."""

    of: "Type"

    def __str__(self) -> str:
        return f"{self.of}?"


Type = Union[Base, Many, Maybe]


@dataclass(frozen=True)
class Argument:
    name: str
    type: Type

    def __str__(self) -> str:
        return f"{self.name} {self.type}"


@dataclass(frozen=True)
class Field:
    name: str
    arguments: tuple[Argument, ...]
    answers: Optional[Type]

    def __str__(self) -> str:
        return self.render(parenthesised=True)

    def render(self, parenthesised: bool) -> str:
        if parenthesised:
            args = ", ".join(str(argument) for argument in self.arguments)
            head = f"{self.name}({args})"
        else:
            head = f"{self.name}"
        if not parenthesised:
            return f"{head} {self.answers}"
        if self.answers is None:
            return head
        return f"{head} {self.answers}"


@dataclass(frozen=True)
class Block:
    name: str
    fields: tuple[Field, ...]
    is_class: bool

    def render(self) -> str:
        lines = [self.name]
        for field in self.fields:
            lines.append(INDENT + field.render(parenthesised=self.is_class))
        return "\n".join(lines)


@dataclass(frozen=True)
class Blueprint:
    name: str
    blocks: tuple[Block, ...]

    @property
    def klass(self) -> Block:
        return self.blocks[0]

    @property
    def records(self) -> tuple[Block, ...]:
        return self.blocks[1:]


def _identifier(token: str, what: str) -> str:
    if not _IDENTIFIER.match(token):
        raise NotationError(f"{what} is not an identifier: {token!r}")
    return token


def _parse_type(token: str) -> Type:
    if token.endswith("?"):
        return Maybe(_parse_type(token[:-1]))
    if token.startswith("["):
        if not token.endswith("]"):
            raise NotationError(f"unbalanced type: {token!r}")
        return Many(_parse_type(token[1:-1]))
    return Base(_identifier(token, "a type"))


def _parse_arguments(text: str) -> tuple[Argument, ...]:
    if text == "":
        return ()
    arguments: list[Argument] = []
    seen: set[str] = set()
    for part in text.split(", "):
        matched = _RECORD_FIELD.match(part)
        if matched is None:
            raise NotationError(f"an argument is not `name type`: {part!r}")
        name = _identifier(matched.group(1), "an argument name")
        if name in seen:
            raise NotationError(f"an argument named twice: {name!r}")
        seen.add(name)
        arguments.append(Argument(name, _parse_type(matched.group(2))))
    return tuple(arguments)


def _parse_field(body: str, is_class: bool) -> Field:
    if is_class:
        matched = _CLASS_FIELD.match(body)
        if matched is None:
            raise NotationError(f"a class field must carry parentheses: {body!r}")
        name = _identifier(matched.group(1), "a field name")
        arguments = _parse_arguments(matched.group(2))
        answer = matched.group(3)
        return Field(name, arguments, _parse_type(answer) if answer else None)
    if "(" in body or ")" in body:
        raise NotationError(f"a record field carries no parentheses: {body!r}")
    matched = _RECORD_FIELD.match(body)
    if matched is None:
        raise NotationError(f"a record field is not `name type`: {body!r}")
    name = _identifier(matched.group(1), "a field name")
    return Field(name, (), _parse_type(matched.group(2)))


def _split_blocks(text: str) -> list[list[str]]:
    if text == "":
        raise NotationError("the text is empty")
    if "﻿" in text:
        raise NotationError("a byte order mark")
    if "\r" in text:
        raise NotationError("a carriage return")
    if "\t" in text:
        raise NotationError("a tab")
    if not text.endswith("\n"):
        raise NotationError("no final newline")
    lines = text[:-1].split("\n")
    blocks: list[list[str]] = []
    current: list[str] = []
    for line in lines:
        if line == "":
            if not current:
                raise NotationError("a blank line where no block ended")
            blocks.append(current)
            current = []
            continue
        current.append(line)
    if not current:
        raise NotationError("a trailing blank line")
    blocks.append(current)
    return blocks


def _parse_block(lines: list[str], is_class: bool) -> Block:
    header = lines[0]
    if header.startswith(" "):
        raise NotationError(f"a block header is indented: {header!r}")
    name = _identifier(header, "a block name")
    if len(lines) == 1:
        raise NotationError(f"an empty block: {name!r}")
    fields: list[Field] = []
    seen: set[str] = set()
    for line in lines[1:]:
        if not line.startswith(INDENT):
            raise NotationError(f"a field is not indented by two spaces: {line!r}")
        body = line[len(INDENT) :]
        if body.startswith(" "):
            raise NotationError(f"a field is over-indented: {line!r}")
        if body.endswith(" ") or "  " in body:
            raise NotationError(f"a field is not one space between tokens: {line!r}")
        field = _parse_field(body, is_class)
        if field.name in seen:
            raise NotationError(f"a field named twice in {name!r}: {field.name!r}")
        seen.add(field.name)
        fields.append(field)
    return Block(name, tuple(fields), is_class)


def _walk(type_: Type, out: list[str]) -> None:
    if isinstance(type_, Base):
        out.append(type_.name)
        return
    _walk(type_.of, out)


def _named_by(block: Block) -> list[str]:
    names: list[str] = []
    for field in block.fields:
        for argument in field.arguments:
            _walk(argument.type, names)
        if field.answers is not None:
            _walk(field.answers, names)
    return names


def _derive_order(blueprint: Blueprint) -> list[str]:
    """Record names in order of first use, depth-first through the fields."""
    records = {block.name: block for block in blueprint.records}
    order: list[str] = []
    seen: set[str] = set()

    def visit(block: Block, stack: tuple[str, ...]) -> None:
        for name in _named_by(block):
            if name in CLOSED_TYPES:
                continue
            if name not in records:
                raise NotationError(f"a type no block declares: {name!r}")
            if name in stack:
                raise NotationError(f"a record that reaches itself: {name!r}")
            if name in seen:
                continue
            seen.add(name)
            order.append(name)
            visit(records[name], stack + (name,))

    visit(blueprint.klass, ())
    return order


def parse(text: str) -> Blueprint:
    """Read a canonical blueprint text, or refuse it."""
    blocks_lines = _split_blocks(text)
    blocks = [
        _parse_block(lines, is_class=index == 0)
        for index, lines in enumerate(blocks_lines)
    ]
    klass = blocks[0]
    if klass.name in CLOSED_TYPES:
        raise NotationError(f"a class wearing a closed type's name: {klass.name!r}")
    seen: set[str] = {klass.name}
    for block in blocks[1:]:
        if block.name in CLOSED_TYPES:
            raise NotationError(
                f"a record wearing a closed type's name: {block.name!r}"
            )
        if block.name == klass.name:
            raise NotationError("a record wearing the class's own name")
        if block.name in seen:
            raise NotationError(f"a record block declared twice: {block.name!r}")
        seen.add(block.name)
    blueprint = Blueprint(klass.name, tuple(blocks))

    order = _derive_order(blueprint)
    declared = [block.name for block in blueprint.records]
    for name in declared:
        if name not in order:
            raise NotationError(f"a record nothing uses: {name!r}")
    if declared != order:
        raise NotationError("a record block out of the derived order")

    if render(blueprint) != text:
        raise NotationError("the text is not canonical")
    return blueprint


def render(blueprint: Blueprint) -> str:
    """Write a blueprint back as its canonical text."""
    return "\n\n".join(block.render() for block in blueprint.blocks) + "\n"


def canonical(text: str) -> bytes:
    """The canonical bytes of a blueprint text: UTF-8, and refused if it is not."""
    return render(parse(text)).encode("utf-8")


def digest(text: str) -> bytes:
    """SHA-256 over the canonical text as UTF-8 — the blueprint's identity."""
    return hashlib.sha256(canonical(text)).digest()
