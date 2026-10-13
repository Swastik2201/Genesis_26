/**
 * ==========================================================================
 * DECISION AUTOPSY PANEL PLACEHOLDER (panels/autopsy.js)
 * USP 1: Forensic analysis comparing predictions vs actual outcomes.
 * ==========================================================================
 */

import { autopsy } from '../api.js';
import { store } from '../store.js';

export async function mount(container) {
  const currentSession = store.getState().currentSession || 'demo-runner-20261013-001';

  container.innerHTML = `
    <div class="panel-autopsy">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 01 // FORENSIC INVESTIGATION</div>
          <h2 style="margin-bottom: 4px;">DECISION AUTOPSY</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Turn every failed move into an investigation. Explanations framed strictly as hypotheses.</p>
        </div>
        <span class="badge badge-demo">DEMO INVESTIGATION</span>
      </div>

      <div class="hud-card" style="margin-bottom: var(--space-lg);">
        <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap; align-items: center;">
          <span style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted);">FILTER VERDICTS:</span>
          <span class="badge badge-bad">CONFIDENT MISS (1)</span>
          <span class="badge badge-illegal">ILLEGAL MOVE (2)</span>
          <span class="badge badge-cyan">UNCERTAIN MISS (1)</span>
          <span class="badge badge-good">LUCKY HIT (1)</span>
        </div>
      </div>

      <div id="autopsy-list-container" class="hud-card" style="min-height: 300px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
        <div style="font-size: 2rem; margin-bottom: var(--space-xs); color: var(--neon-magenta);">🔍</div>
        <h3 style="color: #fff; margin-bottom: var(--space-xs);">DECISION AUTOPSY ENGINE READY</h3>
        <p style="color: var(--text-secondary); max-width: 540px; margin-bottom: var(--space-md);">
          Full severity-ranked autopsy cards, hypothesis formulations, and "What Laya Predicted" vs "What Happened" will mount here in Prompt 4.
        </p>
        <span class="chip chip-active">Endpoint /api/runs/{id}/autopsy Connected</span>
      </div>
    </div>
  `;
}

export function unmount() {}
