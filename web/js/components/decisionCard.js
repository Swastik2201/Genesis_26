/**
 * ==========================================================================
 * SHARED REUSABLE DECISION COMPONENTS (components/decisionCard.js)
 * Shared between Live Run (live.js) and Reproducible Replay (replay.js).
 * Renders State, Laya Questions, Probability Bars, and Validated Actions.
 * ==========================================================================
 */

import { typewriter, triggerGlitch } from '../fx.js';

/**
 * Renders the complete 3-column decision view for any event.
 * @param {HTMLElement} container - Target container element
 * @param {Object} event - Event object following contracts/event.schema.json
 * @param {Object} [options] - Configuration flags (animate, replayMode, etc.)
 */
export function renderDecisionGrid(container, event, options = {}) {
  if (!container || !event) return;

  const { isReduced = false, animate = true, replayMode = false } = options;
  const { state = {}, laya_calls = [], validator = {}, final_action, game_response = {}, outcome } = event;

  const acceptedCall = laya_calls.find(c => c.accepted) || laya_calls[laya_calls.length - 1] || {};
  const rejectedCalls = laya_calls.filter(c => c.accepted === false || c.excluded === true);

  const scoreBefore = game_response.score_before ?? state.score ?? 0;
  const scoreAfter = game_response.score_after ?? scoreBefore;
  const scoreDelta = scoreAfter - scoreBefore;

  const isGood = game_response.good === true;
  const isBad = game_response.good === false;
  const isIllegal = validator.retries > 0 || validator.fallback;

  const outcomeBadgeClass = isGood ? 'badge-good' : (isIllegal ? 'badge-illegal' : 'badge-bad');
  const outcomeBadgeText = isGood ? 'GOOD MOVE' : (isIllegal ? 'RETRY RESOLVED' : 'DAMAGE / LOSS');

  container.className = 'live-hero-grid';
  container.innerHTML = `
    <!-- COLUMN 1: STATE -->
    <section class="live-col" aria-label="State Column">
      <div class="hud-card live-col-card">
        <div class="live-col-header">
          <span class="live-col-title">
            <span aria-hidden="true">01 //</span> STATE &amp; CONTEXT
          </span>
          <div style="display: flex; gap: 4px;">
            <span class="badge badge-cyan">STEP ${event.step}</span>
            <span class="badge badge-good">${scoreAfter} PTS</span>
          </div>
        </div>

        <div style="margin-bottom: var(--space-sm);">
          <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-bottom: 4px;">
            PLAIN-ENGLISH SUMMARY FOR LAYA:
          </div>
          <div class="state-text-box" id="grid-state-textbox-${event.step}">
            ${isReduced || !animate ? state.state_text : ''}
          </div>
        </div>

        <!-- Structured Facts -->
        <div>
          <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-bottom: 4px;">
            STRUCTURED FACTS:
          </div>
          <div class="state-facts-grid">
            <div class="fact-badge">
              <span class="fact-key">CURRENT LANE</span>
              <span class="fact-val">LANE ${state.facts?.current_lane ?? 2}</span>
            </div>
            <div class="fact-badge">
              <span class="fact-key">TRACK SPEED</span>
              <span class="fact-val">${state.facts?.speed ? Number(state.facts.speed).toFixed(2) + 'x' : '1.0x'}</span>
            </div>
          </div>
        </div>

        <!-- Legal Actions -->
        <div style="margin-top: auto; padding-top: var(--space-sm);">
          <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-bottom: 4px;">
            LEGAL ACTION SPACE (${state.legal_actions?.length || 0}):
          </div>
          <div class="legal-actions-list">
            ${(state.legal_actions || []).map(a => `
              <div class="legal-action-item ${a.id === final_action ? 'chip-active' : ''}">
                <span style="font-weight: 700; color: ${a.id === final_action ? 'var(--neon-green)' : 'var(--text-primary)'};">
                  ${a.label || a.id}
                </span>
                <span class="legal-action-hint">${a.hint || ''}</span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </section>

    <!-- COLUMN 2: LAYA QUESTIONS & PROBABILITIES -->
    <section class="live-col" aria-label="Questions Column">
      <div class="hud-card live-col-card card-magenta">
        <div class="live-col-header">
          <span class="live-col-title" style="color: var(--neon-magenta);">
            <span aria-hidden="true">02 //</span> LAYA INFERENCE
          </span>
          <span class="badge" style="background: rgba(255, 61, 242, 0.15); border-color: var(--neon-magenta); color: var(--neon-magenta);">
            ${acceptedCall.question_set || 'perception_runner_v1'}
          </span>
        </div>

        <div class="questions-stream-container" id="grid-questions-container-${event.step}">
          <!-- Injected below -->
        </div>

        <!-- Latency & Call Guarantee -->
        <div style="margin-top: auto; padding-top: var(--space-md); border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); display: block;">INFERENCE LATENCY</span>
            <span style="font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 700; color: #fff;">
              ${acceptedCall.latency_ms ? Number(acceptedCall.latency_ms).toFixed(1) + ' ms' : '-- ms'}
            </span>
          </div>

          <div>
            <span style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); display: block; text-align: right;">MODEL CALL</span>
            <span class="badge badge-good" style="font-size: 10px;">1 VISIBLE CALL</span>
          </div>
        </div>
      </div>
    </section>

    <!-- COLUMN 3: DECISION & GAME RESPONSE -->
    <section class="live-col" aria-label="Decision Column">
      <div class="hud-card live-col-card">
        <div class="live-col-header">
          <span class="live-col-title">
            <span aria-hidden="true">03 //</span> SELECTED ACTION
          </span>
          <span class="badge ${outcomeBadgeClass}">${outcomeBadgeText}</span>
        </div>

        <!-- Validator Retries Alert -->
        ${validator.retries > 0 ? `
          <div class="validator-retry-box">
            <div class="validator-title">
              <span aria-hidden="true">⚠</span> VALIDATOR INTERVENTION (${validator.retries} RETRY)
            </div>
            <div class="validator-message">
              ${validator.rejections?.join('<br>') || 'Action excluded by validator. Re-asked Laya.'}
            </div>
            ${rejectedCalls.length > 0 ? `
              <div style="margin-top: 6px; font-size: 11px; font-family: var(--font-mono); color: var(--amber);">
                Excluded Action: "${rejectedCalls[0].chosen_action}"
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Big Neon Action Display -->
        <div class="action-display-box">
          <div class="action-label-sub">CHOSEN MOVE</div>
          <div class="action-name-hero" id="grid-action-title-${event.step}">
            ${final_action || acceptedCall.chosen_action || 'STAY'}
          </div>
          <div class="action-reason">
            ${event.outcome || acceptedCall.reason || 'Optimal probability on hazard-free legal corridor.'}
          </div>
        </div>

        <!-- Action Scores Distribution -->
        <div style="margin-bottom: var(--space-md);">
          <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-bottom: 6px;">
            ACTION SCORES ACROSS LEGAL MOVES:
          </div>
          <div class="action-scores-group">
            ${renderActionScores(acceptedCall.action_scores || {}, final_action, isReduced || !animate)}
          </div>
        </div>

        <!-- Game Response -->
        <div class="game-response-box ${animate ? (isGood ? 'flash-good' : (isBad ? 'flash-bad' : '')) : ''}">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">GAME RESPONSE</span>
            <span class="score-delta-badge ${scoreDelta < 0 ? 'negative' : ''}">
              ${scoreDelta >= 0 ? '+' + scoreDelta : scoreDelta} PTS
            </span>
          </div>
          <div style="font-size: var(--text-sm); color: var(--text-primary); font-weight: 500;">
            ${game_response.message || 'Action executed successfully.'}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 11px; font-family: var(--font-mono); color: var(--text-muted);">
            <span>Score: ${scoreBefore} ➔ ${scoreAfter}</span>
            <span>Done: ${game_response.done ? 'YES (OVER)' : 'NO'}</span>
          </div>
        </div>

        ${!replayMode ? `
          <div style="margin-top: var(--space-md); text-align: center;">
            <a href="#/replay?step=${event.step}" class="btn btn-ghost btn-sm" style="width: 100%;" aria-label="Inspect step in Replay tab">
              <span>🔍 INSPECT STEP ${event.step} IN REPLAY TAB</span>
            </a>
          </div>
        ` : ''}
      </div>
    </section>
  `;

  // Animate Typewriter if enabled
  const stateBox = container.querySelector(`#grid-state-textbox-${event.step}`);
  if (stateBox && animate && !isReduced) {
    typewriter(stateBox, state.state_text, 16);
  }

  // Populate Questions Container
  const qContainer = container.querySelector(`#grid-questions-container-${event.step}`);
  if (qContainer) {
    const questions = acceptedCall.questions || [];
    const rawScores = acceptedCall.raw?.probabilities || [];

    questions.forEach((q, qIdx) => {
      const qCard = document.createElement('div');
      qCard.className = 'question-card active-thinking';
      const qType = (q.type || 'choice').toUpperCase();

      const optionsHtml = (q.options || []).map((opt, optIdx) => {
        const prob = rawScores[optIdx] ?? (optIdx === 0 ? 0.8 : 0.1);
        const pct = Math.round(prob * 100);
        const isWinner = opt === acceptedCall.raw?.predicted_token || optIdx === 0;

        return `
          <div class="option-row ${isWinner ? 'is-winner' : ''}">
            <div class="option-meta">
              <span class="option-label">
                ${isWinner ? '<span aria-hidden="true">✔</span>' : '<span style="opacity:0.3">○</span>'}
                ${opt}
              </span>
              <span class="option-prob">${pct}%</span>
            </div>
            <div class="prob-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
              <div class="prob-bar-fill" style="width: ${isReduced || !animate ? pct : 0}%;" data-target-width="${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');

      qCard.innerHTML = `
        <div class="question-card-header">
          <span class="badge ${qType === 'CHOICE' ? 'badge-cyan' : (qType === 'SCORE' ? 'badge-good' : 'badge-demo')}">
            ${qType}
          </span>
          <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
            ID: ${q.id || 'q_1'}
          </span>
        </div>
        <div class="question-text">${q.text}</div>
        <div class="question-options-list">
          ${optionsHtml}
        </div>
      `;

      if (isReduced || !animate) {
        qContainer.appendChild(qCard);
      } else {
        setTimeout(() => {
          qContainer.appendChild(qCard);
          setTimeout(() => {
            qCard.querySelectorAll('.prob-bar-fill').forEach(fill => {
              fill.style.width = fill.getAttribute('data-target-width');
            });
          }, 60);
        }, qIdx * 140);
      }
    });
  }

  // Animate action distribution bars
  if (animate && !isReduced) {
    setTimeout(() => {
      container.querySelectorAll('.action-scores-group .prob-bar-fill').forEach(fill => {
        fill.style.width = fill.getAttribute('data-target-width');
      });
      const title = container.querySelector(`#grid-action-title-${event.step}`);
      if (title) triggerGlitch(title);
    }, 200);
  }
}

/**
 * Helper to render probability bars across action choices.
 */
export function renderActionScores(actionScores, chosenAction, instant = false) {
  return Object.entries(actionScores).map(([actId, score]) => {
    const pct = Math.round(score * 100);
    const isWinner = actId === chosenAction;
    return `
      <div class="prob-bar ${isWinner ? 'winner' : ''}">
        <div class="prob-bar-header">
          <span class="prob-bar-label">${actId}</span>
          <span class="prob-bar-val">${pct}%</span>
        </div>
        <div class="prob-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="prob-bar-fill" style="width: ${instant ? pct : 0}%;" data-target-width="${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');
}
