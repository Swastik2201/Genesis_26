<!-- Team execution guardrails: read AGENTS.md and STEPS.md before using these prompts.
Use only your assigned branch and owned paths. Run one prompt at a time, inspect git diff,
test, and commit before moving to the next prompt. If a task requires a file outside your
lane, stop and ask its owner; do not create a duplicate or edit around the ownership rule.
The real hosted game and its API are unknown until hackathon day: use the mock game and
fixtures until the organiser provides official details. Never invent API fields or scores.
-->
# MEMBER A — Game Integration (backend: stages 1, 2, 4, 5)

Read `AGENTS.md` and `STEPS.md` first. Paste the prompts below into Antigravity one at a time, in order. Finish and commit each before pasting the next.

## Your lane

- **You own:** `bot/adapters/`, `bot/normaliser.py`, `bot/validator.py`, `bot/loop.py`, `bot/config.py`, `mock_game/`, `tests/lane_a/`, `requirements/a.txt`
- **You never touch:** `bot/laya/`, `bot/questions/`, `bot/logger.py`, `server/`, `web/`, `contracts/`
- **Branch:** `feat/game-integration`
- **You depend on:** the contracts (`AGENTS.md` section 5), B's `LayaEngine` (use a stub until it exists), D's `RunLogger` (use a stub until it exists)
- **You deliver:** `get_adapter()`, `run_game()`, the normaliser, the validator, and on game day one adapter for the real game
- **Your notes file:** `bot/adapters/NOTES.md` (log every API surprise and fix)

## Checklist

- [ ] Prompt 1: adapter base class, registry, HTTP client, mock game
- [ ] Prompt 2: normaliser and validator
- [ ] Prompt 3: game loop and CLI
- [ ] Prompt 4: game-day adapter (when the game link arrives)
- [ ] Prompt 5: robustness
- [ ] `python scripts/check_lane.py a` passes before every PR

---

## Prompt 1 — Adapter foundation and mock game

```text
You are Member A (Game Integration) on the "Beat the Bot" hackathon project: a modular Python bot where the Laya decision model makes every move in hosted online games. Before writing code, read AGENTS.md, STEPS.md and team/MEMBER_A_game-integration.md completely.

STRICT LANE RULES: edit ONLY bot/adapters/, bot/normaliser.py, bot/validator.py, bot/loop.py, bot/config.py, mock_game/, tests/lane_a/ and requirements/a.txt. Do not create or edit any other file. If something outside my lane must change, stop and tell me what and why instead of changing it. Work on branch feat/game-integration with small commits.

TASK: build the adapter foundation.
1. bot/adapters/base.py: abstract class GameAdapter with: name (str); start() -> raw state dict (starts or resumes a session); get_state() -> raw state dict; list_actions(raw) -> list of {"id","label","hint"}; submit_move(action_id, params=None) -> raw response dict; judge(prev_raw, response, new_raw) -> bool | None (True if the move was good or harmless, False if it hurt, None if unknown); close().
2. bot/adapters/__init__.py and bot/adapters/registry.py: get_adapter(name, **cfg) backed by a dict, so a new game is one new file plus one registry line.
3. bot/adapters/http_client.py: a thin requests.Session wrapper with timeouts, 3 retries with exponential backoff, and clear error messages. Base URL, API key and session id come from environment variables read in bot/config.py. Never print secrets.
4. mock_game/server.py: a small deterministic local HTTP game (use the standard library http.server so it adds no dependencies) with a lane-runner style: 3 lanes, obstacles that arrive each step, a score that goes up each safe step, and game over on collision. Endpoints: POST /start, GET /state, POST /move. Accept a --seed and an --illegal-rate flag so the server sometimes rejects a move as illegal (needed to test the validator).
5. bot/adapters/mock.py: MockAdapter implementing GameAdapter against that server, with judge() returning False on collision.
6. tests/lane_a/test_mock_adapter.py (pytest): start the mock server on a free port, play 20 moves, assert state and score update.
Put "requests" and "pytest" in requirements/a.txt. Add a short bot/adapters/NOTES.md. Finish with a summary of files created and how to run the tests.
```

## Prompt 2 — State normaliser and action validator

```text
Continue as Member A on "Beat the Bot". Re-read AGENTS.md sections 5.1 and 6 (the Laya usage rules) and stay strictly inside my lane (bot/adapters/, bot/normaliser.py, bot/validator.py, bot/loop.py, bot/config.py, mock_game/, tests/lane_a/, requirements/a.txt).

TASK 1 — bot/normaliser.py:
- Abstract class StateNormaliser with normalise(raw, legal_actions, step, session_id, game_id, score, done) -> dict matching the State contract in AGENTS.md section 5.1 exactly (game_id, session_id, step, state_text, facts, legal_actions, score, done).
- A registry get_normaliser(game_name), plus MockNormaliser for the mock game.
- state_text rules, because Laya reads about 512 tokens and rewards plain language: put the most important facts first; describe positions and danger in words, never raw numbers; compute every comparison or threshold in code and state the conclusion (for example "An obstacle is directly ahead in our lane" or "The left lane is free"); keep it under about 120 words; no JSON in state_text.
- facts keeps the structured raw values for the UI.
- Add a unit test that feeds three different raw states and checks the output schema and that state_text contains no digits other than the score.

TASK 2 — bot/validator.py:
- validate(action_id, legal_actions) -> (ok: bool, reason: str).
- choose_move(engine, state, legal_actions, adapter, max_retries=3) that: asks engine.decide(state, legal_actions, exclude=tried); checks the choice is legal; submits it through the adapter; if the game rejects the move as illegal, adds it to tried and asks Laya again with exclude=tried. Return the final action, the game response, the list of every Laya call made (one entry per decide() call with its Decision fields) and {"retries": n, "fallback": bool}.
- If retries run out, use the highest-scoring legal action from Laya's LAST action_scores and set fallback=True. NEVER choose randomly, never hard-code a move, never call any other model. Every move must trace back to a Laya call.
- engine is duck-typed: write a StubEngine in tests/lane_a/ that returns Decision-shaped objects (chosen_action, action_scores, questions, question_set, latency_ms, reason, raw) so I can test before Member B's engine exists.
- Tests: legal move passes first time; illegal move triggers a retry with exclude; retries exhausted sets fallback.
Commit on feat/game-integration.
```

## Prompt 3 — The game loop and command line

```text
Continue as Member A on "Beat the Bot". Stay strictly inside my lane. Re-read AGENTS.md sections 5.3, 5.4 and 5.5.

TASK: write bot/loop.py.
1. run_game(adapter, engine, logger, normaliser=None, max_steps=None, seed=None) -> summary dict. Each step: read state; list actions; normalise; call validator.choose_move; judge the result with adapter.judge; build ONE event dict exactly matching the Event contract in AGENTS.md section 5.3 (including laya_calls, validator, final_action, game_response with good/score_before/score_after/done, outcome); call logger.event(event) immediately so the dashboard can stream it live; stop when the game says done or max_steps is reached; call logger.close(summary) with game id, session id, steps, final score, invalid moves, fallbacks, average Laya latency and the completion status.
2. A tiny console line per step (step, action, probability, score) so a terminal viewer also works.
3. CLI: python -m bot.loop --adapter mock --question-set v1_perception --games 3 --seed 7 --max-steps 200. Import LayaEngine lazily from bot.laya.engine and RunLogger from bot.logger; if those modules do not exist yet, fall back to local stubs under tests/lane_a/ and print a clear warning, so my lane stays runnable alone.
4. Handle Ctrl+C cleanly: close the logger with status "interrupted".
5. tests/lane_a/test_loop.py: run a full mock game with StubEngine and a StubLogger, assert one event per step, that every event has at least one laya_call, and that the summary is written.
Add notes to bot/adapters/NOTES.md. Commit on feat/game-integration.
```

## Prompt 4 — Game-day adapter (paste the real API docs where marked)

```text
Continue as Member A on "Beat the Bot". It is hackathon day and the first game has been revealed. Stay strictly inside my lane (bot/adapters/, bot/normaliser.py, bot/validator.py, bot/loop.py, bot/config.py, mock_game/, tests/lane_a/, requirements/a.txt).

Here is the game's agent API documentation and any example requests, pasted verbatim:
<<< PASTE THE GAME API DOCS, URL, AUTH METHOD, EXAMPLE RESPONSES HERE >>>

Qualifying score for this game and what counts as verified: <<< PASTE >>>

TASK:
1. Create bot/adapters/game1.py (use the name game<N> for later games) implementing GameAdapter for this API using the existing http_client. Register it in bot/adapters/registry.py with one line. Read base URL, key and session id from environment variables through bot/config.py; document the variable names in bot/adapters/NOTES.md. Never hard-code or print secrets.
2. Implement start(), get_state(), list_actions(), submit_move() and judge() for this game. judge() must return True/False using only information the game returns (for example score did not drop and the game is not over).
3. Add a normaliser for this game in bot/normaliser.py (a new class plus one registry line): describe the state in short plain English, most important facts first, comparisons computed in code, no raw numbers where a word works.
4. Write bot/adapters/probe_game1.py, a script that starts a session, prints the raw state, lists the legal actions, submits ONE safe move and prints the raw response, so we can verify the API by hand before running the bot. This is a probe only; the real bot never picks moves outside Laya.
5. Record the first 10 raw responses to mock_game/fixtures/game1_samples.json so Member B can test question sets offline.
6. Add an adapter test using recorded fixtures (no network).
Explain anything in the docs that is ambiguous instead of guessing. Commit on feat/game-integration.
```

## Prompt 5 — Robustness before the real runs

```text
Continue as Member A on "Beat the Bot". Stay strictly inside my lane. Harden the pipeline for real hosted games:
1. http_client: respect rate limits (HTTP 429 and Retry-After), distinguish network errors from game-rule rejections, and never retry a move submission that may already have been applied unless the API says it is idempotent; instead re-read the state first and decide.
2. loop: add --resume SESSION_ID support where the game API allows it, a --dry-run flag that reads state and asks Laya but does not submit, and a --max-invalid N circuit breaker that stops the run with status "too_many_invalid".
3. validator: log the exact rejection message from the game inside the event (game_response.message) so the Decision Autopsy can show it.
4. config: print the resolved non-secret settings at start of a run.
5. Add tests for 429 handling, timeout handling and the circuit breaker using a fake adapter.
6. Update bot/adapters/NOTES.md with every failure mode we have actually hit and how it was fixed (this feeds the write-up: what changed after it failed).
Commit on feat/game-integration, then run python scripts/check_lane.py a and report the result.
```

## Before every PR

```text
Run python scripts/check_lane.py a, then pytest tests/lane_a. List every file I changed and confirm each one is inside my lane. Run python -m bot.loop --adapter mock --games 1 and confirm it completes. Then draft a PR description: what changed, how to test, anything other members must know. Do not edit files outside my lane to make checks pass.
```

---

## Extra implementation requirements (apply to every prompt)

### Adapter boundary and game-day safety
- Treat the hosted game's API as unknown until the organisers publish it. Never make up endpoints, field names, authentication, rate limits, legal-action semantics, score rules, or session lifecycle.
- Keep raw API payloads intact in the adapter layer. Normalisation belongs in `bot/normaliser.py`; do not bury game-specific parsing in the generic loop.
- Make adapter methods fail with typed/clear errors that distinguish transport failure, authentication failure, malformed response, and a game-rule rejection.
- Never automatically retry a non-idempotent move submission after a timeout unless the API explicitly documents idempotency. Re-read state first and determine whether the move was applied.
- Read credentials from environment variables. Mask secrets in exception messages and notes.

### Validator invariants
- A move can be submitted only if its ID appears in the current state's legal action list.
- Each rejected action is excluded on the next Laya call. Preserve every attempt and its Laya result in the event.
- If all actions are excluded, stop safely and mark the run as failed; do not invent a move.
- The fallback after retry exhaustion must use Laya's last recorded scores among still-legal actions and be clearly marked. If no valid score exists, stop rather than choose arbitrarily.
- Unit tests must assert the exact action sequence, exclusions, retry count and fallback flag, not merely that the function returns.

### Acceptance gate
Before handing off, demonstrate: mock server starts; adapter reads state and legal actions; one full run finishes; one deliberately rejected action causes a logged re-ask; every event includes a Laya-call record when a decision is attempted; Ctrl+C and network errors close the run cleanly. Write actual commands and outcomes to `bot/adapters/NOTES.md`. Do not claim real-game compatibility before the official API has been tested.

