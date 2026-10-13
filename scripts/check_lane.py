#!/usr/bin/env python3
"""Lane boundary verification tool for Beat the Bot hackathon.

Usage:
    python scripts/check_lane.py <a|b|c|d>

Ensures that branches only touch files owned by their assigned lane,
checking git diff against origin/main...HEAD, staged changes, unstaged changes,
and untracked files.
"""

from pathlib import Path
import json
import subprocess
import sys


REPO_ROOT = Path(__file__).resolve().parent.parent
LANES_CONFIG_PATH = REPO_ROOT / "lanes.json"


def run_git(args: list[str]) -> list[str]:
    """Runs a git command and returns output lines stripped."""
    try:
        result = subprocess.run(
            ["git"] + args,
            cwd=REPO_ROOT,
            capture_output=True,
            text=True,
            check=True
        )
        return [line.strip().replace("\\", "/") for line in result.stdout.splitlines() if line.strip()]
    except subprocess.CalledProcessError as e:
        # If origin/main is not yet fetched or invalid, try alternative base
        return []


def get_changed_files() -> set[str]:
    """Gathers all modified, staged, and untracked files in the working tree and branch."""
    changed = set()

    # 1. Diff against origin/main...HEAD or main...HEAD
    diff_branch = run_git(["diff", "--name-only", "origin/main...HEAD"])
    if not diff_branch:
        diff_branch = run_git(["diff", "--name-only", "main...HEAD"])
    changed.update(diff_branch)

    # 2. Uncommitted staged changes
    changed.update(run_git(["diff", "--name-only", "--cached"]))

    # 3. Uncommitted unstaged changes
    changed.update(run_git(["diff", "--name-only"]))

    # 4. Untracked files from git status (-u lists individual files)
    status_lines = run_git(["status", "--porcelain", "-u"])
    for line in status_lines:
        if line.startswith("?? "):
            changed.add(line[3:].strip())
        elif len(line) > 3:
            changed.add(line[3:].strip())

    return changed


def is_path_allowed(file_path: str, allowed_prefixes: list[str]) -> bool:
    """Checks if a file matches any of the allowed path prefixes."""
    norm_path = file_path.replace("\\", "/").lstrip("./")
    for prefix in allowed_prefixes:
        norm_prefix = prefix.replace("\\", "/").lstrip("./")
        if norm_prefix.endswith("/"):
            if norm_path.startswith(norm_prefix):
                return True
        else:
            if norm_path == norm_prefix:
                return True
    return False


def main():
    if len(sys.argv) != 2:
        print("Usage: python scripts/check_lane.py <a|b|c|d>", file=sys.stderr)
        sys.exit(2)

    lane_key = sys.argv[1].strip().lower()

    if not LANES_CONFIG_PATH.exists():
        print(f"Error: lanes config not found at {LANES_CONFIG_PATH}", file=sys.stderr)
        sys.exit(2)

    with open(LANES_CONFIG_PATH, "r", encoding="utf-8") as f:
        lanes_data = json.load(f)

    if lane_key not in lanes_data:
        print(f"Error: Unknown lane '{lane_key}'. Valid lanes: {list(lanes_data.keys())}", file=sys.stderr)
        sys.exit(2)

    lane_info = lanes_data[lane_key]
    allowed_prefixes = list(lane_info.get("allowed_prefixes", []))

    # Phase 0 bootstrap exception: Member D creates initial skeleton placeholders
    if lane_key == "d":
        allowed_prefixes.extend([
            "bot/__init__.py",
            "bot/adapters/__init__.py",
            "bot/laya/__init__.py",
            "bot/questions/__init__.py",
            "mock_game/.gitkeep",
            "experiments/.gitkeep",
            "web/.gitkeep",
            "tests/lane_a/.gitkeep",
            "tests/lane_b/.gitkeep",
            "requirements/a.txt",
            "requirements/b.txt",
        ])

    changed_files = get_changed_files()

    if not changed_files:
        print(f"[OK] No changed files detected. Lane '{lane_key}' is clean.")
        sys.exit(0)

    violations = []
    for file_path in sorted(changed_files):
        # Ignore .git internals or deleted temp files if any
        if not file_path or file_path.startswith(".git/"):
            continue
        if not is_path_allowed(file_path, allowed_prefixes):
            violations.append(file_path)

    if violations:
        print(f"\n❌ LANE VIOLATION DETECTED for Lane '{lane_key}' ({lane_info.get('name')}):", file=sys.stderr)
        print("The following files are OUTSIDE your lane's ownership:\n", file=sys.stderr)
        for v in violations:
            print(f"  - {v}", file=sys.stderr)
        print(f"\nAllowed prefixes for Lane '{lane_key}':", file=sys.stderr)
        for prefix in allowed_prefixes:
            print(f"  + {prefix}", file=sys.stderr)
        print("\nPlease revert edits to files outside your lane or request changes from their owner.", file=sys.stderr)
        sys.exit(1)

    print(f"[OK] All {len(changed_files)} changed file(s) are permitted in Lane '{lane_key}' ({lane_info.get('name')}).")
    sys.exit(0)


if __name__ == "__main__":
    main()
