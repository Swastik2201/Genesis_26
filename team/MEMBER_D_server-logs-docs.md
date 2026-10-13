<!-- Team execution guardrails: read AGENTS.md and STEPS.md before using these prompts.
Use only your assigned branch and owned paths. Run one prompt at a time, inspect git diff,
test, and commit before moving to the next prompt. If a task requires a file outside your
lane, stop and ask its owner; do not create a duplicate or edit around the ownership rule.
The real hosted game and its API are unknown until hackathon day: use the mock game and
fixtures until the organiser provides official details. Never invent API fields or scores.
-->
# MEMBER D — Contracts, Logger, Server, Autopsy, Docs (backbone and glue)

Read `AGENTS.md` and `STEPS.md` first. Paste the prompts below into Antigravity one at a time, in order. **Prompt 1 is urgent: A, B and C are waiting for your contracts.**

## Your lane

- **You own:** `contracts/`, `server/`, `bot/logger.py`, `bot/autopsy.py`, `logs/`, `docs/`, `scripts/`, `.github/`, `lanes.json`, `README.md`, `AGENTS.md`, `STEPS.md`, `team/`, `requirements.txt`, `requirements/d.txt`, `tests/lane_d/`
- **You never touch:** `bot/adapters/`, `bot/normaliser.py`, `bot/validator.py`, `bot/loop.py`, `bot/laya/`, `bot/questions/`, `bot/calibration.py`, `experiments/`, `mock_game/`, `web/`
- **Branch:** `feat/server-logs`
- **You deliver:** the contracts (first), `RunLogger`, the FastAPI server (live stream and REST), the Decision Autopsy analyser (USP 1), the replay/event store (USP 3), best-runs export, the README and the write-up
- **Your notes file:** `docs/notes-d.md`
- **Special duty:** you are the merge referee. Merge order into `main` is D, A, B, C. You tag `contracts-v1` and `slice-v1`.

## Checklist

- [ ] Prompt 1: skeleton, contracts, lane checker (push to `main` within 30 minutes, tag `contracts-v1`)
- [ ] Prompt 2: logger
- [ ] Prompt 3: FastAPI server with live stream, serving `web/`
- [ ] Prompt 4: Decision Autopsy (USP 1)
- [ ] Prompt 5: replay store, best runs export, log tools (USP 3)
- [ ] Prompt 6: README, write-up, repo hygiene, final submission checks
- [ ] `python scripts/check_lane.py d` passes before every PR

---

## Prompt 1 — Skeleton, contracts and the lane checker (do this first)

```text
You are Member D (Contracts, Logger, Server, Docs) on the "Beat the Bot" hackathon project: a modular Python bot where the Laya decision model makes every move in hosted online games, with a live dashboard. Three teammates are blocked until I push contracts, so this is urgent. Before writing code, read AGENTS.md, STEPS.md and team/MEMBER_D_server-logs-docs.md completely.

STRICT LANE RULES: I own contracts/, server/, bot/logger.py, bot/autopsy.py, logs/, docs/, scripts/, .github/, lanes.json, README.md, AGENTS.md, STEPS.md, team/, requirements.txt, requirements/d.txt and tests/lane_d/. Do not edit any other file except for creating EMPTY placeholders listed below. Work on branch feat/server-logs.

TASK:
1. Skeleton (empty placeholders only, so teammates never fight over creating folders): bot/__init__.py, bot/adapters/__init__.py, bot/laya/__init__.py, bot/questions/__init__.py, mock_game/.gitkeep, experiments/.gitkeep, web/.gitkeep, tests/lane_a/.gitkeep, tests/lane_b/.gitkeep, tests/lane_d/.gitkeep, requirements/a.txt, requirements/b.txt (empty files with a comment), requirements/d.txt (fastapi, uvicorn, jsonschema, pytest), requirements.txt containing "-r requirements/a.txt", "-r requirements/b.txt", "-r requirements/d.txt", logs/runs/.gitkeep, logs/best/.gitkeep.
2. .gitignore: virtual environments, __pycache__, .pytest_cache, model caches (.cache, huggingface), .env files, logs/runs/* (but keep logs/best/ and .gitkeep files), node_modules.
3. contracts/: write JSON Schemas (draft 2020-12) exactly matching the draft in AGENTS.md section 5: state.schema.json, decision.schema.json, event.schema.json (schema version 1), lab_result.schema.json, calibration_result.schema.json, autopsy_item.schema.json; plus contracts/api.md documenting every endpoint in AGENTS.md section 5.7 with example responses; plus contracts/examples/ with one valid example for each schema. Add tests/lane_d/test_contracts.py that validates the examples against the schemas.
4. lanes.json mapping each lane (a, b, c, d) to its allowed path prefixes exactly as in AGENTS.md section 3, and scripts/check_lane.py <lane> which runs git diff --name-only against origin/main...HEAD (plus uncommitted changes) and exits non-zero listing any file outside that lane's allowed paths.
5. .github/CODEOWNERS with placeholder handles (@member-a, @member-b, @member-c, @member-d) mapped to each lane's folders, and .github/pull_request_template.md with a checklist: lane check passed, tests pass, contracts unchanged, NOTES.md updated.
6. Commit in small commits, then give me the exact git commands to merge to main, tag contracts-v1 and tell teammates to rebase.
```

## Prompt 2 — RunLogger

```text
Continue as Member D on "Beat the Bot". Stay strictly inside my lane. Re-read AGENTS.md sections 5.3 and 5.4 and contracts/event.schema.json.

TASK: write bot/logger.py.
1. class RunLogger(game_id, logs_dir="logs/runs", validate=True): creates a unique session_id like 20261012-101500-ab12 (UTC timestamp plus 4 random hex chars), opens logs/runs/<session_id>.jsonl in append mode, and exposes .session_id.
2. event(event: dict): fills schema, session_id, game_id and ts (UTC ISO with milliseconds) if missing; validates against contracts/event.schema.json (if validate is True; on invalid input raise a clear error naming the failing field; do not swallow it); appends exactly one JSON line; flushes and fsyncs so a tailing server sees it immediately. Thread-safe with a lock.
3. close(summary: dict): writes logs/runs/<session_id>.summary.json containing the summary plus session_id, game_id, started_at, ended_at, event_count, laya_call_count and a sha256 of the .jsonl so a log can be shown to be untampered. Also append a final line to the .jsonl? NO: keep the .jsonl pure events only.
4. Helpers: load_events(path) -> list[dict], latest_session(logs_dir) -> session_id | None, list_sessions(logs_dir) -> list of summary dicts (works for runs that never closed: derive step count and score from the events).
5. Never log secrets: add a redact(event) step that removes keys named like api_key, token, authorization, password, secret from any nested dict before writing.
6. Tests in tests/lane_d/: valid events are written one per line; an invalid event raises; redaction works; two threads writing do not interleave; list_sessions handles an unclosed run.
Commit on feat/server-logs.
```

## Prompt 3 — FastAPI server with live stream

```text
Continue as Member D on "Beat the Bot". Stay strictly inside my lane. Re-read AGENTS.md section 5.7 and contracts/api.md.

TASK: build server/ (a FastAPI app, run with python -m server or uvicorn server.app:app --port 8000).
1. server/app.py with the endpoints from AGENTS.md section 5.7: /api/health, /api/runs, /api/runs/{id}/events (from, limit), /api/runs/{id}/events/{step}, /api/stream, /api/runs/{id}/autopsy, /api/runs/{id}/calibration, /api/calibration, /api/lab, /api/logs/{id}/download. Use bot.logger helpers to read logs. Return clean JSON errors with proper status codes (404 for unknown sessions).
2. /api/stream is Server-Sent Events: session_id=latest follows the newest .jsonl; send every existing event first (support Last-Event-ID so the browser can reconnect without duplicates), then tail the file and push each new line within about 100 ms. Send a keep-alive comment every 15 seconds. The server must NOT import or call the bot: it only reads log files, so the bot and the server run as separate processes.
3. Mount web/ as static files at / (index.html at the root). Enable CORS for local origins so the dashboard also works from a different port.
4. /api/lab reads every JSON file in experiments/results/ that matches the lab result shape (skip files that do not validate) and returns them newest first; /api/calibration and /api/runs/{id}/calibration call bot.calibration.compute(events) if that module exists, otherwise return a 501 with a clear message (Member B owns that module).
5. /api/health reports whether logs exist and whether the bot has written an event in the last 10 seconds.
6. server/__main__.py so python -m server works, with --port and --logs-dir flags. Bind to 127.0.0.1 by default.
7. Tests in tests/lane_d/ using FastAPI TestClient: list runs, fetch events, 404s, SSE sends existing events.
8. A tiny server/demo_feeder.py that writes a fake run to logs/runs/ at one event per second using contracts/examples, so Member C can see live streaming before the bot exists (clearly named as a demo tool, never used for real runs).
Commit on feat/server-logs.
```

## Prompt 4 — Decision Autopsy (USP 1)

```text
Continue as Member D on "Beat the Bot". Stay strictly inside my lane. Build bot/autopsy.py: "turn every failed move into an investigation".

1. analyse(events: list[dict]) -> list[dict], one item per step in EXACTLY the autopsy item shape from AGENTS.md section 5.8 (step, verdict, expected, actual, note) plus extra keys: severity (0 to 1), question_id (the question whose answer mattered most), and probabilities (the chosen action's probability).
2. Verdict rules (document them at the top of the file and in docs/autopsy.md):
   - illegal_move: the game rejected an attempt (a laya_call with legal false, or validator.retries > 0 caused by a game rejection).
   - game_over: the move ended the game.
   - confident_miss: chosen action probability >= 0.7 and game_response.good is False.
   - uncertain_miss: probability < 0.7 and good is False.
   - lucky_hit: probability < 0.5 and good is True.
   - as_predicted: everything else with a known outcome.
3. Each note is one or two plain sentences generated from the event (no model calls, no invented facts): what Laya was asked, what it believed (with percentages), what the game did, and what that reveals ("Laya was 86% sure the left lane was free; the game reported a collision, so the 'lane is free' question may be misreading obstacles two steps ahead"). Build such hints from rules on the question types and confidence, and make clear they are hypotheses.
4. worst(items, k=5) returns the k highest-severity cases. summary(items) returns counts per verdict.
5. CLI: python -m bot.autopsy logs/runs/<session>.jsonl prints a readable report; --json writes it to a file. Wire it into server /api/runs/{id}/autopsy (my own server file).
6. Tests with synthetic events for every verdict.
7. Write docs/autopsy.md explaining the verdicts so judges can read the method.
Commit on feat/server-logs.
```

## Prompt 5 — Replay store, best runs and log tools (USP 3)

```text
Continue as Member D on "Beat the Bot". Stay strictly inside my lane. Make runs reproducible and inspectable.

1. server: make GET /api/runs/{id}/events/{step} return the exact recorded event, unmodified, with the file name and line number it came from, so a judge can verify it in the raw .jsonl. Add GET /api/runs/{id}/verify returning the sha256 of the .jsonl and whether it matches the summary file (tamper check), the event count and the Laya call count.
2. scripts/best_runs.py: scan logs/runs/*.summary.json, rank sessions per game by final score, mark which ones meet a qualifying score passed with --min-score, copy the top N .jsonl and .summary.json files into logs/best/, and write docs/best_runs.md with a table: game, session id, final score, steps, Laya calls, completion status, sha256, link to the log file. Never edit or delete anything in logs/runs/.
3. scripts/log_stats.py: print per-session stats (steps, Laya calls, mean and p95 latency, invalid moves, fallbacks) so we can quote exact numbers in the write-up.
4. scripts/check_every_move_logged.py: for a session, assert that every step has at least one laya_call, that final_action equals a chosen_action from a laya_call (or the documented fallback from Laya's last scores), and that step numbers are contiguous. Exit non-zero with a clear message on failure. This is our evidence for the rule "every move comes from a logged Laya call".
5. Tests for each script using synthetic logs.
6. Update contracts/api.md for the new endpoints and note it in docs/notes-d.md (a contract addition must be announced to everyone: write the announcement text for the group chat).
Commit on feat/server-logs.
```

## Prompt 6 — README, write-up and final submission

```text
Continue as Member D on "Beat the Bot". Stay strictly inside my lane. Prepare the submission.

1. README.md (public GitHub repo): title and one-paragraph pitch; screenshots section (placeholders to fill); the problem statement summarised; architecture with the five-stage pipeline and a Mermaid diagram; our four USPs (Decision Autopsy, Question Lab, Reproducible Run Replay, Confidence Reality Check) with a sentence each; install and run instructions (Python 3.10+, pip install -r requirements.txt, how to set environment variables for a game, python -m bot.loop ..., python -m server, open http://127.0.0.1:8000); how to run on Colab if we used it; how to reproduce a best run; the rules we followed (every move from a logged Laya call, no other model, no browser automation); the repo layout; team lanes; credits and licences: Laya by Nandakishor M (Convai Innovations, Apache-2.0), laya-playground and brainfunctioncollapse.com/laya by brain function collapse (MIT) as the inspiration for the state-questions-probabilities view.
2. docs/writeup.md: a short write-up with these sections, filled from the lane notes (bot/adapters/NOTES.md, experiments/NOTES.md, web/NOTES.md, docs/notes-d.md): (a) What we asked Laya and why (question types, wording, perception-first), (b) What failed (concrete examples with before and after numbers), (c) What we changed after it failed, (d) What the Question Lab and calibration showed, (e) What we would do next. Keep it under two pages. Do not invent numbers: leave clear [TODO: number] markers where data is missing and list them for me.
3. docs/best_runs.md via scripts/best_runs.py once real runs exist; leave the instructions to regenerate it.
4. Final checks script scripts/final_check.py: README exists, logs/best has at least one .jsonl, every best run passes check_every_move_logged, docs/writeup.md has no [TODO markers left, no secrets in the repo (scan for api_key patterns), requirements.txt installs cleanly in a fresh venv (print the command, do not run it silently).
5. Print a submission checklist: public repo URL, README, write-up, decision log, session IDs, live viewer instructions.
Commit on feat/server-logs.
```

## Before every PR

```text
Run python scripts/check_lane.py d, then pytest tests/lane_d. List every file I changed and confirm each is inside my lane. If I changed a contract, write the exact announcement for the group chat and list which lanes must rebase. Draft the PR description. Do not edit files outside my lane to make checks pass.
```

## Merge referee cheat sheet

```text
Order: D -> A -> B -> C.
After each merge to main, everyone else runs:
  git fetch origin && git checkout <their-branch> && git pull --rebase origin main
Tags: contracts-v1 (after Prompt 1 is merged), slice-v1 (after the mock game runs end to end with the dashboard).
If two lanes touch the same file, someone left their lane: revert the stray edit, and ask the file's owner to make it.
```

---

## Extra implementation requirements (apply to every prompt)

### Contracts are the integration boundary
- Publish schemas and examples before teammates implement against them. Validate every example with automated tests.
- The JSON Schemas, example fixtures and `contracts/api.md` must agree. Do not change one without updating the others and notifying A/B/C.
- Make errors predictable: correct HTTP status, machine-readable error code and human-readable message. Unknown sessions/steps should not return a successful empty response that looks like a real run.
- Keep the server read-only with respect to bot execution: it tails and reads logs/results, but does not import the game loop or trigger moves.

### Audit and evidence integrity
- One JSONL line equals one immutable event. Replay must show the original stored event rather than a reconstructed approximation.
- Use UTC timestamps and a stable session ID. Flush and fsync every event; use a lock for concurrent writes.
- Redact secrets recursively before persistence. Tests must cover nested objects and case-insensitive secret-like keys.
- The hash verification endpoint must calculate the current file hash and compare it with the summary's stored hash. Clearly report missing summary files instead of treating them as verified.
- `verified` and `qualifying_score` remain unknown unless confirmed by the hosted game/provider or official rules. Never infer them from a local score.
- Autopsy explanations are generated from recorded fields and transparent rules only. Label causal explanations as hypotheses, not facts.

### Integration and acceptance gate
- Provide a demo feeder that uses schema-valid sample events and is clearly marked as synthetic.
- Test SSE initial backlog, new appended events, reconnect with `Last-Event-ID`, keep-alive behavior and missing session handling.
- `check_every_move_logged.py` must fail on missing Laya calls, non-contiguous steps, or a final action that cannot be traced to a recorded Laya call/fallback.
- The final write-up must use real measured results only. Keep `[TODO: ...]` markers wherever evidence has not been collected; do not fabricate a successful result to satisfy the final check.

