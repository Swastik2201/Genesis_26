# Beat the Bot HTTP API Contract (v1)

This document defines the canonical HTTP REST and Server-Sent Events (SSE) contract implemented by Member D in `server/` and consumed by Member C in `web/`.

## Base Principles
- All endpoints return standard JSON responses unless noted (e.g., SSE stream, file download).
- Errors return standard HTTP status codes (`400`, `404`, `500`, `501`) with a JSON body:
  ```json
  {
    "error": {
      "code": "SESSION_NOT_FOUND",
      "message": "Session '20261012-101500-dead' was not found in logs directory"
    }
  }
  ```
- The server is strictly read-only with respect to bot execution: it tails and parses log files and never imports the game loop or executes bot decisions.

---

## Endpoints

### 1. `GET /api/health`
Checks backend service health, log repository status, and freshness of the latest recorded event.

**Response `200 OK`**:
```json
{
  "status": "healthy",
  "uptime_seconds": 142.5,
  "logs_directory": "logs/runs",
  "runs_count": 3,
  "latest_session_id": "20261012-101500-ab12",
  "last_event_ts": "2026-10-12T10:15:32.100Z",
  "seconds_since_last_event": 4.2,
  "bot_active": true
}
```

---

### 2. `GET /api/runs`
Lists all known sessions and summaries found in `logs/runs/`. For unclosed runs without a summary file, summary metrics are computed from available events.

**Response `200 OK`**:
```json
{
  "runs": [
    {
      "session_id": "20261012-101500-ab12",
      "game_id": "mock-v1",
      "started_at": "2026-10-12T10:15:00.000Z",
      "ended_at": "2026-10-12T10:15:35.000Z",
      "steps": 25,
      "final_score": 1420,
      "invalid_moves": 0,
      "fallbacks": 0,
      "average_laya_latency_ms": 32.4,
      "laya_call_count": 25,
      "completion_status": "completed",
      "qualifying_score": null,
      "verified": null,
      "event_count": 25,
      "sha256": "4b9e25d8863f6a25b180746e01a1d1d8ef35b6df926c89178adad319de8d98e1"
    }
  ]
}
```

---

### 3. `GET /api/runs/{id}/events?from=0&limit=100`
Retrieves a paginated list of immutable events for a session, ordered by step.

**Query Parameters:**
- `from` (integer, default `0`): Starting step index.
- `limit` (integer, default `100`, max `500`): Maximum events per page.

**Response `200 OK`**:
```json
{
  "session_id": "20261012-101500-ab12",
  "from": 0,
  "limit": 100,
  "total_events": 25,
  "events": [
    {
      "schema": 1,
      "session_id": "20261012-101500-ab12",
      "game_id": "mock-v1",
      "ts": "2026-10-12T10:15:01.120Z",
      "step": 0,
      "state": {
        "game_id": "mock-v1",
        "session_id": "20261012-101500-ab12",
        "step": 0,
        "state_text": "Lane 1 has approaching obstacle 3 tiles away. Lane 2 is completely clear. Speed is normal.",
        "facts": {
          "lane_1_obstacle_dist": 3,
          "lane_2_clear": true,
          "speed": 1
        },
        "legal_actions": [
          { "id": "move_left", "label": "Move Left" },
          { "id": "stay", "label": "Stay in Current Lane" },
          { "id": "move_right", "label": "Move Right" }
        ],
        "score": 0,
        "done": false
      },
      "laya_calls": [
        {
          "question_set": "perception_direct_v1",
          "questions": [
            {
              "type": "multiple_choice",
              "text": "Which lane is safest to occupy?",
              "options": ["Lane 1", "Lane 2", "Lane 3"]
            }
          ],
          "raw": { "best_choice": "Lane 2", "prob": 0.88 },
          "action_scores": {
            "move_left": 0.05,
            "stay": 0.07,
            "move_right": 0.88
          },
          "chosen_action": "move_right",
          "latency_ms": 34.2,
          "accepted": true
        }
      ],
      "validator": {
        "retries": 0,
        "fallback": false,
        "rejections": []
      },
      "final_action": "move_right",
      "game_response": {
        "good": true,
        "score_before": 0,
        "score_after": 10,
        "done": false,
        "message": "Moved safely to lane 2"
      },
      "outcome": "Score +10, avoided obstacle in lane 1"
    }
  ]
}
```

---

### 4. `GET /api/runs/{id}/events/{step}`
Fetches the exact recorded event at the specified step without transformation.

**Response `200 OK`**:
```json
{
  "source_file": "logs/runs/20261012-101500-ab12.jsonl",
  "line_number": 1,
  "event": {
    "schema": 1,
    "session_id": "20261012-101500-ab12",
    "game_id": "mock-v1",
    "ts": "2026-10-12T10:15:01.120Z",
    "step": 0,
    "state": { "...": "..." },
    "laya_calls": [ "... "],
    "validator": { "retries": 0, "fallback": false, "rejections": [] },
    "final_action": "move_right",
    "game_response": { "good": true, "score_before": 0, "score_after": 10, "done": false, "message": "Moved safely" },
    "outcome": "Score +10"
  }
}
```

---

### 5. `GET /api/runs/{id}/verify`
Audits the raw `.jsonl` log file against tampering, validates SHA-256 with the summary file, and verifies decision traceability.

**Response `200 OK`**:
```json
{
  "session_id": "20261012-101500-ab12",
  "sha256": "4b9e25d8863f6a25b180746e01a1d1d8ef35b6df926c89178adad319de8d98e1",
  "summary_sha256": "4b9e25d8863f6a25b180746e01a1d1d8ef35b6df926c89178adad319de8d98e1",
  "hash_matches_summary": true,
  "event_count": 25,
  "laya_call_count": 25,
  "steps_contiguous": true,
  "every_move_logged": true,
  "audit_passed": true
}
```

---

### 6. `GET /api/stream?session_id=latest`
Server-Sent Events (SSE) live stream for real-time dashboard viewers.
- Supports `session_id=latest` to follow the most recently active run.
- Automatically sends initial backlog of events on connection.
- Supports `Last-Event-ID` header for seamless browser reconnect without event loss or duplication.
- Emits a comment `: keep-alive\n\n` every 15 seconds during idle periods.

**SSE Event Wire Format**:
```
id: 0
event: step
data: {"schema":1,"session_id":"20261012-101500-ab12","step":0,...}

id: 1
event: step
data: {"schema":1,"session_id":"20261012-101500-ab12","step":1,...}
```

---

### 7. `GET /api/runs/{id}/autopsy`
Returns the Decision Autopsy items for all steps in the session (USP 1), evaluating predictions against outcomes.

**Response `200 OK`**:
```json
{
  "session_id": "20261012-101500-ab12",
  "summary": {
    "total_steps": 25,
    "as_predicted": 23,
    "confident_miss": 1,
    "uncertain_miss": 1,
    "lucky_hit": 0,
    "illegal_move": 0,
    "game_over": 1
  },
  "items": [
    {
      "step": 24,
      "verdict": "confident_miss",
      "expected": "Safe lane transition based on 88% confidence",
      "actual": "Collision occurred, game ended",
      "note": "Laya was 88% sure lane 2 was open; obstacle collision recorded. Hypothesis: question failed to evaluate high-speed moving obstacles 2 steps ahead.",
      "severity": 0.85,
      "question_id": "safest_lane_eval",
      "probabilities": { "move_right": 0.88, "stay": 0.07, "move_left": 0.05 }
    }
  ]
}
```

---

### 8. `GET /api/runs/{id}/calibration` & `GET /api/calibration`
Calculates Confidence Reality Check calibration statistics (ECE, reliability bins, coverage thresholds).
- If `bot.calibration` module is not yet implemented by Member B, returns `501 Not Implemented` with:
  ```json
  {
    "error": {
      "code": "CALIBRATION_NOT_AVAILABLE",
      "message": "Calibration engine (Lane B) is not yet implemented"
    }
  }
  ```
- When available:
```json
{
  "n": 100,
  "accuracy": 0.82,
  "ece": 0.064,
  "bins": [
    { "lo": 0.0, "hi": 0.2, "n": 5, "mean_confidence": 0.15, "accuracy": 0.20 },
    { "lo": 0.8, "hi": 1.0, "n": 60, "mean_confidence": 0.89, "accuracy": 0.85 }
  ],
  "thresholds": [
    { "threshold": 0.7, "coverage": 0.85, "accuracy": 0.89 }
  ],
  "recommended_threshold": 0.75
}
```

---

### 9. `GET /api/lab`
Retrieves comparative Question Lab experiment results stored in `experiments/results/`.

**Response `200 OK`**:
```json
{
  "experiments": [
    {
      "name": "mock_game_perception_vs_direct",
      "created_at": "2026-10-12T12:00:00Z",
      "adapter": "mock-v1",
      "variants": [
        {
          "question_set": "perception_first_v1",
          "games": 10,
          "avg_score": 1250.0,
          "best_score": 1600.0,
          "invalid_rate": 0.0,
          "avg_latency_ms": 31.5,
          "completion_rate": 0.8,
          "avg_confidence": 0.84,
          "session_ids": ["20261012-101500-ab12"]
        }
      ]
    }
  ]
}
```

---

### 10. `GET /api/logs/{id}/download`
Downloads the raw `.jsonl` audit file for local verification.

**Headers:**
- `Content-Type: application/x-jsonlines`
- `Content-Disposition: attachment; filename="{id}.jsonl"`

---

### 11. `GET /` and Static Assets
Serves static dashboard web assets from `web/` (`index.html`, `style.css`, `app.js`).
