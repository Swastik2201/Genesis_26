"""Game2048Adapter — GameAdapter implementation for 2048 on TopGameAI Arena (Stage 2).

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


class Game2048Adapter(GameAdapter):
    """Adapter for Stage 2: 2048 on TopGameAI Arena.

    Endpoints
    ---------
    - POST /api/arena/sessions -> Start new session
    - POST /api/arena/sessions/{session_id}/action -> Submit slide action
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

    @property
    def name(self) -> str:
        return "2048"

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
            if e.code == 400:
                raise IllegalMoveError(payload.get("action", ""), err_text) from e
            raise RuntimeError(f"HTTP {e.code} from {url}: {err_text}") from e
        except Exception as e:
            raise RuntimeError(f"Network error communicating with {url}: {e}") from e

    def start(self) -> dict[str, Any]:
        """Start a new 2048 session on TopGameAI."""
        raw = self._request("/sessions", {"game": "2048", "agent_name": self._agent_name})
        self._session_id = raw.get("session_id", "")
        self._last_raw = raw
        return raw

    def get_state(self) -> dict[str, Any]:
        return self._last_raw

    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        """List 4 slide directions."""
        return [
            {"id": "up", "label": "Slide Up", "hint": "Slide tiles upward"},
            {"id": "down", "label": "Slide Down", "hint": "Slide tiles downward"},
            {"id": "left", "label": "Slide Left", "hint": "Slide tiles leftward"},
            {"id": "right", "label": "Slide Right", "hint": "Slide tiles rightward"},
        ]

    def submit_move(
        self,
        action_id: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """Submit a directional slide."""
        endpoint = f"/sessions/{self._session_id}/action"
        raw = self._request(endpoint, {"action": action_id})
        self._last_raw = raw
        return raw

    def judge(
        self,
        prev_raw: dict[str, Any],
        response: dict[str, Any],
        new_raw: dict[str, Any],
    ) -> bool | None:
        """Evaluate if move was good (score increased or game continues)."""
        is_done = new_raw.get("done", False)
        if is_done:
            return bool(new_raw.get("won", False))

        score_prev = prev_raw.get("score", 0)
        score_new = new_raw.get("score", 0)
        return score_new >= score_prev

    def close(self) -> None:
        pass
