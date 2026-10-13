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
    optionsContainer.innerHTML = '';

    // Step 1: Typewriter State
    typewriter(stateEl, data.state, 18, () => {
      if (!isPlaying) return;

      // Step 2: Show question
      questionEl.innerHTML = `
        <span class="badge badge-cyan">${data.qType.toUpperCase()}</span>
        <span style="color: var(--text-primary); font-weight: 600;">${data.question}</span>
      `;

      // Render option skeleton bars
      optionsContainer.innerHTML = data.options.map((opt, idx) => `
        <div class="prob-bar" id="sim-opt-${idx}">
          <div class="prob-bar-header">
            <span class="prob-bar-label">${opt.label}</span>
            <span class="prob-bar-val">0%</span>
          </div>
          <div class="prob-bar-track">
            <div class="prob-bar-fill" style="width: 0%"></div>
          </div>
        </div>
      `).join('');

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
