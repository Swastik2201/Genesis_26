# Question Lab Experiment: lab-game1-quick

- **Timestamp:** `2026-10-16T05:45:08.626Z`
- **Adapter:** `game1`
- **Evaluated Variants:** game1_v1_perception, game1_v2_direct_action, game1_v3_hazard_gates

## Comparative Results

| Question Set Variant | Games | Avg Score | Best Score | Invalid Move Rate | Avg Latency (ms) | Completion Rate | Avg Confidence |
|---|---|---|---|---|---|---|---|
| `game1_v1_perception` | 3 | 60.0 | 120 | 0.0% | 1473.5 ms | 100% | 0.815 |
| `game1_v2_direct_action` | 3 | 60.0 | 120 | 0.0% | 738.4 ms | 100% | 0.674 |
| `game1_v3_hazard_gates` | 3 | 60.0 | 120 | 0.0% | 1256.4 ms | 100% | 0.560 |

## Analysis & Observations

Across 3 controlled runs on identical seeds, **`game1_v1_perception`** achieved the strongest overall performance with an average score of **60.0** (best: 120) and an invalid move rate of **0.0%**. The comparative metrics demonstrate the relative trade-offs between perception-driven abstraction, direct action controls, binary gating, and concise state phrasing.
