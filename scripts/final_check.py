#!/usr/bin/env python3
"""Pre-submission repository hygiene and readiness verification (Lane D).

Validates:
1. README.md exists and is populated.
2. logs/best/ contains at least one verified run file (or warns if pending game day).
3. Every run in logs/best/ passes check_every_move_logged compliance.
4. docs/writeup.md is inspected for remaining [TODO: number] markers.
5. Scans the workspace for accidental secret/credential leakage.
6. Verifies requirements.txt manifests and prints fresh venv install command.
"""

from pathlib import Path
import re
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from bot.logger import load_events
from scripts.check_every_move_logged import verify_session


# Suspicious secret patterns to detect
SECRET_PATTERNS = [
    re.compile(r"""(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']([A-Za-z0-9_-]{16,})["']""", re.IGNORECASE),
    re.compile(r"ghp_[A-Za-z0-9]{36}"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"-----BEGIN (?:RSA |EC )?PRIVATE KEY-----"),
]

IGNORED_DIRS = {".git", ".venv", "venv", "__pycache__", ".pytest_cache", "node_modules"}


def check_readme() -> tuple[bool, str]:
    readme_path = REPO_ROOT / "README.md"
    if not readme_path.exists():
        return False, "README.md is missing!"
    size = readme_path.stat().st_size
    if size < 500:
        return False, f"README.md appears incomplete ({size} bytes)."
    return True, f"README.md exists ({size} bytes)."


def check_best_runs() -> tuple[bool, str, list[str]]:
    best_dir = REPO_ROOT / "logs" / "best"
    if not best_dir.exists():
        return False, "logs/best/ directory is missing.", []

    jsonl_files = list(best_dir.glob("*.jsonl"))
    if not jsonl_files:
        return False, "logs/best/ has no .jsonl files. Run 'python scripts/best_runs.py' after gameplay.", []

    audit_errors = []
    for f in jsonl_files:
        events = load_events(f)
        passed, errors = verify_session(events, session_id=f.stem)
        if not passed:
            audit_errors.extend([f"{f.name}: {err}" for err in errors])

    if audit_errors:
        return False, f"Audit failed for {len(audit_errors)} issue(s) in logs/best/.", audit_errors

    return True, f"All {len(jsonl_files)} run(s) in logs/best/ pass full move-to-Laya compliance.", []


def check_writeup_todos() -> tuple[bool, list[str]]:
    writeup_path = REPO_ROOT / "docs" / "writeup.md"
    if not writeup_path.exists():
        return False, ["docs/writeup.md is missing!"]

    content = writeup_path.read_text(encoding="utf-8")
    todo_matches = re.findall(r"\[TODO:[^\]]*\]", content)
    return len(todo_matches) == 0, todo_matches


def scan_for_secrets() -> list[str]:
    leaks = []
    for p in REPO_ROOT.rglob("*"):
        if not p.is_file():
            continue
        if any(ignored in p.parts for ignored in IGNORED_DIRS):
            continue
        # Skip binary files or large files
        if p.suffix in {".png", ".jpg", ".jpeg", ".ico", ".pdf", ".pyc", ".lock"}:
            continue
        if p.stat().st_size > 1_000_000:
            continue

        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
            for pattern in SECRET_PATTERNS:
                if pattern.search(text):
                    rel_path = p.relative_to(REPO_ROOT)
                    # Exclude self check pattern
                    if rel_path == Path("scripts/final_check.py"):
                        continue
                    leaks.append(f"{rel_path}: Matches pattern {pattern.pattern}")
        except Exception:
            continue

    return leaks


def main():
    print("=" * 72)
    print("  BEAT THE BOT — PRE-SUBMISSION HYGIENE & AUDIT VERIFICATION")
    print("=" * 72)

    all_passed = True

    # 1. README check
    readme_ok, readme_msg = check_readme()
    print(f"[{'PASS' if readme_ok else 'FAIL'}] README Check: {readme_msg}")
    if not readme_ok:
        all_passed = False

    # 2. Best runs check
    best_ok, best_msg, best_errors = check_best_runs()
    status_tag = "PASS" if best_ok else "WARN"
    print(f"[{status_tag}] Best Runs Evidence: {best_msg}")
    for err in best_errors:
        print(f"       [!] {err}")

    # 3. Write-up TODO check
    todos_ok, todos = check_writeup_todos()
    if todos_ok:
        print("[PASS] Write-up Check: No pending [TODO] markers in docs/writeup.md.")
    else:
        print(f"[WARN] Write-up Check: Found {len(todos)} pending [TODO] marker(s) for real metrics:")
        for t in todos[:5]:
            print(f"       - {t}")
        if len(todos) > 5:
            print(f"       ... and {len(todos) - 5} more.")

    # 4. Secret scan
    leaks = scan_for_secrets()
    if not leaks:
        print("[PASS] Secret Scanner: No leaked credentials or private keys detected.")
    else:
        print(f"[FAIL] Secret Scanner: Found {len(leaks)} potential credential match(es):", file=sys.stderr)
        for leak in leaks:
            print(f"       [!] {leak}", file=sys.stderr)
        all_passed = False

    # 5. Requirements check
    req_file = REPO_ROOT / "requirements.txt"
    if req_file.exists():
        print(f"[PASS] Requirements Check: requirements.txt is present.")
        print("\n[*] Recommended Clean Venv Installation Command:")
        print("    python -m venv .venv && pip install -r requirements.txt\n")
    else:
        print("[FAIL] requirements.txt is missing!")
        all_passed = False

    # Summary
    print("=" * 72)
    if all_passed and best_ok and todos_ok:
        print("  [OK] SUBMISSION READINESS: ALL CHECKS PASSED - READY FOR FINAL SUBMISSION")
    elif all_passed:
        print("  [OK] SUBMISSION READINESS: INFRASTRUCTURE CLEAN. (Fill game-day metrics)")
    else:
        print("  [FAIL] SUBMISSION READINESS: ISSUES FOUND. Resolve errors above before PR.")
        sys.exit(1)

    print("=" * 72)


if __name__ == "__main__":
    main()
