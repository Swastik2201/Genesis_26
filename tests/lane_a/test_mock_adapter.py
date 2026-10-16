"""tests/lane_a/test_mock_adapter.py — Lane A adapter tests for TopGameAI Arena Snake.

Starts the mock server on a free port, plays moves, and asserts
that state, steps, and legal action constraints update correctly.

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

DELTAS = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}


def _pick_safe_action(raw: dict[str, Any]) -> str:
    """Choose a legal non-colliding action for Snake."""
    legal = [a["id"] for a in raw.get("legal_actions", [])]
    snake = raw.get("snake", [{"x": 5, "y": 5}])
    head = snake[0]

    for act in legal:
        dx, dy = DELTAS.get(act, (0, 0))
        nx, ny = head["x"] + dx, head["y"] + dy
        if 0 <= nx < 12 and 0 <= ny < 12:
            if not any(s["x"] == nx and s["y"] == ny for s in snake[:-1]):
                return act

    return legal[0] if legal else "right"


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

        assert raw["game_id"] == "snake"
        assert isinstance(raw["session_id"], str) and raw["session_id"]
        assert raw["step"] == 0
        assert raw["done"] is False
        assert isinstance(raw["score"], (int, float))
        assert isinstance(raw["legal_actions"], list)
        assert len(raw["legal_actions"]) == 3  # Non-reversing directions
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
            assert act["id"] in {"up", "down", "left", "right"}
        adapter.close()

    def test_cannot_reverse_direction(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        adapter.start()
        # Snake starts moving right, so moving left is reverse and must raise
        with pytest.raises(IllegalMoveError):
            adapter.submit_move("left")
        adapter.close()


class TestMockAdapterPlayMoves:
    """Play sequential moves and assert state and score update correctly."""

    def test_play_moves(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        raw = adapter.start()
        prev_raw = dict(raw)

        steps_played = 0

        for _ in range(15):
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
            assert new_raw["score"] >= prev_raw["score"]

            steps_played += 1
            raw = new_raw

        assert steps_played > 0, "No moves were played"
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

    def test_judge_true_on_safe_move(self, mock_server_url: str) -> None:
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        prev = adapter.start()

        action_id = _pick_safe_action(prev)
        response = adapter.submit_move(action_id)
        new_raw = adapter.get_state()

        verdict = adapter.judge(prev, response, new_raw)
        assert verdict is True
        adapter.close()

    def test_judge_false_on_collision(self, mock_server_url: str) -> None:
        """Force a wall collision."""
        adapter = MockAdapter(base_url=mock_server_url, seed=42)
        prev = adapter.start()

        # Keep moving right until hitting the right perimeter wall at x=11
        for _ in range(20):
            prev = adapter.get_state()
            if prev.get("done"):
                break
            response = adapter.submit_move("right")
            new_raw = adapter.get_state()
            if new_raw.get("done"):
                verdict = adapter.judge(prev, response, new_raw)
                assert verdict is False
                break

        adapter.close()


class TestMockAdapterIllegalRate:
    """Verify that simulated HTTP 422 responses are raised as IllegalMoveError."""

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
    """Verify context-manager protocol."""

    def test_context_manager(self, mock_server_url: str) -> None:
        with MockAdapter(base_url=mock_server_url, seed=42) as adapter:
            raw = adapter.start()
            assert raw["step"] == 0


class TestRegistryIntegration:
    """Verify get_adapter('mock') and 'snake' resolve correctly."""

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
