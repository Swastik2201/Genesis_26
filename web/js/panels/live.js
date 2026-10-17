/**
 * ==========================================================================
 * BEAT THE BOT — LIVE RUN HERO PANEL (panels/live.js)
 * Real-time inference viewer: State ➔ Questions ➔ Probabilities ➔ Chosen Move.
 * Supports both Snake Arena (12x12) and 2048 Arena (4x4) with adjacent switcher.
 * ==========================================================================
 */

import { store } from '../store.js';
import * as api from '../api.js';
import { typewriter, animateCounter, triggerGlitch } from '../fx.js';
import { renderDecisionGrid, renderSplitDecision } from '../components/decisionCard.js';
import { GameViewport } from '../components/gameCanvas.js';
import * as sound from '../sound.js';

let streamController = null;
let storeUnsubscribe = null;
let currentDisplayedStep = null;
let isFollowLive = true;
let isPaused = false;
let currentContainer = null;
let gameViewport = null;
let selectedGame = 'snake'; // 'snake' | '2048'

const prefersReducedMotion = () => {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Mounts the Live Run hero screen into the target container.
 */
export async function mount(container) {
  currentContainer = container;
  const state = store.getState();

  isFollowLive = true;
  isPaused = !state.isStreaming;

  renderShell(container);
  bindControls(container);

  // Initialize visual game canvas viewport with restart and game-over handlers
  const viewportMount = container.querySelector('#live-game-viewport-mount');
  if (viewportMount) {
    gameViewport = new GameViewport(viewportMount, {
      gameType: selectedGame,
      onRestart: () => {
        restartLiveRun();
      },
      onGameOver: (info) => {
        showGameOverBanner(info);
      },
      onStep: (event) => {
        hideWaitingState();
        store.addEvent(event);
        if (event.session_id) {
          store.setState({ currentSession: event.session_id });
        }
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
    showWaitingState(container);
  }

  // Subscribe to store updates
  storeUnsubscribe = store.subscribe((newState, prevState) => {
    updateTimelineStrip(newState.events, currentDisplayedStep);

    if (isFollowLive && newState.latestEvent) {
      if (!prevState || !prevState.latestEvent || newState.latestEvent.step !== prevState.latestEvent.step) {
        renderStep(newState.latestEvent.step, true);
      }
    }

    const playPauseBtn = document.getElementById('live-btn-play');
    if (playPauseBtn) {
      playPauseBtn.innerHTML = newState.isStreaming 
        ? '<span>⏸ PAUSE</span>' 
        : '<span>▶ PLAY LIVE</span>';
    }
  });

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

  hideGameOverBanner();
  store.setState({
    events: [],
    selectedStep: null,
    latestEvent: null,
    score: 0,
    isStreaming: true
  });

  currentDisplayedStep = null;
  isFollowLive = true;

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

  const track = document.getElementById('timeline-pips-track');
  if (track) track.innerHTML = '';

  if (gameViewport) {
    gameViewport.resetGame();
    gameViewport.setPaused(false);
  }



  const playBtn = document.getElementById('live-btn-play');
  if (playBtn) playBtn.innerHTML = '<span>⏸ PAUSE</span>';

  const indicator = document.getElementById('inspecting-indicator');
  if (indicator) indicator.style.display = 'none';

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
 * Switch the active game in the Live Run panel.
 */
function switchGame(gameName) {
  selectedGame = gameName === '2048' ? '2048' : 'snake';

  // Update tabs
  const tabSnake = document.getElementById('tab-game-snake');
  const tab2048 = document.getElementById('tab-game-2048');
  const dropdown = document.getElementById('live-game-dropdown');

  if (dropdown) dropdown.value = selectedGame;

  if (selectedGame === '2048') {
    if (tab2048) {
      tab2048.classList.add('active');
      tab2048.style.background = 'rgba(147, 51, 234, 0.3)';
      tab2048.style.borderColor = '#a855f7';
      tab2048.style.color = '#d8b4fe';
    }
    if (tabSnake) {
      tabSnake.classList.remove('active');
      tabSnake.style.background = 'rgba(15, 23, 42, 0.6)';
      tabSnake.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      tabSnake.style.color = '#94a3b8';
    }
  } else {
    if (tabSnake) {
      tabSnake.classList.add('active');
      tabSnake.style.background = 'rgba(16, 185, 129, 0.25)';
      tabSnake.style.borderColor = '#10b981';
      tabSnake.style.color = '#4ade80';
    }
    if (tab2048) {
      tab2048.classList.remove('active');
      tab2048.style.background = 'rgba(15, 23, 42, 0.6)';
      tab2048.style.borderColor = 'rgba(255, 255, 255, 0.15)';
      tab2048.style.color = '#94a3b8';
    }
  }

  // Update Broadcast Synchronizer Card text
  updateBroadcastCard();

  // Update Game Viewport
  if (gameViewport) {
    gameViewport.setGameType(selectedGame);
  }
}

function updateBroadcastCard() {
  const icon = document.getElementById('arena-broadcast-icon');
  const title = document.getElementById('arena-broadcast-title');
  const sub = document.getElementById('arena-broadcast-sub');
  const startBtn = document.getElementById('btn-arena-start-match');
  const team = document.getElementById('live-team-name-input')?.value || '4-Goats';

  if (selectedGame === '2048') {
    if (icon) icon.textContent = '🔢';
    if (title) title.textContent = 'TOPGAMEAI 2048 ARENA BROADCAST';
    if (sub) {
      sub.innerHTML = `Play on <a href="https://topgameai.com/arena/2048" target="_blank" style="color: #38bdf8; text-decoration: underline;">topgameai.com/arena/2048</a> as <strong>${team}</strong> (Step Cap: 2000 | Points: (log2(tile)-6)*143 + score/1000)`;
    }
    if (startBtn) startBtn.innerHTML = `<span>▶ PLAY 2048 (${team.toUpperCase()})</span>`;
  } else {
    if (icon) icon.textContent = '🐍';
    if (title) title.textContent = 'TOPGAMEAI SNAKE ARENA BROADCAST';
    if (sub) {
      sub.innerHTML = `Play on <a href="https://topgameai.com/arena/snake" target="_blank" style="color: #38bdf8; text-decoration: underline;">topgameai.com/arena/snake</a> as <strong>${team}</strong> (Target: 15 foods | Cap: 300 steps)`;
    }
    if (startBtn) startBtn.innerHTML = `<span>▶ PLAY SNAKE (${team.toUpperCase()})</span>`;
  }
}

/**
 * Renders the top-level HTML skeleton of the Live Run screen.
 */
function renderShell(container) {
  container.innerHTML = `
    <div class="panel-live-hero" id="live-hero-root">

      <!-- ADJACENT GAME SELECTOR (SNAKE VS 2048) -->
      <div class="hud-card" style="margin-bottom: var(--space-sm); padding: 8px 14px; background: rgba(15, 23, 42, 0.9); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; border: 1px solid rgba(255, 255, 255, 0.12);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 11px; font-weight: 700; color: #a855f7; letter-spacing: 0.5px;">SELECT ARENA GAME:</span>
          <div class="arena-game-tabs" style="display: inline-flex; gap: 6px;">
            <button id="tab-game-snake" class="btn btn-sm ${selectedGame === 'snake' ? 'active' : ''}" style="background: ${selectedGame === 'snake' ? 'rgba(16, 185, 129, 0.25)' : 'rgba(15, 23, 42, 0.6)'}; border: 1px solid ${selectedGame === 'snake' ? '#10b981' : 'rgba(255,255,255,0.15)'}; color: ${selectedGame === 'snake' ? '#4ade80' : '#94a3b8'}; font-weight: 700; padding: 4px 10px; border-radius: 6px;">
              <span>🐍 SNAKE ARENA (12x12)</span>
            </button>
            <button id="tab-game-2048" class="btn btn-sm ${selectedGame === '2048' ? 'active' : ''}" style="background: ${selectedGame === '2048' ? 'rgba(147, 51, 234, 0.3)' : 'rgba(15, 23, 42, 0.6)'}; border: 1px solid ${selectedGame === '2048' ? '#a855f7' : 'rgba(255,255,255,0.15)'}; color: ${selectedGame === '2048' ? '#d8b4fe' : '#94a3b8'}; font-weight: 700; padding: 4px 10px; border-radius: 6px;">
              <span>🔢 2048 ARENA (4x4)</span>
            </button>
          </div>
          <!-- Dropdown alternate option -->
          <select id="live-game-dropdown" style="background: #0f172a; border: 1px solid rgba(255,255,255,0.2); color: #fff; font-size: 11px; padding: 4px 8px; border-radius: 4px; font-family: monospace;">
            <option value="snake">Game: Snake (12x12)</option>
            <option value="2048">Game: 2048 (4x4)</option>
          </select>
        </div>

        <div style="display: flex; align-items: center; gap: 8px;">
          <button id="btn-copy-relay-code" class="btn btn-sm" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; font-weight: 600; padding: 4px 10px;" title="Copy snippet to paste into TopGameAI browser console">
            <span>📋 COPY INSPECT CODE</span>
          </button>
          <span id="copy-code-feedback" style="display: none; font-size: 11px; color: #4ade80; font-weight: bold;">
            ✓ COPIED! Paste into F12 Console on topgameai.com
          </span>
        </div>
      </div>

      <!-- 1. Top Controls Toolbar -->
      <div class="live-toolbar">
        <div class="live-controls-group">
          <button id="live-btn-play" class="btn btn-primary btn-sm" aria-label="Toggle live stream and game simulation playback">
            <span>▶ PLAY LIVE</span>
          </button>
          <div class="arena-team-picker" style="display: inline-flex; align-items: center; gap: 6px; margin-left: 8px; border-left: 1px solid rgba(255,255,255,0.15); padding-left: 10px;">
            <span style="font-size: 11px; font-weight: 700; color: #a855f7;">TEAM:</span>
            <input type="text" id="live-team-name-input" value="4-Goats" style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(168, 85, 247, 0.4); color: #fff; padding: 4px 8px; border-radius: 4px; font-family: monospace; font-size: 12px; width: 95px;" placeholder="4-Goats" aria-label="Team name">
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: var(--space-md); flex-wrap: wrap;">
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
          <span id="arena-broadcast-icon" style="font-size: 1.5rem;">${selectedGame === '2048' ? '🔢' : '🐍'}</span>
          <div>
            <div style="font-weight: 700; color: #fff; font-size: 13px; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">
              <span id="arena-broadcast-title">TOPGAMEAI ${selectedGame.toUpperCase()} ARENA BROADCAST</span>
              <span class="badge" style="background: rgba(34, 230, 255, 0.15); color: #22e6ff; border-color: #22e6ff; font-size: 10px;">LIVE LOCKSTEP</span>
            </div>
            <div id="arena-broadcast-sub" style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Play on <a href="https://topgameai.com/arena/${selectedGame}" target="_blank" style="color: #38bdf8; text-decoration: underline;">topgameai.com/arena/${selectedGame}</a> as <strong>4-Goats</strong> to mirror live, or launch directly below!
            </div>
          </div>
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

        <div class="timeline-pips-track" id="timeline-pips-track" role="tablist" aria-label="Step timeline">
          <!-- Dynamically populated -->
        </div>
      </div>
    </div>
  `;
}

/**
 * Binds event listeners to top buttons, toolbar controls, and arena launcher.
 */
function bindControls(container) {
  const playBtn = container.querySelector('#live-btn-play');
  const reconnectBtn = container.querySelector('#btn-reconnect-stream');

  // Game Selector Tabs & Dropdown
  const tabSnake = container.querySelector('#tab-game-snake');
  const tab2048 = container.querySelector('#tab-game-2048');
  const dropdown = container.querySelector('#live-game-dropdown');
  const copyRelayBtn = container.querySelector('#btn-copy-relay-code');
  const copyFeedback = container.querySelector('#copy-code-feedback');

  if (tabSnake) tabSnake.addEventListener('click', () => switchGame('snake'));
  if (tab2048) tab2048.addEventListener('click', () => switchGame('2048'));
  if (dropdown) dropdown.addEventListener('change', (e) => switchGame(e.target.value));

  if (copyRelayBtn) {
    copyRelayBtn.addEventListener('click', () => {
      const codeSnippet = `fetch('http://localhost:8000/relay.js').then(r=>r.text()).then(eval)`;
      navigator.clipboard.writeText(codeSnippet).then(() => {
        if (copyFeedback) {
          copyFeedback.style.display = 'inline-block';
          setTimeout(() => { copyFeedback.style.display = 'none'; }, 4000);
        }
        copyRelayBtn.innerHTML = '<span>✓ COPIED CODE!</span>';
        setTimeout(() => {
          copyRelayBtn.innerHTML = '<span>📋 COPY INSPECT CODE</span>';
        }, 3000);
      }).catch(() => {
        prompt('Copy this code into TopGameAI browser console (F12):', codeSnippet);
      });
    });
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      const state = store.getState();
      if (state.isStreaming) {
        store.setState({ isStreaming: false });
        if (streamController) streamController.close();
        if (gameViewport) gameViewport.setPaused(true);
        playBtn.innerHTML = '<span>▶ PLAY LIVE</span>';
      } else {
        store.setState({ isStreaming: true });
        startStream();
        if (gameViewport) gameViewport.setPaused(false);
        playBtn.innerHTML = '<span>⏸ PAUSE</span>';
      }
    });
  }



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
 */
function renderStep(stepNumber, shouldAnimate = true) {
  const events = store.getState().events;
  const event = events.find(e => e.step === stepNumber);
  if (!event) return;

  currentDisplayedStep = stepNumber;
  store.selectStep(stepNumber);

  // Synchronize game mode with event if incoming event is 2048
  if (event.game_id === '2048' && selectedGame !== '2048') {
    switchGame('2048');
  } else if (event.game_id === 'snake' && selectedGame !== 'snake') {
    switchGame('snake');
  }

  const isReduced = prefersReducedMotion() || !shouldAnimate;
  const isLatest = event.step === events[events.length - 1].step;

  const indicator = document.getElementById('inspecting-indicator');
  if (indicator) {
    indicator.style.display = (!isLatest || !isFollowLive) ? 'inline-flex' : 'none';
    if (!isLatest) indicator.textContent = `INSPECTING STEP ${event.step} (CLICK TIMELINE FOR OTHERS)`;
  }

  const stateMount = document.getElementById('live-state-mount');
  const decisionMount = document.getElementById('live-decision-mount');
  if (stateMount && decisionMount) {
    renderSplitDecision(stateMount, decisionMount, event, { isReduced, animate: shouldAnimate });
  }

  if (gameViewport) {
    gameViewport.feedStep(event);
  }

  updateTimelineStrip(events, stepNumber);

  // Check terminal completion condition
  const isDone = Boolean(event.state?.done || event.game_response?.done);
  if (isDone) {
    if (streamController) {
      streamController.close();
      streamController = null;
    }
    const is2048 = event.game_id === '2048' || selectedGame === '2048';
    const won = Boolean(event.game_response?.won || (is2048 ? (event.state?.facts?.best >= 2048) : (event.state?.facts?.food_eaten >= 15)));
    showGameOverBanner({
      gameType: is2048 ? '2048' : 'snake',
      won,
      reason: won ? (is2048 ? '2048 VICTORY REACHED!' : '15 FOODS EATEN — VICTORY!') : 'GAME OVER',
      score: event.state?.facts?.score ?? event.state?.score ?? 0,
      points: event.state?.score ?? 0,
      bestTile: event.state?.facts?.best ?? (event.state?.facts?.grid ? Math.max(...event.state.facts.grid.flat()) : 2),
      steps: event.step,
      sessionId: event.session_id || store.getState().currentSession,
    });
  }

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
 * Renders the prominent Game Completion / Terminal Banner with Autopsy and Replay action buttons.
 */
function showGameOverBanner(info) {
  const container = document.getElementById('live-hero-root');
  if (!container) return;

  let banner = document.getElementById('game-completed-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'game-completed-banner';
    const toolbar = container.querySelector('.live-toolbar');
    if (toolbar && toolbar.nextSibling) {
      container.insertBefore(banner, toolbar.nextSibling);
    } else {
      container.prepend(banner);
    }
  }

  const sid = info.sessionId || store.getState().currentSession || 'latest';
  store.setState({ currentSession: sid, status: 'completed' });

  const is2048 = info.gameType === '2048';
  const badgeColor = info.won ? '#39ff88' : '#22e6ff';
  const title = info.won ? `🏆 ${is2048 ? '2048 ARENA' : 'SNAKE ARENA'} VICTORY!` : `🏁 ${is2048 ? '2048 ARENA' : 'SNAKE ARENA'} SESSION COMPLETED`;
  const subtext = is2048
    ? `Best Tile: <strong style="color: #ffd000;">${info.bestTile || 2}</strong> | In-Game Score: <strong style="color: #38bdf8;">${info.score || 0}</strong> | Arena Points: <strong style="color: #4ade80;">${info.points || 0} PTS</strong> | Steps: ${info.steps || 0}/2000`
    : `Foods Eaten: <strong style="color: #4ade80;">${Math.round(info.score / 60) || 15}/15</strong> | Final Score: <strong style="color: #ffd000;">${info.score || 0} PTS</strong> | Steps: ${info.steps || 0}/300`;

  banner.className = 'hud-card game-completed-banner';
  banner.style.cssText = `
    margin-bottom: var(--space-md);
    padding: 16px 20px;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(26, 16, 48, 0.95));
    border: 2px solid ${info.won ? 'var(--neon-green)' : 'var(--neon-cyan)'};
    box-shadow: 0 0 24px rgba(34, 230, 255, 0.25);
    border-radius: 8px;
  `;

  banner.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px;">
      <div>
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
          <span style="font-size: 1.4rem;">${info.won ? '🏆' : '🏁'}</span>
          <h3 style="margin: 0; font-size: 16px; color: ${badgeColor}; letter-spacing: 0.5px;">${title}</h3>
          <span class="badge ${info.won ? 'badge-good' : 'badge-cyan'}" style="font-size: 10px;">SESSION: ${sid.slice(0, 18)}</span>
        </div>
        <div style="font-size: 12px; color: #cbd5e1; font-family: var(--font-mono); margin-left: 32px;">
          ${subtext}
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <a href="#/autopsy?session=${encodeURIComponent(sid)}" class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #a855f7, #6366f1); border-color: #a855f7; color: #fff; font-weight: 700; text-decoration: none;">
          <span>🔬 DECISION AUTOPSY</span>
        </a>
        <a href="#/replay?session=${encodeURIComponent(sid)}" class="btn btn-secondary btn-sm" style="border-color: var(--neon-cyan); color: var(--neon-cyan); font-weight: 700; text-decoration: none;">
          <span>⏪ REPLAY ALL STEPS</span>
        </a>
        <a href="#/logs?session=${encodeURIComponent(sid)}" class="btn btn-secondary btn-sm" style="border-color: rgba(255,255,255,0.25); color: #fff; text-decoration: none;">
          <span>📜 AUDIT LOGS</span>
        </a>
        <button id="btn-banner-new-run" class="btn btn-sm" style="background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); color: #fff;">
          <span>🔄 NEW RUN</span>
        </button>
      </div>
    </div>
  `;

  const newRunBtn = banner.querySelector('#btn-banner-new-run');
  if (newRunBtn) {
    newRunBtn.addEventListener('click', () => {
      restartLiveRun();
    });
  }
}

function hideGameOverBanner() {
  const banner = document.getElementById('game-completed-banner');
  if (banner) banner.remove();
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

  track.querySelectorAll('.timeline-pip').forEach(pip => {
    pip.addEventListener('click', (e) => {
      const step = Number(pip.getAttribute('data-step'));
      isFollowLive = false;

      renderStep(step, false);
    });
  });

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

function showWaitingState(container) {
  const decisionMount = container.querySelector('#live-decision-mount');
  if (!decisionMount) return;

  decisionMount.innerHTML = `
    <div class="empty-hero-state hud-card" style="padding: var(--space-xl);">
      <div style="font-size: 2.5rem; color: var(--neon-cyan); margin-bottom: var(--space-sm); animation: pulseDot 1.5s infinite;">
        📡
      </div>
      <h3 style="font-size: var(--text-lg); color: #fff; margin-bottom: var(--space-xs);">
        WAITING FOR ARENA TELEMETRY...
      </h3>
      <p style="color: var(--text-secondary); font-size: var(--text-sm); max-width: 440px; margin: 0 auto var(--space-md);">
        Copy the inspect snippet or launch game on TopGameAI Arena to stream live telemetry.
      </p>
      <div style="background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 10px 14px; font-family: monospace; font-size: 11px; color: #a855f7; display: inline-block;">
        fetch('http://localhost:8000/relay.js').then(r=>r.text()).then(eval)
      </div>
    </div>
  `;
}

function showErrorState(err) {
  const indicator = document.getElementById('btn-reconnect-stream');
  if (indicator) indicator.style.display = 'inline-flex';
}

function hideWaitingState() {
  const waitingEl = document.querySelector('.empty-hero-state');
  if (waitingEl) waitingEl.remove();
}
