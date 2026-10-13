/**
 * ==========================================================================
 * BEAT THE BOT — LIVE VISUAL GAME VIEWPORT (components/gameCanvas.js)
 * Real-time graphical canvas simulation inspired by Super Mario Bros 8-Bit
 * & brainfunctioncollapse.com/laya.
 * Supports:
 *   1. "Mario World" (Authentic 8-Bit Super Mario World Runner — Default)
 *   2. "Cyber Runner" (3-Lane perspective tactical highway)
 *   3. "Flappy Laya" (Retro amber-dithered CRT arcade flappy mode)
 *   4. Autonomous "Laya Plays" (synced with SSE stream / replay)
 *   5. Interactive "You Play" (keyboard & touch controls: A/D/Arrows/Space)
 * ==========================================================================
 */

import * as sound from '../sound.js';

export class GameViewport {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    this.mode = 'laya'; // 'laya' | 'manual'
    this.gameSkin = 'mario'; // 'mario' | 'runner' | 'flappy'
    this.isPaused = false;

    // Simulation state
    this.score = 0;
    this.bestScore = 250;
    this.currentStep = 0;
    this.speed = 1.0;

    // Runner State (3 Lanes: 1, 2, 3)
    this.playerLane = 2.0;       // Current continuous float (lerps to targetLane)
    this.targetLane = 2.0;       // Integer 1, 2, or 3
    this.shipTilt = 0.0;         // Banking angle
    this.obstacles = [];         // Active approaching obstacles
    this.particles = [];         // Thrusters, sparks, rings
    this.floatingTexts = [];     // Floating popups (+10 PTS, DODGE, etc.)
    this.gridOffset = 0;
    this.screenShake = 0;

    // Mario State
    this.marioWalkFrame = 0;
    this.marioJumpY = 0;
    this.marioIsJumping = false;

    // Flappy State (Y position 0 to 1)
    this.flappyY = 0.5;
    this.flappyVy = 0;
    this.flappyPillars = [];
    this.flappyWingCycle = 0;

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
            <span class="arcade-title" id="arcade-title-label">SUPER MARIO WORLD // 8-BIT ARENA</span>
          </div>

          <div class="arcade-header-controls">
            <!-- Skin Selector -->
            <div class="arcade-skin-toggle" role="group" aria-label="Game Visual Style">
              <button class="skin-btn is-active" data-skin="mario" id="btn-skin-mario" title="Super Mario 8-Bit World">
                🍄 MARIO WORLD
              </button>
              <button class="skin-btn" data-skin="runner" id="btn-skin-runner" title="3-Lane Perspective Runner">
                🏎 CYBER RUNNER
              </button>
              <button class="skin-btn" data-skin="flappy" id="btn-skin-flappy" title="Retro Flappy CRT Style">
                🐤 FLAPPY LAYA
              </button>
            </div>

            <span class="badge badge-live" id="arcade-mode-badge">⚡ LAYA DRIVING</span>
          </div>
        </div>

        <!-- Canvas Viewport Frame with Scanlines -->
        <div class="arcade-viewport-frame" id="arcade-frame">
          <canvas id="live-game-canvas" width="760" height="340" aria-label="Live Game Visual Simulation"></canvas>
          <div class="arcade-scanlines" aria-hidden="true"></div>
          <div class="arcade-vignette" aria-hidden="true"></div>

          <!-- On-screen Manual Play Touch Controls (Visible only in 'You Play' mode) -->
          <div class="arcade-touch-controls" id="arcade-touch-controls" style="display: none;">
            <button class="touch-btn" id="touch-left" aria-label="Steer Left">◀ SHIFT LEFT</button>
            <button class="touch-btn" id="touch-action" aria-label="Hold or Jump">JUMP / ACTION ⬆</button>
            <button class="touch-btn" id="touch-right" aria-label="Steer Right">SHIFT RIGHT ▶</button>
          </div>
        </div>

        <!-- Arcade Control Footer Bar -->
        <div class="arcade-footer-bar">
          <div class="arcade-pilot-controls">
            <button class="arcade-btn is-active" id="arcade-btn-laya">
              <span class="btn-icon">⚡</span>
              <span>LAYA PLAYS</span>
            </button>
            <button class="arcade-btn" id="arcade-btn-human">
              <span class="btn-icon">🎮</span>
              <span>YOU PLAY</span>
            </button>
            <button class="arcade-btn" id="arcade-btn-pause">
              <span class="btn-icon">⏸</span>
              <span>PAUSE</span>
            </button>
          </div>

          <div class="arcade-telemetry-strip">
            <div class="arcade-stat-pill">
              <span class="pill-label">COINS:</span>
              <span class="pill-val" id="arcade-val-score">0000</span>
            </div>
            <div class="arcade-stat-pill">
              <span class="pill-label">LANE:</span>
              <span class="pill-val" id="arcade-val-lane">2 / 3</span>
            </div>
            <div class="arcade-stat-pill">
              <span class="pill-label">KEYS:</span>
              <span class="pill-val" style="color: var(--mario-yellow);">[A/D] or [◄/►]</span>
            </div>
          </div>
        </div>
      </div>
    `;

    this.canvas = this.container.querySelector('#live-game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.handleResize();
  }

  setupListeners() {
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('resize', this.boundResize);

    const btnLaya = this.container.querySelector('#arcade-btn-laya');
    const btnHuman = this.container.querySelector('#arcade-btn-human');
    const btnPause = this.container.querySelector('#arcade-btn-pause');
    const btnSkinMario = this.container.querySelector('#btn-skin-mario');
    const btnSkinRunner = this.container.querySelector('#btn-skin-runner');
    const btnSkinFlappy = this.container.querySelector('#btn-skin-flappy');

    const touchLeft = this.container.querySelector('#touch-left');
    const touchRight = this.container.querySelector('#touch-right');
    const touchAction = this.container.querySelector('#touch-action');

    if (btnLaya) btnLaya.addEventListener('click', () => this.setMode('laya'));
    if (btnHuman) btnHuman.addEventListener('click', () => this.setMode('manual'));
    if (btnPause) btnPause.addEventListener('click', () => this.togglePause());

    if (btnSkinMario) btnSkinMario.addEventListener('click', () => this.setSkin('mario'));
    if (btnSkinRunner) btnSkinRunner.addEventListener('click', () => this.setSkin('runner'));
    if (btnSkinFlappy) btnSkinFlappy.addEventListener('click', () => this.setSkin('flappy'));

    if (touchLeft) touchLeft.addEventListener('click', () => this.steerManual(-1));
    if (touchRight) touchRight.addEventListener('click', () => this.steerManual(1));
    if (touchAction) {
      touchAction.addEventListener('click', () => {
        if (this.gameSkin === 'mario') this.marioJump();
        else if (this.gameSkin === 'flappy') this.flapManual();
      });
    }
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(320, Math.floor(rect.width));
    const targetHeight = Math.floor(targetWidth * 0.44); // 2.27:1 sleek HUD monitor

    this.canvas.width = targetWidth * dpr;
    this.canvas.height = targetHeight * dpr;
    this.canvas.style.width = `${targetWidth}px`;
    this.canvas.style.height = `${targetHeight}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setSkin(skin) {
    this.gameSkin = skin;
    const btnMario = this.container.querySelector('#btn-skin-mario');
    const btnRunner = this.container.querySelector('#btn-skin-runner');
    const btnFlappy = this.container.querySelector('#btn-skin-flappy');
    const titleLabel = this.container.querySelector('#arcade-title-label');

    if (btnMario && btnRunner && btnFlappy) {
      btnMario.classList.toggle('is-active', skin === 'mario');
      btnRunner.classList.toggle('is-active', skin === 'runner');
      btnFlappy.classList.toggle('is-active', skin === 'flappy');
    }

    if (titleLabel) {
      if (skin === 'mario') {
        titleLabel.textContent = 'SUPER MARIO WORLD // 8-BIT ARENA';
      } else if (skin === 'runner') {
        titleLabel.textContent = 'CYBER RUNNER 2026 // LIVE VIEWPORT';
      } else {
        titleLabel.textContent = 'FLAPPY LAYA RETRO // DITHERED CRT SIMULATION';
      }
    }

    // Play pipe slide sound on theme change
    sound.playMarioPipeSound();

    // Reset obstacles
    this.obstacles = [];
    this.flappyPillars = [];
  }

  setMode(mode) {
    this.mode = mode;
    const btnLaya = this.container.querySelector('#arcade-btn-laya');
    const btnHuman = this.container.querySelector('#arcade-btn-human');
    const badge = this.container.querySelector('#arcade-mode-badge');
    const touchControls = this.container.querySelector('#arcade-touch-controls');

    if (btnLaya && btnHuman) {
      btnLaya.classList.toggle('is-active', mode === 'laya');
      btnHuman.classList.toggle('is-active', mode === 'manual');
    }

    if (badge) {
      if (mode === 'laya') {
        badge.className = 'badge badge-live';
        badge.textContent = '⚡ LAYA DRIVING';
      } else {
        badge.className = 'badge badge-good';
        badge.textContent = '🎮 MANUAL PILOT';
      }
    }

    if (touchControls) {
      touchControls.style.display = mode === 'manual' ? 'flex' : 'none';
    }

    sound.playMarioJumpSound();
    this.addFloatingText(mode === 'laya' ? 'AUTONOMOUS MODE' : 'MANUAL PILOT ENGAGED!', 2, '#fcd800');
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    const btnPause = this.container.querySelector('#arcade-btn-pause');
    if (btnPause) {
      btnPause.innerHTML = this.isPaused
        ? '<span class="btn-icon">▶</span><span>RESUME</span>'
        : '<span class="btn-icon">⏸</span><span>PAUSE</span>';
    }
  }

  handleKeyDown(e) {
    if (this.mode !== 'manual') return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.steerManual(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.steerManual(1);
    } else if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.gameSkin === 'mario') this.marioJump();
      else if (this.gameSkin === 'flappy') this.flapManual();
    }
  }

  steerManual(direction) {
    const nextLane = Math.max(1, Math.min(3, this.targetLane + direction));
    if (nextLane !== this.targetLane) {
      this.targetLane = nextLane;
      this.shipTilt = direction * 0.45;
      sound.playMarioJumpSound();
      this.addParticles(this.playerLane, 8, '#fcd800');
    }
  }

  marioJump() {
    if (!this.marioIsJumping) {
      this.marioIsJumping = true;
      this.marioJumpY = -28;
      sound.playMarioJumpSound();
      this.addParticles(this.targetLane, 6, '#fcd800');
    }
  }

  flapManual() {
    this.flappyVy = -7.5;
    sound.playMarioJumpSound();
    this.addParticles(2, 6, '#fcd800');
  }

  /**
   * Called by live.js whenever a new step event arrives from Laya stream or replay.
   * @param {Object} event - Contract event object
   */
  feedStep(event) {
    if (!event) return;

    this.currentStep = event.step ?? this.currentStep + 1;
    const facts = event.state?.facts || {};
    const finalAction = event.final_action;
    const scoreAfter = event.game_response?.score_after ?? event.state?.score ?? this.score;
    this.score = scoreAfter;
    if (this.score > this.bestScore) this.bestScore = this.score;

    // Update telemetry display
    const scoreVal = this.container.querySelector('#arcade-val-score');
    const laneVal = this.container.querySelector('#arcade-val-lane');
    if (scoreVal) scoreVal.textContent = String(this.score).padStart(4, '0');

    // In Laya autonomous mode, apply move
    if (this.mode === 'laya') {
      if (facts.current_lane) {
        this.targetLane = facts.current_lane;
      } else if (finalAction === 'move_left') {
        this.targetLane = Math.max(1, this.targetLane - 1);
        this.shipTilt = -0.4;
        if (this.gameSkin === 'mario') this.marioJump();
      } else if (finalAction === 'move_right') {
        this.targetLane = Math.min(3, this.targetLane + 1);
        this.shipTilt = 0.4;
        if (this.gameSkin === 'mario') this.marioJump();
      } else {
        this.shipTilt = 0;
      }

      if (laneVal) laneVal.textContent = `${this.targetLane} / 3`;

      // Flappy mapping
      if (this.gameSkin === 'flappy') {
        if (finalAction === 'move_left' || finalAction === 'jump') {
          this.flapManual();
        }
      }
    }

    // Spawn obstacles based on state
    this.spawnObstacleFromEvent(event);

    // Visual feedback for outcomes
    if (event.game_response?.good === true) {
      sound.playMarioCoinSound();
      this.addFloatingText('+10 PTS 🪙', this.targetLane, '#fcd800');
      this.addParticles(this.targetLane, 12, '#fcd800');
    } else if (event.game_response?.good === false) {
      this.screenShake = 12;
      sound.playMarioHitSound();
      this.addFloatingText('OUCH! 💥', this.targetLane, '#e52521');
      this.addParticles(this.targetLane, 20, '#e52521');
    } else if (event.validator?.retries > 0) {
      this.screenShake = 6;
      sound.playMarioPipeSound();
      this.addFloatingText('PIPE RETRY ❓', this.targetLane, '#f87800');
      this.addParticles(this.targetLane, 10, '#f87800');
    }
  }

  spawnObstacleFromEvent(event) {
    const obstacleLanes = [1, 2, 3].filter(l => l !== this.targetLane);
    const spawnLane = obstacleLanes[Math.floor(Math.random() * obstacleLanes.length)] || 1;

    // Add 3D runner obstacle (z goes from 1.0 down to 0.0)
    this.obstacles.push({
      lane: spawnLane,
      z: 1.0,
      width: 0.9,
      type: Math.random() > 0.4 ? 'pipe' : 'goomba',
      passed: false
    });

    // Flappy pillar
    if (this.gameSkin === 'flappy') {
      const gapY = 0.3 + Math.random() * 0.4;
      this.flappyPillars.push({
        x: 1.0,
        gapY: gapY,
        gapSize: 0.35,
        passed: false
      });
    }
  }

  addParticles(lane, count, color) {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const laneWidth = w / 3;
    const x = (lane - 0.5) * laneWidth;
    const y = h * 0.72;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 36,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 5,
        vy: -Math.random() * 4 - 2,
        life: 1.0,
        decay: 0.03 + Math.random() * 0.03,
        color: color,
        size: Math.random() * 4 + 2
      });
    }
  }

  addFloatingText(text, lane, color = '#fcd800') {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const laneWidth = w / 3;
    const x = (lane - 0.5) * laneWidth;
    const y = h * 0.60;

    this.floatingTexts.push({
      text,
      x,
      y,
      alpha: 1.0,
      vy: -1.2,
      color
    });
  }

  startLoop() {
    const loop = (timestamp) => {
      const dt = Math.min(0.1, (timestamp - this.lastTime) / 1000);
      this.lastTime = timestamp;

      if (!this.isPaused) {
        this.update(dt);
      }
      this.render();

      this.animId = requestAnimationFrame(loop);
    };
    this.animId = requestAnimationFrame(loop);
  }

  update(dt) {
    // Screen shake decay
    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }

    // Grid scrolling
    this.gridOffset = (this.gridOffset + dt * 1.6 * this.speed) % 1.0;
    this.marioWalkFrame += dt * 10;

    // Mario Jump physics
    if (this.marioIsJumping) {
      this.marioJumpY += dt * 70; // gravity
      if (this.marioJumpY >= 0) {
        this.marioJumpY = 0;
        this.marioIsJumping = false;
      }
    }

    // Smooth ship lane lerp
    this.playerLane += (this.targetLane - this.playerLane) * Math.min(1.0, dt * 10);
    this.shipTilt *= Math.max(0, 1.0 - dt * 6);

    // Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update floating texts
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.y += t.vy;
      t.alpha -= dt * 1.3;
      if (t.alpha <= 0) this.floatingTexts.splice(i, 1);
    }

    // Update obstacles
    if (this.gameSkin === 'mario' || this.gameSkin === 'runner') {
      const advanceSpeed = dt * 0.65 * this.speed;
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        obs.z -= advanceSpeed;

        if (!obs.passed && obs.z <= 0.15 && obs.z >= 0.05) {
          const distToPlayer = Math.abs(obs.lane - this.playerLane);
          if (distToPlayer < 0.45 && !this.marioIsJumping) {
            obs.passed = true;
            this.screenShake = 10;
            sound.playMarioHitSound();
            this.addFloatingText('BUMP!', obs.lane, '#e52521');
            this.addParticles(obs.lane, 15, '#e52521');
          } else {
            obs.passed = true;
            sound.playMarioCoinSound();
            this.addFloatingText('+10 🪙', this.playerLane, '#fcd800');
          }
        }

        if (obs.z <= 0) {
          this.obstacles.splice(i, 1);
        }
      }

      // Standalone auto-spawn in manual mode
      if (this.mode === 'manual' && this.obstacles.length < 3 && Math.random() < 0.03) {
        const lane = Math.floor(Math.random() * 3) + 1;
        this.obstacles.push({
          lane,
          z: 1.0,
          type: Math.random() > 0.5 ? 'pipe' : 'goomba',
          passed: false
        });
      }
    }

    // Flappy simulation update
    if (this.gameSkin === 'flappy') {
      this.flappyVy += dt * 18;
      this.flappyY += this.flappyVy * dt * 0.1;
      this.flappyY = Math.max(0.05, Math.min(0.95, this.flappyY));
      this.flappyWingCycle += dt * 12;

      for (let i = this.flappyPillars.length - 1; i >= 0; i--) {
        const pil = this.flappyPillars[i];
        pil.x -= dt * 0.45 * this.speed;
        if (pil.x < 0) this.flappyPillars.splice(i, 1);
      }
    }
  }

  render() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.save();

    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    if (this.gameSkin === 'mario') {
      this.renderMarioScene(ctx, w, h);
    } else if (this.gameSkin === 'runner') {
      this.renderRunnerScene(ctx, w, h);
    } else {
      this.renderFlappyScene(ctx, w, h);
    }

    // Draw Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); // Pixel squares
      ctx.restore();
    }

    // Draw Floating Texts
    for (const t of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.fillStyle = t.color;
      ctx.textAlign = 'center';
      // Pixel drop shadow
      ctx.fillStyle = '#000';
      ctx.fillText(t.text, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }

    // Draw NES HUD overlay
    this.renderArcadeOverlay(ctx, w, h);

    ctx.restore();
  }

  /**
   * Super Mario World 8-Bit Scene
   */
  renderMarioScene(ctx, w, h) {
    const floorY = h - 46;

    // 1. Classic Mario Sky Blue
    ctx.fillStyle = '#5c94fc';
    ctx.fillRect(0, 0, w, h);

    // 2. Parallax Scrolling Pixel Clouds
    const cloudOffset = (this.gridOffset * 180) % (w + 140);
    this.drawPixelCloud(ctx, (w * 0.15 - cloudOffset + w + 140) % (w + 140) - 70, 24, 1.1);
    this.drawPixelCloud(ctx, (w * 0.65 - cloudOffset * 0.7 + w + 140) % (w + 140) - 70, 36, 0.85);

    // 3. Parallax Green Rolling Hills
    const hillOffset = (this.gridOffset * 80) % 200;
    for (let x = -hillOffset; x < w + 200; x += 180) {
      this.drawPixelHill(ctx, x, floorY);
      this.drawPixelBush(ctx, x + 90, floorY);
    }

    // 4. Ground Blocks (Green Grass Top + Brown Soil Bricks)
    ctx.fillStyle = '#00a800';
    ctx.fillRect(0, floorY, w, 8); // Lush grass line
    ctx.fillStyle = '#000';
    ctx.fillRect(0, floorY + 8, w, 2); // Black separation

    ctx.fillStyle = '#885418';
    ctx.fillRect(0, floorY + 10, w, 36); // Brown earth

    // Checkerboard brick grid on earth
    ctx.fillStyle = '#482c0c';
    for (let x = 0; x < w; x += 20) {
      ctx.fillRect(x, floorY + 12, 18, 14);
      ctx.fillRect(x + 10, floorY + 28, 18, 14);
    }

    // 5. 3 Mario Lanes Markers
    const laneX = [w * 0.20, w * 0.50, w * 0.80];

    // Floating Question Mark & Brick Blocks
    for (let i = 0; i < 3; i++) {
      const bx = laneX[i] - 14;
      const by = floorY - 76;
      this.drawQuestionBlock(ctx, bx, by, i === 1);
    }

    // 6. Draw Approaching Obstacles (Warp Pipes & Goombas)
    for (const obs of this.obstacles) {
      const ox = laneX[obs.lane - 1] || w * 0.50;
      const progress = 1.0 - obs.z;
      const oy = floorY;

      if (obs.type === 'pipe') {
        this.drawWarpPipe(ctx, ox - 18, oy - 38, 36, 38);
      } else {
        this.drawGoomba(ctx, ox - 12, oy - 22, progress);
      }
    }

    // 7. Draw 8-Bit Mario Hero
    const playerX = laneX[Math.floor(this.playerLane - 1)] || w * 0.50;
    const marioY = floorY - 32 + this.marioJumpY;
    this.drawPixelMario(ctx, playerX, marioY, this.marioIsJumping);
  }

  drawPixelCloud(ctx, x, y, scale = 1.0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.fillStyle = '#ffffff';
    // Stepped pixel cloud puffs
    ctx.fillRect(10, 0, 40, 16);
    ctx.fillRect(0, 8, 60, 14);
    ctx.fillRect(16, -6, 26, 12);

    ctx.restore();
  }

  drawPixelHill(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#00a800';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(x, y, 42, Math.PI, 0);
    ctx.fill();
    ctx.stroke();

    // Dark green spot
    ctx.fillStyle = '#006b00';
    ctx.beginPath();
    ctx.arc(x - 10, y - 20, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawPixelBush(ctx, x, y) {
    ctx.save();
    ctx.fillStyle = '#43b047';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.arc(x, y, 16, Math.PI, 0);
    ctx.arc(x + 18, y, 22, Math.PI, 0);
    ctx.arc(x + 36, y, 16, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  drawQuestionBlock(ctx, x, y, isQuestion = true) {
    ctx.save();
    const size = 28;

    // Block Body
    ctx.fillStyle = isQuestion ? '#f87800' : '#b84418';
    ctx.fillRect(x, y, size, size);

    // Black pixel border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, size, size);

    // Bevel highlight
    ctx.fillStyle = isQuestion ? '#fcd800' : '#f87800';
    ctx.fillRect(x + 2, y + 2, size - 4, 3);
    ctx.fillRect(x + 2, y + 2, 3, size - 4);

    // Question Mark text
    if (isQuestion) {
      ctx.font = 'bold 13px "Press Start 2P", monospace';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText('?', x + size / 2 + 1, y + size / 2 + 6);
      ctx.fillStyle = '#fff';
      ctx.fillText('?', x + size / 2, y + size / 2 + 5);
    } else {
      // Brick mortar lines
      ctx.fillStyle = '#000';
      ctx.fillRect(x, y + size / 2, size, 2);
      ctx.fillRect(x + size / 2, y, 2, size / 2);
      ctx.fillRect(x + size / 4, y + size / 2, 2, size / 2);
      ctx.fillRect(x + (size * 3) / 4, y + size / 2, 2, size / 2);
    }

    ctx.restore();
  }

  drawWarpPipe(ctx, x, y, w, h) {
    ctx.save();
    ctx.fillStyle = '#00a800';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    // Pipe Lip
    ctx.fillRect(x - 3, y, w + 6, 12);
    ctx.strokeRect(x - 3, y, w + 6, 12);

    // Pipe Shaft
    ctx.fillRect(x, y + 12, w, h - 12);
    ctx.strokeRect(x, y + 12, w, h - 12);

    // Pipe Green Highlight
    ctx.fillStyle = '#43b047';
    ctx.fillRect(x + 4, y + 2, 4, 8);
    ctx.fillRect(x + 4, y + 14, 4, h - 16);

    ctx.restore();
  }

  drawGoomba(ctx, x, y, progress) {
    ctx.save();
    ctx.fillStyle = '#885418';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;

    // Body
    ctx.fillRect(x, y, 24, 22);
    ctx.strokeRect(x, y, 24, 22);

    // White Eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 3, y + 4, 6, 8);
    ctx.fillRect(x + 15, y + 4, 6, 8);

    // Black Pupils
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 6, y + 6, 3, 5);
    ctx.fillRect(x + 15, y + 6, 3, 5);

    // Feet
    const step = Math.floor(this.marioWalkFrame) % 2 === 0;
    ctx.fillStyle = '#000';
    ctx.fillRect(x + (step ? 0 : 3), y + 20, 8, 4);
    ctx.fillRect(x + (step ? 16 : 13), y + 20, 8, 4);

    ctx.restore();
  }

  drawPixelMario(ctx, x, y, isJumping = false) {
    ctx.save();
    ctx.translate(x, y);

    const red = '#e52521';
    const blue = '#0028a8';
    const peach = '#fcb888';
    const brown = '#703800';
    const yellow = '#fcd800';

    // 1. Red Cap
    ctx.fillStyle = red;
    ctx.fillRect(-10, -18, 20, 6);
    ctx.fillRect(-6, -22, 16, 5);

    // 2. Peach Face & Nose
    ctx.fillStyle = peach;
    ctx.fillRect(-8, -12, 16, 9);
    ctx.fillRect(6, -11, 4, 4); // Nose

    // 3. Brown Mustache & Hair
    ctx.fillStyle = brown;
    ctx.fillRect(-10, -13, 4, 7);
    ctx.fillRect(-2, -6, 12, 4);

    // 4. Red Shirt
    ctx.fillStyle = red;
    ctx.fillRect(-10, -3, 20, 9);

    // 5. Blue Overalls
    ctx.fillStyle = blue;
    ctx.fillRect(-8, 3, 16, 9);

    // 6. Yellow Button
    ctx.fillStyle = yellow;
    ctx.fillRect(-4, 5, 2, 2);
    ctx.fillRect(2, 5, 2, 2);

    // 7. Shoes (Walk cycle or jump)
    ctx.fillStyle = brown;
    if (isJumping) {
      ctx.fillRect(-14, 12, 10, 5);
      ctx.fillRect(4, 10, 10, 5);
    } else {
      const legFrame = Math.floor(this.marioWalkFrame) % 2 === 0;
      ctx.fillRect(-10, 12, 8, 5);
      ctx.fillRect(legFrame ? 2 : 4, 12, 8, 5);
    }

    ctx.restore();
  }

  renderRunnerScene(ctx, w, h) {
    const horizonY = h * 0.22;
    const horizonW = w * 0.4;
    const horizonX = (w - horizonW) / 2;

    ctx.fillStyle = '#07060f';
    ctx.fillRect(0, 0, w, h);

    // Synthwave Sun
    ctx.save();
    const sunGrad = ctx.createRadialGradient(w / 2, horizonY, 10, w / 2, horizonY, 120);
    sunGrad.addColorStop(0, 'rgba(255, 61, 242, 0.45)');
    sunGrad.addColorStop(0.5, 'rgba(34, 230, 255, 0.15)');
    sunGrad.addColorStop(1, 'rgba(7, 6, 15, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, horizonY + 60);
    ctx.restore();

    // 3D Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 230, 255, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();

    const laneXBottom = [0, w * 0.33, w * 0.67, w];
    const laneXTop = [horizonX, horizonX + horizonW * 0.33, horizonX + horizonW * 0.67, horizonX + horizonW];

    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.strokeStyle = (i === 1 || i === 2) ? 'rgba(34, 230, 255, 0.6)' : 'rgba(255, 61, 242, 0.8)';
      ctx.lineWidth = 2;
      ctx.moveTo(laneXTop[i], horizonY);
      ctx.lineTo(laneXBottom[i], h);
      ctx.stroke();
    }
    ctx.restore();

    // Ship
    const laneWidth = w / 3;
    const shipX = (this.playerLane - 0.5) * laneWidth;
    const shipY = h * 0.74;

    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(this.shipTilt);
    ctx.fillStyle = '#0f0b1f';
    ctx.strokeStyle = '#22e6ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(20, 18);
    ctx.lineTo(0, 12);
    ctx.lineTo(-20, 18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  renderFlappyScene(ctx, w, h) {
    ctx.fillStyle = '#0f0b1f';
    ctx.fillRect(0, 0, w, h);

    // Floor
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 28);
    ctx.lineTo(w, h - 28);
    ctx.stroke();

    // Flappy Craft
    const craftX = w * 0.28;
    const craftY = this.flappyY * (h - 50);

    ctx.save();
    ctx.translate(craftX, craftY);
    ctx.fillStyle = '#ffb020';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fillRect(-16, -10, 32, 20);
    ctx.strokeRect(-16, -10, 32, 20);
    ctx.restore();
  }

  renderArcadeOverlay(ctx, w, h) {
    ctx.save();
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(252, 216, 0, 0.9)';
    ctx.textAlign = 'left';
    ctx.fillText(`WORLD: 1-1`, 12, 18);
    ctx.fillText(`TIME: 360`, 12, 32);

    ctx.textAlign = 'right';
    ctx.fillText(`COIN: ${String(this.score).padStart(4, '0')}`, w - 12, 18);
    ctx.fillText(`BEST: ${String(this.bestScore).padStart(4, '0')}`, w - 12, 32);
    ctx.restore();
  }

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('resize', this.boundResize);
  }
}
