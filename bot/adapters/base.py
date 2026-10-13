"""Abstract base class for all game adapters (Lane A).

Every adapter that wraps a hosted or local game must subclass GameAdapter and
implement every abstract method.  The concrete adapter is the only place that
knows the game's raw HTTP/WebSocket shape; everything above it speaks the
contracts defined in AGENTS.md § 5.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class GameAdapter(ABC):
    """Interface between the game loop and a concrete game API.

    Lifecycle
    ---------
    1. Instantiate with game-specific config (URL, credentials, seed, …).
    2. Call ``start()`` once to obtain the initial raw state.
    3. Call ``list_actions(raw)`` to enumerate legal moves.
    4. Call ``submit_move(action_id)`` to advance the game.
    5. Repeat from 3 until ``raw["done"]`` is true.
    6. Call ``close()`` to release any held resources.

    Naming
    ------
    The ``name`` property must match the key used in the adapter registry so
    that ``get_adapter(name)`` resolves to the correct class.
    """

    # ------------------------------------------------------------------
    # Identity
    # ------------------------------------------------------------------

    @property
    @abstractmethod
    def name(self) -> str:
        """Stable adapter identifier, e.g. ``"mock"`` or ``"game1"``.

        Must match the key in the registry.  Lower-case, no spaces.
        """

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    @abstractmethod
    def start(self) -> dict[str, Any]:
        """Start or resume a session and return the initial raw state dict.

        If the adapter is configured with an existing session ID it must
        resume rather than create a new session, so the game loop can be
        restarted after a crash without consuming an extra session slot.

        Returns
        -------
        dict
            The raw state as returned by the game API.  Normalisation into
            the contract State object is done by the normaliser, not here.
        """

    @abstractmethod
    def get_state(self) -> dict[str, Any]:
        """Return the current raw state without advancing the game."""

    # ------------------------------------------------------------------
    # Action enumeration
    # ------------------------------------------------------------------

    @abstractmethod
    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        """Derive the list of legal actions from a raw state dict.

        Parameters
        ----------
        raw:
            The raw state dict as returned by ``start()`` or ``submit_move()``.

        Returns
        -------
        list of dict
            Each dict has at minimum ``"id"`` and ``"label"``.  An optional
            ``"hint"`` key carries a short plain-English hint for Laya (e.g.
            ``"Lane 2 is completely clear"``).  No other keys are required.

        Example
        -------
        ::

            [
                {"id": "move_left",  "label": "Move Left",              "hint": "Wall on the left"},
                {"id": "stay",       "label": "Stay in Current Lane",   "hint": "Obstacle in 2 steps"},
                {"id": "move_right", "label": "Move Right",             "hint": "Lane is clear"},
            ]
        """

    # ------------------------------------------------------------------
    # Move submission
    # ------------------------------------------------------------------

    @abstractmethod
    def submit_move(
        self,
        action_id: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Submit an action and return the raw game response.

        Parameters
        ----------
        action_id:
            The ``"id"`` of a legal action as returned by ``list_actions()``.
        params:
            Optional extra parameters required by certain game APIs.  Most
            adapters will not use this; default to ``None``.

        Returns
        -------
        dict
            The raw response from the game server.  The loop will call
            ``get_state()`` afterwards to read the updated state, or the
            response may already embed the new state — the adapter decides.

        Raises
        ------
        IllegalMoveError
            If the game explicitly rejects the action as illegal.  The
            validator catches this, excludes the action, and retries.
        GameError
            For any other non-recoverable game-side error.
        """

    # ------------------------------------------------------------------
    # Move quality judgement
    # ------------------------------------------------------------------

    @abstractmethod
    def judge(
        self,
        prev_raw: dict[str, Any],
        response: dict[str, Any],
        new_raw: dict[str, Any],
    ) -> bool | None:
        """Assess whether a submitted move was good, neutral, or harmful.

        This is used to populate ``game_response.good`` in the event log.
        The result is *observed*, never inferred by strategy.

        Parameters
        ----------
        prev_raw:
            Raw state **before** the move.
        response:
            Raw response returned by ``submit_move()``.
        new_raw:
            Raw state **after** the move (from ``get_state()``).

        Returns
        -------
        True
            The move was good or harmless (score went up, no collision, …).
        False
            The move was harmful (collision, score dropped, …).
        None
            The outcome is unknown or ambiguous from available fields.
        """

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    @abstractmethod
    def close(self) -> None:
        """Release any held resources (HTTP sessions, sockets, …)."""

    # ------------------------------------------------------------------
    # Context-manager support (optional convenience)
    # ------------------------------------------------------------------

    def __enter__(self) -> "GameAdapter":
        return self

    def __exit__(self, *_: Any) -> None:
        self.close()


# ---------------------------------------------------------------------------
# Shared exceptions (raised by adapters, caught by the validator/loop)
# ---------------------------------------------------------------------------


class GameError(RuntimeError):
    """Non-recoverable error from the game API."""


class IllegalMoveError(GameError):
    """The game explicitly rejected an action as illegal.

    Attributes
    ----------
    action_id:
        The action that was rejected.
    message:
        The rejection message from the server (may be empty).
    """

    def __init__(self, action_id: str, message: str = "") -> None:
        self.action_id = action_id
        self.message = message
        super().__init__(f"Illegal move '{action_id}': {message}")
