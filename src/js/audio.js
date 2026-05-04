/** @type {AudioContext | undefined} */
let sharedAudioContext;

/** Gain applied after the oscillator (otherwise it's too loud!). */
const BUZZ_OUTPUT_GAIN = 0.06;

/**
 * Square-wave tone player (Web Audio).
 *
 * @param {number} frequencyHz - Frequency in Hertz (1/s) (clamped ~20–20k).
 * @param {number} durationMs - Length in milliseconds (clamped, max 30s).
 */
export function playBuzzTone(frequencyHz, durationMs) {
  const AudioContextClass = window.AudioContext ?? window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  sharedAudioContext ??= new AudioContextClass();
  const ctx = sharedAudioContext;
  void ctx.resume();

  let freq = Number(frequencyHz);
  let ms = Number(durationMs);
  if (!Number.isFinite(freq) || !Number.isFinite(ms)) {
    return;
  }
  freq = Math.max(20, Math.min(20000, Math.round(freq)));
  ms = Math.max(0, Math.min(30000, Math.round(ms)));
  if (ms <= 0) {
    return;
  }

  const sec = ms / 1000;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  gain.gain.value = BUZZ_OUTPUT_GAIN;
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, t);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + sec);
}
