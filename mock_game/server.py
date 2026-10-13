"""Deterministic local mock game server (Lane A).

Lane-runner game rules
----------------------
- 3 lanes (1, 2, 3).  Player starts in lane 2.
- Each step the player can: ``move_left``, ``stay``, ``move_right``.
- Obstacles appear randomly (seeded) at the start of each step.
- Score increases by 10 for every safe step.
- Game over when the player's lane has an obstacle at distance 0 (collision).
- An ``--illegal-rate`` flag causes the server to randomly reject moves as
  illegal (HTTP 422) at the given probability — used to exercise the validator.

Endpoints
---------
``POST /start``
    Body: ``{"seed": int}`` (optional; defaults to CLI --seed).
    Returns the initial state.

``GET /state``
    Returns the current state for the active session.

``POST /move``
    Body: ``{"session_id": str, "action": str}``.
    ``action`` must be one of ``move_left``, ``stay``, ``move_right``.
    Returns the updated state or HTTP 422 if the move is illegal/rejected.

Run
---
::

    python -m mock_game.server --port 8181 --seed 42 --illegal-rate 0.1
"""

from __future__ import annotations

import argparse
import json
import logging
import random
import sys
import uuid
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

logging.basicConfig(level=logging.INFO, format="[mock_game] %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Game constants
# ---------------------------------------------------------------------------

NUM_LANES = 3
SCORE_PER_STEP = 10
OBSTACLE_LOOKAHEAD = 5   # obstacles placed 1–OBSTACLE_LOOKAHEAD steps ahead
OBSTACLE_DENSITY = 0.35  # probability an obstacle appears in any given lane each step

VALID_ACTIONS = {"move_left", "stay", "move_right"}

# ---------------------------------------------------------------------------
# Game state
# ---------------------------------------------------------------------------


class MockGame:
    """Encapsulates one game session."""

    def __init__(self, seed: int, illegal_rate: float) -> None:
        self.session_id: str = uuid.uuid4().hex[:12]
        self.rng = random.Random(seed)
        self.illegal_rate = illegal_rate

        self.lane: int = 2          # 1-indexed; start in centre
        self.step: int = 0
        self.score: float = 0.0
        self.done: bool = False
        self.last_message: str = ""

        # Pre-generate obstacle field for the next OBSTACLE_LOOKAHEAD steps.
        self.obstacles: list[dict[str, int]] = []
        self._spawn_obstacles()

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _spawn_obstacles(self) -> None:
        """Replace obstacle list with fresh randomised obstacles."""
        obs: list[dict[str, int]] = []
        for dist in range(1, OBSTACLE_LOOKAHEAD + 1):
            for lane in range(1, NUM_LANES + 1):
                if self.rng.random() < OBSTACLE_DENSITY:
                    obs.append({"lane": lane, "distance": dist})
        self.obstacles = obs

    def _obstacles_at_distance(self, dist: int) -> list[int]:
        """Return lanes that have an obstacle at exactly ``dist`` steps."""
        return [o["lane"] for o in self.obstacles if o["distance"] == dist]

    def _legal_actions(self) -> list[dict[str, str]]:
        """Return legal actions with contextual hints."""
        actions = []
        # move_left
        target_left = self.lane - 1
        if target_left < 1:
            actions.append({
                "id": "move_left",
                "label": "Move Left",
                "hint": "Blocked by left wall — would go out of bounds",
            })
        else:
            blocked = target_left in self._obstacles_at_distance(1)
            actions.append({
                "id": "move_left",
                "label": "Move Left",
                "hint": f"Lane {target_left} {'has an obstacle ahead' if blocked else 'is clear'}",
            })

        # stay
        blocked = self.lane in self._obstacles_at_distance(1)
        actions.append({
            "id": "stay",
            "label": "Stay in Current Lane",
            "hint": f"Lane {self.lane} {'has an obstacle ahead' if blocked else 'is clear'}",
        })

        # move_right
        target_right = self.lane + 1
        if target_right > NUM_LANES:
            actions.append({
                "id": "move_right",
                "label": "Move Right",
                "hint": "Blocked by right wall — would go out of bounds",
            })
        else:
            blocked = target_right in self._obstacles_at_distance(1)
            actions.append({
                "id": "move_right",
                "label": "Move Right",
                "hint": f"Lane {target_right} {'has an obstacle ahead' if blocked else 'is clear'}",
            })

        return actions

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def state_dict(self) -> dict[str, Any]:
        return {
            "game_id": "mock-v1",
            "session_id": self.session_id,
            "step": self.step,
            "lane": self.lane,
            "score": self.score,
            "done": self.done,
            "obstacles": list(self.obstacles),
            "legal_actions": self._legal_actions(),
            "message": self.last_message,
        }

    def apply_move(self, action: str) -> tuple[dict[str, Any], bool]:
        """Apply ``action`` and return (new_state_dict, collision).

        Raises
        ------
        ValueError
            If ``action`` is not a recognised action string.
        """
        if action not in VALID_ACTIONS:
            raise ValueError(f"Unknown action '{action}'")

        if self.done:
            return self.state_dict(), False

        # Determine target lane
        target = self.lane
        if action == "move_left":
            target = self.lane - 1
        elif action == "move_right":
            target = self.lane + 1

        # Wall check — out-of-bounds is treated as illegal by the server
        if target < 1 or target > NUM_LANES:
            raise ValueError(
                f"Action '{action}' is out-of-bounds from lane {self.lane}"
            )

        # Move player
        self.lane = target

        # Check collision (obstacle at distance 0 = current position after move)
        collided_lanes = self._obstacles_at_distance(1)
        collision = self.lane in collided_lanes

        if collision:
            self.done = True
            self.last_message = f"Collision in lane {self.lane}. Game over."
        else:
            self.score += SCORE_PER_STEP
            self.last_message = f"Moved to lane {self.lane}. Score: {self.score}"

        self.step += 1

        # Advance obstacle distances and spawn new ones
        self.obstacles = [
            {"lane": o["lane"], "distance": o["distance"] - 1}
            for o in self.obstacles
            if o["distance"] > 1
        ]
        self._spawn_obstacles()

        return self.state_dict(), collision


# ---------------------------------------------------------------------------
# HTTP handler
# ---------------------------------------------------------------------------

# Module-level storage: one active game at a time (sufficient for testing).
_active_game: MockGame | None = None
_server_illegal_rate: float = 0.0
_server_seed: int = 42


def _json_body(handler: "MockHandler") -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", 0))
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw) if raw.strip() else {}


def _respond(handler: "MockHandler", code: int, body: dict[str, Any]) -> None:
    data = json.dumps(body).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class MockHandler(BaseHTTPRequestHandler):
    """Simple request router for the mock game."""

    def log_message(self, fmt: str, *args: Any) -> None:  # type: ignore[override]
        logger.info(fmt, *args)

    def do_POST(self) -> None:  # noqa: N802
        global _active_game

        if self.path == "/start":
            body = _json_body(self)
            seed = int(body.get("seed", _server_seed))
            _active_game = MockGame(seed=seed, illegal_rate=_server_illegal_rate)
            logger.info("New session %s (seed=%d)", _active_game.session_id, seed)
            _respond(self, 200, _active_game.state_dict())

        elif self.path == "/move":
            if _active_game is None:
                _respond(self, 400, {"error": "No active session. POST /start first."})
                return

            body = _json_body(self)
            action = body.get("action", "")

            # Random illegal rejection (simulates game-side validation quirks)
            if (
                _server_illegal_rate > 0
                and random.random() < _server_illegal_rate  # noqa: S311 (test only)
            ):
                _respond(self, 422, {
                    "error": "illegal_move",
                    "action": action,
                    "message": "Move rejected by server (simulated illegal rate)",
                })
                return

            try:
                new_state, _collision = _active_game.apply_move(action)
            except ValueError as exc:
                _respond(self, 422, {
                    "error": "illegal_move",
                    "action": action,
                    "message": str(exc),
                })
                return

            _respond(self, 200, new_state)

        else:
            _respond(self, 404, {"error": f"Unknown path: {self.path}"})

    def do_GET(self) -> None:  # noqa: N802
        global _active_game

        if self.path == "/state":
            if _active_game is None:
                _respond(self, 400, {"error": "No active session. POST /start first."})
                return
            _respond(self, 200, _active_game.state_dict())

        elif self.path == "/health":
            _respond(self, 200, {"status": "ok", "game": "mock-v1"})

        else:
            _respond(self, 404, {"error": f"Unknown path: {self.path}"})


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------


def make_server(port: int, seed: int, illegal_rate: float) -> HTTPServer:
    """Create the HTTPServer (does not start it)."""
    global _server_seed, _server_illegal_rate
    _server_seed = seed
    _server_illegal_rate = illegal_rate
    server = HTTPServer(("127.0.0.1", port), MockHandler)
    return server


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="Mock lane-runner game server")
    parser.add_argument("--port", type=int, default=8181)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--illegal-rate",
        type=float,
        default=0.0,
        help="Probability [0,1] that a valid move is randomly rejected as illegal",
    )
    args = parser.parse_args(argv)

    if not 0.0 <= args.illegal_rate <= 1.0:
        parser.error("--illegal-rate must be in [0, 1]")

    server = make_server(args.port, args.seed, args.illegal_rate)
    logger.info(
        "Mock game server on http://127.0.0.1:%d  (seed=%d, illegal-rate=%.2f)",
        args.port, args.seed, args.illegal_rate,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down.")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
