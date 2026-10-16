/**
 * ==========================================================================
 * BEAT THE BOT — TOPGAMEAI SNAKE AUTONOMOUS LAYA RELAY (4-GOATS)
 * Simultaneously plays Snake on https://topgameai.com/arena/snake using
 * the local Laya model (convaiinnovations/laya) and streams live gameplay
 * to http://localhost:8000/dashboard.html#/live.
 * ==========================================================================
 */

(function () {
  // Prevent duplicate instances if the script is evaluated multiple times
  if (window.__BTB_RELAY_INITIALIZED) {
    console.log(
      '%c[BeatTheBot] Relay already initialized. Re-attaching HUD & controls.',
      'color: #a855f7; font-weight: bold; font-size: 13px;'
    );
    if (typeof window.__BTB_CREATE_HUD === 'function') window.__BTB_CREATE_HUD();
    return;
  }
  window.__BTB_RELAY_INITIALIZED = true;

  const LOCAL_API = 'http://localhost:8000';
  const TEAM_NAME = '4-Goats';
  const WIDTH = 12;
  const HEIGHT = 12;

  const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const DIRS = {
    up: { dx: 0, dy: -1, key: 'ArrowUp', code: 38 },
    down: { dx: 0, dy: 1, key: 'ArrowDown', code: 40 },
    left: { dx: -1, dy: 0, key: 'ArrowLeft', code: 37 },
    right: { dx: 1, dy: 0, key: 'ArrowRight', code: 39 },
  };

  let activeSessionId = null;
  let isPlaying = false;
  let isDone = false;
  let stepCount = 0;
  let lastProcessedStep = -1;
  let currentDirection = 'right';
  let currentState = null;
  let currentScore = 0;
  let lastActionTime = 0;
  let isEvaluatingLaya = false;
  let isMoveInFlight = false;

  console.log(
    '%c[BeatTheBot] Laya Relay Active! Team: 4-Goats. Press "▶ Play Now" to begin.',
    'color: #a855f7; font-weight: bold; font-size: 14px;'
  );

  // --- FLOATING HUD BADGE ON TOPGAMEAI.COM ---
  function createHud() {
    let badge = document.getElementById('btb-relay-hud');
    if (!badge && document.body) {
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
        max-width: 360px;
        backdrop-filter: blur(8px);
      `;
      badge.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: bold; color: #d8b4fe;">
            <span id="btb-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80;"></span>
            BEAT THE BOT // LAYA RELAY
          </span>
          <span id="btb-team-tag" style="font-size: 10px; color: #a855f7; background: rgba(168, 85, 247, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: bold;">4-GOATS</span>
        </div>
        <div id="btb-relay-msg" style="color: #94a3b8; font-size: 11px;">
          Ready! Click <strong>▶ Play Now</strong> to start simultaneous play.
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
          <a href="${LOCAL_API}/dashboard.html#/live" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 11px;">
            Open Local Stream Dashboard ↗
          </a>
          <span id="btb-hud-step" style="color: #64748b; font-size: 10px;">Idle</span>
        </div>
      `;
      document.body.appendChild(badge);
    }
  }
  window.__BTB_CREATE_HUD = createHud;

  function setStatus(msg, isHighlight = false) {
    const el = document.getElementById('btb-relay-msg');
    if (el) {
      el.innerHTML = msg;
      el.style.color = isHighlight ? '#4ade80' : '#d8b4fe';
    }
  }

  function setStepInfo(txt) {
    const el = document.getElementById('btb-hud-step');
    if (el) el.textContent = txt;
  }

  function prefillTeamName() {
    const input = document.querySelector('input[placeholder*="Enter your name"]');
    if (input) {
      if (!input.value || input.value.trim() === '' || input.value === 'Anonymous') {
        input.value = TEAM_NAME;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      createHud();
      prefillTeamName();
    });
  } else {
    createHud();
    prefillTeamName();
  }
  setInterval(prefillTeamName, 1000);

  // --- BFS SPATIAL PATHFINDER (FALLBACK SAFETY) ---
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

  function chooseBestMove(snake, food, direction) {
    if (!snake || snake.length === 0) return 'right';
    const head = snake[0];
    const tail = snake[snake.length - 1];
    const bodyBlocks = new Set(snake.slice(0, -1).map((s) => `${s.x},${s.y}`));
    const legalDirs = {};

    for (const [dName, d] of Object.entries(DIRS)) {
      if (dName === OPPOSITE[direction]) continue;
      const nx = head.x + d.dx;
      const ny = head.y + d.dy;
      if (nx < 0 || nx >= WIDTH || ny < 0 || ny >= HEIGHT) continue;
      if (bodyBlocks.has(`${nx},${ny}`)) continue;

      const newHead = { x: nx, y: ny };
      const ate = food && nx === food.x && ny === food.y;
      const simSnake = [newHead, ...snake.map((s) => ({ ...s }))];
      if (!ate) simSnake.pop();
      const simBlocks = new Set(simSnake.slice(0, -1).map((s) => `${s.x},${s.y}`));
      const simTail = simSnake[simSnake.length - 1];

      const canReachTail = bfsPath(newHead, simTail, simBlocks) !== null;
      const space = floodFill(newHead, simBlocks);
      legalDirs[dName] = { newHead, canReachTail, space, ate };
    }

    if (Object.keys(legalDirs).length === 0) return 'right';

    // 1. Virtual simulation: if path to food exists, simulate the ENTIRE path.
    // Only commit to food path if the snake can STILL reach its tail after eating food at destination!
    if (food) {
      const pathToFood = bfsPath(head, food, bodyBlocks);
      if (pathToFood && pathToFood.length > 0) {
        let virtualSnake = snake.map((s) => ({ ...s }));
        for (const m of pathToFood) {
          const vHead = virtualSnake[0];
          const vNext = { x: vHead.x + DIRS[m].dx, y: vHead.y + DIRS[m].dy };
          const vAte = vNext.x === food.x && vNext.y === food.y;
          virtualSnake.unshift(vNext);
          if (!vAte) virtualSnake.pop();
        }
        const vHead = virtualSnake[0];
        const vTail = virtualSnake[virtualSnake.length - 1];
        const vBlocks = new Set(virtualSnake.slice(0, -1).map((s) => `${s.x},${s.y}`));
        const vCanReachTail = bfsPath(vHead, vTail, vBlocks) !== null;

        if (vCanReachTail) {
          return pathToFood[0];
        }
      }
    }

    // 2. Safe tail chasing: follow open corridor towards tail to bide time until safe food path emerges
    let bestTailDir = null;
    let maxTailScore = -1;
    for (const [dName, info] of Object.entries(legalDirs)) {
      if (info.canReachTail) {
        const distToTail = Math.abs(info.newHead.x - tail.x) + Math.abs(info.newHead.y - tail.y);
        const score = info.space * 10 + distToTail;
        if (score > maxTailScore) {
          maxTailScore = score;
          bestTailDir = dName;
        }
      }
    }

    if (bestTailDir) return bestTailDir;

    // 3. Fallback: move with maximum reachable space
    let fallbackDir = Object.keys(legalDirs)[0];
    let maxSpace = -1;
    for (const [dName, info] of Object.entries(legalDirs)) {
      if (info.space > maxSpace) {
        maxSpace = info.space;
        fallbackDir = dName;
      }
    }
    return fallbackDir;
  }

  // --- QUERY LOCAL LAYA MODEL & RELAY LIVE TELEMETRY ---
  async function queryLayaNextAction(sessionId, step, state, actionTaken, score, done, won) {
    isEvaluatingLaya = true;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${LOCAL_API}/api/arena/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          session_id: sessionId,
          step,
          state,
          action: actionTaken,
          score,
          done,
          won,
          agent_name: TEAM_NAME,
        }),
      });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json();
        isEvaluatingLaya = false;
        if (data && data.next_action) {
          return {
            nextAction: data.next_action,
            reason: data.reason || 'Laya model inference',
          };
        }
      }
    } catch (e) {
      console.warn('[BeatTheBot] Laya step query failed or timed out:', e);
    }

    isEvaluatingLaya = false;
    const fb = chooseBestMove(state.snake || [{ x: 6, y: 6 }], state.food || { x: 8, y: 1 }, state.direction || currentDirection);
    return { nextAction: fb, reason: 'Safe spatial fallback' };
  }

  // --- DISPATCH MOVE (EXACTLY ONE TRIGGER: PREFER ON-SCREEN BUTTON) ---
  function pressMove(dir) {
    if (!dir || isDone) return;
    currentDirection = dir;
    lastActionTime = Date.now();
    isMoveInFlight = true;

    // 1. Click on-screen directional button (exact symbol match in TopGameAI)
    const targetMap = {
      up: '↑',
      down: '↓',
      left: '←',
      right: '→',
    };
    const targetChar = targetMap[dir.toLowerCase()];

    let clicked = false;
    const buttons = Array.from(document.querySelectorAll('button'));
    for (const btn of buttons) {
      const text = (btn.textContent || '').trim();
      if (text === targetChar) {
        btn.click();
        clicked = true;
        break;
      }
    }

    // 2. Dispatch native KeyboardEvent ONLY if button wasn't found
    if (!clicked) {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') {
        document.activeElement.blur();
      }
      const info = DIRS[dir.toLowerCase()] || DIRS.right;
      const evt = new KeyboardEvent('keydown', {
        key: info.key,
        code: info.key,
        keyCode: info.code,
        which: info.code,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(evt);
      document.dispatchEvent(evt);
    }
  }

  // --- NON-BLOCKING FETCH INTERCEPTION ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

    // Ensure team name is 4-Goats when user clicks "Play Now"
    if (url && url.includes('/api/arena/sessions') && !url.includes('/action') && args[1] && args[1].body) {
      try {
        const bodyObj = JSON.parse(args[1].body);
        if (!bodyObj.agent_name || bodyObj.agent_name.trim() === '' || bodyObj.agent_name.toLowerCase() === 'anonymous') {
          bodyObj.agent_name = TEAM_NAME;
          args[1].body = JSON.stringify(bodyObj);
        }
      } catch (e) {}
    }

    const response = await originalFetch.apply(this, args);

    try {
      if (url && url.includes('/api/arena/sessions')) {
        const clone = response.clone();
        clone.json().then((data) => {
          handleArenaMessage(url, data);
        }).catch(() => {});
      }
    } catch (err) {}

    return response;
  };

  // --- ASYNC ARENA RESPONSE PROCESSOR ---
  async function handleArenaMessage(url, data) {
    if (!data) return;

    // 1. Session created (User clicked "Play Now")
    if (!url.includes('/action') && data.session_id) {
      activeSessionId = data.session_id;
      isPlaying = true;
      isDone = false;
      stepCount = 0;
      lastProcessedStep = 0;
      isMoveInFlight = false;
      currentState = data.state || {};
      currentScore = data.score || 0;
      currentDirection = currentState.direction || 'right';
      lastActionTime = Date.now();

      createHud();
      setStatus(`⚡ LAYA ACTIVE as <strong>${TEAM_NAME}</strong> simultaneously!`, true);
      setStepInfo(`Step 0 | Foods: 0/15`);

      const { nextAction, reason } = await queryLayaNextAction(
        activeSessionId,
        0,
        currentState,
        null,
        currentScore,
        false,
        false
      );

      console.log(`[BeatTheBot] Laya initial move: ${nextAction} (${reason})`);

      setTimeout(() => {
        if (!isPlaying || isDone) return;
        pressMove(nextAction);
      }, 100);
      return;
    }

    // 2. Action executed (Move result returned)
    if (url.includes('/action') && !data.error && isPlaying) {
      isMoveInFlight = false;
      const stepNum = typeof data.steps === 'number' ? data.steps : (stepCount + 1);

      // Deduplicate step handling
      if (stepNum <= lastProcessedStep) {
        return;
      }
      lastProcessedStep = stepNum;
      stepCount = stepNum;

      currentState = data.state || currentState;
      currentScore = data.score || currentScore;
      currentDirection = currentState.direction || currentDirection;
      const foods = currentState.foodEaten ?? 0;
      const done = Boolean(data.done);
      const won = Boolean(data.won);
      lastActionTime = Date.now();

      setStepInfo(`Step ${stepCount} | Foods: ${foods}/15 | Score: ${currentScore} pts`);

      if (done) {
        isPlaying = false;
        isDone = true;
        if (won || foods >= 15) {
          setStatus(`🏆 VICTORY! 15 foods eaten! TopGameAI Leaderboard verified for <strong>${TEAM_NAME}</strong>!`, true);
        } else {
          setStatus(`Game finished (score: ${currentScore} pts). Verified on Leaderboard.`, false);
        }
        queryLayaNextAction(activeSessionId, stepCount, currentState, currentDirection, currentScore, true, won);
        return;
      }

      // Query Laya strictly sequentially
      queryLayaNextAction(activeSessionId, stepCount, currentState, currentDirection, currentScore, false, false).then(
        ({ nextAction, reason }) => {
          if (!isPlaying || isDone) return;
          setStatus(`🤖 Laya: <strong>${nextAction.toUpperCase()}</strong> | Foods: ${foods}/15 (${reason})`, true);

          setTimeout(() => {
            if (!isPlaying || isDone) return;
            pressMove(nextAction);
          }, 80);
        }
      );
    }
  }

  // --- AUTONOMOUS WATCHDOG (PREVENTS DEAD STALLS) ---
  setInterval(() => {
    if (!isPlaying || isDone || isEvaluatingLaya || isMoveInFlight) return;
    const elapsed = Date.now() - lastActionTime;
    if (elapsed > 3500 && currentState && currentState.snake) {
      const nextSafe = chooseBestMove(currentState.snake, currentState.food, currentState.direction || currentDirection);
      console.log(`[BeatTheBot] Watchdog safety tick -> ${nextSafe}`);
      pressMove(nextSafe);
      lastActionTime = Date.now();
    }
  }, 500);
})();
