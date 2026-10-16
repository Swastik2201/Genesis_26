"""tests/lane_a/test_normaliser.py — Lane A normaliser tests for TopGameAI Arena Snake.

Run with:
    pytest tests/lane_a/test_normaliser.py -v
"""

from __future__ import annotations

import re
import pytest

from bot.normaliser import get_normaliser, list_normalisers, SnakeNormaliser

# ---------------------------------------------------------------------------
# Fixtures — raw Snake states fed to the normaliser
# ---------------------------------------------------------------------------

RAW_SNAKE_PLAYING = {
    "game_id": "snake",
    "session_id": "test-snake-001",
    "step": 4,
    "score": 60.0,
    "done": False,
    "direction": "right",
    "foodEaten": 1,
    "snake": [{"x": 6, "y": 5}, {"x": 5, "y": 5}, {"x": 4, "y": 5}],
    "food": {"x": 8, "y": 5},
    "legal_actions": [
        {"id": "up", "label": "Up", "hint": "Clear corridor"},
        {"id": "down", "label": "Down", "hint": "Clear corridor"},
        {"id": "right", "label": "Right", "hint": "Approaching food (+60 pts)"},
    ],
}

RAW_SNAKE_NEAR_WALL = {
    "game_id": "snake",
    "session_id": "test-snake-002",
    "step": 10,
    "score": 120.0,
    "done": False,
    "direction": "up",
    "foodEaten": 2,
    "snake": [{"x": 11, "y": 1}, {"x": 11, "y": 2}, {"x": 11, "y": 3}],
    "food": {"x": 5, "y": 5},
    "legal_actions": [
        {"id": "up", "label": "Up", "hint": "Wall collision ahead"},
        {"id": "left", "label": "Left", "hint": "Safe turn into arena"},
    ],
}

RAW_SNAKE_DONE = {
    "game_id": "snake",
    "session_id": "test-snake-003",
    "step": 25,
    "score": 180.0,
    "done": True,
    "direction": "right",
    "foodEaten": 3,
    "snake": [{"x": 12, "y": 5}],
    "food": {"x": 5, "y": 5},
    "legal_actions": [],
}


def _normalise(raw: dict) -> dict:
    n = get_normaliser(raw["game_id"])
    return n.normalise(
        raw=raw,
        legal_actions=raw["legal_actions"],
        step=raw["step"],
        session_id=raw["session_id"],
        game_id=raw["game_id"],
        score=raw["score"],
        done=raw["done"],
    )


# ---------------------------------------------------------------------------
# Schema conformance tests
# ---------------------------------------------------------------------------

REQUIRED_KEYS = {
    "game_id", "session_id", "step", "state_text",
    "facts", "legal_actions", "score", "done",
}

ACTION_REQUIRED_KEYS = {"id", "label"}


class TestNormaliserSchema:
    """Verify the State contract schema is satisfied for Snake states."""

    @pytest.mark.parametrize("raw", [RAW_SNAKE_PLAYING, RAW_SNAKE_NEAR_WALL, RAW_SNAKE_DONE])
    def test_required_top_level_keys(self, raw: dict) -> None:
        state = _normalise(raw)
        missing = REQUIRED_KEYS - state.keys()
        assert not missing, f"Missing required keys: {missing}"

    @pytest.mark.parametrize("raw", [RAW_SNAKE_PLAYING, RAW_SNAKE_NEAR_WALL, RAW_SNAKE_DONE])
    def test_field_types(self, raw: dict) -> None:
        state = _normalise(raw)
        assert isinstance(state["game_id"], str)
        assert isinstance(state["session_id"], str)
        assert isinstance(state["step"], int) and state["step"] >= 0
        assert isinstance(state["state_text"], str) and state["state_text"]
        assert isinstance(state["facts"], dict)
        assert isinstance(state["legal_actions"], list)
        assert isinstance(state["score"], (int, float))
        assert isinstance(state["done"], bool)

    @pytest.mark.parametrize("raw", [RAW_SNAKE_PLAYING, RAW_SNAKE_NEAR_WALL])
    def test_legal_action_shape(self, raw: dict) -> None:
        state = _normalise(raw)
        for act in state["legal_actions"]:
            assert isinstance(act, dict)
            missing = ACTION_REQUIRED_KEYS - act.keys()
            assert not missing, f"legal_action missing keys: {missing}"
            assert isinstance(act["id"], str) and act["id"]
            assert isinstance(act["label"], str) and act["label"]


class TestStateTextRules:
    """Verify the state_text follows contract formatting rules."""

    def test_no_json_or_brackets(self) -> None:
        state = _normalise(RAW_SNAKE_PLAYING)
        assert "{" not in state["state_text"]
        assert "}" not in state["state_text"]
        assert "[" not in state["state_text"]
        assert "]" not in state["state_text"]

    def test_word_count_under_120(self) -> None:
        for raw in (RAW_SNAKE_PLAYING, RAW_SNAKE_NEAR_WALL, RAW_SNAKE_DONE):
            state = _normalise(raw)
            word_count = len(state["state_text"].split())
            assert word_count <= 120, f"state_text is {word_count} words (max 120)"

    def test_facts_contains_snake_data(self) -> None:
        state = _normalise(RAW_SNAKE_PLAYING)
        facts = state["facts"]
        assert "snake" in facts
        assert "food" in facts
        assert "direction" in facts
        assert "food_eaten" in facts


class TestRegistry:
    """Verify registry loads SnakeNormaliser."""

    def test_list_normalisers(self) -> None:
        names = list_normalisers()
        assert "snake" in names

    def test_get_normaliser_snake(self) -> None:
        n = get_normaliser("snake")
        assert isinstance(n, SnakeNormaliser)
        assert n.game_id == "snake"
