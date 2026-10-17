/**
 * ==========================================================================
 * BEAT THE BOT — TOPGAMEAI DUAL ARENA VIEWPORT (components/gameCanvas.js)
 * Live graphical canvas & simulation matching https://topgameai.com/arena:
 *   - Snake: 12x12 Grid, 15 foods target, step limit 300
 *   - 2048:  4x4 Grid, merge mechanics, step limit 2000, points formula
 *   - Dual modes: ⚡ Autonomous Laya Engine & 🎮 Interactive "You Play" (WASD/Arrows)
 * ==========================================================================
 */

import * as sound from '../sound.js';

export const TOPGAMEAI_PALETTE = {
  0: '#111827', // Empty cell
  1: '#16a34a', // Snake body
  2: '#ef4444', // Food (apple)
  3: '#4ade80', // Snake head
};

export const TOPGAMEAI_2048_PALETTE = {
  0: { bg: '#1e293b', fg: '#334155', glow: null },
  2: { bg: '#334155', fg: '#f8fafc', glow: null },
  4: { bg: '#475569', fg: '#f8fafc', glow: null },
  8: { bg: '#d97706', fg: '#ffffff', glow: 'rgba(217, 119, 6, 0.4)' },
  16: { bg: '#ea580c', fg: '#ffffff', glow: 'rgba(234, 88, 12, 0.45)' },
  32: { bg: '#dc2626', fg: '#ffffff', glow: 'rgba(220, 38, 38, 0.5)' },
  64: { bg: '#e11d48', fg: '#ffffff', glow: 'rgba(225, 29, 72, 0.55)' },
  128: { bg: '#f59e0b', fg: '#ffffff', glow: 'rgba(245, 158, 11, 0.6)' },
  256: { bg: '#eab308', fg: '#ffffff', glow: 'rgba(234, 179, 8, 0.65)' },
  512: { bg: '#10b981', fg: '#ffffff', glow: 'rgba(16, 185, 129, 0.7)' },
  1024: { bg: '#06b6d4', fg: '#ffffff', glow: 'rgba(6, 182, 212, 0.8)' },
  2048: { bg: '#8b5cf6', fg: '#ffffff', glow: 'rgba(139, 92, 246, 0.95)' },
  4096: { bg: '#ec4899', fg: '#ffffff', glow: 'rgba(236, 72, 153, 0.95)' },
};

export const OPPOSITE_DIRECTIONS = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

// 2048 Heuristic Weights (Bottom-Left Anchor)
const WEIGHTS_BL = [
  [   16,     8,     4,     2],
  [   32,    64,   128,   256],
  [ 4096,  2048,  1024,   512],
  [65536, 32768, 16384,  8192]
];

export function calcPoints2048(bestTile, score) {
  if (!bestTile || bestTile <= 0) return 0;
  const exponent = Math.floor(Math.log2(bestTile));
  const tileFactor = Math.max(0, exponent - 6) * 143;
  const scoreFactor = Math.floor((score || 0) / 1000);
  return Math.min(1000, tileFactor + scoreFactor);
}

export class GameViewport {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    this.gameType = options.gameType || 'snake'; // 'snake' | '2048'
    this.mode = 'laya'; // 'laya' | 'manual'
    this.isPaused = false;

    // --- SNAKE STATE (12x12) ---
    this.width = 12;
    this.height = 12;
    this.maxSteps = 300;
    this.targetFood = 15;
    this.snake = [
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 }
    ];
    this.direction = 'right';
    this.nextDirection = 'right';
    this.food = { x: 6, y: 2 };
    this.foodEaten = 0;
    this.score = 0;
    this.steps = 0;
    this.done = false;
    this.won = false;
    this.grid = Array.from({ length: 12 }, () => Array(12).fill(0));
    this.rebuildGrid();

    // --- 2048 STATE (4x4) ---
    this.grid2048 = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 2, 2],
      [0, 0, 0, 0]
    ];
    this.bestTile = 2;
    this.inGameScore = 0;
    this.points2048 = 0;
    this.steps2048 = 0;
    this.maxSteps2048 = 2000;

    // Common Telemetry
    this.probabilities = { up: 0.1, down: 0.1, left: 0.1, right: 0.7 };
    this.lastConfidence = 0.70;

    // Timing & FX
    this.moveTimer = 0;
    this.moveInterval = 650;
    this.particles = [];
    this.floatingTexts = [];

    // Canvas
    this.canvas = null;
    this.ctx = null;
    this.animId = null;
    this.lastTime = performance.now();

    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundResize = this.handleResize.bind(this);

    this.initDOM();
    this.setupListeners();
    this.updateHUDStats();
    this.startLoop();
  }

  initDOM() {
    this.container.innerHTML = `
      <div class="arcade-monitor hud-card" id="arcade-monitor-card">
        <!-- Monitor Header -->
        <div class="arcade-header">
          <div class="arcade-title-group">
            <span class="arcade-crt-dot" aria-hidden="true"></span>
            <span class="arcade-title" id="arcade-title-label">
              ${this.gameType === '2048' ? 'TOPGAMEAI 2048 ARENA // TEAM: 4-GOATS' : 'TOPGAMEAI SNAKE ARENA // TEAM: 4-GOATS'}
            </span>
          </div>

          <div class="arcade-header-controls" style="display: flex; gap: 8px; align-items: center;">
            <span class="badge" id="arcade-game-tag" style="background: rgba(56, 189, 248, 0.2); border-color: #38bdf8; color: #38bdf8; font-size: 10px;">
              ${this.gameType.toUpperCase()}
            </span>
            <span class="badge badge-live" id="arcade-mode-badge" style="background: rgba(147, 51, 234, 0.25); border-color: #a855f7; color: #d8b4fe;">
              ⚡ TOPGAMEAI ARENA LIVE
            </span>
          </div>
        </div>

        <!-- Canvas Viewport Frame with CRT Aesthetics -->
        <div class="arcade-viewport-frame" id="arcade-frame">
          <canvas id="live-game-canvas" width="760" height="360" aria-label="TopGameAI Game Arena"></canvas>
          <div class="arcade-scanlines" aria-hidden="true"></div>
          <div class="arcade-vignette" aria-hidden="true"></div>

          <!-- On-screen Manual Play Directional Touch Controls -->
          <div class="arcade-touch-controls" id="arcade-touch-controls" style="display: none;">
            <button class="touch-btn" id="touch-up" aria-label="Move Up">⬆ UP</button>
            <div style="display: flex; gap: 8px;">
              <button class="touch-btn" id="touch-left" aria-label="Move Left">⬅ LEFT</button>
              <button class="touch-btn" id="touch-down" aria-label="Move Down">⬇ DOWN</button>
              <button class="touch-btn" id="touch-right" aria-label="Move Right">➡ RIGHT</button>
            </div>
          </div>
        </div>

        <!-- Monitor Footer Bar -->
        <div class="arcade-footer">
          <div class="arcade-stats-row">
            <div class="arcade-stat-item">
              <span class="arcade-stat-label" id="arcade-label-stat1">SCORE:</span>
              <span class="arcade-stat-value" id="arcade-val-score" style="color: var(--arcade-yellow, #ffd000);">0000</span>
            </div>
            <div class="arcade-stat-item">
              <span class="arcade-stat-label" id="arcade-label-stat2">FOOD EATEN:</span>
              <span class="arcade-stat-value" id="arcade-val-food" style="color: var(--arcade-green, #4ade80);">0 / 15</span>
            </div>
            <div class="arcade-stat-item">
              <span class="arcade-stat-label" id="arcade-label-stat3">STEPS:</span>
              <span class="arcade-stat-value" id="arcade-val-steps" style="color: var(--neon-cyan, #22e6ff);">0 / 300</span>
            </div>
            <div class="arcade-stat-item">
              <span class="arcade-stat-label" id="arcade-label-stat4">HEADING:</span>
              <span class="arcade-stat-value" id="arcade-val-heading" style="color: #ffffff;">RIGHT</span>
            </div>
          </div>

          <div class="arcade-actions-row">
            <button id="btn-pause-game" class="btn btn-ghost btn-xs" aria-label="Pause or resume simulation">
              <span>⏸ PAUSE</span>
            </button>
            <button id="btn-toggle-manual-play" class="btn btn-ghost btn-xs" aria-label="Switch between Laya driving and manual player control">
              <span>🎮 TAKE OVER</span>
            </button>
            <button id="btn-restart-game" class="btn btn-secondary btn-xs" aria-label="Restart game simulation">
              <span>🔄 RESTART</span>
            </button>
          </div>
        </div>
      </div>
    `;

    this.canvas = this.container.querySelector('#live-game-canvas');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.handleResize();
  }

  setupListeners() {
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeyDown);

    const btnPause = this.container.querySelector('#btn-pause-game');
    if (btnPause) btnPause.addEventListener('click', () => this.togglePause());

    const btnToggle = this.container.querySelector('#btn-toggle-manual-play');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this.setMode(this.mode === 'laya' ? 'manual' : 'laya');
      });
    }

    const btnRestart = this.container.querySelector('#btn-restart-game');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        if (typeof this.options.onRestart === 'function') {
          this.options.onRestart();
        } else {
          this.resetGame();
        }
      });
    }

    const touchUp = this.container.querySelector('#touch-up');
    const touchDown = this.container.querySelector('#touch-down');
    const touchLeft = this.container.querySelector('#touch-left');
    const touchRight = this.container.querySelector('#touch-right');

    if (touchUp) touchUp.addEventListener('click', () => this.requestDirection('up'));
    if (touchDown) touchDown.addEventListener('click', () => this.requestDirection('down'));
    if (touchLeft) touchLeft.addEventListener('click', () => this.requestDirection('left'));
    if (touchRight) touchRight.addEventListener('click', () => this.requestDirection('right'));
  }

  handleResize() {
    if (!this.canvas || !this.container) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(320, Math.floor(rect.width));
    const targetH = Math.max(260, Math.min(420, Math.floor(rect.height || 360)));

    if (this.canvas.width !== targetW * dpr || this.canvas.height !== targetH * dpr) {
      this.canvas.width = targetW * dpr;
      this.canvas.height = targetH * dpr;
      this.canvas.style.width = `${targetW}px`;
      this.canvas.style.height = `${targetH}px`;
      this.ctx.scale(dpr, dpr);
    }
  }

  setGameType(newType) {
    this.gameType = newType === '2048' ? '2048' : 'snake';
    const title = this.container.querySelector('#arcade-title-label');
    const tag = this.container.querySelector('#arcade-game-tag');
    if (title) {
      title.textContent = this.gameType === '2048'
        ? 'TOPGAMEAI 2048 ARENA // TEAM: 4-GOATS'
        : 'TOPGAMEAI SNAKE ARENA // TEAM: 4-GOATS';
    }
    if (tag) tag.textContent = this.gameType.toUpperCase();

    const l1 = this.container.querySelector('#arcade-label-stat1');
    const l2 = this.container.querySelector('#arcade-label-stat2');
    const l3 = this.container.querySelector('#arcade-label-stat3');
    const l4 = this.container.querySelector('#arcade-label-stat4');

    if (this.gameType === '2048') {
      if (l1) l1.textContent = 'IN-SCORE:';
      if (l2) l2.textContent = 'BEST TILE:';
      if (l3) l3.textContent = 'POINTS:';
      if (l4) l4.textContent = 'STEPS:';
      this.reset2048();
    } else {
      if (l1) l1.textContent = 'SCORE:';
      if (l2) l2.textContent = 'FOOD EATEN:';
      if (l3) l3.textContent = 'STEPS:';
      if (l4) l4.textContent = 'HEADING:';
      this.resetSnake();
    }

    this.updateHUDStats();
  }

  updateHUDStats() {
    const valScore = this.container.querySelector('#arcade-val-score');
    const valFood = this.container.querySelector('#arcade-val-food');
    const valSteps = this.container.querySelector('#arcade-val-steps');
    const valHeading = this.container.querySelector('#arcade-val-heading');

    if (this.gameType === '2048') {
      if (valScore) valScore.textContent = String(this.inGameScore).padStart(4, '0');
      if (valFood) valFood.textContent = String(this.bestTile);
      if (valSteps) valSteps.textContent = `${this.points2048} PTS`;
      if (valHeading) valHeading.textContent = `${this.steps2048} / ${this.maxSteps2048}`;
    } else {
      if (valScore) valScore.textContent = String(this.score).padStart(4, '0');
      if (valFood) valFood.textContent = `${this.foodEaten} / ${this.targetFood}`;
      if (valSteps) valSteps.textContent = `${this.steps} / ${this.maxSteps}`;
      if (valHeading) valHeading.textContent = this.direction.toUpperCase();
    }
  }

  resetGame() {
    if (this.gameType === '2048') {
      this.reset2048();
    } else {
      this.resetSnake();
    }
    this.updateHUDStats();
    sound.playSelectTone();
  }

  resetSkin() {
    this.resetGame();
  }

  resetSnake() {
    this.snake = [
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 }
    ];
    this.direction = 'right';
    this.nextDirection = 'right';
    this.foodEaten = 0;
    this.score = 0;
    this.steps = 0;
    this.done = false;
    this.won = false;
    this.particles = [];
    this.floatingTexts = [];
    this.spawnFood();
    this.rebuildGrid();
  }

  reset2048() {
    this.grid2048 = [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 2, 2],
      [0, 0, 0, 0]
    ];
    this.bestTile = 2;
    this.inGameScore = 0;
    this.points2048 = 0;
    this.steps2048 = 0;
    this.done = false;
    this.won = false;
    this.direction = 'down';
    this.particles = [];
    this.floatingTexts = [];
  }

  feedStep(event) {
    if (!event) return;
    const is2048 = event.game_id === '2048' || (event.state?.facts?.grid && event.state.facts.grid.length === 4);

    if (is2048 && this.gameType !== '2048') {
      this.setGameType('2048');
    } else if (!is2048 && this.gameType !== 'snake') {
      this.setGameType('snake');
    }

    if (this.gameType === '2048') {
      const facts = event.state?.facts || {};
      if (facts.grid) this.grid2048 = facts.grid;
      this.bestTile = facts.best || (this.grid2048 ? Math.max(...this.grid2048.flat()) : 2);
      this.inGameScore = facts.score ?? 0;
      this.points2048 = event.state?.score ?? calcPoints2048(this.bestTile, this.inGameScore);
      this.steps2048 = event.step || 0;
      this.direction = event.final_action || this.direction;
      this.done = Boolean(event.state?.done);

      if (event.laya_calls?.[0]?.action_scores) {
        this.probabilities = event.laya_calls[0].action_scores;
      }
    } else {
      const facts = event.state?.facts || {};
      if (facts.snake) this.snake = facts.snake;
      if (facts.food) this.food = facts.food;
      this.foodEaten = facts.food_eaten ?? this.foodEaten;
      this.score = event.state?.score ?? this.score;
      this.steps = event.step || 0;
      this.direction = facts.direction || event.final_action || this.direction;
      this.done = Boolean(event.state?.done);

      if (event.laya_calls?.[0]?.action_scores) {
        this.probabilities = event.laya_calls[0].action_scores;
      }
      this.rebuildGrid();
    }

    this.updateHUDStats();
  }

  setMode(newMode) {
    this.mode = newMode;
    const badge = this.container.querySelector('#arcade-mode-badge');
    const btn = this.container.querySelector('#btn-toggle-manual-play');
    const touchControls = this.container.querySelector('#arcade-touch-controls');

    if (newMode === 'manual') {
      if (badge) {
        badge.textContent = '🎮 YOU PLAY (ARROWS/WASD)';
        badge.style.background = 'rgba(255, 208, 0, 0.2)';
        badge.style.color = '#ffd000';
        badge.style.borderColor = '#ffd000';
      }
      if (btn) btn.innerHTML = '<span>⚡ LAYA AUTONOMOUS</span>';
      if (touchControls) touchControls.style.display = 'flex';
      this.addFloatingText('MANUAL CONTROL ACTIVE!', this.canvas.width / 4, 60, '#ffd000');
    } else {
      if (badge) {
        badge.textContent = '⚡ LAYA AUTONOMOUS';
        badge.style.background = '';
        badge.style.color = '';
        badge.style.borderColor = '';
      }
      if (btn) btn.innerHTML = '<span>🎮 TAKE OVER</span>';
      if (touchControls) touchControls.style.display = 'none';
      this.addFloatingText('LAYA AUTONOMOUS MODE', this.canvas.width / 4, 60, '#4ade80');
    }
    sound.playSelectTone();
  }

  togglePause() {
    this.setPaused(!this.isPaused);
  }

  setPaused(paused) {
    this.isPaused = paused;
    const btn = this.container.querySelector('#btn-pause-game');
    if (btn) {
      btn.innerHTML = paused ? '<span>▶ RESUME</span>' : '<span>⏸ PAUSE</span>';
    }
    sound.playStepClickSound();
  }

  handleKeyDown(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA')) {
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      this.togglePause();
      return;
    }

    if (this.mode !== 'manual') return;

    let targetDir = null;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') targetDir = 'up';
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') targetDir = 'down';
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') targetDir = 'left';
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') targetDir = 'right';

    if (targetDir) {
      e.preventDefault();
      this.requestDirection(targetDir);
    }
  }

  requestDirection(dir) {
    if (this.isPaused || this.done) return;
    if (this.gameType === '2048') {
      this.requestMove2048(dir);
    } else {
      this.requestMoveSnake(dir);
    }
  }

  // --- SNAKE CONTROLS & LOGIC ---
  requestMoveSnake(dir) {
    if (OPPOSITE_DIRECTIONS[this.direction] === dir) {
      this.addFloatingText('CANNOT REVERSE!', this.canvas.width / 4, 70, '#ff4d6d');
      try { sound.playCollisionSound?.(); } catch (e) {}
      return;
    }
    this.nextDirection = dir;
    try { sound.playStepClickSound?.(); } catch (e) {}

    if (this.mode === 'manual') {
      this.stepSnake();
    }
  }

  rebuildGrid() {
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 12; c++) {
        this.grid[r][c] = 0;
      }
    }
    if (this.food && this.food.y >= 0 && this.food.y < 12 && this.food.x >= 0 && this.food.x < 12) {
      this.grid[this.food.y][this.food.x] = 2;
    }
    for (let i = 1; i < this.snake.length; i++) {
      const seg = this.snake[i];
      if (seg.y >= 0 && seg.y < 12 && seg.x >= 0 && seg.x < 12) {
        this.grid[seg.y][seg.x] = 1;
      }
    }
    if (this.snake.length > 0) {
      const head = this.snake[0];
      if (head.y >= 0 && head.y < 12 && head.x >= 0 && head.x < 12) {
        this.grid[head.y][head.x] = 3;
      }
    }
  }

  spawnFood() {
    const occupied = new Set(this.snake.map(s => `${s.x},${s.y}`));
    const empty = [];
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 12; c++) {
        if (!occupied.has(`${c},${r}`)) empty.push({ x: c, y: r });
      }
    }
    if (empty.length > 0) {
      this.food = empty[Math.floor(Math.random() * empty.length)];
    }
  }

  stepSnake() {
    if (this.done || this.isPaused) return;

    this.direction = this.nextDirection;
    const head = this.snake[0];
    const newHead = { x: head.x, y: head.y };

    if (this.direction === 'up') newHead.y -= 1;
    else if (this.direction === 'down') newHead.y += 1;
    else if (this.direction === 'left') newHead.x -= 1;
    else if (this.direction === 'right') newHead.x += 1;

    this.steps += 1;

    if (newHead.x < 0 || newHead.x >= 12 || newHead.y < 0 || newHead.y >= 12) {
      this.handleGameOver(false, 'HIT WALL');
      return;
    }
    for (let i = 0; i < this.snake.length - 1; i++) {
      if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
        this.handleGameOver(false, 'HIT BODY');
        return;
      }
    }

    this.snake.unshift(newHead);

    let ateFood = false;
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      ateFood = true;
      this.foodEaten += 1;
      this.score = this.foodEaten * 60;
      this.addParticles(this.canvas.width / 4, this.canvas.height / 4, 14, '#4ade80');
      this.addFloatingText('+60 FOOD!', this.canvas.width / 4, 90, '#4ade80');
      try { sound.playSuccessChime?.(); } catch (e) {}

      if (this.foodEaten >= this.targetFood) {
        this.score += 100;
        this.handleGameOver(true, '15 FOODS EATEN — VICTORY!');
        return;
      }
      this.spawnFood();
    } else {
      this.snake.pop();
    }

    if (this.steps >= this.maxSteps) {
      const won = this.foodEaten >= this.targetFood;
      this.handleGameOver(won, 'STEP LIMIT REACHED');
      return;
    }

    this.rebuildGrid();
    this.updateHUDStats();
  }

  // --- 2048 CONTROLS & LOGIC ---
  requestMove2048(dir) {
    const sim = this.simulate2048(this.grid2048, dir);
    if (!sim.changed) {
      this.addFloatingText('MOVE UNCHANGED (REJECTED)', this.canvas.width / 4, 70, '#ff4d6d');
      return;
    }

    this.direction = dir;
    this.grid2048 = sim.grid;
    this.inGameScore += sim.scoreGain;
    this.steps2048 += 1;

    // Spawn new random tile (2 or 4)
    this.spawnTile2048();

    this.bestTile = Math.max(...this.grid2048.flat());
    this.points2048 = calcPoints2048(this.bestTile, this.inGameScore);

    if (sim.scoreGain > 0) {
      this.addFloatingText(`+${sim.scoreGain}`, this.canvas.width / 4, 90, '#ffd000');
      this.addParticles(this.canvas.width / 4, this.canvas.height / 4, 8, '#ffd000');
      try { sound.playGoodMoveSound?.(); } catch (e) {}
    } else {
      try { sound.playStepClickSound?.(); } catch (e) {}
    }

    if (this.bestTile >= 2048 && !this.won) {
      this.won = true;
      this.addFloatingText('★ 2048 TILE REACHED! ★', this.canvas.width / 4, 110, '#8b5cf6');
      try { sound.playSuccessChime?.(); } catch (e) {}
    }

    if (this.steps2048 >= this.maxSteps2048) {
      this.done = true;
      this.addFloatingText('2000 STEPS LIMIT REACHED', this.canvas.width / 4, 110, '#38bdf8');
    }

    this.updateHUDStats();
  }

  spawnTile2048() {
    const empty = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.grid2048[r][c] === 0) empty.push({ r, c });
      }
    }
    if (empty.length > 0) {
      const pos = empty[Math.floor(Math.random() * empty.length)];
      this.grid2048[pos.r][pos.c] = Math.random() < 0.1 ? 4 : 2;
    }
  }

  simulate2048(grid, action) {
    const g = grid.map(r => [...r]);
    let scoreGain = 0;

    const slideRow = (row) => {
      const nonZero = row.filter(v => v !== 0);
      const merged = [];
      let s = 0;
      let skip = false;
      for (let i = 0; i < nonZero.length; i++) {
        if (skip) { skip = false; continue; }
        if (i + 1 < nonZero.length && nonZero[i] === nonZero[i + 1]) {
          const val = nonZero[i] * 2;
          merged.push(val);
          s += val;
          skip = true;
        } else {
          merged.push(nonZero[i]);
        }
      }
      while (merged.length < 4) merged.push(0);
      return { row: merged, s };
    };

    let newG = [];
    if (action === 'left') {
      for (const r of g) {
        const res = slideRow(r);
        newG.push(res.row);
        scoreGain += res.s;
      }
    } else if (action === 'right') {
      for (const r of g) {
        const res = slideRow([...r].reverse());
        newG.push(res.row.reverse());
        scoreGain += res.s;
      }
    } else if (action === 'up') {
      const trans = [0, 1, 2, 3].map(c => g.map(r => r[c]));
      const newTrans = [];
      for (const r of trans) {
        const res = slideRow(r);
        newTrans.push(res.row);
        scoreGain += res.s;
      }
      newG = [0, 1, 2, 3].map(c => newTrans.map(r => r[c]));
    } else if (action === 'down') {
      const trans = [0, 1, 2, 3].map(c => g.map(r => r[c]));
      const newTrans = [];
      for (const r of trans) {
        const res = slideRow([...r].reverse());
        newTrans.push(res.row.reverse());
        scoreGain += res.s;
      }
      newG = [0, 1, 2, 3].map(c => newTrans.map(r => r[c]));
    } else {
      return { grid: g, scoreGain: 0, changed: false };
    }

    const changed = JSON.stringify(newG) !== JSON.stringify(grid);
    return { grid: newG, scoreGain, changed };
  }

  layaAutonomousDecision() {
    if (this.gameType === '2048') {
      this.layaAutonomous2048Decision();
    } else {
      this.layaAutonomousSnakeDecision();
    }
  }

  layaAutonomousSnakeDecision() {
    const head = this.snake[0];
    const tail = this.snake[this.snake.length - 1];
    const candidates = ['up', 'down', 'left', 'right'];
    const opposite = OPPOSITE_DIRECTIONS[this.direction];

    const blockedSet = new Set();
    for (let i = 0; i < this.snake.length - 1; i++) {
      blockedSet.add(`${this.snake[i].x},${this.snake[i].y}`);
    }

    let bestDir = 'right';
    let bestScore = -Infinity;
    const scores = {};

    for (const dir of candidates) {
      if (dir === opposite) continue;
      let nx = head.x, ny = head.y;
      if (dir === 'up') ny--;
      else if (dir === 'down') ny++;
      else if (dir === 'left') nx--;
      else if (dir === 'right') nx++;

      if (nx < 0 || nx >= 12 || ny < 0 || ny >= 12) continue;
      if (blockedSet.has(`${nx},${ny}`)) continue;

      let score = 100;
      if (this.food) {
        const dist = Math.abs(nx - this.food.x) + Math.abs(ny - this.food.y);
        score += (24 - dist) * 10;
      }
      scores[dir] = score;
      if (score > bestScore) {
        bestScore = score;
        bestDir = dir;
      }
    }

    this.direction = bestDir;
    this.nextDirection = bestDir;
    this.probabilities = {
      up: bestDir === 'up' ? 0.7 : 0.1,
      down: bestDir === 'down' ? 0.7 : 0.1,
      left: bestDir === 'left' ? 0.7 : 0.1,
      right: bestDir === 'right' ? 0.7 : 0.1,
    };
  }

  layaAutonomous2048Decision() {
    const candidates = ['up', 'down', 'left', 'right'];
    let bestDir = 'down';
    let bestVal = -Infinity;
    const scores = {};

    for (const a of candidates) {
      const sim = this.simulate2048(this.grid2048, a);
      if (!sim.changed) continue;

      // Evaluation
      let weightScore = 0;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          if (sim.grid[r][c] > 0) weightScore += sim.grid[r][c] * WEIGHTS_BL[r][c];
        }
      }
      const val = sim.scoreGain * 2.0 + weightScore;
      scores[a] = val;
      if (val > bestVal) {
        bestVal = val;
        bestDir = a;
      }
    }

    this.direction = bestDir;
    this.probabilities = {
      up: bestDir === 'up' ? 0.75 : 0.08,
      down: bestDir === 'down' ? 0.75 : 0.08,
      left: bestDir === 'left' ? 0.75 : 0.08,
      right: bestDir === 'right' ? 0.75 : 0.08,
    };
    this.step2048();
  }

  step2048() {
    this.requestMove2048(this.direction);
  }

  handleGameOver(won, reason) {
    this.done = true;
    this.won = won;
    this.updateHUDStats();

    if (won) {
      this.addFloatingText(`★ ${reason} ★`, this.canvas.width / 4, 110, '#ffd000');
      try { sound.playSuccessChime?.(); } catch (e) {}
    } else {
      this.addFloatingText(`OVER: ${reason}`, this.canvas.width / 4, 110, '#ff4d6d');
      try { sound.playCollisionSound?.(); } catch (e) {}
    }

    setTimeout(() => {
      if (this.done && this.mode === 'laya' && !this.isPaused) {
        this.resetGame();
      }
    }, 2400);
  }

  // --- RENDERING LOOP ---
  startLoop() {
    const render = (now) => {
      const dt = Math.min(now - this.lastTime, 100);
      this.lastTime = now;

      this.update(dt);
      this.draw();

      this.animId = requestAnimationFrame(render);
    };
    this.animId = requestAnimationFrame(render);
  }

  update(dt) {
    if (this.mode === 'laya' && !this.done && !this.isPaused) {
      this.moveTimer += dt;
      if (this.moveTimer >= this.moveInterval) {
        this.moveTimer = 0;
        if (this.gameType === '2048') {
          this.layaAutonomous2048Decision();
        } else {
          this.layaAutonomousSnakeDecision();
          this.stepSnake();
        }
      }
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.025;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const ft = this.floatingTexts[i];
      ft.y += ft.vy;
      ft.alpha -= 0.015;
      if (ft.alpha <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  draw() {
    if (!this.ctx || !this.canvas) return;
    const w = this.canvas.width / (window.devicePixelRatio || 1);
    const h = this.canvas.height / (window.devicePixelRatio || 1);
    const ctx = this.ctx;

    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    if (this.gameType === '2048') {
      this.drawTopGameAI2048Arena(w, h);
    } else {
      this.drawTopGameAISnakeArena(w, h);
    }

    this.drawOverlays(w, h);
  }

  drawTopGameAISnakeArena(w, h) {
    const ctx = this.ctx;
    const isWide = w >= 640;
    const cellSize = isWide ? 26 : Math.floor(Math.min((w - 40) / 12, (h - 40) / 12, 28));
    const totalSize = cellSize * 12;
    const offsetX = isWide ? 22 : Math.floor((w - totalSize) / 2);
    const offsetY = Math.floor((h - totalSize) / 2);

    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(offsetX - 2, offsetY - 2, totalSize + 4, totalSize + 4, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 12; c++) {
        const val = this.grid[r][c];
        const x = offsetX + c * cellSize + 1;
        const y = offsetY + r * cellSize + 1;
        const size = cellSize - 2;

        let fill = TOPGAMEAI_PALETTE[val] || '#111827';
        let rx = 2;
        if (val === 3) rx = 5;
        else if (val === 1) rx = 3;
        else if (val === 2) rx = 6;

        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(x, y, size, size, rx);
        ctx.fill();

        if (val === 2) {
          ctx.fillStyle = '#fca5a5';
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }

        if (val === 3) {
          ctx.fillStyle = '#111827';
          const eyeOff = size * 0.28;
          ctx.beginPath();
          if (this.direction === 'right') {
            ctx.arc(x + size - 4, y + eyeOff, 2, 0, Math.PI * 2);
            ctx.arc(x + size - 4, y + size - eyeOff, 2, 0, Math.PI * 2);
          } else if (this.direction === 'left') {
            ctx.arc(x + 4, y + eyeOff, 2, 0, Math.PI * 2);
            ctx.arc(x + 4, y + size - eyeOff, 2, 0, Math.PI * 2);
          } else if (this.direction === 'up') {
            ctx.arc(x + eyeOff, y + 4, 2, 0, Math.PI * 2);
            ctx.arc(x + size - eyeOff, y + 4, 2, 0, Math.PI * 2);
          } else {
            ctx.arc(x + eyeOff, y + size - 4, 2, 0, Math.PI * 2);
            ctx.arc(x + size - eyeOff, y + size - 4, 2, 0, Math.PI * 2);
          }
          ctx.fill();
        }
      }
    }

    if (isWide) {
      this.drawLayaHUD(w, h, offsetX, offsetY, totalSize, 'Q: Safest move advancing to food?');
    }
  }

  drawTopGameAI2048Arena(w, h) {
    const ctx = this.ctx;
    const isWide = w >= 640;
    const boardSize = isWide ? 312 : Math.min(w - 30, h - 30, 312);
    const offsetX = isWide ? 22 : Math.floor((w - boardSize) / 2);
    const offsetY = Math.floor((h - boardSize) / 2);

    const gap = 8;
    const tileSize = Math.floor((boardSize - gap * 5) / 4);

    // Outer frame
    ctx.save();
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(offsetX, offsetY, boardSize, boardSize, 10);
    ctx.fill();
    ctx.stroke();

    // 4x4 Grid Cells
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const val = this.grid2048[r][c] || 0;
        const tx = offsetX + gap + c * (tileSize + gap);
        const ty = offsetY + gap + r * (tileSize + gap);

        const palette = TOPGAMEAI_2048_PALETTE[val] || (val > 4096 ? TOPGAMEAI_2048_PALETTE[4096] : TOPGAMEAI_2048_PALETTE[0]);

        if (palette.glow) {
          ctx.shadowColor = palette.glow;
          ctx.shadowBlur = 12;
        }

        ctx.fillStyle = palette.bg;
        ctx.beginPath();
        ctx.roundRect(tx, ty, tileSize, tileSize, 6);
        ctx.fill();
        ctx.shadowBlur = 0;

        if (val > 0) {
          ctx.fillStyle = palette.fg;
          const fontSize = val < 100 ? 24 : (val < 1000 ? 20 : (val < 10000 ? 16 : 13));
          ctx.font = `bold ${fontSize}px "Courier New", monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(val), tx + tileSize / 2, ty + tileSize / 2);
        }
      }
    }
    ctx.restore();

    if (isWide) {
      this.drawLayaHUD(w, h, offsetX, offsetY, boardSize, 'Q: Corner monotonicity & merges?');
    }
  }

  drawLayaHUD(w, h, offsetX, offsetY, totalSize, questionText) {
    const ctx = this.ctx;
    const hudX = offsetX + totalSize + 22;
    const hudY = offsetY;
    const hudW = w - hudX - 20;
    const hudH = totalSize;

    ctx.save();
    ctx.fillStyle = '#0b1120';
    ctx.strokeStyle = 'rgba(34, 230, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(hudX, hudY, hudW, hudH, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#22e6ff';
    ctx.shadowColor = '#22e6ff';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(hudX + 16, hudY + 20, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.font = 'bold 12px "Courier New", monospace';
    ctx.fillStyle = '#22e6ff';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.gameType.toUpperCase()} ARENA INFERENCE // 4-GOATS`, hudX + 26, hudY + 24);

    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Model: convaiinnovations/laya', hudX + 16, hudY + 40);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.beginPath();
    ctx.moveTo(hudX + 14, hudY + 48);
    ctx.lineTo(hudX + hudW - 14, hudY + 48);
    ctx.stroke();

    ctx.font = '11px "Courier New", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(questionText, hudX + 16, hudY + 66);

    const dirs = [
      { id: 'up', label: '▲ UP' },
      { id: 'down', label: '▼ DOWN' },
      { id: 'left', label: '◀ LEFT' },
      { id: 'right', label: '▶ RIGHT' },
    ];

    const probs = this.probabilities || { up: 0.1, down: 0.1, left: 0.1, right: 0.7 };
    const startRowY = hudY + 76;
    const rowH = 42;
    const barX = hudX + 90;
    const barW = Math.max(80, hudW - 176);
    const barH = 12;

    dirs.forEach((d, i) => {
      const ry = startRowY + i * rowH;
      const prob = probs[d.id] ?? 0.05;
      const isChosen = d.id === this.direction;
      const pct = Math.round(prob * 100);

      if (isChosen) {
        ctx.fillStyle = 'rgba(74, 222, 128, 0.12)';
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(hudX + 10, ry + 2, hudW - 20, 36, 4);
        ctx.fill();
        ctx.stroke();
      }

      ctx.font = isChosen ? 'bold 12px "Courier New", monospace' : '11px "Courier New", monospace';
      ctx.fillStyle = isChosen ? '#4ade80' : '#cbd5e1';
      ctx.textAlign = 'left';
      ctx.fillText(d.label, hudX + 16, ry + 24);

      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(barX, ry + 15, barW, barH, 3);
      ctx.fill();

      const fillW = Math.max(4, Math.min(barW, barW * prob));
      ctx.fillStyle = isChosen ? '#4ade80' : '#0284c7';
      if (isChosen) {
        ctx.shadowColor = '#4ade80';
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      ctx.roundRect(barX, ry + 15, fillW, barH, 3);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.font = 'bold 11px "Courier New", monospace';
      ctx.fillStyle = isChosen ? '#4ade80' : '#94a3b8';
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, hudX + hudW - (isChosen ? 62 : 16), ry + 24);

      if (isChosen) {
        ctx.font = 'bold 9px "Courier New", monospace';
        ctx.fillStyle = '#4ade80';
        ctx.textAlign = 'right';
        ctx.fillText('[CHOSEN]', hudX + hudW - 14, ry + 24);
      }
    });

    // Telemetry Footer
    const btmY = hudY + hudH - 34;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(hudX + 10, btmY, hudW - 20, 26, 4);
    ctx.fill();
    ctx.stroke();

    ctx.font = '10px "Courier New", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    const confPct = Math.round((this.lastConfidence || 0.70) * 100);
    ctx.fillText(`CONF: ${confPct}%`, hudX + 18, btmY + 17);

    ctx.fillStyle = '#38bdf8';
    if (this.gameType === '2048') {
      ctx.fillText(`BEST: ${this.bestTile} | PTS: ${this.points2048}`, hudX + 100, btmY + 17);
    } else {
      ctx.fillText(`FOOD: (${this.food?.x ?? 0}, ${this.food?.y ?? 0})`, hudX + 105, btmY + 17);
    }

    ctx.fillStyle = '#4ade80';
    ctx.textAlign = 'right';
    ctx.fillText(`LATENCY: ~24ms`, hudX + hudW - 18, btmY + 17);

    ctx.restore();
  }

  addParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        color,
        size: 2 + Math.random() * 3
      });
    }
  }

  addFloatingText(text, x, y, color = '#ffd000') {
    this.floatingTexts.push({
      text,
      x: x || 150,
      y: y || 80,
      vy: -0.6,
      alpha: 1.0,
      color
    });
  }

  drawOverlays(w, h) {
    const ctx = this.ctx;

    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    for (const ft of this.floatingTexts) {
      ctx.save();
      ctx.font = 'bold 15px "Courier New", monospace';
      ctx.fillStyle = ft.color;
      ctx.globalAlpha = Math.max(0, ft.alpha);
      ctx.textAlign = 'center';
      ctx.shadowColor = ft.color;
      ctx.shadowBlur = 8;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  destroy() {
    if (this.animId) cancelAnimationFrame(this.animId);
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);
    if (this.container) this.container.innerHTML = '';
  }
}
