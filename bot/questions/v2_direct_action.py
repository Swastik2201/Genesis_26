"""Variant 2: Direct-action control question set (Lane B).

HYPOTHESIS:
Asking directly "Which action should we take?" forces the model to act as a
policy selector rather than an environment perceiver. We hypothesize this works
worse and has worse calibration than perception-first questions, and serves as
the benchmark control.
"""

from __future__ import annotations

from typing import Any

from bot.questions.base import QuestionSet


_ACTION_DESCRIPTIONS = {
    "move_left": "Steer left into the left lane to dodge obstacles",
    "left": "Steer left into the left lane to dodge obstacles",
    "stay": "Maintain current course straight ahead in our lane",
    "straight": "Maintain current course straight ahead in our lane",
    "move_right": "Steer right into the right lane to dodge obstacles",
    "right": "Steer right into the right lane to dodge obstacles",
}


class V2DirectActionQuestionSet(QuestionSet):
    """Direct-action control question set asking what move to execute."""

    id = "v2_direct_action"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct a direct policy question with described options."""
        # Extract legal action options from state if available
        legal_actions = []
        if isinstance(state, dict):
            legal_actions = state.get("legal_actions", [])

        criteria: dict[str, str] = {}
        if legal_actions:
            for act in legal_actions:
                aid = act["id"]
                criteria[aid] = _ACTION_DESCRIPTIONS.get(
                    aid, f"Execute move {act.get('label', aid)}"
                )
        else:
            # Fallback canonical runner actions
            criteria = {
                "move_left": "Steer left to avoid upcoming obstacles",
                "stay": "Maintain current position straight ahead",
                "move_right": "Steer right to avoid upcoming obstacles",
            }

        return {
            "recommended_action": {
                "type": "choice",
                "instructions": "Which action should we take right now to avoid obstacles and survive?",
                "criteria": criteria,
            }
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map direct policy choice probabilities directly to legal actions."""
        exclude_set = set(exclude)
        eligible = [a["id"] for a in legal_actions if a["id"] not in exclude_set]

        ans = answers.get("recommended_action", {})
        probs = ans.get("probabilities", {}) if isinstance(ans, dict) else {}

        scores: dict[str, float] = {}
        for aid in eligible:
            scores[aid] = float(probs.get(aid, 1.0 / len(eligible) if eligible else 0.0))

        total = sum(scores.values()) or 1.0
        scores = {k: v / total for k, v in scores.items()}

        chosen = max(scores, key=scores.get) if scores else "none"
        reason = f"Direct policy query selected action '{chosen}' with probability {scores.get(chosen, 0.0):.2f}."
        return scores, reason
