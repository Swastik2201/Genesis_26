"""Unit tests for LayaEngine and Decision contracts (Lane B).

Uses a FakeAgent so that tests run fully offline without model weights.
Validates:
- Exactly ONE agent.predict call per decision step.
- Strict action exclusion: excluded actions cannot be chosen.
- Normalisation: action scores strictly sum to 1.0.
- Legal action guarantee: chosen action is strictly within legal, non-excluded set.
- All actions excluded raises RuntimeError.
- Deterministic tie-breaking according to stable order in legal_actions.
- Read-only last_calls audit history.
"""

from __future__ import annotations

import threading
from typing import Any
import pytest

from bot.laya.engine import LayaEngine
from bot.laya.types import Decision
from bot.questions.base import QuestionSet
from bot.questions import register_question_set


class FakeAgent:
    """Mock Laya agent that records calls and returns deterministic answers."""

    def __init__(self, canned_answers: dict[str, Any] | None = None) -> None:
        self.call_count: int = 0
        self.calls: list[tuple[Any, Any]] = []
        self.canned_answers = canned_answers or {
            "lane_status": {
                "type": "choice",
                "choice": "left",
                "probabilities": {"left": 0.70, "straight": 0.20, "right": 0.10},
                "confidence": 0.70,
                "answer_confidence": 0.70,
            }
        }

    def predict(self, state: Any, questions: dict[str, Any]) -> dict[str, Any]:
        self.call_count += 1
        self.calls.append((state, questions))
        return {
            "model": "fake-laya-v1",
            "answers": self.canned_answers,
            "usage": {"total": 42},
        }


class MockPerceptionQuestionSet(QuestionSet):
    id = "mock_perception"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        return {
            "lane_status": {
                "type": "choice",
                "instructions": "Which lane is safest?",
                "criteria": {"left": "Safe", "straight": "Blocked", "right": "Hazard"},
            }
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        exclude_set = set(exclude)
        eligible = [a["id"] for a in legal_actions if a["id"] not in exclude_set]
        q_ans = answers.get("lane_status", {})
        probs = q_ans.get("probabilities", {}) if isinstance(q_ans, dict) else {}
        scores = {aid: float(probs.get(aid, 0.0)) for aid in eligible}
        return scores, "Mapped lane perception probabilities to legal actions."


@pytest.fixture(autouse=True)
def register_fixture_question_set():
    register_question_set("mock_perception", MockPerceptionQuestionSet)


@pytest.fixture
def sample_state() -> dict[str, Any]:
    return {
        "game_id": "runner_test",
        "session_id": "sess_123",
        "step": 1,
        "state_text": "Runner in center. Left lane is clear. Right lane is blocked.",
        "facts": {"lane": 1, "obstacles": [2]},
        "legal_actions": [
            {"id": "left", "label": "Move Left"},
            {"id": "straight", "label": "Move Straight"},
            {"id": "right", "label": "Move Right"},
        ],
        "score": 10.0,
        "done": False,
    }


def test_one_call_rule(sample_state: dict[str, Any]):
    """Verify that decide() makes exactly ONE predict call per decision."""
    fake = FakeAgent()
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    assert fake.call_count == 0
    decision = engine.decide(sample_state, sample_state["legal_actions"])

    assert fake.call_count == 1
    assert isinstance(decision, Decision)
    assert decision.chosen_action == "left"
    assert len(engine.last_calls) == 1


def test_legal_action_guarantee(sample_state: dict[str, Any]):
    """Verify chosen action is strictly within legal actions."""
    fake = FakeAgent()
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    legal_actions = sample_state["legal_actions"]
    decision = engine.decide(sample_state, legal_actions)

    legal_ids = {a["id"] for a in legal_actions}
    assert decision.chosen_action in legal_ids


def test_exclusion_guarantee(sample_state: dict[str, Any]):
    """Verify that excluded actions cannot be chosen even if they had the highest score."""
    fake = FakeAgent()  # Left has 0.70, Straight 0.20, Right 0.10
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    # Exclude top candidate 'left'
    decision = engine.decide(sample_state, sample_state["legal_actions"], exclude=("left",))

    assert decision.chosen_action != "left"
    assert decision.chosen_action == "straight"  # Next highest
    assert "left" not in decision.action_scores


def test_score_normalisation(sample_state: dict[str, Any]):
    """Verify action scores sum to 1.0 within float tolerance."""
    fake = FakeAgent()
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    decision = engine.decide(sample_state, sample_state["legal_actions"])

    total = sum(decision.action_scores.values())
    assert pytest.approx(total, abs=1e-5) == 1.0
    for score in decision.action_scores.values():
        assert 0.0 <= score <= 1.0


def test_all_actions_excluded_raises_error(sample_state: dict[str, Any]):
    """Verify that if all legal actions are excluded, decide() raises RuntimeError."""
    fake = FakeAgent()
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    all_ids = tuple(a["id"] for a in sample_state["legal_actions"])
    with pytest.raises(RuntimeError, match="All legal actions have been excluded"):
        engine.decide(sample_state, sample_state["legal_actions"], exclude=all_ids)


def test_empty_legal_actions_raises_error(sample_state: dict[str, Any]):
    """Verify that empty legal_actions raises ValueError."""
    fake = FakeAgent()
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    with pytest.raises(ValueError, match="legal_actions cannot be empty"):
        engine.decide(sample_state, [])


def test_deterministic_tie_breaking(sample_state: dict[str, Any]):
    """Verify that ties are broken by stable order of legal_actions (first wins)."""
    # Equal probabilities across all options
    tied_agent = FakeAgent(
        canned_answers={
            "lane_status": {
                "type": "choice",
                "probabilities": {"left": 0.333, "straight": 0.333, "right": 0.333},
            }
        }
    )
    engine = LayaEngine(question_set="mock_perception", agent=tied_agent)

    # Order 1: left, straight, right -> left should win
    dec1 = engine.decide(
        sample_state,
        [
            {"id": "left", "label": "L"},
            {"id": "straight", "label": "S"},
            {"id": "right", "label": "R"},
        ],
    )
    assert dec1.chosen_action == "left"
    assert "broken by legal action order" in dec1.reason

    # Order 2: straight, left, right -> straight should win
    dec2 = engine.decide(
        sample_state,
        [
            {"id": "straight", "label": "S"},
            {"id": "left", "label": "L"},
            {"id": "right", "label": "R"},
        ],
    )
    assert dec2.chosen_action == "straight"
    assert "broken by legal action order" in dec2.reason


def test_concurrent_thread_safety(sample_state: dict[str, Any]):
    """Verify thread-safety when multiple threads call decide()."""
    fake = FakeAgent()
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    decisions = []
    errors = []

    def worker():
        try:
            d = engine.decide(sample_state, sample_state["legal_actions"])
            decisions.append(d)
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert not errors
    assert len(decisions) == 10
    assert fake.call_count == 10
    assert len(engine.last_calls) == 10


def test_decision_to_dict_matches_fields(sample_state: dict[str, Any]):
    """Verify that decision.to_dict() matches the required schema fields."""
    fake = FakeAgent()
    engine = LayaEngine(question_set="mock_perception", agent=fake)

    decision = engine.decide(sample_state, sample_state["legal_actions"])
    d_dict = decision.to_dict()

    expected_keys = {
        "chosen_action",
        "action_scores",
        "questions",
        "question_set",
        "latency_ms",
        "reason",
        "raw",
    }
    assert set(d_dict.keys()) == expected_keys
    assert isinstance(d_dict["latency_ms"], float)
    assert d_dict["latency_ms"] >= 0.0
