"""Deterministic local mock game server for TopGameAI Arena Snake.

TopGameAI Arena Snake Game Rules
---------------------------------
- 12x12 grid (columns 0..11, rows 0..11).
- Snake starts with 3 segments: head at (5, 5), body at (4, 5), (3, 5), facing RIGHT.
- Each step the player can move: UP, DOWN, LEFT, RIGHT.
- Immediate 180-degree reversals are strictly illegal and rejected (HTTP 422).
- Food appears at random unoccupied grid coordinates.
- Eating food gives +60 points and extends the snake by 1 segment.
- Winning condition: eating 15 foods awards +100 bonus (total score = 1000) and marks done=True.
- Collision with walls (out of bounds) or snake body terminates the game (done=True).
- Maximum duration: 300 steps.
- Grid representation:
    0 = Empty cell
    1 = Snake body segment
    2 = Food
    3 = Snake head

Endpoints
---------
``POST /start``
    Body: ``{"seed": int}`` (optional). Returns the initial state.

``GET /state``
    Returns the current state for the active session.

``POST /move``
    Body: ``{"session_id": str, "action": str}``.
    Returns the updated state or HTTP 422 if the move is illegal (e.g. reversal).

``POST /api/arena/sessions``
    TopGameAI Arena compatibility endpoint for session initialization.

``POST /api/arena/sessions/<session_id>/action``
    TopGameAI Arena compatibility endpoint for move submission.

``GET /health``
    Health check.

Run
---
::
    python -m mock_game.server --port 8181 --seed 42
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

logging.basicConfig(level=logging.INFO, format="[mock_snake] %(message)s")
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

GRID_WIDTH = 12
GRID_HEIGHT = 12
MAX_STEPS = 300
WIN_FOOD_COUNT = 15
FOOD_POINTS = 60
WIN_BONUS = 100

OPPOSITE_DIRECTIONS = {
    "up": "down",
    "down": "up",
    "left": "right",
    "right": "left",
}

DIRECTION_DELTAS = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}


# ---------------------------------------------------------------------------
# Game state
# ---------------------------------------------------------------------------


class MockSnakeGame:
    """Encapsulates one TopGameAI Arena Snake game session."""

    def __init__(self, seed: int = 42, illegal_rate: float = 0.0) -> None:
        self.session_id: str = uuid.uuid4().hex[:12]
        self.rng = random.Random(seed)
        self.illegal_rate = illegal_rate

        self.width = GRID_WIDTH
        self.height = GRID_HEIGHT
        self.step: int = 0
        self.score: float = 0.0
        self.food_eaten: int = 0
        self.done: bool = False
        self.won: bool = False
        self.last_message: str = "Game started."

        # Snake starts at length 3 facing right
        self.direction: str = "right"
        self.snake: list[dict[str, int]] = [
            {"x": 5, "y": 5},
            {"x": 4, "y": 5},
            {"x": 3, "y": 5},
        ]
        self.food: dict[str, int] = {"x": 8, "y": 5}
        self._spawn_food()

    def _spawn_food(self) -> None:
        """Place food in a random unoccupied cell."""
        occupied = {(s["x"], s["y"]) for s in self.snake}
        empty_cells = [
            (x, y)
            for y in range(self.height)
            for x in range(self.width)
            if (x, y) not in occupied
        ]
        if empty_cells:
            fx, fy = self.rng.choice(empty_cells)
            self.food = {"x": fx, "y": fy}

    def _get_grid(self) -> list[list[int]]:
        """12x12 grid: 0=empty, 1=body, 2=food, 3=head."""
        grid = [[0 for _ in range(self.width)] for _ in range(self.height)]
        # Body
        for seg in self.snake[1:]:
            if 0 <= seg["y"] < self.height and 0 <= seg["x"] < self.width:
                grid[seg["y"]][seg["x"]] = 1
        # Head
        if self.snake:
            hx, hy = self.snake[0]["x"], self.snake[0]["y"]
            if 0 <= hy < self.height and 0 <= hx < self.width:
                grid[hy][hx] = 3
        # Food
        fx, fy = self.food["x"], self.food["y"]
        if 0 <= fy < self.height and 0 <= fx < self.width:
            grid[fy][fx] = 2
        return grid

    def _legal_actions(self) -> list[dict[str, str]]:
        """Return non-reversing cardinal directions."""
        opposite = OPPOSITE_DIRECTIONS.get(self.direction.lower(), "")
        actions = []
        for d in ("up", "down", "left", "right"):
            if d == opposite:
                continue
            dx, dy = DIRECTION_DELTAS[d]
            head = self.snake[0]
            nx, ny = head["x"] + dx, head["y"] + dy
            # Check if immediately lethal
            if nx < 0 or nx >= self.width or ny < 0 or ny >= self.height:
                hint = f"Moving {d} will collide with outer wall"
            elif any(s["x"] == nx and s["y"] == ny for s in self.snake[:-1]):
                hint = f"Moving {d} will collide with snake body"
            elif nx == self.food["x"] and ny == self.food["y"]:
                hint = f"Moving {d} captures food! (+60 pts)"
            else:
                hint = f"Clear corridor towards ({nx}, {ny})"

            actions.append({
                "id": d,
                "label": d.capitalize(),
                "hint": hint,
            })
        return actions

    def state_dict(self) -> dict[str, Any]:
        """Return contract-compliant and TopGameAI-compatible state dictionary."""
        head = self.snake[0]
        return {
            "game_id": "snake",
            "session_id": self.session_id,
            "step": self.step,
            "score": self.score,
            "done": self.done,
            "won": self.won,
            "direction": self.direction,
            "foodEaten": self.food_eaten,
            "snake": list(self.snake),
            "food": dict(self.food),
            "width": self.width,
            "height": self.height,
            "grid": self._get_grid(),
            "legal_actions": self._legal_actions(),
            "message": self.last_message,
            "state": {
                "grid": self._get_grid(),
                "snake": list(self.snake),
                "food": dict(self.food),
                "direction": self.direction,
                "foodEaten": self.food_eaten,
                "score": self.score,
                "step": self.step,
                "width": self.width,
                "height": self.height,
            },
        }

    def apply_move(self, action: str) -> tuple[dict[str, Any], bool]:
        """Apply directional move.

        Returns (new_state_dict, collision_occurred).
        Raises ValueError on invalid or 180-degree reversal moves.
        """
        act_lower = action.lower()
        if act_lower not in DIRECTION_DELTAS:
            raise ValueError(f"Unknown action '{action}'")

        if self.done:
            return self.state_dict(), False

        # 180-degree reversal rule strictly forbidden by TopGameAI
        opposite = OPPOSITE_DIRECTIONS.get(self.direction.lower())
        if act_lower == opposite:
            raise ValueError("Cannot reverse direction")

        self.direction = act_lower
        head = self.snake[0]
        dx, dy = DIRECTION_DELTAS[act_lower]
        new_head = {"x": head["x"] + dx, "y": head["y"] + dy}

        # Wall collision check
        if (
            new_head["x"] < 0
            or new_head["x"] >= self.width
            or new_head["y"] < 0
            or new_head["y"] >= self.height
        ):
            self.done = True
            self.last_message = f"Collision with wall at ({new_head['x']}, {new_head['y']}). Game over."
            self.step += 1
            return self.state_dict(), True

        # Self collision check
        # Note: if snake doesn't grow, the last tail segment moves away,
        # but standard TopGameAI checks against current body segments.
        is_food = (new_head["x"] == self.food["x"] and new_head["y"] == self.food["y"])
        body_to_check = self.snake if is_food else self.snake[:-1]
        if any(s["x"] == new_head["x"] and s["y"] == new_head["y"] for s in body_to_check):
            self.done = True
            self.last_message = f"Collision with self at ({new_head['x']}, {new_head['y']}). Game over."
            self.step += 1
            return self.state_dict(), True

        # Valid safe move: advance snake
        self.snake.insert(0, new_head)
        collision = False

        if is_food:
            self.food_eaten += 1
            self.score += FOOD_POINTS
            self.last_message = f"Food eaten! Count: {self.food_eaten}/15. Score: {self.score}"
            if self.food_eaten >= WIN_FOOD_COUNT:
                self.won = True
                self.done = True
                self.score += WIN_BONUS
                self.last_message = f"Victory! All 15 foods collected. Final Score: {self.score}"
            else:
                self._spawn_food()
        else:
            self.snake.pop()
            self.last_message = f"Advanced {act_lower} to ({new_head['x']}, {new_head['y']})."

        self.step += 1
        if self.step >= MAX_STEPS and not self.done:
            self.done = True
            self.last_message = f"Maximum step limit ({MAX_STEPS}) reached. Game over."

        return self.state_dict(), collision


# ---------------------------------------------------------------------------
# HTTP Handler
# ---------------------------------------------------------------------------

_active_game: MockSnakeGame | None = None
_server_illegal_rate: float = 0.0
_server_seed: int = 42


def _json_body(handler: BaseHTTPRequestHandler) -> dict[str, Any]:
    length = int(handler.headers.get("Content-Length", 0))
    raw = handler.rfile.read(length) if length else b"{}"
    return json.loads(raw) if raw.strip() else {}


def _respond(handler: BaseHTTPRequestHandler, code: int, body: dict[str, Any]) -> None:
    data = json.dumps(body).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(data)))
    handler.end_headers()
    handler.wfile.write(data)


class MockHandler(BaseHTTPRequestHandler):
    """Request router for TopGameAI Snake mock server."""

    def log_message(self, fmt: str, *args: Any) -> None:
        logger.info(fmt, *args)

    def do_OPTIONS(self) -> None:
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self) -> None:
        global _active_game

        if self.path in ("/start", "/api/arena/sessions"):
            body = _json_body(self)
            seed = int(body.get("seed", _server_seed))
            _active_game = MockSnakeGame(seed=seed, illegal_rate=_server_illegal_rate)
            logger.info("New Snake session %s (seed=%d)", _active_game.session_id, seed)
            _respond(self, 200, _active_game.state_dict())

        elif self.path == "/move" or self.path.startswith("/api/arena/sessions/"):
            if _active_game is None:
                _respond(self, 400, {"error": "No active session. POST /start first."})
                return

            body = _json_body(self)
            action = body.get("action", "")

            # Simulated random illegal rejection rate if configured
            if (
                _server_illegal_rate > 0
                and random.random() < _server_illegal_rate
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

    def do_GET(self) -> None:
        global _active_game

        if self.path in ("/state", "/api/arena"):
            if _active_game is None:
                _respond(self, 400, {"error": "No active session. POST /start first."})
                return
            _respond(self, 200, _active_game.state_dict())

        elif self.path == "/health":
            _respond(self, 200, {"status": "ok", "game": "snake", "arena": "topgameai"})

        else:
            _respond(self, 404, {"error": f"Unknown path: {self.path}"})


def make_server(port: int, seed: int = 42, illegal_rate: float = 0.0) -> HTTPServer:
    """Create the HTTPServer for the TopGameAI Snake mock server."""
    global _server_seed, _server_illegal_rate
    _server_seed = seed
    _server_illegal_rate = illegal_rate
    server = HTTPServer(("127.0.0.1", port), MockHandler)
    return server


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="TopGameAI Arena Snake Mock Server")
    parser.add_argument("--port", type=int, default=8181)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument(
        "--illegal-rate",
        type=float,
        default=0.0,
        help="Probability [0,1] of simulated illegal rejection",
    )
    args = parser.parse_args(argv)

    if not 0.0 <= args.illegal_rate <= 1.0:
        parser.error("--illegal-rate must be in [0, 1]")

    server = make_server(args.port, args.seed, args.illegal_rate)
    logger.info(
        "TopGameAI Snake Server running at http://127.0.0.1:%d (seed=%d)",
        args.port, args.seed,
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down.")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
