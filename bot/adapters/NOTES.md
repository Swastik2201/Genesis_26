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
| 1 | What exact signature does `RunLogger.log_event()` expect? | D | Pending — using stub in loop |
| 2 | Does `LayaEngine.decide()` return the full Decision contract shape? | B | Pending — using stub in loop |
| 3 | Should `list_actions()` normalise action IDs to lower-case/snake_case? | A | No — preserve server values exactly |

---

*Update this file whenever an API surprise is found or a cross-lane question is resolved.*
