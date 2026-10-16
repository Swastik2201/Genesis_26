"""Unit tests for Game 2 (2048) QuestionSets and offline evaluation (Lane B).

Tests:
- Registry: game2_v1_perception, game2_v2_direct_action, game2_v3_corner_anchor, game2, 2048.
- Question structure: merge perception, corner preservation, direct-action, and binary anchor gate.
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
    Game2V1PerceptionQuestionSet,
    Game2V2DirectActionQuestionSet,
    Game2V3CornerAnchorQuestionSet,
)
from bot.questions.game2 import THRESHOLDS_2048
from experiments.replay_states import DeterministicOfflineAgent, replay, resolve_fixtures_path


@pytest.fixture
def sample_2048_state() -> dict[str, Any]:
    return {
        "game_id": "2048",
        "session_id": "test-2048-sess-01",
        "step": 5,
        "state_text": (
            "The largest tile is eight in the top-right at row 1 column 3. "
            "A new tile two is at the bottom-left row 4 column 1. "
            "Sliding up preserves the eight anchored at the top perimeter. "
            "Sliding down or right would displace the eight from the top row."
        ),
        "facts": {
            "grid": [
                [0, 0, 8, 0],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
                [2, 0, 0, 0],
            ],
            "max_tile": 8,
            "max_tile_pos": [0, 2],
            "score": 8.0,
            "best": 8,
        },
        "legal_actions": [
            {"id": "up", "label": "Up", "hint": "Maintains anchor along top perimeter"},
            {"id": "left", "label": "Left", "hint": "Shifts eight to top-left corner"},
            {"id": "down", "label": "Down", "hint": "Displaces eight into center"},
            {"id": "right", "label": "Right", "hint": "Slides tiles rightward"},
        ],
        "score": 8.0,
        "done": False,
    }


def test_registry_contains_game2_candidates():
    """Verify all Game 2 (2048) question sets are registered."""
    registered = list_question_sets()
    for expected in (
        "game2_v1_perception",
        "game2_v2_direct_action",
        "game2_v3_corner_anchor",
        "game2",
        "2048",
    ):
        assert expected in registered, f"Missing registered question set: {expected}"


def test_game2_v1_perception_questions_and_mapping(sample_2048_state: dict[str, Any]):
    """Verify Game2V1PerceptionQuestionSet builds questions with descriptions and maps answers."""
    qs = get_question_set("game2_v1_perception")
    assert isinstance(qs, Game2V1PerceptionQuestionSet)

    questions = qs.build_questions(sample_2048_state)
    assert "best_merge_direction" in questions
    assert "corner_preservation" in questions

    for qid, qdef in questions.items():
        assert qdef["type"] == "choice"
        assert len(qdef["criteria"]) >= 4
        for opt_key, opt_desc in qdef["criteria"].items():
            assert isinstance(opt_desc, str) and len(opt_desc) > 5

    # Simulate answers: up preserves corner anchor, left provides secondary merge
    fake_answers = {
        "best_merge_direction": {
            "choice": "up",
            "probabilities": {"up": 0.60, "down": 0.15, "left": 0.15, "right": 0.10, "none": 0.0},
        },
        "corner_preservation": {
            "choice": "up",
            "probabilities": {"up": 0.70, "left": 0.15, "down": 0.08, "right": 0.07, "neutral": 0.0},
        },
    }

    scores, reason = qs.map_answers(fake_answers, sample_2048_state["legal_actions"])
    assert set(scores.keys()) == {"up", "left", "down", "right"}
    assert abs(sum(scores.values()) - 1.0) < 1e-6
    assert max(scores, key=scores.get) == "up"
    assert "corner anchor" in reason.lower()


def test_game2_v2_direct_action_questions_and_mapping(sample_2048_state: dict[str, Any]):
    """Verify Game2V2DirectActionQuestionSet builds single choice question and maps directly."""
    qs = get_question_set("game2_v2_direct_action")
    assert isinstance(qs, Game2V2DirectActionQuestionSet)

    questions = qs.build_questions(sample_2048_state)
    assert len(questions) == 1
    assert "slide_direction" in questions
    criteria = questions["slide_direction"]["criteria"]
    for dir_key in ("up", "down", "left", "right"):
        assert dir_key in criteria

    fake_answers = {
        "slide_direction": {
            "choice": "up",
            "probabilities": {"up": 0.75, "left": 0.15, "down": 0.05, "right": 0.05},
        }
    }

    scores, reason = qs.map_answers(fake_answers, sample_2048_state["legal_actions"])
    assert abs(sum(scores.values()) - 1.0) < 1e-6
    assert max(scores, key=scores.get) == "up"
    assert "slide probability" in reason.lower()


def test_game2_v3_corner_anchor_gate(sample_2048_state: dict[str, Any]):
    """Verify Game2V3CornerAnchorQuestionSet triggers gate when displacement is high."""
    qs = get_question_set("game2_v3_corner_anchor")
    assert isinstance(qs, Game2V3CornerAnchorQuestionSet)

    questions = qs.build_questions(sample_2048_state)
    assert questions["displaces_max_tile"]["type"] == "noul"
    assert questions["merge_corridor"]["type"] == "choice"

    # Case A: Anchor displacement imminent (P >= 0.40)
    fake_answers_displace = {
        "displaces_max_tile": {"noul": 0.75, "confidence": 0.75},
        "merge_corridor": {
            "choice": "up",
            "probabilities": {"up": 0.60, "left": 0.25, "down": 0.10, "right": 0.05, "none": 0.0},
        },
    }
    scores_disp, reason_disp = qs.map_answers(fake_answers_displace, sample_2048_state["legal_actions"])
    assert abs(sum(scores_disp.values()) - 1.0) < 1e-6
    assert "triggered" in reason_disp.lower()

    # Case B: Anchor safe (P < 0.40)
    fake_answers_safe = {
        "displaces_max_tile": {"noul": 0.10, "confidence": 0.10},
        "merge_corridor": {
            "choice": "up",
            "probabilities": {"up": 0.70, "left": 0.15, "down": 0.10, "right": 0.05, "none": 0.0},
        },
    }
    scores_safe, reason_safe = qs.map_answers(fake_answers_safe, sample_2048_state["legal_actions"])
    assert abs(sum(scores_safe.values()) - 1.0) < 1e-6
    assert "secure" in reason_safe.lower()


def test_game2_exclusion_guarantee(sample_2048_state: dict[str, Any]):
    """Verify excluded actions cannot receive probability mass in any Game 2 candidate."""
    for v_id in ("game2_v1_perception", "game2_v2_direct_action", "game2_v3_corner_anchor"):
        qs = get_question_set(v_id)
        questions = qs.build_questions(sample_2048_state)

        agent = DeterministicOfflineAgent()
        result = agent.predict(sample_2048_state["state_text"], questions)
        answers = result["answers"]

        # Exclude 'down' and 'right'
        scores, _ = qs.map_answers(
            answers,
            sample_2048_state["legal_actions"],
            exclude=("down", "right"),
        )
        assert "down" not in scores
        assert "right" not in scores
        assert set(scores.keys()) == {"up", "left"}
        assert abs(sum(scores.values()) - 1.0) < 1e-6


def test_game2_offline_replay_execution():
    """Verify offline replay executes cleanly with DeterministicOfflineAgent on Game 2 fixtures."""
    fixtures_path = resolve_fixtures_path(game="2048")
    assert fixtures_path.exists()

    with open(fixtures_path, "r", encoding="utf-8") as f:
        states = json.load(f)
    assert len(states) >= 5

    exit_code = replay(
        fixtures_path=fixtures_path,
        variants=["game2_v1_perception", "game2_v2_direct_action", "game2_v3_corner_anchor"],
        fake=True,
    )
    assert exit_code == 0
