"""Adapters for hosted and mock games (Lane A).

Public API
----------
::

    from bot.adapters import get_adapter, list_adapters
    from bot.adapters.base import GameAdapter, GameError, IllegalMoveError
"""

from bot.adapters.registry import get_adapter, list_adapters
from bot.adapters.base import GameAdapter, GameError, IllegalMoveError

__all__ = [
    "get_adapter",
    "list_adapters",
    "GameAdapter",
    "GameError",
    "IllegalMoveError",
]
