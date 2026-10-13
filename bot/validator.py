"""Action validator and retry/fallback logic (Lane A).

Contract reference: AGENTS.md § 5.3 (event.validator), § 2 (non-negotiable rules)

Key invariants enforced here:
- Every submitted move traces back to a recorded Laya call.
- No random action, heuristic, or hard-coded move is ever chosen.
- The only permitted fallback when retries are exhausted is the
  highest-scoring LEGAL action from Laya's most recent action_scores.
  That fallback is logged explicitly with fallback=True.
- Ties are broken by the stable order of ``legal_actions`` (first listed wins).
"""

from __future__ import annotations

import logging
from typing import Any

from bot.adapters.base import IllegalMoveError

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Step 1 — simple legality check (pre-submission)
# ---------------------------------------------------------------------------


def validate(
    action_id: str,
    legal_actions: list[dict[str, str]],
) -> tuple[bool, str]:
    """Check whether ``action_id`` appears in the legal action list.

    Parameters
    ----------
    action_id:
        The action ID the engine has chosen.
    legal_actions:
        Current legal action list (each has at least ``"id"``).

    Returns
    -------
    (ok, reason)
        ``ok`` is True if the action is legal; False otherwise.
        ``reason`` is an empty string when legal, or an explanation when not.
    """
    legal_ids = {a["id"] for a in legal_actions}
    if action_id in legal_ids:
        return True, ""
    return False, (
        f"Action '{action_id}' is not in the legal action set "
        f"({', '.join(sorted(legal_ids))})"
    )


# ---------------------------------------------------------------------------
# Step 2 — fallback helper (used only when retries are exhausted)
# ---------------------------------------------------------------------------


def _fallback_action(
    action_scores: dict[str, float],
    legal_actions: list[dict[str, str]],
    excluded: set[str],
) -> str | None:
    """Return the highest-scoring still-legal, non-excluded action.

    Ties are broken by the stable order of ``legal_actions`` (first wins).
    Returns None if every legal action has been excluded (should not happen
    in a well-behaved game, but we guard against it).

    This function must never be called as a primary decision path — it exists
    only as the last-resort fallback after all retries are exhausted.
    """
    best_id: str | None = None
    best_score: float = -1.0

    # Iterate in the stable order from legal_actions for deterministic tie-breaking.
    for act in legal_actions:
        aid = act["id"]
        if aid in excluded:
            continue
        score = action_scores.get(aid, 0.0)
        if score > best_score:
            best_score = score
            best_id = aid

    return best_id


# ---------------------------------------------------------------------------
# Step 3 — full move-selection loop
# ---------------------------------------------------------------------------


def choose_move(
    engine: Any,
    state: dict[str, Any],
    legal_actions: list[dict[str, str]],
    adapter: Any,
    max_retries: int = 3,
) -> tuple[str, dict[str, Any], list[dict[str, Any]], dict[str, Any]]:
    """Select a move using Laya, with retry logic and explicit fallback.

    The engine is duck-typed — any object with a
    ``decide(state, legal_actions, exclude=...)`` method works.

    Algorithm
    ---------
    1. Call ``engine.decide(state, legal_actions, exclude=tried)``.
    2. Check the chosen_action is legal (``validate()``).
    3. Submit through ``adapter.submit_move()``.
    4. If the game returns ``IllegalMoveError``, add the action to ``tried``
       and go back to step 1 (retry).
    5. If pre-submission validation fails (engine returned an illegal action),
       add to ``tried`` and retry.
    6. After ``max_retries`` failed attempts, apply fallback: take the
       highest-scoring still-legal action from the LAST action_scores,
       log ``fallback=True``, and submit.

    Parameters
    ----------
    engine:
        Duck-typed engine.  Must expose
        ``decide(state, legal_actions, exclude: set[str]) -> Decision``.
    state:
        Normalised State contract dict.
    legal_actions:
        Current legal action list from the adapter.
    adapter:
        The game adapter (used for ``submit_move``).
    max_retries:
        Maximum number of Laya calls before triggering the fallback.

    Returns
    -------
    (final_action, game_response, laya_calls, validator_info)

    - ``final_action``: string action ID that was submitted.
    - ``game_response``: raw dict returned by ``adapter.submit_move()``.
    - ``laya_calls``: list of dicts — one per ``engine.decide()`` call,
      each containing ``chosen_action``, ``action_scores``, ``questions``,
      ``question_set``, ``latency_ms``, ``reason``, ``raw``,
      ``accepted`` (bool), ``excluded`` (bool), ``legal`` (bool).
    - ``validator_info``: ``{"retries": n, "fallback": bool, "rejections": [...]}``.

    Raises
    ------
    RuntimeError
        If no legal, non-excluded action can be found after fallback (the
        game has no remaining valid moves at all).
    """
    tried: set[str] = set()
    laya_calls: list[dict[str, Any]] = []
    rejections: list[str] = []
    retries: int = 0
    last_decision: Any = None

    legal_ids = {a["id"] for a in legal_actions}

    for attempt in range(max_retries + 1):  # +1 so last attempt uses fallback
        is_last_attempt = (attempt == max_retries)

        # ── Fallback path ────────────────────────────────────────────────
        if is_last_attempt:
            if last_decision is None:
                raise RuntimeError(
                    "[validator] No Laya decision was recorded before fallback. "
                    "This is a bug — engine.decide() must be called at least once."
                )
            fallback_id = _fallback_action(
                last_decision.get("action_scores", {}),
                legal_actions,
                tried,
            )
            if fallback_id is None:
                raise RuntimeError(
                    "[validator] Fallback found no remaining legal actions. "
                    f"All {len(legal_ids)} legal actions have been excluded: {tried}"
                )

            logger.warning(
                "[validator] Retries exhausted. Using fallback action '%s' "
                "(highest score from last Laya call). fallback=True.",
                fallback_id,
            )

            try:
                game_response = adapter.submit_move(fallback_id)
            except IllegalMoveError as exc:
                raise RuntimeError(
                    f"[validator] Fallback action '{fallback_id}' was also rejected "
                    f"by the game: {exc.message}"
                ) from exc

            # Mark the last recorded laya_call entry as the accepted fallback
            if laya_calls:
                laya_calls[-1]["accepted"] = True
                laya_calls[-1]["excluded"] = False
                laya_calls[-1]["fallback"] = True
                laya_calls[-1]["fallback_chosen"] = fallback_id

            return (
                fallback_id,
                game_response,
                laya_calls,
                {"retries": retries, "fallback": True, "rejections": rejections},
            )

        # ── Normal Laya decision path ────────────────────────────────────
        decision = engine.decide(state, legal_actions, exclude=tried)
        last_decision = decision

        chosen = decision.get("chosen_action", "")

        # Build the laya_call log entry (accepted/excluded filled in below)
        call_entry: dict[str, Any] = {
            "question_set":   decision.get("question_set", "unknown"),
            "questions":      decision.get("questions", []),
            "raw":            decision.get("raw"),
            "action_scores":  decision.get("action_scores", {}),
            "chosen_action":  chosen,
            "latency_ms":     decision.get("latency_ms", 0.0),
            "reason":         decision.get("reason", ""),
            "accepted":       False,
            "excluded":       False,
            "legal":          False,
            "fallback":       False,
        }

        # ── Pre-submission legality check ────────────────────────────────
        ok, reason = validate(chosen, legal_actions)
        call_entry["legal"] = ok

        if not ok:
            msg = f"Attempt {attempt + 1}: pre-submission reject — {reason}"
            logger.warning("[validator] %s", msg)
            rejections.append(msg)
            call_entry["excluded"] = True
            tried.add(chosen)
            laya_calls.append(call_entry)
            retries += 1
            continue

        # ── Submit to the game ───────────────────────────────────────────
        try:
            game_response = adapter.submit_move(chosen)
        except IllegalMoveError as exc:
            msg = (
                f"Attempt {attempt + 1}: game rejected '{chosen}' — {exc.message}"
            )
            logger.warning("[validator] %s", msg)
            rejections.append(msg)
            call_entry["excluded"] = True
            tried.add(chosen)
            laya_calls.append(call_entry)
            retries += 1
            continue

        # ── Success ──────────────────────────────────────────────────────
        call_entry["accepted"] = True
        laya_calls.append(call_entry)

        logger.info(
            "[validator] Accepted action '%s' on attempt %d.",
            chosen, attempt + 1,
        )

        return (
            chosen,
            game_response,
            laya_calls,
            {"retries": retries, "fallback": False, "rejections": rejections},
        )

    # This line is unreachable (the fallback path always returns), but satisfies
    # static analysers that require an explicit return from every code path.
    raise RuntimeError("[validator] Unexpected exit from choose_move loop.")  # pragma: no cover
