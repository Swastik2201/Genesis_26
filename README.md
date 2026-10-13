# Beat the Bot — Teach Laya to Play

> Building a game-playing agent powered by Laya, with transparent decisions, reproducible experiments, and tools to analyse how and why it plays.

## Overview

**Beat the Bot** is a game-playing and analysis platform designed to integrate Laya with an external game environment. It captures the game state, formulates questions for Laya, obtains predictions, validates proposed actions, and evaluates the results against actual game outcomes.

Beyond playing the game, the project focuses on understanding the decision-making process through four key features:

- **Decision Autopsy:** Compare a prediction or chosen action with the actual game outcome.
- **Question Lab:** Experiment with different question formulations and compare their results.
- **Reproducible Run Replay:** Reconstruct a game session using structured event logs.
- **Confidence Reality Check:** Examine how predicted probabilities or confidence relate to observed outcomes, where the available data supports such analysis.

The project uses a modular architecture so the game integration, Laya engine, backend, logging system, and frontend can be developed and tested independently.

## Key Features

### 1. Decision Autopsy
Inspect individual decisions and compare what the agent predicted with what happened after its action. Trace decisions back to the corresponding game state and recorded events.

### 2. Question Lab
Test alternative question formulations against comparable game states. Record the resulting predictions and outcomes to evaluate which formulations perform better.

### 3. Reproducible Run Replay
Replay a recorded session step by step using session IDs, timestamps, and structured event logs. Inspect the state, question, prediction, action, and game response at each stage.

### 4. Confidence Reality Check
Analyse the relationship between Laya's reported probabilities or confidence and observed outcomes. Metrics are calculated only when sufficient, appropriate data is available.

## System Architecture

The project follows a modular pipeline:

```text
                 ┌──────────────────────┐
                 │ Game API / Mock Game │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ Game Adapter         │
                 │ State Normalisation  │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ Question Builder     │
                 │ Laya Decision Engine │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ Action Validation    │
                 └──────────┬───────────┘
                            │
                            ▼
                 ┌──────────────────────┐
                 │ Submit Action        │
                 │ Receive Game Outcome │
                 └──────────────────────┘

    All stages ───────► Event Logger ───────► Backend
                                                │
                                                ▼
                                         Web Dashboard
```

The game adapter isolates the external game API from the rest of the application. A mock game environment supports development and testing before the official game API is available.

Every decision should be traceable to the relevant Laya call and recorded game state. Invalid actions must be handled explicitly rather than silently submitted.

## Technology Stack

The final stack depends on the official Laya interface and the hackathon's game API.

| Component | Planned technology |
|---|---|
| Frontend | React, JavaScript, CSS |
| Backend | Python, FastAPI |
| Decision engine | Laya integration through a verified interface |
| Data exchange | JSON and JSON Schema |
| Event logging | Append-only JSONL logs |
| Testing | Python tests and frontend tests |
| Version control | Git and GitHub |

These are planned implementation choices. The exact Laya dependency and game API details must be verified before integration.

## Project File Architecture

```text
beat-the-bot/
│
├── AGENTS.md
├── STEPS.md
├── README.md
├── .gitignore
├── .env.example
├── requirements.txt
├── pyproject.toml
│
├── contracts/
│   ├── game_state.schema.json
│   ├── laya_request.schema.json
│   ├── laya_response.schema.json
│   ├── action.schema.json
│   └── event.schema.json
│
├── bot/
│   ├── __init__.py
│   ├── config.py
│   ├── normaliser.py
│   ├── validator.py
│   ├── loop.py
│   ├── calibration.py
│   │
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── base.py
│   │   └── game_adapter.py
│   │
│   ├── laya/
│   │   ├── __init__.py
│   │   ├── client.py
│   │   └── decision.py
│   │
│   └── questions/
│       ├── __init__.py
│       ├── templates.py
│       └── builder.py
│
├── server/
│   ├── __init__.py
│   ├── app.py
│   ├── routes/
│   │   ├── health.py
│   │   ├── sessions.py
│   │   ├── events.py
│   │   └── analytics.py
│   ├── services/
│   │   ├── session_service.py
│   │   ├── event_service.py
│   │   └── analysis_service.py
│   └── schemas/
│       ├── session.py
│       └── event.py
│
├── logger/
│   ├── __init__.py
│   ├── event_logger.py
│   ├── jsonl_writer.py
│   └── redaction.py
│
├── analysis/
│   ├── decision_autopsy.py
│   ├── question_comparison.py
│   ├── run_replay.py
│   └── confidence_analysis.py
│
├── experiments/
│   ├── experiment_runner.py
│   └── experiment_config.yaml
│
├── mock_game/
│   ├── mock_api.py
│   ├── scenarios.py
│   └── sample_states/
│
├── web/
│   ├── package.json
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── Sidebar.jsx
│       │   ├── StatusBar.jsx
│       │   ├── MetricCard.jsx
│       │   └── EventTimeline.jsx
│       ├── pages/
│       │   ├── Landing.jsx
│       │   ├── Overview.jsx
│       │   ├── DecisionAutopsy.jsx
│       │   ├── QuestionLab.jsx
│       │   ├── RunReplay.jsx
│       │   └── ConfidenceAnalysis.jsx
│       ├── services/
│       │   └── api.js
│       └── styles/
│           └── global.css
│
├── logs/
│   └── .gitkeep
│
├── scripts/
│   ├── run_bot.py
│   ├── run_mock.py
│   └── validate_logs.py
│
└── tests/
    ├── lane_a/
    ├── lane_b/
    ├── lane_c/
    ├── lane_d/
    └── integration/
```

## Directory Responsibilities

| Directory | Purpose |
|---|---|
| `contracts/` | Shared schemas defining how components exchange data |
| `bot/adapters/` | Communication with the external game environment |
| `bot/laya/` | Laya client and decision-making integration |
| `bot/questions/` | Question construction and alternative formulations |
| `bot/` | State normalisation, action validation, orchestration, and calibration |
| `server/` | API endpoints, session management, and backend services |
| `logger/` | Structured event recording and log handling |
| `analysis/` | Implementation of the four analysis features |
| `experiments/` | Controlled experiments and question comparisons |
| `mock_game/` | Local game simulation for development and testing |
| `web/` | Landing page, dashboard, and analysis views |
| `scripts/` | Development, execution, and validation commands |
| `tests/` | Unit tests and end-to-end integration tests |
| `logs/` | Generated session logs; real run data should not be committed |

## Team Responsibilities

The repository is organised into four development lanes to minimise merge conflicts.

| Team member | Ownership | Primary responsibility |
|---|---|---|
| Member A — Game Integration | `bot/adapters/`, `bot/normaliser.py`, `bot/validator.py`, `bot/loop.py`, `mock_game/`, `tests/lane_a/` | Game API integration, state normalisation, legal-action validation, and game interaction |
| Member B — Laya Engine | `bot/laya/`, `bot/questions/`, `bot/calibration.py`, `experiments/`, `tests/lane_b/` | Laya integration, question design, prediction handling, and experiments |
| Member C — Frontend | `web/` | Landing page, dashboard, event timeline, and analysis visualisations |
| Member D — Backend, Logging & Coordination | `contracts/`, `server/`, `logger/`, `analysis/`, `scripts/`, documentation, and integration coordination | Shared contracts, event logging, backend APIs, analysis support, and final integration |




