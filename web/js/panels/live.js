/**
 * ==========================================================================
 * LIVE RUN PANEL PLACEHOLDER (panels/live.js)
 * Live decision viewer shell (Hero Screen implemented in Prompt 3).
 * ==========================================================================
 */

import { store } from '../store.js';

let unsubscribe = null;

export function mount(container) {
  const state = store.getState();

  container.innerHTML = `
    <div class="panel-live">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">REAL-TIME INFERENCE STREAM</div>
          <h2 style="margin-bottom: 4px;">LIVE RUN DECISION VIEWER</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Step-by-step state normalisation, Laya question execution, probabilities, and validated actions.</p>
        </div>
        <div style="display: flex; gap: var(--space-sm); align-items: center;">
          <span class="badge ${state.isStreaming ? 'badge-live' : 'badge-cyan'}" id="live-stream-badge">
            ${state.isStreaming ? 'STREAMING ACTIVE' : 'STREAM STANDBY'}
          </span>
          <button id="btn-toggle-stream" class="btn btn-primary btn-sm">
            ${state.isStreaming ? 'PAUSE STREAM' : 'START LIVE STREAM'}
          </button>
        </div>
      </div>

      <!-- Quick Status Card -->
      <div class="hud-card" style="margin-bottom: var(--space-lg);">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-md);">
          <div>
            <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted);">CURRENT DECISION STEP</div>
            <div id="live-step-display" style="font-family: var(--font-heading); font-size: var(--text-xl); font-weight: 800; color: var(--neon-cyan);">
              STEP ${state.stepCount}
            </div>
          </div>
          <div>
            <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted);">ACCUMULATED SCORE</div>
            <div id="live-score-display" style="font-family: var(--font-heading); font-size: var(--text-xl); font-weight: 800; color: var(--neon-green);">
              ${state.score} PTS
            </div>
          </div>
          <div>
            <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted);">LAYA LATENCY</div>
            <div id="live-latency-display" style="font-family: var(--font-mono); font-size: var(--text-lg); font-weight: 700; color: #fff;">
              ${state.latencyMs ? state.latencyMs.toFixed(1) : '30.8'} ms
            </div>
          </div>
          <div>
            <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted);">MODE</div>
            <span class="badge badge-demo">DEMO / MOCK FEEDER</span>
          </div>
        </div>
      </div>

      <!-- Live Stream Placeholder Container -->
      <div id="live-hero-container" class="hud-card" style="min-height: 420px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; border-style: dashed;">
        <div style="font-size: 2.5rem; margin-bottom: var(--space-sm); color: var(--neon-cyan); animation: pulseDot 2s infinite;">⚡</div>
        <h3 style="color: #fff; margin-bottom: var(--space-xs);">LIVE HERO VIEWER READY</h3>
        <p style="max-width: 580px; color: var(--text-secondary); margin-bottom: var(--space-md);">
          The full 3-column Live Run HUD (State ➔ Questions ➔ Probabilities ➔ Selected Move ➔ Game Response) will be mounted here in Prompt 3.
        </p>
        <div style="display: flex; gap: var(--space-sm);">
          <span class="chip chip-active">Contract Schema v1 Active</span>
          <span class="chip">Auto-Replay 800ms Ready</span>
        </div>
      </div>
    </div>
  `;

  unsubscribe = store.subscribe((newState) => {
    const stepEl = document.getElementById('live-step-display');
    const scoreEl = document.getElementById('live-score-display');
    const latencyEl = document.getElementById('live-latency-display');
    const streamBadge = document.getElementById('live-stream-badge');

    if (stepEl) stepEl.textContent = `STEP ${newState.stepCount}`;
    if (scoreEl) scoreEl.textContent = `${newState.score} PTS`;
    if (latencyEl && newState.latencyMs) latencyEl.textContent = `${newState.latencyMs.toFixed(1)} ms`;
    if (streamBadge) {
      streamBadge.className = `badge ${newState.isStreaming ? 'badge-live' : 'badge-cyan'}`;
      streamBadge.textContent = newState.isStreaming ? 'STREAMING ACTIVE' : 'STREAM STANDBY';
    }
  });
}

export function unmount() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
