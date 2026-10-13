"""Decision dataclass contract definition for Laya Engine (Lane B).

Contract reference: AGENTS.md § 5.2 (Decision object), contracts/decision.schema.json
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class Decision:
    """Decision returned by the Laya decision engine for a single step.

    Attributes
    ----------
    chosen_action : str
        Selected legal action identifier.
    action_scores : dict[str, float]
        Mapping from legal, non-excluded action IDs to probabilities/scores
        summing to 1.0 within float tolerance.
    questions : dict[str, Any] | list[Any]
        Exact typed questions passed to Laya.
    question_set : str
        Identifier of the question formulation set used.
    latency_ms : float
        Inference time for Laya call in milliseconds.
    reason : str
        One short, human-readable sentence explaining how answers were mapped.
    raw : Any
        Unmodified Laya result for audit/debugging.
    """

    chosen_action: str
    action_scores: dict[str, float]
    questions: dict[str, Any] | list[Any]
    question_set: str
    latency_ms: float
    reason: str
    raw: Any

    def to_dict(self) -> dict[str, Any]:
        """Convert decision to a JSON-serialisable dictionary matching schema."""
        return {
            "chosen_action": self.chosen_action,
            "action_scores": dict(self.action_scores),
            "questions": self.questions,
            "question_set": self.question_set,
            "latency_ms": float(self.latency_ms),
            "reason": self.reason,
            "raw": self.raw,
        }

    def __getitem__(self, key: str) -> Any:
        try:
            return getattr(self, key)
        except AttributeError:
            raise KeyError(key)

    def get(self, key: str, default: Any = None) -> Any:
        return getattr(self, key, default)

    def __contains__(self, key: str) -> bool:
        return hasattr(self, key)

    def keys(self) -> list[str]:
        return [
            "chosen_action",
            "action_scores",
            "questions",
            "question_set",
            "latency_ms",
            "reason",
            "raw",
        ]
