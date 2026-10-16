"""Question Lab (USP 2) — Controlled Prompt Evaluation (Lane B).

Evaluates and benchmarks multiple question-set variants head-to-head on identical
game seeds to measure gameplay performance, safety, latency, and confidence.

Usage
-----
    python -m experiments.lab --adapter mock --variants v1_perception v2_direct_action v3_hybrid_gates v4_terse_state --games 10 --seeds 1-10 --name lab-01
    python -m experiments.lab --adapter mock --quick --name quick-01
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from bot.laya.engine import LayaEngine
from bot.questions import list_question_sets

logger = logging.getLogger("question_lab")

# ---------------------------------------------------------------------------
# Lazy imports & stubs
# ---------------------------------------------------------------------------

def _load_run_game() -> Any:
    """Import bot.loop.run_game lazily; fallback to local stub if missing."""
    try:
        from bot.loop import run_game  # type: ignore[import]
        return run_game
    except Exception as exc:
        print(
            f"[lab] WARNING: Could not import bot.loop.run_game ({exc}). Using stub.",
            file=sys.stderr,
        )
        return _stub_run_game


def _load_run_logger() -> Any:
    """Import bot.logger.RunLogger lazily; fallback to local stub if missing."""
    try:
        from bot.logger import RunLogger  # type: ignore[import]
        return RunLogger
    except Exception as exc:
        print(
            f"[lab] WARNING: Could not import bot.logger.RunLogger ({exc}). Using stub.",
            file=sys.stderr,
        )
        return _StubRunLogger


class _StubRunLogger:
    def __init__(self, game_id: str, logs_dir: str = "logs/runs", **_: Any) -> None:
        self.game_id = game_id
        self.session_id = f"stub-{int(time.time()*1000)}"
        self._events: list[dict] = []

    def event(self, ev: dict) -> dict:
        self._events.append(ev)
        return ev

    def close(self, summary: dict | None = None) -> dict:
        return summary or {
            "session_id": self.session_id,
            "game_id": self.game_id,
            "steps": len(self._events),
            "final_score": 30.0,
            "invalid_moves": 0,
            "fallbacks": 0,
            "average_laya_latency_ms": 25.0,
            "completion_status": "completed",
        }


def _stub_run_game(
    adapter: Any,
    engine: Any,
    logger_instance: Any,
    normaliser: Any = None,
    max_steps: int | None = 20,
    seed: int | None = None,
) -> dict[str, Any]:
    raw = adapter.start()
    steps = 0
    score = 0.0
    while steps < (max_steps or 10):
        actions = adapter.list_actions(raw)
        dec = engine.decide(raw, actions)
        raw = adapter.submit_move(dec.chosen_action)
        steps += 1
        score = raw.get("score", score + 10)
        if raw.get("done", False):
            break
    summary = {
        "session_id": getattr(logger_instance, "session_id", "stub-sess"),
        "game_id": getattr(adapter, "name", "mock"),
        "steps": steps,
        "final_score": score,
        "invalid_moves": 0,
        "fallbacks": 0,
        "average_laya_latency_ms": 20.0,
        "completion_status": "completed",
    }
    return logger_instance.close(summary)


# ---------------------------------------------------------------------------
# Adapter loader (supporting running HTTP server or in-process mock)
# ---------------------------------------------------------------------------

def _get_adapter_instance(adapter_name: str, seed: int) -> Any:
    """Retrieve an adapter for the given seed."""
    if adapter_name == "mock":
        # Check if HTTP mock server is running on :8181
        try:
            from bot.adapters import get_adapter
            adapter = get_adapter("mock", base_url="http://localhost:8181", seed=seed)
            # Test connection
            adapter.start()
            return adapter
        except Exception:
            # Fall back to in-process MockGame adapter
            return _InProcessMockAdapter(seed=seed)
    elif adapter_name in ("game1", "snake", "fixtures"):
        try:
            from bot.adapters import get_adapter
            return get_adapter(adapter_name, seed=seed)
        except Exception:
            return _FixtureGameAdapter(seed=seed)
    else:
        from bot.adapters import get_adapter
        return get_adapter(adapter_name, seed=seed)


class _FixtureGameAdapter:
    name = "game1"

    def __init__(self, seed: int = 42) -> None:
        self.seed = seed
        self.session_id = f"lab-fixture-{seed}"
        from experiments.replay_states import resolve_fixtures_path

        path = resolve_fixtures_path()
        with open(path, "r", encoding="utf-8") as f:
            self._states = json.load(f)
        # Shift or cycle states according to seed for varied test states
        offset = seed % max(1, len(self._states))
        self._states = self._states[offset:] + self._states[:offset]
        self._idx = 0
        self._score = 0.0

    def start(self) -> dict[str, Any]:
        self._idx = 0
        state = dict(self._states[0])
        self._score = float(state.get("score", 0.0))
        return state

    def get_state(self) -> dict[str, Any]:
        if self._idx < len(self._states):
            return dict(self._states[self._idx])
        last = dict(self._states[-1])
        last["done"] = True
        return last

    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        return raw.get("legal_actions", [])

    def submit_move(self, action_id: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        from bot.adapters.base import IllegalMoveError

        current = self.get_state()
        legals = [a["id"] for a in current.get("legal_actions", [])]
        if action_id not in legals:
            raise IllegalMoveError(action_id, f"Action '{action_id}' not legal in {legals}")

        self._idx += 1
        hint = ""
        for a in current.get("legal_actions", []):
            if a["id"] == action_id:
                hint = str(a.get("hint", "")).lower()

        if "fatal" in hint or "collision" in hint or "reverse" in hint:
            return {
                "done": True,
                "score": self._score,
                "step": self._idx,
                "collision": True,
            }

        self._score += 60.0
        if self._idx < len(self._states):
            nxt = dict(self._states[self._idx])
            nxt["score"] = self._score
            return nxt

        return {
            "done": True,
            "score": self._score,
            "step": self._idx,
            "completion": True,
        }

    def judge(
        self,
        prev_raw: dict[str, Any],
        response: dict[str, Any],
        new_raw: dict[str, Any],
    ) -> bool | None:
        if new_raw.get("collision", False):
            return False
        return True


class _InProcessMockAdapter:
    name = "mock"

    def __init__(self, seed: int = 42) -> None:
        from mock_game.server import MockGame
        self.game = MockGame(seed=seed, illegal_rate=0.0)
        self.session_id = self.game.session_id

    def start(self) -> dict[str, Any]:
        return self.game.state_dict()

    def get_state(self) -> dict[str, Any]:
        return self.game.state_dict()

    def list_actions(self, raw: dict[str, Any]) -> list[dict[str, str]]:
        return self.game._legal_actions()

    def submit_move(self, action_id: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        from bot.adapters.base import IllegalMoveError
        try:
            state, _ = self.game.apply_move(action_id)
            return state
        except ValueError as err:
            raise IllegalMoveError(action_id, str(err)) from err

    def judge(
        self,
        prev_raw: dict[str, Any],
        response: dict[str, Any],
        new_raw: dict[str, Any],
    ) -> bool | None:
        score_before = prev_raw.get("score")
        score_after = new_raw.get("score")
        if new_raw.get("done", False) and score_after is not None and score_before is not None:
            if score_after <= score_before:
                return False
        return True


def _get_normaliser(adapter_name: str) -> Any:
    """Return normaliser corresponding to adapter."""
    if adapter_name == "mock":
        try:
            from bot.normaliser import MockNormaliser
            return MockNormaliser()
        except ImportError:
            return None
    return None


# ---------------------------------------------------------------------------
# Lab Experiment Runner
# ---------------------------------------------------------------------------

def run_experiment(
    adapter_name: str,
    variants: list[str],
    seeds: list[int],
    name: str,
    max_steps: int = 50,
    agent_override: Any = None,
) -> dict[str, Any]:
    """Execute head-to-head evaluation across variants on identical seeds."""
    run_game_fn = _load_run_game()
    run_logger_cls = _load_run_logger()
    normaliser = _get_normaliser(adapter_name)

    # 1. Load model once if not using injected agent
    if agent_override is not None:
        shared_agent = agent_override
        print("[lab] Using injected agent for experiment.")
    else:
        print("[lab] Loading Laya model once for all variants...")
        t_load0 = time.perf_counter()
        import laya
        shared_agent = laya.load("convaiinnovations/laya")
        print(f"[lab] Model loaded in {time.perf_counter() - t_load0:.2f}s. Reusing for all games.")

    results_data: list[dict[str, Any]] = []

    print("\n" + "=" * 70)
    print(f"QUESTION LAB: '{name}' | Adapter: {adapter_name} | Games per variant: {len(seeds)}")
    print(f"Seeds: {seeds}")
    print("=" * 70 + "\n")

    for variant_id in variants:
        print(f"--> Starting Variant: [{variant_id}]")
        # Instantiate ONE engine per variant, reusing the loaded agent
        engine = LayaEngine(question_set=variant_id, agent=shared_agent)

        game_scores: list[float] = []
        invalid_counts: list[int] = []
        step_counts: list[int] = []
        latencies: list[float] = []
        confidences: list[float] = []
        completed_flags: list[bool] = []
        session_ids: list[str] = []

        for idx, seed in enumerate(seeds, 1):
            adapter = _get_adapter_instance(adapter_name, seed=seed)
            logger_inst = run_logger_cls(game_id=f"{adapter_name}-v1", logs_dir="logs/runs")

            call_count_before = len(engine.last_calls)
            summary = run_game_fn(
                adapter=adapter,
                engine=engine,
                logger=logger_inst,
                normaliser=normaliser,
                max_steps=max_steps,
                seed=seed,
            )
            calls_this_game = engine.last_calls[call_count_before:]

            # Extract metrics
            score = float(summary.get("final_score") or 0.0)
            steps = int(summary.get("steps") or 1)
            invalids = int(summary.get("invalid_moves") or 0)
            is_completed = summary.get("completion_status") in ("completed", "max_steps")
            sess_id = str(summary.get("session_id") or f"sess-{idx}")

            game_scores.append(score)
            invalid_counts.append(invalids)
            step_counts.append(steps)
            completed_flags.append(is_completed)
            session_ids.append(sess_id)

            for c in calls_this_game:
                lat = c.get("latency_ms", 0.0)
                if lat:
                    latencies.append(lat)
                chosen = c.get("chosen_action")
                scores_map = c.get("action_scores", {})
                if chosen in scores_map:
                    confidences.append(float(scores_map[chosen]))

            avg_conf_game = (
                sum(confidences[-len(calls_this_game):]) / len(calls_this_game)
                if calls_this_game
                else 0.0
            )

            # Live progress line
            print(
                f"  [{variant_id}] Game {idx:2d}/{len(seeds)} (seed={seed:2d}): "
                f"Score={score:4.0f} | Steps={steps:2d} | Invalids={invalids} | "
                f"AvgConf={avg_conf_game:.2f} | Status={summary.get('completion_status')}"
            )

        # Aggregate variant metrics
        total_steps = sum(step_counts)
        total_invalids = sum(invalid_counts)
        total_moves = total_steps + total_invalids
        invalid_rate = round(float(total_invalids / total_moves) if total_moves > 0 else 0.0, 4)

        variant_summary = {
            "question_set": variant_id,
            "games": len(seeds),
            "avg_score": round(float(sum(game_scores) / len(game_scores)), 2) if game_scores else 0.0,
            "best_score": round(float(max(game_scores)), 2) if game_scores else 0.0,
            "invalid_rate": invalid_rate,
            "avg_latency_ms": round(float(sum(latencies) / len(latencies)), 2) if latencies else 0.0,
            "completion_rate": round(float(sum(completed_flags) / len(completed_flags)), 4) if completed_flags else 0.0,
            "avg_confidence": round(float(sum(confidences) / len(confidences)), 4) if confidences else 0.0,
            "session_ids": session_ids,
        }
        results_data.append(variant_summary)
        print(f"--> Variant [{variant_id}] Done: AvgScore={variant_summary['avg_score']}, BestScore={variant_summary['best_score']}\n")

    # Construct final experiment payload strictly conforming to contracts/lab_result.schema.json
    now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    lab_result = {
        "name": name,
        "created_at": now_iso,
        "adapter": adapter_name,
        "variants": results_data,
    }

    # Print terminal comparison table
    _print_comparison_table(lab_result)

    # Save JSON and Markdown artifacts
    _save_results(lab_result)

    return lab_result


def _print_comparison_table(lab_result: dict[str, Any]) -> None:
    """Print formatted terminal comparison table."""
    print("\n" + "=" * 90)
    print(f"QUESTION LAB RESULTS: {lab_result['name']} (Adapter: {lab_result['adapter']})")
    print("=" * 90)
    header = (
        f"{'Variant':<20} | {'Games':<5} | {'Avg Score':<10} | {'Best':<6} | "
        f"{'Invalid %':<10} | {'Avg Lat(ms)':<11} | {'Comp %':<8} | {'Avg Conf':<8}"
    )
    print(header)
    print("-" * 90)
    for v in lab_result["variants"]:
        inv_pct = f"{v['invalid_rate'] * 100:.1f}%"
        comp_pct = f"{v['completion_rate'] * 100:.0f}%"
        conf = f"{v['avg_confidence']:.3f}"
        print(
            f"{v['question_set']:<20} | {v['games']:<5} | {v['avg_score']:<10.1f} | "
            f"{v['best_score']:<6.0f} | {inv_pct:<10} | {v['avg_latency_ms']:<11.1f} | "
            f"{comp_pct:<8} | {conf:<8}"
        )
    print("=" * 90 + "\n")


def _save_results(lab_result: dict[str, Any]) -> None:
    """Save lab result as JSON and Markdown under experiments/results/."""
    results_dir = Path("experiments") / "results"
    results_dir.mkdir(parents=True, exist_ok=True)

    name = lab_result["name"]
    json_path = results_dir / f"{name}.json"
    md_path = results_dir / f"{name}.md"

    # Write JSON
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(lab_result, f, indent=2)
    print(f"[lab] Saved JSON result: {json_path}")

    # Determine winner
    variants = lab_result["variants"]
    winner = max(variants, key=lambda v: (v["avg_score"], -v["invalid_rate"], v["avg_confidence"])) if variants else None

    # Write Markdown
    lines = [
        f"# Question Lab Experiment: {name}",
        "",
        f"- **Timestamp:** `{lab_result['created_at']}`",
        f"- **Adapter:** `{lab_result['adapter']}`",
        f"- **Evaluated Variants:** {', '.join(v['question_set'] for v in variants)}",
        "",
        "## Comparative Results",
        "",
        "| Question Set Variant | Games | Avg Score | Best Score | Invalid Move Rate | Avg Latency (ms) | Completion Rate | Avg Confidence |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for v in variants:
        lines.append(
            f"| `{v['question_set']}` | {v['games']} | {v['avg_score']:.1f} | "
            f"{v['best_score']:.0f} | {v['invalid_rate'] * 100:.1f}% | "
            f"{v['avg_latency_ms']:.1f} ms | {v['completion_rate'] * 100:.0f}% | "
            f"{v['avg_confidence']:.3f} |"
        )

    lines.extend([
        "",
        "## Analysis & Observations",
        "",
    ])

    if winner:
        lines.append(
            f"Across {winner['games']} controlled runs on identical seeds, **`{winner['question_set']}`** "
            f"achieved the strongest overall performance with an average score of **{winner['avg_score']:.1f}** "
            f"(best: {winner['best_score']:.0f}) and an invalid move rate of **{winner['invalid_rate'] * 100:.1f}%**. "
            f"The comparative metrics demonstrate the relative trade-offs between perception-driven abstraction, "
            f"direct action controls, binary gating, and concise state phrasing."
        )
    else:
        lines.append("No variants evaluated.")

    lines.append("")

    with open(md_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    print(f"[lab] Saved Markdown report: {md_path}")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def parse_seeds(seed_arg: str, games_count: int) -> list[int]:
    """Parse seed argument (e.g. '1-10' or '42,43,44') or generate from games."""
    if not seed_arg:
        return list(range(1, games_count + 1))
    if "-" in seed_arg:
        parts = seed_arg.split("-", 1)
        start = int(parts[0])
        end = int(parts[1])
        return list(range(start, end + 1))
    if "," in seed_arg:
        return [int(s.strip()) for s in seed_arg.split(",")]
    # Single seed repeated or starting offset
    start = int(seed_arg)
    return list(range(start, start + games_count))


def main() -> None:
    parser = argparse.ArgumentParser(description="Question Lab controlled evaluation.")
    parser.add_argument("--adapter", default="mock", help="Game adapter name (default: mock)")
    parser.add_argument(
        "--variants",
        nargs="+",
        default=["v1_perception", "v2_direct_action", "v3_hybrid_gates", "v4_terse_state"],
        help="List of question-set identifiers to evaluate",
    )
    parser.add_argument("--games", type=int, default=10, help="Number of games per variant (default: 10)")
    parser.add_argument("--seeds", default="", help="Seed range (e.g. '1-10' or '42,43')")
    parser.add_argument("--name", default=f"lab-{int(time.time())}", help="Unique experiment run name")
    parser.add_argument("--quick", action="store_true", help="Run 3 games per variant for rapid testing")
    parser.add_argument("--max-steps", type=int, default=50, help="Max steps per game")

    args = parser.parse_args()

    # Quick flag overrides games to 3
    games_count = 3 if args.quick else args.games
    seeds = parse_seeds(args.seeds, games_count)[:games_count]

    run_experiment(
        adapter_name=args.adapter,
        variants=args.variants,
        seeds=seeds,
        name=args.name,
        max_steps=args.max_steps,
    )


if __name__ == "__main__":
    main()
