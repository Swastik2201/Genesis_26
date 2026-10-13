"""Configuration for Beat the Bot (Lane A).

Reads all settings from environment variables. Never prints secrets.
Call print_settings() at the start of a run to display resolved non-secret values.
"""

import os
from pathlib import Path

# ─── Game API settings ──────────────────────────────────────────────────────

#: Base URL of the hosted game API. Set GAME_BASE_URL.
GAME_BASE_URL: str = os.environ.get("GAME_BASE_URL", "http://localhost:8181")

#: API key for the hosted game. Set GAME_API_KEY. Never printed.
GAME_API_KEY: str = os.environ.get("GAME_API_KEY", "")

#: Session ID to resume. Set GAME_SESSION_ID. Blank = start new session.
GAME_SESSION_ID: str = os.environ.get("GAME_SESSION_ID", "")

# ─── Mock game settings ─────────────────────────────────────────────────────

#: Default port for the local mock game server.
MOCK_GAME_PORT: int = int(os.environ.get("MOCK_GAME_PORT", "8181"))

#: Default random seed for the mock game (determinism).
MOCK_GAME_SEED: int = int(os.environ.get("MOCK_GAME_SEED", "42"))

# ─── HTTP client settings ───────────────────────────────────────────────────

#: Request timeout in seconds.
HTTP_TIMEOUT: float = float(os.environ.get("HTTP_TIMEOUT", "10.0"))

#: Max retries for transient HTTP errors.
HTTP_MAX_RETRIES: int = int(os.environ.get("HTTP_MAX_RETRIES", "3"))

#: Exponential backoff base in seconds.
HTTP_BACKOFF_BASE: float = float(os.environ.get("HTTP_BACKOFF_BASE", "0.5"))

# ─── Run settings ───────────────────────────────────────────────────────────

#: Maximum invalid moves before circuit-breaker stops the run.
MAX_INVALID_MOVES: int = int(os.environ.get("MAX_INVALID_MOVES", "10"))

#: Default max steps per run (None = unlimited).
MAX_STEPS: int | None = (
    int(os.environ.get("MAX_STEPS"))
    if os.environ.get("MAX_STEPS")
    else None
)

#: Logs directory (relative to repo root).
LOGS_DIR: Path = Path(os.environ.get("LOGS_DIR", "logs/runs"))

# ─── Laya settings ──────────────────────────────────────────────────────────

#: Laya model checkpoint ID.
LAYA_CHECKPOINT: str = os.environ.get("LAYA_CHECKPOINT", "convaiinnovations/laya")

#: Laya device override. None = auto.
LAYA_DEVICE: str | None = os.environ.get("LAYA_DEVICE") or None

#: Default question set name.
DEFAULT_QUESTION_SET: str = os.environ.get("DEFAULT_QUESTION_SET", "v1_perception")


def print_settings() -> None:
    """Prints resolved non-secret configuration at run start."""
    print("[config] GAME_BASE_URL       :", GAME_BASE_URL)
    print("[config] GAME_API_KEY        :", "[SET]" if GAME_API_KEY else "[not set]")
    print("[config] GAME_SESSION_ID     :", GAME_SESSION_ID or "[new session]")
    print("[config] MOCK_GAME_PORT      :", MOCK_GAME_PORT)
    print("[config] HTTP_TIMEOUT        :", HTTP_TIMEOUT)
    print("[config] HTTP_MAX_RETRIES    :", HTTP_MAX_RETRIES)
    print("[config] MAX_STEPS           :", MAX_STEPS)
    print("[config] MAX_INVALID_MOVES   :", MAX_INVALID_MOVES)
    print("[config] LAYA_CHECKPOINT     :", LAYA_CHECKPOINT)
    print("[config] LAYA_DEVICE         :", LAYA_DEVICE or "auto")
    print("[config] DEFAULT_QUESTION_SET:", DEFAULT_QUESTION_SET)
