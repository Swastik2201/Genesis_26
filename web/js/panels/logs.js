/**
 * ==========================================================================
 * RUN LOGS PANEL PLACEHOLDER (panels/logs.js)
 * Raw JSONL session logs inspection and download center.
 * ==========================================================================
 */

import { store } from '../store.js';

export function mount(container) {
  const state = store.getState();

  container.innerHTML = `
    <div class="panel-logs">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">RAW TELEMETRY</div>
          <h2 style="margin-bottom: 4px;">SYSTEM &amp; RUN LOGS</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Immutable .jsonl event audit lines and session summaries.</p>
        </div>
        <div style="display: flex; gap: var(--space-sm);">
          <a href="mock/events.sample.json" download="events.sample.json" class="btn btn-primary btn-sm">
            <span>EXPORT JSONL</span>
          </a>
        </div>
      </div>

      <div class="hud-card" style="min-height: 380px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
        <div style="font-size: 2.2rem; margin-bottom: var(--space-xs); color: var(--neon-cyan);">📋</div>
        <h3 style="color: #fff; margin-bottom: var(--space-xs);">LOG ARCHIVE READY</h3>
        <p style="color: var(--text-secondary); max-width: 540px; margin-bottom: var(--space-md);">
          Real-time terminal-style JSONL viewer with text search, regex filter, and secret redaction badges will mount here in Prompt 5.
        </p>
        <span class="chip chip-active">${state.events.length || 40} Events Loaded</span>
      </div>
    </div>
  `;
}

export function unmount() {}
