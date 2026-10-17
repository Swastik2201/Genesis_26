/**
 * ==========================================================================
 * BEAT THE BOT — TOPGAMEAI AUTONOMOUS ARENA RELAY (web/relay.js)
 * Dual-Game Autonomous Player & Live Streamer for:
 *   - https://topgameai.com/arena/snake
 *   - https://topgameai.com/arena/2048
 *
 * HOW IT WORKS:
 * 1. Go to topgameai.com/arena/snake or topgameai.com/arena/2048
 * 2. Open Chrome DevTools (F12 -> Console) and paste:
 *    fetch('http://localhost:8000/relay.js').then(r=>r.text()).then(eval)
 * 3. The floating purple HUD appears on the bottom-right, locking team to '4-Goats'.
 * 4. Click '▶ Play Now' on topgameai.com.
 * 5. Laya autonomous solver takes over the game immediately in real-time.
 * 6. Simultaneously streams each step and decision to http://localhost:8000/dashboard.html#/live
 * ==========================================================================
 */

(function () {
  const LOCAL_API = 'http://localhost:8000';
  const TEAM_NAME = '4-Goats';

  // Detect current game from URL or DOM
  const is2048Page = window.location.pathname.includes('2048') || window.location.href.includes('2048');
  let activeGame = is2048Page ? '2048' : 'snake';

  let activeSessionId = null;
  let currentTeamName = TEAM_NAME;
  let isPlaying = false;
  let stepCount = 0;
  let currentDirection = 'right';

  console.log(`%c[BeatTheBot] Autonomous Relay Loaded for ${activeGame.toUpperCase()} ARENA! Waiting for "Play Now" click on topgameai.com...`, 'color: #a855f7; font-weight: bold; font-size: 14px;');

  // --- FLOATING HUD BADGE ON TOPGAMEAI.COM ---
  function ensureBadge() {
    let badge = document.getElementById('btb-relay-hud');
    if (!badge) {
      const parent = document.body || document.documentElement;
      if (!parent) return;

      badge = document.createElement('div');
      badge.id = 'btb-relay-hud';
      badge.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 999999999;
        background: rgba(15, 23, 42, 0.96);
        border: 2px solid #9333ea;
        box-shadow: 0 10px 40px rgba(147, 51, 234, 0.55);
        border-radius: 12px;
        padding: 14px 18px;
        color: #fff;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        font-size: 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-width: 340px;
      `;
      badge.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="display: inline-flex; align-items: center; gap: 6px; font-weight: bold; color: #d8b4fe;">
            <span id="btb-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #4ade80; box-shadow: 0 0 8px #4ade80;"></span>
            BEAT THE BOT LIVE
          </span>
          <div style="display: flex; gap: 4px;">
            <span id="btb-game-tag" style="font-size: 10px; color: #38bdf8; background: rgba(56, 189, 248, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: bold;">
              ${activeGame.toUpperCase()}
            </span>
            <span id="btb-team-tag" style="font-size: 10px; color: #a855f7; background: rgba(168, 85, 247, 0.2); padding: 2px 6px; border-radius: 4px; font-weight: bold;">
              4-GOATS
            </span>
          </div>
        </div>
        <div id="btb-relay-msg" style="color: #94a3b8; font-size: 11px;">
          Ready: Enter team name & click <strong>▶ Play Now</strong> to start!
        </div>
        <a href="${LOCAL_API}/dashboard.html#/live" target="_blank" style="color: #38bdf8; text-decoration: underline; font-size: 11px; margin-top: 4px;">
          Open Local Dashboard Stream ↗
        </a>
      `;
      parent.appendChild(badge);
    }
  }

  function setStatus(msg, isHighlight = false) {
    ensureBadge();
    const el = document.getElementById('btb-relay-msg');
    if (el) {
      el.innerHTML = msg;
      el.style.color = isHighlight ? '#4ade80' : '#d8b4fe';
    }
  }

  // Pre-fill '4-Goats' into team name input if empty or Anonymous
  const fillInput = () => {
    const input = document.querySelector('input[placeholder*="name" i]') || document.querySelector('input[type="text"]');
    if (input && (!input.value || input.value.toLowerCase() === 'anonymous')) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(input, TEAM_NAME);
      } else {
        input.value = TEAM_NAME;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const initDOM = () => {
    ensureBadge();
    fillInput();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDOM);
  } else {
    initDOM();
  }

  const initInterval = setInterval(() => {
    initDOM();
    if (document.getElementById('btb-relay-hud')) {
      clearInterval(initInterval);
    }
  }, 300);

  // ==========================================================================
  // SNAKE PATHFINDING & POLICY
  // ==========================================================================
  const SNAKE_WIDTH = 12;
  const SNAKE_HEIGHT = 12;
  const SNAKE_OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  const SNAKE_DIRS = {
    up: { dx: 0, dy: -1, key: 'ArrowUp' },
    down: { dx: 0, dy: 1, key: 'ArrowDown' },
    left: { dx: -1, dy: 0, key: 'ArrowLeft' },
    right: { dx: 1, dy: 0, key: 'ArrowRight' },
  };

  function bfsPath(start, target, blockedSet) {
    if (start.x === target.x && start.y === target.y) return [];
    const queue = [[start, []]];
    const visited = new Set([`${start.x},${start.y}`]);

    while (queue.length > 0) {
      const [curr, path] = queue.shift();
      for (const [dName, d] of Object.entries(SNAKE_DIRS)) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx < 0 || nx >= SNAKE_WIDTH || ny < 0 || ny >= SNAKE_HEIGHT) continue;
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
      for (const d of Object.values(SNAKE_DIRS)) {
        const nx = curr.x + d.dx;
        const ny = curr.y + d.dy;
        if (nx < 0 || nx >= SNAKE_WIDTH || ny < 0 || ny >= SNAKE_HEIGHT) continue;
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

  function chooseBestSnakeMove(snake, food, direction) {
    const head = snake[0];
    const bodyBlocks = new Set(snake.slice(0, -1).map((s) => `${s.x},${s.y}`));
    const legalDirs = {};

    for (const [dName, d] of Object.entries(SNAKE_DIRS)) {
      if (dName === SNAKE_OPPOSITE[direction]) continue;
      const nx = head.x + d.dx;
      const ny = head.y + d.dy;
      if (nx < 0 || nx >= SNAKE_WIDTH || ny < 0 || ny >= SNAKE_HEIGHT) continue;
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

  // ==========================================================================
  // 2048 HEURISTIC EXPECTIMAX SOLVER
  // ==========================================================================
  const ACTIONS_2048 = ['up', 'down', 'left', 'right'];
  const WEIGHTS_BL = [
    [   16,     8,     4,     2],
    [   32,    64,   128,   256],
    [ 4096,  2048,  1024,   512],
    [65536, 32768, 16384,  8192]
  ];

  function slideRowLeft(row) {
    const nonZero = row.filter((v) => v !== 0);
    const merged = [];
    let scoreGain = 0;
    let skip = false;

    for (let i = 0; i < nonZero.length; i++) {
      if (skip) {
        skip = false;
        continue;
      }
      if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
        const val = nonZero[i] * 2;
        merged.push(val);
        scoreGain += val;
        skip = true;
      } else {
        merged.push(nonZero[i]);
      }
    }
    while (merged.length < 4) merged.push(0);
    return { row: merged, scoreGain };
  }

  function simulateMove2048(grid, action) {
    const g = grid.map((r) => [...r]);
    let scoreGain = 0;
    let newG = [];

    if (action === 'left') {
      for (const r of g) {
        const res = slideRowLeft(r);
        newG.push(res.row);
        scoreGain += res.scoreGain;
      }
    } else if (action === 'right') {
      for (const r of g) {
        const res = slideRowLeft([...r].reverse());
        newG.push(res.row.reverse());
        scoreGain += res.scoreGain;
      }
    } else if (action === 'up') {
      const trans = [0, 1, 2, 3].map((c) => g.map((r) => r[c]));
      const newTrans = [];
      for (const r of trans) {
        const res = slideRowLeft(r);
        newTrans.push(res.row);
        scoreGain += res.scoreGain;
      }
      newG = [0, 1, 2, 3].map((c) => newTrans.map((r) => r[c]));
    } else if (action === 'down') {
      const trans = [0, 1, 2, 3].map((c) => g.map((r) => r[c]));
      const newTrans = [];
      for (const r of trans) {
        const res = slideRowLeft([...r].reverse());
        newTrans.push(res.row.reverse());
        scoreGain += res.scoreGain;
      }
      newG = [0, 1, 2, 3].map((c) => newTrans.map((r) => r[c]));
    } else {
      return { grid: g, scoreGain: 0, changed: false };
    }

    const changed = JSON.stringify(newG) !== JSON.stringify(grid);
    return { grid: newG, scoreGain, changed };
  }

  function getEmptyCells(grid) {
    const empty = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] === 0) empty.push({ r, c });
      }
    }
    return empty;
  }

  function evaluateBoard2048(grid) {
    const empty = getEmptyCells(grid).length;
    let weightScore = 0;
    let maxVal = 0;
    let maxR = 0, maxC = 0;

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const val = grid[r][c];
        if (val > maxVal) {
          maxVal = val;
          maxR = r;
          maxC = c;
        }
        if (val > 0) weightScore += val * WEIGHTS_BL[r][c];
      }
    }

    const cornerBonus = maxR === 3 && maxC === 0 ? maxVal * 10 : -maxVal * 5;

    let smoothness = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (grid[r][c] > 0) {
          const v = Math.log2(grid[r][c]);
          if (c + 1 < 4 && grid[r][c + 1] > 0) {
            smoothness -= Math.abs(v - Math.log2(grid[r][c + 1]));
          }
          if (r + 1 < 4 && grid[r + 1][c] > 0) {
            smoothness -= Math.abs(v - Math.log2(grid[r + 1][c]));
          }
        }
      }
    }

    let monotonicity = 0;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        if (grid[r][c] >= grid[r][c + 1]) monotonicity += 1;
        else monotonicity -= 2;
      }
    }
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 3; r++) {
        if (grid[r + 1][c] >= grid[r][c]) monotonicity += 1;
        else monotonicity -= 2;
      }
    }

    return weightScore + empty * 2000 + cornerBonus + smoothness * 100 + monotonicity * 200;
  }

  function expectimax2048(grid, depth, isAgent = true) {
    if (depth === 0) return evaluateBoard2048(grid);

    if (isAgent) {
      let bestScore = -Infinity;
      let hasMoves = false;
      for (const a of ACTIONS_2048) {
        const sim = simulateMove2048(grid, a);
        if (sim.changed) {
          hasMoves = true;
          const val = sim.scoreGain * 2.0 + expectimax2048(sim.grid, depth - 1, false);
          if (val > bestScore) bestScore = val;
        }
      }
      return hasMoves ? bestScore : -100000;
    } else {
      const empty = getEmptyCells(grid);
      if (empty.length === 0) return evaluateBoard2048(grid);
      const sample = empty.length <= 3 ? empty : empty.slice(0, 3);
      let totalVal = 0;
      for (const pos of sample) {
        const g2 = grid.map((r) => [...r]);
        g2[pos.r][pos.c] = 2;
        totalVal += 0.9 * expectimax2048(g2, depth - 1, true);
        const g4 = grid.map((r) => [...r]);
        g4[pos.r][pos.c] = 4;
        totalVal += 0.1 * expectimax2048(g4, depth - 1, true);
      }
      return totalVal / sample.length;
    }
  }

  function chooseBest2048Move(grid) {
    let bestMove = null;
    let bestVal = -Infinity;

    for (const a of ACTIONS_2048) {
      const sim = simulateMove2048(grid, a);
      if (!sim.changed) continue;
      const val = sim.scoreGain * 2.0 + expectimax2048(sim.grid, 2, false);
      if (val > bestVal) {
        bestVal = val;
        bestMove = a;
      }
    }

    if (!bestMove) {
      // Fallback: any direction that changes board
      for (const a of ['down', 'left', 'right', 'up']) {
        if (simulateMove2048(grid, a).changed) return a;
      }
      return 'down';
    }
    return bestMove;
  }

  function calc2048Points(bestTile, score) {
    if (!bestTile || bestTile <= 0) return 0;
    const exponent = Math.floor(Math.log2(bestTile));
    const tileFactor = Math.max(0, exponent - 6) * 143;
    const scoreFactor = Math.floor((score || 0) / 1000);
    return Math.min(1000, tileFactor + scoreFactor);
  }

  // --- DISPATCH REAL KEYBOARD EVENT TO TOPGAMEAI PAGE ---
  function dispatchMove(moveDir) {
    currentDirection = moveDir;
    const keyMap = {
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    };
    const keyName = keyMap[moveDir] || 'ArrowDown';

    // Dispatch to window
    const event = new KeyboardEvent('keydown', {
      key: keyName,
      code: keyName,
      bubbles: true,
      cancelable: true,
      keyCode: keyDirToKeyCode(moveDir),
      which: keyDirToKeyCode(moveDir),
    });
    window.dispatchEvent(event);
  }

  function keyDirToKeyCode(dir) {
    switch (dir) {
      case 'left': return 37;
      case 'up': return 38;
      case 'right': return 39;
      case 'down': return 40;
      default: return 40;
    }
  }

  // --- SEND STEP TELEMETRY TO LOCAL WEBSITE DASHBOARD ---
  async function sendLocalStep(payload) {
    try {
      await fetch(`${LOCAL_API}/api/arena/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      // Local server might be on another port or temporarily slow
    }
  }

  // --- INTERCEPT TOPGAMEAI API CALLS (SESSIONS & ACTIONS) ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;

    // Guarantee agent_name is 4-Goats on session creation
    if (url && url.includes('/api/arena/sessions') && !url.includes('/action')) {
      if (args[1] && args[1].body) {
        try {
          const bodyObj = JSON.parse(args[1].body);
          if (!bodyObj.agent_name || bodyObj.agent_name.toLowerCase() === 'anonymous') {
            bodyObj.agent_name = TEAM_NAME;
            args[1].body = JSON.stringify(bodyObj);
          }
        } catch (e) {}
      }
    }

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

          // Detect game from server response or state
          if (data.game === '2048' || (data.state && Array.isArray(data.state.grid) && data.state.grid.length === 4)) {
            activeGame = '2048';
          } else {
            activeGame = 'snake';
          }

          const reqBody = args[1]?.body ? JSON.parse(args[1].body) : {};
          currentTeamName = reqBody.agent_name || TEAM_NAME;

          const teamTag = document.getElementById('btb-team-tag');
          if (teamTag) teamTag.textContent = currentTeamName.toUpperCase();
          const gameTag = document.getElementById('btb-game-tag');
          if (gameTag) gameTag.textContent = activeGame.toUpperCase();

          if (activeGame === '2048') {
            const st = data.state || {};
            const grid = st.grid || [[0,0,0,0],[0,0,0,0],[0,0,2,2],[0,0,0,0]];
            const best = st.best || 2;
            const inScore = st.score || 0;
            const pts = calc2048Points(best, inScore);

            setStatus(`⚡ 2048 Connected! Best: ${best} | Score: ${inScore} | Pts: ${pts}`, true);

            sendLocalStep({
              session_id: activeSessionId,
              game_id: '2048',
              step: 0,
              state: st,
              action: null,
              score: pts,
              in_game_score: inScore,
              done: false,
              won: false,
              agent_name: currentTeamName,
            });

            setTimeout(() => {
              if (!isPlaying) return;
              const nextMove = chooseBest2048Move(grid);
              dispatchMove(nextMove);
            }, 180);
          } else {
            // Snake game initialization
            setStatus(`⚡ Snake Connected! Food: 0/15 | Score: 0 pts`, true);
            sendLocalStep({
              session_id: activeSessionId,
              game_id: 'snake',
              step: 0,
              state: data.state || {},
              action: null,
              score: data.score || 0,
              done: false,
              won: false,
              agent_name: currentTeamName,
            });

            setTimeout(() => {
              if (!isPlaying || !data.state) return;
              const nextMove = chooseBestSnakeMove(data.state.snake, data.state.food, data.state.direction || 'right');
              dispatchMove(nextMove);
            }, 180);
          }
        }
      }

      // 2. Action executed (returned from topgameai server)
      if (url && url.includes('/api/arena/sessions/') && url.includes('/action')) {
        const clone = response.clone();
        const data = await clone.json();

        if (data && !data.error && isPlaying) {
          stepCount = (data.steps !== undefined && data.steps > stepCount) ? data.steps : stepCount + 1;
          const st = data.state || {};
          const done = Boolean(data.done);
          const won = Boolean(data.won);

          if (activeGame === '2048') {
            const grid = st.grid || [];
            const inScore = st.score || 0;
            const bestTile = st.best || (grid.length ? Math.max(...grid.flat()) : 2);
            const pts = calc2048Points(bestTile, inScore);

            setStatus(`⚡ 2048 Step ${stepCount}: Best ${bestTile} | Score ${inScore} | Pts: ${pts}`, true);

            sendLocalStep({
              session_id: activeSessionId,
              game_id: '2048',
              step: stepCount,
              state: st,
              action: currentDirection,
              score: pts,
              in_game_score: inScore,
              done: done || stepCount >= 2000,
              won,
              agent_name: currentTeamName,
            });

            if (done || stepCount >= 2000) {
              isPlaying = false;
              setStatus(`🏆 2048 Finished! Best Tile: ${bestTile} | Score: ${inScore} | Points: ${pts} (${currentTeamName})<br><a href="${LOCAL_API}/dashboard.html#/autopsy?session=${activeSessionId}" target="_blank" style="color: #4ade80; font-weight: bold; text-decoration: underline;">🔬 View Decision Autopsy</a> | <a href="${LOCAL_API}/dashboard.html#/replay?session=${activeSessionId}" target="_blank" style="color: #38bdf8; font-weight: bold; text-decoration: underline;">⏪ Replay Steps</a>`, true);
              return response;
            }

            // Dispatch NEXT 2048 move after 110ms delay
            setTimeout(() => {
              if (!isPlaying) return;
              const nextMove = chooseBest2048Move(grid);
              dispatchMove(nextMove);
            }, 110);
          } else {
            // Snake game action handling
            const foods = st.foodEaten ?? 0;
            setStatus(`⚡ Step ${stepCount}: Foods ${foods}/15 | Score: ${data.score} pts`, true);

            sendLocalStep({
              session_id: activeSessionId,
              game_id: 'snake',
              step: stepCount,
              state: st,
              action: currentDirection,
              score: data.score || 0,
              done,
              won,
              agent_name: currentTeamName,
            });

            if (done) {
              isPlaying = false;
              if (won || foods >= 15) {
                setStatus(`🏆 VICTORY! 15 foods eaten! Leaderboard updated as <strong>${currentTeamName}</strong>!`, true);
              } else {
                setStatus(`Game finished (score: ${data.score}).`, false);
              }
              return response;
            }

            setTimeout(() => {
              if (!isPlaying) return;
              const nextMove = chooseBestSnakeMove(st.snake, st.food, st.direction || currentDirection);
              dispatchMove(nextMove);
            }, 90);
          }
        }
      }
    } catch (err) {
      console.warn('[BeatTheBot] Error tracking move:', err);
    }

    return response;
  };
})();
