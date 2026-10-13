# Adapter Notes — Lane A

Use this file to log every API surprise, behaviour deviation, contract
question, or fix encountered while building or running adapters.
Keep entries concise; include date, affected adapter/endpoint, and what
changed or was discovered.

---

## 2026-10-13 — Initial foundation

### mock_game/server.py
- Used stdlib `http.server` (no extra dependency).
- Three lanes, seeded RNG, `--illegal-rate` flag for rejection testing.
- HTTP 422 signals an illegal move; `MockAdapter` maps this to `IllegalMoveError`.
- Obstacles are placed 1–5 steps ahead with density ~0.35 per lane per step.
- Wall moves (lane < 1 or lane > 3) return HTTP 422 immediately.
- Score increases by 10 per safe step; no increase on collision.

### bot/adapters/http_client.py
- Built on `requests.Session` with `HTTPAdapter(Retry(...))`.
- Retries on 429, 500-504 with exponential backoff.
- API key is injected as `Authorization: Bearer <key>` header; never printed.
- 400 → `ValueError`, 404 → `LookupError`, 422 → `ValueError` (caught and
  re-raised as `IllegalMoveError` by adapters).

### bot/adapters/mock.py
- `judge()` uses score delta as primary signal; returns `False` when
  `done=True` and score did not increase (collision).
- `list_actions()` strips unknown keys and guarantees `{id, label, hint}`.

### Registry
- Lazy-loading pattern: each entry is a callable that imports the class only
  when the adapter is first requested.  Heavy game-specific SDKs will not be
  imported unless that adapter is selected.

---

## Questions / Cross-lane dependencies

| # | Question | Owner | Status |
|---|---|---|---|
| 1 | What exact signature does `RunLogger.log_event()` expect? | D | **Resolved** — `logger.event(event_dict)` / `logger.close(summary)` confirmed from bot/logger.py |
| 2 | Does `LayaEngine.decide()` return the full Decision contract shape? | B | Pending — using StubEngine in loop; lazy import will switch automatically when B merges |
| 3 | Should `list_actions()` normalise action IDs to lower-case/snake_case? | A | No — preserve server values exactly |

---

## 2026-10-13 — Prompt 3: Game loop (`bot/loop.py`)

### Design decisions

- **`run_game(adapter, engine, logger, normaliser, max_steps, seed)`** is the single
  public function.  It returns the summary dict from `logger.close()`.
- **Lazy imports** for `LayaEngine` (Member B) and `RunLogger` (Member D): each is
  wrapped in a `try/except` inside `_load_engine()` / `_load_logger()`.  Missing
  modules fall back to `StubEngine` / `_StubLogger` with a `WARNING` on stderr so
  Lane A is runnable standalone before the merge.
- **SIGINT / Ctrl+C** is handled by a `signal.SIGINT` handler that sets a boolean
  flag; the loop checks it at the top of each iteration and emits a terminal event
  with `outcome="interrupted"` before calling `logger.close()`.
- **Terminal events** (game_over / interrupted / dry-run) are emitted by
  `_emit_terminal_event()` with `final_action=None` and `laya_calls=[]` to satisfy
  the Event contract without a submitted move.
- **Console output** via `_console_step()`: one line per step showing step index,
  action, probability, and score — compatible with pipe-to-file or terminal view.
- **CLI** (`python -m bot.loop`): `--adapter`, `--question-set`, `--games`, `--seed`,
  `--max-steps`, `--base-url`, `--logs-dir`, `--dry-run`, `-v/--verbose`.
  Multiple games increment the seed by 1 per episode for variety.
- **Event contract (§ 5.3)**: every submitted step event includes
  `schema`, `session_id`, `game_id`, `ts`, `step`, `state`, `laya_calls`,
  `validator`, `final_action`, `game_response` (with `good/score_before/score_after/done/message`),
  and `outcome`.

### Known limitations / follow-ups

- `--dry-run` flag is accepted by the CLI but not yet fully wired (no-op for now;
  dry-run semantics require engine to be called without `adapter.submit_move()`).
- Average Laya latency is computed over all laya_calls including retries/fallbacks.
- `bot.logger.RunLogger` performs schema validation via jsonschema; the stub logger
  skips validation so cross-lane tests don't require the full dependency graph.

---

*Update this file whenever an API surprise is found or a cross-lane question is resolved.*
