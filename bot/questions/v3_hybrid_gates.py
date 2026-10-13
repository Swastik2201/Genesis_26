"""Variant 3: Hybrid binary-gate question set (Lane B).

HYPOTHESIS:
Binary "noul" (yes/no) gates provide sharper, better-calibrated probability
estimates than multi-class choice questions for hazard detection.
Combining an imminent collision gate with directional escape gates
using explicit configurable thresholds delivers robust obstacle evasion.
"""

from __future__ import annotations

from typing import Any

from bot.questions.base import QuestionSet


# Explicit decision thresholds chosen for binary risk gating
THRESHOLDS: dict[str, float] = {
    "collision_gate": 0.50,       # Probability above which evasive action is mandatory
    "lane_free_threshold": 0.35,   # Minimum probability required to deem an escape lane safe
    "stay_bonus": 0.25,           # Preference weight for staying straight when collision probability is low
}


class V3HybridGatesQuestionSet(QuestionSet):
    """Hybrid gating question set using noul binary decision gates."""

    id = "v3_hybrid_gates"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct binary noul gates evaluating collision risk and lane availability."""
        return {
            "collision_imminent": {
                "type": "noul",
                "instructions": "Is an obstacle directly ahead and a collision about to happen if we maintain our current lane?",
                "criteria": {
                    "false": "Current lane is safe or clear to continue straight",
                    "true": "An obstacle is directly ahead and collision will occur if we do not steer away",
                },
            },
            "left_lane_free": {
                "type": "noul",
                "instructions": "Is the left lane open and safe to steer into?",
                "criteria": {
                    "false": "Left lane is blocked by an obstacle or no left lane exists (wall)",
                    "true": "Left lane is open, clear, and safe to enter",
                },
            },
            "right_lane_free": {
                "type": "noul",
                "instructions": "Is the right lane open and safe to steer into?",
                "criteria": {
                    "false": "Right lane is blocked by an obstacle or no right lane exists (wall)",
                    "true": "Right lane is open, clear, and safe to enter",
                },
            },
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map binary gate probabilities through threshold logic."""
        exclude_set = set(exclude)
        eligible = [a["id"] for a in legal_actions if a["id"] not in exclude_set]

        # Extract noul probabilities (P(true))
        def _get_noul(key: str) -> float:
            entry = answers.get(key, {})
            if isinstance(entry, dict):
                return float(entry.get("noul", entry.get("confidence", 0.5)))
            return 0.5

        p_collision = _get_noul("collision_imminent")
        p_left_free = _get_noul("left_lane_free")
        p_right_free = _get_noul("right_lane_free")

        # Directional weights based on gating logic
        scores: dict[str, float] = {}

        if p_collision >= THRESHOLDS["collision_gate"]:
            # Hazard detected: prioritize escape lanes
            left_weight = p_left_free if p_left_free >= THRESHOLDS["lane_free_threshold"] else 0.05
            right_weight = p_right_free if p_right_free >= THRESHOLDS["lane_free_threshold"] else 0.05
            stay_weight = max(0.01, 1.0 - p_collision)
            reason_state = f"Hazard imminent (p_collision={p_collision:.2f} >= {THRESHOLDS['collision_gate']:.2f}); evading to clearest lane."
        else:
            # Safe to stay: add bias to straight/stay
            stay_weight = (1.0 - p_collision) + THRESHOLDS["stay_bonus"]
            left_weight = p_left_free * 0.4
            right_weight = p_right_free * 0.4
            reason_state = f"Path clear (p_collision={p_collision:.2f} < {THRESHOLDS['collision_gate']:.2f}); maintaining lane."

        mapping = {
            "move_left": left_weight,
            "left": left_weight,
            "stay": stay_weight,
            "straight": stay_weight,
            "move_right": right_weight,
            "right": right_weight,
        }

        for aid in eligible:
            scores[aid] = mapping.get(aid, 0.1)

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        top_act = max(scores, key=scores.get) if scores else "stay"
        reason = f"{reason_state} Chose '{top_act}'."
        return scores, reason
