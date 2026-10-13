# Question Lab Experiment: lab-01

- **Timestamp:** `2026-10-13T18:54:36.406Z`
- **Adapter:** `mock`
- **Evaluated Variants:** v1_perception, v2_direct_action, v3_hybrid_gates, v4_terse_state

## Comparative Results

| Question Set Variant | Games | Avg Score | Best Score | Invalid Move Rate | Avg Latency (ms) | Completion Rate | Avg Confidence |
|---|---|---|---|---|---|---|---|
| `v1_perception` | 3 | 30.0 | 50 | 14.3% | 1118.6 ms | 100% | 0.626 |
| `v2_direct_action` | 3 | 86.7 | 220 | 9.4% | 712.3 ms | 100% | 0.611 |
| `v3_hybrid_gates` | 3 | 23.3 | 60 | 28.6% | 1200.6 ms | 100% | 0.540 |
| `v4_terse_state` | 3 | 23.3 | 40 | 0.0% | 980.1 ms | 100% | 0.620 |

## Analysis & Observations

Across 3 controlled runs on identical seeds, **`v2_direct_action`** achieved the strongest overall performance with an average score of **86.7** (best: 220) and an invalid move rate of **9.4%**. The comparative metrics demonstrate the relative trade-offs between perception-driven abstraction, direct action controls, binary gating, and concise state phrasing.
