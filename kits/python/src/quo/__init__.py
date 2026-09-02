"""The Quo kit in Python. The core: the notation, the arithmetic, the wire, the
envelope, the warden, the being's own API to it, and the smallest honest
delivery and store a host can hand in.

The three roads — ``quo.carriage``, ``quo.line`` and ``quo.call``, which is
distance zero — are deliberately absent here, and so is ``quo.host``, which is
the one module that knows every road by name. Importing this package pulls in
no road, so the core stays portable; a road is asked for by name.
"""

from . import arithmetic, being, delivery, envelope, notation, warden, wire

__all__ = [
    "arithmetic",
    "being",
    "delivery",
    "envelope",
    "notation",
    "warden",
    "wire",
]
