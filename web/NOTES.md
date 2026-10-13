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

## Landing Page Features (`web/index.html`)
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

## Accessibility & Performance
- **Reduced Motion Support:** `@media (prefers-reduced-motion: reduce)` globally disables scanning line overlays, cyber grid shifts, typewriter typing pauses, and glitch shakes.
- **Responsive Range:** Fluidly tested and styled from 360px mobile viewports up to 1920px widescreen monitors.
- **Focus Rings:** Explicit `:focus-visible` styling with high-contrast cyan outline and offset.
