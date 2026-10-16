/**
 * ==========================================================================
 * BEAT THE BOT — SYNTHESIZED 8-BIT MARIO SOUND FX (web/js/sound.js)
 * Zero external audio files. Pure Web Audio API synthesized 8-bit tones.
 * Authentic Super Mario Bros sound synthesis:
 *   - Coin Chime (B5 ➔ E6 square wave)
 *   - Jump Sweep (170Hz ➔ 680Hz rise)
 *   - Pipe Slide (Descend sweep)
 *   - 1-UP Fanfare
 *   - Bump / Hit
 * Sound is strictly opt-in or enabled via toggle button.
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
    // Play authentic Mario coin chime on activation
    playMarioCoinSound();
  }
  return isEnabled;
}

/**
 * Super Mario Coin Chime (Two-tone square wave: B5 ➔ E6).
 */
export function playMarioCoinSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    // B5 note (987.77 Hz) for 0.07s
    osc.frequency.setValueAtTime(987.77, now);
    // Instant jump to E6 note (1318.51 Hz)
    osc.frequency.setValueAtTime(1318.51, now + 0.07);

    gain.gain.setValueAtTime(0.09, now);
    gain.gain.setValueAtTime(0.09, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.40);
  } catch (err) {
    console.debug('[Audio] Mario coin sound suppressed:', err);
  }
}

/**
 * Super Mario Jump Sound (Rapid rising frequency sweep).
 */
export function playMarioJumpSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.16);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.20);
  } catch (err) {}
}

/**
 * Super Mario Pipe Warp Sound (Descending hollow stepped tones).
 */
export function playMarioPipeSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.setValueAtTime(300, now + 0.05);
    osc.frequency.setValueAtTime(240, now + 0.10);
    osc.frequency.setValueAtTime(180, now + 0.15);

    gain.gain.setValueAtTime(0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.28);
  } catch (err) {}
}

/**
 * Super Mario Hit / Ouch Sound (Descending crunchy buzz).
 */
export function playMarioHitSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(100, now + 0.22);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.26);
  } catch (err) {}
}

/**
 * Super Mario 1-UP Fanfare (Rapid ascending arpeggio).
 */
export function playMario1UpSound() {
  if (!isEnabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const notes = [659.25, 783.99, 1318.51, 1046.50, 1174.66, 1567.98]; // E5, G5, E6, C6, D6, G6
    notes.forEach((freq, idx) => {
      const noteTime = now + idx * 0.06;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.07, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.07);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.08);
    });
  } catch (err) {}
}

// Mapped alias functions for seamless hookup to live decision loop
export const playGoodMoveSound = playMarioCoinSound;
export const playBadMoveSound = playMarioHitSound;
export const playIllegalMoveSound = playMarioPipeSound;
export const playStepClickSound = playMarioJumpSound;
export const playSuccessChime = playMarioCoinSound;
export const playCollisionSound = playMarioHitSound;

