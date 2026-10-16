/**
 * ==========================================================================
 * BEAT THE BOT — LIVE VISUAL GAME VIEWPORT (components/gameCanvas.js)
 * Real-time graphical canvas simulation for Hackathon Stage 1 & Stage 2:
 *   1. "Stage 1: Snake" (12x12 Retro Arcade Grid, Neon Slither, Food Targeting)
 *   2. "Stage 2: 2048" (4x4 Sliding Tile Matrix, Monotonic Corner Anchor, Merges)
 *   3. Autonomous Laya model steering & sliding
 *   4. Interactive "You Play" mode with keyboard (WASD / Arrows) and touch controls
 *   5. Full Pause/Resume and Step-Feed synchronization with live decision stream
 * ==========================================================================
 */

import * as sound from '../sound.js';

export class GameViewport {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    this.mode = 'laya'; // 'laya' | 'manual'
    this.gameSkin = 'snake'; // 'snake' (default Stage 1) | '2048' (Stage 2)
    this.isPaused = false;

    // Shared score & telemetry
    this.score = 0;
    this.bestScore = 600;
    this.currentStep = 0;
    this.particles = [];
    this.floatingTexts = [];

    // --- SNAKE (STAGE 1) STATE (12x12 Grid) ---
    this.snakeGridSize = 12;
    this.snake = [
      { x: 6, y: 6 },
      { x: 5, y: 6 },
      { x: 4, y: 6 }
    ];
    this.snakeDir = 'right';
    this.snakeNextDir = 'right';
    this.snakeFood = { x: 9, y: 3 };
    this.snakeFoodEaten = 0;
    this.snakeTargetFood = 15;
    this.snakeDead = false;
    this.snakeMoveTimer = 0;
    this.snakeMoveInterval = 140; // ms per step

    // --- 2048 (STAGE 2) STATE (4x4 Board) ---
    this.board2048 = [
      [0, 0, 0, 0],
      [0, 0, 4, 0],
      [0, 0, 4, 0],
      [0, 0, 0, 0]
    ];
    this.score2048 = 0;
    this.bestTile2048 = 4;
    this.moveTimer2048 = 0;
    this.moveInterval2048 = 600; // ms per autonomous step in demo
    this.gameOver2048 = false;

    // Canvas & Animation Loop
    this.canvas = null;
    this.ctx = null;
    this.animId = null;
    this.lastTime = performance.now();

    // Listeners
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundResize = this.handleResize.bind(this);

    this.initDOM();
    this.setupListeners();
    this.resetSkin(this.gameSkin);
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
            <span class="arcade-title" id="arcade-title-label">STAGE 1: SNAKE // 12x12 ARENA</span>
          </div>

          <div class="arcade-header-controls">
            <!-- Game Switcher: Snake & 2048 -->
            <div class="arcade-skin-toggle" role="group" aria-label="Game Visual Style">
              <button class="skin-btn is-active" data-skin="snake" id="btn-skin-snake" title="Stage 1: Snake (TopGameAI)">
                🐍 SNAKE
              </button>
              <button class="skin-btn" data-skin="2048" id="btn-skin-2048" title="Stage 2: 2048 (TopGameAI)">
                🔢 2048
              </button>
            </div>

            <span class="badge badge-live" id="arcade-mode-badge">⚡ LAYA AUTONOMOUS</span>
          </div>
        </div>

        <!-- Canvas Viewport Frame with Scanlines -->
        <div class="arcade-viewport-frame" id="arcade-frame">
          <canvas id="live-game-canvas" width="760" height="340" aria-label="Live Game Visual Simulation"></canvas>
          <div class="arcade-scanlines" aria-hidden="true"></div>
          <div class="arcade-vignette" aria-hidden="true"></div>

          <!-- On-screen Manual Play Touch Controls -->
          <div class="arcade-touch-controls" id="arcade-touch-controls" style="display: none;">
            <button class="touch-btn" id="touch-up" aria-label="Up">⬆ UP</button>
            <div style="display: flex; gap: 8px;">
              <button class="touch-btn" id="touch-left" aria-label="Left">⬅ LEFT</button>
              <button class="touch-btn" id="touch-down" aria-label="Down">⬇ DOWN</button>
              <button class="touch-btn" id="touch-right" aria-label="Right">➡ RIGHT</button>
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
            <div class="arcade-stat-item" id="arcade-extra-stat-box">
              <span class="arcade-stat-label" id="arcade-extra-stat-label">FOOD:</span>
              <span class="arcade-stat-value" id="arcade-val-extra" style="color: var(--neon-cyan, #00f0ff);">0 / 15</span>
            </div>
            <div class="arcade-stat-item">
              <span class="arcade-stat-label">MODEL:</span>
              <span class="arcade-stat-value" style="color: var(--arcade-green, #00d020);">LAYA AUTONOMOUS</span>
            </div>
          </div>

          <div class="arcade-actions-row">
            <button id="btn-pause-game" class="btn btn-ghost btn-xs" aria-label="Pause or resume simulation">
              <span>⏸ PAUSE</span>
            </button>
            <button id="btn-toggle-manual-play" class="btn btn-ghost btn-xs" aria-label="Switch between Laya driving and manual player control">
              <span>🎮 TAKE OVER</span>
            </button>
            <button id="btn-restart-game" class="btn btn-secondary btn-xs" aria-label="Restart current simulation">
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

    // Skin Buttons
    const btnSnake = this.container.querySelector('#btn-skin-snake');
    const btn2048 = this.container.querySelector('#btn-skin-2048');
    if (btnSnake) btnSnake.addEventListener('click', () => this.setSkin('snake'));
    if (btn2048) btn2048.addEventListener('click', () => this.setSkin('2048'));

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
          this.resetSkin(this.gameSkin);
        }
      });
    }

    // Touch Buttons
    const touchUp = this.container.querySelector('#touch-up');
    const touchDown = this.container.querySelector('#touch-down');
    const touchLeft = this.container.querySelector('#touch-left');
    const touchRight = this.container.querySelector('#touch-right');

    if (touchUp) touchUp.addEventListener('click', () => this.handleAction('up'));
    if (touchDown) touchDown.addEventListener('click', () => this.handleAction('down'));
    if (touchLeft) touchLeft.addEventListener('click', () => this.handleAction('left'));
    if (touchRight) touchRight.addEventListener('click', () => this.handleAction('right'));
  }

  handleResize() {
    if (!this.canvas || !this.container) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const targetW = Math.max(320, Math.floor(rect.width));
    const targetH = Math.max(260, Math.min(420, Math.floor(rect.height || 340)));

    if (this.canvas.width !== targetW * dpr || this.canvas.height !== targetH * dpr) {
      this.canvas.width = targetW * dpr;
      this.canvas.height = targetH * dpr;
      this.canvas.style.width = `${targetW}px`;
      this.canvas.style.height = `${targetH}px`;
      this.ctx.scale(dpr, dpr);
    }
  }

  setSkin(skinName) {
    if (skinName !== 'snake' && skinName !== '2048') skinName = 'snake';
    this.gameSkin = skinName;

    const btnSnake = this.container.querySelector('#btn-skin-snake');
    const btn2048 = this.container.querySelector('#btn-skin-2048');
    const titleLabel = this.container.querySelector('#arcade-title-label');
    const extraLabel = this.container.querySelector('#arcade-extra-stat-label');

    if (btnSnake) btnSnake.classList.toggle('is-active', skinName === 'snake');
    if (btn2048) btn2048.classList.toggle('is-active', skinName === '2048');

    if (skinName === 'snake') {
      if (titleLabel) titleLabel.textContent = 'STAGE 1: SNAKE // 12x12 ARENA';
      if (extraLabel) extraLabel.textContent = 'FOOD:';
    } else {
      if (titleLabel) titleLabel.textContent = 'STAGE 2: 2048 // 4x4 TILES';
      if (extraLabel) extraLabel.textContent = 'BEST:';
    }

    this.resetSkin(skinName);
    sound.playNavTransitionSound();
  }

  resetSkin(skinName) {
    this.particles = [];
    this.floatingTexts = [];
    this.score = 0;

    if (skinName === 'snake') {
      this.snake = [
        { x: 6, y: 6 },
        { x: 5, y: 6 },
        { x: 4, y: 6 }
      ];
      this.snakeDir = 'right';
      this.snakeNextDir = 'right';
      this.snakeFoodEaten = 0;
      this.snakeDead = false;
      this.spawnSnakeFood();
      this.updateHUDStats();
    } else {
      this.board2048 = [
        [0, 0, 0, 0],
        [0, 0, 4, 0],
        [0, 0, 4, 0],
        [0, 0, 0, 0]
      ];
      this.score2048 = 0;
      this.bestTile2048 = 4;
      this.gameOver2048 = false;
      this.updateHUDStats();
    }
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
      if (btn) btn.innerHTML = '<span>⚡ LAYA DRIVING</span>';
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
      this.addFloatingText('LAYA AUTONOMOUS MODE', this.canvas.width / 4, 60, '#00f0ff');
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

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.handleAction('up');
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.handleAction('down');
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.handleAction('left');
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.handleAction('right');
    }
  }

  handleAction(dir) {
    if (this.isPaused) return;

    if (this.gameSkin === 'snake') {
      const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
      if (opposites[this.snakeDir] !== dir) {
        this.snakeNextDir = dir;
        sound.playStepClickSound();
      }
    } else if (this.gameSkin === '2048') {
      this.slide2048(dir);
      sound.playStepClickSound();
    }
  }

  /**
   * Feed a live event step from the bot loop into the visual simulator.
   */
  feedStep(event) {
    if (!event) return;
    this.currentStep = event.step || 0;

    const action = event.decision?.chosen_action || event.action;
    const facts = event.state?.facts || {};

    if (this.gameSkin === 'snake') {
      if (facts.snake && Array.isArray(facts.snake)) {
        this.snake = facts.snake.map(p => ({ x: p.x !== undefined ? p.x : p[1], y: p.y !== undefined ? p.y : p[0] }));
      }
      if (facts.food) {
        this.snakeFood = {
          x: facts.food.x !== undefined ? facts.food.x : facts.food[1],
          y: facts.food.y !== undefined ? facts.food.y : facts.food[0]
        };
      }
      if (facts.direction) this.snakeDir = facts.direction;
      if (action) this.snakeNextDir = action;
      if (facts.food_eaten !== undefined) this.snakeFoodEaten = facts.food_eaten;
      this.score = event.state?.score || (this.snakeFoodEaten * 60);
    } else if (this.gameSkin === '2048') {
      if (facts.grid) this.board2048 = facts.grid;
      if (facts.max_tile) this.bestTile2048 = facts.max_tile;
      if (action) this.slide2048(action, false);
      this.score = event.state?.score || this.score2048;
    }

    this.updateHUDStats();
  }

  spawnSnakeFood() {
    const occupied = new Set(this.snake.map(s => `${s.x},${s.y}`));
    const empty = [];
    for (let r = 0; r < this.snakeGridSize; r++) {
      for (let c = 0; c < this.snakeGridSize; c++) {
        if (!occupied.has(`${c},${r}`)) empty.push({ x: c, y: r });
      }
    }
    if (empty.length > 0) {
      this.snakeFood = empty[Math.floor(Math.random() * empty.length)];
    }
  }

  updateSnake(dt) {
    if (this.snakeDead || this.isPaused) return;

    this.snakeMoveTimer += dt;
    if (this.snakeMoveTimer < this.snakeMoveInterval) return;
    this.snakeMoveTimer = 0;

    this.snakeDir = this.snakeNextDir;

    // Autonomous Laya heuristic when in Laya mode
    if (this.mode === 'laya') {
      this.snakeAutonomousStep();
    }

    const head = this.snake[0];
    const newHead = { x: head.x, y: head.y };
    if (this.snakeDir === 'up') newHead.y -= 1;
    else if (this.snakeDir === 'down') newHead.y += 1;
    else if (this.snakeDir === 'left') newHead.x -= 1;
    else if (this.snakeDir === 'right') newHead.x += 1;

    // Wall collision
    if (newHead.x < 0 || newHead.x >= this.snakeGridSize || newHead.y < 0 || newHead.y >= this.snakeGridSize) {
      this.triggerSnakeCrash();
      return;
    }

    // Body collision
    for (let i = 0; i < this.snake.length - 1; i++) {
      if (this.snake[i].x === newHead.x && this.snake[i].y === newHead.y) {
        this.triggerSnakeCrash();
        return;
      }
    }

    this.snake.unshift(newHead);

    // Food check
    if (newHead.x === this.snakeFood.x && newHead.y === this.snakeFood.y) {
      this.snakeFoodEaten += 1;
      this.score += 60;
      this.addParticles(this.canvas.width * 0.5, this.canvas.height * 0.5, 12, '#39ff88');
      this.addFloatingText('+60 FOOD!', this.canvas.width * 0.5, 90, '#39ff88');
      sound.playSuccessChime();

      if (this.snakeFoodEaten >= this.snakeTargetFood) {
        this.score += 100;
        this.addFloatingText('★ QUALIFYING GOAL REACHED! ★', this.canvas.width * 0.5, 120, '#ffd000');
      }
      this.spawnSnakeFood();
    } else {
      this.snake.pop();
    }

    this.updateHUDStats();
  }

  snakeAutonomousStep() {
    const head = this.snake[0];
    const candidates = ['up', 'down', 'left', 'right'];
    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    const valid = [];

    for (const dir of candidates) {
      if (dir === opposites[this.snakeDir]) continue;
      let nx = head.x;
      let ny = head.y;
      if (dir === 'up') ny--;
      else if (dir === 'down') ny++;
      else if (dir === 'left') nx--;
      else if (dir === 'right') nx++;

      if (nx >= 0 && nx < this.snakeGridSize && ny >= 0 && ny < this.snakeGridSize) {
        const bodyHit = this.snake.some(s => s.x === nx && s.y === ny);
        if (!bodyHit) {
          const dist = Math.abs(nx - this.snakeFood.x) + Math.abs(ny - this.snakeFood.y);
          valid.push({ dir, dist });
        }
      }
    }

    if (valid.length > 0) {
      valid.sort((a, b) => a.dist - b.dist);
      this.snakeNextDir = valid[0].dir;
    }
  }

  triggerSnakeCrash() {
    this.snakeDead = true;
    this.addFloatingText('CRASH! GAME OVER', this.canvas.width * 0.5, 120, '#ff4d6d');
    sound.playCollisionSound();
    setTimeout(() => {
      if (this.snakeDead) this.resetSkin('snake');
    }, 2200);
  }

  // --- 2048 GAME LOGIC ---
  slide2048(direction, spawnNew = true) {
    if (this.isPaused) return;

    let moved = false;
    let scoreGained = 0;
    const grid = this.board2048.map(row => [...row]);

    const rotateLeft = (m) => m[0].map((_, i) => m.map(row => row[i]).reverse());
    const rotateRight = (m) => m[0].map((_, i) => m.map(row => row[row.length - 1 - i]));

    let rot = 0;
    if (direction === 'up') rot = 3;
    else if (direction === 'right') rot = 2;
    else if (direction === 'down') rot = 1;

    let working = grid;
    for (let i = 0; i < rot; i++) working = rotateLeft(working);

    // Slide left
    for (let r = 0; r < 4; r++) {
      let row = working[r].filter(v => v !== 0);
      for (let c = 0; c < row.length - 1; c++) {
        if (row[c] === row[c + 1]) {
          row[c] *= 2;
          scoreGained += row[c];
          if (row[c] > this.bestTile2048) this.bestTile2048 = row[c];
          row.splice(c + 1, 1);
        }
      }
      while (row.length < 4) row.push(0);
      for (let c = 0; c < 4; c++) {
        if (working[r][c] !== row[c]) moved = true;
        working[r][c] = row[c];
      }
    }

    // Rotate back
    for (let i = 0; i < (4 - rot) % 4; i++) working = rotateLeft(working);
    this.board2048 = working;

    if (scoreGained > 0) {
      this.score2048 += scoreGained;
      this.score = this.score2048;
      this.addFloatingText(`+${scoreGained}`, this.canvas.width * 0.5, 80, '#ffd000');
      sound.playSuccessChime();
    }

    if (moved && spawnNew) {
      this.spawn2048Tile();
    }

    this.updateHUDStats();
  }

  spawn2048Tile() {
    const empty = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        if (this.board2048[r][c] === 0) empty.push({ r, c });
      }
    }
    if (empty.length > 0) {
      const spot = empty[Math.floor(Math.random() * empty.length)];
      this.board2048[spot.r][spot.c] = Math.random() < 0.9 ? 2 : 4;
    }
  }

  updateHUDStats() {
    const scoreVal = this.container.querySelector('#arcade-val-score');
    const extraVal = this.container.querySelector('#arcade-val-extra');

    if (this.gameSkin === 'snake') {
      if (scoreVal) scoreVal.textContent = String(this.score).padStart(4, '0');
      if (extraVal) extraVal.textContent = `${this.snakeFoodEaten} / ${this.snakeTargetFood}`;
    } else {
      if (scoreVal) scoreVal.textContent = String(this.score2048).padStart(4, '0');
      if (extraVal) extraVal.textContent = `${this.bestTile2048}`;
    }
  }

  addFloatingText(text, x, y, color = '#ffd000') {
    this.floatingTexts.push({ text, x, y, color, alpha: 1.0, vy: -0.6 });
  }

  addParticles(x, y, count = 8, color = '#39ff88') {
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

  // --- RENDERING ---
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
    if (this.gameSkin === 'snake') {
      this.updateSnake(dt);
    } else if (this.gameSkin === '2048') {
      if (this.mode === 'laya' && !this.isPaused) {
        this.moveTimer2048 += dt;
        if (this.moveTimer2048 >= this.moveInterval2048) {
          this.moveTimer2048 = 0;
          const moves = ['left', 'up', 'down', 'right'];
          this.slide2048(moves[Math.floor(Math.random() * 3)]); // prioritize corner
        }
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.025;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update Floating Texts
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

    this.ctx.fillStyle = '#0a0d14';
    this.ctx.fillRect(0, 0, w, h);

    if (this.gameSkin === 'snake') {
      this.drawSnakeScene(w, h);
    } else {
      this.draw2048Scene(w, h);
    }

    this.drawOverlays(w, h);
  }

  drawSnakeScene(w, h) {
    const ctx = this.ctx;
    const size = Math.min(w * 0.88, h * 0.88);
    const offsetX = (w - size) / 2;
    const offsetY = (h - size) / 2;
    const cellSize = size / this.snakeGridSize;

    // Outer Glow Border
    ctx.strokeStyle = 'rgba(57, 255, 136, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(offsetX - 2, offsetY - 2, size + 4, size + 4);

    // Inner Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= this.snakeGridSize; i++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + i * cellSize, offsetY);
      ctx.lineTo(offsetX + i * cellSize, offsetY + size);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + i * cellSize);
      ctx.lineTo(offsetX + size, offsetY + i * cellSize);
      ctx.stroke();
    }

    // Draw Food (Pulsating Apple)
    const fx = offsetX + this.snakeFood.x * cellSize + cellSize / 2;
    const fy = offsetY + this.snakeFood.y * cellSize + cellSize / 2;
    const pulse = 1.0 + Math.sin(performance.now() * 0.008) * 0.15;

    ctx.save();
    ctx.shadowColor = '#ff4d6d';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ff3366';
    ctx.beginPath();
    ctx.arc(fx, fy, (cellSize * 0.38) * pulse, 0, Math.PI * 2);
    ctx.fill();

    // Stem
    ctx.strokeStyle = '#39ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy - (cellSize * 0.35));
    ctx.lineTo(fx + 2, fy - (cellSize * 0.55));
    ctx.stroke();
    ctx.restore();

    // Draw Snake Body
    for (let i = this.snake.length - 1; i >= 0; i--) {
      const seg = this.snake[i];
      const sx = offsetX + seg.x * cellSize + 2;
      const sy = offsetY + seg.y * cellSize + 2;
      const sw = cellSize - 4;
      const sh = cellSize - 4;

      if (i === 0) {
        // Snake Head
        ctx.save();
        ctx.shadowColor = '#39ff88';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#39ff88';
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, 6);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#0a0d14';
        const eyeOffset = sw * 0.25;
        ctx.beginPath();
        if (this.snakeDir === 'right') {
          ctx.arc(sx + sw - 4, sy + eyeOffset, 2.5, 0, Math.PI * 2);
          ctx.arc(sx + sw - 4, sy + sh - eyeOffset, 2.5, 0, Math.PI * 2);
        } else if (this.snakeDir === 'left') {
          ctx.arc(sx + 4, sy + eyeOffset, 2.5, 0, Math.PI * 2);
          ctx.arc(sx + 4, sy + sh - eyeOffset, 2.5, 0, Math.PI * 2);
        } else if (this.snakeDir === 'up') {
          ctx.arc(sx + eyeOffset, sy + 4, 2.5, 0, Math.PI * 2);
          ctx.arc(sx + sw - eyeOffset, sy + 4, 2.5, 0, Math.PI * 2);
        } else {
          ctx.arc(sx + eyeOffset, sy + sh - 4, 2.5, 0, Math.PI * 2);
          ctx.arc(sx + sw - eyeOffset, sy + sh - 4, 2.5, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.restore();
      } else {
        // Body Segment
        const t = i / this.snake.length;
        ctx.fillStyle = `rgba(34, 230, 255, ${0.85 - t * 0.4})`;
        ctx.beginPath();
        ctx.roundRect(sx, sy, sw, sh, 4);
        ctx.fill();
      }
    }
  }

  draw2048Scene(w, h) {
    const ctx = this.ctx;
    const boardSize = Math.min(w * 0.85, h * 0.85);
    const offsetX = (w - boardSize) / 2;
    const offsetY = (h - boardSize) / 2;
    const cellSize = (boardSize - 20) / 4;

    // Board Background
    ctx.save();
    ctx.fillStyle = '#1e2538';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.roundRect(offsetX, offsetY, boardSize, boardSize, 12);
    ctx.fill();
    ctx.restore();

    // Tile Colors
    const tileColors = {
      0: '#141a29',
      2: '#2a3550',
      4: '#354668',
      8: '#f2994a',
      16: '#eb5757',
      32: '#ff3366',
      64: '#9b51e0',
      128: '#00f0ff',
      256: '#39ff88',
      512: '#ffd000',
      1024: '#ff00aa',
      2048: '#ffffff'
    };

    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const val = this.board2048[r][c];
        const tx = offsetX + 10 + c * (cellSize + 2.5);
        const ty = offsetY + 10 + r * (cellSize + 2.5);

        ctx.fillStyle = tileColors[val] || '#ff0055';
        ctx.beginPath();
        ctx.roundRect(tx, ty, cellSize, cellSize, 8);
        ctx.fill();

        if (val > 0) {
          ctx.fillStyle = val >= 8 ? '#ffffff' : '#e0e6ed';
          ctx.font = `bold ${cellSize > 60 ? '22px' : '16px'} monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(val), tx + cellSize / 2, ty + cellSize / 2);
        }
      }
    }
  }

  drawOverlays(w, h) {
    const ctx = this.ctx;

    // Draw Particles
    for (const p of this.particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1.0;

    // Draw Floating Texts
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
