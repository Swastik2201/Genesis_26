"""Confidence Reality Check — Calibration & Reliability Analysis (Lane B / USP 4).

Contract reference: AGENTS.md § 5.8 (Calibration result shape)
Schema:            contracts/calibration_result.schema.json

Computes:
1. Expected Calibration Error (ECE) with 10 equal-width bins.
2. Reliability diagram bins (lo, hi, n, mean_confidence, accuracy).
3. Selective prediction threshold sweep (coverage vs accuracy for t in [0.5, 0.95]).
4. Optimal recommended threshold balancing target accuracy with sample coverage.
5. Per-question-type calibration breakdown.
6. Optional scalar temperature scaling optimization via NLL minimization.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import sys
from typing import Any


def compute(
    events: list[dict[str, Any]],
    target_accuracy: float = 0.90,
    min_samples: int = 20,
) -> dict[str, Any]:
    """Compute calibration metrics from recorded game events.

    Parameters
    ----------
    events : list[dict[str, Any]]
        List of JSONL event dictionaries conforming to the Event contract.
    target_accuracy : float, default 0.90
        Target accuracy for recommending a selective decision threshold.
    min_samples : int, default 20
        Minimum number of covered samples required to recommend a threshold.

    Returns
    -------
    dict[str, Any]
        Dictionary strictly conforming to contracts/calibration_result.schema.json:
        - n: integer (number of steps with known boolean outcome)
        - accuracy: float in [0.0, 1.0]
        - ece: float in [0.0, 1.0]
        - bins: list of 10 dicts (lo, hi, n, mean_confidence, accuracy)
        - thresholds: list of dicts (threshold, coverage, accuracy)
        - by_question_type: dict mapping question types to sub-calibration metrics
        - recommended_threshold: float or None
    """
    samples: list[tuple[float, int, str]] = []

    for event in events:
        if not isinstance(event, dict):
            continue

        game_response = event.get("game_response", {})
        if not isinstance(game_response, dict):
            continue

        good = game_response.get("good")
        # Skip steps where outcome is null/unknown
        if good is None or not isinstance(good, bool):
            continue

        laya_calls = event.get("laya_calls", [])
        if not laya_calls or not isinstance(laya_calls, list):
            continue

        last_call = laya_calls[-1]
        if not isinstance(last_call, dict):
            continue

        chosen_action = (
            last_call.get("chosen_action")
            or event.get("final_action")
            or ""
        )
        action_scores = last_call.get("action_scores", {})
        if not isinstance(action_scores, dict):
            continue

        p = float(action_scores.get(chosen_action, 0.0))
        # Clamp probability to valid [0.0, 1.0]
        p = max(0.0, min(1.0, p))
        y = 1 if good is True else 0

        # Infer question type
        q_type = _extract_question_type(last_call)
        samples.append((p, y, q_type))

    n = len(samples)

    # 1. Base 10 equal-width bins: [0.0, 0.1), [0.1, 0.2), ..., [0.9, 1.0]
    bins_list = []
    num_bins = 10
    ece = 0.0

    for i in range(num_bins):
        lo = round(i / num_bins, 2)
        hi = round((i + 1) / num_bins, 2)

        # Include 1.0 in the last bin
        if i == num_bins - 1:
            bin_samples = [(p, y) for (p, y, _) in samples if lo <= p <= hi]
        else:
            bin_samples = [(p, y) for (p, y, _) in samples if lo <= p < hi]

        bin_n = len(bin_samples)
        if bin_n > 0:
            mean_conf = sum(p for (p, _) in bin_samples) / bin_n
            bin_acc = sum(y for (_, y) in bin_samples) / bin_n
            ece += (bin_n / n) * abs(bin_acc - mean_conf)
        else:
            mean_conf = (lo + hi) / 2.0
            bin_acc = 0.0

        bins_list.append({
            "lo": lo,
            "hi": hi,
            "n": bin_n,
            "mean_confidence": round(mean_conf, 4),
            "accuracy": round(bin_acc, 4),
        })

    # Overall accuracy
    overall_acc = round(sum(y for (_, y, _) in samples) / n, 4) if n > 0 else 0.0
    overall_ece = round(ece, 4) if n > 0 else 0.0

    # 2. Threshold sweep: t in [0.5, 0.55, ..., 0.95]
    thresholds_list = []
    recommended_thresh = None

    # Step by 0.05 from 0.50 to 0.95
    t_values = [round(0.50 + i * 0.05, 2) for i in range(10)]

    for t in t_values:
        covered = [(p, y) for (p, y, _) in samples if p >= t]
        cov_n = len(covered)
        coverage = cov_n / n if n > 0 else 0.0
        acc_at_t = (sum(y for (_, y) in covered) / cov_n) if cov_n > 0 else 0.0

        thresholds_list.append({
            "threshold": t,
            "coverage": round(coverage, 4),
            "accuracy": round(acc_at_t, 4),
        })

        # Lowest threshold meeting target accuracy with sufficient sample size
        if (
            recommended_thresh is None
            and cov_n >= min_samples
            and acc_at_t >= target_accuracy
        ):
            recommended_thresh = t

    # 3. Per-question-type calibration breakdown
    by_qtype: dict[str, Any] = {}
    qtypes = sorted(set(q for (_, _, q) in samples))

    for qt in qtypes:
        qt_samples = [(p, y) for (p, y, q) in samples if q == qt]
        qt_n = len(qt_samples)
        if qt_n == 0:
            continue
        qt_acc = sum(y for (_, y) in qt_samples) / qt_n
        qt_mean_conf = sum(p for (p, _) in qt_samples) / qt_n

        # Sub-ECE for question type
        sub_ece = 0.0
        for i in range(num_bins):
            lo = i / num_bins
            hi = (i + 1) / num_bins
            b_s = [(p, y) for (p, y) in qt_samples if (lo <= p <= hi if i == 9 else lo <= p < hi)]
            if b_s:
                b_m_conf = sum(p for (p, _) in b_s) / len(b_s)
                b_m_acc = sum(y for (_, y) in b_s) / len(b_s)
                sub_ece += (len(b_s) / qt_n) * abs(b_m_acc - b_m_conf)

        by_qtype[qt] = {
            "n": qt_n,
            "accuracy": round(qt_acc, 4),
            "mean_confidence": round(qt_mean_conf, 4),
            "ece": round(sub_ece, 4),
        }

    return {
        "n": n,
        "accuracy": overall_acc,
        "ece": overall_ece,
        "bins": bins_list,
        "thresholds": thresholds_list,
        "by_question_type": by_qtype,
        "recommended_threshold": recommended_thresh,
    }


def compute_aggregate(
    logs_dir: Path | str = "logs/runs",
    target_accuracy: float = 0.90,
    min_samples: int = 20,
) -> dict[str, Any]:
    """Compute aggregate calibration metrics across all recorded runs in logs_dir."""
    p = Path(logs_dir)
    if not p.exists():
        return compute([], target_accuracy=target_accuracy, min_samples=min_samples)
    jsonl_files = sorted(p.glob("*.jsonl"))
    events = load_events_from_files(jsonl_files)
    return compute(events, target_accuracy=target_accuracy, min_samples=min_samples)


def _extract_question_type(call: dict[str, Any]) -> str:
    """Infer primary question type from laya_call dictionary."""
    questions = call.get("questions")
    if isinstance(questions, dict):
        for q_def in questions.values():
            if isinstance(q_def, dict) and "type" in q_def:
                return str(q_def["type"])
    elif isinstance(questions, list) and questions:
        first = questions[0]
        if isinstance(first, dict):
            return str(first.get("type", "choice"))
    return "choice"


# ---------------------------------------------------------------------------
# Scalar Temperature Fitting
# ---------------------------------------------------------------------------

def fit_temperature(events: list[dict[str, Any]]) -> dict[str, float]:
    """Fit a post-hoc scalar temperature T by minimizing negative log-likelihood.

    Reports:
    - temperature: fitted scalar T
    - ece_before: uncalibrated ECE (T=1.0)
    - ece_after: temperature-scaled ECE

    Does not modify model checkpoints or live inference automatically.
    """
    samples: list[tuple[float, int]] = []
    for event in events:
        good = event.get("game_response", {}).get("good")
        if good is None or not isinstance(good, bool):
            continue
        calls = event.get("laya_calls", [])
        if not calls:
            continue
        last = calls[-1]
        act = last.get("chosen_action") or event.get("final_action")
        scores = last.get("action_scores", {})
        p = float(scores.get(act, 0.5))
        # Bound away from strict 0/1 to avoid infinite logits
        p = max(1e-4, min(1.0 - 1e-4, p))
        samples.append((p, 1 if good else 0))

    if len(samples) < 5:
        return {"temperature": 1.0, "ece_before": 0.0, "ece_after": 0.0}

    # Convert probabilities to logits: z = log(p / (1 - p))
    logits_y = [(math.log(p / (1.0 - p)), y) for (p, y) in samples]

    def _nll(temp: float) -> float:
        total_loss = 0.0
        for z, y in logits_y:
            z_scaled = z / temp
            # Sigmoid: 1 / (1 + exp(-z_scaled))
            # Log-loss: - [ y*log(sig) + (1-y)*log(1-sig) ]
            # Stable log-sigmoid:
            if z_scaled >= 0:
                loss = (1 - y) * z_scaled + math.log(1.0 + math.exp(-z_scaled))
            else:
                loss = -y * z_scaled + math.log(1.0 + math.exp(z_scaled))
            total_loss += loss
        return total_loss

    # 1D Golden section search for optimal temperature T in [0.2, 5.0]
    a, b = 0.2, 5.0
    tol = 1e-4
    invphi = (math.sqrt(5) - 1) / 2  # ~ 0.618033
    invphi2 = (3 - math.sqrt(5)) / 2  # ~ 0.381966

    h = b - a
    c = a + invphi2 * h
    d = a + invphi * h
    yc = _nll(c)
    yd = _nll(d)

    while h > tol:
        if yc < yd:
            b = d
            d = c
            yd = yc
            h = b - a
            c = a + invphi2 * h
            yc = _nll(c)
        else:
            a = c
            c = d
            yc = yd
            h = b - a
            d = a + invphi * h
            yd = _nll(d)

    best_t = (a + b) / 2.0

    # Calculate ECE before and after
    def _calc_ece(scaled_probs: list[tuple[float, int]]) -> float:
        n = len(scaled_probs)
        ece = 0.0
        for i in range(10):
            lo, hi = i / 10.0, (i + 1) / 10.0
            bin_s = [(p, y) for (p, y) in scaled_probs if (lo <= p <= hi if i == 9 else lo <= p < hi)]
            if bin_s:
                mc = sum(p for (p, _) in bin_s) / len(bin_s)
                ma = sum(y for (_, y) in bin_s) / len(bin_s)
                ece += (len(bin_s) / n) * abs(ma - mc)
        return ece

    ece_before = _calc_ece(samples)

    scaled_samples = [
        (1.0 / (1.0 + math.exp(-(z / best_t))), y)
        for (z, y) in logits_y
    ]
    ece_after = _calc_ece(scaled_samples)

    return {
        "temperature": round(best_t, 4),
        "ece_before": round(ece_before, 4),
        "ece_after": round(ece_after, 4),
    }


# ---------------------------------------------------------------------------
# File Loader & CLI
# ---------------------------------------------------------------------------

def load_events_from_files(file_paths: list[str | Path]) -> list[dict[str, Any]]:
    """Read events line-by-line from one or more .jsonl files."""
    events: list[dict[str, Any]] = []
    for fp in file_paths:
        path = Path(fp)
        if not path.exists():
            print(f"[calibration] Warning: file '{path}' not found. Skipping.", file=sys.stderr)
            continue
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    ev = json.loads(line_str)
                    if isinstance(ev, dict):
                        events.append(ev)
                except json.JSONDecodeError:
                    continue
    return events


def print_calibration_summary(result: dict[str, Any]) -> None:
    """Print readable reliability diagram and calibration summary."""
    print("\n" + "=" * 70)
    print("CONFIDENCE REALITY CHECK -- CALIBRATION METRICS")
    print("=" * 70)
    print(f"Evaluated Steps (N):   {result['n']}")
    print(f"Overall Accuracy:      {result['accuracy'] * 100:.1f}%")
    print(f"Expected Calib Error:  {result['ece']:.4f}")
    if result["recommended_threshold"] is not None:
        print(f"Recommended Threshold: >= {result['recommended_threshold']:.2f}")
    else:
        print("Recommended Threshold: None (insufficient samples meeting target accuracy)")

    print("\nReliability Diagram Bins (10 Equal-Width Bins):")
    print(f"{'Bin':<12} | {'Count (N)':<10} | {'Mean Confidence':<16} | {'Accuracy':<10}")
    print("-" * 56)
    for b in result["bins"]:
        bin_label = f"[{b['lo']:.1f}, {b['hi']:.1f})"
        conf = f"{b['mean_confidence']:.3f}"
        acc = f"{b['accuracy'] * 100:.1f}%" if b["n"] > 0 else "N/A"
        print(f"{bin_label:<12} | {b['n']:<10} | {conf:<16} | {acc:<10}")

    print("\nConfidence Threshold Sweep (Coverage vs Accuracy):")
    print(f"{'Threshold (t)':<15} | {'Coverage':<12} | {'Accuracy':<12}")
    print("-" * 45)
    for t_info in result["thresholds"]:
        t_val = f">= {t_info['threshold']:.2f}"
        cov = f"{t_info['coverage'] * 100:.1f}%"
        acc = f"{t_info['accuracy'] * 100:.1f}%"
        print(f"{t_val:<15} | {cov:<12} | {acc:<12}")

    if result.get("by_question_type"):
        print("\nBreakdown by Question Type:")
        for q_type, q_stats in result["by_question_type"].items():
            print(
                f"  - {q_type:<10}: n={q_stats['n']:<3} | "
                f"Acc={q_stats['accuracy']*100:.1f}% | "
                f"Conf={q_stats['mean_confidence']:.3f} | "
                f"ECE={q_stats['ece']:.4f}"
            )
    print("=" * 70 + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Confidence Reality Check Calibration CLI.")
    parser.add_argument("files", nargs="+", help="One or more .jsonl event log files")
    parser.add_argument("--name", default="", help="Name for calibration output file")
    parser.add_argument("--target-acc", type=float, default=0.90, help="Target accuracy for recommended threshold")
    parser.add_argument("--min-samples", type=int, default=20, help="Minimum samples for threshold recommendation")

    args = parser.parse_args()

    events = load_events_from_files(args.files)
    if not events:
        print("[calibration] No events found in specified files.", file=sys.stderr)
        sys.exit(1)

    result = compute(events, target_accuracy=args.target_acc, min_samples=args.min_samples)
    print_calibration_summary(result)

    # Fit temperature scaling
    temp_fit = fit_temperature(events)
    print("Post-Hoc Temperature Scaling (NLL):")
    print(f"  Fitted T:     {temp_fit['temperature']:.4f}")
    print(f"  ECE Before:   {temp_fit['ece_before']:.4f}")
    print(f"  ECE After:    {temp_fit['ece_after']:.4f}")

    # Output file
    out_name = args.name or Path(args.files[0]).stem
    results_dir = Path("experiments") / "results"
    results_dir.mkdir(parents=True, exist_ok=True)
    out_path = results_dir / f"calibration-{out_name}.json"

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)
    print(f"\n[calibration] Saved calibration result: {out_path}")


if __name__ == "__main__":
    main()
