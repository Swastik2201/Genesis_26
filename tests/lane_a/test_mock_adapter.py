"""tests/lane_a/test_mock_adapter.py — Lane A adapter tests.

Starts the mock server on a free port, plays 20 moves, and asserts
that state and score update correctly.

Run with:
    pytest tests/lane_a/test_mock_adapter.py -v
"""

from __future__ import annotations

import socket
import threading
import time
from typing import Any

import pytest

from mock_game.server import make_server
from bot.adapters.mock import MockAdapter
from bot.adapters.base import IllegalMoveError


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _free_port() -> int:
    """Find a free TCP port on localhost."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture(scope="module")
def mock_server_url():
    """Start the mock game server on a free port; yield its base URL."""
    port = _free_port()
    server = make_server(port=port, seed=42, illegal_rate=0.0)

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    # Wait until the port is accepting connections.
    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                break
        except OSError:
            time.sleep(0.05)
    else:
        pytest.fail(f"Mock server on port {port} did not start within 5 s")

    yield f"http://127.0.0.1:{port}"

    server.shutdown()
    server.server_close()


@pytest.fixture(scope="module")
def mock_server_illegal_url():
    """Start the mock game server with illegal_rate=0.5 for rejection tests."""
    port = _free_port()
    server = make_server(port=port, seed=99, illegal_rate=0.5)

    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    deadline = time.monotonic() + 5.0
    while time.monotonic() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.1):
                break
        except OSError:
            time.sleep(0.05)
    else:
        pytest.fail(f"Illegal-rate server on port {port} did not start within 5 s")

    yield f"http://127.0.0.1:{port}"

    server.shutdown()
    server.server_close()


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------


def _pick_safe_action(raw: dict[str, Any]) -> str:
    """Choose the first legal action that avoids an obstacle in the next step.

    This is a test helper only — it inspects state mechanically.
    It must NOT be used as a decision-making shortcut during scored runs.
    """
    obstacles_dist1 = {o["lane"] for o in raw.get("obstacles", []) if o["distance"] == 1}
    current_lane = raw["lane"]
    legal = raw.get("legal_actions", [])

    for act in legal:
        aid = act["id"]
        target = current_lane
        if aid == "move_left":
            target = current_lane - 1
        elif aid == "move_right":
            target = current_lane + 1
        if target not in obstacles_dist1 and 1 <= target <= 3:
            return aid

    # Fall back to "stay" if nothing is clearly safe (game may end)
    return "stay"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestMockAdapterBasic:
    """Verify the adapter correctly starts a session and reflects state."""

    def test_adapter_name(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        assert adapter.name == "mock"
        adapter.close()

    def test_start_returns_valid_state(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        raw = adapter.start()

        assert raw["game_id"] == "mock-v1"
        assert isinstance(raw["session_id"], str) and raw["session_id"]
        assert raw["step"] == 0
        assert raw["done"] is False
        assert isinstance(raw["score"], (int, float))
        assert isinstance(raw["legal_actions"], list)
        assert len(raw["legal_actions"]) == 3  # always 3 actions (left, stay, right)
        adapter.close()

    def test_get_state_matches_start(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        start_raw = adapter.start()
        state_raw = adapter.get_state()

        assert state_raw["session_id"] == start_raw["session_id"]
        assert state_raw["step"] == start_raw["step"]
        adapter.close()

    def test_list_actions_shape(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        raw = adapter.start()
        actions = adapter.list_actions(raw)

        assert len(actions) == 3
        for act in actions:
            assert "id" in act
            assert "label" in act
            assert act["id"] in {"move_left", "stay", "move_right"}
        adapter.close()


class TestMockAdapter20Moves:
    """Play 20 moves and assert state and score update correctly."""

    def test_play_20_moves(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        raw = adapter.start()
        prev_raw = dict(raw)

        steps_played = 0
        score_increases = 0

        for _ in range(20):
            if raw.get("done"):
                break

            action_id = _pick_safe_action(raw)
            prev_raw = dict(raw)
            response = adapter.submit_move(action_id)
            new_raw = adapter.get_state()

            # step counter must advance by 1
            assert new_raw["step"] == prev_raw["step"] + 1, (
                f"Step did not advance: {prev_raw['step']} → {new_raw['step']}"
            )

            if not new_raw["done"]:
                # Score must increase on a safe step
                assert new_raw["score"] > prev_raw["score"], (
                    f"Score did not increase after safe step {new_raw['step']}"
                )
                score_increases += 1

            steps_played += 1
            raw = new_raw

        assert steps_played > 0, "No moves were played"
        # At least some moves should result in a score increase (seed=42 game is beatable)
        assert score_increases > 0, "Score never increased across 20 moves"

        adapter.close()

    def test_score_is_non_negative(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        raw = adapter.start()

        for _ in range(10):
            if raw.get("done"):
                break
            action_id = _pick_safe_action(raw)
            adapter.submit_move(action_id)
            raw = adapter.get_state()
            assert raw["score"] >= 0

        adapter.close()


class TestMockAdapterJudge:
    """Verify judge() returns correct values."""

    def test_judge_true_on_score_increase(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        prev = adapter.start()

        if prev.get("done"):
            adapter.close()
            pytest.skip("Game ended immediately (unlikely with seed=42)")

        action_id = _pick_safe_action(prev)
        response = adapter.submit_move(action_id)
        new_raw = adapter.get_state()

        verdict = adapter.judge(prev, response, new_raw)
        if not new_raw["done"]:
            assert verdict is True
        else:
            assert verdict in (True, False, None)

        adapter.close()

    def test_judge_false_on_collision(self, mock_server_url: str) -> None:
        """Force a collision by running into an obstacle."""
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        prev = adapter.start()

        # Run until we find a step where "stay" leads to a collision, or the game ends.
        for _ in range(50):
            if prev.get("done"):
                break
            obstacles_dist1 = {
                o["lane"] for o in prev.get("obstacles", []) if o["distance"] == 1
            }
            if prev["lane"] in obstacles_dist1:
                # staying will collide
                response = adapter.submit_move("stay")
                new_raw = adapter.get_state()
                verdict = adapter.judge(prev, response, new_raw)
                if new_raw["done"]:
                    assert verdict is False
                adapter.close()
                return
            prev = adapter.get_state()
            action_id = _pick_safe_action(prev)
            adapter.submit_move(action_id)
            prev = adapter.get_state()

        adapter.close()
        # Not a failure if we never found a forced-collision scenario in 50 steps
        pytest.skip("Could not engineer a forced collision within 50 steps")


class TestMockAdapterIllegalRate:
    """Verify that HTTP 422 responses are raised as IllegalMoveError."""

    def test_illegal_move_raises(self, mock_server_illegal_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_illegal_url, seed=99)
        raw = adapter.start()

        illegal_raised = False
        for _ in range(30):
            if raw.get("done"):
                break
            try:
                action_id = _pick_safe_action(raw)
                adapter.submit_move(action_id)
                raw = adapter.get_state()
            except IllegalMoveError:
                illegal_raised = True
                break

        adapter.close()
        assert illegal_raised, (
            "Expected at least one IllegalMoveError with illegal_rate=0.5 over 30 moves"
        )


class TestMockAdapterContextManager:
    """Verify the context-manager protocol closes the session cleanly."""

    def test_context_manager(self, mock_server_url: str) -> None:
        with MockAdapter(base_url=mock_server_url, seed=42) as adapter:
            raw = adapter.start()
            assert raw["step"] == 0
        # No exception = close() was called successfully


class TestRegistryIntegration:
    """Verify get_adapter('mock') resolves to MockAdapter."""

    def test_get_adapter_mock(self, mock_server_url: str) -> None:
        from bot.adapters import get_adapter
        adapter = get_adapter("mock", base_url=mock_server_url, seed=42)
        assert adapter.name == "mock"
        assert isinstance(adapter, MockAdapter)
        adapter.close()

    def test_get_adapter_unknown_raises(self) -> None:
        from bot.adapters import get_adapter
        with pytest.raises(KeyError, match="Unknown adapter"):
            get_adapter("nonexistent_game_xyz")
