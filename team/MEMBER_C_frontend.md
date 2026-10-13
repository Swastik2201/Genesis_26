<!-- Team execution guardrails: read AGENTS.md and STEPS.md before using these prompts.
Use only your assigned branch and owned paths. Run one prompt at a time, inspect git diff,
test, and commit before moving to the next prompt. If a task requires a file outside your
lane, stop and ask its owner; do not create a duplicate or edit around the ownership rule.
The real hosted game and its API are unknown until hackathon day: use the mock game and
fixtures until the organiser provides official details. Never invent API fields or scores.
-->
# MEMBER C — Gamer Frontend (landing page, dashboard, live decision viewer)

Read `AGENTS.md` and `STEPS.md` first. Paste the prompts below into Antigravity one at a time, in order. Finish and commit each before pasting the next.

## Your lane

- **You own:** `web/` only (everything inside it)
- **You never touch:** anything outside `web/`. No Python files, no `server/`, no `contracts/`.
- **Branch:** `feat/frontend`
- **You depend on:** the HTTP API and event shape in `AGENTS.md` section 5 (D builds the server). Until the server exists you run on mock JSON in `web/mock/`.
- **You deliver:** a landing page and a dashboard with a left navigation bar and these tabs: Overview, Live Run, Decision Autopsy, Question Lab, Replay, Calibration, Logs, About
- **Your notes file:** `web/NOTES.md` (UI decisions, bugs, what changed)

## Design brief

- **Vibe:** dark cyber-gamer HUD. Think arcade cabinet meets mission control.
- **Reference to borrow from:** https://brainfunctioncollapse.com/laya. What we loved: the flow of **state, then generated questions, then probabilities, then the move**, shown step by step. We make it our own with a gamer skin.
- **Tokens:** background `#07060f`, panel `#0f0b1f`, neon cyan `#22e6ff`, neon magenta `#ff3df2`, neon green `#39ff88` (good move), amber `#ffb020` (illegal or uncertain), red `#ff4d6d` (bad move).
- **Fonts:** Orbitron (headings), Rajdhani (body), JetBrains Mono (logs and numbers), each with a system fallback so the page works offline.
- **Effects (all must respect `prefers-reduced-motion`):** scanline overlay, neon glow on borders, HUD corner brackets on cards, glitch on hover for headings, animated probability bars that fill on arrival, a typewriter effect for the state text, a pulsing LIVE badge, XP-bar style score meter, subtle animated grid or particles in the background.
- **Rule:** plain HTML, CSS and vanilla JS, no build step, so judges can open it anywhere and Member D's server can serve it as static files.

## Checklist

- [ ] Prompt 1: design system and landing page
- [ ] Prompt 2: dashboard shell with left navigation and data layer (live and mock)
- [ ] Prompt 3: Live Run tab (the hero)
- [ ] Prompt 4: Decision Autopsy and Replay tabs (USPs 1 and 3)
- [ ] Prompt 5: Question Lab, Calibration, Logs, Overview, About (USPs 2 and 4)
- [ ] Prompt 6: polish, demo mode, accessibility
- [ ] `python scripts/check_lane.py c` passes before every PR

---

## Prompt 1 — Design system and landing page

```text
You are Member C (Frontend) on the "Beat the Bot" hackathon project: a bot where the Laya decision model plays hosted games, and a dashboard shows every decision live. Before writing code, read AGENTS.md, STEPS.md and team/MEMBER_C_frontend.md completely.

STRICT LANE RULES: edit ONLY files inside web/. Do not create or edit anything outside web/. If something outside web/ must change, stop and tell me what and why. Work on branch feat/frontend with small commits. Plain HTML, CSS and vanilla JS only: no frameworks, no build step, no npm.

TASK: build the design system and the landing page.
1. web/css/tokens.css with CSS variables: background #07060f, panel #0f0b1f, neon cyan #22e6ff, neon magenta #ff3df2, neon green #39ff88, amber #ffb020, red #ff4d6d, text and muted text, spacing scale, radii, glow shadows. Fonts: Orbitron for headings, Rajdhani for body, JetBrains Mono for numbers and logs (Google Fonts links with system fallbacks).
2. web/css/base.css and web/css/components.css: reset, typography, and reusable components: .hud-card (dark panel with neon border and corner brackets), .btn and .btn-primary (glow, hover glitch), .badge (LIVE pulsing, GOOD, BAD, ILLEGAL), .prob-bar (animated fill, percentage label), .meter (XP-bar style), .chip, .tabs, .kbd. Add a scanline overlay and a subtle animated background grid. Everything must respect @media (prefers-reduced-motion: reduce).
3. web/index.html, the landing page: hero with the title BEAT THE BOT, tagline "Teach Laya to play. Every move logged. Every decision visible.", an Enter Arena button linking to dashboard.html; a pipeline strip showing the five stages (Game API, State normaliser, Laya engine, Action validator, Submit move) as connected glowing nodes; four USP cards (Decision Autopsy, Question Lab, Reproducible Run Replay, Confidence Reality Check) each with one sentence; a "how a decision looks" preview that animates state, then questions, then probability bars, then a chosen move (loop it); a footer crediting Laya (by Nandakishor M) and the laya-playground site for inspiration.
4. web/js/fx.js: tiny helpers for typewriter text, animated counters and the glitch effect.
5. Responsive from 360 px to 1920 px. Semantic HTML, alt text, visible focus states.
Add web/NOTES.md with a short list of design decisions. Commit on feat/frontend.
```

## Prompt 2 — Dashboard shell, left navigation and data layer

```text
Continue as Member C on "Beat the Bot". Stay strictly inside web/. Re-read AGENTS.md section 5 (the Event contract and the HTTP API).

TASK:
1. web/dashboard.html: a fixed LEFT navigation bar (logo, and nav items with icons: Overview, Live Run, Decision Autopsy, Question Lab, Replay, Calibration, Logs, About), a top status bar (current session id, game id, step counter, score, Laya latency, a LIVE badge that pulses only when events are streaming), and a main content area that swaps panels without a page reload (hash routing, e.g. #/live). The sidebar collapses to icons on narrow screens and becomes a bottom bar on phones. Active tab has a neon highlight.
2. web/js/router.js, web/js/store.js (a tiny observable store holding the current session, the events list, the selected step) and web/js/api.js:
   - Functions: health(), runs(), events(id, from, limit), event(id, step), autopsy(id), calibration(id), lab(), downloadUrl(id), and stream(sessionId, onEvent) using EventSource on /api/stream?session_id=...
   - Automatic MOCK MODE: if a fetch fails or ?mock=1 is in the URL, read from web/mock/ instead, and make stream() replay web/mock/events.sample.json at one event per 800 ms so every tab works with no server.
3. Create web/mock/ with realistic sample data matching the contracts in AGENTS.md section 5: events.sample.json (40 events of a 3-lane runner game, with laya_calls containing choice, score and noul questions with probabilities, a couple of illegal moves with retries, a game over at the end), runs.sample.json, autopsy.sample.json, calibration.sample.json, lab.sample.json.
4. Each tab is its own file in web/js/panels/ exporting mount(container) and unmount(); for now create placeholders for all eight, with the Overview and About filled in later.
5. A global session picker (dropdown) fed by runs().
Commit on feat/frontend.
```

## Prompt 3 — Live Run tab (the hero screen)

```text
Continue as Member C on "Beat the Bot". Stay strictly inside web/. Build web/js/panels/live.js, the screen judges will remember. Borrow the idea from https://brainfunctioncollapse.com/laya: show the model's decision as a sequence, state, then questions, then probabilities, then the move. Give it a gamer HUD skin.

LAYOUT (three columns on desktop, stacked on mobile):
1. STATE column: the state_text typed out with a typewriter effect, the step number and score, and chips for the legal actions.
2. QUESTIONS column: one HUD card per Laya question in laya_calls. Each card shows the question type badge (choice, score, noul), the exact question text, and one row per option with an animated probability bar and percentage; the winning option glows; a small confidence meter. Questions appear one after another with a short stagger so it feels like Laya is thinking.
3. DECISION column: the chosen action in big neon type, the action_scores as bars across the legal actions, the one-line reason, Laya latency, any validator retries (show each rejected attempt in amber with the game's message and the re-asked Laya call), then the game response: good (green flash) or bad (red flash) or illegal (amber), the score delta (floating +10 / -1) and the game's message.
BOTTOM: a step timeline strip of colored pips (green good, red bad, amber illegal, grey unknown). The current step pulses. Clicking a pip opens that step in the Replay tab (#/replay?step=N).
TOP: Play / Pause / Step / speed controls for the stream, and a Follow live toggle. When paused you can inspect any past step; when following, new events animate in.
Data: use store.js and api.stream(). Every number shown must come from the event, never invented. Show a clear empty state ("Waiting for the first move...") and an error state if the stream drops with a reconnect button.
Accessibility: probability bars have text values; animations are skipped under prefers-reduced-motion.
Commit on feat/frontend.
```

## Prompt 4 — Decision Autopsy and Replay (USPs 1 and 3)

```text
Continue as Member C on "Beat the Bot". Stay strictly inside web/. Build two panels.

1) web/js/panels/autopsy.js — Decision Autopsy ("turn every failed move into an investigation"):
- Data: api.autopsy(sessionId) which returns items {step, verdict, expected, actual, note}, plus the matching event for each step.
- A summary row: counts per verdict (as_predicted, confident_miss, uncertain_miss, lucky_hit, illegal_move, game_over) as clickable filter chips with colors.
- A list of cases sorted by severity (confident_miss first). Each case is a HUD card showing: the state text, the exact question that mattered, the probabilities (bars), the chosen action, what the game actually did, and the autopsy note, laid out as "WHAT LAYA PREDICTED" next to "WHAT HAPPENED". A "Open in Replay" button.
- A "worst 5 decisions" banner at the top.

2) web/js/panels/replay.js — Reproducible Run Replay ("rewind a game and inspect any decision"):
- A session picker, a big scrubber/slider across all steps, previous/next buttons and keyboard arrows, a play button that replays the run at selectable speed.
- Show the exact recorded event for the selected step using the SAME components as Live Run, plus a "Raw event" tab with the full JSON (monospace, copy button) including session id, timestamp and the unmodified Laya result, and a Download .jsonl button (api.downloadUrl).
- Deep link support: #/replay?session=...&step=N.
- A banner that makes the proof explicit: "Every move below was produced by a logged Laya call", with the number of Laya calls and the session id.
To avoid duplicated code, move shared rendering (question cards, probability bars, decision card) into web/js/components/ and import it from live.js too.
Commit on feat/frontend.
```

## Prompt 5 — Question Lab, Calibration, Logs, Overview, About (USPs 2 and 4)

```text
Continue as Member C on "Beat the Bot". Stay strictly inside web/. Build the remaining panels. Use web/mock/ data until the real endpoints exist.

1) web/js/panels/lab.js — Question Lab (data: api.lab(), shape in AGENTS.md section 5.8): a leaderboard table of question-set variants with columns avg score, best score, invalid rate, avg latency, completion rate, avg confidence; the winner highlighted with a crown; a bar chart for each metric drawn with plain SVG or canvas (no libraries); a "same game, same seeds, different wording" explainer; clicking a variant lists its session ids linking to Replay. Show the question text of each variant if provided.

2) web/js/panels/calibration.js — Confidence Reality Check (data: api.calibration(id), shape in AGENTS.md section 5.8): a reliability diagram (x = Laya confidence, y = how often the move was good, with the diagonal for perfect calibration and bubbles sized by sample count), the numbers n, accuracy and ECE as big HUD stats, a threshold table (coverage vs accuracy), and a plain-language verdict that is computed from the data ("When Laya says 80%, it is right 61% of the time: overconfident"). Always show the sample count and warn when n < 30.

3) web/js/panels/logs.js — a live-tailing log viewer in monospace: one line per event (time, step, action, probability, outcome), filter by outcome, search, a pause button, and Download .jsonl.

4) web/js/panels/overview.js — KPI cards (games played, best score, average Laya latency, invalid-move rate, calibration score), a score-over-steps sparkline per session, and the best runs with their session ids.

5) web/js/panels/about.js — the problem statement in two lines, the five-stage pipeline, credits to Laya (Nandakishor M, Convai Innovations) and the laya-playground site by brain function collapse as inspiration, and the rules we follow (every move from a logged Laya call, no other model).
Commit on feat/frontend.
```

## Prompt 6 — Polish, demo mode, accessibility

```text
Continue as Member C on "Beat the Bot". Stay strictly inside web/. Polish for the demo:
1. Demo mode: if the server is unreachable, show a visible "DEMO MODE: replaying recorded run" ribbon and play web/mock/ data; if ?run=<session> is given, load logs/best data through the API. Judges must be able to open the page with nothing running and still inspect decisions.
2. A game-config file web/config.js with gameName, gameTagline, accent colors and an optional logo path, so on game day we only edit this file to retheme for a new game (used by landing, top bar and About).
3. Performance: no layout thrash, requestAnimationFrame for animations, virtualise the Logs list beyond 500 lines, cap the particle background and pause it when the tab is hidden.
4. Accessibility: keyboard navigation for the sidebar and tabs, aria-live for new events (polite, throttled), colour is never the only signal (icons or text accompany green/red/amber), contrast checked, prefers-reduced-motion honoured everywhere.
5. Error handling: network errors show a clear retry card, never a blank panel.
6. Sound is OFF by default; add an optional toggle with tiny synthesized beeps (Web Audio, no files) for good, bad and illegal moves.
7. Test manually at 360, 768, 1280 and 1920 px and list what you checked in web/NOTES.md, together with any bug and its fix.
Commit on feat/frontend, then run python scripts/check_lane.py c and report the result.
```

## Before every PR

```text
Run python scripts/check_lane.py c. List every file I changed and confirm each is inside web/. Open dashboard.html with ?mock=1 and click through every tab, then summarise what works and what is broken. Draft a PR description with screenshots to take. Do not edit files outside web/ to make checks pass.
```

---

## Extra implementation requirements (apply to every prompt)

### Visual hierarchy and gamer feel
- Make the interface feel like a game-control console, not a generic admin template. Use the neon palette as accents, not as large areas of saturated color. Keep body copy readable and use monospace only for logs, IDs, probabilities and raw data.
- On desktop, keep the left sidebar persistent and the decision sequence visible without excessive scrolling. On mobile, convert it into a compact bottom navigation or accessible menu.
- The primary Live Run view must make this order unmistakable: **State → Exact Laya questions → Probabilities → Selected action → Validator result → Game response**.
- Use consistent visual meanings: green = positive outcome, red = negative outcome, amber = uncertain/rejected, grey = unavailable/unknown. Always pair colour with a label or icon.
- Avoid fake telemetry. Latency, score, probabilities, step number and session ID must come from the current event or be labelled as demo values.

### Data and failure handling
- Keep all API access in `web/js/api.js`; panels must not make their own fetch calls.
- Keep shared state in `store.js`, shared visuals in reusable components, and route selection in `router.js`.
- Render loading, empty, offline, malformed-data and server-error states for every panel. Never leave a panel blank after a fetch failure.
- Demo mode must have a persistent visible ribbon and use deterministic sample data. Do not mix demo events with real events in the same timeline.
- Escape untrusted game strings before inserting them into HTML. Prefer `textContent` and DOM creation over unsafe `innerHTML`.
- Use `EventSource` reconnect behavior carefully; avoid duplicate steps after reconnect and make pause/follow-live state clear.

### Accessibility and acceptance gate
- Test keyboard-only navigation, visible focus, screen-reader labels for probability values, reduced-motion mode and responsive widths 360, 768, 1280 and 1920 px.
- Ensure the probabilities remain readable without animation and that the page is usable when external fonts fail to load.
- Acceptance: open `dashboard.html?mock=1` without the server; navigate all eight tabs; inspect a past decision; copy raw JSON; use replay controls; verify the demo ribbon is always visible. Record results and screenshots to `web/NOTES.md`.

