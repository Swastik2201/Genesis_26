"""Game2Adapter — GameAdapter implementation for 2048 on TopGameAI Arena.

Connects to the TopGameAI Arena REST API (https://topgameai.com/api/arena).
Game rules:
- 4x4 Grid
- Actions: 'up', 'down', 'left', 'right'
- A move that does not change the board is rejected and does not count as a step.
- Step cap: 2000 accepted moves.
- Points: min(1000, max(0, log2(best tile) - 6) * 143 + floor(score / 1000))
"""

from __future__ import annotations

import json
import math
from typing import Any
import urllib.error
import urllib.request

from bot.adapters.base import GameAdapter, IllegalMoveError

ACTIONS = ("up", "down", "left", "right")


def calculate_2048_points(best_tile: int, score: int | float) -> int:
    """Calculates official TopGameAI 2048 points formula."""
    if best_tile <= 0:
        return 0
    exponent = math.floor(math.log2(best_tile))
    tile_factor = max(0, exponent - 6) * 143
    score_factor = math.floor(float(score) / 1000.0)
    return min(1000, tile_factor + score_factor)


def slide_row_left(row: list[int]) -> tuple[list[int], int]:
    non_zero = [v for v in row if v != 0]
    merged = []
    score_gain = 0
    skip = False
    for i in range(len(non_zero)):
        if skip:
            skip = False
            continue
        if i + 1 < len(non_zero) and non_zero[i] == non_zero[i + 1]:
            val = non_zero[i] * 2
            merged.append(val)
            score_gain += val
            skip = True
        else:
            merged.append(non_zero[i])
    while len(merged) < 4:
        merged.append(0)
    return merged, score_gain


def simulate_move_2048(grid: list[list[int]], action: str) -> tuple[list[list[int]], int, bool]:
    """Simulates a move on 4x4 grid. Returns (new_grid, score_gain, changed)."""
    g = [row[:] for row in grid]
    score_gain = 0

    if action == "left":
        new_g = []
        for row in g:
            r, s = slide_row_left(row)
            new_g.append(r)
            score_gain += s
    elif action == "right":
        new_g = []
        for row in g:
            r, s = slide_row_left(row[::-1])
            new_g.append(r[::-1])
            score_gain += s
    elif action == "up":
        # Transpose, slide left, transpose
        trans = [list(col) for col in zip(*g)]
        new_trans = []
        for row in trans:
            r, s = slide_row_left(row)
            new_trans.append(r)
            score_gain += s
        new_g = [list(col) for col in zip(*new_trans)]
    elif action == "down":
        # Transpose, slide right, transpose
        trans = [list(col) for col in zip(*g)]
        new_trans = []
        for row in trans:
            r, s = slide_row_left(row[::-1])
            new_trans.append(r[::-1])
            score_gain += s
        new_g = [list(col) for col in zip(*new_trans)]
    else:
        return g, 0, False

    changed = new_g != grid
    return new_g, score_gain, changed


class Game2048Adapter(GameAdapter):
    """Adapter for 2048 on TopGameAI Arena."""

    def __init__(
        self,
        base_url: str = "https://topgameai.com/api/arena",
        agent_name: str = "4-Goats",
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
        """Lists actions that actually change the board."""
        st = raw.get("state", {})
        grid = st.get("grid", [])
        if not grid or len(grid) != 4:
            return [{"id": a, "label": a.capitalize()} for a in ACTIONS]

        actions = []
        for a in ACTIONS:
            _, _, changed = simulate_move_2048(grid, a)
            if changed:
                actions.append({
                    "id": a,
                    "label": a.capitalize(),
                    "hint": f"Slide tiles {a}",
                })
        return actions or [{"id": a, "label": a.capitalize()} for a in ACTIONS]

    def submit_move(
        self,
        action_id: str,
        params: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        return self.step(action_id)

    def step(self, action: str) -> dict[str, Any]:
        """Submit a move to TopGameAI."""
        if not self._session_id:
            raise RuntimeError("Cannot step before starting a session.")
        raw = self._request(f"/sessions/{self._session_id}/action", {"action": action})
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
