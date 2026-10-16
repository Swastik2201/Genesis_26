"""SnakeAdapter — GameAdapter implementation for Snake on TopGameAI Arena (Stage 1).

Connects to the TopGameAI Arena REST API (https://topgameai.com/api/arena)
or a local mock equivalent.
"""

from __future__ import annotations

import json
from typing import Any
import urllib.error
import urllib.request

from bot.adapters.base import GameAdapter, IllegalMoveError


CARDINAL_DIRECTIONS = ("up", "down", "left", "right")
OPPOSITE_DIRECTIONS = {
    "up": "down",
    "down": "up",
    "left": "right",
    "right": "left",
}


class SnakeAdapter(GameAdapter):
    """Adapter for Stage 1: Snake on TopGameAI Arena.

    Endpoints
    ---------
    - POST /api/arena/sessions -> Start new session
    - POST /api/arena/sessions/{session_id}/action -> Submit move
    """

    def __init__(
        self,
        base_url: str = "https://topgameai.com/api/arena",
        agent_name: str = "Genesis",
        session_id: str = "",
        **_extra: Any,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._agent_name = agent_name
        self._session_id = session_id
        self._last_raw: dict[str, Any] = {}
        self._current_direction: str = "right"

    @property
    def name(self) -> str:
        return "snake"

    def _request(self, endpoint: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base_url}{endpoint}"
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (BeatTheBot/1.0)",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_text = e.read().decode("utf-8")
            if e.code == 400 and "Cannot reverse" in err_text:
                raise IllegalMoveError(payload.get("action", ""), err_text) from e
            raise RuntimeError(f"HTTP {e.code} from {url}: {err_text}") from e
        except Exception as e:
            raise RuntimeError(f"Network error communicating with {url}: {e}") from e

    def start(self) -> dict[str, Any]:
        """Start a new Snake session on TopGameAI."""
        raw = self._request("/sessions", {"game": "snake", "agent_name": self._agent_name})
        self._session_id = raw.get("session_id", "")
        self._last_raw = raw
        st = raw.get("state", {})
        self._current_direction = st.get("direction", "right")
        return raw

    def get_state(self) -> dict[str, Any]:
        return self._last_raw

    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        """List non-reversing cardinal directions."""
        st = raw.get("state", {})
        cur_dir = st.get("direction", self._current_direction).lower()
        opposite = OPPOSITE_DIRECTIONS.get(cur_dir, "")

        actions = []
        for d in CARDINAL_DIRECTIONS:
            if d == opposite:
                continue  # Reversing is strictly illegal
            actions.append({
                "id": d,
                "label": d.capitalize(),
                "hint": f"Move {d} (current: {cur_dir})",
            })
        return actions

    def submit_move(
        self,
        action_id: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Submit a move direction."""
        endpoint = f"/sessions/{self._session_id}/action"
        raw = self._request(endpoint, {"action": action_id})
        self._last_raw = raw
        st = raw.get("state", {})
        self._current_direction = st.get("direction", action_id)
        return raw

    def judge(
        self,
        prev_raw: dict[str, Any],
        response: dict[str, Any],
        new_raw: dict[str, Any],
    ) -> bool | None:
        """Evaluate if move was good (food eaten or survived without crashing)."""
        is_done = new_raw.get("done", False)
        if is_done:
            return bool(new_raw.get("won", False))

        prev_st = prev_raw.get("state", {})
        new_st = new_raw.get("state", {})
        food_prev = prev_st.get("foodEaten", 0)
        food_new = new_st.get("foodEaten", 0)
        if food_new > food_prev:
            return True
        return True  # Safe legal progression

    def close(self) -> None:
        pass
