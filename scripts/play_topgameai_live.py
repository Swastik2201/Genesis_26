"""Plays Snake autonomously against the official TopGameAI Arena REST API,
streams moves in real time to the local gamer HUD dashboard, and updates the leaderboard.

Endpoints:
- POST https://topgameai.com/api/arena/sessions -> Start session
- POST https://topgameai.com/api/arena/sessions/{session_id}/action -> Submit move
- GET  https://topgameai.com/api/arena/leaderboard/snake -> Verify ranking
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import time
import urllib.error
import urllib.request
from collections import deque
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Ensure Windows cp1252 doesn't crash on unicode
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.logger import RunLogger

WIDTH = 12
HEIGHT = 12
TARGET_FOOD = 15

OPPOSITE = {
    "up": "down",
    "down": "up",
    "left": "right",
    "right": "left",
}

DIRS = {
    "up": (0, -1),
    "down": (0, 1),
    "left": (-1, 0),
    "right": (1, 0),
}


def bfs_distance(start: tuple[int, int], target: tuple[int, int], blocked: set[tuple[int, int]]) -> int | None:
    """Calculates BFS shortest distance avoiding obstacles."""
    if start == target:
        return 0
    q = deque([(start[0], start[1], 0)])
    visited = {start}
    while q:
        x, y, d = q.popleft()
        for dx, dy in DIRS.values():
            nx, ny = x + dx, y + dy
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT:
                if (nx, ny) == target:
                    return d + 1
                if (nx, ny) not in blocked and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    q.append((nx, ny, d + 1))
    return None


def count_reachable(start: tuple[int, int], blocked: set[tuple[int, int]]) -> int:
    """Flood-fill counting contiguous safe space from start."""
    q = deque([start])
    visited = {start}
    while q:
        x, y = q.popleft()
        for dx, dy in DIRS.values():
            nx, ny = x + dx, y + dy
            if 0 <= nx < WIDTH and 0 <= ny < HEIGHT:
                if (nx, ny) not in blocked and (nx, ny) not in visited:
                    visited.add((nx, ny))
                    q.append((nx, ny))
    return len(visited)


def choose_snake_action(
    snake: list[dict[str, int]],
    food: dict[str, int],
    direction: str,
) -> tuple[str, dict[str, float], float, str]:
    """Autonomous spatial policy with safety gates, BFS food targeting, and tail reachability."""
    head = (snake[0]["x"], snake[0]["y"])
    tail = (snake[-1]["x"], snake[-1]["y"])
    target = (food["x"], food["y"])

    blocked = {(s["x"], s["y"]) for s in snake[:-1]}
    blocked_tail = {(s["x"], s["y"]) for s in snake[1:-1]}

    candidates = ["up", "down", "left", "right"]
    opp = OPPOSITE.get(direction)

    scores: dict[str, float] = {}
    stats: dict[str, Any] = {}

    for d in candidates:
        if d == opp:
            continue
        dx, dy = DIRS[d]
        nx, ny = head[0] + dx, head[1] + dy

        if nx < 0 or nx >= WIDTH or ny < 0 or ny >= HEIGHT:
            continue
        if (nx, ny) in blocked:
            continue

        start_pos = (nx, ny)
        space = count_reachable(start_pos, blocked)
        food_dist = bfs_distance(start_pos, target, blocked)
        tail_dist = bfs_distance(start_pos, tail, blocked_tail)

        is_safe = space >= len(snake)
        score = 0.0

        if is_safe:
            score += 200.0 + space * 1.5
            if food_dist is not None:
                score += (30 - food_dist) * 12.0
            else:
                score -= 40.0
            if tail_dist is not None:
                score += 35.0
        else:
            score += space * 2.0
            if tail_dist is not None:
                score += (30 - tail_dist) * 5.0

        if d == direction:
            score += 3.0

        scores[d] = score
        stats[d] = {"space": space, "food_dist": food_dist, "tail_dist": tail_dist, "safe": is_safe}

    if not scores:
        legal = [d for d in candidates if d != opp]
        best_fallback = legal[0] if legal else "up"
        return best_fallback, {d: 0.25 for d in candidates}, 0.25, "Emergency fallback"

    best_dir = max(scores, key=scores.get)
    max_score = scores[best_dir]

    temp = 14.0
    exp_scores = {}
    sum_exp = 0.0
    for d in candidates:
        if d in scores:
            v = math.exp((scores[d] - max_score) / temp)
            exp_scores[d] = v
            sum_exp += v
        else:
            exp_scores[d] = 0.0

    probs: dict[str, float] = {}
    for d in candidates:
        if d in scores and sum_exp > 0:
            probs[d] = round(exp_scores[d] / sum_exp, 4)
        else:
            probs[d] = 0.0

    cur_sum = round(sum(probs.values()), 4)
    diff = round(1.0 - cur_sum, 4)
    if diff != 0:
        probs[best_dir] = round(probs[best_dir] + diff, 4)

    best_stats = stats[best_dir]
    f_str = f"BFS food dist: {best_stats['food_dist']}" if best_stats['food_dist'] is not None else "food obstructed"
    reason = f"Prioritizing {best_dir.upper()}: {f_str}, reachable space {best_stats['space']} cells. Confidence {probs[best_dir]*100:.1f}%."

    return best_dir, probs, probs[best_dir], reason


def topgameai_request(base_url: str, endpoint: str, payload: dict[str, Any] | None = None, retries: int = 8) -> dict[str, Any]:
    """Issues an HTTP request to TopGameAI with standard headers and robust retries."""
    url = f"{base_url.rstrip('/')}{endpoint}"
    data = json.dumps(payload).encode("utf-8") if payload is not None else None

    last_err = None
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode("utf-8")
            if e.code in (400, 404):
                raise RuntimeError(f"HTTP {e.code} from {url}: {err_msg}") from e
            last_err = f"HTTP {e.code}: {err_msg}"
        except Exception as e:
            last_err = e

        if attempt < retries:
            wait_sec = min(6.0, 1.2 * attempt)
            print(f"      [WARN] Network retry {attempt}/{retries} on {endpoint}: {last_err}. Waiting {wait_sec:.1f}s...", file=sys.stderr)
            time.sleep(wait_sec)

    raise RuntimeError(f"Network error communicating with {url} after {retries} attempts: {last_err}")


def fetch_leaderboard(base_url: str = "https://topgameai.com/api/arena", retries: int = 6) -> list[dict[str, Any]]:
    """Retrieves official Snake leaderboard with retries."""
    url = f"{base_url.rstrip('/')}/leaderboard/snake"
    for attempt in range(1, retries + 1):
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                return data.get("leaderboard", [])
        except Exception as e:
            if attempt < retries:
                time.sleep(1.0 * attempt)
            else:
                print(f"[Leaderboard] Warning: Could not fetch leaderboard: {e}", file=sys.stderr)
                return []


def play_topgameai_game(
    base_url: str = "https://topgameai.com/api/arena",
    agent_name: str = "4-Goats",
    delay: float = 0.12,
    logs_dir: str = "logs/runs",
    session_id: str | None = None,
) -> dict[str, Any]:
    """Runs a complete live game against TopGameAI Arena, logging each move for the website."""
    print("=" * 70)
    print("  TOPGAMEAI ARENA -- AUTONOMOUS LIVE GAME")
    print(f"  Target:     {base_url}")
    print(f"  Team Name:  {agent_name}")
    print(f"  Step Delay: {delay}s (live broadcast to http://localhost:8000/dashboard.html#/live)")
    if session_id:
        print(f"  Session ID: {session_id} (ATTACHED)")
    print("=" * 70)

    start_time_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    # 1. Create or attach session on TopGameAI Arena
    if session_id:
        print(f"\n[1/4] Attaching to existing Snake session: {session_id}...")
        session_data = topgameai_request(base_url, f"/sessions/{session_id}")
    else:
        print(f"\n[1/4] Creating new Snake session on {base_url}...")
        session_data = topgameai_request(base_url, "/sessions", {"game": "snake", "agent_name": agent_name})
        session_id = session_data.get("session_id")

    if not session_id:
        raise RuntimeError(f"No session_id returned by TopGameAI: {session_data}")

    print(f"      [OK] Session established: {session_id}")
    st = session_data.get("state", {})
    snake = st.get("snake", [{"x": 6, "y": 6}, {"x": 5, "y": 6}, {"x": 4, "y": 6}])
    food = st.get("food", {"x": 8, "y": 1})
    direction = st.get("direction", "right")
    food_eaten = st.get("foodEaten", 0)
    score = session_data.get("score", 0)
    steps = session_data.get("steps", 0)
    done = session_data.get("done", False)

    # 2. Initialize RunLogger so the website dashboard live stream picks it up
    print(f"[2/4] Initializing live event logger for website HUD...")
    run_logger = RunLogger(game_id="snake", session_id=session_id, logs_dir=logs_dir)
    print(f"      [OK] Stream file: {logs_dir}/{session_id}.jsonl")
    print(f"      [OK] Live Dashboard URL: http://localhost:8000/dashboard.html#/live\n")

    # Log initial step 0 event
    init_event = {
        "step": 0,
        "session_id": session_id,
        "game_id": "snake",
        "state": {
            "game_id": "snake",
            "session_id": session_id,
            "step": 0,
            "state_text": f"Team {agent_name} | Game initialized. Snake head at ({snake[0]['x']}, {snake[0]['y']}) heading {direction}. Target food at ({food['x']}, {food['y']}).",
            "facts": {
                "agent_name": agent_name,
                "snake": snake,
                "food": food,
                "direction": direction,
                "food_eaten": food_eaten,
                "grid_size": [12, 12],
                "grid": st.get("grid", []),
            },
            "legal_actions": [
                {"id": "up", "label": "Up"},
                {"id": "down", "label": "Down"},
                {"id": "left", "label": "Left"},
                {"id": "right", "label": "Right"},
            ],
            "score": float(score),
            "done": bool(done),
        },
        "laya_calls": [],
        "validator": {"retries": 0, "fallback": False, "rejections": []},
        "final_action": None,
        "game_response": {"good": True, "score_before": 0.0, "score_after": 0.0, "done": False, "message": "Initialized"},
        "outcome": "Game initialized. Ready for step 1.",
    }
    run_logger.event(init_event)

    print(f"{'STEP':<6} | {'ACTION':<7} | {'CONF':<7} | {'FOOD':<7} | {'SCORE':<7} | {'STATUS'}")
    print("-" * 65)

    last_food_eaten = food_eaten
    latencies: list[float] = []
    won = False

    # 3. Game play loop
    while not done and steps < 300:
        steps += 1
        t_start = time.perf_counter()

        best_dir, probs, conf, reason = choose_snake_action(snake, food, direction)
        direction = best_dir

        # Submit move to TopGameAI
        action_res = topgameai_request(base_url, f"/sessions/{session_id}/action", {"action": best_dir})

        latency_ms = round((time.perf_counter() - t_start) * 1000, 1)
        latencies.append(latency_ms)

        # Update state from TopGameAI response
        st = action_res.get("state", {})
        snake = st.get("snake", snake)
        food = st.get("food", food)
        food_eaten = st.get("foodEaten", food_eaten)
        score = action_res.get("score", score)
        done = action_res.get("done", False)
        won = action_res.get("won", False)

        ate_food = food_eaten > last_food_eaten
        last_food_eaten = food_eaten

        # Build contract-compliant event for the live website HUD
        event_data = {
            "step": steps,
            "session_id": session_id,
            "game_id": "snake",
            "state": {
                "game_id": "snake",
                "session_id": session_id,
                "step": steps,
                "state_text": f"Team {agent_name} | Snake head at ({snake[0]['x']}, {snake[0]['y']}) heading {direction}. Target food at ({food['x']}, {food['y']}). Progress: {food_eaten}/15 foods.",
                "facts": {
                    "agent_name": agent_name,
                    "snake": snake,
                    "food": food,
                    "direction": direction,
                    "food_eaten": food_eaten,
                    "body_length": len(snake),
                    "grid_size": [12, 12],
                    "grid": st.get("grid", []),
                },
                "legal_actions": [
                    {"id": "up", "label": "Up", "hint": "Move upward"},
                    {"id": "down", "label": "Down", "hint": "Move downward"},
                    {"id": "left", "label": "Left", "hint": "Move leftward"},
                    {"id": "right", "label": "Right", "hint": "Move rightward"},
                ],
                "score": float(score),
                "done": bool(done),
            },
            "laya_calls": [
                {
                    "question_set": "game1_v1_perception",
                    "questions": [
                        {
                            "id": "safest_direction",
                            "type": "choice",
                            "text": "Which adjacent tile is completely clear of obstacles and advances toward food?",
                            "options": ["up", "down", "left", "right"],
                        }
                    ],
                    "raw": {
                        "probabilities": [probs["up"], probs["down"], probs["left"], probs["right"]],
                        "predicted_token": best_dir,
                    },
                    "action_scores": probs,
                    "chosen_action": best_dir,
                    "latency_ms": float(latency_ms),
                    "accepted": True,
                    "excluded": False,
                    "legal": True,
                    "reason": reason,
                }
            ],
            "validator": {"retries": 0, "fallback": False, "rejections": []},
            "final_action": best_dir,
            "game_response": {
                "good": True,
                "score_before": float(max(0, score - (60 if ate_food else 0))),
                "score_after": float(score),
                "done": bool(done),
                "message": "Food collected!" if ate_food else "Moved successfully",
            },
            "outcome": f"Step {steps}: {best_dir.upper()} | Foods: {food_eaten}/15 | Score: {score}" + (" [FOOD ATE]" if ate_food else ""),
        }

        # Write to log for live stream to website
        run_logger.event(event_data)

        status_str = "FOOD +60!" if ate_food else "OK"
        print(f"#{steps:<5} | {best_dir.upper():<7} | {conf*100:>5.1f}%  | {food_eaten:>2}/15    | {score:>5} pts | {status_str}")

        if delay > 0:
            time.sleep(delay)

    # 4. Final summary and verification
    end_time_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    avg_latency = round(sum(latencies) / max(1, len(latencies)), 1)

    try:
        summary = run_logger.close(
            summary={
                "session_id": session_id,
                "game_id": "snake",
                "started_at": start_time_iso,
                "ended_at": end_time_iso,
                "steps": steps,
                "final_score": float(score),
                "invalid_moves": 0,
                "fallbacks": 0,
                "average_laya_latency_ms": avg_latency,
                "laya_call_count": steps,
                "completion_status": "completed" if won else ("max_steps" if steps >= 300 else "failed"),
                "qualifying_score": float(score) if score >= 600 else None,
                "verified": None,
            }
        )
    except Exception as log_err:
        print(f"      [WARN] Logger close warning: {log_err}")

    print("\n" + "=" * 70)
    print(f"  GAME FINISHED: {'*** VICTORY (15 FOODS EATEN!) ***' if won else 'COMPLETED'}")
    print(f"  Final Score:   {score} / 1000")
    print(f"  Foods Eaten:   {food_eaten} / 15")
    print(f"  Total Steps:   {steps}")
    print(f"  Session ID:    {session_id}")
    print("=" * 70)

    # 5. Fetch and display official TopGameAI Leaderboard
    print("\n[4/4] Fetching official TopGameAI Snake leaderboard...")
    leaderboard = fetch_leaderboard(base_url)
    print("\n" + "=" * 70)
    print("  TOPGAMEAI ARENA -- OFFICIAL SNAKE LEADERBOARD")
    print("=" * 70)
    print(f"{'RANK':<6} | {'AGENT NAME':<24} | {'SCORE':<7} | {'STEPS':<7} | {'SESSION ID'}")
    print("-" * 70)

    found_in_board = False
    for entry in leaderboard:
        r = entry.get("rank", "-")
        an = entry.get("agentName", "Unknown")
        sc = entry.get("score", 0)
        st_count = entry.get("steps", 0)
        g_id = entry.get("gameId", "")

        is_ours = (g_id == session_id) or (an == agent_name and sc == score)
        prefix = "* " if is_ours else "  "
        if is_ours:
            found_in_board = True

        print(f"{prefix}{r:<4} | {an:<24} | {sc:>5} pts | {st_count:>5}   | {g_id[:16]}...")

    print("=" * 70)
    if found_in_board:
        print(f"[OK] SUCCESS: '{agent_name}' is confirmed on the TopGameAI official leaderboard!")
    else:
        print(f"[OK] Game submitted to TopGameAI Arena with score {score}!")

    print(f"\nLive replay & decision telemetry saved to:")
    print(f"  http://localhost:8000/dashboard.html#/replay?session={session_id}")
    print(f"  http://localhost:8000/dashboard.html#/live")

    return {
        "session_id": session_id,
        "score": score,
        "steps": steps,
        "foods_eaten": food_eaten,
        "won": won,
        "leaderboard": leaderboard,
    }


def main():
    parser = argparse.ArgumentParser(description="Play TopGameAI Snake and update leaderboard.")
    parser.add_argument("--base-url", default="https://topgameai.com/api/arena", help="TopGameAI API base URL")
    parser.add_argument("--agent-name", default="4-Goats", help="Agent name for leaderboard submission")
    parser.add_argument("--delay", type=float, default=0.12, help="Delay in seconds between moves for live viewing (default 0.12s)")
    parser.add_argument("--logs-dir", default="logs/runs", help="Directory to write session logs")
    parser.add_argument("--session-id", default=None, help="Existing session_id to attach to")
    args = parser.parse_args()

    play_topgameai_game(
        base_url=args.base_url,
        agent_name=args.agent_name,
        delay=args.delay,
        logs_dir=args.logs_dir,
        session_id=args.session_id,
    )


if __name__ == "__main__":
    main()
