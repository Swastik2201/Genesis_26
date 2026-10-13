#!/usr/bin/env python3
"""Session statistics calculator for Beat the Bot (Lane D).

Extracts and displays exact empirical metrics for runs:
- Steps and total Laya calls
- Mean and p95 inference latency (ms)
- Invalid move attempts (validator retries)
- Fallbacks executed
- Final scores and completion status
"""

from pathlib import Path
import argparse
import json
import statistics
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from bot.logger import load_events
DEFAULT_LOGS_DIR = REPO_ROOT / "logs" / "runs"


def compute_stats(events: list[dict], session_id: str = "unknown") -> dict:
    """Computes empirical metrics from an event sequence."""
    if not events:
        return {
            "session_id": session_id,
            "steps": 0,
            "laya_calls": 0,
            "mean_latency_ms": 0.0,
            "p95_latency_ms": 0.0,
            "invalid_moves": 0,
            "fallbacks": 0,
            "final_score": None,
            "completion_status": "empty",
        }

    first_ev = events[0]
    last_ev = events[-1]
    game_id = first_ev.get("game_id", "unknown")

    latencies: list[float] = []
    laya_calls_count = 0
    invalid_moves = 0
    fallbacks = 0

    for ev in events:
        val = ev.get("validator", {})
        retries = val.get("retries", 0)
        rejections = val.get("rejections", []) or val.get("rejection_messages", [])
        if retries > 0:
            invalid_moves += retries
        elif rejections:
            invalid_moves += len(rejections)

        if val.get("fallback") is True:
            fallbacks += 1

        for call in ev.get("laya_calls", []):
            laya_calls_count += 1
            lat = call.get("latency_ms")
            if isinstance(lat, (int, float)):
                latencies.append(float(lat))

    mean_lat = round(statistics.mean(latencies), 2) if latencies else 0.0

    if not latencies:
        p95_lat = 0.0
    elif len(latencies) == 1:
        p95_lat = latencies[0]
    else:
        # 95th percentile
        sorted_lats = sorted(latencies)
        idx = int(0.95 * (len(sorted_lats) - 1))
        p95_lat = round(sorted_lats[idx], 2)

    # Score
    final_score = None
    game_resp = last_ev.get("game_response", {})
    if game_resp.get("score_after") is not None:
        final_score = game_resp.get("score_after")
    elif last_ev.get("state", {}).get("score") is not None:
        final_score = last_ev.get("state", {}).get("score")

    done = bool(game_resp.get("done", False) or last_ev.get("state", {}).get("done", False))
    completion_status = "completed" if done else "interrupted"

    return {
        "session_id": session_id,
        "game_id": game_id,
        "steps": len(events),
        "laya_calls": laya_calls_count,
        "mean_latency_ms": mean_lat,
        "p95_latency_ms": p95_lat,
        "invalid_moves": invalid_moves,
        "fallbacks": fallbacks,
        "final_score": final_score,
        "completion_status": completion_status,
    }


def format_stats_table(stats_list: list[dict]) -> str:
    """Formats list of session stats as a clean terminal table."""
    lines = [
        "=" * 88,
        "  SESSION PERFORMANCE METRICS",
        "=" * 88,
        f"{'Session ID':<24} {'Score':<8} {'Steps':<7} {'Calls':<7} {'Mean(ms)':<10} {'p95(ms)':<9} {'Invalid':<9} {'Fallback':<8} {'Status'}",
        "-" * 88,
    ]

    for s in stats_list:
        sess_str = s["session_id"][:22]
        score_str = str(s["final_score"]) if s["final_score"] is not None else "-"
        lines.append(
            f"{sess_str:<24} {score_str:<8} {s['steps']:<7} {s['laya_calls']:<7} "
            f"{s['mean_latency_ms']:<10.1f} {s['p95_latency_ms']:<9.1f} "
            f"{s['invalid_moves']:<9} {s['fallbacks']:<8} {s['completion_status']}"
        )

    lines.append("=" * 88)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Empirical log statistics for write-up & verification")
    parser.add_argument("target", nargs="?", default=None, help="Specific session ID or path to .jsonl file")
    parser.add_argument("--logs-dir", default=str(DEFAULT_LOGS_DIR), help="Logs directory to search")
    parser.add_argument("--json", action="store_true", help="Output raw JSON data")

    args = parser.parse_args()

    files_to_check: list[Path] = []
    logs_dir = Path(args.logs_dir)

    if args.target:
        p = Path(args.target)
        if p.exists():
            files_to_check.append(p)
        else:
            # Check within logs_dir
            candidate = logs_dir / f"{args.target}.jsonl"
            if candidate.exists():
                files_to_check.append(candidate)
            else:
                print(f"Error: Target '{args.target}' not found.", file=sys.stderr)
                sys.exit(1)
    else:
        if logs_dir.exists():
            files_to_check = sorted(logs_dir.glob("*.jsonl"))

    if not files_to_check:
        print(f"[!] No log files found in {logs_dir}")
        sys.exit(0)

    all_stats = []
    for fp in files_to_check:
        events = load_events(fp)
        st = compute_stats(events, session_id=fp.stem)
        all_stats.append(st)

    if args.json:
        print(json.dumps(all_stats, indent=2))
    else:
        print(format_stats_table(all_stats))


if __name__ == "__main__":
    main()
