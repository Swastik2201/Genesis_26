"""tests/lane_a/test_normaliser.py — Lane A normaliser tests.

Run with:
    pytest tests/lane_a/test_normaliser.py -v
"""

from __future__ import annotations

import re
import pytest

from bot.normaliser import get_normaliser, list_normalisers, MockNormaliser

# ---------------------------------------------------------------------------
# Fixtures — raw states fed to the normaliser
# ---------------------------------------------------------------------------

# State A: obstacle directly ahead in current lane, left lane clear
RAW_AHEAD = {
    "game_id": "mock-v1",
    "session_id": "test-session-001",
    "step": 0,
    "lane": 2,          # centre
    "score": 0.0,
    "done": False,
    "obstacles": [
        {"lane": 2, "distance": 1},   # directly ahead in our lane
    ],
    "legal_actions": [
        {"id": "move_left",  "label": "Move Left",            "hint": "Lane 1 is clear"},
        {"id": "stay",       "label": "Stay in Current Lane", "hint": "Collision imminent"},
        {"id": "move_right", "label": "Move Right",           "hint": "Lane 3 is clear"},
    ],
    "message": "",
}

# State B: all lanes clear, player in left lane
RAW_ALL_CLEAR = {
    "game_id": "mock-v1",
    "session_id": "test-session-002",
    "step": 5,
    "lane": 1,          # left lane
    "score": 50.0,
    "done": False,
    "obstacles": [],
    "legal_actions": [
        {"id": "move_left",  "label": "Move Left",            "hint": "Blocked by left wall"},
        {"id": "stay",       "label": "Stay in Current Lane", "hint": "Lane 1 is clear"},
        {"id": "move_right", "label": "Move Right",           "hint": "Lane 2 is clear"},
    ],
    "message": "",
}

# State C: game over (collision)
RAW_DONE = {
    "game_id": "mock-v1",
    "session_id": "test-session-003",
    "step": 12,
    "lane": 3,          # right
    "score": 110.0,
    "done": True,
    "obstacles": [
        {"lane": 3, "distance": 1},
    ],
    "legal_actions": [
        {"id": "move_left",  "label": "Move Left",            "hint": "Lane 2 is clear"},
        {"id": "stay",       "label": "Stay in Current Lane", "hint": "Collision in 1 step"},
        {"id": "move_right", "label": "Move Right",           "hint": "Blocked by right wall"},
    ],
    "message": "Collision. Game over.",
}


def _normalise(raw: dict) -> dict:
    n = get_normaliser("mock-v1")
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
    """Verify the State contract schema is satisfied for all three raw states."""

    @pytest.mark.parametrize("raw", [RAW_AHEAD, RAW_ALL_CLEAR, RAW_DONE])
    def test_required_keys_present(self, raw: dict) -> None:
        state = _normalise(raw)
        missing = REQUIRED_KEYS - state.keys()
        assert not missing, f"Missing keys: {missing}"

    @pytest.mark.parametrize("raw", [RAW_AHEAD, RAW_ALL_CLEAR, RAW_DONE])
    def test_types(self, raw: dict) -> None:
        state = _normalise(raw)
        assert isinstance(state["game_id"], str)
        assert isinstance(state["session_id"], str)
        assert isinstance(state["step"], int) and state["step"] >= 0
        assert isinstance(state["state_text"], str)
        assert isinstance(state["facts"], dict)
        assert isinstance(state["legal_actions"], list)
        assert state["score"] is None or isinstance(state["score"], (int, float))
        assert isinstance(state["done"], bool)

    @pytest.mark.parametrize("raw", [RAW_AHEAD, RAW_ALL_CLEAR, RAW_DONE])
    def test_legal_actions_shape(self, raw: dict) -> None:
        state = _normalise(raw)
        for act in state["legal_actions"]:
            missing = ACTION_REQUIRED_KEYS - act.keys()
            assert not missing, f"Action missing keys {missing}: {act}"
            # Only id, label, hint are allowed (additionalProperties: false)
            extra = act.keys() - {"id", "label", "hint"}
            assert not extra, f"Action has unexpected extra keys {extra}: {act}"

    @pytest.mark.parametrize("raw", [RAW_AHEAD, RAW_ALL_CLEAR, RAW_DONE])
    def test_state_text_is_non_empty_string(self, raw: dict) -> None:
        state = _normalise(raw)
        assert state["state_text"].strip()

    @pytest.mark.parametrize("raw", [RAW_AHEAD, RAW_ALL_CLEAR, RAW_DONE])
    def test_state_text_under_150_words(self, raw: dict) -> None:
        state = _normalise(raw)
        word_count = len(state["state_text"].split())
        assert word_count <= 150, (
            f"state_text has {word_count} words; aim for under 120"
        )

    @pytest.mark.parametrize("raw", [RAW_AHEAD, RAW_ALL_CLEAR, RAW_DONE])
    def test_step_and_done_match_raw(self, raw: dict) -> None:
        state = _normalise(raw)
        assert state["step"] == raw["step"]
        assert state["done"] == raw["done"]
        assert state["score"] == raw["score"]


# ---------------------------------------------------------------------------
# state_text quality tests
# ---------------------------------------------------------------------------

class TestStateText:
    """Verify that state_text uses plain language and no raw integers."""

    def test_no_raw_digits_in_text_except_score(self) -> None:
        """state_text must not contain lone integer digits (except the score).

        The rule: all comparisons and thresholds are computed in code;
        only conclusions are written into state_text.  The score is the
        only legitimate number.
        """
        for raw in [RAW_AHEAD, RAW_ALL_CLEAR]:
            state = _normalise(raw)
            text = state["state_text"]
            score_val = str(int(raw["score"])) if raw["score"] is not None else None

            # Remove score from text before checking for digits
            text_no_score = text
            if score_val:
                text_no_score = text_no_score.replace(score_val, "")

            # Should contain no standalone digit sequences
            digit_matches = re.findall(r"\b\d+\b", text_no_score)
            assert not digit_matches, (
                f"state_text contains unexpected digits {digit_matches}: '{text}'"
            )

    def test_done_state_text_is_brief(self) -> None:
        state = _normalise(RAW_DONE)
        assert "ended" in state["state_text"].lower() or "over" in state["state_text"].lower()

    def test_obstacle_ahead_in_text(self) -> None:
        """When there is an obstacle directly ahead, state_text must say so."""
        state = _normalise(RAW_AHEAD)
        text = state["state_text"].lower()
        assert "obstacle" in text or "collision" in text or "ahead" in text, (
            f"Expected danger warning in state_text: '{state['state_text']}'"
        )

    def test_clear_mentioned_when_all_clear(self) -> None:
        """When all lanes are clear, state_text should confirm it."""
        state = _normalise(RAW_ALL_CLEAR)
        text = state["state_text"].lower()
        assert "clear" in text, (
            f"Expected 'clear' in state_text when no obstacles: '{state['state_text']}'"
        )

    def test_no_json_in_state_text(self) -> None:
        """state_text must not contain raw JSON (curly braces or brackets)."""
        for raw in [RAW_AHEAD, RAW_ALL_CLEAR, RAW_DONE]:
            state = _normalise(raw)
            text = state["state_text"]
            assert "{" not in text and "[" not in text, (
                f"state_text contains JSON-like characters: '{text}'"
            )


# ---------------------------------------------------------------------------
# facts structure tests
# ---------------------------------------------------------------------------

class TestFacts:
    """Verify that facts carries structured raw values for the UI."""

    def test_facts_contains_current_lane(self) -> None:
        state = _normalise(RAW_AHEAD)
        assert "current_lane" in state["facts"]
        assert state["facts"]["current_lane"] == RAW_AHEAD["lane"]

    def test_facts_contains_obstacles(self) -> None:
        state = _normalise(RAW_AHEAD)
        assert "obstacles" in state["facts"]
        assert isinstance(state["facts"]["obstacles"], list)

    def test_facts_obstacles_match_raw(self) -> None:
        state = _normalise(RAW_AHEAD)
        assert state["facts"]["obstacles"] == RAW_AHEAD["obstacles"]


# ---------------------------------------------------------------------------
# Registry tests
# ---------------------------------------------------------------------------

class TestRegistry:
    """Verify the normaliser registry."""

    def test_get_normaliser_mock_v1(self) -> None:
        n = get_normaliser("mock-v1")
        assert isinstance(n, MockNormaliser)

    def test_get_normaliser_mock_alias(self) -> None:
        n = get_normaliser("mock")
        assert isinstance(n, MockNormaliser)

    def test_get_normaliser_unknown_raises(self) -> None:
        with pytest.raises(KeyError, match="No normaliser registered"):
            get_normaliser("nonexistent_game_xyz")

    def test_list_normalisers(self) -> None:
        names = list_normalisers()
        assert "mock-v1" in names
        assert "mock" in names
