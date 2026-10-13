"""Question formulation sets and registry (Lane B)."""

from __future__ import annotations

from typing import Any, Callable

from bot.questions.base import QuestionSet
from bot.questions.v1_perception import V1PerceptionQuestionSet
from bot.questions.v2_direct_action import V2DirectActionQuestionSet
from bot.questions.v3_hybrid_gates import V3HybridGatesQuestionSet
from bot.questions.v4_terse_state import V4TerseStateQuestionSet

__all__ = [
    "QuestionSet",
    "V1PerceptionQuestionSet",
    "V2DirectActionQuestionSet",
    "V3HybridGatesQuestionSet",
    "V4TerseStateQuestionSet",
    "get_question_set",
    "list_question_sets",
    "register_question_set",
]

_REGISTRY: dict[str, type[QuestionSet] | QuestionSet | Callable[[], QuestionSet]] = {}


def register_question_set(
    name: str,
    factory: type[QuestionSet] | QuestionSet | Callable[[], QuestionSet],
) -> None:
    """Register a question formulation set in the global registry."""
    _REGISTRY[name] = factory


def get_question_set(name: str) -> QuestionSet:
    """Retrieve and instantiate a question set by identifier."""
    if name not in _REGISTRY:
        available = ", ".join(sorted(_REGISTRY.keys())) or "none"
        raise KeyError(
            f"Question set '{name}' not found. Available question sets: [{available}]."
        )

    entry = _REGISTRY[name]
    if isinstance(entry, QuestionSet):
        return entry
    if isinstance(entry, type) and issubclass(entry, QuestionSet):
        return entry()
    if callable(entry):
        return entry()
    raise TypeError(f"Invalid registry entry for '{name}': {type(entry)}")


def list_question_sets() -> list[str]:
    """Return a sorted list of registered question set identifiers."""
    return sorted(_REGISTRY.keys())


# Pre-register standard question-set variants
register_question_set("v1_perception", V1PerceptionQuestionSet)
register_question_set("v2_direct_action", V2DirectActionQuestionSet)
register_question_set("v3_hybrid_gates", V3HybridGatesQuestionSet)
register_question_set("v4_terse_state", V4TerseStateQuestionSet)
