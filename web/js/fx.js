/**
 * ==========================================================================
 * BEAT THE BOT — FX & MICRO-ANIMATIONS (fx.js)
 * Minimal vanilla JS helpers: Typewriter, Counter, Glitch, and Simulation Loop
 * Respects prefers-reduced-motion for all visual transitions.
 * ==========================================================================
 */

const prefersReducedMotion = () => {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
};

/**
 * Typewriter effect for state descriptions and HUD readouts.
 * @param {HTMLElement} element - Target element
 * @param {string} text - Text to type
 * @param {number} speed - Milliseconds per character
 * @param {Function} [onComplete] - Callback on finish
 */
export function typewriter(element, text, speed = 22, onComplete = null) {
  if (!element) return;

  // Clear existing timers on this element
  if (element._typewriterTimer) {
    clearTimeout(element._typewriterTimer);
    element._typewriterTimer = null;
  }

  if (prefersReducedMotion()) {
    element.textContent = text;
    if (typeof onComplete === 'function') onComplete();
    return;
  }

  element.textContent = '';
  element.classList.add('is-typing');
  let i = 0;

  function typeChar() {
    if (i < text.length) {
      element.textContent += text.charAt(i);
      i++;
      element._typewriterTimer = setTimeout(typeChar, speed);
    } else {
      element.classList.remove('is-typing');
      element._typewriterTimer = null;
      if (typeof onComplete === 'function') onComplete();
    }
  }

  typeChar();
}

/**
 * Smoothly animates numeric counters (scores, latencies, steps).
 * @param {HTMLElement} element - Target element
 * @param {number} start - Initial value
 * @param {number} end - Final value
 * @param {number} duration - Total animation time in ms
 * @param {string} prefix - Optional prefix (e.g. "+")
 * @param {string} suffix - Optional suffix (e.g. " ms", " pts")
 */
export function animateCounter(element, start, end, duration = 800, prefix = '', suffix = '') {
  if (!element) return;

  if (prefersReducedMotion() || duration <= 0) {
    element.textContent = `${prefix}${Math.round(end)}${suffix}`;
    return;
  }

  const startTime = performance.now();

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Ease-out cubic curve
    const ease = 1 - Math.pow(1 - progress, 3);
    const currentVal = Math.round(start + (end - start) * ease);

    element.textContent = `${prefix}${currentVal}${suffix}`;

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

/**
 * Triggers a cyber glitch animation on text/card elements.
 * @param {HTMLElement} element - Target element
 * @param {number} duration - Glitch duration in ms
 */
export function triggerGlitch(element, duration = 400) {
  if (!element || prefersReducedMotion()) return;

  element.classList.add('is-glitching');
  setTimeout(() => {
    element.classList.remove('is-glitching');
  }, duration);
}

/**
 * Initializes the interactive "How a Decision Looks" simulation on the landing page.
 * Cycles through:
 * 1. State Normalisation (Typewriter)
 * 2. Laya Questions & Probabilities filling
 * 3. Chosen Action & Validation
 * 4. Game Outcome & Score update
 * Loops seamlessly.
 */
export function initDecisionSimulator(config) {
  const {
    stateEl,
    questionEl,
    optionsContainer,
    decisionEl,
    reasonEl,
    responseEl,
    scoreEl,
    playPauseBtn
  } = config;

  if (!stateEl || !optionsContainer) return;

  const scenarios = [
    {
      state: "Step 14: Runner at Lane 2. Obstacle detected in Lane 2 at distance 12m. Lane 1 is unobstructed with gold coin (+10). Lane 3 has mud patch.",
      question: "Which lane offers the safest high-yield passage?",
      qType: "choice",
      options: [
        { label: "LANE 1 (Gold Coin)", prob: 0.84, isWinner: true },
        { label: "LANE 2 (Obstacle)", prob: 0.04, isWinner: false },
        { label: "LANE 3 (Mud Patch)", prob: 0.12, isWinner: false }
      ],
      action: "MOVE_LANE_1",
      reason: "Laya prioritised zero collision risk with +10 coin reward (prob 0.84).",
      response: {
        badge: "GOOD",
        badgeClass: "badge-good",
        message: "Action accepted. Clean dodge + coin collected.",
        scoreDelta: 10,
        scoreBefore: 420
      }
    },
    {
      state: "Step 28: Boss laser targeting Lanes 1 & 2. Lane 3 shield generator active for 3 seconds. Speed bonus expiring.",
      question: "Will moving to Lane 3 protect against incoming fire?",
      qType: "score",
      options: [
        { label: "YES (Safe in Lane 3)", prob: 0.92, isWinner: true },
        { label: "NO (Hazard persists)", prob: 0.08, isWinner: false }
      ],
      action: "DASH_TO_LANE_3",
      reason: "High score probability on Lane 3 shield protection (prob 0.92).",
      response: {
        badge: "GOOD",
        badgeClass: "badge-good",
        message: "Shield engaged. Laser avoided with 0 damage.",
        scoreDelta: 25,
        scoreBefore: 530
      }
    }
  ];

  let currentIdx = 0;
  let isPlaying = true;
  let timerId = null;

  function runStep() {
    if (!isPlaying) return;

    const data = scenarios[currentIdx];

    // Reset elements
    decisionEl.textContent = "THINKING...";
    decisionEl.style.color = "var(--text-muted)";
    reasonEl.textContent = "Synthesizing legal action space...";
    responseEl.innerHTML = `<span class="badge badge-cyan">WAITING MOVE...</span>`;
    
    // Maintain stable skeleton bars to prevent layout height collapse & jumpy auto-scrolling
    optionsContainer.innerHTML = data.options.map((opt, idx) => `
      <div class="prob-bar" id="sim-opt-${idx}" style="opacity: 0.35; transition: opacity 0.3s ease;">
        <div class="prob-bar-header">
          <span class="prob-bar-label">${opt.label}</span>
          <span class="prob-bar-val">--</span>
        </div>
        <div class="prob-bar-track">
          <div class="prob-bar-fill" style="width: 0%"></div>
        </div>
      </div>
    `).join('');

    // Step 1: Typewriter State
    typewriter(stateEl, data.state, 18, () => {
      if (!isPlaying) return;

      // Step 2: Show question
      questionEl.innerHTML = `
        <span class="badge badge-cyan">${data.qType.toUpperCase()}</span>
        <span style="color: var(--text-primary); font-weight: 600;">${data.question}</span>
      `;

      // Restore bars to full visibility with 0%
      data.options.forEach((opt, idx) => {
        const optEl = document.getElementById(`sim-opt-${idx}`);
        if (optEl) {
          optEl.style.opacity = '1';
          const val = optEl.querySelector('.prob-bar-val');
          if (val) val.textContent = '0%';
        }
      });

      // Step 3: Animate probabilities filling
      timerId = setTimeout(() => {
        if (!isPlaying) return;

        data.options.forEach((opt, idx) => {
          const optEl = document.getElementById(`sim-opt-${idx}`);
          if (!optEl) return;
          const fill = optEl.querySelector('.prob-bar-fill');
          const val = optEl.querySelector('.prob-bar-val');

          const pct = Math.round(opt.prob * 100);
          fill.style.width = `${pct}%`;
          val.textContent = `${pct}%`;

          if (opt.isWinner) {
            optEl.classList.add('winner');
          }
        });

        // Step 4: Show chosen action
        timerId = setTimeout(() => {
          if (!isPlaying) return;

          decisionEl.textContent = data.action;
          decisionEl.style.color = "var(--neon-green)";
          triggerGlitch(decisionEl);

          reasonEl.textContent = data.reason;

          // Step 5: Game response
          timerId = setTimeout(() => {
            if (!isPlaying) return;

            responseEl.innerHTML = `
              <span class="badge ${data.response.badgeClass}">${data.response.badge}</span>
              <span style="color: var(--text-primary); font-size: var(--text-sm);">${data.response.message}</span>
              <span style="color: var(--neon-green); font-family: var(--font-mono); font-weight: 700;">+${data.response.scoreDelta} PTS</span>
            `;

            if (scoreEl) {
              animateCounter(
                scoreEl,
                data.response.scoreBefore,
                data.response.scoreBefore + data.response.scoreDelta,
                600,
                '',
                ' PTS'
              );
            }

            // Loop to next scenario after delay
            timerId = setTimeout(() => {
              currentIdx = (currentIdx + 1) % scenarios.length;
              runStep();
            }, 3600);
          }, 700);
        }, 800);
      }, 500);
    });
  }

  if (playPauseBtn) {
    playPauseBtn.addEventListener('click', () => {
      isPlaying = !isPlaying;
      playPauseBtn.textContent = isPlaying ? "PAUSE SIM" : "RESUME SIM";
      if (isPlaying) runStep();
      else if (timerId) clearTimeout(timerId);
    });
  }

  // Start the first loop
  runStep();

  return {
    pause: () => {
      isPlaying = false;
      if (timerId) clearTimeout(timerId);
    },
    resume: () => {
      if (!isPlaying) {
        isPlaying = true;
        runStep();
      }
    }
  };
}

/**
 * Initializes a high-efficiency ambient particle background.
 * Capped to max 30 particles (15 on mobile) to avoid frame drops.
 * Pauses automatically when tab is hidden or prefers-reduced-motion is enabled.
 */
export function initParticleBackground(targetSelector = '.bg-ambient') {
  if (prefersReducedMotion() || typeof window === 'undefined') return;

  const targetContainer = document.querySelector(targetSelector);
  if (!targetContainer) return;

  let canvas = document.getElementById('ambient-particle-canvas');
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = 'ambient-particle-canvas';
    canvas.style.cssText = 'position: fixed; inset: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 0; opacity: 0.6; display: block;';
    targetContainer.appendChild(canvas);
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  let animationFrameId = null;
  let isPaused = false;
  let width = 0;
  let height = 0;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  const maxParticles = width < 768 ? 15 : 30;
  const particles = [];
  const colors = ['rgba(34, 230, 255, ', 'rgba(255, 61, 242, ', 'rgba(57, 255, 136, '];

  for (let i = 0; i < maxParticles; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      radius: Math.random() * 1.8 + 0.8,
      baseAlpha: Math.random() * 0.25 + 0.1,
      color: colors[Math.floor(Math.random() * colors.length)]
    });
  }

  function render() {
    if (isPaused) return;

    ctx.clearRect(0, 0, width, height);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;

      if (p.x < 0) p.x = width;
      else if (p.x > width) p.x = 0;
      if (p.y < 0) p.y = height;
      else if (p.y > height) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `${p.color}${p.baseAlpha})`;
      ctx.fill();
    }

    animationFrameId = requestAnimationFrame(render);
  }

  // Start animation loop
  animationFrameId = requestAnimationFrame(render);

  // Pause when tab is hidden or backgrounded to conserve battery/CPU
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isPaused = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
    } else {
      if (isPaused) {
        isPaused = false;
        animationFrameId = requestAnimationFrame(render);
      }
    }
  });

  return {
    destroy: () => {
      isPaused = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resize);
      if (canvas && canvas.parentElement) {
        canvas.parentElement.removeChild(canvas);
      }
    }
  };
}

/**
 * Spawns an animated gold pixel coin popping up with points (+10).
 */
export function triggerMarioCoinPop(targetEl, text = "+10") {
  if (!targetEl || prefersReducedMotion()) return;

  const rect = targetEl.getBoundingClientRect();
  const coin = document.createElement('div');
  coin.className = 'mario-coin-popup';
  coin.style.position = 'fixed';
  coin.style.left = `${rect.left + rect.width / 2}px`;
  coin.style.top = `${rect.top}px`;
  coin.style.transform = 'translate(-50%, -100%)';
  coin.style.zIndex = '9999';
  coin.style.pointerEvents = 'none';
  coin.style.display = 'flex';
  coin.style.flexDirection = 'column';
  coin.style.alignItems = 'center';
  coin.style.gap = '2px';
  coin.style.animation = 'coinArcJump 0.65s steps(8) forwards';

  coin.innerHTML = `
    <span style="font-size: 1.4rem; filter: drop-shadow(2px 2px 0 #000);">🪙</span>
    <span style="font-family: var(--font-heading); font-size: 11px; color: var(--mario-yellow); text-shadow: 2px 2px 0 #000;">${text}</span>
  `;

  document.body.appendChild(coin);
  setTimeout(() => {
    if (coin.parentElement) coin.parentElement.removeChild(coin);
  }, 700);
}

/**
 * Triggers a classic Super Mario Question block bump on an element.
 */
export function triggerMarioBlockBump(element) {
  if (!element || prefersReducedMotion()) return;
  element.classList.remove('mario-block-bump');
  void element.offsetWidth; // trigger reflow
  element.classList.add('mario-block-bump');
  setTimeout(() => {
    element.classList.remove('mario-block-bump');
  }, 250);
}

/**
 * Super Mario Warp Pipe wipe transition for route changes.
 */
export function triggerWarpPipeTransition(onMidpoint = null) {
  if (prefersReducedMotion()) {
    if (typeof onMidpoint === 'function') onMidpoint();
    return;
  }

  const existingWipe = document.getElementById('mario-warp-pipe-transition');
  if (existingWipe && existingWipe.parentElement) {
    existingWipe.parentElement.removeChild(existingWipe);
  }

  const wipe = document.createElement('div');
  wipe.id = 'mario-warp-pipe-transition';
  wipe.style.position = 'fixed';
  wipe.style.inset = '0';
  wipe.style.background = 'linear-gradient(90deg, #004400 0%, #007700 8%, #00a800 20%, #88e000 35%, #00a800 60%, #004400 95%, #002200 100%)';
  wipe.style.border = '8px solid #000';
  wipe.style.zIndex = '99999';
  wipe.style.pointerEvents = 'none';
  wipe.style.transform = 'translateY(100%)';
  wipe.style.transition = 'transform 0.22s cubic-bezier(0.1, 0.9, 0.2, 1)';
  wipe.style.display = 'flex';
  wipe.style.flexDirection = 'column';
  wipe.style.alignItems = 'center';
  wipe.style.justifyContent = 'center';
  wipe.style.gap = '12px';
  wipe.innerHTML = `
    <div style="font-size: 2.5rem; filter: drop-shadow(4px 4px 0 #000);">🍄</div>
    <div style="text-align: center; font-family: var(--font-heading); font-size: clamp(14px, 3vw, 22px); color: #fff; text-shadow: 3px 3px 0 #000; letter-spacing: 2px;">
      WARP ZONE
    </div>
  `;

  document.body.appendChild(wipe);

  requestAnimationFrame(() => {
    wipe.style.transform = 'translateY(0%)';
  });

  setTimeout(() => {
    if (typeof onMidpoint === 'function') {
      try {
        onMidpoint();
      } catch (err) {
        console.error('[FX] Error in warp pipe midpoint:', err);
      }
    }
    wipe.style.transform = 'translateY(-100%)';
    setTimeout(() => {
      if (wipe.parentElement) wipe.parentElement.removeChild(wipe);
    }, 240);
  }, 220);
}


