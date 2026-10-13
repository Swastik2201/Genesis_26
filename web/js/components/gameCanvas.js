/**
 * ==========================================================================
 * BEAT THE BOT — LIVE VISUAL GAME VIEWPORT (components/gameCanvas.js)
 * Real-time graphical canvas simulation inspired by brainfunctioncollapse.com/laya.
 * Supports:
 *   1. "Cyber Runner" (3-Lane perspective tactical highway)
 *   2. "Flappy Laya" (Retro amber-dithered CRT arcade flappy mode)
 *   3. Autonomous "Laya Plays" (synced with SSE stream / replay)
 *   4. Interactive "You Play" (keyboard & touch controls: A/D/Arrows/Space)
 * ==========================================================================
 */

export class GameViewport {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    this.mode = 'laya'; // 'laya' | 'manual'
    this.gameSkin = 'runner'; // 'runner' | 'flappy'
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
            <span class="arcade-title" id="arcade-title-label">CYBER RUNNER 2026 // LIVE VIEWPORT</span>
          </div>

          <div class="arcade-header-controls">
            <!-- Skin Selector -->
            <div class="arcade-skin-toggle" role="group" aria-label="Game Visual Style">
              <button class="skin-btn is-active" data-skin="runner" id="btn-skin-runner" title="3-Lane Perspective Runner">
                🏎 3-LANE RUNNER
              </button>
              <button class="skin-btn" data-skin="flappy" id="btn-skin-flappy" title="Retro Flappy CRT Style (brainfunctioncollapse)">
                🐤 FLAPPY RETRO
              </button>
            </div>

            <span class="badge badge-live" id="arcade-mode-badge">⚡ LAYA DRIVING</span>
          </div>
        </div>

        <!-- Canvas Viewport Frame with Scanlines -->
        <div class="arcade-viewport-frame" id="arcade-frame">
          <canvas id="live-game-canvas" width="760" height="380" aria-label="Live Game Visual Simulation"></canvas>
          <div class="arcade-scanlines" aria-hidden="true"></div>
          <div class="arcade-vignette" aria-hidden="true"></div>

          <!-- On-screen Manual Play Touch Controls (Visible only in 'You Play' mode) -->
          <div class="arcade-touch-controls" id="arcade-touch-controls" style="display: none;">
            <button class="touch-btn" id="touch-left" aria-label="Steer Left">◀ SHIFT LEFT</button>
            <button class="touch-btn" id="touch-action" aria-label="Hold or Flap">HOLD LANE / FLAP</button>
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
              <span class="pill-label">SCORE:</span>
              <span class="pill-val" id="arcade-val-score">0000</span>
            </div>
            <div class="arcade-stat-pill">
              <span class="pill-label">LANE:</span>
              <span class="pill-val" id="arcade-val-lane">2 / 3</span>
            </div>
            <div class="arcade-stat-pill">
              <span class="pill-label">CONTROLS:</span>
              <span class="pill-val" style="color: var(--neon-cyan);">[A/D] or [◄/►]</span>
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
    const btnSkinRunner = this.container.querySelector('#btn-skin-runner');
    const btnSkinFlappy = this.container.querySelector('#btn-skin-flappy');

    const touchLeft = this.container.querySelector('#touch-left');
    const touchRight = this.container.querySelector('#touch-right');
    const touchAction = this.container.querySelector('#touch-action');

    if (btnLaya) {
      btnLaya.addEventListener('click', () => this.setMode('laya'));
    }
    if (btnHuman) {
      btnHuman.addEventListener('click', () => this.setMode('manual'));
    }
    if (btnPause) {
      btnPause.addEventListener('click', () => this.togglePause());
    }

    if (btnSkinRunner) {
      btnSkinRunner.addEventListener('click', () => this.setSkin('runner'));
    }
    if (btnSkinFlappy) {
      btnSkinFlappy.addEventListener('click', () => this.setSkin('flappy'));
    }

    if (touchLeft) {
      touchLeft.addEventListener('click', () => this.steerManual(-1));
    }
    if (touchRight) {
      touchRight.addEventListener('click', () => this.steerManual(1));
    }
    if (touchAction) {
      touchAction.addEventListener('click', () => {
        if (this.gameSkin === 'flappy') this.flapManual();
      });
    }
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.max(480, Math.floor(rect.width));
    const targetHeight = Math.floor(targetWidth * 0.48); // 2.08 aspect ratio for sleek HUD monitor

    this.canvas.width = targetWidth * dpr;
    this.canvas.height = targetHeight * dpr;
    this.canvas.style.width = `${targetWidth}px`;
    this.canvas.style.height = `${targetHeight}px`;

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setSkin(skin) {
    this.gameSkin = skin;
    const btnRunner = this.container.querySelector('#btn-skin-runner');
    const btnFlappy = this.container.querySelector('#btn-skin-flappy');
    const titleLabel = this.container.querySelector('#arcade-title-label');

    if (btnRunner && btnFlappy) {
      btnRunner.classList.toggle('is-active', skin === 'runner');
      btnFlappy.classList.toggle('is-active', skin === 'flappy');
    }

    if (titleLabel) {
      titleLabel.textContent = skin === 'runner' 
        ? 'CYBER RUNNER 2026 // LIVE VIEWPORT' 
        : 'FLAPPY LAYA RETRO // DITHERED CRT SIMULATION';
    }

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

    this.addFloatingText(mode === 'laya' ? 'AUTONOMOUS MODE ENGAGED' : 'MANUAL CONTROL ACTIVE!', 2);
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
    // Only capture keys if focused on panel or in manual mode
    if (this.mode !== 'manual') return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.steerManual(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.steerManual(1);
    } else if (e.key === ' ' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.gameSkin === 'flappy') this.flapManual();
    }
  }

  steerManual(direction) {
    const nextLane = Math.max(1, Math.min(3, this.targetLane + direction));
    if (nextLane !== this.targetLane) {
      this.targetLane = nextLane;
      this.shipTilt = direction * 0.45;
      this.addParticles(this.playerLane, 8, '#22e6ff');
    }
  }

  flapManual() {
    this.flappyVy = -7.5;
    this.addParticles(2, 6, '#ffb020');
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
      } else if (finalAction === 'move_right') {
        this.targetLane = Math.min(3, this.targetLane + 1);
        this.shipTilt = 0.4;
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
      this.addFloatingText('+10 PTS', this.targetLane, '#39ff88');
      this.addParticles(this.targetLane, 12, '#39ff88');
    } else if (event.game_response?.good === false) {
      this.screenShake = 12;
      this.addFloatingText('COLLISION!', this.targetLane, '#ff4d6d');
      this.addParticles(this.targetLane, 20, '#ff4d6d');
    } else if (event.validator?.retries > 0) {
      this.screenShake = 6;
      this.addFloatingText('VALIDATOR RETRY', this.targetLane, '#ffb020');
      this.addParticles(this.targetLane, 10, '#ffb020');
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
      type: Math.random() > 0.3 ? 'laser' : 'barrier',
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
    const y = h * 0.75;

    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: x + (Math.random() - 0.5) * 40,
        y: y + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 6,
        vy: -Math.random() * 5 - 2,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        color: color,
        size: Math.random() * 4 + 2
      });
    }
  }

  addFloatingText(text, lane, color = '#22e6ff') {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const laneWidth = w / 3;
    const x = (lane - 0.5) * laneWidth;
    const y = h * 0.65;

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
    this.gridOffset = (this.gridOffset + dt * 1.8 * this.speed) % 1.0;

    // Smooth ship lane lerp
    this.playerLane += (this.targetLane - this.playerLane) * Math.min(1.0, dt * 10);
    this.shipTilt *= Math.max(0, 1.0 - dt * 6);

    // Particle thruster generator
    if (Math.random() > 0.2) {
      const rect = this.canvas.getBoundingClientRect();
      const laneWidth = rect.width / 3;
      const shipX = (this.playerLane - 0.5) * laneWidth;
      const shipY = rect.height * 0.78;

      this.particles.push({
        x: shipX + (Math.random() - 0.5) * 16,
        y: shipY + 12,
        vx: (Math.random() - 0.5) * 1.5,
        vy: 3 + Math.random() * 3,
        life: 1.0,
        decay: 0.04,
        color: Math.random() > 0.5 ? '#22e6ff' : '#ff3df2',
        size: Math.random() * 3 + 1
      });
    }

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
      t.alpha -= dt * 1.2;
      if (t.alpha <= 0) this.floatingTexts.splice(i, 1);
    }

    // Update runner obstacles
    if (this.gameSkin === 'runner') {
      const advanceSpeed = dt * 0.65 * this.speed;
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        obs.z -= advanceSpeed;

        // Collision or pass check
        if (!obs.passed && obs.z <= 0.15 && obs.z >= 0.05) {
          const distToPlayer = Math.abs(obs.lane - this.playerLane);
          if (distToPlayer < 0.5) {
            // Collision
            obs.passed = true;
            this.screenShake = 10;
            this.addFloatingText('CRASH!', obs.lane, '#ff4d6d');
            this.addParticles(obs.lane, 15, '#ff4d6d');
          } else {
            // Safe clearance
            obs.passed = true;
            this.addFloatingText('+10', this.playerLane, '#39ff88');
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
          type: 'laser',
          passed: false
        });
      }
    }

    // Flappy simulation update
    if (this.gameSkin === 'flappy') {
      this.flappyVy += dt * 18; // gravity
      this.flappyY += this.flappyVy * dt * 0.1;
      this.flappyY = Math.max(0.05, Math.min(0.95, this.flappyY));
      this.flappyWingCycle += dt * 12;

      for (let i = this.flappyPillars.length - 1; i >= 0; i--) {
        const pil = this.flappyPillars[i];
        pil.x -= dt * 0.45 * this.speed;
        if (pil.x < 0) this.flappyPillars.splice(i, 1);
      }

      if (this.mode === 'manual' && this.flappyPillars.length < 3 && Math.random() < 0.02) {
        this.flappyPillars.push({
          x: 1.0,
          gapY: 0.25 + Math.random() * 0.5,
          gapSize: 0.35,
          passed: false
        });
      }
    }
  }

  render() {
    const ctx = this.ctx;
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    ctx.save();

    // Apply screen shake
    if (this.screenShake > 0) {
      const sx = (Math.random() - 0.5) * this.screenShake;
      const sy = (Math.random() - 0.5) * this.screenShake;
      ctx.translate(sx, sy);
    }

    // Clear background
    ctx.fillStyle = '#07060f';
    ctx.fillRect(0, 0, w, h);

    if (this.gameSkin === 'runner') {
      this.renderRunnerScene(ctx, w, h);
    } else {
      this.renderFlappyScene(ctx, w, h);
    }

    // Draw Particles
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw Floating Texts
    for (const t of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = 'bold 16px "Orbitron", monospace';
      ctx.fillStyle = t.color;
      ctx.shadowColor = t.color;
      ctx.shadowBlur = 10;
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }

    // Draw CRT HUD overlay
    this.renderArcadeOverlay(ctx, w, h);

    ctx.restore();
  }

  renderRunnerScene(ctx, w, h) {
    const horizonY = h * 0.22;
    const horizonW = w * 0.4;
    const horizonX = (w - horizonW) / 2;

    // 1. Synthwave Horizon Neon Sun / Grid
    ctx.save();
    const sunGrad = ctx.createRadialGradient(w / 2, horizonY, 10, w / 2, horizonY, 120);
    sunGrad.addColorStop(0, 'rgba(255, 61, 242, 0.45)');
    sunGrad.addColorStop(0.5, 'rgba(34, 230, 255, 0.15)');
    sunGrad.addColorStop(1, 'rgba(7, 6, 15, 0)');
    ctx.fillStyle = sunGrad;
    ctx.fillRect(0, 0, w, horizonY + 60);

    // Sun lines
    ctx.strokeStyle = 'rgba(255, 61, 242, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w / 2, horizonY - 10, 48, Math.PI, 0);
    ctx.stroke();
    ctx.restore();

    // 2. 3D Perspective Road Grid
    ctx.save();
    ctx.strokeStyle = 'rgba(34, 230, 255, 0.25)';
    ctx.lineWidth = 1;

    // Horizon line
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(w, horizonY);
    ctx.stroke();

    // Road 3 Lanes dividing lines
    const laneXBottom = [0, w * 0.33, w * 0.67, w];
    const laneXTop = [horizonX, horizonX + horizonW * 0.33, horizonX + horizonW * 0.67, horizonX + horizonW];

    for (let i = 0; i <= 3; i++) {
      ctx.beginPath();
      ctx.strokeStyle = (i === 1 || i === 2) ? 'rgba(34, 230, 255, 0.6)' : 'rgba(255, 61, 242, 0.8)';
      ctx.lineWidth = (i === 1 || i === 2) ? 1.5 : 2.5;
      ctx.moveTo(laneXTop[i], horizonY);
      ctx.lineTo(laneXBottom[i], h);
      ctx.stroke();
    }

    // Moving horizontal perspective grid lines
    const numGridLines = 10;
    for (let i = 0; i < numGridLines; i++) {
      const progress = (i / numGridLines + this.gridOffset / numGridLines) % 1.0;
      // Exponential curve for depth
      const y = horizonY + Math.pow(progress, 2.2) * (h - horizonY);
      const rowW = horizonW + (w - horizonW) * progress;
      const rowX = (w - rowW) / 2;

      ctx.beginPath();
      ctx.strokeStyle = `rgba(34, 230, 255, ${0.1 + progress * 0.35})`;
      ctx.moveTo(rowX, y);
      ctx.lineTo(rowX + rowW, y);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Lane Number Markers on Road
    ctx.save();
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(34, 230, 255, 0.5)';
    ctx.textAlign = 'center';
    ctx.fillText('LANE 1 // LEFT', w * 0.165, h - 14);
    ctx.fillText('LANE 2 // CENTER', w * 0.5, h - 14);
    ctx.fillText('LANE 3 // RIGHT', w * 0.835, h - 14);
    ctx.restore();

    // 4. Render Approaching Obstacles
    for (const obs of this.obstacles) {
      this.draw3DObstacle(ctx, obs, horizonY, horizonX, horizonW, w, h);
    }

    // 5. Render Player Cyber Ship
    this.drawPlayerShip(ctx, w, h, horizonY);
  }

  draw3DObstacle(ctx, obs, horizonY, horizonX, horizonW, w, h) {
    const p = Math.max(0, Math.min(1.0, 1.0 - obs.z)); // 0 at horizon, 1 at player
    const y = horizonY + Math.pow(p, 2.2) * (h - horizonY);

    const laneIndex = obs.lane - 1; // 0, 1, 2
    const topLaneLeft = horizonX + horizonW * (laneIndex / 3);
    const topLaneRight = horizonX + horizonW * ((laneIndex + 1) / 3);
    const botLaneLeft = w * (laneIndex / 3);
    const botLaneRight = w * ((laneIndex + 1) / 3);

    const obsLeft = topLaneLeft + (botLaneLeft - topLaneLeft) * p;
    const obsRight = topLaneRight + (botLaneRight - topLaneRight) * p;
    const obsW = obsRight - obsLeft;
    const obsH = Math.max(12, 38 * p);

    ctx.save();
    // Glowing Laser Hazard Barrier
    const color = obs.type === 'laser' ? '#ff4d6d' : '#ffb020';
    ctx.shadowColor = color;
    ctx.shadowBlur = 12 * p;

    // Barrier frame
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(obsLeft + 4, y - obsH, obsW - 8, obsH);

    // Hazard stripes
    ctx.strokeStyle = '#07060f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = obsLeft + 10; x < obsRight - 10; x += 14) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + 10, y - obsH);
    }
    ctx.stroke();

    // Distance Label tag
    if (p < 0.85) {
      ctx.font = `bold ${Math.max(9, 12 * p)}px "Orbitron", monospace`;
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText(`BARRIER ${Math.floor(obs.z * 5)}`, (obsLeft + obsRight) / 2, y - obsH - 6);
    }

    ctx.restore();
  }

  drawPlayerShip(ctx, w, h, horizonY) {
    const laneWidth = w / 3;
    const shipX = (this.playerLane - 0.5) * laneWidth;
    const shipY = h * 0.76;
    const shipW = 46;
    const shipH = 34;

    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(this.shipTilt);

    // Ship Shadow / Underglow
    ctx.shadowColor = '#22e6ff';
    ctx.shadowBlur = 20;

    // Thruster Twin Flames
    ctx.fillStyle = '#39ff88';
    ctx.beginPath();
    ctx.moveTo(-12, shipH / 2);
    ctx.lineTo(-6, shipH / 2 + 16 + Math.random() * 8);
    ctx.lineTo(0, shipH / 2);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, shipH / 2);
    ctx.lineTo(6, shipH / 2 + 16 + Math.random() * 8);
    ctx.lineTo(12, shipH / 2);
    ctx.closePath();
    ctx.fill();

    // Fuselage Neon Craft
    ctx.fillStyle = '#0f0b1f';
    ctx.strokeStyle = '#22e6ff';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.moveTo(0, -shipH / 2);         // Nose
    ctx.lineTo(shipW / 2, shipH / 2);   // Right wing tip
    ctx.lineTo(shipW / 4, shipH / 3);
    ctx.lineTo(0, shipH / 2 - 2);       // Center tail
    ctx.lineTo(-shipW / 4, shipH / 3);
    ctx.lineTo(-shipW / 2, shipH / 2);  // Left wing tip
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Cockpit Glow
    ctx.fillStyle = '#ff3df2';
    ctx.shadowColor = '#ff3df2';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(0, -shipH / 4);
    ctx.lineTo(5, shipH / 6);
    ctx.lineTo(-5, shipH / 6);
    ctx.closePath();
    ctx.fill();

    // Pilot Badge Tag
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillStyle = '#22e6ff';
    ctx.textAlign = 'center';
    ctx.fillText('LAYA // MK.I', 0, -shipH / 2 - 8);

    ctx.restore();
  }

  renderFlappyScene(ctx, w, h) {
    // Retro Amber CRT aesthetic inspired by brainfunctioncollapse.com/laya
    ctx.fillStyle = '#0f0b1f';
    ctx.fillRect(0, 0, w, h);

    // Dithered city skyline backdrop
    ctx.strokeStyle = 'rgba(255, 176, 32, 0.3)';
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 16) {
      const bH = 30 + ((x * 47) % 70);
      ctx.strokeRect(x, h - bH - 30, 14, bH);
    }

    // Floor line
    ctx.strokeStyle = '#ffb020';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h - 30);
    ctx.lineTo(w, h - 30);
    ctx.stroke();

    // Render Flappy Pillars
    for (const pil of this.flappyPillars) {
      const pilX = pil.x * w;
      const pilW = 54;
      const gapY = pil.gapY * (h - 60);
      const gapH = pil.gapSize * (h - 60);

      ctx.fillStyle = '#16112e';
      ctx.strokeStyle = '#ffb020';
      ctx.lineWidth = 2;

      // Top pillar
      ctx.fillRect(pilX, 0, pilW, gapY);
      ctx.strokeRect(pilX, 0, pilW, gapY);

      // Bottom pillar
      const bTop = gapY + gapH;
      ctx.fillRect(pilX, bTop, pilW, h - 30 - bTop);
      ctx.strokeRect(pilX, bTop, pilW, h - 30 - bTop);

      // Pillar Dither Texture
      ctx.fillStyle = 'rgba(255, 176, 32, 0.15)';
      ctx.fillRect(pilX + 4, 4, pilW - 8, gapY - 8);
      ctx.fillRect(pilX + 4, bTop + 4, pilW - 8, h - 30 - bTop - 8);
    }

    // Render Flappy Craft
    const craftX = w * 0.28;
    const craftY = this.flappyY * (h - 60);
    const flap = Math.sin(this.flappyWingCycle) * 6;

    ctx.save();
    ctx.translate(craftX, craftY);
    ctx.fillStyle = '#ffb020';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;

    // Body
    ctx.fillRect(-16, -10, 32, 20);
    ctx.strokeRect(-16, -10, 32, 20);

    // Eye / Cockpit
    ctx.fillStyle = '#07060f';
    ctx.fillRect(6, -6, 6, 6);

    // Wing
    ctx.fillStyle = '#ffb020';
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(-20, flap);
    ctx.lineTo(-4, flap);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  renderArcadeOverlay(ctx, w, h) {
    // Top CRT Telemetry Readout
    ctx.save();
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(34, 230, 255, 0.8)';
    ctx.textAlign = 'left';
    ctx.fillText(`SOURCE: LIVE LAYA STREAM`, 14, 20);
    ctx.fillText(`FPS: 60  |  LATENCY: 28ms`, 14, 34);

    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${String(this.score).padStart(4, '0')}`, w - 14, 20);
    ctx.fillText(`BEST:  ${String(this.bestScore).padStart(4, '0')}`, w - 14, 34);
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
