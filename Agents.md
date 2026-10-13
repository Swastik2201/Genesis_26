# AGENTS.md — Beat the Bot: Teach Laya to Play

## 1. Project goal

Build a modular decision layer for hosted games revealed on hackathon day. The project does not build the hosted games. It reads state and legal actions from a game's agent API, asks **Laya** typed questions, converts Laya's probabilities into a legal action, submits that action, and records enough evidence for a live viewer and post-run analysis.

The application must support these stages:

1. Hosted game API: read state and legal actions.
2. State normaliser: produce a compact, plain-English state plus structured facts.
3. Laya decision engine: make one visible, logged Laya call per decision step.
4. Action validator: ensure the action is legal; if the game rejects it, exclude it and ask Laya again.
5. Submit move: send the selected action and receive the next state.

**Do not assume the real game, URL, API shape, action names, scoring, or qualifying score before hackathon day.** Build and test against the deterministic local mock game first. On game day, implement a new adapter and normaliser without rewriting the engine, logger, server, or frontend.

## 2. Non-negotiable rules

- Laya is the only model allowed to choose moves. No other model, chatbot, heuristic policy, random action, hard-coded move, browser extension, or browser automation may select a move.
- Every submitted move must trace to a recorded Laya call. The only permitted fallback is the highest-scoring still-legal action from Laya's most recent recorded scores after retries are exhausted. Log that fallback explicitly.
- Code may transform Laya's answers into scores over legal actions; code must not independently invent a strategic move.
- Never fabricate scores, probabilities, latency, session IDs, verified status, or game outcomes. Missing values stay `null` / “unknown”.
- A dry run may inspect state and call Laya but must not submit a move.
- The real game is unknown until the organiser reveals it. Use adapter interfaces and the local mock game now.
- Never log credentials, API keys, cookies, auth headers, or secrets.
- The dashboard's mock/demo data must be visibly labelled as demo data. Never present it as a real or verified run.

## 3. Team lanes and file ownership

Each member works on their own branch. Ownership is by path, not by personal preference. **Do not edit a file owned by another member to “quickly fix” it.** Open an issue or send the owner a concise request instead.

### Member A — Game Integration
Branch: `feat/game-integration`

Owns:
- `bot/adapters/`
- `bot/normaliser.py`
- `bot/validator.py`
- `bot/loop.py`
- `bot/config.py`
- `mock_game/`
- `tests/lane_a/`
- `requirements/a.txt`

Delivers adapter interface/registry, mock game, normaliser, validator/retry logic, game loop, CLI and the game-day adapter.

### Member B — Laya Engine and Experiments
Branch: `feat/laya-engine`

Owns:
- `bot/laya/`
- `bot/questions/`
- `bot/calibration.py`
- `experiments/`
- `tests/lane_b/`
- `requirements/b.txt`

Delivers Laya loading/inference, question-set registry, Question Lab experiments and Confidence Reality Check.

### Member C — Frontend
Branch: `feat/frontend`

Owns:
- `web/` only

Delivers landing page, responsive gamer-style dashboard, live decision viewer, autopsy/replay/lab/calibration/log panels, and clearly labelled demo mode. Use static HTML, CSS and vanilla JS; no build step unless the team explicitly changes this decision together.

### Member D — Contracts, Logger, Server and Docs
Branch: `feat/server-logs`

Owns:
- `contracts/`
- `server/`
- `bot/logger.py`
- `bot/autopsy.py`
- `logs/`
- `docs/`
- `scripts/`
- `.github/`
- `lanes.json`
- `README.md`
- `AGENTS.md`
- `STEPS.md`
- `team/`
- `requirements.txt`
- `requirements/d.txt`
- `tests/lane_d/`

D publishes the first contracts before the other members implement against them. D is merge coordinator, not an owner of other members' code.

### Shared/forbidden paths

- No one except D edits contracts after `contracts-v1` without announcing a versioned change.
- No one except C edits `web/`.
- No one except A edits the adapter, normaliser, validator or game-loop paths.
- No one except B edits the Laya engine, question sets, experiments or calibration paths.
- Generated runtime logs belong in `logs/runs/`; do not commit them. Selected evidence logs may be copied to `logs/best/` by the approved script.
- Do not add dependencies to the root requirements file directly. Add them to the lane-specific requirements file and ask D to update the root aggregator if necessary.

## 4. Git and merge protocol

1. D creates the skeleton, schemas, examples, `lanes.json`, and lane checker first. D merges this as `contracts-v1`.
2. A, B and C then rebase on `main` and implement only their lane.
3. Merge order after contracts: A, then B, then C. D handles integration fixes only in D-owned files.
4. Before every PR, run the lane checker and your own tests. Include the exact commands and output in the PR description.
5. Small commits, one purpose per commit. Do not force-push shared branches.
6. Never have two people editing the same file. If a file must change across lanes, its owner makes the edit after receiving a request.
7. Contract changes require: schema change, example update, tests, a short announcement listing affected lanes, and a version bump if the shape is incompatible.
8. Suggested rebase command after `main` changes:
   `git fetch origin && git checkout <your-branch> && git rebase origin/main`
9. Before a merge, resolve conflicts locally and inspect the result. Do not accept “ours” or “theirs” blindly.

## 5. Contracts (version 1)

The canonical schemas live in `contracts/*.schema.json`. The examples under `contracts/examples/` are the source of truth for valid v1 examples. Implementations must follow those files exactly. The definitions below are the human-readable agreement; if a mismatch is found, D updates the schema and announces it before others proceed.

### 5.1 State object

Required fields:
- `game_id`: string
- `session_id`: string
- `step`: integer, zero or greater
- `state_text`: string; compact plain-English summary for Laya
- `facts`: object containing structured facts from the raw game state
- `legal_actions`: array of objects, each with `id`, `label`, and optional `hint`
- `score`: number or null
- `done`: boolean

`state_text` should lead with the most decision-relevant facts, use plain language, avoid dumping JSON, and normally stay under about 120 words. Structured numeric comparisons are computed in code before describing the conclusion in words.

### 5.2 Decision object

A decision returned by the engine contains:
- `chosen_action`: string action ID
- `action_scores`: object mapping legal action IDs to probabilities/scores that sum to 1 within floating-point tolerance
- `questions`: the exact typed questions passed to Laya
- `question_set`: string ID
- `latency_ms`: non-negative number
- `reason`: one short, human-readable sentence explaining how answers were mapped
- `raw`: unmodified Laya result for audit/debugging

The engine must never return an action outside the legal, non-excluded action set. Ties are resolved by the stable order of `legal_actions`, and that policy is documented.

### 5.3 Event object

One JSON object per decision step; one JSON object per line in the `.jsonl` file. Required fields:
- `schema`: integer `1`
- `session_id`: string
- `game_id`: string
- `ts`: UTC ISO-8601 timestamp
- `step`: integer, zero or greater
- `state`: State object
- `laya_calls`: non-empty array for a submitted step; each item contains the exact question set/questions, raw Laya output, action scores, chosen action, latency, and whether the call was accepted or excluded
- `validator`: object containing `retries`, `fallback`, and any rejection messages
- `final_action`: string or null for dry-run/interrupted steps
- `game_response`: object containing `good` (boolean or null), `score_before` (number or null), `score_after` (number or null), `done` (boolean), and `message` (string or null)
- `outcome`: string or null

The event must preserve the information required to audit the action. Never rewrite a stored event during replay. Any additional fields must be documented and validated by the schema.

### 5.4 Run summary

Stored separately as `<session_id>.summary.json`; never append a summary object to the event-only `.jsonl` file. Include:
- `session_id`, `game_id`, `started_at`, `ended_at`
- `steps`, `final_score`, `invalid_moves`, `fallbacks`
- `average_laya_latency_ms`, `laya_call_count`
- `completion_status`, `qualifying_score`, `verified` (unknown unless the game/provider confirms it)
- `event_count`, `sha256`

`verified` must not be inferred merely because the local script completed. Qualifying score is game-specific and must remain null until the organiser provides it.

### 5.5 Logging rules

- Append exactly one event per line to `logs/runs/<session_id>.jsonl`.
- Flush and fsync after each event so the server can stream it.
- Use a lock around writes.
- Redact secrets recursively before writing.
- Keep raw Laya outputs and probabilities unmodified where possible; if redaction is necessary, document what was removed.
- Every submitted move must have a matching recorded Laya call in the same step. `check_every_move_logged.py` is the audit tool.

### 5.6 Laya usage principles

- Read Laya's official README/model card and verify actual installed API/output shape; do not guess from an example.
- Load the model once per process, warm it up once, and guard inference with a lock.
- Prefer testing perception-first questions (“Which lane is blocked?”) against a direct-action control (“Which action should we take?”). This is a hypothesis to test, not a guaranteed truth.
- Describe every option in short option lists. Keep state concise and front-loaded.
- Ask multiple typed questions in one `predict` call when supported by the verified API. Preserve the exact question text and result.
- Convert answers into scores only over legal actions; document mapping and tie-breaking.
- The highest probability is not automatically a calibrated probability of success. The calibration panel must show sample counts and uncertainty.

### 5.7 HTTP API contract

D implements these endpoints; C consumes them. Return JSON errors with clear messages.

- `GET /api/health` — service status, log availability, last-event freshness.
- `GET /api/runs` — available sessions and summaries.
- `GET /api/runs/{id}/events?from=0&limit=100` — ordered event page.
- `GET /api/runs/{id}/events/{step}` — exact event at a step, unchanged.
- `GET /api/runs/{id}/verify` — event file SHA-256, summary hash match, event count, Laya call count.
- `GET /api/stream?session_id=latest` — Server-Sent Events stream; send existing events then follow appended lines; support `Last-Event-ID` reconnect semantics.
- `GET /api/runs/{id}/autopsy` — autopsy items plus enough event detail for inspection.
- `GET /api/runs/{id}/calibration` — calibration for one run; return 501 with a clear message if not yet available.
- `GET /api/calibration` — aggregate calibration if supported.
- `GET /api/lab` — validated Question Lab result files.
- `GET /api/logs/{id}/download` — download original `.jsonl`.
- `GET /` and static assets — serve the contents of `web/`.

Unknown session IDs return 404. The server reads log/result files and must not import or call the bot loop.

### 5.8 USP result shapes

**Autopsy item:** `step`, `verdict`, `expected`, `actual`, `note`, `severity`, `question_id`, `probabilities`. Verdict values: `as_predicted`, `confident_miss`, `uncertain_miss`, `lucky_hit`, `illegal_move`, `game_over`.

**Question Lab result:** `name`, `created_at`, `adapter`, `variants` array. Each variant has `question_set`, `games`, `avg_score`, `best_score`, `invalid_rate`, `avg_latency_ms`, `completion_rate`, `avg_confidence`, and `session_ids`.

**Calibration result:** `n`, `accuracy`, `ece`, `bins` (each has `lo`, `hi`, `n`, `mean_confidence`, `accuracy`), `thresholds` (each has `threshold`, `coverage`, `accuracy`), and optional `by_question_type` and `recommended_threshold`.

## 6. Frontend requirements

- Landing page and dashboard with a persistent left navigation on desktop.
- Tabs: Overview, Live Run, Decision Autopsy, Question Lab, Replay, Calibration, Logs, About.
- Gamer HUD visual language: dark panels, restrained neon cyan/magenta, green for good, amber for uncertainty/illegal, red for bad. Keep body text readable and effects secondary to data.
- Live Run must show state → exact Laya questions → probabilities → selected action → validator/game response.
- All demo values must be labelled `DEMO`; do not imply mock scores are verified.
- If the server is unavailable, show an explicit demo ribbon and a retry/error state rather than a blank screen.
- Respect `prefers-reduced-motion`, keyboard navigation, visible focus, and responsive widths.

## 7. Required USPs

1. **Decision Autopsy:** compare what Laya predicted with what actually happened; frame inferred explanations as hypotheses.
2. **Question Lab:** compare question formulations on comparable states/seeds and report actual measured metrics.
3. **Reproducible Run Replay:** inspect the exact recorded event and session ID; verify file hash and prove move-to-call traceability.
4. **Confidence Reality Check:** compare confidence with outcomes, show sample count, accuracy and ECE; warn on small samples.

Do not claim any USP is statistically conclusive until there is sufficient real data.

## 8. Definition of done

- A complete local mock game can be played end-to-end.
- Each submitted move has a logged Laya call.
- A live viewer can display incoming events; demo mode works without the server.
- Raw events are replayable and hash-verifiable.
- All lane tests pass; no secrets are committed.
- The real adapter is implemented only after the game API is revealed.
- README explains setup, architecture, limitations, how to reproduce a run, and how to identify demo vs real evidence.

