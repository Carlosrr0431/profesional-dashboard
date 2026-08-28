let audioCtx = null;
let loopTimer = null;
let vibeTimer = null;

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) audioCtx = new Ctx();
  return audioCtx;
}

export function unlockOfferAlert() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
}

function tone(ctx, frequency, start, duration) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.22, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

function playBurst() {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  const start = ctx.currentTime;
  tone(ctx, 880, start, 0.11);
  tone(ctx, 1240, start + 0.14, 0.16);
}

function vibrate(pattern) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern);
    }
  } catch {
    // Algunos navegadores de escritorio no soportan vibración.
  }
}

export function startOfferAlert() {
  stopOfferAlert();
  unlockOfferAlert();
  playBurst();
  vibrate([0, 500, 200, 500, 200, 500]);
  loopTimer = setInterval(playBurst, 850);
  vibeTimer = setInterval(() => vibrate([420, 160, 420]), 1500);
}

export function stopOfferAlert() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  if (vibeTimer) {
    clearInterval(vibeTimer);
    vibeTimer = null;
  }
  vibrate(0);
}
