"""RunLogger and log management helpers for Beat the Bot (Lane D).

Provides:
- RunLogger: Thread-safe event logging with atomic line writes, fsync, validation,
  and automatic secret redaction.
- load_events: Loads immutable JSONL event streams.
- latest_session: Finds the most recent session ID.
- list_sessions: Lists session summaries, dynamically deriving metrics for unclosed runs.
- redact: Recursively redacts secrets and sensitive credentials.
"""

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
import copy
import hashlib
import json
import os
import re
import secrets
import threading

import jsonschema
from jsonschema import Draft202012Validator
from referencing import Registry, Resource


REPO_ROOT = Path(__file__).resolve().parent.parent
CONTRACTS_DIR = REPO_ROOT / "contracts"

# Secret patterns for recursive redaction
SECRET_KEY_PATTERN = re.compile(
    r"(api[_-]?key|token|authorization|auth|password|passwd|secret|bearer|cookie|credential|private[_-]?key)",
    re.IGNORECASE,
)


def redact(data: Any) -> Any:
    """Recursively redacts values for keys matching sensitive credential names.

    Creates a safe deep copy and replaces sensitive values with '[REDACTED]'.
    """
    if isinstance(data, dict):
        cleaned = {}
        for k, v in data.items():
            if isinstance(k, str) and SECRET_KEY_PATTERN.search(k):
                cleaned[k] = "[REDACTED]"
            else:
                cleaned[k] = redact(v)
        return cleaned
    elif isinstance(data, list):
        return [redact(item) for item in data]
    return copy.deepcopy(data)


_SCHEMA_REGISTRY: Registry | None = None
_EVENT_VALIDATOR: Draft202012Validator | None = None
_SUMMARY_VALIDATOR: Draft202012Validator | None = None
_VALIDATOR_LOCK = threading.Lock()


def _get_schema_registry() -> Registry:
    global _SCHEMA_REGISTRY
    if _SCHEMA_REGISTRY is None:
        registry = Registry()
        if CONTRACTS_DIR.exists():
            for schema_path in CONTRACTS_DIR.glob("*.schema.json"):
                with open(schema_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                res = Resource.from_contents(data)
                registry = registry.with_resource(schema_path.name, res)
                if "$id" in data:
                    registry = registry.with_resource(data["$id"], res)
        _SCHEMA_REGISTRY = registry
    return _SCHEMA_REGISTRY


def _get_event_validator() -> Draft202012Validator:
    global _EVENT_VALIDATOR
    with _VALIDATOR_LOCK:
        if _EVENT_VALIDATOR is None:
            schema_path = CONTRACTS_DIR / "event.schema.json"
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_data = json.load(f)
            _EVENT_VALIDATOR = Draft202012Validator(
                schema_data, registry=_get_schema_registry()
            )
        return _EVENT_VALIDATOR


def _get_summary_validator() -> Draft202012Validator:
    global _SUMMARY_VALIDATOR
    with _VALIDATOR_LOCK:
        if _SUMMARY_VALIDATOR is None:
            schema_path = CONTRACTS_DIR / "summary.schema.json"
            with open(schema_path, "r", encoding="utf-8") as f:
                schema_data = json.load(f)
            _SUMMARY_VALIDATOR = Draft202012Validator(
                schema_data, registry=_get_schema_registry()
            )
        return _SUMMARY_VALIDATOR


class EventValidationError(ValueError):
    """Raised when an event fails schema validation."""
    pass


class RunLogger:
    """Thread-safe event logger for decision steps during game runs.

    Appends one immutable event per line to logs/runs/<session_id>.jsonl,
    flushes and fsyncs immediately, and outputs a tamper-verifiable summary
    file on close.
    """

    def __init__(
        self,
        game_id: str,
        logs_dir: str | Path = "logs/runs",
        validate: bool = True,
        session_id: str | None = None,
    ):
        self.game_id = str(game_id)
        self.logs_dir = Path(logs_dir)
        self.validate = bool(validate)
        self._lock = threading.Lock()

        # Format: YYYYMMDD-HHMMSS-ab12 (UTC + 4 hex chars)
        if session_id:
            self.session_id = session_id
        else:
            now_utc = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            rand_suffix = secrets.token_hex(2)
            self.session_id = f"{now_utc}-{rand_suffix}"

        self.logs_dir.mkdir(parents=True, exist_ok=True)
        self.file_path = self.logs_dir / f"{self.session_id}.jsonl"

        # Open in append mode
        self._file = open(self.file_path, "a", encoding="utf-8")

        self.started_at: str | None = None
        self.last_event_ts: str | None = None
        self.event_count = 0
        self.laya_call_count = 0
        self.fallback_count = 0
        self._closed = False
        self._last_hash = "0" * 64

        # If file exists and has content, seed _last_hash from the last record
        if self.file_path.exists() and self.file_path.stat().st_size > 0:
            try:
                with open(self.file_path, "r", encoding="utf-8") as f:
                    for line in f:
                        line_str = line.strip()
                        if line_str:
                            last_ev = json.loads(line_str)
                            if "hash" in last_ev:
                                self._last_hash = str(last_ev["hash"])
                            self.event_count += 1
            except Exception:
                pass

    def event(self, event_data: dict) -> dict:
        """Appends a validated, redacted, hash-chained decision event to the .jsonl log."""
        if self._closed:
            raise RuntimeError("Cannot write event: RunLogger is already closed.")

        # Shallow copy to avoid mutating caller's dict before redaction
        data = dict(event_data)

        # 1. Fill missing required header and participant guide fields
        data.setdefault("schema", 1)
        data.setdefault("session_id", self.session_id)
        data.setdefault("game_id", self.game_id)
        data.setdefault("game", data.get("game_id", self.game_id))
        if "ts" not in data or not data["ts"]:
            now = datetime.now(timezone.utc)
            data["ts"] = now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        data.setdefault("timestamp", data["ts"])

        # Populate guide-mandated fields if missing
        if "action" not in data and "final_action" in data:
            data["action"] = data["final_action"]
        if "state_before" not in data:
            data["state_before"] = data.get("state")
        if "state_after" not in data:
            game_resp = data.get("game_response", {})
            data["state_after"] = game_resp.get("state_after") if isinstance(game_resp, dict) else None
        if "result" not in data:
            data["result"] = data.get("game_response")

        # Standardise decision field with four probabilities: up, down, left, right
        if "decision" not in data or not isinstance(data.get("decision"), dict):
            chosen = data.get("action") or data.get("final_action")
            l_calls = data.get("laya_calls", [])
            last_call = l_calls[-1] if l_calls else {}
            scores = last_call.get("action_scores", {})
            probs = {}
            for d in ("up", "down", "left", "right"):
                probs[d] = float(scores.get(d, 0.0))
            sum_p = sum(probs.values())
            if sum_p > 0:
                probs = {d: round(v / sum_p, 4) for d, v in probs.items()}
                diff = round(1.0 - sum(probs.values()), 4)
                target_k = chosen if chosen in probs else "right"
                probs[target_k] = round(probs[target_k] + diff, 4)
            else:
                probs = {"up": 0.25, "down": 0.25, "left": 0.25, "right": 0.25}
            conf = probs.get(chosen, 0.25) if chosen else 0.25
            data["decision"] = {
                "chosen": chosen,
                "confidence": conf,
                "probabilities": probs,
            }

        # Standardise timing field
        if "timing" not in data:
            l_calls = data.get("laya_calls", [])
            last_call = l_calls[-1] if l_calls else {}
            lat = float(last_call.get("latency_ms", 0.0))
            data["timing"] = {
                "inference_ms": round(lat, 2),
                "total_ms": round(lat, 2),
            }

        # Hash chaining: set prev_hash from previous entry's hash
        data["prev_hash"] = self._last_hash

        # 2. Redact secrets recursively
        clean_event = redact(data)

        # 3. Compute SHA-256 hash of canonical JSON excluding 'hash'
        to_hash = {k: v for k, v in clean_event.items() if k != "hash"}
        canonical_str = json.dumps(to_hash, sort_keys=True, separators=(",", ":"))
        event_hash = hashlib.sha256(canonical_str.encode("utf-8")).hexdigest()
        clean_event["hash"] = event_hash
        self._last_hash = event_hash

        # 4. Schema validation
        if self.validate:
            validator = _get_event_validator()
            errors = sorted(validator.iter_errors(clean_event), key=lambda e: e.path)
            if errors:
                err = errors[0]
                field_path = ".".join(str(p) for p in err.path) or "root"
                raise EventValidationError(
                    f"Event schema validation failed at '{field_path}': {err.message}"
                )

        # 5. Serialize to single compact JSON line
        line = json.dumps(clean_event, separators=(",", ":")) + "\n"

        # 6. Thread-safe write + flush + fsync
        with self._lock:
            if not self.started_at:
                self.started_at = clean_event["ts"]
            self.last_event_ts = clean_event["ts"]

            self._file.write(line)
            self._file.flush()
            os.fsync(self._file.fileno())

            self.event_count += 1
            laya_calls = clean_event.get("laya_calls", [])
            if isinstance(laya_calls, list):
                self.laya_call_count += len(laya_calls)
            if clean_event.get("validator", {}).get("fallback") is True:
                self.fallback_count += 1

        return clean_event

    def log_rejected_move(
        self,
        step: int,
        state_before: dict,
        action: str,
        reason: str,
        laya_calls: list[dict] | None = None,
        timing: dict | None = None,
    ) -> dict:
        """Logs a rejected move event in compliance with the participant guide."""
        rejection_event = {
            "step": step,
            "session_id": self.session_id,
            "game_id": self.game_id,
            "game": self.game_id,
            "state": state_before,
            "state_before": state_before,
            "action": action,
            "final_action": None,  # rejected move was not executed
            "state_after": None,
            "laya_calls": laya_calls or [],
            "validator": {
                "retries": 1,
                "fallback": False,
                "rejections": [reason],
                "rejection_messages": [reason],
            },
            "game_response": {
                "good": False,
                "score_before": state_before.get("score", 0),
                "score_after": state_before.get("score", 0),
                "done": False,
                "message": f"Rejected: {reason}",
            },
            "result": {
                "accepted": False,
                "reason": reason,
            },
            "outcome": f"Rejected move '{action}': {reason}",
        }
        if timing:
            rejection_event["timing"] = timing
        return self.event(rejection_event)

    def close(self, summary: dict | None = None) -> dict:
        """Closes the event stream and writes <session_id>.summary.json."""
        with self._lock:
            if self._closed:
                summary_file = self.logs_dir / f"{self.session_id}.summary.json"
                if summary_file.exists():
                    with open(summary_file, "r", encoding="utf-8") as f:
                        return json.load(f)
                return {}

            self._file.flush()
            os.fsync(self._file.fileno())
            self._file.close()
            self._closed = True

        # Compute SHA-256 of the pure .jsonl event file
        sha256_hash = hashlib.sha256()
        if self.file_path.exists():
            with open(self.file_path, "rb") as f:
                while chunk := f.read(65536):
                    sha256_hash.update(chunk)
        sha256_hex = sha256_hash.hexdigest()

        now_str = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
        started_at = self.started_at or now_str
        ended_at = self.last_event_ts or now_str

        # Build baseline summary
        base_summary = {
            "session_id": self.session_id,
            "game_id": self.game_id,
            "started_at": started_at,
            "ended_at": ended_at,
            "steps": self.event_count,
            "final_score": None,
            "invalid_moves": 0,
            "fallbacks": 0,
            "average_laya_latency_ms": 0.0,
            "laya_call_count": self.laya_call_count,
            "completion_status": "completed",
            "qualifying_score": None,
            "verified": None,
            "event_count": self.event_count,
            "sha256": sha256_hex,
        }

        if summary:
            base_summary.update(summary)

        # Force immutable audit fields
        base_summary["session_id"] = self.session_id
        base_summary["game_id"] = self.game_id
        base_summary["event_count"] = self.event_count
        base_summary["sha256"] = sha256_hex
        if "laya_call_count" not in (summary or {}):
            base_summary["laya_call_count"] = self.laya_call_count

        clean_summary = redact(base_summary)

        if self.validate:
            summary_validator = _get_summary_validator()
            errors = sorted(summary_validator.iter_errors(clean_summary), key=lambda e: e.path)
            if errors:
                err = errors[0]
                field_path = ".".join(str(p) for p in err.path) or "root"
                raise EventValidationError(
                    f"Summary validation failed at '{field_path}': {err.message}"
                )

        summary_file = self.logs_dir / f"{self.session_id}.summary.json"
        with open(summary_file, "w", encoding="utf-8") as f:
            json.dump(clean_summary, f, indent=2)

        return clean_summary

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if not self._closed:
            self.close()


def load_events(path: str | Path) -> list[dict]:
    """Loads all event records from a .jsonl log file."""
    p = Path(path)
    if not p.exists():
        return []
    events = []
    with open(p, "r", encoding="utf-8") as f:
        for line in f:
            line_str = line.strip()
            if line_str:
                events.append(json.loads(line_str))
    return events


def latest_session(logs_dir: str | Path = "logs/runs") -> str | None:
    """Finds the most recent session ID in logs_dir by modification time."""
    p = Path(logs_dir)
    if not p.exists():
        return None
    jsonl_files = list(p.glob("*.jsonl"))
    if not jsonl_files:
        return None
    jsonl_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return jsonl_files[0].stem


def list_sessions(logs_dir: str | Path = "logs/runs") -> list[dict]:
    """Lists summary dictionaries for all sessions in logs_dir.

    If a run was never closed (<session_id>.summary.json missing), dynamically
    derives metrics from the raw .jsonl event stream.
    """
    p = Path(logs_dir)
    if not p.exists():
        return []

    summaries = []
    jsonl_files = list(p.glob("*.jsonl"))

    for jsonl_file in jsonl_files:
        session_id = jsonl_file.stem
        summary_path = p / f"{session_id}.summary.json"

        if summary_path.exists():
            try:
                with open(summary_path, "r", encoding="utf-8") as f:
                    summaries.append(json.load(f))
                continue
            except Exception:
                # If summary is corrupted, fall through to derive from events
                pass

        # Derive summary for unclosed run
        events = load_events(jsonl_file)
        if not events:
            # File exists but is empty
            h = hashlib.sha256()
            with open(jsonl_file, "rb") as f:
                while chunk := f.read(65536):
                    h.update(chunk)
            mtime = datetime.fromtimestamp(jsonl_file.stat().st_mtime, tz=timezone.utc).isoformat()
            summaries.append({
                "session_id": session_id,
                "game_id": "unknown",
                "started_at": mtime,
                "ended_at": mtime,
                "steps": 0,
                "final_score": None,
                "invalid_moves": 0,
                "fallbacks": 0,
                "average_laya_latency_ms": 0.0,
                "laya_call_count": 0,
                "completion_status": "empty",
                "qualifying_score": None,
                "verified": None,
                "event_count": 0,
                "sha256": h.hexdigest(),
            })
            continue

        first_event = events[0]
        last_event = events[-1]
        game_id = first_event.get("game_id", "unknown")
        started_at = first_event.get("ts", "")
        ended_at = last_event.get("ts", "")

        total_latencies = []
        laya_calls_count = 0
        invalid_moves = 0
        fallbacks = 0

        for ev in events:
            val = ev.get("validator", {})
            retries = val.get("retries", 0)
            if retries > 0:
                invalid_moves += retries
            if val.get("fallback") is True:
                fallbacks += 1

            for call in ev.get("laya_calls", []):
                laya_calls_count += 1
                lat = call.get("latency_ms")
                if isinstance(lat, (int, float)):
                    total_latencies.append(lat)

        avg_lat = sum(total_latencies) / len(total_latencies) if total_latencies else 0.0

        # Score extraction
        final_score = None
        game_resp = last_event.get("game_response", {})
        if game_resp.get("score_after") is not None:
            final_score = game_resp.get("score_after")
        elif last_event.get("state", {}).get("score") is not None:
            final_score = last_event.get("state", {}).get("score")

        done = game_resp.get("done", False) or last_event.get("state", {}).get("done", False)
        completion_status = "completed" if done else "interrupted"

        # Compute sha256
        h = hashlib.sha256()
        with open(jsonl_file, "rb") as f:
            while chunk := f.read(65536):
                h.update(chunk)

        summaries.append({
            "session_id": session_id,
            "game_id": game_id,
            "started_at": started_at,
            "ended_at": ended_at,
            "steps": len(events),
            "final_score": final_score,
            "invalid_moves": invalid_moves,
            "fallbacks": fallbacks,
            "average_laya_latency_ms": round(avg_lat, 2),
            "laya_call_count": laya_calls_count,
            "completion_status": completion_status,
            "qualifying_score": None,
            "verified": None,
            "event_count": len(events),
            "sha256": h.hexdigest(),
        })

    # Sort newest first
    summaries.sort(key=lambda s: s.get("started_at", ""), reverse=True)
    return summaries
