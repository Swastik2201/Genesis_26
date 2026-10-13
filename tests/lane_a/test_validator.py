"""tests/lane_a/test_validator.py — Lane A validator tests.

Covers:
- validate(): legal move passes, illegal move fails with reason.
- choose_move(): legal move accepted on first attempt.
- choose_move(): game-rejected move triggers retry with exclude.
- choose_move(): all retries exhausted → fallback from last Laya scores.

Run with:
    pytest tests/lane_a/test_validator.py -v
"""

from __future__ import annotations

from typing import Any
import pytest

from bot.validator import validate, choose_move
from bot.adapters.base import IllegalMoveError
from tests.lane_a.stub_engine import StubEngine

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

LEGAL_ACTIONS = [
    {"id": "move_left",  "label": "Move Left",            "hint": "Clear"},
    {"id": "stay",       "label": "Stay in Current Lane", "hint": "Obstacle ahead"},
    {"id": "move_right", "label": "Move Right",           "hint": "Clear"},
]

STUB_STATE = {
    "game_id": "mock-v1",
    "session_id": "validator-test-session",
    "step": 0,
    "state_text": "We are in the centre lane. The right lane is clear.",
    "facts": {"current_lane": 2, "obstacles": [], "speed": 1.0},
    "legal_actions": LEGAL_ACTIONS,
    "score": 0,
    "done": False,
}


# ---------------------------------------------------------------------------
# Stub adapter — controls which actions succeed or raise IllegalMoveError
# ---------------------------------------------------------------------------

class StubAdapter:
    """Minimal adapter stub for validator tests.

    Parameters
    ----------
    reject_actions:
        Set of action IDs that will raise ``IllegalMoveError`` when submitted.
    """

    def __init__(self, reject_actions: set[str] | None = None) -> None:
        self.reject_actions: set[str] = set(reject_actions or set())
        self.submitted: list[str] = []

    def submit_move(
        self, action_id: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        self.submitted.append(action_id)
        if action_id in self.reject_actions:
            raise IllegalMoveError(action_id, "Simulated game rejection")
        return {
            "game_id": "mock-v1",
            "session_id": "validator-test-session",
            "step": 1,
            "lane": 3,
            "score": 10.0,
            "done": False,
            "obstacles": [],
            "legal_actions": LEGAL_ACTIONS,
            "message": f"Moved to lane via {action_id}",
        }


# ---------------------------------------------------------------------------
# Tests for validate()
# ---------------------------------------------------------------------------

class TestValidate:
    def test_legal_action_returns_ok(self) -> None:
        ok, reason = validate("move_right", LEGAL_ACTIONS)
        assert ok is True
        assert reason == ""

    def test_legal_action_stay_returns_ok(self) -> None:
        ok, reason = validate("stay", LEGAL_ACTIONS)
        assert ok is True

    def test_illegal_action_returns_false(self) -> None:
        ok, reason = validate("turbo_boost", LEGAL_ACTIONS)
        assert ok is False
        assert "turbo_boost" in reason

    def test_illegal_action_reason_mentions_legal_set(self) -> None:
        ok, reason = validate("fly", LEGAL_ACTIONS)
        assert "move_left" in reason or "stay" in reason or "move_right" in reason

    def test_empty_legal_actions_always_illegal(self) -> None:
        ok, reason = validate("move_right", [])
        assert ok is False


# ---------------------------------------------------------------------------
# Tests for choose_move() — happy path
# ---------------------------------------------------------------------------

class TestChooseMoveHappyPath:
    def test_legal_move_accepted_first_attempt(self) -> None:
        engine = StubEngine(scores={"move_right": 0.9, "stay": 0.07, "move_left": 0.03})
        adapter = StubAdapter()

        final_action, game_resp, laya_calls, validator_info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter
        )

        assert final_action == "move_right"
        assert game_resp["score"] == 10.0
        assert len(laya_calls) == 1
        assert laya_calls[0]["accepted"] is True
        assert laya_calls[0]["excluded"] is False
        assert validator_info["retries"] == 0
        assert validator_info["fallback"] is False
        assert validator_info["rejections"] == []

    def test_laya_call_contains_required_fields(self) -> None:
        engine = StubEngine(scores={"stay": 1.0})
        adapter = StubAdapter()

        _, _, laya_calls, _ = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter
        )

        call = laya_calls[0]
        for key in ("question_set", "questions", "raw", "action_scores",
                    "chosen_action", "latency_ms", "reason"):
            assert key in call, f"Missing key '{key}' in laya_call"

    def test_engine_decide_called_once_on_success(self) -> None:
        engine = StubEngine(scores={"move_left": 1.0})
        adapter = StubAdapter()

        choose_move(engine, STUB_STATE, LEGAL_ACTIONS, adapter)

        assert engine.calls == 1


# ---------------------------------------------------------------------------
# Tests for choose_move() — retry on game rejection
# ---------------------------------------------------------------------------

class TestChooseMoveRetry:
    def test_game_rejected_move_triggers_retry(self) -> None:
        """move_right is rejected by the game → should retry with move_right excluded."""
        engine = StubEngine(
            scores={"move_right": 0.9, "stay": 0.08, "move_left": 0.02}
        )
        # First submission (move_right) is rejected; second (stay) succeeds
        adapter = StubAdapter(reject_actions={"move_right"})

        final_action, game_resp, laya_calls, validator_info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=3
        )

        # move_right was rejected, so engine was called again and chose next best
        assert final_action != "move_right"
        assert len(laya_calls) == 2
        # First call was excluded
        assert laya_calls[0]["excluded"] is True
        assert laya_calls[0]["chosen_action"] == "move_right"
        # Second call was accepted
        assert laya_calls[1]["accepted"] is True
        assert validator_info["retries"] == 1
        assert validator_info["fallback"] is False
        assert len(validator_info["rejections"]) == 1

    def test_excluded_set_grows_across_retries(self) -> None:
        """Engine should see an expanding exclude set on each retry."""
        engine = StubEngine(
            scores={"move_right": 0.9, "stay": 0.08, "move_left": 0.02}
        )
        # Reject first two picks
        adapter = StubAdapter(reject_actions={"move_right", "stay"})

        final_action, _, laya_calls, info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=3
        )

        assert final_action == "move_left"
        assert info["retries"] == 2
        assert info["fallback"] is False
        # Third call had both excluded actions in exclude set
        assert engine.calls == 3

    def test_engine_receives_exclude_set(self) -> None:
        """Verify the engine sees the previously rejected action in exclude."""
        engine = StubEngine(
            scores={"move_right": 0.9, "stay": 0.08, "move_left": 0.02}
        )
        adapter = StubAdapter(reject_actions={"move_right"})

        choose_move(engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=3)

        # On second call, exclude should contain "move_right"
        assert "move_right" in engine.last_exclude

    def test_pre_submission_illegal_triggers_retry(self) -> None:
        """Engine returning an action not in legal set should also trigger retry."""
        # Override engine to return "fly" (not legal) on first call,
        # then fall back to normal scoring
        call_count = 0

        class BadFirstCallEngine:
            calls = 0
            last_exclude: set = set()

            def decide(self, state, legal_actions, exclude=None):
                self.calls += 1
                self.last_exclude = set(exclude or set())
                if self.calls == 1:
                    # Return an illegal action on first call
                    return {
                        "chosen_action": "fly",   # not in legal_actions
                        "action_scores": {"fly": 1.0},
                        "questions": [],
                        "question_set": "stub_v0",
                        "latency_ms": 1.0,
                        "reason": "Bad first call",
                        "raw": None,
                    }
                # Second call: return a legal action
                return {
                    "chosen_action": "stay",
                    "action_scores": {"stay": 1.0},
                    "questions": [],
                    "question_set": "stub_v0",
                    "latency_ms": 1.0,
                    "reason": "Good second call",
                    "raw": None,
                }

        engine = BadFirstCallEngine()
        adapter = StubAdapter()

        final_action, _, laya_calls, info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=3
        )

        assert final_action == "stay"
        assert info["retries"] == 1
        assert laya_calls[0]["legal"] is False
        assert laya_calls[0]["excluded"] is True


# ---------------------------------------------------------------------------
# Tests for choose_move() — fallback when retries exhausted
# ---------------------------------------------------------------------------

class TestChooseMoveFallback:
    def test_retries_exhausted_triggers_fallback(self) -> None:
        """When all retries fail, fall back to highest-scoring remaining action."""
        # Engine always picks move_right; game always rejects move_right.
        # After max_retries, fallback should choose the next best legal action.
        engine = StubEngine(
            scores={"move_right": 0.8, "stay": 0.15, "move_left": 0.05},
            override_action="move_right",
        )
        adapter = StubAdapter(reject_actions={"move_right"})

        # With max_retries=1: one failed attempt, then fallback.
        final_action, game_resp, laya_calls, info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=1
        )

        assert info["fallback"] is True
        assert final_action != "move_right"  # fallback chose something else
        assert game_resp is not None
        # The last laya_call entry records the fallback
        assert laya_calls[-1].get("fallback") is True

    def test_fallback_action_is_from_laya_scores(self) -> None:
        """Fallback must be the highest-scoring non-excluded action from last Laya call."""
        engine = StubEngine(
            scores={"move_right": 0.9, "stay": 0.07, "move_left": 0.03},
            override_action="move_right",
        )
        # Reject only move_right so fallback picks "stay" (next highest)
        adapter = StubAdapter(reject_actions={"move_right"})

        final_action, _, laya_calls, info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=1
        )

        assert info["fallback"] is True
        # "stay" has score 0.07 > "move_left" 0.03 → fallback should pick "stay"
        assert final_action == "stay"

    def test_fallback_not_triggered_on_success(self) -> None:
        engine = StubEngine(scores={"move_right": 1.0})
        adapter = StubAdapter()  # no rejections

        _, _, _, info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=3
        )
        assert info["fallback"] is False

    def test_every_call_laya_traced(self) -> None:
        """Every submitted move (including fallback) must have a laya_call entry."""
        engine = StubEngine(
            scores={"move_right": 0.9, "stay": 0.08, "move_left": 0.02},
            override_action="move_right",
        )
        adapter = StubAdapter(reject_actions={"move_right"})

        final_action, _, laya_calls, info = choose_move(
            engine, STUB_STATE, LEGAL_ACTIONS, adapter, max_retries=1
        )

        # There must be at least one laya_call, and the final_action must
        # appear in one of the entries (either chosen_action or fallback_chosen).
        all_actions = set()
        for call in laya_calls:
            all_actions.add(call.get("chosen_action"))
            if call.get("fallback_chosen"):
                all_actions.add(call["fallback_chosen"])

        assert final_action in all_actions, (
            f"Final action '{final_action}' not traceable to any laya_call entry. "
            f"Entries: {laya_calls}"
        )
