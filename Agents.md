# AGENTS.md — Beat the Bot (PS 02: Teach Laya to Play)

> Every coding agent (Antigravity or otherwise) must read this file first, then `STEPS.md`, then its own `team/MEMBER_*.md`.
> Owner of this file: Member D. It is frozen after Step 0. Changes go through a PR from D only.

## 1. What we are building

A modular Python bot that plays hosted online games through their agent APIs. **Laya makes every move decision**, every decision is a visible, logged Laya call, and a gamer-style web dashboard shows each decision live (state, typed questions, probabilities, chosen action, game response). The games are revealed on hackathon day, so the only game-specific code must live in two places: one **adapter + normaliser** (Member A) and one **question set** (Member B).

Deliverables from the problem statement: working bot, live decision viewer, `.jsonl` decision log, session IDs of best runs, public GitHub repo with README, short write-up (what we asked Laya, why, what we changed after it failed).

### Non-negotiable rules (from the problem statement)
1. Every move comes from a logged Laya call. No other model chooses moves. No random or hand-coded fallback moves.
2. No browser extensions or automation tools that play for us.
3. The bot must be modular: swapping the game must not touch the engine, logger, server or UI.
4. Python 3.10+ (3.12 recommended), `laya` installed via pip, `requests`, JSON Lines logs, Git/GitHub, a viewer that works live.

## 2. Pipeline (five stages) and who owns each

| # | Stage | Module | Owner |
|---|-------|--------|-------|
| 1 | Hosted game API: read state and available actions | `bot/adapters/` | A |
| 2 | State normaliser: compact, plain-English state | `bot/normaliser.py` | A |
| 3 | Laya decision engine: typed questions, probabilities | `bot/laya/`, `bot/questions/` | B |
| 4 | Action validator: legal move check, ask Laya again if not | `bot/validator.py` | A |
| 5 | Submit move, receive next state, log the event | `bot/loop.py`, `bot/logger.py` | A (loop), D (logger) |

Around the pipeline: `server/` (D) streams logs to the dashboard, `web/` (C) is the UI, `experiments/` (B) is the Question Lab.

## 3. Lanes, folders, branches

| Member | Lane | Owns (only edit these) | Branch |
|--------|------|------------------------|--------|
| A | Game integration | `bot/adapters/`, `bot/normaliser.py`, `bot/validator.py`, `bot/loop.py`, `bot/config.py`, `mock_game/`, `tests/lane_a/`, `requirements/a.txt` | `feat/game-integration` |
| B | Laya engine + Question Lab + calibration | `bot/laya/`, `bot/questions/`, `bot/calibration.py`, `experiments/`, `tests/lane_b/`, `requirements/b.txt` | `feat/laya-engine` |
| C | Gamer frontend | `web/` only | `feat/frontend` |
| D | Contracts, logger, server, autopsy, docs | `contracts/`, `server/`, `bot/logger.py`, `bot/autopsy.py`, `logs/`, `docs/`, `scripts/`, `.github/`, `lanes.json`, `README.md`, `AGENTS.md`, `STEPS.md`, `team/`, `requirements.txt`, `requirements/d.txt`, `tests/lane_d/` | `feat/server-logs` |

### Repo layout

```
beat-the-bot/
├── AGENTS.md  STEPS.md  README.md  lanes.json  requirements.txt      (D)
├── team/                         member files with prompts            (D)
├── contracts/                    schemas + api.md                     (D)
├── bot/
│   ├── adapters/  normaliser.py  validator.py  loop.py  config.py     (A)
│   ├── laya/  questions/  calibration.py                              (B)
│   └── logger.py  autopsy.py                                          (D)
├── mock_game/                    local fake game for offline testing  (A)
├── experiments/                  Question Lab scripts + results       (B)
├── server/                       FastAPI: SSE stream + REST           (D)
├── web/                          landing page + dashboard             (C)
├── logs/                         runs/ (ignored)  best/ (committed)   (D)
├── docs/  scripts/  .github/                                          (D)
├── requirements/                 a.txt b.txt d.txt (one file per lane)
└── tests/                        lane_a/ lane_b/ lane_d/
```

## 4. Rules that prevent merge conflicts

1. **One owner per file.** Edit only your lane's paths. If you need a change elsewhere, ask the owner in the group chat. Never "quickly fix" someone else's file.
2. **Contracts are frozen after Step 0** (tag `contracts-v1`). A change needs a small PR from D, announced to everyone; everyone then rebases.
3. **Dependencies:** each lane adds packages only to its own `requirements/<lane>.txt`. D keeps the root `requirements.txt` as `-r` lines.
4. **Branches:** work on your branch, small commits, `git pull --rebase origin main` before every push. Never force-push `main`.
5. **Before every PR** run `python scripts/check_lane.py <a|b|c|d>`. It fails if your diff touches files outside your lane.
6. **Merge order into `main`:** D, then A, then B, then C. `main` must always run `python -m bot.loop --adapter mock`.
7. **Each lane keeps a `NOTES.md`** (`bot/adapters/NOTES.md`, `experiments/NOTES.md`, `web/NOTES.md`, `docs/notes-d.md`) listing every failure and what was changed. D turns these into the write-up.
8. Never commit secrets, API keys, model weights, or `__pycache__`.

## 5. Contracts (draft v0; D publishes the real JSON Schemas in `contracts/`)

### 5.1 State (produced by A's normaliser)
```json
{
  "game_id": "mock-runner",
  "session_id": "20261012-101500-ab12",
  "step": 12,
  "state_text": "Plain English, short, most important facts first. Comparisons already computed in code.",
  "facts": {"any": "structured raw facts for the UI"},
  "legal_actions": [{"id": "left", "label": "Move left", "hint": "shifts one lane left"}],
  "score": 120,
  "done": false
}
```

### 5.2 Decision (returned by B's `LayaEngine.decide`)
```python
@dataclass
class Decision:
    chosen_action: str               # always one of the legal, non-excluded action ids
    action_scores: dict[str, float]  # normalised over legal actions, sums to 1
    questions: list[dict]            # [{"id","type","text","options","probabilities","confidence"}]
    question_set: str                # e.g. "v1_perception"
    latency_ms: float
    reason: str                      # one line shown in the UI
    raw: dict                        # the unmodified Laya result
```
`LayaEngine.decide(state: dict, legal_actions: list[dict], exclude: Sequence[str] = ()) -> Decision`

### 5.3 Event (one JSONL line per step; written by the loop through D's logger)
```json
{
  "schema": 1, "session_id": "...", "game_id": "...", "step": 12, "ts": "2026-10-12T10:15:00.123Z",
  "state": { "...State..." },
  "laya_calls": [
    {"call": 0, "question_set": "v1_perception", "questions": [], "action_scores": {}, "chosen_action": "left",
     "legal": true, "latency_ms": 31.2, "raw": {}}
  ],
  "validator": {"retries": 0, "fallback": false},
  "final_action": "left",
  "game_response": {"ok": true, "good": true, "score_before": 110, "score_after": 120, "done": false, "message": "", "raw": {}},
  "outcome": "ok"
}
```
- `outcome` is one of `ok`, `illegal`, `game_over`, `error`.
- `game_response.good` is set by the adapter's `judge()` (true = the move helped or at least did no harm, null = unknown). It feeds the calibration check.
- If a retry happens, `laya_calls` has several entries. **Every Laya call is logged.** `fallback: true` means retries ran out and the loop used the highest-scoring legal action from Laya's last scores (still Laya-derived, never random).

### 5.4 Logger API (D)
```python
from bot.logger import RunLogger
log = RunLogger(game_id="mock-runner")   # new session_id, opens logs/runs/<session_id>.jsonl
log.event(event_dict)                    # validates, appends one line, flushes immediately
log.close(summary_dict)                  # writes logs/runs/<session_id>.summary.json
```

### 5.5 Loop and adapter API (A)
```python
from bot.adapters import get_adapter
from bot.loop import run_game
summary = run_game(adapter, engine, logger, max_steps=None, seed=None)   # returns the summary dict
```
CLI: `python -m bot.loop --adapter mock --question-set v1_perception --games 3 --seed 7`

### 5.6 Question set API (B)
```python
class QuestionSet:
    id: str
    def build_questions(self, state: dict) -> dict: ...                    # Laya typed questions
    def map_answers(self, answers: dict, legal_actions: list[dict],
                    exclude: Sequence[str]) -> tuple[dict, str]: ...       # (action_scores, reason)
```
Registry: `from bot.questions import get_question_set`.

### 5.7 HTTP API (D, served on port 8000, also serves `web/` at `/`)
| Endpoint | Returns |
|----------|---------|
| `GET /api/health` | `{ok, laya_loaded, version}` |
| `GET /api/runs` | list of sessions with summary |
| `GET /api/runs/{id}/events?from=0&limit=200` | events |
| `GET /api/runs/{id}/events/{step}` | one event (replay) |
| `GET /api/stream?session_id=latest` | Server-Sent Events, one event per step |
| `GET /api/runs/{id}/autopsy` | per-step autopsy verdicts |
| `GET /api/runs/{id}/calibration` and `GET /api/calibration` | calibration result |
| `GET /api/lab` | Question Lab results (B's JSON files, served as is) |
| `GET /api/logs/{id}/download` | the raw `.jsonl` |

### 5.8 Result shapes shared between lanes
Question Lab result (`experiments/results/<name>.json`, written by B):
```json
{"name": "lab-01", "created": "ISO", "game_id": "...", "seeds": [1,2,3],
 "variants": [{"question_set": "v1_perception", "games": 10, "avg_score": 0, "best_score": 0,
   "invalid_rate": 0.0, "avg_latency_ms": 0, "completion_rate": 0.0, "avg_confidence": 0.0, "sessions": ["..."]}]}
```
Calibration result (from `bot.calibration.compute(events)`):
```json
{"n": 0, "accuracy": 0.0, "ece": 0.0,
 "bins": [{"lo": 0.0, "hi": 0.1, "n": 0, "mean_confidence": 0.0, "accuracy": 0.0}],
 "thresholds": [{"t": 0.7, "coverage": 0.0, "accuracy": 0.0}]}
```
Autopsy item (from `bot.autopsy`, written by D):
```json
{"step": 12, "verdict": "confident_miss", "expected": "left (0.82)", "actual": "game over", "note": "text"}
```
Verdicts: `as_predicted`, `confident_miss`, `uncertain_miss`, `lucky_hit`, `illegal_move`, `game_over`.

## 6. How we use Laya (rules for all agents)

These come from Laya's own documentation and the laya-playground notes. Follow them in B's code and in every question set.

- Install with `pip install laya`; load the model **once** with `laya.load("convaiinnovations/laya")` and reuse it. Loading takes roughly 30 s; a call takes milliseconds. Warm up with one throwaway `predict` at startup.
- `agent.predict(state, questions)` takes a state (string, dict or list) and a dict of typed questions and returns probabilities for every option in **one forward pass**. Ask everything about a state in one call.
- Question types: `choice` (options with descriptions), `score` (ordered levels), `noul` (yes/no, returns P(true)). Describe every option; keep option lists short.
- **Ask what the state says, not what to do.** "Where is the obstacle relative to us?" works better than "Which way should we move?". Let code map the perception answer to an action. The Question Lab (USP 2) tests this claim against direct action questions.
- **Put the state into words, not raw numbers.** Do comparisons and thresholds in code ("the obstacle is far to the left") and hand Laya the conclusion.
- Keep the state short and front-loaded (the English checkpoint reads about 512 tokens; the rest is cut).
- Probabilities are the product. Pick thresholds from our own data, not 0.5 by default. `confidence` is low whenever probability is spread out.
- Guard `predict` with a lock; one GPU serves one forward pass at a time.
- Download tips: `HF_HUB_DISABLE_XET=1` if the download hangs at 0 bytes; `USE_TF=0` if `transformers` stalls on import; `HF_HUB_OFFLINE=1` once cached.
- Reference material: `https://github.com/wdobry/laya-playground` (see `static/demos/` for the way each game describes a situation in a sentence and asks one typed question) and `https://brainfunctioncollapse.com/laya` (the visual style we are borrowing: state, then generated questions, then probabilities). Adapt ideas, credit them in the README, do not copy wholesale.

## 7. Our four USPs and where they live

| USP | What the judge sees | Built by |
|-----|---------------------|----------|
| Decision Autopsy | After each move: state, question, probabilities, choice, game response, what it reveals | D (`bot/autopsy.py`, API), C (tab) |
| Question Lab | Controlled comparison of question formulations: score, invalid moves, latency, completion | B (`experiments/`), C (tab) |
| Reproducible Run Replay | Scrub a finished game and open the exact recorded event for any step | D (event store, API), C (tab) |
| Confidence Reality Check | Calibration: does 80% confidence mean 80% good moves? | B (`bot/calibration.py`), C (tab); A supplies `game_response.good` |

## 8. Definition of done for any task

- Runs on the mock game with `python -m bot.loop --adapter mock`.
- Its output validates against the contracts.
- Tests for the lane pass; `python scripts/check_lane.py <lane>` passes.
- Failures and fixes are written in the lane's `NOTES.md`.
- Nothing outside the lane was edited.
