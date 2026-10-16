"""Probe TopGameAI Arena live REST API endpoints for Snake and 2048 (Lane B).

Usage:
    python experiments/probe_site.py --game snake
    python experiments/probe_site.py --game 2048
"""

from __future__ import annotations

import argparse
import json
import urllib.error
import urllib.request
from typing import Any

API_BASE = "https://topgameai.com/api/arena"


def probe_session(game: str, agent_name: str = "Genesis") -> dict[str, Any] | None:
    """Create a new session on TopGameAI arena and display state."""
    url = f"{API_BASE}/sessions"
    payload = json.dumps({"game": game, "agent_name": agent_name}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json", "User-Agent": "Mozilla/5.0"},
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            print(f"=== {game.upper()} SESSION INITIALIZED ===")
            print(json.dumps(data, indent=2))
            return data
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
    except Exception as e:
        print(f"Connection Error: {e}")
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Probe TopGameAI arena live API.")
    parser.add_argument(
        "--game",
        "-g",
        type=str,
        default="snake",
        choices=["snake", "2048"],
        help="Game to probe (default: snake).",
    )
    parser.add_argument(
        "--agent",
        type=str,
        default="Genesis",
        help="Agent identifier to send in probe.",
    )
    args = parser.parse_args()
    probe_session(args.game, args.agent)


if __name__ == "__main__":
    main()
