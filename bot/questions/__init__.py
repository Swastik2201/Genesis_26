"""Question formulation sets and registry (Lane B) for TopGameAI Arena Snake."""

from __future__ import annotations

from typing import Any, Callable

from bot.questions.base import QuestionSet
from bot.questions.game1 import (
    Game1V1PerceptionQuestionSet,
    Game1V2DirectActionQuestionSet,
    Game1V3HazardGatesQuestionSet,
)
from bot.questions.game2 import (
    Game2V1PerceptionQuestionSet,
    Game2V2DirectActionQuestionSet,
)

V1PerceptionQuestionSet = Game1V1PerceptionQuestionSet
V2DirectActionQuestionSet = Game1V2DirectActionQuestionSet
V3HybridGatesQuestionSet = Game1V3HazardGatesQuestionSet
V4TerseStateQuestionSet = Game1V1PerceptionQuestionSet

__all__ = [
    "Game1V1PerceptionQuestionSet",
    "Game1V2DirectActionQuestionSet",
    "Game1V3HazardGatesQuestionSet",
    "Game2V1PerceptionQuestionSet",
    "Game2V2DirectActionQuestionSet",
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


# Register Game 1 (TopGameAI Snake) question sets
register_question_set("game1_v1_perception", Game1V1PerceptionQuestionSet)
register_question_set("game1_v2_direct_action", Game1V2DirectActionQuestionSet)
register_question_set("game1_v3_hazard_gates", Game1V3HazardGatesQuestionSet)

# Register Game 2 (TopGameAI 2048) question sets
register_question_set("game2_v1_perception", Game2V1PerceptionQuestionSet)
register_question_set("game2_v2_direct_action", Game2V2DirectActionQuestionSet)
register_question_set("2048", Game2V1PerceptionQuestionSet)
register_question_set("game2", Game2V1PerceptionQuestionSet)

# Standard aliases pointing exclusively to Snake question sets
register_question_set("snake", Game1V1PerceptionQuestionSet)
register_question_set("game1", Game1V1PerceptionQuestionSet)
register_question_set("default", Game1V1PerceptionQuestionSet)
register_question_set("v1_perception", Game1V1PerceptionQuestionSet)
register_question_set("v2_direct_action", Game1V2DirectActionQuestionSet)
register_question_set("v3_hybrid_gates", Game1V3HazardGatesQuestionSet)
register_question_set("v4_terse_state", Game1V1PerceptionQuestionSet)
