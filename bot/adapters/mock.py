"""MockAdapter — GameAdapter implementation for the local mock game (Lane A).

Connects to ``mock_game.server`` over HTTP using ``GameHTTPClient``.
Interprets a collision (``done=True`` AND score did not increase) as a bad move.

Usage
-----
::

    from bot.adapters import get_adapter

    adapter = get_adapter("mock", base_url="http://localhost:8181", seed=42)
    raw = adapter.start()
"""

from __future__ import annotations

from typing import Any

from bot.adapters.base import GameAdapter, IllegalMoveError
from bot.adapters.http_client import GameHTTPClient


class MockAdapter(GameAdapter):
    """Adapter for the local ``mock_game.server`` lane-runner game.

    Parameters
    ----------
    base_url:
        HTTP base URL of the running mock server (default: ``http://localhost:8181``).
    seed:
        Random seed forwarded to the server on ``POST /start``.
    api_key:
        Not used by the mock server; accepted for interface compatibility.
    session_id:
        Not used (mock server manages sessions internally).
    """

    def __init__(
        self,
        base_url: str = "http://localhost:8181",
        seed: int = 42,
        api_key: str = "",
        session_id: str = "",
        **_extra: Any,
    ) -> None:
        self._seed = seed
        self._client = GameHTTPClient(
            base_url=base_url,
            api_key=api_key,
            session_id=session_id,
        )
        self._last_raw: dict[str, Any] = {}

    # ------------------------------------------------------------------
    # GameAdapter interface
    # ------------------------------------------------------------------

    @property
    def name(self) -> str:
        return "mock"

    def start(self) -> dict[str, Any]:
        """POST /start with the configured seed; return initial raw state."""
        raw = self._client.post("/start", json={"seed": self._seed})
        self._last_raw = raw
        # Propagate the server-assigned session_id so the loop can log it.
        self._client.session_id = raw.get("session_id", "")
        return raw

    def get_state(self) -> dict[str, Any]:
        """GET /state; return current raw state without advancing the game."""
        raw = self._client.get("/state")
        self._last_raw = raw
        return raw

    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        """Extract ``legal_actions`` from a raw state dict.

        The mock server already embeds legal actions in the state with the
        correct ``{id, label, hint}`` structure from the contracts.
        """
        actions: list[dict[str, Any]] = raw.get("legal_actions", [])
        # Guarantee only the keys the contracts require are forwarded.
        return [
            {
                "id": str(a["id"]),
                "label": str(a.get("label", a["id"])),
                **({"hint": str(a["hint"])} if "hint" in a else {}),
            }
            for a in actions
        ]

    def submit_move(
        self,
        action_id: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """POST /move and return the new raw state.

        Raises
        ------
        IllegalMoveError
            If the server returns HTTP 422 (illegal or out-of-bounds move).
        """
        try:
            raw = self._client.post(
                "/move",
                json={"action": action_id, "session_id": self._client.session_id},
            )
        except ValueError as exc:
            # http_client raises ValueError for HTTP 422.
            raise IllegalMoveError(action_id, str(exc)) from exc

        self._last_raw = raw
        return raw

    def judge(
        self,
        prev_raw: dict[str, Any],
        response: dict[str, Any],
        new_raw: dict[str, Any],
    ) -> bool | None:
        """Return False on collision (score did not increase), True otherwise.

        We compare ``score_before`` vs ``score_after`` as the primary signal.
        If ``done`` flipped to True, the game ended; that is treated as a bad
        move (collision) and returns False.
        """
        score_before = prev_raw.get("score")
        score_after = new_raw.get("score")
        game_over = new_raw.get("done", False)

        if game_over and score_after is not None and score_before is not None:
            # Collision: score did not increase
            if score_after <= score_before:
                return False

        if score_before is None or score_after is None:
            return None

        return score_after > score_before  # True = score went up; None not reached here

    def close(self) -> None:
        """Close the underlying HTTP session."""
        self._client.close()
