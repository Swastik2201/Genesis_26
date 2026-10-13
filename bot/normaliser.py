"""State normaliser — converts raw game state into the contract State object (Lane A).

Contract reference: AGENTS.md § 5.1
Schema:            contracts/state.schema.json
Example:           contracts/examples/state.json

Rules for state_text (read by Laya, ~512 token budget):
- Put the most decision-relevant fact first.
- Describe positions and danger in plain words; never dump raw numbers.
- Compute every comparison or threshold in code; state the conclusion
  (e.g. "An obstacle is directly ahead" not "obstacle distance 1").
- Keep the result under ~120 words.
- No JSON, no curly braces, no list brackets in state_text.

facts keeps the structured raw values for the UI and for Question Lab.
"""

from __future__ import annotations

import re
from abc import ABC, abstractmethod
from typing import Any


# ---------------------------------------------------------------------------
# Contract helpers
# ---------------------------------------------------------------------------

_REQUIRED_KEYS = {
    "game_id", "session_id", "step", "state_text", "facts",
    "legal_actions", "score", "done",
}

_ACTION_REQUIRED = {"id", "label"}


def _validate_state(state: dict[str, Any]) -> None:
    """Raise ValueError if the produced state dict violates the contract."""
    missing = _REQUIRED_KEYS - state.keys()
    if missing:
        raise ValueError(f"[normaliser] State is missing required keys: {missing}")

    if not isinstance(state["step"], int) or state["step"] < 0:
        raise ValueError("[normaliser] 'step' must be a non-negative integer")

    if not isinstance(state["done"], bool):
        raise ValueError("[normaliser] 'done' must be a boolean")

    if state["score"] is not None and not isinstance(state["score"], (int, float)):
        raise ValueError("[normaliser] 'score' must be a number or null")

    for act in state.get("legal_actions", []):
        missing_act = _ACTION_REQUIRED - act.keys()
        if missing_act:
            raise ValueError(
                f"[normaliser] legal_action missing keys {missing_act}: {act}"
            )

    # Warn (do not fail) if state_text looks too long
    word_count = len(state["state_text"].split())
    if word_count > 150:
        import warnings
        warnings.warn(
            f"[normaliser] state_text is {word_count} words; aim for under 120.",
            stacklevel=3,
        )


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------


class StateNormaliser(ABC):
    """Convert a raw adapter state dict into the contract State object.

    Each game gets its own concrete normaliser registered via
    ``get_normaliser(game_name)``.
    """

    @property
    @abstractmethod
    def game_id(self) -> str:
        """The game identifier this normaliser produces, e.g. ``"mock-v1"``."""

    @abstractmethod
    def normalise(
        self,
        raw: dict[str, Any],
        legal_actions: list[dict[str, str]],
        step: int,
        session_id: str,
        game_id: str,
        score: float | None,
        done: bool,
    ) -> dict[str, Any]:
        """Return a dict conforming to the State contract.

        Parameters
        ----------
        raw:
            The raw state dict from the adapter.
        legal_actions:
            Pre-extracted legal actions list (each has ``id``, ``label``,
            optional ``hint``).
        step:
            Current decision step index (0-based).
        session_id:
            Session identifier string.
        game_id:
            Game identifier string.
        score:
            Current score, or ``None`` if unknown.
        done:
            True if the game has ended.
        """


# ---------------------------------------------------------------------------
# Mock game normaliser
# ---------------------------------------------------------------------------

# Lane names for plain-English descriptions
_LANE_NAMES = {1: "left", 2: "centre", 3: "right"}

# Distance thresholds used for urgency wording
_URGENT_DIST = 1    # obstacle this many steps ahead = "directly ahead / imminent"
_WARNING_DIST = 3   # obstacle this many steps ahead = "approaching"


def _lane_name(lane: int) -> str:
    return _LANE_NAMES.get(lane, f"lane {lane}")


def _describe_obstacle_urgency(distance: int) -> str:
    if distance <= _URGENT_DIST:
        return "directly ahead"
    if distance <= _WARNING_DIST:
        return "approaching"
    return "further ahead"


def _build_mock_state_text(
    current_lane: int,
    obstacles: list[dict[str, int]],
    score: float | None,
    legal_actions: list[dict[str, str]],
    done: bool,
) -> str:
    """Produce a plain-English state summary for Laya.

    Rules enforced here:
    - Most critical danger is stated first.
    - Positions described by name (left/centre/right), not by integer.
    - All numeric thresholds computed in code; only conclusions appear in text.
    - No JSON, no square brackets, no curly braces.
    - Target: under 120 words.
    """
    if done:
        return "The game has ended."

    lane_name = _lane_name(current_lane)

    # Group obstacles by lane for quick lookup
    obs_by_lane: dict[int, list[int]] = {}
    for o in obstacles:
        obs_by_lane.setdefault(o["lane"], []).append(o["distance"])

    # Assess danger in our current lane
    our_dists = sorted(obs_by_lane.get(current_lane, []))
    if our_dists and our_dists[0] <= _URGENT_DIST:
        our_lane_status = "has an obstacle directly ahead — collision imminent"
    elif our_dists and our_dists[0] <= _WARNING_DIST:
        our_lane_status = "has an obstacle approaching"
    else:
        our_lane_status = "is currently clear"

    # Assess neighbours
    left_lane = current_lane - 1
    right_lane = current_lane + 1

    def _lane_summary(lane: int) -> str:
        if lane < 1:
            return "no left lane (wall)"
        if lane > 3:
            return "no right lane (wall)"
        dists = sorted(obs_by_lane.get(lane, []))
        name = _lane_name(lane)
        if not dists:
            return f"the {name} lane is clear"
        urgency = _describe_obstacle_urgency(dists[0])
        return f"the {name} lane has an obstacle {urgency}"

    left_summary = _lane_summary(left_lane)
    right_summary = _lane_summary(right_lane)

    # Recommended actions (from hints, summarised)
    safe_labels = []
    for act in legal_actions:
        hint = act.get("hint", "")
        if hint and "clear" in hint.lower():
            safe_labels.append(act["label"])

    safe_str = ""
    if safe_labels:
        safe_str = " Safe option(s): " + ", ".join(safe_labels) + "."

    score_str = ""
    if score is not None:
        score_str = f" Current score: {int(score)}."

    text = (
        f"We are in the {lane_name} lane, which {our_lane_status}. "
        f"To the left: {left_summary}. "
        f"To the right: {right_summary}."
        f"{safe_str}"
        f"{score_str}"
    )
    return text.strip()


class MockNormaliser(StateNormaliser):
    """Normaliser for the local ``mock_game`` lane-runner.

    Converts the raw server state (with ``lane``, ``obstacles``,
    ``score``, ``done``, ``legal_actions``) into the contract State object.
    """

    @property
    def game_id(self) -> str:
        return "mock-v1"

    def normalise(
        self,
        raw: dict[str, Any],
        legal_actions: list[dict[str, str]],
        step: int,
        session_id: str,
        game_id: str,
        score: float | None,
        done: bool,
    ) -> dict[str, Any]:
        current_lane: int = int(raw.get("lane", 2))
        obstacles: list[dict[str, int]] = list(raw.get("obstacles", []))

        state_text = _build_mock_state_text(
            current_lane=current_lane,
            obstacles=obstacles,
            score=score,
            legal_actions=legal_actions,
            done=done,
        )

        facts: dict[str, Any] = {
            "current_lane": current_lane,
            "speed": float(raw.get("speed", 1.0)),
            "obstacles": obstacles,
        }

        # Normalise action list to guarantee only contract-allowed keys
        clean_actions = []
        for act in legal_actions:
            entry: dict[str, str] = {
                "id": str(act["id"]),
                "label": str(act.get("label", act["id"])),
            }
            if "hint" in act:
                entry["hint"] = str(act["hint"])
            clean_actions.append(entry)

        state: dict[str, Any] = {
            "game_id": game_id,
            "session_id": session_id,
            "step": step,
            "state_text": state_text,
            "facts": facts,
            "legal_actions": clean_actions,
            "score": score,
            "done": done,
        }

        _validate_state(state)
        return state


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

def _load_mock_normaliser() -> type[StateNormaliser]:
    return MockNormaliser


_NORMALISER_REGISTRY: dict[str, Any] = {
    "mock-v1": _load_mock_normaliser,
    "mock":    _load_mock_normaliser,   # alias
    # "game1": _load_game1_normaliser,  ← add on hackathon day
}


def list_normalisers() -> list[str]:
    """Return the registered game names."""
    return list(_NORMALISER_REGISTRY.keys())


def get_normaliser(game_name: str) -> StateNormaliser:
    """Return a fresh normaliser instance for ``game_name``.

    Raises
    ------
    KeyError
        If no normaliser is registered for that game name.
    """
    if game_name not in _NORMALISER_REGISTRY:
        available = ", ".join(sorted(_NORMALISER_REGISTRY))
        raise KeyError(
            f"[normaliser] No normaliser registered for '{game_name}'. "
            f"Available: {available}"
        )
    cls = _NORMALISER_REGISTRY[game_name]()
    return cls()
