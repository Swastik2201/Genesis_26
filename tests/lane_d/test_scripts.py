"""Unit tests for Member D audit and replay scripts (Lane D)."""

from pathlib import Path
import json
import pytest

from bot.logger import RunLogger
from scripts.best_runs import export_best_runs
from scripts.check_every_move_logged import verify_session
from scripts.log_stats import compute_stats


def create_synthetic_event(
    step: int,
    action: str = "move_right",
    latency: float = 30.0,
    retries: int = 0,
    fallback: bool = False,
    score: int = 10,
) -> dict:
    return {
        "step": step,
        "state": {
            "game_id": "mock-v1",
            "session_id": "test-audit-sess",
            "step": step,
            "state_text": f"Step {step}",
            "facts": {},
            "legal_actions": [{"id": action, "label": action.title()}],
            "score": score,
            "done": False,
        },
        "laya_calls": [
            {
                "question_set": "perception_v1",
                "questions": [{"id": "q1", "text": "Which action?"}],
                "raw": {},
                "action_scores": {action: 0.9},
                "chosen_action": action,
                "latency_ms": latency,
                "accepted": True,
            }
        ],
        "validator": {"retries": retries, "fallback": fallback, "rejections": []},
        "final_action": action,
        "game_response": {
            "good": True,
            "score_before": score - 10,
            "score_after": score,
            "done": False,
            "message": "OK",
        },
        "outcome": f"Step {step}",
    }


def test_best_runs_ranking_and_copy(tmp_path):
    runs_dir = tmp_path / "runs"
    best_dir = tmp_path / "best"
    doc_path = tmp_path / "docs" / "best_runs.md"

    # Create 3 sessions with different scores
    for sess_idx, score in enumerate([100, 500, 300]):
        logger = RunLogger(
            game_id="mock-v1",
            logs_dir=runs_dir,
            session_id=f"sess-score-{score}",
        )
        ev = create_synthetic_event(0, score=score)
        logger.event(ev)
        logger.close({"final_score": score, "completion_status": "completed"})

    results = export_best_runs(
        runs_dir=runs_dir,
        best_dir=best_dir,
        top_n=2,
        min_score=250,
        output_doc=doc_path,
    )

    assert len(results) == 2
    # Ranked by score descending: 500 first, then 300
    assert results[0]["session_id"] == "sess-score-500"
    assert results[0]["final_score"] == 500
    assert results[0]["qualifies"] is True

    assert results[1]["session_id"] == "sess-score-300"
    assert results[1]["final_score"] == 300
    assert results[1]["qualifies"] is True

    # Files copied to best_dir
    assert (best_dir / "sess-score-500.jsonl").exists()
    assert (best_dir / "sess-score-500.summary.json").exists()
    assert (best_dir / "sess-score-300.jsonl").exists()

    # Markdown doc generated
    assert doc_path.exists()
    content = doc_path.read_text(encoding="utf-8")
    assert "sess-score-500" in content
    assert "sess-score-300" in content
    assert "sess-score-100" not in content  # Top 2 only


def test_log_stats_computations():
    events = [
        create_synthetic_event(0, latency=20.0, retries=1, fallback=False),
        create_synthetic_event(1, latency=40.0, retries=0, fallback=True),
        create_synthetic_event(2, latency=100.0, retries=0, fallback=False),
    ]
    stats = compute_stats(events, session_id="test-stats")

    assert stats["steps"] == 3
    assert stats["laya_calls"] == 3
    assert stats["invalid_moves"] == 1
    assert stats["fallbacks"] == 1
    assert stats["mean_latency_ms"] == pytest.approx(53.33, rel=0.1)
    assert stats["p95_latency_ms"] >= 40.0


def test_check_every_move_logged_valid():
    events = [
        create_synthetic_event(0, action="move_left"),
        create_synthetic_event(1, action="move_right"),
    ]
    passed, errors = verify_session(events)
    assert passed is True
    assert len(errors) == 0


def test_check_every_move_logged_missing_calls():
    events = [
        create_synthetic_event(0, action="move_left"),
    ]
    events[0]["laya_calls"] = []  # No calls!
    passed, errors = verify_session(events)
    assert passed is False
    assert any("Missing laya_calls" in e for e in errors)


def test_check_every_move_logged_non_contiguous():
    events = [
        create_synthetic_event(0),
        create_synthetic_event(2),  # Skipped step 1!
    ]
    passed, errors = verify_session(events)
    assert passed is False
    assert any("continuity broken" in e for e in errors)


def test_check_every_move_logged_untraced_action():
    events = [create_synthetic_event(0, action="move_right")]
    events[0]["final_action"] = "teleport"  # Not chosen by Laya!
    passed, errors = verify_session(events)
    assert passed is False
    assert any("does not match any chosen_action" in e for e in errors)


def test_check_every_move_logged_fallback_permitted():
    events = [create_synthetic_event(0, action="move_right")]
    events[0]["final_action"] = "move_left"  # Alternate action
    events[0]["validator"]["fallback"] = True  # Explicit documented fallback
    passed, errors = verify_session(events)
    assert passed is True
    assert len(errors) == 0
