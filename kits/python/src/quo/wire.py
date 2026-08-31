"""The wire: the byte encoding of the closed types.

Article V of the constitution is the whole specification. Each type has
exactly one way of being written, every length and count rides as an ``int``
and is non-negative by rule, no type encodes to zero bytes, and anything the
law does not spell is refused in silence.

The types are the notation's: a :class:`~quo.notation.Type` says what to
write, and a record name is resolved against the blueprint's record blocks.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Optional, Sequence

from .notation import Base, Block, Blueprint, Many, Maybe, Type

__all__ = [
    "WireError",
    "INT_LENGTH",
    "B32_LENGTH",
    "INT_MIN",
    "INT_MAX",
    "ABSENT",
    "PRESENT",
    "Invitation",
    "Card",
    "records_of",
    "encode",
    "decode",
]


class WireError(ValueError):
    """Bytes the wire refuses, or a value it cannot write."""


INT_LENGTH = 8
B32_LENGTH = 32
INT_MIN = -(2**63)
INT_MAX = 2**63 - 1

ABSENT = 0
PRESENT = 1

_FALSE = 0
_TRUE = 1


@dataclass(frozen=True)
class Invitation:
    """The five things a holder holds, as one typed value."""

    warden: bytes
    commitment: bytes
    padlock: bytes
    heir: bytes
    heir_secret: bytes
    hints: tuple[str, ...]


@dataclass(frozen=True)
class Card:
    """The four things a stranger holds: the invitation without the voice."""

    warden: bytes
    commitment: bytes
    padlock: bytes
    hints: tuple[str, ...]


def records_of(blueprint: Blueprint) -> dict[str, Block]:
    """The blueprint's record blocks, by name, ready to resolve a record type."""
    return {block.name: block for block in blueprint.records}


class _Reader:
    def __init__(self, data: bytes) -> None:
        self._data = data
        self._at = 0

    def take(self, count: int) -> bytes:
        if count < 0 or count > len(self._data) - self._at:
            raise WireError("bytes short of the value")
        chunk = self._data[self._at : self._at + count]
        self._at += count
        return chunk

    def integer(self) -> int:
        return int.from_bytes(self.take(INT_LENGTH), "big", signed=True)

    def size(self) -> int:
        value = self.integer()
        if value < 0:
            raise WireError("a length or count that is negative")
        return value

    def done(self) -> None:
        if self._at != len(self._data):
            raise WireError("bytes left over after the value")


def _write_int(value: int) -> bytes:
    if type(value) is not int:
        raise WireError(f"not an int: {value!r}")
    if value < INT_MIN or value > INT_MAX:
        raise WireError(f"an int outside its range: {value}")
    return value.to_bytes(INT_LENGTH, "big", signed=True)


def _write_size(value: int) -> bytes:
    if value < 0:
        raise WireError(f"a length or count that is negative: {value}")
    return _write_int(value)


def _write_text(value: Any) -> bytes:
    if not isinstance(value, str):
        raise WireError(f"not a text: {value!r}")
    try:
        body = value.encode("utf-8")
    except UnicodeEncodeError as bad:
        raise WireError("a text that is not UTF-8") from bad
    return _write_size(len(body)) + body


def _read_text(reader: _Reader) -> str:
    body = reader.take(reader.size())
    try:
        return body.decode("utf-8")
    except UnicodeDecodeError as bad:
        raise WireError("a text that is not UTF-8") from bad


def _write_bytes(value: Any) -> bytes:
    if not isinstance(value, (bytes, bytearray)):
        raise WireError(f"not bytes: {value!r}")
    body = bytes(value)
    return _write_size(len(body)) + body


def _write_b32(value: Any) -> bytes:
    if not isinstance(value, (bytes, bytearray)):
        raise WireError(f"not bytes: {value!r}")
    body = bytes(value)
    if len(body) != B32_LENGTH:
        raise WireError(f"a b32 that is not {B32_LENGTH} bytes: {len(body)}")
    return body


def _write_hints(value: Any) -> bytes:
    if isinstance(value, (str, bytes, bytearray)) or not isinstance(value, Sequence):
        raise WireError(f"hints are not a list: {value!r}")
    out = [_write_size(len(value))]
    for hint in value:
        out.append(_write_text(hint))
    return b"".join(out)


def _read_hints(reader: _Reader) -> tuple[str, ...]:
    return tuple(_read_text(reader) for _ in range(reader.size()))


def _write_base(name: str, value: Any, records: Mapping[str, Block]) -> bytes:
    if name == "bool":
        if type(value) is not bool:
            raise WireError(f"not a bool: {value!r}")
        return bytes([_TRUE if value else _FALSE])
    if name == "int":
        if type(value) is bool:
            raise WireError(f"not an int: {value!r}")
        return _write_int(value)
    if name == "text":
        return _write_text(value)
    if name == "bytes":
        return _write_bytes(value)
    if name in ("b32", "being"):
        return _write_b32(value)
    if name == "invitation":
        if not isinstance(value, Invitation):
            raise WireError(f"not an invitation: {value!r}")
        return (
            _write_b32(value.warden)
            + _write_b32(value.commitment)
            + _write_b32(value.padlock)
            + _write_b32(value.heir)
            + _write_b32(value.heir_secret)
            + _write_hints(value.hints)
        )
    if name == "card":
        if not isinstance(value, Card):
            raise WireError(f"not a card: {value!r}")
        return (
            _write_b32(value.warden)
            + _write_b32(value.commitment)
            + _write_b32(value.padlock)
            + _write_hints(value.hints)
        )
    block = records.get(name)
    if block is None:
        raise WireError(f"a type no block declares: {name!r}")
    if not isinstance(value, Mapping):
        raise WireError(f"not a record: {value!r}")
    declared = [field.name for field in block.fields]
    if set(value) != set(declared):
        raise WireError(f"a record whose fields are not {declared}: {sorted(value)}")
    out = []
    for field in block.fields:
        assert field.answers is not None
        out.append(_write(field.answers, value[field.name], records))
    return b"".join(out)


def _read_base(name: str, reader: _Reader, records: Mapping[str, Block]) -> Any:
    if name == "bool":
        marker = reader.take(1)[0]
        if marker == _FALSE:
            return False
        if marker == _TRUE:
            return True
        raise WireError(f"a bool that is neither zero nor one: {marker}")
    if name == "int":
        return reader.integer()
    if name == "text":
        return _read_text(reader)
    if name == "bytes":
        return reader.take(reader.size())
    if name in ("b32", "being"):
        return reader.take(B32_LENGTH)
    if name == "invitation":
        return Invitation(
            warden=reader.take(B32_LENGTH),
            commitment=reader.take(B32_LENGTH),
            padlock=reader.take(B32_LENGTH),
            heir=reader.take(B32_LENGTH),
            heir_secret=reader.take(B32_LENGTH),
            hints=_read_hints(reader),
        )
    if name == "card":
        return Card(
            warden=reader.take(B32_LENGTH),
            commitment=reader.take(B32_LENGTH),
            padlock=reader.take(B32_LENGTH),
            hints=_read_hints(reader),
        )
    block = records.get(name)
    if block is None:
        raise WireError(f"a type no block declares: {name!r}")
    out: dict[str, Any] = {}
    for field in block.fields:
        assert field.answers is not None
        out[field.name] = _read(field.answers, reader, records)
    return out


def _write(type_: Type, value: Any, records: Mapping[str, Block]) -> bytes:
    if isinstance(type_, Many):
        if isinstance(value, (str, bytes, bytearray)) or not isinstance(
            value, Sequence
        ):
            raise WireError(f"not a list: {value!r}")
        out = [_write_size(len(value))]
        for item in value:
            out.append(_write(type_.of, item, records))
        return b"".join(out)
    if isinstance(type_, Maybe):
        if value is None:
            return bytes([ABSENT])
        return bytes([PRESENT]) + _write(type_.of, value, records)
    if not isinstance(type_, Base):
        raise WireError(f"not a type: {type_!r}")
    return _write_base(type_.name, value, records)


def _read(type_: Type, reader: _Reader, records: Mapping[str, Block]) -> Any:
    if isinstance(type_, Many):
        return [_read(type_.of, reader, records) for _ in range(reader.size())]
    if isinstance(type_, Maybe):
        marker = reader.take(1)[0]
        if marker == ABSENT:
            return None
        if marker == PRESENT:
            return _read(type_.of, reader, records)
        raise WireError(
            f"an optional marker that is neither present nor absent: {marker}"
        )
    if not isinstance(type_, Base):
        raise WireError(f"not a type: {type_!r}")
    return _read_base(type_.name, reader, records)


def encode(
    type_: Type, value: Any, records: Optional[Mapping[str, Block]] = None
) -> bytes:
    """Write one value of one type, the one way the law allows."""
    return _write(type_, value, records or {})


def decode(
    type_: Type, data: bytes, records: Optional[Mapping[str, Block]] = None
) -> Any:
    """Read one value of one type from exactly these bytes, or refuse them."""
    if not isinstance(data, (bytes, bytearray)):
        raise WireError(f"not bytes: {data!r}")
    reader = _Reader(bytes(data))
    value = _read(type_, reader, records or {})
    reader.done()
    return value
