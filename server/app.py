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

    @app.get("/")
    async def index():
        index_file = WEB_DIR / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        return JSONResponse({
            "service": "Beat the Bot API Server",
            "status": "ready",
            "docs": "/api/health",
            "web": "web/index.html is awaiting Member C dashboard implementation",
        })

    if WEB_DIR.exists():
        app.mount("/static", StaticFiles(directory=str(WEB_DIR)), name="web-static")

    return app


# Default application instance
app = create_app()
app.state.start_time = time.time()
