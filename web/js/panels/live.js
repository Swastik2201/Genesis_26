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
import { renderDecisionGrid } from '../components/decisionCard.js';

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

  // Render 3-column viewer using shared component
  renderDecisionGrid(viewer, event, { isReduced, animate: shouldAnimate, replayMode: false });

  // Update Bottom Timeline Track
  updateTimelineStrip(events, stepNumber);
}
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
