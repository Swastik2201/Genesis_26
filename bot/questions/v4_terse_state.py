"""Variant 4: Terse-state perception question set (Lane B).

HYPOTHESIS:
Trimming conversational phrasing and secondary details (such as current score
or repeated safe option lists) from the state text improves Laya's attention on
immediate obstacle facts and reduces token usage without compromising decision accuracy.
"""

from __future__ import annotations

import re
from typing import Any

from bot.questions.v1_perception import V1PerceptionQuestionSet


class V4TerseStateQuestionSet(V1PerceptionQuestionSet):
    """Perception question set paired with compressed, concise state representations."""

    id = "v4_terse_state"

    @staticmethod
    def compress_state_text(state_text: str) -> str:
        """Strip score, repeated hints, and filler words to produce a terse summary."""
        # Remove score chatter like 'Current score: 10.'
        cleaned = re.sub(r"Current score:\s*\d+\.?", "", state_text, flags=re.IGNORECASE)
        # Remove safe options listing like 'Safe option(s): Move Left.'
        cleaned = re.sub(r"Safe option\(s\):[^.]*\.?", "", cleaned, flags=re.IGNORECASE)
        # Compact extra spaces
        cleaned = " ".join(cleaned.split())
        return cleaned

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Build perception questions identical to v1, but for terse state evaluation."""
        return super().build_questions(state)

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map perception probabilities identically to v1, reporting terse state provenance."""
        scores, base_reason = super().map_answers(answers, legal_actions, exclude=exclude)
        reason = f"{base_reason.rstrip('.')} (Terse state formulation)."
        return scores, reason
