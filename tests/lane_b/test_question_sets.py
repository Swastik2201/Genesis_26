"""Tests for all four mock-game question set variants (Lane B).

Tests:
- v1_perception: perception questions, option descriptions, answer mapping.
- v2_direct_action: direct action questions, dynamic action descriptions, answer mapping.
- v3_hybrid_gates: noul questions, THRESHOLDS config, evasive vs stay gate logic.
- v4_terse_state: state compression, perception questions, answer mapping.
- Registry: all 4 registered and resolvable via get_question_set().
- LayaEngine integration: all 4 execute end-to-end with FakeAgent.
"""

from __future__ import annotations

from typing import Any
import pytest

from bot.laya.engine import LayaEngine
from bot.questions import (
    get_question_set,
    list_question_sets,
    V1PerceptionQuestionSet,
    V2DirectActionQuestionSet,
    V3HybridGatesQuestionSet,
    V4TerseStateQuestionSet,
)
from bot.questions.v3_hybrid_gates import THRESHOLDS


@pytest.fixture
def mock_legal_actions() -> list[dict[str, str]]:
    return [
        {"id": "move_left", "label": "Move Left"},
        {"id": "stay", "label": "Stay"},
        {"id": "move_right", "label": "Move Right"},
    ]


@pytest.fixture
def sample_state(mock_legal_actions: list[dict[str, str]]) -> dict[str, Any]:
    return {
        "game_id": "mock-v1",
        "session_id": "test-sess",
        "step": 3,
        "state_text": (
            "We are in the centre lane, which has an obstacle directly ahead — collision imminent. "
            "To the left: the left lane is clear. To the right: the right lane has an obstacle approaching. "
            "Safe option(s): Move Left. Current score: 20."
        ),
        "facts": {"current_lane": 2, "obstacles": [{"lane": 2, "distance": 1}]},
        "legal_actions": mock_legal_actions,
        "score": 20.0,
        "done": False,
    }


def test_registry_contains_all_four_variants():
    """Verify all four question sets are registered."""
    registered = list_question_sets()
    for expected in ("v1_perception", "v2_direct_action", "v3_hybrid_gates", "v4_terse_state"):
        assert expected in registered, f"Missing registered question set: {expected}"
        qs = get_question_set(expected)
        assert qs.id == expected


def test_v1_perception_questions_and_mapping(sample_state: dict[str, Any], mock_legal_actions: list[dict[str, str]]):
    """Verify v1_perception builds choice questions with descriptions and maps answers."""
    qs = V1PerceptionQuestionSet()
    questions = qs.build_questions(sample_state)

    assert "safest_lane" in questions
    assert "blocked_lane" in questions
    assert questions["safest_lane"]["type"] == "choice"
    # Verify every option has a descriptive string
    for opt, desc in questions["safest_lane"]["criteria"].items():
        assert isinstance(desc, str) and len(desc) > 5

    # Mock Laya perception answers
    fake_answers = {
        "safest_lane": {
            "type": "choice",
            "choice": "left",
            "probabilities": {"left": 0.80, "centre": 0.10, "right": 0.10},
        },
        "blocked_lane": {
            "type": "choice",
            "choice": "centre",
            "probabilities": {"left": 0.05, "centre": 0.85, "right": 0.10, "none": 0.0},
        },
    }

    scores, reason = qs.map_answers(fake_answers, mock_legal_actions)
    assert pytest.approx(sum(scores.values()), abs=1e-5) == 1.0
    assert scores["move_left"] > scores["stay"]
    assert scores["move_left"] > scores["move_right"]
    assert isinstance(reason, str) and len(reason) > 5


def test_v2_direct_action_questions_and_mapping(sample_state: dict[str, Any], mock_legal_actions: list[dict[str, str]]):
    """Verify v2_direct_action asks directly for actions and maps probabilities."""
    qs = V2DirectActionQuestionSet()
    questions = qs.build_questions(sample_state)

    assert "recommended_action" in questions
    crit = questions["recommended_action"]["criteria"]
    assert "move_left" in crit
    assert "stay" in crit
    assert "move_right" in crit

    fake_answers = {
        "recommended_action": {
            "type": "choice",
            "choice": "move_left",
            "probabilities": {"move_left": 0.65, "stay": 0.15, "move_right": 0.20},
        }
    }

    scores, reason = qs.map_answers(fake_answers, mock_legal_actions)
    assert pytest.approx(sum(scores.values()), abs=1e-5) == 1.0
    assert scores["move_left"] == pytest.approx(0.65, abs=1e-2)
    assert "move_left" in reason


def test_v3_hybrid_gates_threshold_evasion(sample_state: dict[str, Any], mock_legal_actions: list[dict[str, str]]):
    """Verify v3_hybrid_gates triggers evasion when collision gate threshold is crossed."""
    assert "collision_gate" in THRESHOLDS
    assert "lane_free_threshold" in THRESHOLDS

    qs = V3HybridGatesQuestionSet()
    questions = qs.build_questions(sample_state)

    assert "collision_imminent" in questions
    assert "left_lane_free" in questions
    assert "right_lane_free" in questions
    assert questions["collision_imminent"]["type"] == "noul"

    # Scenario 1: High collision risk -> evades to left lane
    high_hazard_answers = {
        "collision_imminent": {"type": "noul", "noul": 0.85},
        "left_lane_free": {"type": "noul", "noul": 0.90},
        "right_lane_free": {"type": "noul", "noul": 0.10},
    }
    scores_evade, reason_evade = qs.map_answers(high_hazard_answers, mock_legal_actions)
    assert pytest.approx(sum(scores_evade.values()), abs=1e-5) == 1.0
    assert scores_evade["move_left"] > scores_evade["stay"]
    assert "Hazard imminent" in reason_evade

    # Scenario 2: Low collision risk -> stays straight
    low_hazard_answers = {
        "collision_imminent": {"type": "noul", "noul": 0.10},
        "left_lane_free": {"type": "noul", "noul": 0.50},
        "right_lane_free": {"type": "noul", "noul": 0.50},
    }
    scores_stay, reason_stay = qs.map_answers(low_hazard_answers, mock_legal_actions)
    assert pytest.approx(sum(scores_stay.values()), abs=1e-5) == 1.0
    assert scores_stay["stay"] > scores_stay["move_left"]
    assert "Path clear" in reason_stay


def test_v4_terse_state_compression(sample_state: dict[str, Any], mock_legal_actions: list[dict[str, str]]):
    """Verify v4_terse_state removes score and safe option noise."""
    raw_text = sample_state["state_text"]
    terse = V4TerseStateQuestionSet.compress_state_text(raw_text)

    assert "Current score" not in terse
    assert "Safe option(s)" not in terse
    assert len(terse.split()) < len(raw_text.split())
    assert "centre lane" in terse

    qs = V4TerseStateQuestionSet()
    fake_answers = {
        "safest_lane": {"type": "choice", "probabilities": {"left": 0.70, "centre": 0.20, "right": 0.10}},
        "blocked_lane": {"type": "choice", "probabilities": {"left": 0.10, "centre": 0.80, "right": 0.10, "none": 0.0}},
    }
    scores, reason = qs.map_answers(fake_answers, mock_legal_actions)
    assert pytest.approx(sum(scores.values()), abs=1e-5) == 1.0
    assert "Terse state formulation" in reason


def test_laya_engine_with_all_variants(sample_state: dict[str, Any]):
    """Verify that LayaEngine successfully executes decide() with all 4 variants."""
    class FakeVariantAgent:
        def predict(self, state: str, questions: dict[str, Any]) -> dict[str, Any]:
            answers = {}
            for q_id, q_def in questions.items():
                if q_def["type"] == "choice":
                    opts = list(q_def["criteria"].keys())
                    prob = 1.0 / len(opts)
                    answers[q_id] = {
                        "type": "choice",
                        "choice": opts[0],
                        "probabilities": {opt: prob for opt in opts},
                    }
                elif q_def["type"] == "noul":
                    answers[q_id] = {"type": "noul", "noul": 0.30}
            return {"model": "fake", "answers": answers}

    agent = FakeVariantAgent()
    variants = ["v1_perception", "v2_direct_action", "v3_hybrid_gates", "v4_terse_state"]

    for variant_id in variants:
        engine = LayaEngine(question_set=variant_id, agent=agent)
        decision = engine.decide(sample_state, sample_state["legal_actions"])

        assert decision.chosen_action in {a["id"] for a in sample_state["legal_actions"]}
        assert decision.question_set == variant_id
        assert pytest.approx(sum(decision.action_scores.values()), abs=1e-5) == 1.0
        assert len(decision.reason) > 0
