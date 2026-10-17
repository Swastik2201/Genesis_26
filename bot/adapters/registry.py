"""Adapter registry (Lane A).

Adding a new game adapter requires exactly two steps:
  1. Create ``bot/adapters/<game_name>.py`` with a class that subclasses
     ``GameAdapter``.
  2. Add one line to ``_REGISTRY`` below.

Usage
-----
::

    from bot.adapters import get_adapter

    adapter = get_adapter("mock", base_url="http://localhost:8181", seed=42)
    raw = adapter.start()
"""

from __future__ import annotations

from typing import Any

from bot.adapters.base import GameAdapter

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------
# Map adapter name → fully-qualified class path.  Imports are lazy so that
# optional heavy dependencies (e.g. a game-specific SDK) are only imported
# when that adapter is actually requested.

def _load_mock() -> type[GameAdapter]:
    from bot.adapters.mock import MockAdapter  # noqa: PLC0415
    return MockAdapter


def _load_snake() -> type[GameAdapter]:
    from bot.adapters.game1 import SnakeAdapter  # noqa: PLC0415
    return SnakeAdapter


def _load_2048() -> type[GameAdapter]:
    from bot.adapters.game2 import Game2048Adapter  # noqa: PLC0415
    return Game2048Adapter


_REGISTRY: dict[str, Any] = {
    # name        loader callable
    "mock":       _load_mock,
    "snake":      _load_snake,
    "game1":      _load_snake,
    "2048":       _load_2048,
    "game2":      _load_2048,
}


def list_adapters() -> list[str]:
    """Return the names of all registered adapters."""
    return list(_REGISTRY.keys())


def get_adapter(name: str, **cfg: Any) -> GameAdapter:
    """Instantiate and return a registered adapter.

    Parameters
    ----------
    name:
        The adapter identifier, e.g. ``"mock"`` or ``"game1"``.
    **cfg:
        Keyword arguments forwarded to the adapter constructor.

    Raises
    ------
    KeyError
        If ``name`` is not in the registry.
    """
    if name not in _REGISTRY:
        available = ", ".join(sorted(_REGISTRY))
        raise KeyError(
            f"Unknown adapter '{name}'. Available: {available}"
        )
    cls = _REGISTRY[name]()  # call the lazy loader
    return cls(**cfg)
