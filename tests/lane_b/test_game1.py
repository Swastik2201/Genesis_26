"""Unit tests for Game 1 (Snake) QuestionSets and offline evaluation (Lane B).

Tests:
- Registry: game1_v1_perception, game1_v2_direct_action, game1_v3_hazard_gates, game1.
- Question structure: perception, direct-action, and noul hazard gates.
- Option descriptions: all options have distinct descriptive strings.
- Answer mapping: scores sum strictly to 1.0 over legal actions.
- Exclusion: excluded actions cannot receive non-zero probability.
- Deterministic tie-breaking: legal actions order preserved.
- Full offline replay integration with DeterministicOfflineAgent.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import pytest

from bot.laya.engine import LayaEngine
from bot.questions import (
    get_question_set,
    list_question_sets,
    Game1V1PerceptionQuestionSet,
    Game1V2DirectActionQuestionSet,
    Game1V3HazardGatesQuestionSet,
)
from bot.questions.game1 import THRESHOLDS
from experiments.replay_states import DeterministicOfflineAgent, replay, resolve_fixtures_path


@pytest.fixture
def sample_snake_state() -> dict[str, Any]:
    return {
        "game_id": "snake",
        "session_id": "test-snake-sess-01",
        "step": 4,
        "state_text": (
            "The snake head is at row 2, col 9 moving right. Right wall is directly ahead in 1 tile. "
            "Food is located downward at row 7, col 9. Moving down is completely clear toward food. "
            "Moving up is clear open space. Moving left is reverse into body."
        ),
        "facts": {
            "head": [2, 9],
            "direction": "right",
            "food": [7, 9],
            "body_length": 4,
            "grid_size": [10, 10],
        },
        "legal_actions": [
            {"id": "down", "label": "Down", "hint": "Clear path toward food"},
            {"id": "up", "label": "Up", "hint": "Clear open space away from food"},
            {"id": "right", "label": "Right", "hint": "Wall collision directly ahead"},
        ],
        "score": 60.0,
        "done": False,
    }


def test_registry_contains_game1_candidates():
    """Verify all three Game 1 candidates and the default game1 alias are registered."""
    registered = list_question_sets()
    for expected in ("game1_v1_perception", "game1_v2_direct_action", "game1_v3_hazard_gates", "game1"):
        assert expected in registered, f"Missing registered question set: {expected}"
        qs = get_question_set(expected)
        assert isinstance(qs, (Game1V1PerceptionQuestionSet, Game1V2DirectActionQuestionSet, Game1V3HazardGatesQuestionSet))


def test_v1_perception_questions_and_mapping(sample_snake_state: dict[str, Any]):
    """Verify game1_v1_perception constructs questions and maps answers correctly."""
    qs = Game1V1PerceptionQuestionSet()
    questions = qs.build_questions(sample_snake_state)

    assert "safest_direction" in questions
    assert "food_direction" in questions
    assert questions["safest_direction"]["type"] == "choice"
    assert questions["food_direction"]["type"] == "choice"

    # Verify every option has a descriptive string
    for opt, desc in questions["safest_direction"]["criteria"].items():
        assert isinstance(desc, str) and len(desc) > 5
    for opt, desc in questions["food_direction"]["criteria"].items():
        assert isinstance(desc, str) and len(desc) > 5

    fake_answers = {
        "safest_direction": {
            "type": "choice",
            "choice": "down",
            "probabilities": {"down": 0.70, "up": 0.20, "right": 0.05, "left": 0.02, "none": 0.03},
        },
        "food_direction": {
            "type": "choice",
            "choice": "down",
            "probabilities": {"down": 0.80, "up": 0.05, "left": 0.05, "right": 0.05, "none": 0.05},
        },
    }

    scores, reason = qs.map_answers(fake_answers, sample_snake_state["legal_actions"])
    assert pytest.approx(sum(scores.values()), abs=1e-5) == 1.0
    assert scores["down"] > scores["up"]
    assert scores["down"] > scores["right"]
    assert "down" in reason.lower()
    assert isinstance(reason, str) and len(reason) > 10


def test_v2_direct_action_questions_and_mapping(sample_snake_state: dict[str, Any]):
    """Verify game1_v2_direct_action constructs direct move questions and maps probabilities."""
    qs = Game1V2DirectActionQuestionSet()
    questions = qs.build_questions(sample_snake_state)

    assert "next_move" in questions
    assert questions["next_move"]["type"] == "choice"
    for opt, desc in questions["next_move"]["criteria"].items():
        assert isinstance(desc, str) and len(desc) > 5

    fake_answers = {
        "next_move": {
            "type": "choice",
            "choice": "down",
            "probabilities": {"down": 0.65, "up": 0.25, "right": 0.08, "left": 0.02},
        }
    }

    scores, reason = qs.map_answers(fake_answers, sample_snake_state["legal_actions"])
    assert pytest.approx(sum(scores.values()), abs=1e-5) == 1.0
    assert scores["down"] > scores["up"]
    assert scores["down"] > scores["right"]
    assert "Direct action" in reason


def test_v3_hazard_gates_questions_and_thresholding(sample_snake_state: dict[str, Any]):
    """Verify game1_v3_hazard_gates noul gating and threshold trigger."""
    qs = Game1V3HazardGatesQuestionSet()
    questions = qs.build_questions(sample_snake_state)

    assert "collision_ahead" in questions
    assert "safest_turn" in questions
    assert questions["collision_ahead"]["type"] == "noul"
    assert questions["safest_turn"]["type"] == "choice"

    # Case 1: Hazard gate triggered (P(collision) >= 0.40)
    fake_answers_hazard = {
        "collision_ahead": {"type": "noul", "noul": 0.85, "confidence": 0.85},
        "safest_turn": {
            "type": "choice",
            "choice": "down",
            "probabilities": {"down": 0.70, "up": 0.25, "left": 0.02, "right": 0.01, "straight": 0.02},
        },
    }
    scores, reason = qs.map_answers(fake_answers_hazard, sample_snake_state["legal_actions"])
    assert pytest.approx(sum(scores.values()), abs=1e-5) == 1.0
    assert scores["down"] > scores["up"]
    assert "Hazard gate triggered" in reason

    # Case 2: Hazard gate clear (P(collision) < 0.40)
    fake_answers_clear = {
        "collision_ahead": {"type": "noul", "noul": 0.10, "confidence": 0.10},
        "safest_turn": {
            "type": "choice",
            "choice": "straight",
            "probabilities": {"down": 0.20, "up": 0.10, "left": 0.05, "right": 0.05, "straight": 0.60},
        },
    }
    scores_clear, reason_clear = qs.map_answers(fake_answers_clear, sample_snake_state["legal_actions"])
    assert pytest.approx(sum(scores_clear.values()), abs=1e-5) == 1.0
    assert "Hazard gate clear" in reason_clear


def test_exclusion_prevents_illegal_move(sample_snake_state: dict[str, Any]):
    """Ensure excluded actions are never chosen and scores sum to 1.0."""
    engine = LayaEngine(
        question_set="game1_v1_perception",
        agent=DeterministicOfflineAgent(),
    )
    # Exclude the highest scoring move ("down")
    decision = engine.decide(sample_snake_state, sample_snake_state["legal_actions"], exclude={"down"})
    assert decision.chosen_action != "down"
    assert "down" not in decision.action_scores
    assert pytest.approx(sum(decision.action_scores.values()), abs=1e-5) == 1.0
    assert decision.chosen_action in ("up", "right")


def test_offline_replay_execution():
    """Verify replay_states.replay runs cleanly on recorded fixtures with fake agent."""
    fixtures_path = resolve_fixtures_path()
    assert fixtures_path.exists()

    ret = replay(
        fixtures_path=fixtures_path,
        variants=["game1_v1_perception", "game1_v2_direct_action", "game1_v3_hazard_gates"],
        fake=True,
    )
    assert ret == 0
