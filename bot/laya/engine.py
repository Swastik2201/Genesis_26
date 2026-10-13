"""Laya Decision Engine implementation (Lane B).

Contract reference: AGENTS.md § 5.2 (Decision object), § 5.6 (Laya usage principles).

Invariants:
- Exactly ONE agent.predict call per decide() step.
- Predict calls are strictly thread-safe, guarded by a threading.Lock.
- Chosen action is guaranteed to be in the legal, non-excluded actions set.
- Action scores are normalised to sum strictly to 1.0.
- Ties are broken deterministically by the stable order of legal_actions.
- No other model, heuristic policy, random choice, or hard-coded move is used.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

from bot.laya.types import Decision
from bot.questions import QuestionSet, get_question_set

logger = logging.getLogger(__name__)


class _DefaultFallbackQuestionSet(QuestionSet):
    """Fallback question formulation used if a specific set is not yet registered."""

    id = "v1_perception"

    def build_questions(self, state: dict[str, Any] | str) -> dict[str, Any]:
        return {
            "lane_status": {
                "type": "choice",
                "instructions": "Which lane is safest to proceed in?",
                "criteria": {
                    "left": "The left lane is clear",
                    "straight": "The straight/center lane is clear",
                    "right": "The right lane is clear",
                },
            }
        }

    def map_answers(
        self,
        answers: dict[str, Any],
        legal_actions: list[dict[str, Any]],
        exclude: set[str] | tuple[str, ...] = (),
    ) -> tuple[dict[str, float], str]:
        # Simple probability pass-through or equal weighting across non-excluded
        exclude_set = set(exclude)
        eligible = [a["id"] for a in legal_actions if a["id"] not in exclude_set]
        q_ans = answers.get("lane_status", {})
        probs = q_ans.get("probabilities", {}) if isinstance(q_ans, dict) else {}

        scores: dict[str, float] = {}
        for aid in eligible:
            scores[aid] = float(probs.get(aid, 1.0 / len(eligible) if eligible else 0.0))
        return scores, "Selected highest probability lane from perception question."


class LayaEngine:
    """Decision engine driven exclusively by Laya typed questions.

    Parameters
    ----------
    question_set : str or QuestionSet, default "v1_perception"
        Question formulation strategy identifier or instance.
    checkpoint : str, default "convaiinnovations/laya"
        Hugging Face model checkpoint or local path.
    device : Any, optional
        Target torch device (cuda, mps, cpu, or None for auto).
    agent : Any, optional
        Pre-instantiated or fake agent for unit testing without downloading weights.
    """

    def __init__(
        self,
        question_set: str | QuestionSet = "v1_perception",
        checkpoint: str = "convaiinnovations/laya",
        device: Any = None,
        agent: Any = None,
    ) -> None:
        self._lock = threading.Lock()
        self._last_calls: list[dict[str, Any]] = []

        # Resolve question set
        if isinstance(question_set, str):
            try:
                self.question_set: QuestionSet = get_question_set(question_set)
            except KeyError:
                logger.warning(
                    "Question set '%s' not yet registered; using fallback perception set.",
                    question_set,
                )
                self.question_set = _DefaultFallbackQuestionSet(qid=question_set)
        elif isinstance(question_set, QuestionSet):
            self.question_set = question_set
        else:
            raise TypeError(f"Invalid question_set type: {type(question_set)}")

        self.checkpoint = checkpoint
        self.device = device

        # Load model once or use injected agent
        if agent is not None:
            self.agent = agent
            logger.info("LayaEngine initialized with injected agent.")
        else:
            import laya  # type: ignore[import]

            logger.info("Loading Laya checkpoint '%s'...", checkpoint)
            self.agent = laya.load(checkpoint, device=device)
            # Throwaway warm-up call once upon initialization
            self._warmup()

    def _warmup(self) -> None:
        """Run a throwaway predict call to warm up the model."""
        warmup_state = "The runner is moving forward. The path is clear."
        warmup_q = {
            "warmup": {
                "type": "noul",
                "instructions": "Is the path ahead clear?",
                "criteria": {"false": "No", "true": "Yes"},
            }
        }
        try:
            with self._lock:
                _ = self.agent.predict(warmup_state, warmup_q)
            logger.info("LayaEngine warm-up predict complete.")
        except Exception as exc:
            logger.warning("LayaEngine warm-up failed: %s", exc)

    @property
    def last_calls(self) -> list[dict[str, Any]]:
        """Read-only audit log of all predict calls executed by this engine."""
        with self._lock:
            return [dict(call) for call in self._last_calls]

    def decide(
        self,
        state: dict[str, Any] | str,
        legal_actions: list[dict[str, Any]],
        exclude: tuple[str, ...] | set[str] = (),
    ) -> Decision:
        """Evaluate state using Laya and return a valid Decision.

        Parameters
        ----------
        state : dict or str
            Contract state dict (with 'state_text') or plain-English string.
        legal_actions : list[dict[str, Any]]
            Available actions from the environment (each with at least 'id').
        exclude : tuple or set of str, optional
            Action IDs rejected by validator or game to exclude from selection.

        Returns
        -------
        Decision
            Decision dataclass containing chosen_action, action_scores, questions,
            question_set, latency_ms, reason, and raw Laya output.

        Raises
        ------
        ValueError
            If legal_actions is empty.
        RuntimeError
            If every legal action has been excluded.
        """
        if not legal_actions:
            raise ValueError("legal_actions cannot be empty.")

        legal_ids = [a["id"] for a in legal_actions]
        exclude_set = set(exclude) if exclude else set()
        eligible = [aid for aid in legal_ids if aid not in exclude_set]

        if not eligible:
            raise RuntimeError(
                f"All legal actions have been excluded ({exclude_set}). "
                f"Legal actions: {legal_ids}. Cannot make a legal decision."
            )

        # 1. Extract plain-English state text
        if isinstance(state, dict):
            state_text = str(state.get("state_text", ""))
            if not state_text:
                state_text = str(state)
        else:
            state_text = str(state)

        # 2. Build typed questions from the configured question set
        questions = self.question_set.build_questions(state)
        if not questions:
            raise ValueError(
                f"QuestionSet '{self.question_set.id}' returned empty questions dict."
            )

        # 3. Exactly ONE Laya predict call, guarded by thread lock
        t0 = time.perf_counter()
        with self._lock:
            raw_result = self.agent.predict(state_text, questions)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        # 4. Extract model answers (Laya returns dict with 'answers' mapping)
        if isinstance(raw_result, dict) and "answers" in raw_result:
            answers = raw_result["answers"]
        elif isinstance(raw_result, dict):
            answers = raw_result
        else:
            answers = {}

        # 5. Map answers to action scores and reason
        raw_scores, map_reason = self.question_set.map_answers(
            answers, legal_actions, exclude=exclude_set
        )

        # 6. Restrict scores strictly to eligible actions and normalise
        scores: dict[str, float] = {}
        for aid in eligible:
            val = float(raw_scores.get(aid, 0.0)) if isinstance(raw_scores, dict) else 0.0
            scores[aid] = max(0.0, val)

        total_score = sum(scores.values())
        if total_score <= 1e-9:
            # If all mapped scores are zero, distribute uniform mass across eligible
            uniform_prob = 1.0 / len(eligible)
            scores = {aid: uniform_prob for aid in eligible}
        else:
            scores = {aid: s / total_score for aid, s in scores.items()}

        # Numerical cleanup: ensure exact sum to 1.0 within float tolerance
        diff = 1.0 - sum(scores.values())
        if abs(diff) > 1e-9:
            top_aid = max(eligible, key=lambda a: scores[a])
            scores[top_aid] += diff

        # Round to 6 decimal places for cleanliness and consistency
        scores = {k: round(v, 6) for k, v in scores.items()}
        # Re-apply diff to largest to maintain exact 1.0 sum
        sum_delta = round(1.0 - sum(scores.values()), 6)
        if sum_delta != 0.0:
            top_aid = max(eligible, key=lambda a: scores[a])
            scores[top_aid] = round(scores[top_aid] + sum_delta, 6)

        # 7. Argmax selection with deterministic tie-breaking:
        # Ties are broken by the stable order in legal_actions (first listed wins).
        max_score = max(scores.values())
        candidates = [aid for aid in eligible if abs(scores[aid] - max_score) <= 1e-5]

        # First candidate according to the original legal_actions order
        chosen_action = candidates[0]
        reason = map_reason or "Mapped from Laya probabilities."
        if len(candidates) > 1:
            tied_names = ", ".join(candidates)
            reason = (
                f"{reason.rstrip('.')} (Tie between [{tied_names}] with score "
                f"{max_score:.4f}; broken by legal action order)."
            )

        # 8. Absolute invariant guarantee: chosen_action MUST be in eligible
        if chosen_action not in eligible:
            raise RuntimeError(
                f"CRITICAL ERROR: Chosen action '{chosen_action}' is not in "
                f"eligible actions {eligible}!"
            )

        # 9. Construct Decision object
        decision = Decision(
            chosen_action=chosen_action,
            action_scores=scores,
            questions=questions,
            question_set=self.question_set.id,
            latency_ms=latency_ms,
            reason=reason,
            raw=raw_result,
        )

        # 10. Record call for inspection / auditing
        call_record = {
            "step_time": time.time(),
            "chosen_action": decision.chosen_action,
            "action_scores": dict(decision.action_scores),
            "questions": decision.questions,
            "question_set": decision.question_set,
            "latency_ms": decision.latency_ms,
            "reason": decision.reason,
            "raw": decision.raw,
            "eligible": list(eligible),
        }
        with self._lock:
            self._last_calls.append(call_record)

        return decision
