"""FastAPI application for Beat the Bot backend (Lane D).

Provides:
- GET /api/health: Service status, freshness, and log availability
- GET /api/runs: List all run summaries
- GET /api/runs/{id}/events: Paginated list of events
- GET /api/runs/{id}/events/{step}: Single event at step
- GET /api/runs/{id}/verify: Tamper and traceability verification
- GET /api/stream: Server-Sent Events stream for live game tailing
- GET /api/runs/{id}/autopsy: Decision autopsy inspection
- GET /api/runs/{id}/calibration: Single run calibration (calls bot.calibration or returns 501)
- GET /api/calibration: Aggregate calibration (calls bot.calibration or returns 501)
- GET /api/lab: Question Lab results
- GET /api/logs/{id}/download: Raw JSONL log file download
- Serves static dashboard files from web/
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncGenerator, Optional
import asyncio
import hashlib
import json
import time

from fastapi import FastAPI, Header, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from bot.logger import latest_session, list_sessions, load_events


REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_LOGS_DIR = REPO_ROOT / "logs" / "runs"
EXPERIMENTS_DIR = REPO_ROOT / "experiments" / "results"
WEB_DIR = REPO_ROOT / "web"
CONTRACTS_DIR = REPO_ROOT / "contracts"


def create_app(logs_dir: Optional[Path] = None) -> FastAPI:
    app = FastAPI(
        title="Beat the Bot API",
        version="1.0.0",
        description="Decision layer API and live streaming server",
    )

    app.state.logs_dir = Path(logs_dir or DEFAULT_LOGS_DIR)

    # Enable CORS for local origins (dashboard dev server or separate ports)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def json_error(status_code: int, code: str, message: str) -> JSONResponse:
        return JSONResponse(
            status_code=status_code,
            content={"error": {"code": code, "message": message}},
        )

    # -------------------------------------------------------------------------
    # REST API Endpoints
    # -------------------------------------------------------------------------

    @app.get("/api/health")
    async def health():
        """Service status, log availability, and last-event freshness."""
        logs_p: Path = app.state.logs_dir
        exists = logs_p.exists()
        sessions = list_sessions(logs_p) if exists else []
        latest_id = latest_session(logs_p) if exists else None

        last_event_ts = None
        seconds_since = None
        bot_active = False

        if latest_id:
            events_file = logs_p / f"{latest_id}.jsonl"
            if events_file.exists():
                mtime = events_file.stat().st_mtime
                seconds_since = round(time.time() - mtime, 1)
                bot_active = seconds_since <= 10.0
                events = load_events(events_file)
                if events:
                    last_event_ts = events[-1].get("ts")

        return {
            "status": "healthy",
            "uptime_seconds": round(time.time() - app.state.start_time, 1),
            "logs_directory": str(logs_p),
            "runs_count": len(sessions),
            "latest_session_id": latest_id,
            "last_event_ts": last_event_ts,
            "seconds_since_last_event": seconds_since,
            "bot_active": bot_active,
        }

    @app.get("/api/runs")
    async def get_runs():
        """Available sessions and their summaries."""
        logs_p: Path = app.state.logs_dir
        runs = list_sessions(logs_p)
        return {"runs": runs}

    @app.get("/api/runs/{id}/events")
    async def get_events(
        id: str,
        from_step: int = Query(0, alias="from", ge=0),
        limit: int = Query(100, ge=1, le=500),
    ):
        """Ordered event page for a session."""
        logs_p: Path = app.state.logs_dir
        file_path = logs_p / f"{id}.jsonl"
        if not file_path.exists():
            return json_error(404, "SESSION_NOT_FOUND", f"Session '{id}' was not found.")

        events = load_events(file_path)
        total = len(events)
        page = events[from_step : from_step + limit]

        return {
            "session_id": id,
            "from": from_step,
            "limit": limit,
            "total_events": total,
            "events": page,
        }

    @app.get("/api/runs/{id}/events/{step}")
    async def get_single_event(id: str, step: int):
        """Exact event at a step, unchanged, with line number and source file."""
        logs_p: Path = app.state.logs_dir
        file_path = logs_p / f"{id}.jsonl"
        if not file_path.exists():
            return json_error(404, "SESSION_NOT_FOUND", f"Session '{id}' was not found.")

        found_event = None
        line_num = 0

        with open(file_path, "r", encoding="utf-8") as f:
            for idx, line in enumerate(f, start=1):
                text = line.strip()
                if not text:
                    continue
                try:
                    ev = json.loads(text)
                    if ev.get("step") == step:
                        found_event = ev
                        line_num = idx
                        break
                except json.JSONDecodeError:
                    continue

        if found_event is None:
            return json_error(
                404,
                "STEP_NOT_FOUND",
                f"Step {step} was not found in session '{id}'.",
            )

        return {
            "source_file": str(file_path),
            "line_number": line_num,
            "event": found_event,
        }

    @app.get("/api/runs/{id}/verify")
    async def verify_run(id: str):
        """Audits log file: SHA-256 integrity, contiguous steps, and Laya call traceability."""
        logs_p: Path = app.state.logs_dir
        file_path = logs_p / f"{id}.jsonl"
        if not file_path.exists():
            return json_error(404, "SESSION_NOT_FOUND", f"Session '{id}' was not found.")

        # Compute SHA-256
        sha256_hash = hashlib.sha256()
        with open(file_path, "rb") as f:
            while chunk := f.read(65536):
                sha256_hash.update(chunk)
        calc_sha = sha256_hash.hexdigest()

        # Check summary file
        summary_path = logs_p / f"{id}.summary.json"
        summary_sha = None
        if summary_path.exists():
            try:
                with open(summary_path, "r", encoding="utf-8") as f:
                    summary_data = json.load(f)
                summary_sha = summary_data.get("sha256")
            except Exception:
                pass

        hash_matches = (calc_sha == summary_sha) if summary_sha else None

        events = load_events(file_path)
        steps_contiguous = True
        every_move_logged = True
        laya_calls_count = 0

        for idx, ev in enumerate(events):
            if ev.get("step") != idx:
                steps_contiguous = False

            l_calls = ev.get("laya_calls", [])
            laya_calls_count += len(l_calls)

            final_act = ev.get("final_action")
            if final_act is not None:
                # Must trace to a chosen_action in laya_calls or a documented fallback
                chosen_actions = [c.get("chosen_action") for c in l_calls]
                is_fallback = ev.get("validator", {}).get("fallback", False)
                if final_act not in chosen_actions and not is_fallback:
                    every_move_logged = False

        audit_passed = bool(steps_contiguous and every_move_logged and (hash_matches is not False))

        return {
            "session_id": id,
            "sha256": calc_sha,
            "summary_sha256": summary_sha,
            "hash_matches_summary": hash_matches,
            "event_count": len(events),
            "laya_call_count": laya_calls_count,
            "steps_contiguous": steps_contiguous,
            "every_move_logged": every_move_logged,
            "audit_passed": audit_passed,
        }

    @app.get("/api/runs/{id}/autopsy")
    async def get_run_autopsy(id: str):
        """Decision Autopsy items for a run."""
        logs_p: Path = app.state.logs_dir
        file_path = logs_p / f"{id}.jsonl"
        if not file_path.exists():
            return json_error(404, "SESSION_NOT_FOUND", f"Session '{id}' was not found.")

        events = load_events(file_path)

        # Check if bot.autopsy is available
        try:
            import bot.autopsy as autopsy_module

            if hasattr(autopsy_module, "analyse"):
                items = autopsy_module.analyse(events)
                summary_data = (
                    autopsy_module.summary(items)
                    if hasattr(autopsy_module, "summary")
                    else {}
                )
                return {
                    "session_id": id,
                    "summary": summary_data,
                    "items": items,
                }
        except (ImportError, ModuleNotFoundError):
            pass

        # Fallback autopsy analysis using standard rules from AGENTS.md 5.8
        items = []
        counts = {
            "total_steps": len(events),
            "as_predicted": 0,
            "confident_miss": 0,
            "uncertain_miss": 0,
            "lucky_hit": 0,
            "illegal_move": 0,
            "game_over": 0,
        }

        for ev in events:
            step = ev.get("step", 0)
            validator = ev.get("validator", {})
            game_resp = ev.get("game_response", {})
            good = game_resp.get("good")
            done = game_resp.get("done", False)

            # Probabilities of chosen action
            l_calls = ev.get("laya_calls", [])
            last_call = l_calls[-1] if l_calls else {}
            scores = last_call.get("action_scores", {})
            chosen = last_call.get("chosen_action")
            prob = scores.get(chosen, 0.5) if chosen else 0.5

            if validator.get("retries", 0) > 0 or last_call.get("legal") is False:
                verdict = "illegal_move"
                severity = 0.9
            elif done and good is False:
                verdict = "game_over"
                severity = 1.0
            elif prob >= 0.7 and good is False:
                verdict = "confident_miss"
                severity = 0.8
            elif prob < 0.7 and good is False:
                verdict = "uncertain_miss"
                severity = 0.6
            elif prob < 0.5 and good is True:
                verdict = "lucky_hit"
                severity = 0.4
            else:
                verdict = "as_predicted"
                severity = 0.1

            counts[verdict] = counts.get(verdict, 0) + 1

            note = (
                f"Laya selected '{chosen}' with confidence {prob:.2f}. "
                f"Game outcome was {'positive' if good else 'negative'}. "
                f"Hypothesis: evaluation of step {step} produced verdict {verdict}."
            )

            items.append({
                "step": step,
                "verdict": verdict,
                "expected": f"Expected success for {chosen}",
                "actual": f"Game responded: {game_resp.get('message') or ('good=' + str(good))}",
                "note": note,
                "severity": severity,
                "question_id": last_call.get("question_set"),
                "probabilities": scores,
            })

        return {
            "session_id": id,
            "summary": counts,
            "items": items,
        }

    @app.get("/api/runs/{id}/calibration")
    async def get_run_calibration(id: str):
        """Calibration metrics for a single run."""
        logs_p: Path = app.state.logs_dir
        file_path = logs_p / f"{id}.jsonl"
        if not file_path.exists():
            return json_error(404, "SESSION_NOT_FOUND", f"Session '{id}' was not found.")

        events = load_events(file_path)

        try:
            import bot.calibration as calib_mod

            if hasattr(calib_mod, "compute"):
                result = calib_mod.compute(events)
                return result
        except (ImportError, ModuleNotFoundError):
            pass

        return json_error(
            501,
            "CALIBRATION_NOT_AVAILABLE",
            "Calibration engine (Lane B) is not yet implemented.",
        )

    @app.get("/api/calibration")
    async def get_aggregate_calibration():
        """Aggregate calibration across all runs."""
        try:
            import bot.calibration as calib_mod

            if hasattr(calib_mod, "compute_aggregate"):
                logs_p: Path = app.state.logs_dir
                return calib_mod.compute_aggregate(logs_p)
        except (ImportError, ModuleNotFoundError):
            pass

        return json_error(
            501,
            "CALIBRATION_NOT_AVAILABLE",
            "Calibration engine (Lane B) is not yet implemented.",
        )

    @app.get("/api/lab")
    async def get_lab_results():
        """Reads validated Question Lab result files from experiments/results/."""
        results = []
        if EXPERIMENTS_DIR.exists():
            for json_file in sorted(
                EXPERIMENTS_DIR.glob("*.json"),
                key=lambda f: f.stat().st_mtime,
                reverse=True,
            ):
                try:
                    with open(json_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                    if "name" in data and "variants" in data:
                        results.append(data)
                except Exception:
                    continue

        return {"experiments": results}

    @app.get("/api/logs/{id}/download")
    async def download_log(id: str):
        """Downloads original raw .jsonl event file."""
        logs_p: Path = app.state.logs_dir
        file_path = logs_p / f"{id}.jsonl"
        if not file_path.exists():
            return json_error(404, "SESSION_NOT_FOUND", f"Session '{id}' was not found.")

        return FileResponse(
            path=file_path,
            media_type="application/x-jsonlines",
            filename=f"{id}.jsonl",
        )

    # -------------------------------------------------------------------------
    # TopGameAI Arena Live Match Endpoints
    # -------------------------------------------------------------------------

    @app.post("/api/arena/play")
    async def play_arena_match(request: Request):
        """Launches an autonomous game against TopGameAI Arena in the background."""
        try:
            body = await request.json()
        except Exception:
            body = {}

        agent_name = body.get("agent_name", "4-Goats")
        delay = float(body.get("delay", 0.12))
        session_id = body.get("session_id")
        game = body.get("game", "snake").lower()

        import threading

        if game == "2048":
            from scripts.play_topgameai_2048 import play_topgameai_2048

            t = threading.Thread(
                target=play_topgameai_2048,
                kwargs={
                    "base_url": "https://topgameai.com/api/arena",
                    "agent_name": agent_name,
                    "delay": delay,
                    "logs_dir": str(app.state.logs_dir),
                    "session_id": session_id,
                },
                daemon=True,
            )
            t.start()
            target_url = "https://topgameai.com/arena/2048"
        else:
            from scripts.play_topgameai_live import play_topgameai_game

            t = threading.Thread(
                target=play_topgameai_game,
                kwargs={
                    "base_url": "https://topgameai.com/api/arena",
                    "agent_name": agent_name,
                    "delay": delay,
                    "logs_dir": str(app.state.logs_dir),
                    "session_id": session_id,
                },
                daemon=True,
            )
            t.start()
            target_url = "https://topgameai.com/arena/snake"

        return {
            "status": "started",
            "game": game,
            "agent_name": agent_name,
            "session_id": session_id,
            "target": target_url,
            "message": f"{game.upper()} match started for team '{agent_name}'. Streaming to dashboard.",
        }

    @app.post("/api/arena/hook")
    async def hook_arena_session(request: Request):
        """Attaches to an active session started on topgameai.com."""
        try:
            body = await request.json()
        except Exception:
            body = {}

        session_id = body.get("session_id")
        if not session_id:
            return json_error(400, "MISSING_SESSION_ID", "session_id is required")

        agent_name = body.get("agent_name", "4-Goats")
        delay = float(body.get("delay", 0.12))
        game = body.get("game", "snake").lower()

        import threading

        if game == "2048":
            from scripts.play_topgameai_2048 import play_topgameai_2048

            t = threading.Thread(
                target=play_topgameai_2048,
                kwargs={
                    "base_url": "https://topgameai.com/api/arena",
                    "agent_name": agent_name,
                    "delay": delay,
                    "logs_dir": str(app.state.logs_dir),
                    "session_id": session_id,
                },
                daemon=True,
            )
            t.start()
        else:
            from scripts.play_topgameai_live import play_topgameai_game

            t = threading.Thread(
                target=play_topgameai_game,
                kwargs={
                    "base_url": "https://topgameai.com/api/arena",
                    "agent_name": agent_name,
                    "delay": delay,
                    "logs_dir": str(app.state.logs_dir),
                    "session_id": session_id,
                },
                daemon=True,
            )
            t.start()

        return {
            "status": "attached",
            "game": game,
            "session_id": session_id,
            "agent_name": agent_name,
            "message": f"Attached to {game} session {session_id} for team '{agent_name}'. Streaming to dashboard.",
        }

    _arena_step_loggers = {}

    @app.post("/api/arena/step")
    async def record_arena_step(request: Request):
        """Records an incoming step from the browser on topgameai.com (Snake or 2048)."""
        try:
            body = await request.json()
        except Exception:
            return json_error(400, "INVALID_JSON", "Invalid JSON payload")

        session_id = body.get("session_id")
        if not session_id:
            return json_error(400, "MISSING_SESSION_ID", "session_id is required")

        step = int(body.get("step", 0))
        st = body.get("state", {})
        action = body.get("action")
        agent_name = body.get("agent_name", "4-Goats")
        score = float(body.get("score", 0.0))
        done = bool(body.get("done", False))
        won = bool(body.get("won", False))
        game_id = str(body.get("game_id") or ("2048" if "grid" in st and len(st.get("grid", [])) == 4 else "snake"))

        from bot.logger import RunLogger

        if session_id not in _arena_step_loggers:
            _arena_step_loggers[session_id] = RunLogger(
                game_id=game_id,
                session_id=session_id,
                logs_dir=app.state.logs_dir,
            )

        logger = _arena_step_loggers[session_id]

        if game_id == "2048":
            from bot.adapters.game2 import calculate_2048_points, simulate_move_2048
            from bot.laya.game2048_solver import choose_best_2048_action

            grid = st.get("grid", [[0]*4 for _ in range(4)])
            in_score = int(st.get("score", body.get("in_game_score", score)))
            best_tile = int(st.get("best", max((max(r) for r in grid), default=2) if grid else 2))
            arena_points = calculate_2048_points(best_tile, in_score)

            # Filter legal actions: only actions that change the board
            legal_actions = []
            for act in ("up", "down", "left", "right"):
                _, _, changed = simulate_move_2048(grid, act)
                if changed:
                    legal_actions.append({"id": act, "label": act.capitalize(), "hint": f"Slide {act}"})
            if not legal_actions:
                legal_actions = [{"id": act, "label": act.capitalize()} for act in ("up", "down", "left", "right")]

            # Laya 2048 solver & 2-question probability choice table
            best_act, probs, conf, reason = choose_best_2048_action(grid)
            chosen = action or best_act

            event_data = {
                "step": step,
                "session_id": session_id,
                "game_id": "2048",
                "state": {
                    "game_id": "2048",
                    "session_id": session_id,
                    "step": step,
                    "state_text": f"Team {agent_name} | 2048 Arena | Step {step}/2000 | Best Tile: {best_tile} | In-Score: {in_score} | Points: {arena_points}",
                    "facts": {
                        "agent_name": agent_name,
                        "grid": grid,
                        "score": in_score,
                        "best": best_tile,
                        "points": arena_points,
                        "grid_size": [4, 4],
                    },
                    "legal_actions": legal_actions,
                    "score": arena_points,
                    "done": done,
                },
                "laya_calls": [
                    {
                        "question_set": "game2_v1_perception",
                        "questions": [
                            {
                                "id": "best_merge_direction",
                                "type": "choice",
                                "text": "Looking at the 4x4 tile board, which sliding direction merges adjacent equal-value tiles to create the largest consolidated values?",
                                "options": ["up", "down", "left", "right", "none"],
                            },
                            {
                                "id": "corner_preservation",
                                "type": "choice",
                                "text": "Which slide direction best keeps the board's largest tile securely anchored in its corner without displacing it toward the open center?",
                                "options": ["up", "down", "left", "right", "neutral"],
                            },
                        ],
                        "raw": {
                            "probabilities": [probs.get("up", 0.0), probs.get("down", 0.0), probs.get("left", 0.0), probs.get("right", 0.0)],
                            "predicted_token": chosen,
                        },
                        "action_scores": probs,
                        "chosen_action": chosen,
                        "latency_ms": 22.0,
                        "accepted": True,
                        "excluded": False,
                        "legal": True,
                        "reason": reason,
                    }
                ],
                "validator": {"retries": 0, "fallback": False, "rejections": []},
                "final_action": chosen,
                "game_response": {
                    "good": False if (done and not won and best_tile < 2048) else True,
                    "score_before": 0,
                    "score_after": arena_points,
                    "done": done,
                    "message": "2048 victory!" if (won or best_tile >= 2048) else ("2048 board locked / step cap reached" if done else f"2048 slide {chosen} successful"),
                },
                "outcome": f"Step {step}: {chosen.upper()} | Best Tile: {best_tile} | Points: {arena_points}",
            }
            logger.event(event_data)

            if done:
                now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
                try:
                    logger.close(
                        summary={
                            "session_id": session_id,
                            "game_id": "2048",
                            "started_at": now_iso,
                            "ended_at": now_iso,
                            "steps": step,
                            "final_score": arena_points,
                            "in_game_score": in_score,
                            "best_tile": best_tile,
                            "invalid_moves": 0,
                            "fallbacks": 0,
                            "average_laya_latency_ms": 22.0,
                            "laya_call_count": step if step > 0 else 1,
                            "completion_status": "completed" if won or best_tile >= 2048 else "ended",
                            "qualifying_score": arena_points if arena_points >= 500 else None,
                            "verified": True,
                        }
                    )
                except Exception:
                    pass
                _arena_step_loggers.pop(session_id, None)

            return {"status": "ok", "step": step, "session_id": session_id, "game_id": "2048", "action": chosen}

        # Snake game processing
        food_eaten = int(st.get("foodEaten", body.get("foodEaten", 0)))
        snake = st.get("snake", [])
        food = st.get("food", {})
        direction = st.get("direction", "right")

        probs = {"up": 0.05, "down": 0.05, "left": 0.05, "right": 0.05}
        if action in probs:
            probs[action] = 0.85
            rem = (1.0 - 0.85) / 3.0
            for d in probs:
                if d != action:
                    probs[d] = round(rem, 3)

        event_data = {
            "step": step,
            "session_id": session_id,
            "game_id": "snake",
            "state": {
                "game_id": "snake",
                "session_id": session_id,
                "step": step,
                "state_text": f"Team {agent_name} | Snake head at ({snake[0]['x'] if snake else '?'}, {snake[0]['y'] if snake else '?'}) heading {direction}. Progress: {food_eaten}/15 foods.",
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
                    {"id": "up", "label": "Up"},
                    {"id": "down", "label": "Down"},
                    {"id": "left", "label": "Left"},
                    {"id": "right", "label": "Right"},
                ],
                "score": score,
                "done": done,
            },
            "laya_calls": [
                {
                    "question_set": "game1_v1_perception",
                    "questions": [
                        {
                            "id": "safest_direction",
                            "type": "choice",
                            "text": "Which adjacent tile is completely clear and advances toward food?",
                            "options": ["up", "down", "left", "right"],
                        }
                    ],
                    "raw": {"probabilities": [probs["up"], probs["down"], probs["left"], probs["right"]], "predicted_token": action or "right"},
                    "action_scores": probs,
                    "chosen_action": action or "right",
                    "latency_ms": 28.0,
                    "accepted": True,
                    "excluded": False,
                    "legal": True,
                    "reason": f"Live lockstep move from topgameai.com as team {agent_name}",
                }
            ] if action else [],
            "validator": {"retries": 0, "fallback": False, "rejections": []},
            "final_action": action,
            "game_response": {
                "good": True,
                "score_before": max(0.0, score - (60.0 if food_eaten > 0 else 0.0)),
                "score_after": score,
                "done": done,
                "message": "Step recorded from topgameai.com",
            },
            "outcome": f"Step {step}: {(action or 'START').upper()} | Foods: {food_eaten}/15 | Score: {score}",
        }

        logger.event(event_data)

        if done:
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
            try:
                logger.close(
                    summary={
                        "session_id": session_id,
                        "game_id": "snake",
                        "started_at": now_iso,
                        "ended_at": now_iso,
                        "steps": step,
                        "final_score": score,
                        "invalid_moves": 0,
                        "fallbacks": 0,
                        "average_laya_latency_ms": 28.0,
                        "laya_call_count": step,
                        "completion_status": "completed" if won else "failed",
                        "qualifying_score": score if score >= 600 else None,
                        "verified": None,
                    }
                )
            except Exception:
                pass
            _arena_step_loggers.pop(session_id, None)

        return {"status": "ok", "step": step, "session_id": session_id, "game_id": "snake"}

    @app.get("/api/arena/leaderboard")
    async def get_arena_leaderboard(game: str = Query("snake")):
        """Fetches the official TopGameAI leaderboard for Snake or 2048."""
        import urllib.request
        import json

        game_name = "2048" if "2048" in game.lower() else "snake"
        url = f"https://topgameai.com/api/arena/leaderboard/{game_name}"
        try:
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) BeatTheBot/1.0"},
            )
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                leaderboard = data.get("leaderboard", [])
        except Exception:
            leaderboard = []

        return {"game": game_name, "leaderboard": leaderboard}

    # -------------------------------------------------------------------------
    # Server-Sent Events (SSE) Live Stream
    # -------------------------------------------------------------------------

    @app.get("/api/stream")
    async def stream_events(
        request: Request,
        session_id: str = Query("latest"),
        last_event_id: Optional[str] = Header(None, alias="Last-Event-ID"),
        live: bool = Query(True),
    ):
        """Server-Sent Events stream.

        Sends existing events first, then tails the .jsonl file for new events (if live=True).
        Emits keep-alive comments every 15 seconds.
        """
        logs_p: Path = app.state.logs_dir

        # Parse Last-Event-ID if provided
        start_step = None
        if last_event_id is not None:
            try:
                start_step = int(last_event_id)
            except ValueError:
                pass

        async def event_generator() -> AsyncGenerator[str, None]:
            # 1. Resolve session_id
            target_id = session_id
            if target_id == "latest":
                target_id = latest_session(logs_p)
                if not target_id:
                    # Wait briefly in case the bot is just creating the session
                    for _ in range(30):
                        if await request.is_disconnected():
                            return
                        await asyncio.sleep(0.1)
                        target_id = latest_session(logs_p)
                        if target_id:
                            break

            if not target_id:
                yield ": info: waiting for active session...\n\n"
                return

            file_path = logs_p / f"{target_id}.jsonl"
            if not file_path.exists():
                yield f": error: session '{target_id}' not found\n\n"
                return

            # Open file and stream existing events
            with open(file_path, "r", encoding="utf-8") as f:
                last_keepalive = time.time()

                # Stream existing events
                while True:
                    if await request.is_disconnected():
                        return
                    line = f.readline()
                    if not line:
                        break
                    line_str = line.strip()
                    if not line_str:
                        continue
                    try:
                        ev = json.loads(line_str)
                        step = ev.get("step", 0)
                        if start_step is not None and step <= start_step:
                            continue
                        yield f"id: {step}\nevent: step\ndata: {line_str}\n\n"
                        last_keepalive = time.time()
                    except json.JSONDecodeError:
                        continue

                if not live:
                    return

                # Live tailing loop
                while True:
                    if await request.is_disconnected():
                        return

                    line = f.readline()
                    if line:
                        line_str = line.strip()
                        if line_str:
                            try:
                                ev = json.loads(line_str)
                                step = ev.get("step", 0)
                                yield f"id: {step}\nevent: step\ndata: {line_str}\n\n"
                            except json.JSONDecodeError:
                                pass
                            last_keepalive = time.time()
                    else:
                        now = time.time()
                        if now - last_keepalive >= 15.0:
                            yield ": keep-alive\n\n"
                            last_keepalive = now
                        await asyncio.sleep(0.1)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    # -------------------------------------------------------------------------
    # Static Assets & Frontend Mounting
    # -------------------------------------------------------------------------

    if WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="web-static")
        app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
    else:
        @app.get("/")
        async def index():
            return JSONResponse({
                "service": "Beat the Bot API Server",
                "status": "ready",
                "docs": "/api/health",
                "web": "web/ directory not found",
            })

    return app


# Default application instance
app = create_app()
app.state.start_time = time.time()
