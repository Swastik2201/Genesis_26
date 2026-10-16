"""State normaliser — converts raw Snake game state into contract State object.

Contract reference: AGENTS.md § 5.1
Schema:            contracts/state.schema.json
Example:           contracts/examples/state.json

Rules for state_text (read by Laya, ~512 token budget):
- Put the most decision-relevant fact first (food location and nearest hazard).
- Describe positions and danger in plain words; never dump raw numbers.
- Compute comparisons in code; state the conclusion.
- Keep the result under ~120 words.
- No JSON, no curly braces, no list brackets in state_text.

facts keeps the structured raw values for the UI and for Question Lab.
"""

from __future__ import annotations

import warnings
from abc import ABC, abstractmethod
from typing import Any


# ---------------------------------------------------------------------------
# Contract helpers
# ---------------------------------------------------------------------------

_REQUIRED_KEYS = {
    "game_id", "session_id", "step", "state_text", "facts",
    "legal_actions", "score", "done",
}

_ACTION_REQUIRED = {"id", "label"}


def _validate_state(state: dict[str, Any]) -> None:
    """Raise ValueError if the produced state dict violates the contract."""
    missing = _REQUIRED_KEYS - state.keys()
    if missing:
        raise ValueError(f"[normaliser] State is missing required keys: {missing}")

    if not isinstance(state["step"], int) or state["step"] < 0:
        raise ValueError("[normaliser] 'step' must be a non-negative integer")

    if not isinstance(state["done"], bool):
        raise ValueError("[normaliser] 'done' must be a boolean")

    if state["score"] is not None and not isinstance(state["score"], (int, float)):
        raise ValueError("[normaliser] 'score' must be a number or null")

    for act in state.get("legal_actions", []):
        missing_act = _ACTION_REQUIRED - act.keys()
        if missing_act:
            raise ValueError(
                f"[normaliser] legal_action missing keys {missing_act}: {act}"
            )

    # Warn if state_text looks too long
    word_count = len(state["state_text"].split())
    if word_count > 150:
        warnings.warn(
            f"[normaliser] state_text is {word_count} words; aim for under 120.",
            stacklevel=3,
        )


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class StateNormaliser(ABC):
    """Convert a raw adapter state dict into the contract State object."""

    @property
    @abstractmethod
    def game_id(self) -> str:
        """The game identifier this normaliser produces."""

    @abstractmethod
    def normalise(
        self,
        raw: dict[str, Any],
        legal_actions: list[dict[str, str]],
        step: int,
        session_id: str,
        game_id: str,
        score: float | None,
        done: bool,
    ) -> dict[str, Any]:
        """Return a dict conforming to the State contract."""


# ---------------------------------------------------------------------------
# TopGameAI Arena Snake normaliser
# ---------------------------------------------------------------------------


class SnakeNormaliser(StateNormaliser):
    """Normaliser for TopGameAI Arena Snake (Stage 1)."""

    @property
    def game_id(self) -> str:
        return "snake"

    def normalise(
        self,
        raw: dict[str, Any],
        legal_actions: list[dict[str, str]],
        step: int,
        session_id: str,
        game_id: str,
        score: float | None,
        done: bool,
    ) -> dict[str, Any]:
        st = raw.get("state", raw)
        snake_body = st.get("snake", raw.get("snake", []))
        if not snake_body:
            snake_body = [{"x": 5, "y": 5}, {"x": 4, "y": 5}, {"x": 3, "y": 5}]

        head = snake_body[0]
        food = st.get("food", raw.get("food", {"x": 8, "y": 5}))
        direction = str(st.get("direction", raw.get("direction", "right"))).lower()
        food_eaten = int(st.get("foodEaten", raw.get("food_eaten", raw.get("foodEaten", 0))))
        width = int(st.get("width", raw.get("width", 12)))
        height = int(st.get("height", raw.get("height", 12)))

        # Relative food orientation
        dx = food.get("x", 0) - head.get("x", 0)
        dy = food.get("y", 0) - head.get("y", 0)
        food_desc = []
        if dy < 0:
            food_desc.append("upward")
        elif dy > 0:
            food_desc.append("downward")
        if dx < 0:
            food_desc.append("leftward")
        elif dx > 0:
            food_desc.append("rightward")
        food_direction_str = "-".join(food_desc) if food_desc else "directly on current tile"

        # Check hazards for adjacent steps
        hazards = []
        hx, hy = head.get("x", 0), head.get("y", 0)
        body_coords = {(s.get("x", 0), s.get("y", 0)) for s in snake_body[:-1]}

        deltas = {"up": (0, -1), "down": (0, 1), "left": (-1, 0), "right": (1, 0)}
        for act in ("up", "down", "left", "right"):
            adx, ady = deltas[act]
            tx, ty = hx + adx, hy + ady
            if tx < 0 or tx >= width or ty < 0 or ty >= height:
                hazards.append(f"{act} is wall")
            elif (tx, ty) in body_coords:
                hazards.append(f"{act} is body")

        hazard_str = f"Hazards: {', '.join(hazards)}." if hazards else "All adjacent moves are clear of immediate walls."

        safe_options = [a["id"] for a in legal_actions if a["id"] not in [h.split()[0] for h in hazards]]
        safe_str = f"Safe choices: {', '.join(safe_options)}." if safe_options else "Caution: tight passage."

        calc_score = float(score if score is not None else raw.get("score", food_eaten * 60))

        if done:
            state_text = f"The Snake game has ended with score {int(calc_score)}. Total food collected: {food_eaten} of 15."
        else:
            state_text = (
                f"The snake head is at column {hx}, row {hy} moving {direction}. "
                f"Target food is located {food_direction_str}. "
                f"Progress: {food_eaten} of 15 foods eaten. "
                f"{hazard_str} {safe_str} "
                f"Score: {int(calc_score)}."
            )

        facts = {
            "snake": list(snake_body),
            "head": [hy, hx],
            "food": [food.get("y", 0), food.get("x", 0)],
            "direction": direction,
            "food_eaten": food_eaten,
            "grid_size": [height, width],
            "body_length": len(snake_body),
        }

        clean_actions = []
        for act in legal_actions:
            entry = {
                "id": str(act["id"]),
                "label": str(act.get("label", act["id"])),
            }
            if "hint" in act:
                entry["hint"] = str(act["hint"])
            clean_actions.append(entry)

        state = {
            "game_id": game_id,
            "session_id": session_id,
            "step": step,
            "state_text": state_text.strip(),
            "facts": facts,
            "legal_actions": clean_actions,
            "score": calc_score,
            "done": done,
        }
        _validate_state(state)
        return state


class Game2048Normaliser(StateNormaliser):
    """Normaliser for Stage 2: 2048 game."""

    @property
    def game_id(self) -> str:
        return "2048"

    def normalise(
        self,
        raw: dict[str, Any],
        legal_actions: list[dict[str, str]],
        step: int,
        session_id: str,
        game_id: str,
        score: float | None,
        done: bool,
    ) -> dict[str, Any]:
        st = raw.get("state", {})
        grid = st.get("grid", [[0] * 4 for _ in range(4)])
        max_val = 0
        max_pos = [0, 0]
        for r in range(len(grid)):
            for c in range(len(grid[r])):
                val = grid[r][c]
                if val > max_val:
                    max_val = val
                    max_pos = [r, c]

        state_text = (
            f"The 2048 board has sixteen tiles. "
            f"The largest tile is {max_val} at row {max_pos[0] + 1} column {max_pos[1] + 1}. "
            f"Current score: {st.get('score', 0)}. "
            f"Sliding moves available: {', '.join(a['id'] for a in legal_actions)}."
        )

        facts = {
            "grid": grid,
            "max_tile": max_val,
            "max_tile_pos": max_pos,
            "score": float(st.get("score", 0)),
            "best": float(st.get("best", max_val)),
        }

        clean_actions = [
            {"id": str(a["id"]), "label": str(a.get("label", a["id"])), **({"hint": str(a["hint"])} if "hint" in a else {})}
            for a in legal_actions
        ]

        state = {
            "game_id": game_id,
            "session_id": session_id,
            "step": step,
            "state_text": state_text,
            "facts": facts,
            "legal_actions": clean_actions,
            "score": float(score if score is not None else st.get("score", 0)),
            "done": done,
        }
        _validate_state(state)
        return state


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

def _load_snake_normaliser() -> type[StateNormaliser]:
    return SnakeNormaliser


def _load_2048_normaliser() -> type[StateNormaliser]:
    return Game2048Normaliser


_NORMALISER_REGISTRY: dict[str, Any] = {
    "snake":   _load_snake_normaliser,
    "game1":   _load_snake_normaliser,
    "mock":    _load_snake_normaliser,
    "mock-v1": _load_snake_normaliser,
    "2048":    _load_2048_normaliser,
    "game2":   _load_2048_normaliser,
}


def list_normalisers() -> list[str]:
    """Return the registered game names."""
    return list(_NORMALISER_REGISTRY.keys())


def get_normaliser(game_name: str) -> StateNormaliser:
    """Return a fresh normaliser instance for game_name."""
    loader = _NORMALISER_REGISTRY.get(game_name, _load_snake_normaliser)
    cls = loader()
    return cls()

