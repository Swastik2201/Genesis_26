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
import { renderDecisionGrid, renderSplitDecision } from '../components/decisionCard.js';
import { GameViewport } from '../components/gameCanvas.js?v=20261016_v6';
import * as sound from '../sound.js';

let streamController = null;
let storeUnsubscribe = null;
let currentDisplayedStep = null;
let isFollowLive = true;
let isPaused = false;
let playbackSpeed = 800; // ms per step
let currentContainer = null;
let gameViewport = null;

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

  // Initialize visual game canvas viewport with restart handler
  const viewportMount = container.querySelector('#live-game-viewport-mount');
  if (viewportMount) {
    gameViewport = new GameViewport(viewportMount, {
      onRestart: () => {
        restartLiveRun();
      },
      onStep: (event) => {
        hideWaitingState();
        store.addEvent(event);
      }
    });
  }

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
 * Resets the decision timeline, game simulation, and replays all steps from Step 0.
 */
export function restartLiveRun() {
  if (streamController) {
    streamController.close();
    streamController = null;
  }

  // 1. Reset store events to empty
  store.setState({
    events: [],
    selectedStep: null,
    latestEvent: null,
    score: 0,
    isStreaming: true
  });

  currentDisplayedStep = null;
  isFollowLive = true;

  // 2. Clear state and decision mounts for clean entry
  const stateMount = document.getElementById('live-state-mount');
  const decisionMount = document.getElementById('live-decision-mount');
  if (stateMount) stateMount.innerHTML = '';
  if (decisionMount) {
    decisionMount.innerHTML = `
      <div class="empty-hero-state hud-card" style="padding: var(--space-xl);">
        <div style="font-size: 2.5rem; color: var(--neon-cyan); margin-bottom: var(--space-sm); animation: pulseDot 1.2s infinite;">
          🔄
        </div>
        <h3 style="font-size: var(--text-lg); color: #fff; margin-bottom: var(--space-xs);">
          RESTARTING RUN...
        </h3>
        <p style="color: var(--text-secondary); font-size: var(--text-sm);">
          Resetting decision timeline to Step 0 and initiating fresh live inference stream.
        </p>
      </div>
    `;
  }

  // 3. Clear bottom timeline pips track
  const track = document.getElementById('timeline-pips-track');
  if (track) track.innerHTML = '';

  // 4. Reset game canvas
  if (gameViewport) {
    gameViewport.resetSkin(gameViewport.gameSkin);
    gameViewport.setPaused(false);
  }

  // 5. Reset UI toggles
  const followToggle = document.getElementById('live-follow-toggle');
  if (followToggle) followToggle.checked = true;

  const playBtn = document.getElementById('live-btn-play');
  if (playBtn) playBtn.innerHTML = '<span>⏸ PAUSE</span>';

  const indicator = document.getElementById('inspecting-indicator');
  if (indicator) indicator.style.display = 'none';

  // 6. Start stream fresh from step 0
  startStream(true);
}

/**
 * Unmounts the Live Run panel and cleans up listeners and streams.
 */
export function unmount() {
  if (gameViewport) {
    gameViewport.destroy();
    gameViewport = null;
  }
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
function startStream(forceDemo = false) {
  if (streamController) {
    streamController.close();
    streamController = null;
  }

  const sessionId = store.getState().currentSession || 'latest';
  hideWaitingState();

  if (gameViewport) {
    gameViewport.setPaused(false);
  }

  streamController = api.stream(sessionId, (event) => {
    // Event automatically added to store in api.js
    hideWaitingState();
  }, (err) => {
    showErrorState(err);
  }, forceDemo);

  const playPauseBtn = document.getElementById('live-btn-play');
  if (playPauseBtn) {
    playPauseBtn.innerHTML = '<span>⏸ PAUSE</span>';
  }
}

/**
 * Renders the top-level HTML skeleton of the Live Run screen.
 */
function renderShell(container) {
  container.innerHTML = `
    <div class="panel-live-hero" id="live-hero-root">
      <!-- 1. Top Controls Toolbar (Speed buttons 0.5x, 1x, 2x removed) -->
      <div class="live-toolbar">
        <div class="live-controls-group">
          <button id="live-btn-play" class="btn btn-primary btn-sm" aria-label="Toggle live stream and game simulation playback">
            <span>▶ PLAY LIVE</span>
          </button>
          <button id="live-btn-step" class="btn btn-secondary btn-sm" aria-label="Step forward one event">
            <span>⏭ STEP</span>
          </button>
          <button id="live-btn-restart" class="btn btn-secondary btn-sm" aria-label="Restart decision step timeline and simulation from step 0">
            <span>🔄 RESTART</span>
          </button>
          <div class="arena-team-picker" style="display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; border-left: 1px solid rgba(255,255,255,0.15); padding-left: 10px;">
            <span style="font-size: 11px; font-weight: 700; color: #a855f7;">TEAM:</span>
            <input type="text" id="live-team-name-input" value="4-Goats" style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(168, 85, 247, 0.4); color: #fff; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px; width: 95px;" placeholder="4-Goats" aria-label="Team name">
            <button id="live-btn-launch-arena" class="btn btn-sm" style="background: linear-gradient(135deg, #7c3aed, #2563eb); color: #fff; border: 1px solid #9333ea; font-weight: 600;" title="Simultaneously play on TopGameAI Arena and stream here">
              <span>⚔️ PLAY ARENA MATCH</span>
            </button>
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

      <!-- 2. TopGameAI Arena Broadcast Synchronizer Card -->
      <div class="hud-card arena-broadcast-bar" style="margin-bottom: var(--space-md); padding: 12px 18px; border-left: 3px solid #a855f7; background: linear-gradient(90deg, rgba(147, 51, 234, 0.12), rgba(15, 23, 42, 0.85)); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <span style="font-size: 1.5rem;">🐍</span>
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 13px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">
              <span>TOPGAMEAI ARENA BROADCAST</span>
              <span class="badge" style="background: rgba(34, 230, 255, 0.15); color: #22e6ff; border-color: #22e6ff; font-size: 10px;">LIVE LOCKSTEP</span>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Play on <a href="https://topgameai.com/arena/snake" target="_blank" style="color: #38bdf8; text-decoration: underline;">topgameai.com/arena/snake</a> as <strong>4-Goats</strong> to mirror live, or launch directly below!
            </div>
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-size: 11px; color: #a855f7; font-weight: 700;">TEAM:</span>
            <input type="text" id="arena-card-team-input" value="4-Goats" style="background: rgba(0,0,0,0.6); border: 1px solid rgba(168,85,247,0.5); color: #fff; font-family: monospace; font-size: 12px; padding: 5px 10px; border-radius: 4px; width: 90px;" aria-label="Team name">
          </div>
          <button id="btn-arena-start-match" class="btn btn-sm" style="background: linear-gradient(135deg, #7c3aed, #2563eb); color: #fff; border: 1px solid #9333ea; font-weight: 600;">
            <span>▶ PLAY NOW (4-GOATS)</span>
          </button>
          <div style="display: flex; align-items: center; gap: 6px; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 10px;">
            <input type="text" id="arena-session-attach-input" placeholder="Paste session_id to attach..." style="background: rgba(0,0,0,0.6); border: 1px solid rgba(255,255,255,0.2); color: #fff; font-family: monospace; font-size: 11px; padding: 5px 10px; border-radius: 4px; width: 180px;" aria-label="Session ID to attach">
            <button id="btn-arena-attach-session" class="btn btn-sm btn-secondary">
              <span>🔗 ATTACH</span>
            </button>
          </div>
          <button id="btn-arena-copy-hook" class="btn btn-sm btn-ghost" title="Copy 1-line script for topgameai.com DevTools Console">
            <span>📋 BROWSER HOOK</span>
          </button>
        </div>
      </div>

      <!-- Live Split Arena: Visual Game Viewport (Left) + Laya Decisions (Right) -->
      <div class="live-split-arena" id="live-split-arena">
        <!-- LEFT COLUMN: Live Game Viewport + State Context -->
        <div class="live-arena-left">
          <div id="live-game-viewport-mount"></div>
          <div id="live-state-mount"></div>
        </div>

        <!-- RIGHT COLUMN: Laya Decisions (Inference Questions + Chosen Move) -->
        <div class="live-arena-right" id="live-decision-mount">
        </div>
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
  const restartBtn = container.querySelector('#live-btn-restart');
  const followToggle = container.querySelector('#live-follow-toggle');
  const reconnectBtn = container.querySelector('#btn-reconnect-stream');

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.isStreaming) {
        if (streamController) {
          streamController.close();
          streamController = null;
        }
        store.setStreaming(false);
        if (gameViewport) gameViewport.setPaused(true);
        playBtn.innerHTML = '<span>▶ PLAY LIVE</span>';
      } else {
        isFollowLive = true;
        if (followToggle) followToggle.checked = true;
        if (gameViewport) gameViewport.setPaused(false);
        startStream();
        playBtn.innerHTML = '<span>⏸ PAUSE</span>';
      }
    });
  }

  if (stepBtn) {
    stepBtn.addEventListener('click', () => {
      advanceOneStep();
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', () => {
      restartLiveRun();
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

  if (reconnectBtn) {
    reconnectBtn.addEventListener('click', () => {
      reconnectBtn.style.display = 'none';
      startStream();
    });
  }

  const launchBtn = container.querySelector('#live-btn-launch-arena');
  const teamInput = container.querySelector('#live-team-name-input');
  if (launchBtn) {
    launchBtn.addEventListener('click', async () => {
      const team = (teamInput?.value || '4-Goats').trim();
      launchBtn.disabled = true;
      launchBtn.innerHTML = '<span>⏳ CONNECTING...</span>';
      try {
        const resp = await fetch('/api/arena/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_name: team, delay: 0.12 })
        });
        const data = await resp.json();
        launchBtn.innerHTML = `<span>⚔️ PLAYING AS ${team}</span>`;
        setTimeout(() => {
          startStream();
          launchBtn.disabled = false;
          launchBtn.innerHTML = '<span>⚔️ PLAY ARENA MATCH</span>';
        }, 1200);
      } catch (err) {
        console.error('Launch arena match failed:', err);
        launchBtn.disabled = false;
        launchBtn.innerHTML = '<span>❌ RETRY MATCH</span>';
      }
    });
  }

  // TopGameAI Arena Broadcast Card Controls
  const cardStartBtn = container.querySelector('#btn-arena-start-match');
  const cardTeamInput = container.querySelector('#arena-card-team-input');
  if (cardStartBtn) {
    cardStartBtn.addEventListener('click', async () => {
      const team = (cardTeamInput?.value || '4-Goats').trim();
      cardStartBtn.disabled = true;
      cardStartBtn.innerHTML = '<span>⏳ STARTING ARENA...</span>';
      try {
        const resp = await fetch('/api/arena/play', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_name: team, delay: 0.10 })
        });
        const data = await resp.json();
        cardStartBtn.innerHTML = `<span>⚡ PLAYING (${team})</span>`;
        setTimeout(() => {
          startStream();
          cardStartBtn.disabled = false;
          cardStartBtn.innerHTML = `<span>▶ PLAY NOW (${team.toUpperCase()})</span>`;
        }, 1000);
      } catch (err) {
        console.error('Start arena match failed:', err);
        cardStartBtn.disabled = false;
        cardStartBtn.innerHTML = '<span>❌ RETRY</span>';
      }
    });
  }

  const attachBtn = container.querySelector('#btn-arena-attach-session');
  const attachInput = container.querySelector('#arena-session-attach-input');
  if (attachBtn) {
    attachBtn.addEventListener('click', async () => {
      const sId = (attachInput?.value || '').trim();
      if (!sId) {
        attachInput.focus();
        return;
      }
      const team = (cardTeamInput?.value || '4-Goats').trim();
      attachBtn.disabled = true;
      attachBtn.innerHTML = '<span>⏳ ATTACHING...</span>';
      try {
        const resp = await fetch('/api/arena/hook', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sId, agent_name: team, delay: 0.10 })
        });
        const data = await resp.json();
        attachBtn.innerHTML = '<span>✓ ATTACHED!</span>';
        setTimeout(() => {
          startStream();
          attachBtn.disabled = false;
          attachBtn.innerHTML = '<span>🔗 ATTACH</span>';
        }, 1000);
      } catch (err) {
        console.error('Attach session failed:', err);
        attachBtn.disabled = false;
        attachBtn.innerHTML = '<span>❌ FAILED</span>';
      }
    });
  }

  const copyHookBtn = container.querySelector('#btn-arena-copy-hook');
  if (copyHookBtn) {
    copyHookBtn.addEventListener('click', () => {
      const scriptCode = `fetch('http://localhost:8000/relay.js').then(r=>r.text()).then(eval);`;
      navigator.clipboard.writeText(scriptCode).then(() => {
        copyHookBtn.innerHTML = '<span>✓ COPIED! PASTE IN F12</span>';
        setTimeout(() => {
          copyHookBtn.innerHTML = '<span>📋 BROWSER HOOK</span>';
        }, 2500);
      }).catch(() => {
        prompt('Copy this hook script and paste in topgameai.com Console:', scriptCode);
      });
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

  const isReduced = prefersReducedMotion() || !shouldAnimate;
  const isLatest = event.step === events[events.length - 1].step;

  // Toggle inspecting indicator
  const indicator = document.getElementById('inspecting-indicator');
  if (indicator) {
    indicator.style.display = (!isLatest || !isFollowLive) ? 'inline-flex' : 'none';
    if (!isLatest) indicator.textContent = `INSPECTING STEP ${event.step} (CLICK TIMELINE FOR OTHERS)`;
  }

  // Render Side-by-Side: State on Left under canvas, Laya Decisions on Right!
  const stateMount = document.getElementById('live-state-mount');
  const decisionMount = document.getElementById('live-decision-mount');
  if (stateMount && decisionMount) {
    renderSplitDecision(stateMount, decisionMount, event, { isReduced, animate: shouldAnimate });
  }

  // Feed step to visual game canvas viewport
  if (gameViewport) {
    gameViewport.feedStep(event);
  }

  // Update Bottom Timeline Track
  updateTimelineStrip(events, stepNumber);

  // Trigger synthesized sound if active and animating
  if (shouldAnimate) {
    if (event.validator?.retries > 0 || event.validator?.rejections?.length > 0) {
      sound.playIllegalMoveSound();
    } else if (event.game_response?.good === true) {
      sound.playGoodMoveSound();
    } else if (event.game_response?.good === false) {
      sound.playBadMoveSound();
    }
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

  // Auto-scroll timeline to active pip HORIZONTALLY ONLY, WITHOUT scrolling the parent window!
  const currentPip = track.querySelector('.timeline-pip.is-current');
  if (currentPip) {
    const pipLeft = currentPip.offsetLeft;
    const pipWidth = currentPip.offsetWidth;
    const trackWidth = track.clientWidth;
    track.scrollTo({
      left: pipLeft - trackWidth / 2 + pipWidth / 2,
      behavior: 'smooth'
    });
  }
}

/**
 * Renders an empty waiting state if no events have arrived yet.
 */
function showWaitingState(container) {
  const decisionMount = container.querySelector('#live-decision-mount');
  if (!decisionMount) return;

  decisionMount.innerHTML = `
    <div class="empty-hero-state hud-card" style="padding: var(--space-xl);">
      <div style="font-size: 2.5rem; color: var(--neon-cyan); margin-bottom: var(--space-sm); animation: pulseDot 1.6s infinite;">
        📡
      </div>
      <h3 style="font-size: var(--text-lg); color: #fff; margin-bottom: var(--space-xs);">
        WAITING FOR LAYA DECISIONS...
      </h3>
      <p style="color: var(--text-secondary); font-size: var(--text-sm); max-width: 440px; margin-bottom: var(--space-md);">
        The live decision telemetry is listening for Laya model calls. Stream events with demo_feeder or replay a run above.
      </p>
      <div style="display: flex; gap: var(--space-sm);">
        <button id="btn-start-demo-stream" class="btn btn-primary btn-sm">
          <span>START DEMO STREAM</span>
        </button>
      </div>
    </div>
  `;

  const btn = decisionMount.querySelector('#btn-start-demo-stream');
  if (btn) {
    btn.addEventListener('click', () => {
      hideWaitingState();
      // Reset store to step 0 for a fresh run
      store.setState({ events: [], selectedStep: null, latestEvent: null });
      if (gameViewport) {
        gameViewport.resetSkin(gameViewport.gameSkin);
        gameViewport.setPaused(false);
      }
      isFollowLive = true;
      const followToggle = document.getElementById('live-follow-toggle');
      if (followToggle) followToggle.checked = true;
      startStream(true);
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
