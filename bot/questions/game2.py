"""Question formulation sets for Game 2: 2048 (Lane B).

This module implements three candidate QuestionSet strategies for 2048:
1. game2_v1_perception: Perception-first strategy evaluating merge availability
   and corner preservation, mapped via monotonicity weighting.
2. game2_v2_direct_action: Direct-action control asking the model which slide direction to choose.
3. game2_v3_corner_anchor: Binary anchor stability gate combined with merge density choice.

Hypotheses are documented in the respective class docstrings.
"""

from __future__ import annotations

import re
from typing import Any

from bot.questions.base import QuestionSet

DIRECTIONS_2048 = ("up", "down", "left", "right")

THRESHOLDS_2048: dict[str, float] = {
    "anchor_displacement_gate": 0.40,  # P(displaces_anchor) >= 0.40 suppresses move
    "corner_weight_exponent": 1.5,     # Exponent scaling for corner preservation
    "merge_bonus_weight": 1.25,        # Multiplier for merge availability bonus
    "min_action_floor": 0.05,          # Minimum probability floor
}


# ===========================================================================
# Candidate 1: Perception-First (Merge Potential & Corner Stability)
# ===========================================================================

class Game2V1PerceptionQuestionSet(QuestionSet):
    """Candidate 1: Perception-first question set for 2048.

    HYPOTHESIS:
    Laya achieves superior 2048 play when answering perceptual questions about
    board structure — (1) which direction produces the most high-value tile merges,
    and (2) which direction preserves the largest tile pinned securely in its corner —
    rather than guessing moves directly. Mapping these factual perceptions into action
    scores via code prevents dislodging high-value tiles and sustains monotonicity.
    """

    id = "game2_v1_perception"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct perception questions evaluating merge potential and corner preservation."""
        return {
            "best_merge_direction": {
                "type": "choice",
                "instructions": (
                    "Looking at the 4x4 tile board, which sliding direction merges adjacent "
                    "equal-value tiles to create the largest consolidated values?"
                ),
                "criteria": {
                    "up": "Sliding upward merges adjacent equal tiles vertically",
                    "down": "Sliding downward merges adjacent equal tiles vertically",
                    "left": "Sliding leftward merges adjacent equal tiles horizontally",
                    "right": "Sliding rightward merges adjacent equal tiles horizontally",
                    "none": "No direction provides immediate adjacent tile merges",
                },
            },
            "corner_preservation": {
                "type": "choice",
                "instructions": (
                    "Which slide direction best keeps the board's largest tile securely anchored "
                    "in its corner or edge without displacing it toward the open center?"
                ),
                "criteria": {
                    "up": "Sliding upward preserves top-edge or top-corner alignment",
                    "down": "Sliding downward preserves bottom-edge or bottom-corner alignment",
                    "left": "Sliding leftward preserves left-edge or left-corner alignment",
                    "right": "Sliding rightward preserves right-edge or right-corner alignment",
                    "neutral": "All slide directions maintain similar anchor stability",
                },
            },
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map merge and corner perception probabilities to legal actions."""
        exclude_set = {str(x).lower() for x in exclude}
        eligible = [a["id"] for a in legal_actions if str(a["id"]).lower() not in exclude_set]

        merge_ans = answers.get("best_merge_direction", {})
        merge_probs = merge_ans.get("probabilities", {}) if isinstance(merge_ans, dict) else {}

        corner_ans = answers.get("corner_preservation", {})
        corner_probs = corner_ans.get("probabilities", {}) if isinstance(corner_ans, dict) else {}

        dir_scores: dict[str, float] = {}
        for d in DIRECTIONS_2048:
            p_corner = float(corner_probs.get(d, 0.25))
            p_merge = float(merge_probs.get(d, 0.0))

            corner_factor = max(THRESHOLDS_2048["min_action_floor"], p_corner) ** THRESHOLDS_2048["corner_weight_exponent"]
            merge_factor = 1.0 + (THRESHOLDS_2048["merge_bonus_weight"] * p_merge)
            dir_scores[d] = corner_factor * merge_factor

        scores: dict[str, float] = {}
        for aid in eligible:
            aid_lower = str(aid).lower()
            scores[aid] = dir_scores.get(aid_lower, 0.1)

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        best_dir = max(scores, key=scores.get) if scores else "left"
        c_p = corner_probs.get(best_dir.lower(), 0.0)
        m_p = merge_probs.get(best_dir.lower(), 0.0)
        reason = (
            f"Perception identified '{best_dir}' preserving corner anchor (p={c_p:.2f}) "
            f"with tile merge advantage (p={m_p:.2f})."
        )
        return scores, reason


# ===========================================================================
# Candidate 2: Direct-Action Control
# ===========================================================================

class Game2V2DirectActionQuestionSet(QuestionSet):
    """Candidate 2: Direct-action control for 2048.

    HYPOTHESIS (Control):
    Asking Laya directly 'Which direction should we slide the 2048 tiles next?'
    forces the model to act as a monolithic strategic planner. We hypothesize
    direct action will prematurely swipe away from the corner anchor, leading
    to board clutter and early game-over compared to perception-guided mapping.
    """

    id = "game2_v2_direct_action"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct a single direct-action choice question over slide moves."""
        return {
            "slide_direction": {
                "type": "choice",
                "instructions": (
                    "Which directional slide should be executed on the 2048 board to maximize "
                    "merges and build toward the 2048 tile?"
                ),
                "criteria": {
                    "up": "Slide all tiles upward toward the top boundary",
                    "down": "Slide all tiles downward toward the bottom boundary",
                    "left": "Slide all tiles leftward toward the left boundary",
                    "right": "Slide all tiles rightward toward the right boundary",
                },
            }
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map direct action choice probabilities to eligible legal actions."""
        exclude_set = {str(x).lower() for x in exclude}
        eligible = [a["id"] for a in legal_actions if str(a["id"]).lower() not in exclude_set]

        slide_ans = answers.get("slide_direction", {})
        slide_probs = slide_ans.get("probabilities", {}) if isinstance(slide_ans, dict) else {}

        scores: dict[str, float] = {}
        for aid in eligible:
            aid_lower = str(aid).lower()
            scores[aid] = float(slide_probs.get(aid_lower, 0.1))

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        best_act = max(scores, key=scores.get) if scores else "left"
        conf = scores.get(best_act, 0.0)
        reason = f"Direct action chose '{best_act}' with slide probability {conf:.2f}."
        return scores, reason


# ===========================================================================
# Candidate 3: Binary Anchor Stability Gate
# ===========================================================================

class Game2V3CornerAnchorQuestionSet(QuestionSet):
    """Candidate 3: Binary anchor stability gate with merge routing for 2048.

    HYPOTHESIS:
    Using a binary gate to test whether a move displaces the anchor tile
    ('displaces_max_tile': noul) combined with a merge-density question yields
    the highest tile values. Strictly penalizing any move that moves the highest
    tile away from the anchor edge guarantees board monotonicity.
    """

    id = "game2_v3_corner_anchor"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct binary anchor preservation gate and merge choice questions."""
        return {
            "displaces_max_tile": {
                "type": "noul",
                "instructions": (
                    "Does sliding in the prospective direction displace or dislodge the board's "
                    "largest tile from its primary outer corner or edge position?"
                ),
                "criteria": {
                    "false": "Largest tile remains securely locked on the outer perimeter",
                    "true": "Largest tile will shift inward toward center, breaking corner monotonicity",
                },
            },
            "merge_corridor": {
                "type": "choice",
                "instructions": (
                    "Which slide direction yields the cleanest tile consolidation along the "
                    "perimeter rows or columns?"
                ),
                "criteria": {
                    "up": "Consolidating tiles upward along columns",
                    "down": "Consolidating tiles downward along columns",
                    "left": "Consolidating tiles leftward along rows",
                    "right": "Consolidating tiles rightward along rows",
                    "none": "No immediate consolidation available",
                },
            },
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map binary anchor gate and merge choice into legal action scores."""
        exclude_set = {str(x).lower() for x in exclude}
        eligible = [a["id"] for a in legal_actions if str(a["id"]).lower() not in exclude_set]

        disp_ans = answers.get("displaces_max_tile", {})
        if isinstance(disp_ans, dict):
            p_displace = float(disp_ans.get("noul", disp_ans.get("confidence", 0.0)))
        else:
            p_displace = 0.0

        corridor_ans = answers.get("merge_corridor", {})
        corridor_probs = corridor_ans.get("probabilities", {}) if isinstance(corridor_ans, dict) else {}

        gate_threshold = THRESHOLDS_2048["anchor_displacement_gate"]
        displaces_anchor = p_displace >= gate_threshold

        scores: dict[str, float] = {}
        for aid in eligible:
            aid_lower = str(aid).lower()
            p_corr = float(corridor_probs.get(aid_lower, 0.1))

            if displaces_anchor:
                # Disfavored direction penalized
                scores[aid] = max(0.01, p_corr * 0.1)
            else:
                scores[aid] = max(0.05, p_corr)

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        best_act = max(scores, key=scores.get) if scores else "left"
        if displaces_anchor:
            reason = (
                f"Anchor gate triggered (P(displace)={p_displace:.2f} >= {gate_threshold:.2f}); "
                f"diverted to '{best_act}' to maintain corner lock."
            )
        else:
            reason = (
                f"Anchor gate secure (P(displace)={p_displace:.2f}); "
                f"sliding '{best_act}' for tile consolidation."
            )
        return scores, reason
