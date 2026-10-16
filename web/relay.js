/**
 * ==========================================================================
 * BEAT THE BOT — TOPGAMEAI SNAKE AUTONOMOUS ARENA RELAY (web/relay.js)
 * Lockstep Autonomous Player & Live Streamer for https://topgameai.com/arena/snake
 *
 * HOW IT WORKS:
 * 1. Waits for you to click '▶ Play Now' on topgameai.com/arena/snake.
 * 2. As soon as you click Play Now, it starts playing the game automatically on
 *    topgameai.com (moving the snake in real time).
 * 3. Simultaneously relays each move & state to our local website:
 *    http://localhost:8000/dashboard.html#/live
 * ==========================================================================
 */

(function () {
  const LOCAL_API = 'http://localhost:8000';
  const WIDTH = 12;
  const HEIGHT = 12;

  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DIRS = {
    up: { dx: 0, dy: -1, key: 'ArrowUp' },
    down: { dx: 0, dy: 1, key: 'ArrowDown' },
    left: { dx: -1, dy: 0, key: 'ArrowLeft' },
    right: { dx: 1, dy: 0, key: 'ArrowRight' },
  };

  let activeSessionId = null;
  let currentTeamName = '4-Goats';
  let isPlaying = false;
  let stepCount = 0;
  let currentDirection = 'right';

  console.log('%c[BeatTheBot] Autonomous Relay Loaded! Waiting for "Play Now" click on topgameai.com...', 'color: #a855f7; font-weight: bold; font-size: 14px;');

  // --- FLOATING HUD BADGE ON TOPGAMEAI.COM ---
  let badge = document.getElementById('btb-relay-hud');
  if (!badge) {
    badge = document.createElement('div');
    badge.id = 'btb-relay-hud';
    badge.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
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
      max-width: 320px;
    `;
    badge.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: bold; color: #d8b4fe;">
          <span id="btb-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80;"></span>
          BEAT THE BOT LIVE
        </span>
        <span id="btb-team-tag" style="font-size: 10px; color: #a855f7; background: rgba(168, 85, 247, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: bold;">4-GOATS</span>
      </div>
      <div id="btb-relay-msg" style="color: #94a3b8; font-size: 11px;">
        Ready: Enter team name & click <strong>▶ Play Now</strong> to start!
      </div>
      <a href="${LOCAL_API}/dashboard.html#/live" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 11px; margin-top: 4px;">
        Open Local Dashboard Stream ↗
      </a>
    `;
    document.body.appendChild(badge);
  }

  function setStatus(msg, isHighlight = false) {
    const el = document.getElementById('btb-relay-msg');
    if (el) {
      el.innerHTML = msg;
      el.style.color = isHighlight ? '#4ade80' : '#d8b4fe';
    }
  }

  // Pre-fill '4-Goats' into the name input if empty
  const fillInput = () => {
    const input = document.querySelector('input[placeholder*="Enter your name"]');
    if (input && !input.value) {
      input.value = '4-Goats';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };
  fillInput();
  setTimeout(fillInput, 500);

  // --- OPTIMAL SNAKE PATHFINDING ALGORITHM ---
  function bfsPath(start, target, blockedSet) {
    if (start.x === target.x && start.y === target.y) return [];
    const queue = [[start, []]];
    const visited = new Set([`${start.x},${start.y}`]);

    while (queue.length > 0) {
      const [curr, path] = queue.shift();
      for (const [dName, d] of Object.entries(DIRS)) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
        if (nx === target.x && ny === target.y) return [...path, dName];
        const key = `${nx},${ny}`;
        if (!blockedSet.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push([{ x: nx, y: ny }, [...path, dName]]);
        }
      }
    }
    return null;
  }

  function floodFill(start, blockedSet) {
    const queue = [start];
    const visited = new Set([`${start.x},${start.y}`]);
    let count = 0;

    while (queue.length > 0) {
      const curr = queue.shift();
      count++;
      for (const d of Object.values(DIRS)) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
        const key = `${nx},${ny}`;
        if (!blockedSet.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push({ x: nx, y: ny });
        }
      }
    }
    return count;
  }

  function simulateSnake(snake, newHead, ateFood) {
    const nextSnake = [newHead, ...snake.map((s) => ({ ...s }))];
    if (!ateFood) nextSnake.pop();
    return nextSnake;
  }

  function chooseBestMove(snake, food, direction) {
    const head = snake[0];
    const bodyBlocks = new Set(snake.slice(0, -1).map((s) => `${s.x},${s.y}`));

    const legalDirs = {};
    for (const [dName, d] of Object.entries(DIRS)) {
      if (dName === OPPOSITE[direction]) continue;
      const nx = head.x + d.dx;
      const ny = head.y + d.dy;
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
      if (bodyBlocks.has(`${nx},${ny}`)) continue;

      const newHead = { x: nx, y: ny };
      const ate = nx === food.x && ny === food.y;
      const simSnake = simulateSnake(snake, newHead, ate);
      const simBlocks = new Set(simSnake.slice(0, -1).map((s) => `${s.x},${s.y}`));
      const tail = simSnake[simSnake.length - 1];

      const canReachTail = bfsPath(newHead, tail, simBlocks) !== null;
      const space = floodFill(newHead, simBlocks);

      legalDirs[dName] = { newHead, canReachTail, space, ate };
    }

    if (Object.keys(legalDirs).length === 0) return 'right';

    // 1. Shortest path to food
    const path = bfsPath(head, food, bodyBlocks);
    if (path && path.length > 0) {
      const nextDir = path[0];
      const info = legalDirs[nextDir];
      if (info) {
        const bodyLen = snake.length;
        if (info.canReachTail || info.space >= Math.min(25, bodyLen + 4)) {
          return nextDir;
        }
      }
    }

    // 2. Safe fallback with maximum reachable flood-fill space
    let bestDir = Object.keys(legalDirs)[0];
    let bestSpace = -1;
    for (const [dName, info] of Object.entries(legalDirs)) {
      let score = info.space;
      if (info.canReachTail) score += 1000;
      if (score > bestSpace) {
        bestSpace = score;
        bestDir = dName;
      }
    }
    return bestDir;
  }

  // --- DISPATCH REAL KEYBOARD EVENT TO TOPGAMEAI PAGE ---
  function dispatchMove(moveDir) {
    currentDirection = moveDir;
    const keyName = DIRS[moveDir]?.key || 'ArrowRight';
    const event = new KeyboardEvent('keydown', {
      key: keyName,
      code: keyName,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
  }

  // --- SEND STEP TELEMETRY TO LOCAL WEBSITE DASHBOARD ---
  async function sendLocalStep(sessionId, step, state, action, score, done, won) {
    try {
      await fetch(`${LOCAL_API}/api/arena/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          step,
          state,
          action,
          score,
          done,
          won,
          agent_name: currentTeamName,
        }),
      });
    } catch (e) {
      // Local server might be on another port or temporarily slow
    }
  }

  // --- INTERCEPT TOPGAMEAI API CALLS (SESSIONS & ACTIONS) ---
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
          isPlaying = true;
          stepCount = 0;

          const reqBody = args[1]?.body ? JSON.parse(args[1].body) : {};
          currentTeamName = reqBody.agent_name || '4-Goats';

          const tag = document.getElementById('btb-team-tag');
          if (tag) tag.textContent = currentTeamName.toUpperCase();

          setStatus(`⚡ Playing on TopGameAI & Local simultaneously! Food: 0/15`, true);

          // Relay initial step 0 to our local website
          sendLocalStep(activeSessionId, 0, data.state || {}, null, data.score || 0, false, false);

          // Schedule first move after page settles
          setTimeout(() => {
            if (!isPlaying || !data.state) return;
            const nextMove = chooseBestMove(data.state.snake, data.state.food, data.state.direction || 'right');
            dispatchMove(nextMove);
          }, 150);
        }
      }

      // 2. Action executed (returned from topgameai server)
      if (url && url.includes('/api/arena/sessions/') && url.includes('/action')) {
        const clone = response.clone();
        const data = await clone.json();

        if (data && !data.error && isPlaying) {
          stepCount = data.steps || stepCount + 1;
          const st = data.state || {};
          const foods = st.foodEaten ?? 0;
          const done = Boolean(data.done);
          const won = Boolean(data.won);

          setStatus(`⚡ Step ${stepCount}: Foods ${foods}/15 | Score: ${data.score} pts`, true);

          // Relay step immediately to local website HUD
          sendLocalStep(activeSessionId, stepCount, st, currentDirection, data.score || 0, done, won);

          if (done) {
            isPlaying = false;
            if (won || foods >= 15) {
              setStatus(`🏆 VICTORY! 15 foods eaten! Leaderboard updated as <strong>${currentTeamName}</strong>!`, true);
            } else {
              setStatus(`Game finished (score: ${data.score}).`, false);
            }
            return response;
          }

          // Calculate and dispatch NEXT move with smooth 90ms delay
          setTimeout(() => {
            if (!isPlaying) return;
            const nextMove = chooseBestMove(st.snake, st.food, st.direction || currentDirection);
            dispatchMove(nextMove);
          }, 90);
        }
      }
    } catch (err) {
      console.warn('[BeatTheBot] Error tracking move:', err);
    }

    return response;
  };
})();
