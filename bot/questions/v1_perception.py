"""Variant 1: Perception-first question set (Lane B).

HYPOTHESIS:
Laya performs best when evaluating factual perception questions about the
environment ("Which lane is safest?", "Which lane is blocked?") rather than
making strategic move choices directly. Mapping perception probabilities into
actions via deterministic code logic will outperform direct action selection.
"""

from __future__ import annotations

from typing import Any

from bot.questions.base import QuestionSet


class V1PerceptionQuestionSet(QuestionSet):
    """Perception-first question set for 3-lane runner."""

    id = "v1_perception"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct perception questions evaluating lane safety and obstacle presence."""
        return {
            "safest_lane": {
                "type": "choice",
                "instructions": "Based on the obstacle descriptions, which lane is the safest and clearest to occupy?",
                "criteria": {
                    "left": "The left lane is open and free of immediate hazards",
                    "centre": "The centre (straight) lane is open and free of immediate hazards",
                    "right": "The right lane is open and free of immediate hazards",
                },
            },
            "blocked_lane": {
                "type": "choice",
                "instructions": "Which lane has the most imminent obstacle or critical hazard?",
                "criteria": {
                    "left": "The left lane contains an imminent obstacle",
                    "centre": "The centre (straight) lane contains an imminent obstacle",
                    "right": "The right lane contains an imminent obstacle",
                    "none": "No lane has an immediate hazard",
                },
            },
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map perception probabilities to legal actions using a safety weighting table."""
        exclude_set = set(exclude)
        eligible = [a["id"] for a in legal_actions if a["id"] not in exclude_set]

        # Extract answer probabilities
        safe_ans = answers.get("safest_lane", {})
        safe_probs = safe_ans.get("probabilities", {}) if isinstance(safe_ans, dict) else {}

        block_ans = answers.get("blocked_lane", {})
        block_probs = block_ans.get("probabilities", {}) if isinstance(block_ans, dict) else {}

        # Raw scores for each canonical lane
        # score(lane) = P(safe, lane) * (1 - P(blocked, lane))
        lane_scores: dict[str, float] = {}
        for lane in ("left", "centre", "right"):
            p_safe = float(safe_probs.get(lane, 0.333))
            p_block = float(block_probs.get(lane, 0.0))
            lane_scores[lane] = max(0.01, p_safe * (1.0 - p_block))

        # Map canonical lanes to action identifiers
        # Handles both mock_game ("move_left", "stay", "move_right") and runner ("left", "straight", "right")
        action_mapping = {
            "move_left": lane_scores["left"],
            "left": lane_scores["left"],
            "stay": lane_scores["centre"],
            "straight": lane_scores["centre"],
            "move_right": lane_scores["right"],
            "right": lane_scores["right"],
        }

        scores: dict[str, float] = {}
        for aid in eligible:
            scores[aid] = action_mapping.get(aid, 0.1)

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        top_lane = max(lane_scores, key=lane_scores.get)
        reason = f"Perception identified the {top_lane} lane as safest (p_safe={safe_probs.get(top_lane, 0.0):.2f})."
        return scores, reason
