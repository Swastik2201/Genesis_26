"""Integration tests for FastAPI server and live endpoints (Lane D)."""

from pathlib import Path
import json
import pytest
from starlette.testclient import TestClient

from bot.logger import RunLogger
from server.app import create_app


@pytest.fixture
def mock_logs_env(tmp_path):
    """Sets up a temporary logs directory with a sample run."""
    logs_dir = tmp_path / "runs"
    logs_dir.mkdir(parents=True, exist_ok=True)

    logger = RunLogger(game_id="mock-v1", logs_dir=logs_dir, session_id="20261012-100000-test")

    # Add 2 events
    for step in range(2):
        ev = {
            "step": step,
            "state": {
                "game_id": "mock-v1",
                "session_id": "20261012-100000-test",
                "step": step,
                "state_text": f"State at step {step}",
                "facts": {"step": step},
                "legal_actions": [{"id": "move_left", "label": "Move Left"}],
                "score": step * 10,
                "done": False,
            },
            "laya_calls": [
                {
                    "question_set": "perception_v1",
                    "questions": [{"text": "Is lane clear?", "type": "bool"}],
                    "raw": {"prob": 0.9},
                    "action_scores": {"move_left": 0.9},
                    "chosen_action": "move_left",
                    "latency_ms": 30.0,
                    "accepted": True,
                }
            ],
            "validator": {"retries": 0, "fallback": False, "rejections": []},
            "final_action": "move_left",
            "game_response": {
                "good": True,
                "score_before": step * 10,
                "score_after": (step + 1) * 10,
                "done": False,
                "message": "Step OK",
            },
            "outcome": f"Score {(step + 1) * 10}",
        }
        logger.event(ev)

    logger.close({"final_score": 20, "completion_status": "completed"})
    return logs_dir, logger.session_id


@pytest.fixture
def client(mock_logs_env):
    logs_dir, _ = mock_logs_env
    app = create_app(logs_dir=logs_dir)
    app.state.start_time = 0.0
    return TestClient(app)


def test_health_endpoint(client, mock_logs_env):
    logs_dir, session_id = mock_logs_env
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "healthy"
    assert data["runs_count"] >= 1
    assert data["latest_session_id"] == session_id
    assert "last_event_ts" in data


def test_list_runs_endpoint(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get("/api/runs")
    assert res.status_code == 200
    data = res.json()
    assert "runs" in data
    assert len(data["runs"]) >= 1
    assert data["runs"][0]["session_id"] == session_id
    assert data["runs"][0]["final_score"] == 20


def test_get_events_paginated(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get(f"/api/runs/{session_id}/events?from=0&limit=10")
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == session_id
    assert data["total_events"] == 2
    assert len(data["events"]) == 2
    assert data["events"][0]["step"] == 0
    assert data["events"][1]["step"] == 1


def test_get_events_unknown_session_returns_404(client):
    res = client.get("/api/runs/non-existent-session-id/events")
    assert res.status_code == 404
    data = res.json()
    assert data["error"]["code"] == "SESSION_NOT_FOUND"


def test_get_single_event_and_404(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get(f"/api/runs/{session_id}/events/1")
    assert res.status_code == 200
    data = res.json()
    assert data["line_number"] == 2
    assert data["event"]["step"] == 1

    # Non-existent step returns 404
    bad_step = client.get(f"/api/runs/{session_id}/events/999")
    assert bad_step.status_code == 404
    assert bad_step.json()["error"]["code"] == "STEP_NOT_FOUND"


def test_verify_endpoint(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get(f"/api/runs/{session_id}/verify")
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == session_id
    assert data["hash_matches_summary"] is True
    assert data["steps_contiguous"] is True
    assert data["every_move_logged"] is True
    assert data["audit_passed"] is True


def test_autopsy_endpoint(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get(f"/api/runs/{session_id}/autopsy")
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == session_id
    assert "items" in data
    assert len(data["items"]) == 2


def test_calibration_501_not_implemented(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get(f"/api/runs/{session_id}/calibration")
    assert res.status_code in (200, 501)
    if res.status_code == 501:
        assert res.json()["error"]["code"] == "CALIBRATION_NOT_AVAILABLE"

    res_agg = client.get("/api/calibration")
    assert res_agg.status_code in (200, 501)
    if res_agg.status_code == 501:
        assert res_agg.json()["error"]["code"] == "CALIBRATION_NOT_AVAILABLE"


def test_lab_results_endpoint(client):
    res = client.get("/api/lab")
    assert res.status_code == 200
    data = res.json()
    assert "experiments" in data
    assert isinstance(data["experiments"], list)


def test_download_log_file(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get(f"/api/logs/{session_id}/download")
    assert res.status_code == 200
    assert "application/x-jsonlines" in res.headers["content-type"]
    assert f'filename="{session_id}.jsonl"' in res.headers["content-disposition"]
    lines = res.text.strip().splitlines()
    assert len(lines) == 2


def test_stream_sse_sends_existing_events(client, mock_logs_env):
    _, session_id = mock_logs_env
    res = client.get(f"/api/stream?session_id={session_id}&live=false")
    assert res.status_code == 200
    assert "text/event-stream" in res.headers["content-type"]
    text = res.text
    assert "event: step" in text
    assert "id: 0" in text
    assert "id: 1" in text

    # Test reconnect with Last-Event-ID = 0 (should only return event with step > 0, so step 1)
    reconnect_res = client.get(
        f"/api/stream?session_id={session_id}&live=false",
        headers={"Last-Event-ID": "0"},
    )
    assert reconnect_res.status_code == 200
    reconnect_text = reconnect_res.text
    assert "id: 1" in reconnect_text
    assert "id: 0" not in reconnect_text


def test_root_index_endpoint(client):
    res = client.get("/")
    assert res.status_code in [200, 404]
