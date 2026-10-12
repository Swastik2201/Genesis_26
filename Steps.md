# STEPS.md — Build order and game-day runbook

Read `AGENTS.md` first. Owner of this file: Member D.
Times are rough guides for a one- or two-day hackathon. Tick boxes in your own branch's notes, not in this file (it is frozen).

## Phase 0 — Setup (all four, about 45 min, before anyone codes)

- [ ] D creates the public GitHub repo `beat-the-bot`, adds `AGENTS.md`, `STEPS.md` and `team/` to `main`, and invites A, B and C.
- [ ] Everyone clones, creates their branch (see `AGENTS.md` section 3) and opens their own `team/MEMBER_*.md`.
- [ ] Everyone creates a virtual environment (Python 3.10+; 3.12 recommended) and runs `pip install laya`. Run one `laya.load("convaiinnovations/laya")` on each machine now. The first download is large; do not discover this on game day.
- [ ] Decide **where the bot runs**: a laptop (best) or a free Colab GPU. If Colab, the dashboard needs the `.jsonl` log: either run `server/` inside Colab with a tunnel, or download the log and replay it locally. Pick one and write it in `docs/notes-d.md`.
- [ ] D pushes the skeleton and contracts (D prompt 1), then tags `contracts-v1`. A, B and C **rebase onto it before writing code**.

## Phase 1 — Parallel build against the mock game (about 3 hours)

Nobody waits for anybody; everyone codes against the contracts in `AGENTS.md`.

| Member | Builds | Done when |
|--------|--------|-----------|
| A | `GameAdapter`, `mock_game/`, normaliser, validator, loop | `python -m bot.loop --adapter mock` plays a full mock game with a stub engine |
| B | Laya smoke test, `LayaEngine`, question sets v1 to v3 | `decide()` returns a valid `Decision` for a canned state in under 100 ms |
| C | Landing page, dashboard shell, Live Run tab, all tabs on mock JSON | Every tab renders from `web/mock/` with no server running |
| D | Logger, FastAPI server, SSE stream, autopsy | `curl localhost:8000/api/stream` prints events while a mock run plays |

## Phase 2 — Vertical slice (about 1 hour, all four together)

Merge into `main` in this order: **D, A, B, C**. After each merge, the next person rebases.

- [ ] A's loop calls B's real engine and D's real logger (no stubs).
- [ ] One mock game runs end to end with the dashboard showing it live.
- [ ] Every event validates against `contracts/event.schema.json`.
- [ ] Tag `slice-v1`. From now on `main` always runs `python -m bot.loop --adapter mock`.

## Phase 3 — Make it good (about 3 hours, parallel again)

- A: retry and timeout handling, session resume, a dry-run flag, a clean game-day adapter template.
- B: Question Lab runner, calibration, a threshold sweep, variants v1 to v4 compared on fixed seeds.
- C: Decision Autopsy, Question Lab, Replay, Calibration and Logs tabs wired to real endpoints, gamer polish, reduced-motion support.
- D: autopsy verdicts, replay endpoint, best-runs export, README draft, write-up skeleton.

## Phase 4 — Game day (the games are revealed)

Run this as a checklist the moment the first game link arrives. Do not improvise.

**Minute 0 to 10 — read and split**
- [ ] One person reads the game's agent API docs aloud to everyone. Paste the docs into `docs/game-<n>.md` (D commits it).
- [ ] Write down: how to start a session, how to read state, the list of legal actions, how a move is submitted, what a rejected move looks like, how the score is verified, and what score qualifies for the next stage.

**Minute 10 to 60 — one adapter, one question set**
- [ ] A uses A prompt 4 to write `bot/adapters/game<n>.py` and a normaliser for that game. First goal: a manual 5-step run (read state, submit one move) from the terminal.
- [ ] B uses B prompt 5 to write `bot/questions/game<n>.py` with 2 or 3 candidate question sets, test them on 10 recorded states, and pick one.
- [ ] D adds the game to the dashboard config via the contracts only (no engine change). C swaps the game name and theme in `web/` config.
- [ ] First full run. Keep every `.jsonl` log and every session ID.

**Minute 60 onward — iterate with evidence**
- [ ] After each run, open the Decision Autopsy tab. Find the worst decisions. Write what failed in `experiments/NOTES.md`.
- [ ] B runs the Question Lab on fixed seeds to compare changes. Change one thing at a time (question wording, state wording, threshold, mapping).
- [ ] Check the calibration tab: if 80% confidence is right only 55% of the time, raise the thresholds or rephrase.
- [ ] When a run reaches the qualifying verified score, save its session ID in `docs/best_runs.md` (D) and copy its log to `logs/best/`.
- [ ] Repeat for game 2 after it unlocks. The optional final stage only starts once game 2 is cleared.

**Rule for every change:** write down (1) what Laya got wrong, (2) what we changed, (3) the score or metric before and after. That is the write-up.

## Phase 5 — Submission (last 2 hours)

- [ ] D: public GitHub repo, final `README.md` with run instructions and credits (Laya by Nandakishor M, laya-playground by brain function collapse).
- [ ] D: `docs/writeup.md` built from every lane's `NOTES.md`: what we asked Laya, why, what we changed after it failed.
- [ ] D: `docs/best_runs.md` with session IDs, scores, links to `logs/best/*.jsonl`.
- [ ] B: calibration and Question Lab numbers pasted into the write-up.
- [ ] C: dashboard works from `logs/best/` with no model running (demo mode), so judges can inspect any decision.
- [ ] A: one command to reproduce a run, documented in the README.
- [ ] All: a final rehearsal of the 3-minute demo (below), then freeze `main`.

## Demo script (3 minutes)

1. Landing page: one sentence on the problem and our pipeline strip.
2. Live Run: start a game; point at state, then the typed questions, then the probabilities, then the move.
3. A bad move: open Decision Autopsy and show what Laya predicted vs what happened.
4. Question Lab: "same game, same seeds, different wording": show the table.
5. Calibration: "when Laya says 80%, it is right X% of the time".
6. Replay: pick any step of a finished run and open the exact recorded event with its session ID.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Model download hangs at 0 bytes | `export HF_HUB_DISABLE_XET=1` |
| `transformers` stalls on import | `export USE_TF=0` |
| Everything is slow after the first run | Set `HF_HUB_OFFLINE=1` once weights are cached |
| First Laya call is slow | Normal: kernels compile. The engine warms up at startup |
| Laya picks inverted or odd actions | Rephrase the question as a perception question and map it in code; test with the Question Lab |
| Probabilities look extreme (0% or 100%) | Check the checkpoint: the multilingual one is uncalibrated; use the English one for English states |
| Merge conflict | You edited a file outside your lane. Revert it, and ask the owner |
| Dashboard empty | Check `GET /api/health`, then that `logs/runs/*.jsonl` is growing |
