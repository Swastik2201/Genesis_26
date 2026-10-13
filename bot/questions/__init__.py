"""Question formulation sets and registry (Lane B)."""

from __future__ import annotations

from typing import Any, Callable

from bot.questions.base import QuestionSet

__all__ = [
    "QuestionSet",
    "get_question_set",
    "list_question_sets",
    "register_question_set",
]

_REGISTRY: dict[str, type[QuestionSet] | QuestionSet | Callable[[], QuestionSet]] = {}


def register_question_set(
    name: str,
    factory: type[QuestionSet] | QuestionSet | Callable[[], QuestionSet],
) -> None:
    """Register a question formulation set in the global registry.

    Parameters
    ----------
    name : str
        Unique identifier for the question set.
    factory : type[QuestionSet] or QuestionSet or callable
        Class, instance, or factory producing a QuestionSet.
    """
    _REGISTRY[name] = factory


def get_question_set(name: str) -> QuestionSet:
    """Retrieve and instantiate a question set by identifier.

    Parameters
    ----------
    name : str
        Registered question set identifier.

    Returns
    -------
    QuestionSet
        Instantiated question set object.

    Raises
    ------
    KeyError
        If name is not found in the registry.
    """
    if name not in _REGISTRY:
        # Lazy discovery: if candidate modules exist, try importing
        try:
            import importlib
            importlib.import_module(f"bot.questions.{name}")
        except ModuleNotFoundError:
            pass

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
