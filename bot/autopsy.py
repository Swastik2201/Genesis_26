"""Decision Autopsy analyser (USP 1) for Beat the Bot (Lane D).

Turns every failed move into an empirical investigation by comparing
what Laya predicted with what actually happened in the game environment.

Verdict Taxonomy:
- illegal_move: Game engine rejected an action attempt (validator retries > 0,
                laya_call legal=False, or game rejection message).
- game_over: Move resulted in terminal loss (done=True and good=False).
- confident_miss: Chosen action confidence >= 0.70, but game response was negative.
- uncertain_miss: Chosen action confidence < 0.70, and game response was negative.
- lucky_hit: Chosen action confidence < 0.50, but game response was positive.
- as_predicted: Outcome matched prediction (confidence >= 0.50 and good=True,
                or standard non-terminal progression).

Notes and explanations are generated strictly from recorded facts and transparent rules.
All explanatory inferences are explicitly labeled as testable hypotheses.
"""

from pathlib import Path
from typing import Any, Optional
import argparse
import json
import sys

from bot.logger import load_events


VERDICTS = [
    "illegal_move",
    "game_over",
    "confident_miss",
    "uncertain_miss",
    "lucky_hit",
    "as_predicted",
]

SEVERITY_WEIGHTS = {
    "game_over": 1.0,
    "illegal_move": 0.95,
    "confident_miss": 0.85,
    "uncertain_miss": 0.60,
    "lucky_hit": 0.40,
    "as_predicted": 0.05,
}


def _extract_call_details(event: dict) -> tuple[str, float, Optional[str], dict]:
    """Extracts chosen action, confidence probability, question_id, and scores."""
    laya_calls = event.get("laya_calls", [])
    final_action = event.get("final_action")

    if not laya_calls:
        return final_action or "none", 0.5, None, {}

    # Prefer the last call or accepted call
    call = laya_calls[-1]
    for c in reversed(laya_calls):
        if c.get("accepted", True):
            call = c
            break

    chosen = final_action or call.get("chosen_action", "unknown")
    scores = call.get("action_scores", {})
    prob = scores.get(chosen)

    if prob is None or not isinstance(prob, (int, float)):
        raw = call.get("raw", {})
        if isinstance(raw, dict) and "prob" in raw and isinstance(raw["prob"], (int, float)):
            prob = float(raw["prob"])
        else:
            prob = 0.5
    else:
        prob = float(prob)

    # Question identifier
    question_id = call.get("question_set")
    questions = call.get("questions")
    if isinstance(questions, list) and questions and isinstance(questions[0], dict):
        q0 = questions[0]
        question_id = q0.get("id") or q0.get("text") or question_id
    elif isinstance(questions, dict):
        question_id = questions.get("id") or questions.get("text") or question_id

    return chosen, prob, str(question_id) if question_id else None, scores


def _determine_verdict(
    event: dict, chosen: str, prob: float
) -> tuple[str, float, str, str, str]:
    """Applies strict decision rules to classify the decision outcome."""
    validator = event.get("validator", {})
    game_resp = event.get("game_response", {})
    good = game_resp.get("good")
    done = bool(game_resp.get("done", False))
    retries = validator.get("retries", 0)
    rejections = validator.get("rejections", []) or validator.get("rejection_messages", [])

    # Check for illegal / rejected moves
    laya_calls = event.get("laya_calls", [])
    has_rejected_call = any(c.get("legal") is False or c.get("accepted") is False for c in laya_calls)
    is_illegal = bool(retries > 0 or rejections or has_rejected_call)

    expected = f"Expected safe outcome for action '{chosen}' ({prob * 100:.0f}% confidence)"
    actual_msg = game_resp.get("message") or ("good=True" if good else "good=False" if good is False else "neutral")
    actual = f"Game returned: {actual_msg}"

    if is_illegal:
        verdict = "illegal_move"
        severity = SEVERITY_WEIGHTS[verdict]
        expected = f"Action '{chosen}' was assumed legal by decision layer"
        actual = f"Rejected: {', '.join(rejections) if rejections else f'{retries} retry/validation failure'}"
        note = (
            f"Laya selected action '{chosen}', which the game rejected ({retries} retries). "
            f"Hypothesis: the legal action space shrank without updating the decision engine prompt."
        )
    elif done and good is False:
        verdict = "game_over"
        severity = SEVERITY_WEIGHTS[verdict]
        expected = f"Non-terminal progression with '{chosen}' ({prob * 100:.0f}% confidence)"
        actual = f"Game concluded with negative outcome: {actual_msg}"
        note = (
            f"Laya chose '{chosen}' with {prob * 100:.0f}% confidence, ending the session. "
            f"Hypothesis: question set failed to evaluate fatal hazards in the immediate decision horizon."
        )
    elif prob >= 0.70 and good is False:
        verdict = "confident_miss"
        severity = SEVERITY_WEIGHTS[verdict]
        note = (
            f"Laya was {prob * 100:.0f}% confident in '{chosen}', but game outcome was negative. "
            f"Hypothesis: question formulation exhibited high confidence despite ambiguous or misread state features."
        )
    elif prob < 0.70 and good is False:
        verdict = "uncertain_miss"
        severity = SEVERITY_WEIGHTS[verdict]
        note = (
            f"Laya had only {prob * 100:.0f}% confidence in '{chosen}', and game outcome was negative. "
            f"Hypothesis: model recognized uncertainty but lacked an evasive alternative with higher expected value."
        )
    elif prob < 0.50 and good is True:
        verdict = "lucky_hit"
        severity = SEVERITY_WEIGHTS[verdict]
        note = (
            f"Laya had low confidence ({prob * 100:.0f}%) in '{chosen}', yet game outcome was positive. "
            f"Hypothesis: move succeeded through environmental drift or lucky transition rather than strategic certainty."
        )
    else:
        verdict = "as_predicted"
        severity = SEVERITY_WEIGHTS[verdict]
        note = (
            f"Laya predicted '{chosen}' with {prob * 100:.0f}% confidence; game response confirmed success. "
            f"Outcome matched prediction."
        )

    return verdict, severity, expected, actual, note


def analyse(events: list[dict]) -> list[dict]:
    """Generates Decision Autopsy items for all steps in a game session.

    Returns a list of items exactly conforming to contracts/autopsy_item.schema.json.
    """
    items = []
    for ev in events:
        step = int(ev.get("step", len(items)))
        chosen, prob, question_id, scores = _extract_call_details(ev)
        verdict, severity, expected, actual, note = _determine_verdict(ev, chosen, prob)

        items.append({
            "step": step,
            "verdict": verdict,
            "expected": expected,
            "actual": actual,
            "note": note,
            "severity": round(severity, 2),
            "question_id": question_id,
            "probabilities": scores if scores else prob,
        })

    return items


def summary(items: list[dict]) -> dict:
    """Returns frequency counts per verdict category across autopsy items."""
    counts = {v: 0 for v in VERDICTS}
    counts["total_steps"] = len(items)
    for item in items:
        v = item.get("verdict")
        if v in counts:
            counts[v] += 1
    return counts


def worst(items: list[dict], k: int = 5) -> list[dict]:
    """Returns the top-k highest severity autopsy incidents, ordered descending."""
    return sorted(items, key=lambda it: (it.get("severity", 0.0), it.get("step", 0)), reverse=True)[:k]


def format_report(items: list[dict], session_id: str = "Unknown") -> str:
    """Formats an autopsy analysis as an ASCII terminal report for CLI inspection."""
    counts = summary(items)
    lines = [
        "=" * 72,
        f"  DECISION AUTOPSY REPORT — Session: {session_id}",
        "=" * 72,
        f"  Total Steps Evaluated : {counts['total_steps']}",
        f"  As Predicted          : {counts['as_predicted']}",
        f"  Confident Misses      : {counts['confident_miss']}",
        f"  Uncertain Misses      : {counts['uncertain_miss']}",
        f"  Lucky Hits            : {counts['lucky_hit']}",
        f"  Illegal Moves         : {counts['illegal_move']}",
        f"  Game Over Moves       : {counts['game_over']}",
        "-" * 72,
        "  Top Critical Incidents (Worst Cases):",
        "-" * 72,
    ]

    top_cases = worst(items, k=5)
    if not top_cases or all(c["verdict"] == "as_predicted" for c in top_cases):
        lines.append("  No critical anomalies or misses detected. All moves proceeded as predicted.")
    else:
        for idx, case in enumerate(top_cases, start=1):
            if case["verdict"] == "as_predicted":
                continue
            lines.extend([
                f"  [{idx}] Step {case['step']} — Verdict: {case['verdict'].upper()} (Severity: {case['severity']})",
                f"      Question ID : {case['question_id'] or 'none'}",
                f"      Expected    : {case['expected']}",
                f"      Actual      : {case['actual']}",
                f"      Note        : {case['note']}",
                "",
            ])

    lines.append("=" * 72)
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="Decision Autopsy Analyser (CLI)")
    parser.add_argument("log_file", help="Path to .jsonl session log")
    parser.add_argument("--json", action="store_true", help="Output raw JSON results")
    parser.add_argument("--worst", type=int, default=5, help="Number of worst incidents to highlight")
    parser.add_argument("--output", "-o", help="Write report/JSON to specified file")

    args = parser.parse_args()
    log_path = Path(args.log_file)
    if not log_path.exists():
        print(f"Error: Log file not found at {log_path}", file=sys.stderr)
        sys.exit(1)

    events = load_events(log_path)
    session_id = log_path.stem
    items = analyse(events)

    if args.json:
        output_data = {
            "session_id": session_id,
            "summary": summary(items),
            "worst": worst(items, k=args.worst),
            "items": items,
        }
        content = json.dumps(output_data, indent=2)
    else:
        content = format_report(items, session_id=session_id)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(content)
        print(f"[*] Autopsy report saved to: {args.output}")
    else:
        print(content)


if __name__ == "__main__":
    main()
