# STEPS.md — Build and Integration Order

This file is the team execution plan. Follow it in order to keep four members from creating merge conflicts.

## Phase 0 — One person establishes the shared foundation

**Owner: Member D. Others wait for the contracts commit.**

1. Create the skeleton folders and lane-specific requirement files.
2. Create `AGENTS.md`, `STEPS.md`, `lanes.json`, `scripts/check_lane.py`, schema files, schema examples and contract tests.
3. Ensure all schemas and examples agree. Commit and merge to `main`.
4. Tag the commit `contracts-v1`.
5. Send the group message: “Contracts v1 is on main. Please fetch and rebase your lane branch on origin/main before continuing. Do not change contract files; send D a request if a contract change is needed.”
6. Only after this, all four members begin their lane prompts.

## Phase 1 — Parallel development by lane

### Member A: adapter and game loop
1. Build adapter interface + mock server + mock adapter.
2. Build normaliser + validator and retry behavior.
3. Build loop/CLI and prove a complete mock run with stub engine/logger.
4. Integrate B's engine and D's logger after they land.
5. On hackathon day, read the official game API docs and implement `game1.py` as a new adapter. Do not rewrite the engine or dashboard to match the API.

### Member B: Laya and experiment layer
1. Verify the official Laya package/model API with a smoke test before building abstractions.
2. Build the engine against the shared Decision shape and test with a fake agent.
3. Implement question-set variants for the mock game.
4. Build Question Lab with identical seeds / comparable states across variants.
5. Build calibration from recorded events and document sample-size limitations.
6. On game day, add game-specific question sets after A provides sample states and legal actions.

### Member C: dashboard
1. Build the visual tokens and landing page.
2. Build dashboard shell, sidebar, router, store, API client and mock data.
3. Build Live Run before secondary tabs; it is the primary judge-facing experience.
4. Build Autopsy and Replay, then Lab, Calibration, Logs, Overview and About.
5. Confirm it works in demo mode with no server running and against D's API once available.

### Member D: infrastructure, logging and docs
1. Publish contracts first; do not delay this for the final visual design.
2. Build logger and test redaction, line writes and concurrency.
3. Build server and SSE stream; use a demo feeder so C can integrate before A/B finish.
4. Build autopsy, replay verification and evidence scripts.
5. Finish README/write-up using measured numbers only.

## Phase 2 — Integration checkpoints

### Checkpoint A: contracts-v1
Must exist before A/B/C implement against event shapes.

### Checkpoint B: mock slice
A mock game can run using a stub engine and stub logger. C's dashboard displays fixture data.

### Checkpoint C: first end-to-end run
- A's loop uses B's actual `LayaEngine`.
- Every submitted move has a `laya_call` in the event.
- D's logger validates and persists events.
- D's server streams events to C.
- C shows the same step, question text, probabilities, action and outcome.

### Checkpoint D: audit features
- Decision Autopsy shows failed decisions and explicitly labels explanations as hypotheses.
- Replay can select a session and step, show the unmodified event and download the JSONL.
- Verification script checks contiguous steps and action-to-Laya-call traceability.
- Question Lab and Calibration panels show real values or an explicit empty/demo state.

### Checkpoint E: game-day adapter
1. Copy the official game API docs and qualifying/verified score rules into a private team note or the relevant prompt; do not guess.
2. A implements and probes the adapter with one safe test move. The probe is separate from normal bot gameplay and must never be used as a decision-making shortcut during scored runs.
3. Save raw sample responses with secrets removed.
4. B adds game-specific question sets and runs offline replay against recorded states.
5. D updates only documentation/config/contracts if needed; announce any contract change before coding against it.
6. C rethemes labels through `web/config.js`, without changing data semantics.
7. Run a short smoke test, then a complete run. Preserve session IDs and logs for best runs.

## Merge-conflict prevention rules

- Never run multiple Antigravity agents against the same branch or shared files.
- Each person opens the repo on their own branch and checks `git status` before work.
- Before editing, run `git fetch origin` and rebase on `origin/main`.
- Keep each Antigravity prompt scoped to one phase and one lane. Commit before pasting the next prompt.
- Do not ask an agent to “fix the whole project”; ask it to report cross-lane issues instead.
- D owns `AGENTS.md`, `STEPS.md`, contracts and the lane checker. Others must not regenerate or rewrite them.
- A owns `bot/loop.py`; B owns `bot/laya/` and `bot/questions/`; D owns `bot/logger.py` and `server/`; C owns `web/`. These boundaries are strict.
- If a needed file does not exist yet, use a test stub or a documented interface; do not create a competing implementation outside your lane.
- Before PR, inspect `git diff --name-only` and run your lane checker. If it reports a file outside your lane, revert that edit or ask the owner to handle it.
- No direct commits to `main` after contracts-v1. Use PRs.

## Suggested group timeline

1. D: contracts-v1.
2. A/B/C: first working vertical slice in parallel.
3. D → A → B → C merge sequence after contracts, resolving dependencies at each checkpoint.
4. Full team: end-to-end smoke test.
5. A/B: game-day adaptation; C: retheme; D: audit and submission evidence.
6. Final: verify logs, session IDs, qualifying score evidence, public repo, README and write-up.

## End-of-day status format

Each member posts:
- Branch and latest commit
- Files changed
- Tests run and results
- What is ready
- What is blocked and which owner is needed
- Any measured results (never estimates presented as measurements)

