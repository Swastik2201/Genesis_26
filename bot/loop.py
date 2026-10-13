"""Game loop for Beat the Bot (Lane A).

Entry point
-----------
    python -m bot.loop \
        --adapter mock \
        --question-set v1_perception \
        --games 3 \
        --seed 7 \
        --max-steps 200

Contract references
-------------------
- AGENTS.md § 5.1  State object
- AGENTS.md § 5.3  Event object  (one per step)
- AGENTS.md § 5.4  Run summary   (written by logger.close)
- AGENTS.md § 5.5  Logging rules

Lazy imports
------------
``bot.laya.engine.LayaEngine`` and ``bot.logger.RunLogger`` are imported
lazily.  If either module is absent (e.g. Member B's lane has not been
merged yet), a local stub is used instead and a clear WARNING is printed so
Lane A can run independently.
"""

from __future__ import annotations

import argparse
import logging
import signal
import sys
import time
from datetime import datetime, timezone
from typing import Any

log = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy engine import — falls back to StubEngine from tests/lane_a/
# ---------------------------------------------------------------------------


def _load_engine(question_set: str) -> Any:
    """Import LayaEngine; fall back to StubEngine if not available."""
    try:
        from bot.laya.engine import LayaEngine  # type: ignore[import]
        engine = LayaEngine(question_set=question_set)
        log.info("[loop] Using real LayaEngine (question_set=%s).", question_set)
        return engine
    except Exception as exc:  # ImportError or anything else
        print(
            f"[loop] WARNING: Could not import LayaEngine ({exc}). "
            "Falling back to StubEngine from tests/lane_a/stub_engine.py. "
            "Lane A is running standalone.",
            file=sys.stderr,
        )
        from tests.lane_a.stub_engine import StubEngine  # type: ignore[import]
        return StubEngine()


# ---------------------------------------------------------------------------
# Lazy logger import — falls back to _StubLogger defined below
# ---------------------------------------------------------------------------


class _StubLogger:
    """Minimal RunLogger replacement used when bot.logger is unavailable."""

    def __init__(self, game_id: str, **_: Any) -> None:
        self.game_id = game_id
        self.session_id = f"stub-{int(time.time())}"
        self._events: list[dict] = []
        self._closed = False

    def event(self, ev: dict) -> dict:
        self._events.append(ev)
        return ev

    def close(self, summary: dict | None = None) -> dict:
        self._closed = True
        return summary or {}

    def __enter__(self) -> "_StubLogger":
        return self

    def __exit__(self, *_: Any) -> None:
        if not self._closed:
            self.close()


def _load_logger(game_id: str, logs_dir: str = "logs/runs") -> Any:
    """Import RunLogger; fall back to _StubLogger if not available."""
    try:
        from bot.logger import RunLogger  # type: ignore[import]
        return RunLogger(game_id=game_id, logs_dir=logs_dir)
    except Exception as exc:
        print(
            f"[loop] WARNING: Could not import RunLogger ({exc}). "
            "Falling back to _StubLogger. Events will NOT be written to disk.",
            file=sys.stderr,
        )
        return _StubLogger(game_id=game_id)


# ---------------------------------------------------------------------------
# Core game loop
# ---------------------------------------------------------------------------


def run_game(
    adapter: Any,
    engine: Any,
    logger: Any,
    normaliser: Any | None = None,
    max_steps: int | None = None,
    seed: int | None = None,
) -> dict[str, Any]:
    """Run one full game episode.

    Parameters
    ----------
    adapter:
        A ``GameAdapter`` instance (or compatible duck-typed object).
    engine:
        A decision engine with ``decide(state, legal_actions, exclude) -> decision``
        (e.g. ``LayaEngine`` or ``StubEngine``).
    logger:
        A ``RunLogger`` instance (or compatible stub) with ``.event()`` and
        ``.close()``.
    normaliser:
        Optional ``StateNormaliser`` instance.  When ``None``, the raw state
        dict is used as-is (fields must already match the State contract).
    max_steps:
        Stop after this many decision steps regardless of ``done``.
        ``None`` means unlimited.
    seed:
        Forwarded for logging only; the adapter was already seeded.

    Returns
    -------
    dict
        The summary dict written by ``logger.close()``.
    """
    from bot.validator import choose_move  # always available in Lane A

    # -- Initialise run tracking
    game_id: str = getattr(adapter, "name", "unknown")
    session_id: str = getattr(logger, "session_id", "unknown")

    started_at: str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    steps: int = 0
    total_laya_latency: float = 0.0
    laya_call_count: int = 0
    invalid_moves: int = 0
    fallbacks: int = 0
    final_score: float | None = None
    completion_status: str = "completed"

    # -- Start the game session
    raw = adapter.start()
    prev_raw: dict[str, Any] = dict(raw)

    # -- Interrupt flag set by SIGINT handler
    interrupted: list[bool] = [False]

    def _handle_sigint(sig: int, frame: Any) -> None:
        print("\n[loop] Ctrl+C received — finishing step then closing.", file=sys.stderr)
        interrupted[0] = True

    original_sigint = signal.signal(signal.SIGINT, _handle_sigint)

    try:
        while True:
            # -- Per-step state read
            if steps == 0:
                current_raw = raw
            else:
                current_raw = adapter.get_state()

            done: bool = bool(current_raw.get("done", False))
            score: float | None = current_raw.get("score")
            final_score = score

            if done:
                _emit_terminal_event(
                    logger=logger,
                    session_id=session_id,
                    game_id=game_id,
                    step=steps,
                    raw=current_raw,
                    normaliser=normaliser,
                    score=score,
                    done=True,
                    outcome="game_over",
                )
                break

            if max_steps is not None and steps >= max_steps:
                log.info("[loop] max_steps=%d reached. Stopping.", max_steps)
                completion_status = "max_steps"
                break

            if interrupted[0]:
                completion_status = "interrupted"
                _emit_terminal_event(
                    logger=logger,
                    session_id=session_id,
                    game_id=game_id,
                    step=steps,
                    raw=current_raw,
                    normaliser=normaliser,
                    score=score,
                    done=False,
                    outcome="interrupted",
                )
                break

            # -- List legal actions
            legal_actions: list[dict] = adapter.list_actions(current_raw)

            # -- Normalise state
            if normaliser is not None:
                state = normaliser.normalise(
                    raw=current_raw,
                    legal_actions=legal_actions,
                    step=steps,
                    session_id=session_id,
                    game_id=game_id,
                    score=score,
                    done=done,
                )
            else:
                state = dict(current_raw)
                state.setdefault("game_id", game_id)
                state.setdefault("session_id", session_id)
                state.setdefault("step", steps)
                state.setdefault("state_text", "")
                state.setdefault("facts", {})
                state.setdefault("legal_actions", legal_actions)
                state.setdefault("score", score)
                state.setdefault("done", done)

            # -- Choose move via validator
            score_before: float | None = score

            final_action, game_response_raw, laya_calls, validator_info = choose_move(
                engine=engine,
                state=state,
                legal_actions=legal_actions,
                adapter=adapter,
            )

            # -- Read updated state after move
            new_raw = adapter.get_state()
            score_after: float | None = new_raw.get("score")
            final_score = score_after
            game_done: bool = bool(new_raw.get("done", False))

            # -- Judge the move
            good: bool | None = adapter.judge(prev_raw, game_response_raw, new_raw)

            # -- Aggregate latency / counters
            for call in laya_calls:
                lat = call.get("latency_ms", 0.0)
                if isinstance(lat, (int, float)):
                    total_laya_latency += lat
                    laya_call_count += 1

            retries: int = validator_info.get("retries", 0)
            used_fallback: bool = bool(validator_info.get("fallback", False))
            invalid_moves += retries
            if used_fallback:
                fallbacks += 1

            # -- Build the Event contract dict (AGENTS.md § 5.3)
            ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            outcome: str | None = (
                "good" if good is True
                else "bad" if good is False
                else "unknown"
            )

            event: dict[str, Any] = {
                "schema": 1,
                "session_id": session_id,
                "game_id": game_id,
                "ts": ts,
                "step": steps,
                "state": state,
                "laya_calls": laya_calls,
                "validator": validator_info,
                "final_action": final_action,
                "game_response": {
                    "good": good,
                    "score_before": score_before,
                    "score_after": score_after,
                    "done": game_done,
                    "message": (
                        game_response_raw.get("message")
                        if isinstance(game_response_raw, dict)
                        else None
                    ),
                },
                "outcome": outcome,
            }

            logger.event(event)

            # -- Tiny console line (step, action, probability, score)
            prob: float | None = None
            if laya_calls:
                accepted = next((c for c in laya_calls if c.get("accepted")), laya_calls[-1])
                prob = accepted.get("action_scores", {}).get(final_action)
            _console_step(steps, final_action, prob, score_after)

            # -- Advance loop state
            prev_raw = dict(new_raw)
            steps += 1

            if game_done:
                break

    except KeyboardInterrupt:
        completion_status = "interrupted"
        print("\n[loop] Interrupted by KeyboardInterrupt.", file=sys.stderr)
    finally:
        signal.signal(signal.SIGINT, original_sigint)

    # -- Close logger with summary (AGENTS.md § 5.4)
    ended_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    avg_latency = round(total_laya_latency / laya_call_count, 3) if laya_call_count else 0.0

    summary: dict[str, Any] = {
        "session_id": session_id,
        "game_id": game_id,
        "started_at": started_at,
        "ended_at": ended_at,
        "steps": steps,
        "final_score": final_score,
        "invalid_moves": invalid_moves,
        "fallbacks": fallbacks,
        "average_laya_latency_ms": avg_latency,
        "laya_call_count": laya_call_count,
        "completion_status": completion_status,
        "qualifying_score": None,
        "verified": None,
    }

    return logger.close(summary)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _emit_terminal_event(
    logger: Any,
    session_id: str,
    game_id: str,
    step: int,
    raw: dict[str, Any],
    normaliser: Any | None,
    score: float | None,
    done: bool,
    outcome: str,
) -> None:
    """Emit a no-action event for terminal states (game_over / interrupted)."""
    legal_actions: list[dict] = raw.get("legal_actions", [])

    if normaliser is not None:
        try:
            state = normaliser.normalise(
                raw=raw,
                legal_actions=legal_actions,
                step=step,
                session_id=session_id,
                game_id=game_id,
                score=score,
                done=done,
            )
        except Exception:
            state = dict(raw)
    else:
        state = dict(raw)
        state.setdefault("game_id", game_id)
        state.setdefault("session_id", session_id)
        state.setdefault("step", step)
        state.setdefault("state_text", "")
        state.setdefault("facts", {})
        state.setdefault("legal_actions", legal_actions)
        state.setdefault("score", score)
        state.setdefault("done", done)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    event: dict[str, Any] = {
        "schema": 1,
        "session_id": session_id,
        "game_id": game_id,
        "ts": ts,
        "step": step,
        "state": state,
        "laya_calls": [],
        "validator": {"retries": 0, "fallback": False, "rejections": []},
        "final_action": None,
        "game_response": {
            "good": None,
            "score_before": score,
            "score_after": score,
            "done": done,
            "message": None,
        },
        "outcome": outcome,
    }
    logger.event(event)


def _console_step(
    step: int,
    action: str,
    prob: float | None,
    score: float | None,
) -> None:
    """Print a compact one-liner per step for terminal viewers."""
    prob_str = f"{prob:.3f}" if prob is not None else "?"
    score_str = f"{score}" if score is not None else "?"
    print(f"[step {step:>4}]  action={action:<20}  p={prob_str:<7}  score={score_str}")


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------


def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="python -m bot.loop",
        description="Run Beat the Bot game episodes.",
    )
    p.add_argument("--adapter", default="mock",
                   help="Adapter name (default: mock).")
    p.add_argument("--question-set", default="v1_perception",
                   help="Laya question-set ID (default: v1_perception).")
    p.add_argument("--games", type=int, default=1,
                   help="Number of game episodes to run (default: 1).")
    p.add_argument("--seed", type=int, default=42,
                   help="Random seed forwarded to the adapter (default: 42).")
    p.add_argument("--max-steps", type=int, default=None,
                   help="Maximum decision steps per episode (default: unlimited).")
    p.add_argument("--base-url", default="http://localhost:8181",
                   help="Base URL for HTTP adapters.")
    p.add_argument("--logs-dir", default="logs/runs",
                   help="Directory to write event logs (default: logs/runs).")
    p.add_argument("--dry-run", action="store_true",
                   help="Inspect state and call engine but do NOT submit moves.")
    p.add_argument("-v", "--verbose", action="store_true",
                   help="Enable DEBUG logging.")
    return p


def main(argv: list[str] | None = None) -> None:
    """CLI entry point: ``python -m bot.loop``."""
    parser = _build_parser()
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(levelname)s  %(name)s  %(message)s",
    )

    from bot.adapters import get_adapter

    engine = _load_engine(args.question_set)

    normaliser = None
    if args.adapter in ("mock", "mock-v1"):
        try:
            from bot.normaliser import get_normaliser
            normaliser = get_normaliser("mock")
        except Exception as exc:
            print(f"[loop] WARNING: Could not load normaliser: {exc}", file=sys.stderr)

    for game_num in range(1, args.games + 1):
        print(f"\n{'='*60}")
        print(f"  Game {game_num}/{args.games}  |  adapter={args.adapter}  |  seed={args.seed}")
        print(f"{'='*60}")

        game_seed = args.seed + (game_num - 1)

        adapter = get_adapter(
            args.adapter,
            base_url=args.base_url,
            seed=game_seed,
        )

        game_id_str: str = adapter.name

        with _load_logger(game_id=game_id_str, logs_dir=args.logs_dir) as run_logger:
            summary = run_game(
                adapter=adapter,
                engine=engine,
                logger=run_logger,
                normaliser=normaliser,
                max_steps=args.max_steps,
                seed=game_seed,
            )

        print(f"\n[loop] Episode {game_num} summary:")
        for k, v in summary.items():
            print(f"  {k:<30}: {v}")

        adapter.close()


if __name__ == "__main__":
    main()
