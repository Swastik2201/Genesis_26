"""Unit tests for Decision Autopsy analyser (Lane D)."""

import json
from pathlib import Path
import pytest
from jsonschema import Draft202012Validator

from bot.autopsy import analyse, format_report, summary, worst
from bot.logger import RunLogger


REPO_ROOT = Path(__file__).resolve().parent.parent.parent
AUTOPSY_SCHEMA_PATH = REPO_ROOT / "contracts" / "autopsy_item.schema.json"


@pytest.fixture(scope="session")
def autopsy_validator():
    with open(AUTOPSY_SCHEMA_PATH, "r", encoding="utf-8") as f:
        schema = json.load(f)
    return Draft202012Validator(schema)


def make_event(
    step: int,
    action: str = "move_right",
    prob: float = 0.85,
    good: bool = True,
    done: bool = False,
    retries: int = 0,
    rejected: bool = False,
    msg: str = "OK",
) -> dict:
    return {
        "step": step,
        "state": {
            "game_id": "mock-v1",
            "session_id": "test-sess",
            "step": step,
            "state_text": f"Step {step}",
            "facts": {},
            "legal_actions": [{"id": action, "label": action.title()}],
            "score": step * 10,
            "done": done,
        },
        "laya_calls": [
            {
                "question_set": "perception_v1",
                "questions": [{"id": "q_safe", "text": "Is path clear?"}],
                "raw": {"prob": prob},
                "action_scores": {action: prob},
                "chosen_action": action,
                "latency_ms": 25.0,
                "accepted": not rejected,
                "legal": not rejected,
            }
        ],
        "validator": {
            "retries": retries,
            "fallback": False,
            "rejections": ["Illegal lane transition"] if retries > 0 else [],
        },
        "final_action": action,
        "game_response": {
            "good": good,
            "score_before": step * 10,
            "score_after": (step + 1) * 10 if good else 0,
            "done": done,
            "message": msg,
        },
        "outcome": f"Step {step} finished",
    }


def test_verdict_illegal_move(autopsy_validator):
    ev = make_event(0, action="jump", prob=0.9, retries=1, rejected=True, msg="Action not permitted")
    items = analyse([ev])
    assert len(items) == 1
    item = items[0]
    assert item["verdict"] == "illegal_move"
    assert item["severity"] >= 0.9
    assert "rejected" in item["note"].lower()
    autopsy_validator.validate(item)


def test_verdict_game_over(autopsy_validator):
    ev = make_event(1, action="stay", prob=0.6, good=False, done=True, msg="Fatal collision")
    items = analyse([ev])
    assert len(items) == 1
    item = items[0]
    assert item["verdict"] == "game_over"
    assert item["severity"] == 1.0
    assert "ending the session" in item["note"].lower()
    autopsy_validator.validate(item)


def test_verdict_confident_miss(autopsy_validator):
    ev = make_event(2, action="move_left", prob=0.88, good=False, done=False, msg="Hit obstacle")
    items = analyse([ev])
    assert len(items) == 1
    item = items[0]
    assert item["verdict"] == "confident_miss"
    assert item["severity"] == 0.85
    assert "88% confident" in item["note"]
    autopsy_validator.validate(item)


def test_verdict_uncertain_miss(autopsy_validator):
    ev = make_event(3, action="move_right", prob=0.45, good=False, done=False, msg="Minor bump")
    items = analyse([ev])
    assert len(items) == 1
    item = items[0]
    assert item["verdict"] == "uncertain_miss"
    assert item["severity"] == 0.60
    assert "45% confidence" in item["note"]
    autopsy_validator.validate(item)


def test_verdict_lucky_hit(autopsy_validator):
    ev = make_event(4, action="stay", prob=0.35, good=True, done=False, msg="Survived narrow gap")
    items = analyse([ev])
    assert len(items) == 1
    item = items[0]
    assert item["verdict"] == "lucky_hit"
    assert item["severity"] == 0.40
    assert "low confidence (35%)" in item["note"]
    autopsy_validator.validate(item)


def test_verdict_as_predicted(autopsy_validator):
    ev = make_event(5, action="move_right", prob=0.92, good=True, done=False, msg="Clear step")
    items = analyse([ev])
    assert len(items) == 1
    item = items[0]
    assert item["verdict"] == "as_predicted"
    assert item["severity"] == 0.05
    assert "matched prediction" in item["note"].lower()
    autopsy_validator.validate(item)


def test_summary_counts():
    events = [
        make_event(0, prob=0.9, retries=1, rejected=True),          # illegal_move
        make_event(1, prob=0.8, good=False, done=True),             # game_over
        make_event(2, prob=0.75, good=False, done=False),           # confident_miss
        make_event(3, prob=0.4, good=False, done=False),            # uncertain_miss
        make_event(4, prob=0.3, good=True, done=False),             # lucky_hit
        make_event(5, prob=0.85, good=True, done=False),            # as_predicted
    ]
    items = analyse(events)
    counts = summary(items)
    assert counts["total_steps"] == 6
    assert counts["illegal_move"] == 1
    assert counts["game_over"] == 1
    assert counts["confident_miss"] == 1
    assert counts["uncertain_miss"] == 1
    assert counts["lucky_hit"] == 1
    assert counts["as_predicted"] == 1


def test_worst_selection():
    events = [
        make_event(0, prob=0.85, good=True),                        # as_predicted (0.05)
        make_event(1, prob=0.75, good=False, done=False),           # confident_miss (0.85)
        make_event(2, prob=0.8, good=False, done=True),             # game_over (1.0)
        make_event(3, prob=0.3, good=True),                         # lucky_hit (0.4)
    ]
    items = analyse(events)
    top_2 = worst(items, k=2)
    assert len(top_2) == 2
    assert top_2[0]["verdict"] == "game_over"
    assert top_2[1]["verdict"] == "confident_miss"


def test_format_report_output():
    events = [
        make_event(0, prob=0.8, good=False, done=True),
        make_event(1, prob=0.9, good=True),
    ]
    items = analyse(events)
    report = format_report(items, session_id="test-report-sess")
    assert "DECISION AUTOPSY REPORT" in report
    assert "test-report-sess" in report
    assert "GAME_OVER" in report
