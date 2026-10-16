"""Question formulation sets for Game 1: Snake (Lane B).

This module implements three candidate QuestionSet strategies for the Snake game:
1. game1_v1_perception: Perception-first strategy asking about obstacle-free space
   and food alignment, mapped via safety-weighted code logic.
2. game1_v2_direct_action: Direct-action control asking the model which move to make.
3. game1_v3_hazard_gates: Binary hazard gate combined with turn selection.

Hypotheses are documented in the respective class docstrings.
"""

from __future__ import annotations

import re
from typing import Any

from bot.questions.base import QuestionSet

# Cardinal directions canonical in Snake
DIRECTIONS = ("up", "down", "left", "right")

# Threshold configuration for binary hazard gating
THRESHOLDS: dict[str, float] = {
    "collision_hazard_gate": 0.40,  # P(collision_ahead) >= 0.40 triggers evasive turn
    "min_safety_floor": 0.05,       # Minimum probability floor for eligible actions
    "safety_exponent": 1.6,         # Exponent scaling for perception safety weighting
    "food_bonus_weight": 1.25,      # Multiplier for food alignment bonus
}


# ===========================================================================
# Candidate 1: Perception-First (Safety & Food Alignment)
# ===========================================================================

class Game1V1PerceptionQuestionSet(QuestionSet):
    """Candidate 1: Perception-first question set for Snake.

    HYPOTHESIS:
    Laya excels at spatial perception (identifying safe corridors and target
    directions) rather than direct move decisions. By posing two focused
    perception questions — 'safest_direction' (which adjacent tile is completely
    free of walls and snake body) and 'food_direction' (which cardinal direction
    moves closer to the food) — and deterministically weighting safety over target
    attraction in code (so a dangerous move is never chosen even if it aligns with food),
    the agent avoids fatal collisions and systematically reaches food.
    """

    id = "game1_v1_perception"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct perception questions evaluating directional safety and food orientation."""
        return {
            "safest_direction": {
                "type": "choice",
                "instructions": (
                    "Looking at the snake head's immediate adjacent tiles and obstacles, "
                    "which direction is completely open and clear of any wall or snake body?"
                ),
                "criteria": {
                    "up": "The tile above (up) is open and free of obstacles",
                    "down": "The tile below (down) is open and free of obstacles",
                    "left": "The tile to the left is open and free of obstacles",
                    "right": "The tile to the right is open and free of obstacles",
                    "none": "No adjacent tile is completely clear",
                },
            },
            "food_direction": {
                "type": "choice",
                "instructions": (
                    "Based on the relative location of the food, which cardinal direction "
                    "moves our snake head closer to the food target?"
                ),
                "criteria": {
                    "up": "Moving upward reduces vertical distance to the food",
                    "down": "Moving downward reduces vertical distance to the food",
                    "left": "Moving leftward reduces horizontal distance to the food",
                    "right": "Moving rightward reduces horizontal distance to the food",
                    "none": "Food is not directly reachable in any single direction",
                },
            },
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map perception probabilities to legal actions using safety-gated weighting."""
        exclude_set = {str(x).lower() for x in exclude}
        eligible = [a["id"] for a in legal_actions if str(a["id"]).lower() not in exclude_set]

        # Extract answer probabilities
        safe_ans = answers.get("safest_direction", {})
        safe_probs = safe_ans.get("probabilities", {}) if isinstance(safe_ans, dict) else {}

        food_ans = answers.get("food_direction", {})
        food_probs = food_ans.get("probabilities", {}) if isinstance(food_ans, dict) else {}

        # Raw directional scores: safety is the primary power, food provides additive bonus
        dir_scores: dict[str, float] = {}
        for d in DIRECTIONS:
            p_safe = float(safe_probs.get(d, 0.25))
            p_food = float(food_probs.get(d, 0.0))

            # Safety weighting with non-linear scaling
            safety_factor = max(THRESHOLDS["min_safety_floor"], p_safe) ** THRESHOLDS["safety_exponent"]
            food_factor = 1.0 + (THRESHOLDS["food_bonus_weight"] * p_food)
            dir_scores[d] = safety_factor * food_factor

        # Map to eligible legal actions
        scores: dict[str, float] = {}
        for aid in eligible:
            aid_lower = str(aid).lower()
            scores[aid] = dir_scores.get(aid_lower, 0.1)

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        best_dir = max(scores, key=scores.get) if scores else "up"
        safe_p = safe_probs.get(best_dir.lower(), 0.0)
        food_p = food_probs.get(best_dir.lower(), 0.0)
        reason = (
            f"Perception identified '{best_dir}' as safest (p_safe={safe_p:.2f}) "
            f"with food orientation (p_food={food_p:.2f})."
        )
        return scores, reason


# ===========================================================================
# Candidate 2: Direct-Action Control
# ===========================================================================

class Game1V2DirectActionQuestionSet(QuestionSet):
    """Candidate 2: Direct-action control for Snake.

    HYPOTHESIS (Control):
    Asking Laya directly 'Which move should the snake make next?' forces the
    model to act as a monolithic strategic planner. We hypothesize this direct-action
    control will underperform perception-based question sets when navigating tight
    corners and near walls, because Laya's attention conflates immediate food seeking
    with boundary hazard avoidance.
    """

    id = "game1_v2_direct_action"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct a single direct-action choice question over moves."""
        return {
            "next_move": {
                "type": "choice",
                "instructions": (
                    "Which directional move should the snake execute right now to safely "
                    "survive and navigate toward food?"
                ),
                "criteria": {
                    "up": "Move up into the adjacent tile above",
                    "down": "Move down into the adjacent tile below",
                    "left": "Move left into the adjacent tile to the left",
                    "right": "Move right into the adjacent tile to the right",
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

        move_ans = answers.get("next_move", {})
        move_probs = move_ans.get("probabilities", {}) if isinstance(move_ans, dict) else {}

        scores: dict[str, float] = {}
        for aid in eligible:
            aid_lower = str(aid).lower()
            scores[aid] = float(move_probs.get(aid_lower, 0.1))

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        best_act = max(scores, key=scores.get) if scores else "up"
        conf = scores.get(best_act, 0.0)
        reason = f"Direct action chose '{best_act}' with direct probability {conf:.2f}."
        return scores, reason


# ===========================================================================
# Candidate 3: Binary Hazard Gates & Turn Selection
# ===========================================================================

class Game1V3HazardGatesQuestionSet(QuestionSet):
    """Candidate 3: Binary hazard gating with turn selection for Snake.

    HYPOTHESIS:
    Binary 'noul' questions produce sharper probability distributions and lower
    calibration error than multi-choice questions. By evaluating:
    (1) 'collision_ahead': whether maintaining current forward heading causes an immediate collision, and
    (2) 'safest_turn': choice among valid turn directions for open territory,
    an explicit threshold gate on collision risk (e.g. P(collision) >= 0.40) provides decisive
    evasive behavior when approaching walls or body segments while preserving straight-line cruising.
    """

    id = "game1_v3_hazard_gates"

    def __init__(self, qid: str | None = None) -> None:
        super().__init__(qid)
        self._last_heading: str | None = None

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct binary hazard gate and turn selection questions."""
        self._last_heading = self._infer_current_heading(state)
        return {
            "collision_ahead": {
                "type": "noul",
                "instructions": (
                    "Is there an immediate collision with a wall or snake body if the snake "
                    "continues moving in its current heading?"
                ),
                "criteria": {
                    "false": "Path directly ahead is open and safe to proceed straight",
                    "true": "Imminent collision ahead: continuing straight will hit a wall or body segment",
                },
            },
            "safest_turn": {
                "type": "choice",
                "instructions": (
                    "Considering all possible turns, which turn direction provides the clearest "
                    "corridor towards open space and food?"
                ),
                "criteria": {
                    "up": "Turning upward into open clear territory",
                    "down": "Turning downward into open clear territory",
                    "left": "Turning leftward into open clear territory",
                    "right": "Turning rightward into open clear territory",
                    "straight": "Maintaining current straight path without turning is preferred",
                },
            },
        }

    def _infer_current_heading(self, state: dict[str, Any] | str) -> str | None:
        """Helper to extract current heading from state text or facts."""
        if isinstance(state, dict):
            facts = state.get("facts", {})
            if isinstance(facts, dict) and "direction" in facts:
                return str(facts["direction"]).lower()
            text = str(state.get("state_text", "")).lower()
        else:
            text = str(state).lower()

        # Match "moving right", "moving up", etc.
        m = re.search(r"moving\s+(up|down|left|right)", text)
        if m:
            return m.group(1)
        return None

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map binary hazard gate and turn choice into legal action scores."""
        exclude_set = {str(x).lower() for x in exclude}
        eligible = [a["id"] for a in legal_actions if str(a["id"]).lower() not in exclude_set]

        # Extract hazard probability
        haz_ans = answers.get("collision_ahead", {})
        if isinstance(haz_ans, dict):
            p_hazard = float(haz_ans.get("noul", haz_ans.get("confidence", 0.0)))
        else:
            p_hazard = 0.0

        # Extract turn probabilities
        turn_ans = answers.get("safest_turn", {})
        turn_probs = turn_ans.get("probabilities", {}) if isinstance(turn_ans, dict) else {}

        # Check if collision gate is breached
        gate_threshold = THRESHOLDS["collision_hazard_gate"]
        collision_imminent = p_hazard >= gate_threshold

        scores: dict[str, float] = {}
        for aid in eligible:
            aid_lower = str(aid).lower()
            p_turn = float(turn_probs.get(aid_lower, 0.1))

            if collision_imminent:
                # Evasive routing: heavily suppress the straight heading that triggered collision
                if self._last_heading and aid_lower == self._last_heading:
                    scores[aid] = max(0.01, p_turn * 0.05)
                else:
                    scores[aid] = max(0.05, p_turn)
            else:
                # Normal cruising: blend turn preference with straight continuation
                p_straight = float(turn_probs.get("straight", 0.3))
                if self._last_heading and aid_lower == self._last_heading:
                    scores[aid] = p_turn + (1.2 * p_straight)
                else:
                    scores[aid] = p_turn

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        best_act = max(scores, key=scores.get) if scores else "up"
        if collision_imminent:
            reason = (
                f"Hazard gate triggered (P(collision)={p_hazard:.2f} >= {gate_threshold:.2f}); "
                f"executed evasive turn '{best_act}'."
            )
        else:
            reason = (
                f"Hazard gate clear (P(collision)={p_hazard:.2f}); "
                f"navigating '{best_act}' towards open corridor."
            )
        return scores, reason
