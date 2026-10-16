#!/usr/bin/env python3
"""Audit tool: Verify every submitted move traces to a logged Laya call.

Enforces the non-negotiable competition rule:
- Every decision step must contain at least one recorded Laya call.
- Every submitted move (final_action) must trace to a chosen_action from a
  recorded Laya call (or explicitly documented fallback from Laya's last scores).
- Step numbers must be contiguous (0, 1, 2, ...).

Exits non-zero with descriptive failure messages on violation.
"""

from pathlib import Path
import argparse
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from bot.logger import load_events
DEFAULT_LOGS_DIR = REPO_ROOT / "logs" / "runs"


def verify_session(events: list[dict], session_id: str = "unknown") -> tuple[bool, list[str]]:
    """Verifies move-to-Laya call traceability and step continuity for a session."""
    errors = []

    if not events:
        errors.append(f"Session '{session_id}' has no recorded events.")
        return False, errors

    for idx, ev in enumerate(events):
        step = ev.get("step")

        # 1. Contiguous step check
        if step != idx:
            errors.append(
                f"Step continuity broken at index {idx}: expected step {idx}, but found step {step}."
            )

        # 2. At least one recorded Laya call per step
        laya_calls = ev.get("laya_calls", [])
        if not laya_calls or len(laya_calls) == 0:
            errors.append(
                f"Step {step}: Missing laya_calls. Every submitted step must record at least one Laya call."
            )
            continue

        # 3. Action traceability check
        final_action = ev.get("final_action")
        if final_action is not None:
            chosen_actions = [c.get("chosen_action") for c in laya_calls]
            is_fallback = bool(ev.get("validator", {}).get("fallback", False))

            if final_action not in chosen_actions and not is_fallback:
                errors.append(
                    f"Step {step}: final_action '{final_action}' does not match any chosen_action "
                    f"in recorded laya_calls ({chosen_actions}) and is not marked as an approved fallback."
                )

    passed = (len(errors) == 0)
    return passed, errors


def audit_file(file_path: Path) -> bool:
    """Audits a single .jsonl file and prints results."""
    session_id = file_path.stem
    events = load_events(file_path)
    passed, errors = verify_session(events, session_id=session_id)

    if passed:
        print(f"✅ [PASS] Session '{session_id}': {len(events)} steps verified. Every move traces to Laya.")
        return True
    else:
        print(f"❌ [FAIL] Session '{session_id}' failed compliance audit:")
        for err in errors:
            print(f"    - {err}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Verify move-to-Laya call traceability and step continuity"
    )
    parser.add_argument(
        "target",
        nargs="?",
        default=None,
        help="Session ID or path to .jsonl log file",
    )
    parser.add_argument(
        "--all",
        action="store_true",
        help="Audit all .jsonl logs in logs directory",
    )
    parser.add_argument(
        "--logs-dir",
        default=str(DEFAULT_LOGS_DIR),
        help="Directory to search for logs",
    )

    args = parser.parse_args()
    logs_dir = Path(args.logs_dir)

    targets: list[Path] = []

    if args.all:
        if logs_dir.exists():
            targets = sorted(logs_dir.glob("*.jsonl"))
        if not targets:
            print(f"[!] No .jsonl logs found in {logs_dir}")
            sys.exit(0)
    elif args.target:
        p = Path(args.target)
        if p.exists():
            targets.append(p)
        else:
            candidate = logs_dir / f"{args.target}.jsonl"
            if candidate.exists():
                targets.append(candidate)
            else:
                print(f"Error: Target '{args.target}' not found.", file=sys.stderr)
                sys.exit(1)
    else:
        print("Usage: python scripts/check_every_move_logged.py <session_id> [--all] [--logs-dir <dir>]")
        sys.exit(2)

    total_checked = len(targets)
    all_passed = True

    print(f"[*] Auditing {total_checked} session(s) for move-to-Laya traceability...")
    for t in targets:
        if not audit_file(t):
            all_passed = False

    if not all_passed:
        print(f"\n❌ AUDIT FAILED: One or more sessions violated the non-negotiable Laya move rule.", file=sys.stderr)
        sys.exit(1)

    print(f"\n✅ AUDIT COMPLETE: All {total_checked} session(s) passed full compliance verification.")
    sys.exit(0)


if __name__ == "__main__":
    main()
