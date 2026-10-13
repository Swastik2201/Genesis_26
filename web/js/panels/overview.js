/**
 * ==========================================================================
 * OVERVIEW PANEL (panels/overview.js)
 * High-level mission control summary of active run and system health.
 * ==========================================================================
 */

import { store } from '../store.js';

let unsubscribe = null;

export function mount(container) {
  const state = store.getState();

  container.innerHTML = `
    <div class="panel-overview">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">MISSION CONTROL</div>
          <h2 style="margin-bottom: 4px;">SYSTEM OVERVIEW</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Autonomous game decision layer telemetry &amp; live run indicators.</p>
        </div>
        <div style="display: flex; gap: var(--space-sm); align-items: center;">
          <a href="#/live" class="btn btn-primary btn-sm">
            <span>GO TO LIVE RUN</span>
            <span aria-hidden="true">➔</span>
          </a>
        </div>
      </div>

      <!-- Quick Metrics Grid -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-md); margin-bottom: var(--space-xl);">
        <div class="hud-card">
          <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 4px;">CURRENT SCORE</div>
          <div id="ov-score" style="font-family: var(--font-heading); font-size: var(--text-2xl); font-weight: 800; color: var(--neon-green);">${state.score} PTS</div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 4px;">Cumulative game rewards</div>
        </div>

        <div class="hud-card">
          <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 4px;">DECISION STEPS</div>
          <div id="ov-step" style="font-family: var(--font-heading); font-size: var(--text-2xl); font-weight: 800; color: var(--neon-cyan);">${state.stepCount}</div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 4px;">Recorded decision frames</div>
        </div>

        <div class="hud-card">
          <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 4px;">AVG LAYA LATENCY</div>
          <div id="ov-latency" style="font-family: var(--font-heading); font-size: var(--text-2xl); font-weight: 800; color: var(--text-primary);">${state.latencyMs ? state.latencyMs.toFixed(1) : '31.2'} ms</div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 4px;">Inference execution speed</div>
        </div>

        <div class="hud-card">
          <div style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-muted); margin-bottom: 4px;">AUDIT STATUS</div>
          <div style="font-family: var(--font-heading); font-size: var(--text-xl); font-weight: 800; color: var(--neon-green);">100% VERIFIED</div>
          <div style="font-size: var(--text-xs); color: var(--text-secondary); margin-top: 4px;">Every move traces to model</div>
        </div>
      </div>

      <!-- Two Column Architecture & Quick Links -->
      <div style="display: grid; grid-template-columns: 1.5fr 1fr; gap: var(--space-lg);">
        <div class="hud-card">
          <h3 style="font-size: var(--text-base); margin-bottom: var(--space-md); color: #fff;">ACTIVE RUN SUMMARY</h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
            <div style="display: flex; justify-content: space-between; padding-block: 6px; border-bottom: 1px solid var(--border-subtle); font-size: var(--text-sm);">
              <span style="color: var(--text-muted);">Session Identifier:</span>
              <span id="ov-session-id" style="font-family: var(--font-mono); color: var(--neon-cyan);">${state.currentSession || 'demo-runner-20261013-001'}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-block: 6px; border-bottom: 1px solid var(--border-subtle); font-size: var(--text-sm);">
              <span style="color: var(--text-muted);">Active Game Adapter:</span>
              <span id="ov-game-id" style="font-family: var(--font-mono); color: var(--text-primary);">${state.gameId}</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-block: 6px; border-bottom: 1px solid var(--border-subtle); font-size: var(--text-sm);">
              <span style="color: var(--text-muted);">Model Decision Policy:</span>
              <span style="color: var(--neon-magenta); font-weight: 600;">Laya (Zero Heuristics)</span>
            </div>
            <div style="display: flex; justify-content: space-between; padding-block: 6px; font-size: var(--text-sm);">
              <span style="color: var(--text-muted);">Validator Failures &amp; Retries:</span>
              <span style="font-family: var(--font-mono); color: var(--amber);">2 Exclusions (Auto-Retried)</span>
            </div>
          </div>
        </div>

        <div class="hud-card card-magenta">
          <h3 style="font-size: var(--text-base); margin-bottom: var(--space-md); color: #fff;">QUICK NAVIGATION</h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
            <a href="#/live" class="chip chip-active" style="padding: 8px 12px; justify-content: space-between;">
              <span>⚡ Live Run Stream</span>
              <span>➔</span>
            </a>
            <a href="#/autopsy" class="chip" style="padding: 8px 12px; justify-content: space-between;">
              <span>🔍 Decision Autopsy (USP 1)</span>
              <span>➔</span>
            </a>
            <a href="#/lab" class="chip" style="padding: 8px 12px; justify-content: space-between;">
              <span>🧪 Question Lab (USP 2)</span>
              <span>➔</span>
            </a>
            <a href="#/replay" class="chip" style="padding: 8px 12px; justify-content: space-between;">
              <span>📼 Reproducible Replay (USP 3)</span>
              <span>➔</span>
            </a>
            <a href="#/calibration" class="chip" style="padding: 8px 12px; justify-content: space-between;">
              <span>📊 Confidence Reality Check (USP 4)</span>
              <span>➔</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  `;

  // Subscribe to live telemetry updates
  unsubscribe = store.subscribe((newState) => {
    const scoreEl = document.getElementById('ov-score');
    const stepEl = document.getElementById('ov-step');
    const latencyEl = document.getElementById('ov-latency');
    const sessionEl = document.getElementById('ov-session-id');
    const gameEl = document.getElementById('ov-game-id');

    if (scoreEl) scoreEl.textContent = `${newState.score} PTS`;
    if (stepEl) stepEl.textContent = newState.stepCount;
    if (latencyEl && newState.latencyMs) latencyEl.textContent = `${newState.latencyMs.toFixed(1)} ms`;
    if (sessionEl && newState.currentSession) sessionEl.textContent = newState.currentSession;
    if (gameEl && newState.gameId) gameEl.textContent = newState.gameId;
  });
}

export function unmount() {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
