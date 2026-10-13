"""StubEngine — deterministic duck-typed Decision engine for Lane A tests.

Used in place of Member B's LayaEngine before it is available.
Returns Decision-shaped dicts exactly matching the contract in
AGENTS.md § 5.2 and contracts/decision.schema.json.

The stub's scores are controlled by its ``scores`` constructor argument
so tests can simulate any probability distribution over actions.

Usage
-----
::

    from tests.lane_a.stub_engine import StubEngine, StubDecision

    engine = StubEngine(scores={"move_right": 0.9, "stay": 0.07, "move_left": 0.03})
    decision = engine.decide(state, legal_actions, exclude=set())
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StubDecision:
    """Minimal Decision-contract-shaped object returned by StubEngine."""
    chosen_action: str
    action_scores: dict[str, float]
    questions: list[dict[str, Any]] = field(default_factory=list)
    question_set: str = "stub_v0"
    latency_ms: float = 1.0
    reason: str = "Stub engine selected highest-scoring legal action."
    raw: Any = None

    def get(self, key: str, default: Any = None) -> Any:
        """Allow dict-style .get() access so validator works with both dicts and objects."""
        return getattr(self, key, default)

    def __contains__(self, key: str) -> bool:
        return hasattr(self, key)


class StubEngine:
    """Deterministic stub that returns a fixed probability distribution.

    Parameters
    ----------
    scores:
        A dict mapping action ID → score.  Actions not in this dict get
        a score of 0.  The engine normalises to sum=1 over the legal,
        non-excluded actions automatically.
    override_action:
        If set, the engine always returns this action ID (used to simulate
        an engine that keeps choosing an illegal action so we can test retry).
    calls:
        Internal counter incremented on each ``decide()`` call (inspect in tests).
    """

    def __init__(
        self,
        scores: dict[str, float] | None = None,
        override_action: str | None = None,
    ) -> None:
        self._base_scores: dict[str, float] = dict(scores or {})
        self._override_action: str | None = override_action
        self.calls: int = 0
        self.last_exclude: set[str] = set()

    def decide(
        self,
        state: dict[str, Any],
        legal_actions: list[dict[str, str]],
        exclude: set[str] | None = None,
    ) -> dict[str, Any]:
        """Return a Decision-shaped dict.

        If ``override_action`` is set and not excluded, it is chosen
        regardless of scores (useful for testing rejection loops).
        """
        self.calls += 1
        exclude_set: set[str] = set(exclude or set())
        self.last_exclude = set(exclude_set)

        eligible = [a for a in legal_actions if a["id"] not in exclude_set]
        if not eligible:
            eligible = list(legal_actions)  # safety — validator handles empty

        # Build scores over eligible actions only
        raw_scores = {a["id"]: self._base_scores.get(a["id"], 0.0) for a in eligible}
        total = sum(raw_scores.values())
        if total > 0:
            normalised = {k: v / total for k, v in raw_scores.items()}
        else:
            # Uniform if no scores configured
            n = len(eligible)
            normalised = {a["id"]: 1.0 / n for a in eligible}

        # Choose action
        if self._override_action and self._override_action not in exclude_set:
            chosen = self._override_action
        else:
            chosen = max(normalised, key=lambda k: normalised[k])

        return {
            "chosen_action": chosen,
            "action_scores": normalised,
            "questions": [
                {
                    "id": "stub_q1",
                    "text": "Which action is best? (stub)",
                    "options": [a["id"] for a in legal_actions],
                }
            ],
            "question_set": "stub_v0",
            "latency_ms": 1.0,
            "reason": (
                f"Stub: '{chosen}' had highest score "
                f"({normalised.get(chosen, 0):.2f}) among eligible actions."
            ),
            "raw": {
                "stub": True,
                "base_scores": dict(self._base_scores),
                "exclude": list(exclude_set),
            },
        }
