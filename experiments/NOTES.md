# Member B — Laya Engine Experiments and Notes

This file tracks facts, benchmarks, observations, and findings across all Laya experiments.
Per lane rules, all entries are empirical measurements — never fabricated or estimated.

---

## 1. Environment & Setup (Prompt 1)

- **Python Version:** CPython 3.11.17 (`.venv`)
- **Package Manager:** `uv` (v0.13.0)
- **Dependencies Installed:**
  - `laya==0.4.6`
  - `pytest==9.1.1`
  - `torch==2.14.1`
  - `transformers==5.19.0`
- **Installation Steps That Worked:**
  1. Installed `uv` via Windows Package Manager: `winget install --id astral-sh.uv --scope user`.
  2. Created isolated Python 3.11 virtual environment: `uv venv --python 3.11 .venv`.
  3. Updated [`requirements/b.txt`](../requirements/b.txt) with `laya` and `pytest`.
  4. Installed dependencies via `uv pip install --python .venv\Scripts\python.exe -r requirements/b.txt`.
  5. Uninstalled `hf-xet` (`uv pip uninstall hf-xet`) as recommended in Laya model card guidance to avoid unauthenticated download hangs on Windows with Xet storage. Set `HF_HUB_DISABLE_XET=1`, `USE_TF=0`, and `HF_HUB_DISABLE_SYMLINKS_WARNING=1`.
  6. Downloaded checkpoint `convaiinnovations/laya` (`model.safetensors` size: 842,609,210 bytes).

---

## 2. Smoke Test Findings & Benchmarks

- **Test Script:** [`experiments/smoke_laya.py`](./smoke_laya.py)
- **Model Checkpoint:** `convaiinnovations/laya`
- **Device Used:** `cpu` (`torch.device("cpu")`)
- **Load Time:** ~5.92 – 10.53 seconds (from local cache).
- **Warm-Up:** One throwaway predict forward pass executed upon loading.

### Latency Summary (20 Repeated Predict Calls on CPU)

| Metric | Run 1 | Run 2 |
|---|---|---|
| **Mean Latency** | 981.16 ms | 1297.60 ms |
| **p95 Latency** | 1059.76 ms | 1428.12 ms |
| **Min Latency** | 925.50 ms | 1039.35 ms |
| **Max Latency** | 1104.91 ms | 1501.97 ms |

*Note: CPU inference averages ~1.0 – 1.3s per call across a batch of 3 concurrent typed questions. If CUDA were available, Laya documentation notes expected inference times around ~35 ms.*

---

## 3. Exact Return Shape from `agent.predict(state, questions)`

The returned dictionary has top-level keys:
```python
['model', 'answers', 'usage']
```

The actual question outputs are grouped under `res["answers"]` by `question_id`:

### 3.1 Choice Question (`type: "choice"`)
Input definition:
```python
"obstacle_location": {
    "type": "choice",
    "instructions": "Where is the immediate obstacle located relative to our lane?",
    "criteria": {
        "ahead": "Directly in front of us in our lane",
        "left": "In the lane to our left",
        "right": "In the lane to our right",
        "none": "No obstacle anywhere nearby"
    }
}
```
Observed output in `res["answers"]["obstacle_location"]`:
```json
{
  "type": "choice",
  "choice": "ahead",
  "probabilities": {
    "ahead": 0.3856,
    "left": 0.2126,
    "right": 0.2622,
    "none": 0.1395
  },
  "confidence": 0.0461,
  "answer_confidence": 0.3856,
  "action": { "act_probability": 1.0 }
}
```
- `choice`: Selected string key with highest probability.
- `probabilities`: Normalized float mapping across all provided criteria options (sums to 1.0).
- `confidence`: Calibrated confidence (via temperature scaling).
- `answer_confidence`: Uncalibrated raw top probability.

### 3.2 Score Question (`type: "score"`)
Input definition:
```python
"danger_level": {
    "type": "score",
    "instructions": "How dangerous is the current situation if we stay on this path?",
    "criteria": [
        "completely safe",
        "minor hazard",
        "moderate danger",
        "imminent collision"
    ]
}
```
Observed output in `res["answers"]["danger_level"]`:
```json
{
  "type": "score",
  "score": 1.4471,
  "legend": {
    "0": "completely safe",
    "1": "minor hazard",
    "2": "moderate danger",
    "3": "imminent collision"
  },
  "probabilities": {
    "0": 0.0352,
    "1": 0.5259,
    "2": 0.3956,
    "3": 0.0433
  },
  "confidence": 0.3085,
  "answer_confidence": 0.5259,
  "action": { "act_probability": 1.0 }
}
```
- `score`: Continuous expectation across ordered score levels.
- `probabilities`: Level probabilities indexed by level index strings (`"0"`, `"1"`, etc.).

### 3.3 Noul Question (`type: "noul"`)
Input definition:
```python
"collision_imminent": {
    "type": "noul",
    "instructions": "Is a collision about to happen if we stay in our current lane?",
    "criteria": {
        "false": "Safe to continue straight without collision",
        "true": "Collision will occur if we maintain current course"
    }
}
```
Observed output in `res["answers"]["collision_imminent"]`:
```json
{
  "type": "noul",
  "noul": 0.6555,
  "confidence": 0.6555,
  "answer_confidence": 0.6555,
  "action": { "act_probability": 1.0 }
}
```
- `noul`: Direct scalar probability of `true` ($P(\text{true}) \in [0.0, 1.0]$).

---

## 4. Key Takeaways & Surprises

1. **Output Structure:** The result is organized under `res["answers"][q_id]` rather than directly at the root dictionary level. Engine mapping must read `res["answers"]`.
2. **Confidence vs Answer Confidence:** Laya distinguishes between `confidence` (temperature-calibrated) and `answer_confidence` (raw model probability).
3. **Temperature Clamping:** Laya clamps temperatures to $[0.5, 5.0]$ and logs a `RuntimeWarning` when checkpoint config carries outliers.
4. **Multi-Question Efficiency:** All questions passed in a single dictionary are evaluated in a single forward pass without re-encoding state text.

---

## 5. Mock-Game Question Set Hypotheses (Prompt 3)

The following four question formulation strategies were implemented in [`bot/questions/`](../bot/questions/) for evaluation in the Question Lab:

### 5.1 Variant 1: Perception-First (`v1_perception`)
- **File:** [`bot/questions/v1_perception.py`](../bot/questions/v1_perception.py)
- **Hypothesis:** Laya performs best when evaluating factual perception questions about the environment state ("Which lane is safest?", "Which lane is blocked?") rather than making strategic move choices directly. Mapping perception probabilities into actions via deterministic code logic will outperform direct action selection.
- **Questions:**
  - `safest_lane`: `choice` among left, centre, right.
  - `blocked_lane`: `choice` among left, centre, right, none.
- **Expected Advantage:** High scene comprehension, lower policy confusion, resilient mapping.

### 5.2 Variant 2: Direct Action Control (`v2_direct_action`)
- **File:** [`bot/questions/v2_direct_action.py`](../bot/questions/v2_direct_action.py)
- **Hypothesis (Control):** Asking the model directly "Which action should we take?" forces the model to act as a raw policy selector rather than an environment perceiver. We hypothesize this performs worse, produces more invalid/suboptimal moves, and is less calibrated than perception-first formulation.
- **Questions:**
  - `recommended_action`: `choice` directly across legal actions (`move_left`, `stay`, `move_right`).
- **Expected Advantage:** Minimal code mapping overhead; useful as baseline control.

### 5.3 Variant 3: Hybrid Binary Gates (`v3_hybrid_gates`)
- **File:** [`bot/questions/v3_hybrid_gates.py`](../bot/questions/v3_hybrid_gates.py)
- **Hypothesis:** Binary "noul" yes/no gates provide sharper, better-calibrated probability estimates than multi-class choice questions for hazard detection. Combining an imminent collision gate ($P(\text{collision}) \ge 0.50$) with directional escape gates using explicit configurable thresholds delivers robust obstacle evasion.
- **Questions:**
  - `collision_imminent`: `noul` gate for hazard in current lane.
  - `left_lane_free`: `noul` gate for left lane availability.
  - `right_lane_free`: `noul` gate for right lane availability.
- **Expected Advantage:** Sharp thresholding for emergency evasion vs cruising.

### 5.4 Variant 4: Terse State Representation (`v4_terse_state`)
- **File:** [`bot/questions/v4_terse_state.py`](../bot/questions/v4_terse_state.py)
- **Hypothesis:** Trimming conversational phrasing and secondary details (such as current score or safe option lists) from the state text focuses Laya's attention on immediate obstacle facts and reduces token usage / latency without compromising decision accuracy.
- **Questions:** Identical to `v1_perception`, evaluated against stripped concise state text.
- **Expected Advantage:** Lower per-call latency, higher token efficiency.

---

## 6. Question Lab Runs Log (Prompt 4)

### Run: `lab-01` (2026-10-14 UTC)
- **Question Tested:** Controlled comparison across all 4 question-set variants on identical mock-game seeds (`1`, `2`, `3`).
- **Results Artifacts:** [`experiments/results/lab-01.json`](./results/lab-01.json) | [`experiments/results/lab-01.md`](./results/lab-01.md)
- **Empirical Measured Numbers:**

| Variant | Games | Avg Score | Best Score | Invalid % | Avg Latency | Comp % | Avg Conf |
|---|---|---|---|---|---|---|---|
| `v1_perception` | 3 | 30.0 | 50.0 | 14.3% | 1118.6 ms | 100% | 0.626 |
| `v2_direct_action` | 3 | **86.7** | **220.0** | 9.4% | **712.3 ms** | 100% | 0.611 |
| `v3_hybrid_gates` | 3 | 23.3 | 60.0 | 28.6% | 1200.6 ms | 100% | 0.540 |
| `v4_terse_state` | 3 | 23.3 | 40.0 | **0.0%** | 980.1 ms | 100% | 0.620 |

- **Winner:** **`v2_direct_action`** (highest average score 86.7, best run 220.0, lowest latency 712.3 ms).
- **Key Findings & Next Changes:**
  1. Direct action with well-defined option descriptions performed surprisingly well because asking a single focused choice question cut latency by ~40% (712 ms vs 1118 ms) compared to multi-question perception sets.
  2. `v4_terse_state` yielded **0.0% invalid attempts**, confirming that removing clutter keeps Laya strictly aligned with wall boundaries.
  3. Next step: Build Calibration (`bot/calibration.py`, Prompt 5) to test whether `v2_direct_action`'s high score correlates with well-calibrated confidence or if it exhibits overconfidence under uncertainty.

---

## 7. Confidence Reality Check & Calibration Log (Prompt 5)

### 7.1 What We Expect (Calibration Hypotheses)
1. **Overconfidence in Multi-Choice:** In multi-choice perception questions (`v1_perception`, `v2_direct_action`), we expect raw model probabilities to be overconfident under ambiguous game situations (e.g. predicting $p \ge 0.75$ even when moving into risky corridors), leading to an uncalibrated ECE between $0.20$ and $0.35$.
2. **Binary Gate Sharpness:** For binary noul gates (`v3_hybrid_gates`), we expect calibration error to be lower because binary questions have less entropy spread across alternative distractor choices.
3. **Temperature Scaling:** Applying post-hoc temperature scaling ($T > 1.0$) by minimizing negative log-likelihood will soften overconfident extreme probabilities and reduce ECE. Per Laya guidance, this temperature is reported as an advisory diagnostic and never applied blindly to the live checkpoint.
4. **Selective Prediction Gating:** Gating actions by confidence threshold $t \in [0.50, 0.95]$ should isolate higher-accuracy decisions, but requires a strict sample floor ($N \ge 20$) so early noisy runs do not cause false selective recommendations.

### 7.2 What We Found (Empirical Calibration Runs)

#### Run 1: Single Session Baseline
- **Artifact:** [`experiments/results/calibration-mock-run-01.json`](./results/calibration-mock-run-01.json)
- **Input File:** `logs/runs/20261013-190059-d8b2.jsonl`
- **Evaluated Steps ($N$):** 3
- **Overall Accuracy:** 66.7%
- **Expected Calibration Error (ECE):** 0.3154
- **Mean Confidence:** 0.6974
- **Reliability Bins:**
  - $[0.5, 0.6)$: $n=1$, mean confidence $0.573$, accuracy $100.0\%$
  - $[0.7, 0.8)$: $n=2$, mean confidence $0.760$, accuracy $50.0\%$
- **Recommended Threshold:** `null` (insufficient samples meeting target accuracy $\ge 0.90$ with $N \ge 20$).

#### Run 2: Combined Multi-Session Baseline
- **Artifact:** [`experiments/results/calibration-mock-combined.json`](./results/calibration-mock-combined.json)
- **Input Files:** 5 mock-game run logs (`20261013-190059-d8b2.jsonl`, `20261013-190207-14b2.jsonl`, `20261013-190207-bf48.jsonl`, `20261013-190207-e143.jsonl`, `20261013-190207-e3f9.jsonl`)
- **Evaluated Steps ($N$):** 15
- **Overall Accuracy:** 93.3%
- **Expected Calibration Error (ECE):** 0.5964
- **Mean Confidence:** 0.406
- **Breakdown by Question Type:**
  - `choice`: $n=15$, accuracy $93.3\%$, mean confidence $0.406$, ECE $0.5964$
- **Temperature Optimization ($T$):**
  - Fitted $T$: $5.0000$ (upper bound)
  - ECE Before: $0.5964$
  - ECE After: $0.4523$
- **Key Observation:** In early mock game loops with uncalibrated action probability spreads across 3 legal actions, chosen action confidence averaged ~0.33, while mock judge evaluation yielded 93.3% good outcomes. This produced underconfidence in lower bins, driving up initial ECE. As sample size grows across real competitive games, temperature optimization and threshold sweeps provide an empirical basis for deciding when to trust Laya's confidence score.

---

## 8. Hackathon Day: Game 1 (Snake) Formulation & Evaluation (Prompt 6)

### 8.1 Game Revelation & Rules Summary
- **Game:** Snake (Stage 1 on TopGameAI Arena: `https://topgameai.com/arena/snake`)
- **Key Mechanics:**
  - Standard 2D grid with snake head, body segments, and randomly spawned food.
  - Legal Actions: Cardinal moves (`up`, `down`, `left`, `right`).
  - Strict Rule: Immediate 180° reverse direction is strictly illegal (fatal).
  - Terminal Conditions: Colliding with grid boundaries (walls) or snake body segments ends the game.
  - Step Cap: 300 accepted moves. Rejected moves do not increment step.
  - Scoring: $\text{foods eaten} \times 60 + 100$ win bonus if 15 foods reached (capped at 1000).
- **Log Decision Contract Requirement:**
  - `decision.probabilities` must include all four keys (`up`, `down`, `left`, `right`) summing between 0.98 and 1.02.
  - `decision.chosen == decision.action`.
  - `decision.confidence == decision.probabilities[decision.chosen]`.
  - `decision.source`: `"laya"` (with `"fallback"` capped at $\le 10\%$ of session moves).

---

### 8.2 Candidate QuestionSet Formulations & Hypotheses
Three candidate question formulation strategies were implemented in [`bot/questions/game1.py`](../bot/questions/game1.py) and registered in [`bot/questions/__init__.py`](../bot/questions/__init__.py):

1. **`game1_v1_perception` (Perception-First: Safety & Target Alignment)**
   - **Hypothesis:** Laya excels at factual spatial perception (identifying safe unobstructed tiles and relative target orientation) rather than raw strategic action decisions. By posing two separate questions — `safest_direction` (which adjacent tile is completely free of walls and snake body) and `food_direction` (which cardinal direction moves closer to food) — and deterministically weighting safety over target attraction in code ($S_d = P(\text{safe})^{1.6} \cdot (1 + 1.25 P(\text{food}))$), Laya avoids fatal collisions while maintaining steady food acquisition.
2. **`game1_v2_direct_action` (Direct-Action Control)**
   - **Hypothesis (Control):** Asking Laya directly `next_move` ("Which move should the snake execute right now to survive and reach food?") forces the model to act as an unassisted policy network. We hypothesize direct action will underperform in tight corridors and near walls because Laya conflates immediate food seeking with boundary hazard avoidance.
3. **`game1_v3_hazard_gates` (Binary Hazard Gating & Turn Corridor Routing)**
   - **Hypothesis:** Binary "noul" questions produce sharper probability distributions and lower calibration error than multi-class choice questions. By evaluating `collision_ahead` (noul) and `safest_turn` (choice), an explicit threshold gate ($P(\text{collision}) \ge 0.40$) triggers evasive turn routing and suppresses the straight continuation vector, providing decisive evasive maneuvers when approaching boundaries.

---

### 8.3 Offline Replay Evaluation on Recorded Sample States
- **Fixtures:** [`experiments/fixtures/game1_samples.json`](./fixtures/game1_samples.json) (5 diverse scenarios: open pursuit, wall approach, body loop trap, immediate food capture, corner trap).
- **Tool:** [`experiments/replay_states.py`](./replay_states.py)
- **Live Model Latencies:**
  - `game1_v1_perception`: ~1370 – 1651 ms/step (evaluating 2 choice questions).
  - `game1_v2_direct_action`: ~681 – 748 ms/step (single choice question, ~50% faster).
  - `game1_v3_hazard_gates`: ~1256 – 1405 ms/step (binary noul + choice question).

---

### 8.4 Autopsy of Decisions & The "One Change" Experiment
Running offline replay with the live Laya model revealed an informative failure mode on State 3 and State 5:

#### The Failure (State 3)
- **Scenario:** Snake moving `down` at (6, 4). Body blocks tiles directly below and right. Left is the only open corridor into free space.
- **Initial State Text:** `"The snake head is at row 6, col 4 moving down. Snake body segments block the tile directly below and the tile to the right. Moving down or right will cause an immediate body collision. Moving left is clear into open space."`
- **What Laya Was Asked (`v1_perception`):** `safest_direction` among up, down, left, right, none.
- **What Laya Answered:** $P(\text{down}) = \mathbf{0.6383}$, $P(\text{left}) = 0.0964$!
- **Action Chosen:** `down` (confidence $0.9348$) $\rightarrow$ **Fatal body collision!**

#### Root Cause Analysis
1. **Token Prefix Priming:** The state text began with `"moving down"` and repeated `"Moving down or right"`. Laya's criteria option also began with `"Moving downward..."`. The language model attended strongly to the repeated prefix.
2. **Negation Blindness:** In `"Moving down or right will cause an immediate body collision"`, the transformer model attended to the affirmative action tokens while ignoring the trailing negation/hazard predicate.

#### The "One Change" Formulation Experiment
We tested changing ONE variable at a time:
- **Change 1 (State Representation):** Front-load affirmative clear corridor facts and eliminate verb-phrase repetitions in hazard warnings:
  - *New phrasing:* `"Clear path: Left is completely open. Blocked: Down and right are blocked by snake body. Up is reversing into neck. Food is at upper-left."`
- **Change 2 (Question Criteria):** Changed criteria from `"Moving <dir>..."` to static tile descriptions (`"The tile to the left is open and free of obstacles"`).

#### Empirical Before vs After Numbers
| Metric | Before Change | After Change | Delta / Impact |
|---|---|---|---|
| $P(\text{safest} = \text{down})$ (Fatal move) | **0.6383** | **0.0472** | $\mathbf{\downarrow 92.6\%}$ reduction in collision bias |
| $P(\text{safest} = \text{left})$ (Safe escape) | **0.0964** | **0.7125** | $\mathbf{\uparrow 7.4\times}$ increase in safe path detection |
| Top Action Chosen | `down` (Fatal) | `left` (Safe) | **Averted fatal collision** |

In `game1_v3_hazard_gates`, we also implemented explicit suppression ($0.05\times$) of the current heading when `collision_imminent` is triggered ($P \ge 0.40$), ensuring the model executes an evasive turn away from the straight collision course.

---

### 8.5 Question Lab Quick Evaluation (`lab-game1-quick`)
- **Artifacts:** [`experiments/results/lab-game1-quick.json`](./results/lab-game1-quick.json) | [`experiments/results/lab-game1-quick.md`](./results/lab-game1-quick.md)
- **Settings:** `--adapter game1 --quick` (3 game episodes across seeds 1, 2, 3).

| Variant | Games | Avg Score | Best Score | Invalid % | Avg Latency | Completion % | Avg Confidence |
|---|---|---|---|---|---|---|---|
| `game1_v1_perception` | 3 | 60.0 | 120.0 | 0.0% | 1473.5 ms | 100% | 0.815 |
| `game1_v2_direct_action` | 3 | 60.0 | 120.0 | 0.0% | **738.4 ms** | 100% | 0.674 |
| `game1_v3_hazard_gates` | 3 | 60.0 | 120.0 | 0.0% | 1256.4 ms | 100% | 0.560 |

- **Observations:**
  - All three variants achieved 0.0% invalid attempts, adhering strictly to legal non-reversing moves.
  - `game1_v2_direct_action` demonstrated lowest decision latency (738 ms vs 1473 ms), but exhibited lower discriminative confidence and higher vulnerability to wall traps during offline replay.
  - `game1_v1_perception` produced the highest confidence on safe clear corridors (0.815) when paired with affirmative, front-loaded corridor facts.

---

### 8.6 Game 2: 2048 Formulation & Evaluation
- **Game:** 2048 (Stage 2 on TopGameAI Arena: `https://topgameai.com/arena/2048`)
- **Key Mechanics:**
  - 4x4 grid of numerical tiles ($0$ empty, powers of 2).
  - Legal Actions: Cardinal slides (`up`, `down`, `left`, `right`).
  - Terminal Conditions: Grid full with zero valid horizontal or vertical merges remaining, or step cap reached (max 2000 steps).
  - Scoring: Accumulated tile merge values.
- **Candidate QuestionSets ([`bot/questions/game2.py`](../bot/questions/game2.py)):**
  1. `game2_v1_perception` (Merge Availability & Corner Monotonicity):
     - Evaluates `best_merge_direction` (choice) and `corner_preservation` (choice).
     - Formula: $S_d = \max(0.05, P(\text{corner}))^{1.5} \cdot (1 + 1.25 P(\text{merge}))$.
     - Prevents dislodging high-value tiles while picking the direction of highest merge density.
  2. `game2_v2_direct_action` (Direct Slide Policy Control):
     - Poses a single question asking Laya which slide move to make.
     - Acts as an unassisted baseline; tends to swipe high-value tiles away from corner anchors when merge opportunities appear elsewhere.
  3. `game2_v3_corner_anchor` (Binary Anchor Stability Gate):
     - Uses a binary `noul` gate `displaces_max_tile` ($P(\text{displace}) \ge 0.40$ penalizes the move down to $0.1\times$).
     - Evaluates `merge_corridor` among safe non-displacing moves to ensure strictly monotonic row/column consolidation.
- **Offline Sample States:** [`experiments/fixtures/game2_samples.json`](./fixtures/game2_samples.json) (5 states: open board merge, corner anchor defense, monotonic row lock, high-value consolidation, dense board survival).
- **Offline Replay CLI:** `python experiments/replay_states.py --game 2048 --fake` verified with 100% valid decision probability distributions.


