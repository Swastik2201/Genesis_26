/**
 * ==========================================================================
 * BEAT THE BOT — DECISION AUTOPSY PANEL (panels/autopsy.js)
 * USP 1: Turn every failed move into an investigation.
 * Compares "What Laya Predicted" vs "What Happened", with hypotheses.
 * ==========================================================================
 */

import { store } from '../store.js';
import * as api from '../api.js';

let activeFilter = 'all';
let currentAutopsyData = null;
let currentEventsMap = new Map();
let currentContainer = null;

const VERDICT_META = {
  all: { label: 'ALL VERDICTS', colorClass: 'badge-cyan' },
  confident_miss: { label: 'CONFIDENT MISS', colorClass: 'badge-bad' },
  illegal_move: { label: 'ILLEGAL MOVE', colorClass: 'badge-illegal' },
  uncertain_miss: { label: 'UNCERTAIN MISS', colorClass: 'badge-cyan' },
  lucky_hit: { label: 'LUCKY HIT', colorClass: 'badge-good' },
  game_over: { label: 'GAME OVER', colorClass: 'badge-bad' },
  as_predicted: { label: 'AS PREDICTED', colorClass: 'badge-good' }
};

export async function mount(container) {
  currentContainer = container;
  const state = store.getState();
  const sessionId = state.currentSession || 'demo-runner-20261013-001';

  // Render initial loading skeleton
  container.innerHTML = `
    <div class="panel-autopsy">
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 01 // FORENSIC INVESTIGATION</div>
          <h2 style="margin-bottom: 4px;">DECISION AUTOPSY</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Turn failed moves into scientific investigations. Explanations framed strictly as testable hypotheses.</p>
        </div>
        <span class="badge ${state.isMockMode ? 'badge-demo' : 'badge-cyan'}">
          ${state.isMockMode ? 'DEMO INVESTIGATION' : 'LIVE AUDIT'}
        </span>
      </div>
      <div class="hud-card" style="text-align: center; padding: var(--space-2xl);">
        <div style="font-size: 2rem; color: var(--neon-cyan); margin-bottom: var(--space-sm); animation: pulseDot 1.4s infinite;">🔍</div>
        <p style="color: var(--text-secondary);">Loading forensic autopsy items for session ${sessionId}...</p>
      </div>
    </div>
  `;

  try {
    const [autopsyRes, eventsRes] = await Promise.all([
      api.autopsy(sessionId),
      api.events(sessionId, 0, 100)
    ]);

    currentAutopsyData = autopsyRes;
    const eventsList = eventsRes?.events || [];
    currentEventsMap = new Map(eventsList.map(e => [e.step, e]));

    renderAutopsyUI(container);
  } catch (err) {
    console.error('[Autopsy] Error loading autopsy data:', err);
    container.innerHTML = `
      <div class="hud-card" style="border-color: var(--red); padding: var(--space-xl); text-align: center;">
        <h3 style="color: var(--red);">FAILED TO LOAD AUTOPSY DATA</h3>
        <p style="color: var(--text-secondary);">${err.message}</p>
        <button id="btn-retry-autopsy" class="btn btn-primary btn-sm">RETRY</button>
      </div>
    `;
    const btn = container.querySelector('#btn-retry-autopsy');
    if (btn) btn.addEventListener('click', () => mount(container));
  }
}

export function unmount() {
  currentContainer = null;
  currentAutopsyData = null;
  currentEventsMap.clear();
}

/**
 * Renders the full Autopsy interface once data is available.
 */
function renderAutopsyUI(container) {
  const items = currentAutopsyData?.items || [];
  const summary = currentAutopsyData?.summary || {};

  // Sort items by severity descending (highest severity / confident_miss first)
  const sortedItems = [...items].sort((a, b) => {
    // Primary sort: severity
    const sevA = a.severity ?? (a.verdict === 'confident_miss' ? 0.9 : 0.5);
    const sevB = b.severity ?? (b.verdict === 'confident_miss' ? 0.9 : 0.5);
    return sevB - sevA;
  });

  // Identify Worst 5 Decisions
  const worst5 = sortedItems.slice(0, 5);

  container.innerHTML = `
    <div class="panel-autopsy">
      <!-- Title & Header -->
      <div class="panel-header-row" style="margin-bottom: var(--space-lg); display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: var(--space-md);">
        <div>
          <div class="section-tag">USP 01 // FORENSIC INVESTIGATION</div>
          <h2 style="margin-bottom: 4px;">DECISION AUTOPSY</h2>
          <p style="color: var(--text-muted); margin-bottom: 0;">Turn failed moves into scientific investigations. Explanations framed strictly as testable hypotheses.</p>
        </div>
        <div style="display: flex; gap: var(--space-xs);">
          <span class="badge badge-cyan">${items.length} INVESTIGATED STEPS</span>
          <span class="badge ${store.getState().isMockMode ? 'badge-demo' : 'badge-good'}">
            ${store.getState().isMockMode ? 'DEMO DATA' : 'AUDITED'}
          </span>
        </div>
      </div>

      <!-- 1. Worst 5 Decisions Banner -->
      <div class="autopsy-worst-banner">
        <div class="worst-banner-left">
          <div class="worst-banner-icon" aria-hidden="true">🚨</div>
          <div>
            <div class="worst-banner-title">CRITICAL INCIDENT HOTLIST (WORST 5 DECISIONS)</div>
            <p class="worst-banner-desc">
              Decisions with high model confidence or severe gameplay penalty. Click any step to inspect forensic report:
            </p>
          </div>
        </div>

        <div class="worst-pills-list">
          ${worst5.map(w => `
            <button class="worst-step-pill" data-step="${w.step}">
              STEP ${w.step} • ${w.verdict.toUpperCase().replace('_', ' ')}
            </button>
          `).join('')}
        </div>
      </div>

      <!-- 2. Verdict Filter Chips Summary Row -->
      <div class="autopsy-filter-bar" role="tablist" aria-label="Filter autopsy by verdict">
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); text-transform: uppercase;">FILTER VERDICTS:</span>
        <button class="filter-chip-btn ${activeFilter === 'all' ? 'is-active' : ''}" data-verdict="all">
          <span>ALL (${items.length})</span>
        </button>

        ${Object.entries(summary).map(([verdictKey, count]) => {
          if (verdictKey === 'total_steps') return '';
          const meta = VERDICT_META[verdictKey] || { label: verdictKey.toUpperCase(), colorClass: 'badge-cyan' };
          return `
            <button class="filter-chip-btn ${activeFilter === verdictKey ? 'is-active' : ''}" data-verdict="${verdictKey}">
              <span class="badge ${meta.colorClass}" style="padding: 1px 6px; font-size: 10px;">${count}</span>
              <span>${meta.label}</span>
            </button>
          `;
        }).join('')}
      </div>

      <!-- 3. List of Autopsy Cases -->
      <div id="autopsy-cases-list">
        <!-- Rendered by renderCasesList() -->
      </div>
    </div>
  `;

  // Bind filter buttons
  container.querySelectorAll('.filter-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-chip-btn').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      activeFilter = btn.getAttribute('data-verdict');
      renderCasesList(container, sortedItems);
    });
  });

  // Bind worst 5 buttons
  container.querySelectorAll('.worst-step-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const step = Number(pill.getAttribute('data-step'));
      const targetCard = document.getElementById(`case-card-step-${step}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
        targetCard.classList.add('active-highlight');
        setTimeout(() => targetCard.classList.remove('active-highlight'), 1800);
      }
    });
  });

  renderCasesList(container, sortedItems);
}

/**
 * Renders the filtered cases list.
 */
function renderCasesList(container, sortedItems) {
  const listEl = container.querySelector('#autopsy-cases-list');
  if (!listEl) return;

  const filtered = activeFilter === 'all' 
    ? sortedItems 
    : sortedItems.filter(item => item.verdict === activeFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="hud-card" style="text-align: center; padding: var(--space-xl);">
        <p style="color: var(--text-muted); margin-bottom: 0;">No autopsy cases match filter: "${activeFilter}".</p>
      </div>
    `;
    return;
  }

  listEl.innerHTML = filtered.map(item => {
    const event = currentEventsMap.get(item.step) || {};
    const state = event.state || {};
    const gameResp = event.game_response || {};
    const lastCall = event.laya_calls?.[event.laya_calls.length - 1] || {};
    const question = lastCall.questions?.[0] || { text: 'Which action should we take?' };
    const probabilities = item.probabilities || lastCall.action_scores || {};

    const sev = item.severity ?? 0.5;
    const sevClass = sev >= 0.7 ? 'severity-high' : (sev >= 0.4 ? 'severity-med' : 'severity-low');
    const meta = VERDICT_META[item.verdict] || { label: item.verdict, colorClass: 'badge-cyan' };

    return `
      <article class="hud-card autopsy-case-card ${sevClass}" id="case-card-step-${item.step}">
        <!-- Case Top Header -->
        <div class="case-header-row">
          <div class="case-step-title">
            <span>STEP ${item.step}</span>
            <span class="badge ${meta.colorClass}">${meta.label}</span>
          </div>

          <div style="display: flex; align-items: center; gap: var(--space-sm);">
            <div style="display: flex; align-items: center; gap: 6px; font-family: var(--font-mono); font-size: 11px;">
              <span style="color: var(--text-muted);">SEVERITY:</span>
              <span style="font-weight: 700; color: ${sev >= 0.7 ? 'var(--red)' : (sev >= 0.4 ? 'var(--amber)' : 'var(--neon-cyan)')};">
                ${(sev * 100).toFixed(0)}%
              </span>
            </div>
            <a href="#/replay?step=${item.step}" class="btn btn-primary btn-sm" aria-label="Open step in replay">
              <span>OPEN IN REPLAY ➔</span>
            </a>
          </div>
        </div>

        <!-- Normalized State Summary -->
        <div style="margin-bottom: var(--space-md); background: rgba(7, 6, 15, 0.5); padding: 8px 12px; border-radius: var(--radius-xs); border: 1px solid var(--border-subtle);">
          <span style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); display: block; margin-bottom: 2px;">
            STATE CONTEXT AT STEP ${item.step}:
          </span>
          <p style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-primary); margin-bottom: 0;">
            ${state.state_text || `Runner approaching track marker at Step ${item.step}.`}
          </p>
        </div>

        <!-- Side-by-Side: What Laya Predicted vs What Happened -->
        <div class="autopsy-comparison-grid">
          <!-- Left: What Laya Predicted -->
          <div class="investigation-box predicted">
            <div class="investigation-box-title">
              <span>WHAT LAYA PREDICTED</span>
              <span class="badge badge-cyan" style="font-size: 9px;">MODEL REASONING</span>
            </div>

            <div style="font-size: var(--text-xs); color: #fff; font-weight: 600; margin-bottom: 6px;">
              "${question.text}"
            </div>

            <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-bottom: 4px;">
              PROBABILITY DISTRIBUTION:
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 8px;">
              ${Object.entries(probabilities).map(([actId, prob]) => {
                const pct = Math.round(prob * 100);
                const isTop = actId === (lastCall.chosen_action || event.final_action);
                return `
                  <div class="prob-bar ${isTop ? 'winner' : ''}">
                    <div class="prob-bar-header" style="font-size: 11px;">
                      <span class="prob-bar-label">${actId}</span>
                      <span class="prob-bar-val">${pct}%</span>
                    </div>
                    <div class="prob-bar-track" style="height: 6px;">
                      <div class="prob-bar-fill" style="width: ${pct}%;"></div>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>

            <div style="margin-top: auto; font-size: var(--text-xs); color: var(--text-secondary); border-top: 1px solid var(--border-subtle); padding-top: 6px;">
              <strong>Expected:</strong> ${item.expected || 'Safe trajectory based on highest probability.'}
            </div>
          </div>

          <!-- Right: What Actually Happened -->
          <div class="investigation-box actual">
            <div class="investigation-box-title">
              <span>WHAT HAPPENED</span>
              <span class="badge ${gameResp.good ? 'badge-good' : 'badge-bad'}" style="font-size: 9px;">
                ${gameResp.good ? 'SUCCESS' : 'FAILURE'}
              </span>
            </div>

            <div style="font-family: var(--font-heading); font-size: var(--text-lg); font-weight: 800; color: ${gameResp.good ? 'var(--neon-green)' : 'var(--red)'}; margin-bottom: 4px;">
              ${event.final_action || 'ACTION COMPLETED'}
            </div>

            <div style="display: flex; gap: var(--space-sm); align-items: center; margin-bottom: 8px;">
              <span class="badge ${gameResp.good ? 'badge-good' : 'badge-bad'}">
                ${gameResp.score_after !== undefined ? (gameResp.score_after - (gameResp.score_before || 0)) : 0} PTS
              </span>
              <span style="font-family: var(--font-mono); font-size: var(--text-xs); color: var(--text-secondary);">
                Score: ${gameResp.score_before ?? 0} ➔ ${gameResp.score_after ?? 0}
              </span>
            </div>

            <div style="font-size: var(--text-xs); color: var(--text-primary); line-height: 1.4; margin-bottom: 8px;">
              <strong>Game Result:</strong> ${gameResp.message || 'Action executed by game server.'}
            </div>

            <div style="margin-top: auto; font-size: var(--text-xs); color: var(--text-secondary); border-top: 1px solid var(--border-subtle); padding-top: 6px;">
              <strong>Actual:</strong> ${item.actual || event.outcome || 'Event outcome recorded.'}
            </div>
          </div>
        </div>

        <!-- Forensic Hypothesis Note Box -->
        <div class="forensic-hypothesis-box">
          <div class="hypothesis-tag">
            <span aria-hidden="true">🔬</span> FORENSIC HYPOTHESIS &amp; AUDIT NOTE:
          </div>
          <p style="margin-bottom: 0;">
            ${item.note || 'Hypothesis: question formulation lacked distance constraints.'}
          </p>
        </div>

        <!-- Case Footer -->
        <div class="case-card-footer">
          <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
            SESSION: ${event.session_id || 'demo-runner-001'} • TIMESTAMP: ${event.ts || 'UTC'}
          </div>
          <a href="#/replay?step=${item.step}" class="btn btn-ghost btn-sm">
            <span>INSPECT STEP ${item.step} IN REPLAY</span>
          </a>
        </div>
      </article>
    `;
  }).join('');
}
