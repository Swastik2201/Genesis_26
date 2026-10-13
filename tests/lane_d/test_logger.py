"""Unit tests for RunLogger, log helpers, and redaction (Lane D)."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import pytest

from bot.logger import (
    EventValidationError,
    RunLogger,
    latest_session,
    list_sessions,
    load_events,
    redact,
)


@pytest.fixture
def sample_valid_event():
    """Generates a schema-compliant sample event."""
    return {
        "step": 0,
        "state": {
            "game_id": "mock-v1",
            "session_id": "test-session",
            "step": 0,
            "state_text": "Lane 1 is clear. Current speed is normal.",
            "facts": {"lane": 1, "clear": True},
            "legal_actions": [{"id": "stay", "label": "Stay"}],
            "score": 0,
            "done": False,
        },
        "laya_calls": [
            {
                "question_set": "perception_v1",
                "questions": [{"text": "Is lane clear?", "type": "bool"}],
                "raw": {"prob": 0.95},
                "action_scores": {"stay": 0.95},
                "chosen_action": "stay",
                "latency_ms": 25.0,
                "accepted": True,
            }
        ],
        "validator": {"retries": 0, "fallback": False, "rejections": []},
        "final_action": "stay",
        "game_response": {
            "good": True,
            "score_before": 0,
            "score_after": 10,
            "done": False,
            "message": "Step OK",
        },
        "outcome": "Score +10",
    }


def test_valid_event_written_one_per_line(tmp_path, sample_valid_event):
    logger = RunLogger(game_id="mock-v1", logs_dir=tmp_path)
    session_id = logger.session_id
    assert session_id is not None
    assert "-" in session_id

    # Write 3 events
    for step in range(3):
        ev = dict(sample_valid_event)
        ev["step"] = step
        ev["state"]["step"] = step
        logger.event(ev)

    logger.close({"final_score": 30})

    log_file = tmp_path / f"{session_id}.jsonl"
    assert log_file.exists()

    with open(log_file, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    assert len(lines) == 3
    for line in lines:
        parsed = json.loads(line)
        assert parsed["schema"] == 1
        assert parsed["game_id"] == "mock-v1"
        assert parsed["session_id"] == session_id
        assert "ts" in parsed


def test_invalid_event_raises_and_names_field(tmp_path):
    logger = RunLogger(game_id="mock-v1", logs_dir=tmp_path)

    # Missing required 'laya_calls'
    broken_event = {
        "step": 0,
        "state": {
            "game_id": "mock-v1",
            "session_id": logger.session_id,
            "step": 0,
            "state_text": "Bad event",
            "facts": {},
            "legal_actions": [{"id": "stay", "label": "Stay"}],
            "score": 0,
            "done": False,
        },
        # laya_calls missing
        "validator": {"retries": 0, "fallback": False},
        "final_action": "stay",
        "game_response": {
            "good": True,
            "score_before": 0,
            "score_after": 0,
            "done": False,
            "message": None,
        },
        "outcome": None,
    }

    with pytest.raises(EventValidationError) as exc_info:
        logger.event(broken_event)

    assert "laya_calls" in str(exc_info.value)

    # Verify nothing corrupted the file
    events = load_events(logger.file_path)
    assert len(events) == 0
    logger.close()


def test_redaction_removes_sensitive_keys(tmp_path, sample_valid_event):
    logger = RunLogger(game_id="mock-v1", logs_dir=tmp_path)

    event_with_secrets = dict(sample_valid_event)
    event_with_secrets["state"]["facts"]["api_key"] = "super-secret-1234"
    event_with_secrets["state"]["facts"]["nested"] = {
        "Authorization": "Bearer token-xyz",
        "password": "my-password",
        "safe_value": 42,
    }

    logged = logger.event(event_with_secrets)
    logger.close()

    # In memory check
    assert logged["state"]["facts"]["api_key"] == "[REDACTED]"
    assert logged["state"]["facts"]["nested"]["Authorization"] == "[REDACTED]"
    assert logged["state"]["facts"]["nested"]["password"] == "[REDACTED]"
    assert logged["state"]["facts"]["nested"]["safe_value"] == 42

    # On disk check
    events = load_events(logger.file_path)
    assert len(events) == 1
    disk_facts = events[0]["state"]["facts"]
    assert disk_facts["api_key"] == "[REDACTED]"
    assert disk_facts["nested"]["Authorization"] == "[REDACTED]"
    assert disk_facts["nested"]["password"] == "[REDACTED]"
    assert disk_facts["nested"]["safe_value"] == 42


def test_multithreaded_writes_do_not_interleave(tmp_path, sample_valid_event):
    logger = RunLogger(game_id="mock-v1", logs_dir=tmp_path)
    num_threads = 4
    events_per_thread = 25

    def worker(thread_idx: int):
        for i in range(events_per_thread):
            ev = dict(sample_valid_event)
            ev["step"] = (thread_idx * 100) + i
            ev["outcome"] = f"Thread {thread_idx} event {i}"
            logger.event(ev)

    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [executor.submit(worker, t) for t in range(num_threads)]
        for f in futures:
            f.result()

    logger.close()

    events = load_events(logger.file_path)
    assert len(events) == num_threads * events_per_thread

    # Check that each line is valid and uncorrupted
    with open(logger.file_path, "r", encoding="utf-8") as f:
        for line in f:
            data = json.loads(line.strip())
            assert data["schema"] == 1
            assert "Thread" in data["outcome"]


def test_list_sessions_handles_unclosed_run(tmp_path, sample_valid_event):
    # Create an unclosed session (do not call logger.close())
    unclosed_logger = RunLogger(game_id="mock-v1", logs_dir=tmp_path, session_id="20261012-100000-uncl")
    ev1 = dict(sample_valid_event)
    ev1["step"] = 0
    ev1["game_response"]["score_after"] = 10
    unclosed_logger.event(ev1)

    ev2 = dict(sample_valid_event)
    ev2["step"] = 1
    ev2["game_response"]["score_after"] = 25
    ev2["validator"]["retries"] = 1
    ev2["validator"]["fallback"] = True
    unclosed_logger.event(ev2)

    # Explicitly do NOT close unclosed_logger
    # Create a closed session to compare
    closed_logger = RunLogger(game_id="mock-v1", logs_dir=tmp_path, session_id="20261012-100500-clos")
    ev3 = dict(sample_valid_event)
    closed_logger.event(ev3)
    closed_logger.close({"final_score": 100, "completion_status": "completed"})

    sessions = list_sessions(tmp_path)
    assert len(sessions) == 2

    # Check unclosed session derived values
    unclosed_summary = next(s for s in sessions if s["session_id"] == "20261012-100000-uncl")
    assert unclosed_summary["steps"] == 2
    assert unclosed_summary["final_score"] == 25
    assert unclosed_summary["invalid_moves"] == 1
    assert unclosed_summary["fallbacks"] == 1
    assert unclosed_summary["event_count"] == 2
    assert unclosed_summary["laya_call_count"] == 2
    assert unclosed_summary["completion_status"] == "interrupted"
    assert len(unclosed_summary["sha256"]) == 64

    # Check closed session
    closed_summary = next(s for s in sessions if s["session_id"] == "20261012-100500-clos")
    assert closed_summary["final_score"] == 100
    assert closed_summary["completion_status"] == "completed"


def test_summary_sha256_and_pure_jsonl(tmp_path, sample_valid_event):
    logger = RunLogger(game_id="mock-v1", logs_dir=tmp_path)
    logger.event(sample_valid_event)
    summary = logger.close({"final_score": 50})

    # Assert .summary.json exists
    summary_path = tmp_path / f"{logger.session_id}.summary.json"
    assert summary_path.exists()
    assert summary["sha256"] is not None

    # Verify .jsonl does NOT have the summary appended
    with open(logger.file_path, "r", encoding="utf-8") as f:
        lines = [l.strip() for l in f if l.strip()]
    assert len(lines) == 1
    first_line_obj = json.loads(lines[0])
    assert "schema" in first_line_obj
    assert first_line_obj["schema"] == 1


def test_latest_session_helper(tmp_path, sample_valid_event):
    assert latest_session(tmp_path) is None

    l1 = RunLogger(game_id="mock-v1", logs_dir=tmp_path, session_id="20261012-100000-aaaa")
    l1.event(sample_valid_event)
    l1.close()

    l2 = RunLogger(game_id="mock-v1", logs_dir=tmp_path, session_id="20261012-100000-bbbb")
    l2.event(sample_valid_event)
    l2.close()

    latest = latest_session(tmp_path)
    assert latest in ["20261012-100000-aaaa", "20261012-100000-bbbb"]
