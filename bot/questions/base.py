"""Base interface for question formulation sets (Lane B).

Each QuestionSet encapsulates:
1. Question generation: Translating game state into a dict of typed Laya questions
   (choice, score, noul).
2. Answer mapping: Translating raw Laya answers into a probability distribution
   over legal, non-excluded actions, and a concise human-readable explanation.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class QuestionSet(ABC):
    """Abstract base class for question formulation strategies."""

    id: str = "base"

    def __init__(self, qid: str | None = None) -> None:
        if qid:
            self.id = qid

    @abstractmethod
    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        """Construct typed Laya questions for the given game state.

        Parameters
        ----------
        state : dict or str
            Contract state dict (with 'state_text') or raw text string.

        Returns
        -------
        dict[str, Any]
            Dictionary mapping question_id -> typed question definition dict.
        """
        raise NotImplementedError

    @abstractmethod
    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        """Map model answers to probability scores over legal actions.

        Parameters
        ----------
        answers : dict[str, Any]
            Answers returned by Laya under ``res["answers"]`` (or equivalent).
        legal_actions : list[dict[str, Any]]
            List of legal action dicts (each having at least 'id').
        exclude : set[str] or tuple[str, ...]
            Action IDs to exclude from consideration.

        Returns
        -------
        tuple[dict[str, float], str]
            (action_scores, reason):
            - action_scores: Mapping from legal, non-excluded action ID to positive score.
              The scores will be normalised by the engine to sum to 1.0.
            - reason: A single human-readable sentence explaining the mapping rationale.
        """
        raise NotImplementedError
