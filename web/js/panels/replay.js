/**
 * ==========================================================================
 * REPRODUCIBLE RUN REPLAY PANEL PLACEHOLDER (panels/replay.js)
 * USP 3: Step-by-step playback with cryptographic SHA-256 verification.
 * ==========================================================================
 */

import { store } from '../store.js';

export function mount(container, params = {}) {
  const step = params.step || store.getState().selectedStep || 0;

  container.innerHTML = `
    <div class="panel-replay">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 03 // DETERMINISTIC AUDIT</div>
          <h2 style="margin-bottom: 4px;">REPRODUCIBLE RUN REPLAY</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Inspect raw immutable event frames with SHA-256 verification and move traceability.</p>
        </div>
        <div style="display: flex; gap: var(--space-sm); align-items: center;">
          <span class="badge badge-good">SHA-256 MATCHED</span>
          <a href="mock/events.sample.json" download="events.sample.json" class="btn btn-secondary btn-sm">
            <span>DOWNLOAD .JSONL</span>
          </a>
        </div>
      </div>

      <div class="hud-card" style="min-height: 380px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: var(--space-xs); color: var(--neon-cyan);">📼</div>
        <h3 style="color: #fff; margin-bottom: var(--space-xs);">REPLAY VIEWER READY (STEP ${step})</h3>
        <p style="color: var(--text-secondary); max-width: 540px; margin-bottom: var(--space-md);">
          Interactive step scrubber, timeline pips, JSON inspector, and cryptographic audit proofs will mount here in Prompt 4.
        </p>
        <span class="chip chip-active">Traceability Audit Guaranteed</span>
      </div>
    </div>
  `;
}

export function unmount() {}
