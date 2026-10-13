#!/usr/bin/env python3
"""Best runs selection and evidence exporter (USP 3) for Beat the Bot (Lane D).

Scans logs/runs/*.summary.json (and unclosed .jsonl files), ranks sessions per
game by final score, flags runs meeting qualifying score thresholds, copies the
top N runs into logs/best/, and generates docs/best_runs.md with an auditable table.

SAFETY RULE:
Never edits or deletes any file in logs/runs/.
"""

from datetime import datetime, timezone
from pathlib import Path
import argparse
import shutil
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from bot.logger import list_sessions
DEFAULT_RUNS_DIR = REPO_ROOT / "logs" / "runs"
DEFAULT_BEST_DIR = REPO_ROOT / "logs" / "best"
DEFAULT_OUTPUT_DOC = REPO_ROOT / "docs" / "best_runs.md"


def export_best_runs(
    runs_dir: Path = DEFAULT_RUNS_DIR,
    best_dir: Path = DEFAULT_BEST_DIR,
    top_n: int = 5,
    min_score: float | None = None,
    output_doc: Path = DEFAULT_OUTPUT_DOC,
) -> list[dict]:
    """Ranks sessions, copies top N into best_dir, and writes docs/best_runs.md."""
    runs_dir = Path(runs_dir)
    best_dir = Path(best_dir)
    output_doc = Path(output_doc)

    best_dir.mkdir(parents=True, exist_ok=True)
    output_doc.parent.mkdir(parents=True, exist_ok=True)

    all_sessions = list_sessions(runs_dir)
    if not all_sessions:
        print(f"[!] No sessions found in {runs_dir}")
        # Write empty template
        _write_markdown_doc(output_doc, [], min_score)
        return []

    # Group sessions by game_id
    games: dict[str, list[dict]] = {}
    for s in all_sessions:
        g = s.get("game_id", "unknown")
        games.setdefault(g, []).append(s)

    selected_best: list[dict] = []

    for game_id, sessions in games.items():
        # Rank by final_score descending (None treated as -infinity)
        sorted_sessions = sorted(
            sessions,
            key=lambda item: (
                item.get("final_score") if item.get("final_score") is not None else float("-inf"),
                item.get("steps", 0),
            ),
            reverse=True,
        )

        top_game_sessions = sorted_sessions[:top_n]

        for s in top_game_sessions:
            sess_id = s["session_id"]
            # Copy .jsonl
            src_jsonl = runs_dir / f"{sess_id}.jsonl"
            if src_jsonl.exists():
                shutil.copy2(src_jsonl, best_dir / f"{sess_id}.jsonl")

            # Copy .summary.json if exists
            src_summary = runs_dir / f"{sess_id}.summary.json"
            if src_summary.exists():
                shutil.copy2(src_summary, best_dir / f"{sess_id}.summary.json")

            # Check qualifying score
            f_score = s.get("final_score")
            meets_qualifying = (
                bool(min_score is not None and f_score is not None and f_score >= min_score)
            )
            s_copy = dict(s)
            s_copy["qualifies"] = meets_qualifying
            selected_best.append(s_copy)

    _write_markdown_doc(output_doc, selected_best, min_score)
    return selected_best


def _write_markdown_doc(output_doc: Path, sessions: list[dict], min_score: float | None):
    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    lines = [
        "# Best Runs Evidence Log (USP 3)",
        "",
        "> Canonical audit record of top-performing game runs powered by Laya.",
        "",
        f"- **Last Updated**: `{now_utc}`",
        f"- **Qualifying Score Threshold**: `{min_score if min_score is not None else 'None specified'}`",
        f"- **Total Preserved Runs in `logs/best/`**: `{len(sessions)}`",
        "",
        "## Verified Run Leaderboard",
        "",
        "| Game | Session ID | Final Score | Steps | Laya Calls | Status | Qualifying | SHA-256 | Log File |",
        "| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :--- | :--- |",
    ]

    if not sessions:
        lines.append("| *None* | *No runs recorded yet* | - | - | - | - | - | - | - |")
    else:
        for s in sessions:
            sess_id = s.get("session_id", "unknown")
            game_id = s.get("game_id", "unknown")
            score = s.get("final_score", "null")
            steps = s.get("steps", 0)
            calls = s.get("laya_call_count", 0)
            status = s.get("completion_status", "unknown")
            qualifies = "✅ Yes" if s.get("qualifies") else ("⚠️ Below Min" if min_score is not None else "N/A")
            sha = s.get("sha256", "")
            sha_short = f"`{sha[:10]}...`" if sha else "none"
            link = f"[`{sess_id}.jsonl`](file:///logs/best/{sess_id}.jsonl)"

            lines.append(
                f"| {game_id} | `{sess_id}` | **{score}** | {steps} | {calls} | {status} | {qualifies} | {sha_short} | {link} |"
            )

    lines.extend([
        "",
        "---",
        "",
        "## Audit and Reproduction Instructions",
        "",
        "To verify that every move in any preserved run was genuinely produced by Laya without hardcoded fallbacks or human intervention:",
        "```bash",
        "# 1. Verify tamper-proof file hash and Laya move traceability",
        "python scripts/check_every_move_logged.py <session_id> --logs-dir logs/best",
        "",
        "# 2. Run Decision Autopsy on the run",
        "python -m bot.autopsy logs/best/<session_id>.jsonl",
        "",
        "# 3. Compute detailed latency and decision metrics",
        "python scripts/log_stats.py logs/best/<session_id>.jsonl",
        "```",
        "",
    ])

    with open(output_doc, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def main():
    parser = argparse.ArgumentParser(description="Export top runs and generate audit table")
    parser.add_argument("--runs-dir", default=str(DEFAULT_RUNS_DIR), help="Source runs directory")
    parser.add_argument("--best-dir", default=str(DEFAULT_BEST_DIR), help="Destination best directory")
    parser.add_argument("--top", type=int, default=5, help="Number of top runs per game to preserve")
    parser.add_argument("--min-score", type=float, default=None, help="Qualifying score threshold")
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_DOC), help="Markdown document path")

    args = parser.parse_args()

    results = export_best_runs(
        runs_dir=Path(args.runs_dir),
        best_dir=Path(args.best_dir),
        top_n=args.top,
        min_score=args.min_score,
        output_doc=Path(args.output),
    )

    print(f"[OK] Exported {len(results)} best run(s) to {args.best_dir}")
    print(f"[OK] Wrote documentation to {args.output}")


if __name__ == "__main__":
    main()
