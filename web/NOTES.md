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

## Accessibility & Performance
- **Reduced Motion Support:** `@media (prefers-reduced-motion: reduce)` globally disables scanning line overlays, cyber grid shifts, typewriter typing pauses, and glitch shakes.
- **Responsive Range:** Fluidly tested and styled from 360px mobile viewports up to 1920px widescreen monitors.
- **Focus Rings:** Explicit `:focus-visible` styling with high-contrast cyan outline and offset.
