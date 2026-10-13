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
