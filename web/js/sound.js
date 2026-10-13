/**
 * ==========================================================================
 * BEAT THE BOT — SYNTHESIZED SOUND FX (web/js/sound.js)
 * Zero external audio files. Pure Web Audio API synthesized tones.
 * Sound is strictly OFF by default and requires user activation.
 * ==========================================================================
 */

let audioCtx = null;
let isEnabled = false;

// Check localStorage for saved sound preference
try {
  isEnabled = localStorage.getItem('beat_the_bot_sound_enabled') === 'true';
} catch (e) {
  isEnabled = false;
}

/**
 * Lazily instantiates AudioContext after user gesture.
 */
function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

export function isSoundEnabled() {
  return isEnabled;
}

export function toggleSound() {
  isEnabled = !isEnabled;
  try {
    localStorage.setItem('beat_the_bot_sound_enabled', String(isEnabled));
  } catch (e) {}

  if (isEnabled) {
    getAudioContext();
    // Play subtle activation blip
    playStepClickSound();
  }
  return isEnabled;
}

/**
 * Plays a bright rising 2-tone chime for positive moves (+pts / good reward).
 */
export function playGoodMoveSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    osc.frequency.setValueAtTime(659.25, now + 0.06); // E5
    osc.frequency.setValueAtTime(783.99, now + 0.12); // G5

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.30);
  } catch (err) {
    console.debug('[Audio] Good move sound suppressed:', err);
  }
}

/**
 * Plays a descending low tone for collisions, penalties, or misses.
 */
export function playBadMoveSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now); // A3
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.22); // A2

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  } catch (err) {
    console.debug('[Audio] Bad move sound suppressed:', err);
  }
}

/**
 * Plays a double staccato warning beep for illegal moves / validator retries.
 */
export function playIllegalMoveSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    
    // First pulse
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'square';
    osc1.frequency.setValueAtTime(440, now);
    gain1.gain.setValueAtTime(0.05, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.06);

    // Second pulse
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(440, now + 0.08);
    gain2.gain.setValueAtTime(0.05, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.08);
    osc2.stop(now + 0.15);
  } catch (err) {
    console.debug('[Audio] Illegal move sound suppressed:', err);
  }
}

/**
 * Plays a tiny high-frequency micro-click for UI stepping / scrubbing.
 */
export function playStepClickSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.03);
  } catch (err) {
    console.debug('[Audio] Step sound suppressed:', err);
  }
}
