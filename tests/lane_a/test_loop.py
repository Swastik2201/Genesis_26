"""tests/lane_a/test_loop.py

Full-mock game loop test for Lane A.

Asserts:
- One event is emitted per decision step.
- Every submitted-move event has at least one laya_call.
- The summary is written and contains required keys.
- Both run_game() signature and the returned summary dict are correct.

Uses only objects in Lane A's file ownership (StubEngine, StubLogger, MockAdapter
replaced by an inline FakeAdapter, run_game from bot.loop).
"""

from __future__ import annotations

import time
from typing import Any

import pytest

from bot.loop import run_game
from tests.lane_a.stub_engine import StubEngine


# ---------------------------------------------------------------------------
# Helpers / Fakes
# ---------------------------------------------------------------------------

class _FakeAdapter:
    """Minimal GameAdapter-compatible fake that plays a deterministic 3-step game."""

    name = "fake"

    def __init__(self, steps_until_done: int = 3) -> None:
        self._step = 0
        self._steps_until_done = steps_until_done
        self._score = 0.0
        self._submitted: list[str] = []

    def start(self) -> dict[str, Any]:
        self._step = 0
        self._score = 0.0
        return self._make_raw()

    def get_state(self) -> dict[str, Any]:
        return self._make_raw()

    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        return [
            {"id": "move_left",  "label": "Move Left"},
            {"id": "stay",       "label": "Stay"},
            {"id": "move_right", "label": "Move Right"},
        ]

    def submit_move(self, action_id: str, params: dict | None = None) -> dict[str, Any]:
        self._submitted.append(action_id)
        self._score += 10.0
        self._step += 1
        return self._make_raw()

    def judge(
        self,
        prev_raw: dict[str, Any],
        response: dict[str, Any],
        new_raw: dict[str, Any],
    ) -> bool | None:
        # Always good in this fake
        return True

    def close(self) -> None:
        pass

    def _make_raw(self) -> dict[str, Any]:
        done = self._step >= self._steps_until_done
        return {
            "lane": 2,
            "obstacles": [],
            "score": self._score,
            "done": done,
            "legal_actions": self.list_actions({}),
            "step": self._step,
            "session_id": "fake-session",
            "game_id": "fake-game",
        }


class _FakeNormaliser:
    """Pass-through normaliser producing a valid State contract dict."""

    def normalise(
        self,
        raw: dict[str, Any],
        legal_actions: list[dict],
        step: int,
        session_id: str,
        game_id: str,
        score: float | None,
        done: bool,
    ) -> dict[str, Any]:
        return {
            "game_id": game_id,
            "session_id": session_id,
            "step": step,
            "state_text": f"Step {step}. Score {score}.",
            "facts": {"step": step},
            "legal_actions": legal_actions,
            "score": score,
            "done": done,
        }


class _StubLogger:
    """Captures events in-memory; mimics the RunLogger interface."""

    def __init__(self, game_id: str = "fake-game") -> None:
        self.game_id = game_id
        self.session_id = f"test-{int(time.time())}"
        self.events: list[dict] = []
        self._closed = False
        self._summary: dict | None = None

    def event(self, ev: dict) -> dict:
        self.events.append(ev)
        return ev

    def close(self, summary: dict | None = None) -> dict:
        self._closed = True
        self._summary = summary or {}
        return self._summary

    def __enter__(self) -> "_StubLogger":
        return self

    def __exit__(self, *_: Any) -> None:
        if not self._closed:
            self.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_one_event_per_step():
    """run_game emits exactly one event per submitted decision step."""
    adapter = _FakeAdapter(steps_until_done=3)
    engine = StubEngine(scores={"stay": 1.0})
    stub_logger = _StubLogger()
    normaliser = _FakeNormaliser()

    run_game(
        adapter=adapter,
        engine=engine,
        logger=stub_logger,
        normaliser=normaliser,
        max_steps=10,
    )

    # 3 decision steps + 1 terminal event (game_over)
    decision_events = [e for e in stub_logger.events if e.get("final_action") is not None]
    assert len(decision_events) == 3, (
        f"Expected 3 decision events, got {len(decision_events)}"
    )


def test_every_submitted_event_has_laya_call():
    """Every event with a final_action must contain at least one laya_call."""
    adapter = _FakeAdapter(steps_until_done=4)
    engine = StubEngine(scores={"move_right": 0.9, "stay": 0.1})
    stub_logger = _StubLogger()
    normaliser = _FakeNormaliser()

    run_game(
        adapter=adapter,
        engine=engine,
        logger=stub_logger,
        normaliser=normaliser,
        max_steps=10,
    )

    for ev in stub_logger.events:
        if ev.get("final_action") is not None:
            calls = ev.get("laya_calls", [])
            assert len(calls) >= 1, (
                f"Event at step {ev['step']} has no laya_calls but has final_action={ev['final_action']!r}"
            )


def test_summary_is_written():
    """logger.close() is called with a summary dict containing required keys."""
    adapter = _FakeAdapter(steps_until_done=2)
    engine = StubEngine()
    stub_logger = _StubLogger()
    normaliser = _FakeNormaliser()

    summary = run_game(
        adapter=adapter,
        engine=engine,
        logger=stub_logger,
        normaliser=normaliser,
        max_steps=10,
    )

    assert stub_logger._closed, "logger.close() was never called"
    assert summary is not None, "run_game returned None instead of a summary dict"

    required_keys = {
        "session_id", "game_id", "steps", "final_score",
        "invalid_moves", "fallbacks", "average_laya_latency_ms",
        "laya_call_count", "completion_status",
    }
    missing = required_keys - summary.keys()
    assert not missing, f"Summary is missing keys: {missing}"


def test_summary_step_count_matches_events():
    """Summary 'steps' should equal the number of decision events emitted."""
    adapter = _FakeAdapter(steps_until_done=5)
    engine = StubEngine(scores={"stay": 1.0})
    stub_logger = _StubLogger()
    normaliser = _FakeNormaliser()

    summary = run_game(
        adapter=adapter,
        engine=engine,
        logger=stub_logger,
        normaliser=normaliser,
        max_steps=10,
    )

    decision_steps = summary.get("steps", -1)
    # 5 decision steps before game_over
    assert decision_steps == 5, f"Expected 5 steps in summary, got {decision_steps}"


def test_max_steps_terminates_loop():
    """run_game stops at max_steps even when the game has not ended."""
    adapter = _FakeAdapter(steps_until_done=999)
    engine = StubEngine()
    stub_logger = _StubLogger()
    normaliser = _FakeNormaliser()

    summary = run_game(
        adapter=adapter,
        engine=engine,
        logger=stub_logger,
        normaliser=normaliser,
        max_steps=3,
    )

    assert summary["steps"] == 3, (
        f"Expected 3 steps (max_steps), got {summary['steps']}"
    )
    assert summary["completion_status"] == "max_steps", (
        f"Expected 'max_steps', got {summary['completion_status']!r}"
    )


def test_event_schema_fields():
    """Each decision event must have all required Event contract fields (§ 5.3)."""
    adapter = _FakeAdapter(steps_until_done=2)
    engine = StubEngine()
    stub_logger = _StubLogger()
    normaliser = _FakeNormaliser()

    run_game(
        adapter=adapter,
        engine=engine,
        logger=stub_logger,
        normaliser=normaliser,
        max_steps=10,
    )

    required = {
        "schema", "session_id", "game_id", "ts", "step",
        "state", "laya_calls", "validator", "final_action",
        "game_response", "outcome",
    }

    for ev in stub_logger.events:
        missing = required - ev.keys()
        assert not missing, (
            f"Event at step {ev.get('step')} missing fields: {missing}"
        )
        gr = ev["game_response"]
        for gr_key in ("good", "score_before", "score_after", "done"):
            assert gr_key in gr, (
                f"game_response missing '{gr_key}' at step {ev.get('step')}"
            )


def test_laya_call_fields():
    """Each laya_call entry must contain the required fields."""
    adapter = _FakeAdapter(steps_until_done=2)
    engine = StubEngine(scores={"move_left": 0.8, "stay": 0.2})
    stub_logger = _StubLogger()
    normaliser = _FakeNormaliser()

    run_game(
        adapter=adapter,
        engine=engine,
        logger=stub_logger,
        normaliser=normaliser,
        max_steps=10,
    )

    required_call_keys = {
        "question_set", "questions", "action_scores",
        "chosen_action", "latency_ms", "accepted",
    }

    for ev in stub_logger.events:
        for call in ev.get("laya_calls", []):
            missing = required_call_keys - call.keys()
            assert not missing, (
                f"laya_call at step {ev.get('step')} missing keys: {missing}"
            )
