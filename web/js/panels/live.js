/**
 * ==========================================================================
 * BEAT THE BOT — LIVE RUN HERO PANEL (panels/live.js)
 * Real-time inference viewer: State ➔ Questions ➔ Probabilities ➔ Chosen Move.
 * Full gamer HUD aesthetic with playback controls and step timeline.
 * ==========================================================================
 */

import { store } from '../store.js';
import * as api from '../api.js';
import { typewriter, animateCounter, triggerGlitch } from '../fx.js';

let streamController = null;
let storeUnsubscribe = null;
let currentDisplayedStep = null;
let isFollowLive = true;
let isPaused = false;
let playbackSpeed = 800; // ms per step
let currentContainer = null;

const prefersReducedMotion = () => {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Mounts the Live Run hero screen into the target container.
 */
export async function mount(container) {
  currentContainer = container;
  const state = store.getState();

  // Reset local controller state
  isFollowLive = true;
  isPaused = !state.isStreaming;

  renderShell(container);
  bindControls(container);

  // If we already have events in store, render the latest one or selected
  if (state.events.length > 0) {
    const targetStep = state.selectedStep !== null 
      ? state.selectedStep 
      : state.events[state.events.length - 1].step;
    renderStep(targetStep, false);
  } else {
    // Show waiting state
    showWaitingState(container);
  }

  // Subscribe to store updates
  storeUnsubscribe = store.subscribe((newState, prevState) => {
    updateTimelineStrip(newState.events, currentDisplayedStep);

    // If following live and new events arrive, render latest
    if (isFollowLive && newState.latestEvent) {
      if (!prevState || !prevState.latestEvent || newState.latestEvent.step !== prevState.latestEvent.step) {
        renderStep(newState.latestEvent.step, true);
      }
    }

    // Update play/pause button state visually
    const playPauseBtn = document.getElementById('live-btn-play');
    if (playPauseBtn) {
      playPauseBtn.innerHTML = newState.isStreaming 
        ? '<span>⏸ PAUSE</span>' 
        : '<span>▶ PLAY LIVE</span>';
    }
  });

  // Automatically initiate stream if not currently active
  if (!state.isStreaming) {
    startStream();
  }
}

/**
 * Unmounts the Live Run panel and cleans up listeners and streams.
 */
export function unmount() {
  if (storeUnsubscribe) {
    storeUnsubscribe();
    storeUnsubscribe = null;
  }
  if (streamController) {
    streamController.close();
    streamController = null;
  }
  currentContainer = null;
}

/**
 * Starts or restarts the live stream via api.stream().
 */
function startStream() {
  if (streamController) {
    streamController.close();
  }

  const sessionId = store.getState().currentSession || 'latest';

  streamController = api.stream(sessionId, (event) => {
    // Event automatically added to store in api.js
    hideWaitingState();
  }, (err) => {
    showErrorState(err);
  });
}

/**
 * Renders the top-level HTML skeleton of the Live Run screen.
 */
function renderShell(container) {
  container.innerHTML = `
    <div class="panel-live-hero" id="live-hero-root">
      <!-- 1. Top Controls Toolbar -->
      <div class="live-toolbar">
        <div class="live-controls-group">
          <button id="live-btn-play" class="btn btn-primary btn-sm" aria-label="Toggle live stream playback">
            <span>▶ PLAY LIVE</span>
          </button>
          <button id="live-btn-step" class="btn btn-secondary btn-sm" aria-label="Step forward one event">
            <span>⏭ STEP</span>
          </button>
          
          <div class="speed-selector" role="group" aria-label="Playback speed selector">
            <button class="speed-btn" data-speed="1600" aria-label="0.5x speed">0.5x</button>
            <button class="speed-btn is-active" data-speed="800" aria-label="1x normal speed">1.0x</button>
            <button class="speed-btn" data-speed="400" aria-label="2x fast speed">2.0x</button>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;">
          <!-- Follow Live Toggle -->
          <label class="follow-toggle-label" for="live-follow-toggle">
            <input type="checkbox" id="live-follow-toggle" class="follow-checkbox" checked>
            <span>FOLLOW LIVE</span>
          </label>

          <!-- Inspecting Status Badge -->
          <span id="inspecting-indicator" class="badge badge-cyan" style="display: none;">
            INSPECTING HISTORIC STEP
          </span>

          <button id="btn-reconnect-stream" class="btn btn-ghost btn-sm" style="display: none;">
            <span>RECONNECT</span>
          </button>
        </div>
      </div>

      <!-- 2. Main 3-Column Decision Viewer Area -->
      <div id="live-viewer-content" class="live-hero-grid">
        <!-- Rendered dynamically by renderStep() -->
      </div>

      <!-- 3. Bottom Timeline Strip -->
      <div class="timeline-strip-container">
        <div class="timeline-header">
          <span class="timeline-title">DECISION STEP TIMELINE</span>
          <div class="timeline-legend">
            <span class="timeline-legend-item"><span class="pip-legend-dot good"></span> GOOD MOVE</span>
            <span class="timeline-legend-item"><span class="pip-legend-dot illegal"></span> RETRIED / ILLEGAL</span>
            <span class="timeline-legend-item"><span class="pip-legend-dot bad"></span> COLLISION / BAD</span>
          </div>
        </div>
        <div id="timeline-pips-track" class="timeline-pips-track" role="tablist" aria-label="Step timeline">
          <!-- Pips injected dynamically -->
        </div>
      </div>
    </div>
  `;
}

/**
 * Attaches event listeners for toolbar buttons and playback options.
 */
function bindControls(container) {
  const playBtn = container.querySelector('#live-btn-play');
  const stepBtn = container.querySelector('#live-btn-step');
  const followToggle = container.querySelector('#live-follow-toggle');
  const speedBtns = container.querySelectorAll('.speed-btn');
  const reconnectBtn = container.querySelector('#btn-reconnect-stream');

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.isStreaming) {
        if (streamController) streamController.close();
        store.setStreaming(false);
      } else {
        isFollowLive = true;
        if (followToggle) followToggle.checked = true;
        startStream();
      }
    });
  }

  if (stepBtn) {
    stepBtn.addEventListener('click', () => {
      advanceOneStep();
    });
  }

  if (followToggle) {
    followToggle.addEventListener('change', (e) => {
      isFollowLive = e.target.checked;
      const indicator = document.getElementById('inspecting-indicator');
      if (isFollowLive) {
        if (indicator) indicator.style.display = 'none';
        const latest = store.getState().latestEvent;
        if (latest) renderStep(latest.step, false);
      }
    });
  }

  speedBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      speedBtns.forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      playbackSpeed = Number(btn.getAttribute('data-speed'));
    });
  });

  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', () => {
      reconnectBtn.style.display = 'none';
      startStream();
    });
  }
}

/**
 * Advances to next step when paused or reviewing history.
 */
function advanceOneStep() {
  const events = store.getState().events;
  if (!events || events.length === 0) return;

  const currentIdx = events.findIndex(e => e.step === currentDisplayedStep);
  if (currentIdx >= 0 && currentIdx < events.length - 1) {
    const nextStep = events[currentIdx + 1].step;
    renderStep(nextStep, false);
  }
}

/**
 * Renders an exact step in the 3-column viewer.
 * @param {number} stepNumber - Step to render
 * @param {boolean} shouldAnimate - Whether to run typewriter & staggers
 */
function renderStep(stepNumber, shouldAnimate = true) {
  const events = store.getState().events;
  const event = events.find(e => e.step === stepNumber);
  if (!event) return;

  currentDisplayedStep = stepNumber;
  store.selectStep(stepNumber);

  const viewer = document.getElementById('live-viewer-content');
  if (!viewer) return;

  const isReduced = prefersReducedMotion() || !shouldAnimate;
  const isLatest = event.step === events[events.length - 1].step;

  // Toggle inspecting indicator
  const indicator = document.getElementById('inspecting-indicator');
  if (indicator) {
    indicator.style.display = (!isLatest || !isFollowLive) ? 'inline-flex' : 'none';
    if (!isLatest) indicator.textContent = `INSPECTING STEP ${event.step} (CLICK TIMELINE FOR OTHERS)`;
  }

  const { state, laya_calls = [], validator = {}, final_action, game_response = {}, outcome } = event;
  const acceptedCall = laya_calls.find(c => c.accepted) || laya_calls[laya_calls.length - 1] || {};
  const rejectedCalls = laya_calls.filter(c => c.accepted === false || c.excluded === true);

  // Score delta computation
  const scoreBefore = game_response.score_before ?? state.score ?? 0;
  const scoreAfter = game_response.score_after ?? scoreBefore;
  const scoreDelta = scoreAfter - scoreBefore;

  // Outcome styling
  const isGood = game_response.good === true;
  const isBad = game_response.good === false;
  const isIllegal = validator.retries > 0 || validator.fallback;

  let outcomeBadgeClass = isGood ? 'badge-good' : (isIllegal ? 'badge-illegal' : 'badge-bad');
  let outcomeBadgeText = isGood ? 'GOOD MOVE' : (isIllegal ? 'RETRY RESOLVED' : 'DAMAGE / LOSS');

  viewer.innerHTML = `
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
          <div id="live-state-textbox" class="state-text-box">
            ${isReduced ? state.state_text : ''}
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
              <span class="fact-val">${state.facts?.speed ? state.facts.speed.toFixed(2) + 'x' : '1.0x'}</span>
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

        <div id="live-questions-container" class="questions-stream-container">
          <!-- Injected below with stagger -->
        </div>

        <!-- Latency & Confidence Meter Footer -->
        <div style="margin-top: auto; padding-top: var(--space-md); border-top: 1px solid var(--border-subtle); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 10px; font-family: var(--font-mono); color: var(--text-muted); display: block;">INFERENCE LATENCY</span>
            <span style="font-family: var(--font-mono); font-size: var(--text-sm); font-weight: 700; color: #fff;">
              ${acceptedCall.latency_ms ? acceptedCall.latency_ms.toFixed(1) + ' ms' : '-- ms'}
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

        <!-- Validator Retries Warning (if any) -->
        ${validator.retries > 0 ? `
          <div class="validator-retry-box">
            <div class="validator-title">
              <span aria-hidden="true">⚠</span> VALIDATOR INTERVENTION (${validator.retries} RETRY)
            </div>
            <div class="validator-message">
              ${validator.rejections?.join('<br>') || 'Initial action rejected by game. Excluded and re-asked Laya.'}
            </div>
            ${rejectedCalls.length > 0 ? `
              <div style="margin-top: 6px; font-size: 11px; font-family: var(--font-mono); color: var(--amber);">
                Excluded Call: "${rejectedCalls[0].chosen_action}" (Score: ${(rejectedCalls[0].action_scores?.[rejectedCalls[0].chosen_action] * 100 || 0).toFixed(0)}%)
              </div>
            ` : ''}
          </div>
        ` : ''}

        <!-- Big Neon Action Display -->
        <div class="action-display-box">
          <div class="action-label-sub">CHOSEN MOVE</div>
          <div class="action-name-hero" id="live-hero-action-name">
            ${final_action || acceptedCall.chosen_action || 'STAY'}
          </div>
          <div class="action-reason">
            ${event.outcome || acceptedCall.reason || 'Optimal probability on hazard-free legal corridor.'}
          </div>
        </div>

        <!-- Action Scores Distribution across Legal Actions -->
        <div style="margin-bottom: var(--space-md);">
          <div style="font-size: 11px; font-family: var(--font-mono); color: var(--text-muted); margin-bottom: 6px;">
            ACTION SCORES ACROSS LEGAL MOVES:
          </div>
          <div class="action-scores-group">
            ${Object.entries(acceptedCall.action_scores || {}).map(([actId, score]) => {
              const pct = Math.round(score * 100);
              const isWinner = actId === final_action;
              return `
                <div class="prob-bar ${isWinner ? 'winner' : ''}">
                  <div class="prob-bar-header">
                    <span class="prob-bar-label">${actId}</span>
                    <span class="prob-bar-val">${pct}%</span>
                  </div>
                  <div class="prob-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
                    <div class="prob-bar-fill" style="width: ${isReduced ? pct : 0}%;" data-target-width="${pct}%"></div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Game Server Response -->
        <div class="game-response-box ${isGood ? 'flash-good' : (isBad ? 'flash-bad' : '')}">
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

        <!-- Replay Shortcut Button -->
        <div style="margin-top: var(--space-md); text-align: center;">
          <a href="#/replay?step=${event.step}" class="btn btn-ghost btn-sm" style="width: 100%;" aria-label="Open current step in Replay tab">
            <span>🔍 INSPECT STEP ${event.step} IN REPLAY TAB</span>
          </a>
        </div>
      </div>
    </section>
  `;

  // Run Typewriter on State Text
  const stateTextBox = document.getElementById('live-state-textbox');
  if (stateTextBox && !isReduced) {
    typewriter(stateTextBox, state.state_text, 18);
  }

  // Populate Questions Column with Staggered Appearance
  const qContainer = document.getElementById('live-questions-container');
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
              <div class="prob-bar-fill" style="width: ${isReduced ? pct : 0}%;" data-target-width="${pct}%"></div>
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

      if (isReduced) {
        qContainer.appendChild(qCard);
      } else {
        setTimeout(() => {
          qContainer.appendChild(qCard);
          // Animate option progress fills
          setTimeout(() => {
            qCard.querySelectorAll('.prob-bar-fill').forEach(fill => {
              fill.style.width = fill.getAttribute('data-target-width');
            });
          }, 80);
        }, qIdx * 150);
      }
    });
  }

  // Animate action distribution bars in Column 3
  if (!isReduced) {
    setTimeout(() => {
      viewer.querySelectorAll('.action-scores-group .prob-bar-fill').forEach(fill => {
        fill.style.width = fill.getAttribute('data-target-width');
      });
      const actionTitle = document.getElementById('live-hero-action-name');
      if (actionTitle) triggerGlitch(actionTitle);
    }, 250);
  }

  // Update Bottom Timeline Track
  updateTimelineStrip(events, stepNumber);
}

/**
 * Updates the bottom timeline strip pips.
 */
function updateTimelineStrip(events, activeStep) {
  const track = document.getElementById('timeline-pips-track');
  if (!track || !events) return;

  track.innerHTML = events.map(ev => {
    const isGood = ev.game_response?.good === true;
    const isIllegal = ev.validator?.retries > 0;
    const isBad = ev.game_response?.good === false;
    const pipClass = isGood ? 'good' : (isIllegal ? 'illegal' : (isBad ? 'bad' : ''));
    const isCurrent = ev.step === activeStep;

    return `
      <button 
        class="timeline-pip ${pipClass} ${isCurrent ? 'is-current' : ''}" 
        data-step="${ev.step}" 
        title="Step ${ev.step}: ${ev.final_action || 'MOVE'} (${ev.game_response?.score_after ?? 0} pts)"
        aria-label="Inspect step ${ev.step}"
      ></button>
    `;
  }).join('');

  // Attach click listeners to pips
  track.querySelectorAll('.timeline-pip').forEach(pip => {
    pip.addEventListener('click', (e) => {
      const step = Number(pip.getAttribute('data-step'));
      isFollowLive = false;
      const followCheckbox = document.getElementById('live-follow-toggle');
      if (followCheckbox) followCheckbox.checked = false;
      renderStep(step, false);
    });
  });

  // Auto-scroll timeline to active pip
  const currentPip = track.querySelector('.timeline-pip.is-current');
  if (currentPip) {
    currentPip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }
}

/**
 * Renders an empty waiting state if no events have arrived yet.
 */
function showWaitingState(container) {
  const viewer = container.querySelector('#live-viewer-content');
  if (!viewer) return;

  viewer.innerHTML = `
    <div class="empty-hero-state hud-card" style="grid-column: 1 / -1;">
      <div style="font-size: 3rem; color: var(--neon-cyan); margin-bottom: var(--space-md); animation: pulseDot 1.6s infinite;">
        📡
      </div>
      <h3 style="font-size: var(--text-2xl); color: #fff; margin-bottom: var(--space-xs);">
        WAITING FOR THE FIRST MOVE...
      </h3>
      <p style="color: var(--text-secondary); max-width: 520px; margin-bottom: var(--space-lg);">
        The live decision viewer is listening for events from Laya. Start the game loop or replay mock events using the controls above.
      </p>
      <div style="display: flex; gap: var(--space-sm);">
        <button id="btn-start-demo-stream" class="btn btn-primary btn-sm">
          <span>START DEMO STREAM</span>
        </button>
      </div>
    </div>
  `;

  const btn = viewer.querySelector('#btn-start-demo-stream');
  if (btn) {
    btn.addEventListener('click', () => {
      startStream();
    });
  }
}

function hideWaitingState() {
  const empty = document.querySelector('.empty-hero-state');
  if (empty && empty.parentElement) {
    // Content will be replaced on renderStep
  }
}

/**
 * Renders a reconnectable error state if stream connection fails.
 */
function showErrorState(err) {
  const viewer = document.getElementById('live-viewer-content');
  const reconnectBtn = document.getElementById('btn-reconnect-stream');
  if (reconnectBtn) reconnectBtn.style.display = 'inline-flex';

  if (!viewer) return;

  // If no events rendered at all, show prominent error card
  if (store.getState().events.length === 0) {
    viewer.innerHTML = `
      <div class="empty-hero-state hud-card" style="grid-column: 1 / -1; border-color: var(--red);">
        <div style="font-size: 2.5rem; color: var(--red); margin-bottom: var(--space-sm);">⚠</div>
        <h3 style="color: var(--red); margin-bottom: var(--space-xs);">STREAM DISCONNECTED</h3>
        <p style="color: var(--text-secondary); max-width: 480px; margin-bottom: var(--space-md);">
          Could not establish connection to the game stream. You can retry connecting or switch to offline demo fixtures.
        </p>
        <div style="display: flex; gap: var(--space-sm);">
          <button id="btn-err-reconnect" class="btn btn-primary btn-sm">RECONNECT STREAM</button>
          <a href="?mock=1#/live" class="btn btn-secondary btn-sm">SWITCH TO MOCK DATA</a>
        </div>
      </div>
    `;

    const retry = viewer.querySelector('#btn-err-reconnect');
    if (retry) {
      retry.addEventListener('click', () => {
        startStream();
      });
    }
  }
}
