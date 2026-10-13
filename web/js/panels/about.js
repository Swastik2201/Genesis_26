/**
 * ==========================================================================
 * ABOUT & SYSTEM ARCHITECTURE PANEL (panels/about.js)
 * Rules, team lanes, and project specifications.
 * ==========================================================================
 */

export function mount(container) {
  container.innerHTML = `
    <div class="panel-about">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg);">
        <div class="section-tag">PROJECT SPECIFICATION</div>
        <h2 style="margin-bottom: 4px;">ABOUT BEAT THE BOT</h2>
        <p style="color: var(--text-muted); margin-bottom: 0;">Autonomous game decision layer built around the Laya model for hackathon auditing.</p>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-lg); margin-bottom: var(--space-xl);">
        <div class="hud-card">
          <h3 style="color: #fff; font-size: var(--text-base); margin-bottom: var(--space-sm);">CORE TEAM ARCHITECTURE</h3>
          <ul style="list-style: none; display: flex; flex-direction: column; gap: var(--space-sm); font-size: var(--text-sm);">
            <li style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px;">
              <strong style="color: var(--neon-cyan);">Member A:</strong> Game Integration (Adapters, Normaliser, Validator, Loop)
            </li>
            <li style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px;">
              <strong style="color: var(--neon-magenta);">Member B:</strong> Laya Engine &amp; Experiments (Laya client, Question sets, Calibration)
            </li>
            <li style="border-bottom: 1px solid var(--border-subtle); padding-bottom: 6px;">
              <strong style="color: var(--neon-green);">Member C:</strong> Frontend Dashboard (Gamer HUD, Live View, USPs, Replay)
            </li>
            <li>
              <strong style="color: var(--amber);">Member D:</strong> Contracts, Logger, Server, Autopsy, and Evidence Verification
            </li>
          </ul>
        </div>

        <div class="hud-card card-magenta">
          <h3 style="color: #fff; font-size: var(--text-base); margin-bottom: var(--space-sm);">NON-NEGOTIABLE INTEGRITY RULES</h3>
          <ul style="list-style: none; display: flex; flex-direction: column; gap: var(--space-xs); font-size: var(--text-sm); color: var(--text-secondary);">
            <li>⚡ <strong>Laya Exclusive:</strong> Only Laya selects game moves. No hardcoded heuristics or chatbots.</li>
            <li>⚡ <strong>One Visible Call:</strong> Exactly one logged model inference call per submitted move.</li>
            <li>⚡ <strong>Zero Fabrication:</strong> Missing values remain null; demo mock values are clearly labeled DEMO.</li>
            <li>⚡ <strong>Immutable Records:</strong> Append-only event lines flushed and hashed with SHA-256.</li>
          </ul>
        </div>
      </div>

      <div class="hud-card" style="text-align: center;">
        <p style="margin-bottom: 4px; color: var(--text-primary); font-weight: 600;">
          Decision model created by Nandakishor M.
        </p>
        <p style="margin-bottom: 0; font-size: var(--text-xs); color: var(--text-muted);">
          UI architecture inspired by <a href="https://brainfunctioncollapse.com/laya" target="_blank" rel="noopener noreferrer">brainfunctioncollapse.com/laya</a>.
        </p>
      </div>
    </div>
  `;
}

export function unmount() {}
