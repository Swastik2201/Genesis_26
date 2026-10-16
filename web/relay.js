/**
 * ==========================================================================
 * BEAT THE BOT — TOPGAMEAI 2048 & SNAKE LAYA MODEL RELAY (web/relay.js)
 * Autonomous Laya Decision Bridge for TopGameAI Arena (Snake & 2048)
 *
 * ARCHITECTURE (Strict Hackathon Compliance):
 * Game State (TopGameAI) -> Local Python Backend (/api/laya/decide)
 *   -> Laya Decision Model (convaiinnovations/laya) -> Validated Decision
 *   -> Browser Input Interface -> Telemetry and Hash-Chained JSONL Logs
 *
 * NOTE: All moves are generated exclusively by the Laya model via the local
 * backend. No BFS, flood-fill, search algorithms, or lookahead planners are used.
 * ==========================================================================
 */

(function () {
  // Idempotent guard to prevent duplicate listeners or monkeypatch recursion
  if (window.__BTB_RELAY_INITIALIZED__) {
    console.log('%c[BeatTheBot] Autonomous Laya Relay is already active in this window.', 'color: #38bdf8; font-weight: bold;');
    return;
  }
  window.__BTB_RELAY_INITIALIZED__ = true;

  const LOCAL_API = 'http://localhost:8000';
  const DIRS = {
    up: { key: 'ArrowUp' },
    down: { key: 'ArrowDown' },
    left: { key: 'ArrowLeft' },
    right: { key: 'ArrowRight' },
  };

  let activeSessionId = null;
  let currentGame = window.location.pathname.includes('2048') ? '2048' : 'snake';
  let currentTeamName = '4-Goats';
  let isPlaying = false;
  let stepCount = 0;
  let currentDirection = 'right';
  let isDeciding = false;

  console.log(`%c[BeatTheBot] Autonomous Laya Relay Loaded for TopGameAI Arena (${currentGame.toUpperCase()})!`, 'color: #a855f7; font-weight: bold; font-size: 14px;');
  console.log(`Waiting for game session to start on topgameai.com...`);

  // --- FLOATING HUD BADGE ON TOPGAMEAI.COM ---
  let badge = document.getElementById('btb-relay-hud');
  if (badge) badge.remove();

  badge = document.createElement('div');
  badge.id = 'btb-relay-hud';
  badge.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 9999999;
    background: rgba(15, 23, 42, 0.96);
    border: 1px solid #9333ea;
    box-shadow: 0 10px 40px rgba(147, 51, 234, 0.45);
    border-radius: 12px;
    padding: 14px 18px;
    color: #fff;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 360px;
    backdrop-filter: blur(8px);
  `;
  badge.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
      <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: bold; color: #d8b4fe;">
        <span id="btb-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80;"></span>
        BEAT THE BOT — LAYA DECISION LAYER
      </span>
      <span id="btb-game-tag" style="font-size: 10px; color: #a855f7; background: rgba(168, 85, 247, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: bold;">
        ${currentGame.toUpperCase()}
      </span>
    </div>
    <div id="btb-relay-status" style="color: #94a3b8; font-size: 11px;">
      Ready: Click <strong>▶ Play Now</strong> to begin Laya model play!
    </div>
    <div id="btb-laya-telemetry" style="color: #cbd5e1; font-size: 10px; border-top: 1px solid #334155; padding-top: 4px; display: none;">
      <div>Laya Action: <strong id="btb-act">-</strong> (<span id="btb-conf">0%</span>) | Latency: <span id="btb-lat">0ms</span></div>
      <div id="btb-probs" style="color: #94a3b8; font-size: 9px; margin-top: 2px;"></div>
    </div>
    <a href="${LOCAL_API}/dashboard.html#/live" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 11px; margin-top: 4px;">
      Open Live Dashboard (Hash Chained & Verified) ↗
    </a>
  `;
  document.body.appendChild(badge);

  function setStatus(msg, isHighlight = false) {
    const el = document.getElementById('btb-relay-status');
    if (el) {
      el.innerHTML = msg;
      el.style.color = isHighlight ? '#4ade80' : '#d8b4fe';
    }
  }

  function updateTelemetry(decision) {
    const box = document.getElementById('btb-laya-telemetry');
    const actEl = document.getElementById('btb-act');
    const confEl = document.getElementById('btb-conf');
    const latEl = document.getElementById('btb-lat');
    const probsEl = document.getElementById('btb-probs');

    if (box && decision) {
      box.style.display = 'block';
      if (actEl) actEl.textContent = (decision.action || '-').toUpperCase();
      if (confEl) confEl.textContent = `${Math.round((decision.confidence || 0) * 100)}%`;
      if (latEl) latEl.textContent = `${Math.round(decision.latency_ms || 0)}ms`;
      if (probsEl && decision.probabilities) {
        const p = decision.probabilities;
        probsEl.textContent = `↑ ${(p.up || 0).toFixed(2)} | ↓ ${(p.down || 0).toFixed(2)} | ← ${(p.left || 0).toFixed(2)} | → ${(p.right || 0).toFixed(2)}`;
      }
    }
  }

  // Pre-fill agent name if empty
  const fillInput = () => {
    const input = document.querySelector('input[placeholder*="Enter your name"]');
    if (input && !input.value) {
      input.value = currentTeamName;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  fillInput();
  setTimeout(fillInput, 500);

  // --- DISPATCH REAL GAME MOVES TO PAGE ---
  function dispatchMove(moveDir) {
    currentDirection = moveDir;
    const keyName = DIRS[moveDir]?.key || 'ArrowRight';

    // 1. Keyboard event dispatch
    const event = new KeyboardEvent('keydown', {
      key: keyName,
      code: keyName,
      keyCode: keyName === 'ArrowUp' ? 38 : keyName === 'ArrowDown' ? 40 : keyName === 'ArrowLeft' ? 37 : 39,
      which: keyName === 'ArrowUp' ? 38 : keyName === 'ArrowDown' ? 40 : keyName === 'ArrowLeft' ? 37 : 39,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    document.dispatchEvent(event);

    // 2. On-screen control buttons (arrows / direction buttons)
    const arrowSymbols = {
      up: ['↑', 'up', 'w'],
      down: ['↓', 'down', 's'],
      left: ['←', 'left', 'a'],
      right: ['→', 'right', 'd'],
    };
    const symbols = arrowSymbols[moveDir] || [];
    const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
    for (const btn of buttons) {
      const txt = (btn.textContent || btn.getAttribute('aria-label') || '').trim().toLowerCase();
      if (symbols.includes(txt)) {
        btn.click();
        break;
      }
    }
  }

  // --- REQUEST GENUINE LAYA DECISION FROM LOCAL PYTHON BACKEND ---
  async function requestLayaDecision(game, sessionId, step, state, score, done, won, direction) {
    try {
      const res = await fetch(`${LOCAL_API}/api/laya/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game,
          session_id: sessionId,
          step,
          state,
          score,
          done,
          won,
          direction,
          agent_name: currentTeamName,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `HTTP ${res.status}`);
      }

      return await res.json();
    } catch (err) {
      console.error('[BeatTheBot] Laya decision request failed:', err);
      return null;
    }
  }

  // --- REPORT REJECTED MOVE TO LOCAL BACKEND ---
  async function reportRejectedMove(game, sessionId, step, action, reason, stateBefore) {
    try {
      await fetch(`${LOCAL_API}/api/laya/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          game,
          session_id: sessionId,
          step,
          action,
          reason,
          state_before: stateBefore,
        }),
      });
    } catch (e) {
      console.warn('[BeatTheBot] Failed to log rejected move:', e);
    }
  }

  // --- INTERCEPT TOPGAMEAI REST API CALLS ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
    const response = await originalFetch.apply(this, args);

    try {
      // 1. Session created when user clicks "Play Now"
      if (url && url.includes('/api/arena/sessions') && !url.includes('/action')) {
        const clone = response.clone();
        const data = await clone.json();

        if (data && data.session_id) {
          activeSessionId = data.session_id;
          currentGame = data.game || (data.state?.grid ? '2048' : 'snake');
          isPlaying = true;
          stepCount = 0;

          const tag = document.getElementById('btb-game-tag');
          if (tag) tag.textContent = currentGame.toUpperCase();

          const reqBody = args[1]?.body ? JSON.parse(args[1].body) : {};
          currentTeamName = reqBody.agent_name || currentTeamName;

          setStatus(`⚡ Laya Model Active for ${currentGame.toUpperCase()}! Evaluating Step 0...`, true);

          // Get initial Laya decision for Step 0
          if (!isDeciding && isPlaying) {
            isDeciding = true;
            setTimeout(async () => {
              try {
                const decision = await requestLayaDecision(
                  currentGame,
                  activeSessionId,
                  0,
                  data.state || {},
                  data.score || 0,
                  false,
                  false,
                  data.state?.direction || 'right'
                );
                if (decision && decision.action) {
                  updateTelemetry(decision);
                  setStatus(`Step 0: Laya selected <strong>${decision.action.toUpperCase()}</strong> (${Math.round(decision.confidence * 100)}% conf in ${Math.round(decision.latency_ms)}ms)`, true);
                  dispatchMove(decision.action);
                }
              } finally {
                isDeciding = false;
              }
            }, 100);
          }
        }
      }

      // 2. Action executed (returned from TopGameAI server)
      if (url && url.includes('/api/arena/sessions/') && url.includes('/action')) {
        const clone = response.clone();

        if (!response.ok) {
          // Move was rejected by the server (e.g. HTTP 400 reverse or no-op slide)
          const errData = await clone.json().catch(() => ({}));
          console.warn('[BeatTheBot] Move rejected by game server:', errData);
          reportRejectedMove(
            currentGame,
            activeSessionId,
            stepCount,
            currentDirection,
            errData.error || errData.message || `HTTP ${response.status}`,
            {}
          );
          return response;
        }

        const data = await clone.json();

        if (data && !data.error && isPlaying) {
          stepCount = data.steps !== undefined ? data.steps : stepCount + 1;
          const st = data.state || {};
          const score = data.score || 0;
          const done = Boolean(data.done);
          const won = Boolean(data.won);

          if (done) {
            isPlaying = false;
            const outcomeMsg = won ? '🏆 VICTORY!' : 'Game Over';
            setStatus(`${outcomeMsg} Final Score: <strong>${score}</strong>. All Laya moves recorded to .jsonl audit log.`, true);
            return response;
          }

          // Evaluate next state via Laya model
          if (!isDeciding) {
            isDeciding = true;
            setTimeout(async () => {
              try {
                const decision = await requestLayaDecision(
                  currentGame,
                  activeSessionId,
                  stepCount,
                  st,
                  score,
                  done,
                  won,
                  st.direction || currentDirection
                );
                if (decision && decision.action) {
                  updateTelemetry(decision);
                  setStatus(`Step ${stepCount}: Laya selected <strong>${decision.action.toUpperCase()}</strong> (${Math.round(decision.confidence * 100)}% | ${Math.round(decision.latency_ms)}ms) | Score: ${score}`, true);
                  dispatchMove(decision.action);
                }
              } finally {
                isDeciding = false;
              }
            }, 50);
          }
        }
      }
    } catch (err) {
      console.warn('[BeatTheBot] Error processing game response:', err);
    }

    return response;
  };
})();
