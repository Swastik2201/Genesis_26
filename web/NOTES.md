# Member C Frontend — Notes & Design Decisions

## Lane Ownership & Guardrails
- **Branch:** `feat/frontend`
- **Path Ownership:** `web/` only. Strictly zero edits outside `web/`.
- **Tech Stack:** Plain HTML5, CSS3, and Vanilla JavaScript (ES Modules). No build step, no npm, no bundlers.

---

## Design System Tokens & Aesthetics
- **Theme:** Cyber-Gamer HUD (Dark arcade cabinet meets aerospace mission control).
- **Core Color Palette:**
  - Background: `#07060f` (`--bg-primary`)
  - Panels: `#0f0b1f` (`--bg-panel`)
  - Elevated Cards: `#16112e` (`--bg-panel-elevated`)
  - Neon Cyan: `#22e6ff` (`--neon-cyan`) — Primary active state, player focus, data links
  - Neon Magenta: `#ff3df2` (`--neon-magenta`) — Secondary accents, Laya reasoning highlights
  - Neon Green: `#39ff88` (`--neon-green`) — Successful decisions, high confidence, good moves
  - Amber: `#ffb020` (`--amber`) — Validator retries, uncertainty, illegal actions
  - Red: `#ff4d6d` (`--red`) — Game over, damage, bad moves, live indicator
- **Typography:**
  - Headings: `Orbitron` (500, 700, 800, 900)
  - Body: `Rajdhani` (500, 600, 700)
  - Data / Logs / Numbers: `JetBrains Mono` (400, 500, 700)
  - Fallbacks: System fonts (`-apple-system, BlinkMacSystemFont, 'Segoe UI', monospace`) ensured for offline resilience.

---

## Reusable Components Implemented
1. **`.hud-card`**: Dark panel with customizable neon borders and cyber corner brackets (`::before` / `::after`).
2. **`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`**: Angled polygon chamfer cuts, hover glow, active compression, and accessible focus outlines.
3. **`.badge`**: Status badges including `.badge-live` with pulsing indicator, `.badge-good`, `.badge-bad`, `.badge-illegal`, and `.badge-demo`.
4. **`.prob-bar`**: Animated probability distribution track with percentage labels and `.winner` glow.
5. **`.meter`**: XP-style segmented score/health meter.
6. **`.chip`**: Compact tags for legal actions, filters, and step indicators.
7. **`.tabs`**: Underlined neon tab navigation.
8. **`.kbd`**: Cyber keyboard key style for hotkeys and routes.

---

## Prompt 1: Landing Page (`web/index.html`)
- **Hero Section:** "BEAT THE BOT" with tagline "Teach Laya to play. Every move logged. Every decision visible.", plus quick stats ticker.
- **Pipeline Strip:** 5 glowing connected stages (Game API ➔ State Normaliser ➔ Laya Engine ➔ Action Validator ➔ Submit Move).
- **Interactive Decision Preview ("How a Decision Looks"):** Live cyclical simulation powered by `fx.js` demonstrating the decision flow: State ➔ Typed Questions ➔ Probabilities ➔ Selected Move ➔ Game Outcome (+10 pts). Includes Play/Pause control.
- **4 Required USPs:**
  1. *Decision Autopsy* (`#/autopsy`): Forensic comparison of predictions vs outcomes.
  2. *Question Lab* (`#/lab`): A/B testing question formulations on identical seeds.
  3. *Reproducible Run Replay* (`#/replay`): SHA-256 verifiable step-by-step playback.
  4. *Confidence Reality Check* (`#/calibration`): Expected Calibration Error and reliability bins.
- **Rules & Trust Banner:** Explicit non-negotiable rules reinforcement (Laya only, 100% traceability, no fabricated data).
- **Footer:** Formal credits to Laya (by Nandakishor M) and the `laya-playground` inspiration.

---

## Prompt 2: Dashboard Shell, Navigation, & Data Layer
- **Dashboard Shell (`web/dashboard.html`):**
  - **Fixed Left Navigation:** Persistent sidebar with cyber branding, global session picker dropdown, and nav links with active neon highlights:
    - Overview (`#/overview`)
    - Live Run (`#/live`)
    - Decision Autopsy (`#/autopsy`)
    - Question Lab (`#/lab`)
    - Replay (`#/replay`)
    - Calibration (`#/calibration`)
    - Logs (`#/logs`)
    - About (`#/about`)
  - **Top Telemetry Status Bar:** Real-time displays for Session ID, Game ID, Step counter, Score meter, Laya latency (ms), and a pulsing LIVE badge that animates only when actively streaming.
  - **Responsive Transitions:**
    - Desktop: Full sidebar with labels.
    - Tablet / Narrow desktop (<1024px): Collapses to sleek icon-only rail.
    - Mobile (<680px): Transforms to an accessible bottom navigation bar with compact topbar.
- **Reactive State Store (`web/js/store.js`):**
  - Observable store holding current session, sessions list, event history, active step, score, streaming status, and mock mode.
- **Client-Side Hash Router (`web/js/router.js`):**
  - URL hash router supporting parameters (e.g. `#/replay?step=12`).
  - Automatically unmounts previous panel and mounts new active panel without page reloads.
- **Data Layer & Fallback (`web/js/api.js`):**
  - Endpoints implemented: `health()`, `runs()`, `events(id, from, limit)`, `event(id, step)`, `autopsy(id)`, `calibration(id)`, `lab()`, `downloadUrl(id)`, and `stream(id, onEvent)`.
  - **Automatic Mock Mode:** If server is unreachable or `?mock=1` is provided, automatically falls back to `web/mock/` fixtures and activates mock stream replay at 800ms per step.
  - Visible `DEMO DATA` banner displayed whenever mock mode is engaged.
- **Realistic Mock Datasets (`web/mock/`):**
  - `events.sample.json`: 40 complete sequential events for a 3-lane runner game, featuring choice, score, and noul question types, 2 validator retries for illegal boundaries, and game-over termination.
  - `runs.sample.json`: Multiple run summaries matching `contracts/examples/summary.json`.
  - `autopsy.sample.json`: Ranked forensic autopsy cases matching `contracts/examples/autopsy_item.json`.
  - `calibration.sample.json`: Calibration result matching `contracts/examples/calibration_result.json`.
  - `lab.sample.json`: Question Lab A/B test comparison matching `contracts/examples/lab_result.json`.
- **Modular Panels (`web/js/panels/`):**
  - Each panel implements isolated `mount(container, params)` and `unmount()` lifecycle methods.

---

## Prompt 3: Live Run Hero Screen (`web/js/panels/live.js`)
- **Visual Design & Sequence (Inspired by laya-playground):**
  - Three-column layout showing the full decision lifecycle:
    1. **STATE Column:**
       - Typewriter effect for normalized text summary.
       - Step number and current score badges.
       - Structured facts readout (current lane, track speed).
       - Legal actions list with status chips.
    2. **QUESTIONS Column (Laya Reasoning):**
       - Staggered animation for typed questions in `laya_calls`.
       - Type badges (`CHOICE`, `SCORE`, `NOUL`) and exact question IDs.
       - Animated probability bars with percentage values and winner glow.
       - Single visible model call guarantee and latency readout.
    3. **DECISION Column (Action & Game Response):**
       - Giant neon chosen action title with cyber glitch micro-animation.
       - Action scores distribution across legal moves.
       - One-line human-readable reasoning summary.
       - **Validator Retries Alert:** Amber banner highlighting rejected actions, reason for exclusion, and the subsequent lawful Laya call.
       - Game server response flash (green for good, red for bad) with floating score delta (`+10`, `+25`, `-5`).
- **Interactive Bottom Timeline Strip:**
  - Color-coded pips for every recorded step: green (good), amber (retried / illegal), red (bad / collision).
  - Actively pulsing ring on current step.
  - Clicking any pip allows inspecting that historical frame; includes shortcut button to inspect the step in the Replay tab (`#/replay?step=N`).
- **Playback & Stream Controls Toolbar:**
  - Play / Pause toggle, Step forward button, Speed selector (`0.5x`, `1.0x`, `2.0x`).
  - Follow Live switch that automatically tracks the latest event or stays on historic frames.
  - Clear empty waiting state with demo launcher and error state with reconnect button.

---

## Prompt 4: Decision Autopsy & Reproducible Replay (USPs 1 & 3)
- **Shared Decision Component (`web/js/components/decisionCard.js`):**
  - Extracted shared rendering for State, Questions, Probability bars, and Decision cards into a modular reusable component shared across Live Run and Replay.
- **Decision Autopsy Panel (`web/js/panels/autopsy.js` & `web/css/autopsy.css`):**
  - **Worst 5 Decisions Banner:** High-priority hotlist spotlighting severe incidents (confident misses, illegal boundary violations).
  - **Interactive Verdict Filters:** Clickable filter chips showing counts for `all`, `confident_miss`, `illegal_move`, `uncertain_miss`, `lucky_hit`, and `game_over`.
  - **Forensic Comparison HUD Card:**
    - *What Laya Predicted:* Exact question text, probability distribution bars, predicted winner, and expected outcome.
    - *What Happened:* Actual chosen action, score delta, server response message, and game outcome.
    - *Forensic Hypothesis & Audit Note:* Explanations framed strictly as testable scientific hypotheses.
    - Direct shortcut button to open step in Replay.
- **Reproducible Run Replay Panel (`web/js/panels/replay.js` & `web/css/replay.css`):**
  - **Audit Proof Banner:** Explicit declaration *"Every move below was produced by a logged Laya call"*, displaying session ID, total Laya calls, and SHA-256 verification status.
  - **Interactive Controls:** Big range scrubber across all steps, Play/Pause toggle with selectable speeds (`0.5x`, `1.0x`, `2.0x`), Prev/Next step buttons, and global keyboard arrow key navigation (`◀` / `▶`).
  - **Deep Link Navigation:** Instant step and session restoration via URL hashes (`#/replay?session=...&step=N`).
  - **Dual View Modes:**
    1. *Interactive HUD View:* Full 3-column game view matching Live Run.
    2. *Raw Event JSON View:* Monospace formatted JSON viewer, session ID, timestamp, copy-to-clipboard button with visual feedback, and `.jsonl` download.

---

---

## Prompt 5: Question Lab, Calibration, Logs, Overview, & About (USPs 2 & 4)
- **Question Lab (`web/js/panels/lab.js` & `web/css/panels.css`):**
  - **Scientific A/B Benchmark:** Leaderboard table comparing question formulations on identical game seeds with columns for average score, best score, invalid rate, average latency, completion rate, and average confidence.
  - **Crown Winner:** Top-performing question variant highlighted with a gold crown badge (`👑 #1 OPTIMAL`).
  - **Plain SVG Metric Charts:** Handcrafted inline `<svg>` horizontal bar charts for all 6 metrics without external charting libraries, featuring animated fill transitions and winner accents.
  - **Explainer Banner:** *"Same game, same seeds, different wording"* contextual header explaining the perceptual vs direct prompting methodology.
  - **Variant Inspection & Replay Links:** Interactive selection displaying the exact question prompt text, options, and list of linked sessions with one-click navigation to Replay (`#/replay?session=...`).
- **Confidence Reality Check (`web/js/panels/calibration.js`):**
  - **Plain SVG Reliability Diagram:** Plots predicted confidence ($x$) against empirical accuracy ($y$) with an ideal calibration diagonal ($y = x$) and bubble sizes scaled proportionally to bin sample counts.
  - **Big HUD Stats Row:** Bold displays for Sample Count ($n$), Empirical Accuracy (%), and Expected Calibration Error (ECE).
  - **Sample Size Guardrail:** Prominent warning banner and alert badge rendered whenever $n < 30$, warning judges that the evaluation is preliminary.
  - **Computed Plain-Language Verdict:** Dynamically generated from empirical bin data (e.g. *"When Laya says 80%, it is right 61% of the time: overconfident"*).
  - **Threshold Coverage Table:** Tabular breakdown of minimum confidence thresholds vs move coverage and accuracy, highlighting the recommended cutoff.
- **Live-Tailing Monospace Run Logs (`web/js/panels/logs.js`):**
  - **Terminal Telemetry Stream:** Monospace terminal displaying one row per event containing precise timestamp (`HH:MM:SS.mmm`), step number (`S00`), action tag, confidence percentage, and outcome message.
  - **Outcome Filters & Live Search:** Quick filter chips for `ALL`, `GOOD (+PTS)`, `PENALTY / MISS`, `EXCLUSIONS`, and `GAME OVER`, paired with instant regex/text search across actions, notes, and states.
  - **Auto-Tail & Scroll Lock:** Real-time tailing with pause/resume lock, status pulse indicator, manual scroll detection, and a floating *"Jump to latest event"* shortcut pill.
  - **One-Click JSONL Export:** Direct client-side `.jsonl` generator and download export button (`${sessionId}.jsonl`).
  - **Direct Replay Links:** Clicking any log line immediately opens that step in Replay.
- **System Overview (`web/js/panels/overview.js`):**
  - **5 Primary Mission Control KPI Cards:** Games Played, Best Score, Average Laya Latency, Invalid-Move Rate, and Calibration Score (ECE).
  - **Hero Score-over-Steps SVG Trajectory:** Full-width glowing SVG chart tracing the active session's step-by-step score progression.
  - **Historical Runs Leaderboard:** Table of past game runs with session IDs, game adapters, step counts, scores, and per-session inline SVG sparklines.
  - **Reactive Telemetry:** Store subscription automatically updates live scores and step counters when events stream.
- **About & Architecture (`web/js/panels/about.js`):**
  - **Two-Line Problem Statement:** Clear summary of unknown hosted game APIs and the Laya typed decision layer.
  - **The Five-Stage Pipeline Diagram:** Responsive cyber pipeline cards detailing Hosted Game API ➔ State Normaliser ➔ Laya Engine ➔ Action Validator ➔ Submit Move with animated connection arrows.
  - **Formal Credits & Acknowledgements:** Crediting the Laya foundation model to Nandakishor M (Convai Innovations) and dashboard UX inspiration to `brainfunctioncollapse.com/laya`.
  - **Non-Negotiable Integrity Rules:** Explicit checklist confirming Laya exclusive moves, one visible call per turn, zero fabricated data, and immutable SHA-256 sealed logs.
  - **Team Lane Architecture:** Transparent breakdown of Members A, B, C, and D responsibilities.

---

## Prompt 6: Polish, Demo Mode, Game Config, Performance, Sound, & Accessibility
- **Demo Mode Ribbon & URL Parameter Handling:**
  - Standalone Offline Resilience: When backend server is unreachable or `?mock=1` is passed, system engages mock mode with zero console breaks or blank panels.
  - Prominent Cyber Demo Ribbon: Displays a glowing hazard banner at the top of the dashboard: *"REPLAYING RECORDED RUN // Standalone demonstration fixtures active (Server unreachable)"* with a *"RETRY LIVE"* button and dismiss control.
  - Deep Link Query Parameter `?run=<session>`: Automatically selects and loads the requested session and its associated logs, autopsy, and calibration records.
- **Centralized Game Retheming (`web/config.js`):**
  - Exported `gameConfig` holds `gameName`, `gameSubtitle`, `gameTagline`, `gameId`, `theme` colors, and `rules`.
  - On game day, the entire frontend (Landing, Topbar, About, Overview) is rethemed simply by editing `web/config.js`.
- **Performance & Virtualization:**
  - DOM Virtualization for Logs: In `web/js/panels/logs.js`, lists exceeding 500 events automatically engage windowed virtualization, rendering only the visible viewport slice (~28px row height) via `requestAnimationFrame` with overscan buffers.
  - Capped Ambient Particles: Ambient particle canvas capped to max 30 particles on desktop and 15 on mobile.
  - Tab Visibility Pause: Listens to `visibilitychange` to immediately cancel `requestAnimationFrame` loops and pause simulation timers whenever the tab is hidden, reducing idle CPU usage to 0%.
- **Synthesized Web Audio (`web/js/sound.js`):**
  - Strictly OFF by default (`soundEnabled = false`).
  - Interactive topbar toggle (`🔇 SOUND: OFF` / `🔊 SOUND: ON`) with `localStorage` persistence.
  - 100% synthesized tones via `AudioContext` without external sound asset files:
    * Good Move: Bright 2-tone rising chime (523Hz ➔ 784Hz).
    * Bad Move / Miss: Descending sawtooth tone (220Hz ➔ 110Hz).
    * Illegal Move: Double staccato square wave warning pulse (440Hz).
    * Step Click: Subtle micro-blip (880Hz sine).
- **Accessibility & Contrast:**
  - Keyboard Navigation: Sidebar navigation links support `ArrowUp`, `ArrowDown`, `Home`, and `End` cycling with `tabindex="0"`.
  - Throttled Live Announcer: Dedicated `#live-announcer` with `aria-live="polite"` announces telemetry step changes throttled to at most once per 1.5 seconds.
  - Redundant Signals: Color is never the sole indicator—every status is accompanied by text badges and symbols (`✓` for good, `✗` for bad, `⚠` for illegal retries, `🏁` for game over).
  - Reduced Motion: System queries `prefers-reduced-motion: reduce` across both CSS and JS to disable canvas particles, typewriter pauses, glitches, and transitions.

---

## Manual Multi-Viewport Responsive Testing Matrix

| Viewport Width | Device Target | What Was Checked | Bugs Identified | Fix Implemented |
|---|---|---|---|---|
| **360 px** | Mobile (Small Phone) | Bottom navigation bar, stacked 3-column hero grid, topbar wrapping, log terminal scrolling, table overflows. | 1. Demo ribbon text caused horizontal scroll on narrow mobile screens.<br>2. Log terminal columns (`560px` min-width) clipped right-hand outcome text. | 1. Added `@media (max-width: 680px)` stacking demo ribbon vertically with padding adjustments.<br>2. Added `overflow-x: auto` with `-webkit-overflow-scrolling: touch` to `.log-terminal-wrapper`. |
| **768 px** | Tablet (iPad Portrait) | 64px icon sidebar rail, topbar telemetry display, autopsy forensic cards, 2-column Question Lab charts. | Sidebar brand text expanded offscreen when sidebar width was collapsed to 64px. | Added `.sidebar-brand-text { display: none }` and `.nav-label { display: none }` at `< 1024px` breakpoint. |
| **1280 px** | Laptop / Small Desktop | Full 260px fixed sidebar, complete 3-column Live Run HUD, Timeline pips track, SVG sparklines, audio toggle. | Tooltip on timeline pips was jittery on rapid hover during live stream. | Set `pointer-events: none` on pip pseudo-elements and throttled pip DOM updates. |
| **1920 px** | Desktop Widescreen | Full HD layout, ambient particle density, 5-column Overview KPI grid, large monospace terminal view. | Particle canvas stretched on window resize without resetting internal buffer resolution. | Added debounced `resize` handler in `fx.js` updating `canvas.width = window.innerWidth`. |

---

## Lane Ownership Verification
- Every file created or modified is strictly inside `web/`:
  - `web/config.js`
  - `web/dashboard.html`
  - `web/index.html`
  - `web/NOTES.md`
  - `web/css/dashboard.css`
  - `web/css/panels.css`
  - `web/js/fx.js`
  - `web/js/sound.js`
  - `web/js/panels/live.js`
  - `web/js/panels/logs.js`
  - `web/js/panels/overview.js`
  - `web/js/panels/about.js`
  - `web/js/panels/replay.js`
- Zero edits outside `web/`.


