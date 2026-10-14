/**
 * ==========================================================================
 * BEAT THE BOT — LIVE VISUAL GAME VIEWPORT (components/gameCanvas.js)
 * Real-time graphical canvas simulation.
 * Supports:
 *   1. "Cyber Runner" (Clean 3-lane perspective highway with clear hurdles)
 *   2. "Flappy Bird" (Tree logs with wood grain, gap navigation, instant death)
 *   3. Autonomous Laya model steering & flight
 *   4. Interactive "You Play" mode with smooth keyboard/touch controls
 *   5. Full Pause/Resume controls synced with Live toolbar
 * ==========================================================================
 */

import * as sound from '../sound.js';

export class GameViewport {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = options;

    this.mode = 'laya'; // 'laya' | 'manual'
    this.gameSkin = 'runner'; // 'runner' (default) | 'flappy'
    this.isPaused = false;

    // Shared score & telemetry
    this.score = 0;
    this.bestScore = 420;
    this.currentStep = 0;
    this.speed = 1.0;
    this.screenShake = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.gridOffset = 0;

    // --- CYBER RUNNER (3 LANES) STATE ---
    this.playerLane = 2.0;       // Continuous position 1.0 to 3.0 (smooth lerp)
    this.targetLane = 2.0;       // Destination lane: 1, 2, or 3
    this.shipTilt = 0.0;         // Banking roll angle
    this.obstacles = [];         // Oncoming hurdles [{ lane, z, passed }]
    this.runnerEnginePulse = 0;

    // --- FLAPPY BIRD STATE ---
    this.flappyY = 0.48;         // 0.0 (top) to 1.0 (ground)
    this.flappyVy = 0.0;         // Vertical velocity
    this.flappyWingCycle = 0;
    this.birdAngle = 0.0;        // Pitch rotation
    this.flappyPillars = [];     // Tree log pairs [{ x, gapY, gapSize, passed }]
    this.isBirdDead = false;
    this.birdDeathTimer = 0;

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
            <span class="arcade-title" id="arcade-title-label">CYBER RUNNER // 3-LANE HIGHWAY</span>
          </div>

          <div class="arcade-header-controls">
            <!-- Skin Selector: Cyber Runner & Flappy Bird ONLY -->
            <div class="arcade-skin-toggle" role="group" aria-label="Game Visual Style">
              <button class="skin-btn is-active" data-skin="runner" id="btn-skin-runner" title="3-Lane Tactical Runner">
                🏎 CYBER RUNNER
              </button>
              <button class="skin-btn" data-skin="flappy" id="btn-skin-flappy" title="Flappy Bird Tree Logs">
                🐤 FLAPPY BIRD
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

          <!-- On-screen Manual Play Touch Controls -->
          <div class="arcade-touch-controls" id="arcade-touch-controls" style="display: none;">
            <button class="touch-btn" id="touch-left" aria-label="Steer Left">◀ LANE LEFT</button>
            <button class="touch-btn" id="touch-action" aria-label="Action or Flap">ACTION / FLAP ⬆</button>
            <button class="touch-btn" id="touch-right" aria-label="Steer Right">LANE RIGHT ▶</button>
          </div>
        </div>

        <!-- Monitor Footer Bar -->
        <div class="arcade-footer">
          <div class="arcade-stats-row">
            <div class="arcade-stat-item">
              <span class="arcade-stat-label">SCORE:</span>
              <span class="arcade-stat-value" id="arcade-val-score" style="color: var(--arcade-yellow, #ffd000);">0000</span>
            </div>
            <div class="arcade-stat-item" id="arcade-lane-stat-box">
              <span class="arcade-stat-label">LANE:</span>
              <span class="arcade-stat-value" id="arcade-val-lane" style="color: var(--neon-cyan, #00f0ff);">2 / 3</span>
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
    const btnRunner = this.container.querySelector('#btn-skin-runner');
    const btnFlappy = this.container.querySelector('#btn-skin-flappy');
    if (btnRunner) btnRunner.addEventListener('click', () => this.setSkin('runner'));
    if (btnFlappy) btnFlappy.addEventListener('click', () => this.setSkin('flappy'));

    // Pause Button
    const btnPause = this.container.querySelector('#btn-pause-game');
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.togglePause();
      });
    }

    // Mode Toggle (Laya vs You Play)
    const btnToggle = this.container.querySelector('#btn-toggle-manual-play');
    if (btnToggle) {
      btnToggle.addEventListener('click', () => {
        this.setMode(this.mode === 'laya' ? 'manual' : 'laya');
      });
    }

    // Restart Button (calls parent onRestart to reset full timeline and replay steps)
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

    // Canvas click triggers action or restart
    this.canvas.addEventListener('click', () => {
      if (this.gameSkin === 'flappy') {
        if (this.isBirdDead) {
          this.resetSkin('flappy');
        } else {
          this.flapManual();
        }
      }
    });

    // Touch controls
    const touchLeft = this.container.querySelector('#touch-left');
    const touchRight = this.container.querySelector('#touch-right');
    const touchAction = this.container.querySelector('#touch-action');
    if (touchLeft) touchLeft.addEventListener('click', () => this.shiftLane(-1));
    if (touchRight) touchRight.addEventListener('click', () => this.shiftLane(1));
    if (touchAction) touchAction.addEventListener('click', () => {
      if (this.gameSkin === 'flappy') {
        if (this.isBirdDead) this.resetSkin('flappy');
        else this.flapManual();
      }
    });
  }

  setSkin(skin) {
    if (skin !== 'runner' && skin !== 'flappy') skin = 'runner';
    this.gameSkin = skin;

    const btnRunner = this.container.querySelector('#btn-skin-runner');
    const btnFlappy = this.container.querySelector('#btn-skin-flappy');
    if (btnRunner && btnFlappy) {
      btnRunner.classList.toggle('is-active', skin === 'runner');
      btnFlappy.classList.toggle('is-active', skin === 'flappy');
    }

    const titleLabel = this.container.querySelector('#arcade-title-label');
    const laneBox = this.container.querySelector('#arcade-lane-stat-box');

    if (skin === 'runner') {
      if (titleLabel) titleLabel.textContent = 'CYBER RUNNER // 3-LANE HIGHWAY';
      if (laneBox) laneBox.style.display = 'flex';
    } else {
      if (titleLabel) titleLabel.textContent = 'FLAPPY BIRD // TREE LOG FLIGHT ARENA';
      if (laneBox) laneBox.style.display = 'none';
    }

    this.resetSkin(skin);
  }

  resetSkin(skin) {
    this.score = 0;
    this.particles = [];
    this.floatingTexts = [];
    this.isBirdDead = false;
    this.birdDeathTimer = 0;

    if (skin === 'runner') {
      this.playerLane = 2.0;
      this.targetLane = 2.0;
      this.shipTilt = 0;
      this.obstacles = [
        { lane: 1, z: 0.90, passed: false },
        { lane: 3, z: 0.42, passed: false }
      ];
    } else {
      this.flappyY = 0.48;
      this.flappyVy = 0;
      this.birdAngle = 0;
      // Initial tree logs widely spaced (0.70 gap)
      this.flappyPillars = [
        { x: 0.95, gapY: 0.48, gapSize: 0.38, passed: false },
        { x: 1.65, gapY: 0.52, gapSize: 0.38, passed: false }
      ];
    }
  }

  setMode(mode) {
    this.mode = mode;
    const badge = this.container.querySelector('#arcade-mode-badge');
    const btn = this.container.querySelector('#btn-toggle-manual-play');
    const touch = this.container.querySelector('#arcade-touch-controls');

    if (mode === 'manual') {
      if (badge) {
        badge.className = 'badge badge-bad';
        badge.textContent = '🎮 YOU DRIVING';
      }
      if (btn) btn.innerHTML = '<span>⚡ RESUME LAYA</span>';
      if (touch) touch.style.display = 'flex';
    } else {
      if (badge) {
        badge.className = 'badge badge-live';
        badge.textContent = '⚡ LAYA DRIVING';
      }
      if (btn) btn.innerHTML = '<span>🎮 TAKE OVER</span>';
      if (touch) touch.style.display = 'none';
    }
  }

  setPaused(isPaused) {
    this.isPaused = Boolean(isPaused);
    if (!this.isPaused) {
      this.lastTime = performance.now();
    }
    const btnPause = this.container.querySelector('#btn-pause-game');
    if (btnPause) {
      btnPause.innerHTML = this.isPaused ? '<span>▶ RESUME</span>' : '<span>⏸ PAUSE</span>';
    }
    const livePlayBtn = document.getElementById('live-btn-play');
    if (livePlayBtn) {
      livePlayBtn.innerHTML = this.isPaused ? '<span>▶ PLAY LIVE</span>' : '<span>⏸ PAUSE</span>';
    }
  }

  togglePause() {
    this.setPaused(!this.isPaused);
    return this.isPaused;
  }

  handleResize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const targetW = Math.max(320, Math.floor(rect.width));
    const targetH = 340;

    this.canvas.width = targetW * dpr;
    this.canvas.height = targetH * dpr;
    this.canvas.style.width = `${targetW}px`;
    this.canvas.style.height = `${targetH}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  handleKeyDown(e) {
    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      this.togglePause();
      return;
    }

    if (this.gameSkin === 'flappy' && this.isBirdDead && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      this.resetSkin('flappy');
      return;
    }

    if (this.mode !== 'manual') return;

    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.shiftLane(-1);
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.shiftLane(1);
    } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      if (this.gameSkin === 'flappy') this.flapManual();
    }
  }

  shiftLane(dir) {
    this.targetLane = Math.max(1, Math.min(3, Math.round(this.targetLane) + dir));
    const laneVal = this.container.querySelector('#arcade-val-lane');
    if (laneVal) laneVal.textContent = `${this.targetLane} / 3`;
    sound.playStepClickSound();
  }

  flapManual() {
    if (this.isBirdDead) {
      this.resetSkin('flappy');
      return;
    }
    // Smooth, calibrated flap impulse for responsive control
    this.flappyVy = -6.8;
    this.birdAngle = -0.45;
    sound.playStepClickSound();

    const rect = this.canvas.getBoundingClientRect();
    const floorY = rect.height - 36;
    this.addParticles(rect.width * 0.28, this.flappyY * floorY, 6, '#ffd000');
  }

  /**
   * Spawns a tree log ONLY if the previous log is far enough ahead (maintains generous gap).
   */
  trySpawnFlappyLog() {
    const maxX = this.flappyPillars.length > 0 ? Math.max(...this.flappyPillars.map(p => p.x)) : 0;
    // Strict spacing: never spawn if previous log is closer than 0.62 screen width
    if (maxX > 0.62) return;

    const gapY = 0.35 + Math.random() * 0.30;
    this.flappyPillars.push({
      x: Math.max(1.22, maxX + 0.65),
      gapY,
      gapSize: 0.38,
      passed: false
    });
  }

  /**
   * Spawns a cyber runner hurdle with clean spacing (at least 0.45 distance in z).
   */
  trySpawnRunnerHurdle() {
    const maxZ = this.obstacles.length > 0 ? Math.max(...this.obstacles.map(o => o.z)) : 0;
    if (maxZ > 0.55) return;

    // Never block all lanes
    const nearLanes = this.obstacles.filter(o => o.z > 0.65).map(o => o.lane);
    const freeLanes = [1, 2, 3].filter(l => !nearLanes.includes(l));
    const spawnLane = freeLanes.length > 0
      ? freeLanes[Math.floor(Math.random() * freeLanes.length)]
      : Math.floor(Math.random() * 3) + 1;

    this.obstacles.push({
      lane: spawnLane,
      z: Math.max(1.0, maxZ + 0.48),
      passed: false
    });
  }

  /**
   * Fed real-time or replay step events from the backend Laya model.
   */
  feedStep(event) {
    if (!event) return;
    this.currentStep = event.step ?? (this.currentStep + 1);
    const facts = event.state?.facts || {};
    const finalAction = String(event.final_action || '').toLowerCase();
    const scoreAfter = event.game_response?.score_after ?? event.state?.score ?? this.score;
    this.score = scoreAfter;
    if (this.score > this.bestScore) this.bestScore = this.score;

    // Update Telemetry Display
    const scoreVal = this.container.querySelector('#arcade-val-score');
    const laneVal = this.container.querySelector('#arcade-val-lane');
    if (scoreVal) scoreVal.textContent = String(this.score).padStart(4, '0');

    // Laya Autonomous Action Steering
    if (this.mode === 'laya') {
      if (this.gameSkin === 'runner') {
        if (facts.player_lane !== undefined) {
          // 0-indexed player_lane (0, 1, 2) mapped to 1, 2, 3
          this.targetLane = Math.max(1, Math.min(3, Number(facts.player_lane) + 1));
        } else if (facts.current_lane) {
          this.targetLane = Math.max(1, Math.min(3, Number(facts.current_lane)));
        } else if (finalAction.includes('lane_1')) {
          this.targetLane = 1;
        } else if (finalAction.includes('lane_2')) {
          this.targetLane = 2;
        } else if (finalAction.includes('lane_3')) {
          this.targetLane = 3;
        } else if (finalAction === 'move_left') {
          this.targetLane = Math.max(1, this.targetLane - 1);
        } else if (finalAction === 'move_right') {
          this.targetLane = Math.min(3, this.targetLane + 1);
        }
        if (laneVal) laneVal.textContent = `${this.targetLane} / 3`;
      }
      // Note: For Flappy Bird, continuous gap-tracking in update() handles smooth,
      // flawless flight between logs without jerky step disruptions.
    }

    // Try spawning an obstacle respecting strict distance limits
    if (this.gameSkin === 'runner') {
      this.trySpawnRunnerHurdle();
    } else {
      this.trySpawnFlappyLog();
    }

    // Audio & Particle Feedback
    if (event.game_response?.good === true) {
      sound.playGoodMoveSound();
      this.addFloatingText('+10 PTS 🪙', this.targetLane, '#ffd000');
    } else if (event.game_response?.good === false) {
      this.screenShake = 14;
      sound.playBadMoveSound();
      this.addFloatingText('COLLISION! 💥', this.targetLane, '#e52521');
    }
  }

  addParticles(xPos, yPos, count, color) {
    for (let i = 0; i < count; i++) {
      this.particles.push({
        x: xPos + (Math.random() - 0.5) * 20,
        y: yPos + (Math.random() - 0.5) * 16,
        vx: (Math.random() - 0.5) * 4,
        vy: -Math.random() * 3 - 1.5,
        life: 1.0,
        decay: 0.035 + Math.random() * 0.03,
        color: color,
        size: Math.random() * 4 + 2
      });
    }
  }

  addFloatingText(text, laneOrPos, color = '#ffd000') {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const x = typeof laneOrPos === 'number' && laneOrPos <= 3
      ? (laneOrPos - 0.5) * (w / 3)
      : w / 2;
    const y = h * 0.58;

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
      const dt = Math.min(0.08, (timestamp - this.lastTime) / 1000);
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
    if (this.isPaused) return;

    this.gridOffset = (this.gridOffset + dt * 1.8 * this.speed) % 1.0;
    this.runnerEnginePulse = (this.runnerEnginePulse + dt * 8) % (Math.PI * 2);

    if (this.screenShake > 0) {
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }

    // =========================================================================
    // 1. CYBER RUNNER 3-LANE UPDATE
    // =========================================================================
    if (this.gameSkin === 'runner') {
      // Silky-smooth exponential lane interpolation & banking
      const laneLerp = 1.0 - Math.exp(-14 * dt);
      this.playerLane += (this.targetLane - this.playerLane) * laneLerp;

      const targetTilt = (this.targetLane - this.playerLane) * 0.48;
      this.shipTilt += (targetTilt - this.shipTilt) * (1.0 - Math.exp(-16 * dt));

      // Autonomous Laya model obstacle avoidance
      if (this.mode === 'laya' && this.obstacles.length > 0) {
        // Look ahead for hurdles approaching in our lane
        const oncoming = this.obstacles.find(o => !o.passed && o.z < 0.72 && o.z > 0.15 && o.lane === this.targetLane);
        if (oncoming) {
          // Identify candidate safe lanes
          const candidateLanes = [1, 2, 3].filter(l => l !== oncoming.lane);
          // Score lanes: prefer lanes with NO obstacles anywhere in danger zone (z < 0.75)
          const completelySafe = candidateLanes.filter(lane => {
            return !this.obstacles.some(o => !o.passed && o.lane === lane && o.z < 0.78 && o.z > 0.10);
          });

          const chosenLane = completelySafe.length > 0
            ? completelySafe.sort((a, b) => Math.abs(a - this.targetLane) - Math.abs(b - this.targetLane))[0]
            : candidateLanes[0];

          if (chosenLane && chosenLane !== this.targetLane) {
            this.targetLane = chosenLane;
            const laneVal = this.container.querySelector('#arcade-val-lane');
            if (laneVal) laneVal.textContent = `${this.targetLane} / 3`;
          }
        }
      }

      // Advance obstacles down the highway towards the runner
      const advanceSpeed = dt * 0.58 * this.speed;
      for (let i = this.obstacles.length - 1; i >= 0; i--) {
        const obs = this.obstacles[i];
        obs.z -= advanceSpeed;

        // Collision check at impact zone (z ≈ 0.16)
        if (!obs.passed && obs.z <= 0.18 && obs.z >= 0.06) {
          const distToPlayer = Math.abs(obs.lane - this.playerLane);
          const rect = this.canvas.getBoundingClientRect();
          const shipX = (obs.lane - 0.5) * (rect.width / 3);
          const shipY = rect.height * 0.76;

          if (distToPlayer < 0.44) {
            // Collision with hurdle!
            obs.passed = true;
            this.screenShake = 14;
            sound.playBadMoveSound();
            this.addFloatingText('HURDLE HIT! 💥', obs.lane, '#e52521');
            this.addParticles(shipX, shipY, 20, '#e52521');
          } else {
            // Smooth evasion!
            obs.passed = true;
            this.score += 10;
            if (this.score > this.bestScore) this.bestScore = this.score;
            const scoreVal = this.container.querySelector('#arcade-val-score');
            if (scoreVal) scoreVal.textContent = String(this.score).padStart(4, '0');
            sound.playGoodMoveSound();
            this.addFloatingText('+10 DODGED 🪙', this.playerLane, '#ffd000');
            this.addParticles(shipX, shipY, 10, '#ffd000');
          }
        }

        if (obs.z <= 0.0) {
          this.obstacles.splice(i, 1);
        }
      }

      // Spawning new hurdles with clean pacing (minimum z gap)
      if (this.obstacles.length < 3 && Math.random() < 0.04) {
        this.trySpawnRunnerHurdle();
      }
    }

    // =========================================================================
    // 2. FLAPPY BIRD TREE LOGS UPDATE
    // =========================================================================
    if (this.gameSkin === 'flappy') {
      const rect = this.canvas.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const floorY = h - 36;
      const birdX = w * 0.28;
      const birdRadiusX = 14;
      const birdRadiusY = 11;
      const logWidth = 68;

      if (!this.isBirdDead) {
        // Smooth flight physics
        this.flappyVy += dt * 22;
        this.flappyVy = Math.min(9.5, this.flappyVy); // Terminal fall speed
        this.flappyY += (this.flappyVy * dt * 0.1);
        this.flappyWingCycle += dt * 14;

        // Smooth pitch rotation
        const targetAngle = Math.max(-0.45, Math.min(0.60, this.flappyVy * 0.055));
        this.birdAngle += (targetAngle - this.birdAngle) * (1.0 - Math.exp(-14 * dt));

        const currentBirdY = this.flappyY * floorY;

        // Ceiling bounce
        if (currentBirdY - birdRadiusY <= 0) {
          this.flappyY = (birdRadiusY + 2) / floorY;
          this.flappyVy = 1.0;
        }

        // Autonomous Laya Model Navigation: smooth and deliberate gap tracking
        if (this.mode === 'laya') {
          // Find oncoming tree log that the bird hasn't fully cleared
          const nextPil = this.flappyPillars.find(p => !p.passed && (p.x * w + logWidth) > (birdX - 10));
          if (nextPil) {
            const gapCenterY = nextPil.gapY * floorY;
            // Aim smoothly for the exact center of the oncoming tree log gap
            if (currentBirdY > gapCenterY + 4 && this.flappyVy > -1.5) {
              this.flapManual();
            }
          } else {
            // Smooth open-air cruising altitude (48% height)
            const cruiseY = floorY * 0.48;
            if (currentBirdY > cruiseY + 8 && this.flappyVy > 0) {
              this.flapManual();
            }
          }
        }

        // Scroll tree logs towards the bird
        const scrollSpeed = dt * 0.30 * this.speed;
        for (let i = this.flappyPillars.length - 1; i >= 0; i--) {
          const pil = this.flappyPillars[i];
          pil.x -= scrollSpeed;

          const logLeft = pil.x * w - 5;
          const logRight = pil.x * w + logWidth + 5;

          // Check if bird is horizontally within this tree log pair
          if (birdX + birdRadiusX >= logLeft && birdX - birdRadiusX <= logRight) {
            const gapHeight = pil.gapSize * floorY;
            const gapCenterY = pil.gapY * floorY;
            const topLogBottomY = gapCenterY - gapHeight / 2;
            const bottomLogTopY = gapCenterY + gapHeight / 2;

            // INSTANT DEATH: Bird hits top log or bottom log
            if ((currentBirdY - birdRadiusY <= topLogBottomY) || (currentBirdY + birdRadiusY >= bottomLogTopY)) {
              this.triggerBirdDeath('CRASHED INTO TREE LOG');
              break;
            }
          }

          // Passing through gap safely
          if (!pil.passed && (pil.x * w + logWidth) < birdX) {
            pil.passed = true;
            this.score += 10;
            if (this.score > this.bestScore) this.bestScore = this.score;
            const scoreVal = this.container.querySelector('#arcade-val-score');
            if (scoreVal) scoreVal.textContent = String(this.score).padStart(4, '0');
            sound.playGoodMoveSound();
            this.addFloatingText('+10 LOG DODGE 🪙', w / 2, '#ffd000');
            this.addParticles(birdX, currentBirdY, 8, '#ffd000');
          }

          if (pil.x < -0.2) {
            this.flappyPillars.splice(i, 1);
          }
        }

        // Ground collision: dies immediately
        if (currentBirdY + birdRadiusY >= floorY) {
          this.triggerBirdDeath('HIT GROUND');
        }

        // Spawn new tree logs periodically while respecting strict minimum spacing
        if (this.flappyPillars.length < 3) {
          this.trySpawnFlappyLog();
        }
      } else {
        // Dead bird falling & tumbling to the ground
        this.flappyVy += dt * 34;
        this.flappyY += (this.flappyVy * dt * 0.09);
        const currentBirdY = this.flappyY * floorY;
        if (currentBirdY >= floorY - 10) {
          this.flappyY = (floorY - 10) / floorY;
          this.flappyVy = 0;
        }

        this.birdDeathTimer += dt;

        // Auto restart in autonomous Laya mode after 2.0s
        if (this.mode === 'laya' && this.birdDeathTimer > 2.0) {
          this.resetSkin('flappy');
        }
      }
    }

    // Update Particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) this.particles.splice(i, 1);
    }

    // Update Floating Text
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.y += t.vy;
      t.alpha -= 0.02;
      if (t.alpha <= 0) this.floatingTexts.splice(i, 1);
    }
  }

  triggerBirdDeath(reason) {
    if (this.isBirdDead) return;
    this.isBirdDead = true;
    this.birdDeathTimer = 0;
    this.screenShake = 16;
    sound.playBadMoveSound();
    this.addFloatingText('CRASHED! 💥', 2, '#e52521');

    const rect = this.canvas.getBoundingClientRect();
    const floorY = rect.height - 36;
    this.addParticles(rect.width * 0.28, this.flappyY * floorY, 28, '#e52521');
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
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      ctx.restore();
    }

    // Draw Floating Texts
    for (const t of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, t.alpha);
      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.fillStyle = '#000';
      ctx.textAlign = 'center';
      ctx.fillText(t.text, t.x + 2, t.y + 2);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }

    // Draw HUD
    this.renderArcadeOverlay(ctx, w, h);

    // Draw Pause Overlay if simulation is paused
    if (this.isPaused) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.70)';
      ctx.fillRect(w / 2 - 140, h / 2 - 28, 280, 56);
      ctx.strokeStyle = '#ffd000';
      ctx.lineWidth = 3;
      ctx.strokeRect(w / 2 - 140, h / 2 - 28, 280, 56);

      ctx.font = 'bold 12px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffd000';
      ctx.textAlign = 'center';
      ctx.fillText('⏸ SIMULATION PAUSED', w / 2, h / 2 - 4);

      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('CLICK RESUME OR PLAY TO CONTINUE', w / 2, h / 2 + 16);
      ctx.restore();
    }

    ctx.restore();
  }

  /**
   * =========================================================================
   * 1. CYBER RUNNER SCENE (Clean 3-Lane Perspective Highway with Clear Hurdles)
   * =========================================================================
   */
  renderRunnerScene(ctx, w, h) {
    const horizonY = h * 0.22;
    const horizonW = w * 0.44;
    const horizonX = (w - horizonW) / 2;

    // 1. Dark Cyber Sky with Horizon Glow
    ctx.fillStyle = '#080c1d';
    ctx.fillRect(0, 0, w, h);

    const glowGrad = ctx.createRadialGradient(w / 2, horizonY, 8, w / 2, horizonY, w * 0.45);
    glowGrad.addColorStop(0, 'rgba(255, 208, 0, 0.28)');
    glowGrad.addColorStop(0.5, 'rgba(0, 240, 255, 0.12)');
    glowGrad.addColorStop(1, 'rgba(8, 12, 29, 0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(0, 0, w, horizonY + 70);

    // 2. Highway Road Surface
    ctx.fillStyle = '#0d132b';
    ctx.beginPath();
    ctx.moveTo(horizonX, horizonY);
    ctx.lineTo(horizonX + horizonW, horizonY);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // 3. Lane Boundary Dividers (4 lines dividing into 3 distinct lanes)
    const laneBottomX = [0, w * 0.333, w * 0.666, w];
    const laneTopX = [
      horizonX,
      horizonX + horizonW * 0.333,
      horizonX + horizonW * 0.666,
      horizonX + horizonW
    ];

    for (let i = 0; i <= 3; i++) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(laneTopX[i], horizonY);
      ctx.lineTo(laneBottomX[i], h);

      if (i === 0 || i === 3) {
        ctx.strokeStyle = '#ffd000';
        ctx.lineWidth = 3;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.85)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([14, 10]);
        ctx.lineDashOffset = -this.gridOffset * 24;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Horizontal Highway Speed Grid Lines
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 8; k++) {
      const t = ((k / 8) + (this.gridOffset * 0.125)) % 1.0;
      const yLine = horizonY + (h - horizonY) * Math.pow(t, 2);
      const xStart = horizonX + (0 - horizonX) * t;
      const xEnd = (horizonX + horizonW) + (w - (horizonX + horizonW)) * t;
      ctx.beginPath();
      ctx.moveTo(xStart, yLine);
      ctx.lineTo(xEnd, yLine);
      ctx.stroke();
    }
    ctx.restore();

    // Lane Number Indicators along horizon
    ctx.save();
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(255, 208, 0, 0.7)';
    ctx.textAlign = 'center';
    for (let l = 1; l <= 3; l++) {
      const lx = horizonX + (l - 0.5) * (horizonW / 3);
      ctx.fillText(`L${l}`, lx, horizonY - 6);
    }
    ctx.restore();

    // 4. Draw Approaching Hurdles with Full Visibility
    // Sort from furthest (highest z) to closest for correct depth layering
    const sortedHurdles = [...this.obstacles].sort((a, b) => b.z - a.z);
    for (const obs of sortedHurdles) {
      this.drawCyberHurdle(ctx, obs, horizonX, horizonW, horizonY, w, h);
    }

    // 5. Draw Runner Craft
    this.drawRunnerCraft(ctx, w, h);
  }

  drawCyberHurdle(ctx, obs, horizonX, horizonW, horizonY, w, h) {
    const t = Math.max(0, Math.min(1.0, 1.0 - obs.z));
    const perspFactor = Math.pow(t, 1.55);

    // Compute screen position for hurdle's lane
    const laneTopCenter = horizonX + (obs.lane - 0.5) * (horizonW / 3);
    const laneBottomCenter = (obs.lane - 0.5) * (w / 3);
    const x = laneTopCenter + (laneBottomCenter - laneTopCenter) * perspFactor;
    const y = horizonY + (h - horizonY) * perspFactor;

    // Scale hurdle based on distance (prominent at horizon, full lane at front)
    const hurdleW = Math.max(34, 34 + (w * 0.24) * perspFactor);
    const hurdleH = Math.max(12, 12 + 26 * perspFactor);

    ctx.save();
    ctx.translate(x, y);

    const pulse = Math.sin(performance.now() * 0.012) > 0;

    // 1. Asphalt Warning Hazard Footprint (glowing projection on road)
    ctx.fillStyle = pulse ? 'rgba(229, 37, 33, 0.28)' : 'rgba(255, 208, 0, 0.22)';
    ctx.fillRect(-hurdleW * 0.55, 0, hurdleW * 1.1, 10 + 16 * perspFactor);

    // 2. Barricade Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(-hurdleW / 2 - 3, 0, hurdleW + 6, 6);

    // 3. Hurdle Barricade Body
    ctx.fillStyle = '#100c24';
    ctx.fillRect(-hurdleW / 2, -hurdleH, hurdleW, hurdleH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(-hurdleW / 2, -hurdleH, hurdleW, hurdleH);

    // 4. Vibrant Hazard Chevrons (Yellow / Red stripes)
    const stripeW = Math.max(7, 14 * perspFactor);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-hurdleW / 2, -hurdleH, hurdleW, hurdleH);
    ctx.clip();

    ctx.fillStyle = '#ffd000';
    for (let sx = -hurdleW * 1.5; sx < hurdleW * 1.5; sx += stripeW * 2) {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + stripeW, -hurdleH);
      ctx.lineTo(sx + stripeW * 2, -hurdleH);
      ctx.lineTo(sx + stripeW, 0);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // 5. Beveled 3D Outline
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-hurdleW / 2 + 1, -hurdleH + 1);
    ctx.lineTo(hurdleW / 2 - 1, -hurdleH + 1);
    ctx.stroke();

    // 6. Dual Flashing Warning Strobes on Top
    const lightSize = Math.max(6, 6 + 6 * perspFactor);
    const lightOffset = hurdleW * 0.32;

    // Left light
    ctx.fillStyle = pulse ? '#ff2020' : '#4a0808';
    ctx.fillRect(-lightOffset - lightSize / 2, -hurdleH - lightSize, lightSize, lightSize);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(-lightOffset - lightSize / 2, -hurdleH - lightSize, lightSize, lightSize);

    // Right light (alternating pulse)
    ctx.fillStyle = !pulse ? '#ffd000' : '#4a3800';
    ctx.fillRect(lightOffset - lightSize / 2, -hurdleH - lightSize, lightSize, lightSize);
    ctx.strokeRect(lightOffset - lightSize / 2, -hurdleH - lightSize, lightSize, lightSize);

    ctx.restore();
  }

  drawRunnerCraft(ctx, w, h) {
    const laneWidth = w / 3;
    const shipX = (this.playerLane - 0.5) * laneWidth;
    const shipY = h * 0.76;

    ctx.save();
    ctx.translate(shipX, shipY);
    ctx.rotate(this.shipTilt);

    // Craft Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.beginPath();
    ctx.ellipse(0, 16, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dual Thruster Fire
    const thrusterLength = 12 + Math.sin(this.runnerEnginePulse) * 5;
    ctx.fillStyle = '#ffd000';
    ctx.fillRect(-12, 10, 6, thrusterLength);
    ctx.fillRect(6, 10, 6, thrusterLength);
    ctx.fillStyle = '#fff';
    ctx.fillRect(-10, 10, 2, thrusterLength * 0.7);
    ctx.fillRect(8, 10, 2, thrusterLength * 0.7);

    // Craft Body (8-Bit Beveled Arrow Craft)
    ctx.fillStyle = '#151d3d';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(0, -22);     // Nose
    ctx.lineTo(24, 12);     // Right wing
    ctx.lineTo(12, 8);      // Right notch
    ctx.lineTo(0, 14);      // Tail center
    ctx.lineTo(-12, 8);     // Left notch
    ctx.lineTo(-24, 12);    // Left wing
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Yellow Highlight Bevels
    ctx.strokeStyle = '#ffd000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(18, 10);
    ctx.moveTo(0, -18);
    ctx.lineTo(-18, 10);
    ctx.stroke();

    // Cyan Pilot Canopy
    ctx.fillStyle = '#00f0ff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, -2, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  /**
   * =========================================================================
   * 2. FLAPPY BIRD SCENE (Tree Logs with Wood Grain & Cut Caps, Instant Death)
   * =========================================================================
   */
  renderFlappyScene(ctx, w, h) {
    const floorY = h - 36;

    // 1. Retro Sky & Clouds
    ctx.fillStyle = '#4ea5e0';
    ctx.fillRect(0, 0, w, h);

    // Parallax Clouds
    const cloudOffset = (this.gridOffset * 100) % (w + 160);
    this.drawPixelCloud(ctx, (w * 0.2 - cloudOffset + w + 160) % (w + 160) - 80, 28, 1.2);
    this.drawPixelCloud(ctx, (w * 0.7 - cloudOffset * 0.6 + w + 160) % (w + 160) - 80, 48, 0.9);

    // 2. Tree Logs (Pillars)
    for (const pil of this.flappyPillars) {
      this.drawTreeLogPair(ctx, pil, w, floorY);
    }

    // 3. Ground Grass & Soil
    ctx.fillStyle = '#00a800';
    ctx.fillRect(0, floorY, w, 8);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, floorY + 8, w, 2);
    ctx.fillStyle = '#8b5a2b';
    ctx.fillRect(0, floorY + 10, w, 26);

    // 4. Flappy Bird Sprite
    this.drawFlappyBird(ctx, w, floorY);

    // 5. High-Impact Game Over Banner if Dead
    if (this.isBirdDead) {
      ctx.save();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#e52521';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.fillRect(w / 2 - 200, h / 2 - 50, 400, 96);
      ctx.strokeRect(w / 2 - 200, h / 2 - 50, 400, 96);

      ctx.font = 'bold 15px "Press Start 2P", monospace';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.fillText('CRASHED INTO TREE LOG!', w / 2, h / 2 - 16);

      ctx.font = '10px "Press Start 2P", monospace';
      ctx.fillStyle = '#ffd000';
      ctx.fillText(`SCORE: ${this.score} PTS // TAP TO RETRY`, w / 2, h / 2 + 18);

      ctx.restore();
    }
  }

  drawTreeLogPair(ctx, pil, w, floorY) {
    const logWidth = 68;
    const logX = pil.x * w;
    const gapHeight = pil.gapSize * floorY;
    const gapCenterY = pil.gapY * floorY;
    const topLogBottomY = gapCenterY - gapHeight / 2;
    const bottomLogTopY = gapCenterY + gapHeight / 2;

    ctx.save();
    // Top Tree Log (hangs from ceiling down to gap opening)
    this.drawSingleTreeLog(ctx, logX, 0, logWidth, topLogBottomY, true);
    // Bottom Tree Log (rises from ground up to gap opening)
    this.drawSingleTreeLog(ctx, logX, bottomLogTopY, logWidth, floorY - bottomLogTopY, false);
    ctx.restore();
  }

  drawSingleTreeLog(ctx, x, y, width, height, isTopLog) {
    if (height <= 0) return;

    ctx.save();

    // 1. Natural Wood Bark Body Base
    ctx.fillStyle = '#5c3418';
    ctx.fillRect(x, y, width, height);

    // 2. Deep Bark Furrows / Grooves
    ctx.fillStyle = '#3a1f0a';
    ctx.fillRect(x + 10, y, 6, height);
    ctx.fillRect(x + 30, y, 5, height);
    ctx.fillRect(x + 48, y, 7, height);

    // 3. Highlighted Wood Grain Ridges
    ctx.fillStyle = '#7a4b27';
    ctx.fillRect(x + 18, y, 4, height);
    ctx.fillRect(x + 38, y, 5, height);

    // 4. Natural Wood Knots
    ctx.fillStyle = '#2c1404';
    const knotY = isTopLog ? y + height * 0.4 : y + height * 0.6;
    ctx.fillRect(x + 22, knotY, 8, 8);
    ctx.fillStyle = '#7a4b27';
    ctx.strokeRect(x + 20, knotY - 2, 12, 12);

    // 5. Leafy Green Moss Accents on Outer Bark
    ctx.fillStyle = '#2d882d';
    ctx.fillRect(x - 2, isTopLog ? y + 20 : y + height - 30, 4, 12);
    ctx.fillRect(x + width - 2, isTopLog ? y + 40 : y + 20, 4, 14);

    // 6. Solid Black Retro Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);

    // 7. Cut Tree Stump Cap with Annular Growth Rings at Gap Opening
    const capH = 18;
    const capY = isTopLog ? y + height - capH : y;
    const capOverhang = 5;

    // Cut Cap Outer Base
    ctx.fillStyle = '#d8a76e';
    ctx.fillRect(x - capOverhang, capY, width + capOverhang * 2, capH);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeRect(x - capOverhang, capY, width + capOverhang * 2, capH);

    // Outer Growth Ring
    ctx.strokeStyle = '#9c6d3d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 2, capY + 3, width - 4, capH - 6);

    // Inner Growth Ring
    ctx.strokeStyle = '#7a4e25';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 12, capY + 5, width - 24, capH - 10);

    // Center Pith Dot
    ctx.fillStyle = '#45270d';
    ctx.fillRect(x + width / 2 - 2, capY + capH / 2 - 2, 4, 4);

    ctx.restore();
  }

  drawFlappyBird(ctx, w, floorY) {
    const birdX = w * 0.28;
    const birdY = this.flappyY * floorY;

    ctx.save();
    ctx.translate(birdX, birdY);

    if (this.isBirdDead) {
      // Fast tumbling rotation when dead
      ctx.rotate(this.birdDeathTimer * 12);
    } else {
      ctx.rotate(this.birdAngle);
    }

    // Yellow Bird Body
    ctx.fillStyle = '#ffd000';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;

    ctx.beginPath();
    ctx.ellipse(0, 0, 16, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly Highlight
    ctx.fillStyle = '#fff080';
    ctx.beginPath();
    ctx.ellipse(-2, 3, 10, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Big White Eye & Pupil
    ctx.fillStyle = '#fff';
    ctx.fillRect(5, -9, 8, 8);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(5, -9, 8, 8);

    if (this.isBirdDead) {
      // "X" eye when dead
      ctx.strokeStyle = '#e52521';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(6, -8); ctx.lineTo(12, -2);
      ctx.moveTo(12, -8); ctx.lineTo(6, -2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(9, -7, 3, 4);
    }

    // Orange Beak
    ctx.fillStyle = '#f87800';
    ctx.fillRect(11, -1, 10, 6);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(11, -1, 10, 6);

    // Animated Flapping Wing
    const wingY = this.isBirdDead ? 0 : Math.sin(this.flappyWingCycle) * 5;
    ctx.fillStyle = '#e8ba00';
    ctx.fillRect(-12, -4 + wingY, 12, 7);
    ctx.strokeStyle = '#000';
    ctx.strokeRect(-12, -4 + wingY, 12, 7);

    ctx.restore();
  }

  drawPixelCloud(ctx, x, y, scale = 1.0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.rect(10, 8, 44, 18);
    ctx.rect(18, 0, 24, 14);
    ctx.rect(34, 4, 16, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  renderArcadeOverlay(ctx, w, h) {
    ctx.save();
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = 'rgba(255, 208, 0, 0.9)';
    ctx.textAlign = 'left';

    const gameTitle = this.gameSkin === 'runner' ? 'GAME: CYBER RUNNER' : 'GAME: FLAPPY BIRD';
    ctx.fillText(gameTitle, 12, 18);

    const subTitle = this.gameSkin === 'runner'
      ? `LANE: ${Math.round(this.playerLane)}/3`
      : `ALTITUDE: ${Math.round(this.flappyY * 100)}%`;
    ctx.fillText(subTitle, 12, 32);

    ctx.textAlign = 'right';
    ctx.fillText(`SCORE: ${String(this.score).padStart(4, '0')}`, w - 12, 18);
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
