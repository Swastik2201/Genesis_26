<!-- Team execution guardrails: read AGENTS.md and STEPS.md before using these prompts.
Use only your assigned branch and owned paths. Run one prompt at a time, inspect git diff,
test, and commit before moving to the next prompt. If a task requires a file outside your
lane, stop and ask its owner; do not create a duplicate or edit around the ownership rule.
The real hosted game and its API are unknown until hackathon day: use the mock game and
fixtures until the organiser provides official details. Never invent API fields or scores.
-->
# MEMBER B — Laya Engine, Question Lab, Calibration (stage 3)

Read `AGENTS.md` and `STEPS.md` first. Paste the prompts below into Antigravity one at a time, in order. Finish and commit each before pasting the next.

## Your lane

- **You own:** `bot/laya/`, `bot/questions/`, `bot/calibration.py`, `experiments/`, `tests/lane_b/`, `requirements/b.txt`
- **You never touch:** `bot/adapters/`, `bot/loop.py`, `bot/logger.py`, `server/`, `web/`, `contracts/`
- **Branch:** `feat/laya-engine`
- **You depend on:** the contracts (`AGENTS.md` section 5), A's `run_game()` for the Question Lab (stub until it exists), D's event files for calibration
- **You deliver:** `LayaEngine.decide()`, question sets, the Question Lab (USP 2), `calibration.compute()` (USP 4)
- **Your notes file:** `experiments/NOTES.md` (every time Laya got something wrong: what you asked, what it answered, what you changed, before and after numbers)

## What makes this lane special

You decide how well Laya plays. The rules that matter (from Laya's own docs and the laya-playground notes):
- Ask what the state **says**, not what to **do**; let code map the answer to a move. Test this claim, do not just trust it.
- Words, not numbers. Compute comparisons in code.
- Describe every option; keep option lists short; keep the state short and front-loaded.
- Try two or three phrasings and measure. Wording changes move results a lot.
- Do not read the highest probability as "best move" without checking calibration.

## Checklist

- [ ] Prompt 1: install Laya and run a smoke test
- [ ] Prompt 2: `LayaEngine` and the `QuestionSet` registry
- [ ] Prompt 3: four question-set variants for the mock game
- [ ] Prompt 4: Question Lab
- [ ] Prompt 5: calibration (Confidence Reality Check)
- [ ] Prompt 6: game-day question set
- [ ] `python scripts/check_lane.py b` passes before every PR

---

## Prompt 1 — Install Laya and smoke test

```text
You are Member B (Laya Engine) on the "Beat the Bot" hackathon project: a modular Python bot where the Laya decision model makes every move in hosted online games. Before writing code, read AGENTS.md, STEPS.md and team/MEMBER_B_laya-engine.md completely, especially AGENTS.md section 6 (how we use Laya).

STRICT LANE RULES: edit ONLY bot/laya/, bot/questions/, bot/calibration.py, experiments/, tests/lane_b/ and requirements/b.txt. Do not create or edit any other file. If something outside my lane must change, stop and tell me what and why. Work on branch feat/laya-engine with small commits.

TASK:
1. Put "laya" and "pytest" in requirements/b.txt and install into the active virtual environment (pip install -r requirements/b.txt). Follow Laya's official README and model card (https://github.com/NandhaKishorM/laya and the model card on Hugging Face for convaiinnovations/laya). If the download hangs at 0 bytes, set HF_HUB_DISABLE_XET=1; if transformers stalls on import, set USE_TF=0.
2. Write experiments/smoke_laya.py: load the model ONCE with laya.load("convaiinnovations/laya"), do one throwaway warm-up predict, then run agent.predict(state, questions) on a sample game state written in plain English, with three questions: one "choice" question (options described in a dict, e.g. where an obstacle is relative to us: ahead, left, right, none), one "score" question (ordered levels, e.g. how dangerous the situation is), and one "noul" yes/no question (is a collision about to happen). Print each answer's probabilities and confidence, and the wall-clock latency of each call over 20 repeated calls (mean and p95).
3. Print which device Laya used (cuda, mps or cpu).
4. Write experiments/NOTES.md with: install steps that worked, load time, per-call latency, the exact shape of the returned result for each question type, and anything surprising. Be factual; do not guess API details, read the result you actually get.
Commit on feat/laya-engine.
```

## Prompt 2 — LayaEngine and the question-set registry

```text
Continue as Member B on "Beat the Bot". Stay strictly inside my lane (bot/laya/, bot/questions/, bot/calibration.py, experiments/, tests/lane_b/, requirements/b.txt). Re-read AGENTS.md sections 5.2 and 5.6.

TASK:
1. bot/laya/types.py: the Decision dataclass exactly as in AGENTS.md section 5.2 (chosen_action, action_scores, questions, question_set, latency_ms, reason, raw).
2. bot/questions/base.py: the QuestionSet base class with id, build_questions(state) -> dict of Laya typed questions, and map_answers(answers, legal_actions, exclude) -> (action_scores, reason). bot/questions/__init__.py: a registry with get_question_set(name) and list_question_sets().
3. bot/laya/engine.py: class LayaEngine(question_set="v1_perception", checkpoint="convaiinnovations/laya", device=None).
   - Load the model once in __init__ and run one warm-up predict. Guard every predict with a threading.Lock.
   - decide(state, legal_actions, exclude=()) -> Decision: build questions from the question set using state["state_text"]; make exactly ONE agent.predict call (all questions in one call); map the answers to action scores over legal, non-excluded actions only; normalise so scores sum to 1; chosen_action is the argmax; ties are broken by the order of legal_actions and the reason says so; fill reason with one human-readable sentence; keep the unmodified Laya result in raw; measure latency_ms around the predict call.
   - It must be IMPOSSIBLE for decide() to return an action outside the legal, non-excluded set. If every legal action is excluded, raise a clear error.
   - No other model, no random choice, no hard-coded move anywhere in this file.
   - Add a read-only property last_calls so the loop can inspect calls if needed.
4. tests/lane_b/test_engine.py: use a FakeAgent (no model download) to check the one-call rule, exclusion, normalisation and the legal-action guarantee.
Commit on feat/laya-engine.
```

## Prompt 3 — Four question-set variants for the mock game

```text
Continue as Member B on "Beat the Bot". Stay strictly inside my lane. The mock game is a 3-lane runner (left, straight, right) with obstacles; Member A's normaliser produces state_text in plain English. Create four QuestionSet classes in bot/questions/ so the Question Lab can compare them. Document each one's hypothesis at the top of its file.

1. v1_perception.py — hypothesis: Laya is best at perception. Ask choice questions about the state ("Which lane is blocked?" with a description for each option, "Which lane is safest?"), then map the answers to actions in code with a small, readable table. Do not ask what move to make.
2. v2_direct_action.py — hypothesis (to be tested, not assumed): asking directly "Which action should we take?" with a described option per legal action works worse than perception. Include it as the control.
3. v3_hybrid_gates.py — yes/no "noul" gates ("Is a collision about to happen if we stay in our lane?", "Is the left lane free?") combined with thresholds chosen from data; thresholds live in a config dict at the top, not buried in code.
4. v4_terse_state.py — same as v1 but with a deliberately shorter state sent to Laya, to test whether state length changes results.
Every option needs a description. Keep option lists short. All questions go into ONE predict call. map_answers must return action_scores over only legal, non-excluded actions that sum to 1 and a one-sentence reason.
Add tests in tests/lane_b/ using fake answers. Register all four in the registry. Add a section to experiments/NOTES.md listing the four hypotheses so we can check them later with real numbers.
Commit on feat/laya-engine.
```

## Prompt 4 — Question Lab (USP 2)

```text
Continue as Member B on "Beat the Bot". Stay strictly inside my lane. Build the Question Lab: controlled experiments that compare question formulations on comparable game states.

1. experiments/lab.py with a CLI: python -m experiments.lab --adapter mock --variants v1_perception v2_direct_action v3_hybrid_gates v4_terse_state --games 10 --seeds 1-10 --name lab-01.
2. For each variant and each seed, create ONE LayaEngine per variant (reuse the loaded model; do not reload per game) and call bot.loop.run_game(adapter, engine, logger, seed=seed). Use identical seeds across variants so game states are comparable. Import run_game and RunLogger lazily; if they do not exist yet, use local stubs under experiments/ and print a clear warning.
3. Collect per variant: games, avg_score, best_score, invalid_rate (illegal attempts per move), avg_latency_ms, completion_rate, avg_confidence (mean probability of the chosen action), and the list of session IDs. Write experiments/results/<name>.json in EXACTLY the Question Lab result shape from AGENTS.md section 5.8, plus experiments/results/<name>.md with a readable table and one paragraph on what the numbers show.
4. Print a live progress line per game and a final comparison table in the terminal.
5. Add a --quick flag (3 games per variant) for fast checks, and make results reproducible (same seeds, same outputs for the same model).
6. Tests with a fake engine and fake adapter that check the JSON shape.
Add to experiments/NOTES.md: for every lab run, the date, the question, the winner and what we changed next. Commit on feat/laya-engine.
```

## Prompt 5 — Calibration, the Confidence Reality Check (USP 4)

```text
Continue as Member B on "Beat the Bot". Stay strictly inside my lane. Build the Confidence Reality Check in bot/calibration.py.

1. compute(events: list[dict]) -> dict, where events are the JSONL event dicts from AGENTS.md section 5.3. For every step with a known outcome (game_response.good is True or False), take p = the chosen action's probability from the LAST laya_call's action_scores, and the observed outcome good. Skip steps where good is null.
2. Return EXACTLY the calibration result shape in AGENTS.md section 5.8: n, accuracy (fraction good overall), ece (expected calibration error with 10 equal-width bins), bins (lo, hi, n, mean_confidence, accuracy), and thresholds (a sweep of confidence thresholds t from 0.5 to 0.95 with coverage and accuracy among steps with p >= t).
3. Also compute per-question-type calibration if the questions list gives enough data, and a simple recommended threshold: the lowest t where accuracy among covered steps meets a target (default 0.9) with at least 20 samples; return null if none.
4. Optional: following Laya's guidance, a function fit_temperature(events) that fits a scalar temperature by minimising negative log-likelihood on our own data, returns the value and the ECE before and after. Never overwrite the model's temperature automatically; just report.
5. CLI: python -m bot.calibration logs/runs/<session>.jsonl [more files] prints a text table and writes experiments/results/calibration-<name>.json.
6. Tests with synthetic events: perfectly calibrated data gives ECE near 0; always-overconfident data gives high ECE; n counts only known outcomes; handles an empty list.
Add a note in experiments/NOTES.md: what we expect and, once we have real runs, what we found. Commit on feat/laya-engine.
```

## Prompt 6 — Game-day question set (paste the game details where marked)

```text
Continue as Member B on "Beat the Bot". It is hackathon day and the first game has been revealed. Stay strictly inside my lane (bot/laya/, bot/questions/, bot/calibration.py, experiments/, tests/lane_b/, requirements/b.txt).

Game description and rules: <<< PASTE WHAT THE GAME IS, ITS ACTIONS, ITS SCORING >>>
Sample normalised states and legal actions from Member A (mock_game/fixtures/game1_samples.json): <<< PASTE OR REFERENCE THE FILE >>>

TASK:
1. Write bot/questions/game1.py with TWO OR THREE candidate QuestionSets for this game. Follow our rules: perception questions first, plain-language state, comparisons computed in code, every option described, short option lists, one predict call. At least one candidate must be a direct-action control so the Question Lab can test it. State each candidate's hypothesis in its file header.
2. Write experiments/replay_states.py that runs each candidate on the recorded sample states offline (no network) and prints the probabilities and chosen action next to the legal actions, so I can sanity check the wording before any real run.
3. Register the candidates. Run the Question Lab quickly (--quick) against the real adapter if available, otherwise the fixtures.
4. After each real run, help me analyse the worst decisions: for each failure list what Laya was asked, what it answered with what confidence, what happened, and propose ONE change to wording, state, mapping or threshold. Change one thing at a time and record before and after numbers in experiments/NOTES.md.
Commit on feat/laya-engine.
```

## Before every PR

```text
Run python scripts/check_lane.py b, then pytest tests/lane_b. List every file I changed and confirm each is inside my lane. Run python -m bot.loop --adapter mock --games 1 if the loop exists. Then draft a PR description: what changed, how to test, any numbers from the Question Lab. Do not edit files outside my lane to make checks pass.
```

---

## Extra implementation requirements (apply to every prompt)

### Verify Laya instead of guessing
- Start with the official Laya README and model card. Record package version, load method, device, warm-up behavior, actual return type and exact result keys in `experiments/NOTES.md`.
- Keep one loaded model instance per process; do not reload for every step, question or game.
- Use a fake agent in unit tests so tests do not require downloading weights or internet access.
- Preserve the raw return object in a serialisable form without silently changing the probabilities. If a field cannot be serialised, document the conversion.
- Do not introduce another model or a hidden heuristic policy. Question-set mapping may translate Laya's answers into legal-action scores, but must not choose an action independently of Laya's answers.

### Question quality and fair experiments
- Every question option must have a clear, mutually distinguishable description. Keep options short and avoid ambiguous “good/bad” labels without definitions.
- State the hypothesis before running an experiment. Compare variants on identical seeds or recorded states where possible, and report sample count.
- Separate measured values from assumptions. If a variant has too few games, label the result preliminary rather than declaring a winner.
- Record exact question text, variant ID, chosen action, score, invalid attempts and latency. Make it possible to reproduce the comparison from saved result files.
- Calibration must use only steps with known outcomes. Explain that confidence calibration is not the same as gameplay skill, and warn visibly when the sample is small.

### Acceptance gate
Demonstrate with fake answers that: the engine calls Laya once per decision (all questions in that call); scores cover only legal, non-excluded actions and sum to one; tie-breaking is deterministic; no illegal action can be returned; lab results match the shared result contract; empty or small calibration datasets do not crash. Record actual findings and before/after numbers in `experiments/NOTES.md`.

