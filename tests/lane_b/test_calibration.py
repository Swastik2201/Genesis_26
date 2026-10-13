"""Tests for Confidence Reality Check Calibration (USP 4) (Lane B).

Validates:
- Handling of empty event lists without crashing.
- Skipping steps with unknown/null game outcomes.
- Low ECE for well-calibrated synthetic data.
- High ECE for overconfident incorrect predictions.
- Threshold sweep and sample-size gating for recommended thresholds.
- Temperature fitting optimization.
- Schema conformity with contracts/calibration_result.schema.json.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
import pytest

from bot.calibration import compute, fit_temperature


def _make_event(
    p: float,
    good: bool | None,
    action: str = "stay",
    q_type: str = "choice",
) -> dict[str, Any]:
    """Helper to generate a valid synthetic event dict."""
    return {
        "schema": 1,
        "session_id": "test-sess",
        "game_id": "mock-v1",
        "step": 0,
        "final_action": action,
        "laya_calls": [
            {
                "chosen_action": action,
                "action_scores": {action: p, "other": 1.0 - p},
                "questions": {"q1": {"type": q_type}},
            }
        ],
        "game_response": {
            "good": good,
            "done": False,
        },
    }


def test_empty_events_list():
    """Verify compute() handles empty event list cleanly without errors."""
    res = compute([])
    assert res["n"] == 0
    assert res["accuracy"] == 0.0
    assert res["ece"] == 0.0
    assert len(res["bins"]) == 10
    assert len(res["thresholds"]) == 10
    assert res["recommended_threshold"] is None
    assert res["by_question_type"] == {}


def test_unknown_outcomes_skipped():
    """Verify steps with null or missing good flag are ignored."""
    events = [
        _make_event(0.8, True),
        _make_event(0.9, None),      # Should be skipped
        _make_event(0.7, False),
        {"game_response": {}},        # Should be skipped
    ]
    res = compute(events)
    assert res["n"] == 2
    assert res["accuracy"] == 0.5


def test_perfectly_calibrated_data_low_ece():
    """Verify well-calibrated data produces near-zero ECE."""
    events = []
    # 20 samples with p=0.8, exactly 16 good (80% accuracy)
    for i in range(20):
        events.append(_make_event(p=0.85, good=(i < 16)))

    # 20 samples with p=0.5, exactly 10 good (50% accuracy)
    for i in range(20):
        events.append(_make_event(p=0.55, good=(i < 10)))

    res = compute(events)
    assert res["n"] == 40
    # ECE should be very low (< 0.10)
    assert res["ece"] < 0.10


def test_always_overconfident_high_ece():
    """Verify overconfident incorrect predictions produce high ECE."""
    # Model claims 95% confidence, but is always wrong (0% accuracy)
    events = [_make_event(p=0.95, good=False) for _ in range(30)]

    res = compute(events)
    assert res["n"] == 30
    assert res["accuracy"] == 0.0
    # Expected calibration error should be near 0.95
    assert res["ece"] > 0.85


def test_threshold_sweep_and_recommendation():
    """Verify threshold sweep metrics and sample-gated recommendation."""
    events = []
    # 25 samples with high confidence (0.85) and 100% accuracy
    for _ in range(25):
        events.append(_make_event(p=0.85, good=True))
    # 10 samples with low confidence (0.40) and 0% accuracy
    for _ in range(10):
        events.append(_make_event(p=0.40, good=False))

    res = compute(events, target_accuracy=0.90, min_samples=20)
    assert res["n"] == 35

    # Check threshold sweep
    t_08 = next(t for t in res["thresholds"] if t["threshold"] == 0.80)
    assert t_08["coverage"] == pytest.approx(25 / 35, abs=1e-3)
    assert t_08["accuracy"] == 1.0

    # With 25 samples and 100% accuracy, recommended threshold should be found
    assert res["recommended_threshold"] is not None
    assert res["recommended_threshold"] <= 0.85

    # If min_samples requirement is not met, returns None
    res_small = compute(events[:15], target_accuracy=0.90, min_samples=20)
    assert res_small["recommended_threshold"] is None


def test_by_question_type_breakdown():
    """Verify breakdown metrics are computed for distinct question types."""
    events = [
        _make_event(0.8, True, q_type="choice"),
        _make_event(0.7, False, q_type="choice"),
        _make_event(0.9, True, q_type="noul"),
    ]
    res = compute(events)
    assert "choice" in res["by_question_type"]
    assert "noul" in res["by_question_type"]
    assert res["by_question_type"]["choice"]["n"] == 2
    assert res["by_question_type"]["noul"]["n"] == 1


def test_fit_temperature_optimization():
    """Verify fit_temperature optimizes temperature to soften overconfidence."""
    # Extremely overconfident on wrong moves -> requires T > 1.0 to soften logits
    events = [_make_event(p=0.95, good=False) for _ in range(20)]
    fit = fit_temperature(events)

    assert "temperature" in fit
    assert "ece_before" in fit
    assert "ece_after" in fit
    assert fit["temperature"] > 1.0
    assert fit["ece_after"] <= fit["ece_before"]


def test_calibration_result_schema_conformity():
    """Verify compute() output strictly satisfies contracts/calibration_result.schema.json."""
    import jsonschema
    schema_path = Path("contracts/calibration_result.schema.json")
    assert schema_path.exists()
    with open(schema_path, "r", encoding="utf-8") as f:
        schema = json.load(f)

    events = [
        _make_event(0.8, True, q_type="choice"),
        _make_event(0.6, False, q_type="noul"),
    ]
    res = compute(events)
    jsonschema.validate(instance=res, schema=schema)
