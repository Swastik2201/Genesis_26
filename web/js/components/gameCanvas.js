/**
 * ==========================================================================
 * BEAT THE BOT — TOPGAMEAI SNAKE ARENA VIEWPORT (components/gameCanvas.js)
 * Live graphical canvas & simulation matching https://topgameai.com/arena/snake:
 *   - 12x12 Grid: 0 empty, 1 body, 2 food, 3 head
 *   - Exact TopGameAI palette: 0: #111827, 1: #16a34a, 2: #ef4444, 3: #4ade80
 *   - Scoring: foodEaten * 60 + (100 if won)
 *   - Goal: Eat 15 foods within 300 steps
 *   - Rule: Cannot reverse direction (fatal / strictly rejected)
 *   - Wall & self-collision ends game
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

export const OPPOSITE_DIRECTIONS = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

export class GameViewport {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    this.mode = 'laya'; // 'laya' | 'manual'
    this.isPaused = false;

    // --- TOPGAMEAI 12x12 ARENA STATE ---
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

    // Grid matrix 12x12
    this.grid = Array.from({ length: 12 }, () => Array(12).fill(0));
    this.rebuildGrid();

    // Timing
    this.moveTimer = 0;
    this.moveInterval = 140; // ms per step in simulation
    this.particles = [];
    this.floatingTexts = [];

    // Canvas
    this.canvas = null;
    this.ctx = null;
    this.animId = null;
    this.lastTime = performance.now();

    // Listeners
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundResize = this.handleResize.bind(this);

    this.initDOM();
    this.setupListeners();
    this.startLoop();
  }

  /**
   * Initializes the DOM elements and canvas structure.
   */
  initDOM() {
    this.container.innerHTML = `
      <div class="arcade-monitor hud-card" id="arcade-monitor-card">
        <!-- Monitor Header -->
        <div class="arcade-header">
          <div class="arcade-title-group">
            <span class="arcade-crt-dot" aria-hidden="true"></span>
            <span class="arcade-title" id="arcade-title-label">TOPGAMEAI ARENA // SNAKE (12x12)</span>
          </div>

          <div class="arcade-header-controls">
            <span class="badge badge-live" id="arcade-mode-badge">⚡ LAYA AUTONOMOUS</span>
          </div>
        </div>

        <!-- Canvas Viewport Frame with CRT Aesthetics -->
        <div class="arcade-viewport-frame" id="arcade-frame">
          <canvas id="live-game-canvas" width="760" height="360" aria-label="TopGameAI Snake Arena"></canvas>
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
              <span class="arcade-stat-label">SCORE:</span>
              <span class="arcade-stat-value" id="arcade-val-score" style="color: var(--arcade-yellow, #ffd000);">0000</span>
            </div>
            <div class="arcade-stat-item">
              <span class="arcade-stat-label">FOOD EATEN:</span>
              <span class="arcade-stat-value" id="arcade-val-food" style="color: var(--arcade-green, #4ade80);">0 / 15</span>
            </div>
            <div class="arcade-stat-item">
              <span class="arcade-stat-label">STEPS:</span>
              <span class="arcade-stat-value" id="arcade-val-steps" style="color: var(--neon-cyan, #22e6ff);">0 / 300</span>
            </div>
            <div class="arcade-stat-item">
              <span class="arcade-stat-label">HEADING:</span>
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

    // Pause Button
    const btnPause = this.container.querySelector('#btn-pause-game');
    if (btnPause) {
      btnPause.addEventListener('click', () => this.togglePause());
    }

    // Mode Toggle (Laya vs You Play)
    const btnToggle = this.container.querySelector('#btn-toggle-manual-play');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this.setMode(this.mode === 'laya' ? 'manual' : 'laya');
      });
    }

    // Restart Button
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

    // Touch Buttons
    const touchUp = this.container.querySelector('#touch-up');
    const touchDown = this.container.querySelector('#touch-down');
    const touchLeft = this.container.querySelector('#touch-left');
    const touchRight = this.container.querySelector('#touch-right');

    if (touchUp) touchUp.addEventListener('click', () => this.requestMove('up'));
    if (touchDown) touchDown.addEventListener('click', () => this.requestMove('down'));
    if (touchLeft) touchLeft.addEventListener('click', () => this.requestMove('left'));
    if (touchRight) touchRight.addEventListener('click', () => this.requestMove('right'));
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

  resetGame() {
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
    this.updateHUDStats();
    sound.playSelectTone();
  }

  // Compatibility stub for external callers
  resetSkin() {
    this.resetGame();
  }

  setMode(newMode) {
    this.mode = newMode;
    const badge = this.container.querySelector('#arcade-mode-badge');
    const btn = this.container.querySelector('#btn-toggle-manual-play');
    const touchControls = this.container.querySelector('#arcade-touch-controls');

    if (newMode === 'manual') {
      if (badge) {
        badge.textContent = '🎮 YOU PLAY (ARROWS/WASD)';
        badge.className = 'badge badge-manual';
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
        badge.className = 'badge badge-live';
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
      this.requestMove(targetDir);
    }
  }

  /**
   * Submits a movement direction applying TopGameAI reversal rules.
   */
  requestMove(dir) {
    if (this.isPaused || this.done) return;

    // Strict TopGameAI rule: cannot reverse direction
    if (OPPOSITE_DIRECTIONS[this.direction] === dir) {
      this.addFloatingText('CANNOT REVERSE!', this.canvas.width / 4, 70, '#ff4d6d');
      sound.playCollisionSound();
      return;
    }

    this.nextDirection = dir;
    sound.playStepClickSound();

    if (this.mode === 'manual') {
      // Step immediately for responsive manual tactile feedback
      this.stepSnake();
    }
  }

  /**
   * Rebuilds the exact 12x12 grid state (0: empty, 1: body, 2: food, 3: head).
   */
  rebuildGrid() {
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 12; c++) {
        this.grid[r][c] = 0;
      }
    }

    // Food is 2
    if (this.food && this.food.y >= 0 && this.food.y < 12 && this.food.x >= 0 && this.food.x < 12) {
      this.grid[this.food.y][this.food.x] = 2;
    }

    // Body segments are 1
    for (let i = 1; i < this.snake.length; i++) {
      const seg = this.snake[i];
      if (seg.y >= 0 && seg.y < 12 && seg.x >= 0 && seg.x < 12) {
        this.grid[seg.y][seg.x] = 1;
      }
    }

    // Head is 3
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

  /**
   * Executes one deterministic step of the Snake game matching TopGameAI rules.
   */
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

    // 1. Boundary check: 0 <= x < 12, 0 <= y < 12
    if (newHead.x < 0 || newHead.x >= 12 || newHead.y < 0 || newHead.y >= 12) {
      this.handleGameOver(false, 'HIT WALL');
      return;
    }

    // 2. Body collision check
    for (let i = 0; i < this.snake.length - 1; i++) {
      if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
        this.handleGameOver(false, 'HIT BODY');
        return;
      }
    }

    this.snake.unshift(newHead);

    // 3. Food consumption check
    if (newHead.x === this.food.x && newHead.y === this.food.y) {
      this.foodEaten += 1;
      this.score = this.foodEaten * 60;
      this.addParticles(this.canvas.width / 4, this.canvas.height / 4, 14, '#4ade80');
      this.addFloatingText('+60 FOOD!', this.canvas.width / 4, 90, '#4ade80');
      sound.playSuccessChime();

      if (this.foodEaten >= this.targetFood) {
        this.score += 100; // Win bonus
        this.handleGameOver(true, '15 FOODS EATEN — VICTORY!');
        return;
      }

      this.spawnFood();
    } else {
      // Normal move: snake does not grow, tail popped
      this.snake.pop();
    }

    // 4. Step limit check (300 moves)
    if (this.steps >= this.maxSteps) {
      this.handleGameOver(this.foodEaten >= this.targetFood, 'STEP LIMIT (300) REACHED');
      return;
    }

    this.rebuildGrid();
    this.updateHUDStats();
  }

  handleGameOver(won, reason) {
    this.done = true;
    this.won = won;
    this.rebuildGrid();
    this.updateHUDStats();

    if (won) {
      this.addFloatingText(`★ ${reason} ★`, this.canvas.width / 4, 110, '#ffd000');
      sound.playSuccessChime();
    } else {
      this.addFloatingText(`COLLISION: ${reason}`, this.canvas.width / 4, 110, '#ff4d6d');
      sound.playCollisionSound();
    }

    setTimeout(() => {
      if (this.done) this.resetGame();
    }, 2800);
  }

  /**
   * Autonomous Laya policy driver when in autonomous simulation.
   */
  layaAutonomousDecision() {
    const head = this.snake[0];
    const candidates = ['up', 'down', 'left', 'right'];
    const valid = [];

    for (const dir of candidates) {
      if (dir === OPPOSITE_DIRECTIONS[this.direction]) continue;
      let nx = head.x;
      let ny = head.y;
      if (dir === 'up') ny--;
      else if (dir === 'down') ny++;
      else if (dir === 'left') nx--;
      else if (dir === 'right') nx++;

      if (nx >= 0 && nx < 12 && ny >= 0 && ny < 12) {
        const bodyHit = this.snake.some(s => s.x === nx && s.y === ny);
        if (!bodyHit) {
          const dist = Math.abs(nx - this.food.x) + Math.abs(ny - this.food.y);
          valid.push({ dir, dist });
        }
      }
    }

    if (valid.length > 0) {
      valid.sort((a, b) => a.dist - b.dist);
      this.nextDirection = valid[0].dir;
    }
  }

  /**
   * Live event hook called when backend streams decision steps.
   */
  feedStep(event) {
    if (!event) return;

    this.steps = event.step !== undefined ? event.step : this.steps;
    const action = event.final_action || event.laya_calls?.[0]?.chosen_action || event.decision?.chosen_action || event.action;
    const facts = event.state?.facts || {};

    if (facts.grid && Array.isArray(facts.grid)) {
      this.grid = facts.grid;
    }
    if (facts.snake && Array.isArray(facts.snake)) {
      this.snake = facts.snake.map(p => ({
        x: p.x !== undefined ? p.x : p[1],
        y: p.y !== undefined ? p.y : p[0]
      }));
    }
    if (facts.food) {
      this.food = {
        x: facts.food.x !== undefined ? facts.food.x : facts.food[1],
        y: facts.food.y !== undefined ? facts.food.y : facts.food[0]
      };
    }
    if (facts.direction) {
      this.direction = facts.direction;
    }
    if (action) {
      this.nextDirection = action;
    }
    if (facts.food_eaten !== undefined) {
      this.foodEaten = facts.food_eaten;
    }
    this.score = event.state?.score !== undefined ? event.state.score : (this.foodEaten * 60);
    this.done = Boolean(event.state?.done);

    this.rebuildGrid();
    this.updateHUDStats();
  }

  updateHUDStats() {
    const scoreVal = this.container.querySelector('#arcade-val-score');
    const foodVal = this.container.querySelector('#arcade-val-food');
    const stepsVal = this.container.querySelector('#arcade-val-steps');
    const headingVal = this.container.querySelector('#arcade-val-heading');

    if (scoreVal) scoreVal.textContent = String(this.score).padStart(4, '0');
    if (foodVal) foodVal.textContent = `${this.foodEaten} / ${this.targetFood}`;
    if (stepsVal) stepsVal.textContent = `${this.steps} / ${this.maxSteps}`;
    if (headingVal) headingVal.textContent = (this.direction || 'RIGHT').toUpperCase();
  }

  addFloatingText(text, x, y, color = '#ffd000') {
    this.floatingTexts.push({ text, x, y, color, alpha: 1.0, vy: -0.6 });
  }

  addParticles(x, y, count = 8, color = '#4ade80') {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.0 + Math.random() * 3.5;
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
        this.layaAutonomousDecision();
        this.stepSnake();
      }
    }

    // Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.025;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Floating text
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

    // Viewport background
    ctx.fillStyle = '#0a0d14';
    ctx.fillRect(0, 0, w, h);

    // Render exact 12x12 TopGameAI Snake arena
    this.drawTopGameAISnakeArena(w, h);

    // Render particles and text overlays
    this.drawOverlays(w, h);
  }

  /**
   * Draws the exact 12x12 SVG/Canvas representation from TopGameAI Arena:
   * 28px square cells, border: "2px solid #374151", borderRadius: 6, background: "#111827".
   * 0 -> #111827
   * 1 -> #16a34a (rx: 3)
   * 2 -> #ef4444 (rx: 6, circle cx,cy r:5 fill #fca5a5)
   * 3 -> #4ade80 (rx: 5)
   */
  drawTopGameAISnakeArena(w, h) {
    const ctx = this.ctx;
    const cellSize = Math.floor(Math.min((w - 40) / 12, (h - 40) / 12, 28));
    const totalSize = cellSize * 12;
    const offsetX = Math.floor((w - totalSize) / 2);
    const offsetY = Math.floor((h - totalSize) / 2);

    // Frame border and background
    ctx.save();
    ctx.fillStyle = '#111827';
    ctx.strokeStyle = '#374151';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(offsetX - 2, offsetY - 2, totalSize + 4, totalSize + 4, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Draw cells
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

        // TopGameAI food rendering: circle with light pink shine (#fca5a5)
        if (val === 2) {
          ctx.fillStyle = '#fca5a5';
          ctx.beginPath();
          ctx.arc(x + size / 2, y + size / 2, Math.max(3, size * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }

        // Snake head eyes
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
  }

  drawOverlays(w, h) {
    const ctx = this.ctx;

    // Particles
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Floating text
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
